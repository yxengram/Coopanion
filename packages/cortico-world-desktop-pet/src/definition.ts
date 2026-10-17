import { join } from 'node:path';
import { runtimesRoot, modelsRoot } from 'cortico/paths.ts';
import { envPromptOverridePath } from 'cortico/core/prefix.ts';
import type { WorldDefinition } from 'cortico/world.ts';
import { DESKTOP_PET_DEFAULTS, DESKTOP_PET_ID, type DesktopPetConfigSection, type PetSkin } from './config.ts';
import { DesktopPetWorld, modelsDirFor, type PetBotControls, type PetMode } from './world.ts';
import type { DecisionRecord } from './decider.ts';
import type { Presence } from './smalltalk.ts';

/** The console keeps the bot's avatar here, in the deployment directory. */
const AVATAR_FILE = 'avatar.png';

export interface DesktopPetAssembly {
  /** Run controls for the menu header; see `PetBotControls`. */
  controls?: PetBotControls;
  /** Called with each World instance Core creates, for an app that calls `confirm` on it. */
  onCreate?(world: DesktopPetWorld): void;
  /** Called after the dressing page saves a look, with that look as saved. */
  onSkin?(skin: PetSkin): void;
  /** More directories of installed figure packs, besides `figures/` in the data directory. */
  packRoots?(): string[];
  /** Called after the bot changed its own settings (`pet_set`). */
  onBotChange?(): void;
  /**
   * The OpenRouter key for decider mode (src/decider.ts), read at each use, '' when there is none. Without it the
   * World stays in classic mode (the bot writes expression and motion markers).
   */
  deciderKey?(): string;
  /** Called when the mode changes, so the app rebuilds the system prefix (tools and environment prompt differ). */
  onModeChange?(mode: PetMode): void;
  /** Called after each decision (evals). */
  onDecision?(rec: DecisionRecord): void;
  /** The decisions endpoint and fetch, for evals and tests (default OpenRouter, global fetch). */
  deciderUrl?: string;
  deciderFetch?: typeof fetch;
  /** Where the decision models are listed (default OpenRouter's public list), for evals and tests. */
  deciderModelsUrl?: string;
  /**
   * Whether the person is at the computer (the system's idle seconds and screen lock) as last heard, with when; null
   * when unknown. Small talk (src/smalltalk.ts) never starts without it.
   */
  presence?(): (Presence & { at: number }) | null;
  /** When the next wake-up the bot set for itself is due (epoch ms), or null. */
  nextAlarmAt?(): number | null;
}

/** The definition, with what an embedding app lends the World. */
export function desktopPetDefinition(assembly: DesktopPetAssembly = {}): WorldDefinition<DesktopPetConfigSection> {
  return {
    id: DESKTOP_PET_ID,
    label: '桌宠',
    defaults: () => structuredClone(DESKTOP_PET_DEFAULTS),
    // ctx.cfg is the live `worlds.desktop-pet` section: hot keys are read at use
    create: (ctx) => {
      const world = new DesktopPetWorld({
        cfg: ctx.cfg,
        timezone: ctx.timezone,
        persist: (patch) => {
          ctx.persist(patch);
          // the whole look as it now is: a patch may carry only the part that changed
          if (patch.skin) assembly.onSkin?.(ctx.cfg.skin);
        },
        runtimesRoot,
        modelsDir: () => modelsDirFor(modelsRoot()),
        botName: ctx.botName,
        avatarFile: join(ctx.botDir, AVATAR_FILE),
        controls: assembly.controls,
        packRoots: () => [join(ctx.dataDir, 'figures'), ...assembly.packRoots?.() ?? []],
        packDir: () => join(ctx.dataDir, 'figures'),
        onBotChange: () => assembly.onBotChange?.(),
        ...(assembly.deciderKey ? { deciderKey: () => assembly.deciderKey!() } : {}),
        onModeChange: (mode) => assembly.onModeChange?.(mode),
        onDecision: (rec) => assembly.onDecision?.(rec),
        deciderUrl: assembly.deciderUrl,
        deciderFetch: assembly.deciderFetch,
        deciderModelsUrl: assembly.deciderModelsUrl,
        envOverrideFile: () => envPromptOverridePath(ctx.botDir, DESKTOP_PET_ID),
        ...(assembly.presence ? { presence: () => assembly.presence!() } : {}),
        ...(assembly.nextAlarmAt ? { nextAlarmAt: () => assembly.nextAlarmAt!() } : {}),
      });
      assembly.onCreate?.(world);
      return world;
    },
  };
}

export const DESKTOP_PET = desktopPetDefinition();
