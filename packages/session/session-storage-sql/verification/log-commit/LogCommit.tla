---------------------------- MODULE LogCommit ----------------------------
EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS ClientCount, ExecutionCount, OperationCount, MaxHead, MaxEvents,
          MaxAttempts, MaxCommits, Adversarial, Fault

Clients == 1..ClientCount
Executions == 1..ExecutionCount
Operations == 1..OperationCount

VARIABLES head, facts, indexHead, indexFacts, log, progress, records,
          client, transaction, uncertain, sawChanged, sawReplay, sawLate

vars == <<head, facts, indexHead, indexFacts, log, progress, records,
          client, transaction, uncertain, sawChanged, sawReplay, sawLate>>

EmptyTransaction == [owner |-> 0, stage |-> "none", entry |-> "none"]
EmptyClient == [phase |-> "idle", observation |-> "none", attempts |-> 0,
                response |-> 0, queriedPending |-> FALSE]

RECURSIVE Sum(_)
Sum(s) == IF s = <<>> THEN 0 ELSE Head(s) + Sum(Tail(s))
Root == Cardinality({i \in 1..Len(log) : log[i].applied}) + Sum(head)
Semantic(o) == <<o.execution, o.sequence>>
HasRecord(o) == records[o.operation].receipt # 0
CountOperation(op) == Cardinality({i \in 1..Len(log) : log[i].observation.operation = op})
CountFact(e, s) == Cardinality({i \in 1..Len(log) :
    /\ log[i].observation.execution = e
    /\ log[i].observation.sequence = s
    /\ log[i].applied})

Init ==
    /\ head = [e \in Executions |-> 0]
    /\ facts = [e \in Executions |-> <<>>]
    /\ indexHead = head
    /\ indexFacts = facts
    /\ log = <<>>
    /\ progress = [e \in Executions |-> 0]
    /\ records = [op \in Operations |-> [semantic |-> <<0, 0>>, receipt |-> 0]]
    /\ client = [c \in Clients |-> EmptyClient]
    /\ transaction = EmptyTransaction
    /\ uncertain = {}
    /\ sawChanged = FALSE
    /\ sawReplay = FALSE
    /\ sawLate = FALSE

PublishAgent(e, amount) ==
    /\ transaction.owner = 0
    /\ head[e] < MaxHead
    /\ amount \in 0..2
    /\ Len(facts[e]) + amount <= MaxEvents
    /\ LET nextFacts == facts[e] \o
               [i \in 1..amount |-> [revision |-> head[e] + 1,
                                     sequence |-> Len(facts[e]) + i]]
       IN /\ head' = [head EXCEPT ![e] = @ + 1]
          /\ facts' = [facts EXCEPT ![e] = nextFacts]
          /\ indexHead' = IF Fault = "split-agent" THEN indexHead
                          ELSE [indexHead EXCEPT ![e] = head[e] + 1]
          /\ indexFacts' = IF Fault = "split-agent" THEN indexFacts
                           ELSE [indexFacts EXCEPT ![e] = nextFacts]
    /\ UNCHANGED <<log, progress, records, client, transaction, uncertain,
                   sawChanged, sawReplay, sawLate>>

Observe(c, e, s, op, tenant, view, revision) ==
    /\ client[c].phase = "idle"
    /\ s \in 1..Len(facts[e])
    /\ tenant \in IF Adversarial THEN {"owner", "foreign"} ELSE {"owner"}
    /\ view \in IF Adversarial THEN {"trusted", "delegated"} ELSE {"trusted"}
    /\ revision \in IF Adversarial THEN 0..(head[e] + 1) ELSE {head[e]}
    /\ client' = [client EXCEPT ![c] =
         [@ EXCEPT !.phase = "ready",
          !.observation = [operation |-> op, execution |-> e, sequence |-> s,
                           revision |-> revision, root |-> Root,
                           tenant |-> tenant, view |-> view]]]
    /\ UNCHANGED <<head, facts, indexHead, indexFacts, log, progress, records,
                   transaction, uncertain, sawChanged, sawReplay, sawLate>>

Begin(c) ==
    /\ transaction.owner = 0
    /\ client[c].phase \in {"ready", "retry"}
    /\ client[c].attempts < MaxAttempts
    /\ client' = [client EXCEPT ![c].phase = "waiting", ![c].attempts = @ + 1]
    /\ transaction' = [owner |-> c, stage |-> "checking", entry |-> "none"]
    /\ UNCHANGED <<head, facts, indexHead, indexFacts, log, progress, records,
                   uncertain, sawChanged, sawReplay, sawLate>>

Judgment(o) ==
    IF (o.tenant # "owner" /\ Fault # "skip-tenant")
       \/ (o.view # "trusted" /\ Fault # "skip-view") THEN "denied"
    ELSE IF HasRecord(o) /\ Fault # "forget-operation"
         THEN IF records[o.operation].semantic = Semantic(o) THEN "recovered" ELSE "conflict"
    ELSE IF o.root # Root /\ Fault # "skip-root" THEN "changed"
    ELSE IF o.revision # indexHead[o.execution] /\ Fault # "skip-head" THEN "invalid"
    ELSE IF o.sequence > progress[o.execution] + 1 THEN "unavailable"
    ELSE "prepared"

Judge ==
    /\ transaction.stage = "checking"
    /\ LET c == transaction.owner
           o == client[c].observation
           result == Judgment(o)
           entry == [observation |-> o, actualHead |-> head[o.execution],
                     actualRoot |-> Root, before |-> progress[o.execution],
                     applied |-> o.sequence > progress[o.execution] \/ Fault = "replay-sequence",
                     receipt |-> Len(log) + 1]
       IN /\ transaction' = IF result = "prepared"
                THEN [transaction EXCEPT !.stage = "prepared", !.entry = entry]
                ELSE EmptyTransaction
          /\ client' = IF result = "prepared" THEN client
               ELSE [client EXCEPT ![c].phase = IF result = "recovered" THEN "done" ELSE result,
                    ![c].response = IF result = "recovered" THEN records[o.operation].receipt ELSE 0]
          /\ sawChanged' = (sawChanged \/ result = "changed")
    /\ UNCHANGED <<head, facts, indexHead, indexFacts, log, progress, records,
                   uncertain, sawReplay, sawLate>>

PublishSession ==
    /\ transaction.stage = "prepared"
    /\ Len(log) < MaxCommits
    /\ LET c == transaction.owner
           entry == transaction.entry
           o == entry.observation
           through == IF entry.applied THEN o.sequence ELSE progress[o.execution]
       IN /\ log' = Append(log, entry)
          /\ progress' = IF Fault = "split-session" THEN progress
                         ELSE [progress EXCEPT ![o.execution] = through]
          /\ records' = IF Fault = "split-session" THEN records
                        ELSE [records EXCEPT ![o.operation] =
                              [semantic |-> Semantic(o), receipt |-> entry.receipt]]
          /\ client' = [client EXCEPT ![c].response = entry.receipt]
          /\ sawReplay' = (sawReplay \/ ~entry.applied)
          /\ sawLate' = (sawLate \/ (client[c].phase = "unknown" /\ client[c].queriedPending))
    /\ transaction' = EmptyTransaction
    /\ UNCHANGED <<head, facts, indexHead, indexFacts, uncertain, sawChanged>>

Abort ==
    /\ transaction.stage \in {"checking", "prepared"}
    /\ LET c == transaction.owner
       IN client' = IF client[c].phase = "unknown" THEN client
                    ELSE [client EXCEPT ![c].phase = "retry"]
    /\ transaction' = EmptyTransaction
    /\ UNCHANGED <<head, facts, indexHead, indexFacts, log, progress, records,
                   uncertain, sawChanged, sawReplay, sawLate>>

LoseContact(c) ==
    /\ client[c].phase = "waiting"
    /\ client' = [client EXCEPT ![c].phase = "unknown"]
    /\ uncertain' = uncertain \cup {client[c].observation.operation}
    /\ UNCHANGED <<head, facts, indexHead, indexFacts, log, progress, records,
                   transaction, sawChanged, sawReplay, sawLate>>

Deliver(c) ==
    /\ client[c].phase = "waiting"
    /\ client[c].response # 0
    /\ client' = [client EXCEPT ![c].phase = "done"]
    /\ UNCHANGED <<head, facts, indexHead, indexFacts, log, progress, records,
                   transaction, uncertain, sawChanged, sawReplay, sawLate>>

Query(c) ==
    /\ client[c].phase = "unknown"
    /\ LET o == client[c].observation
       IN client' =
            IF o.tenant # "owner" \/ o.view # "trusted"
            THEN [client EXCEPT ![c].phase = "denied"]
            ELSE IF HasRecord(o) /\ Fault # "forget-operation"
            THEN [client EXCEPT ![c].phase = IF records[o.operation].semantic = Semantic(o)
                                            THEN "done" ELSE "conflict",
                                ![c].response = IF records[o.operation].semantic = Semantic(o)
                                                THEN records[o.operation].receipt ELSE 0]
            ELSE IF transaction.owner = c
                 THEN [client EXCEPT ![c].queriedPending = TRUE]
                 ELSE [client EXCEPT ![c].phase = "retry"]
    /\ UNCHANGED <<head, facts, indexHead, indexFacts, log, progress, records,
                   transaction, uncertain, sawChanged, sawReplay, sawLate>>

Refresh(c) ==
    /\ client[c].phase = "changed"
    /\ client' = [client EXCEPT ![c].phase = "ready",
                   ![c].observation.root = Root,
                   ![c].observation.revision = head[client[c].observation.execution]]
    /\ UNCHANGED <<head, facts, indexHead, indexFacts, log, progress, records,
                   transaction, uncertain, sawChanged, sawReplay, sawLate>>

Next ==
    \/ \E e \in Executions, amount \in 0..2 : PublishAgent(e, amount)
    \/ \E c \in Clients, e \in Executions, s \in 1..MaxEvents,
          op \in Operations, tenant \in {"owner", "foreign"},
          view \in {"trusted", "delegated"}, revision \in 0..(MaxHead + 1) :
          Observe(c, e, s, op, tenant, view, revision)
    \/ \E c \in Clients : Begin(c) \/ LoseContact(c) \/ Deliver(c) \/ Query(c) \/ Refresh(c)
    \/ Judge \/ PublishSession \/ Abort

TypeOK ==
    /\ head \in [Executions -> 0..MaxHead]
    /\ indexHead \in [Executions -> 0..MaxHead]
    /\ progress \in [Executions -> 0..MaxEvents]
    /\ uncertain \subseteq Operations
    /\ transaction.owner \in {0} \cup Clients
    /\ Len(log) <= MaxCommits
    /\ \A c \in Clients : client[c].attempts \in 0..MaxAttempts

AtMostOnce == \A op \in Operations : CountOperation(op) <= 1

AtomicVisibility ==
    /\ head = indexHead
    /\ facts = indexFacts
    /\ \A e \in Executions :
          progress[e] = Cardinality({s \in 1..MaxEvents : CountFact(e, s) > 0})
    /\ \A i \in 1..Len(log) :
          records[log[i].observation.operation].receipt # 0
    /\ \A op \in Operations : records[op].receipt # 0 =>
          \E i \in 1..Len(log) : /\ log[i].observation.operation = op
                                 /\ log[i].receipt = records[op].receipt

NoRepeatedEffects == \A e \in Executions, s \in 1..MaxEvents : CountFact(e, s) <= 1

RecoveryStable ==
    /\ \A op \in uncertain : CountOperation(op) <= 1
    /\ \A c \in Clients :
          (client[c].phase = "done" /\ client[c].observation.operation \in uncertain) =>
          \E i \in 1..Len(log) :
             /\ log[i].observation.operation = client[c].observation.operation
             /\ Semantic(log[i].observation) = Semantic(client[c].observation)
             /\ log[i].receipt = client[c].response

LegalCommit == \A i \in 1..Len(log) :
    /\ log[i].observation.tenant = "owner"
    /\ log[i].observation.view = "trusted"
    /\ log[i].observation.revision = log[i].actualHead
    /\ log[i].observation.root = log[i].actualRoot
    /\ log[i].observation.sequence <= log[i].before + 1

NoRecoveryWitness == ~\E c \in Clients :
    /\ client[c].phase = "done"
    /\ client[c].observation.operation \in uncertain
NoLateCommitWitness == ~sawLate
NoChangedWitness == ~sawChanged
NoReplayWitness == ~sawReplay
NoDistinctHeadWitness == ~\E e \in Executions :
    /\ Len(facts[e]) > 0
    /\ head[e] # Len(facts[e])

Spec == Init /\ [][Next]_vars
=============================================================================
