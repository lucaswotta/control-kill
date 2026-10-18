UUID    = control-kill@lucaswotta.github.io
DOMAIN  = control-kill
SOURCES = extension.js prefs.js metadata.json LICENSE
LIB     = $(wildcard lib/*.js)
SOUNDS  = $(wildcard sounds/*.oga sounds/*.wav)
ICONS   = $(wildcard icons/*.svg)
SCHEMA  = schemas/org.gnome.shell.extensions.control-kill.gschema.xml
LINGUAS = $(shell cat po/LINGUAS)
BUILD   = build
ZIP     = $(UUID).shell-extension.zip

.PHONY: all zip install uninstall enable disable prefs log pot lint test test-integration test-shell shexli check clean

all: zip

# The package uploaded to extensions.gnome.org and attached to releases.
# No compiled schema inside: since GNOME 44 the shell compiles it on install.
zip: $(ZIP)

$(ZIP): $(SOURCES) $(LIB) $(SOUNDS) $(ICONS) $(SCHEMA) $(wildcard po/*.po) po/LINGUAS
	rm -rf $(BUILD) $(ZIP)
	mkdir -p $(BUILD)/lib $(BUILD)/schemas $(BUILD)/sounds $(BUILD)/icons
	cp $(SOURCES) $(BUILD)/
	cp $(LIB) $(BUILD)/lib/
	cp $(SCHEMA) $(BUILD)/schemas/
	cp $(SOUNDS) $(BUILD)/sounds/
	cp $(ICONS) $(BUILD)/icons/
	for lang in $(LINGUAS); do \
		mkdir -p $(BUILD)/locale/$$lang/LC_MESSAGES && \
		msgfmt --check -o $(BUILD)/locale/$$lang/LC_MESSAGES/$(DOMAIN).mo po/$$lang.po || exit 1; \
	done
	cd $(BUILD) && zip -qr ../$(ZIP) .
	@echo "Built $(ZIP)"

install:
	@./install.sh

uninstall:
	@./install.sh --uninstall

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

prefs:
	gnome-extensions prefs $(UUID)

log:
	journalctl -f -o cat /usr/bin/gnome-shell | grep --line-buffered control-kill

# Refresh the template after changing a translatable string, then merge it
# into every translation.
pot:
	xgettext --from-code=UTF-8 --language=JavaScript \
		--package-name=$(DOMAIN) \
		--msgid-bugs-address=https://github.com/lucaswotta/control-kill/issues \
		--files-from=po/POTFILES --output=po/$(DOMAIN).pot
	for lang in $(LINGUAS); do \
		msgmerge --quiet --update --backup=none po/$$lang.po po/$(DOMAIN).pot || exit 1; \
	done

lint:
	npx --no-install eslint .

test:
	node --test tests/*.test.js

# Talks to the real user systemd and session bus: run it in a desktop session.
test-integration:
	gjs -m tests/integration.js

# A private headless GNOME Shell (own session bus, settings in memory) drives
# the installed extension. Nothing touches the running session.
test-shell: install
	@log=$$(mktemp); \
	timeout 120 dbus-run-session -- env -u DISPLAY GSETTINGS_BACKEND=memory \
		gnome-shell --headless --wayland-display=control-kill-test \
		--virtual-monitor 1280x800 --automation-script=$(CURDIR)/tests/shell.js >$$log 2>&1; \
	status=$$?; \
	grep -E '^(ok|FAIL)|passed|FAILED|JS ERROR|\[control-kill\]' $$log; \
	rm -f $$log; exit $$status

# The static checker extensions.gnome.org runs on uploads. shexli 0.2.1
# crashes with tree-sitter 0.26, hence the pin. EGO-M-004 flags GNOME 51 as
# implausible; reviewers accept it (Blur my Shell, 46-51, approved 2026-10-06).
shexli: zip
	uvx -q --python 3.13 --with 'tree-sitter==0.25.0' --with 'tree-sitter-javascript==0.25.0' \
		shexli==0.2.1 $(ZIP)

check: lint test
	glib-compile-schemas --strict --dry-run schemas
	for po in po/*.po; do msgfmt --check --statistics -o /dev/null $$po || exit 1; done
	shellcheck install.sh

clean:
	rm -rf $(BUILD) $(ZIP)
