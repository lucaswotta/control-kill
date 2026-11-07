# Contributing

## Bugs

Open an [issue](https://github.com/lucaswotta/control-kill/issues/new/choose)
with the log:

```sh
journalctl -b -o cat /usr/bin/gnome-shell | grep control-kill
```

Every force quit logs the signal, the PID or unit, and the app.

## Layout

| File | |
|---|---|
| `extension.js` | overview, keyboard, app menu, close dialog, feedback |
| `lib/forceQuit.js` | picks the process or unit behind a window and signals it |
| `lib/process.js` | `/proc`, D-Bus and systemd calls |
| `lib/units.js`, `lib/style.js` | pure functions, unit tested |
| `prefs.js` | preferences window |

## Building and testing

Needs `make`, `glib-compile-schemas`, `gettext`, Node.js and `shellcheck`.

```sh
npm ci
make check              # lint, unit tests, schema, translations, installer
make test-integration   # lib/process.js against the real systemd and bus
make test-shell         # the installed extension in a headless GNOME Shell
make install
make zip                # package for extensions.gnome.org
make shexli             # the checker extensions.gnome.org runs on uploads
```

`make test-shell` starts a private headless GNOME Shell with its own session
bus and in-memory settings, enables the extension, and kills real windows from
the shell's test client. It does not touch the running session. Run it before
sending a change to `extension.js`.

`tests/container.sh` runs it inside a bare Ubuntu or Fedora image, installing
what the image lacks. CI uses it once per GNOME Shell release; locally:

```sh
docker run --rm -v "$PWD":/src:ro -w /src fedora:42 tests/container.sh
```

On Wayland the running shell only loads new extension code at login. The
preferences window picks up `prefs.js` the next time it opens.

## Style

ESLint enforces the basics. Comments explain why, not what. One change per
commit.

## Translating

1. `cp po/control-kill.pot po/<lang>.po`, fill in the header and every
   `msgstr`. Use the terms GNOME already uses in your language ("Force Quit"
   is the shell's own string).
2. Add `<lang>` to `po/LINGUAS`.
3. `make check`, then `make install` and
   `LANGUAGE=<lang> gnome-extensions prefs control-kill@lucaswotta.github.io`.

After changing a translatable string in the code, `make pot`.

## Releasing

Bump `version-name` in `metadata.json`, add a `CHANGELOG.md` section, tag
`v<version>` and push the tag. The workflow builds the zip and publishes the
release; upload the same zip to extensions.gnome.org.
