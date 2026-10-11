// SPDX-License-Identifier: GPL-3.0-or-later
//
// Exercises lib/process.js against the real user systemd and session bus.
// Needs a desktop session: run with `make test-integration`, not in CI.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

import * as Process from '../lib/process.js';

const APP_ID = 'org.controlkill.Test';
let failed = 0;

function check(what, ok) {
    print(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok)
        failed++;
}

function sleep(ms) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => resolve() ?? false));
}

function spawn(argv) {
    return Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
}

async function main() {
    const unit = `app-gnome-${APP_ID}-${GLib.random_int_range(10000, 99999)}.scope`;
    spawn(['systemd-run', '--user', '--scope', '--quiet', `--unit=${unit}`, 'sleep', '300']);
    await sleep(500);

    const units = await Process.appUnits(APP_ID);
    check('appUnits finds the scope', units.length === 1 && units[0] === unit);

    const [, cgroup] = GLib.spawn_command_line_sync(`systemctl --user show -P ControlGroup ${unit}`);
    const procs = `/sys/fs/cgroup${new TextDecoder().decode(cgroup).trim()}/cgroup.procs`;
    const pid = parseInt(new TextDecoder().decode(GLib.file_get_contents(procs)[1]), 10);
    check('pidUnit maps the process to its scope', await Process.pidUnit(pid) === unit);
    check('pidStartTime reads the process', await Process.pidStartTime(pid) !== null);
    check('ownPid is this process', Process.ownPid() === parseInt(GLib.file_read_link('/proc/self'), 10));
    check('this process is not the app', await Process.pidUnit(Process.ownPid()) !== unit);

    check('busNamePid resolves the bus daemon', await Process.busNamePid('org.freedesktop.DBus') > 0);
    check('busNamePid of a missing name is 0', await Process.busNamePid('org.controlkill.Missing') === 0);

    check('signalUnit SIGKILL', await Process.signalUnit(unit, Process.SIGKILL));
    await sleep(300);
    check('the scope is gone', (await Process.appUnits(APP_ID)).length === 0);
    check('signalUnit on a gone unit is false', !await Process.signalUnit(unit, Process.SIGKILL));

    const child = spawn(['sleep', '300']);
    const childPid = parseInt(child.get_identifier(), 10);
    check('signalPid SIGTERM', await Process.signalPid(childPid, Process.SIGTERM));
    await sleep(200);
    check('the process is gone', await Process.pidStartTime(childPid) === null);
    check('signalPid on a gone process is false', !await Process.signalPid(childPid, Process.SIGKILL));

    // A delayed signal must not reach a unit restarted under the same name,
    // nor a process that took over a PID.
    const name = `app-gnome-${APP_ID}-${GLib.random_int_range(10000, 99999)}.scope`;
    const scope = () => spawn(['systemd-run', '--user', '--scope', '--quiet', `--unit=${name}`, 'sleep', '300']);

    scope();
    await sleep(500);
    const first = await Process.pinUnit(name);
    check('pinUnit reads the invocation id', /^[\da-f]{32}$/.test(first?.invocation ?? ''));
    await Process.signalUnit(name, Process.SIGKILL);
    await sleep(300);

    scope();
    await sleep(500);
    const second = await Process.pinUnit(name);
    check('a restarted unit gets a new invocation id', second && second.invocation !== first.invocation);
    check('the old target misses the restarted unit', !await Process.signalTarget(first, Process.SIGKILL));
    await sleep(300);
    check('the restarted unit survived', await Process.unitInvocation(name) === second.invocation);
    check('its own target reaches it', await Process.signalTarget(second, Process.SIGKILL));
    await sleep(300);
    check('and then it is gone', await Process.unitInvocation(name) === null);

    const victim = spawn(['sleep', '300']);
    const pinned = await Process.pinPid(parseInt(victim.get_identifier(), 10));
    victim.force_exit();
    await sleep(200);
    check('a PID target misses a dead process', !await Process.signalTarget(pinned, Process.SIGKILL));
}

const loop = new GLib.MainLoop(null, false);
main().catch(e => {
    print(`FAIL ${e}\n${e.stack}`);
    failed++;
}).finally(() => loop.quit());
loop.run();
System.exit(failed ? 1 : 0);
