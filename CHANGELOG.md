# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [1.0.2] - 2026-10-10

### Changed

- No synchronous file IO in the shell process: /proc is read asynchronously
  and the shell's own PID comes from GCredentials.
- Nothing is patched at module load: the GIO calls are wrapped locally
  instead of promisifying GIO prototypes.
- Force Quit menu items are owned by the extension and destroyed and
  released in disable().

## [1.0.1] - 2026-10-10

### Fixed

- With "Ask apps to quit first" on, the SIGKILL sent three seconds after
  SIGTERM could reach a new instance of the app, if it had been reopened in
  between and systemd gave it the same unit name. Units are now pinned to
  their invocation id, as processes already were to their start time, and
  every signal checks it first.

## [1.0.0] - 2026-10-10

First public release.

- Hold Ctrl in the Activities overview and every close button kills its app.
  Without Ctrl nothing changes.
- The X also appears, while Ctrl is held, on windows that normally have none:
  Wine programs with a dialog open, windows with attached dialogs.
- Ctrl+Delete on a window selected with the keyboard.
- Force Quit in the right-click menu of running apps in the dash and app grid.
- The shell's own Force Quit, in the "not responding" dialog, is replaced:
  the original can kill GNOME Shell itself.
- Target resolution that never signals the shell: window PID, then the app's
  D-Bus name owner, then the app's systemd unit; whole units when they belong
  to the app, single processes otherwise; a close request when nothing is
  trustworthy.
- Optional SIGTERM first, SIGKILL three seconds later.
- Notification naming the app, optional sound (4 KB bundled, or any Ogg
  Vorbis or WAV file) that wakes sleeping Bluetooth outputs in time.
- One-time hint on the first overview after install.
- English, Portuguese (Brazil) and Spanish.
- GNOME Shell 46 to 51.

[1.0.2]: https://github.com/lucaswotta/control-kill/releases/tag/v1.0.2
[1.0.1]: https://github.com/lucaswotta/control-kill/releases/tag/v1.0.1
[1.0.0]: https://github.com/lucaswotta/control-kill/releases/tag/v1.0.0
