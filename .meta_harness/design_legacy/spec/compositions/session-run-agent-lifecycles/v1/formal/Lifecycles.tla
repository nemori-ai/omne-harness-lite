---------------------------- MODULE Lifecycles ----------------------------
(***************************************************************************)
(* Session、Run、Agent 实例三台状态机、三条关系与级联的有限模型。          *)
(*                                                                         *)
(* 对象与关系：                                                            *)
(*   sess      Session 生命周期 open / archived / deleted                 *)
(*   run[r]    Run 状态；占位 = 处于 running / waiting / stopping 的 Run   *)
(*   epoch[r]  当前 epoch 序号；epochOpen[r] 该 epoch 是否未封闭            *)
(*   holder[r] 持有 epoch 的实例（执行者关系，不耐久，崩溃即清空）          *)
(*   inst[a]   实例 absent / ready / closing                              *)
(*   cont[r]   已裁决（classified）而未消费、指向 r 的接续数               *)
(*   终态含 superseded（被新输入越过，run v2 RN-04）：Supersede 一步完成    *)
(*   入队新输入、旧 Run 进终态、接续改判 context（cont 清零、不进队列）     *)
(*                                                                         *)
(* SameDomain = TRUE：Session 与 Run 同一协调域，形状 2 的级联为原子动作。 *)
(* SameDomain = FALSE：跨域。Run 域提交事实并留下意图，Session 域按视图    *)
(*   sessView 工作并幂等消费意图；FreshGate 决定 Session 的门是否要求视图  *)
(*   与 Run 实际状态一致（版本戳）。                                       *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Runs, Instances, MaxQueue, MaxCont, MaxEpoch, MaxCrash,
          SameDomain, FreshGate

NONE == "none"
\* LC-02：stopping 只由活动 Run 的终止受理进入（StopCore 的前提），因此它占位；
\* run v2 RN-03 允许 interrupted 升级进入的不占位 stopping，本模型不建模该转移。
Placeholding == {"running", "waiting", "stopping"}
Terminal == {"completed", "failed", "cancelled", "superseded"}
RunStates == {NONE, "interrupted"} \cup Placeholding \cup Terminal
InstStates == {"absent", "ready", "closing"}
SessStates == {"open", "archived", "deleted"}
Outcomes == {"completed", "cancelled"}
IntentSet == [kind : {"create"}, run : Runs, outcome : {NONE}]
             \cup [kind : {"settle"}, run : Runs, outcome : Outcomes]

VARIABLES sess, hold, queue, run, epoch, epochOpen, holder, inst, cont,
          sessView, intents, created, crashes

vars == <<sess, hold, queue, run, epoch, epochOpen, holder, inst, cont,
          sessView, intents, created, crashes>>

View(r) == IF SameDomain THEN run[r] ELSE sessView[r]
Placeholder == {r \in Runs : run[r] \in Placeholding}
ViewPlaceholder == {r \in Runs : View(r) \in Placeholding}
LiveInst == {a \in Instances : inst[a] \in {"ready", "closing"}}
Holding(a) == {r \in Runs : holder[r] = a}
GateFresh == SameDomain \/ (FreshGate => (\A r \in Runs : sessView[r] = run[r]))
CreateIntent(r) == [kind |-> "create", run |-> r, outcome |-> NONE]
SettleIntent(r, o) == [kind |-> "settle", run |-> r, outcome |-> o]

TypeOK ==
  /\ sess \in SessStates /\ hold \in BOOLEAN
  /\ queue \in 0..(MaxQueue + MaxCont * Cardinality(Runs))
  /\ run \in [Runs -> RunStates]
  /\ epoch \in [Runs -> 0..MaxEpoch]
  /\ epochOpen \in [Runs -> BOOLEAN]
  /\ holder \in [Runs -> Instances \cup {NONE}]
  /\ inst \in [Instances -> InstStates]
  /\ cont \in [Runs -> 0..MaxCont]
  /\ sessView \in [Runs -> RunStates]
  /\ intents \subseteq IntentSet
  /\ created \subseteq Runs
  /\ crashes \in 0..MaxCrash

Init ==
  /\ sess = "open" /\ hold = FALSE /\ queue = 0
  /\ run = [r \in Runs |-> NONE]
  /\ epoch = [r \in Runs |-> 0]
  /\ epochOpen = [r \in Runs |-> FALSE]
  /\ holder = [r \in Runs |-> NONE]
  /\ inst = [a \in Instances |-> "absent"]
  /\ cont = [r \in Runs |-> 0]
  /\ sessView = [r \in Runs |-> NONE]
  /\ intents = {} /\ created = {} /\ crashes = 0

(***************************************************************************)
(* Session 侧                                                              *)
(***************************************************************************)
Enqueue ==
  /\ sess = "open" /\ queue < MaxQueue
  /\ queue' = queue + 1
  /\ UNCHANGED <<sess, hold, run, epoch, epochOpen, holder, inst, cont,
                 sessView, intents, created, crashes>>

SetHold ==
  /\ sess = "open" /\ ~hold
  /\ hold' = TRUE
  /\ UNCHANGED <<sess, queue, run, epoch, epochOpen, holder, inst, cont,
                 sessView, intents, created, crashes>>

ReleaseHold ==
  /\ hold
  /\ hold' = FALSE
  /\ UNCHANGED <<sess, queue, run, epoch, epochOpen, holder, inst, cont,
                 sessView, intents, created, crashes>>

\* 级联行 1：前提"无非终态 Run"在门内读 Run 状态；成功后队列项与接续同提交关闭
Archive ==
  /\ sess = "open" /\ GateFresh
  /\ \A r \in Runs : View(r) \in {NONE} \cup Terminal
  /\ sess' = "archived" /\ queue' = 0
  /\ cont' = [r \in Runs |-> 0]
  \* 跨域义务：已取项而尚未建 Run 的 create 意图随归档关闭（closed_by_archive）
  /\ intents' = {i \in intents : i.kind /= "create"}
  /\ UNCHANGED <<hold, run, epoch, epochOpen, holder, inst, sessView,
                 created, crashes>>

Restore ==
  /\ sess = "archived"
  /\ sess' = "open"
  /\ UNCHANGED <<hold, queue, run, epoch, epochOpen, holder, inst, cont,
                 sessView, intents, created, crashes>>

Delete ==
  /\ sess = "archived"
  /\ sess' = "deleted"
  /\ UNCHANGED <<hold, queue, run, epoch, epochOpen, holder, inst, cont,
                 sessView, intents, created, crashes>>

\* 裁决者：把到达判为接续；跨域时按 Session 视图（可能陈旧）判断
Classify(r) ==
  /\ sess = "open" /\ GateFresh
  /\ View(r) \in {"running", "waiting"}
  /\ cont[r] < MaxCont
  /\ cont' = [cont EXCEPT ![r] = @ + 1]
  /\ UNCHANGED <<sess, hold, queue, run, epoch, epochOpen, holder, inst,
                 sessView, intents, created, crashes>>

(***************************************************************************)
(* 实例侧                                                                  *)
(***************************************************************************)
Activate(a) ==
  /\ sess = "open" /\ inst[a] = "absent" /\ LiveInst = {}
  /\ inst' = [inst EXCEPT ![a] = "ready"]
  /\ UNCHANGED <<sess, hold, queue, run, epoch, epochOpen, holder, cont,
                 sessView, intents, created, crashes>>

RequestRetire(a) ==
  /\ inst[a] = "ready"
  /\ inst' = [inst EXCEPT ![a] = "closing"]
  /\ UNCHANGED <<sess, hold, queue, run, epoch, epochOpen, holder, cont,
                 sessView, intents, created, crashes>>

\* 级联行 6：退役中的实例在安全边界 Yield，封闭 epoch，Run 状态与占位不变
Yield(a, r) ==
  /\ inst[a] = "closing" /\ holder[r] = a
  /\ epochOpen' = [epochOpen EXCEPT ![r] = FALSE]
  /\ holder' = [holder EXCEPT ![r] = NONE]
  /\ UNCHANGED <<sess, hold, queue, run, epoch, inst, cont, sessView,
                 intents, created, crashes>>

Dispose(a) ==
  /\ inst[a] = "closing" /\ Holding(a) = {}
  /\ inst' = [inst EXCEPT ![a] = "absent"]
  /\ UNCHANGED <<sess, hold, queue, run, epoch, epochOpen, holder, cont,
                 sessView, intents, created, crashes>>

\* 级联行 1 的形状 3 部分：宿主对 archived 事实的反应，关闭空闲实例
CloseIdleOnArchive(a) ==
  /\ sess /= "open" /\ inst[a] = "ready" /\ Holding(a) = {}
  /\ inst' = [inst EXCEPT ![a] = "closing"]
  /\ UNCHANGED <<sess, hold, queue, run, epoch, epochOpen, holder, cont,
                 sessView, intents, created, crashes>>

\* 级联行 7：崩溃清空执行者关系，epoch 仍未封闭；Registry 从空重建
Crash ==
  /\ crashes < MaxCrash /\ LiveInst /= {}
  /\ inst' = [a \in Instances |-> "absent"]
  /\ holder' = [r \in Runs |-> NONE]
  /\ crashes' = crashes + 1
  /\ UNCHANGED <<sess, hold, queue, run, epoch, epochOpen, cont, sessView,
                 intents, created>>

(***************************************************************************)
(* Run 的启动与重取                                                        *)
(***************************************************************************)
IssueEpoch(r, a) ==
  /\ epoch[r] < MaxEpoch
  /\ epoch' = [epoch EXCEPT ![r] = @ + 1]
  /\ epochOpen' = [epochOpen EXCEPT ![r] = TRUE]
  /\ holder' = [holder EXCEPT ![r] = a]

\* 级联行 3 反向（同域）：取项 + 建 Run + epoch 同一提交
CreateRun(r, a) ==
  /\ SameDomain /\ sess = "open" /\ ~hold /\ queue > 0
  /\ Placeholder = {} /\ run[r] = NONE /\ inst[a] = "ready"
  /\ queue' = queue - 1
  /\ run' = [run EXCEPT ![r] = "running"]
  /\ IssueEpoch(r, a)
  /\ UNCHANGED <<sess, hold, inst, cont, sessView, intents, created, crashes>>

\* 跨域第一步：Session 取项并留下 create 意图
TakeSplit(r) ==
  /\ ~SameDomain /\ sess = "open" /\ ~hold /\ queue > 0 /\ GateFresh
  /\ ViewPlaceholder = {} /\ sessView[r] = NONE /\ r \notin created
  /\ CreateIntent(r) \notin intents
  /\ queue' = queue - 1
  /\ intents' = intents \cup {CreateIntent(r)}
  /\ sessView' = [sessView EXCEPT ![r] = "running"]
  /\ UNCHANGED <<sess, hold, run, epoch, epochOpen, holder, inst, cont,
                 created, crashes>>

\* 跨域第二步：Run 域幂等消费 create 意图，并在自己的门里重查占位
CreateFromIntent(r, a) ==
  /\ ~SameDomain /\ CreateIntent(r) \in intents /\ inst[a] = "ready"
  /\ sess = "open"
  /\ IF r \in created
       THEN UNCHANGED <<run, epoch, epochOpen, holder>>
       ELSE /\ Placeholder = {} /\ run[r] = NONE
            /\ run' = [run EXCEPT ![r] = "running"]
            /\ IssueEpoch(r, a)
  /\ created' = created \cup {r}
  /\ UNCHANGED <<sess, hold, queue, inst, cont, sessView, intents, crashes>>

\* 级联行 7 与行 6 之后：执行者为空的占位 Run 只能以新 epoch 重取
Reacquire(r, a) ==
  /\ run[r] \in Placeholding /\ holder[r] = NONE
  /\ sess = "open" /\ inst[a] = "ready"
  /\ IssueEpoch(r, a)
  /\ UNCHANGED <<sess, hold, queue, run, inst, cont, sessView, intents,
                 created, crashes>>

Resume(r, a) ==
  /\ run[r] = "interrupted" /\ sess = "open" /\ ~hold
  /\ Placeholder = {} /\ inst[a] = "ready"
  /\ run' = [run EXCEPT ![r] = "running"]
  /\ IssueEpoch(r, a)
  /\ UNCHANGED <<sess, hold, queue, inst, cont, sessView, intents, created,
                 crashes>>

(***************************************************************************)
(* Run 的推进、结算与控制                                                  *)
(***************************************************************************)
Await(r) ==
  /\ run[r] = "running" /\ holder[r] /= NONE /\ epochOpen[r]
  /\ run' = [run EXCEPT ![r] = "waiting"]
  /\ UNCHANGED <<sess, hold, queue, epoch, epochOpen, holder, inst, cont,
                 sessView, intents, created, crashes>>

Consume(r) ==
  /\ run[r] = "waiting" /\ holder[r] /= NONE /\ epochOpen[r] /\ cont[r] > 0
  /\ cont' = [cont EXCEPT ![r] = @ - 1]
  /\ run' = [run EXCEPT ![r] = "running"]
  /\ UNCHANGED <<sess, hold, queue, epoch, epochOpen, holder, inst,
                 sessView, intents, created, crashes>>

\* 级联行 3：终态 + 接续转 trigger（同域同提交；跨域留意图）
Complete(r) ==
  /\ run[r] = "running" /\ holder[r] /= NONE /\ epochOpen[r]
  /\ run' = [run EXCEPT ![r] = "completed"]
  /\ holder' = [holder EXCEPT ![r] = NONE]
  /\ epochOpen' = [epochOpen EXCEPT ![r] = FALSE]
  /\ IF SameDomain
       THEN /\ queue' = queue + cont[r]
            /\ cont' = [cont EXCEPT ![r] = 0]
            /\ UNCHANGED intents
       ELSE /\ intents' = intents \cup {SettleIntent(r, "completed")}
            /\ UNCHANGED <<queue, cont>>
  /\ UNCHANGED <<sess, hold, epoch, inst, sessView, created, crashes>>

\* 级联行 5：interrupt 释放执行者，占位派生为空，接续保留
Interrupt(r) ==
  /\ run[r] \in {"running", "waiting"}
  /\ run' = [run EXCEPT ![r] = "interrupted"]
  /\ holder' = [holder EXCEPT ![r] = NONE]
  /\ epochOpen' = [epochOpen EXCEPT ![r] = FALSE]
  /\ UNCHANGED <<sess, hold, queue, epoch, inst, cont, sessView, intents,
                 created, crashes>>

\* 级联行 2/4：force_stop 在受理点撤 epoch，Run 进入 stopping。
\* 模型发现：interrupted 的 Run 已安全收口，若再经 stopping 会重新占位、与新 Run 并存
\* 而违反占位唯一；因此对 interrupted 的 cancel/force_stop 直接进入 cancelled（见
\* CancelInterrupted）。
StopCore(r) ==
  /\ run[r] \in {"running", "waiting"}
  /\ run' = [run EXCEPT ![r] = "stopping"]
  /\ holder' = [holder EXCEPT ![r] = NONE]
  /\ epochOpen' = [epochOpen EXCEPT ![r] = FALSE]

CloseConts(r) ==
  IF SameDomain
    THEN /\ cont' = [cont EXCEPT ![r] = 0]
         /\ UNCHANGED intents
    ELSE /\ intents' = intents \cup {SettleIntent(r, "cancelled")}
         /\ UNCHANGED cont

CancelInterrupted(r) ==
  /\ run[r] = "interrupted"
  /\ run' = [run EXCEPT ![r] = "cancelled"]
  /\ CloseConts(r)
  /\ UNCHANGED <<sess, hold, queue, epoch, epochOpen, holder, inst,
                 sessView, created, crashes>>

\* 级联行 8 + 行 4（superseded）：interrupt_then_run 的受理与旧 Run 的越过合成一步。
\* 新输入耐久入队；旧 Run 直接进入终态 superseded（不经 interrupted，不可 resume）；
\* 同一提交整簿注销等待登记并把未消费接续改判为 context —— 模型中表现为 cont 清零
\* 且不进队列（context 不创建 Run、不唤醒）。只在同域建模；跨域的意图形态未建模。
Supersede(r) ==
  /\ SameDomain /\ sess = "open"
  /\ run[r] \in {"running", "waiting"}
  /\ queue < MaxQueue
  /\ queue' = queue + 1
  /\ run' = [run EXCEPT ![r] = "superseded"]
  /\ holder' = [holder EXCEPT ![r] = NONE]
  /\ epochOpen' = [epochOpen EXCEPT ![r] = FALSE]
  /\ cont' = [cont EXCEPT ![r] = 0]
  /\ UNCHANGED <<sess, hold, epoch, inst, sessView, intents, created, crashes>>

ForceStop(r) ==
  /\ StopCore(r)
  /\ UNCHANGED <<sess, hold, queue, epoch, inst, cont, sessView, intents,
                 created, crashes>>

SessionForceStop(r) ==
  /\ StopCore(r) /\ ~hold
  /\ hold' = TRUE
  /\ UNCHANGED <<sess, queue, epoch, inst, cont, sessView, intents,
                 created, crashes>>

\* 隔离证实：stopping → cancelled；接续关闭（同域同提交；跨域留意图）
Isolated(r) ==
  /\ run[r] = "stopping"
  /\ run' = [run EXCEPT ![r] = "cancelled"]
  /\ holder' = [holder EXCEPT ![r] = NONE]
  /\ epochOpen' = [epochOpen EXCEPT ![r] = FALSE]
  /\ CloseConts(r)
  /\ UNCHANGED <<sess, hold, queue, epoch, inst, sessView, created, crashes>>

(***************************************************************************)
(* 跨域：Session 域消费意图与刷新视图（至少一次投递，幂等）                *)
(***************************************************************************)
ConsumeSettle(r, o) ==
  /\ ~SameDomain /\ SettleIntent(r, o) \in intents
  /\ queue' = IF o = "completed" /\ sess = "open" THEN queue + cont[r] ELSE queue
  /\ cont' = [cont EXCEPT ![r] = 0]
  /\ sessView' = [sessView EXCEPT ![r] = o]
  /\ UNCHANGED <<sess, hold, run, epoch, epochOpen, holder, inst, intents,
                 created, crashes>>

RemoveIntent(i) ==
  /\ i \in intents
  /\ (i.kind = "create" => i.run \in created)
  /\ (i.kind = "settle" => (cont[i.run] = 0 /\ sessView[i.run] = i.outcome))
  /\ intents' = intents \ {i}
  /\ UNCHANGED <<sess, hold, queue, run, epoch, epochOpen, holder, inst,
                 cont, sessView, created, crashes>>

RefreshView(r) ==
  /\ ~SameDomain /\ sessView[r] /= run[r]
  /\ sessView' = [sessView EXCEPT ![r] = run[r]]
  /\ UNCHANGED <<sess, hold, queue, run, epoch, epochOpen, holder, inst,
                 cont, intents, created, crashes>>

(***************************************************************************)
(* 规约                                                                    *)
(***************************************************************************)
\* deleted 是吸收态：显式停留，避免被当作死锁
Done == sess = "deleted" /\ UNCHANGED vars

Next ==
  \/ Enqueue \/ SetHold \/ ReleaseHold \/ Archive \/ Restore \/ Delete
  \/ Crash \/ Done
  \/ \E a \in Instances :
       Activate(a) \/ RequestRetire(a) \/ Dispose(a) \/ CloseIdleOnArchive(a)
  \/ \E r \in Runs :
       \/ Classify(r) \/ Await(r) \/ Consume(r) \/ Complete(r)
       \/ Interrupt(r) \/ ForceStop(r) \/ SessionForceStop(r) \/ Isolated(r)
       \/ CancelInterrupted(r) \/ Supersede(r)
       \/ TakeSplit(r) \/ RefreshView(r)
       \/ \E o \in Outcomes : ConsumeSettle(r, o)
  \/ \E a \in Instances, r \in Runs :
       Yield(a, r) \/ CreateRun(r, a) \/ CreateFromIntent(r, a)
       \/ Reacquire(r, a) \/ Resume(r, a)
  \/ \E i \in IntentSet : RemoveIntent(i)

Spec == Init /\ [][Next]_vars

Fair ==
  /\ SF_vars(\E a \in Instances, r \in Runs : CreateRun(r, a))
  /\ SF_vars(\E a \in Instances, r \in Runs : CreateFromIntent(r, a))
  /\ SF_vars(\E a \in Instances, r \in Runs : Reacquire(r, a))
  /\ WF_vars(\E a \in Instances : Activate(a))
  /\ WF_vars(\E a \in Instances : CloseIdleOnArchive(a))
  /\ WF_vars(\E a \in Instances : Dispose(a))
  /\ WF_vars(\E r \in Runs, o \in Outcomes : ConsumeSettle(r, o))
  /\ WF_vars(\E r \in Runs : RefreshView(r))
  /\ WF_vars(\E i \in IntentSet : RemoveIntent(i))

SpecFair == Spec /\ Fair

(***************************************************************************)
(* 性质                                                                    *)
(***************************************************************************)
\* L-2 / I-1：占位唯一
I1 == Cardinality(Placeholder) <= 1

\* I-13：接续只指向非终态 Run（跨域陈旧读会破坏）
I13 == \A r \in Runs : cont[r] > 0 => run[r] \notin Terminal

\* I-14：终态后无未消费接续（同域为不变量；跨域退化为最终性质 I14Eventually）
I14 == \A r \in Runs : run[r] \in Terminal => cont[r] = 0

\* S-2：归档/删除后无排队项、无未消费接续
S2 == sess /= "open" => (queue = 0 /\ \A r \in Runs : cont[r] = 0)

\* A-1：同一时刻至多一个未释放实例
A1 == Cardinality(LiveInst) <= 1

\* L-1：执行者存在 ⇒ 是活实例、epoch 未封闭、Run 占位
L1 == \A r \in Runs :
        holder[r] /= NONE =>
          /\ inst[holder[r]] \in {"ready", "closing"}
          /\ epochOpen[r]
          /\ run[r] \in Placeholding

\* L-3：归档/删除后没有占位 Run，也没有执行者（跨域陈旧读会破坏）
L3 == sess /= "open" => (Placeholder = {} /\ \A r \in Runs : holder[r] = NONE)

\* A-3：closing 实例不再持有已封闭 epoch 的 Run；Dispose 前无持有
A3 == \A a \in Instances : inst[a] = "absent" => Holding(a) = {}

\* create 意图不产生第二个 Run
NoDoubleCreate == \A r \in Runs : r \in created => run[r] /= NONE

\* LP-1a：无占位、有合格项、Session open、无 hold、且模型仍有可用 Run 身份 ⇒
\* 最终开新 Run（或前提消失）。"有可用 Run 身份"是有限模型的边界条件。
LP1a == (queue > 0 /\ sess = "open" /\ ~hold /\ Placeholder = {}
         /\ \E r \in Runs : run[r] = NONE)
          ~> (Placeholder /= {} \/ hold \/ sess /= "open")

\* LP-1b：占位 Run 执行者为空、Session open、epoch 未达模型上限 ⇒ 最终重取
\* （或 Run 离开占位）
LP1b == \A r \in Runs :
          (run[r] \in Placeholding /\ holder[r] = NONE /\ sess = "open"
           /\ epoch[r] < MaxEpoch)
            ~> (holder[r] /= NONE \/ run[r] \notin Placeholding \/ sess /= "open")

\* LP-2：归档/删除后空闲实例最终关闭（或 Session 先被恢复为 open）
LP2 == \A a \in Instances :
         (sess /= "open" /\ inst[a] = "ready") ~> (inst[a] /= "ready" \/ sess = "open")

\* 跨域：裁决动作本身只发生在 Run 实际非终态时（动作性质；陈旧读会破坏）。
\* 状态形式的 I13 在跨域时因"终态与消费之间的窗口"必然退化为最终性质。
ClassifyFresh ==
  [][\A r \in Runs : cont'[r] > cont[r] => run[r] \notin Terminal]_vars

\* 跨域：意图最终被消费并撤回；I-13/I-14 退化为最终成立
IntentsDrain == \A i \in IntentSet : (i \in intents) ~> (i \notin intents)
I14Eventually == \A r \in Runs : (run[r] \in Terminal) ~> (cont[r] = 0)

=============================================================================
