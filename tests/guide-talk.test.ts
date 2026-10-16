import { describe, expect, it } from 'vitest';
import { talkStep } from '../core/guide.ts';

describe('talkStep', () => {
  const why = '没有「输入监控」权限,在系统设置里允许 Coopanion 后重开。';

  it('says why a talk key that cannot be read hears nothing, and shows no key cap', () => {
    for (const mode of ['hold', 'toggle'] as const) {
      const d = talkStep({ enabled: true, input: { mode, hint: '按两下右 Option 开始说话', keyLabel: '右 Option', taps: 2, hotkeyProblem: why } });
      expect(d.text).toContain('说话键现在用不了');
      expect(d.text).toContain('没有「输入监控」权限');
      expect(d.text).not.toContain('按两下右 Option');
      expect(d.input).toMatchObject({ kind: 'buttons' });
      expect((d.input as { keys?: string }).keys).toBeUndefined();
    }
  });

  it('shows the hint and the key cap when the key works', () => {
    const d = talkStep({ enabled: true, input: { mode: 'toggle', hint: '按两下右 Option 开始说话', keyLabel: '右 Option', taps: 2, hotkeyProblem: null } });
    expect(d.text).toContain('按两下右 Option 开始说话');
    expect(d.text).not.toContain('说话键现在用不了');
    expect((d.input as { keys?: string }).keys).toBe('右 Option');
  });

  it('always listening needs no key, so a key problem is not told', () => {
    const d = talkStep({ enabled: true, input: { mode: 'always', hint: '直接说话就行', keyLabel: '右 Option', hotkeyProblem: why } });
    expect(d.text).toContain('直接说话就行');
    expect((d.input as { keys?: string }).keys).toBeUndefined();
  });

  it('voice input off', () => {
    expect(talkStep({ enabled: false }).text).toContain('语音输入现在关着');
  });
});
