--------------------------- MODULE RecallOwnRecord ---------------------------
(* Calls of one operation whose identity is declared recall 'never': the storage
   keeps no receipt. The participant keeps its own record of the operation and
   writes it in the same transaction as the effect, so it recognises the
   operation by that record. A sent commit can run later than its caller's
   answer is lost. After a lost answer the caller asks the storage, which knows
   only whether a commit of the identity is still in flight; when none is, the
   caller reads its own record. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Calls,        \* the calls of the operation: retries, also of another process
          OwnFirst,     \* negative control: the caller reads its record before the storage settles
          NoDedupe      \* negative control: the participant writes again over its own record

VARIABLES record,      \* BOOLEAN: the participant's record of the operation exists
          effects,     \* how many times the write took effect
          inflight,    \* [Calls -> BOOLEAN]: a commit of this call can still run
          phase,       \* [Calls -> {"idle", "sent", "lost", "seen", "done"}]
          seen,        \* [Calls -> BOOLEAN]: what the caller read from its record (OwnFirst only)
          belief,      \* [Calls -> {"none", "own", "recalled", "rolled_back"}]
          ran,         \* [Calls -> BOOLEAN]: whether the execution of this call did the write
          falseAbsent  \* history: some caller concluded "not committed" while the write had taken effect

vars == <<record, effects, inflight, phase, seen, belief, ran, falseAbsent>>

Init == /\ record = FALSE /\ effects = 0
        /\ inflight = [c \in Calls |-> FALSE] /\ phase = [c \in Calls |-> "idle"]
        /\ seen = [c \in Calls |-> FALSE] /\ belief = [c \in Calls |-> "none"]
        /\ ran = [c \in Calls |-> FALSE] /\ falseAbsent = FALSE

Send(c) == /\ phase[c] = "idle" /\ ~inflight[c]
           /\ phase' = [phase EXCEPT ![c] = "sent"]
           /\ inflight' = [inflight EXCEPT ![c] = TRUE]
           /\ UNCHANGED <<record, effects, seen, belief, ran, falseAbsent>>

(* The caller stops waiting; its commit may still run. *)
Lose(c) == /\ phase[c] = "sent"
           /\ phase' = [phase EXCEPT ![c] = "lost"]
           /\ UNCHANGED <<record, effects, inflight, seen, belief, ran, falseAbsent>>

(* The commit never runs: refused before execution, or the writer generation ended. *)
Drop(c) == /\ inflight[c]
           /\ inflight' = [inflight EXCEPT ![c] = FALSE]
           /\ phase' = IF phase[c] = "sent" THEN [phase EXCEPT ![c] = "lost"] ELSE phase
           /\ UNCHANGED <<record, effects, seen, belief, ran, falseAbsent>>

(* The participant runs the commit of `c`. The answer reaches the caller only while it waits. *)
Run(c) ==
  /\ inflight[c]
  /\ inflight' = [inflight EXCEPT ![c] = FALSE]
  /\ IF record /\ ~NoDedupe
       THEN \* recognised by its own record: nothing is written
            /\ UNCHANGED <<record, effects, ran>>
            /\ IF phase[c] = "sent"
                 THEN /\ belief' = [belief EXCEPT ![c] = "recalled"]
                      /\ phase' = [phase EXCEPT ![c] = "done"]
                 ELSE UNCHANGED <<belief, phase>>
       ELSE \E outcome \in {"committed", "rolled_back"} :
            /\ record' = (record \/ outcome = "committed")
            /\ effects' = IF outcome = "committed" THEN effects + 1 ELSE effects
            /\ ran' = [ran EXCEPT ![c] = @ \/ outcome = "committed"]
            /\ IF phase[c] = "sent"
                 THEN /\ belief' = [belief EXCEPT ![c] = IF outcome = "committed" THEN "own" ELSE "rolled_back"]
                      /\ phase' = [phase EXCEPT ![c] = "done"]
                 ELSE UNCHANGED <<belief, phase>>
  /\ UNCHANGED <<seen, falseAbsent>>

Settled == \A d \in Calls : ~inflight[d]

(* What the caller concludes from its record once the storage says nothing is in flight. *)
Conclude(c, exists) ==
  IF exists
    THEN /\ belief' = [belief EXCEPT ![c] = "recalled"] /\ phase' = [phase EXCEPT ![c] = "done"]
         /\ UNCHANGED falseAbsent
    ELSE /\ phase' = [phase EXCEPT ![c] = "idle"] /\ UNCHANGED belief
         /\ falseAbsent' = (falseAbsent \/ effects > 0)

(* The order of the specification: the storage settles first, then the caller reads its record. *)
Query(c) == /\ phase[c] = "lost" /\ ~OwnFirst /\ Settled
            /\ Conclude(c, record)
            /\ UNCHANGED <<record, effects, inflight, seen, ran>>

(* The wrong order: read the record, then ask the storage. *)
ReadFirst(c) == /\ phase[c] = "lost" /\ OwnFirst
                /\ seen' = [seen EXCEPT ![c] = record] /\ phase' = [phase EXCEPT ![c] = "seen"]
                /\ UNCHANGED <<record, effects, inflight, belief, ran, falseAbsent>>
QueryAfter(c) == /\ phase[c] = "seen" /\ Settled
                 /\ Conclude(c, seen[c])
                 /\ UNCHANGED <<record, effects, inflight, seen, ran>>

(* Every call has its outcome: the only state allowed to stop. Any other stop is a deadlock. *)
Finished == /\ \A c \in Calls : phase[c] = "done"
            /\ UNCHANGED vars

Next == \/ \E c \in Calls : \/ Send(c) \/ Lose(c) \/ Drop(c) \/ Run(c)
                            \/ Query(c) \/ ReadFirst(c) \/ QueryAfter(c)
        \/ Finished
Spec == Init /\ [][Next]_vars

(* The write of the operation takes effect at most once, over all calls and retries. *)
AtMostOnce == effects <= 1

(* A caller that takes the write for its own did it. *)
OwnIsOwn == \A c \in Calls : belief[c] = "own" => ran[c]

(* A caller that concludes "not committed" is right: the write had not taken effect. *)
AbsentIsTrue == ~falseAbsent
=============================================================================
