import { describe, expect, it } from 'vitest';
import { figurePacks } from '../src/packs.ts';
import { parseActions, vocabId, type VocabWord } from '../src/script.ts';
import {
  buildQuestions, buildRequest, buildState, parseAnswers, parseUsage, pickGroup, questionOf, QUESTION_IDS, stripMarkers,
  type Answer, type Question, type QuestionId,
} from '../src/decider.ts';

const packs = figurePacks([]).packs;
const packOf = (id: string) => packs.find((p) => p.id === id)!;
const FIGURES = ['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan'];

/** Answers that give `key` probability `p` in question `q` (rest spread on the keep option). */
function ans(entries: Array<[QuestionId, string, number, ([string, number])?]>): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const [q, key, p, second] of entries) {
    out[q] = { choice: key, probabilities: { [key]: p, ...(second ? { [second[0]]: second[1] } : {}) }, confidence: null };
  }
  return out;
}
const keyOf = (qs: Question[], q: QuestionId, id: string) => qs.find((x) => x.id === q)!.options.find((o) => o.id === id)!.key;

describe('questions', () => {
  it.each(FIGURES)('%s: every word but walk and run is in exactly one question; faces in face', (fig) => {
    const vocab = packOf(fig).manifest.vocab;
    const qs = buildQuestions(vocab, { posture: 'stand' });
    const seen = new Map<string, QuestionId>();
    for (const q of qs) for (const o of q.options) if (o.id) {
      expect(seen.has(o.id), `${o.id} twice`).toBe(false);
      seen.set(o.id, q.id);
    }
    for (const v of vocab) {
      if (v.id === 'walk' || v.id === 'run') { expect(seen.has(v.id)).toBe(false); continue; }
      // standing: the stand word is the posture she is in
      if (v.id === 'stand') { expect(seen.has(v.id)).toBe(false); continue; }
      expect(seen.get(v.id), v.id).toBe(questionOf(v));
      if (v.kind === 'expression') expect(seen.get(v.id)).toBe('face');
    }
  });

  it('asks a tail, ears or wings question only of a figure that has those words', () => {
    const ids = (fig: string) => buildQuestions(packOf(fig).manifest.vocab).map((q) => q.id);
    expect(ids('coo')).toEqual(['face', 'head', 'arm', 'body']);
    expect(ids('claude-chan')).toEqual(['face', 'head', 'arm', 'body']);
    expect(ids('whale')).toEqual(['face', 'head', 'arm', 'body', 'tail']);
    expect(ids('gpt-chan')).toEqual(['face', 'head', 'arm', 'body', 'tail', 'wings']);
    expect(ids('gemini-chan')).toEqual(['face', 'head', 'arm', 'body', 'tail', 'ears']);
    expect(ids('grok-chan')).toEqual(['face', 'head', 'arm', 'body', 'wings']);
  });

  it.each(FIGURES)('%s: keep options first and no word; option keys unique; within the interface limits', (fig) => {
    const vocab = packOf(fig).manifest.vocab;
    const qs = buildQuestions(vocab, { posture: 'sit' });
    expect(qs.length).toBeLessThanOrEqual(128);
    const keys = qs.flatMap((q) => q.options.map((o) => o.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const q of qs) {
      expect(q.options[0]).toMatchObject({ key: q.keep, id: null });
      expect(vocabId(q.keep, vocab)).toBeNull();
      expect(q.options.length).toBeLessThanOrEqual(255);
      for (const o of q.options) expect(o.about.length).toBeGreaterThan(0);
    }
    expect(qs.find((q) => q.id === 'body')!.keep).toBe('保持现在的姿势(现在:坐着)');
  });

  it('leaves sleep out of a bubble and the posture she is in out of the body question', () => {
    const vocab = packOf('claude-chan').manifest.vocab;
    const body = (o: Parameters<typeof buildQuestions>[1]) => buildQuestions(vocab, o).find((q) => q.id === 'body')?.options.map((x) => x.id) ?? null;
    expect(body({ forSay: true })).not.toContain('sleep');
    expect(body({})).toContain('sleep');
    expect(body({ posture: 'stand' })).not.toContain('stand');
    expect(body({ posture: 'sit' })).toEqual(expect.arrayContaining(['stand', 'kneel', 'lie']));
    expect(body({ posture: 'sit' })).not.toContain('sit');
    expect(body({ posture: 'kneel' })).not.toContain('kneel');
    expect(body({ posture: 'lie' })).not.toContain('lie');
    expect(body({ posture: 'busy' })).toBeNull();
  });

  it('names a word by its first name, and by name(id) when two words share it', () => {
    const vocab: VocabWord[] = [
      { id: 'happy', kind: 'expression', names: { zh: ['开心', '高兴'] }, about: { zh: '笑' }, seconds: 1 },
      { id: 'own-a', kind: 'motion', names: { zh: ['跳跳'] }, about: {}, seconds: 1 },
      { id: 'own-b', kind: 'motion', names: { zh: ['跳跳'] }, about: { zh: 'b' }, seconds: 1 },
    ];
    const qs = buildQuestions(vocab);
    expect(qs.map((q) => q.id)).toEqual(['face', 'body']);
    expect(qs[0].options[1]).toMatchObject({ key: '开心', about: expect.stringContaining('也叫:高兴') });
    expect(qs[1].options.map((o) => o.key)).toEqual(['保持现在的姿势(现在:站着)', '跳跳', '跳跳(own-b)']);
    // a word without an about is described by its name
    expect(qs[1].options[1].about).toContain('跳跳');
  });

  it('builds the request with one choice question per part', () => {
    const qs = buildQuestions(packOf('coo').manifest.vocab);
    const r = buildRequest('m', 'S', qs);
    expect(r.model).toBe('m');
    expect(r.state).toBe('S');
    expect(Object.keys(r.questions)).toEqual(['face', 'head', 'arm', 'body']);
    expect(r.questions.face.type).toBe('choice');
    expect(r.questions.face.criteria['不换表情']).toBeTruthy();
    expect(r.questions.face.criteria['开心']).toBeTruthy();
    const bare = buildRequest('m', 'S', qs, false);
    expect(bare.questions.face).not.toHaveProperty('instructions');
    expect(bare.state).toContain('题目:face:');
  });
});

describe('state', () => {
  it('lists the feeling, the line, what was heard, posture, recent picks and time, cut to size', () => {
    const s = buildState({
      body: 'Claude 娘', feeling: '被夸了有点得意', text: '哼,才没有', posture: 'stand', place: '屏幕偏右', facing: -1,
      heard: { who: '伙伴', text: '你真厉害', via: '打字', agoMs: 60_000 },
      recent: [{ words: ['得意', '点头'], agoMs: 12_000 }], time: '周三 23:40',
    });
    expect(s).toContain('她此刻的心情:被夸了有点得意');
    expect(s).toContain('她正要说的话:哼,才没有');
    expect(s).toContain('对方刚才说(1 分钟前,打字):你真厉害');
    expect(s).toContain('她现在:站着,在屏幕偏右,面朝左');
    expect(s).toContain('得意+点头(12 秒前)');
    expect(s).toContain('时间:周三 23:40');
    expect(buildState({ body: 'x', feeling: '好'.repeat(5000), posture: 'sit' }).length).toBeLessThanOrEqual(1500);
  });
});

describe('answers', () => {
  it('reads usage in either case and answers without probabilities', () => {
    expect(parseUsage({ usage: { input_tokens: 10, output_tokens: 0, cost: 0.1 } })).toEqual({ inputTokens: 10, outputTokens: 0, cost: 0.1 });
    expect(parseUsage({ usage: { inputTokens: 7, outputTokens: 1 } })).toEqual({ inputTokens: 7, outputTokens: 1, cost: null });
    expect(parseUsage({})).toEqual({ inputTokens: 0, outputTokens: 0, cost: null });
    const a = parseAnswers({ answers: { face: { type: 'choice', choice: '开心' }, bad: 3 } })!;
    expect(a).toEqual({ face: { choice: '开心', probabilities: {}, confidence: null } });
    expect(parseAnswers({})).toBeNull();
    const vocab = packOf('coo').manifest.vocab;
    const qs = buildQuestions(vocab);
    expect(pickGroup(qs, a, { vocab }).ids).toEqual(['happy']);
  });
});

describe('pickGroup', () => {
  const vocab = packOf('claude-chan').manifest.vocab;
  const pairs = packOf('claude-chan').manifest.pairs;
  const qs = buildQuestions(vocab, { forSay: true });
  const k = (q: QuestionId, id: string) => keyOf(qs, q, id);

  it('keeps still where the keep option wins or the winner is under its floor', () => {
    const p = pickGroup(qs, ans([['face', '不换表情', .6], ['head', k('head', 'nod'), .3], ['arm', k('arm', 'wave'), .8]]), { vocab, pairs });
    expect(p.ids).toEqual(['wave']);
    expect(p.chosen).toMatchObject({ face: null, head: null, arm: k('arm', 'wave') });
    expect(p.why.head).toContain('不够');
    // lying needs more than another body word
    expect(pickGroup(qs, ans([['body', k('body', 'lie'), .65]]), { vocab, pairs }).ids).toEqual([]);
    expect(pickGroup(qs, ans([['body', k('body', 'sit'), .65]]), { vocab, pairs }).ids).toEqual(['sit']);
  });

  it('moves at most two parts besides the face', () => {
    const p = pickGroup(qs, ans([['face', k('face', 'happy'), .9], ['head', k('head', 'nod'), .7], ['arm', k('arm', 'wave'), .8], ['body', k('body', 'sit'), .6]]), { vocab, pairs });
    expect(p.ids.sort()).toEqual(['happy', 'nod', 'wave']);
    expect(p.why.body).toContain('最多动 2 个部位');
  });

  it('gives way to the second choice after the same word twice', () => {
    const wave = k('arm', 'wave'), heart = k('arm', 'heart');
    const a = ans([['arm', wave, .7, [heart, .5]]]);
    expect(pickGroup(qs, a, { vocab, pairs, recent: [{ arm: wave }] }).ids).toEqual(['wave']);
    expect(pickGroup(qs, a, { vocab, pairs, recent: [{ arm: wave }, { arm: wave }] }).ids).toEqual(['heart']);
    // a second far behind does not take over
    expect(pickGroup(qs, ans([['arm', wave, .9, [heart, .46]]]), { vocab, pairs, recent: [{ arm: wave }, { arm: wave }] }).ids).toEqual(['wave']);
  });

  it('pairs two faces the figure composes, and only those', () => {
    const happy = k('face', 'happy'), surprised = k('face', 'surprised');
    expect(pairs['happy~surprised']).toBeTruthy();
    const p = pickGroup(qs, ans([['face', happy, .5, [surprised, .3]]]), { vocab, pairs });
    expect(p.ids).toEqual(['happy', 'surprised']);
    const r = parseActions([p.ids.join('+')], vocab, pairs);
    expect(r.actions).toHaveLength(1);
    expect(r.dropped).toEqual([]);
    // not composed without the pack's pairs
    expect(pickGroup(qs, ans([['face', happy, .5, [surprised, .3]]]), { vocab, pairs: {} }).ids).toEqual(['happy']);
    // too unlikely
    expect(pickGroup(qs, ans([['face', happy, .7, [surprised, .2]]]), { vocab, pairs }).ids).toEqual(['happy']);
  });

  it('settles clashes by probability', () => {
    const feel = buildQuestions(vocab, { forSay: false });
    const f = (q: QuestionId, id: string) => keyOf(feel, q, id);
    // lying takes the arms
    expect(pickGroup(feel, ans([['body', f('body', 'lie'), .8], ['arm', f('arm', 'wave'), .6]]), { vocab, pairs }).ids).toEqual(['lie']);
    // stone goes with nothing
    expect(pickGroup(feel, ans([['face', f('face', 'petrify'), .9], ['arm', f('arm', 'wave'), .6], ['head', f('head', 'nod'), .6]]), { vocab, pairs }).ids).toEqual(['petrify']);
    // a song needs her still, a dance moves her: the likelier stays
    expect(pickGroup(feel, ans([['arm', f('arm', 'song'), .7], ['body', f('body', 'dance'), .6]]), { vocab, pairs }).ids).toEqual(['song']);
    expect(pickGroup(feel, ans([['arm', f('arm', 'song'), .5], ['body', f('body', 'dance'), .9]]), { vocab, pairs }).ids).toEqual(['dance']);
    // Claude-chan kneels with her arms free and sings kneeling
    expect(pickGroup(feel, ans([['body', f('body', 'kneel'), .8], ['arm', f('arm', 'song'), .7]]), { vocab, pairs }).ids.sort()).toEqual(['kneel', 'song']);
    expect(pickGroup(feel, ans([['body', f('body', 'kneel'), .8], ['arm', f('arm', 'wave'), .7]]), { vocab, pairs }).ids.sort()).toEqual(['kneel', 'wave']);
    // Coo's kneel takes the arms
    const coo = packOf('coo').manifest.vocab;
    const cq = buildQuestions(coo);
    expect(pickGroup(cq, ans([['body', keyOf(cq, 'body', 'kneel'), .8], ['arm', keyOf(cq, 'arm', 'wave'), .7]]), { vocab: coo }).ids).toEqual(['kneel']);
  });

  it.each(FIGURES)('%s: 1000 random answer sets give groups parseActions keeps whole', (fig) => {
    const pack = packOf(fig);
    const v = pack.manifest.vocab;
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < 1000; i++) {
      const postures = ['stand', 'sit', 'kneel', 'lie', 'sleep'] as const;
      const q = buildQuestions(v, { forSay: rnd() < .5, posture: postures[Math.floor(rnd() * postures.length)] });
      const answers: Record<string, Answer> = {};
      for (const x of q) {
        const probs: Record<string, number> = {};
        let left = 1;
        for (let n = 0; n < 3; n++) {
          const o = x.options[Math.floor(rnd() * x.options.length)];
          const p = left * rnd();
          probs[o.key] = (probs[o.key] ?? 0) + p;
          left -= p;
        }
        answers[x.id] = { choice: null, probabilities: probs, confidence: null };
      }
      const p = pickGroup(q, answers, { vocab: v, pairs: pack.manifest.pairs });
      if (!p.ids.length) continue;
      const r = parseActions([p.ids.join('+')], v, pack.manifest.pairs);
      expect(r.dropped, p.ids.join('+')).toEqual([]);
      expect(r.notes.filter((n) => n.includes('不能同时做')), p.ids.join('+')).toEqual([]);
      expect(r.actions, p.ids.join('+')).toHaveLength(1);
    }
  });

  it('knows every question id', () => {
    expect(QUESTION_IDS).toEqual(['face', 'head', 'arm', 'body', 'tail', 'ears', 'wings']);
  });
});

describe('stripMarkers (decider mode keeps brackets that are not words)', () => {
  const vocab = packOf('claude-chan').manifest.vocab;
  it.each([
    ['用 <div> 标签写', '用 <div> 标签写', false],
    ['a < b 而且 c > d', 'a < b 而且 c > d', false],
    ['我觉得 3<5 是对的', '我觉得 3<5 是对的', false],
    ['<3 爱你', '<3 爱你', false],
    ['【重要】明天开会', '明天开会', true],
    ['【超开心】好', '好', true],
    ['<小声>悄悄说', '悄悄说', true],
    ['<b>粗体</b>', '<b>粗体</b>', false],
    ['<Nod>好', '好', true],
    ['他说<点头>好', '他说好', true],
    ['【开心】你好', '你好', true],
    ['【开心+招手】你好＜眨眼＞呀', '你好呀', true],
  ] as const)('%s', (input, out, stripped) => {
    expect(stripMarkers(input, vocab)).toEqual({ text: out, stripped });
  });
});
