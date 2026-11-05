------------------------------- MODULE Calls -------------------------------
(***************************************************************************)
(* The call port of @omne-harness/mcp (src/calls.ts, src/tasks.ts,         *)
(* src/internal/in-flight.ts, src/internal/task-table.ts): `invoke` and    *)
(* `continueWithInput` on the in-flight table, `cancel`, the caller's      *)
(* abort, and the four task operations on the task table, over an          *)
(* abstraction of the connection table that keeps only what the call port *)
(* reads: whether a key's connection is usable, its generation, that it    *)
(* can be lost, and that `closeAll` shuts the table.                       *)
(*                                                                         *)
(* The ports of the call port are: `gate` (the adoption read, the          *)
(* eligibility check, the settings and the catalog read, as one call),     *)
(* `ensure` (the connection table's build or reuse: `ok` makes the key's   *)
(* connection usable, `fail` is any refusal or an expired bound), `call`   *)
(* (the transport's `call`: `ok` sent a request, `fail` is `not-sent`),    *)
(* `answer` (the peer's answer to a sent request: `fail` is `no-answer`),  *)
(* `cancelReq` (`cancelRequest`) and `task` (one of the four task          *)
(* methods). Every port is asked through `ask`: a throw when it is called  *)
(* is an answer at once, the breach answer (`reject`). A port may hang.    *)
(* `lose` on the connection table is instantaneous here: the wait for the  *)
(* teardown it starts is the lifecycle model's, and P8 A1's.               *)
(*                                                                         *)
(* One event-loop turn is one external action followed by internal steps  *)
(* until no fiber can run (`Quiescent`). The internal steps of all fibers  *)
(* interleave in any order.                                                *)
(*                                                                         *)
(* The properties P9-P14 are stated in ../../SPEC.md "性质与证据"; the     *)
(* mapping to the explorer in ../../tests/model and to the code, the      *)
(* bounds and the TLC results are in ../README.md.                         *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, Sequences

CONSTANTS
  Keys,        \* keys of one holding: subsets of {"A", "B", "C", "D"}, see Tenant/Principal/Account
  Callers,     \* keys whose principal calls `invoke` and `continueWithInput`
  Invokes,     \* `invoke` calls per caller, each on the correlation key `c`
  Continues,   \* `continueWithInput` calls per caller, each on `c`
  Cancellers,  \* keys whose principal calls `cancel` on `c`
  Cancels,     \* `cancel` calls per canceller
  Taskers,     \* keys whose principal calls a task operation on the task `t1`
  Tasks,       \* task operations per tasker
  Aborts,      \* caller aborts in total, each on a waiting `invoke` or `continue`
  Drops,       \* losses of a usable connection in total
  CloseAlls,   \* `closeAll` calls: 0 or 1
  Peer,        \* what the peer answers to a sent call: "complete" or "task"
  Deviations,  \* what a port call may do besides its lawful answer
  Budget,      \* deviations per behavior
  Bugs,        \* deliberate faults of a negative control; {} is the code
  Observe      \* TRUE: `ev` names each step for traces; FALSE keeps it constant (liveness)

DeviationNames == {"fail", "reject", "throw"}
BugNames == {"send-despite-stop", "cancel-twice", "no-release-on-refuse", "task-any-account",
             "key-blind-principal", "task-blind-principal", "send-after-shut",
             "wait-answer-unstopped", "marksent-blind"}

ASSUME Keys \subseteq {"A", "B", "C", "D"}
ASSUME Callers \subseteq Keys /\ Cancellers \subseteq Keys /\ Taskers \subseteq Keys
ASSUME Deviations \subseteq DeviationNames /\ Bugs \subseteq BugNames
ASSUME {Invokes, Continues, Cancels, Tasks, Aborts, Drops, Budget} \subseteq Nat
ASSUME CloseAlls \in 0..1 /\ Peer \in {"complete", "task"} /\ Observe \in BOOLEAN

(* The owners of the keys, as in tests/model/explore.ts `KEY_OWNERS`: A and B *)
(* differ in the tenant, A and C in the peer account, A and D in the tenant  *)
(* with the same principal text.                                             *)
Tenant(k) == IF k \in {"A", "C"} THEN "home" ELSE "away"
Principal(k) == CASE k = "A" -> "alice" [] k = "B" -> "mallory" [] k = "C" -> "bob" [] OTHER -> "alice"
Account(k) == IF k = "C" THEN "other" ELSE "main"

(* The slot of the in-flight table a key's calls reserve: tenant, principal *)
(* and the one correlation key, so one slot per key; a key-blind table      *)
(* merges the keys of one tenant (the negative control).                   *)
Slot(k) == IF "key-blind-principal" \in Bugs THEN Tenant(k) ELSE k
TaskSlot(k) == IF "task-blind-principal" \in Bugs THEN Tenant(k) ELSE k
Slots == {Slot(k) : k \in Keys}
TaskSlots == {TaskSlot(k) : k \in Keys}

VARIABLE s
vars == <<s>>

AnswersOf(port) ==
  CASE port = "ensure" -> {"ok", "fail"}
    [] port = "cancelReq" -> {"ok", "reject"}
    [] OTHER -> {"ok", "fail", "reject"}

CallKinds == {"invoke", "continue"}
OpKinds == {"invoke", "continue", "cancel", "task"}

NotSentResults == {"in-use", "refused", "cancelled"}
SentResults == {"sent", "sent-unknown", "abandoned"}

NoEntry == [phase |-> "free", cancelled |-> FALSE, stopFired |-> FALSE, gen |-> 0, fib |-> 0]
NoTask == [account |-> "none", owner |-> "none"]

(* One async chain: a call, a cancel, a task operation. `pc` is where it   *)
(* is; `wc` the call it waits for; `t` its bound; `req` the request it     *)
(* sent; `issued` the generation a continuation was issued at; `ck` the   *)
(* key of the connection a task operation sends on; `target` the entry a  *)
(* cancel acted on.                                                        *)
NewFiber(kind, pc, k) ==
  [kind |-> kind, pc |-> pc, key |-> k, gen |-> 0, t |-> 0, wc |-> 0, req |-> 0,
   res |-> "none", aborted |-> FALSE, sends |-> 0, sentOk |-> 0, stopEarly |-> FALSE,
   afterShut |-> FALSE, cancels |-> 0, issued |-> 0, rec |-> NoTask, ck |-> "none",
   target |-> 0]

Init ==
  s = [conn |-> [k \in Keys |-> [st |-> "none", gen |-> 0]],
       shut |-> FALSE,
       inflight |-> [x \in Slots |-> NoEntry],
       tasks |-> [x \in TaskSlots |-> NoTask],
       fib |-> <<>>, calls |-> <<>>, reqs |-> <<>>,
       timers |-> <<>>, nTimers |-> 0, fired |-> {},
       left |-> [inv |-> [k \in Keys |-> IF k \in Callers THEN Invokes ELSE 0],
                 cont |-> [k \in Keys |-> IF k \in Callers THEN Continues ELSE 0],
                 canc |-> [k \in Keys |-> IF k \in Cancellers THEN Cancels ELSE 0],
                 task |-> [k \in Keys |-> IF k \in Taskers THEN Tasks ELSE 0],
                 ab |-> Aborts, drop |-> Drops, ca |-> CloseAlls, dev |-> Budget],
       bad |-> [sendAfterShut |-> FALSE],
       ev |-> "init"]

View == [s EXCEPT !.ev = ""]
Ev(x, text) == IF Observe THEN [x EXCEPT !.ev = text] ELSE x

-----------------------------------------------------------------------------
(* State transformers. Each takes a state record and returns one.          *)

NewTimer(x) == [x EXCEPT !.nTimers = @ + 1, !.timers = Append(@, x.nTimers + 1)]

Fired(x, c) == x.calls[c].bound # 0 /\ x.calls[c].bound \in x.fired

(* What asking a port records before it answers: P13's history, the sends *)
(* of the fiber.                                                            *)
Count(x, i, port) ==
  IF port = "call"
  THEN [x EXCEPT !.fib[i].sends = @ + 1, !.bad.sendAfterShut = @ \/ x.shut]
  ELSE x

(* The outcomes of asking a port: a pending call, or, when the failure    *)
(* model allows a throw, a call answered at once with the breach answer.  *)
CallOutcomes(x, i, port, bound) ==
  LET counted == Count(x, i, port)
      c == Len(x.calls) + 1
      call == [port |-> port, key |-> x.fib[i].key, st |-> "pending", ans |-> "none",
               owner |-> i, bound |-> bound]
      thrown == [call EXCEPT !.st = "answered", !.ans = "reject"]
  IN {[st |-> [counted EXCEPT !.calls = Append(@, call)], c |-> c]}
     \cup (IF "throw" \in Deviations /\ x.left.dev > 0 /\ port # "ensure"
           THEN {[st |-> Ev([counted EXCEPT !.calls = Append(@, thrown), !.left.dev = @ - 1],
                            "throw " \o port),
                  c |-> c]}
           ELSE {})

(* `ask`: fiber `i` waits at `pc` for the answer of a call to `port`. *)
Ask(x, i, port, bound, pc) ==
  {[o.st EXCEPT !.fib[i].pc = pc, !.fib[i].wc = o.c] : o \in CallOutcomes(x, i, port, bound)}

Done(x, i, res) == [x EXCEPT !.fib[i].pc = "done", !.fib[i].res = res]

(* `release`: a reserved place is withdrawn; a sent or ended one stays. *)
Release(x, i) ==
  LET slot == Slot(x.fib[i].key)
  IN IF x.inflight[slot].phase = "reserved" /\ x.inflight[slot].fib = i
        /\ "no-release-on-refuse" \notin Bugs
     THEN [x EXCEPT !.inflight[slot] = NoEntry]
     ELSE x

(* `markEnded`: the place ends; the key is free again. *)
MarkEnded(x, i) == [x EXCEPT !.inflight[Slot(x.fib[i].key)] = [NoEntry EXCEPT !.phase = "ended"]]

(* `lose` on the current generation: the connection is gone at once. *)
Lose(x, k, g) ==
  IF x.conn[k].st = "ready" /\ x.conn[k].gen = g
  THEN [x EXCEPT !.conn[k].st = "none"]
  ELSE x

(* The stop signal of a call: the caller's abort, or `cancel` on its place. *)
Stopped(x, i) ==
  LET f == x.fib[i]
      en == x.inflight[Slot(f.key)]
  IN f.aborted \/ (en.fib = i /\ en.stopFired)

(* Step 9 of MC-16 before the send, and the end of a cancelled call. *)
Cancelled(x, i) == Done(MarkEnded(x, i), i, "cancelled")

(* Step 12: the peer is told once; the answer is not waited for. *)
Abandon(x, i) ==
  LET r == x.fib[i].req
      x1 == [MarkEnded(x, i) EXCEPT !.reqs[r].cancels = @ + 1, !.fib[i].cancels = @ + 1]
  IN Ask(x1, i, "cancelReq", 0, "abandonW")

-----------------------------------------------------------------------------
(* Which fibers can run.                                                   *)

Answered(f) == s.calls[f.wc].st = "answered"

Runnable(i) ==
  LET f == s.fib[i]
  IN CASE f.pc = "done" -> FALSE
       [] f.pc \in {"start", "lookup"} -> TRUE
       [] f.pc \in {"gateW", "callW", "abandonW", "tgateW", "tensW"} -> Answered(f)
       [] f.pc = "ensW" -> Answered(f) \/ f.aborted
       [] f.pc = "ansW" -> Answered(f) \/ (Stopped(s, i) /\ "wait-answer-unstopped" \notin Bugs)
       [] f.pc = "taskW" -> Answered(f) \/ Fired(s, f.wc)
       [] OTHER -> FALSE

Quiescent == \A i \in DOMAIN s.fib : ~Runnable(i)

-----------------------------------------------------------------------------
(* Internal steps: `invoke` and `continueWithInput` (calls.ts `perform`,   *)
(* `sendOn`, `abandon`).                                                   *)

(* The call left on the connection (`markSent`): the place is sent, or it *)
(* was cancelled while reserved and the call is abandoned (MC-16 step 11). *)
MarkSent(x, i) ==
  LET f == x.fib[i]
      slot == Slot(f.key)
  IN IF x.inflight[slot].cancelled /\ "marksent-blind" \notin Bugs
     THEN Abandon(x, i)
     ELSE Ask([x EXCEPT !.inflight[slot].phase = "sent", !.inflight[slot].gen = f.gen],
              i, "answer", 0, "ansW")

(* After `ensure` answered `ok`: the continuation's generation, the stop  *)
(* signal, then the send (MC-16 steps 8-10).                                *)
AfterEnsure(x, i) ==
  LET f == x.fib[i]
      x1 == [x EXCEPT !.fib[i].gen = x.conn[f.key].gen]
  IN IF f.kind = "continue" /\ x.conn[f.key].gen # f.issued
     THEN {Done(Release(x1, i), i, "refused")}
     ELSE IF Stopped(x1, i) /\ "send-despite-stop" \notin Bugs
     THEN {Cancelled(x1, i)}
     ELSE Ask(x1, i, "call", 0, "callW")

CallStep(i) ==
  LET f == s.fib[i]
      k == f.key
      slot == Slot(k)
      ans == s.calls[f.wc].ans
  IN /\ f.kind \in CallKinds /\ Runnable(i)
     /\ CASE f.pc = "start" ->
             IF s.inflight[slot].phase \in {"reserved", "sent"}
             THEN s' = Done(s, i, "in-use")
             ELSE \E y \in Ask([s EXCEPT !.inflight[slot] = [NoEntry EXCEPT !.phase = "reserved",
                                                                              !.fib = i]],
                               i, "gate", 0, "gateW") : s' = y
          [] f.pc = "gateW" ->
             IF ans # "ok" THEN s' = Done(Release(s, i), i, "refused")
             ELSE IF f.kind = "continue"
                     /\ (s.conn[k].st # "ready" \/ s.conn[k].gen # f.issued)
             THEN s' = Done(Release(s, i), i, "refused")
             ELSE IF Stopped(s, i) THEN s' = Cancelled(s, i)
             ELSE \E y \in Ask(s, i, "ensure", 0, "ensW") : s' = y
          [] f.pc = "ensW" ->
             (* `within(ensure, signal)`: the caller's abort ends the wait; the build *)
             (* goes on for the other callers (the pending call stays).              *)
             \/ /\ f.aborted /\ s' = Cancelled(s, i)
             \/ /\ Answered(f)
                /\ IF ans = "ok" THEN \E y \in AfterEnsure(s, i) : s' = y
                   ELSE s' = Done(Release(s, i), i, "refused")
          [] f.pc = "callW" ->
             IF ans = "reject" THEN s' = Done(MarkEnded(s, i), i, "abandoned")
             ELSE IF ans = "fail"
             THEN IF Stopped(s, i) THEN s' = Cancelled(s, i)
                  ELSE s' = Done(Release(Lose(s, k, f.gen), i), i, "refused")
             ELSE LET r == Len(s.reqs) + 1
                      x1 == [s EXCEPT !.reqs = Append(@, [fib |-> i, cancels |-> 0]),
                                      !.fib[i].req = r, !.fib[i].sentOk = @ + 1]
                  IN \E y \in MarkSent(x1, i) : s' = y
          [] f.pc = "ansW" ->
             \/ /\ Stopped(s, i) /\ "wait-answer-unstopped" \notin Bugs
                /\ \E y \in Abandon(s, i) : s' = y
             \/ /\ Answered(f)
                /\ IF ans = "ok"
                   THEN LET x1 == IF Peer = "task"
                                  THEN [s EXCEPT !.tasks[TaskSlot(k)] =
                                                   [account |-> Account(k), owner |-> k]]
                                  ELSE s
                        IN s' = Done(MarkEnded(x1, i), i, "sent")
                   ELSE IF ans = "fail"
                   THEN s' = Done(MarkEnded(Lose(s, k, f.gen), i), i, "sent-unknown")
                   ELSE s' = Done(MarkEnded(s, i), i, "abandoned")
          [] f.pc = "abandonW" ->
             IF "cancel-twice" \in Bugs /\ f.cancels = 1
             THEN \E y \in Abandon(s, i) : s' = y
             ELSE s' = Done(s, i, "abandoned")

-----------------------------------------------------------------------------
(* Internal steps: the task operations (tasks.ts `request`, `connectionOf`). *)

(* The usable connection of the tenant's holding on the task's account:   *)
(* reused with no port asked.                                              *)
Reusable(x, k, rec) ==
  {q \in Keys : Tenant(q) = Tenant(k) /\ x.conn[q].st = "ready"
                /\ (Account(q) = rec.account \/ "task-any-account" \in Bugs)}

(* The task request under the task bound, on the connection of key `q`. *)
SendTask(x, i, q) ==
  LET x1 == NewTimer([x EXCEPT !.fib[i].ck = q, !.fib[i].gen = x.conn[q].gen])
  IN Ask([x1 EXCEPT !.fib[i].t = x1.nTimers], i, "task", x1.nTimers, "taskW")

TaskStep(i) ==
  LET f == s.fib[i]
      k == f.key
      ans == s.calls[f.wc].ans
  IN /\ f.kind = "task" /\ Runnable(i)
     /\ CASE f.pc = "lookup" ->
             LET rec == s.tasks[TaskSlot(k)]
             IN IF rec.account = "none" THEN s' = Done(s, i, "unknown")
                ELSE LET x1 == [s EXCEPT !.fib[i].rec = rec]
                     IN IF Reusable(x1, k, rec) # {}
                        THEN \E q \in Reusable(x1, k, rec) : \E y \in SendTask(x1, i, q) : s' = y
                        ELSE IF s.shut THEN s' = Done(x1, i, "no-connection")
                        ELSE \E y \in Ask(x1, i, "gate", 0, "tgateW") : s' = y
          [] f.pc = "tgateW" ->
             IF ans # "ok" THEN s' = Done(s, i, IF ans = "reject" THEN "unknown" ELSE "no-connection")
             ELSE IF Account(k) # f.rec.account THEN s' = Done(s, i, "no-connection")
             ELSE \E y \in Ask(s, i, "ensure", 0, "tensW") : s' = y
          [] f.pc = "tensW" ->
             IF ans = "ok" THEN \E y \in SendTask(s, i, k) : s' = y
             ELSE s' = Done(s, i, "no-connection")
          [] f.pc = "taskW" ->
             (* `within(request, bound)`: the bound first is `no-answer` (`abandoned`). *)
             \/ /\ Fired(s, f.wc) /\ s' = Done(s, i, "abandoned")
             \/ /\ Answered(f)
                /\ s' = IF ans = "ok" THEN Done(s, i, "ok")
                        ELSE IF ans = "fail" THEN Done(Lose(s, f.ck, f.gen), i, "fail")
                        ELSE Done(s, i, "fail")

(* One internal step: the synchronous part of a fiber up to its next await. *)
Internal == \E i \in DOMAIN s.fib : CallStep(i) \/ TaskStep(i)

-----------------------------------------------------------------------------
(* External actions: one per event-loop turn, taken only at rest.          *)

AddFiber(x, f) == [x EXCEPT !.fib = Append(@, f)]

StartCall(kind, k) ==
  LET x0 == Ev(s, kind \o " " \o k)
      f == [NewFiber(kind, "start", k) EXCEPT
              !.afterShut = s.shut,
              !.issued = IF s.conn[k].st = "ready" THEN s.conn[k].gen ELSE 0]
  IN AddFiber(x0, f)

Invoke(k) ==
  /\ Quiescent /\ s.left.inv[k] > 0
  /\ s' = [StartCall("invoke", k) EXCEPT !.left.inv[k] = @ - 1]

Continue(k) ==
  /\ Quiescent /\ s.left.cont[k] > 0
  /\ s' = [StartCall("continue", k) EXCEPT !.left.cont[k] = @ - 1]

(* `cancel` by the principal of `k` on `c`: the place of its slot (in-flight.ts `cancel`). *)
Cancel(k) ==
  /\ Quiescent /\ s.left.canc[k] > 0
  /\ LET slot == Slot(k)
         en == s.inflight[slot]
         owner == IF en.fib = 0 THEN "none" ELSE s.fib[en.fib].key
         x0 == Ev([s EXCEPT !.left.canc[k] = @ - 1], "cancel " \o k)
         f == NewFiber("cancel", "done", k)
     IN CASE en.phase = "free" -> s' = AddFiber(x0, [f EXCEPT !.res = "unknown"])
          [] en.phase = "ended" -> s' = AddFiber(x0, [f EXCEPT !.res = "no-call-in-flight"])
          [] en.phase = "reserved" ->
               s' = AddFiber([x0 EXCEPT !.inflight[slot].cancelled = TRUE,
                                        !.inflight[slot].stopFired = TRUE,
                                        !.fib[en.fib].stopEarly = @ \/ s.fib[en.fib].sends = 0],
                             [f EXCEPT !.res = "signalled", !.target = en.fib])
          [] OTHER ->
               IF s.conn[owner].st = "ready" /\ s.conn[owner].gen = en.gen
               THEN s' = AddFiber([x0 EXCEPT !.inflight[slot].stopFired = TRUE],
                                  [f EXCEPT !.res = "signalled", !.target = en.fib])
               ELSE s' = AddFiber(x0, [f EXCEPT !.res = "unknown"])

(* The caller's signal fires for a waiting call. *)
Abort(i) ==
  /\ Quiescent /\ s.left.ab > 0
  /\ s.fib[i].kind \in CallKinds /\ s.fib[i].pc # "done" /\ ~s.fib[i].aborted
  /\ s' = Ev([s EXCEPT !.left.ab = @ - 1, !.fib[i].aborted = TRUE,
                       !.fib[i].stopEarly = @ \/ s.fib[i].sends = 0],
             "abort")

TaskOp(k) ==
  /\ Quiescent /\ s.left.task[k] > 0
  /\ s' = AddFiber(Ev([s EXCEPT !.left.task[k] = @ - 1], "task " \o k),
                   NewFiber("task", "lookup", k))

(* A transport that found the connection gone: `lose` on the current generation. *)
Drop(k) ==
  /\ Quiescent /\ s.left.drop > 0 /\ s.conn[k].st = "ready"
  /\ s' = Ev([s EXCEPT !.left.drop = @ - 1, !.conn[k].st = "none"], "drop " \o k)

(* `closeAll`: the table is shut and every connection closed; what the   *)
(* close waits for is the lifecycle model's.                               *)
CloseAll ==
  /\ Quiescent /\ s.left.ca > 0
  /\ s' = Ev([s EXCEPT !.left.ca = @ - 1, !.shut = TRUE,
                       !.conn = [k \in Keys |-> [s.conn[k] EXCEPT !.st = "none"]]],
             "closeAll")

Fire ==
  /\ Quiescent /\ s.timers # <<>>
  /\ s' = Ev([s EXCEPT !.fired = @ \cup {Head(s.timers)}, !.timers = Tail(@)], "fire")

(* `ensure` answering `ok` makes the key's connection usable: a build gives *)
(* the next generation, a reuse keeps it. After the shutdown nothing       *)
(* connects (P4, K3), unless the negative control lets it.                 *)
EnsureOk(x, k) ==
  [x EXCEPT !.conn[k] = IF x.conn[k].st = "ready" THEN x.conn[k]
                        ELSE [st |-> "ready", gen |-> x.conn[k].gen + 1]]

(* The lawful answer of a pending call: what a port that honours its      *)
(* contract gives. `ensure` after the shutdown refuses.                    *)
Lawful(c) ==
  IF s.calls[c].port = "ensure" /\ s.shut /\ "send-after-shut" \notin Bugs THEN "fail" ELSE "ok"

Answer(c, a) ==
  /\ Quiescent /\ s.calls[c].st = "pending"
  /\ a \in AnswersOf(s.calls[c].port)
  /\ a = Lawful(c) \/ (a \in Deviations /\ s.left.dev > 0)
     \/ (s.calls[c].port = "ensure" /\ a = "fail")
  /\ LET x0 == Ev([s EXCEPT !.calls[c].st = "answered", !.calls[c].ans = a,
                             !.left.dev = IF a = Lawful(c) \/ s.calls[c].port = "ensure"
                                          THEN @ ELSE @ - 1],
                  "answer " \o s.calls[c].port \o " " \o a)
     IN s' = IF s.calls[c].port = "ensure" /\ a = "ok" THEN EnsureOk(x0, s.calls[c].key) ELSE x0

External ==
  \/ \E k \in Keys : Invoke(k) \/ Continue(k) \/ Cancel(k) \/ TaskOp(k) \/ Drop(k)
  \/ \E i \in DOMAIN s.fib : Abort(i)
  \/ CloseAll
  \/ Fire
  \/ \E c \in DOMAIN s.calls : \E a \in AnswersOf(s.calls[c].port) : Answer(c, a)

Next == Internal \/ External

Spec == Init /\ [][Next]_vars

(* The peer may never answer a request whose stop signal fired: the call   *)
(* port told it to cancel, or will. Every other port answers eventually.   *)
Dropped(c) == s.calls[c].port = "answer" /\ Stopped(s, s.calls[c].owner)

(* P14 T1 needs the environment to answer: every bound fires, every call   *)
(* but a dropped one is answered lawfully, every fiber that can run runs.  *)
LiveSpec ==
  /\ Spec
  /\ WF_vars(Internal)
  /\ WF_vars(Fire)
  /\ WF_vars(\E c \in DOMAIN s.calls : ~Dropped(c) /\ Answer(c, Lawful(c)))

-----------------------------------------------------------------------------
(* Properties (SPEC.md "性质与证据").                                       *)

CallFibers == {i \in DOMAIN s.fib : s.fib[i].kind \in CallKinds}
DoneCalls == {i \in CallFibers : s.fib[i].pc = "done"}

AtRest == Quiescent /\ s.timers = <<>> /\ \A c \in DOMAIN s.calls : s.calls[c].st = "answered"

(* P9: a call that answers "not sent" sent nothing; a call that answers   *)
(* "sent" made one `transport.call`; a stop before any `transport.call`   *)
(* leaves it unsent.                                                       *)
P9_NotSentNotSent ==
  \A i \in DoneCalls :
    LET f == s.fib[i]
    IN /\ f.res \in NotSentResults => f.sentOk = 0
       /\ f.res \in SentResults => f.sends = 1
       /\ f.stopEarly => f.sentOk = 0

(* P10: `cancelRequest` at most once per request, and the call that made it *)
(* answers `abandoned`.                                                     *)
P10_CancelOnce ==
  \A r \in DOMAIN s.reqs :
    /\ s.reqs[r].cancels <= 1
    /\ s.reqs[r].cancels = 1 => s.fib[s.reqs[r].fib].res \in {"none", "abandoned"}

(* P11: a reserved or sent place belongs to a call still waiting; a call  *)
(* that answered holds no place; at rest no place is held.                 *)
P11_ReservationEnded ==
  /\ \A x \in Slots :
       s.inflight[x].phase \in {"reserved", "sent"} => s.fib[s.inflight[x].fib].pc # "done"
  /\ AtRest => \A x \in Slots : s.inflight[x].phase \notin {"reserved", "sent"}

(* P12: a cancel acts only on a place of its own tenant and principal; a   *)
(* task operation reads only its own principal's task and sends only on a  *)
(* connection of the task's tenant and peer account.                       *)
P12_Isolation ==
  \A i \in DOMAIN s.fib :
    LET f == s.fib[i]
    IN /\ f.kind = "cancel" /\ f.target # 0 => s.fib[f.target].key = f.key
       /\ f.kind = "task" /\ f.rec.account # "none" => f.rec.owner = f.key
       /\ f.kind = "task" /\ f.ck # "none" =>
            Tenant(f.ck) = Tenant(f.key) /\ Account(f.ck) = f.rec.account

(* P13: after `closeAll`, no `transport.call`; a call started after it is not sent. *)
P13_NoSendAfterShut ==
  /\ ~s.bad.sendAfterShut
  /\ \A i \in DoneCalls : s.fib[i].afterShut => s.fib[i].res \in NotSentResults

(* P14 T1 (liveness, under LiveSpec): every call and task operation answers. *)
AllCallsDone == \A i \in DOMAIN s.fib : s.fib[i].kind \in OpKinds => s.fib[i].pc = "done"
P14_EveryCallAnswers == <>[]AllCallsDone

(* P14 T2 (the global form of P8 T2, a probe): once a stop signal fired  *)
(* for a call and every bound fired, the call has answered, whatever the  *)
(* ports still pending do. The code waits for the gate, the transport's   *)
(* `call` and `cancelRequest` with no bound: expected to fail.            *)
P14_BoundedAfterStop ==
  ~(/\ Quiescent /\ s.timers = <<>>
    /\ \E i \in CallFibers : s.fib[i].pc # "done" /\ Stopped(s, i))

=============================================================================
