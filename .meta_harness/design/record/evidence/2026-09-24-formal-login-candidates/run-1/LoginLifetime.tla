--------------------------- MODULE LoginLifetime ---------------------------
EXTENDS Naturals, TLC
CONSTANTS Idle, Absolute, MaxTime, BackfillAdmission
VARIABLES now, lastSuccess, phase, admittedAt, resultOK, expired, effects
vars == <<now, lastSuccess, phase, admittedAt, resultOK, expired, effects>>
ValidAt(t) == t < Absolute /\ t < lastSuccess + Idle
Init == /\ now = 0 /\ lastSuccess = 0 /\ phase = "idle"
        /\ admittedAt = 0 /\ resultOK = FALSE /\ expired = FALSE /\ effects = 0
Tick == /\ now < MaxTime
        /\ now' = now + 1
        /\ expired' = expired \/ ~ValidAt(now + 1)
        /\ UNCHANGED <<lastSuccess, phase, admittedAt, resultOK, effects>>
Admit == /\ phase = "idle" /\ ValidAt(now)
         /\ phase' = "running" /\ admittedAt' = now
         /\ UNCHANGED <<now, lastSuccess, resultOK, expired, effects>>
Result(ok) == /\ phase = "running" /\ phase' = "result"
              /\ resultOK' = ok
              /\ UNCHANGED <<now, lastSuccess, admittedAt, expired, effects>>
Finalize == /\ phase = "result" /\ phase' = "idle"
            /\ lastSuccess' = IF resultOK /\ (BackfillAdmission \/ ValidAt(now))
                              THEN IF BackfillAdmission THEN admittedAt ELSE now
                              ELSE lastSuccess
            /\ effects' = IF resultOK THEN 1 ELSE effects
            /\ UNCHANGED <<now, admittedAt, resultOK, expired>>
Crash == /\ phase # "idle" /\ phase' = "idle"
         /\ UNCHANGED <<now, lastSuccess, admittedAt, resultOK, expired, effects>>
Next == Tick \/ Admit \/ Result(TRUE) \/ Result(FALSE) \/ Finalize \/ Crash
TypeOK == /\ now \in 0..MaxTime /\ lastSuccess \in 0..MaxTime
          /\ phase \in {"idle", "running", "result"} /\ expired \in BOOLEAN
NoRevival == expired => ~ValidAt(now)
AbsoluteBound == now >= Absolute => ~ValidAt(now)
=============================================================================
