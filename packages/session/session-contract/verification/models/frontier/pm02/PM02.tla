------------------------------ MODULE PM02 ------------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANTS N, FreezeMode, DynamicInput, Bug
Inputs == 1..N
Workers == {1,2}
InitialInputs == IF DynamicInput THEN Inputs \ {N} ELSE Inputs
EmptyPrep == [stage |-> "idle", root |-> 0, pending |-> {}, frozen |-> FALSE]
VARIABLES s, prep
vars == <<s, prep>>

Init ==
  /\ s = [root |-> 0, accepted |-> InitialInputs, pending |-> InitialInputs,
           frozen |-> FreezeMode="frozen", run |-> "active",
           original |-> "absent", rejectKnown |-> FALSE, invokeCount |-> 0,
           originalLost |-> FALSE, originalQueried |-> FALSE,
           executionCreated |-> FALSE, taken |-> {},
           se35 |-> 0, terminalCount |-> 0, release |-> [i \in Inputs |-> 0],
           truth |-> FALSE, known |-> FALSE, published |-> 0,
           failedBefore |-> FALSE, lostReply |-> FALSE, unknownObserved |-> FALSE,
           queryCount |-> 0, replayCount |-> 0, rebased |-> FALSE,
           beforePending |-> {}, beforeFrozen |-> FALSE,
           acceptedAfterPrepare |-> FALSE, freezeAfterReject |-> FALSE,
           racePhase |-> [w \in Workers |-> 0]]
  /\ prep = [w \in Workers |-> EmptyPrep]

(* One original invoke identity. Its rejected answer does not create an execution. *)
InvokeReject ==
  /\ s.original="absent"
  /\ \E lost \in BOOLEAN :
      s' = [s EXCEPT !.original="invalid", !.invokeCount=1,
             !.rejectKnown=~lost, !.originalLost=lost]
  /\ UNCHANGED prep
QueryOriginal ==
  /\ s.original="invalid" /\ ~s.rejectKnown
  /\ s'=[s EXCEPT !.rejectKnown=TRUE, !.originalQueried=TRUE]
  /\ UNCHANGED prep

Accept ==
  /\ DynamicInput /\ s.run="active"
  /\ \E i \in Inputs \ s.accepted :
      s'=[s EXCEPT !.root=@+1, !.accepted=@ \cup {i}, !.pending=@ \cup {i},
            !.acceptedAfterPrepare=@ \/ (\E w \in Workers : prep[w].stage="ready"),
            !.racePhase=[w \in Workers |->
              IF s.racePhase[w]=1 /\ s.frozen /\ prep[w].stage="ready"
                 /\ prep[w].frozen /\ i \notin prep[w].pending
              THEN 2 ELSE s.racePhase[w]]]
  /\ UNCHANGED prep
Freeze ==
  /\ FreezeMode="race" /\ ~s.frozen /\ s.run="active"
  /\ s'=[s EXCEPT !.root=@+1, !.frozen=TRUE, !.freezeAfterReject=s.rejectKnown]
  /\ UNCHANGED prep

Prepare(w) ==
  /\ prep[w].stage="idle" /\ s.rejectKnown /\ ~s.truth /\ s.run="active"
  /\ prep'=[prep EXCEPT ![w]=[stage |-> "ready", root |-> s.root,
                              pending |-> s.pending, frozen |-> s.frozen]]
  /\ s'=[s EXCEPT !.racePhase[w]=
      IF @=0 /\ s.freezeAfterReject /\ s.frozen THEN 1
      ELSE IF @=3 THEN 4 ELSE @]
FailBefore(w) ==
  /\ prep[w].stage="ready" /\ ~s.truth /\ ~s.failedBefore
  /\ s'=[s EXCEPT !.failedBefore=TRUE]
  /\ prep'=[prep EXCEPT ![w]=EmptyPrep]
Conflict(w) ==
  /\ prep[w].stage="ready" /\ ~s.truth /\ prep[w].root#s.root
  /\ s'=[s EXCEPT !.rebased=TRUE, !.racePhase[w]=
      IF @=2 /\ s.frozen /\ prep[w].frozen
         /\ N \in s.pending \ prep[w].pending
      THEN 3 ELSE @]
  /\ prep'=[prep EXCEPT ![w]=EmptyPrep]

PlannedRelease(w) ==
  IF prep[w].frozen
  THEN CASE Bug="first-se38" -> prep[w].pending
         [] Bug="wrong-remaining" -> {}
         [] OTHER -> prep[w].pending \ {1}
  ELSE IF Bug="unfrozen-release" THEN prep[w].pending \ {1} ELSE {}

Publish(w) ==
  /\ prep[w].stage="ready" /\ s.rejectKnown /\ ~s.truth /\ s.run="active"
  /\ (prep[w].root=s.root \/ Bug="no-root")
  /\ \E lost \in BOOLEAN :
      LET remaining == PlannedRelease(w) IN
      s' = IF Bug="half-batch"
           THEN [s EXCEPT !.root=@+1, !.se35=1, !.pending=@ \ {1}]
           ELSE [s EXCEPT !.root=@+1, !.se35=1, !.terminalCount=1,
                  !.pending=@ \ ({1} \cup remaining), !.run="failed",
                  !.release=[i \in Inputs |-> IF i \in remaining THEN 1 ELSE 0],
                  !.truth=TRUE, !.known=~lost, !.lostReply=lost, !.published=1,
                  !.beforePending=s.pending, !.beforeFrozen=s.frozen,
                  !.racePhase[w]=IF @=4 THEN 5 ELSE @,
                  !.taken=IF Bug="rejected-as-taken" THEN {1} ELSE @]
  /\ prep'=[prep EXCEPT ![w].stage="done"]

(* A lookup can remain unknown. It cannot manufacture not-committed or effects. *)
QueryStillUnknown ==
  /\ s.truth /\ ~s.known /\ ~s.unknownObserved
  /\ s'=[s EXCEPT !.unknownObserved=TRUE]
  /\ UNCHANGED prep
QueryCommitted ==
  /\ s.truth /\ s.queryCount<2
  /\ s'=[s EXCEPT !.known=TRUE, !.queryCount=@+1]
  /\ UNCHANGED prep
ReplayOriginal ==
  /\ s.truth /\ s.known /\ s.replayCount<2
  /\ s' = IF Bug="replay-release"
           THEN [s EXCEPT !.root=@+1, !.se35=@+1, !.terminalCount=@+1,
                   !.release=[i \in Inputs |-> IF s.release[i]>0 THEN s.release[i]+1 ELSE 0],
                   !.replayCount=@+1]
           ELSE [s EXCEPT !.replayCount=@+1]
  /\ UNCHANGED prep

Next == InvokeReject \/ QueryOriginal \/ Accept \/ Freeze
     \/ (\E w \in Workers : Prepare(w) \/ FailBefore(w) \/ Conflict(w) \/ Publish(w))
     \/ QueryStillUnknown \/ QueryCommitted \/ ReplayOriginal

TypeOK == /\ s.pending \subseteq Inputs /\ s.accepted \subseteq Inputs
          /\ s.run \in {"active","failed"} /\ s.root \in Nat
          /\ \A i \in Inputs : s.release[i] \in 0..3
AtomicRejection ==
  (s.se35>0 \/ s.terminalCount>0 \/ s.truth) =>
  /\ s.se35=1 /\ s.terminalCount=1 /\ s.truth /\ s.run="failed"
  /\ 1 \notin s.pending /\ s.published=1
FirstOnlyRejected == s.release[1]=0 /\ s.taken={}
RemainingExact ==
  s.truth =>
  /\ {i \in Inputs : s.release[i]>0} =
      (IF s.beforeFrozen THEN s.beforePending \ {1} ELSE {})
  /\ s.pending = (IF s.beforeFrozen THEN {} ELSE s.beforePending \ {1})
ReleaseAtMostOnce ==
  s.se35<=1 /\ s.terminalCount<=1 /\ (\A i \in Inputs : s.release[i]<=1)
OriginalRejectedPreserved ==
  /\ ~s.executionCreated /\ s.invokeCount<=1
  /\ (s.rejectKnown \/ s.truth => s.original="invalid")
AnswerSound == s.known => s.truth
NoRecoveryWitness ==
  ~(s.truth /\ s.failedBefore /\ s.lostReply /\ s.unknownObserved
    /\ s.known /\ s.queryCount=2 /\ s.replayCount=2 /\ s.originalLost /\ s.originalQueried)
NoOpenWitness == ~(s.truth /\ ~s.frozen /\ s.pending=Inputs \ {1} /\ N>1)
NoFrozenWitness == ~(s.truth /\ s.frozen /\ s.pending={} /\ N>1)
NoRaceWitness == ~(s.truth /\ s.beforeFrozen /\ s.accepted=Inputs
                   /\ s.acceptedAfterPrepare /\ s.rebased)
(* Passive phases record one worker: frozen preparation, new acceptance,
   stale publish rejection, fresh preparation, and successful publication.
   No business action reads these phases in its enabling conditions. *)
NoFrozenAcceptRaceWitness ==
  ~(s.truth /\ s.freezeAfterReject /\ (\E w \in Workers : s.racePhase[w]=5)
    /\ s.beforeFrozen /\ N \in s.beforePending /\ s.accepted=Inputs
    /\ s.pending={} /\ s.release[N]=1 /\ s.release[1]=0
    /\ s.se35=1 /\ s.terminalCount=1 /\ s.published=1 /\ s.taken={})
Spec == Init /\ [][Next]_vars
=============================================================================
