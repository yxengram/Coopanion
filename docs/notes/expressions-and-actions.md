# Coopanion 表情与动作：调用机制与可同时使用性

> 依据：v0.2.6（`3823f93`）加上「组合扩展」，描述的是 **v0.2.6 + 组合扩展**。行号都按加上组合扩展之后的代码。
> 组合扩展做了这几件事，都只在 kit 的 `plus` 下生效（5 个内置形象都是 plus）：
> - 主动要的表情不再被动作清掉；
> - 被盖住的表情会暂停；
> - 点头、摇头、叹气走单独的头部通道；
> - 跪坐遇到表情和头部手势时保持；
> - `a+b` 同时做；
> - 新加 23 个组合脸。
>
> 实测：
> - 组合扩展改动的行为，在真实 kit 上用 `/tmp/combo/` 下的脚本重新测过：
>   - 组合矩阵：`probes/matrix3.mjs`，结果在 `matrix-before.json` 和 `matrix-after.json`，见第三节；
>   - 边界情况：`edge/*.mjs`，其中 `edge/probe.mjs` 是驱动，用真实 kit 加真实的 Claude 娘 motion，经过 `acts.js` 队列；
>   - 渲染图：`verify/sheet.png`、`vrend/`、`faces/`；
>   - 导出包在上游 v0.1.17 里的验证：日志在 `vind-<形象>.log`。
> - 其余的〔实测〕来自 `810eb3d`（v0.2.4）上的脚本，放在 `/tmp/exmap/`，组合扩展没有改动这些行为。
> - 由仓库测试守着的有：
>   - `tests/pet-actions.test.js`，以下几组：
>     - 「an asked-for face outlives the motions after it」
>     - 「a group of words through the page and the frame」
>     - 「a body without plus keeps upstream's faces and words」
>     - 「faces made of parts of others」
>   - `tests/{claude,gpt,gemini}-figure.test.js`、`tests/whale-pose.test.js`
>   - `PKG/tests/script.test.ts`、`PKG/tests/world.test.ts`
>
> 路径约定：
>
> | 简称 | 路径 |
> |---|---|
> | `PKG` | `packages/cortico-world-desktop-pet` |
> | `body.js` | `PKG/web/kit/body.js` |
> | `pet-app.js` | `PKG/web/pet-app.js` |
> | `acts.js` | `PKG/web/acts.js` |
> | `world.ts` | `PKG/src/world.ts` |
> | `script.ts` | `PKG/src/script.ts` |
> | `cc/` | `PKG/web/claude-chan/` |
>
> 标记含义：
> - **〔实测〕**：在真实 kit 上跑过。范围包括：
>   - v0.2.4 上 72×72 = 5184 个有序词对；
>   - 组合扩展后，68 个共同词的 2278 个无序词对，依次做和成组做各一遍；
>   - 若干特殊场景。
> - **〔测试〕**：有仓库里的测试守着。
> - **〔代码〕**：只读代码得出，没有跑过。

---

## 一、表情和动作的调用机制

### 1. 词从哪里来：词表

- 每个形象的 `PKG/web/<形象>/figure.json` 里都有一个 `vocab`。每项含 `id`、`kind`（`expression` 或 `motion`）、各语言的 `names`、`about`、`seconds`，可选 `lasting`。加载时由 `PKG/src/packs.ts:139-163`（`readVocab`）校验。
- 各形象的词数〔代码，已点数〕：

| 形象 | 词数 | 表情 | 动作 |
|---|---|---|---|
| Coo、大肥鱼 | 95 | 51（28 + 23 个组合脸） | 44 |
| Claude 娘、GPT 娘、Gemini 娘 | 94 | 51（28 + 23 个组合脸） | 43（少 `spout`） |

- 组合扩展之前是 72 / 71 个词。新加的 23 个组合脸（§一.9）排在 `giggle` 后面、第一个动作前面。
- `spout` 只在 `coo/figure.json:1591` 和 `whale/figure.json:1684` 里。
- 带 `lasting: true` 的只有 4 个词：`sit`、`sleep`、`kneel`、`lie`。
- `seconds` 的取值（见 `coo/figure.json` 的 vocab，`claude-chan` 相同）：
  - 表情：0.9，23 个组合脸也是；`petrify` 是 3.2。
  - 手势词：手势时长 + 0.1，例如 nod 0.7 → 0.8，wave 1.6 → 1.7。
  - 姿态 / 模式词是固定值：
    - lasting 的 sit、sleep、kneel、lie：都是 0.8；
    - look 2.7，dizzy 3.2，dance 3.4；
    - stand、jump 1.2，hop 0.9，turn 0.4；
    - walk、run 12。
- 字段的用途：
  - 页面拿到 `id/kind/seconds/lasting`（`PKG/src/server.ts:200-204`），但只读 `seconds`（`pet-app.js:136, 254`）。另外会查某个词在不在，比如 `words.has('hop')`（`pet-app.js:615`）。`kind` 和 `lasting` 虽然发到了页面，但没人读。kit 完全看不到词表。
  - `names` 和 `about` 用来生成提示词和解析词。
  - `names` 还用于 `moodOf`（`world.ts:217-221, 1305`）：它取 pet_say 里第一个 beat 的第一个表情，组里的成员也算，把这个表情的 id 和各语言的第一个名字记成对话页上的 `mood` 标签。

### 2. LLM 怎么知道词表

- `ENV_PROMPT.md` 里的 `{{pet.vocab}}`（`PKG/src/ENV_PROMPT.md:21`）由 `vocabTable(this.vocab())` 填入（`world.ts:1444`，`script.ts:247-256`）。
- 渲染出两张表：
  - 表情表。表头是「表情（持续几秒后回到平常的脸；做动作不会打断，石化除外）」。
  - 动作表。多一列「部位」，由 `partOf`（`script.ts:236-245`）按 §二.2 的通道算出，取值如下：
    - `头`：只占头；
    - `手`：占手，不占身和站位；
    - `手(停下来做)`：占手和站位；
    - `身`：其余，也包括包自带的动作。
  - `petrify` 的说明后面加上「，不和别的同时做」。
- lasting 词后面由 `lastingNote`（`script.ts:229-233`）写明什么时候结束：
  - sit、lie、sleep：「一直保持：做手势、换表情不影响，换别的姿势或走、跑、跳这类全身动作才结束」；
  - kneel：「保持到下一个手或全身动作，然后变回普通坐着；换表情、点头、摇头、叹气不影响」。
- 同时做的写法写在两处〔测试〕`world.test.ts`「tells the bot how to write words at once」：
  - **`ENV_PROMPT.md:12-23`**：
    - 标记表多了一行 `词+词`；
    - 下面一段说明：一组里表情、头、手、身各最多一个；同一部位的、或一起做不出来的改成先后做，回执里会说；做动作不会打断表情，石化除外，睡觉也会清掉表情。
    - 例子改成 `【开心+招手】…`。
  - **工具说明**：
    - `pet_act` 一条（`ENV_PROMPT.md:32`）；
    - `pet_say` 的说明和 `script` 参数（`PKG/src/tools.ts:8, 12`）；
    - `pet_act` 的说明和 `actions` 参数（`tools.ts:80, 84`）。
    - 都写了「用 + 连起来的几个词同时做」。`actions` 仍然是字符串数组，没有嵌套。
- 用的是当前形象的词表（`world.ts:345-352`）。形象加载失败时退回 Coo 的词表，并告诉 bot（`world.ts:377-384`）。

### 3. 触发来源一览

| 来源 | 入口 | 是否查词表 | 是否进页面队列 |
|---|---|---|---|
| `pet_act`（LLM） | `world.ts:1426-1437` 发 `{t:'act', actions}` | 是。见表下「`pet_act` 的解析和回执」 | 是，到达就入队（`pet-app.js:203`） |
| `pet_say` 里的 `【词】` | `parseScript`（`script.ts:162-170`），成为 beat 的 `actions`。`words()`（`:150-152`）先把 `a + b`、`a＋b` 收紧成 `a+b`，再按 `,，、` 和空白切开，每段走 `groupToken` | 是。丢掉的标记和拆组说明写在回执的 `[执行参数]` 行（`world.ts:1312-1314`） | 是，beat 开始时入队，文字晚 0.45 s 出现（`pet-app.js:320-321`） |
| `pet_say` 里的 `<词>` | `script.ts:171-179`，成为锚点；`<点头+眨眼>` 这样的组也行 | 是（同上） | 是，打字打到那个位置时入队（`pet-app.js:355`）。没有文字的 beat 见表下 |
| `dialog()`（新手引导、更新提示、出错提示） | `world.ts:824-831`；`core/guide.ts`（如 :265 `['happy','hop']`）；`core/companion.ts:220-221, 269` | 是，同样走 `parseActions`。见表下「`dialog()` 的检查」 | 是，气泡打开时入队（`pet-app.js:448`） |
| dialog 选项卡片的 `motion`（`'still'\|'walk'\|'run'`，`world.ts:115, 122`）；新手引导「走动多少」那一步在用（`core/guide.ts:58-60`） | 选中卡片时由 `stepTalkMotion` 处理（`pet-app.js:602-619`） | 否，只查 `words.has('hop')`（`:615`） | **否**。只在 idle 且不 busy 时直接调 `body.walk(...)`；选 `'run'` 时有 30% 概率再调 `body.do('hop')`。不经过 `acts.js` 的队列 |
| `pet_walk_to`（LLM） | `world.ts:1338-1372`，发 `{t:'walk'}` | 否，只查 `can.walk` | **否**，直接调 `body.walk()`（`pet-app.js:200, 241-247`）。见表下「`pet_walk_to` 的返回」 |
| 思考中 / 听语音 | `setThinking` 发 `{t:'thinking'}`（`world.ts:568-572`）。触发点在 `world.ts:452-466`：模型开始输出时开，一轮结束、中止或 turn 结束时关。页面重连时，当前状态随 init/prefs 快照一起到达（`world.ts:607` → `pet-app.js:188`）。听语音走 `onListen`（`pet-app.js:654-688`） | 否 | 否，直接设标志 |
| 提示音效 cue | `body.cue(...)`（`body.js:1739-1745`） | 否 | 否。见表下「cue 的四种」 |
| 说话口型 | 每打一个字调 `body.talk(ch)`（`pet-app.js:354`） | 否 | 否 |
| 鼠标互动（戳、摸、拎、甩） | `body.pointer` → `body.js:1456-1540` | 否 | 否，kit 直接改状态。戳、摸出的脸都不算主动要的 |
| 自由活动 | `decide()`（`body.js:832-844, 911`），加上各模式的计时器。见表下「自由活动」 | 否 | 否。闲逛给的脸不算主动要的（`:839`） |

**`pet_act` 的解析和回执**
- 每一项先收紧 `+` 两边的空格，再走 `groupToken`（`script.ts:121-148`）：
  - 整个字符串先当一个词查（`vocabId`，`:35-52`；认 id 和各语言别名，不区分大小写）。
  - 查不到就按 `+` / `＋` 拆成成员，按部位分组（§二.6）。
- 回执：
  - 不认识的词或成员列在回执里，能拆开做的都写成说明（`world.ts:1433-1434`）。
  - 一个都不认识时调用失败，返回 `[pet_act 没执行]`，页面什么都收不到（`:1430`）。
  - 回执写「开始依次做:wave → sit+wave+happy」。
  - 对每个 lasting 词写一次它什么时候结束（`lastingNote`），组里的成员也算（`membersOf`，`:1432, 1435`）。

**没有文字的 beat**：`【开心】<眨眼>`，或只有 `<眨眼>` 的脚本，没有字可打。
- `parseScript` 把它的锚点按顺序并进这个 beat 的 `actions`，跟着 beat 开始一起入队（`script.ts:189-193`）。
- 页面也兜底：没有文字的 beat 结束前，先把剩下的锚点入队（`pet-app.js:327-331`）。
- 〔测试〕`script.test.ts`

**`dialog()` 的检查**：dialog 不经过 bot，所以没有回执。
- 不认识的词不发给页面，写一条 warn 日志（`world.ts:827`），并放在返回的 handle 的 `dropped` 里（`world.ts:143`）。
- 拆组的说明写一条 info 日志（`:828`）。

**`pet_walk_to` 的返回**
- **身体 busy 时**（drag/air/crouch/roll），`walkTo` 返回 false（`body.js:789`）：
  - 帧在下一帧报 `interrupted`、`by:'busy'`（`figure-frame.js:100`）；
  - `onBody` 补上当前位置后转给 World（`pet-app.js:221-225`）；
  - 工具**马上**返回「没走：身体正忙……等它落地站稳再走」（`world.ts:739`）。
- **页面还没有身体时**报 `by:'none'`（`pet-app.js:244`），返回「没走：桌宠的身体还没准备好」（`world.ts:740`）。〔测试〕`world.test.ts`
- **真正走起来以后**，30 s 没走到才超时（`world.ts:57, 1363-1366`）。主动要的表情会跟着她走（plus，`body.js:793`）。

**cue 的四种**：
- `perk` → `setExpr('surprised', .5, false)`，只持续 0.5 s。在听语音 `'ready'` 时调用（`pet-app.js:659`）。
- `cheer` → `setExpr('happy', undefined, false)`，持续 3.2 s。在回答 pet_ask 时（`pet-app.js:415`）和发送打字内容时（`:644`）调用。
- 这两种都**不算主动要的**表情：下一个动作会换掉它们。
- `heard`、`bounce` 只加挤压（`pet.sqv += .9 / 1.2`），不改脸（`pet-app.js:680`）。
- `bounce` 只在 `dress.js` 里调用。`dress.js` 的所有调用作用在换装页的预览身体上，不是屏幕上的桌宠。

**自由活动**
- 自己选的 sit/lie 有限时长，到时会睡着或起身（`:957-960, 978-981`）。lie 会自己做小动作（`:973-977`）。look 会回到 idle。
- 这些都只在 `free = roam !== 'off' && T > hold && !dialogOpen`（`body.js:884`）时运行，也就是要同时满足：
  - 没被 pet_quiet 或「习惯」设置关掉；
  - 最近 15–20 s 没有指令：每次 say/ask/act/dialog 调 `holdRoam(20)`（`pet-app.js:197-206`），每个队列条目调 `holdRoam(15)`（`:254`）；
  - 没有打开的气泡或倾听。
- `decide()` 还要等表情显示完、倾听结束（`:911`）。
- 主动要的 sit/lie/sleep 用 `dur 1e9`，所以永远不会超时。

### 4. 流程图

```
LLM ──pet_act{actions}──────┐  World: parseActions / parseScript
LLM ──pet_say【词】<词>──────┤  └─ groupToken：整个先查；查不到按 + / ＋ 拆成员（vocabId，按当前形象词表，id 或别名）
引导/通知 ──dialog{actions}──┘     同一部位的、一起做不出来的拆成先后几组，写进 notes
                                   一组 = 成员 id 用 '+' 连起来，身/站位在前，表情在后（sit+wave+happy）
                                   不认识的词：pet_say 在回执里列出丢掉的标记；
                                   pet_act 列出丢掉的词，一个都不认识就失败、什么都不发；
                                   dialog 写 warn 日志，放进 handle.dropped；notes 进回执或 info 日志
                                   没有文字的 beat：<词> 并进这个 beat 的 actions
                                     │
                                     ▼  WebSocket  {t:'act'|'say'|'dialog'}，actions 仍是 string[]
               pet-app.js onOrder (192-210)
                 act    ──────────────────────► acts.push  (立即)
                 say    ─► 气泡队列 queue ─► stepDialog: beat 开始 / 打字到锚点 ─► acts.push
                 dialog ─► 气泡队列 queue ─► 气泡打开 ─► acts.push
                                     │
                                     ▼  stepActs (pet-app.js:253-255) → acts.js step (29-38)
                                        唯一的 FIFO，每帧检查；一个条目是一个词或一组词
               等到 T ≥ until、有 layout 且不 busy
                 → playEntry：单个词 body.do(word)；一组 body.doAll(words)（pet-app.js:252）
                   until = T + 组里最长成员的 vocab.seconds（当前词表里没有的 id 默认 1 s）
                   每个成员报 done 就不再占着；全组都 done 时提前放行（acts.js:40-46）。
                   done 来自 walk/run 结束（body.js:514, 754），或 plus 身体拒绝了某个词或成员（body.js:1700-1712）
                   组里有 walk/run、过了 seconds 还在走（layout.mode 仍是它）时继续等，
                   直到 done 或模式变了，最多 WALK_MAX = 90 s（acts.js:14, 32）
                                     │
                                     ▼  body-host.js:121-123（doAll 最多 8 个词）→ iframe figure-frame.js:94-99
               （内置形象都是 plus: true 的 kit 身体，有 doAll；第三方形象可以自己实现 do(word)，
                 没有 doAll 的身体由帧逐个调 do()，被拒的每帧重试，最多 2 s，figure-frame.js:9-25, 40, 88）
               kit doGroup (769-786)：同一帧里按 模式词 → 手势 → 头部手势 → busy 词 → 表情 的顺序 doWord，
                 grouped 期间放宽 busy 检查（一组里先跳、再招手、再开心）
               kit doWord (748-766)：按 id 分派，不看 kind
                 neutral  → setExpr('neutral', .1)
                 walk/run → walkTo
                 opts.words[w].motion → pulse(a, own.seconds, true) + holdFace(own.face, …, 'arm')（589-596）
                 opts.words[w].expression → setExpr，时长用 own.seconds（732）
                     （5 个内置形象都没有传 opts.words）
                 KIT_MOTIONS → act；PLUS_MOTIONS 只在 plus && !face 时 → act → (plusAct)（760）
                      → setMode 改模式槽 / pulse 改手势槽或头部槽 / holdFace 记下动作自带的脸
                 KIT_/PLUS_EXPRESSIONS（含 23 个组合脸）→ setExpr → 表情槽（761-764）
                                     │
                                     ▼  每帧：动作自带的脸补位、被盖住的表情暂停（1173-1187）
                                        → faceName() 选脸 → render
               figure.draw(petG, face, frame{mode, gesture{kind,k}, head{kind,k}（仅 plus）, talk, sit, lie, kneel, away…})
                 （body.js:339, 1379）各形象自己画：Coo 环形 / 大肥鱼 / 三位娘的 armPlan、hideFront、kneelHead、partsOf

旁路（不查词表、不排队）：pet_walk_to → body.walk；dialog 选项卡片 motion → stepTalkMotion
→ body.walk / body.do('hop')；thinking / listening → body.set；cue / talk → body.cue / body.talk；
鼠标 → body.pointer；空闲 → decide() 和各模式计时器
```

### 5. 时长：`seconds` 和 `lasting` 实际起什么作用

- **`seconds` 是队列放行下一个条目前要等多久**（`pet-app.js:254`，`acts.js:35-36`），不是这个词的播放时长〔实测〕。
  - **单个词**：放行时间是 min(seconds, 该词的 `done`)。`done` 来自两处：
    - walk/run 结束（`body.js:514, 754`）；
    - plus 身体拒绝了这个词（`body.js:1700-1703`）。
  - **一组词**：
    - 放行时间是组里最长成员的 seconds。每个成员报 `done` 后就不再占着，全组都 done 就立刻放行（`acts.js:40-46`）。
    - plus 身体在 `doAll` 里拒绝的成员会马上报 `done`（`body.js:1707-1710`）。
    - 〔测试〕`pet-actions.test.js`「the queue holds a group until its longest member is over」
  - **`walk`/`run` 例外**：
    - seconds 是 12，但 `doWord` 发起的走路会走到屏幕另一侧（`body.js:750-755`），宽屏上可能超过 12 s。
    - 过了 seconds 以后，只要身体的 `layout.mode` 还是这个 walk/run，下一个条目就继续等；走完报 `done` 或模式变了就放行，最多等 90 s（`WALK_MAX`，`acts.js:14, 32`）。
    - 组里的 walk/run 成员也一样，例如 `walk+happy`。
    - 〔测试〕`tests/pet-actions.test.js`：2560 px 宽的舞台上从 x=100 走，`nod` 一直等到走完（超过 14 s）才放出。
  - **当前词表里没有的 id**（比如切换形象之后）：按 1 s 等待（`?? 1`，`pet-app.js:254`）。
- **表情在身体上保持多久**：
  - 一般 3.2 s，`sleepy` 4.4 s（`body.js:732`）。实测 happy 在 3.1–3.3 s 之间消失，sleepy 在 4.3–4.5 s 之间。
  - **（plus）主动要的表情遇到后面的动作**，会延长到至少盖过那个动作自带的脸（`holdFace`，`body.js:697-703`）。〔实测〕：
    - `【得意, 唱歌】`：得意从 0 s 一直显示到 5.0 s，唱歌的 4.1 s 都盖住了；
    - `【开心, 点头】`：开心显示满 3.2 s。v0.2.6 只显示 0.9 s，被点头清掉。
  - **（plus）被盖住时暂停**：被拎、甩出、晕、起身、倾听、睡着时，主动要的表情的倒计时停下，连续盖住超过 5 s 就丢掉（§二.1）。
  - **动作自带的表情**保持多久由 `holdFace` 决定。
- **`lasting` 只影响提示词表和工具回执**（`script.ts:229-233`，`world.ts:1432-1435`），页面和 kit 都不读它。
  - 姿态能一直保持，靠的是 kit 里的 `dur: 1e9`（`body.js:580, 582, 607-608`）〔代码〕。
  - 实测主动让她坐下、躺下、睡觉，60 s 后仍然保持〔实测〕。

### 6. kit 内部分派（`body.js`）

- **适用范围**：下面描述的分派只适用于建在 kit 上的形象。
  - 5 个内置形象都是 `plus: true` 的 kit 身体（`coo/figure.js:10`，`whale/figure.js:1501`，`claude-chan/figure.js:276` 等）。
  - 安装的第三方形象，其工厂可以返回自己的身体，`do(word)` 怎么实现都可以（`figure-frame.js:9-25, 94`）。
  - 不开 `plus` 的 kit 身体和上游 v0.1.17 逐帧一致。〔测试〕`pet-actions.test.js`「frames and faces are upstream's (v0.1.17)」：在 W = 1200/300/104 下，表情、手势、姿态、遮盖、戳和摸的帧都逐帧比对过。
- **`doWord`**（`748-766`）：
  - 接受形象通过 `opts.words` 自带的词（`335-338, 759, 761`）：
    - 自带动作：`pulse(a, own.seconds, true)` 加 `holdFace(own.face, …, 'arm')`（`589-596`）。
    - 自带表情：时长用 `own.seconds`（`732`）。
    - 内置形象都没有传 `opts.words`。
  - PLUS_MOTIONS 只在 `plus && !face` 时进入 `act`（`760`）。
  - 名字里带 `+` 的不是词，`doWord('happy+pout')` 返回 false。
- **`act(a)`**（`553-600`）的步骤：
  1. busy 时拒绝；在 `doGroup` 里（`grouped`）不拒绝（`554`）。
  2. plus：song 只在站着或坐着、没在听时能做（`558`）。
  3. 跪坐（plus，`561-562`）：
     - `kneel` 和头部手势（nod、shake、sigh）保持跪坐。
     - 形象声明了 `kneelArms` 时，手势（`ARM_GESTURES`，`251`）也保持跪坐。没有内置形象声明它。
     - 其他动作结束跪坐，回到普通坐姿。表情不是动作，不经过这里。
  4. **表情槽**（`566`）：
     - plus 身体上，主动要的、还在显示的表情保留，`petrify` 和 `sleep` 两种情况除外。
     - 其余情况，也就是不是主动要的脸、石化、要睡觉、不开 plus，表情槽清空。
  5. 按词改模式、起手势、记下自带表情（`plusAct`，`604-678`）。
- **`pulse(kind, dur)`**（`684-689`），plus：
  - `nod`、`shake`、`sigh` 进头部槽 `pet.head`，不碰手势槽，正在唱的歌也不停。
  - 其他手势进 `pet.pulse`，同时清掉 `own.arm`。躺着的小动作（kick/chin/thump）不清。
- **`holdFace(n, s, ch)`**（`697-703`）：
  - 每次调用都写明通道：sigh 是 `'head'`，dance 是 `'body'`，其余是 `'arm'`。〔测试〕源码里没有两个参数的 `holdFace(`。
  - plus 下：先记进 `pet.own[ch]`。如果主动要的表情正在显示，只把它的 `exprUntil` 延长到至少 `T + s`，不换脸。
  - `hips`/`cross` 原来「保留之前主动要的表情」的特例去掉了，现在所有动作都这样。
- **`setExpr(n, s, asked = true)`**（`709-741`）：
  - 特殊路由：`sleep` 转给 `act('sleep')`；`dragged` 变成一次抛出；`dizzy` 进入 dizzy 模式。后两种在 plus 下还会清掉所有动作自带的脸（`clearOwn`）。
  - 会把 `land` 打回 idle。`look` 只在非 plus 时打回（`721`）。
  - `petrify` 会让 walk/run/dance 停下，plus 下还会结束唱歌（`725-728`）。已经石化时再要石化会被忽略（`725`）。
  - plus 下 `neutral` 清掉动作自带的脸（`731`），之后不会再冒出来。
  - 设置 `expr/exprUntil`、`exprAsked = plus && asked`，并让 `exprN` 加一（`733`）；播放表情音，放出爱心或闪光（坏笑、跃跃欲试闪一下，`739`）。
  - 闲逛、戳、摸、cue 传 `asked = false`（`839, 1489, 1519, 1741-1743`）。直接调用 `setExpr` 的地方，比如渲染脚本和测试，默认算主动要的。
- **`doGroup(words)`**（`769-786`，plus）：
  - 先判断 busy：开头就 busy 时整组都拒绝。
  - 否则在同一帧里按 `groupRank` 的顺序逐个 `doWord`，期间 `grouped = true`：
    1. 模式词：stand sit kneel lie sleep walk run look dizzy dance；
    2. 手势；
    3. 头部手势；
    4. 会让她 busy 的词：jump hop flap roll cheer；
    5. 表情。
  - 排这个顺序的原因：
    - 模式词放在手势后面，会切掉 song、away、roll；
    - busy 词放在前面，站位手势里的 `setMode('idle')` 会取消起跳；
    - 表情放在最后，它是主动要的，盖过手势自带的脸。
  - `createBody` 的 `doAll`（`1705-1712`，只有 plus 身体有）对每个被拒绝的成员报 `done`。
- **busy 的条件**（`541`）：模式是 `drag`、`air` 或 `crouch`，或者正在翻滚（`roll`）。
  - 此时直接调用的 `act`、`setExpr`、`walkTo` 都会被拒绝；`doGroup` 里排在第一个之后的成员除外。
  - 页面队列在 `layout.busy` 时不放条目（`acts.js:30`；`layout.busy = busy()`，`body.js:1592`），所以队列里的词只是**推迟**，不会因为 busy 被丢掉〔实测〕。
  - `pet_walk_to` 不经过队列，busy 时这次行走不做，工具马上返回「没走：身体正忙」（见 §3）。
  - **鼠标输入不受 busy 限制**：
    - 翻滚时 `pet.mode` 仍是 `idle`。这时戳她，有 50% 概率 `setMode('crouch')`（`body.js:1520`），会清掉翻滚手势（`520`）。〔实测〕`v2/sp2.mjs`：6 个随机种子里有 5 个的翻滚以 `mode=crouch g=-` 结束。
    - crouch 或翻滚期间也能拎起她：`pointerDown` 只在 air 时拒绝（`body.js:1458`），而 `setMode('drag')` 会取消翻滚。
- **plus 身体做不了的词会立即回报 `done`**（`body.js:1700-1703`），例如躺着或睡觉时唱歌。

### 7. 每帧画哪张脸

**补位和暂停（plus，`step` 里 `1173-1187`，在选脸之前）**：
- 没有主动要的表情在显示时，取最近开始、还没到期的动作自带的脸（`topOwn`，`450`），三个通道都算，放进表情槽。
  - 例：招手后坐下，招手自带的 happy 一直显示到招手结束。
  - 例外：如果戳、摸这类自己给的脸是在那之后出现的，就先显示它。
- 被盖住时（`coverFace()` 不为 null）主动要的表情暂停：`exprUntil`、`exprAt` 跟着往后推，所以石化、紧张、温柔、偷笑这类按时间变化的脸能接着播。连续盖住超过 `COVER_MAX = 5` s（`261`）就丢掉。
- 石化的裂纹和碎石按 `exprN` 记，每次 `setExpr('petrify')` 只出一次（`1290`），暂停后不会重放。

**`coverFace()`（`805-815`）和 `faceName()`（`816-830`）**，优先级从高到低：

1. `drag` → dragged
2. 空中且 `airKind` 是 `'throw'` → dragged 或 surprised；`'drop'` → surprised（`808-809`）。
   - 跳类的空中不在这里改脸，显示 `expr` 里留着的脸。跳类包括 jump、hop、flap、cheer 和戳出的小跳（`airKind 'jump'`，`1010`）。
3. `dizzy` → dizzy，2.4 s 后变 squeeze
4. `wake` → surprised 或 waking
5. 正在听 → listening（睡觉时除外）
6. `sleep` → sleep
7. **表情槽 `expr`**（未过期）：
   - 主动要的表情（plus）：如果正在播一个「脸就是身体」的手势（`BODY_OWN`，`258`），返回组合名 `表情+嘴+动作脸`（`819-825`），否则就是这个表情。`BODY_OWN` 和组合名的读法见 §二.4。
   - 动作自带的脸，或自己给的脸。
8. 思考中 → thinking
9. sit 或 lie → content
10. run → run
11. neutral

1–6 是 `coverFace()`，被它们盖住的主动要的表情按上面的规则暂停。

### 8. 按形象过滤与兜底

- **第一道过滤在 World 端的词表**：
  - 当前形象词表里没有的词或组成员会被丢弃（`script.ts:121-130`）。pet_say 和 pet_act 会在回执里写明，dialog 写一条 warn 日志（见 §3）。
  - 三位娘的词表里没有 `spout`，代码里也不画。
- **画不画由形象决定**：
  - 列在 `figure.gestures` 里的手势由形象自己画，kit 不再加倾斜和前倾。头部手势见 `body.js:1107-1118`，手势见 `:1121-1125`。
  - 大肥鱼的列表：`whale/figure.js:1446`。
  - 三位娘的 `GESTURES`：`cc/figure.js:26`，不含 `spout`。
  - Coo 一个都不自己画，全靠 kit 的倾斜和挤压，再加上 `away:'hide'`、`roll:'spin'`（`coo/coo.js:423-437`）。
- **缺图时的兜底**〔代码〕：
  - 三位娘：先用 `POSE_ALT` 替代，再退到 `ARM_FALLBACK` 角度。没有 lie 图就坐着，没有 roll 图就整体旋转（`'spin'`），没有 back 图就转头（`cc/motion.js:247, 261-267`，`cc/figure.js:215-221, 257`）。
  - 大肥鱼：没有 roll 图就小跳（`whale/figure.js:1088`），没有 lie 图就坐着（`:404`）。
  - 组合脸的某个部位没有对应的贴图时，按那张脸单独出现时的兜底画。例如大肥鱼没有 smug、angry、sad、shy 的眼睛贴图。
  - 现有内置形象的姿态图都齐全，这些兜底只在贴图加载失败时才会触发。

### 9. 组合脸（plus）

- **来源**：
  - 表在 `body.js:211-236`（`PLUS_MIXES`）。由 `mixFace`（`283-299`）拼成 `PLUS_MIX_FACES`（`301-302`），并入 `PLUS_EXPRESSIONS`（`238`）。
  - 音色在 `PLUS_FACE_TONES`，同样抄进 `web/sound.js` 的 `EXPR_TONES`。都是已有的音色，所以导出包需要的音效没有变。
- **每张组合脸取用别的脸的部位**：
  - 眼（eyes、sparkle、视线、泪、腮红）取「眼」那张脸的；
  - 嘴（gap、ω、舌、puff、唱）取「嘴」那张脸的；
  - 眉、身体语言（lean、sag、titter、rock、shake）、符号（汗、怒气、感叹号、问号、黑线、思考），默认都跟眼那张脸；
  - `add` 只能设 `ADD_KEYS`（`276`），也就是每个形象都直接从脸对象读、不按名字查的字段。
- 石化从来不当部位用。
- 脸对象带上 `parts: {eyes, brows, mouth, body}`，供有画好的五官的形象按部位查表（§二.8）。

| id | 中文名 | 眼 | 嘴 | 其他 | 音色 |
|---|---|---|---|---|---|
| smirk | 坏笑 / 贼笑 | smug | happy | 闪 1 下光 | wink |
| sly | 俏皮 / 抛媚眼 | wink | coax（ω） | 腮红 .6 | wink |
| blissful | 美滋滋 / 满足 | gentle | coax | 腮红 .6 | soft |
| lol | 哈哈 / 笑出声 / 乐坏了 | flustered | happy | 身体、符号取 giggle，腮红 .7 | hehe |
| laughcry | 笑哭 / 笑出眼泪 | cry | happy | 眉取 happy，身体取 giggle | hehe |
| bashful | 腼腆 / 不好意思 | shy | happy | – | shy |
| flutter | 心动 / 小鹿乱撞 | love | shy | 腮红 1 | love |
| smitten | 花痴 / 看呆了 | love | surprised | – | love |
| wow | 哇 / 哇塞 / 惊喜 | excited | surprised | 感叹号 | sparkle |
| crave | 馋 / 眼馋 / 想吃 | excited | tongue | 身体取 coax（左右晃），腮红 .4 | sparkle |
| dreamy | 憧憬 / 向往 | excited | gentle | 身体取 gentle，望向右上 | sparkle |
| eager | 跃跃欲试 / 看我的 / 包在我身上 | determined | happy | 闪 1 下光 | pop |
| innocent | 无辜 / 不是我 | pleading | pout | – | shy |
| huff | 气鼓鼓 / 气呼呼 | angry | pout | 身体取 pout（三位娘抱臂），腮红 .6 | angry |
| frantic | 抓狂 / 崩溃 | flustered | angry | 身体、符号取 angry | angry |
| ragecry | 气哭 / 气哭了 | cry | angry | 眉、符号取 angry | sad |
| sulk | 瘪嘴 / 委屈巴巴 | sad | pout | – | sad |
| whimper | 哭唧唧 / 呜呜 | cry | pout | – | sad |
| brave | 强颜欢笑 / 强撑 | worried | gentle | – | wry |
| pained | 苦恼 / 头疼 / 头大 | bowing（闭眼） | worried | 眉取 sad，身体取 worried，冒汗 | hmm |
| doubt | 狐疑 / 怀疑 / 真的吗 | smug | confused | 问号 | hmm |
| blank | 懵 / 发愣 / 一脸懵 | confused | surprised | – | hmm |
| meh | 呵呵 / 皮笑肉不笑 | disgusted | awkward | 不要黑线 | wry |

- **怎么选出来的**：
  - 候选 32 个，看渲染图后去掉 9 个，它们和已有的脸太像，或在某个形象上读错：
    - shocked 震惊、dozy 迷糊、gotcha 得逞、holdback 强忍、proud 小得意；
    - sneer 不屑、sad-smile 苦中作乐、guilty 心虚；
    - grumpy 起床气：在大肥鱼上像眨眼。
  - 删减时去掉 `PLUS_MIXES` 的行和五个 `figure.json` 里对应的词即可。
- **Coo 的词表说明是另写的**。Coo 没有嘴，只用眼、符号、腮红、身体语言和环的缺口来表现，所以有几张组合脸在 Coo 上看起来和它的眼那张脸差不多。
- **内部的组合名** `眼+嘴` 和 `眼+嘴+身体`：
  - 由 `faceDef`（`430-444`）解析。部位也可以是包自带的表情（按它的 `like`）或者另一张组合脸；不认识的部位按 neutral 处理，不会抛错。
  - 这类名字只在两个地方用：§一.7 的叠加，以及渲染脚本里直接调用的 `setExpr`。
  - 它们不是词：`doWord` 拒绝，World 也不提供。
  - 两个表情写进同一组时，World 会拆成先后两个（§二.6）。
- 〔测试〕`pet-actions.test.js`「faces made of parts of others」；三位娘的 figure 测试和 `whale-pose.test.js` 都检查了每张组合脸用的是自己的哪张眼睛图、哪张嘴图。〔实测〕看过 `/tmp/combo/faces/final-*.png` 和 `vrend/sheet-<形象>.png`。

### 10. 头部通道（plus）

- **kit 侧**：
  - `HEAD_GESTURES = nod, shake, sigh`（`body.js:249`）在 `pet.head` 里播放，有自己的时钟，和 `pet.pulse` 里的手势互不顶替。
  - 帧里多一个 `head: {kind, k} | null`（`1375, 1382`），只有 plus 帧有。〔测试〕非 plus 帧没有 `head` 这个键。
  - 形象没把它列进 `figure.gestures` 时，由 kit 用前倾、侧倾、挤压表现（`1107-1118`）。sigh 的这几行从手势块挪到了这里。
  - `sighing` 脸按 `p.head` 计时（`179-180`）。
  - 有头部手势时：
    - 躺着不做小动作（`976`）；
    - `layout.moving` 为真（`1572-1573`）。
- **形象侧**：每个形象都有一组同样的辅助函数，在 claude `cc/motion.js:160-200`，gpt、gemini 的 motion.js 里同名，大肥鱼在 `whale/figure.js:218-258`。
  - `gesturesOf(o)` 把帧分成头部手势和手势。帧里没有 `head` 时（上游的 kit），从 `gesture` 里取 nod、shake、sigh，和 v0.2.6 一样。
  - `headMoves(h)` 用 v0.2.6 的公式，只是 k 换成头部自己的。
  - 趴着时，头也跟着叹气动（`lieHead`）。
- **跪坐的头（`kneelHead`）**：
  - 是挂在 `kneel` 下面的网格变形。用的是四个 `model.json` 里已有的 `poses.kneel.head` 框，没动美术管线。
  - 位置：`cc/motion.js:524-526, 979`，gpt `:561-563, 1042`，gemini `:610-612, 1113`，大肥鱼 `whale/figure.js:525-527, 1271`。
  - 动法：
    - 点头：头往下沉，头顶往下巴方向压扁；
    - 摇头：头横向滑动；
    - 叹气：吸气时头抬起，呼气时头往下沉。
  - 框的两侧和下沿不动，头发不会被撕开。
  - 幅度在 `KNEEL_HEAD`（shake 5、nod 2、squash .06、exh 2.5、inh 1.5）。
- **Coo**：没有代码改动，kit 的前倾和侧倾本来就带着头部通道。
- **看不见的情况**：背过身（`away`）时，三位娘和大肥鱼看不见点头，摇头只让后面的头发晃一晃。
- 〔测试〕三位娘各 5 个、`whale-pose.test.js` 5 个、`pet-actions.test.js` 2 个；〔实测〕渲染 `/tmp/combo/partb/r1-<形象>.png`、`k-*.png`。

---

## 二、可同时使用性

下面说的都是 plus 身体，也就是 5 个内置形象。不开 plus 的 kit 身体和上游 v0.1.17 一样：任何动作都清空表情，没有头部通道，没有跪坐，没有组。

### 1. 通道（槽）

**独占槽**：新来的会顶掉旧的。

| 槽 | 状态 | 由谁设置 | 结束方式 |
|---|---|---|---|
| 表情槽：主动要的 | `pet.expr`，`exprAsked = true`（`body.js:733`） | 词（`doWord`）、直接调用的 `setExpr` | 见表下「主动要的表情怎么结束」 |
| 表情槽：自己给的 | `pet.expr`，`exprAsked = false`，`exprOwn = false` | 闲逛 `decide`、戳、摸、cue（perk、cheer）、落地 | 到期；任何动作；新表情。被盖住时照样倒计时 |
| 动作自带的脸 | `pet.own.{arm, head, body}`（`{n, at, until}`） | `holdFace`（§一.6） | 到期；同一通道的新动作（躺着的小动作除外）；见表下「动作自带的脸还在什么时候清掉」 |
| 头部手势槽 | `pet.head` | nod、shake、sigh | `k ≥ 1`；新的头部手势 |
| 手势槽 | `pet.pulse`，同一时间只有一个（`684-689`） | 其余手势 | `k ≥ 1`；新手势直接覆盖；换模式会切掉 roll、song、away 和躺着时的小动作（`515-535`）；石化结束 song |
| 模式 / 姿态槽 | `pet.mode`（`506-539`） | 动作词、`walkTo`、`decide`、鼠标、落地 | 下一次 `setMode`；或各模式自己的计时器（`902-1064`） |
| 跪坐标志 | `pet.kneel` | `kneel` | 手或全身动作（`561-562`）；任何非 sit 模式（`525`）。表情、点头、摇头、叹气不结束它 |

**主动要的表情怎么结束**：
- 到期。被盖住时暂停，见下面的总规则 4。
- 新表情。
- `neutral`。
- `sleep`。
- 被拎起（`1474`）。
- 石化遇到任何动作都解除。

**动作自带的脸还在什么时候清掉**：
- 换模式切掉 roll、song、away 时（arm）；
- 模式变了（body，`527`）；
- 被拎、`dragged`、`dizzy`、`neutral`，三个通道都清（`clearOwn`）。

**独立叠加层**：不占上面的槽。

| 层 | 说明 |
|---|---|
| 说话口型 | `talkK` 叠在任何表情上（`1373`），石化时不动。组合脸说话时，眼睛还是组合脸的，嘴换成说话的嘴 |
| 思考 / 倾听标志 | 不占槽，但参与选脸优先级 |
| 视线 | 石化 > 锁视线的表情 > 表情的 `lookAt` > 模式 / 倾听（`1188-1191`）。表情不再打断张望，所以张望时表情的 `lookAt` 会盖过张望的视线 |
| 眨眼、犯困程度、挤压 / 倾斜 / 前倾 | 每帧重新计算，几个来源相加（`1192-1199`） |
| 特效粒子 | 放出后各自走完生命周期，不会被取消（`1309-1316`） |

**总规则**〔实测〕〔测试〕：

1. **表情活过动作**：
   - 主动要的表情不会被后面的动作清掉，`walkTo` 也不清（`566, 793`）。例外只有两个：石化（任何动作都解除）和睡觉。
   - 后面动作自带的脸记在 `own` 里，表情至少延长到它结束。所以「先表情后动作」时，表情会一直盖到动作做完。
   - 反过来，「先动作后表情」时，表情显示它自己的时长，到期后动作自带的脸接着显示到动作结束。
   - 自己给的脸（闲逛、戳、摸、cue）不算：下一个动作就换掉它们，也不会被延长。
2. **表情一般不打断动作**，例外有三个：
   - `petrify`：让走、跑、跳舞停下，并结束唱歌（`725-728`）；
   - `land`：被任何表情打断（`721`）；
   - `look`：不再被表情打断。
3. **手势分两个槽**：
   - 头（nod、shake、sigh）一个，手 / 身一个，各自同时只有一个。
   - 两个槽能同时播，比如点头 + 招手，或者唱歌时点头。
   - 都能跨过模式变化继续播放：`setMode` 只切掉 roll、song、away 和躺着时的小动作。
4. **被盖住的表情暂停**：
   - 被拎、甩出或放下的空中、晕、起身、倾听、睡着时，主动要的表情暂停倒计时（`1183-1186`）。
   - 盖住不超过 5 s，之后完整显示；连续超过 5 s 就丢掉。
5. **跪坐保持到手或全身动作**，表情和头部手势不结束它。
6. **一组词同一帧做**：World 先按部位把一组拆好（§二.6），页面把整组交给 `doAll`，kit 在同一帧里做完（`doGroup`）。

### 2. 词的分类与部位（共 95 个，数据来自 Coo 的 `figure.json`；部位见 `script.ts:84-104` 的 `CHANNELS`）

| 类 | 部位（`CHANNELS`） | 词 |
|---|---|---|
| **E 表情（51）** | 表情 | neutral 平静、happy 开心、wink 眨眼、love 喜欢、shy 害羞、surprised 惊讶、angry 生气、sad 难过、sleepy 犯困、thinking 思考、smug 得意、pout 嘟嘴、worried 担心、determined 认真、flustered 慌张、scared 害怕、excited 期待、cry 大哭、confused 疑惑、disgusted 嫌弃、nervous 紧张、gentle 温柔、awkward 尴尬、moved 感动、coax 撒娇、tongue 吐舌、giggle 偷笑；23 个组合脸（§一.9）；**petrify 石化**占全部部位，不和别的同时做 |
| **H 头部手势（3）** | 头 | nod 点头、shake 摇头、sigh 叹气 |
| **G 手势（18）**：不改模式 | 手 | wave 招手、shiver 发抖、heart 比心、serve 奉茶、salute 敬礼、vsign 比耶、point 指、cover 捂嘴笑、cross 抱臂、stretch 伸懒腰、pray 拜托、scratch 挠头、idea 有了、hug 抱抱、hips 叉腰、spout 喷水（仅 Coo/大肥鱼）、sip 喝茶、read 看书 |
| **GB 要她停下来做的手势（7）** | 手 + 站位（提示词里写「手(停下来做)」） | song 唱歌、spin 转圈、bow 鞠躬、flinch 后缩、peek 探头、away 背过身、cheer 欢呼（详见表下） |
| **turn 转身** | 站位（提示词里写「身」） | 只翻身，不调 `pulse()`（`body.js:576`） |
| **L 持续姿态（4）** | sit：身；kneel、lie：身 + 手；sleep：表情 + 头 + 手 + 身 | sit 坐下、kneel 跪坐、lie 趴下、sleep 睡觉 |
| **M 模式动作（11）** | 身 + 站位；dizzy 另占表情；flap 另占手；roll 另占手和头；curtsy 是手 + 站位 + 身 | stand 站起、walk 走走、run 跑、look 张望、dizzy 晕、dance 跳舞；**busy 类**：jump 跳、hop 小跳、flap 扑腾、roll 翻滚；curtsy 屈膝礼（回到 idle，并起自己的手势） |

GB 类在 kit 里的行为：
- spin、bow、flinch、peek、away：没坐着时先回到 idle。
- cheer：站着时进入 crouch/air。
- song：只在站着或坐着、没在听时能做。

包自带的表情占「表情」；包自带的动作占除表情以外的全部部位（`channelsOf`，`script.ts:106-108`）。

**部位表反映的是 kit 实际会拒绝或改变的东西**：
- 唱歌要她站着或坐着不动，所以和走、跳舞、张望、跳、小跳冲突（站位）。
- 屈膝礼会让她站起来（身）。
- 跪坐、趴下、睡觉时看不见手势（手）；而且手势会结束跪坐。
- 晕和睡觉时显示不了别的表情（表情）。

〔测试〕`pet-actions.test.js`「agrees with the World on what part of her each word takes」逐个核对 kit 的行为和这张表一致。

**动作自带的表情**（`holdFace`，`body.js:577-588, 610-674`），括号里是通道：

- wave/flap/cheer/roll/scratch/spout → happy（手）；dance → happy（身）
- heart → love
- bow/curtsy → bowing
- flinch → surprised
- peek → peeking
- away → pout
- song → singing
- serve/hug → gentle
- salute → saluting
- vsign → wink
- point → pointing
- cover → giggle
- stretch → stretching
- pray → pleading
- idea → excited
- sigh → sighing（头）
- sip → sipping
- read → reading
- hips → determined；cross → pout。不再是特例：和其他动作一样，主动要的表情在时它们让路。

其中 singing、sighing、reading、sipping、stretching、saluting、pointing、peeking、bowing、pleading 是 `BODY_OWN`（`body.js:258`）：这些脸本身带着手势的身体语言，叠加规则见 §一.7 和 §二.4。

**不带表情的动作**：stand、walk、run、jump、hop、look、turn、nod、shake、spin、sit、sleep、dizzy、shiver、kneel、lie。做完后脸回到模式默认（content、run 或 neutral）。

### 3. 表情 × 表情

| 情况 | 结果 | 依据 |
|---|---|---|
| 新表情 → 旧表情 | **替换**；连放同一个表情会重新计时 | 〔实测〕`body.js:732` |
| 同一组里两个表情（`开心+难过`） | World 拆成先后两个，回执里说明。想要「一个表情的眼 + 另一个的嘴」，用组合脸 | 〔测试〕`script.test.ts` |
| 正在石化时再要 petrify | **忽略** | 〔实测〕`:725` |
| neutral | 0.1 s 后清空表情，并清掉动作自带的脸（之后不再冒出来） | 〔测试〕`:731, 749` |
| 主动要的表情 vs 思考中 | 表情胜，thinking 被压住 | 〔实测〕`:819-826` |
| 主动要的表情 vs 正在听 | listening 胜；表情**暂停**。听了 3 s，之后开心还显示 2.7 s，加上之前的 0.5 s 正好 3.2 s；听了 7 s，表情被丢掉 | 〔实测〕`:812, 1183-1186` |
| 主动要的表情 vs 起身（wake） | 被盖住，暂停；起身最多 1.8 s，之后完整显示 | 〔实测〕 |
| 主动要的表情 vs 睡觉 | `act('sleep')` 会清掉已有的表情（`:566`）。睡着时再要的表情被盖住并暂停：5 s 内醒来，醒后接着显示；超过 5 s 就丢掉 | 〔实测〕`edge/t1.mjs` |
| 主动要的表情 vs 晕 | 被盖住，暂停。晕持续 3.0 s，不到 5 s，所以晕完后完整显示 3.2 s（〔实测〕：晕开始 0.1 s 时要的开心，在 2.9–6.1 s 显示）。v0.2.6 只剩 0.2–3.2 s 的尾巴 | 〔实测〕〔测试〕 |
| 主动要的表情 vs 被拎 / 空中 | 见表下 | 〔实测〕 |
| 主动要的表情 vs 坐 / 躺时的 content、跑的 run | 表情胜 | 〔实测〕 |
| 自己给的脸（闲逛、戳、摸、cue）vs 盖住 | 不暂停，照样倒计时 | 〔代码〕`:1183` |
| 说话口型 × 任何表情 | **共存**，嘴张开；石化时不动。组合脸说话时眼睛不变，嘴换成说话的嘴 | 〔实测〕`:1373`；`edge/t3.mjs` |

**主动要的表情 vs 被拎 / 空中**
- drag、air、crouch 期间，单独调用的 `setExpr` 被拒绝（busy，`:711`；doWord `:761`），队列里的表情在页面队列里等。
- 拎起时会清掉正在显示的表情和动作自带的脸（`:1474-1475`），所以底下没有在倒计时的表情。
- 跳类空中（jump、hop、flap、cheer、戳出的小跳）显示 `expr` 里留着的脸，可能是动作自带的、戳出来的，或同一组里的表情（如 `hop+happy`）。
- 只有 throw/drop 的空中显示 dragged 或 surprised（`:808-809`）。

### 4. 表情 × 动作

**先有表情，再来动作：**

| 新动作 | 已有表情的结果 | 依据 |
|---|---|---|
| G、H、GB、L（sleep 除外）、M、walk、`pet_walk_to` | **保留**，并延长到至少盖过新动作自带的脸。`BODY_OWN` 手势见下一行 | 〔实测〕〔测试〕`:566, 700, 793` |
| `BODY_OWN` 手势（song、sigh、read、sip、stretch、salute、point、peek、bow、pray） | 脸变成组合 `表情+嘴+动作脸`，见表下 | 〔实测〕〔测试〕`:819-825` |
| `hips` / `cross` | 同上一行，不再是特例 | 〔测试〕 |
| sleep | **清空** | 〔测试〕`:566` |
| 任何动作，先前是 petrify | 立刻解除石化 | 〔实测〕`:566` |
| 被拎起 | 清空表情和动作自带的脸 | 〔测试〕`:1474-1475` |

**`BODY_OWN` 手势的组合脸**
- 眼、眉、符号用主动要的表情的。
- 身体语言用手势的：三位娘唱歌时的祈祷手、抬下巴、节拍，大肥鱼的鳍。
- song 和 sigh 连嘴也用手势的。
- 例：
  - `angry` 后唱歌 → `angry+singing+singing`；
  - `angry` 后看书 → `angry+angry+reading`；
  - 组合脸后唱歌 → 组合脸的眼睛加上唱歌的身体，比如 `smirk+singing+singing`。

〔实测〕先得意后唱歌：0–0.9 s 是 smug，0.9–5.0 s 是 `smug+singing+singing`。

**先有动作，再来表情：**

| 正在进行的动作 | 结果 | 依据 |
|---|---|---|
| G / H / GB 手势 | **手势继续**。新表情盖过手势自带的脸，`BODY_OWN` 手势显示组合脸；表情到期后，手势自带的脸接着显示到手势结束。〔实测〕`read+huff`：0–3.2 s 是 `huff+huff+reading`，3.2–4.4 s 是 reading | 〔实测〕〔测试〕 |
| sit / kneel / lie | **姿态保持**，表情显示；跪坐也保持 | 〔实测〕 |
| sleep | 姿态保持，表情**看不见**，暂停，5 s 后丢掉 | 〔实测〕 |
| walk / run / dance | **继续**；dance 自带的 happy 被盖过；petrify 会让它们停下 | 〔实测〕`:727` |
| look | **继续**（v0.2.6 会被打断）；表情有 `lookAt` 时视线跟表情 | 〔测试〕`:721` |
| land | **被打断**，回到 idle | 〔代码〕`:721` |
| dizzy | 晕继续，表情被盖住，暂停，晕完完整显示 | 〔实测〕 |
| jump/hop/flap/cheer 在空中、roll、被拎 | 单独调用被**拒绝**；队列里的表情等 busy 结束后再放。和它们写在同一组里的表情在同一帧接受 | 〔实测〕`:541`；`acts.js:30` |
| song + petrify | 唱歌结束，脸变成石化 | 〔测试〕`:728` |
| 手势自带的脸的 0.1 s 尾巴 | 见表下 | 〔实测：sigh tail〕〔代码〕`:179-195` |
| shiver + angry/scared | angry 和 scared 一直带 `shake:true`（`:61, 85`），始终压过 shiver 的颤抖 | 〔代码〕`:1356-1357` |
| shiver + nervous/petrify | 只是间歇地压过：nervous 每 1.7 s 里只抖 0.3 s（`:141`），petrify 只在 1.1–1.35 s 之间抖（`:170`）。其余时间 shake 为 0，用的是 shiver 的颤抖 | 〔代码〕`:1356-1357` |

**手势自带的脸的 0.1 s 尾巴**
- `holdFace` 比 `pulse` 多出 0.1 s：sigh 2.1 vs 2.0，salute 1.9 vs 1.8，song 4.1 vs 4（`:647, 650, 668`）。
- 这 0.1 s 里：
  - sighing 退回普通脸；
  - saluting 退回它的 wink 脸；
  - singing 保留闭眼唱歌脸，但嘴不动（`:186-189`）。
- 有主动要的表情时，看不到这条尾巴。

### 5. 动作 × 动作（行 = 正在进行，列 = 新来）

| 正在 ↓ \ 新来 → | H | G | GB | L | stand/walk/run/look/dizzy/dance/jump/hop | flap/roll/curtsy |
|---|---|---|---|---|---|---|
| **H**（点头、摇头、叹气） | 替换 | **共存**（各在各的槽） | 共存 | 共存 | 共存 | 共存 |
| **G** | **共存**；song 不停 | 替换 | 见表下 G 行 | 见表下 G 行 | 见表下 G 行 | 替换 |
| **GB** | 共存 | 替换 | 替换；turn 例外：只翻身，正在播的手势继续（`:576`） | 共存；away → lie 例外：背身结束，正面趴下（`:523`） | 共存；但 away 会结束，见表下 | 替换 |
| **sit / lie / sleep** | **共存**（躺着时由 `lieHead` 画） | **共存**（姿态不变，睡着也照做；song 在 lie/sleep 下被拒绝） | 共存（保持坐姿）；lie → away 只出 pout，不转身（见 §7） | 替换 | 姿态结束（stand 进入 wake） | 姿态结束 |
| **kneel** | **跪坐保持**，头在跪坐画上动（`kneelHead`） | 跪坐结束，变成普通坐姿后做手势 | 同左 | 替换（kneel → kneel 保持） | 结束 | 结束 |
| **walk/run/dance/look/dizzy** | 共存 | **共存**（song 被拒绝） | 被打断：回到 idle；cheer 则进入小跳（crouch/air，`:612`） | 替换 | 替换 | 替换 |
| **jump/hop/flap/roll、站着的 cheer**（busy） | 队列里的词等 busy 结束；单独调用被拒绝；同一组里的词同一帧接受 | 同左 | 同左 | 同左 | 同左 | 同左 |
| **curtsy** | 共存 | 替换 | 替换；turn 例外，屈膝礼继续 | 共存 | 共存 | 替换 |

**G 行的细节**
- 新来 GB：替换。turn 例外，只翻身，手势继续。
- 新来 L：共存，手势带进姿态。song 遇 lie/sleep 结束。
- 新来 stand/walk 等：共存。song 遇这些模式会结束。只有她本来就站着时，stand 不结束 song；从坐、跪、躺起身要经过 wake，song 也结束（`:521, 570`）。

**GB 行新来 stand/walk 等的细节**：away 会结束。只有她本来就站着时，stand 不结束 away；从坐着起身要经过 wake，away 也被切掉（`:523, 570`）。

busy 那一行补充：鼠标输入仍然生效。翻滚中戳她，可能把翻滚切成一次小跳（`:1520, 520`）；在 crouch 或翻滚中拎起她，会进入 drag（`:1458`）。

**依据**：
- 除 H 行和 H 列以外的部分，都是 v0.2.4 上的〔实测〕，依据 `body.js:506-541, 553-600, 604-678, 684-689`。turn 例外和 stand 经 wake 的情况，由 `v2/sp2.mjs`、`v2/sp3.mjs` 复测过。
- H 行、H 列，以及 kneel 遇到头部手势的那一格，是组合扩展加的，由测试和 `/tmp/combo/edge/` 复测：
  - 〔测试〕`pet-actions.test.js`「a nod, a shake or a sigh plays in the head…」「kneeling lasts through faces and head gestures…」；
  - 〔实测〕`kneel → nod → wave`：点头时仍跪坐，招手时变普通坐姿。
- kit 层面能共存，不代表形象画得出来，见 §8。

### 6. 经 LLM 下指令时，实际能「同时」出现的组合

**一组同时做（`a+b`）**〔测试〕`script.test.ts`「words at once」、`world.test.ts`；〔实测〕`edge/t1.mjs`、`/tmp/combo/vind-ours-*.log`：

- **写法**：
  - 在 `【】`、`<>`、`pet_act` 的每一项、dialog 的 `actions` 里，用 `+` 或全角 `＋` 连起来。`+` 两边可以有空格。
  - `【】` 里的逗号、顿号、空白仍然表示先后。
- **部位**：一组里表情、头、手、身（含站位）各最多一个，所以一组最多 5 个成员，body-host 的 8 个上限碰不到。
- **能成组的例子**：`【坐下+开心+招手】`、`<点头+眨眼>`、`【点头+招手】`、`【摇头+抱臂】`、`【坐下+点头+比心】`、`【跪坐+点头+开心】`、`【唱歌+坏笑】`、`【坐下+唱歌】`、`【走走+开心】`、`【小跳+招手+开心】`、`【张望+疑惑】`。
- **拆组**：同一部位的、或一起做不出来的，从冲突的那个成员起拆成下一组，按先后做。
  - 回执的 `[执行参数]` 行会写，例如「招手 和 比心 不能同时做，改成先后做。」。
  - 会被拆开的例子：
    - 两个手势、两个表情、点头 + 摇头；
    - `走走+唱歌`（站位）、`坐下+屈膝礼`（身）；
    - `跪坐+招手`、`趴下+招手`（手）；
    - `晕+开心`、`睡觉+开心`（表情）；
    - 石化 + 任何词。
  - 不认识的成员丢掉并列出，其余照做；`开心+` 这样的空成员忽略；重复的成员只算一次。
- **线上格式**：仍然是 `string[]`，一组是成员 id 用 `+` 连起来。
  - World 排成 身/站位 → 手 → 头 → 表情（`rankOf`，`script.ts:110`）。
  - kit 自己再按 `groupRank` 排一遍（§一.6）。
- **名字里带 `+` 的词**：先整个查，所以单独用没问题，但不能做一个更大的组的成员。
- **队列时长**：一组占着队列，直到最长的成员结束，或者每个成员都报了 `done`。组里有 walk 时，等她走完。
- **已知的不足**：一组里表情是最后做的，只持续它自己的 3.2 s。和长手势同组时，最后一段会换回手势自带的脸〔实测〕：

| 手势 | 时长 | 最后显示手势自带的脸 |
|---|---|---|
| song | 4 s | 约 0.8 s |
| read | 4.4 s | 约 1.2 s |
| sip | 3.6 s | 约 0.4 s |

  例如 `【唱歌+坏笑】`：0–3.2 s 是 `smirk+singing+singing`，3.2–4.1 s 是 singing。写成先后（`【坏笑, 唱歌】`）时，表情会一直盖到手势结束。要改的话，可以在 `doGroup` 里把表情延长到盖过同组的手势。这是设计取舍，暂时没改。

**先后做（逗号，或分开的标记）**：页面队列按 `seconds` 一个接一个放词，手势的 `seconds` 正好是手势时长 + 0.1。

- **表情在前、动作在后：现在能重叠**。动作不再清掉主动要的表情。〔实测〕：
  - `【开心, 点头】`：开心显示满 3.2 s，期间点头。v0.2.6 只显示 0.9 s。
  - `【得意, 唱歌】`：得意一直盖到唱完，唱歌时是组合脸。
  - `【生气, 叉腰】`：和 v0.2.6 一样，生气保持。这已经不是特例了。
- **动作在前、表情在后：仍然基本不重叠**。
  - `【招手, 开心】`：开心在招手开始后 1.7 s 出现（招手的 seconds），这时 1.6 s 的招手已经结束。
  - `jump → happy`：happy 在 jump 放出后 1.2 s 出现。她在约 1.12 s 时已经进入 land，所以 happy 在落地后约 0.2–0.4 s 出现。
  - 想让它们重叠，就写成一组。
- **sit / lie / sleep + 后面的表情或手势**：例如 `【坐下, 开心, 招手】`。
- **kneel + 后面的表情、点头、摇头、叹气**：跪坐保持（v0.2.6 遇点头就结束）。手势仍然结束跪坐，变成普通坐姿。
- **从坐着站起，紧接着的下一个词落在 wake 期间**：stand 的 seconds 是 1.2（5 个 figure.json 都是），但从坐姿站起要经过 1.8 s 的 wake（`body.js:984-994`）。于是：
  - G 手势和起身重叠，但手势自带的脸被 waking 盖住；
  - 主动要的表情在 wake 期间暂停，起身后完整显示；
  - GB 词或 curtsy 会立刻把 wake 切回 idle。
  - 〔实测〕`v2/sp2.mjs` `sit>stand>wave/happy/bow/nod`。
- **头部手势和手势写成先后**：仍然基本不重叠，因为 seconds 比手势时长多 0.1 s，后一个放出时前一个已经播完。要一起做就写成一组，两个槽各播各的。
- **动作 + 它自带的表情**。
- **walk/run**：队列里的 walk/run **不**和后面的条目重叠。走得超过 12 s 时，后面的条目等她走完，最多 90 s（§一.5）。
- **任何词 + 说话口型、思考、倾听**：这些标志不进队列。
- **`pet_walk_to` + 队列里的词**：
  - 走路由它驱动，不进队列，走路时主动要的表情保留。
  - 但只有手势、头部手势和表情能叠在上面。会改模式的词（L/M/GB）会在半路打断这次行走（`setMode` → interrupted，`body.js:509-512`）。
- **不进队列的脸 + 队列里的手势**：
  - cue 的脸（perk → surprised 0.5 s，cheer → happy；`body.js:1740-1743`，`pet-app.js:415, 644, 659`），以及戳、摸出来的脸，都绕过队列。
  - 它们会和正在播的手势重叠，并替换手势自带的脸，也会打断 land。plus 下不再打断 look。
  - 它们不算主动要的，下一个动作就换掉它们。

还有一点：`pet_act` 到达就立即入队，而 `pet_say` 的标记要等气泡轮到才入队，所以后发的 `pet_act` 可能比前面那句话里的标记先执行〔代码〕`pet-app.js:197, 203`。

### 7. 特殊情况

| 情况 | 规则 | 依据 |
|---|---|---|
| **drag 被拎** | 见表下 | 〔实测〕`1472-1480`；〔代码〕`789`，`figure-frame.js:100`，`world.ts:739`；〔测试〕`world.test.ts`、`pet-actions.test.js` |
| **air 空中** | 见表下 | 〔实测〕`711, 1321-1331` |
| **dizzy 晕** | 不算 busy；手势、头部手势叠加；GB、M、L、`pet_walk_to` 会提前结束它；主动要的表情被盖住、暂停，晕完完整显示（§3） | 〔实测〕`1035-1042` |
| **roll 翻滚** | 见表下 | 〔实测〕`541, 520, 635, 1458, 1520`；`v2/sp2.mjs` |
| **away 背过身** | 见表下 | 〔实测〕`523, 570, 629` |
| **lie 趴下** | 每 4–8 s 自己做一个小动作（kick/chin/thump），新手势或正在播的头部手势会顶掉或推迟它（`976`）；song 被拒绝；表情在 kit 里保留，但三位娘和大肥鱼只画趴姿的笑、闭眼、说话贴片；头部手势和叹气由 `lieHead` 画；三位娘和大肥鱼趴着时手臂看不见 | 〔实测〕`973-977, 558`；〔代码〕`cc/motion.js:952, 986` |
| **kneel 跪坐** | 保持到下一个手或全身动作。表情、点头、摇头、叹气都不结束它，头部手势由 `kneelHead` 画；一组 `kneel+nod+happy` 30 s 后仍是跪坐；没有形象声明 `kneelArms`。跪坐图上不画实时的脸，只有贴片 | 〔实测〕`edge/t1.mjs`；〔测试〕`561-562` |
| **sit 坐下** | 表情、手势、头部手势、GB 都能叠加，仍保持坐姿；空闲逻辑不会让主动要的坐姿超时；站起来时主动要的表情在 wake 期间暂停 | 〔实测〕`580, 957` |
| **sleep 睡觉** | 见表下 | 〔实测〕`582, 710, 566` |
| **dance 跳舞** | 3.2 s；手势、头部手势叠加；主动要的表情盖过跳舞自带的 happy，跳舞继续；GB、L、M 打断；petrify 让它停下 | 〔实测〕`588, 727` |
| **walk/run 走 / 跑** | 见表下 | 〔实测〕`509-514, 788-797, 1633`；〔测试〕`tests/pet-actions.test.js`、`world.test.ts` |
| **talk 说话** | 口型叠在任何表情、手势、姿态上；组合脸说话时眼睛不变、嘴换成说话的嘴；石化时不动；趴着或跪坐时只剩 talk 小贴片（大肥鱼和三位娘） | 〔实测〕kit 部分、`edge/t3.mjs`；〔代码〕形象部分 |
| **listening 倾听** | 盖住表情，主动要的表情暂停，超过 5 s 丢掉；结束 song，并拒绝新的 song；停下走路；阻止空闲时的 decide；招手不受影响 | 〔实测〕 |
| **petrify 石化** | 替换表情；任何动作都解除；不会被保留、叠加或当部位用；在组里不和别的词同时做；结束 song；裂纹和碎石每次只出一次 | 〔测试〕`725-728, 1290` |
| **戳 / 摸** | 见表下 | 〔实测〕`1483-1522` |

**drag 被拎**
- 单独调用的表情、手势、坐、走都被拒绝，队列里的词等着。`doGroup` 开头就 busy 时整组拒绝。
- 清空表情和动作自带的脸，显示 dragged。
- 手势和头部手势继续，但 roll、song、away 被切掉。
- 跪坐结束。
- 这期间的 `pet_walk_to` 不走，工具马上返回「没走：身体正忙」。

**air 空中**
- 单独调用的表情和手势被拒绝，队列里的词等落地。同一组里的词在起跳那一帧一起接受，所以 `hop+happy` 在空中就是开心的脸。
- 用鼠标松手，不管是甩出去还是轻轻放下，都把 `airKind` 设成 `'throw'`（`1505`）。落地后显示 surprised 0.9 s；用力甩时（冲击 > 1000）进入 dizzy（`1327-1329`）。
- happy 1.6 s 只出现在 `airKind 'drop'` 之后：入场掉落（`478`），和跨显示器的 dropAt（`1538`，`pet-app.js:1163`）。落地给的脸不算主动要的。
- `pet_walk_to` 同 drag，马上返回「没走」。

**roll 翻滚**
- busy：队列里的词等，单独调用被拒绝；同一组里的表情同一帧接受。
- 会让她站起来；换模式时被切掉，它自带的 happy 也一起清掉。
- 主动要的表情盖过它自带的 happy。
- 鼠标仍然生效：
  - 翻滚中 `pet.mode` 仍是 idle，戳一下有 50% 概率进入 crouch 并切掉翻滚（实测 6 个种子里有 5 个以 `mode=crouch g=-` 结束）；
  - 拎起进入 drag，也会取消翻滚。
- `pet_walk_to` 马上返回「没走」。

**away 背过身**
- 主动要的表情保留，背身自带的 pout 让路。
- 在 idle/sit/sleep 下保持（坐着转身后再睡，背仍然朝外）；遇 jump/hop/look/dizzy/walk/run/dance/lie 结束。在坐、跪、躺的状态下，stand 要经过 wake，也会结束 away。
- 只出 pout、不转身的条件：`pet.prone && lieSet()` 且不在 wake（`629`），并且形象有 lie 图。
  - 也就是正在趴着，或者从趴着进入睡觉（趴着睡，`582`）。〔实测〕`lie>sleep>away` 得到 g=-、expr=pout。
  - 形象没有 lie 图时（`poses.lie` 为 false，三位娘 `figure.js:257/259`；kit `lieSet`，`455`），lie 其实是坐着，away 照常转身。
- 背过身时，三位娘和大肥鱼看不见点头。

**sleep 睡觉**
- 手势照做，但脸始终是 sleep。
- `act('sleep')` 清掉主动要的表情。睡着后再要的表情看不见，暂停，5 s 后丢掉。
- `setExpr('sleep')` 走 `act('sleep')`。
- 在 lie 中要求睡觉，就趴着睡。

**walk/run 走 / 跑**
- 手势、头部手势叠加。
- GB、L、M 打断，并回报 interrupted/done。
- 倾听开始时停下。
- `walkTo` 会让坐、跪、趴着的她先醒来，主动要的表情跟着走（`793`）。
- 队列里的 walk/run 走得超过 12 s 时，下一个条目等她走完，最多 90 s（`acts.js:32`）。
- `pet_walk_to` 遇到 busy 时马上返回「没走：身体正忙」（见 §一.3）；它发起的走路会被队列里会改模式的词在半路打断。

**戳 / 摸**：都不算主动要的表情，下一个动作就换掉。
- 戳：
  - 随机换一个表情；
  - 只在 idle 时有 50% 概率小跳（`1520`）。翻滚中也算 idle，所以可能把翻滚切掉；
  - 戳出的脸会结束 land。plus 下不结束 look；
  - 坐、躺、睡时戳会把她惊醒（`1511-1515`）；
  - wake 中戳出的表情被 surprised/waking 盖住；
  - 晕时没有反应。
- 摸：只在 idle、look、sit、lie、sleep 下有效（`1483`），出 love 或 shy，睡着时冒心。

### 8. 各形象的差异（都发生在 kit 允许同时进行之后，只决定画不画得出来）〔代码〕

**共同的**
- **头部通道**：四个画 rig 的形象都用 `gesturesOf`、`headMoves` 读头部手势，有自己的 k（§一.10）。所以招手时点头、唱歌时点头、坐着比心时点头都画得出来。
- **组合脸**：
  - 三位娘和大肥鱼用 `partsOf(fc, name)`（`cc/motion.js:160-163`，`whale/figure.js:218-221`）按部位查表：
    - 眼睛贴片、`HALF_LID`、`WINKS` 用 eyes；
    - 嘴用 mouth；
    - 眉 `BROW` 用 brows；
    - 身体表（`MOOD`、`FACE_ARMS`、`HEAD_PITCH`、饰物、鳍、尾巴、呆毛、踢脚）用 body。
  - 「石化不说话」这类判断仍看整个脸名。
  - 帧里没有 `parts` 时（上游 kit），每个部位都按脸名查。

**Coo**

- 没有手臂。所有手势都由 kit 用倾斜和挤压表现，只有 sip/read 会画小杯子和小书（`coo/coo.js:302-331`）。头部手势也是倾斜和前倾，和手势叠加。
- 什么都不遮：趴下时整张脸照画；跪坐就是坐。
- away 让脸淡出（`coo.js:194-197`）；roll 是整体旋转。
- 说话时直接加宽环的缺口，保留表情原来的嘴形。
- 组合脸只看得出眼睛、符号、腮红、身体语言和环的缺口，所以有几张和它的眼那张脸差不多。
- 石化时每帧仍然重画，kit 的手势在「石头」上照样动（`coo.js:285-298`）。

**大肥鱼**

- 手臂角度按源码顺序叠加，后写的赢（`whale/figure.js:1028-1192`）。
- 只有 thinking 会摆托腮姿势；遇到占用远侧手臂的手势会很快放下（`:71, 934-935`）。
- `nervous` 的僵硬手臂写在 dance 之后、各手势之前（`:1041`）：
  - 它压过走路、被拎、空中、坐着和跳舞的手臂；
  - 但手势从它出发，手臂图照常接手，wave、cheer、stretch、scratch、point 在 nervous 时都画得出来。
  - 〔测试〕`tests/whale-pose.test.js`
- `coax` 只在没有手势时压手臂角度（`!g`，`:1062`），手势照常。
- 说话时保留 coax 的 ω 嘴。
- 坐着时 `backable()` 为 false，改成转头（`:534`）。
- 趴下、跪坐、翻滚和背面时隐藏正面（`:1277-1297`）。
- 跪坐时头部手势用 `kneelHead`（`:525-527, 1271`）。
- 组合脸由 `paintFace` 按部位画眼睛和嘴。她没有 smug、angry、sad、shy 的眼睛图，所以 smirk、eager、huff、doubt 在她身上最弱。

**Claude 娘**

- 手臂由 `armPlan`（`cc/motion.js:275-295`）决定。手臂类手势（`ARM_ONE`/`ARM_BOTH`，`:230-235`）在播放期间以及结束后 0.4 s 内，都会压住表情带来的手臂姿势（`FACE_ARMS`，`:237-240`）。头部手势不进 `armPlan`，不压手臂。
- 表情要摆手臂，需要两个条件：处在平静模式（idle/look/sit/sleep/wake），并且表情持续超过 0.3 s。组合脸按 body 部位摆手臂，比如 huff 抱臂；唱歌叠加时是祈祷手。
- **抱书**：
  - 空闲时抱着书；
  - 单手手势时，另一只手用 `bookside` 夹着书；
  - 双手手势或表情姿势时，书不见；
  - 没有跪坐图时，把书放下（`:287, 293`）。
- 被拎或晕时双臂下垂，任何姿势都不显示（`:278`）。

**GPT 娘、Gemini 娘**

- 规则与 Claude 娘相同（`armPlan` 在 gpt 的 `:272`、gemini 的 `:274`），但没有书：空闲时双臂下垂，单手手势时另一只手是 `hangR`；`POSE_ALT` 用笔记本代替书。

**三位娘的共同点**

- 在 `hideFront` 时（`cc/motion.js:986`；gpt `:1049`；gemini `:1120`），整个站立身体和所有手臂图都跳过，脸也不重绘。
  - 触发条件：趴下、跪坐、翻滚成球（翻滚进度 0.165–0.835）和背面。
  - 这时手臂手势在 kit 里照常运行，但**看不见**。
  - 脸只剩三张小贴片：shut、smile、talk（`:58-79`），嘴的贴片按 mouth 部位选。
  - 跪坐时头部手势由 `kneelHead` 画在跪坐图上（`cc/motion.js:524-526, 979`）。
- 汗滴、怒气、问号这类特效照样画（`cc/figure.js:201-212`）。
- 背面只在站着时出现；坐着时改成转头（`cc/motion.js:707-710`）。
- 说话会覆盖表情的嘴（ω、吐舌、叹气、唱歌），组合脸也一样，眼睛不变；surprised 保留自己张开的嘴（`cc/face.js:90-116`）。
- 石化时冻结在最后一帧，期间的手势和说话都看不见（`cc/figure.js:174-181`）。
- 没有 `spout`：词表和 `GESTURES` 里都没有，`figure.js`、`face.js`、`motion.js`、`fx.js` 里也没有相关代码。kit 读 spout 锚点时有兜底（`A.spout ?? …`，`l.spout || …`），所以不需要占位。〔测试〕`tests/{claude,gpt,gemini}-figure.test.js`

**导出到上游的包**
- 大肥鱼和三位娘的导出包自带 kit 和形象代码，所以在上游 v0.1.17 里也有组合脸、头部通道和这套表情规则。
- 上游的 World 没有组，词一个一个到；`a+b` 在那里是不认识的词，会被丢掉并报告。
- 〔实测〕用上游的验证脚本把整张词表逐个跑过：
  - 大肥鱼 95 个词，三位娘各 94 个；
  - 23 个组合脸都画得出来，没有控制台错误；
  - 跪坐时点头、摇头、开心、叹气都保持跪坐。
  - 日志在 `/tmp/combo/vind-<形象>.log`。
- 〔测试〕`tests/*-pack-export.test.js`

### 9. 不一致：已修复的和仍然存在的

**v0.2.6 已修复**（编号沿用 v0.2.5 时本节的编号）

| # | 原来的问题 | v0.2.6 的做法 |
|---|---|---|
| 1 | 「保持到下一个动作」的说法不准确 | 词表和 `pet_act` 回执改用 `lastingNote`：sit/lie/sleep 写明做手势、换表情不影响；kneel 当时写明点头也算。组合扩展后改成头部手势不算（`script.ts:229-233`） |
| 4 | 没有文字的 beat 里的 `<词>` 被悄悄丢掉 | 并进这个 beat 的 `actions`，跟着 beat 开始（`script.ts:189-193`）；页面兜底（`pet-app.js:327-331`） |
| 5 | dialog 不报告不认识的词 | 写 warn 日志，handle 多了 `dropped`（`world.ts:827, 143`） |
| 6 | `pet_walk_to` 在 busy 时被丢掉、等 30 s 才返回 | 原来的判断有误：帧报的 `interrupted (busy)` 本来就马上转给了 World，只是回执写成「换成了别的动作(busy)」。现在写「没走：身体正忙……」和「没走：桌宠的身体还没准备好」（`world.ts:739-740`） |
| 7 | walk/run 的 seconds = 12 比实际走路短，下一个词在途中放出 | 队列等她走完（`done` 或模式变了），最多 90 s（`acts.js:14, 32`） |
| 8 | 大肥鱼 `nervous` 压住 wave、cheer、stretch、scratch、point 的手臂图 | nervous 那行移到手势之前（`whale/figure.js:1041`） |
| 9 | 三位娘有画 `spout` 的残留代码，词表里却没有 | 删掉三位娘 `figure.js`、`motion.js` 里的残留代码 |

**组合扩展解决的**

| 原来的问题 | 现在的做法 |
|---|---|
| 任何动作（连点头）都清掉表情：`【开心, 点头】` 开心只显示 0.9 s | 主动要的表情活过动作，石化和睡觉除外（§二.1 规则 1） |
| 被盖住的表情照样倒计时（v0.2.6「仍然存在」第 2 条） | 暂停，盖住超过 5 s 才丢掉 |
| 点头、摇头、叹气和手势不能同时：新手势顶掉旧手势 | 头部通道（§一.10） |
| 跪坐遇到点头就结束 | 跪坐保持到手或全身动作，头在跪坐图上动 |
| 没有办法让几个词同时做 | `a+b` 组，按部位拆分，回执说明 |
| 表情打断张望，`张望+疑惑` 做不出来 | plus 下表情不再打断 look |
| 唱歌时要的表情会去掉祈祷手、节拍和唱歌的嘴 | `BODY_OWN` 叠加成组合脸 |
| 石化不结束唱歌 | 石化结束唱歌 |
| `hips`/`cross` 是唯一保留表情的动作 | 不再是特例 |
| 只有 28 种表情，一眼一嘴的组合做不出来 | 23 个组合脸 |

**仍然存在**

1. **busy 时的竞态**（原第 2 条）：
   - 页面在 `layout.busy` 时不放条目（`acts.js:30`），所以正常情况下队列里的词不会撞上 busy。
   - 只有页面拿到的 layout 晚了一帧时（`body-host.js:166`）才会撞上：
     - `neutral` 返回 true 但什么都不做，页面空等 0.9 s；
     - 其他被拒绝的词会回报 `done`，然后被丢掉（`body.js:1700-1703`）；
     - 一组词会在 `doGroup` 开头整组被拒（`:778`）。
   - 〔代码；原实测是直接调用 doWord，页面不会这样调〕
   - 这是 kit 的行为，改它会动到非 plus 的帧，所以没改。
2. **`pet_walk_to` 的 30 s 超时可能比走路短**：
   - 走路最快 78 px/s（`body.js:917`），在 2560 px 宽的屏幕上走过约九成宽度就要 30 s 左右。
   - 这时工具返回「30 秒内没有走到」，她其实还在走（`world.ts:57, 1363-1366`）〔代码〕。
3. **组里的表情只持续自己的 3.2 s**：
   - 和唱歌、看书、喝茶同组时，最后 0.4–1.2 s 换回手势自带的脸（§6）。写成先后就没有这个问题。
4. **画不出实时的脸**：大肥鱼和三位娘的跪坐图、趴姿图不画实时的脸，只有笑、闭眼、说话三张贴片。所以跪坐、趴着时要的表情（包括组合脸）只看得出符号和嘴型。
5. **背过身时看不见点头**：三位娘和大肥鱼都是这样，摇头只让后面的头发晃一晃。
6. **名字带 `+` 的词不能做组的成员**：单独用可以。
7. **没有形象声明 `kneelArms`**：要让手势也保持跪坐，World 还需要词表里的标记，才能把跪坐和手势排进同一组。
8. **两个表情不能同组**：这是设计如此，常用的一眼一嘴组合已经做成 23 个组合脸。
9. **组合脸在 Coo 和大肥鱼上不如在三位娘上明显**：Coo 没有嘴；大肥鱼缺 smug、angry、sad、shy 的眼睛图。
10. **没有 `doAll` 的身体一组词逐个做**：第三方包、非 plus 身体都是这样。被拒的成员（比如跳起来时的表情）每帧重试，最多 2 s（`figure-frame.js:40, 88, 95-98`）；非 plus 身体上，后面的动作仍会按上游规则清掉表情。

---

## 三、组合矩阵：组合扩展前后实际看得见的词对〔实测〕

### 测法

- 探针：`/tmp/combo/probes/matrix3.mjs`。
- 词：取 v0.2.6 词表里 Coo 和三位娘共有的词，去掉 stand、neutral、turn，共 68 个词、C(68,2) = 2278 个无序词对。新加的 23 个组合脸不在里面。
- 驱动：每一对都经过真实的页面队列（`acts.js`），交给 plus 的 kit 身体。
- 计数规则：在某一帧里两个词的特征同时看得见，就算一对。
  - 叠加出的组合脸，按它的眼睛部位算作主动要的那个表情；
  - 跪坐时，头部手势只要 `kneelHead` 在动就算。
- 两种跑法：
  - 依次：先 a 后 b、先 b 后 a，有一种看得见就算；
  - 成组：推一个 `a+b`。
- 两个形象：
  - Coo：只看 kit 的状态，Coo 什么都画；
  - Claude 娘：再按真实的 Claude 娘 motion 遮一遍，包括 `hideFront` 和手臂计划。
- 前后用的是同一个探针。在没改的树（`/tmp/combo/before-repo`）上跑，结果和 `matrix-before.json` 完全一致。

| 跑法 | 之前（v0.2.6） | 之后 |
|---|---|---|
| Coo，依次 | 231（10.1%） | 1104（48.5%） |
| Coo，`a+b` 成组 | 0 | 1367（60.0%） |
| Claude 娘，依次 | 154（6.8%） | 1079（47.4%） |
| Claude 娘，`a+b` 成组 | 0 | 1349（59.2%） |

v0.2.6 的「成组」是 0，因为那时 `a+b` 是不认识的词。

### 按类别

格式：之前 → 之后，Coo / Claude 娘。

| 类别 | 词对数 | 依次 | 成组 |
|---|---|---|---|
| 表情 × 表情 | 351 | 0 → 0 / 0 → 0 | 0 → 0 / 0 → 0 |
| 表情 × 手势（含头部） | 756 | 63 → 728 / 63 → 728 | 0 → 755 / 0 → 755 |
| 手势 × 手势 | 378 | 0 → 0 / 0 → 0 | 0 → 75 / 0 → 75 |
| 姿态 × 手势 | 112 | 79 → 82 / 56 → 59 | 0 → 82 / 0 → 81 |
| 姿态 × 表情 | 108 | 81 → 81 / 27 → 79 | 0 → 81 / 0 → 81 |
| 和 walk / run / look / dance / jump… 一起 | 567 | 8 → 213 / 8 → 213 | 0 → 374 / 0 → 357 |

### 按词类

E 表情 27，H 头部手势 3，G 其余手势 25，L 姿态 4，M 模式动作 9。格式：看得见 / 总数。

| 词类 | 总数 | Coo 依次 前 → 后 | Coo 成组 | Claude 娘 依次 前 → 后 | Claude 娘 成组 |
|---|---|---|---|---|---|
| E×E | 351 | 0 → 0 | 0 | 0 → 0 | 0 |
| E×G | 675 | 63 → 650 | 674 | 63 → 650 | 674 |
| E×H | 81 | 0 → 78 | 81 | 0 → 78 | 81 |
| E×L | 108 | 81 → 81 | 81 | 27 → 79 | 81 |
| E×M | 243 | 3 → 208 | 213 | 3 → 208 | 213 |
| G×G | 300 | 0 → 0 | 0 | 0 → 0 | 0 |
| G×H | 75 | 0 → 0 | 75 | 0 → 0 | 75 |
| G×L | 100 | 70 → 70 | 70 | 47 → 47 | 69 |
| G×M | 225 | 2 → 2 | 131 | 2 → 2 | 114 |
| H×H | 3 | 0 → 0 | 0 | 0 → 0 | 0 |
| H×L | 12 | 9 → 12 | 12 | 9 → 12 | 12 |
| H×M | 27 | 0 → 0 | 27 | 0 → 0 | 27 |
| L×L | 6 | 0 → 0 | 0 | 0 → 0 | 0 |
| L×M | 36 | 0 → 0 | 0 | 0 → 0 | 0 |
| M×M | 36 | 3 → 3 | 3 | 3 → 3 | 3 |

### 变差的词对：0

四次跑都没有。以前看得见的词对，不管写成组还是写成先后，现在都还看得见。

### 还看不见的，都是设计如此或画法的限制

- **表情 × 表情为 0**：同一组里的两个表情会拆成先后。常用的一眼一嘴组合，改由 23 个组合脸当单独的词。
- **手势 × 手势**：成组时看得见的 75 对，全是头部手势配一个手的手势（点头、摇头、叹气 + 手势）。手 + 手仍是 0/300，因为只有一个手势槽。
- **姿态 × 表情少的 27 对**：都是睡着时要的表情，睡着时眼睛一直闭着。
- **姿态 × 手势少的**：多数是会结束跪坐的手势，另有几个趴着或睡着时做不了（唱歌、屈膝礼、背过身）。
- **表情 × 手势少的 1 对**：`petrify|song`。石化会结束唱歌。
- **G×M 成组只有 131 / 114**，有两个原因：
  - 扑腾、翻滚自己占着手，和任何手势都不同组；
  - 唱歌、背过身、转圈、鞠躬这类要她停下来做的手势，不能和走、跑、跳舞、张望、跳、晕放在一组（站位冲突），会拆成先后。
- **E×M 成组少的 30 对**：主要是晕和各个表情（晕占着表情），另有石化和走、跑。
- **Claude 娘比 Coo 少的**：
  - 成组时，主要是晕着时的手势：她晕的时候双臂下垂。
  - 依次做时，主要是趴着时的手势（看不见手臂），以及跪坐、趴着时的石化。

结果文件：
- `/tmp/combo/matrix-before.json`、`matrix-after.json`
- 只做完 A 部分时的中间结果：`matrix-after-partA.json`
