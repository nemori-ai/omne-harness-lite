-------------------------- MODULE ExpectedTenant --------------------------
EXTENDS TLC
CONSTANTS Tenants, CompareExpected, ProtectCommit
VARIABLES selected, expected, checked, effect, pc
vars == <<selected, expected, checked, effect, pc>>

Init == /\ selected \in Tenants
        /\ expected = selected
        /\ checked = "none"
        /\ effect = "none"
        /\ pc = "ready"

(* A second client changes the shared login's selection. The production
   boundary excludes it between comparison and business commit. *)
Switch == /\ (~ProtectCommit \/ pc # "checked")
          /\ \E t \in Tenants : selected' = t
          /\ UNCHANGED <<expected, checked, effect, pc>>

Check == /\ pc = "ready"
         /\ checked' = selected
         /\ pc' = IF CompareExpected /\ selected # expected
                     THEN "rejected" ELSE "checked"
         /\ UNCHANGED <<selected, expected, effect>>

(* The effect records where the operation actually lands, not an assertion
   flag or a value copied from the client's expectation. *)
Commit == /\ pc = "checked"
          /\ effect' = selected
          /\ pc' = "done"
          /\ UNCHANGED <<selected, expected, checked>>

Next == Switch \/ Check \/ Commit
Spec == Init /\ [][Next]_vars
TypeOK == /\ selected \in Tenants /\ expected \in Tenants
          /\ checked \in Tenants \cup {"none"}
          /\ effect \in Tenants \cup {"none"}
          /\ pc \in {"ready", "checked", "rejected", "done"}
AppliedExpected == effect # "none" => effect = expected
CheckedSameCommit == effect # "none" => effect = checked
RejectedWithoutEffect == pc = "rejected" => effect = "none"
=============================================================================
