/* extension.js
 *
 * Control Kill — hold Control in the overview to turn window close buttons
 * into kill buttons.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lucas Motta
 */

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {WindowPreview} from 'resource:///org/gnome/shell/ui/windowPreview.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/** Log the chosen target instead of killing it. Useful when hacking on this. */
const DRY_RUN = false;

/** Held modifier that arms the kill, and the key symbols that report it. */
const MODIFIER = Clutter.ModifierType.CONTROL_MASK;
const MODIFIER_KEYS = [Clutter.KEY_Control_L, Clutter.KEY_Control_R];

const DEFAULT_COLOR = '#c01c28';

const POP_SCALE = 1.25;
const POP_IN_MS = 120;
const POP_OUT_MS = 220;

function parseHex(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex ?? '');
    return m ? [1, 2, 3].map(i => parseInt(m[i], 16)) : null;
}

/**
 * Inline style for the close button. Foreground and border are derived from
 * the chosen colour so that any colour stays readable, light or dark.
 */
function styleFor(hex, hovered) {
    const rgb = parseHex(hex) ?? parseHex(DEFAULT_COLOR);
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    const toward = lum > 0.6 ? 0 : 255;
    const mix = (c, amount) => Math.round(c + (toward - c) * amount);

    const bg = hovered ? rgb.map(c => mix(c, 0.18)) : rgb;
    const border = rgb.map(c => mix(c, 0.45));

    return `background-color: rgb(${bg.join(',')}); ` +
           `color: ${lum > 0.6 ? '#000000' : '#ffffff'}; ` +
           `border: 2px solid rgb(${border.join(',')});`;
}

function shellPid() {
    try {
        return parseInt(GLib.file_read_link('/proc/self'), 10);
    } catch {
        return -1;
    }
}

function describe(window) {
    const safe = fn => {
        try {
            return fn();
        } catch (e) {
            return `<error: ${e.message}>`;
        }
    };
    return [
        `title="${safe(() => window.get_title())}"`,
        `wm_class=${safe(() => window.get_wm_class())}`,
        `pid=${safe(() => window.get_pid())}`,
        `client_type=${safe(() => window.get_client_type())}`,
    ].join(' ');
}

/**
 * @param {number} pid
 * @param {string} why - logged next to the PID
 * @param {Set<number>} seen - PIDs already signalled by this click; a window
 *   and its dialogs usually share one process, which only needs one signal
 */
function sigkill(pid, why, seen) {
    // Last gate before a signal leaves this extension. Callers check too, but
    // this is the one that cannot be bypassed by a future code path.
    const mine = shellPid();
    if (!Number.isInteger(pid) || pid <= 1 || pid === mine) {
        console.warn(`[control-kill] refused SIGKILL on ${pid} (shell=${mine}, ${why})`);
        return;
    }
    if (seen.has(pid))
        return;
    seen.add(pid);

    console.warn(`[control-kill] SIGKILL ${pid} (${why})`);
    try {
        const proc = Gio.Subprocess.new(['kill', '-9', `${pid}`], Gio.SubprocessFlags.STDERR_SILENCE);
        proc.wait_check_async(null, (p, res) => {
            try {
                p.wait_check_finish(res);
            } catch (e) {
                console.warn(`[control-kill] kill ${pid} failed: ${e.message}`);
            }
        });
    } catch (e) {
        console.warn(`[control-kill] could not run kill: ${e.message}`);
    }
}

/** "org.gnome.Nautilus.desktop" -> "org.gnome.Nautilus" */
function busNameFor(window) {
    try {
        const app = Shell.WindowTracker.get_default().get_window_app(window);
        const id = app?.get_id();
        if (!id)
            return null;
        const name = id.replace(/\.desktop$/, '');
        return /^[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*)+$/.test(name) ? name : null;
    } catch {
        return null;
    }
}

/** No trustworthy PID anywhere: ask politely and leave it at that. */
function politeClose(window, reason) {
    console.warn(`[control-kill] no trustworthy PID (${reason}); sending a close request`);
    try {
        window.delete(global.get_current_time());
    } catch (e) {
        console.warn(`[control-kill] delete() failed: ${e.message}`);
    }
}

/**
 * Ask the session bus who owns the app's name. The bus daemon answers, not the
 * app, so this still works while the app is hung. Async on purpose: a sync
 * D-Bus call here would block the compositor.
 */
function killViaBus(window, mine, seen) {
    const busName = busNameFor(window);
    if (!busName) {
        politeClose(window, 'app owns no bus name');
        return;
    }

    Gio.DBus.session.call(
        'org.freedesktop.DBus',
        '/org/freedesktop/DBus',
        'org.freedesktop.DBus',
        'GetConnectionUnixProcessID',
        new GLib.Variant('(s)', [busName]),
        new GLib.VariantType('(u)'),
        Gio.DBusCallFlags.NONE,
        500,
        null,
        (bus, res) => {
            let pid = 0;
            try {
                [pid] = bus.call_finish(res).deepUnpack();
            } catch (e) {
                politeClose(window, `bus lookup failed: ${e.message}`);
                return;
            }

            if (pid > 1 && pid !== mine)
                sigkill(pid, `via ${busName}`, seen);
            else
                politeClose(window, `bus returned an unusable PID (${pid})`);
        });
}

/**
 * Do not call Meta.Window.kill() here.
 *
 * meta_window_kill() (mutter, src/core/delete.c) runs kill(pid, 9) on whatever
 * meta_window_get_pid() reports. On Wayland that PID comes from SO_PEERCRED on
 * the client socket, so when the compositor created the socket it is the
 * compositor's own PID. Calling kill() on such a window ends the session.
 * See the README.
 *
 * Do not read _NET_WM_PID either. A sandboxed X11 client (Flatpak, Bottles)
 * writes the PID it sees inside its own namespace, which names an unrelated
 * process on the host. get_pid() asks the X server (XRes) instead.
 */
function killWindow(window, seen) {
    const mine = shellPid();
    const direct = window.get_pid();

    if (DRY_RUN) {
        console.warn(`[control-kill][dry-run] would target: ${describe(window)} shell_pid=${mine} bus=${busNameFor(window)}`);
        return;
    }

    console.warn(`[control-kill] target: ${describe(window)} shell_pid=${mine}`);

    if (direct > 1 && direct !== mine) {
        sigkill(direct, 'window PID', seen);
        return;
    }

    killViaBus(window, mine, seen);
}

function popButton(button) {
    button.remove_all_transitions();
    button.set_pivot_point(0.5, 0.5);
    button.set_scale(1, 1);
    button.ease({
        scaleX: POP_SCALE,
        scaleY: POP_SCALE,
        duration: POP_IN_MS,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: () => {
            button.ease({
                scaleX: 1,
                scaleY: 1,
                duration: POP_OUT_MS,
                mode: Clutter.AnimationMode.EASE_OUT_BACK,
            });
        },
    });
}

function resetButton(button) {
    button.remove_all_transitions();
    button.set_scale(1, 1);
}

export default class ControlKillExtension extends Extension {
    enable() {
        this._armed = false;
        this._armedColor = null;
        this._capturedEventId = 0;
        this._previews = new Set();
        this._settings = this.getSettings();
        this._injections = new InjectionManager();

        const ext = this;

        this._injections.overrideMethod(WindowPreview.prototype, '_init', original => {
            return function (...args) {
                const ret = original.apply(this, args);
                ext._track(this);
                return ret;
            };
        });

        // The shell hides the X when the window refuses to close: Wine drops
        // the close function from a window that has a modal dialog open, and
        // windows with attached dialogs never get one. Those are exactly the
        // windows that need a kill, so while armed every preview offers it.
        this._injections.overrideMethod(WindowPreview.prototype, '_windowCanClose', original => {
            return function () {
                return ext._armed || original.call(this);
            };
        });

        // With the modifier held the X kills; otherwise it behaves as it always
        // did, by calling straight through to the original.
        this._injections.overrideMethod(WindowPreview.prototype, '_deleteAll', original => {
            return function () {
                const [, , mods] = global.get_pointer();
                if ((mods & MODIFIER) === 0) {
                    original.call(this);
                    return;
                }

                const seen = new Set();
                const windows = this.window_container.layout_manager.get_windows();
                for (const window of windows.reverse())
                    killWindow(window, seen);

                this._closeRequested = true;
            };
        });

        this._overviewIds = [
            Main.overview.connect('showing', () => this._startTracking()),
            Main.overview.connect('hidden', () => this._stopTracking()),
        ];
        if (Main.overview.visible)
            this._startTracking();
    }

    disable() {
        this._stopTracking();

        for (const id of this._overviewIds ?? [])
            Main.overview.disconnect(id);
        this._overviewIds = null;

        this._injections?.clear();
        this._injections = null;

        for (const preview of this._previews ?? [])
            preview.disconnectObject(this);
        this._previews = null;

        this._armedColor = null;
        this._settings = null;
    }

    _track(preview) {
        this._previews.add(preview);
        preview.connectObject('destroy', () => this._previews?.delete(preview), this);

        const button = preview._closeButton;
        if (!button)
            return;

        // The button only appears on hover, so one that shows up while the
        // modifier is already held has to be caught here.
        button.connectObject(
            'notify::visible', () => {
                if (!this._armedColor || !button.visible)
                    return;
                this._applyStyle(button);
                popButton(button);
            },
            'notify::hover', () => this._applyStyle(button),
            this);
    }

    _applyStyle(button) {
        button.set_style(this._armedColor ? styleFor(this._armedColor, button.hover) : null);
    }

    _startTracking() {
        if (this._capturedEventId)
            return;
        this._capturedEventId = global.stage.connect(
            'captured-event', (_actor, event) => this._onCapturedEvent(event));
    }

    _stopTracking() {
        if (this._capturedEventId) {
            global.stage.disconnect(this._capturedEventId);
            this._capturedEventId = 0;
        }
        this._setArmed(false);
    }

    _onCapturedEvent(event) {
        const type = event.type();

        if (type === Clutter.EventType.KEY_PRESS || type === Clutter.EventType.KEY_RELEASE) {
            // On the modifier's own press and release the event state does not
            // include it yet, so read the key symbol instead.
            if (MODIFIER_KEYS.includes(event.get_key_symbol()))
                this._setArmed(type === Clutter.EventType.KEY_PRESS);
            else
                this._setArmed((event.get_state() & MODIFIER) !== 0);
        } else if (type === Clutter.EventType.MOTION ||
                   type === Clutter.EventType.ENTER ||
                   type === Clutter.EventType.BUTTON_PRESS) {
            // Catches entering the overview with the key already held, and any
            // release that went to another actor.
            this._setArmed((event.get_state() & MODIFIER) !== 0);
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _setArmed(armed) {
        if (armed === this._armed)
            return;
        this._armed = armed;

        this._armedColor = armed
            ? this._settings?.get_string('armed-color') ?? DEFAULT_COLOR
            : null;

        for (const preview of this._previews ?? []) {
            const button = preview._closeButton;
            if (!button)
                continue;

            this._applyStyle(button);

            // A preview already hovered decided on its X before the modifier
            // went down (or up); bring that decision in line with the new state.
            if (preview._overlayShown) {
                if (armed && !button.visible) {
                    button.opacity = 255;
                    button.show();
                } else if (!armed && button.visible && !preview._windowCanClose()) {
                    button.hide();
                }
            }

            if (armed && button.visible)
                popButton(button);
            else
                resetButton(button);
        }
    }
}
