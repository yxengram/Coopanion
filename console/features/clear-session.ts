/**
 * 「系统提示词」 with a 「清空重开」 button beside the upstream 「重载系统前缀」 (「重载当前 session」 before Cortico 0.1.16): reloading swaps
 * the prefix and keeps the conversation; this one drops the conversation and starts Coo afresh from
 * the current prompt. It clears the `session` storage part (`core.loop.clearSession`), the same one
 * the advanced mode's Core page lists under data; the workspace, Coo's memory and persona, stays.
 */
import { post } from '../core/api.ts';
import { pick } from '../core/language.ts';
import { promptsFeature } from './prompts/index.ts';
import type { FeatureContext, FrameworkFeature } from './feature.ts';

export const TEXT = {
  zh: {
    button: '清空重开',
    title: '清空当前对话,让 Coo 从头开始?',
    body: 'Coo 会忘掉这段对话的上下文,按现在的系统提示词重新开始,不能撤销。工作区里的记忆和人设都保留。',
    unsaved: '页面上还有没保存的修改,清空重开用的是已保存的提示词;要用这些修改,先保存。',
    clearing: '正在清空…',
    cleared: '已清空重开',
    failed: (why: string) => `没清空:${why}`,
  },
  en: {
    button: 'Clear and restart',
    title: 'Clear this conversation and start Coo afresh?',
    body: 'Coo forgets the context of this conversation and starts again from the current system prompt. This cannot be undone. Memory and persona in the workspace stay.',
    unsaved: 'This page has unsaved edits; the restart uses the saved prompt. Save first to use them.',
    clearing: 'Clearing…',
    cleared: 'Cleared and restarted',
    failed: (why: string) => `Not cleared: ${why}`,
  },
};
const S = pick(TEXT);

async function mount(ctx: FeatureContext): Promise<void> {
  await promptsFeature.mount(ctx);
  const { ui, root, signal } = ctx;
  const toolbar = root.querySelector('.prompt-toolbar');
  if (!toolbar || signal.aborted || ctx.capabilities.storage !== true) return;
  // since Cortico 0.1.16 the buttons sit in `.prompt-actions` and the status line is `.prompt-status`
  const actions = toolbar.querySelector('.prompt-actions') ?? toolbar;
  const status = toolbar.querySelector('.msgline');
  const say = (text: string, bad = false) => {
    if (!status) return;
    status.className = bad ? 'msgline bad prompt-status' : 'msgline prompt-status';
    status.textContent = text;
  };
  // upstream's controls() resets `disabled` on every button in `.prompt-actions` whenever the page
  // state changes, so a running clear is guarded by this flag rather than by the disabled state alone
  let clearing = false;
  const button = ui.button(S.button, {
    size: 'sm',
    variant: 'danger',
    onClick: () => void (async () => {
      if (clearing) return;
      clearing = true;
      let lock: { dispose(): void } | null = null;
      try {
        // unsaved edits show as `.is-dirty` badges on their sections; the clear uses the prompt on disk
        const body = root.querySelector('.is-dirty') ? `${S.body} ${S.unsaved}` : S.body;
        if (!await ui.confirm({ title: S.title, body, danger: true }) || signal.aborted) return;
        lock = ui.disable(button);
        say(S.clearing);
        const out = await post<{ result?: string }>('/api/storage/clear?key=session', undefined, { signal });
        say(out?.result || S.cleared);
      } catch (err) {
        if (!signal.aborted) say(S.failed(err instanceof Error ? err.message : String(err)), true);
      } finally {
        lock?.dispose();
        clearing = false;
      }
    })(),
  });
  actions.appendChild(button);
}

export const promptsWithClearFeature: FrameworkFeature = { ...promptsFeature, navMode: 'primary', mount };
