#!/usr/bin/env bash
# Control Kill: headless shell test inside a bare container
#
# Installs what a minimal Ubuntu or Fedora image lacks, then runs
# `make test-shell` (see tests/shell.js). CI runs it once per GNOME Shell
# release; anyone can run the same thing locally:
#
#   docker run --rm -v "$PWD":/src:ro -w /src ubuntu:24.04 tests/container.sh
set -euo pipefail

if command -v apt-get >/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq --no-install-recommends \
        gnome-shell xwayland dbus-daemon dbus-bin make gettext libglib2.0-bin ca-certificates
elif command -v dnf >/dev/null; then
    dnf install -y -q --setopt=install_weak_deps=False \
        gnome-shell xorg-x11-server-Xwayland dbus-daemon make gettext glib2
else
    echo "container.sh: needs apt-get or dnf" >&2
    exit 1
fi

gnome-shell --version

# mutter starts Xwayland and wants its socket directory to exist.
mkdir -p /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix

# The shell talks to logind when /run/systemd/seats exists, which a container
# has no daemon for: without the directory it uses its dummy login manager.
rm -rf /run/systemd/seats

# The shell also expects the system bus (UPower, NetworkManager and friends).
mkdir -p /run/dbus
dbus-daemon --system --fork

XDG_RUNTIME_DIR="/run/user/$(id -u)"
export XDG_RUNTIME_DIR
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

make test-shell
