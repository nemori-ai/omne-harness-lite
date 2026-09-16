--------------------------- MODULE ChangesDelivery -------------------------
EXTENDS Naturals, TLC

(***************************************************************************)
(* MS-08/MS-11/MS-22 + SE-10 finite client protocol. Position 1 is a       *)
(* state-only closing.pending batch, 2 is hidden-only, 3 is a visible body  *)
(* batch with a last fact hint. Hints are never coverage proof.             *)
(***************************************************************************)
CONSTANTS Mutation, StopAt
ASSUME StopAt \in 1..3
ASSUME Mutation \in {"none", "overshoot_concrete_to", "hint_installs",
                      "omit_state_only", "skip_body", "hidden_without_cover",
                      "stale_hidden_install"}

VARIABLES commitPosition, projectionCompleteTo, sentHint, hintSeen,
          requestPhase, requestAfter, requestTo, requestLatest,
          requestVisibility, resolvedTo, coveredThrough,
          visibilityVersion, clientVisibility, clientCursor, historyInstalled,
          stateUpdatesInstalled, closingSeen, bodyInstalled,
          hiddenCoverageInstalled, semanticCloses, bodyAvailable,
          bodyFailureUsed, invalidVisibilityInstall,
          clientCrash

vars == <<commitPosition, projectionCompleteTo, sentHint, hintSeen,
          requestPhase, requestAfter, requestTo, requestLatest,
          requestVisibility, resolvedTo, coveredThrough,
          visibilityVersion, clientVisibility, clientCursor, historyInstalled,
          stateUpdatesInstalled, closingSeen, bodyInstalled,
          hiddenCoverageInstalled, semanticCloses, bodyAvailable,
          bodyFailureUsed, invalidVisibilityInstall,
          clientCrash>>

Init ==
  /\ commitPosition = 0 /\ projectionCompleteTo = 0
  /\ sentHint = FALSE /\ hintSeen = FALSE
  /\ requestPhase = "idle" /\ requestAfter = 0
  /\ requestTo = 0 /\ requestLatest = FALSE
  /\ requestVisibility = 0 /\ resolvedTo = 0 /\ coveredThrough = 0
  /\ visibilityVersion = 0 /\ clientVisibility = 0 /\ clientCursor = 0
  /\ historyInstalled = 0 /\ stateUpdatesInstalled = 0
  /\ closingSeen = FALSE /\ bodyInstalled = FALSE
  /\ hiddenCoverageInstalled = FALSE /\ semanticCloses = 0
  /\ bodyAvailable = TRUE /\ bodyFailureUsed = FALSE
  /\ clientCrash = FALSE /\ invalidVisibilityInstall = FALSE

CommitNext ==
  /\ commitPosition < StopAt /\ commitPosition' = commitPosition + 1
  /\ UNCHANGED <<projectionCompleteTo, sentHint, hintSeen,
       requestPhase, requestAfter, requestTo, requestLatest,
       requestVisibility, resolvedTo, coveredThrough, visibilityVersion,
       clientCursor, historyInstalled, stateUpdatesInstalled,
       closingSeen, bodyInstalled, hiddenCoverageInstalled,
       semanticCloses, bodyAvailable, bodyFailureUsed, clientCrash, clientVisibility, invalidVisibilityInstall>>

ProjectNext ==
  /\ projectionCompleteTo < commitPosition
  /\ projectionCompleteTo' = projectionCompleteTo + 1
  /\ UNCHANGED <<commitPosition, sentHint, hintSeen, requestPhase,
       requestAfter, requestTo, requestLatest, requestVisibility,
       resolvedTo, coveredThrough, visibilityVersion, clientCursor,
       historyInstalled, stateUpdatesInstalled, closingSeen, bodyInstalled,
       hiddenCoverageInstalled, semanticCloses, bodyAvailable, bodyFailureUsed, clientCrash, clientVisibility, invalidVisibilityInstall>>

SendLastFactHint ==
  /\ projectionCompleteTo = 3 /\ ~sentHint /\ sentHint' = TRUE
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, hintSeen,
       requestPhase, requestAfter, requestTo, requestLatest,
       requestVisibility, resolvedTo, coveredThrough, visibilityVersion,
       clientCursor, historyInstalled, stateUpdatesInstalled,
       closingSeen, bodyInstalled, hiddenCoverageInstalled,
       semanticCloses, bodyAvailable, bodyFailureUsed, clientCrash, clientVisibility, invalidVisibilityInstall>>

ReceiveLastFactHint ==
  /\ sentHint /\ ~hintSeen /\ hintSeen' = TRUE
  /\ clientCursor' = IF Mutation = "hint_installs" THEN 3 ELSE clientCursor
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentHint,
       requestPhase, requestAfter, requestTo, requestLatest,
       requestVisibility, resolvedTo, coveredThrough, visibilityVersion,
       historyInstalled, stateUpdatesInstalled, closingSeen, bodyInstalled,
       hiddenCoverageInstalled, semanticCloses, bodyAvailable, bodyFailureUsed, clientCrash, clientVisibility, invalidVisibilityInstall>>

PeriodicReconcileLatest ==
  /\ requestPhase = "idle" /\ clientCursor < 3
  /\ clientVisibility = visibilityVersion
  /\ requestPhase' = "requested" /\ requestAfter' = clientCursor
  /\ requestLatest' = TRUE /\ requestTo' = projectionCompleteTo
  /\ requestVisibility' = visibilityVersion
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentHint,
       hintSeen, resolvedTo, coveredThrough, visibilityVersion,
       clientCursor, historyInstalled, stateUpdatesInstalled,
       closingSeen, bodyInstalled, hiddenCoverageInstalled,
       semanticCloses, bodyAvailable, bodyFailureUsed, clientCrash, clientVisibility, invalidVisibilityInstall>>

RequestConcreteHint ==
  /\ requestPhase = "idle" /\ hintSeen /\ clientCursor < 3
  /\ clientVisibility = visibilityVersion
  /\ requestPhase' = "requested" /\ requestAfter' = clientCursor
  /\ requestLatest' = FALSE /\ requestTo' = 3
  /\ requestVisibility' = visibilityVersion
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentHint,
       hintSeen, resolvedTo, coveredThrough, visibilityVersion,
       clientCursor, historyInstalled, stateUpdatesInstalled,
       closingSeen, bodyInstalled, hiddenCoverageInstalled,
       semanticCloses, bodyAvailable, bodyFailureUsed, clientCrash, clientVisibility, invalidVisibilityInstall>>

RequestConcretePrefix ==
  /\ requestPhase = "idle" /\ clientCursor < 1
  /\ clientVisibility = visibilityVersion
  /\ requestPhase' = "requested" /\ requestAfter' = clientCursor
  /\ requestLatest' = FALSE /\ requestTo' = 1
  /\ requestVisibility' = visibilityVersion
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentHint,
       hintSeen, resolvedTo, coveredThrough, visibilityVersion,
       clientCursor, historyInstalled, stateUpdatesInstalled,
       closingSeen, bodyInstalled, hiddenCoverageInstalled,
       semanticCloses, bodyAvailable, bodyFailureUsed, clientCrash, clientVisibility, invalidVisibilityInstall>>

ResolveBoundedChanges ==
  /\ requestPhase = "requested"
  /\ requestVisibility = visibilityVersion
  /\ requestAfter <= projectionCompleteTo
  /\ requestPhase' = "ready" /\ resolvedTo' = requestTo
  /\ coveredThrough' =
       IF Mutation = "overshoot_concrete_to" /\ ~requestLatest
         THEN projectionCompleteTo
         ELSE IF requestTo <= projectionCompleteTo
              THEN requestTo ELSE projectionCompleteTo
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentHint,
       hintSeen, requestAfter, requestTo, requestLatest,
       requestVisibility, visibilityVersion, clientCursor,
       historyInstalled, stateUpdatesInstalled, closingSeen, bodyInstalled,
       hiddenCoverageInstalled, semanticCloses, bodyAvailable, bodyFailureUsed, clientCrash, clientVisibility, invalidVisibilityInstall>>

LoseBodyRead ==
  /\ requestPhase = "ready" /\ clientCursor = 2 /\ coveredThrough = 3
  /\ bodyAvailable /\ ~bodyFailureUsed
  /\ bodyAvailable' = FALSE /\ bodyFailureUsed' = TRUE
  /\ requestPhase' = "idle"
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentHint,
       hintSeen, requestAfter, requestTo, requestLatest,
       requestVisibility, resolvedTo, coveredThrough, visibilityVersion,
       clientCursor, historyInstalled, stateUpdatesInstalled,
       closingSeen, bodyInstalled, hiddenCoverageInstalled,
       semanticCloses, clientCrash, clientVisibility, invalidVisibilityInstall>>

RecoverBodyRead ==
  /\ ~bodyAvailable /\ bodyAvailable' = TRUE
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentHint,
       hintSeen, requestPhase, requestAfter, requestTo, requestLatest,
       requestVisibility, resolvedTo, coveredThrough, visibilityVersion,
       clientCursor, historyInstalled, stateUpdatesInstalled,
       closingSeen, bodyInstalled, hiddenCoverageInstalled,
       semanticCloses, bodyFailureUsed, clientCrash, clientVisibility, invalidVisibilityInstall>>

InstallStateOnlyBatch ==
  /\ requestPhase = "ready" /\ requestVisibility = visibilityVersion
  /\ clientVisibility = visibilityVersion
  /\ clientCursor = 0 /\ coveredThrough >= 1
  /\ clientCursor' = 1 /\ historyInstalled' = 1
  /\ stateUpdatesInstalled' = IF Mutation = "omit_state_only"
       THEN 0 ELSE 1
  /\ closingSeen' = (Mutation # "omit_state_only")
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentHint,
       hintSeen, requestPhase, requestAfter, requestTo, requestLatest,
       requestVisibility, resolvedTo, coveredThrough, visibilityVersion,
       bodyInstalled, hiddenCoverageInstalled, semanticCloses,
       bodyAvailable, bodyFailureUsed, clientCrash, clientVisibility, invalidVisibilityInstall>>

AdvanceAcrossEmptyAuthorizedProjection ==
  /\ clientCursor = 1
  /\ (Mutation = "stale_hidden_install" \/
       (requestVisibility = visibilityVersion
        /\ clientVisibility = visibilityVersion))
  /\ ((requestPhase = "ready" /\ coveredThrough >= 2)
       \/ Mutation = "hidden_without_cover")
  /\ clientCursor' = 2 /\ historyInstalled' = 2
  /\ stateUpdatesInstalled' = 2
  /\ hiddenCoverageInstalled' = (requestPhase = "ready" /\ coveredThrough >= 2)
  /\ invalidVisibilityInstall' =
       (invalidVisibilityInstall \/ requestVisibility # visibilityVersion
        \/ clientVisibility # visibilityVersion)
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentHint,
       hintSeen, requestPhase, requestAfter, requestTo, requestLatest,
       requestVisibility, resolvedTo, coveredThrough, visibilityVersion,
       closingSeen, bodyInstalled, semanticCloses, bodyAvailable, bodyFailureUsed,
       clientCrash, clientVisibility>>

InstallBodyBatch ==
  /\ requestPhase = "ready" /\ requestVisibility = visibilityVersion
  /\ clientVisibility = visibilityVersion
  /\ clientCursor = 2 /\ coveredThrough >= 3
  /\ (bodyAvailable \/ Mutation = "skip_body")
  /\ clientCursor' = 3 /\ historyInstalled' = 3
  /\ stateUpdatesInstalled' = 3
  /\ bodyInstalled' = bodyAvailable /\ semanticCloses' = 1
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentHint,
       hintSeen, requestPhase, requestAfter, requestTo, requestLatest,
       requestVisibility, resolvedTo, coveredThrough, visibilityVersion,
       closingSeen, hiddenCoverageInstalled, bodyAvailable, bodyFailureUsed, clientCrash, clientVisibility, invalidVisibilityInstall>>

FinishResponse ==
  /\ requestPhase = "ready" /\ clientCursor >= coveredThrough
  /\ requestPhase' = "idle"
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentHint,
       hintSeen, requestAfter, requestTo, requestLatest,
       requestVisibility, resolvedTo, coveredThrough, visibilityVersion,
       clientCursor, historyInstalled, stateUpdatesInstalled,
       closingSeen, bodyInstalled, hiddenCoverageInstalled,
       semanticCloses, bodyAvailable, bodyFailureUsed, clientCrash, clientVisibility, invalidVisibilityInstall>>

CrashAndReconnect ==
  /\ ~clientCrash /\ clientCrash' = TRUE
  /\ requestPhase' = "idle" /\ hintSeen' = FALSE
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentHint,
       requestAfter, requestTo, requestLatest, requestVisibility,
       resolvedTo, coveredThrough, visibilityVersion, clientCursor,
       historyInstalled, stateUpdatesInstalled, closingSeen, bodyInstalled,
       hiddenCoverageInstalled, semanticCloses, bodyAvailable, bodyFailureUsed, clientVisibility, invalidVisibilityInstall>>

RotateVisibility ==
  /\ visibilityVersion = 0 /\ visibilityVersion' = 1
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentHint, hintSeen,
       requestPhase, requestAfter, requestTo, requestLatest,
       requestVisibility, resolvedTo, coveredThrough, clientVisibility,
       clientCursor, historyInstalled, stateUpdatesInstalled, closingSeen,
       bodyInstalled, hiddenCoverageInstalled, semanticCloses, bodyAvailable,
       bodyFailureUsed, invalidVisibilityInstall, clientCrash>>

DiscardStaleResponse ==
  /\ requestPhase \in {"requested", "ready"}
  /\ (requestVisibility # visibilityVersion \/
       clientVisibility # visibilityVersion)
  /\ requestPhase' = "idle"
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentHint, hintSeen,
       requestAfter, requestTo, requestLatest, requestVisibility, resolvedTo,
       coveredThrough, visibilityVersion, clientVisibility, clientCursor,
       historyInstalled, stateUpdatesInstalled, closingSeen, bodyInstalled,
       hiddenCoverageInstalled, semanticCloses, bodyAvailable,
       bodyFailureUsed, invalidVisibilityInstall, clientCrash>>

CoreNext == CommitNext \/ ProjectNext \/ SendLastFactHint \/ ReceiveLastFactHint
  \/ PeriodicReconcileLatest \/ RequestConcreteHint
  \/ RequestConcretePrefix \/ ResolveBoundedChanges
  \/ LoseBodyRead \/ RecoverBodyRead \/ InstallStateOnlyBatch
  \/ AdvanceAcrossEmptyAuthorizedProjection \/ InstallBodyBatch
  \/ FinishResponse \/ CrashAndReconnect \/ DiscardStaleResponse
Next == CoreNext \/ RotateVisibility
Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ commitPosition \in 0..3 /\ projectionCompleteTo \in 0..3
  /\ sentHint \in BOOLEAN /\ hintSeen \in BOOLEAN
  /\ requestPhase \in {"idle", "requested", "ready"}
  /\ requestAfter \in 0..3 /\ requestTo \in 0..3
  /\ requestLatest \in BOOLEAN /\ requestVisibility \in 0..1
  /\ resolvedTo \in 0..3 /\ coveredThrough \in 0..3
  /\ visibilityVersion \in 0..1 /\ clientVisibility \in 0..1
  /\ clientCursor \in 0..3
  /\ historyInstalled \in 0..3 /\ stateUpdatesInstalled \in 0..3
  /\ closingSeen \in BOOLEAN /\ bodyInstalled \in BOOLEAN
  /\ hiddenCoverageInstalled \in BOOLEAN
  /\ semanticCloses \in 0..1 /\ bodyAvailable \in BOOLEAN
  /\ bodyFailureUsed \in BOOLEAN
  /\ clientCrash \in BOOLEAN /\ invalidVisibilityInstall \in BOOLEAN

ProjectionNeverLeadsCommit == projectionCompleteTo <= commitPosition
CoveredThroughIsBounded == coveredThrough <= resolvedTo
CoveredThroughNeverPrecedesAfter == requestPhase = "ready" => requestAfter <= coveredThrough
CoveredThroughNeverLeadsProjection == coveredThrough <= projectionCompleteTo
InstalledRequiresAtomicAuthorizedBatch ==
  clientCursor <= historyInstalled /\ clientCursor <= stateUpdatesInstalled
ClosingStateOnlyDelivered == clientCursor >= 1 => closingSeen
HiddenOnlyRequiresCollectionCoverage == clientCursor >= 2 => hiddenCoverageInstalled
TerminalBodyInstalled == clientCursor = 3 => bodyInstalled /\ semanticCloses = 1
NoCrossVisibilityInstall == ~invalidVisibilityInstall
LastFactHintNotInstallProof == hintSeen /\ clientCursor = 3 => bodyInstalled
NoInstallBeyondCoveredResponse ==
  clientCursor <= IF coveredThrough >= requestAfter
                    THEN coveredThrough ELSE requestAfter

CommitAny == CommitNext
ProjectAny == ProjectNext
ReconcileAny == PeriodicReconcileLatest \/ RequestConcreteHint \/ RequestConcretePrefix
ResolveAny == ResolveBoundedChanges
InstallAny == InstallStateOnlyBatch \/ AdvanceAcrossEmptyAuthorizedProjection
              \/ InstallBodyBatch \/ FinishResponse
SpecFair == Init /\ [][CoreNext]_vars
  /\ WF_vars(CommitAny) /\ WF_vars(ProjectAny)
  /\ WF_vars(ReconcileAny) /\ WF_vars(ResolveAny)
  /\ WF_vars(InstallAny) /\ WF_vars(RecoverBodyRead)
EventuallyInstalled == commitPosition = StopAt ~> clientCursor = StopAt
BodyFailurePreservesInstalledPrefix ==
  [][(bodyAvailable /\ ~bodyAvailable') =>
       UNCHANGED <<clientCursor, historyInstalled, stateUpdatesInstalled,
                   closingSeen, bodyInstalled, semanticCloses>>]_vars
RetryRequestsInstalledPrefix ==
  [][(requestPhase = "idle" /\ requestPhase' = "requested") =>
       requestAfter' = clientCursor]_vars
=============================================================================
