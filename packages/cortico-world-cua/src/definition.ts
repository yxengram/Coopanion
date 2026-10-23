import type { WorldDefinition } from 'cortico/world.ts';
import { CUA_DEFAULTS, CUA_ID, type CuaConfigSection } from './config.ts';
import { cuaText } from './strings.ts';
import { CuaWorld, type CuaWorldOptions } from './world.ts';

/**
 * What an embedding app lends the World (see `CuaWorldOptions`): how it asks the person for permission, its language,
 * and the bot's name as it is now (read at each question; the name the World was mounted with when absent).
 */
export type CuaAssembly = Pick<CuaWorldOptions, 'askPermission' | 'language' | 'labelLanguage'> & { botName?: () => string };

/** The definition, with what the embedding app lends (`CuaAssembly`). */
export function cuaDefinition(assembly: CuaAssembly = {}): WorldDefinition<CuaConfigSection> {
  return {
    id: CUA_ID,
    get label() { return cuaText(assembly.labelLanguage?.() ?? 'zh').console.label; },
    defaults: () => structuredClone(CUA_DEFAULTS),
    // the console shows why the World cannot run, in the app language
    preflight: () => {
      const t = cuaText(assembly.language?.() ?? 'zh').preflight;
      if (process.platform === 'linux' && !process.env.DISPLAY) throw new Error(t.noDisplay);
      if (!['win32', 'darwin', 'linux'].includes(process.platform)) throw new Error(t.unsupported);
    },
    // ctx.cfg is the live `worlds.cua` section: every key is read at use
    create: (ctx) => new CuaWorld({ cfg: ctx.cfg, timezone: ctx.timezone, botName: () => assembly.botName?.() ?? ctx.botName, askPermission: assembly.askPermission, language: assembly.language }),
  };
}

export const CUA = cuaDefinition();
