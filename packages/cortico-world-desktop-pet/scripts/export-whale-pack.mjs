#!/usr/bin/env node
/**
 * Exports the built-in whale (web/whale/) as the figure pack `coopanion-whale`, which other copies of the desktop pet
 * can install, upstream's v0.1.17 included: `node scripts/export-whale-pack.mjs [outDir] [--upstream <ref>]` (default
 * `build/packs` under the repository root) writes `<outDir>/coopanion-whale/`. The work is scripts/export-pack.mjs's;
 * this file is the whale's descriptor (names, licence, README).
 *
 * In Coopanion itself the id `coopanion-whale` is an alias of the built-in whale (src/packs.ts PACK_ALIASES).
 * The module's exports (`buildManifest`, `packSounds`, `packFiles`, `encodeWav`, …) are used by
 * tests/whale-pack-export.test.js; nothing renders or writes on import.
 */
import {
  PKG_REL, SOURCE_URL, installSection, packExporter, runCli, soundSection,
} from './export-pack.mjs';

export {
  PKG, RATE, ROOT, SEED, SOURCE_URL, UPSTREAM_REF, encodeWav, finishSound, renderSounds, toneNamesIn, upstreamToneNames, upstreamTones,
} from './export-pack.mjs';

/** The pack's README, in Chinese. */
export function packReadme(manifest, sounds) {
  return `# ${manifest.name.zh}

Coopanion 的桌宠形象「DeepSeek 大肥鱼」导出成的形象包(id \`${manifest.id}\`,版本 ${manifest.version}),可以装进别的 Coopanion
(包括原版 v0.1.17 及以后)。她带着自己的 kit(\`kit/body.js\`、\`kit/rig.js\`),所以在原版里也会全部 ${manifest.vocab.length} 个表情和动作:
趴下、跪坐、翻滚、喷水、唱歌、喝茶、看书、敬礼、比耶……以及 ${manifest.axes[0].options.length} 套配色。
原版没有的 ${sounds.length} 个音效事先渲染成了 \`sounds/*.wav\`。

${installSection(manifest)}
然后重启 Coopanion,在装扮页最上面一行「形象」里选「${manifest.name.zh}」,配色在下面一行。

在 Coopanion 自己(${SOURCE_URL})里,这个包是内置大肥鱼的别名:装了不会多出一个形象,
配置里选着它时显示的就是内置的「DeepSeek 大肥鱼」,配色不变。

## 在原版里的已知限制

- 唱歌(\`song\`)不能中途打断:原版不认识 \`stop:song\`,歌会唱完约 ${(sounds.find((s) => s.name === 'song')?.seconds ?? 4).toFixed(1)} 秒。
- 说话口型不跟着字走:原版的页面不把正在说的字传给身体,四种口型只是轮流换。
- 包里音效的第一次播放可能没有声音:原版在音频解码完成前会跳过这一次,之后就正常了。
- 喷水的水声是渲染时定下的一个版本,不像内置音色那样每次音高略有不同。

${soundSection(sounds)}
## 许可

- 代码(\`whale/figure.js\`、\`kit/body.js\`、\`kit/rig.js\`)是 AGPL-3.0-or-later,全文见 \`LICENSE\`;
  源码在 ${SOURCE_URL}(\`${PKG_REL}/web/\`),导出脚本是 \`${PKG_REL}/scripts/export-whale-pack.mjs\`。
- 贴图(\`tex/\`、\`feat/\`、\`schemes/\`、\`thumbs/\`)不在 AGPL 授权范围内:由 ChatGPT 的图像模型按参考图生成后拆件,
  ${(manifest.credits ?? []).filter((c) => !c.url).map((c) => `${c.role}「${c.name}」`).join(',')};围裙上的喷水小鲸鱼是 Coopanion 自己画的。
  它们随 Coopanion 分发,想在别处使用请自行确认原设的权利。
- 音效由上面的代码合成,和代码同一许可。
`;
}

export const WHALE = {
  dir: 'whale',
  id: 'coopanion-whale',
  name: { zh: 'Coopanion 大肥鱼', en: 'Coopanion Whale' },
  entry: 'whale/figure.js',
  factory: 'createWhaleFigure',
  fallbackScheme: 'deepseek',
  author: (base) => `${base.author ?? 'Pal-AI-Lab'}; Coopanion (${SOURCE_URL})`,
  license: `代码 AGPL-3.0-or-later,源码在 ${SOURCE_URL};贴图不在 AGPL 范围内,见 README.md`,
  credits: (base) => [
    ...(base.credits ?? []),
    { role: '代码(AGPL-3.0-or-later)', name: 'Coopanion', url: SOURCE_URL },
  ],
  readme: packReadme,
};

const whale = packExporter(WHALE);
export const {
  PACK_ID, requestedTones, packSounds, buildManifest, textureFiles, packFiles, exportPack,
} = whale;

runCli(whale, import.meta.url);
