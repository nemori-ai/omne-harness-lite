-------------------------- MODULE PrivateCache --------------------------
EXTENDS Naturals, FiniteSets, Sequences
CONSTANTS Leases, Pieces, Weight(_), EntryCap, ByteCap, LeaseEntryCap, LeaseByteCap, BadShare
VARIABLE cache, lastHit, phase, pendingLease, pendingPiece
vars == <<cache,lastHit,phase,pendingLease,pendingPiece>>
Entries(c) == UNION { {<<l,p>> : p \in c[l]} : l \in Leases }
RECURSIVE Sum(_)
Sum(items) == IF items = {} THEN 0 ELSE
             LET item == CHOOSE x \in items : TRUE
             IN Weight(item[2]) + Sum(items \ {item})
Bytes(ps) == Sum({<<0,p>> : p \in ps})
TestWeight(p) == IF p = 1 THEN 2 ELSE 3
LocalFull == Cardinality(cache[pendingLease]) >= LeaseEntryCap \/
             Bytes(cache[pendingLease]) + Weight(pendingPiece) > LeaseByteCap
GlobalFull == Cardinality(Entries(cache)) >= EntryCap \/
              Sum(Entries(cache)) + Weight(pendingPiece) > ByteCap
TypeOK == /\ cache \in [Leases -> SUBSET Pieces]
          /\ lastHit \in {<<a,b>> : a \in Leases, b \in Leases} \cup {<<>>}
          /\ phase \in {"idle","local","global"}
          /\ pendingLease \in Leases /\ pendingPiece \in Pieces
Bounded == /\ Cardinality(Entries(cache)) <= EntryCap
           /\ Sum(Entries(cache)) <= ByteCap
           /\ \A l \in Leases : /\ Cardinality(cache[l]) <= LeaseEntryCap
                                  /\ Bytes(cache[l]) <= LeaseByteCap
Room == /\ phase # "idle" => pendingPiece \notin cache[pendingLease]
        /\ phase = "global" => ~LocalFull
PrivateHit == lastHit # <<>> => lastHit[1] = lastHit[2]
Init == /\ cache = [l \in Leases |-> {}] /\ lastHit = <<>> /\ phase = "idle"
        /\ pendingLease \in Leases /\ pendingPiece \in Pieces
Hit(l,p,owner) == /\ phase = "idle" /\ p \in cache[owner] /\ (owner = l \/ BadShare)
                  /\ lastHit' = <<l,owner>> /\ UNCHANGED <<cache,phase,pendingLease,pendingPiece>>
BeginStore(l,p) == /\ phase = "idle" /\ p \notin cache[l]
                   /\ Weight(p) <= LeaseByteCap /\ Weight(p) <= ByteCap
                   /\ LeaseEntryCap > 0 /\ EntryCap > 0
                   /\ pendingLease' = l /\ pendingPiece' = p /\ phase' = "local"
                   /\ UNCHANGED <<cache,lastHit>>
EvictLocal(p) == /\ phase = "local" /\ LocalFull /\ p \in cache[pendingLease]
                 /\ cache' = [cache EXCEPT ![pendingLease] = @ \ {p}]
                 /\ UNCHANGED <<lastHit,phase,pendingLease,pendingPiece>>
LocalDone == /\ phase = "local" /\ ~LocalFull /\ phase' = "global"
             /\ UNCHANGED <<cache,lastHit,pendingLease,pendingPiece>>
EvictGlobal(l,p) == /\ phase = "global" /\ GlobalFull /\ p \in cache[l]
                    /\ cache' = [cache EXCEPT ![l] = @ \ {p}]
                    /\ UNCHANGED <<lastHit,phase,pendingLease,pendingPiece>>
Commit == /\ phase = "global" /\ ~GlobalFull /\ phase' = "idle"
          /\ cache' = [cache EXCEPT ![pendingLease] = @ \cup {pendingPiece}]
          /\ UNCHANGED <<lastHit,pendingLease,pendingPiece>>
Clear(l) == /\ phase = "idle" /\ cache' = [cache EXCEPT ![l] = {}]
            /\ UNCHANGED <<lastHit,phase,pendingLease,pendingPiece>>
Exit == /\ cache' = [l \in Leases |-> {}] /\ phase' = "idle"
        /\ UNCHANGED <<lastHit,pendingLease,pendingPiece>>
Next == (\E l \in Leases : Clear(l) \/ (\E p \in Pieces : BeginStore(l,p) \/
          EvictGlobal(l,p) \/ (\E owner \in Leases : Hit(l,p,owner))))
        \/ (\E p \in Pieces : EvictLocal(p)) \/ LocalDone \/ Commit \/ Exit
Spec == Init /\ [][Next]_vars
=============================================================================
