------------------------------ MODULE Versions ------------------------------
(***************************************************************************)
(* 版本目录与当前指针。                                                    *)
(*                                                                         *)
(* 一版一个目录。装是分步的，可能装到一半中断。指针指着要启动的那一版；切  *)
(* 换只改指针。一版起来之后站稳了才算「起稳过」。指着的一版连着起不来到了  *)
(* 上限，指针退回上一份起稳过的。服务端与客户端用同一套。                  *)
(*                                                                         *)
(* 要回答的问题：指针会不会指到一份没装完的版本；一份坏的版本会不会让系统  *)
(* 永远起不来。                                                            *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
  Vers,          \* 版本的集合
  First,         \* 出厂的那一版：装好、起稳过
  Bad,           \* 起来就倒的版本
  Limit,         \* 连着倒几次之后退回
  MaxSwitch,     \* 模型的界：至多切几次
  SwitchRule,    \* "complete-only"：只切到装完的；"any"：装到一半的也切
  RollbackRule   \* "last-settled"：退回上一份起稳过的；"none"：不退

VARIABLES
  inst,      \* inst[v]："absent" | "partial" | "complete"
  settled,   \* settled[v]：起稳过
  cur,       \* 指针
  prev,      \* 上一份起稳过的
  running,
  crashes,
  switches

vars == <<inst, settled, cur, prev, running, crashes, switches>>

Init ==
  /\ inst = [v \in Vers |-> IF v = First THEN "complete" ELSE "absent"]
  /\ settled = [v \in Vers |-> v = First]
  /\ cur = First
  /\ prev = First
  /\ running = FALSE
  /\ crashes = 0
  /\ switches = 0

BeginInstall(v) ==
  /\ inst[v] = "absent"
  /\ inst' = [inst EXCEPT ![v] = "partial"]
  /\ UNCHANGED <<settled, cur, prev, running, crashes, switches>>

FinishInstall(v) ==
  /\ inst[v] = "partial" /\ v # cur
  /\ inst' = [inst EXCEPT ![v] = "complete"]
  /\ UNCHANGED <<settled, cur, prev, running, crashes, switches>>

\* 切换：只改指针。下一次起来的就是它
Switch(v) ==
  /\ v # cur /\ switches < MaxSwitch
  /\ IF SwitchRule = "any" THEN inst[v] # "absent" ELSE inst[v] = "complete"
  /\ cur' = v
  /\ running' = FALSE
  /\ crashes' = 0
  /\ switches' = switches + 1
  /\ UNCHANGED <<inst, settled, prev>>

Start ==
  /\ ~running /\ (crashes < Limit \/ settled[cur])
  /\ running' = TRUE
  /\ UNCHANGED <<inst, settled, cur, prev, crashes, switches>>

Crash ==
  /\ running /\ (cur \in Bad \/ inst[cur] # "complete")
  /\ running' = FALSE
  /\ crashes' = crashes + 1
  /\ UNCHANGED <<inst, settled, cur, prev, switches>>

Settle ==
  /\ running /\ cur \notin Bad /\ inst[cur] = "complete" /\ ~settled[cur]
  /\ settled' = [settled EXCEPT ![cur] = TRUE]
  /\ prev' = cur
  /\ crashes' = 0
  /\ UNCHANGED <<inst, cur, running, switches>>

Rollback ==
  /\ RollbackRule = "last-settled"
  /\ ~running /\ crashes >= Limit /\ ~settled[cur]
  /\ cur' = prev
  /\ crashes' = 0
  /\ UNCHANGED <<inst, settled, prev, running, switches>>

Next ==
  \/ Start \/ Crash \/ Settle \/ Rollback
  \/ \E v \in Vers : BeginInstall(v) \/ FinishInstall(v) \/ Switch(v)

Fair == WF_vars(Start) /\ WF_vars(Crash) /\ WF_vars(Settle) /\ WF_vars(Rollback)

Spec == Init /\ [][Next]_vars /\ Fair

TypeOK ==
  /\ inst \in [Vers -> {"absent", "partial", "complete"}]
  /\ settled \in [Vers -> BOOLEAN]
  /\ cur \in Vers /\ prev \in Vers

\* 指针只指向一份完整装好的版本
PointerComplete == inst[cur] = "complete"
\* 退路总是一份起稳过、装完的版本
PrevSettled == settled[prev] /\ inst[prev] = "complete"
\* 一份坏的版本不会让系统永远起不来：总会回到一份起稳过的版本上跑着
Recovers == []<>(running /\ settled[cur])
=============================================================================
