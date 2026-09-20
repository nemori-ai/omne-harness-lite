------------------------- MODULE HookContinuation --------------------------
EXTENDS Naturals, FiniteSets, TLC

(***************************************************************************)
(* HK-16 finite abstraction.  Two handler triggers race on two workers.     *)
(* In the positive protocol takeTrigger, slot occupation and Run creation   *)
(* are one action.  The split_slot mutation exposes the stale check race.   *)
(***************************************************************************)

CONSTANT Triggers, Workers, Cap, Mutation
ASSUME /\ Cardinality(Triggers) = 2
       /\ Cardinality(Workers) = 2
       /\ Cap = 1
       /\ Mutation \in {"none", "split_slot"}

VARIABLES triggerState, checked, runStarts, consecutive,
          dedupSeen, hookCompletion, disposition, configRevision,
          generation, normalRunStarts

vars == <<triggerState, checked, runStarts, consecutive,
          dedupSeen, hookCompletion, disposition, configRevision,
          generation, normalRunStarts>>

Init ==
  /\ triggerState = [t \in Triggers |-> "absent"]
  /\ checked = [t \in Triggers |-> FALSE]
  /\ runStarts = [t \in Triggers |-> 0]
  /\ consecutive = 0
  /\ dedupSeen = {}
  /\ hookCompletion = [t \in Triggers |-> 0]
  /\ disposition = [t \in Triggers |-> "none"]
  /\ configRevision = [t \in Triggers |-> "r1"]
  /\ generation = "active"
  /\ normalRunStarts = 0

Notify(t) ==
  /\ triggerState[t] = "absent"
  /\ t \notin dedupSeen
  /\ triggerState' = [triggerState EXCEPT ![t] = "queued"]
  /\ dedupSeen' = dedupSeen \cup {t}
  /\ hookCompletion' = [hookCompletion EXCEPT ![t] = @ + 1]
  /\ UNCHANGED <<checked, runStarts, consecutive, disposition,
                  configRevision, generation, normalRunStarts>>

Replay(t) ==
  /\ t \in dedupSeen
  /\ UNCHANGED vars

AtomicTakeStart(t, w) ==
  /\ Mutation = "none"
  /\ w \in Workers
  /\ triggerState[t] = "queued"
  /\ generation = "active"
  /\ configRevision[t] = "r1"
  /\ consecutive < Cap
  /\ triggerState' = [triggerState EXCEPT ![t] = "started"]
  /\ runStarts' = [runStarts EXCEPT ![t] = @ + 1]
  /\ consecutive' = consecutive + 1
  /\ UNCHANGED <<checked, dedupSeen, hookCompletion, disposition,
                  configRevision, generation, normalRunStarts>>

CheckSlot(t, w) ==
  /\ Mutation = "split_slot"
  /\ w \in Workers
  /\ triggerState[t] = "queued"
  /\ ~checked[t]
  /\ generation = "active"
  /\ consecutive < Cap
  /\ checked' = [checked EXCEPT ![t] = TRUE]
  /\ UNCHANGED <<triggerState, runStarts, consecutive, dedupSeen,
                  hookCompletion, disposition, configRevision,
                  generation, normalRunStarts>>

StartAfterCheck(t) ==
  /\ Mutation = "split_slot"
  /\ triggerState[t] = "queued"
  /\ checked[t]
  /\ triggerState' = [triggerState EXCEPT ![t] = "started"]
  /\ runStarts' = [runStarts EXCEPT ![t] = @ + 1]
  /\ consecutive' = consecutive + 1
  /\ UNCHANGED <<checked, dedupSeen, hookCompletion, disposition,
                  configRevision, generation, normalRunStarts>>

CloseInvalid(t) ==
  /\ triggerState[t] = "queued"
  /\ (generation = "retired" \/ consecutive >= Cap)
  /\ triggerState' = [triggerState EXCEPT ![t] = "closed"]
  /\ disposition' = [disposition EXCEPT ![t] = "source_invalid"]
  /\ UNCHANGED <<checked, runStarts, consecutive, dedupSeen,
                  hookCompletion, configRevision, generation,
                  normalRunStarts>>

CrashBeforeStart(t) ==
  /\ checked[t]
  /\ triggerState[t] = "queued"
  /\ checked' = [checked EXCEPT ![t] = FALSE]
  /\ UNCHANGED <<triggerState, runStarts, consecutive, dedupSeen,
                  hookCompletion, disposition, configRevision,
                  generation, normalRunStarts>>

StartNormalRun ==
  /\ normalRunStarts = 0
  /\ consecutive > 0
  /\ normalRunStarts' = 1
  /\ consecutive' = 0
  /\ UNCHANGED <<triggerState, checked, runStarts, dedupSeen,
                  hookCompletion, disposition, configRevision, generation>>

Retire ==
  /\ generation = "active"
  /\ generation' = "retired"
  /\ UNCHANGED <<triggerState, checked, runStarts, consecutive,
                  dedupSeen, hookCompletion, disposition, configRevision,
                  normalRunStarts>>

Next ==
  \/ \E t \in Triggers : Notify(t) \/ Replay(t) \/ CloseInvalid(t) \/ CrashBeforeStart(t)
  \/ \E t \in Triggers, w \in Workers : AtomicTakeStart(t, w) \/ CheckSlot(t, w)
  \/ \E t \in Triggers : StartAfterCheck(t)
  \/ StartNormalRun
  \/ Retire

Spec == Init /\ [][Next]_vars

NotifyAny == \E t \in Triggers : Notify(t)
SettleAny ==
  \/ \E t \in Triggers, w \in Workers : AtomicTakeStart(t, w)
  \/ \E t \in Triggers : CloseInvalid(t)
SpecFair == Spec /\ WF_vars(NotifyAny) /\ WF_vars(SettleAny)
EventuallySomeContinuationSettles ==
  <>(\E t \in Triggers : triggerState[t] \in {"started", "closed"})

TypeOK ==
  /\ triggerState \in [Triggers -> {"absent", "queued", "started", "closed"}]
  /\ checked \in [Triggers -> BOOLEAN]
  /\ runStarts \in [Triggers -> Nat]
  /\ consecutive \in Nat
  /\ dedupSeen \subseteq Triggers
  /\ hookCompletion \in [Triggers -> 0..1]
  /\ disposition \in [Triggers -> {"none", "source_invalid"}]
  /\ configRevision \in [Triggers -> {"r1"}]
  /\ generation \in {"active", "retired"}
  /\ normalRunStarts \in 0..1

ContinuationStartsWithinCap == consecutive <= Cap
ReplayDoesNotDuplicateStart == \A t \in Triggers : runStarts[t] <= 1
StartImpliesAtomicSlot ==
  \A t \in Triggers : triggerState[t] = "started" => runStarts[t] = 1
ExactlyOneCompletionPerHookRun ==
  \A t \in Triggers :
    /\ hookCompletion[t] <= 1
    /\ (triggerState[t] # "absent") => hookCompletion[t] = 1
DispositionDoesNotRewriteCompletion ==
  \A t \in Triggers : disposition[t] = "source_invalid" => hookCompletion[t] = 1
RetiredGenerationCannotStart == generation = "retired" => \A t \in Triggers : triggerState[t] # "started"

BothQueued == Cardinality({t \in Triggers : triggerState[t] = "queued"}) = 2
SomeStarted == \E t \in Triggers : triggerState[t] = "started"
SomeClosed == \E t \in Triggers : triggerState[t] = "closed"
NormalResetReached == normalRunStarts = 1 /\ consecutive = 0
=============================================================================
