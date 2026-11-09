--------------------------- MODULE BodyLifecycle ---------------------------
(***************************************************************************)
(* The life of the bodies of one tool call when the ledger and the body    *)
(* store are two independent stores (no shared transaction, no snapshot    *)
(* isolation) and every participant reads its own clock.                   *)
(*                                                                         *)
(* Participants: issuer (the ledger node that commits `opened` and issues  *)
(* write permits), settler (the ledger node that commits the result),      *)
(* store (immutable chunks and a sealed manifest), sweeper, reader. Their  *)
(* clocks are true time plus a fixed offset in 0..Eps, so any two clocks   *)
(* differ by at most Eps. The offsets are chosen at Init.                  *)
(*                                                                         *)
(* Ledger authority per body: none -> opened -> sealed -> linked ->        *)
(* reclaimed, or opened/sealed -> orphaned -> reclaimed. Only the ledger   *)
(* makes a body reachable. The store knows no business state; it checks a *)
(* permit deadline with its own clock and refuses writes to a sealed body. *)
(*                                                                         *)
(* Bug = "none" is the contract. Each other value removes one rule; the   *)
(* parameter controls (G, D) are plain constant changes.                   *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS
  Bodies,     \* the bodies the call may open
  Eps,        \* pairwise clock skew bound
  W,          \* a permit lasts at most W on the issuer's clock
  G,          \* orphan grace: due = settler now + G
  D,          \* retention of a linked body: expiresAt = settler now + D
  TAct,       \* true time until which begin, renew and settle may happen
  MaxPermits, \* permits per body (begin plus renewals)
  MaxCrashes, \* sweeper crashes between delete and reclaim
  MaxFaults,  \* store losing a sealed linked body (makes `integrity` reachable)
  Bug

Status == {"none", "opened", "sealed", "linked", "orphaned", "reclaimed"}
Participants == {"issuer", "settler", "store", "sweeper", "reader"}
Max(a, b) == IF a > b THEN a ELSE b
Tmax == TAct + Eps + Max(G, D)   \* every due is reached on every clock by Tmax

VARIABLES
  t,            \* true time
  off,          \* participant -> fixed clock offset in 0..Eps
  status,       \* ledger status per body
  deadline,     \* latest permit deadline per body, 0 = no permit
  issued,       \* permits issued per body
  bytes,        \* store: the body's chunks are present
  storeSealed,  \* store: the manifest is written
  everSealed,   \* ghost: the store sealed this body at some time
  expiresAt,    \* ledger: result descriptor deadline, 0 = not linked
  due,          \* ledger due index, 0 = unscheduled
  settled,      \* the call is settled (result committed)
  published,    \* references given to the model
  swDeleted,    \* sweeper memory: bytes deleted, reclaim not yet committed
  crashes, faults,
  pending,      \* the body whose read passed the ledger check ({} or {b})
  lastAnswer,   \* ghost: the reader's latest answer, {} or one record
  lastDelete    \* ghost: the sweeper's latest delete, {} or one record

vars == <<t, off, status, deadline, issued, bytes, storeSealed, everSealed,
          expiresAt, due, settled, published, swDeleted, crashes, faults,
          pending, lastAnswer, lastDelete>>

Now(p) == t + off[p]

Init ==
  /\ t = 0
  /\ off \in [Participants -> 0..Eps]
  /\ status = [b \in Bodies |-> "none"]
  /\ deadline = [b \in Bodies |-> 0]
  /\ issued = [b \in Bodies |-> 0]
  /\ bytes = [b \in Bodies |-> FALSE]
  /\ storeSealed = [b \in Bodies |-> FALSE]
  /\ everSealed = [b \in Bodies |-> FALSE]
  /\ expiresAt = [b \in Bodies |-> 0]
  /\ due = [b \in Bodies |-> 0]
  /\ settled = FALSE
  /\ published = {}
  /\ swDeleted = [b \in Bodies |-> FALSE]
  /\ crashes = 0
  /\ faults = 0
  /\ pending = {}
  /\ lastAnswer = {}
  /\ lastDelete = {}

(* A page read completes within one time unit: its duration is part of Eps. *)
Tick ==
  /\ t < Tmax
  /\ pending = {}
  /\ t' = t + 1
  \* a deadline below the new true time never satisfies a checking store again;
  \* all such deadlines share one representative (t, i.e. the new time minus one)
  /\ deadline' = [b \in Bodies |-> IF deadline[b] > 0 /\ deadline[b] < t + 1 THEN t
                                   ELSE deadline[b]]
  /\ UNCHANGED <<off, status, issued, bytes, storeSealed, everSealed,
                 expiresAt, due, settled, published, swDeleted, crashes, faults,
                 pending>>

-----------------------------------------------------------------------------
(* Writer and issuer *)

(* begin: commit `opened`, then issue a permit. The commit may apply with its
   answer lost (no permit; the writer recalls it with Renew), or not apply. *)
Begin(b) ==
  /\ t <= TAct
  /\ ~settled
  /\ status[b] = "none"
  /\ issued[b] < MaxPermits
  /\ \/ /\ status' = [status EXCEPT ![b] = "opened"]
        /\ deadline' = [deadline EXCEPT ![b] = Now("issuer") + W]
        /\ issued' = [issued EXCEPT ![b] = @ + 1]
     \/ /\ status' = [status EXCEPT ![b] = "opened"]
        /\ UNCHANGED <<deadline, issued>>
     \/ /\ Bug = "permit-on-unknown"
        /\ deadline' = [deadline EXCEPT ![b] = Now("issuer") + W]
        /\ issued' = [issued EXCEPT ![b] = @ + 1]
        /\ UNCHANGED status
  /\ UNCHANGED <<t, off, bytes, storeSealed, everSealed, expiresAt, due, settled,
                 published, swDeleted, crashes, faults, pending>>

(* renew: the ledger re-issues a permit while the execution is active. *)
Renew(b) ==
  /\ t <= TAct
  /\ ~settled
  /\ status[b] = "opened"
  /\ issued[b] < MaxPermits
  /\ deadline' = [deadline EXCEPT ![b] = Now("issuer") + W]
  /\ issued' = [issued EXCEPT ![b] = @ + 1]
  /\ UNCHANGED <<t, off, status, bytes, storeSealed, everSealed, expiresAt, due,
                 settled, published, swDeleted, crashes, faults, pending>>

PermitValid(b) == deadline[b] > 0 /\ (Now("store") <= deadline[b] \/ Bug = "store-ignores-deadline")

(* put: the store accepts a chunk under a valid permit; a sealed body is immutable. *)
Put(b) ==
  /\ PermitValid(b)
  /\ ~storeSealed[b]
  /\ ~bytes[b]
  /\ bytes' = [bytes EXCEPT ![b] = TRUE]
  /\ UNCHANGED <<t, off, status, deadline, issued, storeSealed, everSealed, expiresAt,
                 due, settled, published, swDeleted, crashes, faults, pending>>

(* store seal: chunks complete, permit valid; success means the body is durable. *)
StoreSeal(b) ==
  /\ PermitValid(b)
  /\ bytes[b]
  /\ ~storeSealed[b]
  /\ storeSealed' = [storeSealed EXCEPT ![b] = TRUE]
  /\ everSealed' = [everSealed EXCEPT ![b] = TRUE]
  /\ UNCHANGED <<t, off, status, deadline, issued, bytes, expiresAt, due, settled,
                 published, swDeleted, crashes, faults, pending>>

(* ledger seal: after the store seal; refused once the call is settled. *)
LedgerSeal(b) ==
  /\ storeSealed[b]
  /\ IF Bug = "seal-after-settle"
       THEN status[b] \in {"opened", "orphaned"}
       ELSE ~settled /\ status[b] = "opened"
  /\ status' = [status EXCEPT ![b] = "sealed"]
  /\ UNCHANGED <<t, off, deadline, issued, bytes, storeSealed, everSealed, expiresAt,
                 due, settled, published, swDeleted, crashes, faults, pending>>

-----------------------------------------------------------------------------
(* Settler *)

Linkable == IF Bug = "link-unsealed"
              THEN {b \in Bodies : status[b] \in {"opened", "sealed"}}
              ELSE {b \in Bodies : status[b] = "sealed"}

(* commit result: link the referenced sealed bodies, fix expiresAt, schedule them;
   orphan every other opened/sealed body with due = now + G; publish references. *)
Settle ==
  /\ t <= TAct
  /\ ~settled
  /\ \E L \in SUBSET Linkable :
       LET Orphan(b) == b \notin L /\ status[b] \in {"opened", "sealed"}
           now == Now("settler") IN
       /\ status' = [b \in Bodies |-> IF b \in L THEN "linked"
                                       ELSE IF Orphan(b) THEN "orphaned"
                                       ELSE status[b]]
       /\ expiresAt' = [b \in Bodies |-> IF b \in L THEN now + D ELSE expiresAt[b]]
       /\ due' = [b \in Bodies |-> IF b \in L THEN now + D
                                   ELSE IF Orphan(b) THEN now + G
                                   ELSE due[b]]
       /\ published' = L
  /\ settled' = TRUE
  /\ UNCHANGED <<t, off, deadline, issued, bytes, storeSealed, everSealed, swDeleted,
                 crashes, faults, pending>>

-----------------------------------------------------------------------------
(* Sweeper *)

Due(b) == due[b] > 0 /\ (due[b] <= Now("sweeper") \/ Bug = "sweep-before-due")

(* delete the bytes of a due entry (idempotent), remember it locally. *)
DeleteBytes(b) ==
  /\ Due(b)
  /\ bytes' = [bytes EXCEPT ![b] = FALSE]
  /\ storeSealed' = [storeSealed EXCEPT ![b] = FALSE]
  /\ swDeleted' = [swDeleted EXCEPT ![b] = TRUE]
  /\ lastDelete' = {[at |-> t, body |-> b]}
  /\ UNCHANGED <<t, off, status, deadline, issued, everSealed, expiresAt, due, settled,
                 published, crashes, faults, pending>>

(* commit `reclaimed` and unschedule, trusting the delete the sweeper remembers. *)
Reclaim(b) ==
  /\ swDeleted[b]
  /\ due[b] > 0
  /\ status' = [status EXCEPT ![b] = "reclaimed"]
  /\ due' = [due EXCEPT ![b] = 0]
  /\ swDeleted' = [swDeleted EXCEPT ![b] = FALSE]
  /\ UNCHANGED <<t, off, deadline, issued, bytes, storeSealed, everSealed, expiresAt,
                 settled, published, crashes, faults, pending>>

(* crash between delete and reclaim: the sweeper forgets, the due entry stays. *)
SweeperCrash ==
  /\ crashes < MaxCrashes
  /\ \E b \in Bodies : swDeleted[b]
  /\ swDeleted' = [b \in Bodies |-> FALSE]
  /\ crashes' = crashes + 1
  /\ UNCHANGED <<t, off, status, deadline, issued, bytes, storeSealed, everSealed,
                 expiresAt, due, settled, published, faults, pending>>

(* the store loses a durable linked body: outside the contract, present so that a
   true `integrity` answer is reachable. *)
StoreFault(b) ==
  /\ faults < MaxFaults
  /\ status[b] = "linked"
  /\ storeSealed[b]
  /\ bytes' = [bytes EXCEPT ![b] = FALSE]
  /\ storeSealed' = [storeSealed EXCEPT ![b] = FALSE]
  /\ faults' = faults + 1
  /\ UNCHANGED <<t, off, status, deadline, issued, everSealed, expiresAt, due, settled,
                 published, swDeleted, crashes, pending>>

-----------------------------------------------------------------------------
(* Reader: authorization and result version are abstracted as granted. *)

(* the ledger check passes: linked and now < expiresAt on the reader's clock. *)
ReadBegin(b) ==
  /\ pending = {}
  /\ b \in published
  /\ status[b] = "linked"
  /\ Now("reader") < expiresAt[b]
  /\ pending' = {b}
  /\ UNCHANGED <<t, off, status, deadline, issued, bytes, storeSealed, everSealed,
                 expiresAt, due, settled, published, swDeleted, crashes, faults>>

(* the ledger check refuses: expired on the reader's clock. *)
ReadRefuse(b) ==
  /\ pending = {}
  /\ b \in published
  /\ status[b] = "linked"
  /\ Now("reader") >= expiresAt[b]
  /\ lastAnswer' = {[kind |-> "refused", body |-> b, at |-> t]}
  /\ UNCHANGED <<t, off, status, deadline, issued, bytes, storeSealed, everSealed,
                 expiresAt, due, settled, published, swDeleted, crashes, faults,
                 pending>>

RecheckExpired(b) ==
  \/ status[b] \in {"reclaimed", "orphaned"}
  \/ /\ Bug # "recheck-only-reclaimed"
     /\ expiresAt[b] <= Now("reader") + Eps

(* the store read: bytes, or a miss followed by the ledger re-check. *)
ReadFinish ==
  /\ pending # {}
  /\ LET b == CHOOSE x \in pending : TRUE IN
       /\ pending' = {}
       /\ IF bytes[b] /\ storeSealed[b]
            THEN lastAnswer' = {[kind |-> "success", body |-> b, at |-> t]}
            ELSE IF RecheckExpired(b)
                   THEN lastAnswer' = {[kind |-> "expired", body |-> b, at |-> t]}
                   ELSE lastAnswer' = {[kind |-> "integrity", body |-> b, at |-> t,
                                        st |-> status[b]]}
  /\ UNCHANGED <<t, off, status, deadline, issued, bytes, storeSealed, everSealed,
                 expiresAt, due, settled, published, swDeleted, crashes, faults>>

-----------------------------------------------------------------------------
(* The ghosts are observed only in the state that produces them. *)
Observed == lastAnswer' = {} /\ lastDelete' = {}

Next ==
  \/ /\ \/ Tick
        \/ \E b \in Bodies : Begin(b) \/ Renew(b) \/ Put(b) \/ StoreSeal(b) \/ LedgerSeal(b)
        \/ Settle
        \/ \E b \in Bodies : Reclaim(b) \/ StoreFault(b) \/ ReadBegin(b)
        \/ SweeperCrash
     /\ Observed
  \/ \E b \in Bodies : DeleteBytes(b) /\ lastAnswer' = {}
  \/ \E b \in Bodies : ReadRefuse(b) /\ lastDelete' = {}
  \/ ReadFinish /\ lastDelete' = {}

Perm == Permutations(Bodies)

Spec == Init /\ [][Next]_vars

(* Time progresses even while reads interleave (strong fairness on Tick); the
   sweeper and the reader finish what they start (weak fairness). *)
Fairness ==
  /\ SF_vars(Tick /\ Observed)
  /\ WF_vars(ReadFinish /\ lastDelete' = {})
  /\ \A b \in Bodies : WF_vars(DeleteBytes(b) /\ lastAnswer' = {})
                     /\ WF_vars(Reclaim(b) /\ Observed)

LiveSpec == Spec /\ Fairness

-----------------------------------------------------------------------------
(* Properties *)

TypeOK ==
  /\ t \in 0..Tmax
  /\ off \in [Participants -> 0..Eps]
  /\ status \in [Bodies -> Status]
  /\ deadline \in [Bodies -> Nat]
  /\ issued \in [Bodies -> 0..MaxPermits]
  /\ bytes \in [Bodies -> BOOLEAN]
  /\ storeSealed \in [Bodies -> BOOLEAN]
  /\ expiresAt \in [Bodies -> Nat]
  /\ due \in [Bodies -> Nat]
  /\ published \subseteq Bodies
  /\ pending \subseteq Bodies /\ Cardinality(pending) <= 1
  /\ crashes \in 0..MaxCrashes /\ faults \in 0..MaxFaults

NoBytes(b) == ~bytes[b] /\ ~storeSealed[b]

(* I-7. A published reference names a body the store sealed and the ledger linked. *)
PublishedDurable ==
  \A b \in published : everSealed[b] /\ status[b] \in {"linked", "reclaimed"}

(* Intent before bytes: the store holds bytes only for bodies the ledger opened. *)
IntentBeforeBytes ==
  \A b \in Bodies : ~NoBytes(b) => status[b] # "none"

(* I-5, upper side of the window: a successful read of a published, linked body
   happens before expiresAt + Eps on the clock that fixed expiresAt. *)
ReadWithinWindow ==
  \A a \in lastAnswer : a.kind = "success" =>
    /\ a.body \in published
    /\ expiresAt[a.body] > 0
    /\ a.at + off["settler"] < expiresAt[a.body] + Eps

(* I-5, lower side of the window: a refusal for expiry happens no earlier than
   expiresAt - Eps on the clock that fixed expiresAt. *)
RefusalWithinWindow ==
  \A a \in lastAnswer : a.kind = "refused" =>
    a.at + off["settler"] + Eps >= expiresAt[a.body]

(* I-5, I-10. The sweeper deletes a linked body only at or after its due on its own
   clock, and never before expiresAt - Eps in true time. *)
NoEarlyDelete ==
  \A d \in lastDelete : expiresAt[d.body] > 0 =>
    /\ d.at + off["sweeper"] >= expiresAt[d.body]
    /\ d.at + Eps >= expiresAt[d.body]

(* I-10. `reclaimed` is the end: a reclaimed body has no bytes in the store. *)
ReclaimedLeavesNoBytes ==
  \A b \in Bodies : status[b] = "reclaimed" => NoBytes(b)

(* I-5. `integrity` is answered only for a linked body clearly before expiry. *)
NoFalseIntegrity ==
  \A a \in lastAnswer : a.kind = "integrity" =>
    /\ a.st = "linked"
    /\ expiresAt[a.body] > a.at + off["reader"] + Eps

(* Settlement closes writing: afterwards no body is opened or sealed. *)
NoWriteAfterSettle ==
  settled => \A b \in Bodies : status[b] \notin {"opened", "sealed"}

(* I-10 at quiescence: the call is settled, time has passed every due, nothing is
   scheduled; then the store holds no bytes of this call. *)
Quiescent == settled /\ t = Tmax /\ \A b \in Bodies : due[b] = 0
QuiescentStoreEmpty == Quiescent => \A b \in Bodies : NoBytes(b)

(* Liveness under Fairness: once settled, every body ends none or reclaimed. *)
EventuallyReclaimed ==
  settled ~> \A b \in Bodies : status[b] \in {"none", "reclaimed"}

=============================================================================
