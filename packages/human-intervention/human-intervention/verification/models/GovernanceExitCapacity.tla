-------------------- MODULE GovernanceExitCapacity --------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANTS Bad, MaxRevision, Capacity
VARIABLE x
vars == <<x>>
Threshold == MaxRevision - Capacity
Init == x = [declaration |-> 0, adoption |-> 0, active |-> 0]
CanEnter == IF Bad = "no-reserve"
            THEN x.declaration < MaxRevision /\ x.adoption < MaxRevision
            ELSE IF Bad = "inclusive"
                 THEN x.declaration <= Threshold /\ x.adoption <= Threshold
                 ELSE x.declaration < Threshold /\ x.adoption < Threshold
Register == /\ CanEnter /\ x.active < Capacity
            /\ x' = [x EXCEPT !.declaration = @ + 1, !.active = @ + 1]
Adopt == /\ CanEnter /\ x' = [x EXCEPT !.adoption = @ + 1]
Release == /\ x.active > 0 /\ x.declaration < MaxRevision /\ x.adoption < MaxRevision
           /\ x' = [x EXCEPT !.declaration = @ + 1, !.adoption = @ + 1,
                     !.active = IF Bad = "no-remove" THEN @ ELSE @ - 1]
Restart == /\ x.declaration < MaxRevision /\ x.adoption < MaxRevision
           /\ x' = [x EXCEPT !.declaration = @ + 1, !.adoption = @ + 1, !.active = 0]
Observe == UNCHANGED x
Next == Register \/ Adopt \/ Release \/ Restart \/ Observe
ExitCapacity == x.declaration + x.active <= MaxRevision
                /\ x.adoption + x.active <= MaxRevision
Bounded == x.active <= Capacity /\ x.declaration <= MaxRevision /\ x.adoption <= MaxRevision
Spec == Init /\ [][Next]_vars
=============================================================================
