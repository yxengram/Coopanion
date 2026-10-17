import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { builderArgs, CONFIG, packageManagerField, PROJECT_DIR } from '../scripts/pack-builder.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const APP = join(ROOT, 'build', 'app');

/** `section.key` → value for the two-space-indented scalars of electron-builder.yml (enough for the keys checked here). */
const ymlScalars = (): Map<string, string> => {
  const out = new Map<string, string>();
  let section = '';
  for (const line of readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8').split(/\r?\n/)) {
    const top = /^([A-Za-z]\w*):/.exec(line);
    if (top) { section = top[1]; continue; }
    const m = /^ {2}([A-Za-z]\w*):\s*(.+?)\s*$/.exec(line);
    if (m && !m[2].startsWith('#')) out.set(`${section}.${m[1]}`, m[2].replace(/^["']|["']$/g, ''));
  }
  return out;
};

describe('electron-builder runs on build/app as assembled (scripts/pack.ts)', () => {
  it('uses build/app as the project directory and the repository config', () => {
    const args = builderArgs('darwin', 'x64', ['--dir']);
    expect(args.slice(0, 2)).toEqual(['--mac', '--x64']);
    // pack.ts runs electron-builder with cwd = the repository; --config is resolved against the project directory
    const projectDir = resolve(ROOT, args[args.indexOf('--projectDir') + 1]);
    expect(projectDir).toBe(resolve(APP));
    expect(resolve(projectDir, args[args.indexOf('--config') + 1])).toBe(join(ROOT, 'electron-builder.yml'));
    expect(existsSync(resolve(APP, CONFIG))).toBe(true);
    expect(PROJECT_DIR).not.toMatch(/\s/);
    expect(args.at(-1)).toBe('--dir');
    expect(builderArgs('win32', 'x64', [])[0]).toBe('--win');
    expect(builderArgs('linux', 'x64', [])[0]).toBe('--linux');
  });

  it('names npm in build/app/package.json, so electron-builder collects with npm list there and not the pnpm workspace', () => {
    expect(packageManagerField('11.19.1\n')).toBe('npm@11.19.1');
    expect(packageManagerField(null)).toBe('npm');
    expect(readFileSync(join(ROOT, 'scripts', 'pack.ts'), 'utf8')).toMatch(/packageManager: packageManagerField\(/);
  });

  it('resolves the config paths from build/app to the repository', () => {
    const yml = ymlScalars();
    // the app directory is the project directory
    expect(yml.has('directories.app')).toBe(false);
    // computeDefaultAppDirectory tries <project>/app and /www first: a package.json there would make it the app
    expect(existsSync(join(ROOT, 'app', 'package.json'))).toBe(false);
    expect(existsSync(join(ROOT, 'www'))).toBe(false);
    expect(resolve(APP, yml.get('directories.output') ?? 'dist')).toBe(join(ROOT, 'dist'));
    const res = resolve(APP, yml.get('directories.buildResources') ?? 'build');
    // inside build/app, electron-builder leaves buildResources out of the app (the default build/ is the staged Cortico)
    expect(relative(APP, res).startsWith('..')).toBe(true);
    expect(res).toBe(join(ROOT, 'installer'));
    // NsisTarget: getResource(include) looks in buildResources, then in the project directory
    const include = yml.get('nsis.include') ?? '';
    expect(include).not.toBe('');
    expect(existsSync(join(res, include))).toBe(true);
    // icons resolve against [buildResources, build/app]; build/app/app is pack.ts's copy of app/
    for (const key of ['win.icon', 'mac.icon', 'linux.icon']) {
      const icon = yml.get(key) ?? '';
      expect(icon.split(/[\\/]/)[0], key).toBe('app');
      expect(existsSync(join(ROOT, ...icon.split('/'))), key).toBe(true);
    }
  });
});
