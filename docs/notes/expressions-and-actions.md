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
> - **表情对**：同一组里两个表情，如果形象的白名单（`figure.json` 的 `pairs`）里有这一对，就合成一张脸（一个的眼睛、另一个的嘴），不再拆成先后。650 个候选全部渲染、逐格看图挑选后，白名单是：四位娘各 135 对（20 对别名 + 115 对合成）、大肥鱼 106 对（19 + 87；画了 smug、angry、sad、shy 的眼睛后重挑过）、Coo 24 对（13 + 11）；合成对共 116 种（v0.8.1 加了四个新表情的 17 对，见 §一.9「表情对」）。形象的 `pairs` 是唯一的来源：World 按它写的方向把眼那张脸放前、嘴那张脸放后发出，kit 把一组里收到的两个表情合成「第一个的眼 + 第二个的嘴」，不再有自己的表（§一.9「表情对」）。
> - **组里的表情至少持续到同组的手势做完**：和唱歌、看书、喝茶、跳舞同组时，不再在最后一段换回手势自带的脸（§二.6）。
> - **歪头**（`tilt`，歪头/歪脑袋/偏头/好奇）：第 4 个头部手势，好奇地把头歪向一边，停约 1.2 s 再回正（§一.10）；五个形象都画（三位娘和大肥鱼站、坐、跪、趴都画，Coo 由 kit 整组侧倾，趴着时不歪）。
> - **近义名字**：评测里 bot 写了、词表没有而被略过的词，意思确实对得上的收成现有词的名字（挥手、摆手→招手，兴奋、眼睛亮→期待，打哈欠、揉眼、打盹→犯困，微笑→温柔，心疼→担心，站起来→站起，偷偷抬眼、移开视线→害羞，握拳→认真，轻轻点头→点头，抖抖→发抖，好奇→歪头）；拍手、盖被子、被戳、转头没有对得上的词，仍略过（§四；拍手后来有了新画的手势 `clap`，三位娘和大肥鱼认得，Coo 仍略过）。
> - **跪坐时也能做手上的动作**（大肥鱼和三位娘）：跪坐图的下半身（`poses.kneelLow`，只从跪坐图裁剪，没有生成新图）上面换回会动的上半身，做手势或摆手臂的表情时一帧切进去，手放下 0.25 s 后一帧切回跪坐图；形象声明 `kneelArms`，词表的 `kneel` 带 `keepsArms`，所以 `跪坐+招手` 能同组（§二.5、§二.7、§二.8）。
> - **表情的手臂姿势单独成词**（只在 plus 下，没有新画）：三位娘思考、期待、倾听、害羞时摆的手臂图本来只能靠表情摆出来，现在各成一个手势词：`muse` 琢磨/摸下巴/托腮/托下巴（手指抵着下巴，`chin` 图）、`fist` 加油/握拳/打气/握拳加油（举起小拳头，`fist` 图；握拳这个名字从认真挪过来，Coo 和大肥鱼仍是认真）、`jot` 记笔记/记下来/做笔记/记一下（`write` 图）、`twiddle` 对手指/戳手指/扭捏（指尖在胸前对在一起，`shy` 图）。大肥鱼只有托腮的画，所以只加 `muse`（托腮/撑下巴/托下巴/琢磨）；Coo 一个都不加。四个都是 kit 的 `ARM_GESTURES`（跪坐时走混合体、不结束跪坐），自带的脸：只有 `jot` 有，是看书（倾听的脸会带出声波）；`muse`、`fist`、`twiddle` 没有，配当时的表情（`fist`、`twiddle` 原先自带期待、害羞，可这两张手臂图本来就是期待、害羞的，单做时和那两个表情一模一样，所以去掉）；托腮的声音用上游就有的 look；加油、记笔记、对手指原先借 pop、page、shy，现在各有自己的声音 `fist`、`jot`、`twiddle`（见下面「新手势和新表情的音效」）。
> - **头部和身体的六个动作**（只在 plus 下，没有新画，只用现有骨架）：`droop` 低头/垂头/低下头（第 5 个头部手势：头低下去、眼睛往下看，停约 1.2 s 再抬起）、`blink` 眨眨眼/眨巴眼/眨巴眨巴（第 6 个头部手势：连着快快地眨三下眼，kit 给三次 `frame.blink`，任何形象都看得见；平时自己偶尔也会连眨两下，所以要三下才看得出是故意的）、`closer` 凑近/凑过来/凑近点（上身连头整个变大一点，像凑到你跟前）、`leanback` 后仰/往后仰/向后仰（上身往后、变小一点、下巴抬起）、`sway` 晃来晃去/左右摇晃/摇头晃脑/晃悠（整个身子绕脚左右晃三下；「摇摆」仍是跳舞）、`stamp` 跺脚/跺跺脚/直跺脚（kit 抬起前面那只脚、使劲落下两次，落地声、扬尘、整组一震；坐着、趴着会先站起来）。大肥鱼和三位娘都加，Coo 不加（kit 在 Coo 身上也做得出，但 Coo 不再扩词）。低头、眨眨眼走头部通道，跪坐保持；凑近、后仰、晃来晃去是「手,要站着或坐着不动」那组（和鞠躬、探头一样，结束跪坐、变回普通坐着），跺脚和屈膝礼一样站起来做（手 + 站位 + 身）。都没有自带的脸。声音：凑近用探头那声（包里本来就有）、晃来晃去用跳舞的曲子、跺脚用落地声（都是上游有的），眨眨眼和低头不出声；导出包不多出声音文件。看图后没收的：回头/转头（正面的三位娘转头只像往旁边看一眼，大肥鱼是转向你，和张望、害羞嘟嘴的眼神分不开；「转头」仍不是词）；连连点头、使劲摇头在桌面大小下和点头、摇头分不出，收成点头、摇头的别名（连连点头/猛点头/使劲点头、使劲摇头/拼命摇头/猛摇头，五个形象都有）。
> - **尾巴、耳朵、翅膀的五个动作**（只在 plus 下，没有新画）：`wag` 摇尾巴/甩尾巴/摆尾巴（大肥鱼、GPT 娘、Gemini 娘）、`wingbeat` 扇翅膀/拍翅膀/扑扇翅膀（GPT 娘、Grok 娘）、`earflick` 抖耳朵/耳朵抖抖/动动耳朵、`earsup` 竖耳朵/竖起耳朵/耳朵竖起来、`earsdown` 耳朵耷拉/耷拉耳朵/耳朵趴下（Gemini 娘）。尾巴、耳朵、翅膀各算一个部位（`CHANNELS` 的 `tail`、`ears`、`wings`；kit 的 `APPENDAGE_MOVES`，帧里的 `appendages`），和表情、头、手的动作、彼此之间都能同组，同一部位的两个词拆成先后；不带表情、不换模式，走着照走、跪着照跪（§一.11）。
> - **六个带特效的组合脸**（只在 plus 下，没有新画，特效是代码画的）：`fuming` 气炸/气炸了/火冒三丈（生气的眼和嘴，头两边冒白烟）、`heartbroken` 心碎/心碎了/伤心欲绝（难过的眼、大哭的嘴，头旁边一颗心裂成两半掉下去）、`celebrate` 撒花/庆祝/恭喜（开心的眼和嘴，头顶撒出一把彩色纸屑）、`gloomy` 郁闷/闷闷不乐/乌云罩顶（嫌弃的眼、难过的嘴和身子，不要黑线，头旁边一朵下雨的小乌云）、`speechless` 无言以对/说不出话/哑口无言（平静的眼、尴尬的嘴，挂汗，一个点一个点地冒出「……」）、`starry` 眼冒金星/被砸晕/撞晕了（慌张的 > < 眼和嘴，不要汗，头顶晕的小星星）。前五个特效由 kit 自己画在粒子层里（`MARK_FX_KEYS`），五个形象（Coo 也是）都不用改；小星星是晕的 `orbit`，各形象本来就画。尴尬多一个名字「汗颜」（§一.9）。
> - **七个新画的手势**（只在 plus 下，有新画：三位娘和大肥鱼各 8 张手臂图）：`clap` 拍手/鼓掌/拍拍手/啪啪啪（两张画：合掌 `clap`、分开 `clapo`）、`shrug` 摊手/耸肩/没办法/摊摊手（两手在腰边摊开、掌心朝上）、`headhold` 抱头/抱着头/抱住头/捂脑袋（两只手压在头上）、`raise` 举手/举起手/我来/我知道（整条手臂竖直举过头顶）、`thumbs` 点赞/竖大拇指/真棒/厉害/给你点赞（胸前竖起大拇指）、`shush` 嘘/小声点/保密/别出声（食指贴在嘴唇上）、`wipe` 擦汗/抹汗/好险（手腕背面抹过额头）。前三个两只手一起画，后四个是一只手（三位娘用画面左边那只 armL，Claude 娘另一只手照旧抱书；大肥鱼用近侧手臂）。都是 kit 的 `ARM_GESTURES`（跪坐时走混合体、不结束跪坐），`CHANNELS` 只占手，能和表情、头部动作同组（如【开心+拍手】【跪坐+嘘】【抱头+摇头】），两个手势同组改成先后。自带的脸：拍手、举手、点赞开心，摊手 sighing，抱头苦恼，嘘是眨眼的眼睛配平静时闭着的小嘴（`wink+neutral`，眨眼本身张开笑着的嘴露在手指后面像偷笑），擦汗温柔（都不是 `FACE_ARMS` 里会摆手臂的表情，手势做完留下的脸不会再带出别的手臂图；举手不用跃跃欲试，因为它的身体是认真，会叉腰）。声音原先借现成的（拍手 tick、摊手 hmm、抱头 surprised、举手 pop、点赞 ding、嘘 soft、擦汗 sigh），现在各有自己的（见下一条）；拍手仍是每次两手合上响一声（kit 的 `CLAP.at`，四声）。拍手的两张画由 `clapShut(k)` 一帧切换（`ARM_TWIN`），先分开、合上四次（每次 0.2 s，相隔 0.4 s）、最后分开放下，从不两张同时露出来；嘘、擦汗、抱头的画挂在脖子上（三位娘 `NECK_POSES`，大肥鱼 `NECK_RAISES` / `NECK_HANDS`），点头、摇头时手留在脸上、头上。「拍手」原来是评测里 bot 写了却没有的词，现在三位娘和大肥鱼都认得（Coo 仍没有）。手臂图出自 OpenAI 官方 API 的 `gpt-image-2.5-sunburst` 不带蒙版的编辑（三位娘另做一张分割图来裁），由 `scratch/<fig>/build_arms.py` → `merge_model.py` 和大肥鱼的 `scratch/art/arm_build.py` + `recolor.py`（八套配色）生成。
> - **新手势和新表情的音效**（只在 plus 下）：v0.5.0 以来加的词原先借不太合适的现成音色（拍手 tick、嘘 soft、擦汗 sigh、点赞 ding、举手 pop、摊手 hmm、抱头 surprised、加油 pop、记笔记 page、对手指 shy、扇翅膀 whoosh、气炸 angry、心碎 sad、撒花 sparkle、郁闷 sad、无言以对 wry、眼冒金星 surprised、安慰 soft），摇尾巴、抖耳朵没有声音。现在 `web/sound.js` 给它们各合成了一个短而轻的音色，做法和已有音色一样，音量也差不多（峰值 −18 到 −28 dBFS），声音跟着画面的节拍：拍手 `clap` 每次两手合上一声干脆的「啪」（带两下极短的回响和一点低音，`CLAP.at` 四声，和合掌那张画同一帧）；嘘 `shush` 手指到嘴边时一声轻轻的「嘘——」；擦汗 `wipe` 手腕抹过额头时一下轻擦声，接着呼出一口「呼」；点赞 `thumbs` 拇指一声轻响再往上跳五度的「叮咚」；举手 `raise` 一下上扬的风声加两声「我、我」小叮；摊手 `shrug` 一高一低、第二声微微发颤的「诶……诶～」；抱头 `headhold` 往下沉、发抖的「哦……」再两下闷闷的抽痛；加油 `fist` 一下挥拳风声、一记闷响和上扬的「冲！」；记笔记 `jot` 两小串、每串三下铅笔沙沙声；对手指 `twiddle` 四下一高一低的极轻小点；摇尾巴 `wag` 左右八下轻甩声，最后渐弱；抖耳朵 `earflick` 四下极短的轻颤（每抖一下一声）；扇翅膀 `wingbeat` 每次往下扇一声低低的「呼」（每秒 2.6 下，和 `WINGBEAT.rate` 一致）；气炸 `fume` 一声低低的嘟囔，上面三下「嘶」的冒烟声（和白烟一样 0.32 s 一团）；心碎 `heartbreak` 心弹出来一声小「叮」，0.6 s 裂开时一声脆响，两半掉下去时一个往下沉的难过的音；撒花 `confetti` 拉炮一声「啪」接一串亮晶晶的小音；郁闷 `gloom` 一个闷闷往下沉的「嗯……」和几滴雨声；无言以对 `dots` 「……」每冒出一个点响一下（0.25、0.55、0.85 s）；眼冒金星 `starry` 一圈打着颤的小星星声；安慰 `comfort` 三个往下走、最后落稳的柔和音（「没事、没事」）。跺脚仍用落地声 `land`（上游就有），竖耳朵、耳朵耷拉、低头、眨眨眼仍不出声，温柔的 `soft` 没改。新音色都标成 plus（`PLUS_TONES`），别的形象包听不到；导出包把用得到的渲染成 WAV 带上（大肥鱼 33 个、Claude 娘 34 个、GPT 娘和 Gemini 娘各 36 个），在上游 v0.1.17 里照样响。另外修了合成器的一个小毛病：每个音的增益在开始之前是默认的 1，开始那一帧可能「咔」地一下满幅，现在开始之前就是静音。
> - **第六个形象 Grok 娘**（`grok-chan`）：上面这些她都有（跪坐混合体、跪坐和趴着的实时脸、画好的睁眼眨眼、小泪滴、手臂图一帧切换、头部和身体的动作、七个新画的手势、表情对 118 对（v0.8.1 起 135 对）、音效），词表是 Claude 娘的 119 个加 `wingbeat` 扇翅膀，共 120 个；扇的是蝴蝶结后面的两只小蝙蝠翅膀（站、坐是活的翅膀，跪坐换混合体，趴着扇趴姿图上画的翅膀）。
> - **表情决策模式**（decider，不动 kit 和形象）：有 OpenRouter 密钥时 bot 不再看词表，只写一句心情，由 OpenRouter 的决策模型按部位各答一道选择题挑出一组词；走动由 bot 按像素决定，每次调用都带位置（§一.12）。
> - **四个画好眼睛的新表情**（只在 plus 下；扩展脸 `PLUS_FACES` 只用现有的脸字段）：`eyeroll` 翻白眼/白眼（眼珠翻上去藏在平平的上眼皮下，只剩眼白，身子往后仰一点）、`shocked` 震惊/惊呆/傻眼（白眼珠、瞳孔缩成一个小点，头顶感叹号、额头三道黑线、僵住发抖；不设 `wide`，否则大肥鱼会先画惊讶的眼睛）、`deadpan` 死鱼眼/生无可恋/麻了（压成一条直线的眼皮、没有高光的呆滞眼珠，盯着你不动；矮的 `ring`，不是 `lid`）、`drool` 流口水/口水（半眯的 `lid` 眼望着上方、嘴角挂一滴口水、慢慢晃）。四位娘和大肥鱼的眼睛是生成后按原有画风裁切的贴图（`<expr>_eyeL/R`，大肥鱼 8 套配色各一份），四位娘还多了两张嘴：`mouth_drool`（带口水）和震惊的大张嘴 `mouth_gasp`，大肥鱼多了 `drool_mouth`；Coo 用 kit 的环形眼画（翻白眼的环往上看、震惊的大环、死鱼眼的扁环、流口水的眯眼）。音色借现成的：翻白眼 wry、震惊 surprised、死鱼眼 hmm、流口水 soft。另外「眯眼笑」成了开心的一个名字。原计划的「咬嘴唇」因为桌宠大小下咬住的嘴唇只有约 2 像素、和害羞的嘴分不开，没有加。新表情的表情对这一轮没有挑（`pairs` 不变）。设计和选图记录在 `scratch/expr2/DESIGN.md`。
>
> 实测：
> - 组合扩展改动的行为，在真实 kit 上用 `/tmp/combo/` 下的脚本重新测过：
>   - 组合矩阵：`probes/matrix3.mjs`，结果在 `matrix-before.json` 和 `matrix-after.json`，见第三节「历史一」；v0.5.0 上用 `scratch/combo7/matrix/matrix6.mjs` 重测过 Claude 娘和大肥鱼（依次、成组直送 kit、成组经 World，任一帧和连续 0.5 s），见第三节「v0.5.0 重测」；
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
>   - `tests/{claude,gpt,gemini,grok}-figure.test.js`、`tests/whale-pose.test.js`
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
>   - v0.5.0 上，Claude 娘和大肥鱼的这 2278 对和各自的全词表（3081 对、3003 对），依次、成组直送 kit、成组经 World 各一遍（第三节）；
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
| Coo | 107 | 62（32 + 30 个组合脸） | 45 |
| 大肥鱼 | 122 | 62（32 + 30 个组合脸） | 60（多 `muse` 和 `droop`、`blink`、`closer`、`leanback`、`sway`、`stamp`，`clap`、`shrug`、`headhold`、`raise`、`thumbs`、`shush`、`wipe`，还有 `wag`） |
| Claude 娘 | 123 | 62（32 + 30 个组合脸） | 61（少 `spout`，多 `muse`、`fist`、`jot`、`twiddle` 和上面六个、七个） |
| GPT 娘 | 125 | 62（32 + 30 个组合脸） | 63（Claude 娘的 61 个，加 `wag`、`wingbeat`） |
| Gemini 娘 | 127 | 62（32 + 30 个组合脸） | 65（Claude 娘的 61 个，加 `wag`、`earflick`、`earsup`、`earsdown`） |
| Grok 娘 | 124 | 62（32 + 30 个组合脸） | 62（Claude 娘的 61 个，加 `wingbeat`） |

- 组合扩展之前是 72 / 71 个词。新加的 23 个组合脸（§一.9）排在 `giggle` 后面、第一个动作前面，后来的六个带特效的组合脸排在 `meh` 后面，安慰 `comfort` 排在 `brave` 后面；之后又加了 `tilt` 歪头，排在 `sigh` 后面；表情手臂姿势的几个手势词（`muse` 等）排在 `idea` 后面，七个新画的手势（`clap` 到 `wipe`）紧跟在它们后面、`hips` 前面；`droop`、`blink` 排在 `tilt` 后面，`closer`、`leanback`、`sway`、`stamp` 排在 `peek` 后面；四个画好眼睛的新表情 `eyeroll`、`shocked`、`deadpan`、`drool` 排在 `giggle` 后面、第一个组合脸 `smirk` 前面。
- 一个名字在一个形象里只能指一个词（`readVocab` 校验，`vocabId` 查）。六个形象同一个词的名字相同（只有 `song` 不同：四位娘是「哼小曲」，Coo 和大肥鱼是「鲸歌」；`muse` 四位娘以「琢磨」开头、大肥鱼以「托腮」开头），包括上面那些近义名字；只有「握拳」在四位娘那里是 `fist`，在 Coo 和大肥鱼那里是 `determined`。
- `spout` 只在 `coo/figure.json:1591` 和 `whale/figure.json:1684` 里。
- 带 `lasting: true` 的只有 4 个词：`sit`、`sleep`、`kneel`、`lie`。
- `seconds` 的取值（见 `coo/figure.json` 的 vocab，`claude-chan` 相同）：
  - 表情：0.9，30 个组合脸也是；`petrify` 是 3.2。
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
    - `身`：其余，也包括包自带的动作。还占手、头或表情的，名字后面写「(也占…)」：kneel（Coo）、lie、flap、curtsy 也占手，roll 也占手、头，sleep 也占手、头、表情，dizzy 也占表情，包自带的动作也占手、头。大肥鱼和四位娘的 kneel 带 `keepsArms`，只占身和站位，不写「也占手」。
  - `petrify` 的说明后面加上「，不和别的同时做」。
- lasting 词后面由 `lastingNote`（`script.ts:229-233`）写明什么时候结束：
  - sit、lie、sleep：「一直保持：做手势、换表情不影响，换别的姿势或走、跑、跳这类全身动作才结束」；
  - kneel：「保持到下一个手或全身动作，然后变回普通坐着；换表情、点头、摇头、叹气、歪头不影响」（Coo 没有低头、眨眨眼，所以不写；词表全有时是「…歪头、低头、眨眨眼不影响」）；
  - 带 `keepsArms` 的 kneel（大肥鱼和四位娘）：「保持到下一个全身动作，然后变回普通坐着；换表情、点头、摇头、叹气、歪头、低头、眨眨眼、只占「手」的手势和唱歌都不影响(她跪着做)；「手,要站着或坐着不动」那组别的动作会让她变回普通坐着」。`lastingNote` 现在收整个词和词表（`lastingNote(v, vocab)`），`pet_act` 回执按 id 查到词再调；点头、摇头、叹气、歪头、低头、眨眨眼只写词表里有的（第三方包有跪坐、没有歪头时不提歪头；Coo 只有前四个，大肥鱼和四位娘六个都有）。
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
                 KIT_/PLUS_EXPRESSIONS（含 30 个组合脸）→ setExpr → 表情槽（761-764）
                                     │
                                     ▼  每帧：动作自带的脸补位、被盖住的表情暂停（1173-1187）
                                        → faceName() 选脸 → render
               figure.draw(petG, face, frame{mode, gesture{kind,k}, head{kind,k}（仅 plus）, talk, sit, lie, kneel, away…})
                 （body.js:339, 1379）各形象自己画：Coo 环形 / 大肥鱼 / 四位娘的 armPlan、hideFront、kneelHead、partsOf

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
     - 形象声明了 `kneelArms` 时，手势（`ARM_GESTURES`，`251`）也保持跪坐。大肥鱼和四位娘有 `poses.kneelLow` 时声明它（getter：这套配色的文件都在才是 true，缺了就和以前一样结束跪坐）；kit 只改了注释，非 plus 的帧不变。
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
  - 四位娘的词表里没有 `spout`，代码里也不画。
- **画不画由形象决定**：
  - 列在 `figure.gestures` 里的手势由形象自己画，kit 不再加倾斜和前倾。头部手势见 `body.js:1107-1118`，手势见 `:1121-1125`。
  - 大肥鱼的列表：`whale/figure.js:1446`。
  - 四位娘的 `GESTURES`：`cc/figure.js:26`，不含 `spout`。
  - Coo 一个都不自己画，全靠 kit 的倾斜和挤压，再加上 `away:'hide'`、`roll:'spin'`（`coo/coo.js:423-437`）。
- **缺图时的兜底**〔代码〕：
  - 四位娘：先用 `POSE_ALT` 替代，再退到 `ARM_FALLBACK` 角度。没有 lie 图就坐着，没有 roll 图就整体旋转（`'spin'`），没有 back 图就转头（`cc/motion.js:247, 261-267`，`cc/figure.js:215-221, 257`）。
  - 大肥鱼：没有 roll 图就小跳（`whale/figure.js:1088`），没有 lie 图就坐着（`:404`）。
  - 组合脸的某个部位没有对应的贴图时，按那张脸单独出现时的兜底画。例如没有 smug、angry、sad、shy 眼睛图的旧版大肥鱼（导出包里的旧 `model.json`）用画的睁眼。
  - 现有内置形象的姿态图都齐全，这些兜底只在贴图加载失败时才会触发。

### 9. 组合脸（plus）

- **来源**：
  - 表在 `body.js` 的 `PLUS_MIXES`。由 `mixFace`（`283-299`）拼成 `PLUS_MIX_FACES`（`301-302`），并入 `PLUS_EXPRESSIONS`（`238`）。
  - 音色在 `PLUS_FACE_TONES`，同样抄进 `web/sound.js` 的 `EXPR_TONES`。大多借已有的音色；安慰和六个带特效的脸有自己的（`comfort`、`fume`、`heartbreak`、`confetti`、`gloom`、`dots`、`starry`，跟着特效的节拍），导出包把它们渲染成 WAV 带上。
- **每张组合脸取用别的脸的部位**：
  - 眼（eyes、sparkle、视线、泪、腮红）取「眼」那张脸的；
  - 嘴（gap、ω、舌、puff、唱）取「嘴」那张脸的；
  - 眉、身体语言（lean、sag、titter、rock、shake）、符号（汗、怒气、感叹号、问号、黑线、思考、晕的小星星，和 kit 自己画的白烟、碎心、纸屑、乌云、「……」），默认都跟眼那张脸；
  - `add` 只能设 `ADD_KEYS`，也就是每个形象都直接从脸对象读、不按名字查的字段。
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
| huff | 气鼓鼓 / 气呼呼 | angry | pout | 身体取 pout（四位娘抱臂），腮红 .6 | angry |
| frantic | 抓狂 / 崩溃 | flustered | angry | 身体、符号取 angry | angry |
| ragecry | 气哭 / 气哭了 | cry | angry | 眉、符号取 angry | sad |
| sulk | 瘪嘴 / 委屈巴巴 | sad | pout | – | sad |
| whimper | 哭唧唧 / 呜呜 | cry | pout | – | sad |
| brave | 强颜欢笑 / 强撑 | worried | gentle | – | wry |
| comfort | 安慰 / 没事的 / 别难过 / 宽心 | neutral（睁眼看着你） | gentle | 眉取 sad，身体取 gentle（慢慢点头），符号取 gentle（不冒汗），腮红 .3 | comfort |
| pained | 苦恼 / 头疼 / 头大 | bowing（闭眼） | worried | 眉取 sad，身体取 worried，冒汗 | hmm |
| doubt | 狐疑 / 怀疑 / 真的吗 | smug | confused | 问号 | hmm |
| blank | 懵 / 发愣 / 一脸懵 | confused | surprised | – | hmm |
| meh | 呵呵 / 皮笑肉不笑 | disgusted | awkward | 不要黑线 | wry |
| fuming | 气炸 / 气炸了 / 火冒三丈 | angry | angry | 头两边冒白烟（`fume`） | fume |
| heartbroken | 心碎 / 心碎了 / 伤心欲绝 | sad | cry | 头旁边一颗心裂成两半掉下去（`heartbreak`） | heartbreak |
| celebrate | 撒花 / 庆祝 / 恭喜 | happy | happy | 撒彩色纸屑（`confetti`），闪 1 下光 | confetti |
| gloomy | 郁闷 / 闷闷不乐 / 乌云罩顶 | disgusted | sad | 身体取 sad，望向下方，不要黑线，头旁边一朵下雨的小乌云（`cloud`） | gloom |
| speechless | 无言以对 / 说不出话 / 哑口无言 | neutral | awkward | 冒汗，一个点一个点地冒出「……」（`dots`） | dots |
| starry | 眼冒金星 / 被砸晕 / 撞晕了 | flustered | flustered | 不要汗，头顶晕的小星星（`orbit`） | starry |

- **安慰从温柔里分出来**：评测里「温柔」一个词既当微笑又当安慰，150 句回复里用了约 70 次。现在 `gentle` 只是温柔地笑（温柔 / 微笑 / 欣慰，半眯的眼），安慰别人用 `comfort`（安慰 / 没事的 / 别难过 / 宽心：睁眼看着你、眉头微微蹙起、浅浅的笑、温柔那样慢慢点头），排在 World 提示词「难过(坏消息、陪对方难过、安慰对方)」那组的 `sad` 后面。没用强颜欢笑的担心眼：三位娘的担心眼画着泪花，看着像自己要哭；它不冒汗，和强颜欢笑分得开。不是表情对的成员。

- **温柔不再当默认的收尾脸**（v0.6.1 之后）：分出安慰后，DeepSeek 150 条回复里「温柔」还有 84 次，59 条回复的最后一张脸是它，多半是劝人去睡、歇会儿的那句，13 次是「温柔+奉茶」。`gentle` 的说明收窄成对方好起来、道谢时的欣慰（看起来不变），排到「喜欢、害羞」那组最后（`moved` 后面）；`serve` 的说明写明奉茶自带温柔的笑（kit 的 `holdFace('gentle')`），不用再加温柔。五个形象的 `figure.json` 一样改。

- **kit 自己画的特效**（`MARK_FX_KEYS`：`fume`、`heartbreak`、`confetti`、`cloud`、`dots`，后六个组合脸用；都在 `MARK_KEYS` 和 `ADD_KEYS` 里，所以也跟着「眼」那张脸进表情对，作嘴时不带）：
  - 画在 kit 自己的粒子层（`fxG`）里，和爱心、闪光、灯泡一样，六个形象（Coo 也是）都不用改代码，导出包在上游里也照样有（包自带 kit）。颜色固定、带深色描边，任何配色、任何桌面上都看得见。
  - 白烟、碎心、纸屑是粒子：脸一出来就发第一批，之后按自己的时钟（`pet.markAt`，按 `exprN` 认是不是新的一张脸）：白烟每 0.32 s 头两边各一团（`glints` 点往头顶挪三成，往外、往上飘、变大、变淡）；碎心每 2.2 s 一颗（在灯泡的位置：先弹出来，裂开，两半往两边倒下去、往下掉，淡出）；纸屑一出来先撒 18 片（从头顶往上、往两边抛，空气阻力减速，然后飘落，翻转着闪），之后每 0.45 s 再补 3 片。
  - 乌云和「……」跟着头每帧画：都在灯泡的位置（`anchors.bulb`，没有就是气泡点往前 62、往下 28，避开说话的气泡），0.3 s 淡入；乌云上下轻轻浮、下面四道雨；三个点每 2.4 s 一轮，0.25 s 后一个一个出来。
  - 坐着、跪坐时跟着 `headLow` 下沉，趴着时用趴姿的 `anchors.lie`（`bubble`、`glints`），背过身、转身时跟着翻面。
  - 不开 plus 的身体没有这些脸，也不会画这些特效；它们的随机数只在有这些字段时才取，非 plus 帧和上游逐帧一致。
- 尴尬多一个名字「汗颜」：尴尬本来就是笑眼、八字眉、一大滴汗，「尴尬 + 冒汗」做成组合脸和尴尬一模一样，所以只收名字。

- **怎么选出来的**：
  - 后六个（v0.4.2 之后）：候选是 汗颜（尴尬 + 汗）、无语的「……」、气炸的蒸汽、被砸晕的星星、心碎、撒花、郁闷的乌云、闪光一圈、感叹号。没收的：汗颜（就是尴尬，收成名字）、闪光一圈（就是开心、坏笑那几下闪光，同时最多 3 个）、感叹号（惊讶、哇已经有 `bang`）。眼冒金星用晕的小星星，但眼睛是 > < 不是晕的转圈眼，也只是一张脸，不转圈。眼和嘴的搭配避开了形象名单里的合成对（如 慌张眼 + 惊讶嘴 是三位娘的合成对，所以眼冒金星用慌张自己的嘴）。〔实测〕五个形象站、坐、跪、趴、背过身、转身时各渲染一遍（`scratch/combo6/D/`），特效都在头旁边，和已有的 27 张基本脸、23 张组合脸都分得开。
  - 前 23 个：候选 32 个，看渲染图后去掉 9 个，它们和已有的脸太像，或在某个形象上读错：
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
- 〔测试〕`pet-actions.test.js`「faces made of parts of others」；四位娘的 figure 测试和 `whale-pose.test.js` 都检查了每张组合脸用的是自己的哪张眼睛图、哪张嘴图。〔实测〕看过 `/tmp/combo/faces/final-*.png` 和 `vrend/sheet-<形象>.png`。

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
- **组合脸（30 个）**：内置形象的名单里，组合脸只做别名的目标；组合脸 + 基本表情、组合脸 + 组合脸照旧拆开。`readPairs` 也接受组合脸做成员（World 分不出组合脸和第三方包自己的表情）；kit 能合成它们（作眼时带上它的眉、记号和 `add`，作嘴时给它的嘴）。
- **音色和闪光**：音色取眼那张脸的（包自带的词取它的 `sound`），没有就取嘴那张脸的（组合成的脸不添新音色）；闪光、弹跳按眼那张脸（happy 2、smug 1、组合脸按它的 `glint`，其他 0；surprised 往下压）；默认 3.2 s，两个里有 sleepy 时 4.4 s；爱心只在单独的 love 时发。
- **和主动要的表情完全一样**：经 `setExpr('眼+嘴')` 设置（`exprAsked`），动作保留它（`keepsFace` 认得两个部分都是表情的组合名），`holdFace` 延长它，被盖住时暂停，`BODY_OWN` 手势叠加成 `眼+嘴+手势自带的脸`（唱歌、叹气换成手势的嘴），被 sleep、拎起、neutral、新表情清掉。
- **形象怎么画**：和组合脸一样走 `fc.parts`。四位娘按 `parts.eyes/mouth/brows/body` 查自己的图；大肥鱼也一样，smug、angry、sad、shy 用自己画好的眼睛（`whale/figure.js` 的 `drawnEye`，同四位娘：睁眼和 smug 的半闭眼换成贴图；眨眼开头和结尾压扁贴图，闭上四成以上一帧切成画的眼睛合到同样程度，所以闭眼那几帧是眼皮和睫毛线，不是一条压扁的彩色细缝（四位娘也一样，见下面 Claude 娘一节）；shy 回头看你那一下仍是画的睁眼），其余的睁眼加眉的倾斜；Coo 没有嘴，环的缺口取嘴那张脸的，吐舌画得出，ω 画不出，所以很多对在 Coo 上看起来就是眼那张脸。
- **候选**：可配对的基本表情 26 个（kit 的 18 个和 plus 的 8 个，去掉 neutral、petrify 和组合脸），C(26,2) = 325 个无序对，两种眼嘴方向共 650 个候选；其中 21 对正好是已有的组合脸（可做别名）。候选表在 `scratch/combo2/pairs/`（不进仓库），看渲染图挑选后由 `scratch/combo2/tools/apply-pairs.mjs` 写进各 `figure.json`。
- **怎么挑的**〔实测〕：
  - 5 个形象各把 650 个候选和 27 个基本表情都渲染一遍（当时用示例页的开发开关 `?pairs=ab|ba` + `ctl.doGroup`，0.9 s 时截脸部；开关已删，现在 `ctl.doGroup([眼, 嘴])` 直接就是那张脸），每个形象拼成 22 张 6×5 的对照图，外加一张基本表情参照图；同一对的两个方向挨着放。
  - 一对只有在合成的脸**同时读得出两个词**、又和两张单独的脸都看得出不同时才收，并选定一个方向（谁给眼、谁给嘴）；正好是已有组合脸的那个方向直接收成别名。正负情绪相反的对（如 开心+难过）也看了，多数不收，少数读得通的收了（如 难过眼+开心嘴「含泪笑」）。
  - 三位娘是同一套设计，在 Claude 娘上挑，再拿 GPT 娘、Gemini 娘的图逐对核对：只去掉了 担心+惊讶（GPT 娘那一格看不出担心的眼睛），所以三位娘的表相同；大肥鱼、Coo 各自单独挑。后来加入的 Grok 娘是同一套设计，用同一张表（`apply-pairs.mjs` 的 `FIGS` 里加上她）。
  - 结果：四位娘 118 对，大肥鱼 98 对，Coo 24 对（v0.8.1 加新表情的对后，四位娘 135、大肥鱼 106，见下）；Coo 没有嘴，收下的多是吐舌（舌头画得出来）和别名。小的表都是大的表的子集（大肥鱼多一对 担心+惊讶）。
  - 别名 21 对里收了 20 对（四位娘；大肥鱼 19、Coo 13），没收 嫌弃+尴尬（呵呵）。
  - 大肥鱼重挑〔实测〕：她最初的 81 对是在 smug、angry、sad、shy 还没有自己画的眼睛时挑的。画上之后（v0.4.0），把三位娘收了而她没收的 38 对、加上她独有的 担心+惊讶，按三位娘的方向在她身上重新渲染（脸部 2 倍、0.9 s、不眨眼，deepseek、claude、chatgpt 三种配色），每格旁边放眼那张脸和嘴那张脸作对照，用同样的标准逐对看。收了 17 对：难过眼配开心嘴（含泪笑）、温柔嘴（含泪微笑）、惊讶嘴；害羞眼+温柔嘴；生气眼+得意嘴、+温柔嘴；困眼+难过嘴；思考眼+难过嘴、+得意嘴、+担心嘴、+温柔嘴；嫌弃眼+得意嘴、+温柔嘴；偷笑眼+慌张嘴（憋笑）；害怕眼+温柔嘴；别名 狐疑（得意+疑惑）、强颜欢笑（担心+温柔）；担心+惊讶 留着。没收 21 对，原因几乎都在她的嘴：得意、偷笑、温柔的嘴是同一条小弧线，害羞、担心、慌张、害怕、嫌弃的嘴是同一条波浪线，所以只有嘴那张脸的意思在这条线上还读得出来时才收（如 害羞+得意 和 害羞+温柔 一模一样，看不出得意，不收；生气的眼睛配小弧线读得出阴笑，收）；另有几对和一张单独的脸分不开（尴尬的闭眼和偷笑的一样，尴尬+温柔/偷笑/得意 就是偷笑；哭唧唧只是大哭的嘴小一点；惊讶+大哭 就是惊讶）。记录在 `scratch/combo2/judged.json` 的 `whaleRejudge`（每对一句理由），图在 `scratch/combo4/`。
  - 方向是全局的：99 个合成对每对只选了一个方向，三份名单选的方向一致。音色、闪光都用默认（跟眼那张脸）。
  - 记录：`scratch/combo2/judged.json`（每个形象的名单和每对的叫法）、`scratch/combo2/pairs/verdicts.json`（`apply-pairs.mjs` 的输入）。
- **新表情的对**（v0.8.1）〔实测〕：翻白眼、震惊、死鱼眼、流口水和 26 个可配对的表情、以及彼此之间，共 110 个无序对、220 个候选，在四位娘和大肥鱼上各渲染一遍（`ctl.doGroup([眼, 嘴])`，0.45 s 时截头部），每行「A、B、A 眼 + B 嘴、B 眼 + A 嘴」拼成 19 张对照图（工具在 `scratch/expr2/pairs/`，不进仓库）。
  - Claude 娘上两位评审各自独立看：一位按观众挑（收 50 对），一位从严（收 18 对）。只收两人都收、方向也一致的 17 对（从严那位收的 开心眼+流口水嘴，另一位嫌开心本来就张着嘴、只多一滴口水，没收），再拿 GPT 娘、Gemini 娘、Grok 娘的图逐对核对，都读得通，所以四位娘仍是同一张表。
  - 收下的：流口水的嘴配 期待、喜欢、困、思考、尴尬、撒娇、认真 的眼（馋、打瞌睡流口水、盯上吃的）；震惊的嘴配 害怕、嫌弃、难过、喜欢、疑惑、害羞、担心 的眼（吓到、恶心到、「啊？！」）；翻白眼的眼配 吐舌、得意 的嘴；死鱼眼的眼配 吐舌 的嘴。
  - 没收的多是：震惊给眼时整张脸只读得出震惊；流口水给眼时口水那滴跟着嘴走了，只剩半闭的眼；死鱼眼、翻白眼配笑嘴读起来不搭或像坏了；流口水那滴口水在眼泪、慌张眼旁边看不出来。
  - 大肥鱼的嘴很小，另一位评审从严单独看，收了 10 对，其中 8 对在这 17 对里，她就加这 8 对：流口水配 期待、喜欢、思考、尴尬；震惊配 害怕、嫌弃；翻白眼+吐舌；死鱼眼+吐舌。Coo 不加。
  - 结果：四位娘 135 对，大肥鱼 106 对，Coo 24 对；大肥鱼仍只多一对 担心+惊讶。
- **给 LLM 的说明**：`{{pet.vocab}}` 把别名对写在那个词后面（`- smirk 坏笑/贼笑(=开心+得意)：…`），在表情后面一段「表情对」举一个合成对的例子（`如【开心+惊讶】是惊讶的眼睛配开心的嘴`），说「先写哪个都行」（World 会按名单排好），再列合成对。12 对以内写成一行（`开心+惊讶、…`）；多了就每个表情一行，后面跟能和它合成的表情（`- 开心 + 难过/嘟嘴/惊讶/…`），每对只在清单里靠前的那个表情下出现一次（详见 §一.2）。Claude 娘这一段约 510 字，整个词表约 4.0k 字。
- **出厂验证**〔实测〕：用 World 自己的 `parseScript`，按每个形象的词表和 `pairs` 解析 `【A+B】`（一半按键的顺序写，一半反过来），检查得到的组是 `眼+嘴`（按名单的方向）或别名词，再把组在示例页上 `ctl.doGroup`。5 个形象共 476 格（大肥鱼重挑后重跑了她的 98 格），脸名和 `parts` 全部和名单一致，控制台 0 个错误（`scratch/combo2/tools/ship-plan.ts` → `shipshots.cjs`，图在 `scratch/combo2/verify/shipped-<形象>.png`；大肥鱼重跑的 98 格在 `scratch/combo4/verify/shipped-whale.png`，`combo2` 里的那张还是重挑前的 81 格）。
- **测试用的参数**：World 侧 `parseScript`/`parseActions`/`vocabTable` 的 `pairs` 参数（默认空），World 运行时传当前形象的名单。
- **没有 `doAll` 的身体、非 plus 身体**：非 plus 身体没有 `doGroup`，不变。World 只为声明了 `pairs` 的形象合并（5 个内置形象都声明了；导出给上游的包不带 `pairs`），没声明的照旧拆开。声明了合成对、身体却不会合成时（没有 `doAll`），`figure-frame.js` 逐个做，后一个表情胜出，不会出错；页面的 `acts.js` 队列按成员计时，不受影响。
- 〔测试〕`pet-actions.test.js`「two faces of one group shown as one」（基本表情两两、两个方向都按「第一个的眼、第二个的嘴」合成，现在是 30 个、870 种，含后来加的翻白眼、震惊、死鱼眼、流口水；内置名单的每一对经 World 的 `parseActions` 两种写法都发成名单的方向，kit 显示的眼和嘴与名单一致）；四位娘 figure 测试和 `whale-pose.test.js` 用自己的图画名单里的每一对（大肥鱼的 smug、angry、sad、shy 用自己画好的眼睛，shy 回头看你时用画的睁眼：`whale-pose.test.js`「takes smug's, angry's, sad's and shy's own drawn eyes…」；眨眼闭到四成以上是画的眼皮和睫毛线，站、坐、转头、跪坐、趴下都是：「blinks smug's, angry's, sad's and shy's drawn eyes shut…」「kneeling and lying, a drawn eye blinks shut…」；四位娘各自的 figure 测试「blinks a drawn open eye shut with the painted lid…」两条）；`PKG/tests/script.test.ts`「two expressions of one group as one face」、`packs.test.ts`、`world.test.ts`。

### 10. 头部通道（plus）

- **kit 侧**：
  - `HEAD_GESTURES = nod, shake, sigh, tilt, droop, blink`（后两个在 `HEAD_MORE`）在 `pet.head` 里播放，有自己的时钟，和 `pet.pulse` 里的手势互不顶替。
  - 帧里多一个 `head: {kind, k} | null`（`1375, 1382`），只有 plus 帧有。〔测试〕非 plus 帧没有 `head` 这个键。
  - 形象没把它列进 `figure.gestures` 时，由 kit 用前倾、侧倾、挤压表现（`1107-1118`）。sigh 的这几行从手势块挪到了这里。
  - `sighing` 脸按 `p.head` 计时（`179-180`）。
  - 歪头（`tilt`）：`TILT.dur` 1.8 s，`tiltOf(k)` 前六分之一歪过去、中间停住（约 1.2 s）、最后六分之一回正；声音借上游就有的 `look`（张望、探头那声「嗯？」），所以导出包不多音效文件；没有自带的脸，正在显示的表情照常（主动要的表情胜出）。kit 自己画时（Coo）整组侧倾 `TILT.deg` −12°；趴着时整组不倾斜，所以 Coo 趴着看不出歪头（和点头一样）。
  - 低头（`droop`）：`HEAD_MORE.droop` 1.8 s，形状同歪头（`tiltOf`）；不出声、没有自带的脸。kit 自己画时（Coo）整组前倾 12°。
  - 眨眨眼（`blink`）：`HEAD_MORE.blink` 0.75 s，kit 在 `BLINKS`（k=0、1/3、2/3，相隔 0.25 s，每次眨眼 0.16 s，中间睁开）时各把 `blinkAge` 归零一次（期间不插随机眨眼），形象照常从 `frame.blink` 画眨眼，所以哪个形象都不用另写代码。
  - 有头部手势时：
    - 躺着不做小动作（`976`）；
    - `layout.moving` 为真（`1572-1573`）。
- **形象侧**：每个形象都有一组同样的辅助函数，在 claude `cc/motion.js:160-200`，gpt、gemini、grok 的 motion.js 里同名，大肥鱼在 `whale/figure.js:218-258`。
  - `gesturesOf(o)` 把帧分成头部手势和手势。帧里没有 `head` 时（上游的 kit），从 `gesture` 里取 nod、shake、sigh，和 v0.2.6 一样。
  - `headMoves(h)` 用 v0.2.6 的公式，只是 k 换成头部自己的；`tilt` 是歪头的 0..1（同 kit 的 `tiltOf`）。
  - 歪头站着、坐着时：头（脖子的平面内转动，大肥鱼同样）歪到 `TILT_DEG`（四位娘 14°，大肥鱼 12°），方向是脸本来就歪的那边（`HEAD_TILT`，比如疑惑往 −x），不歪的脸往 +x；歪头期间取代脸自己的歪，所以「温柔+歪头」「疑惑+歪头」歪得一样多；方向在歪头开始时定下，中途换脸不会翻过去；脸微微抬一点（`angleY` −0.12）。托腮时幅度减小。
  - 趴着时，头也跟着叹气、歪头动（`lieHead`，歪头绕下巴转 `LIE_TILT` 10°）。
  - 低头（`down`，0..1，同 `tilt` 的形状）：四位娘站着、坐着时脸往下（`angleY` +`DROOP.pitch` 0.9）、眼睛往下看（`look[1]` 到 4）、头在脖子上沉 3.5；大肥鱼脖子往前弯 `DROOP.neck` 9°、脸往下 0.7、眼睛往下看；跪着按点头的方式往下沉住（`KNEEL_HEAD.down` 1.6 倍点头），趴着绕下巴往前转 `LIE_MORE.down` 9°。被别的头部手势截断时同样过 `tiltEased`（站着也过，因为 `angleY` 不经弹簧）。
- **身体的三个动作（形象侧）**：`closer`、`leanback`、`sway` 列在四位娘和大肥鱼的 `gestures` 里，由她们自己画（kit 只给 Coo 整组前倾 10°、后仰 9°、左右晃 7°）：凑近时上半身（`waist`，连头）放大到 1.1 倍，四位娘再前倾 7°（`pitchFromLean`），大肥鱼腰和脖子各往前 2°、3°；后仰时上半身缩到 0.86（大肥鱼 0.96）、下巴抬起（`angleY` −1 / −0.35），四位娘后仰 12°（`pitchFromLean` 的上限），大肥鱼腰往后 9°、脖子往后 9°；晃来晃去时整个身体绕脚转 ±3°，脖子再 ±4°。趴着时这三个都只是头绕下巴的转动（`LIE_MORE`），和趴着的点头、低头是同一种动法，只差方向和快慢：凑近往低头那边转 6°（头再平移 2 个骨架单位，看上去就是轻一点的低头）、后仰往反方向转 5°、晃来晃去来回转 ±6° 三下。数值在各自的 `BODY_LEAN`。
  - 〔实测，默认大小 S 0.42，每 1/30 s 一帧〕头部的位移（头部纹理块的平均位移，CSS px）：点头峰值约 1–1.3（大肥鱼 3–4），歪头 3.5–7，低头 2.2–3.5（大肥鱼 5–8），凑近 1.8–3.1、头框放大到 1.08–1.1（大肥鱼 6），晃来晃去 5–7（大肥鱼 7–9）；三位娘的后仰原来只有约 1.1–1.8、头框缩到 0.93–0.96、头框中心动约 1，和不动看不出差别，加大到现在的数后约 2.3–3.2、头框缩到 0.85–0.88、中心动 4–5.6（大肥鱼的后仰本来就有 9）。
- **跺脚（kit 侧）**：`stamp` 1.3 s，先 `setMode('idle')`（坐着、趴着就站起来）；前面那只脚（朝向那边）按 `stampLift` 抬起 22 个单位、在 `STAMP.at`（k=0.42、0.82）时落地，每次落地出 `land` 声、扬尘、整组一震（`sqv`），整组微微侧倾 3°。四位娘的鞋和大肥鱼的腿都按 `frame.legs` 画，所以形象不用另写代码。
- **跪坐的头（`kneelHead`）**：
  - 是挂在 `kneel` 下面的网格变形。用的是四个 `model.json` 里已有的 `poses.kneel.head` 框，没动美术管线。
  - 位置：`cc/motion.js:524-526, 979`，gpt `:561-563, 1042`，gemini `:610-612, 1113`，grok `:807-809, 1417`，大肥鱼 `whale/figure.js:525-527, 1271`。
  - 动法：
    - 点头：头往下沉，头顶往下巴方向压扁；
    - 摇头：头横向滑动；
    - 叹气：吸气时头抬起，呼气时头往下沉；
    - 歪头：绕框下沿中点（下巴）转，满幅 9°。
  - 框的两侧和下沿不动，头发不会被撕开。
  - 跪着、趴着的歪头不经过站姿那根头部弹簧（`sp.head`），所以先过 `tiltEased`：歪过去、回正都照原样跟着，但歪着停住时又来一个头部手势（点头、摇头、叹气或再一次歪头）把它截断，头按 `TILT_BACK` 匀速回正（每秒 6 个满幅，满幅约 0.17 s；歪头自己回正最快是每秒 5 个满幅，所以照常回正时不受影响），不会一帧弹回原位（之前跪着、趴着时头顶一帧跳 14～16 个单位）。〔测试〕四位娘 figure 测试和 `whale-pose.test.js`「a head gesture cutting a held tilt short…」
  - 幅度在 `KNEEL_HEAD`（shake 5、nod 2、squash .06、exh 2.5、inh 1.5、tilt 9、down 1.6）。
- **Coo**：没有代码改动，kit 的前倾和侧倾本来就带着头部通道（歪头也是 kit 的侧倾）。
- **看不见的情况**：背过身（`away`）时，四位娘和大肥鱼看不见点头，摇头只让后面的头发晃一晃。
- 〔测试〕四位娘各 5 个、`whale-pose.test.js` 5 个、`pet-actions.test.js` 2 个；〔实测〕渲染 `/tmp/combo/partb/r1-<形象>.png`、`k-*.png`。

---

### 11. 尾巴、耳朵、翅膀的通道（plus）

- **kit 侧**：`APPENDAGE_MOVES`（`wag` 尾巴 2.4 s，`earflick` 耳朵 1.1 s，`earsup`、`earsdown` 耳朵 2 s，`wingbeat` 翅膀 2 s）各放进 `pet.app.<部位>`，帧里多一个 `appendages: { tail, ears, wings }`（各是 `{ kind, k }` 或 `null`），只有 plus 帧有（〔测试〕非 plus 帧没有这个键）。和 `pet.head`、`pet.pulse` 互不顶替；同一部位来新词就换掉旧的。不带表情、不调 `setMode`（走着照走），跪坐时不结束跪坐（`keepKneel`）；组里排在头部手势那一档（`groupRank` 2）。播放期间算「在动」（`isMoving`），趴着时也不插小动作。kit 自己不画任何一个：Coo 和 Claude 娘的词表里没有它们。摇尾巴、抖耳朵、扇翅膀各有自己的声音（`wag` 左右几下轻甩声、`earflick` 四下轻颤、`wingbeat` 每次往下扇一声「呼」），竖耳朵、耳朵耷拉不出声；导出包按词表带上对应的 WAV。
- **World 侧**：`CHANNELS` 里 `wag: ['tail']`、`earflick` / `earsup` / `earsdown: ['ears']`、`wingbeat: ['wings']`；`sleep` 和 `petrify` 也占这三个部位。`rankOf` 把它们排在头部那一档。提示词按形象有词的部位列一组，标签是「尾巴(单独算一个部位)」「尾巴、耳朵(各算一个部位)」「尾巴、翅膀(各算一个部位)」「翅膀(单独算一个部位)」（Grok 娘）；身的动作「也占…」只写形象有的部位（Gemini 娘的睡觉写「也占手、头、表情、尾巴、耳朵」）。跪坐的说明在头部手势后面加「尾巴、耳朵的动作」这类，只写形象有的部位。
- **形象侧**：词盖过心情给那个部位的动作，份量 `appHold`（最后七分之一交回心情）再按 `APP_EASE` 逐帧缓过去，相位用自己的时钟，所以开始、结束都不跳。
  - 摇尾巴：GPT 娘尾尖摆 24°（期待时 10.5°）、每秒 12 弧度，尾尖翘起一点；Gemini 娘尾尖摆 36°（期待时 16° 再加尾尖抖动）、每秒 13 弧度；大肥鱼左右 26°（期待时 13°）、每秒 12 弧度，趴着地上的尾巴 15°，背影图的尾鳍 13°。四位娘坐着、跪坐时尾巴是坐姿、跪坐图上画好的，不动（词的说明里写了）；Gemini 娘趴着时，趴姿图上竖在身后的尾巴按 `LIE_DRAWN.tail`（从尾根到尾尖的一条折线和宽度）在一个网格变形 `lieParts` 上绕尾根摆 12°，离折线远的地方（翘起的鞋、发髻）不动；GPT 娘趴着时尾巴压在腿下面，不动。大肥鱼跪坐时尾鳍是跪坐图上的，不动。
  - 扇翅膀（GPT 娘）：两只翅膀一起抬高 4° 再上下各扇 13°、每秒 2.6 下，扇到上面时最宽；坐着照扇；跪坐时跪坐图的翅膀画死了，所以扇翅膀期间换成跪坐混合体（同手势，一帧切），跪坐保持；趴着时趴姿图上的翅膀按 `LIE_DRAWN.wing` 扇 8°（翼尖贴着翘起的小腿，`keep` 框里的小腿不动）。
  - 耳朵（Gemini 娘）：竖耳朵是心情的「竖起」拉满、再往里转 6°、高度再乘 1.1；耳朵耷拉是往两边压平（`flat` 1、`droop` 0.7）、高度再乘 0.93；抖耳朵是两只耳朵各往外甩 16° 四下（右耳晚三分之一下，`earFlickOf`）。坐着照做；跪坐时同扇翅膀换成混合体；趴着时趴姿图上的两只耳朵按 `LIE_DRAWN.earL/earR` 绕耳根转（耷拉往外 16°、竖起往里 7°，抖耳朵同站姿）。
  - 扇翅膀（Grok 娘）：发饰上的两只小蝙蝠翅膀一起上下扇，每边 14°（绕抬起 6° 处）、每秒 2.6 下（和 GPT 娘一样，扇翅膀的音效按这个节拍在每次下扑时响），下扑时张开到 1.1 倍宽（`WINGBEAT`、`WING.wide`）；坐着、站着都是活的翅膀，跪坐时换成混合体（跪坐图上的翅膀不会动），趴着时趴姿图上的两只翅膀按 `LIE_DRAWN.wingL` / `wingR` 扇 ±6°（绕抬起 2°，`LIE_PARTS`），蝴蝶结（`keep` 框）不动。
  - `LIE_DRAWN` 是在 `lie_body.png` 上量的，带着量的时候那张图的 `box`；图的框变了（重画、别的包）就不建 `lieParts`，那几个部位在趴姿时不动。
- 〔测试〕`pet-actions.test.js`「the moves of a tail, ears or wings」；`script.test.ts`「a tail, ears and wings are parts of their own」；`gpt-figure.test.js`、`gemini-figure.test.js`、`grok-figure.test.js`、`whale-pose.test.js` 各自的摇尾巴、扇翅膀、耳朵测试；`*-pack-export.test.js`。
- 〔渲染〕`scratch/combo6/C/`：站姿逐帧（`g1/`、`m1/`、`w1/`）、坐、跪、趴（`f-gpt/`、`f-gem/`、`l-gem/`、`l-gpt/`）。看过后都收了：扇翅膀和扑腾（连人一起蹦）分得开；竖耳朵、耳朵耷拉和期待、难过的耳朵分得开（配着平常的脸时只动耳朵）。

### 12. 表情决策模式（decider）〔代码〕

上面 §2–§3 说的是 **classic 模式**：bot 看词表，自己写 `【】<>` 标记或调 `pet_act`。有 OpenRouter 密钥（`core/decider-key.ts`：环境变量 `OPENROUTER_API_KEY`，或基址是 OpenRouter 的端点的 `.env`）且「习惯」页的「表情决策」开着（`worlds.desktop-pet.decider.enabled`，默认关，由用户打开）时，World 换成 **decider 模式**（`PKG/src/decider.ts`，设计稿与偏差记录在 `scratch/decider/DESIGN.md`）：

- **bot 看不到任何词。** 环境提示词换成 `PKG/src/ENV_PROMPT_DECIDER.md`（没有 `{{pet.vocab}}`，系统前缀 Claude 娘约 21.7k → 9.6k 字,Coo 约 18.3k → 9.4k 字(eval `--dry` 实测)）；工具表换成 `DECIDER_TOOL_DECLS`：`pet_say(text, feeling)`、`pet_ask(…, feeling?)`、`pet_feel(feeling)`（替 `pet_act`）、`pet_walk(direction, pixels, run)`（替 `pet_walk_to`）、`pet_set`、`pet_quiet`。一个气泡一句 feeling。两种模式在 World 里是一个锁存值（`petMode`），只在设置或密钥变了时改，改了就调 `onModeChange`，Coopanion 据此 `reloadSystemPrefix`；重建前模型调旧工具名仍照旧执行（Core 的工具表是重建时的快照）。
- **决策：每个部位一道选择题。** `buildQuestions` 用 `partOf`（与 `vocabTable` 的部位分组同一来源）把当前形象的词分进 `face`（全部表情，含石化）、`head`（部位 0）、`arm`（部位 2、3：只占手的、要站着或坐着不动的）、`body`（部位 4：姿势和全身动作，含包自带的动作），以及形象有词的 `tail` / `ears` / `wings`（部位 1）。每个词恰好进一道题；`walk`、`run` 不出题（走动归 `pet_walk`）；`pet_say`/`pet_ask` 不给 `sleep`；`body` 题去掉她现在的姿势（站着去掉站起来、坐着去掉坐下、跪坐去掉跪坐…），被拎着或在空中不出 `body` 题。每题第一个选项是「不动」类（「不换表情」「头不动」「手不动」「保持现在的姿势(现在:坐着)」…）。选项名是词的第一个中文名，说明是 `about`、心情组（表情）、别名和「会一直保持下去」（lasting）。第三方包的词按它的 `kind`、`names`、`about` 自动成题。六个内置形象：Coo 和 Claude 娘 4 道题，大肥鱼多 `tail`，GPT 娘多 `tail`、`wings`，Gemini 娘多 `tail`、`ears`，Grok 娘多 `wings`〔测试〕`decider.test.ts`。
- **state**（`buildState`，≤1500 字）：形象的样子、她此刻的心情、要说的话、对方 10 分钟内最后说的话（打字、语音、回答）、姿势与位置与朝向、最近 5 次决策做过的词、星期和时间。
- **从答案到一组**（`pickGroup`）：每题按 `probabilities` 取胜者（没有时用 `choice`）；「不动」胜出或低于门槛就不动——表情 0.20，头、手 0.30，身 0.55（趴下、睡觉 0.70），尾巴耳朵翅膀 0.50；同一题最近两次都是这个词、第二名不是「不动」且不低于胜者的 0.6 倍就换第二名；除表情外最多动 2 个部位（姿势也算）；表情第二名 ≥0.20 且 ≥胜者一半、两张脸在形象的 `pairs` 里，就作为表情对一起进组；最后按概率从高到低逐个用 `clashes` 检查，和已留下的冲突就丢掉（趴下 0.8 + 招手 0.6 → 只趴下；石化胜出 → 只石化；唱歌 + 跳舞 → 留概率高的；带 `keepsArms` 的跪坐 + 唱歌、跪坐 + 招手 → 都留，Coo 的跪坐 + 招手 → 只跪坐）。结果仍交给 `parseActions`（表情对、`keepsArms`、组内排序的唯一来源），所以一组不会被拆开（六个形象各随机 1000 组答案验证）。
- **时序**：`pet_say` 先把气泡发给页面（`say` 带 `acts: 'pending'`、`holdMs: 900`），同时调决策（超时 `decider.timeoutMs`，默认 2500 ms）；结果用 `say-acts {id, actions}` 按气泡 id 补上，失败或超时补空的。页面轮到这个气泡时最多等 `holdMs`，拿到词就像脚本开头的 `【】` 一样先做再打字；词晚到时气泡已在打字就立刻做（`web/acts.js` 的 `sayHeld`、`attachSayActs`〔测试〕`tests/pet-actions.test.js`）。`pet_say`（和带 feeling 的 `pet_ask`）的回执立刻返回、不等决策；决策按调用顺序一个接一个做，做了什么在下一条桌宠回执或下一批事件的 `[位置]` 行后跟一行 `[表情动作] 刚才的气泡:「…」…` 说一次。提示词让 bot 把姿势写进 `pet_say` 的 feeling，`pet_feel` 只在这一轮不说话时用（每多调一个工具就多一轮聊天模型调用）。`pet_feel` 的结果走和 `pet_act` 一样的 `act`。
- **发出去的内容**：每次决策的 state 里有 bot 这句话、feeling、对方 10 分钟内最后说的一句话、姿势位置和时间，发给 OpenRouter；密钥只在请求头里。默认关，用户打开「表情决策」才发；填了密钥也不会自动打开。
- **兜底**：单次失败或超时，这一句只说话不做表情动作，不换模式、不换提示词；连续 3 次失败熔断 60 秒（期间直接兜底，气泡不等）；密钥被删 5 秒内切回 classic。
- **位置**：页面发 `{ t: 'pose', x, w, facing, mode }`（连上时、`mode` 变化、走完、尺寸变化、朝向变化），World 由此和最后发出的姿势词算出姿势（跪坐在页面上也是 `sit`）。decider 模式下每个桌宠工具回执末尾、每批投递的事件里（恒挂一个 `piggyback` 的延迟事件 `desktop-pet.pose`，投递时现渲染）都有一行 `[位置] 屏幕横向 x/w 像素(百分比),面朝…,站着;往左还能走约…像素,往右约…像素。`。classic 模式不发这行。
- **走动**：`pet_walk` 从最后报的 `x` 加减 `pixels`，先截到 `[0, w]`，页面和 kit 再截到舞台边；实际走的比要求少 8 像素以上就在回执里说「走到屏幕边停下了」并报停在哪。
- kit、各形象、`figure.json`、导出包都没改；表情对清单和计数不变。评测：`scratch/combo2/eval`（`--decider`、`--classic`，见它的 README）。
- **加了四个新表情之后**（翻白眼、震惊、死鱼眼、流口水）：它们自动成为表情题的选项，六个形象的表情题都从 59 个选项变成 63 个（62 个表情加「不换表情」，按 `buildQuestions` 点数）。说明就是 `about`，每条都写了什么时候用、和旁边哪张脸区别（比「嫌弃」更直接、比「惊讶」重、不是困也不是生气、眼睛放光想吃用「馋」）。选项多了会分走概率，所以用 `scratch/decider/tune/requery.ts --vocab-changed` 拿新词表把同样 193 个情形重问了一遍 `perplexity/pplx-decider-v1.1-27b`，再用 `tune.ts` 按现在的参数比较〔实测〕：每条回复的表情 1.57 → 1.56 个，落在对应心情组的 93.5% → 91.3%，用到的词 72 → 73 个，表情胜者 ≥ 0.20 的 188 → 187 次（0.20–0.30 之间的从 21 次降到 10 次，没有落到门槛下的），「不换表情」胜出 0 次；表情门槛降到 0.15 也没有改善（1.6 个、91.3%）。门槛不改。这 193 个情形里四个新表情一次也没当上第一：录下来的对话本来就很少有翻白眼、震惊、犯困流口水的场合。
  - **重问没有波动**〔实测〕：同一词表把 193 个情形又重问两遍，三遍的每题概率分布逐位相同（0 处翻转），这个决策模型对同样的请求是确定的。所以上面 93.5% → 91.3%（19 处翻转）是加了四个选项带来的，不是「波动」（v0.8.1 的发布说明这样写错了）。真正的不确定在措辞：只改四条说明里的几个字，193 个情形就有 8–13 处翻转，表情在期望组在 76.6%–77.6% 之间动，所以小于约 1 个百分点的差别不能当成好坏。延迟才有波动：579 次的中位数 957 ms、p90 1199 ms，98% 超过当时的 900 ms 等待。
  - **等待改成 1100 ms**（`DECIDER_HOLD_MS`、`web/acts.js` 的 `SAY_HOLD_MS`）：同条件下约 85% 的决策在 1100 ms 内到，表情多数能赶在打字前；代价是一个气泡最多晚 0.2 s 开始。
  - **精简请求**（`buildQuestions` 的 `noAliases`、`noMood`，默认都关）：去掉「也叫」后输入 4906 → 4098 token、费用少 16%，同条件下中位数延迟只快约 6%（956 → 898 ms）；回复命中 91.3% → 93.5%，表情在期望组 77.3% → 75.3%，一升一降，不采用。再去掉心情标签，表情在期望组掉到 73%，心情标签有用。延迟的大头是固定开销，所以靠放宽等待，不靠缩请求。
  - **新表情的场景**（`scratch/combo2/eval/scenarios.json` 加了 6 个：被说教、吹牛、冷笑话、火锅、中彩票、删库）〔实测，DeepSeek v4.1 flash，各 3 次〕：classic 模式 bot 自己写出震惊 5 次、死鱼眼 2 次、翻白眼和流口水各 1 次；决策模式 18 条回复一次也没有。决策模型的挑法和 bot 写的心情对得上（冷笑话那条心情写的是「被逗乐了又想装淡定」，挑了偷笑），四个新表情输给近邻：中彩票「哇」.30 对「震惊」.20–.26，火锅「馋」.86–.97 对「流口水」.02–.13。把四条说明改成先写什么时候用（如震惊「听到惊人的消息被吓一大跳时(中了大奖、闯了大祸、出了大事)」，结尾「比「惊讶」「哇」都重」）后，中彩票三次都换成了震惊（心情写的是「眼睛瞪大、愣住」），193 个老情形里没有一次换成新表情，回复命中 91.3% 不变。翻白眼、死鱼眼仍然要等 bot 写出「受不了」「冷到无语」这类心情。

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
| 跪坐标志 | `pet.kneel` | `kneel` | 手或全身动作（`561-562`）；任何非 sit 模式（`525`）。表情、点头、摇头、叹气、歪头、低头、眨眨眼、尾巴耳朵翅膀的动作不结束它；声明了 `kneelArms` 的形象（大肥鱼和四位娘），`ARM_GESTURES` 里的手势也不结束它 |

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
   - 头（nod、shake、sigh、tilt、droop、blink）一个，手 / 身一个，各自同时只有一个；尾巴、耳朵、翅膀各另有一个（§一.11）。
   - 两个槽能同时播，比如点头 + 招手，或者唱歌时点头。
   - 都能跨过模式变化继续播放：`setMode` 只切掉 roll、song、away 和躺着时的小动作。
4. **被盖住的表情暂停**：
   - 被拎、甩出或放下的空中、晕、起身、倾听、睡着时，主动要的表情暂停倒计时（`1183-1186`）。
   - 盖住不超过 5 s，之后完整显示；连续超过 5 s 就丢掉。
5. **跪坐保持到手或全身动作**，表情、头部手势和尾巴、耳朵、翅膀的动作不结束它；大肥鱼和四位娘只占「手」的手势也不结束它。
6. **一组词同一帧做**：World 先按部位把一组拆好（§二.6），页面把整组交给 `doAll`，kit 在同一帧里做完（`doGroup`）。组里的表情至少持续到同组手势自带的脸结束（唱歌 4.1 s、看书 4.4 s、喝茶 3.7 s、跳舞 3.4 s）。

### 2. 词的分类与部位（共 107 个，数据来自 Coo 的 `figure.json`；部位见 `script.ts:84-104` 的 `CHANNELS`）

| 类 | 部位（`CHANNELS`） | 词 |
|---|---|---|
| **E 表情（62）** | 表情 | neutral 平静、happy 开心、wink 眨眼、love 喜欢、shy 害羞、surprised 惊讶、angry 生气、sad 难过、sleepy 犯困、thinking 思考、smug 得意、pout 嘟嘴、worried 担心、determined 认真、flustered 慌张、scared 害怕、excited 期待、cry 大哭、confused 疑惑、disgusted 嫌弃、nervous 紧张、gentle 温柔、awkward 尴尬、moved 感动、coax 撒娇、tongue 吐舌、giggle 偷笑、eyeroll 翻白眼、shocked 震惊、deadpan 死鱼眼、drool 流口水；30 个组合脸（§一.9）；**petrify 石化**占全部部位，不和别的同时做 |
| **H 头部手势（4）** | 头 | nod 点头、shake 摇头、sigh 叹气、tilt 歪头；Coo 没有的：droop 低头、blink 眨眨眼（大肥鱼、四位娘） |
| **P 尾巴、耳朵、翅膀（0）** | 尾巴 / 耳朵 / 翅膀，各算一个部位（提示词里按形象有的部位列成一组，如「尾巴、耳朵(各算一个部位)」；sleep、petrify 也占它们） | Coo 没有的：wag 摇尾巴（大肥鱼、GPT 娘、Gemini 娘）、wingbeat 扇翅膀（GPT 娘、Grok 娘）、earflick 抖耳朵、earsup 竖耳朵、earsdown 耳朵耷拉（Gemini 娘） |
| **G 手势（18）**：不改模式 | 手 | wave 招手、shiver 发抖、heart 比心、serve 奉茶、salute 敬礼、vsign 比耶、point 指、cover 捂嘴笑、cross 抱臂、stretch 伸懒腰、pray 拜托、scratch 挠头、idea 有了、hug 抱抱、hips 叉腰、spout 喷水（仅 Coo/大肥鱼）、sip 喝茶、read 看书；Coo 没有的：muse 托腮/琢磨（大肥鱼、四位娘）、fist 加油、jot 记笔记、twiddle 对手指（四位娘）；clap 拍手、shrug 摊手、headhold 抱头、raise 举手、thumbs 点赞、shush 嘘、wipe 擦汗（大肥鱼、四位娘） |
| **GB 要她停下来做的手势（7）** | 手 + 站位（提示词里归在「手,要站着或坐着不动」一组） | song 唱歌、spin 转圈、bow 鞠躬、flinch 后缩、peek 探头、away 背过身、cheer 欢呼（详见表下）；Coo 没有的：closer 凑近、leanback 后仰、sway 晃来晃去（大肥鱼、四位娘） |
| **turn 转身** | 站位（提示词里写「身」） | 只翻身，不调 `pulse()`（`body.js:576`） |
| **L 持续姿态（4）** | sit：身；kneel、lie：身 + 手（带 `keepsArms` 的 kneel：身 + 站位）；sleep：表情 + 头 + 手 + 身（还有尾巴、耳朵、翅膀） | sit 坐下、kneel 跪坐、lie 趴下、sleep 睡觉 |
| **M 模式动作（11）** | 身 + 站位；dizzy 另占表情；flap 另占手；roll 另占手和头；curtsy 是手 + 站位 + 身 | stand 站起、walk 走走、run 跑、look 张望、dizzy 晕、dance 跳舞；**busy 类**：jump 跳、hop 小跳、flap 扑腾、roll 翻滚；curtsy 屈膝礼（回到 idle，并起自己的手势）；跺脚 stamp 同 curtsy（Coo 没有） |

GB 类在 kit 里的行为：
- spin、bow、flinch、peek、away，还有 closer、leanback、sway：没坐着时先回到 idle（坐着、趴着就坐着、趴着做）。
- stamp 和 curtsy 一样总是先 `setMode('idle')`：坐着、跪着、趴着、睡着都先站起来。
- cheer：站着时进入 crouch/air。
- song：只在站着或坐着、没在听时能做。

包自带的表情占「表情」；包自带的动作占除表情以外的全部部位（`channelsOf`，`script.ts`）。`kneel` 带 `keepsArms`（包的 `figure.json` 里每个词可写，只对 lasting 的 kneel 起作用）时，`channelsOf` 返回 `['body', 'stance']`：手空出来；静态的 `CHANNELS.kneel` 不变（Coo 和第三方包）。站位留着，所以 GB 类的欢呼、鞠躬、后缩、探头、背过身、转圈和转身仍和跪坐拆开，它们在 kit 里也会结束跪坐。唱歌例外：它在 `ARM_GESTURES` 里，kit 跪着也唱（大肥鱼仍画跪坐图，四位娘画混合体），所以分组时 `clashes` 让带 `keepsArms` 的 kneel 和 song 同组（`KNEEL_SINGS`），`跪坐+唱歌` 发成 `kneel+song`。

**部位表反映的是 kit 实际会拒绝或改变的东西**：
- 唱歌要她站着或坐着不动，所以和走、跳舞、张望、跳、小跳冲突（站位）。
- 屈膝礼、跺脚会让她站起来（身）。
- 跪坐、趴下、睡觉时看不见手势（手）；而且手势会结束跪坐。大肥鱼和四位娘例外：跪着画得出手势，手势也不结束跪坐（`keepsArms`）。
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
- jot → reading（四位娘倾听的手臂图；倾听的脸会带出声波，所以用看书的脸；主动要的表情在时让路）
- clap/raise/thumbs → happy；shrug → sighing；headhold → pained；shush → wink+neutral（眨眼的眼睛、平静的闭嘴，不像偷笑）；wipe → gentle（大肥鱼和四位娘的七个新手势）
- hips → determined；cross → pout。不再是特例：和其他动作一样，主动要的表情在时它们让路。

其中 singing、sighing、reading、sipping、stretching、saluting、pointing、peeking、bowing、pleading 是 `BODY_OWN`（`body.js:258`）：这些脸本身带着手势的身体语言，叠加规则见 §一.7 和 §二.4。

**不带表情的动作**：stand、walk、run、jump、hop、look、turn、nod、shake、spin、sit、sleep、dizzy、shiver、kneel、lie，以及 tilt、muse、fist、twiddle、droop、blink、closer、leanback、sway、stamp、wag、earflick、earsup、earsdown、wingbeat（配当时的表情）。做完后脸回到模式默认（content、run 或 neutral）。

### 3. 表情 × 表情

| 情况 | 结果 | 依据 |
|---|---|---|
| 新表情 → 旧表情 | **替换**；连放同一个表情会重新计时 | 〔实测〕`body.js:732` |
| 同一组里两个表情（`开心+难过`） | 这一对在形象的白名单（`pairs`）里：合成一张脸，回执说明谁给眼、谁给嘴；不在：World 拆成先后两个，回执里说明。白名单按形象不同（四位娘 135 对、大肥鱼 106、Coo 24）。别的「一个表情的眼 + 另一个的嘴」，用组合脸 | 〔测试〕`script.test.ts` |
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
- 身体语言用手势的：四位娘唱歌时的祈祷手、抬下巴、节拍，大肥鱼的鳍。
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
| **kneel** | **跪坐保持**，头在跪坐画上动（`kneelHead`） | Coo：跪坐结束，变成普通坐姿后做手势；大肥鱼和四位娘：**跪坐保持**，换成跪坐下半身（`kneelLow`）上的实时上半身画手势 | 跪坐结束，变成普通坐姿后做 | 替换（kneel → kneel 保持） | 结束 | 结束 |
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
- kneel 遇到 G 那一格的大肥鱼和四位娘部分，是「跪坐时也能做手上的动作」加的：〔测试〕`pet-actions.test.js`（`kneelArms` 时 `doGroup(['kneel','wave'])` 保持跪坐、`kneel+cheer` 结束），`tests/{claude,gpt,gemini,grok}-figure.test.js`（共用 `tests/helpers/kneel-arms.js`）、`tests/whale-pose.test.js`。
- kit 层面能共存，不代表形象画得出来，见 §8。

### 6. 经 LLM 下指令时，实际能「同时」出现的组合

**一组同时做（`a+b`）**〔测试〕`script.test.ts`「words at once」、`world.test.ts`；〔实测〕`edge/t1.mjs`、`/tmp/combo/vind-ours-*.log`：

- **写法**：
  - 在 `【】`、`<>`、`pet_act` 的每一项、dialog 的 `actions` 里，用 `+` 或全角 `＋` 连起来。`+` 两边可以有空格。
  - `【】` 里的逗号、顿号、空白仍然表示先后。
- **部位**：一组里表情、头、手、身（含站位）各最多一个，所以一组最多 5 个成员（白名单里的表情对算一个表情，最多 6 个），body-host 的 8 个上限碰不到。
- **能成组的例子**：`【坐下+开心+招手】`、`<点头+眨眼>`、`【点头+招手】`、`【摇头+抱臂】`、`【坐下+点头+比心】`、`【跪坐+点头+开心】`、`【唱歌+坏笑】`、`【坐下+唱歌】`、`【走走+开心】`、`【小跳+招手+开心】`、`【张望+疑惑】`；大肥鱼和四位娘还有 `【跪坐+招手】`（`招手+跪坐` 也一样，身在前发成 `kneel+wave`）和 `【跪坐+唱歌】`。
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
- **kneel + 后面的表情、点头、摇头、叹气**：跪坐保持（v0.2.6 遇点头就结束）。Coo 的手势仍然结束跪坐，变成普通坐姿；大肥鱼和四位娘的手势（只占手的）跪着做，跪坐保持。
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
| **lie 趴下** | 每 4–8 s 自己做一个小动作（kick/chin/thump），新手势或正在播的头部手势会顶掉或推迟它（`976`）；song 被拒绝；表情照常画在趴姿图的头上（站姿的眼睛、嘴图按趴着的头转正、缩放后贴上，组合脸、眨眼、视线、说话口型都在）；头部手势和叹气由 `lieHead` 画；四位娘和大肥鱼趴着时手臂看不见 | 〔实测〕`973-977, 558`；〔代码〕`cc/motion.js:952, 986` |
| **kneel 跪坐** | 保持到下一个手或全身动作。表情、点头、摇头、叹气、歪头、低头、眨眨眼、尾巴耳朵翅膀的动作都不结束它，头部手势由 `kneelHead` 画；一组 `kneel+nod+happy` 30 s 后仍是跪坐。大肥鱼和四位娘声明 `kneelArms`：只占手的手势和唱歌也不结束它。手放着不动时画跪坐图（跪坐图上画实时的脸，同站姿）；手臂摆出姿势时（手势、托腮这类表情的手臂，四位娘的倾听除外），一帧换成**跪坐混合体**：跪坐图裁出的下半身（`poses.kneelLow`：裙摆、腿、尾巴，去掉手臂和裙边以外的头发）上面是会动的上半身、头和实时的脸，头正好落在跪坐图的头上（下沉 `headDrop`），气泡位置不动；手放下 0.25 s（`KNEEL_ARMS_HOLD`）后一帧换回跪坐图。跪坐中起身也是混合体 → 跪坐图 → 站，不经过坐姿图 | 〔实测〕`edge/t1.mjs`；〔测试〕`561-562`、`tests/helpers/kneel-arms.js`、`whale-pose.test.js` |
| **sit 坐下** | 表情、手势、头部手势、GB 都能叠加，仍保持坐姿；空闲逻辑不会让主动要的坐姿超时；站起来时主动要的表情在 wake 期间暂停 | 〔实测〕`580, 957` |
| **sleep 睡觉** | 见表下 | 〔实测〕`582, 710, 566` |
| **dance 跳舞** | 3.2 s；手势、头部手势叠加；主动要的表情盖过跳舞自带的 happy，跳舞继续；GB、L、M 打断；petrify 让它停下 | 〔实测〕`588, 727` |
| **walk/run 走 / 跑** | 见表下 | 〔实测〕`509-514, 788-797, 1633`；〔测试〕`tests/pet-actions.test.js`、`world.test.ts` |
| **talk 说话** | 口型叠在任何表情、手势、姿态上；组合脸说话时眼睛不变、嘴换成说话的嘴；石化时不动；趴着、跪坐时也一样（大肥鱼和四位娘的脸画在趴姿图、跪坐图上） | 〔实测〕kit 部分、`edge/t3.mjs`；〔代码〕形象部分 |
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
  - 形象没有 lie 图时（`poses.lie` 为 false，四位娘 `figure.js:257/259`；kit `lieSet`，`455`），lie 其实是坐着，away 照常转身。
- 背过身时，四位娘和大肥鱼看不见点头。

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
  - 四位娘和大肥鱼用 `partsOf(fc, name)`（`cc/motion.js:160-163`，`whale/figure.js:218-221`）按部位查表：
    - 眼睛贴片、`HALF_LID`、`WINKS` 用 eyes；
    - 嘴用 mouth；
    - 眉 `BROW` 用 brows；
    - 身体表（`MOOD`、`FACE_ARMS`、`HEAD_PITCH`、饰物、鳍、尾巴、呆毛、踢脚）用 body。
  - 「石化不说话」这类判断仍看整个脸名。
  - 帧里没有 `parts` 时（上游 kit），每个部位都按脸名查。
- **眼泪（plus）**：kit 自己的泪滴（`emit: 'tear' / 'tears'`）宽 22.5 个 logo 单位，按 Coo 的大圆眼定的，放在四位娘和大肥鱼脸上比一只眼睛还宽，像一团蓝色盖在脸上。现在形象可以声明 `tearDrop: { w, run }`（logo 单位）：泪滴约四分之一只眼宽（四位娘 `tearDropOf` 取眼球宽的 0.24，约 4.4–5 单位；大肥鱼同样算出约 4.4），从 `anchors.tears` 两只眼下轮流冒出（趴着时从趴姿的 `tear`），先 0.25 s 慢慢鼓起来，再 0.6 s 顺着脸颊滑下 `run`（到画出来的泪痕结束的脸轮廓 `tearEnd`；`run` 也可以两只眼各给一个，大肥鱼远侧那只脸轮廓高，滑得短），这时跟着头走（坐、跪、趴、被拎都一样），然后才落下（重力按 S 缩放）。大哭每 0.45 s 一滴（原来 0.22 s），难过、感动、心碎照它们自己的间隔。屏幕上宽至少 2 px（`TEAR_FX.minPx`），所以把宠物调到最小（S≈0.21）时还看得见；默认大小（S=0.42）下约 2.1 px，2 倍大小约 4 px。不随视线左右偏，也不往上弹。Coo 不声明，照旧用 kit 的大泪滴。导出给上游 v0.1.17 的包带着自己的 `kit/body.js`，所以装在上游也是小泪滴。〔测试〕`tests/pet-actions.test.js`、`tests/<id>-figure.test.js`、`tests/whale-pose.test.js`

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
- 大肥鱼画的手臂换拳头手臂也是一帧切换（`SWAP_AT`）：招手、伸懒腰在拳头手臂转到 82.5° 时；欢呼和长的抬手在离目标角还差 14.5° 时（画的手臂这时还跟着拳头手臂的角度，之后再转到自己的角度）；比心那一类（端杯、拿书、双手的、弯臂抬手）在手势包络进来到 0.175、出去降到 0.475 时（`handsIn`，图之后再升起到位）；敬礼按手势时钟（0.045 / 0.905）；托腮在托腮份额 0.15 时（前臂还几乎垂着，和垂下的手臂方向接近）。〔测试〕`tests/whale-pose.test.js`
- 组合脸由 `paintFace` 按部位画眼睛和嘴。smug、angry、sad、shy 有自己画好的眼睛（`drawnEye`；8 套配色各一份），所以 smirk、doubt、bashful、huff、sulk 和眼睛取自这四张脸的表情对也用它们（后来 eyeroll、shocked、deadpan 也有了自己画好的眼睛，都是 `ring` 眼，所以同样走 `drawnEye`、同样过了 DRAWN_SHUT 就切回画的眼睛闭合）；这时眼皮褶（`eye_creases`）淡出，贴图自带。眨眼（和 kit 让她闭眼）闭上超过 `DRAWN_SHUT`（0.4）时换成画的眼睛，眼皮按同样程度落下，闭眼的帧有眼皮和睫毛线；这之前贴图只压扁（`sy = 1 - .9·shut`），一帧切换藏在眨眼里。站、坐、转头和跪坐、趴下的实时脸走的都是这一处。shy 回头看你那一下（plus 的 shy 每 2.6 s 一次）用画的睁眼。worried、determined 仍是画的睁眼加眉。〔测试〕`tests/whale-pose.test.js`

**Claude 娘**

- 手臂由 `armPlan`（`cc/motion.js:275-295`）决定。手臂类手势（`ARM_ONE`/`ARM_BOTH`，`:230-235`）在播放期间以及结束后 0.4 s 内，都会压住表情带来的手臂姿势（`FACE_ARMS`，`:237-240`）。`FACE_ARMS` 的四张图也各有自己的手势词：`muse`→`chin`、`fist`→`fist`（单手，另一只手抱书）、`jot`→`write`、`twiddle`→`shy`（双手）。七个新画的手势：`raise`、`thumbs`、`shush`、`wipe` 在 `ARM_ONE`（单手，另一只手抱书），`clap`、`shrug`、`headhold` 在 `ARM_BOTH`；拍手的第二张画 `clapo`（两手分开）在 `ARM_TWIN`，`armPoseOf(g, k)` 按 kit 的 `clapShut(k)` 选合掌或分开，换画时新的一张直接接过旧的那张的透明度（一帧切换，不交叉淡入）。缺图时的替身（`POSE_ALT`）：点赞→加油、举手→招手、嘘→捂嘴笑、擦汗→挠头、分开→合掌→拜托。GPT 娘、Gemini 娘、Grok 娘一样（另一只手垂着）。跪坐时不摆倾听的笔记本（`KNEEL_FACE_SKIP` 按表情算），`jot` 手势照样切进混合体。头部手势不进 `armPlan`，不压手臂。
- 换手臂图不交叉淡入（两只同一边的手半透明叠着像重影）：手臂按各自的份额（`armA`，`ARM_FADE` 0.15 s）照旧移动、升起到位，但每张手臂图要么整张显示要么不显示——计划里的每张图份额都到 `ARM_CUT`（0.5，移动的正中）时，一帧换下正在显示的图（`armShown`；显示中的图份额已经没了就马上换）。坐着时坐姿的手臂和书跟着同一帧换（`sitOwnK` 不再淡）。跪坐混合体照旧一帧切进来，那一帧手势的手就已经在了，再升起到位。GPT 娘、Gemini 娘、Grok 娘一样。〔测试〕`tests/helpers/arm-cut.js`
- 表情要摆手臂，需要两个条件：处在平静模式（idle/look/sit/sleep/wake），并且表情持续超过 0.3 s。组合脸按 body 部位摆手臂，比如 huff 抱臂；唱歌叠加时是祈祷手。
- **抱书**：
  - 空闲时抱着书；
  - 单手手势时，另一只手用 `bookside` 夹着书；
  - 双手手势或表情姿势时，书不见；
  - 跪坐时把书放到一边（`armPlan` 的 `kneel` 是 kit 的跪坐标志）：空闲时双手放下，单手手势的另一只手垂下（`hangR`，不是 `bookside`），所以跪坐混合体里不出现书。
- 被拎或晕时双臂下垂，任何姿势都不显示（`:278`）。
- **画好的睁眼眨眼**（四位娘相同，`face.js` 的 `planEye`）：表情自己的睁眼贴图（angry、sad/worried、shy、smug、determined/敬礼、surprised/scared 和 `fc.wide`）和半闭眼贴图（`halflid`：犯困、惬意、温柔、看书、喝茶、嫌弃、叹气）在眨眼开头和结尾压扁（`sy = 1 - .9·shut`）；眨眼或 kit 换脸时闭眼超过 `DRAWN_SHUT`（0.4）一帧切成画的睁眼，眼皮按同样程度落下，闭眼那几帧是眼皮和睫毛线，不再是一条深色细缝（同大肥鱼）。cry 的眼睛本来就是闭着画的，照旧压扁；开心、睡觉、眨眼那只闭着的眼、爱心、>< 和晕的眼睛不变。站、坐、转头和跪坐、趴下的实时脸都走这一处。〔测试〕四位娘 figure 测试「blinks a drawn open eye shut with the painted lid and its lash line past DRAWN_SHUT…」「…standing, seated, turned, kneeling and lying…」（`tests/helpers/floor-face.js`）

**GPT 娘、Gemini 娘、Grok 娘**

- 规则与 Claude 娘相同（`armPlan` 在 gpt 的 `:272`、gemini 的 `:274`、grok 的 `:435`），但没有书：空闲时双臂下垂，单手手势时另一只手是 `hangR`；`POSE_ALT` 用笔记本代替书。

**四位娘的共同点**

- 在 `hideFront` 时（`cc/motion.js`、gpt、gemini、grok 的 `step` 末尾），整个站立身体和所有手臂图都跳过，脸也不重绘。
  - 触发条件：趴下、跪坐（跪坐图不透明时）、翻滚成球（翻滚进度 0.165–0.835）和背面。跪坐混合体时不隐藏。
  - 这时手臂手势在 kit 里照常运行，但**看不见**。
  - 脸不重绘站姿的那张，改画在跪坐图、趴姿图上：`poses.<kneel|lie>.face`（空白脸 + 头发前景两张图，中间是实时脸贴图 `<id>Fx`）。`face.js` 的 `paint(..., place)` 把每只眼睛（连同腮红、眼泪）和嘴各按自己的矩阵贴到那个头上，鼻子用图上自己的；`motion.js` 的 `liveFace` 把三张挂在 `kneelHead` / 趴姿的 `lieLegs` 上（趴着时网格 12×8，见 `FLOOR_GRID`），`step` 返回 `floorFace`，`figure.js` 照它画。实时脸的透明度跟跪坐图、趴姿图一样：跪坐混合体一帧换回跪坐图时，混合体头上站姿的脸和跪坐图上的脸是同一张，不会跳；起身时跪坐图还在，脸也还在。shut、smile、talk 三张贴片留着，只在缺空白脸、头发前景图时用。〔测试〕`tests/helpers/floor-face.js`
  - 跪坐时头部手势由 `kneelHead` 画在跪坐图上（`cc/motion.js:524-526, 979`）。
- **跪坐混合体**（第四个身体 `kneelArms`，`BODY_Z` 1.5，在坐姿和跪坐之间）：
  - 跪坐时手臂摆出姿势（`armPlan` 计划了 `book`、`bookside`、垂下的手以外的手臂图，或用垂下的手代替缺的图）就切进去；在混合体里，手臂图还在淡出时、手放下后再 0.25 s（`KNEEL_ARMS_HOLD`）都保持，连着做的手势之间不切回跪坐图。只是还在淡出的手臂图不会让她切进混合体（坐着做完手势或摆过手的表情马上跪坐，仍是坐姿图一帧换跪坐图）。倾听（`KNEEL_FACE_SKIP`）跪着不摆写字的手。
  - Claude 娘：只有混合体里（或跪坐却没有跪坐图时）书才放到一边，单手手势另一只手垂下；往下跪、在跪坐图下面和起身时照旧拿着书。跪坐图完全挡住她时，放着的手（书 ↔ 垂下）直接换好不淡入淡出，所以混合体一切进来就是计划好的手，起身时手里已经拿着书。
  - 切换都是一帧（`bodyStep`、`BODY_CUT`）：跪坐图在不透明的混合体上溶掉，或反过来。
  - `kneel_low`（z 3.05，在站姿裙子之上、上身之下）挂在自己的地面变形器 `kneelLow` 上，跟着身体转和挤压（`st.kneelLow` 抄 `st.body`），腰的接缝不会裂开；混合体时藏起站姿裙子、鞋和 `poses.kneelLow.hides`（GPT 娘、Gemini 娘的尾巴，画在 kneel_low 里；Grok 娘的没有：双马尾和翅膀照旧是活的）。
  - 混合体里头直接下沉整个 `headDrop`（从站姿直接 `跪坐+招手` 时不再慢慢往下飘），kit 的点（气泡等）跟着。
  - 四位娘 `figure.js` 的 `kneelArms` getter：有 `poses.kneelLow` 并且贴图在才是 true。
- 汗滴、怒气、问号这类特效照样画（`cc/figure.js:201-212`）。
- 背面只在站着时出现；坐着时改成转头（`cc/motion.js:707-710`）。
- 说话会覆盖表情的嘴（ω、吐舌、叹气、唱歌），组合脸也一样，眼睛不变；surprised 保留自己张开的嘴（`cc/face.js:90-116`）。
- 石化时冻结在最后一帧，期间的手势和说话都看不见（`cc/figure.js:174-181`）。
- 没有 `spout`：词表和 `GESTURES` 里都没有，`figure.js`、`face.js`、`motion.js`、`fx.js` 里也没有相关代码。kit 读 spout 锚点时有兜底（`A.spout ?? …`，`l.spout || …`），所以不需要占位。〔测试〕`tests/{claude,gpt,gemini,grok}-figure.test.js`

**导出到上游的包**
- 大肥鱼和四位娘的导出包自带 kit 和形象代码，所以在上游 v0.1.17 里也有组合脸、头部通道和这套表情规则。
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
| 没有形象声明 `kneelArms`（原「仍然存在」第 7 条） | 大肥鱼和四位娘跪着画得出手势（跪坐混合体），声明 `kneelArms`；词表的 `kneel` 带 `keepsArms`，World 把 `跪坐+招手` 排进同一组，回执和词表写明手势不结束跪坐 |
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
5. **背过身时看不见点头**：四位娘和大肥鱼都是这样，摇头只让后面的头发晃一晃。
6. **名字带 `+` 的词不能做组的成员**：单独用可以。
7. ~~**没有形象声明 `kneelArms`**~~：已修复，见上表（大肥鱼和四位娘；Coo 跪坐就是坐，做手势仍变回普通坐着）。欢呼、后缩、探头这些「要站着或坐着不动」的手势仍结束跪坐（唱歌除外，跪着也唱）。
8. **两个表情同组只限白名单里的对**：四位娘 135 对、大肥鱼 106 对、Coo 24 对（§一.9「表情对」），别的两个表情仍拆成先后；方向是全局的，某个形象想要另一个方向就只能不收。
9. **组合脸在 Coo 上不如在四位娘上明显**：Coo 没有嘴。（大肥鱼原先缺 smug、angry、sad、shy 的眼睛图，已补上；她的白名单是补图之前挑的，没有重挑。）
10. **没有 `doAll` 的身体一组词逐个做**：第三方包、非 plus 身体都是这样。被拒的成员（比如跳起来时的表情）每帧重试，最多 2 s（`figure-frame.js:40, 88, 95-98`）；非 plus 身体上，后面的动作仍会按上游规则清掉表情。

---

## 三、组合矩阵：实际看得见的词对〔实测〕

先是 v0.5.0 上的重测（Claude 娘和大肥鱼），后面是两次历史测量（组合扩展前后、表情对之后），历史的数字和当时的说明都原样保留。

### v0.5.0 重测（`75b4f11`）〔实测〕

#### 测法

- **校验**：同一个探针在旧代码 `0fa2d0e`（表情对上线的那次提交，v0.3.0 之后、v0.4.0 之前）上跑，Claude 娘依次 1079、成组 1467，和下面「历史二」完全一样，按词类也逐格一样，所以新旧表能直接接起来。
- **探针**：`scratch/combo7/matrix/matrix6.mjs`（由 `scratch/combo2/tools/matrix5.mjs` 改到 v0.5.0，matrix3/4/5 原样保留；全跑用 `run-all.sh`）。在 node 里跑真实的 plus kit 身体和页面队列 `acts.js`，每对一个新身体，30 fps 逐帧判断；`register.mjs` 把 `web/kit/rig.js` 换成只记录不画图的桩。
- **按形象真实的遮挡**：Claude 娘每帧跑她自己的 `motion.step`，用它的 `hideFront`、手臂计划 `plan`、跪坐混合体 `kneelArmsK` 和地上那张图的实时脸 `floorFace`；大肥鱼跑她自己的 `createWhaleFigure`，看趴、跪、背面图的透明度、正面是否 `hidden`、有没有上传 `kneelFx`/`lieFx`（实时脸）。大肥鱼没有手臂计划可读，手势只看正面画没画（她晕的时候不垂鳍〔代码〕）。各类词怎样算看得见写在探针开头的注释里：表情要正面脸画着或地上的图画着实时脸，手势要站、坐或跪坐混合体画着，头部手势在站、趴、跪坐图下都算，摇尾巴跪坐不算。
- **三种跑法**：
  - **依次**：先 a 后 b、先 b 后 a，有一种看得见就算（同历史）；
  - **成组，直送 kit**：把 `a+b` 推给页面，两个表情按 `figure.json` 的 `pairs` 发（合成对、别名、名单外拆开），即历史表的跑法；
  - **成组，经 World**：用 World 自己的 `parseActions` 和形象清单（`readManifest`）解析 `a+b`、`b+a`，把得到的条目推给页面，有一种写法看得见就算。这是 bot 实际得到的。直送 kit 会多算，因为 World 会把一起做不出来的拆成先后（趴下、睡觉 + 手势，石化 + 任何词，跳、小跳 + 要站着做的手势，翻滚 + 头部手势等，§二.6）。
- **两种时长**：**任一帧**同时看得见（历史口径），和**连续 0.5 s** 都看得见（排除转圈、背过身、翻滚、姿态切换时一闪而过的那几帧）。
- **两套词**：**68 个词**是历史那 68 个（v0.2.6 时 Coo 和三位娘共有，去掉 stand、neutral、turn），用来和历史比；**全词表**是形象自己的词表去掉拼出来的组合脸（`PLUS_MIXES`）和 stand、neutral、turn：之前 Claude 娘 68 个、大肥鱼 69 个（多喷水），之后 Claude 娘 79 个（多歪头、低头、眨眨眼、凑近、后仰、晃来晃去、跺脚、托腮、加油、记笔记、对手指）、大肥鱼 78 个（多歪头、低头、眨眨眼、凑近、后仰、晃来晃去、跺脚、托腮、摇尾巴），词数不同要看比例。
- **前后**：之前 `0fa2d0e`（git worktree 检出），之后 `75b4f11`（v0.5.0）；中间加了跪坐混合体、跪坐和趴着的实时脸、大肥鱼的四种眼睛和重挑的表情对（81 → 98）、歪头、v0.5.0 的新词。在 `75b4f11` 上和加上三位娘 `planEye` 眨眼改动之后各跑一遍（12 组，任一帧），逐对一样。
- **结果**：`scratch/combo7/matrix/h<时长>-<old|head>-<形象>-<seq|group|world>-<68|full>.json`（每对一个真假值）；`cmp.py` 按词类对照，`diff.py` 列出变好、变差的对，`tables.py` 生成下面的表。
- **Coo 没有重测**（可选）：她没有跪坐混合体和地上的实时脸，这一节变化最大的两块都和她无关。

#### 总数（68 个词，2278 对）

格式：之前（`0fa2d0e`）→ 之后（v0.5.0），括号里是比例。

| 跑法 | 时长 | Claude 娘 | 大肥鱼 |
|---|---|---|---|
| 依次 | 任一帧 | 1079（47.4%）→ 1099（48.2%） | 1079（47.4%）→ 1099（48.2%） |
| 成组，直送 kit | 任一帧 | 1467（64.4%）→ 1485（65.2%） | 1447（63.5%）→ 1482（65.1%） |
| 成组，经 World | 任一帧 | 1398（61.4%）→ 1418（62.2%） | 1378（60.5%）→ 1415（62.1%） |
| 依次 | 连续 0.5 s | 947（41.6%）→ 1019（44.7%） | 947（41.6%）→ 1019（44.7%） |
| 成组，直送 kit | 连续 0.5 s | 1266（55.6%）→ 1338（58.7%） | 1248（54.8%）→ 1335（58.6%） |
| 成组，经 World | 连续 0.5 s | 1233（54.1%）→ 1305（57.3%） | 1213（53.2%）→ 1302（57.2%） |

- **Claude 娘任一帧只多了 18–20 对，连续 0.5 s 多了 72 对**。差别在跪坐、趴着 × 表情：
  - 旧代码在姿态切换时有一帧还看得见正面脸，所以任一帧口径下本来就算进去了；
  - 跪坐图、趴着的图画上来以后，旧代码只在图上贴符号和嘴型（§二.8），探针不把它算作这个表情看得见；
  - 现在地上那张图画着实时脸，表情能一直看得见。所以只有按连续 0.5 s 算，才看得出这一块真的变好了。
- **历史表的「任一帧」口径也算进了一闪而过的词对**：转圈、背过身、翻滚、小跳配表情或头部手势，趴下配手势，点头、摇头配看书、喝茶、唱歌等，往往只有一两帧同时看得见。所以 0.5 s 的数比任一帧少八十到两百对，前后都是这样。

#### 按词类（68 个词）

E 表情 27，H 头部手势 3（点头、摇头、叹气），G 其余手势 25，L 姿态 4，M 模式动作 9（跳、小跳、张望、晕、走、跑、扑腾、跳舞、翻滚）。

- 每格是看得见的对数，前后一样的只写一个数，变了的写「之前 → 之后」。
- 「0.5 s」是连续 0.5 s 口径。

**Claude 娘**

| 词类 | 总数 | 依次 | 依次 0.5 s | 直送 kit | 直送 kit 0.5 s | 经 World | 经 World 0.5 s |
|---|---|---|---|---|---|---|---|
| E×E | 351 | 0 | 0 | 118 | 118 | 118 | 118 |
| E×G | 675 | 650 | 598 | 674 | 620 | 650 | 598 |
| E×H | 81 | 78 | 78 | 81 | 81 | 78 | 78 |
| E×L | 108 | 79 → 81 | **27 → 81** | 81 | **27 → 81** | 79 → 81 | **27 → 81** |
| E×M | 243 | 208 | 182 | 213 | 186 | 208 | 182 |
| G×G | 300 | 0 | 0 | 0 | 0 | 0 | 0 |
| G×H | 75 | 0 | 0 | 75 | 63 | 75 | 63 |
| G×L | 100 | **47 → 65** | **47 → 65** | **69 → 87** | **45 → 63** | **47 → 65** | **46 → 64** |
| G×M | 225 | 2 | 0 | 114 | 91 | 104 | 85 |
| H×H | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| H×L | 12 | 12 | 12 | 12 | 10 | 12 | 10 |
| H×M | 27 | 0 | 0 | 27 | 23 | 24 | 23 |
| L×L | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| L×M | 36 | 0 | 0 | 0 | 0 | 0 | 0 |
| M×M | 36 | 3 | 3 | 3 | 2 | 3 | 3 |
| 合计 | 2278 | 1079 → 1099 | 947 → 1019 | 1467 → 1485 | 1266 → 1338 | 1398 → 1418 | 1233 → 1305 |

**大肥鱼**：除下面三行外，每格都和 Claude 娘一样。

| 词类 | 总数 | 依次 | 依次 0.5 s | 直送 kit | 直送 kit 0.5 s | 经 World | 经 World 0.5 s |
|---|---|---|---|---|---|---|---|
| E×E | 351 | 0 | 0 | 81 → 98 | 81 → 98 | 81 → 98 | 81 → 98 |
| E×L | 108 | 79 → 81 | 27 → 81 | 81 | 29 → 81 | 79 → 81 | 27 → 81 |
| G×M | 225 | 2 | 0 | 131 | 108 | 121 | 102 |
| 合计 | 2278 | 1079 → 1099 | 947 → 1019 | 1447 → 1482 | 1248 → 1335 | 1378 → 1415 | 1213 → 1302 |

#### 多出来的从哪里来（68 个词）

- **跪坐 × 手势 +18**：三种跑法、两种时长、两个形象都是这 18 对，来自跪坐混合体。18 个手势是：
  - 捂嘴笑、抱臂、比心、叉腰、抱抱、有了、指、拜托、看书；
  - 敬礼、挠头、奉茶、发抖、喝茶、唱歌、伸懒腰、比耶、招手。
  - 它们都只占手。会结束跪坐的手势照旧不算：鞠躬、欢呼、后缩、探头、背过身、屈膝礼、转圈。
- **跪坐、趴着 × 表情**：
  - 任一帧口径下，多出跪坐 × 石化、趴下 × 石化 2 对（依次、经 World）。
  - 连续 0.5 s 口径下，多出 54 对（27 → 81）：除睡觉外，27 个表情在跪坐、趴着时都一直看得见。
  - 两者都来自跪坐、趴着时的实时脸。
- **大肥鱼的表情 × 表情 +17**：来自 v0.4.1 重挑的表情对名单（81 → 98，§一.9），不是行为上的变化。
- **歪头和 v0.5.0 的新词**：都不在这 68 个词里，见下面全词表。

#### 全词表

总数（前后词数不同，看比例）：

| 跑法 | 时长 | Claude 娘 68 词 → 79 词 | 大肥鱼 69 词 → 78 词 |
|---|---|---|---|
| 依次 | 任一帧 | 1079/2278（47.4%）→ 1418/3081（46.0%） | 1107/2346（47.2%）→ 1388/3003（46.2%） |
| 成组，直送 kit | 任一帧 | 1467/2278（64.4%）→ 2001/3081（64.9%） | 1487/2346（63.4%）→ 1991/3003（66.3%） |
| 成组，经 World | 任一帧 | 1398/2278（61.4%）→ 1908/3081（61.9%） | 1416/2346（60.4%）→ 1901/3003（63.3%） |
| 依次 | 连续 0.5 s | 947/2278（41.6%）→ 1338/3081（43.4%） | 975/2346（41.6%）→ 1308/3003（43.6%） |
| 成组，直送 kit | 连续 0.5 s | 1266/2278（55.6%）→ 1826/3081（59.3%） | 1286/2346（54.8%）→ 1817/3003（60.5%） |
| 成组，经 World | 连续 0.5 s | 1233/2278（54.1%）→ 1777/3081（57.7%） | 1250/2346（53.3%）→ 1769/3003（58.9%） |

- 新词带来的多是新增的词对，不是旧词对变好。
- 依次的比例略降，是因为新词大多是手势，而「手势 × 手势」依次和成组都是 0，它在分母里的份额变大了。

之后（v0.5.0）按词类。H 头部手势 6（加歪头、低头、眨眨眼），G 其余手势：Claude 娘 33、大肥鱼 31（含喷水），A 尾巴 1（大肥鱼的摇尾巴）。每格是「任一帧 / 连续 0.5 s」：

| 词类 | Claude 娘 总数 | 依次 | 直送 kit | 经 World | 大肥鱼 总数 | 依次 | 直送 kit | 经 World |
|---|---|---|---|---|---|---|---|---|
| A×E | — | | | | 27 | 26 / 26 | 27 / 27 | 26 / 26 |
| A×G | — | | | | 31 | 0 / 0 | 31 / 30 | 31 / 30 |
| A×H | — | | | | 6 | 0 / 0 | 6 / 6 | 6 / 6 |
| A×L | — | | | | 4 | 3 / 3 | 4 / 3 | 4 / 3 |
| A×M | — | | | | 9 | 0 / 0 | 9 / 7 | 9 / 7 |
| E×E | 351 | 0 / 0 | 118 / 118 | 118 / 118 | 351 | 0 / 0 | 98 / 98 | 98 / 98 |
| E×G | 891 | 858 / 806 | 890 / 836 | 858 / 806 | 837 | 806 / 754 | 836 / 782 | 806 / 754 |
| E×H | 162 | 156 / 156 | 162 / 162 | 156 / 156 | 162 | 156 / 156 | 162 / 162 | 156 / 156 |
| E×L | 108 | 81 / 81 | 81 / 81 | 81 / 81 | 108 | 81 / 81 | 81 / 81 | 81 / 81 |
| E×M | 243 | 208 / 182 | 213 / 186 | 208 / 182 | 243 | 208 / 182 | 213 / 186 | 208 / 182 |
| G×G | 528 | 0 / 0 | 0 / 0 | 0 / 0 | 465 | 0 / 0 | 0 / 0 | 0 / 0 |
| G×H | 198 | 0 / 0 | 198 / 175 | 198 / 175 | 186 | 0 / 0 | 186 / 165 | 186 / 165 |
| G×L | 132 | 86 / 86 | 112 / 84 | 86 / 85 | 124 | 79 / 79 | 104 / 77 | 80 / 78 |
| G×M | 297 | 2 / 0 | 146 / 115 | 128 / 105 | 279 | 2 / 0 | 153 / 124 | 135 / 114 |
| H×H | 15 | 0 / 0 | 0 / 0 | 0 / 0 | 15 | 0 / 0 | 0 / 0 | 0 / 0 |
| H×L | 24 | 24 / 24 | 24 / 21 | 24 / 21 | 24 | 24 / 24 | 24 / 21 | 24 / 21 |
| H×M | 54 | 0 / 0 | 54 / 45 | 48 / 45 | 54 | 0 / 0 | 54 / 45 | 48 / 45 |
| L×L | 6 | 0 / 0 | 0 / 0 | 0 / 0 | 6 | 0 / 0 | 0 / 0 | 0 / 0 |
| L×M | 36 | 0 / 0 | 0 / 0 | 0 / 0 | 36 | 0 / 0 | 0 / 0 | 0 / 0 |
| M×M | 36 | 3 / 3 | 3 / 3 | 3 / 3 | 36 | 3 / 3 | 3 / 3 | 3 / 3 |
| 合计 | 3081 | 1418 / 1338 | 2001 / 1826 | 1908 / 1777 | 3003 | 1388 / 1308 | 1991 / 1817 | 1901 / 1769 |

新词各自的情况：

- **歪头、低头、眨眨眼**：和点头、摇头、叹气一样。
  - 和石化以外的每个表情都看得见。
  - 成组时和每个手势都看得见；依次时和手势是 0，因为队列等前一个做完才放下一个（历史表的点头、摇头、叹气也是这样）。
  - 跪坐、趴着时也看得见。
- **凑近、后仰、晃来晃去、跺脚、托腮、加油、记笔记、对手指**：
  - 和石化以外的每个表情都看得见。
  - 跪坐时，托腮、加油、记笔记、对手指走混合体，跪坐保持，看得见。
  - 凑近、后仰、晃来晃去会结束跪坐，跺脚要站起来做，所以和跪坐不算。
- **摇尾巴（大肥鱼）**：
  - 成组时和每个词都看得见；经 World 时只有石化例外。
  - 依次时和手势、头部手势、模式动作是 0，因为队列等前一个做完才放下一个；表情和姿态会留着，所以依次时和它们看得见。
  - 跪坐 × 摇尾巴依次时看不见，因为跪坐图挡住了尾巴。

#### 变差的词对：0

逐对比较了前后都有的词对，任一帧和连续 0.5 s 两种口径都看了，没有一对变差：

- 68 个词：两个形象 × 三种跑法 × 两种时长，共 12 次比较；
- 全词表里前后共有的 2278 对（Claude 娘）、2346 对（大肥鱼）。

#### 还看不见的（v0.5.0，68 个词，经 World、任一帧；都是设计如此或画法的限制）

- **表情 × 表情 233 对**（Claude 娘；大肥鱼 253 对）：
  - 只有白名单里的对会合成一张脸，名单外的拆成先后；
  - 依次写的两个表情本来就是先后各一张脸，所以是 0。
- **表情 × 手势、头部手势少的 28 对**：都是石化。石化和任何词都拆开，而且会结束手势。直送 kit 时只少 `petrify|song`，因为石化会结束唱歌。
- **姿态 × 表情少的 27 对**：都是睡着时要的表情，睡着时眼睛一直闭着。跪坐、趴着 × 表情现在都看得见。
- **表情 × 模式动作少的 35 对**：
  - 晕和 27 个表情：晕占着表情；
  - 石化和 8 个模式动作。
- **手势 × 手势 0**：只有一个手势槽。
- **姿态 × 手势少的 35 对**：
  - 趴下 + 手势：World 拆开，趴下以后看不见手臂。直送 kit 时这些在姿态切换那一帧能看到，按连续 0.5 s 算就没有了，所以直送 kit 和经 World 在 0.5 s 时几乎一样（63 和 64）；
  - 会结束跪坐的手势：鞠躬、欢呼、后缩、探头、背过身、屈膝礼、转圈；
  - 坐下 × 屈膝礼，睡觉 × 唱歌、屈膝礼。
- **手势 × 模式动作少的 121 对**（大肥鱼 104 对）：
  - 扑腾、翻滚自己占着手；
  - 要站着做的手势（唱歌、背过身、转圈、鞠躬、探头、后缩、屈膝礼……）和走、跑、跳舞、张望、跳、小跳拆成先后；
  - Claude 娘晕的时候双臂下垂。
- **头部手势 × 模式动作少的 3 对**：翻滚和点头、摇头、叹气，World 拆开。
- **姿态 × 姿态、姿态 × 模式动作是 0，模式动作两两只有 3 对**：身体只有一个，设计如此。

#### Claude 娘和大肥鱼的差别

- 依次：68 个词逐对完全一样。
- 成组：差别只在两处。
  - 晕 × 17 个手势：大肥鱼看得见，Claude 娘晕的时候双臂下垂；
  - 表情对名单不同：Claude 娘 118 对，大肥鱼 98 对。Claude 娘有、大肥鱼没有的 21 对（v0.8.1 起 135 对对 106 对，30 对）；大肥鱼独有 担心+惊讶 1 对。

### 历史一：组合扩展前后（v0.2.6 → 组合扩展，matrix3）〔实测〕

以下是当时的测量和说明，数字没有改。

#### 测法

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

#### 按类别

格式：之前 → 之后，Coo / Claude 娘。

| 类别 | 词对数 | 依次 | 成组 |
|---|---|---|---|
| 表情 × 表情 | 351 | 0 → 0 / 0 → 0 | 0 → 0 / 0 → 0 |
| 表情 × 手势（含头部） | 756 | 63 → 728 / 63 → 728 | 0 → 755 / 0 → 755 |
| 手势 × 手势 | 378 | 0 → 0 / 0 → 0 | 0 → 75 / 0 → 75 |
| 姿态 × 手势 | 112 | 79 → 82 / 56 → 59 | 0 → 82 / 0 → 81 |
| 姿态 × 表情 | 108 | 81 → 81 / 27 → 79 | 0 → 81 / 0 → 81 |
| 和 walk / run / look / dance / jump… 一起 | 567 | 8 → 213 / 8 → 213 | 0 → 374 / 0 → 357 |

#### 按词类

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

### 历史二：表情对之后（matrix4）〔实测〕

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

### 历史一、二当时的结论

#### 变差的词对：0

四次跑都没有。以前看得见的词对，不管写成组还是写成先后，现在都还看得见。

#### 还看不见的，都是设计如此或画法的限制

- **表情 × 表情**：上面的表是表情对之前的数，同一组里的两个表情都拆成先后，所以是 0；常用的一眼一嘴组合由 23 个组合脸当单独的词。表情对上线后的数见上面「历史二」：成组时白名单里的对看得见，Coo 24/351、Claude 娘 118/351（上限 325/351，和 petrify 的 26 对设计上不合并）。
- **手势 × 手势**：成组时看得见的 75 对，全是头部手势配一个手的手势（点头、摇头、叹气 + 手势）。手 + 手仍是 0/300，因为只有一个手势槽。
- **姿态 × 表情少的 27 对**：都是睡着时要的表情，睡着时眼睛一直闭着。
- **姿态 × 手势少的**：多数是会结束跪坐的手势，另有几个趴着或睡着时做不了（唱歌、屈膝礼、背过身）。
  - 这里说的是当时（跪坐混合体和跪坐、趴下时的实时脸之前）的情况。之后已在 v0.5.0 上重跑，见上面「v0.5.0 重测」：跪坐 × 只占手的 18 个手势都看得见（跪坐混合体，§二.7），跪坐、趴着 × 表情连续 0.5 s 也看得见（实时脸，§二.8）；Coo 不变。另由 `tests/helpers/kneel-arms.js`、`whale-pose.test.js` 和 `scratch/combo3/shots/` 的渲染核对。
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

之后：歪头成了词（`tilt`），对得上的近义说法收成了现有词的名字（见开头）。几轮评测里被略过的词：好奇 ×6、歪头 ×5、兴奋 ×4、挥手 ×3、拍手 ×2，打哈欠、揉眼、打盹、微笑、心疼、站起来、转头、偷偷抬眼、移开视线、眼睛亮、握拳、摆手、轻轻点头、抖抖、被戳、盖被子各 1 次；现在只剩转头（说的是转身回来或转向你，转身是整个人转过去）、被戳、盖被子还会被略过；拍手后来成了新画的手势 `clap`（四位娘和大肥鱼），只有 Coo 还会略过。

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

### 第三轮：新词和「安慰」（Claude 娘）

v0.5.0 之后加了二十多个词，再测一次 bot 用不用。

| 模型 | 回复数 | 用到的新词 | 新词次数 | 温柔 |
|---|---|---|---|---|
| DeepSeek v4.1 flash | 150 | 16 种 | 154 次（歪头 69、眨眨眼 16、拍手 13、低头 11、撒花 10…） | 146 次 |
| Kimi k3 | 100 | 12 种 | 55 次（歪头 17、撒花 11…） | 53 次 |

「温柔」一个词既当安慰又当微笑，所以用得最多。把它拆成「温柔」（微笑）和新的「安慰」（看着对方、眉头微蹙的软笑）后，同样的 DeepSeek 评测（每边 150 条，各有 6–7 条因为网络中断失败）：

| 指标 | 拆分前 | 拆分后 |
|---|---|---|
| 温柔 | 110 次（88 条回复） | 84 次（74 条回复） |
| 安慰 | — | 28 次（24 条回复） |
| 用了 `+` 组合的回复 | 96.5% | 97.9% |
| 用了组合表情的回复 | 32.6% | 52.4%（安慰本身是组合表情） |

Qwen 这次没测成：评测用的 OpenRouter 工作区开了「零数据保留」限制，Qwen 的服务商都不满足。

### 第四轮：再收一收「温柔」（DeepSeek，Claude 娘，每边 150 条）

分出「安慰」后，bot 改掉的多是开头的脸，收尾还是常落在「温柔」上，而且常写成「温柔+奉茶」，其实奉茶本来就带温柔的笑。试了两种只改文字的写法：A 把「温柔」的说明收窄到对方好起来、道谢时欣慰地笑，在「奉茶」的说明里写明它自带温柔的笑，把「温柔」挪到那组的最后；B 在 A 的基础上，提示词再加一句「收尾别总是温柔」，并把例子改成用撒娇收尾。采用 A。

| 指标 | 现状 | A（采用） | B |
|---|---|---|---|
| 写「温柔」 | 60 次 | 37 次 | 48 次 |
| 屏幕上是温柔的脸（含单写奉茶、抱抱） | 66 次 | 53 次 | 66 次 |
| 安慰 | 22 次 | 30 次 | 26 次 |
| 用了 `+` 组合的回复 | 90.7% | 90.0% | 87.3% |
| 用了组合表情的回复 | 57.3% | 62.0% | 54.0% |
| 点头、摇头、叹气、歪头等 | 163 次 | 163 次 | 127 次 |

这一轮的「现状」写温柔的次数（60）比上一轮（84）少，说明每轮之间本来就有不小的波动；三种写法是同时、同样条件下跑的，彼此可以比。
