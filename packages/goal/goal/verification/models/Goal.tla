---------------------------- MODULE Goal ----------------------------
(* One session's goal: the person's or creator's commands, the judge's   *)
(* observations, the continuation protocol and the run that carries it.  *)
(* The judge's verdict is taken from the truth at the moment it starts:  *)
(* this model is about races and replays, not about judging quality.     *)
EXTENDS Naturals, FiniteSets

CONSTANTS Attended, MaxGen, MaxRev, Budget, Faults

VARIABLES state, gen, rev, round, pauseBy, outcome,
          holds, runAlive, runDied,
          obs, lastObs, reserved, accepted, card,
          settles, continues, cause, badPass, wrongAchieve, staleCard

vars == << state, gen, rev, round, pauseBy, outcome, holds, runAlive, runDied,
           obs, lastObs, reserved, accepted, card,
           settles, continues, cause, badPass, wrongAchieve, staleCard >>

None == [k |-> "none"]
Keys == (1..MaxGen) \X (0..MaxRev) \X (0..(Budget + 1))
Live == state \in {"active", "paused"}
Bump(n) == IF n < 2 THEN n + 1 ELSE 2
Fault(f) == f \in Faults

Init ==
  /\ state = "none" /\ gen = 0 /\ rev = 0 /\ round = 0
  /\ pauseBy = "none" /\ outcome = "none"
  /\ holds = FALSE /\ runAlive = FALSE /\ runDied = FALSE
  /\ obs = None /\ lastObs = None /\ card = None
  /\ reserved = {} /\ accepted = [k \in Keys |-> 0]
  /\ settles = [g \in 1..MaxGen |-> 0] /\ continues = [k \in Keys |-> 0]
  /\ cause = "init" /\ badPass = FALSE /\ wrongAchieve = FALSE /\ staleCard = FALSE

(* ---- writes of the goal store ---- *)
SetGoal(c) ==
  /\ gen < MaxGen
  /\ gen' = gen + 1 /\ rev' = 0 /\ round' = 0
  /\ state' = "active" /\ pauseBy' = "none" /\ outcome' = "none"
  /\ holds' = FALSE /\ cause' = c
  /\ UNCHANGED << settles >>

Settle(o, c) ==
  /\ state' = "settled" /\ outcome' = o /\ pauseBy' = "none" /\ cause' = c
  /\ settles' = [settles EXCEPT ![gen] = Bump(@)]
  /\ UNCHANGED << gen, rev, round, holds >>

(* ---- the person (attended sessions only) ---- *)
AgentPropose ==
  /\ Attended
  /\ card' = [k |-> "card", g |-> gen, r |-> rev, live |-> Live]
  /\ UNCHANGED << state, gen, rev, round, pauseBy, outcome, holds, runAlive, runDied,
                  obs, lastObs, reserved, accepted, settles, continues, cause,
                  badPass, wrongAchieve, staleCard >>

CardCurrent == card.g = gen /\ card.r = rev /\ card.live = Live

PersonConfirm ==
  /\ Attended /\ card # None
  /\ CardCurrent \/ Fault("no-base-check")
  /\ staleCard' = (staleCard \/ ~CardCurrent)
  /\ IF Live
       THEN /\ rev < MaxRev
            /\ rev' = rev + 1 /\ state' = "active" /\ pauseBy' = "none" /\ cause' = "person"
            /\ UNCHANGED << gen, round, outcome, holds, settles >>
       ELSE SetGoal("person")
  /\ UNCHANGED << runAlive, runDied, obs, lastObs, reserved, accepted, card,
                  continues, badPass, wrongAchieve >>

PersonEdit ==
  /\ Attended /\ Live /\ rev < MaxRev
  /\ rev' = rev + 1 /\ cause' = "person"
  /\ UNCHANGED << state, gen, round, pauseBy, outcome, holds, runAlive, runDied,
                  obs, lastObs, reserved, accepted, card, settles, continues,
                  badPass, wrongAchieve, staleCard >>

PersonPause ==
  /\ Attended /\ state = "active"
  /\ state' = "paused" /\ pauseBy' = "person" /\ cause' = "person"
  /\ UNCHANGED << gen, rev, round, outcome, holds, runAlive, runDied, obs, lastObs,
                  reserved, accepted, card, settles, continues, badPass, wrongAchieve, staleCard >>

PersonResume ==
  /\ Attended /\ state = "paused"
  /\ state' = "active" /\ pauseBy' = "none" /\ cause' = "person"
  /\ UNCHANGED << gen, rev, round, outcome, holds, runAlive, runDied, obs, lastObs,
                  reserved, accepted, card, settles, continues, badPass, wrongAchieve, staleCard >>

PersonCancel ==
  /\ Attended
  /\ Live \/ (Fault("resettle") /\ state = "settled")
  /\ Settle("cancelled", "person")
  /\ UNCHANGED << runAlive, runDied, obs, lastObs, reserved, accepted, card,
                  continues, badPass, wrongAchieve, staleCard >>

PersonSettleByExit ==
  /\ Attended /\ state = "paused" /\ pauseBy = "judge"
  /\ Settle("exit", "person")
  /\ UNCHANGED << runAlive, runDied, obs, lastObs, reserved, accepted, card,
                  continues, badPass, wrongAchieve, staleCard >>

AgentPause ==   \* only as an injected fault: the agent has no such command
  /\ Fault("agent-pause") /\ state = "active"
  /\ state' = "paused" /\ pauseBy' = "person" /\ cause' = "agent"
  /\ UNCHANGED << gen, rev, round, outcome, holds, runAlive, runDied, obs, lastObs,
                  reserved, accepted, card, settles, continues, badPass, wrongAchieve, staleCard >>

(* ---- the creator of an unattended session ---- *)
CreatorSet ==
  /\ ~Attended /\ ~Live
  /\ SetGoal("creator")
  /\ UNCHANGED << runAlive, runDied, obs, lastObs, reserved, accepted, card,
                  continues, badPass, wrongAchieve, staleCard >>

CreatorCancel ==
  /\ ~Attended /\ Live
  /\ Settle("cancelled", "creator")
  /\ UNCHANGED << runAlive, runDied, obs, lastObs, reserved, accepted, card,
                  continues, badPass, wrongAchieve, staleCard >>

Abort ==
  /\ ~Attended /\ state = "active" /\ runDied
  /\ Settle("aborted", "creator")
  /\ UNCHANGED << runAlive, runDied, obs, lastObs, reserved, accepted, card,
                  continues, badPass, wrongAchieve, staleCard >>

(* ---- the run ---- *)
Wake ==
  /\ ~runAlive
  /\ Attended \/ (state = "active" /\ ~runDied)
  /\ runAlive' = TRUE /\ runDied' = FALSE
  /\ UNCHANGED << state, gen, rev, round, pauseBy, outcome, holds, obs, lastObs,
                  reserved, accepted, card, settles, continues, cause,
                  badPass, wrongAchieve, staleCard >>

Work ==
  /\ runAlive /\ state = "active"
  /\ holds' \in BOOLEAN
  /\ UNCHANGED << state, gen, rev, round, pauseBy, outcome, runAlive, runDied, obs, lastObs,
                  reserved, accepted, card, settles, continues, cause,
                  badPass, wrongAchieve, staleCard >>

RunDie ==
  /\ runAlive
  /\ runAlive' = FALSE /\ runDied' = TRUE /\ obs' = None
  /\ UNCHANGED << state, gen, rev, round, pauseBy, outcome, holds, lastObs,
                  reserved, accepted, card, settles, continues, cause,
                  badPass, wrongAchieve, staleCard >>

Verdicts ==
  IF holds THEN {"achieved"}
  ELSE IF round >= Budget /\ ~Fault("no-budget") THEN {"budget"}
  ELSE {"continue", "stop"}

StartObserve ==
  /\ runAlive /\ obs = None /\ state = "active"
  /\ \E v \in Verdicts : obs' = [k |-> "obs", g |-> gen, r |-> rev, n |-> round, v |-> v]
  /\ UNCHANGED << state, gen, rev, round, pauseBy, outcome, holds, runAlive, runDied, lastObs,
                  reserved, accepted, card, settles, continues, cause,
                  badPass, wrongAchieve, staleCard >>

PassIdle ==   \* a completion candidate while no goal is in progress
  /\ runAlive /\ obs = None /\ state # "active"
  /\ runAlive' = FALSE
  /\ UNCHANGED << state, gen, rev, round, pauseBy, outcome, holds, runDied, obs, lastObs,
                  reserved, accepted, card, settles, continues, cause,
                  badPass, wrongAchieve, staleCard >>

ObsCurrent ==
  /\ obs.g = gen
  /\ obs.r = rev \/ Fault("no-rev-check")
  /\ obs.n = round \/ Fault("no-round-check")

ApplyObs ==
  /\ runAlive /\ obs # None
  /\ IF state # "active"
       THEN /\ runAlive' = FALSE /\ obs' = None
            /\ UNCHANGED << state, gen, rev, round, pauseBy, outcome, holds, runDied, lastObs,
                            reserved, settles, continues, cause, badPass, wrongAchieve >>
       ELSE IF ~ObsCurrent
         THEN /\ obs' = None
              /\ runAlive' = (IF Fault("stale-pass") THEN FALSE ELSE runAlive)
              /\ badPass' = (badPass \/ Fault("stale-pass"))
              /\ UNCHANGED << state, gen, rev, round, pauseBy, outcome, holds, runDied, lastObs,
                              reserved, settles, continues, cause, wrongAchieve >>
         ELSE CASE obs.v = "achieved" ->
                     /\ Settle("achieved", "judge") /\ runAlive' = FALSE /\ obs' = None
                     /\ wrongAchieve' = (wrongAchieve \/ obs.r # rev)
                     /\ UNCHANGED << runDied, lastObs, reserved, continues, badPass >>
                [] obs.v = "budget" ->
                     /\ Settle("exit", "judge") /\ runAlive' = FALSE /\ obs' = None
                     /\ UNCHANGED << runDied, lastObs, reserved, continues, badPass, wrongAchieve >>
                [] obs.v = "stop" ->
                     /\ runAlive' = FALSE /\ obs' = None
                     /\ IF Attended \/ Fault("pause-unattended")
                          THEN /\ state' = "paused" /\ pauseBy' = "judge" /\ cause' = "judge"
                               /\ UNCHANGED << gen, rev, round, outcome, holds, settles >>
                          ELSE Settle("unattainable", "judge")
                     /\ UNCHANGED << runDied, lastObs, reserved, continues, badPass, wrongAchieve >>
                [] obs.v = "continue" ->
                     /\ round' = round + 1
                     /\ reserved' = reserved \cup { << gen, rev, round + 1 >> }
                     /\ continues' = [continues EXCEPT ![ << obs.g, obs.r, obs.n >> ] = Bump(@)]
                     /\ lastObs' = obs /\ obs' = None /\ cause' = "judge"
                     /\ UNCHANGED << state, gen, rev, pauseBy, outcome, holds, runAlive, runDied,
                                     settles, badPass, wrongAchieve >>
  /\ UNCHANGED << accepted, card, staleCard >>

Replay ==   \* the extension call is replayed after a crash
  /\ runAlive /\ obs = None /\ lastObs # None
  /\ obs' = lastObs
  /\ UNCHANGED << state, gen, rev, round, pauseBy, outcome, holds, runAlive, runDied, lastObs,
                  reserved, accepted, card, settles, continues, cause,
                  badPass, wrongAchieve, staleCard >>

Deliver ==  \* the session takes the continuation reminder; it may be handed over again
  /\ \E k \in reserved :
       /\ accepted[k] = 0 \/ Fault("no-dedup")
       /\ accepted' = [accepted EXCEPT ![k] = Bump(@)]
  /\ UNCHANGED << state, gen, rev, round, pauseBy, outcome, holds, runAlive, runDied,
                  obs, lastObs, reserved, card, settles, continues, cause,
                  badPass, wrongAchieve, staleCard >>

Finished ==   \* the last goal of this bounded model has ended and no run is alive
  /\ state = "settled" /\ gen = MaxGen /\ ~runAlive
  /\ UNCHANGED vars

Next ==
  \/ Finished
  \/ AgentPropose \/ PersonConfirm \/ PersonEdit \/ PersonPause \/ PersonResume
  \/ PersonCancel \/ PersonSettleByExit \/ AgentPause
  \/ CreatorSet \/ CreatorCancel \/ Abort
  \/ Wake \/ Work \/ RunDie \/ StartObserve \/ PassIdle \/ ApplyObs \/ Replay \/ Deliver

Spec == Init /\ [][Next]_vars

(* ---- what must always hold ---- *)
TypeOK ==
  /\ state \in {"none", "active", "paused", "settled"}
  /\ gen \in 0..MaxGen /\ rev \in 0..MaxRev /\ round \in 0..(Budget + 1)
  /\ pauseBy \in {"none", "person", "judge"}
  /\ outcome \in {"none", "achieved", "exit", "unattainable", "cancelled", "aborted"}
  /\ cause \in {"init", "person", "judge", "creator", "agent"}

SettledOnce      == \A g \in 1..MaxGen : settles[g] <= 1                    \* G2
OutcomeMatches   == (state = "settled") <=> (outcome # "none")              \* G2
AchievedIsFresh  == ~wrongAchieve                                           \* G3
NoSilentPass     == ~badPass                                                \* G5
CountedOnce      == \A k \in Keys : continues[k] <= 1 /\ accepted[k] <= 1   \* G6
RoundsBounded    == round <= Budget                                         \* G7
NoPauseUnattended == ~Attended => state # "paused"                          \* G8
PausedHasCause   == (state = "paused") <=> (pauseBy # "none")
NeverByAgent     == cause # "agent"                                         \* G9
CardIsCurrent    == ~staleCard                                              \* confirmation
=====================================================================
