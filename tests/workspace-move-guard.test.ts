/**
 * Cortico 0.2.7+ (with upstream Coopanion v0.2.9–v0.2.13) gives Coo `move_file`: move or rename a file or a whole
 * folder, or move lines between files. A file that goes verbatim into the system prefix must not be moved or deleted
 * whole, or the prefix loses it; Cormini refuses those (`prefixResidentFiles`: the constitution, plus a partner doc a
 * persona variant names). The fork runs Cormini as it is, so this checks that every file the fork seeds into Coo's
 * workspace is one Cormini keeps in place, including when the folder holding it is moved.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { Cormini } from '../vendor/cortico/bots/cormini/persona/persona.ts';
import { nullLogger } from 'cortico/core/util.ts';
import { DEPLOYMENT, SEED_DIR, seed } from '../core/seed.ts';

let home: string;
let workspace: string;
let cormini: Cormini;

const run = (name: string, args: Record<string, unknown>): Promise<string> => {
  const tool = cormini.declareSessions()[0].tools().find((t) => t.name === name)!;
  return tool.handler(args, { role: 'main', log: nullLogger() } as never) as Promise<string>;
};
const constitution = () => readFileSync(join(workspace, 'CONSTITUTION.md'), 'utf8');
const seeded = readFileSync(join(SEED_DIR, 'CONSTITUTION.md'), 'utf8');

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'coo-move-guard-'));
  seed(home);
  workspace = join(home, DEPLOYMENT, 'workspace');
  cormini = new Cormini({ memoryDir: workspace });
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

it('the fork seeds only the constitution into the workspace, and Cormini keeps it in the prefix', () => {
  // a new seeded workspace file that the prefix reads would need its own guard (a Cormini subclass)
  expect(readdirSync(workspace).filter((f) => !f.startsWith('.'))).toEqual(['CONSTITUTION.md']);
  expect((cormini as unknown as { prefixResidentFiles(): string[] }).prefixResidentFiles()).toEqual([join(workspace, 'CONSTITUTION.md')]);
});

it('move_file and delete_file leave the constitution where it is', async () => {
  expect(await run('move_file', { from: 'CONSTITUTION.md', to: 'archive/' })).toContain('常驻系统前缀');
  expect(await run('move_file', { from: 'CONSTITUTION.md', to: 'old.md' })).toContain('常驻系统前缀');
  expect(await run('delete_file', { path: 'CONSTITUTION.md' })).not.toMatch(/^\[deleted\]/);
  expect(constitution()).toBe(seeded);
});

it('moving the whole workspace folder moves the notes and skips the constitution', async () => {
  mkdirSync(join(workspace, 'notes'), { recursive: true });
  writeFileSync(join(workspace, 'notes', 'a.md'), 'a\n');
  writeFileSync(join(workspace, 'b.md'), 'b\n');
  const out = await run('move_file', { from: '.', to: 'archive' });
  expect(out).toContain('CONSTITUTION.md');
  expect(out).toContain('常驻系统前缀');
  expect(constitution()).toBe(seeded);
  expect(existsSync(join(workspace, 'archive', 'CONSTITUTION.md'))).toBe(false);
  expect(readFileSync(join(workspace, 'archive', 'notes', 'a.md'), 'utf8')).toBe('a\n');
  expect(readFileSync(join(workspace, 'archive', 'b.md'), 'utf8')).toBe('b\n');
});
