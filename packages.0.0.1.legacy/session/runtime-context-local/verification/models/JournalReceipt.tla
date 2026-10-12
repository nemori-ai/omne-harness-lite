---------------------------- MODULE JournalReceipt ----------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANTS GuardMissing, GuardIdentity, GuardRecord
Original == [id |-> "request-1", body |-> "value-1", time |-> 1]
NoRecord == [id |-> "none", body |-> "none", time |-> 0]
Wrong == [id |-> "request-1", body |-> "value-2", time |-> 2]
VARIABLES pending, held, physical, stored, tail, applied, violation
vars == <<pending, held, physical, stored, tail, applied, violation>>
Init == /\ pending = TRUE /\ held = Original /\ physical = "inflight"
        /\ stored = NoRecord /\ tail = 0 /\ applied = FALSE /\ violation = FALSE
Commit == /\ physical = "inflight" /\ physical' = "committed"
          /\ stored' = Original /\ tail' = tail + 1
          /\ UNCHANGED <<pending, held, applied, violation>>
DefiniteNoWrite == /\ physical = "inflight" /\ physical' = "unwritten"
                   /\ UNCHANGED <<pending, held, stored, tail, applied, violation>>
ForeignRecord == /\ physical = "inflight" /\ stored = NoRecord
                 /\ stored' = Wrong /\ tail' = tail + 1
                 /\ UNCHANGED <<pending, held, physical, applied, violation>>
UnrelatedTail == /\ tail = 0 /\ tail' = 1
                 /\ UNCHANGED <<pending, held, physical, stored, applied, violation>>
Retry == /\ pending
         /\ held' = IF GuardIdentity THEN held ELSE Wrong
         /\ UNCHANGED <<pending, physical, stored, tail, applied, violation>>
Recognize == /\ pending /\ stored # NoRecord
             /\ IF GuardRecord THEN stored = Original ELSE stored.id = held.id
             /\ pending' = FALSE /\ applied' = TRUE
             /\ violation' = (violation \/ (stored # Original))
             /\ UNCHANGED <<held, physical, stored, tail>>
MissingRead == /\ pending /\ stored # Original
               /\ IF GuardMissing THEN physical = "unwritten" /\ stored = NoRecord
                  ELSE TRUE
               /\ pending' = FALSE
               /\ violation' = (violation \/ (physical # "unwritten") \/ (stored # NoRecord))
               /\ UNCHANGED <<held, physical, stored, tail, applied>>
Next == Commit \/ DefiniteNoWrite \/ ForeignRecord \/ UnrelatedTail \/ Retry
        \/ Recognize \/ MissingRead
TypeOK == /\ physical \in {"inflight", "committed", "unwritten"}
          /\ stored \in {NoRecord, Original, Wrong} /\ held \in {Original, Wrong}
          /\ tail \in 0..3
OriginalRetained == held = Original
NoFalseReceipt == ~violation
PendingUntilEvidence == (~pending => applied \/ (physical = "unwritten" /\ stored = NoRecord))
Spec == Init /\ [][Next]_vars
=============================================================================
