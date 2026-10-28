/**
 * The settings window's power button (Cortico's shell, `POST /api/run/shutdown`) shuts the Core down on purpose
 * (upstream #456, in the fork's shape). Upstream marks it in the proxy that serves its windows; the fork's settings
 * window talks to the Core directly in the default session, so the mark is set from that session's webRequest:
 * before the request goes out the Core host is told to expect the exit (`expectStop`), and a reply other than 200
 * (Core refused it, or had no shutdown) takes the mark back (`forgetStop`). A request that ends in a network error
 * keeps the mark: the shell expects the connection to drop when the Core exits before its reply, as upstream keeps
 * it when its forward throws. Only the Core's own origin counts, and only that path, so `/api/run/restart` (which
 * the host restarts through `.restart-request`) and every other request pass untouched.
 *
 * Electron keeps one listener per webRequest event and session: main.cjs's onHeadersReceived (settings-guard.cjs)
 * and these three are the default session's. Apart from Electron so it can be tested (tests/shutdown-mark.test.ts).
 */

const SHUTDOWN_PATH = '/api/run/shutdown';
/** The listeners' filter: the Core listens on 127.0.0.1 at a port that changes, which the handler checks. */
const SHUTDOWN_FILTER = { urls: [`http://127.0.0.1:*${SHUTDOWN_PATH}`] };

/** Whether a request is the console's shutdown request to the running Core at `coreOrigin` (null while there is none). */
function isConsoleShutdown(details, coreOrigin) {
  if (!coreOrigin || details?.method !== 'POST') return false;
  try {
    const u = new URL(details.url);
    return u.origin === coreOrigin && u.pathname === SHUTDOWN_PATH;
  } catch {
    return false;
  }
}

/**
 * Wires the mark to a session's webRequest. `origin()` is the running Core's origin (or null), `core` the CoreHost.
 * @param {{ onBeforeRequest: Function, onCompleted: Function, onErrorOccurred: Function }} webRequest
 * @param {{ origin: () => string | null, core: { expectStop(): void, forgetStop(): void } }} opts
 */
function markConsoleShutdowns(webRequest, { origin, core }) {
  /** The ids of shutdown requests on their way: only their completion may take the mark back. */
  const pending = new Set();
  webRequest.onBeforeRequest(SHUTDOWN_FILTER, (details, answer) => {
    try {
      if (isConsoleShutdown(details, origin())) {
        core.expectStop();
        pending.add(details.id);
      }
    } finally {
      answer({});
    }
  });
  webRequest.onCompleted(SHUTDOWN_FILTER, (details) => {
    if (!pending.delete(details.id)) return;
    // a request Core refused leaves it running; a later exit is a crash again
    if (details.statusCode !== 200) core.forgetStop();
  });
  webRequest.onErrorOccurred(SHUTDOWN_FILTER, (details) => { pending.delete(details.id); });
}

module.exports = { SHUTDOWN_FILTER, SHUTDOWN_PATH, isConsoleShutdown, markConsoleShutdowns };
