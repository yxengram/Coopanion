/**
 * telemetry-server/: the summary runs in a worker thread (upstream 18a9539f) and reads each day record's models and
 * extensions from two narrow tables that a migration fills from the records stored before them (upstream ed8bdf17).
 * Both promise the same `/v1/stats` answer as before, so a database is filled by the server as it was
 * (tests/fixtures/telemetry-server-before.js) and today's server is started on the same file.
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync as Database } from 'node:sqlite';

// vite 5 does not know node:sqlite, so it is loaded past it
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
type DatabaseSync = Database;

const SERVER = fileURLToPath(new URL('../telemetry-server/server.mjs', import.meta.url));
const SERVER_BEFORE = fileURLToPath(new URL('./fixtures/telemetry-server-before.js', import.meta.url));
// test-only files live under node_modules/.cache (vitest on Windows cannot load from the temp dir)
const ROOT = fileURLToPath(new URL('../node_modules/.cache/telemetry-server-test/', import.meta.url));
const TOKEN = 'test-token';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
/** A UTC date `n` days ago, as SQLite's date('now', ...) counts. */
const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

type Server = { port: number; stop: () => Promise<void> };
const running = new Set<ChildProcess>();

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

/** Starts a server file on `dbFile`; the start line prints the configured port, so a free one is picked first. */
async function start(script: string, dbFile: string, token = TOKEN): Promise<Server> {
  const port = await freePort();
  const child = spawn(process.execPath, [script], {
    env: { ...process.env, PORT: String(port), DB_FILE: dbFile, STATS_TOKEN: token },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  running.add(child);
  let stderr = '';
  child.stderr!.on('data', (c) => { stderr += c; });
  await new Promise<void>((resolve, reject) => {
    let out = '';
    child.stdout!.on('data', (c) => { out += c; if (out.includes('coopanion telemetry on')) resolve(); });
    child.once('exit', (code) => reject(new Error(`server exited with ${code}: ${stderr}`)));
  });
  // the SQLite and WAL files stay locked on Windows until the process is gone
  const stop = () => new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) { running.delete(child); resolve(); return; }
    child.once('exit', () => { running.delete(child); resolve(); });
    child.kill();
  });
  return { port, stop };
}

async function post(s: Server, body: unknown): Promise<number> {
  const res = await fetch(`http://127.0.0.1:${s.port}/v1/report`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return res.status;
}

async function summary(s: Server, auth: string | null = `Bearer ${TOKEN}`): Promise<{ status: number; body: Record<string, any> }> {
  const res = await fetch(`http://127.0.0.1:${s.port}/v1/stats`, auth === null ? {} : { headers: { authorization: auth } });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

/** The summary without its time, each list in a fixed order: rows tied on the sort key may come in any order. */
function comparable(stats: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(stats)) {
    if (k === 'generatedAt') continue;
    out[k] = Array.isArray(v) ? [...v].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))) : v;
  }
  return out;
}

function read<T>(dbFile: string, fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try { return fn(db); } finally { db.close(); }
}
const count = (db: DatabaseSync, sql: string) => (db.prepare(sql).get() as { n: number }).n;

let seq = 0;
function dbFile(): string {
  const dir = join(ROOT, `${process.pid}-${++seq}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'telemetry.sqlite');
}

const MODEL_DS = {
  vendor: 'deepseek', model: 'deepseek-chat', endpointKind: 'builtin',
  calls: 10, failed: 2, failedStatus: { 429: 1, 500: 1 }, aborted: 1, tokensIn: 1000, tokensCached: 200, tokensOut: 300,
};
const MODEL_LOCAL = {
  vendor: 'kind:coo', model: 'custom', endpointKind: 'custom-local',
  calls: 4, failed: 1, failedStatus: { none: 1 }, aborted: 0, tokensIn: 40, tokensCached: 0, tokensOut: 8,
};
/** As 0.1.10 sent it: no `aborted`, no `failedStatus`. */
const MODEL_OLD = { vendor: 'deepseek', model: 'deepseek-chat', endpointKind: 'builtin', calls: 5, failed: 3, tokensIn: 50, tokensCached: 0, tokensOut: 5 };
const MODEL_REMOTE = {
  vendor: 'kind:openai', model: 'custom', endpointKind: 'custom-remote',
  calls: 2, failed: 2, failedStatus: { 401: 2 }, aborted: 0, tokensIn: 0, tokensCached: 0, tokensOut: 0,
};
const install = (id: string, firstDate: string) => ({
  installId: id, version: '0.12.0', os: 'darwin', osRelease: '25.0.0', arch: 'arm64', locale: 'zh-CN', timeZone: 'Asia/Shanghai', firstDate,
});

/** Two installs: models of each kind, a day with neither list, a record older than the 30-day window, a crash and a source answer. */
const REPORTS = [
  {
    ...install(A, ago(10)),
    events: [
      { type: 'first_launch', ts: `${ago(10)}T01:00:00.000Z` },
      { type: 'source', ts: `${ago(10)}T01:01:00.000Z`, answer: 'friend' },
      { type: 'crash', ts: `${ago(5)}T02:00:00.000Z`, where: 'core', error: 'TypeError', code: null, frames: ['core/boot.ts:10'], exitCode: 1 },
    ],
    days: [
      { date: ago(40), runningMinutes: 5, interactedMinutes: 1, messagesText: 1, models: [MODEL_DS], extensions: [{ name: 'old-ext', version: '1.0.0', kind: 'world' }] },
      { date: ago(10), runningMinutes: 30, interactedMinutes: 5, messagesText: 3, messagesVoice: 1, models: [MODEL_DS, MODEL_LOCAL],
        extensions: [{ name: 'cortico-world-weather', version: '0.1.0', kind: 'world' }, { name: 'private', version: '1.0.0', kind: 'bot' }] },
      { date: ago(9), runningMinutes: 10, interactedMinutes: 2, messagesText: 1 },
    ],
  },
  {
    ...install(B, ago(3)),
    events: [{ type: 'crash', ts: `${ago(2)}T03:00:00.000Z`, where: 'core', error: 'TypeError', code: null, frames: ['core/boot.ts:10'], exitCode: 1 }],
    days: [
      { date: ago(3), runningMinutes: 20, interactedMinutes: 4, messagesText: 2, models: [MODEL_OLD, MODEL_REMOTE],
        extensions: [{ name: 'cortico-world-weather', version: '0.1.1', kind: 'world' }] },
      { date: ago(2), runningMinutes: 7, interactedMinutes: 0, messagesText: 0, models: [], extensions: [] },
    ],
  },
];

afterEach(async () => {
  await Promise.all([...running].map((c) => new Promise<void>((resolve) => {
    if (c.exitCode !== null || c.signalCode !== null) return resolve();
    c.once('exit', () => resolve());
    c.kill();
  })));
  running.clear();
});
// a process that just ended can hold the -wal/-shm files on Windows for a moment
afterAll(() => rmSync(ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

describe('telemetry-server: a database filled before the narrow tables', () => {
  it('is migrated once on start and summarised as the old server did', async () => {
    const file = dbFile();
    const before = await start(SERVER_BEFORE, file);
    for (const r of REPORTS) expect(await post(before, r)).toBe(204);
    const old = await summary(before);
    expect(old.status).toBe(200);
    await before.stop();

    read(file, (db) => {
      expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(0);
      expect(count(db, `SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'day_models'`)).toBe(0);
      expect(count(db, `SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'days_date'`)).toBe(1);
    });

    const after = await start(SERVER, file);
    read(file, (db) => {
      expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(1);
      const names = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as Array<{ name: string }>).map((r) => r.name);
      expect(names).not.toContain('days_date');
      expect(names).toEqual(expect.arrayContaining(['days_by_date', 'days_by_install', 'events_by_type', 'day_models_by_install', 'day_extensions_by_install']));
      // every stored record's entries, the one older than the summary's 30 days included
      expect(count(db, 'SELECT COUNT(*) AS n FROM day_models')).toBe(5);
      expect(count(db, 'SELECT COUNT(*) AS n FROM day_extensions')).toBe(4);
      expect(db.prepare(`SELECT vendor, endpoint_kind AS kind, model, calls, failed, aborted, failed_status AS fs FROM day_models
        WHERE install_id = ? AND date = ?`).get(B, ago(3))).toEqual({ vendor: 'deepseek', kind: 'builtin', model: 'deepseek-chat', calls: 5, failed: 3, aborted: null, fs: null });
    });

    const now = await summary(after);
    expect(now.status).toBe(200);
    expect(comparable(now.body)).toEqual(comparable(old.body));

    // worked out by hand, so a change both servers share cannot pass
    // the record older than 30 days stays out; the most-used model comes first, the tied two in any order
    expect(now.body.models[0]).toEqual(
      { vendor: 'deepseek', model: 'deepseek-chat', installs: 2, calls: 15, failed: 5, aborted: 1, tokensIn: 1050, tokensCached: 200, tokensOut: 305 });
    expect(comparable({ m: now.body.models.slice(1) }).m).toEqual(comparable({ m: [
      { vendor: 'custom-local via coo', model: 'custom', installs: 1, calls: 4, failed: 1, aborted: 0, tokensIn: 40, tokensCached: 0, tokensOut: 8 },
      { vendor: 'custom-remote via openai', model: 'custom', installs: 1, calls: 2, failed: 2, aborted: 0, tokensIn: 0, tokensCached: 0, tokensOut: 0 },
    ] }).m);
    expect(comparable({ f: now.body.failures }).f).toEqual(comparable({ f: [
      { vendor: 'deepseek', model: 'deepseek-chat', status: '429', installs: 1, failed: 1 },
      { vendor: 'deepseek', model: 'deepseek-chat', status: '500', installs: 1, failed: 1 },
      { vendor: 'custom-local via coo', model: 'custom', status: 'none', installs: 1, failed: 1 },
      { vendor: 'custom-remote via openai', model: 'custom', status: '401', installs: 1, failed: 2 },
    ] }).f);
    expect(comparable({ e: now.body.extensions }).e).toEqual([
      { name: 'cortico-world-weather', installs: 2 },
      { name: 'private', installs: 1 },
    ]);
    expect(now.body.crashes).toEqual([
      { where: 'core', error: 'TypeError', code: null, frame: 'core/boot.ts:10', exitCode: 1, installs: 2, n: 2, last: `${ago(2)}T03:00:00.000Z` },
    ]);
    expect(now.body.installs).toEqual({ total: 2, uninstalled: 0, telemetryOff: 0 });
    expect(now.body.activeInteracted).toEqual({ day: 0, week: 1, month: 2 });
    expect(now.body.sources).toEqual(expect.arrayContaining([{ source: 'friend', n: 1 }, { source: 'unanswered', n: 1 }]));
    expect(now.body.retentionOpened.find((r: { cohort: string }) => r.cohort === ago(10))).toMatchObject({ installs: 1, d1: 1, d7: 0 });
    expect(now.body.retentionInteracted.find((r: { cohort: string }) => r.cohort === ago(3))).toMatchObject({ installs: 1, d1: 0 });
    expect(now.body.dailyActive.find((r: { date: string }) => r.date === ago(10))).toEqual({ date: ago(10), opened: 1, interacted: 1, messages: 4, interactedMinutes: 5 });

    // a restart does not run the migration again: a row only the narrow table has survives it
    await after.stop();
    const w = new DatabaseSync(file);
    w.prepare(`INSERT INTO day_extensions VALUES (?, ?, ?)`).run(A, ago(1), 'sentinel');
    w.close();
    const again = await start(SERVER, file);
    read(file, (db) => {
      expect(count(db, `SELECT COUNT(*) AS n FROM day_extensions WHERE name = 'sentinel'`)).toBe(1);
      expect(count(db, 'SELECT COUNT(*) AS n FROM day_models')).toBe(5);
    });
    expect((await summary(again)).body.extensions).toEqual(expect.arrayContaining([{ name: 'sentinel', installs: 1 }]));
  });
});

describe('telemetry-server: records that are not as the app sends them (not in upstream)', () => {
  it('starts on a database whose old records have entries that are not objects, and migrates the rest', async () => {
    const file = dbFile();
    const before = await start(SERVER_BEFORE, file);
    expect(await post(before, { ...install(A, ago(40)), events: [], days: [
      { date: ago(40), runningMinutes: 1, models: ['x', MODEL_DS], extensions: ['y', { name: 'kept', version: '1.0.0', kind: 'world' }] },
      { date: ago(5), runningMinutes: 1, models: [MODEL_LOCAL, 3], extensions: [null] },
    ] })).toBe(204);
    await before.stop();
    const s = await start(SERVER, file);
    read(file, (db) => {
      expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(1);
      expect(count(db, 'SELECT COUNT(*) AS n FROM day_models')).toBe(2);
      expect(count(db, 'SELECT COUNT(*) AS n FROM day_extensions')).toBe(1);
    });
    expect((await summary(s)).status).toBe(200);
  });

  it('keeps answering the summary after a record whose failedStatus is not JSON, and stores the entries that are objects', async () => {
    const s = await start(SERVER, dbFile());
    for (const r of REPORTS) expect(await post(s, r)).toBe(204);
    const good = await summary(s);
    expect(await post(s, { ...install(B, ago(3)), events: [], days: [
      { date: ago(1), runningMinutes: 1, models: [{ ...MODEL_REMOTE, failedStatus: 'x' }, 'not a model', { ...MODEL_LOCAL, failedStatus: '{"500":' }], extensions: ['z'] },
    ] })).toBe(204);
    const now = await summary(s);
    expect(now.status).toBe(200);
    expect(comparable({ f: now.body.failures }).f).toEqual(comparable({ f: good.body.failures }).f);
    expect(now.body.models).toEqual(expect.arrayContaining([
      { vendor: 'custom-remote via openai', model: 'custom', installs: 1, calls: 4, failed: 4, aborted: 0, tokensIn: 0, tokensCached: 0, tokensOut: 0 },
    ]));
  });
});

describe('telemetry-server: today\'s server', () => {
  it('starts on an empty file and answers the same summary as the old server did', async () => {
    const oldFile = dbFile();
    const before = await start(SERVER_BEFORE, oldFile);
    const old = await summary(before);
    await before.stop();
    const file = dbFile();
    const s = await start(SERVER, file);
    const now = await summary(s);
    expect(now.status).toBe(200);
    expect(comparable(now.body)).toEqual(comparable(old.body));
    expect(now.body.models).toEqual([]);
    expect(now.body.extensions).toEqual([]);
    read(file, (db) => expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(1));
  });

  it('replaces a day record\'s rows when the app sends the day again, and keeps each day\'s rows apart', async () => {
    const file = dbFile();
    const s = await start(SERVER, file);
    for (const r of REPORTS) expect(await post(s, r)).toBe(204);
    expect(await post(s, { ...install(A, ago(10)), events: [], days: [{ date: ago(10), runningMinutes: 31, interactedMinutes: 6, models: [MODEL_LOCAL] }] })).toBe(204);
    read(file, (db) => {
      expect(count(db, `SELECT COUNT(*) AS n FROM day_models WHERE install_id = '${A}' AND date = '${ago(10)}'`)).toBe(1);
      expect(count(db, `SELECT COUNT(*) AS n FROM day_extensions WHERE install_id = '${A}' AND date = '${ago(10)}'`)).toBe(0);
      // the other days' rows are untouched
      expect(count(db, 'SELECT COUNT(*) AS n FROM day_models')).toBe(4);
      expect(count(db, 'SELECT COUNT(*) AS n FROM day_extensions')).toBe(2);
    });
    const { body } = await summary(s);
    expect(body.models).toEqual(expect.arrayContaining([
      { vendor: 'deepseek', model: 'deepseek-chat', installs: 1, calls: 5, failed: 3, aborted: null, tokensIn: 50, tokensCached: 0, tokensOut: 5 },
      { vendor: 'custom-local via coo', model: 'custom', installs: 1, calls: 4, failed: 1, aborted: 0, tokensIn: 40, tokensCached: 0, tokensOut: 8 },
    ]));
    expect(body.extensions).toEqual([{ name: 'cortico-world-weather', installs: 1 }]);
  });

  it('answers summaries that arrive together with one computation, and computes the next one again', async () => {
    const s = await start(SERVER, dbFile());
    for (const r of REPORTS) expect(await post(s, r)).toBe(204);
    const [one, two, three, four, posted] = await Promise.all([summary(s), summary(s), summary(s), summary(s), post(s, REPORTS[1])]);
    expect(posted).toBe(204);
    const times = new Set([one, two, three, four].map((r) => r.body.generatedAt));
    expect(times.size).toBe(1);
    // the next one is computed again
    const later = await summary(s);
    expect(later.body.generatedAt > one.body.generatedAt).toBe(true);
  });

  it('refuses the summary without the token, and always when none is configured', async () => {
    const s = await start(SERVER, dbFile());
    expect((await summary(s, null)).status).toBe(401);
    expect((await summary(s, 'Bearer wrong')).status).toBe(401);
    const none = await start(SERVER, dbFile(), '');
    expect((await summary(none, 'Bearer ')).status).toBe(401);
    expect((await fetch(`http://127.0.0.1:${none.port}/healthz`)).status).toBe(200);
  });
});
