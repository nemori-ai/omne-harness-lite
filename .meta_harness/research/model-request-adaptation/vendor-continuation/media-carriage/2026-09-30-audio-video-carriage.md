# 音频／视频输入的线上承载与计量：OpenRouter、钉住的 pi 源与 omne-next 的取证

2026-09-30 UTC，为主调度裁决 R-C（HUB `tmp/model-request-runtime/rulings-20260930-main-dispatcher.md`，
「音频／视频线上承载是设计缺口，开研究与 realization 候选」）做的上游取证。对象是四家十款声明了 `audio`／`video`
输入却被本传输判 `modality_not_carried` 的型号：`google/gemini-3.8-flash`、`google/gemini-3.7-flash`（audio+video）、
`qwen/qwen3.8-max-0902`、`qwen/qwen3.8-max-prime`、`qwen/qwen3.8-flash`、`qwen/qwen3.8-27b`、`qwen/qwen3.7-flash`、
`moonshotai/kimi-k3`、`z-ai/glm-5.3-flash`、`z-ai/glm-5.3-flashx`（video）。本页只读官方文档、公开目录 JSON、
钉住的源码与本机 omne-next 副本；**没有发送任何模型请求、没有读取凭据**。本页记录事实与推断边界，不写承载方案。

现状坐标（执行仓库 `976d4730`）：已接受设计把可承载模态钉为 `{text, image}`
（[pi-ai-transport 设计](../../../../design/realization/packages/model/pi-ai-transport/design.md#公开面)第 62 行常量、第 88 行契约行），
`packages/model/pi-ai-transport/src/plan.ts:95` `PI_AI_CARRIABLE_MODALITIES`、`:96-119` `parts()` 只投影文本、带 `transcript` 的块与
`inline` 数据的图块，其余返回 `undefined`，`:215-216` 判 `modality_not_carried`；`src/definitions.ts:59-79` 的
`ModelCapabilities.inputModalities` 照 `data.model-profile` 声明四种模态，`inputConstraints` 只有 `maxImageBytes`。

## 结论先行

1. **OpenRouter Chat Completions 已有官方线上形状**：音频 `input_audio{data: base64, format}`（不接受 URL），视频 `video_url{url: URL 或 data: URL, processing?}`（`input_video` 已标 deprecated）。两者都在 `/api/v1/chat/completions` 的 content part 联合里。
2. **官方文档没有给出任何大小、时长、数量上限**——音频页、视频页、总览页、API schema 四处读遍，只有「varies by provider」「check model-specific documentation」。这是读数缺口，不是「无上限」。
3. **用量字段存在但语义未定**：`prompt_tokens_details.audio_tokens`／`video_tokens` 在 schema 里，`prompt_tokens` 是否已含它们、哪家路由实际返回，文档没说。**目录里没有任何模型带 `video` 计价键**；`audio` 键只在 Google 两款（等于 `prompt` 单价），且 `audio` 的计价单位在文档里未定义。
4. **钉住的 pi 源不承载音视频**：内容类型仍只有文本、思考、图、工具调用，`Model.input` 仍只 `"text"|"image"`——这是对既有研究结论的**复核未变**；本页**补充**了它当时未核的另一半：OpenRouter 本身接受这两种输入。
5. **omne-next 有可参照的映射逻辑**（Python，LangChain 块 → `video_url`／`input_audio`，含 mediaType→format 表），但没有音视频用量字段解析，也没有大小上限；不能作为 TS 实现直接复用。
6. **离线计量只有 Google 给了公式**，且经 OpenRouter 路径有一个不可离线消解的歧义（`media_resolution` 不在 OpenRouter 的 video part 里，每帧 66 与 258 token 相差近四倍）；Qwen／Moonshot／ZAI 没有取得任何公式。**四家的音视频输入计量都只能靠真实 usage 校准。**

## 事实表

| # | 事实 | 来源（抓取 2026-09-30 UTC） | 关键原文 | 支持范围与限制 |
|---|---|---|---|---|
| F1 | 音频输入的线上形状：content part `type: "input_audio"`，`input_audio: { data, format }` 两项必填；`data` 为 base64；**不支持 URL** | [音频页](audio-video-carriage-2026-09-30/openrouter-audio.txt)（05:19Z）；[API schema `ChatContentAudio`](audio-video-carriage-2026-09-30/openrouter-chat-api-media-parts-excerpt.yaml)（整页 SHA 见来源清单） | "Audio files must be **base64-encoded** - direct URLs are not supported for audio content."；schema `required: [data, format]` | 文档形状；未以真实请求验证任一路由是否接受 |
| F2 | 音频格式：文档列 `wav mp3 aiff aac ogg flac m4a pcm16 pcm24` 为「常见」，明写「Supported audio formats vary by provider」；`pcm16`／`pcm24` 没有采样率、声道字段 | 同 F1 | "Check your model's documentation to confirm which audio formats it supports." | 列表不是各路由的保证；哪家接受哪种格式**未取得** |
| F3 | 视频输入的线上形状：`type: "video_url"`，`video_url: { url, processing? }`；`url` 可为 URL 或 `data:` URL；`processing ∈ {agentic, static}` 只对 Google Gemini 生效、其他提供者忽略；`type: "input_video"` 在 schema 里 `deprecated: true` | [视频页](audio-video-carriage-2026-09-30/openrouter-videos.txt)（05:19Z）；[schema `ChatContentVideo`／`ChatContentVideoInput`／`Legacy_ChatContentVideo`](audio-video-carriage-2026-09-30/openrouter-chat-api-media-parts-excerpt.yaml) | "URL of the video (data: URLs supported)"；"If `processing` is omitted, OpenRouter does not send a value upstream and Gemini's default applies." | 同上 |
| F4 | 视频 URL 的提供者限制：**Google AI Studio 只接受 YouTube 链接**，Vertex 不接受任何 URL；其他提供者「check model-specific documentation」；OpenRouter 只把 URL 发给明确支持的提供者 | 视频页 | "Google Gemini on AI Studio only supports YouTube links (not Vertex AI)." | 本项目 Google 固定路由是 `google-ai-studio`，因此本地视频只能走 `data:` URL |
| F5 | 视频格式：`video/mp4`、`video/mpeg`、`video/mov`、`video/webm`；Messages API（`/api/v1/messages`）不支持视频输入 | 视频页 | "The Messages API (`/api/v1/messages`) does not support video inputs." | — |
| F6 | **大小／时长／数量上限：官方未给**。音频页无任何字节或时长数字；视频页只有「Check model-specific file size limits」「Different models may have different limits on video duration」；总览页说「the number of files you can send varies by provider and model」；API schema 无 `maxLength` 类约束 | 音频页、视频页、[总览页](audio-video-carriage-2026-09-30/openrouter-multimodal-overview.txt)、API schema | "Large file errors? Compress the video…Check model-specific file size limits" | 这是四处读遍未见，不是构造反例验证过的上限不存在 |
| F7 | agentic 视频处理的回程：导航步骤以 `reasoning_details` 里的 encrypted 条目返回，`finish_reason: "stop"`；续轮要原样回传 | 视频页 | "send the assistant message back with its `reasoning_details` intact" | 只 Google 路由；本传输已有 `reasoning_details` 回放（思考块 `opaque`），是否覆盖此形状未验 |
| F8 | 用量 schema：`prompt_tokens_details` 有 `audio_tokens`（"Audio input tokens"）、`video_tokens`（"Video input tokens"）、`cached_tokens`、`cache_write_tokens`；`completion_tokens_details.audio_tokens` 是输出音频；`prompt_tokens` 描述只是 "Number of tokens in the prompt"，**未说明是否已含音视频 token** | [`ChatUsage` schema 摘录](audio-video-carriage-2026-09-30/openrouter-chat-api-ChatUsage-excerpt.yaml)；[用量记账 cookbook](audio-video-carriage-2026-09-30/openrouter-usage-accounting-cookbook.txt) 示例含 `"audio_tokens": 0` | — | 哪些路由实际返回这两个字段、值与 `prompt_tokens` 的关系，只能由真实调用观察 |
| F9 | 计价键：全目录 `pricing` 出现过的键是 `audio, audio_output, completion, image, image_output, input_audio_cache, input_cache_read, input_cache_write, input_cache_write_1h, internal_reasoning, overrides, prompt, web_search`——**没有 `video`**。[模型目录指南](audio-video-carriage-2026-09-30/openrouter-models-guide.txt)的 Pricing Object 只文档化 `prompt/completion/request/image/web_search/internal_reasoning/input_cache_read/input_cache_write/overrides`，`audio` 键未文档化；API 的 `max_price.audio` 描述为 "Maximum price in USD per audio unit"，unit 未定义 | 公开目录 `/api/v1/models`（05:19Z，整份 SHA `cca2c42a…`，[十行投影](audio-video-carriage-2026-09-30/openrouter-models-ten-rows.json)）；模型目录指南 | "All pricing values are in USD per token/request/unit." | 目录是快照；视频按什么计价，目录与文档都没有回答 |
| F10 | 十款的目录声明与定价（`architecture.input_modalities` / `context_length` / 计价，USD/token）：见下方[十款一览](#十款在目录里的声明) | 同 F9；[逐款 endpoints 记录](audio-video-carriage-2026-09-30/openrouter-endpoints/)（05:20Z） | — | 目录顶层取「top provider」的价；固定路由的价见 endpoints 文件 |
| F11 | Google 两款固定路由 `google-ai-studio` 的 endpoint 计价含 `audio: 0.00000075`（= `prompt`）与 `input_audio_cache: 0.000000075`（= `input_cache_read`），`image: 0.00000075`；无 `video` 键；`max_prompt_tokens: null` | `openrouter-endpoints/google__gemini-3.8-flash.json`、`…3.7-flash.json` | — | 「`audio` 单价等于 `prompt` 单价」是数值相等的观察，不证明视频 token 也按 `prompt` 计 |
| F12 | Qwen 五款（`alibaba`）、Moonshot K3（`moonshotai/mxfp4`）、ZAI 两款（`z-ai/fp8`）固定路由的 endpoint 计价只有 `prompt/completion/input_cache_read(/write)`，**没有任何媒体计价键**；Qwen 四款 `max_prompt_tokens: 983616`、`qwen3.8-27b` 为 null | 同上各文件 | — | 没有媒体键 ≠ 媒体免费或按 `prompt` 计；这一层目录不回答 |
| F13 | 钉住的 pi 源 `earendil-works/pi@3390bd9`（`packages/ai` = 0.86.1）：`src/types.ts:364-394` 内容类型只有 `TextContent`／`ThinkingContent`／`ImageContent{data, mimeType}`／`ToolCall`；`:971` `input: ("text" \| "image")[]`；`src/api/openai-completions.ts:1260-1273` user 内容只映射 `text` 与 `image_url`（非 text 一律当图），`:1395-1435` 工具结果只收文本与图；`packages/ai/src` 全目录里 `input_audio` 唯一一处是 `mistral-conversations.ts:421` 的 Mistral 键名重映射，`video_url` 零命中；`types.ts:896-897` 只在 OpenRouter provider 偏好的 `max_price.audio` 提到 audio | 主检出 `tmp/sources/pi-3390bd9.tar.gz`（SHA-256 `29b35ae69e9cc7696cfdd0992e157892dfedc857c50762f49d752584358e4163`，解包于 `tmp/sources/extracted/pi/`） | — | 对[既有研究结论](../../../model-request-transport-sources/research.md#pi-ai-能承载的内容只有文本思考图工具调用四类语音与视频没有载体非视觉模型的图会在出门时被静默换成占位文本)的**复核未变**；其「OpenRouter 是否接受音视频，本轮未核实」由本页 F1–F5 **补充** |
| F14 | 本包现状：`stream.ts:222` 对 delta 里非空 `images`／`audio` 抛 `SseProtocolError`（输出侧），十款 `outputModalities` 皆为 `["text"]`，输出侧不受 R-C 影响 | 执行仓库 `976d4730` | — | — |
| F15 | omne-next `6263fed5`：`omne_openrouter`（0.3.0）`omne_openrouter/chat_models.py:2724-2747` `_convert_video_block_to_openrouter`（`url` → `video_url.url`；base64 → `data:{mime_type\|video/mp4};base64,…`；无大小检查）、`:2824-2858` `_convert_audio_block_to_openrouter`（严格 base64 非空；`mime_type→format` 表 `audio/pcm→pcm16, audio/wav→wav, audio/mpeg\|audio/mp3→mp3, audio/flac→flac, audio/ogg→ogg`；允许显式 `format`，与 mime 冲突即 `ValueError`）、`:2749` 文件块 → `file`；`:2795-2820` 按 LangChain 数据块 `type` 分派 | 本机 `/data/qiwei/repos/omne-next`（HEAD `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`，2026-09-12） | 模块 docstring："Native P0 audio intentionally says `audio/pcm` *and* `pcm16`" | Python／LangChain 实现，**没有非测试代码解析 `audio_tokens`／`video_tokens`**（`grep` 零命中）；`omne_harness_agentic/context/tokens.py:94` 把 audio/video 与 image 一起记固定 1200 token 预算，注释明写 "neither carries its duration here"——预算是保守占位，不是计量 |
| F16 | Google 官方（Gemini API 原生，非 OpenRouter）：静态模式 1 FPS 采样，每帧 258 token（`media_resolution` 为 low 时 66），音轨 32 token/秒，合计「约 100 token/秒（默认 low）或约 300 token/秒（high）」；tokens 页另写 "Video: 263 tokens per second (applies to static processing)"、"Audio: 32 tokens per second"（与 258+32 相差 5，两页未互相解释）；自定义 fps 按比例；agentic 模式无公式；请求总量 >20 MB 须用 Files API；1M 上下文默认 low 可到 3 小时、high 1 小时 | [tokens 页](audio-video-carriage-2026-09-30/google-tokens.html.gz)、[视频理解页](audio-video-carriage-2026-09-30/google-video-understanding.html.gz)、[音频理解页](audio-video-carriage-2026-09-30/google-audio.html.gz)（05:23Z，gzip 归档，原始 SHA 见来源清单） | "Always use the Files API when the total request size (including the file, text prompt, system instructions, etc.) is larger than 20 MB" | 原生 API 的说法；OpenRouter 的 `video_url` schema 没有 `media_resolution`，经 OpenRouter 实际取哪一档、`processing` 之外还传不传分辨率，**未取得** |
| F17 | Moonshot 官方 Chat API 页：`video_url.url` 为 "Video content specified via base64 encoding or file id"，可 `data:video/mp4;base64,…`；"usage.prompt_tokens is always the total number of input tokens"；模型总览页 "videos should be no larger than 1080p" | [Moonshot Chat API 页](audio-video-carriage-2026-09-30/moonshot-chat-api.html.gz)（05:23Z） | — | 原生 API；经 OpenRouter `moonshotai/mxfp4` 路由是否同样接受 data URL、`prompt_tokens` 是否同义，未验 |
| F18 | Z.ai 官方 GLM-5.3-Flash/FlashX 页：只有 "Input Modality Video / Image / Text / File"，无线上形状、上限或计量 | [Z.ai 页](audio-video-carriage-2026-09-30/zai-glm-5.3-flash.html.gz)（05:23Z） | — | 视频的字节、时长、token 规则**未取得** |
| F19 | 本地契约：`data.content-blocks/v2` 内容块恰七类，**`kind: "video"` 不是合法取值**——视频是 `FileBlock`，模态由 `attachment.mediaType` 判（[契约](../../../../design/spec/data/content-blocks/v2/contract.md#s-6-模态由媒体类型判定)第 156–160、335、551 行）；`VoiceBlock.data` 是 `InlineData \| AttachmentRef`；`plan.ts:102` 只对 `'inline' in block.data` 的图投影；传输的函数面「不读日志与存储」（设计「公开面」段） | 执行仓库 `976d4730`：`packages/core/content-blocks/src/types.ts:77-93` | — | 这决定了视频字节不会以内联形式到达 `planRequest`，是承载形状必须先答的问题之一 |

### 十款在目录里的声明

来源：F9 的目录快照与 F10 的 endpoints 记录；`input_modalities` 逐字照抄目录，单价为 USD/token。

| 型号 | 目录 `input_modalities` | 本仓库 `inputModalities` | `context_length` | `prompt` / `completion` | 媒体计价键 | 固定路由 |
|---|---|---|---|---|---|---|
| `google/gemini-3.8-flash` | text, image, video, file, audio | audio, image, text, video | 1,048,576 | 0.00000075 / 0.00000375 | `image`、`audio`（各 = prompt）、`input_audio_cache` | `google-ai-studio` |
| `google/gemini-3.7-flash` | text, image, video, file, audio | 同上 | 1,048,576 | 0.00000075 / 0.00000375 | 同上 | `google-ai-studio` |
| `qwen/qwen3.8-max-0902` | text, image, video | image, text, video | 1,000,000 | 0.000002 / 0.000006 | 无 | `alibaba` |
| `qwen/qwen3.8-max-prime` | text, image, video | 同上 | 1,000,000 | 0.000004 / 0.000012 | 无 | `alibaba` |
| `qwen/qwen3.8-flash` | text, image, video | 同上 | 1,000,000 | 0.00000015 / 0.00000047 | 无 | `alibaba` |
| `qwen/qwen3.8-27b` | text, image, video | 同上 | 1,000,000 | 0.00000042 / 0.000003 | 无 | `alibaba` |
| `qwen/qwen3.7-flash` | text, image, video | 同上 | 1,000,000 | 0.00000003 / 0.00000013（32k、256k 起有 `overrides`） | 无 | `alibaba` |
| `moonshotai/kimi-k3` | text, image, video | image, text, video | 1,048,576 | 0.000003 / 0.000015 | 无 | `moonshotai/mxfp4` |
| `z-ai/glm-5.3-flash` | text, image, video | 同上 | 1,048,576 | 0.00000015 / 0.0000005 | 无 | `z-ai/fp8` |
| `z-ai/glm-5.3-flashx` | text, image, video | 同上 | 1,048,576 | 0.00000037 / 0.00000125 | 无 | `z-ai/fp8` |

Google 两款目录多出 `file`；`file` 不是本项目四种模态之一（F19 的契约把四种之外的文件当引用），本页不把它记为声明缺口。

## 未取得

- OpenRouter 对音频／视频的任何字节、时长、数量上限（F6）；`audio` 计价单位与视频的计价方式（F9）；`prompt_tokens` 是否已含 `audio_tokens`／`video_tokens`（F8）。
- 经 OpenRouter 路径 Google 实际采用的 `media_resolution` 档位，以及 OpenRouter 是否透传除 `processing` 外的视频处理参数（F16）。
- 阿里云 Model Studio 的视频／音频理解文档：`alibabacloud.com/help/en/model-studio/video-understanding`（3175 字节脚本壳）、`help.aliyun.com/zh/model-studio/video-understanding`（24899 字节、正文客户端渲染）、`…/qwen-vl-video` 三次抓取都没有正文；Qwen 五款视频的帧率、token 规则、字节上限**未取得**。
- Moonshot K3 视频指南页 `platform.moonshot.ai/docs/guide/use-kimi-k3-video` 重定向到模型总览；除 "no larger than 1080p" 外无时长、字节、token 规则（F17）。
- Z.ai 的视频线上形状与任何上限（F18）。
- 十条路由中任何一条对 `input_audio`／`video_url` 的**真实响应**（接受、拒绝的状态码与错误体、`usage` 实际字段）：本页未发送请求。
- omne-next 是否曾在真实路由上验证过它的音视频映射：该仓库非测试代码没有 usage 字段解析，测试夹具 `omne_harness/tests/fixtures/state_runtime_model_budget.py:71-91` 把 `input_audio`／`video_url` 列在一份禁用键清单里，用途未追；本页不据此下结论。

## 对 realization 增量候选的输入清单

下列是设计前必须先定的事项，按事实指出每项撞到哪条约束；**本页不给选项的取舍**。

**承载形状**

- 语音块到 `input_audio`：需要 `mediaType → format` 的映射（F2 的格式串没有 IANA 对应，`audio/mpeg` 与 `mp3`、`audio/pcm` 与 `pcm16` 都要人定；omne-next F15 有一张五行表可作参照）；`pcm16`／`pcm24` 没有采样率字段，裸 PCM 的解释靠谁保证（F2）。
- 语音块的 `data` 是 `InlineData | AttachmentRef`，视频只以 `FileBlock.attachment` 到达（F19）；`planRequest` 是不读存储的纯函数——附件字节在哪一层、由谁读进请求体，先于任何投影代码。
- 视频只能以 `data:` URL 走 Google AI Studio（F4）；`video_url.url` 直接放远端 URL 只对「明确支持的提供者」有效，其余三家是否接受 URL 未取得（F4、F17）。
- Google 专属的 `processing` 字段传不传、由谁定（F3、F7）；agentic 模式的 encrypted `reasoning_details` 回程是否被现有 `opaque` 回放覆盖（F7）。
- 已有 `transcript` 的语音块现在已按文本投影（`plan.ts:100-101`，PF-013 §5.11）；新承载只涉及无 transcript 的语音与视频，两条路径的优先级要写明。

**上限**

- 官方没有任何上限（F6）；`inputConstraints` 只有 `maxImageBytes`（`definitions.ts`）。音视频的字节／时长上限是本项目自设（并写明来源为「未取得」）还是 `unknown`，以及 Google 原生 20 MB 请求总量规则（F16）是否作为 OpenRouter 路径的保守界，都要先定。
- 视频 `data:` URL 的 base64 膨胀（4/3）落在请求体，与 `upstreamInputLimits.maxRequestBytes`（当前多为 `unknown`）的关系。

**计量策略**

- Google：离线公式存在但经 OpenRouter 有 66 vs 258 token/帧的档位歧义与 258+32 vs 263 的文档不一致（F16），agentic 模式无公式；能否声明 `estimated` 取决于真实 usage 校准，与现有「无 holdout 即写明无误差界」的先例（R-B）如何衔接。
- Qwen／Moonshot／ZAI：没有取得任何公式（未取得节）；带音视频的输入在这三家只能 `unavailable` 或靠真实 usage 校准。
- 读哪些 usage 字段：`prompt_tokens_details.audio_tokens`／`video_tokens` 是否出现、是否已含于 `prompt_tokens`（F8）；费用侧 Google 有 `audio` 单价、全目录无 `video` 单价（F9、F11、F12）——`account` 增量与费用来源的落点先定。
- 目录里 `audio` 键的计价单位未定义（F9）；把它当 per-token 是假设。

**失败分流**

- 声明了模态但路由拒绝（例如 `qwen3.8-27b` 的非 `alibaba` 提供者、AI Studio 收到非 YouTube 的 URL、超过未公开的大小上限）：是 `planRequest` 的哪个 `rejected` 值、还是 `sendRequest` 的 `http_status`／带内错误；`require_parameters: true` 对媒体 part 是否起作用未取得。
- 现有 `modality_not_carried` 在采用前保持不变（R-C）；采用后对「声明含 video 但块是 `file` 引用且附件不可读」这类局部失败要有独立成因。

## 来源清单

原件与校验：[`audio-video-carriage-2026-09-30/`](audio-video-carriage-2026-09-30/)，逐文件 URL、抓取时间、方法与 SHA-256 在
[`sources.json`](audio-video-carriage-2026-09-30/sources.json)，目录内全部文件的 SHA-256 在 [`SHA256SUMS`](audio-video-carriage-2026-09-30/SHA256SUMS)。
未归档但记了整页 SHA 的：OpenRouter Chat Completion API 整页（`create-a-chat-completion.md`，191476 字节，
SHA-256 `65f37089c098f34df4df11bbd5f638302a1c37a22fa75ed4bf54b18710a902dd`，三份 YAML 摘录取自它）；公开目录整份
（762016 字节，SHA-256 `cca2c42a08a28baafd788be6e7059e75d5b2062ce38b5a5c37bfc3631d21aacc`，十行投影取自它）。
Google、Moonshot、Z.ai 的 HTML 以 `gzip -9 -n` 归档，`sources.json` 的 `rawSha256` 是解压后原文的 SHA-256。
钉住的 pi 源与 omne-next 副本不复制进本目录：前者按主检出 `tmp/sources/SHA256SUMS`，后者按其 Git HEAD。

一手与二手：本页全部事实来自实际抓取的原文或本机源码；没有采用搜索摘要。三处阿里云页面与 Moonshot 视频指南页
按上节记为未取得，不以相近页面顶替。

## 重核触发

OpenRouter 的多模态文档、Chat Completion API schema 或十款的 endpoints 记录变化；pi 换版本；本项目内容块契约增删块类；
任何一条固定路由首次收到真实的 `input_audio`／`video_url` 响应——那一刻本页 F6、F8、F9 的「未取得」应由实际观察接替。
