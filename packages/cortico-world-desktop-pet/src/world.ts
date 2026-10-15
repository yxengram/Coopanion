/**
 * DesktopPetWorld: the pet on the desktop as a World.
 *
 * Output goes through the pet tools (say, ask, walk_to, act, set, quiet) that drive the pet page
 * (bubble, options, walking, expressions and motions, its own look and habits, a quiet spell). Input arrives as events: speech heard through the pet window's
 * microphone (transcribed by FunASR's SenseVoice in this process, or Windows' own recognizer), typed text, answers to `pet_ask`, and touches
 * (poke, petting, being thrown). The page reports what actually happened; receipts and
 * events state only that.
 *
 * Processes owned here: the page server (always, while mounted), the pet window (when
 * `window.enabled`) and the system recognizer's helper (voice input on, engine `system`). FunASR runs
 * in this process once its model is downloaded.
 */
import type { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type {
  BlobInput, EventEnvelope, Logger, OutputTap, RunPhase, ToolCallContext, ToolDef, ToolOutcome, TriggerMode, World, WorldConsoleDecl,
  WorldHost, WorldLamp, WorldPanelDecl, WorldStreamSocket,
} from 'cortico/core/types.ts';
import { nowIso, shortTime } from 'cortico/core/util.ts';
import type { Language } from 'cortico/core/language.ts';
import type { DeepPartial } from 'cortico/world.ts';
import {
  DESKTOP_PET_ASR_CONFIG_GROUP, DESKTOP_PET_CONFIG_GROUP, DESKTOP_PET_DECIDER_CONFIG_GROUP, DESKTOP_PET_DEFAULTS, DESKTOP_PET_ID, DESKTOP_PET_SOUND_CONFIG_GROUP, MAX_HOVER_BUTTONS, PET_ACTIONS, hoverButtonList,
  type AsrEngine, type DesktopPetConfigSection, type MicMode, type PetSkin, type PetTheme, type RoamMode,
} from './config.ts';
import { PetServer, type PageMessage } from './server.ts';
import { WindowHost, resolveHostCommand } from './window-host.ts';
import { RuntimeStore, type ModelSpec } from './runtime/store.ts';
import { FunAsrRecognizer, type FunAsrState, type SherpaModule } from './asr/funasr.ts';
import { SystemRecognizer, systemRecognizerSupported, type SystemRecognizerState, type SystemSentence } from './asr/system-recognizer.ts';
import { Packer, Segmenter, rmsDb, type SegmentConfig, type SegmentSink, type Utterance } from './asr/segmenter.ts';
import { comboLabel, hotkeyBadge, hotkeyLabel, parseHotkey, splitTaps, watchHotkey, type KeyWatcher } from './asr/hotkey.ts';
import { joinSpeech, looksHallucinated } from './asr/result.ts';
import { toSimplified } from './asr/simplify.ts';
import { APPENDAGES, channelsOf, estimateSeconds, firstName, lastingNote, membersOf, parseActions, parseScript, vocabTable, type Pairs, type VocabWord } from './script.ts';
import { ActivityGroup, ChatSockets, SELF_TYPE, chatHistory, chatItem } from './chat.ts';
import { DECIDER_TOOL_DECLS, DESKTOP_PET_TOOL_DECLS } from './tools.ts';
import {
  DECIDER_FALLBACK_MODELS, DECIDER_HOLD_MS, DECIDER_MIN_CONTEXT, DECIDER_MODELS_URL, DECIDER_URL, DeciderClient, FEELING_MAX, listDeciders, POSTURE_NAMES, buildQuestions, buildRequest, buildState, failureText, pickGroup, stripMarkers, topAnswers,
  type DecideFailure, type DeciderModel, type DecisionRecord, type Posture, type QuestionId,
} from './decider.ts';
import { COO, figurePacks, lookOf, nameIn, packFor, unaliasSkin, type FigurePack } from './packs.ts';
import { dressTable, planSettings, type SettingChange } from './self.ts';

export const DESKTOP_PET_PANEL_DECLS: readonly WorldPanelDecl[] = [
  { id: 'pet', title: '桌宠', description: '窗口、装扮与窗口运行时。', getMethods: ['state'] },
  { id: 'voice', title: '语音输入', description: '识别引擎、电平与识别结果。', getMethods: ['state'] },
  { id: 'chat', title: '对话', description: '对话页:打字和发图给它,看它说过的话与做过的事。', getMethods: ['blob'] },
];

const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));
const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));
const ENV_PROMPT_DECIDER_FILE = fileURLToPath(new URL('./ENV_PROMPT_DECIDER.md', import.meta.url));
/** How often decider mode looks again whether the app has an OpenRouter key (it reads a small file). */
const KEY_POLL_MS = 5000;
/** What the person said last is told to the decision model for this long. */
const HEARD_MS = 10 * 60_000;
/** Decisions remembered for the next ones (repeats, the state's 最近做过). */
const RECENT_DECISIONS = 5;
/** A walk that ends this many pixels short of what was asked was stopped at the screen's edge. */
const CLAMP_SLACK_PX = 8;
/** A position event armed this long without being rendered is armed again (one that never came back is replaced). */
const POSE_REARM_MS = 5 * 60_000;
/** How long a posture word sent is told as her posture before the page shows it (see `pendingPosture`). */
const POSTURE_PENDING_MS = 4000;
/** How long a kneel word sent waits for the page to sit down before the kneel is forgotten. */
const KNEEL_WAIT_MS = 10_000;
/** How long OpenRouter's listing of decision models is kept before it is fetched again. */
const DECIDER_LIST_TTL_MS = 6 * 3600_000;
/** The posture each posture word puts her in. */
const POSTURE_OF_WORD: Readonly<Record<string, Posture>> = { sit: 'sit', kneel: 'kneel', lie: 'lie', sleep: 'sleep', stand: 'stand' };
/** Which way the bot's prompt and tools go: words and markers (classic), or a feeling the decision model turns into words. */
export type PetMode = 'classic' | 'decider';

/** Longest `pet_quiet`: a quiet that outlasts a day is a setting, which `pet_set` changes. */
const QUIET_MAX_MIN = 24 * 60;
const FRAME_MS = 20;
const SAMPLE_RATE = 16_000;
const WALK_TIMEOUT_MS = 30_000;
/** Touches of one kind closer than this are reported as one event with a count. */
const TOUCH_MERGE_MS = 2500;
/** How long a confirmation bubble waits for an answer. */
const CONFIRM_TIMEOUT_MS = 60_000;
/** History events read per chat page load; the page asks for the ones before by cursor. */
const CHAT_PAGE_EVENTS = 300;
/** A message from the chat page: text cut to this, up to IMAGES_MAX images of at most IMAGE_MAX_BYTES each, as the terminal World takes them. */
const CHAT_TEXT_MAX = 4000;
const IMAGES_MAX = 8;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
/** How often config edits from the console reach the pages: short enough that the size slider moves the pet with it. */
const PREFS_SYNC_MS = 150;
/** Talk-key polling interval: well under the shortest key tap. */
const HOTKEY_POLL_MS = 30;

/**
 * Run controls an embedding app lends the pet's menu. Each button shows only when its control is
 * lent: pause/resume needs `isPaused` and `setPaused`, settings `openSettings`, the power button
 * `quit`. Without any the menu header shows only the avatar and the name.
 */
export interface PetBotControls {
  isPaused?(): boolean;
  setPaused?(paused: boolean): void;
  openSettings?(): void;
  /** Shows the chat page; the bubble's expand button carries its draft there. */
  openChat?(): void;
  /** Shows the embedding app's own dress page; the menu's 「装扮」 then opens it instead of the pet's dress window. */
  openDress?(): void;
  quit?(): void;
  /** The power button's label, e.g. "退出 Coopanion". */
  quitLabel?: string;
  /** Runs the embedding app's introduction again (the console's `pet.guide` panel method). */
  guide?(): void;
}

/**
 * One step of a conversation an embedding app holds through the pet's bubble (`dialog`): Coo says
 * `text`, then shows `input`, if any, in the same bubble. `step` draws progress dots, `closable`
 * a close button.
 */
export interface PetDialog {
  text: string;
  /** Words in `text` drawn in the theme color, such as a name said for the first time. */
  marks?: string[];
  /** Expressions and motions (vocabulary words) played as the line starts. */
  actions?: string[];
  step?: [number, number];
  closable?: boolean;
  input?: PetDialogInput;
}

/**
 * - `buttons`: a row of buttons, answered with the index; `keys` shows a key cap above them, pressed
 *   `taps` times over and over, the last press held (a talk key tapped, then held).
 * - `choices`: cards to try out before `confirm`, each with an optional level tag and icon (a web/ui.js
 *   `ICONS` name, or `image`, a `data:image/…` URL such as a service's logo); a card's `line` is typed when it is picked and
 *   its `motion` played (standing still, strolling, running about) until another is picked.
 * - `text`: a text box answered with the text; `secret` hides what is typed, `suggestions` are offered
 *   as the person types, `link` opens a page in the browser, `alt` is a second way out, answered as `{ alt: true }`.
 * - `progress`: a bar the app moves with `update({ progress })`; it ends when the app closes it.
 */
export type PetDialogInput =
  | { kind: 'buttons'; options: Array<{ label: string; primary?: boolean }>; keys?: string; taps?: number }
  | { kind: 'choices'; options: Array<{ label: string; level?: string; icon?: string; image?: string; line?: string; motion?: 'still' | 'walk' | 'run' }>; value?: number; confirm: string }
  | { kind: 'text'; submit: string; placeholder?: string; value?: string; secret?: boolean; maxLength?: number; suggestions?: string[]; link?: { label: string; url: string }; alt?: string }
  | { kind: 'progress'; label?: string };

/**
 * How a step ended: a button or card (`index`), typed text, the text box's `alt`, the close
 * button, the line read to the end with nothing to answer (`done`, also a progress step the app
 * closed), or no pet page to show it on.
 */
export type PetDialogAnswer =
  | { index: number } | { text: string } | { alt: true } | { closed: true } | { done: true } | { unavailable: true };

/** What the app changes on a step while it is up: the line, and a progress step's bar (0–1, or null while there is no telling). */
export interface PetDialogUpdate {
  text?: string;
  progress?: number | null;
}

export interface PetDialogHandle {
  readonly answer: Promise<PetDialogAnswer>;
  /** Words of `actions` the body on screen does not know (not in its vocabulary): left out, and logged. */
  readonly dropped: readonly string[];
  update(patch: PetDialogUpdate): void;
  /** Takes the step off the bubble; an unanswered one resolves `done`. */
  close(): void;
}

/** How a confirmation ended: one of the two choices, closed, no answer in time, or no pet page to ask on. */
export type ConfirmResult = 'yes' | 'no' | 'dismissed' | 'timeout' | 'unavailable';

export interface DesktopPetWorldOptions {
  cfg: DesktopPetConfigSection;
  timezone: string;
  persist: (patch: DeepPartial<DesktopPetConfigSection>) => void;
  runtimesRoot: () => string;
  modelsDir: () => string;
  /** Downloads; tests pass a local stand-in. */
  fetchImpl?: typeof fetch;
  /** Loads sherpa-onnx; tests pass a fake recognizer. */
  loadSherpa?: () => SherpaModule;
  /** The speech model to download; tests pass a small one. */
  funasrModel?: ModelSpec;
  /** Shown in the menu header. */
  botName?: string;
  /** PNG shown as the avatar in the menu header, when it exists. */
  avatarFile?: string;
  controls?: PetBotControls;
  /** Reads the talk key; tests pass a scripted one. */
  watchHotkey?: typeof watchHotkey;
  /** Starts the system recognizer's helper; tests pass a fake. */
  spawnSystemRecognizer?: typeof spawn;
  /** Directories whose subdirectories are installed figure packs (src/packs.ts). */
  packRoots?: () => string[];
  /** Called after the bot changed settings itself (`pet_set`), so an app watching the config knows it was not the person. */
  onBotChange?: () => void;
  /**
   * The OpenRouter key decider mode uses, read at each use ('' when there is none); the World never keeps, writes or
   * logs it. Without this lent, the World stays in classic mode.
   */
  deciderKey?: () => string;
  /** Called when the mode changes (a key appears or goes, the setting flips), so the app rebuilds the prefix. */
  onModeChange?: (mode: PetMode) => void;
  /** Called after each decision, with what was asked and answered (never the key); evals and tests read it. */
  onDecision?: (rec: DecisionRecord) => void;
  /** The decisions endpoint; tests and evals point it at a local stand-in. */
  deciderUrl?: string;
  /** Fetch for the decisions endpoint and the listing of decision models; tests pass a fake. */
  deciderFetch?: typeof fetch;
  /** Where the decision models are listed (default OpenRouter's public model list, DECIDER_MODELS_URL); no key is sent. */
  deciderModelsUrl?: string;
  /** The decider client's clock (its breaker); tests pass a fake. */
  deciderNow?: () => number;
  /**
   * The deployment's override of the environment prompt (Cortico reads `<deployment>/worlds/desktop-pet/ENV_PROMPT.md`
   * whichever mode's template is declared): in decider mode its presence is warned of, since it is the classic text.
   */
  envOverrideFile?: () => string | null;
}

/** One decision as the tools use it: the entries to send (and notes for the receipt), or why there are none. */
type Decided = { ok: true; actions: string[]; notes: string[] } | { ok: false; reason: DecideFailure; why: string };

/** How a walk ended: the page's report (`x` a share of the screen), no report in time, or the World or page gone. */
type WalkEnd =
  | { t: 'arrived' | 'interrupted'; x: number | null; by?: unknown; stopping?: boolean }
  | { t: 'timeout' | 'stopped' | 'gone' };

interface PendingWalk {
  resolve: (end: WalkEnd) => void;
  timer: NodeJS.Timeout;
  /** The call's interrupt asked the page to stop the walk. */
  stopping?: boolean;
}

interface PendingAsk {
  id: string;
  question: string;
  options: string[];
}

interface TouchBatch {
  kind: string;
  count: number;
  woke: boolean;
  asleep: boolean;
  x: number | null;
  crashed: boolean;
  timer: NodeJS.Timeout;
}

interface HeardLine { text: string; at: number; ms: number; dropped?: boolean }

interface PendingConfirm {
  resolve: (result: ConfirmResult) => void;
  timer: NodeJS.Timeout;
}

/** The environment prompt's variables (decider mode's template has no `pet.vocab`). */
const PROMPT_VARS = [
  { name: 'pet.user', description: '对使用者的称呼' },
  { name: 'pet.vocab', description: '当前形象的表情与动作词表(开头一句用这些词写的例子)', multiline: true },
  { name: 'pet.voice', description: '语音输入开着还是关着' },
  { name: 'pet.body', description: '当前形象的样子' },
  { name: 'pet.dress', description: 'pet_set 能选的形象与打扮', multiline: true },
  { name: 'pet.self', description: '「允许自己调整」开着还是关着' },
  { name: 'pet.chat', description: '应用提供对话页时,对它的说明;没有时为空' },
];

/** Characters a step's line is shown for per second (typing, then reading), for its time limit. */
const DIALOG_CPS = 4;

let seq = 0;
const nextId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** The first expression among a beat's words (a group's members too) for the chat page's tag: its id, and its first name in each language of the body's vocabulary. */
function moodOf(actions: readonly string[], vocab: readonly VocabWord[]): { mood?: Record<string, string> } {
  const v = membersOf(actions).map((a) => vocab.find((e) => e.id === a)).find((e) => e?.kind === 'expression' && e.id !== 'neutral');
  if (!v) return {};
  return { mood: { id: v.id, ...Object.fromEntries(Object.entries(v.names).flatMap(([lang, names]) => (names[0] ? [[lang, names[0]]] : []))) } };
}

/** Images of a chat page message: the whole batch is taken, or the reason it is not. */
function parseChatImages(raw: unknown, user: string): { ok: true; blobs: BlobInput[] } | { ok: false; reason: string } {
  if (raw === undefined) return { ok: true, blobs: [] };
  if (!Array.isArray(raw)) return { ok: false, reason: '图片格式不对' };
  if (raw.length > IMAGES_MAX) return { ok: false, reason: `一次最多 ${IMAGES_MAX} 张图` };
  const blobs: BlobInput[] = [];
  for (const [i, item] of raw.entries()) {
    const img = (item ?? {}) as { mime?: unknown; base64?: unknown; name?: unknown };
    if (typeof img.mime !== 'string' || !IMAGE_MIMES.has(img.mime)) return { ok: false, reason: `不支持的图片格式 ${String(img.mime)}` };
    const bytes = typeof img.base64 === 'string' ? Buffer.from(img.base64, 'base64') : Buffer.alloc(0);
    if (bytes.length === 0) return { ok: false, reason: '有一张图是空的' };
    if (bytes.length > IMAGE_MAX_BYTES) return { ok: false, reason: `单张图不能超过 ${IMAGE_MAX_BYTES / 1048576} MB` };
    const name = typeof img.name === 'string' && img.name.trim() ? img.name.trim().slice(0, 120) : undefined;
    blobs.push({ bytes, mime: img.mime, ...(name ? { name } : {}), fallbackText: `[${user}发来的图片 ${i + 1}/${raw.length}]` });
  }
  return { ok: true, blobs };
}

export class DesktopPetWorld implements World {
  readonly id = DESKTOP_PET_ID;
  private host: WorldHost | null = null;
  private log: Logger | null = null;
  private readonly cfg: DesktopPetConfigSection;
  private readonly server: PetServer;
  private windowHost: WindowHost | null = null;
  private readonly store: RuntimeStore;
  private funasr: FunAsrRecognizer | null = null;
  private system: SystemRecognizer | null = null;
  /** The engine the running backend belongs to; a config change starts the other one. */
  private runningEngine: AsrEngine | null = null;
  /** The person asked to send what was heard now, without waiting for the pause that ends a sentence. */
  private committing = false;
  private readonly segmenter: Segmenter;
  private readonly packer = new Packer({ joinGapMs: 0, maxHoldMs: 8000, minChars: 1 });
  private readonly queue: Utterance[] = [];
  private transcribing = false;
  private packTimer: NodeJS.Timeout | null = null;
  private wasSpeaking = false;
  private screen: { w: number; h: number } | null = null;
  private busyUntil = 0;
  private readonly walks = new Map<string, PendingWalk>();
  private ask: PendingAsk | null = null;
  private touch: TouchBatch | null = null;
  /** A touch has woken the bot and no turn has ended since; touches until then wait for the next wake. */
  private touchWoke = false;
  /** The local date of the last event's time stamp; the next event on another date names its date again. */
  private stampDay = '';
  private prefsKey = '';
  private prefsTimer: NodeJS.Timeout | null = null;
  /** Where the pet window last said the pet stands, measured as `petX` is; written by `savePosition` on stop. */
  private standX: number | null = null;
  private thinking = false;
  private readonly voiceSockets = new Set<WorldStreamSocket>();
  private lastLevelAt = 0;
  private readonly heard: HeardLine[] = [];
  private readonly counts = { utterances: 0, delivered: 0, dropped: 0 };
  private micState: { state: string; detail: string | null } = { state: 'off', detail: null };
  private devices: Array<{ id: string; label: string }> = [];
  private readonly confirms = new Map<string, PendingConfirm>();
  private readonly dialogs = new Map<string, (a: PetDialogAnswer) => void>();
  /** The talk key is down (hold) or was switched on (toggle). */
  private talking = false;
  private keyWatcher: KeyWatcher | null = null;
  /** Why the talk key cannot be read; the gate then stays open as in `always`. */
  private hotkeyProblem: string | null = null;
  private hotkeyKey = '';
  private level = -100;
  private readonly chat = new ChatSockets();
  private readonly activity = new ActivityGroup();
  private phase: RunPhase | null = null;
  /** The person's messages (typed, spoken) not yet delivered to the bot, by cursor. */
  private readonly pendingChat = new Set<number>();
  /** Text the bubble's expand button carried, until a chat page takes it. */
  private draft: string | null = null;
  private pausedShown: boolean | null = null;

  /* decider mode (src/decider.ts) */
  /** The mode the prompt and tools were last built for; changed only by `refreshMode`. */
  private mode: PetMode = 'classic';
  /** Whether the app had a key when last looked (every KEY_POLL_MS). */
  private keyKnown = false;
  private keyCheckedAt = 0;
  private readonly decider: DeciderClient;
  /** Where the page last said the body is: x and the screen width in px, facing, and its layout mode. */
  private pose: { x: number; w: number; facing: 1 | -1; mode: string } | null = null;
  /** The last posture word sent was a kneel and nothing that ends one followed (the page shows a kneel as `sit`). */
  private kneeling = false;
  /** When the last kneel word was sent: a kneel that has not shown on the page within KNEEL_WAIT_MS is let go. */
  private kneelAt = 0;
  /**
   * A posture word just sent that the page has not shown yet (it does it on its next frame, or when its bubble's turn
   * comes): `posture()` tells it until the page's mode changes from what it was (`from`) or POSTURE_PENDING_MS pass.
   */
  private pendingPosture: { posture: Posture; from: string | null; at: number } | null = null;
  /** What the person said last (typed, spoken, answered), for the decision model. */
  private lastHeard: { text: string; via: string; at: number } | null = null;
  /** The last decisions, most recent first. */
  private readonly recentPicks: Array<{ at: number; words: string[]; chosen: Partial<Record<QuestionId, string | null>> }> = [];
  /** The one position event waiting to ride on the next batch: when it was armed, and its token (an older one renders nothing). */
  private poseArmedAt: number | null = null;
  private poseToken = 0;
  private overrideWarned = false;
  /** OpenRouter's listing of decision models, as last fetched (kept when a later fetch fails), and the fetch in flight. */
  private deciderList: { at: number; models: DeciderModel[] } | null = null;
  private deciderListing: Promise<DeciderModel[] | null> | null = null;
  /**
   * Decisions run one after another, in the order the bot asked for them: each sees the one before it in 最近做过,
   * the repeat rule and her posture, and the page gets each bubble's words in order. `pet_say` and `pet_ask` do not
   * wait for theirs; the chat page's records of bubbles and questions go through here too, so they stay in order.
   */
  private deciderQueue: Promise<void> = Promise.resolve();
  /** Words picked for bubbles after their receipts went back, told once with the next position line. */
  private unreported: Array<{ text: string; did: string }> = [];
  private stopped = false;

  constructor(private readonly opts: DesktopPetWorldOptions) {
    this.cfg = opts.cfg;
    this.decider = new DeciderClient({
      url: () => opts.deciderUrl ?? DECIDER_URL,
      key: () => this.deciderKey(),
      timeoutMs: () => this.deciderCfg().timeoutMs,
      fetch: opts.deciderFetch,
      now: opts.deciderNow,
      log: () => this.log,
    });
    // tools() and envPromptVars() may be asked before start: the mode is known from the first call
    this.keyKnown = this.deciderKey() !== '';
    this.keyCheckedAt = Date.now();
    this.mode = this.wantedMode();
    this.segmenter = new Segmenter(this.segmentConfig(), FRAME_MS);
    this.segmenter.setSink(this.sink);
    this.store = new RuntimeStore({ runtimesRoot: opts.runtimesRoot, modelsDir: opts.modelsDir, fetchImpl: opts.fetchImpl, funasrModel: opts.funasrModel });
    this.server = new PetServer({
      port: () => this.cfg.port,
      webDir: WEB_DIR,
      snapshot: () => this.snapshot(),
      onPetMessage: (msg) => this.onPage(msg),
      onAudio: (frame) => this.onAudio(frame),
      onPetConnect: () => { this.log?.info('桌宠页面已连接'); },
      onPetDisconnect: () => this.onPageGone(),
      onSkin: (skin) => this.saveSkin(skin),
      onPrefs: (prefs) => this.savePrefs(prefs),
      avatarFile: opts.avatarFile,
      packs: () => this.packs(),
    });
  }

  /* ---------- figures ---------- */

  /** Pack problems already logged, so a broken pack is reported once, not on every scan. */
  private readonly packProblems = new Set<string>();
  /** The figure (and a pack's pick, `id:scheme`) the pet page last said it shows, null before it said. */
  private figureShown: string | null = null;
  /** The figure the page said would not run, while the skin still names it: the page shows Coo meanwhile. */
  private figureFailed: string | null = null;
  /** A look the bot put on itself: the pet page's report of it is not told back (the receipt said it). */
  private botLook: string | null = null;
  /** `pet_quiet` in force: what it overrides, until when, and the settings it found (a change to them ends it). */
  private quiet: { sound: boolean; roam: RoamMode; until: number; base: { sound: boolean; roam: RoamMode }; timer: NodeJS.Timeout } | null = null;

  /** The built-in packs, then the installed ones; scanned on each call (a few small files). */
  packs(): FigurePack[] {
    const { packs, problems } = figurePacks(this.opts.packRoots?.() ?? []);
    for (const p of problems) if (!this.packProblems.has(p)) { this.packProblems.add(p); this.log?.warn(`形象包没加载:${p}`); }
    return packs;
  }

  /** The skin with an aliased figure as its built-in pack (packs.ts `PACK_ALIASES`): what the pages and the bot see. */
  private get skin(): PetSkin {
    return unaliasSkin(this.cfg.skin);
  }

  /** The pack of the figure the skin asks for (Coo for one that is not installed); null only when even Coo's would not load. */
  private currentPack(): FigurePack | null {
    const figure = this.skin.figure ?? COO;
    return packFor(this.packs(), figure === this.figureFailed ? COO : figure);
  }
  /** The words the body on screen does. */
  private vocab() {
    return this.currentPack()?.manifest.vocab ?? [];
  }
  /** The pairs of expressions the body on screen shows as one face when both are in one group (its pack's `pairs`). */
  private pairs(): Pairs {
    return this.currentPack()?.manifest.pairs ?? {};
  }

  /** What the body looks like now, with its picked options and the words it does not do. */
  private bodyText(pack: FigurePack | null): string {
    if (!pack) return '';
    const m = pack.manifest;
    const scheme = lookOf(pack, this.skin);
    const picks = scheme.split('-');
    const preset = m.presets.find((p) => p.id === scheme);
    const chosen = m.axes.map((a, i) => {
      const o = a.options.find((x) => x.id === (preset?.pick[a.id] ?? picks[i])) ?? a.options[0]!;
      return `${nameIn(a.name)}:${nameIn(o.name)}`;
    });
    return `${nameIn(m.name)},${nameIn(m.about)}${chosen.length ? `(${chosen.join(',')})` : ''}`;
  }

  /**
   * The pet page's report of the figure it shows: a switch the bot did not see in its prompt is told
   * after the debounce (changes in a row come as one batch); a pack that would not load (the page then
   * shows Coo) is told at once.
   */
  private onFigure(msg: PageMessage): void {
    const id = typeof msg.id === 'string' ? msg.id : COO;
    const before = this.figureShown;
    const packs = this.packs();
    if (msg.ok !== true) {
      this.figureShown = COO;
      this.figureFailed = id;
      const pack = packs.find((p) => p.id === id);
      const reason = typeof msg.reason === 'string' ? msg.reason.slice(0, 200) : '原因不明';
      // the page shows Coo instead, whose words then hold too
      const coo = packs.find((p) => p.id === COO) ?? null;
      void this.push('desktop-pet.figure', 'desktop-pet.figure', `[形象] ${pack ? nameIn(pack.manifest.name) : id}没能显示出来(${reason}),你现在是${this.bodyText(coo)}。表情和动作按 Coo 的词表。`, 'flush');
      return;
    }
    if (id === this.skin.figure) this.figureFailed = null;
    const shown = id === COO ? COO : `${id}:${typeof msg.scheme === 'string' ? msg.scheme : ''}`;
    this.figureShown = shown;
    if (before === null || before === shown) return;
    if (shown === this.botLook) { this.botLook = null; return; }
    const pack = packs.find((p) => p.id === id) ?? null;
    void this.push('desktop-pet.figure', 'desktop-pet.figure', `[形象] 你现在的样子:${this.bodyText(pack)}。`, 'debounce');
  }

  /* ---------- lifecycle ---------- */

  async start(host: WorldHost): Promise<void> {
    this.stopped = false;
    this.host = host;
    this.log = host.log;
    await this.server.start();
    this.windowHost = new WindowHost(host.log);
    if (this.cfg.window.enabled) this.openWindow();
    this.funasr = new FunAsrRecognizer({
      model: () => this.funasrModel(),
      language: () => this.cfg.asr.language,
      threads: () => this.cfg.asr.threads,
      log: host.log,
      load: this.opts.loadSherpa,
    });
    this.system = new SystemRecognizer({
      language: () => this.cfg.asr.language,
      timeoutMs: () => this.cfg.asr.timeoutMs,
      log: host.log,
      spawnImpl: this.opts.spawnSystemRecognizer,
    });
    if (this.cfg.asr.enabled) void this.startVoiceBackend();
    await this.syncHotkey();
    this.prefsKey = this.prefsSignature();
    this.prefsTimer = setInterval(() => this.syncPrefs(), PREFS_SYNC_MS);
    if (this.mode === 'decider') {
      host.log.info(`表情动作交给决策模型挑(${this.deciderCfg().model})`);
      this.warnOverride();
      this.armPose();
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.decider.abortAll();
    this.unreported = [];
    this.poseArmedAt = null;
    if (this.quiet) clearTimeout(this.quiet.timer);
    this.quiet = null;
    if (this.prefsTimer) clearInterval(this.prefsTimer);
    this.prefsTimer = null;
    this.savePosition();
    if (this.packTimer) clearTimeout(this.packTimer);
    this.packTimer = null;
    if (this.touch) clearTimeout(this.touch.timer);
    this.touch = null;
    this.touchWoke = false;
    this.keyWatcher?.stop();
    this.keyWatcher = null;
    for (const c of this.confirms.values()) { clearTimeout(c.timer); c.resolve('unavailable'); }
    this.confirms.clear();
    for (const d of this.dialogs.values()) d({ unavailable: true });
    this.dialogs.clear();
    for (const w of this.walks.values()) { clearTimeout(w.timer); w.resolve({ t: 'stopped' }); }
    this.walks.clear();
    for (const s of this.voiceSockets) s.close('stopped');
    this.voiceSockets.clear();
    this.chat.closeAll('stopped');
    await this.windowHost?.stop();
    await this.funasr?.stop();
    await this.system?.stop();
    await this.server.stop();
    this.host = null;
  }

  onTurnEnded(): void {
    this.touchWoke = false;
    this.setThinking(false);
  }

  outputTap(): OutputTap | undefined {
    if (!this.server.petConnected) return undefined;
    return {
      // the pet shows nothing of the stream itself; its tools act when they run
      externalizes: () => false,
      onEvent: () => this.setThinking(true),
      onRoundEnd: () => this.setThinking(false),
      onAbort: () => this.setThinking(false),
    };
  }

  onRunPhase(phase: RunPhase): void {
    this.phase = phase;
    if (this.activity.observe(phase, Date.now())) this.chat.broadcast({ t: 'activity', steps: this.activity.steps, startedAt: this.activity.startedAt });
    if (phase.state === 'idle') void this.closeActivity();
    this.chat.broadcast({ t: 'phase', phase });
  }

  /**
   * A message that waited shows where the bot took it in: the steps done before that are recorded
   * first, then a `delivered` record the history places the message at.
   */
  onEventsSettled(events: readonly EventEnvelope[], outcome: 'delivered' | 'discarded'): void {
    const cursors = events.map((e) => e.cursor).filter((c) => this.pendingChat.delete(c));
    if (!cursors.length) return;
    void (async () => {
      await this.closeActivity();
      const later = (this.host?.store.latestCursor() ?? 0) > Math.max(...cursors);
      const at = outcome === 'delivered' && later
        ? await this.record({ kind: 'delivered', cursors }, `送达了 ${cursors.map((c) => `#${c}`).join('、')}`)
        : null;
      this.chat.broadcast({ t: 'settled', cursors, outcome, ...(at !== null ? { at } : {}) });
    })();
  }

  /** The steps since the pet's last line become one record: before each line, when the loop goes idle, before a waiting message is placed. */
  private async closeActivity(): Promise<void> {
    const group = this.activity.take(Date.now());
    if (!group) return;
    this.chat.broadcast({ t: 'activity', steps: null });
    await this.record({ kind: 'activity', ...group }, `做了:${group.steps.join('、')}`);
  }

  /**
   * One frame from a chat page:
   * - `hello`: the history, the messages still pending, the loop's phase and the pause, and a draft the bubble carried
   * - `more { before }`: the history before that cursor
   * - `send { id, text, images }`: a message typed on the page, delivered with `preempt`; answered with `sent { id, cursor }` or `rejected { id, reason }`
   * - `now { cursor }`: a pending message delivered at once, stopping what the bot is doing (`interrupt`)
   * - `withdraw { cursor }`: a pending message taken back; answered with `withdrawn { cursor }` to every page, or `notice` when it was already delivered
   * - `answer { askId, index | text }`: the open `pet_ask` answered on the page
   */
  private async onChat(msg: Record<string, unknown>, socket: WorldStreamSocket): Promise<void> {
    const host = this.host;
    switch (msg.t) {
      case 'hello': {
        const page = host ? this.chatPage() : { items: [], more: false };
        this.chat.send(socket, {
          t: 'init', ...page, pending: [...this.pendingChat], phase: this.phase,
          activity: this.activity.steps.length ? { steps: this.activity.steps, startedAt: this.activity.startedAt } : null,
          paused: this.opts.controls?.isPaused?.() ?? false, user: this.cfg.user, bot: this.opts.botName ?? '',
          imagesSeen: host?.modelFacts.accepts('image/jpeg') ?? false,
        });
        if (this.draft !== null) { this.chat.send(socket, { t: 'draft', text: this.draft }); this.draft = null; }
        return;
      }
      case 'more': {
        if (!host || typeof msg.before !== 'number') return;
        this.chat.send(socket, { t: 'older', ...this.chatPage(msg.before) });
        return;
      }
      case 'send': {
        const id = msg.id;
        const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, CHAT_TEXT_MAX) : '';
        const images = parseChatImages(msg.images, this.cfg.user);
        if (!images.ok) { this.chat.send(socket, { t: 'rejected', id, reason: images.reason }); return; }
        if (!text && images.blobs.length === 0) return;
        if (!host) { this.chat.send(socket, { t: 'rejected', id, reason: '还没连上' }); return; }
        if (text) this.lastHeard = { text, via: '打字', at: Date.now() };
        const e = await this.push('desktop-pet.message', 'desktop-pet.chat', `[打字] ${this.cfg.user}:${text}`, 'preempt',
          { meta: { via: 'chat', text }, ...(images.blobs.length ? { blobs: images.blobs } : {}) });
        this.chat.send(socket, e ? { t: 'sent', id, cursor: e.cursor } : { t: 'rejected', id, reason: '没能送出' });
        return;
      }
      case 'now': {
        if (!host?.promotePending || typeof msg.cursor !== 'number') return;
        await host.promotePending(msg.cursor, 'interrupt');
        return;
      }
      case 'withdraw': {
        const cursor = msg.cursor;
        if (!host?.withdrawPending || typeof cursor !== 'number') return;
        if (!await host.withdrawPending(cursor)) {
          this.chat.send(socket, { t: 'notice', text: '这条已经送到了,撤不回来。' });
          return;
        }
        this.pendingChat.delete(cursor);
        void this.record({ kind: 'withdrawn', cursor }, `撤回了 #${cursor}`);
        this.chat.broadcast({ t: 'withdrawn', cursor });
        return;
      }
      case 'answer': return this.onAnswer(msg, 'chat');
    }
  }

  /** The chat items of the last CHAT_PAGE_EVENTS events of this World, or of those before `before`. */
  private chatPage(before?: number): { items: ReturnType<typeof chatHistory>; more: boolean; before: number | null } {
    const events = this.host!.store.range({ source: this.id, limit: CHAT_PAGE_EVENTS, ...(before !== undefined ? { toCursor: before - 1 } : {}) });
    const more = events.length === CHAT_PAGE_EVENTS;
    return { items: chatHistory(events), more, before: more ? events[0].cursor : null };
  }

  private setThinking(on: boolean): void {
    if (this.thinking === on) return;
    this.thinking = on;
    this.server.sendPet({ t: 'thinking', on });
  }

  /* ---------- window ---------- */

  get petUrl(): string {
    return `${this.server.origin}/pet`;
  }

  openWindow(): void {
    if (!this.windowHost || !this.server.port) return;
    const managed = this.store.electron.executable();
    this.windowHost.start(resolveHostCommand(this.petUrl, this.cfg.window.electronFile, managed));
  }

  /* ---------- page protocol ---------- */

  private snapshot(): Record<string, unknown> {
    return {
      skin: this.skin,
      roam: this.quiet?.roam ?? this.cfg.roam,
      sound: this.quiet?.sound ?? this.cfg.sound,
      sounds: this.cfg.sounds,
      theme: this.cfg.theme,
      rememberPosition: this.cfg.rememberPosition,
      // read by the page from `init` only
      startX: this.cfg.rememberPosition ? this.cfg.petX : null,
      hoverButtons: hoverButtonList(this.cfg.hoverButtons),
      doubleClickChat: this.cfg.doubleClickChat,
      scale: this.cfg.window.scale,
      lockFrameRate: this.cfg.window.lockFrameRate,
      hideWhenFullscreen: this.cfg.window.hideWhenFullscreen,
      user: this.cfg.user,
      mic: this.micWanted(),
      voice: this.voiceBrief(),
      micDevice: this.cfg.asr.mic.deviceId,
      thinking: this.thinking,
      bot: this.botInfo(),
    };
  }

  private botInfo(): Record<string, unknown> {
    const c = this.opts.controls;
    let avatar: string | null = null;
    try { if (this.opts.avatarFile) avatar = String(statSync(this.opts.avatarFile).mtimeMs); } catch { /* no avatar yet */ }
    const pause = !!(c?.isPaused && c.setPaused);
    const quitLabel = c?.quit ? c.quitLabel || '退出' : '';
    return {
      name: this.opts.botName ?? '',
      avatar,
      controls: !!c,
      buttons: { pause, settings: !!c?.openSettings, dress: !!c?.openDress, quit: !!c?.quit, chat: !!c?.openChat },
      paused: pause && c?.isPaused ? c.isPaused() : null,
      quitLabel,
      quitPrompt: quitLabel ? `${quitLabel}?` : '',
    };
  }

  private prefsSignature(): string {
    const s = this.snapshot();
    delete s.thinking;
    return JSON.stringify(s);
  }

  /** Config is a live object edited by the console; changes reach the pages within PREFS_SYNC_MS. */
  private syncPrefs(): void {
    this.refreshMode();
    this.segmenter.configure(this.segmentConfig());
    if (this.cfg.asr.enabled && this.runningEngine && this.runningEngine !== this.engine()) void this.startVoiceBackend();
    // the system recognizer serves one language; a new one needs a new helper
    else if (this.cfg.asr.enabled && this.runningEngine === 'system' && this.system?.languageChanged) void this.startVoiceBackend();
    // FunASR loads the model for one language and thread count
    else if (this.cfg.asr.enabled && this.runningEngine === 'funasr' && this.funasr?.configChanged) void this.startVoiceBackend();
    void this.syncHotkey();
    // the person changed what a quiet holds back: theirs wins
    if (this.quiet && (this.cfg.sound !== this.quiet.base.sound || this.cfg.roam !== this.quiet.base.roam)) this.endQuiet();
    const paused = this.opts.controls?.isPaused?.() ?? false;
    if (paused !== this.pausedShown) { this.pausedShown = paused; this.chat.broadcast({ t: 'paused', paused }); }
    const key = this.prefsSignature();
    if (key === this.prefsKey) return;
    this.prefsKey = key;
    this.server.broadcast({ t: 'prefs', ...this.snapshot() });
  }

  private micWanted(): boolean {
    const phase = this.backendState()?.phase;
    return this.cfg.asr.enabled && (phase === 'running');
  }

  /** What the pet's microphone button shows: switched on, able to hear, and why not. */
  private voiceBrief(): Record<string, unknown> {
    const b = this.backendState();
    const ready = b?.phase === 'running';
    return {
      enabled: this.cfg.asr.enabled,
      ready,
      detail: ready ? null : b?.phase === 'starting' ? '识别服务启动中' : b?.detail ?? '识别服务没有运行',
      hint: this.talkHint(),
      mode: this.micMode(),
      key: hotkeyBadge(this.cfg.asr.mic.hotkey),
    };
  }

  private saveSkin(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const skin = raw as PetSkin;
    this.opts.persist({ skin });
    this.syncPrefs();
  }

  private savePrefs(prefs: Record<string, unknown>): void {
    const patch: DeepPartial<DesktopPetConfigSection> = {};
    if (prefs.roam === 'free' || prefs.roam === 'calm' || prefs.roam === 'off') patch.roam = prefs.roam as RoamMode;
    if (typeof prefs.sound === 'boolean') patch.sound = prefs.sound;
    // the menu's sound or roam button during a quiet: the person's choice, kept, and the quiet is over
    if (this.quiet && (patch.roam !== undefined || patch.sound !== undefined)) this.endQuiet();
    if (prefs.theme === 'dark' || prefs.theme === 'light') patch.theme = prefs.theme as PetTheme;
    if (typeof prefs.mic === 'boolean') patch.asr = { enabled: prefs.mic };
    if (Array.isArray(prefs.hoverButtons)) {
      const ids = prefs.hoverButtons.filter((id): id is string => typeof id === 'string' && (PET_ACTIONS as readonly string[]).includes(id));
      patch.hoverButtons = hoverButtonList(ids.slice(0, MAX_HOVER_BUTTONS).join(',')).join(',');
    }
    const mic = prefs.micSettings as Record<string, unknown> | undefined;
    if (mic && typeof mic === 'object') {
      const m: { mode?: MicMode; hotkey?: string; deviceId?: string } = {};
      if (mic.mode === 'hold' || mic.mode === 'toggle' || mic.mode === 'always') m.mode = mic.mode;
      if (typeof mic.hotkey === 'string' && parseHotkey(mic.hotkey)) m.hotkey = mic.hotkey;
      if (typeof mic.deviceId === 'string') m.deviceId = mic.deviceId;
      patch.asr = { ...patch.asr, mic: m };
    }
    if (Object.keys(patch).length) this.opts.persist(patch);
    if (typeof prefs.mic === 'boolean' && prefs.mic) void this.startVoiceBackend();
    this.syncPrefs();
  }

  /**
   * Called only from `stop`, so config.json changes at most once a run: with `rememberPosition` on it
   * stores the last reported position, with it off it clears a stored one. A failed write leaves
   * the stored position as it was.
   */
  private savePosition(): void {
    const x = this.cfg.rememberPosition ? this.standX ?? this.cfg.petX : null;
    if (x === this.cfg.petX) return;
    try {
      this.opts.persist({ petX: x });
    } catch (err) {
      this.log?.warn(`桌宠位置没有保存:${(err as Error).message}`);
    }
  }

  private onPage(msg: PageMessage): void {
    switch (msg.t) {
      case 'figure': return this.onFigure(msg);
      case 'hello': {
        const s = msg.screen as { w?: unknown; h?: unknown } | undefined;
        if (s && typeof s.w === 'number' && typeof s.h === 'number') this.screen = { w: s.w, h: s.h };
        return;
      }
      case 'arrived':
      case 'interrupted': {
        const w = this.walks.get(String(msg.walkId));
        if (!w) return;
        this.walks.delete(String(msg.walkId));
        clearTimeout(w.timer);
        const x = typeof msg.x === 'number' && Number.isFinite(msg.x) ? msg.x : null;
        // the receipt reads the spot it stopped at; the page's next pose report says the same
        if (x !== null && this.pose) this.pose = { ...this.pose, x: x * this.pose.w };
        w.resolve({ t: msg.t, x, by: msg.by, stopping: w.stopping });
        return;
      }
      case 'pose': return this.onPose(msg);
      case 'answer': return this.onAnswer(msg, 'pet');
      case 'text': {
        const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 500) : '';
        if (text) this.lastHeard = { text, via: '打字', at: Date.now() };
        if (text) void this.push('desktop-pet.message', `desktop-pet.text`, `[打字] ${this.cfg.user}:${text}`, 'preempt', { meta: { via: 'bubble', text } });
        return;
      }
      case 'expand': {
        const text = typeof msg.text === 'string' ? msg.text.slice(0, CHAT_TEXT_MAX) : '';
        this.draft = text;
        if (this.chat.size) { this.chat.broadcast({ t: 'draft', text }); this.draft = null; }
        this.opts.controls?.openChat?.();
        return;
      }
      case 'touch': return this.onTouch(msg);
      case 'mic': {
        this.micState = { state: String(msg.state), detail: typeof msg.detail === 'string' ? msg.detail : null };
        return;
      }
      case 'prefs': return this.savePrefs(msg);
      case 'position': {
        if (typeof msg.x === 'number' && Number.isFinite(msg.x)) this.standX = Math.min(1, Math.max(0, msg.x));
        return;
      }
      case 'devices': {
        const list = Array.isArray(msg.list) ? msg.list : [];
        this.devices = list
          .filter((d): d is { id: string; label: string } => !!d && typeof (d as { id?: unknown }).id === 'string')
          .map((d) => ({ id: d.id, label: typeof d.label === 'string' ? d.label : '' }));
        return;
      }
      case 'confirmed': {
        const c = this.confirms.get(String(msg.id));
        if (!c) return;
        this.confirms.delete(String(msg.id));
        clearTimeout(c.timer);
        c.resolve(msg.index === 0 ? 'yes' : msg.index === 1 ? 'no' : 'dismissed');
        return;
      }
      case 'control': return this.onControl(String(msg.action));
      case 'dialog': {
        const settle = this.dialogs.get(String(msg.id));
        if (!settle) return;
        this.dialogs.delete(String(msg.id));
        settle(typeof msg.index === 'number' ? { index: msg.index }
          : typeof msg.text === 'string' ? { text: msg.text.slice(0, 2000) }
          : msg.alt ? { alt: true } : msg.closed ? { closed: true } : { done: true });
        return;
      }
      case 'commit': return this.commitSpeech();
    }
  }

  private onControl(action: string): void {
    const c = this.opts.controls;
    if (!c) return;
    if (action === 'pause' || action === 'resume') c.setPaused?.(action === 'pause');
    else if (action === 'settings') c.openSettings?.();
    else if (action === 'dress') c.openDress?.();
    else if (action === 'quit') c.quit?.();
    this.syncPrefs();
  }

  /**
   * Asks the person in a bubble with two choices, the first one meaning yes. Answers never
   * reach the bot as events; the caller gets them.
   */
  confirm(question: string, choices: [yes: string, no: string]): Promise<ConfirmResult> {
    const id = nextId('k');
    if (!this.server.sendPet({ t: 'confirm', id, question, options: choices })) return Promise.resolve('unavailable');
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.confirms.delete(id); resolve('timeout'); }, CONFIRM_TIMEOUT_MS);
      this.confirms.set(id, { resolve, timer });
    });
  }

  /**
   * Shows one step of a conversation in the bubble; see `PetDialog`. Nothing reaches the bot: the
   * caller gets the answer. Steps wait for as long as the person takes; a step with nothing to
   * answer ends once its line has been read.
   */
  dialog(d: PetDialog): PetDialogHandle {
    const id = nextId('d');
    const { actions, dropped, notes } = parseActions(d.actions ?? [], this.vocab(), this.pairs());
    if (dropped.length) this.log?.warn(`气泡对话里有当前形象的词表没有的词,已略过:${dropped.join('、')}`);
    if (notes.length) this.log?.info(`气泡对话的动作:${notes.join('')}`);
    let settle: (a: PetDialogAnswer) => void = () => {};
    const answer = new Promise<PetDialogAnswer>((resolve) => { settle = resolve; });
    if (!this.server.sendPet({ t: 'dialog', id, ...d, actions })) settle({ unavailable: true });
    else this.dialogs.set(id, settle);
    // a page that never reports back (a tab put to sleep) does not hold a line with nothing to answer forever
    if (!d.input && this.dialogs.has(id)) {
      const timer = setTimeout(() => this.dialogs.get(id)?.({ done: true }), 5000 + d.text.length / DIALOG_CPS * 1000);
      void answer.finally(() => { clearTimeout(timer); this.dialogs.delete(id); });
    }
    return {
      answer,
      dropped,
      update: (patch) => { if (this.dialogs.has(id)) this.server.sendPet({ t: 'dialog-update', id, ...patch }); },
      close: () => {
        const s = this.dialogs.get(id);
        this.dialogs.delete(id);
        this.server.sendPet({ t: 'dialog-close', id });
        s?.({ done: true });
      },
    };
  }

  private onPageGone(): void {
    this.log?.info('桌宠页面断开');
    for (const [id, d] of this.dialogs) { d({ unavailable: true }); this.dialogs.delete(id); }
    for (const [id, w] of this.walks) { clearTimeout(w.timer); w.resolve({ t: 'gone' }); this.walks.delete(id); }
    for (const [id, c] of this.confirms) { clearTimeout(c.timer); c.resolve('unavailable'); this.confirms.delete(id); }
    this.segmenter.flush();
    if (this.wasSpeaking) this.wasSpeaking = false;
  }

  /** An answer from the pet's bubble or the chat page; an answer from the page closes the bubble. */
  private onAnswer(msg: Record<string, unknown>, from: 'pet' | 'chat'): void {
    const ask = this.ask;
    if (!ask || ask.id !== msg.askId) return;
    const q = `「${ask.question}」`;
    if (msg.dismissed) {
      this.ask = null;
      void this.push('desktop-pet.answer', 'desktop-pet.answer', `[回答] ${this.cfg.user}关掉了提问${q},没有作答。`, 'debounce', { meta: { askId: ask.id, dismissed: true } });
      return;
    }
    const index = typeof msg.index === 'number' && ask.options[msg.index] !== undefined ? msg.index : null;
    const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 500) : '';
    if (index === null && !text) return;
    this.ask = null;
    if (from === 'chat') this.server.sendPet({ t: 'ask-close', id: ask.id });
    const body = index !== null ? `选了第 ${index + 1} 项「${ask.options[index]}」` : `自己写了:「${text}」`;
    this.lastHeard = { text: `回答${q}:${body}`, via: '回答', at: Date.now() };
    void this.push('desktop-pet.answer', 'desktop-pet.answer', `[回答] ${this.cfg.user}回答${q}:${body}`, 'flush',
      { meta: { askId: ask.id, ...(index !== null ? { index } : { text }) } });
  }

  private onTouch(msg: PageMessage): void {
    if (!this.cfg.touch.enabled) return;
    const kind = String(msg.kind);
    if (kind === 'grab') return;
    if (kind === 'crash' && this.touch && (this.touch.kind === 'throw' || this.touch.kind === 'drop')) {
      this.touch.crashed = true;
      return;
    }
    if (this.touch && this.touch.kind === kind && kind !== 'throw' && kind !== 'drop') {
      this.touch.count++;
      this.touch.woke ||= msg.woke === true;
      clearTimeout(this.touch.timer);
      this.touch.timer = setTimeout(() => this.flushTouch(), TOUCH_MERGE_MS);
      return;
    }
    if (this.touch) this.flushTouch();
    this.touch = {
      kind, count: 1, woke: msg.woke === true, asleep: msg.asleep === true, crashed: false,
      x: typeof msg.x === 'number' ? msg.x : null,
      timer: setTimeout(() => this.flushTouch(), TOUCH_MERGE_MS),
    };
  }

  private flushTouch(): void {
    const t = this.touch;
    this.touch = null;
    if (!t) return;
    clearTimeout(t.timer);
    const u = this.cfg.user;
    let text: string;
    switch (t.kind) {
      case 'poke': text = t.woke ? `${u}把睡着的你戳醒了` : t.count > 1 ? `${u}戳了你 ${t.count} 下` : `${u}戳了你一下`; break;
      case 'pet': text = t.asleep ? `${u}摸了摸睡着的你` : t.count > 1 ? `${u}摸了你好几下` : `${u}摸了摸你的头`; break;
      case 'throw': text = `${u}把你拎起来甩了出去${t.crashed ? ',你重重落地,摔晕了一会儿' : ''}`; break;
      case 'drop': text = `${u}把你拎起来,放到了屏幕横向 ${t.x !== null && this.screen ? pct(t.x / this.screen.w) : '某'} 处${t.crashed ? ',你摔晕了一会儿' : ''}`; break;
      case 'crash': text = '你重重落地,摔晕了一会儿'; break;
      default: return;
    }
    const { wakeOn } = this.cfg.touch;
    const wakes = !this.touchWoke && (wakeOn === 'all' || (wakeOn === 'poke' && t.kind === 'poke'));
    if (wakes) this.touchWoke = true;
    void this.push('desktop-pet.touch', 'desktop-pet.touch', `[互动] ${text}`, wakes ? 'debounce' : 'piggyback', { meta: { chat: this.touchLine(t) } });
  }

  /** The touch as the chat page tells it to the person. */
  private touchLine(t: TouchBatch): string {
    const b = this.opts.botName || 'Coo';
    switch (t.kind) {
      case 'poke': return t.woke ? `你把睡着的 ${b} 戳醒了` : t.count > 1 ? `你戳了 ${b} ${t.count} 下` : `你戳了 ${b} 一下`;
      case 'pet': return t.count > 1 ? `你摸了 ${b} 好几下` : `你摸了摸 ${b}`;
      case 'throw': return `你把 ${b} 拎起来甩了出去${t.crashed ? `,${b} 摔晕了一会儿` : ''}`;
      case 'drop': return `你把 ${b} 拎起来换了个地方${t.crashed ? `,${b} 摔晕了一会儿` : ''}`;
      default: return `${b} 重重落地,摔晕了一会儿`;
    }
  }

  /**
   * The person's local time an event happened, before its text: `[HH:MM] `, and `[MM-DD 周X HH:MM] ` for the
   * first event of a run and the first on a new date, so the bot knows the date without a clock in its prefix.
   */
  private stamp(now = new Date()): string {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('zh-CN', { timeZone: this.opts.timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
      .formatToParts(now).map((p) => [p.type, p.value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    const time = shortTime(this.opts.timezone, now);
    if (day === this.stampDay) return `[${time}] `;
    this.stampDay = day;
    return `[${parts.month}-${parts.day} ${parts.weekday} ${time}] `;
  }

  /**
   * Delivers an event to the bot. `meta` carries what the chat page shows of it; the person's
   * messages stay pending on the page until Core reports them delivered.
   */
  private async push(
    type: string, senderKey: string, text: string, trigger: TriggerMode,
    extra: { meta?: Record<string, unknown>; blobs?: BlobInput[] } = {},
  ): Promise<EventEnvelope | null> {
    const host = this.host;
    if (!host) return null;
    try {
      const e = await host.pushEvent({ type, source: this.id, senderKey, ts: nowIso(this.opts.timezone), text: this.stamp() + text, ...extra }, { trigger });
      const item = chatItem(e);
      if (!item) return e;
      const pending = item.kind === 'user' && e.contextDelivery === 'deliver';
      if (pending) this.pendingChat.add(e.cursor);
      this.chat.broadcast({ t: 'item', item, ...(pending ? { pending: true } : {}) });
      return e;
    } catch (err) {
      this.log?.warn(`事件没能送出:${(err as Error).message}`);
      return null;
    }
  }

  /** Stores what the pet said or did for the chat page; never delivered to the bot. Resolves to its cursor. */
  private async record(meta: Record<string, unknown>, text: string): Promise<number | null> {
    const host = this.host;
    if (!host) return null;
    try {
      const e = await host.pushEvent({ type: SELF_TYPE, source: this.id, senderKey: SELF_TYPE, ts: nowIso(this.opts.timezone), text, meta }, { deliver: false });
      const item = chatItem(e);
      if (item) this.chat.broadcast({ t: 'item', item });
      return e.cursor;
    } catch (err) {
      this.log?.warn(`对话记录没能保存:${(err as Error).message}`);
      return null;
    }
  }

  /* ---------- voice ---------- */

  private funasrModel(): { model: string; tokens: string } | { missing: string } {
    if (this.store.funasr.state().phase !== 'ready') return { missing: `识别模型还没下载(约 ${Math.round(this.store.funasr.bytes / 1048576)} MB):在「语音输入」页下载` };
    return { model: this.store.funasr.file('model.int8.onnx'), tokens: this.store.funasr.file('tokens.txt') };
  }

  /** The engine in force: Windows' own recognizer only where it exists, FunASR otherwise (and for older settings). */
  engine(): AsrEngine {
    return this.cfg.asr.engine === 'system' && systemRecognizerSupported() ? 'system' : 'funasr';
  }

  private backendState(): FunAsrState | SystemRecognizerState | null {
    return (this.engine() === 'system' ? this.system?.state() : this.funasr?.state()) ?? null;
  }

  /** Starts the engine in force and stops the other one. */
  async startVoiceBackend(): Promise<FunAsrState | SystemRecognizerState | null> {
    if (!this.funasr || !this.system) return null;
    const engine = this.engine();
    if (this.runningEngine !== engine) {
      if (this.runningEngine === 'system') await this.system.stop();
      else if (this.runningEngine === 'funasr') await this.funasr.stop();
      this.runningEngine = engine;
    }
    if (engine === 'system') await this.system.start();
    else await this.funasr.start();
    this.syncPrefs();
    return this.backendState();
  }

  private async stopVoiceBackend(): Promise<void> {
    if (this.engine() === 'system') await this.system?.stop();
    else await this.funasr?.stop();
    this.syncPrefs();
  }

  /* ---------- talk key ---------- */

  /** The mode in force: hold and toggle fall back to always while the talk key cannot be read. */
  private micMode(): MicMode {
    return this.hotkeyProblem ? 'always' : this.cfg.asr.mic.mode;
  }

  /** Audio reaches the segmenter only while this is true. */
  private gateOpen(): boolean {
    return this.micMode() === 'always' || this.talking;
  }

  /**
   * While the talk key is held everything counts as speech: the segmenter never waits for a
   * loud onset or cuts at a pause, and releasing the key ends the utterance.
   */
  private segmentConfig(): SegmentConfig {
    const seg = this.cfg.asr.segment;
    return this.micMode() === 'hold' ? { ...seg, thresholdDb: -Infinity, minSpeechMs: 0 } : seg;
  }

  /** Starts, restarts or stops the key watcher to match the configured mode and key. */
  private async syncHotkey(): Promise<void> {
    const { mode, hotkey } = this.cfg.asr.mic;
    const key = mode === 'always' || !this.host ? '' : `${mode}:${hotkey}`;
    if (key === this.hotkeyKey) return;
    this.hotkeyKey = key;
    this.keyWatcher?.stop();
    this.keyWatcher = null;
    this.hotkeyProblem = null;
    this.setTalking(false);
    if (!key) return;
    const parsed = parseHotkey(hotkey);
    const watch = this.opts.watchHotkey ?? watchHotkey;
    const watcher = parsed ? await watch(parsed, (down) => this.onTalkKey(down), HOTKEY_POLL_MS, () => this.onTalkTap()) : `认不出按键「${hotkey}」`;
    if (key !== this.hotkeyKey) { if (typeof watcher !== 'string') watcher.stop(); return; }
    if (typeof watcher === 'string') {
      this.hotkeyProblem = watcher;
      this.log?.warn(`按键收音不可用,改为一直收音:${watcher}`);
    } else this.keyWatcher = watcher;
    this.segmenter.configure(this.segmentConfig());
  }

  /** One line telling the person how to be heard. */
  private talkHint(): string {
    const { hotkey } = this.cfg.asr.mic;
    const key = comboLabel(hotkey), { taps } = splitTaps(hotkey);
    const mode = this.micMode();
    if (mode === 'always') return this.hotkeyProblem
      ? `说话键不可用，暂时自动收音：${this.hotkeyProblem}`
      : '一直在听,直接说话';
    if (mode === 'toggle') return taps > 1 ? `${hotkeyLabel(hotkey)} 开始听,再${taps === 2 ? '双击' : '三击'}停` : `按一下 ${key} 开始听,再按一下停`;
    return taps > 1 ? `快速按${taps === 2 ? '一' : '两'}下 ${key},紧接着按住说话,松开就发出去` : `按住 ${key} 说话,松开就发出去`;
  }

  /** A quick tap before the held press: the pet perks up, so the hold that follows feels answered at once. */
  private onTalkTap(): void {
    if (this.talking || !this.cfg.asr.enabled || !this.micWanted()) return;
    this.server.sendPet({ t: 'listen', phase: 'ready' });
  }

  private onTalkKey(down: boolean): void {
    if (this.micMode() === 'hold') this.setTalking(down);
    else if (down) this.setTalking(!this.talking);
  }

  private setTalking(on: boolean): void {
    if (this.talking === on) return;
    this.talking = on;
    this.voiceFrame({ type: 'gate', open: on });
    if (!this.cfg.asr.enabled || !this.micWanted()) return;
    if (on) {
      this.listenOpen = true;
      this.server.sendPet({ t: 'listen', phase: 'start' });
      return;
    }
    const tail = this.segmenter.flush();
    if (tail) this.enqueue(tail);
    this.wasSpeaking = false;
    this.schedulePack();
  }

  /**
   * The pet's microphone button, held down: what was heard so far goes out now. The sentence
   * in progress is cut, and delivery waits only for transcription, not for the closing pause.
   * A switched-on talk key (toggle) is switched off: that sentence is finished.
   */
  private commitSpeech(): void {
    if (!this.cfg.asr.enabled || !this.micWanted()) return;
    this.committing = true;
    if (this.micMode() === 'toggle' && this.talking) this.setTalking(false);
    else {
      const tail = this.segmenter.flush();
      if (tail) this.enqueue(tail);
      this.wasSpeaking = false;
    }
    this.schedulePack();
  }

  private enqueue(u: Utterance): void {
    this.counts.utterances++;
    this.queue.push(u);
    this.server.sendPet({ t: 'listen', phase: 'transcribing' });
    void this.drain();
  }

  private onAudio(frame: Int16Array): void {
    if (!this.cfg.asr.enabled || !this.micWanted()) return;
    const open = this.gateOpen();
    if (open) for (const u of this.segmenter.push(frame)) this.enqueue(u);
    this.level = open ? this.segmenter.level : rmsDb(frame);
    const speaking = open && this.segmenter.active;
    if (speaking && !this.wasSpeaking) this.server.sendPet({ t: 'listen', phase: 'start' });
    this.wasSpeaking = speaking;
    const now = Date.now();
    if (now - this.lastLevelAt >= 100) {
      this.lastLevelAt = now;
      this.voiceFrame({ type: 'level', level: this.level, speaking, open });
    }
    if (open) this.schedulePack();
  }

  private async drain(): Promise<void> {
    if (this.transcribing) return;
    this.transcribing = true;
    try {
      while (this.queue.length) {
        const u = this.queue.shift()!;
        const res = u.result
          ? await u.result
          : this.engine() === 'system' && this.system
            ? await this.system.transcribe(u.pcm)
            : this.funasr
              ? await this.funasr.transcribe(u.pcm)
              : { text: '', ms: 0, error: '识别没有启动' };
        let text = res.text;
        if (this.cfg.asr.simplified) text = toSimplified(text);
        if (res.error || looksHallucinated(text)) {
          this.counts.dropped++;
          this.remember({ text: res.error ? `[失败] ${res.error}` : text, at: Date.now(), ms: res.ms, dropped: true });
          this.voiceFrame({ type: 'dropped', text: res.error ?? text, ms: res.ms });
          // the page was showing this sentence as it was heard: take it back
          if (u.result) this.showHeard();
          continue;
        }
        this.packer.add(text, Date.now());
        this.remember({ text, at: Date.now(), ms: res.ms });
        this.voiceFrame({ type: 'text', text, ms: res.ms });
        this.pendingText(text);
        this.showHeard();
      }
    } finally {
      this.transcribing = false;
    }
    this.schedulePack();
  }

  private partial = '';
  private pendingText(add: string): string {
    this.partial = joinSpeech([this.partial, add]);
    return this.partial;
  }

  /* ---------- hearing as it is spoken ---------- */

  /** The sentence the recognizer is hearing now, and what it has made of it so far. */
  private sentence: SystemSentence | null = null;
  private interim = '';

  /** The segmenter hands each sentence's audio over as it arrives when the engine can take it. */
  private readonly sink: SegmentSink = {
    begin: (frames) => {
      this.sentence = null;
      this.interim = '';
      const recognizer = this.engine() === 'system' ? this.system : this.funasr;
      if (!recognizer) return;
      const s: SystemSentence | null = recognizer.sentence((text) => {
        if (this.sentence !== s) return;
        this.interim = this.cfg.asr.simplified ? toSimplified(text) : text;
        this.showHeard();
      });
      this.sentence = s;
      if (s) for (const f of frames) s.write(f);
    },
    frame: (f) => this.sentence?.write(f),
    end: (kept) => {
      const s = this.sentence;
      this.sentence = null;
      if (!s) return undefined;
      const result = s.end();
      if (!kept && this.interim) { this.interim = ''; this.showHeard(); }
      else this.interim = '';
      return kept ? result : undefined;
    },
  };

  /** The listening bubble: sentences already transcribed, then the one being heard, greyed. */
  private showHeard(): void {
    this.server.sendPet({ t: 'listen', phase: 'partial', text: this.partial, interim: this.interim });
  }

  /** Delivers the packed text once nothing upstream is still open. */
  private schedulePack(): void {
    const upstream = this.transcribing || this.queue.length > 0;
    // a commit does not wait for the closing pause, nor for speech begun after it
    const hold = upstream || (!this.committing && (this.segmenter.active || this.segmenter.settleRemainingMs > 0));
    const text = this.committing && !upstream ? this.packer.take() : this.packer.due(Date.now(), hold);
    if (this.committing && !upstream && !text) {
      // nothing was heard: the committed episode closes empty, unless the talk key still holds it open
      this.committing = false;
      if (this.listenOpen && !this.talking && !this.segmenter.active) {
        this.listenOpen = false;
        this.partial = '';
        this.server.sendPet({ t: 'listen', phase: 'none' });
      }
    }
    if (text) {
      this.committing = false;
      this.partial = '';
      this.listenOpen = false;
      this.counts.delivered++;
      this.server.sendPet({ t: 'listen', phase: 'heard', text });
      this.lastHeard = { text, via: '语音', at: Date.now() };
      void this.push('desktop-pet.speech', 'desktop-pet.voice', `[语音] ${this.cfg.user}:${text}`, 'flush', { meta: { text } });
      return;
    }
    if (this.segmenter.active || this.transcribing || this.queue.length > 0) this.listenOpen = true;
    else if (!hold && !this.packer.pending && this.listenOpen && !this.talking) {
      // the episode ended with nothing worth delivering; an open talk key keeps it going
      this.listenOpen = false;
      this.partial = '';
      this.server.sendPet({ t: 'listen', phase: 'none' });
    }
    if (this.packer.pending && !this.packTimer) {
      this.packTimer = setTimeout(() => { this.packTimer = null; this.schedulePack(); }, Math.max(50, this.segmenter.settleRemainingMs || 100));
    }
  }

  /** A listening episode is open on the page (bubble shown) and has not been closed yet. */
  private listenOpen = false;

  private remember(line: HeardLine): void {
    this.heard.push(line);
    if (this.heard.length > 50) this.heard.shift();
  }

  private voiceFrame(frame: Record<string, unknown>): void {
    const text = JSON.stringify(frame);
    for (const s of this.voiceSockets) if (s.open) s.send(text);
  }

  /* ---------- tools ---------- */

  tools(): ToolDef[] {
    if (this.mode === 'decider') return this.deciderTools();
    const handlers: Record<string, ToolDef['handler']> = {
      pet_say: (args) => this.say(args),
      pet_ask: (args) => this.askUser(args),
      pet_walk_to: (args, ctx) => this.walkTo(args, ctx),
      pet_act: (args) => this.act(args),
      pet_set: (args) => this.setSettings(args),
      pet_quiet: (args) => this.setQuiet(args),
    };
    return DESKTOP_PET_TOOL_DECLS.map((decl) => ({ ...decl, handler: handlers[decl.name], ...(decl.name === 'pet_walk_to' ? { interruptible: true } : {}) }));
  }

  /** Decider mode's tools (src/tools.ts DECIDER_TOOL_DECLS); every receipt ends with where she is (`[位置]`). */
  private deciderTools(): ToolDef[] {
    const handlers: Record<string, ToolDef['handler']> = {
      pet_say: (args) => this.sayFeeling(args),
      pet_ask: (args) => this.askUser(args, true),
      pet_walk: (args, ctx) => this.walkBy(args, ctx),
      pet_feel: (args) => this.feel(args),
      pet_set: (args) => this.setSettings(args),
      pet_quiet: (args) => this.setQuiet(args),
    };
    return DECIDER_TOOL_DECLS.map((decl) => ({
      ...decl,
      handler: async (args, ctx) => this.withPosition(await handlers[decl.name](args, ctx)),
      ...(decl.name === 'pet_walk' ? { interruptible: true } : {}),
    }));
  }

  private notConnected(tool: string): ToolOutcome {
    const w = this.windowHost?.state();
    const why = w && w.phase !== 'running' && w.detail ? `(${w.detail})` : '';
    return { text: `[${tool} 没执行] 桌宠窗口没有连接${why},${this.cfg.user}看不到。`, failed: true };
  }

  private async say(args: Record<string, unknown>): Promise<ToolOutcome> {
    const script = typeof args.script === 'string' ? args.script : '';
    const { beats, dropped, notes } = parseScript(script, this.vocab(), this.pairs());
    if (!beats.some((b) => b.text || b.actions.length || b.anchors.length)) {
      return { text: '[pet_say 没执行] 脚本是空的。不想说话就不调用。', failed: true };
    }
    const id = nextId('s');
    if (!this.server.sendPet({ t: 'say', id, beats })) return this.notConnected('pet_say');
    this.notePosture(beats.flatMap((b) => [...b.actions, ...b.anchors.flatMap((a) => a.actions)]));
    void this.closeActivity();
    void this.record({ kind: 'say', beats: beats.map((b) => ({ text: b.text, ...moodOf(b.actions, this.vocab()) })) }, beats.map((b) => b.text).join(''));
    const now = Date.now();
    const selfSec = estimateSeconds(beats);
    const waitSec = Math.max(0, (this.busyUntil - now) / 1000);
    this.busyUntil = Math.max(now, this.busyUntil) + selfSec * 1000;
    const replaced = this.ask ? `替换了还没回答的提问「${this.ask.question}」。` : '';
    if (this.ask) this.ask = null;
    const params = `${dropped.length ? `当前形象的词表里没有这些标记,已略过:${dropped.join('、')}。` : ''}${notes.join('')}`;
    const note = params ? `
[执行参数] ${params}` : '';
    const shown = this.chat.size ? '对话页开着,这段也显示在那里。' : '';
    return { text: `${waitSec > .5 ? `已排队,前面还有约 ${Math.round(waitSec)} 秒` : '已开始显示'},这段约 ${Math.round(selfSec)} 秒。${shown}${replaced}${note}` };
  }

  /**
   * Decider mode's `pet_say`: the bubble goes to the page at once, held for its words (`acts: 'pending'`) while the
   * decision model picks them from the feeling; the words follow by id (`say-acts`, empty when the decision fails or
   * times out). The receipt does not wait for the decision (the chat model goes on at once): it says the body follows
   * the feeling, and what was picked is told once with the next position line (`[表情动作]`, see `withPosition`).
   */
  private async sayFeeling(args: Record<string, unknown>): Promise<ToolOutcome> {
    const raw = typeof args.text === 'string' ? args.text : '';
    const feeling = typeof args.feeling === 'string' ? args.feeling.trim().slice(0, FEELING_MAX) : '';
    // markers written out of habit are taken out, never done; other brackets (<div>, a < b) are the text
    const { text, stripped } = stripMarkers(raw.trim(), this.vocab());
    if (!text) return { text: '[pet_say 没执行] text 是空的。不想说话就不调用。', failed: true };
    const id = nextId('s');
    const beats = [{ actions: [] as string[], text, anchors: [] }];
    // known now: no key, or the breaker open (a decision would fail at once; the bubble is not held for it)
    const unable = !feeling ? null : this.deciderKey() === '' ? failureText('nokey') : this.decider.open ? failureText('breaker') : null;
    const deciding = feeling !== '' && unable === null;
    if (!this.server.sendPet({ t: 'say', id, beats, ...(deciding ? { acts: 'pending', holdMs: DECIDER_HOLD_MS } : {}) })) return this.notConnected('pet_say');
    const now = Date.now();
    const selfSec = estimateSeconds(beats);
    const waitSec = Math.max(0, (this.busyUntil - now) / 1000);
    this.busyUntil = Math.max(now, this.busyUntil) + selfSec * 1000;
    const replaced = this.ask ? `替换了还没回答的提问「${this.ask.question}」。` : '';
    if (this.ask) this.ask = null;
    void this.closeActivity();
    let did: string;
    if (!feeling) did = '这次没带 feeling,只说了话;下次带上 feeling,身体才会有表情。';
    else if (!deciding) did = `表情动作这次做不了(${unable}),只说了话。`;
    else did = '表情动作照 feeling 自动做,不用再调 pet_feel。';
    void this.inTurn(async () => {
      let actions: string[] = [];
      if (deciding) {
        const d = await this.decideFor({ tool: 'pet_say', feeling, text, forSay: true });
        if (this.stopped) return;
        this.server.sendPet({ t: 'say-acts', id, actions: d.ok ? d.actions : [] });
        if (d.ok) { actions = d.actions; this.notePosture(actions); }
        this.noteUnreported(text, d.ok ? (actions.length ? this.namesOf(actions) : '没动') : `没做(${d.why})`);
      }
      await this.record({ kind: 'say', beats: [{ text, ...moodOf(actions, this.vocab()) }] }, text);
    });
    const shown = this.chat.size ? '对话页开着,这段也显示在那里。' : '';
    const cut = stripped ? '这种模式下不用写标记,已当成普通文字去掉。' : '';
    return { text: `${waitSec > .5 ? `已排队,前面还有约 ${Math.round(waitSec)} 秒` : '已开始显示'},这段约 ${Math.round(selfSec)} 秒。${did}${shown}${replaced}${cut}` };
  }

  /** Runs `job` after the decisions and records before it (see `deciderQueue`); a job that throws is logged. */
  private inTurn(job: () => Promise<void>): Promise<void> {
    const run = this.deciderQueue.then(() => (this.stopped ? undefined : job())).catch((err: unknown) => {
      this.log?.warn(`表情决策出错:${(err as Error)?.message ?? String(err)}`);
    });
    this.deciderQueue = run;
    return run;
  }

  /** Resolves once every decision asked for so far has been made and sent (evals and tests wait on it). */
  decisionsIdle(): Promise<void> {
    return this.deciderQueue;
  }

  /** A bubble's picks, kept to be told once with the next position line (at most the last three). */
  private noteUnreported(text: string, did: string): void {
    this.unreported.push({ text: text.length > 10 ? `${text.slice(0, 10)}…` : text, did });
    this.unreported.splice(0, Math.max(0, this.unreported.length - 3));
  }

  /** Decider mode's `pet_feel`: a feeling the decision model turns into words, done at once (`act`). */
  private async feel(args: Record<string, unknown>): Promise<ToolOutcome> {
    const feeling = typeof args.feeling === 'string' ? args.feeling.trim().slice(0, FEELING_MAX) : '';
    if (!feeling) return { text: '[pet_feel 没执行] feeling 是空的。', failed: true };
    if (!this.server.petConnected) return this.notConnected('pet_feel');
    // after the bubbles' decisions asked for before it (their words come first, and this one sees them)
    const box: { d?: Decided } = {};
    await this.inTurn(async () => { box.d = await this.decideFor({ tool: 'pet_feel', feeling, forSay: false }); });
    const d = box.d;
    if (!d) return { text: '[pet_feel 没执行] World 已停止。', failed: true };
    if (!d.ok) return { text: d.reason === 'breaker' ? `表情决策暂时用不了(${d.why}),这次身体没做什么。` : `决策模型没回应(${d.why}),这次身体没做什么。` };
    if (!d.actions.length) return { text: '这次表情动作没有变化。' };
    if (!this.server.sendPet({ t: 'act', id: nextId('c'), actions: d.actions })) return this.notConnected('pet_feel');
    this.notePosture(d.actions);
    return { text: `做了:${this.namesOf(d.actions)}。${this.heldNote(d.actions)}${d.notes.join('')}` };
  }

  private async askUser(args: Record<string, unknown>, decider = false): Promise<ToolOutcome> {
    const question = typeof args.question === 'string' ? args.question.trim() : '';
    const raw = Array.isArray(args.options) ? args.options : [];
    const options = raw.filter((o): o is string => typeof o === 'string' && o.trim() !== '').map((o) => o.trim().slice(0, 40)).slice(0, 3);
    const allowOwn = args.allowOwnAnswer !== false;
    if (!question) return { text: '[pet_ask 没执行] question 是空的。', failed: true };
    if (options.length === 0 && !allowOwn) return { text: '[pet_ask 没执行] 没有选项,又不允许自己写,没法作答。', failed: true };
    const id = nextId('a');
    if (!this.server.sendPet({ t: 'ask', id, question, options, own: allowOwn })) return this.notConnected('pet_ask');
    const replaced = this.ask ? `替换了还没回答的上一个提问「${this.ask.question}」。` : '';
    this.ask = { id, question, options };
    void this.closeActivity();
    const rec = () => this.record({ kind: 'ask', askId: id, question, options, own: allowOwn }, question);
    // decider mode: after the bubbles recorded before it (their records wait for their decisions)
    if (decider) void this.inTurn(async () => { await rec(); }); else void rec();
    const cut = raw.length > 3 ? '只显示了前 3 个选项。' : '';
    const shown = this.chat.size ? '对话页开着,问题也显示在那里,两边都能回答。' : '';
    let did = '';
    const feeling = decider && typeof args.feeling === 'string' ? args.feeling.trim().slice(0, FEELING_MAX) : '';
    // like pet_say, the receipt does not wait for the decision; the words are done when they come (`act`)
    if (feeling) {
      const unable = this.deciderKey() === '' ? failureText('nokey') : this.decider.open ? failureText('breaker') : null;
      if (unable) did = `表情动作这次做不了(${unable})。`;
      else {
        did = '表情动作照 feeling 自动做。';
        void this.inTurn(async () => {
          const d = await this.decideFor({ tool: 'pet_ask', feeling, text: question, forSay: true });
          if (this.stopped) return;
          if (d.ok && d.actions.length && this.server.sendPet({ t: 'act', id: nextId('c'), actions: d.actions })) this.notePosture(d.actions);
          this.noteUnreported(question, d.ok ? (d.actions.length ? this.namesOf(d.actions) : '没动') : `没做(${d.why})`);
        });
      }
    }
    return { text: `已问出。${replaced}${cut}${shown}${did}回答到了会以 [回答] 事件送达。` };
  }

  /** Waits for the walk `walkId` the page was sent; an interrupt stops it where the pet stands. */
  private awaitWalk(walkId: string, ctx?: ToolCallContext): Promise<WalkEnd> {
    return new Promise<WalkEnd>((resolve) => {
      const onAbort = (): void => {
        if (!this.walks.has(walkId)) return;
        walk.stopping = true;
        this.server.sendPet({ t: 'walk-stop', id: walkId });
      };
      const done = (e: WalkEnd): void => {
        ctx?.signal?.removeEventListener('abort', onAbort);
        resolve(e);
      };
      const timer = setTimeout(() => {
        this.walks.delete(walkId);
        done({ t: 'timeout' });
      }, WALK_TIMEOUT_MS);
      const walk: PendingWalk = { resolve: done, timer };
      this.walks.set(walkId, walk);
      ctx?.signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** A walk's end as `pet_walk_to` (and an unfinished `pet_walk`) tells it. */
  private walkText(e: WalkEnd): string {
    if (e.t === 'timeout') return `${WALK_TIMEOUT_MS / 1000} 秒内没有走到。`;
    if (e.t === 'stopped') return 'World 已停止,没走到。';
    if (e.t === 'gone') return '没走到:桌宠窗口断开了。';
    if (e.t !== 'arrived' && e.t !== 'interrupted') return '';
    const at = e.x !== null ? pct(e.x) : '?';
    return e.t === 'arrived'
      ? `走到了屏幕横向 ${at} 处。`
      : e.stopping ? `走到屏幕横向 ${at} 处停下了。`
      : e.by === 'drag' ? `没走到:走到 ${at} 处时被${this.cfg.user}拎起来了。`
      : e.by === 'busy' ? `没走:身体正忙(被拎着、在跳、在空中或在翻滚),没法起步,还在屏幕横向 ${at} 处。等它落地站稳再走。`
      : e.by === 'none' ? '没走:桌宠的身体还没准备好。'
      : `没走到:走到 ${at} 处时换成了别的动作(${String(e.by)})。`;
  }

  /** Interruptible: an interrupt stops the walk where the pet stands, and the receipt says where. */
  private async walkTo(args: Record<string, unknown>, ctx?: ToolCallContext): Promise<ToolOutcome> {
    const run = args.run === true;
    const to = args.to;
    let target: number | 'cursor';
    if (typeof to === 'number' && Number.isFinite(to)) target = Math.max(0, Math.min(1, to));
    else if (typeof to === 'string') {
      const named: Record<string, number | 'cursor'> = { left: .05, center: .5, right: .95, cursor: 'cursor' };
      const n = Number(to);
      if (to in named) target = named[to];
      else if (to.trim() !== '' && Number.isFinite(n)) target = Math.max(0, Math.min(1, n));
      else return { text: `[pet_walk_to 没执行] to 应为 0–1 的数字或 left / center / right / cursor,收到 ${JSON.stringify(to)}。`, failed: true };
    } else return { text: '[pet_walk_to 没执行] 缺少 to。', failed: true };
    if (this.currentPack()?.manifest.can.walk === false) return { text: `[pet_walk_to 没执行] 现在的形象(${nameIn(this.currentPack()!.manifest.name)})不会走动。`, failed: true };
    const walkId = nextId('w');
    if (!this.server.sendPet({ t: 'walk', id: walkId, to: target, run })) return this.notConnected('pet_walk_to');
    this.kneeling = false;
    this.pendingPosture = null;
    return { text: this.walkText(await this.awaitWalk(walkId, ctx)) };
  }

  /**
   * Decider mode's `pet_walk`: `pixels` left or right from where the page last said she stands, clamped to the screen
   * here and to the stage on the page; a walk that ends short of what was asked stopped at the edge, and says so.
   */
  private async walkBy(args: Record<string, unknown>, ctx?: ToolCallContext): Promise<ToolOutcome> {
    const dir = args.direction;
    if (dir !== 'left' && dir !== 'right') return { text: `[pet_walk 没执行] direction 应为 left 或 right,收到 ${JSON.stringify(dir)}。`, failed: true };
    const pixels = typeof args.pixels === 'number' && Number.isFinite(args.pixels) ? Math.round(args.pixels) : NaN;
    if (!(pixels >= 1 && pixels <= 8000)) return { text: `[pet_walk 没执行] pixels 应为 1–8000 的整数,收到 ${JSON.stringify(args.pixels)}。`, failed: true };
    const run = args.run === true;
    if (this.currentPack()?.manifest.can.walk === false) return { text: `[pet_walk 没执行] 现在的形象(${nameIn(this.currentPack()!.manifest.name)})不会走动。`, failed: true };
    const from = this.pose;
    if (!from || !(from.w > 0)) {
      if (!this.server.petConnected) return this.notConnected('pet_walk');
      return { text: '[pet_walk 没执行] 还不知道桌宠在哪,稍后再试。', failed: true };
    }
    const sign = dir === 'left' ? -1 : 1;
    const tx = Math.max(0, Math.min(from.w, from.x + sign * pixels));
    const before = this.posture();
    const walkId = nextId('w');
    if (!this.server.sendPet({ t: 'walk', id: walkId, to: tx / from.w, run })) return this.notConnected('pet_walk');
    this.kneeling = false;
    this.pendingPosture = null;
    const end = await this.awaitWalk(walkId, ctx);
    if (end.t !== 'arrived' || end.x === null) return { text: this.walkText(end) };
    const w = from.w;
    const x = Math.round(end.x * w);
    const moved = Math.round(Math.abs(x - from.x));
    const side = dir === 'left' ? '左' : '右';
    const verb = run ? '跑' : '走';
    const up = before === 'sit' || before === 'kneel' || before === 'lie' || before === 'sleep' ? `先站起来,` : '';
    const where = `${x}/${w}(${pct(x / w)})`;
    return {
      text: moved < pixels - CLAMP_SLACK_PX
        ? `${up}本来要往${side}${verb} ${pixels} 像素,${side}边只剩约 ${moved} 像素,${verb}到屏幕边停下了,在 ${where}。`
        : `${up}往${side}${verb}了 ${moved} 像素,到了 ${where}。`,
    };
  }

  private async setSettings(args: Record<string, unknown>): Promise<ToolOutcome> {
    if (!this.cfg.selfAdjust) return { text: `[pet_set 没执行] ${this.cfg.user}在「习惯」页关掉了「允许自己调整」。`, failed: true };
    const packs = this.packs();
    const { changes, errors } = planSettings(args, { ...this.cfg, skin: this.skin }, packs);
    if (errors.length) return { text: `[pet_set 没执行] ${errors.join(';')}。`, failed: true };
    if (!changes.length) return { text: '要改的都和现在一样,没有改动。' };
    const lines: string[] = [];
    const apply = (list: SettingChange[]) => {
      for (const c of list) this.opts.persist(c.patch);
      const skin = this.skin;
      if (list.some((c) => c.key === 'figure' || c.key === 'scheme')) this.botLook = (skin.figure ?? COO) === COO ? COO : `${skin.figure}:${skin.scheme ?? ''}`;
      this.syncPrefs();
      this.opts.onBotChange?.();
    };
    const mine = changes.filter((c) => c.tier === 'self');
    if (mine.length) { apply(mine); lines.push(`已改:${mine.map((c) => c.say).join(';')}。`); }
    const asked = changes.filter((c) => c.tier === 'ask');
    if (asked.length) {
      const answer = await this.confirm(`我想${asked.map((c) => c.say).join('、')},可以吗?`, ['可以', '不用了']);
      if (answer === 'yes') { apply(asked); lines.push(`${this.cfg.user}同意了,已改:${asked.map((c) => c.say).join(';')}。`); }
      else lines.push(`${answer === 'unavailable' ? '桌宠窗口没有连接,没法问' : answer === 'timeout' ? `${this.cfg.user}没有回答` : `${this.cfg.user}没同意`},这些没改:${asked.map((c) => c.say).join(';')}。`);
    }
    if (mine.some((c) => c.key === 'figure' || c.key === 'scheme')) lines.push(`你现在的样子:${this.bodyText(this.currentPack())}。`);
    return { text: lines.join('\n') };
  }

  private async setQuiet(args: Record<string, unknown>): Promise<ToolOutcome> {
    const minutes = args.minutes;
    if (typeof minutes !== 'number' || !(minutes >= 0) || minutes > QUIET_MAX_MIN) return { text: `[pet_quiet 没执行] minutes 应为 0–${QUIET_MAX_MIN} 的数。`, failed: true };
    if (minutes === 0) {
      if (!this.quiet) return { text: '现在没有在安静。' };
      this.endQuiet();
      return { text: '已结束安静,音效和走动回到设置里的样子。' };
    }
    if (!this.cfg.selfAdjust) return { text: `[pet_quiet 没执行] ${this.cfg.user}在「习惯」页关掉了「允许自己调整」。`, failed: true };
    const sound = args.sound === true;
    const roam: RoamMode = args.roam === 'calm' ? 'calm' : 'off';
    const base = this.quiet?.base ?? { sound: this.cfg.sound, roam: this.cfg.roam };
    if (this.quiet) clearTimeout(this.quiet.timer);
    const until = Date.now() + minutes * 60_000;
    this.quiet = { sound, roam, until, base, timer: setTimeout(() => this.endQuiet(), minutes * 60_000) };
    this.syncPrefs();
    return { text: `安静到 ${shortTime(this.opts.timezone, new Date(until))}:音效${sound ? '照常' : '关'},走动 ${roam === 'off' ? '不乱动' : '多待着'}。设置没变,到时自动恢复。` };
  }

  private endQuiet(): void {
    if (!this.quiet) return;
    clearTimeout(this.quiet.timer);
    this.quiet = null;
    this.syncPrefs();
  }

  private async act(args: Record<string, unknown>): Promise<ToolOutcome> {
    const list = Array.isArray(args.actions) ? args.actions : typeof args.actions === 'string' ? [args.actions] : [];
    const vocab = this.vocab();
    const { actions, dropped, notes } = parseActions(list, vocab, this.pairs());
    if (!actions.length) return { text: `[pet_act 没执行] 当前形象的词表里没有这些动作${dropped.length ? `(${dropped.join('、')})` : ''}。`, failed: true };
    if (!this.server.sendPet({ t: 'act', id: nextId('c'), actions })) return this.notConnected('pet_act');
    this.notePosture(actions);
    const lasting = membersOf(actions).filter((a) => vocab.find((v) => v.id === a)?.lasting);
    const params = `${dropped.length ? `当前形象的词表里没有这些,已略过:${dropped.join('、')}。` : ''}${notes.join('')}`;
    const note = params ? `\n[执行参数] ${params}` : '';
    const held = [...new Set(lasting)].map((a) => `${a} ${lastingNote(vocab.find((v) => v.id === a)!, vocab)}。`).join('');
    return { text: `开始依次做:${actions.join(' → ')}。${held}${note}` };
  }


  /* ---------- decider mode ---------- */

  /** The app's OpenRouter key, read now; '' without one (or when reading it fails). */
  private deciderKey(): string {
    try { return this.opts.deciderKey?.() ?? ''; } catch { return ''; }
  }

  /** The decider settings, with the defaults for a config written before they existed. */
  private deciderCfg(): DesktopPetConfigSection['decider'] {
    return { ...DESKTOP_PET_DEFAULTS.decider, ...this.cfg.decider };
  }

  private wantedMode(): PetMode {
    return this.deciderCfg().enabled && this.keyKnown ? 'decider' : 'classic';
  }

  /** The mode in force for tools and prompt (latched: it changes here only, and the app is told to rebuild the prefix). */
  get petMode(): PetMode {
    return this.mode;
  }

  /** Looks again at the setting (every sync) and the key (every KEY_POLL_MS); a change is latched and told to the app. */
  private refreshMode(): void {
    const now = Date.now();
    if (now - this.keyCheckedAt >= KEY_POLL_MS) {
      this.keyCheckedAt = now;
      this.keyKnown = this.deciderKey() !== '';
    }
    const want = this.wantedMode();
    if (want === this.mode) return;
    this.mode = want;
    this.log?.info(want === 'decider'
      ? `表情动作改由决策模型挑(${this.deciderCfg().model}),重建前缀`
      : `表情动作改回由 bot 自己写标记(${this.deciderCfg().enabled ? '没有 OpenRouter 密钥' : '表情决策已关'}),重建前缀`);
    if (want === 'decider') { this.warnOverride(); this.armPose(); }
    this.opts.onModeChange?.(want);
  }

  /** The deployment overrides the environment prompt: Cortico reads it in either mode. */
  private overridden(): boolean {
    try {
      const f = this.opts.envOverrideFile?.();
      return !!f && existsSync(f);
    } catch { return false; }
  }

  private warnOverride(): void {
    if (this.overrideWarned || !this.overridden()) return;
    this.overrideWarned = true;
    this.log?.warn('部署里改过桌宠的环境说明(旧模式的版本),表情决策模式下它仍会生效;想用新说明,在「提示词」页还原它');
  }

  /** The page's report of where the body is: `{ t: 'pose', x, w, facing, mode }`. */
  private onPose(msg: PageMessage): void {
    const x = Number(msg.x), w = Number(msg.w);
    if (!Number.isFinite(x) || !Number.isFinite(w) || w <= 0) return;
    const mode = typeof msg.mode === 'string' ? msg.mode : 'idle';
    // a kneel ends when she gets up from it, or never showed (the page shows a kneel as sit)
    if (mode !== 'sit' && (this.pose?.mode === 'sit' || Date.now() - this.kneelAt > KNEEL_WAIT_MS)) this.kneeling = false;
    if (this.pendingPosture && mode !== this.pendingPosture.from) this.pendingPosture = null;
    this.pose = { x: Math.max(0, Math.min(w, x)), w, facing: msg.facing === -1 ? -1 : 1, mode };
    if (this.mode === 'decider') this.armPose();
  }

  /** What she is doing now: the page's layout mode, a kneel told apart from sitting by the last posture word sent. */
  private posture(): Posture {
    const pend = this.pendingPosture;
    if (pend) {
      if ((this.pose?.mode ?? null) === pend.from && Date.now() - pend.at < POSTURE_PENDING_MS) return pend.posture;
      this.pendingPosture = null;
    }
    switch (this.pose?.mode) {
      case 'sit': return this.kneeling ? 'kneel' : 'sit';
      case 'lie': return 'lie';
      case 'sleep': return 'sleep';
      case 'wake': return 'wake';
      case 'walk': return 'walk';
      case 'run': return 'run';
      case 'drag': case 'air': case 'crouch': return 'busy';
      case 'dizzy': return 'dizzy';
      default: return 'stand';
    }
  }

  /**
   * Follows a kneel through the words sent: a kneel starts one; a word that ends it (`lastingNote`: anything but a
   * face, a head gesture, a tail's, ears' or wings' move, and with `keepsArms` an arm-only gesture or a song) ends it.
   */
  private notePosture(entries: readonly string[]): void {
    const vocab = this.vocab();
    const byId = new Map(vocab.map((v) => [v.id, v]));
    const kneel = byId.get('kneel');
    const before = this.posture();
    let next: Posture | null = null;
    for (const id of membersOf(entries)) {
      const v = byId.get(id);
      if (!v) continue;
      if (Object.hasOwn(POSTURE_OF_WORD, id)) next = POSTURE_OF_WORD[id];
      if (id === 'kneel') { this.kneeling = true; this.kneelAt = Date.now(); continue; }
      if (!this.kneeling || v.kind === 'expression') continue;
      const cs = channelsOf(v);
      const keeps = (cs.length === 1 && (cs[0] === 'head' || APPENDAGES.includes(cs[0])))
        || (!!kneel?.keepsArms && ((cs.length === 1 && cs[0] === 'arm') || id === 'song'));
      if (!keeps) this.kneeling = false;
    }
    // told as her posture until the page shows it (the next call's [位置] and body question would say the old one)
    if (next && next !== before) this.pendingPosture = { posture: next, from: this.pose?.mode ?? null, at: Date.now() };
  }

  /** `[位置] …`: where she is, which way she faces, her posture and how far she can walk each way; null before the page said. */
  positionLine(): string | null {
    const p = this.pose;
    if (!p) return null;
    const x = Math.round(p.x), w = Math.round(p.w);
    // the stage's edge: the kit keeps half the figure's width plus 8 px in (approximated, the receipt of a walk tells exactly)
    const margin = Math.round(.25 * 256 * .42 * this.cfg.window.scale + 8);
    const left = Math.max(0, x - margin), right = Math.max(0, w - margin - x);
    return `[位置] 屏幕横向 ${x}/${w} 像素(${pct(x / w)}),面朝${p.facing === 1 ? '右' : '左'},${POSTURE_NAMES[this.posture()]};往左还能走约 ${left} 像素,往右约 ${right} 像素。`;
  }

  /**
   * The position line with, once, what the bubbles since the last one did (`[表情动作] 「text…」:words`): their
   * receipts went back before their decisions were made.
   */
  private positionWithPicks(): string | null {
    const line = this.positionLine();
    if (!line) return null;
    if (!this.unreported.length) return line;
    const picks = this.unreported.map((u) => `「${u.text}」${u.did}`).join(';');
    this.unreported = [];
    return `${line}\n[表情动作] 刚才的气泡:${picks}。`;
  }

  private withPosition(out: string | ToolOutcome): string | ToolOutcome {
    const line = this.positionWithPicks();
    if (!line) return out;
    if (typeof out === 'string') return `${out}\n${line}`;
    return typeof (out as { text?: unknown }).text === 'string' ? { ...out, text: `${(out as { text: string }).text}\n${line}` } : out;
  }

  /**
   * Keeps one position event waiting to ride on the next batch (piggyback: it wakes nothing), rendered when the batch
   * goes, so the bot sees where she is then; once rendered the next is armed. Decider mode only.
   */
  private armPose(): void {
    const host = this.host;
    if (!host || this.mode !== 'decider') return;
    const now = Date.now();
    if (this.poseArmedAt !== null && now - this.poseArmedAt < POSE_REARM_MS) return;
    this.poseArmedAt = now;
    const token = ++this.poseToken;
    host.pushDeferred({
      type: 'desktop-pet.pose', senderKey: 'desktop-pet.pose', tags: ['snapshot'],
      render: () => {
        if (token !== this.poseToken) return null;
        this.poseArmedAt = null;
        // the next one, once this batch is built
        setImmediate(() => this.armPose());
        if (this.mode !== 'decider' || !this.server.petConnected) return null;
        return this.positionWithPicks();
      },
    }, { trigger: 'piggyback' });
  }

  /** The words of entries by their first names, a group's joined by '+'. */
  private namesOf(entries: readonly string[]): string {
    const vocab = this.vocab();
    return entries.map((e) => e.split('+').map((id) => { const v = vocab.find((w) => w.id === id); return v ? firstName(v) : id; }).join('+')).join(' → ');
  }

  /** How long the lasting words among entries hold (`lastingNote`). */
  private heldNote(entries: readonly string[]): string {
    const vocab = this.vocab();
    return [...new Set(membersOf(entries))].map((id) => vocab.find((v) => v.id === id)).filter((v): v is VocabWord => !!v?.lasting)
      .map((v) => `${firstName(v)} ${lastingNote(v, vocab)}。`).join('');
  }

  /** Where she stands as a phrase. */
  private placeText(): string | undefined {
    const p = this.pose;
    if (!p) return undefined;
    const f = p.x / p.w;
    return f < .2 ? '屏幕最左边' : f < .4 ? '屏幕偏左' : f < .6 ? '屏幕中间' : f < .8 ? '屏幕偏右' : '屏幕最右边';
  }

  private timeText(now = new Date()): string {
    const wd = new Intl.DateTimeFormat('zh-CN', { timeZone: this.opts.timezone, weekday: 'short' }).format(now);
    return `${wd} ${shortTime(this.opts.timezone, now)}`;
  }

  /**
   * One decision: the questions for the body on screen and her posture, the state, the call; the answers picked into
   * a group (`pickGroup`) and parsed as `pet_act` parses one. Failures come back with their reason; the mode stays.
   */
  private async decideFor(o: { tool: DecisionRecord['tool']; feeling: string; text?: string; forSay: boolean }): Promise<Decided> {
    const vocab = this.vocab();
    const pairs = this.pairs();
    const posture = this.posture();
    const now = Date.now();
    const questions = buildQuestions(vocab, { forSay: o.forSay, posture });
    const heard = this.lastHeard && now - this.lastHeard.at < HEARD_MS
      ? { who: this.cfg.user, text: this.lastHeard.text, via: this.lastHeard.via, agoMs: now - this.lastHeard.at } : null;
    const state = buildState({
      body: this.bodyText(this.currentPack()), feeling: o.feeling, text: o.text, heard, posture,
      place: this.placeText(), facing: this.pose?.facing, time: this.timeText(),
      recent: this.recentPicks.map((r) => ({ words: r.words, agoMs: now - r.at })),
    });
    const model = this.deciderCfg().model || DESKTOP_PET_DEFAULTS.decider.model;
    const res = await this.decider.decide(buildRequest(model, state, questions));
    const base = {
      tool: o.tool, feeling: o.feeling, ...(o.text !== undefined ? { text: o.text } : {}), state, model,
      questions: questions.map((q) => ({ id: q.id, options: q.options.length })), ms: res.ms,
    };
    if (!res.ok) {
      const why = failureText(res.reason, res.detail);
      this.log?.debug(`表情决策没成:${why}`);
      this.opts.onDecision?.({ ...base, answers: null, why: {}, actions: [], notes: [], dropped: [], ok: false, failure: why });
      return { ok: false, reason: res.reason, why };
    }
    this.host?.reportUsage({ promptTokens: res.usage.inputTokens, completionTokens: res.usage.outputTokens, cacheHitTokens: 0, cacheMissTokens: res.usage.inputTokens }, { model, label: '桌宠·表情决策' });
    const pick = pickGroup(questions, res.answers, { vocab, pairs, recent: this.recentPicks.map((r) => r.chosen) });
    const parsed = parseActions(pick.ids.length ? [pick.ids.join('+')] : [], vocab, pairs);
    const split = parsed.notes.filter((n) => n.includes('不能同时做'));
    if (split.length) this.log?.warn(`表情决策挑出的一组被拆开了:${split.join('')}`);
    if (parsed.dropped.length) this.log?.warn(`表情决策挑出了词表没有的词:${parsed.dropped.join('、')}`);
    const top = topAnswers(res.answers);
    this.log?.debug(`表情决策 ${res.ms} ms:${Object.entries(top).map(([q, a]) => `${q}=${a.top.map(([k, p]) => `${k}${p}`).join('/')}`).join(' ')} → ${pick.ids.join('+') || '不动'}`);
    this.recentPicks.unshift({ at: now, words: membersOf(parsed.actions).map((id) => { const v = vocab.find((w) => w.id === id); return v ? firstName(v) : id; }), chosen: pick.chosen });
    this.recentPicks.splice(RECENT_DECISIONS);
    this.opts.onDecision?.({ ...base, answers: top, why: pick.why, actions: parsed.actions, notes: parsed.notes, dropped: parsed.dropped, ok: true, usage: res.usage });
    return { ok: true, actions: parsed.actions, notes: parsed.notes.filter((n) => !n.includes('不能同时做')) };
  }

  /**
   * The decision models for the console's picker: OpenRouter's public listing (no key sent), kept DECIDER_LIST_TTL_MS
   * (`fresh` fetches again); when it cannot be fetched, the last listing (`cache`) or the ids we know (`fallback`,
   * no price or context). Models whose context cannot take a request are left out: at least DECIDER_MIN_CONTEXT, and
   * a quarter more than the largest request seen this run.
   */
  async deciderModels(fresh = false): Promise<{ models: DeciderModel[]; source: 'live' | 'cache' | 'fallback'; minContext: number }> {
    const minContext = Math.max(DECIDER_MIN_CONTEXT, Math.ceil(this.decider.maxInput * 1.25));
    const fit = (ms: DeciderModel[]) => ms.filter((m) => m.context === null || m.context >= minContext);
    const now = Date.now();
    if (!fresh && this.deciderList && now - this.deciderList.at < DECIDER_LIST_TTL_MS) return { models: fit(this.deciderList.models), source: 'live', minContext };
    this.deciderListing ??= listDeciders(this.opts.deciderFetch, this.opts.deciderModelsUrl ?? DECIDER_MODELS_URL, 5000, 0)
      .finally(() => { this.deciderListing = null; });
    const got = await this.deciderListing;
    if (got && got.length) {
      this.deciderList = { at: Date.now(), models: got };
      return { models: fit(got), source: 'live', minContext };
    }
    if (this.deciderList) return { models: fit(this.deciderList.models), source: 'cache', minContext };
    return { models: DECIDER_FALLBACK_MODELS.map((id) => ({ id, promptPerM: null, context: null })), source: 'fallback', minContext };
  }

  /** The console's view of decider mode (no key in it: only whether there is one). */
  deciderState(): Record<string, unknown> {
    const c = this.deciderCfg();
    return {
      mode: this.mode, enabled: c.enabled, model: c.model, timeoutMs: c.timeoutMs, keySet: this.keyKnown,
      lent: !!this.opts.deciderKey, open: this.decider.open, last: this.decider.last, calls: this.decider.calls,
      cost: Math.round(this.decider.cost * 1e6) / 1e6, overridden: this.mode === 'decider' && this.overridden(),
    };
  }

  /* ---------- prompt ---------- */

  envPromptVars(): Record<string, string> {
    return {
      'pet.user': this.cfg.user,
      // decider mode shows no words; empty, so a deployment's override of the classic text renders without them
      'pet.vocab': this.mode === 'decider' ? '' : vocabTable(this.vocab(), 'zh', this.pairs()),
      'pet.voice': this.cfg.asr.enabled ? '开着' : '关着',
      'pet.body': this.bodyText(this.currentPack()),
      'pet.dress': dressTable(this.packs()),
      'pet.self': this.cfg.selfAdjust ? '开着' : '关着',
      'pet.chat': this.opts.controls?.openChat
        ? '应用的「对话」页按时间列出这些气泡、对方的话,以及你两句话之间调用过的工具名;对方也能在那里打字、发图片(同样是 `[打字]` 事件,图片接在正文后),回答 `pet_ask`。'
        : '',
    };
  }

  /* ---------- console ---------- */

  console(language: Language = 'zh'): WorldConsoleDecl {
    const w = this.windowHost?.state();
    const v = this.backendState();
    const lamps: WorldLamp[] = [
      {
        label: '桌宠窗口',
        state: this.server.petConnected ? 'online' : w?.phase === 'running' ? 'loading' : w?.phase === 'missing' || w?.phase === 'error' ? 'error' : 'offline',
        hint: this.server.petConnected ? '页面已连接' : w?.detail ?? '未打开',
      },
      {
        label: '语音识别',
        state: !this.cfg.asr.enabled ? 'offline' : v?.phase === 'running' ? 'online' : v?.phase === 'starting' ? 'loading' : v?.phase === 'error' ? 'error' : 'offline',
        hint: v?.detail ?? v?.phase ?? '未启动',
      },
      this.deciderLamp(),
    ];
    return {
      label: language === 'en' ? 'Desktop pet' : '桌宠',
      lamps,
      panels: [...DESKTOP_PET_PANEL_DECLS],
      invoke: (panel, method, args) => this.invoke(panel, method, args),
      stream: (panel, socket) => {
        if (panel === 'chat') { this.chat.add(socket, (msg, s) => void this.onChat(msg, s)); return; }
        if (panel !== 'voice') { socket.close('no stream'); return; }
        this.voiceSockets.add(socket);
        socket.onClose(() => this.voiceSockets.delete(socket));
      },
      links: this.server.port ? [{ label: '在浏览器里看桌宠', href: this.petUrl }, { label: '装扮', href: `${this.server.origin}/dress` }] : [],
      config: [DESKTOP_PET_CONFIG_GROUP, DESKTOP_PET_SOUND_CONFIG_GROUP, DESKTOP_PET_ASR_CONFIG_GROUP, DESKTOP_PET_DECIDER_CONFIG_GROUP],
      // one template per mode, only the one in force declared (Cortico keeps one override file per World, read in either mode)
      promptDocs: [this.mode === 'decider' ? {
        key: `worlds.${DESKTOP_PET_ID}.envPromptDecider`,
        title: '桌宠环境(表情决策)',
        description: '描述桌宠的身体、工具与输入事件;表情动作交给决策模型时用这一份。',
        path: ENV_PROMPT_DECIDER_FILE,
        role: 'envPrompt',
        vars: PROMPT_VARS.filter((v) => v.name !== 'pet.vocab'),
      } : {
        key: `worlds.${DESKTOP_PET_ID}.envPrompt`,
        title: '桌宠环境',
        description: '描述桌宠的身体、工具与输入事件。',
        path: ENV_PROMPT_FILE,
        role: 'envPrompt',
        vars: PROMPT_VARS,
      }],
    };
  }

  private deciderLamp(): WorldLamp {
    const c = this.deciderCfg();
    if (this.mode === 'classic') {
      return { label: '表情决策', state: 'offline', hint: !c.enabled ? '已关:bot 自己写表情动作标记' : '没有 OpenRouter 密钥:bot 自己写表情动作标记' };
    }
    const last = this.decider.last;
    const used = this.decider.calls ? `;本次运行 ${this.decider.calls} 次${this.decider.cost ? `,约 $${this.decider.cost.toFixed(5)}` : ''}` : '';
    if (this.decider.open) return { label: '表情决策', state: 'error', hint: `连续出错,暂停一会儿${last?.reason ? `:${last.reason}` : ''}` };
    if (!last) return { label: '表情决策', state: 'loading', hint: `${c.model},还没用过` };
    return { label: '表情决策', state: 'online', hint: last.ok ? `${c.model},上次 ${last.ms} ms${used}` : `上次没成:${last.reason ?? ''}${used}` };
  }

  private async invoke(panel: string, method: string, args: unknown[]): Promise<unknown> {
    if (panel === 'chat' && method === 'blob') {
      const handle = typeof args[0] === 'string' && args[0].startsWith('log:') ? args[0] : null;
      const blob = handle ? this.host?.blob(handle) : null;
      if (!blob) throw new Error('没有这张图');
      return { $binary: { mime: blob.mime, base64: Buffer.from(blob.bytes).toString('base64') } };
    }
    if (panel === 'pet') {
      switch (method) {
        case 'state': return this.petState();
        case 'openWindow': this.openWindow(); return this.petState();
        case 'closeWindow': await this.windowHost?.stop(); return this.petState();
        case 'installElectron': void this.store.electron.install(); return this.petState();
        // the decision models OpenRouter lists, for the console's model picker (public: no key is sent)
        case 'deciders': return this.deciderModels(args[0] === true);
        case 'guide': {
          if (!this.opts.controls?.guide) throw new Error('这个应用没有引导');
          this.opts.controls.guide();
          return this.petState();
        }
      }
    }
    if (panel === 'voice') {
      switch (method) {
        case 'state': return this.voiceState();
        case 'install': void this.installVoice(); return this.voiceState();
        case 'start': await this.startVoiceBackend(); return this.voiceState();
        case 'stop': await this.stopVoiceBackend(); return this.voiceState();
        case 'setEngine': {
          const engine = args[0];
          if (engine === 'funasr' || engine === 'system') this.opts.persist({ asr: { engine } });
          if (this.cfg.asr.enabled) await this.startVoiceBackend();
          return this.voiceState();
        }
        case 'setEnabled': this.savePrefs({ mic: args[0] === true }); return this.voiceState();
        case 'setMic': {
          this.savePrefs({ micSettings: args[0] });
          await this.syncHotkey();
          return this.voiceState();
        }
      }
    }
    throw new Error(`未知方法 ${panel}.${method}`);
  }

  /** Downloads the FunASR model, chooses FunASR, and starts it when voice input is on. */
  async installVoice(): Promise<void> {
    if (this.store.funasr.state().phase !== 'ready') await this.store.funasr.install();
    if (this.store.funasr.state().phase !== 'ready') { this.syncPrefs(); return; }
    // downloading the model is choosing it
    if (this.cfg.asr.engine !== 'funasr') this.opts.persist({ asr: { engine: 'funasr' } });
    if (this.cfg.asr.enabled) await this.startVoiceBackend();
    else this.syncPrefs();
  }

  petState(): Record<string, unknown> {
    return {
      connected: this.server.petConnected,
      url: this.server.port ? this.petUrl : null,
      dressUrl: this.server.port ? `${this.server.origin}/dress` : null,
      skin: this.skin,
      window: this.windowHost?.state() ?? null,
      electron: { ...this.store.electron.state(), supported: this.store.electron.supported },
      screen: this.screen,
      decider: this.deciderState(),
    };
  }

  voiceState(): Record<string, unknown> {
    return {
      enabled: this.cfg.asr.enabled,
      engine: this.engine(),
      engineSetting: this.cfg.asr.engine,
      systemSupported: systemRecognizerSupported(),
      server: this.backendState(),
      model: { ...this.store.funasr.state(), bytes: this.store.funasr.bytes },
      mic: this.micState,
      input: {
        ...this.cfg.asr.mic,
        effectiveMode: this.micMode(),
        hotkeyLabel: hotkeyLabel(this.cfg.asr.mic.hotkey),
        /** The keys alone, and how many presses (the last one held): for a key cap that shows the taps. */
        keyLabel: comboLabel(this.cfg.asr.mic.hotkey),
        taps: splitTaps(this.cfg.asr.mic.hotkey).taps,
        hint: this.talkHint(),
        hotkeyProblem: this.hotkeyProblem,
        open: this.gateOpen(),
        devices: this.devices,
      },
      level: this.level,
      thresholdDb: this.cfg.asr.segment.thresholdDb,
      recent: this.heard.slice(-20),
      counts: { ...this.counts },
    };
  }
}

export const modelsDirFor = (root: string) => join(root, DESKTOP_PET_ID);
