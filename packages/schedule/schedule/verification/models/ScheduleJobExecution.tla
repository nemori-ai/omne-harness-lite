----------------------- MODULE ScheduleJobExecution -----------------------
(* Two accepted Jobs of one schedule and the executor that carries them out.
   The coordinator records what it has learned; `ex`, `starts` and `goal`
   are what really happened on the executor's side. Job 1 is the earlier. *)
EXTENDS Naturals
CONSTANTS Overlap, Mutation
Jobs == {1, 2}

VARIABLES st, out, stop, ex, starts, goal, flight, sent, first
vars == <<st, out, stop, ex, starts, goal, flight, sent, first>>

NotStarted == {"accepted", "waiting", "blocked"}
Ended == {"done", "failed", "stopped"}

Init ==
    /\ st = [j \in Jobs |-> IF j = 1 THEN "accepted" ELSE "absent"]
    /\ out = [j \in Jobs |-> "none"] /\ first = [j \in Jobs |-> "none"]
    /\ stop = [j \in Jobs |-> "none"] /\ ex = [j \in Jobs |-> "none"]
    /\ starts = [j \in Jobs |-> 0] /\ goal = [j \in Jobs |-> FALSE]
    /\ flight = [j \in Jobs |-> FALSE] /\ sent = [j \in Jobs |-> FALSE]

(* Only a recorded conclusion of the earlier Job lets the later one go on. *)
Quiet == \/ st[1] = "concluded"
         \/ (Mutation = "stopRequestIsStop" /\ stop[1] \in {"pending", "unknown"})

Settle(j, how) ==
    /\ st' = [st EXCEPT ![j] = "concluded"]
    /\ out' = [out EXCEPT ![j] = how]
    /\ first' = [first EXCEPT ![j] = IF @ = "none" THEN how ELSE @]

(* The later slot is accepted while the earlier Job may still be going. *)
Accept ==
    /\ st[2] = "absent"
    /\ IF Overlap = "replace" /\ st[1] \in NotStarted
       THEN /\ st' = [st EXCEPT ![1] = "concluded", ![2] = "accepted"]
            /\ out' = [out EXCEPT ![1] = "cancelled"]
            /\ first' = [first EXCEPT ![1] = "cancelled"]
            /\ UNCHANGED stop
       ELSE /\ st' = [st EXCEPT ![2] = IF Overlap = "parallel" \/ Quiet
                                        THEN "accepted" ELSE "waiting"]
            /\ stop' = IF Overlap = "replace" /\ st[1] # "concluded" /\ stop[1] = "none"
                       THEN [stop EXCEPT ![1] = "requested"] ELSE stop
            /\ UNCHANGED <<out, first>>
    /\ UNCHANGED <<ex, starts, goal, flight, sent>>

Release ==
    /\ st[2] = "waiting" /\ Quiet
    /\ st' = [st EXCEPT ![2] = "accepted"]
    /\ UNCHANGED <<out, stop, ex, starts, goal, flight, sent, first>>

(* The intent to start is durable before any call leaves. *)
Intend(j) ==
    /\ st[j] = "accepted" /\ stop[j] = "none"
    /\ st' = [st EXCEPT ![j] = "startPending"]
    /\ UNCHANGED <<out, stop, ex, starts, goal, flight, sent, first>>

Issue(j) ==
    /\ st[j] = "startPending" /\ ~flight[j] /\ stop[j] = "none"
    /\ flight' = [flight EXCEPT ![j] = TRUE]
    /\ st' = IF Mutation = "issueIsRunning" THEN [st EXCEPT ![j] = "running"] ELSE st
    /\ UNCHANGED <<out, stop, ex, starts, goal, sent, first>>

(* The executor starts a Job once: the same Job asked again is the same one. *)
ExecStart(j) ==
    /\ flight[j] /\ flight' = [flight EXCEPT ![j] = FALSE]
    /\ IF ex[j] = "none"
       THEN /\ ex' = [ex EXCEPT ![j] = "running"]
            /\ starts' = [starts EXCEPT ![j] = @ + 1]
       ELSE /\ ex' = ex
            /\ starts' = IF Mutation = "freshKeyOnRetry"
                         THEN [starts EXCEPT ![j] = @ + 1] ELSE starts
    /\ UNCHANGED <<st, out, stop, goal, sent, first>>

ExecRefuse(j) ==
    /\ flight[j] /\ ex[j] = "none" /\ flight' = [flight EXCEPT ![j] = FALSE]
    /\ UNCHANGED <<st, out, stop, ex, starts, goal, sent, first>>

ExecFinish(j) ==
    /\ ex[j] = "running"
    /\ \E how \in {"done", "failed"} : ex' = [ex EXCEPT ![j] = how]
    /\ \E g \in BOOLEAN : goal' = [goal EXCEPT ![j] = g /\ ex'[j] = "done"]
    /\ UNCHANGED <<st, out, stop, starts, flight, sent, first>>

ExecStop(j) ==
    /\ ex[j] = "running" /\ sent[j]
    /\ ex' = [ex EXCEPT ![j] = "stopped"]
    /\ UNCHANGED <<st, out, stop, starts, goal, flight, sent, first>>

(* What the coordinator learns by asking for the original Job. *)
LearnStarted(j) ==
    /\ st[j] = "startPending" /\ ex[j] # "none"
    /\ st' = [st EXCEPT ![j] = "running"]
    /\ UNCHANGED <<out, stop, ex, starts, goal, flight, sent, first>>

LearnNotStarted(j) ==
    /\ st[j] = "startPending" /\ ~flight[j] /\ ex[j] = "none"
    /\ IF stop[j] = "none"
       THEN /\ st' = [st EXCEPT ![j] = "blocked"] /\ UNCHANGED <<out, first>>
       ELSE Settle(j, "cancelled")
    /\ UNCHANGED <<stop, ex, starts, goal, flight, sent>>

Retry(j) ==
    /\ st[j] = "blocked" /\ stop[j] = "none"
    /\ st' = [st EXCEPT ![j] = "startPending"]
    /\ UNCHANGED <<out, stop, ex, starts, goal, flight, sent, first>>

(* Cancelling a Job that has not started settles it; one that may have
   started only records the wish to stop, until the start is known. *)
Cancel(j) ==
    /\ st[j] \notin {"absent", "concluded"} \/ Mutation = "cancelOverwrites"
    /\ st[j] # "absent"
    /\ IF st[j] \in NotStarted \/ (st[j] = "startPending" /\ Mutation = "cancelWhileFlight")
       THEN Settle(j, "cancelled") /\ UNCHANGED stop
       ELSE IF st[j] = "concluded"
       THEN /\ out' = [out EXCEPT ![j] = "cancelled"] /\ UNCHANGED <<st, first, stop>>
       ELSE /\ stop' = [stop EXCEPT ![j] = IF @ = "none" THEN "requested" ELSE @]
            /\ UNCHANGED <<st, out, first>>
    /\ UNCHANGED <<ex, starts, goal, flight, sent>>

SendStop(j) ==
    /\ st[j] = "running" /\ stop[j] = "requested"
    /\ stop' = [stop EXCEPT ![j] = IF Mutation = "stopSentIsConfirmed" THEN "confirmed"
                                     ELSE "pending"]
    /\ sent' = [sent EXCEPT ![j] = TRUE]
    /\ UNCHANGED <<st, out, ex, starts, goal, flight, first>>

StopUnknown(j) ==
    /\ stop[j] = "pending"
    /\ stop' = [stop EXCEPT ![j] = "unknown"]
    /\ UNCHANGED <<st, out, ex, starts, goal, flight, sent, first>>

(* The main action ends as the executor reports it, not as anyone hoped. *)
Record(j) ==
    /\ st[j] = "running"
    /\ \/ /\ ex[j] \in Ended
          /\ Settle(j, IF ex[j] = "stopped" THEN "cancelled"
                       ELSE IF ex[j] = "done" /\ (goal[j] \/ Mutation = "runEndIsSuccess")
                       THEN "succeeded" ELSE "failed")
          /\ stop' = IF ex[j] = "stopped" THEN [stop EXCEPT ![j] = "confirmed"] ELSE stop
       \/ /\ Mutation = "unknownIsFailed" /\ stop[j] = "unknown"
          /\ Settle(j, "failed") /\ UNCHANGED stop
    /\ UNCHANGED <<ex, starts, goal, flight, sent>>

(* The process dies: calls it had sent die with it, records stay. *)
Crash ==
    /\ flight' = [j \in Jobs |-> FALSE]
    /\ UNCHANGED <<st, out, stop, ex, starts, goal, sent, first>>

Next == Accept \/ Release \/ Crash
          \/ \E j \in Jobs : \/ Intend(j) \/ Issue(j) \/ ExecStart(j) \/ ExecRefuse(j)
                             \/ ExecFinish(j) \/ ExecStop(j) \/ LearnStarted(j)
                             \/ LearnNotStarted(j) \/ Retry(j) \/ Cancel(j)
                             \/ SendStop(j) \/ StopUnknown(j) \/ Record(j)
Spec == Init /\ [][Next]_vars

TypeOK ==
    /\ st \in [Jobs -> {"absent", "accepted", "waiting", "startPending", "running",
                        "blocked", "concluded"}]
    /\ out \in [Jobs -> {"none", "succeeded", "failed", "cancelled"}]
    /\ stop \in [Jobs -> {"none", "requested", "pending", "confirmed", "unknown"}]
    /\ ex \in [Jobs -> {"none", "running"} \cup Ended]
    /\ starts \in [Jobs -> 0..3]

StartAtMostOnce == \A j \in Jobs : starts[j] <= 1
RunningIsReal == \A j \in Jobs : st[j] = "running" => ex[j] # "none"
(* A start that arrives for an ended execution finds the same one; only a
   start arriving after a never-started Job was settled would be a new one. *)
NoLateStart(j) == ex[j] = "none" => ~flight[j]
CancelIsReal == \A j \in Jobs : out[j] = "cancelled" => (ex[j] \in {"none", "stopped"} /\ NoLateStart(j))
SuccessHasEvidence == \A j \in Jobs : out[j] = "succeeded" => (ex[j] = "done" /\ goal[j])
FailureIsReal == \A j \in Jobs : out[j] = "failed" => ex[j] \in {"done", "failed"}
StopIsReal == \A j \in Jobs : stop[j] = "confirmed" => ex[j] = "stopped"
PredecessorEnded ==
    (Overlap # "parallel" /\ (ex[2] # "none" \/ flight[2]))
        => (ex[1] \in Ended \cup {"none"} /\ NoLateStart(1) /\ st[1] = "concluded")
OutcomeFixed == \A j \in Jobs : first[j] # "none" => out[j] = first[j]
=============================================================================
