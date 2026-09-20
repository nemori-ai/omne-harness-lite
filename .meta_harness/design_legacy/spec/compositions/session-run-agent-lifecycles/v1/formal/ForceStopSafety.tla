-------------------------- MODULE ForceStopSafety --------------------------
\* Bounded model for RN-03/RN-05 in candidate 18ec53d.  It composes
\* three deliberately separate layers:
\*
\*   Tools:   business settlement and physical execution exposure;
\*   Run:     stopping -> cancelled only after every exposure is closed by
\*            identity-bound quiescence or verified isolation evidence;
\*   Session: a user hold and the safety barrier derived from stopping
\*            exposure are independent admission conditions.
\*
\* The bounded A/B/C trace covers the important interrupted-run case: A is
\* interrupted, B starts, A is upgraded to stopping without reclaiming B's
\* occupancy, and the resulting barrier blocks a supplement for B and a
\* later C until A crosses the physical gate.
EXTENDS Naturals, FiniteSets

CONSTANTS Mutation, OwnerSupports

Runs == {"A", "B", "C"}
RunStates == {"none", "running", "interrupted", "stopping", "cancelled", "completed"}
EvidenceKinds == {"unverified", "quiescent", "verified_isolation"}
IdentityCases == {"exact", "wrong_owner", "wrong_call", "wrong_attempt",
                  "wrong_scope", "wrong_epoch", "wrong_generation",
                  "wrong_fence", "replay"}
\* Each non-exact case abstracts one mismatching envelope field while keeping
\* all other fields equal to `expected`; this avoids a Cartesian product that
\* adds no identity-boundary behavior.
Ids == 1..2
NONE == "none"

VARIABLES
  run, occupant, userHold, supplementTaken, cStarted,
  exposureOpen, expected, businessSettlement,
  ownerAlive, ownerGeneration, timeouts, restarts

vars == <<run, occupant, userHold, supplementTaken, cStarted,
          exposureOpen, expected, businessSettlement,
          ownerAlive, ownerGeneration, timeouts, restarts>>

SafetyBarrier == run["A"] = "stopping" /\ exposureOpen
Strong(k) == k \in {"quiescent", "verified_isolation"}
Matches(identityCase) == identityCase = "exact"

TypeOK ==
  /\ run \in [Runs -> RunStates]
  /\ occupant \in Runs \cup {NONE}
  /\ userHold \in BOOLEAN
  /\ supplementTaken \in BOOLEAN
  /\ cStarted \in BOOLEAN
  /\ exposureOpen \in BOOLEAN
  /\ expected \in [owner : Ids, call : Ids, attempt : Ids, scope : Ids,
                    epoch : Ids, providerGeneration : Ids,
                    fenceRevision : Ids]
  /\ businessSettlement \in {"none", "unknown"}
  /\ ownerAlive \in BOOLEAN
  /\ ownerGeneration \in Ids
  /\ timeouts \in 0..1
  /\ restarts \in 0..1

Init ==
  /\ run = [r \in Runs |-> IF r = "A" THEN "running" ELSE "none"]
  /\ occupant = "A"
  /\ userHold = FALSE
  /\ supplementTaken = FALSE
  /\ cStarted = FALSE
  /\ exposureOpen = TRUE
  /\ expected = [owner |-> 1, call |-> 1, attempt |-> 1, scope |-> 1,
                  epoch |-> 1, providerGeneration |-> 1,
                  fenceRevision |-> 1]
  /\ businessSettlement = "none"
  /\ ownerAlive = TRUE
  /\ ownerGeneration = 1
  /\ timeouts = 0
  /\ restarts = 0

\* Run layer: interrupt releases A's driving occupancy but does not prove its
\* accepted external execution quiescent.
InterruptA ==
  /\ run["A"] = "running"
  /\ run' = [run EXCEPT !["A"] = "interrupted"]
  /\ occupant' = NONE
  /\ UNCHANGED <<userHold, supplementTaken, cStarted, exposureOpen, expected,
                 businessSettlement, ownerAlive, ownerGeneration,
                 timeouts, restarts>>

StartB ==
  /\ run["A"] = "interrupted"
  /\ run["B"] = "none"
  /\ occupant = NONE
  /\ ~userHold
  /\ run' = [run EXCEPT !["B"] = "running"]
  /\ occupant' = "B"
  /\ UNCHANGED <<userHold, supplementTaken, cStarted, exposureOpen, expected,
                 businessSettlement, ownerAlive, ownerGeneration,
                 timeouts, restarts>>

ForceStopA ==
  /\ run["A"] = "running" \/ (run["A"] = "interrupted" /\ exposureOpen)
  /\ run' = [run EXCEPT !["A"] = "stopping",
                        !["B"] = IF Mutation = "stops_existing_b" THEN "cancelled" ELSE @]
  /\ occupant' = IF Mutation = "reoccupy_interrupted" /\ run["A"] = "interrupted"
                    THEN "A"
                    ELSE occupant
  /\ UNCHANGED <<userHold, supplementTaken, cStarted, exposureOpen, expected,
                 businessSettlement, ownerAlive, ownerGeneration,
                 timeouts, restarts>>

SessionForceStopA ==
  /\ run["A"] = "running" \/ (run["A"] = "interrupted" /\ exposureOpen)
  /\ run' = [run EXCEPT !["A"] = "stopping"]
  /\ occupant' = occupant
  /\ userHold' = TRUE
  /\ UNCHANGED <<supplementTaken, cStarted, exposureOpen, expected,
                 businessSettlement, ownerAlive, ownerGeneration,
                 timeouts, restarts>>

\* Interrupted has no occupancy or open epoch.  Direct cancellation is
\* permitted only after all execution exposures passed the physical gate.
DirectForceStopInterrupted ==
  /\ run["A"] = "interrupted"
  /\ (~exposureOpen \/ Mutation = "direct_cancel_open_exposure")
  /\ run' = [run EXCEPT !["A"] = "cancelled"]
  /\ occupant' = occupant
  /\ UNCHANGED <<userHold, supplementTaken, cStarted, exposureOpen, expected,
                 businessSettlement, ownerAlive, ownerGeneration,
                 timeouts, restarts>>

DirectSessionForceStopInterrupted ==
  /\ run["A"] = "interrupted"
  /\ (~exposureOpen \/ Mutation = "direct_cancel_open_exposure")
  /\ run' = [run EXCEPT !["A"] = "cancelled"]
  /\ occupant' = occupant
  /\ userHold' = TRUE
  /\ UNCHANGED <<supplementTaken, cStarted, exposureOpen, expected,
                 businessSettlement, ownerAlive, ownerGeneration,
                 timeouts, restarts>>

\* Tools layer: unknown is a business outcome observation, not a physical
\* stop fact.  The mutation is expected to violate UnknownKeepsExposure.
SettleUnknown ==
  /\ businessSettlement = "none"
  /\ businessSettlement' = "unknown"
  /\ exposureOpen' = IF Mutation = "settlement_clears_exposure"
                       THEN FALSE ELSE exposureOpen
  /\ UNCHANGED <<run, occupant, userHold, supplementTaken, cStarted, expected,
                 ownerAlive, ownerGeneration, timeouts, restarts>>

ReportEvidence(k, identityCase) ==
  /\ k \in EvidenceKinds
  /\ identityCase \in IdentityCases
  /\ run["A"] \in {"interrupted", "stopping"}
  /\ ownerAlive
  /\ LET exact == Matches(identityCase)
         accepted == exact /\ Strong(k)
         wrongAccepted == Mutation = "wrong_identity_clears" /\ Strong(k)
                          /\ identityCase # "exact"
         unverifiedAccepted == Mutation = "unverified_clears" /\ exact /\ k = "unverified"
         replayAccepted == Mutation = "replay_closes_new_exposure"
                           /\ Strong(k) /\ identityCase = "replay"
                           /\ expected.attempt = 2
     IN exposureOpen' = IF accepted \/ wrongAccepted \/ unverifiedAccepted \/ replayAccepted
                          THEN FALSE ELSE exposureOpen
  /\ userHold' = IF Mutation = "evidence_releases_hold" /\ ~exposureOpen'
                   THEN FALSE ELSE userHold
  /\ UNCHANGED <<run, occupant, supplementTaken, cStarted, expected,
                 businessSettlement, ownerAlive, ownerGeneration, timeouts,
                 restarts>>

Timeout ==
  /\ exposureOpen
  /\ timeouts = 0
  /\ timeouts' = 1
  /\ exposureOpen' = IF Mutation = "timeout_clears_exposure"
                       THEN FALSE ELSE exposureOpen
  /\ UNCHANGED <<run, occupant, userHold, supplementTaken, cStarted, expected,
                 businessSettlement, ownerAlive, ownerGeneration,
                 restarts>>

OwnerCrash ==
  /\ ownerAlive
  /\ restarts = 0
  /\ ownerAlive' = FALSE
  /\ UNCHANGED <<run, occupant, userHold, supplementTaken, cStarted,
                 exposureOpen, expected, businessSettlement, ownerGeneration,
                 timeouts, restarts>>

OwnerRestart ==
  /\ ~ownerAlive
  /\ restarts = 0
  /\ ownerAlive' = TRUE
  /\ ownerGeneration' = 2
  /\ restarts' = 1
  /\ exposureOpen' = IF Mutation = "restart_clears_exposure"
                       THEN FALSE ELSE exposureOpen
  /\ UNCHANGED <<run, occupant, userHold, supplementTaken, cStarted, expected,
                 businessSettlement, timeouts>>

\* Session layer: both admission paths consult the derived barrier and user
\* hold.  Existing B is not revoked; it may finish already admitted work.
TakeSupplementB ==
  /\ run["B"] = "running"
  /\ ~supplementTaken
  /\ ~userHold
  /\ (~SafetyBarrier \/ Mutation = "barrier_allows_supplement")
  /\ supplementTaken' = TRUE
  /\ UNCHANGED <<run, occupant, userHold, cStarted, exposureOpen, expected,
                 businessSettlement, ownerAlive, ownerGeneration,
                 timeouts, restarts>>

CompleteB ==
  /\ run["B"] = "running"
  /\ run' = [run EXCEPT !["B"] = "completed"]
  /\ occupant' = IF occupant = "B" THEN NONE ELSE occupant
  /\ UNCHANGED <<userHold, supplementTaken, cStarted, exposureOpen, expected,
                 businessSettlement, ownerAlive, ownerGeneration,
                 timeouts, restarts>>

StartC ==
  /\ run["C"] = "none"
  /\ occupant = NONE
  /\ ~userHold
  /\ (~SafetyBarrier \/ Mutation = "barrier_allows_new_run")
  /\ run' = [run EXCEPT !["C"] = "running"]
  /\ occupant' = "C"
  /\ cStarted' = TRUE
  /\ UNCHANGED <<userHold, supplementTaken, exposureOpen, expected,
                 businessSettlement, ownerAlive, ownerGeneration,
                 timeouts, restarts>>

ContinueQueue ==
  /\ userHold
  /\ userHold' = FALSE
  /\ UNCHANGED <<run, occupant, supplementTaken, cStarted, exposureOpen,
                 expected, businessSettlement, ownerAlive, ownerGeneration,
                 timeouts, restarts>>

FinalizeA ==
  /\ run["A"] = "stopping"
  /\ (~exposureOpen \/ Mutation = "premature_cancel")
  /\ run' = [run EXCEPT !["A"] = "cancelled"]
  /\ occupant' = IF occupant = "A" THEN NONE ELSE occupant
  /\ UNCHANGED <<userHold, supplementTaken, cStarted, exposureOpen, expected,
                 businessSettlement, ownerAlive, ownerGeneration,
                 timeouts, restarts>>

\* Reuse the bounded call identity for a genuinely new execution generation.
\* A replay carrying attempt/epoch/generation/fence = 1 must not close it.
StartNewAttemptA ==
  /\ run["A"] = "cancelled"
  /\ occupant = NONE
  /\ ~userHold
  /\ run' = [run EXCEPT !["A"] = "running"]
  /\ occupant' = "A"
  /\ exposureOpen' = TRUE
  /\ expected' = [owner |-> 1, call |-> 1, attempt |-> 2, scope |-> 1,
                   epoch |-> 2, providerGeneration |-> 2,
                   fenceRevision |-> 2]
  /\ businessSettlement' = "none"
  /\ UNCHANGED <<userHold, supplementTaken, cStarted, ownerAlive,
                 ownerGeneration, timeouts, restarts>>

ProvideExactEvidence ==
  OwnerSupports /\ ReportEvidence("quiescent", "exact")

Next ==
  \/ InterruptA \/ StartB \/ ForceStopA \/ SessionForceStopA
  \/ DirectForceStopInterrupted \/ DirectSessionForceStopInterrupted
  \/ SettleUnknown \/ Timeout \/ OwnerCrash \/ OwnerRestart
  \/ TakeSupplementB \/ CompleteB \/ StartC \/ ContinueQueue
  \/ FinalizeA \/ StartNewAttemptA
  \/ \E k \in EvidenceKinds, identityCase \in IdentityCases :
       ReportEvidence(k, identityCase)

Spec == Init /\ [][Next]_vars
SupportedSpec ==
  /\ Spec
  /\ WF_vars(ProvideExactEvidence)
  /\ WF_vars(FinalizeA)
  /\ WF_vars(OwnerRestart)

\* Safety properties.  Action properties distinguish rejected inputs from
\* the later valid evidence that is allowed to close an exposure.
CancelledOnlyAfterGate == run["A"] = "cancelled" => ~exposureOpen
ExistingBNotRevoked == run["B"] = "running" => occupant = "B"
StoppingADoesNotTakeBSlot ==
  run["A"] = "stopping" /\ run["B"] = "running" => occupant = "B"
ForceStopPreservesExistingB ==
  [][run["A"] = "interrupted" /\ run["B"] = "running" /\ ForceStopA
       => run'["B"] = "running" /\ occupant' = "B"]_vars

UnknownKeepsExposure == [][SettleUnknown => exposureOpen' = exposureOpen]_vars
TimeoutKeepsExposure == [][Timeout => exposureOpen' = exposureOpen]_vars
RestartKeepsExposure == [][OwnerRestart => exposureOpen' = exposureOpen]_vars
HoldIndependentOfGate ==
  [][userHold /\ exposureOpen /\ ~exposureOpen' => userHold']_vars
BarrierBlocksAdmission ==
  [][SafetyBarrier =>
       (supplementTaken' = supplementTaken /\ cStarted' = cStarted)]_vars
RejectedEvidenceKeepsExposure ==
  [][\A k \in EvidenceKinds, identityCase \in IdentityCases :
       (ReportEvidence(k, identityCase)
        /\ ~(Strong(k) /\ Matches(identityCase)))
         => exposureOpen' = exposureOpen]_vars

SupportedStoppingResolves ==
  (run["A"] = "stopping" /\ exposureOpen) ~> run["A"] = "cancelled"

=============================================================================
