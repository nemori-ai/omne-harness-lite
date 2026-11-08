------------------------- MODULE FailureClosure -------------------------
EXTENDS Naturals, TLC
CONSTANTS Bug, CallMode
VARIABLE s
vars == <<s>>
Init == s = [phase |-> "business", fault |-> FALSE, pending |-> 0,
             original |-> 0, request |-> 0, durable |-> FALSE, tried |-> FALSE,
             cancel |-> FALSE, candidate |-> "none", basis |-> FALSE,
             inputHeld |-> FALSE, receivedA |-> FALSE, receivedB |-> FALSE,
             toolHeld |-> (CallMode = "tool"), beforeTerminal |-> FALSE,
             ended |-> FALSE, current |-> 1, f1Outage |-> FALSE,
             f3Outage |-> FALSE, resume |-> "none"]
ThrowAfterWrite == /\ s.phase = "business" /\ ~s.tried /\ ~s.fault
                   /\ s' = [s EXCEPT !.phase = "original", !.pending = 1,
                        !.original = 1, !.request = 1, !.durable = TRUE, !.tried = TRUE]
Recognize == /\ s.phase = "original" /\ s.pending # 0
             /\ s' = [s EXCEPT !.pending = 0,
                        !.phase = IF s.fault THEN "F1" ELSE "business"]
ChangeOriginal == /\ Bug = "original" /\ s.pending = 1
                  /\ s' = [s EXCEPT !.pending = 2, !.request = 2]
NodeFailure == /\ s.phase = "business" /\ ~s.fault /\ s.pending = 0
               /\ s' = [s EXCEPT !.fault = TRUE, !.phase = "F1"]
Cancel == /\ ~s.cancel /\ ~s.ended
          /\ s' = [s EXCEPT !.cancel = TRUE]
F1Unavailable == /\ s.phase = "F1" /\ ~s.f1Outage
                 /\ s' = [s EXCEPT !.phase = "wait", !.resume = "F1", !.f1Outage = TRUE]
F3Unavailable == /\ s.phase = "F3" /\ ~s.f3Outage
                 /\ s' = [s EXCEPT !.phase = "wait", !.resume = "F3", !.f3Outage = TRUE]
Wake == /\ s.phase = "wait"
        /\ s' = [s EXCEPT !.phase = IF Bug = "reentry" THEN "business" ELSE s.resume]
ReadBasis == /\ s.phase = "F1" /\ ~s.basis
             /\ s' = [s EXCEPT !.basis = TRUE]
FixCandidate == /\ s.phase = "F1" /\ s.basis /\ s.pending = 0
                /\ s' = [s EXCEPT !.candidate = IF s.cancel THEN "cancelled" ELSE "node-failed",
                           !.phase = "F2"]
BeforeTerminal == /\ s.phase = "F2" /\ s.pending = 0
                  /\ s' = [s EXCEPT !.beforeTerminal = TRUE, !.phase = "F3"]
CancelRoute == /\ s.cancel /\ s.candidate = "node-failed" /\ ~s.ended
               /\ s.pending = 0 /\ s.phase \in {"F2", "F3"}
               /\ s' = [s EXCEPT !.candidate = "cancelled", !.beforeTerminal = FALSE, !.phase = "F2"]
RetainInput == /\ s.phase = "F3" /\ ~s.inputHeld
               /\ s' = [s EXCEPT !.inputHeld = TRUE]
ReceiveOriginal == /\ ~s.receivedA /\ ~s.receivedB
                   /\ s' = IF Bug = "late" /\ s.current = 2
                            THEN [s EXCEPT !.receivedB = TRUE]
                            ELSE [s EXCEPT !.receivedA = TRUE]
Finish == /\ s.phase = "F3" /\ s.pending = 0 /\ s.inputHeld /\ s.beforeTerminal
          /\ (s.receivedA \/ s.toolHeld \/ Bug = "early")
          /\ (~s.cancel \/ s.candidate = "cancelled")
          /\ s' = [s EXCEPT !.ended = TRUE, !.phase = "ended"]
StartNext == /\ s.ended /\ s.current = 1
             /\ s' = [s EXCEPT !.current = 2]
Next == ThrowAfterWrite \/ Recognize \/ ChangeOriginal \/ NodeFailure \/ Cancel
        \/ F1Unavailable \/ F3Unavailable \/ Wake \/ ReadBasis \/ FixCandidate
        \/ BeforeTerminal \/ CancelRoute \/ RetainInput \/ ReceiveOriginal \/ Finish \/ StartNext
Spec == Init /\ [][Next]_vars
LiveSpec == Spec /\ WF_vars(Recognize) /\ WF_vars(NodeFailure) /\ WF_vars(Wake)
            /\ WF_vars(ReadBasis) /\ WF_vars(FixCandidate) /\ WF_vars(BeforeTerminal)
            /\ WF_vars(CancelRoute) /\ WF_vars(RetainInput) /\ WF_vars(ReceiveOriginal)
            /\ WF_vars(Finish)
UnknownOriginal == s.pending = 0 \/ (s.pending = s.original /\ s.request = s.original)
NoPrematureEnd == s.ended => (s.pending = 0 /\ s.inputHeld /\ (s.receivedA \/ s.toolHeld)
                            /\ s.beforeTerminal /\ s.candidate # "none")
NoBusinessAfterFault == s.fault => s.phase # "business"
OldExecutionIsolation == ~s.receivedB
EffectiveCancelFirst == s.ended /\ s.cancel => s.candidate = "cancelled"
FiniteHealthyEnds == <>s.ended
=============================================================================
