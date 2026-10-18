// SPDX-License-Identifier: GPL-3.0-or-later
//
// Drives the installed extension inside a private headless GNOME Shell,
// loaded with --automation-script: the shell calls run() once it is up.
// Run with `make test-shell`. The windows come from gnome-shell-perf-helper,
// the shell's own test client, and get killed for real.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';
import {CloseDialog} from 'resource:///org/gnome/shell/ui/closeDialog.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import {WindowPreview} from 'resource:///org/gnome/shell/ui/windowPreview.js';

const UUID = 'control-kill@lucaswotta.github.io';
const HELPER = 'org.gnome.Shell.PerfHelper';

const failures = [];
let forceQuitLabel = null;

function check(what, ok) {
    print(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok)
        failures.push(what);
}

function sleep(ms) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

// ExtensionState.ACTIVE in the shell's extensionUtils.
const EXTENSION_ACTIVE = 1;

async function waitFor(condition, ms = 8000) {
    for (let waited = 0; waited < ms; waited += 50) {
        const value = condition();
        if (value)
            return value;
        await sleep(50);
    }
    return null;
}

function helperRunning() {
    try {
        Gio.DBus.session.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus',
            'org.freedesktop.DBus', 'GetNameOwner', new GLib.Variant('(s)', [HELPER]),
            null, Gio.DBusCallFlags.NONE, 500, null);
        return true;
    } catch {
        return false;
    }
}

/** A fresh window from the perf helper, restarting the helper if it was killed. */
async function testWindow() {
    if (!helperRunning()) {
        Scripting._spawnPerfHelper();
        await waitFor(helperRunning);
    }
    const before = new Set(global.display.list_all_windows());
    await Scripting.createTestWindow({width: 320, height: 240});
    await Scripting.waitTestWindows();
    return waitFor(() => global.display.list_all_windows().find(w => !before.has(w)));
}

function gone(window) {
    return waitFor(() => !global.display.list_all_windows().includes(window), 5000);
}

function pidAlive(pid) {
    return GLib.file_test(`/proc/${pid}`, GLib.FileTest.EXISTS);
}

async function killed(window, pid) {
    return await gone(window) && await waitFor(() => !pidAlive(pid), 5000);
}

function findPreview(window) {
    const walk = actor => {
        if (actor instanceof WindowPreview && actor.metaWindow === window)
            return actor;
        for (const child of actor.get_children()) {
            const found = walk(child);
            if (found)
                return found;
        }
        return null;
    };
    return walk(Main.layoutManager.overviewGroup);
}

function overview(show) {
    if (Main.overview.visible === show)
        return Promise.resolve();
    return new Promise(resolve => {
        const id = Main.overview.connect(show ? 'shown' : 'hidden', () => {
            Main.overview.disconnect(id);
            resolve();
        });
        if (show)
            Main.overview.show();
        else
            Main.overview.hide();
    });
}

async function testOverview(ext) {
    const window = await testWindow();
    check('overview: test window appears', window);
    const pid = window.get_pid();

    await overview(true);
    check('overview: first-run hint shown', ext._settings.get_boolean('hint-shown'));

    const preview = await waitFor(() => findPreview(window));
    check('overview: preview found', preview);

    preview.showOverlay(false);
    check('overview: hovered preview is tracked', ext._previews.has(preview));

    const button = preview._closeButton;
    ext._setArmed(true);
    check('overview: armed X is visible', button.visible && button.opacity === 255);
    check('overview: armed X is coloured', /background-color/.test(button.get_style() ?? ''));
    ext._setArmed(false);
    check('overview: disarmed X is plain', !button.get_style());

    ext._setArmed(true);
    button.emit('clicked', 1);
    check('overview: armed X kills the process', await killed(window, pid));
    const source = await waitFor(() => Main.messageTray.getSources()
        .find(s => s.title === 'Control Kill' && s.notifications.length > 0));
    check('overview: notification comes from the Control Kill source', !!source);
    check('overview: notification names the app', !!source && source.notifications.some(n => n.title.length > 0));
    check('overview: the source carries the extension icon',
        source?.icon instanceof Gio.FileIcon && source.icon.get_file().get_basename() === 'control-kill-symbolic.svg');

    await overview(false);
    check('overview: closing the overview disarms', !ext._armed);
}

async function testKeyboard(ext) {
    const window = await testWindow();
    const pid = window.get_pid();

    await overview(true);
    const preview = await waitFor(() => findPreview(window));
    global.stage.set_key_focus(preview);

    const key = (type, symbol) => ({
        type: () => type,
        get_key_symbol: () => symbol,
        get_state: () => Clutter.ModifierType.CONTROL_MASK,
    });
    ext._onEvent(key(Clutter.EventType.KEY_PRESS, Clutter.KEY_Control_L));
    const stop = ext._onEvent(key(Clutter.EventType.KEY_PRESS, Clutter.KEY_Delete));
    check('keyboard: Ctrl+Delete is consumed', stop === Clutter.EVENT_STOP);
    check('keyboard: Ctrl+Delete kills the focused window', await killed(window, pid));
    ext._onEvent(key(Clutter.EventType.KEY_RELEASE, Clutter.KEY_Control_L));
    await overview(false);
}

async function testGraceful(ext) {
    const window = await testWindow();
    const pid = window.get_pid();

    ext._settings.set_boolean('graceful', true);
    await ext._forceQuit([window]);
    check('graceful: SIGTERM ends a responsive app', await killed(window, pid));
    ext._settings.reset('graceful');
}

async function testSoundFile(ext) {
    const bundled = ext.dir.resolve_relative_path('sounds/kill.oga').get_path();

    ext._settings.set_string('sound-file', '/nonexistent/control-kill.oga');
    check('sound: a missing custom file falls back to the bundled one',
        (await ext._killSound()).get_path() === bundled);

    const custom = ext.dir.resolve_relative_path('sounds/wake.wav').get_path();
    ext._settings.set_string('sound-file', custom);
    check('sound: an existing custom file is used', (await ext._killSound()).get_path() === custom);

    ext._settings.reset('sound-file');
    check('sound: no custom file plays the bundled one', (await ext._killSound()).get_path() === bundled);
}

async function testPlainClose() {
    const window = await testWindow();
    const pid = window.get_pid();

    await overview(true);
    const preview = await waitFor(() => findPreview(window));
    preview._deleteAll();
    check('plain close: X without Ctrl closes the window', await gone(window));
    check('plain close: and leaves the process alone', pidAlive(pid));
    await overview(false);
}

async function testAppMenu(ext) {
    const window = await testWindow();
    const pid = window.get_pid();
    const app = Shell.WindowTracker.get_default().get_window_app(window);

    const menu = new AppMenu(Main.panel, St.Side.TOP);
    menu.setApp(app);
    const items = menu._getMenuItems();
    const item = ext._menuItems.get(menu);
    forceQuitLabel = item?.label.text;
    check('app menu: Force Quit added', item);
    check('app menu: right after Quit', items.indexOf(item) === items.indexOf(menu._quitItem) + 1);
    check('app menu: visible for a running app', item?.visible);

    // Destroyed before the app stops: the shell's own GPU item cannot handle
    // a window-backed app like the helper going away.
    item.activate(null);
    menu.destroy();
    check('app menu: Force Quit kills the process', await killed(window, pid));
}

async function testCloseDialog() {
    const window = await testWindow();
    const pid = window.get_pid();

    new CloseDialog(window)._onClose();
    check('close dialog: Force Quit kills the process', await killed(window, pid));
    check('close dialog: the shell is still here', pidAlive(Number(GLib.file_read_link('/proc/self'))));
}

async function testDisable(ext) {
    const patched = [
        WindowPreview.prototype._deleteAll,
        AppMenu.prototype._updateQuitItem,
        CloseDialog.prototype._onClose,
    ];
    const items = [...ext._menuItems.values()];
    const source = ext._source;
    Main.extensionManager.disableExtension(UUID);
    // Shell 51 disables asynchronously; older releases are done on return.
    await waitFor(() => Main.extensionManager.lookup(UUID)?.state !== EXTENSION_ACTIVE);
    check('disable: menu items destroyed and released',
        ext._menuItems === null && items.every(i => !i.get_parent()));

    check('disable: the notification source is gone',
        ext._source === null && !(source && Main.messageTray.getSources().includes(source)));

    check('disable: shell methods restored', [
        WindowPreview.prototype._deleteAll,
        AppMenu.prototype._updateQuitItem,
        CloseDialog.prototype._onClose,
    ].every((method, i) => method !== patched[i]));

    const menu = new AppMenu(Main.panel, St.Side.TOP);
    menu.setApp(Shell.AppSystem.get_default().get_running()[0] ?? null);
    check('disable: no Force Quit item afterwards',
        forceQuitLabel && !menu._getMenuItems().some(i => i.label?.text === forceQuitLabel));
    menu.destroy();
}

async function main() {
    Main.extensionManager.enableExtension(UUID);
    const ext = await waitFor(() => {
        const stateObj = Main.extensionManager.lookup(UUID)?.stateObj;
        return stateObj?._settings ? stateObj : null;
    });
    check('enable: extension active', ext);
    if (!ext)
        return;

    await testOverview(ext);
    await testKeyboard(ext);
    await testGraceful(ext);
    await testSoundFile(ext);
    await testPlainClose();
    await testAppMenu(ext);
    await testCloseDialog();
    await testDisable(ext);
}

let started = false;

// The shell calls run() whenever the helper's bus name appears, and the tests
// restart the helper after killing it: only the first call runs. The killed
// helper would also fail the shell's own perf-script epilogue, so this
// reports and exits by itself.
export async function run() {
    if (started)
        return new Promise(() => {});
    started = true;

    try {
        await main();
    } catch (e) {
        check(`no exception (${e.message})\n${e.stack}`, false);
    }

    print(failures.length ? `\n${failures.length} FAILED` : '\nall passed');
    if (failures.length)
        Meta.exit(Meta.ExitCode.ERROR);
    else
        global.context.terminate();
    await new Promise(() => {});
}
