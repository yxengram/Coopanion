/**
 * Coo's default context stages (upstream Coopanion #288, ported with #295): a 128k stage budget and a quarter kept
 * at a handoff over Cormini's 64k and a third, through the same `loadDeployment` the app starts Core with. A
 * config.json that holds its own values (what 「上下文与交接」 saves) keeps them; nothing is migrated.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import corminiDefinition from '../vendor/cortico/bots/cormini/index.ts';
import { loadDeployment } from 'cortico/deploy.ts';
import type { CoreConfig } from 'cortico/core/types.ts';
import { cooContext, cooDefaults } from '../core/companion.ts';

type Context = CoreConfig['context'] & { maxTokens: number; keepRatio: number; softRatio: number; firstTurn: boolean };

const cormini = async () => corminiDefinition as unknown as { defaults(): CoreConfig };

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function deployDir(config?: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'coopanion-context-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'providers'));
  if (config) writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
  return dir;
}

describe("Coo's context defaults", () => {
  it('replace only the stage budget and the handoff share of Cormini\'s context section', async () => {
    const own = (await cormini()).defaults().context as Context;
    // what Cormini ships, so a Cortico bump that moves these shows here
    expect(own.maxTokens).toBe(64_000);
    expect(own.keepRatio).toBeCloseTo(1 / 3);
    expect(cooContext(own)).toEqual({ ...own, maxTokens: 128_000, keepRatio: 0.25 });
    const coo = cooDefaults((await cormini()).defaults());
    expect(coo.context).toEqual({ ...own, maxTokens: 128_000, keepRatio: 0.25 });
    expect((coo as unknown as { rounds: unknown }).rounds).toEqual({ soft: 20, hard: 40 });
  });

  it('apply to a deployment whose config.json says nothing about context', async () => {
    const def = await cormini();
    const source = { defaults: () => cooDefaults(def.defaults()) };
    const fresh = loadDeployment(source, deployDir()).config.context as Context;
    expect(fresh.maxTokens).toBe(128_000);
    expect(fresh.keepRatio).toBe(0.25);
    const other = loadDeployment(source, deployDir({ displayName: 'Coo', context: { firstTurn: true } })).config.context as Context;
    expect(other).toMatchObject({ maxTokens: 128_000, keepRatio: 0.25, firstTurn: true });
  });

  it('leave the values a saved config.json holds', async () => {
    const def = await cormini();
    const source = { defaults: () => cooDefaults(def.defaults()) };
    const saved = loadDeployment(source, deployDir({ context: { maxTokens: 64_000, keepRatio: 1 / 3, softRatio: 0.85 } })).config.context as Context;
    expect(saved.maxTokens).toBe(64_000);
    expect(saved.keepRatio).toBeCloseTo(1 / 3);
    const half = loadDeployment(source, deployDir({ context: { maxTokens: 200_000 } })).config.context as Context;
    expect(half).toMatchObject({ maxTokens: 200_000, keepRatio: 0.25 });
  });
});

describe("the Chat page's context ring switch (companion.contextRing, upstream #360)", () => {
  it('is off by default, also for a config.json from before it, and a saved value stays', async () => {
    const def = await cormini();
    const source = { defaults: () => cooDefaults(def.defaults()) };
    const ring = (config?: Record<string, unknown>) => (loadDeployment(source, deployDir(config)).config as unknown as { companion: { contextRing?: unknown; telemetry?: unknown } }).companion;
    expect(ring()).toEqual({ telemetry: true, contextRing: false });
    expect(ring({ companion: { telemetry: false } })).toEqual({ telemetry: false, contextRing: false });
    expect(ring({ companion: { contextRing: true } }).contextRing).toBe(true);
  });

  it("is a hot boolean of Coopanion's config group, titled in both languages", async () => {
    const { companionGroup } = await import('../core/companion.ts');
    for (const [language, title] of [['zh', '上下文圆环'], ['en', 'Context ring']] as const) {
      const p = companionGroup(language).schema.properties['companion.contextRing'];
      expect(p).toMatchObject({ type: 'boolean', title, 'x-hot': true });
      expect(p!.description).toBeTruthy();
    }
  });
});
