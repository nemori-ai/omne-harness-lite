# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`data.model-response` v2 是 `candidate`（2026-09-23 起草），未接受、未冻结；没有提供者设计、没有源码、没有装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。起草时一条都未执行；**V-1 的本地自检跑过四次**（整批对齐、凭据对齐、第一轮评审修复、修复波 2，都只判通过与拒绝，见[结果与反例](#结果与反例)），其余义务仍未开始。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v2/examples.md) 第一、二节的每个 JSON 块过根模式，结果与块前的「预期」逐一对上；拒绝的那些还要核对给出的拒绝值符合 [S-27](v2/contract.md#s-27-表示层拒绝值) 的次序 | Draft 2020-12 校验器；需要五份依赖契约的 Schema 已就位 | [S-6](v2/contract.md#s-6-responseid)～[S-15](v2/contract.md#s-15-故障的成因与原样状态码)、[S-17](v2/contract.md#s-17-首-token-与时序)、[S-19](v2/contract.md#s-19-用量与费用)、[S-20](v2/contract.md#s-20-上游原始响应留存)、[S-26](v2/contract.md#s-26-schema-的范围)、[S-27](v2/contract.md#s-27-表示层拒绝值)、[S-35](v2/contract.md#s-35-晚到的那一条) 的**形状那一面** | **本地自检，最近一次在修复波 2（2026-09-25）**：42 个块（通过 13、拒绝 29），0 处不符；**给的是哪一个拒绝值没有机判**，只由人按 S-27 次序逐块核过 |
| V-2 | **两次发出、两条响应体、两笔钱**（[S-29](v2/contract.md#s-29-两次发出两条响应体两笔钱)） | 规范场景演练：注入上游 503，默认重试挂件换一家 | [S-4](v2/contract.md#s-4-一次调用一次发出一条响应体)、[S-8](v2/contract.md#s-8-第几次发出)、[S-19](v2/contract.md#s-19-用量与费用)、[S-23](v2/contract.md#s-23-同一次调用的响应体序列)、[S-24](v2/contract.md#s-24-一条响应体对应上游的一次请求) | **未开始。**需要模型请求运行时的提供者。**必须数响应体的条数**——只看最后一条成功，一个把失败的那次吞掉的实现看起来完全正常 |
| V-3 | **首 token 之后的故障**（[S-30](v2/contract.md#s-30-首-token-之后的故障)），且换上一件「见 429 就重试」的挂件 | 规范场景演练 ＋ 故障注入（流吐出一段之后断开） | [S-13](v2/contract.md#s-13-收场与其余成员的条件关系)、[S-14](v2/contract.md#s-14-回复与已交付部分)、[S-15](v2/contract.md#s-15-故障的成因与原样状态码)、[S-17](v2/contract.md#s-17-首-token-与时序)、[S-23](v2/contract.md#s-23-同一次调用的响应体序列) | **未开始。**「换上一件会乱重试的挂件」是这条的全部分量：默认挂件本来就不会重试，只跑默认的证明不了「挂件推翻不了」 |
| V-4 | **用户中断的两支**（[S-31](v2/contract.md#s-31-用户中断的两支)），同一次演练里跑；外加系统取消运行（会话归档、首 token 之后）那一支：没有回复、带 `delivered` | 规范场景演练 | [S-12](v2/contract.md#s-12-收场)、[S-13](v2/contract.md#s-13-收场与其余成员的条件关系) | **未开始**。第三支是反向断言：一个「取消一律先收口出回复」的实现过得了前两支，过不了它 |
| V-5 | **没发出去的调用没有响应体**（[S-32](v2/contract.md#s-32-没发出去的调用没有响应体)）；另加一条**写入者检查**：代码里没有任何一处给响应体写 `withdrawn`、`scope_disallowed`、`modality_mismatch` | 规范场景演练 ＋ 写入者的静态检查（形式归 realization） | [S-4](v2/contract.md#s-4-一次调用一次发出一条响应体)、[S-16](v2/contract.md#s-16-发出了的才有响应体) | **未开始** |
| V-6 | **参数不静默丢、不静默改**（[S-33](v2/contract.md#s-33-参数不静默丢不静默改)）三支：认不得的统一项、认不得的 `extra` 项、上游只认更窄取值域而改值 | 规范场景演练，同时抓发往上游的请求体 | [S-11](v2/contract.md#s-11-实际发出的参数改过的值与没发出去的项) | **未开始。**必须同时看响应体与真实请求体；只看响应体，一个「列了名字但其实发出去了」或「记的值不是发出去的值」的适配层也会通过 |
| V-7 | **凭据不进响应体**（[S-34](v2/contract.md#s-34-凭据不进响应体)） | 故障注入：上游错误原文与响应头里带已知凭据样式文本 | [S-21](v2/contract.md#s-21-写入之前脱敏) | **未开始，且判据受阻于 [G-5](v2/contract.md#七已知缺口)**：脱敏规则未定，只能用「已知凭据原文不出现」一种判法 |
| V-8 | **无隐藏重试**：在传输层注入一次可重试的失败，数上游实际收到的请求数与写下的响应体条数，两者相等 | 提供者设计核对（传输适配是否指定单家、禁止回退）＋ 规范场景演练 | [S-24](v2/contract.md#s-24-一条响应体对应上游的一次请求) | **未开始。**需要 pi-ai 定向 fork 的传输适配（D-019）；比较门里「无隐藏重试」那一项与这里是同一件事，**各自记结果，不互相顶替** |
| V-9 | **写入者的跨字段约束**：`reply.response = id`；`id` 就是「已出门」上定下的那一个，写响应体的各方沿用；`firstTokenAt` 与「已开口」一致；三个时刻的先后；`upstreamModel` 不被冒填；`provider` 在档案允许的供应商里、第一次发出是第一家、不许回退时恒是第一家；`droppedParameters`／`parameterAdjustments`／`parameters` 三处对得上，**且与同一次发出的「已出门」逐项相同**（S-11 第 6 条；「已出门」那一侧的场景在 `capability.model-request-runtime` 的验证入口）；`extra` 全丢时 `parameters` 里整个 `extra` 缺席；`initiator = run_cancelled` 带 `reply` 只出自用户取消运行；`unrecognized` 带痕迹；`ResponseId` 不取上游 id | 写入者的单元与契约测试（形式归 realization） | [S-6](v2/contract.md#s-6-responseid)、[S-9](v2/contract.md#s-9-路由留痕)、[S-11](v2/contract.md#s-11-实际发出的参数改过的值与没发出去的项)、[S-13](v2/contract.md#s-13-收场与其余成员的条件关系)、[S-14](v2/contract.md#s-14-回复与已交付部分)、[S-15](v2/contract.md#s-15-故障的成因与原样状态码)、[S-17](v2/contract.md#s-17-首-token-与时序) | **未开始。**这些条款**全在 Schema 之外**（[examples.md 第三节](v2/examples.md#三schema-挡不住但同样非法的)），V-1 全绿也不支持其中任何一条 |
| V-10 | **同一次调用的序列性质**：对任意一次调用读全部响应体，核对 `dispatch` 不重不跳、只有策略那一类失败之后才有下一条、`reply` 至多一条且在最后 | 对演练产生的日志做序列核对；需要时由能力契约的行为模型承担 | [S-8](v2/contract.md#s-8-第几次发出)、[S-23](v2/contract.md#s-23-同一次调用的响应体序列) | **未开始。**停机那一支的补写者与收场已由 `capability.model-request-runtime` v2 S-33 给出（原 G-7） |
| V-11 | **首 token 缺席是断言**：让运行时在首 token 之后、写响应体之前停机，恢复后核对没有任何一条把这一次写成「没开口」 | 故障注入（杀进程）＋ 恢复演练 | [S-18](v2/contract.md#s-18-首-token-缺席是一条断言) | **未开始**：停机后谁补写、首 token 怎样判得出，已由 `capability.model-request-runtime` v2 S-33、S-15 给出（原 G-7），演练需要它的提供者 |
| V-12 | **写下即不变**：补账之后原响应体逐字不变；原始响应附件被清理之后响应体逐字不变 | 规范场景演练 | [S-19](v2/contract.md#s-19-用量与费用)、[S-20](v2/contract.md#s-20-上游原始响应留存)、[S-22](v2/contract.md#s-22-写下即不变) | **未开始** |
| V-14 | **晚到的那一条标 `late`**：①让属于某个运行的调用在「已出门」之后、响应体写下之前停机，新的一次尝试对账补写——核对那一条带 `late: true`、`attemptId` 是出门所在的那次尝试、承载它的条目归到哪一组；②一次尝试被取代时让一次发出仍在途，之后结算——同样带 `late`；③当场写下的、尝试仍是当前的那一条**不带** `late`；④不属于任何运行的调用停机后补写的那一条不带 `late` | 故障注入（杀进程）＋ 恢复演练 ＋ 栅栏演练 | [S-8](v2/contract.md#s-8-第几次发出)、[S-35](v2/contract.md#s-35-晚到的那一条) | **未开始。**需要模型请求运行时与尝试栅栏的提供者；③④是反向断言——一个「补写的一律标 `late`」的实现过得了①却过不了④ |
| V-13 | **回复在落盘之前被否决**（[examples.md E-8](v2/examples.md#e-8-同一个-run-里前后两次调用前一次的回复被否决) 的场景）：挂一件对第一份回复必定否决的拓展件，核对①那次调用以 `complete`／`truncated` 加 `replyDisposition = { vetoed }` 结束、不带 `failure`；②**这次调用没有第二条响应体**，再试的那一条属于一个新的 `callId`、`dispatch = 1`；③被否决那份 `reply.id` 在会话日志里找不到消息，落盘那份找得到；④两笔用量与费用都在账上 | 规范场景演练；需要 `data.loop-extension` 的否决落点与模型请求运行时的提供者 | [S-13](v2/contract.md#s-13-收场与其余成员的条件关系)、[S-14](v2/contract.md#s-14-回复与已交付部分)、[S-17](v2/contract.md#s-17-首-token-与时序)、[S-19](v2/contract.md#s-19-用量与费用)、[S-23](v2/contract.md#s-23-同一次调用的响应体序列) | **未开始。**②是这条的分量：把再试写成同一调用的 `dispatch = 2`，Schema 放得过（[examples.md 第三节](v2/examples.md#三schema-挡不住但同样非法的)），只有数 `callId` 才看得出首 token 规则被开了例外 |

## 已知缺口

**本节是提供者层的事实与取证状态，不写进契约条款**（契约的 [G-10](v2/contract.md#七已知缺口) 指到这里）：

- **pi 传输层不读 OpenRouter 的真实费用。**pi 钉 `3390bd9` 的传输层（`packages/ai/src/api/openai-completions.ts` 的 `parseChunkUsage` 与 `anthropic-messages.ts`）
  **只从上游读四类 token，费用按本地价目表算（`calculateCost`）**，不读 OpenRouter 回的 `usage.cost`。
  所以 [D-019](../../../record/decisions/model-provider-pi-ai-fork/decision.md)「实际费用不能被目录估算冒充」在 fork 时要**自己加读取**：响应读 `usage.cost` 与 `cost_details`。**请求不必带任何参数**——现行文档写明用量总在流的最后一个 SSE 块里，`usage: { include: true }` 与 `stream_options: { include_usage: true }` 已弃用、不起作用（研究 [E11](../../../../research/model-request-transport-sources/evidence.md#e11-openrouter-官方文档usage-accounting2026-09-23-抓取)；本节原写「请求带 `usage: { include: true }`」出自 E2 的旧观察，2026-09-25 按 E11 改写，主线裁定 D-060 N-40，pi-ai 传输节点 PAT-N16）。`cost` 的单位是 credits，换算归提供者设计（同一条研究）。
- **这两个字段名出自 OpenRouter 的用量核算文档，未钉存取证。**owner：模型请求运行时的提供者设计；闭合条件：钉 SDK 版本时一并取证，结果回填本节。
- **在这之前，任何实现写出来的 `cost_usd` 若来自本地价目表，都违反 [S-19](v2/contract.md#s-19-用量与费用) 第 2 条**——它必须是 `unknown`，而不是一个估算值。

## 结果与反例

### 本地自检：Schema 正反实例（修复波 2，2026-09-25）

同上一次的口径（`jsonschema` 4.26.0、`Draft202012Validator` ＋ `referencing`，`uv run --offline`，设计根下全部 Schema 按 `$id` 登表；脚本在会话暂存区，不入库），第一、二节 **42 块，0 处不符**（通过 13、拒绝 29）。本轮本契约只改了 Schema 的一处说明与实例的说明文字；重跑是因为 `data.content-blocks` 收紧了完整工具调用块的 `tool`（`reply` 里的调用块取它）。**这不是 V-2 以后任何一条义务的证据。**

### 本地自检：Schema 正反实例（第一轮评审修复，2026-09-24）

**工具**：CPython ＋ `jsonschema`（`Draft202012Validator`）＋ `referencing`，按仓库 `uv.lock`（`uv run --locked`），设计树下全部 `*.schema.json` 按 `$id` 建 registry；脚本在会话暂存区，不入库。
**输入**：[`examples.md`](v2/examples.md) 第一、二节每个 JSON 块作根模式实例（第四节那条 `CostCorrection` 不是响应体，不参与）。

| 预期通过 | 预期拒绝 | 不符 |
|---|---|---|
| 13（E-1～E-12，E-6／E-7、E-8a／E-8b 各两块） | 29（R-1～R-29） | **0** |

**只判通过与拒绝**：拒绝值是哪一个仍由人按 S-27 次序逐块核（校验器报的错落在哪一支）；新增的 R-25～R-29 各恰违反一处。第三节不参与。**这不是 V-2 以后任何一条义务的证据。**

### 本地自检：Schema 正反实例（整批对齐，2026-09-24）

**工具**：Draft 2020-12 校验器（`jsonschema`，按仓库 `uv.lock`），以对齐后整棵设计树的全部 Schema 建 registry；脚本在任务暂存区，不入库。
**输入**：[`examples.md`](v2/examples.md) 第一、二节每个 JSON 块作根模式实例，块前「预期」给出通过或拒绝。

| 预期通过 | 预期拒绝 | 不符 |
|---|---|---|
| 12（E-1～E-11，E-6／E-7、E-8a／E-8b 各两块） | 23（R-1～R-23） | **0** |

**只判通过与拒绝**：给出的是不是块前写的那个拒绝值，校验器不回答——Schema 只报「不合法」，给哪个值由 S-27 的次序定；本轮按错误落在哪一支逐块人工核过，每个反例恰违反一处（R-10 为此补了一条 `localError`）。
第三节的反例不参与，它们本来就过得了 Schema。**这不是 V-2 以后任何一条义务的证据。**

### 尚无的记录

规范场景 S-29～S-34 与写入者检查尚无执行记录。首次执行时在此记录工具与版本、环境、配置、输入范围、可复现步骤与原始结果位置；
原始产物归 [record/evidence/](../../../record/evidence/README.md)。记录时分开陈述：Schema 校验的结果、规范场景演练的结果、真实组合的符合性。

## 实际执行

| run id | 本契约的哪条义务 | 结果 | evidence |
|---|---|---|---|
| —— | —— | **没有任何一次运行覆盖本契约** | —— |

**catalog 登记**（2026-09-23，`candidate`）**不产生任何证据**，它只是把坐标与资源放进采用面。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建。**理由在[包入口](README.md#版本包)：本契约没有状态转移，收场条件是一张有限判定表，由 Schema 与正反实例逐格覆盖；
[S-23](v2/contract.md#s-23-同一次调用的响应体序列) 的序列性质是写入者的行为，需要行为模型时归 `capability.model-request-runtime`。
**这不是把义务省掉**：它被改写成了 V-1（形状）、V-10（序列核对）与 S-29～S-34 六条规范场景。

## 变化的影响

- **2026-09-23 首次起草**（`candidate`，本分支 `panqiwei/assets-runtimes-spec-response`，基线 `e949df8`）。
  **起草时五份依赖契约都没有定型**，本契约只按施工简报账本引用它们的名字。**每一份定型时要复核的东西逐条列在下面**；
  复核不过就是本契约要改的地方（未冻结，原地改，并在本节追加一条）：

  | 依赖 | 本契约用了它的什么 | 它定型时要复核 |
  |---|---|---|
  | `data.call-accounts` v2 | `$defs/Usage`、`$defs/Cost`；`CostCorrection` 的目标形状 `{ kind: model_response, responseId }` 与 `obtainedVia`；汇总规则（`unknown` 单独计数、取最新更正）；**2026-09-23 修订起**还有 `$defs/RunId`、`$defs/AttemptId`（整数）、`$defs/ModelCallId`——本契约对这三个直接 `$ref` 过去 | `$defs` 名与成员名；「来源 = 无」时四项全 `unknown` 的写法；**对齐义务：那三个标识的定义要补进它**——补进之前本 Schema 的这三处 `$ref` 解析不了，V-1 跑不起来；补进后核对 `AttemptId` 是从 1 起的整数序号（本契约 [S-7](v2/contract.md#s-7-所属的那次调用)）。**`ResponseId` 的家按主线裁定在本契约**（[S-6](v2/contract.md#s-6-responseid)），它那边按 `data.identity-values` S-31 的散文自定义、**不 `$ref` 本契约**（避免两份 Schema 互相引用），对齐时核对两处表示逐字等价；catalog `clauses` 由 `$defs/…` 换成它的条款号，**并补上汇总规则所在的那一条**（它没有 `$defs`，起草时无从填占位） |
  | `data.content-blocks` v2 | `$defs/ContentBlock`（`delivered`）、`$defs/AttachmentRef`（`raw.body`）；没长完的工具调用两位皆假的规则 | `$defs` 名；实例里块的成员名（`kind`、`visibility`、`complete`、`rawArguments`…）；`AttachmentRef` 的成员 |
  | `data.messages` v2 | `$defs/AssistantMessage`；它的 `response` 成员与 `ending` 三值（`complete`、`interrupted_by_user`、`truncated_at_limit`） | 成员名与三值是否与本 Schema 的 `ending` 条件逐字一致；**它也在本地立了 `ResponseId`**（家指向块 C）——改为引用本契约 |
  | `data.model-profile` v2 | `$defs/ModelProfileRef`、`$defs/ProviderName`、`$defs/ModelRequestParameters`；参数词表的成员名（`droppedParameters` 的项名取它） | `$defs` 名；`ModelProfileRef` 能否表示**官方档案**（它在出厂默认层，而 `data.identity-values` 的 `ScopeLayerIdentity` 不含那一格）；词表成员名 |
  | `data.loop-extension` v2 | `$defs/FailureCause` 的八值 | 八个名字与本契约 [S-15](v2/contract.md#s-15-故障的成因与原样状态码) 列的逐字一致；`data.arrival-events` 那份不透明的 `FailureCause` 形状同样要改为引用它；**2026-09-23 修订起**还要核对它在「消息落盘之前」给出的否决结论与本契约 `replyDisposition.vetoed` 的 `by`、`reason` 同名同义，以及「否决之后再试是新的模型调用」在两边说法一致 |

  起草时另有两处本契约自己的引用留给整批对齐（`RunId`／`AttemptId`／`ModelCallId` 的家；三个不透明标识 `$ref` 了 `data.identity-values` 的 `OpaqueIdentifier`，
  而那个定义的说明限本文件复用）——**两处都已由下一条的主线裁定处理**。

  **对证据的影响**：无——还没有任何证据。

- **2026-09-23 主线裁定后就地修订**（仍 `candidate`，未冻结，同一分支第二条提交）。六项：

  | 裁定 | 本契约改了什么 | 对证据的影响 |
  |---|---|---|
  | 回复在落盘之前被否决（与 `data.loop-extension` 对齐） | 新增成员 `replyDisposition ∈ persisted \| { vetoed: { by, reason? } }`，只在 `complete`／`truncated` 上且在那里必有；否决不改写收场、不带 `failure`，这次调用就此结束，再试是 loop 另起的新调用（新 `callId`）；首 token 规则**不加例外**，S-23 序列性质不变。改了 [S-1](v2/contract.md#s-1-本契约拥有什么)、成员表、[S-5](v2/contract.md#s-5-与别的形状的关系)、[S-12](v2/contract.md#s-12-收场)～[S-14](v2/contract.md#s-14-回复与已交付部分)、[S-17](v2/contract.md#s-17-首-token-与时序)、[S-23](v2/contract.md#s-23-同一次调用的响应体序列)、[S-26](v2/contract.md#s-26-schema-的范围)、[S-27](v2/contract.md#s-27-表示层拒绝值) 与性质表；G-6 闭合；新立 [G-12](v2/contract.md#七已知缺口)（`interrupted` 的那份被否决时无表示）；examples 新增 E-8（同一 Run 前后两次调用，前一次 `vetoed`）与 R-17、R-18 | V-1 的实例多了 E-8a／E-8b、R-17、R-18，全部正例补了 `replyDisposition`；新增 V-13；V-2、V-3、V-10 的判据不变 |
  | `upstreamModel` 可缺席、`attemptId` 是整数序号 | 维持起草时的推导，未改 | 无 |
  | 两个新拒绝值 | `failure_on_success`、`reply_ending_mismatch` 排在 `failure_on_interrupted` 之后；原先落在 `malformed` 的这两种情形改给具名值，`malformed` 只剩成员层面的不合与 `replyDisposition` 的有无；Schema `allOf` 仍是十支（具名的由六支变为八支，标 `malformed` 的由四支变为两支、改管 `replyDisposition` 的有无），`if/then` 由十四处变为十六处 | V-1 要核对的拒绝值变了：R-15、R-16 的预期改为具名值 |
  | 标识的家 | `RunId`、`AttemptId`、`ModelCallId` 改为 `$ref` `data.call-accounts` v2（上表那一行的对齐义务）；`ResponseId` 的家在本契约；G-1、G-2 闭合 | V-1 多了三处要等 `data.call-accounts` 补定义才能解析的引用 |
  | 不跨契约 `$ref` `OpaqueIdentifier` | `ResponseId` 按 `data.identity-values` S-31 的散文自定义（非空、首尾无空白，pattern 逐字照那张码点表）；本契约对 `data.identity-values` 不再有 Schema 引用，只有条款引用 | 无；V-1 少一处外部引用 |
  | 8b／Q14 的依据落为 D-058 | 设计依据行改为「D-058 8b ／ Q14」；G-11 闭合。**D-058 在 HUB 上，本分支看不到**，依据行暂写成文字——**合入后补成链接**，是对齐或合入那一步的事 | 无 |

  catalog：`data.call-accounts` 那条依赖的 `clauses` 补了 `$defs/RunId`、`$defs/AttemptId`、`$defs/ModelCallId`。
  covers：PF-012「消息落盘之前的否决」由缺口登记改为常规覆盖（S-13、S-14、S-23），PF-013「已经开口说话了」的注记与全局注记去掉 G-6／G-11 的说法。

- **2026-09-24 整批对齐（候选，未冻结，原地改）**：依据行写「主线裁定 2026-09-23，待产品负责人确认」的，出处在主线的裁定清单。

  | 改了什么 | 依据 | 条款 | Schema | 实例 |
  |---|---|---|---|---|
  | `replyDisposition` 加第三值 `{ consumed: { by: compaction \| side_query } }`；改为与 `reply` 同在同缺（含被中断有回复的那支）；G-12 闭合 | 对账块 D；读数报回 S8-e | S-1、S-5、S-13、S-14、S-23、S-27 | `ReplyDisposition`；两支 `malformed` 改判据 | E-3 补 `persisted`；R-18 改成「被中断的回复不带它」；新增 E-9 |
  | `interrupted` 带 `initiator ∈ user \| run_cancelled \| runtime_lost`；开了口却没有回复的被中断一行（`delivered` 有才带）；`runtime_lost` 不带回复；首 token 之前失联可续接再发；G-7 闭合 | 账本 RP-24、S16-g；`capability.model-request-runtime` S-33、S-36 | S-8、S-12、S-13、S-14、S-23 | `initiator`；删 `first_token_inconsistent` 第⑥支；加两支 `malformed` | 全部被中断的块补 `initiator`；R-14 换题；新增 E-10、E-11、R-19、R-20 |
  | `attemptId` 从 `call` 挪到每一次发出，跨尝试连续；`call.runId` 对不属于任何运行的调用必无 | 账本 C-R7、C-14 | S-7、S-8、S-19、成员表 | `ModelCallRef`、`attemptId`；一支 `malformed` | 全部 27 块改写；新增 R-21 |
  | `route.profileSnapshot`（`$ref` `data.model-profile` 的 `ModelProfileSnapshot`）、`route.credentialScope`（出厂格或 `ScopeLayerIdentity`，新 `$defs` `CredentialScope`） | 账本 C-R1、C-12、S16-f | S-9、S-26 | `Route`、`CredentialScope` | 全部块补两项；E-9 用出厂格 |
  | `trims?`（`$ref` `data.call-accounts` 的 `TrimSummary`；缺席即没砍，全零拒绝） | 对账块 D；账本 S4 | S-19、S-26、S-27 | `trims` | E-9；新增 R-23 |
  | `unrecognized` 必带痕迹改为 Schema 管得到；`failure` 加 `localError` | 对账块 C（SAF-17）；与 `capability.model-request-runtime` S-18「本地错误」对齐 | S-15、S-26、S-27 | `Failure.localError`；一支 `malformed` | R-10 补痕迹；新增 R-22；第三节那一行换题 |
  | `ModelProfileRef` 按 `data.model-profile` 带 `origin` | `data.model-profile` S-13 | — | — | 全部块 |
  | D-058 依据补成链接；G-11 文字、G-1 文字更新；新立 G-13（`run_cancelled` 交出的回复 `ending` 名不副实） | 合入后补链接 | 设计依据、第七节 | — | — |

  **对证据的影响**：V-1 首次有了本地自检；V-10、V-11 解除阻断（仍需提供者）。

- **2026-09-24 跨契约对齐：凭据只在租户层与出厂格（候选，未冻结，原地改）**。依据 [PF-013 rev 10 裁决 33](../../../product/PF-013-model-profiles-and-invocation/decisions.md#2026-09-24--组织那一层不持有凭据每人租户层自取)（组织那一层不持有模型凭据），主线派发：
  - **`CredentialScope` 去掉组织那一支**：[S-9](v2/contract.md#s-9-路由留痕) 成员表、Schema 类型表、「引用的形状由各自的家决定」三处改为「出厂格或 `ScopeLayerIdentity` 的租户那一支」；Schema `$defs/CredentialScope` 第二支由 `$ref ScopeLayerIdentity` 改为 `allOf [$ref ScopeLayerIdentity, layer = tenant]`——形状仍归 `data.identity-values`，不另写一份。**表示变更**：带组织那一格的旧实例按新 Schema 被拒（`malformed`）。
  - **实例**：第一、二节 33 处组织那一格的 `credentialScope` 改为租户那一格（同一租户 `org_7fd2c1`/`acc_91ab40`）；新增 R-24（组织那一格 ⇒ `malformed`）；第三节「实际用的是组织那一把」改为「发起租户自己那一把」。本地自检：第一、二节 36 块按「预期」逐块过 Draft 2020-12 校验器，36 块全部与预期相符（只核通过／拒绝，不核拒绝值名）。
  - **catalog 不变**：仍消费 `data.identity-values` S-11（`ScopeLayerIdentity`）。**covers 新增一条**：PF-013 §5.6（裁决 33 所在）→ S-9，`reviewed: false`。
  - **头部产品依据对到 PF-013 rev 11**（主线裁定 2026-09-24 后核 changelog rev 9–11）：rev 9 的相关项（落盘前被否决不算故障、首 token 之后停机记运行时失联、出厂格凭据、调用规则对每一次模型调用都成立）整批对齐时已按主线账本落入；rev 10 只有裁决 33 触及本契约（即本条）；rev 11 不涉及。
  - **对证据的影响**：V-1 的自检须按新 Schema 重跑（本条已跑一次本地自检，见上）；其余不受影响。

- **将来的触发点**：
  - [G-8](v2/contract.md#七已知缺口) 若结论是「上游仍可能换家」，要加一个成员，接受之后发新版本。
  - 跨进程演化（[S-25](v2/contract.md#s-25-装配给的保证与协议须给的保证) 右列转为协议给）：语义边界改变，发新版本；本版的全部证据只保留其单机范围。
- **（2026-09-24 核 PF-013 rev 12，不改语义）**：头部产品依据保持 rev 11，注明 rev 12（同名按层覆盖、设置记路由名）不改本契约条款——`route.profile` 记的仍是有效模型那一行（`ModelProfileRef`），`selectedBy` 不变。对证据无影响。
- **2026-09-24 第一轮独立评审修复（候选，未冻结，原地改）**。评审见下节；主线对跨契约冲突的裁定按主线修复简报落。改动：

  | 改了什么 | 条款 | Schema | 实例 |
  |---|---|---|---|
  | **`route.parameters` 改记实际发出的值**；新增 `route.parameterAdjustments: [{ name, requested, sent }]` 记改值；`droppedParameters` 含 `extra` 项的键（原约束 3「`extra` 不进 `droppedParameters`」删去）；「要求的那一组」怎样还原、实际发出的值要在统一词表里表示得出 | S-11 重写并改名（锚点 `#s-11-实际发出的参数改过的值与没发出去的项`）；S-3、S-9、S-25 新增一行、S-26、S-33 三支 | `Route.parameters` 说明改写；新增 `Route.parameterAdjustments` 与 `$defs/ParameterAdjustment` | E-2 的 `parameters` 去掉 `seed`；新增 E-12、R-28、R-29 |
  | **新增 `late`**：只取 `true`、缺席即不晚、只在带 `call.runId` 的那一条上；条件与含义照 `data.call-accounts/v2#S-39` | 新增 S-35；S-8、S-22、S-25 新增一行、S-26、S-27、性质表 | `ModelResponse.late`；`allOf` 加一支 `malformed` | E-10 加 `late: true`；新增 R-25、R-26 |
  | **`ResponseId` 由模型请求运行时在写「已出门」时铸**，写响应体的各方沿用 | S-6、S-25 那一行 | `ResponseId` 说明 | — |
  | **归属的权威是承载本条的条目**；`attemptId` 是出门所在尝试的事实、不作归属 | S-3、S-5、S-7、S-8、S-19 | `AttemptId`、`attemptId` 说明 | E-10 说明；第三节加一行；第四节改写 |
  | `initiator` 只指中断发起方，与别处同名的发起者分开 | S-12、成员表 | — | — |
  | 重试挂件不读响应体，只凭 `data.loop-extension/v2#S-14` 的失败主体；响应体序列是那份主体背后的事实 | S-3、S-5、S-23 | — | — |
  | `persisted` 那一条由调用方写；`vetoed`／`consumed` 那一条与其余由运行时写 | S-3 | — | — |
  | 「调模型之后」按 `outcome` 与 `replyDisposition` 判；`consumed` 触不触发登 **G-14** | S-5、第七节 | — | — |
  | 中断提醒对 `truncated` 同样补 | S-5 | — | — |
  | 停机恢复读「已开口」记录，不读响应体；首 token 之后停机即被中断、原因运行时失联；指向已关闭 G-7 的三处改为指向兑现它的条款 | S-3、S-5、S-17、S-18、S-25、G-7 行 | — | — |
  | `provider`：第一次发出走第一家、不许回退时恒是第一家 | S-9 | `Route.provider` 说明 | 档案快照按路由名各取一份（E-2、E-3、E-8a、E-8b 及以它们为底的 R-8、R-16、R-18、R-20）；第三节加一行 |
  | 出厂格凭据只配官方档案，Schema 管得到 | S-9、S-26、S-27 | `allOf` 加一支 `malformed` | 新增 R-27 |
  | `selectedBy = session` 的定义补「会话格之上没有锁」，含沿层级继承来的名字；按 PF-013 rev 12 写成「名字从哪来」 | S-10 | `SelectedBy` 说明 | — |
  | 词条：「一次发出」「模型响应体」「中断提醒」链到词条；「响应体」是本契约内的简称；S-20 改说「上游原始响应的字节」 | S-4、S-5、S-20、S-22 | `RawResponse` 说明 | — |
  | 依据落持久记录：设计依据表与条内的「主线裁定 2026-09-2x、账本／读数报回／对账块」一律改为 D-060 小节链接或产品小节；缺口 owner 里的施工标签换成能力或提供者设计的名字；S-27 里关于账本括注的一段删去（历史在本节） | 设计依据表、S-7、S-9、S-12、S-13、S-14、S-19、S-23、S-27、第七节 | `CredentialScope` 说明 | — |
  | 机械修正：S-13 表「六行」→ 七行（性质表、README）；S-19「四件事」→ 五件事；S-15 形状行与 S-21 覆盖清单补 `localError` | S-13 性质表、S-15、S-19、S-21 | — | 第三节两行并成一行的那处拆开；R-8 补回底例的 `replyDisposition`；R-20／R-21／R-23 改回按底例（E-3、E-9）写；「为了短」的删减写全 |

  **产品依据复核（逐版读 changelog）**：
  - **PF-013 rev 11 → 12**：rev 12 定「用哪个模型」记路由名、同名按层覆盖、锁锁的是名字。`route.profile` 记的仍是落到的那一行；**`selectedBy` 的定义改写为「名字从哪来」**（S-10）。其余条款不受影响。
  - **PF-009 rev 7 → 8**：①「这次尝试的账」统一为「那次模型调用的账」——S-13、S-14 三处措辞随之改；②「已经开口」是账、最终的那一条引用它——S-17 写明本条经 `(call.callId, dispatch)` 指回「已开口」记录、`firstTokenAt` 与它相同，不另存指针；③ `SystemMessage` 不落日志、工具帧收尾、入站语音——不涉及本契约。
  - **PF-004 rev 10 → 12**：I-4 的时间尺度（rev 11）、构成变小也重新装配（rev 12）。本契约引用的 §6.6 与 I-5 未变，**条款不改**。
  - **PF-012 rev 10 → 14**：rev 11 的 I-11 收窄（迟到的账照样落、归这个 Run、标明迟到）落为 **S-35 `late`**；rev 11 的落盘前否决（调用照常结束、不交给重试挂件、另起新调用）本契约已有（S-13、S-14、S-23）；rev 11 的恢复对账两行本契约已有（S-12、S-23）；rev 12 的拓展件不可用处置、rev 13–14 的转换件不是资产——**不涉及本契约**。
  - **PF-001 rev 16 → 17**：§6.4 末尾补「实际费用拿不到时记什么，归 PF-013」——与 S-19 第 2 条一致，**条款不改**；其余（权限锁的是界、提升不动持有）不涉及本契约。
  - **PF-011 rev 4**：已是当前 rev。

  catalog：本契约依赖的条款补齐（`data.call-accounts` 加 S-22、S-23、S-39；`data.content-blocks` 加 S-13；`data.messages` 加 S-21、S-49；`data.model-profile` 加 S-6、S-20、S-21；`data.loop-extension` 加 S-2、S-14、S-25）。`data.identity-values` 的 S-33 **不登**：S-28 写的是本契约自己的规矩，「与 S-33 同一规矩」是类比，不是据以写出的消费。
  covers：各条 note 的 rev 改到当前、过时的说法（G-7 登记、G-12 未定、重试挂件读响应体、参数留痕、有效模型「怎么来的」）改写；按设计依据表补登几条缺的条款（§5.5 补 S-8、S-23，flows §3.2 补 S-16，「选中模型与有效模型」补 S-9，「它看得到什么」补 S-5、S-23，§5.13 补 S-12、S-35）；新增一条 PF-012 §6.17 → S-35。全部 `reviewed: false`。
  **对证据的影响**：V-1 按新 Schema 重跑（上节，42 块 0 处不符）；V-6、V-9 的判据扩大；新增 V-14。

- **2026-09-24 修复波 1b（主线裁定 [D-060 §六 L4](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)；候选未冻结，原地改）**：`data.messages` S-49「已出门」加 `parameterAdjustments`、`droppedParameters`，形状按本契约 S-11 逐字自定义（它不反向 `$ref` 本契约，否则依赖成环）；本契约 [S-11](v2/contract.md#s-11-实际发出的参数改过的值与没发出去的项) 加第 6 条「与『已出门』逐项相同」，停机补写的一方从那条读。
  **本契约的 Schema 与实例不变**（`$defs/ParameterAdjustment` 早已暴露，`data.messages` 不引用它），V-1 不重跑；catalog 依赖不变（`data.messages` 的 S-49 早已登记）。

- **2026-09-25 修复波 2（主线裁定 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) M2、M12、M25、M28 与 [§四](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#四被推翻或被覆盖的项追加登记)「L4」「K14」两行；候选未冻结，原地改）**——逐条处置见[独立评审「第二轮」](#第二轮2026-09-25)：
  - **M12（G-13 关）**：系统发起的运行取消（会话归档、宿主停止）与宿主被撤下，在途的流被放弃——`finish` 是 `lost`，这一次发出却记 `interrupted`、`initiator = run_cancelled`、**没有回复**、带 `delivered`；用户取消运行时已交付的那一份仍可成为回复（`interrupted_by_user` 说的正是那位用户）。S-5 的到达映射加第三处例外、S-12 的 `run_cancelled` 释义、S-13 的两条说明（「开了口、没有回复」的来由；`run_cancelled` 带 `reply` 只在用户取消时成立，Schema 管不到）、S-26「它不能约束的」、S-31 加系统取消那一支、Schema `initiator` 说明、实例 E-11 标题与依据、第三节加一行。**表示不变**：G-13 原先预告的「收成没有回复」本来就是 Schema 放行的那一行，不需要新版本。
  - **G-14 关**（R2b R2-MR-2）：`consumed` 不触发「调模型之后」，S-5 那一分支改引 `data.loop-extension/v2#S-2` 与 D-060 §六 N-2。
  - **M25**：S-35 写明锚是发出所在的尝试（`attemptId`），不是条目给的归属；与 `data.call-accounts/v2#S-39` 同一句（那一侧由同一位起草者同轮改）。
  - **M28**：S-11 的 `parameters` 一行写明 `extra` 的键全没发出时整个 `extra` 缺席；第 4 条的还原补「加回 `extra` 项时重新立起这个成员」，并补「最直接的是取同一次发出的『已出门』上的 `parameters`」（R2-MR-6）。
  - **M2**：S-11 第 6 条写明 L4 的「`$ref`」已由 D-060 §四 改为「逐字自定义 ＋ 对齐义务」，本契约是那两项形状的家。
  - **R2-MR-4**：S-25「如实留痕」一行的协议列改为「在出网之前交回写『已出门』的一方」，与 `capability.model-request-runtime` v2 S-38 传输适配第 10 条同一句；「做不到会怎样」写明假留痕。`data.model-profile` S-23 同一行由同一位起草者同轮改。
  - **R2-MR-5**：设计依据表「`ResponseId`」一行改为「`persisted` 由调用方写、`vetoed`／`consumed` 由运行时写」并引 K15、K36；新增两行引 K13／K14／K16 与 M2／M12／M28；抬头依赖表 `data.messages` 一行补 S-49 的参数与处置清单、S-10 的回复流对应；抬头产品依据补 PF-010 rev 6（只取要求三那一句）。
  - **R2-MR-6**：V-9 补「与同一次发出的『已出门』逐项相同」与本轮两条写入者义务；S-11 第 4 条补直接取「已出门」那条路。
  - **证据**：Schema 只改了一处说明、实例只改了说明文字，V-1 照同一口径重跑：42 块 **0 处不符**（通过 13、拒绝 29；`data.content-blocks` 本轮收紧了完整工具调用块的 `tool`，所以一并重跑）。**catalog**：对 `data.model-profile` 的依赖补 `S-19`（S-11 据它写出「`extra` 去空即缺席」；抬头依赖表同改）；`data.messages` 的 S-10、S-49 与 `data.loop-extension` 的 S-2 早已登记。

结果不改写规范。发现语义问题回到来源设计（PF-013／PF-009／PF-012），不在这里改契约。
- **2026-09-25 修订波：pi-ai 传输节点反推**（仍是 `candidate`，未冻结，原地改；主线裁定 [D-060 §八 N-40](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ④）：
  - **`failure` 加成员 `inBand`**（PAT-N4）：状态码有两种来处——HTTP 层失败取 HTTP 状态，流已开始之后的带内错误取带内 `code` 并带 `inBand: true`；`inBand` 只取 `true`、只能与 `statusCode` 同在（[S-15](v2/contract.md#s-15-故障的成因与原样状态码)；Schema `Failure` 加 `inBand` 与 `dependentRequired`；[S-27](v2/contract.md#s-27-表示层拒绝值) `malformed` 那一行补两种情形）。场景 S-30 改为「首 token 之后在流里回带内错误 429」。实例：E-5 改为带内 429、带 `inBand: true`，由它派生的 R-7、R-12 同步；新增 R-30（有 `inBand` 没有 `statusCode` ⇒ `malformed`）。**表示变了**：原先流开始后的状态码不加标记；已有的消费者（`capability.model-request-runtime` S-18、S-29 ⑤）同波改写。`data.loop-extension` 的失败主体、`data.arrival-events` 收尾的 `error` 同一个成员、同一个意思，同波加上。
  - **第 33 行那条说明按研究 E11 改写**（PAT-N16）：`usage: { include: true }` 已弃用、不起作用，请求不必带参数，只需读响应里的 `usage.cost` 与 `cost_details`。
  - **证据（只核形状）**：暂存区脚本（不入库），`jsonschema`（锁定 uv 环境，`Draft202012Validator` ＋ `referencing`），设计根下全部 `*.schema.json` 先过元 Schema、再按 `$id` 登表：E-5 **通过**；R-7、R-12 **拒绝**（与改前同）；R-30 的 `failure` 段按 `Failure` 判**拒绝**（`dependentRequired`）；`inBand: false` 拒绝。另核了 `data.loop-extension` 失败主体与 `data.arrival-events` 收尾两处的 `dependentRequired` 生效。**只核这 4 个实例与 3 处约束**，不是整批重跑，也不是 V- 义务的执行证据；**没有既有执行证据因此作废**。

## 独立评审

**第一轮**：reviewer 为 spec-reviewer（独立、只读），日期 2026-09-24，基线 HUB `765b01dc`；发现表是那一轮的任务区产物（MR-1～MR-20、与 `data.model-profile` 共有的 MP-14）。处置在 2026-09-24 第一轮修复里落（见上节最后一条）：

| 发现 | 严重度 | 处置 | 落点 |
|---|---|---|---|
| MR-1 参数留痕两份契约各说各的 | 阻断 | **改**：`parameters` 记实际发出的值；新增 `parameterAdjustments`；`droppedParameters` 含 `extra` 项（主线裁定） | S-11、S-9、S-26、S-33；Schema `Route`、`ParameterAdjustment`；E-2、E-12、R-28、R-29 |
| MR-2 `late` 无处可写 | 阻断 | **改**：加 `late`（只取 `true`，缺席即不晚，只在属于运行的那一条上） | 新增 S-35；S-8、S-25、S-27；Schema；E-10、R-25、R-26 |
| MR-3 `ResponseId` 谁在何时铸 | 阻断 | **改**：运行时在写「已出门」时铸，写响应体的各方沿用 | S-6、S-25；Schema 说明 |
| MR-4 归属两个权威 | 应修 | **改**：权威是条目壳，`attemptId` 只是事实 | S-7、S-8、S-19；examples 第四节、E-10 |
| MR-5 重试挂件读不读响应体 | 应修 | **改**：它只凭失败主体；序列是主体背后的事实 | S-3、S-5、S-23 |
| MR-6 「调模型之后」的维度对应 | 应修 | **改**：按 `outcome` 与 `replyDisposition` 判，`vetoed` 不触发；`consumed` 登 **G-14**（owner `data.loop-extension`） | S-5、第七节 |
| MR-7 停机恢复几处过时 | 应修 | **改**：恢复读「已开口」；指向 G-7 的三处与「待产品修订」一句改写 | S-3、S-5、S-18、S-25、G-7 行 |
| MR-8 `provider` 约束不全、正例违反 | 应修 | **改**：写全 model-profile S-5／S-6；实例的档案快照按路由名各取一份，第一家就是第一次发出那一家 | S-9；E-2、E-3、E-8a、E-8b、R-8、R-16、R-18、R-20；第三节一行 |
| MR-9 `truncated` 补不补中断提醒 | 应修 | **改**：补（以 `data.messages/v2#S-10` 为准） | S-5 |
| MR-10 「六行」 | 应修 | **改**：七行 | 性质表、README |
| MR-11 产品依据 rev 过期 | 应修 | **改**：逐版复核后对到当前 rev（复核内容见上节）；PF-009 rev 8 的措辞与「引用已开口」落到 S-13、S-14、S-17 | 抬头、S-13、S-14、S-17 |
| MR-12 统一语言 | 应修 | **改**：词条批已立「模型响应体」（UL-model-response），本契约链它并声明「响应体」为本契约内简称；链一次发出、首 token、中断提醒；「上游原始响应留存」按词条注意 ② 不立 | S-4、S-5、S-20；本页「对齐义务」 |
| MR-13 依据只在任务区账本 | 应修 | **改**：一律改指 D-060 小节或产品小节；账本括注那段删去，历史在上节 | 设计依据表与各条 |
| MR-14 `vetoed`／`consumed` 由谁写 | 应修 | **改**：`persisted` 那一条由调用方写，另两种由运行时写（提交归那份能力契约） | S-3 |
| MR-15 `session` 的定义漏一种情形 | 建议 | **改**：补「会话格之上没有锁，含沿层级继承来的名字」 | S-10；Schema 说明 |
| MR-16 `localError` 漏写；「四件事」 | 建议 | **改** | S-15、S-19、S-21 |
| MR-17 catalog 少登 | 建议 | **改**：补登 call-accounts S-22／S-23／S-39、content-blocks S-13、messages S-21／S-49、model-profile S-6／S-20／S-21、loop-extension S-2／S-14／S-25。**不改**：identity-values S-33——S-28 与它是同一规矩的类比，按 registry 口径类比不登 | registry `catalog.json`；抬头依赖表 |
| MR-18 实例的机械错误与计数 | 建议 | **改**：拆开并成一行的两行；R-20／R-21／R-23 按底例重写；R-8 补回 `replyDisposition`；「为了短」写全；V-1 计数按实际（42 块） | examples 第二、三节；本页 V-1 与结果表 |
| MR-19 出厂格只供官方档案 | 建议 | **改**：写成 Schema 管得到的跨成员约束 | S-9、S-27；Schema；R-27 |
| MR-20 `initiator` 同名不同义 | 建议 | **改**：S-12 注明只指中断发起方，发起者由条目给 | S-12 |
| MP-14 `Instant` 不在 offer-expiry S-22 的表里 | 建议（两份共有） | **改说明，不改登记**：依赖表写明依据是 S-22 末句加上它的 Schema `$defs`；offer-expiry 已冻结 | 抬头依赖表 |

### 第二轮（2026-09-25）

reviewer：spec-reviewer，S25 第二轮批 R2b；基线 HUB `8ad37c50`。本批对本契约的总判是「暂不可进 F」，唯一原因是 R2-MR-1（登记层）。依据一律是 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)；只剩「待产品负责人追认」的不再登缺口。

| # | 发现（等级） | 处置 | 落点 |
|---|---|---|---|
| R2-MR-1 | D-060 L4 写「`$ref` model-response」，两份契约实际逐字自定义（阻断，登记层） | **改依据、不改承诺**（M2）：主线已在 D-060 §四 把 L4 改为「逐字自定义 ＋ 对齐义务」，口径写进 registry README；S-11 第 6 条改引那一行 | S-11 第 6 条 |
| R2-MR-2 | G-14 的闭合条件已满足却没关（应修） | **改**：G-14 关，S-5 的 `consumed` 分支改引 `data.loop-extension/v2#S-2` 与 D-060 §六 N-2；对齐义务同改 | S-5；第七节 G-14；本页对齐义务 |
| R2-MR-3 | `late` 的锚：本契约按「所在」、`data.call-accounts` S-39 按「归属」（应修） | **改**（M25；§四 K14 读作「发出所在的尝试」）：S-35 写明锚是 `attemptId`；`data.call-accounts` S-39 那一句由同一位起草者同轮改成同一句 | S-35 |
| R2-MR-4 | 协议列只要求「随结果回传」处置，停机会留下假留痕（应修） | **改**：两份契约的协议列都写「在出网之前交回写『已出门』的一方」，与 MRR S-38 传输适配第 10 条同一句 | S-25；`data.model-profile` S-23 |
| R2-MR-5 | 依据表一行与正文相反；K13／K14／K16 未引；依赖表 messages 行漏 S-11 第 6 条；PF-010 没列（建议） | **改**：四处全改 | 设计依据表；抬头依赖表与产品依据 |
| R2-MR-6 | V-9 没列「与已出门逐项相同」；S-11 第 4 条只给了一条还原路径（建议） | **改**：V-9 补上；第 4 条补「直接取『已出门』的 `parameters`」 | V-9；S-11 第 4 条 |
| 范围外：G-13（R2b 三节列出，R1 批 MS2-4 同源） | 运行被取消时交出的半截回复 `ending` 名不副实 | **改**（M12）：系统发起的取消不交出回复（带 `delivered`），用户发起的仍是 `interrupted_by_user`；G-13 关，表示不变 | S-5、S-12、S-13、S-26、S-31；第七节；Schema `initiator` 说明；实例 E-11、第三节 |
| 范围外：R5「未覆盖 5」 | `extra` 全丢之后实际发出的那一组怎么写 | **改**（M28）：整个 `extra` 缺席 | S-11 |

## 对齐义务

- **词条链接已补**（第一轮评审修复）：「一次发出」链 [UL-upstream-send](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-upstream-send--一次发出--upstream-send)，「首 token」链 [UL-first-token](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-first-token--首-token--first-token)，「响应体」是 [UL-model-response](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response)（模型响应体）在本契约内的简称；「上游原始响应留存」按那条词条的注意 ② 不立词条，是它身上的一项属性。
- **跨契约同一件事的另一半**（本包不改对方的文件，由主线核对两边）：`capability.model-request-runtime` 的「已出门」铸 `ResponseId`、`route.parameters` 记实际发出的值、`vetoed`／`consumed` 的响应体由它写、`late` 的判定；`data.call-accounts` S-39 与本包 S-35 同一个标记；`data.loop-extension` S-23「它实际发出的参数留痕在响应体」与 S-2 对 `consumed` 的触发（不触发，原 G-14 已关）；`data.messages` S-10／S-21 的中断提醒对 `truncated` 同样补，S-10 的回复流对应表与本包 S-5 的到达映射、S-13 说的是同一件事（系统发起的运行取消不交出回复，M12）；`capability.model-request-runtime` S-36／S-51 撤除时先放弃在途的流、调用账记 `interrupted{run_cancelled}`（同一裁定的那一侧）。
- **`ParameterAdjustment` 与 `droppedParameters` 的形状在 `data.messages` 里有一份逐字副本**（「已出门」，那份契约的 V-12）：本契约是这两项形状的家——按 registry「互引成环的登记口径」（D-060 §七 M2），那份契约逐字自定义、不 `$ref` 本契约、不登依赖；本契约改 S-11 这两项的形状，那边同轮改；同一次发出两处的值逐项相同（S-11 第 6 条），由写两处的 `capability.model-request-runtime` 兑现。

## 2026-09-26 D-068 当前 v3

`data.model-response · v3` 已接受并冻结，[精确契约](v3/contract.md) 的接受范围与32资源摘要见 [D-068](../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json)。本段为当前导航，此前旧版接受与验证记录保留原适用范围。新版推荐不自动升级消费者；八个core提供者须显式采用，24个外部消费者仍钉2。实现、公开旧Schema闭包及新组合证据尚待完成，不从规格接受推断通过。

## 2026-09-27 v4 候选验证

本版是 candidate；本文件属于候选交付说明，实际运行不提升接受状态。已接受 v2/v3 的历史结果仍限定于原输入。运行时、生产传输和持久化组合的本版验收尚未开始。

### 变化的影响

来源为 model-request-adaptation 提案 rev 2、UL-D-6 及本轮主线施工裁定。需求 rev 沿 contract.md 抬头，已与各 topic 当前 revision 核对。

| 变化 | 消费者与需要重建的证据 |
|---|---|
| model-profile/v3 的 ModelAdaptationBinding，route 与快照均必填 | core/model-response 的 Schema 闭包、纯判定；runtime 的打开调用、每次发出、结算及恢复；所有嵌套 ModelResponse 的显式采用者 |
| messages/v4 的已出门绑定；AssistantMessage 保留 core 修正 | runtime 的发出锚点与响应绑定对账；不得用 messages/v3 宣称已有新增锚点性质 |
| servingProvider 可选且保存上游原串 | 传输读取、运行时错配处置、响应序列化、诊断；未报告时不能补请求供应商 |
| usage 为缓存事实唯一权威，零与 Unknown 分开 | 传输的原始 usage 映射及缓存探针；不得新增另一份 response.cache，实际费用规则保持 |

这是不兼容的表示演进。旧文档缺少完整绑定时不能读成 v4，不迁移或填初值。新增 binding 是已有档案/调用的属性，无新领域身份。未改六处共用形状副本的含义；ParameterAdjustment 与 droppedParameters 的 model-profile 说明升级 v3，messages/v4 的逐字副本须同轮核对。

### 证据义务

| 项 | 条款与能失败的断言 | 证据形式与前提 | 状态 |
|---|---|---|---|
| V4-1 | S-26/S-27：全部完整 JSON 实例的 Schema 通过/拒绝符合明确预期；依赖 Schema 可解析 | Draft 2020-12，使用本工作树完整精确依赖；继承实例保留原拒绝目标 | 已执行，见下方实际执行；不代替生产符合性 |
| V4-2 | S-36：改 implementation 修订、配置值或 modelId，Schema 放过但纯判定为 malformed；两份绑定必须完整相等 | 纯比较的小型检查，精确十进制解析；只覆盖新增两条比较，不声称覆盖完整拒绝次序实现 | 已执行，见下方实际执行；不代替生产符合性 |
| V4-3 | S-36：配置对象重排仍相等，数组重排不同，精确十进制不同不被舍入成相等 | examples V4-M1 的变异；任意精度数与按值比较 | 已执行，见下方实际执行；不代替生产符合性 |
| V4-4 | S-36：发布/撤除后历史响应与已出门绑定不变；诊断失败或旧实现不可用不妨碍读历史事实 | 真实运行时、耐久日志、升级/恢复场景 | 未开始 |
| V4-5 | S-37：未提供实际执行方/模型时不得补请求值；已核实错配保留两方并服从首内容优先规则 | 原始响应与最终 ModelResponse 对照，首 token 前/后两支 | 未开始；Schema 不证明事实来源 |
| V4-6 | S-38：只报告读时写 Unknown；读为零不等于 Unknown；写为正不推出读取命中；配置不生成计数 | 原始 usage、配置变异、真实缓存冷暖请求 | 未开始；Schema 只验证已写出的值是否合法 |
| V4-7 | 既有 S-1～S-35：收场、工具调用修正、时序、结算、成本和恢复保持 | topic verification.md 原 V-1～V-14 在 v4 显式重跑；旧运行不冒充本版结果 | 本版生产符合性未开始 |
| V4-8 | 精确依赖、链接和候选资源登记一致；旧冻结资源摘要不变 | 工作区 check_design.py；registry 由主线唯一写入者机械登记 | 本次运行失败于其他在写候选的 3 处链接；本包无报告错误，候选登记尚待主线 |

### 实际执行

2026-09-27，在指定工作树 `panqiwei/model-request-runtime`（起始提交 `d4eaf7673bc161bf22f6682385151e080d3323ae`）使用本工作树 `.venv/bin/python`，没有安装依赖。

1. `jsonschema.Draft202012Validator` 与 `FormatChecker`、`referencing.Registry` 装入本树全部 Schema；实例 JSON 按 `Decimal` 读取。58 个完整响应实例逐块按明确的预期校验：**22 通过、36 拒绝，0 处不符**。两个原有片段/手算块不是完整 ModelResponse，不作为完整实例冒充覆盖。
2. 第六节 12 个实例按新增两个绑定相等谓词检查，结果与各自纯判定预期一致；4 个精确值变异（精确十进制相等/不同、对象次序、数组次序）符合预期。随后增加布尔值/数字边界并用区分 JSON 类型的比较重新运行 5 个变异，0 处不符。该小检查没有运行产品实现，也没有证明 S-27 全部拒绝优先级的实现。

先前交互检查输出的关键字段摘录（不是完整原始日志）：

```text
schema_instances: 58
passed: 22
rejected: 36
incremental_judge_instances: 12
exact_value_mutations: 4
mismatches: []
exact_json_value_mutations: 5; mismatches: 0 (number, object order, array order, boolean type)
```

3. 工作区检查命令：

```sh
.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal registered
```

实际退出 1，输出如下。三项都在并行起草的 runtime 候选内，未在本任务越界修复；37 个现有形式任务只确认登记，未执行。

```text
ERROR: spec/capabilities/model-request-runtime/v3/contract.md: missing Markdown anchor: ../verification.md#v3-候选变化与证据
ERROR: spec/capabilities/model-request-runtime/v3/contract.md: broken local link: formal/README.md
ERROR: spec/capabilities/model-request-runtime/v3/contract.md: broken local link: formal/README.md
FAIL: design validation found 3 error(s).
```

以上是本次实际执行记录；最终整批登记与链接修复后由整批拥有者重跑，不能把本次失败改记为通过。

#### 保存脚本与原始输出的实际复跑

2026-09-27 按主线补充任务，将上述 Schema／跨字段验证保存为脚本并实际复跑。其输入是本次抓取的候选及传递依赖快照，不依赖后续编辑中的文件。

- [完整实际检查归档](../../../record/evidence/2026-09-27-probe-model-request-runtime/response-v4.tar.gz) 保存复跑说明、脚本、43份输入与摘要、stdout/stderr、实际命令/环境/退出码。历史 Markdown 快照保留在归档内，未改写内部链接。
- 读取结论时核对应输入摘要；包内校验不等于生产边界或流解析通过。

该次实际退出 **0**：58 个完整实例为 22 通过、36 拒绝；12 个新增绑定判定、5 个精确 JSON 值变异均符合预期。原始 stdout 含每项结果和拒绝细节，未以汇总替代。stderr 为空。这次复跑没有执行全局设计检查，不改变前述检查器退出 1 的历史记录。

复跑入口从指定工作树根执行：

```sh
.venv/bin/python tmp/model-request-runtime/response-v4/verify.py \
  --inputs tmp/model-request-runtime/response-v4/inputs \
  --manifest tmp/model-request-runtime/response-v4/inputs-sha256.json
```

这里的链接指向本次工作树内的临时证据；`tmp/` 被 Git 忽略，树退役或候选发布前须由主线保存所需证据并迁移链接，不把本地存在冒称已发布。

### 形式工件

未新增 TLA+ 或 Alloy 工件，未运行形式工具。理由：本次是单份不可变响应数据的字段和纯比较扩展，无新操作、状态转换或独立生命周期；单文档结构由 Schema 和比较反例表达。版本取得/撤除、并发收口、日志提交与恢复的行为模型归对应运行时能力，不能以本 data 的实例验证替代。

### 已知缺口

本次增量未新增 G 编号。继承 G-3（条目壳，owner：loop/主线）、G-4（原始响应保留设置，owner：PF-002/主线）、G-5（脱敏规则，owner：model-request-runtime）、G-9（其余可追溯组成，owner：PF-010 组装/runtime）、G-10（真实费用提供者取证，owner：传输提供者）；旧闭合编号保留，具体见 contract.md。G-8 的表示缺口以 S-37 候选条款补齐，实际名称核实及错配证据仍归 V4-5，未声称生产闭合。

### 报给主线

- 原施工简报拟新增 cache；查实 call-accounts/v2 已有权威字段且没有 TokenAmount/TokenCount 后，主线裁定沿 usage 单一事实源，本版按裁定落 S-38，无另一份计数类型。
- 主线裁定 servingProvider 可选、缺席不冒填。首内容后错误仍按原 interrupted_mid_reply，未新增成因。
- messages/v4 与 model-profile/v3 为同批候选依赖。主线已明确采用它们的定型公共形状；本版不能先于依赖被当成完整接受的闭包。
- registry 由主线唯一写入者落四份清单；本起草者交付精确 candidate 条目与复用范围，不另造第二份持久坐标清单。登记前不声称已登记。
- 提案的机械 revision 标记仍由主线维护，本版引用本次明确的 rev 2，不把提案当作接受记录。

## 2026-09-27 v5 多值响应头候选验证

本版基于 [D-078 承接接受的 MR4](../../../record/decisions/model-main-integration-coordination/acceptance.json)，新增完整 [v5 契约](v5/contract.md)、[Schema](v5/model-response.schema.json) 与[规范实例](v5/examples.md)。MR5 仍为 candidate，未接受、未冻结；下列结构自检不是独立评审，也不提升采用或实现状态。

### 变化的影响

本轮按主线施工裁定保留 `raw.headers` 的对象表示，只增加有序字符串数组值域，保持字符串／数组形状、数组次序、重复、空字符串、空数组、空对象与缺席的区别。没有新操作或提交点，不套用操作九件表；没有新状态机、并发协议或共享代数，不新增 TLA+、Alloy、形式任务或编号族。MR5-H1～MR5-H6 只是本主题局部证据标签。S-20 是唯一值域变化；S-26 说明 Schema 边界，S-27 只澄清已有一般空值说明不拒绝 S-20 的合法空值，失败集合与优先级保持原样。

S-1～S-19、S-21～S-25、S-28～S-38 的旧承诺和所有外部 Schema 引用不变。七个 catalog 依赖及其 clauses 逐值继承 MR4；catalog 新增一个候选、三资源，covers 新增 28 条 `reviewed: false`，只继承原需求／条款覆盖范围。旧 accepted、candidate、covers、frozen、id-namespaces 与 formal-tasks 登记均保留。原模型、实现与 v2/v3/v4 的历史结果只保留其输入范围，不能冒充 MR5 生产符合性。

**需求 rev 的继承边界**：PF-013 rev13、PF-009 rev8、PF-012 rev15、PF-011 rev4、PF-010 rev6 与现场一致。MR4 原采用 PF-004 rev12、PF-001 rev19，当前分别为 rev13、rev23；主线裁定本次只继承旧已接受条款范围，不重采纳这两份新版产品。候选抬头已去掉继承来的“均与当前一致”误述。两个 topic 新 rev 的全量语义重核不在本轮，owner 为对应产品负责人和主线；本次未改产品、旧规范或既有覆盖行。

### MR5 证据义务

| 项 | 条款与能失败的断言 | 证据形式、前提与 owner | 状态 |
|---|---|---|---|
| MR5-H1 | S-20/S-26：完整响应接收字符串与数组混合、重复／空元素、空数组、空对象、headers 缺席和 raw 缺席；不可将这些值解释为同一个值 | 本树精确 Schema 闭包、完整规范实例；原样过程另外以实际输入输出逐值比对；data owner／写方 | Schema 与局部值比较已执行；真实原样过程未开始 |
| MR5-H2 | S-13/S-17/S-20/S-27/S-36：非法头值与空 raw 拒绝；加入数组不改变其他收场／绑定检查及失败优先级 | 规范负例、交错违规输入与局部纯判定 oracle；不是生产接收器验收 | 已执行实例与 Schema 阶段次序、S-36 检查；未运行生产判定器 |
| MR5-H3 | MR4 合法域保持同义，原规范正反例判定不变；新增数组样本 MR4 拒绝、MR5 接收；旧 Schema 与全部冻结资源摘要不变 | 两版 Schema 对同一完整文档判定；逐定义差分与输入 manifest | 已执行，见下方范围与局限 |
| MR5-H4 | S-20/S-21/S-22：实际写前脱敏，已采得且脱敏后各值不拼接、不取首、不丢项、不重排、不改形；写下之后不改 | runtime／transport／完整响应写方，以显式脱敏政策和秘密哨兵实测；在真实消费链加入丢项、重排等行为负控 | **未开始**；Schema 无法代证 |
| MR5-H5 | S-20/S-22/S-24：transport→invoke 结果→完整响应→同次 append→reopen 保留同一次发出的完整事实；未采得不补、未知账不多发 | 后续 runtime 新版及 core/runtime/transport/验收装配四层显式采用；成功、HTTP 失败、带内失败、断流、观察后取消、未知账场景 | **未开始**；本轮不关闭 RT4 G-31 |
| MR5-H6 | 坐标、Schema 标识／引用、全部实例、38 条编号及候选登记一致；旧依赖、字段、覆盖和冻结字节不漂移 | 本树 check_design，Schema 元校验／闭包解析、定点差分与输入保护 | baseline 与 candidate internal 均已执行通过；formal=skip |

表示判定不会证明值确实由上游采得；合法的字符串化数组或排序后数组仍可违反 S-20。空 map 与缺席的分界不能用空集默认掩盖。先脱敏、后承载脱敏结果，MR5 没有选择新的头名归一化、碰撞、wire-level 或留存政策；G-4/G-5 与 runtime 的具名脱敏参数责任保持。

### 消费传播与闭合点

| 消费方／owner | 本次沿用范围与后续义务 | 闭合证据 |
|---|---|---|
| runtime 规格 owner | RT2/3/4 保留原精确 MR2/4；后续新版本须明确事实端口并消费 MR5，不能只替换依赖数字 | 新候选独立评审／采用与运输事实交接场景；RT4 G-31 不因本包完成而关闭 |
| core model-response owner | 当前 MR4 完整接收仍拒数组；须为新链提供显式 MR5 完整接收，旧 MR4 oracle 保留原适用范围 | 公开制品、Schema 闭包和完整判定测试 |
| runtime 提供者、共同日志构件 owner | 新接收须覆盖完整响应的捕获、批检查、全值比较及重开读取；不能用时间点等价替代 JSON 全值相等，也不能改变历史值 | 与实际日志的同次追加、回复结算、未知结果认回与 reopen 证据；现 D087/D088 的采用不含本新增表示 |
| transport 与验收装配 owner | 现运输面已可采数组，但最终 invoke 结果未完整交头事实；2xx／错误／取消路径需按新规格明确交接 | 原始事实、脱敏后事实和完整持久响应逐值对照，实际 send 次数不增加 |
| 其他精确消费者 | runner2/3 只消费未变身份、成因及绑定相关条款，可继续原版；MS4、CA2、LC3、MP3、CB3、IV1、offer-expiry1 不因头值域自动升版；日志不透明 payload 不因此升规格版 | 完整响应实际读写方采用时定向检查；仅复制身份／参数形状的旧对齐义务保持 |

catalog 当前五条指向 MR 的消费边为 RT2/3/4、runner2/3；现有其他 Schema 无外部 MR 引用。这个只读范围不能证明外仓或动态消费者不存在。源码和持久化交付由各 owner 接续，本轮没有建立 RT5、提供者增量或验收应用。

### MR5 实际执行

2026-09-27，在工作树 `panqiwei/model-request-runtime-p2-response-headers-spec`（起始 HEAD `4cf612e9314bd042abe61591abf7156fd6861d09`）使用本树 `.venv`：Python 3.12.13、jsonschema 4.26.0、referencing 0.37.0。没有安装依赖、调用模型或运行产品 IO。临时完整输入、命令 argv/cwd/PID/exit、stdout/stderr 与首次失败由本次交接包保存；正式证据保全由主线承接。

- baseline internal 检查：PID 107994，exit 0。93 项审计输入的原提交字节核对一致；现场仅有原审计已说明的 5 项导航／新增重试导出差异，MR4、RT4 与头相关源码未变。595 项输入已快照，472 份冻结资源摘要一致。
- Schema 首次探针：PID 111218，exit 1。错误是临时探针把注释 `malformed（跨成员，无专名，contract.md S-27）` 整段当成拒绝标签，在 MR4 R-17 停下；没有改规范或预期使其通过。原脚本、stdout/stderr 和退出记录保留。
- 修复标签提取后的第二次探针：PID 111287，exit 0。35 份 Schema 通过元校验，MR5 传递闭包为 21 个资源、862 个引用均可解析。MR4 完整实例 58 个（22 接收／36 拒绝）；MR5 完整实例 77 个（27 接收／50 拒绝）。前 58 个实例值和预期逐值保持。按 Schema 阶段注释和 S-36 构造的临时 oracle 分别核 56／75 个有明确结果标签的实例，0 处不符；两个旧实例仅声明 Schema 拒绝，不伪造其未给出的专名。9 项局部精确值比较符合预期，不能代替真实无损过程测试。
- Schema 除自身版本说明、`RawHeaders` 和 `RawResponse.headers` 外逐定义相同；35 条条款正文逐字相同，S-20/S-26/S-27 的差异限定于上述范围。七依赖逐值不变；79 条旧 catalog 与 2015 条旧 covers 的原条目字节保持；472 份冻结资源无漂移。
- candidate internal 检查：PID 111313，exit 0；输出末行为 `PASS: design tree … passed gate=internal; formal=skip.`。54 个现有形式任务全部显式跳过，**未运行 TLA+/Alloy**，没有新增形式任务。检查器不校验 covers 的全部语义，覆盖表仅作上述继承范围和结构比较。

实际检查入口（从本工作树根执行）：

```sh
.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip --gate internal
.venv/bin/python tmp/model-request-runtime/p2-response-headers-spec/verify_candidate.py
```

第二次探针的原始汇总：

```json
{"event":"PASS","totals":{"4":{"instances":58,"passed":22,"rejected":36,"representation_oracles":56},"5":{"instances":77,"passed":27,"rejected":50,"representation_oracles":75}},"local_value_comparisons":9,"mismatches":0}
```

这只覆盖规范形状、局部表示关系、引用和冻结保护；未运行生产 judge、秘密哨兵、transport→invoke 交接、真实 append/reopen 或全部操作认证，MR5-H4/H5 仍未开始。

### MR5 已知缺口

本轮不新增 G 编号。继承 v4 G-3（条目壳与租户归属，owner：loop／主线）、G-4（留存期设置，owner：PF-002 产品负责人＋主线）、G-5（脱敏规则，owner：model-request-runtime）、G-9（其余可追溯组成，owner：PF-010 组装＋runtime）、G-10（真实费用取证，owner：runtime 提供者）；G-8 的既有实际供应商表示沿用，真实取证仍待提供者完成。这些历史缺口在本轮不自行重裁或关闭。外部 RT4 G-6 的政策值与 G-31 的表示采用／事实交接仍由其原 owner 推进。

### MR5 报给主线

- **简报裁定**：保留 string 或有序 string[] map，允许空数组、空串、空 map，保留 S-21/S-22 和七依赖；不新增产品政策。38 条完整复制是交付要求，不以仅 delta 替代规范。
- **起草推导**：Schema 用 `RawHeaders` 的两个互斥 JSON 类型分支表达裁定；没有 `uniqueItems` 或 `minItems`，以免误拒重复／空数组。S-27 仅澄清合法空头值例外，其值集合和顺序不动。Schema 不承担观察事实或过程保真，相关证据留给 MR5-H4/H5。
- **历史依据差异**：MR4 抬头的 PF-004/PF-001“当前一致”不再成立，已按本轮主线裁定限定为继承旧采用范围；全量新版产品重核由相应产品 owner＋主线承接。本轮没有发现须改 headers 裁定的产品反例。
- **未闭门**：本候选只解决合法表示，MR5-H4/H5 未开始；RT4 G-31、G-6 不能在后续采用时被 Schema 通过记录替代。独立语义／表达评审和正式接受由主线安排。
- **术语与冲突**：沿既有模型响应体及其上游原始响应留存属性，不新增词条、ID 族或服务；`RawHeaders` 是简报允许的 Schema 内部表示名。本轮未改变其他契约或已有采用关系。


## 2026-09-28 v6 候选验证

**状态**：candidate，未接受、未冻结。规范目录 [v6](v6/contract.md)，S-1～S-40；规范资源为 contract.md、model-response.schema.json、examples.md。运行结果仅保存在本版本外入口。基线分支 `panqiwei/model-request-runtime-response6-spec`，HEAD `fd4c87f2bc2809843ecec7937834a235906b2163`。

### 变化的影响

- 按 PF-013 rev 14 / D-096，消费 `data.model-profile/v4` 完整限制快照及 `data.messages/v5`；整批评审后失败主体与 FailureCause 同步到 `data.loop-extension/v5`，其余四个数据依赖坐标保持。历史 v5 及更早的读取/结算保持各自 codec，不从现行目录补 cap。消费者须显式采用 v6。
- S-39 唯一拥有 `PendingModelResponse`；回复必填、只允许非故障有回复收场，禁止处置/晚到。持久根仍要求 reply 对应处置。Schema 共用条件提取不改变原约束；S-39 完整事实、相等关系、脱敏、提交时晚到和实际持久性不能靠 Schema 宣称完成。
- 全部 v5 规范 JSON 块在新例中仅增设显式的虚构项目 cap/上游事实以满足新版快照；这些不是默认值或历史迁移值。新增 12 个 pending 正反实例及提交场景。
- 本批 registry 由主线唯一集成；起草者已提供 catalog/covers/id-namespaces/formal-tasks 四份可集成片段。S-/G- 复用现有局部编号空间，无新全局前缀；不登记空形式任务。中央清单及冻结文件未改。

### 本次证据与范围

本工作树 `.venv/bin/python`，`jsonschema` Draft202012Validator + `referencing.Registry`。Schema registry 使用本工作树既有文件及 sibling 的 MP4/MS5 精确候选，未安装依赖。MP4 最终 Schema SHA-256 `cfdb0878cab32f961cfd8e1471e714c0abf2f8ca6d360e4326f7e0e076c72278`；MS5 `80c829391ef4f5e736c36a93e6e103467f2890125375ae09ff16f64b11d2485e`。

实际检查输出：

```text
v5→v6 fixture regression: 78 JSON blocks, mismatches=0
pending fixtures: 12, positive=4, negative=8
schema preservation: exact structural equality after reversing refs/extraction; persisted root disposition/late checks: PASS
PASS
```

其中 78 块是旧新表示接收结果逐块比较，含说明用途的 JSON，不声称都是合法响应。还检查 4 个合法 pending 全被持久根拒绝，添加处置后可保存、有 Run 的 late 可接受而无 Run 的 late 被拒绝。结构比较反向恢复 MP3/MS4 refs 及共用条件后与 MR5 Schema 精确相等，保护所有既有成员约束。拒绝名由正文定义，本次工具只核通过/拒绝，未运行独立拒绝值分类实现。

| 义务 | 条款 | 状态 |
|---|---|---|
| 根/待提交正反实例与旧 Schema 约束保全 | S-13、S-20、S-26～S-28、S-39 | 上述有限检查已运行 |
| 待提交完整事实不裁剪、reply.response/id 相等、绑定相等；快照内上游 cap 关系由写方保证 | S-14、S-36、S-39～S-40 | **未开始**：提供者纯判定及交接场景；MP4 S-27/S-33 写方义务，不在响应体接收方重判快照关系 |
| 消息提交前尝试失效时只在提交点判 late；处置与消息一致 | S-14、S-35、S-39 | **未开始**：运行时与调用方提供者；不以缺 late 表示不晚 |
| 真实头值采集、脱敏、附件留存及用量/费用来源 | S-19～S-21、S-37～S-39 | **未开始**：继承 v5 取证义务 |
| 历史精确读取/结算与新版发送边界 | S-40 | **未开始**：运行时及调用方提供者 |

**形式触发判断**：不新增运行操作、共享代数或并发协议。单文档投影由 Schema 与实例表达；跨对象相等关系和事实来源由纯判定/场景表达。S-23/S-35/S-39 的行为义务归运行时，不复制状态机；TLA+、Alloy **未运行**，未登记新增 formal task，也不声称模型覆盖。

**继承缺口**：G-3（loop 主线，租户条目壳）、G-4（PF-002 产品/主线，原始留存保留期）、G-5（运行时，脱敏规则）、G-8（运行时/提供者，执行方事实）、G-9（PF-010/运行时，请求组成追溯）、G-10（提供者，费用来源取证）。本次未替这些 owner 宣称闭合。`PendingModelResponse` 无独立词条，仅为主线确认的共享表示名，报主线保留。

**设计检查器实际结果**：以 `--formal skip` 运行。本 spoke 尚未合入 MP4/MS5，初跑 22 项链接/锚点错误（21 项是尚未合入的依赖路径，1 项是当时尚未追加的本节锚点，现已追加）。另在任务临时副本叠加当时 MP4/MS5 文件运行，结果 `FAIL: design validation found 2 error(s).`，两项均为 MS5 的 `../verification.md#v5-完整输入限制快照` 锚点尚未在当时读取的 sibling 验证入口出现；无本包错误。该副本保留原中央 registry，不能替代整批登记验证。主线完成七包与登记集成后统一运行检查器；本包不声称整批通过。`git diff --check` 本次无输出、退出 0。TLA+/Alloy 均未运行。

### 2026-09-28 独立整批评审修订：快照接收边界

按主线转交的独立评审发现，修正 S-40 与 MR6-facts：原稿错误地要求响应体接收方重判快照跨字段关系并返回 `malformed`，与 MP4 S-27 及 MS5 S-49 的写方责任冲突。现明确 MP4 S-18/S-33 关系由写快照方保证，接收方只校验快照形状；MR6 自有 S-14/S-36 判定不变。新增 [MR6-snapshot-boundary](v6/examples.md#mr6-snapshot-boundary--接收形状与写入者关系的反向边界) 的最小两字段变异：cap 为 2、上游 limited 为 1，结构仍合法；删除必填上游事实则结构非法。

本轮仅修正文、示例和验证说明，Schema 原本只引用快照形状，无须改动；SHA-256 仍为 `2ed9619d220faa90ba8c00b7219181239a6119bf06f08aabac3f7528213d197e`。本地同一工具再次运行，既有 78 块回归、12 个 pending 及结构等价检查仍通过；新增 4 次边界断言的实际输出：

```text
ModelResponse: cross-field writer violation accepted by shape; missing limits rejected: PASS
PendingModelResponse: cross-field writer violation accepted by shape; missing limits rejected: PASS
```

这些断言只核形状边界；写入者关系违约的报告与真实交接证据仍未开始。检查器由主线整批集成运行，本轮未重跑；TLA+/Alloy 未运行。旧冻结版本与 registry 未改。


### 2026-09-28 独立整批评审修订：完整失败主体闭包

主线确认原 MR6 的 LC3 S-14 引用无法承载完整 MP4/MS5 值。本轮将页首依赖、S-2/S-3/S-5/S-23、历史规则的现行消费引用及 `Failure.cause` Schema ref 统一到 LC5；完整失败主体另明确消费 S-43 的已生效重试结论。registry catalog 片段同步为 LC5，clauses 为 S-2/S-14/S-17/S-25/S-43，中央清单仍由主线集成。S-2 中消息/档案的遗留版本标签同步到实际采用 MS5/MP4；旧冻结版本未改。

LC3/LC5 的 `FailureCause` **整个定义逐字相同**，本次没有改变成因域、拒绝优先级或 MR5；MR6 Schema 仅将该 `$ref` 从 LC3 改到 LC5。当前 Schema SHA-256：`051d72139d25cacf9eaaea9a39ac7a39b26b28e9836eb174d9b54ae7d52fa005`。新增 [MR6-lc5-failure](v6/examples.md#mr6-lc5-failure--由-e-5-的同一批事实形成主体)，以 E-5 的同一份 MP4 image 快照、发出身份与绑定形成完整 LC5 失败主体。

本地 `.venv/bin/python` 实际输出（Draft202012Validator + referencing，沿本次 sibling 精确候选）：

```text
FailureCause LC3/LC5 full definition equality: PASS
MR6 E-5 + LC5 AfterModelCallFailureSubject + MP4 caps: PASS
LC3 rejects complete subject; LC5 rejects missing retry history, subject limits, dispatch limits: PASS (4 assertions)
catalog closure: MR6→LC5→MS5→MP4; no path back to MR6: PASS
LC5/MS5/MP4 schema refs contain no model-response backreference: PASS
```

检查使用现有 catalog 加四包候选片段作消费图遍历，检查 LC5/MS5/MP4 Schema 的外部 `$ref`，未发现返回 MR6 的消费环；说明性反向指路不计依赖。既有 78 块回归、12 个 pending 实例与反向恢复引用后的结构等价检查仍通过。本例同时核对两份主体快照与响应 route 快照逐值相等及 response 标识对应；真实日志归属/完整性、写入责任仍未运行。整批检查器由主线执行，本轮未重跑；TLA+/Alloy 未运行。
