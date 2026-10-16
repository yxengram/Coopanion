import { describe, expect, it } from 'vitest';
import { figurePacks } from '../src/packs.ts';
import { parseActions, vocabId, type VocabWord } from '../src/script.ts';
import {
  buildQuestions, buildRequest, buildState, DECIDER_FALLBACK_MODELS, DECIDER_MIN_CONTEXT, DeciderClient, errorGist, failureText, parseAnswers, parseDeciderModels, parseUsage, pickGroup, questionOf,
  QUESTION_IDS, stripMarkers, type Answer, type Question, type QuestionId,
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

  it('leaves the other names or the mood group out of the guidance when asked (tuning)', () => {
    const vocab = packOf('claude-chan').manifest.vocab;
    const about = (o?: Parameters<typeof buildQuestions>[1]) => buildQuestions(vocab, o)[0].options.find((x) => x.id === 'happy')!.about;
    expect(about()).toMatch(/心情:开心.*也叫:/);
    expect(about({ noAliases: true })).not.toContain('也叫:');
    expect(about({ noAliases: true })).toContain('心情:开心');
    expect(about({ noMood: true })).not.toContain('心情:');
    // the option keys stay, so answers to either request read the same
    expect(buildQuestions(vocab, { noAliases: true, noMood: true }).map((q) => q.options.map((x) => x.key)))
      .toEqual(buildQuestions(vocab).map((q) => q.options.map((x) => x.key)));
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
    const p = pickGroup(qs, ans([['face', '不换表情', .6], ['head', k('head', 'nod'), .25], ['arm', k('arm', 'wave'), .8]]), { vocab, pairs });
    expect(p.ids).toEqual(['wave']);
    expect(p.chosen).toMatchObject({ face: null, head: null, arm: k('arm', 'wave') });
    expect(p.why.head).toContain('不够');
    // lying needs more than another body word
    expect(pickGroup(qs, ans([['body', k('body', 'lie'), .65]]), { vocab, pairs }).ids).toEqual([]);
    expect(pickGroup(qs, ans([['body', k('body', 'sit'), .65]]), { vocab, pairs }).ids).toEqual(['sit']);
  });

  it('takes other knobs for tuning: the defaults are the shipped ones', () => {
    const a = ans([['face', k('face', 'happy'), .9], ['head', k('head', 'nod'), .7], ['arm', k('arm', 'wave'), .8], ['body', k('body', 'sit'), .6]]);
    expect(pickGroup(qs, a, { vocab, pairs, params: {} })).toEqual(pickGroup(qs, a, { vocab, pairs }));
    expect(pickGroup(qs, a, { vocab, pairs, params: { budget: 3 } }).ids.sort()).toEqual(['happy', 'nod', 'sit', 'wave']);
    expect(pickGroup(qs, a, { vocab, pairs, params: { budget: 0 } }).ids).toEqual(['happy']);
    const low = ans([['head', k('head', 'nod'), .25]]);
    expect(pickGroup(qs, low, { vocab, pairs }).ids).toEqual([]);
    expect(pickGroup(qs, low, { vocab, pairs, params: { floor: { face: .2, head: .2, arm: .3, body: .55, tail: .5, ears: .5, wings: .5 } } }).ids).toEqual(['nod']);
    // no repeat rule with a window of 0
    const recent = [{ arm: k('arm', 'wave') }, { arm: k('arm', 'wave') }];
    const rep = ans([['arm', k('arm', 'wave'), .8, [k('arm', 'clap'), .6]]]);
    expect(pickGroup(qs, rep, { vocab, pairs, recent }).ids).toEqual(['clap']);
    expect(pickGroup(qs, rep, { vocab, pairs, recent, params: { repeatWindow: 0 } }).ids).toEqual(['wave']);
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

  it('keeps a posture she stays in over a face it clashes with', () => {
    const feel = buildQuestions(vocab, { forSay: false });
    const f = (q: QuestionId, id: string) => keyOf(feel, q, id);
    // recorded: pet_feel asked to sleep, and the face 犯困 and head 低头 came out more likely than 睡觉
    const asleep = ans([['face', f('face', 'sleepy'), .8], ['head', f('head', 'droop'), .75], ['body', f('body', 'sleep'), .72]]);
    const p = pickGroup(feel, asleep, { vocab, pairs, feel: true });
    expect(p.ids).toEqual(['sleep']);
    expect(p.chosen).toMatchObject({ face: null, head: null, body: f('body', 'sleep') });
    expect(p.why.face).toContain('留下姿势');
    expect(p.why.head).toContain('留下姿势');
    // the old rule, by probability
    expect(pickGroup(feel, asleep, { vocab, pairs, feel: true, params: { postureOverFace: false } }).ids.sort()).toEqual(['droop', 'sleepy']);
    // the same when the posture is the likelier one: the face gives way to it
    expect(pickGroup(feel, ans([['body', f('body', 'sleep'), .9], ['face', f('face', 'sleepy'), .8]]), { vocab, pairs, feel: true }).ids).toEqual(['sleep']);
    // sitting does not take the face, so nothing clashes and both stay
    expect(pickGroup(feel, ans([['face', f('face', 'sad'), .8], ['body', f('body', 'sit'), .6]]), { vocab, pairs, feel: true }).ids.sort()).toEqual(['sad', 'sit']);
    // recorded: the face just below 睡觉, with 低头 above it
    expect(pickGroup(feel, ans([['face', f('face', 'sleepy'), .7], ['head', f('head', 'droop'), .75], ['body', f('body', 'sleep'), .72]]), { vocab, pairs, feel: true }).ids).toEqual(['sleep']);
    // asked for on pet_feel, the posture comes before any part, with no face about: lying takes the arms
    expect(pickGroup(feel, ans([['arm', f('arm', 'wave'), .8], ['body', f('body', 'sleep'), .75]]), { vocab, pairs, feel: true }).ids).toEqual(['sleep']);
    expect(pickGroup(feel, ans([['arm', f('arm', 'wave'), .8], ['body', f('body', 'lie'), .75]]), { vocab, pairs, feel: true }).ids).toEqual(['lie']);
    // and an unrelated face does not change that
    for (const happy of [.9, .3]) {
      expect(pickGroup(feel, ans([['face', f('face', 'happy'), happy], ['arm', f('arm', 'wave'), .8], ['body', f('body', 'sleep'), .75]]), { vocab, pairs, feel: true }).ids).toEqual(['sleep']);
    }
    // the parts it takes from free the budget for it: asleep, nothing else shows
    const full = ans([['face', f('face', 'sleepy'), .9], ['head', f('head', 'nod'), .85], ['arm', f('arm', 'wave'), .8], ['body', f('body', 'sleep'), .7]]);
    expect(pickGroup(feel, full, { vocab, pairs, feel: true }).ids).toEqual(['sleep']);
    expect(pickGroup(feel, full, { vocab, pairs, feel: true, params: { budget: 0 } }).ids).toEqual(['sleepy']);
  });

  it('in a bubble a posture takes only the face it clashes with; other parts go by probability', () => {
    const say = buildQuestions(vocab, { forSay: true });
    const s = (q: QuestionId, id: string) => keyOf(say, q, id);
    // stone clashes with sitting and lying: the posture stays, and the face's runner-up takes its place when it fits
    expect(pickGroup(say, ans([['face', s('face', 'petrify'), .7], ['body', s('body', 'sit'), .6]]), { vocab, pairs }).ids).toEqual(['sit']);
    const p = pickGroup(say, ans([['face', s('face', 'petrify'), .7, [s('face', 'happy'), .25]], ['body', s('body', 'sit'), .6]]), { vocab, pairs });
    expect(p.ids.sort()).toEqual(['happy', 'sit']);
    expect(p.why.face).toContain('留下姿势');
    expect(p.chosen.face).toBe(s('face', 'happy'));
    // a runner-up below the face floor does not
    expect(pickGroup(say, ans([['face', s('face', 'petrify'), .7, [s('face', 'happy'), .1]], ['body', s('body', 'sit'), .6]]), { vocab, pairs }).ids).toEqual(['sit']);
    // the likelier wave still wins over lying in a bubble, whatever the face
    expect(pickGroup(say, ans([['arm', s('arm', 'wave'), .85], ['body', s('body', 'lie'), .8]]), { vocab, pairs }).ids).toEqual(['wave']);
    for (const happy of [.95, .3]) {
      expect(pickGroup(say, ans([['face', s('face', 'happy'), happy], ['arm', s('arm', 'wave'), .85], ['body', s('body', 'lie'), .8]]), { vocab, pairs }).ids.sort()).toEqual(['happy', 'wave']);
    }
    // the face gives way only when the posture stays: here the wave keeps lying out, so the likeliest stone stays
    const stone = pickGroup(say, ans([['face', s('face', 'petrify'), .9], ['arm', s('arm', 'wave'), .85], ['body', s('body', 'lie'), .8]]), { vocab, pairs });
    expect(stone.ids).toEqual(['petrify']);
    expect(stone.why.face).not.toContain('留下姿势');
    expect(stone.chosen).toMatchObject({ face: s('face', 'petrify'), arm: null, body: null });
    // sitting stays (the budget has room for it and the nod), so the stone gives way to it, and the nod goes along
    expect(pickGroup(say, ans([['face', s('face', 'petrify'), .9], ['head', s('head', 'nod'), .7], ['body', s('body', 'sit'), .6]]), { vocab, pairs }).ids.sort()).toEqual(['nod', 'sit']);
    expect(pickGroup(say, ans([['face', s('face', 'petrify'), .9, [s('face', 'happy'), .3]], ['head', s('head', 'nod'), .7], ['body', s('body', 'sit'), .6]]), { vocab, pairs }).ids.sort()).toEqual(['happy', 'nod', 'sit']);
    // the old rule
    expect(pickGroup(say, ans([['face', s('face', 'petrify'), .7], ['body', s('body', 'sit'), .6]]), { vocab, pairs, params: { postureOverFace: false } }).ids).toEqual(['petrify']);
    // the runner-up is not the face the repeat rule just put aside
    const happy = s('face', 'happy');
    const rep = ans([['face', happy, .7, [s('face', 'petrify'), .5]], ['body', s('body', 'sit'), .6]]);
    expect(pickGroup(say, rep, { vocab, pairs, recent: [{ face: happy }, { face: happy }] }).ids).toEqual(['sit']);
  });

  it('on pet_feel a posture needs a lower floor; a bubble keeps the shipped ones', () => {
    const feel = buildQuestions(vocab, { forSay: false });
    const f = (q: QuestionId, id: string) => keyOf(feel, q, id);
    // recorded: 趴下 at .61 on a pet_feel
    const lie = ans([['body', f('body', 'lie'), .61]]);
    expect(pickGroup(feel, lie, { vocab, pairs, feel: true }).ids).toEqual(['lie']);
    expect(pickGroup(feel, lie, { vocab, pairs }).ids).toEqual([]);
    expect(pickGroup(feel, ans([['body', f('body', 'sleep'), .52]]), { vocab, pairs, feel: true }).ids).toEqual(['sleep']);
    expect(pickGroup(feel, ans([['body', f('body', 'sleep'), .45]]), { vocab, pairs, feel: true }).ids).toEqual([]);
    expect(pickGroup(feel, ans([['body', f('body', 'kneel'), .52]]), { vocab, pairs, feel: true }).ids).toEqual(['kneel']);
    expect(pickGroup(feel, ans([['body', f('body', 'kneel'), .52]]), { vocab, pairs }).ids).toEqual([]);
    // other body words keep their question's floor
    expect(pickGroup(feel, ans([['body', f('body', 'dance'), .52]]), { vocab, pairs, feel: true }).ids).toEqual([]);
    // the knob
    expect(pickGroup(feel, lie, { vocab, pairs, feel: true, params: { feelFloorWord: {} } }).ids).toEqual([]);
  });

  it.each(FIGURES)('%s: 1000 random answer sets give groups parseActions keeps whole', (fig) => {
    const pack = packOf(fig);
    const v = pack.manifest.vocab;
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < 1000; i++) {
      const postures = ['stand', 'sit', 'kneel', 'lie', 'sleep'] as const;
      const forSay = rnd() < .5;
      const q = buildQuestions(v, { forSay, posture: postures[Math.floor(rnd() * postures.length)] });
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
      const p = pickGroup(q, answers, { vocab: v, pairs: pack.manifest.pairs, feel: !forSay });
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

describe('errors and fallbacks', () => {
  // OpenRouter's answer when the workspace's zero-data-retention guardrail leaves the model no endpoint
  const GUARDRAIL = '0 endpoints out of 1 requested are available matching your guardrail restrictions and data policy. We removed them for the following reasons (an endpoint may have matched multiple reasons):\nZDR violation (guardrail): 1 endpoint excluded; configurable at https://openrouter.ai/workspaces/default/guardrails';

  it('tells a guardrail refusal by its reasons, short, and cuts other messages with a mark', () => {
    const g = errorGist(GUARDRAIL);
    expect(g).toContain('ZDR violation (guardrail)');
    expect(g).toContain('隐私');
    expect(g).not.toContain('https://');
    expect(g.length).toBeLessThan(90);
    expect(errorGist('Rate limit exceeded')).toBe('Rate limit exceeded');
    const long = errorGist(`${'x'.repeat(200)}\nsecond line`);
    expect(long).toHaveLength(121);
    expect(long.endsWith('…')).toBe(true);
  });

  it('the client reports an HTTP error through the gist', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: { message: GUARDRAIL } }), { status: 404 })) as unknown as typeof fetch;
    const c = new DeciderClient({ url: () => 'http://127.0.0.1:9/decisions', key: () => 'sk-or-test', timeoutMs: () => 1000, fetch: fetchImpl });
    const r = await c.decide({ model: 'm', state: 's', questions: {} });
    expect(r.ok).toBe(false);
    const text = failureText((r as { reason: 'http' }).reason, (r as { detail: string }).detail);
    expect(text).toMatch(/^决策模型返回错误\(HTTP 404 这个模型没有符合 OpenRouter 隐私和防护设置的服务端:ZDR violation \(guardrail\);/);
  });

  it('offers no free model when OpenRouter cannot be reached', () => {
    expect(DECIDER_FALLBACK_MODELS.length).toBeGreaterThan(0);
    expect(DECIDER_FALLBACK_MODELS.filter((id) => id.endsWith(':free'))).toEqual([]);
  });
});

describe('the listing of decision models (GET /api/v1/models?output_modalities=decisions)', () => {
  it('keeps decision models with room for a request, priced per million input tokens, cheapest first', () => {
    const got = parseDeciderModels({ data: [
      { id: 'b/paid', name: ' Paid ', context_length: 32768, pricing: { prompt: '0.00000002' }, architecture: { output_modalities: ['decisions'] } },
      { id: 'a/free:free', context_length: 16384, pricing: { prompt: '0' }, architecture: { output_modalities: ['decisions'] } },
      { id: 'c/varies', context_length: 65536, pricing: { prompt: '-1' }, architecture: { output_modalities: ['decisions'] } },
      { id: 'd/no-arch', pricing: { prompt: 0.0000001 } },
      { id: 'e/tiny', context_length: 4096, pricing: { prompt: '0' }, architecture: { output_modalities: ['decisions'] } },
      { id: 'f/chat', context_length: 128000, pricing: { prompt: '0.000001' }, architecture: { output_modalities: ['text'] } },
      { id: 'g/zero', context_length: 0, pricing: { prompt: '0.00000002' }, architecture: { output_modalities: ['decisions'] } },
      { id: 'b/paid', context_length: 1 }, { name: 'no id' }, null,
    ] });
    expect(got).toEqual([
      { id: 'a/free:free', promptPerM: 0, context: 16384 },
      { id: 'b/paid', name: 'Paid', promptPerM: 0.02, context: 32768 },
      { id: 'g/zero', promptPerM: 0.02, context: null },
      { id: 'd/no-arch', promptPerM: 0.1, context: null },
      { id: 'c/varies', promptPerM: null, context: 65536 },
    ]);
    expect(DECIDER_MIN_CONTEXT).toBeGreaterThanOrEqual(6000);
    expect(parseDeciderModels({ data: [{ id: 'e/tiny', context_length: 4096 }] }, 0)).toEqual([{ id: 'e/tiny', promptPerM: null, context: 4096 }]);
    expect(parseDeciderModels({ models: [] })).toBeNull();
    expect(parseDeciderModels(null)).toBeNull();
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
