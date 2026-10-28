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
export const builderArgs = (platform: NodeJS.Platform, arch: string, extra: string[], channel: PackChannel = 'github'): string[] => [
  platform === 'darwin' ? '--mac' : platform === 'linux' ? '--linux' : '--win',
  // the portable build asks for the zip target only (win.artifactName names it); the installer's nsis is left out
  ...channel === 'portable' ? ['zip'] : [],
  `--${arch}`,
  '--projectDir', PROJECT_DIR,
  '--config', CONFIG,
  '--publish', 'never',
  ...extra,
];

/**
 * The build's channel (app/channel.cjs): `github`, the installers, or with `COOPANION_CHANNEL=portable` the Windows
 * portable zip (upstream #237). Written into build/app/package.json as `coopanion.channel`.
 */
export type PackChannel = 'github' | 'portable';

/** The channel `COOPANION_CHANNEL` asks for on this platform; throws (with the reason) for one that cannot be built here. */
export const packChannel = (env: NodeJS.ProcessEnv, platform: NodeJS.Platform): PackChannel => {
  const asked = env.COOPANION_CHANNEL?.trim() || 'github';
  if (asked !== 'github' && asked !== 'portable') throw new Error(`COOPANION_CHANNEL=${asked}: 只有 github(默认)和 portable`);
  if (asked === 'portable' && platform !== 'win32') throw new Error('便携版只在 Windows 上构建');
  return asked;
};

/**
 * The runtime dependencies of build/app beyond the workspace packages' own: Core (express, ws, undici for the per-host
 * system proxy, core/system-proxy.ts), the TypeScript loader, pnpm for extension installs, and the updater
 * (app/updater.cjs), which the portable build, updated by hand, does not carry.
 */
export const runtimeDeps = (channel: PackChannel): Record<string, string> => ({
  express: '^4.22.3', ws: '^8.21.3', undici: '7.29.1', tsx: '^4.23.15', pnpm: '11.28.6',
  ...channel === 'portable' ? {} : { 'electron-updater': '^6.8.9' },
});

/**
 * The workspace packages' own npm dependencies, for build/app/package.json. One workspace package depending on
 * another (the desktop pet on cortico-provider-coo's `src/address.ts`, upstream #380) is left out: npm cannot fetch
 * a `workspace:` version, and pack.ts copies every workspace package into node_modules itself.
 */
export const workspaceDeps = (workspace: readonly string[], manifests: ReadonlyArray<{ dependencies?: Record<string, string> }>): Record<string, string> => {
  const deps: Record<string, string> = {};
  for (const pkg of manifests) for (const [dep, version] of Object.entries(pkg.dependencies ?? {})) if (!workspace.includes(dep)) deps[dep] = version;
  return deps;
};
