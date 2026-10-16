/**
 * Upstream's kit at v0.1.17 (body.js and rig.js from the tag), for the frame comparisons and for a figure as a pack
 * exported to it runs there; null in a local checkout without the tag, while on CI (which fetches the tag) a missing tag
 * fails, so the runs on it cannot skip unnoticed. The copy goes inside the project (node_modules/.cache/<name>), where
 * vitest loads it like any other module, on Windows too; each test file names its own, so files run in parallel do not
 * write over each other's.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function upstreamKit(name = 'upstream-kit-v0.1.17-figures') {
  const dir = fileURLToPath(new URL(`../../node_modules/.cache/${name}/`, import.meta.url));
  mkdirSync(dir, { recursive: true });
  try {
    for (const f of ['body.js', 'rig.js']) {
      writeFileSync(join(dir, f), execFileSync('git', ['show', `v0.1.17:packages/cortico-world-desktop-pet/web/kit/${f}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    }
  } catch (e) {
    if (process.env.CI) throw new Error(`v0.1.17 tag missing on CI (the workflow fetches it): ${e}`);
    return null;
  }
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  return import(pathToFileURL(join(dir, 'body.js')).href);
}
