--------------------------- MODULE TailSettlement ---------------------------
EXTENDS Naturals, Sequences, FiniteSets

(***************************************************************************
 Two layers, one shared history:
 - The log compares its tail and commits opaque batches. It does NOT know
   run-end, late, ResponseId, or MessageId.
 - The consumer interpretation below gives opaque test payloads those
   meanings. It is a fixture projection, not a production Run recognizer.
 Actor 1 settles a response alone. Actor 2 submits a message + response batch.
 Both settle the SAME original ResponseId and original attempt 1.
 A boundary producer can append attempt 2 OR run-end at attempt 1. Another
 writer appends an unrelated record. Both can intervene after ReadPrefix.
 Controls deliberately remove one premise each. No model-check run is
 recorded here. Atomic batches, stable identities, dense positions and
 stopped-writer isolation are assumptions of the abstraction, not proofs.
 ***************************************************************************)

CONSTANTS CheckTail, AtomicTail, CompleteRead, SafeRecovery,
          BoundaryKind, MaxRequests

Actors == 1..2
Kinds == {"attempt", "end", "noise", "message", "response"}
Phases == {"idle", "ready", "pending", "unknown", "done", "exhausted"}
Results == {"none", "success", "alreadyRecorded", "tailChanged"}

Entry == [kind : Kinds, att : 0..2, late : BOOLEAN, key : 0..2,
          actor : 0..2, basis : 0..5, before : 0..5]
Fact(kind, att) == [kind |-> kind, att |-> att, late |-> FALSE, key |-> 0,
                    actor |-> 0, basis |-> 0, before |-> 0]

VARIABLES log, pc, basis, plannedLate, outstanding, judged, tailOK,
          attempts, result, committedRequests, claimedAbsent, boundaryUsed, noiseUsed

vars == <<log, pc, basis, plannedLate, outstanding, judged, tailOK,
          attempts, result, committedRequests, claimedAbsent, boundaryUsed, noiseUsed>>

\* This operator belongs to the CONSUMER, not the log capability.
LateIn(h) == \E i \in 1..Len(h) :
                 h[i].kind = "end" \/ h[i].att > 1
HasResponse(h) == \E i \in 1..Len(h) : h[i].kind = "response"
PrefixOf(h, n) == SubSeq(h, 1, n)

Response(p) == [kind |-> "response", att |-> 1, key |-> 1,
                 late |-> plannedLate[p], actor |-> p,
                 basis |-> basis[p], before |-> Len(log)]
Message(p) == [kind |-> "message", att |-> 1, key |-> 2,
                late |-> FALSE, actor |-> p,
                basis |-> basis[p], before |-> Len(log)]
Batch(p) == IF p = 1 THEN <<Response(p)>> ELSE <<Message(p), Response(p)>>

\* The log's dedupe test uses opaque shell keys, not the consumer's kind.
\* 0 means no key; 1/2 stand for two fixed, distinct opaque values.
BatchKeysFree(h, batch) == \A i \in 1..Len(batch) :
                           batch[i].key = 0 \/
                           \A j \in 1..Len(h) : h[j].key # batch[i].key

Init ==
  /\ log = <<Fact("attempt", 1)>>
  /\ pc = [p \in Actors |-> "idle"]
  /\ basis = [p \in Actors |-> 0]
  /\ plannedLate = [p \in Actors |-> FALSE]
  /\ outstanding = [p \in Actors |-> FALSE]
  /\ judged = [p \in Actors |-> FALSE]
  /\ tailOK = [p \in Actors |-> FALSE]
  /\ attempts = [p \in Actors |-> 0]
  /\ result = [p \in Actors |-> "none"]
  /\ committedRequests = {}
  /\ claimedAbsent = {}
  /\ boundaryUsed = FALSE
  /\ noiseUsed = FALSE

ReadPrefix(p) ==
  /\ pc[p] = "idle"
  /\ ~outstanding[p]
  /\ attempts[p] < MaxRequests
  /\ pc' = [pc EXCEPT ![p] = "ready"]
  /\ basis' = [basis EXCEPT ![p] = Len(log)]
  \* The broken read keeps the real tail but omits boundary records, just
  \* as a readByKey result can omit them. No log payload interpretation.
  /\ plannedLate' = [plannedLate EXCEPT ![p] =
                       IF CompleteRead THEN LateIn(log) ELSE FALSE]
  /\ UNCHANGED <<log, outstanding, judged, tailOK, attempts, result,
                 committedRequests, claimedAbsent, boundaryUsed, noiseUsed>>

Submit(p) ==
  /\ pc[p] = "ready"
  /\ ~outstanding[p]
  /\ pc' = [pc EXCEPT ![p] = "pending"]
  /\ outstanding' = [outstanding EXCEPT ![p] = TRUE]
  /\ judged' = [judged EXCEPT ![p] = FALSE]
  /\ attempts' = [attempts EXCEPT ![p] = @ + 1]
  /\ result' = [result EXCEPT ![p] = "none"]
  /\ UNCHANGED <<log, basis, plannedLate, tailOK,
                 committedRequests, claimedAbsent, boundaryUsed, noiseUsed>>

\* Negative control only: save the comparison, let another writer append,
\* and later use the stale verdict. Dedupe still judges at commit.
CompareSeparately(p) ==
  /\ ~AtomicTail
  /\ outstanding[p]
  /\ ~judged[p]
  /\ judged' = [judged EXCEPT ![p] = TRUE]
  /\ tailOK' = [tailOK EXCEPT ![p] = (basis[p] = Len(log))]
  /\ UNCHANGED <<log, pc, basis, plannedLate, outstanding, attempts, result,
                 committedRequests, claimedAbsent, boundaryUsed, noiseUsed>>

ConditionPasses(p) == ~CheckTail \/
                       (IF AtomicTail THEN basis[p] = Len(log) ELSE tailOK[p])
Verdict(p) == IF ~BatchKeysFree(log, Batch(p)) THEN "alreadyRecorded"
               ELSE IF ~ConditionPasses(p) THEN "tailChanged"
               ELSE "success"

FinishPhase(p, v) ==
  IF v = "tailChanged"
    THEN IF attempts[p] < MaxRequests THEN "idle" ELSE "exhausted"
    ELSE "done"

Commit(p, loseAck) ==
  /\ outstanding[p]
  /\ AtomicTail \/ judged[p]
  /\ LET v == Verdict(p) IN
       /\ log' = IF v = "success" THEN log \o Batch(p) ELSE log
       /\ committedRequests' = IF v = "success" THEN committedRequests \cup {<<p, attempts[p]>>}
                           ELSE committedRequests
       /\ result' = [result EXCEPT ![p] = v]
       /\ pc' = [pc EXCEPT ![p] =
                    IF loseAck \/ pc[p] = "unknown" THEN "unknown"
                    ELSE FinishPhase(p, v)]
  /\ outstanding' = [outstanding EXCEPT ![p] = FALSE]
  /\ UNCHANGED <<basis, plannedLate, judged, tailOK, attempts,
                 claimedAbsent, boundaryUsed, noiseUsed>>

\* A timeout can hide a STILL PENDING request, not just a committed one.
LoseBeforeCommit(p) ==
  /\ pc[p] = "pending"
  /\ outstanding[p]
  /\ pc' = [pc EXCEPT ![p] = "unknown"]
  /\ UNCHANGED <<log, basis, plannedLate, outstanding, judged, tailOK,
                 attempts, result, committedRequests, claimedAbsent,
                 boundaryUsed, noiseUsed>>

\* Environment obligation: this transition means real old-writer isolation
\* completed. It does not model how a provider makes that happen.
StopOld(p) ==
  /\ pc[p] = "unknown"
  /\ outstanding[p]
  /\ outstanding' = [outstanding EXCEPT ![p] = FALSE]
  /\ UNCHANGED <<log, pc, basis, plannedLate, judged, tailOK, attempts,
                 result, committedRequests, claimedAbsent, boundaryUsed, noiseUsed>>

Recover(p) ==
  /\ pc[p] = "unknown"
  /\ IF SafeRecovery
       THEN /\ ~outstanding[p]
            /\ pc' = [pc EXCEPT ![p] =
                         IF HasResponse(log) THEN "done"
                         ELSE IF attempts[p] < MaxRequests THEN "idle"
                         ELSE "exhausted"]
            /\ claimedAbsent' = IF HasResponse(log) THEN claimedAbsent
                                  ELSE claimedAbsent \cup {<<p, attempts[p]>>}
       ELSE /\ pc' = [pc EXCEPT ![p] = "done"]
            /\ claimedAbsent' = claimedAbsent \cup {<<p, attempts[p]>>}
  /\ UNCHANGED <<log, basis, plannedLate, outstanding, judged, tailOK,
                 attempts, result, committedRequests, boundaryUsed, noiseUsed>>

AppendBoundary ==
  /\ ~boundaryUsed
  /\ log' = Append(log, Fact(BoundaryKind,
                         IF BoundaryKind = "attempt" THEN 2 ELSE 1))
  /\ boundaryUsed' = TRUE
  /\ UNCHANGED <<pc, basis, plannedLate, outstanding, judged, tailOK,
                 attempts, result, committedRequests, claimedAbsent, noiseUsed>>

AppendNoise ==
  /\ ~noiseUsed
  /\ log' = Append(log, Fact("noise", 0))
  /\ noiseUsed' = TRUE
  /\ UNCHANGED <<pc, basis, plannedLate, outstanding, judged, tailOK,
                 attempts, result, committedRequests, claimedAbsent, boundaryUsed>>

Next ==
  \/ \E p \in Actors : ReadPrefix(p) \/ Submit(p) \/ CompareSeparately(p)
                           \/ LoseBeforeCommit(p) \/ StopOld(p) \/ Recover(p)
  \/ \E p \in Actors, loseAck \in BOOLEAN : Commit(p, loseAck)
  \/ AppendBoundary
  \/ AppendNoise

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ log \in [1..Len(log) -> Entry]
  /\ Len(log) <= 5
  /\ pc \in [Actors -> Phases]
  /\ basis \in [Actors -> 0..5]
  /\ plannedLate \in [Actors -> BOOLEAN]
  /\ outstanding \in [Actors -> BOOLEAN]
  /\ judged \in [Actors -> BOOLEAN]
  /\ tailOK \in [Actors -> BOOLEAN]
  /\ attempts \in [Actors -> 0..MaxRequests]
  /\ result \in [Actors -> Results]
  /\ committedRequests \subseteq (Actors \X (1..MaxRequests))
  /\ claimedAbsent \subseteq (Actors \X (1..MaxRequests))
  /\ boundaryUsed \in BOOLEAN
  /\ noiseUsed \in BOOLEAN

\* SL3 S-33: every successful conditional append uses exactly the preceding
\* committed tail. Each batch member remembers that tail for this assertion.
TailGuardSound == \A i \in 1..Len(log) :
                   log[i].kind = "response" => log[i].basis = log[i].before

\* Consumer composition, S-34/S-36: correct before the RESPONSE commit;
\* unrelated messages in its own batch do not change the Run facts.
LateCorrect == \A i \in 1..Len(log) :
                 log[i].kind = "response" =>
                   log[i].late = LateIn(PrefixOf(log, i - 1))

\* SL3 S-22/S-35: do not call an unknown request "definitely did not write"
\* while it still can write, or after it actually committed.
NoFalseNoWrite == \A request \in claimedAbsent :
                   /\ ~(outstanding[request[1]] /\
                          attempts[request[1]] = request[2])
                   /\ request \notin committedRequests

\* Reachability controls: expected counterexamples, never formal tasks.
NeverTailChanged == \A p \in Actors : result[p] # "tailChanged"
NeverDuplicateRejected == \A p \in Actors : result[p] # "alreadyRecorded"
NeverLateSettled == ~\E i \in 1..Len(log) :
                     log[i].kind = "response" /\ log[i].late
=============================================================================
