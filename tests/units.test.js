// SPDX-License-Identifier: GPL-3.0-or-later

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {isAppUnit, startTimeFromStat, unescapeUnit, unitAppId, unitFromCgroup} from '../lib/units.js';

test('unescapeUnit', () => {
    assert.equal(unescapeUnit('google\\x2dchrome'), 'google-chrome');
    assert.equal(unescapeUnit('org.gnome.Calculator'), 'org.gnome.Calculator');
});

test('unitAppId: app units', () => {
    const cases = {
        'app-gnome-org.gnome.Calculator-4242.scope': 'org.gnome.Calculator',
        'app-gnome-google\\x2dchrome-18836.scope': 'google-chrome',
        'app-com.google.Chrome-18836.scope': 'com.google.Chrome',
        'app-flatpak-org.gimp.GIMP-77.scope': 'org.gimp.GIMP',
        'app-gnome-at\\x2dspi\\x2ddbus\\x2dbus-18134.scope': 'at-spi-dbus-bus',
        'dbus-:1.2-org.gnome.Nautilus@0.service': 'org.gnome.Nautilus',
        'app-gnome\\x2dkeyring\\x2dpkcs11@autostart.service': 'gnome-keyring-pkcs11',
    };
    for (const [unit, id] of Object.entries(cases))
        assert.equal(unitAppId(unit), id, unit);
});

test('unitAppId: never the session itself', () => {
    for (const unit of [
        'org.gnome.Shell@wayland.service',
        'session.slice',
        'user@1000.service',
        'vte-spawn-0b3c.scope',
        'gnome-terminal-server.service',
        'app.slice',
    ])
        assert.equal(unitAppId(unit), null, unit);
});

test('unitFromCgroup', () => {
    const base = '0::/user.slice/user-1000.slice/user@1000.service';
    assert.equal(unitFromCgroup(`${base}/app.slice/app-gnome-org.gnome.Calculator-4242.scope\n`),
        'app-gnome-org.gnome.Calculator-4242.scope');
    assert.equal(unitFromCgroup(`${base}/session.slice/org.gnome.Shell@wayland.service\n`),
        'org.gnome.Shell@wayland.service');
    assert.equal(unitFromCgroup(`${base}/app.slice/app-x-1.scope/nested\n`), 'app-x-1.scope');
    assert.equal(unitFromCgroup('12:pids:/\n'), null);
});

test('startTimeFromStat survives odd command names', () => {
    const tail = 'S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 424242 20 21';
    assert.equal(startTimeFromStat(`123 (gnome-shell) ${tail}`), '424242');
    assert.equal(startTimeFromStat(`123 (a) b (c) ${tail}`), '424242');
});

test('isAppUnit: an unknown app owns nothing', () => {
    // A process started from a terminal lives in the terminal's scope. Without
    // an app id it must not match, or the terminal would be killed with it.
    assert.equal(isAppUnit('vte-spawn-c78869dd.scope', null), false);
    assert.equal(isAppUnit('org.gnome.Shell@wayland.service', null), false);
    assert.equal(isAppUnit('app-gnome-org.gnome.Calculator-4242.scope', null), false);
    assert.equal(isAppUnit('app-gnome-org.gnome.Calculator-4242.scope', 'org.gnome.Calculator'), true);
    assert.equal(isAppUnit('app-gnome-org.gnome.Calculator-4242.scope', 'org.gnome.Weather'), false);
});
