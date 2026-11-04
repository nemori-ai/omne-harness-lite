------------------------------ MODULE RcCommit ------------------------------
(***************************************************************************)
(* Runtime Context: the holder commits a registration decision first, and  *)
(* the mechanism applies only what the holder committed (RC-02, "注册修订与 *)
(* 提交顺序"). The holder log is the only authority of the registration    *)
(* revision; the mechanism table is a projection applied in commit order.  *)
(*                                                                         *)
(* Abstractions. One scope. A registration decision is [id, basis, p]: the *)
(* commit identity, the registration revision it is based on, and a        *)
(* payload that stands for the rest of the complete input. Step commits    *)
(* and scope end are not modelled. A call may be delivered any number of   *)
(* times and in any order (retry, duplicate, reordering). A crash loses    *)
(* the whole mechanism; replay installs the holder log (RC-09), after the  *)
(* holder authority checked that the log covers every success the instance *)
(* knows.                                                                  *)
(*                                                                         *)
(* Switches. All FALSE is the design. A negative control turns one on.     *)
(*   ApplyBeforeCommit  the holder calls applyCommit before its own commit *)
(*                      is durable, and keeps the call when it fails.      *)
(*   IgnoreBasis        the mechanism applies a decision whatever its      *)
(*                      basis (last writer wins).                          *)
(*   IdOnlyDedupe       a retry is matched by the commit identity only,    *)
(*                      not by the complete input.                         *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Ids, Payloads, MaxCrashes, DedupeCap,
          ApplyBeforeCommit, IgnoreBasis, IdOnlyDedupe

VARIABLES
  log,      \* holder durable log: sequence of decisions [id, basis, p]
  used,     \* commit identities the holder has spent (written or failed)
  calls,    \* applyCommit inputs the holder has sent; each can be redelivered
  rev,      \* mechanism: current registration revision
  applied,  \* mechanism: decisions applied, in apply order (the projection)
  seen,     \* mechanism: success table of ordinary commits (complete inputs)
  fence,    \* mechanism: "open" or "closed" replay fence
  crashes,  \* crashes so far
  acks      \* inputs the holder received an "applied" answer for

vars == <<log, used, calls, rev, applied, seen, fence, crashes, acks>>

Range(s) == {s[i] : i \in 1..Len(s)}
Decision == [id : Ids, basis : 0..Cardinality(Ids), p : Payloads]
IsPrefix(a, b) == Len(a) <= Len(b) /\ \A i \in 1..Len(a) : a[i] = b[i]
SeenIds == {c.id : c \in seen}
SeenOf(id) == CHOOSE c \in seen : c.id = id

TypeOK ==
  /\ log \in Seq(Decision)
  /\ used \subseteq Ids
  /\ calls \subseteq Decision
  /\ rev \in Nat
  /\ applied \in Seq(Decision)
  /\ seen \subseteq Decision
  /\ fence \in {"open", "closed"}
  /\ crashes \in 0..MaxCrashes
  /\ acks \subseteq Decision

(* A fresh mechanism instance opens through an empty replay (RC-09).       *)
Init ==
  /\ log = <<>>
  /\ used = {}
  /\ calls = {}
  /\ rev = 0
  /\ applied = <<>>
  /\ seen = {}
  /\ fence = "open"
  /\ crashes = 0
  /\ acks = {}

-----------------------------------------------------------------------------
(* Holder side                                                             *)

(* The holder's durable commit succeeds. The basis is the holder's own     *)
(* revision: the revision comparison happens before the holder commits.    *)
CommitOk(id, p) ==
  /\ id \notin used
  /\ LET d == [id |-> id, basis |-> Len(log), p |-> p] IN
       /\ log' = Append(log, d)
       /\ used' = used \cup {id}
       /\ calls' = IF ApplyBeforeCommit THEN calls \cup {d} ELSE calls
  /\ UNCHANGED <<rev, applied, seen, fence, crashes, acks>>

(* The holder's durable commit fails. Nothing is written. Only the broken  *)
(* holder has already sent the call.                                       *)
CommitFail(id, p) ==
  /\ id \notin used
  /\ used' = used \cup {id}
  /\ calls' = IF ApplyBeforeCommit
                THEN calls \cup {[id |-> id, basis |-> Len(log), p |-> p]}
                ELSE calls
  /\ UNCHANGED <<log, rev, applied, seen, fence, crashes, acks>>

(* After its commit is durable, the holder hands the decision to the       *)
(* mechanism. It may send it again at any time (retry).                    *)
Send(i) ==
  /\ i \in 1..Len(log)
  /\ calls' = calls \cup {log[i]}
  /\ UNCHANGED <<log, used, rev, applied, seen, fence, crashes, acks>>

(* A rewritten retry: an identity the mechanism already applied, with     *)
(* another complete input. The contract answers it (commit-conflict).      *)
(* Assumption A1: the first input with an identity is the committed one;   *)
(* the mechanism cannot tell a committed input from a forged one, the      *)
(* holder authority and the holder's own discipline do (RC-02).           *)
SendConflict(i, q) ==
  /\ i \in 1..Len(log)
  /\ log[i].id \in SeenIds
  /\ q # log[i].p
  /\ calls' = calls \cup {[log[i] EXCEPT !.p = q]}
  /\ UNCHANGED <<log, used, rev, applied, seen, fence, crashes, acks>>

-----------------------------------------------------------------------------
(* Mechanism side: applyCommit (runtime-context src/holder.ts)             *)

Deliver(c) ==
  /\ c \in calls
  /\ IF c.id \in SeenIds
       THEN \* retry: same complete input -> the original result; else conflict
            /\ acks' = IF IdOnlyDedupe \/ SeenOf(c.id) = c THEN acks \cup {c} ELSE acks
            /\ UNCHANGED <<rev, applied, seen>>
       ELSE IF fence = "closed"
         THEN UNCHANGED <<rev, applied, seen, acks>>        \* replay-incomplete
         ELSE IF IgnoreBasis \/ c.basis = rev
           THEN /\ applied' = Append(applied, c)
                /\ rev' = rev + 1
                /\ seen' = seen \cup {c}
                /\ acks' = acks \cup {c}
           ELSE UNCHANGED <<rev, applied, seen, acks>>      \* out-of-order, not remembered
  /\ UNCHANGED <<log, used, calls, fence, crashes>>

(* The process ends. The instance loses every table (it holds no durable   *)
(* state). The holder's log and its received answers stay.                 *)
Crash ==
  /\ crashes < MaxCrashes
  /\ crashes' = crashes + 1
  /\ rev' = 0
  /\ applied' = <<>>
  /\ seen' = {}
  /\ fence' = "closed"
  /\ UNCHANGED <<log, used, calls, acks>>

(* beginReplay + finishReplay with the holder's complete log. The holder   *)
(* authority accepts only material that covers every success the instance *)
(* reports (RC-09). The success table is kept (src/world.ts commits).      *)
Replay ==
  /\ seen \subseteq Range(log)
  /\ applied' = log
  /\ rev' = Len(log)
  /\ fence' = "open"
  /\ UNCHANGED <<log, used, calls, seen, crashes, acks>>

Next ==
  \/ \E id \in Ids, p \in Payloads : CommitOk(id, p) \/ CommitFail(id, p)
  \/ \E i \in 1..Len(log) : Send(i)
  \/ \E i \in 1..Len(log), q \in Payloads : SendConflict(i, q)
  \/ \E c \in calls : Deliver(c)
  \/ Crash
  \/ Replay

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties                                                              *)

(* P1. The projection is a prefix of the holder's durable log: nothing is  *)
(* applied that the holder did not commit, and the order is the commit     *)
(* order. There is no "applied, not committed" state.                      *)
P1_CommittedPrefix == IsPrefix(applied, log)

(* P1. The registration revision counts the applied decisions.             *)
P1_RevIsLength == rev = Len(applied)

(* P2. An "applied" answer is given only for a complete input the holder   *)
(* committed. A retry with another input is never acknowledged as applied. *)
P2_AckMeansCommitted == acks \subseteq Range(log)

(* P2. The success table holds only applied, committed inputs. Failures    *)
(* (out-of-order, replay-incomplete, conflict) are not remembered.         *)
P2_SeenIsApplied == seen \subseteq Range(log)

(* P3 (probe). The success table stays under a fixed bound. The design has *)
(* no release rule except a crash, so this is expected to fail once more   *)
(* than DedupeCap decisions apply. Reported as a defect, not a control.    *)
P3_SeenBounded == Cardinality(seen) <= DedupeCap

=============================================================================
