# 可复核的来源与观察

本页是索引与取证条件：每个来源的精确对象、取得方式、这一轮实际核到了什么、不能据此声称什么。
逐项对照表（D-019 比较门、PF-013 承载表、0.85.1→0.86.1 差分全文）在
[当轮报告](reports/2026-09-23-model-request-transport.md)，本页不复制。当前结论见 [research.md](research.md)。

本轮**全部离线**：没有发出任何网络请求，没有调用 OpenRouter，没有重跑 minimal-runtime 的测试。
凡「测试通过」「真实请求对账一致」之类的说法，都是实施线自己的台账记录，本轮只读了测试源码与台账，没有复跑。

## 取证条件总览

| 记录 | 精确对象与版本 | 来源立场 | 证据强度 |
|---|---|---|---|
| [E1](#e1-d-019-与旧评估) | D-019 决定正文；`tmp/model-provider-reuse-pi-ai.md`（2026-09-16） | 本项目决定与实施调研自述 | 决定文本是一手；旧评估里的真实请求结果本轮未复跑 |
| [E2](#e2-pi-ai-0861-源码) | `earendil-works/pi` @ `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`，`packages/ai` = `@earendil-works/pi-ai@0.86.1` | 作者源码与 CHANGELOG（作者自述） | 源码是行为事实；CHANGELOG 只证明作者宣称了什么 |
| [E3](#e3-0851--0861-差分) | 0.85.1 发布物 `dist/api/openai-completions.js` 对 0.86.1 源码 `src/api/openai-completions.ts` | 本轮构造的机械差分 | 强，但只覆盖这一个文件；0.86.1 的**发布物**本机没有 |
| [E4](#e4-本仓库钉住的-0851-与补丁) | `@earendil-works/pi-ai@0.85.1` 安装物、`patches/@earendil-works__pi-ai@0.85.1.patch`、目录数据 `openrouter.json` | 发布物字节 + 本项目补丁 | 强 |
| [E5](#e5-minimal-runtime-的-modelexecution) | `feat/minimal-runtime@d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac` 的 `packages/model/execution` | 本项目实施线源码（**未进 main，不是证据链上的实现**） | 源码读数强；测试结果为实施线自述 |
| [E6](#e6-minimal-runtime-的-modelllm) | 同一提交的 `packages/model/llm`（DSH `c291e79` 的定向 fork） | 同上 | 强 |
| [E7](#e7-minimal-runtime-施工台账) | `tmp/minimal-runtime-execution.md`、`tmp/minimal-runtime-delivery.md` | 实施线台账自述 | 弱：只证明台账这么写，不证明结果 |
| [E8](#e8-dsh-c291e79-的-llm-包与作者笔记) | `deepseek-ai/deepseek-harness` @ `c291e7961a515f6d7af9304e7fd1d257929aef26` | pi-ai 的另一个采用方（同行）源码与作者笔记 | 强：取舍理由是作者一手写下的 |
| [E9](#e9-产品正文) | PF-013 rev 4、PF-009 rev 4、PF-012 rev 7、PF-001 rev 15、SYS-LLM | 本项目已接受的产品正文 | 需求方权威，不是事实证据 |
| [E10](#e10-pi-durable-0861) | `@earendil-works/pi-durable@0.86.1`（同一 pi 提交） | 作者规格 + 内存实现 | 强（负面结论：没有模型请求耐久） |

源码归档与校验：`/data/qiwei/repos/omne-harness-lite/tmp/sources/`，`pi-3390bd9.tar.gz`
SHA-256 `29b35ae69e9cc7696cfdd0992e157892dfedc857c50762f49d752584358e4163`，
`dsh-c291e79.tar.gz` SHA-256 `f08cfc86cb05d4186be3319670e2756375cb2788b3d2164dd7f30b885f350860`（该目录 `SHA256SUMS`）。
下文 `pi/…` 指解压目录 `tmp/sources/extracted/pi/`，`dsh/…` 指 `tmp/sources/extracted/dsh/`，
`MR/…` 指 `/data/qiwei/repos/omne-harness-lite/.worktrees/minimal-runtime/`。

## E1 D-019 与旧评估

当前传输采用及比较义务由 [pi-ai-transport 设计](../../design/realization/packages/model/pi-ai-transport/design.md) 与[验证方法](../../design/realization/packages/model/pi-ai-transport/verification.md)维护；本研究不授予采用或逐型号认证。

- 传输复用只取 OpenRouter provider、模型目录、协议请求和流/工具解析基线并定向 fork；不整体接入 DSH 设置/凭据层，不用目录估价冒充实际费用。
- owner 责任不转移。最大生成长度字段、`store`、推理努力度和 `strict` 的请求差异不能默认等价，须按所选模型核对。
- 比较范围包括模型/provider/order/禁用回退/要求参数、原始工具参数与回传 ID、流终态与无尾随事件、实际 provider 与响应 ID、`usage.cost` 质量、私有 replay、重定向、错误、断流、abort 和无隐藏重试。局部样本不覆盖全部路由、成本形状、BYOK、缓存、折扣、故障、取消或迟到结果。
- 0.85.1 的有限样本请求差异为 pi-ai 使用 `max_completion_tokens=16`、`store=false`、`reasoning.effort=none`、`strict:false`，直接传输使用 `max_tokens=16`。此观察不支持任何 0.86.1 或当前代码上的等价结论。

本页后续源码观察仅适用于各节明确标出的上游修订；当前采用改变时须由实际拥有者复核相应差异。每次执行与比较过程留本工作树 tmp。

## E2 pi-ai 0.86.1 源码

- 消费对象：[research.md](research.md) 里关于 0.86.1 行为的各条（执行方与费用、Context 形状、`x-session-id`、重试与回退、状态码、凭据、模态、费用来源、fork 维护面）。
- 来源与精确修订：`pi/packages/ai/package.json:3` `"version": "0.86.1"`；提交 `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`。
- 来源立场：作者源码（行为事实）与 `CHANGELOG.md`（作者自述）。
- 取得方式：直接读源码；行号为 `cat -n` 行号。
- 实际观察（按文件）：
  - `src/api/openai-completions.ts`
    - `:308-324` 输出对象 `provider: model.provider`（路由名），没有从 chunk 取实际执行方的字段。
    - `:344-352`、`:751-794` 每次 `stream()` 调用都 `new OpenAI({apiKey, baseURL, fetch, defaultHeaders})`，客户端不跨请求复用。
    - `:365-377` SDK 以 `maxRetries: 0` 调用，外包 `retryProviderRequest`，重试次数取 `options.maxRetries`；只包住 `create().withResponse()`。
    - `:378-379` `onResponse` 只拿到 `status` 与 headers，随后推 `start` 事件——`start` 在任何内容 chunk 之前。
    - `:553-564` 流循环：`responseId ||= chunk.id`；`chunk.model` 只在与请求不同时进 `responseModel`；`chunk.usage` 交给 `parseChunkUsage`。**没有读 `chunk.provider`、`chunk.is_byok`、`usage.cost`**。
    - `:646-650` 工具参数每个增量都 `parseStreamingJson(partialArgs)` 回填 `block.arguments`。
    - `:682-697` 流结束判定：`signal.aborted`、`stopReason==="error"`、缺 `finish_reason` 均抛错。
    - `:701-723` catch：`stopReason = aborted|error`，`errorMessage = formatProviderError(normalizeProviderError(error))`，再追加 `error.metadata.raw`；推 `error` 事件。
    - `:770-772` `sessionId && compat.sendSessionAffinityHeaders` 且格式为 openrouter 时写 `x-session-id` 头。
    - `:828-842` 默认 `stream_options.include_usage`；`supportsStore` 时 `store=false`；`maxTokensField` 决定 `max_tokens` 或 `max_completion_tokens`。
    - `:931-940` `thinkingFormat==="openrouter"` 时发 `reasoning.effort`；未给努力度且 `thinkingLevelMap.off !== null` 时发 `reasoning.effort = off ?? "none"`。
    - `:980-983` `model.compat.openRouterRouting` 原样作为 `provider` 字段。
    - `:1495-1503` 工具定义在 `supportsStrictMode !== false` 时带 `strict`。
    - `:1509-1550` `parseChunkUsage` 只收 token 字段，末尾 `calculateCost(model, usage)`（`:1548`）。
    - `:1595`、`:1635`、`:1641`、`:1654-1655`、`:1664`、`:1669` OpenRouter 的自动检测：`supportsStore: true`、`maxTokensField: "max_completion_tokens"`、
      `thinkingFormat: "openrouter"`、`supportsStrictMode: true`、`sendSessionAffinityHeaders: true`。
  - `src/utils/provider-retry.ts:105-125`：`maxRetries = options.maxRetries ?? 0`（`:109`）；可重试条件 408/409/429/≥500/无状态（`:23-35`）。
  - `src/utils/error-body.ts:38-65` 能抽出 HTTP 状态；`:128-135` 只把它拼进消息文本（`"<status>: <body>"`）。
  - `src/types.ts`
    - `:131-184` `ProviderRequestOptions`：`signal`、`apiKey`（`:135`）、`fetch`（`:141`）、`onResponse`、`headers`、`timeoutMs`、`maxRetries`（`:175`）。`:217` `sessionId`。
    - `:364-394` 内容类型：`TextContent`、`ThinkingContent`、`ImageContent`（base64 + mimeType）、`ToolCall`。
    - `:396-417` `Usage.cost` 五个数字字段，没有来源或质量字段。
    - `:509-513` `UserMessage.content` 只允许文本与图；`:515-537` `AssistantMessage` 内容只允许文本/思考/工具调用，**没有状态码字段**；`:539-551` 工具结果内容文本与图。
    - `:617-634` 公开 `Context` 仍接受 `systemPrompt`/`tools`，provider 面改收 `TranscriptContext`。
    - `:652-668` 事件协议：`start`、`text_*`、`thinking_*`、`toolcall_*`、`done`、`error`。
    - `:860-927` `OpenRouterRouting`：`order`、`allow_fallbacks`、`require_parameters`、`only`、`ignore`、`sort`、`max_price` 等。
    - `:959-992` `Model`：`input: ("text"|"image")[]`（`:971`）、`cost`、`contextWindow`、`maxTokens`；**没有输出模态字段**（只有 `ImagesModel` 有 `output`，`:994-999`）。
  - `src/models.ts:900-920` `calculateCost` 纯按目录费率乘 token；`:648-677` `applyAuth`：请求级 `apiKey` 优先，未给时回落到凭据存储与环境；`:703-710` `streamSimple` 先 `normalizeContext` 再惰性解析 provider。
  - `src/api/transform-messages.ts:12-13`、`:35-51`：模型 `input` 不含 `image` 时，把用户图与工具结果图替换成占位文本 `"(image omitted: model does not support images)"`。
  - `src/providers/openrouter.ts:8-27`：OpenRouter provider 同时挂 `anthropic-messages` 与 `openai-completions` 两个 API。
  - `CHANGELOG.md:5-14`（0.86.1）、`:16-55`（0.86.0）：`:20` provider 面 `Context`→`TranscriptContext` 破坏性变更；`:21` `ToolCall.arguments` 限为 JSON 值；
    `:45` OpenRouter 在启用 prompt caching 时从 `sessionId` 发 `x-session-id`；`:14` Cerebras strict 修复。全文 grep `8940`、`servingProvider`、`is_byok`、`upstream_inference` 在 `pi/packages` 下**零命中**。
- 支持范围：0.86.1 这一个提交的行为。**不支持**：OpenRouter 线上实际返回什么（未发请求）；issue #8940 的当前状态（未联网）。
- 后续核对：pi-ai 换版本时 grep 本页 `0.86.1` 与 `3390bd9`。

## E3 0.85.1 → 0.86.1 差分

- 消费对象：research.md「补丁在 0.86.1 上仍然需要」「破坏性变更落在 provider 面」「x-session-id」三条；报告 §2。
- 来源：旧版 `MR/tmp/pi-ai-spike/openai-completions.original.js`（0.85.1 未打补丁的发布物，1356 行，与安装物 `dist/api/openai-completions.js` 同源）；
  新版 `pi/packages/ai/src/api/openai-completions.ts`（1723 行）。
- 取得方式（可重放）：Node `v24.18.0` 的 `module.stripTypeScriptTypes(src, {mode:'strip'})` 去掉 0.86.1 的类型；
  两边用 `MR/node_modules/.bin/prettier --no-config --print-width 120 --parser babel` 统一格式；删注释行与空行后 `diff`，共 191 行差异。
- 实际观察：差异只在四处——① 导入扩展名 `.js`→`.ts`，新增 `utils/text.ts`、`utils/transcript.ts`；
  ② `context.systemPrompt`/`context.tools` 改为从 transcript 的 system 消息推导（`resolveTranscript`、`resolveTranscriptTools`），删除 Kimi `deferredToolsMode`；
  ③ `detectCompat` 里 OpenRouter 的 `sendSessionAffinityHeaders` 由 `false` 变为 `isOpenRouter`，新增 `supportsMidConvo*` 两项；
  ④ Cerebras 关闭 strict。**流循环、`parseChunkUsage`、`calculateCost` 调用、输出对象构造、`retryProviderRequest` 调用在两版之间没有差异。**
  `utils/provider-retry` 两版逐行比对一致（0.85.1 `dist/utils/provider-retry.js:1-93` 对 0.86.1 `src/utils/provider-retry.ts:1-125`，仅类型标注不同）。
- 支持范围：这两个文件。**不支持**：0.86.1 发布物（dist）与源码是否逐字对应——本机只有 0.85.1 与更早的 0.82.1 发布物（全盘 `find` 只找到 `@earendil-works+pi-ai@0.85.1*` 与另一仓库的 `@0.82.1`）；其它 API 文件（`anthropic-messages` 等）未做差分。
- 后续核对：拿到 0.86.x 发布物后，对 dist 重做同一差分并试打补丁。

## E4 本仓库钉住的 0.85.1 与补丁

- 消费对象：research.md「补丁仍然需要」「只放行非推理路由」「is_byok」「真实费用」「fork 维护面」各条。
- 来源：`MR/packages/model/execution/package.json:29` `"@earendil-works/pi-ai": "0.85.1"`；`MR/pnpm-workspace.yaml:6` 注册补丁；
  `MR/patches/@earendil-works__pi-ai@0.85.1.patch`（73 行）与 `MR/patches/README.md`；
  `MR/tmp/pi-ai-spike/`（`compare.mjs`、`compare-both.mjs`、`compare-live.mjs`、`actual-cost-serving-provider.patch`、`openai-completions.original.js`）；
  目录数据 `MR/tmp/pi-ai-spike/node_modules/@earendil-works/pi-ai/dist/providers/data/openrouter.json`（164457 字节）。
- 实际观察：
  - 补丁只动 `dist/api/openai-completions.js` 与 `dist/types.d.ts` 两个编译产物（README 明说 source map 不再对应）。
    在输出对象上加 `openRouter:{servingProvider, servingModel, actualCost, actualCostSource:"openrouter_usage"|"unknown", isByok, upstreamInferenceCost}`（补丁 `:9-18`），
    在流循环 `responseId ||= chunk.id` 之后逐 chunk 回填（`:26-50`）；原 `usage.cost` 保持目录估价。
  - 补丁每遇到一次 `chunk.usage` 就重写 `actualCost` 与 `actualCostSource`（`:36-41`）：后一个不带 `cost` 的 usage chunk 会把前面的 actual 改回 unknown。
  - spike 目录里的 `actual-cost-serving-provider.patch` 是更早的一版（把 `actualCost` 塞进 `usage`），已被正式补丁取代，只作沿革。
  - `compare-live.mjs:52-55` 记录请求体的 `max_tokens`/`max_completion_tokens`/`store`/`reasoning` 四个字段，脚本只对 `openai/gpt-4o-mini` 一条路由。
  - 目录计数（`node` 读 JSON）：`openai-completions` 351 条（`input` 仅文本 129、文本+图 222），其中 `reasoning:true` 270、非推理 81；`anthropic-messages` 15 条（全部 `anthropic/*`，`baseUrl` 为 `https://openrouter.ai/api`）。全部 351 条 completions 的 `compat.thinkingFormat` 为 `openrouter`。
  - 0.85.1 `dist/api/transform-messages.js:1-2` 有与 0.86.1 相同的图占位文本；`dist/api/openai-completions.js:1309` `sendSessionAffinityHeaders: false`。
- 支持范围：0.85.1 发布物与本项目补丁。补丁未覆盖 `anthropic-messages.js`（`:417`、`:592` 同样调用 `calculateCost`）。
- 后续核对：换 pi-ai 版本时 grep `0.85.1`。

## E5 minimal-runtime 的 model/execution

- 消费对象：research.md「比较门」「只放行非推理路由」「单独中断与首 token」「recover 与 codec」「八个成因」「凭据」「真实费用」「预算」「双层包裹」各条；报告 §1、§3。
- 来源：`MR/packages/model/execution/` @ `d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac`（分支 `feat/minimal-runtime`，未进 main）。
- 来源立场：本项目实施线的候选实现；其 `design.md:3-10` 自述「候选实施交接，round-3 公共编码形状待复评」「既不是接受决定，也不是发布或符合性证明」。
- 实际观察：
  - `src/pi-ai-transport.ts`
    - `:34-116` `history()`：只接受字符串内容（`:51-53` 非文本历史拒绝）、system 只允许在开头（`:40-48`）；构造公开 `Context{systemPrompt, messages, tools}`。
    - `:165-212` `dispatch`：发网前核对 model/order/allow_fallbacks/require_parameters（`:175-182`）；按实例上的 `credentialRef` 解析一把凭据（`:183-186`）；
      每次 `createModels()` + `setProvider(openrouterProvider())`（`:187-188`）；目录条目不是 `openai-completions` 或 baseUrl 不符即拒（`:190-195`）；
      **`found.reasoning` 为真即以 `purpose_unavailable` 拒绝**（`:196-201`）；强制 `openRouterRouting:{order:[providerId], allow_fallbacks:false, require_parameters:true}`（`:202-212`）。
    - `:227-256` `streamSimple` 传 `apiKey`、`maxRetries: 0`、`maxTokens`、`signal`；注入的 `fetch` 计数，第二次出站或 URL 不符即失败（`:237-243`），`redirect:'manual'`，3xx 拒绝并保留状态（`:245-253`）。
    - `:259-331` 事件映射：`text_delta`、`thinking_delta`→私有 chunk；工具参数自己累积原始字符串，只在 `toolcall_end` 时 `JSON.parse` 校验（`:288-305`）。**`toolcall_start`、`start` 不映射。**
    - `:326-338` 任何非本地错误都变成 `ModelExecutionError('stream_error'|'aborted', …)`，**不带 status**。
    - `:339-346` `servingModel`≠期望 model 或 `servingProvider`≠期望 provider 即 `route_violation`。
    - `:347-364` `Usage` 只放 `quality`、三项 token、`cost` 字符串、`completeness`；`isByok`、`upstreamInferenceCost` 在 `accounting()`（`:129-163`）里算出后**不进 Usage**。
  - `src/openrouter.ts`（直接 transport，对照组）：`:322-331` HTTP 非 2xx 抛 `http_error` 并带 `response.status`；`:363-384` 带内 `error` 取 `code`；`:230-253` `parseUsage` 把数字 `cost` 转 `String()` 后用 `/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/` 校验——`String(1e-7)` 是 `"1e-7"`，会被判 null，而此时只要 token 在就仍标 `quality:'actual'`（`:246`）。
  - `src/host.ts`
    - `:406-416` `createModelExecutionHost` 构造后立即 `recover()`；`:504-516` `recover()` 只对 `dispatched|closing` 记一条 `inspect_original_operation_required` 诊断。
    - `:563-577` `prepare` 只接 `purpose:'reply'`，无活探针的路由 `route_unavailable`。
    - `:774`、`:793-829` 每个 attempt 一个 `AbortController`；`requestStop(attempt, epoch, 'interrupt')` 只 abort 该 attempt。
    - `:1182-1190` `waitReleased` 对全部未结 attempt 发 interrupt；**没有按 Session 或 Run 批量停的入口**。
    - `:1225-1237` 每个私有 chunk 先 `privateSequences.append` 再发布，追加失败即 abort。
    - `:1272-1311` 失败分支：`outcome = aborted ? 'cancelled' : hasContent ? 'partial' : 'unknown'`，`hasContent` 只看 `text_delta|reasoning_delta`（`:1296-1298`）；
      `finish` 取 `error.code`；`usage` 恒为 `usageUnknown()`（`:1384`）。成功分支用 `hasBusinessContent`（`:350-355`，含 `tool_end`）。
    - `:1337-1343` 只有 `quality==='actual'` 且 `cost!==null` 才调 `guards.recordUsage`。
  - `src/ledger.ts:240-270` `recover()`：首次恢复把 `prepared|admitted|dispatched` 一律改成 `closing`；`:113-116` `DispositionCodec` 为注入接口。
    `src/publisher.ts:50-57` `ActiveFrameCodec` 为注入接口。
  - `src/types.ts:20-34` `RouteConfiguration` 把 `allowFallbacks: false`、`requireParameters: true` 写成字面类型；`:86-93` `Usage`；`:236-245` `ModelExecutionError{code, status?}`。
  - `src/cost-source.ts:168-182` `costMoney` 接受指数写法，`d79484d` 把配置的 scale 改为下限、不再截断实际费用位数。
  - 测试：`tests/pi-ai-transport.spec.ts:73-91`（推理路由零发网拒绝）、`:93-195`（工具往返、身份与费用、请求 `provider` 字段）、`:197`（缺 cost→unknown）、`:217`（参数分片与半截拒绝）、`:304`（执行方越界）、`:324-357`（302 拒绝、503 不重试且只断言 `code:'stream_error'`）；
    `tests/pi-ai-fork.spec.ts:89-153`（补丁字段含 `is_byok` 与 `upstream_inference_cost`）；
    `tests/durable.spec.ts:159-480` `it.each(['direct','pi-ai'])`：dispatched 先于网络、无 finish EOF→`unknown`、首内容前 abort→`cancelled`、重启不再发网。
    **没有**断言 `max_completion_tokens`/`store`/`reasoning`/`strict` 的测试；**没有**首 token 之后断流的 pi-ai 用例；**没有**流终态之后尾随事件的 pi-ai 用例。
- 支持范围：源码在该提交上的形状与测试覆盖的输入。**不支持**：测试确实通过（未复跑）；任何产品验收。
- 后续核对：`feat/minimal-runtime` 前移或合入 main 时重读。

## E6 minimal-runtime 的 model/llm

- 消费对象：research.md「双层包裹」一条。
- 来源：`MR/packages/model/llm/` @ `d79484d`；`UPSTREAM.md`、`provenance.json`（`commit c291e7961a515f6d7af9304e7fd1d257929aef26`、`archive_sha256 f08cfc86…`）。
- 实际观察：`package.json` 只导出 `./baseline`，依赖 `brand`、`media-content`、`values`，**不依赖 pi-ai**；`README.md` 自述「不是已接受产品能力契约的实现」。
  `src/types.ts:26-32` `LlmFailure{message, code, status?, providerRetryAfterMs?, requestId?}`；`:36-77` 块：text/reasoning/image/file/tool-call/tool-result；`:95-102` `TokenUsage` 无费用字段；`:106-120` `StreamChunk`。
  `model/execution/package.json` 的依赖里没有 `@omne-harness-lite/llm`；引用它的是 `session/session`、`agent/loop`、`tools/tools`（`grep` 结果）。
- 支持范围：包间依赖形状。
- 后续核对：同 E5。

## E7 minimal-runtime 施工台账

- 消费对象：research.md「比较门」「recover 与 codec」两条。
- 来源：`/data/qiwei/repos/omne-harness-lite/tmp/minimal-runtime-execution.md`（660 行）；`tmp/minimal-runtime-delivery.md`（660 行）。
- 实际观察：`execution.md:6` 13:03 UTC 切点：`d79484d` 保留实际费用 8 位小数、Model 包 50/50 测试；真实 OpenRouter 两次请求合计 USD 0.00009120。
  `:20` 第 3 行任务「partial」。`:87-118` fork 进展：`53004ab`/`63ffe33` 固定补丁、`927afb8` 接入、`bc16f97` 凭据端口、`506eb00` 耐久组合。
  `:385-386` i10 合入 HUB `2fa6ddf`，「`DispositionCodec`/`ActiveFrameCodec` 等待 round-3」。`:412-420`、`:440-447` round-2 `d197176`、round-3 `9a58ae2` 均被拒，迁移线进入全局诊断。
  `delivery.md:423` 用户拍板 fork 的原话与「隐藏重试、取消、错误、工具结果回传与私有 replay 逐项验证后才替换生产装配」。
  **任务提到的「i16 段落」在两份台账中都没有找到**：spoke 编号只到 i12/i14，`i16` 零命中；`execution.md:489` 的「16」是验收项 AC16（首次占位与零模型轮询，`planned`），与模型传输无关。
- 支持范围：实施线当时声称了什么。
- 后续核对：无；台账不再维护时以源码为准。

## E8 DSH c291e79 的 llm 包与作者笔记

- 消费对象：research.md「状态码」「八个成因」「凭据」「双层包裹」「fork 维护面」各条。
- 来源：`dsh/packages/llm/{llm,llm-pi-ai,llm-retry,token-meter}`，各 `package.json` `0.1.5-rc.2`；`llm-pi-ai/package.json:44` `"@earendil-works/pi-ai": "^0.85.1"`。
  作者笔记：`dsh/.agents/notes/archived/feature/2026-08-18-pi-ai-wire-compat-surface.md`、`2026-07-24-provider-retry-policies.md`、`archived/architecture/2026-08-03-pi-ai-declared-provider-catalog.md`。
- 来源立场：pi-ai 的另一个采用方，自述其取舍。
- 实际观察：
  - `llm-pi-ai/src/stream.ts:34-41` 注释：pi-ai 把捕获的错误压成 `error.message`，丢掉原 `Error` 与 `cause`；`:42-68` 于是按正则从文本里认 `401|403`、`429`、`413`、`400`、`5\d\d`、超时、断流。
  - `llm-pi-ai/src/adapter.ts:130` `maxRetries: 0`；`:348` 每次请求经自己的凭据接缝解析 key 后作为 `apiKey` 传入。
  - catalog 笔记：`replay.ts` 把 pi-ai 的 cost 元数据清零，「no consumer reports spend」；凭据刻意留在 pi-ai 之外（pi-ai 的 `envApiKeyAuth` 会回落到环境变量）。
  - wire-compat 笔记：pi-ai 按 provider id 与 baseURL 推断请求形状（developer 角色、`max_completion_tokens`、`store`、`stream_options`、`strict`），DSH 用逐字段 drift gate 把 34 个 compat 字段分成 offer/withhold，pi-ai 每加一个字段就让构建失败。
  - retry 笔记：拒绝「Provider-SDK retries」，理由是隐藏尝试会叠加预算、绕过步骤耐久边界、可能拼接或丢弃已流出的输出；
    `llm-retry/README.md:58`、`:115`：重试重跑失败的整个步骤，**失败尝试的半截输出从派生消息里丢弃**，不进模型上下文。
  - `token-meter/README.md` Summary：按会话日志重放估算 token 与上下文压力，不做账单级计数。
- 支持范围：DSH 这一个提交的做法与理由。**不支持**：DSH 做法在本项目下是否合适。

## E9 产品正文

- 来源：本 HUB `.meta_harness/design/product/`：
  [PF-013 rev 4](../../design/product/PF-013-model-profiles-and-invocation/design.md)（2026-09-22）、
  [PF-009 rev 4](../../design/product/PF-009-context-message-types/design.md)、
  [PF-012 rev 7](../../design/product/PF-012-agent-loop-and-run/design.md)、
  [PF-001 rev 15](../../design/product/PF-001-identity-scope-and-agent-constraints/design.md)；
  [SYS-LLM](../../design/foundation/cross-system-constraints/requirements.md#sys-llm)。
- 读到的条款行号（PF-013）：§4 档案 `:99-140`、模态 `:142-165`、模态投影 `:167-198`、转换件 `:200-231`；§5.2 `:338-362`；§5.4 `:385-482`；§5.5 `:484-524`；§5.6 `:526-554`；§5.7 `:556-616`；§5.10 `:678-706`；§5.11 `:708-770`；§5.12 `:772-844`；§5.13 `:846-918`；§6.16 `:1112-1123`。
  PF-009 块七类 `:217-236`，§5.6 `:552-622`。PF-001 §6.4 `:685-687`（使用成本按租户、到明细为止，不设预算）；决定 `decisions.md:28`（2026-09-17 用户直接裁决）。
- 支持范围：本轮用来对照的要求原文；不是事实证据。

## E10 pi-durable 0.86.1

- 来源：`pi/packages/durable/package.json:2-3` `@earendil-works/pi-durable@0.86.1`；`src/` 只有 `index.ts`、`memory-storage.ts`、`types.ts`；`docs/pico-v5.md:1-3`「This document is normative」，`:194`「Pico5 is not implemented yet」。
- 实际观察：`docs/pico-v5.md:1520-1532`：生成直接调 `models.streamSimple()`；进度按节流写入，崩溃可能丢未提交窗口；恢复把已提交的半截转成普通 interrupted/aborted 条目，再按任务阶段重试或终止。`:185-186` aborted/error/deferred 的 assistant 消息从后续请求中排除。
- 支持范围：pi 侧对「模型请求耐久」只有规格与内存实现。

## E11 OpenRouter 官方文档「Usage Accounting」（2026-09-23 抓取）

- 来源：主检出 `tmp/sources/extracted/openrouter-docs/use-cases_usage-accounting.html`（`sha256 2f4d882c…8443d`，2026-09-23T19:39Z 抓取自 `https://openrouter.ai/docs/use-cases/usage-accounting`）。网页无版本号，只能按抓取时刻钉。
- 原文（去标签后逐字）：「This information is included in the last SSE message for streaming responses, or in the complete response for non-streaming requests. No additional parameters are required.」「The `usage: { include: true }` and `stream_options: { include_usage: true }` parameters are deprecated and have no effect.」
- 响应 `usage` 对象的示例字段：`completion_tokens`、`completion_tokens_details.reasoning_tokens`、`cost`、`cost_details.upstream_inference_cost`、`prompt_tokens`、`prompt_tokens_details.cached_tokens`、`prompt_tokens_details.cache_write_tokens`、`prompt_tokens_details.audio_tokens`、`total_tokens`。原文说明「cached_tokens is the number of tokens that were read from the cache. cache_write_tokens is the number of tokens that were written to the cache」。费用单位原文为「Cost in credits」。
- 该页**未出现** `is_byok`，也**未提及**被取消/中断的流是否计费。

由此更新的观察：
- E2 里「fork 时要自己加 `usage.include`」不成立——现行文档说不需要参数、用量总在最后一个 SSE 块；fork 只需**读** `usage.cost` 与 `cost_details`。
- 四类 token 的上游名：`prompt_tokens`（含缓存读写？原文未明说 `prompt_tokens` 是否包含 `cached_tokens`——**待核实**）、`prompt_tokens_details.cached_tokens`（缓存读）、`prompt_tokens_details.cache_write_tokens`（缓存写）、`completion_tokens`。`data.call-accounts` 的「三项输入两两不相交」要在传输适配处按上游定义换算，换算规则待实测核实。
- `cost` 的单位是 credits，不是 USD；`cost_usd` 的换算（1 credit 是否恒等 1 USD）**待核实**，归提供者设计。
- `is_byok` 与被中断请求是否计费仍待核实（此页无）。
