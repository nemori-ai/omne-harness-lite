--------------------------- MODULE CandidateCache ---------------------------
(* The candidate cache of one source-set generation (request-context SPEC, C-CACHE):   *)
(* generation publication, retirement and borrowing, interleaved with history appends,  *)
(* compaction, eligibility changes and overlapping calls. Finite and safety only.       *)
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Insiders, Outsiders, Requests, MaxLen, MaxEpoch, MaxGen, Bugs
Principals == Insiders \cup Outsiders
BugNames == {"no-publish-check", "no-clear-on-retire", "skip-auth-on-hit",
             "no-gap-check", "shared-key", "no-epoch-check", "overwrite-newer",
             "skip-recheck"}
ASSUME /\ Insiders \cap Outsiders = {} /\ Insiders # {} /\ Requests # {}
       /\ MaxLen \in Nat /\ MaxEpoch \in Nat \ {0} /\ MaxGen \in Nat \ {0}
       /\ Bugs \subseteq BugNames

VARIABLES gen, withdrawn, epoch, len, allowed, cache, rev, req, regressed
vars == <<gen, withdrawn, epoch, len, allowed, cache, rev, req, regressed>>
env == <<gen, withdrawn, epoch, len, allowed>>

None == "none"
(* TLC compares records only with records, so the empty slot is a record too. *)
NoMaterial == [gen |-> 0, epoch |-> 0, rows |-> {}, owner |-> None]
Slots == Principals \cup {"shared"}
SlotOf(p) == IF "shared-key" \in Bugs THEN "shared" ELSE p
(* A row is the content the source set of generation g gives at sequence i of epoch e. *)
Rows == (1..MaxGen) \X (1..MaxEpoch) \X (1..MaxLen)
RowsOf(g, e, from, to) == {<<g, e, i>> : i \in from..to}
Last(rows) == IF rows = {} THEN 0
              ELSE CHOOSE i \in {row[3] : row \in rows} : \A row \in rows : row[3] <= i
States == {"idle", "begun", "loaded", "read", "checked", "done"}
Results == {None, "ok", "denied", "unavailable", "invalid"}
Idle == [state |-> "idle", principal |-> None, gen |-> 0, auth |-> FALSE, hot |-> FALSE,
         seen |-> 0, loaded |-> NoMaterial, rows |-> {}, read |-> 0, len |-> 0, epoch |-> 0,
         prefix |-> 0, result |-> None, pubgen |-> 0, recheck |-> FALSE]
Empty == [s \in Slots |-> NoMaterial]
Clear == IF "no-clear-on-retire" \in Bugs THEN cache ELSE Empty

Init ==
  /\ gen = 1 /\ withdrawn = FALSE
  /\ epoch = 1 /\ len = 0
  /\ allowed = [p \in Insiders |-> TRUE]
  /\ cache = Empty /\ rev = [s \in Slots |-> 0]
  /\ req = [r \in Requests |-> Idle]
  /\ regressed = FALSE

(* Access tenant, registry lookup, read eligibility: the call is admitted or refused   *)
(* before any slot is read. `auth` records the real eligibility at admission.          *)
Begin(r, p) ==
  /\ req[r].state = "idle"
  /\ LET hot == "skip-auth-on-hit" \in Bugs /\ cache[SlotOf(p)] # NoMaterial
     IN \/ /\ p \in Outsiders
           /\ req' = [req EXCEPT ![r].state = "done", ![r].principal = p,
                                 ![r].result = "denied"]
        \/ /\ p \in Insiders /\ withdrawn
           /\ req' = [req EXCEPT ![r].state = "done", ![r].principal = p,
                                 ![r].result = "unavailable"]
        \/ /\ p \in Insiders /\ ~withdrawn /\ ~allowed[p] /\ ~hot
           /\ req' = [req EXCEPT ![r].state = "done", ![r].principal = p,
                                 ![r].result = "denied"]
        \/ /\ p \in Insiders /\ ~withdrawn /\ (allowed[p] \/ hot)
           /\ req' = [req EXCEPT ![r].state = "begun", ![r].principal = p, ![r].gen = gen,
                                 ![r].auth = allowed[p], ![r].hot = hot]
  /\ UNCHANGED <<env, cache, rev, regressed>>

(* The transaction reads its slot. The store belongs to the borrowed generation: after *)
(* that generation retired, the call sees the cleared store, not what a later          *)
(* generation committed.                                                               *)
Load(r) ==
  /\ req[r].state = "begun"
  /\ LET slot == SlotOf(req[r].principal)
         live == ~withdrawn /\ gen = req[r].gen
     IN req' = [req EXCEPT ![r].state = "loaded",
                          ![r].loaded = IF live THEN cache[slot] ELSE NoMaterial,
                          ![r].seen = rev[slot]]
  /\ UNCHANGED <<env, cache, rev, regressed>>

(* The history group read, as one atomic step of the stable-read protocol. A prefix of *)
(* the same epoch is reused and only the tail after it is read from the sources of the *)
(* borrowed generation. The source may hand a page that starts one row late; the read  *)
(* refuses it unless the contiguity check is removed.                                  *)
Read(r) ==
  /\ req[r].state = "loaded"
  /\ LET g == req[r].gen
         m == req[r].loaded
         reuse == m # NoMaterial /\ (m.epoch = epoch \/ "no-epoch-check" \in Bugs)
         held == IF reuse THEN m.rows ELSE {}
         after == Last(held)
         starts == {after + 1} \cup (IF reuse /\ after + 2 <= len THEN {after + 2} ELSE {})
     IN \E start \in starts :
          IF start = after + 1 \/ "no-gap-check" \in Bugs
          THEN req' = [req EXCEPT ![r].state = "read",
                                  ![r].rows = held \cup RowsOf(g, epoch, start, len),
                                  ![r].read = Cardinality(start..len),
                                  ![r].len = len, ![r].epoch = epoch,
                                  ![r].prefix = Cardinality(held)]
          ELSE req' = [req EXCEPT ![r].state = "done", ![r].result = "invalid"]
  /\ UNCHANGED <<env, cache, rev, regressed>>

(* The last eligibility observation before the result leaves the operation group.      *)
(* `recheck` records the real eligibility at this moment, whether or not the check ran: *)
(* the `skip-recheck` defect lets the call pass without consulting the authority.       *)
Recheck(r) ==
  /\ req[r].state = "read"
  /\ LET real == allowed[req[r].principal]
     IN IF "skip-recheck" \in Bugs \/ real \/ req[r].hot
        THEN req' = [req EXCEPT ![r].state = "checked", ![r].recheck = real]
        ELSE req' = [req EXCEPT ![r].state = "done", ![r].result = "denied"]
  /\ UNCHANGED <<env, cache, rev, regressed>>

Regresses(old, new) ==
  /\ old # NoMaterial /\ old.gen = new.gen
  /\ \/ old.epoch > new.epoch
     \/ old.epoch = new.epoch /\ Cardinality(old.rows) > Cardinality(new.rows)

(* The synchronous publication segment of the registry: the borrowed generation must  *)
(* still be the current one, then the result leaves and the staged material becomes   *)
(* the slot content, unless another call changed the slot since this call loaded it.  *)
Publish(r) ==
  /\ req[r].state = "checked"
  /\ LET p == req[r].principal
         slot == SlotOf(p)
         stale == withdrawn \/ gen # req[r].gen
         material == [gen |-> req[r].gen, epoch |-> req[r].epoch,
                      rows |-> req[r].rows, owner |-> p]
         commits == rev[slot] = req[r].seen \/ "overwrite-newer" \in Bugs
     IN IF stale /\ "no-publish-check" \notin Bugs
        THEN /\ req' = [req EXCEPT ![r].state = "done", ![r].result = "unavailable"]
             /\ UNCHANGED <<cache, rev, regressed>>
        ELSE /\ req' = [req EXCEPT ![r].state = "done", ![r].result = "ok",
                                   ![r].pubgen = IF withdrawn THEN 0 ELSE gen]
             /\ IF commits
                THEN /\ cache' = [cache EXCEPT ![slot] = material]
                     /\ rev' = [rev EXCEPT ![slot] = @ + 1]
                     /\ regressed' = (regressed \/ Regresses(cache[slot], material))
                ELSE UNCHANGED <<cache, rev, regressed>>
  /\ UNCHANGED env

(* Environment: the history store, the registry owner and the eligibility authority.   *)
Append ==
  /\ len < MaxLen /\ len' = len + 1
  /\ UNCHANGED <<gen, withdrawn, epoch, allowed, cache, rev, req, regressed>>
Compact ==
  /\ epoch < MaxEpoch /\ epoch' = epoch + 1
  /\ \E n \in 0..len : len' = n
  /\ UNCHANGED <<gen, withdrawn, allowed, cache, rev, req, regressed>>
Replace ==
  /\ ~withdrawn /\ gen < MaxGen /\ gen' = gen + 1 /\ cache' = Clear
  /\ UNCHANGED <<withdrawn, epoch, len, allowed, rev, req, regressed>>
Withdraw ==
  /\ ~withdrawn /\ withdrawn' = TRUE /\ cache' = Clear
  /\ UNCHANGED <<gen, epoch, len, allowed, rev, req, regressed>>
Revoke(p) ==
  /\ allowed[p] /\ allowed' = [allowed EXCEPT ![p] = FALSE]
  /\ UNCHANGED <<gen, withdrawn, epoch, len, cache, rev, req, regressed>>
Grant(p) ==
  /\ ~allowed[p] /\ allowed' = [allowed EXCEPT ![p] = TRUE]
  /\ UNCHANGED <<gen, withdrawn, epoch, len, cache, rev, req, regressed>>

Next ==
  \/ \E r \in Requests : \/ \E p \in Principals : Begin(r, p)
                         \/ Load(r) \/ Read(r) \/ Recheck(r) \/ Publish(r)
  \/ Append \/ Compact \/ Replace \/ Withdraw
  \/ \E p \in Insiders : Revoke(p) \/ Grant(p)
Spec == Init /\ [][Next]_vars
(* Calls and in-tenant principals play identical roles; a cfg may use this as SYMMETRY. *)
Symmetry == Permutations(Requests) \cup Permutations(Insiders)

Material(m) ==
  /\ m.gen \in 1..MaxGen /\ m.epoch \in 1..MaxEpoch
  /\ m.rows \subseteq Rows /\ m.owner \in Principals
TypeOK ==
  /\ gen \in 1..MaxGen /\ withdrawn \in BOOLEAN
  /\ epoch \in 1..MaxEpoch /\ len \in 0..MaxLen
  /\ allowed \in [Insiders -> BOOLEAN]
  /\ \A s \in Slots : cache[s] = NoMaterial \/ Material(cache[s])
  /\ rev \in [Slots -> Nat] /\ regressed \in BOOLEAN
  /\ \A r \in Requests :
       /\ req[r].state \in States /\ req[r].result \in Results
       /\ req[r].principal \in Principals \cup {None}
       /\ req[r].gen \in 0..MaxGen /\ req[r].pubgen \in 0..MaxGen
       /\ req[r].auth \in BOOLEAN /\ req[r].hot \in BOOLEAN /\ req[r].recheck \in BOOLEAN
       /\ req[r].loaded = NoMaterial \/ Material(req[r].loaded)
       /\ req[r].rows \subseteq Rows
       /\ req[r].read \in 0..MaxLen /\ req[r].len \in 0..MaxLen
       /\ req[r].prefix \in 0..MaxLen /\ req[r].epoch \in 0..MaxEpoch

Published == {r \in Requests : req[r].result = "ok"}
(* What a full recomputation from the borrowed sources gives for the read this call made. *)
Expected(r) == RowsOf(req[r].gen, req[r].epoch, 1, req[r].len)

(* S1: a result leaves only while its generation is the current, unretired one.        *)
NoStalePublication == \A r \in Published : req[r].pubgen = req[r].gen
(* S1: the store never holds material of a retired generation.                         *)
CacheIsCurrent == \A s \in Slots : cache[s] # NoMaterial => (~withdrawn /\ cache[s].gen = gen)
(* S2: every published call was admitted with real eligibility and from the tenant.    *)
Authorized == \A r \in Published : req[r].auth /\ req[r].principal \in Insiders
(* S2: the eligibility observed just before the result left was real, so the hot path   *)
(* cannot skip the recheck before publication.                                          *)
RecheckedEligible == \A r \in Published : req[r].recheck
(* S2: a call only ever sees material derived for its own principal.                   *)
HitBelongsToPrincipal ==
  \A r \in Requests : req[r].loaded # NoMaterial => req[r].loaded.owner = req[r].principal
(* S3: stable prefix plus contiguous tail equals the full recomputation, hit or miss.   *)
Equivalence == \A r \in Published : req[r].rows = Expected(r)
(* S3: committed material is a contiguous prefix of one epoch of one generation.        *)
CacheContiguous ==
  \A s \in Slots : cache[s] # NoMaterial =>
    cache[s].rows = RowsOf(cache[s].gen, cache[s].epoch, 1, Cardinality(cache[s].rows))
(* C1: rows read from the source equal the rows after the reused prefix.               *)
TailReadBound ==
  \A r \in Requests :
    req[r].state \in {"read", "checked"} \/ r \in Published
      => req[r].read + req[r].prefix = req[r].len
(* C2: a later commit never replaces a longer prefix or a newer epoch of the same       *)
(* generation with an older computation.                                                *)
NoRegression == ~regressed
=============================================================================
