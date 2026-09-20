# Run：能力权威、执行者关系、提交面与投影

[提案索引](README.md) · [状态机与级联](lifecycles.md) · [Session](session.md) · [实例](agent.md) · [Cordis 视角](cordis.md)

本文件是 `capability.run` v1 的候选来源，也是新建 `packages/session/run` 提供者设计的
输入。条款来自 [session-run v2](../../../spec/capabilities/session-run/v2/contract.md)，
归属表见 [session.md §2](session.md#2-条款逐句归属)；推进规则仍归
[run-driver v1](../../../spec/capabilities/run-driver/v1/contract.md)，本文件不复述。

## 1. 目的与消费者

Run 是一次业务执行的权威：启动依据、状态、执行 epoch、Step 与 attempt 的引用、等待
位置与阻塞集合、控制意图、终态与原因。消费者是驱动器（读视图、发共同提交）、
控制入口（interrupt/resume/cancel/force_stop）、调度者（重取、开新 Run）、Session 的
组合者（取批建 Run、终态转接续、归档前提）、恢复过程（兼容证据）。Run 不拥有队列、
到达账本与实例，也不记录工具/人类决定/模型的事实，只保存对它们的引用与等待关系。

## 2. 对象与关系（候选 shape）

| 对象 | 最小 shape | 依据 |
|---|---|---|
| Run | `{run, session, tenant, basis: batch(items) / command(item) / trigger(item), definition, acquisitionBasis, modelSelection, epoch, state, blockers, waitingPositions, controlRevision, driverBinding, settledReason?}` | [SR-08](../../../spec/capabilities/session-run/v2/contract.md)、[I-4](../agent-loop-inbound/invariants.md)、[I-5](../agent-loop-inbound/invariants.md) |
| epoch | 不透明值；发行与封闭都是 run 流事实；同一 Run 同时至多一个未封闭 epoch | SR-08、[R-2](invariants.md#run) |
| 执行者（非耐久） | `null | {agent: AgentRef, epoch, workPermitId, driverGeneration}`；由 Registry 当前持有该 epoch 工作许可的实例派生 | [lifecycles.md](lifecycles.md#三条关系)、[AR-8/10](../../../spec/capabilities/live-agent/v1/contract.md) |
| Step | `{step, run, createdEpoch, kind: model / auxiliary(kind), cutpoint{basis?, consumedArrivals, contextWatermark}, attempts: refs, proposedCalls: refs, status}` | SR-08、[RD-06/07](../../../spec/capabilities/run-driver/v1/contract.md) |
| 等待位置 | `{kind: call(callRef, attemptRef?) / request(requestId) / gate(gateRef, gateRet) / run}` 的集合；调用与请求的事实在 TL/HD，接续就绪由 Inbound 的 classified arrival 表示 | SR-09、[RD-11/12](../../../spec/capabilities/run-driver/v1/contract.md)、[I-22](../agent-loop-inbound/invariants.md)、[I-24](../agent-loop-inbound/invariants.md) |
| Control | `{operation, run, observedEpoch, scope, kind, stage, effect, stopEvidence, remaining}` | SR-10～12 |

占位不是 Run 的字段：它是 Session 对 Run 的派生关系（[A-13](README.md#作者裁决)），
由 Run 的状态函数定义。Run 只需保证状态转移正确，占位唯一性随之成立（[L-2](invariants.md#关系与级联)）。

## 3. 提交面（驱动器与控制入口消费）

[RD-03](../../../spec/capabilities/run-driver/v1/contract.md) 的每种 commitKind 在 Run 侧对应
一个 prepare/check 端口；每次提交核对当前 epoch（[R-2](invariants.md#run)）并经 AR 的
`checkWork`（[CB-09](../../../spec/compositions/agent-session-binding/v1/contract.md)）。
跨 owner 的提交由具名组合者拼 batch，Run 只核自己的事实。

| commitKind | Run 侧记录 | 参加同一 batch 的其他 owner |
|---|---|---|
| open_step | `step_opened{cutpoint}` | Session（`arrival_consumed`、水位读取） |
| admit_attempt / dispatch_attempt / settle_attempt | `attempt_ref_recorded{step, attempt, phase}` | MC（attempt 事实）、BG（预留） |
| propose_call / admit_call | `calls_proposed{step, calls}` / `call_admitted{call}` | TL（proposed/admitted）、AU、BG、HD（ask） |
| consume_decision | `approval_consumed{request, call}` | HD（决定被消费）、TL、BG |
| settle_step | `step_settled{outcome}` | 无 |
| await_gate | `gate_awaited{gateRef, gateRet}`；状态 → waiting_gate | 无 |
| settle_run | `run_settled{state, reason}`；状态 → completed/failed/cancelled | Session（LC 行 3：arrival 转换/关闭） |
| Yield（RD-14） | `epoch_closed{reason: yield / yield_forced}`；状态不变 | 无；AR 的 settle(work) 是提交后反应 |
| 重取 / resume（RD-04） | `epoch_issued{epoch, driverBinding, compat}`，同批封闭旧 epoch | Session（SE-18 等待裁决完成）、AR（工作许可） |
| 控制受理（SR-10～12） | `control_requested` / `control_progressed`；force_stop 同批 `epoch_closed{reason: force_stop}` | Session（Session 级强停的 hold）、TL/HD（停止意图，同域则同批，跨域沿 CC-05） |

命令 Run（[RN-06](session.md#2-条款逐句归属)）的结算由命令处理者提交 `run_settled`，映射沿
[SR-07](../../../spec/capabilities/session-run/v2/contract.md)。

## 4. 读面（decide 的 view）

[RD-02](../../../spec/capabilities/run-driver/v1/contract.md) 的 view 由三部分 fold：Run 流
（状态、epoch、Step、等待位置、阻塞、控制）、Session 的 Inbound 读面（指向本 Run 等待
位置的 classified 且未消费 arrival、审批就绪、context 水位）、TL/HD/MC 权威的非结算视图
（[RD-09](../../../spec/capabilities/run-driver/v1/contract.md) 的 settling、executing 等）。
Run 插件只提供第一部分和"按 Run 查等待位置"的读面；驱动器自己组合三者。

## 5. 驱动位置投影与投影缓存

驱动位置 `{RunRef, epoch, currentStep, phase}` 由 run-driver 包提供 reducer，注册到
Session 的状态贡献注册面（[SE-10](session.md#2-条款逐句归属)），stateKey 候选
`run.driver_position`，输入为 run 流事件；Run 插件不自己计算 phase 以外的位置。投影
缓存（fold 状态加水位）归 projection 包，是可选加速；缺失或版本不符则重建。

## 6. 事件词汇 v2（候选）

run 流事件 kind 前缀 `run.`，version `"1"`；shape 在提供者设计固定。

| 事件 | 兑现 |
|---|---|
| `created{basis, definition, acquisitionBasis, modelSelection, epoch, driverBinding}` | SR-06/07/08；LC 行 3 同提交中 Run 侧的记录 |
| `state_changed{from, to, reason}` | SR-08～12；只由具名提交产生，不提供任意 setState |
| `epoch_issued{epoch, driverBinding, compat}` / `epoch_closed{epoch, reason: yield / yield_forced / force_stop / superseded}` | SR-08、RD-04/14、RN-08 |
| `step_opened{step, cutpoint}` / `step_settled{step, outcome}` | RD-06/10 |
| `attempt_ref_recorded{step, attempt, phase}` | RD-08（MC 事实在 MC 流，这里只记引用） |
| `calls_proposed{step, calls, presentedOrder}` / `call_admitted{call, attempt}` / `approval_consumed{request, call}` | RD-09/11 |
| `waiting_position_added{position}` / `waiting_position_removed{position, reason}` | SR-09、RD-11/12、I-22 |
| `gate_awaited{gateRef, gateRet}` / `gate_returned{gateRef}` | RD-12、I-24 |
| `control_requested{...}` / `control_progressed{...}` | SR-10～12 |
| `settled{state, reason, evidence, remainingIndependent}` | SR-09/20、RD-13/15 |
| `late_fact_recorded{oldEpoch, source, classification}` | SR-12、I-3 |

## 7. 恢复兼容证据（RN-08 的候选形状）

[SR-14](../../../spec/capabilities/session-run/v2/contract.md) 要求的恢复兼容证据在 Run 侧
记录为 `epoch_issued.compat`，候选内容：所需契约版本（session、run、run-driver、tools、
human-decisions、model-execution 的精确版本）、驱动绑定 `{driverKey, driverVersion}`、
投影 reducer 版本、媒体可达性摘要、外部工作原引用集合（在途 call/attempt/request）。
重取时新实例的 Factory 绑定与 reducer 版本必须与记录兼容（[RD-04](../../../spec/capabilities/run-driver/v1/contract.md)、
[A-10](../agent-loop-inbound/README.md#作者裁决2026-09-14cordis-层)）；不兼容的 Run 保持原状态、
占位保留（派生自状态，自然成立），等待用户控制或兼容实现。兼容性声明的精确形状归
`packages/agent/run-driver/design.md`，是 run-driver §7 缺口的一项。

## 8. Yield 与重取

沿 [RD-14](../../../spec/capabilities/run-driver/v1/contract.md) 与 [lifecycles.md 行 6/7](lifecycles.md#级联矩阵)：
Yield 是 Run 流的一条 `epoch_closed`，状态不变；重取是 `epoch_issued` 加旧 epoch 封闭，
operationId 从 `(RunRef, 封闭的 epoch)` 派生（[SR-18](../../../spec/capabilities/session-run/v2/contract.md)）。
崩溃没有 Yield 事实：恢复时"epoch 未封闭但 Registry 中无持有者"与"epoch 已封闭"在
派生上是同一种情况，都只能重取（[L-5](invariants.md#关系与级联)）。

## 9. 未决与未完成义务

- 兼容性声明的精确形状与核对位置（run-driver 提供者设计）。
- 命令处理者与 Run 插件的接口（命令 Run 的结算提交面），随命令能力的提供者设计确定。
- 跨协调域部署下 epoch 发行与旧执行者迟到提交的处置，见 [lifecycles.md 末节](lifecycles.md#跨协调域的预期)。
