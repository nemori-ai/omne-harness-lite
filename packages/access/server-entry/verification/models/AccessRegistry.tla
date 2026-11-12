------------------------------ MODULE AccessRegistry ------------------------------
(* 模型一：登记表与在途工作。                                                  *)
(* 问的是：调用到达、处理函数开始、处理函数完成、协议撤下、重新挂上，这些事以任 *)
(* 何顺序交错时，每个在途的调用和观察是不是都有确定的结局。                     *)
(*                                                                            *)
(* 模型里的一步对应实现里的一步：                                              *)
(*   Mount            挂上一份贡献。同名协议已经挂着时不挂。                   *)
(*   Unmount          移除表项，同时给这份贡献的在途调用发中止，给它的观察标   *)
(*                    上「要结束」。这三件事是一步。                           *)
(*   UnmountComplete  这份贡献的在途调用都答复了、观察都结束了，撤下才算完成。 *)
(*   CallArrive       查登记表并把调用登记成在途。查和登记是一步。             *)
(*   HandlerStart     把调用交给处理函数。已经收到中止的不交。                 *)
(*   HandlerFinish    处理函数完成，或在中止之后失败。                         *)
(*   ObsOpen、ObsEnd  建立观察；写出结束帧。                                   *)
(*                                                                            *)
(* Variant 不是 "correct" 时，模型故意改坏一处，用来证明检查能失败。           *)
EXTENDS Naturals, FiniteSets

CONSTANTS Protocols, Calls, Observations, MaxGen, Effect, Variant

VARIABLES entries, nextGen, genState, call, obs

vars == <<entries, nextGen, genState, call, obs>>

Gens == 1..MaxGen
NoGen == 0

CallInit == [state |-> "idle", gen |-> NoGen, aborted |-> FALSE, started |-> FALSE, answer |-> "none"]
ObsInit == [state |-> "idle", gen |-> NoGen, mustEnd |-> FALSE]

Init ==
  /\ entries = {}
  /\ nextGen = 1
  /\ genState = [g \in Gens |-> "unused"]
  /\ call = [c \in Calls |-> CallInit]
  /\ obs = [o \in Observations |-> ObsInit]

EntryOf(p) == {e \in entries : e.protocol = p}

Mount(p) ==
  /\ nextGen <= MaxGen
  /\ (Variant = "noUniqueness" \/ EntryOf(p) = {})
  /\ entries' = entries \cup {[protocol |-> p, gen |-> nextGen]}
  /\ genState' = [genState EXCEPT ![nextGen] = "live"]
  /\ nextGen' = nextGen + 1
  /\ UNCHANGED <<call, obs>>

Unmount(p) ==
  \E e \in EntryOf(p) :
    /\ entries' = entries \ {e}
    /\ genState' = [genState EXCEPT ![e.gen] = "draining"]
    /\ call' = [c \in Calls |->
                  IF /\ call[c].gen = e.gen
                     /\ call[c].state \in {"registered", "running"}
                     /\ Variant # "noAbort"
                  THEN [call[c] EXCEPT !.aborted = TRUE]
                  ELSE call[c]]
    /\ obs' = [o \in Observations |->
                 IF obs[o].gen = e.gen /\ obs[o].state = "open" /\ Variant # "noObsEnd"
                 THEN [obs[o] EXCEPT !.mustEnd = TRUE]
                 ELSE obs[o]]
    /\ UNCHANGED nextGen

Settled(g) ==
  /\ \A c \in Calls : call[c].gen = g => call[c].state = "answered"
  /\ \A o \in Observations : obs[o].gen = g => obs[o].state = "ended"

UnmountComplete(g) ==
  /\ genState[g] = "draining"
  /\ (Variant = "earlyGone" \/ Settled(g))
  /\ genState' = [genState EXCEPT ![g] = "gone"]
  /\ UNCHANGED <<entries, nextGen, call, obs>>

CallArrive(c, p) ==
  /\ call[c].state = "idle"
  /\ IF EntryOf(p) = {}
     THEN call' = [call EXCEPT ![c] = [@ EXCEPT !.state = "answered", !.answer = "notFound"]]
     ELSE \E e \in EntryOf(p) :
            call' = [call EXCEPT ![c] =
                       [@ EXCEPT !.state = IF Variant = "nonAtomicLookup" THEN "looked" ELSE "registered",
                                 !.gen = e.gen]]
  /\ UNCHANGED <<entries, nextGen, genState, obs>>

\* 只在改坏的变体里出现：查完登记表之后，隔了一步才登记成在途。
Register(c) ==
  /\ call[c].state = "looked"
  /\ call' = [call EXCEPT ![c] = [@ EXCEPT !.state = "registered"]]
  /\ UNCHANGED <<entries, nextGen, genState, obs>>

HandlerStart(c) ==
  /\ call[c].state = "registered"
  /\ ~(Variant = "stuckAborted" /\ call[c].aborted)
  /\ IF call[c].aborted
     THEN call' = [call EXCEPT ![c] = [@ EXCEPT !.state = "answered", !.answer = "basisUnavailable"]]
     ELSE call' = [call EXCEPT ![c] = [@ EXCEPT !.state = "running", !.started = TRUE]]
  /\ UNCHANGED <<entries, nextGen, genState, obs>>

HandlerFinish(c) ==
  /\ call[c].state = "running"
  /\ \/ call' = [call EXCEPT ![c] = [@ EXCEPT !.state = "answered", !.answer = "ok"]]
     \/ /\ call[c].aborted
        /\ call' = [call EXCEPT ![c] =
                      [@ EXCEPT !.state = "answered",
                                !.answer = IF Effect[c] = "commit" /\ Variant # "wrongAnswer"
                                           THEN "unknown"
                                           ELSE "basisUnavailable"]]
  /\ UNCHANGED <<entries, nextGen, genState, obs>>

ObsOpen(o, p) ==
  /\ obs[o].state = "idle"
  /\ IF EntryOf(p) = {}
     THEN obs' = [obs EXCEPT ![o] = [@ EXCEPT !.state = "ended"]]
     ELSE \E e \in EntryOf(p) : obs' = [obs EXCEPT ![o] = [@ EXCEPT !.state = "open", !.gen = e.gen]]
  /\ UNCHANGED <<entries, nextGen, genState, call>>

ObsEnd(o) ==
  /\ obs[o].state = "open"
  /\ obs[o].mustEnd
  /\ obs' = [obs EXCEPT ![o] = [@ EXCEPT !.state = "ended"]]
  /\ UNCHANGED <<entries, nextGen, genState, call>>

Next ==
  \/ \E p \in Protocols : Mount(p) \/ Unmount(p)
  \/ \E g \in Gens : UnmountComplete(g)
  \/ \E c \in Calls, p \in Protocols : CallArrive(c, p)
  \/ \E c \in Calls : Register(c) \/ HandlerStart(c) \/ HandlerFinish(c)
  \/ \E o \in Observations, p \in Protocols : ObsOpen(o, p)
  \/ \E o \in Observations : ObsEnd(o)

Fairness ==
  /\ \A c \in Calls : WF_vars(Register(c)) /\ WF_vars(HandlerStart(c)) /\ WF_vars(HandlerFinish(c))
  /\ \A o \in Observations : WF_vars(ObsEnd(o))
  /\ \A g \in Gens : WF_vars(UnmountComplete(g))

Spec == Init /\ [][Next]_vars /\ Fairness

--------------------------------------------------------------------------------
(* 性质 *)

TypeOK ==
  /\ entries \subseteq [protocol : Protocols, gen : Gens]
  /\ nextGen \in 1..(MaxGen + 1)
  /\ genState \in [Gens -> {"unused", "live", "draining", "gone"}]
  /\ \A c \in Calls :
       /\ call[c].state \in {"idle", "looked", "registered", "running", "answered"}
       /\ call[c].answer \in {"none", "ok", "notFound", "basisUnavailable", "unknown"}
  /\ \A o \in Observations : obs[o].state \in {"idle", "open", "ended"}

\* I-3：同名协议至多挂着一份。
Unique == \A p \in Protocols : Cardinality(EntryOf(p)) <= 1

\* 在途的调用如果属于一份已经不在表里的贡献，它一定已经收到中止。
\* 这等于说：撤下之后，没有调用在不知情的情况下进到旧的贡献。
AbortReachesInFlight ==
  \A c \in Calls :
    (call[c].state \in {"registered", "running"} /\ genState[call[c].gen] # "live") => call[c].aborted

\* I-8：处理函数已经开始的提交类调用，不会被答成「依据不可用」。它只能是成功或未知。
HonestAnswer ==
  \A c \in Calls :
    call[c].answer = "basisUnavailable" => ~(Effect[c] = "commit" /\ call[c].started)

\* I-4 的安全一半：撤下完成时，这份贡献的在途调用都答复了，观察都结束了。
GoneMeansSettled == \A g \in Gens : genState[g] = "gone" => Settled(g)

\* I-4 的进展一半：到达的调用最终都有答复；要结束的观察最终结束；撤下最终完成。
EveryCallSettles == \A c \in Calls : (call[c].state # "idle") ~> (call[c].state = "answered")
EveryObsEnds == \A o \in Observations : (obs[o].state = "open" /\ obs[o].mustEnd) ~> (obs[o].state = "ended")
DrainCompletes == \A g \in Gens : (genState[g] = "draining") ~> (genState[g] = "gone")

================================================================================
