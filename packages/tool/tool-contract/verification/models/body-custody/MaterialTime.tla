----------------------------- MODULE MaterialTime -----------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Bug
Samples == 0..3
BodyDeadline == 2
VARIABLES watermark, observed, expired, everExpired, leaseDeadline, leaseClosed,
          grants, completed
vars == <<watermark, observed, expired, everExpired, leaseDeadline, leaseClosed,
          grants, completed>>
Init ==
  /\ watermark = 0 /\ observed = {0} /\ expired = FALSE /\ everExpired = FALSE
  /\ leaseDeadline = 0 /\ leaseClosed = FALSE /\ grants = {} /\ completed = {}

Observe(t) ==
  /\ (t >= watermark \/ Bug = "rollback")
  /\ watermark' = t /\ observed' = observed \cup {t}
  /\ expired' = (expired \/ t >= BodyDeadline)
  /\ everExpired' = (everExpired \/ t >= BodyDeadline)
  /\ UNCHANGED <<leaseDeadline, leaseClosed, grants, completed>>

Admit(t) ==
  /\ ~expired /\ t < BodyDeadline /\ t >= watermark /\ leaseDeadline = 0
  /\ watermark' = IF Bug = "missing-watermark" THEN watermark ELSE t
  /\ observed' = observed \cup {t}
  /\ leaseDeadline' = t + 2 /\ grants' = grants \cup {t}
  /\ UNCHANGED <<expired, everExpired, leaseClosed, completed>>

Finish(t) ==
  /\ leaseDeadline # 0 /\ ~leaseClosed /\ t >= watermark
  /\ (t < leaseDeadline \/ Bug = "late-page")
  /\ watermark' = t /\ observed' = observed \cup {t}
  /\ completed' = completed \cup {<<t, leaseDeadline>>}
  /\ leaseClosed' = TRUE
  /\ UNCHANGED <<expired, everExpired, leaseDeadline, grants>>

CloseLease(t) ==
  /\ leaseDeadline # 0 /\ t >= leaseDeadline /\ t >= watermark
  /\ watermark' = t /\ observed' = observed \cup {t} /\ leaseClosed' = TRUE
  /\ UNCHANGED <<expired, everExpired, leaseDeadline, grants, completed>>

Revive ==
  /\ Bug = "revive" /\ expired /\ expired' = FALSE
  /\ UNCHANGED <<watermark, observed, everExpired, leaseDeadline, leaseClosed,
                 grants, completed>>
RetryOrRestart == UNCHANGED vars
Next == \/ \E t \in Samples: Observe(t) \/ Admit(t) \/ Finish(t) \/ CloseLease(t)
        \/ Revive \/ RetryOrRestart
Spec == Init /\ [][Next]_vars
TypeOK ==
  /\ watermark \in Samples /\ observed \subseteq Samples
  /\ leaseDeadline \in 0..3 /\ grants \subseteq Samples
  /\ completed \subseteq Samples \X (1..3)
HighWatermarkSound == \A t \in observed: t <= watermark
ExpiredStable == everExpired => expired
NoLatePage == \A p \in completed: p[1] < p[2]
NoLateAdmission == \A t \in grants: t < BodyDeadline
=============================================================================
