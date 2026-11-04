import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const FANCTL = '/usr/local/bin/dell-fanctl';
const SUDO = '/usr/bin/sudo';
const WRITER = '/usr/local/libexec/dell-g15-fan-control/fanctl-write';

const REFRESH_INTERVAL = 3;

export default class DellG15FanControl extends Extension {
  enable() {
    this._enabled = true;
    this._statusBusy = false;
    this._actionBusy = false;
    this._timer = null;
    this._currentMode = null;

    this._indicator = new PanelMenu.Button(0.0, 'Dell G15 Fan Control');

    const icon = new St.Icon({
      icon_name: 'weather-windy-symbolic',
      style_class: 'system-status-icon',
    });

    this._indicator.add_child(icon);

    // Compact fan readings
    this._fan1Item = new PopupMenu.PopupMenuItem('Fan 1     -- RPM', {
      reactive: false,
    });

    this._fan2Item = new PopupMenu.PopupMenuItem('Fan 2     -- RPM', {
      reactive: false,
    });

    this._modeItem = new PopupMenu.PopupMenuItem('Mode      Loading...', {
      reactive: false,
    });

    this._indicator.menu.addMenuItem(this._fan1Item);
    this._indicator.menu.addMenuItem(this._fan2Item);
    this._indicator.menu.addMenuItem(this._modeItem);

    this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Fan controls
    this._autoItem = new PopupMenu.PopupMenuItem('Auto');
    this._boostItem = new PopupMenu.PopupMenuItem('Max Boost');

    this._autoItem.connect('activate', () => {
      this._runAction('auto');
    });

    this._boostItem.connect('activate', () => {
      this._runAction('boost');
    });

    this._indicator.menu.addMenuItem(this._autoItem);
    this._indicator.menu.addMenuItem(this._boostItem);

    Main.panel.addToStatusArea(this.uuid, this._indicator);

    this._refresh();

    this._timer = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      REFRESH_INTERVAL,
      () => {
        if (!this._enabled) return GLib.SOURCE_REMOVE;

        this._refresh();
        return GLib.SOURCE_CONTINUE;
      },
    );
  }

  _refresh() {
    if (!this._enabled || this._statusBusy) return;

    this._statusBusy = true;

    try {
      const process = Gio.Subprocess.new(
        [FANCTL, 'status'],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
      );

      process.communicate_utf8_async(null, null, (proc, result) => {
        this._statusBusy = false;

        if (!this._enabled) return;

        try {
          const [communicated, stdout, stderr] =
            proc.communicate_utf8_finish(result);

          if (!communicated || !proc.get_successful()) {
            throw new Error(stderr?.trim() || 'Unable to read status');
          }

          this._updateDisplay(stdout);
        } catch (error) {
          this._showError(error.message);
        }
      });
    } catch (error) {
      this._statusBusy = false;
      this._showError(error.message);
    }
  }

  _updateDisplay(output) {
    const fan1 = output.match(/Fan 1:\s+(\d+|unavailable)\s+RPM/);

    const fan2 = output.match(/Fan 2:\s+(\d+|unavailable)\s+RPM/);

    const mode = output.match(/Mode:\s+(.+)/);

    if (!fan1 || !fan2 || !mode) {
      this._showError('Unable to parse status');
      return;
    }

    this._fan1Item.label.text = `Fan 1     ${fan1[1]} RPM`;
    this._fan2Item.label.text = `Fan 2     ${fan2[1]} RPM`;

    const modeText = mode[1].trim();
    this._modeItem.label.text = `Mode      ${modeText}`;

    if (modeText.toLowerCase().includes('maximum')) {
      this._currentMode = 'boost';
    } else if (modeText.toLowerCase().includes('automatic')) {
      this._currentMode = 'auto';
    } else {
      this._currentMode = null;
    }

    this._updateButtons();
  }

  _updateButtons() {
    if (this._actionBusy) {
      this._autoItem.setSensitive(false);
      this._boostItem.setSensitive(false);
      return;
    }

    this._autoItem.setSensitive(this._currentMode !== 'auto');
    this._boostItem.setSensitive(this._currentMode !== 'boost');
  }

  _runAction(mode) {
    if (!this._enabled || this._actionBusy) return;

    if (mode !== 'boost' && mode !== 'auto') return;

    if (this._currentMode === mode) return;

    this._actionBusy = true;
    this._updateButtons();

    this._modeItem.label.text =
      mode === 'boost'
        ? 'Mode      Enabling boost...'
        : 'Mode      Restoring auto...';

    try {
      const process = Gio.Subprocess.new(
        [SUDO, '-n', WRITER, mode],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
      );

      process.communicate_utf8_async(null, null, (proc, result) => {
        this._actionBusy = false;

        if (!this._enabled) return;

        try {
          const [communicated, stdout, stderr] =
            proc.communicate_utf8_finish(result);

          if (!communicated || !proc.get_successful()) {
            throw new Error(stderr?.trim() || 'Operation failed');
          }

          this._refresh();
        } catch (error) {
          this._modeItem.label.text = `Error: ${error.message}`;

          this._updateButtons();
        }
      });
    } catch (error) {
      this._actionBusy = false;
      this._modeItem.label.text = `Error: ${error.message}`;
      this._updateButtons();
    }
  }

  _showError(message) {
    if (!this._enabled) return;

    this._fan1Item.label.text = 'Fan 1     Unavailable';
    this._fan2Item.label.text = 'Fan 2     Unavailable';
    this._modeItem.label.text = `Error: ${message}`;

    this._currentMode = null;
    this._updateButtons();
  }

  disable() {
    this._enabled = false;

    if (this._timer !== null) {
      GLib.Source.remove(this._timer);
      this._timer = null;
    }

    this._indicator?.destroy();
    this._indicator = null;
  }
}
