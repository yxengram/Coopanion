/**
 * The OpenRouter key the desktop pet's decider mode uses (packages/cortico-world-desktop-pet/src/decider.ts), found
 * where the app already keeps one: `OPENROUTER_API_KEY` in the process environment, else the `.env` of an endpoint
 * whose base URL is OpenRouter's (named `openrouter` when the Start page made it, but any name is looked at), under
 * that endpoint's `secret` name. Read on each call (a key saved in the console counts at once); never cached,
 * written or logged here. '' when there is none.
 */
import { join } from 'node:path';
import { secretReader } from 'cortico/core/secrets.ts';
import type { CoreConfig } from 'cortico/core/types.ts';
import { vendorById, vendorOf } from 'cortico-provider-coo';

const OPENROUTER = vendorById('openrouter')!;

export function openRouterKey(providers: CoreConfig['providers'], providersDir: string): string {
  const fromEnv = process.env[OPENROUTER.secret];
  if (fromEnv) return fromEnv;
  const names = Object.keys(providers ?? {}).sort((a, b) => (a === OPENROUTER.id ? -1 : b === OPENROUTER.id ? 1 : 0));
  for (const name of names) {
    const entry = providers[name];
    if (!entry || vendorOf(entry.baseUrl)?.id !== OPENROUTER.id) continue;
    try {
      const key = secretReader(join(providersDir, name, '.env'))(entry.secret || OPENROUTER.secret);
      if (key) return key;
    } catch { /* an unreadable .env is no key */ }
  }
  return '';
}
