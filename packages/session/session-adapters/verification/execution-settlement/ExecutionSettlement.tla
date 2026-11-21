------------------------- MODULE ExecutionSettlement -------------------------
(* When the execution record of an execution may be reclaimed.

   The Agent journal keeps the record of each execution: its events, its end and
   its finish obligations. The Session interprets the events into the session log
   (AD-02) and consumes the deliveries of the calls it registered: the entries
   consumption of the callee (AD-06 for Tool, AD-05 for Model; Ad06 below stands for
   either). The two consumptions wake each other after each commit. An event that
   processes a delivery is interpreted only after the entries consumption wrote that
   delivery. Once the Session has received all of an execution, it acknowledges it
   (receivedAll, acknowledgeReceived); a call is no longer open once its final delivery
   is in the session log (callOpen). Every Agent journal commit judges the executions it touches (settled);
   the settling commit deletes the contents and keeps the tombstone and the operation
   records (reclaim, first phase). The first opening of the tenant domain by a new
   writer generation wakes the executions whose acknowledgement is behind and deletes
   the tombstones and operation records that an earlier writer generation settled
   (sweep, second phase). A sweep that does not finish runs again at a later opening
   in the same generation; the commits of the generation do not wait for it.

   Two executions: one in Callers intends a call, which goes to the background with a
   placeholder (a Tool call) or delivers its final result first (a Model call, a
   foreground Tool call); the other emits only its ended event. The intent is an event of
   its own, or the call is issued with no event and the event that processes its first
   kept delivery also registers it; then the interpretation commits the binding first,
   without moving its position, and the rest of the event once the delivery is written. At most MaxCrashes crashes and MaxSweepFails
   unfinished sweeps. Each negative control turns on one wrong switch. *)
EXTENDS Naturals

CONSTANTS Execs,                 \* the executions of one tenant
          Callers,               \* the executions that may intend one Tool call
          MaxEvents,             \* the events an execution emits at most, its ended event included
          MaxCrashes,            \* the process crashes at most
          MaxSweepFails,         \* the sweeps that do not finish, at most
          IgnoreConsumption,     \* negative control: receivedAll does not read the open calls
          IgnoreRunActive,       \* negative control: receivedAll does not read whether the Run goes on
          SettleShort,           \* negative control: settled does not require the last event acknowledged
          Phase1DropsOperation,  \* negative control: reclaim deletes er_operation as well
          NoPhase2,              \* negative control: the sweep deletes nothing
          SweepAnyGeneration,    \* negative control: the sweep deletes what any generation settled
          NoStartupWake,         \* negative control: opening the tenant domain wakes nothing
          NoAd06Ack,             \* the tool log consumption does not acknowledge
          InterpretOvertakes,    \* negative control: AD-02 interprets a processing before AD-06 wrote the delivery
          Ad06AgentWakeOnly,     \* negative control: only a write of the Agent records wakes AD-06
          OpenAwaitsProcessing,  \* negative control: a backgrounded call stays open until its placeholder was processed
          AtomicEventAwaits      \* negative control: an event that registers the call it processes waits whole for the delivery

ASSUME /\ Callers \subseteq Execs
       /\ MaxEvents \in Nat /\ MaxEvents >= 2
       /\ MaxCrashes \in Nat /\ MaxSweepFails \in Nat

Gens == 1..(MaxCrashes + 1)
Seqs == 0..MaxEvents

VARIABLES
  \* Agent journal: the execution record
  emitted,      \* [Execs -> Seqs]: events emitted; after the ended event none follows
  ended,        \* [Execs -> BOOLEAN]: finish.ended is on record
  acked,        \* [Execs -> Seqs]: acknowledged through (ack.through)
  outputAt,     \* [Execs -> Seqs]: emittedThrough of the output obligation; 0 is none
  procAt,       \* [Execs -> Seqs]: the event that processes the placeholder; 0 is none
  \* Tool: the call of the execution, as far as the Agent's result receiver kept it
  call,         \* [Execs -> {"none", "running", "background", "done", "lost"}]
  callAt,       \* [Execs -> Seqs]: the event that intends the call; 0 is none
  \* Session: the work snapshot of the session that holds the execution
  consumed,     \* [Execs -> Seqs]: readThrough, the interpretation progress
  run,          \* [Execs -> {"active", "end", "cancelled"}]: the Run, and who wrote its terminal
  consumption,  \* [Execs -> {"none", "bound", "background", "settled", "answered"}]: the call
  processed,    \* [Execs -> BOOLEAN]: the Session interpreted the processing of the placeholder
  \* Storage
  content,      \* [Execs -> {"full", "tombstone", "none"}]
  operations,   \* [Execs -> BOOLEAN]: the er_operation rows of the execution exist
  settledGen,   \* [Execs -> 0..Max(Gens)]: the writer generation of the settling commit; 0 is none
  \* Process: wakes and attempts held in memory
  twake,        \* [Execs -> BOOLEAN]: a wake of the tool log consumption waits
  iwake,        \* [Execs -> BOOLEAN]: a wake of the journal interpretation waits
  stalled,      \* [Execs -> BOOLEAN]: the interpretation stopped before a processing, for its delivery
  pendingAck,   \* [Execs -> BOOLEAN]: an acknowledgeReceived call waits
  gen,          \* the current writer generation
  crashes,      \* crashes so far
  opened,       \* the current generation has opened the tenant domain
  swept,        \* the sweep of the current generation finished
  sweepFails    \* sweeps that did not finish so far

agentVars   == <<emitted, ended, acked, outputAt, procAt>>
toolVars    == <<call, callAt>>
sessionVars == <<consumed, run, consumption, processed>>
storeVars   == <<content, operations, settledGen>>
wakeVars    == <<twake, iwake, stalled, pendingAck>>
procVars    == <<gen, crashes, opened, swept, sweepFails>>
vars        == <<agentVars, toolVars, sessionVars, storeVars, wakeVars, procVars>>

TypeOK ==
  /\ emitted \in [Execs -> Seqs] /\ ended \in [Execs -> BOOLEAN]
  /\ acked \in [Execs -> Seqs] /\ outputAt \in [Execs -> Seqs] /\ procAt \in [Execs -> Seqs]
  /\ call \in [Execs -> {"none", "running", "background", "done", "lost"}]
  /\ callAt \in [Execs -> Seqs]
  /\ consumed \in [Execs -> Seqs] /\ run \in [Execs -> {"active", "end", "cancelled"}]
  /\ consumption \in [Execs -> {"none", "bound", "background", "settled", "answered"}]
  /\ processed \in [Execs -> BOOLEAN]
  /\ content \in [Execs -> {"full", "tombstone", "none"}]
  /\ operations \in [Execs -> BOOLEAN] /\ settledGen \in [Execs -> {0} \cup Gens]
  /\ twake \in [Execs -> BOOLEAN] /\ iwake \in [Execs -> BOOLEAN]
  /\ stalled \in [Execs -> BOOLEAN] /\ pendingAck \in [Execs -> BOOLEAN]
  /\ gen \in Gens /\ crashes \in 0..MaxCrashes /\ opened \in BOOLEAN
  /\ swept \in BOOLEAN /\ sweepFails \in 0..MaxSweepFails

Init ==
  /\ emitted = [e \in Execs |-> 0] /\ ended = [e \in Execs |-> FALSE]
  /\ acked = [e \in Execs |-> 0] /\ outputAt = [e \in Execs |-> 0]
  /\ procAt = [e \in Execs |-> 0]
  /\ call = [e \in Execs |-> "none"] /\ callAt = [e \in Execs |-> 0]
  /\ consumed = [e \in Execs |-> 0] /\ run = [e \in Execs |-> "active"]
  /\ consumption = [e \in Execs |-> "none"] /\ processed = [e \in Execs |-> FALSE]
  /\ content = [e \in Execs |-> "full"] /\ operations = [e \in Execs |-> TRUE]
  /\ settledGen = [e \in Execs |-> 0]
  /\ twake = [e \in Execs |-> FALSE] /\ iwake = [e \in Execs |-> FALSE]
  /\ stalled = [e \in Execs |-> FALSE] /\ pendingAck = [e \in Execs |-> FALSE]
  /\ gen = 1 /\ crashes = 0 /\ opened = FALSE /\ swept = FALSE /\ sweepFails = 0

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
   with the settling writer generation, er_operation stays. *)
Commit(e) ==
  IF content[e] = "full" /\ Settled(e)
    THEN /\ content' = [content EXCEPT ![e] = "tombstone"]
         /\ operations' = IF Phase1DropsOperation THEN [operations EXCEPT ![e] = FALSE]
                          ELSE operations
         /\ settledGen' = [settledGen EXCEPT ![e] = gen]
    ELSE UNCHANGED storeVars

(* Each successful write of the Agent records announces it: both consumptions wake. *)
Published(e) ==
  /\ twake' = [twake EXCEPT ![e] = TRUE]
  /\ iwake' = [iwake EXCEPT ![e] = TRUE]
  /\ UNCHANGED <<stalled, pendingAck>>

(* ---------------------------------- Agent ---------------------------------- *)

AgentCall(e) ==
  /\ Live(e) /\ ~ended[e] /\ e \in Callers /\ call[e] = "none" /\ Room(e)
  /\ emitted' = [emitted EXCEPT ![e] = @ + 1]
  /\ callAt' = [callAt EXCEPT ![e] = emitted[e] + 1]
  /\ call' = [call EXCEPT ![e] = "running"]
  /\ UNCHANGED <<ended, acked, outputAt, procAt, sessionVars, procVars>>
  /\ Published(e)
  /\ Commit(e)

(* The Agent issues the call with no event: the call is named first by the event that
   processes its first kept delivery. *)
AgentIssue(e) ==
  /\ Live(e) /\ ~ended[e] /\ e \in Callers /\ call[e] = "none"
  /\ call' = [call EXCEPT ![e] = "running"]
  /\ UNCHANGED <<agentVars, callAt, sessionVars, storeVars, wakeVars, procVars>>

(* The Agent processes the placeholder it kept: the placeholder becomes the call's result
   in the history of the Run. An event that processes a call no event named yet also
   registers it. *)
Process(e) ==
  /\ Live(e) /\ ~ended[e] /\ call[e] \in {"background", "done"} /\ procAt[e] = 0 /\ Room(e)
  /\ emitted' = [emitted EXCEPT ![e] = @ + 1]
  /\ procAt' = [procAt EXCEPT ![e] = emitted[e] + 1]
  /\ callAt' = IF callAt[e] = 0 THEN [callAt EXCEPT ![e] = emitted[e] + 1] ELSE callAt
  /\ UNCHANGED <<ended, acked, outputAt, call, sessionVars, procVars>>
  /\ Published(e)
  /\ Commit(e)

(* The finish list is issued before the ended event: its output obligation covers the
   events emitted so far. The end appends the ended event. The Agent may end without
   processing the placeholder (a cancelled Run); a call it issued is named by an event
   before the end. *)
AgentEnd(e) ==
  /\ Live(e) /\ ~ended[e] /\ (call[e] = "none" \/ callAt[e] # 0)
  /\ outputAt' = [outputAt EXCEPT ![e] = emitted[e]]
  /\ emitted' = [emitted EXCEPT ![e] = @ + 1]
  /\ ended' = [ended EXCEPT ![e] = TRUE]
  /\ UNCHANGED <<acked, procAt, toolVars, sessionVars, procVars>>
  /\ Published(e)
  /\ Commit(e)

(* ----------------------------------- Tool ---------------------------------- *)

(* The Tool pushes a delivery to the original consumption position; the Agent's result
   receiver keeps it as an entry. Before the end the entry is also an event; after the
   end it is kept only. A reclaimed or swept record refuses it. *)
Deliver(e, next) ==
  IF content[e] = "full"
    THEN /\ call' = [call EXCEPT ![e] = next]
         /\ emitted' = IF ended[e] THEN emitted ELSE [emitted EXCEPT ![e] = @ + 1]
         /\ UNCHANGED <<ended, acked, outputAt, procAt, callAt, sessionVars, procVars>>
         /\ Published(e)
         /\ Commit(e)
    ELSE /\ call' = [call EXCEPT ![e] = "lost"]
         /\ UNCHANGED <<agentVars, callAt, sessionVars, storeVars, wakeVars, procVars>>

(* The call goes to the background: its placeholder is the first delivery. *)
Placeholder(e) ==
  /\ opened /\ content[e] = "full" /\ call[e] = "running" /\ (ended[e] \/ Room(e))
  /\ Deliver(e, "background")

(* The final delivery of the call: the outcome of a backgrounded Tool call at any time after its
   placeholder, or the result of a call that never went to the background (a Model call, a
   foreground Tool call), whose first delivery is final. *)
Final(e) ==
  /\ opened /\ call[e] \in {"running", "background"}
  /\ (content[e] # "full" \/ ended[e] \/ Room(e))
  /\ Deliver(e, "done")

(* ---------------------------------- Session -------------------------------- *)

(* The Session decides the terminal itself (a cancelled Run): its end is empty. *)
SessionCancel(e) ==
  /\ opened /\ run[e] = "active"
  /\ run' = [run EXCEPT ![e] = "cancelled"]
  /\ UNCHANGED <<agentVars, toolVars, consumed, consumption, processed, storeVars, wakeVars,
                 procVars>>

Next1(e) == consumed[e] + 1

(* The causal order: the processing of the placeholder is interpreted once AD-06 wrote
   the placeholder (call.backgrounded) into the session log. *)
Delivered(e) == InterpretOvertakes \/ consumption[e] \in {"background", "settled"}
Interpretable(e) ==
  /\ Live(e) /\ consumed[e] < emitted[e]
  /\ (Next1(e) = procAt[e] => Delivered(e))

(* AD-02 interprets the next event, one commit each. The intent of the call registers it.
   The processing of the placeholder records it as the call's result; a call the Session
   does not know as backgrounded is then taken as answered by it. The ended event writes
   the terminal with the end summary in the same commit, unless the Session already wrote
   a terminal. A stopped interpretation goes on only once woken. After the commit AD-02
   wakes AD-06, and acknowledgeReceived runs. *)
Registered(e) ==
  IF Next1(e) = callAt[e] /\ consumption[e] = "none" THEN "bound" ELSE consumption[e]

Interpret(e) ==
  /\ Interpretable(e) /\ (stalled[e] => iwake[e])
  /\ consumed' = [consumed EXCEPT ![e] = @ + 1]
  /\ consumption' =
       [consumption EXCEPT ![e] =
          IF Next1(e) = procAt[e] /\ Registered(e) = "bound" THEN "answered" ELSE Registered(e)]
  /\ processed' = IF Next1(e) = procAt[e] THEN [processed EXCEPT ![e] = TRUE] ELSE processed
  /\ run' = IF ended[e] /\ Next1(e) = emitted[e] /\ run[e] = "active"
              THEN [run EXCEPT ![e] = "end"] ELSE run
  /\ twake' = IF Ad06AgentWakeOnly THEN twake ELSE [twake EXCEPT ![e] = TRUE]
  /\ iwake' = [iwake EXCEPT ![e] = FALSE]
  /\ stalled' = [stalled EXCEPT ![e] = FALSE]
  /\ pendingAck' = [pendingAck EXCEPT ![e] = TRUE]
  /\ UNCHANGED <<agentVars, toolVars, storeVars, procVars>>

(* The processing of a delivery the Session has not received, in the event that also
   registers the call, while the binding is not in the session. *)
Unbound(e) ==
  /\ Live(e) /\ consumed[e] < emitted[e] /\ Next1(e) = procAt[e] /\ ~Delivered(e)
  /\ Next1(e) = callAt[e] /\ consumption[e] = "none"

(* AD-02 reaches the processing of a delivery the Session has not received: it stops
   there and answers; acknowledgeReceived runs. *)
Stall(e) ==
  /\ Live(e) /\ consumed[e] < emitted[e] /\ Next1(e) = procAt[e] /\ ~Delivered(e)
  /\ (AtomicEventAwaits \/ ~Unbound(e))
  /\ ~stalled[e]
  /\ stalled' = [stalled EXCEPT ![e] = TRUE]
  /\ iwake' = [iwake EXCEPT ![e] = FALSE]
  /\ pendingAck' = [pendingAck EXCEPT ![e] = TRUE]
  /\ UNCHANGED <<agentVars, toolVars, sessionVars, storeVars, twake, procVars>>

(* AD-02 reaches such a processing with the binding of its call not in the session: it
   commits the binding alone, the position stays, and stops before the event as Stall
   does. The commit wakes AD-06 and acknowledgeReceived runs. *)
Bind(e) ==
  /\ ~AtomicEventAwaits /\ Unbound(e) /\ (stalled[e] => iwake[e])
  /\ consumption' = [consumption EXCEPT ![e] = "bound"]
  /\ twake' = IF Ad06AgentWakeOnly THEN twake ELSE [twake EXCEPT ![e] = TRUE]
  /\ iwake' = [iwake EXCEPT ![e] = FALSE]
  /\ stalled' = [stalled EXCEPT ![e] = TRUE]
  /\ pendingAck' = [pendingAck EXCEPT ![e] = TRUE]
  /\ UNCHANGED <<agentVars, toolVars, consumed, run, processed, storeVars, procVars>>

(* A wake of AD-02 with nothing it can interpret: the round answers, acknowledgeReceived runs. *)
Woke(e) ==
  /\ Live(e) /\ iwake[e] /\ ~Interpretable(e)
  /\ iwake' = [iwake EXCEPT ![e] = FALSE]
  /\ pendingAck' = [pendingAck EXCEPT ![e] = TRUE]
  /\ UNCHANGED <<agentVars, toolVars, sessionVars, storeVars, twake, stalled, procVars>>

(* AD-06, once woken, writes what the result receiver kept of a call the Session bound:
   the placeholder (call.backgrounded) and the outcome (call.background-settled), in one
   commit when both wait. After a commit it wakes AD-02 and acknowledgeReceived runs. *)
Received(e) ==
  IF call[e] = "done" THEN "settled"
  ELSE IF call[e] = "background" /\ consumption[e] \in {"bound", "answered"} THEN "background"
  ELSE consumption[e]

Ad06(e) ==
  /\ Live(e) /\ twake[e]
  /\ twake' = [twake EXCEPT ![e] = FALSE]
  /\ IF consumption[e] # "none" /\ Received(e) # consumption[e]
       THEN /\ consumption' = [consumption EXCEPT ![e] = Received(e)]
            /\ iwake' = [iwake EXCEPT ![e] = TRUE]
            /\ pendingAck' = IF NoAd06Ack THEN pendingAck
                             ELSE [pendingAck EXCEPT ![e] = TRUE]
       ELSE UNCHANGED <<consumption, iwake, pendingAck>>
  /\ UNCHANGED <<agentVars, toolVars, consumed, run, processed, storeVars, stalled, procVars>>

(* callOpen in session-contract/src/call-settlement.ts: a call is open while it waits for
   a delivery. A backgrounded call whose outcome came is no longer open; a call the
   Session took as answered by a result stays open while its Run goes on. *)
OpenBy(awaitProcessing, e) ==
  CASE consumption[e] \in {"bound", "background"} -> TRUE
    [] consumption[e] = "settled" -> awaitProcessing /\ (~processed[e] \/ run[e] = "active")
    [] consumption[e] = "answered" -> run[e] = "active"
    [] OTHER -> FALSE
CallOpen(e) == OpenBy(OpenAwaitsProcessing, e)

(* receivedAll in session-adapters/src/cordis/received-all.ts. The work snapshot sets
   the Run terminal and the execution's terminal in one entry, so one variable holds
   both. *)
ReceivedAll(e) ==
  /\ (IgnoreRunActive \/ run[e] # "active")
  /\ (IgnoreConsumption \/ ~CallOpen(e))

(* acknowledgeReceived: once the Session received all, and the last emitted event is
   its consumption position, and the acknowledgement is not there yet, acknowledge
   through that position. A failed or refused attempt leaves no work behind. *)
Ack(e) ==
  /\ opened /\ pendingAck[e]
  /\ pendingAck' = [pendingAck EXCEPT ![e] = FALSE]
  /\ IF ReceivedAll(e) /\ content[e] = "full" /\ emitted[e] = consumed[e] /\ acked[e] < consumed[e]
       THEN /\ acked' = [acked EXCEPT ![e] = consumed[e]]
            /\ UNCHANGED <<emitted, ended, outputAt, procAt, toolVars, sessionVars, twake, iwake,
                           stalled, procVars>>
            /\ Commit(e)
       ELSE UNCHANGED <<agentVars, toolVars, sessionVars, storeVars, twake, iwake, stalled,
                        procVars>>

(* ---------------------------------- Process -------------------------------- *)

(* A crash loses everything in the process: the waiting wakes and acknowledgements, and
   where the interpretation stopped. *)
Crash ==
  /\ crashes < MaxCrashes
  /\ gen' = gen + 1 /\ crashes' = crashes + 1 /\ opened' = FALSE /\ swept' = FALSE
  /\ twake' = [e \in Execs |-> FALSE] /\ iwake' = [e \in Execs |-> FALSE]
  /\ stalled' = [e \in Execs |-> FALSE] /\ pendingAck' = [e \in Execs |-> FALSE]
  /\ UNCHANGED <<agentVars, toolVars, sessionVars, storeVars, sweepFails>>

(* createTenantSweep: an opening of the tenant domain in a generation whose sweep has
   not finished wakes the ended executions whose acknowledgement is behind the last
   event (announcePublished: both consumptions read again, acknowledgeReceived runs),
   then deletes the tombstones and er_operation that an earlier writer generation
   settled. The sweep may not finish (the read or the commit does not answer, before or
   after the wake); a later opening in the generation sweeps again. The steps of the
   generation go on either way. *)
Waiting(e) == ended[e] /\ content[e] = "full" /\ acked[e] < emitted[e]
Wakes(e) == ~NoStartupWake /\ Waiting(e)
Wake ==
  /\ pendingAck' = [e \in Execs |-> pendingAck[e] \/ Wakes(e)]
  /\ twake' = [e \in Execs |-> twake[e] \/ Wakes(e)]
  /\ iwake' = [e \in Execs |-> iwake[e] \/ Wakes(e)]
Swept(e) ==
  /\ content[e] = "tombstone" /\ ~NoPhase2
  /\ (SweepAnyGeneration \/ settledGen[e] # gen)

Sweep ==
  \/ /\ sweepFails < MaxSweepFails
     /\ sweepFails' = sweepFails + 1
     /\ \/ Wake
        \/ UNCHANGED <<pendingAck, twake, iwake>>
     /\ UNCHANGED <<storeVars, swept>>
  \/ /\ swept' = TRUE
     /\ Wake
     /\ content' = [e \in Execs |-> IF Swept(e) THEN "none" ELSE content[e]]
     /\ operations' = [e \in Execs |-> IF Swept(e) THEN FALSE ELSE operations[e]]
     /\ UNCHANGED <<settledGen, sweepFails>>

OpenTenant ==
  /\ ~opened
  /\ opened' = TRUE
  /\ Sweep
  /\ UNCHANGED <<agentVars, toolVars, sessionVars, stalled, gen, crashes>>

SweepAgain ==
  /\ opened /\ ~swept
  /\ Sweep
  /\ UNCHANGED <<agentVars, toolVars, sessionVars, stalled, gen, crashes, opened>>

Next ==
  \/ OpenTenant \/ SweepAgain \/ Crash
  \/ \E e \in Execs :
       \/ AgentCall(e) \/ AgentIssue(e) \/ Process(e) \/ AgentEnd(e)
       \/ Placeholder(e) \/ Final(e)
       \/ SessionCancel(e) \/ Interpret(e) \/ Stall(e) \/ Bind(e) \/ Woke(e) \/ Ad06(e)
       \/ Ack(e)

Fairness ==
  /\ WF_vars(OpenTenant) /\ WF_vars(SweepAgain)
  /\ \A e \in Execs : /\ WF_vars(Interpret(e)) /\ WF_vars(Bind(e)) /\ WF_vars(Woke(e))
                      /\ WF_vars(Ad06(e)) /\ WF_vars(Ack(e)) /\ WF_vars(Placeholder(e))
                      /\ WF_vars(Final(e))

Spec == Init /\ [][Next]_vars /\ Fairness

(* -------------------------------- Properties ------------------------------- *)

Reclaimed(e) == content[e] # "full"

(* The Session consumed every event the execution emitted. *)
NoLostEvent == \A e \in Execs : Reclaimed(e) => consumed[e] = emitted[e]

(* The outcome of the call is in the session log. *)
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
         /\ run[e] # "active" /\ ~OpenBy(FALSE, e)
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
