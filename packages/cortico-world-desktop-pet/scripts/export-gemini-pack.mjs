#!/usr/bin/env node
/**
 * Exports the built-in Gemini-chan (web/gemini-chan/) as the figure pack `coopanion-gemini-chan`, which other copies of
 * the desktop pet can install, upstream's v0.1.17 included: `node scripts/export-gemini-pack.mjs [outDir] [--upstream
 * <ref>]` (default `build/packs` under the repository root) writes `<outDir>/coopanion-gemini-chan/`.
 * The work is scripts/export-pack.mjs's; this file is her descriptor (names, licence, README).
 *
 * Her art is for non-commercial use only (THIRD_PARTY_NOTICES.md): the manifest's licence and the pack's README say so.
 * In Coopanion itself the id `coopanion-gemini-chan` is an alias of the built-in Gemini-chan (src/packs.ts
 * PACK_ALIASES). Used by tests/gemini-pack-export.test.js; nothing renders or writes on import.
 */
import {
  PKG_REL, SOURCE_URL, installSection, moduleClosure, packExporter, runCli, soundSection,
} from './export-pack.mjs';

/** The pack's README, in Chinese. */
export function packReadme(manifest, sounds) {
  const code = moduleClosure(manifest.entry).sort().map((m) => `\`${m}\``).join('、');
  return `# ${manifest.name.zh}

Coopanion 的桌宠形象「Gemini 娘」导出成的形象包(id \`${manifest.id}\`,版本 ${manifest.version}),可以装进别的 Coopanion
(包括原版 v0.1.17 及以后)。她带着自己的 kit(\`kit/body.js\`、\`kit/rig.js\`),所以在原版里也会全部 ${manifest.vocab.length} 个表情和动作:
猫耳跟着心情竖起、压平、耷拉,尾巴摇来摇去、受惊炸毛,唱歌、喝茶、看书、屈膝礼、比耶……(和内置的她一样,没有喷水)。
原版没有的 ${sounds.length} 个音效事先渲染成了 \`sounds/*.wav\`。

${installSection(manifest)}
然后重启 Coopanion,在装扮页最上面一行「形象」里选「${manifest.name.zh}」。

在 Coopanion 自己(${SOURCE_URL})里,这个包是内置 Gemini 娘的别名:装了不会多出一个形象,
配置里选着它时显示的就是内置的「Gemini 娘」。

## 在原版里的已知限制

- 唱歌(\`song\`)不能中途打断:原版不认识 \`stop:song\`,歌会唱完约 ${(sounds.find((s) => s.name === 'song')?.seconds ?? 4).toFixed(1)} 秒。
- 说话口型不跟着字走:原版的页面不把正在说的字传给身体,四种口型只是轮流换。
- 包里音效的第一次播放可能没有声音:原版在音频解码完成前会跳过这一次,之后就正常了。

${soundSection(sounds)}
## 许可

- 代码(${code})是 AGPL-3.0-or-later,全文见 \`LICENSE\`;
  源码在 ${SOURCE_URL}(\`${PKG_REL}/web/\`),导出脚本是 \`${PKG_REL}/scripts/export-gemini-pack.mjs\`。
- 贴图(\`tex/\`、\`feat/\`、\`thumbs/\`)不在 AGPL 授权范围内,**只限非商业使用**:角色设定是 ZipZipPipe(Bilibili)
  画的 Gemini 同人形象;图由 GPT 的图像模型按这个设定生成,再由 Coopanion 拆件。
  原作者允许免费非商业使用,所以这些贴图同样只限非商业使用。它们随 Coopanion 分发。
- 音效由上面的代码合成,和代码同一许可。
`;
}

export const GEMINI = {
  dir: 'gemini-chan',
  id: 'coopanion-gemini-chan',
  // short: upstream's dress tile has room for a few characters
  name: { zh: 'Gemini 娘', en: 'Gemini-chan' },
  entry: 'gemini-chan/figure.js',
  factory: 'createGeminiFigure',
  fallbackScheme: 'original',
  author: (base) => `${base.author ?? 'Coopanion'} (${SOURCE_URL})`,
  license: `代码 AGPL-3.0-or-later,源码在 ${SOURCE_URL};贴图只限非商业使用,不在 AGPL 范围内,见 README.md`,
  credits: (base) => [
    ...(base.credits ?? []),
    { role: '代码(AGPL-3.0-or-later)', name: 'Coopanion', url: SOURCE_URL },
  ],
  readme: packReadme,
};

const gemini = packExporter(GEMINI);
export const {
  PACK_ID, modules, requestedTones, packSounds, buildManifest, textureFiles, packFiles, exportPack,
} = gemini;

runCli(gemini, import.meta.url);
