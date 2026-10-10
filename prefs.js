// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Lucas Motta

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {DEFAULT_COLOR} from './lib/style.js';

const KILL_SOUND = 'sounds/kill.oga';

// What libcanberra, and so the shell, can play.
const SOUND_TYPES = ['audio/x-vorbis+ogg', 'audio/ogg', 'audio/x-wav', 'audio/wav', 'audio/vnd.wave'];
const SOUND_SUFFIXES = ['oga', 'ogg', 'wav'];

function hexOf(rgba) {
    const hex = v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
    return `#${hex(rgba.red)}${hex(rgba.green)}${hex(rgba.blue)}`;
}

function rgbaOf(hex) {
    const rgba = new Gdk.RGBA();
    if (!rgba.parse(hex))
        rgba.parse(DEFAULT_COLOR);
    return rgba;
}

function iconButton(icon, tooltip) {
    return new Gtk.Button({
        icon_name: icon,
        tooltip_text: tooltip,
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
}

function switchRow(settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function linkRow(title, url) {
    const row = new Adw.ActionRow({title, activatable: true});
    row.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
    row.connect('activated', () => new Gtk.UriLauncher({uri: url}).launch(row.get_root(), null, null));
    return row;
}

// Trust the sniffed type, and the name only when the type is unknown: an
// Opus file named .ogg is still refused.
function playable(file) {
    let type = null;
    try {
        type = file.query_info('standard::content-type', Gio.FileQueryInfoFlags.NONE, null)
            .get_content_type();
    } catch {
        // unreadable: decided by the name below
    }

    if (type && type !== 'application/octet-stream')
        return SOUND_TYPES.includes(type);
    return SOUND_SUFFIXES.includes(file.get_basename().split('.').pop().toLowerCase());
}

export default class ControlKillPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();

        page.add(new Adw.PreferencesGroup({
            title: _('How to use'),
            description: _('Open the Activities overview and hold Ctrl: every close button turns into a kill button. Click one, or press Ctrl+Delete on a window selected with the keyboard. Running apps also get Force Quit in their right-click menu.'),
        }));

        const behaviour = new Adw.PreferencesGroup({title: _('Behaviour')});
        behaviour.add(switchRow(settings, 'graceful', _('Ask apps to quit first'),
            _('Wait three seconds for the app to exit before forcing it')));
        behaviour.add(switchRow(settings, 'notify', _('Show a notification'),
            _('Name the app after it is force quit')));
        page.add(behaviour);

        page.add(this._colorGroup(settings));
        page.add(this._soundGroup(window, settings));

        const about = new Adw.PreferencesGroup({title: _('About')});
        about.add(new Adw.ActionRow({title: _('Version'), subtitle: this.metadata['version-name']}));
        about.add(linkRow(_('Source code'), this.metadata.url));
        about.add(linkRow(_('Report a problem'), `${this.metadata.url}/issues`));
        page.add(about);

        window.add(page);
    }

    _colorGroup(settings) {
        const button = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog({with_alpha: false}),
            rgba: rgbaOf(settings.get_string('armed-color')),
            valign: Gtk.Align.CENTER,
        });
        button.connect('notify::rgba', () => settings.set_string('armed-color', hexOf(button.rgba)));

        const reset = iconButton('edit-undo-symbolic', _('Reset'));
        reset.connect('clicked', () => {
            settings.reset('armed-color');
            button.rgba = rgbaOf(settings.get_string('armed-color'));
        });

        const row = new Adw.ActionRow({
            title: _('Armed colour'),
            subtitle: _('Close buttons while Ctrl is held'),
        });
        row.add_suffix(reset);
        row.add_suffix(button);
        row.activatable_widget = button;

        const group = new Adw.PreferencesGroup({title: _('Appearance')});
        group.add(row);
        return group;
    }

    _soundGroup(window, settings) {
        const enabled = switchRow(settings, 'sound-enabled', _('Play a sound'), null);

        const row = new Adw.ActionRow({title: _('Sound file'), use_markup: false});
        enabled.bind_property('active', row, 'sensitive', GObject.BindingFlags.SYNC_CREATE);

        const chosen = () => {
            const path = settings.get_string('sound-file');
            return path ? Gio.File.new_for_path(path) : null;
        };

        // Held here: a MediaFile that gets collected stops playing.
        let preview = null;
        const play = iconButton('media-playback-start-symbolic', _('Play'));
        play.connect('clicked', () => {
            const file = chosen();
            preview?.set_playing(false);
            preview = Gtk.MediaFile.new_for_file(file?.query_exists(null)
                ? file : this.dir.resolve_relative_path(KILL_SOUND));
            preview.play();
        });

        const choose = iconButton('document-open-symbolic', _('Choose a file…'));
        choose.connect('clicked', () => this._chooseSound(window, settings));

        const reset = iconButton('edit-undo-symbolic', _('Use the default sound'));
        reset.connect('clicked', () => settings.reset('sound-file'));

        const sync = () => {
            const file = chosen();
            if (!file)
                row.subtitle = _('Default sound');
            else if (!file.query_exists(null))
                row.subtitle = _('File not found, the default sound plays instead');
            else
                row.subtitle = file.get_basename();
            reset.sensitive = file !== null;
        };
        settings.connect('changed::sound-file', sync);
        sync();

        row.add_suffix(play);
        row.add_suffix(choose);
        row.add_suffix(reset);

        const group = new Adw.PreferencesGroup({
            title: _('Sound'),
            description: _('Follows the system setting for alert sounds.'),
        });
        group.add(enabled);
        group.add(row);
        return group;
    }

    _chooseSound(window, settings) {
        const filter = new Gtk.FileFilter({name: _('Ogg Vorbis or WAV')});
        SOUND_TYPES.forEach(t => filter.add_mime_type(t));
        SOUND_SUFFIXES.forEach(s => filter.add_suffix(s));

        const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
        filters.append(filter);

        const dialog = new Gtk.FileDialog({title: _('Choose a sound'), filters, default_filter: filter});
        dialog.open(window, null, (_dialog, res) => {
            let file;
            try {
                file = dialog.open_finish(res);
            } catch {
                return; // dismissed
            }

            if (!file.get_path() || !playable(file)) {
                window.add_toast(new Adw.Toast({title: _('Only Ogg Vorbis and WAV files can be played.')}));
                return;
            }
            settings.set_string('sound-file', file.get_path());
        });
    }
}
