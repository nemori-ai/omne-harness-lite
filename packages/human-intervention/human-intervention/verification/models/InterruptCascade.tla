--------------------------- MODULE InterruptCascade ---------------------------
(* One Run whose execution waits on one Ask call with one card, and one interruption of it.

   Four entries interrupt the work of a Run: cancelling the Run, archiving its session, stopping
   one call, and an urgent input. They share one cascade; the entry only decides what follows it.
   The model has the three entries the release has: `cancel` and `archive` end the Run, `stop` ends
   one call and the Run goes on. The urgent input uses the per-call interruption of `stop`.

   Owners and their ordering points:
     Session   the Run state and the control request. Cancelling ends the Run in the commit that
               accepts the control; the Agent learns of it later (PM-13).
     Agent     the execution loop and its slot. The loop waits (W0), wakes, reads (E) and winds the
               execution down (F0) once the cancellation is established in its journal.
     Tool      the call record. A control and the acceptance of a decision both write it, so the
               record decides which came first.
     HITL      the card. A reply and the invalidation both write it.

   The cascade: the interruption is recorded; the Agent asks Tool to stop each foreground call; a
   call that waits for a person settles with the result its author wrote for a closed wait, and
   releases its slot; its card is closed with the cause; only then the execution ends and the next
   input is taken.

   Each `Bad` variant is one way the cascade breaks, as an implementation had it or might. *)
EXTENDS Naturals

CONSTANT Bad

VARIABLES
  kind,       \* the entry of the interruption, or "none"
  run,        \* Session: the Run
  control,    \* the control: requested by Session, accepted and established in the Agent journal
  loop,       \* Agent: where the loop of the execution is
  stopSent,   \* Agent asked Tool to stop the call
  call,       \* Tool: the call record
  result,     \* Tool: what the call gave
  card,       \* HITL: the card
  closing,    \* Tool: the task that closes the card after a control settled the call
  received,   \* Agent: the result of the call reached the execution
  next        \* Session and Agent: the next Run took the slot

vars == <<kind, run, control, loop, stopSent, call, result, card, closing, received, next>>

Kinds == {"cancel", "archive", "stop"}
EndsRun(k) == k \in {"cancel", "archive"}
Settled == call \in {"completed", "interrupted"}

TypeOK ==
  /\ kind \in Kinds \cup {"none"}
  /\ run \in {"active", "cancelled", "completed"}
  /\ control \in {"none", "requested", "accepted", "established"}
  /\ loop \in {"W0", "E", "dead", "winding", "ended"}
  /\ stopSent \in BOOLEAN
  /\ call \in {"suspended", "responding", "resumed", "completed", "interrupted"}
  /\ result \in {"none", "answer", "closed"}
  /\ card \in {"pending", "decided", "invalidated"}
  /\ closing \in {"none", "todo", "done"}
  /\ received \in BOOLEAN
  /\ next \in BOOLEAN

Init ==
  /\ kind = "none" /\ run = "active" /\ control = "none"
  /\ loop = "W0" /\ stopSent = FALSE
  /\ call = "suspended" /\ result = "none"
  /\ card = "pending" /\ closing = "none"
  /\ received = FALSE /\ next = FALSE

(* Session accepts the control. Ending the Run is part of the same commit. *)
Interrupt(k) ==
  /\ run = "active" /\ control = "none"
  /\ kind' = k /\ control' = "requested"
  /\ run' = IF EndsRun(k) THEN "cancelled" ELSE run
  /\ UNCHANGED <<loop, stopSent, call, result, card, closing, received, next>>

(* Session sends the control to the Agent, which accepts it in its journal. *)
Propagate ==
  /\ control = "requested"
  /\ ~(Bad = "no-archive" /\ kind = "archive")
  /\ control' = "accepted"
  /\ UNCHANGED <<kind, run, loop, stopSent, call, result, card, closing, received, next>>

(* The Agent host records the control as established. A per-call stop is advanced by the host
   itself; the calls of a cancelled execution are stopped by its loop at F0. *)
Establish ==
  /\ control = "accepted"
  /\ control' = "established"
  /\ stopSent' = IF kind = "stop" THEN TRUE ELSE stopSent
  /\ UNCHANGED <<kind, run, loop, call, result, card, closing, received, next>>

Wake ==
  /\ loop = "W0" /\ loop' = "E"
  /\ UNCHANGED <<kind, run, control, stopSent, call, result, card, closing, received, next>>

(* E1: the cancellation is established, so the loop goes to F0 and asks Tool to stop the call. *)
WindDown ==
  /\ loop = "E" /\ EndsRun(kind) /\ control = "established"
  /\ loop' = "winding" /\ stopSent' = TRUE
  /\ UNCHANGED <<kind, run, control, call, result, card, closing, received, next>>

(* E2: Session says the advance is gone and the journal has no established cancellation yet. The
   loop waits for its journal to change. It is not a failure of the node. *)
LostAdvance ==
  /\ loop = "E" /\ run = "cancelled" /\ control # "established"
  /\ loop' = IF Bad = "dies" THEN "dead" ELSE "W0"
  /\ stopSent' = IF Bad = "stop-unrecorded" THEN TRUE ELSE stopSent
  /\ UNCHANGED <<kind, run, control, call, result, card, closing, received, next>>

(* The loop takes the result of the call and the Run goes on to its end. *)
TakeResult ==
  /\ loop = "E" /\ run = "active" /\ received
  /\ loop' = "ended" /\ run' = "completed"
  /\ UNCHANGED <<kind, control, stopSent, call, result, card, closing, received, next>>

Sleep ==
  /\ loop = "E" /\ run = "active" /\ ~received
  /\ loop' = "W0"
  /\ UNCHANGED <<kind, run, control, stopSent, call, result, card, closing, received, next>>

(* F1 to F4: the cancelled execution ends once the stopped call confirmed its end. *)
EndCancelled ==
  /\ loop = "winding"
  /\ received \/ Bad = "end-early"
  /\ loop' = "ended"
  /\ UNCHANGED <<kind, run, control, stopSent, call, result, card, closing, received, next>>

(* Tool: the control settles a call that waits or queues. The result is what the author wrote for
   a closed wait. The same commit writes the task that closes the card. *)
ToolStop ==
  /\ stopSent /\ call \in {"suspended", "responding"}
  /\ call' = "interrupted" /\ result' = "closed" /\ closing' = "todo"
  /\ UNCHANGED <<kind, run, control, loop, stopSent, card, received, next>>

(* A person answers the card. HITL checks in the same commit that the Run is live. *)
Reply ==
  /\ card = "pending" /\ run = "active"
  /\ card' = "decided"
  /\ UNCHANGED <<kind, run, control, loop, stopSent, call, result, closing, received, next>>

(* Tool accepts the decision in the call record. A settled call takes none. *)
Accept ==
  /\ card = "decided"
  /\ call = "suspended" \/ (Bad = "accept-after-settle" /\ call = "interrupted")
  /\ call' = "responding"
  /\ UNCHANGED <<kind, run, control, loop, stopSent, result, card, closing, received, next>>

Resume ==
  /\ call = "responding" /\ call' = "resumed"
  /\ UNCHANGED <<kind, run, control, loop, stopSent, result, card, closing, received, next>>

Complete ==
  /\ call = "resumed"
  /\ call' = "completed" /\ result' = "answer"
  /\ UNCHANGED <<kind, run, control, loop, stopSent, card, closing, received, next>>

(* Tool closes the card. A card that a person answered keeps the answer; the call did not take it. *)
CloseCard ==
  /\ closing = "todo" /\ Bad # "no-close"
  /\ closing' = "done"
  /\ card' = IF card = "pending" THEN "invalidated" ELSE card
  /\ UNCHANGED <<kind, run, control, loop, stopSent, call, result, received, next>>

Deliver ==
  /\ Settled /\ ~received /\ received' = TRUE
  /\ UNCHANGED <<kind, run, control, loop, stopSent, call, result, card, closing, next>>

(* The next Run needs the one execution slot of the Agent instance. *)
StartNext ==
  /\ run # "active" /\ loop = "ended" /\ ~next
  /\ next' = TRUE
  /\ UNCHANGED <<kind, run, control, loop, stopSent, call, result, card, closing, received>>

Next ==
  \/ \E k \in Kinds: Interrupt(k)
  \/ Propagate \/ Establish
  \/ Wake \/ WindDown \/ LostAdvance \/ TakeResult \/ Sleep \/ EndCancelled
  \/ ToolStop \/ Reply \/ Accept \/ Resume \/ Complete \/ CloseCard \/ Deliver
  \/ StartNext
  \/ UNCHANGED vars

(* No fairness for the person and for the interruption: neither has to happen. *)
Fairness ==
  /\ WF_vars(Propagate) /\ WF_vars(Establish)
  /\ WF_vars(Wake) /\ WF_vars(WindDown) /\ WF_vars(LostAdvance) /\ WF_vars(TakeResult)
  /\ WF_vars(Sleep) /\ WF_vars(EndCancelled)
  /\ WF_vars(ToolStop) /\ WF_vars(Accept) /\ WF_vars(Resume) /\ WF_vars(Complete)
  /\ WF_vars(CloseCard) /\ WF_vars(Deliver)

Spec == Init /\ [][Next]_vars /\ Fairness

(* Record first, then interrupt: Tool is asked to stop only after the control is established. *)
RecordedBeforeStop == stopSent => control = "established"

(* A call that a control settled stays settled with the result for a closed wait. *)
ClosedStaysClosed == closing # "none" => (call = "interrupted" /\ result = "closed")

(* The call gives an answer only when a person answered the card. *)
AnswerIsThePersons == result = "answer" => card = "decided"

(* The execution ends, and the next input is taken, only after the call settled and its result
   reached the execution. *)
EndsAfterSettle == loop = "ended" => (Settled /\ received)
NextAfterCascade == next => (Settled /\ received)

(* An interruption that ends the Run ends the execution: the loop does not die on the way. *)
CancelEnds == (control # "none" /\ EndsRun(kind)) ~> (loop = "ended")

(* Every interruption settles the call. *)
CallSettles == (control # "none") ~> Settled

(* A call that a control settled leaves no card that still waits. *)
CardCloses == (call = "interrupted") ~> (card # "pending")
===============================================================================
