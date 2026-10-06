UUID = control-kill@lucaswotta.github.io
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: install uninstall enable disable pack clean

install:
	@./install.sh

uninstall:
	rm -rf $(INSTALL_DIR)
	@echo "Removed $(INSTALL_DIR)"

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

pack:
	gnome-extensions pack --force --extra-source=stylesheet.css .
	@echo "Built $(UUID).shell-extension.zip"

clean:
	rm -f $(UUID).shell-extension.zip
