--------------------------- MODULE GapIsolation ---------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANTS Bug, CustodyAuthorized
Workers == {1,2}
EmptyPrep == [stage |-> "idle", root |-> 0, afterGap |-> FALSE]
VARIABLES s, prep
vars == <<s, prep>>
(* The normal source is an intact event of E1. The frontier discovers a missing
   committed slot in E2. Both executions belong to this same Session. *)
Business(x) == <<x.cursor, x.effects, x.pending, x.answers, x.gapCursor>>
Init ==
  /\ s=[root |-> 0, isolated |-> FALSE, gapDiscovered |-> FALSE,
         repairResponsibility |-> FALSE, frontier |-> "idle",
         rawE1 |-> <<"effect">>, rawE2 |-> <<"missing","tail">>,
         cursor |-> 0, gapCursor |-> 0, effects |-> {}, pending |-> {1}, answers |-> {},
         atGap |-> <<0,{},{1},{},0>>, preparedAtGap |-> {},
         oldAttemptBlocked |-> {}, newNormalBlocked |-> {}, newCommandBlocked |-> FALSE,
         newNormalRequested |-> {}, commandDone |-> FALSE,
         oldViolation |-> FALSE, newNormalViolation |-> FALSE, commandViolation |-> FALSE,
         head |-> 1, custody |-> FALSE, custodyAfterGap |-> FALSE,
         inspection |-> FALSE, querySeen |-> FALSE, queryResult |-> "none"]
  /\ prep=[w \in Workers |-> EmptyPrep]

CaptureFrontier ==
  /\ s.frontier="idle" /\ ~s.isolated
  /\ s'=[s EXCEPT !.frontier="scan"]
  /\ UNCHANGED prep
(* Linearization point: the authoritative gap is observed and the shared
   Session gate closes together. This is not a committed log mutation. *)
DiscoverGap ==
  /\ s.frontier="scan" /\ ~s.gapDiscovered
  /\ s.rawE2[1]="missing"
  /\ s'=[s EXCEPT !.gapDiscovered=TRUE, !.isolated=TRUE,
          !.repairResponsibility=TRUE, !.frontier="quarantined",
          !.atGap=Business(s),
          !.preparedAtGap={w \in Workers : prep[w].stage="ready"}]
  /\ UNCHANGED prep

PrepareNormal(w) ==
  /\ prep[w].stage="idle" /\ s.cursor=0
  /\ (~s.isolated \/ (Bug="new-normal" /\ w=2))
  /\ prep'=[prep EXCEPT ![w]=[stage |-> "ready", root |-> s.root, afterGap |-> s.isolated]]
  /\ s'=[s EXCEPT !.newNormalRequested=IF s.isolated THEN @ \cup {w} ELSE @]
RejectNewNormal(w) ==
  /\ prep[w].stage="idle" /\ s.isolated /\ ~(Bug="new-normal" /\ w=2)
  /\ prep'=[prep EXCEPT ![w].stage="quarantined"]
  /\ s'=[s EXCEPT !.newNormalBlocked=@ \cup {w}, !.newNormalRequested=@ \cup {w}]

PublishNormal(w) ==
  /\ prep[w].stage="ready" /\ prep[w].root=s.root /\ s.cursor=0
  /\ (~s.isolated \/ (Bug="old-publish" /\ ~prep[w].afterGap)
                    \/ (Bug="new-normal" /\ w=2 /\ prep[w].afterGap))
  /\ s'=[s EXCEPT !.root=@+1, !.cursor=1, !.effects={"E1:1"}, !.answers=@ \cup {"interpret:E1:1"},
          !.oldViolation=@ \/ (s.isolated /\ ~prep[w].afterGap),
          !.newNormalViolation=@ \/ (s.isolated /\ prep[w].afterGap)]
  /\ prep'=[prep EXCEPT ![w].stage="done"]
RejectOldNormal(w) ==
  /\ prep[w].stage="ready" /\ s.isolated
  /\ ~(Bug="old-publish" /\ ~prep[w].afterGap)
  /\ ~(Bug="new-normal" /\ w=2 /\ prep[w].afterGap)
  /\ s'=[s EXCEPT !.oldAttemptBlocked=IF w \in s.preparedAtGap THEN @ \cup {w} ELSE @]
  /\ prep'=[prep EXCEPT ![w].stage="quarantined"]
NormalConflict(w) ==
  /\ prep[w].stage="ready" /\ ~s.isolated /\ prep[w].root#s.root
  /\ prep'=[prep EXCEPT ![w]=EmptyPrep]
  /\ UNCHANGED s

(* A second actor requests a new governance command against current authority. *)
NewCommand ==
  /\ ~s.commandDone /\ ~s.newCommandBlocked
  /\ (~s.isolated \/ Bug="new-command")
  /\ s'=[s EXCEPT !.root=@+1, !.pending=@ \cup {2}, !.answers=@ \cup {"accept:2"},
          !.commandDone=TRUE, !.commandViolation=@ \/ s.isolated]
  /\ UNCHANGED prep
RejectNewCommand ==
  /\ s.isolated /\ ~s.commandDone /\ ~s.newCommandBlocked /\ Bug#"new-command"
  /\ s'=[s EXCEPT !.newCommandBlocked=TRUE]
  /\ UNCHANGED prep

(* Independent Agent custody uses its own still-valid authorization. It can
   change the common root/head, but does not interpret Session consequences. *)
Custody ==
  /\ CustodyAuthorized /\ ~s.custody
  /\ s'=[s EXCEPT !.root=@+1, !.head=@+1, !.custody=TRUE,
          !.custodyAfterGap=s.isolated]
  /\ UNCHANGED prep
Inspect ==
  /\ s.isolated /\ ~s.inspection
  /\ s'=[s EXCEPT !.inspection=TRUE]
  /\ UNCHANGED prep
(* Existing operation lookup is read-only and assumes current read authority.
   Unavailable reads may stutter. Neither branch certifies an empty work queue. *)
QueryOriginal ==
  /\ s.isolated /\ "interpret:E1:1" \in s.answers /\ ~s.querySeen
  /\ s'=[s EXCEPT !.querySeen=TRUE, !.queryResult="committed"]
  /\ UNCHANGED prep

Next == CaptureFrontier \/ DiscoverGap \/ NewCommand \/ RejectNewCommand \/ Custody \/ Inspect \/ QueryOriginal
     \/ (\E w \in Workers : PrepareNormal(w) \/ RejectNewNormal(w) \/ PublishNormal(w)
                          \/ RejectOldNormal(w) \/ NormalConflict(w))
TypeOK == /\ s.cursor \in 0..1 /\ s.pending \subseteq {1,2}
          /\ s.root \in 0..3 /\ s.head \in 1..2
SessionIsolation == s.isolated => Business(s)=s.atGap
OldPreparedIsolated == ~s.oldViolation
NewInterpreterIsolated == ~s.newNormalViolation
NewCommandIsolated == ~s.commandViolation
GapPreserved == s.rawE2 = <<"missing","tail">> /\ s.gapCursor=0
RepairRetained == s.gapDiscovered => s.isolated /\ s.repairResponsibility
PrefixAtomic == (s.cursor=1) <=> (s.effects={"E1:1"} /\ "interpret:E1:1" \in s.answers)
CustodySeparate == s.custody => CustodyAuthorized /\ s.head=2
QuerySound == s.queryResult="committed" => "interpret:E1:1" \in s.answers
NoStaleWitness == ~(s.isolated /\ 1 \in s.preparedAtGap /\ 1 \in s.oldAttemptBlocked)
NoBothStaleWitness == ~(s.preparedAtGap=Workers /\ s.oldAttemptBlocked=Workers)
NoNewActorWitness == ~(1 \in s.oldAttemptBlocked /\ 2 \in s.newNormalBlocked /\ s.newCommandBlocked)
NoCustodyWitness == ~(1 \in s.oldAttemptBlocked /\ s.custodyAfterGap /\ s.inspection)
NoPriorCommitWitness == ~(s.isolated /\ s.cursor=1 /\ s.querySeen /\ s.queryResult="committed")
Spec == Init /\ [][Next]_vars
=============================================================================
