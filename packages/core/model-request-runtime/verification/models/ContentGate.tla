---------------------------- MODULE ContentGate ----------------------------
EXTENDS Naturals

CONSTANT GateBeforeVisible, HonorCancel
VARIABLES phase, gate, visible, cancelled, stopped, sends, gateCalls, result

vars == <<phase, gate, visible, cancelled, stopped, sends, gateCalls, result>>

Init == /\ phase = "ready"
        /\ gate = "idle"
        /\ visible = FALSE
        /\ cancelled = FALSE
        /\ stopped = FALSE
        /\ sends = 0
        /\ gateCalls = 0
        /\ result = "none"

Send == /\ phase = "ready" /\ ~cancelled
        /\ phase' = "reading" /\ sends' = sends + 1
        /\ UNCHANGED <<gate, visible, cancelled, stopped, gateCalls, result>>

FirstContent == /\ phase = "reading" /\ gate = "idle" /\ ~cancelled
                /\ phase' = "waiting" /\ gate' = "pending"
                /\ gateCalls' = gateCalls + 1
                /\ UNCHANGED <<visible, cancelled, stopped, sends, result>>

GateSuccess == /\ gate = "pending"
               /\ gate' = "passed"
               /\ UNCHANGED <<phase, visible, cancelled, stopped, sends, gateCalls, result>>

GateFailure == /\ gate = "pending"
               /\ gate' = "failed"
               /\ UNCHANGED <<phase, visible, cancelled, stopped, sends, gateCalls, result>>

Observe == /\ phase = "waiting" /\ ~stopped /\ ~visible
           /\ (GateBeforeVisible => gate = "passed")
           /\ (HonorCancel => ~cancelled)
           /\ visible' = TRUE
           /\ UNCHANGED <<phase, gate, cancelled, stopped, sends, gateCalls, result>>

Abort == /\ ~cancelled /\ ~stopped
         /\ cancelled' = TRUE
         /\ UNCHANGED <<phase, gate, visible, stopped, sends, gateCalls, result>>

Stop == /\ ~stopped /\ (cancelled \/ gate = "failed")
        /\ stopped' = TRUE /\ phase' = "done"
        /\ result' = IF gate = "failed" THEN "local_failure" ELSE "interrupted"
        /\ UNCHANGED <<gate, visible, cancelled, sends, gateCalls>>

Complete == /\ visible /\ ~cancelled /\ ~stopped
            /\ stopped' = TRUE /\ phase' = "done" /\ result' = "complete"
            /\ UNCHANGED <<gate, visible, cancelled, sends, gateCalls>>

Next == Send \/ FirstContent \/ GateSuccess \/ GateFailure \/ Observe
        \/ Abort \/ Stop \/ Complete

Spec == Init /\ [][Next]_vars /\ WF_vars(Stop)

TypeOK == /\ phase \in {"ready", "reading", "waiting", "done"}
          /\ gate \in {"idle", "pending", "passed", "failed"}
          /\ visible \in BOOLEAN /\ cancelled \in BOOLEAN /\ stopped \in BOOLEAN
          /\ sends \in 0..1 /\ gateCalls \in 0..1
          /\ result \in {"none", "local_failure", "interrupted", "complete"}
NoContentBeforeGate == visible => gate = "passed"
GateFailureInvisible == gate = "failed" => ~visible
NoRevealAfterCancel == [][cancelled /\ ~visible => ~visible']_vars
CancelEventuallyStops == cancelled ~> stopped
GateFailureEventuallyStops == (gate = "failed") ~> stopped

=============================================================================
