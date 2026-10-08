---------------------------- MODULE HostGate ----------------------------
EXTENDS Naturals, TLC
CONSTANTS UnsafeClear, UnsafePermit, UnsafeLaunch, UnsafeGo
VARIABLES phase, duty, queued, live, permitted, closed, go, illegalPermit
vars == <<phase, duty, queued, live, permitted, closed, go, illegalPermit>>
Init == /\ phase = 0 /\ duty = FALSE /\ queued = FALSE /\ live = FALSE
        /\ permitted = FALSE /\ closed = FALSE /\ go = FALSE /\ illegalPermit = FALSE
Plan == /\ phase = 0 /\ ~closed /\ phase' = 1 /\ duty' = TRUE
        /\ UNCHANGED <<queued, live, permitted, closed, go, illegalPermit>>
Launch == /\ (phase = 1 \/ (UnsafeLaunch /\ phase = 0)) /\ ~closed /\ phase' = 2 /\ queued' = TRUE
          /\ UNCHANGED <<duty, live, permitted, closed, go, illegalPermit>>
Arrive == /\ queued /\ queued' = FALSE /\ live' = TRUE /\ phase' = 3
          /\ UNCHANGED <<duty, permitted, closed, go, illegalPermit>>
Permit == /\ phase = 3 /\ ~permitted /\ (~closed \/ UnsafePermit)
          /\ permitted' = TRUE /\ illegalPermit' = closed
          /\ UNCHANGED <<phase, duty, queued, live, closed, go>>
Go == /\ phase = 3 /\ (permitted \/ UnsafeGo) /\ ~closed /\ ~go /\ go' = TRUE
      /\ UNCHANGED <<phase, duty, queued, live, permitted, closed, illegalPermit>>
Close == /\ ~closed /\ closed' = TRUE
         /\ UNCHANGED <<phase, duty, queued, live, permitted, go, illegalPermit>>
Stop == /\ closed /\ live /\ live' = FALSE /\ phase' = 4
        /\ UNCHANGED <<duty, queued, permitted, closed, go, illegalPermit>>
Clear == /\ duty /\ closed /\ ~live /\ (~queued \/ UnsafeClear)
         /\ duty' = FALSE
         /\ UNCHANGED <<phase, queued, live, permitted, closed, go, illegalPermit>>
Next == Plan \/ Launch \/ Arrive \/ Permit \/ Go \/ Close \/ Stop \/ Clear
Spec == Init /\ [][Next]_vars
Safety == /\ (live => duty) /\ (go => permitted) /\ ~illegalPermit
=============================================================================
