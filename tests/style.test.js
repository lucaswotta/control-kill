// SPDX-License-Identifier: GPL-3.0-or-later

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {DEFAULT_COLOR, buttonStyle, parseHex} from '../lib/style.js';

test('parseHex', () => {
    assert.deepEqual(parseHex('#c01c28'), [192, 28, 40]);
    assert.deepEqual(parseHex('FFFFFF'), [255, 255, 255]);
    assert.equal(parseHex('#fff'), null);
    assert.equal(parseHex(null), null);
});

test('dark fill gets white text, light fill gets black', () => {
    assert.match(buttonStyle(DEFAULT_COLOR, false), /color: #ffffff/);
    assert.match(buttonStyle('#f6d32d', false), /color: #000000/);
});

test('invalid colour falls back to the default', () => {
    assert.equal(buttonStyle('nope', false), buttonStyle(DEFAULT_COLOR, false));
});

test('hover changes only the fill', () => {
    const [plain, hover] = [buttonStyle(DEFAULT_COLOR, false), buttonStyle(DEFAULT_COLOR, true)];
    assert.notEqual(plain, hover);
    assert.equal(plain.split(';').slice(1).join(';'), hover.split(';').slice(1).join(';'));
});
