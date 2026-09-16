------------------------------ MODULE Recovery ------------------------------
EXTENDS Naturals
CONSTANT Mutation
VARIABLES phase, bytes, synced, acknowledged, result, epoch, badAck
vars == <<phase, bytes, synced, acknowledged, result, epoch, badAck>>
Init == /\ phase = "new" /\ bytes = "empty" /\ synced = FALSE
        /\ acknowledged = FALSE /\ result = "unknown" /\ epoch = 0 /\ badAck = FALSE
Admit == /\ phase = "new" /\ phase' = "pending"
         /\ UNCHANGED <<bytes, synced, acknowledged, result, epoch, badAck>>
Write(b) == /\ phase = "pending" /\ bytes = "empty"
            /\ bytes' = b
            /\ UNCHANGED <<phase, synced, acknowledged, result, epoch, badAck>>
Sync == /\ phase = "pending" /\ bytes = "full" /\ ~synced
        /\ synced' = TRUE
        /\ UNCHANGED <<phase, bytes, acknowledged, result, epoch, badAck>>
Ack == /\ phase = "pending" /\ ~acknowledged
       /\ (synced \/ Mutation = "earlyAck")
       /\ acknowledged' = TRUE /\ badAck' = ~synced
       /\ UNCHANGED <<phase, bytes, synced, result, epoch>>
Crash == /\ phase = "pending" /\ phase' = "offline"
         /\ UNCHANGED <<bytes, synced, acknowledged, result, epoch, badAck>>
\* Full validated lines are synced on recovery before reporting committed.
\* Tail rollback includes preservation and confirmed truncate/sync obligations.
Recover == /\ phase = "offline" /\ phase' = "recovered" /\ epoch' = 1
           /\ result' = IF bytes = "full" THEN "committed"
                         ELSE IF bytes = "bad" THEN "unknown" ELSE "not_committed"
           /\ synced' = (synced \/ bytes = "full")
           /\ UNCHANGED <<bytes, acknowledged, badAck>>
Next == Admit \/ (\E b \in {"full", "tail", "bad"} : Write(b)) \/ Sync \/ Ack \/ Crash \/ Recover
Spec == Init /\ [][Next]_vars
DurableAck == ~badAck
RecoverExact == phase = "recovered" =>
  /\ (result = "committed" => bytes = "full" /\ synced)
  /\ (bytes = "bad" => result = "unknown")
  /\ epoch = 1
=============================================================================
