---------------------------- MODULE ToolCall ----------------------------
(* Tool call lifecycle: the five orthogonal dimensions of
   docs/proposals/tool-execution/lifecycle.md (progress, attempt ledger,
   waiting relation, control, settlement delivery) for a bounded set of calls
   against an abstract Run, Session and execution owner.  Bounded evidence for
   the tool-execution proposal (TL-07..TL-11, SE-12/14/17/18, HD-03/04,
   PF-013.C4, invariants T-2..T-5, T-10, H-1..H-3).

   Calls are of kind "tool" (execution owner = local/shell owner) or "human"
   (execution owner = the human-decisions provider; the call settles when the
   person answers).  One attempt per call: after a crash the owner re-sends
   `start` with the same attempt id and never creates a second attempt, so the
   ledger is a single monotone value per call.

   Run states are abstract as in Inbound.tla: none | running (driver inside a
   Step) | waiting (Step settled, a blocking call pending) | interrupted |
   terminal | cancelled.  The waiting relation of a settled call is kept as its
   last relation so that the Inbound decision table can tell a blocking
   settlement (continuation) from a background one (context).
*)
EXTENDS Naturals, FiniteSets

CONSTANTS Calls, MaxCrash

Kinds == {"tool", "human"}
Settled == {"succeeded", "failed", "denied", "cancelled", "interrupted", "unknown"}
Progs == {"none", "proposed", "waiting_approval", "admitted", "executing"} \cup Settled
Atts == {"absence", "accepted", "dispatch_intent", "terminal"}
Rels == {"none", "foreground", "detach_in_flight", "background", "human_wait"}
Ctls == {"none", "stop_requested", "stop_progressed"}
Delivs == {"none", "settling", "continuation", "context", "queue", "consumed", "closed"}
Hds == {"none", "open", "answered", "closed"}
RunStates == {"none", "running", "waiting", "interrupted", "terminal", "cancelled"}

VARIABLES sess, run, owner, crashes, kind, prog, att, fence, rel, ctl, deliv, hd
vars == <<sess, run, owner, crashes, kind, prog, att, fence, rel, ctl, deliv, hd>>

IsSettled(c) == prog[c] \in Settled
Open(c) == prog[c] \in {"proposed", "waiting_approval", "admitted", "executing"}
Blocking(c) == Open(c) /\ rel[c] /= "background"
Conts == {c \in Calls : deliv[c] = "continuation"}
Ctxs == {c \in Calls : deliv[c] = "context"}
Pending == Conts \cup Ctxs
Settling == {c \in Calls : deliv[c] = "settling"}

Init ==
  /\ sess = "open" /\ run = "none" /\ owner = "alive" /\ crashes = 0
  /\ kind \in [Calls -> Kinds]
  /\ prog = [c \in Calls |-> "none"]
  /\ att = [c \in Calls |-> "absence"]
  /\ fence = [c \in Calls |-> FALSE]
  /\ rel = [c \in Calls |-> "none"]
  /\ ctl = [c \in Calls |-> "none"]
  /\ deliv = [c \in Calls |-> "none"]
  /\ hd = [c \in Calls |-> "none"]

(* ---- one settlement is one commit: tools.call.settled + inbound.arrival.accepted
   {call_settlement, dedupKey=(call, attempt)}; a pending stop request receives
   its physical fact in the same commit (TL-07, TL-09, SE-12) ---- *)
SettleOne(c, o) ==
  /\ prog' = [prog EXCEPT ![c] = o]
  /\ deliv' = [deliv EXCEPT ![c] = "settling"]
  /\ ctl' = [ctl EXCEPT ![c] = IF ctl[c] = "stop_requested" THEN "stop_progressed" ELSE ctl[c]]

(* ---- stop cascade over a set S of open calls (TL-08/09, PF-013.C4):
   every member gets a fence (tombstone); members without an accepted attempt
   settle cancelled_before_execution now and their human request closes;
   executing members get a stop request the owner must progress.  When
   closePending holds, unconsumed continuations/contexts are closed (SE-17). ---- *)
Cascade(S, closePending) ==
  LET Now == {c \in S : att[c] = "absence"}
      Exec == {c \in S : att[c] /= "absence"}
  IN /\ fence' = [c \in Calls |-> fence[c] \/ c \in S]
     /\ prog' = [c \in Calls |-> IF c \in Now THEN "cancelled" ELSE prog[c]]
     /\ deliv' = [c \in Calls |-> IF c \in Now THEN "settling"
                                  ELSE IF closePending /\ c \in Pending THEN "closed"
                                  ELSE deliv[c]]
     /\ ctl' = [c \in Calls |-> IF c \in Exec /\ ctl[c] = "none" THEN "stop_requested" ELSE ctl[c]]
     /\ hd' = [c \in Calls |-> IF c \in Now /\ hd[c] = "open" THEN "closed" ELSE hd[c]]

(* ================= dimension A: progress, with B/C written in the same commits ================= *)

\* RD-08/09: the driver proposes inside a Step
Propose(c) ==
  /\ run = "running" /\ prog[c] = "none"
  /\ prog' = [prog EXCEPT ![c] = "proposed"]
  /\ UNCHANGED <<sess, run, owner, crashes, kind, att, fence, rel, ctl, deliv, hd>>

\* TL-07 gate = allow.  Tool calls choose their start relation (call-level detach,
\* schema.md); a human call's admission and HD request creation are one commit
\* (HD-03) and the call is immediately "executing" = waiting for the person.
GateAllow(c, r) ==
  /\ prog[c] = "proposed"
  /\ IF kind[c] = "tool"
       THEN /\ r \in {"foreground", "background"}
            /\ prog' = [prog EXCEPT ![c] = "admitted"]
            /\ rel' = [rel EXCEPT ![c] = r]
            /\ UNCHANGED hd
       ELSE /\ r = "human_wait"
            /\ prog' = [prog EXCEPT ![c] = "executing"]
            /\ rel' = [rel EXCEPT ![c] = "human_wait"]
            /\ hd' = [hd EXCEPT ![c] = "open"]
  /\ UNCHANGED <<sess, run, owner, crashes, kind, att, fence, ctl, deliv>>

\* TL-07 gate = ask: system approval request (HD-03); human calls never need one
GateAsk(c) ==
  /\ prog[c] = "proposed" /\ kind[c] = "tool"
  /\ prog' = [prog EXCEPT ![c] = "waiting_approval"]
  /\ hd' = [hd EXCEPT ![c] = "open"]
  /\ UNCHANGED <<sess, run, owner, crashes, kind, att, fence, rel, ctl, deliv>>

GateDeny(c) ==
  /\ prog[c] = "proposed"
  /\ SettleOne(c, "denied")
  /\ UNCHANGED <<sess, run, owner, crashes, kind, att, fence, rel, hd>>

\* HD-06 / RD-11: approval consumed in the admission commit
Approve(c, r) ==
  /\ prog[c] = "waiting_approval" /\ hd[c] = "open"
  /\ r \in {"foreground", "background"}
  /\ prog' = [prog EXCEPT ![c] = "admitted"]
  /\ rel' = [rel EXCEPT ![c] = r]
  /\ hd' = [hd EXCEPT ![c] = "answered"]
  /\ UNCHANGED <<sess, run, owner, crashes, kind, att, fence, ctl, deliv>>

\* HD-07
Reject(c) ==
  /\ prog[c] = "waiting_approval" /\ hd[c] = "open"
  /\ hd' = [hd EXCEPT ![c] = "answered"]
  /\ SettleOne(c, "denied")
  /\ UNCHANGED <<sess, run, owner, crashes, kind, att, fence, rel>>

\* TL-08: the owner's short gate orders start against the fence; accepted is durable
Start(c) ==
  /\ prog[c] = "admitted" /\ kind[c] = "tool" /\ ~fence[c] /\ owner = "alive"
  /\ att' = [att EXCEPT ![c] = "accepted"]
  /\ prog' = [prog EXCEPT ![c] = "executing"]
  /\ UNCHANGED <<sess, run, owner, crashes, kind, fence, rel, ctl, deliv, hd>>

\* TL-08: dispatch intent durable before any real I/O
Dispatch(c) ==
  /\ prog[c] = "executing" /\ att[c] = "accepted" /\ owner = "alive"
  /\ att' = [att EXCEPT ![c] = "dispatch_intent"]
  /\ UNCHANGED <<sess, run, owner, crashes, kind, prog, fence, rel, ctl, deliv, hd>>

\* real result wins over a pending stop request (TL-09 "按真实先后")
Terminal(c, o) ==
  /\ prog[c] = "executing" /\ kind[c] = "tool" /\ att[c] /= "absence" /\ owner = "alive"
  /\ o \in {"succeeded", "failed"}
  /\ att' = [att EXCEPT ![c] = "terminal"]
  /\ SettleOne(c, o)
  /\ UNCHANGED <<sess, run, owner, crashes, kind, fence, rel, hd>>

\* TL-09: the owner reports the physical stop (quiescent / isolated)
StopProgress(c) ==
  /\ prog[c] = "executing" /\ kind[c] = "tool" /\ ctl[c] = "stop_requested" /\ owner = "alive"
  /\ att' = [att EXCEPT ![c] = "terminal"]
  /\ SettleOne(c, "interrupted")
  /\ UNCHANGED <<sess, run, owner, crashes, kind, fence, rel, hd>>

(* ================= dimension D: control ================= *)

\* user stopCall (PF-003.C4); on a human call this withdraws the question
StopRequest(c) ==
  /\ Open(c) /\ ~fence[c]
  /\ Cascade({c}, FALSE)
  /\ UNCHANGED <<sess, run, owner, crashes, kind, att, rel>>

(* ================= dimension C: waiting relation (TL-10) ================= *)

\* user detach, foreground limit or interrupt_then_run: only a relation change
Detach(c) ==
  /\ prog[c] = "executing" /\ kind[c] = "tool" /\ rel[c] = "foreground"
  /\ rel' = [rel EXCEPT ![c] = "detach_in_flight"]
  /\ UNCHANGED <<sess, run, owner, crashes, kind, prog, att, fence, ctl, deliv, hd>>

DetachConfirm(c) ==
  /\ rel[c] = "detach_in_flight" /\ prog[c] = "executing" /\ owner = "alive"
  /\ rel' = [rel EXCEPT ![c] = "background"]
  /\ UNCHANGED <<sess, run, owner, crashes, kind, prog, att, fence, ctl, deliv, hd>>

DetachFail(c) ==
  /\ rel[c] = "detach_in_flight" /\ prog[c] = "executing" /\ owner = "alive"
  /\ rel' = [rel EXCEPT ![c] = "foreground"]
  /\ UNCHANGED <<sess, run, owner, crashes, kind, prog, att, fence, ctl, deliv, hd>>

(* ================= built-in human tool (U-41, D2) ================= *)

\* HD.answer: unique decision, call settled succeeded{answer}, arrival accepted — one commit
Answer(c) ==
  /\ kind[c] = "human" /\ prog[c] = "executing" /\ hd[c] = "open"
  /\ hd' = [hd EXCEPT ![c] = "answered"]
  /\ SettleOne(c, "succeeded")
  /\ UNCHANGED <<sess, run, owner, crashes, kind, att, fence, rel>>

(* ================= execution owner crash / recovery (TL-08/11, RD-16) ================= *)

OwnerCrash ==
  /\ owner = "alive" /\ crashes < MaxCrash
  /\ owner' = "lost" /\ crashes' = crashes + 1
  /\ UNCHANGED <<sess, run, kind, prog, att, fence, rel, ctl, deliv, hd>>

\* recovery window table: accepted without dispatch → same attempt re-sent
\* (unchanged here); dispatch_intent without terminal → unknown, never re-sent;
\* an unconfirmed detach falls back to foreground and is reported
OwnerRecover ==
  /\ owner = "lost"
  /\ owner' = "alive"
  /\ LET U == {c \in Calls : prog[c] = "executing" /\ kind[c] = "tool" /\ att[c] = "dispatch_intent"}
     IN /\ prog' = [c \in Calls |-> IF c \in U THEN "unknown" ELSE prog[c]]
        /\ deliv' = [c \in Calls |-> IF c \in U THEN "settling" ELSE deliv[c]]
        /\ ctl' = [c \in Calls |-> IF c \in U /\ ctl[c] = "stop_requested" THEN "stop_progressed" ELSE ctl[c]]
        /\ rel' = [c \in Calls |-> IF rel[c] = "detach_in_flight" THEN "foreground" ELSE rel[c]]
  /\ UNCHANGED <<sess, run, crashes, kind, att, fence, hd>>

(* ================= dimension E: settlement delivery via Inbound (SE-14) ================= *)

Route(c) ==
  IF sess = "archived" THEN "closed"                                        \* D2
  ELSE IF run \in {"waiting", "interrupted"} /\ rel[c] /= "background" THEN "continuation"   \* A
  ELSE IF run \in {"running", "waiting", "interrupted"} THEN "context"        \* B
  ELSE IF run \in {"none", "terminal"} THEN "queue"                           \* C
  ELSE "closed"                                                               \* D1

Adjudicate(c) ==
  /\ deliv[c] = "settling"
  /\ deliv' = [deliv EXCEPT ![c] = Route(c)]
  /\ UNCHANGED <<sess, run, owner, crashes, kind, prog, att, fence, rel, ctl, hd>>

\* the driver takes a continuation (wakes) or a context (at Step start): tool_result written
Consume(c) ==
  /\ c \in Pending /\ run \in {"running", "waiting"}
  /\ deliv' = [deliv EXCEPT ![c] = "consumed"]
  /\ run' = "running"
  /\ UNCHANGED <<sess, owner, crashes, kind, prog, att, fence, rel, ctl, hd>>

(* ================= abstract Run and Session ================= *)

\* SE-15/18: no Run starts while an arrival is unadjudicated; queued settlements are taken
RunStart ==
  /\ sess = "open" /\ run \in {"none", "terminal", "cancelled"} /\ Settling = {}
  /\ run' = "running"
  /\ deliv' = [c \in Calls |-> IF deliv[c] = "queue" THEN "consumed" ELSE deliv[c]]
  /\ UNCHANGED <<sess, owner, crashes, kind, prog, att, fence, rel, ctl, hd>>

\* Step settled with a blocking call pending (foreground, detach in flight or human wait)
RunWait ==
  /\ run = "running" /\ Pending = {} /\ \E c \in Calls : Blocking(c)
  /\ run' = "waiting"
  /\ UNCHANGED <<sess, owner, crashes, kind, prog, att, fence, rel, ctl, deliv, hd>>

\* RD-13: a confirmed detach frees the waiting position (deferred_receipt placeholder)
RunWake ==
  /\ run = "waiting" /\ Pending = {} /\ \A c \in Calls : ~Blocking(c)
  /\ run' = "running"
  /\ UNCHANGED <<sess, owner, crashes, kind, prog, att, fence, rel, ctl, deliv, hd>>

\* SE-17 / RD-10: completion needs no blocking call and no unconsumed context;
\* a continuation still pending converts to a queue item (trigger)
RunComplete ==
  /\ run = "running" /\ Ctxs = {} /\ \A c \in Calls : ~Blocking(c)
  /\ run' = "terminal"
  /\ deliv' = [c \in Calls |-> IF c \in Conts THEN "queue" ELSE deliv[c]]
  /\ UNCHANGED <<sess, owner, crashes, kind, prog, att, fence, rel, ctl, hd>>

\* LC-04 row 5 / PF-013.C4: every open tool call stops (background too);
\* human requests are kept and the Run needs an explicit resume (HD-04)
RunInterrupt ==
  /\ run \in {"running", "waiting"}
  /\ run' = "interrupted"
  /\ Cascade({c \in Calls : kind[c] = "tool" /\ Open(c)}, FALSE)
  /\ UNCHANGED <<sess, owner, crashes, kind, att, rel>>

RunResume ==
  /\ run = "interrupted" /\ Settling = {}
  /\ run' = IF Conts /= {} THEN "waiting" ELSE "running"
  /\ UNCHANGED <<sess, owner, crashes, kind, prog, att, fence, rel, ctl, deliv, hd>>

\* LC-04 row 4 / TL-11: cancel stops every open call, closes human requests and
\* unconsumed inputs
RunCancel ==
  /\ run \in {"running", "waiting", "interrupted"}
  /\ run' = "cancelled"
  /\ Cascade({c \in Calls : Open(c)}, TRUE)
  /\ UNCHANGED <<sess, owner, crashes, kind, att, rel>>

\* SE-02 / LC-04 row 1, policy b (decision f): archive leaves background work
\* untouched; unconsumed queue items close; later settlements route to closed
Archive ==
  /\ sess = "open" /\ run \in {"none", "terminal", "cancelled"} /\ Settling = {}
  /\ sess' = "archived"
  /\ deliv' = [c \in Calls |-> IF deliv[c] \in {"queue", "continuation", "context"} THEN "closed" ELSE deliv[c]]
  /\ UNCHANGED <<run, owner, crashes, kind, prog, att, fence, rel, ctl, hd>>

Gate(c) == GateAllow(c, "foreground") \/ GateAllow(c, "background") \/ GateAllow(c, "human_wait")
           \/ GateAsk(c) \/ GateDeny(c)
Decide(c) == Approve(c, "foreground") \/ Approve(c, "background") \/ Reject(c)
Finish(c) == Terminal(c, "succeeded") \/ Terminal(c, "failed") \/ StopProgress(c)

Next ==
  \/ \E c \in Calls :
       \/ Propose(c) \/ Gate(c) \/ Decide(c) \/ Start(c) \/ Dispatch(c) \/ Finish(c)
       \/ StopRequest(c) \/ Detach(c) \/ DetachConfirm(c) \/ DetachFail(c)
       \/ Answer(c) \/ Adjudicate(c) \/ Consume(c)
  \/ OwnerCrash \/ OwnerRecover
  \/ RunStart \/ RunWait \/ RunWake \/ RunComplete \/ RunInterrupt \/ RunResume \/ RunCancel
  \/ Archive

Spec == Init /\ [][Next]_vars

(* System actions are weakly fair; user/environment actions (Decide, Answer,
   RunResume) are assumptions stated in the progress configuration; strong
   fairness on Consume and RunStart tolerates interrupt/resume and
   complete/start cycles. *)
SpecFair ==
  /\ Spec
  /\ \A c \in Calls :
       /\ WF_vars(Gate(c)) /\ WF_vars(Start(c)) /\ WF_vars(Dispatch(c)) /\ WF_vars(Finish(c))
       /\ WF_vars(DetachConfirm(c)) /\ WF_vars(Adjudicate(c)) /\ SF_vars(Consume(c))
       /\ WF_vars(Decide(c)) /\ WF_vars(Answer(c))
  /\ WF_vars(OwnerRecover) /\ WF_vars(RunWait) /\ WF_vars(RunWake) /\ WF_vars(RunComplete)
  /\ SF_vars(RunStart) /\ WF_vars(RunResume)

(* ================= safety ================= *)

TypeOK ==
  /\ sess \in {"open", "archived"}
  /\ run \in RunStates
  /\ owner \in {"alive", "lost"}
  /\ crashes \in 0..MaxCrash
  /\ kind \in [Calls -> Kinds]
  /\ prog \in [Calls -> Progs]
  /\ att \in [Calls -> Atts]
  /\ fence \in [Calls -> BOOLEAN]
  /\ rel \in [Calls -> Rels]
  /\ ctl \in [Calls -> Ctls]
  /\ deliv \in [Calls -> Delivs]
  /\ hd \in [Calls -> Hds]

\* T-2: a settlement and its arrival exist together
SettledDelivered == \A c \in Calls : IsSettled(c) <=> deliv[c] /= "none"

\* T-5 / recovery table: unknown only after a durable dispatch intent
UnknownAfterDispatch == \A c \in Calls : prog[c] = "unknown" => att[c] = "dispatch_intent"

\* T-5: no attempt before admission; a human call never has an owner attempt
AttemptAfterAdmission == \A c \in Calls :
  /\ att[c] /= "absence" => prog[c] \in {"executing"} \cup Settled
  /\ kind[c] = "human" => att[c] = "absence"

\* H-1: a human call succeeds exactly by the person's answer
HumanByAnswer == \A c \in Calls :
  kind[c] = "human" => (prog[c] = "succeeded" <=> hd[c] = "answered")

\* SE-17 / RD-10: only background work outlives a completed Run
TerminalRunOnlyBackground == run = "terminal" => \A c \in Calls : Open(c) => rel[c] = "background"

\* T-10 / SE-14 D2: nothing waits to be consumed in an archived Session
ArchivedNoPending == sess = "archived" => \A c \in Calls : deliv[c] \notin {"continuation", "context", "queue"}

\* SE-17: no continuation survives a Run that is no longer active
NoStaleContinuation == run \in {"none", "terminal", "cancelled"} => Conts = {}

\* T-3: a fence never leaves an open call without a stop in progress
FenceConsistent == \A c \in Calls :
  fence[c] => (IsSettled(c) \/ (prog[c] = "executing" /\ ctl[c] /= "none"))

\* action properties
SettledStable == [][\A c \in Calls : IsSettled(c) => prog'[c] = prog[c]]_vars
\* T-5: the attempt ledger only moves forward; recovery never re-dispatches
AttOrder == [absence |-> 0, accepted |-> 1, dispatch_intent |-> 2, terminal |-> 3]
AttemptMonotone == [][\A c \in Calls : AttOrder[att'[c]] >= AttOrder[att[c]]]_vars
FenceMonotone == [][\A c \in Calls : fence[c] => fence'[c]]_vars
NoStartAfterFence == [][\A c \in Calls : (fence[c] /\ att[c] = "absence") => att'[c] = "absence"]_vars
ConsumedOnce == [][\A c \in Calls : deliv[c] \in {"consumed", "closed"} => deliv'[c] = deliv[c]]_vars
AnswerOnce == [][\A c \in Calls : hd[c] \in {"answered", "closed"} => hd'[c] = hd[c]]_vars
\* H-3: interrupt keeps the human request and the call
InterruptKeepsHuman == [][(run /= "interrupted" /\ run' = "interrupted") =>
  \A c \in Calls : kind[c] = "human" => (hd'[c] = hd[c] /\ prog'[c] = prog[c])]_vars
\* T-4 / policy b: archiving touches no call
ArchiveKeepsWork == [][(sess = "open" /\ sess' = "archived") =>
  (prog' = prog /\ att' = att /\ ctl' = ctl /\ fence' = fence)]_vars

(* ================= progress ================= *)

\* TP-1: a proposed call reaches a terminal outcome
CallsSettle == \A c \in Calls : (prog[c] = "proposed") ~> IsSettled(c)
\* TP-3: every settlement is consumed or closed
SettlementsResolve == \A c \in Calls : (deliv[c] = "settling") ~> (deliv[c] \in {"consumed", "closed"})
\* TP-2: a stop request gets its physical fact
StopsProgress == \A c \in Calls : (ctl[c] = "stop_requested") ~> (ctl[c] = "stop_progressed")
\* TP-4 (under the answer assumption): a request is answered or closed
HumanRequestsResolve == \A c \in Calls : (hd[c] = "open") ~> (hd[c] \in {"answered", "closed"})
=============================================================================
