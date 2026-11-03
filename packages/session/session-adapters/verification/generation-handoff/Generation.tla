-------------------------- MODULE Generation --------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS Readers, MaxGeneration, Fault
VARIABLES active, live, retired, captured, delivered, lateAnswer
vars == <<active, live, retired, captured, delivered, lateAnswer>>

Views == Readers \X (1..MaxGeneration)
Current(v) == live[v[1]] /\ (Fault = "no-generation-check" \/ active[v[1]] = v[2])

Init ==
    /\ active = [r \in Readers |-> 1]
    /\ live = [r \in Readers |-> TRUE]
    /\ retired = {}
    /\ captured = {}
    /\ delivered = {}
    /\ lateAnswer = FALSE

Capture(r) ==
    /\ live[r]
    /\ captured' = captured \cup {<<r, active[r]>>}
    /\ UNCHANGED <<active, live, retired, delivered, lateAnswer>>

Deliver(v) ==
    /\ v \in captured \ delivered
    /\ delivered' = delivered \cup {v}
    /\ lateAnswer' = (lateAnswer \/ v \in retired)
    /\ UNCHANGED <<active, live, retired, captured>>

Retire(r) ==
    /\ <<r, active[r]>> \notin retired
    /\ retired' = retired \cup {<<r, active[r]>>}
    /\ live' = IF Fault = "no-retirement" THEN live ELSE [live EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<active, captured, delivered, lateAnswer>>

Assemble(r) ==
    /\ <<r, active[r]>> \in retired
    /\ active[r] < MaxGeneration
    /\ active' = [active EXCEPT ![r] = @ + 1]
    /\ live' = [live EXCEPT ![r] = TRUE]
    /\ UNCHANGED <<retired, captured, delivered, lateAnswer>>

Next ==
    \/ \E r \in Readers : Capture(r) \/ Retire(r) \/ Assemble(r)
    \/ \E v \in Views : Deliver(v)

Spec == Init /\ [][Next]_vars

TypeOK ==
    /\ active \in [Readers -> 1..MaxGeneration]
    /\ live \in [Readers -> BOOLEAN]
    /\ retired \subseteq Views
    /\ captured \subseteq Views
    /\ delivered \subseteq captured
    /\ lateAnswer \in BOOLEAN

RetiredNeverCurrent == \A v \in captured \cap retired : ~Current(v)
LiveReaderUnaffected ==
    \A v \in captured \ retired : v[2] = active[v[1]] => Current(v)
NoLateAnswer == ~lateAnswer
=======================================================================
