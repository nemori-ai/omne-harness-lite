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
(*                                                                         *)
(* The writer holds only the open set in memory and takes a key absent    *)
(* from it as new. A write round folds to the head, judges its batch       *)
(* against the open set, and publishes on the condition that the head did  *)
(* not move. The store checks the batch inside the publish: a key it opens *)
(* is neither open nor in the closed index, a key it changes or closes is  *)
(* open. Another writer (another process) appends legal batches at any     *)
(* time.                                                                   *)
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
  UncheckedCommit, \* bug: the Agent commits a decision without the expected revision
  StoreUnchecked   \* bug: the store appends a published batch without checking it against proj and the closed index

ASSUME MaxBatches \in Nat /\ MaxBatches >= 1

None == [st |-> "none", n |-> 0]
Open(n) == [st |-> "open", n |-> n]
Closed(n) == [st |-> "closed", n |-> n]
States == {None} \cup {Open(n) : n \in 0..MaxChanges} \cup {Closed(n) : n \in 0..MaxChanges}

(* A change: open an absent item, change an open one, close an open one. *)
Changes == [k : Keys, op : {"open", "change", "close"}]
Idle == [busy |-> FALSE, rev |-> 0, key |-> "k0", saw |-> None]
NoRound == [busy |-> FALSE, head |-> 0, batch |-> {}, held |-> [k \in {} |-> None]]

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
  decisions,  \* the decisions committed: set of [rev, key, saw]
  round       \* the writer's round in progress: [busy, head, batch, held]

vars == <<log, proj, closedIdx, pending, alive, view, load, restarts, crashes, agent, decisions, round>>

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

(* A batch is legal against a state of its keys: each key changes at most once and the change applies. *)
LegalAgainst(b, f) ==
  /\ \A c1, c2 \in b : c1.k = c2.k => c1 = c2
  /\ \A c \in b : Step(f[c.k], c.op) # f[c.k]
Legal(b) == LegalAgainst(b, Truth)

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
  /\ round = NoRound

(* Appending one batch. In the design, proj and the closed index change in the same commit. *)
AppendBatch(b) ==
  /\ log' = Append(log, b)
  /\ LET after == ApplyBatch(Truth, b) IN
       /\ IF ProjectionLags
            THEN /\ pending' = pending + 1 /\ UNCHANGED <<proj, closedIdx>>
            ELSE /\ proj' = [open |-> KeptPart(after), head |-> Len(log) + 1]
                 /\ closedIdx' = IF NoClosedIndex THEN closedIdx ELSE ClosedPart(after)
                 /\ UNCHANGED pending

Batches == {b \in SUBSET Changes : b # {} /\ Cardinality(b) <= 2}

(* Another writer appends a legal batch. *)
OtherCommit ==
  /\ Len(log) < MaxBatches
  /\ \E b \in Batches : Legal(b) /\ AppendBatch(b)
  /\ UNCHANGED <<alive, view, load, restarts, crashes, agent, decisions, round>>

(* A lookup by original key in the closed index. *)
Lookup(k) == IF closedIdx[k] # None THEN closedIdx[k] ELSE None

(* What the writer holds about a key: the open set in memory; a key absent from it counts as new. *)
Held(k) == IF k \in DOMAIN view.open THEN view.open[k] ELSE None

(* What the store accepts in a publish: a key the batch opens is neither open nor closed,
   a key it changes or closes is open. *)
StoreAccepts(b) == \A c \in b :
  IF c.op = "open" THEN c.k \notin DOMAIN proj.open /\ closedIdx[c.k] = None
  ELSE c.k \in DOMAIN proj.open

(* The writer starts a round: it has folded to the head and judges one change against its open set.
   A round writes one change: keys are independent here, and a larger batch adds no interleaving. *)
RoundStart ==
  /\ alive
  /\ ~round.busy
  /\ view.head = Len(log)
  /\ Len(log) < MaxBatches
  /\ \E c \in Changes :
       round' = [busy |-> TRUE, head |-> Len(log), batch |-> {c}, held |-> [k \in {c.k} |-> Held(k)]]
  /\ UNCHANGED <<log, proj, closedIdx, pending, alive, view, load, restarts, crashes, agent, decisions>>

(* The writer publishes the round: on the condition that the head did not move, a batch legal against
   what it holds and accepted by the store is appended; otherwise it is refused, and a moved head
   ends the round for another one. *)
RoundPublish ==
  /\ round.busy
  /\ Len(log) < MaxBatches
  /\ IF /\ Len(log) = round.head
        /\ LegalAgainst(round.batch, round.held)
        /\ StoreUnchecked \/ StoreAccepts(round.batch)
       THEN AppendBatch(round.batch)
       ELSE UNCHANGED <<log, proj, closedIdx, pending>>
  /\ round' = NoRound
  /\ UNCHANGED <<alive, view, load, restarts, crashes, agent, decisions>>

(* A lagging projection catches up one batch at a time (only with ProjectionLags). *)
CatchUpProjection ==
  /\ pending > 0
  /\ LET n == proj.head + 1 IN
       /\ proj' = ProjOf(n)
       /\ closedIdx' = IF NoClosedIndex THEN closedIdx ELSE ClosedPart(TruthN(n))
  /\ pending' = pending - 1
  /\ UNCHANGED <<log, alive, view, load, restarts, crashes, agent, decisions, round>>

(* The live writer folds the next batch into its in-memory open set: the open items of the fold. *)
Fold ==
  /\ alive
  /\ view.head < Len(log)
  /\ view' = [open |-> KeptPart(TruthN(view.head + 1)), head |-> view.head + 1]
  /\ UNCHANGED <<log, proj, closedIdx, pending, alive, load, restarts, crashes, agent, decisions, round>>

Crash ==
  /\ crashes < MaxCrashes
  /\ alive
  /\ alive' = FALSE
  /\ view' = [open |-> [k \in {} |-> None], head |-> 0]
  /\ load' = <<>>
  /\ agent' = Idle
  /\ round' = NoRound
  /\ crashes' = crashes + 1
  /\ UNCHANGED <<log, proj, closedIdx, pending, restarts, decisions>>

(* A cold load reads the projection in two pages: the first half of the keys, then the rest. *)
Half == CHOOSE s \in SUBSET Keys : Cardinality(s) * 2 >= Cardinality(Keys) /\ Cardinality(s) * 2 <= Cardinality(Keys) + 1
PageOf(part) == [open |-> [k \in DOMAIN proj.open \cap part |-> proj.open[k]], head |-> proj.head]

StartLoad ==
  /\ ~alive
  /\ load = <<>>
  /\ load' = <<PageOf(Half)>>
  /\ UNCHANGED <<log, proj, closedIdx, pending, alive, view, restarts, crashes, agent, decisions, round>>

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
  /\ UNCHANGED <<log, proj, closedIdx, pending, crashes, agent, decisions, round>>

(* The Agent reads one item: from the snapshot when present, else by its original key. *)
AgentRead(k) ==
  /\ alive
  /\ view.head = Len(log)
  /\ ~agent.busy
  /\ LET saw == IF k \in DOMAIN view.open THEN view.open[k]
                ELSE IF AbsentAsNever THEN None ELSE Lookup(k)
     IN agent' = [busy |-> TRUE, rev |-> view.head, key |-> k, saw |-> saw]
  /\ UNCHANGED <<log, proj, closedIdx, pending, alive, view, load, restarts, crashes, decisions, round>>

(* The Agent commits a decision about what it saw. Conditional on the revision it read at. *)
AgentDecide ==
  /\ agent.busy
  /\ IF UncheckedCommit \/ agent.rev = Len(log)
       THEN decisions' = decisions \cup {[rev |-> Len(log), key |-> agent.key, saw |-> agent.saw]}
       ELSE UNCHANGED decisions
  /\ agent' = Idle
  /\ UNCHANGED <<log, proj, closedIdx, pending, alive, view, load, restarts, crashes, round>>

Next ==
  \/ OtherCommit
  \/ RoundStart
  \/ RoundPublish
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

(* P6: every logged change applied to the truth before it; in particular a closed key never opens again. *)
P6_KeyOpensOnce == \A n \in 1..Len(log) : \A c \in log[n] : Step(TruthN(n - 1)[c.k], c.op) # TruthN(n - 1)[c.k]

====
