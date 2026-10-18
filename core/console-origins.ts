/**
 * The origins the console is reached at, for the pet World's figure frame (`frame-ancestors`): the console shows the
 * pet page in its own frames (Start and Dress up) from another local port, and the figure frame inside it refuses
 * every ancestor it does not name. Imports nothing from Cortico, so it tests on its own.
 */

/** How many ports Cortico's console tries from the configured one when it is taken (web/server.ts `maxAttempts`). */
const PORT_ATTEMPTS = 5;

/**
 * The console's origins: at `bound`, the port it listens on, once known; before that every port Cortico may move to
 * from the configured `port` (none for 0, which the OS picks). The names are the loopback ones the console answers
 * on: 127.0.0.1 and localhost, and [::1] when it listens there.
 */
export function consoleOrigins(web: { port: number; host?: string }, bound: number | null): string[] {
  const ports = bound ? [bound] : web.port === 0 ? [] : Array.from({ length: Math.min(PORT_ATTEMPTS, 65536 - web.port) }, (_, i) => web.port + i);
  const hosts = ['127.0.0.1', 'localhost', ...(web.host === '::1' || web.host === '[::1]' ? ['[::1]'] : [])];
  return ports.flatMap((port) => hosts.map((host) => `http://${host}:${port}`));
}
