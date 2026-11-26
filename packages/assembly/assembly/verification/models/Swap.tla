-------------------------------- MODULE Swap --------------------------------
(***************************************************************************)
(* 一行的换代。                                                            *)
(*                                                                         *)
(* 依赖方注入的是一个不变的入口；入口背后是这一行的一代又一代实现。新的一  *)
(* 代先备着（装入、启动），站稳了才一步换过去；旧的一代从那一刻起不接新的  *)
(* 调用，把名下在途的做完才算撤完。                                        *)
(*                                                                         *)
(* 要回答的问题：换的过程里有没有新旧都不服务的时刻；有没有调用落到正在撤  *)
(* 下的一代上；有没有调用成了没人管的；新的一代起不来时旧的还在不在。      *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Gens,       \* 代的集合，1..N
  Broken,     \* 其中启动就失败的
  Calls,      \* 调用的集合
  Order,      \* "make-before-break"：新的站稳了再一步换；"break-before-make"：先撤旧的再升新的
  AdmitRule,  \* "serving-only"：新调用只进在服务的一代；"any-live"：也进正在撤下的
  DrainRule,  \* "wait"：名下没有在途的才算撤完；"drop"：不等
  FailRule    \* "keep-old"：新的起不来，旧的照常；"drop-old"：新的起不来时旧的已经撤了

VARIABLES
  st,      \* st[g]："absent" | "staged" | "serving" | "retiring" | "gone" | "failed"
  pin,     \* pin[c]：调用钉在哪一代上，0 是还没受理
  done,    \* done[c]：做完了没有
  ever,    \* 有过一代进入服务
  late     \* 有调用被受理到一代不在服务的实现上

vars == <<st, pin, done, ever, late>>

Serving == {g \in Gens : st[g] = "serving"}
Running(g) == {c \in Calls : pin[c] = g /\ ~done[c]}
Next1(g) == \A h \in Gens : h < g => st[h] # "absent"
NoneStaged == \A h \in Gens : st[h] # "staged"

Init ==
  /\ st = [g \in Gens |-> "absent"]
  /\ pin = [c \in Calls |-> 0]
  /\ done = [c \in Calls |-> FALSE]
  /\ ever = FALSE
  /\ late = FALSE

Stage(g) ==
  /\ st[g] = "absent" /\ Next1(g) /\ NoneStaged
  /\ IF Order = "break-before-make"
       THEN st' = [h \in Gens |-> IF h = g THEN "staged"
                                   ELSE IF st[h] = "serving" THEN "retiring" ELSE st[h]]
       ELSE st' = [st EXCEPT ![g] = "staged"]
  /\ UNCHANGED <<pin, done, ever, late>>

StartFail(g) ==
  /\ st[g] = "staged" /\ g \in Broken
  /\ IF FailRule = "drop-old"
       THEN st' = [h \in Gens |-> IF h = g THEN "failed"
                                   ELSE IF st[h] = "serving" THEN "retiring" ELSE st[h]]
       ELSE st' = [st EXCEPT ![g] = "failed"]
  /\ UNCHANGED <<pin, done, ever, late>>

Swap(g) ==
  /\ st[g] = "staged" /\ g \notin Broken
  /\ st' = [h \in Gens |-> IF h = g THEN "serving"
                            ELSE IF st[h] = "serving" THEN "retiring" ELSE st[h]]
  /\ ever' = TRUE
  /\ UNCHANGED <<pin, done, late>>

Admit(c) ==
  /\ pin[c] = 0
  /\ \E g \in Gens :
       /\ IF AdmitRule = "any-live" THEN st[g] \in {"serving", "retiring"} ELSE st[g] = "serving"
       /\ pin' = [pin EXCEPT ![c] = g]
       /\ late' = (late \/ st[g] # "serving")
  /\ UNCHANGED <<st, done, ever>>

Finish(c) ==
  /\ pin[c] > 0 /\ ~done[c]
  /\ done' = [done EXCEPT ![c] = TRUE]
  /\ UNCHANGED <<st, pin, ever, late>>

Drain(g) ==
  /\ st[g] = "retiring"
  /\ DrainRule = "drop" \/ Running(g) = {}
  /\ st' = [st EXCEPT ![g] = "gone"]
  /\ UNCHANGED <<pin, done, ever, late>>

Next ==
  \/ \E g \in Gens : Stage(g) \/ StartFail(g) \/ Swap(g) \/ Drain(g)
  \/ \E c \in Calls : Admit(c) \/ Finish(c)

Fair ==
  /\ \A g \in Gens : WF_vars(StartFail(g)) /\ WF_vars(Swap(g)) /\ WF_vars(Drain(g))
  /\ \A c \in Calls : WF_vars(Finish(c))

Spec == Init /\ [][Next]_vars /\ Fair

TypeOK ==
  /\ st \in [Gens -> {"absent", "staged", "serving", "retiring", "gone", "failed"}]
  /\ pin \in [Calls -> Gens \cup {0}]
  /\ done \in [Calls -> BOOLEAN]

\* 同一时刻至多一代在服务
OneServing == Cardinality(Serving) <= 1
\* 有过一代进入服务之后，总有一代在服务：没有新旧都不服务的时刻
NoGap == ever => Serving # {}
\* 新的调用不落到不在服务的一代上
NoLateAdmit == ~late
\* 在途的调用钉着的那一代还在：没有没人管的调用
NoOrphan == \A c \in Calls : (pin[c] > 0 /\ ~done[c]) => st[pin[c]] \in {"serving", "retiring"}
\* 正在撤下的一代终会撤完；备着的一代终有结局
Settles == \A g \in Gens :
  /\ (st[g] = "retiring") ~> (st[g] = "gone")
  /\ (st[g] = "staged") ~> (st[g] \in {"serving", "failed", "retiring", "gone"})
=============================================================================
