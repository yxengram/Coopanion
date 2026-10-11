/** A figure body for figure-frame.js tests: it turns every word down while `busy`, and `fly` always. */
export function make() {
  const b = { busy: true, did: [], step() {}, layout: () => ({}), do(w) { if (b.busy || w === 'fly') return false; b.did.push(w); return true; } };
  globalThis.__frameBody = b;
  return b;
}
