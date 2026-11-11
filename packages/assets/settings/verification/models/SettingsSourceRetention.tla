-------------------- MODULE SettingsSourceRetention --------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANT Bad
Destinations == {1, 2}
Updates == {1, 2}
VARIABLE x
vars == <<x>>
Init == x = [revision |-> 0, gate |-> 0, held |-> {}, issued |-> {},
  basis |-> [d \in Destinations |-> 0],
  terminal |-> [d \in Destinations |-> "open"],
  roots |-> [u \in Updates |-> "absent"],
  sealedUpdates |-> {}, sealedDestinations |-> {},
  admin |-> TRUE, conditions |-> TRUE, up |-> TRUE, crashed |-> FALSE,
  staleCommit |-> FALSE, unprovedRelease |-> FALSE, admissionLeak |-> FALSE,
  lostNewGate |-> FALSE, unauthorizedWrite |-> FALSE, invalidWrite |-> FALSE]

Reserve(d) ==
  /\ x.up /\ d \notin x.issued
  /\ x.gate = 0 \/ Bad = "admit-during-drain"
  /\ x' = [x EXCEPT !.issued = @ \cup {d}, !.held = @ \cup {d},
       !.basis[d] = x.revision, !.admissionLeak = @ \/ x.gate # 0]

CommitDestination(d) ==
  /\ x.up /\ d \in x.issued
  /\ x.terminal[d] = "open" \/
      (Bad = "ignore-destination-seal" /\ x.terminal[d] = "aborted")
  /\ x' = [x EXCEPT !.terminal[d] = "committed",
       !.staleCommit = @ \/ d \notin x.held \/ x.basis[d] # x.revision]

SealDestination(d) ==
  /\ x.up /\ d \in x.held /\ x.terminal[d] = "open"
  /\ x' = [x EXCEPT !.terminal[d] = "aborted",
       !.sealedDestinations = @ \cup {d}]

Settle(d) ==
  /\ x.up /\ d \in x.held
  /\ x.terminal[d] # "open" \/ Bad = "release-without-terminal"
  /\ x' = [x EXCEPT !.held = @ \ {d},
       !.unprovedRelease = @ \/ x.terminal[d] = "open"]

Begin(u) ==
  /\ x.up /\ x.admin /\ x.gate = 0 /\ x.roots[u] = "absent"
  /\ x' = [x EXCEPT !.roots[u] = "pending", !.gate = u]

Apply(u) ==
  /\ x.up /\ x.gate = u /\ x.roots[u] = "pending"
  /\ x.held = {} \/ Bad = "ignore-source-holds"
  /\ x.admin \/ Bad = "ignore-admin"
  /\ x.conditions \/ Bad = "ignore-write-conditions"
  /\ Bad # "scan-held-only" \/ x.held # {}
  /\ x' = [x EXCEPT !.roots[u] = "committed", !.gate = 0,
       !.revision = @ + 1, !.unauthorizedWrite = @ \/ ~x.admin,
       !.invalidWrite = @ \/ ~x.conditions]

Reject(u) ==
  /\ x.up /\ x.gate = u /\ x.roots[u] = "pending" /\ (~x.admin \/ ~x.conditions)
  /\ Bad # "scan-held-only" \/ x.held # {}
  /\ x' = [x EXCEPT !.roots[u] = "aborted", !.gate = 0,
       !.sealedUpdates = @ \cup {u}]

SealUpdate(u) ==
  /\ x.up /\ x.gate = u /\ x.roots[u] = "pending"
  /\ x' = [x EXCEPT !.roots[u] = "aborted", !.sealedUpdates = @ \cup {u},
       !.gate = IF Bad = "leave-pending-gate" THEN @ ELSE 0]

LateCleanup(u) ==
  /\ x.up /\ x.roots[u] = "aborted" /\ x.gate # 0 /\ x.gate # u
  /\ Bad = "inexact-clear"
  /\ x' = [x EXCEPT !.gate = 0, !.lostNewGate = TRUE]

Revoke == /\ x.admin /\ x' = [x EXCEPT !.admin = FALSE]
InvalidateConditions == /\ x.conditions /\ x' = [x EXCEPT !.conditions = FALSE]
Crash == /\ x.up /\ ~x.crashed
         /\ x' = [x EXCEPT !.up = FALSE, !.crashed = TRUE]
Restart == /\ ~x.up /\ x' = [x EXCEPT !.up = TRUE]
Resolve(u) == Apply(u) \/ Reject(u)
Next == (\E d \in Destinations : Reserve(d) \/ CommitDestination(d)
                  \/ SealDestination(d) \/ Settle(d))
     \/ (\E u \in Updates : Begin(u) \/ Resolve(u) \/ SealUpdate(u) \/ LateCleanup(u))
     \/ Revoke \/ InvalidateConditions \/ Crash \/ Restart \/ UNCHANGED vars
Spec == Init /\ [][Next]_vars /\ WF_vars(Restart)
        /\ (\A d \in Destinations : WF_vars(SealDestination(d)) /\ WF_vars(Settle(d)))
        /\ (\A u \in Updates : WF_vars(Resolve(u)))

TypeOK == /\ x.revision \in 0..2 /\ x.gate \in {0,1,2}
          /\ x.held \subseteq x.issued /\ x.issued \subseteq Destinations
          /\ x.roots \in [Updates -> {"absent","pending","committed","aborted"}]
          /\ x.terminal \in [Destinations -> {"open","committed","aborted"}]
CurrentAtDestinationCommit == ~x.staleCommit
SourceHoldsProtectRevision == \A d \in x.held : x.basis[d] = x.revision
TerminalBeforeRelease == ~x.unprovedRelease
NoNewReservationsDuringDrain == ~x.admissionLeak
SealedDestinationCannotCommit == \A d \in x.sealedDestinations : x.terminal[d] = "aborted"
SealedRootCannotCommit == \A u \in x.sealedUpdates : x.roots[u] = "aborted"
GateHasPendingOwner == x.gate # 0 => x.roots[x.gate] = "pending"
PendingHasGate == \A u \in Updates : x.roots[u] = "pending" => x.gate = u
ExactGateRelease == ~x.lostNewGate
CurrentManagementAuthority == ~x.unauthorizedWrite
CurrentWriteConditions == ~x.invalidWrite
PendingProgress == \A u \in Updates : [](x.roots[u] = "pending" => <>(x.roots[u] # "pending"))
=============================================================================
