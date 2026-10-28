/**
 * The command the desktop-pet World starts the pet's window with (`CORTICO_DESKTOP_PET_HOST`, upstream #378): this
 * executable (with the app directory when run from source) and `--pet-host`, plus the switches the app itself was
 * started with, so a Chromium switch on the shortcut (`--disable-gpu-compositing`, `--no-sandbox`) reaches the pet's
 * window process too. Only arguments starting with `--` are passed (not macOS's `-psn_…`, not the app directory);
 * switches that open a debugging port are left out, since a second process cannot take the same port, and so are
 * `--pet-url=` and `--parent-pid=`: the World appends its own, and the pet-host mode reads the first of each. Apart from
 * Electron so it can be tested (tests/pet-host-command.test.js).
 */

/** Switches that bind a port of their own: `--inspect`, `--inspect-brk`, `--inspect-port`, `--remote-debugging-port`. */
const PORT_SWITCH = /^--(inspect(-brk|-port)?|remote-debugging-port)(=|$)/;
/** The pet-host mode's own switches, which only the World sets. */
const PET_HOST_SWITCH = /^--(pet-host|pet-url|parent-pid)(=|$)/;

/**
 * @param {{ execPath: string, appRoot: string, packaged: boolean, argv: string[] }} app `argv` is process.argv:
 *   the executable, then (from source) the app directory, then the arguments.
 * @returns {string[]}
 */
function petHostCommand({ execPath, appRoot, packaged, argv }) {
  const switches = argv.slice(packaged ? 1 : 2).filter((a) => a.startsWith('--') && !PET_HOST_SWITCH.test(a) && !PORT_SWITCH.test(a));
  return [execPath, ...packaged ? [] : [appRoot], ...switches, '--pet-host'];
}

module.exports = { petHostCommand };
