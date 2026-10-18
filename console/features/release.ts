/**
 * 字标下面那一行:当前版本与项目地址;下面再多一行更新的情况。
 * 能自己更新的版本(app/updater.cjs,经 settings-preload.cjs 的 `coopanionUpdate`:Windows 安装版、AppImage)显示更新器
 * 走到哪一步:正在下载、已下载(退出时安装),下载失败时才给去 Release 页的链接,后来的一步原地替换前一步。
 * 其余版本(macOS、deb、从源码运行)在 GitHub 上最新的正式 Release 比当前版本新时给去下载的链接,查询失败就只显示当前版本。
 * 版本号由 scripts/stage.ts 从 package.json 写进 app-version.ts。
 */
import { pick } from '../core/language.ts';
import { APP_VERSION } from '../app-version.ts';

export const REPO_URL = 'https://github.com/yxengram/Coopanion';
const RELEASES_URL = `${REPO_URL}/releases/latest`;
const RELEASE_API = 'https://api.github.com/repos/yxengram/Coopanion/releases/latest';

/** 更新器的一步(app/updater.cjs)。 */
export interface UpdateStep { phase: 'downloading' | 'ready' | 'failed'; version: string }
declare global {
  interface Window {
    /** 只在能自己更新的版本里有:上一步(还没有就是 null),以及订阅之后每一步、返回退订。 */
    coopanionUpdate?: { step(): UpdateStep | null; onStep(listener: (step: UpdateStep) => void): () => void };
  }
}
/** 与 Cortico 控制台查框架 Release 同一时限。 */
const RELEASE_TIMEOUT_MS = 15_000;

export const TEXT = {
  zh: {
    repoHint: '在 GitHub 上打开 Coopanion 项目',
    update: (latest: string) => `Coopanion ${latest} 已发布,点这里下载更新`,
    updateDownloading: (version: string) => `Coopanion ${version} 正在后台下载`,
    updateReady: (version: string) => `Coopanion ${version} 已下载,退出时自动安装`,
    updateFailed: (version: string) => `Coopanion ${version} 没能自动下载,点这里手动下载`,
  },
  en: {
    repoHint: 'Open the Coopanion project on GitHub',
    update: (latest: string) => `Coopanion ${latest} is out: download the update`,
    updateDownloading: (version: string) => `Coopanion ${version} is downloading in the background`,
    updateReady: (version: string) => `Coopanion ${version} is downloaded and installs when you quit`,
    updateFailed: (version: string) => `Coopanion ${version} did not download: download it by hand`,
  },
};
const S = pick(TEXT);

export interface ReleaseUpdate { version: string; url: string }

function versionParts(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

export function isNewer(latest: string, current: string): boolean {
  const left = versionParts(latest);
  const right = versionParts(current);
  if (!left || !right) return false;
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i]! > right[i]!;
  }
  return false;
}

/** 一次启动只查一次;左栏换模式重建时复用同一个结果。 */
let pending: Promise<ReleaseUpdate | null> | null = null;

export function checkRelease(): Promise<ReleaseUpdate | null> {
  pending ??= fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(RELEASE_TIMEOUT_MS) })
    .then((res) => (res.ok ? res.json() as Promise<{ tag_name?: unknown; html_url?: unknown }> : null))
    .then((release) => {
      if (typeof release?.tag_name !== 'string' || typeof release.html_url !== 'string') return null;
      const url = new URL(release.html_url);
      if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null;
      return isNewer(release.tag_name, APP_VERSION) ? { version: release.tag_name.replace(/^v/, ''), url: url.href } : null;
    })
    .catch(() => null);
  return pending;
}

function link(doc: Document, className: string, text: string, href: string): HTMLAnchorElement {
  const a = doc.createElement('a');
  a.className = className;
  a.textContent = text;
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/** 更新器这一步在版本行下显示的样子:失败时是去 Release 页的链接,其余是一行字。 */
function stepHint(doc: Document, step: UpdateStep): HTMLElement {
  if (step.phase === 'failed') return link(doc, 'release-hint', S.updateFailed(step.version), RELEASES_URL);
  const hint = doc.createElement('span');
  hint.className = 'release-hint companion-update-step';
  hint.textContent = step.phase === 'downloading' ? S.updateDownloading(step.version) : S.updateReady(step.version);
  return hint;
}

/** 把版本行放进字标容器;有新版本时在它下面补上下载链接,能自己更新的版本补上更新器的这一步。 */
export function mountRelease(doc: Document, brand: Element, signal: AbortSignal): void {
  const repo = link(doc, 'companion-version', `v${APP_VERSION} · GitHub`, REPO_URL);
  repo.title = S.repoHint;
  brand.appendChild(repo);
  const updater = doc.defaultView?.coopanionUpdate;
  if (updater) {
    let shown: HTMLElement | null = null;
    const show = (step: UpdateStep | null) => {
      if (signal.aborted || !step) return;
      const hint = stepHint(doc, step);
      if (shown) shown.replaceWith(hint);
      else brand.appendChild(hint);
      shown = hint;
    };
    show(updater.step());
    const stop = updater.onStep(show);
    signal.addEventListener('abort', stop, { once: true });
    return;
  }
  void checkRelease().then((update) => {
    if (signal.aborted || !update) return;
    brand.appendChild(link(doc, 'release-hint', S.update(update.version), update.url));
  });
}
