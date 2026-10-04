---------------------------- MODULE RetryHistory ----------------------------
EXTENDS Naturals, Sequences, FiniteSets
CONSTANT UseDispatchCount
VARIABLES history, dispatches, phase, decision, n
vars == <<history, dispatches, phase, decision, n>>
DefaultCount == Cardinality({i \in 1..Len(history) : history[i] = "default"})
Init == /\ history = <<>> /\ dispatches = 1 /\ phase = "failed"
        /\ decision = "none" /\ n = 0
ContinueLost == /\ phase = "failed" /\ dispatches < 3
                /\ dispatches' = dispatches + 1
                /\ UNCHANGED <<history, phase, decision, n>>
GiveDefault == /\ phase = "failed" /\ Len(history) < 2
               /\ history' = Append(history, "default")
               /\ UNCHANGED <<dispatches, phase, decision, n>>
GiveCustom == /\ phase = "failed" /\ Len(history) < 2
              /\ history' = Append(history, "custom")
              /\ UNCHANGED <<dispatches, phase, decision, n>>
Decide == /\ phase = "failed" /\ phase' = "decided"
          /\ LET h == IF UseDispatchCount THEN dispatches - 1 ELSE DefaultCount
             IN /\ n' = h + 1
                /\ decision' = IF h = 0 THEN "retry" ELSE "observed"
          /\ UNCHANGED <<history, dispatches>>
Next == ContinueLost \/ GiveDefault \/ GiveCustom \/ Decide
Spec == Init /\ [][Next]_vars
CountsOwnConclusions == phase = "decided" => n = DefaultCount + 1
ContinuationIsNotRetry == phase = "decided" =>
                            decision = IF DefaultCount = 0 THEN "retry" ELSE "observed"
=============================================================================
