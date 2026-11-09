---------------------------- MODULE StartConsume ----------------------------
(***************************************************************************)
(* Start acceptance with the per-call facts in call domains and the guard  *)
(* in one tenant-level domain (design 4.3).                                *)
(*                                                                         *)
(* Two domains, no shared revision order: the guard domain carries one     *)
(* revision `guardRev`; each call domain carries that call's permit and    *)
(* acceptance. A permit records the guard revision the executor read when  *)
(* it prepared. Consume commits the acceptance into the call domain under   *)
(* a read-set assertion: the guard domain's revision still equals the      *)
(* permit's. Invalidate advances the guard revision in the guard domain    *)
(* and returns to its owner only after that commit.                        *)
(*                                                                         *)
(* `step` is a ghost linearization counter over the commits of both        *)
(* domains; no participant reads it. The executor's read of the guard      *)
(* (ConsumeRead) and its commit (ConsumeCommit) are separate steps, so an  *)
(* invalidation can commit between them.                                   *)
(*                                                                         *)
(* DropAssertion = TRUE: the executor compares the permit with the guard   *)
(* revision it read earlier and commits without the assertion.             *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Calls,            \* the calls of one tenant, each with its own domain
  MaxPrepares,      \* permits issued per call
  MaxInvalidations, \* invalidation operations the owner may send
  MaxConsumes,      \* consume attempts per call
  DropAssertion     \* consume does not assert the guard domain at commit

Invs == 1..MaxInvalidations
NoRev == 0 - 1      \* "nothing read yet" / "no permit"

VARIABLES
  step,         \* ghost: linearization counter over commits of both domains
  guardRev,     \* guard domain: current revision
  invApplied,   \* inv -> 0 while not committed, else the step of its commit
  invRev,       \* inv -> the guard revision its commit produced (0 while not committed)
  invReturned,  \* inv -> 0 while the owner has no answer, else the step it returned
  prepares,     \* call -> permits issued
  permit,       \* call -> guard revision recorded in the permit, or NoRev
  observed,     \* call -> guard revision the executor read for its consume, or NoRev
  consumes,     \* call -> consume attempts made
  accepted      \* call -> {} or {[rev, guardAtCommit, at]}

vars == <<step, guardRev, invApplied, invRev, invReturned, prepares, permit, observed,
          consumes, accepted>>

Init ==
  /\ step = 0
  /\ guardRev = 0
  /\ invApplied = [i \in Invs |-> 0]
  /\ invRev = [i \in Invs |-> 0]
  /\ invReturned = [i \in Invs |-> 0]
  /\ prepares = [c \in Calls |-> 0]
  /\ permit = [c \in Calls |-> NoRev]
  /\ observed = [c \in Calls |-> NoRev]
  /\ consumes = [c \in Calls |-> 0]
  /\ accepted = [c \in Calls |-> {}]

Decided(c) == accepted[c] # {}

(* prepare: read the guard domain, commit a permit carrying that revision into the
   call domain. A later prepare replaces the permit. *)
Prepare(c) ==
  /\ ~Decided(c)
  /\ prepares[c] < MaxPrepares
  /\ prepares' = [prepares EXCEPT ![c] = @ + 1]
  /\ permit' = [permit EXCEPT ![c] = guardRev]
  /\ step' = step + 1
  /\ UNCHANGED <<guardRev, invApplied, invRev, invReturned, observed, consumes, accepted>>

(* invalidate: the guard domain commit. The answer is a separate step. *)
InvalidateCommit(i) ==
  /\ invApplied[i] = 0
  /\ guardRev' = guardRev + 1
  /\ step' = step + 1
  /\ invApplied' = [invApplied EXCEPT ![i] = step + 1]
  /\ invRev' = [invRev EXCEPT ![i] = guardRev + 1]
  /\ UNCHANGED <<invReturned, prepares, permit, observed, consumes, accepted>>

(* the owner receives the answer only after the commit. *)
InvalidateReturn(i) ==
  /\ invApplied[i] > 0
  /\ invReturned[i] = 0
  /\ invReturned' = [invReturned EXCEPT ![i] = step]
  /\ UNCHANGED <<step, guardRev, invApplied, invRev, prepares, permit, observed, consumes,
                 accepted>>

(* consume, first half: the executor reads the guard domain. *)
ConsumeRead(c) ==
  /\ ~Decided(c)
  /\ permit[c] # NoRev
  /\ consumes[c] < MaxConsumes
  /\ consumes' = [consumes EXCEPT ![c] = @ + 1]
  /\ observed' = [observed EXCEPT ![c] = guardRev]
  /\ UNCHANGED <<step, guardRev, invApplied, invRev, invReturned, prepares, permit, accepted>>

(* consume, second half: commit into the call domain. With the assertion the
   ledger checks the guard domain revision at commit; without it the executor
   relies on the revision it read. A failed assertion commits nothing here (the
   permanent rejection is not needed for the property). *)
ConsumeCommit(c) ==
  /\ ~Decided(c)
  /\ observed[c] # NoRev
  /\ permit[c] # NoRev
  /\ LET assertionHolds == IF DropAssertion THEN observed[c] = permit[c]
                                            ELSE guardRev = permit[c] IN
       IF assertionHolds
         THEN /\ accepted' = [accepted EXCEPT ![c] =
                               {[rev |-> permit[c], guard |-> guardRev, at |-> step + 1]}]
              /\ step' = step + 1
         ELSE UNCHANGED <<accepted, step>>
  /\ observed' = [observed EXCEPT ![c] = NoRev]
  /\ UNCHANGED <<guardRev, invApplied, invRev, invReturned, prepares, permit, consumes>>

Next ==
  \/ \E c \in Calls : Prepare(c) \/ ConsumeRead(c) \/ ConsumeCommit(c)
  \/ \E i \in Invs : InvalidateCommit(i) \/ InvalidateReturn(i)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties *)

TypeOK ==
  /\ step \in Nat
  /\ guardRev \in 0..MaxInvalidations
  /\ \A c \in Calls : Cardinality(accepted[c]) <= 1 /\ consumes[c] \in 0..MaxConsumes
                      /\ prepares[c] \in 0..MaxPrepares

(* P1. Every committed acceptance is based on the guard revision current at its
   commit: acceptance and invalidation linearize on the ghost step order. *)
AcceptedAtCurrentGuard ==
  \A c \in Calls : \A a \in accepted[c] : a.rev = a.guard

(* P2. Once an invalidation has returned to its owner, no acceptance committed
   afterwards is based on a revision older than the one that invalidation produced. *)
FenceAfterReturn ==
  \A c \in Calls, i \in Invs : \A a \in accepted[c] :
    (invReturned[i] > 0 /\ invReturned[i] < a.at) => a.rev >= invRev[i]

(* P3. At most one acceptance per call. *)
OneAcceptancePerCall == \A c \in Calls : Cardinality(accepted[c]) <= 1

=============================================================================
