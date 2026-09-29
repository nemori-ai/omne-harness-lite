# 可复核的来源与观察

所有上游为官方仓库 primary 源，HTTPS GitHub API 解析 commit、固定 raw.githubusercontent.com URL 取得 UTF-8 字节；逐文件摘要在 manifest。厂商源码只证明指定代码路径，不等同已执行运行结果或独立性能评估。抓取窗口：2026-09-29T12:18Z 至报告写出；不同 commit 不混称同一发布物。

## E1 pi 文件图像处理

- 修订：earendil-works/pi 0.86.1 / `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`，由本项目 UPSTREAM.md 指定，未误用 badlogic/pi-mono 同名版本。
- actual 调用链：[read.execute](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/src/core/tools/read.ts#L105) → [processImage](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/src/utils/image-process.ts#L72) → [resizeImage](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/src/utils/image-resize.ts#L85) → [resizeImageInProcess](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/src/utils/image-resize-core.ts#L59)。
- [MIME sniff](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/src/utils/mime.ts#L6)；[默认预算与输出编码](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/src/utils/image-resize-core.ts#L21)；[Photon 解码](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/src/utils/image-resize-core.ts#L74)；[resize/编码循环](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/src/utils/image-resize-core.ts#L108)；[package manifest](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/package.json#L70)。
- 观察：原生 bytes → Photon → bytes/base64；base64预算以编码后字符串字节数检查；worker失败有进程内回退。PNG sniff 遍历 acTL；GIF/WebP分支没有帧数枚举。
- 支持范围：源码路径有实际调用边，不是类型示例。未执行该链/上游测试；未审完整 pi 模型发送/所有输入入口。
- 代价来自所读分配和重编码代码；未做 issue 全域调查或性能实测，不冒称没有已知缺陷。

## E2 DSH 分层处理

- 修订：`639ed015397290b3745d163aafe02ffee4aa3f84`，attachment-local package 0.2.0-rc.2。
- [decodeCanonicalBase64](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment/src/admission.ts#L15)；[admitEncodedImages](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment/src/admission.ts#L49) → [saveImages](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/index.ts#L207) → [prepareImageFile](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/store.ts#L99) → [detectImage](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/image.ts#L116)。
- [imageMetadata](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/image.ts#L63)；[pass-through 条件](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/normalization.ts#L36) / [normalizeImage](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/normalization.ts#L109)；[默认 source/normalized 限额](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/index.ts#L33)。
- 请求：[prepareImages](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/llm/llm-deepseek/src/images.ts#L38) / [inlineImages](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/llm/llm-deepseek/src/images.ts#L69) → [createRequestImage](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/request-image.ts#L97)；计量 [deepSeekImageRequestPricing](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/llm/llm-deepseek/src/request-pricing.ts#L90) 调 [deepSeekImageTokens](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/llm/llm-deepseek/src/image-tokens.ts#L147)。
- 明确分歧：normalization 注释与代码将 maxBytes 作为目标，有 smallest 回退；不能只看命名“maxBytes”便声称强上限。store.source 最大字节在图片解码前判定；base64本身早先已解码。
- 支持范围：读取正文，不运行 DSH。API 含 Cordis/存储服务不代表本项目应采用它；仅抽取底层库能力事实。

## E3 LangChain TS 投影与计量

- 修订：`17b6bba8343bdd3f3dfc5c59578e0b72337ec740`，OpenAI包1.6.0。
- [_generate](https://github.com/langchain-ai/langchainjs/blob/17b6bba8343bdd3f3dfc5c59578e0b72337ec740/libs/providers/langchain-openai/src/chat_models/completions.ts#L202) → [用户 content 遍历](https://github.com/langchain-ai/langchainjs/blob/17b6bba8343bdd3f3dfc5c59578e0b72337ec740/libs/providers/langchain-openai/src/converters/completions.ts#L714) → [image data URL 投影](https://github.com/langchain-ai/langchainjs/blob/17b6bba8343bdd3f3dfc5c59578e0b72337ec740/libs/providers/langchain-openai/src/converters/completions.ts#L520)，请求在 completions.ts:263 进入 completionWithRetry。
- [getNumTokensFromMessages](https://github.com/langchain-ai/langchainjs/blob/17b6bba8343bdd3f3dfc5c59578e0b72337ec740/libs/providers/langchain-openai/src/chat_models/base.ts#L845) → [core getNumTokens](https://github.com/langchain-ai/langchainjs/blob/17b6bba8343bdd3f3dfc5c59578e0b72337ec740/libs/langchain-core/src/language_models/base.ts#L503) 只收 text。
- 附加 helper：[parseBase64DataUrl](https://github.com/langchain-ai/langchainjs/blob/17b6bba8343bdd3f3dfc5c59578e0b72337ec740/libs/langchain-core/src/messages/content/data.ts#L357)；[Google base64/Uint8Array 转换](https://github.com/langchain-ai/langchainjs/blob/17b6bba8343bdd3f3dfc5c59578e0b72337ec740/libs/providers/langchain-google-genai/src/utils/common.ts#L148)。
- 支持范围：固定路径的投影与预估性质；不证明所有 LangChain providers 都没有图片校验，不把源码 helper 的潜在 large-array 问题称已复现。

## E4 sharp 底层能力与限制

- 修订：v0.35.3 → `1018449164723ba0203c1beffaba0e21f7829c18`。
- [metadata](https://github.com/lovell/sharp/blob/1018449164723ba0203c1beffaba0e21f7829c18/lib/input.mjs#L569) 明确不解压 compressed pixel data；:593 pages 给出 GIF/WebP 帧数元数据。
- [failOn / 像素保护 / 页选择](https://github.com/lovell/sharp/blob/1018449164723ba0203c1beffaba0e21f7829c18/lib/constructor.mjs#L160)：默认warning，DSH选择error；默认pages=1，animated=true等于pages=-1。
- 支持范围：成熟库能提供页数元数据、正式像素处理；不证明 metadata == 栅格有效，不证明 strict EOF 检查，也不证明 DSH 默认全帧解码。
- 抓取偏差记录：先尝试已不对应此版的 lib/constructor.js 路径失败，查询固定树后正确抓取 .mjs；未用失败文件做证据。依赖范围与实际安装版本不混同。

## E5 本项目冻结基线与短串反例

- 修订：`6fb5138b6503739bf5cbe59cb32a157ff9f19797`；通过 `git show <sha>:<path>` 读取与摘要，不纳入并行改动。
- 路径：`packages/model/pi-ai-transport/src/input-meters/openai-images.ts` 的 `singleFrameGif`（:25）只遍历 block/subblock，要求一帧及 trailer恰好EOF；不解码 LZW。imageTokens在:122起执行 shape/base64/mime/dimension检查，:136–146 为 data URL、canonical roundtrip、GIF 与 image-size 调用；`patchImageTokens` 是尺寸算术，不输出修改后的图像。
- CB schema：`.meta_harness/design/spec/data/content-blocks/v3/content-blocks.schema.json`:109–115 InlineBytes。schema.ts / schema-runtime.ts 内容哈希见 manifest。
- 实际执行：Node v24.18.0，直接运行该 pattern 和 Buffer roundtrip；无产品函数调用、无模型请求。命令：

```js
const r=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)(?![\s\S])/;
for (const s of ['Zg==','Zh==','Zg','Zg==\n','____'])
  console.log(s, r.test(s), Buffer.from(s,'base64').toString('base64')===s);
```

实际结构化输出（输入以 JSON 字符串显示）：

```json
{
  "node": "v24.18.0",
  "observations": [
    {
      "input": "\"Zg==\"",
      "schemaPattern": true,
      "canonicalRoundtrip": true
    },
    {
      "input": "\"Zh==\"",
      "schemaPattern": true,
      "canonicalRoundtrip": false
    },
    {
      "input": "\"Zg\"",
      "schemaPattern": false,
      "canonicalRoundtrip": false
    },
    {
      "input": "\"Zg==\\n\"",
      "schemaPattern": false,
      "canonicalRoundtrip": false
    },
    {
      "input": "\"____\"",
      "schemaPattern": false,
      "canonicalRoundtrip": false
    }
  ]
}
```

- 支持范围：`Zh==` 即 canonical替换不等价的可复核反例。并非大图片 benchmark、非上游测试通过、非图像可解码证据。4 MiB 栈溢出是任务输入的既有他方观察，本包没有重复验证。

## 固定源码索引

各文件 raw URL、字节数、repo/commit 在 [source-manifest.json](source-manifest.json)。下载对应 raw URL 后 SHA256 应等于下表；未保存完整源码副本。

| 来源 | 固定文件 | SHA256 |
|---|---|---|
| S1 | [`packages/coding-agent/src/utils/image-resize-core.ts`](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/src/utils/image-resize-core.ts) | `b3523329397d47473b76c40e8802283a79d3a3e3f317f4da0124ccba5152edd8` |
| S2 | [`packages/coding-agent/src/utils/image-resize.ts`](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/src/utils/image-resize.ts) | `d93a007eb45a02b73b1a4777d193614dae5fbcadd9139c8b755ea35c1d649757` |
| S3 | [`packages/coding-agent/src/utils/image-process.ts`](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/src/utils/image-process.ts) | `fffb65fba877607644f8028c0f24aa6e74228e15427e112ee367e7983f2a79e5` |
| S4 | [`packages/coding-agent/src/core/tools/read.ts`](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/src/core/tools/read.ts) | `9198b35438927fa392f2b984fd2c3bedcf51209e4d6d5107d813067e928c5acf` |
| S5 | [`packages/coding-agent/package.json`](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/package.json) | `8e8e5cf99a033e9aae1db15e8455f819e1921b7c8351b1044acdab9525c14fd7` |
| S6 | [`packages/attachment/attachment-local/src/encoding.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/encoding.ts) | `6404620aaa9ccf87fdfcdb6302c2be09b666b76dd755a8f0f761c5890a7c9921` |
| S7 | [`packages/attachment/attachment-local/src/image.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/image.ts) | `ec48db7f7702bb06317c10c393c1fc6a8ec0927f87f63021f419f015dd69827f` |
| S8 | [`packages/attachment/attachment-local/src/normalization.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/normalization.ts) | `3d1b849628f0c827497bac800af49272ac8c5b64be4c59d96bc9f0c23d76fffa` |
| S9 | [`packages/attachment/attachment-local/src/sharp.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/sharp.ts) | `6735e559022dccabc257c72af8e9d12b18bbd2c717503cbee84a125274e374de` |
| S10 | [`packages/attachment/attachment-local/src/request-image.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/request-image.ts) | `bbb89a0150520a8c73d96fa884066e4b2cc82085864c5899500e45bd6aac889e` |
| S11 | [`packages/attachment/attachment-local/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/index.ts) | `1a1d3fda491bbb0789447e6f9ab92840d6652eff8d68fbccc2a4307ccc5f9f8b` |
| S12 | [`packages/attachment/attachment-local/package.json`](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/package.json) | `5606a0a5c3a7ca23e7dc768479c074078e04c3d2f0de78fa3512eb2dce49eb65` |
| S13 | [`packages/attachment/attachment/src/admission.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment/src/admission.ts) | `34d6453071f95e639fed9c9c23f6b59418f9b523ec2fe554b304e5bf6c03341b` |
| S14 | [`packages/llm/llm-deepseek/src/image-tokens.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/llm/llm-deepseek/src/image-tokens.ts) | `9a7e16b2fd451f99a99b36a39eda33aa1d26f0d3243545f0152ec7f802ec064a` |
| S15 | [`libs/providers/langchain-google-genai/src/utils/common.ts`](https://github.com/langchain-ai/langchainjs/blob/17b6bba8343bdd3f3dfc5c59578e0b72337ec740/libs/providers/langchain-google-genai/src/utils/common.ts) | `a6420c17fa7cbe64bf29354dcc15b2425b085f274fed32d2c71a3296977186c9` |
| S16 | [`libs/providers/langchain-openai/package.json`](https://github.com/langchain-ai/langchainjs/blob/17b6bba8343bdd3f3dfc5c59578e0b72337ec740/libs/providers/langchain-openai/package.json) | `c4b5a37fd5dcf17de0971309666345e66588421b7a3804889741cc282b18cb09` |
| S17 | [`packages/coding-agent/src/utils/mime.ts`](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/coding-agent/src/utils/mime.ts) | `00893b8a5089c217405b5a9b2d316b3392a1845966f8d4aad8fb31c156e4d922` |
| S18 | [`packages/attachment/attachment-local/src/store.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/attachment/attachment-local/src/store.ts) | `4b627d534da3cdd8c7b8e3ca68656e25c8d46563bcf3971f50231c162deb1fa6` |
| S19 | [`packages/llm/llm-deepseek/src/images.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/llm/llm-deepseek/src/images.ts) | `bf72a07169a9db4ad9944d76f5f0788ad83ef627d4911e92e9273f565dfd0e1f` |
| S20 | [`libs/providers/langchain-openai/src/chat_models/base.ts`](https://github.com/langchain-ai/langchainjs/blob/17b6bba8343bdd3f3dfc5c59578e0b72337ec740/libs/providers/langchain-openai/src/chat_models/base.ts) | `c066767c4a49546d4d8d499ca06e9463da610e1f53fe348f32ee991c6a72f214` |
| S21 | [`libs/providers/langchain-openai/src/chat_models/completions.ts`](https://github.com/langchain-ai/langchainjs/blob/17b6bba8343bdd3f3dfc5c59578e0b72337ec740/libs/providers/langchain-openai/src/chat_models/completions.ts) | `593482ed3f40fca8e7c159a04df5681c2da5296b28d7a951d1f5a62025b00926` |
| S22 | [`libs/langchain-core/src/messages/content/data.ts`](https://github.com/langchain-ai/langchainjs/blob/17b6bba8343bdd3f3dfc5c59578e0b72337ec740/libs/langchain-core/src/messages/content/data.ts) | `afcc7ed15aae3431963fce7a772a51d4806efc5c729a585a9ad45ca676703187` |
| S23 | [`libs/providers/langchain-openai/src/converters/completions.ts`](https://github.com/langchain-ai/langchainjs/blob/17b6bba8343bdd3f3dfc5c59578e0b72337ec740/libs/providers/langchain-openai/src/converters/completions.ts) | `458a8fddca506f712337670df5fc49f6b965cabc576c1dfdd47d3206a7f1248e` |
| S24 | [`libs/langchain-core/src/language_models/base.ts`](https://github.com/langchain-ai/langchainjs/blob/17b6bba8343bdd3f3dfc5c59578e0b72337ec740/libs/langchain-core/src/language_models/base.ts) | `a15f3f7f4a95477f15b40d1ed73cdcb33aae2124e5c89bed36596da99380ac18` |
| S25 | [`packages/llm/llm-deepseek/src/request-pricing.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/llm/llm-deepseek/src/request-pricing.ts) | `8dcbb62ffcdb7f45eecc176c5219bc1dd424e36c4c9b469d5cb6223b1a503d8d` |
| S26 | [`lib/constructor.mjs`](https://github.com/lovell/sharp/blob/1018449164723ba0203c1beffaba0e21f7829c18/lib/constructor.mjs) | `2420fe1860b5bcc88de73ca43adae7d2410c37ff23adf4ef87e3ec922e5bf9d3` |
| S27 | [`lib/input.mjs`](https://github.com/lovell/sharp/blob/1018449164723ba0203c1beffaba0e21f7829c18/lib/input.mjs) | `c134801d22ca82b1cf56e21e3468592585e29b093cbd7c7663608d2baf93308e` |

## E6 归档时的独立字节复核

2026-09-29，对 pi image-resize-core、DSH encoding/image、LangChain core language_models/base 与 sharp input 五个固定 primary URL 重新匿名读取，全部长度及 SHA256 与原 source-manifest 一致；逐文件见 [source-recheck.json](source-recheck.json)。这核对了调查所引对象的字节身份，不把未运行的库调用、动画／EOF 等价或上游测试改写成已验证。原 manifest 的 temporary 状态是采集时原件；正式归档仍不代表采用。
