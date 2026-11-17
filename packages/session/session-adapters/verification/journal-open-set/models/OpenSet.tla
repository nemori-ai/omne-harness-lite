---- MODULE OpenSet ----
(***************************************************************************)
(* The execution journal hands the Agent a snapshot of its open items only. *)
(*                                                                         *)
(* One execution. Items have original keys. An item opens, may change while *)
(* open, and closes; a closed item never changes again. The log is the     *)
(* only source of facts: a batch is one commit that changes some items.    *)
(*                                                                         *)
(* Three holders of the open set:                                          *)
(*   proj   the durable projection: the open items and the head, written   *)
(*          in the commit that appends the batch;                          *)
(*   closed the durable index of closed items by original key, written in  *)
(*          the same commit;                                               *)
(*   view   the writer's in-memory open set and the head it has folded.    *)
(*                                                                         *)
(* A cold load (new process, new attachment) reads proj in pages. A page   *)
(* names the head it was read at; a load whose pages name two heads starts *)
(* again, up to MaxRestarts times, then answers unavailable.               *)
(*                                                                         *)
(* The Agent decides about an item from the snapshot; an item absent from   *)
(* the snapshot is looked up by its original key. A decision is committed  *)
(* only under the expected revision it was read at (conditional commit).   *)
(* A producer saves late results without an expected revision.             *)
(*                                                                         *)
(* Bug switches make one negative control each; all FALSE is the design.  *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS
  Keys,            \* original keys of the items
  MaxBatches,      \* commits explored
  MaxChanges,      \* how many times an open item may change
  MaxCrashes,
  MaxRestarts,     \* bound on cold-load restarts before it answers unavailable
  KeepClosed,      \* bug: closed items stay in the snapshot and in proj
  ProjectionLags,  \* bug: proj is written by a later step, not in the commit
  NoClosedIndex,   \* bug: closing an item removes it from proj, but no closed index entry is written
  AbsentAsNever,   \* bug: the Agent takes an item absent from the snapshot as never opened
  MixPages,        \* bug: a cold load accepts pages that name different heads
  UncheckedCommit  \* bug: the Agent commits a decision without the expected revision

ASSUME MaxBatches \in Nat /\ MaxBatches >= 1

None == [st |-> "none", n |-> 0]
Open(n) == [st |-> "open", n |-> n]
Closed(n) == [st |-> "closed", n |-> n]
States == {None} \cup {Open(n) : n \in 0..MaxChanges} \cup {Closed(n) : n \in 0..MaxChanges}

(* A change: open an absent item, change an open one, close an open one. *)
Changes == [k : Keys, op : {"open", "change", "close"}]
Idle == [busy |-> FALSE, rev |-> 0, key |-> "k0", saw |-> None]

VARIABLES
  log,        \* Seq of batches; a batch is a set of changes
  proj,       \* [open : Keys -> States restricted to open ones, head : Nat]
  closedIdx,  \* Keys -> States: the closed index (None when not closed)
  pending,    \* proj writes that lag (only with ProjectionLags)
  alive,      \* FALSE after a crash, until a cold load completes
  view,       \* the writer's in-memory open set and the head it folded
  load,       \* the pages of a cold load in progress; <<>> when none
  restarts,
  crashes,
  agent,      \* the Agent's read in progress: [busy, rev, key, saw]
  decisions   \* the decisions committed: set of [rev, key, saw]

vars == <<log, proj, closedIdx, pending, alive, view, load, restarts, crashes, agent, decisions>>

(* The truth: the state of every key after the first n batches of the log. *)
Step(st, op) ==
  CASE op = "open"   -> IF st = None THEN Open(0) ELSE st
    [] op = "change" -> IF st # None /\ st.st = "open" /\ st.n < MaxChanges THEN Open(st.n + 1) ELSE st
    [] op = "close"  -> IF st # None /\ st.st = "open" THEN Closed(st.n) ELSE st

ApplyBatch(f, b) == [k \in Keys |-> LET cs == {c \in b : c.k = k}
                                     IN IF cs = {} THEN f[k] ELSE Step(f[k], (CHOOSE c \in cs : TRUE).op)]

RECURSIVE TruthN(_)
TruthN(n) == IF n = 0 THEN [k \in Keys |-> None] ELSE ApplyBatch(TruthN(n - 1), log[n])
Truth == TruthN(Len(log))

IsOpen(st) == st # None /\ st.st = "open"
IsClosed(st) == st # None /\ st.st = "closed"
OpenPart(f) == [k \in {x \in Keys : IsOpen(f[x])} |-> f[k]]
KeptPart(f) == IF KeepClosed THEN [k \in {x \in Keys : f[x] # None} |-> f[k]] ELSE OpenPart(f)
ClosedPart(f) == [k \in Keys |-> IF IsClosed(f[k]) THEN f[k] ELSE None]

(* What the projection of the first n batches holds. *)
ProjOf(n) == [open |-> KeptPart(TruthN(n)), head |-> n]

(* A batch is legal against the current truth: each key changes at most once and the change applies. *)
Legal(b) ==
  /\ \A c1, c2 \in b : c1.k = c2.k => c1 = c2
  /\ \A c \in b : Step(Truth[c.k], c.op) # Truth[c.k]

Init ==
  /\ log = <<>>
  /\ proj = [open |-> [k \in {} |-> None], head |-> 0]
  /\ closedIdx = [k \in Keys |-> None]
  /\ pending = 0
  /\ alive = TRUE
  /\ view = [open |-> [k \in {} |-> None], head |-> 0]
  /\ load = <<>>
  /\ restarts = 0
  /\ crashes = 0
  /\ agent = Idle
  /\ decisions = {}

(* The writer appends one batch. In the design, proj and the closed index change in the same commit. *)
Commit(b) ==
  /\ Len(log) < MaxBatches
  /\ b # {}
  /\ Legal(b)
  /\ log' = Append(log, b)
  /\ LET after == ApplyBatch(Truth, b) IN
       /\ IF ProjectionLags
            THEN /\ pending' = pending + 1 /\ UNCHANGED <<proj, closedIdx>>
            ELSE /\ proj' = [open |-> KeptPart(after), head |-> Len(log) + 1]
                 /\ closedIdx' = IF NoClosedIndex THEN closedIdx ELSE ClosedPart(after)
                 /\ UNCHANGED pending
  /\ UNCHANGED <<alive, view, load, restarts, crashes, agent, decisions>>

ProducerCommit == \E b \in SUBSET Changes : Cardinality(b) <= 2 /\ Commit(b)

(* A lagging projection catches up one batch at a time (only with ProjectionLags). *)
CatchUpProjection ==
  /\ pending > 0
  /\ LET n == proj.head + 1 IN
       /\ proj' = ProjOf(n)
       /\ closedIdx' = IF NoClosedIndex THEN closedIdx ELSE ClosedPart(TruthN(n))
  /\ pending' = pending - 1
  /\ UNCHANGED <<log, alive, view, load, restarts, crashes, agent, decisions>>

(* The live writer folds the next batch into its in-memory open set: the open items of the fold. *)
Fold ==
  /\ alive
  /\ view.head < Len(log)
  /\ view' = [open |-> KeptPart(TruthN(view.head + 1)), head |-> view.head + 1]
  /\ UNCHANGED <<log, proj, closedIdx, pending, alive, load, restarts, crashes, agent, decisions>>

Crash ==
  /\ crashes < MaxCrashes
  /\ alive
  /\ alive' = FALSE
  /\ view' = [open |-> [k \in {} |-> None], head |-> 0]
  /\ load' = <<>>
  /\ agent' = Idle
  /\ crashes' = crashes + 1
  /\ UNCHANGED <<log, proj, closedIdx, pending, restarts, decisions>>

(* A cold load reads the projection in two pages: the first half of the keys, then the rest. *)
Half == CHOOSE s \in SUBSET Keys : Cardinality(s) * 2 >= Cardinality(Keys) /\ Cardinality(s) * 2 <= Cardinality(Keys) + 1
PageOf(part) == [open |-> [k \in DOMAIN proj.open \cap part |-> proj.open[k]], head |-> proj.head]

StartLoad ==
  /\ ~alive
  /\ load = <<>>
  /\ load' = <<PageOf(Half)>>
  /\ UNCHANGED <<log, proj, closedIdx, pending, alive, view, restarts, crashes, agent, decisions>>

SecondPage ==
  /\ Len(load) = 1
  /\ LET first == load[1]
         second == PageOf(Keys \ Half)
     IN IF first.head = second.head \/ MixPages
          THEN /\ view' = [open |-> [k \in DOMAIN first.open \cup DOMAIN second.open |->
                                      IF k \in DOMAIN first.open THEN first.open[k] ELSE second.open[k]],
                           head |-> second.head]
               /\ alive' = TRUE
               /\ load' = <<>>
               /\ UNCHANGED restarts
          ELSE /\ load' = <<>>
               /\ restarts' = IF restarts < MaxRestarts THEN restarts + 1 ELSE restarts
               /\ UNCHANGED <<alive, view>>
  /\ UNCHANGED <<log, proj, closedIdx, pending, crashes, agent, decisions>>

(* The Agent reads one item: from the snapshot when present, else by its original key. *)
Lookup(k) == IF closedIdx[k] # None THEN closedIdx[k] ELSE None
AgentRead(k) ==
  /\ alive
  /\ view.head = Len(log)
  /\ ~agent.busy
  /\ LET saw == IF k \in DOMAIN view.open THEN view.open[k]
                ELSE IF AbsentAsNever THEN None ELSE Lookup(k)
     IN agent' = [busy |-> TRUE, rev |-> view.head, key |-> k, saw |-> saw]
  /\ UNCHANGED <<log, proj, closedIdx, pending, alive, view, load, restarts, crashes, decisions>>

(* The Agent commits a decision about what it saw. Conditional on the revision it read at. *)
AgentDecide ==
  /\ agent.busy
  /\ IF UncheckedCommit \/ agent.rev = Len(log)
       THEN decisions' = decisions \cup {[rev |-> Len(log), key |-> agent.key, saw |-> agent.saw]}
       ELSE UNCHANGED decisions
  /\ agent' = Idle
  /\ UNCHANGED <<log, proj, closedIdx, pending, alive, view, load, restarts, crashes>>

Next ==
  \/ ProducerCommit
  \/ CatchUpProjection
  \/ Fold
  \/ Crash
  \/ StartLoad
  \/ SecondPage
  \/ \E k \in Keys : AgentRead(k)
  \/ AgentDecide

Spec == Init /\ [][Next]_vars

----
(* Properties *)

TypeOK ==
  /\ restarts \in 0..MaxRestarts
  /\ crashes \in 0..MaxCrashes
  /\ view.head \in 0..Len(log)

(* P1: the snapshot is the open set of the revision it names. *)
P1_SnapshotIsOpenSet == alive => view.open = OpenPart(TruthN(view.head))

(* P2: the durable projection is the open set of the whole log, in the same commit. *)
P2_ProjectionCurrent == proj.head = Len(log) /\ proj.open = OpenPart(Truth)

(* P3: every item that ever opened is reachable: in the projection when open, by key when closed. *)
P3_Reachable == \A k \in Keys :
  /\ IsOpen(Truth[k]) => k \in DOMAIN proj.open
  /\ IsClosed(Truth[k]) => closedIdx[k] = Truth[k]

(* P4: a committed decision saw the truth of its key at the revision it was committed at. *)
P4_DecisionsTrue == \A d \in decisions : d.saw = TruthN(d.rev)[d.key]

(* P5: the snapshot holds open items only: its size is bounded by the open work, not by history. *)
P5_OpenBound == alive => \A k \in DOMAIN view.open : IsOpen(view.open[k])

====
