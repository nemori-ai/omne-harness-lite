------------------------- MODULE ExecutionSettlement -------------------------
(* When the execution record of an execution may be reclaimed.

   The Agent journal keeps the record of each execution: its events, its end and
   its finish obligations. The Session interprets the events into the session log
   and consumes the Tool deliveries of the calls it registered. Once the Session has
   received all of an execution, it acknowledges it (receivedAll,
   acknowledgeReceived). Every Agent journal commit judges the executions it touches
   (settled); the settling commit deletes the contents and keeps the tombstone and
   the operation records (reclaim, first phase). The first opening of the tenant
   domain by a new writer generation wakes the executions whose acknowledgement is
   behind and deletes the tombstones and operation records (sweep, second phase).

   Two executions, one optional Tool call each, at most MaxCrashes crashes. Each
   negative control turns on one wrong switch. *)
EXTENDS Naturals

CONSTANTS Execs,                 \* the executions of one tenant
          Callers,               \* the executions that may intend one Tool call
          MaxEvents,             \* the events an execution emits at most, its ended event included
          MaxCrashes,            \* the process crashes at most
          IgnoreConsumption,     \* negative control: receivedAll does not read the held calls
          IgnoreRunActive,       \* negative control: receivedAll does not read whether the Run goes on
          SettleShort,           \* negative control: settled does not require the last event acknowledged
          Phase1DropsOperation,  \* negative control: reclaim deletes er_operation as well
          NoPhase2,              \* negative control: the sweep deletes nothing
          NoStartupWake,         \* negative control: opening the tenant domain wakes nothing
          NoAd06Ack              \* negative control: the tool log consumption does not acknowledge

ASSUME /\ Callers \subseteq Execs
       /\ MaxEvents \in Nat /\ MaxEvents >= 2
       /\ MaxCrashes \in Nat

Gens == 1..(MaxCrashes + 1)
Seqs == 0..MaxEvents

VARIABLES
  \* Agent journal: the execution record
  emitted,      \* [Execs -> Seqs]: events emitted; after the ended event none follows
  ended,        \* [Execs -> BOOLEAN]: finish.ended is on record
  acked,        \* [Execs -> Seqs]: acknowledged through (ack.through)
  outputAt,     \* [Execs -> Seqs]: emittedThrough of the output obligation; 0 is none
  \* Tool: the call of the execution, as far as the Agent's result receiver kept it
  call,         \* [Execs -> {"none", "running", "background", "done", "lost"}]
  callAt,       \* [Execs -> Seqs]: the event that intends the call; 0 is none
  \* Session: the work snapshot of the session that holds the execution
  consumed,     \* [Execs -> Seqs]: readThrough, the interpretation progress
  run,          \* [Execs -> {"active", "end", "cancelled"}]: the Run, and who wrote its terminal
  consumption,  \* [Execs -> {"none", "held", "settled"}]: the call in snapshot.consumptions
  \* Storage
  content,      \* [Execs -> {"full", "tombstone", "none"}]
  operations,   \* [Execs -> BOOLEAN]: the er_operation rows of the execution exist
  settledGen,   \* [Execs -> 0..Max(Gens)]: the writer generation of the settling commit; 0 is none
  \* Process
  gen,          \* the current writer generation
  crashes,      \* crashes so far
  opened,       \* the current generation has opened the tenant domain
  pendingAck    \* [Execs -> BOOLEAN]: an acknowledgeReceived call waits in the process

agentVars   == <<emitted, ended, acked, outputAt>>
toolVars    == <<call, callAt>>
sessionVars == <<consumed, run, consumption>>
storeVars   == <<content, operations, settledGen>>
procVars    == <<gen, crashes, opened, pendingAck>>
vars        == <<agentVars, toolVars, sessionVars, storeVars, procVars>>

TypeOK ==
  /\ emitted \in [Execs -> Seqs] /\ ended \in [Execs -> BOOLEAN]
  /\ acked \in [Execs -> Seqs] /\ outputAt \in [Execs -> Seqs]
  /\ call \in [Execs -> {"none", "running", "background", "done", "lost"}]
  /\ callAt \in [Execs -> Seqs]
  /\ consumed \in [Execs -> Seqs] /\ run \in [Execs -> {"active", "end", "cancelled"}]
  /\ consumption \in [Execs -> {"none", "held", "settled"}]
  /\ content \in [Execs -> {"full", "tombstone", "none"}]
  /\ operations \in [Execs -> BOOLEAN] /\ settledGen \in [Execs -> {0} \cup Gens]
  /\ gen \in Gens /\ crashes \in 0..MaxCrashes /\ opened \in BOOLEAN
  /\ pendingAck \in [Execs -> BOOLEAN]

Init ==
  /\ emitted = [e \in Execs |-> 0] /\ ended = [e \in Execs |-> FALSE]
  /\ acked = [e \in Execs |-> 0] /\ outputAt = [e \in Execs |-> 0]
  /\ call = [e \in Execs |-> "none"] /\ callAt = [e \in Execs |-> 0]
  /\ consumed = [e \in Execs |-> 0] /\ run = [e \in Execs |-> "active"]
  /\ consumption = [e \in Execs |-> "none"]
  /\ content = [e \in Execs |-> "full"] /\ operations = [e \in Execs |-> TRUE]
  /\ settledGen = [e \in Execs |-> 0]
  /\ gen = 1 /\ crashes = 0 /\ opened = FALSE /\ pendingAck = [e \in Execs |-> FALSE]

(* An event before the end leaves room for the ended event. *)
Room(e) == emitted[e] + 1 < MaxEvents

(* The Agent journal answers terminal once the contents are reclaimed, and denied once swept. *)
Live(e) == opened /\ content[e] = "full"

(* settled in session-adapters/src/journal/items.ts, over the values this commit leaves.
   The finish obligations of the model: the output obligation, settled by an
   acknowledgement through its emittedThrough; the call obligation, settled once the
   result receiver kept the first delivery of the call (callObligations). *)
Settled(e) ==
  /\ ended'[e]
  /\ (SettleShort \/ acked'[e] >= emitted'[e])
  /\ acked'[e] >= outputAt'[e]
  /\ call'[e] # "running"

(* Each Agent journal commit judges the execution it touches. The settling commit
   reclaims in the same transaction (reclaim in session-storage-sql's
   execution-record.ts): the contents leave, er_execution stays as a tombstone marked
   with the settling publication, er_operation stays. *)
Commit(e) ==
  IF content[e] = "full" /\ Settled(e)
    THEN /\ content' = [content EXCEPT ![e] = "tombstone"]
         /\ operations' = IF Phase1DropsOperation THEN [operations EXCEPT ![e] = FALSE]
                          ELSE operations
         /\ settledGen' = [settledGen EXCEPT ![e] = gen]
    ELSE UNCHANGED storeVars

(* ---------------------------------- Agent ---------------------------------- *)

AgentStep(e) ==
  /\ Live(e) /\ ~ended[e] /\ emitted[e] = 0 /\ Room(e)
  /\ emitted' = [emitted EXCEPT ![e] = 1]
  /\ UNCHANGED <<ended, acked, outputAt, toolVars, sessionVars, procVars>>
  /\ Commit(e)

AgentCall(e) ==
  /\ Live(e) /\ ~ended[e] /\ e \in Callers /\ call[e] = "none" /\ Room(e)
  /\ emitted' = [emitted EXCEPT ![e] = @ + 1]
  /\ callAt' = [callAt EXCEPT ![e] = emitted[e] + 1]
  /\ call' = [call EXCEPT ![e] = "running"]
  /\ UNCHANGED <<ended, acked, outputAt, sessionVars, procVars>>
  /\ Commit(e)

(* The finish list is issued before the ended event: its output obligation covers the
   events emitted so far. The end appends the ended event. *)
AgentEnd(e) ==
  /\ Live(e) /\ ~ended[e]
  /\ outputAt' = [outputAt EXCEPT ![e] = emitted[e]]
  /\ emitted' = [emitted EXCEPT ![e] = @ + 1]
  /\ ended' = [ended EXCEPT ![e] = TRUE]
  /\ UNCHANGED <<acked, toolVars, sessionVars, procVars>>
  /\ Commit(e)

(* ----------------------------------- Tool ---------------------------------- *)

(* The Tool pushes a delivery to the original consumption position; the Agent's result
   receiver keeps it as an entry. Before the end the entry is also an event; after the
   end it is kept only. A reclaimed or swept record refuses it. *)
Deliver(e, next) ==
  IF content[e] = "full"
    THEN /\ call' = [call EXCEPT ![e] = next]
         /\ emitted' = IF ended[e] THEN emitted ELSE [emitted EXCEPT ![e] = @ + 1]
         /\ UNCHANGED <<ended, acked, outputAt, callAt, sessionVars, procVars>>
         /\ Commit(e)
    ELSE /\ call' = [call EXCEPT ![e] = "lost"]
         /\ UNCHANGED <<agentVars, callAt, sessionVars, storeVars, procVars>>

(* The call goes to the background: its placeholder is the first delivery. *)
Placeholder(e) ==
  /\ opened /\ content[e] = "full" /\ call[e] = "running" /\ (ended[e] \/ Room(e))
  /\ Deliver(e, "background")

(* The final result, at any time after the call. *)
Final(e) ==
  /\ opened /\ call[e] \in {"running", "background"}
  /\ (content[e] # "full" \/ ended[e] \/ Room(e))
  /\ Deliver(e, "done")

(* ---------------------------------- Session -------------------------------- *)

(* The Session decides the terminal itself (a cancelled Run): its end is empty. *)
SessionCancel(e) ==
  /\ opened /\ run[e] = "active"
  /\ run' = [run EXCEPT ![e] = "cancelled"]
  /\ UNCHANGED <<agentVars, toolVars, consumed, consumption, storeVars, procVars>>

(* AD-02 interprets the next event. The intent of the call registers it; the ended
   event writes the terminal with the end summary in the same commit, unless the
   Session already wrote a terminal. Every successful interpretation is followed by
   acknowledgeReceived. *)
Interpret(e) ==
  /\ Live(e) /\ consumed[e] < emitted[e]
  /\ consumed' = [consumed EXCEPT ![e] = @ + 1]
  /\ consumption' = IF consumed[e] + 1 = callAt[e] THEN [consumption EXCEPT ![e] = "held"]
                    ELSE consumption
  /\ run' = IF ended[e] /\ consumed[e] + 1 = emitted[e] /\ run[e] = "active"
              THEN [run EXCEPT ![e] = "end"] ELSE run
  /\ pendingAck' = [pendingAck EXCEPT ![e] = TRUE]
  /\ UNCHANGED <<agentVars, toolVars, storeVars, gen, crashes, opened>>

(* AD-06 writes the final result into the session log and records the call settled in
   the same commit; acknowledgingCommitted then calls acknowledgeReceived. *)
Ad06(e) ==
  /\ Live(e) /\ call[e] = "done" /\ consumption[e] = "held"
  /\ consumption' = [consumption EXCEPT ![e] = "settled"]
  /\ pendingAck' = IF NoAd06Ack THEN pendingAck ELSE [pendingAck EXCEPT ![e] = TRUE]
  /\ UNCHANGED <<agentVars, toolVars, consumed, run, storeVars, gen, crashes, opened>>

(* receivedAll in session-adapters/src/cordis/received-all.ts. The work snapshot sets
   the Run terminal and the execution's terminal in one entry, so one variable holds
   both. *)
ReceivedAll(e) ==
  /\ (IgnoreRunActive \/ run[e] # "active")
  /\ (IgnoreConsumption \/ consumption[e] # "held")

(* acknowledgeReceived: once the Session received all, and the last emitted event is
   its consumption position, and the acknowledgement is not there yet, acknowledge
   through that position. A failed or refused attempt leaves no work behind. *)
Ack(e) ==
  /\ opened /\ pendingAck[e]
  /\ pendingAck' = [pendingAck EXCEPT ![e] = FALSE]
  /\ IF ReceivedAll(e) /\ content[e] = "full" /\ emitted[e] = consumed[e] /\ acked[e] < consumed[e]
       THEN /\ acked' = [acked EXCEPT ![e] = consumed[e]]
            /\ UNCHANGED <<emitted, ended, outputAt, toolVars, sessionVars, gen, crashes, opened>>
            /\ Commit(e)
       ELSE UNCHANGED <<agentVars, toolVars, sessionVars, storeVars, gen, crashes, opened>>

(* ---------------------------------- Process -------------------------------- *)

(* A crash loses everything in the process: the waiting acknowledgements. *)
Crash ==
  /\ crashes < MaxCrashes
  /\ gen' = gen + 1 /\ crashes' = crashes + 1 /\ opened' = FALSE
  /\ pendingAck' = [e \in Execs |-> FALSE]
  /\ UNCHANGED <<agentVars, toolVars, sessionVars, storeVars>>

(* createTenantSweep: the first opening of the tenant domain in a generation wakes the
   ended executions whose acknowledgement is behind the last event, then deletes the
   tombstones and er_operation of the settled executions. Every other step of the
   generation waits for it. *)
Waiting(e) == ended[e] /\ content[e] = "full" /\ acked[e] < emitted[e]
Swept(e) == content[e] = "tombstone" /\ ~NoPhase2

OpenTenant ==
  /\ ~opened
  /\ opened' = TRUE
  /\ pendingAck' = [e \in Execs |-> pendingAck[e] \/ (~NoStartupWake /\ Waiting(e))]
  /\ content' = [e \in Execs |-> IF Swept(e) THEN "none" ELSE content[e]]
  /\ operations' = [e \in Execs |-> IF Swept(e) THEN FALSE ELSE operations[e]]
  /\ UNCHANGED <<agentVars, toolVars, sessionVars, settledGen, gen, crashes>>

Next ==
  \/ OpenTenant \/ Crash
  \/ \E e \in Execs :
       \/ AgentStep(e) \/ AgentCall(e) \/ AgentEnd(e)
       \/ Placeholder(e) \/ Final(e)
       \/ SessionCancel(e) \/ Interpret(e) \/ Ad06(e) \/ Ack(e)

Fairness ==
  /\ WF_vars(OpenTenant)
  /\ \A e \in Execs : /\ WF_vars(Interpret(e)) /\ WF_vars(Ad06(e))
                      /\ WF_vars(Ack(e)) /\ WF_vars(Final(e))

Spec == Init /\ [][Next]_vars /\ Fairness

(* -------------------------------- Properties ------------------------------- *)

Reclaimed(e) == content[e] # "full"

(* The Session consumed every event the execution emitted. *)
NoLostEvent == \A e \in Execs : Reclaimed(e) => consumed[e] = emitted[e]

(* The result of the call is in the session log. *)
NoLostLateResult ==
  \A e \in Execs : Reclaimed(e) /\ call[e] # "none" => consumption[e] = "settled"

(* The terminal entry is in the session log: written by the interpretation with the end
   summary, or written by the Session itself, whose end is empty by rule. *)
SummaryBeforeReclaim == \A e \in Execs : Reclaimed(e) => run[e] # "active"

(* The acknowledgement moves only once the Session received all, and only to the
   consumption position. *)
AckOnlyReceivedAll ==
  [][\A e \in Execs :
       acked'[e] # acked[e] =>
         /\ run[e] # "active" /\ consumption[e] # "held"
         /\ acked'[e] = consumed[e]]_vars

(* After the contents leave, the events, their consumption and the acknowledgement stay. *)
FrozenAfterReclaim ==
  [][\A e \in Execs :
       Reclaimed(e) =>
         emitted'[e] = emitted[e] /\ consumed'[e] = consumed[e] /\ acked'[e] = acked[e]]_vars

(* The tombstone leaves only in a later generation than the settling one. *)
TwoPhase == \A e \in Execs : content[e] = "none" => settledGen[e] < gen

(* The writer recognizes an operation it sent by er_operation (recordedStanding). *)
Recognized(e) == IF operations[e] THEN "committed" ELSE "not-run"

(* An operation the writer of this generation sent on a settled execution is still
   recognized as committed, as before the reclaim. *)
AnswerStable == \A e \in Execs : settledGen[e] = gen => Recognized(e) = "committed"

EventuallyReclaimed == \A e \in Execs : ended[e] ~> Reclaimed(e)

BoundedRetention ==
  \A e \in Execs : (content[e] = "tombstone" /\ gen > settledGen[e]) ~> content[e] = "none"
=============================================================================
