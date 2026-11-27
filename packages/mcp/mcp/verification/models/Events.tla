------------------------------- MODULE Events -------------------------------
(***************************************************************************)
(* One event subscription of @omne-harness/mcp: what omne asks of an       *)
(* endpoint for one event type and one set of arguments. The peer has an   *)
(* ordered feed 1..upstream; it may forget its oldest events (`base`), it  *)
(* may hand an event over again, it may end the subscription. omne keeps   *)
(* the subscription, its position and the events it received durably; the  *)
(* stream and the step of a half-done write are volatile and go when the   *)
(* process is lost.                                                         *)
(*                                                                         *)
(* The properties are I12, I13, I14 and I16 of the MCP SPEC. How an event  *)
(* reaches a model is not here: the consumer is a port.                    *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  MaxEvents,   \* events the peer produces
  Crashes,     \* process losses per behavior
  MaxSubs,     \* subscribers that may come
  Bugs         \* deliberate faults of a negative control; {} is the design

BugNames == {"cursor-first", "no-dedup", "silent-gap", "keep-stream"}
ASSUME Bugs \subseteq BugNames

VARIABLES
  upstream,    \* the peer's feed holds events 1..upstream
  base,        \* the peer can still replay events above base
  sub,         \* "none" | "receiving" | "waiting" | "terminated"
  subscribers, \* how many want this subscription
  start,       \* the position the subscription began at
  cursor,      \* durable position: every event up to it was dealt with
  copies,      \* durable: how many times each event was stored
  pending,     \* durable: stored events not yet taken by the consumer
  gaps,        \* durable: events omne recorded as skipped
  consumer,    \* what the consumer took, deduplicated by event id
  stream,      \* volatile: "closed" | "open"
  half,        \* volatile: an event whose position was written before the event (bug only)
  reported,    \* reports handed to the consumer
  crashes

vars == <<upstream, base, sub, subscribers, start, cursor, copies, pending, gaps, consumer,
          stream, half, reported, crashes>>

Ids == 1..MaxEvents

Init ==
  /\ upstream = 0 /\ base = 0 /\ sub = "none" /\ subscribers = 0 /\ start = 0 /\ cursor = 0
  /\ copies = [i \in Ids |-> 0] /\ pending = {} /\ gaps = {} /\ consumer = {}
  /\ stream = "closed" /\ half = 0 /\ reported = {} /\ crashes = 0

Produce ==
  /\ upstream < MaxEvents /\ upstream' = upstream + 1
  /\ UNCHANGED <<base, sub, subscribers, start, cursor, copies, pending, gaps, consumer,
                 stream, half, reported, crashes>>

\* The peer forgets its oldest events.
Forget ==
  /\ base < upstream /\ base' \in (base + 1)..upstream
  /\ UNCHANGED <<upstream, sub, subscribers, start, cursor, copies, pending, gaps, consumer,
                 stream, half, reported, crashes>>

\* A subscriber comes. The first one makes the subscription; it starts from now.
Subscribe ==
  /\ subscribers < MaxSubs /\ subscribers' = subscribers + 1
  /\ IF sub = "none"
     THEN sub' = "receiving" /\ start' = upstream /\ cursor' = upstream
     ELSE UNCHANGED <<sub, start, cursor>>
  /\ UNCHANGED <<upstream, base, copies, pending, gaps, consumer, stream, half, reported,
                 crashes>>

\* The last subscriber goes: the stream closes and the subscription is removed.
Unsubscribe ==
  /\ subscribers > 0 /\ subscribers' = subscribers - 1
  /\ IF subscribers = 1
     THEN /\ sub' = "none" /\ pending' = {} /\ half' = 0
          /\ stream' = IF "keep-stream" \in Bugs THEN stream ELSE "closed"
     ELSE UNCHANGED <<sub, pending, half, stream>>
  /\ UNCHANGED <<upstream, base, start, cursor, copies, gaps, consumer, reported, crashes>>

\* The stream opens with the stored position. A position the peer cannot serve is a gap:
\* the skipped events are recorded and reported in the commit that moves the position.
Open ==
  /\ sub = "receiving" /\ stream = "closed" /\ half = 0
  /\ stream' = "open"
  /\ IF cursor < base
     THEN /\ cursor' = base
          /\ IF "silent-gap" \in Bugs
             THEN UNCHANGED <<gaps, reported>>
             ELSE /\ gaps' = gaps \cup ((cursor + 1)..base)
                  /\ reported' = reported \cup {"gap"}
     ELSE UNCHANGED <<cursor, gaps, reported>>
  /\ UNCHANGED <<upstream, base, sub, subscribers, start, copies, pending, consumer, half,
                 crashes>>

\* The next event arrives. Storing it and moving the position are one commit.
Receive ==
  /\ sub = "receiving" /\ stream = "open" /\ half = 0
  /\ cursor < upstream /\ cursor >= base
  /\ LET id == cursor + 1 IN
     IF "cursor-first" \in Bugs
     THEN /\ cursor' = id /\ half' = id /\ UNCHANGED <<copies, pending>>
     ELSE /\ cursor' = id /\ copies' = [copies EXCEPT ![id] = @ + 1]
          /\ pending' = pending \cup {id} /\ UNCHANGED half
  /\ UNCHANGED <<upstream, base, sub, subscribers, start, gaps, consumer, stream, reported,
                 crashes>>

\* The second half of the faulty write.
StoreLate ==
  /\ half # 0
  /\ copies' = [copies EXCEPT ![half] = @ + 1] /\ pending' = pending \cup {half}
  /\ half' = 0
  /\ UNCHANGED <<upstream, base, sub, subscribers, start, cursor, gaps, consumer, stream,
                 reported, crashes>>

\* The peer hands over an event it already handed over. It is stored once.
Again ==
  /\ sub = "receiving" /\ stream = "open" /\ half = 0
  /\ \E id \in (start + 1)..cursor :
       /\ copies[id] > 0
       /\ IF "no-dedup" \in Bugs
          THEN copies' = [copies EXCEPT ![id] = @ + 1] /\ pending' = pending \cup {id}
          ELSE UNCHANGED <<copies, pending>>
  /\ UNCHANGED <<upstream, base, sub, subscribers, start, cursor, gaps, consumer, stream,
                 half, reported, crashes>>

\* The consumer takes a stored event; it tells events apart by their id.
Deliver ==
  /\ \E id \in pending :
       /\ consumer' = consumer \cup {id}
       /\ pending' \in {pending, pending \ {id}}   \* the mark may be lost with the process
  /\ UNCHANGED <<upstream, base, sub, subscribers, start, cursor, copies, gaps, stream, half,
                 reported, crashes>>

Break ==
  /\ stream = "open" /\ stream' = "closed"
  /\ UNCHANGED <<upstream, base, sub, subscribers, start, cursor, copies, pending, gaps,
                 consumer, half, reported, crashes>>

ConnectionLost ==
  /\ sub = "receiving" /\ sub' = "waiting" /\ stream' = "closed"
  /\ UNCHANGED <<upstream, base, subscribers, start, cursor, copies, pending, gaps, consumer,
                 half, reported, crashes>>

ConnectionBack ==
  /\ sub = "waiting" /\ sub' = "receiving"
  /\ UNCHANGED <<upstream, base, subscribers, start, cursor, copies, pending, gaps, consumer,
                 stream, half, reported, crashes>>

\* The peer ends the subscription. It is a ruling: omne does not subscribe again by itself.
Terminate ==
  /\ sub = "receiving" /\ sub' = "terminated" /\ stream' = "closed"
  /\ reported' = reported \cup {"terminated"}
  /\ UNCHANGED <<upstream, base, subscribers, start, cursor, copies, pending, gaps, consumer,
                 half, crashes>>

Crash ==
  /\ crashes < Crashes /\ crashes' = crashes + 1
  /\ stream' = IF "keep-stream" \in Bugs THEN stream ELSE "closed"
  /\ half' = 0
  /\ UNCHANGED <<upstream, base, sub, subscribers, start, cursor, copies, pending, gaps,
                 consumer, reported>>

Next == Produce \/ Forget \/ Subscribe \/ Unsubscribe \/ Open \/ Receive \/ StoreLate \/ Again
        \/ Deliver \/ Break \/ ConnectionLost \/ ConnectionBack \/ Terminate \/ Crash

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ sub \in {"none", "receiving", "waiting", "terminated"}
  /\ stream \in {"closed", "open"} /\ cursor \in 0..MaxEvents /\ subscribers \in 0..MaxSubs

\* I12 and I14: an event the position has passed is stored or recorded as a gap. A write
\* in two halves is allowed to be in between only while it is on its way.
I12_NothingLostSilently ==
  sub # "none" => \A id \in (start + 1)..cursor : copies[id] > 0 \/ id \in gaps \/ id = half
I14_GapIsReported == gaps # {} => "gap" \in reported
\* I13: one event id is stored at most once in a subscription.
I13_StoredOnce == \A id \in Ids : copies[id] <= 1
\* I16: no subscriber, no subscription and no stream.
I16_NoSubscriberNoStream == subscribers = 0 => (sub = "none" /\ stream = "closed")
P_StreamOnlyWhenReceiving == stream = "open" => sub = "receiving"
P_ConsumerTookStored == \A id \in consumer : copies[id] > 0
P_TerminatedIsReported == sub = "terminated" => "terminated" \in reported
\* The position only moves forward while the subscription lives.
P_PositionForward == [][sub' = sub => cursor' >= cursor]_vars
=============================================================================
