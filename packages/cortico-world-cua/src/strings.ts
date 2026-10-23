/**
 * The text this World shows people, in Chinese and English (Cortico's `pick`: zh-Hant reads zh, every other
 * language en). The permission question and the system dialog follow the app language; the console's lamp,
 * badges, settings and template notes follow the console request's language. Text the bot reads (the prompt,
 * tool descriptions, receipts and the engine's errors in them) is not here and stays Chinese.
 */
import { pick, type Language } from 'cortico/core/language.ts';
import type { PermissionLevel } from './config.ts';

const zh = {
  /** Asking before using the computer; `who` is the bot's name. */
  ask: {
    eachTurn: (who: string) => `${who} 想用你的电脑:看屏幕、动鼠标和键盘。这一次可以吗?`,
    once: (who: string, minutes: number) => `${who} 想动你的鼠标和键盘。接下来 ${minutes} 分钟里都可以吗?`,
    acting: (who: string) => `${who} 想动你的鼠标和键盘。这一次可以吗?`,
    /** The system dialog's title and buttons (shown while the app has no other way to ask). */
    caption: '电脑操作',
    yes: '可以',
    no: '不行',
    /** The buttons of the question in the embedding app's own bubble (core/companion.ts's pet bubble). */
    bubble: { yes: '可以', no: '这次不行' },
  },

  /** Whether this system runs computer use. */
  preflight: {
    noDisplay: '电脑操作 World 在 Linux 上需要 X11(或 Wayland 下的 XWayland):没有找到 DISPLAY。',
    unsupported: '电脑操作 World 只支持 Windows、macOS 和 Linux。',
  },

  /** The console: the World's page. */
  console: {
    label: '电脑操作',
    engine: '操作引擎',
    screen: (w: number, h: number) => `屏幕 ${w}×${h}`,
    onDemand: '按需启动',
    exited: (code: number | null) => `引擎进程退出(退出码 ${code})`,
    control: '操作',
    allowed: '允许',
    viewOnly: '只看',
    asking: '询问',
    levels: {
      'ask-each-turn': () => '每轮', 'ask-before-acting': () => '动手前', 'ask-once': (minutes: number) => `${minutes} 分钟一次`, 'never-ask': () => '不问',
    } satisfies Record<PermissionLevel, (minutes: number) => string>,
  },

  /** The environment template on the system-prompt page and its placeholders. */
  prompt: {
    title: '电脑操作环境',
    description: '截图坐标、让位规则与操作边界。',
    vars: {
      'cua.os': '这台电脑的系统:Windows 或 Mac',
      'cua.keys': '这个系统常用的快捷键',
      'cua.shot': '截图尺寸',
      'cua.control': '是否允许操作鼠标键盘',
      'cua.idle': '让位时长(秒)',
      'cua.permission': '什么时候先问使用者(按 permission 设置)',
    },
  },

  /** The console's settings. */
  config: {
    group: '电脑操作',
    control: { title: '允许操作鼠标键盘', description: '关掉后只能截图和列窗口。' },
    permission: {
      title: '什么时候先问你',
      description: 'ask-each-turn:每一轮看屏幕或动手前都问;ask-before-acting:看屏幕不问,每一轮动鼠标键盘前问;ask-once:看屏幕不问,动鼠标键盘前问一次,同意后「同意管多久」内不再问;never-ask:都不问。',
    },
    grantMinutes: { title: '同意管多久', suffix: '分钟', description: '只对 ask-once 有效。' },
    userIdleMs: { title: '让位时长', description: '你动过鼠标或键盘后,要静止这么久才继续操作。' },
    maxYieldWaitMs: { title: '让位最多等待' },
    maxWidth: { title: '截图最大宽' },
    maxHeight: { title: '截图最大高' },
    quality: { title: '截图质量' },
    afterAction: { title: '操作后附截图' },
    settleMs: { title: '截图前等待' },
  },
};

export type CuaText = typeof zh;

const en: CuaText = {
  ask: {
    eachTurn: (who: string) => `${who} wants to use your computer: look at the screen and use the mouse and keyboard. OK this time?`,
    once: (who: string, minutes: number) => `${who} wants to use your mouse and keyboard. OK for the next ${minutes} minutes?`,
    acting: (who: string) => `${who} wants to use your mouse and keyboard. OK this time?`,
    caption: 'Computer use',
    yes: 'Allow',
    no: 'Not now',
    bubble: { yes: 'Allow', no: 'Not this time' },
  },

  preflight: {
    noDisplay: 'Computer use needs X11 on Linux (or XWayland under Wayland): DISPLAY is not set.',
    unsupported: 'Computer use runs on Windows, macOS and Linux only.',
  },

  console: {
    label: 'Computer use',
    engine: 'Input engine',
    screen: (w: number, h: number) => `Screen ${w}×${h}`,
    onDemand: 'Starts when needed',
    exited: (code: number | null) => `The engine process exited (exit code ${code})`,
    control: 'Control',
    allowed: 'Allowed',
    viewOnly: 'Look only',
    asking: 'Asks',
    levels: {
      'ask-each-turn': () => 'Every turn', 'ask-before-acting': () => 'Before acting', 'ask-once': (minutes: number) => `Once per ${minutes} min`, 'never-ask': () => 'Never',
    },
  },

  prompt: {
    title: 'Computer environment',
    description: 'Screenshot coordinates, when to stay out of your way, and what the bot may do.',
    vars: {
      'cua.os': "This computer's system: Windows or Mac",
      'cua.keys': "The system's common shortcuts",
      'cua.shot': 'Screenshot size',
      'cua.control': 'Whether the mouse and keyboard may be used',
      'cua.idle': 'How long to stay out of the way (seconds)',
      'cua.permission': 'When you are asked first (from the permission setting)',
    },
  },

  config: {
    group: 'Computer use',
    control: { title: 'Allow the mouse and keyboard', description: 'When off, only screenshots and the window list.' },
    permission: {
      title: 'When to ask you',
      description: 'ask-each-turn: before looking at the screen or acting, every turn; ask-before-acting: looking is free, asks before using the mouse and keyboard every turn; ask-once: looking is free, asks once before using the mouse and keyboard, and a yes holds for "A yes lasts"; never-ask: never asks.',
    },
    grantMinutes: { title: 'A yes lasts', suffix: 'min', description: 'For ask-once only.' },
    userIdleMs: { title: 'Stay out of the way for', description: 'After you use the mouse or keyboard, Coo waits until they have been still this long.' },
    maxYieldWaitMs: { title: 'Longest wait for you' },
    maxWidth: { title: 'Screenshot max width' },
    maxHeight: { title: 'Screenshot max height' },
    quality: { title: 'Screenshot quality' },
    afterAction: { title: 'Screenshot after each action' },
    settleMs: { title: 'Wait before the screenshot' },
  },
};

/** The tables, for tests that compare their keys. */
export const CUA_TEXT = { zh, en } as const;

/** This World's person-facing text in `language`. */
export const cuaText = (language: Language): CuaText => pick(language, CUA_TEXT);
