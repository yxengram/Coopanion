/**
 * What the settings window may run, open and go to (upstream #323 and #321, in the fork's shape): the window shows
 * Cortico's WebUI straight from the Core's origin (`http://127.0.0.1:<port>`), in the default session, so these
 * rules are applied by app/main.cjs to that window and to every window it opens. Apart from Electron so they
 * can be tested (tests/settings-guard.test.ts).
 *
 * - Documents from the Core's origin get a second Content-Security-Policy, SETTINGS_CSP: scripts only from that
 *   origin, which serves the WebUI's bundles and the extensions' page bundles too, no plugins, no `<base>`, and
 *   forms only to that origin. Cortico's own header (`frame-ancestors`, who may frame the WebUI) is kept: a
 *   second header adds its rules, it never relaxes the first. Other origins' documents (the pet's pages in
 *   frames) are left as their servers send them.
 * - A new window opens as an app window only for the Core's origin and the desktop-pet World's server (its pages
 *   in a window of their own); any other http(s) address goes to the system browser, and every other scheme
 *   (`file:`, `javascript:`, custom protocols) is dropped. Origins are compared parsed, so
 *   `http://127.0.0.1:<port>@elsewhere/` is elsewhere.
 * - A page navigates only within its own origin and the Core's; an http(s) address elsewhere opens in the
 *   system browser instead, and anything else is dropped. A window just opened (still on `about:blank`) goes on to
 *   the pet's server too: its first load is a navigation like any other.
 */

const SETTINGS_CSP = "script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'";

/** The origin of an http(s) address, or null for anything else (another scheme, not a URL). */
function webOrigin(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** A loopback http address (`127.0.0.1`, `localhost`, `[::1]`), where another local server such as the pet's may answer. */
function isLoopback(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * The response headers of `details` (Electron's onHeadersReceived) with SETTINGS_CSP added, when it is a
 * document from `coreOrigin`; null to leave the response as it is.
 * @param {{ url: string, resourceType?: string, responseHeaders?: Record<string, string[] | string> }} details
 * @param {string | null} coreOrigin
 */
function withSettingsCsp(details, coreOrigin) {
  if (!coreOrigin || webOrigin(details.url) !== coreOrigin) return null;
  if (details.resourceType !== 'mainFrame' && details.resourceType !== 'subFrame') return null;
  const headers = { ...(details.responseHeaders ?? {}) };
  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'content-security-policy') ?? 'Content-Security-Policy';
  const had = headers[key];
  headers[key] = [...(had === undefined ? [] : Array.isArray(had) ? had : [had]), SETTINGS_CSP];
  return headers;
}

/**
 * What a `window.open` or a `target=_blank` link of the window does: `window` (an app window), `external` (the
 * system browser) or `deny`.
 * @param {string} url
 * @param {{ core: string | null, pet: string | null }} origins
 */
function openRule(url, { core, pet }) {
  const origin = webOrigin(url);
  if (!origin) return 'deny';
  if (origin === core || origin === pet) return 'window';
  return 'external';
}

/**
 * What a navigation of a page from `current` to `url` does: `stay` (it goes ahead), `external` (prevented, and
 * opened in the system browser) or `deny` (prevented).
 * @param {string} url
 * @param {{ core: string | null, pet?: string | null, current: string }} at
 */
function navigateRule(url, { core, pet = null, current }) {
  const origin = webOrigin(url);
  if (!origin) return 'deny';
  const here = webOrigin(current);
  if (origin === core || origin === here || (!here && origin === pet)) return 'stay';
  return 'external';
}

module.exports = { SETTINGS_CSP, isLoopback, navigateRule, openRule, webOrigin, withSettingsCsp };
