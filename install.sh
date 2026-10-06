#!/usr/bin/env bash
# Control Kill — installer
# https://github.com/lucaswotta/control-kill
set -euo pipefail

UUID="control-kill@lucaswotta.github.io"
REPO="https://github.com/lucaswotta/control-kill.git"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"
FILES=(extension.js prefs.js metadata.json)

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$src/extension.js" ]]; then
    # Piped from curl: fetch a copy first.
    command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    echo "Fetching $REPO"
    git clone --depth 1 --quiet "$REPO" "$tmp/src"
    src="$tmp/src"
fi

mkdir -p "$DEST/schemas"
for f in "${FILES[@]}"; do
    cp "$src/$f" "$DEST/$f"
done
cp "$src"/schemas/*.gschema.xml "$DEST/schemas/"
glib-compile-schemas "$DEST/schemas"

echo "Installed to $DEST"
echo
echo "GNOME only scans for new extensions when the shell starts, and on Wayland"
echo "the shell cannot be restarted in place. Log out and back in, then run:"
echo
echo "    gnome-extensions enable $UUID"
