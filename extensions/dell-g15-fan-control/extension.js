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

        // Top bar indicator
        this._indicator = new PanelMenu.Button(
            0.0,
            'Dell G15 Fan Control'
        );

        const icon = new St.Icon({
            icon_name: 'weather-windy-symbolic',
            style_class: 'system-status-icon',
        });

        this._indicator.add_child(icon);

        // Heading
        this._indicator.menu.addMenuItem(
            new PopupMenu.PopupMenuItem(
                'Dell G15 Fan Control',
                { reactive: false }
            )
        );

        this._indicator.menu.addMenuItem(
            new PopupMenu.PopupSeparatorMenuItem()
        );

        // Fan readings
        this._fan1Item = new PopupMenu.PopupMenuItem(
            'Fan 1: Reading...',
            { reactive: false }
        );

        this._fan2Item = new PopupMenu.PopupMenuItem(
            'Fan 2: Reading...',
            { reactive: false }
        );

        this._modeItem = new PopupMenu.PopupMenuItem(
            'Mode: Reading...',
            { reactive: false }
        );

        this._indicator.menu.addMenuItem(this._fan1Item);
        this._indicator.menu.addMenuItem(this._fan2Item);
        this._indicator.menu.addMenuItem(
            new PopupMenu.PopupSeparatorMenuItem()
        );
        this._indicator.menu.addMenuItem(this._modeItem);

        this._indicator.menu.addMenuItem(
            new PopupMenu.PopupSeparatorMenuItem()
        );

        // Fan controls
        this._boostItem = new PopupMenu.PopupMenuItem(
            'Maximum Boost'
        );

        this._autoItem = new PopupMenu.PopupMenuItem(
            'Automatic Mode'
        );

        this._boostItem.connect('activate', () => {
            this._runAction('boost');
        });

        this._autoItem.connect('activate', () => {
            this._runAction('auto');
        });

        this._indicator.menu.addMenuItem(this._boostItem);
        this._indicator.menu.addMenuItem(this._autoItem);

        this._indicator.menu.addMenuItem(
            new PopupMenu.PopupSeparatorMenuItem()
        );

        // Operation status
        this._statusItem = new PopupMenu.PopupMenuItem(
            'Ready',
            { reactive: false }
        );

        this._indicator.menu.addMenuItem(this._statusItem);

        // Manual refresh
        const refreshItem = new PopupMenu.PopupMenuItem(
            'Refresh now'
        );

        refreshItem.connect('activate', () => {
            this._refresh();
        });

        this._indicator.menu.addMenuItem(refreshItem);

        Main.panel.addToStatusArea(
            this.uuid,
            this._indicator
        );

        // Initial reading
        this._refresh();

        // Automatic monitoring
        this._timer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            REFRESH_INTERVAL,
            () => {
                if (!this._enabled)
                    return GLib.SOURCE_REMOVE;

                this._refresh();

                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _refresh() {
        if (!this._enabled || this._statusBusy)
            return;

        this._statusBusy = true;

        try {
            const process = Gio.Subprocess.new(
                [FANCTL, 'status'],
                Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_PIPE
            );

            process.communicate_utf8_async(
                null,
                null,
                (proc, result) => {
                    this._statusBusy = false;

                    if (!this._enabled)
                        return;

                    try {
                        const [communicated, stdout, stderr] =
                            proc.communicate_utf8_finish(result);

                        if (!communicated || !proc.get_successful()) {
                            throw new Error(
                                stderr || 'Unable to read fan status'
                            );
                        }

                        this._updateDisplay(stdout);

                    } catch (error) {
                        this._showError(error.message);
                    }
                }
            );

        } catch (error) {
            this._statusBusy = false;
            this._showError(error.message);
        }
    }

    _updateDisplay(output) {
        const fan1 = output.match(
            /Fan 1:\s+(\d+|unavailable)\s+RPM/
        );

        const fan2 = output.match(
            /Fan 2:\s+(\d+|unavailable)\s+RPM/
        );

        const mode = output.match(
            /Mode:\s+(.+)/
        );

        if (!fan1 || !fan2 || !mode) {
            this._showError('Unable to parse fan status');
            return;
        }

        this._fan1Item.label.text =
            `Fan 1: ${fan1[1]} RPM`;

        this._fan2Item.label.text =
            `Fan 2: ${fan2[1]} RPM`;

        this._modeItem.label.text =
            `Mode: ${mode[1].trim()}`;
    }

    _runAction(mode) {
        if (!this._enabled || this._actionBusy)
            return;

        if (mode !== 'boost' && mode !== 'auto')
            return;

        this._actionBusy = true;

        this._boostItem.setSensitive(false);
        this._autoItem.setSensitive(false);

        this._statusItem.label.text =
            mode === 'boost'
                ? 'Requesting maximum boost...'
                : 'Restoring automatic control...';

        try {
            const process = Gio.Subprocess.new(
                [SUDO, '-n', WRITER, mode],
                Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_PIPE
            );

            process.communicate_utf8_async(
                null,
                null,
                (proc, result) => {
                    this._actionBusy = false;

                    if (!this._enabled)
                        return;

                    this._boostItem.setSensitive(true);
                    this._autoItem.setSensitive(true);

                    try {
                        const [communicated, stdout, stderr] =
                            proc.communicate_utf8_finish(result);

                        if (!communicated || !proc.get_successful()) {
                            throw new Error(
                                stderr?.trim() ||
                                'Operation failed or authorization cancelled'
                            );
                        }

                        this._statusItem.label.text =
                            mode === 'boost'
                                ? 'Maximum boost enabled'
                                : 'Automatic control restored';

                        // Refresh after successful hardware change.
                        this._refresh();

                    } catch (error) {
                        this._statusItem.label.text =
                            `Error: ${error.message}`;
                    }
                }
            );

        } catch (error) {
            this._actionBusy = false;

            this._boostItem.setSensitive(true);
            this._autoItem.setSensitive(true);

            this._statusItem.label.text =
                `Error: ${error.message}`;
        }
    }

    _showError(message) {
        if (!this._enabled)
            return;

        this._fan1Item.label.text = 'Fan 1: Unavailable';
        this._fan2Item.label.text = 'Fan 2: Unavailable';
        this._modeItem.label.text = `Status: ${message}`;
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
