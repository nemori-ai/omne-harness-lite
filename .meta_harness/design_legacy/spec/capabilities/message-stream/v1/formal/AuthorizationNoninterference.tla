------------------- MODULE AuthorizationNoninterference -------------------
EXTENDS Naturals, FiniteSets, TLC

(***************************************************************************)
(* PRE-CONTRACT WIP. Self-composition for SE-20's per-guessed-identity      *)
(* observation. The three worlds differ only in X's hidden/absent/expired   *)
(* server history. Collection metadata may diverge and is deliberately not  *)
(* compared as object-specific output.                                      *)
(***************************************************************************)
CONSTANT Mutation
ASSUME Mutation \in {"none", "guessed_id_classification"}

Worlds == {"hidden", "absent", "expired"}
ObjectClasses == {"none", "inaccessible", "not_found", "evidence_expired"}

VARIABLES asOf, completeTo, floor, authorizationDefinition,
          visibilityVersion, responseHasX, responseClassForX,
          collectionReset, guessedIdentityAccepted

vars == <<asOf, completeTo, floor, authorizationDefinition,
          visibilityVersion, responseHasX, responseClassForX,
          collectionReset, guessedIdentityAccepted>>

Init ==
  /\ asOf = [w \in Worlds |-> 0]
  /\ completeTo = [w \in Worlds |-> 0]
  /\ floor = [w \in Worlds |-> 0]
  /\ authorizationDefinition = 0
  /\ visibilityVersion = 0
  /\ responseHasX = [w \in Worlds |-> FALSE]
  /\ responseClassForX = [w \in Worlds |-> "none"]
  /\ collectionReset = [w \in Worlds |-> FALSE]
  /\ guessedIdentityAccepted = FALSE

HiddenOrUnrelatedCommit(w) ==
  /\ asOf[w] < 2
  /\ asOf' = [asOf EXCEPT ![w] = @ + 1]
  /\ completeTo' = [completeTo EXCEPT ![w] = asOf'[w]]
  /\ UNCHANGED <<floor, authorizationDefinition, visibilityVersion,
       responseHasX, responseClassForX, collectionReset,
       guessedIdentityAccepted>>

AdvanceCollectionFloor(w) ==
  /\ floor[w] < asOf[w]
  /\ floor' = [floor EXCEPT ![w] = @ + 1]
  /\ UNCHANGED <<asOf, completeTo, authorizationDefinition,
       visibilityVersion, responseHasX, responseClassForX,
       collectionReset, guessedIdentityAccepted>>

ChangeAuthorizationProjection ==
  /\ authorizationDefinition = 0
  /\ authorizationDefinition' = 1
  /\ visibilityVersion' = 1
  /\ UNCHANGED <<asOf, completeTo, floor, responseHasX,
       responseClassForX, collectionReset, guessedIdentityAccepted>>

Classify(w) ==
  CASE w = "hidden" -> "inaccessible"
    [] w = "absent" -> "not_found"
    [] OTHER -> "evidence_expired"

SnapshotCollection ==
  /\ responseHasX' = [w \in Worlds |-> FALSE]
  /\ responseClassForX' =
       IF Mutation = "guessed_id_classification"
         THEN [w \in Worlds |-> Classify(w)]
         ELSE [w \in Worlds |-> "none"]
  /\ guessedIdentityAccepted' = (Mutation = "guessed_id_classification")
  /\ collectionReset' = [w \in Worlds |-> FALSE]
  /\ UNCHANGED <<asOf, completeTo, floor, authorizationDefinition,
       visibilityVersion>>

ChangesFrom(cursor) ==
  /\ cursor \in 0..2
  /\ collectionReset' = [w \in Worlds |-> cursor < floor[w]]
  /\ responseHasX' = [w \in Worlds |-> FALSE]
  /\ responseClassForX' = [w \in Worlds |-> "none"]
  /\ guessedIdentityAccepted' = FALSE
  /\ UNCHANGED <<asOf, completeTo, floor, authorizationDefinition,
       visibilityVersion>>

Next ==
  (\E w \in Worlds : HiddenOrUnrelatedCommit(w) \/ AdvanceCollectionFloor(w))
  \/ ChangeAuthorizationProjection \/ SnapshotCollection
  \/ \E cursor \in 0..2 : ChangesFrom(cursor)
Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ asOf \in [Worlds -> 0..2] /\ completeTo \in [Worlds -> 0..2]
  /\ floor \in [Worlds -> 0..2]
  /\ authorizationDefinition \in 0..1 /\ visibilityVersion \in 0..1
  /\ responseHasX \in [Worlds -> BOOLEAN]
  /\ responseClassForX \in [Worlds -> ObjectClasses]
  /\ collectionReset \in [Worlds -> BOOLEAN]
  /\ guessedIdentityAccepted \in BOOLEAN

CompleteToMayDifferButNeverLeadsAsOf ==
  \A w \in Worlds : completeTo[w] <= asOf[w]
FloorMayDifferButNeverLeadsAsOf == \A w \in Worlds : floor[w] <= asOf[w]
VisibilityChangesOnlyWithProjectionDefinition ==
  visibilityVersion = authorizationDefinition
NoGuessedIdentityAPI == ~guessedIdentityAccepted
NoPerGuessedIdentityEntry == \A w \in Worlds : ~responseHasX[w]
PerGuessedIdentityObservationEqual ==
  Cardinality({responseClassForX[w] : w \in Worlds}) = 1
CollectionMetadataIsNotCompared == TRUE
=============================================================================
