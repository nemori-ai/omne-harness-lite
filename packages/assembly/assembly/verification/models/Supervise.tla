------------------------------ MODULE Supervise ------------------------------
(***************************************************************************)
(* 官方的行坏了之后：自恢复，或进程退出并被拉起。                          *)
(*                                                                         *)
(* 行之间有依赖。一行依赖的行没了，它跟着卸载（Cordis 的规矩）。没了的行   *)
(* 在期限内回来，依赖方重跑；没回来，进程带着原因退出，监督者把它拉起。连  *)
(* 着起不来到了上限，不再拉，停在那里等人或等退回上一版。                  *)
(*                                                                         *)
(* 要回答的问题：有没有一种走法让进程挂着不动；有没有一行在它依赖的行不在  *)
(* 时还活着；声明了只能换进程的行有没有被悄悄重跑。                        *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Rows,
  Needs,       \* Needs[r]：r 直接依赖的行
  Flaky,       \* 运行中会没了的行
  Broken,      \* 启动就失败的行（这一版的缺陷）
  RerunOk,     \* 声明了「重跑一遍是安全的」的行；别的行只能换进程
  Limit,       \* 连着起不来几次之后不再拉
  MaxLoss,     \* 模型的界：运行中至多没了几次
  StartRule,   \* "exit"：启动失败就带原因退出；"hang"：挂着不退
  RerunRule    \* "declared"：只重跑声明过的；"any"：不管声明，都重跑

VARIABLES
  proc,        \* "down" | "starting" | "running" | "held"
  up,          \* up[r]：这一行在服务
  lost,        \* 运行中没了、还没回来的行
  crashes,     \* 上一次起稳之后连着倒了几次
  losses,
  unsafe       \* 有一行没声明过却被重跑了

vars == <<proc, up, lost, crashes, losses, unsafe>>

AllUp == \A r \in Rows : up[r]
NeedsUp(r) == \A d \in Needs[r] : up[d]
\* r 没了之后跟着卸载的：直接或间接依赖它的
RECURSIVE Above(_, _)
Above(S, n) == IF n = 0 THEN S
               ELSE Above(S \cup {r \in Rows : Needs[r] \cap S # {}}, n - 1)
Cascade(r) == Above({r}, Cardinality(Rows))

Init ==
  /\ proc = "starting"
  /\ up = [r \in Rows |-> FALSE]
  /\ lost = {}
  /\ crashes = 0
  /\ losses = 0
  /\ unsafe = FALSE

\* 监督者拉起
Start ==
  /\ proc = "down" /\ crashes < Limit
  /\ proc' = "starting"
  /\ up' = [r \in Rows |-> FALSE]
  /\ lost' = {}
  /\ UNCHANGED <<crashes, losses, unsafe>>

Hold ==
  /\ proc = "down" /\ crashes >= Limit
  /\ proc' = "held"
  /\ UNCHANGED <<up, lost, crashes, losses, unsafe>>

\* 启动时一行起来
Load(r) ==
  /\ proc = "starting" /\ ~up[r] /\ NeedsUp(r) /\ r \notin Broken
  /\ up' = [up EXCEPT ![r] = TRUE]
  /\ UNCHANGED <<proc, lost, crashes, losses, unsafe>>

Ready ==
  /\ proc = "starting" /\ AllUp
  /\ proc' = "running"
  /\ crashes' = 0
  /\ UNCHANGED <<up, lost, losses, unsafe>>

\* 启动时有一行起不来：依赖齐了，它自己失败
StartFail ==
  /\ proc = "starting" /\ StartRule = "exit"
  /\ \E r \in Broken : ~up[r] /\ NeedsUp(r)
  /\ proc' = "down"
  /\ crashes' = crashes + 1
  /\ UNCHANGED <<up, lost, losses, unsafe>>

\* 运行中一行没了，依赖它的跟着卸载
Lose(r) ==
  /\ proc = "running" /\ r \in Flaky /\ up[r] /\ losses < MaxLoss
  /\ up' = [x \in Rows |-> IF x \in Cascade(r) THEN FALSE ELSE up[x]]
  /\ lost' = lost \cup {r}
  /\ losses' = losses + 1
  /\ UNCHANGED <<proc, crashes, unsafe>>

\* 一行回来的前提是它依赖的行都在：回来的次序跟着依赖走
Return(r) ==
  /\ proc = "running" /\ r \in lost /\ NeedsUp(r)
  /\ lost' = lost \ {r}
  /\ up' = [up EXCEPT ![r] = TRUE]
  /\ UNCHANGED <<proc, crashes, losses, unsafe>>

\* 自恢复：依赖回来了，这一行重跑
Rerun(r) ==
  /\ proc = "running" /\ ~up[r] /\ r \notin lost /\ NeedsUp(r)
  /\ RerunRule = "any" \/ r \in RerunOk
  /\ up' = [up EXCEPT ![r] = TRUE]
  /\ unsafe' = (unsafe \/ r \notin RerunOk)
  /\ UNCHANGED <<proc, lost, crashes, losses>>

\* 不能重跑的行要回来：进程有计划地退出，让监督者拉起
Restart ==
  /\ proc = "running" /\ RerunRule = "declared"
  /\ \E r \in Rows : ~up[r] /\ r \notin lost /\ NeedsUp(r) /\ r \notin RerunOk
  /\ proc' = "down"
  /\ UNCHANGED <<up, lost, crashes, losses, unsafe>>

\* 没了的行到期限还没回来
Deadline ==
  /\ proc = "running" /\ lost # {}
  /\ proc' = "down"
  /\ crashes' = crashes + 1
  /\ UNCHANGED <<up, lost, losses, unsafe>>

Next ==
  \/ Start \/ Hold \/ Ready \/ StartFail \/ Restart \/ Deadline
  \/ \E r \in Rows : Load(r) \/ Lose(r) \/ Return(r) \/ Rerun(r)

Fair ==
  /\ WF_vars(Start) /\ WF_vars(Hold) /\ WF_vars(Ready) /\ WF_vars(StartFail) /\ WF_vars(Restart)
  /\ WF_vars(Deadline \/ \E r \in Rows : Return(r))
  /\ \A r \in Rows : WF_vars(Load(r)) /\ WF_vars(Rerun(r))

Spec == Init /\ [][Next]_vars /\ Fair

TypeOK ==
  /\ proc \in {"down", "starting", "running", "held"}
  /\ up \in [Rows -> BOOLEAN]
  /\ lost \subseteq Rows

\* 一行在服务时，它依赖的行都在服务
NoZombie == \A r \in Rows : up[r] => NeedsUp(r)
\* 只能换进程的行没有被重跑
OnlyDeclaredRerun == ~unsafe
\* 停在那里只发生在连着起不来到了上限之后
HeldAfterLimit == (proc = "held") => crashes >= Limit
\* 不挂着：总会回到全部在服务，或明确地停在那里
NoHang == []<>((proc = "running" /\ AllUp) \/ proc = "held")
=============================================================================
