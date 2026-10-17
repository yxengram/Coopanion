/**
 * The introduction. On the first start Coo sets things up with the person right where it lives,
 * at the bottom of the screen, one step at a time in its bubble (the desktop-pet World's
 * `dialog`); no window opens:
 *
 * 1. hello, what to call the person (the desktop-pet World's `user`), and where they heard of
 *    Coopanion (for the usage statistics; one of the buttons skips it);
 * 2. on a first start only (no `guide.json` yet) and while the pet is still Coo, which figure to be: Coo (the
 *    default, kept when the person closes the bubble here), the whale, Claude 娘, GPT 娘, Gemini 娘 or Grok 娘, each
 *    card with its picture; another one is put on through the pet server's `POST /api/skin`, as the dressing page
 *    saves a look (Coo is left as it is). Then how lively to be (`roam`): while the cards are up Coo shows each one,
 *    standing still, strolling, or running back and forth;
 * 3. the model service (DeepSeek first, the others Coo Pet Provider offers after it, each card with
 *    its logo), the model (the service's cheap default that reads images, or any name typed in) and
 *    the key, saved, tested and made active through the console's own endpoint routes;
 * 4. voice input: the speech model is downloaded with one click when it is missing, then how to
 *    talk, with the talk key as a key cap;
 * 5. where the buttons and the menu are, that Coo's persona is in the settings window's
 *    「系统提示词」 page, and where settings live.
 *
 * However it ends, walked through or closed, it calls `onEnd` with the record of what was said in
 * the bubble (an API key shows as typed in, never as itself). Every step has a close button that
 * ends the introduction. The console's 「使用引导」 runs it
 * again (the World's `pet.guide` panel method). Once it has run, a missing key is asked for in the
 * bubble from time to time (`askForKey`), with the key box right there.
 *
 * Every line and button is in the app language (`GuideDeps.language`, read at each step): Chinese for `zh` and
 * `zh-Hant`, English for the rest (`guideStrings`). The record quotes them as shown; its framing stays Chinese.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pick, type Language, type LanguageTable } from 'cortico/core/language.ts';
import type { DesktopPetWorld, FigurePack, PetDialog, PetDialogAnswer } from 'cortico-world-desktop-pet';
import { DEFAULT_USER_EN, DEFAULT_USER_ZH, DEFAULT_USERS, SEED_DIR } from './seed.ts';
import { VENDOR_ICONS, VENDORS, vendorKeyHint, vendorName, type Vendor } from 'cortico-provider-coo';
import { connectVendor, currentConnection, type ConsoleCall } from 'cortico-provider-coo/src/connect.ts';

const PET_GROUP = 'world:desktop-pet';
const USER_KEY = 'worlds.desktop-pet.user';
const ROAM_KEY = 'worlds.desktop-pet.roam';
/** The default name for the person: the name box offers it as a placeholder, not as a value (for `DEFAULT_USERS` it starts empty). */
const DEFAULT_USER = DEFAULT_USER_ZH;
/** The ids the answers to 「你是从哪里认识我的?」 are reported as (docs/TELEMETRY.md), in the order of their labels (`sources`); the last skips. */
const SOURCE_IDS = ['bilibili', 'xiaohongshu', 'douyin', 'github', 'friend', 'other', 'skip'] as const;
/** Numbered steps, for the dots at the top of the bubble. */
const STEPS = 5;
/** How often a step waiting for the pet page looks again, and a download for its progress. */
const POLL_MS = 500;
const MAC = process.platform === 'darwin';

type Roam = 'off' | 'calm' | 'free';

/** The figures a first start offers, in this order (the built-in packs); Coo, the first, is the default. */
export const GUIDE_FIGURES = ['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan'] as const;
/** A card's picture larger than this is left out (the card shows its name alone). */
const THUMB_MAX = 256 * 1024;
const THUMB_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** Ends a reason quoted inside a sentence without its own full stop. */
const bare = (why: string) => why.replace(/[。.!！]+$/, '');

/** The introduction's text in Chinese: what Coo says in its bubble, step by step, and the words on the buttons and cards. */
const zh = {
  hello: '你好呀!我是 Coo,以后就住在你屏幕的底边啦,库...',
  helloReply: '你好,Coo!',
  askName: '我该怎么称呼你?',
  /** The name box's placeholder. */
  namePlaceholder: DEFAULT_USER,
  nameSend: '就这么叫',
  gotName: (name: string) => `${name},记住啦!`,
  askSource: '你是从哪里认识我的?',
  /** The answers' labels, in `SOURCE_IDS` order. */
  sources: ['B站', '小红书', '抖音', 'GitHub', '朋友推荐', '其他', '不告诉你'] as readonly string[],
  sourceThanks: '原来是这样,库...',
  askRoam: '平时我该安静一点,还是活泼一点?点一下,看看我会怎样。',
  roam: {
    off: { label: '不乱动', level: '低', line: '那我就乖乖站着,你叫我我再动。', motion: 'still' },
    calm: { label: '多待着', level: '中', line: '我会时不时溜达一圈,大多时候待着。', motion: 'walk' },
    free: { label: '常走动', level: '高', line: '我可以到处跑来跑去,库...!', motion: 'run' },
  } as Record<Roam, { label: string; level: string; line: string; motion: 'still' | 'walk' | 'run' }>,
  askFigure: '先选一个样子吧!之后在「装扮」里随时能换。',
  figureMark: '装扮',
  figureOk: '就这个',
  /** The cards' names (a pack's own name otherwise) and the line each types when it is picked. */
  figures: {
    coo: { label: 'Coo', line: '就是现在的我,C 形的小身体。' },
    whale: { label: '大肥鱼', line: '穿女仆裙的大肥鱼,还会喷水。' },
    'claude-chan': { label: 'Claude 娘', line: '温柔的 Claude 娘。' },
    'gpt-chan': { label: 'GPT 娘', line: '有龙翼和龙尾的 GPT 娘。' },
    'gemini-chan': { label: 'Gemini 娘', line: '有猫耳和猫尾的 Gemini 娘。' },
    'grok-chan': { label: 'Grok 娘', line: '金发双马尾的吸血鬼 Grok 娘。' },
  } as Record<string, { label: string; line: string }>,
  /** A pack's own name, for a card the table above has none for. */
  packName: (name: Record<string, string>): string | undefined => name.zh ?? Object.values(name)[0],
  figureKept: '好,那我还是 Coo 的样子。',
  figureWorn: (name: string) => `换好啦,现在我是${name}的样子!`,
  roamOk: '就这样',
  roamDone: '好,就按这个来。',

  askVendor: '要和你聊天,我得先连上大模型。用哪一家的?拿不准就选 DeepSeek。',
  /** A service's name on its card and in the lines about it. */
  vendorName: (v: Vendor) => vendorName(v, 'zh'),
  /** The key box's placeholder. */
  keyHint: (v: Vendor) => vendorKeyHint(v, 'zh'),
  vendorOk: '就用这家',
  pickModel: (v: Vendor) => `默认用 ${v.model},便宜,还能看图。想用别的模型,改成它的名字就行。`,
  modelOk: '就用这个',
  askKey: (v: Vendor) => `把 ${v.name} 的 API Key 贴在这里吧。按用量计费,注意 token 消耗哦。`,
  keySend: '连接',
  keyLink: (v: Vendor) => `还没有 Key?去${v.name}申请`,
  keyLater: '稍后再填',
  connecting: '正在连接…',
  keyOk: (v: Vendor, model: string) => `连上 ${v.name} 了${model ? `(${model})` : ''}!现在我能说话啦,库...`,
  keyFail: (why: string) => `没连上:${bare(why)}。看看 Key 是不是完整,账户里还有没有余额?再贴一次试试。`,
  keyAlready: (name: string, model: string) => `模型已经连好了(${[name, model].filter(Boolean).join(' · ')}),省事,库...`,
  keySkipped: '没关系,等你填好我再开口。之后我会再来问你。',

  askModel: (mb: number) => `要听懂你说话,我得先下载一个语音识别模型(FunASR,约 ${mb} MB,从国内的 ModelScope 下载)。现在下吗?`,
  download: '下载',
  notNow: '先不用',
  downloading: '正在下载语音模型,库...',
  downloaded: '下好了,现在我听得懂你说话啦!',
  downloadFail: (why: string) => `没下载下来:${why}。之后在设置的「语音输入」页可以再试。`,
  modelLater: '好,之后在设置的「语音输入」页一键就能下。',
  talk: (hint: string) => `想和我说话:${hint}。`,
  /** The talk key cannot be read: nothing is heard until it can (the microphone never falls back to always listening). */
  talkKeyProblem: (why: string) => `说话键现在用不了,我先不听你说话:${bare(why)}。`,
  talkOff: '语音输入现在关着,可以在设置的「语音输入」页打开。',
  talkType: '也可以把鼠标停在我身上,点旁边的气泡按钮打字。',
  gotIt: '知道了',
  buttons: '鼠标停在我身上,旁边会冒出几个按钮;右键我能打开菜单,暂停、设置和退出都在里面。',
  ok: '好',
  persona: '我是什么性子、怎么说话,都写在设置窗口的「系统提示词」页里。想让我换个样子,可以去那里改;直接告诉我也行,我自己来改。',
  /** The page's name in the persona line, drawn in the theme colour. */
  personaMark: '系统提示词',
  personaOk: '明白了',
  finish: MAC
    ? '都准备好啦!菜单栏里也有我的图标,想改设置点它就行。'
    : process.platform === 'linux'
      ? '都准备好啦!想改设置的话,右键我打开菜单就行;桌面的托盘区里要是有我的图标,点它也可以。'
      : '都准备好啦!任务栏右下角的托盘里也有我的图标,想改设置点它就行。',
  go: '开始吧',
  dress: '先给我换身衣服',
  closed: '好,那先到这儿。想再听我介绍,打开设置,在「开始」页点「使用引导」。',

  ask: {
    first: '我还没连上模型,填好 API Key 我才能和你说话。用哪一家的?',
    talked: '我听到了,可还没连上模型,没法回你。选一家,把 API Key 贴给我吧?',
    again: '还是没连上模型呢,填好 API Key 我才能陪你聊天。用哪一家的?',
  },
  askLater: '等会儿',
};

type GuideText = typeof zh;

/**
 * English. Page and button names are the settings window's own English ones (「开始」 Start, 「装扮」 Dress up,
 * 「语音输入」 Voice input, 「系统提示词」 System prompt, 「使用引导」 Guide).
 */
const en: GuideText = {
  hello: 'Hi! I\'m Coo, and I live along the bottom of your screen now. Coo...',
  helloReply: 'Hi, Coo!',
  askName: 'What should I call you?',
  namePlaceholder: DEFAULT_USER_EN,
  nameSend: 'Call me that',
  gotName: (name: string) => `${name}, got it!`,
  askSource: 'Where did you hear about me?',
  sources: ['Bilibili', 'Xiaohongshu (RED)', 'Douyin', 'GitHub', 'A friend', 'Somewhere else', 'I\'d rather not say'],
  sourceThanks: 'Oh, I see. Coo...',
  askRoam: 'Should I keep quiet or be lively most of the time? Click one to see what I\'d do.',
  roam: {
    off: { label: 'Stay put', level: 'Low', line: 'Then I\'ll stand still and move when you call me.', motion: 'still' },
    calm: { label: 'Now and then', level: 'Medium', line: 'I\'ll take a stroll now and then and stay put most of the time.', motion: 'walk' },
    free: { label: 'Often', level: 'High', line: 'I can run all over the place. Coo...!', motion: 'run' },
  },
  askFigure: 'First, pick a look! You can change it any time in Dress up.',
  figureMark: 'Dress up',
  figureOk: 'This one',
  figures: {
    coo: { label: 'Coo', line: 'Me as I am now, a little C-shaped body.' },
    whale: { label: 'Whale', line: 'A big fat fish in a maid dress. She spouts water, too.' },
    'claude-chan': { label: 'Claude-chan', line: 'Gentle Claude-chan.' },
    'gpt-chan': { label: 'GPT-chan', line: 'GPT-chan, with dragon wings and a dragon tail.' },
    'gemini-chan': { label: 'Gemini-chan', line: 'Gemini-chan, with cat ears and a cat tail.' },
    'grok-chan': { label: 'Grok-chan', line: 'Grok-chan, a blonde vampire with twin tails.' },
  },
  packName: (name: Record<string, string>) => name.en ?? Object.values(name)[0],
  figureKept: 'OK, I\'ll stay as Coo.',
  figureWorn: (name: string) => `All changed! Now I'm ${name}!`,
  roamOk: 'Like that',
  roamDone: 'OK, that\'s how I\'ll be.',

  askVendor: 'To chat with you I need to connect to a model. Which service should I use? If you\'re not sure, pick DeepSeek.',
  vendorName: (v: Vendor) => vendorName(v, 'en'),
  keyHint: (v: Vendor) => vendorKeyHint(v, 'en'),
  vendorOk: 'Use this one',
  pickModel: (v: Vendor) => `By default I'll use ${v.model}: it's cheap and can read images. To use another model, type its name instead.`,
  modelOk: 'Use this one',
  askKey: (v: Vendor) => `Paste your ${v.nameEn} API key here. It's billed by usage, so keep an eye on the tokens.`,
  keySend: 'Connect',
  keyLink: (v: Vendor) => `No key yet? Get one from ${v.nameEn}`,
  keyLater: 'Later',
  connecting: 'Connecting…',
  keyOk: (v: Vendor, model: string) => `Connected to ${v.nameEn}${model ? ` (${model})` : ''}! Now I can talk. Coo...`,
  keyFail: (why: string) => `That didn't connect: ${bare(why)}. Is the key complete, and is there credit left on the account? Try pasting it again.`,
  keyAlready: (name: string, model: string) => `A model is connected already (${[name, model].filter(Boolean).join(' · ')}). Easy. Coo...`,
  keySkipped: 'That\'s fine; I\'ll talk once you\'ve added it. I\'ll ask you again later.',

  askModel: (mb: number) => `To understand what you say, I need to download a speech recognition model (FunASR, about ${mb} MB, from ModelScope in China). Download it now?`,
  download: 'Download',
  notNow: 'Not now',
  downloading: 'Downloading the speech model. Coo...',
  downloaded: 'Done! Now I can understand what you say.',
  downloadFail: (why: string) => `The download failed: ${bare(why)}. You can try again on the Voice input page in settings.`,
  modelLater: 'OK. One click on the Voice input page in settings downloads it later.',
  // the English lines are sentences of their own: each ends in a space before the next one
  talk: (hint: string) => `To talk to me: ${bare(hint)}. `,
  talkKeyProblem: (why: string) => `The talk key doesn't work right now, so I'm not listening: ${bare(why)}. `,
  talkOff: 'Voice input is off now; you can turn it on on the Voice input page in settings. ',
  talkType: 'You can also rest the pointer on me and click the bubble button beside me to type.',
  gotIt: 'Got it',
  buttons: 'Rest the pointer on me and a few buttons pop up beside me; right-click me for the menu, with pause, settings and quit.',
  ok: 'OK',
  persona: 'What I\'m like and how I talk is written on the System prompt page in the settings window. To change me, edit it there, or just tell me and I\'ll change it myself.',
  personaMark: 'System prompt',
  personaOk: 'Understood',
  finish: MAC
    ? 'All set! My icon is in the menu bar too; click it to change settings.'
    : process.platform === 'linux'
      ? 'All set! To change settings, right-click me for the menu; if my icon is in the tray, clicking it works too.'
      : 'All set! My icon is in the tray at the bottom right of the taskbar too; click it to change settings.',
  go: 'Let\'s go',
  dress: 'Dress me up first',
  closed: 'OK, let\'s stop here. To hear my introduction again, open settings and click "Guide" on the Start page.',

  ask: {
    first: 'I\'m not connected to a model yet; I can talk once you add an API key. Which service should I use?',
    talked: 'I heard you, but I\'m not connected to a model yet, so I can\'t answer. Pick a service and paste me an API key?',
    again: 'Still no model connected; add an API key and I can keep you company. Which service should I use?',
  },
  askLater: 'Later',
};

const GUIDE_TEXT: LanguageTable<GuideText> = { zh, en };

/** The introduction's text in `language` (Chinese for `zh-Hant`, English for every other language). */
export const guideStrings = (language: Language = 'zh'): GuideText => pick(language, GUIDE_TEXT);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GuideDeps {
  pet: () => DesktopPetWorld | null;
  /** The console's origin, `http://127.0.0.1:<port>`. */
  console: string;
  /** Written once the introduction has run, so later starts skip it. */
  doneFile: string;
  /** Shows the dressing page (in the settings window). */
  openDress: () => void;
  /** The introduction ended, walked through or closed. */
  onEnd?: (end: GuideEnd) => void;
  /** Usage statistics: each step reached, the source answer, and how the introduction ended. */
  track?: (type: string, fields: Record<string, unknown>) => void;
  /** The app language, read at each step: the bubble's lines follow it (the record quotes them as shown; its own framing in notice.ts stays Chinese); without it, Chinese. */
  language?: () => Language;
}

export interface GuideEnd {
  /** Walked through to the end, not closed early. */
  finished: boolean;
  /** What the person is called; null when it closed before the name was asked. */
  name: string | null;
  /** The last numbered step reached. */
  step: number;
  /** Coo's lines and the person's answers, in order. */
  transcript: string[];
}

/** Ended with the close button: the rest is skipped. */
class Closed extends Error {}

/** One step for the record: Coo's line and, when the step asked something, the answer. */
export function noteStep(d: PetDialog, a: PetDialogAnswer): string[] {
  const lines = [`Coo:${d.text}`];
  const input = d.input;
  if ('closed' in a) lines.push('(对方点了关闭,引导到这里结束)');
  else if ('index' in a && (input?.kind === 'buttons' || input?.kind === 'choices')) lines.push(`对方:${input.options[a.index]?.label ?? a.index}`);
  else if ('text' in a) lines.push(`对方:${input?.kind === 'text' && input.secret ? '(填了 API Key)' : a.text}`);
  else if ('alt' in a && input?.kind === 'text' && input.alt) lines.push(`对方:${input.alt}`);
  return lines;
}

/** The console's routes, called as the console calls them, in the app language (its errors are said in the bubble). */
function api(origin: string, language: () => Language): ConsoleCall {
  const call = async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', 'x-cortico-language': language() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null) as T & { error?: string } | null;
    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
    return data as T;
  };
  return call;
}

interface VoiceState {
  enabled?: boolean;
  engine?: 'funasr' | 'system';
  model?: { phase: 'absent' | 'working' | 'ready' | 'error'; done: number; total: number | null; bytes: number; detail: string | null };
  input?: { mode?: 'hold' | 'toggle' | 'always'; hint?: string; keyLabel?: string; taps?: number; hotkeyProblem?: string | null };
}

/**
 * The bubble on how to talk to her: the World words the hint for the key and mode in force; the key cap acts out the
 * taps and the hold. A talk key that cannot be read hears nothing: say why, and show no key cap that would do nothing.
 */
export function talkStep(voice: VoiceState | undefined, language: Language = 'zh'): PetDialog {
  const S = guideStrings(language);
  const on = voice?.enabled !== false && !!voice?.input?.hint;
  const problem = on && voice?.input?.mode !== 'always' ? voice?.input?.hotkeyProblem : null;
  const keyed = on && !problem && voice?.input?.mode !== 'always';
  return {
    text: `${problem ? S.talkKeyProblem(problem) : on ? S.talk(voice!.input!.hint!) : S.talkOff}${S.talkType}`,
    input: { kind: 'buttons', keys: keyed ? voice?.input?.keyLabel : undefined, taps: voice?.input?.taps, options: [{ label: S.gotIt, primary: true }] },
  };
}

/** Steps through the pet's bubble; a step the pet page was not there for waits for it and shows again. */
function talker(pet: () => DesktopPetWorld | null) {
  const connected = () => !!pet()?.petState().connected;
  const show = async (d: PetDialog): Promise<Exclude<PetDialogAnswer, { unavailable: true }>> => {
    for (;;) {
      while (!connected()) await sleep(POLL_MS);
      const a = await pet()!.dialog(d).answer;
      if (!('unavailable' in a)) return a;
      await sleep(POLL_MS);
    }
  };
  return { show, connected };
}

/** A service's logo as a data URL for a card in the bubble. */
const logo = (v: Vendor) => `data:image/svg+xml;base64,${Buffer.from(VENDOR_ICONS[v.id] ?? '').toString('base64')}`;

/**
 * Asks which service to use and then for its key, in the bubble, until it connects or the person
 * puts it off; true once connected. `ask` is the question over the service cards.
 */
async function connectLoop(show: (d: PetDialog) => Promise<PetDialogAnswer>, call: ConsoleCall, pet: () => DesktopPetWorld | null,
  ask: Omit<PetDialog, 'input'>, later: string, language: () => Language): Promise<boolean> {
  const T = () => guideStrings(language());
  const current = await currentConnection(call);
  const picked = await show({
    ...ask,
    input: {
      kind: 'choices', confirm: T().vendorOk, value: Math.max(0, VENDORS.indexOf(current.vendor ?? VENDORS[0]!)),
      options: VENDORS.map((v) => ({ label: T().vendorName(v), image: logo(v) })),
    },
  });
  if ('closed' in picked) throw new Closed();
  const vendor = VENDORS['index' in picked ? picked.index : 0] ?? VENDORS[0]!;
  const m = await show({
    ...ask, text: T().pickModel(vendor), marks: [vendor.model], actions: ['thinking'],
    input: { kind: 'text', submit: T().modelOk, value: vendor.model, maxLength: 120, suggestions: [vendor.model, ...(vendor.models ?? [])] },
  });
  if ('closed' in m) throw new Closed();
  const model = 'text' in m ? m.text.trim() : vendor.model;
  const keyStep = (text: string, actions: string[]): PetDialog => ({ ...ask, text, actions, input: keyInput(vendor, later, T()) });
  let step = keyStep(T().askKey(vendor), ['thinking']);
  for (;;) {
    const a = await show(step);
    if ('closed' in a) throw new Closed();
    if (!('text' in a)) return false;
    // the bar stays up while the key is saved and tested; a page gone meanwhile just misses it
    const wait = pet()?.dialog({ text: T().connecting, actions: ['thinking'], step: ask.step, input: { kind: 'progress' } });
    const r = await connectVendor(call, vendor, a.text, model, language());
    wait?.close();
    if (r.ok) {
      const { model } = await currentConnection(call);
      await show({ ...ask, text: T().keyOk(vendor, model), marks: [T().vendorName(vendor)], actions: ['love', 'jump'] });
      return true;
    }
    step = keyStep(T().keyFail(r.why ?? '?'), ['sad']);
  }
}

/** A pack's pick when it is put on with nothing chosen: the preset that picks each axis's first option, else those options joined (as the dressing page does). */
export function defaultScheme(pack: FigurePack): string {
  const m = pack.manifest;
  const first = Object.fromEntries(m.axes.map((a) => [a.id, a.options[0]!.id]));
  return m.presets.find((p) => m.axes.every((a) => p.pick[a.id] === first[a.id]))?.id ?? m.axes.map((a) => first[a.id]).join('-');
}

/** A file as a data URL for a card, or undefined when it is missing, too big or not a picture. */
function dataUrl(file: string): string | undefined {
  const type = THUMB_TYPES[extname(file).toLowerCase()];
  try {
    if (!type || statSync(file).size > THUMB_MAX) return undefined;
    return `data:${type};base64,${readFileSync(file).toString('base64')}`;
  } catch {
    return undefined;
  }
}

/** A figure's picture: Coo's is the app's avatar; a pack's, its default pick's preset's, else its first option's, else its own. */
function figureThumb(pack: FigurePack): string | undefined {
  if (pack.id === 'coo') return dataUrl(join(SEED_DIR, 'avatar.png'));
  const m = pack.manifest;
  const scheme = defaultScheme(pack);
  const file = m.presets.find((p) => p.id === scheme)?.thumb ?? m.axes[0]?.options[0]?.thumb ?? m.thumb;
  return file ? dataUrl(join(pack.dir, file)) : undefined;
}

/** The figures a first start offers that are there (built in), in `GUIDE_FIGURES` order. */
export function guideFigures(packs: readonly FigurePack[]): FigurePack[] {
  return GUIDE_FIGURES.map((id) => packs.find((p) => p.id === id && p.builtin)).filter((p): p is FigurePack => !!p);
}

/** The card step asking which figure to be; Coo picked to begin with. */
export function figureStep(figures: readonly FigurePack[], language: Language = 'zh'): PetDialog {
  const S = guideStrings(language);
  return {
    text: S.askFigure, marks: [S.figureMark], actions: ['thinking'],
    input: {
      kind: 'choices', confirm: S.figureOk, value: Math.max(0, figures.findIndex((p) => p.id === 'coo')),
      options: figures.map((p) => {
        const image = figureThumb(p);
        const own = S.figures[p.id];
        return { label: own?.label ?? S.packName(p.manifest.name) ?? p.id, ...(own ? { line: own.line } : {}), ...(image ? { image } : {}) };
      }),
    },
  };
}

/** Puts on `pack` (its default pick) as the dressing page saves a look: the pet server's `POST /api/skin`. */
async function wearFigure(pet: DesktopPetWorld, pack: FigurePack): Promise<boolean> {
  const state = pet.petState() as { url?: string | null; skin?: Record<string, unknown> };
  if (!state.url) return false;
  const skin = { ...state.skin, figure: pack.id, scheme: defaultScheme(pack) };
  try {
    const res = await fetch(new URL('/api/skin', state.url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skin }) });
    return res.ok;
  } catch {
    return false;
  }
}

const keyInput = (v: Vendor, later: string, S: GuideText): PetDialog['input'] => ({
  kind: 'text', submit: S.keySend, placeholder: S.keyHint(v), secret: true, maxLength: 200,
  link: { label: S.keyLink(v), url: v.keyUrl }, alt: later,
});

let running = false;

/** Runs the introduction; a second call while it runs does nothing. */
export async function runGuide(deps: GuideDeps): Promise<void> {
  if (running) return;
  running = true;
  // a first start: the introduction has never run here (the figure is asked only then)
  const fresh = !guideDone(deps.doneFile);
  const t = talker(deps.pet);
  const language = () => deps.language?.() ?? 'zh';
  const call = api(deps.console, language);
  /** The text in the app language, read at each step. */
  const T = () => guideStrings(language());
  let reached = 0;
  let name: string | null = null;
  const transcript: string[] = [];
  const step = (n: number, d: PetDialog): Promise<PetDialogAnswer> => {
    if (n > reached) { reached = n; deps.track?.('guide_step', { step: n }); }
    return t.show({ ...d, step: [n, STEPS], closable: true }).then((a) => {
      transcript.push(...noteStep(d, a));
      if ('closed' in a) throw new Closed();
      return a;
    });
  };
  try {
    // a moment for Coo to land after the window opens
    while (!t.connected()) await sleep(POLL_MS);
    await sleep(1800);
    const values = await call<{ groups?: Array<{ group: { id: string }; values?: Record<string, unknown> }> }>('/api/config')
      .then((d) => d.groups?.find((g) => g.group.id === PET_GROUP)?.values ?? {}).catch(() => ({} as Record<string, unknown>));
    const setPet = (key: string, value: string) => call('/api/config', { group: PET_GROUP, values: { [key]: value } }).catch(() => {});

    // 1 hello, and a name
    await step(1, { text: T().hello, marks: ['Coo'], actions: ['happy', 'hop'], input: { kind: 'buttons', options: [{ label: T().helloReply, primary: true }] } });
    const saved = typeof values[USER_KEY] === 'string' ? values[USER_KEY] as string : '';
    const a = await step(1, {
      text: T().askName, actions: ['thinking'],
      input: { kind: 'text', submit: T().nameSend, placeholder: T().namePlaceholder, value: saved && !DEFAULT_USERS.includes(saved) ? saved : '', maxLength: 20 },
    });
    const named = 'text' in a ? a.text : saved || T().namePlaceholder;
    name = named;
    if (named !== saved) await setPet(USER_KEY, named);
    await step(1, { text: T().gotName(named), actions: ['love'] });
    const src = await step(1, {
      text: T().askSource, actions: ['thinking'],
      input: { kind: 'buttons', options: T().sources.map((label) => ({ label })) },
    });
    const source = SOURCE_IDS['index' in src ? src.index : SOURCE_IDS.length - 1] ?? 'skip';
    deps.track?.('source', { answer: source });
    if (source !== 'skip') await step(1, { text: T().sourceThanks, actions: ['nod'] });

    // 2 which figure, on a first start while the pet is still Coo: Coo stays unless another is picked
    const pet = deps.pet();
    const figures = fresh && pet && ((pet.petState().skin as { figure?: string } | undefined)?.figure ?? 'coo') === 'coo' ? guideFigures(pet.packs()) : [];
    if (figures.length > 1) {
      const f = await step(2, figureStep(figures, language()));
      const picked = figures['index' in f ? f.index : 0];
      const wearer = deps.pet() ?? pet;
      if (picked && picked.id !== 'coo' && wearer && await wearFigure(wearer, picked)) {
        await step(2, { text: T().figureWorn(T().figures[picked.id]?.label ?? picked.id), actions: ['happy', 'hop'] });
      } else {
        await step(2, { text: T().figureKept, actions: ['nod'] });
      }
    }

    // 2 how lively: each card plays out while it is picked
    const ORDER: Roam[] = ['off', 'calm', 'free'];
    const cur = ORDER.indexOf(values[ROAM_KEY] as Roam);
    const r = await step(2, {
      text: T().askRoam,
      input: {
        kind: 'choices', confirm: T().roamOk, value: cur < 0 ? 1 : cur,
        options: ORDER.map((id) => ({ ...T().roam[id], icon: `roam_${id}` })),
      },
    });
    const roam = ORDER['index' in r ? r.index : 1] ?? 'calm';
    await setPet(ROAM_KEY, roam);
    await step(2, { text: T().roamDone, actions: ['nod'] });

    // 3 the model key
    const k = await currentConnection(call);
    if (k.ready) await step(3, { text: T().keyAlready(k.vendor ? T().vendorName(k.vendor) : '', k.model), actions: ['happy'] });
    else if (!await connectLoop((d) => step(3, d), call, deps.pet, { text: T().askVendor, actions: ['thinking'], step: [3, STEPS] }, T().keyLater, language)) {
      await step(3, { text: T().keySkipped, actions: ['sad'] });
    }

    // 4 voice input
    let voice = deps.pet()?.voiceState() as VoiceState | undefined;
    if (voice?.enabled !== false && voice?.engine === 'funasr' && voice.model && voice.model.phase !== 'ready') {
      const mb = Math.round(voice.model.bytes / 1048576);
      const d = await step(4, {
        text: T().askModel(mb), actions: ['thinking'],
        input: { kind: 'buttons', options: [{ label: T().download, primary: true }, { label: T().notNow }] },
      });
      if ('index' in d && d.index === 0) {
        const bar = deps.pet()?.dialog({ text: T().downloading, step: [4, STEPS], input: { kind: 'progress', label: `${mb} MB` } });
        void deps.pet()?.installVoice();
        for (;;) {
          await sleep(POLL_MS);
          voice = deps.pet()?.voiceState() as VoiceState | undefined;
          const m = voice?.model;
          if (!m || m.phase === 'ready' || m.phase === 'error' || m.phase === 'absent') break;
          bar?.update({ progress: m.total ? m.done / m.total : null });
        }
        bar?.close();
        if (voice?.model?.phase === 'ready') await step(4, { text: T().downloaded, actions: ['love', 'hop'] });
        else await step(4, { text: T().downloadFail(voice?.model?.detail ?? '?'), actions: ['sad'] });
      } else {
        await step(4, { text: T().modelLater });
      }
    }
    await step(4, talkStep(voice, language()));

    // 5 the buttons, the menu, and where settings live
    await step(5, { text: T().buttons, actions: ['wink'], input: { kind: 'buttons', options: [{ label: T().ok, primary: true }] } });
    await step(5, { text: T().persona, marks: [T().personaMark], actions: ['happy'], input: { kind: 'buttons', options: [{ label: T().personaOk, primary: true }] } });
    const end = await step(5, { text: T().finish, actions: ['happy'], input: { kind: 'buttons', options: [{ label: T().go, primary: true }, { label: T().dress }] } });
    markDone(deps.doneFile);
    deps.track?.('guide_finished', {});
    deps.onEnd?.({ finished: true, name, step: reached, transcript });
    if ('index' in end && end.index === 1) deps.openDress();
  } catch (err) {
    if (!(err instanceof Closed)) throw err;
    deps.track?.('guide_closed', { step: reached });
    markDone(deps.doneFile);
    const closed = T().closed;
    await t.show({ text: closed, actions: ['nod'] });
    transcript.push(`Coo:${closed}`);
    deps.onEnd?.({ finished: false, name, step: reached, transcript });
  } finally {
    running = false;
  }
}

export const guideDone = (file: string) => existsSync(file);

export function markDone(file: string): void {
  try { writeFileSync(file, JSON.stringify({ doneAt: new Date().toISOString() }) + '\n'); } catch { /* read-only data dir: it shows again next start */ }
}

/** Without a key, how long after an ask the pet asks again. */
const ASK_AGAIN_MS = 20 * 60_000;
/** Talking to Coo without a key asks again sooner, but not within this long of the last ask. */
const ASK_TALKED_MS = 90_000;
/** How often the loop looks at the key (it reads the endpoint's `.env`). */
const KEY_POLL_MS = 2000;

/**
 * While no key is set, the pet asks for it in its bubble, with the key box right there: a while
 * after each ask, or sooner once the person talks to Coo (what they said waits, undelivered, for
 * the key). The first ask comes `firstAfterMs` after the call.
 */
export async function askForKey(deps: Pick<GuideDeps, 'pet' | 'console' | 'language'>, keySet: () => boolean, talked: () => boolean, firstAfterMs: number): Promise<void> {
  const t = talker(deps.pet);
  const language = () => deps.language?.() ?? 'zh';
  const call = api(deps.console, language);
  let lastAsk = Date.now() - ASK_AGAIN_MS + firstAfterMs;
  let asked = false;
  while (!keySet()) {
    const since = Date.now() - lastAsk;
    const spoke = talked();
    if (t.connected() && !running && (since >= ASK_AGAIN_MS || (spoke && since >= ASK_TALKED_MS))) {
      const S = guideStrings(language());
      const text = !asked ? S.ask.first : spoke ? S.ask.talked : S.ask.again;
      await connectLoop(t.show, call, deps.pet, { text, actions: ['thinking'], closable: true }, S.askLater, language).catch(() => false);
      asked = true;
      lastAsk = Date.now();
      talked(); // what was said while the bubble was up got its answer there
    }
    await sleep(KEY_POLL_MS);
  }
}
