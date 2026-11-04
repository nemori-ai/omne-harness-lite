---- MODULE AttemptGrant ----
(***************************************************************************)
(* The grant of an Authority resolves to the attempt it was issued for.    *)
(*                                                                         *)
(* One Run. The Session starts attempts in order; under the current        *)
(* attempt it commits Agent writes. Every commit issues one receipt, and   *)
(* the receipt's source is the grant an Authority later carries. At commit *)
(* time the Session records receipt -> attempt in its index (R2-D349:      *)
(* `sl_attempt_grant`, written by the participant with the batch). A read  *)
(* resolves a grant through that index alone; it infers nothing at read    *)
(* time.                                                                   *)
(*                                                                         *)
(* The bug switch is the former production read: only the `started`       *)
(* receipt of an attempt was indexed, and a grant the index did not hold   *)
(* resolved to the only attempt of the Run when the Run had one. Correct   *)
(* while a Run has one attempt; wrong once a second attempt starts (a      *)
(* claim after a takeover): a grant of the second attempt resolves to      *)
(* unknown, and a grant of the first attempt no longer resolves at all.    *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS
  MaxAttempts,   \* attempts the Run may start
  MaxReceipts,   \* receipts the Session may issue
  StartedOnly    \* bug: only the started receipt is indexed; a miss falls back to the single attempt

ASSUME MaxAttempts \in Nat /\ MaxAttempts >= 1
ASSUME MaxReceipts \in Nat /\ MaxReceipts >= MaxAttempts

VARIABLES
  attempts,   \* attempts started so far; the k-th started is attempt k, the last is current
  receipts,   \* Seq of [attempt, kind]: every receipt issued, in commit order (its position)
  index       \* position -> attempt: the receipt-to-attempt index, written at commit time

vars == <<attempts, receipts, index>>

EmptyFn == [x \in {} |-> 0]
Unknown == 0

(* The Session issues one receipt under attempt a and records it in the index with the
   same commit. The bug records the started receipt only. *)
Issue(kind, a) ==
  /\ receipts' = Append(receipts, [attempt |-> a, kind |-> kind])
  /\ index' = IF StartedOnly /\ kind /= "started" THEN index
              ELSE index @@ ((Len(receipts) + 1) :> a)

StartAttempt ==
  /\ attempts < MaxAttempts /\ Len(receipts) < MaxReceipts
  /\ attempts' = attempts + 1
  /\ Issue("started", attempts + 1)

Commit ==
  /\ attempts >= 1 /\ Len(receipts) < MaxReceipts
  /\ UNCHANGED attempts
  /\ Issue("commit", attempts)

(* The read of a grant: the index answers. A receipt the index does not hold answers the only
   attempt of the Run when the Run has one (the former fallback), else unknown. The design
   never reaches the fallback: every receipt is indexed when it is issued. *)
Resolve(r) ==
  IF r \in DOMAIN index THEN index[r]
  ELSE IF attempts = 1 THEN 1 ELSE Unknown

Init == attempts = 0 /\ receipts = <<>> /\ index = EmptyFn
Next == StartAttempt \/ Commit
Spec == Init /\ [][Next]_vars

----------------------------------------------------------------------------
(* Properties *)

TypeOK == attempts \in 0..MaxAttempts /\ Len(receipts) <= MaxReceipts

(* Every grant resolves to the attempt that was current when the Session issued it, whatever
   the number of attempts the Run has started since. *)
GrantResolves == \A r \in 1..Len(receipts) : Resolve(r) = receipts[r].attempt

(* A grant of an earlier attempt never resolves to the current attempt: the consumer that
   checks "is this the advance" sees stale, never a false current. *)
StaleStaysStale ==
  \A r \in 1..Len(receipts) : receipts[r].attempt < attempts => Resolve(r) /= attempts

(* The index is written at commit time and never rewritten: no read-time inference. *)
IndexAtCommit ==
  [][\A r \in DOMAIN index : r \in DOMAIN index' /\ index'[r] = index[r]]_vars

====
