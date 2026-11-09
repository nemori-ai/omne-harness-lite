------------------------------ MODULE RetentionScope ------------------------------
(***************************************************************************)
(* The lifecycle of one retention scope of the tool host adapter           *)
(* (tool-host-local SPEC, 环境准备的租户调度: the three states 开放 /      *)
(* 已关闭 / 已释放, the record lifecycle table, and the two cross-domain  *)
(* assertions) together with the stop answers of the execution-environment *)
(* contract (停止, items 1-8).                                              *)
(*                                                                         *)
(* Durable state lives in two kinds of ledger domains that share no        *)
(* revision order: the scope domain (one record `scope`, the end facts     *)
(* `ended/<key>`) and one acquisition domain per call. Every actor works   *)
(* in two steps: a read that captures the revisions it saw, and a commit   *)
(* that the ledger accepts only when the asserted revisions are unchanged. *)
(* A commit can be lost (the store answers unavailable); the actor's own   *)
(* rule decides whether it reads again. A restart drops every view and     *)
(* keeps every durable domain.                                             *)
(*                                                                         *)
(* The four Boolean constants switch one rule of the specification off     *)
(* each; the positive configurations keep all of them FALSE.               *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Calls,          \* the acquisitions (calls) that share the scope
  Resources,      \* the retained resources (process or terminal keys)
  Nil,            \* "no view", "no creator"
  MaxLost,        \* how many commits the store may lose in one behaviour
  MaxRestarts,    \* how many restarts (views lost) one behaviour may contain
  DeleteMarkerOnRelease,              \* negative: release deletes the record instead of keeping the marker
  DropOnlyOnAcquisitionClose,         \* negative: scope close keeps the reservations nobody took over
  AcquisitionWriteWithoutScopeAssert, \* negative: the acquisition's close does not assert the scope revision
  ForgetEndFact                       \* negative: a confirmed stop removes the entry without an end fact

ASSUME /\ Calls # {} /\ Resources # {} /\ Nil \notin Calls
       /\ MaxLost \in Nat /\ MaxRestarts \in Nat
       /\ DeleteMarkerOnRelease \in BOOLEAN /\ DropOnlyOnAcquisitionClose \in BOOLEAN
       /\ AcquisitionWriteWithoutScopeAssert \in BOOLEAN /\ ForgetEndFact \in BOOLEAN

VARIABLES
  (* the scope domain, durable *)
  scopeRev,     \* revision of the scope domain
  scopeState,   \* "none" (no record), "open", "closed", "released" (the closed marker)
  entries,      \* resource -> "none" | "reserved" | "permitted" | "adopted"
  creator,      \* resource -> the call whose acquisition reserved it, Nil before the first reservation
  ended,        \* the set of resources with an end fact `ended/<key>`
  (* the acquisition domains, durable *)
  acqRev,       \* call -> revision of its acquisition domain
  acqClosed,    \* call -> whether the acquisition is closed
  (* the physical side *)
  drained,      \* resources stopped under their creator acquisition's own name
  (* views, lost on restart *)
  planView, takeView, stopView, closeView, acqView,
  dropTried,    \* call -> whether its one early drop of untaken reservations has been attempted
  (* bounds *)
  lost, restarts,
  (* history, read by no actor *)
  everClosed,       \* the scope has been closed at least once
  reopened,         \* a plan, permit or adopt was written after the scope had been closed
  stoppedProcesses, \* adopted processes whose stop was confirmed in the current life of the scope
  adoptCommits      \* resource -> number of adopt commits written

vars == <<scopeRev, scopeState, entries, creator, ended, acqRev, acqClosed, drained,
          planView, takeView, stopView, closeView, acqView, dropTried, lost, restarts,
          everClosed, reopened, stoppedProcesses, adoptCommits>>
durable == <<scopeRev, scopeState, entries, creator, ended, acqRev, acqClosed, drained>>
views   == <<planView, takeView, stopView, closeView, acqView, dropTried>>
history == <<everClosed, reopened, stoppedProcesses, adoptCommits>>

Owned == {"permitted", "adopted"}
Taken(r) == entries[r] \in Owned
OwnedSet == {r \in Resources : Taken(r)}
Exists == scopeState \in {"open", "closed"}

NoPlanView == [r \in Resources |-> Nil]

TypeOK ==
  /\ scopeRev \in Nat
  /\ scopeState \in {"none", "open", "closed", "released"}
  /\ entries \in [Resources -> {"none", "reserved", "permitted", "adopted"}]
  /\ creator \in [Resources -> Calls \cup {Nil}]
  /\ ended \subseteq Resources
  /\ acqRev \in [Calls -> Nat]
  /\ acqClosed \in [Calls -> BOOLEAN]
  /\ drained \subseteq Resources
  /\ planView \in [Resources -> {Nil} \cup [scope : Nat, call : Calls]]
  /\ takeView \in [Resources -> {Nil} \cup [scope : Nat, acq : Nat]]
  /\ stopView \in [Resources -> {Nil} \cup Nat]
  /\ closeView \in {Nil} \cup Nat
  /\ acqView \in [Calls -> {Nil} \cup [scope : Nat, taken : SUBSET Resources]]
  /\ dropTried \in [Calls -> BOOLEAN]
  /\ lost \in 0..MaxLost /\ restarts \in 0..MaxRestarts
  /\ everClosed \in BOOLEAN /\ reopened \in BOOLEAN
  /\ stoppedProcesses \subseteq Resources
  /\ adoptCommits \in [Resources -> Nat]

Init ==
  /\ scopeRev = 0 /\ scopeState = "none"
  /\ entries = [r \in Resources |-> "none"] /\ creator = [r \in Resources |-> Nil] /\ ended = {}
  /\ acqRev = [c \in Calls |-> 0] /\ acqClosed = [c \in Calls |-> FALSE]
  /\ drained = {}
  /\ planView = NoPlanView /\ takeView = NoPlanView /\ stopView = NoPlanView
  /\ closeView = Nil /\ acqView = [c \in Calls |-> Nil] /\ dropTried = [c \in Calls |-> FALSE]
  /\ lost = 0 /\ restarts = 0
  /\ everClosed = FALSE /\ reopened = FALSE /\ stoppedProcesses = {}
  /\ adoptCommits = [r \in Resources |-> 0]

(***************************************************************************)
(* One commit of the scope record at the current revision.                 *)
(* `settledRetention` of the implementation: a closed scope keeps only the *)
(* entries it took over, and a closed scope that keeps nothing is released *)
(* in the same commit, which shrinks the record to the marker and deletes  *)
(* every end fact. `newlyStopped` are the adopted processes whose stop     *)
(* this commit confirms; they are forgotten when the scope's life ends.    *)
(***************************************************************************)
Commit(nextEntries, nextEnded, nextState, newlyStopped) ==
  LET settled == IF nextState = "closed" /\ ~DropOnlyOnAcquisitionClose
                   THEN [r \in Resources |-> IF nextEntries[r] = "reserved" THEN "none" ELSE nextEntries[r]]
                   ELSE nextEntries
      remaining == {r \in Resources : settled[r] # "none"}
      releasing == nextState = "closed" /\ remaining = {}
  IN /\ scopeRev' = scopeRev + 1
     /\ IF releasing
          THEN /\ scopeState' = IF DeleteMarkerOnRelease THEN "none" ELSE "released"
               /\ entries' = [r \in Resources |-> "none"]
               /\ ended' = {}
               /\ stoppedProcesses' = {}
          ELSE /\ scopeState' = nextState
               /\ entries' = settled
               /\ ended' = nextEnded
               /\ stoppedProcesses' = stoppedProcesses \cup newlyStopped

Lose == lost < MaxLost /\ lost' = lost + 1

(***************************************************************************)
(* plan: the acquisition of call c reserves resource r in the scope.       *)
(***************************************************************************)
PlanRead(c, r) ==
  /\ ~acqClosed[c] /\ creator[r] = Nil /\ planView[r] = Nil
  /\ planView' = [planView EXCEPT ![r] = [scope |-> scopeRev, call |-> c]]
  /\ UNCHANGED <<durable, takeView, stopView, closeView, acqView, dropTried, lost, restarts, history>>

PlanCommit(r) ==
  /\ planView[r] # Nil
  /\ planView' = [planView EXCEPT ![r] = Nil]
  /\ UNCHANGED <<takeView, stopView, closeView, acqView, dropTried, restarts>>
  /\ LET v == planView[r] IN
     \/ /\ scopeRev # v.scope                              \* conflict: read again
        /\ UNCHANGED <<durable, lost, history>>
     \/ /\ scopeRev = v.scope
        /\ scopeState \in {"closed", "released"}          \* answers closed
        /\ UNCHANGED <<durable, lost, history>>
     \/ /\ scopeRev = v.scope
        /\ scopeState \in {"none", "open"}
        /\ \/ Lose /\ UNCHANGED <<durable, history>>
           \/ /\ Commit([entries EXCEPT ![r] = "reserved"], ended, "open", {})
              /\ creator' = [creator EXCEPT ![r] = v.call]
              /\ reopened' = reopened \/ everClosed
              /\ UNCHANGED <<acqRev, acqClosed, drained, lost, everClosed, adoptCommits>>

(***************************************************************************)
(* permit / adopt: the scope takes resource r over from its creator.       *)
(* The write goes to the scope domain only and asserts the creator's       *)
(* acquisition domain; the provider stops the process itself when the      *)
(* answer is closed (contract, 移交 item 3).                                *)
(***************************************************************************)
TakeRead(r) ==
  /\ creator[r] # Nil /\ entries[r] = "reserved" /\ takeView[r] = Nil
  /\ takeView' = [takeView EXCEPT ![r] = [scope |-> scopeRev, acq |-> acqRev[creator[r]]]]
  /\ UNCHANGED <<durable, planView, stopView, closeView, acqView, dropTried, lost, restarts, history>>

TakeCommit(r, kind) ==
  /\ takeView[r] # Nil /\ kind \in Owned
  /\ takeView' = [takeView EXCEPT ![r] = Nil]
  /\ UNCHANGED <<planView, stopView, closeView, acqView, dropTried, restarts>>
  /\ LET v == takeView[r]
         c == creator[r]
     IN
     \/ /\ (scopeRev # v.scope \/ acqRev[c] # v.acq)      \* conflict: read again
        /\ UNCHANGED <<durable, lost, history>>
     \/ /\ scopeRev = v.scope /\ acqRev[c] = v.acq
        /\ (scopeState \in {"closed", "released"} \/ acqClosed[c])   \* answers closed
        /\ drained' = drained \cup {r}
        /\ UNCHANGED <<scopeRev, scopeState, entries, creator, ended, acqRev, acqClosed, lost, history>>
     \/ /\ scopeRev = v.scope /\ acqRev[c] = v.acq
        /\ scopeState = "open" /\ ~acqClosed[c]
        /\ \/ Lose /\ UNCHANGED <<durable, history>>
           \/ /\ Commit([entries EXCEPT ![r] = kind], ended, "open", {})
              /\ adoptCommits' = IF kind = "adopted" THEN [adoptCommits EXCEPT ![r] = @ + 1] ELSE adoptCommits
              /\ reopened' = reopened \/ everClosed
              /\ UNCHANGED <<creator, acqRev, acqClosed, drained, lost, everClosed>>

(***************************************************************************)
(* confirmed stop of a resource the scope holds: the commit removes the    *)
(* entry and, for an adopted process, writes its end fact.                 *)
(***************************************************************************)
StopRead(r) ==
  /\ Taken(r) /\ stopView[r] = Nil
  /\ stopView' = [stopView EXCEPT ![r] = scopeRev]
  /\ UNCHANGED <<durable, planView, takeView, closeView, acqView, dropTried, lost, restarts, history>>

StopCommit(r) ==
  /\ stopView[r] # Nil
  /\ stopView' = [stopView EXCEPT ![r] = Nil]
  /\ UNCHANGED <<planView, takeView, closeView, acqView, dropTried, restarts>>
  /\ \/ /\ scopeRev # stopView[r]                         \* conflict: read again
        /\ UNCHANGED <<durable, lost, history>>
     \/ /\ scopeRev = stopView[r]                          \* the entry is still held
        /\ \/ Lose /\ UNCHANGED <<durable, history>>
           \/ /\ Commit([entries EXCEPT ![r] = "none"],
                        IF entries[r] = "adopted" /\ ~ForgetEndFact THEN ended \cup {r} ELSE ended,
                        scopeState,
                        IF entries[r] = "adopted" THEN {r} ELSE {})
              /\ UNCHANGED <<creator, acqRev, acqClosed, drained, lost, everClosed, reopened, adoptCommits>>

(***************************************************************************)
(* scope close: the maintainer closes the scope. The same commit removes   *)
(* every reservation nobody took over, and releases the scope when nothing *)
(* remains.                                                                *)
(***************************************************************************)
CloseRead ==
  /\ closeView = Nil /\ scopeState \in {"none", "open"}
  /\ closeView' = scopeRev
  /\ UNCHANGED <<durable, planView, takeView, stopView, acqView, dropTried, lost, restarts, history>>

CloseCommit ==
  /\ closeView # Nil
  /\ closeView' = Nil
  /\ UNCHANGED <<planView, takeView, stopView, acqView, dropTried, restarts>>
  /\ \/ /\ scopeRev # closeView                            \* conflict: read again
        /\ UNCHANGED <<durable, lost, history>>
     \/ /\ scopeRev = closeView
        /\ \/ Lose /\ UNCHANGED <<durable, history>>
           \/ /\ Commit(entries, ended, "closed", {})
              /\ everClosed' = TRUE
              /\ UNCHANGED <<creator, acqRev, acqClosed, drained, lost, reopened, adoptCommits>>

(***************************************************************************)
(* acquisition close: call c's acquisition ends. It reads which of its     *)
(* resources the scope took over (`handedOver`) and drains the rest under  *)
(* its own name. The write to its own domain asserts the scope revision.   *)
(***************************************************************************)
AcqCloseRead(c) ==
  /\ ~acqClosed[c] /\ acqView[c] = Nil
  /\ acqView' = [acqView EXCEPT ![c] = [scope |-> scopeRev,
                                        taken |-> {r \in Resources : creator[r] = c /\ Taken(r)}]]
  /\ UNCHANGED <<durable, planView, takeView, stopView, closeView, dropTried, lost, restarts, history>>

AcqCloseCommit(c) ==
  /\ acqView[c] # Nil
  /\ acqView' = [acqView EXCEPT ![c] = Nil]
  /\ UNCHANGED <<planView, takeView, stopView, closeView, dropTried, restarts, history>>
  /\ LET v == acqView[c] IN
     \/ /\ (~AcquisitionWriteWithoutScopeAssert /\ scopeRev # v.scope)   \* conflict: read again
        /\ UNCHANGED <<durable, lost>>
     \/ /\ (AcquisitionWriteWithoutScopeAssert \/ scopeRev = v.scope)
        /\ \/ Lose /\ UNCHANGED durable
           \/ /\ acqClosed' = [acqClosed EXCEPT ![c] = TRUE]
              /\ acqRev' = [acqRev EXCEPT ![c] = @ + 1]
              /\ drained' = drained \cup {r \in Resources : creator[r] = c /\ r \notin v.taken}
              /\ UNCHANGED <<scopeRev, scopeState, entries, creator, ended, lost>>

(***************************************************************************)
(* The closed acquisition's one early drop of the reservations it created  *)
(* and nobody took over: a second commit after its close, conditioned on   *)
(* the scope revision, not retried when it is lost.                        *)
(***************************************************************************)
EarlyDrop(c) ==
  /\ acqClosed[c] /\ ~dropTried[c]
  /\ dropTried' = [dropTried EXCEPT ![c] = TRUE]
  /\ UNCHANGED <<planView, takeView, stopView, closeView, acqView, restarts,
                 creator, acqRev, acqClosed, drained, everClosed, reopened, adoptCommits>>
  /\ LET mine == {r \in Resources : creator[r] = c /\ entries[r] = "reserved"} IN
     \/ Lose /\ UNCHANGED <<scopeRev, scopeState, entries, ended, stoppedProcesses>>
     \/ /\ (scopeState # "open" \/ mine = {})
        /\ UNCHANGED <<scopeRev, scopeState, entries, ended, stoppedProcesses, lost>>
     \/ /\ scopeState = "open" /\ mine # {}
        /\ Commit([r \in Resources |-> IF r \in mine THEN "none" ELSE entries[r]], ended, "open", {})
        /\ UNCHANGED lost

(***************************************************************************)
(* restart: every in-memory view is lost; a pending early drop of an       *)
(* already closed acquisition does not survive. Durable domains stay.      *)
(***************************************************************************)
Restart ==
  /\ restarts < MaxRestarts
  /\ restarts' = restarts + 1
  /\ planView' = NoPlanView /\ takeView' = NoPlanView /\ stopView' = NoPlanView
  /\ closeView' = Nil /\ acqView' = [c \in Calls |-> Nil]
  /\ dropTried' = [c \in Calls |-> dropTried[c] \/ acqClosed[c]]
  /\ UNCHANGED <<durable, lost, history>>

Next ==
  \/ \E c \in Calls, r \in Resources : PlanRead(c, r)
  \/ \E r \in Resources : PlanCommit(r) \/ TakeRead(r) \/ StopRead(r) \/ StopCommit(r)
  \/ \E r \in Resources, kind \in Owned : TakeCommit(r, kind)
  \/ CloseRead \/ CloseCommit
  \/ \E c \in Calls : AcqCloseRead(c) \/ AcqCloseCommit(c) \/ EarlyDrop(c)
  \/ Restart

Spec == Init /\ [][Next]_vars

(***************************************************************************)
(* Fairness for the progress check: every held resource is eventually      *)
(* stopped and the stop is eventually written (lost commits are bounded by *)
(* MaxLost, so the retries end in a commit). No other actor is fair.       *)
(***************************************************************************)
Fairness == \A r \in Resources : WF_vars(StopRead(r)) /\ WF_vars(StopCommit(r))
Fair == Spec /\ Fairness

(***************************************************************************)
(* The stop answer of the contract (停止, items 3, 5 and 7) from durable    *)
(* facts only: a held entry is stopped; a recorded end fact answers        *)
(* confirmed; anything else answers notFound.                              *)
(***************************************************************************)
StopReply(r) == IF Taken(r) THEN "stopping" ELSE IF r \in ended THEN "confirmed" ELSE "notFound"

(* 作用域不会从已关闭或已释放回到开放；关闭后 plan、permit、adopt 答 closed。 *)
NeverReopen == everClosed => (scopeState # "open" /\ ~reopened)

(* 已释放：不持有条目，结束事实已删除，只剩关闭标记（状态不是 none）。 *)
ReleasedShape == scopeState = "released" => ((\A r \in Resources : entries[r] = "none") /\ ended = {})

(* 已关闭：只持有已被许可或接管的条目，至少一条。 *)
ClosedShape == scopeState = "closed" => ((\A r \in Resources : entries[r] # "reserved") /\ OwnedSet # {})

(* 停止答复：作用域存在期间，已确认停止的保留进程答 confirmed；从未进入作用域的答 notFound。 *)
StopAnswer ==
  /\ \A r \in stoppedProcesses : Exists => StopReply(r) = "confirmed"
  /\ \A r \in Resources : creator[r] = Nil => StopReply(r) = "notFound"

(* 一个资源不能既被作用域接管，又被创建者获取在关闭时按自己的名义停止。 *)
ClosedAcquisitionNotAdopted == \A r \in Resources : entries[r] = "adopted" => r \notin drained

(* 每个资源至多一次 adopt 写入。 *)
NoDoubleAdopt == \A r \in Resources : adoptCommits[r] <= 1

(* 已关闭且所持资源都停止之后，作用域最终释放。 *)
EventuallyReleased == [](scopeState = "closed" => <>(scopeState = "released"))

===================================================================================
