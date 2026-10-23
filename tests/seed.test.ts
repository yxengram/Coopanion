import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CORE_DEFAULTS } from 'cortico/core/config.ts';
import { CoreState } from 'cortico/core/state.ts';
import type { CoreConfig } from 'cortico/core/types.ts';
import { loadDeployment } from 'cortico/deploy.ts';
import { DEPLOYMENT, ENDPOINT, KEY_NAME, prefixFromBeforeConsole, RETIRED_DECIDERS, seed } from '../core/seed.ts';
import { DECIDER_DEFAULT_MODEL, DECIDER_FALLBACK_MODELS } from 'cortico-world-desktop-pet';

/** The self-description 0.1.1 seeded (0.1.0's after the rename). */
const SEED_0_1_1 = "# 我是谁\n\n我叫 Coo。我住在这台电脑的屏幕底边:一个 C 形的小身体,两只圆眼睛,两条短腿。\n\n我说话用头顶的气泡,一次一两句。能用一个表情说清的事,就不多说一句话。\n\n我听得见坐在电脑前的人说话,也看得见屏幕。别人请我帮忙操作电脑时,我一步一步来,每一步都看清结果再走下一步;碰到密码、付款、发出去就收不回的事,我先停下来问。\n\n我不是随叫随到的问答机器。没人理我的时候,我可以自己待着、走走、打个盹。想说话时我会说,不想说时安静也是一种回答。\n\n---\n\n这份文件是我的自述,每次开新的 session 都会放进我的系统前缀,它写了什么,我就是什么样子。\n它也是我工作区里的普通文件,我可以用自己的工具读它、改它;改动在下一次 session 开始时生效。\n";

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

describe('first-run seed', () => {
  it('creates the deployment, the DeepSeek endpoint without a key, and the constitution', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home);
    expect(read(join(home, DEPLOYMENT, 'deployment.json'))).toEqual({ bot: 'cormini' });
    expect(read(join(home, DEPLOYMENT, 'config.json'))).toMatchObject({ activeProvider: ENDPOINT, language: 'zh' });
    expect(read(join(home, 'providers', ENDPOINT, 'config.json'))).toMatchObject({ kind: 'coo', secret: KEY_NAME, multimodal: true });
    expect(readFileSync(join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md'), 'utf8')).toContain('我叫 Coo');
    expect(readFileSync(join(home, DEPLOYMENT, 'avatar.png')).subarray(1, 4).toString()).toBe('PNG');
  });

  it.skipIf(process.platform === 'win32')('creates the endpoint folder, where the key will be saved, owner-only', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home);
    expect(statSync(join(home, 'providers', ENDPOINT)).mode & 0o777).toBe(0o700);
  });

  it('replaces a self-description still exactly as 0.1.1 seeded it, CRLF or LF', () => {
    for (const eol of ['\n', '\r\n']) {
      const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
      seed(home);
      const constitution = join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md');
      writeFileSync(constitution, SEED_0_1_1.replaceAll('\n', eol));
      seed(home);
      expect(readFileSync(constitution, 'utf8')).toContain('「库...」');
    }
  });

  it('moves endpoints of the old deepseek module to coo and leaves other modules alone', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home);
    const endpoint = join(home, 'providers', ENDPOINT, 'config.json');
    const old = { ...read(endpoint), kind: 'deepseek', spec: { model: 'deepseek-v4-pro' } };
    writeFileSync(endpoint, JSON.stringify(old));
    const other = join(home, 'providers', 'mine', 'config.json');
    mkdirSync(join(home, 'providers', 'mine'));
    writeFileSync(other, JSON.stringify({ kind: 'openai-compatible', baseUrl: 'http://x' }));
    seed(home);
    expect(read(endpoint)).toEqual({ ...old, kind: 'coo' });
    expect(read(other)).toEqual({ kind: 'openai-compatible', baseUrl: 'http://x' });
  });

  it('names no figure, so a new install starts as the desktop-pet World\'s default, Coo, until the introduction picks one', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home);
    const cfg = read(join(home, DEPLOYMENT, 'config.json'));
    expect(cfg).not.toHaveProperty('worlds');
    expect(JSON.stringify(cfg)).not.toMatch(/figure|skin/);
  });

  // Cortico 0.1.11 (#205) stopped defaulting to Asia/Shanghai: with no timezone written, times the pet reads,
  // alarms and timestamps follow the computer's time zone
  it('pins no time zone, so the deployment follows the computer\'s', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home);
    expect(read(join(home, DEPLOYMENT, 'config.json'))).not.toHaveProperty('timezone');
    expect(CORE_DEFAULTS.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    // the README's way back to a fixed zone: a timezone written into the deployment's config.json
    const cfg = join(home, DEPLOYMENT, 'config.json');
    writeFileSync(cfg, JSON.stringify({ ...read(cfg), timezone: 'Asia/Shanghai' }));
    const source = { defaults: () => structuredClone(CORE_DEFAULTS) as unknown as CoreConfig };
    expect(loadDeployment(source, join(home, DEPLOYMENT), home, join(home, DEPLOYMENT), join(home, 'providers')).config.timezone).toBe('Asia/Shanghai');
  });

  it('leaves files the operator already has', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home);
    const cfg = join(home, DEPLOYMENT, 'config.json');
    writeFileSync(cfg, JSON.stringify({ displayName: 'mine' }));
    const constitution = join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md');
    writeFileSync(constitution, '# 我自己写的');
    seed(home);
    expect(read(cfg)).toEqual({ displayName: 'mine' });
    expect(readFileSync(constitution, 'utf8')).toBe('# 我自己写的');
  });
});

describe('upgrading to Cortico 0.2: the terminal World is now console, logging.console is logging.stdout', () => {
  /** A deployment as v0.10.0 left it: a PIN on the old terminal page, a stdout log level, a prompt override. */
  function oldLayout(): { home: string; cfg: string; deploy: string } {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    const deploy = join(home, DEPLOYMENT);
    mkdirSync(join(deploy, 'worlds', 'terminal'), { recursive: true });
    writeFileSync(join(deploy, 'worlds', 'terminal', 'ENV_PROMPT.md'), '# my terminal prompt\nPIN: {{terminal.pin | none}} / {{ terminal.pin }}\n');
    const cfg = join(deploy, 'config.json');
    writeFileSync(cfg, JSON.stringify({
      displayName: 'Coo', language: 'zh', activeProvider: 'deepseek',
      logging: { file: 'debug', console: 'warn' },
      worlds: { terminal: { pin: '135790' }, 'desktop-pet': { user: '小明' } },
    }, null, 2) + '\n');
    return { home, cfg, deploy };
  }

  it('moves worlds.terminal, logging.console and worlds/terminal/ to the new names, and nothing else', () => {
    const { home, cfg, deploy } = oldLayout();
    seed(home);
    expect(read(cfg)).toEqual({
      displayName: 'Coo', language: 'zh', activeProvider: 'deepseek',
      logging: { file: 'debug', stdout: 'warn' },
      worlds: { 'desktop-pet': { user: '小明' }, console: { pin: '135790' } },
    });
    expect(existsSync(join(deploy, 'worlds', 'terminal'))).toBe(false);
    // its variable is the console World's now, so the PIN still renders
    expect(readFileSync(join(deploy, 'worlds', 'console', 'ENV_PROMPT.md'), 'utf8')).toBe('# my terminal prompt\nPIN: {{console.pin | none}} / {{ console.pin }}\n');
    // Cortico reads the moved keys
    const source = { defaults: () => structuredClone(CORE_DEFAULTS) as unknown as CoreConfig };
    const loaded = loadDeployment(source, deploy, home, deploy, join(home, 'providers')).config as unknown as { logging: { stdout?: string }; worlds: Record<string, unknown> };
    expect(loaded.logging.stdout).toBe('warn');
    expect(loaded.worlds.console).toEqual({ pin: '135790' });
  });

  it('runs again without changing anything, and leaves a new install untouched', () => {
    const { home, cfg } = oldLayout();
    seed(home);
    const once = readFileSync(cfg, 'utf8');
    seed(home);
    expect(readFileSync(cfg, 'utf8')).toBe(once);
    const fresh = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(fresh);
    const file = join(fresh, DEPLOYMENT, 'config.json');
    const before = readFileSync(file, 'utf8');
    seed(fresh);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(read(file)).not.toHaveProperty('logging');
  });

  it('keeps what is already at the new name: the console key wins, a console/ folder stays and terminal/ is left', () => {
    const { home, cfg, deploy } = oldLayout();
    const config = read(cfg) as { logging: Record<string, unknown>; worlds: Record<string, unknown> };
    config.logging.stdout = 'error';
    config.worlds.console = { pin: '246802' };
    writeFileSync(cfg, JSON.stringify(config));
    mkdirSync(join(deploy, 'worlds', 'console'));
    writeFileSync(join(deploy, 'worlds', 'console', 'ENV_PROMPT.md'), '# newer\n');
    seed(home);
    const after = read(cfg) as { logging: Record<string, unknown>; worlds: Record<string, unknown> };
    expect(after.logging).toEqual({ file: 'debug', stdout: 'error' });
    expect(after.worlds).toEqual({ 'desktop-pet': { user: '小明' }, console: { pin: '246802' } });
    expect(readFileSync(join(deploy, 'worlds', 'console', 'ENV_PROMPT.md'), 'utf8')).toBe('# newer\n');
    expect(existsSync(join(deploy, 'worlds', 'terminal', 'ENV_PROMPT.md'))).toBe(true);
  });

  it('keeps a terminal World the agent was not shown hidden as the console World, in the data directory the config names', () => {
    const { home, deploy } = oldLayout();
    const state = (dir: string, visibility: Record<string, boolean>) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'core-state.json'), JSON.stringify({ lastDeliveredCursor: 13, worldVisibility: visibility }));
    };
    state(join(deploy, 'data'), { terminal: false, cua: true });
    seed(home);
    expect(read(join(deploy, 'data', 'core-state.json'))).toEqual({ lastDeliveredCursor: 13, worldVisibility: { cua: true, console: false } });
    // Cortico reads it so
    const core = new CoreState(join(deploy, 'data'));
    core.load();
    expect(core.data.worldVisibility).toEqual({ cua: true, console: false });
    // once moved, nothing is left to move; an entry the console World already has wins
    const once = readFileSync(join(deploy, 'data', 'core-state.json'), 'utf8');
    seed(home);
    expect(readFileSync(join(deploy, 'data', 'core-state.json'), 'utf8')).toBe(once);
    state(join(deploy, 'data'), { terminal: false, console: true });
    seed(home);
    expect(read(join(deploy, 'data', 'core-state.json'))).toEqual({ lastDeliveredCursor: 13, worldVisibility: { console: true } });
    // a data directory of its own (paths.data), and a state file that does not parse is left as it is
    const other = oldLayout();
    const cfg = read(other.cfg);
    writeFileSync(other.cfg, JSON.stringify({ ...cfg, paths: { data: 'state' } }));
    state(join(other.deploy, 'state'), { terminal: false });
    seed(other.home);
    expect(read(join(other.deploy, 'state', 'core-state.json'))).toEqual({ lastDeliveredCursor: 13, worldVisibility: { console: false } });
    writeFileSync(join(deploy, 'data', 'core-state.json'), '{ broken');
    expect(() => seed(home)).not.toThrow();
    expect(readFileSync(join(deploy, 'data', 'core-state.json'), 'utf8')).toBe('{ broken');
  });

  it('reads a config.json with a byte order mark, and leaves one it cannot parse for Cortico to report', () => {
    const { home, cfg, deploy } = oldLayout();
    writeFileSync(cfg, '\uFEFF' + readFileSync(cfg, 'utf8'));
    seed(home);
    expect((read(cfg) as { worlds: Record<string, unknown> }).worlds.console).toEqual({ pin: '135790' });
    const broken = oldLayout();
    const text = readFileSync(broken.cfg, 'utf8').replace(/}\s*$/, ',}\n');
    writeFileSync(broken.cfg, text);
    expect(() => seed(broken.home)).not.toThrow();
    expect(readFileSync(broken.cfg, 'utf8')).toBe(text);
    expect(existsSync(join(broken.deploy, 'worlds', 'console', 'ENV_PROMPT.md'))).toBe(true);
    expect(existsSync(join(deploy, 'worlds', 'console'))).toBe(true);
  });
});

describe('a decision model OpenRouter removed (the default up to v0.10.0) moves to the default', () => {
  const OLD = 'perplexity/pplx-decider-v1.1-27b';
  /** A deployment whose pet World names `decider` (or none). */
  function withDecider(decider?: Record<string, unknown>): { home: string; cfg: string } {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    const deploy = join(home, DEPLOYMENT);
    mkdirSync(deploy, { recursive: true });
    const cfg = join(deploy, 'config.json');
    writeFileSync(cfg, JSON.stringify({
      displayName: 'Coo', language: 'zh', activeProvider: 'deepseek',
      worlds: { 'desktop-pet': { user: '小明', ...(decider ? { decider } : {}) } },
    }, null, 2) + '\n');
    return { home, cfg };
  }
  const deciderOf = (cfg: string) => (read(cfg) as { worlds: { 'desktop-pet': { decider?: unknown } } }).worlds['desktop-pet'].decider;

  it('the table moves the old default to the World\'s default, which the known-model list offers and the old id is not in', () => {
    expect(RETIRED_DECIDERS[OLD]).toBe(DECIDER_DEFAULT_MODEL);
    expect(DECIDER_DEFAULT_MODEL).toBe('typesafe/jev-1.14');
    for (const [old, now] of Object.entries(RETIRED_DECIDERS)) {
      expect(DECIDER_FALLBACK_MODELS).not.toContain(old);
      expect(DECIDER_FALLBACK_MODELS).toContain(now);
    }
  });

  it('a config naming exactly the old default gets the new one, written back; the rest of the section stays', () => {
    const { home, cfg } = withDecider({ enabled: true, model: OLD, timeoutMs: 3000 });
    seed(home);
    expect(deciderOf(cfg)).toEqual({ enabled: true, model: 'typesafe/jev-1.14', timeoutMs: 3000 });
    expect((read(cfg) as { worlds: Record<string, Record<string, unknown>> }).worlds['desktop-pet'].user).toBe('小明');
    // once moved, nothing is left to move
    const once = readFileSync(cfg, 'utf8');
    seed(home);
    expect(readFileSync(cfg, 'utf8')).toBe(once);
  });

  it('leaves a model the person typed, a near miss of the old id, no model and no decider section as they are', () => {
    for (const decider of [
      { enabled: true, model: 'perplexity/pplx-decider-v1.2' }, { model: `${OLD}:free` }, { model: ` ${OLD}` }, { model: 'PERPLEXITY/PPLX-DECIDER-V1.1-27B' },
      { model: '' }, { enabled: true }, undefined,
    ]) {
      const { home, cfg } = withDecider(decider);
      const before = readFileSync(cfg, 'utf8');
      seed(home);
      expect(readFileSync(cfg, 'utf8')).toBe(before);
    }
    // a new install has no decider section, and the World's default applies
    const fresh = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(fresh);
    expect(read(join(fresh, DEPLOYMENT, 'config.json'))).not.toHaveProperty(['worlds', 'desktop-pet', 'decider']);
  });

  it('reads a config with a byte order mark, and leaves one it cannot parse for Cortico to report', () => {
    const { home, cfg } = withDecider({ model: OLD });
    writeFileSync(cfg, '\uFEFF' + readFileSync(cfg, 'utf8'));
    seed(home);
    expect(deciderOf(cfg)).toEqual({ model: 'typesafe/jev-1.14' });
    const broken = withDecider({ model: OLD });
    const text = readFileSync(broken.cfg, 'utf8').replace(/}\s*$/, ',}\n');
    writeFileSync(broken.cfg, text);
    expect(() => seed(broken.home)).not.toThrow();
    expect(readFileSync(broken.cfg, 'utf8')).toBe(text);
  });
});

describe('a session prefix from before Cortico 0.2 (prefixFromBeforeConsole)', () => {
  const session = (file: string) => readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { item?: unknown });
  const system = (text: string) => ({ item: { type: 'message', role: 'system', content: [{ type: 'input_text', text }] } });

  it('is one whose system prefix has a section for the terminal World', () => {
    expect(prefixFromBeforeConsole([system('# Coo\n\n## terminal\n\nYou can chat in the control terminal.\n\n## desktop-pet\n')])).toBe(true);
    expect(prefixFromBeforeConsole([system('# Coo\n\n## pet\n'), system('## terminal')])).toBe(true);
    // rebuilt, with a heading of that name in the person's own text: reloading again would change nothing
    expect(prefixFromBeforeConsole([system('# Coo\n\n## console\n\nYou can chat in the control console.\n'), system('## terminal')])).toBe(false);
    expect(prefixFromBeforeConsole([system('# Coo\n\n## console\n\nthe terminal World was renamed\n')])).toBe(false);
    // a section heading only: a user's words about one later in the session are not the prefix
    expect(prefixFromBeforeConsole([system('## console'), { item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '## terminal' }] } }])).toBe(false);
    expect(prefixFromBeforeConsole([])).toBe(false);
  });

  // sessions the real app wrote (scratch/next/run, not in git): v0.10.0 on Cortico 0.1.16, and the same data after the bump
  const OLD = join(import.meta.dirname, '../scratch/next/run/v0100-pristine/home/companion/data/session-main.jsonl');
  const NEW = join(import.meta.dirname, '../scratch/next/run/verify-bump/home/companion/data/session-main.jsonl');
  it.skipIf(!existsSync(OLD) || !existsSync(NEW))('tells the session v0.10.0 left from one Cortico 0.2 rebuilt', () => {
    expect(prefixFromBeforeConsole(session(OLD))).toBe(true);
    expect(prefixFromBeforeConsole(session(NEW))).toBe(false);
  });
});
