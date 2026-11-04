#!/usr/bin/env bash
set -Eeuo pipefail

readonly DRIVER="alienware_wmi"
readonly UUID="dell-g15-fan-control@vishalrmahajan.in"
readonly BIN_DIR="/usr/local/bin"
readonly LIBEXEC_DIR="/usr/local/libexec/dell-g15-fan-control"
readonly EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
readonly SUDOERS_FILE="/etc/sudoers.d/dell-g15-fan-control"

error() {
    printf 'Error: %s\n' "$*" >&2
    exit 1
}

info() {
    printf '\n==> %s\n' "$*"
}

[[ "$EUID" -ne 0 ]] || error "Run without sudo."
[[ -f scripts/fanctl && -f scripts/fanctl-write ]] ||
    error "Run from the project root."

for cmd in sudo install visudo gnome-extensions; do
    command -v "$cmd" >/dev/null 2>&1 ||
        error "Missing dependency: $cmd"
done

info "Checking Dell G15 hardware"

found=false

for directory in /sys/class/hwmon/hwmon*; do
    [[ -r "$directory/name" ]] || continue

    if [[ "$(<"$directory/name")" == "$DRIVER" ]]; then
        [[ -r "$directory/fan1_boost" &&
           -r "$directory/fan2_boost" ]] ||
            error "Fan controls unavailable."

        found=true
        break
    fi
done

[[ "$found" == true ]] ||
    error "Dell G15 fan controller not detected."

[[ -f extensions/dell-g15-fan-control/metadata.json ]] ||
    error "Extension metadata missing."

[[ -f extensions/dell-g15-fan-control/extension.js ]] ||
    error "Extension source missing."

info "Checking existing installation"

# Never replace an existing sudoers file without verifying ownership.
if sudo test -e "$SUDOERS_FILE"; then
    sudo test -f "$SUDOERS_FILE" ||
        error "Sudoers path is not a regular file."

    sudo test "$(sudo stat -c '%U:%G:%a' "$SUDOERS_FILE")" = "root:root:440" ||
        error "Existing sudoers file has unexpected ownership or permissions."

    sudo grep -Fxq \
        "$USER ALL=(root) NOPASSWD: $LIBEXEC_DIR/fanctl-write boost, $LIBEXEC_DIR/fanctl-write auto" \
        "$SUDOERS_FILE" ||
        error "Existing sudoers rule does not match this installer."
fi

if sudo test -e "$BIN_DIR/dell-fanctl" &&
   ! sudo grep -Fq "fanctl - Dell G-Series Linux fan controller" "$BIN_DIR/dell-fanctl"; then
    error "Existing CLI does not appear to belong to this project."
fi

if sudo test -e "$LIBEXEC_DIR/fanctl-write" &&
   ! sudo grep -Fq "fanctl-write" "$LIBEXEC_DIR/fanctl-write"; then
    error "Existing helper does not appear to belong to this project."
fi

info "Preparing installation"

tmp_dir="$(mktemp -d)"
backup_dir="$tmp_dir/backup"
mkdir -p "$backup_dir"

installed_cli=false
installed_helper=false
installed_extension=false
installed_sudoers=false

cleanup() {
    rm -rf "$tmp_dir"
}

rollback() {
    local status=$?
    trap - ERR

    printf '\nInstallation failed. Attempting rollback...\n' >&2

    if [[ "$installed_extension" == true ]]; then
        rm -rf "$EXTENSION_DIR"
        [[ ! -d "$backup_dir/extension" ]] ||
            cp -a "$backup_dir/extension" "$EXTENSION_DIR"
    fi

    if [[ "$installed_sudoers" == true ]]; then
        sudo rm -f "$SUDOERS_FILE"
        [[ ! -f "$backup_dir/sudoers" ]] ||
            sudo install -o root -g root -m 440 \
                "$backup_dir/sudoers" "$SUDOERS_FILE"
    fi

    if [[ "$installed_helper" == true ]]; then
        sudo rm -f "$LIBEXEC_DIR/fanctl-write"
        [[ ! -f "$backup_dir/helper" ]] ||
            sudo install -o root -g root -m 755 \
                "$backup_dir/helper" "$LIBEXEC_DIR/fanctl-write"
    fi

    if [[ "$installed_cli" == true ]]; then
        sudo rm -f "$BIN_DIR/dell-fanctl"
        [[ ! -f "$backup_dir/cli" ]] ||
            sudo install -o root -g root -m 755 \
                "$backup_dir/cli" "$BIN_DIR/dell-fanctl"
    fi

    cleanup
    exit "$status"
}

trap rollback ERR
trap cleanup EXIT

# Back up existing files before changing them.
sudo test ! -f "$BIN_DIR/dell-fanctl" ||
    sudo cp "$BIN_DIR/dell-fanctl" "$backup_dir/cli"

sudo test ! -f "$LIBEXEC_DIR/fanctl-write" ||
    sudo cp "$LIBEXEC_DIR/fanctl-write" "$backup_dir/helper"

sudo test ! -f "$SUDOERS_FILE" ||
    sudo cp "$SUDOERS_FILE" "$backup_dir/sudoers"

if [[ -d "$EXTENSION_DIR" ]]; then
    cp -a "$EXTENSION_DIR" "$backup_dir/extension"
fi

info "Installing CLI and helper"

sudo install -d -o root -g root -m 755 "$LIBEXEC_DIR"

installed_cli=true
sudo install -o root -g root -m 755 \
    scripts/fanctl "$BIN_DIR/dell-fanctl"

installed_helper=true
sudo install -o root -g root -m 755 \
    scripts/fanctl-write "$LIBEXEC_DIR/fanctl-write"

info "Configuring sudo permissions"

tmp_sudoers="$tmp_dir/sudoers"

printf '%s ALL=(root) NOPASSWD: %s boost, %s auto\n' \
    "$USER" "$LIBEXEC_DIR/fanctl-write" \
    "$LIBEXEC_DIR/fanctl-write" > "$tmp_sudoers"

chmod 440 "$tmp_sudoers"
sudo visudo -cf "$tmp_sudoers"

if ! sudo test -f "$SUDOERS_FILE"; then
    installed_sudoers=true
fi

sudo install -o root -g root -m 440 \
    "$tmp_sudoers" "$SUDOERS_FILE"

info "Installing GNOME extension"

gnome-extensions disable "$UUID" 2>/dev/null || true

if [[ -d "$EXTENSION_DIR" ]]; then
    installed_extension=true
    rm -rf "$EXTENSION_DIR"
else
    installed_extension=true
fi

mkdir -p "$(dirname "$EXTENSION_DIR")"
cp -a extensions/dell-g15-fan-control "$EXTENSION_DIR"

info "Validating installation"

sudo visudo -c
dell-fanctl status

info "Installation completed successfully"

info "Enabling GNOME extension"

if gnome-extensions enable "$UUID"; then
    sleep 2

    if gnome-extensions info "$UUID" | grep -q 'State: ACTIVE'; then
        echo "GNOME extension is active!"
    else
        echo "Extension enabled. Log out and back in if it does not appear."
    fi
else
    echo "Could not enable extension. Check GNOME Extensions."
fi
