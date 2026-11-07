------------------------------- MODULE Handoff -------------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Bug
R == {1, 2}
P == {1, 2}
Tenant(r) == r
Version(r) == 1
VARIABLES tool, claim, processed, known, appended, request, binding
vars == <<tool, claim, processed, known, appended, request, binding>>
Empty == [result |-> 0, tenant |-> 0, version |-> 0]
Init == /\ tool = R /\ claim = {} /\ processed = {} /\ known = {}
        /\ binding = [r \in R |-> Empty]
        /\ appended = [r \in R |-> 0] /\ request = [p \in P |-> Empty]
Start(p, r, t, v) ==
  /\ request[p] = Empty
  /\ request' = [request EXCEPT ![p] = [result |-> r, tenant |-> t, version |-> v]]
  /\ UNCHANGED <<tool, claim, processed, known, appended, binding>>
Valid(p) == /\ request[p].result \in R
            /\ request[p].tenant = Tenant(request[p].result)
            /\ request[p].version = Version(request[p].result)
Commit(p) ==
  LET r == request[p].result IN
  /\ Valid(p) /\ (r \in tool \/ r \in claim)
  /\ claim' = claim \cup {r}
  /\ appended' = [appended EXCEPT ![r] =
       IF Bug = "duplicate" THEN @ + 1 ELSE 1]
  /\ request' = [request EXCEPT ![p] = Empty]
  /\ binding' = [binding EXCEPT ![r] = request[p]]
  /\ UNCHANGED <<tool, processed, known>>
Reject(p) == /\ request[p] # Empty /\ ~Valid(p)
             /\ request' = [request EXCEPT ![p] = Empty]
             /\ UNCHANGED <<tool, claim, processed, known, appended, binding>>
Query(r) == /\ r \in claim /\ known' = known \cup {r}
            /\ UNCHANGED <<tool, claim, processed, appended, request, binding>>
LoseAck(r) == /\ known' = known \ {r}
              /\ UNCHANGED <<tool, claim, processed, appended, request, binding>>
Process(r) == /\ r \in tool /\ processed' = processed \cup {r}
              /\ UNCHANGED <<tool, claim, known, appended, request, binding>>
Release(r) == /\ r \in tool
              /\ (r \in known \/ r \in processed \/ Bug = "early")
              /\ tool' = tool \ {r}
              /\ UNCHANGED <<claim, processed, known, appended, request, binding>>
Crash == /\ request' = [p \in P |-> Empty] /\ known' = {}
         /\ UNCHANGED <<tool, claim, processed, appended, binding>>
Next == \/ \E p \in P, r \in R, t \in R, v \in {1, 2}: Start(p,r,t,v)
        \/ \E p \in P: Commit(p) \/ Reject(p)
        \/ \E r \in R: Query(r) \/ LoseAck(r) \/ Process(r) \/ Release(r)
        \/ Crash
Spec == Init /\ [][Next]_vars
TypeOK == /\ tool \subseteq R /\ claim \subseteq R /\ processed \subseteq R
          /\ known \subseteq claim /\ appended \in [R -> 0..2]
NoResponsibilityGap == R \ tool \subseteq claim \cup processed
AtMostOneAppend == \A r \in R: appended[r] <= 1
ClaimHasDurableRecord == \A r \in claim: appended[r] = 1
ClaimBinding == \A r \in claim: /\ binding[r].result = r
                                  /\ binding[r].tenant = Tenant(r)
                                  /\ binding[r].version = Version(r)
=============================================================================
