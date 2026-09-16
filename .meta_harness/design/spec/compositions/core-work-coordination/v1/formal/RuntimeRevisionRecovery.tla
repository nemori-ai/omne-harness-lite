---------------------- MODULE RuntimeRevisionRecovery ----------------------
EXTENDS Integers, Sequences, FiniteSets

CONSTANTS Streams, Owners, Operations, S1, S2, Mutation

ASSUME /\ Streams = {S1, S2}
       /\ S1 # S2
       /\ Cardinality(Owners) = 2
       /\ Cardinality(Operations) = 2

NoReceipt == 0
NoGeneration == -1
NoDomain == "none"
Domain == "runtime"
CanonicalStreams == <<S1, S2>>

OwnerFacts(s) ==
  IF s = S1 THEN <<"owner-1:first", "owner-1:second">>
  ELSE <<"owner-2:first">>

ExpectedFacts == OwnerFacts(S1) \o OwnerFacts(S2)
EventIds(seq) == [i \in 1..Len(ExpectedFacts) |-> <<Domain, seq, i>>]
AllOwners == Owners
OneOwner == {CHOOSE o \in Owners : TRUE}

VARIABLES
  history, batchSeq, revision, opState, opReceipt, opResult, lookupReceipt, lookupResult,
  rejectedNonCanonical, everCommitted,
  online, prefixValid, currentOwnerGeneration, currentHostGeneration,
  stagedOwners, stagedDomain, stagedWatermark, stagedOwnerGeneration,
  stagedHostGeneration, stagedVerified,
  publishedOwners, publishedDomain, publishedWatermark, publishedOwnerGeneration,
  publishedHostGeneration, publicationVerified, ready,
  qualifiedGeneration, reassociatedGeneration, effectCount

vars == <<history, batchSeq, revision, opState, opReceipt, opResult, lookupReceipt, lookupResult,
  rejectedNonCanonical, everCommitted,
  online, prefixValid, currentOwnerGeneration, currentHostGeneration,
  stagedOwners, stagedDomain, stagedWatermark, stagedOwnerGeneration,
  stagedHostGeneration, stagedVerified,
  publishedOwners, publishedDomain, publishedWatermark, publishedOwnerGeneration,
  publishedHostGeneration, publicationVerified, ready,
  qualifiedGeneration, reassociatedGeneration, effectCount>>

Init ==
  /\ history = <<>>
  /\ batchSeq = 0
  /\ revision = [s \in Streams |-> 0]
  /\ opState = [o \in Operations |-> "not_seen"]
  /\ opReceipt = [o \in Operations |-> NoReceipt]
  /\ opResult = [o \in Operations |-> "not_seen"]
  /\ lookupReceipt = [o \in Operations |-> NoReceipt]
  /\ lookupResult = [o \in Operations |-> "not_seen"]
  /\ rejectedNonCanonical = 0
  /\ everCommitted = {}
  /\ online = TRUE
  /\ prefixValid = TRUE
  /\ currentOwnerGeneration = 0
  /\ currentHostGeneration = 0
  /\ stagedOwners = {}
  /\ stagedDomain = NoDomain
  /\ stagedWatermark = 0
  /\ stagedOwnerGeneration = NoGeneration
  /\ stagedHostGeneration = NoGeneration
  /\ stagedVerified = FALSE
  /\ publishedOwners = {}
  /\ publishedDomain = NoDomain
  /\ publishedWatermark = 0
  /\ publishedOwnerGeneration = NoGeneration
  /\ publishedHostGeneration = NoGeneration
  /\ publicationVerified = FALSE
  /\ ready = FALSE
  /\ qualifiedGeneration = NoGeneration
  /\ reassociatedGeneration = NoGeneration
  /\ effectCount = [o \in Operations |-> 0]

NewRevision ==
  IF Mutation = "perFactRevision"
  THEN [revision EXCEPT ![S1] = @ + Len(OwnerFacts(S1)),
                        ![S2] = @ + Len(OwnerFacts(S2))]
  ELSE [s \in Streams |-> revision[s] + 1]

NewEnvelope(o) ==
  LET storedStreams == IF Mutation = "writerReorder"
                       THEN <<S2, S1>> ELSE CanonicalStreams
      storedFacts == IF Mutation = "writerReorder"
                     THEN OwnerFacts(S2) \o <<"owner-1:second", "owner-1:first">>
                     ELSE ExpectedFacts
      nextRevision == NewRevision
  IN [operation |-> o,
      seq |-> batchSeq + 1,
      streams |-> storedStreams,
      streamFacts |-> [s \in Streams |->
        IF Mutation = "writerReorder" /\ s = S1
        THEN <<"owner-1:second", "owner-1:first">> ELSE OwnerFacts(s)],
      flatFacts |-> storedFacts,
      eventIds |-> [i \in 1..Len(storedFacts) |-> <<Domain, batchSeq + 1, i>>],
      oldRevision |-> revision,
      newRevision |-> nextRevision]

Commit(o) ==
  /\ online
  /\ opState[o] = "not_seen"
  /\ history' = Append(history, NewEnvelope(o))
  /\ batchSeq' = batchSeq + 1
  /\ revision' = NewRevision
  /\ opState' = [opState EXCEPT ![o] = "committed"]
  /\ opReceipt' = [opReceipt EXCEPT ![o] = batchSeq + 1]
  /\ opResult' = [opResult EXCEPT ![o] = "accepted"]
  /\ everCommitted' = everCommitted \cup {o}
  /\ ready' = FALSE
  /\ UNCHANGED <<lookupReceipt, lookupResult, rejectedNonCanonical,
       online, prefixValid, currentOwnerGeneration, currentHostGeneration,
       stagedOwners, stagedDomain, stagedWatermark, stagedOwnerGeneration,
       stagedHostGeneration, stagedVerified,
       publishedOwners, publishedDomain, publishedWatermark, publishedOwnerGeneration,
       publishedHostGeneration, publicationVerified,
       qualifiedGeneration, reassociatedGeneration, effectCount>>

RejectNonCanonical ==
  /\ online /\ rejectedNonCanonical = 0
  /\ rejectedNonCanonical' = rejectedNonCanonical + 1
  /\ UNCHANGED <<history, batchSeq, revision, opState, opReceipt, opResult,
       lookupReceipt, lookupResult, everCommitted,
       online, prefixValid, currentOwnerGeneration, currentHostGeneration,
       stagedOwners, stagedDomain, stagedWatermark, stagedOwnerGeneration,
       stagedHostGeneration, stagedVerified,
       publishedOwners, publishedDomain, publishedWatermark, publishedOwnerGeneration,
       publishedHostGeneration, publicationVerified, ready,
       qualifiedGeneration, reassociatedGeneration, effectCount>>

Lookup(o) ==
  /\ opState[o] = "committed"
  /\ IF Mutation = "lookupReappend"
     THEN /\ history' = Append(history, NewEnvelope(o))
          /\ batchSeq' = batchSeq + 1
          /\ revision' = [s \in Streams |-> revision[s] + 1]
     ELSE /\ UNCHANGED <<history, batchSeq, revision>>
  /\ lookupReceipt' = [lookupReceipt EXCEPT ![o] = opReceipt[o]]
  /\ lookupResult' = [lookupResult EXCEPT ![o] = opResult[o]]
  /\ UNCHANGED <<opState, opReceipt, opResult, rejectedNonCanonical, everCommitted,
       online, prefixValid, currentOwnerGeneration, currentHostGeneration,
       stagedOwners, stagedDomain, stagedWatermark, stagedOwnerGeneration,
       stagedHostGeneration, stagedVerified,
       publishedOwners, publishedDomain, publishedWatermark, publishedOwnerGeneration,
       publishedHostGeneration, publicationVerified, ready,
       qualifiedGeneration, reassociatedGeneration, effectCount>>

InstallOnlinePublication ==
  /\ online /\ batchSeq > 0 /\ publishedWatermark < batchSeq
  /\ publishedOwners' = AllOwners
  /\ publishedDomain' = Domain
  /\ publishedWatermark' = batchSeq
  /\ publishedOwnerGeneration' = currentOwnerGeneration
  /\ publishedHostGeneration' = currentHostGeneration
  /\ publicationVerified' = TRUE
  /\ UNCHANGED <<history, batchSeq, revision, opState, opReceipt, opResult,
       lookupReceipt, lookupResult, rejectedNonCanonical, everCommitted,
       online, prefixValid, currentOwnerGeneration, currentHostGeneration,
       stagedOwners, stagedDomain, stagedWatermark, stagedOwnerGeneration,
       stagedHostGeneration, stagedVerified, ready,
       qualifiedGeneration, reassociatedGeneration, effectCount>>

Crash ==
  /\ online /\ batchSeq > 0 /\ currentOwnerGeneration = 0
  /\ online' = FALSE
  /\ currentOwnerGeneration' = currentOwnerGeneration + 1
  /\ currentHostGeneration' = currentHostGeneration + 1
  /\ stagedOwners' = {}
  /\ stagedDomain' = NoDomain
  /\ stagedWatermark' = 0
  /\ stagedOwnerGeneration' = NoGeneration
  /\ stagedHostGeneration' = NoGeneration
  /\ stagedVerified' = FALSE
  /\ publishedOwners' = {}
  /\ publishedDomain' = NoDomain
  /\ publishedWatermark' = 0
  /\ publishedOwnerGeneration' = NoGeneration
  /\ publishedHostGeneration' = NoGeneration
  /\ publicationVerified' = FALSE
  /\ ready' = FALSE
  /\ qualifiedGeneration' = NoGeneration
  /\ reassociatedGeneration' = NoGeneration
  /\ UNCHANGED <<history, batchSeq, revision, opState, opReceipt, opResult,
       lookupReceipt, lookupResult, rejectedNonCanonical, everCommitted, prefixValid,
       effectCount>>

DamagePrefix ==
  /\ ~online /\ prefixValid /\ ~stagedVerified
  /\ prefixValid' = FALSE
  /\ UNCHANGED <<history, batchSeq, revision, opState, opReceipt, opResult,
       lookupReceipt, lookupResult, rejectedNonCanonical, everCommitted,
       online, currentOwnerGeneration, currentHostGeneration,
       stagedOwners, stagedDomain, stagedWatermark, stagedOwnerGeneration,
       stagedHostGeneration, stagedVerified,
       publishedOwners, publishedDomain, publishedWatermark, publishedOwnerGeneration,
       publishedHostGeneration, publicationVerified, ready,
       qualifiedGeneration, reassociatedGeneration, effectCount>>

VerifyRecovery ==
  /\ ~online /\ prefixValid /\ ~stagedVerified
  /\ stagedOwners' = IF Mutation = "missingOwnerRecovery"
                     THEN OneOwner ELSE AllOwners
  /\ stagedDomain' = Domain
  /\ stagedWatermark' = batchSeq
  /\ stagedOwnerGeneration' = currentOwnerGeneration
  /\ stagedHostGeneration' = currentHostGeneration
  /\ stagedVerified' = TRUE
  /\ UNCHANGED <<history, batchSeq, revision, opState, opReceipt, opResult,
       lookupReceipt, lookupResult, rejectedNonCanonical, everCommitted,
       online, prefixValid, currentOwnerGeneration, currentHostGeneration,
       publishedOwners, publishedDomain, publishedWatermark, publishedOwnerGeneration,
       publishedHostGeneration, publicationVerified, ready,
       qualifiedGeneration, reassociatedGeneration, effectCount>>

InstallRecovery ==
  /\ ~online /\ prefixValid /\ stagedVerified
  /\ (stagedOwners = AllOwners \/ Mutation = "missingOwnerRecovery")
  /\ stagedDomain = Domain
  /\ stagedWatermark = batchSeq
  /\ stagedOwnerGeneration = currentOwnerGeneration
  /\ stagedHostGeneration = currentHostGeneration
  /\ publishedOwners' = stagedOwners
  /\ publishedDomain' = Domain
  /\ publishedWatermark' = stagedWatermark
  /\ publishedOwnerGeneration' = stagedOwnerGeneration
  /\ publishedHostGeneration' = stagedHostGeneration
  /\ publicationVerified' = TRUE
  /\ UNCHANGED <<history, batchSeq, revision, opState, opReceipt, opResult,
       lookupReceipt, lookupResult, rejectedNonCanonical, everCommitted,
       online, prefixValid, currentOwnerGeneration, currentHostGeneration,
       stagedOwners, stagedDomain, stagedWatermark, stagedOwnerGeneration,
       stagedHostGeneration, stagedVerified, ready,
       qualifiedGeneration, reassociatedGeneration, effectCount>>

MarkReady ==
  /\ ~ready
  /\ CASE Mutation = "staleAckReady" ->
            /\ stagedVerified
            /\ publishedOwners' = AllOwners
            /\ publishedDomain' = Domain
            /\ publishedWatermark' = stagedWatermark
            /\ publishedOwnerGeneration' = currentOwnerGeneration - 1
            /\ publishedHostGeneration' = currentHostGeneration - 1
            /\ publicationVerified' = TRUE
       [] Mutation = "partialInstallReady" ->
            /\ batchSeq > 0
            /\ publishedOwners' = OneOwner
            /\ publishedDomain' = Domain
            /\ publishedWatermark' = batchSeq
            /\ publishedOwnerGeneration' = currentOwnerGeneration
            /\ publishedHostGeneration' = currentHostGeneration
            /\ publicationVerified' = TRUE
       [] OTHER ->
            /\ publishedOwners = AllOwners
            /\ publishedDomain = Domain
            /\ publishedWatermark = batchSeq
            /\ publishedOwnerGeneration = currentOwnerGeneration
            /\ publishedHostGeneration = currentHostGeneration
            /\ publicationVerified
            /\ UNCHANGED <<publishedOwners, publishedDomain, publishedWatermark,
                            publishedOwnerGeneration, publishedHostGeneration,
                            publicationVerified>>
  /\ ready' = TRUE
  /\ IF Mutation = "readyAutoEffect"
     THEN effectCount' = [effectCount EXCEPT
            ![CHOOSE o \in everCommitted : TRUE] = @ + 1]
     ELSE UNCHANGED effectCount
  /\ UNCHANGED <<history, batchSeq, revision, opState, opReceipt, opResult,
       lookupReceipt, lookupResult, rejectedNonCanonical, everCommitted,
       online, prefixValid, currentOwnerGeneration, currentHostGeneration,
       stagedOwners, stagedDomain, stagedWatermark, stagedOwnerGeneration,
       stagedHostGeneration, stagedVerified,
       qualifiedGeneration, reassociatedGeneration>>

Qualify ==
  /\ ready /\ qualifiedGeneration # currentOwnerGeneration
  /\ qualifiedGeneration' = currentOwnerGeneration
  /\ UNCHANGED <<history, batchSeq, revision, opState, opReceipt, opResult,
       lookupReceipt, lookupResult, rejectedNonCanonical, everCommitted,
       online, prefixValid, currentOwnerGeneration, currentHostGeneration,
       stagedOwners, stagedDomain, stagedWatermark, stagedOwnerGeneration,
       stagedHostGeneration, stagedVerified,
       publishedOwners, publishedDomain, publishedWatermark, publishedOwnerGeneration,
       publishedHostGeneration, publicationVerified, ready,
       reassociatedGeneration, effectCount>>

Reassociate ==
  /\ ready /\ reassociatedGeneration # currentHostGeneration
  /\ reassociatedGeneration' = currentHostGeneration
  /\ UNCHANGED <<history, batchSeq, revision, opState, opReceipt, opResult,
       lookupReceipt, lookupResult, rejectedNonCanonical, everCommitted,
       online, prefixValid, currentOwnerGeneration, currentHostGeneration,
       stagedOwners, stagedDomain, stagedWatermark, stagedOwnerGeneration,
       stagedHostGeneration, stagedVerified,
       publishedOwners, publishedDomain, publishedWatermark, publishedOwnerGeneration,
       publishedHostGeneration, publicationVerified, ready,
       qualifiedGeneration, effectCount>>

Execute(o) ==
  /\ opState[o] = "committed" /\ ready
  /\ qualifiedGeneration = currentOwnerGeneration
  /\ reassociatedGeneration = currentHostGeneration
  /\ effectCount[o] = 0
  /\ effectCount' = [effectCount EXCEPT ![o] = @ + 1]
  /\ UNCHANGED <<history, batchSeq, revision, opState, opReceipt, opResult,
       lookupReceipt, lookupResult, rejectedNonCanonical, everCommitted,
       online, prefixValid, currentOwnerGeneration, currentHostGeneration,
       stagedOwners, stagedDomain, stagedWatermark, stagedOwnerGeneration,
       stagedHostGeneration, stagedVerified,
       publishedOwners, publishedDomain, publishedWatermark, publishedOwnerGeneration,
       publishedHostGeneration, publicationVerified, ready,
       qualifiedGeneration, reassociatedGeneration>>

ForgetCommitted(o) ==
  /\ Mutation = "forgetCommitted" /\ opState[o] = "committed"
  /\ opState' = [opState EXCEPT ![o] = "not_seen"]
  /\ opReceipt' = [opReceipt EXCEPT ![o] = NoReceipt]
  /\ opResult' = [opResult EXCEPT ![o] = "not_seen"]
  /\ UNCHANGED <<history, batchSeq, revision, lookupReceipt, lookupResult,
       rejectedNonCanonical, everCommitted,
       online, prefixValid, currentOwnerGeneration, currentHostGeneration,
       stagedOwners, stagedDomain, stagedWatermark, stagedOwnerGeneration,
       stagedHostGeneration, stagedVerified,
       publishedOwners, publishedDomain, publishedWatermark, publishedOwnerGeneration,
       publishedHostGeneration, publicationVerified, ready,
       qualifiedGeneration, reassociatedGeneration, effectCount>>

Next ==
  \/ \E o \in Operations : Commit(o) \/ Lookup(o) \/ Execute(o) \/ ForgetCommitted(o)
  \/ RejectNonCanonical
  \/ InstallOnlinePublication
  \/ Crash \/ DamagePrefix \/ VerifyRecovery \/ InstallRecovery
  \/ MarkReady \/ Qualify \/ Reassociate

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ history \in Seq([operation : Operations, seq : Nat,
       streams : Seq(Streams), streamFacts : [Streams -> Seq(STRING)],
       flatFacts : Seq(STRING), eventIds : {EventIds(1), EventIds(2), EventIds(3)},
       oldRevision : [Streams -> Nat], newRevision : [Streams -> Nat]])
  /\ batchSeq \in Nat /\ revision \in [Streams -> Nat]
  /\ opState \in [Operations -> {"not_seen", "committed"}]
  /\ opReceipt \in [Operations -> Nat]
  /\ opResult \in [Operations -> {"not_seen", "accepted"}]
  /\ lookupReceipt \in [Operations -> Nat]
  /\ lookupResult \in [Operations -> {"not_seen", "accepted"}]
  /\ rejectedNonCanonical \in Nat /\ everCommitted \subseteq Operations
  /\ online \in BOOLEAN /\ prefixValid \in BOOLEAN
  /\ currentOwnerGeneration \in Nat /\ currentHostGeneration \in Nat
  /\ stagedOwners \subseteq Owners /\ stagedDomain \in {Domain, NoDomain} /\ stagedWatermark \in Nat
  /\ stagedOwnerGeneration \in Int /\ stagedHostGeneration \in Int
  /\ stagedVerified \in BOOLEAN
  /\ publishedOwners \subseteq Owners /\ publishedDomain \in {Domain, NoDomain} /\ publishedWatermark \in Nat
  /\ publishedOwnerGeneration \in Int /\ publishedHostGeneration \in Int
  /\ publicationVerified \in BOOLEAN /\ ready \in BOOLEAN
  /\ qualifiedGeneration \in Int /\ reassociatedGeneration \in Int
  /\ effectCount \in [Operations -> Nat]

StreamRevisionPerAppend ==
  /\ revision = [s \in Streams |-> Len(history)]
  /\ \A i \in 1..Len(history) :
       \A s \in Streams :
         /\ history[i].oldRevision[s] = i - 1
         /\ history[i].newRevision[s] = history[i].oldRevision[s] + 1

FactOrderStable ==
  \A i \in 1..Len(history) :
    /\ history[i].seq = i
    /\ history[i].streams = CanonicalStreams
    /\ history[i].streamFacts = [s \in Streams |-> OwnerFacts(s)]
    /\ history[i].flatFacts = ExpectedFacts
    /\ history[i].eventIds = EventIds(i)

NoPartialOwnerPublication == publishedOwners = {} \/ publishedOwners = AllOwners

StaleGenerationCannotReady == ready =>
  /\ publishedOwnerGeneration = currentOwnerGeneration
  /\ publishedHostGeneration = currentHostGeneration

CommittedNeverBecomesNotSeen ==
  \A o \in everCommitted : opState[o] = "committed" /\ opReceipt[o] # NoReceipt /\ opResult[o] = "accepted"

LookupReturnsOriginal ==
  \A o \in Operations : lookupReceipt[o] # NoReceipt =>
    lookupReceipt[o] = opReceipt[o] /\ lookupResult[o] = opResult[o]

LookupNoDuplicateAppend == Len(history) = Cardinality(everCommitted)

RecoveryNoDuplicateEffect == \A o \in Operations : effectCount[o] <= 1

ReadyImpliesVerifiedCompleteInstall == ready =>
  /\ publicationVerified
  /\ publishedOwners = AllOwners
  /\ publishedDomain = Domain
  /\ publishedWatermark = batchSeq
  /\ publishedOwnerGeneration = currentOwnerGeneration
  /\ publishedHostGeneration = currentHostGeneration

RecoveryReadyRequiresValidPrefix == (~online /\ ready) => prefixValid

=============================================================================
