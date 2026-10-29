# 配置与具名目标

配置中的 constants、invariants 与 deadlock 设置是实际运行输入。表格由各模型 cases.json 派生，未改变 cfg。正控完整搜索与具名反例的成功含义见 [README](README.md)。

## frontier

| 配置 | 用途 | 精确目标 |
| --- | --- | --- |
| [positive-small](frontier/cfg/positive-small.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [positive-cancel](frontier/cfg/positive-cancel.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [positive-finish](frontier/cfg/positive-finish.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [positive-archive](frontier/cfg/positive-archive.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [positive-ended](frontier/cfg/positive-ended.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [positive-freeze](frontier/cfg/positive-freeze.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [positive-batch](frontier/cfg/positive-batch.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [positive-successor](frontier/cfg/positive-successor.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [positive-race](frontier/cfg/positive-race.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [positive-recovery](frontier/cfg/positive-recovery.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [positive-plain](frontier/cfg/positive-plain.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [positive-accept-race](frontier/cfg/positive-accept-race.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [positive-multiple-relations](frontier/cfg/positive-multiple-relations.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [positive-event-counts](frontier/cfg/positive-event-counts.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [negative-partial-batch](frontier/cfg/negative-partial-batch.cfg) | negative | 违反 `ExactBatch` |
| [negative-revision-cursor](frontier/cfg/negative-revision-cursor.cfg) | negative | 违反 `HeadCursorSeparate` |
| [negative-foreign](frontier/cfg/negative-foreign.cfg) | negative | 违反 `TenantSeparation` |
| [negative-history-clear](frontier/cfg/negative-history-clear.cfg) | negative | 违反 `SuccessorUnaffected` |
| [negative-no-prefix](frontier/cfg/negative-no-prefix.cfg) | negative | 违反 `NoFalseRelease` |
| [negative-prepare-ended](frontier/cfg/negative-prepare-ended.cfg) | negative | 违反 `CancelWindow` |
| [negative-no-root](frontier/cfg/negative-no-root.cfg) | negative | 违反 `NoFalseRelease` |
| [negative-no-grant](frontier/cfg/negative-no-grant.cfg) | negative | 违反 `NoPostTerminalTake` |
| [negative-missing-empty](frontier/cfg/negative-missing-empty.cfg) | negative | 违反 `HistoryCoverage` |
| [negative-cursor-first](frontier/cfg/negative-cursor-first.cfg) | negative | 违反 `CursorSound` |
| [negative-half-batch](frontier/cfg/negative-half-batch.cfg) | negative | 违反 `WholeReleaseBatch` |
| [negative-scan-old](frontier/cfg/negative-scan-old.cfg) | negative | 违反 `RelevantReads` |
| [negative-successor](frontier/cfg/negative-successor.cfg) | negative | 违反 `AtMostOneTake` |
| [witness-cancel](frontier/cfg/witness-cancel.cfg) | witness | 违反 `NoCancelWindowWitness` |
| [witness-independent](frontier/cfg/witness-independent.cfg) | witness | 违反 `NoIndependentWinner` |
| [witness-shrink](frontier/cfg/witness-shrink.cfg) | witness | 违反 `NoShrinkWitness` |
| [witness-recovery](frontier/cfg/witness-recovery.cfg) | witness | 违反 `NoRecoveryWitness` |
| [witness-custody](frontier/cfg/witness-custody.cfg) | witness | 违反 `NoPostCancelCustodyWitness` |
| [witness-plain-cancel](frontier/cfg/witness-plain-cancel.cfg) | witness | 违反 `NoPlainCancelWitness` |
| [witness-active-freeze](frontier/cfg/witness-active-freeze.cfg) | witness | 违反 `NoActiveFreezeWitness` |
| [witness-accept-race](frontier/cfg/witness-accept-race.cfg) | witness | 违反 `NoAcceptRaceWitness` |
| [witness-two-runs](frontier/cfg/witness-two-runs.cfg) | witness | 违反 `NoTwoRunsWitness` |
| [witness-event-counts](frontier/cfg/witness-event-counts.cfg) | witness | 违反 `NoEventCountWitness` |
| [negative-drop-captured](frontier/cfg/negative-drop-captured.cfg) | negative | 违反 `CapturedPrefixRetained` |
| [positive-successor-broad](frontier/cfg/positive-successor-broad.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |
| [positive-race-broad](frontier/cfg/positive-race-broad.cfg) | safety | 完整搜索：`TypeOK`, `NoFalseRelease`, `AtMostOneTake`, `ExactBatch`, `TerminalStable`, `CancelWindow`, `NoPostTerminalTake`, `WholeReleaseBatch`, `CursorSound`, `HistoryCoverage`, `RelevantReads`, `TenantSeparation`, `HeadCursorSeparate`, `UnknownSound`, `SuccessorUnaffected`, `CapturedPrefixRetained` |

## pm02

| 配置 | 用途 | 精确目标 |
| --- | --- | --- |
| [positive-pm02-single](pm02/cfg/positive-pm02-single.cfg) | positive | 完整搜索：`TypeOK`, `AtomicRejection`, `FirstOnlyRejected`, `RemainingExact`, `ReleaseAtMostOnce`, `OriginalRejectedPreserved`, `AnswerSound` |
| [positive-pm02-frozen](pm02/cfg/positive-pm02-frozen.cfg) | positive | 完整搜索：`TypeOK`, `AtomicRejection`, `FirstOnlyRejected`, `RemainingExact`, `ReleaseAtMostOnce`, `OriginalRejectedPreserved`, `AnswerSound` |
| [positive-pm02-open](pm02/cfg/positive-pm02-open.cfg) | positive | 完整搜索：`TypeOK`, `AtomicRejection`, `FirstOnlyRejected`, `RemainingExact`, `ReleaseAtMostOnce`, `OriginalRejectedPreserved`, `AnswerSound` |
| [positive-pm02-race](pm02/cfg/positive-pm02-race.cfg) | positive | 完整搜索：`TypeOK`, `AtomicRejection`, `FirstOnlyRejected`, `RemainingExact`, `ReleaseAtMostOnce`, `OriginalRejectedPreserved`, `AnswerSound` |
| [positive-pm02-open-accept](pm02/cfg/positive-pm02-open-accept.cfg) | positive | 完整搜索：`TypeOK`, `AtomicRejection`, `FirstOnlyRejected`, `RemainingExact`, `ReleaseAtMostOnce`, `OriginalRejectedPreserved`, `AnswerSound` |
| [positive-pm02-frozen-accept](pm02/cfg/positive-pm02-frozen-accept.cfg) | positive | 完整搜索：`TypeOK`, `AtomicRejection`, `FirstOnlyRejected`, `RemainingExact`, `ReleaseAtMostOnce`, `OriginalRejectedPreserved`, `AnswerSound` |
| [negative-pm02-half-batch](pm02/cfg/negative-pm02-half-batch.cfg) | negative | 违反 `AtomicRejection` |
| [negative-pm02-first-se38](pm02/cfg/negative-pm02-first-se38.cfg) | negative | 违反 `FirstOnlyRejected` |
| [negative-pm02-wrong-remaining](pm02/cfg/negative-pm02-wrong-remaining.cfg) | negative | 违反 `RemainingExact` |
| [negative-pm02-replay-release](pm02/cfg/negative-pm02-replay-release.cfg) | negative | 违反 `ReleaseAtMostOnce` |
| [negative-pm02-rejected-as-taken](pm02/cfg/negative-pm02-rejected-as-taken.cfg) | negative | 违反 `FirstOnlyRejected` |
| [negative-pm02-open-release](pm02/cfg/negative-pm02-open-release.cfg) | negative | 违反 `RemainingExact` |
| [negative-pm02-stale-root](pm02/cfg/negative-pm02-stale-root.cfg) | negative | 违反 `RemainingExact` |
| [negative-pm02-frozen-stale-root](pm02/cfg/negative-pm02-frozen-stale-root.cfg) | negative | 违反 `RemainingExact` |
| [witness-pm02-frozen-accept-race](pm02/cfg/witness-pm02-frozen-accept-race.cfg) | witness | 违反 `NoFrozenAcceptRaceWitness` |
| [witness-pm02-recovery](pm02/cfg/witness-pm02-recovery.cfg) | witness | 违反 `NoRecoveryWitness` |
| [witness-pm02-open](pm02/cfg/witness-pm02-open.cfg) | witness | 违反 `NoOpenWitness` |
| [witness-pm02-frozen](pm02/cfg/witness-pm02-frozen.cfg) | witness | 违反 `NoFrozenWitness` |
| [witness-pm02-race](pm02/cfg/witness-pm02-race.cfg) | witness | 违反 `NoRaceWitness` |

## gap-isolation

| 配置 | 用途 | 精确目标 |
| --- | --- | --- |
| [positive-gap](gap-isolation/cfg/positive-gap.cfg) | positive | 完整搜索：`TypeOK`, `SessionIsolation`, `OldPreparedIsolated`, `NewInterpreterIsolated`, `NewCommandIsolated`, `GapPreserved`, `RepairRetained`, `PrefixAtomic`, `CustodySeparate`, `QuerySound` |
| [positive-gap-no-custody-authority](gap-isolation/cfg/positive-gap-no-custody-authority.cfg) | positive | 完整搜索：`TypeOK`, `SessionIsolation`, `OldPreparedIsolated`, `NewInterpreterIsolated`, `NewCommandIsolated`, `GapPreserved`, `RepairRetained`, `PrefixAtomic`, `CustodySeparate`, `QuerySound` |
| [negative-gap-old-publish](gap-isolation/cfg/negative-gap-old-publish.cfg) | negative | 违反 `OldPreparedIsolated` |
| [negative-gap-new-normal](gap-isolation/cfg/negative-gap-new-normal.cfg) | negative | 违反 `NewInterpreterIsolated` |
| [negative-gap-new-command](gap-isolation/cfg/negative-gap-new-command.cfg) | negative | 违反 `NewCommandIsolated` |
| [witness-gap-stale](gap-isolation/cfg/witness-gap-stale.cfg) | witness | 违反 `NoStaleWitness` |
| [witness-gap-both-stale](gap-isolation/cfg/witness-gap-both-stale.cfg) | witness | 违反 `NoBothStaleWitness` |
| [witness-gap-new-actors](gap-isolation/cfg/witness-gap-new-actors.cfg) | witness | 违反 `NoNewActorWitness` |
| [witness-gap-custody](gap-isolation/cfg/witness-gap-custody.cfg) | witness | 违反 `NoCustodyWitness` |
| [witness-gap-prior-commit](gap-isolation/cfg/witness-gap-prior-commit.cfg) | witness | 违反 `NoPriorCommitWitness` |

## frozen-active

| 配置 | 用途 | 精确目标 |
| --- | --- | --- |
| [positive-core](frozen-active/cfg/positive-core.cfg) | positive | 完整搜索：`TypeOK`, `OriginalDirectory`, `NoFalseRelease`, `HistoryCoverage`, `WholeReleaseBatch`, `ReleaseAtMostOnce`, `CapturedPrefixRetained`, `CursorSound`, `ExactBatch`, `NoPostTerminalTake`, `EndedLast`, `CancelWindow`, `TerminalStable` |
| [positive-pending](frozen-active/cfg/positive-pending.cfg) | positive | 完整搜索：`TypeOK`, `OriginalDirectory`, `NoFalseRelease`, `HistoryCoverage`, `WholeReleaseBatch`, `ReleaseAtMostOnce`, `CapturedPrefixRetained`, `CursorSound`, `ExactBatch`, `NoPostTerminalTake`, `EndedLast`, `CancelWindow`, `TerminalStable` |
| [positive-normal-ended](frozen-active/cfg/positive-normal-ended.cfg) | positive | 完整搜索：`TypeOK`, `OriginalDirectory`, `NoFalseRelease`, `HistoryCoverage`, `WholeReleaseBatch`, `ReleaseAtMostOnce`, `CapturedPrefixRetained`, `CursorSound`, `ExactBatch`, `NoPostTerminalTake`, `EndedLast`, `CancelWindow`, `TerminalStable` |
| [negative-old-root](frozen-active/cfg/negative-old-root.cfg) | negative | 违反 `HistoryCoverage` |
| [negative-old-coverage-taken](frozen-active/cfg/negative-old-coverage-taken.cfg) | negative | 违反 `NoFalseRelease` |
| [negative-old-coverage-history](frozen-active/cfg/negative-old-coverage-history.cfg) | negative | 违反 `HistoryCoverage` |
| [negative-drop-tail](frozen-active/cfg/negative-drop-tail.cfg) | negative | 违反 `CapturedPrefixRetained` |
| [negative-half-release](frozen-active/cfg/negative-half-release.cfg) | negative | 违反 `WholeReleaseBatch` |
| [negative-postterminal-take](frozen-active/cfg/negative-postterminal-take.cfg) | negative | 违反 `NoPostTerminalTake` |
| [witness-new-taken](frozen-active/cfg/witness-new-taken.cfg) | witness | 违反 `NoTakenWitness` |
| [witness-new-pending](frozen-active/cfg/witness-new-pending.cfg) | witness | 违反 `NoPendingWitness` |
| [witness-final-agent-wins](frozen-active/cfg/witness-final-agent-wins.cfg) | witness | 违反 `NoFinalAgentWinner` |
| [witness-final-session-wins](frozen-active/cfg/witness-final-session-wins.cfg) | witness | 违反 `NoFinalSessionWinner` |
| [witness-normal-ended-wins](frozen-active/cfg/witness-normal-ended-wins.cfg) | witness | 违反 `NoNormalWinner` |
| [witness-cancel-before-ended](frozen-active/cfg/witness-cancel-before-ended.cfg) | witness | 违反 `NoCancelBeforeEnded` |
| [sensitivity-old-guard-taken](frozen-active/cfg/sensitivity-old-guard-taken.cfg) | sensitivity | 完整搜索：`NoTakenWitness` |
| [sensitivity-old-guard-pending](frozen-active/cfg/sensitivity-old-guard-pending.cfg) | sensitivity | 完整搜索：`NoPendingWitness` |
