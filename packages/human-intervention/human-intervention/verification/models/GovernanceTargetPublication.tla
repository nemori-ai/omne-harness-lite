------------------- MODULE GovernanceTargetPublication -------------------
EXTENDS Naturals, TLC
CONSTANT Bad
VARIABLES release, revision, mounted, phase, captured, applied
vars == <<release, revision, mounted, phase, captured, applied>>
Current == [release |-> release, revision |-> revision, mounted |-> mounted]
Observed == IF Bad = "preflight" THEN captured ELSE Current
Matches == Bad = "shape-only" \/ Observed.release = "release-1"
Loaded == Bad = "declaration-only" \/ Observed.mounted
Init == /\ release = "release-1" /\ revision = 0 /\ mounted = TRUE
        /\ phase = "new" /\ captured = Current /\ applied = {}
Read == /\ phase = "new" /\ captured' = Current /\ phase' = "captured"
        /\ UNCHANGED <<release, revision, mounted, applied>>
Replace == /\ release = "release-1" /\ release' = "release-2"
           /\ revision' = revision + 1
           /\ UNCHANGED <<mounted, phase, captured, applied>>
Unload == /\ mounted /\ mounted' = FALSE /\ revision' = revision + 1
          /\ UNCHANGED <<release, phase, captured, applied>>
Apply == /\ phase = "captured" /\ Matches /\ Loaded
         /\ applied' = {[release |-> release, observedRevision |-> Observed.revision,
                         actualRevision |-> revision, mounted |-> mounted]}
         /\ phase' = "finished"
         /\ UNCHANGED <<release, revision, mounted, captured>>
Refuse == /\ phase = "captured" /\ ~(Matches /\ Loaded)
          /\ phase' = "finished"
          /\ UNCHANGED <<release, revision, mounted, captured, applied>>
Finished == /\ phase = "finished" /\ UNCHANGED vars
Next == Read \/ Replace \/ Unload \/ Apply \/ Refuse \/ Finished
ExactPublication == \A result \in applied : result.release = "release-1"
CurrentAtCommit == \A result \in applied : result.observedRevision = result.actualRevision
ImplementationPresent == \A result \in applied : result.mounted
Spec == Init /\ [][Next]_vars
=============================================================================
