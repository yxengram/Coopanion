import { describe, expect, it } from 'vitest';
import { afterBubbles, dropActs, leftActs, takeDeferred, walkHold } from '../packages/cortico-world-desktop-pet/web/body-host.js';
import { attachSayActs } from '../packages/cortico-world-desktop-pet/web/acts.js';

const say = (id, ...beats) => ({ kind: 'say', id, beats: beats.map(([text, actions = [], anchors = []]) => ({ text, actions, anchors })), i: -1 });
const ask = (id) => ({ kind: 'ask', id, question: '去哪?', options: ['左', '右'] });

/**
 * The words a queue does, in order, as pet-app.js does them: each bubble in turn, a beat's own words before its
 * typing, its inline markers as the typing reaches them (a beat with no text: as it starts), a question's words
 * as it is shown.
 */
function played(items) {
  const out = [];
  for (const it of items) {
    if (it.kind === 'ask') { out.push(...dropActs(it)); continue; }
    for (const b of it.beats) {
      out.push(...b.actions);
      const anchors = [...(b.anchors || [])];
      if (!b.text) { for (const a of anchors) out.push(...a.actions); continue; }
      let fired = 0;
      for (let shown = 1; shown <= b.text.length; shown++) while (fired < anchors.length && anchors[fired].at <= shown) out.push(...anchors[fired++].actions);
    }
  }
  return out;
}

describe("a pet_act among the bubbles (web/body-host.js afterBubbles)", () => {
  it('two pet_say then a pet_act: the act comes after the second bubble\'s marks, not before them', () => {
    const queue = [say('s1', ['你好', ['wave']]), say('s2', ['我来啦', ['happy'], [{ at: 1, actions: ['nod'] }]])];
    expect(afterBubbles(queue, null, ['jump'])).toBe('attached');
    expect(played(queue)).toEqual(['wave', 'happy', 'nod', 'jump']);
  });

  it('several acts keep the order they were sent in, after a trailing marker of the bubble itself', () => {
    const queue = [say('s1', ['好的', [], [{ at: 2, actions: ['bow'] }]])];
    afterBubbles(queue, null, ['sit']);
    afterBubbles(queue, null, ['happy+wave']);
    expect(played(queue)).toEqual(['bow', 'sit', 'happy+wave']);
  });

  it('a bubble on screen: attached while it still types, at once once its last beat is typed out', () => {
    const cur = say('s1', ['一', ['wave']], ['二']);
    cur.i = 0;
    expect(afterBubbles([], cur, ['nod'])).toBe('attached');
    expect(cur.beats[1].anchors.at(-1)).toEqual({ at: 1, actions: ['nod'], deferred: true });
    const done = say('s2', ['一'], ['二']);
    done.i = 1; done.beatDone = true;
    expect(afterBubbles([], done, ['nod'])).toBe('now');
    expect(done.beats[1].anchors).toEqual([]);
  });

  it('a last beat with no text does the act as the beat starts', () => {
    const queue = [say('s1', ['嗯'], ['', ['sit']])];
    afterBubbles(queue, null, ['sleep']);
    expect(played(queue)).toEqual(['sit', 'sleep']);
  });

  it('no bubble to come, or only an app dialog step or a question already up: at once, as before', () => {
    expect(afterBubbles([], null, ['nod'])).toBe('now');
    expect(afterBubbles([{ kind: 'dialog', id: 'd1', d: {} }], null, ['nod'])).toBe('now');
    const up = ask('a1');
    expect(afterBubbles([], up, ['nod'])).toBe('now');
    expect(afterBubbles([say('s1', ['x'])], null, [])).toBe('now');
  });

  it('a question still queued takes the act (pet_ask\'s words), and gives it back if it leaves unshown', () => {
    const s = say('s1', ['先说一句', ['wave']]), q = ask('a1');
    expect(afterBubbles([s, q], null, ['tilt'])).toBe('attached');
    expect(q.acts).toEqual(['tilt']);
    expect(s.beats[0].anchors).toEqual([]);
    expect(played([s, q])).toEqual(['wave', 'tilt']);
    const q2 = ask('a2');
    afterBubbles([q2], null, ['nod']);
    expect(dropActs(q2)).toEqual(['nod']);
    expect(dropActs(q2)).toEqual([]);
  });

  it('decider mode: pet_say waiting for its words, then pet_feel, then the say\'s words: the bubble\'s words first', () => {
    const queue = [];
    queue.push({ ...say('s1', ['真开心']), pending: true, holdMs: 900 });
    // pet_feel's words come while the bubble still waits for its own
    expect(afterBubbles(queue, null, ['jump'])).toBe('attached');
    expect(attachSayActs(queue, null, 's1', ['happy+wave'])).toBe('queued');
    expect(queue[0].pending).toBe(false);
    expect(played(queue)).toEqual(['happy+wave', 'jump']);
  });

  it('a say cut short (the typing box opened over it) gives back the words that waited on it, not its own marks', () => {
    const cur = say('s1', ['一二三', [], [{ at: 1, actions: ['nod'] }, { at: 3, actions: ['bow'] }]], ['四五', [], [{ at: 2, actions: ['wave'] }]]);
    cur.i = 0; cur.fired = 1;
    afterBubbles([], cur, ['sit']);
    afterBubbles([], cur, ['sleep']);
    expect(leftActs(cur)).toEqual(['sit', 'sleep']);
    // taken off: a say that went on anyway does not do them twice
    expect(leftActs(cur)).toEqual([]);
    expect(cur.beats[1].anchors).toEqual([{ at: 2, actions: ['wave'] }]);
  });

  it('a say cut short on its last beat: the act not reached yet comes back, one already done does not', () => {
    const cur = say('s1', ['嗯'], ['好的呀']);
    afterBubbles([], cur, ['sit']);
    cur.i = 1; cur.fired = 0;
    expect(leftActs(cur)).toEqual(['sit']);
    const done = say('s2', ['好的呀']);
    afterBubbles([], done, ['sit']);
    done.i = 0; done.fired = 1;
    expect(leftActs(done)).toEqual([]);
    const typed = say('s3', ['好']);
    afterBubbles([], typed, ['sit']);
    typed.i = 0; typed.beatDone = true;
    expect(leftActs(typed)).toEqual([]);
    expect(leftActs({ kind: 'input' })).toEqual([]);
    expect(leftActs(null)).toEqual([]);
  });

  it('a World walk sent after a pet_act takes the waiting words first: 坐下 then walk, not 坐下 in the middle of it', () => {
    const cur = say('s1', ['我过去啦']);
    cur.i = 0; cur.fired = 0;
    const queue = [say('s2', ['等等我', [], [{ at: 1, actions: ['nod'] }]]), ask('a1')];
    afterBubbles(queue, cur, ['sit']);
    expect(queue[1].acts).toEqual(['sit']);
    // one more, to a say queued after the question
    queue.push(say('s3', ['走']));
    afterBubbles(queue, cur, ['happy']);
    expect(takeDeferred(queue, cur)).toEqual(['sit', 'happy']);
    expect(takeDeferred(queue, cur)).toEqual([]);
    expect(played(queue)).toEqual(['nod']);
  });

  it('the walk waits for the queued words: until the queue is empty and the last one has had its time, at most maxS', () => {
    // three words queued when the walk came
    const h = walkHold(10, 6);
    expect(h.due(10, 3)).toBe(false);
    h.started(1, 10.1);
    h.started(2, 11.1);
    expect(h.due(12, 1)).toBe(false);
    h.started(2, 13.1);
    // the queue is empty, the last word still going
    expect(h.due(15, 0)).toBe(false);
    expect(h.due(15.1, 0)).toBe(true);
    // a word sent while the walk waits keeps it waiting (the queue is not empty), a short one ending early does not end it
    const more = walkHold(10, 6);
    more.started(3, 10);
    more.started(.5, 10.5);
    expect(more.due(13, 1)).toBe(false);
    expect(more.due(13, 0)).toBe(true);
    // a body carried meanwhile starts no word: the walk goes anyway
    const stuck = walkHold(10, 6);
    expect(stuck.due(15.9, 1)).toBe(false);
    expect(stuck.due(16, 1)).toBe(true);
  });
});
