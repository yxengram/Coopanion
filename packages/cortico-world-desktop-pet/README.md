<!-- Owner: src/definition.ts, src/asr/transcription-api.ts -->

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">
    <img src="assets/banner.svg" alt="cortico-world-desktop-pet" width="806">
  </picture>
</p>

[Cortico](https://github.com/Pal-AI-Lab/Cortico) 的桌宠 World,一个独立的扩展包。
[Coopanion](https://github.com/yxengram/Coopanion) 桌面上的 Coo 就是它。

bot 在屏幕底边有一个小身体,由一个形象包提供(见下文):内置的 Coo(C 形的身体,两只 0 形的眼睛,两条短腿)、内置的大肥鱼、Claude 娘、GPT 娘、Gemini 娘和 Grok 娘,或者装上的其他包。它用气泡说话、用选项提问、
沿屏幕底边走动、做表情和动作;人可以对它说话(FunASR 在本机识别,Windows 上也可用系统自带的识别)、打字、点选项、戳它、摸它、
把它拎起来甩出去,这些都作为事件送回 bot。

## 工具

| 工具 | 作用 | 回执 |
|---|---|---|
| `pet_say(script)` | 冒气泡说话;`【词】` 先做动作再换新气泡,`<词>` 打字到那里时做(没有文字的气泡里的 `<词>` 跟着这个气泡开始);标记里用 `+`(或 `＋`)连起来的词同时做,如 `【坐下+开心+招手】` | 立即返回,报约显示多久、前面排了多久;拆开先后做的组、合成一张脸的两个表情(谁给眼、谁给嘴,或合成了哪个词)和略过的词写在 `[执行参数]` 里 |
| `pet_ask(question, options, allowOwnAnswer)` | 提问气泡,最多 3 个选项,默认再加一格自己写 | 立即返回;回答以 `[回答]` 事件送达 |
| `pet_walk_to(to, run)` | 走(跑)到桌宠所在屏幕横向 0–1 处,或 `left` `center` `right`;`cursor` 走到鼠标旁边(差半个站立身宽加 8 像素,即舞台边距,缩放 1 时约 52 像素,不站到它底下),`away` 背着鼠标走开三分之一屏宽(鼠标就在她身上时往空处多的一边) | `cursor`/`away` 先经 `pointer?` 问页面鼠标此刻在哪(页面 1 秒内没答:`cursor` 照旧让页面走到它上次看到鼠标的地方,`away` 失败;鼠标在程序坞、菜单栏或任务栏上也算在这块屏幕上,按它的横坐标走;在别的屏幕上时失败,不再走到屏幕中间),回执先说鼠标在屏幕横向哪里,再说停在哪、在鼠标哪边;已在鼠标旁边、或背着鼠标那边已到屏幕边时不走并说明。走到或被打断才返回,最多等「距离 ÷ 最高速度(走 78、跑 250 像素/秒)× 1.25 + 10 秒」,不少于 30 秒,到时页面还报着在走就再等,最多两倍;身体正忙(被拎着、在空中、在翻滚)起不了步时马上返回;`interruptible`,收到 interrupt 时停在原地并写明位置 |
| `pet_act(actions)` | 不说话,依次做一串表情或动作;一项里用 `+` 连起来的词同时做,如 `"点头+招手"` | 立即返回;前面的气泡还在排队或打字时,这串词等最后一个气泡的字打完再做(接着来的 `pet_walk_to`/`pet_walk` 先等这些词做完再起步,最多 6 秒;正在走路时照旧马上做);拆组、合成和略过的词同 `pet_say`;词表里标着保持的词(Coo、大肥鱼、Claude 娘、GPT 娘、Gemini 娘和 Grok 娘的 `sit` `sleep` `lie` `kneel`,组里的也算)会写明保持多久:坐、趴、睡做手势和换表情时不变,换姿势或走、跳这类全身动作才结束;跪坐换表情、点头、摇头、叹气、歪头、低头、眨眨眼、抬头、喘气、闭眼、打喷嚏时不变,做下一个手上或全身的动作就变回普通坐着;跪坐带 `keepsArms` 的(大肥鱼和四位娘)只占「手」的手势和唱歌也不变,跪着做,做全身的动作或「手,要站着或坐着不动」那组别的动作才变回普通坐着 |
| `pet_set(…)` | 改自己的外观和习惯,见「自己调整」 | 自己能改的立即返回;要问的等对方回答 |
| `pet_quiet(minutes, sound, roam)` | 临时安静:默认关音效、站着不动,到点恢复,设置不变 | 立即返回 |

表情和动作的词表是当前形象包的 `vocab`(解析在 `src/script.ts`),词的 id 与各语言的名字都认(内置形象的名字里也收了 bot 常写的近义说法,如挥手、微笑、好奇;一个名字在一个形象里只指一个词);环境提示词 `src/ENV_PROMPT.md` 的 `{{pet.vocab}}`(`vocabTable`)把它渲染成一词一行的清单,换了形象就跟着换:开头一句例子(只用这个词表里有的词,内置形象的例子带组合脸、头部动作和手势,别的包退回开心、招手、眨眼),表情按心情分组(开心、调皮得意、喜欢害羞、难过、生气嫌弃、惊讶紧张、其他;包自带的表情归「其他」),动作按部位分组。
动作的分组按 `CHANNELS`:头、尾巴耳朵翅膀(各算一个部位,只列形象有词的,如「尾巴、耳朵(各算一个部位)」)、手、要站着或坐着不动的手、身;身的动作还占手、头或表情的(跪坐、趴、扑腾、屈膝礼、跺脚、翻滚、睡觉、晕,包自带的动作)在名字后写明「也占…」;跪坐带 `keepsArms` 时只占身和站姿(`channelsOf`),不占手,和唱歌也能同组(`clashes`:kit 跪着也唱歌)。一组同时做的词里表情、头、手、身各最多一个,尾巴、耳朵、翅膀也各最多一个(摇尾巴能和点头、招手、竖耳朵同组;睡觉和石化也占它们);占同一部位的、或一起做不出来的(比如走着唱歌、趴着时招手、晕着换表情)从冲突的那个词起拆成下一组,按先后做,回执说明。
例外是形象 `pairs` 里列出的两个表情:写在同一组时不拆开,合成一张脸——合成对按 `pairs` 写的方向发出,眼那张脸在前、嘴那张在后(先写哪个都一样),别名对改成那个词;回执说明谁给了眼、谁给了嘴(或合成了哪个词),环境提示词把别名对写在那个词后面(`=甲+乙`),在表情后面列出合成对并举一例;没有 `pairs` 的形象没有这些文字。
同一组里的表情至少持续到同组手势自带的脸结束(唱歌、看书、喝茶、跳舞),不会在手势末尾换回手势自己的脸。
名字本身带 `+` 的词先整个查,单独用没问题,但不能做组里的一员。发给页面的仍是字符串数组,一组是 id 用 `+` 连起来(`sit+wave+happy`);
页面把一组交给身体的 `doAll(words)`(kit 在同一帧里做完;kit 的 plus 身体把组里收到的前两个表情合成一张脸,第一个的眼、第二个的嘴),没有 `doAll` 的身体逐个 `do`,被拒的重试最多 2 秒;一组占着队列直到最长的那个词做完。
词表里没有的词,`pet_say` 和 `pet_act` 的回执会写明略过了哪些;`world.dialog` 的 `actions` 里没有的词记一条警告,也列在返回值的 `dropped` 里,同样可以写组。
表情、动作怎样调用、哪些能同时出现,详见主仓库的 `docs/notes/expressions-and-actions.md`。

### 表情决策模式(decider)

内嵌应用借给 World 一个 OpenRouter 密钥(`DesktopPetAssembly.deciderKey()`,每次用时现读,World 不保存、不写盘、不进日志、事件和回执),
且 `decider.enabled` 开着(默认关,由用户在设置里打开)时,bot 不再看到词表和标记,表情动作交给 OpenRouter 的决策模型挑(`src/decider.ts`)。每次决策发给 OpenRouter 的 state 里有 bot 要说的话、它的 feeling、对方 10 分钟内最后说的一句话、姿势位置和时间;关掉 `decider.enabled` 就不再发。没借密钥、密钥为空或关掉时,一切同上(工具表和环境提示词逐字不变)。

| 工具 | 作用 | 回执 |
|---|---|---|
| `pet_say(text, feeling)` | 一个气泡一句 `feeling`(此刻的心情、想法,怎么写都行);`text` 里习惯性写出的标记去掉、不执行:`【…】` 都去掉,`<…>` 里是词表里的词或只有汉字时去掉(`<小声>`),其他尖括号(`<div>`、`a < b`、`3<5`)照原文显示 | 立刻返回,不等决策:约显示多久、「表情动作照 feeling 自动做」(没有密钥或熔断中时写明这句只说话);决策按调用顺序一个接一个做(`decisionsIdle()` 等它们做完),词挑好后用 `say-acts` 补给气泡,做了哪些词(或失败原因)在下一条桌宠回执或下一批事件的 `[位置]` 行后面跟一行 `[表情动作] 刚才的气泡:「…」词` 说一次 |
| `pet_ask(question, options, allowOwnAnswer, feeling?)` | 同上;给了 `feeling` 就按它决策,挑好就做(`act`) | 已问出;同样不等决策 |
| `pet_feel(feeling)` | 替代 `pet_act`:这一轮不说话时只让身体流露心情;坐下、跪坐、趴下、睡觉也由它挑(说话时姿势写进 `pet_say` 的 feeling) | 等它这次决策(排在前面气泡的决策之后)做完才返回:做了什么 + 持续姿势说明;决策失败时不标 `failed` |
| `pet_walk(direction, pixels, run)` | 替代 `pet_walk_to`:往 `left`/`right` 走多少像素(必须给 `pixels`),从页面最后报的位置算,先截到 `[0, 屏幕宽]`,页面再截到舞台边;`cursor` 朝鼠标走到它旁边(给了 `pixels` 最多走这么多),`away` 背着鼠标走开 `pixels`(不给就三分之一屏宽),同 `pet_walk_to` 的 `cursor`/`away` | 走到才返回(等多久同 `pet_walk_to`):走了多少像素、停在哪;比要求少 8 像素以上就说「走到屏幕边停下了」;`cursor`/`away` 先说鼠标在哪(像素和百分比),再说停在哪、在鼠标哪边多远(没走到旁边时还差多少);`interruptible` |
| `pet_set`、`pet_quiet` | 不变 | 不变 |

决策模式下每个桌宠工具的回执末尾、每批投递的事件里(一个恒挂着的 `piggyback` 延迟事件 `desktop-pet.pose`,投递时现渲染)都有一行
`[位置] 屏幕横向 1190/1920 像素(62%),面朝左,站着;往左还能走约 1155 像素,往右约 695 像素。`。位置来自页面的 `pose` 消息
(`{ t: 'pose', x, w, facing, mode }`:连上时、`mode` 变化、走完、窗口尺寸变化、朝向变化时发);跪坐在页面上也是 `sit`,World 按最后发出的姿势词区分。

一次决策:`buildQuestions` 按部位各出一道选择题(`face`、`head`、`arm`、`body`,形象有词的才出 `tail`、`ears`、`wings`;
分组用 `partOf`,和词表的部位分组同一来源,每个词恰好在一道题里,`walk`、`run` 不出题,气泡里不出 `sleep`,`body` 题去掉她现在的姿势,
被拎着或在空中不出 `body` 题),每题第一个选项是「不动」类;选项名是词的第一个中文名(重名退用 `名字(id)`),说明是 `about`、心情组、别名和「会一直保持」。
`buildState` 写心情、要说的话、对方 10 分钟内最后说的话、姿势与位置、最近 5 次做过的、时间(≤1500 字)。
`pickGroup`:每题按概率取胜者,「不动」胜出或低于门槛(表情 0.20,头和手 0.30,身 0.55,趴下和睡觉 0.70,尾巴耳朵翅膀 0.50;`pet_feel` 是 bot 自己要的身体动作,坐下、跪坐、趴下、睡觉只要 0.50)就不动;
同一题连着两次是同一个词而第二名够近就换第二名;除表情外最多动 2 个部位;表情第二名不低于 0.08、也不低于胜者的 0.2 倍,且在形象的 `pairs` 里,就组成表情对;
最后按概率从高到低用 `clashes` 去掉冲突的,所以拼出的一组 `parseActions` 不会再拆开;例外是 `body` 题胜出的是会一直保持的姿势(睡觉、趴下、坐下、跪坐)时:和它冲突的表情排在它后面(概率按不超过姿势算),姿势留下就换成表情题的第二名(是表情、过门槛、不冲突、不是刚被重复规则换掉的那个时),否则不做表情(气泡里 `石化` 和坐下、趴下、跪坐冲突,也让给姿势);`pet_feel` 上姿势排在所有部位前面,和它冲突的头、手等也都让开(说「去睡觉」时 `犯困`、`低头` 不再挤掉 `睡觉`);姿势最后没留下(被别的部位或部位上限挡掉)时,整组照概率重排,表情不白让。
决策模型返回错误时,回执写状态码和精简过的原因(OpenRouter「没有符合隐私和防护设置的服务端」写成一句,带上它列的原因,如 `ZDR violation (guardrail)`)。
页面:`say` 带 `acts: 'pending'` 和 `holdMs`(1100 ms)时,轮到这个气泡最多等这么久拿到词;词按气泡 id 用 `say-acts` 发来,排队中的气泡把它当第一拍的词,已在打字的立刻做(`web/acts.js` 的 `attachSayActs`、`sayHeld`)。

失败:单次失败、超时、回答看不懂或熔断中,不换模式,这一句改由 World 按 feeling 里的词自己挑(`localPick`):feeling 里直接写出的表情名或头部动作名(任一名字或 id,整词匹配,前面紧跟「不、没、别…」的不算(「特别、告别…」的别不算否定),后面紧跟「不起来、不了…」的不算,一个字的名字不算,最长的优先),最多一个表情加一个头部动作,只挑当前身体有的词(页面报过不认得的不挑),不挑姿势、手势、全身动作、`平静` 和 `石化`,睡着、摔晕时不挑;没写出词而 feeling 明显是同意(同意、没错、没问题…)时点头;否则不做。回执写成 `[表情动作] 刚才的气泡:「…」点头(决策模型超时,按心情里的词挑的)。`,决策记录 `ok: false` 并带 `fallback: { by: 'names' | 'agree' | 'none', matched }`,做了的词进下一次决策 state 的「最近做过」;没有密钥或已停止时不兜底。连续 3 次失败 60 秒内不再调用(熔断,日志只警告一次;熔断中气泡不等,兜底的词直接作为气泡开头的词);密钥被删后 5 秒内切回旧模式。
模式切换时调 `onModeChange(mode)`,应用据此重建前缀(Coopanion 调 `reloadSystemPrefix`);重建前模型调旧工具名仍照旧执行。
控制台:「表情决策」灯、配置组 `world:desktop-pet:decider`(开关、模型、超时)、`pet.state` 里的 `decider`(只有有没有密钥,没有密钥本身)、`pet.deciders` 列出 OpenRouter 上的决策模型(`GET https://openrouter.ai/api/v1/models?output_modalities=decisions`,公开、不带密钥;World 缓存 6 小时;返回 `{ models: [{ id, name?, promptPerM, context }], source: 'live' | 'cache' | 'fallback', minContext }`,上下文小于 `max(DECIDER_MIN_CONTEXT = 8192, 本次运行最大请求 × 1.25)` 的不列出;连不上时给上次的列表,再不行给 `DECIDER_FALLBACK_MODELS` 里已知的几个 id(不含 `:free` 模型:开着零数据保留时它们没有可用的服务端,免费服务端也可能记录提示词),价格和上下文为 null;`deciderModelsUrl` 可指到本地假端点)。
决策用量以 `桌宠·表情决策` 记入 `reportUsage`;`onDecision(rec)` 给评测和测试每次决策的记录(不含密钥)。
部署里改过环境提示词时(Cortico 只按 World id 存一份覆盖文件,两种模式都会读它),决策模式下记一条警告,控制台提示去「提示词」页还原。

## 事件

| `type` | 正文 | 投递 |
|---|---|---|
| `desktop-pet.speech` | `[语音] 伙伴:…` | flush |
| `desktop-pet.message` | `[打字] 伙伴:…`(悬停按钮;`worlds.desktop-pet.doubleClickChat` 打开时也可双击,`typeKey.enabled` 打开时也可按打字键;打字框和对话页都可附图片) | preempt |
| `desktop-pet.answer` | `[回答] 伙伴回答「问题」:选了第 2 项「…」` / 自己写的 / 关掉没答 | flush,关掉没答为 debounce |
| `desktop-pet.touch` | `[互动] 伙伴戳了你 3 下` / 摸了摸 / 拎起来甩了出去 / 摔晕 | `worlds.desktop-pet.touch.wakeOn` 选中的种类 debounce,其余 piggyback |
| `desktop-pet.figure` | `[形象] 你现在的样子:…`(对方换了形象或打扮;bot 用 `pet_set` 自己换的不报) / `[形象] …没能显示出来(原因),你现在是 Coo 的样子` | 换装 debounce,显示失败 flush |

每条事件的正文前是对方那边的本地时间 `[HH:MM]`;一次运行的第一条、换了日期后的第一条带日期和星期 `[MM-DD 周X HH:MM]`。

同一种互动 2.5 秒内连着来,并成一条带次数的事件。`wakeOn` 默认 `poke`:只有戳唤醒,摸头、放下和甩出跟着下一批送;鼠标划过桌宠也算摸头,拖开挡路的桌宠也算放下。一条互动按 debounce 送出后,到 bot 下一次结束一轮前,其余互动都按 piggyback 送。「伙伴」取自 `worlds.desktop-pet.user`。

## 桌宠窗口

World 在 `127.0.0.1:7797`(被占向上顺延)起一个页面服务:`/pet` 是桌宠本身,`/dress` 是装扮页。
浏览器的写请求(GET、HEAD 以外的请求)和 WebSocket 只接受本服务自己的 HTTP 源(含端口,`http://127.0.0.1:<端口>` 或 `http://localhost:<端口>`),
别的源答 421;不带 Origin 的本机客户端可以连(引导在 Node 里 `POST /api/skin`)。读请求另收本机别的端口(控制台嵌桌宠页)和形象沙箱的不透明源。
窗口进程启动时拿到的地址是 `PetServer.windowUrl`(`/pet#key=<随机凭据>`),桌宠窗口连 socket 时带上它(`host=window&key=…`),
不带或不对答 403;`petUrl`、`petState().url` 和面板上的链接都不含凭据。窗口的连接被替换后会重新连,被替换的连接后来发的消息不再算数;
窗口在线时,浏览器里的桌宠页只接收外观和偏好更新,仍可发送文字、修改偏好和使用运行控制。
桌宠内置六个形象,在装扮页最上面一行选,存在配置 `skin.figure` 里:`coo` 是 Coo,`whale` 是 DeepSeek 大肥鱼
(鲸鱼女仆,`web/whale`,用 `web/kit/rig.js` 画的 Live2D 式分件模型,八套配色存在 `skin.scheme`,见 [examples/whale](examples/whale/README.md)),
`claude-chan` 是 Claude 娘(正面站着的 Q 版少女,`web/claude-chan`,同样是 rig 画的分件模型,一套配色 `original`;
词表和大肥鱼差不多(大肥鱼和四位娘比 Coo 多低头、眨眨眼、凑近、后仰、晃来晃去、跺脚六个动作和抬头、喘气、闭眼、打喷嚏四个头部动作,和拍手、摊手、抱头、举手、点赞、嘘、擦汗七个手势词,这七个各有新画,拍手是合掌和分开两张画一帧切换,还有托腮、加油、记笔记、对手指四个手势词,和抹眼泪、双手捂脸、摸摸头三个手势词,后两个有新画,抹眼泪用现成的拳头图):少了 `spout` 和大肥鱼的摇尾巴,托腮由手指抵着下巴的画来做,多一个哎呀(后缩时双手挡在嘴前的那张画单独成词,四位娘都有)),`gpt-chan` 是 GPT 娘(正面站着的白色小龙娘,`web/gpt-chan`,龙翼和尾巴跟着心情动,
一套配色 `original`,词表比 Claude 娘多摇尾巴、扇翅膀),`gemini-chan` 是 Gemini 娘(正面站着的猫娘,`web/gemini-chan`,
猫耳和尾巴跟着心情动,一套配色 `original`,词表比 Claude 娘多摇尾巴、炸毛、抖耳朵、竖耳朵、耳朵耷拉),`grok-chan` 是 Grok 娘
(正面站着的吸血鬼小公主,`web/grok-chan`,蝴蝶结后面的小蝙蝠翅膀和双马尾跟着心情动,一套配色 `original`,词表比 Claude 娘多扇翅膀)。
选大肥鱼时装扮页的配色和配件换成她的八套配色;桌宠页第一次用到哪个形象时才加载它的贴图,只加载选中的那套。
桌宠窗口是一个 Electron 进程(`host/electron-main.cjs`):透明、无边框、置顶,盖住一块显示器的工作区
(启动时是主显示器)。桌宠被拎着拖到另一块显示器上时,窗口当场挪到那块显示器,拖动中桌宠一直跟着光标,松手就在那块显示器上落下;
走路只在当前这块显示器上。窗口所在的显示器被拔掉时回到主显示器。`pet_walk_to` 的 0–1 和事件里的横向位置都按当前这块显示器算。
鼠标只在身体、气泡、右键菜单和悬停按钮上时才接收点击,其余位置点击穿透。托盘图标可以显示、隐藏、关闭它。
鼠标停在桌宠身上时,身旁出现两个按钮:打字说话;语音输入开关(点一下开关 `asr.enabled`,
正在听时长按半秒把听到的这句话立刻送出,不等停顿;按 toggle 方式开着的说话键同时关上)。黑白模式在右键菜单里切换。窗口打开时桌宠从屏幕顶上掉到底边。
右键菜单顶上一行是 bot 的头像(部署目录的 `avatar.png`,没有时画桌宠自己)和名字;内嵌应用借出运行控制时,
旁边还有暂停/继续、退出按钮,最下面多一行「打开设置」。点退出先在这一行问一次,菜单宽度不变。
「行为模式」展开二级菜单选常走动、多待着、不乱动。
提问气泡的选项出来时,窗口把键盘从前台窗口那里接过来(Windows 不让后台进程直接抢前台,
所以借 `AttachThreadInput` 与前台线程共享一次输入),按 1–9(主键盘或小键盘)选对应的选项;
答完、关掉或被新问题替换时还给原来那个窗口,期间人点了别处就不还。
World 进程退出后窗口在 2 秒内自己关掉。
窗口是否接收鼠标由两处判定:页面的 `pointermove`,和窗口进程每 100 毫秒读一次的光标位置(光标在窗口所在屏幕上、但不在窗口里时,比如程序坞或任务栏上,这次读数还附上它的横坐标,供朝鼠标走)。每次切换、以及
`pointermove` 的 `pointerType` 变化时,页面往运行日志写一行 `[pointer] {…}`(两处各自最后看到的位置、
是否碰到身体或界面、距今多少毫秒),最多每秒一行,中间略过的条数记在下一行。
桌宠身后的屏幕颜色和身体相近时(比如浅色身体停在白色窗口前),身体背后会亮起一圈浅灰色的柔光:
Windows 上每 0.8 秒用 GDI 取一小块身体周围的屏幕像素来比,其他系统读屏代价大,光圈一直亮着。

用哪个 Electron,依次是:

1. 环境变量 `CORTICO_DESKTOP_PET_HOST`:内嵌应用给的 JSON 数组命令,末尾追加 `--pet-url=<url>`。
   应用在自己的主进程里调 `require('cortico-world-desktop-pet/host/electron-main.cjs').runPetHost({ url, parentPid })`;
2. 配置 `worlds.desktop-pet.window.electronFile`;
3. 「桌宠」面板安装的托管运行时(Electron 44.4.4,装到 `<运行时根>/electron/44.4.4/`);
4. 本包能解析到的 `electron` 包。

没有窗口时,在浏览器里打开 `/pet` 也能看到桌宠;窗口连着时浏览器标签页只旁观,不接收指令,
打字和偏好改动照样送到 World。World 页的「桌宠窗口」灯只看窗口(`PetServer.petInWindow`,`petState().inWindow`):浏览器页面顶替窗口时灯不亮,
说明里写一句浏览器页面已连接;窗口里的页面连 Coo 都画不出来(比如拿不到 WebGL,页面报 `figure` 的 `coo` 失败)时灯显示出错和原因,
新页面连上或任何形象报成功时清掉。`petState().connected` 的含义不变(引导、开始页、托盘按它等桌宠页面)。

黑白模式存在 `worlds.desktop-pet.theme`,默认 `dark`(浅色身体、深色气泡)。桌宠窗口、`/pet`、`/dress` 和控制台面板里的
预览都按这一项画,与系统和控制台的深浅色设置无关。

## 语音输入

桌宠窗口里的页面用麦克风收音,16 kHz 单声道 PCM 经 WebSocket 送到 World,按能量门限切句
(`src/asr/segmenter.ts`),交给识别引擎,繁体转简体、挡掉已知幻觉后作为 `desktop-pet.speech` 投递。
说话时桌宠歪头倾听,头顶的灰底气泡里边说边显示听到的字,还没定下来的部分是浅灰的;识别完成后这个气泡留在桌宠头顶(见下面「人说的话」)。
按键收音(`hold`、`toggle`)时气泡里有「取消」按钮:桌宠页发 `cancel`,World 丢掉这次收音手上的音频、转写队列和已识别的文字,在途的转写落地后也丢掉,发 `listen` 的 `none`,不投递事件;`toggle` 下同时关掉收音。

人说的话留在桌宠头顶(`web/pet-app.js` 的 lines,上游 #279):打字框发出的、识别完成的语音、对话页发来的消息各成一个灰底气泡(底色同对话页用户的气泡,`--said-bg`,不画边框和尾巴),
最新的在最下面,居中叠在桌宠的气泡上方,没有气泡时在头顶;不看朝向,也没有连到桌宠的小圆点。识别完成的语音前面画话筒,对话页来的画双向箭头,带图片的写张数。
「输入气泡」开关 `worlds.desktop-pet.saidBubbles`(默认开,即改即生效)关掉后,打字框和对话页发的不留气泡,已留着的立即淡出;语音的气泡识别时照常显示,识别完立即淡出。
一条话由它之后桌宠开始的第一句说话或提问回答:回答的气泡还在时,或者还没回答而 bot 在想(`thinking`)、有说话在排队时,这条和更早的都不淡出;
回答的气泡关掉 1 秒后淡出,没有回答的 8 秒后淡出。最多 3 条、合计 6 行,超出时最早的先淡出,即使还在等回答。点一下关掉一条,识别中的那条用「取消」。

打字框(`openInput`)是多行的 textarea,随文字长高到六行后滚动;Enter 发送,Shift+Enter 换行,输入法选字时的 Enter(`isComposing` 或 keyCode 229)不发送。
打字框里可以粘贴图片(上游 #430):按对话页的规则处理,只缩不放,长边不超过 2048;缩放后超过 6 MB 改用 JPEG,仍超过就不收并在框下提示。框里最多 4 张,一行缩略图;
粘贴内容里有图片时只收图片。模型看不到图片时(`prefs.bot.imagesSeen` 为 false)框下提示 bot 只会知道发了几张。图片随 `text` 的 `images` 送给 World,
World 用对话页同一套检查(张数、格式、单张 8 MB,`parseChatImages`),不合格的整条丢弃并写日志;合格的作为 blobs 随 `[打字]` 事件投递,事件正文不变(只有图片时正文为空)。
「在对话页继续写」(`expand`)把文字和图片一起带过去,World 留着草稿(`draftImages`)给下一个打开的对话页,对话页把文字和图片放回输入框。

打字键 `typeKey`(上游 #361)默认关(「习惯」页的「用打字键打开打字框」,经 pet 面板的 `setTypeKey` 修改;没有这一节的旧配置读作默认)。
打开后在哪个窗口里按下 `typeKey.hotkey` 都打开桌宠的打字框,和悬停按钮打开的是同一个:World 给桌宠页发 `type`,桌宠隐藏时不发;框已经开着时再按一下只把键盘拿回来。
写法和说话键相同,默认 `LeftCtrl*2`(快速按两下左 Ctrl,Mac 上是左 Control),连按时最后一下按下就算;「习惯」页录键与选按法(按一下、双击)的做法同「语音输入」面板(`src/webui/key-capture.ts`)。
Windows 上桌宠窗口从前台窗口拿走键盘,打字框关掉后还回去;Mac 上打开打字框时激活应用。读键的方式和读不到时的原因同说话键(原因里说的是打字键),写在「习惯」页这一行下面。

桌宠气泡和提问里写出的 http(s) 网址(`web/ui.js` 的 `urlRanges` / `linked`,上游 #297)打完字后变成链接,链接文字就是它打开的地址:
只认写出来的裸网址,到空格或非 ASCII 字符为止,句末标点不算,网址自己开的括号留着;`[文字](网址)` 不渲染。链接 `target=_blank`,
桌宠窗口里由宿主的 `guard` 交给系统浏览器(只放行 http(s))。对话页用同一个 `linked`。
指针停在 Coo 的气泡上时(上游 #430,`pointedAt`),说话的气泡和引导里不需要回答的一步都停住倒计时,移开后剩下的时间接着走完;带链接的也一样。停住期间排队的下一句等着。

气泡尺寸 `window.bubbleSize` 缩放所有气泡的宽度、留白、圆角、尾巴和离头顶的距离,边框粗细不变;
字体尺寸 `window.fontSize` 缩放气泡里的字和同一行的小图标,气泡的宽度不变。两项都是 0.8–1.6 倍、每档 0.05,默认 1(页面这时不设 CSS 变量,样子和以前逐项相同),不随桌宠的大小变。
气泡速度 `window.bubbleSpeed`(上游 #248)是 0.5–2 倍、每档 0.05,默认 1:Coo 的气泡每秒打 20 乘以它个字,打完后的停留时间除以它(动作前的 0.45 秒不变),
`pet_say` 回执报的显示时长(`estimateSeconds`)也按它算;World 把范围外或不是数的值当成范围内最近的一档(不是数时为 1)再发给页面,默认 1 时回执和以前一样。
它们只是设置(「习惯」页的「气泡尺寸」「字体尺寸」「气泡速度」),不在 `pet_set` 里,环境提示词也不提。

说话声(上游 #263、#265)`worlds.desktop-pet.speech.*`(音效组,默认关)开启后,气泡逐字念成音节库 `web/speech/` 里的短音节,代替「说话」类的叽咕声(叽咕声的音色和音高由形象包的 `voice` 和 `talk` 音效定,见「形象包」;说话声开着时不看它们),
随音效总开关和「说话」类开关,桌宠隐藏时也不出声(隐藏或关掉这两个开关时,已排好的音节当场停下,能听见后接着念这个气泡剩下的字);所有形象用同一个音节库(上游也只有这一个)。
文字怎么念由 World 定(`src/speech`,经 `POST /api/speech`):各语言按读音规则和词典转成国际音标,再取最接近的音节——汉字按普通话(`data/zh.json`),
一句话里有假名时按日语(词按常用漢字表付表的熟字训和 IPADIC,单个汉字按 Unihan),拉丁字母在英文界面和中文界面都按英语(先查 CMU 发音词典 `data/en.tsv.gz`),
韩文、西里尔字母和数字也各有规则。词典在第一次用到时才载入。
音高 `speech.pitch` 为 low/mid/high(300/400/500 Hz)或 custom(`speech.pitchHz`,200–700),语速 `speech.speed` 为每秒最多 10/13/16 个音节或 custom(`speech.unitsPerSecond`,6–20)。
开启时气泡按标点分别停顿,字母文字打得更快,`pet_say` 回执报的显示时长也按这些步长算(`estimateSeconds` 的第三个参数);关着时回执和以前逐字节相同。

声道(上游 #435):桌宠页的音效和说话声都经 `web/sound.js` 的主音量,后面接一个 StereoPannerNode,按 Coo 在它那块显示器工作区里的横向位置(`screenX - screen.availLeft + x`)
从左 −1 到右 1 摆放,`setPan` 经 `setTargetAtTime` 平滑过去,变化不到 0.01 不写。和上游不同:主音量先混成单声道,声像器后再乘 √2,
所以正中间和没有声像器时一样响(上游的等功率声像器在正中间左右各只有 0.71,整体轻 3 dB);形象包自带的立体声音频也混成单声道再摆放。
给定的 AudioContext(`createSfx({ ctx })`,离线渲染音效)不接声像器;没有 `createStereoPanner` 的环境直连,声音居中。
它们只是设置(「习惯」页的「说话声」),不在 `pet_set` 里,环境提示词也不提。音节库由 `scripts/speech-bank/build.py`(要联网用 Edge 的朗读服务)生成,本仓库直接用上游生成好的文件。

识别引擎存在 `asr.engine`:

| `asr.engine` | 引擎 |
|---|---|
| `funasr`(默认) | FunASR 的 SenseVoiceSmall(int8),经 sherpa-onnx 的 Node 插件在 World 进程里识别;Windows x64、macOS arm64 / x64、Linux x64 都有预编译包 |
| `system` | Windows 自带的语音识别(SAPI 听写,System.Speech),不用下载,准确度低一些;其他系统上按 `funasr` 处理 |
| `api` | OpenAI 兼容的转写接口(上游 #380),`asr.api` 里填地址和模型(`src/asr/transcription-api.ts`);每个系统上都可用 |

旧版本写下的 `auto`、`whisper` 都按 `funasr` 处理。

关闭 `asr.enabled` 会停止正在运行的识别引擎:释放已载入的 FunASR 模型(进程带 `--expose-gc` 时当场做一次完整回收),或结束系统识别的 PowerShell 进程;再次开启时重新载入。
停止期间来的启动等停止做完再开始,停止晚于启动时启动作废,所以快速关了又开不会同时留着两份模型或两个识别进程。
「语音输入」面板的「启动」在关着时不可用;「停止」停的是正在运行的那个引擎,哪怕配置里刚换了引擎。

`funasr`:`sherpa-onnx-node` 是本包的依赖,随包安装(Windows 约 24 MB,macOS 约 35 MB),不在运行时下载。
只有模型要下载:「语音输入」面板(或应用的新手引导)点一下「下载」,
`model.int8.onnx`(228 MB)和 `tokens.txt` 依次从 ModelScope 取(国内可直接访问),取不到再从 Hugging Face 取,
逐个按固定的 SHA-256 校验,放到 `<模型根>/desktop-pet/sensevoice-small-int8-2024-07-17/`。
SenseVoice 一次识别整句;说话过程中每 0.5 秒把这句到目前为止的音频重新识别一遍,拿来边说边显示,
一句收尾后再识别一次定稿(3 秒的一句在两个线程上约 0.1 秒)。`asr.language` 取 zh、en、ja、ko、yue 或 auto,
`asr.threads` 是一次识别用的线程数,0 表示 2。

`system` 起一个常驻的 PowerShell 进程(`src/asr/system-sapi.ps1`,经 `-EncodedCommand` 传入,不受执行策略影响),
一句话边说边送:切句器判定开口后(连同门限之前那几帧)每帧一行 base64 PCM 送进去,
进程约每 0.4 秒回报一次这句到目前为止的文字(`listen` 的 `partial` 带上 `interim`),一句收尾后几十毫秒内定稿,不必再整句识别一遍。
按 `asr.language` 挑系统里装着的识别器。中文 Windows 自带 zh-CN 识别器;
没有时面板写明去 Windows 设置 → 时间和语言 → 语言里装「语音识别」。

`api` 一句收尾后整句发出(没有边说边显示):16 kHz、单声道、16 位的 WAV,经 Core 的全局 `fetch`(系统代理照常生效)
`POST {asr.api.baseUrl}/audio/transcriptions`,multipart 字段 `file`、`model`(`asr.api.model`)、`response_format=json`,
`asr.language` 是两个字母的代码时再带 `language`(`auto` 和 `yue` 不带);回应里的 `text` 就是这一句,照常经过幻觉过滤和繁转简。
API Key 不进 config:「语音输入」面板经 `storeSecret` 存进部署 `.env`(仅本人可读)的 `DESKTOP_PET_ASR_API_KEY`(`DESKTOP_PET_SECRETS.asrApiKey`),
每次请求按 `secret()` 现读,没存时不带 `Authorization`;面板只看得到存没存,含空白的 Key 在存之前就被拒绝。
远程地址只收 https,本机和局域网可以用 http,规则与模型服务的相同(provider-coo 的 `src/address.ts` `plainRemote`,本包依赖它)。
地址不能用、没填模型、请求失败(HTTP 状态和回应里的 `error.message`,不是这个格式时取回应正文的开头 300 字;`asr.timeoutMs` 内没回应;连不上)时,
引擎停在出错,原因显示在面板的「识别服务」一行和桌宠的麦克风按钮上,失败的那句在识别结果里划掉;
之后不再发请求,直到点「启动」、改了地址或模型,或在面板里存了新的 API Key。引擎因失败停下时麦克风随之关上,一句收尾要等的那段停顿不会再来:正在听的那句丢掉,开着的说话键(`toggle`)或按着的(`hold`)随之关掉,之前已识别的照常发出,没有就收起倾听气泡(`endDeafEpisode`,上游没有这一步,倾听气泡会一直挂着)。改了应用语言也会重新启动没在运行的引擎(和另外两个引擎一样),所以出错后换语言也会再试。
早于这一项的配置没有 `asr.api`,按空读。

下载都先写 `.partial`,完整后才改名到位。

收音方式存在 `asr.mic`,在「语音输入」面板里改:

| `asr.mic.mode` | 行为 |
|---|---|
| `hold`(默认) | 按住说话键时收音,整段都算话,松开即一句结束;连按的键是最后一下按住时收音 |
| `toggle` | 按一下说话键开始,再按一下停;中间按停顿切句 |
| `always` | 一直收音,按停顿切句 |

说话键 `asr.mic.hotkey` 用 `+` 连写组合键(`Ctrl+Space`、`F8`、`Mouse4`),结尾加 `*2` / `*3` 表示连按:前面几下是快速的一按一放(每下不超过 300 ms,两下之间隔不超过 400 ms),最后一下按住才算按下。
默认 `LeftAlt*2`:快速按一下左 Alt(Mac 上是左 Option),紧接着按住说话。按完快速的那一下,World 给桌宠页发 `listen` 的 `ready`,Coo 先抬头看一眼,按住时立刻进入聆听。
在哪个窗口里按都算;「语音输入」面板的说话键按钮录下组合键,旁边的下拉框选「双击再按住」(`*2`)或「直接按住」(不带 `*`),录键时保留当前的按法。桌宠麦克风按钮的角标显示说话键的简写(`Alt×2`、`F8`、`M4`),一直收音时显示 `AUTO`。
Windows 上经 koffi 轮询 Win32 `GetAsyncKeyState` 读取;macOS 上轮询 CoreGraphics 的 `CGEventSourceKeyState`,要在「系统设置 → 隐私与安全性 → 输入监控」里允许,第一次会弹出询问;Linux 上轮询 X11 的 `XQueryKeymap`(Wayland 下经 XWayland,只在 X11 窗口有键盘焦点时读得到;鼠标侧键读不到)。读不到时不识别说话(收音方式不会改成 `always`),面板和引导上写明原因。
`asr.mic.deviceId` 选麦克风,留空用系统默认;设备列表由桌宠页上报(`web/mic.js`),设备名称需要麦克风权限:开麦成功后报,
打开失败(权限被拒绝除外)时也报,默认设备打不开时可以换一个再试。
系统默认输入设备改变时(`devicechange` 后默认设备的 deviceId、groupId 或名称变了),桌宠页关闭旧音频流并重新收音;指定麦克风时保留所选设备。
音轨结束时重新开麦,打开失败(权限被拒绝除外)时在下一次设备变化后重试。
麦克风在「开启语音输入」总开关开着时一直打开,电平条随时显示音量,说话键只决定哪一段送去识别。
电平条上的门槛线(上游 #435)是 `asr.segment.thresholdDb`:`toggle`、`always` 下显示(`hold` 下门槛不起作用,不显示),可以拖动或聚焦后用方向键每次 ±1 dB,
松开或按键时经 voice 面板的 `setThreshold` 保存(限在 −80–0 dBFS,线本身只到电平条的 −60),下一帧起按新门槛切句;门槛只看响度,和你一样响的别人说话照样会识别。
`hold` 下开启 `asr.mic.openOnPress`(默认关,「语音输入」页的「按住时才打开麦克风」)后,桌宠页只在说话键按住时打开麦克风(World 发 `prefs` 的 `mic`),松开 500 ms 后关掉;倾听气泡等第一帧音频到了才出现。给一打开麦克风就切到通话模式的耳机用,按下到麦克风打开之间说的话收不到。麦克风关掉时电平条回到静音。

## 形象包

桌宠的身体都来自形象包,Coo 也是一个。形象包是一个目录,根上有 `figure.json`;内置的 Coo 在 `web/coo/`、大肥鱼在 `web/whale/`、Claude 娘在 `web/claude-chan/`、GPT 娘在 `web/gpt-chan/`、Gemini 娘在 `web/gemini-chan/`、Grok 娘在 `web/grok-chan/`,
其余的从数据目录的 `figures/<目录>/` 和应用给的 `packRoots` 里找。`skin.figure` 是包的 id,`skin.scheme` 是它的打扮(Coo 的打扮存在 skin 自己的配色和配件字段里)。

包里的代码只在沙箱里跑:桌宠页把它放进 `/figure-frame`,这个页面的 CSP 把它设成不透明源、禁止一切网络连接,
脚本和图片只能从桌宠服务读,和桌宠页之间只有 postMessage(`web/figure-frame.js`、`web/body-host.js`)。
能嵌它的只有桌宠服务自己的页面和应用给的控制台源(`consoleOrigins`,控制台的开始页、装扮页在另一个端口嵌桌宠页);应用没给时,本机任意端口都可以。
视频、音频元素和字体在沙箱里加载不了,`fetch` 也读不到包里的文件;包要出声就在 `figure.json` 的 `sounds` 里声明,由桌宠页播放。
`/packs/<id>/` 下的文件都带 `sandbox allow-scripts; default-src 'none'` 的 CSP(和 `nosniff`),包里的 HTML、SVG 被单独打开时也在不透明源里,连不到网络。
它连不到桌宠的 socket,也没法替对方说话或改设置。身体整个归包管:走、跳、被拎、表情、动作、画法都是包的代码,
桌宠页只转发指针、下指令,读回它报告的位置和发生的事。多数包用 `web/kit/body.js` 这套现成的身体,只自己画。

桌宠页替对方把着几条线(`web/body-host.js`):身体报告的框不超出舞台,也不超过 kit 自己能把身体拉伸到的大小,
只有框里的命中圆接收鼠标;身体背后的柔光亮着时,沙箱只露出框周围一圈(`haloRect`:每边框宽的 60%、上方框高的 80%,至少 80 / 130 像素,下面到地面;
包声明了 `effects.reach` 时每边至少这么远,上游 #434),画得更远的特效看不到(本仓库没有 OBS 画面,`effects.reach` 只管这一圈);
摸、戳、拎这类互动只在页面刚转给它真实指针输入之后才算数,摔晕只在甩出去之后才算;
声音由页面播放,按设置里的类别和总开关静音。

`figure.json`(`manifest: 2`,`api: 2`,读取与校验在 `src/packs.ts`):

| 字段 | 含义 |
|---|---|
| `id` | 小写字母、数字和 `-`,不能和内置包(`coo`、`whale`、`claude-chan`、`gpt-chan`、`gemini-chan`、`grok-chan`)重名;`coopanion-whale`、`coopanion-claude-chan`、`coopanion-gpt-chan`、`coopanion-gemini-chan`、`coopanion-grok-chan`(大肥鱼、Claude 娘、GPT 娘、Gemini 娘和 Grok 娘导出给别的 Coopanion 用的包)在这里当作内置的那个,装了也不列出来,`skin.figure` 写它时显示内置的那条 |
| `name`、`about` | 按语言的名字;`about` 写这个身体长什么样,原样放进 bot 的环境提示词 |
| `entry`、`export` | 模块路径和它导出的工厂函数 |
| `model` | 交给工厂的 JSON(`opts.model`),可省 |
| `axes` | 打扮的维度,每维一组选项(`id`、`name`、`thumb`);装扮页每维一行 |
| `presets` | 维度组合的命名,可带 `accent`、设置窗口配色 `console` 和气泡配色 `bubble`(同下) |
| `vocab` | 这个身体做的全部表情和动作,也就是它在场时 bot 的整张词表:每个词 `id`、`kind`(`expression` / `motion`)、`names`(按语言的名字列表)、`about`(它做这个词的样子)、`seconds`(连着做时最多等多久再做下一个;`walk`、`run` 过了这个时间还在走就等它停下,最多 90 秒),`lasting: true` 表示这是一个保持下去的姿势;`keepsArms: true`(只对 `lasting` 的 `kneel` 有用)表示身体跪着也画得出手势(kit 的 `figure.kneelArms`),手上的动作(和唱歌)不结束跪坐、能和跪坐写在同一组,别的值和别的词上都忽略 |
| `pairs` | 可省。同一组里的两个表情显示成一张脸:`"a+b": "眼+嘴"`(合成:值是这两个 id 按「给眼的在前、给嘴的在后」用 `+` 连起来;键里先后无所谓),或 `"a+b": "<词>"`(别名:显示成词表里另一个表情)。`a`、`b` 是词表里两个不同的表情,都不是 `neutral`、`petrify`;别名的词也不能是这两个之一,也不是 `neutral`、`petrify`;同一对(不管先后)只能写一次;不合格时整个包读不进来。World 只为列出的对合并,其余照旧拆开;合成对按值的方向发给身体(眼在前),kit 的 plus 身体照收到的顺序合成。只列身体真做得出的:不会合成的身体(上游的 kit、没有 `doAll` 的)收到合成对时后一个表情胜出 |
| `sounds` | 包自带的音频:名字 → `{ file, kind, volume }`,文件是包里的 `.ogg` `.mp3` `.wav`,`kind` 是 `move` `touch` `face` `snore` `talk` 之一;`talk` 的声音在气泡打字时逐字轮流响,代替页面合成的叽咕声,同一个字总是同一个声音,随「说话」类开关(上游 #434);不存在的文件在扫描时记一条问题,那个声音不响 |
| `voice` | 可省(上游 #434)。`{ pitch }`:叽咕声的音高倍数,0.5–2,默认 1;有 `talk` 声音时是它们的播放速度。说话声(音节库)开着时按设置里的音高,不看它 |
| `effects` | 可省(上游 #434)。`{ reach }`:特效画到框外多远,以身体所在的 256 单位方格计,0–2,默认 0;柔光亮着时的可见范围按它放大 |
| `bubble` | 可省(上游 #434)。bot 气泡的配色:`{ light, dark }`,各是 `{ fill, text, line }`(底色、字色、边框和尾巴,十六进制颜色),按桌宠的夜间模式取一套;打扮所穿预设(和 `accent` 的取法相同,`web/accent.js`)的 `bubble` 优先。人说的话的气泡不变。缺一套或颜色写错时整项不用 |
| `can` | `{ walk: false }` 表示不会走,`pet_walk_to` 会拒绝 |
| `author`、`license`、`credits`、`thumb`、`version` | 署名与展示 |

`skin.scheme` 是一个预设的 id,或者各维的选项 id 按维度顺序用 `-` 连起来(所以选项 id 里不能有 `-`)。词的名字不能带
`【】<>`、逗号、顿号或空白,也不能长过行内标记能装下的长度,不然脚本里写不出来。

`voice`、`effects`、`bubble` 和 `talk` 声音都可省,值越界或不完整时整项不用(和 `accent` 一样);旧应用跳过这些字段,所以带它们的包在上游 v0.1.17 起都照常装得上。
内置形象一个也不声明,导出给上游的包也没有。`/api/figures` 列出 `voice`、`effects`、`bubble`(没有时为 null)。

工厂按 `factory(base, { model, scheme, kit, loadImage, asset, host })` 调用,返回一个身体;契约写在 `web/figure-frame.js` 开头。
每个身体还收 `set({ status })`(上游 #434):bot 此刻在忙的类别,kit 把它放进交给 `figure.draw` 的 `frame.status`,形象可以自己演出在忙什么。
本仓库的桌宠页没有上游的状态气泡,只知道 bot 在想:想的时候是 `'think'`,否则是 null。
用 kit 的包只要 `kit.createBody(host, { figure, words })`:`figure` 每帧画一次,`words` 是 kit 本身没有的词怎么做。
本仓库的桌宠页在 `talk` 里带上正在说的字(`talk(ch)`),kit 据此换口型;没带字的页面每次换下一种口型。
`examples/whale/README.md` 是写形象包的完整说明,最后一节讲怎样把内置的大肥鱼(`pnpm run export:whale`)、Claude 娘(`pnpm run export:claude`)、GPT 娘(`pnpm run export:gpt`)、Gemini 娘(`pnpm run export:gemini`)和 Grok 娘(`pnpm run export:grok`)导出成别的 Coopanion 能装的包。20 秒内没准备好、或者跑的时候抛错,桌宠换回 Coo,并告诉 bot 现在按 Coo 的词表。

### 导入和卸载

装扮页形象那一行最后一格是「导入」:选一个 zip 或文件夹,或直接拖到页上(`src/pack-import.ts`),带 `figure.json` 的文件夹往下最多找 3 层,
列出来让人勾选,装进数据目录的 `figures/<id>/`。要替换已装的同 id 包时,`POST /api/figures/import/install` 答 409 和 `{ conflicts: [id, …] }`,
不改任何文件、暂存的导入保留;装扮页列出这些包,点「替换」后带同一个 `token` 和 `replace: [id, …]` 再装一次,取消则原样保留。
同名文件夹里若是别的东西(另一个包、坏包),不算冲突也不动它,新包装到 `<id>-2/`。通过检查后 token 就用掉了,同时来的第二次安装会被拒。

`/api/figures` 给每个包标上 `removable`:只有装在 `figures/`(`packDir`)里的包能卸载,内置形象和 `packRoots` 其余目录里的包不能。
装扮页上能卸载的包,悬停或聚焦卡片时右上角出现删除按钮,确认后 `POST /api/figures/remove`(`{ id }`)删掉这个包所在的整个文件夹;
删的是正在用的形象时,装扮页把装扮换回 Coo。内置的、不在 `packDir` 里的或不存在的 id 答 400 和原因,不删任何文件。直接构造 `DesktopPetWorld` 时不给 `packDir`,
装扮页就不显示导入,也没有包能卸载。

## 自己调整

`pet_set` 让 bot 改自己的外观和习惯,分两档(`src/self.ts`):

- 直接改:形象和打扮(Coo 的配色和配件也是打扮)、走动多少、呼噜多久;
- 先在气泡里问对方,同意了才改:音效、大小、黑白模式、悬停按钮、对对方的称呼。

其余设置(语音输入、麦克风、记住位置等)不是 bot 能改的。`worlds.desktop-pet.selfAdjust` 关掉后两档都不能改,`pet_quiet` 也不行。
`pet_quiet` 只在内存里覆盖音效和走动,不写配置;对方在这期间自己改了音效或走动,就按对方的来。

## 给内嵌应用

`desktopPetDefinition({ controls, onCreate, onSkin, packRoots, onBotChange })` 生成定义(`packRoots` 是更多形象包目录,`onBotChange` 在 bot 用 `pet_set` 改了设置之后调用):`controls`(`PetBotControls`)给右键菜单借出暂停、设置、退出,
借了哪个就只画哪个按钮或菜单行(暂停要 `isPaused` 和 `setPaused`,设置要 `openSettings`,退出要 `quit` 与可选的 `quitLabel`);
`onCreate` 拿到 World 实例,应用可以调 `world.confirm(问题, [同意, 不同意])` 弹一个两选项气泡,
结果是 `yes` / `no` / `dismissed` / `timeout`(60 秒没人答) / `unavailable`(没有桌宠页),不会作为事件送给 bot。

应用自己的一问一答(比如首次启动的引导)用 `world.dialog(步骤)`:Coo 在气泡里说一句,下面接一个输入组件,
回答同样只交给调用方。组件有按钮行(可带一个反复演示按法的按键帽)、可试选的卡片(可带图标或一张 `data:image/…` 图,比如服务的标志;选中时 Coo 当场演示对应动作:站着、溜达、跑来跑去)、
文本框(可以是密钥框,带一个外链和一个「以后再说」)、进度条(调用方用 `update({ progress })` 推进,`close()` 收起)。
还没答的一步可以用 `update({ text, marks, input })` 换个说法(比如应用换了语言):同一种组件换上新文字,已经输入的内容、选中的卡片和焦点都保留。
`step` 在气泡顶上画步骤点,`closable` 画一个关闭钮;页面不在时结果是 `{ unavailable: true }`,页面回来后调用方重发即可。
`controls.guide` 借出后,控制台的 `pet.guide` 面板方法会调它,应用借此重放引导。

表情决策模式(见上文「表情决策模式」)要应用借出:`deciderKey()`(OpenRouter 密钥,每次现读,没有时返回空串)、`onModeChange(mode)`(换模式时重建前缀);
评测和测试另有 `onDecision(rec)`、`deciderUrl`、`deciderFetch`(指向本地假端点)。Coopanion 的 `deciderKey` 依次读环境变量 `OPENROUTER_API_KEY`、
基址是 OpenRouter 的端点(名字不限)`.env` 里该端点 `secret` 名下的值(`core/decider-key.ts`)。

主动闲聊(`smallTalk`,默认关,`src/smalltalk.ts`)要应用借出 `presence()`:系统多少秒没有键盘鼠标输入、是否锁屏,以及这份信息的时刻
(Coopanion 由 Electron 主进程的 `powerMonitor` 每 30 秒和锁屏、解锁、睡眠、唤醒时报给 Core);不借或超过 2 分钟没更新就不会开始。
可选的 `nextAlarmAt()` 给出 bot 自己设的下一个唤醒时刻,15 分钟内要到时不闲聊。World 每 30 秒看一次,人在电脑前(5 分钟内有输入、没锁屏)、
窗口显示着、没有全屏窗口(页面的 `focus { shown, fullscreen, typing }`;全屏只有 Windows 判得出)、没暂停、没 `pet_quiet`、没睡着、
不在免打扰时段、没在打字或听话或等回答、bot 没在跑,且离上次尝试和上次聊天都够一个间隔(`frequency` 少 / 中 / 多 = 2 h / 1 h / 30 min;
离开 15 分钟以上、刚回来时不看后一条;锁屏或睡眠连同锁之前没动的时间也要够 15 分钟)时,推一条 `desktop-pet.smalltalk` 延迟事件(`flush`),投递时渲染成 `[闲聊] …`,
期间对方说过话、等了 10 分钟以上或开关关了就渲染成空。投递出去就算一次尝试(一次模型调用),bot 不说话也算;World 启动也算一次。详见主仓库的 `docs/notes/small-talk.md`。

### 对话页

控制台页 `world:desktop-pet` 的 `chat` 面板是一条推送连接(`src/chat.ts`),应用拿它做对话页:

- 页面发 `send` 的文字和图片作为 `desktop-pet.message` 投递;送达前在页面上排队,`now` 让它以 interrupt 立即送达,`withdraw` 撤回(需要宿主提供 `promotePending` / `withdrawPending`);World 的 `onEventsSettled` 告诉页面何时送达。
- `pet_say` 的每一拍、`pet_ask` 的问题、两句话之间调用过的工具名记为 `desktop-pet.self` 事件,只落库不投递;`hello` 时 World 从事件库还原历史,排过队的消息放在送达的位置。`blob`(GET)取消息里的图片。
- 页面发出的消息交给 bot 后,World 给桌宠页发 `said`(`via: 'chat'`、文字、图片数、事件游标),桌宠把它留在头顶(「输入气泡」`saidBubbles` 关着时不留);撤回时发 `said-withdrawn`,桌宠关掉那条。
- `pet_ask` 在页面上也能回答,回答后桌宠上的气泡关掉。页面还收到 Core 的运行阶段(`phase`)与暂停状态。
- `controls.openChat` 借出后,打字气泡多一个展开钮,带着草稿打开对话页;环境提示词的 `{{pet.chat}}` 也只在这时说明对话页。
- bot 的名字:`desktopPetDefinition({ botName })` 借出一个返回当前名字的函数时,菜单头、对话页(`init` 里的 `bot`,改名时推一帧 `{ t: 'bot', bot }`)和对话页的互动记录每次用时现读,改名不用重启 World;没借出时用挂载时的名字(`ctx.botName`)。

形象的身体可以实现 `stopWalk(id)`:interrupt 停下 `pet_walk_to` 时页面经 `figure-frame` 调它;没实现时这次走路照常走完。

## 安装

```bash
corepack pnpm install
corepack pnpm build        # 面板产物 dist/,不进版本库
```

然后在 Cortico 控制台「扩展」页安装(填本目录的绝对路径),整进程重启。bot 的 `declares` 里加上 `desktop-pet`,或在「World 总览」启用它。

## 开发

```bash
corepack pnpm test
corepack pnpm typecheck
npx tsx scripts/check-voice.ts <模型根> <语音.wav>   # 连真 FunASR 手动检查,模型不在就先下载
```

`tsconfig.json` 与 `vitest.config.ts` 把 `cortico/*` 指到主仓库的 `vendor/cortico/src/`;
装进 Cortico 运行时由框架的模块钩子解析。网页部分不依赖 World:`web/kit/` 是现成的身体(动作模拟、表情、粒子,
和画大肥鱼与四个娘用的 rig(`kit/rig.js`)),`web/coo/` 是 Coo 的造型、配件与形象包入口,`web/sound.js` 是合成音效与包自带音频的播放,
`web/body-host.js` 是桌宠页、装扮页这一侧的身体代理。
