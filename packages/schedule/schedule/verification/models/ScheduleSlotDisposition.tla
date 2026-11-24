---------------------- MODULE ScheduleSlotDisposition ----------------------
(* One schedule, its due slots, and the scanners that dispose of them.
   A slot ends as accepted (one Job), skipped, missed or rejected, once.
   Time only wakes a scanner; what is settled lives in durable state. *)
EXTENDS Naturals, FiniteSets
CONSTANTS MaxT, Slots, CatchUp, EligibleLimit, JobLimit, Overlap, Gap,
          Scanners, Controls, Rejects, Timers, Mutation

VARIABLES now, ctl, rev, heartbeat, span, watched, settled, disp, fixed,
          accepts, acceptCtl, eligible, jobs, open, round, prep,
          seen, lapsed, episodes, everStopped, wake
vars == <<now, ctl, rev, heartbeat, span, watched, settled, disp, fixed,
          accepts, acceptCtl, eligible, jobs, open, round, prep,
          seen, lapsed, episodes, everStopped, wake>>

NoPrep == [slot |-> 0, rev |-> 0]
Admitted == {"accepted", "skipped", "rejected"}
Final == Admitted \cup {"missed"}

(* A slot before this instant fell while nobody watched the schedule. *)
WatchedFrom == IF span > watched THEN span ELSE watched
Unclassified == {t \in Slots : settled < t /\ t < WatchedFrom /\ disp[t] = "none"}
Smallest(S, n) == {t \in S : Cardinality({u \in S : u < t}) < n}
Largest(S, n) == {t \in S : Cardinality({u \in S : u > t}) < n}
Room == IF EligibleLimit > eligible THEN EligibleLimit - eligible ELSE 0
OnTime(t) == disp[t] = "none" /\ t >= WatchedFrom /\ t > settled
StillDue(t) == disp[t] = "selected" \/ OnTime(t)
Due(p) == {t \in Slots : disp[t] = "selected" \/ (OnTime(t) /\ t <= round[p])}
Earlier(t) == {u \in Slots : u < t /\ StillDue(u)}
Least(S) == CHOOSE t \in S : \A u \in S : t <= u

Init ==
    /\ now = 0 /\ ctl = "active" /\ rev = 0
    /\ heartbeat = 0 /\ span = 0 /\ watched = 0 /\ settled = 0
    /\ disp = [t \in Slots |-> "none"] /\ fixed = [t \in Slots |-> "none"]
    /\ accepts = [t \in Slots |-> 0] /\ acceptCtl = [t \in Slots |-> "none"]
    /\ eligible = 0 /\ jobs = 0 /\ open = {}
    /\ round = [p \in Scanners |-> 0] /\ prep = [p \in Scanners |-> NoPrep]
    /\ seen = {} /\ lapsed = {} /\ episodes = 0 /\ everStopped = FALSE
    /\ wake = FALSE

(* Time passes whether or not anyone watches. A slot nobody saw while the
   schedule could run, and that time has left behind, has lapsed. *)
Tick ==
    /\ now < MaxT /\ now' = now + 1
    /\ lapsed' = IF (now + 1 - heartbeat > Gap) \/ ctl = "paused"
                 THEN lapsed \cup {s \in Slots : s <= now /\ disp[s] = "none" /\ s \notin seen}
                 ELSE lapsed
    /\ UNCHANGED <<ctl, rev, heartbeat, span, watched, settled, disp, fixed, accepts,
                   acceptCtl, eligible, jobs, open, round, prep, seen, episodes,
                   everStopped, wake>>

Timer == /\ Timers /\ wake' \in BOOLEAN
         /\ UNCHANGED <<now, ctl, rev, heartbeat, span, watched, settled, disp, fixed,
                        accepts, acceptCtl, eligible, jobs, open, round, prep, seen,
                        lapsed, episodes, everStopped>>

(* A round starts by recording that the scanner watches now. A silence longer
   than Gap starts a new span: what fell before it is recovery, not lateness. *)
Beat(p) ==
    /\ (Mutation = "timerOnly" => wake)
    /\ LET gap == now - heartbeat > Gap /\ Mutation # "noGap"
           from == IF gap THEN now ELSE span
           edge == IF from > watched THEN from ELSE watched
       IN /\ span' = from
          /\ episodes' = IF gap THEN episodes + 1 ELSE episodes
          /\ seen' = IF ctl = "active"
                     THEN seen \cup {t \in Slots : disp[t] = "none" /\ t >= edge
                                                    /\ t > settled /\ t <= now}
                     ELSE seen
    /\ heartbeat' = now
    /\ round' = [round EXCEPT ![p] = now]
    /\ UNCHANGED <<now, ctl, rev, watched, settled, disp, fixed, accepts, acceptCtl,
                   eligible, jobs, open, prep, lapsed, everStopped, wake>>

(* One commit settles a whole missed interval: the latest CatchUp slots are
   selected, the rest are missed, and the interval is never read again. *)
Classify(p) ==
    /\ round[p] # 0 /\ ctl = "active" /\ Unclassified # {}
    /\ LET cut == Smallest(Unclassified, Room)
           sel == Largest(cut, CatchUp)
           all == IF Mutation = "pagedCatchUp" THEN sel ELSE cut
       IN /\ disp' = [t \in Slots |-> IF t \in sel THEN "selected"
                                      ELSE IF t \in all THEN "missed" ELSE disp[t]]
          /\ fixed' = [t \in Slots |-> IF t \in all \ sel THEN "missed" ELSE fixed[t]]
          /\ eligible' = eligible + Cardinality(all)
          /\ settled' = IF Mutation = "pagedCatchUp" THEN settled ELSE WatchedFrom - 1
    /\ UNCHANGED <<now, ctl, rev, heartbeat, span, watched, accepts, acceptCtl, jobs,
                   open, round, prep, seen, lapsed, episodes, everStopped, wake>>

(* The work outside the transaction: it fixes which slot and which revision.
   Taking the earliest is only advice; the commit is what holds the order. *)
Prepare(p) ==
    /\ round[p] # 0 /\ prep[p] = NoPrep /\ Unclassified = {} /\ Due(p) # {}
    /\ \E t \in Due(p) :
          /\ Mutation # "unordered" => t = Least(Due(p))
          /\ prep' = [prep EXCEPT ![p] = [slot |-> t, rev |-> rev]]
    /\ UNCHANGED <<now, ctl, rev, heartbeat, span, watched, settled, disp, fixed, accepts,
                   acceptCtl, eligible, jobs, open, round, seen, lapsed, episodes,
                   everStopped, wake>>

Holds(p) ==
    LET t == prep[p].slot
    IN /\ (Mutation = "staleControl" \/ (prep[p].rev = rev /\ ctl = "active"))
       /\ (Mutation = "noDedupe" \/ StillDue(t))
       /\ (Mutation = "unordered" \/ Earlier(t) = {})
       /\ Unclassified = {}
       /\ (Mutation = "noJobLimit" \/ jobs < JobLimit)
       /\ (disp[t] = "none" => eligible < EligibleLimit)

Abort(p) ==
    /\ prep[p] # NoPrep /\ ~Holds(p)
    /\ prep' = [prep EXCEPT ![p] = NoPrep]
    /\ UNCHANGED <<now, ctl, rev, heartbeat, span, watched, settled, disp, fixed, accepts,
                   acceptCtl, eligible, jobs, open, round, seen, lapsed, episodes,
                   everStopped, wake>>

(* The commit rechecks everything under the lock and writes one disposition. *)
Commit(p, to) ==
    /\ prep[p] # NoPrep /\ Holds(p)
    /\ LET t == prep[p].slot
           busy == open # {} /\ Overlap = "skip"
           counted == disp[t] = "none" /\ ~(Mutation = "skipNotCounted" /\ to = "skipped")
       IN /\ to = "accepted" => ~busy
          /\ to = "skipped" => busy
          /\ to = "rejected" => Rejects
          /\ disp' = [disp EXCEPT ![t] = to]
          /\ fixed' = [fixed EXCEPT ![t] = IF @ = "none" THEN to ELSE @]
          /\ eligible' = IF counted THEN eligible + 1 ELSE eligible
          /\ accepts' = IF to = "accepted" THEN [accepts EXCEPT ![t] = @ + 1] ELSE accepts
          /\ acceptCtl' = IF to = "accepted" THEN [acceptCtl EXCEPT ![t] = ctl] ELSE acceptCtl
          /\ jobs' = IF to = "accepted" THEN jobs + 1 ELSE jobs
          /\ open' = IF to = "accepted" THEN open \cup {t} ELSE open
          /\ settled' = IF t > settled THEN t ELSE settled
    /\ prep' = [prep EXCEPT ![p] = NoPrep]
    /\ UNCHANGED <<now, ctl, rev, heartbeat, span, watched, round, seen, lapsed,
                   episodes, everStopped, wake>>

(* A wrong backfill: after a skip, an older missed slot is taken up again. *)
Backfill(p) ==
    /\ Mutation = "backfill" /\ round[p] # 0
    /\ \E s \in Slots : disp[s] = "skipped"
    /\ \E t \in Slots : /\ disp[t] = "missed"
                        /\ disp' = [disp EXCEPT ![t] = "selected"]
    /\ UNCHANGED <<now, ctl, rev, heartbeat, span, watched, settled, fixed, accepts,
                   acceptCtl, eligible, jobs, open, round, prep, seen, lapsed, episodes,
                   everStopped, wake>>

Conclude(t) ==
    /\ t \in open /\ open' = open \ {t}
    /\ UNCHANGED <<now, ctl, rev, heartbeat, span, watched, settled, disp, fixed, accepts,
                   acceptCtl, eligible, jobs, round, prep, seen, lapsed, episodes,
                   everStopped, wake>>

Pause ==
    /\ Controls /\ ctl = "active" /\ rev = 0
    /\ ctl' = "paused" /\ rev' = rev + 1
    /\ UNCHANGED <<now, heartbeat, span, watched, settled, disp, fixed, accepts, acceptCtl,
                   eligible, jobs, open, round, prep, seen, lapsed, episodes,
                   everStopped, wake>>

(* Resuming only lifts the pause: what fell during it is recovery. A slot of
   this very instant that a scanner already watches is on time. *)
Resume ==
    /\ ctl = "paused"
    /\ ctl' = "active" /\ rev' = rev + 1
    /\ watched' = IF Mutation = "resumeNoWatch" THEN watched ELSE now
    /\ episodes' = IF Mutation = "resumeNoWatch" THEN episodes ELSE episodes + 1
    /\ seen' = seen \cup {t \in Slots : disp[t] = "none" /\ t >= now /\ t <= heartbeat
                                          /\ t > settled}
    /\ UNCHANGED <<now, heartbeat, span, settled, disp, fixed, accepts, acceptCtl, eligible,
                   jobs, open, round, prep, lapsed, everStopped, wake>>

Stop ==
    /\ Controls /\ ctl \in {"active", "paused"}
    /\ ctl' = "stopped" /\ rev' = rev + 1 /\ everStopped' = TRUE
    /\ UNCHANGED <<now, heartbeat, span, watched, settled, disp, fixed, accepts, acceptCtl,
                   eligible, jobs, open, round, prep, seen, lapsed, episodes, wake>>

Revive ==
    /\ Mutation = "reviveStopped" /\ ctl = "stopped"
    /\ ctl' = "active" /\ rev' = rev + 1
    /\ UNCHANGED <<now, heartbeat, span, watched, settled, disp, fixed, accepts, acceptCtl,
                   eligible, jobs, open, round, prep, seen, lapsed, episodes,
                   everStopped, wake>>

(* A scanner loses what it held in memory; durable state stays. *)
Crash(p) ==
    /\ round[p] # 0
    /\ round' = [round EXCEPT ![p] = 0] /\ prep' = [prep EXCEPT ![p] = NoPrep]
    /\ UNCHANGED <<now, ctl, rev, heartbeat, span, watched, settled, disp, fixed, accepts,
                   acceptCtl, eligible, jobs, open, seen, lapsed, episodes,
                   everStopped, wake>>

Scan(p) == Beat(p) \/ Classify(p) \/ Prepare(p) \/ Abort(p) \/ Backfill(p)
             \/ \E to \in Admitted : Commit(p, to)
Next == Tick \/ Timer \/ Pause \/ Resume \/ Stop \/ Revive
          \/ (\E p \in Scanners : Scan(p) \/ Crash(p))
          \/ (\E t \in Slots : Conclude(t))
Spec == Init /\ [][Next]_vars

(* Liveness: the periodic scan settles every slot whatever the timer does. *)
Steady == Tick \/ Timer \/ (\E p \in Scanners : Scan(p)) \/ (\E t \in Slots : Conclude(t))
Live == /\ Init /\ [][Steady]_vars
        /\ WF_vars(Tick)
        /\ \A p \in Scanners : /\ WF_vars(Beat(p)) /\ WF_vars(Classify(p))
                               /\ WF_vars(Prepare(p)) /\ WF_vars(Abort(p))
                               /\ WF_vars(\E to \in Admitted : Commit(p, to))
        /\ \A t \in Slots : WF_vars(Conclude(t))
InBounds(t) == Cardinality({u \in Slots : u < t}) < EligibleLimit
AllSettled == <>(\A t \in Slots : InBounds(t) => disp[t] \in Final)

TypeOK ==
    /\ now \in 0..MaxT /\ ctl \in {"active", "paused", "stopped"} /\ rev \in 0..4
    /\ heartbeat \in 0..MaxT /\ span \in 0..MaxT /\ watched \in 0..MaxT
    /\ settled \in 0..MaxT
    /\ disp \in [Slots -> Final \cup {"none", "selected"}]
    /\ accepts \in [Slots -> 0..3] /\ eligible \in 0..(MaxT + 1) /\ jobs \in 0..(MaxT + 1)
    /\ open \subseteq Slots /\ round \in [Scanners -> 0..MaxT]

AtMostOneJob == \A t \in Slots : accepts[t] <= 1
AcceptedWhileActive == \A t \in Slots : disp[t] = "accepted" => acceptCtl[t] = "active"
EligibleBound == Cardinality({t \in Slots : disp[t] # "none"}) <= EligibleLimit
JobBound == Cardinality({t \in Slots : disp[t] = "accepted"}) <= JobLimit
CatchUpBounded ==
    Cardinality({t \in lapsed : disp[t] \in Admitted \cup {"selected"}}) <= CatchUp * episodes
InOrder == \A s, t \in Slots : (s < t /\ disp[t] \in Admitted) => disp[s] # "selected"
DispositionFixed == \A t \in Slots : fixed[t] # "none" => disp[t] = fixed[t]
StoppedIsFinal == everStopped => ctl = "stopped"
=============================================================================
