-------------------- MODULE SettingsReservationCustody --------------------
EXTENDS Integers, FiniteSets, TLC
CONSTANT Bad
VARIABLE x
vars == <<x>>
Requests == {"a", "b"}
Init == x = [request |-> "none", original |-> "none", phase |-> "absent",
  external |-> [r \in Requests |-> "absent"], terminal |-> "none",
  issued |-> {}, replies |-> {}, lostPlan |-> FALSE, changed |-> FALSE,
  misbound |-> FALSE, revived |-> FALSE, earlyRelease |-> FALSE]
Plan(r) ==
  /\ r \in Requests
  /\ x.phase = "absent" \/ Bad = "replace-request"
  /\ x' = [x EXCEPT !.request = r,
      !.original = IF @ = "none" THEN r ELSE @,
      !.phase = IF @ = "absent" THEN "planned" ELSE @,
      !.changed = @ \/ (x.original # "none" /\ r # x.original)]
Start ==
  /\ x.phase = "planned"
  /\ x' = [x EXCEPT !.phase = "requested"]
Reserve(r) ==
  /\ r \in Requests /\ x.external[r] = "absent"
  /\ (x.phase = "requested" /\ x.request = r) \/ Bad = "reserve-before-request"
  /\ x' = [x EXCEPT !.external[r] = "held", !.issued = @ \cup {r},
       !.replies = @ \cup {r}, !.lostPlan = @ \/ x.phase # "requested" \/ x.request # r]
Retry ==
  /\ x.request \in Requests /\ x.phase \in {"requested", "held"}
  /\ x.external[x.request] = "held"
  /\ x' = [x EXCEPT !.replies = @ \cup {x.request}]
ReceiveHeld(r) ==
  /\ r \in Requests /\ r \in x.replies
  /\ r = x.request \/ Bad = "misbound-receipt"
  /\ x' = [x EXCEPT
      !.phase = IF x.phase = "settled" /\ Bad # "late-held-revives" THEN @ ELSE "held",
      !.misbound = @ \/ r # x.request,
      !.revived = @ \/ (x.phase = "settled" /\ Bad = "late-held-revives")]
ForeignReply ==
  /\ x.request \in Requests /\ Bad = "misbound-receipt"
  /\ x' = [x EXCEPT !.replies = @ \cup (Requests \ {x.request})]
FinishDestination(outcome) ==
  /\ outcome \in {"committed", "aborted"} /\ x.terminal = "none"
  /\ x' = [x EXCEPT !.terminal = outcome]
Settle(r) ==
  /\ r \in Requests /\ x.external[r] = "held"
  /\ x.terminal # "none" \/ Bad = "release-before-terminal"
  /\ x' = [x EXCEPT !.external[r] = "settled",
      !.earlyRelease = @ \/ x.terminal = "none"]
ReceiveSettled ==
  /\ x.request \in Requests /\ x.external[x.request] = "settled"
  /\ x' = [x EXCEPT !.phase = "settled"]
LoseReply ==
  /\ x.replies # {}
  /\ x' = [x EXCEPT !.replies = {}]
Next == (\E r \in Requests: Plan(r) \/ Reserve(r) \/ ReceiveHeld(r) \/ Settle(r)) \/
  (\E outcome \in {"committed", "aborted"}: FinishDestination(outcome)) \/
  Start \/ Retry \/ ForeignReply \/ ReceiveSettled \/ LoseReply \/ UNCHANGED x
Spec == Init /\ [][Next]_vars
RequestDurableBeforeCall == ~x.lostPlan
ImmutableReservationRequest == ~x.changed
ReceiptBindsOriginalRequest == ~x.misbound
SettledCannotBecomeHeld == ~x.revived
TerminalBeforeRelease == ~x.earlyRelease
OneReservationIdentity == Cardinality(x.issued) <= 1
=============================================================================
