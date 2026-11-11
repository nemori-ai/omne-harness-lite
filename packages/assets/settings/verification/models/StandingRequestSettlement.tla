---------------------- MODULE StandingRequestSettlement ----------------------
EXTENDS Naturals, TLC
CONSTANT Bad
VARIABLES source, sourceRequest, destination, proof, proofRequest,
          completed, terminal, inFlight, crashed
vars == <<source, sourceRequest, destination, proof, proofRequest,
          completed, terminal, inFlight, crashed>>
Init == /\ source = "absent" /\ sourceRequest = 0 /\ destination = "pending"
        /\ proof = "none" /\ proofRequest = 0 /\ completed = FALSE
        /\ terminal = "none" /\ inFlight = TRUE /\ crashed = FALSE
Reserve == /\ inFlight /\ inFlight' = FALSE
           /\ source' = IF source = "absent" \/ Bad = "late" THEN "held" ELSE source
           /\ sourceRequest' = IF source' = "held" THEN 1 ELSE sourceRequest
           /\ UNCHANGED <<destination,proof,proofRequest,completed,terminal,crashed>>
DropReserve == /\ inFlight /\ inFlight' = FALSE
               /\ UNCHANGED <<source,sourceRequest,destination,proof,proofRequest,completed,terminal,crashed>>
Commit == /\ source = "held" /\ destination = "pending"
          /\ destination' = "committed"
          /\ UNCHANGED <<source,sourceRequest,proof,proofRequest,completed,terminal,inFlight,crashed>>
Seal(request) == /\ ~completed /\ (request = 1 \/ Bad = "binding")
                 /\ destination' = IF destination = "pending" THEN "aborted" ELSE destination
                 /\ proof' = destination' /\ proofRequest' = request
                 /\ UNCHANGED <<source,sourceRequest,completed,terminal,inFlight,crashed>>
Finish == /\ ~completed /\ (proof # "none" \/ Bad = "false-close")
          /\ IF Bad = "no-close" /\ source = "absent"
             THEN /\ proof' = "none" /\ proofRequest' = 0
                  /\ UNCHANGED <<source,sourceRequest,completed,terminal>>
             ELSE /\ source' = "settled" /\ completed' = TRUE
                  /\ sourceRequest' = IF proofRequest = 0 THEN 1 ELSE proofRequest
                  /\ terminal' = IF proof = "none" THEN "aborted" ELSE proof
                  /\ UNCHANGED <<proof,proofRequest>>
          /\ UNCHANGED <<destination,inFlight,crashed>>
Restart == /\ ~crashed /\ crashed' = TRUE /\ proof' = "none" /\ proofRequest' = 0
           /\ UNCHANGED <<source,sourceRequest,destination,completed,terminal,inFlight>>
Next == Reserve \/ DropReserve \/ Commit \/ (\E request \in {1,2}: Seal(request)) \/ Finish \/ Restart \/ UNCHANGED vars
NoLateHold == completed => source = "settled"
TerminalBeforeCompletion == completed => (terminal = destination /\ destination # "pending")
BoundCompletion == completed => sourceRequest = 1
Completion == <>completed
Spec == Init /\ [][Next]_vars /\ WF_vars(Seal(1)) /\ WF_vars(Finish)
=============================================================================
