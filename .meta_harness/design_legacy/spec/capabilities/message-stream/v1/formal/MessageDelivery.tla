-------------------------- MODULE MessageDelivery --------------------------
EXTENDS Naturals, FiniteSets, TLC

(***************************************************************************)
(* MS-06/MS-22 abstraction with two committed batches, two frames per batch *)
(* and transport redelivery after a lost acknowledgement.                  *)
(***************************************************************************)

CONSTANT MaxPosition, BatchSize, Mutation
ASSUME /\ MaxPosition = 2
       /\ BatchSize = 2
       /\ Mutation \in {"none", "installed_on_receipt", "missing_dedup"}

Keys == (1..MaxPosition) \X (1..BatchSize)

VARIABLES commitPosition, projectionCompleteTo, sentFrames, serverSent,
          receipts, installedKeys, presentations, clientInstalled,
          sourceUnavailable, endedPosition, terminalPresented,
          bodyKind, bodyReadable, bodyFailures, clientEpoch

vars == <<commitPosition, projectionCompleteTo, sentFrames, serverSent,
          receipts, installedKeys, presentations, clientInstalled,
          sourceUnavailable, endedPosition, terminalPresented,
          bodyKind, bodyReadable, bodyFailures, clientEpoch>>

Init ==
  /\ commitPosition = 0
  /\ projectionCompleteTo = 0
  /\ sentFrames = {}
  /\ serverSent = 0
  /\ receipts = [k \in Keys |-> 0]
  /\ installedKeys = {}
  /\ presentations = [k \in Keys |-> 0]
  /\ clientInstalled = 0
  /\ sourceUnavailable = FALSE
  /\ endedPosition = 0
  /\ terminalPresented = FALSE
  /\ bodyKind = [p \in 1..MaxPosition |-> "pending"]
  /\ bodyReadable = TRUE
  /\ bodyFailures = 0
  /\ clientEpoch = 0

Commit ==
  /\ commitPosition < MaxPosition
  /\ commitPosition' = commitPosition + 1
  /\ UNCHANGED <<projectionCompleteTo, sentFrames, serverSent, receipts,
                  installedKeys, presentations, clientInstalled,
                  sourceUnavailable, endedPosition, terminalPresented,
                  bodyKind, bodyReadable, bodyFailures, clientEpoch>>

Project(kind) ==
  /\ projectionCompleteTo < commitPosition
  /\ kind \in {"body", "no_body"}
  /\ projectionCompleteTo' = projectionCompleteTo + 1
  /\ bodyKind' = [bodyKind EXCEPT ![projectionCompleteTo + 1] = kind]
  /\ UNCHANGED <<commitPosition, sentFrames, serverSent, receipts,
                  installedKeys, presentations, clientInstalled,
                  sourceUnavailable, endedPosition, terminalPresented,
                  bodyReadable, bodyFailures, clientEpoch>>

SendFrame(i) ==
  /\ serverSent < projectionCompleteTo
  /\ i \in 1..BatchSize
  /\ <<serverSent + 1, i>> \notin sentFrames
  /\ sentFrames' = sentFrames \cup {<<serverSent + 1, i>>}
  /\ serverSent' =
       IF \A j \in 1..BatchSize : <<serverSent + 1, j>> \in sentFrames'
         THEN serverSent + 1 ELSE serverSent
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, receipts,
                  installedKeys, presentations, clientInstalled,
                  sourceUnavailable, endedPosition, terminalPresented,
                  bodyKind, bodyReadable, bodyFailures, clientEpoch>>

Receive(k) ==
  /\ k \in sentFrames
  /\ receipts[k] < 2
  /\ receipts' = [receipts EXCEPT ![k] = @ + 1]
  /\ presentations' =
       IF Mutation = "missing_dedup"
         THEN [presentations EXCEPT ![k] = @ + 1]
         ELSE presentations
  /\ installedKeys' = installedKeys
  /\ clientInstalled' =
       IF Mutation = "installed_on_receipt" /\ k[1] > clientInstalled
         THEN k[1] ELSE clientInstalled
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentFrames,
                  serverSent, sourceUnavailable, endedPosition,
                  terminalPresented, bodyKind, bodyReadable, bodyFailures,
                  clientEpoch>>

InstallBatch ==
  /\ clientInstalled < projectionCompleteTo
  /\ bodyReadable
  /\ LET p == clientInstalled + 1
     IN /\ \A i \in 1..BatchSize : receipts[<<p, i>>] > 0
        /\ bodyKind[p] \in {"body", "no_body"}
        /\ installedKeys' = installedKeys \cup ({p} \X (1..BatchSize))
        /\ presentations' = [k \in Keys |->
             IF k[1] = p /\ presentations[k] = 0 THEN 1 ELSE presentations[k]]
        /\ clientInstalled' = p
        /\ terminalPresented' = (terminalPresented \/ (endedPosition > 0 /\ p >= endedPosition))
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentFrames,
                  serverSent, receipts, sourceUnavailable, endedPosition,
                  bodyKind, bodyReadable, bodyFailures, clientEpoch>>

ReceiveEndedCommitted ==
  /\ commitPosition = MaxPosition
  /\ endedPosition = 0
  /\ endedPosition' = commitPosition
  /\ terminalPresented' = (clientInstalled >= commitPosition)
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentFrames,
                  serverSent, receipts, installedKeys, presentations,
                  clientInstalled, sourceUnavailable, bodyKind,
                  bodyReadable, bodyFailures, clientEpoch>>

FailBodyRead ==
  /\ bodyReadable
  /\ bodyFailures = 0
  /\ projectionCompleteTo > clientInstalled
  /\ bodyReadable' = FALSE
  /\ bodyFailures' = 1
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentFrames,
                  serverSent, receipts, installedKeys, presentations,
                  clientInstalled, sourceUnavailable, endedPosition,
                  terminalPresented, bodyKind, clientEpoch>>

RecoverBodyRead ==
  /\ ~bodyReadable
  /\ bodyReadable' = TRUE
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentFrames,
                  serverSent, receipts, installedKeys, presentations,
                  clientInstalled, sourceUnavailable, endedPosition,
                  terminalPresented, bodyKind, bodyFailures, clientEpoch>>

CrashClient ==
  /\ clientEpoch = 0
  /\ clientEpoch' = 1
  /\ receipts' = [k \in Keys |-> IF k \in installedKeys THEN receipts[k] ELSE 0]
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentFrames,
                  serverSent, installedKeys, presentations, clientInstalled,
                  sourceUnavailable, endedPosition, terminalPresented,
                  bodyKind, bodyReadable, bodyFailures>>

LoseSource ==
  /\ ~sourceUnavailable
  /\ sourceUnavailable' = TRUE
  /\ UNCHANGED <<commitPosition, projectionCompleteTo, sentFrames,
                  serverSent, receipts, installedKeys, presentations,
                  clientInstalled, endedPosition, terminalPresented,
                  bodyKind, bodyReadable, bodyFailures, clientEpoch>>

Next == Commit \/ (\E kind \in {"body", "no_body"} : Project(kind))
        \/ (\E i \in 1..BatchSize : SendFrame(i))
        \/ (\E k \in Keys : Receive(k)) \/ InstallBatch
        \/ ReceiveEndedCommitted \/ FailBodyRead \/ RecoverBodyRead
        \/ CrashClient \/ LoseSource

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ commitPosition \in 0..MaxPosition
  /\ projectionCompleteTo \in 0..MaxPosition
  /\ serverSent \in 0..MaxPosition
  /\ receipts \in [Keys -> 0..2]
  /\ installedKeys \subseteq Keys
  /\ presentations \in [Keys -> 0..2]
  /\ clientInstalled \in 0..MaxPosition
  /\ sourceUnavailable \in BOOLEAN
  /\ endedPosition \in 0..MaxPosition
  /\ terminalPresented \in BOOLEAN
  /\ bodyKind \in [1..MaxPosition -> {"pending", "body", "no_body"}]
  /\ bodyReadable \in BOOLEAN
  /\ bodyFailures \in 0..1
  /\ clientEpoch \in 0..1

ProjectedImpliesCommitted == projectionCompleteTo <= commitPosition
SentImpliesProjected == serverSent <= projectionCompleteTo
InstalledImpliesProjected == clientInstalled <= projectionCompleteTo
InstalledInBatchOrder ==
  \A p \in 1..clientInstalled : {p} \X (1..BatchSize) \subseteq installedKeys
InstalledAtMostOncePerDedupKey == \A k \in Keys : presentations[k] <= 1
NoGapAcrossInstalledBatches ==
  \A p \in 1..clientInstalled : \A i \in 1..BatchSize : receipts[<<p, i>>] > 0
SourceLossDoesNotMoveWatermarks == sourceUnavailable => clientInstalled <= projectionCompleteTo
TerminalPresentationWaitsForProjection ==
  terminalPresented => endedPosition > 0 /\ clientInstalled >= endedPosition
PresentationOnlyAfterInstall ==
  \A k \in Keys : presentations[k] > 0 => k \in installedKeys

CommitAny == Commit
ProjectAny == \E kind \in {"body", "no_body"} : Project(kind)
SendAny == \E i \in 1..BatchSize : SendFrame(i)
ReceiveAny == \E k \in Keys : Receive(k)
InstallAny == InstallBatch
RecoverAny == RecoverBodyRead
EndedAny == ReceiveEndedCommitted
SpecFair == Spec /\ WF_vars(CommitAny) /\ WF_vars(ProjectAny)
                 /\ WF_vars(SendAny) /\ WF_vars(ReceiveAny)
                 /\ WF_vars(InstallAny) /\ WF_vars(RecoverAny)
                 /\ WF_vars(EndedAny)
AllCommittedEventuallyInstalled == commitPosition = MaxPosition ~> clientInstalled = MaxPosition
EndedEventuallySettlesDraft == endedPosition = MaxPosition ~> terminalPresented
=============================================================================
