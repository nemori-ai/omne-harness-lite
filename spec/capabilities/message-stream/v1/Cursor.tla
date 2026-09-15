------------------------------- MODULE Cursor -------------------------------
(* Client cursor and reconnect catch-up for the message stream
   (docs/proposals/message-stream/envelope-and-cursor.md), second draft after
   the 2026-09-15 architecture review (review.md B1, B2).

   One coordination domain commits facts in a single monotone sequence.  A
   commit is a batch: it is either in the session's scope ("s") and then
   carries n >= 1 session facts that share the sequence number (B1: taken +
   run.created + step.opened in one commit), or foreign ("o").  The projection
   folds commits in order; `pv` is its complete-coverage watermark (B2): the
   stream service never pushes a unit above `pv`, however many commits exist.
   The bell (LC-06, lossy per subscription) rings when the projection folds a
   commit; a subscription that hears it is filled from its own watermark
   `sent` = (seq, idx) of the last unit pushed, so a lost predecessor leaves no
   hole; a periodic reconcile covers a bell without a successor.  Each
   subscription has two bounded buffers: a fact queue (never drops, may stall
   inside a batch) and a transient ring (drops its oldest frame and owes a gap
   mark).  A subscription whose watermark fell below the projection floor is
   closed with resync_required and re-subscribes with a full resync.

   Cursor semantics: a client's cursor is the last sequence number whose
   batch it has received completely; it never sits inside a batch.  MS-3
   (CursorComplete) says every unit of every session batch at or below the
   cursor has been delivered, whatever bells were lost.  After a reconnect the
   service re-sends the units of the one batch that may have been partially
   delivered; the client drops them by dedup key (DeliverOnce states that
   re-sends only ever belong to that batch).  A full resync happens when the
   cursor falls below the projection floor. *)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Clients, MaxFacts, MaxPer, BufMax, MaxChunks, MaxCrash, MaxDisc

VARIABLES
  facts,     \* Seq of [scope: "s" | "o", kind: "fact" | "settle", n: 0..MaxPer]; n = units sharing the seq (0 when foreign)
  pv,        \* projection complete-coverage watermark: commits <= pv are folded
  floor,     \* projection floor: cursors below it need a full resync (floor <= pv)
  sub,       \* [Clients -> "closed" | "open"]
  buf,       \* [Clients -> Seq(FactFrame)] fact queue per subscription
  tbuf,      \* [Clients -> Seq(TransientFrame)] transient ring per subscription
  pend,      \* [Clients -> BOOLEAN] a transient frame was dropped; gap notice owed
  sent,      \* [Clients -> [seq, idx]] last fact unit the service has pushed to the subscription
  delivered, \* [Clients -> SUBSET (seq, idx) units] session facts received by the client
  cursor,    \* [Clients -> Nat] last seq whose batch the client received completely
  att,       \* [state: "none" | "running", idx: Nat, epoch: Nat]
  draft,     \* [Clients -> [live: BOOLEAN, epoch: Nat, idx: Nat]] client draft of the live attempt
  gap,       \* [Clients -> BOOLEAN] the client has seen a transient loss
  epoch,     \* process epoch; a crash increments it
  crashes, disc

vars == <<facts, pv, floor, sub, buf, tbuf, pend, sent, delivered, cursor, att, draft, gap, epoch, crashes, disc>>

Now == Len(facts)
Seqs == 1..MaxFacts
Idxs == 1..MaxPer
IsS(s) == s >= 1 /\ s <= Now /\ facts[s].scope = "s"
N(s) == facts[s].n
Units == {u \in Seqs \X Idxs : IsS(u[1]) /\ u[2] <= N(u[1])}
Pos(s, i) == [seq |-> s, idx |-> i]
Zero == Pos(0, 0)
Full(h) == Pos(h, IF IsS(h) THEN N(h) ELSE 0)        \* position "whole batch h pushed"
Before(a, b) == a.seq < b.seq \/ (a.seq = b.seq /\ a.idx < b.idx)
Min(a, b) == IF a < b THEN a ELSE b
Max(a, b) == IF a > b THEN a ELSE b

GapFrame == [type |-> "gap"]
NoDraft == [live |-> FALSE, epoch |-> 0, idx |-> 0]
Draft(e, i) == [live |-> TRUE, epoch |-> e, idx |-> i]

FactFrame == [type: {"fact"}, seq: Seqs, idx: Idxs]
TransientFrame ==
  [type: {"started"}, epoch: 0..MaxCrash]
    \cup [type: {"chunk"}, epoch: 0..MaxCrash, idx: 1..MaxChunks]
    \cup [type: {"ended"}, epoch: 0..MaxCrash, seq: 0..MaxFacts]   \* seq = 0 means abandoned

(* Units of session batch s from index k on, as fact frames. *)
RECURSIVE UnitsOf(_, _)
UnitsOf(s, k) == IF ~IsS(s) \/ k > N(s) THEN <<>>
                 ELSE <<[type |-> "fact", seq |-> s, idx |-> k]>> \o UnitsOf(s, k + 1)

RECURSIVE Range(_, _)
Range(a, b) == IF a > b THEN <<>> ELSE UnitsOf(a, 1) \o Range(a + 1, b)

(* Ordered fact frames for the units strictly after position lo with seq <= hi. *)
FactFrames(lo, hi) == UnitsOf(lo.seq, lo.idx + 1) \o Range(lo.seq + 1, hi)

TypeOK ==
  /\ facts \in Seq([scope: {"s", "o"}, kind: {"fact", "settle"}, n: 0..MaxPer]) /\ Len(facts) <= MaxFacts
  /\ \A s \in 1..Now : (facts[s].scope = "s") <=> (facts[s].n >= 1)
  /\ pv \in 0..MaxFacts /\ pv <= Now
  /\ floor \in 0..MaxFacts /\ floor <= pv
  /\ sub \in [Clients -> {"closed", "open"}]
  /\ buf \in [Clients -> Seq(FactFrame)] /\ \A c \in Clients : Len(buf[c]) <= BufMax
  /\ tbuf \in [Clients -> Seq(TransientFrame)] /\ \A c \in Clients : Len(tbuf[c]) <= BufMax
  /\ pend \in [Clients -> BOOLEAN]
  /\ sent \in [Clients -> [seq: 0..MaxFacts, idx: 0..MaxPer]]
  /\ delivered \in [Clients -> SUBSET (Seqs \X Idxs)]
  /\ cursor \in [Clients -> 0..MaxFacts]
  /\ att \in [state: {"none", "running"}, idx: 0..MaxChunks, epoch: 0..MaxCrash]
  /\ draft \in [Clients -> [live: BOOLEAN, epoch: 0..MaxCrash, idx: 0..MaxChunks]]
  /\ gap \in [Clients -> BOOLEAN]
  /\ epoch \in 0..MaxCrash /\ crashes \in 0..MaxCrash /\ disc \in 0..MaxDisc

Init ==
  /\ facts = <<>> /\ pv = 0 /\ floor = 0
  /\ sub = [c \in Clients |-> "closed"]
  /\ buf = [c \in Clients |-> <<>>] /\ tbuf = [c \in Clients |-> <<>>]
  /\ pend = [c \in Clients |-> FALSE]
  /\ sent = [c \in Clients |-> Zero] /\ delivered = [c \in Clients |-> {}]
  /\ cursor = [c \in Clients |-> 0]
  /\ att = [state |-> "none", idx |-> 0, epoch |-> 0]
  /\ draft = [c \in Clients |-> NoDraft] /\ gap = [c \in Clients |-> FALSE]
  /\ epoch = 0 /\ crashes = 0 /\ disc = 0

(* ---- commits ---- *)

Commit(scope, kind, n) ==
  /\ Now < MaxFacts
  /\ facts' = Append(facts, [scope |-> scope, kind |-> kind, n |-> n])

(* A commit only appends; the projection folds it later (Project). *)
CommitFact(scope) ==
  /\ \E n \in (IF scope = "s" THEN Idxs ELSE {0}) : Commit(scope, "fact", n)
  /\ UNCHANGED <<pv, floor, sub, buf, tbuf, pend, sent, delivered, cursor, att, draft, gap, epoch, crashes, disc>>

(* ---- the stream service: fact queue ---- *)

(* Fact frames are never dropped and never close a subscription: the service
   pushes as many of the pending fact frames as the queue has room for and
   moves the subscription's watermark `sent` to the last unit pushed, which may
   be inside a batch.  A full queue only stalls the watermark; the next bell or
   reconcile resumes.  The watermark never passes the projection watermark. *)
Room(c) == BufMax - Len(buf[c])

Push(c, frames, hi) ==
  LET n == Min(Len(frames), Room(c))
      whole == n = Len(frames)
      taken == SubSeq(frames, 1, n)
  IN [buf |-> buf[c] \o taken,
      sent |-> IF whole THEN Full(hi) ELSE IF n = 0 THEN sent[c] ELSE Pos(taken[n].seq, taken[n].idx)]

(* The projection folds the next commit and rings the bell; `lost` is the set of
   open subscriptions whose bell was lost.  A subscription that hears the bell
   is filled from its own watermark, so a lost predecessor bell leaves no hole.
   A subscription already below the floor is not served (ForceResync). *)
Project(lost) ==
  /\ pv < Now
  /\ lost \subseteq {c \in Clients : sub[c] = "open"}
  /\ pv' = pv + 1
  /\ LET Heard(c) == sub[c] = "open" /\ c \notin lost /\ sent[c].seq >= floor
         P(c) == Push(c, FactFrames(sent[c], pv + 1), pv + 1)
     IN /\ buf' = [c \in Clients |-> IF Heard(c) THEN P(c).buf ELSE buf[c]]
        /\ sent' = [c \in Clients |-> IF Heard(c) THEN P(c).sent ELSE sent[c]]
  /\ UNCHANGED <<facts, floor, sub, tbuf, pend, delivered, cursor, att, draft, gap, epoch, crashes, disc>>

AdvanceFloor ==
  /\ floor < pv
  /\ floor' = floor + 1
  /\ UNCHANGED <<facts, pv, sub, buf, tbuf, pend, sent, delivered, cursor, att, draft, gap, epoch, crashes, disc>>

(* The service periodically reconciles a subscription against the projection:
   covers a lost bell that never got a successor and resumes a watermark that
   stalled on a full queue.  Only up to the projection watermark; not below the
   floor (the projection cannot serve there). *)
Reconcile(c) ==
  /\ sub[c] = "open" /\ sent[c].seq >= floor /\ Before(sent[c], Full(pv))
  /\ LET P == Push(c, FactFrames(sent[c], pv), pv)
     IN /\ P.sent /= sent[c]   \* only a step that makes progress
        /\ buf' = [buf EXCEPT ![c] = P.buf]
        /\ sent' = [sent EXCEPT ![c] = P.sent]
  /\ UNCHANGED <<facts, pv, floor, sub, tbuf, pend, delivered, cursor, att, draft, gap, epoch, crashes, disc>>

(* A stalled subscription overtaken by the retention floor is closed with
   resync_required; its next Subscribe takes the full-resync branch. *)
ForceResync(c) ==
  /\ sub[c] = "open" /\ sent[c].seq < floor
  /\ sub' = [sub EXCEPT ![c] = "closed"]
  /\ buf' = [buf EXCEPT ![c] = <<>>] /\ tbuf' = [tbuf EXCEPT ![c] = <<>>]
  /\ pend' = [pend EXCEPT ![c] = FALSE]
  /\ draft' = [draft EXCEPT ![c] = NoDraft]
  /\ UNCHANGED <<facts, pv, floor, sent, delivered, cursor, att, gap, epoch, crashes, disc>>

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
       THEN \* full resync: the client re-reads history from the read faces up
            \* to the projection watermark (the installation point is atomic here)
            /\ delivered' = [delivered EXCEPT ![c] = @ \cup {u \in Units : u[1] <= pv}]
            /\ cursor' = [cursor EXCEPT ![c] = pv]
            /\ buf' = [buf EXCEPT ![c] = <<>>]
            /\ sent' = [sent EXCEPT ![c] = Full(pv)]
       ELSE \* catch-up from the projection: every unit after the last complete
            \* batch, served in pages of at most BufMax frames; the watermark
            \* records how far the first page reached and Reconcile serves the
            \* rest.  Units of a partially delivered batch are re-sent.
            /\ delivered' = delivered /\ cursor' = cursor
            /\ LET frames == FactFrames(Full(cursor[c]), pv)
                   n == Min(Len(frames), BufMax)
               IN /\ buf' = [buf EXCEPT ![c] = SubSeq(frames, 1, n)]
                  /\ sent' = [sent EXCEPT ![c] = IF n = Len(frames) THEN Full(pv)
                                                 ELSE Pos(frames[n].seq, frames[n].idx)]
  /\ tbuf' = [tbuf EXCEPT ![c] = <<>>]
  /\ pend' = [pend EXCEPT ![c] = FALSE]
  /\ draft' = [draft EXCEPT ![c] = IF att.state = "running"
                                    THEN Draft(att.epoch, att.idx) ELSE NoDraft]
  /\ UNCHANGED <<facts, pv, floor, att, gap, epoch, crashes, disc>>

Disconnect(c) ==
  /\ sub[c] = "open" /\ disc < MaxDisc
  /\ disc' = disc + 1
  /\ sub' = [sub EXCEPT ![c] = "closed"]
  /\ buf' = [buf EXCEPT ![c] = <<>>] /\ tbuf' = [tbuf EXCEPT ![c] = <<>>]
  /\ pend' = [pend EXCEPT ![c] = FALSE]
  /\ draft' = [draft EXCEPT ![c] = NoDraft]
  /\ UNCHANGED <<facts, pv, floor, sent, delivered, cursor, att, gap, epoch, crashes>>

(* ---- delivery to the client ---- *)

(* The client takes the head frame; a unit it already holds (re-sent after a
   reconnect) is dropped by dedup key.  The cursor moves only when the last
   unit of a batch arrives. *)
DeliverFact(c) ==
  /\ sub[c] = "open" /\ Len(buf[c]) > 0
  /\ LET f == Head(buf[c]) IN
       /\ buf' = [buf EXCEPT ![c] = Tail(@)]
       /\ delivered' = [delivered EXCEPT ![c] = @ \cup {<<f.seq, f.idx>>}]
       /\ cursor' = [cursor EXCEPT ![c] = IF f.idx = N(f.seq) THEN Max(@, f.seq) ELSE @]
  /\ UNCHANGED <<facts, pv, floor, sub, tbuf, pend, sent, att, draft, gap, epoch, crashes, disc>>

(* An owed gap is shown before the next transient frame (the dropped frames
   were the oldest, so the hole is at the head of the ring). *)
DeliverGap(c) ==
  /\ sub[c] = "open" /\ pend[c]
  /\ pend' = [pend EXCEPT ![c] = FALSE]
  /\ gap' = [gap EXCEPT ![c] = TRUE]
  /\ draft' = [draft EXCEPT ![c] = NoDraft]
  /\ UNCHANGED <<facts, pv, floor, sub, buf, tbuf, sent, delivered, cursor, att, epoch, crashes, disc>>

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
  /\ UNCHANGED <<facts, pv, floor, sub, buf, pend, sent, delivered, cursor, att, epoch, crashes, disc>>

Deliver(c) == DeliverFact(c) \/ DeliverGap(c) \/ DeliverTransient(c)

(* ---- the model attempt (transient frames) ---- *)

StartAttempt ==
  /\ att.state = "none"
  /\ att' = [state |-> "running", idx |-> 0, epoch |-> epoch]
  /\ Broadcast([type |-> "started", epoch |-> epoch])
  /\ UNCHANGED <<facts, pv, floor, sub, buf, sent, delivered, cursor, draft, gap, epoch, crashes, disc>>

Chunk ==
  /\ att.state = "running" /\ att.idx < MaxChunks
  /\ att' = [att EXCEPT !.idx = @ + 1]
  /\ Broadcast([type |-> "chunk", epoch |-> att.epoch, idx |-> att.idx + 1])
  /\ UNCHANGED <<facts, pv, floor, sub, buf, sent, delivered, cursor, draft, gap, epoch, crashes, disc>>

(* Settlement: the settlement fact commits and, in the same step, the ended
   frame carrying the fact's position enters every open ring.  The ended frame
   never exists before its fact; the client reads the message at the position
   once the projection has folded it. *)
EndCommitted ==
  /\ att.state = "running"
  /\ \E n \in Idxs : Commit("s", "settle", n)
  /\ Broadcast([type |-> "ended", epoch |-> att.epoch, seq |-> Now + 1])
  /\ att' = [state |-> "none", idx |-> 0, epoch |-> att.epoch]
  /\ UNCHANGED <<pv, floor, sub, buf, sent, delivered, cursor, draft, gap, epoch, crashes, disc>>

Abandon ==
  /\ att.state = "running"
  /\ att' = [state |-> "none", idx |-> 0, epoch |-> att.epoch]
  /\ Broadcast([type |-> "ended", epoch |-> att.epoch, seq |-> 0])
  /\ UNCHANGED <<facts, pv, floor, sub, buf, sent, delivered, cursor, draft, gap, epoch, crashes, disc>>

(* Process crash: epoch changes, the live attempt is lost, subscriptions drop.
   Facts and the projection are durable; a client holding a draft is owed a gap. *)
Crash ==
  /\ crashes < MaxCrash
  /\ crashes' = crashes + 1 /\ epoch' = epoch + 1
  /\ att' = [state |-> "none", idx |-> 0, epoch |-> epoch + 1]
  /\ sub' = [c \in Clients |-> "closed"]
  /\ buf' = [c \in Clients |-> <<>>] /\ tbuf' = [c \in Clients |-> <<>>]
  /\ pend' = [c \in Clients |-> FALSE]
  /\ gap' = [c \in Clients |-> IF draft[c].live THEN TRUE ELSE gap[c]]
  /\ draft' = [c \in Clients |-> NoDraft]
  /\ UNCHANGED <<facts, pv, floor, sent, delivered, cursor, disc>>

Next ==
  \/ \E s \in {"s", "o"} : CommitFact(s)
  \/ \E lost \in SUBSET Clients : Project(lost)
  \/ AdvanceFloor
  \/ \E c \in Clients : Subscribe(c) \/ Disconnect(c) \/ Reconcile(c) \/ ForceResync(c) \/ Deliver(c)
  \/ StartAttempt \/ Chunk \/ EndCommitted \/ Abandon \/ Crash

Spec == Init /\ [][Next]_vars

Fairness ==
  /\ \A c \in Clients : WF_vars(DeliverFact(c)) /\ WF_vars(DeliverGap(c)) /\ WF_vars(DeliverTransient(c))
  /\ \A c \in Clients : WF_vars(Reconcile(c)) /\ WF_vars(Subscribe(c)) /\ WF_vars(ForceResync(c))
  /\ WF_vars(\E lost \in SUBSET Clients : Project(lost))   \* the projection eventually folds every commit
  /\ WF_vars(EndCommitted \/ Abandon)

SpecFair == Spec /\ Fairness

(* ---- properties ---- *)

BufUnits(c) == {<<buf[c][j].seq, buf[c][j].idx>> : j \in 1..Len(buf[c])}
PartialBatch(c) == {s \in Seqs : IsS(s) /\ s > cursor[c] /\ \E i \in Idxs : <<s, i>> \in delivered[c]}

\* MS-5 (scope): only session facts are ever delivered.
NoForeignDelivery == \A c \in Clients : \A u \in delivered[c] : u \in Units

\* MS-3 (by batch): every unit of every session batch at or below the cursor
\* has been delivered, whatever bells were lost.
CursorComplete == \A c \in Clients : \A s \in Seqs :
  (IsS(s) /\ s <= cursor[c]) => \A i \in 1..N(s) : <<s, i>> \in delivered[c]

\* The service never claims more than it queued: every unit at or before the
\* watermark is delivered or queued.
SentComplete == \A c \in Clients : sub[c] = "open" =>
  \A u \in Units : ~Before(sent[c], Pos(u[1], u[2])) => (u \in delivered[c] \/ u \in BufUnits(c))

\* B2: the watermark never passes the projection's complete-coverage watermark.
SentWithinProjection == \A c \in Clients : sent[c].seq <= pv

\* MS-7: an ended{committed} frame points at an existing settlement fact.
EndedAfterCommit == \A c \in Clients : \A i \in 1..Len(tbuf[c]) :
  (tbuf[c][i].type = "ended" /\ tbuf[c][i].seq > 0) =>
    tbuf[c][i].seq <= Now /\ facts[tbuf[c][i].seq].kind = "settle"

\* MS-2: queued fact frames are in increasing (seq, idx) order and above the cursor.
BufferOrdered == \A c \in Clients :
  /\ \A i, j \in 1..Len(buf[c]) : i < j =>
       Before(Pos(buf[c][i].seq, buf[c][i].idx), Pos(buf[c][j].seq, buf[c][j].idx))
  /\ \A j \in 1..Len(buf[c]) : buf[c][j].seq > cursor[c]

\* A client holds units of at most one batch above its cursor (the one it was
\* in the middle of when it disconnected).
AtMostOnePartial == \A c \in Clients : Cardinality(PartialBatch(c)) <= 1

\* MS-4: a draft only ever belongs to the current epoch (stale drafts are dropped with a gap).
DraftCurrent == \A c \in Clients : draft[c].live => draft[c].epoch = epoch

\* Delivered facts never disappear and the cursor never moves backwards.
Monotone == [][\A c \in Clients : delivered[c] \subseteq delivered'[c] /\ cursor[c] <= cursor'[c]]_vars

\* MS-2: a unit is re-sent to a client only when it belongs to the batch that
\* was partially delivered before a reconnect (the client drops it by dedup key).
DeliverOnce == [][\A c \in Clients :
  (Len(buf[c]) > 0 /\ DeliverFact(c) /\ <<Head(buf[c]).seq, Head(buf[c]).idx>> \in delivered[c])
    => Head(buf[c]).seq \in PartialBatch(c)]_vars

\* MP-1: every unit of every session batch is eventually delivered to every client.
EventuallyDelivered == \A s \in Seqs : \A i \in Idxs : \A c \in Clients :
  (IsS(s) /\ i <= N(s)) ~> (<<s, i>> \in delivered[c])

\* MP-3: an open subscription eventually drains its fact queue (or is closed).
BuffersDrain == \A c \in Clients : (sub[c] = "open" /\ Len(buf[c]) > 0) ~> (Len(buf[c]) = 0 \/ sub[c] = "closed")

\* MP-2: a running attempt eventually ends.
AttemptsSettle == (att.state = "running") ~> (att.state = "none")

\* MS-4: a transient drop owed to a subscription is eventually shown as a gap
\* (or the subscription is gone and the next subscribe rebaselines).
GapMarked == \A c \in Clients : pend[c] ~> (gap[c] \/ sub[c] = "closed")

=============================================================================
