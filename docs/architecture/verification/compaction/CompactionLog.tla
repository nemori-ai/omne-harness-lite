--------------------------- MODULE CompactionLog ---------------------------
(* Scope: one adoption, optionally one prior compaction, a call/result pair,
   one concurrent tail and one protection/epoch change. Provenance and authorization
   are trusted environment predicates, not cryptographic or access-control proofs.
   ProtectReference models a stronger environmental disturbance than the current
   business path. No performance, content quality or storage conformance claim. *)
EXTENDS Naturals, Sequences, FiniteSets, TLC
CONSTANT Bug, Prior
VARIABLES s
vars == <<s>>

(* Numbers stand for authority-provided log ranks, never parsed opaque refs.
   1 = non-message origin, 2 = call, 3 = result, 4 = old user,
   5 = prior tail, 6 = prior compaction, 7 = concurrent tail, 8 = new compaction.
   Prior view is deliberately NOT in log-rank order: 2,3,6,5. *)
InitialLog == IF Prior THEN <<1,2,3,4,5,6>> ELSE <<1,2,3,4>>
InitialView == IF Prior THEN <<2,3,6,5>> ELSE <<2,3,4>>
Visible == {InitialView[i] : i \in 1..Len(InitialView)}
Upper == IF Prior THEN 6 ELSE 4
InitialOpenDomain == IF Prior THEN {2,3,5} ELSE {1,2,3,4}
OldPairs == {<<2,3>>}
Order(xs, kept) == SelectSeq(xs, LAMBDA ref: ref \in kept)

Init == \E opened \in SUBSET InitialOpenDomain :
  s = [raw |-> InitialLog, view |-> InitialView, epoch |-> 0,
    snapshotOpen |-> opened, currentOpen |-> opened,
    chosen |-> FALSE, cut |-> 0, from |-> 1, keep |-> {},
    modelVisible |-> TRUE, provenance |-> TRUE,
    tail |-> "none", active |-> TRUE, committed |-> FALSE, protectionChanged |-> FALSE,
    beforeCommit |-> <<>>, commitOpen |-> {}, commitEpoch |-> 0,
    commitActive |-> TRUE,
    submitted |-> [first |-> 1, cut |-> 0, keep |-> {}, visible |-> TRUE, trusted |-> TRUE]]

Choose == /\ ~s.chosen
  /\ \E cut \in 1..Upper, keep \in SUBSET (2..Upper),
         first \in {1,2}, visible \in BOOLEAN, trusted \in BOOLEAN :
     s' = [s EXCEPT !.chosen = TRUE, !.cut = cut, !.keep = keep,
       !.from = first, !.modelVisible = visible, !.provenance = trusted]

AppendUser == /\ ~s.committed /\ s.tail = "none"
  /\ s' = [s EXCEPT !.raw = Append(@,7), !.tail = "user",
      !.view = Append(@,7), !.currentOpen = @ \cup {7}]
AppendResult == /\ ~s.committed /\ s.tail = "none"
  /\ s' = [s EXCEPT !.raw = Append(@,7), !.tail = "result",
      !.view = Append(@,7), !.currentOpen = @ \cup {2,7}]
ReplaceEpoch == /\ ~s.committed /\ s.epoch = 0
  /\ s' = [s EXCEPT !.epoch = 1]
Revoke == /\ s.active
  /\ s' = [s EXCEPT !.active = FALSE]
ProtectReference == /\ ~s.committed /\ ~s.protectionChanged
  /\ s' = [s EXCEPT !.protectionChanged = TRUE,
      !.currentOpen = @ \cup {IF Prior THEN 5 ELSE 4}]

Covered == {r \in 1..Upper : r <= s.cut}
After == {r \in Visible : r > s.cut} \cup IF s.tail = "none" THEN {} ELSE {7}
CandidateVisible == s.keep \cup After \cup {8}
Pairs == OldPairs \cup IF s.tail = "result" THEN {<<2,7>>} ELSE {}
PairsOK == \A p \in Pairs : (p[1] \in CandidateVisible) <=> (p[2] \in CandidateVisible)
OpenOK(opened) == (opened \cap Covered) \subseteq s.keep
KeepOK == s.keep \subseteq (Visible \cap Covered)
RangeOK == s.from = 1 /\ (~Prior \/ s.cut >= 6)

CommitDerived == /\ s.chosen /\ ~s.committed /\ RangeOK
  /\ (s.active \/ Bug = "ignore-revocation")
  /\ (s.epoch = 0 \/ Bug = "stale-epoch")
  /\ (s.modelVisible \/ Bug = "invisible-summary")
  /\ (s.provenance \/ Bug = "untrusted-derivation")
  /\ (KeepOK \/ (Bug = "resurrect" /\ s.keep \subseteq Covered))
  /\ (PairsOK \/ Bug = "split-pair")
  /\ OpenOK(IF Bug = "stale-protection" THEN s.snapshotOpen ELSE s.currentOpen)
  /\ LET submittedKeep == IF Bug = "rewrite-message" THEN s.keep \cup {1} ELSE s.keep
         kept == Order(InitialLog, submittedKeep)
         tail == Order(s.raw, After)
         view == kept \o <<8>> \o tail
     IN s' = [s EXCEPT !.committed = TRUE,
       !.raw = IF Bug = "overwrite-history" THEN <<8>> ELSE Append(@,8),
       !.view = IF s.modelVisible THEN view ELSE @,
       !.beforeCommit = s.raw, !.commitOpen = s.currentOpen,
       !.commitEpoch = s.epoch, !.commitActive = s.active,
       !.submitted = [first |-> s.from, cut |-> s.cut, keep |-> submittedKeep,
                      visible |-> s.modelVisible, trusted |-> s.provenance]]

Next == Choose \/ AppendUser \/ AppendResult \/ ReplaceEpoch \/ Revoke \/
        ProtectReference \/ CommitDerived
Spec == Init /\ [][Next]_vars
TypeOK == /\ s.cut \in 0..Upper /\ s.tail \in {"none","user","result"}
  /\ s.epoch \in {0,1} /\ s.keep \subseteq 2..Upper
AdoptedView == {s.view[i]: i \in 1..Len(s.view)}
RawPreserved == s.committed => s.raw = Append(s.beforeCommit,8)
NoResurrection == s.committed => s.submitted.keep \subseteq (Visible \cap Covered)
ProtectedWork == s.committed => (s.commitOpen \cap Covered) \subseteq s.submitted.keep
Pairing == s.committed => \A p \in Pairs :
  (p[1] \in AdoptedView) <=> (p[2] \in AdoptedView)
CurrentEpoch == s.committed => s.commitEpoch = 0
VisibleSummary == s.committed => 8 \in AdoptedView
AuthenticatedDerivation == s.committed => s.submitted.trusted
AuthorizedAdoption == s.committed => s.commitActive
UnchangedMessage == s.committed => s.submitted =
  [first |-> s.from, cut |-> s.cut, keep |-> s.keep,
   visible |-> s.modelVisible, trusted |-> s.provenance]
TailPreserved == s.committed /\ s.tail # "none" => 7 \in {s.view[i]: i \in 1..Len(s.view)}
(* Reachability witnesses, not product safety obligations. *)
NoSuccessfulCommit == ~s.committed
NoConcurrentTailCommit == ~(s.committed /\ s.tail = "user")
=============================================================================
