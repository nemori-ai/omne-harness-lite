---- MODULE PermissionCurrent ----
EXTENDS Naturals
CONSTANTS MaxRevision, Bug
ASSUME Bug \in {"none", "stale-capture", "clear-without-revision", "restart-resets-value"}
VARIABLES revision, value, committed, hasRead, observed, answer, captured, atCapture, restarts
vars == <<revision, value, committed, hasRead, observed, answer, captured, atCapture, restarts>>
Values == {"absent", "allow", "deny"}
Point(r, v) == [revision |-> r, value |-> v]
Init ==
  /\ revision = 0 /\ value = "absent" /\ committed = "absent"
  /\ hasRead = FALSE /\ observed = Point(0, "absent")
  /\ answer = "none" /\ captured = Point(0, "absent") /\ atCapture = Point(0, "absent")
  /\ restarts = 0

Write(v) ==
  /\ revision < MaxRevision
  /\ value' = v /\ committed' = v
  /\ revision' = IF Bug = "clear-without-revision" /\ v = "absent" THEN revision ELSE revision + 1
  /\ UNCHANGED <<hasRead, observed, answer, captured, atCapture, restarts>>

Read ==
  /\ hasRead' = TRUE /\ observed' = Point(revision, value)
  /\ answer' = "none"
  /\ UNCHANGED <<revision, value, committed, captured, atCapture, restarts>>

Capture ==
  /\ hasRead
  /\ hasRead' = FALSE
  /\ atCapture' = Point(revision, value)
  /\ IF observed.revision = revision \/ Bug = "stale-capture"
        THEN /\ answer' = "current" /\ captured' = observed
        ELSE /\ answer' = "changed" /\ UNCHANGED captured
  /\ UNCHANGED <<revision, value, committed, observed, restarts>>

Restart ==
  /\ restarts < 1 /\ restarts' = restarts + 1
  /\ hasRead' = FALSE
  /\ value' = IF Bug = "restart-resets-value" THEN "absent" ELSE value
  /\ UNCHANGED <<revision, committed, observed, answer, captured, atCapture>>

Next == (\E v \in Values : Write(v)) \/ Read \/ Capture \/ Restart
Spec == Init /\ [][Next]_vars
TypeOK ==
  /\ revision \in 0..MaxRevision /\ value \in Values /\ committed \in Values
  /\ hasRead \in BOOLEAN /\ restarts \in 0..1
  /\ answer \in {"none", "changed", "current"}
  /\ observed \in [revision : 0..MaxRevision, value : Values]
  /\ captured \in [revision : 0..MaxRevision, value : Values]
  /\ atCapture \in [revision : 0..MaxRevision, value : Values]
CapturedMatchesCommit == answer = "current" => captured = atCapture
DurableValue == value = committed
====
