// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {isAppUnit, startTimeFromStat, unitFromCgroup} from './units.js';

Gio._promisify(Gio.DBusConnection.prototype, 'call');
Gio._promisify(Gio.Subprocess.prototype, 'wait_check_async');

export const SIGTERM = 15;
export const SIGKILL = 9;

const SIGNAL_NAMES = {[SIGTERM]: 'TERM', [SIGKILL]: 'KILL'};
const DBUS_TIMEOUT_MS = 1000;

function readText(path) {
    try {
        const [, bytes] = GLib.file_get_contents(path);
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

export function ownPid() {
    return parseInt(GLib.file_read_link('/proc/self'), 10);
}

export function pidUnit(pid) {
    const text = readText(`/proc/${pid}/cgroup`);
    return text ? unitFromCgroup(text) : null;
}

/** Identifies a process across PID reuse. */
export function pidStartTime(pid) {
    const text = readText(`/proc/${pid}/stat`);
    return text ? startTimeFromStat(text) : null;
}

async function call(dest, path, iface, method, args, replyType) {
    const reply = await Gio.DBus.session.call(dest, path, iface, method, args,
        replyType ? new GLib.VariantType(replyType) : null,
        Gio.DBusCallFlags.NONE, DBUS_TIMEOUT_MS, null);
    return reply.deepUnpack();
}

function systemd(method, args, replyType) {
    return call('org.freedesktop.systemd1', '/org/freedesktop/systemd1',
        'org.freedesktop.systemd1.Manager', method, args, replyType);
}

/**
 * PID of the process owning a bus name. The bus daemon answers, not the app,
 * so this works while the app is hung.
 */
export async function busNamePid(name) {
    try {
        const [pid] = await call('org.freedesktop.DBus', '/org/freedesktop/DBus',
            'org.freedesktop.DBus', 'GetConnectionUnixProcessID',
            new GLib.Variant('(s)', [name]), '(u)');
        return pid;
    } catch {
        return 0;
    }
}

/** Active systemd units started for an app id. */
export async function appUnits(appId) {
    try {
        const [units] = await systemd('ListUnitsByPatterns',
            new GLib.Variant('(asas)', [['active'], ['app-*', 'dbus-*']]), '(a(ssssssouso))');
        return units.map(u => u[0]).filter(unit => isAppUnit(unit, appId));
    } catch {
        return [];
    }
}

/** Changes on every start of a unit: tells a restarted unit from the old one. */
export async function unitInvocation(unit) {
    try {
        const [path] = await systemd('GetUnit', new GLib.Variant('(s)', [unit]), '(o)');
        const [id] = await call('org.freedesktop.systemd1', path, 'org.freedesktop.DBus.Properties',
            'Get', new GLib.Variant('(ss)', ['org.freedesktop.systemd1.Unit', 'InvocationID']), '(v)');
        return [...id.deepUnpack()].map(b => b.toString(16).padStart(2, '0')).join('') || null;
    } catch {
        return null;
    }
}

// A target is pinned to one incarnation of a process or unit, so a signal
// sent later never reaches whatever took over its PID or unit name.

export function pinPid(pid) {
    const start = pidStartTime(pid);
    return start ? {pid, start} : null;
}

export async function pinUnit(unit) {
    const invocation = await unitInvocation(unit);
    return invocation ? {unit, invocation} : null;
}

/** Resolves false if the target is gone or something else answers to its name. */
export async function signalTarget(target, signal) {
    if (target.unit) {
        if (await unitInvocation(target.unit) !== target.invocation)
            return false;
        return signalUnit(target.unit, signal);
    }
    if (pidStartTime(target.pid) !== target.start)
        return false;
    return signalPid(target.pid, signal);
}

/** Signal every process in a unit. Resolves false if the unit is gone. */
export async function signalUnit(unit, signal) {
    try {
        await systemd('KillUnit', new GLib.Variant('(ssi)', [unit, 'all', signal]), null);
        return true;
    } catch {
        return false;
    }
}

/** Resolves false if the process is gone or not ours. */
export async function signalPid(pid, signal) {
    try {
        const proc = Gio.Subprocess.new(['kill', '-s', SIGNAL_NAMES[signal], `${pid}`],
            Gio.SubprocessFlags.STDERR_SILENCE);
        await proc.wait_check_async(null);
        return true;
    } catch {
        return false;
    }
}
