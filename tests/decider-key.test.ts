import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openRouterKey } from '../core/decider-key.ts';
import { vendorById, vendorEntry } from 'cortico-provider-coo';

// test-only files live under node_modules/.cache (vitest on Windows cannot load from the temp dir; these are only read)
const root = () => {
  const base = join(process.cwd(), 'node_modules', '.cache');
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, 'decider-key-'));
};
const OR = vendorById('openrouter')!;
const saved = process.env.OPENROUTER_API_KEY;
afterEach(() => {
  if (saved === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = saved;
});

function endpoint(dir: string, name: string, key: string | null, secret = OR.secret) {
  mkdirSync(join(dir, name), { recursive: true });
  if (key !== null) writeFileSync(join(dir, name, '.env'), `${secret}=${key}\n`);
}

describe('the OpenRouter key decider mode uses', () => {
  it('the environment first, then an OpenRouter endpoint of any name, else none', () => {
    delete process.env.OPENROUTER_API_KEY;
    const dir = root();
    const deepseek = { ...vendorEntry(vendorById('deepseek')!) };
    expect(openRouterKey({ deepseek } as never, dir)).toBe('');
    endpoint(dir, 'deepseek', 'sk-deep', 'DEEPSEEK_API_KEY');
    // an endpoint on OpenRouter's base URL, under another name and its own secret name
    endpoint(dir, 'my-router', 'sk-or-file', 'MY_KEY');
    const providers = { deepseek, 'my-router': { ...vendorEntry(OR), secret: 'MY_KEY' } };
    expect(openRouterKey(providers as never, dir)).toBe('sk-or-file');
    // one with no key yet does not hide another that has one
    endpoint(dir, 'openrouter', null);
    expect(openRouterKey({ ...providers, openrouter: vendorEntry(OR) } as never, dir)).toBe('sk-or-file');
    process.env.OPENROUTER_API_KEY = 'sk-or-env';
    expect(openRouterKey(providers as never, dir)).toBe('sk-or-env');
  });

  it('sees an endpoint added to the live config after start', () => {
    delete process.env.OPENROUTER_API_KEY;
    const dir = root();
    const providers: Record<string, unknown> = {};
    expect(openRouterKey(providers as never, dir)).toBe('');
    providers.openrouter = vendorEntry(OR);
    endpoint(dir, 'openrouter', 'sk-or-new');
    expect(openRouterKey(providers as never, dir)).toBe('sk-or-new');
  });

  // Cortico #268: an empty `NAME=` line is no key; the next line (another service's key) is not read as its value
  it('an empty OPENROUTER_API_KEY= line is no key, and the line after it is not taken for one', () => {
    delete process.env.OPENROUTER_API_KEY;
    const dir = root();
    mkdirSync(join(dir, 'openrouter'), { recursive: true });
    writeFileSync(join(dir, 'openrouter', '.env'), `${OR.secret}=\nDEEPSEEK_API_KEY=sk-deep-other\n`);
    expect(openRouterKey({ openrouter: vendorEntry(OR) } as never, dir)).toBe('');
    writeFileSync(join(dir, 'openrouter', '.env'), `${OR.secret}= \t\r\n  sk-next-line\n`);
    expect(openRouterKey({ openrouter: vendorEntry(OR) } as never, dir)).toBe('');
  });
});
