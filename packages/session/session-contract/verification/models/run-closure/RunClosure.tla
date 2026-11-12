----------------------------- MODULE RunClosure -----------------------------
(* One session, its Runs one after another, and the tool calls of the assistant messages.

   The model request of a Run reads the history of the session. A provider takes a history only
   when every tool call has a tool message. A call is open from the assistant message that wrote
   it until a tool message answers it. Two facts answer a call:
     its own outcome   the loop of the Run hands the tool message over while the Run is active;
     the end of its Run  the commit that writes the terminal of the Run writes the tool message.

   Session owns the terminal of a Run. A cancellation ends the Run in the commit that accepts the
   control (PM-13), before the execution has wound down, and a terminal Run takes no message. So
   the loop cannot answer a call after the terminal: the terminal commit has to.

   Each `Bug` value removes one rule of the design. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Calls, MaxRuns, Bug

VARIABLES
  run,       \* the ordinal of the current Run
  state,     \* "active" or "terminal": the current Run
  owner,     \* owner[c]: the Run whose assistant message wrote call c; 0 when not written yet
  answers,   \* answers[c]: how many tool messages name call c
  closed,    \* closed[c]: the tool message of c was written by the terminal commit
  requested, \* requested[r]: Run r issued a model request and waits for its assistant message
  refused    \* a model request read a history with an open call: the provider refuses it

vars == <<run, state, owner, answers, closed, requested, refused>>

Runs == 1..MaxRuns
Open(c) == owner[c] # 0 /\ answers[c] = 0

TypeOK ==
  /\ run \in Runs
  /\ state \in {"active", "terminal"}
  /\ owner \in [Calls -> 0..MaxRuns]
  /\ answers \in [Calls -> 0..2]
  /\ closed \in [Calls -> BOOLEAN]
  /\ requested \in [Runs -> BOOLEAN]
  /\ refused \in BOOLEAN

Init ==
  /\ run = 1 /\ state = "active"
  /\ owner = [c \in Calls |-> 0]
  /\ answers = [c \in Calls |-> 0]
  /\ closed = [c \in Calls |-> FALSE]
  /\ requested = [r \in Runs |-> FALSE]
  /\ refused = FALSE

(* The model request of the active Run. The loop issues it only when its own batch is closed; the
   calls that an earlier Run left open are not its batch. *)
Request ==
  /\ state = "active"
  /\ \A c \in Calls: owner[c] = run => ~Open(c)
  /\ requested' = [requested EXCEPT ![run] = TRUE]
  /\ refused' = (refused \/ \E c \in Calls: Open(c))
  /\ UNCHANGED <<run, state, owner, answers, closed>>

(* The assistant message of the active Run writes call c. *)
Assistant(c) ==
  /\ state = "active" /\ requested[run] /\ owner[c] = 0
  /\ owner' = [owner EXCEPT ![c] = run]
  /\ requested' = [requested EXCEPT ![run] = FALSE]
  /\ UNCHANGED <<run, state, answers, closed, refused>>

(* The loop hands over the tool message of call c. Session takes it only while the Run that wrote
   c is the active Run. *)
Answer(c) ==
  /\ owner[c] # 0 /\ answers[c] < 2
  /\ \/ (state = "active" /\ owner[c] = run /\ Open(c))
     \/ (Bug = "late-accept" /\ ~(state = "active" /\ owner[c] = run))
  /\ answers' = [answers EXCEPT ![c] = @ + 1]
  /\ UNCHANGED <<run, state, owner, closed, requested, refused>>

(* The commit that ends the active Run: cancel, archive, the finish of the execution, or the
   bounded failure. It answers every call that is still open, then writes the terminal. *)
Terminal ==
  /\ state = "active"
  /\ state' = "terminal"
  /\ IF Bug = "no-closure"
       THEN UNCHANGED <<answers, closed>>
       ELSE /\ answers' = [c \in Calls |-> IF Open(c) THEN 1 ELSE answers[c]]
            /\ closed' = [c \in Calls |-> closed[c] \/ Open(c)]
  /\ UNCHANGED <<run, owner, requested, refused>>

StartNext ==
  /\ state = "terminal" /\ run < MaxRuns
  /\ run' = run + 1 /\ state' = "active"
  /\ UNCHANGED <<owner, answers, closed, requested, refused>>

Next ==
  \/ Request \/ Terminal \/ StartNext
  \/ \E c \in Calls: Assistant(c) \/ Answer(c)

Spec == Init /\ [][Next]_vars

(* I-A: a terminal Run has no open call. *)
TerminalClosed ==
  \A c \in Calls: (Open(c) => (state = "active" /\ owner[c] = run))

(* Every call has at most one tool message. *)
OneAnswer == \A c \in Calls: answers[c] <= 1

(* The history that a model request reads has a tool message for every call. *)
RequestReadsWholeHistory == ~refused

(* The terminal commit answers a call only in place of an outcome that did not arrive. *)
ClosedInPlaceOfOutcome == \A c \in Calls: closed[c] => answers[c] >= 1
=============================================================================
