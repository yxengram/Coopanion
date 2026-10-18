/**
 * A ChatGPT plan's sign-in in the settings window (testing): on the Start page's ChatGPT pick (features/home) and,
 * in the advanced mode, in Cortico's editor of a `chatgpt` endpoint, where the provider declares its panel as the
 * built-in `coopanion-chatgpt` (`CHATGPT_BUILTIN_PANEL`) that main.ts registers with the WebUI as `chatgptPanel`.
 * The authorization page opens in the system browser (the app's main process sends every page off the console
 * there); the sign-in runs in the Core, in Coo Pet Provider's `chatgpt` module, through its panel methods
 * (`connect.ts`), always on the saved endpoint: a connection still unsaved in the editor is asked to be saved first.
 */
import type { WebUi, WebUiPanel } from '../../../shared/client-panel.ts';
import { chatgptState, signInChatGPT, signOutChatGPT, type SignInState } from 'cortico-provider-coo/src/connect.ts';
import { signInReason } from 'cortico-provider-coo/src/strings.ts';
import { LANGUAGE, pick } from '../../core/language.ts';
import { consoleCall } from '../home/model.ts';

export const TEXT = {
  zh: {
    /** The sign-in button (OpenAI's own wording). */
    go: '使用 ChatGPT 继续',
    quota: '用 ChatGPT 账号登录还在测试中。请求计入这个账号的 ChatGPT 套餐用量,和 ChatGPT、Codex 共用额度,请自行留意。',
    waiting: '请在浏览器里完成登录…',
    signedIn: (email: string) => (email ? `已登录:${email}` : '已登录'),
    signedOut: '未登录',
    signOut: '退出登录',
    failed: (why: string) => `登录失败:${why}`,
    saveFirst: '先保存这个连接,才能登录',
    signedOutDone: '已退出 ChatGPT 账号',
  },
  en: {
    go: 'Continue with ChatGPT',
    quota: "Signing in with a ChatGPT account is still in testing. Requests count toward the account's ChatGPT plan, shared with ChatGPT and Codex; keep an eye on its quota.",
    waiting: 'Finish signing in in the browser…',
    signedIn: (email: string) => (email ? `Signed in: ${email}` : 'Signed in'),
    signedOut: 'Not signed in',
    signOut: 'Sign out',
    failed: (why: string) => `Sign-in failed: ${why}`,
    saveFirst: 'Save this connection to sign in',
    signedOutDone: 'Signed out of ChatGPT',
  },
};
export const S = pick(TEXT);

/** Opens the authorization page, which the main process takes to the system browser. */
export const openInBrowser = (url: string): void => { window.open(url, '_blank', 'noopener'); };

/** The account line of the saved `chatgpt` endpoint `name` with its sign-in and sign-out buttons, and the quota note. */
export function accountRow(ui: WebUi, name: string, signal: AbortSignal, onChange?: () => void): HTMLElement {
  const call = consoleCall(signal);
  const line = ui.msgline('');
  const signIn = ui.button(S.go, { variant: 'primary' });
  const signOut = ui.button(S.signOut, { size: 'sm' });
  signOut.hidden = true;
  const show = (state: SignInState) => {
    line.textContent = state.signedIn ? S.signedIn(state.email ?? '') : state.phase === 'failed' ? S.failed(signInReason(state.reason ?? '', LANGUAGE)) : S.signedOut;
    line.classList.toggle('bad', state.phase === 'failed');
    signOut.hidden = !state.signedIn;
  };
  /** The endpoint is not saved (the module knows no endpoint by this name): it signs in once saved. */
  const unsaved = () => {
    line.textContent = S.saveFirst;
    line.classList.remove('bad');
    signIn.disabled = true;
  };
  signIn.addEventListener('click', async () => {
    signIn.disabled = true;
    line.textContent = S.waiting;
    line.classList.remove('bad');
    try {
      show(await signInChatGPT(call, name, openInBrowser, { signal }));
      onChange?.();
    } catch (err) {
      if (signal.aborted) return;
      line.textContent = S.failed(err instanceof Error ? err.message : String(err));
      line.classList.add('bad');
    } finally {
      signIn.disabled = false;
    }
  }, { signal });
  signOut.addEventListener('click', async () => {
    signOut.disabled = true;
    try {
      show(await signOutChatGPT(call, name));
      onChange?.();
    } catch (err) {
      line.textContent = err instanceof Error ? err.message : String(err);
      line.classList.add('bad');
    } finally { signOut.disabled = false; }
  }, { signal });
  // a connection still unsaved in the editor is not asked about (the module answers an unknown name with an error)
  void call<{ providers: Array<{ name: string }> }>('/api/providers')
    .then((list) => (list.providers.some((p) => p.name === name) ? chatgptState(call, name).then(show) : unsaved()))
    .catch(unsaved);
  const row = ui.rowbar();
  row.append(signIn, signOut, line);
  const box = ui.h('div', 'chatgpt-account');
  box.append(row, ui.h('p', 'home-note', S.quota));
  return box;
}

/** The account row in Cortico's editor of a `chatgpt` endpoint: its scope names the endpoint. */
export const chatgptPanel: WebUiPanel = {
  mount(ctx) {
    const name = ctx.scope.instance;
    if (!name) { ctx.root.append(ctx.ui.msgline(S.saveFirst)); return; }
    ctx.root.append(accountRow(ctx.ui, name, ctx.signal));
  },
};
