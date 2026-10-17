import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stripMapComment, stripMapComments } from '../scripts/map-strip.ts';

const none = () => false;

describe('map-strip', () => {
  it('drops a trailing JS or CSS map comment whose map is gone', () => {
    expect(stripMapComment('a();\n//# sourceMappingURL=main.js.map\n', none)).toBe('a();\n');
    expect(stripMapComment('a();\r\n//# sourceMappingURL=main.js.map', none)).toBe('a();\n');
    expect(stripMapComment('b{c:d}\n/*# sourceMappingURL=x.css.map */\n', none)).toBe('b{c:d}\n');
  });

  it('keeps inline maps, maps still present, and comments that are not last', () => {
    const inline = 'a();\n//# sourceMappingURL=data:application/json;base64,e30=\n';
    expect(stripMapComment(inline, none)).toBe(inline);
    const kept = 'a();\n//# sourceMappingURL=main.js.map\n';
    expect(stripMapComment(kept, () => true)).toBe(kept);
    const mid = 'a();\n//# sourceMappingURL=main.js.map\nb();\n';
    expect(stripMapComment(mid, none)).toBe(mid);
    const str = 'x("//# sourceMappingURL=y.map");\n';
    expect(stripMapComment(str, none)).toBe(str);
  });

  it('strips a staged tree in place, checking for the sibling map', () => {
    // not the temp dir: vitest cannot load from it on Windows (CLAUDE.md)
    const dir = fileURLToPath(new URL('../node_modules/.cache/map-strip-test/', import.meta.url));
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, 'web'), { recursive: true });
    const files: Record<string, string> = {
      'web/a.js': 'a();\n//# sourceMappingURL=a.js.map\n',
      'web/b.js': 'b();\n//# sourceMappingURL=b.js.map\n',
      'web/b.js.map': '{}',
      'web/c.css': 'c{}\n/*# sourceMappingURL=c.css.map */\n',
      'web/d.txt': 'd\n//# sourceMappingURL=d.map\n',
    };
    try {
      for (const [rel, t] of Object.entries(files)) writeFileSync(join(dir, rel), t);
      expect(stripMapComments(dir)).toBe(2);
      expect(readFileSync(join(dir, 'web/a.js'), 'utf8')).toBe('a();\n');
      expect(readFileSync(join(dir, 'web/b.js'), 'utf8')).toBe(files['web/b.js']);
      expect(readFileSync(join(dir, 'web/c.css'), 'utf8')).toBe('c{}\n');
      expect(readFileSync(join(dir, 'web/d.txt'), 'utf8')).toBe(files['web/d.txt']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
