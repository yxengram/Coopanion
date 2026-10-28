# cortico-provider-coo

Owner: `src/index.ts`

Coo Pet Provider:[Cortico](https://github.com/Pal-AI-Lab/Cortico) 的一个 provider 模块(`kind: "coo"`),
接 Coopanion 列出的几家模型服务,DeepSeek 排第一。除 Gemini 外每家都走自己的 OpenAI 兼容 Responses 端点
(`POST <baseUrl>/responses`),不在服务端存历史,推理按明文回传(OpenAI、xAI 按服务签名的加密块回传,
`Vendor.encryptedReasoning`);Anthropic 走 Messages API(经 `@anthropic-ai/sdk` 发 `POST <baseUrl>/v1/messages`,
密钥放 `x-api-key`,`Vendor.protocol = 'anthropic'`,`src/anthropic/`,照搬上游 Coopanion);Gemini 走 Gemini API
(`POST <baseUrl>/models/<model>:generateContent`,密钥放 `x-goog-api-key`,`Vendor.protocol = 'gemini'`,`src/gemini/`)。

| id | 服务 | baseUrl | 默认模型 |
|---|---|---|---|
| `deepseek` | DeepSeek | `https://api.deepseek.com` | `deepseek-flash` |
| `qwen` | 通义千问(阿里云百炼) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.8-flash` |
| `kimi` | Kimi | `https://api.moonshot.cn/v1` | `kimi-k3` |
| `glm` | 智谱 GLM | `https://open.bigmodel.cn/api/v1` | `glm-5.3-flash` |
| `doubao` | 豆包(火山方舟) | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-2-1-lite-260915` |
| `qianfan` | 百度千帆 | `https://qianfan.baidubce.com/v2` | `glm-5.1` |
| `minimax` | MiniMax | `https://api.minimax.cn/v1` | `MiniMax-M3` |
| `stepfun` | 阶跃星辰 | `https://api.stepfun.com/v1` | `step-3.7-flash` |
| `openrouter` | OpenRouter | `https://openrouter.ai/api/v1` | `deepseek/deepseek-v4.1-flash` |
| `openai` | OpenAI | `https://api.openai.com/v1` | `gpt-6-luna` |
| `anthropic` | Anthropic | `https://api.anthropic.com` | `claude-haiku-5-5` |
| `gemini` | Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini-3.5-flash-lite` |
| `xai` | xAI | `https://api.x.ai/v1` | `grok-4.3` |

表在 `src/vendors.ts`,数据取自各家文档(2026-09-24;OpenAI、Anthropic、Gemini、xAI 四行照上游 Coopanion 的表,上游读于 2026-10-08/09)。默认模型取每家最新一代里便宜、能看图的那档(千帆的 Responses 接口没有能看图的模型;智谱的 Responses 文档只示范了 `glm-5.3`);
`Vendor.models` 是另外几个推荐的模型名,任何那一家接受的模型名都能填。**只有 DeepSeek 拿真实的 Key 跑过**,别家按「和 DeepSeek 一样」接入。

- **哪一家**:按端点的 `baseUrl` 认(`vendorOf`,该地址下的子路径也算那一家),端点里不另存字段。智谱的 Responses 端点在 `/api/v1` 下,不是对话接口的 `/api/paas/v4`。
  Messages API 和 Gemini API 只用在 Anthropic、Gemini 的 baseUrl 本身(`protocolOf`;Anthropic 填常见的 `https://api.anthropic.com/v1` 也算,SDK 自己加 `/v1/messages`);它下面的 OpenAI 兼容路径 `…/v1beta/openai` 照别家一样发 Responses。
- **思考档位**:不思考 / 快 / 标准 / 最深,发 `reasoning.effort` = `none` / `low` / `high` / `max`;
  某家文档写明只收别的值时按 `Vendor.effort` 换算(千问 `high→medium`、`max→xhigh`;Kimi 没有 `none`,换成 `low`;
  MiniMax、阶跃星辰没有 `max`,换成 `high`;千帆没写 effort,不发 `reasoning`;xAI 的 `max→xhigh`)。
  个别模型另有一套时按 `Vendor.modelEffort`(`effortOf`):`gpt-6.1-sol`、`gpt-6-astra` 和 `grok-4.7` 没有 `none`,换成 `low`。
  Gemini API 按自己的写法发(`thinkingConfig`,Gemini 3 关不掉思考,「不思考」发它收的最低一档)。
  Messages API 也按自己的写法(`thinkingParams`):思考时发 `thinking: {type: "adaptive"}` 加 `output_config.effort`
  (`low` / `high` / `max` 原样),并带 beta `thinking-binding-controls-2026-08-01`,对话前缀被 Core 改写过的思考块由服务丢弃而不是报错;
  不思考时 Haiku 发 `disabled`,Sonnet 5.5 发 `between_tools`,Opus 5.5 关不掉思考,发 adaptive 的 `low`。
  思考块的签名记在推理项的 `encrypted_content`,只回传给同一端点同一模型。
- **占位推理**:Responses 按明文回传过往推理时,没记下推理的工具调用前默认补一条占位推理(`Vendor.syntheticReasoning`,即 Cortico 的 `sendSyntheticReasoning`)。
  DeepSeek 明确开(不补会回 400);OpenRouter 关(上游 Coopanion 2026-10-13 实测经它的千问、Kimi、GLM、MiniMax、Grok 不补也能通过,默认的 DeepSeek 模型不在其列);
  别家不填,沿用 Cortico 的默认(补)。端点因此回 400 时,桌宠的失败气泡请使用者反馈给开发者,不给设置按钮。
- **图片**:端点勾了「多模态」就发,哪家、哪个模型都一样(上游 #432;以前还要那一家列明所用模型能看图,表外的模型和其他地址勾了也收不到图)。新建端点和选模型时,按那一家列明能看图的模型(`Vendor.vision`)自动勾上或去掉「多模态」。从以前的版本升级时，应用(`core/seed.ts`)会一次性去掉内置服务上那些勾着「多模态」、模型却不在 `vision` 里的端点的勾，保持升级前不发图的行为。
  只发最近一批送达的事件(user 消息或事件帧)及其后的图片,更早的只留 Core 给每份附件写的 `[blob …]` 那行文字。
  每次送达新的一批,请求里从上一批的第一张图起前缀缓存失效。
- **提示词缓存**(Anthropic):system 一个断点,请求顶层 `cache_control` 跟着对话最后一块走,每次请求读上一次写下的前缀。
- **重试**(Anthropic):SDK 自己不重试(`maxRetries: 0`),由 `ClaudeProvider` 照框架的约定最多重试三次(有 `Retry-After` 按它等),
  连接错误、408、409、429、5xx、529 重试,已经流出不可撤回的内容后不重试,API 已经答完但停止原因不认识的也不重试(再问一次还要再计费);每次请求记一个 `ProviderAttempt`。
- **不读 shell 的 Anthropic 设置**:Core 继承 app 启动时的环境,SDK 不取 `ANTHROPIC_AUTH_TOKEN`(`authToken: null`)、`ANTHROPIC_LOG`、`ANTHROPIC_CUSTOM_HEADERS`(建客户端时暂时藏起来),只发端点自己的密钥。
- **远程地址只收 https**(上游 #327):`validateEntry` 拒收 http 的远程地址(`plainRemote`),提示在 `COO_TEXT.httpRemote`(zh/en);
  http 只留给本机和局域网:回环、`localhost` 和 `*.localhost`、10/8、172.16/12、192.168/16、169.254/16、100.64/10(Tailscale、运营商 NAT)、
  IPv6 的 `::1`、`fc00::/7`、`fe80::/10`,以及局域网名字(不带点的单名,或 `.local`、`.lan`、`.home.arpa`、`.internal` 结尾)。
  规则之前存下的 http 远程端点仍列着,但 `create` 给它一个每次请求都在发出前失败的客户端(错误固定英文,`create` 拿不到界面语言)。
- **模型列表有上限,带 Key 的请求不跟重定向**(上游 #325):Gemini 的 `GET /models` 最多读 `MODEL_PAGES_MAX`(20)页、整体 60 秒,
  翻页令牌重复就停;Anthropic 的列表读满 2000 个就停(SDK 在 `has_more` 一直为真时会一直翻)。`listGeminiModels` 和 Anthropic SDK 的
  `fetch`(在 `withoutShellHeaders` 里一起传)都设 `redirect: 'error'`:`x-goog-api-key`、`x-api-key` 不是标准认证头,跨源重定向会跟着发过去。
  Responses 和 Gemini 对话走 Cortico 的传输层,由 Cortico 0.2.6 不跟重定向;别家的模型目录(Cortico 的 `ModelCatalog`)仍跟重定向,但 Key 在 `Authorization: Bearer` 里,fetch 跨源重定向时会去掉它。
- **价目**:DeepSeek(错峰价,两个高峰时段按两倍计)、OpenAI、Anthropic、Gemini(付费档)和 xAI 内置(`src/pricing.ts`,
  长提示词按各家的第二档计;Anthropic 的新输入、缓存写入、缓存读取分别计价);别家没有内置价目。
- **标志**:`src/icons.ts`,取自 [@lobehub/icons-static-svg](https://github.com/lobehub/lobe-icons)(MIT)。标志归各自的公司所有,只用来标明是哪一家。
  OpenAI、Anthropic、Gemini、xAI 不带标志,只画一个写着名字的方框(OpenAI、Anthropic、Gemini 写首字母,xAI 写全名)。
- **接入流程**:`src/connect.ts` 的 `connectVendor` 经 Cortico 控制台的 provider 路由给某一家建端点(名字就是它的 id,
  密钥存在该端点 `.env` 的 `Vendor.secret` 下(Cortico 先读进程环境变量再读 `.env`,所以 OpenAI、Anthropic、Gemini、xAI 用
  `COO_OPENAI_API_KEY`、`COO_ANTHROPIC_API_KEY`、`COO_GEMINI_API_KEY`、`COO_XAI_API_KEY`,免得启动环境里开发者自己的 `OPENAI_API_KEY` 等盖掉贴进来的 Key),模型按传入的名字,留空用默认)、测试,通过后设为当前端点并恢复运行;已有端点留空 Key 时沿用存着的。Coopanion 的桌面引导和「开始」页都用它。

端点配置示例(`<CORTICO_HOME>/providers/qwen/config.json`,密钥在同目录 `.env` 的 `QWEN_API_KEY`):

```json
{
  "kind": "coo",
  "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "secret": "QWEN_API_KEY",
  "spec": { "model": "qwen3.8-flash", "thinking": true, "reasoningEffort": "high", "maxTokens": 8192 },
  "multimodal": true
}
```

0.1.x 叫 `cortico-provider-deepseek`(`kind: "deepseek"`);Coopanion 启动时把旧端点的 `kind` 改成 `coo`。

## `chatgpt` 模块:用 ChatGPT 套餐登录(测试中)

包里第二个 provider 模块(`kind: "chatgpt"`,`CHATGPT_PROVIDER`,`src/chatgpt/`),从上游 Coopanion v0.2.4 移植(含 #187、#188、#219 的修正),
**没有用真实的 Plus / Pro 账号试过**。端点没有 Key:用 ChatGPT 账号登录(OAuth 授权码 + PKCE,经系统浏览器,回调在
`127.0.0.1` 上系统挑的端口;第一次登录动态注册 `dynamic_agent_client`,之后沿用发下来的 client id),要拿到
`chatgpt.tokens.use.direct` 授权才算登录上。令牌存在端点目录的 `.env`(`CHATGPT_*` 几行,整份写临时文件再替换),提前 5 分钟或被拒一次后刷新,
刷新令牌每次轮换。请求只发 `https://api.openai.com/v1`(`normalize` 把地址钉死),每次都流式、`store: false`,去掉套餐路由不收的参数,
函数工具放进一个命名空间(没写 `strict` 的函数工具发 `strict: false`,上游 #255:省略时路由会把可选参数归成必填)。套餐用量到上限时客户端自己停 5 分钟再试,不算失败;连接测试直接报 429。

- **服务表**:`CHATGPT` 用 OpenAI 的模型、思考换算和上下文长度,不在 `VENDORS` 里(地址和 OpenAI 一样,`vendorOf` 按地址认会认成 OpenAI);
  端点按模块认(`connectionVendor` 读 `/api/status` 的 `module`,`endpointVendor` 读端点的 `kind`)。没有价目。标志沿用 OpenAI 的「O」方框。
- **面板**:页 `llm:chatgpt` 的面板 `chatgpt` 有 `signIn`(返回授权地址,由调用方交给系统浏览器)、`state`、`cancel`(第二个参数是那次的授权地址,结束调用方不再等的那次登录,回调端口随即关闭)、`signOut`(作废并删掉令牌)四个方法,第一个参数是端点名。
  它不带浏览器产物,声明成内置面板 `coopanion-chatgpt`(`CHATGPT_BUILTIN_PANEL`),由 Coopanion 的设置窗口登记,Cortico 的端点编辑页就画出账号一行。
- **接入流程**:`connect.ts` 的 `connectChatGPT` 建端点(名字 `chatgpt`;这个名字已被别种端点占了时用 `chatgptName` 挑 `chatgpt-2` 这样的空名,已有的 ChatGPT 端点 `chatgpt-N` 接着用)、登录、端点的模型不在套餐列表里时改成列表第一个、测试、设为当前端点并恢复运行;
  `signInChatGPT`、`signOutChatGPT`、`chatgptState` 是单项;`signInChatGPT` 的等待被中止时会调 `cancel`。
- **和上游不同**:`.env` 按 `[ \t]*` 读,空的 `CHATGPT_*=` 行不会读到下一行(Cortico #268);这几行记下写给哪个端点目录(`CHATGPT_ENDPOINT`,目录的绝对路径),
  在 Cortico 的模型页复制或改名的端点、整个复制或挪走的数据文件夹都读成未登录,第一次读到时就把抄来的几行从文件里删掉(文件改写成 0600),两处不会共用一份轮换的刷新令牌。上游的模型页禁止复制,这里用的是 Cortico 自己的页。
  删除端点时 Cortico 不会先退出,刷新令牌在 OpenAI 那边不会作废,要先在「开始」页或编辑页点退出。

在 Coopanion 里它随应用注册;单独使用时按 Cortico 的扩展方式安装(`cortico.kind = provider`,`api = 5`)。
