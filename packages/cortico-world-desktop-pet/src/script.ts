/**
 * Speech scripts for the pet's bubble. Markers name expressions and motions:
 *
 * - `【a, b】` blocking: runs the words, then starts a new bubble with the text after it.
 * - `<a, b>` inline: runs the words when typing reaches that point, without a new bubble.
 * - `a+b` (or `a＋b`, spaces around the plus allowed) inside a marker, or as one of `pet_act`'s words: the words at
 *   once. Words that take the same part of her (CHANNELS) cannot: they are split into groups one after another,
 *   and a note says so. Two expressions the figure shows as one face (its pack's `pairs`, `PairFace`) are the
 *   exception: they stay in one group, eyes first, then mouth (or become the one word they are shown as), and a note
 *   says what was shown.
 *
 * The words are the vocabulary of the body on screen (its pack's `vocab`, src/packs.ts), by id or
 * by any of their names; unknown words are dropped and reported back. An inline marker longer than
 * `INLINE_TAG_MAX` or spanning a line is text. Inline markers in a bubble with no text (`【开心】<眨眼>`,
 * or a script of `<眨眼>` alone) have nothing to wait for: they join the bubble's blocking words, in order.
 *
 * What goes to the page is a list of entries: a word's id, or a group's ids joined by '+' (ids are [a-z0-9-]), body
 * and stance first, then arms, head, face (`sit+wave+happy`). A name with a plus in it is looked up whole first, so
 * it works alone, but it cannot be one member of a larger group.
 */

/** One word of a body's vocabulary. */
export interface VocabWord {
  id: string;
  kind: 'expression' | 'motion';
  /** Names the bot may write it by, by language; the id always works. */
  names: Record<string, string[]>;
  /** What it looks like on this body, by language. */
  about: Record<string, string>;
  /** Seconds the page waits after it before the next word in a row. */
  seconds: number;
  /** A posture she stays in (sitting, lying, sleeping, kneeling); see `vocabTable` for what ends it. */
  lasting?: boolean;
  /**
   * (kneel) The figure draws arm gestures while kneeling (the kit's `figure.kneelArms`), so an arm gesture neither ends
   * it nor splits from it in a group (`channelsOf`); only read with `lasting`.
   */
  keepsArms?: boolean;
  /**
   * (kneel) The figure leans in, leans back and sways kneeling (the kit's `figure.kneelLeans`, KNEEL_LEANS), so those
   * neither end it nor split from it in a group (`clashes`); only read with `lasting`.
   */
  keepsLeans?: boolean;
}

const lookups = new WeakMap<readonly VocabWord[], Map<string, VocabWord>>();
function lookup(vocab: readonly VocabWord[]): Map<string, VocabWord> {
  let m = lookups.get(vocab);
  if (!m) {
    m = new Map();
    for (const v of vocab) {
      m.set(v.id, v);
      for (const n of Object.values(v.names).flat()) m.set(n, v);
    }
    lookups.set(vocab, m);
  }
  return m;
}

/** The id of a word of `vocab` (its id or one of its names), or null. */
export function vocabId(word: string, vocab: readonly VocabWord[]): string | null {
  const m = lookup(vocab);
  return m.get(word.trim().toLowerCase())?.id ?? m.get(word.trim())?.id ?? null;
}

export interface Anchor {
  /** Character offset in the beat's text. */
  at: number;
  actions: string[];
}

export interface Beat {
  actions: string[];
  text: string;
  anchors: Anchor[];
}

export interface ParsedScript {
  beats: Beat[];
  dropped: string[];
  /**
   * How the groups were done, for the bot: members done one after another because they cannot go together, and two
   * expressions shown as one face.
   */
  notes: string[];
}

export const INLINE_TAG_MAX = 32;

/**
 * A part of her a word takes (web/kit/body.js), for groups of words done at once and the prompt's 部位 column. A tail,
 * ears and wings are parts of their own (the kit's APPENDAGE_MOVES, a slot each): only a figure that has one has its words.
 */
export type Channel = 'face' | 'head' | 'arm' | 'body' | 'stance' | 'tail' | 'ears' | 'wings';
/** The parts of her a figure may have beyond the kit's body. */
export const APPENDAGES: readonly Channel[] = ['tail', 'ears', 'wings'];
/** Their names in the prompt. */
export const APPENDAGE_NAMES: Partial<Record<Channel, string>> = { tail: '尾巴', ears: '耳朵', wings: '翅膀' };
const ALL: readonly Channel[] = ['face', 'head', 'arm', 'body', 'stance', ...APPENDAGES];
/**
 * What part of her a kit word takes. It also encodes what the kit refuses or changes when words come together: a
 * song needs her standing or seated still; a curtsy and a stamp stand her up; kneeling, lying and sleep leave no arm
 * gesture to see (and an arm gesture ends a kneel); dizzy and sleep show no face of their own choosing; stone goes with nothing.
 * (A figure that draws arm gestures kneeling, `kneelArms` in the kit, says so with `keepsArms` on its `kneel` word:
 * then kneeling frees the arm, see `channelsOf`.)
 */
export const CHANNELS: Record<string, readonly Channel[]> = {
  nod: ['head'], shake: ['head'], sigh: ['head'], tilt: ['head'], droop: ['head'], blink: ['head'],
  // a tail, ears, wings: each its own part, beside everything else
  wag: ['tail'], earflick: ['ears'], earsup: ['ears'], earsdown: ['ears'], wingbeat: ['wings'],
  wave: ['arm'], shiver: ['arm'], heart: ['arm'], serve: ['arm'], salute: ['arm'], vsign: ['arm'], point: ['arm'],
  cover: ['arm'], cross: ['arm'], stretch: ['arm'], pray: ['arm'], scratch: ['arm'], idea: ['arm'], hug: ['arm'], hips: ['arm'],
  spout: ['arm'], sip: ['arm'], read: ['arm'], muse: ['arm'], fist: ['arm'], jot: ['arm'], twiddle: ['arm'],
  clap: ['arm'], shrug: ['arm'], headhold: ['arm'], raise: ['arm'], thumbs: ['arm'], shush: ['arm'], wipe: ['arm'],
  // gestures that need her still (standing or seated): they cannot go with a walk, a dance, a look, a jump
  song: ['arm', 'stance'], bow: ['arm', 'stance'], flinch: ['arm', 'stance'], peek: ['arm', 'stance'], away: ['arm', 'stance'],
  spin: ['arm', 'stance'], cheer: ['arm', 'stance'], turn: ['stance'],
  closer: ['arm', 'stance'], leanback: ['arm', 'stance'], sway: ['arm', 'stance'],
  // she stands up for it
  curtsy: ['arm', 'stance', 'body'], stamp: ['arm', 'stance', 'body'],
  sit: ['body'],
  // an arm gesture ends a kneel (unless the figure draws them kneeling: KNEEL_WITH_ARMS); lying, none shows
  kneel: ['body', 'arm'], lie: ['body', 'arm'],
  // asleep, nothing else shows; the dizzy face covers any other
  sleep: ['face', 'head', 'arm', 'body', ...APPENDAGES],
  dizzy: ['body', 'stance', 'face'],
  stand: ['body', 'stance'], walk: ['body', 'stance'], run: ['body', 'stance'], look: ['body', 'stance'],
  dance: ['body', 'stance'], jump: ['body', 'stance'], hop: ['body', 'stance'],
  flap: ['body', 'stance', 'arm'], roll: ['body', 'stance', 'arm', 'head'],
  petrify: ALL,
};
/**
 * Kneeling for a figure that draws arm gestures kneeling (`keepsArms`): the arm is free; gestures that need her standing
 * or seated still (cheer, bow, flinch, peek, away, spin, curtsy, turn, closer, leanback, sway, stamp) still end it, so
 * they still split. A song is the exception (KNEEL_SINGS).
 */
const KNEEL_WITH_ARMS: readonly Channel[] = ['body', 'stance'];
/**
 * (keepsArms) The gestures needing her still that the kit keeps a kneel through all the same (its ARM_GESTURES,
 * web/kit/body.js): kneeling is sitting still, so she sings kneeling, and the two go as one group.
 */
const KNEEL_SINGS: ReadonlySet<string> = new Set(['song']);
/** (keepsLeans) The leans of the body seated still that the kit keeps a kneel through (its KNEEL_LEANS, web/kit/body.js). */
export const KNEEL_LEANS: ReadonlySet<string> = new Set(['closer', 'leanback', 'sway']);
/**
 * (decider prompt, `{{pet.parts}}`) What a figure moves besides face, arms and posture: the zh names of its tail's,
 * ears' and wings' words (the motions that take one of APPENDAGES alone), and the tail or wings it has none of, so the
 * bot neither says it cannot beat its wings nor writes 「尾巴(如果有的话)」 (ears are not named as missing: every
 * figure has some, only a cat's move). Gemini-chan: `,还会摇尾巴、抖耳朵、竖耳朵、耳朵耷拉(没有翅膀)`; Claude-chan:
 * `(没有尾巴、翅膀)`. `known`: the figure's looks are known to match its words (the built-in packs); a third-party
 * pack may draw a tail it has no word for, so it is told only what it moves.
 */
export function partsNote(vocab: readonly VocabWord[], known = true): string {
  const moves = vocab.filter((w) => w.kind === 'motion' && channelsOf(w).length === 1 && APPENDAGES.includes(channelsOf(w)[0]!));
  const has = new Set(moves.map((w) => channelsOf(w)[0]!));
  const none = known ? (['tail', 'wings'] as const).filter((c) => !has.has(c)).map((c) => APPENDAGE_NAMES[c]) : [];
  const names = moves.map((w) => firstName(w, 'zh'));
  const lacks = none.length ? `(没有${none.join('、')})` : '';
  return names.length ? `,还会${names.join('、')}${lacks}` : lacks;
}
/** The parts word `v` takes: a pack's own expression the face, a pack's own motion all but the face. */
export function channelsOf(v: VocabWord): readonly Channel[] {
  if (v.id === 'kneel' && v.keepsArms) return KNEEL_WITH_ARMS;
  return CHANNELS[v.id] ?? (v.kind === 'expression' ? ['face'] : ['head', 'arm', 'body', 'stance']);
}
/**
 * Whether words `a` and `b` take a part of her in common, so they cannot go at once (a kneel with keepsArms and a song
 * can, and a kneel with keepsLeans and a lean).
 */
export function clashes(a: VocabWord, b: VocabWord): boolean {
  const sings = (k: VocabWord, w: VocabWord) => k.id === 'kneel' && !!k.keepsArms && KNEEL_SINGS.has(w.id);
  const leans = (k: VocabWord, w: VocabWord) => k.id === 'kneel' && !!k.keepsLeans && KNEEL_LEANS.has(w.id);
  if (sings(a, b) || sings(b, a) || leans(a, b) || leans(b, a)) return false;
  const cs = channelsOf(b);
  return channelsOf(a).some((c) => cs.includes(c));
}
/**
 * Two expressions of one group shown as one face (a pack's `pairs`, src/packs.ts), by `pairKey`: a word of the
 * vocabulary made of the two (`as`, e.g. smirk for smug+happy), or a face the body composes, `eyes` and `mouth` naming
 * which of the two gives each. The manifest decides: the group goes to the page with the eyes' face first and the
 * mouth's second, and a plus body (web/kit/body.js doGroup) composes two faces of a group in the order it gets them.
 */
export type PairFace = { as: string } | { eyes: string; mouth: string };
export type Pairs = Readonly<Record<string, PairFace>>;
/** The key of the pair of `a` and `b`, whichever is written first. */
export const pairKey = (a: string, b: string): string => (a < b ? `${a}~${b}` : `${b}~${a}`);

/** Where a word goes in a group: body and stance first, then arms, head (and a tail, ears, wings), face. */
const rankOf = (cs: readonly Channel[]) => (cs.includes('body') || cs.includes('stance') ? 0 : cs.includes('arm') ? 1
  : cs.includes('head') || cs.some((c) => APPENDAGES.includes(c)) ? 2 : 3);

export const GROUP_SEP = /[+＋]/;
/** `a + b`, `a＋ b` → `a+b`: spaces around a plus belong to the group, not the list. */
const tightPlus = (s: string) => s.replace(/\s*[+＋]\s*/g, '+');

/**
 * A member of a group as written: its name, its word, and (two expressions shown as one face) its partner and the ids
 * that go for both (the word they are shown as, or the eyes' face and then the mouth's).
 */
interface Member { name: string; v: VocabWord; with?: Member; ids?: string[] }
/** Whether `v` takes the face alone (a plain expression; not stone, not sleep or dizzy). */
const faceOnly = (v: VocabWord) => { const cs = channelsOf(v); return cs.length === 1 && cs[0] === 'face'; };
/** A word's first name in `language` (else Chinese, else its id). */
export const firstName = (v: VocabWord, language = 'zh') => (v.names[language] ?? v.names.zh ?? [])[0] ?? v.id;

/**
 * The entries of one token (`a` or `a+b+…`): each run of members that can be done at once is one entry (ids joined by
 * '+', body first, face last); a member that takes a part of her the run already takes starts the next run, and is
 * noted. Two expressions the figure shows as one face (`pairs`) are the exception: the second joins the run's lone
 * expression (once per run), as its partner (both ids go, the eyes' face first, and the body composes them) or as the
 * word both are shown as; that is noted too. Unknown members go to `dropped`, repeats count once, empty ones (`开心+`) are ignored.
 */
function groupToken(tok: string, dropped: string[], notes: string[], vocab: readonly VocabWord[], pairs: Pairs): string[] {
  const whole = vocabId(tok, vocab);
  if (whole) return [whole];
  const byId = new Map(vocab.map((v) => [v.id, v]));
  const members: Member[] = [];
  for (const raw of tok.split(GROUP_SEP)) {
    const name = raw.trim();
    if (!name) continue;
    const id = vocabId(name, vocab);
    if (!id) { dropped.push(name); continue; }
    if (!members.some((m) => m.v.id === id)) members.push({ name, v: byId.get(id)! });
  }
  const pairOf = (a: VocabWord, b: VocabWord): PairFace | null => {
    const k = pairKey(a.id, b.id);
    return Object.hasOwn(pairs, k) ? pairs[k] : null;
  };
  /** How a member is named in a note: as written, or what a pair of them is written as. */
  const label = (r: Member) => (r.with ? `${r.name}+${r.with.name}` : r.name);
  /** The name of one of a pair's faces in a note: the member's, as written. */
  const nameIn = (a: Member, b: Member, id: string) => (a.v.id === id ? a.name : b.v.id === id ? b.name : id);
  const runs: Member[][] = [];
  let run: Member[] = [];
  for (const m of members) {
    const clash = run.find((r) => clashes(r.v, m.v));
    // two plain expressions this figure shows as one face (its `pairs`): the second joins the run's lone one, once
    const p = clash && !clash.with && faceOnly(clash.v) && faceOnly(m.v) ? pairOf(clash.v, m.v) : null;
    const as = p && 'as' in p ? byId.get(p.as) : undefined;
    if (clash && p && (!('as' in p) || as)) {
      clash.with = m;
      clash.ids = 'as' in p ? [as!.id] : [p.eyes, p.mouth];
      notes.push('as' in p
        ? `${clash.name} 和 ${m.name} 合成了一张脸:${firstName(as!)}。`
        : `${clash.name} 和 ${m.name} 合成了一张脸:${nameIn(clash, m, p.eyes)}的眼睛,${nameIn(clash, m, p.mouth)}的嘴。`);
      continue;
    }
    if (clash) {
      notes.push(`${label(clash)} 和 ${m.name} 不能同时做,改成先后做。`);
      runs.push(run);
      run = [];
    }
    run.push(m);
  }
  if (run.length) runs.push(run);
  // a member with a partner goes as the word both are shown as, or with it (eyes first), both where faces go
  return runs.map((r) => r.map((m, i) => ({ ids: m.ids ?? [m.v.id], rank: rankOf(channelsOf(m.v)), i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i).flatMap((m) => m.ids).join('+'));
}

function words(inner: string, dropped: string[], notes: string[], vocab: readonly VocabWord[], pairs: Pairs): string[] {
  return tightPlus(inner).split(/[,，、\s]+/).flatMap((t) => (t ? groupToken(t, dropped, notes, vocab, pairs) : []));
}

/**
 * The beats of a speech script for the body whose vocabulary is `vocab`; `pairs` are the expressions its figure shows
 * as one face when they are in one group (none by default).
 */
export function parseScript(script: string, vocab: readonly VocabWord[], pairs: Pairs = {}): ParsedScript {
  const dropped: string[] = [];
  const notes: string[] = [];
  const beats: Beat[] = [];
  let cur: Beat = { actions: [], text: '', anchors: [] };
  let i = 0;
  while (i < script.length) {
    const ch = script[i];
    if (ch === '【') {
      const end = script.indexOf('】', i + 1);
      if (end < 0) { cur.text += script.slice(i); break; }
      const acts = words(script.slice(i + 1, end), dropped, notes, vocab, pairs);
      if (cur.text.trim() || cur.actions.length || cur.anchors.length) beats.push(cur);
      cur = { actions: acts, text: '', anchors: [] };
      i = end + 1;
      continue;
    }
    if (ch === '<' || ch === '＜') {
      const close = ch === '<' ? '>' : '＞';
      const end = script.indexOf(close, i + 1);
      const inner = end < 0 ? '' : script.slice(i + 1, end);
      if (end < 0 || inner.length > INLINE_TAG_MAX || /\n/.test(inner)) { cur.text += ch; i++; continue; }
      const acts = words(inner, dropped, notes, vocab, pairs);
      if (acts.length) cur.anchors.push({ at: cur.text.length, actions: acts });
      i = end + 1;
      continue;
    }
    cur.text += ch;
    i++;
  }
  if (cur.text.trim() || cur.actions.length || cur.anchors.length) beats.push(cur);
  for (const b of beats) {
    const lead = b.text.length - b.text.trimStart().length;
    b.text = b.text.trim();
    for (const a of b.anchors) a.at = Math.max(0, Math.min(b.text.length, a.at - lead));
    // no typing to reach them: they start with the bubble, after its blocking words
    if (!b.text && b.anchors.length) {
      for (const a of b.anchors) b.actions.push(...a.actions);
      b.anchors = [];
    }
  }
  return { beats, dropped, notes };
}

/**
 * Seconds a script stays on screen: typing at ~20 × `speed` chars/s, plus reading time per bubble divided by `speed`
 * (`window.bubbleSpeed`, as web/pet-app.js types and holds); the lead before the words stays as it is.
 */
export function estimateSeconds(beats: readonly Beat[], speed = 1): number {
  let s = 0;
  for (const b of beats) {
    if (b.actions.length) s += .5;
    if (b.text) s += (b.text.length / 20 + 1.6 + b.text.length * .07) / speed;
  }
  return Math.round(s * 10) / 10;
}

/**
 * Validates an action list for `pet_act`: known words and groups (`a+b`) as entries, unknown words dropped, notes on
 * groups split or two expressions shown as one face (`pairs`, as in `parseScript`).
 */
export function parseActions(list: readonly unknown[], vocab: readonly VocabWord[], pairs: Pairs = {}): { actions: string[]; dropped: string[]; notes: string[] } {
  const actions: string[] = [];
  const dropped: string[] = [];
  const notes: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string') { dropped.push(String(raw)); continue; }
    actions.push(...groupToken(tightPlus(raw.trim()), dropped, notes, vocab, pairs));
  }
  return { actions, dropped, notes };
}

/** The words of entries (a group's members one by one). */
export const membersOf = (entries: readonly string[]): string[] => entries.flatMap((a) => a.split('+'));

/** The head gestures a kneel lasts through (the kit's HEAD_GESTURES), as its note names them. */
const KNEEL_KEEPS: ReadonlyArray<readonly [string, string]> = [
  ['nod', '点头'], ['shake', '摇头'], ['sigh', '叹气'], ['tilt', '歪头'], ['droop', '低头'], ['blink', '眨眨眼'],
];

/**
 * How long a lasting word holds, as the prompt and `pet_act`'s receipt say it (web/kit/body.js `act`): sitting,
 * lying and sleeping stay through gestures and expressions and end on another posture or a move of the whole
 * body (walking, jumping, dancing...); kneeling stays through expressions and head gestures (nod, shake, sigh, tilt, droop,
 * blink) and ends on the next arm or whole-body motion, back to plain sitting; for a figure that draws arm gestures kneeling
 * (`keepsArms`), the arm gestures that take only the arm keep it too, and so does a song (KNEEL_SINGS), and for one that
 * leans kneeling (`keepsLeans`) so do 凑近, 后仰 and 晃来晃去 (KNEEL_LEANS); the moves of a
 * tail, ears or wings keep it as well. Given the figure's `vocab`, the kneel's note names only the head gestures and the
 * parts it has (a pack without 歪头 is not told it keeps one).
 */
export function lastingNote(v: VocabWord, vocab?: readonly VocabWord[]): string {
  if (v.id !== 'kneel') return '一直保持:做手势、换表情不影响,换别的姿势或走、跑、跳这类全身动作才结束';
  // (and the moves of a tail, ears or wings, the kit's APPENDAGE_MOVES: of the parts the figure has words for)
  const parts = APPENDAGES.filter((c) => !vocab || vocab.some((w) => w.kind === 'motion' && channelsOf(w).length === 1 && channelsOf(w)[0] === c));
  const keeps = ['换表情', ...KNEEL_KEEPS.filter(([id]) => !vocab || vocab.some((w) => w.id === id)).map(([, n]) => n),
    ...(parts.length ? [`${parts.map((c) => APPENDAGE_NAMES[c]).join('、')}的动作`] : [])].join('、');
  if (v.keepsArms && v.keepsLeans) {
    return `保持到下一个全身动作,然后变回普通坐着;${keeps}、只占「手」的手势、唱歌和凑近、后仰、晃来晃去都不影响(她跪着做);「手,要站着或坐着不动」那组别的动作会让她变回普通坐着`;
  }
  return v.keepsArms
    ? `保持到下一个全身动作,然后变回普通坐着;${keeps}、只占「手」的手势和唱歌都不影响(她跪着做);「手,要站着或坐着不动」那组别的动作会让她变回普通坐着`
    : `保持到下一个手或全身动作,然后变回普通坐着;${keeps}不影响`;
}

/**
 * Moods the prompt groups the expressions by (kit ids), each base face before the composites near it, so the bot finds
 * the specific face next to the plain one; a label says when its faces fit, so the bot looks for the mood first. An
 * expression not listed (a pack's own) goes to the last, 其他.
 */
const MOODS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['开心(好消息)', ['happy', 'giggle', 'lol', 'laughcry', 'blissful', 'celebrate', 'excited', 'wow', 'dreamy', 'crave', 'drool']],
  ['调皮、得意(逗人、显摆)', ['wink', 'smug', 'smirk', 'tongue', 'sly', 'coax', 'innocent']],
  ['喜欢、害羞(表白、礼物)', ['love', 'flutter', 'smitten', 'shy', 'bashful', 'moved', 'gentle']],
  ['难过(坏消息、陪对方难过、安慰对方)', ['sad', 'comfort', 'sulk', 'cry', 'whimper', 'heartbroken', 'gloomy', 'brave', 'pained']],
  ['生气、嫌弃(被惹、被吐槽)', ['angry', 'fuming', 'huff', 'frantic', 'ragecry', 'pout', 'disgusted', 'eyeroll', 'meh', 'deadpan', 'speechless']],
  ['惊讶、紧张(意外、替对方担心)', ['surprised', 'shocked', 'blank', 'starry', 'scared', 'worried', 'nervous', 'flustered', 'awkward', 'petrify']],
  ['其他', ['neutral', 'thinking', 'confused', 'doubt', 'determined', 'eager', 'sleepy']],
];
/** The mood group (`MOODS`) an expression is listed under, its label without the parenthesised hint; a pack's own expression is 其他. */
export function moodLabel(id: string): string {
  const m = MOODS.find(([, ids]) => ids.includes(id)) ?? MOODS[MOODS.length - 1];
  return m[0].replace(/\(.*\)$/, '');
}

/**
 * The motions' parts as the prompt groups them (for words done at once): 头 the head alone, the figure's tail, ears or
 * wings (APPENDAGE_NAMES: the ones it has words for, each a part of its own, so an ear word and a tail word go together),
 * 手 the arms, 手 with her standing or seated still, 身 the whole body (a pack's own motion too). A whole-body word that
 * also takes the arms, the head or the face says so after its names, so the groups show every clash `channelsOf` makes.
 */
const PARTS = ['头', '', '手', '手,要站着或坐着不动(不和走、跑、跳这类移动同组,坐下可以)', '身'] as const;
/** The label of the group of a tail's, ears' or wings' words, naming the parts `words` take. */
function appendageLabel(words: readonly VocabWord[]): string {
  const names = APPENDAGES.filter((c) => words.some((v) => channelsOf(v)[0] === c)).map((c) => APPENDAGE_NAMES[c]);
  return names.length > 1 ? `${names.join('、')}(各算一个部位)` : `${names[0]}(单独算一个部位)`;
}
export function partOf(v: VocabWord, has: readonly Channel[] = []): { part: number; also: string } {
  const cs = channelsOf(v);
  if (cs.length === 1 && cs[0] === 'head') return { part: 0, also: '' };
  if (cs.length === 1 && APPENDAGES.includes(cs[0])) return { part: 1, also: '' };
  if (cs.includes('arm') && !cs.includes('body')) return { part: cs.includes('stance') ? 3 : 2, also: '' };
  // (a tail, ears or wings only when the figure has words for them, `has`)
  const also = (['arm', 'head', 'face', ...has] as const).filter((c) => cs.includes(c)).map((c) => ({ arm: '手', head: '头', face: '表情', ...APPENDAGE_NAMES })[c]);
  return { part: 4, also: also.length ? `(也占${also.join('、')})` : '' };
}

/**
 * The worked example the prompt opens the vocabulary with: the first whose words are all in the figure's vocabulary
 * (a composite face, head words and a gesture for the built-ins; plain words an upstream pack has for others).
 */
const EXAMPLES = [
  '【瘪嘴+摇头】又没抢到票……<叹气>【跃跃欲试+点头】下次我帮你盯着!<比耶>',
  '【开心+招手】今天也辛苦啦!<眨眼>要不要歇一会儿?',
];

/** The composed pair the prompt's example names, the first the figure has (else its first listed). */
const PAIR_EXAMPLES = ['happy~surprised', 'happy~pout'];

/** Up to this many composed pairs are listed in one line in `vocabTable`; more go one line per face. */
const PAIRS_FLAT = 12;

/**
 * The vocabulary as the bot's prompt shows it, one line per word with its names and looks in `language`: expressions
 * grouped by mood (`MOODS`), then motions grouped by the part of her they take (`PARTS`). When the figure shows pairs
 * of expressions as one face (`pairs`), a pair shown as a word of the vocabulary is written after that word (`=甲+乙`),
 * and the composed pairs follow the expressions with an example (none: no pair text at all); many are listed one line
 * per expression, its partners after it.
 */
export function vocabTable(vocab: readonly VocabWord[], language = 'zh', pairs: Pairs = {}): string {
  const t = tableOf(vocab, language, pairs);
  const groups = (gs: readonly TableGroup[]) => gs.map((g) => `${g.label}:\n${g.rows.map((r) => r.line).join('\n')}`).join('\n');
  return `${t.example ? `例:\`${t.example}\`\n\n` : ''}${t.faceHead}\n\n${groups(t.faces)}\n\n${t.pairText}动作,按部位分组:\n\n${groups(t.motions)}`;
}

/** One group of the bot's table (a mood, or a part of her) and its words' lines. */
interface TableGroup { label: string; rows: Array<{ v: VocabWord; line: string }> }

/** The pieces `vocabTable` joins: the example, the expressions' groups, the composed pairs' paragraph ('' for none), the motions' groups. */
function tableOf(vocab: readonly VocabWord[], language: string, pairs: Pairs): { example: string; faceHead: string; faces: TableGroup[]; pairText: string; motions: TableGroup[] } {
  const pick = <T>(by: Record<string, T>): T | undefined => by[language] ?? by.zh ?? Object.values(by)[0];
  const about = (v: VocabWord) => `${pick(v.about) ?? ''}${v.lasting ? `,${lastingNote(v, vocab)}` : ''}${v.id === 'petrify' ? ',不和别的同时做' : ''}`;
  const names = (v: VocabWord) => (pick(v.names) ?? []).join('/');
  const byId = new Map(vocab.map((v) => [v.id, v]));
  const nameOf = (id: string) => { const v = byId.get(id); return v ? firstName(v, language) : id; };
  const entries = Object.entries(pairs);
  const line = (v: VocabWord, extra = '') => `- ${v.id} ${names(v)}${extra}:${about(v)}`;
  const faces = vocab.filter((v) => v.kind === 'expression');
  const mood = (v: VocabWord) => { const i = MOODS.findIndex(([, ids]) => ids.includes(v.id)); return i < 0 ? MOODS.length - 1 : i; };
  const rank = (v: VocabWord) => { const ids = MOODS[mood(v)][1]; const i = ids.indexOf(v.id); return i < 0 ? ids.length : i; };
  const ordered = faces.map((v, i) => ({ v, m: mood(v), r: rank(v), i })).sort((a, b) => a.m - b.m || a.r - b.r || a.i - b.i).map((x) => x.v);
  /** A pair's two ids in the order the expressions are listed. */
  const at = (id: string) => { const i = ordered.findIndex((v) => v.id === id); return i < 0 ? ordered.length : i; };
  const inOrder = (k: string) => k.split('~').sort((x, y) => at(x) - at(y) || (x < y ? -1 : 1)) as [string, string];
  // the pairs shown as a word: written after that word
  const recipes = new Map<string, string[]>();
  for (const [k, p] of entries) {
    if (!('as' in p) || !byId.has(p.as)) continue;
    if (!recipes.has(p.as)) recipes.set(p.as, []);
    recipes.get(p.as)!.push(inOrder(k).map(nameOf).join('+'));
  }
  const faceGroups = MOODS.map(([label], m): TableGroup => ({
    label,
    rows: ordered.filter((v) => mood(v) === m).map((v) => ({ v, line: line(v, recipes.has(v.id) ? `(=${recipes.get(v.id)!.join('、')})` : '') })),
  })).filter((g) => g.rows.length);
  const own = APPENDAGES.filter((c) => vocab.some((v) => v.kind === 'motion' && channelsOf(v).length === 1 && channelsOf(v)[0] === c));
  const motions = vocab.filter((v) => v.kind === 'motion').map((v) => ({ v, ...partOf(v, own) }));
  const motionGroups = PARTS.map((label, i): TableGroup | null => {
    const vs = motions.filter((m) => m.part === i);
    return vs.length ? { label: label || appendageLabel(vs.map((m) => m.v)), rows: vs.map((m) => ({ v: m.v, line: line(m.v, m.also) })) } : null;
  }).filter((g): g is TableGroup => !!g);
  // composed pairs: under whichever of the two comes first above, the eyes' face named in the example
  const composed = entries.filter((e): e is [string, { eyes: string; mouth: string }] => !('as' in e[1]));
  let pairText = '';
  if (composed.length) {
    const lines = new Map<string, string[]>();
    for (const [k] of composed) {
      const [a, b] = inOrder(k);
      if (!lines.has(a)) lines.set(a, []);
      lines.get(a)!.push(b);
    }
    const sorted = [...lines].sort(([a], [b]) => at(a) - at(b)).map(([a, bs]) => [a, bs.sort((x, y) => at(x) - at(y))] as const);
    const k0 = PAIR_EXAMPLES.find((k) => composed.some(([c]) => c === k)) ?? pairKey(sorted[0][0], sorted[0][1][0]!);
    const [a0, b0] = inOrder(k0);
    const p0 = pairs[k0] as { eyes: string; mouth: string };
    const list = composed.length > PAIRS_FLAT
      ? `\n${sorted.map(([a, bs]) => `- ${nameOf(a)}+${bs.map(nameOf).join('/')}`).join('\n')}`
      : sorted.flatMap(([a, bs]) => bs.map((b) => `${nameOf(a)}+${nameOf(b)}`)).join('、');
    pairText = `表情对(写在同一组里会合成一张脸,先写哪个都行;如【${nameOf(a0)}+${nameOf(b0)}】是${nameOf(p0.eyes)}的眼睛配${nameOf(p0.mouth)}的嘴):${list}\n别的两个表情同组仍先后做。\n\n`;
  }
  const faceHead = recipes.size ? '表情,按心情分组(「=甲+乙」:同一组写甲+乙也是这张脸):' : '表情,按心情分组:';
  const example = EXAMPLES.find((e) => { const p = parseScript(e, vocab); return !p.dropped.length && !p.notes.length; }) ?? '';
  return { example, faceHead, faces: faceGroups, pairText, motions: motionGroups };
}

/** A vocabulary and the pairs of expressions its figure shows as one face, as the bot was told them or has them now. */
export interface Told { vocab: readonly VocabWord[]; pairs?: Pairs }

/**
 * How the bot's table goes from `before` to `after`, for the bot when the figure changes under it: the words gone,
 * then the lines of the words new or told differently (their look, names, or group), under their groups as the table
 * has them, and the composed pairs' paragraph when it changed. Empty when the bot would see the same words. When
 * that says about as much as the whole new table (a figure with few words in common), the whole table instead.
 */
export function vocabChange(before: Told, after: Told, language = 'zh'): string {
  const diff = vocabDiff(before, after, language);
  if (!diff) return '';
  const whole = `词表整个换了,以这张为准,之前的词都不算数了:\n\n${vocabTable(after.vocab, language, after.pairs ?? {})}`;
  return diff.length < whole.length * WHOLE_TABLE_AT ? diff : whole;
}

/** A change told word by word only while it is shorter than this share of the whole new table. */
const WHOLE_TABLE_AT = .8;

function vocabDiff(before: Told, after: Told, language: string): string {
  const was = tableOf(before.vocab, language, before.pairs ?? {}), now = tableOf(after.vocab, language, after.pairs ?? {});
  const told = new Map<string, string>();
  for (const [kind, gs] of [['expression', was.faces], ['motion', was.motions]] as const) for (const g of gs) for (const r of g.rows) told.set(r.v.id, `${kind}\n${g.label}\n${r.line}`);
  const gone = before.vocab.filter((v) => !after.vocab.some((w) => w.id === v.id));
  const fresh = (kind: VocabWord['kind'], gs: readonly TableGroup[]) => gs
    .map((g) => ({ label: g.label, rows: g.rows.filter((r) => told.get(r.v.id) !== `${kind}\n${g.label}\n${r.line}`) }))
    .filter((g) => g.rows.length);
  const faces = fresh('expression', now.faces), motions = fresh('motion', now.motions);
  const pairsChanged = was.pairText !== now.pairText;
  if (!gone.length && !faces.length && !motions.length && !pairsChanged) return '';
  const pickIn = (by: Record<string, string[]>) => by[language] ?? by.zh ?? Object.values(by)[0];
  let head = '词表变了,以这里为准。';
  if (gone.length) head += `这些词用不了了:${gone.map((v) => `${v.id}(${pickIn(v.names)?.[0] ?? v.id})`).join('、')}。`;
  if (faces.length || motions.length) head += '新增或样子变了的:';
  const parts = [head];
  const groups = (title: string, gs: readonly TableGroup[]) => { if (gs.length) parts.push(`${title}\n\n${gs.map((g) => `${g.label}:\n${g.rows.map((r) => r.line).join('\n')}`).join('\n')}`); };
  groups('表情:', faces);
  groups('动作:', motions);
  if (pairsChanged) parts.push(now.pairText ? now.pairText.trimEnd() : '表情对没有了:同一组里的两个表情先后做。');
  return parts.join('\n\n');
}
