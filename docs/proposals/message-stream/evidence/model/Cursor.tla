------------------------------- MODULE Cursor -------------------------------
(* Client cursor and reconnect catch-up for the message stream
   (docs/proposals/message-stream/envelope-and-cursor.md).

   One coordination domain commits facts in a single monotone sequence; each
   fact is either in the session's scope ("s") or foreign ("o").  Clients hold
   a subscription with two bounded buffers: a fact queue and a transient ring.
   Fact hints reach the stream service through a lossy in-process bell
   (LC-06); the service fills the fact queue from the projection using the
   last sequence it sent to that subscription (`sent`), pages when the queue
   is full, and a periodic reconcile covers a bell that never gets a
   successor.  Facts are never dropped.  One model attempt produces transient
   started/chunk/ended frames that go through the ring: a full ring drops its
   oldest frame and owes the client a gap mark.  `ended{committed}` is emitted
   together with the settlement fact, never before it; the client applies it
   by reading the message at the committed position, so no ordering between
   the ring and the fact queue is assumed.  A process crash (epoch change)
   loses the attempt and every subscription.

   Cursor semantics: a client's cursor is the last session-scoped fact it has
   received.  MS-3 (CursorComplete) says every session-scoped fact at or below
   the cursor has been delivered, whatever bells were lost.  A full resync
   happens when the cursor falls below the projection floor. *)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Clients, MaxFacts, BufMax, MaxChunks, MaxCrash, MaxDisc

VARIABLES
  facts,     \* Seq of [scope: "s" | "o", kind: "fact" | "settle"]
  floor,     \* projection floor: cursors below it need a full resync
  sub,       \* [Clients -> "closed" | "open"]
  buf,       \* [Clients -> Seq(FactFrame)] fact queue per subscription
  tbuf,      \* [Clients -> Seq(TransientFrame)] transient ring per subscription
  pend,      \* [Clients -> BOOLEAN] a transient frame was dropped; gap notice owed
  sent,      \* [Clients -> Nat] last fact seq the service has pushed to the subscription
  delivered, \* [Clients -> SUBSET Nat] session facts received by the client
  cursor,    \* [Clients -> Nat] client cursor (last delivered session fact)
  att,       \* [state: "none" | "running", idx: Nat, epoch: Nat]
  draft,     \* [Clients -> [live: BOOLEAN, epoch: Nat, idx: Nat]] client draft of the live attempt
  gap,       \* [Clients -> BOOLEAN] the client has seen a transient loss
  epoch,     \* process epoch; a crash increments it
  crashes, disc

vars == <<facts, floor, sub, buf, tbuf, pend, sent, delivered, cursor, att, draft, gap, epoch, crashes, disc>>

Now == Len(facts)
Seqs == 1..MaxFacts
IsS(n) == n <= Now /\ facts[n].scope = "s"
SFactsIn(lo, hi) == {n \in Seqs : n > lo /\ n <= hi /\ IsS(n)}
Min(a, b) == IF a < b THEN a ELSE b

GapFrame == [type |-> "gap"]
NoDraft == [live |-> FALSE, epoch |-> 0, idx |-> 0]
Draft(e, i) == [live |-> TRUE, epoch |-> e, idx |-> i]

FactFrame == [type: {"fact"}, seq: Seqs]
TransientFrame ==
  [type: {"started"}, epoch: 0..MaxCrash]
    \cup [type: {"chunk"}, epoch: 0..MaxCrash, idx: 1..MaxChunks]
    \cup [type: {"ended"}, epoch: 0..MaxCrash, seq: 0..MaxFacts]   \* seq = 0 means abandoned

(* Ordered fact frames for the session facts in (lo, hi]. *)
RECURSIVE FactFrames(_, _)
FactFrames(lo, hi) ==
  IF lo >= hi THEN <<>>
  ELSE IF IsS(hi) THEN Append(FactFrames(lo, hi - 1), [type |-> "fact", seq |-> hi])
  ELSE FactFrames(lo, hi - 1)

TypeOK ==
  /\ facts \in Seq([scope: {"s", "o"}, kind: {"fact", "settle"}]) /\ Len(facts) <= MaxFacts
  /\ floor \in 0..MaxFacts /\ floor <= Now
  /\ sub \in [Clients -> {"closed", "open"}]
  /\ buf \in [Clients -> Seq(FactFrame)] /\ \A c \in Clients : Len(buf[c]) <= BufMax
  /\ tbuf \in [Clients -> Seq(TransientFrame)] /\ \A c \in Clients : Len(tbuf[c]) <= BufMax
  /\ pend \in [Clients -> BOOLEAN]
  /\ sent \in [Clients -> 0..MaxFacts]
  /\ delivered \in [Clients -> SUBSET Seqs]
  /\ cursor \in [Clients -> 0..MaxFacts]
  /\ att \in [state: {"none", "running"}, idx: 0..MaxChunks, epoch: 0..MaxCrash]
  /\ draft \in [Clients -> [live: BOOLEAN, epoch: 0..MaxCrash, idx: 0..MaxChunks]]
  /\ gap \in [Clients -> BOOLEAN]
  /\ epoch \in 0..MaxCrash /\ crashes \in 0..MaxCrash /\ disc \in 0..MaxDisc

Init ==
  /\ facts = <<>> /\ floor = 0
  /\ sub = [c \in Clients |-> "closed"]
  /\ buf = [c \in Clients |-> <<>>] /\ tbuf = [c \in Clients |-> <<>>]
  /\ pend = [c \in Clients |-> FALSE]
  /\ sent = [c \in Clients |-> 0] /\ delivered = [c \in Clients |-> {}]
  /\ cursor = [c \in Clients |-> 0]
  /\ att = [state |-> "none", idx |-> 0, epoch |-> 0]
  /\ draft = [c \in Clients |-> NoDraft] /\ gap = [c \in Clients |-> FALSE]
  /\ epoch = 0 /\ crashes = 0 /\ disc = 0

(* ---- the stream service: fact queue ---- *)

(* Fact frames are never dropped and never close a subscription: the service
   pushes as many of the pending fact frames as the queue has room for and
   moves the subscription's watermark `sent` to the last one pushed.  A full
   queue only stalls the watermark; the next bell or reconcile resumes. *)
Room(c) == BufMax - Len(buf[c])

(* Session facts in (sent[c], hi] as frames. *)
Fill(c, hi) == FactFrames(sent[c], hi)

(* Push a prefix of `frames` (fact frames up to `hi`) that fits into buf[c]. *)
Push(c, frames, hi) ==
  LET n == Min(Len(frames), Room(c))
      whole == n = Len(frames)
      taken == SubSeq(frames, 1, n)
  IN [buf |-> buf[c] \o taken,
      sent |-> IF whole THEN hi ELSE IF n = 0 THEN sent[c] ELSE taken[n].seq]

(* A commit of `kind` in scope `scope`; `lost` is the set of open subscriptions
   whose bell was lost.  A subscription that hears the bell is filled from its
   watermark, so a lost predecessor bell leaves no hole. *)
CommitWith(scope, kind, lost) ==
  /\ Now < MaxFacts
  /\ lost \subseteq {c \in Clients : sub[c] = "open"}
  /\ facts' = Append(facts, [scope |-> scope, kind |-> kind])
  /\ LET seq == Now + 1
         Heard(c) == sub[c] = "open" /\ c \notin lost
         Frames(c) == IF scope = "s" THEN Append(Fill(c, seq - 1), [type |-> "fact", seq |-> seq])
                      ELSE Fill(c, seq - 1)
         P(c) == Push(c, Frames(c), seq)
     IN /\ buf' = [c \in Clients |-> IF Heard(c) THEN P(c).buf ELSE buf[c]]
        /\ sent' = [c \in Clients |-> IF Heard(c) THEN P(c).sent ELSE sent[c]]
  /\ UNCHANGED <<floor, sub, delivered, cursor, draft, gap, epoch, crashes, disc>>

CommitFact(scope) ==
  /\ \E lost \in SUBSET Clients : CommitWith(scope, "fact", lost)
  /\ UNCHANGED <<att, tbuf, pend>>

AdvanceFloor ==
  /\ floor < Now
  /\ floor' = floor + 1
  /\ UNCHANGED <<facts, sub, buf, tbuf, pend, sent, delivered, cursor, att, draft, gap, epoch, crashes, disc>>

(* The service periodically reconciles a subscription against the projection:
   covers a lost bell that never got a successor and resumes a watermark that
   stalled on a full queue. *)
Reconcile(c) ==
  /\ sub[c] = "open" /\ sent[c] < Now
  /\ LET P == Push(c, Fill(c, Now), Now)
     IN /\ P.sent > sent[c]   \* only a step that makes progress
        /\ buf' = [buf EXCEPT ![c] = P.buf]
        /\ sent' = [sent EXCEPT ![c] = P.sent]
  /\ UNCHANGED <<facts, floor, sub, tbuf, pend, delivered, cursor, att, draft, gap, epoch, crashes, disc>>

(* ---- the stream service: transient ring ---- *)

(* A transient frame reaches every open subscription; a full ring drops its
   oldest frame and the client is owed a gap. *)
Broadcast(frame) ==
  /\ tbuf' = [c \in Clients |-> IF sub[c] # "open" THEN tbuf[c]
                                ELSE IF Len(tbuf[c]) < BufMax THEN tbuf[c] \o <<frame>>
                                ELSE Tail(tbuf[c]) \o <<frame>>]
  /\ pend' = [c \in Clients |-> IF sub[c] = "open" /\ Len(tbuf[c]) >= BufMax THEN TRUE ELSE pend[c]]

(* ---- subscriptions ---- *)

Subscribe(c) ==
  /\ sub[c] = "closed"
  /\ sub' = [sub EXCEPT ![c] = "open"]
  /\ IF cursor[c] < floor
       THEN \* full resync: the client re-reads history from the read faces
            /\ delivered' = [delivered EXCEPT ![c] = SFactsIn(0, Now)]
            /\ cursor' = [cursor EXCEPT ![c] = Now]
            /\ buf' = [buf EXCEPT ![c] = <<>>]
            /\ sent' = [sent EXCEPT ![c] = Now]
       ELSE \* catch-up from the projection: every session fact in (cursor, now],
            \* served in pages of at most BufMax frames; the watermark records
            \* how far the first page reached and Reconcile serves the rest
            /\ delivered' = delivered /\ cursor' = cursor
            /\ LET frames == FactFrames(cursor[c], Now)
                   n == Min(Len(frames), BufMax)
               IN /\ buf' = [buf EXCEPT ![c] = SubSeq(frames, 1, n)]
                  /\ sent' = [sent EXCEPT ![c] = IF n = Len(frames) THEN Now ELSE frames[n].seq]
  /\ tbuf' = [tbuf EXCEPT ![c] = <<>>]
  /\ pend' = [pend EXCEPT ![c] = FALSE]
  /\ draft' = [draft EXCEPT ![c] = IF att.state = "running"
                                    THEN Draft(att.epoch, att.idx) ELSE NoDraft]
  /\ UNCHANGED <<facts, floor, att, gap, epoch, crashes, disc>>

Disconnect(c) ==
  /\ sub[c] = "open" /\ disc < MaxDisc
  /\ disc' = disc + 1
  /\ sub' = [sub EXCEPT ![c] = "closed"]
  /\ buf' = [buf EXCEPT ![c] = <<>>] /\ tbuf' = [tbuf EXCEPT ![c] = <<>>]
  /\ pend' = [pend EXCEPT ![c] = FALSE]
  /\ draft' = [draft EXCEPT ![c] = NoDraft]
  /\ UNCHANGED <<facts, floor, sent, delivered, cursor, att, gap, epoch, crashes>>

(* ---- delivery to the client ---- *)

DeliverFact(c) ==
  /\ sub[c] = "open" /\ Len(buf[c]) > 0
  /\ LET f == Head(buf[c]) IN
       /\ buf' = [buf EXCEPT ![c] = Tail(@)]
       /\ delivered' = [delivered EXCEPT ![c] = @ \cup {f.seq}]
       /\ cursor' = [cursor EXCEPT ![c] = IF f.seq > @ THEN f.seq ELSE @]
  /\ UNCHANGED <<facts, floor, sub, tbuf, pend, sent, att, draft, gap, epoch, crashes, disc>>

(* An owed gap is shown before the next transient frame (the dropped frames
   were the oldest, so the hole is at the head of the ring). *)
DeliverGap(c) ==
  /\ sub[c] = "open" /\ pend[c]
  /\ pend' = [pend EXCEPT ![c] = FALSE]
  /\ gap' = [gap EXCEPT ![c] = TRUE]
  /\ draft' = [draft EXCEPT ![c] = NoDraft]
  /\ UNCHANGED <<facts, floor, sub, buf, tbuf, sent, delivered, cursor, att, epoch, crashes, disc>>

DeliverTransient(c) ==
  /\ sub[c] = "open" /\ ~pend[c] /\ Len(tbuf[c]) > 0
  /\ LET f == Head(tbuf[c]) IN
       /\ tbuf' = [tbuf EXCEPT ![c] = Tail(@)]
       /\ CASE f.type = "started" ->
               /\ draft' = [draft EXCEPT ![c] = Draft(f.epoch, 0)]
               /\ UNCHANGED gap
            [] f.type = "chunk" ->
               IF draft[c].live /\ draft[c].epoch = f.epoch /\ draft[c].idx + 1 = f.idx
                 THEN /\ draft' = [draft EXCEPT ![c] = Draft(f.epoch, f.idx)]
                      /\ UNCHANGED gap
                 ELSE /\ draft' = [draft EXCEPT ![c] = NoDraft]
                      /\ gap' = [gap EXCEPT ![c] = TRUE]
            [] f.type = "ended" ->
               \* committed: the client reads the message at f.seq and replaces
               \* the draft; abandoned (seq = 0): the draft becomes a gap
               /\ draft' = [draft EXCEPT ![c] = NoDraft]
               /\ gap' = [gap EXCEPT ![c] = IF f.seq = 0 THEN TRUE ELSE @]
  /\ UNCHANGED <<facts, floor, sub, buf, pend, sent, delivered, cursor, att, epoch, crashes, disc>>

Deliver(c) == DeliverFact(c) \/ DeliverGap(c) \/ DeliverTransient(c)

(* ---- the model attempt (transient frames) ---- *)

StartAttempt ==
  /\ att.state = "none"
  /\ att' = [state |-> "running", idx |-> 0, epoch |-> epoch]
  /\ Broadcast([type |-> "started", epoch |-> epoch])
  /\ UNCHANGED <<facts, floor, sub, buf, sent, delivered, cursor, draft, gap, epoch, crashes, disc>>

Chunk ==
  /\ att.state = "running" /\ att.idx < MaxChunks
  /\ att' = [att EXCEPT !.idx = @ + 1]
  /\ Broadcast([type |-> "chunk", epoch |-> att.epoch, idx |-> att.idx + 1])
  /\ UNCHANGED <<facts, floor, sub, buf, sent, delivered, cursor, draft, gap, epoch, crashes, disc>>

(* Settlement: the settlement fact commits (bell may be lost) and, in the same
   step, the ended frame carrying the fact's position enters every open ring.
   The ended frame never exists before its fact. *)
EndCommitted ==
  /\ att.state = "running"
  /\ \E lost \in SUBSET Clients : CommitWith("s", "settle", lost)
  /\ Broadcast([type |-> "ended", epoch |-> att.epoch, seq |-> Now + 1])
  /\ att' = [state |-> "none", idx |-> 0, epoch |-> att.epoch]

Abandon ==
  /\ att.state = "running"
  /\ att' = [state |-> "none", idx |-> 0, epoch |-> att.epoch]
  /\ Broadcast([type |-> "ended", epoch |-> att.epoch, seq |-> 0])
  /\ UNCHANGED <<facts, floor, sub, buf, sent, delivered, cursor, draft, gap, epoch, crashes, disc>>

(* Process crash: epoch changes, the live attempt is lost, subscriptions drop.
   Facts are durable; a client holding a draft is owed a gap. *)
Crash ==
  /\ crashes < MaxCrash
  /\ crashes' = crashes + 1 /\ epoch' = epoch + 1
  /\ att' = [state |-> "none", idx |-> 0, epoch |-> epoch + 1]
  /\ sub' = [c \in Clients |-> "closed"]
  /\ buf' = [c \in Clients |-> <<>>] /\ tbuf' = [c \in Clients |-> <<>>]
  /\ pend' = [c \in Clients |-> FALSE]
  /\ gap' = [c \in Clients |-> IF draft[c].live THEN TRUE ELSE gap[c]]
  /\ draft' = [c \in Clients |-> NoDraft]
  /\ UNCHANGED <<facts, floor, sent, delivered, cursor, disc>>

Next ==
  \/ \E s \in {"s", "o"} : CommitFact(s)
  \/ AdvanceFloor
  \/ \E c \in Clients : Subscribe(c) \/ Disconnect(c) \/ Reconcile(c) \/ Deliver(c)
  \/ StartAttempt \/ Chunk \/ EndCommitted \/ Abandon \/ Crash

Spec == Init /\ [][Next]_vars

Fairness ==
  /\ \A c \in Clients : WF_vars(DeliverFact(c)) /\ WF_vars(DeliverGap(c)) /\ WF_vars(DeliverTransient(c))
  /\ \A c \in Clients : WF_vars(Reconcile(c)) /\ WF_vars(Subscribe(c))
  /\ WF_vars(EndCommitted \/ Abandon)

SpecFair == Spec /\ Fairness

(* ---- properties ---- *)

BufSeqs(c) == {buf[c][j].seq : j \in 1..Len(buf[c])}

\* MS-5 (scope): only session facts are ever delivered.
NoForeignDelivery == \A c \in Clients : \A n \in delivered[c] : facts[n].scope = "s"

\* MS-3: everything at or below the cursor has been delivered, whatever bells were lost.
CursorComplete == \A c \in Clients : \A n \in Seqs : (IsS(n) /\ n <= cursor[c]) => n \in delivered[c]

\* The service never claims more than it queued: sent covers delivered + queued.
SentComplete == \A c \in Clients : sub[c] = "open" =>
  \A n \in Seqs : (IsS(n) /\ n <= sent[c]) => (n \in delivered[c] \/ n \in BufSeqs(c))

\* MS-7: an ended{committed} frame points at an existing settlement fact at or
\* below the current watermark (the client reads the message at that position).
EndedAfterCommit == \A c \in Clients : \A i \in 1..Len(tbuf[c]) :
  (tbuf[c][i].type = "ended" /\ tbuf[c][i].seq > 0) =>
    tbuf[c][i].seq <= Now /\ facts[tbuf[c][i].seq].kind = "settle"

\* Queued fact frames are in increasing sequence order and above the cursor.
BufferOrdered == \A c \in Clients :
  /\ \A i, j \in 1..Len(buf[c]) : i < j => buf[c][i].seq < buf[c][j].seq
  /\ \A j \in 1..Len(buf[c]) : buf[c][j].seq > cursor[c]

\* MS-4: a draft only ever belongs to the current epoch (stale drafts are dropped with a gap).
DraftCurrent == \A c \in Clients : draft[c].live => draft[c].epoch = epoch

\* Delivered facts never disappear and the cursor never moves backwards.
Monotone == [][\A c \in Clients : delivered[c] \subseteq delivered'[c] /\ cursor[c] <= cursor'[c]]_vars

\* MS-2: a fact is delivered to a subscription at most once (no duplicate frames).
DeliverOnce == [][\A c \in Clients :
  (Len(buf[c]) > 0 /\ DeliverFact(c)) => (Head(buf[c]).seq \notin delivered[c])]_vars

\* MP-1: every session fact is eventually delivered to every client.
EventuallyDelivered == \A n \in Seqs : \A c \in Clients : (IsS(n)) ~> (n \in delivered[c])

\* MP-3: an open subscription eventually drains its fact queue (or is closed).
BuffersDrain == \A c \in Clients : (sub[c] = "open" /\ Len(buf[c]) > 0) ~> (Len(buf[c]) = 0 \/ sub[c] = "closed")

\* MP-2: a running attempt eventually ends.
AttemptsSettle == (att.state = "running") ~> (att.state = "none")

\* MS-4: a transient drop owed to a subscription is eventually shown as a gap
\* (or the subscription is gone and the next subscribe rebaselines).
GapMarked == \A c \in Clients : pend[c] ~> (gap[c] \/ sub[c] = "closed")

=============================================================================
