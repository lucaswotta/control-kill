// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Lucas Motta

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import {Extension, InjectionManager, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';
import {CloseDialog} from 'resource:///org/gnome/shell/ui/closeDialog.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {WindowPreview} from 'resource:///org/gnome/shell/ui/windowPreview.js';

import {cancelPending, forceQuit} from './lib/forceQuit.js';
import {buttonStyle} from './lib/style.js';

const MODIFIER = Clutter.ModifierType.CONTROL_MASK;
const MODIFIER_KEYS = [Clutter.KEY_Control_L, Clutter.KEY_Control_R];

const KILL_SOUND = 'sounds/kill.oga';
const ICON = 'icons/control-kill-symbolic.svg';

// Idle audio outputs are suspended, and a Bluetooth one takes longer to wake
// than the kill sound lasts. A tenth of a second of silence, played as soon as
// a kill becomes likely, wakes it in time.
const WAKE_SOUND = 'sounds/wake.wav';
const WAKE_INTERVAL_US = 3 * GLib.USEC_PER_SEC;

function windowsOf(preview) {
    return preview.window_container.layout_manager.get_windows();
}

// Leaves the opacity transitions alone: the shell fades the X in with them.
function pop(button) {
    button.remove_transition('scale-x');
    button.remove_transition('scale-y');
    button.set_pivot_point(0.5, 0.5);
    button.set_scale(1, 1);
    button.ease({
        scale_x: 1.25,
        scale_y: 1.25,
        duration: 120,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: () => button.ease({
            scale_x: 1,
            scale_y: 1,
            duration: 220,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        }),
    });
}

export default class ControlKillExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._injections = new InjectionManager();
        this._armed = false;
        this._color = null;
        this._eventId = 0;
        this._lastWake = 0;
        this._source = null;
        this._previews = new Set();
        this._menuItems = new Map();

        this._patchWindowPreview();
        this._patchAppMenu();
        this._patchCloseDialog();

        Main.overview.connectObject(
            'showing', () => this._onOverviewShowing(),
            'hidden', () => this._onOverviewHidden(),
            this);
        if (Main.overview.visible)
            this._onOverviewShowing();
    }

    disable() {
        this._onOverviewHidden();
        Main.overview.disconnectObject(this);

        for (const preview of this._previews)
            this._untrack(preview);
        for (const item of this._menuItems.values())
            item.destroy();

        this._injections.clear();
        cancelPending();
        this._source?.destroy();

        this._source = null;
        this._settings = null;
        this._injections = null;
        this._previews = null;
        this._menuItems = null;
    }

    _patchWindowPreview() {
        const ext = this;

        // Only previews showing their X need restyling when Ctrl changes.
        this._injections.overrideMethod(WindowPreview.prototype, 'showOverlay', original => function (animate) {
            original.call(this, animate);
            if (this._overlayShown)
                ext._track(this);
        });
        this._injections.overrideMethod(WindowPreview.prototype, 'hideOverlay', original => function (animate) {
            original.call(this, animate);
            ext._untrack(this);
        });

        // The shell hides the X on windows that refuse to close: Wine drops
        // the close function while a dialog is open, and windows with attached
        // dialogs never get one. Those need a kill the most.
        this._injections.overrideMethod(WindowPreview.prototype, '_windowCanClose', original => function () {
            return ext._armed || original.call(this);
        });

        this._injections.overrideMethod(WindowPreview.prototype, '_deleteAll', original => function () {
            if (ext._armed)
                ext._forceQuit(windowsOf(this));
            else
                original.call(this);
        });
    }

    _patchAppMenu() {
        const ext = this;

        // Called whenever the menu's app or its state changes. The items live
        // in ext._menuItems (menu -> item) and are destroyed in disable().
        this._injections.overrideMethod(AppMenu.prototype, '_updateQuitItem', original => function () {
            original.call(this);
            ext._forceQuitItem(this).visible = this._quitItem.visible;
        });
    }

    _forceQuitItem(menu) {
        let item = this._menuItems.get(menu);
        if (!item) {
            item = new PopupMenu.PopupMenuItem(_('Force Quit'));
            item.connect('activate', () => this._forceQuit(menu._app.get_windows()));
            item.connect('destroy', () => this._menuItems?.delete(menu));
            menu.addMenuItem(item, menu._getMenuItems().indexOf(menu._quitItem) + 1);
            this._menuItems.set(menu, item);
        }
        return item;
    }

    _patchCloseDialog() {
        const ext = this;

        // The shell's "Force Quit" answers FORCE_CLOSE, and mutter then calls
        // meta_window_kill(), which can take the session down.
        this._injections.overrideMethod(CloseDialog.prototype, '_onClose', () => function () {
            ext._forceQuit([this._window]);
            this.response(Meta.CloseDialogResponse.WAIT);
        });
    }

    _track(preview) {
        if (this._previews.has(preview))
            return;
        this._previews.add(preview);

        const button = preview._closeButton;
        button.connectObject('notify::hover', () => this._style(button), this);
        preview.connectObject('destroy', () => this._previews?.delete(preview), this);

        this._style(button);
        if (this._armed)
            pop(button);
    }

    _untrack(preview) {
        if (!this._previews?.delete(preview))
            return;
        preview._closeButton.disconnectObject(this);
        preview.disconnectObject(this);
        preview._closeButton.set_style(null);
    }

    _style(button) {
        button.set_style(this._armed ? buttonStyle(this._color, button.hover) : null);
    }

    _setArmed(armed) {
        if (armed === this._armed)
            return;
        this._armed = armed;

        if (armed) {
            this._color = this._settings.get_string('armed-color');
            this._wakeAudio();
        }

        for (const preview of this._previews) {
            const button = preview._closeButton;
            button.remove_all_transitions();
            button.set_scale(1, 1);
            button.opacity = 255;
            button.visible = preview._windowCanClose();
            this._style(button);
            if (armed && button.visible)
                pop(button);
        }
    }

    _onOverviewShowing() {
        this._wakeAudio();
        this._showHintOnce();
        this._eventId ||= global.stage.connect('captured-event', (_actor, event) => this._onEvent(event));
    }

    _onOverviewHidden() {
        if (this._eventId) {
            global.stage.disconnect(this._eventId);
            this._eventId = 0;
        }
        this._setArmed(false);
    }

    _onEvent(event) {
        const type = event.type();

        if (type === Clutter.EventType.KEY_PRESS || type === Clutter.EventType.KEY_RELEASE) {
            const symbol = event.get_key_symbol();

            // A modifier's own events do not carry it in their state yet.
            if (MODIFIER_KEYS.includes(symbol)) {
                this._setArmed(type === Clutter.EventType.KEY_PRESS);
                return Clutter.EVENT_PROPAGATE;
            }
            this._setArmed((event.get_state() & MODIFIER) !== 0);

            // Ctrl+Delete on a preview focused with the keyboard.
            if (type === Clutter.EventType.KEY_PRESS && this._armed && symbol === Clutter.KEY_Delete) {
                const focus = global.stage.get_key_focus();
                if (focus instanceof WindowPreview) {
                    this._forceQuit(windowsOf(focus));
                    return Clutter.EVENT_STOP;
                }
            }
        } else if (type === Clutter.EventType.MOTION ||
                   type === Clutter.EventType.ENTER ||
                   type === Clutter.EventType.BUTTON_PRESS) {
            // Ctrl pressed before the overview opened, or released elsewhere.
            this._setArmed((event.get_state() & MODIFIER) !== 0);
        }

        return Clutter.EVENT_PROPAGATE;
    }

    async _forceQuit(windows) {
        const names = await forceQuit(windows, {graceful: this._settings.get_boolean('graceful')});
        if (!this._settings || names.length === 0)
            return;

        if (this._settings.get_boolean('sound-enabled'))
            this._play(await this._killSound(), _('Application force quit'));
        if (this._settings.get_boolean('notify')) {
            for (const name of names)
                this._notify(_('%s was force quit').format(name));
        }
    }

    async _killSound() {
        const custom = this._settings.get_string('sound-file');
        if (custom) {
            const file = Gio.File.new_for_path(custom);
            try {
                await file.query_info_async('standard::type', Gio.FileQueryInfoFlags.NONE,
                    GLib.PRIORITY_DEFAULT, null);
                return file;
            } catch {
                // missing: the bundled sound plays instead
            }
        }
        return this.dir.resolve_relative_path(KILL_SOUND);
    }

    _wakeAudio() {
        const now = GLib.get_monotonic_time();
        if (!this._settings.get_boolean('sound-enabled') || now - this._lastWake < WAKE_INTERVAL_US)
            return;
        this._lastWake = now;
        this._play(this.dir.resolve_relative_path(WAKE_SOUND), 'Control Kill');
    }

    // mutter's sound player: off the main thread, silent when the user turned
    // alert sounds off, and limited to what libcanberra reads (Ogg Vorbis, WAV).
    _play(file, description) {
        global.display.get_sound_player().play_from_file(file, description, null);
    }

    _showHintOnce() {
        if (this._settings.get_boolean('hint-shown'))
            return;
        this._settings.set_boolean('hint-shown', true);
        this._notify(_('Control Kill is ready'),
            _('Hold Ctrl in the overview and click a window’s X to force quit it. Running apps also get Force Quit in their right-click menu.'));
    }

    // Main.notify() files everything under the shell's generic "System" source;
    // this one says who is speaking. The shell destroys a source once its last
    // notification goes away, so it is created again when needed.
    _notify(title, body = null) {
        if (!this._source) {
            this._source = new MessageTray.Source({
                title: 'Control Kill',
                icon: new Gio.FileIcon({file: this.dir.resolve_relative_path(ICON)}),
            });
            this._source.connect('destroy', () => {
                this._source = null;
            });
            Main.messageTray.add(this._source);
        }
        this._source.addNotification(new MessageTray.Notification({
            source: this._source,
            title,
            body,
            isTransient: true,
        }));
    }
}
