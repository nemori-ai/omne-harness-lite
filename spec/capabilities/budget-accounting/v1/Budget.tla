------------------------------ MODULE Budget ------------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Mutation
Attempts == {1, 2}
VARIABLES admitted, reservation, charged, total, badAdmission
vars == <<admitted, reservation, charged, total, badAdmission>>
Init == /\ admitted = {} /\ reservation = {} /\ charged = {}
        /\ total = 0 /\ badAdmission = FALSE
Exposure == total + Cardinality(reservation)
Reserve(a) == /\ a \notin admitted /\ (Exposure < 1 \/ Mutation = "overbook")
              /\ admitted' = admitted \cup {a}
              /\ reservation' = reservation \cup {a}
              /\ badAdmission' = (badAdmission \/ Exposure >= 1)
              /\ UNCHANGED <<charged, total>>
Settle(a) == /\ a \in admitted /\ (a \notin charged \/ Mutation = "duplicate")
             /\ total < 3
             /\ reservation' = reservation \ {a}
             /\ charged' = charged \cup {a} /\ total' = total + 1
             /\ UNCHANGED <<admitted, badAdmission>>
Next == (\E a \in Attempts : Reserve(a) \/ Settle(a))
Spec == Init /\ [][Next]_vars
NoOverbooking == ~badAdmission
ReceiptIdempotency == total = Cardinality(charged)
AccountedAttempts == admitted = reservation \cup charged
=============================================================================
