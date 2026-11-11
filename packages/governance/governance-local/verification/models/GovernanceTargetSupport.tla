----------------------- MODULE GovernanceTargetSupport -----------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANT Bad
Leases == {"left", "right"}
Targets == {"a", "b"}
VARIABLES active, support, selected, revision, planned, plannedRevision,
          prepared, published, acceptedCurrent
vars == <<active, support, selected, revision, planned, plannedRevision,
          prepared, published, acceptedCurrent>>
Range(edges) == {t \in Targets: \E l \in Leases: <<l, t>> \in edges}
Init == /\ active = Leases /\ support = {} /\ selected = {}
        /\ revision = 0 /\ planned = {} /\ plannedRevision = 0
        /\ prepared = FALSE /\ published = FALSE /\ acceptedCurrent = TRUE
Prepare(edges) == /\ ~prepared /\ edges \subseteq (active \X Targets)
                  /\ planned' = edges /\ plannedRevision' = revision
                  /\ prepared' = TRUE
                  /\ UNCHANGED <<active, support, selected, revision,
                                  published, acceptedCurrent>>
Publish == /\ prepared /\ ~published
           /\ (plannedRevision = revision \/ Bad = "stale")
           /\ support' = planned /\ selected' = Range(planned)
           /\ published' = TRUE
           /\ acceptedCurrent' = (plannedRevision = revision)
           /\ UNCHANGED <<active, revision, planned, plannedRevision, prepared>>
Withdraw(l) ==
  LET remaining == {e \in support: e[1] # l}
  IN /\ l \in active
     /\ active' = active \ {l}
     /\ support' = remaining
     /\ selected' = IF Bad = "retain" /\ remaining # {} THEN selected
                     ELSE IF Bad = "drop" THEN {} ELSE Range(remaining)
     /\ revision' = revision + 1
     /\ UNCHANGED <<planned, plannedRevision, prepared, published, acceptedCurrent>>
Next == (\E edges \in SUBSET (Leases \X Targets): Prepare(edges))
        \/ Publish \/ (\E l \in Leases: Withdraw(l))
        \/ UNCHANGED vars
NoUnsupportedTarget == selected \subseteq Range(support)
AllSupportedTargetsVisible == Range(support) \subseteq selected
MembersCurrent == support \subseteq (active \X Targets)
PublicationCurrent == acceptedCurrent
Spec == Init /\ [][Next]_vars
=============================================================================
