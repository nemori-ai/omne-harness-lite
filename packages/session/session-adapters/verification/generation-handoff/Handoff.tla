---------------------------- MODULE Handoff ----------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS Scenario, Fault, MaxStarts, None
Clients == {1, 2}
Decisions == {"prepared", "rejected"}

First == [tenant |-> "t1", session |-> "s1", execution |-> "e1",
          ki |-> "k1", h |-> "h1", request |-> "request1",
          origin |-> "origin1", subject |-> "subject1",
          qualification |-> "basis1", provider |-> "adoption1"]
SecondBase == [First EXCEPT !.origin = "origin2", !.subject = "subject2"]
Second == CASE Scenario = "same" -> SecondBase
    [] Scenario = "payload-conflict" -> [SecondBase EXCEPT !.request = "request2"]
    [] Scenario = "ki-rebind" -> [SecondBase EXCEPT !.h = "h2"]
    [] Scenario = "h-rebind" -> [SecondBase EXCEPT !.ki = "k2"]
    [] Scenario = "route-rebind" ->
        [SecondBase EXCEPT !.session = "s2", !.ki = "k2", !.h = "h2"]
    [] Scenario = "cross-tenant" -> [SecondBase EXCEPT !.tenant = "t2", !.session = "s2"]
    [] Scenario = "independent" ->
        [SecondBase EXCEPT !.execution = "e2", !.ki = "k2", !.h = "h2"]

Proposal(c) == IF c = 1 THEN First ELSE Second
Requests == {First, Second}
Ki(r) == <<r.tenant, r.execution, r.ki>>
H(r) == <<r.tenant, r.execution, r.h>>
Route(r) == [tenant |-> r.tenant, execution |-> r.execution, session |-> r.session]
Index(r) == [ki |-> Ki(r), h |-> H(r)]
Semantic(r) == <<Ki(r), H(r), r.session, r.request>>
Outcomes == [original : Requests, decision : Decisions]
Keys == {H(r) : r \in Requests}

VARIABLES running, mayCrash, phase, starts, original, pending,
          routes, intents, indexes, outcomes, replies, publications, recovered, beforeCrash
vars == <<running, mayCrash, phase, starts, original, pending,
          routes, intents, indexes, outcomes, replies, publications, recovered, beforeCrash>>
durable == <<routes, intents, indexes, outcomes, publications>>

Init ==
    /\ running = TRUE
    /\ mayCrash = TRUE
    /\ phase = [c \in Clients |-> "idle"]
    /\ starts = [c \in Clients |-> 0]
    /\ original = [c \in Clients |-> None]
    /\ pending = [c \in Clients |-> None]
    /\ routes = {}
    /\ intents = {}
    /\ indexes = {}
    /\ outcomes = {}
    /\ replies = {}
    /\ publications = [k \in Keys |-> 0]
    /\ recovered = FALSE
    /\ beforeCrash = {}

BindExecution(c) ==
    LET r == Proposal(c) IN
    /\ running
    /\ Route(r) \notin routes
    /\ Fault = "rebind-execution" \/
        ~\E q \in routes : q.tenant = r.tenant /\ q.execution = r.execution
    /\ routes' = routes \cup {Route(r)}
    /\ UNCHANGED <<running, mayCrash, phase, starts, original, pending,
                    intents, indexes, outcomes, replies, publications, recovered, beforeCrash>>

Start(c) ==
    /\ running /\ phase[c] = "idle" /\ starts[c] < MaxStarts
    /\ phase' = [phase EXCEPT ![c] = "started"]
    /\ starts' = [starts EXCEPT ![c] = @ + 1]
    /\ UNCHANGED <<running, mayCrash, original, pending, durable, replies, recovered, beforeCrash>>

Related(r) == {q \in intents : Ki(q) = Ki(r) \/ H(q) = H(r)}
Compatible(r) == \A q \in Related(r) : Semantic(q) = Semantic(r)

SaveIntent(c) ==
    LET r == Proposal(c)
        found == Related(r)
        accepted == Route(r) \in routes /\ (Fault = "rebind-handoff" \/ Compatible(r))
        saved == IF found = {} \/ ~Compatible(r) THEN r ELSE CHOOSE q \in found : TRUE
    IN
    /\ running /\ phase[c] = "started"
    /\ phase' = [phase EXCEPT ![c] = IF accepted THEN "intent" ELSE "done"]
    /\ original' = [original EXCEPT ![c] = IF accepted THEN saved ELSE None]
    /\ indexes' = IF accepted THEN indexes \cup {Index(saved)} ELSE indexes
    /\ intents' = IF accepted /\ Fault # "partial-record"
                  THEN intents \cup {saved} ELSE intents
    /\ UNCHANGED <<running, mayCrash, starts, pending, routes,
                    outcomes, replies, publications, recovered, beforeCrash>>

Compute(c, d) ==
    /\ running /\ phase[c] = "intent"
    /\ pending' = [pending EXCEPT ![c] = [original |-> original[c], decision |-> d]]
    /\ phase' = [phase EXCEPT ![c] = "computed"]
    /\ UNCHANGED <<running, mayCrash, starts, original, durable, replies, recovered, beforeCrash>>

Commit(c) ==
    LET r == original[c]
        prior == {o \in outcomes : H(o.original) = H(r)}
        value == IF prior = {} \/ Fault = "replace-result"
                 THEN pending[c] ELSE CHOOSE o \in prior : TRUE
        fresh == prior = {} \/ Fault = "repeat-admission"
    IN
    /\ running /\ phase[c] = "computed"
    /\ outcomes' = outcomes \cup {value}
    /\ publications' = IF fresh THEN [publications EXCEPT ![H(r)] = @ + 1]
                       ELSE publications
    /\ pending' = [pending EXCEPT ![c] = value]
    /\ phase' = [phase EXCEPT ![c] = "saved"]
    /\ UNCHANGED <<running, mayCrash, starts, original, routes,
                    intents, indexes, replies, recovered, beforeCrash>>

Reply(c) ==
    /\ running
    /\ phase[c] = "saved" \/ (Fault = "early-reply" /\ phase[c] = "computed")
    /\ replies' = replies \cup {pending[c]}
    /\ phase' = [phase EXCEPT ![c] = "done"]
    /\ UNCHANGED <<running, mayCrash, starts, original, pending, durable, recovered, beforeCrash>>

RetryOrLostReply(c) ==
    /\ running /\ phase[c] \in {"saved", "done"} /\ starts[c] < MaxStarts
    /\ phase' = [phase EXCEPT ![c] = "idle"]
    /\ original' = [original EXCEPT ![c] = None]
    /\ pending' = [pending EXCEPT ![c] = None]
    /\ UNCHANGED <<running, mayCrash, starts, durable, replies, recovered, beforeCrash>>

Crash ==
    /\ running /\ mayCrash
    /\ running' = FALSE /\ mayCrash' = FALSE
    /\ phase' = [c \in Clients |-> "idle"]
    /\ original' = [c \in Clients |-> None]
    /\ pending' = [c \in Clients |-> None]
    /\ beforeCrash' = outcomes
    /\ UNCHANGED <<starts, durable, replies, recovered>>

Restart ==
    /\ ~running
    /\ running' = TRUE
    /\ UNCHANGED <<mayCrash, phase, starts, original, pending, durable, replies, recovered, beforeCrash>>

Lookup(c) ==
    LET found == {o \in outcomes : Ki(o.original) = Ki(Proposal(c))} IN
    /\ running /\ found # {}
    /\ replies' = replies \cup found
    /\ recovered' = (recovered \/ (~mayCrash /\ found \cap beforeCrash # {}))
    /\ UNCHANGED <<running, mayCrash, phase, starts, original, pending, durable, beforeCrash>>

Next ==
    \/ \E c \in Clients : BindExecution(c) \/ Start(c) \/ SaveIntent(c) \/
                           Commit(c) \/ Reply(c) \/ RetryOrLostReply(c) \/ Lookup(c)
    \/ \E c \in Clients, d \in Decisions : Compute(c, d)
    \/ Crash \/ Restart

Spec == Init /\ [][Next]_vars

TypeOK ==
    /\ running \in BOOLEAN /\ mayCrash \in BOOLEAN /\ recovered \in BOOLEAN
    /\ phase \in [Clients -> {"idle", "started", "intent", "computed", "saved", "done"}]
    /\ starts \in [Clients -> 0..MaxStarts]
    /\ original \in [Clients -> Requests \cup {None}]
    /\ pending \in [Clients -> Outcomes \cup {None}]
    /\ routes \subseteq {Route(r) : r \in Requests}
    /\ intents \subseteq Requests
    /\ indexes \subseteq {Index(r) : r \in Requests}
    /\ outcomes \subseteq Outcomes /\ replies \subseteq Outcomes
    /\ beforeCrash \subseteq Outcomes
    /\ publications \in [Keys -> 0..(2 * MaxStarts)]

AtomicRecord ==
    /\ indexes = {Index(r) : r \in intents}
    /\ \A o \in outcomes : o.original \in intents
ReplyIsDurable == replies \subseteq outcomes
RestartRetainsReplies == ~mayCrash /\ running => replies \subseteq outcomes
UniqueHandoff ==
    \A a, b \in intents : (Ki(a) = Ki(b) \/ H(a) = H(b)) => a = b
UniqueExecutionRoute ==
    /\ \A a, b \in routes :
        (a.tenant = b.tenant /\ a.execution = b.execution) => a.session = b.session
    /\ \A r \in intents : Route(r) \in routes
OriginalResult ==
    \A a, b \in outcomes \cup replies : H(a.original) = H(b.original) => a = b
AtMostOneAdmission == \A k \in Keys : publications[k] <= 1
NoRecoveredResult == ~recovered
=======================================================================
