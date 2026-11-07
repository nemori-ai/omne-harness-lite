---------------------------- MODULE FinishRefusal ----------------------------
EXTENDS Naturals, TLC
CONSTANT WaitOnRefusal
VARIABLE phase, attempts, wakeEpoch, candidates, released, journalEnded,
         externalRevision, attemptRevision
vars == <<phase, attempts, wakeEpoch, candidates, released, journalEnded,
          externalRevision, attemptRevision>>
Init == /\ phase = "finishing" /\ attempts = 0 /\ wakeEpoch = 0
        /\ candidates = 1 /\ released = FALSE /\ journalEnded = FALSE
        /\ externalRevision = 0 /\ attemptRevision = 0
Attempt == /\ phase = "finishing" /\ attempts < 4
           /\ attempts' = attempts + 1
           /\ phase' = IF released THEN "ended" ELSE "reconsidering"
           /\ journalEnded' = released
           /\ attemptRevision' = externalRevision
           /\ UNCHANGED <<wakeEpoch, candidates, released, externalRevision>>
Reconsider == /\ phase = "reconsidering"
              /\ LET wait == WaitOnRefusal /\ externalRevision = attemptRevision
                 IN /\ phase' = IF wait THEN "waiting" ELSE "finishing"
                    /\ candidates' = IF wait THEN candidates ELSE candidates + 1
              /\ UNCHANGED <<attempts, wakeEpoch, released, journalEnded,
                              externalRevision, attemptRevision>>
Wake == /\ phase = "waiting" /\ wakeEpoch < 2
        /\ wakeEpoch' = wakeEpoch + 1 /\ phase' = "finishing"
        /\ UNCHANGED <<attempts, candidates, released, journalEnded,
                        externalRevision, attemptRevision>>
Release == /\ ~released /\ phase # "ended"
           /\ released' = TRUE
           /\ externalRevision' = externalRevision + 1
           /\ UNCHANGED <<phase, attempts, wakeEpoch, candidates, journalEnded, attemptRevision>>
Next == Attempt \/ Reconsider \/ Wake \/ Release
Spec == Init /\ [][Next]_vars
NoUnpromptedRetries == attempts <= wakeEpoch + externalRevision + 1
PreserveCandidate == candidates <= externalRevision + 1
OnlyJournalEnds == phase = "ended" => journalEnded
=============================================================================
