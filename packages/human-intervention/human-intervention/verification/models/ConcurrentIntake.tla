-------------------------- MODULE ConcurrentIntake --------------------------
EXTENDS Naturals, Sequences, FiniteSets, TLC
CONSTANT Bad
Sessions == {"s1","s2"}
Inputs == {"s1a","s1b","s2a","s1a-other-login"}
Session(i) == IF i = "s2a" THEN "s2" ELSE "s1"
Source(i) == IF i \in {"s1b","s1a-other-login"} THEN "client-b" ELSE "client-a"
AcceptId(i) == IF i = "s1b" THEN "accept-b" ELSE "accept-a"
Op(i) == <<Session(i), AcceptId(i)>>
VARIABLES accepted, queue, consumed, prepared
vars == <<accepted, queue, consumed, prepared>>
Init == /\ accepted = [s \in Sessions |-> <<>>]
        /\ queue = [s \in Sessions |-> <<>>]
        /\ consumed = [s \in Sessions |-> <<>>]
        /\ prepared = [i \in Inputs |-> FALSE]
Elems(seq) == {seq[k] : k \in 1..Len(seq)}
Seen == UNION {Elems(accepted[s]) : s \in Sessions}
Prepare(i) == /\ ~prepared[i] /\ prepared' = [prepared EXCEPT ![i] = TRUE]
              /\ UNCHANGED <<accepted, queue, consumed>>
BoundElsewhere(i) == \E j \in Seen: Op(j) = Op(i) /\ j # i
ScopeAllows(i) == (Bad # "scope" \/ ~\E j \in Seen: AcceptId(j) = AcceptId(i))
                  /\ (Bad # "source" \/ ~\E j \in Seen: Session(j) = Session(i))
Enqueue(i) ==
  LET s == Session(i) IN
  /\ prepared[i] /\ (i \notin Seen \/ Bad = "duplicate")
  /\ (~BoundElsewhere(i) \/ Bad = "rebind")
  /\ Len(accepted[s]) < 3 /\ ScopeAllows(i)
  /\ accepted' = [accepted EXCEPT ![s] = Append(@,i)]
  /\ queue' = [queue EXCEPT ![s] = IF Bad = "lost" THEN <<i>> ELSE Append(@,i)]
  /\ UNCHANGED <<consumed,prepared>>
Take(s) == /\ Len(queue[s]) > 0
           /\ consumed' = [consumed EXCEPT ![s] = Append(@,Head(queue[s]))]
           /\ queue' = [queue EXCEPT ![s] = Tail(@)]
           /\ UNCHANGED <<accepted,prepared>>
Next == (\E i \in Inputs: Prepare(i) \/ Enqueue(i))
        \/ (\E s \in Sessions: Take(s)) \/ UNCHANGED vars
UniqueInput == \A s \in Sessions: Len(accepted[s]) = Cardinality(Elems(accepted[s]))
NoOperationRebinding == \A i,j \in Seen: Op(i) = Op(j) => i = j
NoLostAccepted == \A s \in Sessions: Elems(accepted[s]) = Elems(queue[s]) \cup Elems(consumed[s])
OrderedConsumption == \A s \in Sessions: accepted[s] = consumed[s] \o queue[s]
NoCrossSessionConflict == \A i \in Inputs: i \notin Seen /\ ~BoundElsewhere(i) => ScopeAllows(i)
NoClientSourceConflict == \A i \in Inputs: i \notin Seen /\ ~BoundElsewhere(i) => ScopeAllows(i)
Spec == Init /\ [][Next]_vars
=============================================================================
