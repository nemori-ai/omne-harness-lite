------------------------ MODULE DispositionRecovery -----------------------
EXTENDS Naturals, FiniteSets, TLC

(***************************************************************************)
(* MS-22/MS-24 finite abstraction.  M's revisioned disposition, Session     *)
(* projection and the client reducer advance separately.  Active source     *)
(* loss and ended hints have no durable authority.                          *)
(***************************************************************************)

CONSTANT MaxPositions, Mutation
ASSUME /\ MaxPositions = 2
       /\ Mutation \in {"none", "source_lost_terminal"}

Kinds == {"empty", "outcome_unresolved", "message_ready",
           "settled_without_message", "abandoned"}

VARIABLES commitPosition, projectionCompleteTo, clientInstalled,
          durableAt, projectedAt, currentRevision, currentDisposition,
          executionFence, sourceUnavailable, observerTerminal,
          endedHint, activeDraft, semanticCloses, messageInstalls,
          clientEpoch, visibility, retentionExpired

vars == <<commitPosition, projectionCompleteTo, clientInstalled,
          durableAt, projectedAt, currentRevision, currentDisposition,
          executionFence, sourceUnavailable, observerTerminal,
          endedHint, activeDraft, semanticCloses, messageInstalls,
          clientEpoch, visibility, retentionExpired>>

Init ==
  /\ commitPosition = 0
  /\ projectionCompleteTo = 0
  /\ clientInstalled = 0
  /\ durableAt = [p \in 1..MaxPositions |-> "empty"]
  /\ projectedAt = [p \in 1..MaxPositions |-> "empty"]
  /\ currentRevision = 0
  /\ currentDisposition = "in_progress"
  /\ executionFence = FALSE
  /\ sourceUnavailable = FALSE
  /\ observerTerminal = FALSE
  /\ endedHint = FALSE
  /\ activeDraft = TRUE
  /\ semanticCloses = 0
  /\ messageInstalls = 0
  /\ clientEpoch = 0
  /\ visibility = "visible"
  /\ retentionExpired = FALSE

LoseSource ==
  /\ ~sourceUnavailable
  /\ sourceUnavailable' = TRUE
  /\ observerTerminal' = (Mutation = "source_lost_terminal")
  /\ semanticCloses' =
       IF Mutation = "source_lost_terminal" THEN semanticCloses + 1
       ELSE semanticCloses
  /\ activeDraft' =
       IF Mutation = "source_lost_terminal" THEN FALSE ELSE activeDraft
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, clientInstalled,
                  durableAt, projectedAt, currentRevision,
                  currentDisposition, executionFence, endedHint,
                  messageInstalls, clientEpoch, visibility,
                  retentionExpired>>

FenceAttempt ==
  /\ ~executionFence
  /\ executionFence' = TRUE
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, clientInstalled,
                  durableAt, projectedAt, currentRevision,
                  currentDisposition, sourceUnavailable, observerTerminal,
                  endedHint, activeDraft, semanticCloses, messageInstalls,
                  clientEpoch, visibility, retentionExpired>>

CommitInitial(kind) ==
  /\ commitPosition = 0
  /\ ~retentionExpired
  /\ kind \in {"outcome_unresolved", "message_ready",
                "settled_without_message", "abandoned"}
  /\ kind = "abandoned" => executionFence
  /\ commitPosition' = 1
  /\ durableAt' = [durableAt EXCEPT ![1] = kind]
  /\ currentRevision' = 1
  /\ currentDisposition' = kind
  /\ UNCHANGED <<projectionCompleteTo, clientInstalled, projectedAt,
                  executionFence, sourceUnavailable, observerTerminal,
                  endedHint, activeDraft, semanticCloses, messageInstalls,
                  clientEpoch, visibility, retentionExpired>>

RefineUnknown(kind) ==
  /\ commitPosition = 1
  /\ currentDisposition = "outcome_unresolved"
  /\ kind \in {"message_ready", "settled_without_message"}
  /\ commitPosition' = 2
  /\ durableAt' = [durableAt EXCEPT ![2] = kind]
  /\ currentRevision' = 2
  /\ currentDisposition' = kind
  /\ UNCHANGED <<projectionCompleteTo, clientInstalled, projectedAt,
                  executionFence, sourceUnavailable, observerTerminal,
                  endedHint, activeDraft, semanticCloses, messageInstalls,
                  clientEpoch, visibility, retentionExpired>>

ProjectNext ==
  /\ projectionCompleteTo < commitPosition
  /\ LET p == projectionCompleteTo + 1
     IN /\ projectedAt' = [projectedAt EXCEPT ![p] = durableAt[p]]
        /\ projectionCompleteTo' = p
  /\ UNCHANGED <<commitPosition, clientInstalled, durableAt,
                  currentRevision, currentDisposition, executionFence,
                  sourceUnavailable, observerTerminal, endedHint,
                  activeDraft, semanticCloses, messageInstalls,
                  clientEpoch, visibility, retentionExpired>>

InstallNext ==
  /\ clientInstalled < projectionCompleteTo
  /\ visibility = "visible"
  /\ LET p == clientInstalled + 1
         kind == projectedAt[p]
     IN /\ kind # "empty"
        /\ clientInstalled' = p
        /\ semanticCloses' =
             IF semanticCloses = 0 THEN 1 ELSE semanticCloses
        /\ messageInstalls' =
             IF kind = "message_ready" /\ messageInstalls = 0
               THEN 1 ELSE messageInstalls
        /\ activeDraft' =
             IF kind = "outcome_unresolved" THEN activeDraft ELSE FALSE
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, durableAt,
                  projectedAt, currentRevision, currentDisposition,
                  executionFence, sourceUnavailable, observerTerminal,
                  endedHint, clientEpoch, visibility>>
  /\ UNCHANGED retentionExpired

ReceiveEndedHint ==
  /\ ~endedHint
  /\ endedHint' = TRUE
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, clientInstalled,
                  durableAt, projectedAt, currentRevision,
                  currentDisposition, executionFence, sourceUnavailable,
                  observerTerminal, activeDraft, semanticCloses,
                  messageInstalls, clientEpoch, visibility,
                  retentionExpired>>

CrashAndRestartClient ==
  /\ clientEpoch = 0
  /\ clientEpoch' = 1
  /\ endedHint' = FALSE
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, clientInstalled,
                  durableAt, projectedAt, currentRevision,
                  currentDisposition, executionFence, sourceUnavailable,
                  observerTerminal, activeDraft, semanticCloses,
                  messageInstalls, visibility, retentionExpired>>

RevokeVisibility ==
  /\ visibility = "visible"
  /\ visibility' = "inaccessible"
  /\ activeDraft' = FALSE
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, clientInstalled,
                  durableAt, projectedAt, currentRevision,
                  currentDisposition, executionFence, sourceUnavailable,
                  observerTerminal, endedHint, semanticCloses,
                  messageInstalls, clientEpoch, retentionExpired>>

ExpireEvidence ==
  /\ commitPosition = 0
  /\ ~retentionExpired
  /\ retentionExpired' = TRUE
  /\ activeDraft' = FALSE
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, clientInstalled,
                  durableAt, projectedAt, currentRevision,
                  currentDisposition, executionFence, sourceUnavailable,
                  observerTerminal, endedHint, semanticCloses,
                  messageInstalls, clientEpoch, visibility>>

Next ==
  \/ LoseSource \/ FenceAttempt
  \/ \E kind \in Kinds : CommitInitial(kind) \/ RefineUnknown(kind)
  \/ ProjectNext \/ InstallNext \/ ReceiveEndedHint
  \/ CrashAndRestartClient \/ RevokeVisibility \/ ExpireEvidence

Spec == Init /\ [][Next]_vars

ProgressNext ==
  \/ LoseSource \/ FenceAttempt
  \/ \E kind \in Kinds : CommitInitial(kind) \/ RefineUnknown(kind)
  \/ ProjectNext \/ InstallNext \/ ReceiveEndedHint
  \/ CrashAndRestartClient

TypeOK ==
  /\ commitPosition \in 0..MaxPositions
  /\ projectionCompleteTo \in 0..MaxPositions
  /\ clientInstalled \in 0..MaxPositions
  /\ durableAt \in [1..MaxPositions -> Kinds]
  /\ projectedAt \in [1..MaxPositions -> Kinds]
  /\ currentRevision \in 0..MaxPositions
  /\ currentDisposition \in
       {"in_progress", "outcome_unresolved", "message_ready",
        "settled_without_message", "abandoned"}
  /\ executionFence \in BOOLEAN
  /\ sourceUnavailable \in BOOLEAN
  /\ observerTerminal \in BOOLEAN
  /\ endedHint \in BOOLEAN
  /\ activeDraft \in BOOLEAN
  /\ semanticCloses \in 0..1
  /\ messageInstalls \in 0..1
  /\ clientEpoch \in 0..1
  /\ visibility \in {"visible", "inaccessible"}
  /\ retentionExpired \in BOOLEAN

ProjectedImpliesCommitted == projectionCompleteTo <= commitPosition
InstalledImpliesProjected == clientInstalled <= projectionCompleteTo
InstallProjectCommitOrdering ==
  \A p \in 1..clientInstalled :
    projectedAt[p] # "empty" /\ durableAt[p] = projectedAt[p]
AtMostOneSemanticClose == semanticCloses <= 1
AtMostOneMessageInstall == messageInstalls <= 1
SourceLostNeverTerminalizesAttempt == ~observerTerminal
AbandonedRequiresFence == currentDisposition = "abandoned" => executionFence
EndedHintNeverGrantsAuthority ==
  endedHint /\ commitPosition = 0 => semanticCloses = 0
EvidenceExpiryNeverInfersOutcome ==
  retentionExpired => ~observerTerminal /\ semanticCloses = 0
UnknownRevisionIsMonotone ==
  currentRevision = 2 => durableAt[1] = "outcome_unresolved"
MessageWaitsForProjection == messageInstalls > 0 => clientInstalled > 0

CommitAny == \E kind \in Kinds : CommitInitial(kind) \/ RefineUnknown(kind)
ProjectAny == ProjectNext
InstallAny == InstallNext
SpecFair == Init /\ [][ProgressNext]_vars
                 /\ WF_vars(CommitAny) /\ WF_vars(ProjectAny)
                 /\ WF_vars(InstallAny)
OwnerEventuallySettles ==
  visibility = "visible" ~> semanticCloses = 1
SourceLossStillAllowsOwnerSettlement ==
  sourceUnavailable /\ visibility = "visible" ~> semanticCloses = 1

SourceLossReached == sourceUnavailable
UnknownThenRefinedReached == currentRevision = 2
MessageInstalledReached == messageInstalls = 1
=============================================================================
