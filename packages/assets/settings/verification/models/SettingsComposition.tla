---------------------- MODULE SettingsComposition ----------------------
EXTENDS Naturals, Integers, TLC
CONSTANT Mutation
VARIABLES changes, epoch, live, declared, permitted, online, phase, editBasis,
          committed, commitValid, assignment, sourceRevision, outbox,
          reads, published, publicationValid, callInput, originalInput
vars == <<changes, epoch, live, declared, permitted, online, phase, editBasis,
          committed, commitValid, assignment, sourceRevision, outbox,
          reads, published, publicationValid, callInput, originalInput>>
Init ==
  /\ changes = 0 /\ epoch = 0 /\ live = TRUE /\ declared = TRUE /\ permitted = TRUE
  /\ online = TRUE /\ phase = "idle" /\ editBasis = -1
  /\ committed = FALSE /\ commitValid = TRUE /\ assignment = 0
  /\ sourceRevision = 0 /\ outbox = FALSE
  /\ reads = [i \in 1..2 |-> -1]
  /\ published = -1 /\ publicationValid = TRUE
  /\ callInput = -1 /\ originalInput = -1
ChangeBasis ==
  /\ changes < 2
  /\ changes' = changes + 1
  /\ epoch' = epoch + 1
  /\ \/ /\ live' = ~live /\ UNCHANGED <<declared, permitted>>
     \/ /\ declared' = ~declared /\ UNCHANGED <<live, permitted>>
     \/ /\ permitted' = ~permitted /\ UNCHANGED <<live, declared>>
  /\ UNCHANGED <<online, phase, editBasis, committed, commitValid,
       assignment, sourceRevision, outbox, reads, published,
       publicationValid, callInput, originalInput>>
Prepare ==
  /\ phase = "idle" /\ live /\ declared /\ permitted /\ online
  /\ phase' = "prepared" /\ editBasis' = epoch
  /\ UNCHANGED <<changes, epoch, live, declared, permitted, online,
       committed, commitValid, assignment, sourceRevision, outbox,
       reads, published, publicationValid, callInput, originalInput>>
CurrentGuard == live /\ declared /\ permitted /\ editBasis = epoch
Commit ==
  /\ phase = "prepared" /\ online
  /\ (Mutation = "stale_commit" \/ CurrentGuard)
  /\ phase' = "done" /\ committed' = TRUE /\ commitValid' = CurrentGuard
  /\ assignment' = 1 /\ sourceRevision' = 1
  /\ epoch' = IF Mutation = "unversioned_commit" THEN epoch ELSE epoch + 1
  /\ outbox' = (Mutation # "missing_outbox")
  /\ UNCHANGED <<changes, live, declared, permitted, online, editBasis,
       reads, published, publicationValid, callInput, originalInput>>
Unload ==
  /\ online /\ online' = FALSE
  /\ assignment' = IF Mutation = "erase_on_unload" THEN 0 ELSE assignment
  /\ UNCHANGED <<changes, epoch, live, declared, permitted, phase, editBasis,
       committed, commitValid, sourceRevision, outbox, reads,
       published, publicationValid, callInput, originalInput>>
Capture(i) ==
  /\ reads[i] = -1 /\ online
  /\ reads' = [reads EXCEPT ![i] = epoch]
  /\ UNCHANGED <<changes, epoch, live, declared, permitted, online, phase,
       editBasis, committed, commitValid, assignment, sourceRevision,
       outbox, published, publicationValid, callInput, originalInput>>
Publish(i) ==
  /\ reads[i] >= 0 /\ online
  /\ (Mutation = "stale_publish" \/
        (reads[i] = epoch /\ reads[i] >= published))
  /\ publicationValid' = (reads[i] = epoch /\ reads[i] >= published)
  /\ published' = reads[i]
  /\ callInput' = IF Mutation = "rewrite_call" /\ callInput >= 0
                    THEN reads[i] ELSE callInput
  /\ UNCHANGED <<changes, epoch, live, declared, permitted, online, phase,
       editBasis, committed, commitValid, assignment, sourceRevision,
       outbox, reads, originalInput>>
CaptureCall ==
  /\ published >= 0 /\ callInput = -1
  /\ callInput' = published /\ originalInput' = published
  /\ UNCHANGED <<changes, epoch, live, declared, permitted, online, phase,
       editBasis, committed, commitValid, assignment, sourceRevision,
       outbox, reads, published, publicationValid>>
Next == ChangeBasis \/ Prepare \/ Commit \/ Unload \/ CaptureCall
        \/ (\E i \in 1..2 : Capture(i) \/ Publish(i))
Spec == Init /\ [][Next]_vars
TypeOK ==
  /\ changes \in 0..2 /\ epoch \in 0..3 /\ editBasis \in -1..3
  /\ live \in BOOLEAN /\ declared \in BOOLEAN /\ permitted \in BOOLEAN
  /\ online \in BOOLEAN /\ phase \in {"idle", "prepared", "done"}
  /\ committed \in BOOLEAN /\ commitValid \in BOOLEAN
  /\ assignment \in 0..1 /\ sourceRevision \in 0..1 /\ outbox \in BOOLEAN
  /\ reads \in [1..2 -> -1..3] /\ published \in -1..3
  /\ publicationValid \in BOOLEAN
  /\ callInput \in -1..3 /\ originalInput \in -1..3
BasisTracksSources == epoch = changes + sourceRevision
GuardedCommit == committed => commitValid
FreshPublication == publicationValid
FrozenInput == callInput = originalInput
RecoverableCommit == committed => sourceRevision = 1 /\ outbox
UnloadPreservesValue == committed => assignment = 1
=============================================================================
