import { createRequire } from 'node:module';

/**
 * Electron fetches its binary on the first `require('electron')` when the install left it out (CI). Two test files
 * spawning it in parallel workers would each start that download, and one would run the binary while the other is
 * still writing it (ETXTBSY, EBUSY on Windows): fetch it once here, before any worker starts.
 */
export default function setup() {
  createRequire(import.meta.url)('electron');
}
