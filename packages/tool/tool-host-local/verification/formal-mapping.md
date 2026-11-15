# tool-host-local 形式模型对照

每节一个模型：上表是它检查的性质、守的规则和实现模型动作的源码位置，下表是每个配置的种类与预期的 TLC 结果。正控要求 TLC 完成检查且没有错误；负控只开一处违约，要求 TLC 以点名性质的反例结束；见证是否定命题的反例，只说明那条轨迹可达。模型只证明列出的有限状态和前提，不证明源码精化；源码与模型的对应由本页与所列用例维护。超出有限范围的推广见[证明](proofs/start-fence-and-backoff.md)。

## StartFence

模型 [StartFence.tla](models/StartFence.tla)：一个租户、一个调用、一个 start、一个守卫资源；`clock` 是 host 域的修订顺序。多个 start、多个守卫、`permitRequirements` 的 required 与 unavailable 分支、跨进程不展开。

| 编号 | 性质                              | 守的规则                                                 | 代码位置与守卫                                                                                                                                            |
| ---- | --------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | `OneAcceptancePerStart`           | 一个 start 至多一条受理记录，至多一次 launch             | [start-coordinator.ts](../src/start-coordinator.ts) 的 `consume`（受理提交同时删 permit，之后 `progressOf` 认回）；`tests/start-fence-properties.spec.ts` |
| P2   | `FenceHolds`                      | 失效先提交，就围住此前签发的全部 permit                  | `invalidate` 守卫修订加一与 `InvalidationRecord` 同一提交；`consume` 比较 permit 里每个守卫修订；同一用例文件                                             |
| P3   | `NotStartedExcludes`              | inspect 答 not-started 之前签发的 permit，之后不能被受理 | `inspect` 的 `ExclusionRecord` 与删 permit 同一提交                                                                                                       |
| P4   | `ExclusionAndAcceptanceExclusive` | 已排除的调用没有受理；已受理的调用不能被排除             | `exclude` 的调用级 `RejectionRecord`；已有受理答 `conflict`                                                                                               |
| P5   | `GuardAdvancesPerOperation`       | 重送的失效认回首次证据，守卫每个操作只前进一次           | `invalidationKey`                                                                                                                                         |
| P6   | `OneDecision`                     | 一个 start 不能既受理又拒绝                              | `consume` 的决定次序                                                                                                                                      |
| T    | 无（只有守卫）                    | 他租户主体的操作一律 denied，不写记录                    | `tests/start-tenant-isolation.spec.ts`、`tests/start-fence-properties.spec.ts`                                                                            |

P2 的守卫以失效证据返回的那一步作为围栏点，比模型的提交点弱：提交已生效而答复丢失时，守卫不判断。

| 配置                                         | 种类 | 预期                                                               |
| -------------------------------------------- | ---- | ------------------------------------------------------------------ |
| `StartFence.cfg`                             | 正控 | 全部不变式成立                                                     |
| `StartFence-wide.cfg`                        | 正控 | 全部不变式成立（MaxPrepares=3、MaxInvalidations=3、MaxConsumes=6） |
| `StartFence-unsafe-stale-guard.cfg`          | 负控 | 违反 `FenceHolds`                                                  |
| `StartFence-unsafe-double-accept.cfg`        | 负控 | 违反 `OneAcceptancePerStart`                                       |
| `StartFence-unsafe-inspect-keeps-permit.cfg` | 负控 | 违反 `NotStartedExcludes`                                          |
| `StartFence-unsafe-resend-readvances.cfg`    | 负控 | 违反 `GuardAdvancesPerOperation`                                   |
| `StartFence-unsafe-exclude-accepted.cfg`     | 负控 | 违反 `ExclusionAndAcceptanceExclusive`                             |

## StartConsume

模型 [StartConsume.tla](models/start-consume/StartConsume.tla)：permit 与受理在每个调用自己的域，守卫与失效在租户级 `start-guards` 域，两个域没有共同的修订顺序。它检查受理提交断言守卫域修订号是否足以让受理与失效线性化。两个调用，没有公平性，不检查进展。

| 性质                     | 守的规则                                             | 代码位置                                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AcceptedAtCurrentGuard` | 每条受理记录的 permit 版本等于它提交那一刻的守卫版本 | [start-coordinator.ts](../src/start-coordinator.ts) 的 `consume` 返回 `assertGuards`，受理以 `asserts` 断言 `start-guards` 域修订号提交；[host-domains.ts](../src/host-domains.ts) 生成域名；`tests/start-coordinator.spec.ts` 在读守卫之后、提交之前注入失效 |
| `FenceAfterReturn`       | 失效的答复返回之后，再提交的受理不基于更旧的版本     | `invalidate` 提交之后才回复证据                                                                                                                                                                                                                               |
| `OneAcceptancePerCall`   | 每个调用至多一条受理                                 | 调用域 `start@<call>` 的受理记录                                                                                                                                                                                                                              |

实现比对的是本轮读到的守卫域修订号，并先核了 permit 里每个守卫修订号等于本轮读到的值，所以与模型的比对等价；不相关守卫的失效也会让受理冲突重试，不改变性质。

| 配置                              | 种类 | 预期                          |
| --------------------------------- | ---- | ----------------------------- |
| `StartConsume-positive.cfg`       | 正控 | 全部不变式成立                |
| `StartConsume-drop-assertion.cfg` | 负控 | 违反 `AcceptedAtCurrentGuard` |

## DeliveryBackoff

模型 [DeliveryBackoff.tla](models/DeliveryBackoff.tla)。退避状态只在内存里，模型不含进程重启，假设 `now()` 不后退。模型的 `End` 在转移的那一刻释放表项；源码在 worker 下一次观察到离开时释放，延迟至多一个重试间隔。

| 编号 | 性质                                   | 守的规则                                                         | 代码位置与守卫                                                                                                                                                                    |
| ---- | -------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1   | `PushesPaced`                          | 连续第 k 次 unavailable 推送不早于前 k−1 次等待之和              | [result-delivery.ts](../src/result-delivery.ts) 的 `pace` 与 `pacedAway`；`tests/delivery/backoff-bound.spec.ts`、`tests/delivery/unavailable-receiver.spec.ts`                   |
| Q2   | `DelayCapped`                          | 等待不超过 `maxMs`                                               | `pace`：`delay = last ? min(2·last, maxMs) : initialMs`                                                                                                                           |
| Q3   | `OwedUntilSaved`                       | unavailable 与确定失败都不结束交付责任                           | `push` 只在保存后 `unpace` 并 `state.save`                                                                                                                                        |
| Q4   | `ResetAfterAnswer`                     | 没有 unavailable 的答复清除退避                                  | `failed` 与保存分支清除表项                                                                                                                                                       |
| Q5   | `WarnPerPacedPush`                     | 每次进入退避写一条具名 warn                                      | `pace` 里的 `input.warn`                                                                                                                                                          |
| Q6   | `WarnPerDefiniteFailure`               | 每次确定失败（denied、invalid、异常）写一条具名 warn，交付仍待推 | `failed`；`push` 与 `receiverOf` 的 `try`；`tests/delivery/receiver-failure.spec.ts`                                                                                              |
| Q7   | `TableFollowsDelivery`、`TableBounded` | 只有仍待推的交付有表项，表的大小不超过在途交付数                 | `unpaceCall`（撤权）、`retainPaced`（run 结束）、`release`（执行器放弃）、`paced.clear()`（关闭）；`tests/delivery/receiver-failure.spec.ts`、`tests/executor-retirement.spec.ts` |
| L    | 无（只有守卫）                         | 等待结束后的驱动一定推送                                         | `tests/delivery/backoff-bound.spec.ts`                                                                                                                                            |

| 配置                                           | 种类 | 预期                                                                  |
| ---------------------------------------------- | ---- | --------------------------------------------------------------------- |
| `DeliveryBackoff.cfg`                          | 正控 | 全部不变式成立（一个交付）                                            |
| `DeliveryBackoff-table.cfg`                    | 正控 | 全部不变式成立，含 `TableFollowsDelivery`、`TableBounded`（两个交付） |
| `DeliveryBackoff-unsafe-hot-loop.cfg`          | 负控 | 违反 `PushesPaced`                                                    |
| `DeliveryBackoff-unsafe-no-cap.cfg`            | 负控 | 违反 `DelayCapped`                                                    |
| `DeliveryBackoff-unsafe-no-reset.cfg`          | 负控 | 违反 `ResetAfterAnswer`                                               |
| `DeliveryBackoff-unsafe-drop.cfg`              | 负控 | 违反 `OwedUntilSaved`                                                 |
| `DeliveryBackoff-unsafe-drop-on-failure.cfg`   | 负控 | 违反 `OwedUntilSaved`（确定失败结束了交付）                           |
| `DeliveryBackoff-unsafe-silent.cfg`            | 负控 | 违反 `WarnPerPacedPush`                                               |
| `DeliveryBackoff-unsafe-silent-failure.cfg`    | 负控 | 违反 `WarnPerDefiniteFailure`                                         |
| `DeliveryBackoff-unsafe-keep-on-end.cfg`       | 负控 | 违反 `TableBounded`                                                   |
| `DeliveryBackoff-unsafe-keep-on-end-entry.cfg` | 负控 | 违反 `TableFollowsDelivery`                                           |

## DormantCalls

模型 [DormantCalls.tla](models/DormantCalls.tla)：一个暂停等人的调用与一个进程里的执行器，检查休眠之后怎样被找回。多个调用与容量、控制的提示、进程重启不展开（它们走同一条 `Scan` 路）。

| 性质                 | 守的规则                                  | 代码位置                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DecisionTaken`      | 决定出现之后终被调用接受，提示丢失时也是  | [recovery-scans.ts](../src/recovery-scans.ts) 的按租户重扫                                                                                                                                                       |
| `HintIsEnough`       | 提示排入的那一次 run 就接受决定，不等扫描 | [runtime-executor.ts](../src/runtime-executor.ts) 的 `entryOf`（不在表里的调用读恢复，有工作就 `remember`）；休眠的退场在 run 返回之前完成（[instance-host.ts](../src/instance-host.ts) 对同一调用串行地跑 run） |
| `DormantIsNotTicked` | 定时器不重排已离开内存表的调用            | 重试 interval 只对表里未完成、未休眠的条目调 `instances.schedule`                                                                                                                                                |
| `WaitingLeavesTable` | 等人而无事可做的调用离开内存表            | 运行答 `idle` 且 `waitsForPerson` 成立时置 `dormant`，经 `retire` 移出                                                                                                                                           |

源码一侧的守卫是 `tests/runtime-composition/checkpoint.spec.ts` 的休眠用例。

| 配置                                      | 种类 | 预期                                  |
| ----------------------------------------- | ---- | ------------------------------------- |
| `DormantCalls.cfg`                        | 正控 | 全部性质成立（带 `-deadlock`）        |
| `DormantCalls-unsafe-no-rescan.cfg`       | 负控 | 违反 `DecisionTaken`（时序性质）      |
| `DormantCalls-unsafe-no-reentry.cfg`      | 负控 | 违反 `HintIsEnough`（动作性质）       |
| `DormantCalls-unsafe-no-dormant.cfg`      | 负控 | 违反 `WaitingLeavesTable`（时序性质） |
| `DormantCalls-unsafe-leave-after-run.cfg` | 负控 | 违反 `HintIsEnough`（动作性质）       |

## EnvironmentPreparation

模型 [EnvironmentPreparation.tla](models/EnvironmentPreparation.tla)：租户 A 有两项原操作，B 有一项；全局容量检查 1 与 2，每租户在途上限 1；正权重 DRR 抽象为选择任一有容量的租户队首，不证明加权份额或公平进展。原 tenant、call、operation、adoption、摘要、用途、固定请求与获取输入用八元组比较身份。没有公平前提，不检查进展。

外部前提由别的拥有者承担，模型只把它们编码成动作守卫：同一完整原获取键不重复分配；Tool 的 `excluded` 封住此前请求的迟到分配；执行环境的 `notAllocated` 是原键终局，不能翻成 `excluded`；首次采用只签发一次租约；外部 released 与排除回执真实且绑定原操作；资格裁定可信。

| 性质                                  | 守的规则                                                                 | 代码位置                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `LocalRefusalVacates`                 | 本地拒绝完成即无未发送占额                                               | [scheduled-environment.ts](../src/scheduled-environment.ts) 的 `pump` 与 `check` 的拒绝分支（诊断返回前撤回预占） |
| `SentDutyRetained`                    | 已发送而结局未知、已分配与待清理的责任继续占额                           | 同上；释放只在确认关闭后返额                                                                                      |
| `NoInventedExternalFinal`             | 未发送失败不铸造外部终局                                                 | 同上                                                                                                              |
| `OriginalRequestsOnly`                | 原请求的完整身份不改变                                                   | 同上的 `sendPreparation` 与 `queryPreparation`                                                                    |
| `OriginalAdapterAtForward`            | 外层等待恢复后仍沿原适配器转发                                           | `enqueue.dispatch`、`inspectOrRecognize` 与 `inspectPreparation` 在恢复后先核 retired，再同步调 `adoptionGuard`   |
| `QuotaBounds`                         | 总占额与每租户占额不超过边界                                             | `pump`                                                                                                            |
| `InspectNeverAdopts`                  | inspect 不产生首次采用                                                   | `inspectOrRecognize` 只查询                                                                                       |
| `NoColdAdoption`、`NoRetiredAdoption` | 丢了原登记或已退休，不能产生新采用                                       | 退休守卫与原登记核对                                                                                              |
| `ClosedNeverRequeues`                 | 已退休项不重新进入排队与预占                                             | 同上                                                                                                              |
| `EERejectionIsTerminal`               | 执行环境的 `notAllocated` 不重排，不变成首次分配                         | `checkedPreparationProgress`                                                                                      |
| `LocalFailureLeavesBSchedulable`      | A 本地失败后，合法、有容量的 B 队首仍能被调度（`ENABLED`，不是时序进展） | `pump` 按租户取队首                                                                                               |

| 配置                                       | 种类 | 预期                                                                                      |
| ------------------------------------------ | ---- | ----------------------------------------------------------------------------------------- |
| `EnvironmentPreparation.cfg`               | 正控 | 全部不变式成立（全局容量 2）                                                              |
| `EnvironmentPreparation-one-slot.cfg`      | 正控 | 全部不变式成立（全局容量 1）                                                              |
| `EnvironmentPreparation-leak.cfg`          | 负控 | 违反 `LocalRefusalVacates`                                                                |
| `EnvironmentPreparation-inspect.cfg`       | 负控 | 违反 `InspectNeverAdopts`                                                                 |
| `EnvironmentPreparation-cold.cfg`          | 负控 | 违反 `NoColdAdoption`                                                                     |
| `EnvironmentPreparation-retired.cfg`       | 负控 | 违反 `NoRetiredAdoption`                                                                  |
| `EnvironmentPreparation-forward.cfg`       | 负控 | 违反 `OriginalAdapterAtForward`（撤掉转发前的原采用守卫）                                 |
| `EnvironmentPreparation-witness-b.cfg`     | 见证 | `NeverBWhileADiagnosticWaits` 有反例：A 仍等诊断时 B 实际可发送                           |
| `EnvironmentPreparation-witness-quota.cfg` | 见证 | `NeverTwoTenantsWithAQueued` 有反例：A 有第二项排队，同时 A、B 各有一个在途（全局容量 2） |

## EnvironmentDriver

模型 [EnvironmentDriver.tla](models/EnvironmentDriver.tla)：驱动至多两次 step，每次可遇到 allocated、prepared、pending、unknown、unavailable 或身份不符的答复，取消与原采用变化可在等待之间发生。它不证明驱动与宿主的整个组合。

| 性质                                           | 守的规则                         | 代码位置                                                                                                                  |
| ---------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `OneExtraPreparePerStep`                       | 每步追加的 prepare 至多一次      | [driver.ts](../../tool/src/driver.ts) 的 `askEnvironment` 与 `continueAllocation`；`tool/tests/driver-allocation.spec.ts` |
| `OnlyPreparedCached`、`OnlyPreparedExecutable` | 只缓存、只连接 prepared 的环境值 | `prepare` 与 `environmentOf`                                                                                              |
| `OriginalContinuationInput`                    | 接续使用原调用输入               | `continueAllocation`                                                                                                      |

| 配置                          | 种类 | 预期                          |
| ----------------------------- | ---- | ----------------------------- |
| `EnvironmentDriver.cfg`       | 正控 | 全部不变式成立                |
| `EnvironmentDriver-loop.cfg`  | 负控 | 违反 `OneExtraPreparePerStep` |
| `EnvironmentDriver-cache.cfg` | 负控 | 违反 `OnlyPreparedCached`     |

## RetentionScope

模型 [RetentionScope.tla](models/retention-scope/RetentionScope.tla)：一个保留作用域在宿主适配器里的生命周期。预留留在创建它的获取自己的记录里，作用域记录只保存已接手的条目，作用域只有开放与已关闭两个状态，接手是唯一的跨域提交。两个调用、两个资源；提交可以丢失，重启丢弃全部内存视图。安全配置用对称归约，进展配置不用，并要求作用域持有的资源的停止弱公平。

| 性质                            | 守的规则                                                                  | 代码位置                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `NeverReopen`                   | 曾关闭的作用域始终处于已关闭                                              | [environment-state.ts](../src/environment-state.ts) 的 `closeRetention` 与 `takeDecision`（作用域已关闭答 `closed`） |
| `StopAnswer`                    | 已确认停止的保留进程的停止查询答 `confirmed`；从未被接手的键答 `notFound` | `stopRetained` 在同一次作用域提交里写 `ended/<key>`；`readEnded`                                                     |
| `CreatorStopAlwaysRecorded`     | 创建者对自己未被接手的预留记停止从不被拒绝，无论作用域是否已关闭          | `stopOwn` 经 `update` 写自己的记录，不读作用域是否关闭                                                               |
| `NoDoubleOwner`                 | 一个资源不能既被作用域持有又被创建者停止；每个资源至多一次接手写入        | `takeOver` 的 `commitScope` 断言创建者获取域修订号                                                                   |
| `ClosedAcquisitionNotTakenOver` | 已关闭的获取的预留不被接手                                                | `takeDecision` 核对创建者仍开放                                                                                      |
| `ScopeHoldsOnlyTakenOver`       | 作用域记录只保存已接手的条目，每条对应创建者记录里一条未停止的预留        | `RetentionState` 与 `withHandovers`                                                                                  |
| `EventuallyRemoved`             | 被接手的条目在其进程停止后最终离开作用域记录                              | `stopRetained`                                                                                                       |

| 配置                                             | 种类 | 预期                                                   |
| ------------------------------------------------ | ---- | ------------------------------------------------------ |
| `RetentionScope-positive.cfg`                    | 正控 | 前六条不变式成立                                       |
| `RetentionScope-progress.cfg`                    | 正控 | `EventuallyRemoved` 成立                               |
| `RetentionScope-reservation-in-scope.cfg`        | 负控 | 违反 `CreatorStopAlwaysRecorded`（预留写进作用域记录） |
| `RetentionScope-take-without-creator-assert.cfg` | 负控 | 违反 `NoDoubleOwner`                                   |
| `RetentionScope-reopen-after-close.cfg`          | 负控 | 违反 `NeverReopen`                                     |
| `RetentionScope-forget-end-fact.cfg`             | 负控 | 违反 `StopAnswer`                                      |
