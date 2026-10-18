import { describe, expect, it } from 'vitest';
import { consoleOrigins } from '../core/console-origins.ts';

describe('console origins (the figure frame\'s ancestors besides the pet server)', () => {
  it('names the port the console listens on once known, at both loopback names', () => {
    expect(consoleOrigins({ port: 17788 }, 17790)).toEqual(['http://127.0.0.1:17790', 'http://localhost:17790']);
  });

  it('before that, every port Cortico may move on to from the configured one (5 tries), never past 65535', () => {
    expect(consoleOrigins({ port: 17788 }, null)).toEqual([17788, 17789, 17790, 17791, 17792].flatMap((p) => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]));
    expect(consoleOrigins({ port: 65534 }, null)).toEqual(['http://127.0.0.1:65534', 'http://localhost:65534', 'http://127.0.0.1:65535', 'http://localhost:65535']);
    // a port the OS picks is known only once bound
    expect(consoleOrigins({ port: 0 }, null)).toEqual([]);
    expect(consoleOrigins({ port: 0 }, 51234)).toEqual(['http://127.0.0.1:51234', 'http://localhost:51234']);
  });

  it('adds [::1] only for a console listening there, and never a wildcard', () => {
    expect(consoleOrigins({ port: 17788, host: '::1' }, 17788)).toEqual(['http://127.0.0.1:17788', 'http://localhost:17788', 'http://[::1]:17788']);
    expect(consoleOrigins({ port: 17788, host: '0.0.0.0' }, null).some((o) => o.includes('*'))).toBe(false);
  });
});
