# 2026-09-23 模型请求运行时取证报告

本报告是首轮的完整对照表与推理过程；收敛后的结论在 [research.md](../research.md)，来源与取证条件在 [evidence.md](../evidence.md)。
行号记法同 evidence：`pi/…` = `tmp/sources/extracted/pi/`（pi `3390bd9`，pi-ai `0.86.1`），`MR/…` = `.worktrees/minimal-runtime/`（`d79484d`），`dsh/…` = `tmp/sources/extracted/dsh/`（`c291e79`）。
全部离线；没有复跑任何测试，「有测试」只指测试源码里有这个断言。

## 1. D-019 比较门逐项现状

比较门原文见 D-019 `:51-53`；保留前提第二条（请求差异按模型实测）见 `:46-48`。
「现状」一栏只陈述在 `MR` 的 pi-ai 传输（`packages/model/execution/src/pi-ai-transport.ts`）上看得到什么。

| 比较门项 | 现状 | 证据位置 | 没做的部分 |
|---|---|---|---|
| 请求的模型 / provider / order / 禁用回退 / 要求参数 | **做了**。发网前核对四项，不符即 `invalid_route`；再强制写入 `openRouterRouting:{order:[providerId],allow_fallbacks:false,require_parameters:true}` | `pi-ai-transport.ts:175-182`、`:202-212`；`tests/pi-ai-transport.spec.ts:179-187` 断言请求体 `provider` | 只允许单一 provider；PF-013 的「有序供应商列表 + 允许回退」无法表达（见 §3） |
| 请求差异：`max_completion_tokens` | **没做**。pi-ai 对 OpenRouter 恒发 `max_completion_tokens`（`detectCompat` `:1641`） | 旧评估 `tmp/model-provider-reuse-pi-ai.md:32` 一次真实请求的旁观记录；`compare-live.mjs:52-53` 记录字段 | 没有按模型的测试或实测；测试不断言该字段 |
| 请求差异：`store:false` | **没做**。OpenRouter `supportsStore:true` ⇒ 恒发 `store:false`（`:832-834`、`:1635`） | 同上 `:32`、`:34` | 同上 |
| 请求差异：`reasoning` | **绕过**。推理模型整条拒绝，所以非推理模型不发 `reasoning`（`:931` 条件含 `model.reasoning`） | `pi-ai-transport.ts:196-201`；`tests/pi-ai-transport.spec.ts:73-91` | 推理路由的 `reasoning.effort`（含未给努力度时默认发 `off ?? "none"`，`:938-939`）从未比较 |
| 请求差异：`strict` | **没做**。OpenRouter `supportsStrictMode:true` ⇒ 工具定义恒带 `strict`（`:1503`、`:1664`），未要求 JSON-schema 约束时为 `false` | 旧评估 `:34` | 没有按模型测试 |
| 原始工具参数与结果回传 ID | **做了**。传输自己累积原始参数串，只在 `toolcall_end` 时整体 `JSON.parse` 校验；第二轮请求里 `tool_call_id` 与 assistant `tool_calls` 断言 | `pi-ai-transport.ts:264-323`；`spec.ts:93-195`、`:217-302` | — |
| 流终态与无尾随事件 | **部分**。无 finish 的 EOF → pi-ai 抛 `Stream ended without finish_reason` → `stream_error` → host 结算 `unknown` | `openai-completions.ts:695-697`；`tests/durable.spec.ts:176`、`:409-413` | 终态之后又来 chunk 的用例没有；pi-ai 在 `for await` 结束后才判终态，尾随 chunk 会被继续解析而不是拒绝（`:553-677`） |
| 实际 provider 与响应 ID | **做了**（依赖补丁）。`servingProvider`/`servingModel` 与期望不符即 `route_violation` | 补丁 `:26-35`；`pi-ai-transport.ts:339-346`；`tests/pi-ai-fork.spec.ts:89-153`、`pi-ai-transport.spec.ts:304` | `servingModel` 取自 `chunk.model`，OpenRouter 若报带日期后缀的变体会被误判越界——未实测 |
| `usage.cost` 的质量标记 | **做了**（依赖补丁）。缺失或非法 → `unknown`；目录估价不进 Usage | 补丁 `:36-41`；`pi-ai-transport.ts:129-163`、`:347-363`；`spec.ts:197` | 失败/中断路径一律 unknown（`host.ts:1384`）；补丁逐 chunk 覆盖来源 |
| BYOK | **捕获了，没传下去**。补丁取 `is_byok` 与 `cost_details.upstream_inference_cost`，传输的 `Usage` 无字段 | `tests/pi-ai-fork.spec.ts:94-113`；`pi-ai-transport.ts:347-363` | 语义未核实（见 research「is_byok」一条） |
| 私有 replay | **没做**。推理路由发网前拒绝，理由「reasoning replay is not mapped」 | `pi-ai-transport.ts:196-201` | pi-ai 把 `reasoning_details` 存进 `thinkingSignature`（`:664-675`、`:329-333`），本项目侧没有映射 |
| 重定向 | **做了**。注入 `fetch` 用 `redirect:'manual'`，3xx 取消 body 并抛 `redirect`（带状态） | `pi-ai-transport.ts:244-253`；`spec.ts:324-339` | — |
| 错误 | **部分**。HTTP 503 → 只发一次、`stream_error` | `spec.ts:341-356` | 状态码丢失；带内错误、429、401 无用例 |
| 断流 | **部分**。首内容前的无 finish EOF 有用例 | `durable.spec.ts:175-177`、`:409-413` | 首 token 之后断流（已有内容进账）无 pi-ai 用例 |
| abort | **做了**（首内容前）。响应头已发、body 未到时 interrupt → `cancelled` | `durable.spec.ts:179-182`、`:414-421` | 首内容之后 abort 无用例 |
| 无隐藏重试 | **做了**。`maxRetries:0` + 注入 `fetch` 计数，第二次出站即失败 | `pi-ai-transport.ts:229`、`:235-243`；`spec.ts:341-356`（`failureSends===1`） | — |

台账声称的真实请求（`tmp/minimal-runtime-execution.md:6`、`:87-94`）：`openai/gpt-4o-mini` 经 OpenAI，fork bridge 四轮 read→write→read→final，与 `/generation total_cost` 对账一致。本轮未复跑，只作线索。

## 2. 0.85.1 → 0.86.1：差分与补丁

### 2.1 `openai-completions` 的差分

方法见 [E3](../evidence.md#e3-0851--0861-差分)。191 行差异，归为四类：

| 类 | 内容 | 与 D-019 前提的关系 |
|---|---|---|
| 导入 | `.js`→`.ts`；新增 `getSystemMessageText`、`renderSystemMessageUpdate`、`getDeclaredTools`、`resolveTranscript`、`resolveTranscriptTools` | 无 |
| 上下文形状 | `stream()` 先 `resolveTranscript(context, supportsMidConvoSystemMessages)`；工具列表来自 transcript；`convertMessages` 处理 `role:"system"` 消息（中途系统消息折叠或原位发送）；删除 Kimi `deferredToolsMode` 与 `getDeferredToolNames` | 不动请求路由、流解析、费用；动了「system 与工具从哪来」 |
| OpenRouter 会话头 | `sendSessionAffinityHeaders: false` → `isOpenRouter`；新增 `supportsMidConvoSystemMessages/ToolAdditions: false` | 给 `sessionId` 时新增一个出站头 |
| Cerebras | `supportsStrictMode` 对 Cerebras 关闭 | 与 OpenRouter 无关 |

**未变**：输出对象构造、`retryProviderRequest` 调用与默认次数、流循环（`responseId`、`responseModel`、`parseChunkUsage`、finish 映射、工具增量、`reasoning_details`）、`parseChunkUsage` 与 `calculateCost`、`buildParams` 里的 `store`/`max_completion_tokens`/`reasoning`/`provider` 路由、`convertTools` 的 `strict`。

### 2.2 补丁在 0.86.1 上

| 补丁位置 | 0.86.1 源码里的对应锚点 | 结论 |
|---|---|---|
| 输出对象字面量里 `model: model.id,` 之后插 `openRouter` 初值 | `openai-completions.ts:311-313` 同一字面量仍在 | 锚点在；需按 0.86.x 发布物重新生成 hunk |
| 流循环 `output.responseId ||= chunk.id;` 之后插回填 | `:558` 仍在，紧接 `chunk.model` 判断 | 同上 |
| `types.d.ts` `AssistantMessage` 在 `responseId?` 之后加 `openRouter?` | `types.ts:522-524` 仍是 `responseId?` → `providerThinkingLevel?` | 同上 |

两处缺口（`chunk.provider` 不读、`usage.cost` 被目录估价覆盖）在 0.86.1 源码里原样存在，**补丁的目的在 0.86.1 上仍然成立**。未覆盖的：OpenRouter 的 15 条 `anthropic/*` 目录条目走 `anthropic-messages`（0.85.1 目录计数），那条路径（0.85.1 `dist/api/anthropic-messages.js:417`、`:592`）同样用 `calculateCost`，补丁不改它。

### 2.3 包名与依赖

两版都是 `@earendil-works/pi-ai`；两版之间 CHANGELOG 没有 scope 变更。DSH `llm-pi-ai` 声明 `^0.85.1`（`package.json:44`），0.x 的 caret 不跨 minor。0.86.0 的破坏性变更（CHANGELOG `:20-21`）只影响 provider 面与 `ToolCall.arguments` 类型。

## 3. PF-013 条款 × 来源承载表

列：**pi-ai 0.86.1 传输**（库本身能不能承载）、**minimal-runtime**（`d79484d` host + pi-ai 传输现状）。
取值：**可承载**（现有代码就能表达）/ **需改**（有位置但现状不符或缺一段）/ **不可承载**（对象的类型或结构里没有这个东西）/ **未覆盖**（这一层根本不涉及，或本轮没找到任何代码）。

| PF 条款 | pi-ai 0.86.1 传输 | minimal-runtime | 依据 |
|---|---|---|---|
| [§4 档案·路由名](../../../design/product/PF-013-model-profiles-and-invocation/design.md#模型档案) | 可承载（`Model.id`） | 可承载（`route.modelId`，单一） | `types.ts:959-962`；`MR types.ts:15-22` |
| §4 档案·允许的供应商（有序）+ 允不允许回退 | 可承载（`OpenRouterRouting.order`、`allow_fallbacks`） | **需改**：`allowFallbacks: false` 是字面类型，`order` 只有一家，执行方不符即 `route_violation` | `types.ts:860-927`；`MR types.ts:27-28`；`pi-ai-transport.ts:202-212`、`:344-346` |
| §4 档案·收得下的模态 | **不可承载**（语音、视频）；文本、图可承载（`Model.input`） | 未覆盖（只收字符串历史） | `types.ts:971`；`pi-ai-transport.ts:51-53` |
| §4 档案·给得出的模态 | **不可承载**（chat `Model` 无输出模态字段） | 未覆盖 | `types.ts:959-999` |
| §4 档案·一次最多吃 / 吐多少 | 可承载（`contextWindow`、`maxTokens`） | 可承载（`contextLimit`、`maxOutputTokens`） | `types.ts:975-976`；`MR types.ts:31-32` |
| §4 档案·送进去之前的限制（图字节上限） | 未覆盖（无字段） | 未覆盖 | 读遍 `types.ts` `Model` 未见 |
| §4 在册 / 已撤回、官方 / 自建 | 未覆盖（目录是生成的静态数据） | 需改：`ModelProfile` 有 `status`、`source` 字段，host 只登记一条 | `MR types.ts:36-43`；`host.ts:456-465` |
| [§5.2 本层了结：换一家 / 退避](../../../design/product/PF-013-model-profiles-and-invocation/design.md#52-这一层的四要素填-pf-011-那一格) | 可承载于「每次一家、外部重发」；内部 `maxRetries` 与服务端回退**不可作为本层手段**（不留痕） | 未覆盖（无重试实现；设计稿写「新建 attempt 重新准入」） | `provider-retry.ts:105-125`；`MR design.md:183` |
| [§5.4 发不出去](../../../design/product/PF-013-model-profiles-and-invocation/design.md#54-三类事实归本层定死其余照状态码) | 未覆盖（出门前的事） | 需改：有 `profile_unavailable`、`route_unavailable`、`credential_unavailable`，无「已下架」「范围不允许」「模态不符」 | `host.ts:563-577`；`pi-ai-transport.ts:184-186` |
| §5.4 重试没用（照状态码认） | **不可承载**结构化状态码（只在 `errorMessage` 文本里） | 需改：pi-ai 路径丢 status；直接路径保留 | `error-body.ts:128-135`；`pi-ai-transport.ts:326-338`；`openrouter.ts:322-331` |
| §5.4 已经开口说话了（首 token 之后） | 可承载：`text_start`/`thinking_start`/`toolcall_start` 是首内容信号；`start` 早于内容 | 需改：失败分支只把文本、思考增量算作内容；`toolcall_start` 不转发 | `openai-completions.ts:379`、`:474-551`；`host.ts:1296-1298` |
| §5.4 被中断不是故障 | 可承载（`stopReason:"aborted"` 与 `error` 分开） | 可承载（`cancelled`，不带故障码） | `openai-completions.ts:712`；`host.ts:1299-1305` |
| [§5.5 上交看首 token](../../../design/product/PF-013-model-profiles-and-invocation/design.md#55-上交交给谁看模型说没说出话) | 未覆盖（上交是 loop 的事） | 未覆盖（只有 `partial`/`unknown` 结算，没有上交条目） | `host.ts:1300-1310` |
| [§5.6 凭据挂范围、一范围一把](../../../design/product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) | 可承载（请求级 `apiKey`；每次新建客户端） | 需改：一个传输实例一把 `credentialRef` | `types.ts:135`；`models.ts:667`；`pi-ai-transport.ts:27-32`、`:183` |
| [§5.7 八个成因](../../../design/product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它) | 未覆盖（成因是本层分类） | 未覆盖 | `host.ts:1300-1310` |
| §5.7 原样带状态码 | **不可承载**（结果对象无字段）；注入 `fetch` 可自取 | 需改（pi-ai 路径丢） | 同 §5.4 |
| [§5.10 合法目标集合](../../../design/product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) / §5.11 模态投影 | 未覆盖（不在传输层） | 未覆盖 | — |
| [§5.12 重试挂件看得到：状态码 / 成因 / 档案声明 / 已试过哪些](../../../design/product/PF-013-model-profiles-and-invocation/design.md#它看得到什么) | 状态码不可承载（同上）；其余未覆盖 | 未覆盖 | — |
| [§5.13 单独中断这一次，不动别的](../../../design/product/PF-013-model-profiles-and-invocation/design.md#单独控制中断这一次调用不动别的) | 可承载（每请求一个 `signal`） | 可承载（每 attempt 一个 `AbortController`） | `types.ts:132`；`host.ts:774`、`:793-829` |
| §5.13 首 token 前停机：照常再发一次 | 未覆盖（无耐久） | 需改：重启后一律 `closing`，不看是否已有 chunk；设计稿「不盲目重发」 | `ledger.ts:251-263`；`host.ts:504-516`；`MR design.md:208-210` |
| §5.13 首 token 后停机：一律不重发 | 未覆盖 | 可承载（重启不复用原 attempt 发网，有测试） | `durable.spec.ts:462-478` |
| §5.13 宿主恒为 agent runtime（中断运行 / 终止会话都停） | 可承载（进程内 promise，无转后台） | 需改：只有逐 attempt 与整 host 两档停，没有按 Session / Run 停 | `host.ts:1182-1190` |
| §5.13 非常态两分（本层消化 vs 上交） | 未覆盖 | 未覆盖 | — |
| [§6.16 错误外泄前脱敏](../../../design/product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏) | **需改**：`errorMessage` 含上游 body 与 `metadata.raw` | 可承载但以丢信息为代价（只留固定文案 `pi-ai stream failed`） | `openai-completions.ts:713-721`；`pi-ai-transport.ts:330` |
| [PF-009 §5.6 流断在半路照样落盘](../../../design/product/PF-009-context-message-types/design.md#56-流断在半路) | 可承载（错误事件带已收到的 `partial`） | 可承载（每个私有 chunk 先落盘再发布） | `openai-completions.ts:701-722`；`host.ts:1225-1237` |
| PF-009 §5.6 半截工具参数：收齐才解析 | **需改**：每个增量都 `parseStreamingJson` 回填 `arguments`，出错时保留半截解析结果 | 可承载（自存原始串，只在 `toolcall_end` 解析） | `openai-completions.ts:646-650`、`:701-711`；`pi-ai-transport.ts:288-305` |
| [SYS-LLM 全经 OpenRouter](../../../design/foundation/cross-system-constraints/requirements.md#sys-llm) | 可承载（OpenRouter provider）；需调用方挡住 `auth.baseUrl` 改写与环境 key 回落 | 可承载（URL 与出站次数守卫） | `providers/openrouter.ts`；`models.ts:667-671`；`pi-ai-transport.ts:235-243` |
| [PF-001 §6.4 成本逐条归租户](../../../design/product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | 需改（未打补丁只有目录估价） | 需改：失败 / 中断调用只能 unknown；无事后对账 | `models.ts:900-920`；`host.ts:1337-1343`、`:1384` |

**不可承载 / 未覆盖行汇总**（供汇报）：
不可承载——语音与视频模态、输出模态声明、结构化状态码（§5.4 重试没用、§5.7、§5.12 的状态码一项）；
未覆盖——图字节上限、在册/撤回（pi-ai 侧）、§5.2 本层重试（MR）、§5.4 发不出去（pi-ai 侧）、§5.5 上交、§5.7 八个成因、§5.10/§5.11、§5.12 其余三项、§5.13 首 token 前（pi-ai 侧）、§5.13 非常态两分。

## 4. 凭据与两种 BYOK

- 传输层要什么：每次请求带当次范围的 key；不让库回落到环境变量或自带凭据存储；连接复用不带跨 key 状态。
- pi-ai 做到哪：请求级 `apiKey` 优先（`models.ts:667`）；`openai-completions` 每次新建 `OpenAI` 客户端（`:344-352`），key 只进 `Authorization` 头；连接池取决于注入的 `fetch`。
  没给 key 时，`Models.applyAuth` 会走 provider 的 `auth`——OpenRouter 的是 `envApiKeyAuth("…", ["OPENROUTER_API_KEY"])` 加 OAuth（`providers/openrouter.ts:13-20`），即回落到环境变量。`getClientApiKey` 在 key 与 `Authorization` 头都缺时才抛（`openai-completions.ts:82-86`）。
- minimal-runtime：`credentialRef` 钉在实例上；调用前校验解析结果非空（`pi-ai-transport.ts:183-186`）。
- DSH：同样每请求传 `apiKey`，并刻意不建 pi-ai 凭据存储（catalog 笔记「Credentials stay outside pi-ai」）。
- 两种 BYOK：D-019 与补丁的 BYOK = OpenRouter `is_byok`（上游供应商 key 登记在 OpenRouter 账户里）；PF-013 §5.6 = 范围自带 OpenRouter key。前者决定 `usage.cost` 的口径，后者决定出门用哪把 key、账记在谁头上。

## 5. 模态映射

| PF-013 模态 / PF-009 块 | pi-ai 0.86.1 类型 | chat-completions 线格式 | 备注 |
|---|---|---|---|
| 文本 / 文本块 | `TextContent` | `content` 字符串或 `text` part | — |
| （文本的用途）/ 思考块 | `ThinkingContent`（`thinkingSignature` 存 replay） | OpenRouter `reasoning` / `reasoning_details` | 回放依赖 `thinkingSignature`；MR 未映射 |
| 图 / 图块 | `ImageContent`（base64 + mimeType） | `image_url` data URL | 非视觉模型时被换成占位文本（`transform-messages.ts:12-13`、`:35-51`） |
| 语音 / 语音块 | **无** | — | 读遍 `types.ts` 未见 |
| 视频 / （PF-009 无视频块） | **无** | — | 同上 |
| 文件块（引用，按 PF-013 是文本） | 无文件类型；引用只能以文本送 | 文本 | — |
| 工具调用块 | `ToolCall`（`arguments: JsonObject`） | `tool_calls` | 0.86.0 起 `arguments` 限 JSON 值 |
| 工具结果块（自身是一串块） | `ToolResultMessage.content: (Text\|Image)[]` | `role:"tool"` 文本 + 附加 user 消息装图 | `openai-completions.ts:1396-1460` |

## 6. 成本

- 真实费用来源：OpenRouter SSE 末段 `usage.cost`（数字）；BYOK 时另有 `cost_details.upstream_inference_cost`（补丁读取，字段名来自补丁与旧评估）。
- pi-ai 是否折算：未打补丁时 `usage.cost` 完全是 `calculateCost(model, usage)` 的目录估价（`models.ts:900-920`），没有来源字段；未拿到 usage 时是全 0，**与「免费」不可区分**。
- 补丁后：`openRouter.actualCostSource` 区分 `openrouter_usage` / `unknown`。
- 对照现行要求：预算已退役（PF-001 `decisions.md:28`），只要「一次调用花掉的成本能算到租户头上、能逐条列出来」（PF-001 §6.4）。按现状：成功调用可得 actual；失败、中断、首 token 后断流的调用在 MR 里一律 unknown；没有按 generation ID 的事后对账。
- 精度：MR `d79484d` 把配置 scale 改为下限，实际费用不再被截断（`cost-source.ts:168-182`）；直接 transport 的正则不接受指数写法（`openrouter.ts:235-246`）。

## 7. 短板与代价

1. **fork 维护面**：pnpm patch 打在 `dist` JS 与 `.d.ts` 上，73 行，source map 失效；只覆盖 `openai-completions`；pi-ai 六周七个版本，0.86.0 有破坏性变更。每次升级都要对新发布物重生成、重跑 `pi-ai-fork.spec.ts`（`patches/README.md`）。
2. **请求形状由库推断**：pi-ai 按 provider id/baseURL 推断 `store`、`max_completion_tokens`、`strict`、`reasoning`、developer 角色、`x-session-id`；调用方要么接受推断、要么用 `model.compat` 覆盖。DSH 为此建了 34 字段的 drift gate（wire-compat 笔记）。0.86.1 新增 `x-session-id` 就是一次「升级即改变出站请求」的实例。
3. **错误被压扁**：状态码与原始 `cause` 在 pi-ai 边界丢失；DSH 只能正则认文本（`stream.ts:34-68`）。
4. **半截参数被流式解析**：`parseStreamingJson` 在每个增量上回填 `arguments`，与 PF-009「收齐才解析」相反；MR 用自存原始串绕开。
5. **静默降级**：非视觉模型收到图时被换成占位文本，不报错。
6. **双层包裹是否必要**：MR 里不存在 DSH 式双层（`model/execution` 直接调 pi-ai）；但仓库里并存两套模型输出词汇（`model/llm` 的 `StreamChunk` 与 `model/execution` 的 `PrivateChunk`），无映射代码。
7. **MR 的已知问题**：`recover()` 只记诊断、不 inspect；`DispositionCodec`/`ActiveFrameCodec` 注入待 round-3，而 round-2、round-3 两稿均被拒（台账）；预算预留组合超出现行要求；推理与 anthropic 路由不可用。
8. **上游 issue**：#8940（D-019 引用，旧评估称 open）本轮不联网，状态待核实；源码 `3390bd9` 显示问题未修。

## 8. 与产品正文的对照缺口（只报告，不裁决）

| 编号 | 观察 | 涉及正文 | 性质 |
|---|---|---|---|
| G1 | PF-013 §5.13 写「首 token 之前它没有任何外部效果」。传输层看到的是：请求到达 OpenRouter 后、首 token 之前，上游可能已受理并开始计费；MR 与 D-019 都把「已发出」当作可能有费用的外部效果处理。OpenRouter 在此窗口是否计费本轮未核实 | [PF-013 §5.13](../../../design/product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token) | 可能矛盾，待实测 |
| G2 | 「首 token」没有定义到传输可观察的事件：响应头到达、首个思考增量、首个工具调用增量是否都算「开口」。pi-ai 的 `start` 早于任何内容，MR 失败分支只算文本与思考 | PF-013 §5.4、§5.13 | 定义缺口（可能归技术设计） |
| G3 | PF-013 模态含「视频」，PF-009 七类块里没有视频块 | [PF-013 §4 模态](../../../design/product/PF-013-model-profiles-and-invocation/design.md#模态)；[PF-009 块](../../../design/product/PF-009-context-message-types/design.md#消息的内容是一串块不是一段文本) | 两份正文不对齐 |
| G4 | PF-013 档案「允许的供应商及次序 + 允不允许回退」若交给 OpenRouter 服务端回退执行，换家发生在一个 HTTP 请求内部，§5.5「试过又失败的留痕」与 §5.12「已试过哪些」都拿不到 | PF-013 §4、§5.5、§5.12 | 架构约束（非产品缺口） |
| G5 | 「BYOK」在 D-019 指 OpenRouter `is_byok`，在 PF-013 §5.6 语境里常被用来指范围自带 OpenRouter key；两处都没有给这两个概念各自定名 | D-019 `:27`、`:76`；PF-013 §5.6 | 术语缺口（统一语言） |
| G6 | PF-001 §6.4 要求逐条成本，但没说成本拿不到时明细里写什么；传输层对失败与中断调用只能给 unknown | PF-001 §6.4 | 小缺口 |

## 9. 没找到的

- 任务提到的 minimal-runtime 台账「i16 段落」：两份台账都没有（见 [E7](../evidence.md#e7-minimal-runtime-施工台账)）。
- 0.86.x 发布物：本机只有 0.85.1 与另一仓库的 0.82.1。
- 0.86.1 的 OpenRouter 目录数据：`src/providers/data/` 是生成物，被 `.gitignore` 排除，不在源码归档里。
- pi 源码里任何 serving provider / 实际费用 / BYOK 的字段：零命中。
