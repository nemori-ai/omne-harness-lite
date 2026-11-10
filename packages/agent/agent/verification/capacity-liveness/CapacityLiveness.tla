---------------------------- MODULE CapacityLiveness ----------------------------
(***************************************************************************)
(* Number-free liveness of concurrent Runs over bounded resources.        *)
(*                                                                         *)
(* Each Run of one tenant does three steps: save (needs a Journal store    *)
(* slot), call (needs a Model capacity slot), save again, then completes.  *)
(* Both resources are bounded: StoreCap and ModelCap. A request that finds *)
(* its resource full is refused for now. The ought: a refusal for now is   *)
(* a dependency wait. The Run keeps its place and asks again later, so     *)
(* every Run finishes, whatever the capacities are and however many Runs   *)
(* there are. Only a request that can never succeed is a definite         *)
(* refusal: the last save of a Run in Poison never succeeds, and the       *)
(* ought ends that Run as failed. Every other Run completes.               *)
(*                                                                         *)
(* Each flag models one wrong handling; all FALSE is the ought:            *)
(*   StopOnUnavailable     the Agent stops a Run when a Journal commit     *)
(*                         answers unavailable, instead of waiting.        *)
(*   BusyAsCapacity        the Model answers "tenant share full now" with  *)
(*                         the definite `capacity`, and the Agent ends the *)
(*                         Run model-refused.                              *)
(*   DefiniteAsUnavailable the Journal adapter answers a definite storage  *)
(*                         refusal as unavailable, so the Run waits on a   *)
(*                         refusal that never changes.                     *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

\* Poison: Runs whose last save can never succeed (for example the command is over the size
\* limit). The ought is a definite refusal that ends the Run as failed.
CONSTANTS Runs, Poison, StoreCap, ModelCap, StopOnUnavailable, BusyAsCapacity, DefiniteAsUnavailable

ASSUME Poison \subseteq Runs
ASSUME StoreCap \in Nat \ {0} /\ ModelCap \in Nat \ {0}
ASSUME StopOnUnavailable \in BOOLEAN /\ BusyAsCapacity \in BOOLEAN /\ DefiniteAsUnavailable \in BOOLEAN

Next(p) == CASE p = "save1" -> "call"
             [] p = "call"  -> "save2"
             [] p = "save2" -> "completed"
Needs(p) == IF p = "call" THEN "model" ELSE "store"
Cap(res) == IF res = "model" THEN ModelCap ELSE StoreCap

VARIABLES pc, held, waiting
vars == <<pc, held, waiting>>

InUse(res) == Cardinality({r \in Runs : held[r] = res})
Active(r) == pc[r] \in {"save1", "call", "save2"}

TypeOK ==
  /\ pc \in [Runs -> {"save1", "call", "save2", "completed", "failed", "stopped", "refused"}]
  /\ held \in [Runs -> {"none", "store", "model"}]
  /\ waiting \in [Runs -> BOOLEAN]

Init ==
  /\ pc = [r \in Runs |-> "save1"]
  /\ held = [r \in Runs |-> "none"]
  /\ waiting = [r \in Runs |-> FALSE]

Doomed(r) == r \in Poison /\ pc[r] = "save2"

\* The resource has room: the Run takes a slot. A doomed save never gets one.
Acquire(r) ==
  /\ Active(r) /\ held[r] = "none" /\ ~Doomed(r)
  /\ InUse(Needs(pc[r])) < Cap(Needs(pc[r]))
  /\ held' = [held EXCEPT ![r] = Needs(pc[r])]
  /\ waiting' = [waiting EXCEPT ![r] = FALSE]
  /\ UNCHANGED pc

\* The resource is full now. The ought is a dependency wait; the flags give the wrong answers.
Refuse(r) ==
  /\ Active(r) /\ held[r] = "none" /\ ~waiting[r] /\ ~Doomed(r)
  /\ InUse(Needs(pc[r])) >= Cap(Needs(pc[r]))
  /\ IF Needs(pc[r]) = "store" /\ StopOnUnavailable
       THEN pc' = [pc EXCEPT ![r] = "stopped"] /\ UNCHANGED waiting
     ELSE IF Needs(pc[r]) = "model" /\ BusyAsCapacity
       THEN pc' = [pc EXCEPT ![r] = "refused"] /\ UNCHANGED waiting
     ELSE waiting' = [waiting EXCEPT ![r] = TRUE] /\ UNCHANGED pc
  /\ UNCHANGED held

\* A save that can never succeed. Ought: a definite refusal ends the Run as failed.
DefiniteRefuse(r) ==
  /\ Doomed(r) /\ held[r] = "none" /\ ~waiting[r]
  /\ IF DefiniteAsUnavailable
       THEN waiting' = [waiting EXCEPT ![r] = TRUE] /\ UNCHANGED pc
     ELSE pc' = [pc EXCEPT ![r] = "failed"] /\ UNCHANGED waiting
  /\ UNCHANGED held

\* The step finishes and gives its slot back.
Release(r) ==
  /\ held[r] /= "none"
  /\ pc' = [pc EXCEPT ![r] = Next(pc[r])]
  /\ held' = [held EXCEPT ![r] = "none"]
  /\ UNCHANGED waiting

\* All Runs are finished, or the only ones left wait on a refusal that will never change.
Quiet == \A r \in Runs : ~Active(r) \/ (Doomed(r) /\ waiting[r])

Nxt ==
  \/ \E r \in Runs : Acquire(r) \/ Refuse(r) \/ DefiniteRefuse(r) \/ Release(r)
  \/ (Quiet /\ UNCHANGED vars)

Spec == Init /\ [][Nxt]_vars
        /\ \A r \in Runs : WF_vars(Acquire(r)) /\ WF_vars(Release(r)) /\ WF_vars(DefiniteRefuse(r))

\* Safety: a resource never holds more than its capacity.
WithinCapacity == InUse("store") <= StoreCap /\ InUse("model") <= ModelCap
\* Safety: a refusal for now never stops a Run and never ends it as refused.
NeverStopped == \A r \in Runs : pc[r] /= "stopped"
NeverRefused == \A r \in Runs : pc[r] /= "refused"
\* Safety: a Run never waits on a refusal that can never change, and only such a Run fails.
NeverWaitsOnDefinite == \A r \in Runs : ~(Doomed(r) /\ waiting[r])
OnlyDoomedFail == \A r \in Runs : pc[r] = "failed" => r \in Poison
\* Liveness: every Run finishes, for any capacity and any number of Runs: a Run that can
\* succeed completes, a Run that cannot ends as failed.
AllComplete ==
  /\ \A r \in Runs \ Poison : <>(pc[r] = "completed")
  /\ \A r \in Poison : <>(pc[r] = "failed")
=============================================================================
