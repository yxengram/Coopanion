import { describe, expect, it } from 'vitest';
import { figurePacks } from '../src/packs.ts';
import { CHANNELS, channelsOf, clashes, estimateSeconds, lastingNote, type Channel, pairKey, partsNote, parseActions as actionsIn, parseScript as scriptIn, vocabId, vocabTable, INLINE_TAG_MAX, type Pairs, type VocabWord } from '../src/script.ts';

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
    expect(row('kneel')).toContain('保持到下一个手或全身动作,然后变回普通坐着;换表情、点头、摇头、叹气、歪头不影响');
    expect(row('nod')).not.toContain('保持');
  });

  it('lists every word once, one line each with its id, names and look', () => {
    for (const v of VOCAB) expect(lines().filter((l) => l.startsWith(`- ${v.id} `)), v.id).toHaveLength(1);
    expect(row('happy')).toMatch(/^- happy 开心\/高兴\/眯眼笑:/);
    expect(row('petrify')).toContain('不和别的同时做');
    expect(row('happy')).not.toContain('不和别的同时做');
  });

  it('groups the motions by the part of her they take, and says what else a whole-body word takes', () => {
    const t = vocabTable(VOCAB);
    expect(t).toContain('动作,按部位分组:');
    for (const id of ['nod', 'shake', 'sigh', 'tilt']) expect(groupOf(id), id).toBe('头');
    for (const id of ['wave', 'read', 'hips', 'spout']) expect(groupOf(id), id).toBe('手');
    for (const id of ['song', 'bow', 'cheer', 'spin']) expect(groupOf(id), id).toBe('手,要站着或坐着不动(不和走、跑、跳这类移动同组,坐下可以)');
    for (const id of ['sit', 'kneel', 'walk', 'jump', 'curtsy', 'turn', 'roll', 'sleep', 'dizzy']) expect(groupOf(id), id).toBe('身');
    expect(row('sit')).toMatch(/^- sit 坐下\/坐:/);
    expect(row('kneel')).toMatch(/^- kneel [^:]*\(也占手\):/);
    expect(row('roll')).toMatch(/\(也占手、头\):/);
    expect(row('sleep')).toMatch(/\(也占手、头、表情\):/);
    expect(row('dizzy')).toMatch(/\(也占表情\):/);
    // every part a motion takes shows: in its group, or after its names
    // (a tail's, ears' or wings' only for a figure that has words for them: Coo has none)
    const shown: Record<Channel, RegExp> = { head: /头/, arm: /手/, face: /表情/, body: /身|手,要站着/, stance: /身|手,要站着/, tail: /尾巴/, ears: /耳朵/, wings: /翅膀/ };
    const parts = (vocab: readonly VocabWord[]) => (['tail', 'ears', 'wings'] as Channel[]).filter((c) => vocab.some((w) => CHANNELS[w.id]?.length === 1 && CHANNELS[w.id][0] === c));
    for (const id of ['coo', 'whale', 'gpt-chan', 'gemini-chan', 'grok-chan']) {
      const vocab = figurePacks([]).packs.find((p) => p.id === id)!.manifest.vocab, t = vocabTable(vocab), has = parts(vocab);
      for (const v of vocab.filter((w) => w.kind === 'motion')) {
        const said = `${groupOf(v.id, t)} ${row(v.id, t).split(':')[0]}`;
        for (const c of channelsOf(v).filter((x) => !['tail', 'ears', 'wings'].includes(x) || has.includes(x))) expect(said, `${id} ${v.id} ${c}`).toMatch(shown[c]);
      }
    }
    expect(parts(VOCAB)).toEqual([]);
    // a pack's own motion takes the whole body
    const own: VocabWord[] = [{ id: 'beep', kind: 'motion', names: { zh: ['哔哔'] }, about: { zh: '哔一声' }, seconds: 1 }];
    expect(vocabTable(own)).toContain('身:\n- beep 哔哔(也占手、头):哔一声');
  });

  it('groups the expressions by mood, a composite next to its plain face, a pack\'s own last', () => {
    expect(vocabTable(VOCAB)).toContain('表情,按心情分组:');
    // each mood's label but 其他 says when its faces fit
    expect(groupOf('happy')).toBe('开心(好消息)');
    expect(groupOf('lol')).toBe('开心(好消息)');
    expect(groupOf('smirk')).toBe('调皮、得意(逗人、显摆)');
    expect(groupOf('sulk')).toBe('难过(坏消息、陪对方难过、安慰对方)');
    expect(groupOf('huff')).toBe('生气、嫌弃(被惹、被吐槽)');
    expect(groupOf('petrify')).toBe('惊讶、紧张(意外、替对方担心)');
    expect(groupOf('neutral')).toBe('其他');
    // the faces with a mark of their own go by their mood, next to the face they are made of
    expect(['celebrate', 'heartbroken', 'gloomy', 'fuming', 'speechless', 'starry'].map((id) => groupOf(id))).toEqual([
      '开心(好消息)', '难过(坏消息、陪对方难过、安慰对方)', '难过(坏消息、陪对方难过、安慰对方)', '生气、嫌弃(被惹、被吐槽)', '生气、嫌弃(被惹、被吐槽)', '惊讶、紧张(意外、替对方担心)']);
    const t = vocabTable(VOCAB);
    expect(t.indexOf('- angry ')).toBeLessThan(t.indexOf('- fuming '));
    expect(t.indexOf('- fuming ')).toBeLessThan(t.indexOf('- huff '));
    expect(t.indexOf('- sad ')).toBeLessThan(t.indexOf('- sulk '));
    // comfort (安慰) right after sad: the face for comforting someone sad, beside the sad faces (not gentle's soft smile)
    expect(groupOf('comfort')).toBe('难过(坏消息、陪对方难过、安慰对方)');
    expect(t.indexOf('- sad ')).toBeLessThan(t.indexOf('- comfort '));
    expect(t.indexOf('- comfort ')).toBeLessThan(t.indexOf('- sulk '));
    expect(t.indexOf('- sulk ')).toBeLessThan(t.indexOf('- angry '));
    // expr2's faces beside their neighbours: 流口水 after 馋, 翻白眼 after 嫌弃, 死鱼眼 after 呵呵, 震惊 right after 惊讶
    expect(['drool', 'eyeroll', 'deadpan', 'shocked'].map((id) => groupOf(id))).toEqual([
      '开心(好消息)', '生气、嫌弃(被惹、被吐槽)', '生气、嫌弃(被惹、被吐槽)', '惊讶、紧张(意外、替对方担心)']);
    for (const [a, b] of [['crave', 'drool'], ['disgusted', 'eyeroll'], ['eyeroll', 'meh'], ['meh', 'deadpan'], ['deadpan', 'speechless'], ['surprised', 'shocked'], ['shocked', 'blank']]) {
      expect(t.indexOf(`- ${a} `), `${a} < ${b}`).toBeLessThan(t.indexOf(`- ${b} `));
    }
    const own: VocabWord[] = [...VOCAB, { id: 'beep', kind: 'expression', names: { zh: ['哔哔脸'] }, about: { zh: '屏幕一闪' }, seconds: 1 }];
    expect(groupOf('beep', vocabTable(own))).toBe('其他');
  });

  it('opens with an example made of the figure\'s own words: a composite face, head words and a gesture, else plain words', () => {
    expect(vocabTable(VOCAB).split('\n')[0]).toBe('例:`【瘪嘴+摇头】又没抢到票……<叹气>【跃跃欲试+点头】下次我帮你盯着!<比耶>`');
    const plain = VOCAB.filter((v) => !['sulk', 'eager', 'sigh', 'vsign'].includes(v.id));
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

  it('knows the words the bot wrote that the vocabulary used to drop, by every figure, as the word they mean', () => {
    const MEANT: Record<string, string> = {
      挥手: 'wave', 摆手: 'wave', 兴奋: 'excited', 眼睛亮: 'excited', 打哈欠: 'sleepy', 揉眼: 'sleepy', 打盹: 'sleepy', 微笑: 'gentle',
      心疼: 'worried', 站起来: 'stand', 偷偷抬眼: 'shy', 移开视线: 'shy', 握拳: 'determined', 轻轻点头: 'nod', 抖抖: 'shiver',
      歪头: 'tilt', 歪脑袋: 'tilt', 偏头: 'tilt', 好奇: 'tilt',
    };
    for (const p of figurePacks([]).packs) {
      // (握拳 is the girls' and the whale's fist of their own, 加油, now; Coo, with no fist drawn, keeps it for 认真)
      for (const [name, id] of Object.entries({ ...MEANT, 握拳: p.id === 'coo' ? 'determined' : 'fist' })) expect(vocabId(name, p.manifest.vocab), `${p.id} ${name}`).toBe(id);
      // (拍手 is the clap drawn for the girls and the whale; Coo, with no hands, still has no word for it)
      expect(vocabId('拍手', p.manifest.vocab), p.id).toBe(p.id === 'coo' ? null : 'clap');
      // (still none for these: no word of hers means them)
      for (const name of ['盖被子', '被戳', '转头']) expect(vocabId(name, p.manifest.vocab), `${p.id} ${name}`).toBe(null);
    }
    // the evals' own lines
    expect(parseScript('【温柔+歪头】唱完啦。').beats[0].actions).toEqual(['tilt+gentle']);
    expect(parseScript('【心疼+挥手】').beats[0].actions).toEqual(['wave+worried']);
    expect(parseScript('【好奇+探头】蛋糕摆哪儿了呀?').beats[0].actions).toEqual(['peek+tilt']);
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

  it('a tail, ears and wings are parts of their own: their words go with the head\'s, the arms\' and a face, and with each other\'s, not two of one part', () => {
    const pack = (id: string) => figurePacks([]).packs.find((p) => p.id === id)!.manifest.vocab;
    const gemini = pack('gemini-chan'), gpt = pack('gpt-chan'), grok = pack('grok-chan'), whale = pack('whale');
    expect(actionsIn(['摇尾巴+竖耳朵+点头+招手+开心'], gemini)).toEqual({ actions: ['wave+wag+earsup+nod+happy'], dropped: [], notes: [] });
    expect(actionsIn(['扇翅膀+摇尾巴+坐下'], gpt).actions).toEqual(['sit+wingbeat+wag']);
    expect(actionsIn(['竖耳朵+耳朵耷拉'], gemini)).toEqual({ actions: ['earsup', 'earsdown'], dropped: [], notes: ['竖耳朵 和 耳朵耷拉 不能同时做,改成先后做。'] });
    // asleep nothing else shows, stone goes with nothing
    expect(actionsIn(['睡觉+摇尾巴'], whale).actions).toEqual(['sleep', 'wag']);
    expect(actionsIn(['石化+抖耳朵'], gemini).actions).toEqual(['petrify', 'earflick']);
    // only a figure with the part knows its words
    expect(actionsIn(['摇尾巴', '扇翅膀'], VOCAB).dropped).toEqual(['摇尾巴', '扇翅膀']);
    expect(actionsIn(['竖耳朵'], gpt).dropped).toEqual(['竖耳朵']);
    // Grok-chan's little bat wings are her one part: a wingbeat goes with the rest, a tail's or ears' word is not hers
    expect(actionsIn(['扇翅膀+点头+招手+开心'], grok)).toEqual({ actions: ['wave+wingbeat+nod+happy'], dropped: [], notes: [] });
    expect(actionsIn(['摇尾巴', '竖耳朵', '抖耳朵'], grok).dropped).toEqual(['摇尾巴', '竖耳朵', '抖耳朵']);
    // the prompt lists them under the parts the figure has, and a whole-body word says it takes them too
    const t = vocabTable(gemini);
    expect(t).toContain('尾巴、耳朵(各算一个部位):\n- wag 摇尾巴/甩尾巴/摆尾巴:');
    expect(t).toMatch(/- sleep [^:]*\(也占手、头、表情、尾巴、耳朵\):/);
    expect(vocabTable(gpt)).toContain('尾巴、翅膀(各算一个部位):\n- wag ');
    expect(vocabTable(grok)).toContain('翅膀(单独算一个部位):\n- wingbeat ');
    expect(vocabTable(grok)).toMatch(/- sleep [^:]*\(也占手、头、表情、翅膀\):/);
    expect(vocabTable(whale)).toContain('尾巴(单独算一个部位):\n- wag ');
    expect(vocabTable(whale)).toMatch(/- sleep [^:]*\(也占手、头、表情、尾巴\):/);
    expect(vocabTable(VOCAB)).not.toMatch(/尾巴|耳朵|翅膀/);
    expect(clashes(gemini.find((v) => v.id === 'wag')!, gemini.find((v) => v.id === 'earflick')!)).toBe(false);
  });

  it('groups words joined by a plus, full-width or with spaces around it, body first and face last', () => {
    expect(parseScript('【开心+招手】你好').beats[0]).toEqual({ actions: ['wave+happy'], text: '你好', anchors: [] });
    for (const s of ['【开心 + 招手】', '【开心＋招手】', '【开心 ＋ 招手】', '【招手+开心】']) expect(blocking(s), s).toEqual(['wave+happy']);
    expect(parseScript('好<点头 ＋ 眨眼>呀').beats[0].anchors).toEqual([{ at: 1, actions: ['nod+wink'] }]);
    // a tilt of the head goes with a gesture of the arms and a face, not with another head gesture
    expect(blocking('【歪头+招手+开心】')).toEqual(['wave+tilt+happy']);
    expect(parseScript('【歪头+点头】').notes).toEqual(['歪头 和 点头 不能同时做,改成先后做。']);
    expect(blocking('【歪头+点头】')).toEqual(['tilt', 'nod']);
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
    expect(t).toContain('\n\n表情对(写在同一组里会合成一张脸,先写哪个都行;如【开心+惊讶】是惊讶的眼睛配开心的嘴):开心+惊讶\n别的两个表情同组仍先后做。\n\n动作,按部位分组:');
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
    expect(para.split('\n').at(-1)).toBe('别的两个表情同组仍先后做。');
    expect(lines[0]).toMatch(/^- 开心\+难过\/嘟嘴\/惊讶\//);
    expect(lines).toContain('- 眨眼+嘟嘴/尴尬');
    // every composed pair once: the partners listed add up to them; the pairs shown as a word are in the list above
    expect(lines.reduce((n, l) => n + l.split('+')[1]!.split('/').length, 0)).toBe(composed);
    expect(para).not.toContain('=');
    expect(t).toContain('- bashful 腼腆/不好意思(=开心+害羞):');
    expect(t).toContain('- lol 哈哈/笑出声/乐坏了(=开心+慌张):');
    // a handful of composed pairs stays on one line
    const few = Object.fromEntries(Object.entries(many).filter(([, p]) => !('as' in p)).slice(0, 12));
    expect(vocabTable(VOCAB, 'zh', few)).toMatch(/的嘴\):[^\n]+\n别的两个表情同组仍先后做。\n\n动作/);
  });

  it('keys a pair the same whichever is first', () => {
    expect(pairKey('surprised', 'happy')).toBe('happy~surprised');
    expect(pairKey('happy', 'surprised')).toBe('happy~surprised');
  });
});

describe('kneeling for a figure that draws arm gestures kneeling (keepsArms)', () => {
  // Claude-chan's words: her `kneel` says keepsArms (the kit's figure.kneelArms)
  const GIRL = figurePacks([]).packs.find((p) => p.id === 'claude-chan')!.manifest.vocab;
  const kneel = GIRL.find((v) => v.id === 'kneel')!;
  const cooKneel = VOCAB.find((v) => v.id === 'kneel')!;
  const girlScript = (s: string) => scriptIn(s, GIRL);
  const row = (id: string, vocab: readonly VocabWord[]) => vocabTable(vocab).split('\n').find((l) => l.startsWith(`- ${id} `))!;

  it('frees the arm from kneeling with the flag, and keeps the static table for Coo and other packs', () => {
    expect(kneel.keepsArms).toBe(true);
    expect(cooKneel.keepsArms).toBeUndefined();
    expect(channelsOf(kneel)).toEqual(['body', 'stance']);
    expect(channelsOf(cooKneel)).toEqual(['body', 'arm']);
    expect(CHANNELS.kneel).toContain('arm');
  });

  it('does a kneel and an arm gesture as one group, body first, with no note', () => {
    for (const s of ['【跪坐+招手】', '【招手+跪坐】']) {
      const got = girlScript(s);
      expect(got.beats[0].actions, s).toEqual(['kneel+wave']);
      expect(got.notes, s).toEqual([]);
    }
    expect(actionsIn(['跪坐+比心'], GIRL)).toEqual({ actions: ['kneel+heart'], dropped: [], notes: [] });
    // Coo (no flag) still splits them
    expect(parseScript('【跪坐+招手】').notes).toEqual(['跪坐 和 招手 不能同时做,改成先后做。']);
  });

  it('does her faces\' arm poses as arm words: with a face, a head gesture or a kneel in one group, one after another with another arm word', () => {
    const WHALE = figurePacks([]).packs.find((p) => p.id === 'whale')!.manifest.vocab;
    for (const id of ['muse', 'fist', 'jot', 'twiddle']) expect(CHANNELS[id], id).toEqual(['arm']);
    for (const [s, want] of [['【开心+托腮】', 'muse+happy'], ['【难过+对手指】', 'twiddle+sad'], ['【期待+加油】', 'fist+excited'],
      ['【认真+记笔记+点头】', 'jot+nod+determined'], ['【跪坐+记笔记】', 'kneel+jot'], ['【跪坐+琢磨+歪头】', 'kneel+muse+tilt']] as const) {
      const got = girlScript(s);
      expect(got.beats[0].actions, s).toEqual([want]);
      expect(got.notes, s).toEqual([]);
    }
    expect(girlScript('【加油+招手】').beats[0].actions).toEqual(['fist', 'wave']);
    // the table puts them with the arm words; the whale has them all (her fist, notebook and fingertips drawn for her), Coo none of them
    const arms = vocabTable(GIRL).split('\n手:\n')[1]!.split('\n手,')[0]!;
    for (const id of ['muse', 'fist', 'jot', 'twiddle']) expect(arms, id).toContain(`\n- ${id} `);
    expect(row('fist', GIRL)).toBe('- fist 加油/握拳/打气/握拳加油:举起小拳头给你加油,另一只手还抱着书,配当时的表情');
    expect(row('muse', WHALE)).toBe('- muse 托腮/撑下巴/托下巴/琢磨:远侧的手托着腮琢磨,配当时的表情');
    expect(scriptIn('【开心+托腮】', WHALE).beats[0].actions).toEqual(['muse+happy']);
    expect(row('fist', WHALE)).toBe('- fist 加油/握拳/打气/握拳加油:举起小拳头给你加油,配当时的表情');
    for (const id of ['muse', 'fist', 'jot', 'twiddle']) expect(vocabTable(WHALE).split('\n手:\n')[1]!.split('\n手,')[0]!, `whale ${id}`).toContain(`\n- ${id} `);
    expect(scriptIn('【加油】', WHALE).beats[0].actions).toEqual(['fist']);
    expect(scriptIn('【跪坐+记笔记】', WHALE).beats[0].actions).toEqual(['kneel+jot']);
    expect(scriptIn('【难过+对手指】', WHALE).beats[0].actions).toEqual(['twiddle+sad']);
    expect(parseScript('【托腮】').dropped).toEqual(['托腮']);
  });

  it('does the head\'s and body\'s moves of batch B: 低头 and 眨眨眼 with an arm gesture, a face or a kneel; 凑近, 后仰, 晃来晃去 and 跺脚 standing or seated still', () => {
    const WHALE = figurePacks([]).packs.find((p) => p.id === 'whale')!.manifest.vocab;
    for (const id of ['droop', 'blink']) expect(CHANNELS[id], id).toEqual(['head']);
    for (const id of ['closer', 'leanback', 'sway']) expect(CHANNELS[id], id).toEqual(['arm', 'stance']);
    expect(CHANNELS.stamp).toEqual(CHANNELS.curtsy);
    for (const [s, want] of [['【难过+低头】', 'droop+sad'], ['【惊讶+眨眨眼】', 'blink+surprised'], ['【对手指+低头+害羞】', 'twiddle+droop+shy'],
      ['【跪坐+低头】', 'kneel+droop'], ['【跪坐+记笔记+眨眨眼】', 'kneel+jot+blink'], ['【凑近+好奇】', 'closer+tilt'], ['【哈哈+后仰】', 'leanback+lol'],
      ['【开心+晃来晃去+眨眨眼】', 'sway+blink+happy'], ['【生气+跺脚】', 'stamp+angry'], ['【坐下, 凑近】', null]] as const) {
      const got = girlScript(s);
      if (want) expect(got.beats[0].actions, s).toEqual([want]);
      expect(got.notes, s).toEqual([]);
    }
    expect(girlScript('【坐下, 凑近】').beats[0].actions).toEqual(['sit', 'closer']);
    // two head gestures, or two of the body's, one after another; a kneel ends for a move of the body (back to sitting)
    expect(girlScript('【低头+点头】').notes).toEqual(['低头 和 点头 不能同时做,改成先后做。']);
    expect(girlScript('【凑近+招手】').beats[0].actions).toEqual(['closer', 'wave']);
    expect(girlScript('【跪坐+凑近】').notes).toEqual(['跪坐 和 凑近 不能同时做,改成先后做。']);
    expect(girlScript('【走走+跺脚】').beats[0].actions).toEqual(['walk', 'stamp']);
    // the prompt's groups: 头 for the head's, 「手,要站着或坐着不动」 for leaning and swaying, 身 for the stamp (she stands)
    const groupIn = (id: string, vocab: readonly VocabWord[]) => {
      let head = '';
      for (const l of vocabTable(vocab).split('\n')) {
        if (l.startsWith(`- ${id} `)) return head;
        if (l && !l.startsWith('- ') && l.endsWith(':')) head = l.slice(0, -1);
      }
      return null;
    };
    for (const v of [GIRL, WHALE]) {
      for (const id of ['droop', 'blink']) expect(groupIn(id, v), id).toBe('头');
      for (const id of ['closer', 'leanback', 'sway']) expect(groupIn(id, v), id).toBe('手,要站着或坐着不动(不和走、跑、跳这类移动同组,坐下可以)');
      expect(groupIn('stamp', v)).toBe('身');
      expect(row('stamp', v)).toMatch(/^- stamp 跺脚\/跺跺脚\/直跺脚\(也占手\):/);
    }
    expect(row('droop', GIRL)).toBe('- droop 低头/垂头/低下头:把头低下去看着下面,停一会儿再抬起来,配当时的表情');
    // the dance keeps 摇摆; Coo has none of them
    expect(vocabId('摇摆', GIRL)).toBe('dance');
    expect(vocabId('摇头晃脑', GIRL)).toBe('sway');
    expect(parseScript('【低头】').dropped).toEqual(['低头']);
  });

  it('knows a fast nod and a hard shake as the nod and the shake, on every figure', () => {
    for (const p of figurePacks([]).packs) {
      for (const n of ['连连点头', '猛点头', '使劲点头']) expect(vocabId(n, p.manifest.vocab), `${p.id} ${n}`).toBe('nod');
      for (const n of ['使劲摇头', '拼命摇头', '猛摇头']) expect(vocabId(n, p.manifest.vocab), `${p.id} ${n}`).toBe('shake');
    }
  });

  it('does the arm words drawn anew (拍手, 摊手, 抱头, 举手, 点赞, 嘘, 擦汗) as arm words: with a face, a head gesture or a kneel in one group, one after another with another arm word', () => {
    const NEW_ARMS = ['clap', 'shrug', 'headhold', 'raise', 'thumbs', 'shush', 'wipe'];
    const WHALE = figurePacks([]).packs.find((p) => p.id === 'whale')!.manifest.vocab;
    for (const id of NEW_ARMS) expect(CHANNELS[id], id).toEqual(['arm']);
    for (const [s, want] of [['【开心+拍手】', 'clap+happy'], ['【无奈+摊手】', 'shrug+sigh'], ['【抱头+摇头】', 'headhold+shake'], ['【举手】', 'raise'],
      ['【点赞+点头】', 'thumbs+nod'], ['【跪坐+嘘】', 'kneel+shush'], ['【害羞+擦汗】', 'wipe+shy'], ['【跪坐+鼓掌+歪头】', 'kneel+clap+tilt']] as const) {
      const got = girlScript(s);
      expect(got.beats[0].actions, s).toEqual([want]);
      expect(got.notes, s).toEqual([]);
      expect(scriptIn(s, WHALE).beats[0].actions, `whale ${s}`).toEqual([want]);
    }
    // two arm words cannot go together: one after the other
    expect(girlScript('【拍手+招手】').beats[0].actions).toEqual(['clap', 'wave']);
    expect(girlScript('【拍手+招手】').notes).toEqual(['拍手 和 招手 不能同时做,改成先后做。']);
    // the table puts them with the arm words; Coo has none of them
    const arms = vocabTable(GIRL).split('\n手:\n')[1]!.split('\n手,')[0]!;
    for (const id of NEW_ARMS) expect(arms, id).toContain(`\n- ${id} `);
    expect(row('thumbs', GIRL)).toBe('- thumbs 点赞/竖大拇指/真棒/厉害/给你点赞:在胸前竖起大拇指,另一只手还抱着书,笑着给你点赞');
    expect(row('clap', WHALE)).toBe('- clap 拍手/鼓掌/拍拍手/啪啪啪:在胸前啪啪地拍手,开开心心的');
    expect(parseScript('【拍手】').dropped).toEqual(['拍手']);
  });

  it('still splits a kneel from gestures that need her standing or seated still, and from a turn', () => {
    const cheer = girlScript('【跪坐+欢呼】');
    expect(cheer.beats[0].actions).toEqual(['kneel', 'cheer']);
    expect(cheer.notes).toEqual(['跪坐 和 欢呼 不能同时做,改成先后做。']);
    expect(girlScript('【跪坐+转身】').beats[0].actions).toEqual(['kneel', 'turn']);
    expect(girlScript('【跪坐+点头+开心】').beats[0].actions).toEqual(['kneel+nod+happy']);
  });

  it('does a kneel and a song as one group (the kit keeps the kneel through a song), and only with the flag', () => {
    // (both take her stance, so they go as written; the kit does either order: pet-actions.test.js)
    for (const [s, want] of [['【跪坐+唱歌】', 'kneel+song'], ['【唱歌+跪坐】', 'song+kneel']]) {
      const got = girlScript(s);
      expect(got.beats[0].actions, s).toEqual([want]);
      expect(got.notes, s).toEqual([]);
    }
    expect(clashes(kneel, GIRL.find((v) => v.id === 'song')!)).toBe(false);
    expect(clashes(kneel, GIRL.find((v) => v.id === 'cheer')!)).toBe(true);
    // a song still splits from a walk, and Coo's kneel (no flag) from a song
    expect(girlScript('【走走+唱歌】').beats[0].actions).toEqual(['walk', 'song']);
    expect(parseScript('【跪坐+唱歌】').beats[0].actions).toEqual(['kneel', 'song']);
  });

  it('says how long the kneel lasts by the flag, in the vocabulary table and the note', () => {
    expect(lastingNote(kneel)).toBe('保持到下一个全身动作,然后变回普通坐着;换表情、点头、摇头、叹气、歪头、低头、眨眨眼、尾巴、耳朵、翅膀的动作、只占「手」的手势和唱歌都不影响(她跪着做);「手,要站着或坐着不动」那组别的动作会让她变回普通坐着');
    expect(lastingNote(cooKneel)).toBe('保持到下一个手或全身动作,然后变回普通坐着;换表情、点头、摇头、叹气、歪头、低头、眨眨眼、尾巴、耳朵、翅膀的动作不影响');
    expect(row('kneel', GIRL)).toContain(lastingNote(kneel, GIRL));
    expect(row('kneel', GIRL)).not.toContain('也占手');
    expect(row('kneel', VOCAB)).toMatch(/\(也占手\):/);
  });

  it('names in the kneel\'s note only the head gestures the figure has', () => {
    // (a pack with a kneel and a nod but no shake, sigh or tilt)
    const pack: VocabWord[] = [
      { id: 'happy', kind: 'expression', names: { zh: ['开心'] }, about: { zh: '笑' }, seconds: 1 },
      { id: 'nod', kind: 'motion', names: { zh: ['点头'] }, about: { zh: '点头' }, seconds: 1 },
      { id: 'kneel', kind: 'motion', names: { zh: ['跪坐'] }, about: { zh: '跪坐' }, seconds: 1, lasting: true },
    ] as VocabWord[];
    const note = lastingNote(pack[2], pack);
    expect(note).toBe('保持到下一个手或全身动作,然后变回普通坐着;换表情、点头不影响');
    expect(row('kneel', pack)).toContain(note);
    expect(lastingNote({ ...pack[2], keepsArms: true }, pack.filter((v) => v.id !== 'nod'))).toMatch(/;换表情、只占「手」的手势和唱歌都不影响/);
    // (the girls have all six; Coo has no 低头 or 眨眨眼, so hers names the four she has; of a tail, ears and wings, only
    // the parts a figure has: Claude-chan none, Gemini-chan a tail and ears, GPT-chan a tail and wings, Grok-chan wings,
    // the whale a tail)
    const of = (id: string) => figurePacks([]).packs.find((p) => p.id === id)!.manifest.vocab;
    expect(lastingNote(kneel, GIRL)).toBe(lastingNote(kneel).replace('尾巴、耳朵、翅膀的动作、', ''));
    expect(lastingNote(kneel, of('gemini-chan'))).toContain('眨眨眼、尾巴、耳朵的动作、只占「手」');
    expect(lastingNote(kneel, of('gpt-chan'))).toContain('眨眨眼、尾巴、翅膀的动作、只占「手」');
    expect(lastingNote(kneel, of('grok-chan'))).toContain('眨眨眼、翅膀的动作、只占「手」');
    expect(lastingNote(of('whale').find((v) => v.id === 'kneel')!, of('whale'))).toContain('眨眨眼、尾巴的动作、只占「手」');
    expect(lastingNote(cooKneel, VOCAB)).toBe('保持到下一个手或全身动作,然后变回普通坐着;换表情、点头、摇头、叹气、歪头不影响');
  });
});

describe('kneeling for a figure that leans kneeling (keepsLeans)', () => {
  // the whale's words: her `kneel` says keepsArms and keepsLeans (the kit's figure.kneelArms and figure.kneelLeans)
  const WHALE = figurePacks([]).packs.find((p) => p.id === 'whale')!.manifest.vocab;
  const GIRL = figurePacks([]).packs.find((p) => p.id === 'claude-chan')!.manifest.vocab;
  const word = (v: readonly VocabWord[], id: string) => v.find((w) => w.id === id)!;

  it('does a kneel and a lean as one group for her, and still splits them for the girls', () => {
    expect(word(WHALE, 'kneel').keepsLeans).toBe(true);
    expect(word(GIRL, 'kneel').keepsLeans).toBeUndefined();
    for (const id of ['closer', 'leanback', 'sway']) {
      expect(clashes(word(WHALE, 'kneel'), word(WHALE, id)), id).toBe(false);
      expect(clashes(word(WHALE, id), word(WHALE, 'kneel')), id).toBe(false);
      expect(clashes(word(GIRL, 'kneel'), word(GIRL, id)), id).toBe(true);
    }
    // the other gestures that need her still still end it (a bow, a cheer), and a stamp stands her up
    for (const id of ['bow', 'cheer', 'stamp']) expect(clashes(word(WHALE, 'kneel'), word(WHALE, id)), id).toBe(true);
    const got = scriptIn('【跪坐+凑近】', WHALE);
    expect(got.beats[0].actions).toEqual(['kneel+closer']);
    expect(got.notes).toEqual([]);
    expect(scriptIn('【跪坐+凑近】', GIRL).beats[0].actions).not.toEqual(['kneel+closer']);
  });

  it('says in the kneel note that the leans keep it, for her only (the girls\' note is unchanged)', () => {
    expect(lastingNote(word(WHALE, 'kneel'), WHALE)).toBe('保持到下一个全身动作,然后变回普通坐着;换表情、点头、摇头、叹气、歪头、低头、眨眨眼、尾巴的动作、只占「手」的手势、唱歌和凑近、后仰、晃来晃去都不影响(她跪着做);「手,要站着或坐着不动」那组别的动作会让她变回普通坐着');
    expect(lastingNote(word(GIRL, 'kneel'), GIRL)).toBe('保持到下一个全身动作,然后变回普通坐着;换表情、点头、摇头、叹气、歪头、低头、眨眨眼、只占「手」的手势和唱歌都不影响(她跪着做);「手,要站着或坐着不动」那组别的动作会让她变回普通坐着');
  });
});

describe('partsNote (the decider prompt\'s {{pet.parts}})', () => {
  const vocabOf = (id: string) => figurePacks([]).packs.find((p) => p.id === id)!.manifest.vocab;
  it('names the tail, ears and wings words a figure has, and the tail or wings it has none of (never ears)', () => {
    expect(partsNote(vocabOf('gpt-chan'))).toBe(',还会摇尾巴、扇翅膀');
    expect(partsNote(vocabOf('gemini-chan'))).toBe(',还会摇尾巴、抖耳朵、竖耳朵、耳朵耷拉(没有翅膀)');
    expect(partsNote(vocabOf('grok-chan'))).toBe(',还会扇翅膀(没有尾巴)');
    expect(partsNote(vocabOf('whale'))).toBe(',还会摇尾巴(没有翅膀)');
    expect(partsNote(vocabOf('claude-chan'))).toBe('(没有尾巴、翅膀)');
    expect(partsNote(vocabOf('coo'))).toBe('(没有尾巴、翅膀)');
    // only the words the body on screen does (a page that does not know wingbeat)
    expect(partsNote(vocabOf('gpt-chan').filter((w) => w.id !== 'wingbeat'))).toBe(',还会摇尾巴(没有翅膀)');
    // a third-party pack may draw a tail it has no word for: told only what it moves
    expect(partsNote(vocabOf('grok-chan'), false)).toBe(',还会扇翅膀');
    expect(partsNote(vocabOf('claude-chan'), false)).toBe('');
  });
});
