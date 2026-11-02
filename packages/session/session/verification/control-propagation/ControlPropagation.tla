------------------------- MODULE ControlPropagation -------------------------
(* C3 control propagation (SPEC C3, S5) interleaved with the per-session serial
   lane (SR-2), the S1 advance of a successor Run, and instance close.
   One session, one control operation, three execution identities:
   e1 is the original execution of Run R1, e1b a replacement execution of R1,
   e2 the execution of the successor Run R2. *)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS MaxReplays, Kind, Bugs
BugNames == {"outbound-in-serial", "close-waits-outbound", "no-replay-bound",
             "skip-query", "no-propagating-filter", "no-unique-association"}
ASSUME /\ MaxReplays \in Nat /\ MaxReplays >= 1
       /\ Kind \in {"cancel-run", "stop-call"}
       /\ Bugs \subseteq BugNames

VARIABLES
  cstate,         \* the control in the snapshot: propagating | reconciled
  run1, run2,     \* R1 active | terminal; R2 none | started
  replaced,       \* a second execution e1b of R1 exists in the snapshot
  lane,           \* the serial lane of the session, FIFO, head is the holder
  ctl,            \* the C3 task: idle | queued | reading | sending | querying | waiting
  phase,          \* replay record: send | query | stopped
  attempts,       \* replay.attempts, counted per round inside the lane
  sends,          \* outbound control sends so far
  outbound,       \* the outbound in flight: none | control | query
  target,         \* the execution the outbound in flight carries
  pendingUnknown, \* a send ended commit-unknown and no query has settled it
  committed,      \* a query answered committed
  adv,            \* the S1/C2 task of the successor Run: idle | queued
  closed,         \* lifecycle.close started
  closeDone,      \* lifecycle.close returned
  assocSafe,      \* observation: every outbound carried the unique original execution
  replaySafe      \* observation: every round started while the control was propagating

vars == <<cstate, run1, run2, replaced, lane, ctl, phase, attempts, sends,
          outbound, target, pendingUnknown, committed, adv, closed, closeDone,
          assocSafe, replaySafe>>

Executions == {"e1", "e1b", "e2"}
Holders == {"control", "advance"}
R1Executions == {"e1"} \cup (IF replaced THEN {"e1b"} ELSE {})
Unique == Cardinality(R1Executions) = 1
(* originalExecution: cancel-run needs exactly one execution of R1; stop-call
   needs the initiating attempt's execution to be that one execution. *)
Candidates ==
  IF Unique THEN {"e1"}
  ELSE IF Kind = "cancel-run" /\ "no-unique-association" \in Bugs THEN R1Executions
  ELSE {}
Propagating == cstate = "propagating" \/ "no-propagating-filter" \in Bugs
Budget == attempts < MaxReplays \/ "no-replay-bound" \in Bugs
InLane(who) == \E i \in 1..Len(lane) : lane[i] = who
HeadIs(who) == lane # <<>> /\ Head(lane) = who
Released == IF HeadIs("control") THEN Tail(lane) ELSE lane
(* The task may stop waiting for an unanswered outbound at close. *)
Abandonable == "outbound-in-serial" \notin Bugs /\ "close-waits-outbound" \notin Bugs

Init ==
  /\ cstate = "propagating"
  /\ run1 = IF Kind = "cancel-run" THEN "terminal" ELSE "active"
  /\ run2 = "none"
  /\ replaced = FALSE
  /\ lane = <<>>
  /\ ctl = "idle"
  /\ phase = "send"
  /\ attempts = 0
  /\ sends = 0
  /\ outbound = "none"
  /\ target = "none"
  /\ pendingUnknown = FALSE
  /\ committed = FALSE
  /\ adv = "idle"
  /\ closed = FALSE
  /\ closeDone = FALSE
  /\ assocSafe = TRUE
  /\ replaySafe = TRUE

-----------------------------------------------------------------------------
(* C3 task: trigger, discovery and launch collapse into one action. *)
Launch ==
  /\ ~closed /\ ctl = "idle" /\ phase # "stopped" /\ Budget /\ Propagating
  /\ ctl' = "queued"
  /\ lane' = Append(lane, "control")
  /\ UNCHANGED <<cstate, run1, run2, replaced, phase, attempts, sends, outbound,
       target, pendingUnknown, committed, adv, closed, closeDone, assocSafe, replaySafe>>

(* scheduling.serial hands the lane to the task. *)
BeginRead ==
  /\ ctl = "queued" /\ HeadIs("control")
  /\ ctl' = "reading"
  /\ UNCHANGED <<cstate, run1, run2, replaced, lane, phase, attempts, sends, outbound,
       target, pendingUnknown, committed, adv, closed, closeDone, assocSafe, replaySafe>>

(* step: read the snapshot, no propagating control or no unique association, stop. *)
Stop ==
  /\ ctl = "reading"
  /\ closed \/ ~Propagating \/ Candidates = {}
  /\ ctl' = "idle"
  /\ lane' = Tail(lane)
  /\ UNCHANGED <<cstate, run1, run2, replaced, phase, attempts, sends, outbound,
       target, pendingUnknown, committed, adv, closed, closeDone, assocSafe, replaySafe>>

(* step: one round, one outbound. The correct design releases the lane here;
   the outbound-in-serial defect keeps it until the outbound answers. *)
Send ==
  /\ ctl = "reading"
  /\ ~closed /\ Propagating /\ Candidates # {}
  /\ \E e \in Candidates :
       /\ target' = e
       /\ assocSafe' = (assocSafe /\ Unique /\ e = "e1")
  /\ attempts' = attempts + 1
  /\ replaySafe' = (replaySafe /\ cstate = "propagating")
  /\ IF phase = "query"
       THEN outbound' = "query" /\ ctl' = "querying" /\ sends' = sends
       ELSE outbound' = "control" /\ ctl' = "sending" /\ sends' = sends + 1
  /\ lane' = IF "outbound-in-serial" \in Bugs THEN lane ELSE Tail(lane)
  /\ UNCHANGED <<cstate, run1, run2, replaced, phase, pendingUnknown, committed,
       adv, closed, closeDone>>

(* 'again': the loop checks closed and the budget, then enters the lane again. *)
Again ==
  IF closed \/ ~Budget
    THEN ctl' = "idle" /\ lane' = Released
    ELSE ctl' = "queued" /\ lane' = Append(Released, "control")

(* The Agent answers port.control. An answer to an abandoned outbound is dropped. *)
Answered == outbound' = "none" /\ target' = "none"
RespondControl(r) ==
  /\ outbound = "control"
  /\ IF ctl # "sending"
       THEN Answered /\ UNCHANGED <<ctl, phase, lane, pendingUnknown>>
       ELSE
         CASE r = "ok" \/ r = "busy" ->
                /\ Answered /\ ctl' = "waiting" /\ lane' = Released
                /\ UNCHANGED <<phase, pendingUnknown>>
           [] r = "rejected" ->
                /\ Answered /\ phase' = "stopped" /\ ctl' = "idle" /\ lane' = Released
                /\ UNCHANGED pendingUnknown
           [] r = "commit-unknown" ->
                /\ pendingUnknown' = TRUE
                /\ IF closed
                     THEN Answered /\ phase' = "query" /\ ctl' = "idle" /\ lane' = Released
                   ELSE IF "skip-query" \in Bugs
                     THEN Answered /\ phase' = "send" /\ ctl' = "waiting" /\ lane' = Released
                   ELSE /\ outbound' = "query" /\ phase' = "query" /\ ctl' = "querying"
                        /\ UNCHANGED <<lane, target>>
  /\ UNCHANGED <<cstate, run1, run2, replaced, attempts, sends, committed, adv,
       closed, closeDone, assocSafe, replaySafe>>

(* The Agent answers port.query. commit-unknown of the same round is asked here too,
   so the in-flight query keeps the target and, under the defect, the lane. *)
RespondQuery(r) ==
  /\ outbound = "query"
  /\ outbound' = "none"
  /\ target' = "none"
  /\ IF ctl # "querying"
       THEN UNCHANGED <<ctl, phase, lane, pendingUnknown, committed>>
       ELSE
         CASE r = "committed" ->
                /\ committed' = TRUE /\ pendingUnknown' = FALSE
                /\ phase' = "stopped" /\ ctl' = "idle" /\ lane' = Released
           [] r = "unknown" ->
                /\ phase' = "query" /\ ctl' = "waiting" /\ lane' = Released
                /\ UNCHANGED <<pendingUnknown, committed>>
           [] r = "excluded" ->
                /\ pendingUnknown' = FALSE /\ phase' = "send" /\ Again
                /\ UNCHANGED committed
  /\ UNCHANGED <<cstate, run1, run2, replaced, attempts, sends, adv, closed,
       closeDone, assocSafe, replaySafe>>

(* scheduling.wait elapsed, or returned false because the instance closed. *)
EndWait ==
  /\ ctl = "waiting"
  /\ IF closed \/ ~Budget
       THEN ctl' = "idle" /\ UNCHANGED lane
       ELSE ctl' = "queued" /\ lane' = Append(lane, "control")
  /\ UNCHANGED <<cstate, run1, run2, replaced, phase, attempts, sends, outbound,
       target, pendingUnknown, committed, adv, closed, closeDone, assocSafe, replaySafe>>

(* At close the task stops waiting for the outbound. The outbound stays in flight. *)
AbandonOutbound ==
  /\ closed /\ ctl \in {"sending", "querying"} /\ Abandonable
  /\ ctl' = "idle"
  /\ UNCHANGED <<cstate, run1, run2, replaced, lane, phase, attempts, sends, outbound,
       target, pendingUnknown, committed, adv, closed, closeDone, assocSafe, replaySafe>>

-----------------------------------------------------------------------------
(* S1 wakes for the successor Run once R1 is terminal and hands C2 to the lane. *)
TriggerAdvance ==
  /\ ~closed /\ adv = "idle" /\ run1 = "terminal" /\ run2 = "none"
  /\ adv' = "queued"
  /\ lane' = Append(lane, "advance")
  /\ UNCHANGED <<cstate, run1, run2, replaced, ctl, phase, attempts, sends, outbound,
       target, pendingUnknown, committed, closed, closeDone, assocSafe, replaySafe>>

(* openRun inside the lane: startRun and invoke, abstracted to one answered step. *)
OpenRun ==
  /\ adv = "queued" /\ HeadIs("advance")
  /\ adv' = "idle"
  /\ lane' = Tail(lane)
  /\ run2' = IF closed THEN run2 ELSE "started"
  /\ UNCHANGED <<cstate, run1, replaced, ctl, phase, attempts, sends, outbound,
       target, pendingUnknown, committed, closed, closeDone, assocSafe, replaySafe>>

-----------------------------------------------------------------------------
RequestClose ==
  /\ ~closed
  /\ closed' = TRUE
  /\ UNCHANGED <<cstate, run1, run2, replaced, lane, ctl, phase, attempts, sends,
       outbound, target, pendingUnknown, committed, adv, closeDone, assocSafe, replaySafe>>

(* lifecycle.close returns when every spawned task has settled. *)
CloseDone ==
  /\ closed /\ ~closeDone /\ ctl = "idle" /\ adv = "idle"
  /\ closeDone' = TRUE
  /\ UNCHANGED <<cstate, run1, run2, replaced, lane, ctl, phase, attempts, sends,
       outbound, target, pendingUnknown, committed, adv, closed, assocSafe, replaySafe>>

(* Environment: receive(control) reconciles the control; a replacement execution
   of R1 appears; R1 reaches a terminal state by a normal interpretation. *)
Reconcile ==
  /\ cstate = "propagating"
  /\ cstate' = "reconciled"
  /\ UNCHANGED <<run1, run2, replaced, lane, ctl, phase, attempts, sends, outbound,
       target, pendingUnknown, committed, adv, closed, closeDone, assocSafe, replaySafe>>

Replace ==
  /\ ~replaced
  /\ replaced' = TRUE
  /\ UNCHANGED <<cstate, run1, run2, lane, ctl, phase, attempts, sends, outbound,
       target, pendingUnknown, committed, adv, closed, closeDone, assocSafe, replaySafe>>

FinishRun1 ==
  /\ run1 = "active"
  /\ run1' = "terminal"
  /\ UNCHANGED <<cstate, run2, replaced, lane, ctl, phase, attempts, sends, outbound,
       target, pendingUnknown, committed, adv, closed, closeDone, assocSafe, replaySafe>>

-----------------------------------------------------------------------------
Internal == Launch \/ BeginRead \/ Stop \/ Send \/ EndWait \/ AbandonOutbound
            \/ TriggerAdvance \/ OpenRun \/ CloseDone
Environment == RequestClose \/ Reconcile \/ Replace \/ FinishRun1
               \/ (\E r \in {"ok", "busy", "rejected", "commit-unknown"} : RespondControl(r))
               \/ (\E r \in {"committed", "unknown", "excluded"} : RespondQuery(r))
Next == Internal \/ Environment

(* Weak fairness on the scheduler and the task; none on the Agent's answers, so
   every behavior in which an outbound never answers is explored. *)
InternalFairness ==
  /\ WF_vars(Launch) /\ WF_vars(BeginRead) /\ WF_vars(Stop) /\ WF_vars(Send)
  /\ WF_vars(EndWait) /\ WF_vars(AbandonOutbound)
  /\ WF_vars(TriggerAdvance) /\ WF_vars(OpenRun) /\ WF_vars(CloseDone)
Spec == Init /\ [][Next]_vars /\ InternalFairness

-----------------------------------------------------------------------------
TypeOK ==
  /\ cstate \in {"propagating", "reconciled"}
  /\ run1 \in {"active", "terminal"} /\ run2 \in {"none", "started"}
  /\ replaced \in BOOLEAN
  /\ lane \in Seq(Holders) /\ Len(lane) <= 2
  /\ ctl \in {"idle", "queued", "reading", "sending", "querying", "waiting"}
  /\ phase \in {"send", "query", "stopped"}
  /\ attempts \in Nat /\ sends \in Nat /\ sends <= attempts
  /\ outbound \in {"none", "control", "query"}
  /\ target \in Executions \cup {"none"}
  /\ (outbound = "none") <=> (target = "none")
  /\ (ctl \in {"sending", "querying"}) => outbound # "none"
  /\ pendingUnknown \in BOOLEAN /\ committed \in BOOLEAN
  /\ adv \in {"idle", "queued"}
  /\ closed \in BOOLEAN /\ closeDone \in BOOLEAN /\ (closeDone => closed)
  /\ assocSafe \in BOOLEAN /\ replaySafe \in BOOLEAN

LaneConsistent ==
  /\ (ctl \in {"queued", "reading"}) => InLane("control")
  /\ (ctl \in {"idle", "waiting"}) => ~InLane("control")
  /\ (ctl = "reading") => HeadIs("control")
  /\ (adv = "queued") <=> InLane("advance")
  /\ ("outbound-in-serial" \notin Bugs) => ((ctl \in {"sending", "querying"}) => ~InLane("control"))

(* P1 safety *)
TargetSafe == assocSafe
QueryBeforeResend == pendingUnknown => outbound # "control"
NoSendAfterCommitted == committed => (phase = "stopped" /\ ctl = "idle" /\ outbound = "none")
ReplayBounded == attempts <= MaxReplays /\ sends <= MaxReplays
(* P3 *)
ReplayOnlyWhilePropagating == replaySafe
NoInternalDeadlock == closeDone \/ ENABLED Next

(* P2 liveness, checked without any fairness on the Agent's answers *)
SuccessorProgress == (run1 = "terminal" /\ ~closed) ~> (run2 = "started" \/ closed)
CloseProgress == closed ~> closeDone
=============================================================================
