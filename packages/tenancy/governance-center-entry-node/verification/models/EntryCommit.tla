--------------------------- MODULE EntryCommit ---------------------------
EXTENDS TLC
CONSTANTS SwallowClockFailure, NotifyEarly
VARIABLES pc, stagedBusiness, stagedActivity, finalClockRead,
          committedBusiness, committedActivity, commitKnown, notified, reply
vars == <<pc, stagedBusiness, stagedActivity, finalClockRead,
          committedBusiness, committedActivity, commitKnown, notified, reply>>

Init == /\ pc = "business"
        /\ stagedBusiness = FALSE /\ stagedActivity = FALSE
        /\ finalClockRead = FALSE
        /\ committedBusiness = FALSE /\ committedActivity = FALSE
        /\ commitKnown = FALSE /\ notified = FALSE /\ reply = "none"

StageBusiness ==
    /\ pc = "business"
    /\ stagedBusiness' = TRUE /\ pc' = "finalize"
    /\ notified' = NotifyEarly
    /\ UNCHANGED <<stagedActivity, finalClockRead, committedBusiness,
                    committedActivity, commitKnown, reply>>

Finalize ==
    /\ pc = "finalize"
    /\ \/ /\ finalClockRead' = TRUE
          /\ stagedActivity' \in BOOLEAN  \* still valid: touch; already invalid: no revival
          /\ pc' = "commit" /\ UNCHANGED stagedBusiness
       \/ /\ finalClockRead' = FALSE /\ stagedActivity' = FALSE
          /\ pc' = IF SwallowClockFailure THEN "commit" ELSE "rolledBack"
          /\ stagedBusiness' = IF SwallowClockFailure THEN stagedBusiness ELSE FALSE
    /\ UNCHANGED <<committedBusiness, committedActivity, commitKnown, notified, reply>>

Commit ==
    /\ pc = "commit"
    /\ \/ /\ committedBusiness' = stagedBusiness
          /\ committedActivity' = stagedActivity
          /\ commitKnown' = TRUE /\ pc' = "publish"
       \/ /\ committedBusiness' = FALSE /\ committedActivity' = FALSE
          /\ commitKnown' = FALSE /\ pc' = "rolledBack"
       \/ /\ committedBusiness' = stagedBusiness
          /\ committedActivity' = stagedActivity
          /\ commitKnown' = FALSE /\ pc' = "unknown"
    /\ UNCHANGED <<stagedBusiness, stagedActivity, finalClockRead, notified, reply>>

Publish ==
    /\ pc = "publish" /\ notified' = TRUE /\ reply' = "success" /\ pc' = "done"
    /\ UNCHANGED <<stagedBusiness, stagedActivity, finalClockRead,
                    committedBusiness, committedActivity, commitKnown>>

Unavailable ==
    /\ pc \in {"rolledBack", "unknown"} /\ pc' = "done" /\ reply' = "unavailable"
    /\ UNCHANGED <<stagedBusiness, stagedActivity, finalClockRead,
                    committedBusiness, committedActivity, commitKnown, notified>>
Next == StageBusiness \/ Finalize \/ Commit \/ Publish \/ Unavailable
Spec == Init /\ [][Next]_vars
TypeOK == /\ pc \in {"business", "finalize", "commit", "publish", "rolledBack", "unknown", "done"}
          /\ \A x \in {stagedBusiness, stagedActivity, finalClockRead,
                       committedBusiness, committedActivity, commitKnown, notified}: x \in BOOLEAN
          /\ reply \in {"none", "success", "unavailable"}
NoCommitWithoutFinalTime == committedBusiness => finalClockRead
ActivityWithBusiness == committedActivity => committedBusiness
NotificationAfterKnownCommit == notified => (commitKnown /\ committedBusiness)
SuccessAfterKnownCommit == reply = "success" => (commitKnown /\ committedBusiness)
(* Unavailable intentionally does NOT imply that no business was committed. *)
=============================================================================
