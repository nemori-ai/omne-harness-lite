----------------------------- MODULE Settlement -----------------------------
EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS WithRun, BoundaryKind, Budget, NoiseLimit, UnknownOpened,
          CheckTail, WholeBatch, TrustUnknown, KeepOwner, GuardOpened

Actors == {1, 2}
Phases == {"prepare", "ready", "pending", "unknown", "done", "exhausted"}
Entry(k, a, l, f, p, t) ==
  [kind |-> k, actor |-> a, late |-> l, first |-> f,
   expectedTail |-> p, actualTail |-> t]
InitialLog == <<Entry("sent", 0, FALSE, FALSE, 0, 0)>>

VARIABLES log, pc, prefix, pending, stopped, spent, owner, claims,
          unsafeAbsence, anchorPending, anchorKnown, noise
vars == <<log, pc, prefix, pending, stopped, spent, owner, claims,
          unsafeAbsence, anchorPending, anchorKnown, noise>>

HasKind(xs, k) == \E i \in 1..Len(xs): xs[i].kind = k
HasResponse(xs) == HasKind(xs, "response")
HasMessage(xs) == HasKind(xs, "message")
ResponseIndex(xs) == CHOOSE i \in 1..Len(xs): xs[i].kind = "response"
Winner(xs) == IF HasResponse(xs) THEN xs[ResponseIndex(xs)].actor ELSE 0
HasWhole(xs) ==
  HasResponse(xs) /\
  (Winner(xs) = 1 \/
   (Winner(xs) = 2 /\
    \E i \in 1..Len(xs): xs[i].kind = "message" /\ xs[i].actor = 2))
LateIn(xs) == WithRun /\ (HasKind(xs, "superseded") \/ HasKind(xs, "ended"))
FirstIn(xs) == HasKind(xs, "opened")
AllStopped == \A a \in Actors: stopped[a]

Init ==
  /\ log = InitialLog
  /\ pc = [a \in Actors |-> "prepare"]
  /\ prefix = [a \in Actors |-> InitialLog]
  /\ pending = [a \in Actors |-> FALSE]
  /\ stopped = [a \in Actors |-> TRUE]
  /\ spent = [a \in Actors |-> 0]
  /\ owner = [a \in Actors |-> TRUE]
  /\ claims = [a \in Actors |-> 0]
  /\ unsafeAbsence = FALSE
  /\ anchorPending = UnknownOpened
  /\ anchorKnown = ~UnknownOpened
  /\ noise = 0

Prepare(a) ==
  /\ pc[a] = "prepare"
  /\ anchorKnown \/ ~GuardOpened
  /\ spent[a] < Budget
  /\ prefix' = [prefix EXCEPT ![a] = log]
  /\ pc' = [pc EXCEPT ![a] = IF HasWhole(log) THEN "done" ELSE "ready"]
  /\ claims' = [claims EXCEPT ![a] = IF HasWhole(log) THEN Winner(log) ELSE 0]
  /\ owner' = [owner EXCEPT ![a] = ~HasWhole(log)]
  /\ UNCHANGED <<log, pending, stopped, spent, unsafeAbsence,
                  anchorPending, anchorKnown, noise>>

Submit(a) ==
  /\ pc[a] = "ready"
  /\ spent[a] < Budget
  /\ anchorKnown \/ ~GuardOpened
  /\ pc' = [pc EXCEPT ![a] = "pending"]
  /\ pending' = [pending EXCEPT ![a] = TRUE]
  /\ stopped' = [stopped EXCEPT ![a] = FALSE]
  /\ spent' = [spent EXCEPT ![a] = @ + 1]
  /\ UNCHANGED <<log, prefix, owner, claims, unsafeAbsence,
                  anchorPending, anchorKnown, noise>>

Batch(a) ==
  LET r == Entry("response", a, LateIn(prefix[a]), FirstIn(prefix[a]),
                 Len(prefix[a]), Len(log))
      m == Entry("message", 2, FALSE, FALSE, Len(prefix[a]), Len(log))
  IN IF a = 1 THEN <<r>> ELSE IF WholeBatch THEN <<m, r>> ELSE <<m>>

Process(a) ==
  /\ pending[a]
  /\ LET collision == HasResponse(log) \/ (a = 2 /\ HasMessage(log))
         conflict == WithRun /\ CheckTail /\ Len(prefix[a]) # Len(log)
         accepted == ~collision /\ ~conflict
         unknown == pc[a] = "unknown"
     IN /\ log' = IF accepted THEN log \o Batch(a) ELSE log
        /\ pc' = [pc EXCEPT ![a] = IF unknown THEN "unknown"
                       ELSE IF accepted THEN "done" ELSE "prepare"]
        /\ claims' = [claims EXCEPT ![a] = IF accepted /\ ~unknown THEN a ELSE @]
        /\ owner' = [owner EXCEPT ![a] = IF accepted /\ ~unknown THEN FALSE ELSE @]
        /\ stopped' = [stopped EXCEPT ![a] = ~unknown]
  /\ pending' = [pending EXCEPT ![a] = FALSE]
  /\ UNCHANGED <<prefix, spent, unsafeAbsence, anchorPending, anchorKnown, noise>>

LoseAck(a) ==
  /\ pc[a] = "pending"
  /\ pc' = [pc EXCEPT ![a] = "unknown"]
  /\ UNCHANGED <<log, prefix, pending, stopped, spent, owner, claims,
                  unsafeAbsence, anchorPending, anchorKnown, noise>>

\* StopOld abstracts ACTUAL cessation/drain of the detached writer. No claim
\* about OS, network, promise cancellation or a fence implementing this action.
StopOld(a) ==
  /\ pc[a] = "unknown" /\ ~stopped[a]
  /\ stopped' = [stopped EXCEPT ![a] = TRUE]
  /\ pending' = [pending EXCEPT ![a] = FALSE]
  /\ UNCHANGED <<log, pc, prefix, spent, owner, claims, unsafeAbsence,
                  anchorPending, anchorKnown, noise>>

Recover(a) ==
  /\ pc[a] = "unknown"
  /\ (AllStopped /\ anchorKnown) \/ TrustUnknown
  /\ prefix' = [prefix EXCEPT ![a] = log]
  /\ pc' = [pc EXCEPT ![a] = IF HasWhole(log) THEN "done" ELSE "prepare"]
  /\ claims' = [claims EXCEPT ![a] = IF HasWhole(log) THEN Winner(log) ELSE 0]
  /\ owner' = [owner EXCEPT ![a] = ~HasWhole(log)]
  /\ unsafeAbsence' = (unsafeAbsence \/
         (~HasWhole(log) /\ (~AllStopped \/ ~anchorKnown)))
  /\ UNCHANGED <<log, pending, stopped, spent, anchorPending, anchorKnown, noise>>

Exhaust(a) ==
  /\ pc[a] \in {"prepare", "ready"}
  /\ spent[a] >= Budget
  /\ pc' = [pc EXCEPT ![a] = "exhausted"]
  /\ owner' = [owner EXCEPT ![a] = KeepOwner]
  /\ UNCHANGED <<log, prefix, pending, stopped, spent, claims, unsafeAbsence,
                  anchorPending, anchorKnown, noise>>

CancelPolicy(a) ==
  /\ pc[a] \in {"prepare", "ready"}
  /\ pc' = [pc EXCEPT ![a] = "exhausted"]
  /\ owner' = [owner EXCEPT ![a] = TRUE]
  /\ UNCHANGED <<log, prefix, pending, stopped, spent, claims, unsafeAbsence,
                  anchorPending, anchorKnown, noise>>

Boundary ==
  /\ WithRun
  /\ ~HasKind(log, BoundaryKind)
  /\ log' = Append(log, Entry(BoundaryKind, 0, FALSE, FALSE, 0, 0))
  /\ UNCHANGED <<pc, prefix, pending, stopped, spent, owner, claims,
                  unsafeAbsence, anchorPending, anchorKnown, noise>>

Noise ==
  /\ noise < NoiseLimit
  /\ noise' = noise + 1
  /\ log' = Append(log, Entry("noise", 0, FALSE, FALSE, 0, 0))
  /\ UNCHANGED <<pc, prefix, pending, stopped, spent, owner, claims,
                  unsafeAbsence, anchorPending, anchorKnown>>

\* The old opened append can still commit after a lost acknowledgement.
LateOpened ==
  /\ anchorPending
  /\ log' = Append(log, Entry("opened", 0, FALSE, FALSE, 0, 0))
  /\ anchorPending' = FALSE
  /\ UNCHANGED <<pc, prefix, pending, stopped, spent, owner, claims,
                  unsafeAbsence, anchorKnown, noise>>

\* Joint actual stop + authoritative recovery read is an explicit assumption.
RecoverOpened ==
  /\ ~anchorKnown
  /\ anchorKnown' = TRUE
  /\ anchorPending' = FALSE
  /\ UNCHANGED <<log, pc, prefix, pending, stopped, spent, owner, claims,
                  unsafeAbsence, noise>>

Next == Boundary \/ Noise \/ LateOpened \/ RecoverOpened \/
        \E a \in Actors: Prepare(a) \/ Submit(a) \/ Process(a) \/
          LoseAck(a) \/ StopOld(a) \/ Recover(a) \/ Exhaust(a) \/ CancelPolicy(a)
Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ pc \in [Actors -> Phases]
  /\ pending \in [Actors -> BOOLEAN]
  /\ stopped \in [Actors -> BOOLEAN]
  /\ owner \in [Actors -> BOOLEAN]
  /\ spent \in [Actors -> 0..Budget]
  /\ claims \in [Actors -> {0, 1, 2}]
  /\ unsafeAbsence \in BOOLEAN
  /\ anchorPending \in BOOLEAN /\ anchorKnown \in BOOLEAN
  /\ noise \in 0..NoiseLimit
ResponsePositions == {i \in 1..Len(log): log[i].kind = "response"}
OneResponse == Cardinality(ResponsePositions) <= 1
TailGuardSound == \A i \in ResponsePositions:
  WithRun => log[i].expectedTail = log[i].actualTail
LateCorrect == \A i \in ResponsePositions:
  log[i].late = LateIn(SubSeq(log, 1, log[i].actualTail))
NoOrphanMessage == HasMessage(log) => (HasResponse(log) /\ Winner(log) = 2)
ClaimsWholeBatch == \A a \in Actors:
  claims[a] # 0 => (HasWhole(log) /\ claims[a] = Winner(log))
UnknownNotAbsence == ~unsafeAbsence
PendingOwned == \A a \in Actors: pc[a] # "done" => owner[a]
NoSettlementThroughUnknownOpened == HasResponse(log) => anchorKnown
FirstTokenCorrect == \A i \in ResponsePositions:
  log[i].first = FirstIn(SubSeq(log, 1, log[i].actualTail))

\* Fixed identities, original binding/parameters/cost and whole-prefix reading
\* are modeled by construction, not separately demonstrated by these checks.
=============================================================================
