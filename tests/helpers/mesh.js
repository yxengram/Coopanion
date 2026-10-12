/**
 * A part's mesh as kit/rig.js draws it, without a GPU: its grid's vertices moved through its deformer chain with a
 * frame's states, and linear between them on the two triangles of each cell. `meshGap` tells how far two parts' meshes
 * put the same rest point apart (an overlay sliding against the drawing under it).
 */

/** Where rest point (x, y) lands through deformer `id` and its parents (kit/rig.js applyChain). */
export function chainPoint(deformers, st, id, x, y) {
  for (let d = id; d; d = deformers[d].parent) {
    const D = deformers[d], s = st[d];
    if (!s) continue;
    if (D.kind === 'rot') {
      const [px, py] = D.pivot, a = (s.a || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
      const sx = s.sx ?? s.s ?? 1, sy = s.sy ?? s.s ?? 1;
      const lx = (x - px) * sx, ly = (y - py) * sy;
      x = px + (s.tx || 0) + lx * c - ly * sn;
      y = py + (s.ty || 0) + lx * sn + ly * c;
    } else if (D.kind === 'warp' && s.fn) {
      const [x0, y0, x1, y1] = D.rect;
      const u = Math.min(1, Math.max(0, (x - x0) / (x1 - x0))), v = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
      const r = s.fn(u, v, x, y);
      x += r[0]; y += r[1];
    }
  }
  return [x, y];
}

/** Where rest point (x, y) inside part `p`'s box shows through its mesh (grid, default [6, 6] as the kit's). */
export function meshPoint(deformers, st, p, x, y) {
  const [bx, by, w, h] = p.box, [nx, ny] = p.grid || [6, 6];
  const fi = Math.min(nx - 1e-9, Math.max(0, (x - bx) / w * nx)), fj = Math.min(ny - 1e-9, Math.max(0, (y - by) / h * ny));
  const i = Math.floor(fi), j = Math.floor(fj), s = fi - i, t = fj - j;
  const V = (ii, jj) => chainPoint(deformers, st, p.parent, bx + w * ii / nx, by + h * jj / ny);
  // (the kit's two triangles per cell: a b c and b d c)
  if (s + t <= 1) { const a = V(i, j), b = V(i + 1, j), c = V(i, j + 1); return [0, 1].map(k => a[k] + s * (b[k] - a[k]) + t * (c[k] - a[k])); }
  const b = V(i + 1, j), c = V(i, j + 1), d = V(i + 1, j + 1);
  return [0, 1].map(k => d[k] + (1 - s) * (c[k] - d[k]) + (1 - t) * (b[k] - d[k]));
}

/** The most parts `a` and `b` put the same rest point apart, over `a`'s box (n x n samples; rig units). */
export function meshGap(deformers, st, a, b, n = 24) {
  let worst = 0;
  const [x, y, w, h] = a.box;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const px = x + w * i / n, py = y + h * j / n;
    const p = meshPoint(deformers, st, a, px, py), q = meshPoint(deformers, st, b, px, py);
    worst = Math.max(worst, Math.hypot(p[0] - q[0], p[1] - q[1]));
  }
  return worst;
}
