-------------------------- MODULE InitiatorScope ---------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS Runs, None, UnsafeEarlyDispose
ASSUME /\ None \notin Runs /\ IsFiniteSet(Runs) /\ Runs # {}
VARIABLES state, used, parent, tracked, settled, excluded, draining
vars == <<state, used, parent, tracked, settled, excluded, draining>>

\* parent is assigned only to an earlier run; this finite closure also works
\* for inactive ancestors retained by an asynchronous continuation.
RECURSIVE Ancestors(_)
Ancestors(r) == IF r = None THEN {} ELSE {r} \cup Ancestors(parent[r])

Init == /\ state = "active" /\ used = {}
        /\ parent = [r \in Runs |-> None]
        /\ tracked = {} /\ settled = {} /\ excluded = {}
        /\ draining = FALSE

Start(r, p) ==
    /\ state = "active" /\ r \notin used /\ p \in used \cup {None}
    /\ used' = used \cup {r}
    /\ parent' = [parent EXCEPT ![r] = p]
    /\ tracked' = tracked \cup {r}
    /\ UNCHANGED <<state, settled, excluded, draining>>

\* Finishing a synchronous call, observing a Promise settlement, or failing
\* to install the observer releases tracking. Detached work is outside Runs.
Settle(r) ==
    /\ r \in used \ settled
    /\ settled' = settled \cup {r}
    /\ tracked' = tracked \ {r}
    /\ UNCHANGED <<state, used, parent, excluded, draining>>

Close == /\ state = "active" /\ state' = "closing"
         /\ UNCHANGED <<used, parent, tracked, settled, excluded, draining>>

BeginDrain(origin) ==
    /\ state = "closing" /\ ~draining
    /\ origin \in used \cup {None}
    /\ draining' = TRUE
    /\ excluded' = Ancestors(origin)
    /\ tracked' = tracked \ Ancestors(origin)
    /\ UNCHANGED <<state, used, parent, settled>>

Dispose ==
    /\ state = "closing" /\ draining
    /\ (tracked = {} \/ UnsafeEarlyDispose)
    /\ state' = "disposed"
    /\ UNCHANGED <<used, parent, tracked, settled, excluded, draining>>

Next == \/ \E r \in Runs, p \in Runs \cup {None} : Start(r, p)
        \/ \E r \in Runs : Settle(r)
        \/ Close
        \/ \E origin \in Runs \cup {None} : BeginDrain(origin)
        \/ Dispose
Spec == Init /\ [][Next]_vars
\* Conditional progress: all relevant returned work eventually releases and
\* the host schedules disposal. No fairness assumption is made by Spec itself.
ProgressSpec == Spec /\ WF_vars(Dispose)
               /\ (\A r \in Runs : WF_vars(Settle(r)))

TypeOK == /\ state \in {"active", "closing", "disposed"}
          /\ used \subseteq Runs /\ parent \in [Runs -> Runs \cup {None}]
          /\ tracked \subseteq used /\ settled \subseteq used
          /\ excluded \subseteq used /\ draining \in BOOLEAN
Accounting == tracked = used \ (settled \cup excluded)
NoCycle == \A r \in used : r \notin Ancestors(parent[r])
DrainedBeforeDisposed == state = "disposed" => tracked = {}
ExclusionRequiresDrain == excluded # {} => draining
AdmissionClosed == [][state # "active" => UNCHANGED used]_vars
MonotoneLifetime == [][(state = "closing" => state' # "active") /\
                       (state = "disposed" => state' = "disposed")]_vars
ConditionalDrain == (state = "closing" /\ draining) ~> (state = "disposed")
=============================================================================
