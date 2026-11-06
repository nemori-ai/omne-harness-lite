-------------------------- MODULE AdvanceWait --------------------------
EXTENDS Naturals
CONSTANTS MaxRetries, Bugs
VARIABLES phase, stopped, retries, expired, falseElapsed, earlyRetry, operation
vars == <<phase, stopped, retries, expired, falseElapsed, earlyRetry, operation>>

Init == /\ phase = "sample" /\ stopped = FALSE /\ retries = 0
        /\ expired = FALSE /\ falseElapsed = FALSE /\ earlyRetry = FALSE
        /\ operation = "original"

Stop == /\ ~stopped /\ stopped' = TRUE
        /\ UNCHANGED <<phase, retries, expired, falseElapsed, earlyRetry, operation>>

Sample == /\ phase = "sample" /\ ~stopped
          /\ phase' = "waiting"
          /\ UNCHANGED <<stopped, retries, expired, falseElapsed, earlyRetry, operation>>

Cancel == /\ stopped /\ phase # "done" /\ "ignore-abort" \notin Bugs
          /\ phase' = "done"
          /\ UNCHANGED <<stopped, retries, expired, falseElapsed, earlyRetry, operation>>

Refuse == /\ phase \in {"sample", "waiting"}
          /\ phase' = "done"
          /\ UNCHANGED <<stopped, retries, expired, falseElapsed, earlyRetry, operation>>

Elapsed == /\ phase = "waiting"
           /\ phase' = IF stopped /\ "ignore-abort" \notin Bugs THEN "done" ELSE "check"
           /\ expired' = TRUE
           /\ falseElapsed' = (falseElapsed \/ (stopped /\ "ignore-abort" \in Bugs))
           /\ UNCHANGED <<stopped, retries, earlyRetry, operation>>

Retry == /\ phase = "check" \/ (phase = "sample" /\ "skip-wait" \in Bugs)
         /\ ~stopped /\ retries < MaxRetries
         /\ phase' = "sample" /\ retries' = retries + 1
         /\ earlyRetry' = (earlyRetry \/ ~expired)
         /\ expired' = FALSE
         /\ operation' = IF "new-operation" \in Bugs THEN "replacement" ELSE operation
         /\ UNCHANGED <<stopped, falseElapsed>>

Exhaust == /\ phase = "check" /\ retries = MaxRetries
           /\ phase' = "done"
           /\ UNCHANGED <<stopped, retries, expired, falseElapsed, earlyRetry, operation>>

Next == Stop \/ Sample \/ Cancel \/ Refuse \/ Elapsed \/ Retry \/ Exhaust
Spec == Init /\ [][Next]_vars /\ WF_vars(Cancel)

TypeOK == /\ phase \in {"sample", "waiting", "check", "done"}
          /\ stopped \in BOOLEAN /\ retries \in 0..MaxRetries
          /\ expired \in BOOLEAN /\ falseElapsed \in BOOLEAN /\ earlyRetry \in BOOLEAN
          /\ operation \in {"original", "replacement"}
NoFalseElapsed == ~falseElapsed
BackoffBeforeRetry == ~earlyRetry
OriginalOperation == operation = "original"
CancelProgress == stopped ~> (phase = "done")
=============================================================================
