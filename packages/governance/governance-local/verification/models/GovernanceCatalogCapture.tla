-------------------- MODULE GovernanceCatalogCapture --------------------
EXTENDS Naturals, TLC
CONSTANT Bad
VARIABLE x
vars == <<x>>
Init == x = [state |-> "new", member |-> TRUE, held |-> FALSE,
             settled |-> FALSE, epoch |-> 0, acceptedEpoch |-> 0,
             qualifiedAtCapture |-> FALSE, currentAtCapture |-> FALSE,
             sealed |-> FALSE, delivered |-> FALSE]
Accept == /\ x.state = "new" /\ x.member
          /\ x' = [x EXCEPT !.state = "accepted", !.acceptedEpoch = x.epoch]
Reserve == /\ x.state = "accepted" /\ x.member /\ ~x.held
           /\ x' = [x EXCEPT !.held = TRUE]
Submit == /\ x.state = "accepted" /\ (x.held \/ Bad = "skip-held")
          /\ x' = [x EXCEPT !.state = "submitted"]
Capture == /\ (x.state = "submitted" \/ (Bad = "revive" /\ x.state = "aborted"))
           /\ (x.held \/ Bad \in {"skip-held", "revive"})
           /\ (x.epoch = x.acceptedEpoch \/ Bad = "stale-epoch")
           /\ x' = [x EXCEPT !.state = "committed",
                    !.qualifiedAtCapture = x.member /\ x.held,
                    !.currentAtCapture = x.epoch = x.acceptedEpoch]
Seal == /\ x.state \in {"accepted", "submitted"}
        /\ x' = [x EXCEPT !.state = "aborted", !.sealed = TRUE]
Settle == /\ x.state \in {"committed", "aborted"} /\ x.held
          /\ x' = [x EXCEPT !.held = FALSE, !.settled = TRUE]
Revoke == /\ x.member /\ ~x.held
          /\ x' = [x EXCEPT !.member = FALSE]
Restart == /\ x.epoch = 0 /\ x' = [x EXCEPT !.epoch = 1]
Deliver == /\ x.state = "committed"
           /\ (x.settled \/ Bad = "early-page")
           /\ x' = [x EXCEPT !.delivered = TRUE]
Observe == UNCHANGED x
Next == Accept \/ Reserve \/ Submit \/ Capture \/ Seal \/ Settle \/ Revoke \/ Restart \/ Deliver \/ Observe
QualifiedCapture == x.state = "committed" => x.qualifiedAtCapture
CurrentCapture == x.state = "committed" => x.currentAtCapture
NoRevival == x.sealed => x.state # "committed"
SettledDisclosure == x.delivered => x.settled
Spec == Init /\ [][Next]_vars
=============================================================================
