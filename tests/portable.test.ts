/**
 * The Windows portable zip (upstream #237): the channel the app reads (app/channel.cjs) and how main.cjs uses it, the
 * build (scripts/pack-builder.ts, electron-builder.yml), the zip check (scripts/portable-zip.ts) and the release
 * workflow that builds, checks and publishes it.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { builderArgs, packChannel, runtimeDeps } from '../scripts/pack-builder.ts';
import { portableProblems, portableZipName, verifyPortable } from '../scripts/portable-zip.ts';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

interface Rules { installed: boolean; besideOnly: boolean; selfUpdate: boolean; loginName: string | null; coreEnv: Record<string, string> }
const { buildChannel, channelRules, loginItemOn } = require('../app/channel.cjs') as {
  buildChannel(manifest: unknown): 'github' | 'portable';
  channelRules(at: { channel: string; platform: string; isPackaged: boolean; dataOverride: boolean; canUpdate: boolean; programDir: string }): Rules;
  loginItemOn(settings: { openAtLogin?: boolean; launchItems?: Array<{ name: string }> }, loginName: string | null): boolean;
};
const zh = require('../app/i18n/zh.cjs') as Record<string, (...a: string[]) => string>;
const en = require('../app/i18n/en.cjs') as Record<string, (...a: string[]) => string>;

const win = { platform: 'win32', isPackaged: true, dataOverride: false, canUpdate: true, programDir: 'D:\\Pets\\Coopanion' };

describe('the channel (app/channel.cjs)', () => {
  it('reads coopanion.channel from the app package.json, github when absent or unknown', () => {
    expect(buildChannel({ coopanion: { channel: 'portable' } })).toBe('portable');
    expect(buildChannel({ coopanion: { channel: 'github' } })).toBe('github');
    // from source: the repository's package.json has no coopanion field
    expect(buildChannel(JSON.parse(read('package.json')))).toBe('github');
    expect(buildChannel({ coopanion: { channel: 'steam' } })).toBe('github');
    expect(buildChannel(null)).toBe('github');
  });

  it('the installed Windows build keeps the data-location record, the updater and the default login item', () => {
    expect(channelRules({ ...win, channel: 'github' })).toEqual({
      installed: true, besideOnly: false, selfUpdate: true, loginName: null, coreEnv: {},
    });
    // a data directory named in the environment is not the installed layout
    expect(channelRules({ ...win, channel: 'github', dataOverride: true }).installed).toBe(false);
    expect(channelRules({ ...win, channel: 'github', platform: 'darwin', canUpdate: false })).toMatchObject({ installed: false, selfUpdate: false });
  });

  it('the portable build: data beside it, no record, no updater, a login item per folder, hoisted extensions', () => {
    const rules = channelRules({ ...win, channel: 'portable' });
    expect(rules).toEqual({
      installed: false,
      besideOnly: true,
      selfUpdate: false,
      loginName: 'Coopanion D:\\Pets\\Coopanion',
      coreEnv: { pnpm_config_node_linker: 'hoisted' },
    });
    // a copy of the folder is another login item
    expect(channelRules({ ...win, channel: 'portable', programDir: 'E:\\Coopanion 2' }).loginName).toBe('Coopanion E:\\Coopanion 2');
    // off Windows (a portable manifest on a Mac): no named login item, whose launchItems only Windows has
    expect(channelRules({ ...win, channel: 'portable', platform: 'darwin' })).toMatchObject({ besideOnly: false, loginName: null });
    expect(channelRules({ ...win, channel: 'portable', dataOverride: true }).besideOnly).toBe(false);
  });

  it('reads the login item back: openAtLogin for the default one, the named value among launchItems', () => {
    expect(loginItemOn({ openAtLogin: true }, null)).toBe(true);
    expect(loginItemOn({ openAtLogin: false }, null)).toBe(false);
    const name = 'Coopanion D:\\Pets\\Coopanion';
    // Windows reports openAtLogin false for a value not named after the app id
    expect(loginItemOn({ openAtLogin: false, launchItems: [{ name }] }, name)).toBe(true);
    expect(loginItemOn({ openAtLogin: true, launchItems: [{ name: 'Coopanion E:\\Other' }] }, name)).toBe(false);
    expect(loginItemOn({ openAtLogin: false }, name)).toBe(false);
  });

  it('a portable folder that cannot be written says to unpack it elsewhere, in zh and en', () => {
    for (const t of [zh, en]) {
      const text = t.portableNotWritable('D:\\x\\data');
      expect(text).toContain('D:\\x\\data');
      expect(text).toContain('Program Files');
      expect(text).not.toMatch(/installer|安装器/);
    }
  });
});

describe('main.cjs uses the channel', () => {
  const main = read('app', 'main.cjs');
  it('derives the installed build, the updater, the Core env and the login item from channelRules', () => {
    expect(main).toMatch(/const CHANNEL = buildChannel\(JSON\.parse\(readFileSync\(join\(APP_ROOT, 'package\.json'\)/);
    expect(main).toMatch(/const INSTALLED = RULES\.installed;/);
    // the record and the stranded-data recovery only run for INSTALLED; nothing else reads the channel for them
    expect(main).not.toMatch(/const INSTALLED = app\.isPackaged/);
    expect(main).toMatch(/if \(RULES\.selfUpdate\) updater = startUpdater\(/);
    expect(main).toMatch(/'settings:update', \(e\) => \{ e\.returnValue = \{ auto: RULES\.selfUpdate,/);
    expect(main).not.toMatch(/canUpdate\(\), step/);
    expect(main).toMatch(/\.\.\.RULES\.coreEnv,/);
    expect(main).toMatch(/name: RULES\.loginName/);
    expect(main).toMatch(/loginItemOn\(app\.getLoginItemSettings\(/);
    expect(main).toMatch(/\(INSTALLED \|\| RULES\.besideOnly\) && !dataWritable\(\)/);
    expect(main).toMatch(/t\.portableNotWritable\(DATA\)/);
  });
});

describe('building the portable zip (scripts/pack-builder.ts, electron-builder.yml)', () => {
  it('COOPANION_CHANNEL picks the channel; portable only on Windows', () => {
    expect(packChannel({}, 'darwin')).toBe('github');
    expect(packChannel({ COOPANION_CHANNEL: '' }, 'linux')).toBe('github');
    expect(packChannel({ COOPANION_CHANNEL: 'portable' }, 'win32')).toBe('portable');
    expect(() => packChannel({ COOPANION_CHANNEL: 'portable' }, 'darwin')).toThrow(/Windows/);
    expect(() => packChannel({ COOPANION_CHANNEL: 'steam' }, 'win32')).toThrow(/portable/);
  });

  it('the portable build carries no updater and asks electron-builder for the zip target only', () => {
    expect(runtimeDeps('github')).toHaveProperty('electron-updater');
    expect(runtimeDeps('portable')).not.toHaveProperty('electron-updater');
    const { 'electron-updater': _, ...rest } = runtimeDeps('github');
    expect(runtimeDeps('portable')).toEqual(rest);
    // the bundled pnpm is the repository's
    expect(runtimeDeps('portable').pnpm).toBe(JSON.parse(read('package.json')).dependencies.pnpm);
    expect(builderArgs('win32', 'x64', [], 'portable').slice(0, 3)).toEqual(['--win', 'zip', '--x64']);
    expect(builderArgs('win32', 'x64', []).slice(0, 2)).toEqual(['--win', '--x64']);
    const pack = read('scripts', 'pack.ts');
    expect(pack).toMatch(/runtimeDeps\(CHANNEL\)/);
    expect(pack).toMatch(/coopanion: \{ channel: CHANNEL \}/);
    expect(pack).toMatch(/builderArgs\(process\.platform, ARCH, process\.argv\.slice\(2\), CHANNEL\)/);
  });

  it('names the zip as the README and the release workflow do, and leaves the installer its own name', () => {
    const yml = read('electron-builder.yml');
    const winName = /^win:\n(?: {2}.*\n|\s*#.*\n)*? {2}artifactName: (.+)$/m.exec(yml)?.[1];
    expect(winName).toBe('Coopanion-${version}-win-${arch}-portable.${ext}');
    expect(winName!.replace('${version}', '1.2.3').replace('${arch}', 'x64').replace('${ext}', 'zip')).toBe(portableZipName('1.2.3'));
    expect(/^nsis:\n(?: {2}.*\n|\s*#.*\n)*? {2}artifactName: (.+)$/m.exec(yml)?.[1]).toBe('Coopanion-Setup-${version}.exe');
  });
});

let dir = '';
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = ''; });
const scratchDir = () => {
  // test-only files go under node_modules/.cache (CLAUDE.md), not the system temp directory
  mkdirSync(join(ROOT, 'node_modules', '.cache'), { recursive: true });
  return mkdtempSync(join(ROOT, 'node_modules', '.cache', 'portable-'));
};

describe('checking the zip (scripts/portable-zip.ts)', () => {
  const manifest = (over: Record<string, unknown> = {}) => JSON.stringify({ version: '1.2.3', coopanion: { channel: 'portable' }, dependencies: { pnpm: '11.28.6' }, ...over });
  const good = ['Coopanion.exe', 'resources/app/package.json', 'resources/app/app/channel.cjs', 'resources/app/node_modules/pnpm/package.json'];

  it('passes a portable zip and names each way one goes wrong', () => {
    expect(portableProblems({ version: '1.2.3', names: good, manifest: manifest(), distFiles: [portableZipName('1.2.3')] })).toEqual([]);
    const problems = (at: Partial<Parameters<typeof portableProblems>[0]>) =>
      portableProblems({ version: '1.2.3', names: good, manifest: manifest(), distFiles: [], ...at }).join('\n');
    expect(problems({ manifest: manifest({ coopanion: { channel: 'github' } }) })).toMatch(/channel is "github"/);
    expect(problems({ manifest: manifest({ coopanion: undefined }) })).toMatch(/channel is undefined/);
    expect(problems({ manifest: manifest({ version: '1.2.2' }) })).toMatch(/version/);
    expect(problems({ manifest: manifest({ dependencies: { 'electron-updater': '^6' } }) })).toMatch(/lists electron-updater/);
    expect(problems({ names: [...good, 'resources/app/node_modules/electron-updater/package.json'] })).toMatch(/carries electron-updater/);
    expect(problems({ names: good.filter((n) => n !== 'Coopanion.exe').concat('Coopanion/Coopanion.exe') })).toMatch(/Coopanion\.exe/);
    expect(problems({ names: good.filter((n) => !n.endsWith('channel.cjs')) })).toMatch(/channel\.cjs/);
    expect(problems({ manifest: null })).toMatch(/package\.json is missing/);
    expect(problems({ distFiles: ['latest.yml'] })).toMatch(/latest\.yml/);
  });

  it('reads a real zip', () => {
    dir = scratchDir();
    const enc = new TextEncoder();
    writeFileSync(join(dir, portableZipName('1.2.3')), zipSync({
      'Coopanion.exe': enc.encode('MZ'),
      'resources/app/package.json': enc.encode(manifest()),
      'resources/app/app/channel.cjs': enc.encode(''),
    }));
    expect(verifyPortable(dir, '1.2.3')).toEqual([]);
    expect(verifyPortable(dir, '1.2.4')[0]).toMatch(/does not exist/);
    writeFileSync(join(dir, portableZipName('1.2.3')), zipSync({
      'Coopanion.exe': enc.encode('MZ'),
      'resources/app/package.json': enc.encode(manifest({ coopanion: { channel: 'github' } })),
      'resources/app/app/channel.cjs': enc.encode(''),
      'resources/app/node_modules/electron-updater/package.json': enc.encode('{}'),
    }));
    expect(verifyPortable(dir, '1.2.3')).toHaveLength(2);
  });
});

describe('the release workflow (.github/workflows/release.yml)', () => {
  const yml = read('.github', 'workflows', 'release.yml');
  const build = yml.slice(yml.indexOf('\n  build:'), yml.indexOf('\n  publish:'));
  const publish = yml.slice(yml.indexOf('\n  publish:'));
  /** The matrix entries as `key: value` maps. */
  const entries = build.split(/\n {10}- /).slice(1).map((chunk) => Object.fromEntries(
    chunk.split('\n').map((l) => /^\s*(\w+): (.*)$/.exec(l)).filter(Boolean).map((m) => [m![1], m![2]]),
  ));

  it('builds the portable zip on Windows with COOPANION_CHANNEL, checks it, and keeps the artifacts apart', () => {
    const portable = entries.filter((e) => e.channel === 'portable');
    expect(portable).toHaveLength(1);
    expect(portable[0]).toMatchObject({ os: 'windows-latest', arch: 'x64', files: 'dist/Coopanion-*-win-x64-portable.zip' });
    expect(build).toMatch(/COOPANION_CHANNEL: \$\{\{ matrix\.channel \}\}/);
    expect(build).toMatch(/if: matrix\.channel == 'portable'\n\s+run: pnpm exec tsx scripts\/verify-portable\.ts dist/);
    // two windows-latest/x64 entries: without the channel their artifact names would collide
    expect(build).toMatch(/name: installers-\$\{\{ matrix\.os \}\}-\$\{\{ matrix\.arch \}\}-\$\{\{ matrix\.channel \|\| 'github' \}\}/);
    const names = entries.map((e) => `${e.os}-${e.arch}-${e.channel ?? 'github'}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it('the one-command installer still picks the installer out of a release that also has the zip', () => {
    const ps1 = read('installer', 'install.ps1');
    expect(ps1).toMatch(/\$_\.name -like 'Coopanion-Setup-\*\.exe'/);
    expect(ps1).not.toMatch(/-like '[^']*\.zip'/);
  });

  it('checks the release files on a tag push and on a dry run alike; only a push publishes', () => {
    expect(publish).not.toMatch(/^ {4}if:/m);
    const check = /- name: Check the release files[^\n]*\n(?: {8}.*\n)*/.exec(publish)?.[0] ?? '';
    expect(check).not.toMatch(/if:/);
    expect(check).toContain('"Coopanion-${version}-win-x64-portable.zip"');
    expect(/- name: Publish complete release\n {8}if: github\.event_name == 'push'/.test(publish)).toBe(true);
  });

  // the check step's own script, run in bash on files named as the build jobs leave them
  const checkScript = () => {
    const block = /- name: Check the release files[^\n]*\n {8}run: \|\n((?: {10}.*\n|\n)*)/.exec(publish)?.[1] ?? '';
    return block.split('\n').map((l) => l.slice(10)).join('\n');
  };
  const runCheck = (files: string[], env: Record<string, string>, latest = 'version: 1.2.3\npath: Coopanion-Setup-1.2.3.exe\n') => {
    dir = scratchDir();
    mkdirSync(join(dir, 'release-artifacts'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    for (const f of files) writeFileSync(join(dir, 'release-artifacts', f), f === 'latest.yml' ? latest : 'x');
    return spawnSync('bash', ['-c', checkScript()], { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8' });
  };
  const ALL = ['Coopanion-Setup-1.2.3.exe', 'Coopanion-Setup-1.2.3.exe.blockmap', 'Coopanion-1.2.3-win-x64-portable.zip',
    'Coopanion-1.2.3-mac-arm64.dmg', 'Coopanion-1.2.3-mac-arm64.zip', 'Coopanion-1.2.3-mac-x64.dmg', 'Coopanion-1.2.3-mac-x64.zip',
    'Coopanion-1.2.3-linux-x64.AppImage', 'Coopanion-1.2.3-linux-x64.deb', 'latest.yml', 'latest-linux.yml'];
  // not probed on Windows, where bash may be the WSL launcher
  const bash = process.platform !== 'win32' && spawnSync('bash', ['-c', 'command -v sha256sum'], { encoding: 'utf8', timeout: 5000 }).status === 0;

  it.skipIf(process.platform === 'win32' || !bash)('the check passes a full set on a dry run and writes the zip into SHA256SUMS.txt', () => {
    const r = runCheck(ALL, { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF_NAME: 'main' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const sums = readFileSync(join(dir, 'release-artifacts', 'SHA256SUMS.txt'), 'utf8');
    expect(sums).toMatch(/ {2}Coopanion-1\.2\.3-win-x64-portable\.zip$/m);
    expect(sums.trim().split('\n')).toHaveLength(8);
  });

  it.skipIf(process.platform === 'win32' || !bash)('the check fails without the zip, on a tag that is not the version, or with a portable latest.yml', () => {
    expect(runCheck(ALL.filter((f) => !f.includes('portable')), { GITHUB_EVENT_NAME: 'workflow_dispatch' }).status).not.toBe(0);
    expect(runCheck(ALL, { GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: 'v1.2.3' }).status).toBe(0);
    const wrongTag = runCheck(ALL, { GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: 'v1.2.4' });
    expect(wrongTag.status).not.toBe(0);
    expect(wrongTag.stdout).toMatch(/does not match/);
    expect(runCheck(ALL, { GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: 'v1.2.3' }, 'path: Coopanion-1.2.3-win-x64-portable.zip\n').status).not.toBe(0);
  });
});

describe('the READMEs describe the portable version', () => {
  it('in both languages, with the zip name and the data folder', () => {
    for (const [file, zip] of [['README.md', 'Coopanion-<version>-win-x64-portable.zip'], ['README_zh.md', 'Coopanion-版本号-win-x64-portable.zip']]) {
      const text = read(file);
      expect(text, file).toContain(zip);
      expect(text, file).not.toContain('Pal-AI-Lab/Coopanion/releases');
    }
  });
});
