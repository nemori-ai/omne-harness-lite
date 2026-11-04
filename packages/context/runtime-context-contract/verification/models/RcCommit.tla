------------------------------ MODULE RcCommit ------------------------------
(***************************************************************************)
(* Runtime Context: the holder commits first, and the mechanism applies    *)
(* only what the holder committed, in the order of the holder log (RC-02,  *)
(* "注册修订与提交顺序", R2-D319). The holder log is the only authority; the *)
(* mechanism table is a projection applied in log order.                   *)
(*                                                                         *)
(* Abstractions. One scope. A decision is [id, kind, basis, after, p]: the *)
(* commit identity, a registration decision or a step commit, the          *)
(* registration revision it is based on (registrations only), the commit   *)
(* of the record before it in the log ("none" for the first), and a        *)
(* payload that stands for the rest of the complete input. Scope end is    *)
(* not modelled. A call may be delivered any number of times and in any    *)
(* order (retry, duplicate, reordering): the holder here is adversarial.   *)
(* A crash loses the whole mechanism; replay installs the holder log       *)
(* (RC-09), after the holder authority checked that the log covers every   *)
(* success the instance knows.                                             *)
(*                                                                         *)
(* Chain and release (R2-D319). The mechanism keeps the head of the chain: *)
(* the last applied decision, or the last record a replay installed. It    *)
(* applies a new decision only when its "after" is the head. The success   *)
(* table keeps only the decision at the head; applying the next one        *)
(* releases it. A released decision that comes back names an "after" that *)
(* is behind the head, so the answer is out-of-order.                      *)
(*                                                                         *)
(* Switches. All FALSE is the design. A negative control turns one on.     *)
(*   ApplyBeforeCommit  the holder calls applyCommit before its own commit *)
(*                      is durable, and keeps the call when it fails.      *)
(*   IgnoreBasis        the mechanism does not compare a registration's    *)
(*                      basis with its revision.                           *)
(*   IdOnlyDedupe       a retry is matched by the commit identity only,    *)
(*                      not by the complete input.                         *)
(*   NoAfterCheck       the mechanism does not compare "after" with the    *)
(*                      head.                                              *)
(*   NoRelease          the success table keeps every applied decision.    *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Ids, Payloads, MaxCrashes, DedupeCap, None,
          ApplyBeforeCommit, IgnoreBasis, IdOnlyDedupe, NoAfterCheck, NoRelease

ASSUME None \notin Ids

VARIABLES
  log,      \* holder durable log: sequence of decisions
  used,     \* commit identities the holder has spent (written or failed)
  calls,    \* applyCommit inputs the holder has sent; each can be redelivered
  rev,      \* mechanism: current registration revision
  head,     \* mechanism: the head of the chain, or None
  applied,  \* mechanism: decisions applied, in apply order (the projection)
  seen,     \* mechanism: success table of ordinary commits (complete inputs)
  fence,    \* mechanism: "open" or "closed" replay fence
  crashes,  \* crashes so far
  acks,     \* inputs the holder received an "applied" answer for
  last      \* the last delivery: its answer, its kind, and whether its
            \* identity was applied in this instance but is no longer kept

vars == <<log, used, calls, rev, head, applied, seen, fence, crashes, acks, last>>

Kinds == {"reg", "step"}
Range(s) == {s[i] : i \in 1..Len(s)}
Decision == [id : Ids, kind : Kinds, basis : 0..Cardinality(Ids),
             after : Ids \cup {None}, p : Payloads]
IsPrefix(a, b) == Len(a) <= Len(b) /\ \A i \in 1..Len(a) : a[i] = b[i]
RegCount(s) == Cardinality({i \in 1..Len(s) : s[i].kind = "reg"})
Tip(s) == IF s = <<>> THEN None ELSE s[Len(s)].id
SeenIds == {c.id : c \in seen}
SeenOf(id) == CHOOSE c \in seen : c.id = id
AppliedIds == {a.id : a \in Range(applied)}
Answers == {"none", "applied", "retried", "conflict", "replay-incomplete", "out-of-order"}

TypeOK ==
  /\ log \in Seq(Decision)
  /\ used \subseteq Ids
  /\ calls \subseteq Decision
  /\ rev \in Nat
  /\ head \in Ids \cup {None}
  /\ applied \in Seq(Decision)
  /\ seen \subseteq Decision
  /\ fence \in {"open", "closed"}
  /\ crashes \in 0..MaxCrashes
  /\ acks \subseteq Decision
  /\ last \in [ans : Answers, kind : Kinds \cup {"none"}, stale : BOOLEAN]

(* A fresh mechanism instance opens through an empty replay (RC-09).       *)
Init ==
  /\ log = <<>>
  /\ used = {}
  /\ calls = {}
  /\ rev = 0
  /\ head = None
  /\ applied = <<>>
  /\ seen = {}
  /\ fence = "open"
  /\ crashes = 0
  /\ acks = {}
  /\ last = [ans |-> "none", kind |-> "none", stale |-> FALSE]

-----------------------------------------------------------------------------
(* Holder side                                                             *)

(* The decision the holder writes at the end of its log. The basis is the  *)
(* holder's own revision (the comparison happens before the holder         *)
(* commits); "after" is the record before it.                              *)
Decide(id, k, p) ==
  [id |-> id, kind |-> k, basis |-> IF k = "reg" THEN RegCount(log) ELSE 0,
   after |-> Tip(log), p |-> p]

(* The holder's durable commit succeeds.                                   *)
CommitOk(id, k, p) ==
  /\ id \notin used
  /\ log' = Append(log, Decide(id, k, p))
  /\ used' = used \cup {id}
  /\ calls' = IF ApplyBeforeCommit THEN calls \cup {Decide(id, k, p)} ELSE calls
  /\ UNCHANGED <<rev, head, applied, seen, fence, crashes, acks, last>>

(* The holder's durable commit fails. Nothing is written. Only the broken  *)
(* holder has already sent the call.                                       *)
CommitFail(id, k, p) ==
  /\ id \notin used
  /\ used' = used \cup {id}
  /\ calls' = IF ApplyBeforeCommit THEN calls \cup {Decide(id, k, p)} ELSE calls
  /\ UNCHANGED <<log, rev, head, applied, seen, fence, crashes, acks, last>>

(* After its commit is durable, the holder hands the decision to the       *)
(* mechanism. It may send it again at any time (retry).                    *)
Send(i) ==
  /\ i \in 1..Len(log)
  /\ calls' = calls \cup {log[i]}
  /\ UNCHANGED <<log, used, rev, head, applied, seen, fence, crashes, acks, last>>

(* A rewritten retry: an identity the mechanism applied in this instance,  *)
(* with another complete input. While the identity is kept, the contract   *)
(* answers it (commit-conflict). After its release, the chain decides.     *)
(* Assumption A1: the first input with an identity is the committed one;   *)
(* the mechanism cannot tell a committed input from a forged one, the      *)
(* holder authority and the holder's own discipline do (RC-02).            *)
SendConflict(i, q) ==
  /\ i \in 1..Len(log)
  /\ log[i].id \in SeenIds \cup AppliedIds
  /\ q # log[i].p
  /\ calls' = calls \cup {[log[i] EXCEPT !.p = q]}
  /\ UNCHANGED <<log, used, rev, head, applied, seen, fence, crashes, acks, last>>

-----------------------------------------------------------------------------
(* Mechanism side: applyCommit (runtime-context src/holder.ts)             *)

Answer(a, c) ==
  [ans |-> a, kind |-> c.kind, stale |-> c.id \notin SeenIds /\ c.id \in AppliedIds]

Deliver(c) ==
  /\ c \in calls
  /\ IF c.id \in SeenIds
       THEN \* retry: same complete input -> the original result; else conflict
            LET same == IdOnlyDedupe \/ SeenOf(c.id) = c IN
            /\ acks' = IF same THEN acks \cup {c} ELSE acks
            /\ last' = Answer(IF same THEN "retried" ELSE "conflict", c)
            /\ UNCHANGED <<rev, head, applied, seen>>
       ELSE IF fence = "closed"
         THEN /\ last' = Answer("replay-incomplete", c)
              /\ UNCHANGED <<rev, head, applied, seen, acks>>
       ELSE IF (~NoAfterCheck /\ c.after # head)
               \/ (c.kind = "reg" /\ ~IgnoreBasis /\ c.basis # rev)
         THEN /\ last' = Answer("out-of-order", c)
              /\ UNCHANGED <<rev, head, applied, seen, acks>> \* not remembered
       ELSE /\ applied' = Append(applied, c)
            /\ rev' = IF c.kind = "reg" THEN rev + 1 ELSE rev
            /\ head' = c.id
            \* R2-D319: the new entry releases the one before it.
            /\ seen' = IF NoRelease THEN seen \cup {c} ELSE {c}
            /\ acks' = acks \cup {c}
            /\ last' = Answer("applied", c)
  /\ UNCHANGED <<log, used, calls, fence, crashes>>

(* The process ends. The instance loses every table (it holds no durable   *)
(* state). The holder's log and its received answers stay.                 *)
Crash ==
  /\ crashes < MaxCrashes
  /\ crashes' = crashes + 1
  /\ rev' = 0
  /\ head' = None
  /\ applied' = <<>>
  /\ seen' = {}
  /\ fence' = "closed"
  /\ UNCHANGED <<log, used, calls, acks, last>>

(* beginReplay + finishReplay with the holder's complete log. The holder   *)
(* authority accepts only material that covers every success the instance *)
(* reports (RC-09). The last record becomes the head; an entry that is not *)
(* at the head is released.                                                *)
Replay ==
  /\ seen \subseteq Range(log)
  /\ applied' = log
  /\ rev' = RegCount(log)
  /\ head' = Tip(log)
  /\ seen' = IF NoRelease THEN seen ELSE {c \in seen : c.id = Tip(log)}
  /\ fence' = "open"
  /\ UNCHANGED <<log, used, calls, crashes, acks, last>>

Next ==
  \/ \E id \in Ids, k \in Kinds, p \in Payloads : CommitOk(id, k, p) \/ CommitFail(id, k, p)
  \/ \E i \in 1..Len(log) : Send(i)
  \/ \E i \in 1..Len(log), q \in Payloads : SendConflict(i, q)
  \/ \E c \in calls : Deliver(c)
  \/ Crash
  \/ Replay

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties                                                              *)

(* P1. The projection is a prefix of the holder's durable log: nothing is  *)
(* applied that the holder did not commit, and the order is the log order. *)
(* There is no "applied, not committed" state.                             *)
P1_CommittedPrefix == IsPrefix(applied, log)

(* P1. The registration revision counts the applied registrations.         *)
P1_RevIsLength == rev = RegCount(applied)

(* P1. No decision is applied twice in one instance.                       *)
P1_AppliedOnce ==
  \A i, j \in 1..Len(applied) : i < j => applied[i].id # applied[j].id

(* P2. An "applied" answer is given only for a complete input the holder   *)
(* committed. A retry with another input is never acknowledged as applied. *)
P2_AckMeansCommitted == acks \subseteq Range(log)

(* P2. The success table holds only applied, committed inputs. Failures    *)
(* (out-of-order, replay-incomplete, conflict) are not remembered.         *)
P2_SeenIsApplied == seen \subseteq Range(log)

(* P3. The success table stays under a fixed bound: one entry for the      *)
(* scope, whatever the number of applied decisions (R2-D319).              *)
P3_SeenBounded == Cardinality(seen) <= DedupeCap

(* P3. A decision that this instance applied but no longer keeps          *)
(* (released, or installed by a replay) is answered out-of-order. It is    *)
(* neither applied again nor acknowledged. Both kinds.                     *)
P3_StaleRetryRefused == last.stale => last.ans = "out-of-order"

=============================================================================
