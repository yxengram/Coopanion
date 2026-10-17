/**
 * How scripts/pack.ts hands build/app to electron-builder.
 *
 * electron-builder copies the app's `node_modules` with the collector of the package manager it detects, and it
 * detects that from the project directory (app-builder-lib `determinePackageManagerEnv`, run before
 * `directories.app` is read). Run from the repository, it found the root's `packageManager: pnpm@…`, took
 * `pnpm list` of the workspace and copied the three workspace packages from `packages/*` (unslimmed figure PNGs,
 * source maps) and the other dependencies from the root's `node_modules/.pnpm`: lockfile versions instead of
 * npm's, fsevents, and the build machine's native packages next to the target's (a PACK_ARCH=x64 build on Apple
 * silicon carried both darwin-arm64 and darwin-x64 esbuild, koffi and sherpa-onnx).
 *
 * So build/app is the project directory, and its `package.json` names npm: the npm collector (`npm list`) reads
 * build/app/node_modules exactly as pack.ts assembled it. Paths in electron-builder.yml are relative to build/app.
 */
/** The `packageManager` field of build/app/package.json (`npm --version` output); electron-builder only reads the name. */
export const packageManagerField = (npmVersion: string | null | undefined): string => {
  const v = (npmVersion ?? '').trim();
  return v ? `npm@${v}` : 'npm';
};

/** The project directory, relative to the repository (electron-builder runs there and resolves it against its cwd). */
export const PROJECT_DIR = 'build/app';
/** The config, relative to the project directory (electron-builder resolves `--config` against it). */
export const CONFIG = '../../electron-builder.yml';

/**
 * electron-builder's arguments, run from the repository: build/app as the project, the repository's
 * electron-builder.yml as the config. Relative, so the Windows shell (pack.ts spawns the .cmd with shell: true,
 * which does not quote) never sees a path with spaces.
 */
export const builderArgs = (platform: NodeJS.Platform, arch: string, extra: string[]): string[] => [
  platform === 'darwin' ? '--mac' : platform === 'linux' ? '--linux' : '--win',
  `--${arch}`,
  '--projectDir', PROJECT_DIR,
  '--config', CONFIG,
  '--publish', 'never',
  ...extra,
];
