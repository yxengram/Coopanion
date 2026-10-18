/**
 * The build's channel, `coopanion.channel` in the app's package.json (written by scripts/pack.ts), and what it
 * changes in the main process (app/main.cjs):
 * - `github` (the default, also from source): the installers. On Windows the data is `data\` beside the program, found
 *   again through the data-location record when the program moved (data-dir.cjs); the Windows build and the AppImage
 *   update themselves (updater.cjs).
 * - `portable`: the Windows zip (upstream #237), run from wherever it is unpacked. Its data is always `data\` beside
 *   the program, with no data-location record and no recovery of data an older update left behind, so a folder
 *   copied whole is a second pet. It does not run the updater (the settings window's version line links to a newer
 *   release instead) and is updated by hand. Its login item is named after its folder, so each copy has its own.
 *   Extensions install in pnpm's hoisted layout: the default one strings dependencies together with absolute
 *   junctions on Windows, which a copied folder turns into plain folders the extension no longer finds them through.
 */

const CHANNELS = ['github', 'portable'];

/** The channel named in the app's package.json (parsed), `github` when there is none or it is not one. */
function buildChannel(manifest) {
  const channel = manifest?.coopanion?.channel;
  return CHANNELS.includes(channel) ? channel : 'github';
}

/**
 * What the channel decides, for one start:
 * - `installed`: the Windows installed build, whose data directory data-dir.cjs finds (record, stranded-data recovery);
 * - `besideOnly`: the packaged portable build on Windows, whose data directory is always `data\` beside the program;
 * - `selfUpdate`: whether the updater runs (and the version line shows its steps);
 * - `loginName`: the login item's name, null for Electron's default (the app's id);
 * - `coreEnv`: extra environment for the Core (pnpm's layout for extension installs).
 */
function channelRules({ channel, platform, isPackaged, dataOverride, canUpdate, programDir }) {
  const portable = channel === 'portable';
  return {
    installed: isPackaged && platform === 'win32' && !portable && !dataOverride,
    // the packaged portable build on Windows, whose data is always data\ beside the program
    besideOnly: isPackaged && platform === 'win32' && portable && !dataOverride,
    selfUpdate: !portable && canUpdate,
    // only Windows names login items; elsewhere Electron ignores the name and has no launchItems to read back
    loginName: portable && platform === 'win32' ? `Coopanion ${programDir}` : null,
    coreEnv: portable ? { pnpm_config_node_linker: 'hoisted' } : {},
  };
}

/**
 * Whether the login item is on. Windows reads `openAtLogin` back as true only for the value named after the app's id
 * and with the arguments it was set with; a named one (the portable build) is found among `launchItems`.
 */
function loginItemOn(settings, loginName) {
  if (!loginName) return !!settings.openAtLogin;
  return (settings.launchItems ?? []).some((item) => item.name === loginName);
}

module.exports = { CHANNELS, buildChannel, channelRules, loginItemOn };
