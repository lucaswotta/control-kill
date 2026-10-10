<h1 align="center">Control Kill</h1>

<p align="center">
  <b>Hold <kbd>Ctrl</kbd> in the GNOME overview. Click the red <code>X</code>. The frozen app is gone.</b>
</p>

<p align="center">
  <a href="https://github.com/lucaswotta/control-kill/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/lucaswotta/control-kill/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/lucaswotta/control-kill/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/lucaswotta/control-kill?color=4A86CF"></a>
  <img alt="GNOME Shell 45–48" src="https://img.shields.io/badge/GNOME%20Shell-45%20--%2048-4A86CF">
  <a href="LICENSE"><img alt="License GPL-3.0-or-later" src="https://img.shields.io/badge/license-GPL--3.0--or--later-blue"></a>
</p>

---

An app freezes. You click its `X`. Nothing happens, because the `X` only *asks*
the app to close and a frozen app never answers. Then you wait for GNOME's
"not responding" dialog, or open a terminal and hunt for a PID.

**Control Kill** gives the `X` in the Activities overview a second mode. Hold
<kbd>Ctrl</kbd> and every close button turns red: click one and that app is
killed on the spot. Let go of <kbd>Ctrl</kbd> and everything behaves exactly as
before. Nothing is taken away.

## Highlights

- **One gesture, no terminal.** <kbd>Super</kbd>, hold <kbd>Ctrl</kbd>, click.
- **Works where the `X` disappears.** Wine and Bottles apps with a dialog open,
  and windows with attached dialogs, normally show no close button at all.
  While <kbd>Ctrl</kbd> is held, they get one.
- **Safe on Wayland.** It never trusts a PID that points at GNOME Shell itself,
  and it never uses the code path that can end your session
  ([details](#why-not-meta_window_kill)).
- **Sandbox aware.** Flatpak, Bottles and other sandboxed apps are killed by
  their real PID on the host, not by the one they report from inside the
  sandbox.
- **Yours to style.** Pick any colour; the text and border adapt to stay
  readable.
- **Optional kill sound.** Off by default. Turn it on and keep the bundled
  4 KB sound, or pick your own.
- **Speaks your language:** English, Portuguese (Brazil) and Spanish.

## Install

### One line

```sh
curl -fsSL https://raw.githubusercontent.com/lucaswotta/control-kill/main/install.sh | bash
```

This downloads the latest release, installs it for your user and leaves it
enabled. No root needed.

### From source

```sh
git clone https://github.com/lucaswotta/control-kill.git
cd control-kill
make install
```

Translations are compiled when `msgfmt` is available (package `gettext`).

### Then

**Log out and back in.** On Wayland, GNOME Shell only loads new extension code
when the session starts. On an X11 session, <kbd>Alt</kbd>+<kbd>F2</kbd>, `r`,
<kbd>Enter</kbd> is enough.

To remove it: `./install.sh --uninstall`, or the same `curl` line followed by
`| bash -s -- --uninstall`.

## Usage

1. Open the overview (<kbd>Super</kbd> or the Activities corner).
2. Hold <kbd>Ctrl</kbd>. The close buttons turn red and pop.
3. Click the `X` of the app you want gone.

> [!WARNING]
> Killing is killing. The app dies without saving, and every window that
> belongs to the same process goes with it: killing one Chrome window kills
> Chrome. That is why it sits behind a modifier.

### Settings

```sh
gnome-extensions prefs control-kill@lucaswotta.github.io
```

or open **Extensions** and click the gear next to Control Kill.

| Setting | Default | |
|---|---|---|
| Armed colour | red `#c01c28` | Colour of the close buttons while <kbd>Ctrl</kbd> is held. |
| Play a sound when killing | off | A short sound on every kill. |
| Sound file | bundled | Any Ogg Vorbis (`.ogg`, `.oga`) or WAV file. |

The sound plays through GNOME's own sound player, so it follows the system
volume and stays quiet when **Settings → Sound → Alert Sound** is turned off.
That player only reads Ogg Vorbis and WAV. To use an MP3, convert it first:

```sh
ffmpeg -i my-sound.mp3 -ac 1 -c:a libvorbis -q:a 4 my-sound.oga
```

## FAQ

**Does it change anything when I am not holding Ctrl?**
No. Without the modifier, the `X` calls GNOME's own close code untouched.

**Which process does it kill?**
The one GNOME says owns the window. For X11 apps the X server answers that,
which gives the host PID even for sandboxed apps. For Wayland apps, if the PID
cannot be trusted, it asks the session bus who owns the app's name. If nothing
gives a trustworthy PID, it falls back to a normal close request instead of
guessing.

**Does it work with Wine, Bottles, Steam, Flatpak?**
Yes. Killing a Wine program takes down that program; `wineserver` exits by
itself shortly after.

**What about apps that are not frozen?**
They die just the same. Unsaved work is lost.

## How it works

Arming is tracked from `captured-event` on the stage, and only while the
overview is open. While armed, each close button gets an inline style built from
the configured colour and a short scale pop, and every preview offers its `X`,
including the ones GNOME hides because the window refuses to close.

The kill resolves a PID in three steps:

1. `window.get_pid()`, accepted only when it is not the shell's own PID. For
   X11 windows mutter asks the X server (XRes), which reports the host PID.
2. Otherwise the owner of the app's bus name, via an async
   `GetConnectionUnixProcessID`. The bus daemon answers, not the app, so this
   works while the app is hung.
3. If neither gives a trustworthy PID, a plain close request. Not a kill, but
   the only safe move left.

Every `SIGKILL` passes a final guard that refuses PID ≤ 1 and the shell's own
PID, whichever path reached it. A window and its dialogs that share a process
get one signal, not several.

### Why not `meta_window_kill()`

Because on Wayland it can end your session. It `SIGKILL`s whatever
`meta_window_get_pid()` reports, and that value is not trustworthy there: it
comes from `SO_PEERCRED` on the client socket, so when the compositor created
the socket, the credentials are the compositor's. A Nautilus window reporting
the shell's own PID turns that call into `kill -9 <gnome-shell>`.

`meta_window_kill()` has exactly one caller in mutter: the **Force Quit**
button of GNOME's unresponsive-app dialog. On an affected window, that button
ends the session too. This extension resolves the PID itself to stay clear of
it.

### Why not `_NET_WM_PID`

A sandboxed X11 client writes the PID it sees inside its own namespace. A Wine
program under Bottles may report PID 157 while its real PID on the host is
5776, and PID 157 on the host is some unrelated process. Control Kill never
reads that property.

## Compatibility

Written and tested on **GNOME Shell 48** (Debian 13), with native Wayland apps,
XWayland apps, Flatpak apps and Wine programs under Bottles. 45 to 47 share the
same API and are listed in `metadata.json`, but are untested: reports welcome.

The extension patches private shell methods of `WindowPreview` (`_deleteAll`,
`_windowCanClose`). That is the only way to reach the close button, and it
means a GNOME release can break it. If the `X` misbehaves after an upgrade,
disable this extension first.

## Contributing

Bug reports, translations and patches are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, how to test
without logging out, and how to add a language.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

### Credits

The kill sound is
[UI back sound](https://freesound.org/people/KieranKeegan/sounds/418231/) by
KieranKeegan, released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), trimmed,
normalized and converted to mono Ogg Vorbis for this extension.
