---- MODULE StagingKey ----
\* agent-context staging table under the system invariants (#1143).
\* Environment (owned elsewhere, assumed here):
\*   SW-I05  a Session has at most one unfinished Run (session-contract SPEC line 48).
\*   AG-2    an execution has at most one unrecorded preparation in flight (agent-contract SPEC 737-739).
\*   Tenant  is an isolation domain only; no invariant makes it an exclusion domain.
\*   Model   imposes no exclusion on requests.
\* Composed, a Session has at most one effective model-request preparation in flight.
\* Copy 1 of a call is the invariant-respecting caller; copy 2 is a duplicate of a call in flight.
EXTENDS Naturals
CONSTANTS Tenants, Sessions, Runs, Steps, Purposes, KeyMode, NONE

Calls == [tenant: Tenants, session: Sessions, run: Runs, step: Steps, purpose: Purposes]
Attempts == Calls \X {1, 2}
Exec(c) == <<c.tenant, c.session, c.run>>

Candidate(c) == <<"step", c.step, "main">>
Position(c) == <<Exec(c), c.step>>

Key(c) == CASE KeyMode = "tenant_candidate" -> <<c.tenant, Candidate(c)>>
            [] KeyMode = "call_identity" -> <<c.tenant, c.purpose, Position(c), Candidate(c)>>
Keys == {Key(c) : c \in Calls}

VARIABLES table, pc, cause, got, active, started
vars == <<table, pc, cause, got, active, started>>
InFlight(a) == pc[a] \in {"staged", "read"}

Init == /\ table = [k \in Keys |-> NONE]
        /\ pc = [a \in Attempts |-> "idle"]
        /\ cause = [a \in Attempts |-> NONE]
        /\ got = [a \in Attempts |-> NONE]
        /\ active = [s \in Tenants \X Sessions |-> NONE]
        /\ started = {}

StartRun(t, s, r) == /\ active[<<t, s>>] = NONE
                     /\ <<t, s, r>> \notin started
                     /\ active' = [active EXCEPT ![<<t, s>>] = r]
                     /\ started' = started \cup {<<t, s, r>>}
                     /\ UNCHANGED <<table, pc, cause, got>>

FinishRun(t, s) == /\ active[<<t, s>>] # NONE
                   /\ \A a \in Attempts : Exec(a[1]) = <<t, s, active[<<t, s>>]>> => ~InFlight(a)
                   /\ active' = [active EXCEPT ![<<t, s>>] = NONE]
                   /\ UNCHANGED <<table, pc, cause, got, started>>

StageEffect(a) == LET k == Key(a[1]) IN
    IF table[k] = NONE
    THEN /\ table' = [table EXCEPT ![k] = a]
         /\ pc' = [pc EXCEPT ![a] = "staged"]
         /\ UNCHANGED <<cause, got, active, started>>
    ELSE /\ pc' = [pc EXCEPT ![a] = "busy"]
         /\ cause' = [cause EXCEPT ![a] = table[k]]
         /\ UNCHANGED <<table, got, active, started>>

Prepare(a) == /\ a[2] = 1
              /\ pc[a] = "idle"
              /\ active[<<a[1].tenant, a[1].session>>] = a[1].run
              /\ \A b \in Attempts : (b[2] = 1 /\ Exec(b[1]) = Exec(a[1])) => ~InFlight(b)
              /\ StageEffect(a)

Duplicate(a) == /\ a[2] = 2
                /\ pc[a] = "idle"
                /\ InFlight(<<a[1], 1>>)
                /\ StageEffect(a)

Read(a) == /\ pc[a] = "staged"
           /\ got' = [got EXCEPT ![a] = table[Key(a[1])]]
           /\ pc' = [pc EXCEPT ![a] = "read"]
           /\ UNCHANGED <<table, cause, active, started>>

Finish(a) == /\ pc[a] = "read"
             /\ table' = [table EXCEPT ![Key(a[1])] = NONE]
             /\ pc' = [pc EXCEPT ![a] = "done"]
             /\ UNCHANGED <<cause, got, active, started>>

Next == \/ \E t \in Tenants, s \in Sessions, r \in Runs : StartRun(t, s, r)
        \/ \E t \in Tenants, s \in Sessions : FinishRun(t, s)
        \/ \E a \in Attempts : Prepare(a) \/ Duplicate(a) \/ Read(a) \/ Finish(a)
        \/ UNCHANGED vars  \* idling; this model checks safety only
Spec == Init /\ [][Next]_vars

\* Environment check: the composed invariant the user named holds in this environment.
OneEffectivePerSession == \A a, b \in Attempts :
    (a # b /\ a[2] = 1 /\ b[2] = 1 /\ a[1].tenant = b[1].tenant /\ a[1].session = b[1].session
       /\ InFlight(a)) => ~InFlight(b)
\* The table may exclude only inside a domain an invariant authorizes: one execution.
ExclusionWithinAuthorizedDomain == \A c, d \in Calls : Key(c) = Key(d) => Exec(c) = Exec(d)
\* A caller that respects SW-I05 and AG-2 is never refused.
NoBusyForInvariantRespectingCaller == \A a \in Attempts : a[2] = 1 => pc[a] # "busy"
\* A duplicate of a call in flight is always refused (#1143 C2).
DuplicateRefused == \A a \in Attempts : (a[2] = 2 /\ pc[a] # "idle") => pc[a] = "busy"
\* The group reader returns the values this attempt staged.
ReadsOwnInput == \A a \in Attempts : got[a] # NONE => got[a] = a
\* No key is shared across tenants.
NoCrossTenantKey == \A c, d \in Calls : Key(c) = Key(d) => c.tenant = d.tenant
\* The owner's call identity: the key separates exactly the distinct calls.
KeyIsCallIdentity == \A c, d \in Calls : (Key(c) = Key(d)) <=> (c = d)
====
