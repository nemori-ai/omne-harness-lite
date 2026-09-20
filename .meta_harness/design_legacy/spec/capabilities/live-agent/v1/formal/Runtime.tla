------------------------------ MODULE Runtime ------------------------------
EXTENDS Naturals, FiniteSets
CONSTANTS Instances, Tenants, Sessions, Factories, WorkSlots, TenantOf, SessionOf, SessionTenant, NoInstance,
          NoWork, NoFactory, AllowCrossTenant, EarlyRemove, StaleRemove,
          EarlyProviderDispose, Failures
VARIABLES phase, current, factory, provider, preparing, resources,
          published, work, blocked
vars == <<phase, current, factory, provider, preparing, resources,
          published, work, blocked>>
Held == {i \in Instances : phase[i] \notin {"new", "disposed"}}
Owned(i) == {w \in WorkSlots : work[w] # NoWork /\ work[w].instance = i}
Users(f) == {i \in Held : factory[i] = f}
Init ==
  /\ phase = [i \in Instances |-> "new"]
  /\ current = [s \in Sessions |-> NoInstance]
  /\ factory = [i \in Instances |-> NoFactory]
  /\ provider = [f \in Factories |-> "new"]
  /\ preparing = [i \in Instances |-> FALSE]
  /\ resources = [i \in Instances |-> FALSE]
  /\ published = [i \in Instances |-> FALSE]
  /\ work = [w \in WorkSlots |-> NoWork]
  /\ blocked = [i \in Instances |-> FALSE]
Bind(f) ==
  /\ provider[f] = "new"
  /\ \A g \in Factories : provider[g] \notin {"live", "closing"}
  /\ provider' = [provider EXCEPT ![f] = "live"]
  /\ UNCHANGED <<phase, current, factory, preparing, resources, published, work, blocked>>
Reserve(i, f) ==
  /\ phase[i] = "new" /\ provider[f] = "live"
  /\ current[SessionOf[i]] = NoInstance
  /\ phase' = [phase EXCEPT ![i] = "preparing"]
  /\ current' = [current EXCEPT ![SessionOf[i]] = i]
  /\ factory' = [factory EXCEPT ![i] = f]
  /\ preparing' = [preparing EXCEPT ![i] = TRUE]
  /\ resources' = [resources EXCEPT ![i] = TRUE]
  /\ UNCHANGED <<provider, published, work, blocked>>
Prepared(i) ==
  /\ preparing[i]
  /\ preparing' = [preparing EXCEPT ![i] = FALSE]
  /\ phase' = [phase EXCEPT ![i] = IF phase[i] = "preparing" THEN "ready" ELSE @]
  /\ published' = [published EXCEPT ![i] = IF phase[i] = "preparing" THEN TRUE ELSE @]
  /\ UNCHANGED <<current, factory, provider, resources, work, blocked>>
Close(i) ==
  /\ phase[i] \in {"preparing", "ready"}
  /\ phase' = [phase EXCEPT ![i] = "closing"]
  /\ current' = IF EarlyRemove THEN [current EXCEPT ![SessionOf[i]] = NoInstance] ELSE current
  /\ UNCHANGED <<factory, provider, preparing, resources, published, work, blocked>>
Admit(i, t, w) ==
  /\ phase[i] = "ready" /\ current[SessionOf[i]] = i
  /\ provider[factory[i]] = "live" /\ work[w] = NoWork
  /\ (t = TenantOf[i] \/ AllowCrossTenant)
  /\ work' = [work EXCEPT ![w] = [instance |-> i, tenant |-> t]]
  /\ UNCHANGED <<phase, current, factory, provider, preparing, resources, published, blocked>>
Settle(w) ==
  /\ work[w] # NoWork
  /\ work' = [work EXCEPT ![w] = NoWork]
  /\ UNCHANGED <<phase, current, factory, provider, preparing, resources, published, blocked>>
Release(i) ==
  /\ phase[i] = "closing" /\ ~preparing[i] /\ Owned(i) = {}
  /\ phase' = [phase EXCEPT ![i] = "releasing"]
  /\ UNCHANGED <<current, factory, provider, preparing, resources, published, work, blocked>>
Cleanup(i) ==
  /\ phase[i] = "releasing"
  /\ phase' = [phase EXCEPT ![i] = "disposed"]
  /\ resources' = [resources EXCEPT ![i] = FALSE]
  /\ blocked' = [blocked EXCEPT ![i] = FALSE]
  /\ current' = IF current[SessionOf[i]] = i
                 THEN [current EXCEPT ![SessionOf[i]] = NoInstance] ELSE current
  /\ UNCHANGED <<factory, provider, preparing, published, work>>
CleanupFailure(i) ==
  /\ Failures /\ phase[i] = "releasing" /\ ~blocked[i]
  /\ blocked' = [blocked EXCEPT ![i] = TRUE]
  /\ UNCHANGED <<phase, current, factory, provider, preparing, resources, published, work>>
LateCleanup(i) ==
  /\ phase[i] = "disposed" /\ current[SessionOf[i]] # NoInstance
  /\ current' = IF StaleRemove THEN [current EXCEPT ![SessionOf[i]] = NoInstance] ELSE current
  /\ UNCHANGED <<phase, factory, provider, preparing, resources, published, work, blocked>>
RetireFactory(f) ==
  /\ provider[f] = "live"
  /\ provider' = [provider EXCEPT ![f] = "closing"]
  /\ phase' = [i \in Instances |-> IF factory[i] = f /\ phase[i] \in {"preparing", "ready"}
                                   THEN "closing" ELSE phase[i]]
  /\ UNCHANGED <<current, factory, preparing, resources, published, work, blocked>>
DropFactory(f) ==
  /\ provider[f] = "closing" /\ (Users(f) = {} \/ EarlyProviderDispose)
  /\ provider' = [provider EXCEPT ![f] = "gone"]
  /\ UNCHANGED <<phase, current, factory, preparing, resources, published, work, blocked>>
Next ==
  \/ \E f \in Factories : Bind(f) \/ RetireFactory(f) \/ DropFactory(f)
  \/ \E i \in Instances, f \in Factories : Reserve(i, f)
  \/ \E i \in Instances : Prepared(i) \/ Close(i) \/ Release(i) \/ Cleanup(i)
                           \/ CleanupFailure(i) \/ LateCleanup(i)
  \/ \E i \in Instances, t \in Tenants, w \in WorkSlots : Admit(i, t, w)
  \/ \E w \in WorkSlots : Settle(w)
Spec == Init /\ [][Next]_vars
TypeOK ==
  /\ phase \in [Instances -> {"new", "preparing", "ready", "closing", "releasing", "disposed"}]
  /\ current \in [Sessions -> (Instances \cup {NoInstance})]
  /\ factory \in [Instances -> (Factories \cup {NoFactory})]
  /\ provider \in [Factories -> {"new", "live", "closing", "gone"}]
  /\ preparing \in [Instances -> BOOLEAN] /\ resources \in [Instances -> BOOLEAN]
  /\ published \in [Instances -> BOOLEAN] /\ blocked \in [Instances -> BOOLEAN]
  /\ work \in [WorkSlots -> ({NoWork} \cup [instance : Instances, tenant : Tenants])]
Reservation == \A i \in Held : current[SessionOf[i]] = i
IndexExact == \A s \in Sessions : current[s] # NoInstance =>
               (current[s] \in Held /\ SessionOf[current[s]] = s)
Unique == \A s \in Sessions : Cardinality({i \in Held : SessionOf[i] = s}) <= 1
IdentityConsistent == \A i \in Instances : TenantOf[i] = SessionTenant[SessionOf[i]]
TenantSafe == \A w \in WorkSlots : work[w] # NoWork => work[w].tenant = TenantOf[work[w].instance]
OwnedWork == \A w \in WorkSlots : work[w] # NoWork => phase[work[w].instance] \in {"ready", "closing"}
NoEarlyRelease == \A i \in Instances : phase[i] \in {"releasing", "disposed"} => (~preparing[i] /\ Owned(i) = {})
NoLeak == \A i \in Instances : phase[i] = "disposed" => ~resources[i]
ProviderHeld == \A i \in Held : provider[factory[i]] \in {"live", "closing"}
ReadyBound == \A i \in Instances : phase[i] = "ready" => provider[factory[i]] = "live"
ProgressSpec == Spec /\ (\A i \in Instances : WF_vars(Prepared(i)) /\ WF_vars(Release(i)) /\ WF_vars(Cleanup(i)))
                    /\ (\A w \in WorkSlots : WF_vars(Settle(w)))
                    /\ (\A f \in Factories : WF_vars(DropFactory(f)))
Drains == \A i \in Instances : (phase[i] = "closing") ~> (phase[i] = "disposed")
ProvidersDrain == \A f \in Factories : (provider[f] = "closing") ~> (provider[f] = "gone")
=============================================================================
