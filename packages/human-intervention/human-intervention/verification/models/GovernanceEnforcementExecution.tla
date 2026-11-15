------------------- MODULE GovernanceEnforcementExecution -------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANT Bad
Tenants == {"A", "B"}
Operations == {"A1", "A2", "B1"}
Tenant(o) == IF o = "B1" THEN "B" ELSE "A"
VARIABLES selected, active, loaded, phase, captured, history
vars == <<selected, active, loaded, phase, captured, history>>
Current(t) == [tenant |-> t, implementation |-> selected[t], active |-> active[t]]
Init == /\ selected = [t \in Tenants |-> "X"]
        /\ active = [t \in Tenants |-> TRUE]
        /\ loaded = TRUE
        /\ phase = [o \in Operations |-> "new"]
        /\ captured = [o \in Operations |-> Current(Tenant(o))]
        /\ history = {}
Read(o) == /\ phase[o] = "new"
           /\ captured' = [captured EXCEPT ![o] = Current(Tenant(o))]
           /\ phase' = [phase EXCEPT ![o] = "ready"]
           /\ UNCHANGED <<selected, active, loaded, history>>
Replace(t) == /\ selected[t] = "X"
              /\ selected' = [selected EXCEPT ![t] = "Y"]
              /\ UNCHANGED <<active, loaded, phase, captured, history>>
Withdraw(t) == /\ active[t]
               /\ active' = [active EXCEPT ![t] = FALSE]
               /\ UNCHANGED <<selected, loaded, phase, captured, history>>
Unload == /\ loaded /\ loaded' = FALSE
          /\ UNCHANGED <<selected, active, phase, captured, history>>
Observed(o) == IF Bad = "preflight" THEN captured[o]
              ELSE Current(IF Bad = "tenant" /\ Tenant(o) = "A" THEN "B" ELSE Tenant(o))
CanJudge(o) == /\ (loaded \/ Bad = "manifest")
               /\ (Observed(o).implementation = "X" \/ Bad = "implementation")
               /\ Observed(o).active
Event(o, fresh) == [operation |-> o, tenant |-> Tenant(o),
                   observedTenant |-> Observed(o).tenant,
                   implementation |-> selected[Tenant(o)],
                   active |-> active[Tenant(o)], executed |-> loaded,
                   fresh |-> fresh]
Judge(o) == /\ phase[o] = "ready"
            /\ history' = IF CanJudge(o) THEN history \cup {Event(o, TRUE)} ELSE history
            /\ phase' = [phase EXCEPT ![o] = "done"]
            /\ UNCHANGED <<selected, active, loaded, captured>>
Replay == /\ Bad = "receipt" /\ phase["A2"] = "ready"
          /\ \E h \in history : h.operation = "A1"
          /\ history' = history \cup {Event("A2", FALSE)}
          /\ phase' = [phase EXCEPT !["A2"] = "done"]
          /\ UNCHANGED <<selected, active, loaded, captured>>
Finished == /\ \A o \in Operations : phase[o] = "done"
            /\ UNCHANGED vars
Next == (\E o \in Operations : Read(o) \/ Judge(o))
        \/ (\E t \in Tenants : Replace(t) \/ Withdraw(t))
        \/ Unload \/ Replay \/ Finished
ExactImplementation == \A h \in history : h.implementation = "X"
ActualInterpreter == \A h \in history : h.executed
CurrentContribution == \A h \in history : h.active
ReceiptIsNotCurrent == \A h \in history : h.fresh
TenantIsolation == \A h \in history : h.tenant = h.observedTenant
Spec == Init /\ [][Next]_vars
=============================================================================
