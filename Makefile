UUID    = control-kill@lucaswotta.github.io
DOMAIN  = control-kill
SOURCES = extension.js prefs.js metadata.json LICENSE
SOUNDS  = $(wildcard sounds/*.oga)
SCHEMA  = schemas/org.gnome.shell.extensions.control-kill.gschema.xml
LINGUAS = $(shell cat po/LINGUAS)
BUILD   = build
ZIP     = $(UUID).shell-extension.zip

.PHONY: all zip install uninstall enable disable prefs log pot lint check clean

all: zip

# The package uploaded to extensions.gnome.org and attached to releases.
# No compiled schema inside: since GNOME 44 the shell compiles it on install.
zip: $(ZIP)

$(ZIP): $(SOURCES) $(SOUNDS) $(SCHEMA) $(wildcard po/*.po) po/LINGUAS
	rm -rf $(BUILD) $(ZIP)
	mkdir -p $(BUILD)/schemas $(BUILD)/sounds
	cp $(SOURCES) $(BUILD)/
	cp $(SCHEMA) $(BUILD)/schemas/
	cp $(SOUNDS) $(BUILD)/sounds/
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

check: lint
	glib-compile-schemas --strict --dry-run schemas
	for po in po/*.po; do msgfmt --check --statistics -o /dev/null $$po || exit 1; done
	shellcheck install.sh

clean:
	rm -rf $(BUILD) $(ZIP)
