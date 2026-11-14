# tool 形式模型对照

每节一个模型：上表是它检查的性质、守的规则和实现模型动作的源码位置，下表是每个配置的种类与预期的 TLC 结果。正控要求 TLC 完成检查且没有错误；负控只开一处违约，要求 TLC 以点名性质的反例结束。模型只证明列出的有限状态和前提，不证明实现。

## InvokeRecovery

模型 [InvokeRecovery.tla](models/InvokeRecovery.tla)。进展只在依赖最终恢复、调用者公平重入、来源签发与准入步骤公平执行时成立。

| 性质                    | 守的规则                                                 | 代码位置                                                                                                              |
| ----------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `OneIdentityPerKey`     | 每个完整 tenant/consumer 键只有一个调用身份              | [testing-source.ts](../src/testing-source.ts) 的 `resolve`（核验资格后读唯一键，无 await 的写段分配 reservation）     |
| `ReturnedOriginal`      | 签发或准入结果未知后重入，返回原身份，不换身份           | [testing-source.ts](../src/testing-source.ts) 的 reserved/issued 状态；[runtime.ts](../src/runtime.ts) 的来源结果映射 |
| `ConflictPreserves`     | 同键异输入是冲突，不覆盖原 history 与原固定请求          | [ledger.ts](../src/ledger.ts)（按原 operation 和固定输入认回）                                                        |
| `SettledDoesNotRestart` | 已收场的调用不重新启动；只在首次 admitted 且未启动时启动 | [driver.ts](../src/driver.ts) 的原启动围栏与已接受启动唯一性                                                          |
| `PendingProgress`       | 依赖恢复后，每个 reserved 最终 admitted 或 settled       | [runtime.ts](../src/runtime.ts) 调用原 `admissions.admit`；[ledger.ts](../src/ledger.ts) 按原 operation 认回          |

| 配置                        | 种类 | 预期                                                       |
| --------------------------- | ---- | ---------------------------------------------------------- |
| `InvokeRecovery.cfg`        | 正控 | 全部不变式与 `PendingProgress` 成立                        |
| `InvokeRecovery-unsafe.cfg` | 负控 | 违反 `OneIdentityPerKey`（未知恢复改成再次分配并覆盖原键） |

## FactCustody

模型 [FactCustody.tla](models/FactCustody.tla)。它假设 call 域提交原子、来源只凭有效原 receipt 释放且对同一 receipt 的 ACK 幂等，只检查有限安全性。

| 性质                           | 守的规则                             | 代码位置                                                                                                                                                           |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SourceReleaseRequiresCustody` | 源释放前已有完整保管                 | [driver-facts.ts](../src/driver-facts.ts) 的 `createFactDriver`（只为已保存原 receipt 的批次经原 live/recover 发送 receipt）                                       |
| `DutyRetained`                 | 保存后仍有 pending 或 confirmed 责任 | [ledger-facts.ts](../src/ledger-facts.ts) 的 `decideReceiveFacts` 与 `commitBatch`；[ledger-fact-ack.ts](../src/ledger-fact-ack.ts) 的 `decideFactAcknowledgement` |
| `OriginalReceiptRetained`      | 原 receipt 不丢失、不替换            | [ledger-facts.ts](../src/ledger-facts.ts) 的 `decideReceiveFacts`                                                                                                  |
| `ConflictingEventNotSaved`     | 同一事件的异值不保存                 | [ledger-facts.ts](../src/ledger-facts.ts) 的 `decideReceiveFacts`                                                                                                  |
| `ConfirmedIsNotPending`        | 重投不复活已确认的责任               | [ledger-fact-ack.ts](../src/ledger-fact-ack.ts) 的 `decideFactAcknowledgement`（确认、操作回执与任务删除同一提交）                                                 |
| `CursorHasCustody`             | cursor 只越过已保管的批次            | [ledger-facts.ts](../src/ledger-facts.ts) 的 `commitBatch`；[ledger.ts](../src/ledger.ts) 的 `transact`                                                            |

| 配置                     | 种类 | 预期                                                  |
| ------------------------ | ---- | ----------------------------------------------------- |
| `FactCustody.cfg`        | 正控 | 全部不变式成立                                        |
| `FactCustody-unsafe.cfg` | 负控 | 违反 `SourceReleaseRequiresCustody`（未保管就源释放） |

## SettlementRelease

模型 [SettlementRelease.tla](models/SettlementRelease.tla)。它假设 custody、call、queue 三个域各自 CAS 原子、彼此没有共同事务，已存 final 的真实性是输入前提。

| 性质                             | 守的规则                                                       | 代码位置                                                                                                                                                                |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ResultRequiresConfirmedCustody` | 原结果提交前已有确认的独立保管；已应用但丢答不算确认           | [ledger.ts](../src/ledger.ts) 的 `preserveResult`；[ledger-settlement.ts](../src/ledger-settlement.ts) 的原 final 与稳定 retain 身份                                    |
| `OneOriginal`                    | 原版本与 delivery 只有一个赢家，竞争或重试不新增               | [ledger-settlement.ts](../src/ledger-settlement.ts) 的 `checkSettlement`                                                                                                |
| `CallDutyRetained`               | call 成立后 queue 责任留存，直到确认 queue 释放                | [ledger.ts](../src/ledger.ts) 的 `releaseQueue`；[ledger-start.ts](../src/ledger-start.ts) 的 `decideCloseQueueTask`                                                    |
| `ReleaseRequiresBasis`           | 只凭调用域已记录的释放依据删除条目                             | [ledger-start.ts](../src/ledger-start.ts) 的 `decideQueueRelease`、`releaseBasisOf` 与 `decideLedgerRejected`（[ledger.ts](../src/ledger.ts) 的 `settleRejected` 调用） |
| `NoResurrection`                 | 释放后该调用没有条目；迟到的创建提交因断言调用域修订号而落不下 | [ledger.ts](../src/ledger.ts) 的 `order`；[ledger-start.ts](../src/ledger-start.ts) 的 `decideQueueOrder`（队列提交以 `asserts` 断言调用域修订号）                      |
| `NoDoubleHold`                   | 原条目与同 key 下一个调用的名额不并存                          | [ledger-start.ts](../src/ledger-start.ts) 的 `decideQueueHold`                                                                                                          |
| `QueueHoldsOnlyLive`             | 队列域只有计数器与活调用的条目；释放只删除条目                 | [ledger-start.ts](../src/ledger-start.ts) 的 `decideQueueRelease`                                                                                                       |
| `CloseRequiresQueueConfirmation` | 关闭 call 责任前已有确认的 queue 释放                          | [ledger.ts](../src/ledger.ts) 的 `releaseQueue`；[ledger-start.ts](../src/ledger-start.ts) 的 `decideCloseQueueTask`                                                    |

| 配置                                          | 种类 | 预期                                                |
| --------------------------------------------- | ---- | --------------------------------------------------- |
| `SettlementRelease.cfg`                       | 正控 | 全部不变式成立                                      |
| `SettlementRelease-unsafe-custody.cfg`        | 负控 | 违反 `ResultRequiresConfirmedCustody`               |
| `SettlementRelease-unsafe-queue.cfg`          | 负控 | 违反 `CloseRequiresQueueConfirmation`               |
| `SettlementRelease-create-without-assert.cfg` | 负控 | 违反 `NoResurrection`（创建提交不断言调用域修订号） |
| `SettlementRelease-queue-before-call.cfg`     | 负控 | 违反 `NoResurrection`（调用域记录依据之前删除条目） |

## SuspendedSlots

模型 [SuspendedSlots.tla](models/SuspendedSlots.tla)。它是 3 个调用、名额 1、容量 2 的有界实例，不建模 FIFO 次序，释放依据只分 `physical-end` 与 `suspended-exclusion`，受理时的容量检查当作一笔原子提交。

| 性质                     | 守的规则                                                      | 代码位置                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `CapacityBound`          | 持有名额的条目数不超过上限                                    | [ledger-start.ts](../src/ledger-start.ts) 的 `decideQueueHold`                                                                            |
| `RunningImpliesHeld`     | 正在运行的调用一定持有名额；停泊只停自己持有者的名额          | [ledger-start.ts](../src/ledger-start.ts) 的 `decideQueueHold`（含 `keep` 分支）、`decideRecordStart` 与 `decideQueuePark`                |
| `ParkedImpliesSuspended` | 停泊的条目对应的调用已提交暂停                                | [ledger-start.ts](../src/ledger-start.ts) 的 `decideQueuePark`                                                                            |
| `OutstandingBound`       | 未终局条目（ready、held、parked）数不超过容量；停泊条目仍计入 | [ledger-start.ts](../src/ledger-start.ts) 的 `decideQueueOrder`                                                                           |
| `ReleaseRequiresBasis`   | 条目只凭调用域的释放依据删除                                  | [ledger-start.ts](../src/ledger-start.ts) 的 `decideQueueRelease` 与 `releaseBasisOf`                                                     |
| `NoResurrection`         | 删除的条目不再出现：迟到的停泊或重新排队不重建它              | [ledger-start.ts](../src/ledger-start.ts) 的 `decideQueuePark` 与 `decideQueueRequeue`                                                    |
| `NoStrandedEntry`        | 收场的调用最终删除条目                                        | [ledger-start.ts](../src/ledger-start.ts) 的 `decideQueueRelease`                                                                         |
| `SuspendedReleasesSlot`  | 暂停且持有名额的调用最终释放名额                              | [ledger-start.ts](../src/ledger-start.ts) 的 `decideQueuePark`                                                                            |
| `ReadyProgresses`        | 就绪的调用最终恢复运行或收场                                  | [ledger-start.ts](../src/ledger-start.ts) 的 `decideQueueRequeue` 与 `decideQueueHold`；[ledger.ts](../src/ledger.ts) 的 `acceptDecision` |

| 配置                                      | 种类 | 预期                                     |
| ----------------------------------------- | ---- | ---------------------------------------- |
| `SuspendedSlots.cfg`                      | 正控 | 全部不变式与时序性质成立（关闭死锁检查） |
| `SuspendedSlots-unsafe-early.cfg`         | 负控 | 违反 `ParkedImpliesSuspended`            |
| `SuspendedSlots-unsafe-skiphold.cfg`      | 负控 | 违反 `RunningImpliesHeld`                |
| `SuspendedSlots-unsafe-parkfree.cfg`      | 负控 | 违反 `OutstandingBound`                  |
| `SuspendedSlots-unsafe-norelease.cfg`     | 负控 | 违反 `NoStrandedEntry`（时序性质）       |
| `SuspendedSlots-unsafe-parkdelete.cfg`    | 负控 | 违反 `NoResurrection`（动作性质）        |
| `SuspendedSlots-unsafe-parkanyholder.cfg` | 负控 | 违反 `RunningImpliesHeld`                |

## CallLifecycle

模型 [CallLifecycle.tla](models/call-lifecycle/CallLifecycle.tla)。它假设消费者先保存再确认、保存后不重发，`ack-before-save` 与 `consumer-resends-after-save` 是这两条前提的负控；清扫删除与并发写入的竞争不建模。

| 性质                    | 守的规则                                             | 代码位置                                                                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AtMostOnce`            | 同一标识的函数至多执行一次                           | [ledger-decider.ts](../src/ledger-decider.ts) 的 `ADMITTED_NOT_DUE`（受理撤销到期项）与 `decideRelease`（只在确认后排期删除）                                                                                                                              |
| `RemovedOnlyAfterSaved` | 调用域只在消费者保存结果之后删除                     | [ledger-decider.ts](../src/ledger-decider.ts) 的 `decideRelease`；[ledger-sweep.ts](../src/ledger-sweep.ts) 的 `removeCall`                                                                                                                                |
| `NoOrphanDue`           | 没有记录的域没有到期项                               | [ledger-store.ts](../src/ledger-store.ts) 的 `drop` 写（删除整个域及其到期项）                                                                                                                                                                             |
| `IdleIsScheduled`       | 不再被写的域有删除时刻；迟到操作写下的排除记录也排期 | [ledger-decider.ts](../src/ledger-decider.ts) 的 `removalInstant`；[ledger.ts](../src/ledger.ts) 的 `fenced`（空域排 `now + G`）                                                                                                                           |
| `BodyKept`              | 卸载正文在保存期限内可读                             | [ledger-decider.ts](../src/ledger-decider.ts) 的 `removalInstant`（不早于各正文期限）；[ledger.ts](../src/ledger.ts) 的 `releaseDelivery`                                                                                                                  |
| `NoOrphanBytes`         | 域删除后正文存储里不留它的字节                       | [ledger-sweep.ts](../src/ledger-sweep.ts) 的 `sweep`（`body:` 到期项排在 [ledger-store.ts](../src/ledger-store.ts) 的 `CALL_DUE_KEY` 之前）                                                                                                                |
| `NotRemovedWhileBusy`   | 有待办或宿主记录仍被引用时不删除                     | [ledger-sweep.ts](../src/ledger-sweep.ts) 的 `quiet` 与 `postpone`；[call-records.ts](../../tool-host-local/src/call-records.ts) 的 `createLocalCallRecords`；[environment-state.ts](../../tool-host-local/src/environment-state.ts) 的 `callAcquisitions` |
| `RemovalNotEarly`       | 带正文的调用不早于正文期限删除                       | [ledger-decider.ts](../src/ledger-decider.ts) 的 `removalInstant`                                                                                                                                                                                          |
| `EventuallyAcked`       | 已保存的结果会被确认                                 | [ledger-decider.ts](../src/ledger-decider.ts) 的 `decideRelease`                                                                                                                                                                                           |
| `EventuallyRemoved`     | 已排期的域到点后不再停留                             | [ledger-sweep.ts](../src/ledger-sweep.ts) 的 `sweep`、`postpone` 与 `removeCall`                                                                                                                                                                           |

| 配置                                            | 种类 | 预期                                                        |
| ----------------------------------------------- | ---- | ----------------------------------------------------------- |
| `CallLifecycle-positive.cfg`                    | 正控 | 全部不变式成立                                              |
| `CallLifecycle-progress.cfg`                    | 正控 | `EventuallyAcked` 与 `EventuallyRemoved` 成立（`FairSpec`） |
| `CallLifecycle-reclaim-before-ack.cfg`          | 负控 | 违反 `RemovedOnlyAfterSaved`                                |
| `CallLifecycle-ack-before-save.cfg`             | 负控 | 违反 `RemovedOnlyAfterSaved`                                |
| `CallLifecycle-consumer-resends-after-save.cfg` | 负控 | 违反 `AtMostOnce`                                           |
| `CallLifecycle-release-ignores-body.cfg`        | 负控 | 违反 `BodyKept`                                             |
| `CallLifecycle-sweep-before-due.cfg`            | 负控 | 违反 `BodyKept`                                             |
| `CallLifecycle-delete-without-unschedule.cfg`   | 负控 | 违反 `NoOrphanDue`                                          |
| `CallLifecycle-exclusion-without-due.cfg`       | 负控 | 违反 `IdleIsScheduled`                                      |
| `CallLifecycle-drop-before-body-bytes.cfg`      | 负控 | 违反 `NoOrphanBytes`                                        |
| `CallLifecycle-drop-while-busy.cfg`             | 负控 | 违反 `NotRemovedWhileBusy`                                  |
