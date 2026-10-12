-------------------------- MODULE TerminalOwner --------------------------
EXTENDS Naturals, TLC
CONSTANTS UnsafeGap, UnsafeLateAdopt, EarlyReady
VARIABLES born, live, owner, closed, adopted, gap, illegalAdopt, nextPermit, nextRunning, ready
vars == <<born, live, owner, closed, adopted, gap, illegalAdopt, nextPermit, nextRunning, ready>>
Init == /\ born = FALSE /\ live = FALSE /\ owner = "none" /\ closed = FALSE
        /\ adopted = FALSE /\ gap = FALSE /\ illegalAdopt = FALSE
        /\ nextPermit = FALSE /\ nextRunning = FALSE /\ ready = FALSE
Create == /\ ~born /\ ~closed /\ born' = TRUE /\ live' = TRUE /\ owner' = "call"
          /\ UNCHANGED <<closed, adopted, gap, illegalAdopt, nextPermit, nextRunning, ready>>
Adopt == /\ live /\ owner = "call" /\ (~closed \/ UnsafeLateAdopt)
         /\ owner' = IF UnsafeGap THEN "none" ELSE "environment"
         /\ adopted' = TRUE /\ gap' = UnsafeGap /\ illegalAdopt' = closed
         /\ UNCHANGED <<born, live, closed, nextPermit, nextRunning, ready>>
FinishAdopt == /\ gap /\ gap' = FALSE /\ owner' = "environment"
               /\ UNCHANGED <<born, live, closed, adopted, illegalAdopt, nextPermit, nextRunning, ready>>
CloseCall == /\ ~closed /\ closed' = TRUE
             /\ UNCHANGED <<born, live, owner, adopted, gap, illegalAdopt, nextPermit, nextRunning, ready>>
ReleaseCall == /\ closed /\ owner = "call" /\ live /\ live' = FALSE /\ owner' = "none"
               /\ UNCHANGED <<born, closed, adopted, gap, illegalAdopt, nextPermit, nextRunning, ready>>
PermitNext == /\ owner = "environment" /\ live /\ ~nextPermit /\ nextPermit' = TRUE
              /\ UNCHANGED <<born, live, owner, closed, adopted, gap, illegalAdopt, nextRunning, ready>>
RunNext == /\ owner = "environment" /\ live /\ nextPermit /\ ~nextRunning
           /\ nextRunning' = TRUE
           /\ UNCHANGED <<born, live, owner, closed, adopted, gap, illegalAdopt, nextPermit, ready>>
StopEnvironment == /\ owner = "environment" /\ live
                   /\ live' = FALSE /\ owner' = "none" /\ nextRunning' = FALSE
                   /\ UNCHANGED <<born, closed, adopted, gap, illegalAdopt, nextPermit, ready>>
ReportReady == /\ born /\ ~ready /\ (adopted \/ EarlyReady)
               /\ ready' = TRUE
               /\ UNCHANGED <<born, live, owner, closed, adopted, gap, illegalAdopt, nextPermit, nextRunning>>
Next == ReportReady \/ Create \/ Adopt \/ FinishAdopt \/ CloseCall \/ ReleaseCall \/ PermitNext \/ RunNext \/ StopEnvironment
Spec == Init /\ [][Next]_vars
Safety == /\ (live => owner # "none") /\ ~illegalAdopt /\ (ready => adopted)
          /\ (nextRunning => nextPermit /\ owner = "environment")
=============================================================================
