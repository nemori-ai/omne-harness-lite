---------------------------- MODULE SearchCoverage ----------------------------
(***************************************************************************)
(* History search over a lagging index.                                    *)
(*                                                                         *)
(* The session log is the authority. An index generation holds rows (one   *)
(* per indexed log position) and, for each session, the position it is     *)
(* covered through. A tailer copies log positions into every generation.   *)
(* A rebuild creates a new generation and swaps it in at any time. A query *)
(* reads the covered positions, then the rows, then the log tail, and      *)
(* scans the log between the covered position and that tail.               *)
(*                                                                         *)
(* Every log position stands for a message that matches the query. This is *)
(* the worst case for completeness: a position that is not returned is a   *)
(* false negative.                                                         *)
(*                                                                         *)
(* Switches. The design is: all FALSE.                                     *)
(*   NonAtomicCover     the tailer advances the covered position and       *)
(*                      writes the rows in two commits.                    *)
(*   RowsBeforeCovered  the query reads the rows before the covered        *)
(*                      positions.                                         *)
(*   MixGenerations     the query reads the covered positions of the       *)
(*                      generation it bound and the rows of the current    *)
(*                      generation.                                        *)
(*   SilentBudget       a tail scan that exceeds its budget does not mark  *)
(*                      the answer incomplete.                             *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Sessions, MaxPos, MaxGen, Budget, MaxCrashes,
          NonAtomicCover, RowsBeforeCovered, MixGenerations, SilentBudget

VARIABLES
  tail,     \* session -> last log position
  rows,     \* generation -> set of <<session, position>>
  covered,  \* generation -> session -> position covered through
  cur,      \* the generation that serves new queries
  made,     \* the newest generation that exists
  half,     \* a tailer between its two commits (NonAtomicCover only), or None
  q,        \* the one query in flight
  crashes

vars == <<tail, rows, covered, cur, made, half, q, crashes>>

None == [none |-> TRUE]
Gens == 1..MaxGen
Positions == 1..MaxPos
Cells == Sessions \X Positions
Idle == [pc |-> "idle"]

Within(t) == {c \in Cells : c[2] <= t[c[1]]}
Between(c, t) == {x \in Cells : c[x[1]] < x[2] /\ x[2] <= t[x[1]]}

Init ==
  /\ tail = [s \in Sessions |-> 0]
  /\ rows = [g \in Gens |-> {}]
  /\ covered = [g \in Gens |-> [s \in Sessions |-> 0]]
  /\ cur = 1
  /\ made = 1
  /\ half = None
  /\ q = Idle
  /\ crashes = 0

(* A commit appends one position to the log of a session. *)
Append(s) ==
  /\ tail[s] < MaxPos
  /\ tail' = [tail EXCEPT ![s] = @ + 1]
  /\ UNCHANGED <<rows, covered, cur, made, half, q, crashes>>

(* The tailer copies a batch of one session into one generation. In the    *)
(* design the rows and the covered position are one commit of the index.   *)
Tail(g, s, to) ==
  /\ half = None
  /\ g <= made
  /\ covered[g][s] < to /\ to <= tail[s]
  /\ covered' = [covered EXCEPT ![g][s] = to]
  /\ IF NonAtomicCover
       THEN /\ half' = [g |-> g, s |-> s, from |-> covered[g][s], to |-> to]
            /\ rows' = rows
       ELSE /\ half' = half
            /\ rows' = [rows EXCEPT ![g] = @ \cup {<<s, p>> : p \in (covered[g][s] + 1)..to}]
  /\ UNCHANGED <<tail, cur, made, q, crashes>>

TailSecondHalf ==
  /\ half # None
  /\ rows' = [rows EXCEPT ![half.g] = @ \cup {<<half.s, p>> : p \in (half.from + 1)..half.to}]
  /\ half' = None
  /\ UNCHANGED <<tail, covered, cur, made, q, crashes>>

(* A rebuild makes an empty generation. The swap may happen at any time:   *)
(* how far the new generation is covered affects cost, not correctness.    *)
StartRebuild ==
  /\ made < MaxGen
  /\ made' = made + 1
  /\ UNCHANGED <<tail, rows, covered, cur, half, q, crashes>>

Swap ==
  /\ cur < made
  /\ cur' = made
  /\ UNCHANGED <<tail, rows, covered, made, half, q, crashes>>

(* The process is killed. Committed index state and the log survive. The   *)
(* query in flight and a tailer between its two commits are lost.          *)
Crash ==
  /\ crashes < MaxCrashes
  /\ crashes' = crashes + 1
  /\ half' = None
  /\ q' = Idle
  /\ UNCHANGED <<tail, rows, covered, cur, made>>

(* The query. Step 1 binds a generation and reads its covered positions    *)
(* (design) or its rows (RowsBeforeCovered).                               *)
QBind ==
  /\ q.pc = "idle"
  /\ q' = [pc |-> "bound", g |-> cur, start |-> tail,
           c |-> IF RowsBeforeCovered THEN [s \in Sessions |-> 0] ELSE covered[cur],
           r |-> IF RowsBeforeCovered THEN rows[cur] ELSE {}]
  /\ UNCHANGED <<tail, rows, covered, cur, made, half, crashes>>

(* Step 2 reads the other half from the index.                             *)
QIndex ==
  /\ q.pc = "bound"
  /\ LET from == IF MixGenerations THEN cur ELSE q.g
     IN q' = [q EXCEPT !.pc = "read",
                       !.c = IF RowsBeforeCovered THEN covered[q.g] ELSE q.c,
                       !.r = IF RowsBeforeCovered THEN q.r ELSE rows[from]]
  /\ UNCHANGED <<tail, rows, covered, cur, made, half, crashes>>

(* Step 3 reads the log tail and scans what the index did not cover.       *)
QScan ==
  /\ q.pc = "read"
  /\ LET gap == Between(q.c, tail)
         fits == Cardinality(gap) <= Budget
     IN q' = [pc |-> "done", start |-> q.start, t |-> tail,
              res |-> (q.r \cap Within(tail)) \cup (IF fits THEN gap ELSE {}),
              incomplete |-> (~fits) /\ ~SilentBudget]
  /\ UNCHANGED <<tail, rows, covered, cur, made, half, crashes>>

QEnd ==
  /\ q.pc = "done"
  /\ q' = Idle
  /\ UNCHANGED <<tail, rows, covered, cur, made, half, crashes>>

Next ==
  \/ \E s \in Sessions : Append(s)
  \/ \E g \in Gens, s \in Sessions, to \in Positions : Tail(g, s, to)
  \/ TailSecondHalf
  \/ StartRebuild \/ Swap \/ Crash
  \/ QBind \/ QIndex \/ QScan \/ QEnd

Spec == Init /\ [][Next]_vars

-------------------------------------------------------------------------------
TypeOK ==
  /\ tail \in [Sessions -> 0..MaxPos]
  /\ rows \in [Gens -> SUBSET Cells]
  /\ covered \in [Gens -> [Sessions -> 0..MaxPos]]
  /\ cur \in Gens /\ made \in Gens /\ cur <= made
  /\ crashes \in 0..MaxCrashes

(* S1. Within the log the query saw, every position is returned, or the    *)
(* answer says it is incomplete.                                           *)
S1_Complete ==
  q.pc = "done" => (q.incomplete \/ Within(q.t) \subseteq q.res)

(* S2. Nothing is returned that the log does not hold.                     *)
S2_NoExtras ==
  q.pc = "done" => q.res \subseteq Within(tail)

(* S3. What was in the log when the query began is inside what it saw.     *)
S3_ReadYourWrites ==
  q.pc = "done" => \A s \in Sessions : q.start[s] <= q.t[s]

(* S4. An index never claims to cover more than the log holds, and while   *)
(* no tailer is between two commits its rows are exactly what it covers.   *)
S4_CoverMatchesRows ==
  /\ \A g \in Gens, s \in Sessions : covered[g][s] <= tail[s]
  /\ half = None =>
       \A g \in Gens : rows[g] = {c \in Cells : c[2] <= covered[g][c[1]]}
===============================================================================
