/**
 * The settings window's rules (app/settings-guard.cjs, upstream #323 and #321 in the fork's shape): the CSP added to
 * the Core's documents, which new windows open where, and where a page may navigate. main.cjs is read to check it
 * wires them to the default session and to every window.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);

type Headers = Record<string, string[] | string>;
const { SETTINGS_CSP, isLoopback, navigateRule, openRule, webOrigin, withSettingsCsp } = require('../app/settings-guard.cjs') as {
  SETTINGS_CSP: string;
  isLoopback(url: string): boolean;
  navigateRule(url: string, at: { core: string | null; pet?: string | null; current: string }): 'stay' | 'external' | 'deny';
  openRule(url: string, origins: { core: string | null; pet: string | null }): 'window' | 'external' | 'deny';
  webOrigin(url: string): string | null;
  withSettingsCsp(details: { url: string; resourceType?: string; responseHeaders?: Headers }, coreOrigin: string | null): Headers | null;
};

const core = 'http://127.0.0.1:17788';
const pet = 'http://127.0.0.1:7797';

describe('the CSP on the Core\'s documents', () => {
  it('adds a second policy next to Cortico\'s frame-ancestors, whatever the header\'s case', () => {
    const cortico = "frame-ancestors 'self' http://127.0.0.1:* http://localhost:* http://[::1]:*";
    expect(withSettingsCsp({ url: `${core}/`, resourceType: 'mainFrame', responseHeaders: { 'Content-Security-Policy': [cortico], 'Content-Type': ['text/html'] } }, core))
      .toEqual({ 'Content-Security-Policy': [cortico, SETTINGS_CSP], 'Content-Type': ['text/html'] });
    expect(withSettingsCsp({ url: `${core}/#/chat`, resourceType: 'subFrame', responseHeaders: { 'content-security-policy': cortico } }, core))
      .toEqual({ 'content-security-policy': [cortico, SETTINGS_CSP] });
    expect(withSettingsCsp({ url: `${core}/`, resourceType: 'mainFrame', responseHeaders: {} }, core)).toEqual({ 'Content-Security-Policy': [SETTINGS_CSP] });
    expect(SETTINGS_CSP).toBe("script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'");
    // the window is Cortico's WebUI, which the start page's frames embed: no frame-ancestors of its own
    expect(SETTINGS_CSP).not.toMatch(/frame-ancestors/);
  });

  it('leaves other origins, the Core\'s scripts and data, and a Core not yet up as they are', () => {
    const csp = { 'Content-Security-Policy': ['sandbox'] };
    expect(withSettingsCsp({ url: `${pet}/dress`, resourceType: 'subFrame', responseHeaders: csp }, core)).toBeNull();
    expect(withSettingsCsp({ url: 'http://127.0.0.1:17789/', resourceType: 'mainFrame', responseHeaders: csp }, core)).toBeNull();
    expect(withSettingsCsp({ url: `${core}/assets/main.js`, resourceType: 'script', responseHeaders: csp }, core)).toBeNull();
    expect(withSettingsCsp({ url: `${core}/api/state`, resourceType: 'xhr', responseHeaders: csp }, core)).toBeNull();
    expect(withSettingsCsp({ url: `${core}/`, resourceType: 'mainFrame', responseHeaders: csp }, null)).toBeNull();
    // the address only looks like the Core's: its origin is elsewhere
    expect(withSettingsCsp({ url: `${core}@example.com/`, resourceType: 'mainFrame', responseHeaders: csp }, core)).toBeNull();
  });
});

describe('new windows', () => {
  const origins = { core, pet };
  it('opens the Core and the pet\'s server as app windows, other http(s) in the browser, and drops every other scheme', () => {
    expect(openRule(`${core}/#/providers`, origins)).toBe('window');
    expect(openRule(`${core}/api/blob?handle=log:x`, origins)).toBe('window');
    expect(openRule(`${pet}/pet`, origins)).toBe('window');
    expect(openRule(`${pet}/dress`, origins)).toBe('window');
    expect(openRule('https://github.com/yxengram/Coopanion/releases/latest', origins)).toBe('external');
    expect(openRule('https://auth.openai.com/oauth/authorize', origins)).toBe('external');
    // another loopback port is no longer an app window with the settings preload
    expect(openRule('http://127.0.0.1:9999/', origins)).toBe('external');
    expect(openRule('http://localhost:17788/', origins)).toBe('external');
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x', 'ms-settings:privacy', 'smb://host/share', 'not a url']) {
      expect(openRule(url, origins), url).toBe('deny');
    }
  });

  it('compares parsed origins, so a user-info trick or a longer port is elsewhere', () => {
    expect(openRule(`${core}@example.com/`, origins)).toBe('external');
    expect(openRule('http://127.0.0.1:1778/', origins)).toBe('external');
    // a port past 65535, or one with a name after it, is no address at all
    expect(openRule(`${core}0/`, origins)).toBe('deny');
    expect(openRule(`${core}.example.com/`, origins)).toBe('deny');
    expect(webOrigin(`${core}@example.com/`)).toBe('http://example.com');
  });

  it('knows no pet origin before the pet\'s server is learnt, and no Core before it is up', () => {
    expect(openRule(`${pet}/dress`, { core, pet: null })).toBe('external');
    expect(isLoopback(`${pet}/dress`)).toBe(true);
    expect(isLoopback('http://[::1]:7797/')).toBe(true);
    expect(isLoopback('https://127.0.0.1:7797/')).toBe(false);
    expect(isLoopback('http://example.com/')).toBe(false);
    expect(openRule(`${core}/`, { core: null, pet })).toBe('external');
  });
});

describe('navigation', () => {
  it('stays on its own origin and the Core\'s; sends other http(s) to the browser and drops the rest', () => {
    expect(navigateRule(`${core}/#/dress`, { core, current: `${core}/#/home` })).toBe('stay');
    expect(navigateRule(`${pet}/dress?x=1`, { core, current: `${pet}/dress` })).toBe('stay');
    expect(navigateRule(`${core}/`, { core, current: `${pet}/dress` })).toBe('stay');
    expect(navigateRule(`${pet}/dress`, { core, current: `${core}/` })).toBe('external');
    expect(navigateRule('https://example.com/', { core, current: `${core}/` })).toBe('external');
    expect(navigateRule(`${core}@example.com/`, { core, current: `${core}/` })).toBe('external');
    expect(navigateRule('file:///C:/Windows/', { core, current: `${core}/` })).toBe('deny');
    expect(navigateRule('javascript:alert(1)', { core, current: `${core}/` })).toBe('deny');
  });

  it('lets a window just opened for the pet\'s server load it, and nothing else from about:blank', () => {
    // seen in the real app: window.open of the dress page starts on about:blank and its first load is a will-navigate
    for (const current of ['', 'about:blank']) {
      expect(navigateRule(`${pet}/dress`, { core, pet, current })).toBe('stay');
      expect(navigateRule(`${core}/`, { core, pet, current })).toBe('stay');
      expect(navigateRule('https://example.com/', { core, pet, current })).toBe('external');
      expect(navigateRule('http://127.0.0.1:9999/', { core, pet, current })).toBe('external');
    }
    // the settings page itself does not go over to the pet's server
    expect(navigateRule(`${pet}/dress`, { core, pet, current: `${core}/#/home` })).toBe('external');
  });
});

describe('main.cjs', () => {
  const main = readFileSync(join(import.meta.dirname, '../app/main.cjs'), 'utf8');
  it('adds the CSP on the default session, scoped by the Core origin asked at each response', () => {
    expect(main).toMatch(/session\.defaultSession\.webRequest\.onHeadersReceived\(\(details, answer\) => \{\n\s+const responseHeaders = withSettingsCsp\(details, coreOrigin\(\)\);/);
  });

  it('guards the settings window and each window it opens, and opens the browser only through the rules', () => {
    expect(main).toMatch(/guardWindow\(settings\.webContents\);/);
    expect(main).toMatch(/contents\.on\('did-create-window', \(child\) => guardWindow\(child\.webContents\)\);/);
    expect(main).toMatch(/contents\.on\('will-navigate', /);
    expect(main).toMatch(/const rule = openRule\(url, \{ core: coreOrigin\(\), pet: petOrigin \}\);/);
    // every shell.openExternal is behind a rule, or names the one address it opens
    const opens = main.split('\n').filter((l) => l.includes('shell.openExternal('));
    for (const line of opens) expect(line, line).toMatch(/rule === 'external'|openRule\(|RELEASES_URL|isSignInPage\(url\)/);
    expect(main).not.toMatch(/^\s*shell\.openExternal\(url\);/m);
    expect(main).not.toMatch(/127\\\.0\\\.0\\\.1\|localhost\):\\d\+/);
  });
});
