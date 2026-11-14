# tool-contract 形式模型对照

每节一个模型：上表是它检查的性质、守的规则和实现模型动作的源码位置，下表是每个配置的种类与预期的 TLC 结果。正控要求 TLC 完成检查且没有错误；负控只开一处违约，要求 TLC 以点名性质的反例结束。模型只证明列出的有限状态和前提，不证明实现。

## BodyLifecycle

模型 [BodyLifecycle.tla](models/body-lifecycle/BodyLifecycle.tla)。它假设账本与正文存储没有共同事务、每个参与者读自己的时钟且两两偏差不超过 ε（偏移在一次行为里固定，回拨不展开），并要求 `G > W + 2ε` 与 `D > W + 2ε`。

| 性质                     | 守的规则                                                                                               | 代码位置                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PublishedDurable`       | 已发布的引用只指向存储已封存、账本已关联的正文                                                         | [ledger-body-entries.ts](../../tool/src/ledger-body-entries.ts) 的 `settleBodyEntries`（引用未封存正文答 `body-not-sealed`）；[ledger-body-writer.ts](../../tool/src/ledger-body-writer.ts) 的 `sealBody`（存储封存在前，`sealBodyEntry` 在后） |
| `IntentBeforeBytes`      | 存储里有字节的正文，账本都已 `opened`                                                                  | [ledger-body-writer.ts](../../tool/src/ledger-body-writer.ts) 的 `permitFor`（只在 `opened` 提交答 `committed` 之后签发许可）；[ledger-body-entries.ts](../../tool/src/ledger-body-entries.ts) 的 `beginBodyEntry`                              |
| `ReadWithinWindow`       | 成功读取只发生在已关联正文的期限内；读完存储后用读者时钟再核一次期限                                   | [ledger-body-reads.ts](../../tool/src/ledger-body-reads.ts) 的 `readPage`                                                                                                                                                                       |
| `RefusalWithinWindow`    | 因到期拒绝只发生在期限前 ε 以内                                                                        | [ledger-body-reads.ts](../../tool/src/ledger-body-reads.ts) 的 `readPage`                                                                                                                                                                       |
| `NoEarlyDelete`          | 清扫者只删除已到期的正文                                                                               | [ledger-sweep.ts](../../tool/src/ledger-sweep.ts) 的 `createLedgerSweep`；[ledger-store.ts](../../tool/src/ledger-store.ts) 的 `due`                                                                                                            |
| `ReclaimedLeavesNoBytes` | `reclaimed` 的正文在存储里没有字节和清单：存储按自己的时钟校验许可截止，清扫先删字节再提交 `reclaimed` | [body-store.ts](../src/body-store.ts) 的 `verifyBodyPermit`；[ledger-sweep.ts](../../tool/src/ledger-sweep.ts) 的 `createLedgerSweep`；[result-offloading.ts](../../tool/src/result-offloading.ts) 的 `offloadingRefusal`（拒绝 `D ≤ W + 2ε`）  |
| `NoFalseIntegrity`       | 读不到字节时，`reclaimed`、`orphaned` 或 `expiresAt ≤ now + ε` 答 `expired`，其余才答 `integrity`      | [ledger-body-reads.ts](../../tool/src/ledger-body-reads.ts) 的 `readPage`                                                                                                                                                                       |
| `NoWriteAfterSettle`     | 结算后没有正文处于 `opened` 或 `sealed`                                                                | [ledger-body-entries.ts](../../tool/src/ledger-body-entries.ts) 的 `settleBodyEntries`（其余正文标孤儿）与 `sealBodyEntry`（结算后拒绝）                                                                                                        |
| `QuiescentStoreEmpty`    | 结算后时间越过全部 due、没有排期条目时，存储里没有本调用的字节                                         | [configuration.ts](../../tool/src/configuration.ts) 的 `checkResultConfiguration`（启动时拒绝 `G ≤ W + 2ε`）；[ledger-sweep.ts](../../tool/src/ledger-sweep.ts) 的 `createLedgerSweep`                                                          |
| `EventuallyReclaimed`    | 结算后每个孤儿最终回收                                                                                 | [ledger-sweep.ts](../../tool/src/ledger-sweep.ts) 的 `createLedgerSweep` 与 `decideReclaim`                                                                                                                                                     |

| 配置                                       | 种类 | 预期                                          |
| ------------------------------------------ | ---- | --------------------------------------------- |
| `BodyLifecycle-positive.cfg`               | 正控 | 全部不变式成立                                |
| `BodyLifecycle-progress.cfg`               | 正控 | `EventuallyReclaimed` 成立（`LiveSpec`）      |
| `BodyLifecycle-sweep-before-due.cfg`       | 负控 | 违反 `NoEarlyDelete`                          |
| `BodyLifecycle-link-unsealed.cfg`          | 负控 | 违反 `PublishedDurable`                       |
| `BodyLifecycle-seal-after-settle.cfg`      | 负控 | 违反 `NoWriteAfterSettle`                     |
| `BodyLifecycle-store-ignores-deadline.cfg` | 负控 | 违反 `ReclaimedLeavesNoBytes`                 |
| `BodyLifecycle-grace-too-small.cfg`        | 负控 | 违反 `QuiescentStoreEmpty`（`G = W + ε`）     |
| `BodyLifecycle-recheck-only-reclaimed.cfg` | 负控 | 违反 `NoFalseIntegrity`                       |
| `BodyLifecycle-permit-on-unknown.cfg`      | 负控 | 违反 `IntentBeforeBytes`                      |
| `BodyLifecycle-ttl-too-small.cfg`          | 负控 | 违反 `ReclaimedLeavesNoBytes`（`D = W + 2ε`） |
| `BodyLifecycle-no-recheck-after-read.cfg`  | 负控 | 违反 `ReadWithinWindow`                       |

## Disclosure

模型 [Disclosure.tla](models/disclosure/Disclosure.tla)。它不建模按页读回。

| 性质                      | 守的规则                                                                                       | 代码位置                                                                                                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FirstScreenWithinL`      | 每个首屏的总大小不超过 `L = min(T, S)`                                                         | [result-offloading.ts](../../tool/src/result-offloading.ts) 的 `offloadingBounds` 与 `planResultBody`                                                                                                                                                                       |
| `PreviewWithinBudget`     | 卸载的首屏：描述头在 `1..headerMax`，预览不超过 `min(Tp, Sp, ⌊L / k⌋)`，系统值取发出首屏时的值 | [result-offloading.ts](../../tool/src/result-offloading.ts) 的 `previewBudget`；[body-preview.ts](../../tool/src/body-preview.ts) 的 `mechanicalPreview` 与 `bodyHeader`；[configuration.ts](../../tool/src/configuration.ts) 的 `checkToolConfiguration`（重新装配时重查） |
| `InlineOnlyWithinL`       | 只有不超过 L 的正文内联                                                                        | [result-offloading.ts](../../tool/src/result-offloading.ts) 的 `planResultBody`                                                                                                                                                                                             |
| `BodyPreserved`           | 不为了放进首屏而改写正文；作者预览超过 P 时拒绝，不截断                                        | [result-offloading.ts](../../tool/src/result-offloading.ts) 的 `planResultBody`（`author-preview-too-large`）                                                                                                                                                               |
| `AcceptedDeclarationFits` | 受理的声明满足 `headerMax + P ≤ L`                                                             | [result-offloading.ts](../../tool/src/result-offloading.ts) 的 `offloadingFits` 与 `callOffloadingRefusal`（[runtime.ts](../../tool/src/runtime.ts) 的 `invoke` 在执行前调用）；[configuration.ts](../../tool/src/configuration.ts) 启动时检查 `SYSTEM_RETURN`              |

| 配置                                       | 种类 | 预期                       |
| ------------------------------------------ | ---- | -------------------------- |
| `Disclosure-positive.cfg`                  | 正控 | 全部不变式成立             |
| `Disclosure-max-not-min.cfg`               | 负控 | 违反 `PreviewWithinBudget` |
| `Disclosure-stale.cfg`                     | 负控 | 违反 `PreviewWithinBudget` |
| `Disclosure-header-in-budget-mismatch.cfg` | 负控 | 违反 `FirstScreenWithinL`  |
| `Disclosure-bypass.cfg`                    | 负控 | 违反 `FirstScreenWithinL`  |
| `Disclosure-rewrite.cfg`                   | 负控 | 违反 `BodyPreserved`       |

## Handoff

模型 [Handoff.tla](models/handoff/Handoff.tla)。它假设消费者把耐久材料或足够的恢复依据与 claim 放在同一可靠提交边界里，只检查安全性。

| 性质                    | 守的规则                                            | 代码位置                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NoResponsibilityGap`   | 生产者只凭消费方的耐久承接或已完成处理解除保管      | [ledger-decider.ts](../../tool/src/ledger-decider.ts) 的 `decideRelease` 与 `releaseTarget`；[ledger-result-material.ts](../../tool/src/ledger-result-material.ts) 的 `releasedResultValue` |
| `AtMostOneAppend`       | 同一结果的消费位置至多追加一条                      | 消费方的承接提交，不在本组                                                                                                                                                                  |
| `ClaimHasDurableRecord` | 已 claim 的结果恰有一条耐久记录                     | 消费方的承接提交，不在本组                                                                                                                                                                  |
| `ClaimBinding`          | 已 claim 的结果，其结果、租户、版本绑定与原结果一致 | 消费方的承接提交；[ledger-decider.ts](../../tool/src/ledger-decider.ts) 的 `releaseTarget` 核对回执属于原消费方                                                                             |

| 配置                    | 种类 | 预期                       |
| ----------------------- | ---- | -------------------------- |
| `Handoff-positive.cfg`  | 正控 | 全部不变式成立             |
| `Handoff-early.cfg`     | 负控 | 违反 `NoResponsibilityGap` |
| `Handoff-duplicate.cfg` | 负控 | 违反 `AtMostOneAppend`     |
