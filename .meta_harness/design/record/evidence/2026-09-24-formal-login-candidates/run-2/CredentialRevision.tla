------------------------ MODULE CredentialRevision -------------------------
EXTENDS Naturals, FiniteSets
CONSTANT CheckRevision
VARIABLES revision, loginRevision, phase, snapshot, changed, staleIssued
vars == <<revision, loginRevision, phase, snapshot, changed, staleIssued>>
Init == /\ revision = 0 /\ loginRevision = 0 /\ phase = "idle"
        /\ snapshot = 0 /\ changed = FALSE /\ staleIssued = FALSE
CheckCredential == /\ phase = "idle" /\ snapshot' = revision /\ phase' = "verified"
                   /\ UNCHANGED <<revision, loginRevision, changed, staleIssued>>
ChangeCredential == /\ ~changed /\ revision' = revision + 1 /\ changed' = TRUE
                    /\ UNCHANGED <<loginRevision, phase, snapshot, staleIssued>>
Issue == /\ phase = "verified" /\ phase' = "done"
         /\ loginRevision' = IF ~CheckRevision \/ snapshot = revision THEN revision ELSE loginRevision
         /\ staleIssued' = (staleIssued \/ (~CheckRevision /\ snapshot # revision))
         /\ UNCHANGED <<revision, snapshot, changed>>
Next == CheckCredential \/ ChangeCredential \/ Issue
NoStaleIssue == ~staleIssued
TypeOK == /\ revision \in 0..1 /\ loginRevision \in 0..1
          /\ phase \in {"idle", "verified", "done"} /\ snapshot \in 0..1
=============================================================================
