------------------------------ MODULE SelfHost ------------------------------
(***************************************************************************)
(* 自己换自己的底。                                                        *)
(*                                                                         *)
(* 进程里有一层不变的底（kernel），和一层由资产带来的 plugin。资产层里可以 *)
(* 有坏的：它在场时进程随时可能倒。管理入口（装、卸）要么在底里，要么自己 *)
(* 也是一份资产层的 plugin。                                               *)
(*                                                                         *)
(* 要回答的问题：进程反复倒的时候，系统是否总能回到一个「起来了、坏的不在 *)
(* 场、管理入口可用」的状态。能撤回一次改动的东西，不能依赖这次改动。      *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS
  Assets,       \* 资产层的 plugin
  Bad,          \* 其中会带倒进程的
  Mgr,          \* 资产层里的那份管理 plugin（ManagerHome = "asset" 时才有意义）
  ManagerHome,  \* "kernel" | "asset"
  BootRule,     \* "all-at-once"：起来就带上全部资产层
                \* "floor"：先只起底，资产层由一次普通的装载补上；连续倒够次数就停在底上
  Limit,        \* 连续倒几次之后不再自动补装
  MaxStrikes

VARIABLES
  up,           \* 进程在不在
  live,         \* 已装上的资产层 plugin
  good,         \* 耐久：要装的集合
  strikes       \* 耐久：上一次稳定之后连着倒了几次

vars == <<up, live, good, strikes>>

ManagerAvailable == up /\ (ManagerHome = "kernel" \/ Mgr \in live)
Floor            == up /\ live \cap Bad = {} /\ ManagerAvailable

Init ==
  /\ up = TRUE
  /\ live = {}
  /\ good = IF ManagerHome = "asset" THEN {Mgr} ELSE {}
  /\ strikes = 0

Boot ==
  /\ ~up
  /\ up' = TRUE
  /\ live' = IF BootRule = "all-at-once" THEN good ELSE {}
  /\ UNCHANGED <<good, strikes>>

\* 补装：和运行中装一份 plugin 是同一个动作
Sweep ==
  /\ up /\ BootRule = "floor" /\ live # good
  /\ strikes < Limit
  /\ live' = good
  /\ UNCHANGED <<up, good, strikes>>

Settle ==
  /\ up /\ live = good /\ strikes > 0
  /\ strikes' = 0
  /\ UNCHANGED <<up, live, good>>

Crash ==
  /\ up /\ live \cap Bad # {}
  /\ up' = FALSE
  /\ live' = {}
  /\ strikes' = IF strikes < MaxStrikes THEN strikes + 1 ELSE strikes
  /\ UNCHANGED good

Install(a) ==
  /\ ManagerAvailable /\ a \notin good
  /\ good' = good \cup {a}
  /\ live' = live \cup {a}
  /\ UNCHANGED <<up, strikes>>

Remove(a) ==
  /\ ManagerAvailable /\ a \in good
  /\ good' = good \ {a}
  /\ live' = live \ {a}
  /\ UNCHANGED <<up, strikes>>

\* 人或 agent 在底上处理完之后，放开自动补装
Resume ==
  /\ ManagerAvailable /\ strikes >= Limit
  /\ strikes' = 0
  /\ UNCHANGED <<up, live, good>>

Next ==
  \/ Boot \/ Sweep \/ Settle \/ Crash \/ Resume
  \/ \E a \in Assets : Install(a) \/ Remove(a)

Spec == Init /\ [][Next]_vars /\ WF_vars(Boot)

-----------------------------------------------------------------------------
TypeOK == up \in BOOLEAN /\ live \subseteq Assets /\ good \subseteq Assets

\* 进程不在的时候没有活体
DownIsEmpty == ~up => live = {}

\* 底：只要进程一再倒下，就一再回到「起来了、坏的不在场、管理入口可用」
FloorHolds == ([]<>(~up)) => ([]<>Floor)

\* 不会卡死在「起来了，但谁也动不了它」
NotStuck == ~(up /\ ~ManagerAvailable /\ ~ENABLED Sweep)
=============================================================================
