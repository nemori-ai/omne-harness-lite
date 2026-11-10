-------------------- MODULE GovernanceContributionLifetime --------------------
EXTENDS Naturals, TLC
CONSTANT Bad
VARIABLE x
vars == <<x>>
Init == x = [state |-> "absent", sent |-> FALSE, inFlight |-> FALSE,
             callActive |-> TRUE, active |-> FALSE, sibling |-> TRUE,
             closing |-> FALSE, closed |-> FALSE, committedEver |-> FALSE]
Send == /\ ~x.sent /\ (x.callActive \/ Bad = "late-send")
        /\ (~x.closing \/ Bad = "late-send")
        /\ x' = [x EXCEPT !.sent = TRUE, !.inFlight = TRUE]
Arrival == /\ x.inFlight /\ x.state = "absent"
           /\ x' = [x EXCEPT !.state = "accepted", !.inFlight = FALSE]
FinishCall == /\ x.callActive /\ (x.sent \/ x.closing)
              /\ x' = [x EXCEPT !.callActive = FALSE]
Commit == /\ x.state = "accepted"
          /\ x' = [x EXCEPT !.state = "committed", !.active = TRUE, !.committedEver = TRUE]
BeginClose == /\ ~x.closing /\ x' = [x EXCEPT !.closing = TRUE]
Retire == /\ x.closing /\ x.state \in {"accepted", "committed", "aborted"}
          /\ x' = [x EXCEPT !.state = IF x.state = "accepted" \/ Bad = "rewrite-receipt" THEN "aborted" ELSE @,
                    !.active = FALSE, !.sibling = IF Bad = "sibling" THEN FALSE ELSE @]
DeclareClosed == /\ x.closing
                 /\ ((~x.callActive /\ ~x.inFlight) \/ Bad = "early-close")
                 /\ (x.state = "absent" \/ (x.state \in {"committed", "aborted"} /\ ~x.active))
                 /\ x' = [x EXCEPT !.closed = TRUE]
Observe == UNCHANGED x
Next == Send \/ Arrival \/ FinishCall \/ Commit \/ BeginClose \/ Retire \/ DeclareClosed \/ Observe
ClosedIsQuiescent == x.closed => ~x.callActive /\ ~x.inFlight /\ ~x.active
PreservedReceipt == x.committedEver => x.state = "committed"
SiblingPreserved == x.sibling
Spec == Init /\ [][Next]_vars
=============================================================================
