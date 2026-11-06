----------------------- MODULE RegistrationProtocol -----------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANT Bad
VARIABLES phase, cards, waits, result, observed, recoveredId, sealedEver, online
vars == <<phase,cards,waits,result,observed,recoveredId,sealedEver,online>>
Init == /\ phase = "new" /\ cards = {} /\ waits = {} /\ result = 0
        /\ observed = "unknown" /\ recoveredId = 0 /\ sealedEver = FALSE /\ online = TRUE
Prepare == /\ online /\ phase = "new" /\ phase' = "prepared"
           /\ UNCHANGED <<cards,waits,result,observed,recoveredId,sealedEver,online>>
Commit == /\ online /\ (phase = "prepared" \/ (Bad = "late" /\ phase = "sealed"))
          /\ phase' = "committed" /\ cards' = {1}
          /\ waits' = IF Bad = "partial" THEN {} ELSE {1}
          /\ result' = 1
          /\ UNCHANGED <<observed,recoveredId,sealedEver,online>>
Seal == /\ online /\ phase \in {"new","prepared"}
        /\ phase' = "sealed" /\ result' = 2 /\ sealedEver' = TRUE
        /\ UNCHANGED <<cards,waits,observed,recoveredId,online>>
Retry == /\ online /\ phase = "committed"
         /\ cards' = IF Bad = "retry" THEN {1,2} ELSE cards
         /\ waits' = IF Bad = "retry" THEN {1,2} ELSE waits
         /\ UNCHANGED <<phase,result,observed,recoveredId,sealedEver,online>>
Inspect == /\ online
           /\ observed' = IF phase = "committed" THEN "registered"
                          ELSE IF phase = "sealed" \/ Bad = "notfound" THEN "not-committed"
                          ELSE "unknown"
           /\ recoveredId' = IF phase = "committed" /\ Bad # "receipt" THEN result ELSE 0
           /\ UNCHANGED <<phase,cards,waits,result,sealedEver,online>>
Crash == /\ online /\ online' = FALSE /\ observed' = "unknown" /\ recoveredId' = 0
         /\ UNCHANGED <<phase,cards,waits,result,sealedEver>>
Recover == /\ ~online /\ online' = TRUE
           /\ UNCHANGED <<phase,cards,waits,result,observed,recoveredId,sealedEver>>
Next == Prepare \/ Commit \/ Seal \/ Retry \/ Inspect \/ Crash \/ Recover \/ UNCHANGED vars
JointRegistration == cards = waits
OneOriginalRequest == Cardinality(cards) <= 1
SealedCannotCommit == sealedEver => phase = "sealed"
NoFalseNotCommitted == observed = "not-committed" => sealedEver
RecoverableResult == observed = "registered" => recoveredId = 1
Spec == Init /\ [][Next]_vars
=============================================================================
