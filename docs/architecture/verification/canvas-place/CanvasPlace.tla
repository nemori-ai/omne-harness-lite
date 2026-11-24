---------------------------- MODULE CanvasPlace ----------------------------
(* Placing a reference on the canvas: the kind is read, the limit is read,   *)
(* the owner of the kind is asked (admit), and the record is committed with  *)
(* its conditions. Several placements run at once; the kind can be withdrawn *)
(* and declared again; the owner can be slow. Names follow                   *)
(* packages/canvas/SPEC.md.                                                  *)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Refs,     \* the references that can be placed
  Callers,  \* the placements that can be in flight at once
  Cap,      \* the limit on references that are on the paper
  Bugs      \* the defects switched on; {} is the design

VARIABLES
  kind,       \* "on": declared; "retiring": being withdrawn; "off": withdrawn
  rows,       \* per reference: how many records say it is on the paper
  held,       \* per reference: the owner holds it for the canvas
  pc,         \* per placement: "idle", "admitting" (the owner is being asked), "admitted"
  want,       \* per placement: the reference it places
  sawFull,    \* history: the paper was full when this placement read the limit
  late,       \* owner calls the canvas no longer waits for
  badCommit   \* history: a record was committed while the kind was not declared

vars == <<kind, rows, held, pc, want, sawFull, late, badCommit>>

Bug(b) == b \in Bugs

RECURSIVE Sum(_)
Sum(S) == IF S = {} THEN 0
          ELSE LET r == CHOOSE x \in S : TRUE IN rows[r] + Sum(S \ {r})

OnPaper == Sum(Refs)

Init ==
  /\ kind = "on"
  /\ rows = [r \in Refs |-> 0]
  /\ held = [r \in Refs |-> FALSE]
  /\ pc = [c \in Callers |-> "idle"]
  /\ want = [c \in Callers |-> CHOOSE r \in Refs : TRUE]
  /\ sawFull = [c \in Callers |-> FALSE]
  /\ late = {}
  /\ badCommit = FALSE

(* A placement starts. A reference already on the paper answers no-change,   *)
(* an undeclared kind and a full paper answer conflict: none of these change *)
(* anything, so they are not steps.                                          *)
Start(c, r) ==
  /\ pc[c] = "idle"
  /\ rows[r] = 0
  /\ kind = "on"
  /\ Bug("admit-before-limit") \/ OnPaper < Cap
  /\ pc' = [pc EXCEPT ![c] = "admitting"]
  /\ want' = [want EXCEPT ![c] = r]
  /\ sawFull' = [sawFull EXCEPT ![c] = (OnPaper >= Cap)]
  /\ rows' = IF Bug("commit-before-admit") THEN [rows EXCEPT ![r] = @ + 1] ELSE rows
  /\ UNCHANGED <<kind, held, late, badCommit>>

(* The owner accepts: it holds the reference. Asking again for a reference   *)
(* it already holds changes nothing.                                         *)
AdmitAccept(c) ==
  /\ pc[c] = "admitting"
  /\ held' = [held EXCEPT ![want[c]] = TRUE]
  /\ pc' = [pc EXCEPT ![c] = "admitted"]
  /\ UNCHANGED <<kind, rows, want, sawFull, late, badCommit>>

(* The owner refuses, answers basis-unavailable or unknown, or throws.       *)
AdmitRefuse(c) ==
  /\ pc[c] = "admitting"
  /\ pc' = [pc EXCEPT ![c] = "idle"]
  /\ UNCHANGED <<kind, rows, held, want, sawFull, late, badCommit>>

(* The time limit of the canvas passes. The owner may still act later.       *)
Timeout(c) ==
  /\ ~Bug("no-admit-limit")
  /\ pc[c] = "admitting"
  /\ pc' = [pc EXCEPT ![c] = "idle"]
  /\ late' = late \cup {want[c]}
  /\ UNCHANGED <<kind, rows, held, want, sawFull, badCommit>>

LateHold(r) ==
  /\ r \in late
  /\ held' = [held EXCEPT ![r] = TRUE]
  /\ late' = late \ {r}
  /\ UNCHANGED <<kind, rows, pc, want, sawFull, badCommit>>

LateDrop(r) ==
  /\ r \in late
  /\ late' = late \ {r}
  /\ UNCHANGED <<kind, rows, held, pc, want, sawFull, badCommit>>

(* The commit is one conditional write: the reference is still off the       *)
(* paper, the paper is still below the limit, the kind is still declared.    *)
Commit(c) ==
  LET r == want[c]
      refOk == Bug("no-recheck-ref") \/ rows[r] = 0
      capOk == Bug("no-recheck-limit") \/ OnPaper < Cap
      kindOk == Bug("no-recheck-kind") \/ kind = "on"
      writes == ~Bug("commit-before-admit") /\ refOk /\ capOk /\ kindOk
  IN /\ pc[c] = "admitted"
     /\ pc' = [pc EXCEPT ![c] = "idle"]
     /\ rows' = IF writes THEN [rows EXCEPT ![r] = @ + 1] ELSE rows
     /\ badCommit' = (badCommit \/ (writes /\ kind # "on"))
     /\ UNCHANGED <<kind, held, want, sawFull, late>>

(* The commit fails or its outcome stays unknown: no record, the hold stays. *)
Lose(c) ==
  /\ pc[c] = "admitted"
  /\ pc' = [pc EXCEPT ![c] = "idle"]
  /\ UNCHANGED <<kind, rows, held, want, sawFull, late, badCommit>>

(* Taking a reference off the paper. The hold is not released.               *)
Take(r) ==
  /\ rows[r] > 0
  /\ rows' = [rows EXCEPT ![r] = 0]
  /\ UNCHANGED <<kind, held, pc, want, sawFull, late, badCommit>>

(* The contributor of the kind leaves. Its batch drains: no new admit, the   *)
(* ones in flight end, then the entry is taken.                              *)
Withdraw ==
  /\ kind = "on"
  /\ kind' = IF Bug("withdraw-without-drain") THEN "off" ELSE "retiring"
  /\ UNCHANGED <<rows, held, pc, want, sawFull, late, badCommit>>

Drained ==
  /\ kind = "retiring"
  /\ \A c \in Callers : pc[c] # "admitting"
  /\ kind' = "off"
  /\ UNCHANGED <<rows, held, pc, want, sawFull, late, badCommit>>

Declare ==
  /\ kind = "off"
  /\ kind' = "on"
  /\ UNCHANGED <<rows, held, pc, want, sawFull, late, badCommit>>

Next ==
  \/ \E c \in Callers, r \in Refs : Start(c, r)
  \/ \E c \in Callers : AdmitAccept(c) \/ AdmitRefuse(c) \/ Timeout(c) \/ Commit(c) \/ Lose(c)
  \/ \E r \in Refs : LateHold(r) \/ LateDrop(r) \/ Take(r)
  \/ Withdraw \/ Drained \/ Declare

(* The owner is not assumed to answer. The canvas is: its time limit passes, *)
(* its commit runs, its drain is reported.                                   *)
Fairness ==
  /\ \A c \in Callers : WF_vars(Timeout(c)) /\ WF_vars(Commit(c))
  /\ WF_vars(Drained)

Spec == Init /\ [][Next]_vars /\ Fairness

TypeOK ==
  /\ kind \in {"on", "retiring", "off"}
  /\ rows \in [Refs -> 0..Cardinality(Callers)]
  /\ held \in [Refs -> BOOLEAN]
  /\ pc \in [Callers -> {"idle", "admitting", "admitted"}]
  /\ want \in [Callers -> Refs]
  /\ sawFull \in [Callers -> BOOLEAN]
  /\ late \subseteq Refs
  /\ badCommit \in BOOLEAN

(* CV-13, ME-4: a reference on the paper is held by its owner.               *)
RecordIsHeld == \A r \in Refs : rows[r] > 0 => held[r]

(* CV-11: one record for a reference; the limit is kept.                     *)
OnePerRef == \A r \in Refs : rows[r] <= 1
WithinLimit == OnPaper <= Cap

(* The owner is not asked for a placement that cannot be made.               *)
NoAdmitWhenFull == \A c \in Callers : pc[c] = "admitting" => ~sawFull[c]

(* CV-13: the kind is declared at the moment of the commit.                  *)
CommitWhileDeclared == ~badCommit

(* A withdrawn entry is not called: the batch drained first.                 *)
NoCallAfterGone == \A c \in Callers : pc[c] = "admitting" => kind # "off"

(* Every placement ends, and a withdrawal completes, whatever the owner does. *)
PlaceEnds == \A c \in Callers : (pc[c] # "idle") ~> (pc[c] = "idle")
DrainEnds == (kind = "retiring") ~> (kind = "off")
=============================================================================
