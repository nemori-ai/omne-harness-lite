--------------------------- MODULE ProgramChildren ---------------------------
(***************************************************************************)
(* 一次程序执行（父调用）与它在程序位置上发起的子调用。                       *)
(*                                                                         *)
(* 父调用域（Tool 账本里父调用的域，一笔条件提交一次迁移）：                  *)
(*   phase     running -> returned -> ended，或 running/returned -> closing  *)
(*             -> ended                                                    *)
(*   accepting 还接不接新的位置登记                                         *)
(*   fence     关闭屏障的范围：none、foreground（撤回前台与未受理）、all      *)
(*   cut[p]    屏障成立那一刻位置 p 的子调用是前台、后台还是还没受理           *)
(*   pos[p]    位置表：none -> registered -> handed -> retained，             *)
(*             或 registered/handed -> excluded                             *)
(* 子调用域（每个子调用自己的域）：                                          *)
(*   child[p]  none -> admitted -> running -> ended                         *)
(*   rel[p]    前台或后台；只从前台到后台                                    *)
(*                                                                         *)
(* 两个域之间没有共同事务。交出（HandOff）只在父域里记下「已交出」，子调用的  *)
(* 受理（ChildAccept）是之后的另一笔提交，可以晚于关闭。live[p] 表示这次      *)
(* 交出的受理操作还没有被排除：否定答案只在排除之后给出。                    *)
(* 子调用的启动（ChildStart）与屏障在同一个启动排序域里排先后。               *)
(* vm 表示程序的虚拟机还在：用户停止与 Run 取消先提交关闭，虚拟机之后才       *)
(* 被终止，这中间程序还可能发起调用。                                       *)
(*                                                                         *)
(* 前提：放行判断在取消生效之后不再放行（Judge 要求 fence 是 none）；人可能   *)
(* 永远不答，所以进展只在关闭之后承诺。不建模结果的内容与名额。              *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Positions, Bad

VARIABLES phase, vm, accepting, fence, cause, outcome,
          pos, judged, live, child, rel, cut, starts, stopAsked,
          lateRegistration, lateStart
vars == <<phase, vm, accepting, fence, cause, outcome, pos, judged, live, child, rel, cut,
          starts, stopAsked, lateRegistration, lateStart>>
parent == <<phase, vm, accepting, fence, cause, outcome>>

Final == {"none", "excluded", "retained"}
Settled == \A p \in Positions : pos[p] \in Final

\* 屏障成立之后，哪些子调用还可以首次启动：没有屏障；或屏障只到前台，而它在那一刻已在后台。
StartAllowed(p) == fence = "none" \/ (fence = "foreground" /\ cut[p] = "bg")
\* 停止请求覆盖谁。
InReach(p) == fence = "all" \/ (fence = "foreground" /\ cut[p] # "bg")

Init == /\ phase = "running" /\ vm = TRUE /\ accepting = TRUE /\ fence = "none"
        /\ cause = "none" /\ outcome = "none"
        /\ pos = [p \in Positions |-> "none"]
        /\ judged = [p \in Positions |-> "none"]
        /\ live = [p \in Positions |-> FALSE]
        /\ child = [p \in Positions |-> "none"]
        /\ rel = [p \in Positions |-> "fg"]
        /\ cut = [p \in Positions |-> "none"]
        /\ starts = [p \in Positions |-> 0]
        /\ stopAsked = [p \in Positions |-> FALSE]
        /\ lateRegistration = FALSE
        /\ lateStart = [p \in Positions |-> FALSE]

\* 程序在一个位置上发起调用：父域登记这个位置。
Register(p) == /\ vm /\ pos[p] = "none"
               /\ accepting \/ Bad = "registerAfterClose"
               /\ pos' = [pos EXCEPT ![p] = "registered"]
               /\ lateRegistration' = (lateRegistration \/ ~accepting)
               /\ UNCHANGED <<parent, judged, live, child, rel, cut, starts, stopAsked, lateStart>>

\* 嵌套动作的放行判断：放行，或不放行（位置随即排除）。
Judge(p) == /\ pos[p] = "registered" /\ judged[p] = "none" /\ fence = "none"
            /\ \E verdict \in {"allowed", "denied"} :
                 /\ judged' = [judged EXCEPT ![p] = verdict]
                 /\ pos' = [pos EXCEPT ![p] = IF verdict = "denied" THEN "excluded" ELSE @]
            /\ UNCHANGED <<parent, live, child, rel, cut, starts, stopAsked, lateRegistration, lateStart>>

\* 放行之后交出：父域记「已交出」，断言屏障没有成立。
HandOff(p) == /\ pos[p] = "registered" /\ judged[p] = "allowed" /\ fence = "none"
              /\ pos' = [pos EXCEPT ![p] = "handed"]
              /\ live' = [live EXCEPT ![p] = TRUE]
              /\ UNCHANGED <<parent, judged, child, rel, cut, starts, stopAsked, lateRegistration, lateStart>>

\* 子调用被 Tool 受理。同一位置重送只认回原调用。
ChildAccept(p) == /\ live[p]
                  /\ child[p] = "none" \/ (Bad = "redeliver" /\ child[p] = "ended" /\ starts[p] < 2)
                  /\ child' = [child EXCEPT ![p] = "admitted"]
                  /\ UNCHANGED <<parent, pos, judged, live, rel, cut, starts, stopAsked, lateRegistration, lateStart>>

ChildStart(p) == /\ child[p] = "admitted"
                 /\ StartAllowed(p) \/ Bad = "startAfterClose"
                 /\ child' = [child EXCEPT ![p] = "running"]
                 /\ starts' = [starts EXCEPT ![p] = @ + 1]
                 /\ lateStart' = [lateStart EXCEPT ![p] = @ \/ ~StartAllowed(p)]
                 /\ UNCHANGED <<parent, pos, judged, live, rel, cut, stopAsked, lateRegistration>>

\* 屏障挡住的、还没启动的子调用：排除启动，以中断收场。
ChildExclude(p) == /\ child[p] = "admitted" /\ ~StartAllowed(p)
                   /\ child' = [child EXCEPT ![p] = "ended"]
                   /\ UNCHANGED <<parent, pos, judged, live, rel, cut, starts, stopAsked, lateRegistration, lateStart>>

ChildBackground(p) == /\ child[p] \in {"admitted", "running"} /\ rel[p] = "fg"
                      /\ rel' = [rel EXCEPT ![p] = "bg"]
                      /\ UNCHANGED <<parent, pos, judged, live, child, cut, starts, stopAsked, lateRegistration, lateStart>>

\* 子调用真实收场：自己做完，或被停下。
ChildEnd(p) == /\ child[p] = "running"
               /\ child' = [child EXCEPT ![p] = "ended"]
               /\ UNCHANGED <<parent, pos, judged, live, rel, cut, starts, stopAsked, lateRegistration, lateStart>>

\* 父域承接子调用的结果。
Retain(p) == /\ pos[p] = "handed" /\ child[p] = "ended"
             /\ pos' = [pos EXCEPT ![p] = "retained"]
             /\ UNCHANGED <<parent, judged, live, child, rel, cut, starts, stopAsked, lateRegistration, lateStart>>

\* 关闭之后：还没问完放行的位置排除。
CloseExclude(p) == /\ Bad # "noCloseExclude"
                   /\ fence # "none" /\ pos[p] = "registered"
                   /\ pos' = [pos EXCEPT ![p] = "excluded"]
                   /\ UNCHANGED <<parent, judged, live, child, rel, cut, starts, stopAsked, lateRegistration, lateStart>>

\* 关闭之后：已交出而没受理的位置，先排除它的受理操作，再记排除。
ResolveUnaccepted(p) == /\ fence # "none" /\ pos[p] = "handed" /\ child[p] = "none"
                        /\ pos' = [pos EXCEPT ![p] = "excluded"]
                        /\ live' = [live EXCEPT ![p] = (Bad = "excludeWithoutFence")]
                        /\ UNCHANGED <<parent, judged, child, rel, cut, starts, stopAsked, lateRegistration, lateStart>>

\* 关闭之后：对范围之内、还在运行的子调用请求停止。
RequestStop(p) == /\ fence # "none" /\ pos[p] = "handed" /\ child[p] = "running" /\ ~stopAsked[p]
                  /\ InReach(p) \/ Bad = "withdrawStopsBackground"
                  /\ stopAsked' = [stopAsked EXCEPT ![p] = TRUE]
                  /\ UNCHANGED <<parent, pos, judged, live, child, rel, cut, starts, lateRegistration, lateStart>>

Relations == [p \in Positions |-> IF child[p] = "none" THEN "none" ELSE rel[p]]

BodyReturn == /\ vm /\ phase = "running"
              /\ vm' = FALSE /\ phase' = "returned" /\ accepting' = FALSE
              /\ UNCHANGED <<fence, cause, outcome, pos, judged, live, child, rel, cut, starts, stopAsked, lateRegistration, lateStart>>

\* 程序异常、超限或确认失去连续性：虚拟机已经不在。
Fail == /\ vm /\ phase = "running"
        /\ vm' = FALSE /\ phase' = "closing" /\ accepting' = FALSE
        /\ fence' = "all" /\ cause' = "failed" /\ cut' = Relations
        /\ UNCHANGED <<outcome, pos, judged, live, child, rel, starts, stopAsked, lateRegistration, lateStart>>

\* 用户停止这次程序执行。
Stop == /\ phase \in {"running", "returned"}
        /\ phase' = "closing" /\ accepting' = FALSE
        /\ fence' = "all" /\ cause' = "stopped" /\ cut' = Relations
        /\ UNCHANGED <<vm, outcome, pos, judged, live, child, rel, starts, stopAsked, lateRegistration, lateStart>>

\* Run 取消：撤回前台与未受理。
Withdraw == /\ phase \in {"running", "returned"}
            /\ phase' = "closing" /\ accepting' = FALSE
            /\ fence' = "foreground" /\ cause' = "withdrawn" /\ cut' = Relations
            /\ UNCHANGED <<vm, outcome, pos, judged, live, child, rel, starts, stopAsked, lateRegistration, lateStart>>

\* 撤回之后又来了停止：范围只扩大，原因不改。
Escalate == /\ phase = "closing" /\ fence = "foreground"
            /\ fence' = "all"
            /\ UNCHANGED <<phase, vm, accepting, cause, outcome, pos, judged, live, child, rel, cut, starts, stopAsked, lateRegistration, lateStart>>

KillVm == /\ vm /\ phase = "closing"
          /\ vm' = FALSE
          /\ UNCHANGED <<phase, accepting, fence, cause, outcome, pos, judged, live, child, rel, cut, starts, stopAsked, lateRegistration, lateStart>>

\* 正常完成：正文已返回，每个位置都有交代。
Finish == /\ phase = "returned"
          /\ Settled \/ Bad = "finishEarly"
          /\ phase' = "ended" /\ outcome' = "completed"
          /\ UNCHANGED <<vm, accepting, fence, cause, pos, judged, live, child, rel, cut, starts, stopAsked, lateRegistration, lateStart>>

\* 关闭的父调用可以先收场；子调用的责任留在待办里继续做。
CloseEnd == /\ phase = "closing" /\ ~vm
            /\ phase' = "ended" /\ outcome' = cause
            /\ UNCHANGED <<vm, accepting, fence, cause, pos, judged, live, child, rel, cut, starts, stopAsked, lateRegistration, lateStart>>

Next == \/ BodyReturn \/ Fail \/ Stop \/ Withdraw \/ Escalate \/ KillVm \/ Finish \/ CloseEnd
        \/ \E p \in Positions :
             \/ Register(p) \/ Judge(p) \/ HandOff(p) \/ ChildAccept(p) \/ ChildStart(p)
             \/ ChildExclude(p) \/ ChildBackground(p) \/ ChildEnd(p) \/ Retain(p)
             \/ CloseExclude(p) \/ ResolveUnaccepted(p) \/ RequestStop(p)

Spec == Init /\ [][Next]_vars

Driver(p) == \/ ChildAccept(p) \/ ChildStart(p) \/ ChildExclude(p) \/ ChildEnd(p) \/ Retain(p)
             \/ CloseExclude(p) \/ ResolveUnaccepted(p)
FairSpec == Spec /\ WF_vars(KillVm) /\ \A p \in Positions : WF_vars(Driver(p))

TypeOK == /\ phase \in {"running", "returned", "closing", "ended"}
          /\ vm \in BOOLEAN /\ accepting \in BOOLEAN
          /\ fence \in {"none", "foreground", "all"}
          /\ cause \in {"none", "failed", "stopped", "withdrawn"}
          /\ outcome \in {"none", "completed", "failed", "stopped", "withdrawn"}
          /\ pos \in [Positions -> {"none", "registered", "handed", "excluded", "retained"}]
          /\ judged \in [Positions -> {"none", "allowed", "denied"}]
          /\ live \in [Positions -> BOOLEAN]
          /\ child \in [Positions -> {"none", "admitted", "running", "ended"}]
          /\ rel \in [Positions -> {"fg", "bg"}]
          /\ cut \in [Positions -> {"none", "fg", "bg"}]
          /\ starts \in [Positions -> 0..2]
          /\ stopAsked \in [Positions -> BOOLEAN]

\* 同一位置的函数至多执行一次。
StartAtMostOnce == \A p \in Positions : starts[p] <= 1
\* 关闭之后没有新的位置被登记。
NoLateRegistration == ~lateRegistration
\* 屏障挡住的子调用不会在屏障之后首次启动。
NoStartBehindFence == \A p \in Positions : ~lateStart[p]
\* 报完成，当且仅当每个位置都有交代、被承接的子调用都已真实收场。
CompletedMeansSettled == outcome = "completed" =>
                           \A p \in Positions : /\ pos[p] \in Final
                                                /\ child[p] \in {"none", "ended"}
\* 关闭过的程序不报完成，结局就是关闭的原因。
ClosedKeepsCause == /\ fence # "none" => outcome \in {"none", cause}
                    /\ outcome \in {"failed", "stopped", "withdrawn"} => outcome = cause
\* 每个被受理的子调用都在位置表里，不会被记成已排除。
NoOrphanChild == \A p \in Positions : child[p] # "none" => pos[p] \in {"handed", "retained"}
\* Run 取消不停屏障成立时已在后台的子调用。
WithdrawSparesBackground == \A p \in Positions : (stopAsked[p] /\ fence = "foreground") => cut[p] # "bg"
\* 没有放行就没有子调用。
AdmittedOnlyIfAllowed == \A p \in Positions : child[p] # "none" => judged[p] = "allowed"

\* 关闭之后，每个位置最终都有交代。
ClosedSettles == (fence # "none") ~> Settled
=============================================================================
