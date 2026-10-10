# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

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

[1.0.0]: https://github.com/lucaswotta/control-kill/releases/tag/v1.0.0
