/** Tool declarations; `DesktopPetWorld.tools()` binds the handlers. */
import type { ToolDef } from 'cortico/core/types.ts';

export const DESKTOP_PET_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'pet_say',
    tags: ['speak'],
    description: '在桌宠头顶冒出对话气泡说话,表情和动作写成标记放进 script。回执报告大约显示多久;窗口没连接时失败。',
    parameters: {
      type: 'object',
      properties: {
        script: { type: 'string', description: '要说的话,一个气泡一两句,夹带标记:【】先做再换新气泡,<> 打字到那里时做;+ 连起来的词同时做,逗号隔开的先后做,如【开心+点头】。不想说话就不要调用。' },
      },
      required: ['script'],
    },
  },
  {
    name: 'pet_ask',
    tags: ['speak'],
    description: '冒出一个提问气泡,下面列出最多 3 个选项,默认再加一格让对方自己写。立即返回;对方的回答以 [回答] 事件送达,关掉不答也会送达。新的 pet_say 或 pet_ask 会替换还没回答的提问。',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '问题,一句话。' },
        options: { type: 'array', items: { type: 'string' }, maxItems: 3, description: '1–3 个简短选项,每个不超过 40 字。' },
        allowOwnAnswer: { type: 'boolean', description: '是否提供自己写回答的输入格,默认 true。' },
      },
      required: ['question', 'options'],
    },
  },
  {
    name: 'pet_walk_to',
    tags: ['act'],
    description: '沿屏幕底边走(或跑)到某个位置,走到或被打断后返回(按路程等,远的等得久)。cursor、away 会先看鼠标在哪,回执里说鼠标在哪、你停在哪,所以找鼠标、走到鼠标那里都不用先截图。',
    parameters: {
      type: 'object',
      properties: {
        to: { description: '目标:0–1 的数字(桌宠所在那块屏幕的宽度比例,0 最左、1 最右),或 left / center / right,cursor 走到鼠标旁边(凑到对方跟前),away 背着鼠标走开约三分之一屏宽(躲开、让地方)。', anyOf: [{ type: 'number', minimum: 0, maximum: 1 }, { type: 'string', enum: ['left', 'center', 'right', 'cursor', 'away'] }] },
        run: { type: 'boolean', description: 'true 跑过去,默认走过去。' },
      },
      required: ['to'],
    },
  },
  {
    name: 'pet_set',
    tags: ['act'],
    description: '改你自己的外观和习惯。figure、scheme、roam、snoreSeconds 直接生效;sound、scale、theme、hoverButtons、user 会先在气泡里问对方,对方同意才改,回执等对方回答后才返回。可选的值见环境说明。只给要改的项。',
    parameters: {
      type: 'object',
      properties: {
        figure: { type: 'string', description: '形象:coo,或已装形象的 id。换成形象包时不给 scheme 就用它的第一套。' },
        scheme: { type: 'string', description: '当前(或这次换上的)形象的打扮:预设 id,或各项选项按顺序用 - 连起来(Coo 是配色-头顶-耳侧-眼镜-颈饰)。' },
        roam: { type: 'string', enum: ['free', 'calm', 'off'], description: '平时走动:free 常走动,calm 多待着,off 不乱动。' },
        snoreSeconds: { type: 'integer', minimum: 0, maximum: 3600, description: '每次睡着打多少秒呼噜,0 一直打到醒。' },
        sound: { type: 'boolean', description: '音效开关(先问对方)。' },
        scale: { type: 'number', minimum: 0.5, maximum: 2, description: '在屏幕上的大小,1 是默认(先问对方)。' },
        theme: { type: 'string', enum: ['dark', 'light'], description: 'dark 夜间(浅色身体),light 白天(深色身体)(先问对方)。' },
        hoverButtons: { type: 'array', items: { type: 'string', enum: ['chat', 'voice', 'roam', 'theme', 'sound', 'dress', 'hide'] }, maxItems: 6, description: '鼠标停在你身上时旁边的按钮(先问对方)。' },
        user: { type: 'string', maxLength: 20, description: '你对对方的称呼(先问对方)。' },
      },
    },
  },
  {
    name: 'pet_quiet',
    tags: ['act'],
    description: '临时安静一会儿:默认关掉音效、站着不乱走,到时间自动恢复,设置不变。对方这期间自己改了音效或走动,就按对方的来并提前结束。minutes 给 0 立即结束。',
    parameters: {
      type: 'object',
      properties: {
        minutes: { type: 'number', minimum: 0, maximum: 1440, description: '安静多少分钟。' },
        sound: { type: 'boolean', description: '这期间要不要音效,默认 false。' },
        roam: { type: 'string', enum: ['off', 'calm'], description: '这期间的走动,默认 off。' },
      },
      required: ['minutes'],
    },
  },
  {
    name: 'pet_act',
    tags: ['act'],
    description: '不说话,只做表情或动作:每项一个词或用 + 连起来同时做的一组,如 "坐下+开心+招手",几项依次做。立即返回;坐、趴、睡、跪这类姿势会保持下去,词表里写了什么时候结束。',
    parameters: {
      type: 'object',
      properties: {
        actions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6, description: '一项一个词,或同时做的几个词用 + 连起来;几项按顺序做。' },
      },
      required: ['actions'],
    },
  },
];

/**
 * Decider mode (src/decider.ts): the bot names no word. `pet_say` takes the text and a feeling, `pet_feel` replaces
 * `pet_act`, `pet_walk` (left or right by pixels, or toward or away from the mouse pointer) replaces `pet_walk_to`; `pet_ask` takes an optional feeling. `pet_set`
 * and `pet_quiet` are the classic declarations.
 */
export const DECIDER_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'pet_say',
    tags: ['speak'],
    description: '在桌宠头顶冒出一个对话气泡说话,一次一个气泡,一两句。feeling 写你这一刻的心情和想法(想坐下、趴下也写在这里),表情、动作和姿势会照它自动做出来,不用再调 pet_feel。立刻返回大约显示多久和你现在的位置,不等身体做完;做了什么之后在 [表情动作] 行里说。窗口没连接时失败。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要说的话,一两句,纯文字,不写任何标记或括号里的动作。不想说话就不要调用。' },
        feeling: { type: 'string', description: '这一刻你的心情、想法或情绪,一两句话,怎么写都行,例:「被夸了有点得意,嘴上还要装淡定」「心疼她,想在旁边坐下陪着」。对方看不到这句;不用写动作名。' },
      },
      required: ['text', 'feeling'],
    },
  },
  {
    name: 'pet_ask',
    tags: ['speak'],
    description: '冒出一个提问气泡,下面列出最多 3 个选项,默认再加一格让对方自己写。立即返回;对方的回答以 [回答] 事件送达,关掉不答也会送达。新的 pet_say 或 pet_ask 会替换还没回答的提问。',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '问题,一句话。' },
        options: { type: 'array', items: { type: 'string' }, maxItems: 3, description: '1–3 个简短选项,每个不超过 40 字。' },
        allowOwnAnswer: { type: 'boolean', description: '是否提供自己写回答的输入格,默认 true。' },
        feeling: { type: 'string', description: '可选:问的时候的心情或想法,表情动作会照它做出来(回执不等它)。' },
      },
      required: ['question', 'options'],
    },
  },
  {
    name: 'pet_walk',
    tags: ['act'],
    description: '沿屏幕底边朝左或朝右走(或跑)一段,或朝鼠标走过去、背着鼠标走开,走到或被打断后返回(按路程等,远的等得久)。到屏幕边会停下,回执里说。你现在在哪、离两边多远,见每批事件和桌宠工具回执里的 [位置] 行;鼠标在哪,cursor、away 的回执里说,找鼠标、走到鼠标那里都不用先截图。',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['left', 'right', 'cursor', 'away'], description: 'left 往左,right 往右;cursor 朝鼠标走,走到它旁边停下(凑到对方跟前);away 背着鼠标走开(躲开、让地方)。' },
        pixels: { type: 'integer', minimum: 1, maximum: 8000, description: '走多少像素(桌宠所在那块屏幕的像素,屏幕宽度见 [位置])。left、right 必须给;cursor 不给就一直走到鼠标旁边,给了最多走这么多;away 不给就走开约三分之一屏宽。' },
        run: { type: 'boolean', description: 'true 跑过去,默认走。' },
      },
      required: ['direction'],
    },
  },
  ...DESKTOP_PET_TOOL_DECLS.filter((d) => d.name === 'pet_set' || d.name === 'pet_quiet'),
  {
    name: 'pet_feel',
    tags: ['act'],
    description: '这一轮不说话时用:只让身体流露心情,写下此刻的心情或想法,表情、动作和姿势(坐下、跪坐、趴下、睡觉也算)会照它自动做出来。说话时把心情和姿势写进 pet_say 的 feeling,不要说完再调它。约一秒后返回做了什么;坐、趴、睡、跪这类姿势会保持下去,回执里说什么时候结束。',
    parameters: {
      type: 'object',
      properties: {
        feeling: { type: 'string', description: '此刻的心情、想法或打算,一两句话,例:「聊累了,想在旁边坐着发会儿呆」。' },
      },
      required: ['feeling'],
    },
  },
];
