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

export default class ControlKillPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('Appearance'),
            icon_name: 'applications-graphics-symbolic',
        });

        const group = new Adw.PreferencesGroup({
            title: _('Armed colour'),
            description: _('The colour the close buttons take while Control is held.'),
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
            subtitle: _('Takes effect the next time you hold Control.'),
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
        window.add(page);
    }
}
