# 模型请求运行时：pi-ai 传输、D-019 比较门与 minimal-runtime 的落点

- 调查对象与日期：`@earendil-works/pi-ai@0.86.1`（pi `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`）源码；
  本仓库钉住的 `@earendil-works/pi-ai@0.85.1` 发布物与补丁；`feat/minimal-runtime@d79484d` 的 `packages/model/{execution,llm}`；
  DSH `c291e7961a515f6d7af9304e7fd1d257929aef26` 的 `packages/llm/*`。2026-09-23，全部离线取证。
- 消费者：[D-019 的比较门现状补记（2026-09-23）](../../design/record/decisions/model-provider-pi-ai-fork/gate-status-2026-09-23.md)（已落）；本程块 C 的架构读数（待出现）。
- 最近核对：2026-09-23 / 上列版本（首轮）。
- 当前结论：D-019 的两处丢失（实际执行方、实际费用）在 0.86.1 上原样存在，补丁仍要；
  minimal-runtime 的 pi-ai 传输只闭合了非推理文本/工具的正常路径，比较门里的私有 replay、请求字段按模型实测、
  状态码、首 token 之后断流都还开着；PF-013 的首 token 重发规则、八个成因、重试挂件、按范围取凭据在现有代码里都没有落点。
  没有做任何真实网络请求，OpenRouter 线上行为与 issue #8940 的状态均未核实。

## 问题与区分条件

七个问题：D-019 比较门逐项做到了哪；0.85.1→0.86.1 有没有动 D-019 的前提、补丁还要不要；
PF-013 的运行时要求在「pi-ai 传输 + minimal-runtime host」上各落在哪；按范围取凭据要传输层做什么；
模态映射；真实费用从哪来、能否区分 unknown；短板与代价。

区分条件：凡是「pi-ai 做不到」的结论，都区分是**读遍相关源码没找到**还是**源码里有相反的写法**；
凡是「minimal-runtime 做到了」的结论，都区分是**源码与测试源码里看得到**还是**只有施工台账这么说**——
后者本轮没有复跑，只作线索。minimal-runtime 未进 main，它的形状**不是本项目证据链上的实现**，只作为「这样接会遇到什么」的样本。

## 证据入口

- D-019 原文与 2026-09-16 旧评估：[E1](evidence.md#e1-d-019-与旧评估)
- pi-ai 0.86.1 源码逐文件读数：[E2](evidence.md#e2-pi-ai-0861-源码)；与 0.85.1 的机械差分：[E3](evidence.md#e3-0851--0861-差分)
- 0.85.1 安装物、补丁与目录计数：[E4](evidence.md#e4-本仓库钉住的-0851-与补丁)
- minimal-runtime 源码与测试：[E5](evidence.md#e5-minimal-runtime-的-modelexecution)、[E6](evidence.md#e6-minimal-runtime-的-modelllm)；台账：[E7](evidence.md#e7-minimal-runtime-施工台账)
- DSH 对 pi-ai 的包法与作者笔记：[E8](evidence.md#e8-dsh-c291e79-的-llm-包与作者笔记)
- 产品正文条款：[E9](evidence.md#e9-产品正文)；pi-durable：[E10](evidence.md#e10-pi-durable-0861)
- 逐项表（比较门、PF-013 承载表、差分细节）：[当轮报告](reports/2026-09-23-model-request-transport.md)

## 当前结论

### D-019 的比较门在 minimal-runtime 上只闭合了文本/工具正常路径的那一半

[D-019](../../design/record/decisions/model-provider-pi-ai-fork/decision.md) 列了十五项比较门（`decision.md:51-53`），外加「请求差异须按所选模型实测」这条保留前提（`:46-48`）。
在 `d79484d` 的源码与测试源码里看得到落点的：模型/provider/order/禁用回退/要求参数（发网前核对并强制写入）、原始工具参数与结果回传 ID、
实际 provider 与响应 ID、`usage.cost` 的质量标记（actual/unknown）、重定向拒绝、abort（首内容前）、无隐藏重试（出站计数 + `maxRetries:0`）、
无 finish 的 EOF。**没有落点的**：私有 replay（推理路由在发网前整条拒绝，所以根本没走到 replay）；
`max_completion_tokens`/`store:false`/`reasoning`/`strict` 四个请求差异没有任何按模型的测试或实测记录，只有 2026-09-16 对 `openai/gpt-4o-mini` 一条路由的旁观记录；
错误路径只断言 `code:'stream_error'`，不带状态码；首 token 之后断流、流终态之后的尾随事件没有 pi-ai 用例；
BYOK 字段被补丁捕获、被传输层丢弃。逐项表见[报告 §1](reports/2026-09-23-model-request-transport.md#1-d-019-比较门逐项现状)。

- 适用范围：`feat/minimal-runtime@d79484d` 的 `packages/model/execution`（源码与测试源码）；测试是否通过未复跑。
- 代价与不适用：这条结论只说「代码与测试里看得到什么」，不说那些落点在真实 OpenRouter 上成立——施工台账记录过的两次真实请求只覆盖 `openai/gpt-4o-mini` 经 OpenAI 一条路由。
- 撞上这条事实会怎样：把 minimal-runtime 的 pi-ai 传输当作「比较门已过」接进推理模型或多供应商路由，会在发网前以 `purpose_unavailable` 或 `invalid_route` 失败——这是它有意的失败关闭，不是缺陷。
- 来源：[E1](evidence.md#e1-d-019-与旧评估)、[E5](evidence.md#e5-minimal-runtime-的-modelexecution)、[E7](evidence.md#e7-minimal-runtime-施工台账)
- 最近核对：2026-09-23 / `d79484d`

### pi-ai 0.86.1 仍把实际执行方折成路由名、用目录费率覆盖实际费用，D-019 的补丁在 0.86.1 上仍然需要

0.86.1 `openai-completions.ts` 的输出对象固定 `provider: model.provider`（`:312`），流循环不读 `chunk.provider`、`is_byok`、`usage.cost`（`:553-564`），
`parseChunkUsage` 只收 token 并以 `calculateCost` 按目录费率算 `usage.cost`（`:1509-1550`）。对 0.85.1 发布物的机械差分显示，
这几段在两版之间**没有任何差异**（[E3](evidence.md#e3-0851--0861-差分)）。0.86.x 的 CHANGELOG 没有提到这两个字段，全仓 grep `8940`、`servingProvider`、`is_byok` 零命中。
补丁的两个插入点（输出对象字面量、`responseId ||= chunk.id` 之后）在 0.86.1 源码里都还在，但补丁打在 0.85.1 的编译产物上，行号与文件都要对 0.86.x 的发布物重生成。

- 适用范围：`openai-completions` 这一条 API 路径，0.85.1 发布物与 0.86.1 源码。
- 代价与不适用：0.86.1 的**发布物**本机没有，「源码无差异 ⇒ 发布物无差异」是推断；OpenRouter 的 `anthropic/*` 模型在目录里走 `anthropic-messages`（0.85.1 目录 15 条），那条路径同样调用 `calculateCost`，补丁不覆盖。
- 来源：[E2](evidence.md#e2-pi-ai-0861-源码)、[E3](evidence.md#e3-0851--0861-差分)、[E4](evidence.md#e4-本仓库钉住的-0851-与补丁)
- 最近核对：2026-09-23 / pi-ai `0.85.1` 发布物、`0.86.1` 源码
- 状态标记：上游 issue #8940 的开闭状态**待核实**（本轮不联网；源码事实是该问题在 `3390bd9` 未修）。

### 0.85.1 到 0.86.1 的破坏性变更落在 provider 面的 Context 形状上，经公开 streamSimple 入口传 Context 的调用方不受直接影响

0.86.0 把 provider 面的 `StreamFunction` 输入从 `Context` 换成 `TranscriptContext`，系统提示与工具声明改由 transcript 里的 system 消息承载（CHANGELOG `:20`；`types.ts:617-634`），
并把 `ToolCall.arguments` 限为 JSON 值（`:21`）。公开入口 `Models.streamSimple()` 仍收 `Context{systemPrompt, messages, tools}`，内部先 `normalizeContext`（`models.ts:703-710`）。
minimal-runtime 的 `history()` 正是经这个入口传公开 `Context`（`pi-ai-transport.ts:111-115`、`:227`），所以按源码推断不需要改调用形状。
包名 scope 两版都是 `@earendil-works/pi-ai`，没有变化；DSH 声明的 `^0.85.1` 在 0.x 语义下不会自动升到 0.86。

- 适用范围：`Models.streamSimple` 这一个入口；直接调用 provider 面 `stream`/`StreamFunction` 的代码（例如自写 provider）要跟着改。
- 代价与不适用：没有在 0.86.1 上实际编译 minimal-runtime，「不需要改」是按类型定义推断的；0.86.0 新增的「会话中途改系统提示与工具」在 OpenRouter 上默认折叠回首条 system（`supportsMidConvo*` 默认 false）。
- 来源：[E2](evidence.md#e2-pi-ai-0861-源码)、[E3](evidence.md#e3-0851--0861-差分)、[E5](evidence.md#e5-minimal-runtime-的-modelexecution)
- 最近核对：2026-09-23 / 同上

### 0.86.1 对 OpenRouter 默认改发 x-session-id 头，但只在调用方给 sessionId 且缓存未关时生效

0.85.1 `detectCompat` 里 OpenRouter 的 `sendSessionAffinityHeaders` 是 `false`，0.86.1 改为 `isOpenRouter`（`:1669`）；给了 `sessionId` 且 `cacheRetention !== "none"` 时，请求头会带 `x-session-id: <sessionId>`（`:342-343`、`:770-772`）。
`cacheRetention: "long"` 时 OpenRouter 还会收到 `prompt_cache_key`（取自 `sessionId`）与 `prompt_cache_retention: "24h"`（`:820-825`、`:1671-1677`）。

- 适用范围：0.86.1 `openai-completions`。minimal-runtime 当前不传 `sessionId`，这一变化对它无效果。
- 代价与不适用：一旦传入本系统的会话标识，它就作为请求头出站到 OpenRouter；传什么值、要不要传是调用方的事，pi-ai 不做任何裁剪。
- 来源：[E2](evidence.md#e2-pi-ai-0861-源码)、[E3](evidence.md#e3-0851--0861-差分)
- 最近核对：2026-09-23 / 同上

### pi-ai 自身不会对 OpenRouter 做隐藏重试或回退，除非调用方显式给 maxRetries 或路由允许回退

OpenAI SDK 以 `maxRetries: 0` 被调用，外层 `retryProviderRequest` 的默认次数是 `options.maxRetries ?? 0`（`provider-retry.ts:109`），两版逐行一致。
这层重试只包住 `create().withResponse()`，也就是**拿到响应头之前**；流开始之后的失败不会被它重试。回退只取决于请求里的 `provider.allow_fallbacks`——pi-ai 原样转发 `compat.openRouterRouting`（`:980-983`），OpenRouter 的默认是允许回退（`types.ts:861-862` 注释）。

- 适用范围：`openai-completions` 路径。
- 代价与不适用：一旦调用方给了 `maxRetries>0`，重试发生在 pi-ai 内部，调用方只看到最后一次的结果，失败的那几次不会以任何事件出现；
  一旦路由允许回退，「换一家」发生在 OpenRouter 内部的同一个 HTTP 请求里，调用方只能从 `chunk.provider`（需补丁）看到最终是哪家。
- 撞上这条事实会怎样：[PF-013 §5.5](../../design/product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程) 要求「试过又失败的那几次」留痕、[§5.12](../../design/product/PF-013-model-profiles-and-invocation/design.md#它看得到什么) 要求重试挂件看得到「这次调用已经试过哪些」——这两件在 pi-ai 内部重试或 OpenRouter 服务端回退下都拿不到，只有每次只放一家、在 pi-ai 之外重发时才看得见。
- 来源：[E2](evidence.md#e2-pi-ai-0861-源码)、[E3](evidence.md#e3-0851--0861-差分)
- 最近核对：2026-09-23 / 同上

### pi-ai 的结果不带结构化 HTTP 状态码，错误文本里原样含上游响应体

`normalizeProviderError` 能从 SDK 错误里抽出状态（`error-body.ts:38-65`），但 `formatProviderError` 只把它拼成 `"<status>: <body>"` 文本（`:128-135`），
`AssistantMessage` 没有状态码字段（`types.ts:515-537`），catch 分支还把 `error.metadata.raw` 追加进 `errorMessage`（`openai-completions.ts:713-721`）。
流中的带内错误由 OpenAI SDK 以 `APIError(undefined, data.error, …)` 抛出，状态为 undefined。
采用方 DSH 在注释里明写了这一点，并退而用正则从文本里认 `401|403|429|413|400|5xx`（`llm-pi-ai/src/stream.ts:34-68`）。
minimal-runtime 的 pi-ai 传输把一切非本地错误变成不带 status 的 `stream_error`（`pi-ai-transport.ts:326-338`），而它的直接 transport 对 HTTP 非 2xx 带着 `response.status`（`openrouter.ts:322-331`）。

- 适用范围：0.85.1 与 0.86.1 的 `openai-completions` 路径。
- 代价与不适用：状态码在注入的 `fetch` 里是拿得到的（minimal-runtime 已在那里截 3xx），所以这是「pi-ai 不交出来」而不是「拿不到」。
- 撞上这条事实会怎样：[PF-013 §5.7](../../design/product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它) 的「原样带着状态码」若从 pi-ai 结果里取，只能解析文本；
  [§6.16](../../design/product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏) 的脱敏若依赖 pi-ai，`errorMessage` 里是未经裁剪的上游响应体。
- 来源：[E2](evidence.md#e2-pi-ai-0861-源码)、[E5](evidence.md#e5-minimal-runtime-的-modelexecution)、[E8](evidence.md#e8-dsh-c291e79-的-llm-包与作者笔记)
- 最近核对：2026-09-23 / 同上

### minimal-runtime 的 pi-ai 传输只放行目录里的非推理 chat-completions 路由

传输在发网前拒绝两类路由：目录条目不是 `openai-completions` 或 baseUrl 不符的（`pi-ai-transport.ts:190-195`），以及 `reasoning:true` 的（`:196-201`，理由是「reasoning replay is not mapped」）。
0.85.1 目录里 OpenRouter 共 366 条：`openai-completions` 351 条中推理模型 270 条；`anthropic-messages` 15 条。能过这道门的是 81 条非推理模型（例如 `openai/gpt-4o-mini` 可、`openai/gpt-5.1` 不可）。
它还要求历史全是字符串（非文本历史拒绝，`:51-53`）、system 只在开头（`:40-48`）。

- 适用范围：`d79484d` 的 `PiAiOpenRouterTransport` 与 0.85.1 目录快照；0.86.1 目录数据是生成物，不在源码归档里，未计数。
- 代价与不适用：这是失败关闭的有意设计，不是 pi-ai 的能力上限——pi-ai 本身会发 `reasoning.effort` 并把 `reasoning_details` 存进 `thinkingSignature`（`openai-completions.ts:664-675`、`:931-940`）；缺的是本项目这一侧的私有 replay 映射。
- 来源：[E4](evidence.md#e4-本仓库钉住的-0851-与补丁)、[E5](evidence.md#e5-minimal-runtime-的-modelexecution)
- 最近核对：2026-09-23 / `d79484d`、pi-ai `0.85.1`

### PF-013 的「单独中断这一次调用」在 minimal-runtime host 上有逐 attempt 的落点，「首 token 前可重发、之后不重发」没有

每个 attempt 一个 `AbortController`，`requestStop(attempt, epoch, 'interrupt')` 只 abort 这一个（`host.ts:774`、`:793-829`），pi-ai 把 `signal` 一路传到 `fetch`；中断结算为 `cancelled`，不是失败（`:1299-1305`）。
这对得上 [PF-013 §5.13](../../design/product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token) 的「单独」与「被中断不是故障」。
但首 token 规则没有落点：进程重启后 `ledger.recover()` 把 `prepared|admitted|dispatched` 一律改成 `closing`（`ledger.ts:251-263`），`host.recover()` 只记一条诊断（`host.ts:504-516`），
不看这个 attempt 是否已有私有 chunk 落盘；设计稿写的是「发现 dispatched 而无 settled 时只 inspect/对账，不复用原 attempt 发网，也不盲目重发」（`design.md:208-210`）。
运行中的失败分支用 `text_delta|reasoning_delta` 判「有没有内容」（`host.ts:1296-1298`），**工具调用增量不算**；而成功分支的 `hasBusinessContent` 把 `tool_end` 算进去（`:350-355`）。
pi-ai 这边，`start` 事件在任何内容之前（`openai-completions.ts:379`），首个内容信号是 `text_start`/`thinking_start`/`toolcall_start`；minimal-runtime 的映射不转发 `toolcall_start`，工具增量要等 id 与名字都到了才发（`pi-ai-transport.ts:271-286`）。
宿主维度上，host 只有逐 attempt 停与整个 host 停（`waitReleased`，`host.ts:1182-1190`），没有按 Session 或 Run 批量停的入口。

- 适用范围：`d79484d` 的 host 与 pi-ai 传输。
- 代价与不适用：pi-ai 不持有任何耐久状态，首 token 规则只能落在它之外。
- 撞上这条事实会怎样：若把「首 token」等同于 pi-ai 的 `start` 事件，响应头一到就被算作「已经开口」，首 token 前的可重发窗口会被错误关掉；若只看文本与思考增量，一次只吐了半截工具调用就断的请求会被当作「一个字都没出来」而重发。
- 来源：[E2](evidence.md#e2-pi-ai-0861-源码)、[E5](evidence.md#e5-minimal-runtime-的-modelexecution)、[E9](evidence.md#e9-产品正文)
- 最近核对：2026-09-23 / `d79484d`

### minimal-runtime 的 recover() 只记诊断，耐久 disposition 与公开帧的编码仍悬在未通过的 round-3 上

`DispositionCodec` 与 `ActiveFrameCodec` 都是注入接口（`ledger.ts:113-116`、`publisher.ts:50-57`），测试用的是 `testDispositionCodec`；
包自己的 README 与 `design.md:3-27` 写明精确 disposition/frame 形状等 round-3，台账记录 round-2 `d197176` 与 round-3 `9a58ae2` 均被独立复评拒绝、迁移线进入全局诊断（`minimal-runtime-execution.md:412-420`、`:440-447`）。
`recover()` 之后没有任何代码去「inspect 原请求」：包内没有 OpenRouter `/generation` 查询（`grep` 零命中），`inspect_original_operation_required` 只是一条诊断码。

- 适用范围：`d79484d`。
- 代价与不适用：这条讲的是实施线停在哪，不评价 round-3 的设计本身。
- 来源：[E5](evidence.md#e5-minimal-runtime-的-modelexecution)、[E7](evidence.md#e7-minimal-runtime-施工台账)
- 最近核对：2026-09-23 / `d79484d`

### PF-013 的八个成因和可替换重试挂件，在 pi-ai 与 minimal-runtime 里都还没有落点

minimal-runtime 的失败结算只有 `cancelled|partial|unknown` 三种 outcome，`finish` 取内部错误码（`host.ts:1300-1310`），没有「已下架 / 范围不再允许 / 模态对不上 / 凭据不可用 / 上游不接受 / 给不出回复 / 说到一半断了 / 没认出来」这一封闭枚举，也没有状态码字段；
「传输本身不重试；需要新请求时由驱动策略新建 attempt 并重新准入」（`design.md:183`），但没有这样的策略实现。
对照组 DSH 的做法：错误按文本正则分成 AUTH/RATE_LIMIT/INVALID_REQUEST/SERVER/TIMEOUT/TRANSPORT（`stream.ts:42-68`），重试在「步骤」边界上重跑整步，**失败尝试已流出的半截输出从派生消息里丢弃**（`llm-retry/README.md:58`、`:115`），默认五次，另有无限次的 `always` 模式；它明确拒绝 SDK 层的隐藏重试（retry 笔记）。

- 适用范围：`d79484d`；DSH `c291e79`。
- 代价与不适用：DSH 的「首 token 之后照样整步重跑、丢弃半截」与 [PF-013 §5.4「已经开口说话了」一律不重试](../../design/product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) 正相反，它的重试执行器不能原样当作 PF-013 的默认重试挂件的参照。
- 来源：[E5](evidence.md#e5-minimal-runtime-的-modelexecution)、[E8](evidence.md#e8-dsh-c291e79-的-llm-包与作者笔记)
- 最近核对：2026-09-23 / `d79484d`、DSH `c291e79`

### 凭据一范围一把在传输层只要求每次请求带自己的 key，pi-ai 支持到这一步，minimal-runtime 把 key 钉在了传输实例上

pi-ai 的 `apiKey` 是请求级选项（`types.ts:135`），`Models.applyAuth` 让请求级 key 优先（`models.ts:667`）；`openai-completions` 每次调用都新建 SDK 客户端（`:344-352`），客户端不跨请求共享，
连接复用只取决于注入的 `fetch`（默认全局 `fetch`）——按源码，不同 key 的请求之间除 HTTP 连接池外没有共享状态，key 只在每个请求的 `Authorization` 头里。
minimal-runtime 的 `PiAiOpenRouterTransport` 在构造时收一个 `credentialRef`（`pi-ai-transport.ts:27-32`、`:183`），一个实例只有一把 key；按范围取 key 需要「每范围一个传输实例」或把凭据引用放进每次请求。
DSH 的做法是每次请求经自己的凭据接缝解析后作为 `apiKey` 传入（`adapter.ts:348`），并刻意不用 pi-ai 的凭据存储，因为 `envApiKeyAuth` 在未给 key 时会回落到环境变量 `OPENROUTER_API_KEY`（catalog 笔记）。

- 适用范围：0.86.1 `Models`/`openai-completions`；`d79484d`。
- 代价与不适用：「连接池不带跨 key 状态」是按源码的推断，未做抓包；pi-ai 没有「这个范围没配 key」的概念——没给 key 时它会去找环境变量或凭据存储，这条回落要由调用方挡住（minimal-runtime 在调用前校验非空，`:184-186`）。
- 来源：[E2](evidence.md#e2-pi-ai-0861-源码)、[E5](evidence.md#e5-minimal-runtime-的-modelexecution)、[E8](evidence.md#e8-dsh-c291e79-的-llm-包与作者笔记)
- 最近核对：2026-09-23 / 同上

### OpenRouter 的 is_byok 与 PF-013 的「范围自带凭据」是两件不同的事

D-019（`:27`、`:76`）与补丁里的 BYOK 指 OpenRouter 响应里的 `is_byok`：请求经 OpenRouter 转到上游时用的是否是账户里登记的**上游供应商自己的 key**，此时 `usage.cost` 与 `cost_details.upstream_inference_cost` 含义不同（补丁 `:33-48`）。
[PF-013 §5.6](../../design/product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) 的「范围可以自带凭据」指的是组织或租户配上**自己的 OpenRouter key**。
前者影响「`usage.cost` 是不是这次调用实际扣的钱」，后者影响「用哪把 key 出门、账记在谁头上」。补丁捕获了 `isByok` 与 `upstreamInferenceCost`，minimal-runtime 的 `Usage` 没有这两个字段（`pi-ai-transport.ts:347-363`）。

- 适用范围：术语对照；OpenRouter 对 `is_byok` 的线上语义本轮未联网核实，只据补丁与旧评估转述。
- 代价与不适用：两者可能同时成立（一个租户用自己的 OpenRouter key，且在那个账户里登记了上游 key），此时 `usage.cost` 的含义要按 `is_byok` 分开读。
- 来源：[E1](evidence.md#e1-d-019-与旧评估)、[E4](evidence.md#e4-本仓库钉住的-0851-与补丁)、[E9](evidence.md#e9-产品正文)
- 最近核对：2026-09-23
- 状态标记：OpenRouter `is_byok` 下 `usage.cost` 的确切含义**待核实**（需官方文档或实测）。

### pi-ai 能承载的内容只有文本、思考、图、工具调用四类，语音与视频没有载体，非视觉模型的图会在出门时被静默换成占位文本

pi-ai 的消息内容类型是 `TextContent`、`ThinkingContent`、`ImageContent`（base64 + mimeType）、`ToolCall`，工具结果内容是文本与图（`types.ts:364-394`、`:509-551`）；
`Model.input` 只有 `"text"|"image"`，没有输出模态字段（`:971`）。对照 [PF-013 的四种模态](../../design/product/PF-013-model-profiles-and-invocation/design.md#模态)（文本·图·语音·视频）与
[PF-009 的七类块](../../design/product/PF-009-context-message-types/design.md#消息的内容是一串块不是一段文本)：文本、思考、图、工具调用、工具结果可直接映射；
文件块是引用，按 PF-013 本来就是文本；**语音块与视频模态在 pi-ai 里没有对应类型**。
另外，模型 `input` 不含 `image` 时，pi-ai 在 `transformMessages` 里把图替换成 `"(image omitted: model does not support images)"`（`transform-messages.ts:12-13`、`:35-51`），0.85.1 与 0.86.1 相同；
工具结果里的图在 chat-completions 上被拆成一条附加的 user 消息（`openai-completions.ts:1396-1460`）。
minimal-runtime 的传输目前只收字符串历史，图也不通过。

- 适用范围：0.85.1、0.86.1 的 chat 流接口；pi-ai 另有独立的 `openrouter-images` 图像生成 API，不在本轮范围。
- 代价与不适用：「pi-ai 没有语音/视频类型」是读遍 `types.ts` 的负面结论；OpenRouter 本身是否对某些模型接受音频/视频输入，本轮未核实。
- 撞上这条事实会怎样：PF-013 要求模态不兼容「挡在算合法目标那一刻，不挡在出门那一刻」（[§6.10](../../design/product/PF-013-model-profiles-and-invocation/design.md#610-模态兼容挡在算合法目标那一刻不挡在出门那一刻)）；若上游某一步漏挡、把原图交给了非视觉模型，pi-ai 不报错，而是悄悄换成一句占位文本送出——用户看不出模型读到的是那句占位。
- 来源：[E2](evidence.md#e2-pi-ai-0861-源码)、[E4](evidence.md#e4-本仓库钉住的-0851-与补丁)、[E9](evidence.md#e9-产品正文)
- 最近核对：2026-09-23 / 同上

### 真实费用只来自 OpenRouter 响应里的 usage.cost，补丁后能区分 actual 与 unknown，但失败与中断的调用在 minimal-runtime 里一律记成 unknown

未打补丁的 pi-ai 只给目录估价（`calculateCost`，`models.ts:900-920`），拿不到时也是按 0 token 算出的 0，不区分「没拿到」。
补丁新增 `openRouter.actualCost` 与 `actualCostSource: "openrouter_usage"|"unknown"`，缺失或非法即 unknown（补丁 `:36-41`），目录估价保留在原 `usage.cost`。
minimal-runtime 只在成功路径、`quality==='actual'` 且 `cost!==null` 时把费用交给计量（`host.ts:1337-1343`）；失败、中断、首 token 后断流的分支 `usage` 恒为 unknown（`:1384`），传输在抛错前也不会把错误消息上已有的 `openRouter` 字段带出来。
次要观察：补丁在每个带 `usage` 的 chunk 上重写来源（后一个不带 `cost` 的 usage 会把 actual 改回 unknown）；直接 transport 把数字 `String()` 后用不含指数的正则校验，`1e-7` 这类极小金额会被判 null（`openrouter.ts:235-246`），pi-ai 路径的 `cost-source` 接受指数（`cost-source.ts:168-182`）。

- 适用范围：0.85.1 + 补丁；`d79484d`。
- 代价与不适用：OpenRouter 对中途断流或被中断的请求是否仍收费、是否仍在最后一个 chunk 给 `usage.cost`，本轮未核实；设计稿提到的「受信 generation 查询」事后对账没有实现。
- 撞上这条事实会怎样：[PF-001 §6.4](../../design/product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) 要求「一次调用花掉的成本必须能算到发起它的那个租户头上，并能逐条列出来」；按现状，失败与中断的调用在明细里只能是「未知」，不会是 0，也不会是估价。
- 来源：[E2](evidence.md#e2-pi-ai-0861-源码)、[E4](evidence.md#e4-本仓库钉住的-0851-与补丁)、[E5](evidence.md#e5-minimal-runtime-的-modelexecution)
- 最近核对：2026-09-23 / 同上

### minimal-runtime 的预算预留组合超出了现行产品要求，现行要求只到逐条成本可统计

minimal-runtime 在 admit 时与 Budget 共同提交 reservation，未知费用要租户显式选择暴露，并按预留结算（`design.md:262-273`；`cost-source.spec.ts:393`）。
现行产品正文在 2026-09-17 由用户直接裁决「订阅体系、权益与预算限额机制本阶段整体不做」，只要求使用成本按租户归属、能出账单明细（[PF-001 §6.4](../../design/product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)、`decisions.md:28`）。

- 适用范围：`d79484d` 对 PF-001 rev 15。
- 代价与不适用：这条只指出形状与现行要求的落差；预留、暴露选择这些结构本身能不能拆出去，本轮没有评估。
- 来源：[E5](evidence.md#e5-minimal-runtime-的-modelexecution)、[E9](evidence.md#e9-产品正文)
- 最近核对：2026-09-23

### minimal-runtime 里不存在 DSH 那样的双层包裹：model/execution 直接调 pi-ai，model/llm 是另一套未被它使用的词汇

DSH 的结构是 `dsh-llm`（与供应商无关的消息、chunk、失败词汇）之上挂 `dsh-llm-pi-ai` 适配器，pi-ai 在最里层。
minimal-runtime 的 `model/execution` 依赖里没有 `@omne-harness-lite/llm`，它自己定义 `PrivateChunk`、`Usage`、`ModelExecutionError`，直接调 pi-ai；
`model/llm` 是 DSH `dsh-llm` 的定向 fork（`provenance.json` 钉 `c291e79`），只导出 `./baseline`，被 `session`、`agent/loop`、`tools` 引用（[E6](evidence.md#e6-minimal-runtime-的-modelllm)）。
于是同一份「模型吐出来的东西」在仓库里有两套词汇：`model/llm` 的 `StreamChunk`（`block-start`/`tool-call-delta`/`finish{replayState}`，`LlmFailure` 带 `status?`、无费用字段）与 `model/execution` 的 `PrivateChunk`（`text_delta`/`tool_delta`/`tool_end`/`provider_replay`/`usage`，`Usage` 带费用质量）。

- 适用范围：`d79484d`。
- 代价与不适用：两套词汇之间没有映射代码；哪一套该是权威不在本研究范围。
- 来源：[E5](evidence.md#e5-minimal-runtime-的-modelexecution)、[E6](evidence.md#e6-minimal-runtime-的-modelllm)、[E8](evidence.md#e8-dsh-c291e79-的-llm-包与作者笔记)
- 最近核对：2026-09-23 / `d79484d`

### fork 的维护面：补丁打在编译产物上、只覆盖一条 API 路径、上游约两周一个 minor

现行 fork 是 pnpm patch，改 `dist/api/openai-completions.js` 与 `dist/types.d.ts` 两个编译产物（73 行），source map 不再对应（`patches/README.md`）。
它只覆盖 `openai-completions`；OpenRouter provider 同时挂着 `anthropic-messages`（`providers/openrouter.ts:22-25`），那条路径同样用目录估价。
pi-ai 的发版节奏（CHANGELOG）：0.84.2（08-14）、0.84.3（08-24）、0.84.4（08-28）、0.85.0（09-04）、0.85.1（09-05）、0.86.0（09-19）、0.86.1（09-20）——六周七个版本，其中 0.86.0 带破坏性变更。
pi-ai 按 provider id 与 baseURL 自动推断请求形状（`detectCompat`，`:1583-1679`）；DSH 为此给 34 个 compat 字段建了逐字段 drift gate，上游每加一个字段就让构建失败（wire-compat 笔记）。

- 适用范围：0.85.1 补丁；0.86.1 源码；DSH `c291e79`。
- 代价与不适用：发版节奏只说明上游变化频率，不说明每次都影响补丁；本轮只核对了 `openai-completions` 一个文件的跨版差分。
- 来源：[E2](evidence.md#e2-pi-ai-0861-源码)、[E4](evidence.md#e4-本仓库钉住的-0851-与补丁)、[E8](evidence.md#e8-dsh-c291e79-的-llm-包与作者笔记)
- 最近核对：2026-09-23

### pi 的 durable 包不提供模型请求的耐久

`@earendil-works/pi-durable@0.86.1` 源码只有类型与内存存储；`docs/pico-v5.md` 自称规范性文档且「Pico5 is not implemented yet」（`:194`）。
规格里的生成直接调 `models.streamSimple()`，恢复把已提交的半截转为 interrupted/aborted 条目，再按任务阶段重试或终止（`:1520-1532`），并把 aborted/error 的 assistant 消息从后续请求中排除（`:185-186`）——没有首 token 维度。

- 适用范围：pi `3390bd9`。
- 代价与不适用：负面结论来自读遍 `src/` 三个文件与规格相关段落。
- 来源：[E10](evidence.md#e10-pi-durable-0861)
- 最近核对：2026-09-23

## 支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| 0.86.1 发布物由 `3390bd9` 的 `packages/ai/src` 构建，未另加补丁 | 「补丁在 0.86.1 上仍然需要」与「破坏性变更不影响公开入口」 | 未核对：本机没有 0.86.x 发布物 |
| OpenRouter 在流末 chunk 的 `usage.cost` 是账户实际扣费 | 「真实费用只来自 usage.cost」 | 未核对：本轮不联网；旧评估一次真实请求与 `/generation` 对齐，只覆盖一条路由 |
| minimal-runtime 测试源码与其实际通过的测试一致 | 比较门现状表里「有测试」各行 | 未复跑 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响选择及消费时点 | 所需产物/责任 |
|---|---|---|---|
| OpenRouter 对首 token 前被中断、首 token 后断流的请求是否计费、是否给 `usage.cost` | 受控真实请求：分别在响应头后、首内容后 abort，再按 generation ID 查账 | PF-013「首 token 之前没有外部效果」能否直接当作传输层事实；成本明细里失败调用是否必然 unknown | 需用户授权的实测 |
| `chunk.model` 对各路由是否等于请求的 model slug | 对目标路由各发一条短请求 | minimal-runtime 以 `servingModel≠modelId` 判 `route_violation`，报告日期后缀变体的路由会被误拒 | 同上 |
| `max_completion_tokens`/`store:false`/`reasoning.effort`/`strict` 对所选模型是否等价 | 对每条目标路由用同一 manifest 比对直接请求与 pi-ai 请求的结果 | D-019 保留前提第二条 | 比较门补记 |
| issue #8940 当前状态 | 联网查看 | 是否还需要自维护补丁 | 联网核对 |
| 0.86.x 发布物能否干净打上补丁、minimal-runtime 能否在其上编译 | 取得发布物后重做 E3 差分并试打补丁 | 升级路径 | 实施线 |
| OpenRouter 的 `is_byok` 下 `usage.cost` 含义 | 官方文档或实测 | 成本明细的口径 | 联网核对 |

## 采用与后续核对

已落地的消费者：[D-019 的比较门现状补记（2026-09-23）](../../design/record/decisions/model-provider-pi-ai-fork/gate-status-2026-09-23.md)。预期消费者还有本程块 C 的架构读数（待出现）。
pi-ai 换版本时 grep 本包的 `0.85.1`、`0.86.1`、`3390bd9`；minimal-runtime 前移时 grep `d79484d`。
