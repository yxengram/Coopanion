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
> 之后又加了两件（同样只在 plus 下）：
> - **表情对**：同一组里两个表情，如果形象的白名单（`figure.json` 的 `pairs`）里有这一对，就合成一张脸（一个的眼睛、另一个的嘴），不再拆成先后。650 个候选全部渲染、逐格看图挑选后，白名单是：三位娘各 118 对（20 对别名 + 98 对合成）、大肥鱼 98 对（19 + 79；画了 smug、angry、sad、shy 的眼睛后重挑过）、Coo 24 对（13 + 11）；合成对共 99 种。形象的 `pairs` 是唯一的来源：World 按它写的方向把眼那张脸放前、嘴那张脸放后发出，kit 把一组里收到的两个表情合成「第一个的眼 + 第二个的嘴」，不再有自己的表（§一.9「表情对」）。
> - **组里的表情至少持续到同组的手势做完**：和唱歌、看书、喝茶、跳舞同组时，不再在最后一段换回手势自带的脸（§二.6）。
> - **歪头**（`tilt`，歪头/歪脑袋/偏头/好奇）：第 4 个头部手势，好奇地把头歪向一边，停约 1.2 s 再回正（§一.10）；五个形象都画（三位娘和大肥鱼站、坐、跪、趴都画，Coo 由 kit 整组侧倾，趴着时不歪）。
> - **近义名字**：评测里 bot 写了、词表没有而被略过的词，意思确实对得上的收成现有词的名字（挥手、摆手→招手，兴奋、眼睛亮→期待，打哈欠、揉眼、打盹→犯困，微笑→温柔，心疼→担心，站起来→站起，偷偷抬眼、移开视线→害羞，握拳→认真，轻轻点头→点头，抖抖→发抖，好奇→歪头）；拍手、盖被子、被戳、转头没有对得上的词，仍略过（§四）。
> - **跪坐时也能做手上的动作**（大肥鱼和三位娘）：跪坐图的下半身（`poses.kneelLow`，只从跪坐图裁剪，没有生成新图）上面换回会动的上半身，做手势或摆手臂的表情时一帧切进去，手放下 0.25 s 后一帧切回跪坐图；形象声明 `kneelArms`，词表的 `kneel` 带 `keepsArms`，所以 `跪坐+招手` 能同组（§二.5、§二.7、§二.8）。
> - **表情的手臂姿势单独成词**（只在 plus 下，没有新画）：三位娘思考、期待、倾听、害羞时摆的手臂图本来只能靠表情摆出来，现在各成一个手势词：`muse` 琢磨/摸下巴/托腮/托下巴（手指抵着下巴，`chin` 图）、`fist` 加油/握拳/打气/握拳加油（举起小拳头，`fist` 图；握拳这个名字从认真挪过来，Coo 和大肥鱼仍是认真）、`jot` 记笔记/记下来/做笔记/记一下（`write` 图）、`twiddle` 对手指/戳手指/扭捏（指尖在胸前对在一起，`shy` 图）。大肥鱼只有托腮的画，所以只加 `muse`（托腮/撑下巴/托下巴/琢磨）；Coo 一个都不加。四个都是 kit 的 `ARM_GESTURES`（跪坐时走混合体、不结束跪坐），自带的脸：`muse` 没有（配什么表情都行），`fist` 期待、`jot` 看书（倾听的脸会带出声波）、`twiddle` 害羞；声音都用现成的（look、pop、page、shy），导出包不多出声音文件。
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
| Coo | 96 | 51（28 + 23 个组合脸） | 45 |
| 大肥鱼 | 97 | 51（28 + 23 个组合脸） | 46（多 `muse`） |
| Claude 娘、GPT 娘、Gemini 娘 | 99 | 51（28 + 23 个组合脸） | 48（少 `spout`，多 `muse`、`fist`、`jot`、`twiddle`） |

- 组合扩展之前是 72 / 71 个词。新加的 23 个组合脸（§一.9）排在 `giggle` 后面、第一个动作前面；之后又加了 `tilt` 歪头，排在 `sigh` 后面；表情手臂姿势的几个手势词（`muse` 等）排在 `idea` 后面。
- 一个名字在一个形象里只能指一个词（`readVocab` 校验，`vocabId` 查）。五个形象同一个词的名字相同（只有 `song` 不同：三位娘是「哼小曲」，Coo 和大肥鱼是「鲸歌」；`muse` 三位娘以「琢磨」开头、大肥鱼以「托腮」开头），包括上面那些近义名字；只有「握拳」在三位娘那里是 `fist`，在 Coo 和大肥鱼那里是 `determined`。
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
- 渲染成一词一行的清单（`- id 名字/名字：样子`），依次是：
  - 一句例子（`EXAMPLES`）：取第一个所有词都在词表里的。内置形象是 `【瘪嘴+摇头】又没抢到票……<叹气>【跃跃欲试+点头】下次我帮你盯着!<比耶>`（组合脸、同组的和行内的头部动作、手势、行内标记）；上游那样没有这些词的包退回 `【开心+招手】…<眨眼>…`；都不行就不写。放在 `{{pet.vocab}}` 开头，紧跟 `ENV_PROMPT.md` 的 `+` 规则。
  - 表情，按心情分组（`MOODS`）：开心、调皮得意、喜欢害羞、难过、生气嫌弃、惊讶紧张、其他；除「其他」外，组名后面括号里写什么时候用（如「难过(坏消息、陪对方难过)」）。组合脸排在它的基本脸旁边；包自带的表情归「其他」。
  - 形象有别名对（`pairs` 里显示成词表里另一个词的）时，那个词的名字后面写 `(=甲+乙)`，表头说明「同一组写甲+乙也是这张脸」。
  - 有合成对时，表情后面一段「表情对」：一个例子（`PAIR_EXAMPLES`，形象有 happy~surprised 就用它，否则 happy~pout，再否则清单第一个），然后是合成对。不超过 12 对写成一行，多了每个表情一行（`- 开心+难过/嘟嘴/…`，每对只列在清单里靠前的那个下面），最后一句「别的两个表情同组仍先后做。」。没有 `pairs` 的形象没有这些文字。
  - 动作，按部位分组（`partOf`，按 §二.2 的通道）：
    - `头`：只占头；
    - `手`：占手，不占身和站位；
    - `手,要站着或坐着不动(不和身的动作同组)`：占手和站位；
    - `身`：其余，也包括包自带的动作。还占手、头或表情的，名字后面写「(也占…)」：kneel（Coo）、lie、flap、curtsy 也占手，roll 也占手、头，sleep 也占手、头、表情，dizzy 也占表情，包自带的动作也占手、头。大肥鱼和三位娘的 kneel 带 `keepsArms`，只占身和站位，不写「也占手」。
  - `petrify` 的说明后面加上「，不和别的同时做」。
- lasting 词后面由 `lastingNote`（`script.ts:229-233`）写明什么时候结束：
  - sit、lie、sleep：「一直保持：做手势、换表情不影响，换别的姿势或走、跑、跳这类全身动作才结束」；
  - kneel：「保持到下一个手或全身动作，然后变回普通坐着；换表情、点头、摇头、叹气、歪头不影响」；
  - 带 `keepsArms` 的 kneel（大肥鱼和三位娘）：「保持到下一个全身动作，然后变回普通坐着；换表情、点头、摇头、叹气、歪头、只占「手」的手势和唱歌都不影响(她跪着做)；「手,要站着或坐着不动」那组别的动作会让她变回普通坐着」。`lastingNote` 现在收整个词和词表（`lastingNote(v, vocab)`），`pet_act` 回执按 id 查到词再调；点头、摇头、叹气、歪头只写词表里有的（第三方包有跪坐、没有歪头时不提歪头；内置形象四个都有，说法不变）。
- 同时做的写法写在两处〔测试〕`world.test.ts`「tells the bot how to write words at once」：
  - **`ENV_PROMPT.md` 的「说话」一节**：
    - 先说对方看不到神情，每个气泡开头放一张脸：先找对心情那组，再挑最贴切的（组合脸、表情对更准），别总用那几个；说话间用点头、摇头、叹气、歪头接话；
    - 标记表两行：`【词+词】`（先做再换新气泡）、`<词+词>`（打字到这里时做；最多 32 字，不跨行，即 `INLINE_TAG_MAX`）；
    - 下面一段说明：`+` 连起来的同时做，逗号隔开的先后做；一组里表情、头、手、身各最多一个；同一部位的、或一起做不出来的改成先后做，回执里会说；做动作不会打断表情，石化除外，睡觉也会清掉表情；
    - 紧接着是 `{{pet.vocab}}`（例子在它开头）。
  - **工具说明**：
    - `pet_act` 一条（`ENV_PROMPT.md`「移动与动作」）：不说话只做表情或动作，写法见工具说明（不再重复一遍）；姿势被拎起来、戳醒或 `pet_walk_to` 也会结束；
    - `pet_say` 的 `script` 参数（`PKG/src/tools.ts`）：【】与 <> 的区别，`+` 同时做、逗号先后做，例 `【开心+点头】`（不再写会被读成先后做的 `【表情,动作】`）；
    - `pet_act` 的说明和 `actions` 参数。`actions` 仍然是字符串数组，没有嵌套。
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
     - 形象声明了 `kneelArms` 时，手势（`ARM_GESTURES`，`251`）也保持跪坐。大肥鱼和三位娘有 `poses.kneelLow` 时声明它（getter：这套配色的文件都在才是 true，缺了就和以前一样结束跪坐）；kit 只改了注释，非 plus 的帧不变。
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
  - 组合脸的某个部位没有对应的贴图时，按那张脸单独出现时的兜底画。例如没有 smug、angry、sad、shy 眼睛图的旧版大肥鱼（导出包里的旧 `model.json`）用画的睁眼。
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
  - 两个表情写进同一组时，World 会拆成先后两个（§二.6），除非这一对在形象的白名单里（下面「表情对」）。
- 〔测试〕`pet-actions.test.js`「faces made of parts of others」；三位娘的 figure 测试和 `whale-pose.test.js` 都检查了每张组合脸用的是自己的哪张眼睛图、哪张嘴图。〔实测〕看过 `/tmp/combo/faces/final-*.png` 和 `vrend/sheet-<形象>.png`。

#### 表情对：同一组里的两个表情合成一张脸

- **一张表：形象 `figure.json` 的 `pairs`**（可选），是唯一的来源。它列出**这个形象**显示哪些对、怎么显示：
  - `"happy+surprised": "surprised+happy"`：合成，值里前一个给眼、后一个给嘴（键里两个的先后无所谓）；
  - `"happy+smug": "smirk"`：别名，显示成词表里已有的表情。
  - `packs.ts` 的 `readPairs` 检查：键是两个不同的、词表里的表情，都不是 neutral、petrify；值要么是这两个按某个顺序用 `+` 连起来，要么是词表里别的表情（也不是 neutral、petrify，也不是这两个之一）；同一对不能写两次（不管先后）。不合格时整个包读不进来，报错说明哪一项。
- **World**（`script.ts`）：按 `pairKey(a, b)`（两个 id 按码点排序后用 `~` 连起来，只在 World 里用）查这一对。在名单里时不拆开：
  - 合成对按名单的方向发出，**眼那张脸的 id 在前、嘴那张在后**，不管怎么写的（`【开心+惊讶】`、`【惊讶+开心】` 都发 `surprised+happy`），仍排在身体、手、头之后（`sit+wave+surprised+happy`）；
  - 别名对改写成那个词（`smug+happy` → `smirk`），所以任何认识这个词的身体都能做，包括没有 `doAll` 的；
  - 回执说明：「开心 和 惊讶 合成了一张脸:惊讶的眼睛,开心的嘴。」「得意 和 开心 合成了一张脸:坏笑。」。
- **kit**（`body.js` 的 `doGroup`，只在 plus 下）：一组里收到的**前两个表情**（除 neutral、petrify 外的任何表情：基本的、plus 的、组合脸、包自带的词）设成**一张**主动要的脸，名字是内部组合名 `眼+嘴`——第一个给眼（连同它的眉、身体语言、记号），第二个给嘴，由 `faceDef` 已有的解析做出来，不需要配方表。它放在组里其他表情之后做，所以第三个表情盖不掉它。
  - kit 不另存配方表：要是 kit 按自己的表、自己的方向合成，而 World 按形象的名单合并，第三方包（跑在本 fork 的 plus kit 上）列了 kit 表里没有的对、或者方向相反时，回执说的眼和嘴就和身上显示的对不上，甚至 World 说「合成了一张脸」而 kit 根本没合成。现在 kit 只看收到的顺序、World 按名单的方向发，二者总是一致。
- **为什么 World 要读名单**：World 不知道某个包的身体跑的是哪个 kit（安装的包可能自带一份旧的，或者根本不用 kit），所以要由包自己在 manifest 里声明，就像 `vocab` 声明它做得出哪些词；按形象分开列，也能让某个形象去掉在它身上不好看的对（Coo 没有嘴；大肥鱼的名单是在她还缺几张眼睛图时挑的）。导出包的模块集合不变（`*-pack-export.test.js` 固定为 `kit/body.js` + `kit/rig.js`）。
- **线上格式**不变，仍是 `string[]`：合成的一对是一组里的两个成员（`surprised+happy`，或 `sit+wave+surprised+happy`）。
- **一组里三个表情**：World 按写的顺序贪心配对（一个表情能和当前组里唯一的表情配成名单里的一对，就并进去；否则照旧拆到下一组并说明），所以 World 不会在一组里发两个以上的表情，也不会发两个不在名单里的表情。直接调用 `ctl.doGroup` 时，kit 合成收到的前两个，再往后的表情照旧先做、被合成脸盖住。
- **组合脸（23 个）**：内置形象的名单里，组合脸只做别名的目标；组合脸 + 基本表情、组合脸 + 组合脸照旧拆开。`readPairs` 也接受组合脸做成员（World 分不出组合脸和第三方包自己的表情）；kit 能合成它们（作眼时带上它的眉、记号和 `add`，作嘴时给它的嘴）。
- **音色和闪光**：音色取眼那张脸的（包自带的词取它的 `sound`），没有就取嘴那张脸的（都是已有音色，导出包的音效不变）；闪光、弹跳按眼那张脸（happy 2、smug 1、组合脸按它的 `glint`，其他 0；surprised 往下压）；默认 3.2 s，两个里有 sleepy 时 4.4 s；爱心只在单独的 love 时发。
- **和主动要的表情完全一样**：经 `setExpr('眼+嘴')` 设置（`exprAsked`），动作保留它（`keepsFace` 认得两个部分都是表情的组合名），`holdFace` 延长它，被盖住时暂停，`BODY_OWN` 手势叠加成 `眼+嘴+手势自带的脸`（唱歌、叹气换成手势的嘴），被 sleep、拎起、neutral、新表情清掉。
- **形象怎么画**：和组合脸一样走 `fc.parts`。三位娘按 `parts.eyes/mouth/brows/body` 查自己的图；大肥鱼也一样，smug、angry、sad、shy 用自己画好的眼睛（`whale/figure.js` 的 `drawnEye`，同三位娘：睁眼和 smug 的半闭眼换成贴图；眨眼开头和结尾压扁贴图，闭上四成以上一帧切成画的眼睛合到同样程度，所以闭眼那几帧是眼皮和睫毛线，不是一条压扁的彩色细缝（这一步只有大肥鱼有，三位娘的贴图一直压扁到底）；shy 回头看你那一下仍是画的睁眼），其余的睁眼加眉的倾斜；Coo 没有嘴，环的缺口取嘴那张脸的，吐舌画得出，ω 画不出，所以很多对在 Coo 上看起来就是眼那张脸。
- **候选**：可配对的基本表情 26 个（kit 的 18 个和 plus 的 8 个，去掉 neutral、petrify 和组合脸），C(26,2) = 325 个无序对，两种眼嘴方向共 650 个候选；其中 21 对正好是已有的组合脸（可做别名）。候选表在 `scratch/combo2/pairs/`（不进仓库），看渲染图挑选后由 `scratch/combo2/tools/apply-pairs.mjs` 写进各 `figure.json`。
- **怎么挑的**〔实测〕：
  - 5 个形象各把 650 个候选和 27 个基本表情都渲染一遍（当时用示例页的开发开关 `?pairs=ab|ba` + `ctl.doGroup`，0.9 s 时截脸部；开关已删，现在 `ctl.doGroup([眼, 嘴])` 直接就是那张脸），每个形象拼成 22 张 6×5 的对照图，外加一张基本表情参照图；同一对的两个方向挨着放。
  - 一对只有在合成的脸**同时读得出两个词**、又和两张单独的脸都看得出不同时才收，并选定一个方向（谁给眼、谁给嘴）；正好是已有组合脸的那个方向直接收成别名。正负情绪相反的对（如 开心+难过）也看了，多数不收，少数读得通的收了（如 难过眼+开心嘴「含泪笑」）。
  - 三位娘是同一套设计，在 Claude 娘上挑，再拿 GPT 娘、Gemini 娘的图逐对核对：只去掉了 担心+惊讶（GPT 娘那一格看不出担心的眼睛），所以三位娘的表相同；大肥鱼、Coo 各自单独挑。
  - 结果：三位娘 118 对，大肥鱼 98 对，Coo 24 对；Coo 没有嘴，收下的多是吐舌（舌头画得出来）和别名。小的表都是大的表的子集（大肥鱼多一对 担心+惊讶）。
  - 别名 21 对里收了 20 对（三位娘；大肥鱼 19、Coo 13），没收 嫌弃+尴尬（呵呵）。
  - 大肥鱼重挑〔实测〕：她最初的 81 对是在 smug、angry、sad、shy 还没有自己画的眼睛时挑的。画上之后（v0.4.0），把三位娘收了而她没收的 38 对、加上她独有的 担心+惊讶，按三位娘的方向在她身上重新渲染（脸部 2 倍、0.9 s、不眨眼，deepseek、claude、chatgpt 三种配色），每格旁边放眼那张脸和嘴那张脸作对照，用同样的标准逐对看。收了 17 对：难过眼配开心嘴（含泪笑）、温柔嘴（含泪微笑）、惊讶嘴；害羞眼+温柔嘴；生气眼+得意嘴、+温柔嘴；困眼+难过嘴；思考眼+难过嘴、+得意嘴、+担心嘴、+温柔嘴；嫌弃眼+得意嘴、+温柔嘴；偷笑眼+慌张嘴（憋笑）；害怕眼+温柔嘴；别名 狐疑（得意+疑惑）、强颜欢笑（担心+温柔）；担心+惊讶 留着。没收 21 对，原因几乎都在她的嘴：得意、偷笑、温柔的嘴是同一条小弧线，害羞、担心、慌张、害怕、嫌弃的嘴是同一条波浪线，所以只有嘴那张脸的意思在这条线上还读得出来时才收（如 害羞+得意 和 害羞+温柔 一模一样，看不出得意，不收；生气的眼睛配小弧线读得出阴笑，收）；另有几对和一张单独的脸分不开（尴尬的闭眼和偷笑的一样，尴尬+温柔/偷笑/得意 就是偷笑；哭唧唧只是大哭的嘴小一点；惊讶+大哭 就是惊讶）。记录在 `scratch/combo2/judged.json` 的 `whaleRejudge`（每对一句理由），图在 `scratch/combo4/`。
  - 方向是全局的：99 个合成对每对只选了一个方向，三份名单选的方向一致。音色、闪光都用默认（跟眼那张脸）。
  - 记录：`scratch/combo2/judged.json`（每个形象的名单和每对的叫法）、`scratch/combo2/pairs/verdicts.json`（`apply-pairs.mjs` 的输入）。
- **给 LLM 的说明**：`{{pet.vocab}}` 把别名对写在那个词后面（`- smirk 坏笑/贼笑(=开心+得意)：…`），在表情后面一段「表情对」举一个合成对的例子（`如【开心+惊讶】是惊讶的眼睛配开心的嘴`），说「先写哪个都行」（World 会按名单排好），再列合成对。12 对以内写成一行（`开心+惊讶、…`）；多了就每个表情一行，后面跟能和它合成的表情（`- 开心 + 难过/嘟嘴/惊讶/…`），每对只在清单里靠前的那个表情下出现一次（详见 §一.2）。Claude 娘这一段约 510 字，整个词表约 4.0k 字。
- **出厂验证**〔实测〕：用 World 自己的 `parseScript`，按每个形象的词表和 `pairs` 解析 `【A+B】`（一半按键的顺序写，一半反过来），检查得到的组是 `眼+嘴`（按名单的方向）或别名词，再把组在示例页上 `ctl.doGroup`。5 个形象共 476 格（大肥鱼重挑后重跑了她的 98 格），脸名和 `parts` 全部和名单一致，控制台 0 个错误（`scratch/combo2/tools/ship-plan.ts` → `shipshots.cjs`，图在 `scratch/combo2/verify/shipped-<形象>.png`；大肥鱼重跑的 98 格在 `scratch/combo4/verify/shipped-whale.png`，`combo2` 里的那张还是重挑前的 81 格）。
- **测试用的参数**：World 侧 `parseScript`/`parseActions`/`vocabTable` 的 `pairs` 参数（默认空），World 运行时传当前形象的名单。
- **没有 `doAll` 的身体、非 plus 身体**：非 plus 身体没有 `doGroup`，不变。World 只为声明了 `pairs` 的形象合并（5 个内置形象都声明了；导出给上游的包不带 `pairs`），没声明的照旧拆开。声明了合成对、身体却不会合成时（没有 `doAll`），`figure-frame.js` 逐个做，后一个表情胜出，不会出错；页面的 `acts.js` 队列按成员计时，不受影响。
- 〔测试〕`pet-actions.test.js`「two faces of one group shown as one」（26 个基本表情两两、两个方向共 650 种都按「第一个的眼、第二个的嘴」合成；内置名单的每一对经 World 的 `parseActions` 两种写法都发成名单的方向，kit 显示的眼和嘴与名单一致）；三位娘 figure 测试和 `whale-pose.test.js` 用自己的图画名单里的每一对（大肥鱼的 smug、angry、sad、shy 用自己画好的眼睛，shy 回头看你时用画的睁眼：`whale-pose.test.js`「takes smug's, angry's, sad's and shy's own drawn eyes…」；眨眼闭到四成以上是画的眼皮和睫毛线，站、坐、转头、跪坐、趴下都是：「blinks smug's, angry's, sad's and shy's drawn eyes shut…」「kneeling and lying, a drawn eye blinks shut…」）；`PKG/tests/script.test.ts`「two expressions of one group as one face」、`packs.test.ts`、`world.test.ts`。

### 10. 头部通道（plus）

- **kit 侧**：
  - `HEAD_GESTURES = nod, shake, sigh, tilt` 在 `pet.head` 里播放，有自己的时钟，和 `pet.pulse` 里的手势互不顶替。
  - 帧里多一个 `head: {kind, k} | null`（`1375, 1382`），只有 plus 帧有。〔测试〕非 plus 帧没有 `head` 这个键。
  - 形象没把它列进 `figure.gestures` 时，由 kit 用前倾、侧倾、挤压表现（`1107-1118`）。sigh 的这几行从手势块挪到了这里。
  - `sighing` 脸按 `p.head` 计时（`179-180`）。
  - 歪头（`tilt`）：`TILT.dur` 1.8 s，`tiltOf(k)` 前六分之一歪过去、中间停住（约 1.2 s）、最后六分之一回正；声音借上游就有的 `look`（张望、探头那声「嗯？」），所以导出包不多音效文件；没有自带的脸，正在显示的表情照常（主动要的表情胜出）。kit 自己画时（Coo）整组侧倾 `TILT.deg` −12°；趴着时整组不倾斜，所以 Coo 趴着看不出歪头（和点头一样）。
  - 有头部手势时：
    - 躺着不做小动作（`976`）；
    - `layout.moving` 为真（`1572-1573`）。
- **形象侧**：每个形象都有一组同样的辅助函数，在 claude `cc/motion.js:160-200`，gpt、gemini 的 motion.js 里同名，大肥鱼在 `whale/figure.js:218-258`。
  - `gesturesOf(o)` 把帧分成头部手势和手势。帧里没有 `head` 时（上游的 kit），从 `gesture` 里取 nod、shake、sigh，和 v0.2.6 一样。
  - `headMoves(h)` 用 v0.2.6 的公式，只是 k 换成头部自己的；`tilt` 是歪头的 0..1（同 kit 的 `tiltOf`）。
  - 歪头站着、坐着时：头（脖子的平面内转动，大肥鱼同样）歪到 `TILT_DEG`（三位娘 14°，大肥鱼 12°），方向是脸本来就歪的那边（`HEAD_TILT`，比如疑惑往 −x），不歪的脸往 +x；歪头期间取代脸自己的歪，所以「温柔+歪头」「疑惑+歪头」歪得一样多；方向在歪头开始时定下，中途换脸不会翻过去；脸微微抬一点（`angleY` −0.12）。托腮时幅度减小。
  - 趴着时，头也跟着叹气、歪头动（`lieHead`，歪头绕下巴转 `LIE_TILT` 10°）。
- **跪坐的头（`kneelHead`）**：
  - 是挂在 `kneel` 下面的网格变形。用的是四个 `model.json` 里已有的 `poses.kneel.head` 框，没动美术管线。
  - 位置：`cc/motion.js:524-526, 979`，gpt `:561-563, 1042`，gemini `:610-612, 1113`，大肥鱼 `whale/figure.js:525-527, 1271`。
  - 动法：
    - 点头：头往下沉，头顶往下巴方向压扁；
    - 摇头：头横向滑动；
    - 叹气：吸气时头抬起，呼气时头往下沉；
    - 歪头：绕框下沿中点（下巴）转，满幅 9°。
  - 框的两侧和下沿不动，头发不会被撕开。
  - 跪着、趴着的歪头不经过站姿那根头部弹簧（`sp.head`），所以先过 `tiltEased`：歪过去、回正都照原样跟着，但歪着停住时又来一个头部手势（点头、摇头、叹气或再一次歪头）把它截断，头按 `TILT_BACK` 匀速回正（每秒 6 个满幅，满幅约 0.17 s；歪头自己回正最快是每秒 5 个满幅，所以照常回正时不受影响），不会一帧弹回原位（之前跪着、趴着时头顶一帧跳 14～16 个单位）。〔测试〕三位娘 figure 测试和 `whale-pose.test.js`「a head gesture cutting a held tilt short…」
  - 幅度在 `KNEEL_HEAD`（shake 5、nod 2、squash .06、exh 2.5、inh 1.5、tilt 9）。
- **Coo**：没有代码改动，kit 的前倾和侧倾本来就带着头部通道（歪头也是 kit 的侧倾）。
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
| 跪坐标志 | `pet.kneel` | `kneel` | 手或全身动作（`561-562`）；任何非 sit 模式（`525`）。表情、点头、摇头、叹气、歪头不结束它；声明了 `kneelArms` 的形象（大肥鱼和三位娘），`ARM_GESTURES` 里的手势也不结束它 |

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
5. **跪坐保持到手或全身动作**，表情和头部手势不结束它；大肥鱼和三位娘只占「手」的手势也不结束它。
6. **一组词同一帧做**：World 先按部位把一组拆好（§二.6），页面把整组交给 `doAll`，kit 在同一帧里做完（`doGroup`）。组里的表情至少持续到同组手势自带的脸结束（唱歌 4.1 s、看书 4.4 s、喝茶 3.7 s、跳舞 3.4 s）。

### 2. 词的分类与部位（共 96 个，数据来自 Coo 的 `figure.json`；部位见 `script.ts:84-104` 的 `CHANNELS`）

| 类 | 部位（`CHANNELS`） | 词 |
|---|---|---|
| **E 表情（51）** | 表情 | neutral 平静、happy 开心、wink 眨眼、love 喜欢、shy 害羞、surprised 惊讶、angry 生气、sad 难过、sleepy 犯困、thinking 思考、smug 得意、pout 嘟嘴、worried 担心、determined 认真、flustered 慌张、scared 害怕、excited 期待、cry 大哭、confused 疑惑、disgusted 嫌弃、nervous 紧张、gentle 温柔、awkward 尴尬、moved 感动、coax 撒娇、tongue 吐舌、giggle 偷笑；23 个组合脸（§一.9）；**petrify 石化**占全部部位，不和别的同时做 |
| **H 头部手势（4）** | 头 | nod 点头、shake 摇头、sigh 叹气、tilt 歪头 |
| **G 手势（18）**：不改模式 | 手 | wave 招手、shiver 发抖、heart 比心、serve 奉茶、salute 敬礼、vsign 比耶、point 指、cover 捂嘴笑、cross 抱臂、stretch 伸懒腰、pray 拜托、scratch 挠头、idea 有了、hug 抱抱、hips 叉腰、spout 喷水（仅 Coo/大肥鱼）、sip 喝茶、read 看书；Coo 没有的：muse 托腮/琢磨（大肥鱼、三位娘）、fist 加油、jot 记笔记、twiddle 对手指（三位娘） |
| **GB 要她停下来做的手势（7）** | 手 + 站位（提示词里归在「手,要站着或坐着不动」一组） | song 唱歌、spin 转圈、bow 鞠躬、flinch 后缩、peek 探头、away 背过身、cheer 欢呼（详见表下） |
| **turn 转身** | 站位（提示词里写「身」） | 只翻身，不调 `pulse()`（`body.js:576`） |
| **L 持续姿态（4）** | sit：身；kneel、lie：身 + 手（带 `keepsArms` 的 kneel：身 + 站位）；sleep：表情 + 头 + 手 + 身 | sit 坐下、kneel 跪坐、lie 趴下、sleep 睡觉 |
| **M 模式动作（11）** | 身 + 站位；dizzy 另占表情；flap 另占手；roll 另占手和头；curtsy 是手 + 站位 + 身 | stand 站起、walk 走走、run 跑、look 张望、dizzy 晕、dance 跳舞；**busy 类**：jump 跳、hop 小跳、flap 扑腾、roll 翻滚；curtsy 屈膝礼（回到 idle，并起自己的手势） |

GB 类在 kit 里的行为：
- spin、bow、flinch、peek、away：没坐着时先回到 idle。
- cheer：站着时进入 crouch/air。
- song：只在站着或坐着、没在听时能做。

包自带的表情占「表情」；包自带的动作占除表情以外的全部部位（`channelsOf`，`script.ts`）。`kneel` 带 `keepsArms`（包的 `figure.json` 里每个词可写，只对 lasting 的 kneel 起作用）时，`channelsOf` 返回 `['body', 'stance']`：手空出来；静态的 `CHANNELS.kneel` 不变（Coo 和第三方包）。站位留着，所以 GB 类的欢呼、鞠躬、后缩、探头、背过身、转圈和转身仍和跪坐拆开，它们在 kit 里也会结束跪坐。唱歌例外：它在 `ARM_GESTURES` 里，kit 跪着也唱（大肥鱼仍画跪坐图，三位娘画混合体），所以分组时 `clashes` 让带 `keepsArms` 的 kneel 和 song 同组（`KNEEL_SINGS`），`跪坐+唱歌` 发成 `kneel+song`。

**部位表反映的是 kit 实际会拒绝或改变的东西**：
- 唱歌要她站着或坐着不动，所以和走、跳舞、张望、跳、小跳冲突（站位）。
- 屈膝礼会让她站起来（身）。
- 跪坐、趴下、睡觉时看不见手势（手）；而且手势会结束跪坐。大肥鱼和三位娘例外：跪着画得出手势，手势也不结束跪坐（`keepsArms`）。
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
| 同一组里两个表情（`开心+难过`） | 这一对在形象的白名单（`pairs`）里：合成一张脸，回执说明谁给眼、谁给嘴；不在：World 拆成先后两个，回执里说明。白名单按形象不同（三位娘 118 对、大肥鱼 98、Coo 24）。别的「一个表情的眼 + 另一个的嘴」，用组合脸 | 〔测试〕`script.test.ts` |
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
| **kneel** | **跪坐保持**，头在跪坐画上动（`kneelHead`） | Coo：跪坐结束，变成普通坐姿后做手势；大肥鱼和三位娘：**跪坐保持**，换成跪坐下半身（`kneelLow`）上的实时上半身画手势 | 跪坐结束，变成普通坐姿后做 | 替换（kneel → kneel 保持） | 结束 | 结束 |
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
  - 〔实测〕`kneel → nod → wave`：点头时仍跪坐，招手时变普通坐姿（那时还没有形象声明 `kneelArms`）。
- kneel 遇到 G 那一格的大肥鱼和三位娘部分，是「跪坐时也能做手上的动作」加的：〔测试〕`pet-actions.test.js`（`kneelArms` 时 `doGroup(['kneel','wave'])` 保持跪坐、`kneel+cheer` 结束），`tests/{claude,gpt,gemini}-figure.test.js`（共用 `tests/helpers/kneel-arms.js`）、`tests/whale-pose.test.js`。
- kit 层面能共存，不代表形象画得出来，见 §8。

### 6. 经 LLM 下指令时，实际能「同时」出现的组合

**一组同时做（`a+b`）**〔测试〕`script.test.ts`「words at once」、`world.test.ts`；〔实测〕`edge/t1.mjs`、`/tmp/combo/vind-ours-*.log`：

- **写法**：
  - 在 `【】`、`<>`、`pet_act` 的每一项、dialog 的 `actions` 里，用 `+` 或全角 `＋` 连起来。`+` 两边可以有空格。
  - `【】` 里的逗号、顿号、空白仍然表示先后。
- **部位**：一组里表情、头、手、身（含站位）各最多一个，所以一组最多 5 个成员（白名单里的表情对算一个表情，最多 6 个），body-host 的 8 个上限碰不到。
- **能成组的例子**：`【坐下+开心+招手】`、`<点头+眨眼>`、`【点头+招手】`、`【摇头+抱臂】`、`【坐下+点头+比心】`、`【跪坐+点头+开心】`、`【唱歌+坏笑】`、`【坐下+唱歌】`、`【走走+开心】`、`【小跳+招手+开心】`、`【张望+疑惑】`；大肥鱼和三位娘还有 `【跪坐+招手】`（`招手+跪坐` 也一样，身在前发成 `kneel+wave`）和 `【跪坐+唱歌】`。
- **拆组**：同一部位的、或一起做不出来的，从冲突的那个成员起拆成下一组，按先后做。
  - 回执的 `[执行参数]` 行会写，例如「招手 和 比心 不能同时做，改成先后做。」。
  - 会被拆开的例子：
    - 两个手势、两个表情（不在形象白名单里的对）、点头 + 摇头；
    - `走走+唱歌`（站位）、`坐下+屈膝礼`（身）；
    - `趴下+招手`（手），以及 Coo 的 `跪坐+招手`；`跪坐+欢呼`、`跪坐+转身`（站位，所有形象）；
    - `晕+开心`、`睡觉+开心`（表情）；
    - 石化 + 任何词。
  - 不认识的成员丢掉并列出，其余照做；`开心+` 这样的空成员忽略；重复的成员只算一次。
- **线上格式**：仍然是 `string[]`，一组是成员 id 用 `+` 连起来。
  - World 排成 身/站位 → 手 → 头 → 表情（`rankOf`，`script.ts:110`）。
  - kit 自己再按 `groupRank` 排一遍（§一.6）。
- **名字里带 `+` 的词**：先整个查，所以单独用没问题，但不能做一个更大的组的成员。
- **队列时长**：一组占着队列，直到最长的成员结束，或者每个成员都报了 `done`。组里有 walk 时，等她走完。
- **两个表情合成一张脸**：形象白名单（`pairs`）里的一对写在同一组（如 `【开心+惊讶】`）时，不拆开，按名单的方向发成 `眼+嘴`（`surprised+happy`，先写哪个都一样），合成一张脸，回执写「开心 和 惊讶 合成了一张脸:惊讶的眼睛,开心的嘴。」；别名对写成那个词（「得意 和 开心 合成了一张脸:坏笑。」）。白名单见 §一.9「表情对」。
- **组里的表情持续到同组的手势做完**〔测试〕：`doGroup` 做完一组后，把主动要的表情延长到这一组的手势新设的自带脸（`pet.own.*`）里最晚的结束时间。以前组里的表情是最后做的，只持续自己的 3.2 s，最后一段会换回手势自带的脸（唱歌约 0.9 s、看书约 1.2 s、喝茶约 0.5 s）。跳舞不一样：它自带的 happy 在身体通道里，跳舞 3.2 s 结束时就被清掉，所以以前并没有换回 happy（实测 `跳舞+坏笑`：0.00 s 坏笑，3.20 s 平常的脸）；现在表情显示到 happy 名义上的结束 3.4 s，比跳舞多 0.2 s，没有闪回要去掉。现在：

| 组 | 手势自带的脸 | 表情显示到（之前 → 现在） |
|---|---|---|
| `唱歌+坏笑` | singing 4.1 s | 3.2 → 4.1 s，全程 `smirk+singing+singing` |
| `看书+生气` | reading 4.4 s | 3.2 → 4.4 s，全程 `angry+angry+reading` |
| `喝茶+开心` | sipping 3.7 s | 3.2 → 3.7 s |
| `跳舞+开心` | happy 3.4 s（身体通道，跳舞 3.2 s 结束时清掉） | 3.2 → 3.4 s（以前也没有换回 happy） |
| `端茶`、`伸懒腰`、`抱抱`、`抱臂` + 表情 | 2.7 s | 3.2 s，不变 |
| `走走`、`跑`、`张望`、`坐下` + 表情 | 没有 | 3.2 s，不变（走路没有固定的结束时间，表情跟着走 20 s 会显得卡住；写成先后也一样） |

  写成先后（`【坏笑, 唱歌】`）本来就会盖到手势结束（`holdFace`）；`【唱歌, 坏笑】`（先手势后表情）不变，表情到期后手势自带的脸接着显示。非 plus 身体和没有 `doAll` 的身体没有 `doGroup`，不受影响。

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
- **kneel + 后面的表情、点头、摇头、叹气**：跪坐保持（v0.2.6 遇点头就结束）。Coo 的手势仍然结束跪坐，变成普通坐姿；大肥鱼和三位娘的手势（只占手的）跪着做，跪坐保持。
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
| **lie 趴下** | 每 4–8 s 自己做一个小动作（kick/chin/thump），新手势或正在播的头部手势会顶掉或推迟它（`976`）；song 被拒绝；表情照常画在趴姿图的头上（站姿的眼睛、嘴图按趴着的头转正、缩放后贴上，组合脸、眨眼、视线、说话口型都在）；头部手势和叹气由 `lieHead` 画；三位娘和大肥鱼趴着时手臂看不见 | 〔实测〕`973-977, 558`；〔代码〕`cc/motion.js:952, 986` |
| **kneel 跪坐** | 保持到下一个手或全身动作。表情、点头、摇头、叹气、歪头都不结束它，头部手势由 `kneelHead` 画；一组 `kneel+nod+happy` 30 s 后仍是跪坐。大肥鱼和三位娘声明 `kneelArms`：只占手的手势和唱歌也不结束它。手放着不动时画跪坐图（跪坐图上画实时的脸，同站姿）；手臂摆出姿势时（手势、托腮这类表情的手臂，三位娘的倾听除外），一帧换成**跪坐混合体**：跪坐图裁出的下半身（`poses.kneelLow`：裙摆、腿、尾巴，去掉手臂和裙边以外的头发）上面是会动的上半身、头和实时的脸，头正好落在跪坐图的头上（下沉 `headDrop`），气泡位置不动；手放下 0.25 s（`KNEEL_ARMS_HOLD`）后一帧换回跪坐图。跪坐中起身也是混合体 → 跪坐图 → 站，不经过坐姿图 | 〔实测〕`edge/t1.mjs`；〔测试〕`561-562`、`tests/helpers/kneel-arms.js`、`whale-pose.test.js` |
| **sit 坐下** | 表情、手势、头部手势、GB 都能叠加，仍保持坐姿；空闲逻辑不会让主动要的坐姿超时；站起来时主动要的表情在 wake 期间暂停 | 〔实测〕`580, 957` |
| **sleep 睡觉** | 见表下 | 〔实测〕`582, 710, 566` |
| **dance 跳舞** | 3.2 s；手势、头部手势叠加；主动要的表情盖过跳舞自带的 happy，跳舞继续；GB、L、M 打断；petrify 让它停下 | 〔实测〕`588, 727` |
| **walk/run 走 / 跑** | 见表下 | 〔实测〕`509-514, 788-797, 1633`；〔测试〕`tests/pet-actions.test.js`、`world.test.ts` |
| **talk 说话** | 口型叠在任何表情、手势、姿态上；组合脸说话时眼睛不变、嘴换成说话的嘴；石化时不动；趴着、跪坐时也一样（大肥鱼和三位娘的脸画在趴姿图、跪坐图上） | 〔实测〕kit 部分、`edge/t3.mjs`；〔代码〕形象部分 |
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
- 托腮姿势只有 thinking 和 `muse` 手势（播放中 `k` 0.02–0.9，任何表情下）会摆（`chinWanted`）；遇到占用远侧手臂的手势会很快放下（`:71, 934-935`）。跪坐时 `muse` 和 thinking 一样切进混合体，托腮的手放下（约 1.5 s，`chinK` 慢慢回落）再过 `KNEEL_ARMS_HOLD` 切回跪坐图。
- `nervous` 的僵硬手臂写在 dance 之后、各手势之前（`:1041`）：
  - 它压过走路、被拎、空中、坐着和跳舞的手臂；
  - 但手势从它出发，手臂图照常接手，wave、cheer、stretch、scratch、point 在 nervous 时都画得出来。
  - 〔测试〕`tests/whale-pose.test.js`
- `coax` 只在没有手势时压手臂角度（`!g`，`:1062`），手势照常。
- 说话时保留 coax 的 ω 嘴。
- 坐着时 `backable()` 为 false，改成转头（`:534`）。
- 趴下、跪坐、翻滚和背面时隐藏正面（`:1277-1297`）。跪坐混合体时不隐藏：跪坐图按 `kneelB·(1−armsB)` 溶在不透明的混合体上（`seatStep` 的 `armsB`，`kneelAlphas`），一帧切换。
- 跪坐时头部手势用 `kneelHead`（`:525-527, 1271`）。
- 跪坐、趴下时脸是实时的：`poses.<kneel|lie>.face`（空白脸 `<id>_blank` + 头发前景 `<id>_fringe` 两张图，中间是实时脸贴图 `<id>Fx`）。`paintFace` 带上 `face.place` 再画一遍：每只眼睛（连同它那边的腮红、眼泪）和嘴各按自己的矩阵从站姿脸的像素贴到趴着、跪着的头上（转正、缩放，趴着时远侧的眼睛窄一些），所以 smug、angry、sad、shy 的眼睛图也跟着上去。脸挂在 `kneelHead` / `lieLegs` 上，跟着点头、摇头、叹气、呼吸和趴着时头的歪动；透明度跟跪坐图、趴姿图一样，所以一帧切换时跟着切。趴着时这三张用 12×8 的网格（`FLOOR_GRID`，空白脸和头发前景的写在 model.json 里），头转动时跟趴姿图的细网格贴在一起，头发前景不会在图上的头发上滑开。8 套配色各有一张空白脸：由默认配色那张按各自的颜色重新上色（不要直接拷默认配色的，它的发梢在头发前景的羽化边下会透出 DeepSeek 的蓝头发）；头发前景按各自的跪坐图、趴姿图裁。缺这两张图的配色仍用笑、闭眼、说话贴片。〔测试〕`tests/whale-pose.test.js`
- 跪坐混合体：手势有手臂图或抬手（招手、比心、欢呼的手臂、发抖、端着的东西、抬手类）或托腮时切进去；唱歌、喷水和表情带的手臂角度不算（仍画跪坐图）。她的身体按坐着的 rig 下沉 19.4，腰（`st.waist.ty`）抬回 `headDrop − (low − 9.6·sitK)`，所以头落在跪坐图的头上；混合体时藏起站姿和坐姿的裙子、腰后的蝴蝶结、腿和尾巴，`kneel_low`（z 5.2，同她的裙子）画尾鳍。8 套配色各有一张 `kneel_low`，用同一套蒙版从各自的跪坐图和裙子裁出。
- 组合脸由 `paintFace` 按部位画眼睛和嘴。smug、angry、sad、shy 有自己画好的眼睛（`drawnEye`；8 套配色各一份），所以 smirk、doubt、bashful、huff、sulk 和眼睛取自这四张脸的表情对也用它们；这时眼皮褶（`eye_creases`）淡出，贴图自带。眨眼（和 kit 让她闭眼）闭上超过 `DRAWN_SHUT`（0.4）时换成画的眼睛，眼皮按同样程度落下，闭眼的帧有眼皮和睫毛线；这之前贴图只压扁（`sy = 1 - .9·shut`），一帧切换藏在眨眼里。站、坐、转头和跪坐、趴下的实时脸走的都是这一处。shy 回头看你那一下（plus 的 shy 每 2.6 s 一次）用画的睁眼。worried、determined 仍是画的睁眼加眉。〔测试〕`tests/whale-pose.test.js`

**Claude 娘**

- 手臂由 `armPlan`（`cc/motion.js:275-295`）决定。手臂类手势（`ARM_ONE`/`ARM_BOTH`，`:230-235`）在播放期间以及结束后 0.4 s 内，都会压住表情带来的手臂姿势（`FACE_ARMS`，`:237-240`）。`FACE_ARMS` 的四张图也各有自己的手势词：`muse`→`chin`、`fist`→`fist`（单手，另一只手抱书）、`jot`→`write`、`twiddle`→`shy`（双手）。跪坐时不摆倾听的笔记本（`KNEEL_FACE_SKIP` 按表情算），`jot` 手势照样切进混合体。头部手势不进 `armPlan`，不压手臂。
- 表情要摆手臂，需要两个条件：处在平静模式（idle/look/sit/sleep/wake），并且表情持续超过 0.3 s。组合脸按 body 部位摆手臂，比如 huff 抱臂；唱歌叠加时是祈祷手。
- **抱书**：
  - 空闲时抱着书；
  - 单手手势时，另一只手用 `bookside` 夹着书；
  - 双手手势或表情姿势时，书不见；
  - 跪坐时把书放到一边（`armPlan` 的 `kneel` 是 kit 的跪坐标志）：空闲时双手放下，单手手势的另一只手垂下（`hangR`，不是 `bookside`），所以跪坐混合体里不出现书。
- 被拎或晕时双臂下垂，任何姿势都不显示（`:278`）。

**GPT 娘、Gemini 娘**

- 规则与 Claude 娘相同（`armPlan` 在 gpt 的 `:272`、gemini 的 `:274`），但没有书：空闲时双臂下垂，单手手势时另一只手是 `hangR`；`POSE_ALT` 用笔记本代替书。

**三位娘的共同点**

- 在 `hideFront` 时（`cc/motion.js`、gpt、gemini 的 `step` 末尾），整个站立身体和所有手臂图都跳过，脸也不重绘。
  - 触发条件：趴下、跪坐（跪坐图不透明时）、翻滚成球（翻滚进度 0.165–0.835）和背面。跪坐混合体时不隐藏。
  - 这时手臂手势在 kit 里照常运行，但**看不见**。
  - 脸不重绘站姿的那张，改画在跪坐图、趴姿图上：`poses.<kneel|lie>.face`（空白脸 + 头发前景两张图，中间是实时脸贴图 `<id>Fx`）。`face.js` 的 `paint(..., place)` 把每只眼睛（连同腮红、眼泪）和嘴各按自己的矩阵贴到那个头上，鼻子用图上自己的；`motion.js` 的 `liveFace` 把三张挂在 `kneelHead` / 趴姿的 `lieLegs` 上（趴着时网格 12×8，见 `FLOOR_GRID`），`step` 返回 `floorFace`，`figure.js` 照它画。实时脸的透明度跟跪坐图、趴姿图一样：跪坐混合体一帧换回跪坐图时，混合体头上站姿的脸和跪坐图上的脸是同一张，不会跳；起身时跪坐图还在，脸也还在。shut、smile、talk 三张贴片留着，只在缺空白脸、头发前景图时用。〔测试〕`tests/helpers/floor-face.js`
  - 跪坐时头部手势由 `kneelHead` 画在跪坐图上（`cc/motion.js:524-526, 979`）。
- **跪坐混合体**（第四个身体 `kneelArms`，`BODY_Z` 1.5，在坐姿和跪坐之间）：
  - 跪坐时手臂摆出姿势（`armPlan` 计划了 `book`、`bookside`、垂下的手以外的手臂图，或用垂下的手代替缺的图）就切进去；在混合体里，手臂图还在淡出时、手放下后再 0.25 s（`KNEEL_ARMS_HOLD`）都保持，连着做的手势之间不切回跪坐图。只是还在淡出的手臂图不会让她切进混合体（坐着做完手势或摆过手的表情马上跪坐，仍是坐姿图一帧换跪坐图）。倾听（`KNEEL_FACE_SKIP`）跪着不摆写字的手。
  - Claude 娘：只有混合体里（或跪坐却没有跪坐图时）书才放到一边，单手手势另一只手垂下；往下跪、在跪坐图下面和起身时照旧拿着书。跪坐图完全挡住她时，放着的手（书 ↔ 垂下）直接换好不淡入淡出，所以混合体一切进来就是计划好的手，起身时手里已经拿着书。
  - 切换都是一帧（`bodyStep`、`BODY_CUT`）：跪坐图在不透明的混合体上溶掉，或反过来。
  - `kneel_low`（z 3.05，在站姿裙子之上、上身之下）挂在自己的地面变形器 `kneelLow` 上，跟着身体转和挤压（`st.kneelLow` 抄 `st.body`），腰的接缝不会裂开；混合体时藏起站姿裙子、鞋和 `poses.kneelLow.hides`（GPT 娘、Gemini 娘的尾巴，画在 kneel_low 里）。
  - 混合体里头直接下沉整个 `headDrop`（从站姿直接 `跪坐+招手` 时不再慢慢往下飘），kit 的点（气泡等）跟着。
  - 三位娘 `figure.js` 的 `kneelArms` getter：有 `poses.kneelLow` 并且贴图在才是 true。
- 汗滴、怒气、问号这类特效照样画（`cc/figure.js:201-212`）。
- 背面只在站着时出现；坐着时改成转头（`cc/motion.js:707-710`）。
- 说话会覆盖表情的嘴（ω、吐舌、叹气、唱歌），组合脸也一样，眼睛不变；surprised 保留自己张开的嘴（`cc/face.js:90-116`）。
- 石化时冻结在最后一帧，期间的手势和说话都看不见（`cc/figure.js:174-181`）。
- 没有 `spout`：词表和 `GESTURES` 里都没有，`figure.js`、`face.js`、`motion.js`、`fx.js` 里也没有相关代码。kit 读 spout 锚点时有兜底（`A.spout ?? …`，`l.spout || …`），所以不需要占位。〔测试〕`tests/{claude,gpt,gemini}-figure.test.js`

**导出到上游的包**
- 大肥鱼和三位娘的导出包自带 kit 和形象代码，所以在上游 v0.1.17 里也有组合脸、头部通道和这套表情规则。
- 上游的 World 没有组，词一个一个到；`a+b` 在那里是不认识的词，会被丢掉并报告。
- 〔实测〕用上游的验证脚本把整张词表逐个跑过：
  - 大肥鱼 95 个词，三位娘各 94 个（加歪头之前）；
  - 23 个组合脸都画得出来，没有控制台错误；
  - 跪坐时点头、摇头、开心、叹气都保持跪坐。
  - 日志在 `/tmp/combo/vind-<形象>.log`。
- 跪坐混合体也在导出包里：`export-pack.mjs` 按 `poses.*.required` 复制贴图，`kneel_low.png`（大肥鱼每套配色一张）跟着走；包里 `kneel` 的 `keepsArms` 上游的 `readVocab` 不认，会丢掉，上游的 World 把跪坐和招手一个一个发，自带的 kit 照样保持跪坐。
- 跪坐、趴下的实时脸也在导出包里：`poses.*.face.parts` 的 `kneel_blank`、`kneel_fringe`、`lie_blank`、`lie_fringe`（大肥鱼每套配色一份）是普通贴图，`export-pack.mjs` 照样复制；上游 v0.1.17 里用包里自带的形象代码画。
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
| 跪坐、趴下的脸只有笑、闭眼、说话三张贴片（原「仍然存在」第 4 条） | 实时脸：站姿的眼睛、嘴图贴到跪坐图、趴姿图的头上（`face.js` / `paintFace` 的 `place`、`<id>_blank` / `<id>_fringe`），组合脸、眨眼、视线、说话口型都在（§二.8） |
| 没有形象声明 `kneelArms`（原「仍然存在」第 7 条） | 大肥鱼和三位娘跪着画得出手势（跪坐混合体），声明 `kneelArms`；词表的 `kneel` 带 `keepsArms`，World 把 `跪坐+招手` 排进同一组，回执和词表写明手势不结束跪坐 |
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
3. ~~**组里的表情只持续自己的 3.2 s**~~：已修复，组里的表情至少持续到同组手势自带的脸结束（§6）。
4. ~~**画不出实时的脸**~~：已修复，见上表。跪坐图、趴姿图上的脸不带站姿 rig 单独会动的眉（`brows`）和大肥鱼的眼皮褶，用图上自己的眉；带眉的表情图（angry、sad 等）照样画出眉。
5. **背过身时看不见点头**：三位娘和大肥鱼都是这样，摇头只让后面的头发晃一晃。
6. **名字带 `+` 的词不能做组的成员**：单独用可以。
7. ~~**没有形象声明 `kneelArms`**~~：已修复，见上表（大肥鱼和三位娘；Coo 跪坐就是坐，做手势仍变回普通坐着）。欢呼、后缩、探头这些「要站着或坐着不动」的手势仍结束跪坐（唱歌除外，跪着也唱）。
8. **两个表情同组只限白名单里的对**：三位娘 118 对、大肥鱼 98 对、Coo 24 对（§一.9「表情对」），别的两个表情仍拆成先后；方向是全局的，某个形象想要另一个方向就只能不收。
9. **组合脸在 Coo 上不如在三位娘上明显**：Coo 没有嘴。（大肥鱼原先缺 smug、angry、sad、shy 的眼睛图，已补上；她的白名单是补图之前挑的，没有重挑。）
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

### 表情对之后〔实测〕

- 探针：`scratch/combo2/tools/matrix4.mjs`（matrix3 改成仓库路径，词同上 68 个），`--pairs` 把一张表交给 kit 的 `opts.pairs`（当时的 kit 有这个参数；现在已删，plus kit 会把一组里任意两个表情合成，下面的数字是当时测的）。
- 「之前」给空表；「之后」给每个形象自己的表（`scratch/combo2/tools/shipped-tables.mjs` 从它的 `figure.json` 的 `pairs` 生成：合成对用出厂配方，别名对用那张组合脸的眼和嘴，因为 World 发的是组合脸这个词，两个表情都看得见）。直接推 `a+b` 给 kit、不经过 World，所以要按形象给表。
- 结果在 `scratch/combo2/pairs/matrix/<形象>-<跑法>-{before,shipped}.json`：

| 跑法 | 之前 | 之后 | 变化 |
|---|---|---|---|
| Coo，依次 | 1104 | 1104 | 无 |
| Coo，`a+b` 成组 | 1367 | 1391（61.1%） | 只有 E×E 0 → 24/351 |
| Claude 娘，依次 | 1079 | 1079 | 无 |
| Claude 娘，`a+b` 成组 | 1349 | 1467（64.4%） | 只有 E×E 0 → 118/351 |

- 变差的词对 0。依次写的两个表情本来就是先后各一张脸，不变。
- 作为上限参考：给全部 325 对（`table-ab.json`）时，成组 E×E 是 325/351，Coo 1692、Claude 娘 1674。

### 变差的词对：0

四次跑都没有。以前看得见的词对，不管写成组还是写成先后，现在都还看得见。

### 还看不见的，都是设计如此或画法的限制

- **表情 × 表情**：上面的表是表情对之前的数，同一组里的两个表情都拆成先后，所以是 0；常用的一眼一嘴组合由 23 个组合脸当单独的词。表情对上线后的数见下面「表情对之后」：成组时白名单里的对看得见，Coo 24/351、Claude 娘 118/351（上限 325/351，和 petrify 的 26 对设计上不合并）。
- **手势 × 手势**：成组时看得见的 75 对，全是头部手势配一个手的手势（点头、摇头、叹气 + 手势）。手 + 手仍是 0/300，因为只有一个手势槽。
- **姿态 × 表情少的 27 对**：都是睡着时要的表情，睡着时眼睛一直闭着。
- **姿态 × 手势少的**：多数是会结束跪坐的手势，另有几个趴着或睡着时做不了（唱歌、屈膝礼、背过身）。
  - 这一节的矩阵是在「跪坐时也能做手上的动作」和「跪坐、趴下时的实时脸」之前测的，没有重跑。跪坐、趴着 × 表情原来只看得出符号和嘴型的那些，现在脸也画得出来（§二.8）。之后大肥鱼和三位娘的跪坐 × 只占手的手势（同组或先后）都画得出来、跪坐保持（跪坐混合体，§二.7）；Coo 不变。由 `tests/helpers/kneel-arms.js`、`whale-pose.test.js` 和 `scratch/combo3/shots/` 的渲染核对。
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

## 四、bot 实际怎么用〔实测〕

能同时出现不等于 bot 会用。为此用应用自己的 Core、Cormini 和桌宠 World 搭了一个离线评测（不在仓库里），把 45 段典型对话（问候、夸奖、逗弄、坏消息、请求表演、两轮对话等）发给模型，按 World 真实的回执统计它用了什么。

- 模型：DeepSeek v4.1 flash（经 OpenRouter，Responses 接口，thinking 开、high，和应用默认一样）；形象：Claude 娘；每个场景 3 次，每边 150 条回复，都没有失败。
- 改前：v0.3.0 的提示词；改后：这次的提示词（表情按心情分组、组合表情放进各自的组、规则旁配不同的例子、工具说明的例子用 `+`），加上表情对。

| 指标 | 改前 | 改后 |
|---|---|---|
| 带表情动作的回复 | 98% | 98.7% |
| 用了 `+` 组合的回复 | 70% | 89.3% |
| 组合整组执行（没被拆开） | 88.5% | 96.4% |
| 用了组合表情的回复 | 12.7% | 38% |
| 用到的组合表情种类 | 8 | 13 |
| 用到的不同词（共 94） | 62 | 70 |
| 写错被略过的词 | 18 次 | 5 次 |
| 两个表情合成一张脸 | 0（v0.3.0 没有） | 4 次 |
| 点头、摇头、叹气 | 40 次 | 24 次 |

仍然存在：「温柔」用得最多（改前 97 次，改后 119 次）；点头、摇头、叹气少了。bot 写错的词多是没有的动作（歪头、拍手、揉眼），或现有词的近义说法（兴奋、好奇、微笑）。

之后：歪头成了词（`tilt`），对得上的近义说法收成了现有词的名字（见开头）。几轮评测里被略过的词：好奇 ×6、歪头 ×5、兴奋 ×4、挥手 ×3、拍手 ×2，打哈欠、揉眼、打盹、微笑、心疼、站起来、转头、偷偷抬眼、移开视线、眼睛亮、握拳、摆手、轻轻点头、抖抖、被戳、盖被子各 1 次；现在只剩拍手、转头（说的是转身回来或转向你，转身是整个人转过去）、被戳、盖被子还会被略过。

### 第二轮：歪头、别名和提示词（同样的评测，每边 150 条回复）

加了「歪头」和 bot 常写的别名之后，又比较了三种提示词：C 是当时的现状；A 小改（一句指引、温柔/叹气/奉茶的说明）；B 改得多一些（先找心情组再挑最贴切的、心情组标题写上什么时候用、例子里带点头和叹气）。最后采用 B。

| 指标 | C | A | B（采用） |
|---|---|---|---|
| 用了 `+` 组合的回复 | 84% | 84.7% | 90.7% |
| 组合整组执行 | 96.7% | 91.2% | 95.4% |
| 用了组合表情的回复 | 37.3% | 37.3% | 39.3% |
| 点头、摇头、叹气、歪头 | 47 次 | 93 次 | 138 次 |
| 两个表情合成一张脸 | 0 | 3 | 3 |
| 写错被略过的词 | 10 次 | 11 次 | 5 次 |
| 用到的不同词 | 63 | 71 | 65 |
| 温柔 | 69 | 69 | 70 |

「温柔」从第一轮的 119 次降到 69 次左右，靠的是别名和歪头（「好奇」现在就是歪头），提示词本身没有再降低它。
