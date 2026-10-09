---------------------------- MODULE LoginCommit ----------------------------
EXTENDS Naturals, TLC
CONSTANTS Idle, Absolute, MaxTime, ProtectObservers
VARIABLES now, lastSuccess, pending, phase, observedExpired, effects, pendingEffect
vars == <<now, lastSuccess, pending, phase, observedExpired, effects, pendingEffect>>
Valid(t, last) == t < Absolute /\ t < last + Idle
Init == /\ now = 0 /\ lastSuccess = 0 /\ pending = 0 /\ phase = "idle"
        /\ observedExpired = FALSE /\ effects = 0 /\ pendingEffect = 0
Tick == /\ now < MaxTime /\ now' = now + 1
        /\ UNCHANGED <<lastSuccess, pending, phase, observedExpired, effects, pendingEffect>>
Admit == /\ phase = "idle" /\ Valid(now, lastSuccess) /\ phase' = "running"
         /\ UNCHANGED <<now, lastSuccess, pending, observedExpired, effects, pendingEffect>>
\* Stage abstracts acquiring the common lock, reading final trusted time and staging
\* both effect and activity. That lock stays owned through commit/rollback.
Stage(ok) == /\ phase = "running" /\ phase' = "staged"
             /\ pending' = IF ok /\ Valid(now, lastSuccess) THEN now ELSE lastSuccess
             /\ pendingEffect' = IF ok THEN 1 ELSE effects
             /\ UNCHANGED <<now, lastSuccess, observedExpired, effects>>
Commit == /\ phase = "staged" /\ phase' = "idle"
          /\ lastSuccess' = pending /\ effects' = pendingEffect
          /\ UNCHANGED <<now, pending, observedExpired, pendingEffect>>
Rollback == /\ phase # "idle" /\ phase' = "idle"
            /\ UNCHANGED <<now, lastSuccess, pending, observedExpired, effects, pendingEffect>>
\* Covers verify/list/admission observations. The mutant bypasses their shared lock.
Observe == /\ (~ProtectObservers \/ phase # "staged")
           /\ observedExpired' = (observedExpired \/ ~Valid(now, lastSuccess))
           /\ UNCHANGED <<now, lastSuccess, pending, phase, effects, pendingEffect>>
Next == Tick \/ Admit \/ Stage(TRUE) \/ Stage(FALSE) \/ Commit \/ Rollback \/ Observe
TypeOK == /\ now \in 0..MaxTime /\ lastSuccess \in 0..MaxTime
          /\ pending \in 0..MaxTime /\ phase \in {"idle", "running", "staged"}
          /\ observedExpired \in BOOLEAN /\ effects \in 0..1 /\ pendingEffect \in 0..1
NoObservedRevival == observedExpired => ~Valid(now, lastSuccess)
AbsoluteBound == now >= Absolute => ~Valid(now, lastSuccess)
=============================================================================
