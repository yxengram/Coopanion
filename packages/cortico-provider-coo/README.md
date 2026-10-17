# cortico-provider-coo

Owner: `src/index.ts`

Coo Pet Provider:[Cortico](https://github.com/Pal-AI-Lab/Cortico) 的一个 provider 模块(`kind: "coo"`),
接 Coopanion 列出的几家模型服务,DeepSeek 排第一。除 Gemini 外每家都走自己的 OpenAI 兼容 Responses 端点
(`POST <baseUrl>/responses`),不在服务端存历史,推理按明文回传(OpenAI、xAI 按服务签名的加密块回传,
`Vendor.encryptedReasoning`);Gemini 走 Gemini API(`POST <baseUrl>/models/<model>:generateContent`,
密钥放 `x-goog-api-key`,`Vendor.protocol = 'gemini'`,`src/gemini/`)。

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
| `gemini` | Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini-3.5-flash-lite` |
| `xai` | xAI | `https://api.x.ai/v1` | `grok-4.3` |

表在 `src/vendors.ts`,数据取自各家文档(2026-09-24;OpenAI、Gemini、xAI 三行照上游 Coopanion 的表,上游读于 2026-10-08/09)。默认模型取每家最新一代里便宜、能看图的那档(千帆的 Responses 接口没有能看图的模型;智谱的 Responses 文档只示范了 `glm-5.3`);
`Vendor.models` 是另外几个推荐的模型名,任何那一家接受的模型名都能填。**只有 DeepSeek 拿真实的 Key 跑过**,别家按「和 DeepSeek 一样」接入。

- **哪一家**:按端点的 `baseUrl` 认(`vendorOf`,该地址下的子路径也算那一家),端点里不另存字段。智谱的 Responses 端点在 `/api/v1` 下,不是对话接口的 `/api/paas/v4`。
  Gemini API 只用在 Gemini 的 baseUrl 本身(`protocolOf`);它下面的 OpenAI 兼容路径 `…/v1beta/openai` 照别家一样发 Responses。
- **思考档位**:不思考 / 快 / 标准 / 最深,发 `reasoning.effort` = `none` / `low` / `high` / `max`;
  某家文档写明只收别的值时按 `Vendor.effort` 换算(千问 `high→medium`、`max→xhigh`;Kimi 没有 `none`,换成 `low`;
  MiniMax、阶跃星辰没有 `max`,换成 `high`;千帆没写 effort,不发 `reasoning`;xAI 的 `max→xhigh`)。
  个别模型另有一套时按 `Vendor.modelEffort`(`effortOf`):`gpt-6.1-sol`、`gpt-6-astra` 和 `grok-4.7` 没有 `none`,换成 `low`。
  Gemini API 按自己的写法发(`thinkingConfig`,Gemini 3 关不掉思考,「不思考」发它收的最低一档)。
- **图片**:端点勾了「多模态」且那一家列明所用模型能看图(`Vendor.vision`)时才发;选模型时按它自动勾上或去掉「多模态」。
  只发最近一批送达的事件(user 消息或事件帧)及其后的图片,更早的只留 Core 给每份附件写的 `[blob …]` 那行文字。
  每次送达新的一批,请求里从上一批的第一张图起前缀缓存失效。
- **价目**:DeepSeek(错峰价,两个高峰时段按两倍计)、OpenAI、Gemini(付费档)和 xAI 内置(`src/pricing.ts`,
  长提示词按各家的第二档计);别家没有内置价目。
- **标志**:`src/icons.ts`,取自 [@lobehub/icons-static-svg](https://github.com/lobehub/lobe-icons)(MIT)。标志归各自的公司所有,只用来标明是哪一家。
  OpenAI、Gemini、xAI 不带标志,只画一个写着名字的方框(OpenAI、Gemini 写首字母,xAI 写全名)。
- **接入流程**:`src/connect.ts` 的 `connectVendor` 经 Cortico 控制台的 provider 路由给某一家建端点(名字就是它的 id,
  密钥存在该端点 `.env` 的 `Vendor.secret` 下(Cortico 先读进程环境变量再读 `.env`,所以 OpenAI、Gemini、xAI 用
  `COO_OPENAI_API_KEY`、`COO_GEMINI_API_KEY`、`COO_XAI_API_KEY`,免得启动环境里开发者自己的 `OPENAI_API_KEY` 等盖掉贴进来的 Key),模型按传入的名字,留空用默认)、测试,通过后设为当前端点并恢复运行;已有端点留空 Key 时沿用存着的。Coopanion 的桌面引导和「开始」页都用它。

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
上游 Coopanion 还有 Anthropic(Messages API,要 `@anthropic-ai/sdk`)和用 ChatGPT 套餐登录(另一个 provider 模块,
要 Cortico 的 provider 网页面板和应用里的登录界面),这里还没有。

在 Coopanion 里它随应用注册;单独使用时按 Cortico 的扩展方式安装(`cortico.kind = provider`,`api = 5`)。
