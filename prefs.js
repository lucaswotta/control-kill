/* prefs.js
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lucas Motta
 */

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const DEFAULT_COLOR = '#c01c28';
const DEFAULT_SOUND = 'sounds/kill.oga';

/** What libcanberra, and so the shell, can play. */
const SOUND_TYPES = ['audio/x-vorbis+ogg', 'audio/ogg', 'audio/x-wav', 'audio/wav', 'audio/vnd.wave'];
const SOUND_SUFFIXES = ['oga', 'ogg', 'wav'];

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

        page.add(this._soundGroup(window, settings));

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

    _soundGroup(window, settings) {
        const group = new Adw.PreferencesGroup({
            title: _('Sound'),
            description: _('Ogg Vorbis (.ogg, .oga) or WAV files. Follows the system setting for alert sounds.'),
        });

        const enabled = new Adw.SwitchRow({title: _('Play a sound when killing')});
        settings.bind('sound-enabled', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(enabled);

        const fileRow = new Adw.ActionRow({title: _('Sound file'), use_markup: false});
        enabled.bind_property('active', fileRow, 'sensitive', GObject.BindingFlags.SYNC_CREATE);

        const defaultFile = this.dir.resolve_relative_path(DEFAULT_SOUND);
        const chosenFile = () => {
            const path = settings.get_string('sound-file');
            return path ? Gio.File.new_for_path(path) : null;
        };

        const button = (icon, tooltip) => new Gtk.Button({
            icon_name: icon,
            tooltip_text: tooltip,
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });

        // Kept alive here: a MediaFile that is collected stops playing.
        let preview = null;
        const play = button('media-playback-start-symbolic', _('Play'));
        play.connect('clicked', () => {
            const file = chosenFile();
            preview?.set_playing(false);
            preview = Gtk.MediaFile.new_for_file(file?.query_exists(null) ? file : defaultFile);
            preview.play();
        });

        const choose = button('document-open-symbolic', _('Choose a file…'));
        choose.connect('clicked', () => this._chooseSound(window, settings));

        const reset = button('edit-undo-symbolic', _('Use the default sound'));
        reset.connect('clicked', () => settings.reset('sound-file'));

        const sync = () => {
            const file = chosenFile();
            if (!file)
                fileRow.subtitle = _('Default sound');
            else if (!file.query_exists(null))
                fileRow.subtitle = _('File not found, the default sound plays instead');
            else
                fileRow.subtitle = file.get_basename();
            reset.sensitive = file !== null;
        };
        settings.connect('changed::sound-file', sync);
        sync();

        fileRow.add_suffix(play);
        fileRow.add_suffix(choose);
        fileRow.add_suffix(reset);
        group.add(fileRow);

        return group;
    }

    _chooseSound(window, settings) {
        const filter = new Gtk.FileFilter({name: _('Sound files')});
        SOUND_TYPES.forEach(t => filter.add_mime_type(t));
        SOUND_SUFFIXES.forEach(s => filter.add_suffix(s));

        const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
        filters.append(filter);

        const dialog = new Gtk.FileDialog({
            title: _('Choose a sound'),
            modal: true,
            filters,
            default_filter: filter,
        });

        dialog.open(window, null, (_dialog, res) => {
            let file;
            try {
                file = dialog.open_finish(res);
            } catch (e) {
                if (!e.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED))
                    console.warn(`[control-kill] file dialog: ${e.message}`);
                return;
            }

            // Trust the sniffed type; the extension only decides when the type
            // could not be read. An Opus file named .ogg is still refused.
            const path = file?.get_path();
            let type = null;
            try {
                type = file.query_info('standard::content-type', Gio.FileQueryInfoFlags.NONE, null)
                    .get_content_type();
            } catch {
                type = null;
            }
            const suffix = path?.split('.').pop().toLowerCase();
            const known = type && type !== 'application/octet-stream';
            const playable = known ? SOUND_TYPES.includes(type) : SOUND_SUFFIXES.includes(suffix);

            if (!path || !playable) {
                window.add_toast(new Adw.Toast({
                    title: _('Only Ogg Vorbis and WAV files can be played.'),
                }));
                return;
            }

            settings.set_string('sound-file', path);
        });
    }
}
