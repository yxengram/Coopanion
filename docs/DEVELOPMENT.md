# 开发文档

Coopanion 是用 [Cortico](https://github.com/Pal-AI-Lab/Cortico) 组装的 Electron 桌面应用:Cortico Core + Cormini Persona +
[桌宠 World](../packages/cortico-world-desktop-pet) + [电脑操作 World](../packages/cortico-world-cua),
模型经 Coo Pet Provider(`packages/cortico-provider-coo`)接 DeepSeek、通义千问、Kimi 等几家服务,默认 DeepSeek。每家一个端点,名字就是它在 `src/vendors.ts` 里的 id;0.1.x 的 `deepseek` 模块端点在启动时由 `core/seed.ts` 改成 `coo`。桌宠表情决策的模型同样在启动时迁移：设置里还是 OpenRouter 下架了的旧默认 `perplexity/pplx-decider-v1.1-27b` 的，由 `core/seed.ts`(`RETIRED_DECIDERS`)换成现在的默认 `typesafe/jev-1.14`;运行中 OpenRouter 说所选模型没有了(404「No endpoints found for …」)时，桌宠 World 这次运行改用默认模型(`docs/notes/expressions-and-actions.md` 一、§12)。同一个包里还有 `chatgpt` 模块(`src/chatgpt/`,测试中):用 ChatGPT 账号登录、请求计入套餐，端点名 `chatgpt`(这个名字已被别种端点占了时是 `chatgpt-2` 这样的空名,见 `chatgptName`;令牌行记着端点目录的绝对路径,复制、改名或挪走的目录读成未登录并删掉抄来的令牌),按模块认而不是按地址(地址和 OpenAI 一样,见 `connectionVendor` / `endpointVendor`);引导里的 ChatGPT 走 OpenAI 卡片之后的一问(单开一张卡会改掉 DeepSeek 那条路上的卡片，动 `tests/fixtures/i18n-zh/guide.json`;这一问和登录自己的几句气泡不进交给 Coo 的引导记录，带 Key 的那几条路记录不变),登录页经 `companion:browse` 交给主进程，只开 `https://auth.openai.com/`;高级模式里它的账号一段是设置窗口登记的内置面板 `coopanion-chatgpt`(`console/features/chatgpt`)。

## 从源码构建

需要 Git、Node.js 22 和 pnpm(`corepack enable`),在 Windows 或 macOS 上都能开发。

```bash
git clone --recursive https://github.com/yxengram/Coopanion.git
cd Coopanion
pnpm install
pnpm run dev                # 准备 build/cortico 并启动应用,数据写在 build/data
```

已经 clone 过但没带 `--recursive` 的话,先补上 Cortico 子模块:

```bash
git submodule update --init --recursive
```

| 命令 | 作用 |
|---|---|
| `pnpm run dev` | 生成 `build/cortico` 并启动应用 |
| `pnpm run start` | 直接启动应用(不重新生成 `build/cortico`) |
| `pnpm run build:cortico` | 只生成 `build/cortico`(`console/` 改动后要重跑,并重启应用) |
| `pnpm run test` | 主仓库单元测试 |
| `pnpm run test:worlds` | 桌宠与电脑操作 World 的单元测试（使用本仓库锁定的 Cortico） |
| `pnpm run typecheck:worlds` | 两个 World 的类型检查 |
| `pnpm run typecheck` | 检查 Core 与 Electron 部分的类型 |
| `pnpm run typecheck:web` | 检查设置窗口(WebUI 覆盖层)的类型(先跑 `build:cortico`) |
| `pnpm run build:installer` | Windows 上打出 `dist/Coopanion-Setup-<版本>.exe`,设 `COOPANION_CHANNEL=portable` 时改打便携版 `dist/Coopanion-<版本>-win-x64-portable.zip`(不带 electron-updater,`app/channel.cjs`;只能在 Windows 上打,`pnpm exec tsx scripts/verify-portable.ts` 检查它);Mac 上打出 `dist/Coopanion-<版本>-mac-<架构>.dmg` 和 `.zip`(`PACK_ARCH=x64` 在 Apple 芯片上打 Intel 版) |
| `pnpm run build:icons` | 用桌宠的造型重画应用图标和默认头像 |
| `pnpm run export:whale` / `export:claude` / `export:gpt` / `export:gemini` / `export:grok` | 把大肥鱼、Claude 娘、GPT 娘、Gemini 娘、Grok 娘导出成原版 v0.1.17 起也能装的形象包(默认输出到 `build/packs/coopanion-<id>/`),说明见 `packages/cortico-world-desktop-pet/examples/whale/README.md`「导出成形象包」 |

想用一份干净的数据测试(比如看首次启动、引导、没填 Key 时的提醒),把 `CORTICO_COMPANION_DATA` 指向一个空目录再启动:

```powershell
$env:CORTICO_COMPANION_DATA = "$env:TEMP\coo-test"; pnpm run start
```

引导跑过(走完或点了 ×)之后,部署目录里会写一个 `guide.json`(`<数据目录>/home/companion/guide.json`),删掉它、并且没有 Key 时,下次启动引导会重新出现。已经有 Key 的旧安装升级上来直接算看过。引导本身在 `core/guide.ts`,一步一步经桌宠 World 的 `dialog` 画在 Coo 的气泡里。

## 目录结构

| 目录 | 内容 |
|---|---|
| `vendor/cortico` | Cortico 本体(子模块) |
| `packages/cortico-world-desktop-pet`、`packages/cortico-world-cua` | 两个 World，源码由本仓库直接管理 |
| `packages/cortico-provider-coo` | Coo Pet Provider:DeepSeek、千问、Kimi 等几家模型服务的 provider,DeepSeek 排第一;另有 ChatGPT 套餐登录的 `chatgpt` 模块(测试中) |
| `core/` | Core 子进程的入口:装配 Cormini、World、provider;首次运行的种子文件;没填 Key 时让桌宠提醒;`coopanion` World(`notice.ts`)在更新后把更新说明、在引导结束后把引导里的对话、在对方改设置后把改了什么告诉 Coo,并提供 Coo 给自己设唤醒器的工具(`alarms.ts`,不在界面上显示);匿名使用统计(`telemetry.ts`,字段见 [TELEMETRY.md](TELEMETRY.md)) |
| `console/` | 覆盖在 Cortico WebUI 上的入口:普通/高级两种模式,「开始」「习惯」「装扮」「语音输入」「电脑操作」五页,「系统提示词」页的「清空重开」,字标下的版本与更新提示(`features/release.ts`,版本号由 `scripts/stage.ts` 写进 `app-version.ts`) |
| `app/` | Electron 主进程:托盘(Mac 上是菜单栏图标)、设置窗口(启动时不打开)、Core 子进程托管、桌宠窗口模式、自动更新(`updater.cjs`);`app/shims/` 是扩展安装用的 corepack 替身 |
| `scripts/stage.ts` | 从 `vendor/cortico` 生成应用使用的 `build/cortico`:去掉内建的平台 World 与 llamacpp,叠加 `console/`,构建 WebUI 与桌宠的面板 |
| `scripts/pack.ts` | 组装扁平的 `build/app` 并调用 electron-builder(以 `build/app` 为项目目录、按 npm 收集其中的 `node_modules`,见 `scripts/pack-builder.ts`;`electron-builder.yml` 里的相对路径都相对 `build/app`);`installer/nsis.nsh` 定 Windows 默认安装位置、卸载时保留 `data`;Mac 包是临时签名(ad hoc)的 dmg 与 zip |
| `scripts/make-icons.cjs` | 用 Electron 把 Coo 的造型(`web/coo/coo.js`)画成 `app/icons` 与 `core/seed/avatar.png` |
| `scripts/banner.mjs` | 画各 README 顶部的明暗 banner(Coo + `scripts/lettering.mjs` 的字形):`node scripts/banner.mjs <companion\|desktop-pet\|cua> <目录>` 在目录里写 `banner.svg` 与 `banner-dark.svg` |
| `installer/install.ps1` | 一行命令安装用的脚本:下载最新 Release 的安装包并运行 |
| `telemetry-server/` | 匿名使用统计的服务端(单文件 Node + SQLite);应用只在 `COOPANION_TELEMETRY_URL` 指向它时才发送,说明见 [telemetry-server/README.md](../telemetry-server/README.md) |

## 发布

1. 改 `package.json` 里的 `version`;
2. 写 `docs/releases/v<版本>.md`。它既是 GitHub Release 的正文，也随安装包分发：用户更新后 Coo 会读到上次运行的版本之后每个版本的说明(「## 下载」及以下不给 Coo),再用自己的话讲给用户;
3. 提交后打 `v<版本>` 标签并推送。

GitHub Actions 会构建 Windows 安装包、Windows 便携版 zip 和两个 Mac 包(Apple 芯片、Intel,都在 Apple 芯片的 runner 上打)以及 Linux 的 AppImage 和 deb,附到对应的 Release 上,连同 `SHA256SUMS.txt` 和自动更新读的 `latest.yml`(Windows 安装包)和 `latest-linux.yml`(AppImage);便携版不进 `latest.yml`。已装的 Windows 版和 AppImage 由 `app/updater.cjs`(electron-updater)在后台下载新版本,Coo 在气泡里问要不要重启更新;Mac(临时签名装不了自动更新)、deb 和便携版仍靠设置窗口字标下的提示手动下载。

在 Actions 里手动运行 release 工作流(workflow_dispatch)是打标签前的演练：各平台照常构建，便携版那一项跑 `scripts/verify-portable.ts`(渠道是 portable、没有 electron-updater、没有 `latest.yml`),汇总那一步按 `package.json` 的版本检查全部发布文件并写出 `SHA256SUMS.txt`,只是不建 Release;推标签时还会检查标签和 `package.json` 的版本一致。

## 提交改动

- 提 PR 前先跑 `pnpm run test`、`pnpm run test:worlds`、`pnpm run typecheck`、`pnpm run typecheck:web` 和 `pnpm run typecheck:worlds`，CI 也会跑这些检查。
- 改到用户能看到的行为时,同步更新 [README](../README.md)。
- 贡献按 AGPL-3.0-or-later 发布,不用签协议,见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## CI 检查与手动冒烟测试

CI 在 Windows、macOS、Linux 上各跑一遍上面五项检查,另外:

- **导出的形象包**:`tests/*-pack-export.test.js` 用原版 v0.1.17 的读包代码检查五个导出包,`tests/pack-export-upstream.test.js` 再用原版当前发布(v0.2.3,原版发新版时连同 CI 的 fetch 一起改)的 `readManifest` / `scanPacks` 检查一遍(和原版自带形象放在一起，不能撞 id)。本仓库自己的 v0.2.x 标签和原版重名，所以原版的标签取到单独的 ref:`git fetch --no-tags https://github.com/Pal-AI-Lab/Coopanion refs/tags/v0.2.3:refs/upstream-tags/v0.2.3`。本地没有这个 ref(或 v0.1.17 标签)时这些检查跳过,CI 上缺了直接失败。
- **桌宠窗口的平台分支**:`tests/pet-host-platform.test.js` 把 `host/electron-main.cjs` 连同 Electron、koffi 和 `process.platform` 换成替身来跑，所以在任何系统上都会测到 Windows 的「从最大化进入全屏」判断、桌面窗口/自身/其他显示器不算、自动隐藏任务栏留缝,X11 从 X server 读光标、鼠标租约、映射后重新设置点击穿透和悬停按钮，以及三个平台上「第一次 show 事件没来也会告诉页面已显示、不会先说隐藏」。
- **真 Electron 冒烟**:`tests/pet-host-smoke.test.js` 用真的 Electron 启动桌宠窗口进程，加载一个测试页，断言启动后页面被告知「已显示」、从没被告知「隐藏」、声音没有被静音(Windows / Mac 上还断言页面的 AudioContext 是 running;Linux 的 xvfb 下可能没有声卡，只把状态打到日志里，等看过 CI 的结果再定要不要断言)、光标报告在走。Windows 上直接跑;Linux 上 CI 用 `xvfb-run -a --server-args="-screen 0 1920x1080x24" pnpm run test`,本地没有显示时跳过;Mac 上只在 `PET_HOST_SMOKE=1` 时跑(会在屏幕上放一个透明窗口几秒)。

下面这些自动测不到，发版前在真机上手动过一遍(Windows 和 Linux 各一台):

- [ ] 启动后第一个动作就有声音;托盘「隐藏桌宠」后没声音，再「显示桌宠」声音回来。
- [ ] Windows:打开「全屏时隐藏」,浏览器从最大化按 F11、视频全屏、游戏全屏时桌宠让开，退出全屏后回来;只是最大化的窗口不让开;隐藏期间手动隐藏的，退出全屏后不自己出来。
- [ ] Windows:任务栏设成自动隐藏，鼠标移到那条边任务栏能弹出来。
- [ ] Windows:两块缩放不同的屏幕(如 100% 和 150%),把桌宠拖过去，大小和点击位置都对。
- [ ] Windows:桌宠问问题时数字键能直接选，答完键盘回到原来的窗口。
- [ ] 数位板或键盘按 Ctrl+- / Ctrl+= 时桌宠不缩放。
- [ ] Linux X11(带合成器的 GNOME/KDE):窗口透明，桌宠以外的地方点得到下面的窗口;鼠标移到桌宠上悬停按钮出现，移开后消失、点击又能穿透;200% 缩放下光标位置对。
- [ ] Linux Wayland(经 XWayland):同上看一遍，记下和 X11 不一样的地方。
- [ ] Linux:托盘图标出现(GNOME 要装 AppIndicator 扩展),菜单能显示、隐藏桌宠。

## 界面语言

应用的语言就是 Cortico 的 `Language`(`vendor/cortico/src/core/language.ts`),存在部署配置 `<数据目录>/home/companion/config.json` 的 `language` 里,说明在 `core/language.ts` 开头。

- **从哪来**:主进程在 ready 之后读系统语言(`app/i18n/index.cjs` 的 `systemLanguage`:`app.getPreferredSystemLanguages()`、`getLocale()`,按 `languageOfLocale` 映射，认不出时英文),作为 `COOPANION_SYSTEM_LANGUAGE` 交给 Core;`core/seed.ts` 只在新建 `config.json` 时写进去;不是 `zh` 时再写桌宠 World 的语音识别语言、关掉转简体,非中文时还写默认称呼「Pal」(`newInstallWorlds`;`zh-Hant` 只写语音识别,中文新装什么都不多写)。没有 `language` 或值不对的配置读作中文，所以老安装升级不会变。以前只存在控制台 localStorage 里的语言(Cortico 的语言按钮)只改过控制台的显示，不当作应用语言:`app/settings-preload.cjs` 每次加载前都把它改写成应用语言，所以升级后控制台回到中文，称呼、语音设置和 Coo 说话的语言都不变;再选一次语言才走下面的切换。
- **怎么变**:「习惯」页和设置 → 界面语言都经 `/api/config` 写 `companion` 组的 `language`;`core/companion.ts` 的 `watchLanguage` 马上通知主进程(`companion:language`,托盘和设置窗口跟着刷新)、重建系统前缀，桌宠页面随下一次 `prefs` 换语言。
- **默认值跟着换**:语言在中文类(`zh`、`zh-Hant`)和别的语言之间变化时,`watchLanguage` 先调 `followLanguageDefaults`:`newInstallWorlds` 决定的几项(桌宠 World 的 `user`、`asr.language`、`asr.simplified`)里，仍是旧语言默认值的换成新语言的默认值(`seed.ts` 的 `languageSwitchPatch`,逐项判断;中文的默认称呼认「伙伴」和 0.1.2 以前的「主人」),先同步写进 `config.json`(在 `/api/config` 写 `language` 之前，那次写会重新读文件),再原地改活配置，桌宠 World 不用重启就用上(称呼随 `prefs`,语音语言变了 FunASR 重启),`coopanion` World 也照常把称呼的变化告诉 Coo。人自己设的值不动;自己填的恰好是「伙伴」/「Pal」、或语音设置恰好等于默认的，分不出来，也会被换掉，这是有意接受的。英语 ↔ 日语只换语音语言，中文 ↔ 繁体只换转简体。从不换语言的中文安装什么都不写(`tests/language-switch.test.ts`)。默认称呼列表 `DEFAULT_USERS` 由引导的称呼框和统计的 `userNamed` 共用。
- **加文字**:每处给人看的文字都是一对 `zh` / `en` 表，键完全相同，由各自的测试检查键和函数参数个数一致、英文里没有中文:主进程 `app/i18n/{zh,en}.cjs`,桌宠窗口进程 `host/text.cjs`,桌宠页面 `web/i18n/{zh,en}.js`,桌宠 World `src/i18n/{zh,en}.ts`,电脑操作 World `src/strings.ts`,模型服务 `src/connect.ts` / `src/vendors.ts`(`name` / `nameEn`),控制台各页的 `TEXT` 表(`pick(TEXT)`),`core/` 里引导、更新提示、设置项的表。取表一律用 Cortico 的 `pick`:`zh-Hant` 读 `zh`,其他语言都读 `en`。表里只加一种语言的键会被测试拦下;直接写在代码里给人看的中文测试查不到，要自己留意，放进表里。
- **页面和名字**:桌宠的两个页面(`pet.html`、`dress.html`)按中文写,语言不是中文类时由 `src/server.ts` 在发出前把页面表的英文盖进去(`src/page-text.ts`:`<html lang>`、`<title>`、`data-i18n` 文字和 `data-i18n-label`),所以不会先闪一下中文、窗口标题也不来回变;中文原样发出。三个 World 定义的 `label` 按 `labelLanguage` 取(`core/companion.ts` 在 `createBot` 组装完之前给中文):Cortico 组装时记下的名字用在给 bot 的 World 通知里(「World 「桌宠」…」),保持中文;之后读的(建不起来的 World 在控制台列表里)跟应用语言。对话页心情标签的英文在 `console/features/chat/index.ts` 的 `MOOD_EN`(按表情 id,形象包的 `names` 是 bot 的词表，不加英文),新表情要补上(`tests/console-i18n.test.js` 会拦)。装扮页里形象包的名字在中文下是 `zh`,没有就取第一个，和 World 告诉 bot 的一致。
- **应用外的文字**:macOS 的权限说明 Info.plist 里是英文,`installer/mac/InfoPlist.strings`(中文，原样)由 `electron-builder.yml` 的 `mac.extraResources` 放进 `zh_CN.lproj`、`zh_TW.lproj`;deb 的 `synopsis` 是英文;Windows 一行安装脚本 `installer/install.ps1` 按 `Get-UICulture` 说中文或英文。
- **给 bot 看的文字不翻译**:环境提示词(`ENV_PROMPT*.md`)、工具说明、事件、回执、形象的 `about`、闲聊提示、自我描述在任何语言下都是中文、逐字节不变。语言不是 `zh` / `zh-Hant` 时，只由 `coopanion` World 在前缀里多加一行 `replyLanguage`(`core/language.ts`),让 Coo 用那种语言说话。
- **中文快照**:`tests/i18n-zh-snapshot.test.ts` 把中文下 bot 读到的全部文字(两个 World 的提示词和工具、回执、决策请求、闲聊、引导、自我描述)和 `tests/fixtures/i18n-zh/*.json` 逐字节比对;桌宠 World 的控制台中文另有 `packages/cortico-world-desktop-pet/tests/fixtures/i18n-zh-console.json`。这些快照是从加语言之前的代码(084a201)生成的，改代码后测试不过就改代码，不要重新生成;只有确实要改中文给 bot 的文字时才用 `UPDATE_I18N_ZH=1` 重写，并在 PR 里说明。
- **试首次运行**:`COOPANION_SYSTEM_LANGUAGE=en`(或 `zh`、`ja` 等)加空的 `CORTICO_COMPANION_DATA` 启动，就按那种系统语言新装一次，不用改系统设置。

## World 源码来源

两个 World 从子模块转为本仓库的 workspace 包时，保留了原目录和包名;许可随本仓库改为 AGPL-3.0-or-later,原仓库里的历史版本仍是 MIT。源码快照分别取自桌宠
[`7ce70c271add681cbcb19cfebb07c40ac03215e3`](https://github.com/Pal-AI-Lab/cortico-world-desktop-pet/commit/7ce70c271add681cbcb19cfebb07c40ac03215e3)
和 CUA [`ce44ed7fed92ec06b60df2609808110a73824fe5`](https://github.com/Pal-AI-Lab/cortico-world-cua/commit/ce44ed7fed92ec06b60df2609808110a73824fe5)。
各包原有 Git 历史仍可从对应仓库查看；此后修改直接提交到 Coopanion。包内独立 lockfile 和 workspace 配置已移除，
依赖统一由仓库根目录管理。`vendor/cortico` 仍是子模块。

## Cortico 版本

`vendor/cortico` 钉在 Cortico 的 `087289d`(0.2.3,与原版 v0.2.4 同一处)。升级时逐个标签走(`git -C vendor/cortico checkout <tag>`),每一步跑 `build:cortico`、三个 typecheck、两套测试，再用空数据目录启动一次看 `core.log`;原版每次升级的做法见 `git log upstream/main -- vendor/cortico`。

- 0.2.0 起(#250)终端改称控制台、控制台改称 WebUI:内建 World `terminal` → `console`(工具 `console_send`、事件 `console.*`),扩展契约 `console()` → `webUi()`、`Console*` → `WebUi*`,`cortico.consoleClient`/`consoleStyle` → `webUiClient`/`webUiStyle`(桌宠的面板源码在 `src/webui/`,`scripts/build-webui.mjs` 打成 `dist/webui.*`),路由 `/api/console/*` → `/api/webui/*`,`logging.console` → `logging.stdout`,WebUI 记的语言键 `cortico.console.language` → `cortico.webui.language`(`app/settings-preload.cjs`),三个包的 `cortico.api` 到 6。覆盖层 `console/main.ts` 跟着改名,其余逐字沿用。升级时 `core/seed.ts` 的 `moveTerminalToConsole` 把部署里的 `worlds.terminal`、`logging.console` 和 `worlds/terminal/` 提示词覆盖移到新名字,覆盖里的 `{{terminal.…}}` 变量改成 `{{console.…}}`(否则口令不再填进前缀;原版没有这一步),已在新名字下的不动(`tests/seed.test.ts`)。旧 session 的历史里仍有 `terminal_send` 调用;Cortico 本身在进程重启后让 session 沿用旧的系统前缀(其中还是 `## terminal`),工具表却已是 `console_send`;所以 `core/companion.ts` 在启动后看 session 的前缀(`core/seed.ts` 的 `prefixFromBeforeConsole`:有 `## terminal` 一节、没有 `## console`),是的话重载一次前缀,和点「重载系统前缀」一样(之后的启动不会再重载);`seed.ts` 还把 `core-state.json` 里 `worldVisibility.terminal`(对 Coo 隐藏)挪到 `console`;控制台页看不到改名前的终端对话(事件类型不同)。bot 读到的文字里变了的只有控制台 World 自己的:环境提示词把 terminal 说成 console、工具 `terminal_send` → `console_send`、发送回执说的页名(`on the console's "Terminal" page` → `on the WebUI's "Console" page`),该节在前缀里按 World id 排到 `cua` 之前;中文快照不覆盖这些,也没有变。
- 0.2.x 同时带来:新版扩展市场(官方索引、标签与徽标、GitHub 设备码登录后投票与评论,#243、#251、#254、#265、#274)、扩展自描述(`describe`,本应用的包还没写)、旧契约扩展的过渡层(#258)、扩展装卸修复(#252、#260、#266,要 pnpm 11.28.6:根 `package.json` 的 `packageManager` 与依赖、两个 World 包的 `packageManager`、`scripts/pack.ts` 的 `DEPS.pnpm`)、重启补投不再重复已有事件(#264)、交接笔记不再漏掉最近一批的回答(#269)、明文回放不带签名块(#275),以及 `.env` 密钥只在同一行匹配(#268,空的 `NAME=` 不再读到下一行;`tests/decider-key.test.ts` 锁住)。
- 0.1.11 起 `timezone` 缺省取本机时区，不再是 `Asia/Shanghai`;`core/seed.ts` 不写 `timezone`,所以时间、唤醒器和时间戳都跟电脑的时区走(`tests/seed.test.ts` 锁住);每天的唤醒器按设定时的墙钟时间(`Alarm.clock`)排到下一天(`nextDay`),夏令时切换前后不偏一小时;拨快那天不存在的时刻(如 02:30)顺延到跳过之后(03:30),第二天回到 02:30;拨慢那天重复的时刻取前一次(`tests/alarms.test.ts`)。
- 0.1.9 起语言扩到 11 种:`Language` 不只 `zh` / `en`,只有中英两份文字的表按 `baseLanguage()` 取(如 `cortico-provider-coo` 的思考档位)。
- 0.1.13 起实例锁冲突抛 `InstanceLockedError`:`core/companion.ts` 发 `companion:locked`,`app/core-host.cjs` 不再重启 Core,直接说明占锁的进程。控制台试过的 5 个端口都监听不了时(Cortico 抛最后一个端口的 `EADDRINUSE`/`EACCES`),`core/console-origins.ts` 的 `portsBusy` 认出来,发 `companion:ports-busy { from, to }`,同样不重启(`core-host.cjs` 的 `blocked`),通知和错误框写明端口范围。
- 0.1.16 的 WebUI 提示词页要 `@codemirror/commands`(原版锁定 6.11.1),根 `package.json` 已加上这个依赖。提示词页改版(就地编辑、撤销、折叠、底部完整提示词预览，#235、#241)后按钮在 `.prompt-actions` 里、状态行是 `.prompt-status`,「重载当前 session」改名「重载系统前缀」;`console/features/clear-session.ts` 把「清空重开」放进 `.prompt-actions`,状态行沿用 `.prompt-status`。0.1.16 的 `worlds/index.ts` 按 id 动态导入 World,原版 cc2b1de 从那时起不再从打包产物里删它和 `src/launcher.ts`;`scripts/stage.ts` 的 DROP 照旧删也不影响运行。同版起扩展页可填 npm 源(写 `extensions/.npmrc`,#239),明文回传可关掉合成推理填充(#236)。
- 472694f 带进三处会让 Coo 不再出声的修复，由 `tests/cortico-hang-fixes.test.ts` 经本应用的装配方式锁住(在 v0.1.15 上三条都失败):#245 工具返回值既不是字符串也不是 `{ text }`(未经类型检查的扩展)时记失败回执，主循环不再退出;#246 重启读回 `session-main.jsonl` 时删去找不到调用的工具回执(原来每次请求都被上游拒绝);#249 别的端点记下的项出线时不带 `id`(来源按端点名和 base URL 区分),在走 Responses 协议的服务之间(如 DeepSeek 与 OpenAI、xAI)换模型不再 400;Gemini、Anthropic 走 provider-coo 自己的线路，不经这里。Cortico 自己的测试在 `vendor/cortico/tests/core/loop.test.ts`(要 minecraft World 的依赖，只能在 Cortico 仓库里跑)和 `tests/providers/transport/responses-input.test.ts`。

## 代理、主题与字标

Core 使用内置 Electron 的 Node 环境代理支持，读取 HTTP_PROXY/HTTPS_PROXY 等变量。启动环境里没有这些变量时，主进程在每次启动 Core 前用 `session.resolveProxy` 查询系统代理（5 秒超时），HTTP/HTTPS 代理写成这四个变量，DIRECT、SOCKS 或查询失败时不设；`core.log` 每次启动记一行代理来源（不写地址）。NO_PROXY 与 no_proxy 合并后补齐 localhost、127.0.0.1 和 IPv6 回环地址，避免本机控制台和桌宠通信被代理。Core 还带 `--use-system-ca` 启动，TLS 也信任系统证书库（公司网络、杀毒软件的中间人证书）。

装扮页通过 URL 初始值和父窗口消息跟随控制台主题，消息校验精确来源与父窗口；桌宠配色独立保存。

执行 `node scripts/banner.mjs companion assets` 同步生成 README 明暗 banner 与 `console/branding.ts`。复用现有字母几何，Coopanion 仅开头两个 o 着品牌绿色。生成后重新构建控制台。
