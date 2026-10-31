------------------------- MODULE SettlementRelease -------------------------
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS UnsafeCustody, UnsafeQueueClose
Ops == {"a", "b"}
Answers == {"confirmed", "unknown"}

VARIABLES retain, custodyApplied, expected, callReply, callReceipts,
          callRevision, originals, deliveries, winner, settled, ended,
          resultCustodyConfirmed, queueDuty, queueReply, entry, tombstone,
          closeReply, closedWithQueueConfirmation
vars == <<retain, custodyApplied, expected, callReply, callReceipts,
          callRevision, originals, deliveries, winner, settled, ended,
          resultCustodyConfirmed, queueDuty, queueReply, entry, tombstone,
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
  /\ tombstone = FALSE
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
       queueReply, entry, tombstone, closeReply, closedWithQueueConfirmation>>

RetainApplied(op, answer) ==
  /\ retain[op] = "pending"
  /\ custodyApplied' = TRUE
  /\ retain' = [retain EXCEPT ![op] = answer]
  /\ UNCHANGED <<expected, callReply, callReceipts, callRevision, originals,
       deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, tombstone, closeReply, closedWithQueueConfirmation>>

RetainDropped(op) ==
  /\ retain[op] = "pending"
  /\ retain' = [retain EXCEPT ![op] = "unknown"]
  /\ UNCHANGED <<custodyApplied, expected, callReply, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, tombstone, closeReply, closedWithQueueConfirmation>>

RetryRetain(op) ==
  /\ retain[op] = "unknown"
  /\ retain' = [retain EXCEPT ![op] = "pending"]
  /\ UNCHANGED <<custodyApplied, expected, callReply, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, tombstone, closeReply, closedWithQueueConfirmation>>

PrepareCall(op) ==
  /\ callReply[op] = "idle"
  /\ (retain[op] = "confirmed" \/ (UnsafeCustody /\ custodyApplied /\ retain[op] = "unknown"))
  /\ callReply' = [callReply EXCEPT ![op] = "pending"]
  /\ UNCHANGED <<retain, custodyApplied, expected, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, tombstone, closeReply, closedWithQueueConfirmation>>

(* One call-domain CAS writes the result, delivery, physical basis and duty.
   There is no queue write in this action. *)
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
  /\ UNCHANGED <<retain, custodyApplied, expected, queueReply, entry,
       tombstone, closeReply, closedWithQueueConfirmation>>

CallDropped(op) ==
  /\ callReply[op] = "pending"
  /\ callReply' = [callReply EXCEPT ![op] = "unknown"]
  /\ UNCHANGED <<retain, custodyApplied, expected, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, tombstone, closeReply, closedWithQueueConfirmation>>

(* Re-read the original operation, then retry the same CAS if it did not land. *)
ReadCall(op) ==
  /\ callReply[op] = "unknown"
  /\ callReply' = [callReply EXCEPT
       ![op] = IF op \in callReceipts THEN "confirmed" ELSE "pending"]
  /\ UNCHANGED <<retain, custodyApplied, expected, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, tombstone, closeReply, closedWithQueueConfirmation>>

RejectCompetitor(op) ==
  /\ callReply[op] = "pending"
  /\ originals > 0
  /\ op \notin callReceipts
  /\ callReply' = [callReply EXCEPT
       ![op] = IF expected[op] # callRevision THEN "stale" ELSE "conflict"]
  /\ UNCHANGED <<retain, custodyApplied, expected, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, tombstone, closeReply, closedWithQueueConfirmation>>

RefreshCompetitor(op) ==
  /\ callReply[op] = "stale"
  /\ expected' = [expected EXCEPT ![op] = callRevision]
  /\ callReply' = [callReply EXCEPT ![op] = "pending"]
  /\ UNCHANGED <<retain, custodyApplied, callReceipts, callRevision,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed, queueDuty,
       queueReply, entry, tombstone, closeReply, closedWithQueueConfirmation>>

BeginQueue ==
  /\ winner \in callReceipts
  /\ callReply[winner] = "confirmed"
  /\ queueDuty /\ ended /\ queueReply = "idle"
  /\ queueReply' = "pending"
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, entry, tombstone, closeReply,
       closedWithQueueConfirmation>>

(* Entry deletion and the permanent tombstone are one queue-domain CAS. *)
QueueApplied(answer) ==
  /\ queueReply = "pending"
  /\ entry' = FALSE
  /\ tombstone' = TRUE
  /\ queueReply' = answer
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, closeReply, closedWithQueueConfirmation>>

QueueDropped ==
  /\ queueReply = "pending"
  /\ queueReply' = "unknown"
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, entry, tombstone, closeReply,
       closedWithQueueConfirmation>>

ReadQueue ==
  /\ queueReply = "unknown"
  /\ queueReply' = IF tombstone THEN "confirmed" ELSE "pending"
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, entry, tombstone, closeReply,
       closedWithQueueConfirmation>>

(* A later, separate call-domain CAS closes the original duty. *)
CloseDuty(answer) ==
  /\ queueDuty
  /\ (queueReply = "confirmed" \/ (UnsafeQueueClose /\ queueReply = "unknown"))
  /\ queueDuty' = FALSE
  /\ closeReply' = answer
  /\ callRevision' = callRevision + 1
  /\ closedWithQueueConfirmation' = (queueReply = "confirmed" /\ tombstone)
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       originals, deliveries, winner, settled, ended, resultCustodyConfirmed,
       queueReply, entry, tombstone>>

CloseDropped ==
  /\ queueDuty /\ queueReply = "confirmed"
  /\ closeReply' = "unknown"
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, queueReply, entry, tombstone,
       closedWithQueueConfirmation>>

ReadClose ==
  /\ closeReply = "unknown"
  /\ closeReply' = IF queueDuty THEN "pending" ELSE "confirmed"
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, queueReply, entry, tombstone,
       closedWithQueueConfirmation>>

(* Even an enqueue that arrives after release must consult the tombstone. *)
LateEnqueue ==
  /\ entry' = IF tombstone THEN entry ELSE TRUE
  /\ UNCHANGED <<retain, custodyApplied, expected, callReply, callReceipts,
       callRevision, originals, deliveries, winner, settled, ended,
       resultCustodyConfirmed, queueDuty, queueReply, tombstone, closeReply,
       closedWithQueueConfirmation>>

Next ==
  \/ \E op \in Ops : Begin(op) \/ RetainDropped(op) \/ RetryRetain(op)
       \/ PrepareCall(op) \/ CallDropped(op) \/ ReadCall(op)
       \/ RejectCompetitor(op) \/ RefreshCompetitor(op)
       \/ (\E answer \in Answers : RetainApplied(op, answer) \/ CallApplied(op, answer))
  \/ BeginQueue \/ QueueDropped \/ ReadQueue \/ CloseDropped \/ ReadClose
  \/ LateEnqueue
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
  /\ \A b \in {custodyApplied, settled, ended, resultCustodyConfirmed, queueDuty,
                 entry, tombstone, closedWithQueueConfirmation} : b \in BOOLEAN

ResultRequiresConfirmedCustody == originals > 0 => custodyApplied /\ resultCustodyConfirmed
OneOriginal ==
  /\ originals <= 1 /\ deliveries = originals
  /\ Cardinality(callReceipts) = originals
  /\ (settled <=> originals = 1) /\ (ended <=> settled)
CallDutyRetained == originals > 0 => queueDuty \/ closedWithQueueConfirmation
DeleteWithTombstone == ~entry <=> tombstone
NoResurrection == tombstone => ~entry
CloseRequiresQueueConfirmation ==
  originals > 0 /\ ~queueDuty => closedWithQueueConfirmation /\ tombstone
Spec == Init /\ [][Next]_vars
=============================================================================
