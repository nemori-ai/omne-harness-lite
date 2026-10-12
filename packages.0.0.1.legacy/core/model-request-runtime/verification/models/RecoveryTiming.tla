-------------------------- MODULE RecoveryTiming --------------------------
EXTENDS Naturals
CONSTANTS SynthesizeTime, DropKnown, NullGrantsRetry, RecoverySends
VARIABLES phase, anchored, sends, knownSent, opened, intent,
          responseSent, responseFirst, retryAllowed, beforeRecovery
vars == <<phase, anchored, sends, knownSent, opened, intent,
          responseSent, responseFirst, retryAllowed, beforeRecovery>>
\* 0 is the abstract null/absent value. 1 is the anchor time,
\* 2 actual send, 3 durable opened, 4 recovery confirmation.
Init == /\ phase = "ready" /\ anchored = FALSE /\ sends = 0
        /\ knownSent = 0 /\ opened = FALSE /\ intent = FALSE
        /\ responseSent = 0 /\ responseFirst = 0
        /\ retryAllowed = FALSE /\ beforeRecovery = 0
Anchor == /\ phase = "ready" /\ phase' = "live" /\ anchored' = TRUE
          /\ UNCHANGED <<sends, knownSent, opened, intent, responseSent,
                         responseFirst, retryAllowed, beforeRecovery>>
Send == /\ phase = "live" /\ sends = 0
        /\ sends' = 1 /\ knownSent' = 2
        /\ UNCHANGED <<phase, anchored, opened, intent, responseSent,
                       responseFirst, retryAllowed, beforeRecovery>>
Open == /\ phase = "live" /\ sends = 1 /\ ~opened
        /\ opened' = TRUE
        /\ UNCHANGED <<phase, anchored, sends, knownSent, intent,
                       responseSent, responseFirst, retryAllowed, beforeRecovery>>
Intent == /\ phase = "live" /\ ~intent /\ intent' = TRUE
          /\ UNCHANGED <<phase, anchored, sends, knownSent, opened,
                         responseSent, responseFirst, retryAllowed, beforeRecovery>>
Crash == /\ phase \in {"ready", "live"} /\ phase' = "stopped"
         /\ knownSent' = 0
         /\ UNCHANGED <<anchored, sends, opened, intent, responseSent,
                        responseFirst, retryAllowed, beforeRecovery>>
StopRetainingFacts == /\ phase = "live" /\ phase' = "stopped"
                     /\ UNCHANGED <<anchored, sends, knownSent, opened, intent,
                                    responseSent, responseFirst, retryAllowed,
                                    beforeRecovery>>
Recover == /\ phase = "stopped" /\ anchored
           /\ phase' = "settled"
           /\ responseSent' = IF knownSent # 0 THEN
                                (IF DropKnown THEN 0 ELSE knownSent)
                              ELSE (IF SynthesizeTime THEN 1 ELSE 0)
           /\ responseFirst' = IF opened THEN 3 ELSE 0
           /\ retryAllowed' = IF NullGrantsRetry /\ knownSent = 0
                               THEN TRUE ELSE (~opened /\ ~intent)
           /\ beforeRecovery' = sends
           /\ sends' = IF RecoverySends THEN sends + 1 ELSE sends
           /\ UNCHANGED <<anchored, knownSent, opened, intent>>
Next == Anchor \/ Send \/ Open \/ Intent \/ Crash \/ StopRetainingFacts \/ Recover
Spec == Init /\ [][Next]_vars
TruthfulSentAt == phase = "settled" => responseSent = knownSent
OpenedPreserved == phase = "settled" => responseFirst = (IF opened THEN 3 ELSE 0)
NoRetryFromNull == phase = "settled" => retryAllowed = (~opened /\ ~intent)
RecoveryHasNoSend == phase = "settled" => sends = beforeRecovery
AnchoredResponseOnly == phase = "settled" => anchored
=============================================================================
