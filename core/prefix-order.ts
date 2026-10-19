/**
 * The order of the Worlds' blocks in the system prefix: the console World's block after every other World's, as in
 * the app before Cortico 0.2 (`coopanion`, `cua`, `desktop-pet`, then the chat World).
 *
 * Why: Cortico sorts the blocks by World id (`collectWorldContexts` in vendor/cortico/src/core/prefix.ts). Up to
 * Cortico 0.1.x the chat World was `terminal` and sorted last; 0.2.0 renamed it `console`, which sorts first, and the
 * desktop-pet block became the prompt's tail. In the classic eval (scratch/next/eval, cells out/2x2*) that cost the
 * bot composite faces: putting the console block last again (ablation abl2) raised composite-face use by 5.9 points
 * [+1.8, +10.7] against an unchanged replicate, back to the level before the bump. The blocks' text is untouched;
 * only their order changes.
 *
 * The order is set on the Persona's `systemSegments`, which Cortico calls both for the prefix the bot gets
 * (`assembleSystem` in the loop) and for the WebUI's segment view (`assembleSystemSegments`), so the two keep one
 * source. The tool table keeps Cortico's own order (by World id).
 */
import type { Persona, SystemPrefixContext, WorldPrefixContext } from 'cortico/core/types.ts';
import { CONSOLE } from 'cortico/worlds/console/definition.ts';

/** The Worlds whose blocks go after the others, in this order. */
export const LAST_WORLDS: readonly string[] = [CONSOLE.id];

/** `worlds` with the LAST_WORLDS blocks moved to the end; the others keep the order they came in (Cortico's, by id). */
export function consoleLast<W extends Pick<WorldPrefixContext, 'id'>>(worlds: readonly W[]): W[] {
  const rank = (w: W) => LAST_WORLDS.indexOf(w.id);
  return [
    ...worlds.filter((w) => rank(w) < 0),
    ...worlds.filter((w) => rank(w) >= 0).sort((a, b) => rank(a) - rank(b)),
  ];
}

const ORDERED = Symbol.for('coopanion.consoleLast');

/**
 * Makes `persona` lay out the World blocks console-last (consoleLast) and returns it. The instance itself is changed,
 * not copied: Cormini's methods live on its prototype and Cortico reads the Persona's class name. Applying it twice
 * changes nothing more.
 */
export function withConsoleLast<P extends Persona>(persona: P): P {
  const marked = persona as P & { [ORDERED]?: true };
  if (marked[ORDERED]) return persona;
  const segments = persona.systemSegments.bind(persona);
  persona.systemSegments = (ctx: SystemPrefixContext) => segments({ ...ctx, worlds: consoleLast(ctx.worlds) });
  marked[ORDERED] = true;
  return persona;
}
