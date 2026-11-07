------------------------------- MODULE Custody -------------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Bug
M == {1, 2}
ExternalNative == {3}
Tenants == {1, 2}
Kinds == {"native", "program"}
Owner(m) == m
Version(m) == 1
ActivationExpiry == [m \in M |-> m]
VARIABLES now, expires, phase, bytes, native, program, producer, lease, operation, lastGrant, effects
vars == <<now, expires, phase, bytes, native, program, producer, lease, operation, lastGrant, effects>>
NoIndependent(m) == m \notin native /\ m \notin program /\ m \notin producer
Init == /\ now = 0 /\ expires = ActivationExpiry
        /\ phase = [m \in M |-> "live"] /\ bytes = M \cup ExternalNative
        /\ native = {1} /\ program = {} /\ producer = {2}
        /\ lease = [m \in M |-> 0] /\ operation = [m \in M |-> 0]
        /\ lastGrant = [m \in M |-> [at |-> 0, tenant |-> Owner(m), version |-> 1]]
        /\ effects = [m \in M |-> 1]
Tick == /\ now < 3 /\ now' = now + 1
        /\ UNCHANGED <<expires, phase, bytes, native, program, producer, lease, operation, lastGrant, effects>>
BeginRead(m,t,v) ==
  /\ t = Owner(m) /\ v = Version(m) /\ m \in bytes
  /\ phase[m] \in {"live", "expired"} /\ lease[m] = 0
  /\ (now < expires[m] \/ Bug = "late-read")
  /\ lease' = [lease EXCEPT ![m] = 2]
  /\ lastGrant' = [lastGrant EXCEPT ![m] = [at |-> now, tenant |-> t, version |-> v]]
  /\ UNCHANGED <<now, expires, phase, bytes, native, program, producer, operation, effects>>
EndPage(m) == /\ lease[m] > 0 /\ lease' = [lease EXCEPT ![m] = 0]
              /\ UNCHANGED <<now, expires, phase, bytes, native, program, producer, operation, lastGrant, effects>>
LeaseTick(m) == /\ lease[m] > 0 /\ lease' = [lease EXCEPT ![m] = @ - 1]
                /\ UNCHANGED <<now, expires, phase, bytes, native, program, producer, operation, lastGrant, effects>>
Acquire(m,t,v,k) ==
  /\ t = Owner(m) /\ v = Version(m) /\ m \in bytes
  /\ phase[m] \in {"live", "expired"}
  /\ native' = IF k = "native" THEN native \cup {m} ELSE native
  /\ program' = IF k = "program" THEN program \cup {m} ELSE program
  /\ UNCHANGED <<now, expires, phase, bytes, producer, lease, operation, lastGrant, effects>>
ReleaseUse(m,k) ==
  /\ native' = IF k = "native" THEN native \ {m} ELSE native
  /\ program' = IF k = "program" THEN program \ {m} ELSE program
  /\ UNCHANGED <<now, expires, phase, bytes, producer, lease, operation, lastGrant, effects>>
ReleaseProducer(m) ==
  /\ m \in producer /\ m \in program
  /\ producer' = producer \ {m}
  /\ UNCHANGED <<now, expires, phase, bytes, native, program, lease, operation, lastGrant, effects>>
Expire(m) == /\ now >= expires[m] /\ phase[m] = "live"
             /\ phase' = [phase EXCEPT ![m] = "expired"]
             /\ UNCHANGED <<now, expires, bytes, native, program, producer, lease, operation, lastGrant, effects>>
DeleteIntent(m) ==
  /\ phase[m] = "expired" /\ lease[m] = 0
  /\ (NoIndependent(m) \/ Bug = "native-delete")
  /\ phase' = [phase EXCEPT ![m] = "fenced"]
  /\ operation' = [operation EXCEPT ![m] = Version(m)]
  /\ UNCHANGED <<now, expires, bytes, native, program, producer, lease, lastGrant, effects>>
PhysicalDelete(m) ==
  /\ phase[m] = "fenced" /\ operation[m] = Version(m)
  /\ bytes' = bytes \ {m}
  /\ UNCHANGED <<now, expires, phase, native, program, producer, lease, operation, lastGrant, effects>>
Confirm(m) ==
  /\ phase[m] = "fenced" /\ m \notin bytes /\ operation[m] = Version(m)
  /\ phase' = [phase EXCEPT ![m] = "done"]
  /\ UNCHANGED <<now, expires, bytes, native, program, producer, lease, operation, lastGrant, effects>>
StaleWrite(m) ==
  /\ Bug = "revive" /\ phase[m] = "done"
  /\ bytes' = bytes \cup {m}
  /\ UNCHANGED <<now, expires, phase, native, program, producer, lease, operation, lastGrant, effects>>
Renew(m) ==
  /\ Bug = "renew" /\ expires' = [expires EXCEPT ![m] = @ + 1]
  /\ UNCHANGED <<now, phase, bytes, native, program, producer, lease, operation, lastGrant, effects>>
Reexecute(m) ==
  /\ Bug = "reexecute" /\ now >= expires[m]
  /\ effects' = [effects EXCEPT ![m] = @ + 1]
  /\ UNCHANGED <<now, expires, phase, bytes, native, program, producer, lease, operation, lastGrant>>
RetryOrCrash == UNCHANGED vars
Next == \/ Tick
        \/ \E m \in M, t \in Tenants, v \in {1,2}: BeginRead(m,t,v)
        \/ \E m \in M, t \in Tenants, v \in {1,2}, k \in Kinds: Acquire(m,t,v,k)
        \/ \E m \in M, k \in Kinds: ReleaseUse(m,k)
        \/ \E m \in M: ReleaseProducer(m) \/ EndPage(m) \/ LeaseTick(m) \/ Expire(m) \/ DeleteIntent(m)
                          \/ PhysicalDelete(m) \/ Confirm(m) \/ StaleWrite(m) \/ Renew(m) \/ Reexecute(m)
        \/ RetryOrCrash
Spec == Init /\ [][Next]_vars
        /\ WF_vars(Tick)
        /\ \A m \in M: WF_vars(LeaseTick(m)) /\ WF_vars(Expire(m))
                         /\ WF_vars(DeleteIntent(m)) /\ WF_vars(PhysicalDelete(m)) /\ WF_vars(Confirm(m))
TypeOK == /\ now \in 0..3 /\ bytes \subseteq M \cup ExternalNative /\ native \subseteq M /\ program \subseteq M /\ producer \subseteq M
          /\ lease \in [M -> 0..2] /\ phase \in [M -> {"live","expired","fenced","done"}]
FixedDeadline == expires = ActivationExpiry
NoLateRead == \A m \in M: lastGrant[m].at < ActivationExpiry[m]
AuthorizedRead == \A m \in M: lastGrant[m].tenant = Owner(m) /\ lastGrant[m].version = Version(m)
ExternalNativeProtected == ExternalNative \subseteq bytes
IndependentUseProtected == native \cup program \cup producer \subseteq bytes
NoDeletionDuringRead == \A m \in M: lease[m] > 0 => m \in bytes
FenceClosed == \A m \in M: phase[m] \in {"fenced","done"} => NoIndependent(m) /\ lease[m] = 0
NoRevival == \A m \in M: phase[m] = "done" => m \notin bytes
EffectStable == effects = [m \in M |-> 1]
EventuallyReclaimed == \A m \in M: (<>[]NoIndependent(m)) => <>(phase[m] = "done")
=============================================================================
