--------------------------- MODULE ConnectionTable ---------------------------
(***************************************************************************)
(* The connection table of @omne-harness/mcp (src/internal/table.ts,      *)
(* build.ts, teardown.ts, late.ts, port.ts, entry.ts), for stdio          *)
(* endpoints with a process credential: the five resources of an entry    *)
(* (transport, process, credential handle, lingering processes, landings  *)
(* in flight), `ensure` with its critical section, the build under its    *)
(* bound, the three-step teardown, `release`, `closeAll`, `lose`, the     *)
(* late paths and the bounds. The ports may answer, fail, reject, throw   *)
(* when called, hang, or answer after their bound fired.                  *)
(*                                                                         *)
(* Every port is asked through `ask` (port.ts): a throw when the port is  *)
(* called is an answer at once, the breach answer of that port, as a      *)
(* rejection is. A wait under a bound (`within`) ends when the bound      *)
(* fires; what it waited for goes on as a fiber that nobody awaits (the   *)
(* table's task scope).                                                    *)
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
  Bugs,        \* deliberate faults of a negative control; {} is the code
  Observe      \* TRUE: `ev` names each step for traces; FALSE keeps it constant (liveness)

DeviationNames == {"fail", "reject", "unconfirmed", "throw"}
BugNames == {"no-absorb-close", "forget-open", "no-shut", "ok-after-shut", "abandon-landed",
             "unbounded-wrap"}

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

(* What a consumer sees of a key: `stateOf` without the residual, and the *)
(* generation `current` answers (0: none). A closed entry is `none`, with  *)
(* or without its residual (SPEC MC-9).                                    *)
Seen(x, k) ==
  IF x.tbl[k] = 0 THEN <<"none", 0>>
  ELSE LET en == x.ents[x.tbl[k]]
       IN <<IF en.st = "closed" THEN "none" ELSE en.st, IF Usable(en) THEN en.gen ELSE 0>>
Visible(x) == [k \in Keys |-> Seen(x, k)]
Unseen == [k \in Keys |-> <<"none", 0>>]

(* One async chain: a client operation, a build, a teardown, a close, the *)
(* mark after a failure, a late path. `pc` is where it is; `wc`, `wf`,     *)
(* `wfs`, `wcs` what it waits for; `t` its bound.                          *)
NewFiber(kind, pc, k, e) ==
  [kind |-> kind, pc |-> pc, key |-> k, ent |-> e, gen |-> 0, t |-> 0,
   wc |-> 0, wf |-> 0, wfs |-> {}, wcs |-> {}, res |-> "none", cur |-> 0,
   todo |-> {}, land |-> 0, late |-> "none"]

Init ==
  s = [ents |-> <<>>, tbl |-> [k \in Keys |-> 0], lastGen |-> [k \in Keys |-> 0],
       shut |-> FALSE, closeAsked |-> FALSE, deleted |-> {}, lands |-> <<>>,
       fib |-> <<>>, turnQ |-> [k \in Keys |-> <<>>], turnBusy |-> [k \in Keys |-> 0],
       calls |-> <<>>, timers |-> <<>>, nTimers |-> 0, fired |-> {},
       hs |-> <<>>, ps |-> <<>>, ts |-> <<>>,
       left |-> [ens |-> [k \in Keys |-> Ensures], rel |-> [k \in Keys |-> Releases],
                 ca |-> CloseAlls, lose |-> Loses, dev |-> Budget],
       lateTurn |-> FALSE, seen |-> Unseen,
       bad |-> [shutConnect |-> FALSE, okAfterShut |-> FALSE, early |-> FALSE,
                internal |-> FALSE],
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
(* teardown ports, P4's history, and a release while a process that       *)
(* carries the handle has no answer to its stop (S9).                      *)
Count(x, port, subj) ==
  CASE port = "close" -> [x EXCEPT !.ts[subj].closes = @ + 1]
    [] port = "stop" -> [x EXCEPT !.ps[subj].stops = @ + 1]
    [] port = "release" ->
         [x EXCEPT !.hs[subj].rel = @ + 1,
                   !.bad.early = @ \/ \E p \in DOMAIN x.ps : x.ps[p].h = subj /\ ~x.ps[p].stopped]
    [] port \in {"start", "open"} /\ x.closeAsked -> [x EXCEPT !.bad.shutConnect = TRUE]
    [] OTHER -> x

(* The outcomes of asking a port: a pending call, or, when the failure    *)
(* model allows a throw, a call answered at once with the breach answer.  *)
(* A call made while a late answer is handled is late too (`lateBorn`).   *)
CallOutcomes(x, port, subj, k, g, bound, owner) ==
  LET counted == Count(x, port, subj)
      c == Len(x.calls) + 1
      call == [port |-> port, subj |-> subj, key |-> k, gen |-> g, bound |-> bound,
               st |-> "pending", ans |-> "none", late |-> FALSE, lateBorn |-> x.lateTurn,
               made |-> 0, owner |-> owner]
      thrown == [call EXCEPT !.st = "answered", !.ans = "reject"]
  IN {[st |-> [counted EXCEPT !.calls = Append(@, call)], c |-> c]}
     \cup (IF "throw" \in Deviations /\ x.left.dev > 0
           THEN {[st |-> Ev([counted EXCEPT !.calls = Append(@, thrown), !.left.dev = @ - 1],
                            "throw " \o port),
                  c |-> c]}
           ELSE {})

(* `ask`: fiber `i` waits at `pc` for the answer of a call to `port`. *)
Ask(x, i, port, subj, bound, pc) ==
  {[o.st EXCEPT !.fib[i].pc = pc, !.fib[i].wc = o.c] :
   o \in CallOutcomes(x, port, subj, x.fib[i].key, x.fib[i].gen, bound, i)}

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

(* `markLost(entry)` after the connection was lost: the teardown, then the *)
(* mark of the catalog.                                                     *)
MarkLost(x, e) ==
  [st |-> AddFiber(x, NewFiber("mark", "mtear", x.ents[e].key, e)), f |-> Len(x.fib) + 1]

(* `forget(entry)`: the one place an entry leaves the table. *)
Forget(x, e) ==
  LET k == x.ents[e].key
  IN IF x.tbl[k] = e /\ Forgettable(x.ents[e])
     THEN [x EXCEPT !.tbl[k] = 0, !.lastGen[k] = Max(@, x.ents[e].gen),
                    !.deleted = @ \cup {e}]
     ELSE x

(* `recordStop`: the stop answered; a process confirmed short of the tree *)
(* stays lingering.                                                        *)
RecordStop(x, e, p, tree) ==
  [x EXCEPT !.ents[e].pr = IF @ = p THEN 0 ELSE @,
            !.ents[e].ling = (@ \ {p}) \cup (IF tree THEN {} ELSE {p}),
            !.ps[p].stopped = TRUE]

Done(x, i, res) == [x EXCEPT !.fib[i].pc = "done", !.fib[i].res = res]

Leave(x, k) == [x EXCEPT !.turnBusy[k] = 0]

SpawnLate(x, kind, e, l, c) ==
  LET j == Len(x.fib) + 1
  IN [AddFiber(x, [NewFiber("late", "lateW", x.ents[e].key, e)
                   EXCEPT !.late = kind, !.wc = c, !.land = l])
      EXCEPT !.calls[c].owner = j]

(* `releaseLanding(landing)` in the scope once the table shut. *)
ReleaseLandingVoid(x, l) ==
  LET h == x.lands[l].cr
      x1 == [x EXCEPT !.lands[l].cr = 0]
  IN IF h = 0 THEN {x1}
     ELSE {o.st : o \in CallOutcomes(x1, "release", h, x1.hs[h].key, 0, 0, 0)}

-----------------------------------------------------------------------------
(* Which fibers can run.                                                   *)

BoundedCallPcs == {"readW", "acqW", "startW", "openW", "discW"}
CallPcs == {"markW", "mstoreW", "tcloseW", "tstopW", "trelW", "lateW", "lstopW", "lrelW",
            "lcloseW"}
FiberPcs == {"joinedW", "relOpW", "loseTearW", "ctearW", "buildW", "mtearW"}
(* Waits for another fiber under the waiting fiber's bound (`within`). *)
BoundedFiberPcs == {"blockedW", "pretearW", "failW", "shutTearW", "catchTearW"}
InertPcs == {"queued", "done"}

Expired(f) == f.t \in s.fired /\ ~(f.pc = "failW" /\ "unbounded-wrap" \in Bugs)

Runnable(i) ==
  LET f == s.fib[i]
  IN CASE f.pc \in InertPcs -> FALSE
       [] f.pc \in BoundedCallPcs -> s.calls[f.wc].st = "answered" \/ Fired(s, f.wc)
       [] f.pc \in CallPcs -> s.calls[f.wc].st = "answered"
       [] f.pc \in FiberPcs -> s.fib[f.wf].pc = "done"
       [] f.pc \in BoundedFiberPcs -> s.fib[f.wf].pc = "done" \/ Expired(f)
       [] f.pc = "awaitClosed" -> \A j \in f.wfs : s.fib[j].pc = "done"
       [] f.pc = "awaitAband" -> \A c \in f.wcs : s.calls[c].st = "answered"
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
  IN [st |-> [AddFiber(x1, NewFiber("build", "attempt", k, en)) EXCEPT !.ents[en].build = b],
      b |-> b]

EnsureStep(i) ==
  LET f == s.fib[i]
      k == f.key
      e == s.tbl[k]
  IN /\ f.kind = "ensure" /\ Runnable(i) /\ MayRun(f.key)
     /\ CASE f.pc = "begin" ->
             IF s.shut THEN s' = Leave(Done(s, i, "refused"), k)
             ELSE \E y \in Ask(s, i, "adoption", k, f.t, "readW") : s' = y
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
             \/ /\ s.fib[f.wf].pc = "done"
                /\ IF s.fib[f.wf].res = "err" THEN s' = Leave(Done(s, i, "err"), k)
                   ELSE s' = [s EXCEPT !.fib[i].pc = "loop"]
             \/ /\ Expired(f) /\ s' = Leave(Done(s, i, "refused"), k)
          [] f.pc = "joinedW" ->
             LET b == s.fib[f.wf]
                 x1 == [Done(s, i, b.res) EXCEPT !.fib[i].ent = b.ent, !.fib[i].gen = b.gen]
             IN s' = IF b.res = "ok" /\ s.closeAsked THEN [x1 EXCEPT !.bad.okAfterShut = TRUE]
                     ELSE x1

-----------------------------------------------------------------------------
(* Internal steps: the build (build.ts `build`, `failed`, `shutDown`).     *)

BuildDone(x, i, res) ==
  LET e == x.fib[i].ent
  IN [Done(x, i, res) EXCEPT !.ents[e].build = IF @ = i THEN 0 ELSE @]

BuildStep(i) ==
  LET f == s.fib[i]
      e == f.ent
      en == s.ents[e]
      c == f.wc
      ans == s.calls[c].ans
      waited == s.fib[f.wf]
  IN /\ f.kind = "build" /\ Runnable(i) /\ MayRun(f.key)
     /\ CASE f.pc = "attempt" ->
             IF en.st \notin {"none", "lost"}
             THEN s' = BuildDone([s EXCEPT !.bad.internal = TRUE], i, "err")
             ELSE LET x1 == NewTimer([s EXCEPT !.ents[e].st = "preparing",
                                               !.ents[e].gen = @ + 1,
                                               !.fib[i].gen = en.gen + 1])
                      r == Teardown([x1 EXCEPT !.fib[i].t = x1.nTimers], e)
                  IN s' = [r.st EXCEPT !.fib[i].pc = "pretearW", !.fib[i].wf = r.f]
          [] f.pc = "pretearW" ->
             \/ /\ waited.pc = "done"
                /\ IF waited.res = "err" THEN s' = [s EXCEPT !.fib[i].pc = "catch"]
                   ELSE \E y \in Ask(s, i, "acquire", f.key, f.t, "acqW") : s' = y
             \/ /\ Expired(f) /\ s' = [s EXCEPT !.fib[i].pc = "failLose"]
          [] f.pc = "acqW" ->
             IF Aborted(s, c)
             THEN s' = [SpawnLate(s, "relLate", e, 0, c) EXCEPT !.fib[i].pc = "failLose"]
             ELSE IF ans = "ok"
             THEN LET x1 == [s EXCEPT !.ents[e].cr = s.calls[c].made]
                  IN IF x1.shut THEN s' = [x1 EXCEPT !.fib[i].pc = "shut"]
                     ELSE
                       (* `handOverToLanding`: from its start the landing is in flight and *)
                       (* carries the handle, so `closeAll` releases it within the bound. *)
                       LET l == Len(x1.lands) + 1
                           x2 == [x1 EXCEPT !.lands = Append(@, [ent |-> e, cr |-> x1.ents[e].cr,
                                                                 landed |-> FALSE]),
                                            !.ents[e].cr = 0, !.ents[e].lands = @ \cup {l},
                                            !.fib[i].land = l]
                       IN \E y \in Ask(x2, i, "start", s.calls[c].made, f.t, "startW") : s' = y
             ELSE s' = [s EXCEPT !.fib[i].pc = "failLose"]
          [] f.pc = "startW" ->
             LET l == f.land
             IN IF Aborted(s, c)
                THEN LET x2 == [SpawnLate(s, "landLate", e, l, c) EXCEPT !.fib[i].pc = "failLose"]
                     IN IF x2.shut THEN \E y \in ReleaseLandingVoid(x2, l) : s' = y
                        ELSE s' = x2
                ELSE
                  (* `takeBackFromLanding`: the landing answered within the bound; the *)
                  (* handle, if the shutdown did not release it, returns to the entry. *)
                  LET x0 == [s EXCEPT !.ents[e].cr = IF s.lands[l].cr # 0 THEN s.lands[l].cr ELSE @,
                                      !.lands[l].cr = 0, !.ents[e].lands = @ \ {l}]
                  IN IF ans = "ok"
                     THEN LET x1 == [x0 EXCEPT !.ents[e].pr = s.calls[c].made]
                          IN IF x1.shut THEN s' = [x1 EXCEPT !.fib[i].pc = "shut"]
                             ELSE \E y \in Ask(x1, i, "open", s.calls[c].made, f.t, "openW") : s' = y
                     ELSE s' = [x0 EXCEPT !.fib[i].pc = "failLose"]
          [] f.pc = "openW" ->
             IF Aborted(s, c)
             THEN s' = [SpawnLate(s, "closeLate", e, 0, c) EXCEPT !.fib[i].pc = "failLose"]
             ELSE IF ans = "ok"
             THEN \E y \in Ask([s EXCEPT !.ents[e].tr = s.calls[c].made], i, "discover",
                               s.calls[c].made, f.t, "discW") : s' = y
             ELSE s' = [s EXCEPT !.fib[i].pc = "failLose"]
          [] f.pc = "discW" ->
             IF Aborted(s, c) \/ ans # "ok" THEN s' = [s EXCEPT !.fib[i].pc = "failLose"]
             ELSE IF s.shut /\ "ok-after-shut" \notin Bugs THEN s' = [s EXCEPT !.fib[i].pc = "shut"]
             ELSE s' = BuildDone([s EXCEPT !.ents[e].st = "ready"], i, "ok")
          [] f.pc = "failLose" ->
             (* `failed`: after the shutdown began, wrapped up as the shutdown, no mark. *)
             IF s.shut THEN s' = [s EXCEPT !.fib[i].pc = "shut"]
             ELSE LET r == MarkLost([s EXCEPT !.ents[e].st = "lost"], e)
                  IN s' = [r.st EXCEPT !.fib[i].pc = "failW", !.fib[i].wf = r.f]
          [] f.pc \in {"failW", "shutTearW"} ->
             \/ /\ waited.pc = "done"
                /\ s' = IF waited.res = "err" THEN [s EXCEPT !.fib[i].pc = "catch"]
                        ELSE BuildDone(s, i, "fail")
             \/ /\ Expired(f) /\ s' = BuildDone(s, i, "fail")
          [] f.pc = "shut" ->
             LET r == Teardown([s EXCEPT !.ents[e].st = "lost"], e)
             IN s' = [r.st EXCEPT !.fib[i].pc = "shutTearW", !.fib[i].wf = r.f]
          [] f.pc = "catch" ->
             LET x1 == IF en.st = "preparing" THEN [s EXCEPT !.ents[e].st = "lost"] ELSE s
                 r == Teardown(x1, e)
             IN s' = [r.st EXCEPT !.fib[i].pc = "catchTearW", !.fib[i].wf = r.f]
          [] f.pc = "catchTearW" -> s' = BuildDone(s, i, "err")

(* `markLost` (build.ts): the teardown, then the catalog mark. *)
MarkStep(i) ==
  LET f == s.fib[i]
  IN /\ f.kind = "mark" /\ Runnable(i) /\ MayRun(f.key)
     /\ CASE f.pc = "mtear" ->
             LET r == Teardown(s, f.ent)
             IN s' = [r.st EXCEPT !.fib[i].pc = "mtearW", !.fib[i].wf = r.f]
          [] f.pc = "mtearW" ->
             IF s.fib[f.wf].res = "err" THEN s' = Done(s, i, "err")
             ELSE \E y \in Ask(s, i, "store", f.key, 0, "mstoreW") : s' = y
          [] f.pc = "mstoreW" -> s' = Done(s, i, "ok")

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
             ELSE \E y \in Ask(s, i, "close", en.tr, 0, "tcloseW") : s' = y
          [] f.pc = "tcloseW" ->
             IF ans = "reject" /\ "no-absorb-close" \in Bugs THEN s' = TearDone(s, i, "err")
             ELSE s' = [s EXCEPT !.ents[e].tr = 0, !.fib[i].pc = "tstop"]
          [] f.pc = "tstop" ->
             s' = [s EXCEPT !.fib[i].pc = "tstopNext",
                            !.fib[i].todo = (IF en.pr # 0 THEN {en.pr} ELSE {}) \cup en.ling]
          [] f.pc = "tstopNext" ->
             IF f.todo = {} THEN s' = [s EXCEPT !.fib[i].pc = "trel"]
             ELSE \E p \in f.todo :
                    \E y \in Ask([s EXCEPT !.fib[i].cur = p, !.fib[i].todo = @ \ {p}],
                                 i, "stop", p, 0, "tstopW") : s' = y
          [] f.pc = "tstopW" ->
             s' = [RecordStop(s, e, f.cur, ans = "ok") EXCEPT !.fib[i].pc = "tstopNext"]
          [] f.pc = "trel" ->
             IF en.cr = 0 THEN s' = TearDone(s, i, "ok")
             ELSE \E y \in Ask(s, i, "release", en.cr, 0, "trelW") : s' = y
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
          [] f.pc = "awaitClosed" -> s' = [s EXCEPT !.fib[i].pc = "awaitAband"]
          [] f.pc = "awaitAband" ->
             s' = Done(s, i, IF \E j \in f.wfs : s.fib[j].res = "err" THEN "err" ELSE "ok")
          [] f.pc = "loseTearW" ->
             IF s.fib[f.wf].res = "err" THEN s' = Done(s, i, "err")
             ELSE \E y \in Ask(s, i, "store", f.key, 0, "markW") : s' = y
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
     ELSE \E y \in Ask(x1, i, "release", h, 0, "lrelW") : s' = y

LateStep(i) ==
  LET f == s.fib[i]
      call == s.calls[f.wc]
      ok == call.ans = "ok"
  IN /\ f.kind = "late" /\ Runnable(i) /\ MayRun(f.key)
     /\ CASE f.pc = "lateW" /\ f.late = "relLate" ->
             IF ~ok THEN s' = Done(s, i, "ok")
             ELSE \E y \in Ask(s, i, "release", call.made, 0, "lcloseW") : s' = y
          [] f.pc = "lateW" /\ f.late = "closeLate" ->
             IF ~ok THEN s' = Done(s, i, "ok")
             ELSE \E y \in Ask(s, i, "close", call.made, 0, "lcloseW") : s' = y
          [] f.pc = "lateW" /\ f.late = "landLate" ->
             IF ~ok THEN LateReleaseLanding(s, i)
             ELSE \E y \in Ask([s EXCEPT !.lands[f.land].landed = TRUE, !.fib[i].cur = call.made],
                               i, "stop", call.made, 0, "lstopW") : s' = y
          [] f.pc = "lstopW" -> LateReleaseLanding(RecordStop(s, f.ent, f.cur, ok), i)
          [] f.pc = "lrelW" ->
             LET e == f.ent
                 l == f.land
             IN s' = Done(Forget([s EXCEPT !.ents[e].lands = @ \ {l}], e), i, "ok")
          [] f.pc = "lcloseW" -> s' = Done(s, i, "ok")

(* One internal step: the synchronous part of a fiber up to its next await. *)
Internal ==
  \/ \E i \in DOMAIN s.fib :
       \/ EnsureStep(i) \/ BuildStep(i) \/ MarkStep(i) \/ TearStep(i)
       \/ CloseStep(i) \/ OpStep(i) \/ LateStep(i)
  \/ \E k \in Keys : TurnNext(k)

-----------------------------------------------------------------------------
(* External actions: one per event-loop turn, taken only at rest.          *)

(* A turn that does not hand a late answer over. *)
Turn(x) == [x EXCEPT !.lateTurn = FALSE, !.seen = Unseen]

EnsureCall(k) ==
  /\ Quiescent /\ s.left.ens[k] > 0
  /\ LET x0 == Ev(Turn([s EXCEPT !.left.ens[k] = @ - 1]), "ensure " \o k)
         i == Len(s.fib) + 1
     IN IF s.shut
        THEN s' = AddFiber(x0, [NewFiber("ensure", "done", k, 0) EXCEPT !.res = "refused"])
        ELSE LET x1 == NewTimer(x0)
             IN s' = [AddFiber(x1, [NewFiber("ensure", "queued", k, 0) EXCEPT !.t = x1.nTimers])
                      EXCEPT !.turnQ[k] = Append(@, i)]

Release(k) ==
  /\ Quiescent /\ s.left.rel[k] > 0
  /\ LET x0 == Ev(Turn([s EXCEPT !.left.rel[k] = @ - 1]), "release " \o k)
         e == s.tbl[k]
     IN IF e = 0
        THEN s' = AddFiber(x0, [NewFiber("release", "done", k, 0) EXCEPT !.res = "ok"])
        ELSE LET r == CloseEntry(x0, e)
             IN s' = AddFiber(r.st, [NewFiber("release", "relOpW", k, e) EXCEPT !.wf = r.f])

RECURSIVE AbandonAll(_, _)
(* `abandonLandings` of every entry: the handle of each landing in flight *)
(* released now, all at once.                                              *)
AbandonAll(x, ls) ==
  IF ls = {} THEN {[st |-> x, calls |-> {}]}
  ELSE LET l == CHOOSE m \in ls : TRUE
           h == x.lands[l].cr
           x1 == [x EXCEPT !.lands[l].cr = 0]
           heads == IF h = 0 THEN {[st |-> x1, calls |-> {}]}
                    ELSE {[st |-> o.st, calls |-> {o.c}] :
                          o \in CallOutcomes(x1, "release", h, x1.hs[h].key, 0, 0, 0)}
       IN UNION {{[st |-> r.st, calls |-> hd.calls \cup r.calls] :
                  r \in AbandonAll(hd.st, ls \ {l})} : hd \in heads}

RECURSIVE CloseEach(_, _)
CloseEach(x, es) ==
  IF es = {} THEN [st |-> x, fs |-> {}]
  ELSE LET e == CHOOSE m \in es : TRUE
           r == CloseEntry(x, e)
           rest == CloseEach(r.st, es \ {e})
       IN [st |-> rest.st, fs |-> rest.fs \cup {r.f}]

(* `closeAll` waits for every close and every abandoned landing, then answers. *)
CloseAll ==
  /\ Quiescent /\ s.left.ca > 0
  /\ LET x0 == Ev(Turn([s EXCEPT !.left.ca = @ - 1, !.shut = ("no-shut" \notin Bugs) \/ @,
                                 !.closeAsked = TRUE]), "closeAll")
         all == {x0.tbl[k] : k \in Keys} \ {0}
         ls == {l \in UNION {x0.ents[e].lands : e \in all} :
                  ~x0.lands[l].landed \/ "abandon-landed" \in Bugs}
     IN \E ab \in AbandonAll(x0, ls) :
          LET r == CloseEach(ab.st, all)
          IN s' = AddFiber(r.st, [NewFiber("closeAll", "awaitClosed", "none", 0)
                                  EXCEPT !.wfs = r.fs, !.wcs = ab.calls])

(* `lose` on the answer of an earlier `ensure`: a late report when that   *)
(* generation is not current any more.                                     *)
Lose(o) ==
  /\ Quiescent /\ s.left.lose > 0
  /\ s.fib[o].kind = "ensure" /\ s.fib[o].pc = "done" /\ s.fib[o].res = "ok"
  /\ LET e == s.fib[o].ent
         x0 == Ev(Turn([s EXCEPT !.left.lose = @ - 1]), "lose")
     IN IF s.ents[e].gen = s.fib[o].gen /\ s.ents[e].st = "ready"
        THEN LET r == Teardown([x0 EXCEPT !.ents[e].st = "lost"], e)
             IN s' = AddFiber(r.st, [NewFiber("lose", "loseTearW", s.ents[e].key, e)
                                     EXCEPT !.wf = r.f])
        ELSE s' = AddFiber(x0, [NewFiber("lose", "done", s.ents[e].key, e)
                                EXCEPT !.res = "not-current"])

Fire ==
  /\ Quiescent /\ s.timers # <<>>
  /\ s' = Ev(Turn([s EXCEPT !.fired = @ \cup {Head(s.timers)}, !.timers = Tail(@)]), "fire")

(* A resource handed over by an `ok` answer: its key and generation are   *)
(* those of the build that asked; a process records the handle it carries. *)
Made(x, c) ==
  LET call == x.calls[c]
  IN CASE call.port = "acquire" ->
            [x EXCEPT !.hs = Append(@, [key |-> call.key, gen |-> call.gen, rel |-> 0]),
                      !.calls[c].made = Len(x.hs) + 1]
       [] call.port = "start" ->
            [x EXCEPT !.ps = Append(@, [key |-> call.key, gen |-> call.gen, stops |-> 0,
                                        h |-> call.subj, stopped |-> FALSE]),
                      !.calls[c].made = Len(x.ps) + 1]
       [] call.port = "open" ->
            [x EXCEPT !.ts = Append(@, [key |-> call.key, gen |-> call.gen, closes |-> 0]),
                      !.calls[c].made = Len(x.ts) + 1]
       [] OTHER -> x

(* A late answer, or the answer of a call made in the wake of one, starts *)
(* a late turn: `seen` keeps what consumers saw before it (P6).            *)
Answer(c, a) ==
  /\ Quiescent /\ s.calls[c].st = "pending"
  /\ a \in AnswersOf(s.calls[c].port)
  /\ a = "ok" \/ (a \in Deviations /\ s.left.dev > 0)
  /\ LET late == Fired(s, c) \/ s.calls[c].lateBorn
         x0 == Ev([s EXCEPT !.calls[c].st = "answered", !.calls[c].ans = a,
                             !.calls[c].late = Fired(s, c),
                             !.left.dev = IF a = "ok" THEN @ ELSE @ - 1,
                             !.lateTurn = late,
                             !.seen = IF late THEN Visible(s) ELSE Unseen],
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
(* P8 T1 is expected to fail under it (the anti-theorem A1).           *)
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

(* P1: no handle is released twice, nor while a process that carries it  *)
(* has no answer to its stop (S9); after the shutdown at rest, each once. *)
P1_AtMostOnce == \A h \in DOMAIN s.hs : s.hs[h].rel <= 1
P1_ReleasedAfterStop == ~s.bad.early
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

(* P4: after closeAll was called, no process is started, no transport     *)
(* opened, and no `ensure` answers a connection (decision 23, K3).        *)
P4_NoConnectAfterShut == ~s.bad.shutConnect
P4_NoOkAfterShut == ~s.bad.okAfterShut

(* P5: an entry holds the resources of its own key only. The key itself is *)
(* abstract here: how the code derives it is checked by the explorer.     *)
P5_KeyIsolation ==
  /\ \A k \in Keys : s.tbl[k] # 0 => s.ents[s.tbl[k]].key = k
  /\ \A e \in DOMAIN s.ents :
       LET en == s.ents[e]
       IN /\ en.tr # 0 => s.ts[en.tr].key = en.key
          /\ en.pr # 0 => s.ps[en.pr].key = en.key
          /\ en.cr # 0 => s.hs[en.cr].key = en.key

(* P6: once a late answer and what it set off were handled, consumers see  *)
(* what they saw before it: `stateOf` without the residual, and `current`. *)
P6_LateInvisible == Quiescent /\ s.lateTurn => Visible(s) = s.seen

(* P7: no illegal transition. A port's throw or rejection is an answer    *)
(* here (`ask`); the explorer checks for unhandled rejections in the code. *)
P7_ErrorsHandled == ~s.bad.internal

(* P8 T2: once every bound fired, every `ensure` answered. *)
EnsureStuck ==
  /\ Quiescent /\ s.timers = <<>>
  /\ \E i \in DOMAIN s.fib : s.fib[i].kind = "ensure" /\ s.fib[i].pc # "done"
P8_BoundedEnsure == ~EnsureStuck

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
