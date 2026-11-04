---------------------------- MODULE StartFence ----------------------------
(***************************************************************************)
(* The local start coordinator (G5) as the start ordering domain of P04.   *)
(*                                                                         *)
(* One tenant, one call, one start operation, one guard resource. Every    *)
(* committed operation of the coordinator advances `clock`, which is the   *)
(* revision order of the host domain: the common order of permits,         *)
(* acceptances, rejections, exclusions and invalidations.                  *)
(*                                                                         *)
(* The executor may hold any permit that was ever issued (a crashed and    *)
(* restarted executor re-sends an old copy), may lose the answer of a      *)
(* consume whose commit applied, and launches the capsule once per         *)
(* distinct acceptance evidence it sees. The guard owner invalidates up to *)
(* MaxInvalidations times; an invalidation whose answer is lost is re-sent *)
(* with the same operation.                                                *)
(*                                                                         *)
(* The negative switches each remove one guard of the design; the safe    *)
(* configuration sets them all FALSE.                                      *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  MaxPrepares,        \* how many permits may be issued for the start
  MaxInvalidations,   \* how many invalidation operations the owner may send
  MaxConsumes,        \* how many consume attempts the executor may make
  SkipGuardCheck,     \* consume accepts a permit whose guard revision moved
  DoubleAccept,       \* consume ignores an existing acceptance and keeps the permit
  InspectKeepsPermit, \* inspect answers not-started without withdrawing the permit
  ResendReadvances,   \* a re-sent invalidation advances the guard again
  ExcludeAccepted     \* exclude rejects a call that already has an acceptance

Invs == 1..MaxInvalidations

VARIABLES
  clock,        \* the revision order of the host domain
  guardRev,     \* the current revision of the one guard
  invApplied,   \* inv -> 0 while not applied, else the clock of its commit
  invReturned,  \* inv -> TRUE once the owner holds its evidence
  issued,       \* the permits ever issued: records [rev, at]
  permit,       \* the stored (current) permit, or NoPermit
  prepares,     \* how many permits were issued
  consumes,     \* how many consume attempts were made
  acceptances,  \* the acceptance records: [rev, issuedAt, at]
  rejected,     \* a permanent start rejection exists
  excludedAt,   \* 0, or the clock at which inspect answered not-started
  callRejectedAt, \* 0, or the clock at which exclude rejected the call
  seen,         \* the acceptances whose `started` answer reached the executor
  launches      \* the acceptances the executor launched

vars == <<clock, guardRev, invApplied, invReturned, issued, permit, prepares,
          consumes, acceptances, rejected, excludedAt, callRejectedAt, seen, launches>>

NoPermit == [rev |-> 0, at |-> 0]

Init ==
  /\ clock = 0
  /\ guardRev = 0
  /\ invApplied = [i \in Invs |-> 0]
  /\ invReturned = [i \in Invs |-> FALSE]
  /\ issued = {}
  /\ permit = NoPermit
  /\ prepares = 0
  /\ consumes = 0
  /\ acceptances = {}
  /\ rejected = FALSE
  /\ excludedAt = 0
  /\ callRejectedAt = 0
  /\ seen = {}
  /\ launches = {}

Decided == acceptances # {} \/ rejected \/ callRejectedAt > 0

(* prepare: issue a permit carrying the current guard revision; it replaces the stored one. *)
Prepare ==
  /\ prepares < MaxPrepares
  /\ ~Decided
  /\ LET p == [rev |-> guardRev, at |-> clock + 1] IN
       /\ clock' = clock + 1
       /\ issued' = issued \cup {p}
       /\ permit' = p
       /\ prepares' = prepares + 1
  /\ UNCHANGED <<guardRev, invApplied, invReturned, consumes, acceptances, rejected,
                 excludedAt, callRejectedAt, seen, launches>>

(* invalidate: advance the guard and commit the operation; the evidence may be lost. *)
Invalidate(i) ==
  /\ invApplied[i] = 0
  /\ clock' = clock + 1
  /\ guardRev' = guardRev + 1
  /\ invApplied' = [invApplied EXCEPT ![i] = clock + 1]
  /\ \/ invReturned' = [invReturned EXCEPT ![i] = TRUE]
     \/ invReturned' = invReturned
  /\ UNCHANGED <<issued, permit, prepares, consumes, acceptances, rejected, excludedAt,
                 callRejectedAt, seen, launches>>

(* The owner re-sends an invalidation whose answer was lost: the stored evidence is returned. *)
ResendInvalidation(i) ==
  /\ invApplied[i] > 0
  /\ ~invReturned[i]
  /\ invReturned' = [invReturned EXCEPT ![i] = TRUE]
  /\ IF ResendReadvances
       THEN /\ clock' = clock + 1
            /\ guardRev' = guardRev + 1
       ELSE UNCHANGED <<clock, guardRev>>
  /\ UNCHANGED <<invApplied, issued, permit, prepares, consumes, acceptances, rejected,
                 excludedAt, callRejectedAt, seen, launches>>

(* consume with a permit the executor holds. The answer of an applied commit may be lost. *)
Consume(p) ==
  /\ consumes < MaxConsumes
  /\ consumes' = consumes + 1
  /\ \/ (* 1. an existing decision is recalled; the executor may see the acceptance *)
        /\ Decided
        /\ ~DoubleAccept
        /\ \/ seen' = seen \cup acceptances
           \/ seen' = seen
        /\ UNCHANGED <<clock, guardRev, invApplied, invReturned, issued, permit, prepares,
                       acceptances, rejected, excludedAt, callRejectedAt, launches>>
     \/ (* 2. the permit is not the stored one: not-started or invalid, nothing written *)
        /\ ~(Decided /\ ~DoubleAccept)
        /\ p # permit
        /\ UNCHANGED <<clock, guardRev, invApplied, invReturned, issued, permit, prepares,
                       acceptances, rejected, excludedAt, callRejectedAt, seen, launches>>
     \/ (* 3. a guard moved: permanent rejection, permit withdrawn *)
        /\ ~(Decided /\ ~DoubleAccept)
        /\ p = permit
        /\ ~SkipGuardCheck
        /\ p.rev # guardRev
        /\ clock' = clock + 1
        /\ rejected' = TRUE
        /\ permit' = NoPermit
        /\ UNCHANGED <<guardRev, invApplied, invReturned, issued, prepares, acceptances,
                       excludedAt, callRejectedAt, seen, launches>>
     \/ (* 4. the acceptance: the one record; the permit is withdrawn in the same commit *)
        /\ ~(Decided /\ ~DoubleAccept)
        /\ p = permit
        /\ (SkipGuardCheck \/ p.rev = guardRev)
        /\ LET a == [rev |-> p.rev, issuedAt |-> p.at, at |-> clock + 1] IN
             /\ clock' = clock + 1
             /\ acceptances' = acceptances \cup {a}
             /\ permit' = IF DoubleAccept THEN permit ELSE NoPermit
             /\ \/ seen' = seen \cup {a}   \* the answer reached the executor
                \/ seen' = seen            \* the commit applied, the answer was lost
        /\ UNCHANGED <<guardRev, invApplied, invReturned, issued, prepares, rejected,
                       excludedAt, callRejectedAt, launches>>

(* inspect: an undecided start is answered not-started only once its permit is withdrawn. *)
Inspect ==
  /\ ~Decided
  /\ excludedAt = 0
  /\ clock' = clock + 1
  /\ excludedAt' = clock + 1
  /\ permit' = IF InspectKeepsPermit THEN permit ELSE NoPermit
  /\ UNCHANGED <<guardRev, invApplied, invReturned, issued, prepares, consumes, acceptances,
                 rejected, callRejectedAt, seen, launches>>

(* exclude: reject the whole pending invocation; an accepted call is in flight and refused. *)
Exclude ==
  /\ callRejectedAt = 0
  /\ (acceptances = {} \/ ExcludeAccepted)
  /\ clock' = clock + 1
  /\ callRejectedAt' = clock + 1
  /\ UNCHANGED <<guardRev, invApplied, invReturned, issued, permit, prepares, consumes,
                 acceptances, rejected, excludedAt, seen, launches>>

(* The executor launches the capsule of an acceptance it saw, once per acceptance evidence. *)
Launch(a) ==
  /\ a \in seen
  /\ a \notin launches
  /\ launches' = launches \cup {a}
  /\ UNCHANGED <<clock, guardRev, invApplied, invReturned, issued, permit, prepares, consumes,
                 acceptances, rejected, excludedAt, callRejectedAt, seen>>

Next ==
  \/ Prepare
  \/ \E i \in Invs: Invalidate(i) \/ ResendInvalidation(i)
  \/ \E p \in issued: Consume(p)
  \/ Inspect
  \/ Exclude
  \/ \E a \in acceptances: Launch(a)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties *)

TypeOK ==
  /\ clock \in Nat
  /\ guardRev \in Nat
  /\ prepares \in 0..MaxPrepares
  /\ consumes \in 0..MaxConsumes
  /\ launches \subseteq seen
  /\ seen \subseteq acceptances

(* P1. At most one acceptance per start, so at most one launch. *)
OneAcceptancePerStart == Cardinality(acceptances) <= 1 /\ Cardinality(launches) <= 1

(* P2. An invalidation that committed before the acceptance fences every permit issued
   before it (P04: an invalidation that holds first forbids the start). *)
FenceHolds ==
  \A a \in acceptances, i \in Invs:
    (invApplied[i] > 0 /\ invApplied[i] < a.at) => a.issuedAt > invApplied[i]

(* P3. A permit issued before inspect answered not-started is never accepted after it. *)
NotStartedExcludes ==
  \A a \in acceptances:
    (excludedAt > 0 /\ excludedAt < a.at) => a.issuedAt > excludedAt

(* P4. An excluded call has no acceptance, and an accepted call is never excluded. *)
ExclusionAndAcceptanceExclusive == callRejectedAt > 0 => acceptances = {}

(* P5. The guard advances exactly once per applied invalidation operation: a re-sent
   operation returns its first evidence and does not move the guard again. *)
GuardAdvancesPerOperation ==
  guardRev = Cardinality({i \in Invs: invApplied[i] > 0})

(* P6. A start is either accepted or rejected, never both. *)
OneDecision == ~(acceptances # {} /\ rejected)

=============================================================================
