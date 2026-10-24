/**
 * Assembles `build/app/`, the directory electron-builder packages, then runs electron-builder.
 *
 * The workspace's pnpm layout (symlinked packages) is not what an installed app should carry, so
 * the app directory is built flat: the app code, the release notes, the staged Cortico copy, a `package.json` with
 * only the runtime dependencies installed by npm, and the three workspace packages copied into
 * `node_modules/` as real directories.
 *
 * Run: `pnpm run build:installer` (builds build/cortico first). Output: `dist/Coopanion-Setup-<version>.exe` on
 * Windows, `dist/Coopanion-<version>-mac-<arch>.dmg` and `.zip` on a Mac, `dist/Coopanion-<version>-linux-x64.AppImage`
 * and `.deb` on Linux. `COOPANION_CHANNEL=portable` (Windows) builds the portable zip instead,
 * `dist/Coopanion-<version>-win-x64-portable.zip`: the app directory to unpack anywhere, without the updater (app/channel.cjs).
 * `PACK_ARCH` (x64 or arm64) builds for
 * another architecture than the machine's: npm installs that architecture's native packages (esbuild, sherpa-onnx) and
 * electron-builder packs that Electron, so one Apple silicon Mac builds both Mac downloads.
 *
 * electron-builder runs with build/app as its project directory and that `package.json` names npm
 * (scripts/pack-builder.ts): from the repository it detected pnpm and shipped the workspace's own copies instead.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { slimTree } from './png-slim.ts';
import { stripMapComments } from './map-strip.ts';
import { builderArgs, packageManagerField, packChannel, PROJECT_DIR, runtimeDeps, type PackChannel } from './pack-builder.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
/** build/app, electron-builder's project directory */
const OUT = join(ROOT, ...PROJECT_DIR.split('/'));
const run = (cmd: string, args: string[], cwd: string) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const ARCH = process.env.PACK_ARCH || process.arch;
let CHANNEL: PackChannel;
try {
  CHANNEL = packChannel(process.env, process.platform);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, unknown> & { version: string };
const WORKSPACE = ['cortico-world-desktop-pet', 'cortico-world-cua', 'cortico-provider-coo'];
/** Runtime dependencies (pack-builder.ts runtimeDeps: no updater in the portable build) and the workspace packages' own. */
const DEPS: Record<string, string> = runtimeDeps(CHANNEL);
for (const name of WORKSPACE) {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'packages', name, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
  Object.assign(DEPS, pkg.dependencies ?? {});
}

const skip = (base: string) => (src: string) => {
  const rel = relative(base, src).split(sep);
  // the top-level extensions/ of the staged Cortico is a junction to the developer's own data
  if (rel[0] === 'extensions') return false;
  // .cache: e.g. the pet's scripts/speech-bank/.cache/, raw TTS recordings that build.py keeps (gitignored, not shipped)
  if (rel.some((p) => ['node_modules', '.git', 'tests', 'scratch', '.cache'].includes(p))) return false;
  // source maps of the WebUI bundles (build/cortico/dist, the pet's dist/): nothing loads them but DevTools
  return !src.endsWith('.map');
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, 'app'), join(OUT, 'app'), { recursive: true });
cpSync(join(ROOT, 'core'), join(OUT, 'core'), { recursive: true });
// the coopanion World (core/notice.ts) tells Coo these after an update
cpSync(join(ROOT, 'docs', 'releases'), join(OUT, 'docs', 'releases'), { recursive: true });
cpSync(join(ROOT, 'build', 'cortico'), join(OUT, 'build', 'cortico'), { recursive: true, filter: skip(join(ROOT, 'build', 'cortico')) });
writeFileSync(join(OUT, 'package.json'), JSON.stringify({
  name: rootPkg.name, productName: rootPkg.productName, version: rootPkg.version, description: rootPkg.description,
  license: rootPkg.license, author: rootPkg.author, homepage: rootPkg.homepage, type: 'module', main: 'app/main.cjs',
  // electron-builder then collects build/app/node_modules with `npm list`, not the root's pnpm workspace
  packageManager: packageManagerField(spawnSync('npm', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).stdout),
  dependencies: DEPS,
  // the build's channel, read by app/channel.cjs
  coopanion: { channel: CHANNEL },
}, null, 2));
run('npm', ['install', '--omit=dev', '--no-package-lock', '--no-audit', '--no-fund', '--loglevel=error', `--os=${process.platform}`, `--cpu=${ARCH}`], OUT);
const manifest = JSON.parse(readFileSync(join(OUT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
for (const name of WORKSPACE) {
  const from = join(ROOT, 'packages', name);
  cpSync(from, join(OUT, 'node_modules', name), { recursive: true, filter: skip(from) });
  // listed only now: npm must not fetch them, but electron-builder ships only listed dependencies
  manifest.dependencies[name] = (JSON.parse(readFileSync(join(from, 'package.json'), 'utf8')) as { version: string }).version;
}
writeFileSync(join(OUT, 'package.json'), JSON.stringify(manifest, null, 2));
// the bundles whose .map was left out above no longer point at it (no missing-map warning in DevTools)
stripMapComments(join(OUT, 'build', 'cortico'));
for (const name of WORKSPACE) stripMapComments(join(OUT, 'node_modules', name));
// the figure textures, in the staged copy only (the repository's art stays byte for byte what scratch/ builds):
// colour under fully transparent pixels zeroed and recompressed, every visible pixel unchanged (scripts/png-slim.ts).
// PACK_PNG_SLIM=0 skips it for a quicker local build.
if (process.env.PACK_PNG_SLIM !== '0') {
  const t = Date.now(), s = await slimTree(join(OUT, 'node_modules', 'cortico-world-desktop-pet', 'web'));
  const mb = (n: number) => (n / 1e6).toFixed(1);
  console.log(`figure PNGs: ${s.changed}/${s.files} smaller, ${mb(s.before)} MB → ${mb(s.after)} MB (${((Date.now() - t) / 1000).toFixed(0)} s)`);
}
console.log(`app directory ready: ${relative(ROOT, OUT)}`);

run(join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'), builderArgs(process.platform, ARCH, process.argv.slice(2), CHANNEL), ROOT);
