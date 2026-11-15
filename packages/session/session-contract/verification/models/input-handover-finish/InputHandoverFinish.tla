---------------------------- MODULE InputHandoverFinish ----------------------------
(* Input handover against conditional finish, for one Run of one session.               *)
(*                                                                                       *)
(* Session accepts ordinary inputs whose route is this Run (SE11) while the Run is      *)
(* active. The continuation submits each one to the execution (Agent `submit`); the     *)
(* Session participant checks in the same commit that the input is still pending and    *)
(* routed here (PA-01 item 2). Session then writes the handover receipt (SE35). The     *)
(* Agent takes the inputs within its watermark at a step boundary (I0, `input-taken`);  *)
(* Session interprets that as SE14 and the input is no longer pending. A submit that    *)
(* admission rejects is recorded as a rejection (PA-09). The conditional finish         *)
(* (`tryFinish`) commits only when both checks hold in one commit: the Agent's own      *)
(* (every input within the watermark is taken) and the Session participant's (no input  *)
(* pending here without SE35, PA-02). After the Agent ended, a submit answers terminal  *)
(* (PA-03); once Session sees the end, the inputs still pending move to the next Run.   *)
(*                                                                                       *)
(* `Bug` drops one design rule; "none" is the design.                                   *)
EXTENDS FiniteSets

CONSTANTS Inputs, Bug

ASSUME Bug \in {"none", "no-participant", "no-agent-check"}

VARIABLES
  arrived,    \* inputs Session accepted for this Run (SE11)
  pending,    \* inputs still pending here: accepted, neither taken (SE14) nor rejected
  handed,     \* inputs with a handover receipt (SE35)
  journal,    \* inputs the execution accepted (within the Agent's watermark)
  taken,      \* inputs the Agent took at a step boundary (input-taken)
  rejected,   \* inputs admission rejected; the user sees the reason
  next,       \* inputs moved to the next Run after Session saw the end
  ended,      \* the Agent committed its terminal (tryFinish)
  seen,       \* Session interpreted the end; the Run is terminal
  atEnd       \* the inputs that had arrived when tryFinish committed

vars == <<arrived, pending, handed, journal, taken, rejected, next, ended, seen, atEnd>>

TypeOK ==
  /\ arrived \subseteq Inputs /\ pending \subseteq Inputs /\ handed \subseteq Inputs
  /\ journal \subseteq Inputs /\ taken \subseteq Inputs /\ rejected \subseteq Inputs
  /\ next \subseteq Inputs /\ atEnd \subseteq Inputs
  /\ ended \in BOOLEAN /\ seen \in BOOLEAN

Init ==
  /\ arrived = {} /\ pending = {} /\ handed = {} /\ journal = {} /\ taken = {}
  /\ rejected = {} /\ next = {} /\ ended = FALSE /\ seen = FALSE /\ atEnd = {}

(* SE11: accepted while the Run is not terminal; the route is this Run (PA-03).         *)
Accept(i) ==
  /\ ~seen /\ i \notin arrived
  /\ arrived' = arrived \cup {i}
  /\ pending' = pending \cup {i}
  /\ UNCHANGED <<handed, journal, taken, rejected, next, ended, seen, atEnd>>

(* Agent `submit`, accepted: the participant checks that i is pending here (PA-01 2).   *)
(* After the end the answer is terminal and nothing changes, so it is not an action.    *)
Submit(i) ==
  /\ ~ended /\ i \in pending /\ i \notin journal
  /\ journal' = journal \cup {i}
  /\ UNCHANGED <<arrived, pending, handed, taken, rejected, next, ended, seen, atEnd>>

(* SE35 after an accepted submit; the reducer needs the input still pending.            *)
Receipt(i) ==
  /\ i \in journal /\ i \in pending /\ i \notin handed
  /\ handed' = handed \cup {i}
  /\ UNCHANGED <<arrived, pending, journal, taken, rejected, next, ended, seen, atEnd>>

(* Admission rejects the submit: `invalid`, Session writes SE35 with the rejection.     *)
Reject(i) ==
  /\ ~ended /\ i \in pending /\ i \notin journal
  /\ rejected' = rejected \cup {i}
  /\ pending' = pending \ {i}
  /\ UNCHANGED <<arrived, handed, journal, taken, next, ended, seen, atEnd>>

(* I0: the batch is every input within the watermark that is not taken yet.            *)
Take ==
  /\ ~ended /\ journal \ taken # {}
  /\ taken' = taken \cup journal
  /\ UNCHANGED <<arrived, pending, handed, journal, rejected, next, ended, seen, atEnd>>

(* Session interprets input-taken as SE14: the input is no longer pending.              *)
Interpret(i) ==
  /\ i \in taken /\ i \in pending
  /\ pending' = pending \ {i}
  /\ UNCHANGED <<arrived, handed, journal, taken, rejected, next, ended, seen, atEnd>>

AgentAllows == Bug = "no-agent-check" \/ journal \subseteq taken
ParticipantAllows == Bug = "no-participant" \/ pending \subseteq handed

TryFinish ==
  /\ ~ended /\ AgentAllows /\ ParticipantAllows
  /\ ended' = TRUE
  /\ atEnd' = arrived
  /\ UNCHANGED <<arrived, pending, handed, journal, taken, rejected, next, seen>>

(* Session interprets the end: the Run is terminal and the still pending inputs go on. *)
SeeEnd ==
  /\ ended /\ ~seen
  /\ seen' = TRUE
  /\ next' = pending \ taken
  /\ pending' = pending \cap taken
  /\ UNCHANGED <<arrived, handed, journal, taken, rejected, ended, atEnd>>

Next ==
  \/ \E i \in Inputs : Accept(i) \/ Submit(i) \/ Receipt(i) \/ Reject(i) \/ Interpret(i)
  \/ Take \/ TryFinish \/ SeeEnd

Spec == Init /\ [][Next]_vars

(* Property 2 of #1197: the Run does not end with an input routed to it that was        *)
(* neither taken nor rejected.                                                          *)
EndedClean == ended => atEnd \subseteq taken \cup rejected

(* Each input has at most one outcome: taken, rejected or moved to the next Run.        *)
OneOutcome ==
  /\ taken \cap rejected = {}
  /\ next \cap (taken \cup rejected) = {}
=====================================================================================
