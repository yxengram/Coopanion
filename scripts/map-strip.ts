/**
 * Drops the trailing `sourceMappingURL` comment from staged bundles whose `.map` the packer left out
 * (scripts/pack.ts), so DevTools in the installed app does not warn about a missing map. Only the last line is
 * touched, only when it is that comment and names a sibling file that does not exist; inline (`data:`) maps and
 * bundles whose map is still there stay as they are.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const TAIL = /(?:\r?\n)?(?:\/\/# sourceMappingURL=([^\s'"*]+)|\/\*# sourceMappingURL=([^\s'"*]+) \*\/)[ \t]*\r?\n?$/;

/** `text` without its trailing map comment, or `text` itself when it has none to drop. */
export function stripMapComment(text: string, exists: (ref: string) => boolean): string {
  const m = TAIL.exec(text);
  if (!m) return text;
  const ref = m[1] ?? m[2];
  if (ref.startsWith('data:') || ref.includes(':') || exists(ref)) return text;
  return text.slice(0, m.index) + '\n';
}

/** Strips every `.js`/`.mjs`/`.cjs`/`.css` under `dir` in place; returns how many files changed. */
export function stripMapComments(dir: string): number {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { n += stripMapComments(p); continue; }
    if (!e.isFile() || !/\.(?:[mc]?js|css)$/i.test(e.name)) continue;
    const text = readFileSync(p, 'utf8');
    if (!text.includes('sourceMappingURL=')) continue;
    const out = stripMapComment(text, (ref) => existsSync(join(dirname(p), ref)));
    if (out !== text) { writeFileSync(p, out); n++; }
  }
  return n;
}
