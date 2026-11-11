------------------------------ MODULE Admission ------------------------------
(***************************************************************************)
(* The admission of one logical Model call as the Commands decide it: the   *)
(* caller fixes a call id, an admission operation and a fixed input; admit  *)
(* commits, conflicts, waits on a full share, or stays commit-unknown; the  *)
(* caller recalls the operation, and only an authoritative `not-accepted`   *)
(* (no record, no unresolved write of that operation) lets it resend under  *)
(* the same identity or mint a new call for the same work. A foreign tenant *)
(* reads the same call and must learn nothing. The share of the tenant      *)
(* counts results that the consumer has not acknowledged: one per call.     *)
(*                                                                          *)
(* The owner of every rule is packages/model/model-contract/SPEC.md         *)
(* ("调用和各次真实发出", "结果、失败和状态", "晚到账目与有界保管"); the      *)
(* state and event mapping, the abstractions and the bounds are in          *)
(* ../formal-mapping.md. A TLC result holds only inside those bounds.       *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Share,        \* the share of the tenant: how many unacknowledged results it may hold
  MaxUnknown,   \* admits whose commit answer is lost
  Bugs          \* the deliberate faults of a negative control; {} in every positive control

BugNames == {"recall-ignores-unknown", "admit-upserts", "share-ignored", "tenant-leak"}
ASSUME Bugs \subseteq BugNames
ASSUME Share \in 1..3 /\ MaxUnknown \in 0..2

CallIds == {"c1", "c2"}          \* c2: the identity the caller mints after not-accepted
Ops == {"o1", "o2"}              \* o2: a second admission operation on the same call
Inputs == {"r1", "r2"}

NoCall == [exists |-> FALSE, admission |-> "none", input |-> "none"]
NoBinding == [used |-> FALSE, call |-> "none", input |-> "none",
              status |-> "none", effect |-> "none"]

VARIABLES
  calls,     \* CallIds -> call record of tenant t1
  bindings,  \* Ops -> operation binding of tenant t1
  caller,    \* the one caller of the work: its identity and phase
  reply,     \* the last reply the caller got, with the call it was about
  unknowns,  \* admits answered commit-unknown so far
  others,    \* results of other calls of the tenant that are not acknowledged yet
  foreignFound \* a foreign tenant has read the call as found

vars == <<calls, bindings, caller, reply, unknowns, others, foreignFound>>

Bug(b) == b \in Bugs
Held(c) == IF calls[c].exists THEN 1 ELSE 0
Reserved == others + Held("c1") + Held("c2")
Unresolved(c) == \E o \in Ops : bindings[o].used /\ bindings[o].call = c
                                /\ bindings[o].status = "unknown"

Init ==
  /\ calls = [c \in CallIds |-> NoCall]
  /\ bindings = [o \in Ops |-> NoBinding]
  /\ caller = [phase |-> "idle", call |-> "c1", op |-> "o1", input |-> "r1"]
  /\ reply = [kind |-> "none", call |-> "none"]
  /\ unknowns = 0
  /\ others \in {Share - 1, Share}
  /\ foreignFound = FALSE

Answer(kind, c) == reply' = [kind |-> kind, call |-> c]

(* --- admit: the write of the caller's current identity ------------------- *)

\* The same operation was committed before: the replay recognises the original admission.
AdmitReplay ==
  LET id == caller
      b == bindings[id.op]
  IN /\ id.phase = "idle"
     /\ b.used /\ b.status = "committed"
     /\ IF b.call = id.call /\ b.input = id.input
          THEN /\ Answer("recovered", id.call)
               /\ caller' = [id EXCEPT !.phase = "done"]
          ELSE /\ Answer("conflict", id.call)
               /\ caller' = [id EXCEPT !.phase = "done"]
     /\ UNCHANGED <<calls, bindings, unknowns, others, foreignFound>>

\* The operation's earlier write is unresolved: the write is held, the caller must recall.
AdmitBlocked ==
  LET id == caller
  IN /\ id.phase = "idle"
     /\ Unresolved(id.call)
     /\ ~(bindings[id.op].used /\ bindings[id.op].status = "committed")
     /\ Answer("commit-unknown", id.call)
     /\ caller' = [id EXCEPT !.phase = "unknown"]
     /\ UNCHANGED <<calls, bindings, unknowns, others, foreignFound>>

\* A record of the call exists under another operation: conflict, the record stays.
AdmitConflict ==
  LET id == caller
  IN /\ id.phase = "idle"
     /\ ~Unresolved(id.call)
     /\ ~bindings[id.op].used
     /\ calls[id.call].exists
     /\ IF Bug("admit-upserts")
          THEN /\ calls' = [calls EXCEPT ![id.call].admission = id.op,
                                         ![id.call].input = id.input]
               /\ bindings' = [bindings EXCEPT ![id.op] = [used |-> TRUE, call |-> id.call,
                                 input |-> id.input,
                                 status |-> "committed", effect |-> "applied"]]
               /\ Answer("accepted", id.call)
          ELSE /\ UNCHANGED <<calls, bindings>>
               /\ Answer("conflict", id.call)
     /\ caller' = [id EXCEPT !.phase = "done"]
     /\ UNCHANGED <<unknowns, others, foreignFound>>

Fits == Reserved + 1 <= Share

\* The share is full now: not admitted, nothing is held. The caller waits and admits again
\* with the same call and operation.
AdmitFull ==
  LET id == caller
  IN /\ id.phase = "idle"
     /\ ~Unresolved(id.call)
     /\ ~bindings[id.op].used
     /\ ~calls[id.call].exists
     /\ ~Fits
     /\ ~Bug("share-ignored")
     /\ Answer("unavailable", id.call)
     /\ UNCHANGED <<calls, bindings, caller, unknowns, others, foreignFound>>

\* The consumer acknowledges a result of another call, and its cleanup releases the place.
ReleaseOther ==
  /\ others > 0
  /\ others' = others - 1
  /\ UNCHANGED <<calls, bindings, caller, reply, unknowns, foreignFound>>

NewCall(id) == [exists |-> TRUE, admission |-> id.op, input |-> id.input]

\* The first write of the call: committed, and the caller learns it.
AdmitCommit ==
  LET id == caller
  IN /\ id.phase = "idle"
     /\ ~Unresolved(id.call)
     /\ ~bindings[id.op].used
     /\ ~calls[id.call].exists
     /\ Fits \/ Bug("share-ignored")
     /\ calls' = [calls EXCEPT ![id.call] = NewCall(id)]
     /\ bindings' = [bindings EXCEPT ![id.op] = [used |-> TRUE, call |-> id.call,
                       input |-> id.input,
                       status |-> "committed", effect |-> "applied"]]
     /\ Answer("accepted", id.call)
     /\ caller' = [id EXCEPT !.phase = "done"]
     /\ UNCHANGED <<unknowns, others, foreignFound>>

\* The same write, but the storage cannot say whether it holds: the binding stays unresolved
\* and the caller only learns commit-unknown. The write may already be visible ("applied") or
\* still in flight ("pending"): a queued or old writer that lands later, or never.
AdmitUnknown ==
  LET id == caller
  IN /\ id.phase = "idle"
     /\ ~Unresolved(id.call)
     /\ ~bindings[id.op].used
     /\ ~calls[id.call].exists
     /\ Fits
     /\ unknowns < MaxUnknown
     /\ \E effect \in {"applied", "pending"} :
          /\ calls' = IF effect = "applied" THEN [calls EXCEPT ![id.call] = NewCall(id)]
                      ELSE calls
          /\ bindings' = [bindings EXCEPT ![id.op] = [used |-> TRUE, call |-> id.call,
                            input |-> id.input,
                            status |-> "unknown", effect |-> effect]]
     /\ unknowns' = unknowns + 1
     /\ Answer("commit-unknown", id.call)
     /\ caller' = [id EXCEPT !.phase = "unknown"]
     /\ UNCHANGED <<others, foreignFound>>

(* --- the storage resolves an unresolved write: the old writer is excluded and the
       recovery read says whether it landed ------------------------------------------ *)

Resolve ==
  \E o \in Ops :
    LET b == bindings[o]
    IN /\ b.used /\ b.status = "unknown"
       /\ \/ /\ b.effect = "applied"
             /\ bindings' = [bindings EXCEPT ![o].status = "committed"]
             /\ calls' = calls
          \/ /\ b.effect = "pending"
             /\ \E landed \in BOOLEAN :
                  IF landed
                    THEN /\ calls' = [calls EXCEPT ![b.call] = [exists |-> TRUE,
                                        admission |-> o, input |-> b.input]]
                         /\ bindings' = [bindings EXCEPT ![o].status = "committed",
                                                         ![o].effect = "applied"]
                    ELSE /\ calls' = calls
                         /\ bindings' = [bindings EXCEPT ![o] = NoBinding]
       /\ UNCHANGED <<caller, reply, unknowns, others, foreignFound>>

(* --- recall: the caller asks about its admission operation --------------- *)

Recall ==
  LET id == caller
      b == bindings[id.op]
      c == calls[id.call]
  IN /\ id.phase = "unknown"
     /\ IF b.used /\ b.status = "unknown" /\ ~Bug("recall-ignores-unknown")
          THEN /\ Answer("commit-unknown", id.call)
               /\ caller' = id
        ELSE IF c.exists
          THEN /\ Answer(IF c.admission = id.op THEN "found" ELSE "not-original", id.call)
               /\ caller' = [id EXCEPT !.phase = "done"]
        ELSE /\ Answer("not-accepted", id.call)
             /\ caller' = [id EXCEPT !.phase = "not-accepted"]
     /\ UNCHANGED <<calls, bindings, unknowns, others, foreignFound>>

\* After an authoritative not-accepted the caller resends under the same identity ...
ResendSame ==
  /\ caller.phase = "not-accepted"
  /\ caller' = [caller EXCEPT !.phase = "idle"]
  /\ UNCHANGED <<calls, bindings, reply, unknowns, others, foreignFound>>

\* ... or gives the work a new call identity and abandons the old one.
MintNew ==
  /\ caller.phase = "not-accepted"
  /\ caller.call = "c1"
  /\ caller' = [phase |-> "idle", call |-> "c2", op |-> "o2", input |-> caller.input]
  /\ UNCHANGED <<calls, bindings, reply, unknowns, others, foreignFound>>

\* An environment retry that changes the operation of an accepted call: the SPEC answers conflict.
RetryNewOp ==
  /\ caller.phase = "done"
  /\ caller.call = "c1" /\ caller.op = "o1"
  /\ calls["c1"].exists
  /\ caller' = [caller EXCEPT !.phase = "idle", !.op = "o2", !.input = "r2"]
  /\ UNCHANGED <<calls, bindings, reply, unknowns, others, foreignFound>>

(* --- a foreign tenant reads the call --------------------------------------- *)

ForeignRecall ==
  /\ calls["c1"].exists
  /\ foreignFound' = Bug("tenant-leak")
  /\ UNCHANGED <<calls, bindings, caller, reply, unknowns, others>>

Next ==
  \/ AdmitReplay \/ AdmitBlocked \/ AdmitConflict \/ AdmitFull \/ AdmitCommit
  \/ AdmitUnknown \/ Resolve \/ Recall \/ ResendSame \/ MintNew \/ RetryNewOp
  \/ ReleaseOther \/ ForeignRecall

Spec == Init /\ [][Next]_vars

(* --- properties ------------------------------------------------------------ *)

TypeOK ==
  /\ \A c \in CallIds : calls[c].exists \in BOOLEAN
  /\ caller.phase \in {"idle", "unknown", "not-accepted", "done"}
  /\ unknowns \in 0..MaxUnknown
  /\ others \in 0..Share

\* P1. One work, one accepted call: the caller never ends up with two admitted calls.
OneAcceptedPerWork == Cardinality({c \in CallIds : calls[c].exists}) <= 1

\* P1. `not-accepted` is authoritative: no record and no unresolved write of that call.
NotAcceptedIsAuthoritative ==
  reply.kind = "not-accepted" =>
    /\ ~calls[reply.call].exists
    /\ ~Unresolved(reply.call)

\* P1. An accepted record keeps its admission and input: a new operation conflicts.
RecordImmutableStep ==
  \A c \in CallIds :
    calls[c].exists =>
      /\ calls'[c].exists
      /\ calls'[c].admission = calls[c].admission
      /\ calls'[c].input = calls[c].input
RecordImmutable == [][RecordImmutableStep]_vars

\* P5. The tenant never holds more unacknowledged results than its share.
ShareHonest == Reserved <= Share

\* P6. A foreign tenant never reads the call as found.
TenantIsolation == ~foreignFound

=============================================================================
