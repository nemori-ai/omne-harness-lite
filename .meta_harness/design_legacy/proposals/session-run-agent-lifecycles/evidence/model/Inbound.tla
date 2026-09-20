---------------------------- MODULE Inbound ----------------------------
(* Session Inbound: arrival lifecycle, intent routing (SE-12..18) and its
   interaction with the Session lifecycle (SE-02), the queue (SE-04/06) and
   an abstract Run.  Bounded evidence for capability.session v1.

   Sources are collapsed to three classes:
     "call"  = internal fact sources (call_settlement / human_answer /
               provisional_outcome / gate_restored): refs may name a run
               position; never refused for capacity; accepted while archived
               and then closed (D2 column).
     "ctx"   = external passive sources (connector_passive): intent context.
     "usr"   = external queue sources (user_text / schedule_due / ...):
               intent queue.
   The Run is abstract: none | running | waiting | interrupted | terminal |
   cancelled.  "waiting" means the Run waits at the single modelled position.
*)
EXTENDS Naturals, FiniteSets

CONSTANTS Arrivals, Keys, Cap, MaxQueue

Sources == {"call", "ctx", "usr"}
Refs == {"pos", "none"}
States == {"none", "accepted", "classified", "consumed", "converted",
           "closed", "withdrawn"}
Intents == {"none", "queue", "continuation", "context"}
RunStates == {"none", "running", "waiting", "interrupted", "terminal",
              "cancelled"}
Active == {"running", "waiting", "interrupted"}

VARIABLES sess, run, arr, intent, key, src, refs, queue, wm
vars == <<sess, run, arr, intent, key, src, refs, queue, wm>>

Live(a) == arr[a] \in {"accepted", "classified"}
External(a) == src[a] \in {"ctx", "usr"}
Pending == {a \in Arrivals : arr[a] = "accepted"}
ExternalLive == {a \in Arrivals : Live(a) /\ External(a)}
Continuations == {a \in Arrivals : arr[a] = "classified" /\ intent[a] = "continuation"}
Contexts == {a \in Arrivals : arr[a] = "classified" /\ intent[a] = "context"}

Init ==
  /\ sess = "open"
  /\ run = "none"
  /\ arr = [a \in Arrivals |-> "none"]
  /\ intent = [a \in Arrivals |-> "none"]
  /\ key \in [Arrivals -> Keys]
  /\ src \in [Arrivals -> Sources]
  /\ refs \in [Arrivals -> Refs]
  /\ queue = 0
  /\ wm = 0

(* ---- SE-12 / SE-16: acceptance with dedup and capacity ---- *)
Accept(a) ==
  /\ arr[a] = "none"
  /\ sess /= "deleted"
  /\ External(a) => sess = "open"
  /\ \A b \in Arrivals : (b /= a /\ arr[b] /= "none") => key[b] /= key[a]
  /\ IF External(a) /\ Cardinality(ExternalLive) >= Cap
       THEN arr' = [arr EXCEPT ![a] = "closed"]      \* refused_capacity
       ELSE arr' = [arr EXCEPT ![a] = "accepted"]
  /\ UNCHANGED <<sess, run, intent, key, src, refs, queue, wm>>

(* ---- SE-14: the decision table, one short commit per arrival ---- *)
Decide(a) ==
  IF sess = "archived" THEN "closed"
  ELSE IF src[a] = "ctx" THEN "context"
  ELSE IF src[a] = "usr" THEN "queue"
  ELSE \* call-like internal fact
    IF refs[a] = "none" THEN "queue"
    ELSE IF run \in {"waiting", "interrupted"} THEN "continuation"   \* A
    ELSE IF run = "running" THEN "context"                           \* B
    ELSE IF run \in {"none", "terminal"} THEN "queue"                \* C
    ELSE "closed"                                                     \* D1

Classify(a) ==
  /\ arr[a] = "accepted"
  /\ LET d == Decide(a) IN
     /\ IF d = "closed"
          THEN /\ arr' = [arr EXCEPT ![a] = "closed"]
               /\ UNCHANGED <<intent, queue, wm>>
          ELSE /\ arr' = [arr EXCEPT ![a] = "classified"]
               /\ intent' = [intent EXCEPT ![a] = d]
               /\ queue' = IF d = "queue" THEN queue + 1 ELSE queue
               /\ wm' = IF d = "context" THEN wm + 1 ELSE wm
  /\ queue' <= MaxQueue
  /\ UNCHANGED <<sess, run, key, src, refs>>

(* ---- consumption: continuation by the waiting Run, context by a Step ---- *)
Consume(a) ==
  /\ a \in Continuations
  /\ run = "waiting"
  /\ arr' = [arr EXCEPT ![a] = "consumed"]
  /\ run' = "running"
  /\ UNCHANGED <<sess, intent, key, src, refs, queue, wm>>

OpenStep ==
  /\ run = "running"
  /\ Contexts /= {}
  /\ arr' = [b \in Arrivals |-> IF b \in Contexts THEN "consumed" ELSE arr[b]]
  /\ UNCHANGED <<sess, run, intent, key, src, refs, queue, wm>>

Withdraw(a) ==
  /\ Live(a) /\ External(a)
  /\ arr' = [arr EXCEPT ![a] = "withdrawn"]
  /\ queue' = IF arr[a] = "classified" /\ intent[a] = "queue" /\ queue > 0
                THEN queue - 1 ELSE queue
  /\ UNCHANGED <<sess, run, intent, key, src, refs, wm>>

(* ---- SE-06/15/18: scheduling only after adjudication is complete ---- *)
StartRun ==
  /\ sess = "open" /\ run = "none" /\ queue > 0
  /\ Pending = {}
  /\ run' = "running" /\ queue' = queue - 1
  /\ UNCHANGED <<sess, arr, intent, key, src, refs, wm>>

Wait ==
  /\ run = "running"
  /\ run' = "waiting"
  /\ UNCHANGED <<sess, arr, intent, key, src, refs, queue, wm>>

Interrupt ==
  /\ run \in {"running", "waiting"}
  /\ run' = "interrupted"
  /\ UNCHANGED <<sess, arr, intent, key, src, refs, queue, wm>>

Resume ==
  /\ run = "interrupted" /\ sess = "open" /\ Pending = {}
  /\ run' = IF Continuations /= {} THEN "waiting" ELSE "running"
  /\ UNCHANGED <<sess, arr, intent, key, src, refs, queue, wm>>

(* ---- SE-17 / LC-04 row 4: settlement converts or closes continuations ---- *)
Settle(to) ==
  /\ run \in Active
  /\ to \in {"terminal", "cancelled"}
  /\ to = "terminal" => (run = "running" \/ Continuations = {})
  /\ run' = to
  /\ arr' = [b \in Arrivals |-> IF b \in Continuations
                                  THEN (IF to = "terminal" THEN "converted" ELSE "closed")
                                  ELSE arr[b]]
  /\ queue' = IF to = "terminal" THEN queue + Cardinality(Continuations) ELSE queue
  /\ queue' <= MaxQueue
  /\ UNCHANGED <<sess, intent, key, src, refs, wm>>

Clear ==
  /\ run \in {"terminal", "cancelled"}
  /\ run' = "none"
  /\ UNCHANGED <<sess, arr, intent, key, src, refs, queue, wm>>

(* ---- SE-02 / LC-04 row 1: archive closes unconsumed arrivals and queue ---- *)
Archive ==
  /\ sess = "open"
  /\ run \in {"none", "terminal", "cancelled"}
  /\ sess' = "archived"
  /\ arr' = [b \in Arrivals |-> IF Live(b) THEN "closed" ELSE arr[b]]
  /\ queue' = 0
  /\ UNCHANGED <<run, intent, key, src, refs, wm>>

Restore ==
  /\ sess = "archived"
  /\ sess' = "open"
  /\ UNCHANGED <<run, arr, intent, key, src, refs, queue, wm>>

Delete ==
  /\ sess \in {"open", "archived"}
  /\ run \in {"none", "terminal", "cancelled"}
  /\ sess' = "deleted"
  /\ arr' = [b \in Arrivals |-> IF Live(b) THEN "closed" ELSE arr[b]]
  /\ queue' = 0
  /\ UNCHANGED <<run, intent, key, src, refs, wm>>

Done == sess = "deleted" /\ UNCHANGED vars

Next ==
  \/ \E a \in Arrivals : Accept(a) \/ Classify(a) \/ Consume(a) \/ Withdraw(a)
  \/ OpenStep \/ StartRun \/ Wait \/ Interrupt \/ Resume
  \/ Settle("terminal") \/ Settle("cancelled") \/ Clear
  \/ Archive \/ Restore \/ Delete \/ Done

Spec == Init /\ [][Next]_vars

SpecFair ==
  /\ Spec
  /\ \A a \in Arrivals : WF_vars(Classify(a)) /\ WF_vars(Consume(a))
  /\ WF_vars(OpenStep) /\ WF_vars(StartRun) /\ WF_vars(Wait)

(* ---- properties ---- *)
TypeOK ==
  /\ sess \in {"open", "archived", "deleted"}
  /\ run \in RunStates
  /\ arr \in [Arrivals -> States]
  /\ intent \in [Arrivals -> Intents]
  /\ queue \in 0..MaxQueue
  /\ wm \in 0..Cardinality(Arrivals)

\* SE-12: one arrival per dedup key, across every non-empty state
Dedup == \A a, b \in Arrivals :
  (a /= b /\ arr[a] /= "none" /\ arr[b] /= "none") => key[a] /= key[b]

\* SE-16: bounded unconsumed external arrivals
Capacity == Cardinality(ExternalLive) <= Cap

\* I-14 (SE-17): no unconsumed continuation survives a terminal Run
NoStaleContinuation == run \in {"none", "terminal", "cancelled"} => Continuations = {}

\* SE-02 / LC-04 row 1: an archived or deleted Session holds no live classified arrival
ArchiveClean == sess /= "open" => {a \in Arrivals : arr[a] = "classified"} = {}

\* SE-14: continuation only when the Run is non-terminal at classification;
\* every arrival is classified exactly once (intent is written once)
ClassifyRule == [][\A a \in Arrivals :
  (arr[a] = "accepted" /\ arr'[a] = "classified" /\ intent'[a] = "continuation")
     => run \in {"waiting", "interrupted"}]_vars
IntentOnce == [][\A a \in Arrivals :
  intent'[a] /= intent[a] => (arr[a] = "accepted" /\ arr'[a] = "classified")]_vars

\* SE-18: a Run never starts or resumes while an arrival is still unadjudicated
ScanBeforeDrive == [][(run' /= run /\ run' \in {"running", "waiting"} /\ run \in {"none", "interrupted"})
  => Pending = {}]_vars

\* progress
EveryArrivalAdjudicated == \A a \in Arrivals : (arr[a] = "accepted") ~> (arr[a] /= "accepted")
ContinuationsResolve == \A a \in Arrivals :
  (arr[a] = "classified" /\ intent[a] = "continuation")
    ~> (arr[a] \in {"consumed", "converted", "closed", "withdrawn"} \/ run = "interrupted")
\* a non-empty queue on an open idle Session eventually starts a Run, unless the
\* queue is emptied by withdrawal or the Session leaves open
QueueStarts == (queue > 0 /\ sess = "open" /\ run = "none")
  ~> (run /= "none" \/ sess /= "open" \/ queue = 0)
=============================================================================
