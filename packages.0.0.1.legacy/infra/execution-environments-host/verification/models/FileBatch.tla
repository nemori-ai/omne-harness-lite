----------------------------- MODULE FileBatch -----------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANTS EarlyWrite, BlindRecovery, FalseSuccess, ForgetDuty, RestartUnknown
VARIABLES phase, targets, writes, checked, confirmed, recoveryWrites, duty, attempts
vars == <<phase, targets, writes, checked, confirmed, recoveryWrites, duty, attempts>>
Ids == {1, 2}
Init == /\ phase = "new" /\ targets = [i \in Ids |-> "old"]
        /\ writes = {} /\ checked = {} /\ confirmed = {} /\ recoveryWrites = 0 /\ duty = FALSE /\ attempts = 1
RejectPrecheck == /\ phase = "new" /\ phase' = "rejected"
                  /\ writes' = IF EarlyWrite THEN {1} ELSE {}
                  /\ targets' = IF EarlyWrite THEN [targets EXCEPT ![1] = "new"] ELSE targets
                  /\ UNCHANGED <<checked, confirmed, recoveryWrites, duty, attempts>>
Precheck == /\ phase = "new" /\ \A i \in Ids : targets[i] = "old"
            /\ phase' = "publishing" /\ duty' = TRUE
            /\ UNCHANGED <<targets, writes, checked, confirmed, recoveryWrites, attempts>>
Inspect(i) == /\ phase = "publishing" /\ i \notin checked /\ targets[i] = "old"
              /\ checked' = checked \cup {i}
              /\ UNCHANGED <<phase, targets, writes, confirmed, recoveryWrites, duty, attempts>>
\* A real external write may occur after Inspect and before Publish.
Publish(i) == /\ phase = "publishing" /\ i \in checked /\ i \notin writes
              /\ targets' = [targets EXCEPT ![i] = "new"] /\ writes' = writes \cup {i}
              /\ UNCHANGED <<phase, checked, confirmed, recoveryWrites, duty, attempts>>
Confirm(i) == /\ phase = "publishing" /\ i \in writes
              /\ i \notin confirmed /\ confirmed' = confirmed \cup {i}
              /\ UNCHANGED <<phase, targets, writes, checked, recoveryWrites, duty, attempts>>
Interrupt == /\ phase = "publishing" /\ phase' = "unknown" /\ duty' = ~ForgetDuty
             /\ UNCHANGED <<targets, writes, checked, confirmed, recoveryWrites, attempts>>
External(i) == /\ phase \in {"publishing", "unknown"} /\ targets[i] # "external"
               /\ targets' = [targets EXCEPT ![i] = "external"]
               /\ UNCHANGED <<phase, writes, checked, confirmed, recoveryWrites, duty, attempts>>
Recover(i) == /\ phase = "unknown" /\ phase' = "recognized"
              /\ targets' = IF BlindRecovery THEN [targets EXCEPT ![i] = "new"] ELSE targets
              /\ recoveryWrites' = IF BlindRecovery THEN 1 ELSE 0
              /\ UNCHANGED <<writes, checked, confirmed, duty, attempts>>
Complete == /\ phase = "publishing" /\ (confirmed = Ids \/ FalseSuccess)
            /\ phase' = "committed"
            /\ UNCHANGED <<targets, writes, checked, confirmed, recoveryWrites, duty, attempts>>
Restart == /\ phase = "unknown" /\ RestartUnknown /\ attempts = 1
           /\ attempts' = 2 /\ phase' = "publishing"
           /\ UNCHANGED <<targets, writes, checked, confirmed, recoveryWrites, duty>>
Next == Complete \/ Restart \/ RejectPrecheck \/ Precheck \/ Interrupt
        \/ \E i \in Ids : Inspect(i) \/ Publish(i) \/ Confirm(i) \/ External(i) \/ Recover(i)
Spec == Init /\ [][Next]_vars
Safety == /\ (phase = "rejected" => writes = {}) /\ recoveryWrites = 0
          /\ (phase = "committed" => confirmed = Ids /\ writes = Ids)
          /\ (phase = "unknown" => duty) /\ attempts = 1
\* Not a claimed invariant: unrestricted external writes break hash-then-rename CAS.
NoExternalOverwrite == \A i \in Ids : i \in checked /\ i \notin writes => targets[i] = "old"
=============================================================================
