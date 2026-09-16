# Run 状态提供者设计映射

状态：目标设计，尚无 Run provider 源码；不得把文档接受或邻包 primitives 当成实现。 本页保留后续实现会持续消费的端口、状态、失败与撤除协议；来源中的旧
接受和旧坐标仅作 provenance。本 baseline 对应契约均为 candidate、`acceptance:null`。

目录名中的 `session-run` 沿用 `packages/session/run` 的来源路径，只表示 Run provider；它不定义、恢复或承载已退役的 `capability.session-run`。

## 投影共同约束

- Host 是长期状态与异步责任 owner；Cordis plugin 只注册受限服务/贡献并拥有本代资源。
- 链接插件固定双方 registration/generation，先封闭正向使用再撤回；它不复制业务状态。
- 每次 effect 前核对当前 Fiber、tenant、资格、binding、epoch 和取消；Context/AgentRef 不代授权。
- 撤除先关新工作、排空本代短门与私有资源；已耐久请求、调用、结果、费用与 unknown 留给长期 owner。

## 当前 v1 适配

- Run 状态只有 preparing/running/waiting/interrupted/stopping，加 completed/failed/cancelled/superseded 四个终态；gate 是 waiting ledger 项，不存在 `waiting_gate`。
- force_stop 的 isolation unknown/unverified 保持 stopping；门按 Tools execution exposure 求值，`settled(unknown)` 不出集合。只有绑定精确作用域与代次的强隔离证据允许 cancelled，partial 只描述效果结局未知。
- 恢复先完成完整前缀校验、fold 与 accepted-arrival 裁决，再发行 epoch；下文旧 provider 文字若与这三点冲突就是明确 gap。

## 来源协议（重基输入）

## Host 与服务

候选默认入口 `@omne-harness-lite/run` 拥有 `RunPlugin`、run 流的公共事件 decoder
与纯 fold，以及提交面/读面的类型。`RunPlugin` 提供服务 `omneRun`；required inject 为
`omneAdmission`（CC v2 协调者）、`omneRecords`（DR writer/reader 的受限面）、
`omneDiagnostics`、`omneIdentity`、`omneTenant`、`agents`（AR 的 `checkWork`）。
**不 inject `omneSession`**（作者裁决 A-12（legacy source: `../../../docs/proposals/session-run-agent-lifecycles/README.md#作者裁决`））：
凡需要同时改 Session 与 Run 的操作由 Session 包的组合者（legacy source: `../session/design.md#1-插件与服务`）
注入双方端口后一次 batch 提交。options 接 persistence（legacy source: `../persistence/design.md`） 恢复
校验后的 run 流 fold 结果与水位；先校验再 provide，坏前缀不默认空。

Run 提供者拥有 tenant-scoped stream `run(R)`（RN-01（legacy source: `../../../spec/capabilities/run/v1/contract.md`）），
一个 batch 至多一条 append。流身份、envelope 与事件词汇在 DR-01 的记录模型层定义，
JSONL 只是 DR-04 的一个提供者。

## 对象、状态与 epoch

| 对象 | 形状（候选） | 说明 |
|---|---|---|
| Run | `{run: RunRef, session, tenant, basis: batch \| command \| trigger, definition, acquisitionBasis, modelSelection, state, latestIssuedEpoch: EpochRef \| null, openEpoch: EpochRef \| null, steps, waitingPositions, blockers, control, settledEvidence}` | state 沿 RN-01～05（legacy source: `../../../spec/capabilities/run/v1/contract.md`）；basis 冻结精确修订与原消息顺序；latestIssued 保留历史身份，openEpoch=null 表示无提交权；runtime executor 另由 WorkPermit/Registry 观察 |
| Epoch | `{epoch: OpaqueId, driverBinding: {driverKey, driverVersion}, compat, issuedAt, closed: null \| {reason}}` | 耐久；持有者（实例、WorkPermit）不耐久，恢复时不反序列化 |
| Step | `{step, cutpoint, phase, proposedCalls, admittedCalls, attempts, outcome}` | 只记引用，不复制 TL/HD/MC 状态机 |

状态只由具名提交推进。事件 kind 按三段式 `<流>.<对象>.<事实>`（用户裁决
U-33（legacy source: `../../../docs/proposals/session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户`）），
version `"1"`：`run.lifecycle.created{basis, definition, acquisitionBasis, modelSelection}`、
`run.state.changed{from, to, reason, evidence?, remainingIndependent?}`、
`run.epoch.issued{epoch, driverBinding, compat}` / `.closed{epoch, reason: yield \| yield_forced \| reacquired \| interrupt \| force_stop \| superseded \| completed \| failed \| cancelled}`、
`run.step.opened{step, cutpoint}` / `.settled{step, outcome}`、
`run.calls.proposed{step, calls, presentedOrder}`、`run.call.admitted{call, attempt}`、
`run.approval.consumed{request, call}`、`run.wait.claimed{holder, kind, since}` / `.released{holder, outcome}`、
`run.gate.awaited{gateRef, gateRet}`、`run.control.requested` / `.progressed`。终态 reason/evidence/
remainingIndependent 属于 terminal state.changed/control facts；attempt observation 属于 M，gate 恢复由
gate_restored arrival + wait.released 表达，stale epoch 审计属于 OB/DR evidence。不提供任意 setState。占位不是
事件：它由 state 派生（LC-02（legacy source: `../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md`））。

`operationId` 是 prepare/重试稳定身份；最终 `eventId=(domain,batchSeq,index)` 只由 records commit 分配，
prepare 的临时关联 identity 不得冒充 eventId。每个 composite batch 对 run stream 至多一次 owner append，
aggregate revision 只 +1；同一 append 的多条 Run facts 共享该 revision，逐 fact 顺序由最终 envelope
`(batchSeq,index)` 和 append-local order 表达，不能用 `(stream,revision)` 逐 fact 去重。跨 owner
append 由组合者按当前 envelope format 的 canonical StreamRef 排序；prepare 的同批因果引用先用
`{kind:this_batch,stream,recordIndex}`，commit 后才解析最终 eventId，不能从跨流 prepare 顺序预测。
消费者以最终 eventId 去重；`run.approval.consumed` 引用被消费决定的最终 eventId，同一决定第二次消费在门内被拒。

## 提交面

RD-03（legacy source: `../../../spec/capabilities/run-driver/v2/contract.md`） 的每种 commitKind 对应一个
prepare/check 端口，返回 CC 的 RecordPreparation；每次 prepare 核对
`expected {run, runRevision, latestIssuedEpoch, openEpoch}`。prepare 无副作用，由 Run owner 独占生成 Run facts
和 opaque owner guard；跨 owner 协调者只能原样合并。在 CC 单次 submit 时 owner guard 再核 exact expected/
operationId，stale 拒绝整个 batch；Run revision 是每 owner append/operation 推进一次的 aggregate/stream revision，
同一 append 内多条事实只用稳定内部序，不按事实数增长。operation lookup 只认 committed 结果。epoch 不符返回 `rejected(stale_epoch)`；工程隔离证据由 OB/DR
operation evidence 记录，不写 Run 业务事实。跨 owner 的提交由
具名组合者拼 batch，Run 只核自己的事实。

| 端口 | Run 侧记录 | 同一 batch 的其他 owner |
|---|---|---|
| `prepareOpenStep` | `run.step.opened{cutpoint}` | Session（`inbound.arrival.consumed`、水位） |
| `prepareAttempt{admit \| dispatch \| settle}` | 不写 attempt 镜像；只以 Step/epoch/fence 作共同门 guard | MC、BG 写各自权威事实 |
| `prepareCalls{propose \| admit}` | `run.calls.proposed` / `run.call.admitted` | TL、AU、BG、HD |
| `prepareConsumeDecision` | `run.approval.consumed` | HD、TL、BG |
| `prepareSettleStep` | `run.step.settled` | 无 |
| `prepareAwaitGate` / gate-restored adjudication | `run.gate.awaited`；恢复时权威 arrival 与 `run.wait.released{holder:gateRef,outcome:passed}` 同 batch | Session Inbound |
| `prepareTransition{intent: terminal}` | terminal `run.state.changed{reason,evidence,remainingIndependent}`；若 openEpoch 存在，owner 同批给匹配的唯一 closed；否则返回原 epochClosureRef 且不重复写 | Session（LC-04 行 4：arrival 转换/关闭）只合并 owner preparation |
| `prepareTransition{intent: yield}` | openEpoch 的唯一 `run.epoch.closed{yield \| yield_forced}`；state 不变 | 无；AR 的 `settle(work)` 是提交后反应 |
| create / `prepareTransition{intent: reacquire \| resume}` | 首次 created+issued；后续无论 reacquire/resume 都发行 successor，旧 epoch open 时 owner 先以 `reacquired` 唯一关闭，已 closed 则引用原 close。active terminationIntent 硬拒 successor。resume 同批按需 state.changed；回执丢失 lookup committed operation | AR WorkPermit；不得先发 epoch 再补恢复 |
| `prepareTransition{intent: interrupt \| cancel \| force_stop}` | 控制受理、epoch 撤销与等待登记按 RN-03/05；openEpoch 由 owner 唯一关闭，已 closed 引用原 close。force_stop 进入 stopping并激活 terminationIntent，以 execution exposure 建门集合；settled unknown、错代/迟到证据不关项 | Session 用户 hold 独立；未过门 stopping 派生 scheduler barrier |
| `prepareCloseOut{interrupt \| superseded}` | interrupt 可在物理 unknown 显式记录后进入 interrupted；interrupt_then_run 收口为 superseded、整簿注销并把未确认责任写入 system context，随后可开新驱动。两者都保留 unknown，不把它说成停止成功；force_stop 不使用此较弱门 | Inbound 与 Session 组合 |

命令 Run（RN-06（legacy source: `../../../spec/capabilities/run/v1/contract.md`））由命令处理者请求 Run owner
`prepareTransition{terminal}` 结算；`unknown` 保留占位可见。

## 读面

`omneRun` 提供 `readRun(run)`（状态、epoch、Step、等待位置、阻塞、控制）、
`listPlaceholder(session)`（按派生规则返回唯一占位 Run 或 null）、`listNonTerminal(session)`（归档门读取全部非终态 Run，包含不占位的 stopping）、
`listStopBarriers(session)`（返回所有未通过 RN-05 exposure 门的 stopping Run；供 Session scheduler 派生 barrier，不改变占位）、
`waitingPositions(run)`（供裁决者按等待位置判意图）。首版同一协调域，Session 门在
门内直接读本读面；LC-09（legacy source: `../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md`）
的版本戳读面留到规划跨域部署时再加。
RD-02（legacy source: `../../../spec/capabilities/run-driver/v2/contract.md`） 的 view 由驱动器自己组合：
本读面加 Session 的 Inbound 读面加 TL/HD/MC 的非结算视图。读面经当前权限检查，
服务可见性不授予披露权。

## 投影与恢复兼容证据

驱动位置 `{run, epoch, currentStep, phase}` 不由本包计算：run-driver 包提供 reducer，
注册到 Session 的状态贡献面（stateKey `run.driver_position`，
SE-10（legacy source: `../../../spec/capabilities/session/v1/contract.md`））；投影缓存归
projection（legacy source: `../projection/design.md`）。本包只 fold state、epoch 与 Step 目录。

`run.epoch.issued.compat` 存 RN-08（legacy source: `../../../spec/capabilities/run/v1/contract.md`） 兼容证据中
声明性的部分（`driverBinding`、消费的契约版本、reducer 版本）；媒体可达性与在途外部
工作引用是已提交事实，重取时重算核对，不复制进记录。形状由
run-driver 设计（legacy source: `../../agent/run-driver/design.md#兼容性声明`）固定；不兼容的 Run 保持原
状态、占位保留，等待用户控制或兼容实现。

## 装载效应与撤除责任

| 效应 | 所有者 | 撤除 | 保留 |
|---|---|---|---|
| `omneRun` 服务与 run 流 owner 登记 | RunPlugin | 有未封闭 epoch 的 Run 时，计划撤除先请求持有实例退役（Yield）再撤；繁忙且无在途政策则原子拒绝（CB-13（legacy source: `../../../spec/compositions/agent-session-binding/v1/contract.md`）） | run 流事实、占位派生 |
| 提交面在途 prepare | 调用方持有 | 关新 prepare → 等在途 batch completion → 撤服务 | 已提交 batch |
| 读面 | RunPlugin | 随服务撤回；投影视图 unavailable | 事实 |

复合退出顺序由 Session 包的组合者与调度者先撤（提案 cordis §4（legacy source: `../../../docs/proposals/session-run-agent-lifecycles/cordis.md#4-装载效应与撤除责任`））。

## 实施与验证

先以 `packages/session/session` 现有 fold 风格建 run 流 decoder/fold 与 `RunPlugin`，
再接组合者。验收沿 LC 场景（legacy source: `../../../spec/compositions/session-run-agent-lifecycles/v1/scenarios.md`）
S02～S07 与 run-driver 场景（legacy source: `../../../spec/capabilities/run-driver/v2/scenarios.md`） S09/S11/S12/S16
的 Run 侧切片：stale epoch 拒绝、interrupted 上 cancel 直达 cancelled、Yield 不改状态、
重取兼容证据不符时保持原状态。未完成：事件数据 JSON Schema；多进程 epoch 活性判定。
