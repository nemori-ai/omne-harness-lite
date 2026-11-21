------------------------------ MODULE Withdraw ------------------------------
(***************************************************************************)
(* 撤下一份带副作用的贡献。                                                *)
(*                                                                         *)
(* 一个拓展点，几个 fiber 各放一份可以被调用的贡献。调用在受理时钉在一个   *)
(* 实例上。fiber 可以计划内卸下（先不接新的，等在途的收场），也可以突然    *)
(* 没了（Kill）。                                                          *)
(*                                                                         *)
(* 要回答的问题：每一次受理的调用是否恰好在一个实例上执行、恰好有一个结局；*)
(* 计划内的卸下是否从不产生「未知」；与被卸的 fiber 无关的调用是否不受影响。*)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS
  Fibers,
  Rank,       \* [Fibers -> Nat]
  MaxGen, MaxCalls, MaxKills,
  Bug         \* "none" | "drop" | "reroute" | "redo" | "admit-draining"

VARIABLES
  gen,        \* [Fibers -> 0..MaxGen]
  st,         \* [Fibers -> {"absent", "serving", "draining"}]
  calls,      \* 调用的集合：[id, on, s, recorded, late]
  ran,        \* [id -> 执行过它的实例的集合]
  kills,
  last        \* 上一步动的 fiber，没有就是 "none"

vars == <<gen, st, calls, ran, kills, last>>

Ids == 1..MaxCalls
Inst(f) == <<f, gen[f]>>
Present(i) == st[i[1]] # "absent" /\ gen[i[1]] = i[2]

Serving == {f \in Fibers : st[f] = "serving"}
Open    == IF Bug = "admit-draining" THEN {f \in Fibers : st[f] # "absent"} ELSE Serving
Pick(S) == CHOOSE f \in S : \A g \in S : Rank[f] <= Rank[g]

Init ==
  /\ gen = [f \in Fibers |-> 0]
  /\ st = [f \in Fibers |-> "absent"]
  /\ calls = {}
  /\ ran = [i \in Ids |-> {}]
  /\ kills = 0
  /\ last = "none"

Load(f) ==
  /\ st[f] = "absent" /\ gen[f] < MaxGen
  /\ gen' = [gen EXCEPT ![f] = @ + 1]
  /\ st' = [st EXCEPT ![f] = "serving"]
  /\ UNCHANGED <<calls, ran, kills>>
  /\ last' = f

\* 受理：现取。没有在服务的实例时不产生调用（调用方得到依据不可用）
Admit ==
  /\ Cardinality(calls) < MaxCalls
  /\ Open # {}
  /\ LET f  == Pick(Open)
         id == Cardinality(calls) + 1
     IN /\ calls' = calls \cup {[id |-> id, on |-> Inst(f), s |-> "running",
                                 recorded |-> FALSE, late |-> st[f] = "draining"]}
        /\ ran' = [ran EXCEPT ![id] = {Inst(f)}]
  /\ UNCHANGED <<gen, st, kills>>
  /\ last' = "none"

Replace(c, d) == (calls \ {c}) \cup {d}

\* 效果落进了耐久的保管处（还没向调用方收场）
Record(c) ==
  /\ c.s = "running" /\ ~c.recorded /\ Present(c.on)
  /\ calls' = Replace(c, [c EXCEPT !.recorded = TRUE])
  /\ UNCHANGED <<gen, st, ran, kills>>
  /\ last' = "none"

Finish(c) ==
  /\ c.s = "running" /\ Present(c.on)
  /\ calls' = Replace(c, [c EXCEPT !.s = "done", !.recorded = TRUE])
  /\ UNCHANGED <<gen, st, ran, kills>>
  /\ last' = "none"

BeginUnload(f) ==
  /\ st[f] = "serving"
  /\ st' = [st EXCEPT ![f] = "draining"]
  /\ IF Bug = "reroute" /\ Serving \ {f} # {}
       THEN LET h == Pick(Serving \ {f})
                moved == {c \in calls : c.s = "running" /\ c.on = Inst(f)}
            IN /\ calls' = (calls \ moved) \cup {[c EXCEPT !.on = Inst(h)] : c \in moved}
               /\ ran' = [i \in Ids |-> IF \E c \in moved : c.id = i
                                          THEN ran[i] \cup {Inst(h)} ELSE ran[i]]
       ELSE UNCHANGED <<calls, ran>>
  /\ UNCHANGED <<gen, kills>>
  /\ last' = f

Busy(f) == \E c \in calls : c.s = "running" /\ c.on = Inst(f)

CompleteUnload(f) ==
  /\ st[f] = "draining"
  /\ Bug = "drop" \/ ~Busy(f)
  /\ st' = [st EXCEPT ![f] = "absent"]
  /\ UNCHANGED <<gen, calls, ran, kills>>
  /\ last' = f

\* 突然没了：在途的变成未知
Kill(f) ==
  /\ st[f] # "absent" /\ kills < MaxKills
  /\ st' = [st EXCEPT ![f] = "absent"]
  /\ calls' = {IF c.s = "running" /\ c.on = Inst(f) THEN [c EXCEPT !.s = "unknown"] ELSE c
               : c \in calls}
  /\ kills' = kills + 1
  /\ UNCHANGED <<gen, ran>>
  /\ last' = f

\* 认回：只凭耐久的记录
Reconcile(c) ==
  /\ c.s = "unknown" /\ c.recorded
  /\ calls' = Replace(c, [c EXCEPT !.s = "done"])
  /\ UNCHANGED <<gen, st, ran, kills>>
  /\ last' = "none"

\* 缺陷变体：把未知的当成没发生，再执行一次
Redo(c) ==
  /\ Bug = "redo" /\ c.s = "unknown" /\ Serving # {}
  /\ LET h == Pick(Serving) IN
     /\ calls' = Replace(c, [c EXCEPT !.s = "running", !.on = Inst(h)])
     /\ ran' = [ran EXCEPT ![c.id] = @ \cup {Inst(h)}]
  /\ UNCHANGED <<gen, st, kills>>
  /\ last' = "none"

\* 每一步上的断言
Terminal(s) == s = "done"
StepOK ==
  /\ \A c \in calls : Terminal(c.s) => c \in calls'                 \* 结局不改写
  /\ \A c \in calls : (c.s = "unknown" /\ ~c.recorded) =>          \* 认不回的保持未知
        (Bug = "redo" \/ c \in calls')
  /\ \A c \in calls : (last' # "none" /\ c.on[1] # last') =>        \* 无关的调用不受影响
        (Bug = "reroute" \/ c \in calls')

Step ==
  \/ Admit
  \/ \E f \in Fibers : Load(f) \/ BeginUnload(f) \/ CompleteUnload(f) \/ Kill(f)
  \/ \E c \in calls : Record(c) \/ Finish(c) \/ Reconcile(c) \/ Redo(c)

Next == Step /\ Assert(StepOK, <<"step assertion broken; last =", last'>>)

Fair ==
  /\ \A f \in Fibers : WF_vars(CompleteUnload(f))
  /\ WF_vars(\E c \in calls : Finish(c))

Spec     == Init /\ [][Next]_vars
LiveSpec == Spec /\ Fair

-----------------------------------------------------------------------------
TypeOK ==
  /\ st \in [Fibers -> {"absent", "serving", "draining"}]
  /\ \A c \in calls : c.s \in {"running", "done", "unknown"}

\* 钉住：一次调用只在一个实例上执行过
Pinned == \A c \in calls : Cardinality(ran[c.id]) = 1

\* 没有孤儿：在跑的调用，它的实例还在
NoOrphan == \A c \in calls : c.s = "running" => Present(c.on)

\* 计划内的卸下从不产生未知
PlannedIsClean == kills = 0 => \A c \in calls : c.s # "unknown"

\* 进入排空之后不接新的
NoLateAdmit == \A c \in calls : ~c.late

\* 排空会结束（在途的会收场这一假设之下）
Drains == \A f \in Fibers : (st[f] = "draining") ~> (st[f] # "draining")

\* 见证：新旧并存。旧的在排空并且还有在途，新的已经在接
NoOverlap ==
  ~\E f, h \in Fibers :
      /\ f # h /\ st[f] = "draining" /\ st[h] = "serving"
      /\ \E c, d \in calls : c.s = "running" /\ c.on = Inst(f) /\ d.s = "running" /\ d.on = Inst(h)
=============================================================================
