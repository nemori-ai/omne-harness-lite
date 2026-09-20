--------------------------- MODULE RunEpochBarrier ---------------------------
\* Provisional finite event-history model for exact candidate 18ec53d.
\* It is not a model of an accepted contract.  Atomic actions represent a
\* Run-owner guard passing the common commit gate; stale preparations have no
\* durable effect and therefore do not appear as states.  The detailed
\* preparation/guard protocol needs separate provider conformance evidence.
EXTENDS Naturals, FiniteSets

CONSTANT Mutation

Epochs == 1..2
Ops == {"create", "yield", "interrupt", "session_stop", "reacquire",
         "resume", "supersede", "terminal", "force_finalize"}
CloseReasons == {"yield", "yield_forced", "reacquired", "interrupt",
                  "force_stop", "superseded", "completed", "failed",
                  "cancelled"}
RunStates == {"none", "running", "waiting", "interrupted", "stopping",
               "completed", "failed", "cancelled", "superseded"}
TerminalStates == {"completed", "failed", "cancelled", "superseded"}
NONE == "none"

VARIABLES runState, issuedCount, closeCount, closeReason, latestIssued,
          openEpoch, executor, terminationIntent, terminationEpoch,
          exposureOpen, businessUnknown, userHold, committedOps,
          receiptLookedUp

vars == <<runState, issuedCount, closeCount, closeReason, latestIssued,
          openEpoch, executor, terminationIntent, terminationEpoch,
          exposureOpen, businessUnknown, userHold, committedOps,
          receiptLookedUp>>

TypeOK ==
  /\ runState \in RunStates
  /\ issuedCount \in [Epochs -> 0..2]
  /\ closeCount \in [Epochs -> 0..2]
  /\ closeReason \in [Epochs -> CloseReasons \cup {NONE}]
  /\ latestIssued \in 0..2
  /\ openEpoch \in 0..2
  /\ executor \in 0..2
  /\ terminationIntent \in {NONE, "force_stop"}
  /\ terminationEpoch \in 0..2
  /\ exposureOpen \in BOOLEAN
  /\ businessUnknown \in BOOLEAN
  /\ userHold \in BOOLEAN
  /\ committedOps \subseteq Ops
  /\ receiptLookedUp \in BOOLEAN

Init ==
  /\ runState = "none"
  /\ issuedCount = [e \in Epochs |-> 0]
  /\ closeCount = [e \in Epochs |-> 0]
  /\ closeReason = [e \in Epochs |-> NONE]
  /\ latestIssued = 0
  /\ openEpoch = 0
  /\ executor = 0
  /\ terminationIntent = NONE
  /\ terminationEpoch = 0
  /\ exposureOpen = FALSE
  /\ businessUnknown = FALSE
  /\ userHold = FALSE
  /\ committedOps = {}
  /\ receiptLookedUp = FALSE

Create ==
  /\ runState = "none"
  /\ runState' = "running"
  /\ issuedCount' = [issuedCount EXCEPT ![1] = 1]
  /\ latestIssued' = 1
  /\ openEpoch' = 1
  /\ executor' = 1
  /\ exposureOpen' = TRUE
  /\ committedOps' = committedOps \cup {"create"}
  /\ UNCHANGED <<closeCount, closeReason, terminationIntent,
                 terminationEpoch, businessUnknown, userHold, receiptLookedUp>>

Wait ==
  /\ runState = "running"
  /\ runState' = "waiting"
  /\ UNCHANGED <<issuedCount, closeCount, closeReason, latestIssued,
                 openEpoch, executor, terminationIntent, terminationEpoch,
                 exposureOpen, businessUnknown, userHold, committedOps,
                 receiptLookedUp>>

Yield ==
  /\ runState \in {"running", "waiting"}
  /\ openEpoch = latestIssued
  /\ openEpoch > 0
  /\ closeCount' = [closeCount EXCEPT ![openEpoch] = 1]
  /\ closeReason' = [closeReason EXCEPT ![openEpoch] = "yield"]
  /\ openEpoch' = 0
  /\ executor' = 0
  /\ committedOps' = committedOps \cup {"yield"}
  /\ UNCHANGED <<runState, issuedCount, latestIssued, terminationIntent,
                 terminationEpoch, exposureOpen, businessUnknown, userHold,
                 receiptLookedUp>>

Interrupt ==
  /\ runState \in {"running", "waiting"}
  /\ runState' = "interrupted"
  /\ closeCount' = IF openEpoch > 0
                      THEN [closeCount EXCEPT ![openEpoch] = 1]
                      ELSE closeCount
  /\ closeReason' = IF openEpoch > 0
                       THEN [closeReason EXCEPT ![openEpoch] = "interrupt"]
                       ELSE closeReason
  /\ openEpoch' = 0
  /\ executor' = 0
  /\ committedOps' = committedOps \cup {"interrupt"}
  /\ UNCHANGED <<issuedCount, latestIssued, terminationIntent,
                 terminationEpoch, exposureOpen, businessUnknown, userHold,
                 receiptLookedUp>>

\* Session owns only userHold.  The Run-owner part references an earlier
\* close when no epoch is open.  The duplicate mutation recreates W5's
\* rejected unconditional closed{force_stop} behavior after Yield.
SessionForceStop ==
  /\ runState \in {"running", "waiting", "interrupted"}
  /\ runState' = IF runState = "interrupted" /\ ~exposureOpen
                    THEN "cancelled" ELSE "stopping"
  /\ terminationIntent' = "force_stop"
  /\ terminationEpoch' = latestIssued
  /\ userHold' = TRUE
  /\ closeCount' =
       IF openEpoch > 0 THEN [closeCount EXCEPT ![openEpoch] = 1]
       ELSE IF Mutation = "duplicate_close_after_yield"
               /\ closeReason[latestIssued] = "yield"
              THEN [closeCount EXCEPT ![latestIssued] = @ + 1]
              ELSE closeCount
  /\ closeReason' =
       IF openEpoch > 0 THEN [closeReason EXCEPT ![openEpoch] = "force_stop"]
       ELSE IF Mutation = "duplicate_close_after_yield"
               /\ closeReason[latestIssued] = "yield"
              THEN [closeReason EXCEPT ![latestIssued] = "force_stop"]
              ELSE closeReason
  /\ openEpoch' = 0
  /\ executor' = 0
  /\ committedOps' = committedOps \cup {"session_stop"}
  /\ UNCHANGED <<issuedCount, latestIssued, exposureOpen, businessUnknown,
                 receiptLookedUp>>

LoseExecutor ==
  /\ runState \in {"running", "waiting"}
  /\ executor > 0
  /\ executor' = 0
  /\ UNCHANGED <<runState, issuedCount, closeCount, closeReason, latestIssued,
                 openEpoch, terminationIntent, terminationEpoch, exposureOpen,
                 businessUnknown, userHold, committedOps, receiptLookedUp>>

\* Reacquire is legal with either an open predecessor (close+issue atomically)
\* or an already-closed predecessor (reference+issue).  A committed force-stop
\* intent is a hard rejection.  The mutation admits the forbidden successor.
Reacquire ==
  /\ latestIssued = 1
  /\ executor = 0
  /\ ((terminationIntent = NONE /\ runState \in {"running", "waiting"})
       \/ (Mutation = "issue_after_force_stop"
           /\ terminationIntent = "force_stop"))
  /\ issuedCount' = [issuedCount EXCEPT ![2] = 1]
  /\ latestIssued' = 2
  /\ openEpoch' = 2
  /\ executor' = 2
  /\ closeCount' = IF openEpoch = 1
                      THEN [closeCount EXCEPT ![1] = 1]
                      ELSE closeCount
  /\ closeReason' = IF openEpoch = 1
                       THEN [closeReason EXCEPT ![1] = "reacquired"]
                       ELSE closeReason
  /\ committedOps' = committedOps \cup {"reacquire"}
  /\ UNCHANGED <<runState, terminationIntent, terminationEpoch,
                 exposureOpen, businessUnknown, userHold, receiptLookedUp>>

\* Every successful resume issues a successor.  It never invents a resume
\* close reason: an open predecessor is closed as reacquired; a closed one is
\* referenced unchanged.
Resume ==
  /\ runState \in {"interrupted", "waiting"}
  /\ terminationIntent = NONE
  /\ latestIssued = 1
  /\ runState' = "running"
  /\ LET omitSuccessor == Mutation = "resume_closed_no_successor"
                              /\ openEpoch = 0
         omitOpenClose == Mutation = "resume_open_without_close"
                            /\ openEpoch = 1
     IN /\ issuedCount' = IF omitSuccessor
                             THEN issuedCount
                             ELSE [issuedCount EXCEPT ![2] = 1]
        /\ latestIssued' = IF omitSuccessor THEN latestIssued ELSE 2
        /\ openEpoch' = IF omitSuccessor THEN 0 ELSE 2
        /\ executor' = IF omitSuccessor THEN 0 ELSE 2
        /\ closeCount' = IF openEpoch = 1 /\ ~omitOpenClose
                            THEN [closeCount EXCEPT ![1] = 1]
                            ELSE closeCount
        /\ closeReason' = IF openEpoch = 1 /\ ~omitOpenClose
                             THEN [closeReason EXCEPT ![1] = "reacquired"]
                             ELSE closeReason
  /\ committedOps' = committedOps \cup {"resume"}
  /\ UNCHANGED <<terminationIntent, terminationEpoch, exposureOpen,
                 businessUnknown, userHold, receiptLookedUp>>

\* TS-20 may follow an interrupt close.  In that case it references the
\* interrupt closure and appends no closed{superseded} event.
Supersede ==
  /\ runState \in {"running", "waiting", "interrupted"}
  /\ runState' = "superseded"
  /\ closeCount' =
       IF openEpoch > 0 THEN [closeCount EXCEPT ![openEpoch] = 1]
       ELSE IF Mutation = "duplicate_supersede_close"
               /\ closeReason[latestIssued] = "interrupt"
              THEN [closeCount EXCEPT ![latestIssued] = @ + 1]
              ELSE closeCount
  /\ closeReason' =
       IF openEpoch > 0 THEN [closeReason EXCEPT ![openEpoch] = "superseded"]
       ELSE IF Mutation = "duplicate_supersede_close"
               /\ closeReason[latestIssued] = "interrupt"
              THEN [closeReason EXCEPT ![latestIssued] = "superseded"]
              ELSE closeReason
  /\ openEpoch' = 0
  /\ executor' = 0
  /\ committedOps' = committedOps \cup {"supersede"}
  /\ UNCHANGED <<issuedCount, latestIssued, terminationIntent,
                 terminationEpoch, exposureOpen, businessUnknown, userHold,
                 receiptLookedUp>>

Terminal(target) ==
  /\ target \in {"completed", "failed", "cancelled"}
  /\ runState \in {"running", "waiting", "interrupted"}
  /\ terminationIntent = NONE
  /\ runState' = target
  /\ closeCount' = IF openEpoch > 0
                      THEN [closeCount EXCEPT ![openEpoch] = 1]
                      ELSE closeCount
  /\ closeReason' = IF openEpoch > 0
       THEN [closeReason EXCEPT ![openEpoch] =
               IF Mutation = "wrong_terminal_reason" THEN "yield" ELSE target]
       ELSE closeReason
  /\ openEpoch' = 0
  /\ executor' = 0
  /\ committedOps' = committedOps \cup {"terminal"}
  /\ UNCHANGED <<issuedCount, latestIssued, terminationIntent,
                 terminationEpoch, exposureOpen, businessUnknown, userHold,
                 receiptLookedUp>>

SettleUnknown ==
  /\ exposureOpen
  /\ ~businessUnknown
  /\ businessUnknown' = TRUE
  /\ UNCHANGED <<runState, issuedCount, closeCount, closeReason, latestIssued,
                 openEpoch, executor, terminationIntent, terminationEpoch,
                 exposureOpen, userHold, committedOps, receiptLookedUp>>

ProvidePhysicalEvidence ==
  /\ exposureOpen
  /\ exposureOpen' = FALSE
  /\ UNCHANGED <<runState, issuedCount, closeCount, closeReason, latestIssued,
                 openEpoch, executor, terminationIntent, terminationEpoch,
                 businessUnknown, userHold, committedOps, receiptLookedUp>>

FinalizeForceStop ==
  /\ runState = "stopping"
  /\ terminationIntent = "force_stop"
  /\ ~exposureOpen
  /\ runState' = "cancelled"
  /\ committedOps' = committedOps \cup {"force_finalize"}
  /\ UNCHANGED <<issuedCount, closeCount, closeReason, latestIssued,
                 openEpoch, executor, terminationIntent, terminationEpoch,
                 exposureOpen, businessUnknown, userHold, receiptLookedUp>>

\* Lost-receipt lookup changes only caller observation in the correct model.
\* The mutation makes lookup append the operation's event a second time.
LookupCommitted ==
  /\ committedOps # {}
  /\ ~receiptLookedUp
  /\ receiptLookedUp' = TRUE
  /\ IF Mutation = "retry_repeats_event"
        /\ ("reacquire" \in committedOps \/ "resume" \in committedOps)
        THEN /\ issuedCount' = [issuedCount EXCEPT ![latestIssued] = @ + 1]
             /\ UNCHANGED <<closeCount, closeReason>>
        ELSE IF Mutation = "retry_repeats_event"
                /\ latestIssued > 0 /\ closeCount[latestIssued] > 0
          THEN /\ closeCount' = [closeCount EXCEPT ![latestIssued] = @ + 1]
               /\ UNCHANGED <<issuedCount, closeReason>>
          ELSE UNCHANGED <<issuedCount, closeCount, closeReason>>
  /\ UNCHANGED <<runState, latestIssued, openEpoch, executor,
                 terminationIntent, terminationEpoch, exposureOpen,
                 businessUnknown, userHold, committedOps>>

Next ==
  \/ Create \/ Wait \/ Yield \/ Interrupt \/ SessionForceStop
  \/ LoseExecutor \/ Reacquire \/ Resume \/ Supersede
  \/ \E target \in {"completed", "failed", "cancelled"} : Terminal(target)
  \/ SettleUnknown \/ ProvidePhysicalEvidence \/ FinalizeForceStop
  \/ LookupCommitted

Spec == Init /\ [][Next]_vars

UniqueIssue == \A e \in Epochs : issuedCount[e] <= 1
UniqueClose == \A e \in Epochs : closeCount[e] <= 1
CloseHasIssued == \A e \in Epochs : closeCount[e] > 0 => issuedCount[e] = 1
CloseRepresentation ==
  \A e \in Epochs : (closeCount[e] = 0) <=> (closeReason[e] = NONE)
IssuedLedgerMatchesLatest ==
  \/ (latestIssued = 0 /\ \A e \in Epochs : issuedCount[e] = 0)
  \/ (latestIssued = 1 /\ issuedCount[1] = 1 /\ issuedCount[2] = 0)
  \/ (latestIssued = 2 /\ issuedCount[1] = 1 /\ issuedCount[2] = 1)
OpenIsLatestUnclosed ==
  openEpoch = 0 \/
    (openEpoch = latestIssued /\ issuedCount[openEpoch] = 1
     /\ closeCount[openEpoch] = 0)
ExecutorOnlyForOpen == executor = 0 \/ executor = openEpoch
SuccessorRequiresClosedPredecessor ==
  latestIssued = 2 => closeCount[1] = 1
TerminalHasClosedLatest ==
  runState \in TerminalStates => latestIssued > 0 /\ closeCount[latestIssued] = 1
StoppingHasClosedLatest ==
  runState = "stopping" => latestIssued > 0 /\ closeCount[latestIssued] = 1
ForceStopIntentRejectsSuccessor ==
  terminationIntent = "force_stop" => latestIssued = terminationEpoch /\ openEpoch = 0
ForceStoppedOnlyAfterPhysicalGate ==
  runState = "cancelled" /\ terminationIntent = "force_stop" => ~exposureOpen
UnknownDoesNotClearExposure ==
  [][SettleUnknown => exposureOpen']_vars
YieldThenSessionStopReferencesClose ==
  [][SessionForceStop /\ openEpoch = 0 =>
       closeCount' = closeCount /\ closeReason' = closeReason]_vars
SupersedeReferencesExistingClose ==
  [][Supersede /\ openEpoch = 0 =>
       closeCount' = closeCount /\ closeReason' = closeReason]_vars
ReacquireOpenMapsReason ==
  [][Reacquire /\ openEpoch > 0 =>
       closeCount'[openEpoch] = 1 /\ closeReason'[openEpoch] = "reacquired"]_vars
ResumeAlwaysIssuesSuccessor ==
  [][Resume => latestIssued' = latestIssued + 1
                /\ openEpoch' = latestIssued'
                /\ issuedCount'[latestIssued'] = 1]_vars
ResumeOpenMapsReason ==
  [][Resume /\ openEpoch > 0 =>
       closeCount'[openEpoch] = 1 /\ closeReason'[openEpoch] = "reacquired"]_vars
TerminalOpenMapsReason ==
  [][\A target \in {"completed", "failed", "cancelled"} :
       Terminal(target) /\ openEpoch > 0 => closeReason'[openEpoch] = target]_vars
FinalizeReferencesExistingClose ==
  [][FinalizeForceStop => closeCount' = closeCount /\ closeReason' = closeReason]_vars
LookupDoesNotAppendEvents ==
  [][LookupCommitted => issuedCount' = issuedCount /\ closeCount' = closeCount
                         /\ closeReason' = closeReason]_vars

=============================================================================
