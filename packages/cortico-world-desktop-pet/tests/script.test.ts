import { describe, expect, it } from 'vitest';
import { figurePacks } from '../src/packs.ts';
import { CHANNELS, estimateSeconds, type Channel, pairKey, parseActions as actionsIn, parseScript as scriptIn, vocabId, vocabTable, INLINE_TAG_MAX, type Pairs, type VocabWord } from '../src/script.ts';

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
  const lines = (t = vocabTable(VOCAB)) => t.split('\n');
  const row = (id: string, t?: string) => lines(t).find((l) => l.startsWith(`- ${id} `))!;
  /** The group heading a word's line is under. */
  const groupOf = (id: string, t?: string) => {
    let head = '';
    for (const l of lines(t)) {
      if (l.startsWith(`- ${id} `)) return head;
      if (l && !l.startsWith('- ') && l.endsWith(':')) head = l.slice(0, -1);
    }
    return null;
  };

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

  it('lists every word once, one line each with its id, names and look', () => {
    for (const v of VOCAB) expect(lines().filter((l) => l.startsWith(`- ${v.id} `)), v.id).toHaveLength(1);
    expect(row('happy')).toMatch(/^- happy 开心\/高兴:/);
    expect(row('petrify')).toContain('不和别的同时做');
    expect(row('happy')).not.toContain('不和别的同时做');
  });

  it('groups the motions by the part of her they take, and says what else a whole-body word takes', () => {
    const t = vocabTable(VOCAB);
    expect(t).toContain('动作,按部位分组:');
    for (const id of ['nod', 'shake', 'sigh']) expect(groupOf(id), id).toBe('头');
    for (const id of ['wave', 'read', 'hips', 'spout']) expect(groupOf(id), id).toBe('手');
    for (const id of ['song', 'bow', 'cheer', 'spin']) expect(groupOf(id), id).toBe('手,要站着或坐着不动(不和走、跑、跳这类移动同组,坐下可以)');
    for (const id of ['sit', 'kneel', 'walk', 'jump', 'curtsy', 'turn', 'roll', 'sleep', 'dizzy']) expect(groupOf(id), id).toBe('身');
    expect(row('sit')).toMatch(/^- sit 坐下\/坐:/);
    expect(row('kneel')).toMatch(/^- kneel [^:]*\(也占手\):/);
    expect(row('roll')).toMatch(/\(也占手、头\):/);
    expect(row('sleep')).toMatch(/\(也占手、头、表情\):/);
    expect(row('dizzy')).toMatch(/\(也占表情\):/);
    // every part a motion takes shows: in its group, or after its names
    const shown: Record<Channel, RegExp> = { head: /头/, arm: /手/, face: /表情/, body: /身|手,要站着/, stance: /身|手,要站着/ };
    for (const v of VOCAB.filter((w) => w.kind === 'motion')) {
      const said = `${groupOf(v.id)} ${row(v.id).split(':')[0]}`;
      for (const c of CHANNELS[v.id] ?? []) expect(said, `${v.id} ${c}`).toMatch(shown[c]);
    }
    // a pack's own motion takes the whole body
    const own: VocabWord[] = [{ id: 'beep', kind: 'motion', names: { zh: ['哔哔'] }, about: { zh: '哔一声' }, seconds: 1 }];
    expect(vocabTable(own)).toContain('身:\n- beep 哔哔(也占手、头):哔一声');
  });

  it('groups the expressions by mood, a composite next to its plain face, a pack\'s own last', () => {
    expect(vocabTable(VOCAB)).toContain('表情,按心情分组:');
    expect(groupOf('happy')).toBe('开心');
    expect(groupOf('lol')).toBe('开心');
    expect(groupOf('smirk')).toBe('调皮、得意');
    expect(groupOf('sulk')).toBe('难过');
    expect(groupOf('huff')).toBe('生气、嫌弃');
    expect(groupOf('petrify')).toBe('惊讶、紧张');
    expect(groupOf('neutral')).toBe('其他');
    const t = vocabTable(VOCAB);
    expect(t.indexOf('- sad ')).toBeLessThan(t.indexOf('- sulk '));
    expect(t.indexOf('- sulk ')).toBeLessThan(t.indexOf('- angry '));
    const own: VocabWord[] = [...VOCAB, { id: 'beep', kind: 'expression', names: { zh: ['哔哔脸'] }, about: { zh: '屏幕一闪' }, seconds: 1 }];
    expect(groupOf('beep', vocabTable(own))).toBe('其他');
  });

  it('opens with an example made of the figure\'s own words: a composite face, a head word and a gesture, else plain words', () => {
    expect(vocabTable(VOCAB).split('\n')[0]).toBe('例:`【瘪嘴+摇头】又没抢到票……【跃跃欲试+叉腰】下次我帮你盯着!<比耶>`');
    const plain = VOCAB.filter((v) => !['sulk', 'eager', 'hips', 'vsign'].includes(v.id));
    expect(vocabTable(plain).split('\n')[0]).toBe('例:`【开心+招手】今天也辛苦啦!<眨眼>要不要歇一会儿?`');
    expect(vocabTable(plain.filter((v) => v.id !== 'wave'))).toMatch(/^表情,按心情分组:/);
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

describe('two expressions of one group as one face', () => {
  // a test table: surprised eyes with a happy mouth (composed by the body), smug and happy shown as the smirk
  const P: Pairs = { 'happy~surprised': { eyes: 'surprised', mouth: 'happy' }, 'happy~smug': { as: 'smirk' } };
  const withP = (s: string) => scriptIn(s, VOCAB, P);
  const MERGE = '开心 和 惊讶 合成了一张脸:惊讶的眼睛,开心的嘴。';

  it('keeps a declared pair in one group, eyes first whichever is written first, and says which face gave the eyes and which the mouth', () => {
    // the body composes the first face's eyes with the second's mouth, so the group goes as the manifest says
    expect(withP('【开心+惊讶】').beats[0].actions).toEqual(['surprised+happy']);
    expect(withP('【开心+惊讶】').notes).toEqual([MERGE]);
    expect(withP('【惊讶+开心】').beats[0].actions).toEqual(['surprised+happy']);
    expect(withP('【惊讶+开心】').notes).toEqual(['惊讶 和 开心 合成了一张脸:惊讶的眼睛,开心的嘴。']);
    // by id or any name, as written
    expect(withP('【happy+surprised】').notes).toEqual(['happy 和 surprised 合成了一张脸:surprised的眼睛,happy的嘴。']);
  });

  it('sends a pair shown as a word as that word', () => {
    const got = withP('【得意+开心】好');
    expect(got.beats[0].actions).toEqual(['smirk']);
    expect(got.notes).toEqual(['得意 和 开心 合成了一张脸:坏笑。']);
    expect(withP('【坐下+开心+得意】').beats[0].actions).toEqual(['sit+smirk']);
  });

  it('puts the pair where faces go, after the body and the arms', () => {
    expect(withP('【坐下+开心+招手+惊讶】').beats[0].actions).toEqual(['sit+wave+surprised+happy']);
    expect(withP('【惊讶+点头+开心】').beats[0].actions).toEqual(['nod+surprised+happy']);
    expect(withP('【开心+点头+惊讶】').beats[0].actions).toEqual(['nod+surprised+happy']);
  });

  it('of three faces, pairs the first two that go together and does the third after or before, as written', () => {
    const a = withP('【开心+惊讶+难过】');
    expect(a.beats[0].actions).toEqual(['surprised+happy', 'sad']);
    expect(a.notes).toEqual([MERGE, '开心+惊讶 和 难过 不能同时做,改成先后做。']);
    const b = withP('【难过+开心+惊讶】');
    expect(b.beats[0].actions).toEqual(['sad', 'surprised+happy']);
    expect(b.notes).toEqual(['难过 和 开心 不能同时做,改成先后做。', MERGE]);
    // a pair takes no third face, even one it would pair with
    const c = withP('【开心+惊讶+得意】');
    expect(c.beats[0].actions).toEqual(['surprised+happy', 'smug']);
    expect(c.notes).toEqual([MERGE, '开心+惊讶 和 得意 不能同时做,改成先后做。']);
    // greedy, in the order written: happy and sad do not pair, so sad starts the next run, and surprised clashes with it
    const d = withP('【开心+难过+惊讶】');
    expect(d.beats[0].actions).toEqual(['happy', 'sad', 'surprised']);
    expect(d.notes).toEqual(['开心 和 难过 不能同时做,改成先后做。', '难过 和 惊讶 不能同时做,改成先后做。']);
  });

  it('splits everything else as before: a pair not declared, a face made of parts, stone, sleep, dizzy', () => {
    const cases: Array<[string, string[], string]> = [
      ['【开心+难过】', ['happy', 'sad'], '开心 和 难过 不能同时做,改成先后做。'],
      ['【坏笑+开心】', ['smirk', 'happy'], '坏笑 和 开心 不能同时做,改成先后做。'],
      ['【石化+开心】', ['petrify', 'happy'], '石化 和 开心 不能同时做,改成先后做。'],
      ['【睡觉+开心】', ['sleep', 'happy'], '睡觉 和 开心 不能同时做,改成先后做。'],
      ['【晕+开心】', ['dizzy', 'happy'], '晕 和 开心 不能同时做,改成先后做。'],
      ['【招手+比心】', ['wave', 'heart'], '招手 和 比心 不能同时做,改成先后做。'],
    ];
    for (const [s, actions, note] of cases) {
      for (const got of [withP(s), parseScript(s)]) {
        expect(got.beats[0].actions, s).toEqual(actions);
        expect(got.notes, s).toEqual([note]);
      }
    }
    // without a table (every figure today), a pair is split as before
    expect(parseScript('【开心+惊讶】').beats[0].actions).toEqual(['happy', 'surprised']);
    expect(parseScript('【开心+惊讶】').notes).toEqual(['开心 和 惊讶 不能同时做,改成先后做。']);
  });

  it("does the same for pet_act's words and inline markers", () => {
    expect(actionsIn(['开心+惊讶', '得意 + 开心'], VOCAB, P)).toEqual({
      actions: ['surprised+happy', 'smirk'], dropped: [], notes: [MERGE, '得意 和 开心 合成了一张脸:坏笑。'],
    });
    const inline = withP('你好<开心+惊讶>呀');
    expect(inline.beats[0].anchors).toEqual([{ at: 2, actions: ['surprised+happy'] }]);
    expect(inline.notes).toEqual([MERGE]);
  });

  it("lists the figure's composed pairs after the expressions with an example, a pair shown as a word after that word, and nothing when it has none", () => {
    const t = vocabTable(VOCAB, 'zh', P);
    expect(t).toContain('表情,按心情分组(「=甲+乙」:同一组写甲+乙也是这张脸):');
    expect(t).toContain('- smirk 坏笑/贼笑(=开心+得意):');
    expect(t).toContain('\n\n表情对(写在同一组里会合成一张脸,先写哪个都行;如【开心+惊讶】是惊讶的眼睛配开心的嘴):开心+惊讶\n不在这里的两个表情写在同一组,仍改成先后做。\n\n动作,按部位分组:');
    // only a word: no 表情对 paragraph; only composed: no 「=」 note
    expect(vocabTable(VOCAB, 'zh', { 'happy~smug': { as: 'smirk' } })).not.toContain('表情对');
    expect(vocabTable(VOCAB, 'zh', { 'happy~surprised': P['happy~surprised']! })).toContain('表情,按心情分组:\n');
    for (const none of [vocabTable(VOCAB), vocabTable(VOCAB, 'zh', {})]) {
      expect(none).not.toContain('合成');
      expect(none).not.toContain('=');
    }
    expect(vocabTable(VOCAB, 'zh', {})).toBe(vocabTable(VOCAB));
  });

  it('lists many composed pairs one line per expression, in the order listed, each pair once under the one that comes first', () => {
    const many: Pairs = figurePacks([]).packs.find((p) => p.id === 'claude-chan')!.manifest.pairs;
    const composed = Object.values(many).filter((p) => !('as' in p)).length;
    expect(composed).toBeGreaterThan(12);
    const t = vocabTable(VOCAB, 'zh', many);
    const para = t.slice(t.indexOf('表情对('), t.indexOf('\n\n动作,'));
    const lines = para.split('\n').slice(1, -1);
    expect(para.split('\n').at(-1)).toBe('不在这里的两个表情写在同一组,仍改成先后做。');
    expect(lines[0]).toMatch(/^- 开心 \+ 难过\/嘟嘴\/惊讶\//);
    expect(lines).toContain('- 眨眼 + 嘟嘴/尴尬');
    // every composed pair once: the partners listed add up to them; the pairs shown as a word are in the list above
    expect(lines.reduce((n, l) => n + l.split(' + ')[1]!.split('/').length, 0)).toBe(composed);
    expect(para).not.toContain('=');
    expect(t).toContain('- bashful 腼腆/不好意思(=开心+害羞):');
    expect(t).toContain('- lol 哈哈/笑出声/乐坏了(=开心+慌张):');
    // a handful of composed pairs stays on one line
    const few = Object.fromEntries(Object.entries(many).filter(([, p]) => !('as' in p)).slice(0, 12));
    expect(vocabTable(VOCAB, 'zh', few)).toMatch(/的嘴\):[^\n]+\n不在这里的两个表情写在同一组,仍改成先后做。\n\n动作/);
  });

  it('keys a pair the same whichever is first', () => {
    expect(pairKey('surprised', 'happy')).toBe('happy~surprised');
    expect(pairKey('happy', 'surprised')).toBe('happy~surprised');
  });
});
