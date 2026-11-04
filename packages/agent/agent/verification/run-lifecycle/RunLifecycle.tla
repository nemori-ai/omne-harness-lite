---------------------------- MODULE RunLifecycle ----------------------------
(***************************************************************************)
(* One Agent execution driven by one runtime: the step pipeline of the     *)
(* Loop as the drive sees it, with crashes, lost answers, refused commits, *)
(* rejected replies, absent receivers and the step limit.                  *)
(*                                                                         *)
(* A step: I0 takes inputs, M0 saves the Model intent, M6 admits the call  *)
(* (the external effect), M1 waits for the received entry, M3/I3 adopt and *)
(* admit the reply, I4 fixes the action batch, A0 judges it, A2 saves each *)
(* Tool intent and invokes it (the external effect), T0 waits for results, *)
(* T1/T5 take custody and publish the messages, I8 decides, F1/F3 end.     *)
(*                                                                         *)
(* `d.node` is the position the drive is at; `d.ckpt` is the position the  *)
(* last commit saved. A crash keeps `ckpt`, the Model-side and Tool-side   *)
(* facts and the Journal; it loses the in-memory flags. Recovery resumes   *)
(* at `ckpt` and recalls saved intents instead of dispatching again.       *)
(*                                                                         *)
(* Bug switches each make one negative control; all FALSE is the design.   *)
(* `FailTerminates` is not a bug: TRUE is the ought (a node failure ends   *)
(* the run as failed and frees the slot, D-31), FALSE is the is (R2-D285:  *)
(* the slot is marked failed and reported once, the run is not ended).     *)
(*                                                                         *)
(* The owner of every rule is packages/agent/agent-contract/SPEC.md and    *)
(* the Loop algorithm page; the mapping is in README.md next to this file. *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS
  MaxSteps,            \* steps the environment may drive (bound of the model)
  MaxRunSteps,         \* the configured step limit (factory `maxRunSteps`)
  MaxActions,          \* tool calls one reply may carry: 1 or 2
  MaxCrashes, MaxRefuse, MaxRejects, MaxTicks, MaxUnknown,
  CBase, CAct,         \* commits per step: base, and per action
  DispatchBeforeIntent,\* bug: dispatch first, save the intent in a later commit
  RetryRedispatch,     \* bug: an unknown admit is retried under a fresh identity
  RejectNotCounted,    \* bug: a rejected reply re-requests inside the same step
  DriverSwallows,      \* bug: a refused commit stops the drive silently
  FailTerminates,      \* TRUE: ought (node failure ends the run); FALSE: is (R2-D285)
  NoWakeOnReceive,     \* bug: the received commit does not wake the waiting drive
  DropOnAbsent,        \* bug: a push without a registered receiver drops the result
  StallOnUnavailable,  \* bug: an unavailable admission leaves the batch at A0
  ReleaseOnUnavailable,\* bug: actions allowed earlier are released although a later one is unavailable
  CommitOnIdleWake     \* bug: every wake without progress commits the wait again

ASSUME MaxRunSteps \in 1..MaxSteps /\ MaxActions \in 1..2

Acts  == 1..MaxActions
Nodes == {"I0", "M0", "M0b", "M6", "M1", "I4", "A0", "A2", "T0", "I8", "F1", "F3", "ended"}
Results == {"none", "produced", "pending", "committed", "lost"}

VARIABLES
  d,     \* the drive: position, checkpoint, step, requests, reply, actions, barrier, ...
  m,     \* the main Model call of the step: intent, logical dispatches, Model-side state, result
  acts,  \* the actions of the step, one record each
  w,     \* the wait: asleep, woken, timer wakes, ticks
  env,   \* the environment: receiver, crashes, refusals, rejections, unknown answers
  run    \* the slot of the runtime: running / failed / free, stopped, reports
vars == <<d, m, acts, w, env, run>>

NoAct == [adm |-> "none", intent |-> FALSE, inflight |-> FALSE, logical |-> 0,
          sent |-> FALSE, assoc |-> FALSE, unk |-> FALSE, res |-> "none",
          custody |-> FALSE, msg |-> FALSE]
NoModel == [intent |-> FALSE, logical |-> 0, sent |-> FALSE, unk |-> FALSE, res |-> "none"]
NoActs == [i \in Acts |-> NoAct]

Ready == ~env.crashed /\ ~run.stopped /\ ~d.stalled

(* A commit the storage accepted: the position advances and is saved. *)
Advance(next, delta) ==
  d' = [d EXCEPT !.node = next, !.ckpt = next, !.commits = @ + delta]

(* The storage refused the commit (command_limit, ...): nothing was written and the node
   failed. Ought: the run ends as failed. Is: the slot is marked failed and reported once.
   Bug: the drive stops and nobody is told. *)
Refuse ==
  /\ env.refusals < MaxRefuse
  /\ env' = [env EXCEPT !.refusals = @ + 1]
  /\ IF FailTerminates
       THEN /\ d' = [d EXCEPT !.node = "F1", !.ckpt = "F1", !.endReason = "failed"]
            /\ UNCHANGED run
     ELSE IF DriverSwallows
       THEN /\ run' = [run EXCEPT !.stopped = TRUE]
            /\ UNCHANGED d
     ELSE /\ run' = [run EXCEPT !.stopped = TRUE, !.slot = "failed", !.reported = @ + 1]
          /\ UNCHANGED d

Allowed(i) == i <= d.actions /\ acts[i].adm = "allowed"

(* Something the drive can read without sleeping. *)
(* W0 is entered only when the node has nothing left to do without a new fact: a committed
   result to take, a taken result whose message is not yet saved, or a finished batch. *)
Readable ==
  \/ d.node = "M1" /\ m.res = "committed"
  \/ d.node = "T0" /\ \E i \in Acts : Allowed(i) /\ acts[i].res = "committed" /\ ~acts[i].custody
  \/ d.node = "T0" /\ \E i \in Acts : acts[i].custody /\ ~acts[i].msg
  \/ d.node = "T0" /\ \A i \in Acts : i <= d.actions => acts[i].msg

----------------------------------------------------------------------------
(* The step pipeline *)

(* I0: take the inputs, open the step. Resets the per-step facts. *)
TakeInputs ==
  /\ Ready /\ d.node = "I0" /\ d.step < MaxSteps
  /\ \/ /\ d' = [d EXCEPT !.node = "M0", !.ckpt = "M0", !.step = @ + 1, !.reply = "none",
                          !.actions = 0, !.barrier = "none", !.admUnavail = FALSE,
                          !.commits = 1, !.waitSaved = FALSE]
        /\ m' = NoModel /\ acts' = NoActs
        /\ w' = [w EXCEPT !.asleep = FALSE, !.woken = FALSE]
        /\ UNCHANGED <<env, run>>
     \/ Refuse /\ UNCHANGED <<m, acts, w>>

(* M0: save the Model intent before anything is sent. The bug sends first. *)
SaveModelIntent ==
  /\ Ready /\ d.node = "M0"
  /\ IF DispatchBeforeIntent
       THEN /\ m' = [m EXCEPT !.sent = TRUE, !.logical = @ + 1]
            /\ d' = [d EXCEPT !.node = "M0b", !.requests = @ + 1]
            /\ UNCHANGED <<acts, w, env, run>>
       ELSE \/ /\ Advance("M6", 1) /\ m' = [m EXCEPT !.intent = TRUE]
               /\ UNCHANGED <<acts, w, env, run>>
            \/ Refuse /\ UNCHANGED <<m, acts, w>>

(* Bug only: the intent is saved after the dispatch; a crash in between loses it. *)
LateSaveModelIntent ==
  /\ Ready /\ d.node = "M0b"
  /\ Advance("M1", 1) /\ m' = [m EXCEPT !.intent = TRUE]
  /\ UNCHANGED <<acts, w, env, run>>

(* M6: admit the saved call. The Model keeps the identity it accepted, so a repeated admit
   of the same identity is the same logical call. An unavailable Model is a dependency wait
   here (R2-D237); an accepted call whose answer was lost is recalled by its reference. *)
AdmitModel ==
  /\ Ready /\ d.node = "M6" /\ m.intent
  /\ UNCHANGED <<acts, run>>
  /\ \/ LET fresh == ~m.sent \/ (RetryRedispatch /\ m.unk)
        IN /\ m' = [m EXCEPT !.sent = TRUE, !.unk = FALSE,
                             !.logical = IF fresh THEN @ + 1 ELSE @]
           /\ d' = [d EXCEPT !.node = "M1", !.requests = IF fresh THEN @ + 1 ELSE @]
           /\ UNCHANGED <<w, env>>
     \/ /\ env.unknowns < MaxUnknown
        /\ env' = [env EXCEPT !.unknowns = @ + 1]
        /\ UNCHANGED <<d, m, w>>
     \/ /\ env.unknowns < MaxUnknown /\ ~m.sent
        /\ env' = [env EXCEPT !.unknowns = @ + 1]
        /\ m' = [m EXCEPT !.sent = TRUE, !.unk = TRUE, !.logical = @ + 1]
        /\ d' = [d EXCEPT !.requests = @ + 1]
        /\ UNCHANGED w

(* W0: nothing to read, so save the wait once and sleep. Re-sleeping after a wake without
   progress saves nothing; the bug commits every time. *)
Sleep ==
  /\ Ready /\ d.node \in {"M1", "T0"} /\ ~w.asleep /\ ~Readable
  /\ w' = [w EXCEPT !.asleep = TRUE, !.woken = FALSE]
  /\ d' = IF ~d.waitSaved \/ CommitOnIdleWake
            THEN [d EXCEPT !.commits = @ + 1, !.waitSaved = TRUE]
            ELSE d
  /\ UNCHANGED <<m, acts, env, run>>

Wake ==
  /\ Ready /\ w.asleep /\ w.woken
  /\ w' = [w EXCEPT !.asleep = FALSE, !.woken = FALSE]
  /\ UNCHANGED <<d, m, acts, env, run>>

(* The check time of the wait (reconciliationDelayMs): the fallback wake. *)
CheckTime ==
  /\ ~env.crashed /\ w.asleep /\ ~w.woken /\ w.ticks < MaxTicks
  /\ w' = [w EXCEPT !.woken = TRUE, !.timerWakes = @ + 1, !.ticks = @ + 1]
  /\ UNCHANGED <<d, m, acts, env, run>>

(* The producer: the Model produces, then pushes to the registered receiver. Without a
   receiver the delivery stays with the producer and is retried (R2-D273); the bug drops it. *)
ProduceModel ==
  /\ m.sent /\ m.res = "none"
  /\ m' = [m EXCEPT !.res = "produced"]
  /\ UNCHANGED <<d, acts, w, env, run>>

PushModel ==
  /\ m.res \in {"produced", "pending"}
  /\ UNCHANGED <<d, acts, env, run>>
  /\ IF env.receiverUp
       THEN /\ m' = [m EXCEPT !.res = "committed"]
            /\ w' = IF NoWakeOnReceive THEN w ELSE [w EXCEPT !.woken = TRUE]
       ELSE /\ m.res = "produced"
            /\ m' = [m EXCEPT !.res = IF DropOnAbsent THEN "lost" ELSE "pending"]
            /\ UNCHANGED w

ReceiverUp ==
  /\ ~env.receiverUp
  /\ env' = [env EXCEPT !.receiverUp = TRUE]
  /\ UNCHANGED <<d, m, acts, w, run>>

(* M3 then I3: adopt the committed result (producer event), admit the reply (Ja). A rejected
   reply goes to I8 and the next step; the bug re-requests inside the same step. *)
ReadModel ==
  /\ Ready /\ d.node = "M1" /\ ~w.asleep /\ m.res = "committed"
  /\ UNCHANGED <<acts, w>>
  /\ \/ /\ d' = [d EXCEPT !.node = "I4", !.ckpt = "I4", !.commits = @ + 2,
                          !.reply = "admitted", !.waitSaved = FALSE]
        /\ UNCHANGED <<m, env, run>>
     \/ /\ env.rejects < MaxRejects
        /\ env' = [env EXCEPT !.rejects = @ + 1]
        /\ IF RejectNotCounted
             THEN /\ d' = [d EXCEPT !.node = "M0", !.ckpt = "M0", !.commits = @ + 2,
                                    !.reply = "rejected", !.waitSaved = FALSE]
                  /\ m' = NoModel
             ELSE /\ d' = [d EXCEPT !.node = "I8", !.ckpt = "I8", !.commits = @ + 2,
                                    !.reply = "rejected", !.waitSaved = FALSE]
                  /\ UNCHANGED m
        /\ UNCHANGED run
     \/ Refuse /\ UNCHANGED m

(* I4: fix the action batch of the admitted reply. *)
Actions ==
  /\ Ready /\ d.node = "I4"
  /\ \/ \E n \in 0..MaxActions :
          /\ d' = [d EXCEPT !.node = IF n = 0 THEN "I8" ELSE "A0",
                            !.ckpt = IF n = 0 THEN "I8" ELSE "A0",
                            !.commits = @ + 1, !.actions = n]
          /\ UNCHANGED <<m, acts, w, env, run>>
     \/ Refuse /\ UNCHANGED <<m, acts, w>>

(* A0/A1: judge the batch. An unavailable admission denies the whole batch (SPEC rule 2,
   R2-D266); the denial messages are published with the barrier. *)
Admission ==
  /\ Ready /\ d.node = "A0"
  /\ \/ \E adm \in [1..d.actions -> {"allowed", "denied", "unavailable"}] :
          LET unav == \E i \in 1..d.actions : adm[i] = "unavailable"
              denyAll == (unav /\ ~ReleaseOnUnavailable)
                         \/ ~(\E i \in 1..d.actions : adm[i] = "allowed")
              Final(i) == IF i > d.actions THEN NoAct
                          ELSE IF denyAll \/ adm[i] /= "allowed"
                            THEN [NoAct EXCEPT !.adm = "denied", !.msg = TRUE]
                          ELSE [NoAct EXCEPT !.adm = "allowed"]
          IN /\ acts' = [i \in Acts |-> Final(i)]
             /\ IF unav /\ StallOnUnavailable
                  THEN d' = [d EXCEPT !.stalled = TRUE, !.admUnavail = TRUE]
                  ELSE d' = [d EXCEPT !.admUnavail = unav,
                                      !.barrier = IF denyAll THEN "all-denied" ELSE "open",
                                      !.node = IF denyAll THEN "I8" ELSE "A2",
                                      !.ckpt = IF denyAll THEN "I8" ELSE "A2",
                                      !.commits = @ + 1]
             /\ UNCHANGED <<m, w, env, run>>
     \/ Refuse /\ UNCHANGED <<m, acts, w>>

(* A2 per action: save the Tool intent, then invoke under that identity, then save the
   association. The bug invokes first and saves later. *)
SaveToolIntent(i) ==
  /\ Ready /\ d.node = "A2" /\ Allowed(i) /\ ~acts[i].intent /\ ~DispatchBeforeIntent
  /\ \/ /\ Advance("A2", 1) /\ acts' = [acts EXCEPT ![i].intent = TRUE]
        /\ UNCHANGED <<m, w, env, run>>
     \/ Refuse /\ UNCHANGED <<m, acts, w>>

DispatchUnsaved(i) ==
  /\ Ready /\ d.node = "A2" /\ Allowed(i) /\ ~acts[i].intent /\ ~acts[i].inflight
  /\ DispatchBeforeIntent
  /\ acts' = [acts EXCEPT ![i].sent = TRUE, ![i].logical = @ + 1, ![i].inflight = TRUE]
  /\ UNCHANGED <<d, m, w, env, run>>

LateSaveToolIntent(i) ==
  /\ Ready /\ d.node = "A2" /\ acts[i].inflight /\ ~acts[i].intent
  /\ Advance("A2", 1)
  /\ acts' = [acts EXCEPT ![i].intent = TRUE, ![i].inflight = FALSE]
  /\ UNCHANGED <<m, w, env, run>>

InvokeTool(i) ==
  /\ Ready /\ d.node = "A2" /\ Allowed(i) /\ acts[i].intent /\ ~acts[i].assoc
  /\ UNCHANGED <<m, w, run>>
  /\ \/ LET fresh == ~acts[i].sent \/ (RetryRedispatch /\ acts[i].unk)
        IN /\ acts' = [acts EXCEPT ![i].sent = TRUE, ![i].unk = FALSE, ![i].assoc = TRUE,
                                   ![i].logical = IF fresh THEN @ + 1 ELSE @]
           /\ Advance("A2", 1)
           /\ UNCHANGED env
     \/ /\ env.unknowns < MaxUnknown /\ ~acts[i].sent
        /\ env' = [env EXCEPT !.unknowns = @ + 1]
        /\ acts' = [acts EXCEPT ![i].sent = TRUE, ![i].unk = TRUE, ![i].logical = @ + 1]
        /\ UNCHANGED d

Dispatched ==
  /\ Ready /\ d.node = "A2" /\ \A i \in Acts : Allowed(i) => acts[i].assoc
  /\ d' = [d EXCEPT !.node = "T0"]
  /\ UNCHANGED <<m, acts, w, env, run>>

(* The Tool producer, like the Model producer. *)
ProduceTool(i) ==
  /\ acts[i].sent /\ acts[i].res = "none"
  /\ acts' = [acts EXCEPT ![i].res = "produced"]
  /\ UNCHANGED <<d, m, w, env, run>>

PushTool(i) ==
  /\ acts[i].res \in {"produced", "pending"}
  /\ UNCHANGED <<d, m, env, run>>
  /\ IF env.receiverUp
       THEN /\ acts' = [acts EXCEPT ![i].res = "committed"]
            /\ w' = IF NoWakeOnReceive THEN w ELSE [w EXCEPT !.woken = TRUE]
       ELSE /\ acts[i].res = "produced"
            /\ acts' = [acts EXCEPT ![i].res = IF DropOnAbsent THEN "lost" ELSE "pending"]
            /\ UNCHANGED w

(* T1: custody of a committed result; T5: its message. *)
ReadTool(i) ==
  /\ Ready /\ d.node = "T0" /\ ~w.asleep /\ Allowed(i)
  /\ acts[i].res = "committed" /\ ~acts[i].custody
  /\ UNCHANGED <<m, w>>
  /\ \/ /\ d' = [d EXCEPT !.commits = @ + 1, !.waitSaved = FALSE]
        /\ acts' = [acts EXCEPT ![i].custody = TRUE]
        /\ UNCHANGED <<env, run>>
     \/ Refuse /\ UNCHANGED acts

MessageTool(i) ==
  /\ Ready /\ d.node = "T0" /\ acts[i].custody /\ ~acts[i].msg
  /\ UNCHANGED <<m, w>>
  /\ \/ /\ d' = [d EXCEPT !.commits = @ + 1]
        /\ acts' = [acts EXCEPT ![i].msg = TRUE]
        /\ UNCHANGED <<env, run>>
     \/ Refuse /\ UNCHANGED acts

BatchDone ==
  /\ Ready /\ d.node = "T0" /\ \A i \in Acts : i <= d.actions => acts[i].msg
  /\ d' = [d EXCEPT !.node = "I8"]
  /\ UNCHANGED <<m, acts, w, env, run>>

(* I8: a rejected reply or a reply with actions wants another step; the limit (R2-D221,
   R2-D229) turns that into a guard failure. A final reply completes. *)
Decide ==
  /\ Ready /\ d.node = "I8"
  /\ UNCHANGED <<m, acts, w>>
  /\ LET continue == d.reply = "rejected" \/ d.actions > 0
     IN \/ /\ continue /\ d.step < MaxRunSteps
           /\ Advance("I0", 1) /\ UNCHANGED <<env, run>>
        \/ /\ continue /\ d.step >= MaxRunSteps
           /\ d' = [d EXCEPT !.node = "F1", !.ckpt = "F1", !.commits = @ + 1,
                             !.endReason = "guard"]
           /\ UNCHANGED <<env, run>>
        \/ /\ ~continue
           /\ d' = [d EXCEPT !.node = "F1", !.ckpt = "F1", !.commits = @ + 1,
                             !.endReason = "complete"]
           /\ UNCHANGED <<env, run>>
        \/ Refuse

(* F1: the candidate; F3: tryFinish, the only terminal commit. *)
Candidate ==
  /\ Ready /\ d.node = "F1"
  /\ UNCHANGED <<m, acts, w>>
  /\ \/ Advance("F3", 1) /\ UNCHANGED <<env, run>>
     \/ Refuse

Finish ==
  /\ Ready /\ d.node = "F3"
  /\ UNCHANGED <<m, acts, w>>
  /\ \/ /\ Advance("ended", 1) /\ run' = [run EXCEPT !.slot = "free"] /\ UNCHANGED env
     \/ Refuse

----------------------------------------------------------------------------
(* Crash and recovery *)

Crash ==
  /\ ~env.crashed /\ ~run.stopped /\ env.crashes < MaxCrashes /\ d.node /= "ended"
  /\ env' = [env EXCEPT !.crashed = TRUE, !.crashes = @ + 1]
  /\ UNCHANGED <<d, m, acts, w, run>>

(* The successor attaches (one commit), resumes at the saved position and forgets the
   in-memory flags. Saved intents are recalled, the Model and the Tool keep what they accepted. *)
Recover ==
  /\ env.crashed
  /\ env' = [env EXCEPT !.crashed = FALSE]
  /\ d' = [d EXCEPT !.node = d.ckpt, !.commits = @ + 1]
  /\ m' = [m EXCEPT !.unk = FALSE]
  /\ acts' = [i \in Acts |-> [acts[i] EXCEPT !.unk = FALSE, !.inflight = FALSE]]
  /\ w' = [w EXCEPT !.asleep = FALSE, !.woken = FALSE]
  /\ UNCHANGED run

----------------------------------------------------------------------------

Init ==
  /\ d = [node |-> "I0", ckpt |-> "I0", step |-> 0, requests |-> 0, reply |-> "none",
          actions |-> 0, barrier |-> "none", admUnavail |-> FALSE, endReason |-> "none",
          commits |-> 0, waitSaved |-> FALSE, stalled |-> FALSE]
  /\ m = NoModel /\ acts = NoActs
  /\ w = [asleep |-> FALSE, woken |-> FALSE, timerWakes |-> 0, ticks |-> 0]
  /\ env \in {[receiverUp |-> up, crashed |-> FALSE, crashes |-> 0, refusals |-> 0,
               rejects |-> 0, unknowns |-> 0] : up \in BOOLEAN}
  /\ run = [slot |-> "running", stopped |-> FALSE, reported |-> 0]

Drive ==
  \/ TakeInputs \/ SaveModelIntent \/ LateSaveModelIntent \/ AdmitModel
  \/ Sleep \/ Wake \/ ReadModel \/ Actions \/ Admission
  \/ \E i \in Acts : SaveToolIntent(i) \/ DispatchUnsaved(i) \/ LateSaveToolIntent(i)
                     \/ InvokeTool(i) \/ ReadTool(i) \/ MessageTool(i)
  \/ Dispatched \/ BatchDone \/ Decide \/ Candidate \/ Finish

Environment ==
  \/ ProduceModel \/ PushModel \/ ReceiverUp \/ CheckTime \/ Recover
  \/ \E i \in Acts : ProduceTool(i) \/ PushTool(i)

Next == Drive \/ Environment \/ Crash

Spec == Init /\ [][Next]_vars
Live == Spec /\ WF_vars(Drive) /\ WF_vars(Environment)

----------------------------------------------------------------------------
(* Properties *)

TypeOK ==
  /\ d.node \in Nodes /\ d.ckpt \in Nodes /\ d.step \in 0..MaxSteps
  /\ d.reply \in {"none", "admitted", "rejected"} /\ d.actions \in 0..MaxActions
  /\ d.barrier \in {"none", "open", "all-denied"}
  /\ d.endReason \in {"none", "complete", "guard", "failed"}
  /\ m.res \in Results /\ \A i \in Acts : acts[i].res \in Results
  /\ run.slot \in {"running", "failed", "free"}

(* P1 at most once: for one step, the Model receives at most one logical main call; for one
   action, the Tool receives at most one logical invocation. Crashes, lost answers and
   retries re-use the saved identity. *)
P1_AtMostOnce == m.logical <= 1 /\ \A i \in Acts : acts[i].logical <= 1

(* P2 the step limit: no step and no main request beyond maxRunSteps; rejected replies
   count; the guard end names the limit. *)
P2_StepBound == d.step <= MaxRunSteps /\ d.requests <= MaxRunSteps
P2_GuardAtLimit == d.endReason = "guard" => d.step = MaxRunSteps
P2_CompleteIsFinal == d.endReason = "complete" => (d.reply = "admitted" /\ d.actions = 0)

(* P3 failure is not silent: a stopped drive leaves the slot failed and one report. *)
P3_StopVisible == run.stopped => (run.slot = "failed" /\ run.reported = 1)
P3_ReportedOnce == run.reported <= 1

(* P4 the committed result wakes the waiting drive; a produced result is never lost. *)
P4_WakeOnReceive == (w.asleep /\ Readable) => w.woken
P4_NoResultLost == m.res /= "lost" /\ \A i \in Acts : acts[i].res /= "lost"

(* P5 an unavailable admission denies the whole batch: no intent, no invocation. *)
P5_UnavailableDeniesBatch ==
  d.admUnavail => \A i \in Acts : ~acts[i].intent /\ ~acts[i].sent

(* P6 the commits of one step are bounded by a constant plus the actions, plus one attach
   per crash and one redone candidate per refused commit (with FailTerminates a refusal goes
   back to F1). Waiting without progress adds nothing. *)
P6_CommitsBounded == d.commits <= CBase + CAct * d.actions + env.crashes + env.refusals

(* Liveness, under the fairness of `Live`. *)
L1_RunEnds == <>(d.node = "ended")
L2_AdmissionResolves == [](d.node = "A0" => <>(d.node /= "A0"))
L3_FailedRunEnds == [](env.refusals > 0 => <>(d.node = "ended"))

====
