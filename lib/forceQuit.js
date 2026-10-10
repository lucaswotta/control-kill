// SPDX-License-Identifier: GPL-3.0-or-later
//
// Turning a window into something safe to signal.
//
// Never Meta.Window.kill(): mutter runs kill(pid, 9) on whatever
// meta_window_get_pid() says, and for some Wayland windows that is the
// compositor itself. Never _NET_WM_PID either: sandboxed X11 clients write the
// PID from their own namespace. The README has the details.

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Process from './process.js';
import {isAppUnit} from './units.js';

const SHELL_PID = Process.ownPid();
const SHELL_UNIT = Process.pidUnit(SHELL_PID);
const GRACE_MS = 3000;
const BUS_NAME = /^[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*)+$/;

const pending = new Set();

function usable(pid) {
    return Number.isInteger(pid) && pid > 1 && pid !== SHELL_PID;
}

/**
 * Where the signal goes: the app's systemd unit when the process lives in
 * one started for this very app (that takes its helpers along), else the
 * process itself. Null when nothing trustworthy is found.
 */
async function resolve(window, appId) {
    let pid = window.get_pid();
    if (!usable(pid) && appId && BUS_NAME.test(appId))
        pid = await Process.busNamePid(appId);

    if (usable(pid)) {
        const unit = Process.pidUnit(pid);
        if (unit && isAppUnit(unit, appId))
            return {unit};
        const start = Process.pidStartTime(pid);
        return start ? {pid, start} : null;
    }

    const units = appId ? await Process.appUnits(appId) : [];
    return units.length === 1 ? {unit: units[0]} : null;
}

function send(target, signal) {
    if (target.unit)
        return target.unit === SHELL_UNIT ? false : Process.signalUnit(target.unit, signal);

    // The start time check catches a PID reused since it was resolved.
    if (target.pid === SHELL_PID || Process.pidStartTime(target.pid) !== target.start)
        return false;
    return Process.signalPid(target.pid, signal);
}

async function terminate(target, graceful) {
    if (!graceful)
        return send(target, Process.SIGKILL);

    if (!await send(target, Process.SIGTERM))
        return false;

    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, GRACE_MS, () => {
        pending.delete(id);
        send(target, Process.SIGKILL);
        return GLib.SOURCE_REMOVE;
    });
    pending.add(id);
    return true;
}

/**
 * Force quit the apps behind some windows. A process or unit is signalled
 * once, however many of its windows are passed. A window with no trustworthy
 * target only gets a close request.
 *
 * @returns {Promise<string[]>} names of the apps signalled
 */
export async function forceQuit(windows, {graceful = false} = {}) {
    const done = new Map();

    for (const window of windows) {
        const app = Shell.WindowTracker.get_default().get_window_app(window);
        const appId = app?.get_id()?.replace(/\.desktop$/, '') ?? null;
        const name = app?.get_name() ?? window.get_title();
        const target = await resolve(window, appId);

        if (!target) {
            console.log(`[control-kill] no trustworthy process for "${name}", asking it to close`);
            window.delete(global.get_current_time());
            continue;
        }

        const key = target.unit ?? `${target.pid}:${target.start}`;
        if (done.has(key))
            continue;

        if (await terminate(target, graceful)) {
            console.log(`[control-kill] ${graceful ? 'SIGTERM' : 'SIGKILL'} ${target.unit ?? target.pid} ("${name}")`);
            done.set(key, name);
        }
    }

    return [...new Set(done.values())];
}

export function cancelPending() {
    for (const id of pending)
        GLib.source_remove(id);
    pending.clear();
}
