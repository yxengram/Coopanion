import type { WorldDefinition } from 'cortico/world.ts';
import { CUA_DEFAULTS, CUA_ID, type CuaConfigSection } from './config.ts';
import { cuaText } from './strings.ts';
import { CuaWorld, type CuaWorldOptions } from './world.ts';

/** The definition, with how an embedding app asks the person for permission and its language (see `CuaWorldOptions`). */
export function cuaDefinition(assembly: Pick<CuaWorldOptions, 'askPermission' | 'language' | 'labelLanguage'> = {}): WorldDefinition<CuaConfigSection> {
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
    create: (ctx) => new CuaWorld({ cfg: ctx.cfg, timezone: ctx.timezone, botName: ctx.botName, askPermission: assembly.askPermission, language: assembly.language }),
  };
}

export const CUA = cuaDefinition();
