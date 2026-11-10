# Run 驱动生命周期的有限模型

[RunLifecycle.tla](RunLifecycle.tla) 检查一个 Run 的驱动在一步里怎样发起 Model 调用和 Tool 动作、怎样等待结果、怎样在上限处停下，以及节点提交被确定拒绝时怎样停下。它与崩溃、答复丢失、准入不可用和接收方缺席交错。

模型检查只说明有限范围内的设计性质。它不证明产品实现符合模型。运行记录见 [formal-runs.md](formal-runs.md)，无界推广见 [proofs.md](proofs.md)，机读守卫在 [guards/](guards/run-lifecycle.spec.ts)。

## 契约依据与性质

出处中的 SPEC 指 [agent-contract SPEC](../../../agent-contract/SPEC.md)，Loop 页指 [loop-algorithm.md](../../docs/architecture/loop-algorithm.md)。

| 编号 | 性质（模型名） | 出处 | 违背后果 | 原来靠什么守 | 现在怎么守 |
| --- | --- | --- | --- | --- | --- |
| P1 | 对外发起至多一次：一步至多一个逻辑主 Model 调用，一个动作至多一次逻辑 Tool 发起；崩溃、答复丢失之后沿已保存身份认回（`P1_AtMostOnce`） | Loop 页 I1、M6、A2；SPEC「并发与提交」「作为 Model 调用方」（R2-D237） | 重复副作用：模型重复计费，工具重复执行 | `loop-recovery.spec.ts`、`loop-main-call.spec.ts` 的手写用例 | 模型；负控 `bad-dispatch-before-intent-p1`、`bad-retry-redispatch-p1` |
| P2 | 步数上限：步数与逻辑主请求数不超过 `maxRunSteps`；拒收后的重试计入；guard 终结时步数恰为上限；complete 只在无动作且已准入的回复之后（`P2_StepBound`、`P2_GuardAtLimit`、`P2_CompleteIsFinal`） | SPEC「循环守卫」（R2-D221）；Loop 页 I8（R2-D229） | 无界循环，费用无界 | `loop-run-steps.spec.ts` | 模型；负控 `bad-reject-not-counted-p2`；守卫 P2 |
| P3 | 失败不静默：驱动停下时槽位为 failed，恰好报告一次（`P3_StopVisible`、`P3_ReportedOnce`）。应然（`FailTerminates = TRUE`）：节点失败最终结束 Run（`L3_FailedRunEnds`）。实然（R2-D285）：Run 不结束 | `provider.ts` 的 `failRun`；R2-D282、R2-D285 | 卡死且无人知道 | `provider-run-failure.spec.ts`（只覆盖 I0） | 模型；负控 `bad-driver-swallows-p3`；守卫 P3（I0、M0、I4、F1）。`bad-is-no-terminate-l3` 是已知偏离的演示 |
| P4 | 结果保存后等待中的驱动被唤醒（`P4_WakeOnReceive`）；接收方没有登记时结果不丢（`P4_NoResultLost`） | Loop 页 W0；SPEC「结果接收」；R2-D273、R2-D283 | 结果已到却停到检查时刻，或结果丢失 | `loop-model-wait.spec.ts`；宿主的接收与退避用例 | 模型；负控 `bad-no-wake-p4`、`bad-drop-on-absent-p4` |
| P5 | 准入不可用时整批拒绝：没有动作保存意图或发起；A0 最终离开（`P5_UnavailableDeniesBatch`、`L2_AdmissionResolves`） | SPEC「整批判断屏障与动作准入」；R2-D266 | 停在 A0；或先允许的动作越过屏障 | `loop-tools.spec.ts` | 模型；负控 `bad-release-on-unavailable-p5`、`bad-stall-on-unavailable-l2` |
| P6 | 每步提交次数有界：不超过 `CBase + CAct × 动作数 + 崩溃数 + 被拒提交数`；等待无进展不提交（`P6_CommitsBounded`） | Loop 页「复杂度、上界与进展」 | 空转唤醒反复提交，Journal 随等待时长增长 | `loop-model-wait.spec.ts` | 模型；负控 `bad-commit-on-idle-wake-p6`；[证明](proofs.md#p6-每步提交次数) |

## 状态与有限范围

六组记录变量：`d`（驱动位置、checkpoint、步、请求数、回复、动作数、屏障、提交数）、`m`（主 Model 调用）、`acts`（每个动作）、`w`（等待）、`env`（接收方、崩溃、被拒提交、拒收、未知答复）、`run`（运行时槽位与报告）。

正控 `run-is` 与 `run-ought`：MaxSteps 3、MaxRunSteps 2、MaxActions 1、MaxCrashes 1、MaxRefuse 1、MaxRejects 1、MaxTicks 2、MaxUnknown 1、CBase 10、CAct 5。前者取实然 `FailTerminates = FALSE`，后者取应然 TRUE。`run-wide` 放大为 MaxActions 2、MaxRejects 2、MaxUnknown 2、MaxTicks 3。活性正控 `live-ought` 用 `Live`（驱动与环境弱公平），MaxSteps 与 MaxRunSteps 都为 2。

## 模型与代码的对应

| 模型 | 代码与契约 |
| --- | --- |
| `d.node`、`d.ckpt` | 协调者当前节点与 `checkpoint.position`（`src/loop/coordinator.ts`）。M6、M1、M4、M5 不写 checkpoint |
| `m.intent`（`SaveModelIntent`） | M0 的提交：首次 admit 前保存 `PendingCall.model.reference` |
| `m.sent`、`AdmitModel` | M6 的 `models.calls.admit`；unavailable 按依赖等待，unknown 按原 reference `inspect`（R2-D237） |
| `acts[i].intent`、`sent`、`assoc` | A2 的 `sendAction`：先提交意图，再 `tools.invoke`，再保存关联；关联未知时沿原 invoke 重入 |
| `Admission` | `src/loop/tools.ts` 的不可用准入；A1 的 all-denied 提交 |
| `Sleep`、`Wake` | `src/loop/wait.ts` 的 `waitForExecutionChange`；`src/provider.ts` 驱动闭包的等待循环 |
| `PushModel`、`PushTool`、`ReceiverUp` | agent-host-local 的接收与接收驱动（退避 1 秒起，到 60 秒）；Tool 宿主侧退避在 tool-host-local |
| `Refuse`、`run.slot`、`run.reported` | `src/provider.ts` 的 `failRun` 与槽位的 failed 分支；`FailTerminates = TRUE` 尚未实现 |
| `Decide` 的上限分支 | `coordinator.ts` 的 `stepLimit`：步序号达到 `maxRunSteps` 时给出 guard 三级失败候选 |
| `Crash`、`Recover` | 进程崩溃与后继 `attach` 接管 |

`Readable` 表示驱动不等新事实也能前进：有已提交未取的结果、有已取未写消息的结果，或本批已完成。只有不可前进时才进入 W0。

## 执行

运行入口是 [run-tlc.sh](run-tlc.sh)。它把模型和配置复制到 WSL 自己的文件系统，跑完把日志复制到工作树的 `tmp/formal-agent/`（可用 `RUN_LIFECYCLE_OUT` 改），再删 WSL 副本。

```sh
wsl.exe -d Ubuntu-24.04 --exec bash -l <WSL 视角的本目录>/run-tlc.sh [配置名 ...]
```

## 假设与遗漏

- `Refuse` 只指存储的确定拒绝（例如 `command_limit`），Journal 答确定失败。提交答暂时不可用（`unavailable`）是依赖等待，不经 `Refuse`，驱动不停止。这一路径由[有上限资源下 Run 的活性](../capacity-liveness/README.md)检查。
- 不建模：Journal 提交回执丢失（收尾模型与 Journal 车道覆盖）；W0 等待提交本身被拒；参加者协议；M6 的确定拒绝；压缩子图；扩展位置；卡片等待；多个 execution 与租户。
- 假定 Model 与 Tool 侧按身份认回同一调用。
- `bad-is-no-terminate-l3` 演示已知偏离：实然下节点失败不结束 Run。它不是缺陷记录，结束 Run 的实现归波 3。
