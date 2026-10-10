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
