---------------------------- MODULE RunDriver ----------------------------
\* capability.run-driver v3 与 capability.session v2 Inbound 段的行为模型。
\* 范围：单 Session、至多 MaxRuns 个 Run、每 Run 至多 MaxSteps 个 Step、每 Step 至多
\* MaxAtt 个 attempt；一个预算门与一个依赖门；崩溃/Yield/门丢失/控制各至多一次；
\* 空闲点取入排队文本至多 MaxSteer 次。
\* v3 相对 v2 的语义变化：
\*   (1) 问答型人类请求并入调用（HIds 是内建 human 工具的调用，答复经 call_settlement），
\*       QIds / AskQuestion / Answer 与 waiting_human 状态删除；
\*   (2) Run 的等待由等待登记簿表达：calls[c].open 是该调用的开放登记，门的开放登记是
\*       gateRef；Claims 非空即"Run 在等"；waiting_gate 不再是 Run 状态；
\*   (3) Step 收束只看 attempt 已结算与提议已登记，开下一 Step 按合批规则（缺省等本批
\*       前台登记注销，门恢复或取入文本可提前开）；占位首次呈现即开 Step，已呈现不再触发；
\*   (4) 整份提议被拒以 run.step.settled{invalid_proposal} 收口 Step（AllowInvalid）。
\* 抽象：E7 收口为原子；队列无序（顺序由 session v2 队列条款覆盖）；detach 为原子
\* （detach_in_flight 不建模）；不建模租户、帧、预算数值、暂行回传、interrupt_then_run 与
\* superseded 终态、排队项的内容与优先级、多 Session。
EXTENDS Naturals, Sequences, FiniteSets
CONSTANTS A, CIds, HIds, Mutation,
          MaxRuns, MaxSteps, MaxAtt,   \* Run / Step / attempt 上限
          MaxSteer,                    \* 空闲点取入排队文本的次数上限（0 = 不建模）
          TrackOps,                    \* 是否记录提交集合（I20 用；关闭以缩小状态空间）
          AllowInvalid                 \* 是否允许 invalid_proposal 收口（I26 用）

Term    == {"completed", "failed", "cancelled"}
NonTerm == {"running", "waiting", "interrupted", "stopping"}
Drive   == {"running", "waiting"}
Gates   == {"budget", "dependency"}
Refs    == CIds \cup Gates \cup {"none"}

VARIABLES
  runId, runSt, hist,            \* 当前 Run 身份/状态；hist: 旧 Run 的最终状态
  epoch, occupied,               \* epoch = 1 有效执行者；occupied = 占位由 runId 持有
  steps,                         \* Seq [cut: SUBSET A, out: {"open","settled","invalid"}]
  att,                           \* SUBSET [run, step, ord, st, sent]
  calls,                         \* [CIds -> [st, run, step, open, shown, starts]]
  verdict,                       \* [CIds -> {"none","approve","reject"}]
  arr,                           \* [A -> [st, src, refs, intent, obsRun, obsSt, obsWait]]
  queue,                         \* SUBSET A：intent = queue 且未取走的 trigger 项
  gate, dep, gateRef, gateRet,   \* 预算门、依赖门；门的开放登记 (gateRef, gateRet)
  ops, inflight, alive,          \* 提交记录（op -> input）；易失在途；Loop 存活
  crashes, yields, drops, ctrls, \* 有界计数（崩溃、退役、门丢失、用户控制各至多一次）
  steers                         \* 已用的空闲点取入次数
vars == <<runId, runSt, hist, epoch, occupied, steps, att, calls, verdict,
          arr, queue, gate, dep, gateRef, gateRet, ops, inflight, alive,
          crashes, yields, drops, ctrls, steers>>

Cur    == Len(steps)
Closed == Cur > 0 /\ steps[Cur].out # "open"
Op(k, s, o)    == [kind |-> k, run |-> runId, step |-> s, ord |-> o, key |-> "none"]
OpK(k, s, key) == [kind |-> k, run |-> runId, step |-> s, ord |-> 0, key |-> key]
Commit(op, in) == ops' = (IF TrackOps THEN ops \cup {[op |-> op, input |-> in]} ELSE ops)   \* in 统一为集合

SettleArr(c) == {a \in A : arr[a].src = "call_settlement" /\ arr[a].refs = c}

\* ---------- 等待登记簿（RD-09/10/11、run v2 RN-01） ----------
\* 调用在提议同批登记；注销恰在裁决为 continuation、detach 确认、Run 终态或 force_stop 受理。
\* 门在进入时登记，放行时注销。人类请求不独立登记，附属于它的调用。
ClaimOpen(c) == calls[c].open
  /\ (IF Mutation = "settledNotWaiting" THEN calls[c].st # "settled" ELSE TRUE)
ClaimsOf(rid) == {c \in CIds : calls[c].run = rid /\ ClaimOpen(c)}
                 \cup (IF rid = runId /\ gateRef \in Gates THEN {gateRef} ELSE {})
Claims == ClaimsOf(runId)

\* 调用上的等待关系是登记簿的投影（维度 C）
Rel(c) == IF ~ClaimOpen(c) THEN "background"
          ELSE IF calls[c].st \in {"proposed", "waiting_approval"} THEN "none"
          ELSE IF c \in HIds THEN "human_wait" ELSE "foreground"
BatchFg(s) == \E c \in CIds : calls[c].run = runId /\ calls[c].step = s /\ Rel(c) = "foreground"

\* 占位：调用离开前台后，下一 Step 必须让模型知道该 tool_use 还没有结果
Deferred(c) == calls[c].run = runId /\ calls[c].st # "none"
  /\ (   (~calls[c].open /\ calls[c].st \in {"admitted", "executing"})      \* detached_background
      \/ calls[c].st = "waiting_approval"                                   \* waiting_approval
      \/ (ClaimOpen(c) /\ c \in HIds /\ calls[c].st \in {"admitted", "executing"}))  \* waiting_human
NeedPh == {c \in CIds : Deferred(c) /\ ~calls[c].shown}
\* 开 Step 时，本 Run 每个尚无 tool_result 的 tool_use 各得一个占位块
MarkShown(rd) == [c \in CIds |->
  IF calls[c].run = runId /\ calls[c].st # "none" /\ ~(\E a \in rd : arr[a].refs = c)
  THEN [calls[c] EXCEPT !.shown = TRUE] ELSE calls[c]]

Cls(a)       == arr[a].st = "classified" /\ arr[a].intent = "continuation" /\ arr[a].obsRun = runId
ReadyModel   == {a \in A : Cls(a) /\ arr[a].src = "call_settlement"}
ReadyApprove == {a \in A : Cls(a) /\ arr[a].src = "human_answer" /\ arr[a].refs \in CIds}
ReadyGate    == {a \in A : Cls(a) /\ arr[a].src = "gate_restored"}
Unadjudicated == \E a \in A : arr[a].st = "accepted"
\* 自然完成的基准是模型响应：本 Step 无调用提议则登记簿不新增登记，其余条件成立即完成
CompleteCond == Closed /\ Claims = {}
  /\ ReadyModel = {} /\ ReadyApprove = {} /\ ReadyGate = {}

RefRun(r) == IF r \in CIds THEN calls[r].run ELSE runId
StOf(rid) == IF rid = runId THEN runSt ELSE hist[rid]
Live == {"running", "waiting", "interrupted"}
\* inbound 裁决决定表：A 列 = holder 在其发起 Run 上有开放登记（B / C / D1 沿 SE-14 原表）
Intent(src, r) ==
  LET rid == IF r = "none" THEN (IF occupied THEN runId ELSE 0) ELSE RefRun(r)
      st  == IF rid = 0 THEN "none" ELSE StOf(rid)
  \* 审批决定只在该请求仍待决时成为接续：请求已随收口关闭时，迟到决定按 HD-02 关闭
  IN IF src = "human_answer" /\ r \in CIds /\ calls[r].st # "waiting_approval" THEN "closed"
     ELSE IF st \in Live /\ r # "none" /\ r \in ClaimsOf(rid) THEN "continuation"
     ELSE IF st \in Live THEN (IF src = "connector_condition" THEN "queue"
                              ELSE IF src = "gate_restored" THEN "drop" ELSE "context")
     ELSE IF st \in {"completed", "failed", "none"}
          THEN (IF src = "gate_restored" THEN "drop" ELSE "queue")
     ELSE "closed"
ObsRunOf(r) == IF r = "none" THEN (IF occupied THEN runId ELSE 0) ELSE RefRun(r)

Accept(a, src, r) == arr[a].st = "none"
  /\ arr' = [arr EXCEPT ![a] = [st |-> "accepted", src |-> src, refs |-> r, intent |-> "none",
                                obsRun |-> 0, obsSt |-> "", obsWait |-> FALSE]]
FreeArr == \E a \in A : arr[a].st = "none"

\* ---------- Session 级（不要求 alive） ----------
Adjudicate(a) == arr[a].st = "accepted"
  /\ LET i   == Intent(arr[a].src, arr[a].refs)
         rid == ObsRunOf(arr[a].refs)
     IN /\ arr' = [arr EXCEPT ![a].st = IF i \in {"closed", "drop"} THEN "closed" ELSE "classified",
                              ![a].intent = IF i \in {"closed", "drop"} THEN "none" ELSE i,
                              ![a].obsRun = rid,
                              ![a].obsSt = IF rid = 0 THEN "none" ELSE StOf(rid),
                              ![a].obsWait = (arr[a].refs \in ClaimsOf(rid))]
        \* 注销恰与"其结算被裁决为 continuation"的那次提交同批；审批决定不是结算，不注销
        /\ calls' = IF i = "continuation" /\ arr[a].refs \in CIds
                       /\ arr[a].src = "call_settlement"
                    THEN [calls EXCEPT ![arr[a].refs].open = FALSE] ELSE calls
        /\ queue' = IF i = "queue" THEN queue \cup {a} ELSE queue
        /\ Commit([kind |-> "adjudicate", run |-> 0, step |-> 0, ord |-> 0, key |-> a], {i})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, verdict,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls, steers>>

TakeTrigger(a) == ~occupied /\ a \in queue /\ runId < MaxRuns /\ ~Unadjudicated
  /\ hist' = [rid \in DOMAIN hist \cup {runId} |-> IF rid = runId THEN runSt ELSE hist[rid]]
  /\ runId' = runId + 1 /\ runSt' = "running" /\ epoch' = 1 /\ occupied' = TRUE
  /\ steps' = <<>> /\ gateRef' = "" /\ gateRet' = ""
  /\ arr' = [arr EXCEPT ![a].st = "consumed"] /\ queue' = queue \ {a}
  /\ Commit([kind |-> "take_trigger", run |-> runId + 1, step |-> 0, ord |-> 0, key |-> "none"], {a})
  /\ UNCHANGED <<att, calls, verdict, gate, dep, inflight, alive, crashes, yields, drops, ctrls, steers>>

\* ---------- Loop（要求 alive 与有效 epoch） ----------
\* 合批规则：缺省等本批前台登记全部注销；门恢复可提前开（审批就绪由 E4A 优先级处理，
\* 队首合格文本由 SteerOpen 处理）。占位首次呈现即开 Step，已呈现过的不再触发。
CanOpen == alive /\ epoch = 1 /\ occupied /\ runSt \in Drive /\ gateRef = ""
  /\ Cur < MaxSteps /\ ~Unadjudicated
  /\ (Cur = 0 \/ (Closed /\ (ReadyModel # {} \/ NeedPh # {})))
  /\ (Cur = 0 \/ ReadyApprove = {})                      \* E4A 优先于 E1
  /\ (Cur = 0 \/ ~BatchFg(Cur) \/ ReadyGate # {})        \* 合批：缺省等前台登记注销
OpenStep == CanOpen /\ dep                                \* E1
  /\ steps' = Append(steps, [cut |-> ReadyModel, out |-> "open"])
  /\ arr' = [a \in A |-> IF a \in ReadyModel THEN [arr[a] EXCEPT !.st = "consumed"] ELSE arr[a]]
  /\ calls' = MarkShown(ReadyModel)
  /\ runSt' = "running" /\ Commit(Op("open_step", Cur + 1, 0), ReadyModel)
  /\ UNCHANGED <<runId, hist, epoch, occupied, att, verdict, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls, steers>>
\* 空闲点取入排队的用户文本：不创建 Run、不换 epoch，在途调用各得一个占位
SteerOpen == alive /\ epoch = 1 /\ occupied /\ runSt \in Drive /\ steers < MaxSteer
  /\ Cur > 0 /\ Cur < MaxSteps /\ Closed /\ Claims # {} /\ ~Unadjudicated
  /\ dep /\ gateRef # "dependency"                        \* 该门不是开 Step 的前提
  /\ steps' = Append(steps, [cut |-> ReadyModel, out |-> "open"])
  /\ arr' = [a \in A |-> IF a \in ReadyModel THEN [arr[a] EXCEPT !.st = "consumed"] ELSE arr[a]]
  /\ calls' = MarkShown(ReadyModel)
  /\ runSt' = "running" /\ steers' = steers + 1
  /\ Commit(Op("open_step", Cur + 1, 0), ReadyModel)
  /\ UNCHANGED <<runId, hist, epoch, occupied, att, verdict, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls>>
GateBlockE1 == CanOpen /\ ~dep
  /\ runSt' = (IF Closed THEN "waiting" ELSE "running")
  /\ gateRef' = "dependency" /\ gateRet' = "E1"
  /\ Commit(Op("await_gate", Cur + 1, 0), {"E1"})
  /\ UNCHANGED <<runId, hist, epoch, occupied, steps, att, calls, verdict, arr, queue,
                 gate, dep, inflight, alive, crashes, yields, drops, ctrls, steers>>

AttOf(s) == {t \in att : t.run = runId /\ t.step = s}
CanRequest(o) == alive /\ epoch = 1 /\ Cur > 0 /\ ~Closed /\ runSt = "running" /\ o < MaxAtt
  /\ gateRef = ""
  /\ ~(\E t \in AttOf(Cur) : t.ord = o)
  /\ (o = 0 \/ (\E u \in AttOf(Cur) : u.ord = o - 1 /\ u.st = "settled"))
RequestModel(o) == CanRequest(o) /\ gate                  \* E3 准入
  /\ att' = att \cup {[run |-> runId, step |-> Cur, ord |-> o, st |-> "admitted", sent |-> 0]}
  /\ Commit(Op("admit_attempt", Cur, o), {"admit"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, calls, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls, steers>>
GateBlockE3 == (\E o \in 0..(MaxAtt - 1) : CanRequest(o)) /\ ~gate
  /\ gateRef' = "budget" /\ gateRet' = "E3"
  /\ Commit(Op("await_gate", Cur, 0), {"E3"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, verdict, arr, queue,
                 gate, dep, inflight, alive, crashes, yields, drops, ctrls, steers>>

Dispatch(t) == alive /\ epoch = 1 /\ t.st = "admitted" /\ runSt = "running"   \* CC-03 位置分配
  /\ att' = (att \ {t}) \cup {[t EXCEPT !.st = "pending_durable"]}
  /\ Commit(Op("dispatch_attempt", t.step, t.ord), {"dispatch"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, calls, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls, steers>>
Durable(t) == alive /\ t.st = "pending_durable"                              \* MC-04 发网前耐久
  /\ att' = (att \ {t}) \cup {[t EXCEPT !.st = "dispatched"]} /\ inflight' = inflight \cup {t}
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, calls, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, alive, crashes, yields, drops, ctrls, steers>>
Send(t) == alive /\ t.sent = 0
  /\ (IF Mutation = "sendEarly" THEN t.st \in {"admitted", "pending_durable", "dispatched"}
      ELSE t \in inflight /\ t.st = "dispatched")
  /\ att' = (att \ {t}) \cup {[t EXCEPT !.sent = 1]} /\ inflight' = inflight \ {t}
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, calls, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, alive, crashes, yields, drops, ctrls, steers>>
SettleAttempt(t) == alive /\ t.st = "dispatched" /\ t \notin inflight
  /\ att' = (att \ {t}) \cup {[t EXCEPT !.st = "settled"]}
  /\ Commit(Op("settle_attempt", t.step, t.ord), {"settle"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, calls, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls, steers>>
Success == \E t \in AttOf(Cur) : t.st = "settled"
NoBatch == ~(\E d \in CIds : calls[d].run = runId /\ calls[d].step = Cur)

ProposeCalls(S) == alive /\ epoch = 1 /\ Cur > 0 /\ ~Closed /\ runSt = "running" /\ Success   \* E4
  /\ S # {} /\ (\A c \in S : calls[c].st = "none") /\ NoBatch          \* 每 Step 一批
  /\ calls' = [c \in CIds |-> IF c \in S THEN [st |-> "proposed", run |-> runId, step |-> Cur,
                                               open |-> TRUE, shown |-> FALSE, starts |-> 0]
                              ELSE calls[c]]                          \* 提议同批登记
  /\ Commit(Op("propose_call", Cur, 0), S)
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls, steers>>
\* 整份提议不能形成合法 Action：不登记任何 proposed，Step 以 invalid_proposal 收口
InvalidProposal == AllowInvalid /\ alive /\ epoch = 1 /\ Cur > 0 /\ ~Closed
  /\ runSt = "running" /\ Success /\ NoBatch
  /\ steps' = [steps EXCEPT ![Cur].out = "invalid"]
  /\ Commit(Op("settle_step", Cur, 0), {"invalid_proposal"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, att, calls, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls, steers>>

Proposed(c) == alive /\ epoch = 1 /\ runSt = "running" /\ calls[c].run = runId /\ calls[c].st = "proposed"
GateAllow(c) == Proposed(c) /\ gate
  /\ calls' = [calls EXCEPT ![c].st = "admitted"] /\ Commit(OpK("admit_call", calls[c].step, c), {"allow"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls, steers>>
GateAsk(c) == Proposed(c) /\ c \notin HIds                 \* 内建 human 调用不走审批门
  /\ calls' = [calls EXCEPT ![c].st = "waiting_approval"] /\ Commit(OpK("admit_call", calls[c].step, c), {"ask"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls, steers>>
GateDeny(c, a) == Proposed(c)
  /\ calls' = [calls EXCEPT ![c].st = "settled"] /\ Accept(a, "call_settlement", c)
  /\ Commit(OpK("admit_call", calls[c].step, c), {"deny"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, verdict, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls, steers>>
GateBlockE4 == (\E c \in CIds : Proposed(c)) /\ ~gate /\ gateRef = ""
  /\ gateRef' = "budget" /\ gateRet' = "E4"
  /\ Commit(Op("await_gate", Cur, 1), {"E4"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, verdict, arr, queue,
                 gate, dep, inflight, alive, crashes, yields, drops, ctrls, steers>>
StartCall(c) == alive /\ epoch = 1 /\ calls[c].run = runId /\ calls[c].st = "admitted"
  /\ calls[c].starts = 0                                                     \* TL-08 幂等接纳
  /\ calls' = [calls EXCEPT ![c].st = "executing", ![c].starts = 1]
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls, steers>>
\* detach 确认：登记注销（关系转 background），本模型把请求与确认并为一步
Detach(c) == calls[c].st = "executing" /\ ClaimOpen(c) /\ c \notin HIds
  /\ calls' = [calls EXCEPT ![c].open = FALSE]
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls, steers>>

\* 执行 owner 侧终态与 Inbound 受理：两次提交，不依赖 alive
SettleCall(c) == calls[c].st = "executing" /\ calls' = [calls EXCEPT ![c].st = "settled"]
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls, steers>>
AcceptSettlement(a, c) == calls[c].st = "settled" /\ SettleArr(c) = {}
  /\ Accept(a, "call_settlement", c)
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, verdict, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls, steers>>

\* Step 收束 = attempt 已结算且提议已登记（不再等结果回来）
SettleStep == alive /\ epoch = 1 /\ Cur > 0 /\ ~Closed /\ runSt = "running" /\ Success   \* E5
  /\ steps' = [steps EXCEPT ![Cur].out = "settled"] /\ Commit(Op("settle_step", Cur, 0), {"close"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, att, calls, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls, steers>>
Wait == alive /\ epoch = 1 /\ Closed /\ runSt = "running"                    \* E6 进入
  /\ ReadyModel = {} /\ ReadyApprove = {} /\ ~CompleteCond /\ Claims # {}
  /\ runSt' = "waiting"
  /\ UNCHANGED <<runId, hist, epoch, occupied, steps, att, calls, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls, steers>>
ApproveReady(c) == alive /\ epoch = 1 /\ Closed /\ runSt \in Drive /\ gateRef = ""
  /\ calls[c].run = runId /\ calls[c].st = "waiting_approval" /\ (\E a \in ReadyApprove : arr[a].refs = c)
ConsumeApproval(c) == {b \in ReadyApprove : arr[b].refs = c}
AdmitApproved(c) == ApproveReady(c) /\ verdict[c] = "approve" /\ gate      \* E4A
  /\ calls' = [calls EXCEPT ![c].st = "admitted"]
  /\ arr' = [b \in A |-> IF b \in ConsumeApproval(c) THEN [arr[b] EXCEPT !.st = "consumed"] ELSE arr[b]]
  /\ Commit(OpK("consume_decision", calls[c].step, c), {"consume_approval"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, verdict, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls, steers>>
DenyRejected(c) == ApproveReady(c) /\ verdict[c] = "reject"                 \* E4A 的 reject 分支
  /\ calls' = [calls EXCEPT ![c].st = "settled"]
  /\ arr' = [b \in A |-> IF b \in ConsumeApproval(c) THEN [arr[b] EXCEPT !.st = "consumed"] ELSE arr[b]]
  /\ Commit(OpK("consume_decision", calls[c].step, c), {"consume_reject"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, verdict, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls, steers>>
GateBlockE4A == (\E c \in CIds : ApproveReady(c) /\ verdict[c] = "approve") /\ ~gate
  /\ runSt' = "waiting" /\ gateRef' = "budget" /\ gateRet' = "E4A"
  /\ Commit(Op("await_gate", Cur, 2), {"E4A"})
  /\ UNCHANGED <<runId, hist, epoch, occupied, steps, att, calls, verdict, arr, queue,
                 gate, dep, inflight, alive, crashes, yields, drops, ctrls, steers>>
WakeGate == alive /\ epoch = 1 /\ gateRef \in Gates /\ runSt \in Drive
  /\ (\E g \in ReadyGate : arr[g].refs = gateRef)
  /\ arr' = [a \in A |-> IF a \in ReadyGate THEN [arr[a] EXCEPT !.st = "consumed"] ELSE arr[a]]
  /\ runSt' = (IF Closed /\ (Claims \ {gateRef}) # {} THEN "waiting" ELSE "running")
  /\ gateRef' = "" /\ gateRet' = ""                                          \* 门放行即注销
  /\ UNCHANGED <<runId, hist, epoch, occupied, steps, att, calls, verdict, queue,
                 gate, dep, ops, inflight, alive, crashes, yields, drops, ctrls, steers>>

\* E7 抽象为原子：在途调用取得合成/真实终态。release = 是否整簿注销
CloseCalls(release) == [c \in CIds |->
  IF calls[c].run = runId
  THEN [calls[c] EXCEPT
          !.st = IF calls[c].st \in {"proposed", "waiting_approval", "admitted", "executing"}
                 THEN "settled" ELSE calls[c].st,
          !.open = IF release THEN FALSE ELSE calls[c].open]
  ELSE calls[c]]
\* U-43：不可恢复失败只取消未准入的调用，已准入调用继续；终态提交整簿注销
FailCalls == [c \in CIds |->
  IF calls[c].run = runId
  THEN [calls[c] EXCEPT
          !.st = IF calls[c].st \in {"proposed", "waiting_approval"} THEN "settled" ELSE calls[c].st,
          !.open = FALSE]
  ELSE calls[c]]
ReleaseAll == [c \in CIds |-> IF calls[c].run = runId THEN [calls[c] EXCEPT !.open = FALSE] ELSE calls[c]]

ConvertOrClose(r) ==
  /\ arr' = [a \in A |-> IF Cls(a) /\ Mutation # "splitSettle"
                         THEN [arr[a] EXCEPT !.st = IF r \in {"completed", "failed"} THEN "converted" ELSE "closed"]
                         ELSE arr[a]]
  /\ queue' = IF r \in {"completed", "failed"} /\ Mutation # "splitSettle"
              THEN queue \cup {a \in A : Cls(a)} ELSE queue
SettleRun(r) == alive /\ epoch = 1 /\ occupied /\ Closed /\ runSt \in Drive  \* E8
  /\ (r = "completed" => CompleteCond)
  /\ runSt' = r /\ epoch' = 0 /\ occupied' = FALSE /\ gateRef' = "" /\ gateRet' = ""
  /\ ConvertOrClose(r) /\ Commit(Op("settle_run", 0, 0), {r})
  /\ UNCHANGED <<runId, hist, steps, att, calls, verdict, gate, dep,
                 inflight, alive, crashes, yields, drops, ctrls, steers>>
FailRun == alive /\ epoch = 1 /\ occupied /\ runSt \in Drive /\ Cur > 0 /\ calls' = FailCalls
  /\ runSt' = "failed" /\ epoch' = 0 /\ occupied' = FALSE /\ gateRef' = "" /\ gateRet' = ""
  /\ ConvertOrClose("failed") /\ Commit(Op("settle_run", 0, 0), {"failed"})
  /\ UNCHANGED <<runId, hist, steps, att, verdict, gate, dep,
                 inflight, alive, crashes, yields, drops, ctrls, steers>>

\* interrupt：收口在途调用但整簿保留（调用与门的登记都留到 resume 后消费）
Interrupt == alive /\ runSt \in Drive /\ ctrls < 1 /\ calls' = CloseCalls(FALSE)
  /\ runSt' = "interrupted" /\ epoch' = 0 /\ occupied' = FALSE
  /\ ctrls' = ctrls + 1
  \* 未启动调用的审批请求随之关闭，指向它的未消费决定一并关闭
  /\ arr' = [a \in A |-> IF Cls(a) /\ arr[a].src = "human_answer" /\ arr[a].refs \in CIds
                            /\ calls[arr[a].refs].run = runId
                            /\ calls[arr[a].refs].st \in {"proposed", "waiting_approval"}
                         THEN [arr[a] EXCEPT !.st = "closed", !.intent = "none"] ELSE arr[a]]
  /\ UNCHANGED <<runId, hist, steps, att, verdict, queue, gate, dep, gateRef, gateRet, ops,
                 inflight, alive, crashes, yields, drops, steers>>
Resume == alive /\ runSt = "interrupted" /\ ~occupied /\ ~Unadjudicated     \* E0
  /\ epoch' = 1 /\ occupied' = TRUE /\ runSt' = "running"
  /\ UNCHANGED <<runId, hist, steps, att, calls, verdict, arr, queue, gate, dep,
                 gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls, steers>>
Cancel == alive /\ runSt \in Live /\ calls' = CloseCalls(TRUE)              \* 终态提交整簿注销
  /\ runSt' = "cancelled" /\ epoch' = 0 /\ occupied' = FALSE /\ gateRef' = "" /\ gateRet' = ""
  /\ ConvertOrClose("cancelled") /\ Commit(Op("settle_run", 0, 0), {"cancelled"})
  /\ UNCHANGED <<runId, hist, steps, att, verdict, gate, dep, inflight, alive,
                 crashes, yields, drops, ctrls, steers>>
\* force_stop：受理（epoch 撤销、进 stopping）的提交就整簿注销
ForceStop == alive /\ runSt \in Drive /\ ctrls < 1 /\ runSt' = "stopping" /\ epoch' = 0
  /\ calls' = ReleaseAll /\ gateRef' = "" /\ gateRet' = "" /\ ctrls' = ctrls + 1
  /\ UNCHANGED <<runId, hist, occupied, steps, att, verdict, arr, queue, gate, dep,
                 ops, inflight, alive, crashes, yields, drops, steers>>
ConfirmIsolation == runSt = "stopping" /\ calls' = CloseCalls(TRUE)
  /\ runSt' = "cancelled" /\ occupied' = FALSE
  /\ ConvertOrClose("cancelled") /\ Commit(Op("settle_run", 0, 0), {"cancelled"})
  /\ UNCHANGED <<runId, hist, epoch, steps, att, verdict, gate, dep, gateRef, gateRet,
                 inflight, alive, crashes, yields, drops, ctrls, steers>>

\* 运行时退役：只封闭 epoch、保留占位（A-1）。前提按登记簿：foreground 的调用
\* （已过门未 start 与执行中）阻止 Yield；human_wait、未过门的 proposed 与门不阻止。
Yield == alive /\ epoch = 1 /\ runSt \in Drive /\ yields < 1
  /\ ~(\E c \in CIds : calls[c].run = runId /\ ClaimOpen(c) /\ c \notin HIds
                       /\ calls[c].st \in {"admitted", "executing"})
  /\ epoch' = 0 /\ yields' = yields + 1
  /\ occupied' = (IF Mutation = "yieldRelease" THEN FALSE ELSE occupied)
  /\ UNCHANGED <<runId, runSt, hist, steps, att, calls, verdict, arr, queue, gate, dep,
                 gateRef, gateRet, ops, inflight, alive, crashes, drops, ctrls, steers>>
Reacquire == alive /\ epoch = 0 /\ occupied /\ runSt \in Drive /\ ~Unadjudicated   \* E0 重取
  /\ epoch' = 1
  /\ UNCHANGED <<runId, runSt, hist, occupied, steps, att, calls, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls, steers>>

\* ---------- 环境 ----------
GateDrop == gate /\ drops < 1 /\ gate' = FALSE /\ drops' = drops + 1
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, verdict, arr,
                 queue, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, ctrls, steers>>
GateRestore(a) == ~gate /\ gate' = TRUE /\ Accept(a, "gate_restored", "budget")
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, verdict,
                 queue, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls, steers>>
DepDrop == dep /\ drops < 1 /\ dep' = FALSE /\ drops' = drops + 1
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, verdict, arr,
                 queue, gate, gateRef, gateRet, ops, inflight, alive, crashes, yields, ctrls, steers>>
DepRestore(a) == ~dep /\ dep' = TRUE /\ Accept(a, "gate_restored", "dependency")
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, verdict,
                 queue, gate, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls, steers>>
ExtTrigger(a) == Accept(a, "connector_condition", "none")
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, verdict,
                 queue, gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls, steers>>
Decide(c, a, v) == calls[c].st = "waiting_approval" /\ verdict[c] = "none"
  /\ verdict' = [verdict EXCEPT ![c] = v] /\ Accept(a, "human_answer", c)
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls, steers>>

Crash == alive /\ crashes < 1 /\ alive' = FALSE /\ inflight' = {} /\ crashes' = crashes + 1
  /\ att' = {t \in att : t.st # "pending_durable"}
           \cup {[u EXCEPT !.st = "admitted"] : u \in {w \in att : w.st = "pending_durable"}}
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, calls, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, yields, drops, ctrls, steers>>
Recover == ~alive /\ alive' = TRUE                                           \* E0：状态即前缀
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, verdict, arr,
                 queue, gate, dep, gateRef, gateRet, ops, inflight, crashes, yields, drops, ctrls, steers>>

Next ==
  \/ \E a \in A : Adjudicate(a) \/ TakeTrigger(a) \/ GateRestore(a) \/ DepRestore(a) \/ ExtTrigger(a)
  \/ OpenStep \/ SteerOpen \/ GateBlockE1 \/ GateBlockE3 \/ GateBlockE4 \/ GateBlockE4A
  \/ \E o \in 0..(MaxAtt - 1) : RequestModel(o)
  \/ \E t \in att : Dispatch(t) \/ Durable(t) \/ Send(t) \/ SettleAttempt(t)
  \/ \E S \in SUBSET CIds : ProposeCalls(S)
  \/ InvalidProposal
  \/ \E c \in CIds : GateAllow(c) \/ GateAsk(c) \/ StartCall(c) \/ Detach(c) \/ SettleCall(c)
                    \/ AdmitApproved(c) \/ DenyRejected(c)
  \/ \E d \in CIds, b \in A : GateDeny(d, b) \/ AcceptSettlement(b, d)
                             \/ Decide(d, b, "approve") \/ Decide(d, b, "reject")
  \/ SettleStep \/ Wait \/ WakeGate \/ SettleRun("completed") \/ FailRun
  \/ Interrupt \/ Resume \/ Cancel \/ ForceStop \/ ConfirmIsolation
  \/ Yield \/ Reacquire \/ GateDrop \/ DepDrop \/ Crash \/ Recover

Init == runId = 1 /\ runSt = "running" /\ hist = [r \in {} |-> ""] /\ epoch = 1 /\ occupied = TRUE
  /\ steps = <<>> /\ att = {}
  /\ calls = [c \in CIds |-> [st |-> "none", run |-> 0, step |-> 0,
                              open |-> FALSE, shown |-> FALSE, starts |-> 0]]
  /\ verdict = [c \in CIds |-> "none"]
  /\ arr = [a \in A |-> [st |-> "none", src |-> "", refs |-> "none", intent |-> "none",
                         obsRun |-> 0, obsSt |-> "", obsWait |-> FALSE]]
  /\ queue = {} /\ gate = TRUE /\ dep = TRUE /\ gateRef = "" /\ gateRet = ""
  /\ ops = {} /\ inflight = {} /\ alive = TRUE
  /\ crashes = 0 /\ yields = 0 /\ drops = 0 /\ ctrls = 0 /\ steers = 0

Spec == Init /\ [][Next]_vars

\* ---------- 安全不变式 ----------
I1   == (occupied => runSt \in NonTerm) /\ (runSt \in Drive /\ epoch = 1 => occupied)
Hist == \A rid \in DOMAIN hist : hist[rid] \in Term \cup {"interrupted"}    \* 被越过的 Run 只能是终态或 interrupted
\* 进入切点的结算，其调用的登记在该提交之前已注销（裁决与注销同批）
I9   == \A c \in CIds : (\E s \in 1..Cur : \E a \in steps[s].cut : arr[a].refs = c)
          => ~(calls[c].run = runId /\ ClaimOpen(c))
I13  == \A a \in A : arr[a].intent = "continuation" => arr[a].obsSt \in Live /\ arr[a].obsWait
I14  == runSt \in Term => \A a \in A : (arr[a].intent = "continuation" /\ arr[a].obsRun = runId) =>
          /\ arr[a].st \in {"consumed", "converted", "closed"}
          /\ (runSt = "cancelled" => arr[a].st # "converted")
          /\ (runSt \in {"completed", "failed"} => arr[a].st # "closed")
I18  == /\ \A t \in att : t.sent <= 1
        /\ \A t, u \in att : (t.run = u.run /\ t.step = u.step /\ t.ord = u.ord) => t = u
        /\ \A t \in att : t.sent = 1 => t.st \in {"dispatched", "settled"}   \* 发网前已耐久
        /\ \A c \in CIds : calls[c].starts <= 1
I20  == \A x, y \in ops : x.op = y.op => x.input = y.input
I21s == \A a \in A : arr[a].st \in {"consumed", "converted"} => arr[a].intent # "none"
\* 完成时登记簿为空；任何开放登记的 holder，其发起 Run 非终态（终态提交整簿注销）
I22  == /\ (runSt = "completed" => Claims = {})
        /\ \A c \in CIds : ClaimOpen(c) => StOf(calls[c].run) \in NonTerm
\* 用未经变异的登记位：登记未注销的已结算调用，其结算只能被裁决为 continuation
I23  == \A c \in CIds : (calls[c].run = runId /\ calls[c].open /\ calls[c].st = "settled" /\ runSt \in Live)
          => \A a \in SettleArr(c) : arr[a].st \in {"classified", "consumed"} => arr[a].intent = "continuation"
I24  == (gateRef \in Gates) <=> (gateRet \in {"E1", "E3", "E4", "E4A"})
I25  == runSt = "waiting" => Closed                                         \* 等待只在 Step 收束之后
I26  == \A s \in 1..Cur : steps[s].out = "invalid"
          => ~(\E c \in CIds : calls[c].run = runId /\ calls[c].step = s)
NoDouble == \A c \in CIds :
  Cardinality({s \in 1..Cur : \E a \in steps[s].cut : arr[a].src = "call_settlement" /\ arr[a].refs = c}) <= 1

\* ---------- 进展 ----------
Fair == /\ \A b \in A : WF_vars(Adjudicate(b)) /\ WF_vars(TakeTrigger(b))
        /\ WF_vars(OpenStep) /\ WF_vars(WakeGate) /\ WF_vars(Recover) /\ WF_vars(Reacquire)
        /\ WF_vars(GateBlockE1) /\ WF_vars(GateBlockE3) /\ WF_vars(GateBlockE4) /\ WF_vars(GateBlockE4A)
        /\ WF_vars(SettleRun("completed"))
        /\ \A c \in CIds : WF_vars(AdmitApproved(c)) /\ WF_vars(DenyRejected(c))
LiveSpec == Spec /\ Fair
\* 就绪的接续或批准最终被消费；Run 离开可推进状态或进入门等待（由 P1g 接力）也算收敛；
\* Cur < MaxSteps 排除模型边界造成的伪反例
P1  == \A a \in A : [](runSt = "waiting" /\ epoch = 1 /\ Cur < MaxSteps /\ gateRef = ""
                        /\ a \in ReadyModel \cup ReadyApprove
          => <>(arr[a].st # "classified" \/ runSt \notin Drive \/ gateRef \in Gates))
\* 门的登记随 interrupt 保留（RD-13），Run 离开可推进状态也算收敛
P1g == [](gateRef \in Gates /\ epoch = 1 /\ (\E a \in ReadyGate : arr[a].refs = gateRef)
          => <>(gateRef = "" \/ runSt \notin Drive))
P1y == [](epoch = 0 /\ occupied /\ runSt \in Drive => <>(epoch = 1 \/ runSt \notin Drive))
\* 登记簿空了就不再停在 waiting：Run 要么开下一 Step，要么结算，要么进门等待（登记门，
\* 由 P1g 接力）；ReadyModel # {} 且已达 MaxSteps 是模型边界，排除
P1w == [](runSt = "waiting" /\ Claims = {} /\ epoch = 1 /\ alive
            /\ (Cur < MaxSteps \/ ReadyModel = {})
          => <>(runSt # "waiting" \/ gateRef \in Gates))
P2  == [](~occupied /\ queue # {} /\ runId < MaxRuns => <>occupied)
=============================================================================
