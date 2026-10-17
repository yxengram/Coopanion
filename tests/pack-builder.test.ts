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

describe('the macOS permission texts', () => {
  const yml = readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8');
  const CJK = /[　-〿㐀-鿿＀-￯]/;

  it('Info.plist has English ones; Chinese and Traditional Chinese get the Chinese ones from InfoPlist.strings', () => {
    const scalars = ymlScalars();
    for (const key of ['NSMicrophoneUsageDescription', 'NSAppleEventsUsageDescription']) {
      const line = new RegExp(`^ {4}${key}: (.+)$`, 'm').exec(yml);
      expect(line?.[1], key).toBeTruthy();
      expect(line![1], key).not.toMatch(CJK);
    }
    expect(scalars.get('linux.synopsis')).not.toMatch(CJK);
    const copies = [...yml.matchAll(/- from: (\S+)\n\s+to: (\S+)/g)].map((m) => [m[1], m[2]]);
    expect(copies.map(([, to]) => to)).toEqual(['zh_CN.lproj/InfoPlist.strings', 'zh_TW.lproj/InfoPlist.strings']);
    // the folder names of Electron's own bundle, so macOS finds one localization per language
    const resources = join(ROOT, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'Resources');
    if (existsSync(resources)) for (const [, to] of copies) expect(existsSync(join(resources, to.split('/')[0])), to).toBe(true);
    for (const [from] of copies) {
      // extraResources are resolved against the project directory, build/app
      const strings = readFileSync(resolve(APP, from), 'utf8');
      // the Chinese texts as they were before Info.plist became English
      expect(strings).toContain('"NSMicrophoneUsageDescription" = "Coo 用麦克风听你说话,语音在本机识别,录音不会上传。";');
      expect(strings).toContain('"NSAppleEventsUsageDescription" = "操作电脑时,Coo 用它把你指定的应用切到前面。";');
    }
  });
});
