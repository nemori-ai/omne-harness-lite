---------------------------- MODULE FactCustody ----------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANT UnsafeRelease
Batches == {1, 2}
Values == {"original", "different"}
Receipt(b) == <<"original-start", "source-owner", b, "custody">>
VARIABLES saved, receipts, pending, released, confirmed, reply, cursor, lastFailure
vars == <<saved, receipts, pending, released, confirmed, reply, cursor, lastFailure>>

Init == /\ saved = [b \in Batches |-> "none"]
        /\ receipts = [b \in Batches |-> "none"]
        /\ pending = {}
        /\ released = {}
        /\ confirmed = {}
        /\ reply = [b \in Batches |-> "none"]
        /\ cursor = 0
        /\ lastFailure = "none"

Receive(b, v, answer) ==
 /\ v \in Values /\ answer \in {"known", "unknown"}
 /\ saved[b] = "none" /\ b = cursor + 1 /\ v = "original"
 /\ saved' = [saved EXCEPT ![b] = v]
 /\ receipts' = [receipts EXCEPT ![b] = Receipt(b)]
 /\ pending' = pending \cup {b}
 /\ cursor' = b
 /\ reply' = [reply EXCEPT ![b] = IF answer = "known" THEN Receipt(b) ELSE "none"]
 /\ UNCHANGED <<released, confirmed, lastFailure>>

UnknownDropped(b) ==
 /\ saved[b] = "none" /\ b = cursor + 1
 /\ lastFailure' = "unknown-custody"
 /\ UNCHANGED <<saved, receipts, pending, released, confirmed, reply, cursor>>

Repeat(b, v) ==
 /\ saved[b] # "none" /\ v \in Values
 /\ IF v = saved[b]
       THEN /\ reply' = [reply EXCEPT ![b] = receipts[b]]
            /\ UNCHANGED lastFailure
       ELSE /\ lastFailure' = "event-conflict"
            /\ UNCHANGED reply
 /\ UNCHANGED <<saved, receipts, pending, released, confirmed, cursor>>

SourceAck(b) ==
 /\ (b \in pending /\ receipts[b] = Receipt(b)) \/ UnsafeRelease
 /\ released' = released \cup {b}
 /\ UNCHANGED <<saved, receipts, pending, confirmed, reply, cursor, lastFailure>>

Confirm(b, answer) ==
 /\ b \in pending /\ b \in released /\ answer \in {"known", "unknown"}
 /\ confirmed' = confirmed \cup {b}
 /\ pending' = pending \ {b}
 /\ lastFailure' = IF answer = "unknown" THEN "unknown-confirmation" ELSE "none"
 /\ UNCHANGED <<saved, receipts, released, reply, cursor>>

ConfirmationDropped(b) ==
 /\ b \in pending /\ b \in released
 /\ lastFailure' = "unknown-confirmation"
 /\ UNCHANGED <<saved, receipts, pending, released, confirmed, reply, cursor>>

Next == \E b \in Batches :
          (\E v \in Values, answer \in {"known", "unknown"} : Receive(b, v, answer))
          \/ UnknownDropped(b)
          \/ (\E v \in Values : Repeat(b, v))
          \/ SourceAck(b)
          \/ (\E answer \in {"known", "unknown"} : Confirm(b, answer))
          \/ ConfirmationDropped(b)
Spec == Init /\ [][Next]_vars

SourceReleaseRequiresCustody == \A b \in released : saved[b] = "original" /\ receipts[b] = Receipt(b)
DutyRetained == \A b \in Batches : saved[b] # "none" => b \in pending \cup confirmed
OriginalReceiptRetained == \A b \in Batches : saved[b] # "none" => receipts[b] = Receipt(b)
ConflictingEventNotSaved == \A b \in Batches : saved[b] \in {"none", "original"}
ConfirmedIsNotPending == pending \cap confirmed = {}
CursorHasCustody == \A b \in Batches : b <= cursor => saved[b] = "original"
=============================================================================
