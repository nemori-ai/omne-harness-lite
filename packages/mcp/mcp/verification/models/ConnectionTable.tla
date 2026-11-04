--------------------------- MODULE ConnectionTable ---------------------------
(***************************************************************************)
(* The connection table of @omne-harness/mcp as implemented at 1160e92c8  *)
(* (src/internal/table.ts, build.ts, teardown.ts, late.ts, entry.ts), for *)
(* stdio endpoints with a process credential: the five resources of an    *)
(* entry (transport, process, credential handle, lingering processes,     *)
(* landings in flight), `ensure` with its critical section, the build,    *)
(* the three-step teardown, `release`, `closeAll`, `lose`, the late paths *)
(* and the bounds. The ports may answer, fail, reject, throw when called, *)
(* hang, or answer after their bound fired.                                *)
(*                                                                         *)
(* One JavaScript event-loop turn is one external action (a client call,   *)
(* a port answer, a bound firing) followed by internal steps until no      *)
(* fiber can run (`Quiescent`). An internal step is the synchronous part   *)
(* of one async function between two awaits. The internal steps of one     *)
(* key's fibers interleave in any order, a superset of the microtask order; *)
(* across keys they run in a fixed key order (`MayRun`).                    *)
(*                                                                         *)
(* The properties P1-P8 are stated in ../../SPEC.md "性质与证据"; the      *)
(* mapping to the explorer in ../../tests/model and to the code, the       *)
(* bounds and the TLC results are in ../README.md.                         *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, Sequences

CONSTANTS
  Keys,        \* connection keys; one tenant (and one holding) each
  Ensures,     \* `ensure` calls per key
  Releases,    \* `release` calls per key
  CloseAlls,   \* `closeAll` calls: 0 or 1
  Loses,       \* `lose` calls in total, each on the answer of an earlier `ensure`
  Deviations,  \* what a port call may do besides its lawful answer
  Budget,      \* deviations per behavior
  Bugs,        \* deliberate faults of a negative control; {} is the code at 1160e92c8
  Observe      \* TRUE: `ev` names each step for traces; FALSE keeps it constant (liveness)

DeviationNames == {"fail", "reject", "unconfirmed", "throw"}
BugNames == {"no-absorb-close", "forget-open", "no-shut"}

ASSUME Deviations \subseteq DeviationNames /\ Bugs \subseteq BugNames
ASSUME {Ensures, Releases, Loses, Budget} \subseteq Nat /\ CloseAlls \in 0..1
ASSUME Observe \in BOOLEAN

VARIABLE s
vars == <<s>>

Max(a, b) == IF a > b THEN a ELSE b

AnswersOf(port) ==
  CASE port = "stop" -> {"ok", "unconfirmed", "reject"}
    [] port \in {"close", "release"} -> {"ok", "reject"}
    [] OTHER -> {"ok", "fail", "reject"}

OpKinds == {"ensure", "release", "closeAll", "lose"}

(* An entry of the table: the Connection aggregate and the five resources. *)
NewEntry(k, g) ==
  [key |-> k, st |-> "none", gen |-> g, tr |-> 0, pr |-> 0, cr |-> 0,
   ling |-> {}, lands |-> {}, build |-> 0, tear |-> 0, close |-> 0]

HoldsNothing(en) ==
  /\ en.tr = 0 /\ en.pr = 0 /\ en.cr = 0 /\ en.ling = {} /\ en.lands = {}

Forgettable(en) == (en.st = "closed" \/ "forget-open" \in Bugs) /\ HoldsNothing(en)

Usable(en) == en.st = "ready" /\ en.tr # 0

(* One async chain: a client operation, a build, a teardown, a close, a  *)
(* late path. `pc` is where it is; `wc`, `wf`, `wfs`, `wcs` what it waits *)
(* for; `t` its bound.                                                     *)
NewFiber(kind, pc, k, e) ==
  [kind |-> kind, pc |-> pc, key |-> k, ent |-> e, gen |-> 0, t |-> 0,
   wc |-> 0, wf |-> 0, wfs |-> {}, wcs |-> {}, res |-> "none", cur |-> 0,
   todo |-> {}, land |-> 0, ab |-> FALSE, late |-> "none"]

Init ==
  s = [ents |-> <<>>, tbl |-> [k \in Keys |-> 0], lastGen |-> [k \in Keys |-> 0],
       shut |-> FALSE, closeAsked |-> FALSE, deleted |-> {}, lands |-> <<>>,
       fib |-> <<>>, turnQ |-> [k \in Keys |-> <<>>], turnBusy |-> [k \in Keys |-> 0],
       calls |-> <<>>, timers |-> <<>>, nTimers |-> 0, fired |-> {},
       hs |-> <<>>, ps |-> <<>>, ts |-> <<>>,
       left |-> [ens |-> [k \in Keys |-> Ensures], rel |-> [k \in Keys |-> Releases],
                 ca |-> CloseAlls, lose |-> Loses, dev |-> Budget],
       bad |-> [shutConnect |-> FALSE, unhandled |-> {}, internal |-> FALSE],
       ev |-> "init"]

(* `ev` names the last external action or synchronous throw, for traces only. *)
(* No action reads it. Safety configurations leave it out of the fingerprint  *)
(* (`VIEW View`); liveness configurations keep it constant (`Observe = FALSE`). *)
View == [s EXCEPT !.ev = ""]
Ev(x, text) == IF Observe THEN [x EXCEPT !.ev = text] ELSE x

-----------------------------------------------------------------------------
(* State transformers. Each takes a state record and returns one.          *)

NewTimer(x) == [x EXCEPT !.nTimers = @ + 1, !.timers = Append(@, x.nTimers + 1)]

Fired(x, c) == x.calls[c].bound # 0 /\ x.calls[c].bound \in x.fired

(* The wait for a bounded call ended because its bound fired first. *)
Aborted(x, c) == Fired(x, c) /\ (x.calls[c].st = "pending" \/ x.calls[c].late)

(* What invoking a port records before it answers: the call counts of the *)
(* teardown ports, and P4's history.                                       *)
Count(x, port, subj) ==
  CASE port = "close" -> [x EXCEPT !.ts[subj].closes = @ + 1]
    [] port = "stop" -> [x EXCEPT !.ps[subj].stops = @ + 1]
    [] port = "release" -> [x EXCEPT !.hs[subj].rel = @ + 1]
    [] port \in {"start", "open"} /\ x.closeAsked -> [x EXCEPT !.bad.shutConnect = TRUE]
    [] OTHER -> x

(* The outcomes of invoking a port: a pending call, or a synchronous throw *)
(* when the failure model allows one. `c` is the new call, 0 on a throw.   *)
CallOutcomes(x, port, subj, k, g, bound, owner) ==
  LET counted == Count(x, port, subj)
      call == [port |-> port, subj |-> subj, key |-> k, gen |-> g, bound |-> bound,
               st |-> "pending", ans |-> "none", late |-> FALSE, made |-> 0, owner |-> owner]
  IN {[st |-> [counted EXCEPT !.calls = Append(@, call)], thr |-> FALSE, c |-> Len(x.calls) + 1]}
     \cup (IF "throw" \in Deviations /\ x.left.dev > 0
           THEN {[st |-> Ev([counted EXCEPT !.left.dev = @ - 1], "throw " \o port),
                  thr |-> TRUE, c |-> 0]}
           ELSE {})

AddFiber(x, f) == [x EXCEPT !.fib = Append(@, f)]

(* `teardown(entry)`: the entry's teardown in flight, or a new one. *)
Teardown(x, e) ==
  IF x.ents[e].tear # 0 THEN [st |-> x, f |-> x.ents[e].tear]
  ELSE LET j == Len(x.fib) + 1
       IN [st |-> [AddFiber(x, NewFiber("tear", "tclose", x.ents[e].key, e))
                   EXCEPT !.ents[e].tear = j],
           f |-> j]

(* `closeEntry(entry)`: the entry's close in flight, or a new one. *)
CloseEntry(x, e) ==
  IF x.ents[e].close # 0 THEN [st |-> x, f |-> x.ents[e].close]
  ELSE LET j == Len(x.fib) + 1
       IN [st |-> [AddFiber(x, NewFiber("closeEnt", "waitBuild", x.ents[e].key, e))
                   EXCEPT !.ents[e].close = j],
           f |-> j]

(* `forget(entry)`: the one place an entry leaves the table. *)
Forget(x, e) ==
  LET k == x.ents[e].key
  IN IF x.tbl[k] = e /\ Forgettable(x.ents[e])
     THEN [x EXCEPT !.tbl[k] = 0, !.lastGen[k] = Max(@, x.ents[e].gen),
                    !.deleted = @ \cup {e}]
     ELSE x

(* `recordStop`: a process confirmed short of the tree stays lingering. *)
RecordStop(x, e, p, tree) ==
  [x EXCEPT !.ents[e].pr = IF @ = p THEN 0 ELSE @,
            !.ents[e].ling = (@ \ {p}) \cup (IF tree THEN {} ELSE {p})]

Done(x, i, res) == [x EXCEPT !.fib[i].pc = "done", !.fib[i].res = res]

Leave(x, k) == [x EXCEPT !.turnBusy[k] = 0]

SpawnLate(x, kind, e, l, c) ==
  LET j == Len(x.fib) + 1
  IN [AddFiber(x, [NewFiber("late", "lateW", x.ents[e].key, e)
                   EXCEPT !.late = kind, !.wc = c, !.land = l])
      EXCEPT !.calls[c].owner = j]

Unhandled(x, i, why) ==
  [x EXCEPT !.fib[i].pc = "unhandled", !.bad.unhandled = @ \cup {why}]

-----------------------------------------------------------------------------
(* Which fibers can run.                                                   *)

BoundedCallPcs == {"readW", "acqW", "startW", "openW", "discW"}
CallPcs == {"markW", "tcloseW", "tstopW", "trelW", "lateW", "lstopW", "lrelW", "lcloseW"}
FiberPcs == {"joinedW", "pretearW", "failTearW", "shutTearW", "catchTearW", "buildW",
             "ctearW", "relOpW", "loseTearW"}
InertPcs == {"queued", "done", "unhandled"}

Runnable(i) ==
  LET f == s.fib[i]
  IN CASE f.pc \in InertPcs -> FALSE
       [] f.pc \in BoundedCallPcs -> s.calls[f.wc].st = "answered" \/ Fired(s, f.wc)
       [] f.pc \in CallPcs -> s.calls[f.wc].st = "answered"
       [] f.pc \in FiberPcs -> s.fib[f.wf].pc = "done"
       [] f.pc = "blockedW" -> s.fib[f.wf].pc = "done" \/ f.t \in s.fired
       [] f.pc = "awaitClosed" -> \A j \in f.wfs : s.fib[j].pc = "done"
       [] f.pc = "awaitAband" -> f.ab \/ \A c \in f.wcs : s.calls[c].st = "answered"
       [] OTHER -> TRUE

TurnFree(k) == s.turnBusy[k] = 0 /\ s.turnQ[k] # <<>>

Quiescent ==
  /\ \A i \in DOMAIN s.fib : ~Runnable(i)
  /\ \A k \in Keys : ~TurnFree(k)

(* Partial-order reduction across keys. The fibers of two keys share no  *)
(* entry, turn or resource, so within one event-loop turn the internal    *)
(* steps of the lower-ranked key run first; every interleaving within one *)
(* key is kept. `closeAll`, which spans the keys, ranks first. A step     *)
(* still chooses freely whether a call throws, so the shared deviation    *)
(* budget reaches every key.                                               *)
KeyOrder ==
  CHOOSE q \in [1..Cardinality(Keys) -> Keys] : \A i, j \in DOMAIN q : i # j => q[i] # q[j]
Rank(k) == IF k \in Keys THEN CHOOSE i \in DOMAIN KeyOrder : KeyOrder[i] = k ELSE 0
MayRun(k) ==
  /\ \A j \in DOMAIN s.fib : Runnable(j) => Rank(s.fib[j].key) >= Rank(k)
  /\ \A q \in Keys : TurnFree(q) => Rank(q) >= Rank(k)

-----------------------------------------------------------------------------
(* Internal steps: `ensure` (table.ts `ensure`, `begin`).                  *)

TurnNext(k) ==
  /\ TurnFree(k) /\ MayRun(k)
  /\ s' = [s EXCEPT !.turnBusy[k] = Head(s.turnQ[k]), !.turnQ[k] = Tail(@),
                    !.fib[Head(s.turnQ[k])].pc = "begin"]

(* `entryOf`, then the build started: the entry of the key is this one. *)
StartBuild(x, k, e) ==
  LET en == IF e = 0 THEN Len(x.ents) + 1 ELSE e
      x1 == IF e = 0
            THEN [x EXCEPT !.ents = Append(@, NewEntry(k, x.lastGen[k])), !.tbl[k] = en]
            ELSE IF x.ents[e].st = "closed"
                 THEN [x EXCEPT !.ents[e].st = "none", !.ents[e].gen = Max(@, x.lastGen[k])]
                 ELSE x
      b == Len(x1.fib) + 1
  IN [st |-> [AddFiber(x1, NewFiber("build", "pretear", k, en)) EXCEPT !.ents[en].build = b],
      b |-> b]

EnsureStep(i) ==
  LET f == s.fib[i]
      k == f.key
      e == s.tbl[k]
  IN /\ f.kind = "ensure" /\ Runnable(i) /\ MayRun(f.key)
     /\ CASE f.pc = "begin" ->
             IF s.shut THEN s' = Leave(Done(s, i, "refused"), k)
             ELSE \E o \in CallOutcomes(s, "adoption", k, k, 0, f.t, i) :
                    IF o.thr THEN s' = Leave(Done(o.st, i, "err"), k)
                    ELSE s' = [o.st EXCEPT !.fib[i].pc = "readW", !.fib[i].wc = o.c]
          [] f.pc = "readW" ->
             IF Aborted(s, f.wc) \/ s.calls[f.wc].ans # "ok"
             THEN s' = Leave(Done(s, i, "refused"), k)
             ELSE s' = [s EXCEPT !.fib[i].pc = "loop"]
          [] f.pc = "loop" ->
             IF s.shut THEN s' = Leave(Done(s, i, "refused"), k)
             ELSE IF e # 0 /\ (s.ents[e].close # 0 \/ s.ents[e].tear # 0)
             THEN s' = [s EXCEPT !.fib[i].pc = "blockedW",
                                 !.fib[i].wf = IF s.ents[e].close # 0 THEN s.ents[e].close
                                               ELSE s.ents[e].tear]
             ELSE IF e # 0 /\ s.ents[e].build # 0
             THEN s' = Leave([s EXCEPT !.fib[i].pc = "joinedW", !.fib[i].wf = s.ents[e].build], k)
             ELSE IF e # 0 /\ Usable(s.ents[e])
             THEN s' = Leave([Done(s, i, "ok") EXCEPT !.fib[i].ent = e,
                                                      !.fib[i].gen = s.ents[e].gen], k)
             ELSE LET r == StartBuild(s, k, e)
                  IN s' = Leave([r.st EXCEPT !.fib[i].pc = "joinedW", !.fib[i].wf = r.b], k)
          [] f.pc = "blockedW" ->
             IF s.fib[f.wf].pc = "done"
             THEN IF s.fib[f.wf].res = "err" THEN s' = Leave(Done(s, i, "err"), k)
                  ELSE s' = [s EXCEPT !.fib[i].pc = "loop"]
             ELSE s' = Leave(Done(s, i, "refused"), k)
          [] f.pc = "joinedW" ->
             LET b == s.fib[f.wf]
             IN s' = [Done(s, i, b.res) EXCEPT !.fib[i].ent = b.ent, !.fib[i].gen = b.gen]

-----------------------------------------------------------------------------
(* Internal steps: the build (build.ts `build`, `failed`, `shutDown`).     *)

BuildDone(x, i, res) ==
  LET e == x.fib[i].ent
  IN [Done(x, i, res) EXCEPT !.ents[e].build = IF @ = i THEN 0 ELSE @]

(* The next bounded call of the build, or `catch` when it throws. *)
BuildCall(x, i, port, subj, pc) ==
  LET f == x.fib[i]
  IN \E o \in CallOutcomes(x, port, subj, f.key, f.gen, f.t, i) :
       IF o.thr THEN s' = [o.st EXCEPT !.fib[i].pc = "catch"]
       ELSE s' = [o.st EXCEPT !.fib[i].pc = pc, !.fib[i].wc = o.c]

(* `void releaseLanding(landing)` once the table shut: nobody awaits it. *)
ReleaseLandingVoid(x, l, i) ==
  LET h == x.lands[l].cr
      x1 == [x EXCEPT !.lands[l].cr = 0]
  IN IF h = 0 THEN {x1}
     ELSE {IF o.thr THEN [o.st EXCEPT !.bad.unhandled = @ \cup {"N2"}] ELSE o.st :
           o \in CallOutcomes(x1, "release", h, x1.hs[h].key, 0, 0, 0)}

BuildStep(i) ==
  LET f == s.fib[i]
      e == f.ent
      en == s.ents[e]
      c == f.wc
      ans == s.calls[c].ans
  IN /\ f.kind = "build" /\ Runnable(i) /\ MayRun(f.key)
     /\ CASE f.pc = "pretear" ->
             LET r == Teardown(s, e)
             IN s' = [r.st EXCEPT !.fib[i].pc = "pretearW", !.fib[i].wf = r.f]
          [] f.pc = "pretearW" ->
             IF s.fib[f.wf].res = "err" THEN s' = BuildDone(s, i, "err")
             ELSE IF en.st \notin {"none", "lost"}
             THEN s' = BuildDone([s EXCEPT !.bad.internal = TRUE], i, "err")
             ELSE LET x1 == NewTimer([s EXCEPT !.ents[e].st = "preparing",
                                               !.ents[e].gen = @ + 1,
                                               !.fib[i].gen = en.gen + 1])
                  IN BuildCall([x1 EXCEPT !.fib[i].t = x1.nTimers], i, "acquire", f.key, "acqW")
          [] f.pc = "acqW" ->
             IF Aborted(s, c)
             THEN s' = [SpawnLate(s, "relLate", e, 0, c) EXCEPT !.fib[i].pc = "failLose"]
             ELSE IF ans = "ok"
             THEN LET x1 == [s EXCEPT !.ents[e].cr = s.calls[c].made]
                  IN IF x1.shut THEN s' = [x1 EXCEPT !.fib[i].pc = "shut"]
                     ELSE BuildCall(x1, i, "start", f.key, "startW")
             ELSE s' = [s EXCEPT !.fib[i].pc = IF ans = "fail" THEN "failLose" ELSE "catch"]
          [] f.pc = "startW" ->
             IF Aborted(s, c)
             THEN LET l == Len(s.lands) + 1
                      x1 == [s EXCEPT !.lands = Append(@, [ent |-> e, cr |-> en.cr]),
                                      !.ents[e].cr = 0, !.ents[e].lands = @ \cup {l}]
                      x2 == [SpawnLate(x1, "landLate", e, l, c) EXCEPT !.fib[i].pc = "failLose"]
                  IN IF x2.shut THEN \E y \in ReleaseLandingVoid(x2, l, i) : s' = y
                     ELSE s' = x2
             ELSE IF ans = "ok"
             THEN LET x1 == [s EXCEPT !.ents[e].pr = s.calls[c].made]
                  IN IF x1.shut THEN s' = [x1 EXCEPT !.fib[i].pc = "shut"]
                     ELSE BuildCall(x1, i, "open", s.calls[c].made, "openW")
             ELSE s' = [s EXCEPT !.fib[i].pc = IF ans = "fail" THEN "failLose" ELSE "catch"]
          [] f.pc = "openW" ->
             IF Aborted(s, c)
             THEN s' = [SpawnLate(s, "closeLate", e, 0, c) EXCEPT !.fib[i].pc = "failLose"]
             ELSE IF ans = "ok"
             THEN BuildCall([s EXCEPT !.ents[e].tr = s.calls[c].made], i, "discover",
                            s.calls[c].made, "discW")
             ELSE s' = [s EXCEPT !.fib[i].pc = IF ans = "fail" THEN "failLose" ELSE "catch"]
          [] f.pc = "discW" ->
             IF Aborted(s, c) THEN s' = [s EXCEPT !.fib[i].pc = "failLose"]
             ELSE IF ans = "ok" THEN s' = BuildDone([s EXCEPT !.ents[e].st = "ready"], i, "ok")
             ELSE s' = [s EXCEPT !.fib[i].pc = IF ans = "fail" THEN "failLose" ELSE "catch"]
          [] f.pc = "failLose" ->
             LET r == Teardown([s EXCEPT !.ents[e].st = "lost"], e)
             IN s' = [r.st EXCEPT !.fib[i].pc = "failTearW", !.fib[i].wf = r.f]
          [] f.pc = "failTearW" ->
             IF s.fib[f.wf].res = "err" THEN s' = [s EXCEPT !.fib[i].pc = "catch"]
             ELSE \E o \in CallOutcomes(s, "store", f.key, f.key, 0, 0, i) :
                    IF o.thr THEN s' = [o.st EXCEPT !.fib[i].pc = "catch"]
                    ELSE s' = [o.st EXCEPT !.fib[i].pc = "markW", !.fib[i].wc = o.c]
          [] f.pc = "markW" -> s' = BuildDone(s, i, "fail")
          [] f.pc = "shut" ->
             LET r == Teardown([s EXCEPT !.ents[e].st = "lost"], e)
             IN s' = [r.st EXCEPT !.fib[i].pc = "shutTearW", !.fib[i].wf = r.f]
          [] f.pc = "shutTearW" ->
             IF s.fib[f.wf].res = "err" THEN s' = [s EXCEPT !.fib[i].pc = "catch"]
             ELSE s' = BuildDone(s, i, "fail")
          [] f.pc = "catch" ->
             LET x1 == IF en.st = "preparing" THEN [s EXCEPT !.ents[e].st = "lost"] ELSE s
                 r == Teardown(x1, e)
             IN s' = [r.st EXCEPT !.fib[i].pc = "catchTearW", !.fib[i].wf = r.f]
          [] f.pc = "catchTearW" -> s' = BuildDone(s, i, "err")

-----------------------------------------------------------------------------
(* Internal steps: the teardown (teardown.ts `closeOrder`).                *)

TearDone(x, i, res) ==
  LET e == x.fib[i].ent
  IN [Done(x, i, res) EXCEPT !.ents[e].tear = IF @ = i THEN 0 ELSE @]

TearStep(i) ==
  LET f == s.fib[i]
      e == f.ent
      en == s.ents[e]
      ans == s.calls[f.wc].ans
  IN /\ f.kind = "tear" /\ Runnable(i) /\ MayRun(f.key)
     /\ CASE f.pc = "tclose" ->
             IF en.tr = 0 THEN s' = [s EXCEPT !.fib[i].pc = "tstop"]
             ELSE \E o \in CallOutcomes(s, "close", en.tr, f.key, 0, 0, i) :
                    IF o.thr THEN s' = TearDone(o.st, i, "err")
                    ELSE s' = [o.st EXCEPT !.fib[i].pc = "tcloseW", !.fib[i].wc = o.c]
          [] f.pc = "tcloseW" ->
             IF ans = "reject" /\ "no-absorb-close" \in Bugs THEN s' = TearDone(s, i, "err")
             ELSE s' = [s EXCEPT !.ents[e].tr = 0, !.fib[i].pc = "tstop"]
          [] f.pc = "tstop" ->
             s' = [s EXCEPT !.fib[i].pc = "tstopNext",
                            !.fib[i].todo = (IF en.pr # 0 THEN {en.pr} ELSE {}) \cup en.ling]
          [] f.pc = "tstopNext" ->
             IF f.todo = {} THEN s' = [s EXCEPT !.fib[i].pc = "trel"]
             ELSE \E p \in f.todo :
                    \E o \in CallOutcomes(s, "stop", p, f.key, 0, 0, i) :
                      IF o.thr THEN s' = TearDone(o.st, i, "err")
                      ELSE s' = [o.st EXCEPT !.fib[i].pc = "tstopW", !.fib[i].wc = o.c,
                                             !.fib[i].cur = p, !.fib[i].todo = @ \ {p}]
          [] f.pc = "tstopW" ->
             s' = [RecordStop(s, e, f.cur, ans = "ok") EXCEPT !.fib[i].pc = "tstopNext"]
          [] f.pc = "trel" ->
             IF en.cr = 0 THEN s' = TearDone(s, i, "ok")
             ELSE \E o \in CallOutcomes(s, "release", en.cr, f.key, 0, 0, i) :
                    IF o.thr THEN s' = TearDone(o.st, i, "err")
                    ELSE s' = [o.st EXCEPT !.fib[i].pc = "trelW", !.fib[i].wc = o.c]
          [] f.pc = "trelW" -> s' = TearDone([s EXCEPT !.ents[e].cr = 0], i, "ok")

-----------------------------------------------------------------------------
(* Internal steps: `closeEntry`, the client operations' waits, late paths. *)

CloseDone(x, i, res) ==
  LET e == x.fib[i].ent
  IN [Done(x, i, res) EXCEPT !.ents[e].close = IF @ = i THEN 0 ELSE @]

CloseStep(i) ==
  LET f == s.fib[i]
      e == f.ent
  IN /\ f.kind = "closeEnt" /\ Runnable(i) /\ MayRun(f.key)
     /\ CASE f.pc = "waitBuild" ->
             IF s.ents[e].build # 0
             THEN s' = [s EXCEPT !.fib[i].pc = "buildW", !.fib[i].wf = s.ents[e].build]
             ELSE LET r == Teardown([s EXCEPT !.ents[e].st = "closed"], e)
                  IN s' = [r.st EXCEPT !.fib[i].pc = "ctearW", !.fib[i].wf = r.f]
          [] f.pc = "buildW" -> s' = [s EXCEPT !.fib[i].pc = "waitBuild"]
          [] f.pc = "ctearW" ->
             IF s.fib[f.wf].res = "err" THEN s' = CloseDone(s, i, "err")
             ELSE s' = CloseDone(Forget(s, e), i, "ok")

OpStep(i) ==
  LET f == s.fib[i]
  IN /\ f.kind \in {"release", "closeAll", "lose"} /\ Runnable(i) /\ MayRun(f.key)
     /\ CASE f.pc = "relOpW" -> s' = Done(s, i, s.fib[f.wf].res)
          [] f.pc = "awaitClosed" ->
             IF \E j \in f.wfs : s.fib[j].res = "err"
             THEN s' = IF f.ab THEN [Done(s, i, "err") EXCEPT !.bad.unhandled = @ \cup {"B1"}]
                       ELSE Done(s, i, "err")
             ELSE s' = [s EXCEPT !.fib[i].pc = "awaitAband"]
          [] f.pc = "awaitAband" -> s' = Done(s, i, IF f.ab THEN "err" ELSE "ok")
          [] f.pc = "loseTearW" ->
             IF s.fib[f.wf].res = "err" THEN s' = Done(s, i, "err")
             ELSE \E o \in CallOutcomes(s, "store", f.key, f.key, 0, 0, i) :
                    IF o.thr THEN s' = Done(o.st, i, "err")
                    ELSE s' = [o.st EXCEPT !.fib[i].pc = "markW", !.fib[i].wc = o.c]
          [] f.pc = "markW" -> s' = Done(s, i, "ok")

(* `releaseLanding` on the late path: the handle once, then the landing   *)
(* leaves the entry and the table looks at it again (`afterLanding`).      *)
LateReleaseLanding(x, i) ==
  LET f == x.fib[i]
      l == f.land
      h == x.lands[l].cr
      x1 == [x EXCEPT !.lands[l].cr = 0]
      e == f.ent
  IN IF h = 0
     THEN s' = Done(Forget([x1 EXCEPT !.ents[e].lands = @ \ {l}], e), i, "ok")
     ELSE \E o \in CallOutcomes(x1, "release", h, x1.hs[h].key, 0, 0, i) :
            IF o.thr THEN s' = Unhandled(o.st, i, "N2")
            ELSE s' = [o.st EXCEPT !.fib[i].pc = "lrelW", !.fib[i].wc = o.c]

LateStep(i) ==
  LET f == s.fib[i]
      call == s.calls[f.wc]
      ok == call.ans = "ok"
  IN /\ f.kind = "late" /\ Runnable(i) /\ MayRun(f.key)
     /\ CASE f.pc = "lateW" /\ f.late = "relLate" ->
             IF ~ok THEN s' = Done(s, i, "ok")
             ELSE \E o \in CallOutcomes(s, "release", call.made, call.key, 0, 0, i) :
                    IF o.thr THEN s' = Unhandled(o.st, i, "N2")
                    ELSE s' = [o.st EXCEPT !.fib[i].pc = "lcloseW", !.fib[i].wc = o.c]
          [] f.pc = "lateW" /\ f.late = "closeLate" ->
             IF ~ok THEN s' = Done(s, i, "ok")
             ELSE \E o \in CallOutcomes(s, "close", call.made, call.key, 0, 0, i) :
                    IF o.thr THEN s' = Unhandled(o.st, i, "N2")
                    ELSE s' = [o.st EXCEPT !.fib[i].pc = "lcloseW", !.fib[i].wc = o.c]
          [] f.pc = "lateW" /\ f.late = "landLate" ->
             IF ~ok THEN LateReleaseLanding(s, i)
             ELSE \E o \in CallOutcomes(s, "stop", call.made, call.key, 0, 0, i) :
                    IF o.thr THEN s' = Unhandled(o.st, i, "N2")
                    ELSE s' = [o.st EXCEPT !.fib[i].pc = "lstopW", !.fib[i].wc = o.c,
                                           !.fib[i].cur = call.made]
          [] f.pc = "lstopW" ->
             LateReleaseLanding(RecordStop(s, f.ent, f.cur, call.ans = "ok"), i)
          [] f.pc = "lrelW" ->
             LET e == f.ent
                 l == f.land
             IN s' = Done(Forget([s EXCEPT !.ents[e].lands = @ \ {l}], e), i, "ok")
          [] f.pc = "lcloseW" -> s' = Done(s, i, "ok")

(* One internal step: the synchronous part of a fiber up to its next await. *)
Internal ==
  \/ \E i \in DOMAIN s.fib :
       \/ EnsureStep(i) \/ BuildStep(i) \/ TearStep(i)
       \/ CloseStep(i) \/ OpStep(i) \/ LateStep(i)
  \/ \E k \in Keys : TurnNext(k)

-----------------------------------------------------------------------------
(* External actions: one per event-loop turn, taken only at rest.          *)

EnsureCall(k) ==
  /\ Quiescent /\ s.left.ens[k] > 0
  /\ LET x0 == Ev([s EXCEPT !.left.ens[k] = @ - 1], "ensure " \o k)
         i == Len(s.fib) + 1
     IN IF s.shut
        THEN s' = AddFiber(x0, [NewFiber("ensure", "done", k, 0) EXCEPT !.res = "refused"])
        ELSE LET x1 == NewTimer(x0)
             IN s' = [AddFiber(x1, [NewFiber("ensure", "queued", k, 0) EXCEPT !.t = x1.nTimers])
                      EXCEPT !.turnQ[k] = Append(@, i)]

Release(k) ==
  /\ Quiescent /\ s.left.rel[k] > 0
  /\ LET x0 == Ev([s EXCEPT !.left.rel[k] = @ - 1], "release " \o k)
         e == s.tbl[k]
     IN IF e = 0
        THEN s' = AddFiber(x0, [NewFiber("release", "done", k, 0) EXCEPT !.res = "ok"])
        ELSE LET r == CloseEntry(x0, e)
             IN s' = AddFiber(r.st, [NewFiber("release", "relOpW", k, e) EXCEPT !.wf = r.f])

RECURSIVE AbandonAll(_, _)
(* `abandonLandings` of every entry: each landing's handle released now;  *)
(* a release that throws rejects `abandoned`.                              *)
AbandonAll(x, ls) ==
  IF ls = {} THEN {[st |-> x, err |-> FALSE, calls |-> {}]}
  ELSE LET l == CHOOSE m \in ls : TRUE
           h == x.lands[l].cr
           x1 == [x EXCEPT !.lands[l].cr = 0]
           heads == IF h = 0 THEN {[st |-> x1, err |-> FALSE, calls |-> {}]}
                    ELSE {[st |-> o.st, err |-> o.thr, calls |-> IF o.thr THEN {} ELSE {o.c}] :
                          o \in CallOutcomes(x1, "release", h, x1.hs[h].key, 0, 0, 0)}
       IN UNION {{[st |-> r.st, err |-> hd.err \/ r.err, calls |-> hd.calls \cup r.calls] :
                  r \in AbandonAll(hd.st, ls \ {l})} : hd \in heads}

RECURSIVE CloseEach(_, _)
CloseEach(x, es) ==
  IF es = {} THEN [st |-> x, fs |-> {}]
  ELSE LET e == CHOOSE m \in es : TRUE
           r == CloseEntry(x, e)
           rest == CloseEach(r.st, es \ {e})
       IN [st |-> rest.st, fs |-> rest.fs \cup {r.f}]

CloseAll ==
  /\ Quiescent /\ s.left.ca > 0
  /\ LET x0 == Ev([s EXCEPT !.left.ca = @ - 1, !.shut = ("no-shut" \notin Bugs) \/ @,
                             !.closeAsked = TRUE], "closeAll")
         all == {x0.tbl[k] : k \in Keys} \ {0}
         ls == UNION {x0.ents[e].lands : e \in all}
     IN \E ab \in AbandonAll(x0, ls) :
          LET r == CloseEach(ab.st, all)
          IN s' = AddFiber(r.st, [NewFiber("closeAll", "awaitClosed", "none", 0)
                                  EXCEPT !.wfs = r.fs, !.wcs = ab.calls, !.ab = ab.err])

(* `lose` on the answer of an earlier `ensure`: a late report when that   *)
(* generation is not current any more.                                     *)
Lose(o) ==
  /\ Quiescent /\ s.left.lose > 0
  /\ s.fib[o].kind = "ensure" /\ s.fib[o].pc = "done" /\ s.fib[o].res = "ok"
  /\ LET e == s.fib[o].ent
         x0 == Ev([s EXCEPT !.left.lose = @ - 1], "lose")
     IN IF s.ents[e].gen = s.fib[o].gen /\ s.ents[e].st = "ready"
        THEN LET r == Teardown([x0 EXCEPT !.ents[e].st = "lost"], e)
             IN s' = AddFiber(r.st, [NewFiber("lose", "loseTearW", s.ents[e].key, e)
                                     EXCEPT !.wf = r.f])
        ELSE s' = AddFiber(x0, [NewFiber("lose", "done", s.ents[e].key, e)
                                EXCEPT !.res = "not-current"])

Fire ==
  /\ Quiescent /\ s.timers # <<>>
  /\ s' = Ev([s EXCEPT !.fired = @ \cup {Head(s.timers)}, !.timers = Tail(@)], "fire")

(* A resource handed over by an `ok` answer: its key and generation are   *)
(* those of the build that asked.                                          *)
Made(x, c) ==
  LET call == x.calls[c]
  IN CASE call.port = "acquire" ->
            [x EXCEPT !.hs = Append(@, [key |-> call.key, gen |-> call.gen, rel |-> 0]),
                      !.calls[c].made = Len(x.hs) + 1]
       [] call.port = "start" ->
            [x EXCEPT !.ps = Append(@, [key |-> call.key, gen |-> call.gen, stops |-> 0]),
                      !.calls[c].made = Len(x.ps) + 1]
       [] call.port = "open" ->
            [x EXCEPT !.ts = Append(@, [key |-> call.key, gen |-> call.gen, closes |-> 0]),
                      !.calls[c].made = Len(x.ts) + 1]
       [] OTHER -> x

Answer(c, a) ==
  /\ Quiescent /\ s.calls[c].st = "pending"
  /\ a \in AnswersOf(s.calls[c].port)
  /\ a = "ok" \/ (a \in Deviations /\ s.left.dev > 0)
  /\ LET x0 == Ev([s EXCEPT !.calls[c].st = "answered", !.calls[c].ans = a,
                             !.calls[c].late = Fired(s, c),
                             !.left.dev = IF a = "ok" THEN @ ELSE @ - 1],
                  "answer " \o s.calls[c].port \o " " \o a)
     IN s' = IF a = "ok" THEN Made(x0, c) ELSE x0

(* One external action, taken only at rest: an explorer step. *)
External ==
  \/ \E k \in Keys : EnsureCall(k)
  \/ \E k \in Keys : Release(k)
  \/ CloseAll
  \/ \E o \in DOMAIN s.fib : Lose(o)
  \/ Fire
  \/ \E c \in DOMAIN s.calls : \E a \in AnswersOf(s.calls[c].port) : Answer(c, a)

Next == Internal \/ External

Spec == Init /\ [][Next]_vars

(* P8 T1 needs the environment to answer: every bound fires, every call  *)
(* is answered, every fiber that can run runs.                             *)
LiveSpec ==
  /\ Spec
  /\ WF_vars(Internal)
  /\ WF_vars(Fire)
  /\ WF_vars(\E c \in DOMAIN s.calls : Answer(c, "ok"))

(* The same without fairness on the answers: a port may hang for ever. *)
(* P8 T1 is expected to fail under it (the anti-theorem A1, and P2).   *)
HangSpec ==
  /\ Spec
  /\ WF_vars(Internal)
  /\ WF_vars(Fire)

(* A state constraint for the two-key configuration only: no bound fires, *)
(* so no late path runs. It keeps the product of two keys' state spaces   *)
(* within the budget; the late paths are checked on one key.              *)
NoBoundFired == s.fired = {}

-----------------------------------------------------------------------------
(* Properties (SPEC.md "性质与证据").                                       *)

CloseAllDone == \E i \in DOMAIN s.fib : s.fib[i].kind = "closeAll" /\ s.fib[i].pc = "done"

AtRest == Quiescent /\ s.timers = <<>> /\ \A c \in DOMAIN s.calls : s.calls[c].st = "answered"

(* P1: no handle is released twice; after the shutdown at rest, each one once. *)
P1_AtMostOnce == \A h \in DOMAIN s.hs : s.hs[h].rel <= 1
P1_ShutdownReleasesAll == AtRest /\ CloseAllDone => \A h \in DOMAIN s.hs : s.hs[h].rel = 1

(* P2: an entry that left the table holds nothing, then and afterwards. *)
P2_ForgetHoldsNothing == \A e \in s.deleted : HoldsNothing(s.ents[e])

(* P2, as the explorer observes it: a key the status view reports as      *)
(* `none`, with nothing of it in flight, holds nothing.                     *)
StatusNone(k) ==
  s.tbl[k] = 0 \/ (s.ents[s.tbl[k]].st = "closed" /\ s.ents[s.tbl[k]].ling = {})
Busy(k) ==
  \/ \E c \in DOMAIN s.calls : s.calls[c].st = "pending" /\ s.calls[c].key = k
  \/ \E i \in DOMAIN s.fib : s.fib[i].kind \in OpKinds /\ s.fib[i].key = k /\ s.fib[i].pc # "done"
P2_NoneHoldsNothing ==
  \A k \in Keys :
    Quiescent /\ StatusNone(k) /\ ~Busy(k) => s.tbl[k] = 0 \/ HoldsNothing(s.ents[s.tbl[k]])

(* P3: when the shutdown answered, every process handed over was asked to stop. *)
P3_EveryProcessAsked == Quiescent /\ CloseAllDone => \A p \in DOMAIN s.ps : s.ps[p].stops >= 1

(* P4: after closeAll was called, no process is started and no transport opened. *)
P4_NoConnectAfterShut == ~s.bad.shutConnect

(* P5: an entry holds the resources of its own key only. *)
P5_KeyIsolation ==
  /\ \A k \in Keys : s.tbl[k] # 0 => s.ents[s.tbl[k]].key = k
  /\ \A e \in DOMAIN s.ents :
       LET en == s.ents[e]
       IN /\ en.tr # 0 => s.ts[en.tr].key = en.key
          /\ en.pr # 0 => s.ps[en.pr].key = en.key
          /\ en.cr # 0 => s.hs[en.cr].key = en.key

(* P6: what an entry holds belongs to its current generation: nothing an  *)
(* earlier generation hands over late becomes current.                     *)
P6_LateNoEffect ==
  \A e \in DOMAIN s.ents :
    LET en == s.ents[e]
    IN /\ en.tr # 0 => s.ts[en.tr].gen = en.gen
       /\ en.pr # 0 => s.ps[en.pr].gen = en.gen
       /\ en.cr # 0 => s.hs[en.cr].gen = en.gen

(* P7: no rejection is left unhandled at rest, and no illegal transition. *)
B1Pending ==
  \E i \in DOMAIN s.fib :
    s.fib[i].kind = "closeAll" /\ s.fib[i].pc = "awaitClosed" /\ s.fib[i].ab
P7_NoB1 == ~("B1" \in s.bad.unhandled) /\ (Quiescent => ~B1Pending)
P7_NoN2 == ~("N2" \in s.bad.unhandled)
P7_ErrorsHandled == P7_NoB1 /\ P7_NoN2 /\ ~s.bad.internal

(* P8 T2: once every bound fired, every `ensure` answered. Its two known *)
(* counterexamples are told apart by what the build waits behind: its own *)
(* teardown (P2), or the store while it marks the catalog (N1).           *)
EnsureStuck ==
  /\ Quiescent /\ s.timers = <<>>
  /\ \E i \in DOMAIN s.fib : s.fib[i].kind = "ensure" /\ s.fib[i].pc # "done"
BuildWaitsOnTeardown ==
  \E b \in DOMAIN s.fib :
    /\ s.fib[b].kind = "build"
    /\ s.fib[b].pc \in {"pretearW", "failTearW", "shutTearW", "catchTearW"}
    /\ s.fib[s.fib[b].wf].pc # "done"
BuildWaitsOnStore ==
  \E b \in DOMAIN s.fib :
    s.fib[b].kind = "build" /\ s.fib[b].pc = "markW" /\ s.calls[s.fib[b].wc].st = "pending"
P8_BoundedEnsure == ~EnsureStuck
P8_NoTeardownStall == ~(EnsureStuck /\ BuildWaitsOnTeardown)
P8_NoStoreStall == ~(EnsureStuck /\ ~BuildWaitsOnTeardown /\ BuildWaitsOnStore)

(* P8 A1 (anti-theorem, a probe): `release` and `closeAll` wait for the   *)
(* ports of the teardown and of a build in flight; expected to fail.      *)
P8_BoundedClose ==
  ~(/\ Quiescent /\ s.timers = <<>>
    /\ \E i \in DOMAIN s.fib : s.fib[i].kind \in {"release", "closeAll"} /\ s.fib[i].pc # "done")

(* P8 T1 (liveness, under LiveSpec): every client operation answers. The *)
(* operations are finitely many, so "each one eventually" is "eventually *)
(* all of them, for good".                                                  *)
AllOpsDone == \A i \in DOMAIN s.fib : s.fib[i].kind \in OpKinds => s.fib[i].pc = "done"
P8_EveryCallerAnswers == <>[]AllOpsDone

=============================================================================
