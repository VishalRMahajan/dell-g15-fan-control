#!/usr/bin/env bash
set -Eeuo pipefail

readonly UUID="dell-g15-fan-control@vishalrmahajan.in"
readonly EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
readonly SUDOERS_FILE="/etc/sudoers.d/dell-g15-fan-control"
readonly CLI="/usr/local/bin/dell-fanctl"
readonly LIBEXEC_DIR="/usr/local/libexec/dell-g15-fan-control"

error() {
    printf 'Error: %s\n' "$*" >&2
    exit 1
}

info() {
    printf '\n==> %s\n' "$*"
}

[[ "$EUID" -ne 0 ]] || error "Run this script as your normal user, without sudo."

command -v sudo >/dev/null 2>&1 ||
    error "sudo is required."

[[ -f "$CLI" ]] ||
    error "Installed CLI not found. Nothing to uninstall."

sudo test -f "$LIBEXEC_DIR/fanctl-write" ||
    error "Installed fan helper not found. Aborting."

sudo test -f "$SUDOERS_FILE" ||
    error "Installed sudoers rule not found. Aborting."

sudo test "$(sudo stat -c '%U:%G:%a' "$SUDOERS_FILE")" = "root:root:440" ||
    error "Sudoers ownership or permissions are unexpected. Aborting."

info "Restoring automatic fan control"

if sudo test -x "$LIBEXEC_DIR/fanctl-write"; then
    sudo "$LIBEXEC_DIR/fanctl-write" auto ||
        error "Could not restore automatic fan control. Aborting uninstall."
fi

info "Disabling GNOME extension"

if command -v gnome-extensions >/dev/null 2>&1; then
    gnome-extensions disable "$UUID" 2>/dev/null || true
fi

info "Removing GNOME extension"

if [[ -d "$EXTENSION_DIR" ]]; then
    rm -rf -- "$EXTENSION_DIR"
fi

info "Removing restricted sudo configuration"

if sudo test -f "$SUDOERS_FILE"; then
    sudo rm -- "$SUDOERS_FILE"
fi

info "Removing installed CLI"

if sudo test -f "$CLI"; then
    sudo rm -- "$CLI"
fi

info "Removing privileged helper"

if sudo test -d "$LIBEXEC_DIR"; then
    sudo rm -f -- "$LIBEXEC_DIR/fanctl-write"
    sudo rmdir -- "$LIBEXEC_DIR" 2>/dev/null || true
fi

sudo visudo -c

printf '\nDell G15 Fan Control has been uninstalled.\n'
printf 'Project source files have been preserved.\n'
printf 'Other system configuration has not been intentionally changed.\n'
