// The Core side of tests/system-proxy.test.ts, forked under the app's runtime with `--import tsx`: installs the system
// proxy as core/boot.ts does (with short answer lifetimes), then answers each `probe` with what fetch, node:http and a
// child process's proxy variables do now. TARGET_PORT is the test's target server, reached by names that are not loopback.
const { SystemProxy, askAppProcess, installSystemProxy } = await import(new URL('../../core/system-proxy.ts', import.meta.url).href);
await installSystemProxy(new SystemProxy(askAppProcess(), () => {}, 200), 200);
const http = await import('node:http');
const port = process.env.TARGET_PORT;
const viaFetch = async () => {
  try { return await (await fetch(`http://model.test:${port}/model`)).text(); } catch (e) { return `failed ${e.cause?.code ?? e.message}`; }
};
const viaHttp = () => new Promise((ok) => http.get(`http://download.test:${port}/archive`, (r) => {
  let s = '';
  r.on('data', (d) => { s += d; });
  r.on('end', () => ok(s));
}).on('error', (e) => ok(`failed ${e.code}`)));
process.on('message', async (m) => {
  if (m?.type !== 'probe') return;
  process.send({ type: 'result', fetch: await viaFetch(), http: await viaHttp(), env: process.env.HTTPS_PROXY ?? null });
});
process.send({ type: 'up' });
