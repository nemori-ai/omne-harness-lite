# Cordis 视角：能力侧与装配侧

[提案索引](README.md) · [消息模型](message-model.md) · [增量协议](delta-protocol.md) · [信封与游标](envelope-and-cursor.md) · [作用域与投递](scope-and-delivery.md)

按[总体范式](../../architecture-guide/foundations/paradigm.md#从目的到可演化的实现)分别推导
服务、插件与消费方式；Cordis 语义按 [cordis-authoritative-docs](../../../.agents/skills/cordis-authoritative-docs/SKILL.md)
核对采用版本，本文件只给出消费方式与边界，不把上游应用策略当项目约定。

## 消费方式

| 消费者 | 消费什么 | 方式 |
|---|---|---|
| 客户端传输（SSE 端点，决定 A） | `omneMessageStream.subscribe(session, cursor, principal)` 返回的帧序列 | 应用装配层插件，`apps/local-harness` |
| 出站流服务 `omneMessageStream` | 铃：`records.envelope.committed`（[LC-06](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)，[admission 提供者](../../../packages/coordination/admission/design.md)）；内容：`omneSession` 读面与 `omneSessionProjection.changes`、`omneTools.subscribeFrames / readFrames`、`omneHumanDecisions` 的 `subscribeRequests / pool.get`、MC 提供者的 attempt 帧 | 能力插件，新成员 `packages/session/message-stream`（归属见下文） |
| 历史与派生消息 | `omneSession.history(session, range)`（[SE-03](../../../spec/capabilities/session/v1/contract.md)）与 projection 的派生 `Message` | 客户端按位置拉取 |

## 能力侧

| 能力 | 本提案要求它提供的 | 现状 |
|---|---|---|
| session（`omneSession`，[Session 设计](../../../packages/session/session/design.md)） | 读面 `history(session, range)` 返回派生 `Message[]` 与水位；`readSession` 的读权键 `read_metadata / read_content`；`frames(S)` 作为第四条流登记（决定 K） | 读面已在设计；`frames(S)` 与派生表待 session 下一版 |
| session（补） | 读面 `visibilityVersion(session, subject)`（评审 B3）：聚合租户成员资格、Session 授予与 HD 可见范围的版本号 | 待 session 下一版 |
| session projection（`omneSessionProjection`，[projection 设计](../../../packages/session/projection/design.md#提供与装载效应)） | 新读面 `changes(session, after, to) → {batches, completeTo}`：该 Session 作用域内 `(after, min(to, completeTo)]` 的事实按提交分组，附完整覆盖水位（评审 B2）；`snapshot(session, principal) → {asOf, history, queue, requests, calls, visibility}`：全量重取用的单一读面，所有派生视图取自同一 fold 水位 `asOf`（复核 B-新2）；`floor(session)`：可服务下界；派生 `Message` 的 fold（[message-model.md §4](message-model.md#4-从事实派生消息)）作为 projection 贡献注册（SE-10） | 待修订设计 |
| tools（`omneTools`，[tools 设计](../../../packages/tools/tools/design.md)） | `subscribeFrames(call, cursor)` / `readFrames`（[frames.md 读面](../tool-execution/frames.md#读面)，候选）；帧的 `render` 来自命令声明 | 候选，随工具提案接受 |
| human-decisions（`omneHumanDecisions`，[HD 设计](../../../packages/governance/human-decisions/design.md)） | `subscribeRequests` 与 `pool.get` 给出卡片内容与可答性（[HD-09](../../../spec/capabilities/human-decisions/v1/contract.md)） | 已在设计 |
| model-execution（提供者设计尚未写；run-driver 设计以 `MC` 的 prepare/attempt 端口引用它） | attempt 结算记录携带 `purpose`、装配内容、缺失块（截断块保留前缀）、实际送达模态、公开投影后的紧凑流记录；公开投影 `toPublic` 是对整段私有序列的确定性转换（公开计数、块裁剪、推理形态），供实时发布、紧凑记录、基线三处共用（评审 B7、复核 B-新5）；进程内 attempt 帧 `model.attempt.*` 经 Cordis emit（agent 作用域）发布，`started` 带 `purpose`，三种帧带 Session 内单调发布计数 `pub`；读面 `attempts(session) → {items, version}` 与发布在同一互斥下、`version` = 快照时的 `pub`，供重连基线与插件装载时的同步切（评审 B8、复核 B-新6）；私有回放读面供下一次模型请求 | **缺口**：MC 提供者设计是本提案接受后的必需产物；fork 的 `packages/agent/loop` 与 `packages/model/llm` 是它的起点 |
| records / admission（`omneRecords` 只读、`omneAdmission`） | `records.envelope.committed` 广播按租户与 Session 作用域过滤 | 已定（[lifecycles 提案 §3](../session-run-agent-lifecycles/cordis.md#3-事实即事件的广播机制)）；作用域过滤的实现与验收仍待提供者 |
| identity / tenant（`omneIdentity`、`omneTenant`） | 订阅建立时的主体与成员资格 | 已在设计 |

## 插件与服务

| 插件 | 服务键 | required inject | 提供 |
|---|---|---|---|
| `MessageStreamPlugin`（`packages/session/message-stream`） | `omneMessageStream` | `omneSession`、`omneSessionProjection`、`omneTools`、`omneHumanDecisions`、`omneIdentity`、`omneTenant`、`omneDiagnostics`；MC 提供者的读面 `attempts` 与帧发布经 Cordis 事件与可选注入消费，不 required inject（缺席时没有助手草稿；装载时先读基线再订阅，[delta-protocol.md §5](delta-protocol.md#5-重连基线)） | `subscribe(session, cursor, principal): AsyncIterable<Frame>`；`describeCursor(cursor)`；租户级轻量流 `subscribeDirectory(tenant, principal)` |
| `MessageStreamSsePlugin`（`apps/local-harness`） | 无新服务 | `omneMessageStream`、HTTP 宿主 | SSE 端点：订阅请求、游标解释、心跳与批处理（实现阶段参数） |

`omneMessageStream` 不 inject `omneRecords` 的写面、不 inject `omneRun` / `omneAdmission`：
它不提交、不准入、不驱动。它是 tools / HD / session 读面的消费者，依赖方向单向；
tools、HD、session 不依赖它。

## 装载效应与撤除责任

| 建立的效应 | 拥有者与撤除责任 |
|---|---|
| 订阅（每个 `subscribe` 一个 effect，挂在调用者 fiber） | 插件卸载或 fiber 销毁 → 对每个订阅发 `stream.closed{unavailable}` 并释放缓冲；不写任何耐久状态，事实不受影响 |
| `records.envelope.committed` 监听 | 随插件 fiber 撤回；监听器自身容纳异常（LC-06：emit 无逐回调隔离） |
| 对 tools / HD / MC 的帧订阅 | 随每个客户端订阅建立与释放；撤回不影响 owner |
| 进程内瞬态缓冲与基线 | 插件内存；重载后为空，客户端草稿按 `crash_gap` 处理 |

撤除不等于事实回滚：出站流不写任何耐久状态；它能保证的边界是"已披露给客户端的内容不可
撤回"（[scope-and-delivery.md §2](scope-and-delivery.md#2-撤权)），不是"没有外部效果"。重新
装载先核对当前权限与依赖版本，不激活旧订阅句柄。

## 依赖变化政策

两种触发分开写（评审 N3）：**提供者撤回**指 Cordis required 依赖的服务失去提供者，按官方
依赖装载语义，依赖它的插件整体退出活动状态（[Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-primer.md)，
研究采用版本），`MessageStreamPlugin` 的全部订阅随之 `stream.closed{unavailable}`；**操作不可用**
指服务仍在、某次读操作返回 `unavailable`，只局部降级。下表的"处置"列写操作不可用；required
依赖的提供者撤回一律是前者，不逐行重复。

| 依赖 | 必需性 | 操作不可用时的处置 | 依据 |
|---|---|---|---|
| `records.envelope.committed` 广播不可用（协调者重启、监听丢失） | 铃 | 退化为按周期读 `projection.floor / completeTo` 对账；补齐照常；客户端察觉不到差别只有延迟 | LC-06"丢失由启动扫描兜底" |
| projection 重建中 / 版本不符 | 补齐必需 | `changes` 返回 `unavailable` → 已开订阅停止投递事实帧、发一次 `stream.gap{owner: session, reason: unavailable}`、水位不动；新订阅受理但事实帧等投影恢复；恢复后从水位对账续推（[envelope-and-cursor.md §5.2](envelope-and-cursor.md#52-缺口与不可用)；评审 B2：不再"只发实时帧"） | SE-10 |
| tools 读面不可用 | 工具帧必需 | 调用事实照常提示；帧缺席并发 `stream.gap{owner: call, reason: unavailable}` | TL-12 |
| MC 读面 / 事件来源不可用而进程未崩溃（提供者卸载、换代） | 助手草稿 | 插件对账上每个活跃 attempt 发 `ended{abandoned, reason: source_lost, observer: message_stream}` 并把它记为已关闭，此后该 attempt 的任何帧丢弃；客户端草稿 `unconfirmed`，稍后按结算事实收尾（[delta-protocol.md §5](delta-protocol.md#5-重连基线)；评审 B8、复核 B-新6） | MC-06 |
| 进程重启 | 助手草稿 | 基线为空；客户端 `crash_gap`，靠结算事实收尾 | MC-06 |
| HD 读面不可用 | 卡片内容 | 请求事实照常提示；卡片内容 `unavailable`，可答性 unknown | HD-09 |
| 主体撤权、可见范围版本变化、租户关闭、Session 删除 | 订阅存续 | `stream.closed{unauthorized \| resync_required \| session_deleted}` | [scope-and-delivery.md §1–2](scope-and-delivery.md#1-两处核对) |
| 模型切换、工具定义停用、Session 归档 | 无关 | 只是事实提示 | MC-11、TL-06、SE-14 |

## fork 的演化路径

| fork | 现状 | 演化 |
|---|---|---|
| `packages/agent/loop`（`SourceAssistantStreamFrame`、`AssistantStreamAttempt`，[README](../../../packages/agent/loop/README.md)） | 源切片：`attemptId` 为 Session 名 + 计数，`settle` 在同步 `append()` 返回后发帧，`push()` 把同一 chunk 同时送累加器、装配器与实时发布 | 进 MC 提供者：身份改为 `AttemptRef` + Run `epoch`，`ended{committed}` 等 DR-02 回执；`push()` 拆成私有累加与经 `toPublic` 的公开发布两条路（评审 B7）；累加器保留供重连基线并加 `version` |
| `packages/model/llm`（`StreamChunk`、`BlockAssembler`、`AssistantStreamAccumulator`、`expandAssistantStream`，[README](../../../packages/model/llm/README.md)） | 词汇与算法完整；`interruptedBlocks()` 只保留 text / reasoning 块 | 词汇作私有词表复用；`interruptedBlocks()` 改写为"保留全部完整且已耐久的块、其余记缺失"（评审 B6，[delta-protocol.md §4](delta-protocol.md#4-失败中断与部分内容)）；新增 `toPublic`；OpenRouter adapter 新写（合成 `block-start/end`、`reasoning_details` 映射）。不再称"原样复用" |
| `packages/session/session` baseline 的 `assistant/message` / `assistant/attempt` 事件类型 | DSH 事件名 | 不进产品词汇；结算记录归 MC 流，派生消息归 projection |
| `packages/session/projection` | 列表 / 历史 / 队列 / 运行视图 | 增 `changes`、`floor` 与派生 `Message` fold |
| 未 fork：DSH `session-controller` 的 `follow / page`、客户端 journal、connection / gateway mux | — | 不搬；本提案的订阅与补齐是等价物，传输在 `apps/` |

## 性质、前提、证据与未完成义务

| 性质 | 前提由谁供给 | 证据 |
|---|---|---|
| MS-1、MS-3、MS-7、MP-1～MP-3 | records 的单调域序号（DR-01）、projection 的确定性 fold（SE-10）、MC 提供者的耐久回执后发帧 | 游标模型（波 3）、投影单测 |
| MS-5 | Session / tools / HD 读面在披露时查权限 | 授权单测；读面本身的证据归各提供者 |
| MS-6 | 出站流服务不持 records 写面、不向 owner 施压 | 负载单测 |
| MS-10 | 信封 Schema 与 `render` 词表（决定 J） | Schema 检查；omne-next 核对清单 |

未完成义务：MC 提供者设计；session 下一版的 `frames(S)` 登记与派生表；projection 设计的
`changes / floor` 读面；`apps/local-harness` 的 SSE 端点设计；tools / HD 提供者设计的事件名
按 U-33 改三段。这些在接受后按[提供者设计归属](../../maintenance/organization.md#当前实现设计的归属)
逐个修订。
