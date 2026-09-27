------------------------ MODULE CredentialRevision -------------------------
EXTENDS Naturals, FiniteSets
CONSTANT CheckRevision
VARIABLES revision, loginRevision, phase, snapshot, changed, issued, issueSnapshot
vars == <<revision, loginRevision, phase, snapshot, changed, issued, issueSnapshot>>
Init == /\ revision = 0 /\ loginRevision = 0 /\ phase = "idle"
        /\ snapshot = 0 /\ changed = FALSE /\ issued = FALSE /\ issueSnapshot = 0
CheckCredential == /\ phase = "idle" /\ snapshot' = revision /\ phase' = "verified"
                   /\ UNCHANGED <<revision, loginRevision, changed, issued, issueSnapshot>>
ChangeCredential == /\ ~changed /\ revision' = revision + 1 /\ changed' = TRUE
                    /\ UNCHANGED <<loginRevision, phase, snapshot, issued, issueSnapshot>>
Issue == /\ phase = "verified" /\ phase' = "done"
         /\ IF ~CheckRevision \/ snapshot = revision
                THEN /\ issued' = TRUE /\ issueSnapshot' = snapshot
                     /\ loginRevision' = revision
                ELSE UNCHANGED <<issued, issueSnapshot, loginRevision>>
         /\ UNCHANGED <<revision, snapshot, changed>>
Next == CheckCredential \/ ChangeCredential \/ Issue
NoStaleIssue == issued => issueSnapshot = loginRevision
OldLoginInvalid == (issued /\ issueSnapshot # revision) => loginRevision # revision
TypeOK == /\ revision \in 0..1 /\ loginRevision \in 0..1
          /\ phase \in {"idle", "verified", "done"} /\ snapshot \in 0..1
          /\ issued \in BOOLEAN /\ issueSnapshot \in 0..1 /\ changed \in BOOLEAN
=============================================================================
