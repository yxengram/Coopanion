/**
 * Checks the Windows portable zip that `COOPANION_CHANNEL=portable pnpm run build:installer` made (upstream #237), so
 * the release workflow's portable job, also when run by hand as a dry run, fails on a zip that would not behave as
 * the portable build:
 * - it is `dist/Coopanion-<version>-win-x64-portable.zip` (the name the publish step and the README give);
 * - `Coopanion.exe` sits at the top of the zip, so it is in the folder the zip is unpacked into;
 * - the app's package.json says channel `portable` and the version (app/channel.cjs reads it), and app/channel.cjs is in;
 * - there is no updater (`node_modules/electron-updater`): the portable build is updated by hand;
 * - nothing in dist/ is update information (`latest.yml`) for it, which would put it in the automatic updates and,
 *   merged with the installer job's files, overwrite the installer's.
 *
 * The checks; `scripts/verify-portable.ts [dist directory]` runs them (default `dist`).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';

const APP = 'resources/app/';

/** The zip's file name for a version. */
export const portableZipName = (version: string): string => `Coopanion-${version}-win-x64-portable.zip`;

/**
 * The problems with a portable zip, given its entry names, the app's package.json text (null when missing) and the
 * other files in dist/; empty when there are none.
 */
export function portableProblems(at: { version: string; names: string[]; manifest: string | null; distFiles: string[] }): string[] {
  const problems: string[] = [];
  const names = new Set(at.names.map((n) => n.replace(/\\/g, '/')));
  if (!names.has('Coopanion.exe')) problems.push('Coopanion.exe is not at the top of the zip');
  if (!names.has(`${APP}app/channel.cjs`)) problems.push(`${APP}app/channel.cjs is missing`);
  if ([...names].some((n) => n.startsWith(`${APP}node_modules/electron-updater/`))) problems.push('the zip carries electron-updater');
  if (at.manifest === null) problems.push(`${APP}package.json is missing`);
  else {
    let pkg: { version?: unknown; coopanion?: { channel?: unknown }; dependencies?: Record<string, string> } = {};
    try { pkg = JSON.parse(at.manifest); } catch { problems.push(`${APP}package.json is not JSON`); }
    if (pkg.coopanion?.channel !== 'portable') problems.push(`channel is ${JSON.stringify(pkg.coopanion?.channel)}, not "portable"`);
    if (pkg.version !== at.version) problems.push(`version is ${JSON.stringify(pkg.version)}, not ${at.version}`);
    if (pkg.dependencies?.['electron-updater']) problems.push('package.json lists electron-updater');
  }
  for (const file of at.distFiles) if (/^latest.*\.yml$/.test(file)) problems.push(`dist/${file} is update information`);
  return problems;
}

/** Reads the zip in `dist` for `version` and returns its problems. */
export function verifyPortable(dist: string, version: string): string[] {
  const zip = join(dist, portableZipName(version));
  if (!existsSync(zip)) return [`${zip} does not exist`];
  const names: string[] = [];
  const files = unzipSync(readFileSync(zip), {
    filter: (entry) => { names.push(entry.name); return entry.name === `${APP}package.json`; },
  });
  const manifest = files[`${APP}package.json`];
  return portableProblems({
    version, names, manifest: manifest ? new TextDecoder().decode(manifest) : null, distFiles: readdirSync(dist),
  });
}
