/**
 * WebUI panels for the desktop pet: `pet` (window, dressing, window runtime) and `voice`
 * (recognition engine, the FunASR model download or the transcription service's settings (api-rows.ts), microphone level,
 * recognized lines). Data goes
 * through `ctx.invoke`, the level meter through `ctx.stream('voice')`.
 */
import type { WebUiClientBundle, WebUiPanel, WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';
import { petText } from '../i18n/index.ts';
import { captureKey, splitTaps, withTaps } from './key-capture.ts';
import { apiRows, type ApiState } from './api-rows.ts';
import './style.css';

interface Artifact { phase: 'absent' | 'working' | 'ready' | 'error'; path: string; done: number; total: number | null; detail: string | null }
interface PetState {
  inWindow: boolean;
  url: string | null;
  dressUrl: string | null;
  window: { phase: string; pid: number | null; source: string | null; detail: string | null } | null;
  electron: Artifact & { supported: boolean };
  screen: { w: number; h: number } | null;
}
interface VoiceState {
  enabled: boolean;
  /** The engine in force, and the setting it came from */
  engine: Engine;
  engineSetting: Engine;
  systemSupported: boolean;
  server: { phase: string; url: string; pid: number | null; detail: string | null } | null;
  /** The FunASR model download. */
  model: Artifact & { bytes: number };
  /** The transcription service (engine api); absent from a World older than the panel. */
  api?: ApiState;
  mic: { state: string; detail: string | null };
  input: {
    mode: MicMode;
    hotkey: string;
    deviceId: string;
    /** Hold mode: the microphone opens only while the talk key is held. */
    openOnPress?: boolean;
    /** The keys alone; how they are pressed is the press choice beside them */
    keyLabel: string;
    hint: string;
    hotkeyProblem: string | null;
    open: boolean;
    devices: Array<{ id: string; label: string }>;
  };
  level: number;
  thresholdDb: number;
  recent: Array<{ text: string; at: number; ms: number; dropped?: boolean }>;
  counts: { utterances: number; delivered: number; dropped: number };
}

type MicMode = 'hold' | 'toggle' | 'always';
type Engine = 'funasr' | 'system' | 'api';

const MB = (n: number) => `${Math.round(n / 1048576)} MB`;
const progress = (a: Artifact) => (a.total ? `${Math.round((a.done / a.total) * 100)}%` : MB(a.done));
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function statusRow(ctx: WebUiPanelContext, name: string) {
  const { ui } = ctx;
  const row = ui.h('div', 'mountrow');
  const dot = ui.h('span', 'navdot');
  const state = ui.h('span', 'mstate', '—');
  const detail = ui.h('span', 'mdetail');
  const acts = ui.h('span', 'macts');
  row.append(dot, ui.h('span', 'mname', name), state, detail, acts);
  return {
    row, acts,
    set(text: string, tone: 'on' | 'off' | 'busy' | 'bad', more = '') {
      state.textContent = text;
      detail.textContent = more;
      dot.className = `navdot ${tone === 'on' ? 'ok' : tone === 'bad' ? 'bad' : tone === 'busy' ? 'warn' : ''}`;
    },
  };
}

const petPanel: WebUiPanel = {
  mount(ctx) {
    const { ui, root } = ctx;
    const t = petText(ctx.language).panel;
    const card = ui.sheet({ title: t.pet, en: 'pet' });
    root.appendChild(card.el);
    const s = card.body;
    const msg = ui.msgline('');

    const win = statusRow(ctx, t.window);
    const btnOpen = ui.button(t.openWindow, { size: 'sm', variant: 'primary' });
    const btnClose = ui.button(t.closeWindow, { size: 'sm' });
    win.acts.append(btnClose, btnOpen);

    const rt = statusRow(ctx, t.runtime);
    const btnInstall = ui.button(t.install, { size: 'sm', variant: 'primary' });
    rt.acts.append(btnInstall);

    const links = ui.rowbar();
    const open = ui.h('a', 'btn sm', t.viewInBrowser);
    open.target = '_blank'; open.rel = 'noopener';
    links.append(open, msg);

    const frameWrap = ui.h('div', 'pet-dressframe');
    const frame = ui.h('iframe');
    frame.title = t.dress;
    frameWrap.append(frame);

    s.append(win.row, rt.row, links, ui.section(t.dress, t.dressHint), frameWrap);

    let st: PetState | null = null;
    const render = (next: PetState) => {
      st = next;
      const w = next.window;
      if (next.inWindow) win.set(t.connected, 'on');
      else if (w?.phase === 'running') win.set(t.starting, 'busy');
      else win.set(w?.phase === 'missing' || w?.phase === 'error' ? t.cannotOpen : t.notOpen, w?.phase === 'missing' || w?.phase === 'error' ? 'bad' : 'off', w?.detail ?? '');
      btnOpen.disabled = w?.phase === 'running';
      btnClose.disabled = w?.phase !== 'running';
      const e = next.electron;
      if (w?.source && w.source !== e.path && e.phase !== 'ready') rt.set(t.external, 'on', w.source);
      else if (e.phase === 'ready') rt.set(t.installed, 'on', e.path);
      else if (e.phase === 'working') rt.set(t.downloading(progress(e)), 'busy', e.detail ?? '');
      else if (e.phase === 'error') rt.set(t.installFailed, 'bad', e.detail ?? '');
      else rt.set(e.supported ? t.notInstalled : t.noBuild, 'off', e.supported ? t.electronSize : '');
      btnInstall.hidden = e.phase === 'ready' || !e.supported;
      btnInstall.disabled = e.phase === 'working';
      if (next.url) open.href = next.url;
      if (next.dressUrl && frame.dataset.src !== next.dressUrl) {
        frame.dataset.src = next.dressUrl;
        frame.src = next.dressUrl;
      }
    };
    const refresh = async () => { try { render(await ctx.invoke<PetState>('state')); } catch (err) { msg.textContent = errText(err); } };
    const call = (method: string) => async () => {
      try { render(await ctx.invoke<PetState>(method)); } catch (err) { msg.textContent = errText(err); }
    };
    btnOpen.addEventListener('click', call('openWindow'));
    btnClose.addEventListener('click', call('closeWindow'));
    btnInstall.addEventListener('click', call('installElectron'));
    void refresh();
    ctx.interval(() => void refresh(), 1500);
  },
};

const FLOOR_DB = -60;
const meterPct = (db: number) => Math.max(0, Math.min(100, ((db - FLOOR_DB) / -FLOOR_DB) * 100));
/** The threshold the mark can be set to (upstream #435): the meter's span, whole dB. */
const markDb = (db: number) => Math.round(Math.max(FLOOR_DB, Math.min(0, db)));
const ARROW_STEPS: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

const voicePanel: WebUiPanel = {
  mount(ctx) {
    const { ui, root } = ctx;
    const text = petText(ctx.language);
    const t = text.panel;
    const MODES: Record<MicMode, string> = t.modes;
    const PRESSES = t.presses;
    const card = ui.sheet({ title: t.voice, en: 'voice' });
    root.appendChild(card.el);
    const s = card.body;
    const msg = ui.msgline('');

    // The master switch: everything below only works while it is on.
    const master = ui.h('label', 'pet-master');
    const masterText = ui.h('span', 'pet-mastertext');
    const masterTitle = ui.h('span', 'pet-mastertitle', t.enable);
    const masterHint = ui.h('span', 'pet-masterhint');
    masterText.append(masterTitle, masterHint);
    const enabled = ui.h('input', 'pet-switch');
    enabled.type = 'checkbox';
    enabled.setAttribute('role', 'switch');
    enabled.addEventListener('change', () => void call('setEnabled', [enabled.checked])());
    master.append(masterText, enabled);
    const settings = ui.h('div', 'pet-voicebody');

    const eng = statusRow(ctx, t.engine);
    const engineSel = ui.select();
    eng.acts.append(engineSel);

    const srv = statusRow(ctx, t.server);
    const btnStart = ui.button(t.start, { size: 'sm', variant: 'primary' });
    const btnStop = ui.button(t.stop, { size: 'sm' });
    srv.acts.append(btnStop, btnStart);

    const rt = statusRow(ctx, t.model);
    const btnInstall = ui.button(t.download, { size: 'sm', variant: 'primary' });
    rt.acts.append(btnInstall);
    const api = apiRows(ctx, t, (name) => statusRow(ctx, name), (patch) => void call('setApi', [patch])());

    const micRow = statusRow(ctx, t.mic);
    const deviceSel = ui.select();
    micRow.acts.append(deviceSel);

    const modeRow = statusRow(ctx, t.mode);
    const modeSel = ui.select();
    modeSel.replaceChildren(...(Object.keys(MODES) as MicMode[]).map((m) => { const o = ui.h('option', null, MODES[m]); o.value = m; return o; }));
    const pressSel = ui.select();
    const keyBtn = ui.button('', { size: 'sm' });
    modeRow.acts.append(modeSel, pressSel, keyBtn);
    modeRow.row.classList.add('pet-moderow');

    // hold mode only: the microphone opens with the talk key
    const onPressRow = statusRow(ctx, t.openOnPress);
    const onPress = ui.h('input', 'pet-switch');
    onPress.type = 'checkbox';
    onPress.setAttribute('role', 'switch');
    onPress.setAttribute('aria-label', t.openOnPress);
    onPress.addEventListener('change', () => void call('setMic', [{ openOnPress: onPress.checked }])());
    onPressRow.acts.append(onPress);
    // the hint is cut to one line like every row's: the whole of it on hover
    onPressRow.row.title = t.openOnPressHint;

    const meterWrap = ui.h('div', 'pet-meterwrap');
    const meter = ui.h('div', 'pet-meter');
    const fill = ui.h('div', 'pet-meterfill');
    meter.append(fill);
    // the speech threshold, dragged along the meter or moved with the arrow keys (upstream #435)
    const mark = ui.h('div', 'pet-metermark');
    mark.tabIndex = 0;
    mark.title = t.thresholdHint;
    mark.setAttribute('role', 'slider');
    mark.setAttribute('aria-label', text.config.thresholdDb.title);
    mark.setAttribute('aria-valuemin', String(FLOOR_DB));
    mark.setAttribute('aria-valuemax', '0');
    meterWrap.append(meter, mark);

    const log = ui.log({ max: 100 });
    settings.append(eng.row, srv.row, rt.row, ...api.rows, micRow.row, modeRow.row, onPressRow.row, meterWrap, ui.section(t.results, t.resultsHint), log.el);
    s.append(master, msg, settings);

    let st: VoiceState | null = null;
    let seen = 0;
    /** The threshold under the pointer while the mark is held. */
    let held: number | null = null;
    const placeMark = (db: number) => {
      mark.style.left = `${meterPct(db)}%`;
      mark.setAttribute('aria-valuenow', String(db));
      mark.setAttribute('aria-valuetext', `${db} dBFS`);
    };
    const render = (next: VoiceState) => {
      st = next;
      enabled.checked = next.enabled;
      master.classList.toggle('on', next.enabled);
      const onPressOn = next.input.mode === 'hold' && next.input.openOnPress === true;
      masterHint.textContent = !next.enabled ? t.disabledHint : onPressOn ? t.enabledHintOnPress : t.enabledHint;
      settings.classList.toggle('off', !next.enabled);
      const engines: Partial<Record<Engine, string>> = { funasr: t.funasr };
      // Windows' own recognizer exists only there
      if (next.systemSupported) engines.system = t.system;
      engines.api = t.api;
      if (engineSel.dataset.list !== JSON.stringify(engines)) {
        engineSel.dataset.list = JSON.stringify(engines);
        engineSel.replaceChildren(...(Object.keys(engines) as Engine[]).map((k) => { const o = ui.h('option', null, engines[k] ?? k); o.value = k; return o; }));
      }
      if (document.activeElement !== engineSel) engineSel.value = next.engine;
      eng.set({ funasr: 'FunASR', system: t.system, api: t.apiName }[next.engine], 'on', { funasr: t.funasrHint, system: t.systemHint, api: t.apiHint }[next.engine]);
      const sv = next.server;
      if (!sv) srv.set('—', 'off');
      else if (sv.phase === 'running') srv.set(t.ready, 'on', sv.url);
      else if (sv.phase === 'starting') srv.set(t.starting, 'busy', sv.url);
      else if (sv.phase === 'error') srv.set(t.error, 'bad', sv.detail ?? '');
      else srv.set(t.stopped, 'off', sv.url);
      btnStart.disabled = !next.enabled || sv?.phase === 'running' || sv?.phase === 'starting';
      btnStop.disabled = sv?.phase !== 'running';

      const m = next.model;
      if (m.phase === 'working') rt.set(t.downloading(progress(m)), 'busy', m.detail ?? '');
      else if (m.phase === 'error') rt.set(t.downloadFailed, 'bad', m.detail ?? '');
      else if (m.phase === 'ready') rt.set(t.downloaded, 'on', m.path);
      else rt.set(t.notDownloaded, 'off', t.modelSource(MB(m.bytes)));
      btnInstall.disabled = m.phase === 'working';
      btnInstall.hidden = m.phase === 'ready';
      btnInstall.textContent = m.phase === 'error' ? t.retry : t.download;
      // the model only matters to FunASR
      rt.row.style.display = next.engine === 'funasr' ? '' : 'none';
      api.render(next.api ?? { baseUrl: '', model: '', keySaved: false }, next.engine === 'api');

      const mic = next.mic;
      micRow.set(t.micStates[mic.state] ?? mic.state, mic.state === 'on' ? 'on' : mic.state === 'off' ? 'off' : 'bad', mic.detail ?? '');
      const input = next.input;
      const choices = [{ id: '', label: t.defaultDevice }, ...input.devices];
      if (input.deviceId && !choices.some((d) => d.id === input.deviceId)) choices.push({ id: input.deviceId, label: t.missingDevice });
      if (deviceSel.dataset.list !== JSON.stringify(choices)) {
        deviceSel.dataset.list = JSON.stringify(choices);
        deviceSel.replaceChildren(...choices.map((d, i) => { const o = ui.h('option', null, d.label || t.micN(i)); o.value = d.id; return o; }));
      }
      if (document.activeElement !== deviceSel) deviceSel.value = input.deviceId;
      if (document.activeElement !== modeSel) modeSel.value = input.mode;
      // a talk key set to three presses in config.json keeps its choice; the panel offers two or one
      const { taps } = splitTaps(input.hotkey);
      const press = input.mode === 'toggle' ? 'toggle' : 'hold';
      const presses = Object.keys(PRESSES).map(Number).filter((n) => n < 3 || n === taps).map((n) => [n, PRESSES[n]![press]] as const);
      if (pressSel.dataset.list !== JSON.stringify(presses)) {
        pressSel.dataset.list = JSON.stringify(presses);
        pressSel.replaceChildren(...presses.map(([n, label]) => { const o = ui.h('option', null, label); o.value = String(n); return o; }));
      }
      if (document.activeElement !== pressSel) pressSel.value = String(taps);
      if (!capture) keyBtn.textContent = t.talkKey(input.keyLabel);
      keyBtn.hidden = pressSel.hidden = input.mode === 'always';
      modeRow.set(input.open ? t.listening : t.waitingKey, input.open ? 'on' : 'off', input.hint);
      onPressRow.row.style.display = input.mode === 'hold' ? '' : 'none';
      onPress.checked = input.openOnPress === true;
      onPressRow.set(onPress.checked ? t.switchOn : t.switchOff, onPress.checked ? 'on' : 'off', t.openOnPressHint);
      // the loudness threshold only decides where speech starts when the key is not held down
      mark.hidden = input.mode === 'hold';
      // the state polled meanwhile does not move the mark from under the pointer or the keys
      if (held === null && document.activeElement !== mark) placeMark(next.thresholdDb);
      for (const line of next.recent) {
        if (line.at <= seen) continue;
        seen = line.at;
        const el = log.append(line.text, line.dropped ? 'dim' : 'plain');
        if (line.dropped) el.style.textDecoration = 'line-through';
      }
    };
    const refresh = async () => { try { render(await ctx.invoke<VoiceState>('state')); } catch (err) { msg.textContent = errText(err); } };
    const call = (method: string, args: unknown[] = []) => async () => {
      try { render(await ctx.invoke<VoiceState>(method, args)); msg.textContent = ''; } catch (err) { msg.textContent = errText(err); }
    };
    btnStart.addEventListener('click', call('start'));
    engineSel.addEventListener('change', () => void call('setEngine', [engineSel.value])());
    btnStop.addEventListener('click', call('stop'));
    btnInstall.addEventListener('click', call('install'));
    modeSel.addEventListener('change', () => void call('setMic', [{ mode: modeSel.value }])());
    deviceSel.addEventListener('change', () => void call('setMic', [{ deviceId: deviceSel.value }])());
    const dbAt = (x: number) => {
      const r = meter.getBoundingClientRect();
      return markDb(FLOOR_DB + ((x - r.left) / r.width) * -FLOOR_DB);
    };
    mark.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      mark.focus();
      mark.setPointerCapture(e.pointerId);
      held = dbAt(e.clientX);
      placeMark(held);
    });
    mark.addEventListener('pointermove', (e) => {
      if (held === null) return;
      held = dbAt(e.clientX);
      placeMark(held);
    });
    // saved once the mark is let go
    mark.addEventListener('pointerup', () => {
      if (held === null) return;
      const db = held;
      held = null;
      void call('setThreshold', [db])();
    });
    mark.addEventListener('pointercancel', () => {
      held = null;
      if (st) placeMark(st.thresholdDb);
    });
    mark.addEventListener('keydown', (e) => {
      const step = ARROW_STEPS[e.key];
      if (!step || held !== null) return;
      e.preventDefault();
      const db = markDb(Number(mark.getAttribute('aria-valuenow')) + step);
      placeMark(db);
      void call('setThreshold', [db])();
    });
    pressSel.addEventListener('change', () => {
      if (st) void call('setMic', [{ hotkey: withTaps(splitTaps(st.input.hotkey).combo, Number(pressSel.value)) }])();
    });

    // The talk key is a new combination (key-capture.ts); how it is pressed (`*2`) stays as chosen beside it.
    let capture: { stop(): void } | null = null;
    const finishCapture = (combo: string | null) => {
      capture = null;
      if (combo && st) void call('setMic', [{ hotkey: withTaps(combo, splitTaps(st.input.hotkey).taps) }])();
      else void refresh();
    };
    keyBtn.addEventListener('click', () => {
      if (capture) { capture.stop(); return; }
      keyBtn.textContent = t.capture;
      capture = captureKey(window, finishCapture);
    });
    ctx.own({ dispose: () => capture?.stop() });
    ctx.stream({
      message: (text: string) => {
        const f = JSON.parse(text) as { type: string; level?: number; speaking?: boolean; open?: boolean };
        if (f.type === 'level' && typeof f.level === 'number') {
          fill.style.width = `${meterPct(f.level)}%`;
          fill.classList.toggle('on', !!f.speaking);
          meter.classList.toggle('open', !!f.open);
        } else void refresh();
      },
    });
    void refresh();
    ctx.interval(() => void refresh(), 1500);
  },
};

const bundle: WebUiClientBundle = { panels: { pet: petPanel, voice: voicePanel } };
export default bundle;
