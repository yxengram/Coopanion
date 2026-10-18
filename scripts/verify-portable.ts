/**
 * `tsx scripts/verify-portable.ts [dist directory]`: checks the Windows portable zip for package.json's version
 * (scripts/portable-zip.ts) and exits 1 with the problems. The release workflow's portable job runs it.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portableZipName, verifyPortable } from './portable-zip.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(process.argv[2] ?? join(root, 'dist'));
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
const problems = verifyPortable(dist, version);
for (const p of problems) console.error(`portable zip: ${p}`);
if (problems.length) process.exit(1);
console.log(`portable zip ok: ${join(dist, portableZipName(version))}`);
