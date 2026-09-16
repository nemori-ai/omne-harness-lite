----------------------- MODULE RecoveryEligibility -----------------------
EXTENDS Integers, FiniteSets

CONSTANTS Mutation, None

Domain == "core"
Owners == {"owner-a", "owner-b"}
Claims == {"exact-use", "resource"}
OldEpoch == 1
NewEpoch == 2
HostGeneration == 2
OwnerGenerations == [o \in Owners |-> 2]
Original == [operation |-> "op-1", receipt |-> "receipt-1",
             result |-> "accepted", batch |-> "batch-2",
             position |-> [domain |-> Domain, seq |-> 2, writerEpoch |-> OldEpoch],
             publication |-> "blocked"]
OriginalClaims == [c \in Claims |-> [operation |-> Original.operation,
                                    claim |-> c, generation |-> 1]]

\* Authority evidence is an environment input, not a recovery algorithm.
Environment == [prefix : {"valid", "invalid"},
  writer : {"success", "unknown", "unavailable"},
  roots : {"valid", "missing-owner", "bad-relations"},
  claims : [Claims -> {"dischargeable", "unresolved", "possible-effect"}],
  attempt : {"not-started", "associated", "unknown"},
  permission : BOOLEAN,
  tombstone : {"live", "cancelled", "deleted", "superseded"}]

VARIABLES env, st
vars == <<env, st>>

Init ==
  /\ env \in Environment
  /\ st = [prefix |-> "unchecked", writer |-> "unacquired",
       writerEpoch |-> 0, durableEpoch |-> OldEpoch, watermark |-> 2,
       roots |-> "unchecked", baseline |-> None, ready |-> FALSE,
       claims |-> [c \in Claims |-> "unchecked"], claimRefs |-> OriginalClaims,
       historical |-> Original, lookup |-> None,
       qualification |-> "unchecked", attempt |-> "unchecked",
       effects |-> 0, broadcast |-> FALSE]

VerifyPrefix ==
  /\ st.prefix = "unchecked"
  /\ st' = [st EXCEPT !.prefix = env.prefix]
  /\ UNCHANGED env

\* The successful action abstracts exclusive acquisition + durable acquire batch.
\* Unknown never hands out a writer; it does not assert whether bytes committed.
AcquireWriter ==
  /\ st.prefix = "valid" /\ st.writer = "unacquired"
  /\ st' = IF env.writer = "success"
       THEN [st EXCEPT !.writer = "acquired",
              !.writerEpoch = IF Mutation = "reuse-epoch" THEN OldEpoch ELSE NewEpoch,
              !.durableEpoch = NewEpoch, !.watermark = 3]
       ELSE [st EXCEPT !.writer = env.writer]
  /\ UNCHANGED env

FoldRoots ==
  /\ st.writer = "acquired" /\ st.roots = "unchecked"
  /\ st' = [st EXCEPT !.roots = env.roots]
  /\ UNCHANGED env

Baseline == [domain |-> Domain, watermark |-> st.watermark,
  ownerGenerations |-> OwnerGenerations, hostGeneration |-> HostGeneration,
  writerEpoch |-> st.writerEpoch, owners |-> Owners]

Install ==
  /\ st.roots = "valid" /\ st.baseline = None
  /\ st' = [st EXCEPT !.baseline =
       IF Mutation = "stale-baseline" THEN [Baseline EXCEPT !.hostGeneration = 1]
       ELSE Baseline]
  /\ UNCHANGED env

CheckClaim(c) ==
  /\ st.prefix = "valid" /\ st.claims[c] = "unchecked"
  /\ st' = [st EXCEPT
       !.claims[c] = IF env.claims[c] = "dischargeable" THEN "settled" ELSE "blocked",
       !.claimRefs[c] = IF Mutation = "wrong-claim"
                       THEN [OriginalClaims[c] EXCEPT !.generation = 2]
                       ELSE OriginalClaims[c]]
  /\ UNCHANGED env

ClaimsClosed == \A c \in Claims : st.claims[c] = "settled"

Open ==
  /\ ~st.ready /\ st.baseline # None
  /\ (ClaimsClosed \/ Mutation = "skip-claims")
  /\ st' = [st EXCEPT !.ready = TRUE,
       !.historical = IF Mutation = "rewrite-completion"
                      THEN [Original EXCEPT !.publication = "ready"] ELSE @,
       !.effects = IF Mutation = "open-auto-effect" THEN @ + 1 ELSE @]
  /\ UNCHANGED env

\* A lookup can expose a complete baseline while unresolved claims still close
\* the domain. Consumability alone neither opens it nor permits an effect.
Lookup ==
  /\ st.baseline # None /\ st.lookup = None
  /\ st' = [st EXCEPT !.lookup = [original |-> st.historical,
       baselineRef |-> IF Mutation = "uncovered-lookup"
          THEN [st.baseline EXCEPT !.watermark = 1] ELSE st.baseline]]
  /\ UNCHANGED env

Qualify ==
  /\ st.lookup # None /\ st.qualification = "unchecked"
  /\ st' = [st EXCEPT !.qualification = IF env.permission THEN "allowed" ELSE "denied"]
  /\ UNCHANGED env

CheckAttempt ==
  /\ st.lookup # None /\ st.attempt = "unchecked"
  /\ st' = [st EXCEPT !.attempt = env.attempt]
  /\ UNCHANGED env

Execute ==
  /\ st.ready /\ st.lookup # None /\ st.effects = 0
  /\ (st.qualification = "allowed" \/ Mutation = "skip-qualification")
  /\ (st.attempt = "not-started" \/
       (Mutation = "retry-unknown" /\ st.attempt = "unknown"))
  /\ (env.tombstone = "live" \/ Mutation = "ignore-tombstone")
  /\ st' = [st EXCEPT !.effects = @ + 1]
  /\ UNCHANGED env

Broadcast ==
  /\ ~st.broadcast /\ (st.ready \/ Mutation = "early-broadcast")
  /\ st' = [st EXCEPT !.broadcast = TRUE]
  /\ UNCHANGED env

Next == VerifyPrefix \/ AcquireWriter \/ FoldRoots \/ Install
     \/ (\E c \in Claims : CheckClaim(c)) \/ Open \/ Lookup
     \/ Qualify \/ CheckAttempt \/ Execute \/ Broadcast

Spec == Init /\ [][Next]_vars

\* Fairness schedules local recovery actions only; it cannot make external
\* evidence successful, make a permission true, or require external effects.
FairSpec == Spec /\ WF_vars(VerifyPrefix) /\ WF_vars(AcquireWriter)
  /\ WF_vars(FoldRoots) /\ WF_vars(Install)
  /\ (\A c \in Claims : WF_vars(CheckClaim(c)))
  /\ WF_vars(Open) /\ WF_vars(Lookup)

BaselineType == [domain : {Domain}, watermark : 1..3,
  ownerGenerations : [Owners -> 1..2], hostGeneration : 1..2,
  writerEpoch : 1..2, owners : SUBSET Owners]
HistoricalType == [operation : {"op-1"}, receipt : {"receipt-1"},
  result : {"accepted"}, batch : {"batch-2"}, position : {Original.position},
  publication : {"blocked", "ready"}]

TypeOK ==
  /\ env \in Environment
  /\ st \in [prefix : {"unchecked", "valid", "invalid"},
       writer : {"unacquired", "acquired", "unknown", "unavailable"},
       writerEpoch : 0..2, durableEpoch : 1..2, watermark : 2..3,
       roots : {"unchecked", "valid", "missing-owner", "bad-relations"},
       baseline : {None} \cup BaselineType, ready : BOOLEAN,
       claims : [Claims -> {"unchecked", "settled", "blocked"}],
       claimRefs : [Claims -> [operation : {"op-1"}, claim : Claims, generation : 1..2]],
       historical : HistoricalType,
       lookup : {None} \cup [original : HistoricalType, baselineRef : BaselineType],
       qualification : {"unchecked", "allowed", "denied"},
       attempt : {"unchecked", "not-started", "associated", "unknown"},
       effects : 0..1, broadcast : BOOLEAN]

FreshWriter == st.writer = "acquired" =>
  /\ st.prefix = "valid" /\ env.writer = "success"
  /\ st.writerEpoch = OldEpoch + 1 /\ st.durableEpoch = st.writerEpoch

CompleteCurrentBaseline == st.baseline # None =>
  /\ st.prefix = "valid" /\ st.roots = "valid"
  /\ st.writer = "acquired" /\ st.baseline = Baseline

ClaimsUseOriginalIdentity == st.claimRefs = OriginalClaims
SettledClaimsHaveEvidence == \A c \in Claims :
  st.claims[c] = "settled" => env.claims[c] = "dischargeable"

OpenRequiresEligibility == st.ready =>
  /\ st.baseline # None /\ CompleteCurrentBaseline /\ FreshWriter
  /\ ClaimsClosed /\ SettledClaimsHaveEvidence /\ ClaimsUseOriginalIdentity

HistoricalCompletionUnchanged == st.historical = Original

LookupCoversOriginal == st.lookup # None =>
  /\ st.lookup.original = Original
  /\ st.lookup.baselineRef = st.baseline
  /\ st.lookup.baselineRef.domain = Original.position.domain
  /\ st.lookup.baselineRef.watermark >= Original.position.seq
  /\ st.lookup.baselineRef.hostGeneration = HostGeneration
  /\ st.lookup.baselineRef.writerEpoch = NewEpoch

BroadcastRequiresOpen == st.broadcast => st.ready
UnknownAttemptNeverResent == st.attempt = "unknown" => st.effects = 0
TombstonesNeverResurrect == env.tombstone # "live" => st.effects = 0

EffectGuard == st'.effects > st.effects =>
  /\ st.ready /\ st.lookup # None /\ st.qualification = "allowed"
  /\ st.attempt = "not-started" /\ env.tombstone = "live"
EffectRequiresCurrentEvidence == [][EffectGuard]_vars
OpeningGuard == (~st.ready /\ st'.ready) => st'.effects = st.effects
OpeningDoesNotExecute == [][OpeningGuard]_vars

GoodRecoveryEvidence ==
  /\ env.prefix = "valid" /\ env.writer = "success" /\ env.roots = "valid"
  /\ \A c \in Claims : env.claims[c] = "dischargeable"
ConditionalRecoveryProgress == GoodRecoveryEvidence => <>(st.ready /\ st.lookup # None)
\* Deliberately false without favorable evidence, even under FairSpec.
UnconditionalRecoveryProgress == <>(st.ready /\ st.lookup # None)

\* Reachability probes are intentionally false invariants, not safety claims.
NoRecoveredExecution == ~(st.ready /\ st.lookup # None /\ st.effects = 1)
NoBlockedConsumableUnknown == ~(/\ st.lookup # None /\ ~st.ready
  /\ st.attempt = "unknown" /\ "blocked" \in {st.claims[c] : c \in Claims})
=============================================================================
