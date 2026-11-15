-------------------- MODULE CalendarScheduleBoundary --------------------
EXTENDS Naturals, Sequences, FiniteSets, TLC
CONSTANTS Follow, Latest, Mutation, NoBasis
Tenants == {"ownerA", "ownerB"}
Calendars == {"C1", "C2"}
Requester == "ownerA"
None == "none"
VARIABLES env, pub, authorized, active, basis, jobs, response
vars == <<env, pub, authorized, active, basis, jobs, response>>
CalendarAt(r) == IF r = 1 THEN "C1" ELSE "C2"
Selected(o) == IF Follow THEN CalendarAt(env[o]) ELSE "C1"
BasisSet == [owner : Tenants, revision : 1..2, calendar : Calendars, generation : 1..2]
JobSet == [basis : BasisSet, original : BasisSet, envAt : 1..2,
           genAt : 1..2, authorizedAt : BOOLEAN, activeAt : BOOLEAN]
Init == /\ env = [t \in Tenants |-> 1]
        /\ pub = [c \in Calendars |-> 1]
        /\ authorized = TRUE /\ active = TRUE
        /\ basis = NoBasis /\ jobs = <<>> /\ response = None
Observe(o) ==
    /\ basis' = [owner |-> o, revision |-> env[o], calendar |-> Selected(o),
                 generation |-> IF Latest THEN pub[Selected(o)] ELSE IF Mutation = "pinned" THEN 2 ELSE 1]
    /\ UNCHANGED <<env, pub, authorized, active, jobs, response>>
ChangeEnvironment(o) ==
    /\ env[o] = 1 /\ env' = [env EXCEPT ![o] = 2]
    /\ UNCHANGED <<pub, authorized, active, basis, jobs, response>>
Publish(c) ==
    /\ pub[c] = 1 /\ pub' = [pub EXCEPT ![c] = 2]
    /\ UNCHANGED <<env, authorized, active, basis, jobs, response>>
Revoke == /\ authorized /\ authorized' = FALSE
          /\ UNCHANGED <<env, pub, active, basis, jobs, response>>
Cancel == /\ active /\ active' = FALSE
          /\ UNCHANGED <<env, pub, authorized, basis, jobs, response>>
Guard == /\ basis # NoBasis
         /\ (Mutation = "owner" \/ basis.owner = Requester)
         /\ (Mutation = "environment" \/ ~Follow \/ basis.revision = env[Requester])
         /\ (Mutation = "publication" \/ ~Latest \/ basis.generation = pub[basis.calendar])
         /\ (Mutation = "authority" \/ authorized)
         /\ (Mutation = "control" \/ active)
Accept(ack) ==
    /\ Guard
    /\ (IF Mutation = "dedupe" THEN Len(jobs) < 2 ELSE Len(jobs) = 0)
    /\ jobs' = Append(jobs, [basis |-> basis, original |-> basis,
                            envAt |-> env[Requester], genAt |-> pub[basis.calendar],
                            authorizedAt |-> authorized, activeAt |-> active])
    /\ response' = ack
    /\ UNCHANGED <<env, pub, authorized, active, basis>>
RecoverOriginal ==
    /\ Len(jobs) > 0 /\ response # "committed"
    /\ response' = "committed"
    /\ UNCHANGED <<env, pub, authorized, active, basis, jobs>>
RetryOriginal ==
    /\ Len(jobs) > 0
    /\ response' = "committed"
    /\ UNCHANGED <<env, pub, authorized, active, basis, jobs>>
RewriteFrozen ==
    /\ Mutation = "freeze" /\ Len(jobs) = 1
    /\ jobs' = [jobs EXCEPT ![1].basis.generation = 3 - @]
    /\ UNCHANGED <<env, pub, authorized, active, basis, response>>
Next == \/ \E o \in Tenants : Observe(o) \/ ChangeEnvironment(o)
        \/ \E c \in Calendars : Publish(c)
        \/ Revoke \/ Cancel
        \/ \E ack \in {"committed", "unknown"} : Accept(ack)
        \/ RecoverOriginal \/ RetryOriginal \/ RewriteFrozen
Spec == Init /\ [][Next]_vars
TypeOK == /\ env \in [Tenants -> 1..2] /\ pub \in [Calendars -> 1..2]
          /\ authorized \in BOOLEAN /\ active \in BOOLEAN
          /\ basis \in BasisSet \cup {NoBasis}
          /\ jobs \in Seq(JobSet) /\ Len(jobs) <= 2
          /\ response \in {None, "committed", "unknown"}
TenantIsolation == \A n \in 1..Len(jobs) : jobs[n].basis.owner = Requester
EnvironmentCoherence == \A n \in 1..Len(jobs) :
    ~Follow \/ (jobs[n].basis.revision = jobs[n].envAt /\
                jobs[n].basis.calendar = CalendarAt(jobs[n].envAt))
LatestAtAcceptance == \A n \in 1..Len(jobs) :
    ~Latest \/ jobs[n].basis.generation = jobs[n].genAt
PinnedVersionIdentity == \A n \in 1..Len(jobs) :
    Latest \/ jobs[n].basis.generation = 1
AuthorityAtAcceptance == \A n \in 1..Len(jobs) : jobs[n].authorizedAt
ControlAtAcceptance == \A n \in 1..Len(jobs) : jobs[n].activeAt
AtMostOneJob == Len(jobs) <= 1
FrozenBasis == \A n \in 1..Len(jobs) : jobs[n].basis = jobs[n].original
NoFalseReceipt == response = "committed" => Len(jobs) > 0
=============================================================================
