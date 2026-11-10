-------------------- MODULE SettingsPreparationBootstrap --------------------
EXTENDS Integers, TLC
CONSTANT Bad
VARIABLE x
vars == <<x>>
Owners == {"identity", "source"}
Live == x.phase \in {"preparing", "prepared", "submitted"}
Terminal == x.phase \in {"committed", "aborted"}
AllHeld == \A owner \in Owners: x.reservations[owner] = "held"
Init == x = [saved |-> FALSE, phase |-> "absent",
  reservations |-> [owner \in Owners |-> "absent"],
  running |-> TRUE, crashed |-> FALSE, basis |-> 0, preparedBasis |-> -1,
  replied |-> FALSE, badReply |-> FALSE, orphan |-> FALSE,
  earlyRelease |-> FALSE, revived |-> FALSE, unsafeEffect |-> FALSE,
  effects |-> 0]
Allocate ==
  /\ x.running /\ x.phase = "absent"
  /\ x' = [x EXCEPT !.saved = TRUE, !.phase = "preparing"]
StartReserve(owner) ==
  /\ owner \in Owners /\ x.running /\ x.reservations[owner] = "absent"
  /\ x.phase = "preparing" \/ Bad = "reserve-before-save"
  /\ x' = [x EXCEPT !.reservations[owner] = "inflight",
        !.orphan = @ \/ ~x.saved]
FinishReserve(owner) ==
  /\ owner \in Owners /\ x.reservations[owner] = "inflight"
  /\ x' = [x EXCEPT !.reservations[owner] = "held"]
Publish ==
  /\ x.running
  /\ x.phase = "preparing" \/ (Terminal /\ Bad = "late-publish")
  /\ AllHeld \/ Bad = "publish-without-holds"
  /\ x' = [x EXCEPT !.phase = "prepared", !.preparedBasis = x.basis,
        !.revived = @ \/ Terminal]
Reply ==
  /\ x.running /\ ~x.replied
  /\ x.phase = "prepared" \/ (x.phase = "preparing" /\ Bad = "reply-before-ready")
  /\ x' = [x EXCEPT !.replied = TRUE,
        !.badReply = @ \/ x.phase # "prepared" \/ ~AllHeld]
Submit ==
  /\ x.running /\ x.phase = "prepared"
  /\ x' = [x EXCEPT !.phase = "submitted"]
Commit ==
  /\ x.running
  /\ x.phase \in {"prepared", "submitted"} \/ (x.phase = "preparing" /\ Bad = "commit-before-ready")
  /\ x.preparedBasis = x.basis \/ Bad = "commit-before-ready"
  /\ x' = [x EXCEPT !.phase = "committed", !.effects = @ + 1,
        !.unsafeEffect = @ \/ ~AllHeld \/ x.phase = "preparing" \/ x.preparedBasis # x.basis]
Seal ==
  /\ Live
  /\ x' = [x EXCEPT !.phase = "aborted"]
Release(owner) ==
  /\ owner \in Owners /\ x.reservations[owner] = "held"
  /\ Terminal \/ Bad = "early-release"
  /\ x' = [x EXCEPT !.reservations[owner] = "released",
        !.earlyRelease = @ \/ ~Terminal]
Crash ==
  /\ x.running /\ ~x.crashed
  /\ x' = [x EXCEPT !.running = FALSE, !.crashed = TRUE,
        !.saved = IF Bad = "lose-attempt" THEN FALSE ELSE @]
Restart ==
  /\ ~x.running
  /\ x' = [x EXCEPT !.running = TRUE]
Recover ==
  /\ x.running /\ x.saved /\ Live
  /\ x' = [x EXCEPT !.phase = "aborted"]
RefreshBasis ==
  /\ x.basis = 0
  /\ x' = [x EXCEPT !.basis = 1]
Next == Allocate \/ Publish \/ Reply \/ Submit \/ Commit \/ Seal \/ Crash \/ Restart \/
        Recover \/ RefreshBasis \/ (\E owner \in Owners:
          StartReserve(owner) \/ FinishReserve(owner) \/ Release(owner)) \/ UNCHANGED x
Spec == Init /\ [][Next]_vars
DurableRouteBeforeReservation == ~x.orphan
AttemptSurvivesRestart == x.phase # "absent" => x.saved
PreparedHasAllHolds == x.phase \in {"prepared", "submitted"} => AllHeld
ReplyRequiresReadyAttempt == ~x.badReply
TerminalBeforeRelease == ~x.earlyRelease
TerminalCannotPublishAgain == ~x.revived
OnlyReadyAttemptCommits == ~x.unsafeEffect
OneBusinessEffect == x.effects <= 1
=============================================================================
