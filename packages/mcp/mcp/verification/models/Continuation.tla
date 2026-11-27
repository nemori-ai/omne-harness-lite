---------------------------- MODULE Continuation ----------------------------
(***************************************************************************)
(* One action call that the bridge runs as a checkpointed entry source:    *)
(* the first segment sends `tools/call`; the peer answers complete, asks   *)
(* for input (`input_required`), makes a task, or does not answer. A call  *)
(* that waits is parked on a checkpoint; the answer of a person, or the    *)
(* task watcher, starts a resume segment. The process may be lost at any   *)
(* step: volatile state goes, the checkpoint, the continuation records and *)
(* the task row stay. A resume segment lost half way runs again from the   *)
(* same checkpoint (Tool SPEC, "等待与检查点作者").                         *)
(*                                                                         *)
(* What Tool guarantees is a premise here: one checkpoint has one          *)
(* successor, an answer is taken once, a closed wait takes no answer.      *)
(* The properties are I1 and I6 of the MCP SPEC and the rule that a task   *)
(* row is written before the call parks on it.                             *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  MaxCp,     \* checkpoints one call may write
  Crashes,   \* process losses per behavior
  Bugs       \* deliberate faults of a negative control; {} is the design

BugNames == {"no-record", "mark-later", "complete-on-gone", "park-before-row"}
ASSUME Bugs \subseteq BugNames /\ MaxCp \in Nat /\ Crashes \in Nat

VARIABLES
  phase,      \* "initial" | "parked" | "resuming" | "settled"
  cp,         \* number of the checkpoint the call stands on; 0 before the first
  wait,       \* what the checkpoint waits for: "none" | "person" | "task"
  cause,      \* why the resume segment runs: "none" | "answer" | "arrived" | "input"
  onTask,     \* TRUE: the input asked for belongs to the task, it goes by tasks/update
  pc,         \* volatile step of the running segment: "idle" | "recorded" | "sent"
  initialSends,  \* tools/call sent by the first segment
  contSends,     \* per checkpoint: tools/call retries with the input responses
  updateSends,   \* per checkpoint: tasks/update requests
  cancelSends,   \* tasks/cancel requests
  records,    \* durable: checkpoints whose continuation was already sent
  peerTask,   \* the peer's truth: "none" | "working" | "input" | "terminal" | "gone"
  row,        \* durable task row: "none" | "following" | "awaiting" | "arrived" | "dropped"
  outcome,    \* "none" | "complete" | "unknown" | "expired" | "cancelled"
  direct,     \* TRUE: the peer answered a sent request with a complete result
  crashes

vars == <<phase, cp, wait, cause, onTask, pc, initialSends, contSends, updateSends,
          cancelSends, records, peerTask, row, outcome, direct, crashes>>

Cps == 0..MaxCp

Init ==
  /\ phase = "initial" /\ cp = 0 /\ wait = "none" /\ cause = "none" /\ onTask = FALSE
  /\ pc = "idle" /\ initialSends = 0
  /\ contSends = [c \in Cps |-> 0] /\ updateSends = [c \in Cps |-> 0]
  /\ cancelSends = 0 /\ records = {}
  /\ peerTask = "none" /\ row = "none" /\ outcome = "none" /\ direct = FALSE
  /\ crashes = 0

Settle(o) == /\ phase' = "settled" /\ outcome' = o /\ wait' = "none" /\ cause' = "none"
             /\ pc' = "idle"

\* The call parks on a new checkpoint. Out of checkpoints it ends unknown.
Park(w, task) ==
  IF cp < MaxCp
  THEN /\ phase' = "parked" /\ cp' = cp + 1 /\ wait' = w /\ onTask' = task
       /\ cause' = "none" /\ pc' = "idle" /\ UNCHANGED outcome
  ELSE /\ Settle("unknown") /\ UNCHANGED <<cp, onTask>>

\* What the peer does with a request that carries the effect (first send or a retry).
PeerAnswers ==
  \/ /\ direct' = TRUE /\ Settle("complete") /\ UNCHANGED <<cp, onTask, peerTask, row>>
  \/ /\ Park("person", FALSE) /\ UNCHANGED <<direct, peerTask, row>>
  \/ /\ peerTask' = "working"
     /\ IF "park-before-row" \in Bugs
        THEN /\ Park("task", TRUE) /\ UNCHANGED row
        ELSE /\ row' = "following" /\ Park("task", TRUE)
     /\ UNCHANGED direct
  \/ /\ Settle("unknown") /\ UNCHANGED <<cp, onTask, direct, peerTask, row>>

FirstSegment ==
  /\ phase = "initial" /\ initialSends = 0
  /\ initialSends' = 1
  /\ PeerAnswers
  /\ UNCHANGED <<contSends, updateSends, cancelSends, records, crashes>>

\* A person answers the card: Tool takes the answer once and plans the resume segment.
PersonAnswers ==
  /\ phase = "parked" /\ wait = "person"
  /\ phase' = "resuming" /\ cause' = "answer"
  /\ UNCHANGED <<cp, wait, onTask, pc, initialSends, contSends, updateSends, cancelSends,
                 records, peerTask, row, outcome, direct, crashes>>

\* The resume segment after an answer. It records the continuation before it sends.
ResumeRecord ==
  /\ phase = "resuming" /\ cause = "answer" /\ pc = "idle"
  /\ IF cp \in records /\ "no-record" \notin Bugs
     THEN /\ Settle("unknown")
          /\ UNCHANGED <<cp, onTask, records>>
     ELSE /\ records' = records \cup {cp} /\ pc' = "recorded"
          /\ UNCHANGED <<phase, cp, wait, cause, onTask, outcome>>
  /\ UNCHANGED <<initialSends, contSends, updateSends, cancelSends, peerTask,
                 row, direct, crashes>>

\* The request goes out. Its answer is committed in a later step: the process may be
\* lost in between, and then the segment runs again from the same checkpoint.
ResumeSend ==
  /\ phase = "resuming" /\ cause = "answer" /\ pc = "recorded"
  /\ pc' = "sent"
  /\ IF onTask
     THEN updateSends' = [updateSends EXCEPT ![cp] = @ + 1] /\ UNCHANGED contSends
     ELSE contSends' = [contSends EXCEPT ![cp] = @ + 1] /\ UNCHANGED updateSends
  /\ UNCHANGED <<phase, cp, wait, cause, onTask, initialSends, cancelSends, records,
                 peerTask, row, outcome, direct, crashes>>

ResumeCommit ==
  /\ phase = "resuming" /\ cause = "answer" /\ pc = "sent"
  /\ IF onTask
     THEN /\ peerTask' = IF peerTask = "input" THEN "working" ELSE peerTask
          /\ row' = "following"
          /\ Park("task", TRUE)
          /\ UNCHANGED direct
     ELSE PeerAnswers
  /\ UNCHANGED <<initialSends, contSends, updateSends, cancelSends, records, crashes>>

\* The peer's task moves by itself.
PeerMoves ==
  /\ peerTask \in {"working", "input"}
  /\ \/ peerTask = "working" /\ peerTask' \in {"input", "terminal", "gone"}
     \/ peerTask = "input" /\ peerTask' = "gone"
  /\ UNCHANGED <<phase, cp, wait, cause, onTask, pc, initialSends, contSends, updateSends,
                 cancelSends, records, row, outcome, direct, crashes>>

\* The watcher reads the task row and asks the peer. Handing over and the row's
\* transition are one commit; a wait that is closed takes nothing and the row is dropped.
Taken == phase = "parked" /\ wait = "task"

Watch ==
  /\ row = "following" /\ peerTask # "working"
  /\ IF Taken
     THEN /\ phase' = "resuming"
          /\ cause' = IF peerTask = "input" THEN "input" ELSE "arrived"
          /\ row' = IF "mark-later" \in Bugs THEN row
                    ELSE IF peerTask = "input" THEN "awaiting" ELSE "arrived"
     ELSE /\ row' = IF phase = "settled" THEN "dropped" ELSE row
          /\ UNCHANGED <<phase, cause>>
  /\ UNCHANGED <<cp, wait, onTask, pc, initialSends, contSends, updateSends, cancelSends,
                 records, peerTask, outcome, direct, crashes>>

\* The resume segment after the watcher's answer: a read, safe to repeat.
ResumeTask ==
  /\ phase = "resuming" /\ cause \in {"arrived", "input"}
  /\ IF cause = "input"
     THEN /\ Park("person", TRUE)
     ELSE /\ Settle(IF peerTask = "terminal" \/ "complete-on-gone" \in Bugs
                    THEN "complete" ELSE "expired")
          /\ UNCHANGED <<cp, onTask>>
  /\ UNCHANGED <<initialSends, contSends, updateSends, cancelSends, records,
                 peerTask, row, direct, crashes>>

Cancel ==
  /\ phase \in {"parked", "resuming"}
  /\ Settle("cancelled")
  /\ IF row \in {"following", "awaiting"}
     THEN cancelSends' = cancelSends + 1 /\ row' = "dropped"
     ELSE UNCHANGED <<cancelSends, row>>
  /\ UNCHANGED <<cp, onTask, initialSends, contSends, updateSends, records,
                 peerTask, direct, crashes>>

\* The process is lost. Before the first checkpoint the call ends unknown; a parked call
\* loses nothing; a resume segment is planned again from the same checkpoint.
Crash ==
  /\ crashes < Crashes /\ phase # "settled"
  /\ crashes' = crashes + 1
  /\ IF phase = "initial"
     THEN /\ Settle("unknown") /\ UNCHANGED <<cp, onTask>>
     ELSE /\ pc' = "idle" /\ UNCHANGED <<phase, cp, wait, cause, onTask, outcome>>
  /\ UNCHANGED <<initialSends, contSends, updateSends, cancelSends, records,
                 peerTask, row, direct>>

Next == FirstSegment \/ PersonAnswers \/ ResumeRecord \/ ResumeSend \/ ResumeCommit
        \/ PeerMoves
        \/ Watch \/ ResumeTask \/ Cancel \/ Crash

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ phase \in {"initial", "parked", "resuming", "settled"}
  /\ cp \in Cps /\ wait \in {"none", "person", "task"}
  /\ row \in {"none", "following", "awaiting", "arrived", "dropped"}
  /\ outcome \in {"none", "complete", "unknown", "expired", "cancelled"}

\* I1: one call puts its effect to the peer at most once per step of the protocol.
I1_InitialOnce == initialSends <= 1
I1_ContinuationOnce == \A c \in Cps : contSends[c] <= 1 /\ updateSends[c] <= 1
P_CancelOnce == cancelSends <= 1
\* The row says what the call waits for: handing over and the row's move are one commit.
P_RowMatchesWait == (phase = "parked" /\ wait = "person" /\ onTask) => row = "awaiting"
\* I6: a call is complete only when the peer said so, directly or by a terminal task.
I6_CompleteIsTrue == outcome = "complete" => (direct \/ peerTask = "terminal")
\* The task row is there before the call waits for the task.
P_RowBeforePark == (phase = "parked" /\ wait = "task") => row = "following"
=============================================================================
