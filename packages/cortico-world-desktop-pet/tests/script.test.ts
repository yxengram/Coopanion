import { describe, expect, it } from 'vitest';
import { figurePacks } from '../src/packs.ts';
import { estimateSeconds, parseActions as actionsIn, parseScript as scriptIn, vocabId, vocabTable, INLINE_TAG_MAX } from '../src/script.ts';

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

  it('says kneeling ends on any other motion, and leaves other words alone', () => {
    expect(row('kneel')).toContain('保持到下一个动作(点头也算),然后变回普通坐着');
    expect(row('nod')).not.toContain('保持');
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
    expect(parseActions(['跳', 'happy', 'fly', 3])).toEqual({ actions: ['jump', 'happy'], dropped: ['fly', '3'] });
  });

  it('estimates longer display for longer text', () => {
    expect(estimateSeconds(parseScript('短').beats)).toBeLessThan(estimateSeconds(parseScript('这是一段明显更长的话,要多打一会儿字才能说完。').beats));
  });
});
