---------------------- MODULE StandingRequestSettlement ----------------------
EXTENDS Naturals, TLC
CONSTANT Bad
VARIABLES source, sourceRequest, destination, proof, proofRequest,
          completed, terminal, inFlight, crashed, released
vars == <<source, sourceRequest, destination, proof, proofRequest,
          completed, terminal, inFlight, crashed, released>>
Init == /\ source = "absent" /\ sourceRequest = 0 /\ destination = "pending"
        /\ proof = "none" /\ proofRequest = 0 /\ completed = FALSE
        /\ terminal = "none" /\ inFlight = TRUE /\ crashed = FALSE
        /\ released = FALSE
Reserve == /\ inFlight /\ inFlight' = FALSE
           /\ source' = IF source = "absent" \/ Bad = "late" THEN "held" ELSE source
           /\ sourceRequest' = IF source' = "held" THEN 1 ELSE sourceRequest
           /\ UNCHANGED <<destination,proof,proofRequest,completed,terminal,crashed,released>>
DropReserve == /\ inFlight /\ inFlight' = FALSE
               /\ UNCHANGED <<source,sourceRequest,destination,proof,proofRequest,completed,terminal,crashed,released>>
Commit == /\ source = "held" /\ destination = "pending"
          /\ destination' = "committed"
          /\ UNCHANGED <<source,sourceRequest,proof,proofRequest,completed,terminal,inFlight,crashed,released>>
Seal(request) == /\ ~completed /\ (request = 1 \/ Bad = "binding")
                 /\ destination' = IF destination = "pending" THEN "aborted" ELSE destination
                 /\ proof' = destination' /\ proofRequest' = request
                 /\ UNCHANGED <<source,sourceRequest,completed,terminal,inFlight,crashed,released>>
Finish == /\ ~completed /\ (proof # "none" \/ Bad = "false-close")
          /\ IF Bad = "no-close" /\ source = "absent"
             THEN /\ proof' = "none" /\ proofRequest' = 0
                  /\ UNCHANGED <<source,sourceRequest,completed,terminal>>
             ELSE /\ source' = "settled" /\ completed' = TRUE
                  /\ sourceRequest' = IF proofRequest = 0 THEN 1 ELSE proofRequest
                  /\ terminal' = IF proof = "none" THEN "aborted" ELSE proof
                  /\ UNCHANGED <<proof,proofRequest>>
          /\ UNCHANGED <<destination,inFlight,crashed,released>>
Release == /\ Bad # "no-release" /\ ~released
           /\ (source = "settled" \/ (Bad = "release-held" /\ source = "held"))
           /\ (~inFlight \/ Bad = "early-release")
           /\ source' = "absent" /\ released' = TRUE
           /\ UNCHANGED <<sourceRequest,destination,proof,proofRequest,completed,terminal,inFlight,crashed>>
Restart == /\ ~crashed /\ crashed' = TRUE /\ proof' = "none" /\ proofRequest' = 0
           /\ UNCHANGED <<source,sourceRequest,destination,completed,terminal,inFlight,released>>
Next == Reserve \/ DropReserve \/ Commit \/ (\E request \in {1,2}: Seal(request)) \/ Finish
        \/ Release \/ Restart \/ UNCHANGED vars
NoLateHold == completed => (source = "settled" \/ (source = "absent" /\ released))
TerminalBeforeCompletion == completed => (terminal = destination /\ destination # "pending")
BoundCompletion == completed => sourceRequest = 1
ReleaseOnlySettled == released => completed
Completion == <>completed
Released == <>released
Spec == Init /\ [][Next]_vars /\ WF_vars(Reserve \/ DropReserve) /\ WF_vars(Seal(1))
        /\ WF_vars(Finish) /\ WF_vars(Release)
=============================================================================
