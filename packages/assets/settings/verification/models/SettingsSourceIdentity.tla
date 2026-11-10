-------------------- MODULE SettingsSourceIdentity --------------------
EXTENDS Integers, Sequences, TLC
CONSTANT Bad
VARIABLE x
vars == <<x>>
A == [id |-> "same", owner |-> "original", scope |-> "owner", subject |-> "one"]
B == [id |-> "second", owner |-> "original", scope |-> "owner", subject |-> "one"]
Initial == <<A,B>>
Layouts == {Initial, <<B,A>>,
  <<[A EXCEPT !.owner = "other"],B>>,
  <<[A EXCEPT !.subject = "other"],B>>,
  <<[A EXCEPT !.scope = "tenant"],B>>}
SameSources(a,b) == \A i \in 1..Len(a): \E j \in 1..Len(b): a[i] = b[j]
Known == x.known \/ Bad = "legacy-reuse"
SameLayout == x.stored = x.current
PreparedCurrent ==
  (x.preparedAuthority = x.authority \/ Bad = "ignore-authority") /\
  x.preparedLayout = x.current /\
  (x.preparedRevision = x.revision \/ Bad = "ignore-value-revision")
Init == \E known, hasValue \in BOOLEAN:
  x = [current |-> Initial, stored |-> Initial, known |-> known, hasValue |-> hasValue,
    authority |-> 0, revision |-> 0, changed |-> FALSE, refreshed |-> FALSE,
    prepared |-> FALSE, preparedLayout |-> Initial, preparedAuthority |-> 0,
    preparedRevision |-> 0, written |-> FALSE, rebased |-> FALSE,
    badRead |-> FALSE, badWrite |-> FALSE, badRetain |-> FALSE,
    unknownReuse |-> FALSE, stale |-> FALSE, hiddenRebind |-> FALSE]
ChangeLayout(layout) ==
  /\ ~x.changed /\ layout \in Layouts /\ layout # x.current
  /\ x' = [x EXCEPT !.current = layout, !.authority = @ + 1, !.changed = TRUE]
RefreshAuthority ==
  /\ ~x.refreshed
  /\ x' = [x EXCEPT !.authority = @ + 1, !.refreshed = TRUE]
Read ==
  /\ Known /\ (SameLayout \/ Bad = "read-by-id")
  /\ x' = [x EXCEPT !.badRead = @ \/ ~SameLayout,
       !.unknownReuse = @ \/ ~x.known]
Prepare ==
  /\ ~x.prepared
  /\ x' = [x EXCEPT !.prepared = TRUE, !.preparedLayout = x.current,
       !.preparedAuthority = x.authority, !.preparedRevision = x.revision]
Write ==
  /\ x.prepared /\ ~x.written /\ Known
  /\ (SameLayout \/ Bad = "write-by-id") /\ PreparedCurrent
  /\ x' = [x EXCEPT !.written = TRUE, !.hasValue = TRUE, !.revision = @ + 1,
       !.badWrite = @ \/ ~SameLayout, !.unknownReuse = @ \/ ~x.known,
       !.stale = @ \/ x.preparedAuthority # x.authority \/
          x.preparedLayout # x.current \/ x.preparedRevision # x.revision]
Rebase(retain) ==
  LET same == x.known /\ SameSources(x.stored,x.current)
      changed == ~x.known \/ x.stored # x.current \/ (~retain /\ x.hasValue)
      bump == changed /\ Bad # "no-revision-bump"
  IN /\ ~x.rebased
     /\ (~retain \/ same \/ Bad = "retain-by-id")
     /\ x' = [x EXCEPT !.rebased = TRUE, !.known = TRUE, !.stored = x.current,
          !.hasValue = retain /\ @, !.revision = @ + IF bump THEN 1 ELSE 0,
          !.badRetain = @ \/ (retain /\ x.hasValue /\ ~same),
          !.hiddenRebind = @ \/ (changed /\ ~bump)]
Next == (\E layout \in Layouts: ChangeLayout(layout)) \/ RefreshAuthority \/ Read \/
        Prepare \/ Write \/ (\E retain \in BOOLEAN: Rebase(retain)) \/ UNCHANGED x
Spec == Init /\ [][Next]_vars
ReadUsesSameIdentity == ~x.badRead
WriteUsesSameIdentity == ~x.badWrite
RetainUsesSameIdentity == ~x.badRetain
UnknownIdentityIsNotAuthority == ~x.unknownReuse
CommitUsesCurrentBasis == ~x.stale
RebindingChangesRevision == ~x.hiddenRebind
=============================================================================
