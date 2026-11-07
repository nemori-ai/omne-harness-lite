----------------------------- MODULE FinalReceipt -----------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Bug
Events == {1, 2}
Values == {"original", "changed"}
VARIABLES sealed, bytes, received, phase, identities, committed, receiptKnown,
          replayed, payloadReadAfterRelease, embedded, result
vars == <<sealed, bytes, received, phase, identities, committed, receiptKnown,
          replayed, payloadReadAfterRelease, embedded, result>>

Init ==
  /\ sealed = FALSE /\ bytes = FALSE /\ received = {}
  /\ phase = [e \in Events |-> "absent"]
  /\ identities = [e \in Events |-> "none"]
  /\ committed = FALSE /\ receiptKnown = FALSE /\ result = 0
  /\ replayed = {} /\ payloadReadAfterRelease = FALSE /\ embedded = {}

Seal ==
  /\ ~sealed /\ sealed' = TRUE /\ bytes' = TRUE
  /\ UNCHANGED <<received, phase, identities, committed, receiptKnown,
                 replayed, payloadReadAfterRelease, embedded, result>>

Receive(e, v) ==
  /\ e \notin received
  /\ IF committed
        THEN v = "original"
        ELSE sealed /\ bytes /\ (v = "original" \/ Bug = "untrusted")
  /\ received' = received \cup {e}
  /\ identities' = [identities EXCEPT ![e] = v]
  /\ phase' = [phase EXCEPT ![e] = IF committed THEN "settled" ELSE "pending"]
  /\ embedded' = IF Bug = "embedded" THEN embedded \cup {e} ELSE embedded
  /\ UNCHANGED <<sealed, bytes, committed, receiptKnown, replayed,
                 payloadReadAfterRelease, result>>

Commit ==
  /\ received # {} /\ ~committed /\ bytes
  /\ committed' = TRUE /\ result' = 1
  /\ phase' = [e \in Events |->
       IF e \in received /\ (Bug # "missed-alias" \/ e = 1)
       THEN "settled" ELSE phase[e]]
  /\ UNCHANGED <<sealed, bytes, received, identities, receiptKnown, replayed,
                 payloadReadAfterRelease, embedded>>

InspectCommit ==
  /\ committed /\ receiptKnown' = TRUE
  /\ UNCHANGED <<sealed, bytes, received, phase, identities, committed,
                 replayed, payloadReadAfterRelease, embedded, result>>

LoseReply ==
  /\ receiptKnown' = FALSE
  /\ UNCHANGED <<sealed, bytes, received, phase, identities, committed,
                 replayed, payloadReadAfterRelease, embedded, result>>

ReleaseEnvelope ==
  /\ committed /\ bytes /\ bytes' = FALSE
  /\ UNCHANGED <<sealed, received, phase, identities, committed, receiptKnown,
                 replayed, payloadReadAfterRelease, embedded, result>>

Replay(e, v) ==
  /\ e \in received
  /\ (v = identities[e] \/ Bug = "changed-replay")
  /\ replayed' = replayed \cup {<<e, v>>}
  /\ payloadReadAfterRelease' =
       (payloadReadAfterRelease \/ (Bug = "read-first" /\ ~bytes))
  /\ UNCHANGED <<sealed, bytes, received, phase, identities, committed,
                 receiptKnown, embedded, result>>

Recover ==
  /\ committed
  /\ receiptKnown' = TRUE
  /\ payloadReadAfterRelease' =
       (payloadReadAfterRelease \/ (Bug = "read-first" /\ ~bytes))
  /\ UNCHANGED <<sealed, bytes, received, phase, identities, committed,
                 replayed, embedded, result>>

RetryOrCrash == UNCHANGED vars
Next == \/ Seal \/ Commit \/ InspectCommit \/ LoseReply \/ ReleaseEnvelope \/ Recover
        \/ \E e \in Events, v \in Values: Receive(e, v) \/ Replay(e, v)
        \/ RetryOrCrash
Spec == Init /\ [][Next]_vars
TypeOK ==
  /\ received \subseteq Events
  /\ phase \in [Events -> {"absent", "pending", "settled"}]
  /\ identities \in [Events -> Values \cup {"none"}]
  /\ replayed \subseteq Events \X Values
  /\ embedded \subseteq Events /\ result \in 0..1
TrustedAdoption == \A e \in received: identities[e] = "original"
AllAliasesSettled == committed => \A e \in received: phase[e] = "settled"
ReplaySameValue == \A p \in replayed: p[2] = identities[p[1]]
RecoveryIndependent == ~payloadReadAfterRelease
NoLedgerPayload == embedded = {}
ReceiptStable == committed <=> result = 1
PendingHasPayload == ~committed /\ received # {} => sealed /\ bytes
=============================================================================
