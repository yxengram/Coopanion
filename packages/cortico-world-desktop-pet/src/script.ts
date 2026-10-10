/**
 * Speech scripts for the pet's bubble. Markers name expressions and motions:
 *
 * - `【a, b】` blocking: runs the words, then starts a new bubble with the text after it.
 * - `<a, b>` inline: runs the words when typing reaches that point, without a new bubble.
 * - `a+b` (or `a＋b`, spaces around the plus allowed) inside a marker, or as one of `pet_act`'s words: the words at
 *   once. Words that take the same part of her (CHANNELS) cannot: they are split into groups one after another,
 *   and a note says so.
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
  /** What was not done as written: words of one group that cannot go together, done one after another. */
  notes: string[];
}

export const INLINE_TAG_MAX = 32;

/** A part of her a word takes (web/kit/body.js), for groups of words done at once and the prompt's 部位 column. */
export type Channel = 'face' | 'head' | 'arm' | 'body' | 'stance';
const ALL: readonly Channel[] = ['face', 'head', 'arm', 'body', 'stance'];
/**
 * What part of her a kit word takes. It also encodes what the kit refuses or changes when words come together: a
 * song needs her standing or seated still; a curtsy stands her up; kneeling, lying and sleep leave no arm gesture to
 * see (and an arm gesture ends a kneel); dizzy and sleep show no face of their own choosing; stone goes with nothing.
 * (A figure that draws arms kneeling, `kneelArms` in the kit, would need a vocab flag to free `arm` from kneel here.)
 */
export const CHANNELS: Record<string, readonly Channel[]> = {
  nod: ['head'], shake: ['head'], sigh: ['head'],
  wave: ['arm'], shiver: ['arm'], heart: ['arm'], serve: ['arm'], salute: ['arm'], vsign: ['arm'], point: ['arm'],
  cover: ['arm'], cross: ['arm'], stretch: ['arm'], pray: ['arm'], scratch: ['arm'], idea: ['arm'], hug: ['arm'], hips: ['arm'],
  spout: ['arm'], sip: ['arm'], read: ['arm'],
  // gestures that need her still (standing or seated): they cannot go with a walk, a dance, a look, a jump
  song: ['arm', 'stance'], bow: ['arm', 'stance'], flinch: ['arm', 'stance'], peek: ['arm', 'stance'], away: ['arm', 'stance'],
  spin: ['arm', 'stance'], cheer: ['arm', 'stance'], turn: ['stance'],
  // she stands up for it
  curtsy: ['arm', 'stance', 'body'],
  sit: ['body'],
  // an arm gesture ends a kneel; lying, none shows
  kneel: ['body', 'arm'], lie: ['body', 'arm'],
  // asleep, nothing else shows; the dizzy face covers any other
  sleep: ['face', 'head', 'arm', 'body'],
  dizzy: ['body', 'stance', 'face'],
  stand: ['body', 'stance'], walk: ['body', 'stance'], run: ['body', 'stance'], look: ['body', 'stance'],
  dance: ['body', 'stance'], jump: ['body', 'stance'], hop: ['body', 'stance'],
  flap: ['body', 'stance', 'arm'], roll: ['body', 'stance', 'arm', 'head'],
  petrify: ALL,
};
/** The parts word `v` takes: a pack's own expression the face, a pack's own motion all but the face. */
export function channelsOf(v: VocabWord): readonly Channel[] {
  return CHANNELS[v.id] ?? (v.kind === 'expression' ? ['face'] : ['head', 'arm', 'body', 'stance']);
}
/** Where a word goes in a group: body and stance first, then arms, head, face. */
const rankOf = (cs: readonly Channel[]) => (cs.includes('body') || cs.includes('stance') ? 0 : cs.includes('arm') ? 1 : cs.includes('head') ? 2 : 3);

export const GROUP_SEP = /[+＋]/;
/** `a + b`, `a＋ b` → `a+b`: spaces around a plus belong to the group, not the list. */
const tightPlus = (s: string) => s.replace(/\s*[+＋]\s*/g, '+');

/**
 * The entries of one token (`a` or `a+b+…`): each run of members that can be done at once is one entry (ids joined by
 * '+', body first, face last); a member that takes a part of her the run already takes starts the next run, and is
 * noted. Unknown members go to `dropped`, repeats count once, empty ones (`开心+`) are ignored.
 */
function groupToken(tok: string, dropped: string[], notes: string[], vocab: readonly VocabWord[]): string[] {
  const whole = vocabId(tok, vocab);
  if (whole) return [whole];
  const byId = new Map(vocab.map((v) => [v.id, v]));
  const members: Array<{ name: string; v: VocabWord }> = [];
  for (const raw of tok.split(GROUP_SEP)) {
    const name = raw.trim();
    if (!name) continue;
    const id = vocabId(name, vocab);
    if (!id) { dropped.push(name); continue; }
    if (!members.some((m) => m.v.id === id)) members.push({ name, v: byId.get(id)! });
  }
  const runs: Array<typeof members> = [];
  let run: typeof members = [];
  for (const m of members) {
    const cs = channelsOf(m.v);
    const clash = run.find((r) => channelsOf(r.v).some((c) => cs.includes(c)));
    if (clash) {
      notes.push(`${clash.name} 和 ${m.name} 不能同时做,改成先后做。`);
      runs.push(run);
      run = [];
    }
    run.push(m);
  }
  if (run.length) runs.push(run);
  return runs.map((r) => r.map((m, i) => ({ id: m.v.id, rank: rankOf(channelsOf(m.v)), i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i).map((m) => m.id).join('+'));
}

function words(inner: string, dropped: string[], notes: string[], vocab: readonly VocabWord[]): string[] {
  return tightPlus(inner).split(/[,，、\s]+/).flatMap((t) => (t ? groupToken(t, dropped, notes, vocab) : []));
}

export function parseScript(script: string, vocab: readonly VocabWord[]): ParsedScript {
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
      const acts = words(script.slice(i + 1, end), dropped, notes, vocab);
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
      const acts = words(inner, dropped, notes, vocab);
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

/** Seconds a script stays on screen: typing at ~20 chars/s, plus reading time per bubble. */
export function estimateSeconds(beats: readonly Beat[]): number {
  let s = 0;
  for (const b of beats) {
    if (b.actions.length) s += .5;
    if (b.text) s += b.text.length / 20 + 1.6 + b.text.length * .07;
  }
  return Math.round(s * 10) / 10;
}

/** Validates an action list for `pet_act`: known words and groups (`a+b`) as entries, unknown words dropped, notes on groups split. */
export function parseActions(list: readonly unknown[], vocab: readonly VocabWord[]): { actions: string[]; dropped: string[]; notes: string[] } {
  const actions: string[] = [];
  const dropped: string[] = [];
  const notes: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string') { dropped.push(String(raw)); continue; }
    actions.push(...groupToken(tightPlus(raw.trim()), dropped, notes, vocab));
  }
  return { actions, dropped, notes };
}

/** The words of entries (a group's members one by one). */
export const membersOf = (entries: readonly string[]): string[] => entries.flatMap((a) => a.split('+'));

/**
 * How long a lasting word holds, as the prompt and `pet_act`'s receipt say it (web/kit/body.js `act`): sitting,
 * lying and sleeping stay through gestures and expressions and end on another posture or a move of the whole
 * body (walking, jumping, dancing...); kneeling stays through expressions and head gestures (nod, shake, sigh) and
 * ends on the next arm or whole-body motion, back to plain sitting.
 */
export function lastingNote(id: string): string {
  return id === 'kneel'
    ? '保持到下一个手或全身动作,然后变回普通坐着;换表情、点头、摇头、叹气不影响'
    : '一直保持:做手势、换表情不影响,换别的姿势或走、跑、跳这类全身动作才结束';
}

/** The 部位 column of the motions table: 头 the head alone, 手 the arms, 手(停下来做) arms with her standing or seated still, 身 the whole body. */
function partOf(v: VocabWord): string {
  const cs = channelsOf(v);
  if (cs.length === 1 && cs[0] === 'head') return '头';
  if (cs.includes('arm') && !cs.includes('body')) return cs.includes('stance') ? '手(停下来做)' : '手';
  return '身';
}

/**
 * The vocabulary as the bot's prompt shows it: expressions, then motions with the part of her each takes (for words
 * done at once), with names and looks in `language`.
 */
export function vocabTable(vocab: readonly VocabWord[], language = 'zh'): string {
  const pick = <T>(by: Record<string, T>): T | undefined => by[language] ?? by.zh ?? Object.values(by)[0];
  const about = (v: VocabWord) => `${pick(v.about) ?? ''}${v.lasting ? `,${lastingNote(v.id)}` : ''}${v.id === 'petrify' ? ',不和别的同时做' : ''}`;
  const names = (v: VocabWord) => (pick(v.names) ?? []).join(' / ');
  const faces = vocab.filter((v) => v.kind === 'expression').map((v) => `| ${v.id} | ${names(v)} | ${about(v)} |`).join('\n');
  const motions = vocab.filter((v) => v.kind === 'motion').map((v) => `| ${v.id} | ${names(v)} | ${partOf(v)} | ${about(v)} |`).join('\n');
  return `表情(持续几秒后回到平常的脸;做动作不会打断,石化除外):\n\n| 词 | 中文 | 样子 |\n|---|---|---|\n${faces}\n\n`
    + `动作:\n\n| 词 | 中文 | 部位 | 样子 |\n|---|---|---|---|\n${motions}`;
}
