/**
 * Decider mode (scratch/decider/DESIGN.md): the chat model writes how it feels, and an OpenRouter decision model picks
 * the words of the body on screen that show it.
 *
 * - `buildQuestions`: one choice question per part of her (face, head, arm, body and posture, and a tail, ears or
 *   wings when the figure has words for them), each with a "keep" option first, the options built from the pack's
 *   vocabulary (first name as the key, `about` and the other names as the guidance). Every motion but walk and run is
 *   in exactly one question (`partOf`, the same grouping the classic prompt's table uses).
 * - `buildState`: the background, in Chinese: the feeling, what she is about to say, what the person said last, her
 *   posture and place, what she did lately, the time.
 * - `pickGroup`: from the answers to one group of words (`a+b+c`): a floor per question, a repeat avoided, at most two
 *   parts besides the face, a pair of faces the figure composes, clashes (`clashes`) settled by probability, except
 *   that a posture she stays in wins over a face it cannot be shown with (on `pet_feel` over any part). The group then goes through
 *   `parseActions` as any other.
 * - `DeciderClient`: the HTTP call with a timeout, a circuit breaker and usage parsing; the key is read at each call
 *   and never kept, logged or put in an error.
 * - `localPick`: when a decision fails (timeout, an error status, an answer it cannot read, the breaker open), a face
 *   and a head move the feeling names outright, or a nod for a feeling that clearly agrees, or nothing.
 */
import {
  APPENDAGES, APPENDAGE_NAMES, INLINE_TAG_MAX, channelsOf, clashes, firstName, moodLabel, pairKey, partOf, vocabId,
  type Channel, type Pairs, type VocabWord,
} from './script.ts';

export const DECIDER_DEFAULT_MODEL = 'perplexity/pplx-decider-v1.1-27b';
export const DECIDER_URL = 'https://openrouter.ai/api/alpha/decisions';
/**
 * Where OpenRouter lists its decision models: the public model list narrowed to those whose output is decisions
 * (no key needed, and none is sent). Each entry has `id`, `name`, `pricing.prompt` (USD per input token, a string),
 * `context_length` and `architecture.output_modalities` (`['decisions']`).
 */
export const DECIDER_MODELS_URL = 'https://openrouter.ai/api/v1/models?output_modalities=decisions';
/**
 * The least context a decision model needs to take one of our requests. Measured: Claude-chan's four questions
 * (59 faces, 39 arm options…) came to 4.6k input tokens on pplx-decider-v1.1-27b, and the girls with a tail, ears or
 * wings ask five or six questions; 8k leaves room for those, a longer state and a third-party pack's bigger list.
 */
export const DECIDER_MIN_CONTEXT = 8192;
/**
 * The listing the console offers when OpenRouter cannot be reached (ids only: no price or context is made up). No
 * `:free` model: under OpenRouter's zero-data-retention setting it never has an endpoint, and a free endpoint may log
 * prompts (inception/mercury-decide:free failed every call that way).
 */
export const DECIDER_FALLBACK_MODELS: readonly string[] = [
  DECIDER_DEFAULT_MODEL, '~perplexity/pplx-decider-latest', 'typesafe/jev-1.14', 'liquid/d1',
];
/** How long the pet page holds a bubble for its words before it starts typing anyway (`say` with `acts: 'pending'`). */
export const DECIDER_HOLD_MS = 1100;
/** Consecutive failures that open the breaker, and how long it stays open. */
export const BREAKER_FAILS = 3;
export const BREAKER_MS = 60_000;
/** Text lengths in the state. */
export const FEELING_MAX = 200;
const LINE_MAX = 200;
const STATE_MAX = 1500;

export type QuestionId = 'face' | 'head' | 'arm' | 'body' | 'tail' | 'ears' | 'wings';
export const QUESTION_IDS: readonly QuestionId[] = ['face', 'head', 'arm', 'body', 'tail', 'ears', 'wings'];

/**
 * What she is doing now, as the World tracks it from the page's `pose` reports (`layout.mode`) and the last posture
 * word it sent (a kneel shows as `sit` on the page).
 */
export type Posture = 'stand' | 'sit' | 'kneel' | 'lie' | 'sleep' | 'wake' | 'walk' | 'run' | 'busy' | 'dizzy';
export const POSTURE_NAMES: Record<Posture, string> = {
  stand: '站着', sit: '坐着', kneel: '跪坐', lie: '趴着', sleep: '睡着', wake: '正在起来', walk: '在走', run: '在跑',
  busy: '被拎着或在空中', dizzy: '摔晕了',
};
/** The posture word a posture already is: the body question leaves it out. */
const POSTURE_WORD: Partial<Record<Posture, string>> = { stand: 'stand', sit: 'sit', kneel: 'kneel', lie: 'lie', sleep: 'sleep' };

export interface Option {
  /** The key the decision model answers with. */
  key: string;
  /** The word, or null for the question's keep option. */
  id: string | null;
  about: string;
}

export interface Question {
  id: QuestionId;
  instructions: string;
  /** The keep option's key (the first option). */
  keep: string;
  options: Option[];
}

const INSTRUCTIONS: Record<QuestionId, string> = {
  face: '她这一刻脸上是什么表情?',
  head: '她的头要不要做个动作(点头、摇头、歪头之类)?',
  arm: '她的手要不要做个手势或手上的动作?',
  body: '她的身体或姿势要不要变(坐下、跪坐、趴下、跳、转身之类)?',
  tail: '她的尾巴要不要动?',
  ears: '她的耳朵要不要动?',
  wings: '她的翅膀要不要动?',
};
const KEEP: Record<QuestionId, string> = {
  face: '不换表情', head: '头不动', arm: '手不动', body: '保持现在的姿势', tail: '尾巴不动', ears: '耳朵不动', wings: '翅膀不动',
};
const KEEP_ABOUT: Record<QuestionId, string> = {
  face: '脸上没有特别的变化,保持现在的表情',
  head: '不需要点头、摇头这类头部动作',
  arm: '不需要手势',
  body: '不需要换姿势或全身动作',
  tail: '尾巴照平常的样子',
  ears: '耳朵照平常的样子',
  wings: '翅膀照平常的样子',
};

/** Which question a word is asked in, or null (walk and run: `pet_walk` moves her). */
export function questionOf(v: VocabWord): QuestionId | null {
  if (v.kind === 'expression') return 'face';
  if (v.id === 'walk' || v.id === 'run') return null;
  const { part } = partOf(v);
  if (part === 0) return 'head';
  if (part === 1) return channelsOf(v)[0] as QuestionId;
  if (part === 2 || part === 3) return 'arm';
  return 'body';
}

export interface QuestionOptions {
  /** For a bubble (`pet_say`, `pet_ask`): sleep is left out (asleep she cannot talk). */
  forSay?: boolean;
  posture?: Posture;
  /** Leave the words' other names out of the options' guidance (a shorter, faster request). */
  noAliases?: boolean;
  /** Leave a face's mood group out of its guidance. */
  noMood?: boolean;
}

/**
 * The questions for the body whose vocabulary is `vocab`, in order: face, head, arm, body, then the figure's tail,
 * ears, wings. A question is left out when it has no word (and the body question while she is carried or in the air).
 */
export function buildQuestions(vocab: readonly VocabWord[], opts: QuestionOptions = {}): Question[] {
  const posture = opts.posture ?? 'stand';
  const byQ = new Map<QuestionId, VocabWord[]>();
  for (const v of vocab) {
    const q = questionOf(v);
    if (!q) continue;
    if (q === 'body') {
      if (opts.forSay && v.id === 'sleep') continue;
      if (POSTURE_WORD[posture] === v.id) continue;
    }
    if (!byQ.has(q)) byQ.set(q, []);
    byQ.get(q)!.push(v);
  }
  if (posture === 'busy') byQ.delete('body');
  const taken = new Set<string>();
  const out: Question[] = [];
  for (const id of QUESTION_IDS) {
    const words = byQ.get(id);
    if (!words?.length) continue;
    let keep = id === 'body' ? `${KEEP.body}(现在:${POSTURE_NAMES[posture]})` : KEEP[id];
    // a keep key that names a word would be read as that word
    if (vocabId(keep, vocab) !== null) keep = `(${keep})`;
    const options: Option[] = [{ key: keep, id: null, about: KEEP_ABOUT[id] }];
    for (const v of words) {
      let key = firstName(v);
      if (taken.has(key) || key === keep) key = `${key}(${v.id})`;
      taken.add(key);
      options.push({ key, id: v.id, about: aboutOf(v, opts) });
    }
    out.push({ id, instructions: INSTRUCTIONS[id], keep, options });
  }
  return out;
}

/** An option's guidance: what it looks like, its other names, its mood group (a face), and that a posture lasts. */
function aboutOf(v: VocabWord, opts: QuestionOptions = {}): string {
  const about = (v.about.zh ?? Object.values(v.about)[0] ?? '').trim();
  const names = (v.names.zh ?? Object.values(v.names)[0] ?? []).slice(1);
  const parts = [about || firstName(v)];
  if (v.kind === 'expression' && !opts.noMood) parts.push(`心情:${moodLabel(v.id)}`);
  if (names.length && !opts.noAliases) parts.push(`也叫:${names.join('、')}`);
  if (v.lasting) parts.push('会一直保持下去');
  if (v.id === 'petrify') parts.push('其他部位都不能同时动');
  const app = APPENDAGES.find((c) => channelsOf(v).length === 1 && channelsOf(v)[0] === c);
  if (app) parts.push(`${APPENDAGE_NAMES[app]}的动作`);
  return parts.join(';');
}

/**
 * A bubble's text in decider mode with the markers written out of habit taken out (the bot sees no words here, so
 * most are made up): every closed `【…】` (one line, at most 64 characters), and a `<…>` or `＜…＞` whose inside
 * names a word of `vocab` (`点头`) or is only CJK characters and `+＋、，` (`小声`, `开心+招手`). Other angle
 * brackets are the text itself (`<div>`, `a < b`, `3<5`, `<3`), unlike classic `parseScript`, which reads every
 * short `<…>` as a marker.
 */
export function stripMarkers(text: string, vocab: readonly VocabWord[]): { text: string; stripped: boolean } {
  const names = (inner: string) => inner.split(/[,，、\s+＋]+/).some((t) => t !== '' && vocabId(t, vocab) !== null);
  const cjkOnly = (inner: string) => /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー+＋、，]+$/u.test(inner);
  let stripped = false;
  const out = text.replace(/【([^【】\n]*)】|<([^<>\n]*)>|＜([^＜＞\n]*)＞/g, (all, a?: string, b?: string, c?: string) => {
    const marker = a !== undefined
      ? a.length <= 64
      : (b ?? c ?? '').length <= INLINE_TAG_MAX && (names(b ?? c ?? '') || cjkOnly(b ?? c ?? ''));
    if (!marker) return all;
    stripped = true;
    return '';
  });
  return { text: stripped ? out.trim() : text, stripped };
}

/* ---------------- state ---------------- */

export interface StateContext {
  /** The body as the prompt describes it (`bodyText`). */
  body: string;
  feeling: string;
  /** What she is about to say (a bubble, a question). */
  text?: string;
  /** What the person said last, when it was within ten minutes. */
  heard?: { who: string; text: string; via: string; agoMs: number } | null;
  posture: Posture;
  /** Where she stands, as a phrase (屏幕偏右), and which way she faces. */
  place?: string;
  facing?: 1 | -1;
  /** The last decisions, most recent first. */
  recent?: ReadonlyArray<{ words: readonly string[]; agoMs: number }>;
  /** The local time, as a phrase (周三 23:40). */
  time?: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
export function agoText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} 秒前`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} 分钟前` : `${Math.round(m / 60)} 小时前`;
}

/** The background the decision model reads, one fact a line, at most STATE_MAX characters. */
export function buildState(c: StateContext): string {
  const lines = [
    `你是桌面上的一个小角色:${c.body}。下面是她此刻的状态,请替她选出最贴切的表情和动作;多数时候一两个部位动一动就够,不贴切就选「不动」类的选项。`,
    `她此刻的心情:${clip(c.feeling.trim(), FEELING_MAX)}`,
  ];
  if (c.text?.trim()) lines.push(`她正要说的话:${clip(c.text.trim(), LINE_MAX)}`);
  if (c.heard) lines.push(`对方刚才说(${agoText(c.heard.agoMs)},${c.heard.via}):${clip(c.heard.text, LINE_MAX)}`);
  const facing = c.facing === 1 ? ',面朝右' : c.facing === -1 ? ',面朝左' : '';
  lines.push(`她现在:${POSTURE_NAMES[c.posture]}${c.place ? `,在${c.place}` : ''}${facing}`);
  const recent = (c.recent ?? []).filter((r) => r.words.length).slice(0, 5);
  if (recent.length) lines.push(`最近做过(从近到远):${recent.map((r) => `${r.words.join('+')}(${agoText(r.agoMs)})`).join('、')}——别老重复同一个`);
  if (c.time) lines.push(`时间:${c.time}`);
  let s = lines.join('\n');
  if (s.length > STATE_MAX) s = s.slice(0, STATE_MAX);
  return s;
}

/* ---------------- request and answers ---------------- */

export interface DecisionRequest {
  model: string;
  state: string;
  questions: Record<string, { type: 'choice'; instructions?: string; criteria: Record<string, string> }>;
}

/**
 * The request body. `withInstructions` puts each question's sentence in its own `instructions` field (待确认: the
 * field is in community examples, not in the task's description of the interface); without it the questions are
 * listed at the end of the state.
 */
export function buildRequest(model: string, state: string, questions: readonly Question[], withInstructions = true): DecisionRequest {
  const qs: DecisionRequest['questions'] = {};
  for (const q of questions) {
    qs[q.id] = {
      type: 'choice',
      ...(withInstructions ? { instructions: q.instructions } : {}),
      criteria: Object.fromEntries(q.options.map((o) => [o.key, o.about])),
    };
  }
  const tail = withInstructions ? '' : `\n题目:${questions.map((q) => `${q.id}:${q.instructions}`).join(' ')}`;
  return { model, state: state + tail, questions: qs };
}

export interface Answer {
  choice: string | null;
  probabilities: Record<string, number>;
  confidence: number | null;
}

export interface DecisionUsage { inputTokens: number; outputTokens: number; cost: number | null }

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** The answers of a response body (unknown fields ignored, a malformed answer left out), or null when there are none. */
export function parseAnswers(body: unknown): Record<string, Answer> | null {
  const raw = (body as { answers?: unknown } | null)?.answers;
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, Answer> = {};
  for (const [name, a] of Object.entries(raw as Record<string, unknown>)) {
    if (!a || typeof a !== 'object') continue;
    const r = a as Record<string, unknown>;
    const probabilities: Record<string, number> = {};
    if (r.probabilities && typeof r.probabilities === 'object') {
      for (const [k, v] of Object.entries(r.probabilities as Record<string, unknown>)) { const n = num(v); if (n !== null) probabilities[k] = n; }
    }
    const choice = typeof r.choice === 'string' ? r.choice : null;
    if (choice === null && !Object.keys(probabilities).length) continue;
    out[name] = { choice, probabilities, confidence: num(r.confidence) };
  }
  return out;
}

/** Usage of a response body, snake_case or camelCase (待确认 which one OpenRouter sends). */
export function parseUsage(body: unknown): DecisionUsage {
  const u = ((body as { usage?: unknown } | null)?.usage ?? {}) as Record<string, unknown>;
  return {
    inputTokens: num(u.input_tokens) ?? num(u.inputTokens) ?? num(u.prompt_tokens) ?? 0,
    outputTokens: num(u.output_tokens) ?? num(u.outputTokens) ?? num(u.completion_tokens) ?? 0,
    cost: num(u.cost) ?? num(u.total_cost) ?? null,
  };
}

/* ---------------- from answers to a group ---------------- */

/** The least probability a question's winner needs to move that part of her. */
export const FLOOR: Record<QuestionId, number> = { face: .20, head: .30, arm: .30, body: .55, tail: .50, ears: .50, wings: .50 };
/** Postures that need more: she stays in them. */
const FLOOR_WORD: Record<string, number> = { sleep: .70, lie: .70 };
/** On `pet_feel` the bot asks for a body itself (to go to sleep, to lie down): a posture needs only this. */
const FEEL_FLOOR_WORD: Record<string, number> = { sleep: .50, lie: .50, sit: .50, kneel: .50 };
/** The postures she stays in, which win over a face they clash with (`postureOverFace`); on `pet_feel` over any part. */
const LASTING_POSTURES = new Set(['sleep', 'lie', 'sit', 'kneel']);

/**
 * The knobs of `pickGroup` (scratch/decider/tune/tune.ts runs it over a grid of them): the floor per question and per
 * lasting posture; a repeated winner (the same word in this question in each of the last `repeatWindow` decisions)
 * gives way to the second when that is a word, above its floor and at least `repeatRatio` of the winner
 * (`repeatWindow` 0: never); at most `budget` parts besides the face; a face's second choice joins it as a pair (when
 * the figure composes the two) above `pairMin` and `pairRatio` of the winner, unless `pairs` is off. On a `pet_feel`
 * call (`PickContext.feel`) a word of `feelFloorWord` needs that instead of its question's and `floorWord`'s floor.
 * With `postureOverFace`, a body winner that is a posture she stays in (sleep, lie, sit, kneel) and clashes with the
 * face is settled before the face, which gives way to its runner-up (a face that fits) or goes, whichever is likelier;
 * on a `pet_feel` call the posture also comes before every other part (the bot asked for it), so whatever clashes
 * with it goes. When the posture is not kept after all (another part or the budget keeps it out), probability alone
 * settles the group, as without `postureOverFace`. (Sleep takes every face; petrify clashes with sit, lie and kneel.)
 */
export interface PickParams {
  floor: Record<QuestionId, number>;
  floorWord: Record<string, number>;
  feelFloorWord: Record<string, number>;
  postureOverFace: boolean;
  budget: number;
  repeatWindow: number;
  repeatRatio: number;
  pairs: boolean;
  pairMin: number;
  pairRatio: number;
}
export const PICK_DEFAULTS: Readonly<PickParams> = {
  floor: FLOOR, floorWord: FLOOR_WORD, feelFloorWord: FEEL_FLOOR_WORD, postureOverFace: true, budget: 2, repeatWindow: 2, repeatRatio: .6, pairs: true, pairMin: .08, pairRatio: .2,
};

export interface PickContext {
  vocab: readonly VocabWord[];
  pairs?: Pairs;
  /** The option keys each question chose in the last decisions, most recent first. */
  recent?: ReadonlyArray<Partial<Record<QuestionId, string | null>>>;
  /** The decision is for `pet_feel`: the bot asked for the body itself, with no bubble (`feelFloorWord`). */
  feel?: boolean;
  /** Other knobs than the shipped ones (tuning). */
  params?: Partial<PickParams>;
}

export interface Pick {
  /** The words, in no particular order (`parseActions` orders a group). */
  ids: string[];
  /** Per question, the option chosen (its key) or why the part stays still. */
  why: Partial<Record<QuestionId, string>>;
  /** The option key each question ended on (null: stays still), for the next decisions' repeat rule. */
  chosen: Partial<Record<QuestionId, string | null>>;
}

interface Ranked { key: string; p: number }

function ranked(q: Question, a: Answer | undefined): Ranked[] {
  if (!a) return [];
  const keys = new Set(q.options.map((o) => o.key));
  const ps = Object.entries(a.probabilities).filter(([k]) => keys.has(k)).map(([key, p]) => ({ key, p }));
  if (!ps.length && a.choice && keys.has(a.choice)) return [{ key: a.choice, p: 1 }];
  return ps.sort((x, y) => y.p - x.p);
}

export function pickGroup(questions: readonly Question[], answers: Readonly<Record<string, Answer>>, ctx: PickContext): Pick {
  const P: PickParams = { ...PICK_DEFAULTS, ...ctx.params };
  const byId = new Map(ctx.vocab.map((v) => [v.id, v]));
  const why: Pick['why'] = {};
  const chosen: Pick['chosen'] = {};
  type Cand = { q: Question; key: string; v: VocabWord; p: number; pair?: VocabWord; alt?: Cand };
  const cands: Cand[] = [];
  for (const q of questions) {
    const r = ranked(q, answers[q.id]);
    const idOf = (key: string) => q.options.find((o) => o.key === key)?.id ?? null;
    let win = r[0], second = r[1], swapped = false;
    chosen[q.id] = null;
    if (!win) { why[q.id] = '没有回答'; continue; }
    if (idOf(win.key) === null) { why[q.id] = `${win.key}(${win.p.toFixed(2)})`; continue; }
    const floorOf = (key: string) => {
      const id = idOf(key) ?? '';
      return ctx.feel && Object.hasOwn(P.feelFloorWord, id) ? P.feelFloorWord[id]! : Math.max(P.floor[q.id], P.floorWord[id] ?? 0);
    };
    // the same word in this question in the last decisions: the second, when it is a word nearly as likely
    const repeated = P.repeatWindow > 0 && (ctx.recent ?? []).slice(0, P.repeatWindow).filter((d) => d[q.id] === win!.key).length >= P.repeatWindow;
    if (repeated && second && idOf(second.key) !== null && second.p >= P.repeatRatio * win.p && second.p >= floorOf(second.key)) {
      why[q.id] = `${win.key} 刚做过两次,换成 ${second.key}`;
      [win, second] = [second, r[0]];
      swapped = true;
    }
    if (win.p < floorOf(win.key)) { why[q.id] = `${win.key} 概率 ${win.p.toFixed(2)} 不够`; continue; }
    const v = byId.get(idOf(win.key)!);
    if (!v) continue;
    const cand: Cand = { q, key: win.key, v, p: win.p };
    if (q.id === 'face' && second) {
      const v2 = byId.get(idOf(second.key) ?? '');
      // two faces this figure shows as one
      if (P.pairs && v2 && v2.kind === 'expression' && second.p >= P.pairMin && second.p >= P.pairRatio * win.p && Object.hasOwn(ctx.pairs ?? {}, pairKey(v.id, v2.id))) cand.pair = v2;
      // the face in its place when a posture takes this one (not the one the repeat rule just put aside)
      if (!swapped && v2 && v2.kind === 'expression' && second.p >= floorOf(second.key)) cand.alt = { q, key: second.key, v: v2, p: second.p };
    }
    cands.push(cand);
    why[q.id] ??= `${win.key}(${win.p.toFixed(2)})`;
  }
  // most likely first: at most P.budget parts besides the face, and none that clashes with one kept. A posture she
  // stays in comes before a face it clashes with (so the face never takes it), and on pet_feel before everything;
  // when the posture is not kept after all, the face does not give way for nothing and probability alone settles it
  const posture = P.postureOverFace ? cands.find((c) => c.q.id === 'body' && LASTING_POSTURES.has(c.v.id)) : undefined;
  const why0 = { ...why }, chosen0 = { ...chosen };
  const settle = (first: Cand | undefined) => {
    const rank = (c: Cand) => (!first ? c.p : c === first && ctx.feel ? Infinity
      : c.q.id === 'face' && clashes(c.v, first.v) ? Math.min(c.p, first.p) : c.p);
    const order = [...cands].sort((a, b) => rank(b) - rank(a) || Number(b === first) - Number(a === first));
    const kept: Cand[] = [];
    let parts = 0;
    for (const c of order) {
      const clash = kept.find((k) => clashes(k.v, c.v));
      if (c.q.id === 'face' && first && kept.includes(first) && clashes(c.v, first.v)) {
        const alt = c.alt && !kept.some((k) => clashes(k.v, c.alt!.v)) ? c.alt : undefined;
        why.face = `${c.key} 和 ${first.key} 不能同时做,留下姿势${alt ? `,换成 ${alt.key}` : ''}`;
        if (alt) { kept.push(alt); chosen.face = alt.key; }
        continue;
      }
      if (clash && clash === first && ctx.feel) { why[c.q.id] = `${c.key} 和 ${clash.key} 不能同时做,留下姿势`; continue; }
      if (clash) { why[c.q.id] = `${c.key} 和 ${clash.key} 不能同时做,没做`; continue; }
      if (c.q.id !== 'face' && parts >= P.budget) { why[c.q.id] = `${c.key} 超出一次最多动 ${P.budget} 个部位,没做`; continue; }
      if (c.q.id !== 'face') parts++;
      kept.push(c);
      chosen[c.q.id] = c.key;
    }
    return kept;
  };
  let kept = settle(posture);
  if (posture && !kept.includes(posture)) {
    for (const k of Object.keys(why) as QuestionId[]) delete why[k];
    Object.assign(why, why0);
    Object.assign(chosen, chosen0);
    kept = settle(undefined);
  }
  const ids = kept.flatMap((c) => (c.pair ? [c.v.id, c.pair.id] : [c.v.id]));
  return { ids, why, chosen };
}

/* ---------------- when the decision model gives no answer ---------------- */

/** Failures after which the World picks the words itself from the feeling (`localPick`); not without a key, not on a stop. */
export const LOCAL_FALLBACK: ReadonlySet<DecideFailure> = new Set(['timeout', 'http', 'bad', 'network', 'breaker']);
/** Postures in which she shows no face or head move of her own choosing: asleep, dizzy. */
const NO_LOCAL: ReadonlySet<Posture> = new Set(['sleep', 'dizzy']);
/** Words the fallback never picks: the plain face (平静 says nothing), and stone, which takes every part. */
const LOCAL_SKIP: ReadonlySet<string> = new Set(['neutral', 'petrify']);
/** Right before a match, a word that turns it round (不开心, 没有生气, 别担心, not happy). */
const NEGATED_ZH = /(?:不|没|别|未|勿|无|没有|不太|不怎么|不那么|没那么|不是很|不再)$/;
/** A 别 that is the end of a word, not "don't": 特别开心 is very happy, 告别, 分别, 区别, 级别… */
const BIE_WORD = /[特分告区级性离派类差识辨个送道永惜久诀判鉴拜话阔]别$/;
/** Right after a match, a word that turns it round: 开心不起来, 高兴不了 (not 开心不已, 开心得不得了). */
const NEGATED_AFTER_ZH = /^(?:不起来|不出来|不了(?!解)|不起)/;
/** Whether the Chinese match at `at`..`end` in `text` is turned round by the words around it. */
function negatedZh(text: string, at: number, end: number): boolean {
  const before = text.slice(Math.max(0, at - 4), at);
  if (NEGATED_AFTER_ZH.test(text.slice(end))) return true;
  if (!NEGATED_ZH.test(before)) return false;
  // a 别 that ends a word (特别, 分别…) does not turn it round, but what comes before that word may (不特别开心)
  if (before.endsWith('别') && BIE_WORD.test(text.slice(Math.max(0, at - 2), at))) return NEGATED_ZH.test(text.slice(Math.max(0, at - 6), at - 2));
  return true;
}
const NEGATED_EN = /\b(?:not|no|never|don't|didn't|isn't|aren't|wasn't|can't|won't)\s+(?:\w+\s+)?$/i;
/**
 * A feeling that clearly agrees: a nod when no word is named. Not 是的, 对的, 好的 (真是的, 面对的, 最好的朋友).
 */
const AGREE = /同意|赞同|赞成|认同|答应|没错|没问题|\bagree|\byes\b/gi;

export interface LocalPick {
  /** The words, a face first then a head move (at most one each), for `parseActions` as one group. */
  ids: string[];
  /** What was found in the feeling: the names matched, or the agreeing phrase. */
  matched: string[];
  /** How: by names in the feeling, by agreement (a nod), or nothing. */
  by: 'names' | 'agree' | 'none';
}

const isAscii = (s: string) => /^[\x20-\x7e]+$/.test(s);

/** The places name `n` appears in `text` not turned round by a word before it (ASCII names: whole words, any case). */
function hits(text: string, n: string): number[] {
  const out: number[] = [];
  if (isAscii(n)) {
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    for (let m = re.exec(text); m; m = re.exec(text)) if (!NEGATED_EN.test(text.slice(0, m.index))) out.push(m.index);
    return out;
  }
  for (let i = text.indexOf(n); i >= 0; i = text.indexOf(n, i + 1)) if (!negatedZh(text, i, i + n.length)) out.push(i);
  return out;
}

/**
 * The words the World does itself when a decision fails (LOCAL_FALLBACK): the offline mock's overlap match
 * (scratch/combo2/eval/lib/mock-decider.ts) cut down to whole names, so one shared character (心 in 担心 and 开心)
 * never picks a word. Among the face and head words of `vocab` (the body on screen: the words its page said it
 * knows), a name or id written in the feeling (not right after 不/没/别…, a 别 that ends 特别/分别… aside, nor
 * right before 不起来/不了) picks that word, the longest name first,
 * then the earliest; one face and at most one head move, never a posture, an arm or a whole-body move, never 平静 or
 * 石化, and one-character names (困, 哭, 唉) do not count (困 in 困惑). With no word named, a feeling that clearly
 * agrees (同意, 没错, 没问题…) gets a nod if the body has one; otherwise nothing. Asleep or dizzy: nothing.
 */
export function localPick(feeling: string, vocab: readonly VocabWord[], posture: Posture = 'stand'): LocalPick {
  const none: LocalPick = { ids: [], matched: [], by: 'none' };
  const text = feeling.trim();
  if (!text || NO_LOCAL.has(posture)) return none;
  type Hit = { v: VocabWord; name: string; len: number; at: number };
  const best: Partial<Record<'face' | 'head', Hit>> = {};
  for (const v of vocab) {
    if (LOCAL_SKIP.has(v.id)) continue;
    const q = questionOf(v);
    if (q !== 'face' && q !== 'head') continue;
    const names = [...new Set([...Object.values(v.names).flat(), v.id])].filter((n) => n.trim() && (isAscii(n) ? n.length >= 3 : [...n].length >= 2));
    for (const name of names) {
      const at = hits(text, name)[0];
      if (at === undefined) continue;
      const h: Hit = { v, name, len: [...name].length, at };
      const b = best[q];
      if (!b || h.len > b.len || (h.len === b.len && h.at < b.at)) best[q] = h;
    }
  }
  const face = best.face, head = best.head && (!best.face || !clashes(best.face.v, best.head.v)) ? best.head : undefined;
  const got = [face, head].filter((h): h is Hit => !!h);
  if (got.length) return { ids: got.map((h) => h.v.id), matched: got.map((h) => h.name), by: 'names' };
  const nod = vocab.find((v) => v.id === 'nod');
  if (nod) {
    for (const m of text.matchAll(AGREE)) {
      if (m.index !== undefined && !(isAscii(m[0]) ? NEGATED_EN.test(text.slice(0, m.index)) : negatedZh(text, m.index, m.index + m[0].length))) {
        return { ids: ['nod'], matched: [m[0]], by: 'agree' };
      }
    }
  }
  return none;
}

/** The channels a question's words take, for tests: every word of a question takes that question's part. */
export const QUESTION_CHANNEL: Record<QuestionId, Channel> = { face: 'face', head: 'head', arm: 'arm', body: 'body', tail: 'tail', ears: 'ears', wings: 'wings' };

/* ---------------- the client ---------------- */

export type DecideFailure = 'nokey' | 'timeout' | 'http' | 'bad' | 'network' | 'breaker' | 'aborted';

export type DecideResult =
  | { ok: true; answers: Record<string, Answer>; usage: DecisionUsage; ms: number }
  | { ok: false; reason: DecideFailure; detail: string; ms: number };

export interface DeciderLog { info(msg: string): void; warn(msg: string): void; debug?(msg: string): void }

export interface DeciderClientOptions {
  url: () => string;
  /** Read at each call; '' means no key. */
  key: () => string;
  timeoutMs: () => number;
  fetch?: typeof fetch;
  now?: () => number;
  log?: () => DeciderLog | null;
}

/** Why a failure happened, as a receipt says it. */
export function failureText(reason: DecideFailure, detail = ''): string {
  switch (reason) {
    case 'nokey': return '没有 OpenRouter 密钥';
    case 'timeout': return '决策模型超时';
    case 'breaker': return '决策模型连续出错,暂时用不了';
    case 'aborted': return '已停止';
    case 'http': return `决策模型返回错误${detail ? `(${detail})` : ''}`;
    case 'bad': return '决策模型的回答看不懂';
    default: return `连不上决策模型${detail ? `(${detail})` : ''}`;
  }
}

/** How much of an error message a receipt shows. */
const ERROR_MAX = 120;

/**
 * An OpenRouter error message cut to what a receipt can show: links and whitespace runs out, and its "no endpoint
 * matches your guardrails or data policy" answer told as that with the reasons it lists (`ZDR violation (guardrail)`),
 * which a plain cut loses after the boilerplate.
 */
export function errorGist(msg: string): string {
  const lines = msg.split(/\n+/)
    .map((l) => l.replace(/;?\s*configurable at\s+\S+/gi, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (/guardrail|data policy/i.test(lines[0] ?? '')) {
    const reasons = [...new Set(lines.slice(1).map((l) => l.split(':')[0]!.trim()).filter((r) => r && r.length <= 60))];
    return `这个模型没有符合 OpenRouter 隐私和防护设置的服务端${reasons.length ? `:${reasons.join('、')}` : ''};换一个模型,或在 OpenRouter 的设置里放宽`;
  }
  const s = lines.join(' ');
  return s.length > ERROR_MAX ? `${s.slice(0, ERROR_MAX)}…` : s;
}

export class DeciderClient {
  private fails = 0;
  private openUntil = 0;
  private warned = false;
  private readonly controllers = new Set<AbortController>();
  /** The last call: when, how long, and how it ended; for the console's lamp. */
  last: { at: number; ms: number; ok: boolean; reason?: string } | null = null;
  calls = 0;
  cost = 0;
  /** The most input tokens one request took this run (the console hides models with less context). */
  maxInput = 0;

  constructor(private readonly o: DeciderClientOptions) {}

  private now(): number { return this.o.now?.() ?? Date.now(); }

  /** The breaker is open: calls fail at once until it closes. */
  get open(): boolean { return this.now() < this.openUntil; }

  /** Replaces the key in a text by `***`. */
  private scrub(s: string, key: string): string {
    return key.length >= 4 ? s.split(key).join('***') : s;
  }

  async decide(body: DecisionRequest, outer?: AbortSignal): Promise<DecideResult> {
    const t0 = this.now();
    const fail = (reason: DecideFailure, detail = ''): DecideResult => {
      const ms = this.now() - t0;
      if (reason !== 'breaker' && reason !== 'nokey' && reason !== 'aborted') this.failed(reason, detail);
      this.last = { at: t0, ms, ok: false, reason: failureText(reason, detail) };
      return { ok: false, reason, detail, ms };
    };
    if (this.open) return fail('breaker');
    const key = this.o.key();
    if (!key) return fail('nokey');
    const ctrl = new AbortController();
    this.controllers.add(ctrl);
    const onOuter = () => ctrl.abort();
    outer?.addEventListener('abort', onOuter, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, Math.max(1, this.o.timeoutMs()));
    try {
      this.calls++;
      const res = await (this.o.fetch ?? fetch)(this.o.url(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'X-Title': 'Coopanion' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = '';
        try { msg = String((JSON.parse(text) as { error?: { message?: unknown } }).error?.message ?? ''); } catch { /* not JSON */ }
        return fail('http', this.scrub(`HTTP ${res.status}${msg ? ` ${errorGist(msg)}` : ''}`, key));
      }
      let json: unknown;
      try { json = JSON.parse(text); } catch { return fail('bad'); }
      const answers = parseAnswers(json);
      if (!answers || !Object.keys(answers).length) return fail('bad');
      const usage = parseUsage(json);
      if (usage.cost !== null) this.cost += usage.cost;
      this.maxInput = Math.max(this.maxInput, usage.inputTokens);
      if (this.fails >= BREAKER_FAILS || this.warned) this.o.log?.()?.info('决策模型恢复了');
      this.fails = 0;
      this.warned = false;
      const ms = this.now() - t0;
      this.last = { at: t0, ms, ok: true };
      return { ok: true, answers, usage, ms };
    } catch (err) {
      if (timedOut) return fail('timeout');
      if (outer?.aborted || ctrl.signal.aborted) return fail('aborted');
      return fail('network', this.scrub((err as Error)?.message ?? String(err), key).slice(0, 160));
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuter);
      this.controllers.delete(ctrl);
    }
  }

  private failed(reason: DecideFailure, detail: string): void {
    this.fails++;
    if (this.fails >= BREAKER_FAILS) {
      this.openUntil = this.now() + BREAKER_MS;
      this.fails = 0;
      if (!this.warned) {
        this.warned = true;
        this.o.log?.()?.warn(`决策模型连续 ${BREAKER_FAILS} 次失败(最后一次:${failureText(reason, detail)}),${BREAKER_MS / 1000} 秒内表情动作不再交给它`);
      }
    }
  }

  /** Aborts the calls in flight (World stop). */
  abortAll(): void {
    for (const c of this.controllers) c.abort();
    this.controllers.clear();
  }
}

/** A decision model as the console's picker shows it. */
export interface DeciderModel {
  id: string;
  name?: string;
  /** USD per million input tokens (0: free), or null when not known. */
  promptPerM: number | null;
  /** Context length in tokens, or null when not known. */
  context: number | null;
}

/** USD per token as OpenRouter writes it (`"0.00000002"`), per million tokens; null for anything else (negative: "varies"). */
function perMillion(x: unknown): number | null {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1e6 * 1e6) / 1e6;
}

/**
 * The decision models of an OpenRouter model listing (`{ data: [...] }`): only those whose output modalities include
 * decisions (when the listing says; the query may be ignored), without the ones whose context cannot take a request
 * (`minContext`), cheapest first then by id. Null when the body is not a listing.
 */
export function parseDeciderModels(body: unknown, minContext = DECIDER_MIN_CONTEXT): DeciderModel[] | null {
  const list = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(list)) return null;
  const out: DeciderModel[] = [];
  const seen = new Set<string>();
  for (const m of list) {
    const r = (m ?? {}) as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    if (!id || seen.has(id)) continue;
    const mods = (r.architecture as { output_modalities?: unknown } | undefined)?.output_modalities;
    if (Array.isArray(mods) && !mods.includes('decisions')) continue;
    // a listing says 0 for a context it does not know (seen on respan/*): unknown, not too small
    const len = num(r.context_length);
    const context = len !== null && len > 0 ? len : null;
    if (context !== null && context < minContext) continue;
    seen.add(id);
    out.push({
      id, ...(typeof r.name === 'string' && r.name.trim() ? { name: r.name.trim() } : {}),
      promptPerM: perMillion((r.pricing as { prompt?: unknown } | undefined)?.prompt), context,
    });
  }
  return out.sort((a, b) => (a.promptPerM ?? Infinity) - (b.promptPerM ?? Infinity) || a.id.localeCompare(b.id)).slice(0, 200);
}

/**
 * Fetches OpenRouter's decision models (no key: the listing is public, and the key is never sent to it); null when
 * the listing fails or cannot be read.
 */
export async function listDeciders(fetchImpl: typeof fetch = fetch, url = DECIDER_MODELS_URL, timeoutMs = 5000, minContext = DECIDER_MIN_CONTEXT): Promise<DeciderModel[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json', 'X-Title': 'Coopanion' }, signal: ctrl.signal });
    if (!res.ok) return null;
    return parseDeciderModels(await res.json() as unknown, minContext);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** One decision as the World reports it (`onDecision`): what was asked and answered, never the key. */
export interface DecisionRecord {
  tool: 'pet_say' | 'pet_feel' | 'pet_ask';
  feeling: string;
  text?: string;
  state: string;
  model: string;
  questions: Array<{ id: QuestionId; options: number }>;
  answers: Record<string, { choice: string | null; top: Array<[string, number]>; confidence: number | null }> | null;
  why: Partial<Record<QuestionId, string>>;
  actions: string[];
  notes: string[];
  dropped: string[];
  ms: number;
  ok: boolean;
  failure?: string;
  /**
   * The decision failed and the World picked the words itself from the feeling (`localPick`): how, and what it found
   * (`actions` holds what was done; empty when nothing matched). Absent on a decision the model made, and on a
   * failure without a fallback (no key, a stop).
   */
  fallback?: { by: LocalPick['by']; matched: string[] };
  usage?: DecisionUsage;
}

/** The answers cut to the top three probabilities per question, for records and debug logs. */
export function topAnswers(answers: Readonly<Record<string, Answer>>): NonNullable<DecisionRecord['answers']> {
  return Object.fromEntries(Object.entries(answers).map(([k, a]) => [k, {
    choice: a.choice,
    top: Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([o, p]) => [o, Math.round(p * 1000) / 1000] as [string, number]),
    confidence: a.confidence,
  }]));
}
