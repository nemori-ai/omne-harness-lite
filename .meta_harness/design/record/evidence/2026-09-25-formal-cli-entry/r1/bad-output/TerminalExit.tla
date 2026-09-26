-------------------------- MODULE TerminalExit --------------------------
EXTENDS Naturals
CONSTANT Mutation
VARIABLES phase, raw, stopping, localReleased, outputs
vars == <<phase, raw, stopping, localReleased, outputs>>
Init == /\ phase = "input" /\ raw = TRUE /\ stopping = FALSE
        /\ localReleased = FALSE /\ outputs = 0
Input == /\ phase = "input" /\ ~stopping
         /\ phase' = "ready" /\ UNCHANGED <<raw, stopping, localReleased, outputs>>
Restore == /\ raw /\ (phase # "input" \/ stopping)
           /\ raw' = FALSE /\ UNCHANGED <<phase, stopping, localReleased, outputs>>
Invoke == /\ phase = "ready" /\ ~raw /\ ~stopping
          /\ phase' = "network" /\ UNCHANGED <<raw, stopping, localReleased, outputs>>
Stop == /\ ~stopping /\ phase # "closed"
        /\ stopping' = TRUE /\ UNCHANGED <<phase, raw, localReleased, outputs>>
CancelInput == /\ stopping /\ phase \in {"input", "ready"}
               /\ phase' = "report" /\ UNCHANGED <<raw, stopping, localReleased, outputs>>
NetworkDone == /\ phase = "network" /\ phase' = "settlement"
               /\ UNCHANGED <<raw, stopping, localReleased, outputs>>
SettlementDone == /\ phase = "settlement" /\ ~localReleased
                  /\ phase' = "report" /\ UNCHANGED <<raw, stopping, localReleased, outputs>>
Output == /\ phase = "report" /\ ~raw /\ outputs = 0
          /\ outputs' = 1 /\ phase' = "written"
          /\ UNCHANGED <<raw, stopping, localReleased>>
BadOutput == /\ Mutation = "double-output" /\ phase = "written" /\ outputs = 1
             /\ outputs' = 2 /\ UNCHANGED <<phase, raw, stopping, localReleased>>
Close == /\ (phase = "written"
             \/ (Mutation = "early-release" /\ stopping /\ phase = "settlement")
             \/ (Mutation = "no-restore" /\ stopping /\ phase = "report"))
         /\ phase' = "closed" /\ localReleased' = TRUE
         /\ UNCHANGED <<raw, stopping, outputs>>
Next == Input \/ Restore \/ Invoke \/ Stop \/ CancelInput \/ NetworkDone
        \/ SettlementDone \/ Output \/ BadOutput \/ Close
        \/ (phase = "closed" /\ UNCHANGED vars)
TypeOK == /\ phase \in {"input", "ready", "network", "settlement", "report", "written", "closed"}
          /\ raw \in BOOLEAN /\ stopping \in BOOLEAN /\ localReleased \in BOOLEAN
          /\ outputs \in 0..2
TerminalRestored == phase = "closed" => ~raw
OneOutput == outputs <= 1
(* Without a finished report, no ordinary closure may claim dependencies released. *)
NoEarlyRelease == localReleased => outputs >= 1
Spec == Init /\ [][Next]_vars /\ WF_vars(Next)
EventuallyClosed == <>(phase = "closed")
=============================================================================
