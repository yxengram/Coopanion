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
 *   parts besides the face, a pair of faces the figure composes, clashes (`clashes`) settled by probability. The
 *   group then goes through `parseActions` as any other.
 * - `DeciderClient`: the HTTP call with a timeout, a circuit breaker and usage parsing; the key is read at each call
 *   and never kept, logged or put in an error.
 */
import {
  APPENDAGES, APPENDAGE_NAMES, INLINE_TAG_MAX, channelsOf, clashes, firstName, moodLabel, pairKey, partOf, vocabId,
  type Channel, type Pairs, type VocabWord,
} from './script.ts';

export const DECIDER_DEFAULT_MODEL = 'perplexity/pplx-decider-v1.1-27b';
export const DECIDER_URL = 'https://openrouter.ai/api/alpha/decisions';
/**
 * Where the decision models are listed (待确认: the path is not documented; a failed listing leaves the console with
 * the default and a text box).
 */
export const DECIDER_MODELS_URL = 'https://openrouter.ai/api/alpha/decisions/models';
/** How long the pet page holds a bubble for its words before it starts typing anyway (`say` with `acts: 'pending'`). */
export const DECIDER_HOLD_MS = 900;
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
      options.push({ key, id: v.id, about: aboutOf(v, vocab) });
    }
    out.push({ id, instructions: INSTRUCTIONS[id], keep, options });
  }
  return out;
}

/** An option's guidance: what it looks like, its other names, its mood group (a face), and that a posture lasts. */
function aboutOf(v: VocabWord, vocab: readonly VocabWord[]): string {
  const about = (v.about.zh ?? Object.values(v.about)[0] ?? '').trim();
  const names = (v.names.zh ?? Object.values(v.names)[0] ?? []).slice(1);
  const parts = [about || firstName(v)];
  if (v.kind === 'expression') parts.push(`心情:${moodLabel(v.id)}`);
  if (names.length) parts.push(`也叫:${names.join('、')}`);
  if (v.lasting) parts.push('会一直保持下去');
  if (v.id === 'petrify') parts.push('其他部位都不能同时动');
  const app = APPENDAGES.find((c) => channelsOf(v).length === 1 && channelsOf(v)[0] === c);
  if (app) parts.push(`${APPENDAGE_NAMES[app]}的动作`);
  void vocab;
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
export const FLOOR: Record<QuestionId, number> = { face: .30, head: .45, arm: .45, body: .55, tail: .50, ears: .50, wings: .50 };
/** Postures that need more: she stays in them. */
const FLOOR_WORD: Record<string, number> = { sleep: .70, lie: .70 };
/** A face's second choice joins it as a pair (when the figure composes the two) above this, and above PAIR_RATIO of the winner. */
const PAIR_MIN = .20, PAIR_RATIO = .5;
/** A repeated winner gives way to the second when it is within this ratio. */
const REPEAT_RATIO = .6;
/** Parts besides the face that move at once. */
const BUDGET = 2;
/** How many earlier decisions count as "just done" for the repeat rule. */
const REPEAT_WINDOW = 2;

export interface PickContext {
  vocab: readonly VocabWord[];
  pairs?: Pairs;
  /** The option keys each question chose in the last decisions, most recent first. */
  recent?: ReadonlyArray<Partial<Record<QuestionId, string | null>>>;
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
  const byId = new Map(ctx.vocab.map((v) => [v.id, v]));
  const why: Pick['why'] = {};
  const chosen: Pick['chosen'] = {};
  type Cand = { q: Question; key: string; v: VocabWord; p: number; pair?: VocabWord };
  const cands: Cand[] = [];
  for (const q of questions) {
    const r = ranked(q, answers[q.id]);
    const idOf = (key: string) => q.options.find((o) => o.key === key)?.id ?? null;
    let win = r[0], second = r[1];
    chosen[q.id] = null;
    if (!win) { why[q.id] = '没有回答'; continue; }
    if (idOf(win.key) === null) { why[q.id] = `${win.key}(${win.p.toFixed(2)})`; continue; }
    const floorOf = (key: string) => Math.max(FLOOR[q.id], FLOOR_WORD[idOf(key) ?? ''] ?? 0);
    // the same word in this question in the last decisions: the second, when it is a word nearly as likely
    const repeated = (ctx.recent ?? []).slice(0, REPEAT_WINDOW).filter((d) => d[q.id] === win!.key).length >= REPEAT_WINDOW;
    if (repeated && second && idOf(second.key) !== null && second.p >= REPEAT_RATIO * win.p && second.p >= floorOf(second.key)) {
      why[q.id] = `${win.key} 刚做过两次,换成 ${second.key}`;
      [win, second] = [second, r[0]];
    }
    if (win.p < floorOf(win.key)) { why[q.id] = `${win.key} 概率 ${win.p.toFixed(2)} 不够`; continue; }
    const v = byId.get(idOf(win.key)!);
    if (!v) continue;
    const cand: Cand = { q, key: win.key, v, p: win.p };
    // two faces this figure shows as one
    if (q.id === 'face' && second) {
      const v2 = byId.get(idOf(second.key) ?? '');
      if (v2 && v2.kind === 'expression' && second.p >= PAIR_MIN && second.p >= PAIR_RATIO * win.p && Object.hasOwn(ctx.pairs ?? {}, pairKey(v.id, v2.id))) cand.pair = v2;
    }
    cands.push(cand);
    why[q.id] ??= `${win.key}(${win.p.toFixed(2)})`;
  }
  // most likely first: at most BUDGET parts besides the face, and none that clashes with one kept
  cands.sort((a, b) => b.p - a.p);
  const kept: Cand[] = [];
  let parts = 0;
  for (const c of cands) {
    const clash = kept.find((k) => clashes(k.v, c.v));
    if (clash) { why[c.q.id] = `${c.key} 和 ${clash.key} 不能同时做,没做`; continue; }
    if (c.q.id !== 'face' && parts >= BUDGET) { why[c.q.id] = `${c.key} 超出一次最多动 ${BUDGET} 个部位,没做`; continue; }
    if (c.q.id !== 'face') parts++;
    kept.push(c);
    chosen[c.q.id] = c.key;
  }
  const ids = kept.flatMap((c) => (c.pair ? [c.v.id, c.pair.id] : [c.v.id]));
  return { ids, why, chosen };
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

export class DeciderClient {
  private fails = 0;
  private openUntil = 0;
  private warned = false;
  private readonly controllers = new Set<AbortController>();
  /** The last call: when, how long, and how it ended; for the console's lamp. */
  last: { at: number; ms: number; ok: boolean; reason?: string } | null = null;
  calls = 0;
  cost = 0;

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
        return fail('http', this.scrub(`HTTP ${res.status}${msg ? ` ${msg.slice(0, 120)}` : ''}`, key));
      }
      let json: unknown;
      try { json = JSON.parse(text); } catch { return fail('bad'); }
      const answers = parseAnswers(json);
      if (!answers || !Object.keys(answers).length) return fail('bad');
      const usage = parseUsage(json);
      if (usage.cost !== null) this.cost += usage.cost;
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

/**
 * The decision models OpenRouter lists (待确认: path and shape); an empty list when the listing fails. Ids are read
 * from `data[].id` or `models[].id`, or a plain array of strings.
 */
export async function listDeciders(key: string, fetchImpl: typeof fetch = fetch, url = DECIDER_MODELS_URL, timeoutMs = 5000): Promise<string[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: ctrl.signal });
    if (!res.ok) return [];
    const j = await res.json() as unknown;
    const list = Array.isArray(j) ? j : ((j as { data?: unknown; models?: unknown }).data ?? (j as { models?: unknown }).models);
    if (!Array.isArray(list)) return [];
    return list.map((m) => (typeof m === 'string' ? m : typeof (m as { id?: unknown })?.id === 'string' ? (m as { id: string }).id : null))
      .filter((x): x is string => !!x).slice(0, 100);
  } catch {
    return [];
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
