------------------------------ MODULE Intent ------------------------------
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Workers, MaxGeneration, ImportedFirst,
          BadUnknownRepost, BadPostBeforeDirectorySync
Generations == 1..MaxGeneration
None == "none"
Old == "old"
Current == "current"
Stages == {"absent", "created", "complete", "fileDurable", "durable"}
Phases == {"idle", "verify", "absence", "create", "write", "fileSync",
           "directorySync", "post", "done", "down"}
Statuses == {"none", "unknown", "pending", "failure", "success"}

VARIABLES stage, owner, binding, originalBinding, predecessor, retryEvidence,
          posts, postActors, postedDurably, status, factsPresent,
          pc, candidate, retryRequested, checkedPredecessor
vars == <<stage, owner, binding, originalBinding, predecessor, retryEvidence,
          posts, postActors, postedDurably, status, factsPresent,
          pc, candidate, retryRequested, checkedPredecessor>>
Existing == {g \in Generations: stage[g] # "absent"}
Latest == IF Existing = {} THEN 0
          ELSE CHOOSE g \in Existing: \A h \in Existing: g >= h

Init ==
  /\ stage = [g \in Generations |-> IF ImportedFirst /\ g = 1 THEN "durable" ELSE "absent"]
  /\ owner = [g \in Generations |-> IF ImportedFirst /\ g = 1 THEN Old ELSE None]
  /\ binding = [g \in Generations |-> IF ImportedFirst /\ g = 1 THEN Old ELSE None]
  /\ originalBinding = binding
  /\ predecessor = [g \in Generations |-> 0]
  /\ retryEvidence = [g \in Generations |-> FALSE]
  /\ posts \in [Generations -> 0..1]
  /\ \A g \in Generations: ~(ImportedFirst /\ g = 1) => posts[g] = 0
  /\ postActors = [g \in Generations |-> IF ImportedFirst /\ g = 1 /\ posts[g] = 1 THEN {Old} ELSE {}]
  /\ postedDurably = [g \in Generations |-> TRUE]
  /\ status \in [Generations -> Statuses]
  /\ \A g \in Generations:
       IF ImportedFirst /\ g = 1
         THEN IF posts[g] = 0 THEN status[g] = "unknown"
              ELSE status[g] \in {"unknown", "pending", "failure", "success"}
         ELSE status[g] = "none"
  /\ factsPresent = FALSE
  /\ pc = [w \in Workers |-> "idle"]
  /\ candidate = [w \in Workers |-> 0]
  /\ retryRequested = [w \in Workers |-> FALSE]
  /\ checkedPredecessor = [w \in Workers |-> 0]

Begin(w, retry) ==
  /\ pc[w] = "idle"
  /\ retryRequested' = [retryRequested EXCEPT ![w] = retry]
  /\ checkedPredecessor' = [checkedPredecessor EXCEPT ![w] = 0]
  /\ IF Latest = 0
        THEN /\ candidate' = [candidate EXCEPT ![w] = 1]
             /\ pc' = [pc EXCEPT ![w] = "absence"]
        ELSE IF Latest < MaxGeneration /\ status[Latest] = "failure" /\ retry
          THEN /\ candidate' = [candidate EXCEPT ![w] = Latest + 1]
               /\ pc' = [pc EXCEPT ![w] = "verify"]
          ELSE /\ candidate' = [candidate EXCEPT ![w] = 0]
               /\ pc' = [pc EXCEPT ![w] = "done"]
  /\ UNCHANGED <<stage, owner, binding, originalBinding, predecessor, retryEvidence,
                 posts, postActors, postedDurably, status, factsPresent>>

VerifyFailedPredecessor(w) ==
  /\ pc[w] = "verify"
  /\ status[candidate[w] - 1] = "failure"
  /\ checkedPredecessor' = [checkedPredecessor EXCEPT ![w] = candidate[w] - 1]
  /\ pc' = [pc EXCEPT ![w] = "absence"]
  /\ UNCHANGED <<stage, owner, binding, originalBinding, predecessor, retryEvidence,
                 posts, postActors, postedDurably, status, factsPresent,
                 candidate, retryRequested>>

ReadFactsAbsence(w) ==
  /\ pc[w] = "absence"
  /\ pc' = [pc EXCEPT ![w] = IF factsPresent THEN "done" ELSE "create"]
  /\ UNCHANGED <<stage, owner, binding, originalBinding, predecessor, retryEvidence,
                 posts, postActors, postedDurably, status, factsPresent,
                 candidate, retryRequested, checkedPredecessor>>

CreateExclusive(w) ==
  LET g == candidate[w] IN
  /\ pc[w] = "create"
  /\ stage[g] = "absent"
  /\ stage' = [stage EXCEPT ![g] = "created"]
  /\ owner' = [owner EXCEPT ![g] = w]
  /\ binding' = [binding EXCEPT ![g] = Current]
  /\ originalBinding' = [originalBinding EXCEPT ![g] = Current]
  /\ predecessor' = [predecessor EXCEPT ![g] = g - 1]
  /\ retryEvidence' = [retryEvidence EXCEPT ![g] =
       g = 1 \/ (retryRequested[w] /\ checkedPredecessor[w] = g - 1)]
  /\ pc' = [pc EXCEPT ![w] = "write"]
  /\ UNCHANGED <<posts, postActors, postedDurably, status, factsPresent,
                 candidate, retryRequested, checkedPredecessor>>

CreateConflict(w) ==
  /\ pc[w] = "create"
  /\ stage[candidate[w]] # "absent"
  /\ pc' = [pc EXCEPT ![w] = "done"]
  /\ UNCHANGED <<stage, owner, binding, originalBinding, predecessor, retryEvidence,
                 posts, postActors, postedDurably, status, factsPresent,
                 candidate, retryRequested, checkedPredecessor>>

WriteIntent(w) ==
  /\ pc[w] = "write"
  /\ stage' = [stage EXCEPT ![candidate[w]] = "complete"]
  /\ pc' = [pc EXCEPT ![w] = "fileSync"]
  /\ UNCHANGED <<owner, binding, originalBinding, predecessor, retryEvidence,
                 posts, postActors, postedDurably, status, factsPresent,
                 candidate, retryRequested, checkedPredecessor>>

SyncFile(w) ==
  /\ pc[w] = "fileSync"
  /\ stage' = [stage EXCEPT ![candidate[w]] = "fileDurable"]
  /\ pc' = [pc EXCEPT ![w] = "directorySync"]
  /\ UNCHANGED <<owner, binding, originalBinding, predecessor, retryEvidence,
                 posts, postActors, postedDurably, status, factsPresent,
                 candidate, retryRequested, checkedPredecessor>>

SyncDirectory(w) ==
  /\ pc[w] = "directorySync"
  /\ stage' = [stage EXCEPT ![candidate[w]] = "durable"]
  /\ pc' = [pc EXCEPT ![w] = "post"]
  /\ UNCHANGED <<owner, binding, originalBinding, predecessor, retryEvidence,
                 posts, postActors, postedDurably, status, factsPresent,
                 candidate, retryRequested, checkedPredecessor>>

Post(w) ==
  LET g == candidate[w] IN
  /\ pc[w] = "post" \/ (BadPostBeforeDirectorySync /\ pc[w] = "directorySync")
  /\ posts' = [posts EXCEPT ![g] = @ + 1]
  /\ postActors' = [postActors EXCEPT ![g] = @ \cup {w}]
  /\ postedDurably' = [postedDurably EXCEPT ![g] = @ /\ stage[g] = "durable"]
  /\ status' = [status EXCEPT ![g] = "unknown"]
  /\ pc' = [pc EXCEPT ![w] = "done"]
  /\ UNCHANGED <<stage, owner, binding, originalBinding, predecessor, retryEvidence,
                 factsPresent, candidate, retryRequested, checkedPredecessor>>

Observe(g, outcome) ==
  /\ status[g] = "unknown"
  /\ posts[g] > 0
  /\ outcome \in {"pending", "failure", "success"}
  /\ status' = [status EXCEPT ![g] = outcome]
  /\ UNCHANGED <<stage, owner, binding, originalBinding, predecessor, retryEvidence,
                 posts, postActors, postedDurably, factsPresent,
                 pc, candidate, retryRequested, checkedPredecessor>>

Complete(g, outcome) ==
  /\ status[g] = "pending"
  /\ outcome \in {"failure", "success"}
  /\ status' = [status EXCEPT ![g] = outcome]
  /\ UNCHANGED <<stage, owner, binding, originalBinding, predecessor, retryEvidence,
                 posts, postActors, postedDurably, factsPresent,
                 pc, candidate, retryRequested, checkedPredecessor>>

PublishFacts(g) ==
  /\ status[g] = "success"
  /\ ~factsPresent
  /\ factsPresent' = TRUE
  /\ UNCHANGED <<stage, owner, binding, originalBinding, predecessor, retryEvidence,
                 posts, postActors, postedDurably, status,
                 pc, candidate, retryRequested, checkedPredecessor>>

Crash(w) ==
  /\ pc[w] # "down"
  /\ pc' = [pc EXCEPT ![w] = "down"]
  /\ candidate' = [candidate EXCEPT ![w] = 0]
  /\ retryRequested' = [retryRequested EXCEPT ![w] = FALSE]
  /\ checkedPredecessor' = [checkedPredecessor EXCEPT ![w] = 0]
  /\ UNCHANGED <<stage, owner, binding, originalBinding, predecessor, retryEvidence,
                 posts, postActors, postedDurably, status, factsPresent>>

Restart(w) ==
  /\ pc[w] \in {"down", "done"}
  /\ pc' = [pc EXCEPT ![w] = "idle"]
  /\ candidate' = [candidate EXCEPT ![w] = 0]
  /\ retryRequested' = [retryRequested EXCEPT ![w] = FALSE]
  /\ checkedPredecessor' = [checkedPredecessor EXCEPT ![w] = 0]
  /\ UNCHANGED <<stage, owner, binding, originalBinding, predecessor, retryEvidence,
                 posts, postActors, postedDurably, status, factsPresent>>

RepostUnknown(w, g) ==
  /\ BadUnknownRepost
  /\ pc[w] = "idle"
  /\ stage[g] = "durable"
  /\ status[g] = "unknown"
  /\ posts[g] < 2
  /\ posts' = [posts EXCEPT ![g] = @ + 1]
  /\ postActors' = [postActors EXCEPT ![g] = @ \cup {w}]
  /\ pc' = [pc EXCEPT ![w] = "done"]
  /\ UNCHANGED <<stage, owner, binding, originalBinding, predecessor, retryEvidence,
                 postedDurably, status, factsPresent,
                 candidate, retryRequested, checkedPredecessor>>

Next ==
  \/ \E w \in Workers:
       \/ (\E retry \in BOOLEAN: Begin(w, retry))
       \/ VerifyFailedPredecessor(w) \/ ReadFactsAbsence(w)
       \/ CreateExclusive(w) \/ CreateConflict(w) \/ WriteIntent(w)
       \/ SyncFile(w) \/ SyncDirectory(w) \/ Post(w) \/ Crash(w) \/ Restart(w)
       \/ (\E g \in Generations: RepostUnknown(w, g))
  \/ \E g \in Generations:
       \/ (\E outcome \in {"pending", "failure", "success"}: Observe(g, outcome))
       \/ (\E outcome \in {"failure", "success"}: Complete(g, outcome))
       \/ PublishFacts(g)

TypeOK ==
  /\ stage \in [Generations -> Stages]
  /\ owner \in [Generations -> Workers \cup {None, Old}]
  /\ binding \in [Generations -> {None, Old, Current}]
  /\ originalBinding \in [Generations -> {None, Old, Current}]
  /\ predecessor \in [Generations -> 0..MaxGeneration]
  /\ retryEvidence \in [Generations -> BOOLEAN]
  /\ posts \in [Generations -> 0..2]
  /\ postActors \in [Generations -> SUBSET (Workers \cup {Old})]
  /\ postedDurably \in [Generations -> BOOLEAN]
  /\ status \in [Generations -> Statuses]
  /\ factsPresent \in BOOLEAN
  /\ pc \in [Workers -> Phases]
  /\ candidate \in [Workers -> 0..MaxGeneration]
  /\ retryRequested \in [Workers -> BOOLEAN]
  /\ checkedPredecessor \in [Workers -> 0..MaxGeneration]

AtMostOnePost == \A g \in Generations: posts[g] <= 1
ExclusiveCreatorPosts == \A g \in Generations: postActors[g] \subseteq {owner[g]}
DurableIntentBeforePost == \A g \in Generations: postedDurably[g]
OriginalBindingPreserved ==
  /\ binding = originalBinding
  /\ ImportedFirst => binding[1] = Old
NewGenerationsUseCurrent ==
  \A g \in Existing: ~(ImportedFirst /\ g = 1) => binding[g] = Current
RetryHasFailedPredecessor ==
  \A g \in Existing \ {1}:
    /\ predecessor[g] = g - 1
    /\ retryEvidence[g]
    /\ status[g - 1] = "failure"
NoGenerationGap == \A g \in Existing: 1..g \subseteq Existing

Spec == Init /\ [][Next]_vars
=============================================================================
