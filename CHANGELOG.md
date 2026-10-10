# Changelog

All notable changes to Control Kill. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-10

First public release.

### Added

- Hold <kbd>Ctrl</kbd> in the Activities overview and every close button turns
  into a kill button. Without the modifier, nothing changes.
- The kill button also appears on windows that normally show no `X`: Wine and
  Bottles programs with a dialog open, and windows with attached dialogs.
- PID resolution that never kills GNOME Shell: the window PID as the X server
  or compositor reports it, then the owner of the app's bus name, then a plain
  close request. Sandboxed apps are killed by their host PID.
- One `SIGKILL` per process, however many windows it has.
- Configurable armed colour; text and border adapt to stay readable.
- Optional kill sound, off by default, with a bundled 4 KB sound or any Ogg
  Vorbis or WAV file.
- Translations: Portuguese (Brazil) and Spanish.
- Preferences with a short how-to, the version, and links to the source and
  the issue tracker.
- One-line installer that installs the latest release, leaves the extension
  enabled for the next login, and can uninstall.

[1.0.0]: https://github.com/lucaswotta/control-kill/releases/tag/v1.0.0
