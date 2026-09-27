-------------------------- MODULE OfferSettlement --------------------------
EXTENDS Naturals, TLC
CONSTANTS Deadline, MaxTime, Mutation
VARIABLES now, exists, settled, firstTerminal, settledAt, existedAtCommit, acceptEffects
vars == <<now, exists, settled, firstTerminal, settledAt, existedAtCommit, acceptEffects>>
Kinds == {"accepted", "withdrawn", "declined"}
Pending == settled = "none" /\ now <= Deadline /\ exists
Init == /\ now = 0 /\ exists = TRUE /\ settled = "none" /\ firstTerminal = "none"
        /\ settledAt = 0 /\ existedAtCommit = TRUE /\ acceptEffects = 0
Tick == /\ now < MaxTime /\ now' = now + 1
        /\ UNCHANGED <<exists, settled, firstTerminal, settledAt, existedAtCommit, acceptEffects>>
Remove == /\ exists /\ exists' = FALSE
          /\ UNCHANGED <<now, settled, firstTerminal, settledAt, existedAtCommit, acceptEffects>>
Settle(kind) == /\ kind \in Kinds
               /\ (Pending \/ (Mutation = "overwrite" /\ settled # "none" /\ kind # settled)
                    \/ (Mutation = "late" /\ settled = "none" /\ ~Pending))
               /\ settled' = kind /\ settledAt' = now /\ existedAtCommit' = exists
               /\ firstTerminal' = IF firstTerminal = "none" THEN kind ELSE firstTerminal
               /\ acceptEffects' = acceptEffects + (IF kind = "accepted" THEN 1 ELSE 0)
               /\ UNCHANGED <<now, exists>>
Next == Tick \/ Remove \/ (\E kind \in Kinds : Settle(kind))
TypeOK == /\ now \in 0..MaxTime /\ exists \in BOOLEAN
          /\ settled \in Kinds \cup {"none"} /\ firstTerminal \in Kinds \cup {"none"}
          /\ settledAt \in 0..MaxTime /\ existedAtCommit \in BOOLEAN /\ acceptEffects \in Nat
TerminalStable == firstTerminal = "none" \/ settled = firstTerminal
NoLateSettlement == settled = "none" \/ (settledAt <= Deadline /\ existedAtCommit)
AcceptanceOnce == acceptEffects <= 1
=============================================================================
