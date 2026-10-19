/**
 * The order of the Worlds' blocks in the system prefix (core/prefix-order.ts): the console World's block after the
 * others (`coopanion` when it has a block, `cua`, `desktop-pet`, then `console`), as before Cortico 0.2 renamed the
 * chat World `terminal` → `console` and its block sorted first. Checked on a bot assembled as core/companion.ts does
 * it (Cormini, the four bundled Worlds, the seeded deployment), for the prefix the bot gets (the loop's own
 * assembly, at a new session and at a rebuild) and the WebUI's segment view, in classic and decider mode and with
 * the `coopanion` World's reply-language block. Every block, and every other part of the prefix, is byte for byte
 * the one Cortico's own order gives: only the order changes.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createBot, type Bot, type BotDefinition } from 'cortico/bot.ts';
import { assembleSystemSegments, collectWorldContexts } from 'cortico/core/prefix.ts';
import type { CoreConfig, Persona, PrefixSegment, World } from 'cortico/core/types.ts';
import { loadDeployment } from 'cortico/deploy.ts';
import { repoRoot } from 'cortico/paths.ts';
import { providerModules, registerProviderModules } from 'cortico/providers/registry.ts';
import { withWorlds, type WorldDefinition, type WorldSection } from 'cortico/world.ts';
import { CONSOLE } from 'cortico/worlds/console/definition.ts';
import { cuaDefinition } from 'cortico-world-cua';
import { desktopPetDefinition, type DesktopPetWorld } from 'cortico-world-desktop-pet';
import COO, { CHATGPT_PROVIDER } from 'cortico-provider-coo';
import { appLanguage, replyLanguage } from '../core/language.ts';
import { noticeDefinition } from '../core/notice.ts';
import { consoleLast, withConsoleLast } from '../core/prefix-order.ts';
import { CONSOLE_PORT, DEPLOYMENT, DISPLAY_NAME, prefixFromBeforeConsole, seed } from '../core/seed.ts';

const homes: string[] = [];
const bots: Bot<CoreConfig>[] = [];
afterEach(async () => {
  await Promise.all(bots.splice(0).map((b) => b.stop().catch(() => {})));
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

/** A World that is assembled and prompts as it does in the app, but starts nothing (the CUA and notice Worlds). */
function quiet(def: WorldDefinition<WorldSection>): WorldDefinition<WorldSection> {
  return {
    ...def,
    create: (ctx) => {
      const w = def.create(ctx) as World;
      w.start = async () => {};
      w.stop = async () => {};
      return w;
    },
  };
}

/** The app's bot as core/companion.ts `main()` assembles it, over a freshly seeded deployment; not started. */
async function appBot(opts: { decider?: boolean; language?: string; home?: string } = {}): Promise<Bot<CoreConfig>> {
  registerProviderModules([COO, CHATGPT_PROVIDER].filter((m) => !providerModules.some((r) => r.id === m.id)));
  const home = opts.home ?? mkdtempSync(join(tmpdir(), 'coopanion-prefix-order-'));
  if (!opts.home) homes.push(home);
  seed(home);
  const deployDir = join(home, DEPLOYMENT);
  const cfgFile = join(deployDir, 'config.json');
  const cfg = JSON.parse(readFileSync(cfgFile, 'utf8')) as Record<string, unknown>;
  writeFileSync(cfgFile, JSON.stringify({
    ...cfg,
    ...(opts.language ? { language: opts.language } : {}),
    worlds: {
      'desktop-pet': {
        port: 0, window: { enabled: false }, asr: { enabled: false, mic: { mode: 'always' } }, skin: { figure: 'claude-chan' },
        ...(opts.decider ? { decider: { enabled: true } } : {}),
      },
    },
  }, null, 2));
  const language = () => appLanguage(opts.language);
  const DESKTOP_PET = desktopPetDefinition({
    controls: { isPaused: () => false, setPaused: () => {}, openSettings: () => {}, openChat: () => {}, openDress: () => {}, quit: () => {}, quitLabel: '退出应用', guide: () => {} },
    deciderKey: () => (opts.decider ? 'sk-or-test' : ''),
    language,
  });
  const CUA = cuaDefinition({ askPermission: async () => 'no', language });
  const NOTICE = noticeDefinition({
    version: 'dev', notesDir: join(deployDir, 'no-notes'), stateFile: join(deployDir, 'notice.json'), alarmsFile: join(deployDir, 'alarms.json'),
    newInstall: () => false, read: () => undefined, petConnected: () => true, guiding: () => false,
    replyLanguage: () => replyLanguage(opts.language),
  });
  const cormini = (await import(pathToFileURL(join(repoRoot(), 'bots', 'cormini', 'index.ts')).href) as { default: BotDefinition<CoreConfig> }).default;
  const base: BotDefinition<CoreConfig> = {
    ...cormini,
    declares: [CONSOLE.id, DESKTOP_PET.id, CUA.id, NOTICE.id],
    defaults: () => ({ ...cormini.defaults(), displayName: DISPLAY_NAME, web: { port: CONSOLE_PORT, theme: 'mint' } } as CoreConfig),
    build: (loaded, worlds) => {
      const parts = cormini.build(loaded, worlds);
      withConsoleLast(parts.persona);
      return { ...parts, webUi: { ...parts.webUi, enabled: false } };
    },
  };
  const definition = withWorlds(base, [CONSOLE, DESKTOP_PET, quiet(CUA as never), quiet(NOTICE)] as WorldDefinition<WorldSection>[]);
  const loaded = loadDeployment(definition, deployDir, repoRoot(), join(repoRoot(), 'bots', 'cormini'), join(home, 'providers'));
  const bot = createBot(loaded, definition);
  bots.push(bot);
  return bot;
}

const ENV = 'ENVIRONMENT · ';
const textOf = (record: { item?: unknown }): string => {
  const content = (record.item as { content?: unknown }).content;
  return typeof content === 'string' ? content : (content as Array<{ text?: string }>).map((c) => c.text ?? '').join('');
};
/** The prefix as the loop assembles it for the session (its private `buildSystem`, which every rebuild goes through). */
const loopPrefix = async (bot: Bot<CoreConfig>) => textOf(await (bot.core.loop as unknown as { buildSystem(): Promise<{ item?: unknown }> }).buildSystem());
const segmentsOf = (bot: Bot<CoreConfig>) => assembleSystemSegments({ persona: bot.parts.persona, worlds: bot.assembly.mounted, now: new Date(), timezone: bot.core.config.timezone });
/** The segments in Cortico's own order: Cormini's `systemSegments` without the app's reordering. */
async function corticoSegments(bot: Bot<CoreConfig>): Promise<PrefixSegment[]> {
  const persona = bot.parts.persona;
  const own = Object.getPrototypeOf(persona) as Persona;
  return own.systemSegments.call(persona, { now: new Date(), timezone: bot.core.config.timezone, worlds: await collectWorldContexts(bot.assembly.mounted) });
}
const envIds = (segments: PrefixSegment[]) => segments.filter((s) => s.title.startsWith(ENV)).map((s) => s.title.slice(ENV.length));

/**
 * Cortico's segments laid out console-last: the World blocks reordered, the environment section's lead (the text
 * before the first block) kept on the first block, each other block after a newline; everything else unmoved.
 */
function reordered(segments: PrefixSegment[]): PrefixSegment[] {
  const env = segments.filter((s) => s.title.startsWith(ENV));
  const lead = env[0].text.slice(0, env[0].text.indexOf('## '));
  expect(env.slice(1).every((s) => s.text.startsWith('\n## '))).toBe(true);
  const blocks = env.map((s, i) => ({ id: s.title.slice(ENV.length), seg: s, block: i === 0 ? s.text.slice(lead.length) : s.text.slice(1) }));
  const ordered = consoleLast(blocks).map((b, i) => ({ ...b.seg, text: (i === 0 ? lead : '\n') + b.block }));
  const first = segments.indexOf(env[0]);
  return [...segments.slice(0, first), ...ordered, ...segments.slice(first + env.length)];
}

describe('the World blocks in the system prefix: console last', () => {
  it('consoleLast moves only the console block, keeping the others in the order they came', () => {
    const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id);
    expect(ids(consoleLast([{ id: 'console' }, { id: 'coopanion' }, { id: 'cua' }, { id: 'desktop-pet' }]))).toEqual(['coopanion', 'cua', 'desktop-pet', 'console']);
    expect(ids(consoleLast([{ id: 'console' }, { id: 'cua' }, { id: 'desktop-pet' }, { id: 'zz-ext' }]))).toEqual(['cua', 'desktop-pet', 'zz-ext', 'console']);
    expect(ids(consoleLast([{ id: 'cua' }]))).toEqual(['cua']);
  });

  it('wrapping the Persona twice orders once and keeps the instance', async () => {
    const bot = await appBot();
    const persona = bot.parts.persona;
    expect(withConsoleLast(persona)).toBe(persona);
    expect(envIds(await segmentsOf(bot))).toEqual(['cua', 'desktop-pet', 'console']);
  });

  for (const mode of [
    { name: 'classic, Chinese', opts: {}, ids: ['cua', 'desktop-pet', 'console'] },
    { name: 'decider, Chinese', opts: { decider: true }, ids: ['cua', 'desktop-pet', 'console'] },
    { name: 'classic, English (the coopanion World has a block)', opts: { language: 'en' }, ids: ['coopanion', 'cua', 'desktop-pet', 'console'] },
    { name: 'decider, English', opts: { decider: true, language: 'en' }, ids: ['coopanion', 'cua', 'desktop-pet', 'console'] },
  ] as const) {
    it(`${mode.name}: the bot's prefix and the WebUI's segments list ${mode.ids.join(', ')}, the text otherwise Cortico's`, async () => {
      const bot = await appBot(mode.opts);
      const pet = bot.assembly.mounted.find((w) => w.id === 'desktop-pet') as unknown as DesktopPetWorld;
      expect(pet.petMode).toBe('decider' in mode.opts ? 'decider' : 'classic');
      const cortico = await corticoSegments(bot);
      // Cortico's own order (by id) puts console first
      expect(envIds(cortico)).toEqual(['console', ...mode.ids.filter((id) => id !== 'console')]);
      const expected = reordered(cortico);
      const segments = await segmentsOf(bot);
      expect(envIds(segments)).toEqual(mode.ids);
      expect(segments).toEqual(expected);
      // the prefix the bot gets is the WebUI's segments joined, and the same blocks, lines and length as Cortico's
      const prefix = await loopPrefix(bot);
      expect(prefix).toBe(expected.map((s) => s.text).join(''));
      const corticoText = cortico.map((s) => s.text).join('');
      expect(prefix.length).toBe(corticoText.length);
      expect(prefix.split('\n').sort()).toEqual(corticoText.split('\n').sort());
      const headings = [...prefix.matchAll(/^## (\S+)$/gm)].map((m) => m[1]).filter((h) => (mode.ids as readonly string[]).includes(h));
      expect(headings).toEqual(mode.ids);
    });
  }

  it('a started bot: the new session, a rebuilt prefix, and a session from before Cortico 0.2 rebuilt at start', async () => {
    const bot = await appBot();
    // as with no key: nothing wakes the bot, no model is called
    bot.core.bus.setPaused(true);
    await bot.start();
    const system = (b: Bot<CoreConfig>) => textOf(b.core.session.records[0]);
    const order = (text: string) => [...text.matchAll(/^## (cua|desktop-pet|console|terminal|coopanion)$/gm)].map((m) => m[1]);
    const expected = (await segmentsOf(bot)).map((s) => s.text).join('');
    expect(system(bot)).toBe(expected);
    expect(order(system(bot))).toEqual(['cua', 'desktop-pet', 'console']);
    // a rebuild (the decider switch, a language change, 「重载系统前缀」) goes through the same assembly
    await bot.core.loop.reloadSystemPrefix();
    expect(system(bot)).toBe(expected);
    await bot.stop();
    bots.splice(bots.indexOf(bot), 1);

    // the session as v0.10.0 left it: Cortico 0.1.x's prefix, with the chat World's block `## terminal` and last
    const file = join(homes[homes.length - 1], DEPLOYMENT, 'data', 'session-main.jsonl');
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { item: { content: unknown } });
    const old = expected.replace(/^## console$/m, '## terminal');
    const first = lines[0].item;
    first.content = typeof first.content === 'string' ? old : [{ ...(first.content as object[])[0], text: old }];
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');

    // the next start keeps it (Cortico does), and core/companion.ts rebuilds it once (prefixFromBeforeConsole)
    const again = await appBot({ home: homes[homes.length - 1] });
    again.core.bus.setPaused(true);
    await again.start();
    expect(system(again)).toBe(old);
    expect(order(system(again))).toEqual(['cua', 'desktop-pet', 'terminal']);
    expect(prefixFromBeforeConsole(again.core.session.records)).toBe(true);
    await again.core.loop.reloadSystemPrefix();
    expect(system(again)).toBe(expected);
    expect(order(system(again))).toEqual(['cua', 'desktop-pet', 'console']);
    expect(prefixFromBeforeConsole(again.core.session.records)).toBe(false);
  });

  it('core/companion.ts orders the Persona it builds the bot with', () => {
    // the assembly above is a copy of main()'s; this pins that main() itself applies the order in its build()
    const source = readFileSync(fileURLToPath(new URL('../core/companion.ts', import.meta.url)), 'utf8');
    expect(source).toMatch(/build: \(loaded, worlds\) => \{\n\s+const parts = cormini\.build\(loaded, worlds\);\n(\s+\/\/.*\n)?\s+withConsoleLast\(parts\.persona\);/);
  });
});
