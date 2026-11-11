---------------------- MODULE GovernanceRecoveryPhase ----------------------
EXTENDS Naturals, TLC
CONSTANT Bad
VARIABLES ledger, stored, terminal
vars == <<ledger, stored, terminal>>
Init == /\ ledger = 0 /\ stored = FALSE /\ terminal = FALSE
Attempt(request) == /\ (request = 1 \/ Bad = "skip-preflight")
                    /\ ledger' = IF ledger = 0 THEN request ELSE ledger
                    /\ stored' = (stored \/ (ledger' = 1 /\ request = 1))
                    /\ UNCHANGED terminal
Seal == /\ stored /\ ~terminal /\ terminal' = TRUE
        /\ UNCHANGED <<ledger,stored>>
Restart == UNCHANGED vars
Next == Attempt(1) \/ Attempt(2) \/ Seal \/ Restart
NoPoison == ledger # 2
ExactStored == stored => ledger = 1
Completion == <>terminal
Spec == Init /\ [][Next]_vars /\ WF_vars(Attempt(1)) /\ WF_vars(Seal)
=============================================================================
