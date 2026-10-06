# 验证覆盖与实际证据

## v7 发布前破坏性演进

本轮表达复评点名的版本自称、精确消费坐标与前驱执行声明已定点修订；MR7 与 runner5 当前产品依据按实际消费范围核对。字段结构、行为模型与既有操作责任保持不变。

本轮从已接受且冻结的 `data.model-response/v6` 起草 candidate v7，基线 `11c6c5b0`。源接受依据为 D-097（MP4）或 D-099（其余六份）；本版没有接受、冻结或实现完成声明。

### 变化的影响（本轮）

- 只更新本批精确链 MP5 / Directory5 / MS6 / MR7 / LC6 / RT7 / runner5，并删除旧格式 codec、只读、认回与结算过渡义务；既有 IV、CB、日志、资产与 hooks 等精确依赖不升级。
- 字段、值域、Schema 结构、操作、失败集合、发送门、数值与策略不变；RT S-34 的完整失败主体重取继续原义。data 的 `$id` / `$ref` 与注释中的对应坐标同步迁移。
- 不原地改写、清空或回填用户旧数据；不兼容输入沿既有边界明确拒绝。当前代际已经受理的任务、不可变快照、未知结果、原批认回与释放结算责任继续成立。

| 证据义务 | 可失败观察 | 状态 / owner |
|---|---|---|
| 精确依赖及 Schema 同构 | 除本批坐标和说明文字外出现结构差异即失败；所有 `$ref` 精确解析 | 本次检查结果见下；规格起草 / 集成 owner |
| 冻结源与形式工件保持 | 源登记 hash 改变，或 `.tla`/`.cfg`/`.als` 任一字节改变即失败 | 本次检查结果见下；规格起草 |
| 当前格式唯一运行路径 | 旧不兼容输入不得进入旧 codec、不得降级/回填、不得写/清空原数据 | 未开始；相应数据接收者 / 提供者 |
| 当前代际责任不丢失 | 当前任务未知提交或已受理工作仍由原 owner 认回/恢复/结算；新格式拒绝不能抹旧事实 | 未开始；runtime / runner / 日志提供者 |
| 公共操作与最终门不退化 | 原输入上限、Pending 回复、重试历史及 S-34 失败重取仍按原精确性质成立 | 未开始；对应消费者及验证 owner |

### 本次实际检查

本轮使用本树 `uv run --locked python` 执行临时审计脚本，实际输出：

```text
PASS: 584 frozen source hashes unchanged; 4 schemas structurally identical after exact $id/$ref remap; 276 refs resolved; 58 formal source/config files byte-identical; 86 explicit schema cases matched; RT S-34 unchanged except coordinates; all dependency clauses unchanged.
NOT RUN: TLC/Alloy; production old-format rejection; current-generation recovery/settlement and actual IO.
```

`uv run --locked python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip` 的本轮检查返回 0，输出 `PASS`（gate=internal; formal=skip）；候选中央登记尚待集成，检查通过不声称已登记或接受。`git diff --check` 返回 0。

本次核对本基线全部 **584** 个冻结资源，脚本与日志在本次任务区交集成 owner 保留，尚未归档为 record/evidence。本版 82 个规范资源中的 58 份形式源/配置均与各自前驱逐字节相同。**本轮形式工具未运行**，源有限结果只保留相同模型输入与断言范围，不提升为本版真实实现验证。当前格式拒绝与责任不丢失的实现场景仍为未开始；原有缺口的 owner 保留，旧格式分发缺口改为当前格式采用与拒绝证据。


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
  所以 D-019「实际费用不能被目录估算冒充」在 fork 时要**自己加读取**：响应读 `usage.cost` 与 `cost_details`。**请求不必带任何参数**——现行文档写明用量总在流的最后一个 SSE 块里，`usage: { include: true }` 与 `stream_options: { include_usage: true }` 已弃用、不起作用（研究 [E11](../../../../research/model-request-transport-sources/evidence.md#e11-openrouter-官方文档usage-accounting2026-09-23-抓取)；本节原写「请求带 `usage: { include: true }`」出自 E2 的旧观察，2026-09-25 按 E11 改写，主线裁定 D-060 N-40，pi-ai 传输节点 PAT-N16）。`cost` 的单位是 credits，换算归提供者设计（同一条研究）。
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
原始产物归 record/evidence/。记录时分开陈述：Schema 校验的结果、规范场景演练的结果、真实组合的符合性。

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

- **2026-09-24 跨契约对齐：凭据只在租户层与出厂格（候选，未冻结，原地改）**。依据 [PF-013 rev 10 裁决 33](../../../product/PF-013-model-profiles-and-invocation/design.md)（组织那一层不持有模型凭据），主线派发：
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

- **2026-09-24 修复波 1b（主线裁定 D-060 §六 L4；候选未冻结，原地改）**：`data.messages` S-49「已出门」加 `parameterAdjustments`、`droppedParameters`，形状按本契约 S-11 逐字自定义（它不反向 `$ref` 本契约，否则依赖成环）；本契约 [S-11](v2/contract.md#s-11-实际发出的参数改过的值与没发出去的项) 加第 6 条「与『已出门』逐项相同」，停机补写的一方从那条读。
  **本契约的 Schema 与实例不变**（`$defs/ParameterAdjustment` 早已暴露，`data.messages` 不引用它），V-1 不重跑；catalog 依赖不变（`data.messages` 的 S-49 早已登记）。

- **2026-09-25 修复波 2（主线裁定 D-060 §七 M2、M12、M25、M28 与 §四「L4」「K14」两行；候选未冻结，原地改）**——逐条处置见独立评审「第二轮」：
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
- **2026-09-25 修订波：pi-ai 传输节点反推**（仍是 `candidate`，未冻结，原地改；主线裁定 D-060 §八 N-40 ④）：
  - **`failure` 加成员 `inBand`**（PAT-N4）：状态码有两种来处——HTTP 层失败取 HTTP 状态，流已开始之后的带内错误取带内 `code` 并带 `inBand: true`；`inBand` 只取 `true`、只能与 `statusCode` 同在（[S-15](v2/contract.md#s-15-故障的成因与原样状态码)；Schema `Failure` 加 `inBand` 与 `dependentRequired`；[S-27](v2/contract.md#s-27-表示层拒绝值) `malformed` 那一行补两种情形）。场景 S-30 改为「首 token 之后在流里回带内错误 429」。实例：E-5 改为带内 429、带 `inBand: true`，由它派生的 R-7、R-12 同步；新增 R-30（有 `inBand` 没有 `statusCode` ⇒ `malformed`）。**表示变了**：原先流开始后的状态码不加标记；已有的消费者（`capability.model-request-runtime` S-18、S-29 ⑤）同波改写。`data.loop-extension` 的失败主体、`data.arrival-events` 收尾的 `error` 同一个成员、同一个意思，同波加上。
  - **第 33 行那条说明按研究 E11 改写**（PAT-N16）：`usage: { include: true }` 已弃用、不起作用，请求不必带参数，只需读响应里的 `usage.cost` 与 `cost_details`。
  - **证据（只核形状）**：暂存区脚本（不入库），`jsonschema`（锁定 uv 环境，`Draft202012Validator` ＋ `referencing`），设计根下全部 `*.schema.json` 先过元 Schema、再按 `$id` 登表：E-5 **通过**；R-7、R-12 **拒绝**（与改前同）；R-30 的 `failure` 段按 `Failure` 判**拒绝**（`dependentRequired`）；`inBand: false` 拒绝。另核了 `data.loop-extension` 失败主体与 `data.arrival-events` 收尾两处的 `dependentRequired` 生效。**只核这 4 个实例与 3 处约束**，不是整批重跑，也不是 V- 义务的执行证据；**没有既有执行证据因此作废**。

## 对齐义务

- **词条链接已补**（第一轮评审修复）：「一次发出」链 [UL-upstream-send](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-upstream-send--一次发出--upstream-send)，「首 token」链 [UL-first-token](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-first-token--首-token--first-token)，「响应体」是 [UL-model-response](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response)（模型响应体）在本契约内的简称；「上游原始响应留存」按那条词条的注意 ② 不立词条，是它身上的一项属性。
- **跨契约同一件事的另一半**（本包不改对方的文件，由主线核对两边）：`capability.model-request-runtime` 的「已出门」铸 `ResponseId`、`route.parameters` 记实际发出的值、`vetoed`／`consumed` 的响应体由它写、`late` 的判定；`data.call-accounts` S-39 与本包 S-35 同一个标记；`data.loop-extension` S-23「它实际发出的参数留痕在响应体」与 S-2 对 `consumed` 的触发（不触发，原 G-14 已关）；`data.messages` S-10／S-21 的中断提醒对 `truncated` 同样补，S-10 的回复流对应表与本包 S-5 的到达映射、S-13 说的是同一件事（系统发起的运行取消不交出回复，M12）；`capability.model-request-runtime` S-36／S-51 撤除时先放弃在途的流、调用账记 `interrupted{run_cancelled}`（同一裁定的那一侧）。
- **`ParameterAdjustment` 与 `droppedParameters` 的形状在 `data.messages` 里有一份逐字副本**（「已出门」，那份契约的 V-12）：本契约是这两项形状的家——按 registry「互引成环的登记口径」（D-060 §七 M2），那份契约逐字自定义、不 `$ref` 本契约、不登依赖；本契约改 S-11 这两项的形状，那边同轮改；同一次发出两处的值逐项相同（S-11 第 6 条），由写两处的 `capability.model-request-runtime` 兑现。

## 恢复时序候选

2026-09-28：[MR8 契约](v8/contract.md) 与候选登记起草完成；未接受、未冻结。变化的影响：只扩展已锚定 interrupted 的 sentAt:null 表示，保留真实已知时刻，禁止时间代填与据 null 重发。首 token、实际账、十三操作、全部计量余量政策和原精确数据依赖不变。Scope/可用性/真实事实仍由能力与写入者兑现，纯 Schema 不提供其证据。

- 契约与 registry 内部检查：本次以 uv 缓存 CPython 3.12、spoke 自身 tooling/src/check_design.py 执行 `--gate internal --formal registered`，退出 0（输出 `/tmp/recovery-timing-check-4.log`）；该工具不执行 Schema 实例或 TLC，不把登记通过称为形式验证。Schema 实例验证待执行。
- 新形式工件：RT9 RecoveryTiming 一正配置四负控；工具链未提供，未运行。旧模型逐字继承；本版未重跑，不复述旧执行为本次通过。
- 真实实现符合性：未开始。runtime/response/codec owner 须验证两种相同完整前缀（锚点后未 send、send 后丢时刻）、opened 保留、已知时刻保留、零 HTTP、未知门与完整批认回，以及 Pending/独立 invoke 禁 null。具体验收向量见 RT9 examples 的 v9 节。
- 新编号族：无，沿 registry/id-namespaces.json 的 S-/G-；旧 accepted/frozen 不修改。覆盖复制为 reviewed:false，候选依赖不提升接受状态。
- 报给主线：loop-extension-runner/v5 仅消费 MR7 S-10/S-14/S-36，没有 Timing/根 Schema 的实质依赖，不需连锁升版；实现若私下依赖应收回对应实现边界。恢复 provider、核心响应与日志 codec 的采用/实现由主线另派，不在本包起草权内。

- G-15（MR8）补充裁定已落：主线允许窄澄清同次固定计划与真实发送关系；MR8 S-9/S-11、RT9 S-33 同步更新。正常发送必须实际一致，零 send／不可判中断沿锚点原样还原适配结果，不猜发送/费用/重试；候选待独立审查，未接受。

## MR10 本批候选验证（2026-09-29）

变化和未开始的真实义务见[v10/verification](v10/verification.md)。实际工具运行：Schema检查57/57形状实例；RT11三个新增TLC正配置均exit0（ReferenceLifecycle:2206 generated/621 distinct；Publication:147/60；OpenedOrder:254/166），九个负控均exit12且命中目标不变量。未重跑继承形式工件，不将其旧结果算成本批覆盖。原始日志位于任务worktree的`tmp/model-registry-design/spec-draft/`（schema-check.log及tlc/）；提供者/装配/真实网络/权限/存储故障与性能测量均未开始。设计检查最终结果由本批交接记录，不预写通过。

本批最终登记/文档检查：`check_design.py --root .meta_harness/design --formal registered` 实际exit0，输出 `PASS: design tree ... passed gate=internal; formal=registered.`（design-check-locked.log）。本树`.venv/bin/omne-docs-check`实际exit0，`PASS: 1836 Markdown files; local links and skill mirrors.`（docs-check.log）。852份原frozen资源逐项SHA匹配，frozen.json与4edf6cdc原字节相同。未运行release gate，不声称接受。

## v11 ACK后继候选

[v11 contract](v11/contract.md) · [消费者影响](v11/consumer-impact.md) · [验证义务](v11/verification.md)。candidate，未接受；前驱v10接受状态不传递。ACK确认、真实处分与清理分别可见；本批证据未完成时不据目录存在宣称通过。

### 本批已执行检查（2026-09-29）

三个新Schema的80个显式root/defs正反实例全部符合预期；MS8的20个固定语义编码/摘要向量及4组相等、6组不等关系通过独立逐例编码核对。RT12 AckLifecycle与AckProgress各生成6688/2124状态，exit0；8个单变异负控各exit12并报告对应不变量反例。初次形式运行解析失败、第二次admission负控赋值错误及Schema检查器一处选错Pending入口，均另保留输入hash与原日志，修正后另目录运行，不声称一次通过。

形式工具为TLC2 2026.09.12.025210（867aefb）、Temurin 21.0.12.1；2calls/2consumers、单Focus、一次可选crash、显式公平性范围见新版本formal/ACK-README。90份继承形式工件逐字相同，本批未重跑；不把它们算为ACK新证据。design检查internal/formal=registered已通过，该模式只核登记不执行模型。实际脚本、commands、输入SHA与日志由主线提升正式evidence；真实提供者/授权/存储/内存清理/未知写入组合验收仍未开始。

本批文档检查亦实际通过：1948份Markdown；冻结清单970文件SHA均保持。文档检查不代表语义接受。
