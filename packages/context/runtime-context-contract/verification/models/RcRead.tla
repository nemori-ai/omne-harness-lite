------------------------------- MODULE RcRead -------------------------------
(***************************************************************************)
(* Runtime Context reads: who may read which value (RC-01, RC-03), the    *)
(* read cache (RC-08 and the mechanism "读取缓存"), the replay fence       *)
(* (RC-09), and the narrow scope read of the holder (SCOPE-NARROW).        *)
(*                                                                         *)
(* Fixed topology. Tenants A and B. Scopes a1, a2 (tenant A) and b1        *)
(* (tenant B). a2 and b1 name a1 as parent: a2 is a legal child, b1 is a   *)
(* cross-tenant parent link that a holder may write. One block key. One    *)
(* reader per scope. A value is <<tenant of the producer, n>>; NoVal is   *)
(* the absent value.                                                       *)
(*                                                                         *)
(* Switches. The design is: all FALSE except ParentChecksFence = TRUE.     *)
(*   SkipParentTenant   a parent hop does not check the tenant.            *)
(*   ParentChecksFence  a parent hop skips a parent whose replay fence is   *)
(*                      closed. The implementation does not check it.      *)
(*   CacheSkipsChecks   a cache hit skips the eligibility and scope checks.*)
(*   ReplaceNoTouch     a producer replacement does not advance the        *)
(*                      projection version of the scopes it clears.        *)
(*   CacheUnbounded     the cache does not evict.                          *)
(*   MemoEnded          the holder keeps "ended" with the owner answer.    *)
(*   Rebind             a scope may move to another tenant (breaks J18).   *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Vals, CacheCap, MaxOps, MaxCrashes,
          SkipParentTenant, ParentChecksFence, CacheSkipsChecks,
          ReplaceNoTouch, CacheUnbounded, MemoEnded, Rebind

Tenants == {"A", "B"}
Scopes == {"a1", "a2", "b1"}
None == "none"
Owner0 == [s \in Scopes |-> IF s = "b1" THEN "B" ELSE "A"]
Parent == [s \in Scopes |-> IF s = "a1" THEN None ELSE "a1"]
Readers == {"rA1", "rA2", "rB1"}
RScope == [r \in Readers |-> IF r = "rA1" THEN "a1" ELSE IF r = "rA2" THEN "a2" ELSE "b1"]
RTenant == [r \in Readers |-> IF r = "rB1" THEN "B" ELSE "A"]

VARIABLES
  owner,    \* trusted binding source: scope -> tenant (fixed unless Rebind)
  archived, \* holder truth: the scope has ended
  rc,       \* instance: scope -> "none" | "open" | "replaying" | "ended"
  val,      \* instance projection: scope -> 0 | <<tenant, n>>
  proj,     \* instance projection version per scope
  elig,     \* instance: reader -> [n, st]; n is the current eligibility id
  cache,    \* instance read cache: set of [k, out]
  memo,     \* holder: scope -> {} | {[owner, ended]} (the remembered answer)
  served,   \* reader -> {} | {record of the last successful read}
  crashes,
  ops

vars == <<owner, archived, rc, val, proj, elig, cache, memo, served, crashes, ops>>

NoVal == <<None, 0>>
NoOut == <<None, NoVal>>

TypeOK ==
  /\ owner \in [Scopes -> Tenants]
  /\ archived \in [Scopes -> BOOLEAN]
  /\ rc \in [Scopes -> {"none", "open", "replaying", "ended"}]
  /\ val \in [Scopes -> (Tenants \X Vals) \cup {NoVal}]
  /\ proj \in [Scopes -> Nat]
  /\ elig \in [Readers -> [n : Nat, st : {"valid", "revoked"}]]
  /\ crashes \in 0..MaxCrashes
  /\ ops \in 0..MaxOps

Init ==
  /\ owner = Owner0
  /\ archived = [s \in Scopes |-> FALSE]
  /\ rc = [s \in Scopes |-> "open"]
  /\ val = [s \in Scopes |-> NoVal]
  /\ proj = [s \in Scopes |-> 0]
  /\ elig = [r \in Readers |-> [n |-> 0, st |-> "revoked"]]
  /\ cache = {}
  /\ memo = [s \in Scopes |-> {}]
  /\ served = [r \in Readers |-> {}]
  /\ crashes = 0
  /\ ops = 0

Step == ops < MaxOps /\ ops' = ops + 1

(* The owner answer the holder and the authority use. It is read from the  *)
(* binding source the first time and remembered (owner never changes).     *)
M(s) == CHOOSE m \in memo[s] : TRUE
OwnerOf(s) == IF memo[s] # {} THEN M(s).owner ELSE owner[s]
Remember(s) ==
  IF memo[s] # {} THEN memo
  ELSE [memo EXCEPT ![s] = {[owner |-> owner[s], ended |-> archived[s]]}]

-----------------------------------------------------------------------------
(* Writes                                                                  *)

(* A producer of the scope's tenant publishes (RC-07 checks 3, 5, 7).      *)
Publish(s, n) ==
  /\ Step
  /\ rc[s] = "open"
  /\ val' = [val EXCEPT ![s] = <<owner[s], n>>]
  /\ proj' = [proj EXCEPT ![s] = @ + 1]
  /\ UNCHANGED <<owner, archived, rc, elig, cache, memo, served, crashes>>

(* A producer of tenant t registers again: a new generation clears the old *)
(* values of every scope of t (src/producer.ts) and advances their         *)
(* projection version.                                                     *)
Replace(t) ==
  /\ Step
  /\ val' = [s \in Scopes |-> IF owner[s] = t THEN NoVal ELSE val[s]]
  /\ proj' = IF ReplaceNoTouch THEN proj
             ELSE [s \in Scopes |-> IF owner[s] = t THEN proj[s] + 1 ELSE proj[s]]
  /\ UNCHANGED <<owner, archived, rc, elig, cache, memo, served, crashes>>

(* The holder commits the end of a scope and applies it (RC-09).           *)
Archive(s) ==
  /\ Step
  /\ ~archived[s]
  /\ archived' = [archived EXCEPT ![s] = TRUE]
  /\ rc' = IF rc[s] \in {"open", "replaying"} THEN [rc EXCEPT ![s] = "ended"] ELSE rc
  /\ proj' = [proj EXCEPT ![s] = @ + 1]
  /\ UNCHANGED <<owner, val, elig, cache, memo, served, crashes>>

(* beginReplay: the fence closes, the eligibilities of the scope die. The  *)
(* old projection stays as an internal fact.                               *)
BeginReplay(s) ==
  /\ Step
  /\ rc[s] = "open"
  /\ rc' = [rc EXCEPT ![s] = "replaying"]
  /\ proj' = [proj EXCEPT ![s] = @ + 1]
  /\ elig' = [r \in Readers |-> IF RScope[r] = s THEN [elig[r] EXCEPT !.st = "revoked"] ELSE elig[r]]
  /\ UNCHANGED <<owner, archived, val, cache, memo, served, crashes>>

FinishReplay(s) ==
  /\ Step
  /\ rc[s] = "replaying"
  /\ rc' = [rc EXCEPT ![s] = IF archived[s] THEN "ended" ELSE "open"]
  /\ proj' = [proj EXCEPT ![s] = @ + 1]
  /\ UNCHANGED <<owner, archived, val, elig, cache, memo, served, crashes>>

(* The instance dies. Nothing survives in it; the holder keeps its facts.  *)
Crash ==
  /\ Step
  /\ crashes < MaxCrashes
  /\ crashes' = crashes + 1
  /\ rc' = [s \in Scopes |-> "none"]
  /\ val' = [s \in Scopes |-> NoVal]
  /\ proj' = [s \in Scopes |-> 0]
  /\ elig' = [r \in Readers |-> [n |-> elig[r].n + 1, st |-> "revoked"]]
  /\ cache' = {}
  /\ UNCHANGED <<owner, archived, memo, served>>

(* The holder recovers a scope with no records: it reads the scope binding *)
(* and opens the scope only if the binding says it has not ended.          *)
(* SCOPE-NARROW: the owner may be remembered, "ended" must be read fresh.  *)
Recover(s) ==
  /\ Step
  /\ rc[s] = "none"
  /\ LET endedRead == IF MemoEnded /\ memo[s] # {} THEN M(s).ended ELSE archived[s]
     IN rc' = [rc EXCEPT ![s] = IF endedRead THEN "ended" ELSE "open"]
  /\ memo' = Remember(s)
  /\ UNCHANGED <<owner, archived, val, proj, elig, cache, served, crashes>>

(* Not a legal move: a scope reference bound again to another tenant.     *)
DoRebind(s, t) ==
  /\ Rebind
  /\ Step
  /\ owner[s] # t
  /\ owner' = [owner EXCEPT ![s] = t]
  /\ UNCHANGED <<archived, rc, val, proj, elig, cache, memo, served, crashes>>

-----------------------------------------------------------------------------
(* Holder eligibility and reads                                            *)

(* issueEligibility (also a reissue that supersedes): owner and fence      *)
(* checked; a new eligibility id.                                          *)
Issue(r) ==
  /\ Step
  /\ rc[RScope[r]] = "open"
  /\ OwnerOf(RScope[r]) = RTenant[r]
  /\ elig' = [elig EXCEPT ![r] = [n |-> @.n + 1, st |-> "valid"]]
  /\ memo' = Remember(RScope[r])
  /\ UNCHANGED <<owner, archived, rc, val, proj, cache, served, crashes>>

Revoke(r) ==
  /\ Step
  /\ elig[r].st = "valid"
  /\ elig' = [elig EXCEPT ![r].st = "revoked"]
  /\ UNCHANGED <<owner, archived, rc, val, proj, cache, memo, served, crashes>>

(* The value one read computes without the cache: the scope, then one      *)
(* parent hop. Each hop checks its tenant and its fence (RC-03, RC-09).    *)
Fresh(r) ==
  LET s == RScope[r]
      p == Parent[s]
  IN IF val[s] # NoVal THEN <<s, val[s]>>
     ELSE IF p # None
             /\ (SkipParentTenant \/ OwnerOf(p) = RTenant[r])
             /\ (~ParentChecksFence \/ rc[p] \in {"open", "ended"})
             /\ val[p] # NoVal
          THEN <<p, val[p]>>
          ELSE NoOut

Checks(r) ==
  /\ elig[r].st = "valid"
  /\ OwnerOf(RScope[r]) = RTenant[r]
  /\ rc[RScope[r]] = "open"

KeyOf(r) == <<RScope[r], r, elig[r].n, proj[RScope[r]]>>
Cacheable(r) == Parent[RScope[r]] = None
Hit(r) == {e \in cache : e.k = KeyOf(r)}

Insert(r, out) ==
  LET added == cache \cup {[k |-> KeyOf(r), out |-> out]}
  IN IF CacheUnbounded \/ Cardinality(added) <= CacheCap THEN added
     ELSE added \ {CHOOSE e \in added : e.k # KeyOf(r)}

Record(r, out) ==
  served' = [served EXCEPT ![r] = {
    [out |-> out, fresh |-> Fresh(r),
     eligValid |-> elig[r].st = "valid",
     scopeEnded |-> archived[RScope[r]],
     originOpen |-> out = NoOut \/ rc[out[1]] \in {"open", "ended"},
     ownerAtRead |-> IF out = NoOut THEN RTenant[r] ELSE owner[out[1]]]}]

Read(r) ==
  /\ Step
  /\ IF Cacheable(r) /\ Hit(r) # {} /\ (CacheSkipsChecks \/ Checks(r))
       THEN /\ Record(r, (CHOOSE e \in Hit(r) : TRUE).out)
            /\ UNCHANGED cache
       ELSE /\ Checks(r)
            /\ Record(r, Fresh(r))
            /\ cache' = IF Cacheable(r) THEN Insert(r, Fresh(r)) ELSE cache
  /\ memo' = Remember(RScope[r])
  /\ UNCHANGED <<owner, archived, rc, val, proj, elig, crashes>>

Next ==
  \/ \E s \in Scopes, n \in Vals : Publish(s, n)
  \/ \E t \in Tenants : Replace(t)
  \/ \E s \in Scopes : Archive(s) \/ BeginReplay(s) \/ FinishReplay(s) \/ Recover(s)
  \/ \E s \in Scopes, t \in Tenants : DoRebind(s, t)
  \/ Crash
  \/ \E r \in Readers : Issue(r) \/ Revoke(r) \/ Read(r)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties. Each one is about the last successful read of a reader.     *)

Served(r) == served[r] # {}
S(r) == CHOOSE x \in served[r] : TRUE

(* P4. A successful read returns only values of its own tenant, from       *)
(* scopes of its own tenant; a cross-tenant parent is never inherited.     *)
P4_TenantIsolation ==
  \A r \in Readers : Served(r) /\ S(r).out # NoOut =>
    /\ S(r).out[2][1] = RTenant[r]
    /\ S(r).ownerAtRead = RTenant[r]

(* P4. A revoked or superseded-away eligibility reads nothing.             *)
P4_RevokedNotServed == \A r \in Readers : Served(r) => S(r).eligValid

(* P4. No read succeeds on a scope that has ended.                         *)
P4_EndedNotServed == \A r \in Readers : Served(r) => ~S(r).scopeEnded

(* P4. No value is disclosed from a scope whose replay fence is closed.    *)
(* With ParentChecksFence = FALSE (the implementation) this is a probe.    *)
P4_NoDisclosureWhileReplaying ==
  \A r \in Readers : Served(r) => S(r).originOpen

(* P5. The cache never changes what a read returns.                        *)
P5_CacheCoherent == \A r \in Readers : Served(r) => S(r).out = S(r).fresh

(* P5. The cache holds at most CacheCap entries.                           *)
P5_CacheBounded == Cardinality(cache) <= CacheCap

(* P6. A remembered owner answer is still the owner (needs J18).           *)
P6_OwnerMemoSound == \A s \in Scopes : memo[s] # {} => M(s).owner = owner[s]

=============================================================================
