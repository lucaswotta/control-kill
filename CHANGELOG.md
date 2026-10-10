# Changelog

All notable changes to Control Kill. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-10-10

### Fixed

- The `X` now shows up while <kbd>Ctrl</kbd> is held on windows that refuse to
  close. Wine and Bottles programs drop the close function while a dialog is
  open (SQLyog's connection dialog, for one), and windows with attached
  dialogs never get an `X`: exactly the windows that most need a kill.
- A window and its dialogs that share one process get a single `SIGKILL`.

### Added

- Portuguese (Brazil) and Spanish translations.
- Preferences: a short how-to, the version, and links to the source and the
  issue tracker.
- `install.sh --uninstall`.
- The one-line installer downloads the release package, translations included,
  and leaves the extension enabled for the next login.
- Continuous integration (lint, schema, translations, installer) and release
  packages built on every tag.

### Changed

- Shell methods are patched through `InjectionManager`, and restored the same
  way on disable.
- `kill` runs with an argument vector instead of a command line.
- The compiled schema is no longer kept in the repository: GNOME compiles it on
  install.

## [1.0.0] - 2026-10-06

### Added

- Hold <kbd>Ctrl</kbd> in the overview and the close buttons turn into kill
  buttons.
- PID resolution that never kills GNOME Shell: window PID, then the app's bus
  name owner, then a plain close request.
- Configurable armed colour.

[1.1.0]: https://github.com/lucaswotta/control-kill/releases/tag/v1.1.0
[1.0.0]: https://github.com/lucaswotta/control-kill/tree/956c336
