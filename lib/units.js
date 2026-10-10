// SPDX-License-Identifier: GPL-3.0-or-later
//
// Mapping between apps and the systemd units GNOME starts them in:
//
//   app-gnome-org.gnome.Calculator-4242.scope   launched from the shell
//   app-flatpak-org.gimp.GIMP-4242.scope        launched by flatpak
//   dbus-:1.2-org.gnome.Nautilus@0.service      D-Bus activated
//
// Unit names escape '-' inside a component as \x2d, so splitting on '-' is
// safe.

/** "google\x2dchrome" -> "google-chrome" */
export function unescapeUnit(s) {
    return s.replace(/\\x([\da-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** The app id a unit was started for, or null when it is not an app unit. */
export function unitAppId(unit) {
    const m = /^(?:app|dbus)-(.+)\.(?:scope|service)$/.exec(unit);
    if (!m)
        return null;

    const parts = m[1].split('-');
    if (parts.length > 1 && /^\d+$/.test(parts.at(-1)))
        parts.pop();
    const id = unescapeUnit(parts.at(-1).replace(/@.*$/, ''));
    return id || null;
}

/** The unit owning a process, from the text of /proc/<pid>/cgroup (v2). */
export function unitFromCgroup(text) {
    const line = text.split('\n').find(l => l.startsWith('0::'));
    if (!line)
        return null;
    const unit = line.slice(3).split('/').reverse().find(c => /\.(?:scope|service)$/.test(c));
    return unit ?? null;
}

/** Start time of a process, from the text of /proc/<pid>/stat. */
export function startTimeFromStat(text) {
    // The command name may contain spaces and parentheses; fields after it may not.
    const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
    return fields[19] ?? null;
}

/** True when a unit was started for this app. An unknown app owns nothing. */
export function isAppUnit(unit, appId) {
    return Boolean(appId) && unitAppId(unit) === appId;
}
