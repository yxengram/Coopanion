/**
 * Upstream's own pack reader (packages/cortico-world-desktop-pet/src/packs.ts and the modules it loads) at its current
 * release, for checking that the packs we export install there too, not only in v0.1.17 (upstream-kit.js).
 *
 * The fork has tags of its own named like upstream's (v0.2.0 onwards), so upstream's release tag is fetched under a
 * namespaced ref instead (CI: `git fetch --no-tags https://github.com/Pal-AI-Lab/Coopanion
 * refs/tags/v0.2.3:refs/upstream-tags/v0.2.3`). Without that ref a local checkout gets null and the checks skip; on CI a
 * missing ref fails, so they cannot skip unnoticed. The copy goes inside the project (node_modules/.cache/<name>), where
 * vitest loads it on Windows too; each caller names its own directory.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Upstream's release the exported packs are checked against (upstream main has the same pack reader). Bump it, with
 * the fetch line in .github/workflows/ci.yml and docs/DEVELOPMENT.md, when upstream releases.
 */
export const UPSTREAM_RELEASE = 'v0.2.3';
export const UPSTREAM_RELEASE_REF = `refs/upstream-tags/${UPSTREAM_RELEASE}`;

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC = 'packages/cortico-world-desktop-pet/src';
const WEB = 'packages/cortico-world-desktop-pet/web';
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });

/** The relative modules `src` loads at run time (type-only imports are erased and need no copy). */
function valueImports(src) {
  const out = [];
  for (const [, spec] of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'";]*?\bfrom\s*'(\.[^']+)'/gm)) out.push(spec);
  for (const [, spec] of src.matchAll(/^\s*import\s*'(\.[^']+)'/gm)) out.push(spec);
  return out;
}

/**
 * `{ readManifest, scanPacks, builtins, ref }` from upstream's packs.ts at `ref`, or null without the ref outside CI.
 * `builtins(dir)` writes upstream's own built-in figures' manifests at the ref under `dir` and returns them in the shape
 * scanPacks takes, so a pack can be scanned next to them (an id clash is a problem there).
 */
export async function upstreamPacks(name, ref = UPSTREAM_RELEASE_REF) {
  try {
    git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  } catch (e) {
    if (process.env.CI) throw new Error(`${ref} missing on CI (the workflow fetches it): ${e}`);
    return null;
  }
  const dir = fileURLToPath(new URL(`../../node_modules/.cache/${name}/`, import.meta.url));
  // the module closure of packs.ts, as git has it at the ref
  const todo = ['packs.ts'], done = new Set();
  while (todo.length) {
    const rel = todo.pop();
    if (done.has(rel)) continue;
    done.add(rel);
    const src = git('show', `${ref}:${SRC}/${rel}`);
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), src);
    for (const spec of valueImports(src)) todo.push(posix.normalize(posix.join(posix.dirname(rel), spec)));
  }
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  const mod = await import(pathToFileURL(join(dir, 'packs.ts')).href);
  const builtinIds = git('ls-tree', '--name-only', `${ref}:${WEB}/`).split('\n').filter(Boolean)
    .filter((id) => { try { git('cat-file', '-e', `${ref}:${WEB}/${id}/figure.json`); return true; } catch { return false; } });
  const builtins = (into) => builtinIds.map((id) => {
    const d = join(into, id);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'figure.json'), git('show', `${ref}:${WEB}/${id}/figure.json`));
    return { dir: d, base: `/web/${id}/` };
  });
  return { readManifest: mod.readManifest, scanPacks: mod.scanPacks, builtins, builtinIds, ref, modules: [...done] };
}
