<h1 align="center">Control Kill</h1>

<p align="center">
  Hold <kbd>Ctrl</kbd> in the GNOME overview and every window close button turns
  red. Click one to kill the app, instead of politely asking it to close.
</p>

<p align="center">
  <img alt="GNOME Shell 45–48" src="https://img.shields.io/badge/GNOME%20Shell-45%20--%2048-4A86CF">
  <img alt="License GPL-3.0-or-later" src="https://img.shields.io/badge/license-GPL--3.0--or--later-blue">
</p>

---

## Why

The `X` on a window preview sends a close *request*. A frozen app never answers
it, so the button does nothing and you wait for GNOME's "Force Quit" dialog to
turn up on its own.

Control Kill gives that same button a second mode. Nothing is taken away: with
no modifier held it behaves exactly as it always did.

## Install

One line:

```sh
curl -fsSL https://raw.githubusercontent.com/lucaswotta/control-kill/main/install.sh | bash
```

Or by hand, if you would rather read the thing first:

```sh
git clone https://github.com/lucaswotta/control-kill.git
cd control-kill
./install.sh
```

Then **log out and back in** — GNOME only scans for new extensions when the
shell starts, and on Wayland the shell cannot be restarted in place. After that:

```sh
gnome-extensions enable control-kill@lucaswotta.github.io
```

## Usage

1. Open the overview.
2. Hold <kbd>Ctrl</kbd>. The close buttons turn red and pop.
3. Click the `X` of the app you want gone.

Release <kbd>Ctrl</kbd> and the buttons go back to normal.

### Choosing the colour

Red is the default. Any colour works:

```sh
gnome-extensions prefs control-kill@lucaswotta.github.io
```

The text and the border are derived from whatever you pick, so a light colour
gets dark text and stays readable.

> [!WARNING]
> Killing is killing. The process dies without saving, and it takes every window
> of that process with it — killing one Chrome window kills Chrome. That is why
> it sits behind a modifier.

## How it works

Arming is tracked from `captured-event` on the stage, and only while the
overview is open. While armed, each close button gets an inline style built
from the configured colour — foreground and border are derived from its
luminance — and a short scale pop.

The kill resolves a PID in three steps:

1. `window.get_pid()`, accepted only when it is not the shell's own PID.
2. Otherwise the owner of the app's bus name, via an async
   `GetConnectionUnixProcessID`. The bus daemon answers, not the app, so this
   works while the app is hung.
3. If neither gives a trustworthy PID, a plain close request. Not a kill, but
   the only safe move left.

Every `SIGKILL` passes a final guard that refuses PID ≤ 1 and the shell's own
PID, whichever path reached it.

### Why not `meta_window_kill()`

Because on Wayland it can end your session. It `SIGKILL`s whatever
`meta_window_get_pid()` reports, and that value is not trustworthy there: it
comes from `SO_PEERCRED` on the client socket, so when the compositor created
the socket, the credentials are the compositor's. A Nautilus window reporting
the shell's own PID turns that call into `kill -9 <gnome-shell>`.

`meta_window_kill()` has exactly one caller in mutter — the **Force Quit**
button of GNOME's unresponsive-app dialog. On an affected window, that button
ends the session too. This extension resolves the PID itself to stay clear of
it.

## Development

```sh
make install      # copy files into place and compile the schema
make enable       # or disable / pack / uninstall
```

The shell imports `extension.js` once per session and caches the module, so
editing the source needs a full log out and back in. Set `DRY_RUN = true` at the
top of `extension.js` to log what would be killed without killing it, and watch
with:

```sh
journalctl -f -o cat /usr/bin/gnome-shell | grep control-kill
```

## Compatibility

Written and tested on **GNOME Shell 48** (Debian 13). 45–47 share the same API
and are listed in `metadata.json`, but are untested.

The extension patches a private shell method (`_deleteAll`). That is the only
way to reach the close button, and it means a GNOME release can break it — if
the `X` stops working after an upgrade, disable this first.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
