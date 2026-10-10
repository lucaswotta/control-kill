<h1 align="center">Control Kill</h1>

<p align="center"><b>Force quit frozen apps in GNOME. Safely.</b></p>

<p align="center">
  <a href="https://github.com/lucaswotta/control-kill/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/lucaswotta/control-kill/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/lucaswotta/control-kill/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/lucaswotta/control-kill?color=4A86CF"></a>
  <img alt="GNOME Shell 46–51" src="https://img.shields.io/badge/GNOME%20Shell-46%20--%2051-4A86CF">
  <a href="LICENSE"><img alt="GPL-3.0-or-later" src="https://img.shields.io/badge/license-GPL--3.0--or--later-blue"></a>
</p>

---

The `X` on a window only *asks* an app to close. A frozen app never answers.

- **Overview:** hold <kbd>Ctrl</kbd> and every close button turns red. Click
  one and the app is gone. Release <kbd>Ctrl</kbd> and nothing has changed.
- **Keyboard:** <kbd>Ctrl</kbd>+<kbd>Delete</kbd> on a window selected in the
  overview.
- **Dash and app grid:** right-click a running app, **Force Quit**.
- **"App is not responding":** the dialog's **Force Quit** button is replaced
  with one that cannot take your session down
  ([why](#gnomes-force-quit-can-end-your-session)).

Windows that normally have no `X` get one while <kbd>Ctrl</kbd> is held: Wine
programs with a dialog open, windows with attached dialogs. Flatpak, Bottles
and other sandboxed apps are killed by their real process, not the one they
report from inside the sandbox.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/lucaswotta/control-kill/main/install.sh | bash
```

Then log out and back in (GNOME on Wayland only loads extension code at
login). The extension is already enabled. To remove it, pipe the same script
to `bash -s -- --uninstall`.

From source: `git clone`, then `make install`.

## Settings

`gnome-extensions prefs control-kill@lucaswotta.github.io`, or the gear in
**Extensions**.

| Setting | Default | |
|---|---|---|
| Ask apps to quit first | off | `SIGTERM`, then `SIGKILL` three seconds later if the app is still there |
| Show a notification | on | names the app that was force quit |
| Armed colour | red | text and border adapt to stay readable |
| Play a sound | off | bundled sound or any Ogg Vorbis / WAV file |

The sound follows the system's alert sound setting. To use an MP3, convert it:
`ffmpeg -i in.mp3 -ac 1 -c:a libvorbis -q:a 4 out.oga`.

> [!WARNING]
> A force quit loses unsaved work and takes every window of the app with it.

## How the target is chosen

1. The PID GNOME reports for the window, unless it is GNOME Shell's own. For
   X11 windows that comes from the X server, which gives the host PID even
   for sandboxed apps.
2. Otherwise, the owner of the app's D-Bus name, asked of the bus daemon (which
   answers even when the app is hung).
3. If that process lives in the systemd unit GNOME started for this very app,
   the whole unit is signalled, helpers included. A process started from a
   terminal is signalled alone.
4. With no PID at all, the app's unit, if exactly one exists.
5. Nothing trustworthy: a normal close request. Never a guess.

Each process or unit gets one signal per action, and the shell's own PID and
unit are refused at the last step.

### GNOME's Force Quit can end your session

`meta_window_kill()` runs `kill(pid, 9)` on whatever `meta_window_get_pid()`
returns ([mutter, `src/core/delete.c`](https://gitlab.gnome.org/GNOME/mutter/-/blob/main/src/core/delete.c)).
For a Wayland client whose socket the compositor created, that is the
compositor itself: Nautilus reports GNOME Shell's PID. Force quitting such a
window from the "not responding" dialog kills GNOME Shell and logs you out.
Control Kill never calls it.

`_NET_WM_PID` is no better: a Wine program under Bottles reports PID 157 from
inside its sandbox while its real PID is 5776.

## Compatibility

GNOME Shell 46 to 51. Tested on 48 by hand and by the test suite; the shell
code it touches was checked against the sources of every listed release. It
patches private methods of `WindowPreview`, `AppMenu` and `CloseDialog`, so a
new GNOME release can break it: if the close buttons misbehave after an
upgrade, disable it first.

## Contributing

Bugs, translations and patches are welcome: see
[CONTRIBUTING.md](CONTRIBUTING.md). Available in English, Portuguese (Brazil)
and Spanish.

## License

GPL-3.0-or-later. The kill sound is
[UI back sound](https://freesound.org/people/KieranKeegan/sounds/418231/) by
KieranKeegan,
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), trimmed and
converted.
