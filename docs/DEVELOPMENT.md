# 开发文档

Coopanion 是用 [Cortico](https://github.com/Pal-AI-Lab/Cortico) 组装的 Electron 桌面应用:Cortico Core + Cormini Persona +
[桌宠 World](../packages/cortico-world-desktop-pet) + [电脑操作 World](../packages/cortico-world-cua),
模型经 Coo Pet Provider(`packages/cortico-provider-coo`)接 DeepSeek、通义千问、Kimi 等几家服务,默认 DeepSeek。每家一个端点,名字就是它在 `src/vendors.ts` 里的 id;0.1.x 的 `deepseek` 模块端点在启动时由 `core/seed.ts` 改成 `coo`。桌宠表情决策的模型同样在启动时迁移：设置里还是 OpenRouter 下架了的旧默认 `perplexity/pplx-decider-v1.1-27b` 的，由 `core/seed.ts`(`RETIRED_DECIDERS`)换成现在的默认 `typesafe/jev-1.14`;运行中 OpenRouter 说所选模型没有了(404「No endpoints found for …」)时，桌宠 World 这次运行改用默认模型(`docs/notes/expressions-and-actions.md` 一、§12)。同一个包里还有 `chatgpt` 模块(`src/chatgpt/`,测试中):用 ChatGPT 账号登录、请求计入套餐，端点名 `chatgpt`(这个名字已被别种端点占了时是 `chatgpt-2` 这样的空名,见 `chatgptName`;令牌行记着端点目录的绝对路径,复制、改名或挪走的目录读成未登录并删掉抄来的令牌),按模块认而不是按地址(地址和 OpenAI 一样,见 `connectionVendor` / `endpointVendor`);引导里的 ChatGPT 走 OpenAI 卡片之后的一问(单开一张卡会改掉 DeepSeek 那条路上的卡片，动 `tests/fixtures/i18n-zh/guide.json`;这一问和登录自己的几句气泡不进交给 Coo 的引导记录，带 Key 的那几条路记录不变),登录页经 `companion:browse` 交给主进程，只开 `https://auth.openai.com/`;高级模式里它的账号一段是设置窗口登记的内置面板 `coopanion-chatgpt`(`console/features/chatgpt`)。

`coo` 模块的端点地址(原版 #327、#325):远程地址只收 https,`validateEntry` 拒收 http 的远程地址(`plainRemote`;本机、RFC 1918、169.254、100.64/10、IPv6 的 `::1`/fc/fd/fe80、单名和 `.local`/`.lan`/`.home.arpa`/`.internal` 可以用 http),规则之前存下的这种端点 `create` 时给一个发不出请求的客户端。所以 `scratch/combo2/eval/run.ts` 的 `EVAL_BASE_URL` 是 http 远程地址时也会失败，换成 https 或本机转发。Cortico 自带的「OpenAI Responses Compatible」(`openai-responses-compat`)不归这条规则管，和原版一样。Gemini 模型列表最多 20 页、整体 60 秒，翻页令牌重复就停;Anthropic 模型列表读满 2000 个就停;两者和 Anthropic 的对话请求都不跟重定向(`redirect: 'error'`);Responses 和 Gemini 对话由 Cortico 的传输层(`response-http.ts`)不跟重定向。Cortico 的模型目录(`ModelCatalog`,别家的 `GET /models`)仍跟重定向，但它的 Key 放在 `Authorization: Bearer`,fetch 跨源重定向时会去掉这个头。测试在 `packages/cortico-provider-coo/tests/{coo,model-list}.test.ts`。

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

World 的生命周期与 bot 的名字(原版 #312、#298、#320、#243):
- 电脑操作(`packages/cortico-world-cua/src/world.ts`):每个在途请求记着它发给的引擎;请求超时(`ENGINE_TIMEOUT_MS` 加等待)时,若那还是当前引擎,就把它 SIGKILL 掉、置空,下次调用重新拉起;被换下的引擎迟到的应答被丢弃,它的 `exit` 只让自己的请求失败,不动新引擎和 World 页的灯。截图坐标换算成屏幕像素后夹到屏幕最后一个像素(`toScreen`)。测试:`packages/cortico-world-cua/tests/recovery.test.ts`(真 fork 出一个只扣住请求的引擎,mock `node:child_process` 的 `fork`)和 `unit.test.ts` 的坐标那条。关掉电脑操作仍走 World 激活(`/api/worlds/activation` 到 `stop()`),引擎随之结束。
- 语音输入(`packages/cortico-world-desktop-pet/src/world.ts`):`syncPrefs` 看到 `asr.enabled` 关掉就 `stopVoiceBackend`(停的是 `runningEngine`,不是配置里现在的引擎),看到打开就 `startVoiceBackend`;`voiceGeneration` 让被停止赶上的启动作废,`voiceStopping` 让启动先等停止做完。`src/asr/funasr.ts` 的 `release()` 丢掉识别器、等在途的解码结束后调 `globalThis.gc`(Core 由 `app/core-host.cjs` 带 `--expose-gc` 启动,所以 FunASR 模型当场回收;别处等下一次完整 GC)。`src/asr/system-recognizer.ts` 按代计数:`stop()` 打断正在启动的 PowerShell,旧进程迟到的 ready、error、输出都不再算数。「语音输入」面板(`src/webui/client.ts`)在关着时禁用「启动」。测试:`tests/voice.test.ts` 的「voice input on and off」、`tests/system-recognizer.test.ts` 的前两条、根目录 `tests/console-voice.test.js`。真机上没有下好的模型时只能看到「已停止」和灰掉的「启动」,内存回落没在真机上量过。
- bot 的名字:`core/companion.ts` 给桌宠和电脑操作的定义都借出 `botName: () => config.displayName || 'Coo'`,两个 World 每次用时现读(菜单头随 `prefs` 的 `bot.name`、对话页的 `init` 与 `{ t: 'bot' }` 帧、授权问句、对话页的互动记录),改名不重启 World。「习惯」页的「Coo 的名字」写 Core 自己的 `core` 组的 `displayName`,存上后发 `companion-name-saved`(`console/features/bot-name.ts`),`console/main.ts` 收到就 `shell.setBrand`;左栏自己改名时「习惯」页 3 秒内读到;别处(高级模式的配置页、接口)改的名字,左栏要等重新打开窗口。默认 `Coo` 时中文快照不变;`displayName` 不进任何给模型的文字,所以改名后人设里它仍自称 Coo,引导的台词也仍说 Coo。测试:`packages/cortico-world-desktop-pet/tests/world.test.ts` 的「the bot's name」、`tests/console-bot-name.test.js`。
- Cortico 的 `/api/config` 先把值写进正在用的配置、再写 `config.json`(`vendor/cortico/src/bot.ts` 的 `config.set`):写入失败时请求报错,但 Core 已经在用新值,直到重启。所以「电脑操作」页保存失败后重新读一次 `/api/config`,显示 Core 此刻的值(读不到才回到上次存下的值),和原版 #312 回到存下的值不同。
- 设置改动通知(`core/notice.ts`):`worlds.cua.enabled` 变了时,`inEffect`(`core/companion.ts` 的 `cuaSettled`:cua 在 `core.worldVisibility()` 的挂载表里与否和开关一致,且不在 `driftedWorlds` 里)为假就先不推这条通知,下一次看(每秒)再试,最多 `HOLD_MAX_MS`(40 秒)。实测打开电脑操作(持久化、启动引擎、重建前缀)约 225 ms,而通知最早在 1 秒的轮询加 2.5 秒的 debounce 之后送达,所以正常情况下本来就不会抢先;这道闸防的是引擎首启很慢的机器。只看电脑操作的开关,别的改动不等(在这台电脑上跑不了的 cua 永远不会「到位」)。测试:`tests/notice.test.ts` 的「computer use switched on or off」。

气泡与对话页(原版 #248、#279、#297、#318、#256):
- 气泡速度 `worlds.desktop-pet.window.bubbleSpeed`(0.5–2,默认 1)经 `src/config.ts` 的 `bubbleSpeed` 收进范围再随 `prefs` 发给页面;`web/pet-app.js` 的打字速率(`typeText`)和各段停留(`stepDialog`、`stepTalk`)乘除它,`src/script.ts` 的 `estimateSeconds(beats, speed)` 照同一算法给 `pet_say` 回执报时长,默认 1 时回执逐字节不变。不进 `pet_set`。
- 说话声(原版 #263、#265):设置是音效组里的 `worlds.desktop-pet.speech.*`(`src/config.ts` 的 `speechFor` 把档位换成数再随 `prefs` 发给页面;没存过这几项的旧配置读作关)。页面 `web/speech.js`(与上游逐字节相同)向 `POST /api/speech` 要一段文字的音节(`src/speech`,也与上游相同),用 `web/sound.js` 的 `output('talk')` 播放,所以音效总开关、「说话」类和窗口隐藏都管得住它;`web/pet-app.js` 的 `typeText` 在说话声能听见时按 `textSteps` 打字、不叽咕,隐藏时、以及音效总开关或「说话」类从开变关时(`applyPrefs`,只在这一刻,不是每次同步),`hushSpeech` 停掉已排好的音节并让这个气泡重新要音节(上游没有这一步,已排好的音节会再响一两秒)。`estimateSeconds(beats, speed, steps)` 在开着时用 `speechTextSteps`,关着时回执逐字节不变。在 jsdom 里跑 `pet-app.js` 的测试要在 `deps` 里传 `createSpeech`、`textSteps`(用 `active: false` 的替身,别用 Proxy:Proxy 的 `active` 是个函数,算真)。测试:`packages/cortico-world-desktop-pet/tests/speech*.test.ts`、`tests/pet-speech*.test.js`。新设置的中文描述手工加进了 `tests/fixtures/i18n-zh-console.json`(只增不改)。
- 「输入气泡」`worlds.desktop-pet.saidBubbles`(默认开)和灰底叠放:`placeLines` 居中叠在 Coo 的气泡上方(没有气泡时在头顶),去掉了按朝向选边和 `#trail` 三个圆点;打字框是 textarea(Enter 发送、Shift+Enter 换行,`isComposing` 或 keyCode 229 不发)。两项新设置的中文描述手工加进了 `packages/cortico-world-desktop-pet/tests/fixtures/i18n-zh-console.json`(只增不改)。
- 链接:`web/ui.js` 的 `urlRanges` / `linked` 由桌宠页面(`typeText`,带 `marks` 的引导步骤除外)和 `console/features/chat` 共用;在 jsdom 里跑 `pet-app.js` 的测试(`tests/pet-lines.test.js`、`tests/pet-connection.test.js`)要在 `deps` 里传 `linked`。
- 上下文圆环 `console/features/chat/context.ts`:挂在 Cortico 输入框的 `tools` 槽里,读 `/api/status` 的 `loop.estTokens`、`loop.context.hardTokens`、`loop.lastTruncateAt` 和 Cormini 在顶层报的 `context`(`maxTokens × softRatio`,两者取小为满格);开页、每次阶段变化和窗口可见时每 5 秒读一次,`handoff` 阶段转圈。`loop` 那几个字段的类型取自 Cortico 的 `LoopStatus`,升级 Cortico 改了名时 `typecheck:web` 会报错;Cormini 的 `context` 没有类型可取,升级后在真实应用里看一眼 `/api/status`。
- 对话页草稿:输入框是 Cortico 的 `prompt-input.tsx`(没有复制到 `console/`),所以页面自己监听 textarea 的 `input` 把文字存进 `localStorage` 的 `cortico.console.draft.chat`(原版同一个键),页面卸载和 `pagehide` 时再从 textarea 存一次(收回的消息、桌宠打字框转来的文字是程序填进去的，不触发 `input`),挂载时 `restore`,发出时清掉。附的图片在 React 状态里，页面拿不到，所以不保留(原版保留)。
测试:`packages/cortico-world-desktop-pet/tests/{script,world}.test.ts`、`tests/pet-lines.test.js`、`tests/pet-links.test.js`(原版逐字)、`tests/console-chat-context.test.js`、`tests/console-bubble-settings.test.js`。

`core/` 自己的状态文件(部署目录里的 `notice.json`、`alarms.json`，接了统计服务器时还有 `telemetry.json`)经 `core/state-file.ts` 读写(原版 #307):`readState` 读到不是 JSON 或形状不对的内容时把原文件改名为 `<文件>.bad`、按缺失重建;缺的字段补默认值，只有类型不对才算坏(`alarms.json` 里只丢不合法的那几条记录，`clock` 不是 `HH:MM` 的按 `at` 的墙钟算);ENOENT 以外的读错误(EISDIR、EACCES 等)照样抛出，不重建、不覆盖原文件:`alarms.json` 在 `NoticeWorld` 的构造函数里读，读不出时 `coopanion` World 构造失败，Cortico 把它记为 missing(World 总览里「不可用」并写出原因),Core 照常运行，只是没有更新说明、设置改动通知、唤醒器工具，英文用户也没有了回复语言那一句(`envPromptVars` 在这个 World 上);`notice.json` 在 `start()` 里读，读不出时 Core 的 `start` 抛出、Core 起不来，按退出重启的规则试几次后停下;`telemetry.json` 读不出时 `new Telemetry` 在 Core 启动时抛出(只在设了 `COOPANION_TELEMETRY_URL` 时)。三者都在文件能读了之后重启就恢复。`writeState` 写同目录的 `<文件>.tmp`、fsync 后改名替换，打开和改名都经 Cortico 的 `retryBusy`(`cortico/core/fs-busy.ts`，Windows 上的短暂占用)。到点的唤醒器保存失败时照样送达(只记一条 `[alarms] could not save due alarms`)，重启后可能再送一次。`YYYY-MM-DD HH:MM` 里不存在的日期(02-30、13 月)和超过 23:59 的时间被拒绝，回执用已有的「at 应为 …」那句，不再顺延到下个月(原版 #312 的日期检查;夏令时仍是本应用自己的 `nextDay`);每天的唤醒器存的 `at` 早于两天前时(很久没开的应用、手改的文件),`takeDue` 从两天前算起，不再逐日走到今天(`at: 0` 原本让 Core 卡住约 4 秒)。`tests/setup/jsdom-storage.ts`(`vitest.config.ts` 的 `setupFiles`)让 Node 25+ 上 jsdom 测试的 `localStorage` 用 jsdom 的。

## 发布

1. 改 `package.json` 里的 `version`;
2. 写 `docs/releases/v<版本>.md`。它既是 GitHub Release 的正文，也随安装包分发：用户更新后 Coo 会读到上次运行的版本之后每个版本的说明(「## 下载」及以下不给 Coo),再用自己的话讲给用户;
3. 提交后打 `v<版本>` 标签并推送。

GitHub Actions 会构建 Windows 安装包、Windows 便携版 zip 和两个 Mac 包(Apple 芯片、Intel,都在 Apple 芯片的 runner 上打)以及 Linux 的 AppImage 和 deb,附到对应的 Release 上,连同 `SHA256SUMS.txt` 和自动更新读的 `latest.yml`(Windows 安装包)和 `latest-linux.yml`(AppImage);便携版不进 `latest.yml`。已装的 Windows 版和 AppImage 由 `app/updater.cjs`(electron-updater)在后台下载新版本,Coo 在气泡里问要不要重启更新;Mac(临时签名装不了自动更新)、deb 和便携版仍靠设置窗口字标下的提示手动下载。

在 Actions 里手动运行 release 工作流(workflow_dispatch)是打标签前的演练：各平台照常构建，便携版那一项跑 `scripts/verify-portable.ts`(渠道是 portable、没有 electron-updater、没有 `latest.yml`),`check` 这一步按 `package.json` 的版本检查全部发布文件并写出 `SHA256SUMS.txt`(存为 `release-SHA256SUMS` 工件),只是不建 Release;推标签时还会检查标签和 `package.json` 的版本一致。

两个工作流都只给只读令牌(上游 #314):顶层 `permissions: contents: read`,所有 Action 按 commit SHA 固定，所有 checkout 都 `persist-credentials: false`(依赖的安装脚本和测试读不到令牌;CI 里 `git fetch origin tag v0.1.17` 不带令牌，仓库得是公开的)。只有推标签时才跑的 `publish` 有 `contents: write`,挂在 `release` environment 上(可以在仓库设置里给它加审批)。它只往草稿里传文件：Release 已经发布的，上传前的检查直接失败，不会覆盖;重跑一次上传失败的草稿照常覆盖。CI 在 `pnpm install` 之后先跑一次 `node node_modules/electron/install.js`(上游 #311),`tests/global-setup.ts` 也会在测试开始前取一次 Electron。

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

`vendor/cortico` 钉在 Cortico 的 `ace4c64`(0.2.6 之后，撤回了 2e5b824 / 722df89「已存的密钥只发往存它时的地址」;与原版 v0.2.7、v0.2.8 同一处)。升级时逐个标签走(`git -C vendor/cortico checkout <tag>`),每一步跑 `build:cortico`、三个 typecheck、两套测试，再用空数据目录启动一次看 `core.log`;原版每次升级的做法见 `git log upstream/main -- vendor/cortico`。

- 0.2.4–0.2.6(`087289d` → `ace4c64`,跳过原版 b451ca0 钉的 36008dd)是纯快进，本应用的代码不用改就能编译、过测试，中文快照不变。
  - **安全修复**:模型请求 `redirect: 'error'`(`src/providers/transport/response-http.ts`);SSE 单行或单个事件超过本次输出上限的两倍即失败;端点 `.env` 和 World 的 `storeSecret` 经 `writeSecretFile` 写(0600,临时文件再 rename),Cortico 新建的端点目录 0700(`core/seed.ts` 首次建的 `providers/deepseek` 也改成 0700,`tests/seed.test.ts`;`recursive` 一并新建的 `providers/` 也是 0700;已有的目录不动);`storeSecret` 拒收不像环境变量的名字和空的或带空白的值;复制没有密钥变量的端点(ChatGPT 登录的连接)不再复制 `.env`;WebUI 的 Origin 省了端口时按协议默认端口比较;全局 CSP `frame-ancestors 'self' http://127.0.0.1:* http://localhost:* http://[::1]:*`(设置窗口本身和「开始」「装扮」页的桌宠预览都是本机页面，不受影响)。没修的：改了端点地址再点「测试」,已存的 Key 会发往新地址(原版推到 Cortico 0.3.0)。
  - **其他**:Windows 选路径的 PowerShell 脚本 `[WebUI]::` → `[Console]::`(#293;0.2.0 改名后选文件夹无效);`retryBusy`(`src/core/fs-busy.ts`)给状态、定时器和上下文日志的写入重试文件占用;主循环退出记 `event: 'loop-exit'`;用量账本按 4 MiB 分块读;用量页改版(分节、Token 活跃度格子图、「自动」旁写出实际粒度、滑动的分段按钮);市场卡片显示前缀和工具定义的 token 数;World 实例 id 必须等于定义 id,存储项带 `owner`。
  - **改了给 Coo 的文字**(Cormini 原样使用,`core/companion.ts` 不覆盖这几处;中文快照的 fixture 都不涉及，所以快照照样通过):`save_blob` 的 `handle` 参数说明(要照抄 `[blob ...]` 行里的 `log:` 句柄);交接笔记的合并提示「重复了 N 次」→「共出现 N 次」,投递计数通知(「N 条新事件。」)不再收进笔记;前缀的工作区清单把直属文件超过 `LIST_DIR_CAP`(10)的目录折成一行计数(#281)。这些随升级一起接受，列在 `docs/releases/v0.12.0.md`,是否接受由维护者决定。
  - **跟着改的应用代码**(原版 #295):`core/companion.ts` 的 `onLoopExit` 听到 `loop-exit` 就报 `crash`(`where: 'core-loop'`,见 `docs/TELEMETRY.md`)并正常关机(退出码 0);`app/core-host.cjs` 把没要求的退出当崩溃重启(3 秒后,5 分钟内最多 5 次),新的 Core 按水位补投还没进 session 的外部事件。它在 `bot.start()` 之前注册(原版在 `main` 末尾):主循环第一次写状态就失败时,`loop-exit` 在 `start()` 里面就记下了。Coo 的默认上下文(`cooDefaults` / `cooContext`):阶段预算 128000、交接保留比例 0.25(Cormini 是 64000 和 1/3),只是默认值，部署 `config.json` 里存过的 `context.*` 照旧(`tests/coo-context-defaults.test.ts`)。
- 0.2.0 起(#250)终端改称控制台、控制台改称 WebUI:内建 World `terminal` → `console`(工具 `console_send`、事件 `console.*`),扩展契约 `console()` → `webUi()`、`Console*` → `WebUi*`,`cortico.consoleClient`/`consoleStyle` → `webUiClient`/`webUiStyle`(桌宠的面板源码在 `src/webui/`,`scripts/build-webui.mjs` 打成 `dist/webui.*`),路由 `/api/console/*` → `/api/webui/*`,`logging.console` → `logging.stdout`,WebUI 记的语言键 `cortico.console.language` → `cortico.webui.language`(`app/settings-preload.cjs`),三个包的 `cortico.api` 到 6。覆盖层 `console/main.ts` 跟着改名,其余逐字沿用。升级时 `core/seed.ts` 的 `moveTerminalToConsole` 把部署里的 `worlds.terminal`、`logging.console` 和 `worlds/terminal/` 提示词覆盖移到新名字,覆盖里的 `{{terminal.…}}` 变量改成 `{{console.…}}`(否则口令不再填进前缀;原版没有这一步),已在新名字下的不动(`tests/seed.test.ts`)。旧 session 的历史里仍有 `terminal_send` 调用;Cortico 本身在进程重启后让 session 沿用旧的系统前缀(其中还是 `## terminal`),工具表却已是 `console_send`;所以 `core/companion.ts` 在启动后看 session 的前缀(`core/seed.ts` 的 `prefixFromBeforeConsole`:有 `## terminal` 一节、没有 `## console`),是的话重载一次前缀,和点「重载系统前缀」一样(之后的启动不会再重载);`seed.ts` 还把 `core-state.json` 里 `worldVisibility.terminal`(对 Coo 隐藏)挪到 `console`;控制台页看不到改名前的终端对话(事件类型不同)。bot 读到的文字里变了的只有控制台 World 自己的:环境提示词把 terminal 说成 console、工具 `terminal_send` → `console_send`、发送回执说的页名(`on the console's "Terminal" page` → `on the WebUI's "Console" page`),中文快照不覆盖这些,也没有变。Cortico 按 World id 给前缀里的各 World 段排序(`collectWorldContexts`),改名后 `console` 从最后一段变成第一段,桌宠段成了整个前缀的末尾;classic 评测里这让组合表情用得少了(`scratch/next/eval` 的 2x2 与消融 abl2:把 console 段挪回最后，组合表情的占比比同场未改的重复组高 5.9 个百分点 [+1.8, +10.7],回到升级前的水平)。所以 `core/prefix-order.ts` 的 `withConsoleLast` 在 `core/companion.ts` 里套在 Cormini 上，把 console 段排回其他 World 之后(`coopanion`(有这一段时)、`cua`、`desktop-pet`、`console`,和升级前一样);它改的是 Persona 的 `systemSegments`,bot 拿到的前缀和 WebUI 的分段视图是同一来源，各段文字一字不改，工具表仍按 id 排(`tests/prefix-order.test.ts`,不改 `vendor/cortico`)。评测的 `scratch/combo2/eval/lib/app.ts` 导入同一个函数。v0.10.0 的 session (`## terminal`)启动时按上面那条重建前缀，直接是新顺序;此前开发数据里 console 排第一的 session 等下次重建前缀(换模式、清空、交接、「重载系统前缀」)才换。
- 0.2.x 同时带来:新版扩展市场(官方索引、标签与徽标、GitHub 设备码登录后投票与评论,#243、#251、#254、#265、#274)、扩展自描述(`describe`,本应用的包还没写)、旧契约扩展的过渡层(#258)、扩展装卸修复(#252、#260、#266,要 pnpm 11.28.6:根 `package.json` 的 `packageManager` 与依赖、两个 World 包的 `packageManager`、`scripts/pack.ts` 的 `DEPS.pnpm`)、重启补投不再重复已有事件(#264)、交接笔记不再漏掉最近一批的回答(#269)、明文回放不带签名块(#275),以及 `.env` 密钥只在同一行匹配(#268,空的 `NAME=` 不再读到下一行;`tests/decider-key.test.ts` 锁住)。
- 0.1.11 起 `timezone` 缺省取本机时区，不再是 `Asia/Shanghai`;`core/seed.ts` 不写 `timezone`,所以时间、唤醒器和时间戳都跟电脑的时区走(`tests/seed.test.ts` 锁住);每天的唤醒器按设定时的墙钟时间(`Alarm.clock`)排到下一天(`nextDay`),夏令时切换前后不偏一小时;拨快那天不存在的时刻(如 02:30)顺延到跳过之后(03:30),第二天回到 02:30;拨慢那天重复的时刻取前一次(`tests/alarms.test.ts`)。
- 0.1.9 起语言扩到 11 种:`Language` 不只 `zh` / `en`,只有中英两份文字的表按 `baseLanguage()` 取(如 `cortico-provider-coo` 的思考档位)。
- 0.1.13 起实例锁冲突抛 `InstanceLockedError`:`core/companion.ts` 发 `companion:locked`,`app/core-host.cjs` 不再重启 Core,直接说明占锁的进程。控制台试过的 5 个端口都监听不了时(Cortico 抛最后一个端口的 `EADDRINUSE`/`EACCES`),`core/console-origins.ts` 的 `portsBusy` 认出来,发 `companion:ports-busy { from, to }`,同样不重启(`core-host.cjs` 的 `blocked`),通知和错误框写明端口范围。
- 0.1.16 的 WebUI 提示词页要 `@codemirror/commands`(原版锁定 6.11.1),根 `package.json` 已加上这个依赖。提示词页改版(就地编辑、撤销、折叠、底部完整提示词预览，#235、#241)后按钮在 `.prompt-actions` 里、状态行是 `.prompt-status`,「重载当前 session」改名「重载系统前缀」;`console/features/clear-session.ts` 把「清空重开」放进 `.prompt-actions`,状态行沿用 `.prompt-status`。0.1.16 的 `worlds/index.ts` 按 id 动态导入 World,原版 cc2b1de 从那时起不再从打包产物里删它和 `src/launcher.ts`;`scripts/stage.ts` 的 DROP 照旧删也不影响运行。同版起扩展页可填 npm 源(写 `extensions/.npmrc`,#239),明文回传可关掉合成推理填充(#236)。
- 472694f 带进三处会让 Coo 不再出声的修复，由 `tests/cortico-hang-fixes.test.ts` 经本应用的装配方式锁住(在 v0.1.15 上三条都失败):#245 工具返回值既不是字符串也不是 `{ text }`(未经类型检查的扩展)时记失败回执，主循环不再退出;#246 重启读回 `session-main.jsonl` 时删去找不到调用的工具回执(原来每次请求都被上游拒绝);#249 别的端点记下的项出线时不带 `id`(来源按端点名和 base URL 区分),在走 Responses 协议的服务之间(如 DeepSeek 与 OpenAI、xAI)换模型不再 400;Gemini、Anthropic 走 provider-coo 自己的线路，不经这里。同一文件还锁住 Cortico #293 的 `loop-exit`:状态文件换不掉时主循环停下、记一条 `loop-exit`,`onLoopExit` 只为它把错误交出去一次。Cortico 自己的测试在 `vendor/cortico/tests/core/loop.test.ts`(要 minecraft World 的依赖，只能在 Cortico 仓库里跑)和 `tests/providers/transport/responses-input.test.ts`。

## 代理、主题与字标

启动环境里有 HTTP_PROXY/HTTPS_PROXY 等变量时，Core 用内置 Electron 的 Node 环境代理支持按这些变量走，不再查系统。没有时（上游 #331），主进程给 Core 设 `COOPANION_SYSTEM_PROXY=1`，`core/boot.ts` 在载入 Cortico 之前装上 `core/system-proxy.ts`：Core 按请求的目标源经 IPC（`companion:proxy`）问主进程，主进程用默认会话的 `session.resolveProxy` 回答（`app/core-env.cjs` 的 `lookupProxy`，PAC 照样生效，5 秒没答复算直连），每个源的答案缓存 10 秒；fetch 走按源选代理的 undici 全局 dispatcher（`undici` 7.29.1，`scripts/pack-builder.ts` 的 `runtimeDeps` 里也有），node:http/https 的全局 agent 和子进程（装扩展的 pnpm）继承的代理变量跟随 npm registry 的答案，每 10 秒刷新。HTTP/HTTPS 代理照用，DIRECT、SOCKS 或查询失败时直连；`core.log` 每次启动记一行代理来源，某个源的答案变了再记一行（源和代理的地址，不含凭据）。NO_PROXY 与 no_proxy 合并后补齐 localhost、127.0.0.1 和 IPv6 回环地址，回环地址也从不去问，避免本机控制台和桌宠通信被代理。变量必须存在于应用启动环境中；Finder 启动不自动读取 shell 配置。Core 还带 `--use-system-ca` 启动，TLS 也信任系统证书库（公司网络、杀毒软件的中间人证书）；`--expose-gc` 让桌宠 World 停掉语音模型后能马上回收。测试：`tests/core-env.test.ts`、`tests/system-proxy.test.ts`（在 Electron 的 Node 里跑 `tests/fixtures/system-proxy-core.js`，代理软件中途退出后 fetch、node:http 和子进程的变量都回到直连）、`tests/core-host.test.ts`。

设置窗口（上游 #323、#321 在 fork 里的对应做法，`app/settings-guard.cjs`）：fork 的设置窗口直接显示 Core 源上的 Cortico WebUI，用默认会话，没有上游那样的独立分区和 `keepRemoteOut`。主进程在 `session.defaultSession.webRequest.onHeadersReceived` 里给 Core 源（每次响应时按当前端口算）的文档（主框架和子框架）加第二个 CSP：`script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'`；Cortico 自己的 `frame-ancestors` 头保留（第二个头只会再收紧），也不加上游的 `frame-ancestors 'none'`，因为这个窗口就是 WebUI 本身。WebUI 和扩展的页面脚本都由 Core 同源提供（`import(url)`），首页里唯一的内联 `<script>` 是 `type=application/json` 的主题数据，不执行。新窗口只给 Core 源和桌宠服务的源（Core 每次就绪时经桌宠面板的 `state` 取，没取到的回环地址再问一次）开应用窗口，别的 http(s) 交给浏览器，其他协议丢弃；页面只在自己的源和 Core 源之间跳转（刚开、还在 about:blank 的窗口也可以去桌宠源：它的第一次加载也是一次 `will-navigate`），别处的 http(s) 改由浏览器打开；这些规则经 `did-create-window` 也套在它开出的每个窗口上。关窗仍是隐藏：fork 的 Cortico 只有提示词页有 `beforeunload` 拦截，关窗即销毁会丢别的页没存的编辑，所以没有跟上游 #298。测试：`tests/settings-guard.test.ts`。

退出与重启（上游 #311、#254）：`CoreHost.stop()` 发 `companion:shutdown` 后等 12 秒，没退出就 SIGKILL（Core 关停中会忽略再来的 SIGTERM），再等最多 5 秒；这样停掉的不算崩溃，重启照常。还没退出的子进程按已停止放手。数据位置对话框保存失败时显示文件系统的错误再退出（数据目录在程序旁边且写不进去时仍是 `dataNotWritable`）。托盘「显示桌宠」等面板调用 5 秒超时。退出一开始就撤下托盘图标，之后 Core 报来的状态不再重建托盘菜单；气泡里的「重启更新」走正常退出（停 Core、撤托盘），再 `quitAndInstall(true, true)`。Windows 上窗口图标用 `icon.ico`，打包版设置窗口 `setAppDetails` 指向正在运行的程序。测试：`tests/core-host.test.ts`、`tests/app-lifecycle.test.ts`。

数据目录所在的盘建不了 junction 时（FAT、exFAT、多数网络共享，上游 #301）：Windows 上主进程启动时在 `<数据目录>/tmp` 里试建一个 junction，失败就让扩展按 pnpm 的 hoisted 布局装；安装版把 pnpm 的 store 和缓存放到 `%LOCALAPPDATA%\Coopanion\pnpm`（pnpm 会在 store 里给每个装过的项目建一个 junction）。便携版的 store 仍在程序旁边，保持「除登录项外不往文件夹外写」；所以便携版放在这类盘上时扩展安装仍可能在 pnpm 登记项目那一步失败（未实测）。规则在 `app/channel.cjs` 的 `channelRules`（`holdsLinks` → `coreEnv`、`pnpmLocal`），测试在 `tests/portable.test.ts`。

装扮页通过 URL 初始值和父窗口消息跟随控制台主题，消息校验精确来源与父窗口；桌宠配色独立保存。

桌宠页面服务(`packages/cortico-world-desktop-pet/src/server.ts`,上游 #306、#316、#317、#321)：浏览器写请求和 socket 只收它自己的源(`http://127.0.0.1:<端口>`、`http://localhost:<端口>`,别的答 421),不带 Origin 的本机客户端照收(`core/guide.ts` 在 Node 里 `POST /api/skin`);控制台嵌的「开始」页预览和装扮页 iframe 都是桌宠源的页面，不受影响。窗口宿主拿到的是 `PetServer.windowUrl`(`/pet#key=<randomUUID>`),`web/pet-app.js` 在有 `petHost` 时把 fragment 里的 key 加进 socket 参数，`host=window` 缺 key 或不对答 403;被替换(4000)的窗口重连，标签页不重连。fork 没有 OBS 画面来源(`overlay.cjs`),所以没有上游的 overlay key。`/packs/` 带 `sandbox allow-scripts; default-src 'none'`,静态文件都带 `nosniff`。导入时同 id 的已装包要 `replace` 点名才替换(否则 409 `{ conflicts }`,token 保留);fork 的 `installOne`(临时目录再 rename,同名文件夹里是别的东西时装到 `<id>-2`)照旧，同名的外来文件夹不算冲突(上游算)。`removable` / `POST /api/figures/remove` 只删 `packDir` 里的包。宿主(`host/electron-main.cjs`)按解析后的 origin 判断本服务(`ours`),桌宠窗口和装扮窗口共用 `guard`(本服务链接开装扮窗口,http(s) 交给浏览器，其他协议丢弃,`will-navigate` 拦下),每个 `ipcMain` 处理经 `onPet`/`handlePet` 先确认发送方是桌宠窗口里本服务的主框架。测试:`packages/cortico-world-desktop-pet/tests/server.test.ts`、`packs.test.ts`、`world.test.ts`(`windowPage` 经 `CORTICO_DESKTOP_PET_HOST` 拿真启动地址),`tests/pet-connection.test.js`、`tests/pet-import.test.js`(jsdom 跑装扮页从「importing figure packs」到拖入文件夹前的代码)。

执行 `node scripts/banner.mjs companion assets` 同步生成 README 明暗 banner 与 `console/branding.ts`。复用现有字母几何，Coopanion 仅开头两个 o 着品牌绿色。生成后重新构建控制台。
