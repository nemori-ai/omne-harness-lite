----------------------- MODULE GovernanceAdoption -----------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANT Bad
Leases == {"left", "right"}
Ops == {"first", "second"}
VARIABLES active, revision, prepared, finished, choices, versions, evidence,
          settings, permissions, completeAccepted, currentAccepted, evidenceAccepted
vars == <<active,revision,prepared,finished,choices,versions,evidence,
          settings,permissions,completeAccepted,currentAccepted,evidenceAccepted>>
Init == /\ active = Leases /\ revision = 0 /\ prepared = {} /\ finished = {}
        /\ choices = [o \in Ops |-> {}] /\ versions = [o \in Ops |-> 0]
        /\ evidence = [o \in Ops |-> FALSE]
        /\ settings = {} /\ permissions = {}
        /\ completeAccepted = TRUE /\ currentAccepted = TRUE /\ evidenceAccepted = TRUE
Prepare(o,c,e) == /\ o \notin prepared
                 /\ prepared' = prepared \cup {o}
                 /\ choices' = [choices EXCEPT ![o] = c]
                 /\ versions' = [versions EXCEPT ![o] = revision]
                 /\ evidence' = [evidence EXCEPT ![o] = e]
                 /\ UNCHANGED <<active,revision,finished,settings,permissions,
                                 completeAccepted,currentAccepted,evidenceAccepted>>
Publish(o) == /\ o \in prepared \ finished
              /\ (choices[o] = active \/ Bad = "incomplete")
              /\ (versions[o] = revision \/ Bad = "stale")
              /\ (evidence[o] \/ Bad = "evidence")
              /\ settings' = choices[o]
              /\ permissions' = IF Bad = "partial" THEN permissions ELSE choices[o]
              /\ revision' = revision + 1 /\ finished' = finished \cup {o}
              /\ completeAccepted' = (completeAccepted /\ (choices[o] = active))
              /\ currentAccepted' = (currentAccepted /\ (versions[o] = revision))
              /\ evidenceAccepted' = (evidenceAccepted /\ evidence[o])
              /\ UNCHANGED <<active,prepared,choices,versions,evidence>>
Withdraw(l) == /\ l \in active /\ active' = active \ {l}
               /\ revision' = revision + 1
               /\ settings' = settings \ {l} /\ permissions' = permissions \ {l}
               /\ UNCHANGED <<prepared,finished,choices,versions,evidence,
                               completeAccepted,currentAccepted,evidenceAccepted>>
Next == (\E o \in Ops, c \in SUBSET Leases, e \in BOOLEAN: Prepare(o,c,e))
        \/ (\E o \in Ops: Publish(o)) \/ (\E l \in Leases: Withdraw(l))
        \/ UNCHANGED vars
CompletePublication == completeAccepted
CurrentPublication == currentAccepted
BoundEvidence == evidenceAccepted
AtomicBundle == settings = permissions
Spec == Init /\ [][Next]_vars
=============================================================================
