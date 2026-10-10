// SPDX-License-Identifier: GPL-3.0-or-later

export const DEFAULT_COLOR = '#c01c28';

export function parseHex(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex ?? '');
    return m ? [m[1], m[2], m[3]].map(c => parseInt(c, 16)) : null;
}

/**
 * Inline style for an armed close button. Text and border are derived from
 * the fill, so any colour the user picks stays readable.
 */
export function buttonStyle(hex, hovered) {
    const rgb = parseHex(hex) ?? parseHex(DEFAULT_COLOR);
    const light = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 > 0.6;
    const toward = light ? 0 : 255;
    const mix = amount => rgb.map(c => Math.round(c + (toward - c) * amount));

    return `background-color: rgb(${(hovered ? mix(0.18) : rgb).join(',')}); ` +
        `color: ${light ? '#000000' : '#ffffff'}; ` +
        `border: 2px solid rgb(${mix(0.45).join(',')});`;
}
