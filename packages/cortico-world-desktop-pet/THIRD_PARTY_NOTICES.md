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

趴姿、招手和托腮的手臂、欢呼的双臂、比心的双手、捧着杯子和书的双手、合十、叉腰、张开的双手、挠头和竖起食指的手臂、端着茶的托盘、敬礼和比耶的手臂、指、捂嘴、抱臂、伸懒腰、屈膝礼的手臂、拍手(合掌和分开)、摊手、抱头、举手、点赞、嘘、擦汗、加油的手臂、记笔记(本子和羽毛笔)和对手指的双手、背面、团成球、跪坐、趴着时的笑嘴和说话嘴、跪坐和趴着时去掉眼睛和嘴的空白脸(画实时的脸用)、得意/生气/难过/害羞/翻白眼/震惊/死鱼眼的眼睛、认真、大哭的眼睛、流口水、震惊、得意、偷笑、大哭、害怕、认真、慌张的嘴的贴图(`tex/lie_*.png`、`tex/arm_wave*.png`、`tex/arm_chin.png`、`tex/arm_cheer_*.png`、`tex/arm_heart.png`、`tex/arm_cup.png`、`tex/arm_book.png`、`tex/arm_pray.png`、`tex/arm_hips.png`、`tex/arm_hug.png`、`tex/arm_scratch*.png`、`tex/arm_idea*.png`、`tex/arm_tea.png`、`tex/arm_salute*.png`、`tex/arm_vsign*.png`、`tex/arm_point.png`、`tex/arm_cover*.png`、`tex/arm_cross.png`、`tex/arm_stretch.png`、`tex/arm_curtsy.png`、`tex/arm_clap*.png`、`tex/arm_shrug.png`、`tex/arm_headhold.png`、`tex/arm_raise.png`、`tex/arm_thumbs.png`、`tex/arm_shush*.png`、`tex/arm_wipe.png`、`tex/arm_fist*.png`、`tex/arm_jot.png`、`tex/arm_twiddle.png`、`tex/back_body.png`、`tex/roll_ball.png`、`tex/kneel_*.png`、`tex/lie_smile.png`、`tex/lie_talk.png`、`feat/smug_eye*.png`、`feat/angry_eye*.png`、`feat/sad_eye*.png`、`feat/shy_eye*.png`、`feat/eyeroll_eye*.png`、`feat/shocked_eye*.png`、`feat/deadpan_eye*.png`、`feat/drool_mouth.png`、`feat/determined_eye*.png`、`feat/cry_eye*.png`、`feat/gasp_mouth.png`、`feat/smug_mouth.png`、`feat/giggle_mouth.png`、`feat/cry_mouth.png`、`feat/scared_mouth.png`、`feat/determined_mouth.png`、`feat/flustered_mouth.png`
及各配色下的同名文件)是按上面这些贴图渲染出的站姿编辑生成,再拆件、按区域换色得到的,属于同一形象的衍生图:
用的是 ChatGPT 的图像模型(gpt-image-2.5;拍手到擦汗这七个手势和加油、记笔记、对手指的手臂用的是 OpenAI 官方 API 的 gpt-image-2.5-sunburst,翻白眼、震惊、死鱼眼、认真、大哭的眼睛和流口水、震惊、得意、偷笑、大哭、害怕、认真、慌张的嘴也是 gpt-image-2.5-sunburst,只改眼睛或嘴的局部编辑)。

冬装(`outfits/cape/*.png`)和它的全身缩略图(`thumbs/cape.png`)取自上游 [Pal-AI-Lab/Coopanion](https://github.com/Pal-AI-Lab/Coopanion)
(上游 v0.1.24 首次发布:部件 commit 4619fd8,#156;缩略图 #159),同一形象的衍生图:ChatGPT 对女仆装母版做「换成冬装」的编辑得到冬装母版,再对它做和女仆装一样的「去掉不属于这个部件的部分、补画被挡住的地方」的编辑拆件;
角色原设和二创署名同上(「溟月」(上善无形)、ZipZipPipe)。冬装的部件不随配色换色,头发、脸、五官和尾巴用上面各配色的贴图。
冬装的手臂(`outfits/cape/poses/arm_*.png`,41 张,各配色共用)是本项目做的:对上面女仆装手臂(DeepSeek 配色)所用的编辑图再做只改袖口的局部编辑
(OpenAI 官方 API 的 gpt-image-2.5-sunburst,蕾丝袖口换成毛绒袖口和蓝色小蝴蝶结),按女仆装手臂的同一个框拆件,再用脚本去掉前臂周围残留的女仆装
(围裙、腰带、衬衫),并把垂到头发上的袖子收短到袖口,属于同一形象的衍生图;
角色原设和二创署名同上(「溟月」(上善无形)、ZipZipPipe)。
冬装的整身姿势图(`outfits/cape/schemes/<配色>/poses/*.png`:`kneel_*`、`lie_*`、`back_body`、`roll_ball`,每套配色 16 张)也是本项目做的:
对本项目女仆装的跪坐、趴姿、背面和团成球的图(或它们的来源图)做「换成冬装」的编辑(OpenAI 官方 API 的 gpt-image-2.5-sunburst),
跪坐和趴着时的空白脸是对冬装图再做的只去掉眼睛和嘴的局部编辑;按女仆装那张的框和对齐裁切,再用脚本拆出跪坐混合的下半身、空白脸、刘海和贴片,
另外 7 套配色按区域换头发、眼睛、皮肤和尾巴的颜色(冬装本身不换色),属于同一形象的衍生图;
角色原设和二创署名同上(「溟月」(上善无形)、ZipZipPipe)。
远侧腿(`tex/leg_front.png` 及各配色下的同名文件)也换成了上游跑步改版时去掉一角裤腰的那版。
女仆装的全身缩略图(`thumbs/maid.png`)是本项目用上面这些贴图渲染的站姿。

这些贴图不在本包的 AGPL 授权范围内。它们随 Coopanion 分发,想在别处使用请自行确认原设的权利。

## Claude 娘形象

`web/claude-chan/` 的贴图(`tex/`、`feat/`、`outfits/`、`thumbs/`)用的是 ZipZipPipe（Bilibili）设计的 Claude 同人角色「Claude 娘」。
图由 GPT 的图像模型(gpt-image-2.5)按这个角色设定生成,再由本项目拆件。
翻白眼、震惊、死鱼眼的眼睛和流口水、震惊的嘴(`feat/eyeroll_eye*.png`、`feat/shocked_eye*.png`、`feat/deadpan_eye*.png`、`feat/mouth_drool.png`、`feat/mouth_gasp.png`)是在她的母版上只改眼睛或嘴的局部编辑(gpt-image-2.5-sunburst),再按原有贴图裁切。

冬装(`outfits/winter/`,51 张)是本项目自己做的:对她的母版和各张图的来源图(站姿部件、手臂、坐姿、跪坐、趴着、背面、团成球)做「换成冬装」的编辑(GPT 的图像模型 gpt-image-2.5-sunburst),再按原有贴图的框和对齐裁切,头部沿用上面的贴图;服装缩略图 `thumbs/classic.png`、`thumbs/winter.png` 是用这些贴图渲染的。角色设定同上(ZipZipPipe（Bilibili）),属于同一角色的衍生图。

原作者允许免费非商业使用,所以这些贴图同样只限非商业使用。它们不在本包的 AGPL 授权范围内,随 Coopanion 分发。

## GPT 娘形象

`web/gpt-chan/` 的贴图(`tex/`、`feat/`、`outfits/`、`thumbs/`)用的是 ZipZipPipe（Bilibili）设计的 GPT 同人角色「GPT 娘」。
图由 GPT 的图像模型(gpt-image-2.5)按这个角色设定生成,再由本项目拆件。
翻白眼、震惊、死鱼眼的眼睛和流口水、震惊的嘴(`feat/eyeroll_eye*.png`、`feat/shocked_eye*.png`、`feat/deadpan_eye*.png`、`feat/mouth_drool.png`、`feat/mouth_gasp.png`)是在她的母版上只改眼睛或嘴的局部编辑(gpt-image-2.5-sunburst),再按原有贴图裁切。

冬装(`outfits/winter/`,48 张)是本项目自己做的:对她的母版和各张图的来源图(站姿部件、手臂、坐姿、跪坐、趴着、背面、团成球)做「换成冬装」的编辑(GPT 的图像模型 gpt-image-2.5-sunburst),再按原有贴图的框和对齐裁切,头部沿用上面的贴图;服装缩略图 `thumbs/classic.png`、`thumbs/winter.png` 是用这些贴图渲染的。角色设定同上(ZipZipPipe（Bilibili）),属于同一角色的衍生图。

原作者允许免费非商业使用,所以这些贴图同样只限非商业使用。它们不在本包的 AGPL 授权范围内,随 Coopanion 分发。

## Gemini 娘形象

`web/gemini-chan/` 的贴图(`tex/`、`feat/`、`outfits/`、`thumbs/`)用的是 ZipZipPipe（Bilibili）设计的 Gemini 同人角色「Gemini 娘」。
图由 GPT 的图像模型(gpt-image-2.5)按这个角色设定生成,再由本项目拆件。
翻白眼、震惊、死鱼眼的眼睛和流口水、震惊的嘴(`feat/eyeroll_eye*.png`、`feat/shocked_eye*.png`、`feat/deadpan_eye*.png`、`feat/mouth_drool.png`、`feat/mouth_gasp.png`)是在她的母版上只改眼睛或嘴的局部编辑(gpt-image-2.5-sunburst),再按原有贴图裁切。

冬装(`outfits/winter/`,47 张)是本项目自己做的:对她的母版和各张图的来源图(站姿部件、手臂、坐姿、跪坐、趴着、背面、团成球)做「换成冬装」的编辑(GPT 的图像模型 gpt-image-2.5-sunburst),再按原有贴图的框和对齐裁切,头部沿用上面的贴图;服装缩略图 `thumbs/classic.png`、`thumbs/winter.png` 是用这些贴图渲染的。角色设定同上(ZipZipPipe（Bilibili）),属于同一角色的衍生图。

原作者允许免费非商业使用,所以这些贴图同样只限非商业使用。它们不在本包的 AGPL 授权范围内,随 Coopanion 分发。

## Grok 娘形象

`web/grok-chan/` 的贴图(`tex/`、`feat/`、`outfits/`、`thumbs/`)用的是 ZipZipPipe（Bilibili）设计的 Grok 同人角色「Grok 娘」。
图由 GPT 的图像模型(gpt-image-2.5)按这个角色设定生成,再由本项目拆件。
翻白眼、震惊、死鱼眼的眼睛和流口水、震惊的嘴(`feat/eyeroll_eye*.png`、`feat/shocked_eye*.png`、`feat/deadpan_eye*.png`、`feat/mouth_drool.png`、`feat/mouth_gasp.png`)是在她的母版上只改眼睛或嘴的局部编辑(gpt-image-2.5-sunburst),再按原有贴图裁切。

冬装(`outfits/winter/`,48 张)是本项目自己做的:对她的母版和各张图的来源图(站姿部件、手臂、坐姿、跪坐、趴着、背面、团成球)做「换成冬装」的编辑(GPT 的图像模型 gpt-image-2.5-sunburst),再按原有贴图的框和对齐裁切,头部沿用上面的贴图;服装缩略图 `thumbs/classic.png`、`thumbs/winter.png` 是用这些贴图渲染的。角色设定同上(ZipZipPipe（Bilibili）),属于同一角色的衍生图。

原作者允许免费非商业使用,所以这些贴图同样只限非商业使用。它们不在本包的 AGPL 授权范围内,随 Coopanion 分发。

## 说话声

说话声的代码、音节库和读音数据取自上游 [Pal-AI-Lab/Coopanion](https://github.com/Pal-AI-Lab/Coopanion)(上游 v0.2.7 首次发布:#263,350bbbd;
日语读音改用 IPADIC、常用漢字表付表与 Unihan:#265,b94a705),文件与上游逐字节相同;
本项目另在 `src/speech/data/` 里附上了 pypinyin 与 pinyin-data 的许可全文。

`web/speech/zh.ogg` 与 `zh.json` 的音节由 Microsoft Edge 的朗读服务以 `zh-CN-XiaoyiNeural` 声音逐个念出,
再由 `scripts/speech-bank/build.py` 切短、定调、均衡后拼成。这些录音不是本项目创作的,不在本包的 AGPL 授权范围内,随 Coopanion 分发。

`src/speech/data/en.tsv.gz` 取自 [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict)(经 Python 包 cmudict 1.1.3),
Copyright (C) 1993-2015 Carnegie Mellon University,BSD 式许可,全文见 [`src/speech/data/CMUDICT-LICENSE`](src/speech/data/CMUDICT-LICENSE)。

`src/speech/data/ja-ipadic.tsv.gz` 由 `scripts/speech-bank/dicts.py` 从 [mecab-ipadic](https://taku910.github.io/mecab/) 2.7.0-20070801 导出(含汉字的词条及其发音)。
Copyright 2000, 2001, 2002, 2003 Nara Institute of Science and Technology,许可允许使用、复制、修改和分发,条件是附上版权声明与许可条款(含 ICOT 的条款与免责声明),
全文见 [`src/speech/data/IPADIC-COPYING`](src/speech/data/IPADIC-COPYING)。

`src/speech/data/ja-unihan.tsv.gz` 由同一脚本从 Unicode 18.0.0 Unihan 数据库的 `kJapanese` 字段导出。Copyright © 1991-2026 Unicode, Inc.,
UNICODE LICENSE V3,全文见 [`src/speech/data/UNICODE-LICENSE`](src/speech/data/UNICODE-LICENSE)。

`src/speech/jukujikun.ts` 是常用漢字表(平成 22 年内阁告示第 2 号)付表里的熟字训与读音;告示不受日本著作权法保护(第 13 条)。

`src/speech/data/zh.json` 由 `scripts/speech-bank/build.py` 用 [pypinyin](https://github.com/mozillazg/python-pinyin) 0.55.0 生成
(MIT,Copyright (c) 2016 mozillazg, 闲耘,全文见 [`src/speech/data/PYPINYIN-LICENSE`](src/speech/data/PYPINYIN-LICENSE)),
读音数据来自 [pinyin-data](https://github.com/mozillazg/pinyin-data)(MIT,Copyright (c) 2016 mozillazg,全文见 [`src/speech/data/PINYIN-DATA-LICENSE`](src/speech/data/PINYIN-DATA-LICENSE)),
源自 Unicode 的 Unihan 数据库([Unicode 许可](https://www.unicode.org/license.txt))。

## 其他运行时依赖

- `ws`:MIT
- `opencc-js`(繁简转换):MIT AND Apache-2.0

## 本包的许可

AGPL-3.0-or-later,见 [`LICENSE`](LICENSE);`web/whale/`、`web/claude-chan/`、`web/gpt-chan/`、`web/gemini-chan/` 和 `web/grok-chan/` 的贴图除外,见上;`web/speech/` 的说话声音节库(`zh.ogg` 的录音及其清单 `zh.json`)来自 Microsoft Edge 的朗读服务,不在本包 AGPL 授权范围内,见上;
说话声的读音数据(`src/speech/data/`、`src/speech/jukujikun.ts`)各随上面写明的许可。
并入 Coopanion 之前的版本(独立仓库 `Pal-AI-Lab/cortico-world-desktop-pet` 里的历史)是 MIT。
