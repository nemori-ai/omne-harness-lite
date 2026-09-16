-------------------- MODULE JointProjectionRecovery --------------------
EXTENDS Naturals, TLC
CONSTANT Mutation
ASSUME Mutation \in {"none", "receipt_cursor", "stale_snapshot",
                     "stale_active", "reopen_terminal", "stale_asof"}
VARIABLE s
vars == <<s>>
Max(a,b) == IF a > b THEN a ELSE b
(* One authorized attempt, epoch 1. Three complete ledger batches:
   pending observation, durable unknown, accepted refinement with body.
   Visibility 2 hides the attempt; 3 restores access. *)
Revision(p) == IF p < 2 THEN 0 ELSE p - 1
Visible(v) == v # 2
Init == s = [committed |-> 0, projected |-> 0, cursor |-> 0,
  installed |-> 0, visibility |-> 1, installedVisibility |-> 1,
  token |-> 1, reset |-> FALSE, response |-> "none", at |-> 0,
  rv |-> 1, rt |-> 1, bodyReady |-> FALSE, revision |-> 0,
  closes |-> 0, draft |-> TRUE, unavailable |-> FALSE,
  historyBody |-> FALSE, pending |-> FALSE,
  source |-> 1, subscriber |-> 1, active |-> "none",
  ag |-> 1, av |-> 1, ast |-> 1, sourceLost |-> FALSE,
  ended |-> FALSE, invalidInstall |-> FALSE, invalidActive |-> FALSE,
  regressed |-> FALSE]
Publish == /\ s.committed < 3
           /\ s' = [s EXCEPT !.committed = @ + 1]
Project == /\ s.projected < s.committed
           /\ s' = [s EXCEPT !.projected = @ + 1]
VisibilityChange ==
  /\ s.visibility < 3
  /\ s' = [s EXCEPT !.visibility = @ + 1, !.token = @ + 1,
                    !.subscriber = @ + 1, !.reset = TRUE]
RotateSource ==
  /\ s.source = 1
  /\ s' = [s EXCEPT !.source = 2, !.subscriber = @ + 1]
LoseSource ==
  /\ ~s.sourceLost
  /\ s' = [s EXCEPT !.sourceLost = TRUE, !.subscriber = @ + 1]
EndedHint == /\ ~s.ended
             /\ s' = [s EXCEPT !.ended = TRUE]
Fetch ==
  /\ s.response = "none"
  /\ s.reset \/ s.cursor < s.projected
  /\ s' = [s EXCEPT !.response = IF s.reset THEN "snapshot" ELSE "changes",
                    !.at = s.projected, !.rv = s.visibility,
                    !.rt = s.token, !.bodyReady = FALSE,
                    !.cursor = IF Mutation = "receipt_cursor"
                               THEN s.projected ELSE @]
ReadBodies == /\ s.response # "none" /\ ~s.bodyReady
              /\ s' = [s EXCEPT !.bodyReady = TRUE]
(* An opportunistic full read need not block ordinary Changes. Keep that
   captured snapshot in flight while a newer complete Changes response installs. *)
FetchSnapshot ==
  /\ s.response = "none" /\ ~s.reset /\ s.cursor < s.projected
  /\ s' = [s EXCEPT !.response = "snapshot", !.at = s.projected,
                    !.rv = s.visibility, !.rt = s.token, !.bodyReady = FALSE]
ConcurrentChanges ==
  /\ s.response = "snapshot" /\ ~s.reset /\ s.cursor < s.projected
  /\ LET r == IF Visible(s.visibility) THEN Revision(s.projected) ELSE 0
         nextRevision == Max(s.revision, r)
     IN s' = [s EXCEPT !.cursor = s.projected, !.installed = s.projected,
       !.installedVisibility = s.visibility, !.revision = nextRevision,
       !.closes = IF s.revision = 0 /\ r > 0 THEN @ + 1 ELSE @,
       !.draft = IF nextRevision > 0 THEN FALSE ELSE @,
       !.unavailable = ~Visible(s.visibility),
       !.historyBody = Visible(s.visibility) /\ s.projected = 3,
       !.pending = Visible(s.visibility) /\ s.projected = 1]
Valid ==
  /\ s.rv = s.visibility
  /\ s.rt = s.token
  /\ s.at >= s.cursor
  /\ (s.response = "snapshot" \/ ~s.reset)
Install ==
  /\ s.response # "none" /\ s.bodyReady
  /\ Valid \/ (Mutation = "stale_snapshot" /\ s.response = "snapshot")
           \/ (Mutation = "stale_asof" /\ s.response = "snapshot"
               /\ s.rv = s.visibility /\ s.rt = s.token)
  /\ LET r == IF Visible(s.rv) THEN Revision(s.at) ELSE 0
         nextRevision == Max(s.revision, r)
     IN s' = [s EXCEPT
       !.cursor = s.at, !.installed = s.at,
       !.installedVisibility = s.rv,
       !.revision = nextRevision,
       !.closes = IF s.revision = 0 /\ r > 0 THEN @ + 1 ELSE @,
       !.draft = IF nextRevision > 0 THEN FALSE ELSE @,
       !.unavailable = ~Visible(s.rv),
       !.historyBody = Visible(s.rv) /\ s.at = 3,
       !.pending = Visible(s.rv) /\ s.at = 1,
       !.reset = FALSE, !.response = "none", !.bodyReady = FALSE,
       !.invalidInstall = @ \/ ~Valid,
       !.regressed = @ \/ s.at < s.cursor]
Reject ==
  /\ s.response # "none" /\ ~Valid
  /\ s' = [s EXCEPT !.response = "none", !.bodyReady = FALSE]
(* The active response abstracts a listener registered before compact capture.
   Its generation/visibility stamps persist while durable installs interleave. *)
CaptureActive ==
  /\ s.active = "none"
  /\ s' = [s EXCEPT !.active = "captured", !.ag = s.source,
                    !.av = s.visibility, !.ast = s.subscriber]
ActiveValid ==
  s.ag = s.source /\ s.av = s.visibility /\ s.ast = s.subscriber
ApplyActive ==
  /\ s.active = "captured"
  /\ ActiveValid \/ Mutation = "stale_active"
  /\ s' = [s EXCEPT !.active = "done",
       !.draft = IF Mutation = "reopen_terminal" THEN TRUE
                 ELSE IF s.revision > 0 THEN FALSE ELSE @,
       !.invalidActive = @ \/ ~ActiveValid]
RejectActive ==
  /\ s.active = "captured" /\ ~ActiveValid
  /\ s' = [s EXCEPT !.active = "done"]
Next == Publish \/ Project \/ VisibilityChange \/ RotateSource \/
        LoseSource \/ EndedHint \/ Fetch \/ ReadBodies \/ Install \/
        Reject \/ CaptureActive \/ ApplyActive \/ RejectActive \/
        FetchSnapshot \/ ConcurrentChanges
Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ WF_vars(Publish) /\ WF_vars(Project) /\
  WF_vars(Fetch) /\ WF_vars(ReadBodies) /\ WF_vars(Install) /\ WF_vars(Reject)
TypeOK ==
  /\ s.cursor \in 0..3 /\ s.installed \in 0..3
  /\ s.revision \in 0..2 /\ s.closes \in 0..1
  /\ s.source \in 1..2 /\ s.visibility \in 1..3
  /\ s.projected <= s.committed
AtomicCoverage == s.cursor = s.installed /\ s.cursor <= s.projected
SnapshotCAS == ~s.invalidInstall /\ ~s.regressed
ActiveGeneration == ~s.invalidActive
TerminalDominates == s.revision > 0 => ~s.draft
CloseExactlyOnce == s.closes = IF s.revision > 0 THEN 1 ELSE 0
ProjectedView ==
  /\ s.historyBody = (Visible(s.installedVisibility) /\ s.installed = 3)
  /\ s.pending = (Visible(s.installedVisibility) /\ s.installed = 1)
Converges == <>[](s.cursor = 3 /\ ~s.reset /\
                  s.installedVisibility = s.visibility)
=============================================================================
