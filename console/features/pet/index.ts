/**
 * 「习惯」: the everyday settings of the desktop pet, written to the desktop-pet World's config
 * group through `/api/config` (only the keys shown here are sent). The pet's own menu changes some
 * of the same values, so they are read again every few seconds. Dressing up has its own page
 * (features/dress). The hover buttons are picked from the pet menu's own actions, drawn with the
 * pet page's icons. The 「音效」 card below writes the World's sound group: the master switch
 * (the same one the pet menu flips), each kind of sound, and how long Coo snores in each sleep. 「说话声」 (upstream #263,
 * #299) writes the same group: the speech that replaces the babble, and its pitch and speed, each a step or 自定义;
 * picking 自定义 shows its number under the steps, starting from the step picked before. The speech switch is disabled
 * while sounds are off, and pitch and speed are greyed while the speech cannot be heard (sounds, the 说话 kind or the
 * speech itself off), as the kinds are while sounds are off.
 * The 「表情决策」 card writes the decider group (decider mode, src/decider.ts in the World; off by default): the switch,
 * the decision model (picked from OpenRouter's public listing of decision models, which the World's `pet.deciders`
 * fetches and caches, with price per million input tokens and context; the ids we know when it cannot be reached)
 * and the timeout; it shows whether an OpenRouter key
 * is there (never the key) and the lamp's state (with a chosen model OpenRouter serves nowhere, which gives way to the
 * default for the run, and a default gone too), and a key typed in is saved as the `openrouter` endpoint's key
 * (`saveVendorKey`: the endpoint is created or updated, not made active).
 * The 「主动闲聊」 card writes `smallTalk` (src/smalltalk.ts in the World; off by default): the switch, how often
 * (少/中/多 = at least 2 h / 1 h / 30 min apart) and the quiet hours.
 * The first row is the app language (`language` in the Core's `companion` group, features/language.ts): 中文 or
 * English, and any other language the config holds; a change saves it and reloads the window in it.
 * 「Coo 的名字」 is `displayName` in Core's own `core` group, the name the rail shows and renames (upstream #320): the
 * pet menu, the chat page and computer use's question follow it at once; cleared, it saves Coopanion's default, Coo.
 */
import { ICONS } from 'cortico-world-desktop-pet/web/ui.js';
import { saveVendorKey } from 'cortico-provider-coo/src/connect.ts';
import { vendorById } from 'cortico-provider-coo/src/vendors.ts';
import { get, post, setConfig } from '../../core/api.ts';
import { consoleCall } from '../home/model.ts';
import { LANGUAGE, pick } from '../../core/language.ts';
import { LANGUAGE_NAMES, languageTag, type Language } from '../../../../core/language.ts';
import { APP_LANGUAGES, setAppLanguage, storedLanguage } from '../language.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
import { announceName } from '../bot-name.ts';

const GROUP = 'world:desktop-pet';
/** The bot's name: a key of Core's own group; cleared, it is Coopanion's default (DISPLAY_NAME in core/seed.ts). */
const NAME_GROUP = 'core';
const NAME_KEY = 'displayName';
const DEFAULT_NAME = 'Coo';
const SOUND_GROUP = 'world:desktop-pet:sound';
const DECIDER_GROUP = 'world:desktop-pet:decider';
const PET_PAGE = 'world:desktop-pet';
const panelPath = (method: string) => `/api/webui/providers/${encodeURIComponent(PET_PAGE)}/panels/pet/${method}`;
/** The World's default decision model (DECIDER_DEFAULT_MODEL). */
const DEFAULT_DECIDER = 'typesafe/jev-1.14';
const K = 'worlds.desktop-pet';
/** The range of the bubble and text sizes, as BUBBLE_SIZE_MIN and BUBBLE_SIZE_MAX in the World's config.ts; 1 is the bubbles as pet.css draws them. */
const BUBBLE_SIZE_MIN = .8, BUBBLE_SIZE_MAX = 1.6;
/** The range of Coo's bubble speed, as BUBBLE_SPEED_MIN and BUBBLE_SPEED_MAX in the World's config.ts; at 1 a bubble types 20 characters a second. */
const BUBBLE_SPEED_MIN = .5, BUBBLE_SPEED_MAX = 2;
const KEYS = {
  user: `${K}.user`,
  roam: `${K}.roam`,
  theme: `${K}.theme`,
  scale: `${K}.window.scale`,
  bubbleSize: `${K}.window.bubbleSize`,
  fontSize: `${K}.window.fontSize`,
  bubbleSpeed: `${K}.window.bubbleSpeed`,
  lockFps: `${K}.window.lockFrameRate`,
  hideFullscreen: `${K}.window.hideWhenFullscreen`,
  sound: `${K}.sound`,
  snoreSeconds: `${K}.sounds.snoreSeconds`,
  speech: `${K}.speech.enabled`,
  speechPitch: `${K}.speech.pitch`,
  speechPitchHz: `${K}.speech.pitchHz`,
  speechSpeed: `${K}.speech.speed`,
  speechRate: `${K}.speech.unitsPerSecond`,
  remember: `${K}.rememberPosition`,
  hover: `${K}.hoverButtons`,
  dblclick: `${K}.doubleClickChat`,
  saidBubbles: `${K}.saidBubbles`,
  selfAdjust: `${K}.selfAdjust`,
  deciderOn: `${K}.decider.enabled`,
  deciderModel: `${K}.decider.model`,
  deciderTimeout: `${K}.decider.timeoutMs`,
  smallTalk: `${K}.smallTalk.enabled`,
  smallTalkFreq: `${K}.smallTalk.frequency`,
  quietFrom: `${K}.smallTalk.quietFrom`,
  quietTo: `${K}.smallTalk.quietTo`,
} as const;

/** What the World's `pet.state` says of small talk (`smallTalkState`). */
interface SmallTalkState { enabled?: boolean; presence?: boolean; why?: string | null }

/** A decision model as the World's `pet.deciders` lists it (src/decider.ts DeciderModel). */
interface DeciderModel { id: string; name?: string; promptPerM: number | null; context: number | null }

/** What the World's `pet.state` says of decider mode (`deciderState`): no key, only whether there is one. */
interface DeciderState {
  mode?: 'classic' | 'decider'; enabled?: boolean; keySet?: boolean; open?: boolean; overridden?: boolean;
  last?: { ms: number; ok: boolean; reason?: string } | null; calls?: number; cost?: number;
  /**
   * The chosen model OpenRouter said it serves nowhere (HTTP 404 "No endpoints found for …"; the default is asked
   * instead this run), whether it said so of the default too, and the default's id.
   */
  unavailable?: string | null; defaultGone?: boolean; defaultModel?: string;
}

/** The pet menu's actions in its order (the World's PET_ACTIONS), with the icon each shows. */
const ACTIONS: ReadonlyArray<[id: string, icon: string]> = [
  ['chat', 'chat'], ['voice', 'mic'], ['roam', 'roam_calm'], ['theme', 'moon'], ['sound', 'sound'], ['dress', 'shirt'], ['hide', 'eyeOff'],
];
/** Kinds of sound (the World's SOUND_KINDS), each under `worlds.desktop-pet.sounds.<kind>`. */
const SOUND_KINDS = ['move', 'touch', 'face', 'snore', 'talk', 'ui'] as const;
/** The speech's steps, their numbers and the range of a custom one (SPEECH_LEVELS, SPEECH_PITCH_HZ, SPEECH_RATE in the World's config.ts). */
const SPEECH_LEVELS = ['low', 'mid', 'high', 'custom'] as const;
const SPEECH_PITCH = { steps: { low: 300, mid: 400, high: 500 } as Record<string, number>, min: 200, max: 700 };
const SPEECH_RATE = { steps: { low: 10, mid: 13, high: 16 } as Record<string, number>, min: 6, max: 20 };
/** Most hover buttons (the World's MAX_HOVER_BUTTONS). */
const MAX_HOVER = 6;

export const TEXT = {
  zh: {
    nav: '习惯',
    settingsTitle: '习惯',
    language: '语言',
    languageHint: '设置窗口、菜单和桌宠气泡里的文字用这种语言;不是中文时,Coo 也用它和你说话。切换后窗口会刷新。',
    user: '怎么称呼你',
    userPlaceholder: '伙伴',
    userHint: 'Coo 会用这个名字叫你。',
    botName: 'Coo 的名字',
    botNameHint: '左栏、「开始」页的标题、桌宠菜单、对话页和气泡里的提问用这个名字称呼 Coo。清空就是 Coo。',
    roam: '走动',
    roamFree: '常走动',
    roamCalm: '多待着',
    roamOff: '不乱动',
    theme: '颜色',
    themeDark: '夜间(浅色身体)',
    themeLight: '白天(深色身体)',
    scale: '大小',
    bubbleSize: '气泡尺寸',
    bubbleSizeHint: '调整 Coo 和你的气泡的宽度、留白、圆角和尾巴,文字大小不变。',
    fontSize: '字体尺寸',
    fontSizeHint: '调整气泡里文字的大小,气泡宽度不变。',
    bubbleSpeed: '气泡速度',
    bubbleSpeedHint: '调整 Coo 的气泡逐字出现和停留的快慢,100% 为默认。',
    lockFps: '锁定 60 帧',
    lockFpsHint: '关着时 Coo 站着、坐着、趴着、睡着每秒画 30 帧,走动、被拎着、跳起时 60 帧,占用的 CPU 更少;打开后一直 60 帧。',
    hideFullscreen: '全屏时自动隐藏',
    hideFullscreenHint: '玩游戏、看全屏视频、浏览器全屏时 Coo 先躲起来,退出全屏再出来。最大化的窗口不算全屏。',
    soundTitle: '音效',
    sound: '播放音效',
    soundHint: 'Coo 菜单里的音效按钮切的也是这个。',
    soundKinds: '分别开关',
    soundKindsHint: '关掉的那类不再出声,其余照常。鼠标停在一项上能看到它包括哪些声音。形象包自带的声音也归在这几类里。',
    kinds: {
      move: ['动作', '走路、跑、跳、落地、被甩出去、点头、摇头、转圈、晕、发抖、跳舞、张望、探头、后缩、背过身、翻滚、喝茶、翻书、喷水、叹气、歪头、托腮、加油、记笔记、对手指、拍手、举手、点赞、擦汗、凑近、晃来晃去、跺脚、打喷嚏、摇尾巴、炸毛、抖耳朵、扇翅膀、灵光一闪、叉腰、唱歌、奉茶、敬礼、比耶'],
      touch: ['互动', '被拎起来、拎着晃、被摸、被戳'],
      face: ['表情', '开心、眨眼、喜欢、惊讶、生气、难过、害羞、打哈欠、温柔、苦笑、偷笑、石化裂开、吐舌、安慰、气炸、心碎、撒花、郁闷、无言以对、眼冒金星、灵魂出窍、摊手、抱头、嘘、哎呀'],
      snore: ['打呼噜', '睡着时的呼噜声'],
      talk: ['说话', '气泡里逐字冒出的叽咕声、选项卡片弹出'],
      ui: ['按钮与提示', '点按钮、气泡弹出、选中、开始和结束听你说话'],
    } as Record<string, [string, string]>,
    snore: '呼噜打多久',
    snoreUnit: '秒',
    snoreHint: '每次睡着后打这么久呼噜就安静下来,Z 照样飘。0 = 一直打到醒。',
    speechTitle: '说话声',
    speech: '念出气泡文字',
    speechHint: '默认关。每个字念成一个短音节,代替「说话」类音效;「说话」类关掉时不出声。中文按拼音念,英文查发音词典,一句话里有假名时按日语念。',
    speechPitch: '音高',
    speechSpeed: '语速',
    speechPitchLevels: { low: '低', mid: '中', high: '高', custom: '自定义' } as Record<string, string>,
    speechSpeedLevels: { low: '低', mid: '中', high: '高', custom: '自定义' } as Record<string, string>,
    speechRateUnit: '音节/秒',
    remember: '记住位置',
    rememberHint: '退出时记下 Coo 的横向位置,下次启动回到那里;有多块屏幕时总在主屏上启动。',
    hover: '悬停按钮',
    hoverHint: (n: number) => `鼠标停在 Coo 身上时旁边出现的按钮,最多 ${n} 个。`,
    dblclick: '双击 Coo 打开打字框',
    saidBubbles: '在 Coo 头顶显示你说的话',
    saidBubblesHint: '打字、语音和「对话」页发出的消息留在 Coo 头顶,Coo 回复后淡出。关掉后,语音只在识别时显示,识别完就淡出。',
    selfAdjust: '允许 Coo 自己调整',
    selfAdjustHint: 'Coo 可以自己换形象和装扮、改走动多少;改音效、大小、黑白模式、悬停按钮和对你的称呼前会先问你。关掉后这些 Coo 都改不了。',
    actions: { chat: '打字', voice: '语音输入', roam: '行为模式', theme: '夜间模式', sound: '音效', dress: '装扮', hide: '隐藏桌宠' } as Record<string, string>,
    smallTalkTitle: '主动闲聊',
    smallTalk: '让 Coo 主动找你聊几句',
    smallTalkHint: '默认关。打开后,你在电脑前却有一阵没和 Coo 说话,或者离开一会儿刚回来时,Coo 可能主动搭一两句:打个招呼、聊聊这个时间、接着之前的话题、提醒你喝水休息;也可能觉得没什么好说,就不出声。每次尝试都是一次模型调用,不出声也算。Coo 被隐藏或暂停、在安静或睡着、有全屏窗口(只有 Windows 判得出;macOS 和 Linux 上全屏演示、游戏时 Coo 也可能开口)、你正在打字或刚聊过、免打扰时段里都不会。',
    smallTalkFreq: '多久一次',
    freqLow: '少', freqMid: '中', freqHigh: '多',
    smallTalkFreqHint: '少:两次至少隔 2 小时;中:1 小时;多:30 分钟。离上次聊天也至少隔这么久;刚回到电脑前的招呼不受这一条限制。',
    quietHours: '免打扰',
    quietTo: '到',
    quietHint: '这段时间里不主动闲聊,可以跨午夜;两个时间一样就是不设。',
    noPresence: '没有收到电脑空闲时间的报告(或已经超过 2 分钟没更新),现在不会主动闲聊。',
    saved: '已保存',
    saveFailed: (why: string) => `没保存上:${why}`,
    deciderTitle: '表情决策',
    deciderOn: '交给决策模型挑表情动作',
    deciderHint: '默认关。打开并且有 OpenRouter 密钥时,Coo 说话只写一句心情,表情、动作和姿势由 OpenRouter 上的决策模型照这句话挑(很快、很便宜),走动由 Coo 自己按像素决定;省下整张词表,提示词更短。没有密钥或关掉时照旧由 Coo 自己写表情动作。',
    deciderModel: '决策模型',
    deciderModelHint: `OpenRouter 上的决策模型,默认 ${DEFAULT_DECIDER}(快、便宜)。可以从列表里挑(列出价格和上下文长度),也可以直接填 id。`,
    modelLive: 'OpenRouter 现有的决策模型;上下文装不下一次请求的不列出。',
    modelFallback: '连不上 OpenRouter,只列出已知的几个(价格未知)。',
    modelInfo: (price: string, ctx: string) => `这个模型:${price}${ctx ? `,${ctx}` : ''}。`,
    priceFree: '免费',
    pricePerM: (usd: string) => `每百万输入 token $${usd}`,
    ctxTokens: (k: string) => `上下文 ${k}`,
    modelUnlisted: `这个模型不在 OpenRouter 的决策模型列表里(或上下文太短),确认 id 没写错;OpenRouter 下架了的模型(它回答「No endpoints found」)会改用默认的 ${DEFAULT_DECIDER}。`,
    defaultUnlisted: '默认的决策模型现在不在 OpenRouter 的决策模型列表里(可能下架了),换一个列表里的模型试试。',
    deciderTimeout: '最多等多久',
    deciderTimeoutHint: '一次决策超过这个时间,这句话只按心情里直接写出的词做表情或头部动作,没写就只说话。',
    deciderKey: 'OpenRouter 密钥',
    deciderKeyHint: '存成「开始」页的 OpenRouter 端点的密钥,不会切换你现在用的聊天模型,也不会替你打开上面的开关。开着时每句话都会把 Coo 说的话和心情、你最近说的一句话、Coo 的姿势位置和时间发给 OpenRouter;不想发就关掉上面的开关。',
    deciderKeySave: '保存密钥',
    deciderKeySaved: '密钥已保存,几秒内生效',
    keyHave: '用的是你 OpenRouter 端点的密钥。',
    keyNone: '还没有 OpenRouter 密钥,填一个就能用。',
    modeDecider: '现在:表情动作由决策模型挑。',
    modeClassic: '现在:Coo 自己写表情动作。',
    needSwitch: '要用决策模型,打开上面的开关。',
    needKey: '开关开着,但还没有 OpenRouter 密钥:填一个就会用上。',
    lastOk: (ms: number, n: number, cost: number) => `上次决策 ${ms} ms;本次运行 ${n} 次${cost ? `,约 $${cost.toFixed(5)}` : ''}。`,
    lastBad: (why: string) => `上次没成:${why}。`,
    breaker: '连续出错,暂停一会儿再试。',
    modelGone: (model: string, fallback: string) => `${model} 在 OpenRouter 上用不了(没有提供它的服务端),这次运行改用默认的 ${fallback}。`,
    defaultGone: (model: string) => `默认的 ${model} 在 OpenRouter 上也用不了,现在只按心情里直接写出的词做表情或头部动作;换一个列表里的模型试试。`,
    overridden: '你改过桌宠的环境说明(旧模式的版本),决策模式下它仍会生效;想用新说明,请在「提示词」页还原。',
  },
  en: {
    nav: 'Habits',
    settingsTitle: 'Habits',
    language: 'Language',
    languageHint: "The settings window, menus and the pet's bubbles use this language, and so does Coo when talking to you. The window reloads after a change.",
    user: 'What to call you',
    userPlaceholder: 'Pal',
    userHint: 'Coo calls you by this name.',
    botName: "Coo's name",
    botNameHint: "The sidebar, the Start page's heading, the pet's menu, the Chat page and questions in the bubble call Coo by this name. Cleared, it is Coo.",
    roam: 'Walking',
    roamFree: 'Often',
    roamCalm: 'Now and then',
    roamOff: 'Stay put',
    theme: 'Night mode',
    themeDark: 'Night (light body)',
    themeLight: 'Day (dark body)',
    scale: 'Size',
    bubbleSize: 'Bubble size',
    bubbleSizeHint: "Changes the width, padding, corners and tail of Coo's bubbles and yours; the text keeps its size.",
    fontSize: 'Text size',
    fontSizeHint: 'Changes the size of the text in the bubbles; the bubbles keep their width.',
    bubbleSpeed: 'Bubble speed',
    bubbleSpeedHint: "Changes how fast Coo's bubbles type out and how long they stay; 100% is the default.",
    lockFps: 'Lock to 60 fps',
    lockFpsHint: 'Off: Coo draws 30 frames a second while standing, sitting, lying or asleep and 60 while walking, carried or jumping, which uses less CPU. On: always 60.',
    hideFullscreen: 'Hide during full screen',
    hideFullscreenHint: "Coo steps away while a game, a video or a browser fills Coo's screen, and comes back when full screen ends. A maximized window does not count.",
    soundTitle: 'Sounds',
    sound: 'Play sounds',
    soundHint: "The sound button in Coo's menu flips this too.",
    soundKinds: 'By kind',
    soundKindsHint: "A kind switched off stays silent; the rest play as usual. Rest the pointer on one to see which sounds it covers. A figure pack's own sounds fall under these kinds too.",
    kinds: {
      move: ['Moving', 'Walking, running, jumping, landing, being thrown, nodding, shaking, spinning, dizziness, shivering, dancing, looking about, peeking, flinching, turning away, rolling, sipping tea, turning pages, spouting water, sighing, a curious head tilt, a hand at the chin, a fist raised to cheer, jotting notes, fingertips together, clapping, a hand raised, a thumbs up, wiping her brow, leaning in, swaying, stamping a foot, sneezing, wagging a tail, a puffed-up tail, flicking ears, beating wings, a bright idea, hands on hips, singing, serving tea, saluting, V sign'],
      touch: ['Touch', 'Being picked up, swung, petted, poked'],
      face: ['Faces', 'Happy, wink, love, surprised, angry, sad, shy, yawning, gentle, wry laugh, giggle, cracking stone, tongue out, comforting, fuming, heartbroken, confetti, gloomy, speechless, seeing stars, her soul slipping out, a shrug, holding her head, shush, uh-oh'],
      snore: ['Snoring', 'Snores while asleep'],
      talk: ['Talking', 'The babble as bubble text appears, choice cards popping up'],
      ui: ['Buttons and cues', 'Button clicks, bubbles opening, picks, listening starting and ending'],
    } as Record<string, [string, string]>,
    snore: 'Snore for',
    snoreUnit: 's',
    snoreHint: "In each sleep Coo goes quiet after snoring this long; the z's keep floating. 0 = snore until waking.",
    speechTitle: 'Speech',
    speech: 'Read bubbles aloud',
    speechHint: 'Off by default. Each character is read as a short syllable, in place of the Talking sounds; silent while Talking is off. Chinese is read by its pinyin, English by a pronouncing dictionary, and a sentence with kana as Japanese.',
    speechPitch: 'Pitch',
    speechSpeed: 'Speed',
    speechPitchLevels: { low: 'Low', mid: 'Medium', high: 'High', custom: 'Custom' } as Record<string, string>,
    speechSpeedLevels: { low: 'Slow', mid: 'Medium', high: 'Fast', custom: 'Custom' } as Record<string, string>,
    speechRateUnit: 'syllables/s',
    remember: 'Remember where Coo stands',
    rememberHint: 'Saves how far across the screen Coo stands when the app quits; with several screens Coo always starts on the main one.',
    hover: 'Hover buttons',
    hoverHint: (n: number) => `Buttons beside Coo while the pointer rests on Coo, up to ${n}.`,
    dblclick: 'Double-click Coo to open the typing box',
    saidBubbles: 'Show what you said above Coo',
    saidBubblesHint: 'What you type, say or send from the Chat page stays above Coo until Coo has replied. When off, speech shows only while it is recognized and fades once done.',
    selfAdjust: 'Let Coo change settings',
    selfAdjustHint: 'Coo may change the figure, dress and how much Coo walks; Coo asks you before changing sounds, size, night or day look, hover buttons or what Coo calls you. When off, Coo can change none of these.',
    actions: { chat: 'Type', voice: 'Voice input', roam: 'Walking', theme: 'Night mode', sound: 'Sounds', dress: 'Dress up', hide: 'Hide pet' } as Record<string, string>,
    smallTalkTitle: 'Small talk',
    smallTalk: 'Let Coo start a chat now and then',
    smallTalkHint: "Off by default. On: when you are at the computer but haven't talked to Coo for a while, or have just come back, Coo may say a line or two — a hello, something about the time of day, a follow-up on what you said earlier, a nudge to drink water or take a break — or keep quiet when there is nothing to say. Each attempt is one model call, even one where Coo stays quiet. Never while Coo is hidden or paused, keeping quiet or asleep, a window is full screen (only Windows can tell; on macOS and Linux Coo may speak over a full-screen presentation or game), you are typing or have just talked, or in quiet hours.",
    smallTalkFreq: 'How often',
    freqLow: 'Low', freqMid: 'Medium', freqHigh: 'High',
    smallTalkFreqHint: 'Low: at least 2 hours apart; medium: 1 hour; high: 30 minutes. Also at least that long since you last talked, except for a hello when you come back.',
    quietHours: 'Quiet hours',
    quietTo: 'to',
    quietHint: 'No small talk in this window, which may wrap past midnight; the same time twice means none.',
    noPresence: "No report of how long the computer has been idle has come in (or none for over 2 minutes), so there is no small talk now.",
    saved: 'Saved',
    saveFailed: (why: string) => `Not saved: ${why}`,
    deciderTitle: 'Expression decisions',
    deciderOn: 'Let a decision model pick faces and motions',
    deciderHint: 'Off by default. On, with an OpenRouter key: Coo writes only a line on the feeling, and a decision model on OpenRouter (fast and cheap) picks the faces, motions and postures from it; Coo decides the walks in pixels. The word list leaves the prompt. Without a key, or off, Coo writes the faces and motions as before.',
    deciderModel: 'Decision model',
    deciderModelHint: `A decision model on OpenRouter; default ${DEFAULT_DECIDER} (fast and cheap). Pick one from the list (with price and context length) or type an id.`,
    modelLive: "OpenRouter's decision models now; those whose context cannot take a request are left out.",
    modelFallback: 'OpenRouter cannot be reached: only the models we know are listed (prices unknown).',
    modelInfo: (price: string, ctx: string) => `This model: ${price}${ctx ? `, ${ctx}` : ''}.`,
    priceFree: 'free',
    pricePerM: (usd: string) => `$${usd} per million input tokens`,
    ctxTokens: (k: string) => `${k} context`,
    modelUnlisted: `This model is not in OpenRouter's list of decision models (or its context is too short); check the id. A model OpenRouter has removed (it answers "No endpoints found") gives way to the default ${DEFAULT_DECIDER}.`,
    defaultUnlisted: "The default decision model is not in OpenRouter's list of decision models now (it may have been removed); try another model from the list.",
    deciderTimeout: 'Wait at most',
    deciderTimeoutHint: 'A decision that takes longer leaves that line with only a face or head move its feeling names outright, or none.',
    deciderKey: 'OpenRouter key',
    deciderKeyHint: "Saved as the key of the Start page's OpenRouter endpoint; the chat model you use does not change, and the switch above is not turned on for you. While on, each line sends OpenRouter what Coo says and feels, the last thing you said, Coo's posture and place and the time; switch it off above to stop that.",
    deciderKeySave: 'Save key',
    deciderKeySaved: 'Key saved; it takes effect within seconds',
    keyHave: "Using your OpenRouter endpoint's key.",
    keyNone: 'No OpenRouter key yet: add one to use this.',
    modeDecider: 'Now: a decision model picks faces and motions.',
    modeClassic: 'Now: Coo writes the faces and motions.',
    needSwitch: 'Turn on the switch above to use a decision model.',
    needKey: 'The switch is on but there is no OpenRouter key yet: add one and it is used.',
    lastOk: (ms: number, n: number, cost: number) => `Last decision ${ms} ms; ${n} this run${cost ? `, about $${cost.toFixed(5)}` : ''}.`,
    lastBad: (why: string) => `Last one failed: ${why}.`,
    breaker: 'Failing repeatedly; pausing a moment.',
    modelGone: (model: string, fallback: string) => `${model} is not available on OpenRouter (no endpoint serves it); using the default ${fallback} this run.`,
    defaultGone: (model: string) => `The default ${model} is not available on OpenRouter either; only a face or head move the feeling names outright is shown now. Try another model from the list.`,
    overridden: 'You edited the pet environment prompt (the classic version); it still applies in decider mode. Restore it on the System prompt page to use the new one.',
  },
};
const S = pick(TEXT);

interface ConfigEntry { group: { id: string }; values?: Record<string, unknown> }

/** While the size slider moves, at most one save per this many milliseconds. */
const SCALE_SEND_MS = 80;

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function mount(ctx: FeatureContext): Promise<void> {
  const { ui, root, signal } = ctx;
  const opts = { signal };
  root.classList.add('home');

  /* ---------- habits ---------- */
  const habits = ui.sheet({ title: S.settingsTitle });
  const msg = ui.msgline('');

  // the app language: a change reloads the window, so the select only follows the config until then
  const language = ui.select({ options: APP_LANGUAGES.map((l) => ({ value: l.value, label: l.label })) });
  language.setAttribute('aria-label', S.language);
  // each choice is named in itself, and tagged so (the page around it may be in another language)
  for (const opt of language.options) opt.lang = languageTag(opt.value as Language);
  /** Adds the option of a language the config holds but the two choices are not (a hand edit, Cortico's own buttons). */
  const languageOption = (l: Language) => {
    if ([...language.options].some((o) => o.value === l)) return;
    const opt = ui.h('option', null, LANGUAGE_NAMES[l]);
    opt.value = l;
    opt.lang = languageTag(l);
    language.append(opt);
  };
  language.addEventListener('change', () => {
    const next = language.value as Language;
    if (next === language.dataset.saved) return;
    language.disabled = true;
    void setAppLanguage(next, opts).catch((err) => {
      if (signal.aborted) return;
      language.value = language.dataset.saved ?? 'zh';
      language.disabled = false;
      msg.textContent = S.saveFailed(errText(err));
      msg.classList.add('bad');
    });
  }, opts);

  const user = ui.input({ placeholder: S.userPlaceholder });
  const botName = ui.input({ placeholder: DEFAULT_NAME });
  botName.setAttribute('aria-label', S.botName);
  const roam = ui.segmented([
    { value: 'free', label: S.roamFree }, { value: 'calm', label: S.roamCalm }, { value: 'off', label: S.roamOff },
  ], { size: 'sm', onSelect: (v) => void save(KEYS.roam, v) });
  const theme = ui.segmented([
    { value: 'dark', label: S.themeDark }, { value: 'light', label: S.themeLight },
  ], { size: 'sm', onSelect: (v) => void save(KEYS.theme, v) });
  const scale = ui.h('input', 'companion-range');
  scale.type = 'range';
  scale.min = '0.5'; scale.max = '2'; scale.step = '0.05';
  const scaleText = ui.h('span', 'companion-rangeval');
  const scaleBox = ui.h('div', 'companion-rangebox');
  scaleBox.append(scale, scaleText);
  // 气泡尺寸 and 字体尺寸 (80%–160%) and 气泡速度 (50%–200%, upstream #248): steps of 5%, saved once a drag or a key press
  // ends (the World's BUBBLE_SIZE_MIN/MAX and BUBBLE_SPEED_MIN/MAX)
  const percentSlider = (key: string, min = BUBBLE_SIZE_MIN, max = BUBBLE_SIZE_MAX) => {
    const input = ui.h('input', 'companion-range');
    input.type = 'range';
    input.min = String(min); input.max = String(max); input.step = '0.05';
    const text = ui.h('span', 'companion-rangeval');
    const box = ui.h('div', 'companion-rangebox');
    box.append(input, text);
    const show = () => { text.textContent = `${Math.round(Number(input.value) * 100)}%`; };
    input.addEventListener('input', show);
    input.addEventListener('change', () => { show(); void save(key, Number(input.value)); });
    return { key, input, box, show };
  };
  const bubbleSize = percentSlider(KEYS.bubbleSize), fontSize = percentSlider(KEYS.fontSize);
  const bubbleSpeed = percentSlider(KEYS.bubbleSpeed, BUBBLE_SPEED_MIN, BUBBLE_SPEED_MAX);
  const lockFps = ui.checkbox(S.lockFps, { onChange: (on) => void save(KEYS.lockFps, on) });
  const hideFullscreen = ui.checkbox(S.hideFullscreen, { onChange: (on) => void save(KEYS.hideFullscreen, on) });
  const remember = ui.checkbox(S.remember, { onChange: (on) => void save(KEYS.remember, on) });
  const dblclick = ui.checkbox(S.dblclick, { onChange: (on) => void save(KEYS.dblclick, on) });
  const saidBubbles = ui.checkbox(S.saidBubbles, { onChange: (on) => void save(KEYS.saidBubbles, on) });
  const selfAdjust = ui.checkbox(S.selfAdjust, { onChange: (on) => void save(KEYS.selfAdjust, on) });
  // hover buttons: one round toggle per action, in the menu's order; picked ones are lit
  let picked: string[] = [];
  const hoverBox = ui.h('div', 'companion-hoverpick');
  const hoverBtns = ACTIONS.map(([id, iconName]) => {
    const b = ui.h('button', 'companion-hoverbtn');
    b.type = 'button';
    b.title = S.actions[id] ?? id;
    b.setAttribute('aria-label', b.title);
    b.innerHTML = ICONS[iconName] ?? '';
    b.append(ui.h('span', 'companion-hoverlbl', S.actions[id] ?? id));
    b.addEventListener('click', () => {
      const on = picked.includes(id);
      if (!on && picked.length >= MAX_HOVER) return;
      // kept in the menu's order, whatever order they were picked in
      picked = ACTIONS.map(([a]) => a).filter((a) => (a === id ? !on : picked.includes(a)));
      renderHover();
      void save(KEYS.hover, picked.join(','));
    });
    hoverBox.append(b);
    return [id, b] as const;
  });
  const renderHover = () => {
    for (const [id, b] of hoverBtns) {
      const on = picked.includes(id);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = !on && picked.length >= MAX_HOVER;
    }
  };

  const row = (label: string, control: HTMLElement, hint?: string) => {
    const r = ui.h('div', 'companion-row');
    const l = ui.h('div', 'companion-label', label);
    const c = ui.h('div', 'companion-control');
    c.append(control);
    if (hint) c.append(ui.h('p', 'home-note', hint));
    r.append(l, c);
    return r;
  };
  // the World declares this setting on Windows only; elsewhere its value never arrives and the row stays hidden
  const hideFullscreenRow = row('', hideFullscreen.el, S.hideFullscreenHint);
  hideFullscreenRow.hidden = true;
  habits.body.append(
    row(S.language, language, S.languageHint),
    row(S.user, user, S.userHint),
    row(S.botName, botName, S.botNameHint),
    row(S.roam, roam.el),
    row(S.theme, theme.el),
    row(S.scale, scaleBox),
    row(S.bubbleSize, bubbleSize.box, S.bubbleSizeHint),
    row(S.fontSize, fontSize.box, S.fontSizeHint),
    row(S.bubbleSpeed, bubbleSpeed.box, S.bubbleSpeedHint),
    row('', lockFps.el, S.lockFpsHint),
    hideFullscreenRow,
    row('', remember.el, S.rememberHint),
    row(S.hover, hoverBox, S.hoverHint(MAX_HOVER)),
    row('', dblclick.el),
    row('', saidBubbles.el, S.saidBubblesHint),
    row('', selfAdjust.el, S.selfAdjustHint),
    msg,
  );
  root.append(habits.el);

  /* ---------- small talk ---------- */
  const talk = ui.sheet({ title: S.smallTalkTitle });
  const talkMsg = ui.msgline('');
  const smallTalk = ui.checkbox(S.smallTalk, { onChange: (on) => { void save(KEYS.smallTalk, on, GROUP, talkMsg); renderTalk(); } });
  const smallTalkFreq = ui.segmented([
    { value: 'low', label: S.freqLow }, { value: 'mid', label: S.freqMid }, { value: 'high', label: S.freqHigh },
  ], { size: 'sm', onSelect: (v) => void save(KEYS.smallTalkFreq, v, GROUP, talkMsg) });
  const quietFrom = ui.input();
  quietFrom.type = 'time';
  const quietTo = ui.input();
  quietTo.type = 'time';
  const quietBox = ui.h('div', 'companion-rangebox');
  quietBox.append(quietFrom, ui.h('span', 'companion-rangeval', S.quietTo), quietTo);
  const talkStatus = ui.h('p', 'home-note', '');
  for (const [box, key] of [[quietFrom, KEYS.quietFrom], [quietTo, KEYS.quietTo]] as const) {
    box.addEventListener('change', () => {
      if (!/^\d{2}:\d{2}$/.test(box.value)) { box.value = box.dataset.saved ?? ''; return; }
      if (box.value !== box.dataset.saved) { box.dataset.saved = box.value; void save(key, box.value, GROUP, talkMsg); }
    });
  }
  // the quiet hours only matter while it is on
  const renderTalk = () => { quietFrom.disabled = quietTo.disabled = !smallTalk.checked; };
  const renderTalkState = (t: SmallTalkState | undefined) => { talkStatus.textContent = t?.enabled && t.presence === false ? S.noPresence : ''; };
  talk.body.append(
    row('', smallTalk.el, S.smallTalkHint),
    row(S.smallTalkFreq, smallTalkFreq.el, S.smallTalkFreqHint),
    row(S.quietHours, quietBox, S.quietHint),
    talkStatus,
    talkMsg,
  );
  root.append(talk.el);

  /* ---------- sounds ---------- */
  const sounds = ui.sheet({ title: S.soundTitle });
  const soundMsg = ui.msgline('');
  const sound = ui.checkbox(S.sound, { onChange: (on) => { void save(KEYS.sound, on, SOUND_GROUP, soundMsg); renderKinds(); renderSpeech(); } });
  const kindBox = ui.h('div', 'companion-checks');
  const kinds = SOUND_KINDS.map((kind) => {
    const [label, what] = S.kinds[kind] ?? [kind, ''];
    const c = ui.checkbox(label, { title: what, onChange: (on) => { void save(`${K}.sounds.${kind}`, on, SOUND_GROUP, soundMsg); renderSpeech(); } });
    kindBox.append(c.el);
    return [kind, c] as const;
  });
  // the kinds only matter while sounds play at all
  const renderKinds = () => { for (const [, c] of kinds) c.input.disabled = !sound.checked; };
  const snore = ui.input({ type: 'number' });
  snore.min = '0'; snore.max = '3600'; snore.step = '1';
  const snoreBox = ui.h('div', 'companion-rangebox');
  snoreBox.append(snore, ui.h('span', 'companion-rangeval', S.snoreUnit));
  sounds.body.append(
    row('', sound.el, S.soundHint),
    row(S.soundKinds, kindBox, S.soundKindsHint),
    row(S.snore, snoreBox, S.snoreHint),
    soundMsg,
  );
  root.append(sounds.el);

  /* ---------- speech (upstream #263, #299) ---------- */
  const speechSheet = ui.sheet({ title: S.speechTitle });
  const speechMsg = ui.msgline('');
  const speech = ui.checkbox(S.speech, { onChange: (on) => { void save(KEYS.speech, on, SOUND_GROUP, speechMsg); renderSpeech(); } });
  /** A step picker with the custom number under it, shown while 自定义 is picked. */
  const stepPicker = (labels: Record<string, string>, levelKey: string, numKey: string, range: typeof SPEECH_PITCH, unit: string) => {
    let level = 'mid';
    const num = ui.input({ type: 'number' });
    num.min = String(range.min); num.max = String(range.max); num.step = '1';
    const numBox = ui.h('div', 'companion-rangebox');
    numBox.append(num, ui.h('span', 'companion-rangeval', unit));
    const seg = ui.segmented(SPEECH_LEVELS.map((v) => ({ value: v, label: labels[v] ?? v })), {
      size: 'sm',
      onSelect: (v) => {
        if (v === 'custom') {
          // the custom number starts from the step it leaves
          num.value = num.dataset.saved = String(range.steps[level] ?? range.steps.mid);
          void saveAll({ [levelKey]: v, [numKey]: Number(num.value) }, SOUND_GROUP, speechMsg);
        } else void save(levelKey, v, SOUND_GROUP, speechMsg);
        level = v;
        numBox.hidden = v !== 'custom';
      },
    });
    num.addEventListener('change', () => {
      const n = Math.round(Number(num.value));
      if (num.value === '' || !Number.isFinite(n) || n < range.min || n > range.max) { num.value = num.dataset.saved ?? ''; return; }
      num.value = String(n);
      if (num.value !== num.dataset.saved) { num.dataset.saved = num.value; void save(numKey, n, SOUND_GROUP, speechMsg); }
    }, { signal });
    num.addEventListener('keydown', (e) => { if (e.key === 'Enter') num.blur(); }, { signal });
    const box = ui.h('div', 'companion-steps');
    box.append(seg.el, numBox);
    numBox.hidden = true;
    const sync = (values: Record<string, unknown>) => {
      if (typeof values[levelKey] === 'string') { level = values[levelKey] as string; seg.setValue(level); numBox.hidden = level !== 'custom'; }
      if (typeof values[numKey] === 'number' && document.activeElement !== num) num.value = num.dataset.saved = String(values[numKey]);
    };
    const setEnabled = (on: boolean) => {
      for (const b of seg.el.querySelectorAll('button')) b.disabled = !on;
      num.disabled = !on;
    };
    return { box, sync, setEnabled };
  };
  const pitch = stepPicker(S.speechPitchLevels, KEYS.speechPitch, KEYS.speechPitchHz, SPEECH_PITCH, 'Hz');
  const speed = stepPicker(S.speechSpeedLevels, KEYS.speechSpeed, KEYS.speechRate, SPEECH_RATE, S.speechRateUnit);
  const pitchRow = row(S.speechPitch, pitch.box);
  const speedRow = row(S.speechSpeed, speed.box);
  // the speech only plays while sounds and the 说话 kind are on; pitch and speed only matter while it plays
  const renderSpeech = () => {
    speech.input.disabled = !sound.checked;
    const talk = kinds.find(([kind]) => kind === 'talk')![1];
    const audible = sound.checked && talk.checked && speech.checked;
    for (const [r, picker] of [[pitchRow, pitch], [speedRow, speed]] as const) {
      picker.setEnabled(audible);
      r.classList.toggle('is-off', !audible);
    }
  };
  speechSheet.body.append(
    row('', speech.el, S.speechHint),
    pitchRow,
    speedRow,
    speechMsg,
  );
  root.append(speechSheet.el);

  /* ---------- expression decisions ---------- */
  const decider = ui.sheet({ title: S.deciderTitle });
  const deciderMsg = ui.msgline('');
  const deciderOn = ui.checkbox(S.deciderOn, { onChange: (on) => void save(KEYS.deciderOn, on, DECIDER_GROUP, deciderMsg) });
  const deciderModel = ui.input({ placeholder: DEFAULT_DECIDER });
  deciderModel.autocomplete = 'off';
  deciderModel.spellcheck = false;
  const deciderList = ui.h('datalist');
  deciderList.id = 'pet-decider-models';
  deciderModel.setAttribute('list', deciderList.id);
  deciderList.append(Object.assign(document.createElement('option'), { value: DEFAULT_DECIDER }));
  /** The listing as last fetched (the World caches it), by id. */
  let deciderModels: Map<string, DeciderModel> | null = null;
  const modelNote = ui.h('p', 'home-note', '');
  const deciderTimeout = ui.input({ type: 'number' });
  deciderTimeout.min = '500'; deciderTimeout.max = '10000'; deciderTimeout.step = '100';
  const timeoutBox = ui.h('div', 'companion-rangebox');
  timeoutBox.append(deciderTimeout, ui.h('span', 'companion-rangeval', 'ms'));
  const keyBox = ui.h('div', 'companion-rangebox');
  const deciderKey = ui.input({ placeholder: vendorById('openrouter')?.keyHint ?? 'sk-or-…' });
  deciderKey.type = 'password';
  deciderKey.autocomplete = 'off';
  const saveKey = ui.button(S.deciderKeySave, { size: 'sm' });
  keyBox.append(deciderKey, saveKey);
  const deciderStatus = ui.h('p', 'home-note', '');
  decider.body.append(
    row('', deciderOn.el, S.deciderHint),
    row(S.deciderModel, deciderModel, S.deciderModelHint),
    deciderList,
    modelNote,
    row(S.deciderTimeout, timeoutBox, S.deciderTimeoutHint),
    row(S.deciderKey, keyBox, S.deciderKeyHint),
    deciderStatus,
    deciderMsg,
  );
  root.append(decider.el);
  deciderModel.addEventListener('input', () => renderModelNote());
  deciderModel.addEventListener('change', () => {
    const v = deciderModel.value.trim() || DEFAULT_DECIDER;
    deciderModel.value = v;
    renderModelNote();
    if (v !== deciderModel.dataset.saved) { deciderModel.dataset.saved = v; void save(KEYS.deciderModel, v, DECIDER_GROUP, deciderMsg); }
  });
  deciderModel.addEventListener('keydown', (e) => { if (e.key === 'Enter') deciderModel.blur(); });
  deciderTimeout.addEventListener('change', () => {
    const n = Math.round(Number(deciderTimeout.value));
    if (deciderTimeout.value === '' || !Number.isFinite(n) || n < 500 || n > 10000) { deciderTimeout.value = deciderTimeout.dataset.saved ?? '2500'; return; }
    deciderTimeout.value = String(n);
    if (deciderTimeout.value !== deciderTimeout.dataset.saved) { deciderTimeout.dataset.saved = deciderTimeout.value; void save(KEYS.deciderTimeout, n, DECIDER_GROUP, deciderMsg); }
  });
  saveKey.addEventListener('click', () => {
    const vendor = vendorById('openrouter');
    const key = deciderKey.value.trim();
    if (!vendor || !key) return;
    saveKey.disabled = true;
    void saveVendorKey(consoleCall(signal), vendor, key, LANGUAGE).then((r) => {
      if (signal.aborted) return;
      deciderKey.value = '';
      deciderMsg.textContent = r.ok ? S.deciderKeySaved : S.saveFailed(r.why ?? '');
      deciderMsg.classList.toggle('bad', !r.ok);
    }).finally(() => { saveKey.disabled = false; });
  }, opts);
  const renderDecider = (d: DeciderState | undefined) => {
    if (!d) { deciderStatus.textContent = ''; return; }
    const parts = [d.keySet ? S.keyHave : S.keyNone, d.mode === 'decider' ? S.modeDecider : S.modeClassic];
    if (d.mode !== 'decider') parts.push(d.enabled ? (d.keySet ? '' : S.needKey) : S.needSwitch);
    if (d.mode === 'decider') {
      if (d.open) parts.push(S.breaker);
      else if (d.last?.ok) parts.push(S.lastOk(d.last.ms, d.calls ?? 0, d.cost ?? 0));
      else if (d.last && !d.last.ok) parts.push(S.lastBad(d.last.reason ?? ''));
      if (d.unavailable) parts.push(S.modelGone(d.unavailable, d.defaultModel ?? DEFAULT_DECIDER));
      if (d.defaultGone) parts.push(S.defaultGone(d.defaultModel ?? DEFAULT_DECIDER));
      if (d.overridden) parts.push(S.overridden);
    }
    deciderStatus.textContent = parts.filter(Boolean).join(' ');
  };
  const priceText = (m: DeciderModel) => (m.promptPerM === null ? '' : m.promptPerM === 0 ? S.priceFree : S.pricePerM(String(+m.promptPerM.toPrecision(3))));
  const ctxText = (m: DeciderModel) => (m.context === null ? '' : S.ctxTokens(m.context >= 1024 ? `${Math.round(m.context / 1024)}k` : String(m.context)));
  /** Under the box: the chosen model's price and context, or that it is not listed; and where the list came from. */
  let listNote = '';
  const renderModelNote = () => {
    const id = deciderModel.value.trim() || DEFAULT_DECIDER;
    const m = deciderModels?.get(id);
    const about = m ? (priceText(m) || ctxText(m) ? S.modelInfo(priceText(m) || '?', ctxText(m)) : '')
      : deciderModels && listNote === S.modelLive ? (id === DEFAULT_DECIDER ? S.defaultUnlisted : S.modelUnlisted) : '';
    modelNote.textContent = [about, listNote].filter(Boolean).join(' ');
  };
  // OpenRouter's decision models, once a mount (the World fetches the public listing, no key, and keeps it a while)
  void post<{ models?: DeciderModel[]; source?: string }>(panelPath('deciders'), { args: [] }, opts).then((r) => {
    const models = r?.models ?? [];
    deciderModels = new Map(models.map((m) => [m.id, m]));
    deciderList.replaceChildren(...(models.some((m) => m.id === DEFAULT_DECIDER) ? [] : [Object.assign(document.createElement('option'), { value: DEFAULT_DECIDER })]),
      ...models.map((m) => Object.assign(document.createElement('option'), { value: m.id, label: [m.name ?? '', priceText(m), ctxText(m)].filter(Boolean).join(' · ') })));
    listNote = r?.source === 'fallback' ? S.modelFallback : S.modelLive;
    renderModelNote();
  }).catch(() => {});

  /* ---------- behaviour ---------- */
  /** Whether the value was saved. */
  const save = (key: string, value: string | number | boolean, group = GROUP, line = msg): Promise<boolean> => saveAll({ [key]: value }, group, line);
  /** Saves several keys of one group at once (a speech step and its custom number); whether they were saved. */
  async function saveAll(values: Record<string, string | number | boolean>, group = GROUP, line = msg): Promise<boolean> {
    try {
      await setConfig(group, values, opts);
      line.textContent = S.saved;
      line.classList.remove('bad');
      return true;
    } catch (err) {
      if (signal.aborted) return false;
      line.textContent = S.saveFailed(errText(err));
      line.classList.add('bad');
      return false;
    }
  }
  const showScale = () => { scaleText.textContent = `${Math.round(Number(scale.value) * 100)}%`; };
  // saved while the slider moves, so the pet on the desktop grows and shrinks with it
  let scaleTimer: ReturnType<typeof setTimeout> | null = null;
  let scaleSent = '';
  const sendScale = () => {
    scaleTimer = null;
    if (scale.value === scaleSent) return;
    scaleSent = scale.value;
    void save(KEYS.scale, Number(scale.value));
  };
  scale.addEventListener('input', () => { showScale(); scaleTimer ??= setTimeout(sendScale, SCALE_SEND_MS); });
  scale.addEventListener('change', () => { if (scaleTimer) clearTimeout(scaleTimer); sendScale(); });
  signal.addEventListener('abort', () => { if (scaleTimer) clearTimeout(scaleTimer); });
  const saveUser = () => {
    const name = user.value.trim();
    if (name && name !== user.dataset.saved) { user.dataset.saved = name; void save(KEYS.user, name); }
  };
  user.addEventListener('change', saveUser);
  user.addEventListener('keydown', (e) => { if (e.key === 'Enter') user.blur(); });
  botName.addEventListener('change', () => {
    const name = botName.value.trim() || DEFAULT_NAME;
    botName.value = name;
    if (name === botName.dataset.saved) return;
    botName.dataset.saved = name;
    // not saved: the next read (within 3 s) shows the saved name again
    void save(NAME_KEY, name, NAME_GROUP).then((saved) => { if (saved) announceName(name); });
  });
  botName.addEventListener('keydown', (e) => { if (e.key === 'Enter') botName.blur(); });
  snore.addEventListener('change', () => {
    const n = Math.round(Number(snore.value));
    if (snore.value === '' || !Number.isFinite(n) || n < 0 || n > 3600) { snore.value = snore.dataset.saved ?? '0'; return; }
    snore.value = String(n);
    if (snore.value !== snore.dataset.saved) { snore.dataset.saved = snore.value; void save(KEYS.snoreSeconds, n, SOUND_GROUP, soundMsg); }
  });
  snore.addEventListener('keydown', (e) => { if (e.key === 'Enter') snore.blur(); });

  const refreshValues = async () => {
    let values: Record<string, unknown> = {};
    let soundValues: Record<string, unknown> = {};
    let deciderValues: Record<string, unknown> = {};
    let nameValues: Record<string, unknown> = {};
    let appLanguage: Language = 'zh';
    try {
      const d = await get<{ groups?: ConfigEntry[] }>('/api/config', opts);
      appLanguage = storedLanguage(d.groups);
      values = d.groups?.find((g) => g.group.id === GROUP)?.values ?? {};
      soundValues = d.groups?.find((g) => g.group.id === SOUND_GROUP)?.values ?? {};
      deciderValues = d.groups?.find((g) => g.group.id === DECIDER_GROUP)?.values ?? {};
      nameValues = d.groups?.find((g) => g.group.id === NAME_GROUP)?.values ?? {};
    } catch { return; }
    if (typeof deciderValues[KEYS.deciderOn] === 'boolean') deciderOn.setChecked(deciderValues[KEYS.deciderOn] as boolean);
    if (typeof deciderValues[KEYS.deciderModel] === 'string' && document.activeElement !== deciderModel) {
      deciderModel.value = deciderValues[KEYS.deciderModel] as string;
      deciderModel.dataset.saved = deciderModel.value;
      renderModelNote();
    }
    if (typeof deciderValues[KEYS.deciderTimeout] === 'number' && document.activeElement !== deciderTimeout) {
      deciderTimeout.value = String(deciderValues[KEYS.deciderTimeout]);
      deciderTimeout.dataset.saved = deciderTimeout.value;
    }
    void post<{ decider?: DeciderState; smallTalk?: SmallTalkState }>(panelPath('state'), { args: [] }, opts).then((st) => { renderDecider(st?.decider); renderTalkState(st?.smallTalk); }).catch(() => {});
    const active = document.activeElement;
    if (active !== language && !language.disabled) {
      languageOption(appLanguage);
      language.value = appLanguage;
      language.dataset.saved = appLanguage;
    }
    if (typeof values[KEYS.user] === 'string' && active !== user) {
      user.value = values[KEYS.user] as string;
      user.dataset.saved = user.value;
    }
    if (typeof nameValues[NAME_KEY] === 'string' && active !== botName) {
      botName.value = nameValues[NAME_KEY] as string;
      botName.dataset.saved = botName.value;
    }
    if (typeof values[KEYS.roam] === 'string') roam.setValue(values[KEYS.roam] as string);
    if (typeof values[KEYS.theme] === 'string') theme.setValue(values[KEYS.theme] as string);
    if (typeof values[KEYS.scale] === 'number' && active !== scale) { scale.value = String(values[KEYS.scale]); showScale(); }
    for (const sz of [bubbleSize, fontSize, bubbleSpeed]) {
      if (active !== sz.input) { sz.input.value = String(typeof values[sz.key] === 'number' ? values[sz.key] : 1); sz.show(); }
    }
    if (typeof soundValues[KEYS.sound] === 'boolean') sound.setChecked(soundValues[KEYS.sound] as boolean);
    for (const [kind, c] of kinds) {
      const v = soundValues[`${K}.sounds.${kind}`];
      if (typeof v === 'boolean') c.setChecked(v);
    }
    renderKinds();
    if (typeof soundValues[KEYS.speech] === 'boolean') speech.setChecked(soundValues[KEYS.speech] as boolean);
    pitch.sync(soundValues);
    speed.sync(soundValues);
    renderSpeech();
    if (typeof soundValues[KEYS.snoreSeconds] === 'number' && active !== snore) {
      snore.value = String(soundValues[KEYS.snoreSeconds]);
      snore.dataset.saved = snore.value;
    }
    if (typeof values[KEYS.lockFps] === 'boolean') lockFps.setChecked(values[KEYS.lockFps] as boolean);
    if (typeof values[KEYS.hideFullscreen] === 'boolean') { hideFullscreen.setChecked(values[KEYS.hideFullscreen] as boolean); hideFullscreenRow.hidden = false; }
    if (typeof values[KEYS.remember] === 'boolean') remember.setChecked(values[KEYS.remember] as boolean);
    if (typeof values[KEYS.dblclick] === 'boolean') dblclick.setChecked(values[KEYS.dblclick] as boolean);
    if (typeof values[KEYS.saidBubbles] === 'boolean') saidBubbles.setChecked(values[KEYS.saidBubbles] as boolean);
    if (typeof values[KEYS.selfAdjust] === 'boolean') selfAdjust.setChecked(values[KEYS.selfAdjust] as boolean);
    if (typeof values[KEYS.smallTalk] === 'boolean') smallTalk.setChecked(values[KEYS.smallTalk] as boolean);
    renderTalk();
    if (typeof values[KEYS.smallTalkFreq] === 'string') smallTalkFreq.setValue(values[KEYS.smallTalkFreq] as string);
    for (const [box, key] of [[quietFrom, KEYS.quietFrom], [quietTo, KEYS.quietTo]] as const) {
      const v = values[key];
      if (typeof v === 'string' && active !== box) { box.value = /^\d:/.test(v) ? `0${v}` : v; box.dataset.saved = box.value; }
    }
    if (typeof values[KEYS.hover] === 'string') {
      picked = (values[KEYS.hover] as string).split(',').map((x) => x.trim()).filter((x) => ACTIONS.some(([a]) => a === x));
      renderHover();
    }
  };

  await refreshValues();
  ctx.lifecycle.interval(() => void refreshValues(), 3000);
}

export const petFeature: FrameworkFeature = {
  route: 'pet',
  label: S.nav,
  icon: 'bot',
  navMode: 'primary',
  mount,
};
