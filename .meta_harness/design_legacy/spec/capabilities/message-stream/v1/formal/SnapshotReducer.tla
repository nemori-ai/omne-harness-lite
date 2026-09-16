--------------------------- MODULE SnapshotReducer -------------------------
EXTENDS Naturals, FiniteSets, TLC

(***************************************************************************
 MS-07/08/10/11/12, SE-10. A fixed three-batch history retains the relevant
 races: A closing (state-only), B closing (hidden at version 0/2), A terminal
 with body. Snapshot response capture, body read, atomic CAS and rejection are
 separate actions. Inputs with resync:none/full are separate initial states.
 Accepted is an immutable witness of the LAST SUCCESSFUL snapshot install;
 capture/reject/failure never manufacture an installation witness.
 ************************************************************************ **)
CONSTANTS Mutation, StopAt
ASSUME StopAt \in 0..3
ASSUME Mutation \in {"none", "absence_to_unknown", "absence_to_abandoned",
  "omit_closing_update", "stale_snapshot_install", "changes_before_snapshot",
  "stale_token_install", "stale_visibility_install", "snapshot_skip_body",
  "snapshot_nonatomic", "duplicate_semantic_close", "snapshot_zero_blocked"}

Attempts == {"A", "B"}
LocalDrafts == {"draft", "closing", "evidence_unavailable"}
ClientStates == {"none", "draft", "closing", "evidence_unavailable",
                 "closed_message", "closed_unknown", "closed_abandoned"}
Authorized(a, v) == a = "A" \/ v = 1
StateAt(p, a) ==
  IF a = "A" THEN
    IF p = 3 THEN "terminal_message" ELSE IF p >= 1 THEN "closing" ELSE "absent"
  ELSE IF p >= 2 THEN "closing" ELSE "absent"
ViewAt(p, v, a) == IF Authorized(a, v) THEN StateAt(p, a) ELSE "absent"
RevisionAt(p) == [a \in Attempts |-> IF a = "A" /\ p = 3 THEN 1 ELSE 0]
Rendered(k) == CASE k = "closing" -> "closing"
                   [] k = "terminal_message" -> "closed_message"
                   [] OTHER -> "none"
EmptyRevisions == [a \in Attempts |-> 0]

VARIABLES committed, completeTo, visibility, replacementToken,
          replacementUsed, failureUsed, resyncRequired, snap,
          cursor, clientVisibility, states, revisions, historyAt, statesAt,
          closeLedger, closeEffects, accepted, invalidChangesInstall,
          failedAt, retryPending, retryFrom
vars == <<committed, completeTo, visibility, replacementToken,
          replacementUsed, failureUsed, resyncRequired, snap,
          cursor, clientVisibility, states, revisions, historyAt, statesAt,
          closeLedger, closeEffects, accepted, invalidChangesInstall,
          failedAt, retryPending, retryFrom>>

Init ==
  /\ committed = 0 /\ completeTo = 0 /\ visibility = 0
  /\ replacementToken = 0 /\ replacementUsed = FALSE /\ failureUsed = FALSE
  /\ resyncRequired \in BOOLEAN
  /\ snap = [phase |-> "idle", asOf |-> 0, visibility |-> 0, token |-> 0]
  /\ cursor = 0 /\ clientVisibility = 0
  /\ states = [a \in Attempts |-> IF a = "A" THEN "draft" ELSE "none"]
  /\ revisions = EmptyRevisions /\ historyAt = 0 /\ statesAt = 0
  /\ closeLedger = {} /\ closeEffects = EmptyRevisions
  /\ accepted = [seen |-> FALSE, token |-> 0, currentToken |-> 0,
       visibility |-> 0, currentVisibility |-> 0, asOf |-> 0,
       beforeCursor |-> 0, bodyReady |-> FALSE, absentDrafts |-> {},
       states |-> states, revisions |-> revisions, historyAt |-> 0, statesAt |-> 0]
  /\ invalidChangesInstall = FALSE
  /\ failedAt = 0 /\ retryPending = FALSE /\ retryFrom = 0

CommitNext ==
  /\ committed < StopAt /\ committed' = committed + 1
  /\ UNCHANGED <<completeTo, visibility, replacementToken, replacementUsed,
       failureUsed, resyncRequired, snap, cursor, clientVisibility, states,
       revisions, historyAt, statesAt, closeLedger, closeEffects, accepted,
       invalidChangesInstall, failedAt, retryPending, retryFrom>>

ProjectNextBatch ==
  /\ completeTo < committed /\ completeTo' = completeTo + 1
  /\ UNCHANGED <<committed, visibility, replacementToken, replacementUsed,
       failureUsed, resyncRequired, snap, cursor, clientVisibility, states,
       revisions, historyAt, statesAt, closeLedger, closeEffects, accepted,
       invalidChangesInstall, failedAt, retryPending, retryFrom>>

RotateAuthorization ==
  /\ visibility < 2 /\ visibility' = visibility + 1
  /\ resyncRequired' = TRUE
  /\ UNCHANGED <<committed, completeTo, replacementToken, replacementUsed,
       failureUsed, snap, cursor, clientVisibility, states, revisions,
       historyAt, statesAt, closeLedger, closeEffects, accepted,
       invalidChangesInstall, failedAt, retryPending, retryFrom>>

RequestReplacement ==
  /\ ~replacementUsed /\ replacementUsed' = TRUE
  /\ replacementToken' = replacementToken + 1 /\ resyncRequired' = TRUE
  /\ UNCHANGED <<committed, completeTo, visibility, failureUsed, snap,
       cursor, clientVisibility, states, revisions, historyAt, statesAt,
       closeLedger, closeEffects, accepted, invalidChangesInstall,
       failedAt, retryPending, retryFrom>>

CaptureSnapshot ==
  /\ snap.phase = "idle"
  /\ (Mutation # "snapshot_zero_blocked" \/ completeTo > 0)
  /\ snap' = [phase |-> "captured", asOf |-> completeTo,
               visibility |-> visibility, token |-> replacementToken]
  /\ retryFrom' = IF retryPending THEN cursor ELSE retryFrom
  /\ retryPending' = FALSE
  /\ UNCHANGED <<committed, completeTo, visibility, replacementToken,
       replacementUsed, failureUsed, resyncRequired, cursor, clientVisibility,
       states, revisions, historyAt, statesAt, closeLedger, closeEffects,
       accepted, invalidChangesInstall, failedAt>>

ReadSnapshotBody ==
  /\ snap.phase = "captured" /\ snap' = [snap EXCEPT !.phase = "ready"]
  /\ UNCHANGED <<committed, completeTo, visibility, replacementToken,
       replacementUsed, failureUsed, resyncRequired, cursor, clientVisibility,
       states, revisions, historyAt, statesAt, closeLedger, closeEffects,
       accepted, invalidChangesInstall, failedAt, retryPending, retryFrom>>

FailSnapshotBodyRead ==
  /\ snap.phase = "captured" /\ snap.asOf = 3 /\ ~failureUsed
  /\ snap' = [snap EXCEPT !.phase = "failed"] /\ failureUsed' = TRUE
  /\ failedAt' = cursor /\ resyncRequired' = TRUE
  /\ UNCHANGED <<committed, completeTo, visibility, replacementToken,
       replacementUsed, cursor, clientVisibility, states, revisions, historyAt,
       statesAt, closeLedger, closeEffects, accepted, invalidChangesInstall,
       retryPending, retryFrom>>

ReopenAfterReadFailure ==
  /\ snap.phase = "failed" /\ snap' = [snap EXCEPT !.phase = "idle"]
  /\ replacementToken' = replacementToken + 1 /\ resyncRequired' = TRUE
  /\ retryPending' = TRUE
  /\ UNCHANGED <<committed, completeTo, visibility, replacementUsed,
       failureUsed, cursor, clientVisibility, states, revisions, historyAt,
       statesAt, closeLedger, closeEffects, accepted, invalidChangesInstall,
       failedAt, retryFrom>>

InstallChangesBatch ==
  /\ cursor < completeTo /\ clientVisibility = visibility
  /\ (~resyncRequired \/ Mutation = "changes_before_snapshot")
  /\ LET p == cursor + 1
         a == IF p = 2 THEN "B" ELSE "A"
         hidden == ~Authorized(a, visibility)
         omitted == Mutation = "omit_closing_update" /\ p < 3 /\ ~hidden
     IN /\ cursor' = p /\ historyAt' = p
        /\ statesAt' = IF omitted THEN statesAt ELSE p
        /\ states' = IF hidden \/ omitted THEN states
                      ELSE [states EXCEPT ![a] = Rendered(StateAt(p, a))]
        /\ revisions' = IF p = 3 THEN RevisionAt(p) ELSE revisions
        /\ closeLedger' = IF p = 3 THEN closeLedger \cup {"A"} ELSE closeLedger
        /\ closeEffects' = IF p = 3 /\ "A" \notin closeLedger
                             THEN [closeEffects EXCEPT !["A"] = @ + 1]
                             ELSE closeEffects
  /\ invalidChangesInstall' = (invalidChangesInstall \/ resyncRequired)
  /\ UNCHANGED <<committed, completeTo, visibility, replacementToken,
       replacementUsed, failureUsed, resyncRequired, snap, clientVisibility,
       accepted, failedAt, retryPending, retryFrom>>

SnapshotState(a) ==
  LET k == ViewAt(snap.asOf, snap.visibility, a)
  IN IF k # "absent" THEN Rendered(k)
     ELSE CASE Mutation = "absence_to_unknown" -> "closed_unknown"
            [] Mutation = "absence_to_abandoned" -> "closed_abandoned"
            [] states[a] \in LocalDrafts -> "evidence_unavailable"
            [] OTHER -> "none"

InstallSnapshotCAS ==
  /\ (snap.phase = "ready" \/
       (Mutation = "snapshot_skip_body" /\ snap.phase = "captured"))
  /\ (snap.token = replacementToken \/ Mutation = "stale_token_install")
  /\ (snap.visibility = visibility \/ Mutation = "stale_visibility_install")
  /\ (snap.asOf >= cursor \/ Mutation = "stale_snapshot_install")
  /\ cursor' = snap.asOf /\ clientVisibility' = snap.visibility
  /\ states' = [a \in Attempts |-> SnapshotState(a)]
  /\ revisions' = RevisionAt(snap.asOf)
  /\ historyAt' = IF Mutation = "snapshot_nonatomic" THEN historyAt ELSE snap.asOf
  /\ statesAt' = snap.asOf
  /\ closeLedger' = IF snap.asOf = 3 THEN closeLedger \cup {"A"} ELSE closeLedger
  /\ closeEffects' = IF snap.asOf = 3 /\
       ("A" \notin closeLedger \/ Mutation = "duplicate_semantic_close")
       THEN [closeEffects EXCEPT !["A"] = @ + 1] ELSE closeEffects
  /\ accepted' = [seen |-> TRUE, token |-> snap.token,
       currentToken |-> replacementToken, visibility |-> snap.visibility,
       currentVisibility |-> visibility, asOf |-> snap.asOf, beforeCursor |-> cursor,
       bodyReady |-> snap.phase = "ready",
       absentDrafts |-> {a \in Attempts : ViewAt(snap.asOf, snap.visibility, a) = "absent"
                                          /\ states[a] \in LocalDrafts},
       states |-> states', revisions |-> revisions', historyAt |-> historyAt', statesAt |-> statesAt']
  /\ snap' = [snap EXCEPT !.phase = "idle"] /\ resyncRequired' = FALSE
  /\ UNCHANGED <<committed, completeTo, visibility, replacementToken,
       replacementUsed, failureUsed, invalidChangesInstall,
       failedAt, retryPending, retryFrom>>

RejectStaleSnapshot ==
  /\ snap.phase \in {"captured", "ready"}
  /\ (snap.token # replacementToken \/ snap.visibility # visibility \/ snap.asOf < cursor)
  /\ snap' = [snap EXCEPT !.phase = "idle"]
  /\ UNCHANGED <<committed, completeTo, visibility, replacementToken,
       replacementUsed, failureUsed, resyncRequired, cursor, clientVisibility,
       states, revisions, historyAt, statesAt, closeLedger, closeEffects,
       accepted, invalidChangesInstall, failedAt, retryPending, retryFrom>>

Next == CommitNext \/ ProjectNextBatch \/ RotateAuthorization \/ RequestReplacement
  \/ CaptureSnapshot \/ ReadSnapshotBody \/ FailSnapshotBodyRead
  \/ ReopenAfterReadFailure \/ InstallChangesBatch \/ InstallSnapshotCAS \/ RejectStaleSnapshot
Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ committed \in 0..StopAt /\ completeTo \in 0..StopAt
  /\ visibility \in 0..2 /\ replacementToken \in 0..2
  /\ replacementUsed \in BOOLEAN /\ failureUsed \in BOOLEAN /\ resyncRequired \in BOOLEAN
  /\ snap \in [phase : {"idle", "captured", "ready", "failed"},
               asOf : 0..StopAt, visibility : 0..2, token : 0..2]
  /\ cursor \in 0..StopAt /\ clientVisibility \in 0..2
  /\ states \in [Attempts -> ClientStates] /\ revisions \in [Attempts -> 0..1]
  /\ historyAt \in 0..StopAt /\ statesAt \in 0..StopAt
  /\ closeLedger \subseteq Attempts /\ closeEffects \in [Attempts -> 0..2]
  /\ accepted \in [seen : BOOLEAN, token : 0..2, currentToken : 0..2,
       visibility : 0..2, currentVisibility : 0..2, asOf : 0..StopAt,
       beforeCursor : 0..StopAt, bodyReady : BOOLEAN, absentDrafts : SUBSET Attempts,
       states : [Attempts -> ClientStates], revisions : [Attempts -> 0..1],
       historyAt : 0..StopAt, statesAt : 0..StopAt]
  /\ invalidChangesInstall \in BOOLEAN
  /\ failedAt \in 0..StopAt /\ retryPending \in BOOLEAN /\ retryFrom \in 0..StopAt

ProjectedImpliesCommitted == completeTo <= committed
InstalledImpliesProjected == cursor <= completeTo
CursorRequiresAtomicHistoryAndStateInstall == cursor = historyAt /\ cursor = statesAt
InvalidCursorNeverInstallsChanges == ~invalidChangesInstall
SnapshotTokenInstallCurrent == accepted.seen => accepted.token = accepted.currentToken
SnapshotVisibilityInstallCurrent == accepted.seen => accepted.visibility = accepted.currentVisibility
SnapshotAsOfNeverRegresses == accepted.seen => accepted.asOf >= accepted.beforeCursor
SnapshotBodyReadBeforeInstall == accepted.seen /\ accepted.asOf = 3 => accepted.bodyReady
SnapshotAtomicReplacement == accepted.seen =>
  /\ accepted.historyAt = accepted.asOf /\ accepted.statesAt = accepted.asOf
  /\ accepted.revisions = RevisionAt(accepted.asOf)
  /\ \A a \in Attempts : ViewAt(accepted.asOf, accepted.visibility, a) # "absent" =>
       accepted.states[a] = Rendered(ViewAt(accepted.asOf, accepted.visibility, a))
SnapshotAbsenceIsOnlyLocalEvidenceUnavailable == accepted.seen =>
  /\ \A a \in accepted.absentDrafts : accepted.states[a] = "evidence_unavailable"
  /\ \A a \in Attempts : ViewAt(accepted.asOf, accepted.visibility, a) = "absent" =>
       accepted.states[a] \in {"none", "evidence_unavailable"}
ClosingUpdateDeliveredWithoutRevision ==
  cursor = 1 => states["A"] = "closing" /\ revisions["A"] = 0
OnlyDurableTerminalCloses ==
  /\ closeEffects["A"] > 0 => committed = 3
  /\ closeEffects["B"] = 0
AtMostOnceSemanticClose == \A a \in Attempts : closeEffects[a] <= 1
NoCloseBookkeepingRegression == closeLedger = {a \in Attempts : closeEffects[a] > 0}
HiddenOnlyBatchAdvancesWithoutObjectPlaceholder ==
  cursor = 2 /\ clientVisibility \in {0, 2} => states["B"] \in {"none", "evidence_unavailable"}
FailureKeepsLastCompleteCursor == snap.phase = "failed" \/ retryPending => cursor = failedAt
RetryStartsAtLastCompleteCursor == failureUsed /\ ~retryPending /\ snap.phase # "failed" => retryFrom = failedAt
CursorNeverRegresses == [][cursor' >= cursor]_cursor
CloseEffectsNeverRegress == [][\A a \in Attempts : closeEffects'[a] >= closeEffects[a]]_closeEffects
RevisionNeverRegresses == [][\A a \in Attempts : revisions'[a] >= revisions[a]]_revisions

SpecFair == Spec
  /\ WF_vars(CommitNext) /\ WF_vars(ProjectNextBatch)
  /\ WF_vars(CaptureSnapshot) /\ WF_vars(ReadSnapshotBody)
  /\ WF_vars(ReopenAfterReadFailure) /\ WF_vars(RejectStaleSnapshot)
  /\ WF_vars(InstallSnapshotCAS) /\ WF_vars(InstallChangesBatch)
EventuallyCurrent == <>[](cursor = StopAt /\ ~resyncRequired /\ clientVisibility = visibility)
=============================================================================
