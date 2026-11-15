# Run 驱动生命周期的有限模型

[RunLifecycle.tla](RunLifecycle.tla) 检查一个 Run 的驱动在一步里怎样发起 Model 调用和 Tool 动作、怎样等待结果、怎样在上限处停下，以及节点提交被确定拒绝时怎样停下。它与崩溃、答复丢失、准入不可用和接收方缺席交错。

模型检查只说明有限范围内的设计性质。它不证明产品实现符合模型。无界推广见[手写证明](proofs/run-lifecycle.md)，机读守卫在 [guards/](guards/run-lifecycle.spec.ts)。

## 契约依据与性质

出处里引号中的名字是这些规则原来所在的小节，规则现在在[包组规格](../../../SPEC.md#应然设计)。

| 编号 | 性质（模型名）                                                                                                                                                                                 | 出处                                                        | 违背后果                                 | 原来靠什么守                                                 | 现在怎么守                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| P1   | 对外发起至多一次：一步至多一个逻辑主 Model 调用，一个动作至多一次逻辑 Tool 发起；崩溃、答复丢失之后沿已保存身份认回（`P1_AtMostOnce`）                                                         | Loop 页 I1、M6、A2；SPEC「并发与提交」「作为 Model 调用方」 | 重复副作用：模型重复计费，工具重复执行   | `loop-recovery.spec.ts`、`loop-main-call.spec.ts` 的手写用例 | 模型；负控 `bad-dispatch-before-intent-p1`、`bad-retry-redispatch-p1`                                     |
| P2   | 步数上限：步数与逻辑主请求数不超过 `maxRunSteps`；拒收后的重试计入；guard 终结时步数恰为上限；complete 只在无动作且已准入的回复之后（`P2_StepBound`、`P2_GuardAtLimit`、`P2_CompleteIsFinal`） | SPEC「循环守卫」；Loop 页 I8                                | 无界循环，费用无界                       | `loop-run-steps.spec.ts`                                     | 模型；负控 `bad-reject-not-counted-p2`；守卫 P2                                                           |
| P3   | 失败不静默：驱动停下时槽位为 failed，恰好报告一次（`P3_StopVisible`、`P3_ReportedOnce`）。应然（`FailTerminates = TRUE`）：节点失败最终结束 Run（`L3_FailedRunEnds`）。实然：Run 不结束        | `provider.ts` 的 `failRun`；                                | 卡死且无人知道                           | `provider-run-failure.spec.ts`（只覆盖 I0）                  | 模型；负控 `bad-driver-swallows-p3`；守卫 P3（I0、M0、I4、F1）。`bad-is-no-terminate-l3` 是已知偏离的演示 |
| P4   | 结果保存后等待中的驱动被唤醒（`P4_WakeOnReceive`）；接收方没有登记时结果不丢（`P4_NoResultLost`）                                                                                              | Loop 页 W0；SPEC「结果接收」；                              | 结果已到却停到检查时刻，或结果丢失       | `loop-model-wait.spec.ts`；宿主的接收与退避用例              | 模型；负控 `bad-no-wake-p4`、`bad-drop-on-absent-p4`                                                      |
| P5   | 准入不可用时整批拒绝：没有动作保存意图或发起；A0 最终离开（`P5_UnavailableDeniesBatch`、`L2_AdmissionResolves`）                                                                               | SPEC「整批判断屏障与动作准入」；                            | 停在 A0；或先允许的动作越过屏障          | `loop-tools.spec.ts`                                         | 模型；负控 `bad-release-on-unavailable-p5`、`bad-stall-on-unavailable-l2`                                 |
| P6   | 每步提交次数有界：不超过 `CBase + CAct × 动作数 + 崩溃数 + 被拒提交数`；等待无进展不提交（`P6_CommitsBounded`）                                                                                | Loop 页「复杂度、上界与进展」                               | 空转唤醒反复提交，Journal 随等待时长增长 | `loop-model-wait.spec.ts`                                    | 模型；负控 `bad-commit-on-idle-wake-p6`；[证明](proofs/run-lifecycle.md#p6-每步提交次数)                  |

## 状态与有限范围

六组记录变量：`d`（驱动位置、checkpoint、步、请求数、回复、动作数、屏障、提交数）、`m`（主 Model 调用）、`acts`（每个动作）、`w`（等待）、`env`（接收方、崩溃、被拒提交、拒收、未知答复）、`run`（运行时槽位与报告）。

正控 `run-is` 与 `run-ought`：MaxSteps 3、MaxRunSteps 2、MaxActions 1、MaxCrashes 1、MaxRefuse 1、MaxRejects 1、MaxTicks 2、MaxUnknown 1、CBase 10、CAct 5。前者取实然 `FailTerminates = FALSE`，后者取应然 TRUE。`run-wide` 放大为 MaxActions 2、MaxRejects 2、MaxUnknown 2、MaxTicks 3。活性正控 `live-ought` 用 `Live`（驱动与环境弱公平），MaxSteps 与 MaxRunSteps 都为 2。

## 模型与代码的对应

| 模型                                  | 代码与契约                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `d.node`、`d.ckpt`                    | 协调者当前节点与 `checkpoint.position`（`src/loop/coordinator.ts`）。M6、M1、M4、M5 不写 checkpoint |
| `m.intent`（`SaveModelIntent`）       | M0 的提交：首次 admit 前保存 `PendingCall.model.reference`                                          |
| `m.sent`、`AdmitModel`                | M6 的 `models.calls.admit`；unavailable 按依赖等待，unknown 按原 reference `inspect`                |
| `acts[i].intent`、`sent`、`assoc`     | A2 的 `sendAction`：先提交意图，再 `tools.invoke`，再保存关联；关联未知时沿原 invoke 重入           |
| `Admission`                           | `src/loop/tools.ts` 的不可用准入；A1 的 all-denied 提交                                             |
| `Sleep`、`Wake`                       | `src/loop/wait.ts` 的 `waitForExecutionChange`；`src/provider.ts` 驱动闭包的等待循环                |
| `PushModel`、`PushTool`、`ReceiverUp` | agent-host-local 的接收与接收驱动（退避 1 秒起，到 60 秒）；Tool 宿主侧退避在 tool-host-local       |
| `Refuse`、`run.slot`、`run.reported`  | `src/provider.ts` 的 `failRun` 与槽位的 failed 分支；`FailTerminates = TRUE` 是应然                 |
| `Decide` 的上限分支                   | `coordinator.ts` 的 `stepLimit`：步序号达到 `maxRunSteps` 时给出 guard 三级失败候选                 |
| `Crash`、`Recover`                    | 进程崩溃与后继 `attach` 接管                                                                        |

`Readable` 表示驱动不等新事实也能前进：有已提交未取的结果、有已取未写消息的结果，或本批已完成。只有不可前进时才进入 W0。

## 假设与遗漏

- `Refuse` 只指存储的确定拒绝（例如 `command_limit`），Journal 答确定失败。提交答暂时不可用（`unavailable`）是依赖等待，不经 `Refuse`，驱动不停止。这一路径由[有上限资源下 Run 的活性](../capacity-liveness/formal-mapping.md)检查。
- 不建模：Journal 提交回执丢失（收尾模型与 Journal 车道覆盖）；W0 等待提交本身被拒；参加者协议；M6 的确定拒绝；压缩子图；扩展位置；卡片等待；多个 execution 与租户。
- 假定 Model 与 Tool 侧按身份认回同一调用。
- `bad-is-no-terminate-l3` 取实然 `FailTerminates = FALSE`，演示节点失败不结束 Run 时 `L3_FailedRunEnds` 不成立。

## 配置的预期

正控搜索完成且没有反例。安全负控看 `Invariant <名> is violated`；活性负控只声明一条性质，看 `Temporal properties were violated`。

| 配置                            | 种类           | 预期                             |
| ------------------------------- | -------------- | -------------------------------- |
| `run-is`                        | 正控（实然）   | 无反例                           |
| `run-ought`                     | 正控（应然）   | 无反例                           |
| `run-wide`                      | 正控，放大范围 | 无反例                           |
| `live-ought`                    | 活性正控       | 无反例：L1、L2、L3               |
| `bad-dispatch-before-intent-p1` | 负控           | `P1_AtMostOnce` 违反             |
| `bad-retry-redispatch-p1`       | 负控           | `P1_AtMostOnce` 违反             |
| `bad-reject-not-counted-p2`     | 负控           | `P2_StepBound` 违反              |
| `bad-driver-swallows-p3`        | 负控           | `P3_StopVisible` 违反            |
| `bad-no-wake-p4`                | 负控           | `P4_WakeOnReceive` 违反          |
| `bad-drop-on-absent-p4`         | 负控           | `P4_NoResultLost` 违反           |
| `bad-release-on-unavailable-p5` | 负控           | `P5_UnavailableDeniesBatch` 违反 |
| `bad-commit-on-idle-wake-p6`    | 负控           | `P6_CommitsBounded` 违反         |
| `bad-stall-on-unavailable-l2`   | 活性负控       | `L2_AdmissionResolves` 违反      |
| `bad-is-no-terminate-l3`        | 活性负控       | `L3_FailedRunEnds` 违反          |
