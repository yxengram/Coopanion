import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(fileURLToPath(new URL('../web/pet.css', import.meta.url)), 'utf8');
/** The declarations of every rule whose selector mentions `.swap`. */
const swapRules = [...CSS.matchAll(/([^{}]*\.swap[^{}]*)\{([^}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));

describe('a dialog button with a hover label (pet.css .d-pill.swap)', () => {
  // a button that grew on hover could wrap to the next row (in English, "Having trouble?" next to OK), out from
  // under the pointer, and flicker between its labels
  it('is as wide as its wider label in both states: the labels share one grid cell and the other is only hidden', () => {
    expect(swapRules.length).toBeGreaterThan(0);
    expect(swapRules.some((r) => /display:\s*inline-grid/.test(r.body))).toBe(true);
    expect(swapRules.some((r) => /grid-area:\s*1\s*\/\s*1/.test(r.body))).toBe(true);
    const toggle = swapRules.find((r) => r.selector.includes('.d-pill-hover') && r.selector.includes('.d-pill-rest'));
    expect(toggle?.body).toMatch(/visibility:\s*hidden/);
    for (const r of swapRules) expect(r.body, r.selector).not.toMatch(/display:\s*none/);
  });

  // small bubbles with large text (window.bubbleSize .8, fontSize 1.6) wrap the wider label onto two lines: the shown one sits in the middle
  it('centres the shown label when the hidden one takes more lines', () => {
    expect(swapRules.some((r) => /display:\s*inline-grid/.test(r.body) && /align-items:\s*center/.test(r.body))).toBe(true);
  });
});

describe('bubble and text size (pet.css --bubble-size, --bubble-font)', () => {
  // pet-app.js leaves both variables unset at 1: every length they scale falls back to the factor 1
  it('scales only through calc(<px> * var(--bubble-size|--bubble-font, 1)), so at 1 every value is what it was', () => {
    const uses = [...CSS.matchAll(/var\(--bubble-(size|font)([^)]*)\)/g)];
    expect(uses.length).toBeGreaterThan(20);
    for (const m of uses) expect([', 1', ', none']).toContain(m[2]);
    expect(CSS).toMatch(/scale:var\(--bubble-size, none\)/);
  });
});

describe('the bubble text (pet.css .b-text)', () => {
  // the failure bubble ends in the issues page's address, longer than the bubble is wide
  it('breaks a word longer than the line instead of letting it run out of the bubble', () => {
    const rule = CSS.match(/^\.b-text\{([^}]*)\}/m)?.[1];
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
