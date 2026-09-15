# Run 提供者设计

状态：目标设计，尚无源码；[D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md)
接受语义，本页固定提供者映射。采用 [run v1](../../../spec/capabilities/run/v1/contract.md)、
[session v1](../../../spec/capabilities/session/v1/contract.md)（只读读面与组合者交接）、
[生命周期组合 LC v1](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)、
[run-driver v2](../../../spec/capabilities/run-driver/v2/contract.md)（提交面的消费者）、
[CB v1](../../../spec/compositions/agent-session-binding/v1/contract.md)、
[CC v2](../../../spec/compositions/core-work-coordination/v2/contract.md)、
[DR v1](../../../spec/capabilities/durable-records/v1/contract.md)、
[CD v1](../../../spec/data/core-work/v1/contract.md)。设计来源与取舍见
[提案 run.md](../../../docs/proposals/session-run-agent-lifecycles/run.md)。原
[Session 设计](../session/design.md)中的 Run 形状、Step/DriverClaim 与 checkpoint 段落是
session-run v1 基线的映射，目标 Run 提供者以本页为准。

## Host 与服务

候选默认入口 `@omne-harness-lite/run` 拥有 `RunPlugin`、run 流的公共事件 decoder
与纯 fold，以及提交面/读面的类型。`RunPlugin` 提供服务 `omneRun`；required inject 为
`omneAdmission`（CC v2 协调者）、`omneRecords`（DR writer/reader 的受限面）、
`omneDiagnostics`、`omneIdentity`、`omneTenant`、`agents`（AR 的 `checkWork`）。
**不 inject `omneSession`**（作者裁决 [A-12](../../../docs/proposals/session-run-agent-lifecycles/README.md#作者裁决)）：
凡需要同时改 Session 与 Run 的操作由 [Session 包的组合者](../session/design.md#1-插件与服务)
注入双方端口后一次 batch 提交。options 接 [persistence](../persistence/design.md) 恢复
校验后的 run 流 fold 结果与水位；先校验再 provide，坏前缀不默认空。

Run 提供者拥有 tenant-scoped stream `run(R)`（[RN-01](../../../spec/capabilities/run/v1/contract.md)），
一个 batch 至多一条 append。流身份、envelope 与事件词汇在 DR-01 的记录模型层定义，
JSONL 只是 DR-04 的一个提供者。

## 对象、状态与 epoch

| 对象 | 形状（候选） | 说明 |
|---|---|---|
| Run | `{run: RunRef, session, tenant, basis: batch \| command \| trigger, definition, acquisitionBasis, modelSelection, state, epoch: EpochRef \| null, steps, waitingPositions, blockers, control, settledEvidence}` | state 沿 [RN-01～05](../../../spec/capabilities/run/v1/contract.md)；basis 冻结精确修订与原消息顺序；`epoch = null` 表示无有效执行者 |
| Epoch | `{epoch: OpaqueId, driverBinding: {driverKey, driverVersion}, compat, issuedAt, closed: null \| {reason}}` | 耐久；持有者（实例、WorkPermit）不耐久，恢复时不反序列化 |
| Step | `{step, cutpoint, phase, proposedCalls, admittedCalls, attempts, outcome}` | 只记引用，不复制 TL/HD/MC 状态机 |

状态只由具名提交推进。事件 kind 按三段式 `<流>.<对象>.<事实>`（用户裁决
[U-33](../../../docs/proposals/session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户)），
version `"1"`：`run.lifecycle.created{basis, definition, acquisitionBasis, modelSelection, epoch, driverBinding}`
/ `.settled{state, reason, evidence, remainingIndependent}`、`run.state.changed{from, to, reason}`、
`run.epoch.issued{epoch, driverBinding, compat}` / `.closed{epoch, reason: yield \| yield_forced \| interrupt \| force_stop \| superseded}`、
`run.step.opened{step, cutpoint}` / `.settled{step, outcome}`、`run.attempt.recorded{step, attempt, phase}`、
`run.calls.proposed{step, calls, presentedOrder}`、`run.call.admitted{call, attempt}`、
`run.approval.consumed{request, call}`、`run.wait.claimed{holder, kind, since}` / `.released{holder, outcome}`、
`run.gate.awaited{gateRef, gateRet}` / `.returned{gateRef}`、`run.control.requested` / `.progressed`、
`run.late_fact.recorded{oldEpoch, source, classification}`。不提供任意 setState。占位不是
事件：它由 state 派生（[LC-02](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)）。

每条事件带去重键（用户裁决 U-34）：`eventId`、`(stream, seq)` 与 `operationId`，规则同
[Session 设计](../session/design.md#24-事件命名去重键与词汇)；`run.approval.consumed` 引用被消费
决定的 `eventId`，同一决定第二次消费在门内被拒。

## 提交面

[RD-03](../../../spec/capabilities/run-driver/v2/contract.md) 的每种 commitKind 对应一个
prepare/check 端口，返回 CC 的 RecordPreparation；每次 prepare 核对
`expected {run, epoch, runRevision}`，epoch 不符返回 `rejected(stale_epoch)` 并记
`late_fact_recorded`（[RN-02](../../../spec/capabilities/run/v1/contract.md)）。跨 owner 的提交由
具名组合者拼 batch，Run 只核自己的事实。

| 端口 | Run 侧记录 | 同一 batch 的其他 owner |
|---|---|---|
| `prepareOpenStep` | `step_opened{cutpoint}` | Session（`arrival_consumed`、水位） |
| `prepareAttempt{admit \| dispatch \| settle}` | `attempt_ref_recorded` | MC、BG |
| `prepareCalls{propose \| admit}` | `calls_proposed` / `call_admitted` | TL、AU、BG、HD |
| `prepareConsumeDecision` | `approval_consumed` | HD、TL、BG |
| `prepareSettleStep` | `step_settled` | 无 |
| `prepareAwaitGate` / `prepareGateReturn` | `gate_awaited` / `gate_returned`；state ↔ waiting_gate | 无 |
| `prepareSettleRun` | `settled`、`state_changed → completed/failed/cancelled`、`epoch_closed` | Session（[LC-04 行 4](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)：arrival 转换/关闭） |
| `prepareYield{reason}` | `epoch_closed{yield \| yield_forced}`；state 不变 | 无；AR 的 `settle(work)` 是提交后反应 |
| `prepareReacquire` / `prepareResume` | `epoch_issued{compat}` 同批封闭旧 epoch；resume 另记 `state_changed interrupted→running` | Session（[SE-18](../../../spec/capabilities/session/v1/contract.md) 裁决完成）、AR（工作许可） |
| `prepareControl{interrupt \| cancel \| force_stop \| resume}` | `control_requested` / `control_progressed`；force_stop 同批 `epoch_closed{force_stop}`；interrupted 上的 cancel 直接 `state_changed → cancelled`（[RN-03](../../../spec/capabilities/run/v1/contract.md)）；force_stop 的受理批同时整簿注销等待登记（`wait_released{*, cancelled}`）；interrupted 上的 force_stop 在没有可升级的停止未知调用时直达，有则进 `stopping`、只对 owner 声明 `stop.capability = forced_isolation` 的 unknown 调用各发一次 `stopCall{mode: force}`，owner 报 `isolated` 或再报 `unknown`（记 `isolation: unverified`）后 `state_changed → cancelled(force_stopped)`；owner 声明 `cooperative_fence` 的 unknown 调用在受理时就记 `isolation: unverified`，不阻止 cancelled（[RN-05](../../../spec/capabilities/run/v1/contract.md)，[工具提案作者裁决 10、14](../../../docs/proposals/tool-execution/README.md#第三轮作者裁决2026-09-15第三轮架构复核后)）；控制结果记 `complete \| partial{unknown: K}`；`interrupt_then_run` 的受理批记 `control_requested{interrupt, supersededByInput}`（[SE-08](../../../spec/capabilities/session/v1/contract.md)） | Session（会话级强停的 hold；复合打断的 `queue.item.enqueued` 与复合意图）；TL（单调用强停）
| `prepareCloseOut{interrupt \| superseded}` | 收口完成（每个停止请求都有物理事实——含 `unknown`——或调用已结算；两种收口同一条件）时记 `state_changed → interrupted` 与 `epoch_closed{interrupt}`；复合打断记 `state_changed → superseded`（run 下一版新增的终态）与 `epoch_closed{superseded}`，并在同批整簿注销等待登记（`wait_released{*, superseded}`，未消费 continuation 转 context）、把被保留的工作清单（转后台 / 保持后台 / 停止未确认的调用、未答请求）作为 `origin: system` 的 context 到达交给 Inbound 受理（作者裁决 12）。unknown 留在调用与控制记录上，不设"收口中"的 Run 状态，也不阻止新 Run（[LC-04 行 6 / 行 8](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)；候选见[工具提案 interrupt 动作链](../../../docs/proposals/tool-execution/lifecycle.md#interrupt-与-interrupt_then_run-的动作链)与[等待登记簿](../../../docs/proposals/tool-execution/lifecycle.md#等待登记簿)，作者裁决 1～3、8～12，待复核与 run 下一版） | Inbound（continuation → context 的改判；`system_notice` 到达的受理）；复合打断下 Session 的取批在收口提交之后进行、TL/HD（停止意图；同域同批，跨域沿 [CC-05](../../../spec/compositions/core-work-coordination/v2/contract.md)） |

命令 Run（[RN-06](../../../spec/capabilities/run/v1/contract.md)）由命令处理者经
`prepareSettleRun` 结算；`unknown` 保留占位可见。

## 读面

`omneRun` 提供 `readRun(run)`（状态、epoch、Step、等待位置、阻塞、控制）、
`listPlaceholder(session)`（按派生规则返回该 Session 唯一占位 Run 或 null）、
`waitingPositions(run)`（供裁决者按等待位置判意图）。首版同一协调域，Session 门在
门内直接读本读面；[LC-09](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)
的版本戳读面留到规划跨域部署时再加。
[RD-02](../../../spec/capabilities/run-driver/v2/contract.md) 的 view 由驱动器自己组合：
本读面加 Session 的 Inbound 读面加 TL/HD/MC 的非结算视图。读面经当前权限检查，
服务可见性不授予披露权。

## 投影与恢复兼容证据

驱动位置 `{run, epoch, currentStep, phase}` 不由本包计算：run-driver 包提供 reducer，
注册到 Session 的状态贡献面（stateKey `run.driver_position`，
[SE-10](../../../spec/capabilities/session/v1/contract.md)）；投影缓存归
[projection](../projection/design.md)。本包只 fold state、epoch 与 Step 目录。

`run.epoch.issued.compat` 存 [RN-08](../../../spec/capabilities/run/v1/contract.md) 兼容证据中
声明性的部分（`driverBinding`、消费的契约版本、reducer 版本）；媒体可达性与在途外部
工作引用是已提交事实，重取时重算核对，不复制进记录。形状由
[run-driver 设计](../../agent/run-driver/design.md#兼容性声明)固定；不兼容的 Run 保持原
状态、占位保留，等待用户控制或兼容实现。

## 装载效应与撤除责任

| 效应 | 所有者 | 撤除 | 保留 |
|---|---|---|---|
| `omneRun` 服务与 run 流 owner 登记 | RunPlugin | 有未封闭 epoch 的 Run 时，计划撤除先请求持有实例退役（Yield）再撤；繁忙且无在途政策则原子拒绝（[CB-13](../../../spec/compositions/agent-session-binding/v1/contract.md)） | run 流事实、占位派生 |
| 提交面在途 prepare | 调用方持有 | 关新 prepare → 等在途 batch completion → 撤服务 | 已提交 batch |
| 读面 | RunPlugin | 随服务撤回；投影视图 unavailable | 事实 |

复合退出顺序由 Session 包的组合者与调度者先撤（[提案 cordis §4](../../../docs/proposals/session-run-agent-lifecycles/cordis.md#4-装载效应与撤除责任)）。

## 实施与验证

先以 `packages/session/session` 现有 fold 风格建 run 流 decoder/fold 与 `RunPlugin`，
再接组合者。验收沿 [LC 场景](../../../spec/compositions/session-run-agent-lifecycles/v1/scenarios.md)
S02～S07 与 [run-driver 场景](../../../spec/capabilities/run-driver/v2/scenarios.md) S09/S11/S12/S16
的 Run 侧切片：stale epoch 拒绝、interrupted 上 cancel 直达 cancelled、Yield 不改状态、
重取兼容证据不符时保持原状态。未完成：事件数据 JSON Schema；多进程 epoch 活性判定。
