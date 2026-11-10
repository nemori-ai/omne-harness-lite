------------------------- MODULE SettlementRelease -------------------------
EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS UnsafeCustody, UnsafeQueueClose, UnsafeCreate, UnsafeQueueFirst
Ops == {"a", "b"}
Answers == {"confirmed", "unknown"}

VARIABLES retain, custodyApplied, expected, callReply, callReceipts,
          callRevision, originals, deliveries, winner, settled, ended,
          resultCustodyConfirmed, queueDuty, queueReply, entry, released,
          createStage, createExpected, nextHeld,
          closeReply, closedWithQueueConfirmation
vars == <<retain, custodyApplied, expected, callReply, callReceipts,
          callRevision, originals, deliveries, winner, settled, ended,
          resultCustodyConfirmed, queueDuty, queueReply, entry, released,
          createStage, createExpected, nextHeld,
          closeReply, closedWithQueueConfirmation>>

Init ==
  /\ retain = [op \in Ops |-> "idle"]
  /\ custodyApplied = FALSE
  /\ expected = [op \in Ops |-> 0]
  /\ callReply = [op \in Ops |-> "idle"]
  /\ callReceipts = {}
  /\ callRevision = 0
  /\ originals = 0
  /\ deliveries = 0
  /\ winner = "none"
  /\ settled = FALSE
  /\ ended = FALSE
  /\ resultCustodyConfirmed = FALSE
  /\ queueDuty = FALSE
  /\ queueReply = "idle"
  /\ entry = TRUE
  /\ released = FALSE
  /\ createStage = "idle"
  /\ createExpected = 0
  /\ nextHeld = FALSE
  /\ closeReply = "idle"
  /\ closedWithQueueConfirmation = FALSE

(* Both competitors and every retry use the same original retain identity.
   Their locally observed confirmation remains separate from custody storage. *)
Begin(op) ==
  /\ retain[op] = "idle"
  /\ retain' = [retain EXCEPT ![op] = "pending"]
  /\ expected' = [expected EXCEPT ![op] = callRevision]
  /\ UNCHANGED <<custodyApplied, callReply, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, released, createStage, createExpected, nextHeld,
       closeReply, closedWithQueueConfirmation>>

RetainApplied(op, answer) ==
  /\ retain[op] = "pending"
  /\ custodyApplied' = TRUE
  /\ retain' = [retain EXCEPT ![op] = answer]
  /\ UNCHANGED <<expected, callReply, callReceipts, callRevision, originals,
       deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, released, createStage, createExpected, nextHeld,
       closeReply, closedWithQueueConfirmation>>

RetainDropped(op) ==
  /\ retain[op] = "pending"
  /\ retain' = [retain EXCEPT ![op] = "unknown"]
  /\ UNCHANGED <<custodyApplied, expected, callReply, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, released, createStage, createExpected, nextHeld,
       closeReply, closedWithQueueConfirmation>>

RetryRetain(op) ==
  /\ retain[op] = "unknown"
  /\ retain' = [retain EXCEPT ![op] = "pending"]
  /\ UNCHANGED <<custodyApplied, expected, callReply, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, released, createStage, createExpected, nextHeld,
       closeReply, closedWithQueueConfirmation>>

PrepareCall(op) ==
  /\ callReply[op] = "idle"
  /\ (retain[op] = "confirmed" \/ (UnsafeCustody /\ custodyApplied /\ retain[op] = "unknown"))
  /\ callReply' = [callReply EXCEPT ![op] = "pending"]
  /\ UNCHANGED <<retain, custodyApplied, expected, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, released, createStage, createExpected, nextHeld,
       closeReply, closedWithQueueConfirmation>>

(* One call-domain CAS writes the result, delivery, physical basis and duty.
   There is no queue write in this action. The basis is a fact of the call:
   from here on the call domain reads "released". *)
CallApplied(op, answer) ==
  /\ callReply[op] = "pending"
  /\ expected[op] = callRevision
  /\ originals = 0
  /\ callReply' = [callReply EXCEPT ![op] = answer]
  /\ callReceipts' = callReceipts \cup {op}
  /\ callRevision' = callRevision + 1
  /\ originals' = originals + 1
  /\ deliveries' = deliveries + 1
  /\ winner' = op
  /\ settled' = TRUE
  /\ ended' = TRUE
  /\ resultCustodyConfirmed' = (retain[op] = "confirmed")
  /\ queueDuty' = TRUE
  /\ UNCHANGED <<retain, custodyApplied, expected, queueReply, entry, released,
       createStage, createExpected, nextHeld, closeReply, closedWithQueueConfirmation>>

CallDropped(op) ==
  /\ callReply[op] = "pending"
  /\ callReply' = [callReply EXCEPT ![op] = "unknown"]
  /\ UNCHANGED <<retain, custodyApplied, expected, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, released, createStage, createExpected, nextHeld,
       closeReply, closedWithQueueConfirmation>>

(* Re-read the original operation, then retry the same CAS if it did not land. *)
ReadCall(op) ==
  /\ callReply[op] = "unknown"
  /\ callReply' = [callReply EXCEPT
       ![op] = IF op \in callReceipts THEN "confirmed" ELSE "pending"]
  /\ UNCHANGED <<retain, custodyApplied, expected, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, released, createStage, createExpected, nextHeld,
       closeReply, closedWithQueueConfirmation>>

RejectCompetitor(op) ==
  /\ callReply[op] = "pending"
  /\ originals > 0
  /\ op \notin callReceipts
  /\ callReply' = [callReply EXCEPT
       ![op] = IF expected[op] # callRevision THEN "stale" ELSE "conflict"]
  /\ UNCHANGED <<retain, custodyApplied, expected, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, released, createStage, createExpected, nextHeld,
       closeReply, closedWithQueueConfirmation>>

RefreshCompetitor(op) ==
  /\ callReply[op] = "stale"
  /\ expected' = [expected EXCEPT ![op] = callRevision]
  /\ callReply' = [callReply EXCEPT ![op] = "pending"]
  /\ UNCHANGED <<retain, custodyApplied, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, released, createStage, createExpected, nextHeld,
       closeReply, closedWithQueueConfirmation>>

(* The release follows the basis the call domain holds. The unsafe order lets
   the queue step run before the call domain holds the basis. *)
BeginQueue ==
  /\ queueReply = "idle"
  /\ \/ (winner \in callReceipts /\ callReply[winner] = "confirmed" /\ queueDuty /\ ended)
     \/ UnsafeQueueFirst
  /\ queueReply' = "pending"
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, entry, released, createStage,
       createExpected, nextHeld, closeReply, closedWithQueueConfirmation>>

(* The release is one queue-domain CAS that deletes the entry and writes nothing else. *)
QueueApplied(answer) ==
  /\ queueReply = "pending"
  /\ entry' = FALSE
  /\ released' = TRUE
  /\ queueReply' = answer
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, createStage, createExpected, nextHeld,
       closeReply, closedWithQueueConfirmation>>

QueueDropped ==
  /\ queueReply = "pending"
  /\ queueReply' = "unknown"
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, entry, released, createStage,
       createExpected, nextHeld, closeReply, closedWithQueueConfirmation>>

(* A retried release re-reads the queue: an absent entry is a release with
   nothing left to write, a present entry is retried under the same identity. *)
ReadQueue ==
  /\ queueReply = "unknown"
  /\ queueReply' = IF entry THEN "pending" ELSE "confirmed"
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, entry, released, createStage,
       createExpected, nextHeld, closeReply, closedWithQueueConfirmation>>

(* A later, separate call-domain CAS closes the original duty. *)
CloseDuty(answer) ==
  /\ queueDuty
  /\ (queueReply = "confirmed" \/ (UnsafeQueueClose /\ queueReply = "unknown"))
  /\ queueDuty' = FALSE
  /\ closeReply' = answer
  /\ callRevision' = callRevision + 1
  /\ closedWithQueueConfirmation' = (queueReply = "confirmed" /\ ~entry)
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed,
       queueReply, entry, released, createStage, createExpected, nextHeld>>

CloseDropped ==
  /\ queueDuty /\ queueReply = "confirmed"
  /\ closeReply' = "unknown"
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, queueReply, entry, released,
       createStage, createExpected, nextHeld, closedWithQueueConfirmation>>

ReadClose ==
  /\ closeReply = "unknown"
  /\ closeReply' = IF queueDuty THEN "pending" ELSE "confirmed"
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, queueReply, entry, released,
       createStage, createExpected, nextHeld, closedWithQueueConfirmation>>

(* A step that creates the entry (admit's ordinal assignment, planPreparation)
   reads the call domain first. It goes on only while the call domain reads
   "not released", and it remembers the revision it read. *)
CreateRead ==
  /\ createStage = "idle"
  /\ originals = 0
  /\ createExpected' = callRevision
  /\ createStage' = "read"
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, queueReply, entry, released, nextHeld,
       closeReply, closedWithQueueConfirmation>>

(* The creating commit lands whenever the store applies it: at once, or late,
   after a reply the step never saw. It asserts the call-domain revision it
   read; a failed assertion lands nothing and sends the step back to a read. *)
CreateLand ==
  /\ createStage = "read"
  /\ IF UnsafeCreate \/ createExpected = callRevision
       THEN entry' = TRUE /\ createStage' = "done"
       ELSE entry' = entry /\ createStage' = "idle"
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, queueReply, released, createExpected,
       nextHeld, closeReply, closedWithQueueConfirmation>>

(* A step whose reply was lost reads and decides again under the same identity. *)
CreateRetry ==
  /\ createStage = "done"
  /\ createStage' = "idle"
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, queueReply, entry, released,
       createExpected, nextHeld, closeReply, closedWithQueueConfirmation>>

(* The next call of the key takes the one slot once the original's entry is gone. *)
HoldNext ==
  /\ ~entry /\ ~nextHeld
  /\ nextHeld' = TRUE
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, queueReply, entry, released,
       createStage, createExpected, closeReply, closedWithQueueConfirmation>>

Next ==
  \/ \E op \in Ops : Begin(op) \/ RetainDropped(op) \/ RetryRetain(op)
       \/ PrepareCall(op) \/ CallDropped(op) \/ ReadCall(op)
       \/ RejectCompetitor(op) \/ RefreshCompetitor(op)
       \/ (\E answer \in Answers : RetainApplied(op, answer) \/ CallApplied(op, answer))
  \/ BeginQueue \/ QueueDropped \/ ReadQueue \/ CloseDropped \/ ReadClose
  \/ CreateRead \/ CreateLand \/ CreateRetry \/ HoldNext
  \/ \E answer \in Answers : QueueApplied(answer) \/ CloseDuty(answer)

TypeOK ==
  /\ retain \in [Ops -> {"idle", "pending", "unknown", "confirmed"}]
  /\ expected \in [Ops -> 0..2]
  /\ callReply \in [Ops -> {"idle", "pending", "unknown", "confirmed", "stale", "conflict"}]
  /\ callReceipts \subseteq Ops
  /\ callRevision \in 0..2
  /\ originals \in 0..2 /\ deliveries \in 0..2
  /\ winner \in Ops \cup {"none"}
  /\ queueReply \in {"idle", "pending", "unknown", "confirmed"}
  /\ closeReply \in {"idle", "pending", "unknown", "confirmed"}
  /\ createStage \in {"idle", "read", "done"}
  /\ createExpected \in 0..2
  /\ \A b \in {custodyApplied, settled, ended, resultCustodyConfirmed, queueDuty,
                 entry, released, nextHeld, closedWithQueueConfirmation} : b \in BOOLEAN

(* The records of the queue domain: the counter and one entry per call that
   holds a place. Nothing else is ever written there. *)
QueueRecords ==
  {"counter"}
    \cup (IF entry THEN {"entry:orig"} ELSE {})
    \cup (IF nextHeld THEN {"entry:next"} ELSE {})
LiveCalls == (IF released THEN {} ELSE {"orig"}) \cup {"next"}

ResultRequiresConfirmedCustody == originals > 0 => custodyApplied /\ resultCustodyConfirmed
OneOriginal ==
  /\ originals <= 1 /\ deliveries = originals
  /\ Cardinality(callReceipts) = originals
  /\ (settled <=> originals = 1) /\ (ended <=> settled)
CallDutyRetained == originals > 0 => queueDuty \/ closedWithQueueConfirmation
ReleaseRequiresBasis == released => originals > 0
NoResurrection == released => ~entry
NoDoubleHold == ~(entry /\ nextHeld)
QueueHoldsOnlyLive ==
  QueueRecords \subseteq {"counter"} \cup {"entry:" \o call : call \in LiveCalls}
CloseRequiresQueueConfirmation ==
  originals > 0 /\ ~queueDuty => closedWithQueueConfirmation /\ ~entry
Spec == Init /\ [][Next]_vars
=============================================================================
