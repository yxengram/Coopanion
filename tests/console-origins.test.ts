import { createServer, type Server } from 'node:net';
import { describe, expect, it } from 'vitest';
import { consoleOrigins, portsBusy } from '../core/console-origins.ts';

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

describe('the console ports a failed start found taken (portsBusy, companion:ports-busy)', () => {
  it('names the configured port and the last one Cortico tried, for a listen error inside its 5 tries', () => {
    const err = (code: string, port: number) => Object.assign(new Error(`listen ${code}`), { code, port });
    expect(portsBusy(err('EADDRINUSE', 17792), { port: 17788 })).toEqual({ from: 17788, to: 17792 });
    // Windows reserves port ranges: the listen fails with EACCES, which Cortico also moves on from
    expect(portsBusy(err('EACCES', 17792), { port: 17788 })).toEqual({ from: 17788, to: 17792 });
  });

  it('is null for any other failure: another code, no port, a port the OS picks, a port outside the console range', () => {
    const err = (code: string, port?: number) => Object.assign(new Error(code), { code, port });
    expect(portsBusy(err('ECONNRESET', 17792), { port: 17788 })).toBeNull();
    expect(portsBusy(err('EADDRINUSE'), { port: 17788 })).toBeNull();
    expect(portsBusy(err('EADDRINUSE', 0), { port: 0 })).toBeNull();
    // (another server of the Core, such as the pet World's, failing on its own port)
    expect(portsBusy(err('EADDRINUSE', 17793), { port: 17788 })).toBeNull();
    expect(portsBusy(err('EADDRINUSE', 17787), { port: 17788 })).toBeNull();
    expect(portsBusy(new Error('locked'), { port: 17788 })).toBeNull();
    expect(portsBusy(undefined, { port: 17788 })).toBeNull();
  });

  it('reads the error Node gives a listen on a taken port, as Cortico rethrows it', async () => {
    const held: Server = createServer();
    await new Promise<void>((r) => held.listen(0, '127.0.0.1', r));
    const port = (held.address() as { port: number }).port;
    const second = createServer();
    try {
      const err = await new Promise<unknown>((r) => { second.once('error', r); second.listen(port, '127.0.0.1'); });
      expect(portsBusy(err, { port: port - 4 })).toEqual({ from: port - 4, to: port });
    } finally {
      second.close();
      held.close();
    }
  });
});
