---------------------------- MODULE PendingReply ----------------------------
EXTENDS Naturals
CONSTANTS RequireDisposition, PreserveFacts
VARIABLES phase, disposition, pendingFacts, committedFacts, committedDisposition
vars == <<phase, disposition, pendingFacts, committedFacts, committedDisposition>>
Facts == {"response-id", "route", "headers", "usage", "reply"}
Init == /\ phase = "produced" /\ disposition = "none"
        /\ pendingFacts = {} /\ committedFacts = {}
        /\ committedDisposition = "none"
Handoff == /\ phase = "produced" /\ phase' = "pending"
           /\ pendingFacts' = IF PreserveFacts THEN Facts ELSE Facts \ {"headers"}
           /\ UNCHANGED <<disposition, committedFacts, committedDisposition>>
ChooseDisposition == /\ phase = "pending" /\ disposition = "none"
                     /\ disposition' \in {"persisted", "vetoed", "consumed"}
                     /\ UNCHANGED <<phase, pendingFacts, committedFacts, committedDisposition>>
Commit == /\ phase = "pending"
          /\ (RequireDisposition => disposition # "none")
          /\ phase' = "committed" /\ committedFacts' = pendingFacts
          /\ committedDisposition' = IF disposition = "none" THEN "persisted" ELSE disposition
          /\ UNCHANGED <<disposition, pendingFacts>>
Next == Handoff \/ ChooseDisposition \/ Commit
Spec == Init /\ [][Next]_vars
CompleteHandoff == phase \in {"pending", "committed"} => pendingFacts = Facts
NoInventedDisposition == phase = "committed" =>
                          /\ disposition # "none"
                          /\ committedDisposition = disposition
FactsSurvive == phase = "committed" => committedFacts = Facts
=============================================================================
