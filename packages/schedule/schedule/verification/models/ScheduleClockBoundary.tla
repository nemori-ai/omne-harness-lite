-------------------- MODULE ScheduleClockBoundary --------------------
EXTENDS Naturals, TLC
CONSTANT Mutation
VARIABLES epoch, mono, wall, open, wake, result, witness
vars == <<epoch, mono, wall, open, wake, result, witness>>
OperationEpoch == 1
Deadline == 2
WitnessSet == [epoch : 1..2, mono : 0..3, open : BOOLEAN]
Init == /\ epoch = 1 /\ mono = 0 /\ wall = 1 /\ open = TRUE
        /\ wake = FALSE /\ result = "pending"
        /\ witness = [epoch |-> 1, mono |-> 0, open |-> TRUE]
Tick == /\ mono < 3 /\ mono' = mono + 1
        /\ UNCHANGED <<epoch, wall, open, wake, result, witness>>
WallJump == /\ wall' \in 0..2
            /\ UNCHANGED <<epoch, mono, open, wake, result, witness>>
Restart == /\ epoch = 1 /\ epoch' = 2 /\ mono' = 0
           /\ UNCHANGED <<wall, open, wake, result, witness>>
Close == /\ open /\ open' = FALSE
         /\ UNCHANGED <<epoch, mono, wall, wake, result, witness>>
Timer == /\ wake' \in BOOLEAN
         /\ UNCHANGED <<epoch, mono, wall, open, result, witness>>
Settle ==
    /\ result = "pending" /\ wake
    /\ result' = IF Mutation # "epoch" /\ epoch # OperationEpoch THEN "invalidated"
                  ELSE IF Mutation # "close" /\ ~open THEN "closed"
                  ELSE IF Mutation # "deadline" /\ mono >= Deadline THEN "limited"
                  ELSE "ok"
    /\ witness' = [epoch |-> epoch, mono |-> mono, open |-> open]
    /\ UNCHANGED <<epoch, mono, wall, open, wake>>
Next == Tick \/ WallJump \/ Restart \/ Close \/ Timer \/ Settle
Spec == Init /\ [][Next]_vars
TypeOK == /\ epoch \in 1..2 /\ mono \in 0..3 /\ wall \in 0..2
          /\ open \in BOOLEAN /\ wake \in BOOLEAN
          /\ result \in {"pending", "invalidated", "closed", "limited", "ok"}
          /\ witness \in WitnessSet
NoEpochReuse == result = "ok" => witness.epoch = OperationEpoch
NoExpiredRead == result = "ok" => witness.mono < Deadline
NoClosedRead == result = "ok" => witness.open
=============================================================================
