------------------------------ MODULE CursorMC ------------------------------
EXTENDS Cursor, TLC

Symm == Permutations(Clients)

(* Negative variant 1: a bell is forwarded as-is without filling the gap from
   `sent` (no watermark fill).  A lost bell followed by a heard bell moves the
   cursor past an undelivered fact.  Expected to violate CursorComplete (MS-3). *)
CommitNoFill(scope, lost) ==
  /\ Now < MaxFacts
  /\ lost \subseteq {c \in Clients : sub[c] = "open"}
  /\ facts' = Append(facts, [scope |-> scope, kind |-> "fact"])
  /\ LET seq == Now + 1
         Heard(c) == sub[c] = "open" /\ c \notin lost /\ scope = "s"
         frame == [type |-> "fact", seq |-> seq]
     IN /\ buf' = [c \in Clients |-> IF Heard(c) /\ Len(buf[c]) < BufMax THEN buf[c] \o <<frame>> ELSE buf[c]]
        /\ sent' = [c \in Clients |-> IF Heard(c) /\ Len(buf[c]) < BufMax THEN seq ELSE sent[c]]
  /\ UNCHANGED <<floor, sub, tbuf, pend, delivered, cursor, att, draft, gap, epoch, crashes, disc>>

NextNoFill ==
  \/ \E s \in {"s", "o"} : \E lost \in SUBSET Clients : CommitNoFill(s, lost)
  \/ AdvanceFloor
  \/ \E c \in Clients : Subscribe(c) \/ Disconnect(c) \/ Deliver(c)
  \/ StartAttempt \/ Chunk \/ EndCommitted \/ Abandon \/ Crash

SpecNoFill == Init /\ [][NextNoFill]_vars

(* Negative variant 2: catch-up served from a bounded server-side frame
   buffer (the last `Retain` session facts) instead of the projection's
   watermark range.  A client that was away longer than the buffer resumes with
   a hole below its cursor.  Expected to violate CursorComplete (MS-3). *)
CONSTANT Retain

LastN(lo, hi) ==
  LET all == FactFrames(lo, hi)
  IN IF Len(all) <= Retain THEN all ELSE SubSeq(all, Len(all) - Retain + 1, Len(all))

SubscribeBuffered(c) ==
  /\ sub[c] = "closed"
  /\ sub' = [sub EXCEPT ![c] = "open"]
  /\ delivered' = delivered /\ cursor' = cursor
  /\ buf' = [buf EXCEPT ![c] = LastN(cursor[c], Now)]
  /\ tbuf' = [tbuf EXCEPT ![c] = <<>>]
  /\ pend' = [pend EXCEPT ![c] = FALSE]
  /\ sent' = [sent EXCEPT ![c] = Now]
  /\ draft' = [draft EXCEPT ![c] = NoDraft]
  /\ UNCHANGED <<facts, floor, att, gap, epoch, crashes, disc>>

NextBuffered ==
  \/ \E s \in {"s", "o"} : CommitFact(s)
  \/ \E c \in Clients : SubscribeBuffered(c) \/ Disconnect(c) \/ Deliver(c)

SpecBuffered == Init /\ [][NextBuffered]_vars
=============================================================================
