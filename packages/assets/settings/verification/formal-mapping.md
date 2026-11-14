# 设置协议的对照

规则归包组规格的[设置：写入、准备与原操作](../../SPEC.md#设置写入准备与原操作)、[设置：目标拥有者与来源](../../SPEC.md#设置目标拥有者与来源)与 Identity 的[成员资格预留与治理恢复](../../../identity/SPEC.md#成员资格预留与治理恢复)。模型在 `models/`，每份配置的预期（正控 `complete`，负控命中哪一条性质）登记在 [models.json](models.json)，由 [check.py](check.py) 判读。下表把规格、模型性质与守护它的实现与用例对上。实现位置省略各成员的 `src/`，用例省略 `tests/`。

有限检查是模型检查，不是归纳证明，也不是源码符合性。模型把每个存储域的事务抽象为原子动作，把来源资格、主体认证、外部回包真实性与持久存储原子性当作前提；它们不证明任意规模、真实跨进程事务、物理断电、目录分页、租户非干扰或秘密保管。

## SettingsComposition

两个目标、资格与声明的变化，一次配值变化，两个读者与一次准备提交。`epoch` 抽象已取得一致的目标依据。

| 性质                 | 规格规则                               | 实现                                                                                           | 用例                                                                      |
| -------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| BasisTracksSources   | 配值来源变化与目标变化都进入读取依据   | `settings/application.ts`、`settings-local/snapshot-participant.ts`                            | `settings/application`；`settings-local/catalog`                          |
| FrozenInput          | 已捕获调用的输入不随新快照改写         | 同上                                                                                           | `settings-local/catalog`（写后旧页与输入冻结）                            |
| GuardedCommit        | 提交时目标、声明、资格与编辑依据仍有效 | `settings-local/prepared-business.ts`、`commit-current.ts`、`prepared-terminal-participant.ts` | `settings-local/business-combination`；`assets-local/settings-governance` |
| RecoverableCommit    | 提交结果与来源计数、待通知事实同时成立 | 同上                                                                                           | `settings-local/crash`                                                    |
| FreshPublication     | 采用时依据仍当前，旧结果不覆盖较新结果 | 目录拒绝过期续页；最终采用归消费者                                                             | `settings-local/catalog`                                                  |
| UnloadPreservesValue | 撤除运行提供者不删除已提交配值         | `settings/registry.ts` 与目录可用性捕获                                                        | `settings-local/catalog`（卸载后重装读回）                                |

`commitValid` 与 `publicationValid` 记录动作线性化时的条件，不要求历史事实永远符合当前权限：撤权不改写历史成功，新操作另查资格。

## StandingCommit

同一成员的两个原操作与一次治理变更；消息可以延迟到封口之后。

| 性质                         | 规格规则                                   | 实现                                                         | 用例                                                                     |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| CurrentAtCommit              | 新设置效果出现时资格仍有效且原操作仍受保护 | `settings-local/identity.ts`、`identity-sql/coordination.ts` | `settings-local/prepared-identity`；`identity-sql/standing-reservations` |
| TerminalBeforeRelease        | 释放前必须有目的终态                       | `settings-local/prepared-terminal-participant.ts`            | 同上                                                                     |
| TerminalImmutable            | 已终止的操作不能被迟到写覆盖               | 同上                                                         | 同上                                                                     |
| NoHeldAfterRevocation        | 撤权完成时没有相关 held                    | `identity-sql/worker/standing.ts`                            | `identity-sql/standing-reservations`                                     |
| NoNewReservationsDuringDrain | 排空开始后不接受新的重叠预留               | 同上                                                         | 同上                                                                     |
| FreshGovernanceAuthorization | 排空后的治理阶段采用新的授权依据           | `identity-sql/coordination.ts`                               | 同上                                                                     |
| AtMostOneEffect              | 每个原操作至多一次目的效果                 | 终态约束                                                     | 同上                                                                     |

## SettingsSourceRetention

两个目的操作、两个来源修改与一次崩溃。`revision=0` 包括还没有配值的来源，首次设置也经过保留门。

| 性质                                                    | 规格规则                                 | 实现                                                              | 用例                                                            |
| ------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| SourceHoldsProtectRevision / CurrentAtDestinationCommit | held 期间不改来源，目的提交仍受保留      | `settings-local/source-retention-records.ts`、`source-service.ts` | `settings-local/source-retention`、`source-service`             |
| NoNewReservationsDuringDrain                            | 关门之后不增加重叠 held                  | 同上                                                              | 同上                                                            |
| TerminalBeforeRelease / SealedDestinationCannotCommit   | 只有目的终态可以释放，封口的目的不晚交   | `settings-local/preparation-source-destination.ts`                | `settings-local/source-service`                                 |
| GateHasPendingOwner / PendingHasGate                    | 根终态与门释放共同成立                   | `settings-local/source-retention-records.ts`                      | `settings-local/recovery-combination`                           |
| ExactGateRelease                                        | 旧根收尾不能清后继修改的门               | 同上                                                              | `settings-local/source-retention`                               |
| CurrentManagementAuthority                              | 来源写入仍受原管理资格约束               | `settings-local/organization-current-material.ts`                 | `settings-local/organization-current-service`                   |
| CurrentWriteConditions                                  | 业务条件失效时终结待决根，不再写值       | `settings-local/organization-recovery.ts`                         | `settings-local/organization-recovery`                          |
| PendingProgress                                         | 可恢复时持续推进，零 held 的待决不被遗漏 | 同上                                                              | `settings-local/organization-recovery`、`source-update-service` |

`PendingProgress` 以数据库最终可用、重启恢复与相应步骤弱公平为前提，不要求永久失联时仍能更新组织规则。

## SettingsSourceIdentity

| 性质                     | 规格规则                            | 实现                                                         | 用例                                     |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| ReadUsesSameIdentity     | 读用同一稳定来源身份                | `settings-local/source-layout.ts`、`snapshot-participant.ts` | `settings-local/source-provenance`       |
| WriteUsesSameIdentity    | 写用同一稳定来源身份                | `settings-local/prepared-business.ts`                        | 同上；`assets-local/settings-governance` |
| RetainUsesSameIdentity   | rebase 只保留两侧都有的完整来源身份 | `settings-local/rebase-decision.ts`                          | 同上                                     |
| CommitUsesCurrentBasis   | 提交同时核资格修订与值修订          | `settings-local/prepared-business.ts`                        | 同上                                     |
| RebindingChangesRevision | 绑定变化推进修订                    | 同上                                                         | 同上                                     |

## SettingsIntentAttempts

| 性质                         | 规格规则                     | 实现                                   | 用例                                  |
| ---------------------------- | ---------------------------- | -------------------------------------- | ------------------------------------- |
| ImmutableCommand             | 重新准备不改命令             | `settings-local/intent-records.ts`     | `settings-local/intent-allocation`    |
| TerminalRootCannotRevive     | 已终结的根不复活             | `settings-local/intent-settlement.ts`  | `settings-local/intent-settlement`    |
| AtMostOneActiveAttempt       | 旧尝试终结之前不分配后继     | `settings-local/intent-records.ts`     | `settings-local/intent-allocation`    |
| OnlyCurrentAttemptCommits    | 只有当前尝试、当前依据能提交 | `settings-local/intent-ready.ts`       | `settings-local/ready-combination`    |
| QueryIsReadOnly              | 查询不终结根                 | `settings-local/recovery-reference.ts` | `settings-local/recovery-reference`   |
| OrdinarySealKeepsPendingRoot | 普通尝试的封口不是业务取消   | `settings-local/intent-settlement.ts`  | `settings-local/intent-settlement`    |
| SourceSealTerminatesRoot     | 组织来源修改的尝试封口终结根 | 同上                                   | `settings-local/recovery-combination` |
| AttemptBudgetIsBounded       | 尝试数有上界                 | `settings-local/intent-records.ts`     | `settings-local/intent-allocation`    |
| OneBusinessEffect            | 至多一次业务效果             | 根不可复活与精确尝试共同保证           | 同上                                  |

## SettingsPreparationBootstrap

| 性质                          | 规格规则                 | 实现                                              | 用例                                    |
| ----------------------------- | ------------------------ | ------------------------------------------------- | --------------------------------------- |
| DurableRouteBeforeReservation | 恢复身份先于外部保留保存 | `settings-local/intent-records.ts`                | `settings-local/checkpoint-combination` |
| AttemptSurvivesRestart        | 崩溃不删除持久尝试       | 同上                                              | `settings-local/crash`                  |
| PreparedHasAllHolds           | 保留未齐不标已准备       | `settings-local/intent-ready.ts`                  | `settings-local/ready-combination`      |
| ReplyRequiresReadyAttempt     | 准备中不回复准备完成     | 同上                                              | 同上                                    |
| TerminalBeforeRelease         | 目的终态之前不释放保留   | `settings-local/prepared-terminal-participant.ts` | `settings-local/source-service`         |
| TerminalCannotPublishAgain    | 已封口的尝试不再变已准备 | `settings-local/intent-settlement.ts`             | `settings-local/intent-settlement`      |
| OnlyReadyAttemptCommits       | 未完成准备的尝试不提交   | `settings-local/intent-ready.ts`                  | `settings-local/ready-combination`      |
| OneBusinessEffect             | 至多一次业务效果         | 不可逆终态                                        | 同上                                    |

## SettingsReservationCustody

| 性质                        | 规格规则                 | 实现                                 | 用例                              |
| --------------------------- | ------------------------ | ------------------------------------ | --------------------------------- |
| RequestDurableBeforeCall    | 先保存请求，再发起保留   | `settings-local/standing-custody.ts` | `settings-local/standing-custody` |
| ImmutableReservationRequest | 已保存的请求不被替换     | 同上                                 | 同上                              |
| ReceiptBindsOriginalRequest | 回包只认原请求           | 同上                                 | 同上                              |
| SettledCannotBecomeHeld     | 已结算不退回 held        | 同上                                 | 同上                              |
| TerminalBeforeRelease       | 目的终态之前不释放       | 同上                                 | 同上                              |
| OneReservationIdentity      | 一个来源请求一个保留身份 | `settings-local/source-custody.ts`   | `settings-local/source-custody`   |

## StandingRequestSettlement

| 性质                     | 规格规则                               | 实现                                                                         | 用例                                                                    |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| NoLateHold               | 已结算之后迟到的预留不新建 held        | `identity-sql/coordination.ts`；`settings-local/source-retention-records.ts` | `identity-sql/standing-reservations`；`settings-local/source-retention` |
| TerminalBeforeCompletion | 目的终态之前不完成结算                 | 同上                                                                         | 同上；`settings-local/source-service`                                   |
| BoundCompletion          | 完成必须绑定原请求                     | 同上                                                                         | 同上                                                                    |
| Completion               | 弱公平结算且目的地可用时原请求最终完成 | 同上                                                                         | 同上                                                                    |

源端缺行对应模型的 absent，held 行对应 held，settled 行对应 settled；缺行时只能建立 aborted 终态。
