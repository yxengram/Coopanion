// @vitest-environment jsdom
/**
 * The settings window's version line (console/features/release.ts, read from its staged place in build/cortico: run
 * `pnpm run build:cortico` after changing it) in a build that updates itself: the updater's steps, not a download link.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = `${join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'cortico', 'src', 'web', 'client').replaceAll('\\', '/')}/`;
const STAGED = existsSync(`${CLIENT}features/release.ts`);

/** The preload's bridge in a build that updates itself (app/settings-preload.cjs), driven by the test. */
function updater(first) {
  const listeners = new Set();
  window.coopanionUpdate = {
    step: () => first,
    onStep: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  return { tell: (step) => listeners.forEach((l) => l(step)), listening: () => listeners.size };
}

async function release() {
  vi.resetModules();
  return import(/* @vite-ignore */ `${CLIENT}features/release.ts`);
}

afterEach(() => { delete window.coopanionUpdate; document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe.skipIf(!STAGED && !process.env.CI)('the version line of a build that updates itself', () => {
  it("shows the updater's step in place of a download link, and a link to the releases only once a download failed", async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { mountRelease, TEXT } = await release();
    const S = TEXT.zh;
    const run = updater(null);
    const brand = document.createElement('div');
    const life = new AbortController();
    mountRelease(document, brand, life.signal);
    expect(brand.querySelector('.release-hint')).toBeNull();
    // the updater checks GitHub itself: the page does not
    expect(fetch).not.toHaveBeenCalled();

    run.tell({ phase: 'downloading', version: '9.9.9' });
    expect(brand.querySelector('.release-hint').textContent).toBe(S.updateDownloading('9.9.9'));
    expect(brand.querySelector('a.release-hint')).toBeNull();

    run.tell({ phase: 'ready', version: '9.9.9' });
    expect(brand.querySelectorAll('.release-hint')).toHaveLength(1);
    expect(brand.querySelector('.release-hint').textContent).toBe(S.updateReady('9.9.9'));

    run.tell({ phase: 'failed', version: '9.9.9' });
    const link = brand.querySelector('a.release-hint');
    expect(link.textContent).toBe(S.updateFailed('9.9.9'));
    expect(link.href).toBe('https://github.com/yxengram/Coopanion/releases/latest');
    expect(brand.querySelectorAll('.release-hint')).toHaveLength(1);

    life.abort();
    expect(run.listening()).toBe(0);
  });

  it('shows a step the updater reached before the window opened', async () => {
    const { mountRelease, TEXT } = await release();
    updater({ phase: 'ready', version: '9.9.9' });
    const brand = document.createElement('div');
    mountRelease(document, brand, new AbortController().signal);
    expect(brand.querySelector('.release-hint').textContent).toBe(TEXT.zh.updateReady('9.9.9'));
  });

  it('elsewhere still links to a newer release on GitHub', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ tag_name: 'v99.0.0', html_url: 'https://github.com/yxengram/Coopanion/releases/tag/v99.0.0' }), { status: 200 })));
    const { mountRelease, TEXT } = await release();
    const brand = document.createElement('div');
    mountRelease(document, brand, new AbortController().signal);
    await vi.waitFor(() => expect(brand.querySelector('a.release-hint')).not.toBeNull());
    expect(brand.querySelector('a.release-hint').textContent).toBe(TEXT.zh.update('99.0.0'));
  });
});
