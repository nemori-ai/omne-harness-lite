--------------------------- MODULE ActiveHandoff --------------------------
EXTENDS Naturals, FiniteSets, TLC

(***************************************************************************)
(* MS-20/MS-23 active-channel abstraction. source generation/pub.n, attempt *)
(* epoch/chunk index and subscriber generation remain distinct domains.     *)
(***************************************************************************)

CONSTANT Sources, FirstSource, SecondSource, MaxChunks, BufferCap, Mutation
ASSUME /\ Cardinality(Sources) = 2
       /\ FirstSource \in Sources
       /\ SecondSource \in Sources
       /\ FirstSource # SecondSource
       /\ MaxChunks = 3
       /\ BufferCap \in 1..(2 * (MaxChunks + 1))
       /\ Mutation \in {"none", "snapshot_before_subscribe",
                         "live_before_enqueue", "cross_generation",
                         "stale_attempt_epoch", "listener_failure_global"}

Epochs == 1..2
ChunkIndexes == 0..(MaxChunks - 1)
ChunkEvents == Sources \X Epochs \X ChunkIndexes
StartedEvents == Sources \X Epochs
SourceFor(sg) == IF sg = 1 THEN FirstSource ELSE SecondSource
Prefix(n) == {i \in ChunkIndexes : i < n}
InvalidationReasons == {"source_generation", "transform", "visibility", "floor"}

VARIABLES phase, subscriberGeneration, currentSource, listenerActive,
          ownerEpoch, ownerStarted, ownerChunks, pubCounter,
          snapshotEpoch, snapshotThrough, snapshotCut,
          installedEpoch, installedThrough, installedStarted, presentations,
          buffer, startedBuffer, pendingChunks, pendingStarts,
          staleBuffer, installRecords, subscriptionEpoch,
          resyncs, sourceUnavailable, listenerFailed

BufferedCount == Cardinality(buffer) + Cardinality(startedBuffer)

vars == <<phase, subscriberGeneration, currentSource, listenerActive,
          ownerEpoch, ownerStarted, ownerChunks, pubCounter,
          snapshotEpoch, snapshotThrough, snapshotCut,
          installedEpoch, installedThrough, installedStarted, presentations,
          buffer, startedBuffer, pendingChunks, pendingStarts,
          staleBuffer, installRecords, subscriptionEpoch,
          resyncs, sourceUnavailable, listenerFailed>>

Init ==
  /\ phase = "disconnected"
  /\ subscriberGeneration = 0
  /\ currentSource = FirstSource
  /\ listenerActive = FALSE
  /\ ownerEpoch = [s \in Sources |-> 1]
  /\ ownerStarted = [s \in Sources |-> FALSE]
  /\ ownerChunks = [s \in Sources |-> 0]
  /\ pubCounter = [s \in Sources |-> 0]
  /\ snapshotEpoch = 1
  /\ snapshotThrough = 0
  /\ snapshotCut = 0
  /\ installedEpoch = [s \in Sources |-> 0]
  /\ installedThrough = [s \in Sources |-> 0]
  /\ installedStarted = [s \in Sources |-> [e \in Epochs |-> 0]]
  /\ presentations =
       [s \in Sources |-> [e \in Epochs |-> [i \in ChunkIndexes |-> 0]]]
  /\ buffer = {}
  /\ startedBuffer = {}
  /\ pendingChunks = {}
  /\ pendingStarts = {}
  /\ staleBuffer = {}
  /\ installRecords = {}
  /\ subscriptionEpoch = [sg \in 1..2 |-> 0]
  /\ resyncs = 0
  /\ sourceUnavailable = FALSE
  /\ listenerFailed = FALSE

StartSubscription ==
  /\ phase \in {"disconnected", "resync_required"}
  /\ subscriberGeneration < 2
  /\ subscriberGeneration' = subscriberGeneration + 1
  /\ currentSource' = SourceFor(subscriberGeneration + 1)
  /\ phase' = "registering"
  /\ listenerActive' = FALSE
  /\ snapshotEpoch' = 1
  /\ snapshotThrough' = 0
  /\ snapshotCut' = 0
  /\ buffer' = {}
  /\ startedBuffer' = {}
  /\ pendingChunks' = {}
  /\ pendingStarts' = {}
  /\ sourceUnavailable' = FALSE
  /\ listenerFailed' = FALSE
  /\ UNCHANGED <<ownerEpoch, ownerStarted, ownerChunks, pubCounter,
                  installedEpoch, installedThrough, installedStarted,
                  presentations, staleBuffer, installRecords,
                  subscriptionEpoch, resyncs>>

RegisterListener ==
  /\ phase = "registering"
  /\ listenerActive' = TRUE
  /\ snapshotCut' = pubCounter[currentSource]
  /\ phase' = "registered"
  /\ UNCHANGED <<subscriberGeneration, currentSource, ownerEpoch,
                  ownerStarted, ownerChunks, pubCounter, snapshotEpoch,
                  snapshotThrough, installedEpoch, installedThrough,
                  installedStarted, presentations, buffer, startedBuffer,
                  pendingChunks, pendingStarts, staleBuffer, installRecords,
                  subscriptionEpoch, resyncs, sourceUnavailable,
                  listenerFailed>>

ReadSnapshot ==
  /\ phase = "registered"
  /\ ownerStarted[currentSource]
  /\ snapshotEpoch' = ownerEpoch[currentSource]
  /\ snapshotThrough' = ownerChunks[currentSource]
  /\ snapshotCut' = pubCounter[currentSource]
  /\ phase' = "snapshotted"
  /\ UNCHANGED <<subscriberGeneration, currentSource, listenerActive,
                  ownerEpoch, ownerStarted, ownerChunks, pubCounter,
                  installedEpoch, installedThrough, installedStarted,
                  presentations, buffer, startedBuffer, pendingChunks,
                  pendingStarts, staleBuffer, installRecords,
                  subscriptionEpoch, resyncs, sourceUnavailable,
                  listenerFailed>>

ReadSnapshotEarly ==
  /\ Mutation = "snapshot_before_subscribe"
  /\ phase = "registering"
  /\ ownerStarted[currentSource]
  /\ snapshotEpoch' = ownerEpoch[currentSource]
  /\ snapshotThrough' = ownerChunks[currentSource]
  /\ snapshotCut' = pubCounter[currentSource]
  /\ phase' = "early_snapshot"
  /\ UNCHANGED <<subscriberGeneration, currentSource, listenerActive,
                  ownerEpoch, ownerStarted, ownerChunks, pubCounter,
                  installedEpoch, installedThrough, installedStarted,
                  presentations, buffer, startedBuffer, pendingChunks,
                  pendingStarts, staleBuffer, installRecords,
                  subscriptionEpoch, resyncs, sourceUnavailable,
                  listenerFailed>>

RegisterAfterEarlySnapshot ==
  /\ Mutation = "snapshot_before_subscribe"
  /\ phase = "early_snapshot"
  /\ listenerActive' = TRUE
  /\ phase' = "snapshotted"
  /\ UNCHANGED <<subscriberGeneration, currentSource, ownerEpoch,
                  ownerStarted, ownerChunks, pubCounter, snapshotEpoch,
                  snapshotThrough, snapshotCut, installedEpoch,
                  installedThrough, installedStarted, presentations,
                  buffer, startedBuffer, pendingChunks, pendingStarts,
                  staleBuffer, installRecords, subscriptionEpoch, resyncs,
                  sourceUnavailable, listenerFailed>>

PublishStarted ==
  /\ phase # "live"
  /\ ~ownerStarted[currentSource]
  /\ pendingChunks = {}
  /\ pendingStarts = {}
  /\ ownerStarted' = [ownerStarted EXCEPT ![currentSource] = TRUE]
  /\ pubCounter' = [pubCounter EXCEPT ![currentSource] = @ + 1]
  /\ pendingStarts' =
       IF listenerActive THEN {<<currentSource, ownerEpoch[currentSource]>>}
       ELSE {}
  /\ UNCHANGED <<phase, subscriberGeneration, currentSource, listenerActive,
                  ownerEpoch, ownerChunks, snapshotEpoch, snapshotThrough,
                  snapshotCut, installedEpoch, installedThrough,
                  installedStarted, presentations, buffer, startedBuffer,
                  pendingChunks, staleBuffer, installRecords,
                  subscriptionEpoch, resyncs, sourceUnavailable,
                  listenerFailed>>

PublishChunk ==
  /\ phase # "live"
  /\ ownerStarted[currentSource]
  /\ ownerChunks[currentSource] < MaxChunks
  /\ pendingChunks = {}
  /\ pendingStarts = {}
  /\ LET e == ownerEpoch[currentSource]
         i == ownerChunks[currentSource]
     IN /\ ownerChunks' = [ownerChunks EXCEPT ![currentSource] = @ + 1]
        /\ pubCounter' = [pubCounter EXCEPT ![currentSource] = @ + 1]
        /\ pendingChunks' =
             IF listenerActive THEN {<<currentSource, e, i>>} ELSE {}
  /\ UNCHANGED <<phase, subscriberGeneration, currentSource, listenerActive,
                  ownerEpoch, ownerStarted, snapshotEpoch, snapshotThrough,
                  snapshotCut, installedEpoch, installedThrough,
                  installedStarted, presentations, buffer, startedBuffer,
                  pendingStarts, staleBuffer, installRecords,
                  subscriptionEpoch, resyncs, sourceUnavailable,
                  listenerFailed>>

AdvanceAttemptEpoch ==
  /\ phase = "registered"
  /\ ownerEpoch[currentSource] = 1
  /\ pendingChunks = {}
  /\ pendingStarts = {}
  /\ ownerEpoch' = [ownerEpoch EXCEPT ![currentSource] = 2]
  /\ ownerStarted' = [ownerStarted EXCEPT ![currentSource] = FALSE]
  /\ ownerChunks' = [ownerChunks EXCEPT ![currentSource] = 0]
  /\ UNCHANGED <<phase, subscriberGeneration, currentSource, listenerActive,
                  pubCounter, snapshotEpoch, snapshotThrough, snapshotCut,
                  installedEpoch, installedThrough, installedStarted,
                  presentations, buffer, startedBuffer, pendingChunks,
                  pendingStarts, staleBuffer, installRecords,
                  subscriptionEpoch, resyncs, sourceUnavailable,
                  listenerFailed>>

EnqueueCallback ==
  /\ Cardinality(pendingChunks) + Cardinality(pendingStarts) = 1
  /\ BufferedCount < BufferCap
  /\ buffer' = buffer \cup pendingChunks
  /\ startedBuffer' = startedBuffer \cup pendingStarts
  /\ pendingChunks' = {}
  /\ pendingStarts' = {}
  /\ UNCHANGED <<phase, subscriberGeneration, currentSource, listenerActive,
                  ownerEpoch, ownerStarted, ownerChunks, pubCounter,
                  snapshotEpoch, snapshotThrough, snapshotCut,
                  installedEpoch, installedThrough, installedStarted,
                  presentations, staleBuffer, installRecords,
                  subscriptionEpoch, resyncs, sourceUnavailable,
                  listenerFailed>>

OverflowListener ==
  /\ Cardinality(pendingChunks) + Cardinality(pendingStarts) = 1
  /\ BufferedCount >= BufferCap
  /\ phase' = "resync_required"
  /\ listenerActive' = FALSE
  /\ staleBuffer' = staleBuffer \cup buffer \cup pendingChunks
  /\ buffer' = {}
  /\ startedBuffer' = {}
  /\ pendingChunks' = {}
  /\ pendingStarts' = {}
  /\ resyncs' = resyncs + 1
  /\ listenerFailed' = TRUE
  /\ sourceUnavailable' = (Mutation = "listener_failure_global")
  /\ UNCHANGED <<subscriberGeneration, currentSource, ownerEpoch,
                  ownerStarted, ownerChunks, pubCounter, snapshotEpoch,
                  snapshotThrough, snapshotCut, installedEpoch,
                  installedThrough, installedStarted, presentations,
                  installRecords, subscriptionEpoch>>

InstallCompactBaseline ==
  /\ phase = "snapshotted"
  /\ installedEpoch' = [installedEpoch EXCEPT
       ![currentSource] = snapshotEpoch]
  /\ installedThrough' = [installedThrough EXCEPT
       ![currentSource] = snapshotThrough]
  /\ installedStarted' = [installedStarted EXCEPT
       ![currentSource][snapshotEpoch] = 1]
  /\ presentations' = [presentations EXCEPT
       ![currentSource][snapshotEpoch] = [i \in ChunkIndexes |->
         IF i < snapshotThrough THEN 1 ELSE @ [i]]]
  /\ installRecords' = installRecords \cup
       {<<subscriberGeneration, currentSource, snapshotEpoch, i>> :
          i \in Prefix(snapshotThrough)}
  /\ subscriptionEpoch' = [subscriptionEpoch EXCEPT
       ![subscriberGeneration] = snapshotEpoch]
  /\ phase' = "installed"
  /\ UNCHANGED <<subscriberGeneration, currentSource, listenerActive,
                  ownerEpoch, ownerStarted, ownerChunks, pubCounter,
                  snapshotEpoch, snapshotThrough, snapshotCut, buffer,
                  startedBuffer, pendingChunks, pendingStarts, staleBuffer,
                  resyncs, sourceUnavailable, listenerFailed>>

DiscardStarted(s, e) ==
  /\ phase \in {"installed", "draining"}
  /\ <<s, e>> \in startedBuffer
  /\ s = currentSource
  /\ e <= snapshotEpoch
  /\ startedBuffer' = startedBuffer \ {<<s, e>>}
  /\ phase' = "draining"
  /\ UNCHANGED <<subscriberGeneration, currentSource, ownerEpoch,
                  listenerActive, ownerStarted, ownerChunks, pubCounter,
                  snapshotEpoch, snapshotThrough, snapshotCut,
                  installedEpoch, installedThrough, installedStarted,
                  presentations, buffer, pendingChunks, pendingStarts,
                  staleBuffer, installRecords, subscriptionEpoch, resyncs,
                  sourceUnavailable, listenerFailed>>

DiscardChunk(s, e, i) ==
  /\ phase \in {"installed", "draining"}
  /\ <<s, e, i>> \in buffer
  /\ s = currentSource
  /\ e < snapshotEpoch \/ (e = snapshotEpoch /\ i < installedThrough[s])
  /\ buffer' = buffer \ {<<s, e, i>>}
  /\ phase' = "draining"
  /\ UNCHANGED <<subscriberGeneration, currentSource, ownerEpoch,
                  listenerActive, ownerStarted, ownerChunks, pubCounter,
                  snapshotEpoch, snapshotThrough, snapshotCut,
                  installedEpoch, installedThrough, installedStarted,
                  presentations, startedBuffer, pendingChunks, pendingStarts,
                  staleBuffer, installRecords, subscriptionEpoch, resyncs,
                  sourceUnavailable, listenerFailed>>

DrainNextChunk(s, e, i) ==
  /\ phase \in {"installed", "draining"}
  /\ <<s, e, i>> \in buffer
  /\ s = currentSource
  /\ e = snapshotEpoch
  /\ i = installedThrough[s]
  /\ buffer' = buffer \ {<<s, e, i>>}
  /\ installedThrough' = [installedThrough EXCEPT ![s] = @ + 1]
  /\ presentations' = [presentations EXCEPT ![s][e][i] = @ + 1]
  /\ installRecords' = installRecords \cup
       {<<subscriberGeneration, s, e, i>>}
  /\ phase' = "draining"
  /\ UNCHANGED <<subscriberGeneration, currentSource, listenerActive,
                  ownerEpoch, ownerStarted, ownerChunks, pubCounter,
                  snapshotEpoch, snapshotThrough, snapshotCut,
                  installedEpoch, installedStarted, startedBuffer,
                  pendingChunks, pendingStarts, staleBuffer,
                  subscriptionEpoch, resyncs, sourceUnavailable,
                  listenerFailed>>

RejectFutureEpoch ==
  /\ phase \in {"installed", "draining"}
  /\ (\E <<s, e>> \in startedBuffer : e > snapshotEpoch) \/
       (\E <<s, e, i>> \in buffer : e > snapshotEpoch)
  /\ phase' = "resync_required"
  /\ listenerActive' = FALSE
  /\ buffer' = {}
  /\ startedBuffer' = {}
  /\ UNCHANGED <<subscriberGeneration, currentSource, ownerEpoch,
                  ownerStarted, ownerChunks, pubCounter, snapshotEpoch,
                  snapshotThrough, snapshotCut, installedEpoch,
                  installedThrough, installedStarted, presentations,
                  pendingChunks, pendingStarts, staleBuffer, installRecords,
                  subscriptionEpoch, resyncs, sourceUnavailable,
                  listenerFailed>>

EnterLive ==
  /\ phase \in {"installed", "draining"}
  /\ buffer = {}
  /\ startedBuffer = {}
  /\ IF Mutation = "live_before_enqueue"
        THEN TRUE ELSE pendingChunks = {} /\ pendingStarts = {}
  /\ phase' = "live"
  /\ UNCHANGED <<subscriberGeneration, currentSource, listenerActive,
                  ownerEpoch, ownerStarted, ownerChunks, pubCounter,
                  snapshotEpoch, snapshotThrough, snapshotCut,
                  installedEpoch, installedThrough, installedStarted,
                  presentations, buffer, startedBuffer, pendingChunks,
                  pendingStarts, staleBuffer, installRecords,
                  subscriptionEpoch, resyncs, sourceUnavailable,
                  listenerFailed>>

PublishStartedLive ==
  /\ phase = "live"
  /\ ~ownerStarted[currentSource]
  /\ ownerStarted' = [ownerStarted EXCEPT ![currentSource] = TRUE]
  /\ pubCounter' = [pubCounter EXCEPT ![currentSource] = @ + 1]
  /\ installedEpoch' = [installedEpoch EXCEPT ![currentSource] = ownerEpoch[currentSource]]
  /\ installedThrough' = [installedThrough EXCEPT ![currentSource] = 0]
  /\ installedStarted' = [installedStarted EXCEPT
       ![currentSource][ownerEpoch[currentSource]] = 1]
  /\ subscriptionEpoch' = [subscriptionEpoch EXCEPT
       ![subscriberGeneration] = ownerEpoch[currentSource]]
  /\ UNCHANGED <<phase, subscriberGeneration, currentSource, listenerActive,
                  ownerEpoch, ownerChunks, snapshotEpoch, snapshotThrough,
                  snapshotCut, presentations, buffer, startedBuffer,
                  pendingChunks, pendingStarts, staleBuffer, installRecords,
                  resyncs, sourceUnavailable, listenerFailed>>

PublishChunkLive ==
  /\ phase = "live"
  /\ ownerStarted[currentSource]
  /\ ownerEpoch[currentSource] = installedEpoch[currentSource]
  /\ ownerChunks[currentSource] = installedThrough[currentSource]
  /\ ownerChunks[currentSource] < MaxChunks
  /\ LET s == currentSource
         e == ownerEpoch[s]
         i == ownerChunks[s]
     IN /\ ownerChunks' = [ownerChunks EXCEPT ![s] = @ + 1]
        /\ pubCounter' = [pubCounter EXCEPT ![s] = @ + 1]
        /\ installedThrough' = [installedThrough EXCEPT ![s] = @ + 1]
        /\ presentations' = [presentations EXCEPT ![s][e][i] = @ + 1]
        /\ installRecords' = installRecords \cup
             {<<subscriberGeneration, s, e, i>>}
  /\ UNCHANGED <<phase, subscriberGeneration, currentSource, listenerActive,
                  ownerEpoch, ownerStarted, snapshotEpoch, snapshotThrough,
                  snapshotCut, installedEpoch, installedStarted, buffer,
                  startedBuffer, pendingChunks, pendingStarts, staleBuffer,
                  subscriptionEpoch, resyncs, sourceUnavailable,
                  listenerFailed>>

InvalidateListener(reason) ==
  /\ subscriberGeneration = 1
  /\ phase \in {"registered", "snapshotted", "installed", "draining", "live"}
  /\ resyncs = 0
  /\ reason \in InvalidationReasons
  /\ phase' = "resync_required"
  /\ listenerActive' = FALSE
  /\ staleBuffer' = staleBuffer \cup buffer \cup pendingChunks
  /\ buffer' = {}
  /\ startedBuffer' = {}
  /\ pendingChunks' = {}
  /\ pendingStarts' = {}
  /\ resyncs' = 1
  /\ listenerFailed' = (reason # "source_generation")
  /\ sourceUnavailable' = (reason = "source_generation")
  /\ UNCHANGED <<subscriberGeneration, currentSource, ownerEpoch,
                  ownerStarted, ownerChunks, pubCounter, snapshotEpoch,
                  snapshotThrough, snapshotCut, installedEpoch,
                  installedThrough, installedStarted, presentations,
                  installRecords, subscriptionEpoch>>

InstallStaleAfterResubscribe ==
  /\ Mutation = "cross_generation"
  /\ subscriberGeneration = 2
  /\ phase = "registered"
  /\ staleBuffer # {}
  /\ LET e == CHOOSE x \in staleBuffer : TRUE
     IN /\ installRecords' = installRecords \cup
            {<<subscriberGeneration, e[1], e[2], e[3]>>}
        /\ staleBuffer' = staleBuffer \ {e}
  /\ UNCHANGED <<phase, subscriberGeneration, currentSource, listenerActive,
                  ownerEpoch, ownerStarted, ownerChunks, pubCounter,
                  snapshotEpoch, snapshotThrough, snapshotCut,
                  installedEpoch, installedThrough, installedStarted,
                  presentations, buffer, startedBuffer, pendingChunks,
                  pendingStarts, subscriptionEpoch, resyncs,
                  sourceUnavailable, listenerFailed>>

InstallOldEpoch ==
  /\ Mutation = "stale_attempt_epoch"
  /\ phase \in {"installed", "draining"}
  /\ snapshotEpoch = 2
  /\ \E i \in ChunkIndexes : <<currentSource, 1, i>> \in buffer
  /\ LET i == CHOOSE j \in ChunkIndexes : <<currentSource, 1, j>> \in buffer
     IN /\ installRecords' = installRecords \cup
            {<<subscriberGeneration, currentSource, 1, i>>}
        /\ buffer' = buffer \ {<<currentSource, 1, i>>}
  /\ UNCHANGED <<phase, subscriberGeneration, currentSource, listenerActive,
                  ownerEpoch, ownerStarted, ownerChunks, pubCounter,
                  snapshotEpoch, snapshotThrough, snapshotCut,
                  installedEpoch, installedThrough, installedStarted,
                  presentations, startedBuffer, pendingChunks, pendingStarts,
                  staleBuffer, subscriptionEpoch, resyncs,
                  sourceUnavailable, listenerFailed>>

Next ==
  \/ StartSubscription \/ RegisterListener \/ ReadSnapshot
  \/ ReadSnapshotEarly \/ RegisterAfterEarlySnapshot
  \/ PublishStarted \/ PublishChunk \/ AdvanceAttemptEpoch
  \/ EnqueueCallback \/ OverflowListener \/ InstallCompactBaseline
  \/ \E s \in Sources, e \in Epochs : DiscardStarted(s, e)
  \/ \E s \in Sources, e \in Epochs, i \in ChunkIndexes :
       DiscardChunk(s, e, i) \/ DrainNextChunk(s, e, i)
  \/ RejectFutureEpoch
  \/ EnterLive \/ PublishStartedLive \/ PublishChunkLive
  \/ \E reason \in InvalidationReasons : InvalidateListener(reason)
  \/ InstallStaleAfterResubscribe \/ InstallOldEpoch

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ phase \in {"disconnected", "registering", "early_snapshot",
                  "registered", "snapshotted", "installed", "draining",
                  "live", "resync_required"}
  /\ subscriberGeneration \in 0..2
  /\ currentSource \in Sources
  /\ listenerActive \in BOOLEAN
  /\ ownerEpoch \in [Sources -> Epochs]
  /\ ownerStarted \in [Sources -> BOOLEAN]
  /\ ownerChunks \in [Sources -> 0..MaxChunks]
  /\ pubCounter \in [Sources -> 0..(2 * (MaxChunks + 1))]
  /\ snapshotEpoch \in Epochs
  /\ snapshotThrough \in 0..MaxChunks
  /\ snapshotCut \in 0..(2 * (MaxChunks + 1))
  /\ installedEpoch \in [Sources -> 0..2]
  /\ installedThrough \in [Sources -> 0..MaxChunks]
  /\ installedStarted \in [Sources -> [Epochs -> 0..1]]
  /\ presentations \in [Sources -> [Epochs -> [ChunkIndexes -> 0..1]]]
  /\ buffer \subseteq ChunkEvents
  /\ startedBuffer \subseteq StartedEvents
  /\ pendingChunks \subseteq ChunkEvents
  /\ pendingStarts \subseteq StartedEvents
  /\ Cardinality(pendingChunks) + Cardinality(pendingStarts) <= 1
  /\ staleBuffer \subseteq ChunkEvents
  /\ installRecords \subseteq ((1..2) \X Sources \X Epochs \X ChunkIndexes)
  /\ subscriptionEpoch \in [1..2 -> 0..2]
  /\ resyncs \in 0..2
  /\ sourceUnavailable \in BOOLEAN
  /\ listenerFailed \in BOOLEAN

NoGapAcrossBaselineHandoff ==
  phase = "live" =>
    /\ installedEpoch[currentSource] = ownerEpoch[currentSource]
    /\ installedThrough[currentSource] = ownerChunks[currentSource]

InstalledAtMostOncePerActiveChunk ==
  \A s \in Sources, e \in Epochs, i \in ChunkIndexes :
    presentations[s][e][i] <= 1

InstalledPrefixIsContiguous ==
  \A s \in Sources :
    \A i \in Prefix(installedThrough[s]) :
      presentations[s][installedEpoch[s]][i] = 1

NoCrossGenerationInstall ==
  \A r \in installRecords : r[2] = SourceFor(r[1])

NoStaleAttemptEpochInstall ==
  \A r \in installRecords : r[3] = subscriptionEpoch[r[1]]

ListenerFailureIsSubscriptionLocal == listenerFailed => ~sourceUnavailable
SnapshotDoesNotAdvancePublisher == snapshotCut <= pubCounter[currentSource]

StartAny == StartSubscription
RegisterAny == RegisterListener \/ RegisterAfterEarlySnapshot
SnapshotAny == ReadSnapshot \/ ReadSnapshotEarly
PublishForHandoff == PublishStarted \/ PublishChunk
EnqueueAny == EnqueueCallback \/ OverflowListener
InstallAny == InstallCompactBaseline
DrainAny ==
  (\E s \in Sources, e \in Epochs : DiscardStarted(s, e)) \/
  (\E s \in Sources, e \in Epochs, i \in ChunkIndexes :
    DiscardChunk(s, e, i) \/ DrainNextChunk(s, e, i)) \/
  RejectFutureEpoch
EnterAny == EnterLive
SpecFair == Spec /\ WF_vars(StartAny) /\ WF_vars(RegisterAny)
                 /\ WF_vars(PublishForHandoff) /\ WF_vars(SnapshotAny)
                 /\ WF_vars(EnqueueAny)
                 /\ WF_vars(InstallAny) /\ WF_vars(DrainAny)
                 /\ WF_vars(EnterAny)
EventuallyLive == <>(phase = "live")

SecondSubscriberReached == subscriberGeneration = 2
OldEpochBufferedReached == \E i \in ChunkIndexes : <<currentSource, 1, i>> \in buffer
=============================================================================
