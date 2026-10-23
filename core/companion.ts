/**
 * The app's Core process: Cormini as the Persona, the console, desktop-pet, cua and coopanion Worlds, Coo Pet
 * Provider (DeepSeek and the other model services Coo offers) and its `chatgpt` module (a ChatGPT plan, signed in
 * instead of a key; testing) next to Cortico's built-in providers,
 * and Worlds or providers installed from npm through the console's extension page.
 *
 * The two bundled Worlds are wired to each other and to the app: the header of the pet's right-click
 * menu pauses and resumes the run, opens the settings window and quits the app, as the console's rail
 * foot does; computer use
 * asks for permission in the pet's bubble, and falls back to its own system dialog while no
 * pet page is connected.
 *
 * The `coopanion` World (`notice.ts`) tells Coo what the app has to say: the release notes after
 * an update, and the settings the person changes.
 *
 * The settings window's colours follow the pet's look (`console-theme.ts`): at start and whenever the
 * dressing page saves one.
 *
 * First start writes the files in `seed.ts`; after that every value is the operator's, edited in
 * the console. While the active endpoint has no key, event delivery starts paused. The first start
 * runs the introduction (`guide.ts`) in the pet's bubble, the key box included; after it, the pet
 * asks for a missing key in its bubble now and then, for as long as no key is set; with a key, a
 * run of failed model requests is told in the bubble with the upstream's reason. However the
 * introduction ends, the `coopanion` World hands Coo its record; walked through to the end, also
 * that the persona, the names and the rest are now its to settle with the person, and the prompt
 * page is where both of them edit it.
 *
 * The app language (`config.language`, `language.ts`) is lent to the Worlds and the introduction as a getter read at
 * each use; a new install takes the system's (`COOPANION_SYSTEM_LANGUAGE`). A change, written by the 「习惯」 page
 * through the console's config API (`language` in the `companion` group), is caught by `watchLanguage` the moment
 * the live config changes: the parent hears it, the prefix is rebuilt (the reply-language line), and the pet pages
 * get it with their next `prefs`.
 *
 * The parent (Electron main) gets `{ type: 'companion:ready', port, dataDir, keyMissing, language }` once the
 * console listens, `{ type: 'companion:language', language }` after the app language changes,
 * `{ type: 'companion:open', path }` to show the settings window at a console
 * route, `{ type: 'companion:browse', url }` to open the ChatGPT sign-in page in the system browser (the app opens
 * only `https://auth.openai.com/` pages), `{ type: 'companion:hide' }` to put it away (the introduction runs again on the desktop)
 * and `{ type: 'companion:quit' }` to quit the whole app; it asks for a clean stop with
 * `{ type: 'companion:shutdown' }`. A start that cannot go on says why before it exits:
 * `{ type: 'companion:locked', pid, file }` when another process holds the data directory, and
 * `{ type: 'companion:ports-busy', from, to }` when no console port Cortico tried could be listened on.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BotDefinition } from 'cortico/bot.ts';
import { createBot } from 'cortico/bot.ts';
import { announceDataDir, consumeBootFlags } from 'cortico/boot.ts';
import type { WakeBus } from 'cortico/core/bus.ts';
import { getByPath, setByPath, type ConfigGroup } from 'cortico/core/config-schema.ts';
import { updateJsonObject } from 'cortico/config-file.ts';
import { GenerationError } from 'cortico/core/generation.ts';
import { LANGUAGES, LANGUAGE_NAMES, pick, type Language } from 'cortico/core/language.ts';
import { secretReader } from 'cortico/core/secrets.ts';
import type { Core } from 'cortico/core/core.ts';
import type { CoreConfig, LogRecord, UsageRecord } from 'cortico/core/types.ts';
import { loadDeployment } from 'cortico/deploy.ts';
import { loadExtensions, readInstalled, type ExtensionSet } from 'cortico/extensions.ts';
import { deploymentRoot, providersRoot, repoRoot } from 'cortico/paths.ts';
import { providerModules, registerProviderModules } from 'cortico/providers/registry.ts';
import { InstanceLockedError } from 'cortico/core/instance-lock.ts';
import { withWorlds, type WorldDefinition, type WorldSection } from 'cortico/world.ts';
import { CONSOLE } from 'cortico/worlds/console/definition.ts';
import { desktopPetDefinition, figureOf, figurePacks, type DesktopPetWorld } from 'cortico-world-desktop-pet';
import { cuaDefinition, cuaText } from 'cortico-world-cua';
import COO, { CHATGPT_PROVIDER, endpointVendor, signedIn, usageLimited } from 'cortico-provider-coo';
import { bundledWebUiAssets } from './bundled-panels.ts';
import { consoleOrigins, portsBusy } from './console-origins.ts';
import { followPetLook } from './console-theme.ts';
import { askForKey, guideDone, markDone, runGuide, type GuideDeps } from './guide.ts';
import { noticeDefinition, type NoticeWorld } from './notice.ts';
import { appLanguage, newInstallLanguage, replyLanguage } from './language.ts';
import { CONSOLE_PORT, DEFAULT_USERS, DEPLOYMENT, DISPLAY_NAME, languageSwitchPatch, prefixFromBeforeConsole, SEED_DIR, seed, type LanguagePetValues } from './seed.ts';
import { openRouterKey } from './decider-key.ts';
import { withConsoleLast } from './prefix-order.ts';
import { presenceFrom, type PresenceReport } from './presence.ts';
import { crashFields, describeEndpoint, publicExtensionName, reportedLook, Telemetry, type Counter } from './telemetry.ts';

/** The active endpoint's key is set in the process environment or the endpoint's `.env`; a ChatGPT plan's endpoint is signed in. */
export function hasKey(config: CoreConfig): boolean {
  const entry = config.providers[config.activeProvider];
  if (!entry) return false;
  // before the secret check: the plan's endpoint has no secret
  if (entry.kind === CHATGPT_PROVIDER.id) return signedIn(join(providersRoot(), config.activeProvider));
  if (!entry.secret) return true;
  return secretReader(join(providersRoot(), config.activeProvider, '.env'))(entry.secret) !== '';
}

/** The program directory; crash reports name files relative to it. */
const APP_ROOT = fileURLToPath(new URL('../', import.meta.url));
/** How long the pet page gets to show up on a first start before the settings window opens instead. */
const PET_WAIT_MS = 60_000;
/** Pet events that mean the person is talking to Coo. */
const TALK_EVENTS = new Set(['desktop-pet.message', 'desktop-pet.speech']);
/** After an introduction where the key was put off, the first ask waits this long (talking to Coo asks sooner). */
const ASK_AFTER_GUIDE_MS = 20 * 60_000;
/** Written in the deployment directory once the introduction has run. */
const GUIDE_FILE = 'guide.json';
/** The last version the `coopanion` World told Coo about, in the deployment directory. */
const NOTICE_FILE = 'notice.json';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Notes the person talking to Coo on the bus; the returned check reports it once and resets. */
function watchTalk(bus: WakeBus): () => boolean {
  let heard = false;
  const push = bus.push.bind(bus);
  bus.push = (item, opts) => {
    if (item.event && TALK_EVENTS.has(item.event.type)) heard = true;
    push(item, opts);
  };
  return () => { const was = heard; heard = false; return was; };
}

/** The switch for anonymous usage statistics; it only matters when COOPANION_TELEMETRY_URL names a server, so no page shows it. */
const TELEMETRY_KEY = 'companion.telemetry';
/** The `x-options` kind of the app language: Cortico's languages, each named in itself. */
const LANGUAGE_OPTIONS = 'coopanion.language';
/** Coopanion's own settings, as the 「习惯」 page and the advanced settings title them. */
export const SETTINGS_TEXT = {
  zh: {
    language: { title: '界面语言', description: '设置窗口、托盘菜单和桌宠气泡里应用自己的文字用这种语言;不是中文时,Coo 也用它和你说话。' },
    roundsSoft: { title: '收尾提醒', suffix: '次', description: '一次唤醒里请求模型到这么多次,提醒 Coo 做完手上的事就结束这一轮。' },
    roundsHard: { title: '单次唤醒上限', suffix: '次', description: '一次唤醒里最多请求模型这么多次,到了就结束这一轮。' },
  },
  en: {
    language: { title: 'Language', description: 'The app\'s own text in the settings window, the tray menu and the pet\'s bubble is in this language; when it is not Chinese, Coo talks to you in it too.' },
    roundsSoft: { title: 'Wrap-up reminder', suffix: 'requests', description: 'After this many model requests in one wake-up, Coo is reminded to finish the current task and end the turn.' },
    roundsHard: { title: 'Requests per wake-up', suffix: 'requests', description: 'The most model requests in one wake-up; the turn ends when it is reached.' },
  },
};

/**
 * Coopanion's config group, titled in `language`. A Persona's config group is not asked for per request, so the
 * console reads one object (`COMPANION_GROUP`), which `main` retitles in place when the app language changes.
 */
export function companionGroup(language: Language): ConfigGroup {
  const s = pick(language, SETTINGS_TEXT);
  return {
    id: 'companion',
    owner: 'persona',
    schema: {
      type: 'object',
      title: 'Coopanion',
      properties: {
        // the app language (language.ts); the 「习惯」 page writes it here, and watchLanguage tells the rest at once
        language: {
          type: 'string',
          title: s.language.title,
          enum: [...LANGUAGES],
          'x-options': LANGUAGE_OPTIONS,
          'x-hot': true,
          description: s.language.description,
        },
        // Cormini copies `rounds` when the bot is built, so a change applies from the next start
        'rounds.soft': {
          type: 'integer',
          title: s.roundsSoft.title,
          minimum: 1,
          'x-suffix': s.roundsSoft.suffix,
          'x-hot': false,
          description: s.roundsSoft.description,
        },
        'rounds.hard': {
          type: 'integer',
          title: s.roundsHard.title,
          minimum: 1,
          'x-suffix': s.roundsHard.suffix,
          'x-hot': false,
          description: s.roundsHard.description,
        },
      },
    },
  };
}
const COMPANION_GROUP: ConfigGroup = companionGroup('zh');

/**
 * Makes `config.language` an accessor on the live config object, so a change of the app language is followed right
 * after any write that changes it: the console's config API and a World's persist both set it there. First the pet
 * World's values still at the old language's defaults take the new one's (`followLanguageDefaults`, written to
 * `cfgFile`), then `onChange` runs. `language` itself reaches `config.json` by those paths from their own values, so
 * the accessor only watches it.
 */
export function watchLanguage(config: CoreConfig, cfgFile: string, onChange: (language: Language) => void): void {
  let value: unknown = config.language;
  Object.defineProperty(config, 'language', {
    enumerable: true,
    configurable: true,
    get: () => value,
    set: (next: unknown) => {
      const was = appLanguage(value);
      value = next;
      if (appLanguage(next) === was) return;
      try {
        followLanguageDefaults(config, cfgFile, was, appLanguage(next));
      } catch (err) {
        // config.json unreadable: the console's own write of `language` fails the same way and says so
        console.warn('language defaults not followed:', err instanceof Error ? err.message : err);
      }
      onChange(appLanguage(next));
    },
  });
}

/**
 * Moves the pet World's values that are still the defaults of language `from` to those of `to`
 * (`languageSwitchPatch` in seed.ts): in the live section, which the pet World holds and reads at each use (the name
 * reaches the pages with their next `prefs`, a new speech language restarts the recognizer), and in `config.json`.
 * Called from the language setter, before the console's config API writes `language` itself, which reads the file
 * again; so the write here is synchronous and only touches its own keys.
 */
export function followLanguageDefaults(config: CoreConfig, cfgFile: string, from: Language, to: Language): Record<string, string | boolean> {
  const pet = (config as unknown as { worlds?: Record<string, Record<string, unknown>> }).worlds?.[PET_WORLD];
  if (!pet) return {};
  const patch = languageSwitchPatch(pet as LanguagePetValues, from, to);
  const keys = Object.entries(patch);
  if (!keys.length) return patch;
  updateJsonObject(cfgFile, (raw) => {
    const worlds = (raw.worlds ??= {}) as Record<string, Record<string, unknown>>;
    const section = (worlds[PET_WORLD] ??= {});
    for (const [path, v] of keys) setByPath(section, path, v);
  });
  // only once the file has them: a failed write changes nothing
  for (const [path, v] of keys) setByPath(pet, path, v);
  return patch;
}
const PET_WORLD = 'desktop-pet';

/** Pet events counted for statistics, and whether they are a message to Coo. */
const EVENT_COUNTERS: Record<string, [Counter, boolean]> = {
  'desktop-pet.message': ['messagesText', true],
  'desktop-pet.speech': ['messagesVoice', true],
  'desktop-pet.touch': ['touches', false],
  'desktop-pet.answer': ['answers', false],
};

/** Counts the person's events, Coo's lines, computer-use actions and model calls for `telemetry`. */
function countUse(core: Core<CoreConfig>, config: CoreConfig, telemetry: Telemetry): void {
  const { bus, toolLog, usageLog } = core;
  const push = bus.push.bind(bus);
  bus.push = (item, opts) => {
    const hit = item.event ? EVENT_COUNTERS[item.event.type] : undefined;
    if (hit) { telemetry.count(hit[0]); telemetry.interacted(hit[1]); }
    push(item, opts);
  };
  const write = toolLog.write.bind(toolLog);
  toolLog.write = (input) => {
    if (input.tool === 'pet_say') telemetry.count('petReplies');
    else if (input.tool.startsWith('cua_')) telemetry.count('cuaActions');
    return write(input);
  };
  const append = usageLog.append.bind(usageLog);
  usageLog.append = (rec: UsageRecord) => {
    // the endpoint the try went to; usage a World reports has no try and goes under the active one
    const endpoint = config.providers[rec.attempt?.origin.instance ?? config.activeProvider];
    telemetry.usage(describeEndpoint(endpoint, rec.model, () => endpointVendor(endpoint)), {
      promptTokens: rec.promptTokens, completionTokens: rec.completionTokens, cacheHitTokens: rec.cacheHitTokens, attempt: rec.attempt,
    });
    append(rec);
  };
}

/** Model requests failed in a row before the pet says so: Cortico's own alert threshold (`STALL_ALERT_THRESHOLD` in src/core/loop.ts), where the run of failures only reaches the log. */
const FAILURES_BEFORE_HINT = 5;
/** The upstream's reason is cut to this many characters: a gateway's error page is a whole HTML document. */
const REASON_MAX = 200;
/**
 * What Cortico's Responses provider adds to a 400 that names `reasoning_text` while `sendSyntheticReasoning` is off
 * (src/providers/openai-responses-compat/native.ts): a service the vendor table sends no placeholder reasoning
 * (`Vendor.syntheticReasoning: false`) wants one after all.
 */
export const SYNTHETIC_REASONING_OFF = 'sendSyntheticReasoning is off';

/**
 * Coo's default context stages (upstream #288): a 128k stage budget and a quarter kept at a handoff, over
 * Cormini's 64k and a third. Only the default: what 「上下文与交接」 saved in config.json stays as it is.
 */
export function cooContext(base: CoreConfig['context']): CoreConfig['context'] & { maxTokens: number; keepRatio: number } {
  return { ...base, maxTokens: 128_000, keepRatio: 0.25 };
}

/** Coo's defaults over Cormini's own (`cormini.defaults()`); config.json and the console's saves go over these. */
export function cooDefaults(own: CoreConfig): CoreConfig {
  return {
    ...own,
    displayName: DISPLAY_NAME,
    web: { port: CONSOLE_PORT, theme: 'mint' },
    // Cormini's 6/12 end a computer-use task partway through; 20/40 are the caps the cua and
    // desktop-pet e2e harnesses give their persona
    rounds: { soft: 20, hard: 40 },
    context: cooContext(own.context),
    companion: { telemetry: true },
  } as CoreConfig;
}

/**
 * Whether computer use is as its switch says: switched on, the cua World is mounted and the prefix has its tools;
 * switched off, it is gone (Cortico's `worldVisibility`: the mounted Worlds, and those the prefix has not caught up with).
 */
export function cuaSettled(worlds: { visibility: Record<string, boolean>; driftedWorlds: string[] }, enabled: boolean): boolean {
  return ('cua' in worlds.visibility) === enabled && !worlds.driftedWorlds.includes('cua');
}

/**
 * Calls `exit` once Core logs that its main loop stopped (`event: 'loop-exit'`, Cortico #293), with the error it
 * logged. The loop delivers nothing after that while the process lives on; the app restarts a Core that exits.
 */
export function onLoopExit(runlog: { onWrite(cb: (entry: LogRecord) => void): void }, exit: (err: Error | undefined) => void): void {
  runlog.onWrite((entry) => {
    if (entry.event !== 'loop-exit') return;
    exit(entry.err && Object.assign(new Error(entry.err.message), entry.err));
  });
}

/** Where the person reports what only a change to Coopanion fixes. */
const ISSUES_URL = 'https://github.com/yxengram/Coopanion/issues';

export const FAILURE_HINT = {
  zh: {
    text: (n: number, status: number, reason: string) => `我连着 ${n} 次没能从模型那里拿到回复。错误${status ? ` ${status}` : ''}:${reason}。请在设置的「开始」页检查模型名和 API Key,那里可以测试连接。`,
    /** The service wants reasoning sent back before each tool call, which Coopanion has turned off for it. */
    reasoningReplay: (n: number) => `我连着 ${n} 次没能从模型那里拿到回复:这家服务商要求每次调用工具前都回传思考内容,Coopanion 对它关掉了这一项。请把这件事反馈给开发者:${ISSUES_URL}`,
    open: '打开设置',
    ok: '知道了',
  },
  en: {
    text: (n: number, status: number, reason: string) => `My last ${n} requests to the model failed. Error${status ? ` ${status}` : ''}: ${reason}. Check the model name and API key on the Start page in settings, where you can test the connection.`,
    reasoningReplay: (n: number) => `My last ${n} requests to the model failed: this service requires the thinking to be sent back before every tool call, and Coopanion has that turned off for it. Please report this to the developers: ${ISSUES_URL}`,
    open: 'Open settings',
    ok: 'OK',
  },
};

/**
 * The upstream's own words: `error.message` of a JSON body, else the body; without a body (no
 * connection, a timeout), the message of the innermost cause, such as `getaddrinfo ENOTFOUND <host>`.
 */
function failureOf(err: unknown): { status: number; reason: string } {
  let root = err;
  while (root instanceof Error && root.cause instanceof Error) root = root.cause;
  let said = err instanceof GenerationError ? err.body.trim() : '';
  try {
    const body = JSON.parse(said) as { error?: { message?: unknown }; message?: unknown };
    const message = body.error?.message ?? body.message;
    if (typeof message === 'string') said = message;
  } catch { /* not JSON: the body as it came */ }
  const reason = said || (root instanceof Error ? root.message : String(root));
  return { status: err instanceof GenerationError ? err.status : 0, reason: reason.slice(0, REASON_MAX).replace(/[。.!！\s]+$/, '') };
}

/**
 * After `FAILURES_BEFORE_HINT` model requests in a row fail, the pet says why in its bubble, once
 * per run of failures, with a button to the settings window's home page, where the model and key
 * are set and tested. Any answered request ends the run; a request cut off by newer input or by
 * shutdown neither counts nor ends it, and neither does one refused for a ChatGPT plan's usage limit (its client
 * waits the limit out and logs it; only a request that cannot be sent again fails with it). A 400 the vendor table caused by sending no placeholder reasoning
 * (`SYNTHETIC_REASONING_OFF`) is said as that, with no settings button: nothing the person can set fixes it.
 */
export function hintFailures(core: Core<CoreConfig>, config: CoreConfig, pet: () => DesktopPetWorld | null): void {
  const { llm } = core;
  const respond = llm.respond.bind(llm);
  let failures = 0;
  let shown = false;
  llm.respond = async (request, options) => {
    try {
      const answered = await respond(request, options);
      failures = 0;
      shown = false;
      return answered;
    } catch (err) {
      if (!options?.signal?.aborted && !usageLimited(err) && ++failures >= FAILURES_BEFORE_HINT && !shown) {
        const p = pet();
        if (p?.petState().connected) {
          const S = pick(appLanguage(config.language), FAILURE_HINT);
          const { status, reason } = failureOf(err);
          // (anywhere along the causes: Cortico's router hands the provider's error on as it is, a wrapper may not)
          let replay = false;
          for (let e: unknown = err; e instanceof Error && !replay; e = e.cause) replay = e.message.includes(SYNTHETIC_REASONING_OFF);
          shown = true;
          void p.dialog({
            text: replay ? S.reasoningReplay(failures) : S.text(failures, status, reason), actions: ['sad'], closable: true,
            input: { kind: 'buttons', options: replay ? [{ label: S.ok, primary: true }] : [{ label: S.open, primary: true }, { label: S.ok }] },
          }).answer.then((a) => {
            if (!replay && 'index' in a && a.index === 0) process.send?.({ type: 'companion:open', path: '#/home' });
            // the page went away before it showed: the next failure tries again
            if ('unavailable' in a) shown = false;
          });
        }
      }
      throw err;
    }
  };
}

/** Words the app lends the Worlds: the power button in the pet menu's header (computer use's answers are its own, `cuaText`). */
export const LENT_TEXT = {
  zh: { quit: '退出应用' },
  en: { quit: 'Quit app' },
};

export const UPDATE_TEXT = {
  zh: {
    downloading: (v: string) => `发现新版本 ${v},正在后台下载,下好了我再告诉你。`,
    ready: (v: string) => `新版本 ${v} 下载好了。现在重启更新吗?不急的话,下次退出应用时会自动装上。`,
    failed: (v: string, why: string) => `新版本 ${v} 没能下载下来:${why}。可以去 GitHub 手动下载安装。`,
    ok: '好', github: '去 GitHub 下载', install: '现在重启更新', later: '下次再说', gotIt: '知道了',
    /** While downloading: the second button, and what it says while pointed at or focused. */
    trouble: '遇到问题?', githubByHand: '去 GitHub 手动下载',
  },
  en: {
    downloading: (v: string) => `Version ${v} is out and downloading in the background; I'll tell you when it's ready.`,
    ready: (v: string) => `Version ${v} is downloaded. Restart to update now? Otherwise it installs the next time you quit the app.`,
    failed: (v: string, why: string) => `Version ${v} did not download: ${why}. You can get it from GitHub yourself.`,
    ok: 'OK', github: 'Download from GitHub', install: 'Restart and update', later: 'Later', gotIt: 'OK',
    trouble: 'Having trouble?', githubByHand: 'Download from GitHub',
  },
};

interface UpdateStep { phase: 'downloading' | 'ready' | 'failed'; version: string; reason?: string }

/**
 * Says the updater's steps (app/updater.cjs) in the pet's bubble: once each, when the pet page is
 * there and the introduction is not running; a newer step replaces one not yet said.
 */
function sayUpdates(config: CoreConfig, pet: () => DesktopPetWorld | null, guiding: () => boolean): (step: UpdateStep) => void {
  let pending: UpdateStep | null = null;
  const said = new Set<string>();
  const S = () => pick(appLanguage(config.language), UPDATE_TEXT);
  setInterval(() => {
    const p = pet();
    if (!pending || guiding() || !p?.petState().connected) return;
    const step = pending;
    pending = null;
    const s = S();
    // while it downloads the way to GitHub stays out of sight until asked for: a download started by hand runs the
    // installer as a new install, where it asks for a directory (the update itself goes where the program is)
    const [text, options] = step.phase === 'downloading' ? [s.downloading(step.version), [{ label: s.ok, primary: true }, { label: s.trouble, hover: s.githubByHand }]]
      : step.phase === 'ready' ? [s.ready(step.version), [{ label: s.install, primary: true }, { label: s.later }]]
        : [s.failed(step.version, step.reason ?? '?'), [{ label: s.github, primary: true }, { label: s.gotIt }]];
    void p.dialog({ text, actions: [step.phase === 'failed' ? 'sad' : 'happy'], closable: true, input: { kind: 'buttons', options } }).answer.then((a) => {
      if ('unavailable' in a) { pending ??= step; return; }
      if (!('index' in a)) return;
      const github = (step.phase === 'downloading' && a.index === 1) || (step.phase === 'failed' && a.index === 0);
      if (github) process.send?.({ type: 'companion:releases' });
      if (step.phase === 'ready' && a.index === 0) process.send?.({ type: 'companion:update-install' });
    });
  }, 2000).unref();
  return (step) => {
    const key = `${step.phase}:${step.version}`;
    if (said.has(key)) return;
    said.add(key);
    pending = step;
  };
}

/** Files in the workspace (Coo's memory), `.git` left out; stops counting at `cap`. */
function countFiles(dir: string, cap = 10_000): number {
  let n = 0;
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (n >= cap) return;
      if (e.name === '.git') continue;
      if (e.isDirectory()) walk(join(d, e.name));
      else n += 1;
    }
  };
  try { walk(dir); } catch { /* unreadable: what was counted so far */ }
  return n;
}

const sha256 = (file: string) => existsSync(file) ? createHash('sha256').update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).digest('hex') : null;

/** The built-in figures' ids (read once): only these are reported by id. */
let builtinFigures: ReadonlySet<string> | null = null;

/** The settings and state sent with each day's statistics (docs/TELEMETRY.md, the day record). */
function snapshotOf(config: CoreConfig, workspace: string): Record<string, unknown> {
  const at = (path: string) => getByPath(config as unknown as Record<string, unknown>, path) ?? null;
  const active = config.providers[config.activeProvider];
  const endpoint = describeEndpoint(active, active?.spec?.model ?? '', () => endpointVendor(active));
  builtinFigures ??= new Set(figurePacks([]).packs.map((p) => p.id));
  const figure = at('worlds.desktop-pet.skin.figure');
  const look = reportedLook(typeof figure === 'string' ? figureOf(figure) : null, at('worlds.desktop-pet.skin.scheme'), builtinFigures);
  return {
    vendor: endpoint.vendor,
    model: endpoint.model,
    endpointKind: endpoint.endpointKind,
    language: config.language ?? null,
    autostart: process.env.COOPANION_AUTOSTART === '1',
    figure: look.figure,
    scheme: look.scheme,
    roam: at('worlds.desktop-pet.roam'),
    voiceInput: at('worlds.desktop-pet.asr.enabled'),
    asrEngine: at('worlds.desktop-pet.asr.engine'),
    micMode: at('worlds.desktop-pet.asr.mic.mode'),
    talkKey: at('worlds.desktop-pet.asr.mic.hotkey'),
    sound: at('worlds.desktop-pet.sound'),
    sounds: at('worlds.desktop-pet.sounds'),
    theme: at('worlds.desktop-pet.theme'),
    scale: at('worlds.desktop-pet.window.scale'),
    lockFrameRate: at('worlds.desktop-pet.window.lockFrameRate'),
    hoverButtons: at('worlds.desktop-pet.hoverButtons'),
    doubleClickChat: at('worlds.desktop-pet.doubleClickChat'),
    rememberPosition: at('worlds.desktop-pet.rememberPosition'),
    userNamed: !DEFAULT_USERS.includes(String(at('worlds.desktop-pet.user'))),
    cuaEnabled: at('worlds.cua.enabled'),
    cuaLevel: at('worlds.cua.permission'),
    personaChanged: sha256(join(workspace, 'CONSTITUTION.md')) !== sha256(join(SEED_DIR, 'CONSTITUTION.md')),
    memoryFiles: countFiles(workspace),
  };
}

/** Installed extensions as reported: a package from a registry by name, anything else as `private`. */
function reportedExtensions(extensions: ExtensionSet): Array<{ name: string; version: string | null; kind: string | null }> {
  const records = new Map(extensions.records.map((r) => [r.name, r]));
  return readInstalled(extensions.dir).map(({ name, spec }) => {
    const shown = publicExtensionName(name, spec);
    const r = records.get(name);
    return { name: shown, version: shown === 'private' ? null : r?.version ?? null, kind: r?.kind ?? null };
  });
}

/**
 * The introduction on a first start, then the key asks while no key is set. An install that already
 * has a key (one from before the introduction existed) counts as introduced. When no pet page shows
 * up on a first start, the settings window opens at the home page instead, since nothing else would
 * tell the person why Coo stays silent.
 */
async function introduce(deps: GuideDeps, run: (deps: GuideDeps) => Promise<void>, keySet: () => boolean, talked: (() => boolean) | null): Promise<void> {
  const first = !guideDone(deps.doneFile);
  if (first && keySet()) { markDone(deps.doneFile); return; }
  if (first) {
    const deadline = Date.now() + PET_WAIT_MS;
    while (!deps.pet()?.petState().connected && Date.now() < deadline) await sleep(1000);
    if (!deps.pet()?.petState().connected) process.send?.({ type: 'companion:open', path: '#/home' });
    await run(deps);
  }
  if (!talked) return;
  // the introduction just asked for the key and the person put it off: the next ask waits
  await askForKey(deps, keySet, talked, first ? ASK_AFTER_GUIDE_MS : 0);
}

async function corminiDefinition(): Promise<BotDefinition<CoreConfig>> {
  const file = join(repoRoot(), 'bots', 'cormini', 'index.ts');
  return (await import(pathToFileURL(file).href) as { default: BotDefinition<CoreConfig> }).default;
}

export async function main(): Promise<void> {
  let pet: DesktopPetWorld | null = null;
  /** Set once the bot exists; the pet's menu reads it only after the pet page connects. */
  let bus: WakeBus | null = null;
  /** Set once the console listens. */
  let guide: GuideDeps | null = null;
  /** Set once the deployment is loaded. */
  let telemetry: Telemetry | null = null;
  let config: CoreConfig | null = null;
  /** The port the console listens on, once it does (Cortico moves on from a taken one). */
  let consolePort: number | null = null;
  let notice: NoticeWorld | null = null;
  /** The introduction is running: the settings it makes are not told as changes. */
  let guiding = false;
  /** Whether the person is at the computer, as the app last said (`companion:presence`), for the pet's small talk. */
  let presence: PresenceReport | null = null;
  /** Rebuilds the system prefix once the bot has started (the pet's decider mode switched on or off). */
  let reloadPrefix: (() => Promise<void>) | null = null;
  /** Whether computer use is as `worlds.cua.enabled` says, mounted and in the prefix (the notice waits for it); set once the bot exists. */
  let cuaInEffect: (() => boolean) | null = null;
  /** The app language as the live config has it; Chinese before the config is loaded. */
  const language = () => appLanguage(config?.language);
  /**
   * Set once `createBot` has assembled the Worlds. Cortico keeps each World's name as read then for its notices to
   * the bot (「World 「桌宠」…」), which stay Chinese; the names read afterwards (a World that could not be built, in the
   * console's list) follow the app language.
   */
  let assembled = false;
  const labelLanguage = (): Language => (assembled ? language() : 'zh');
  const guideRun = async (deps: GuideDeps) => {
    guiding = true;
    try { await runGuide(deps); } finally { guiding = false; }
  };
  /** `displayName` of the live config: a rename reaches the pet menu, the chat page and computer use's question without a restart (upstream #320). */
  const botName = () => config?.displayName || DISPLAY_NAME;
  const DESKTOP_PET = desktopPetDefinition({
    botName,
    // the menu's header lends pause/resume, settings and quit; its dress tile opens the settings window's dress page, the typing bubble's expand button its chat page
    controls: {
      isPaused: () => bus?.isPaused() ?? false,
      setPaused: (paused) => bus?.setPaused(paused),
      openSettings: () => process.send?.({ type: 'companion:open', path: '' }),
      openChat: () => process.send?.({ type: 'companion:open', path: '#/chat' }),
      openDress: () => process.send?.({ type: 'companion:open', path: '#/dress' }),
      quit: () => process.send?.({ type: 'companion:quit' }),
      // read each time the menu header is sent, so it follows a language change
      get quitLabel() { return pick(language(), LENT_TEXT).quit; },
      guide: () => {
        if (!guide) return;
        process.send?.({ type: 'companion:hide' });
        void guideRun(guide);
      },
    },
    onCreate: (world) => { pet = world; },
    // decider mode: the key of the person's OpenRouter endpoint, read at each use; a switch rebuilds the prefix
    deciderKey: () => (config ? openRouterKey(config.providers, providersRoot()) : ''),
    onModeChange: () => { void reloadPrefix?.(); },
    onBotChange: () => (notice as NoticeWorld | null)?.acceptCurrent(),
    onSkin: (skin) => followPetLook(join(deploymentRoot(), DEPLOYMENT), skin, (pet as DesktopPetWorld | null)?.packs() ?? [], language()),
    // small talk: the app's report of the person at the computer, and the next wake-up Coo set for itself
    presence: () => presence,
    nextAlarmAt: () => (notice as NoticeWorld | null)?.nextAlarmAt() ?? null,
    language,
    labelLanguage,
    // the console's Start and Dress up pages frame the pet page: its figure frame lets exactly the console frame it
    consoleOrigins: () => consoleOrigins(config?.web ?? { port: CONSOLE_PORT }, consolePort),
  });
  const CUA = cuaDefinition({
    botName,
    askPermission: async (question) => {
      const S = cuaText(language()).ask.bubble;
      const answer = await pet?.confirm(question, [S.yes, S.no]) ?? 'unavailable';
      if (answer !== 'unavailable') telemetry?.count('cuaAsked');
      if (answer === 'yes') telemetry?.count('cuaGranted');
      return answer === 'unavailable' ? null : answer === 'yes' || answer === 'timeout' ? answer : 'no';
    },
    language,
    labelLanguage,
  });
  const home = deploymentRoot();
  // the system's language for a new install, as the Electron main process read it
  seed(home, newInstallLanguage(process.env));
  const deployDir = join(home, DEPLOYMENT);
  const NOTICE = noticeDefinition({
    version: process.env.COOPANION_VERSION ?? 'dev',
    notesDir: join(APP_ROOT, 'docs', 'releases'),
    stateFile: join(deployDir, NOTICE_FILE),
    alarmsFile: join(deployDir, 'alarms.json'),
    newInstall: () => !guideDone(join(deployDir, GUIDE_FILE)) && (config === null || !hasKey(config)),
    read: (path) => (config ? getByPath(config as unknown as Record<string, unknown>, path) : undefined),
    petConnected: () => (pet as DesktopPetWorld | null)?.petState().connected === true,
    guiding: () => guiding,
    onCreate: (world) => { notice = world; },
    // the one prefix line naming the language to talk in; none in Chinese
    replyLanguage: () => replyLanguage(config?.language),
    labelLanguage,
    inEffect: () => cuaInEffect?.() ?? true,
  });
  const cormini = await corminiDefinition();
  const base: BotDefinition<CoreConfig> = {
    ...cormini,
    declares: [CONSOLE.id, DESKTOP_PET.id, CUA.id, NOTICE.id],
    defaults: () => cooDefaults(cormini.defaults()),
    build: (loaded, worlds) => {
      const parts = cormini.build(loaded, worlds);
      // the console World's prefix block after the other Worlds', as before Cortico 0.2 renamed `terminal` (why: core/prefix-order.ts)
      withConsoleLast(parts.persona);
      return {
        ...parts,
        webUi: {
          ...parts.webUi,
          configGroups: [...parts.webUi?.configGroups ?? [], COMPANION_GROUP],
          configOptions: (kind, lang) => (kind === LANGUAGE_OPTIONS
            ? LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))
            : parts.webUi?.configOptions?.(kind, lang) ?? []),
        },
      };
    },
  };
  const bundled = [CONSOLE, DESKTOP_PET, CUA, NOTICE] as WorldDefinition<WorldSection>[];

  // extension providers must be registered before endpoints are resolved
  const extensions = await loadExtensions(repoRoot(), {
    reserved: bundled.map((w) => w.id),
    reservedProviders: [...providerModules.map((m) => m.id), COO.id, CHATGPT_PROVIDER.id],
  });
  registerProviderModules([COO, CHATGPT_PROVIDER, ...extensions.providers]);
  extensions.webUiAssets.push(...bundledWebUiAssets([
    { id: DESKTOP_PET.id, packageName: 'cortico-world-desktop-pet' },
    { id: CUA.id, packageName: 'cortico-world-cua' },
  ]));
  const definition = withWorlds(base, [...bundled, ...extensions.worlds]);

  const loaded = loadDeployment(definition, deployDir, repoRoot(), join(repoRoot(), 'bots', 'cormini'), providersRoot());
  config = loaded.config;
  const petSkin = () => getByPath(loaded.config as unknown as Record<string, unknown>, 'worlds.desktop-pet.skin') as { figure?: string; scheme?: string } | undefined;
  Object.assign(COMPANION_GROUP, companionGroup(language()));
  // the name and speech settings still at the old language's defaults follow first (followLanguageDefaults)
  watchLanguage(loaded.config, join(deployDir, 'config.json'), (next) => {
    Object.assign(COMPANION_GROUP, companionGroup(next));
    process.send?.({ type: 'companion:language', language: next });
    // the reply-language line comes or goes; the pet pages follow by themselves (their `prefs`)
    void reloadPrefix?.();
    // the figure schemes on the appearance page are renamed
    followPetLook(deployDir, petSkin(), (pet as DesktopPetWorld | null)?.packs() ?? figurePacks([join(loaded.dataDir, 'figures')]).packs, next);
  });
  announceDataDir(loaded.dataDir);
  followPetLook(deployDir, petSkin(), figurePacks([join(loaded.dataDir, 'figures')]).packs, language());
  consumeBootFlags(loaded.dataDir);

  const bot = createBot(loaded, definition, { extensions });
  assembled = true;
  bus = bot.core.bus;
  cuaInEffect = () => cuaSettled(bot.core.worldVisibility(), getByPath(loaded.config as unknown as Record<string, unknown>, 'worlds.cua.enabled') === true);
  // usage statistics only go to a server named here (a local telemetry-server in development); this build has none,
  // so by default nothing is counted, written or sent
  const statsUrl = process.env.COOPANION_TELEMETRY_URL;
  const stats = statsUrl ? new Telemetry({
    dir: deployDir,
    version: process.env.COOPANION_VERSION ?? 'dev',
    url: statsUrl,
    enabled: () => getByPath(loaded.config as unknown as Record<string, unknown>, TELEMETRY_KEY) !== false,
    snapshot: () => snapshotOf(loaded.config, loaded.memoryDir),
    extensions: () => reportedExtensions(extensions),
  }) : null;
  telemetry = stats;
  if (stats) countUse(bot.core, loaded.config, stats);
  hintFailures(bot.core, loaded.config, () => pet);
  let stopping = false;
  const shutdown = async (reason: string) => {
    if (stopping) return;
    stopping = true;
    const done = await Promise.race([
      Promise.all([bot.shutdown(reason), stats?.stop()]).then(() => true),
      new Promise<false>((r) => setTimeout(() => r(false), 30_000)),
    ]);
    process.exit(done ? 0 : 1);
  };
  const log = bot.core.runlog.logger('process');
  // a rejection that repeats on a timer would fill the event queue and push the other events out: each distinct one is reported once a run
  const reported = new Set<string>();
  const crash = (where: string, err: unknown) => {
    const fields = { where, ...crashFields(err, APP_ROOT, [extensions.dir]) };
    const key = JSON.stringify(fields);
    if (reported.has(key)) return;
    reported.add(key);
    stats?.event('crash', fields);
  };
  // a stopped main loop takes no more messages: the Core exits and the app starts it again (counted as a crash),
  // and the new one delivers what was still queued. Listened to before `bot.start()`, unlike upstream: a loop that
  // fails at its first state write logs loop-exit inside the start
  onLoopExit(bot.core.runlog, (err) => {
    crash('core-loop', err);
    void shutdown('主循环异常退出');
  });
  // set by app/core-host.cjs when this Core replaces one that exited unasked
  const exited = process.env.COOPANION_CORE_EXIT;
  delete process.env.COOPANION_CORE_EXIT;
  if (exited) {
    const code = Number(exited);
    stats?.event('crash', { where: 'core-exit', exitCode: Number.isInteger(code) ? code : null, signal: Number.isInteger(code) ? null : exited.slice(0, 20) });
  }
  // without a key every model call fails: hold events until the home page saves one and resumes
  const keyMissing = !hasKey(loaded.config);
  if (keyMissing) bot.core.bus.setPaused(true);
  const { port } = await bot.start().catch(async (err: unknown) => {
    // the app says why, rather than restarting this Core into the same wall: another process holds the data
    // directory, or every console port Cortico tried is taken (each message waits until it is delivered)
    const tell = (msg: object) => new Promise<void>((done) => { if (!process.send?.(msg, () => done())) done(); });
    if (err instanceof InstanceLockedError) await tell({ type: 'companion:locked', pid: err.pid, file: err.file });
    const busy = portsBusy(err, loaded.config.web);
    if (busy) await tell({ type: 'companion:ports-busy', ...busy });
    throw err;
  });
  consolePort = port;
  reloadPrefix = () => bot.core.loop.reloadSystemPrefix().catch((err: unknown) => {
    bot.core.runlog.logger('process').emit('warn', '桌宠换模式后重建前缀失败', { event: 'pet-mode-reload', err });
  });
  // a session from before Cortico 0.2 still has a section for the terminal World (and names terminal_send): rebuilt once
  if (prefixFromBeforeConsole(bot.core.session.records)) {
    void bot.core.loop.reloadSystemPrefix().then(() => {
      bot.core.runlog.logger('process').info('会话前缀来自 Cortico 0.2 之前(terminal World),已按现在的 World 重建', { event: 'prefix-console-reload' });
    }, (err: unknown) => {
      bot.core.runlog.logger('process').emit('warn', '重建 Cortico 0.2 之前的会话前缀失败', { event: 'prefix-console-reload', err });
    });
  }
  stats?.start();
  process.send?.({ type: 'companion:ready', port, dataDir: loaded.dataDir, keyMissing, language: language() });
  const guideDeps: GuideDeps = {
    pet: () => pet,
    console: `http://127.0.0.1:${port}`,
    doneFile: join(deployDir, GUIDE_FILE),
    openDress: () => process.send?.({ type: 'companion:open', path: '#/dress' }),
    onEnd: (end) => (notice as NoticeWorld | null)?.guideEnded(end),
    track: (type, fields) => stats?.event(type, fields),
    language,
    browse: (url) => process.send?.({ type: 'companion:browse', url }),
  };
  guide = guideDeps;
  void introduce(guideDeps, guideRun, () => hasKey(loaded.config), keyMissing ? watchTalk(bot.core.bus) : null).catch((err) => {
    bot.core.runlog.logger('process').emit('error', '引导出错', { event: 'guide-error', err });
  });

  const update = sayUpdates(loaded.config, () => pet, () => guiding);
  process.on('message', (msg: { type?: string } & Partial<UpdateStep>) => {
    if (msg?.type === 'companion:shutdown') void shutdown('应用退出');
    else if (msg?.type === 'companion:presence') presence = presenceFrom(msg, Date.now()) ?? presence;
    else if (msg?.type === 'companion:update' && typeof msg.version === 'string' && (msg.phase === 'downloading' || msg.phase === 'ready' || msg.phase === 'failed')) {
      update({ phase: msg.phase, version: msg.version, reason: typeof msg.reason === 'string' ? msg.reason : undefined });
    }
  });
  process.on('disconnect', () => void shutdown('应用进程已退出'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    log.emit('error', '未捕获异常,正在关机', { event: 'uncaught-exception', err });
    crash('core', err);
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    log.emit('error', '未处理的 promise 拒绝', { event: 'unhandled-rejection', err: reason });
    crash('core-rejection', reason);
  });
}
