# Contributing to Control Kill

Thanks for helping. Bug reports, translations and patches are all welcome.

## Reporting a bug

Open an [issue](https://github.com/lucaswotta/control-kill/issues/new/choose)
and include the log from the moment it happened:

```sh
journalctl -b -o cat /usr/bin/gnome-shell | grep control-kill
```

Every kill is logged with the window title, its class, the PID chosen and why,
so this usually says exactly what went wrong.

## Development setup

You need `make`, `glib-compile-schemas`, `gettext` and Node.js (for ESLint).

```sh
git clone https://github.com/lucaswotta/control-kill.git
cd control-kill
npm ci
make check      # lint, schema, translations, installer
make install    # install from this checkout
make zip        # build the package for extensions.gnome.org
```

## Testing a change

GNOME Shell imports `extension.js` once per session, so a change needs a new
session. Logging out every time gets old; a nested shell is faster:

```sh
dbus-run-session -- gnome-shell --nested --wayland
```

(GNOME 49 and later: `gnome-shell --devkit`.)

Set `DRY_RUN = true` at the top of `extension.js` to log what would be killed
without killing it, and watch the log with `make log`.

The preferences window runs in its own process and picks up `prefs.js` the next
time it opens: `make install && make prefs`.

## Style

- ESLint enforces the basics (`make lint`): 4 spaces, single quotes,
  semicolons.
- Comments explain *why*. The shell internals this touches are not documented
  anywhere else.
- One logical change per commit, with a message that says what changed and why.

## Translating

1. Copy the template: `cp po/control-kill.pot po/<lang>.po`
   (`de`, `fr`, `it`, `zh_CN`...).
2. Fill in the header (`Language`, `Plural-Forms`) and every `msgstr`. Poedit,
   GNOME Translation Editor or any text editor works.
3. Add the code to `po/LINGUAS`, keeping it sorted.
4. Check it: `msgfmt --check --statistics -o /dev/null po/<lang>.po`
5. Try it: `make install`, then `LANGUAGE=<lang> gnome-extensions prefs control-kill@lucaswotta.github.io`

When you change a translatable string in the code, run `make pot` to refresh
the template and merge it into every translation.

## Releasing

1. Bump `version-name` in `metadata.json` and add a section to `CHANGELOG.md`.
2. Commit, tag `v<version>` and push the tag. The release workflow builds the
   package and publishes it with the changelog section as notes.
3. Upload the same zip to extensions.gnome.org.
