--------------------------- MODULE BackgroundWaits ---------------------------
(***************************************************************************)
(* 一次 Tool 调用的「前后台关系 × 等待」：后台执行能不能开 Ask，开了之后      *)
(* 怎样收场。                                                              *)
(*                                                                         *)
(* phase[c]    unstarted -> running -> suspended -> running -> settled      *)
(* relation[c] fg -> bg，至多一次，不回前台                                 *)
(* wait[c]     暂停时等的那种 Ask：askBg（契约声明能在后台等，如等报告）、   *)
(*             askFg（不能，如等人）；不在暂停时为 none                     *)
(* slot[c]     是否持有执行名额：只有运行中持有，暂停即停泊（TL-29）         *)
(*                                                                         *)
(* 交给消费者的：placeholder[c]（占位，至多一次，只给转了后台的调用）与       *)
(* finals[c]（final 的份数，收场时恰好一份）。                              *)
(*                                                                         *)
(* 控制：stop、withdraw(all)、withdraw(fgOnly，即原 Run 取消的够到范围)、     *)
(* background。等待被答与等待被关竞争同一次提交，先成立的那个算数。          *)
(* Crash：运行中的作者段丢失，按失联以 failed 收场。                         *)
(*                                                                         *)
(* Bad 打开一处故意的缺陷，用来确认不变式确实管得住：                         *)
(*   "bgAnyWait"      后台执行可以开任何 Ask（不看契约的声明）               *)
(*   "fgOnlyReachesBg" 原 Run 取消也关掉后台在等的调用                      *)
(*   "waitHoldsSlot"  暂停时不停泊，继续持有名额                             *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Calls, Limit, Bad

VARIABLES phase, relation, wait, slot, placeholder, finals, cause
vars == <<phase, relation, wait, slot, placeholder, finals, cause>>

Waits == {"askBg", "askFg"}
Holding == {c \in Calls : slot[c]}

TypeOK ==
  /\ phase \in [Calls -> {"unstarted", "running", "suspended", "settled"}]
  /\ relation \in [Calls -> {"fg", "bg"}]
  /\ wait \in [Calls -> {"none"} \cup Waits]
  /\ slot \in [Calls -> BOOLEAN]
  /\ placeholder \in [Calls -> 0..1]
  /\ finals \in [Calls -> 0..2]
  /\ cause \in [Calls -> {"none", "completed", "closed", "failed", "runCancel"}]

Init ==
  /\ phase = [c \in Calls |-> "unstarted"]
  /\ relation \in [Calls -> {"fg", "bg"}]          \* 受理时的关系：发起即后台或前台
  /\ wait = [c \in Calls |-> "none"]
  /\ slot = [c \in Calls |-> FALSE]
  /\ placeholder = [c \in Calls |-> IF relation[c] = "bg" THEN 1 ELSE 0]
  /\ finals = [c \in Calls |-> 0]
  /\ cause = [c \in Calls |-> "none"]

Settle(c, why) ==
  /\ phase' = [phase EXCEPT ![c] = "settled"]
  /\ wait' = [wait EXCEPT ![c] = "none"]
  /\ slot' = [slot EXCEPT ![c] = FALSE]
  /\ finals' = [finals EXCEPT ![c] = @ + 1]
  /\ cause' = [cause EXCEPT ![c] = why]

\* 启动或恢复都要拿到名额。
Start(c) ==
  /\ phase[c] = "unstarted"
  /\ Cardinality(Holding) < Limit
  /\ phase' = [phase EXCEPT ![c] = "running"]
  /\ slot' = [slot EXCEPT ![c] = TRUE]
  /\ UNCHANGED <<relation, wait, placeholder, finals, cause>>

\* 转后台（控制、阈值或前台上限）：此刻前台、没有在等。占位交一次。
MoveBackground(c) ==
  /\ phase[c] \in {"unstarted", "running"}
  /\ relation[c] = "fg"
  /\ relation' = [relation EXCEPT ![c] = "bg"]
  /\ placeholder' = [placeholder EXCEPT ![c] = 1]
  /\ UNCHANGED <<phase, wait, slot, finals, cause>>

\* 作者段暂停开一个 Ask。新规则：后台执行只能开契约声明能在后台等的 Ask。
CanOpen(c, k) == relation[c] = "fg" \/ k = "askBg" \/ Bad = "bgAnyWait"

OpenWait(c, k) ==
  /\ phase[c] = "running"
  /\ CanOpen(c, k)
  /\ phase' = [phase EXCEPT ![c] = "suspended"]
  /\ wait' = [wait EXCEPT ![c] = k]
  /\ slot' = [slot EXCEPT ![c] = (Bad = "waitHoldsSlot")]
  /\ UNCHANGED <<relation, placeholder, finals, cause>>

\* 等待被答：恢复段要重新拿名额。
Answer(c) ==
  /\ phase[c] = "suspended"
  /\ Cardinality(Holding \ {c}) < Limit
  /\ phase' = [phase EXCEPT ![c] = "running"]
  /\ wait' = [wait EXCEPT ![c] = "none"]
  /\ slot' = [slot EXCEPT ![c] = TRUE]
  /\ UNCHANGED <<relation, placeholder, finals, cause>>

\* 控制关掉等待：stop 与 withdraw(all) 对前后台都够得到，以 closedResult 收场。
CloseByControl(c) ==
  /\ phase[c] = "suspended"
  /\ Settle(c, "closed")
  /\ UNCHANGED <<relation, placeholder>>

\* 原 Run 取消（withdraw 的 foreground-and-unadmitted）：只够得到前台。
RunCancel(c) ==
  /\ phase[c] \in {"unstarted", "running", "suspended"}
  /\ relation[c] = "fg" \/ Bad = "fgOnlyReachesBg"
  /\ Settle(c, "runCancel")
  /\ UNCHANGED <<relation, placeholder>>

Finish(c) ==
  /\ phase[c] = "running"
  /\ Settle(c, "completed")
  /\ UNCHANGED <<relation, placeholder>>

Crash(c) ==
  /\ phase[c] = "running"
  /\ Settle(c, "failed")
  /\ UNCHANGED <<relation, placeholder>>

Next ==
  \E c \in Calls :
    \/ Start(c)
    \/ MoveBackground(c)
    \/ \E k \in Waits : OpenWait(c, k)
    \/ Answer(c)
    \/ CloseByControl(c)
    \/ RunCancel(c)
    \/ Finish(c)
    \/ Crash(c)

Spec == Init /\ [][Next]_vars

(* 后台在等的只会是契约声明能在后台等的 Ask *)
BackgroundWaitsOnlyWhereDeclared ==
  \A c \in Calls : (relation[c] = "bg" /\ phase[c] = "suspended") => wait[c] = "askBg"

(* 等人的 Ask 永远在前台：没有人会在后台被问 *)
HumanAskStaysForeground ==
  \A c \in Calls : wait[c] = "askFg" => relation[c] = "fg"

(* 交给消费者的：占位只给后台、至多一份；final 恰好一份，只在收场之后 *)
PlaceholderOnlyBackground == \A c \in Calls : placeholder[c] = 1 => relation[c] = "bg"
OneFinal == \A c \in Calls : finals[c] = (IF phase[c] = "settled" THEN 1 ELSE 0)

(* 原 Run 取消不够到后台调用 *)
RunCancelNeverEndsBackground ==
  \A c \in Calls : cause[c] = "runCancel" => relation[c] = "fg"

(* 暂停（不论前后台）不持有名额；名额不超上限 *)
SuspendedHoldsNoSlot == \A c \in Calls : phase[c] = "suspended" => ~slot[c]
SlotsWithinLimit == Cardinality(Holding) <= Limit

=============================================================================
