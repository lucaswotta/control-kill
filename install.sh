#!/usr/bin/env bash
# Control Kill — installer
# https://github.com/lucaswotta/control-kill
#
#   ./install.sh                  install or update from this checkout
#   ./install.sh --uninstall      remove it
#
#   curl -fsSL https://raw.githubusercontent.com/lucaswotta/control-kill/main/install.sh | bash
#                                 install or update from the latest release
set -euo pipefail

UUID="control-kill@lucaswotta.github.io"
DOMAIN="control-kill"
REPO_URL="https://github.com/lucaswotta/control-kill"
ZIP_URL="$REPO_URL/releases/latest/download/$UUID.shell-extension.zip"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

say() { printf '%s\n' "$*"; }
die() { printf 'control-kill: %s\n' "$*" >&2; exit 1; }

uninstall() {
    gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
    rm -rf "$DEST"
    say "Removed $DEST"
    say "Log out and back in to unload it from the running shell."
}

# Left enabled in the settings, the shell loads it on the next login: no
# separate "gnome-extensions enable" step once the session restarts.
mark_enabled() {
    command -v gsettings >/dev/null || return 0
    local cur
    cur="$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null)" || return 0
    [[ $cur == *"'$UUID'"* ]] && return 0
    if [[ $cur == "@as []" || $cur == "[]" ]]; then
        cur="['$UUID']"
    else
        cur="${cur%]}, '$UUID']"
    fi
    gsettings set org.gnome.shell enabled-extensions "$cur"
}

stage_from_checkout() {
    local src="$1" stage="$2"
    cp "$src"/{extension.js,prefs.js,metadata.json,LICENSE} "$stage/"
    mkdir -p "$stage/schemas" "$stage/sounds"
    cp "$src"/schemas/*.gschema.xml "$stage/schemas/"
    cp "$src"/sounds/*.oga "$src"/sounds/*.wav "$stage/sounds/"

    if ! command -v msgfmt >/dev/null; then
        say "Note: msgfmt (package gettext) not found, installing without translations."
        return
    fi
    local lang
    while read -r lang; do
        [[ -n $lang ]] || continue
        mkdir -p "$stage/locale/$lang/LC_MESSAGES"
        msgfmt -o "$stage/locale/$lang/LC_MESSAGES/$DOMAIN.mo" "$src/po/$lang.po"
    done < "$src/po/LINGUAS"
}

stage_from_release() {
    local tmp="$1" stage="$2"
    command -v curl >/dev/null || die "curl is required"
    say "Downloading $ZIP_URL"
    curl -fsSL "$ZIP_URL" -o "$tmp/ext.zip" || die "download failed"
    if command -v unzip >/dev/null; then
        unzip -q "$tmp/ext.zip" -d "$stage"
    elif command -v python3 >/dev/null; then
        python3 -m zipfile -e "$tmp/ext.zip" "$stage"
    else
        die "unzip or python3 is required"
    fi
}

case "${1:-}" in
    "") ;;
    --uninstall) uninstall; exit 0 ;;
    *) die "unknown option: $1 (try --uninstall)" ;;
esac

command -v glib-compile-schemas >/dev/null ||
    die "glib-compile-schemas is required (libglib2.0-bin on Debian/Ubuntu, glib2 on Fedora/Arch)"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
stage="$tmp/stage"
mkdir -p "$stage"

# BASH_SOURCE is empty when the script is piped from curl.
src=""
if [[ -n ${BASH_SOURCE[0]:-} && -f ${BASH_SOURCE[0]} ]]; then
    src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

if [[ -n $src && -f $src/extension.js ]]; then
    stage_from_checkout "$src" "$stage"
else
    stage_from_release "$tmp" "$stage"
fi

[[ -f $stage/metadata.json ]] || die "nothing to install"

updating=false
[[ -d $DEST ]] && updating=true

rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -r "$stage" "$DEST"
glib-compile-schemas "$DEST/schemas"
mark_enabled

if $updating; then
    say "Updated $DEST"
else
    say "Installed to $DEST"
fi
say
if [[ ${XDG_SESSION_TYPE:-} == x11 ]]; then
    say "Press Alt+F2, type r and press Enter to reload GNOME Shell."
else
    say "Log out and back in to load it: on Wayland GNOME Shell cannot reload"
    say "extensions in place. It is already marked as enabled."
fi
