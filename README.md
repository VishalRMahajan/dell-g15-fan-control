# Dell G15 Fan Control

A Linux-based fan monitoring and control utility for Dell G15 laptops, providing command-line and GNOME desktop integration.

## 1. Background

Dell G15 laptops provide a rapid cooling feature through the dedicated G-mode key (F9) in supported Windows configurations. This feature allows users to request increased fan operation when additional cooling is required.

On Linux, an equivalent convenient desktop control is not readily available in the tested configuration. Although the Linux kernel exposes fan-control interfaces through the `alienware_wmi` hardware monitoring driver, users must interact with sysfs attributes and privileged operations to control them.

This creates a usability gap between the cooling controls available in the Windows environment and the controls accessible through a standard Linux desktop.

**Dell G15 Fan Control addresses this gap** by providing a simple interface to monitor fan speeds, request maximum fan boost, and restore automatic firmware-controlled operation.

The project uses the existing Linux kernel hardware interface rather than implementing an independent fan controller.

## 2. Objectives

The project aims to:

- Provide accessible fan control on supported Dell G15 laptops running Linux.
- Monitor the RPM readings of both system fans.
- Provide a maximum fan boost operation.
- Restore automatic fan management by the laptop firmware.
- Integrate fan controls into the GNOME desktop environment.
- Avoid repeated password prompts through restricted privileged operations.

## 3. Features

| Feature                | Description                                                      |
| ---------------------- | ---------------------------------------------------------------- |
| Fan monitoring         | Displays RPM readings for both fans                              |
| Maximum boost          | Requests maximum fan boost                                       |
| Automatic mode         | Restores firmware-controlled fan operation                       |
| CLI                    | Provides fan monitoring and control through the terminal         |
| GNOME extension        | Provides fan status and controls through the desktop panel       |
| Hardware discovery     | Dynamically discovers the relevant hwmon interface               |
| Restricted permissions | Uses a dedicated privileged helper with limited sudo permissions |

## 4. Hardware and Software Compatibility

### Tested configuration

| Component                  | Configuration      |
| -------------------------- | ------------------ |
| Laptop                     | Dell G15 5520      |
| Operating system           | Ubuntu 26.04.1 LTS |
| Desktop environment        | GNOME 50           |
| Display server             | Wayland            |
| Hardware monitoring driver | `alienware_wmi`    |

Compatibility with other Dell G15 models and Linux distributions has not yet been verified.

### Hardware interface

The implementation uses the `alienware_wmi` hardware monitoring driver exposed through the Linux hwmon subsystem.

The relevant attributes are:

| Attribute    | Purpose             |
| ------------ | ------------------- |
| `fan1_input` | Fan 1 speed in RPM  |
| `fan2_input` | Fan 2 speed in RPM  |
| `fan1_boost` | Fan 1 boost control |
| `fan2_boost` | Fan 2 boost control |

The implementation discovers the hwmon device dynamically instead of assuming a fixed device number.

## 5. Installation

Clone the repository:

```bash
git clone https://github.com/vishalrmahajan/dell-g15-fan-control.git
cd dell-g15-fan-control
```

Make the installation script executable and run it:

```bash
chmod +x install.sh
./install.sh
```

The installation process:

1. Checks for the required hardware interface.
2. Installs the command-line utility.
3. Installs the privileged fan-control helper.
4. Configures restricted sudo permissions.
5. Installs the GNOME Shell extension.
6. Attempts to enable the extension.

If GNOME Shell does not immediately discover the extension, log out and log back in.

## 6. Command-Line Interface

The installed command is `dell-fanctl`.

### Check fan status

```bash
dell-fanctl status
```

Displays the fan RPM readings and current operating mode.

Example:

```text
Dell Fan Control
-------------------------
Driver:       alienware_wmi
Interface:    hwmon4
Fan 1:        3955 RPM
Fan 2:        4246 RPM
Fan 1 boost:  255
Fan 2 boost:  255
Mode:         Maximum boost
```

The RPM readings above are illustrative and may vary during operation.

### Enable maximum fan boost

```bash
dell-fanctl boost
```

Requests maximum boost for both fans.

### Restore automatic fan control

```bash
dell-fanctl auto
```

Restores automatic fan operation managed by the laptop firmware.

### Display help

```bash
dell-fanctl help
```

## 7. GNOME Shell Integration

The project includes a GNOME Shell extension that provides fan monitoring and control through the desktop panel.

The extension displays:

- Fan 1 speed.
- Fan 2 speed.
- Current operating mode.

It provides two control options:

| Control   | Behaviour                        |
| --------- | -------------------------------- |
| Auto      | Restores automatic fan operation |
| Max Boost | Requests maximum fan boost       |

Fan readings are refreshed periodically.

## 8. Technical Implementation

### Fan control mechanism

The utility interacts with the boost attributes exposed by the `alienware_wmi` driver.

| Boost value | Behaviour                  |
| ----------- | -------------------------- |
| `0`         | Automatic firmware control |
| `255`       | Maximum fan boost request  |

The project does not directly control fan voltage, PWM curves, or thermal policies. It uses the controls exposed by the kernel driver.

### Privileged operations

Writing to the hardware monitoring attributes requires elevated permissions.

The project separates privileged hardware operations from the regular command-line interface using a dedicated helper.

A restricted sudoers configuration permits the helper to execute only the supported `boost` and `auto` operations. This avoids requiring a password for every fan-control operation without granting unrestricted passwordless root access.

### Project structure

```text
dell-g15-fan-control/
├── docs/
│   ├── development-environment.txt
│   └── screenshots/
├── extensions/
│   └── dell-g15-fan-control/
│       ├── extension.js
│       └── metadata.json
├── scripts/
│   ├── fanctl
│   └── fanctl-write
├── tests/
│   └── test-fanctl.sh
├── install.sh
├── uninstall.sh
├── README.md
└── .gitignore
```

## 9. Testing

Run the backend test suite:

```bash
bash tests/test-fanctl.sh
```

Validate shell script syntax:

```bash
bash -n install.sh uninstall.sh scripts/fanctl scripts/fanctl-write
```

Run ShellCheck:

```bash
shellcheck install.sh uninstall.sh scripts/fanctl scripts/fanctl-write
```

The backend test suite includes checks for fan status, operating modes, missing hardware interfaces, invalid values, and dynamic hwmon discovery.

## 10. Uninstallation

Run the uninstallation script from the repository directory:

```bash
./uninstall.sh
```

The uninstaller:

1. Restores automatic fan operation.
2. Disables and removes the GNOME Shell extension.
3. Removes the installed command-line utility.
4. Removes the privileged helper.
5. Removes the project's sudoers configuration.

The source repository is preserved.

## 11. Limitations

- Hardware compatibility has currently been verified on the Dell G15 5520.
- Maximum boost requests the highest boost value exposed by the driver. Actual fan speed is determined by the firmware and hardware.
- RPM readings can fluctuate during operation.
- The project does not implement custom fan curves.
- The project does not replace the laptop's firmware thermal management or safety mechanisms.
- Automatic mode is recommended for normal operation.

## 12. Future Development

Potential areas for further development include:

- Compatibility testing across additional Dell G15 models.
- Additional GNOME desktop integration.
- Improved fan monitoring and status reporting.
- Automated hardware compatibility testing.
