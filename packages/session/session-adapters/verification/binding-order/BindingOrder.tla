---------------------------- MODULE BindingOrder ----------------------------
(* The journal interpretation (AD-02) and the tool log consumption (AD-06) of one
   execution, each in its own order, and the bindings that join them.

   The Agent records two streams. Its events, in their sequence; the first event that
   names a call registers it, and the session learns the binding from it. Its received
   entries, in their position: the deliveries of each call in the order the Tool pushed
   them. The Agent loop runs one step at a time:
   - A2 asks the Tool to start a call; the Tool may deliver at once, before the Agent
     records the association;
   - T1 processes, in one commit, the return delivery (a placeholder or a result) of every
     started call that has one, in the order of the actions;
   - W0, when nothing is received, writes a waiting event that names the open calls;
   - T5 hands a processed result to the Session, which needs the binding of the call.

   AD-02 interprets the events in their sequence. An event that processes a delivery comes
   after it: while that delivery is not consumed, AD-02 commits the bindings of the event
   only and stays. AD-06 consumes the entries in their position and stops at an entry whose
   call the session has not bound.

   A goes to the background: its placeholder returns, its result follows. B returns its
   result after an account delivery. Calls start in the order A, B.

   NamedAtAssociation: the commit that records the association also writes an event that
   names the call. FALSE, the call is named by the next waiting event or by its processing.
   AwaitsProcessed: a processing waits for the delivery it processes. FALSE, it waits for
   every delivery of its call not consumed yet. Only both TRUE keep the streams from waiting
   on each other for ever (EventuallyDone). WaitsForDelivery FALSE is the negative control of
   NoOvertaking: a processing is interpreted without waiting. *)
EXTENDS Naturals, Sequences

CONSTANTS NamedAtAssociation, AwaitsProcessed, WaitsForDelivery

Calls == <<"A", "B">>
CallSet == {"A", "B"}
\* The deliveries of each call, in the order the Tool pushes them, and the one that returns.
Deliveries == [c \in CallSet |-> IF c = "A" THEN <<"placeholder", "result">> ELSE <<"account", "result">>]
Return == [c \in CallSet |-> IF c = "A" THEN 1 ELSE 2]

VARIABLES
  started,     \* [CallSet -> BOOLEAN]: the Tool accepted the call
  associated,  \* [CallSet -> BOOLEAN]: the Agent recorded the association
  delivered,   \* [CallSet -> Nat]: deliveries pushed so far
  entries,     \* Seq([call: CallSet, at: Nat]): the received entries, in their position
  events,      \* Seq([kind: {"name", "proc"}, call: CallSet]): the Agent events
  processed,   \* [CallSet -> BOOLEAN]: T1 wrote the processing of the return delivery
  handing,     \* SUBSET CallSet: results T5 still hands over
  ip,          \* events interpreted through
  cp,          \* entries consumed through
  bound,       \* [CallSet -> BOOLEAN]: the session holds the binding of the call
  overtaken    \* a processing was interpreted before its delivery was consumed

vars == <<started, associated, delivered, entries, events, processed, handing, ip, cp, bound, overtaken>>

Named(c) == \E i \in 1..Len(events) : events[i].call = c
Busy == \E c \in CallSet : started[c] /\ ~associated[c]
Idle == ~Busy /\ handing = {}
Returned(c) == delivered[c] >= Return[c]
Received == {c \in CallSet : associated[c] /\ Returned(c) /\ ~processed[c]}
Unconsumed(c, upTo) == \E j \in (cp + 1)..Len(entries) : entries[j].call = c /\ entries[j].at <= upTo

Init ==
  /\ started = [c \in CallSet |-> FALSE]
  /\ associated = [c \in CallSet |-> FALSE]
  /\ delivered = [c \in CallSet |-> 0]
  /\ entries = <<>>
  /\ events = <<>>
  /\ processed = [c \in CallSet |-> FALSE]
  /\ handing = {}
  /\ ip = 0
  /\ cp = 0
  /\ bound = [c \in CallSet |-> FALSE]
  /\ overtaken = FALSE

Start(c) ==
  /\ Idle
  /\ ~started[c]
  /\ c = "B" => started["A"]
  /\ started' = [started EXCEPT ![c] = TRUE]
  /\ UNCHANGED <<associated, delivered, entries, events, processed, handing, ip, cp, bound, overtaken>>

Associate(c) ==
  /\ started[c] /\ ~associated[c]
  /\ associated' = [associated EXCEPT ![c] = TRUE]
  /\ events' = IF NamedAtAssociation THEN Append(events, [kind |-> "name", call |-> c]) ELSE events
  /\ UNCHANGED <<started, delivered, entries, processed, handing, ip, cp, bound, overtaken>>

Deliver(c) ==
  /\ started[c]
  /\ delivered[c] < Len(Deliveries[c])
  /\ delivered' = [delivered EXCEPT ![c] = @ + 1]
  /\ entries' = Append(entries, [call |-> c, at |-> delivered[c] + 1])
  /\ UNCHANGED <<started, associated, events, processed, handing, ip, cp, bound, overtaken>>

\* T1: one commit, the processing events in the order of the actions.
Process ==
  /\ Idle
  /\ Received # {}
  /\ LET order == SelectSeq(Calls, LAMBDA c : c \in Received)
     IN events' = events \o [i \in 1..Len(order) |-> [kind |-> "proc", call |-> order[i]]]
  /\ processed' = [c \in CallSet |-> processed[c] \/ c \in Received]
  /\ handing' = Received
  /\ UNCHANGED <<started, associated, delivered, entries, ip, cp, bound, overtaken>>

\* W0: nothing received; the waiting event names the open calls not named yet.
Wait ==
  /\ Idle
  /\ Received = {}
  /\ \E c \in CallSet : associated[c] /\ ~processed[c] /\ ~Named(c)
  /\ LET order == SelectSeq(Calls, LAMBDA c : associated[c] /\ ~processed[c] /\ ~Named(c))
     IN events' = events \o [i \in 1..Len(order) |-> [kind |-> "name", call |-> order[i]]]
  /\ UNCHANGED <<started, associated, delivered, entries, processed, handing, ip, cp, bound, overtaken>>

HandOver(c) ==
  /\ c \in handing
  /\ bound[c]
  /\ handing' = handing \ {c}
  /\ UNCHANGED <<started, associated, delivered, entries, events, processed, ip, cp, bound, overtaken>>

Interpret ==
  /\ ip < Len(events)
  /\ LET e == events[ip + 1]
         upTo == IF AwaitsProcessed THEN Return[e.call] ELSE Len(Deliveries[e.call])
         stays == WaitsForDelivery /\ e.kind = "proc" /\ Unconsumed(e.call, upTo)
     IN /\ IF stays
              THEN /\ ~bound[e.call]
                   /\ UNCHANGED <<ip, overtaken>>
              ELSE /\ ip' = ip + 1
                   /\ overtaken' = (overtaken \/ (e.kind = "proc" /\ Unconsumed(e.call, Return[e.call])))
        /\ bound' = [bound EXCEPT ![e.call] = TRUE]
  /\ UNCHANGED <<started, associated, delivered, entries, events, processed, handing, cp>>

Consume ==
  /\ cp < Len(entries)
  /\ bound[entries[cp + 1].call]
  /\ cp' = cp + 1
  /\ UNCHANGED <<started, associated, delivered, entries, events, processed, handing, ip, bound, overtaken>>

Done ==
  /\ \A c \in CallSet : delivered[c] = Len(Deliveries[c]) /\ processed[c]
  /\ handing = {}
  /\ ip = Len(events)
  /\ cp = Len(entries)

Next ==
  \/ \E c \in CallSet : Start(c) \/ Associate(c) \/ Deliver(c) \/ HandOver(c)
  \/ Process \/ Wait \/ Interpret \/ Consume

\* Every step that can be taken is taken in the end; a state with no step left is final.
Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

\* An event that processes a delivery is interpreted after that delivery is written.
NoOvertaking == ~overtaken

\* Both calls are processed, handed over, interpreted and consumed: nothing waits for ever.
EventuallyDone == <>Done
=============================================================================
