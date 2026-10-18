/**
 * 「电脑操作」: the cua World in the normal mode. The switch turns the World on and off through
 * `/api/worlds/activation`, as the advanced mode's World list does; the other rows write the cua
 * World's config group through `/api/config` (only the keys shown here are sent). Yielding to the
 * person and screenshot sizes stay on the World's own page in the advanced mode.
 *
 * Before the switch first turns computer use on, a dialog says what it risks (riskDialog); the World
 * is only turned on after its yes, and once confirmed this settings window does not ask again
 * (RISKS_SEEN in its localStorage). Turning it off never asks. Computer use is on by default, so the
 * first time this page opens with it on and the risks not yet confirmed, the same notice shows with
 * Keep it on (remembered as confirmed) and Turn it off (turns the World off, not remembered: turning
 * it back on asks as above); Esc or a click beside the card leaves it on and shows it again next time.
 * A turn-on or turn-off still on its way (`pending`) is waited for when the page opens again.
 * The advanced mode's World page asks the same before its power button turns computer use on
 * (guardWorldsPage, wired in main.ts).
 */
import { get, post, setConfig } from '../../core/api.ts';
import { pick } from '../../core/language.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';

const WORLD = 'cua';
const GROUP = 'world:cua';
const K = 'worlds.cua';
const KEYS = {
  control: `${K}.control`,
  permission: `${K}.permission`,
  grantMinutes: `${K}.grantMinutes`,
} as const;
/** The World's PERMISSION_LEVELS, strictest first. */
const LEVELS = ['ask-each-turn', 'ask-before-acting', 'ask-once', 'never-ask'] as const;
type Level = (typeof LEVELS)[number];
/** The bounds of `grantMinutes` in the World's config group. */
const GRANT_MIN = 1;
const GRANT_MAX = 1440;
/** The settings window's localStorage key that remembers the risks were confirmed once. */
export const RISKS_SEEN = 'coopanion.cua.risksSeen';

export const TEXT = {
  zh: {
    nav: '电脑操作',
    title: '电脑操作',
    enabled: '让 Coo 操作这台电脑',
    enabledHint: '关掉后 Coo 看不到屏幕,也碰不到鼠标和键盘。',
    control: '允许动鼠标和键盘',
    controlHint: '关掉后只能截图和查看有哪些窗口。',
    permission: '什么时候先问你',
    levels: { 'ask-each-turn': '每轮都问', 'ask-before-acting': '动手前问', 'ask-once': '问一次', 'never-ask': '不问' } as Record<Level, string>,
    levelHints: {
      'ask-each-turn': '每一轮 Coo 第一次看屏幕或动鼠标键盘之前,先在气泡里问你。',
      'ask-before-acting': '看屏幕不问;每一轮第一次动鼠标键盘之前问你。',
      'ask-once': '看屏幕不问;动鼠标键盘之前问一次,同意后在「同意管多久」之内不再问。',
      'never-ask': '看屏幕和动鼠标键盘都不问。',
    } as Record<Level, string>,
    grant: '同意管多久',
    grantSuffix: '分钟',
    grantBad: `要填 ${GRANT_MIN} 到 ${GRANT_MAX} 之间的整数`,
    more: '让位时长、截图尺寸等其余参数在高级模式的「电脑操作」World 页。',
    saved: '已保存',
    turnedOn: '已打开电脑操作',
    turnedOff: '已关闭电脑操作',
    saveFailed: (why: string) => `没保存上:${why}`,
    /** The dialog before computer use is first turned on: `riskDanger` bold between `riskLead` and `riskAfter`, `risks` in red. */
    riskTitle: '让 Coo 操作这台电脑?',
    riskLead: '打开后,Coo 会看你的屏幕,操作你的鼠标和键盘。',
    riskDanger: '这可能非常危险',
    riskAfter: ',请确认你理解以下内容:',
    risks: [
      '屏幕截图(可能有你的隐私内容,如聊天记录)会发给你用的模型服务。',
      'Coo 可能点错地方、打错字,或者进错窗口。确保你随时看得到它、能打断它。',
      '付款、密码这类涉及敏感信息、现实中的操作或收不回的操作,不要交给 Coo。',
    ],
    riskNote: '你动鼠标或键盘时 Coo 会自动停下。这个功能随时可以关掉。',
    riskOk: '打开',
    riskCancel: '取消',
    /** The same notice the first time this page opens with computer use already on (it is on by default). */
    riskKeep: '保持打开',
    riskOff: '关掉',
  },
  en: {
    nav: 'Computer use',
    title: 'Computer use',
    enabled: 'Let Coo use this computer',
    enabledHint: 'When off, Coo can neither see the screen nor touch the mouse and keyboard.',
    control: 'Allow the mouse and keyboard',
    controlHint: 'When off, Coo can only take screenshots and list windows.',
    permission: 'When to ask you',
    levels: { 'ask-each-turn': 'Every turn', 'ask-before-acting': 'Before acting', 'ask-once': 'Once', 'never-ask': 'Never' } as Record<Level, string>,
    levelHints: {
      'ask-each-turn': 'Every turn, Coo asks in its bubble before it first looks at the screen or uses the mouse and keyboard.',
      'ask-before-acting': 'Looking is not asked; every turn, Coo asks before it first uses the mouse and keyboard.',
      'ask-once': 'Looking is not asked; Coo asks once before using the mouse and keyboard, and after a yes not again for as long as set below.',
      'never-ask': 'Coo never asks, neither to look nor to act.',
    } as Record<Level, string>,
    grant: 'A yes lasts',
    grantSuffix: 'minutes',
    grantBad: `Enter a whole number from ${GRANT_MIN} to ${GRANT_MAX}`,
    more: 'Yielding to you, screenshot sizes and the other settings are on the Computer use World page in advanced mode.',
    saved: 'Saved',
    turnedOn: 'Computer use is on',
    turnedOff: 'Computer use is off',
    saveFailed: (why: string) => `Not saved: ${why}`,
    riskTitle: 'Let Coo use this computer?',
    riskLead: 'Once this is on, Coo will watch your screen and use your mouse and keyboard. ',
    riskDanger: 'This can be very dangerous',
    riskAfter: '; make sure you understand the following:',
    risks: [
      'Screenshots, which may show private things such as your chats, are sent to the model service you use.',
      'Coo may click the wrong place, mistype, or end up in the wrong window. Make sure you can always watch it and stop it.',
      'Do not hand Coo payments, passwords or anything else that involves sensitive information, real-world actions or cannot be undone.',
    ],
    riskNote: 'Coo stops by itself when you use the mouse or keyboard. You can turn this off at any time.',
    riskOk: 'Turn on',
    riskCancel: 'Cancel',
    riskKeep: 'Keep it on',
    riskOff: 'Turn it off',
  },
};
const S = pick(TEXT);

interface ConfigEntry { group: { id: string }; values?: Record<string, unknown> }
interface WorldEntry { id: string; status: 'active' | 'inactive' | 'missing' }

/**
 * A turn-on or turn-off sent from this page that the Core has not answered yet. It outlives the page: the Core
 * finishes it anyway (turning off can wait for a running turn), and until then the World list may still show the
 * old state, so the page opened again waits for it before reading the switch (and before showing the notice).
 */
let pending: Promise<void> | null = null;

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Whether the risks were confirmed in this settings window; storage that cannot be read counts as not. */
export function risksSeen(storage: Pick<Storage, 'getItem'> | null): boolean {
  try { return storage?.getItem(RISKS_SEEN) === '1'; } catch { return false; }
}
function rememberRisksSeen(storage: Pick<Storage, 'setItem'> | null): void {
  try { storage?.setItem(RISKS_SEEN, '1'); } catch { /* not remembered: the next turn-on asks again */ }
}

/** Which button of the risk dialog was pressed; null for Esc, a click beside the card or leaving the page. */
export type RiskAnswer = 'ok' | 'cancel' | null;

/**
 * The risk notice on Cortico's modal layout: the lead with its bold warning, the risks in red, a note, then the
 * two buttons (`labels`: Cancel and Turn on before turning on, Turn it off and Keep it on when it is already on).
 */
export function riskAsk(doc: Document, ui: FeatureContext['ui'], signal: AbortSignal, labels: { ok: string; cancel: string }): Promise<RiskAnswer> {
  if (signal.aborted) return Promise.resolve(null);
  const t = S;
  return new Promise((resolve) => {
    const life = new AbortController();
    let answer: RiskAnswer = null;
    const close = () => {
      if (life.signal.aborted) return;
      life.abort();
      modal.remove();
      resolve(answer);
    };
    const settle = (a: RiskAnswer) => { answer = a; close(); };
    signal.addEventListener('abort', close, { once: true, signal: life.signal });
    const modal = ui.h('div', 'modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const card = ui.h('div', 'modalcard confirm-card cua-risk');
    card.setAttribute('style', 'width:min(480px,92vw)');
    const head = ui.h('div', 'modalhead');
    head.append(ui.h('span', 'modaltitle', t.riskTitle));
    const body = ui.h('div', 'modalbody');
    const lead = ui.h('p', 'cua-risk-lead');
    lead.append(t.riskLead, ui.h('strong', null, t.riskDanger), t.riskAfter);
    const list = ui.h('ul', 'cua-risks');
    for (const risk of t.risks) list.append(ui.h('li', null, risk));
    const bar = ui.h('div', 'rowbar');
    const ok = ui.button(labels.ok, { size: 'sm', variant: 'primary', onClick: () => settle('ok') });
    bar.append(ui.h('span', 'grow'), ui.button(labels.cancel, { size: 'sm', onClick: () => settle('cancel') }), ok);
    body.append(lead, list, ui.h('p', 'cua-risk-note', t.riskNote), bar);
    card.append(head, body);
    modal.append(card);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); }, { signal: life.signal });
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { signal: life.signal });
    doc.body.append(modal);
    ok.focus();
  });
}

/**
 * The dialog before computer use is turned on: Cancel and Turn on. Resolves true only for Turn on; Esc, a click
 * beside the card, Cancel or leaving the page resolve false.
 */
export async function riskDialog(doc: Document, ui: FeatureContext['ui'], signal: AbortSignal): Promise<boolean> {
  return await riskAsk(doc, ui, signal, { ok: S.riskOk, cancel: S.riskCancel }) === 'ok';
}

const storageOf = (doc: Document): Storage | null => { try { return doc.defaultView?.localStorage ?? null; } catch { return null; } };

/**
 * The advanced mode's World page: its power button on the computer-use card (the card whose `h3 .en` line starts
 * with the World id, Cortico's `toolsCount`) asks the risk dialog first, until the risks were confirmed once here.
 * A yes is remembered and clicks the button again; a no leaves the World off. Other buttons and Worlds pass through.
 */
export function guardWorldsPage(root: HTMLElement, ui: FeatureContext['ui'], signal: AbortSignal): void {
  const doc = root.ownerDocument;
  let pass: Element | null = null;
  root.addEventListener('click', (e) => {
    const btn = (e.target as Element | null)?.closest?.('.iobtn-start');
    if (!btn || btn === pass) return;
    const id = btn.closest('.sheet')?.querySelector('h3 .en')?.textContent ?? '';
    if (!id.startsWith(`${WORLD} `) || risksSeen(storageOf(doc))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void riskDialog(doc, ui, signal).then((yes) => {
      if (!yes || signal.aborted || !btn.isConnected) return;
      rememberRisksSeen(storageOf(doc));
      pass = btn;
      try { (btn as HTMLElement).click(); } finally { pass = null; }
    });
  }, { capture: true, signal });
}

async function mount(ctx: FeatureContext): Promise<void> {
  const { ui, root, signal } = ctx;
  const opts = { signal };
  root.classList.add('home');

  const sheet = ui.sheet({ title: S.title });
  const msg = ui.msgline('');
  const say = (text: string, bad = false) => {
    msg.textContent = text;
    msg.classList.toggle('bad', bad);
  };

  const doc = root.ownerDocument;
  const storage = storageOf(doc);
  /** Turning on asks first, until the risks were confirmed once here; a no leaves it off and sends nothing. */
  const turn = async (on: boolean) => {
    if (on && !risksSeen(storage)) {
      if (!await riskDialog(doc, ui, signal)) { if (!signal.aborted) enabled.setChecked(false); return; }
      rememberRisksSeen(storage);
      enabled.setChecked(true);
    }
    await activate(on);
  };
  const enabled = ui.checkbox(S.enabled, { onChange: (on) => void turn(on) });
  const control = ui.checkbox(S.control, { onChange: (on) => void save(KEYS.control, on) });
  const levelHint = ui.h('p', 'home-note');
  const level = ui.segmented(LEVELS.map((value) => ({ value, label: S.levels[value] })), {
    size: 'sm',
    onSelect: (v) => { showLevel(v as Level); void save(KEYS.permission, v); },
  });
  const grant = ui.input({ type: 'number' });
  grant.min = String(GRANT_MIN);
  grant.max = String(GRANT_MAX);
  grant.step = '1';
  const grantBox = ui.h('div', 'companion-rangebox');
  grantBox.append(grant, ui.h('span', 'companion-rangeval', S.grantSuffix));

  const row = (label: string, control: HTMLElement, hint?: HTMLElement | string) => {
    const r = ui.h('div', 'companion-row');
    const c = ui.h('div', 'companion-control');
    c.append(control);
    if (hint) c.append(typeof hint === 'string' ? ui.h('p', 'home-note', hint) : hint);
    r.append(ui.h('div', 'companion-label', label), c);
    return r;
  };
  const grantRow = row(S.grant, grantBox);
  sheet.body.append(
    row('', enabled.el, S.enabledHint),
    row('', control.el, S.controlHint),
    row(S.permission, level.el, levelHint),
    grantRow,
    ui.h('p', 'home-note', S.more),
    msg,
  );
  root.append(sheet.el);

  const showLevel = (v: Level) => {
    levelHint.textContent = S.levelHints[v];
    grantRow.hidden = v !== 'ask-once';
  };

  const save = async (key: string, value: string | number | boolean) => {
    try {
      await setConfig(GROUP, { [key]: value }, opts);
      say(S.saved);
    } catch (err) {
      if (!signal.aborted) say(S.saveFailed(errText(err)), true);
    }
  };
  const statusOn = (list: { worlds?: WorldEntry[] } | null) => list?.worlds?.find((w) => w.id === WORLD)?.status === 'active';
  /** Whether the World list says computer use is on; null when it cannot be read. */
  const worldOn = async (): Promise<boolean | null> => {
    const list = await get<{ worlds?: WorldEntry[] }>('/api/worlds', opts).catch(() => null);
    return list?.worlds ? statusOn(list) : null;
  };
  const activate = async (on: boolean) => {
    const lock = ui.disable(enabled.input);
    // Not tied to the page's signal: leaving the page does not stop the Core, and `pending` follows the real answer.
    const request = post('/api/worlds/activation', { id: WORLD, enabled: on });
    const done = request.then(() => undefined, () => undefined);
    pending = done;
    void done.then(() => { if (pending === done) pending = null; });
    try {
      await request;
      if (signal.aborted) return;
      say(on ? S.turnedOn : S.turnedOff);
    } catch (err) {
      if (signal.aborted) return;
      // The World may already be as asked (an earlier request from this page finished late, then this one found
      // nothing to turn off): the switch shows what the World list says, and only a real miss is an error.
      const now = await worldOn();
      if (signal.aborted) return;
      enabled.setChecked(now ?? !on);
      if (now === on) say(on ? S.turnedOn : S.turnedOff);
      else say(S.saveFailed(errText(err)), true);
    } finally {
      lock.dispose();
    }
  };
  grant.addEventListener('change', () => {
    const n = Number(grant.value);
    if (!Number.isInteger(n) || n < GRANT_MIN || n > GRANT_MAX) { say(S.grantBad, true); return; }
    void save(KEYS.grantMinutes, n);
  }, { signal });

  const readWorlds = async () => {
    if (pending) {
      const lock = ui.disable(enabled.input);
      try { await pending; } finally { lock.dispose(); }
    }
    return await get<{ worlds?: WorldEntry[] }>('/api/worlds', opts).catch(() => null);
  };
  // The other rows do not wait for a pending turn-on or turn-off; the switch does.
  const worldsRead = readWorlds();
  const config = await get<{ groups?: ConfigEntry[] }>('/api/config', opts).catch(() => null);
  const values = config?.groups?.find((g) => g.group.id === GROUP)?.values ?? {};
  if (typeof values[KEYS.control] === 'boolean') control.setChecked(values[KEYS.control] as boolean);
  const current = LEVELS.find((l) => l === values[KEYS.permission]) ?? 'ask-each-turn';
  level.setValue(current);
  showLevel(current);
  if (typeof values[KEYS.grantMinutes] === 'number') grant.value = String(values[KEYS.grantMinutes]);
  const worlds = await worldsRead;
  if (signal.aborted) return;
  const on = statusOn(worlds);
  enabled.setChecked(on);

  // On by default: the first visit with it on shows the notice once. Keep it on is remembered; Turn it off is not
  // (turning it back on asks as before); Esc or a click beside the card decides nothing and it shows next time.
  // (Not awaited: the page is mounted while the dialog waits.)
  if (on && !risksSeen(storage) && !signal.aborted) {
    void riskAsk(doc, ui, signal, { ok: S.riskKeep, cancel: S.riskOff }).then(async (answer) => {
      if (signal.aborted) return;
      if (answer === 'ok') rememberRisksSeen(storage);
      else if (answer === 'cancel') { enabled.setChecked(false); await activate(false); }
    });
  }
}

export const cuaFeature: FrameworkFeature = {
  route: 'cua',
  label: S.nav,
  icon: 'eye',
  navMode: 'primary',
  mount,
};
