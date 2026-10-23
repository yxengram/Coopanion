import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** `cortico/*` resolves to the vendored Cortico sources, as tsconfig.json says. */
const CORTICO_SRC = fileURLToPath(new URL('./vendor/cortico/src/', import.meta.url));

export default defineConfig({
  resolve: { alias: [{ find: /^cortico\//, replacement: CORTICO_SRC }] },
  test: {
    // Node 25+ has its own localStorage/sessionStorage globals, which hide a jsdom test's (upstream #307)
    setupFiles: ['tests/setup/jsdom-storage.ts'],
    include: ['tests/**/*.test.{ts,js}', 'packages/cortico-provider-coo/tests/**/*.test.ts'],
    env: { CORTICO_LANGUAGE: 'zh' },
    globalSetup: ['tests/global-setup.ts'],
    testTimeout: 20000,
    // a busy Windows runner takes longer than the 1 s default to reach what a poll waits for (upstream #329)
    expect: { poll: { timeout: 10_000 } },
    pool: 'forks',
  },
});
