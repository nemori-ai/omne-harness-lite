------------------------ MODULE CompactionProtocol ------------------------
(* Scope: one tenant, preparation and logical task key. Caller crashes do not
   erase provider durable state. active/Revoke represent advancement eligibility,
   not reconciliation access. Read/save/ACK permission is an environment premise.
   FairSpec assumes authorized reconciliation, eventual dependency availability,
   recoverable storage and eventual completion/recognition of internal execution.
   Safety checking uses bounded sends, reads and caller crashes. It does not
   establish implementation conformance, provider crash durability or performance. *)
EXTENDS Naturals, Sequences, TLC
CONSTANT Bug, MaxSends, MaxReads, MaxCrashes
VARIABLE s
vars == <<s>>

Init == s = [intent |-> FALSE, allowance |-> FALSE,
  sends |-> 0, deliveries |-> 0, tasks |-> 0,
  phase |-> "absent", outcome |-> "none", started |-> 0,
  uncertain |-> FALSE, unknowns |-> 0, physical |-> "settled",
  body |-> FALSE, reads |-> 0, seen |-> FALSE, saved |-> FALSE,
  disposition |-> "none", ack |-> FALSE, log |-> <<"original">>,
  commits |-> 0, reply |-> "none", active |-> TRUE,
  live |-> TRUE, crashes |-> 0, badAdoption |-> FALSE]

SaveIntent == /\ s.live /\ s.active /\ ~s.intent
  /\ s' = [s EXCEPT !.intent = TRUE, !.allowance = TRUE]

Send == /\ s.live /\ s.intent /\ s.sends < MaxSends
  /\ s' = [s EXCEPT !.sends = @ + 1]

DeliverAdmit == /\ s.deliveries < s.sends
  /\ s' = [s EXCEPT !.deliveries = @ + 1,
      !.tasks = IF s.phase = "absent" \/
        (Bug = "duplicate-admit" /\ s.phase = "pending") THEN @ + 1 ELSE @,
      !.phase = IF @ = "absent" THEN "pending" ELSE @]

StartExecution == /\ s.phase = "pending" /\ s.started = 0
  /\ s' = [s EXCEPT !.started = @ + 1, !.physical = "pending"]

LoseExternalAnswer == /\ s.phase = "pending" /\ s.started > 0
  /\ ~s.uncertain /\ s.unknowns = 0
  /\ s' = [s EXCEPT !.uncertain = TRUE, !.unknowns = 1,
                    !.physical = "unknown"]

RecallExternal == /\ s.phase = "pending" /\ s.uncertain
  /\ s' = [s EXCEPT !.uncertain = FALSE, !.physical = "pending",
             !.started = IF Bug = "retry-unknown" THEN @ + 1 ELSE @]

Produce == /\ s.phase = "pending" /\ s.started > 0 /\ ~s.uncertain
  /\ \E result \in {"completed", "cannot-fit", "failed"} :
      s' = [s EXCEPT !.phase = "terminal", !.outcome = result,
                    !.body = TRUE, !.physical = "settled"]

Revoke == /\ s.active
  /\ s' = [s EXCEPT !.active = FALSE]

CancelProvider == /\ ~s.active /\ s.intent /\ s.phase # "terminal"
  /\ s' = [s EXCEPT !.phase = "terminal", !.outcome = "cancelled",
                    !.body = TRUE]

SettlePhysical == /\ s.phase = "terminal" /\ s.physical # "settled"
  /\ s' = [s EXCEPT !.physical = "settled"]

Observe == /\ s.live /\ s.phase = "terminal" /\ s.body
  /\ ~s.seen /\ s.reads < MaxReads
  /\ s' = [s EXCEPT !.reads = @ + 1, !.seen = TRUE]

SaveReceived == /\ s.live /\ s.seen /\ ~s.saved
  /\ s' = [s EXCEPT !.saved = TRUE]

Dispose == /\ s.live /\ (s.seen \/ s.saved) /\ s.disposition = "none"
  /\ (~s.active \/ s.outcome # "completed")
  /\ s' = [s EXCEPT !.disposition = IF ~s.active THEN "excluded" ELSE "failed"]

CommitDerived == /\ s.live /\ s.saved /\ s.outcome = "completed"
  /\ s.disposition = "none" /\ s.commits < 2
  /\ (s.active \/ Bug = "ignore-revocation")
  /\ \E response \in {"known", "unknown"} :
      s' = [s EXCEPT !.commits = @ + 1,
         !.log = Append(@, "compaction"), !.reply = response,
         !.badAdoption = @ \/ ~s.active,
         !.disposition = IF Bug = "split-commit" THEN @ ELSE "adopted"]

RecallCommit == /\ s.live /\ s.reply = "unknown"
  /\ s' = [s EXCEPT !.reply = "known"]

Processed == s.disposition \in {"adopted", "excluded", "failed"}
Ack == /\ s.live /\ s.phase = "terminal" /\ ~s.ack
  /\ (s.saved \/ Processed \/ (Bug = "early-ack" /\ s.seen))
  /\ s' = [s EXCEPT !.ack = TRUE]

Release == /\ s.ack /\ s.body
  /\ s' = [s EXCEPT !.body = FALSE]

Crash == /\ s.live /\ s.crashes < MaxCrashes
  /\ s' = [s EXCEPT !.live = FALSE, !.seen = FALSE, !.crashes = @ + 1]

Recover == /\ ~s.live
  /\ s' = [s EXCEPT !.live = TRUE,
     !.allowance = IF Bug = "reset-allowance" /\ s.reply = "unknown"
                  THEN FALSE ELSE @]

Next == SaveIntent \/ Send \/ DeliverAdmit \/ StartExecution \/
  LoseExternalAnswer \/ RecallExternal \/ Produce \/ Revoke \/ CancelProvider \/
  SettlePhysical \/ Observe \/ SaveReceived \/ Dispose \/ CommitDerived \/
  RecallCommit \/ Ack \/ Release \/ Crash \/ Recover

Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ WF_vars(SaveIntent) /\ WF_vars(Send) /\
  WF_vars(DeliverAdmit) /\ WF_vars(StartExecution) /\ WF_vars(RecallExternal) /\
  WF_vars(Produce) /\ WF_vars(CancelProvider) /\ WF_vars(Observe) /\
  WF_vars(SaveReceived) /\ WF_vars(Dispose) /\ WF_vars(CommitDerived) /\
  WF_vars(RecallCommit) /\ WF_vars(Ack) /\ WF_vars(Release) /\ WF_vars(Recover)

TypeOK == /\ s.phase \in {"absent", "pending", "terminal"}
  /\ s.outcome \in {"none", "completed", "cannot-fit", "failed", "cancelled"}
  /\ s.disposition \in {"none", "adopted", "excluded", "failed"}
  /\ s.physical \in {"pending", "settled", "unknown"}
  /\ s.tasks \in 0..MaxSends /\ s.started \in 0..2
  /\ s.sends \in 0..MaxSends /\ s.deliveries \in 0..s.sends
  /\ s.reads \in 0..MaxReads /\ s.crashes \in 0..MaxCrashes
  /\ s.commits \in 0..2
OneLogicalTask == s.tasks <= 1
NoUnknownRedispatch == s.started <= 1
IntentBeforeExecution == s.tasks > 0 => s.intent
CustodyBeforeRelease == (s.ack \/ (s.phase = "terminal" /\ ~s.body)) =>
  (s.saved \/ Processed)
NoAdoptionAfterRevocation == ~s.badAdoption
OneCompaction == s.commits <= 1
AtomicAdoption == (s.commits = 1) <=> (s.disposition = "adopted")
AppendOnly == /\ Head(s.log) = "original" /\ Len(s.log) = 1 + s.commits
AllowanceSurvives == s.intent => s.allowance
EventuallyAccounted == s.intent ~> (Processed /\ s.ack)
(* Reachability witnesses: these deliberately fail to rule out vacuity. *)
NoCompletedAdoption == s.disposition # "adopted"
NoRecoveredAdoption == ~(s.crashes > 0 /\ s.disposition = "adopted" /\ s.reply = "known")
=============================================================================
