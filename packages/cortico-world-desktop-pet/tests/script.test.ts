import { describe, expect, it } from 'vitest';
import { figurePacks } from '../src/packs.ts';
import { CHANNELS, estimateSeconds, parseActions as actionsIn, parseScript as scriptIn, vocabId, vocabTable, INLINE_TAG_MAX, type VocabWord } from '../src/script.ts';

// Coo's words, as the body on screen gives them
const VOCAB = figurePacks([]).packs.find((p) => p.id === 'coo')!.manifest.vocab;
const parseScript = (s: string) => scriptIn(s, VOCAB);
const parseActions = (list: unknown[]) => actionsIn(list, VOCAB);

describe('parseScript', () => {
  it('splits bubbles at blocking markers and keeps inline markers at their character offset', () => {
    const { beats, dropped } = parseScript('【开心】你好呀!<眨眼>今天也加油。【jump, 点头】看我!');
    expect(dropped).toEqual([]);
    expect(beats).toEqual([
      { actions: ['happy'], text: '你好呀!今天也加油。', anchors: [{ at: 4, actions: ['wink'] }] },
      { actions: ['jump', 'nod'], text: '看我!', anchors: [] },
    ]);
  });

  it('reports unknown words and drops them', () => {
    const { beats, dropped } = parseScript('【开心,飞起来】好');
    expect(dropped).toEqual(['飞起来']);
    expect(beats[0].actions).toEqual(['happy']);
  });

  it('treats an over-long or multi-line inline marker as text', () => {
    const long = `<${'x'.repeat(INLINE_TAG_MAX + 1)}>`;
    expect(parseScript(`a${long}b`).beats[0].text).toBe(`a${long}b`);
    expect(parseScript('a<开\n心>b').beats[0].text).toBe('a<开\n心>b');
  });

  it('keeps an unclosed blocking marker as text', () => {
    expect(parseScript('你好【开心').beats[0].text).toBe('你好【开心');
  });

  it('allows a beat with actions only', () => {
    expect(parseScript('【sleep】').beats).toEqual([{ actions: ['sleep'], text: '', anchors: [] }]);
  });

  it('starts inline words in a bubble with no text along with its blocking words, in order', () => {
    // there is no typing to reach them, so the page would never get to them as anchors
    expect(parseScript('【开心】<眨眼>【点头】好').beats).toEqual([
      { actions: ['happy', 'wink'], text: '', anchors: [] },
      { actions: ['nod'], text: '好', anchors: [] },
    ]);
    expect(parseScript('<眨眼> <点头, 开心>').beats).toEqual([{ actions: ['wink', 'nod', 'happy'], text: '', anchors: [] }]);
    // a bubble with text keeps them where they are
    expect(parseScript('<眨眼>你好').beats).toEqual([{ actions: [], text: '你好', anchors: [{ at: 0, actions: ['wink'] }] }]);
  });
});

describe('vocabTable', () => {
  const row = (id: string) => vocabTable(VOCAB).split('\n').find((l) => l.startsWith(`| ${id} |`))!;

  it('says sitting, lying and sleeping last through gestures and expressions, and end on another posture or a move', () => {
    for (const id of ['sit', 'lie', 'sleep']) {
      expect(row(id)).toContain('一直保持:做手势、换表情不影响,换别的姿势或走、跑、跳这类全身动作才结束');
      expect(row(id)).not.toContain('下一个动作');
    }
  });

  it('says kneeling ends on the next arm or whole-body motion, not on a face or a head gesture, and leaves other words alone', () => {
    expect(row('kneel')).toContain('保持到下一个手或全身动作,然后变回普通坐着;换表情、点头、摇头、叹气不影响');
    expect(row('nod')).not.toContain('保持');
  });

  it('says what part of her each motion takes, for words done at once, and that faces outlast motions but stone', () => {
    const part = (id: string) => row(id).split(' | ')[2];
    expect(part('nod')).toBe('头');
    expect(part('sigh')).toBe('头');
    expect(part('wave')).toBe('手');
    expect(part('read')).toBe('手');
    expect(part('song')).toBe('手(停下来做)');
    expect(part('bow')).toBe('手(停下来做)');
    for (const id of ['sit', 'kneel', 'walk', 'jump', 'curtsy', 'turn', 'roll']) expect(part(id), id).toBe('身');
    expect(vocabTable(VOCAB)).toContain('| 词 | 中文 | 部位 | 样子 |');
    expect(vocabTable(VOCAB)).toContain('表情(持续几秒后回到平常的脸;做动作不会打断,石化除外)');
    expect(row('petrify')).toContain('不和别的同时做');
    expect(row('happy')).not.toContain('不和别的同时做');
    // a pack's own motion takes the whole body
    const own: VocabWord[] = [{ id: 'beep', kind: 'motion', names: { zh: ['哔哔'] }, about: { zh: '哔一声' }, seconds: 1 }];
    expect(vocabTable(own)).toContain('| beep | 哔哔 | 身 | 哔一声 |');
  });
});

describe('vocabulary', () => {
  it('resolves every id and every name to the same id', () => {
    for (const v of VOCAB) {
      expect(vocabId(v.id, VOCAB)).toBe(v.id);
      for (const z of Object.values(v.names).flat()) expect(vocabId(z, VOCAB)).toBe(v.id);
    }
  });

  it('knows lying down by its Chinese names', () => {
    for (const z of ['趴下', '躺平', '趴着']) expect(parseActions([z]).actions).toEqual(['lie']);
    expect(parseScript('【趴下】歇会儿').beats[0].actions).toEqual(['lie']);
  });

  it('parseActions separates known from unknown words', () => {
    expect(parseActions(['跳', 'happy', 'fly', 3])).toEqual({ actions: ['jump', 'happy'], dropped: ['fly', '3'], notes: [] });
  });

  it('estimates longer display for longer text', () => {
    expect(estimateSeconds(parseScript('短').beats)).toBeLessThan(estimateSeconds(parseScript('这是一段明显更长的话,要多打一会儿字才能说完。').beats));
  });
});

describe('words at once', () => {
  const blocking = (s: string) => parseScript(s).beats[0].actions;

  it('groups words joined by a plus, full-width or with spaces around it, body first and face last', () => {
    expect(parseScript('【开心+招手】你好').beats[0]).toEqual({ actions: ['wave+happy'], text: '你好', anchors: [] });
    for (const s of ['【开心 + 招手】', '【开心＋招手】', '【开心 ＋ 招手】', '【招手+开心】']) expect(blocking(s), s).toEqual(['wave+happy']);
    expect(parseScript('好<点头 ＋ 眨眼>呀').beats[0].anchors).toEqual([{ at: 1, actions: ['nod+wink'] }]);
    expect(blocking('【开心+招手+坐下】')).toEqual(['sit+wave+happy']);
    // the list separators still mean one after another
    expect(blocking('【坐下, 开心+招手、点头】')).toEqual(['sit', 'wave+happy', 'nod']);
    // an empty member is ignored, a repeat counts once
    expect(blocking('【开心+】')).toEqual(['happy']);
    expect(blocking('【开心+开心+招手】')).toEqual(['wave+happy']);
  });

  it('keeps together what the body can do at once', () => {
    expect(blocking('【坐下+唱歌】')).toEqual(['sit+song']);
    expect(blocking('【跪坐+点头+开心】')).toEqual(['kneel+nod+happy']);
    expect(blocking('【走走+开心】')).toEqual(['walk+happy']);
    expect(blocking('【小跳+招手+开心】')).toEqual(['hop+wave+happy']);
    expect(blocking('【张望+疑惑】')).toEqual(['look+confused']);
    expect(blocking('【点头+招手】')).toEqual(['wave+nod']);
    expect(parseScript('【坐下+唱歌】').notes).toEqual([]);
  });

  it('splits what takes the same part of her, or cannot be done together, into groups one after another, and says so', () => {
    const cases: Array<[string, string[], string]> = [
      ['【招手+比心】', ['wave', 'heart'], '招手 和 比心 不能同时做,改成先后做。'],
      ['【开心+难过】', ['happy', 'sad'], '开心 和 难过 不能同时做,改成先后做。'],
      ['【走走+唱歌】', ['walk', 'song'], '走走 和 唱歌 不能同时做,改成先后做。'],
      ['【坐下+屈膝礼】', ['sit', 'curtsy'], '坐下 和 屈膝礼 不能同时做,改成先后做。'],
      ['【跪坐+招手】', ['kneel', 'wave'], '跪坐 和 招手 不能同时做,改成先后做。'],
      ['【趴下+招手】', ['lie', 'wave'], '趴下 和 招手 不能同时做,改成先后做。'],
      ['【晕+开心】', ['dizzy', 'happy'], '晕 和 开心 不能同时做,改成先后做。'],
      ['【睡觉+开心】', ['sleep', 'happy'], '睡觉 和 开心 不能同时做,改成先后做。'],
      ['【石化+点头】', ['petrify', 'nod'], '石化 和 点头 不能同时做,改成先后做。'],
    ];
    for (const [s, actions, note] of cases) {
      const got = parseScript(s);
      expect(got.beats[0].actions, s).toEqual(actions);
      expect(got.notes, s).toEqual([note]);
    }
    // a member that clashes starts the next group, which goes on gathering
    expect(blocking('【坐下+招手+比心+开心】')).toEqual(['sit+wave', 'heart+happy']);
  });

  it('drops an unknown member and reports it, keeping the others', () => {
    const got = parseScript('【开心+飞起来】好');
    expect(got.beats[0].actions).toEqual(['happy']);
    expect(got.dropped).toEqual(['飞起来']);
  });

  it('looks a name with a plus in it up whole first', () => {
    const vocab: VocabWord[] = [
      { id: 'cpp', kind: 'motion', names: { zh: ['C++'] }, about: { zh: '敲代码' }, seconds: 1 },
      { id: 'happy', kind: 'expression', names: { zh: ['开心'] }, about: { zh: '笑' }, seconds: .9 },
    ];
    expect(scriptIn('【C++】', vocab).beats[0].actions).toEqual(['cpp']);
    expect(actionsIn(['C++'], vocab).actions).toEqual(['cpp']);
    expect(actionsIn(['开心 + 开心'], vocab).actions).toEqual(['happy']);
  });

  it('pet_act items group the same way; an item that is no string is dropped', () => {
    expect(parseActions(['开心+招手'])).toEqual({ actions: ['wave+happy'], dropped: [], notes: [] });
    expect(parseActions(['坐下 ＋ 开心', '招手+比心'])).toEqual({ actions: ['sit+happy', 'wave', 'heart'], dropped: [], notes: ['招手 和 比心 不能同时做,改成先后做。'] });
    expect(parseActions([['开心', '招手']]).actions).toEqual([]);
    expect(parseActions([['开心', '招手']]).dropped).toHaveLength(1);
  });

  it('knows the part of her every word of every built-in figure takes', () => {
    for (const p of figurePacks([]).packs.filter((x) => x.builtin)) {
      for (const v of p.manifest.vocab) if (v.kind === 'motion') expect(CHANNELS[v.id], `${p.id} ${v.id}`).toBeDefined();
    }
  });
});
