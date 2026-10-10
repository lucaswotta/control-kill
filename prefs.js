/* prefs.js
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lucas Motta
 */

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const DEFAULT_COLOR = '#c01c28';

function hexOf(rgba) {
    const byte = v => Math.round(Math.max(0, Math.min(1, v)) * 255);
    const hex = v => byte(v).toString(16).padStart(2, '0');
    return `#${hex(rgba.red)}${hex(rgba.green)}${hex(rgba.blue)}`;
}

function rgbaOf(hex) {
    const rgba = new Gdk.RGBA();
    if (!rgba.parse(hex))
        rgba.parse(DEFAULT_COLOR);
    return rgba;
}

function linkRow(title, url) {
    const row = new Adw.ActionRow({title, activatable: true});
    row.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
    row.connect('activated', () => {
        new Gtk.UriLauncher({uri: url}).launch(row.get_root(), null, null);
    });
    return row;
}

export default class ControlKillPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });

        const usage = new Adw.PreferencesGroup({
            title: _('How to use'),
            description: _('Open the Activities overview and hold Ctrl. Every close button turns into a kill button: click one to end that app at once. Release Ctrl and the buttons go back to normal.'),
        });
        page.add(usage);

        const group = new Adw.PreferencesGroup({
            title: _('Armed colour'),
            description: _('The colour the close buttons take while Ctrl is held.'),
        });

        const button = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog({with_alpha: false}),
            rgba: rgbaOf(settings.get_string('armed-color')),
            valign: Gtk.Align.CENTER,
        });
        button.connect('notify::rgba', () => {
            settings.set_string('armed-color', hexOf(button.get_rgba()));
        });

        const colorRow = new Adw.ActionRow({
            title: _('Colour'),
            subtitle: _('Takes effect the next time you hold Ctrl.'),
        });
        colorRow.add_suffix(button);
        colorRow.activatable_widget = button;

        const reset = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
        });
        reset.connect('clicked', () => {
            settings.reset('armed-color');
            button.set_rgba(rgbaOf(settings.get_string('armed-color')));
        });

        const resetRow = new Adw.ActionRow({
            title: _('Default'),
            subtitle: DEFAULT_COLOR,
        });
        resetRow.add_suffix(reset);
        resetRow.activatable_widget = reset;

        group.add(colorRow);
        group.add(resetRow);
        page.add(group);

        const about = new Adw.PreferencesGroup({title: _('About')});
        const version = new Adw.ActionRow({
            title: _('Version'),
            subtitle: this.metadata['version-name'] ?? `${this.metadata.version ?? ''}`,
        });
        about.add(version);
        about.add(linkRow(_('Source code'), this.metadata.url));
        about.add(linkRow(_('Report a problem'), `${this.metadata.url}/issues`));
        page.add(about);

        window.add(page);
    }
}
