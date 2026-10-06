# 第三方声明

这个包依赖 sherpa-onnx 的 Node 插件,不带模型和 Electron。下面是随包安装的原生组件、运行时会去取的东西,以及各自的许可。

## 识别运行库

[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) 的 Node 插件 `sherpa-onnx-node` 1.13.8 与各平台的
预编译包(`sherpa-onnx-win-x64`、`sherpa-onnx-darwin-arm64`、`sherpa-onnx-darwin-x64` 等),随 npm 依赖安装。
Apache-2.0;其中的 onnxruntime 为 MIT。

## 模型

FunASR 的 SenseVoiceSmall(FunAudioLLM,通义实验室)经 k2-fsa 转成 sherpa-onnx 用的 int8 ONNX,
放在 `<模型根>/desktop-pet/sensevoice-small-int8-2024-07-17/`,按固定的 SHA-256 校验。

| 文件 | 来源(按顺序尝试) | 许可 |
|---|---|---|
| `model.int8.onnx`、`tokens.txt` | [ModelScope pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue](https://modelscope.cn/models/pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue),再 [Hugging Face csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17) | [FunASR 模型开源协议](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE) |

## 桌宠窗口

Electron 44.4.4,从 [electron/electron releases](https://github.com/electron/electron/releases/tag/v44.4.4)
取到 `<运行时根>/electron/44.4.4/`,或使用内嵌应用自带的那份。MIT;其中 Chromium 与依赖各随其许可。

## DeepSeek 大肥鱼形象

`web/whale/` 的贴图由 ChatGPT(OpenAI 的图像模型)按参考图生成后拆件:角色原设为「溟月」(上善无形),
DeepSeek 女仆装二创参考 ZipZipPipe。围裙上的喷水小鲸鱼是本项目自己画的图标(`examples/whale/apron-whale.svg`)。

趴姿、招手和托腮的手臂、欢呼的双臂、比心的双手、捧着杯子和书的双手、合十、叉腰、张开的双手、挠头和竖起食指的手臂、端着茶的托盘、敬礼和比耶的手臂、指、捂嘴、抱臂、伸懒腰、屈膝礼的手臂、背面、团成球的贴图(`tex/lie_*.png`、`tex/arm_wave*.png`、`tex/arm_chin.png`、`tex/arm_cheer_*.png`、`tex/arm_heart.png`、`tex/arm_cup.png`、`tex/arm_book.png`、`tex/arm_pray.png`、`tex/arm_hips.png`、`tex/arm_hug.png`、`tex/arm_scratch*.png`、`tex/arm_idea*.png`、`tex/arm_tea.png`、`tex/arm_salute*.png`、`tex/arm_vsign*.png`、`tex/arm_point.png`、`tex/arm_cover*.png`、`tex/arm_cross.png`、`tex/arm_stretch.png`、`tex/arm_curtsy.png`、`tex/back_body.png`、`tex/roll_ball.png`
及各配色下的同名文件)是按上面这些贴图渲染出的站姿编辑生成,再拆件、按区域换色得到的,属于同一形象的衍生图:
用的是 ChatGPT 的图像模型(gpt-image-2.5)。

这些贴图不在本包的 AGPL 授权范围内。它们随 Coopanion 分发,想在别处使用请自行确认原设的权利。

## 其他运行时依赖

- `ws`:MIT
- `opencc-js`(繁简转换):MIT AND Apache-2.0

## 本包的许可

AGPL-3.0-or-later,见 [`LICENSE`](LICENSE);`web/whale/` 的贴图除外,见上。
并入 Coopanion 之前的版本(独立仓库 `Pal-AI-Lab/cortico-world-desktop-pet` 里的历史)是 MIT。
