---------------------- MODULE GovernanceAdmission ----------------------
EXTENDS Naturals, TLC
CONSTANT Bad
Requests == {<<p,s,a,o,e>> : p \in 1..2, s \in 1..2, a \in 1..2,
                           o \in 1..2, e \in 1..2}
Policy == {<<1,1,1,1,1>>, <<1,1,1,2,2>>}
VARIABLES live, captured, phase, admitted, issued, member, qualified, clientPolicy
vars == <<live,captured,phase,admitted,issued,member,qualified,clientPolicy>>
Init == /\ live \in Requests /\ captured = live
        /\ phase = "new" /\ admitted = FALSE
        /\ issued \in BOOLEAN /\ member \in BOOLEAN /\ qualified \in BOOLEAN
        /\ clientPolicy = Policy
Capture == /\ phase = "new" /\ captured' = live /\ phase' = "captured"
           /\ UNCHANGED <<live,admitted,issued,member,qualified,clientPolicy>>
ClientMutation == /\ live' \in Requests /\ clientPolicy' \in {Policy,Requests}
                  /\ UNCHANGED <<captured,phase,admitted,issued,member,qualified>>
Matching(r) == IF Bad = "cross-owner"
              THEN r[1] = 1 /\ r[2] = 1 /\ r[3] = 1
              ELSE r \in (IF Bad = "live-policy" THEN clientPolicy ELSE Policy)
Decide == /\ phase = "captured"
          /\ admitted' = ((issued \/ Bad = "skip-issued")
                       /\ (member \/ Bad = "skip-member")
                       /\ (qualified \/ Bad = "skip-qualified")
                       /\ Matching(IF Bad = "live-request" THEN live ELSE captured))
          /\ phase' = "done"
          /\ UNCHANGED <<live,captured,issued,member,qualified,clientPolicy>>
Next == Capture \/ ClientMutation \/ Decide
AuthorizedOriginal == admitted =>
    (issued /\ member /\ qualified /\ captured \in Policy)
Spec == Init /\ [][Next]_vars
=============================================================================
