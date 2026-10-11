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

const GRACE_MS = 3000;
const BUS_NAME = /^[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*)+$/;

const pending = new Set();

function usable(pid, shell) {
    return Number.isInteger(pid) && pid > 1 && pid !== shell.pid;
}

/**
 * Where the signal goes: the app's systemd unit when the process lives in
 * one started for this very app (that takes its helpers along), else the
 * process itself. Null when nothing trustworthy is found.
 */
async function resolve(window, appId, shell) {
    let pid = window.get_pid();
    if (!usable(pid, shell) && appId && BUS_NAME.test(appId))
        pid = await Process.busNamePid(appId);

    if (usable(pid, shell)) {
        const unit = await Process.pidUnit(pid);
        const pinned = unit && isAppUnit(unit, appId) ? await Process.pinUnit(unit) : null;
        return pinned ?? Process.pinPid(pid);
    }

    const units = appId ? await Process.appUnits(appId) : [];
    return units.length === 1 ? Process.pinUnit(units[0]) : null;
}

function send(target, signal, shell) {
    if (target.unit === shell.unit || target.pid === shell.pid)
        return false;
    return Process.signalTarget(target, signal);
}

async function terminate(target, graceful, shell) {
    if (!graceful)
        return send(target, Process.SIGKILL, shell);

    if (!await send(target, Process.SIGTERM, shell))
        return false;

    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, GRACE_MS, () => {
        pending.delete(id);
        send(target, Process.SIGKILL, shell);
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
    const shell = {pid: Process.ownPid()};
    shell.unit = await Process.pidUnit(shell.pid);

    for (const window of windows) {
        const app = Shell.WindowTracker.get_default().get_window_app(window);
        const appId = app?.get_id()?.replace(/\.desktop$/, '') ?? null;
        const name = app?.get_name() ?? window.get_title();
        const target = await resolve(window, appId, shell);

        if (!target) {
            console.log(`[control-kill] no trustworthy process for "${name}", asking it to close`);
            window.delete(global.get_current_time());
            continue;
        }

        const key = target.unit ?? `${target.pid}:${target.start}`;
        if (done.has(key))
            continue;

        if (await terminate(target, graceful, shell)) {
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
