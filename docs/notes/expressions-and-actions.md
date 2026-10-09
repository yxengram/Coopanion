# Coopanion 表情与动作：调用机制与可同时使用性

> 依据：v0.2.5（`af15a7c`）加上 v0.2.6 的修复，描述的是 **v0.2.6**。行号都按 v0.2.6 的代码。
> 实测：大部分〔实测〕结果来自 `810eb3d`（v0.2.4）上的脚本，放在 `/tmp/exmap/`：`h.mjs`、`pairs.mjs`、`special.mjs`、`queue.mjs`，以及 `v1/p.mts`、`v1/walkq.mjs`、`v2/sp2.mjs`、`v2/sp3.mjs`。`.mjs` 用 `node /tmp/exmap/<文件>` 复跑。kit（`body.js`）此后没有改过，这些结果仍然成立。v0.2.6 改了的行为由仓库里的测试覆盖：`PKG/tests/script.test.ts`、`PKG/tests/world.test.ts`、`tests/pet-actions.test.js`、`tests/whale-pose.test.js`、`tests/{claude,gpt,gemini}-figure.test.js`。
> 路径约定：`PKG` = `packages/cortico-world-desktop-pet`；`body.js` = `PKG/web/kit/body.js`；`pet-app.js` = `PKG/web/pet-app.js`；`acts.js` = `PKG/web/acts.js`；`world.ts` = `PKG/src/world.ts`；`script.ts` = `PKG/src/script.ts`；`cc/` = `PKG/web/claude-chan/`。
> 标记含义：**〔实测〕** 表示在真实 kit 上跑过，包括 72×72 = 5184 个词对和若干特殊场景；**〔测试〕** 表示有仓库里的测试守着；**〔代码〕** 表示只读代码得出，没有跑。

---

## 一、表情和动作的调用机制

### 1. 词从哪里来：词表

- 每个形象的 `PKG/web/<形象>/figure.json` 里都有一个 `vocab`。每项含 `id`、`kind`（`expression` 或 `motion`）、各语言的 `names`、`about`、`seconds`，可选 `lasting`。加载时由 `PKG/src/packs.ts:139-163`（`readVocab`）校验。
- 各形象的词数〔代码，已点数〕：

| 形象 | 词数 | 表情 | 动作 |
|---|---|---|---|
| Coo、大肥鱼 | 72 | 28 | 44 |
| Claude 娘、GPT 娘、Gemini 娘 | 71 | 28 | 43（少 `spout`） |

  `spout` 只在 `coo/figure.json:1262` 和 `whale/figure.json:1355` 里。
- 带 `lasting: true` 的只有 4 个词：`sit`、`sleep`、`kneel`、`lie`。
- `seconds` 的取值（见 `coo/figure.json` 的 vocab，`claude-chan` 相同）：
  - 表情：0.9；`petrify` 是 3.2。
  - 手势词：手势时长 + 0.1，例如 nod 0.7 → 0.8，wave 1.6 → 1.7。
  - 姿态 / 模式词是固定值：lasting 的 sit、sleep、kneel、lie 都是 0.8；look 2.7；dizzy 3.2；dance 3.4；stand、jump 1.2；hop 0.9；turn 0.4；walk、run 12。
- 字段的用途：
  - 页面拿到 `id/kind/seconds/lasting`（`PKG/src/server.ts:200-204`），但只读 `seconds`（`pet-app.js:136, 252`）。另外会查某个词在不在，比如 `words.has('hop')`（`pet-app.js:613`）。`kind` 和 `lasting` 虽然发到了页面，但没人读。kit 完全看不到词表。
  - `names` 和 `about` 用来生成提示词和解析词。
  - `names` 还有一个用处：`moodOf` 取 pet_say 里第一个 beat 的第一个表情，把它的 id 和各语言的第一个名字记成对话页上的 `mood` 标签（`world.ts:216-221, 1304`）。

### 2. LLM 怎么知道词表

- `ENV_PROMPT.md` 里的 `{{pet.vocab}}`（`PKG/src/ENV_PROMPT.md:18`）由 `vocabTable(this.vocab())` 填入（`world.ts:1441`，`script.ts:154-161`）。
- 渲染出两张表：「表情（持续几秒后回到平常的脸）」和「动作」。lasting 词后面由 `lastingNote`（`script.ts:148-152`）写明什么时候结束：
  - sit、lie、sleep：「一直保持：做手势、换表情不影响，换别的姿势或走、跑、跳这类全身动作才结束」；
  - kneel：「保持到下一个动作（点头也算），然后变回普通坐着；换表情不影响」。
  - `pet_act` 的说明（`ENV_PROMPT.md:29`，`PKG/src/tools.ts:80`）也改成这个意思，并提到被拎起来、戳醒或 `pet_walk_to` 也会让她起来。
- 用的是当前形象的词表（`world.ts:345-352`）。形象加载失败时退回 Coo 的词表，并告诉 bot（`world.ts:377-384`）。

### 3. 触发来源一览

| 来源 | 入口 | 是否查词表 | 是否进页面队列 |
|---|---|---|---|
| `pet_act`（LLM） | `world.ts:1424-1434` 发 `{t:'act', actions}` | 是：`parseActions`/`vocabId`（`script.ts:130-141, 27-45`），认 id 和各语言别名，不区分大小写。不认识的词列在回执里（`world.ts:1431`）。一个都不认识时调用失败，返回 `[pet_act 没执行]`，页面什么都收不到（`world.ts:1428`）。回执对每个 lasting 词写一次它什么时候结束（`lastingNote`，`world.ts:1430-1433`） | 是，到达就入队（`pet-app.js:203`） |
| `pet_say` 里的 `【词】` | `parseScript`（`script.ts:84-92`），成为 beat 的 `actions` | 是。丢掉的标记列在回执里（`world.ts:1311-1312`） | 是，beat 开始时入队，文字晚 0.45 s 出现（`pet-app.js:318-319`） |
| `pet_say` 里的 `<词>` | `script.ts:93-101`，成为锚点 | 是（同上） | 是，打字打到那个位置时入队（`pet-app.js:353`）。**没有文字的 beat**（`【开心】<眨眼>`，或只有 `<眨眼>` 的脚本）没有字可打：`parseScript` 把它的锚点按顺序并进这个 beat 的 `actions`，跟着 beat 开始一起入队（`script.ts:111-115`）。页面也兜底：没有文字的 beat 结束前先把剩下的锚点入队（`pet-app.js:325-329`）。〔测试〕`script.test.ts` |
| `dialog()`（新手引导、更新提示、出错提示） | `world.ts:824-830`；`core/guide.ts`（如 :265 `['happy','hop']`）；`core/companion.ts:220-221, 269` | 是。不认识的词不发给页面，写一条 warn 日志（`world.ts:827`），并放在返回的 handle 的 `dropped` 里（`world.ts:143`）。dialog 不经过 bot，所以没有回执 | 是，气泡打开时入队（`pet-app.js:446`） |
| dialog 选项卡片的 `motion`（`'still'\|'walk'\|'run'`，`world.ts:115, 122`）；新手引导「走动多少」那一步在用（`core/guide.ts:58-60`） | 选中卡片时由 `stepTalkMotion` 处理（`pet-app.js:600-617`） | 否，只查 `words.has('hop')`（`:613`） | **否**。只在 idle 且不 busy 时直接调 `body.walk(...)`；选 `'run'` 时有 30% 概率再调 `body.do('hop')`（`:613`）。不经过 `acts.js` 的队列 |
| `pet_walk_to`（LLM） | `world.ts:1336-1370`，发 `{t:'walk'}` | 否，只查 `can.walk` | **否**，直接调 `body.walk()`（`pet-app.js:200, 241-247`）。body busy 时（drag/air/crouch/roll），`walkTo` 返回 false（`body.js:619-620`），帧在下一帧报 `interrupted`、`by:'busy'`（`figure-frame.js:86`），`onBody` 补上当前位置后转给 World（`pet-app.js:221-225`），工具**马上**返回「没走：身体正忙……等它落地站稳再走」（`world.ts:739`）。页面还没有身体时报 `by:'none'`（`pet-app.js:244`），返回「没走：桌宠的身体还没准备好」（`world.ts:740`）。〔测试〕`world.test.ts`。真正走起来以后，30 s 没走到才超时（`world.ts:57, 1361-1364`） |
| 思考中 / 听语音 | `setThinking` 发 `{t:'thinking'}`（`world.ts:568-572`）。触发点在 `world.ts:452-466`：模型开始输出时开，一轮结束、中止或 turn 结束时关。页面重连时，当前状态随 init/prefs 快照一起到达（`world.ts:607` → `pet-app.js:188`）。听语音走 `onListen`（`pet-app.js:652-686`） | 否 | 否，直接设标志 |
| 提示音效 cue | `body.cue(...)`（`body.js:1520-1525`） | 否 | 否。`perk` → `setExpr('surprised', .5)`，只持续 0.5 s（`pet-app.js:657`，听语音 `'ready'` 时）。`cheer` → `setExpr('happy')`，持续 3.2 s（`pet-app.js:413` 回答 pet_ask 时；`:642` 发送打字内容时）。`heard`、`bounce` 只加挤压（`pet.sqv += .9 / 1.2`），不改脸（`pet-app.js:678`）。`bounce` 只在 `dress.js` 里调用。`dress.js` 的所有调用（`dress.js:182, 208, 227, 241-242`）作用在换装页的预览身体上，不是屏幕上的桌宠 |
| 说话口型 | 每打一个字调 `body.talk(ch)`（`pet-app.js:352`） | 否 | 否 |
| 鼠标互动（戳、摸、拎、甩） | `body.pointer` → `body.js:1249-1330` | 否 | 否，kit 直接改状态 |
| 自由活动 | `decide()`（`body.js:650-662, 729`），加上各模式的计时器：自己选的 sit/lie（有限时长）会睡着或起身（`775-778, 796-799`），lie 会自己做小动作（`791-795`），look 会回到 idle | 否 | 否。这些都只在 `free = roam !== 'off' && T > hold && !dialogOpen`（`body.js:702`）时运行。也就是说要同时满足：没被 pet_quiet 或「习惯」设置关掉；最近 15–20 s 没有指令（每次 say/ask/act/dialog 调 `holdRoam(20)`，`pet-app.js:197-206`；每个队列词调 `holdRoam(15)`，`:252`）；没有打开的气泡或倾听。`decide()` 还要等表情显示完、倾听结束（`:729`）。主动要的 sit/lie/sleep 用 `dur 1e9`，所以永远不会超时 |

### 4. 流程图

```
LLM ──pet_act{actions}──────┐  World: parseActions / parseScript
LLM ──pet_say【词】<词>──────┤  └─ vocabId(按当前形象词表，id 或别名)
引导/通知 ──dialog{actions}──┘     不认识的词：pet_say 在回执里列出丢掉的标记；
                                   pet_act 列出丢掉的词，一个都不认识就失败、什么都不发；
                                   dialog 写 warn 日志，放进 handle.dropped
                                   没有文字的 beat：<词> 并进这个 beat 的 actions
                                     │
                                     ▼  WebSocket  {t:'act'|'say'|'dialog'}
               pet-app.js onOrder (192-210)
                 act    ──────────────────────► acts.push  (立即)
                 say    ─► 气泡队列 queue ─► stepDialog: beat 开始 / 打字到锚点 ─► acts.push
                 dialog ─► 气泡队列 queue ─► 气泡打开 ─► acts.push
                                     │
                                     ▼  stepActs (pet-app.js:251-253) → acts.js step (26-33)
                                        唯一的 FIFO，每帧检查
               等到 T ≥ until、有 layout 且不 busy
                 → body.do(word)；until = T + vocab.seconds（当前词表里没有的 id 默认 1 s）
                   done 会提前放行（acts.js:35-38）。done 来自 walk/run 结束（body.js:389, 604），
                   或 plus 身体拒绝了某个词（body.js:1490）
                   walk/run 过了 seconds 还在走（layout.mode 仍是 walk/run）时继续等，
                   直到 done 或模式变了，最多 WALK_MAX = 90 s（acts.js:11, 28）
                                     │
                                     ▼  body-host.js:121 → iframe figure-frame.js:85
               （内置形象都是 plus: true 的 kit 身体；第三方形象可以自己实现 do(word)，
                 figure-frame.js:9-23）
               kit body.js doWord (598-616)：按 id 分派，不看 kind
                 neutral  → setExpr('neutral', .1)
                 walk/run → walkTo
                 opts.words[w].motion → pulse(a, own.seconds, true) + holdFace(own.face)（454-459）
                 opts.words[w].expression → setExpr，时长用 own.seconds（584）
                     （5 个内置形象都没有传 opts.words）
                 KIT_MOTIONS → act；PLUS_MOTIONS 只在 plus && !face 时 → act → (plusAct)（610）
                      → setMode 改模式槽 / pulse 改手势槽 / holdFace 设自带表情
                 KIT_/PLUS_EXPRESSIONS → setExpr → 表情槽（611）
                                     │
                                     ▼  每帧 faceName() 按优先级选脸 + render
               figure.draw(petG, face, frame{mode, gesture{kind,k}, talk, sit, lie, kneel, away…})
                 （body.js:248, 1170）各形象自己画：Coo 环形 / 大肥鱼 / 三位娘的 armPlan、hideFront

旁路（不查词表、不排队）：pet_walk_to → body.walk；dialog 选项卡片 motion → stepTalkMotion
→ body.walk / body.do('hop')；thinking / listening → body.set；cue / talk → body.cue / body.talk；
鼠标 → body.pointer；空闲 → decide() 和各模式计时器
```

### 5. 时长：`seconds` 和 `lasting` 实际起什么作用

- **`seconds` 是队列放行下一个词前要等多久**（`pet-app.js:252`，`acts.js:31`），不是这个词的播放时长〔实测〕。
  - 一般的词：放行时间是 min(seconds, 该词的 `done`)。`done` 来自 walk/run 结束（`body.js:389, 604`），或 plus 身体拒绝了这个词（`body.js:1488-1491`）。
  - `walk`/`run` 例外：seconds 是 12，但 `doWord` 发起的走路会走到屏幕另一侧（`body.js:600-605`），宽屏上可能超过 12 s。过了 seconds 以后，只要身体的 `layout.mode` 还是这个 walk/run，下一个词就继续等；走完报 `done` 或模式变了就放行，最多等 90 s（`WALK_MAX`，`acts.js:11, 28`）。〔测试〕`tests/pet-actions.test.js`：2560 px 宽的舞台上从 x=100 走，`nod` 一直等到走完（超过 14 s）才放出。（v0.2.5 及以前不等：`v1/walkq.mjs` 里 `nod` 在 13.0 s 放出，此时还在走。）
  - 当前词表里没有的 id（比如切换形象之后）按 1 s 等待（`?? 1`，`pet-app.js:252`）。
  - 表情在身体上实际保持 3.2 s，`sleepy` 保持 4.4 s（`body.js:584`）。
  - 动作自带的表情保持多久由 `holdFace` 决定（`body.js:564`）。
  - 实测表情的消失时间：happy 在 3.1–3.3 s 之间，sleepy 在 4.3–4.5 s 之间。
- **`lasting` 只影响提示词表和工具回执**（`script.ts:158`，`world.ts:1430-1433`）。页面和 kit 都不读它。姿态能一直保持，靠的是 kit 里的 `dur: 1e9`（`body.js:446, 448, 473-474`）〔代码〕。实测主动让她坐下、躺下、睡觉，60 s 后仍然保持〔实测〕。

### 6. kit 内部分派（`body.js`）

- 下面描述的分派只适用于建在 kit 上的形象。5 个内置形象都是 `plus: true` 的 kit 身体（`coo/figure.js:10`，`whale/figure.js:1447`，`claude-chan/figure.js:275` 等）。安装的第三方形象，其工厂可以返回自己的身体，`do(word)` 怎么实现都可以（`figure-frame.js:9-23, 85`）。
- **`doWord`**（`598-616`）还接受形象通过 `opts.words` 自带的词（`244-247, 609, 611`）：
  - 自带动作：`pulse(a, own.seconds, true)` 加 `holdFace(own.face)`（`454-459`）。
  - 自带表情：时长用 `own.seconds`（`584`）。
  - PLUS_MOTIONS 只在 `plus && !face` 时进入 `act`（`610`）。
  - 内置形象都没有传 `opts.words`。
- **`act(a)`**（`423-466`）的步骤：
  1. busy 时拒绝（`424`）。
  2. 除 `kneel` 以外的任何动作都会结束跪坐（`432`）。
  3. **清空表情槽**：`pet.expr = null`（`433`）。
  4. 按词改模式、起手势、设自带表情（`plusAct`，`470-555`）。
- **`setExpr(n)`**（`566-591`）：
  - 特殊路由：`sleep` 转给 `act('sleep')`；`dragged` 变成一次抛出；`dizzy` 进入 dizzy 模式。
  - 会把 `look` 和 `land` 打回 idle（`576`）。
  - `petrify` 会让 walk/run/dance 停下（`582`）；已经石化时再要石化会被忽略（`580`）。
  - 设置 `expr/exprUntil`，播放表情音，并放出爱心或闪光。
- **busy 的条件**（`413`）：模式是 `drag`、`air` 或 `crouch`，或者正在翻滚（`roll`）。
  - 此时直接调用的 `act`、`setExpr`、`walkTo` 都会被拒绝。
  - 页面队列在 `layout.busy` 时不放词（`acts.js:27`；`layout.busy = busy()`，`body.js:1382`），所以队列里的词只是**推迟**，不会因为 busy 被丢掉〔实测〕。
  - `pet_walk_to` 不经过队列，busy 时这次行走不做，工具马上返回「没走：身体正忙」（见 §3）。
  - **鼠标输入不受 busy 限制**：
    - 翻滚时 `pet.mode` 仍是 `idle`。这时戳她，有 50% 概率 `setMode('crouch')`（`body.js:1310`），会清掉翻滚手势（`394`）。〔实测〕`v2/sp2.mjs`：6 个随机种子里有 5 个的翻滚以 `mode=crouch g=-` 结束。
    - crouch 或翻滚期间也能拎起她：`pointerDown` 只在 air 时拒绝（`body.js:1249`），而 `setMode('drag')` 会取消翻滚。
- **plus 身体做不了的词会立即回报 `done`**（`body.js:1488-1491`），例如躺着或睡觉时唱歌。

### 7. 每帧画哪张脸：`faceName()`（`body.js:634-648`）

优先级从高到低：

1. `drag` → dragged
2. 空中且 `airKind` 是 `'throw'` → dragged 或 surprised；`'drop'` → surprised（`637-638`）。跳类的空中（jump、hop、flap、cheer、戳出的小跳，`airKind 'jump'`，`828`）不在这里改脸，显示 `expr` 里留着的脸〔实测：`cheer air` 得到 face=happy、mode=air〕
3. `dizzy` → dizzy，2.4 s 后变 squeeze
4. `wake` → surprised 或 waking
5. 正在听 → listening（睡觉时除外）
6. `sleep` → sleep
7. **当前表情 `expr`**（未过期）
8. 思考中 → thinking
9. sit 或 lie → content
10. run → run
11. neutral

### 8. 按形象过滤与兜底

- **第一道过滤在 World 端的词表**：当前形象词表里没有的词会被丢弃（`script.ts:66-75`）。pet_say 和 pet_act 会在回执里写明，dialog 写一条 warn 日志（见 §3）。三位娘的词表里没有 `spout`，代码里也不画（v0.2.6 删掉了残留的 spout 代码）。
- **画不画由形象决定**：列在 `figure.gestures` 里的手势由形象自己画，kit 不再加倾斜和前倾（`body.js:925-929`）。
  - 大肥鱼的列表：`whale/figure.js:1392`。
  - 三位娘的 `GESTURES`：`cc/figure.js:25`，不含 `spout`。
  - Coo 一个都不自己画，全靠 kit 的倾斜和挤压，再加上 `away:'hide'`、`roll:'spin'`（`coo/coo.js:423-437`）。
- **缺图时的兜底**〔代码〕：
  - 三位娘：先用 `POSE_ALT` 替代，再退到 `ARM_FALLBACK` 角度。没有 lie 图就坐着，没有 roll 图就整体旋转（`'spin'`），没有 back 图就转头（`cc/motion.js:201, 215-221`，`cc/figure.js:214-220, 256`）。
  - 大肥鱼：没有 roll 图就小跳（`whale/figure.js:1038`），没有 lie 图就坐着（`:358`）。
  - 现有内置形象的姿态图都齐全，这些兜底只在贴图加载失败时才会触发。

---

## 二、可同时使用性

### 1. 通道（槽）

**独占槽**：新来的会顶掉旧的。

| 槽 | 状态 | 由谁设置 | 结束方式 |
|---|---|---|---|
| 表情槽 | `pet.expr`（`body.js:584, 564`） | `setExpr`（主动要的表情）；`holdFace`（动作自带的表情）；落地；cue；戳；摸 | 到期；**任何 `act()`**（`433`）；`walkTo`（`623`）；被拎起（`1265`） |
| 短动作（手势）槽 | `pet.pulse`，同一时间只有一个（`557-560`） | `pulse()` | `k ≥ 1`；新手势直接覆盖；换模式会切掉 roll、song、away 和躺着时的小动作（`392-407`） |
| 模式 / 姿态槽 | `pet.mode`（`381-411`） | 动作词、`walkTo`、`decide`、鼠标、落地 | 下一次 `setMode`；或各模式自己的计时器（`720-882`） |
| 跪坐标志（plus） | `pet.kneel` | `kneel` | 任何其他动作（`432`）；任何非 sit 模式（`399`） |

**独立叠加层**：不占上面的槽。

| 层 | 说明 |
|---|---|
| 说话口型 | `talkK` 叠在任何表情上（`1166`）；石化时不动 |
| 思考 / 倾听标志 | 不占槽，但参与选脸优先级 |
| 视线 | 石化 > 锁视线的表情 > 表情的 `lookAt` > 模式 / 倾听（`982-985`） |
| 眨眼、犯困程度、挤压 / 倾斜 / 前倾 | 每帧重新计算，几个来源相加（`986-993`） |
| 特效粒子 | 放出后各自走完生命周期，不会被取消（`1102-1109`） |

**三条总规则**〔实测〕：

1. **动作会清掉表情**：任何动作（连点头、摇头都算）都会清空当前表情（`433`）。只有 `hips`/`cross` 例外，它们保留主动要的表情（`petrify` 除外）。
2. **表情一般不打断动作**：例外只有 `petrify`（让走、跑、跳舞停下，`582`），以及会被任何表情打断的 `look` 和 `land`（`576`）。
3. **短动作一次只有一个，但能跨过模式变化继续播放**：`setMode` 只切掉 roll、song、away 和躺着时的小动作。

### 2. 词的分类（共 72 个，数据来自 Coo 的 `figure.json`）

| 类 | 词 |
|---|---|
| **E 表情（28）** | neutral 平静、happy 开心、wink 眨眼、love 喜欢、shy 害羞、surprised 惊讶、angry 生气、sad 难过、sleepy 犯困、thinking 思考、smug 得意、pout 嘟嘴、worried 担心、determined 认真、flustered 慌张、scared 害怕、excited 期待、cry 大哭、confused 疑惑、disgusted 嫌弃、nervous 紧张、gentle 温柔、awkward 尴尬、moved 感动、**petrify 石化**、coax 撒娇、tongue 吐舌、giggle 偷笑 |
| **G 叠加手势（22）**：不改模式 | nod 点头、shake 摇头、wave 招手、shiver 发抖、heart 比心、song 唱歌、serve 奉茶、salute 敬礼、vsign 比耶、point 指、cover 捂嘴笑、cross 抱臂、stretch 伸懒腰、pray 拜托、scratch 挠头、idea 有了、hug 抱抱、hips 叉腰、sigh 叹气、spout 喷水（仅 Coo/大肥鱼）、sip 喝茶、read 看书 |
| **GB 起身手势（7）**：没坐着时先回到 idle | turn 转身（只翻身，不调 `pulse()`，`body.js:442`）、spin 转圈、bow 鞠躬、flinch 后缩、peek 探头、away 背过身、cheer 欢呼（站着时会进入 crouch/air） |
| **L 持续姿态（4）** | sit 坐下、kneel 跪坐、lie 趴下、sleep 睡觉 |
| **M 模式动作（11）** | stand 站起、walk 走走、run 跑、look 张望、dizzy 晕、dance 跳舞；**busy 类**：jump 跳、hop 小跳、flap 扑腾、roll 翻滚；curtsy 屈膝礼（回到 idle，并起自己的手势） |

**动作自带的表情**（`holdFace`，`body.js:443-454, 476-551`）：

- wave/flap/dance/cheer/roll/scratch/spout → happy
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
- sigh → sighing
- sip → sipping
- read → reading
- hips → determined；cross → pout（两者都优先保留之前主动要的表情）

**不带表情的动作**：stand、walk、run、jump、hop、look、turn、nod、shake、spin、sit、sleep、dizzy、shiver、kneel、lie。做完后脸回到模式默认（content、run 或 neutral）。

### 3. 表情 × 表情

| 情况 | 结果 | 依据 |
|---|---|---|
| 新表情 → 旧表情 | **替换**（756/756）；连放同一个表情会重新计时 | 〔实测〕`body.js:584` |
| 正在石化时再要 petrify | **忽略** | 〔实测〕`:580` |
| neutral | 0.1 s 后清空表情 | 〔实测〕`:599` |
| 主动要的表情 vs 思考中 | 表情胜，thinking 被压住 | 〔实测〕`:643-644` |
| 主动要的表情 vs 正在听 | listening 胜；表情在底下继续倒计时 | 〔实测〕`:641` |
| 主动要的表情 vs 睡觉 / 起身（wake） | 被盖住，倒计时照走 | 〔实测〕 |
| 主动要的表情 vs 晕 | 被盖住，倒计时照走。晕持续 3.0 s（`:849-857`），表情持续 3.2 s（`:584`），所以在晕开始后 t 秒要的表情，晕结束后只剩 3.2 −（3.0 − t）秒可见，范围 0.2–3.2 s（t = 0.1 s 时只剩约 0.2 s）。经过 LLM 队列时，dizzy 的 seconds（3.2）比晕本身（3.0）长，排在后面的表情会在晕结束后才到，完整可见。只有撞墙引起的晕（`:1120`）或不走队列的词会被盖住 | 〔实测〕 |
| 主动要的表情 vs 被拎 / 空中 | drag、air、crouch 期间 `setExpr` 被拒绝（busy，`:568`；doWord `:611`），队列里的表情则在页面队列里等。拎起时会清掉正在显示的表情（`pet.expr=null`，`:1265`），所以底下没有在倒计时的表情。跳类空中（jump、hop、flap、cheer、戳出的小跳）显示 `expr` 里留着的脸（动作自带的或戳出来的）；只有 throw/drop 的空中显示 dragged 或 surprised（`:637-638`） | 〔实测〕 |
| 主动要的表情 vs 坐 / 躺时的 content、跑的 run | 表情胜 | 〔实测〕 |
| 说话口型 × 任何表情 | **共存**，嘴张开；石化时不动 | 〔实测〕`:1166` |

### 4. 表情 × 动作

**先有表情，再来动作：**

| 新动作 | 已有表情的结果 | 依据 |
|---|---|---|
| G、GB、L、M、walk | **清空**；新动作自带表情的话换成它 | 〔实测〕`:433, 623` |
| `hips` / `cross` | **保留并延长**（petrify 以外的表情） | 〔实测〕`:524, 540, 468` |
| `hips` / `cross`，但先前是动作自带的表情或 petrify | 换成 determined / pout | 〔实测〕 |
| 任何动作，先前是 petrify | 立刻解除石化 | 〔实测〕`:433` |

**先有动作，再来表情：**

| 正在进行的动作 | 结果 | 依据 |
|---|---|---|
| G / GB 手势 | **手势继续**，新表情替换手势自带的表情（616/616） | 〔实测〕 |
| sit / kneel / lie | **姿态保持**，表情显示 | 〔实测〕 |
| sleep | 姿态保持，表情**看不见**，在底下倒计时 | 〔实测〕 |
| walk / run / dance | **继续**；petrify 会让它们停下 | 〔实测〕`:582` |
| look、land | **被打断**，回到 idle | 〔实测〕`:576` |
| dizzy | 晕继续，表情被盖住 | 〔实测〕 |
| jump/hop/flap/cheer 在空中、roll、被拎 | 直接调用被**拒绝**；队列里的表情等 busy 结束后再放 | 〔实测〕`:413`；`acts.js:27` |
| sighing / singing / saluting 这类读手势进度的脸 | 换上新词时，脸本身也会被清掉或覆盖：`act()` 清空 `expr`（`:433`），`setExpr` 直接覆盖（`:584`）；被换模式切掉的 song 也会清掉 singing（endSong，`:562`）。所以「退回」只出现在手势结束后 holdFace 比 pulse 多出的 0.1 s 尾巴里（sigh 2.1 vs 2.0，salute 1.9 vs 1.8，song 4.1 vs 4；`:513, 516, 545`）。这 0.1 s 里，sighing 退回普通脸，saluting 退回它的 wink 脸，singing 保留闭眼唱歌脸，但嘴不动（`:186-189`） | 〔实测：sigh tail〕〔代码〕`:179-195` |
| shiver + angry/scared | angry 和 scared 一直带 `shake:true`（`:61, 85`），始终压过 shiver 的颤抖 | 〔代码〕`:1149-1150` |
| shiver + nervous/petrify | 只是间歇地压过：nervous 每 1.7 s 里只抖 0.3 s（`:141`），petrify 只在 1.1–1.35 s 之间抖（`:170`）。其余时间 shake 为 0，用的是 shiver 的颤抖 | 〔代码〕`:1149-1150` |

### 5. 动作 × 动作（行 = 正在进行，列 = 新来）

| 正在 ↓ \ 新来 → | G | GB | L | stand/walk/run/look/dizzy/dance/jump/hop | flap/roll/curtsy |
|---|---|---|---|---|---|
| **G** | 替换 | turn：只翻身，手势继续；其余替换 | **共存**（手势带进姿态；song 遇 lie/sleep 结束） | **共存**；song 遇这些模式会结束，只有她本来就站着时 stand 不结束 song（从坐、跪、躺起身走 wake，song 也结束，`:395, 436`） | 替换 |
| **GB** | 替换 | 替换；turn 例外：只翻身，正在播的手势继续（`:442`） | 共存；away → lie 例外：背身结束，正面趴下（`:397`） | 共存；但 away 会结束。只有她本来就站着时 stand 不结束 away（从坐着起身走 wake，away 也被切掉，`:397, 436`） | 替换 |
| **sit / lie / sleep** | **共存**（姿态不变，睡着也照做；song 在 lie/sleep 下被拒绝） | 共存（保持坐姿）；lie → away 只出 pout，不转身（见 §7） | 替换 | 姿态结束（stand 进入 wake） | 姿态结束 |
| **kneel** | 跪坐结束，变成普通坐姿后做手势 | 同左 | 替换（kneel → kneel 保持） | 结束 | 结束 |
| **walk/run/dance/look/dizzy** | **共存**（song 被拒绝） | 被打断：回到 idle；cheer 则进入小跳（crouch/air，`:478`） | 替换 | 替换 | 替换 |
| **jump/hop/flap/roll、站着的 cheer**（busy） | 队列里的词等 busy 结束；直接调用被拒绝 | 同左 | 同左 | 同左 | 同左 |
| **curtsy** | 替换 | 替换；turn 例外，屈膝礼继续 | 共存 | 共存 | 替换 |

busy 那一行补充：鼠标输入仍然生效。翻滚中戳她，可能把翻滚切成一次小跳（`:1310, 394`）；在 crouch 或翻滚中拎起她，会进入 drag（`:1249`）。

全表〔实测〕，依据 `body.js:381-411, 413, 423-466, 470-555, 557-560`；turn 例外和 stand 经 wake 的情况由 `v2/sp2.mjs`、`v2/sp3.mjs` 复测。实测分别在 Coo 和「仿三位娘配置」上跑了一遍，结果逐字节相同（`v2/pairs-coo.json` 与 `v2/pairs-girl.json`）。但「仿三位娘配置」只是把 Coo 的 gestures、poses、away 换掉，而 kit 只在渲染时读这些字段，所以结果相同是必然的。这只能说明 kit 层面的状态共存对所有形象都一样；两者能不能同时被**看见**，取决于形象（见 §8）。

### 6. 经 LLM 下指令时，实际能「同时」出现的组合〔实测：`queue.mjs`〕

页面队列按 `seconds` 一个接一个放词，而手势的 `seconds` 正好是手势时长 + 0.1。所以单靠 LLM 发出的词，真正能在屏幕上重叠的只有下面几种：

- **sit / lie / sleep + 后面的表情或手势**：例如 `【坐下, 开心, 招手】`。kneel 不算：后面任何动作都会结束跪坐（`body.js:432`），`kneel → nod` 实测得到 `mode=sit`，是普通坐姿。
- **从坐着站起，紧接着的下一个词落在 wake 期间**：stand 的 seconds 是 1.2（5 个 figure.json 都是），但从坐姿站起要经过 1.8 s 的 wake（`body.js:802-812`）。于是：
  - G 手势和起身重叠，但手势自带的脸被 waking 盖住；
  - 表情被盖住约 0.6 s；
  - GB 词或 curtsy 会立刻把 wake 切回 idle。
  - 〔实测〕`v2/sp2.mjs` `sit>stand>wave/happy/bow/nod`。
- **表情 + `hips`/`cross`**：例如 `【得意, 叉腰】`。
- **动作 + 它自带的表情**。
- 队列里的 walk/run **不再**和后面的词重叠：走得超过 12 s 时，后面的词等她走完（最多 90 s，§一.5）。v0.2.5 及以前，后面的词会在走路途中放出，L/M/GB 词会打断走路。
- **任何词 + 说话口型、思考、倾听**：这些标志不进队列。
- **`pet_walk_to` + 队列里的词**：走路由它驱动，不进队列。但只有 G 手势和表情能叠在上面；会改模式的词（L/M/GB）会在半路打断这次行走（`setMode` → interrupted，`body.js:384-389`）。
- **不进队列的表情 + 队列里的手势**：cue 的脸（perk → surprised 0.5 s，cheer → happy；`body.js:1520-1523`，`pet-app.js:413, 642, 657`）以及戳、摸出来的脸都绕过队列。它们会和正在播的手势重叠并替换手势自带的脸，也会打断 look 和 land（`body.js:576`）。

队列中的典型时序：

- `【开心, 点头】`：开心只显示 0.9 s，就被点头清掉。
- `【招手, 开心】`：开心在招手开始后 1.7 s 出现（招手的 seconds），这时 1.6 s 的招手已经结束（`body.js:450`）。
- `jump → happy`：happy 在 jump 放出后 1.2 s 出现（jump 的 seconds）。她在约 1.12 s 时已经进入 land，所以 happy 在落地后约 0.2–0.4 s 出现。

还有一点：`pet_act` 到达就立即入队，而 `pet_say` 的标记要等气泡轮到才入队，所以后发的 `pet_act` 可能比前面那句话里的标记先执行〔代码〕`pet-app.js:197, 203`。

### 7. 特殊情况

| 情况 | 规则 | 依据 |
|---|---|---|
| **drag 被拎** | 直接调用的表情、手势、坐、走都被拒绝，队列里的词等着；清空表情，显示 dragged；手势继续，但 roll/song/away 被切掉；跪坐结束。这期间的 `pet_walk_to` 不走，工具马上返回「没走：身体正忙」 | 〔实测〕`1263-1270`；〔代码〕`620`，`figure-frame.js:86`，`world.ts:739`；〔测试〕`world.test.ts` |
| **air 空中** | 直接调用的表情和手势被拒绝，队列里的词等落地。用鼠标松手，不管是甩出去还是轻轻放下，都把 `airKind` 设成 `'throw'`（`1295`），落地后显示 surprised 0.9 s，用力甩时（冲击 > 1000）进入 dizzy（`1120-1122`）〔实测：轻轻放下得到 face=surprised〕。happy 1.6 s 只出现在 `airKind 'drop'` 之后：入场掉落（`353`）和跨显示器的 dropAt（`1328`，`pet-app.js:1161`）。跳类空中显示 `expr` 里留着的脸（§一.7）。`pet_walk_to` 同 drag，马上返回「没走」 | 〔实测〕`568, 1114-1124` |
| **dizzy 晕** | 不算 busy；G 手势叠加；GB、M、L、`pet_walk_to` 会提前结束它；表情被盖住（剩余可见时间见 §3） | 〔实测〕`853-860` |
| **roll 翻滚** | busy：队列里的词等，直接调用被拒绝。会让她站起来；换模式时被切掉。鼠标仍然生效：翻滚中 `pet.mode` 仍是 idle，戳一下有 50% 概率进入 crouch 并切掉翻滚（实测 6 个种子里 5 个以 `mode=crouch g=-` 结束）；拎起进入 drag，也会取消翻滚。`pet_walk_to` 马上返回「没走」 | 〔实测〕`413, 394, 501, 1249, 1310`；`v2/sp2.mjs` |
| **away 背过身** | 在 idle/sit/sleep 下保持（坐着转身后再睡，背仍然朝外）；遇 jump/hop/look/dizzy/walk/run/dance/lie 结束。在坐、跪、躺的状态下 stand 走 wake，也会结束 away。只出 pout、不转身的条件：`pet.prone && lieSet()` 且不在 wake（`495`），也就是正在趴着，或者从趴着进入睡觉（趴着睡，`448`）〔实测：`lie>sleep>away` 得到 g=-、expr=pout〕，并且形象有 lie 图。形象没有 lie 图时（`poses.lie` 为 false，三位娘 `figure.js:256/258`；kit `lieSet`，`330`），lie 其实是坐着，away 照常转身 | 〔实测〕`397, 436, 495` |
| **lie 趴下** | 每 4–8 s 自己做一个小动作（kick/chin/thump），新手势会顶掉它；song 被拒绝；三位娘和大肥鱼趴着时手臂看不见 | 〔实测〕`791-795, 428`；〔代码〕`cc/motion.js:674, 937` |
| **kneel 跪坐** | 任何其他动作（连点头）都会结束跪坐，回到普通坐姿 | 〔实测〕`432` |
| **sit 坐下** | 表情、G、GB 都能叠加，仍保持坐姿；空闲逻辑不会让主动要的坐姿超时 | 〔实测〕`446, 775` |
| **sleep 睡觉** | 手势照做，但脸始终是 sleep；主动要的表情看不见；`setExpr('sleep')` 走 `act('sleep')`；在 lie 中要求睡觉就趴着睡 | 〔实测〕`448, 567` |
| **dance 跳舞** | 3.2 s；G 叠加；GB、L、M 打断；petrify 让它停下 | 〔实测〕`454, 582` |
| **walk/run 走 / 跑** | G 叠加；GB、L、M 打断并回报 interrupted/done；倾听开始时停下；`walkTo` 会清空表情，并让坐、跪、趴着的她先醒来。队列里的 walk/run 走得超过 12 s 时，下一个词等她走完，最多 90 s（`acts.js:28`）。`pet_walk_to` 遇到 busy 时马上返回「没走：身体正忙」（见 §3）；它发起的走路会被队列里会改模式的词在半路打断 | 〔实测〕`384-389, 619-627, 1422`；〔测试〕`tests/pet-actions.test.js`、`world.test.ts` |
| **talk 说话** | 口型叠在任何表情、手势、姿态上；石化时不动；趴着或跪坐时只剩 talk 小贴片（大肥鱼和三位娘） | 〔实测〕kit 部分；〔代码〕形象部分 |
| **listening 倾听** | 盖住表情；结束 song，并拒绝新的 song；停下走路；阻止空闲时的 decide；招手不受影响 | 〔实测〕 |
| **戳 / 摸** | 戳：随机换一个表情；只在 idle 时 50% 概率小跳（`1310`），翻滚中也算 idle，所以可能把翻滚切掉；戳出的 `setExpr` 会结束 look 和 land（`576`）；坐、躺、睡时戳会把她惊醒（`1301-1305`）；wake 中戳出的表情被 surprised/waking 盖住；晕时没有反应。摸：只在 idle、look、sit、lie、sleep 下有效（`1273`），出 love 或 shy，睡着时冒心 | 〔实测〕`1273-1312` |

### 8. 各形象的差异（都发生在 kit 允许同时进行之后，只决定画不画得出来）〔代码〕

**Coo**

- 没有手臂。所有手势都由 kit 用倾斜和挤压表现，只有 sip/read 会画小杯子和小书（`coo/coo.js:302-331`）。
- 什么都不遮：趴下时整张脸照画；跪坐就是坐。
- away 让脸淡出（`coo.js:194-197`）；roll 是整体旋转。
- 说话时直接加宽环的缺口，保留表情原来的嘴形。
- 石化时每帧仍然重画，kit 的手势在「石头」上照样动（`coo.js:285-298`）。

**大肥鱼**

- 手臂角度按源码顺序叠加，后写的赢（`whale/figure.js:978-1142`）。
- 只有 thinking 会摆托腮姿势；遇到占用远侧手臂的手势会很快放下（`:71, 882-883`）。
- `nervous` 的僵硬手臂写在 dance 之后、各手势之前（`:991`）：它压过走路、被拎、空中、坐着和跳舞的手臂，但手势从它出发，手臂图照常接手。wave、cheer、stretch、scratch、point 在 nervous 时都画得出来（v0.2.6 修复；之前写在手势之后，把拳头手臂压住，手臂图一直不出现）。〔测试〕`tests/whale-pose.test.js`，并看过渲染图。
- `coax` 只在没有手势时压手臂角度（`!g`，`:1012`），手势照常。
- 说话时保留 coax 的 ω 嘴。
- 坐着时 `backable()` 为 false，改成转头（`:486`）。
- 趴下、跪坐、翻滚和背面时隐藏正面（`:1226-1246`）。

**Claude 娘**

- 手臂由 `armPlan`（`cc/motion.js:229-249`）决定。手臂类手势（`ARM_ONE`/`ARM_BOTH`，`:184-189`）在播放期间以及结束后 0.4 s 内，都会压住表情带来的手臂姿势（`FACE_ARMS`，`:191-194`）。
- 表情要摆手臂，需要处在平静模式（idle/look/sit/sleep/wake），并且表情持续超过 0.3 s。
- **抱书**：空闲时抱着书；单手手势时另一只手用 `bookside` 夹着书；双手手势或表情姿势时书不见；没有跪坐图时把书放下（`:241, 247`）。
- 被拎或晕时双臂下垂，任何姿势都不显示（`:232`）。

**GPT 娘、Gemini 娘**

- 规则与 Claude 娘相同（`armPlan` 在 gpt 的 `:226`、gemini 的 `:228`），但没有书：空闲时双臂下垂，单手手势时另一只手是 `hangR`；`POSE_ALT` 用笔记本代替书。

**三位娘的共同点**

- 在 `hideFront` 时（`cc/motion.js:937`；gpt `:1000`；gemini `:1071`），整个站立身体和所有手臂图都跳过，脸也不重绘。触发条件是趴下、跪坐、翻滚成球（翻滚进度 0.165–0.835）和背面。
  - 这时手臂手势在 kit 里照常运行，但**看不见**。
  - 脸只剩三张小贴片：shut、smile、talk（`:58-79`）。
- 汗滴、怒气、问号这类特效照样画（`cc/figure.js:200-211`）。
- 背面只在站着时出现；坐着时改成转头（`:659-662`）。
- 说话会覆盖表情的嘴（ω、吐舌、叹气、唱歌）；surprised 保留自己张开的嘴（`cc/face.js:90-116`）。
- 石化时冻结在最后一帧，期间的手势和说话都看不见（`cc/figure.js:173-180`）。
- 没有 `spout`：词表和 `GESTURES` 里都没有，`figure.js`、`face.js`、`motion.js`、`fx.js` 里也没有相关代码（v0.2.6 删掉了残留的挤压、弹簧和 spout 锚点）。kit 读 spout 锚点时有兜底（`A.spout ?? …`，`l.spout || …`），所以不需要占位。〔测试〕`tests/{claude,gpt,gemini}-figure.test.js`

### 9. 不一致：已修复的和仍然存在的

**v0.2.6 已修复**（编号沿用 v0.2.5 时本节的编号）

| # | 原来的问题 | v0.2.6 的做法 |
|---|---|---|
| 1 | 「保持到下一个动作」的说法不准确 | 词表和 `pet_act` 回执改用 `lastingNote`：sit/lie/sleep 写明做手势、换表情不影响；kneel 写明点头也算（`script.ts:148-152`，`world.ts:1430-1433`） |
| 4 | 没有文字的 beat 里的 `<词>` 被悄悄丢掉 | 并进这个 beat 的 `actions`，跟着 beat 开始（`script.ts:111-115`）；页面兜底（`pet-app.js:325-329`） |
| 5 | dialog 不报告不认识的词 | 写 warn 日志，handle 多了 `dropped`（`world.ts:827, 143`） |
| 6 | `pet_walk_to` 在 busy 时被丢掉、等 30 s 才返回 | 原来的判断有误：帧报的 `interrupted (busy)` 本来就马上转给了 World，只是回执写成「换成了别的动作(busy)」。现在写「没走：身体正忙……」和「没走：桌宠的身体还没准备好」（`world.ts:739-740`） |
| 7 | walk/run 的 seconds = 12 比实际走路短，下一个词在途中放出 | 队列等她走完（`done` 或模式变了），最多 90 s（`acts.js:11, 28`） |
| 8 | 大肥鱼 `nervous` 压住 wave、cheer、stretch、scratch、point 的手臂图 | nervous 那行移到手势之前（`whale/figure.js:991`） |
| 9 | 三位娘有画 `spout` 的残留代码，词表里却没有 | 删掉三位娘 `figure.js`、`motion.js` 里的残留代码 |

**仍然存在**

1. **busy 时的竞态**（原第 2 条）：页面在 `layout.busy` 时不放词（`acts.js:27`），所以正常情况下队列里的词不会撞上 busy。只有页面拿到的 layout 晚了一帧时（`body-host.js:164`）才会撞上：这时 `neutral` 返回 true 但什么都不做，页面空等 0.9 s；其他被拒绝的词会回报 `done` 并被丢掉（`body.js:1490-1491`）〔代码；原实测是直接调用 doWord，页面不会这样调〕。这是 kit 的行为，改它会动到非 plus 的帧，所以没改。
2. **被盖住的表情照样倒计时**（原第 3 条）：在晕、睡、倾听时要的表情等于白要，或只剩一点尾巴〔实测〕。同样是 kit 的行为，没改。
3. **`pet_walk_to` 的 30 s 超时可能比走路短**：走路最快 78 px/s（`body.js:735`），在 2560 px 宽的屏幕上走过约九成宽度就要 30 s 左右。这时工具返回「30 秒内没有走到」，她其实还在走（`world.ts:57, 1361-1364`）〔代码〕。
