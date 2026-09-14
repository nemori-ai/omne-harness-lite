---------------------------- MODULE RunDriver ----------------------------
\* capability.run-driver v1 与 capability.session-run v2 Inbound 段的行为模型。
\* 范围：单 Session、至多 MaxRuns 个 Run、每 Run 至多 MaxSteps 个 Step、每 Step 至多
\* MaxAtt 个 attempt；一个预算门与一个依赖门；崩溃/Yield/门丢失各至多一次。
\* 抽象：E7 收口为原子；队列无序（顺序由 session-run v1 QueueControl 覆盖）；
\* 不建模租户、帧、预算数值、暂行回传与多 Session。
EXTENDS Naturals, Sequences, FiniteSets
CONSTANTS A, CIds, QIds, Mutation,
          MaxRuns, MaxSteps, MaxAtt,   \* Run / Step / attempt 上限
          TrackOps                     \* 是否记录提交集合（I20 用；关闭以缩小状态空间）

Term    == {"completed", "failed", "cancelled"}
NonTerm == {"running", "waiting", "waiting_human", "waiting_gate", "interrupted", "stopping"}
Drive   == {"running", "waiting", "waiting_human", "waiting_gate"}
Gates   == {"budget", "dependency"}
Refs    == CIds \cup QIds \cup Gates \cup {"none"}

VARIABLES
  runId, runSt, hist,            \* 当前 Run 身份/状态；hist: 旧 Run 的最终状态
  epoch, occupied,               \* epoch = 1 有效执行者；occupied = 占位由 runId 持有
  steps,                         \* Seq [cut: SUBSET A, closed: BOOL]
  att,                           \* SUBSET [run, step, ord, st, sent]
  calls,                         \* [CIds -> [st, run, step, fg, runPos, starts]]
  pendingQ, verdict,             \* [QIds -> Nat]（0 = 无）；[CIds -> {"none","approve","reject"}]
  arr,                           \* [A -> [st, src, refs, intent, obsRun, obsSt, obsWait]]
  queue,                         \* SUBSET A：intent = queue 且未取走的 trigger 项
  gate, dep, gateRef, gateRet,   \* 预算门、依赖门；waiting_gate 的 (gateRef, gateRet)
  ops, inflight, alive,          \* 提交记录（op -> input）；易失在途；Loop 存活
  crashes, yields, drops, ctrls  \* 有界计数（崩溃、退役、门丢失、用户控制各至多一次）
vars == <<runId, runSt, hist, epoch, occupied, steps, att, calls, pendingQ, verdict,
          arr, queue, gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls>>

Cur    == Len(steps)
Closed == Cur > 0 /\ steps[Cur].closed
Op(k, s, o)    == [kind |-> k, run |-> runId, step |-> s, ord |-> o, key |-> "none"]
OpK(k, s, key) == [kind |-> k, run |-> runId, step |-> s, ord |-> 0, key |-> key]
Commit(op, in) == ops' = (IF TrackOps THEN ops \cup {[op |-> op, input |-> in]} ELSE ops)   \* in 统一为集合

SettleArr(c) == {a \in A : arr[a].src = "call_settlement" /\ arr[a].refs = c}
HasCls(c)    == \E a \in SettleArr(c) : arr[a].st \notin {"none", "accepted"}
Consumed(c)  == \E a \in SettleArr(c) : arr[a].st \in {"consumed", "converted", "closed"}

\* 某 Run 的等待位置：前台调用直到其结算被消费、待答问题、正在等待的门
WaitPosOf(rid) ==
  {c \in CIds : calls[c].run = rid /\ calls[c].fg /\ calls[c].st # "none"
     /\ (IF Mutation = "settledNotWaiting"
         THEN calls[c].st \in {"proposed", "waiting_approval", "admitted", "executing"}
         ELSE calls[c].st # "settled" \/ ~Consumed(c))}
  \cup {q \in QIds : pendingQ[q] = rid}
  \cup (IF rid = runId /\ runSt = "waiting_gate" THEN {gateRef} ELSE {})
WaitPos == WaitPosOf(runId)

Blocking(s) == \E c \in CIds :
  calls[c].run = runId /\ calls[c].step = s /\ ~calls[c].runPos /\ calls[c].fg
  /\ (calls[c].st \in {"proposed", "admitted", "executing"}
      \/ (calls[c].st = "settled" /\ ~HasCls(c)))

Cls(a)       == arr[a].st = "classified" /\ arr[a].intent = "continuation" /\ arr[a].obsRun = runId
ReadyModel   == {a \in A : Cls(a) /\ (arr[a].src = "call_settlement" \/ arr[a].refs \in QIds)}
ReadyApprove == {a \in A : Cls(a) /\ arr[a].src = "human_answer" /\ arr[a].refs \in CIds}
ReadyGate    == {a \in A : Cls(a) /\ arr[a].src = "gate_restored"}
Unadjudicated == \E a \in A : arr[a].st = "accepted"
FgPending == \E c \in CIds : calls[c].run = runId /\ calls[c].fg
              /\ calls[c].st \in {"proposed", "waiting_approval", "admitted", "executing"}
CompleteCond == Closed /\ ~FgPending
  /\ ~(\E q \in QIds : pendingQ[q] = runId)
  /\ ReadyModel = {} /\ ReadyApprove = {} /\ ReadyGate = {}

RefRun(r) == IF r \in CIds THEN calls[r].run
             ELSE IF r \in QIds THEN pendingQ[r] ELSE runId
StOf(rid) == IF rid = runId THEN runSt ELSE hist[rid]
Live == NonTerm \ {"stopping"}
\* inbound 裁决决定表（A / B / C / D1）
Intent(src, r) ==
  LET rid == IF r = "none" THEN (IF occupied THEN runId ELSE 0) ELSE RefRun(r)
      st  == IF rid = 0 THEN "none" ELSE StOf(rid)
  IN IF st \in Live /\ r # "none" /\ r \in WaitPosOf(rid) THEN "continuation"
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
                              ![a].obsWait = (arr[a].refs \in WaitPosOf(rid))]
        /\ queue' = IF i = "queue" THEN queue \cup {a} ELSE queue
        /\ Commit([kind |-> "adjudicate", run |-> 0, step |-> 0, ord |-> 0, key |-> a], {i})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, pendingQ, verdict,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls>>

TakeTrigger(a) == ~occupied /\ a \in queue /\ runId < MaxRuns /\ ~Unadjudicated
  /\ hist' = [rid \in DOMAIN hist \cup {runId} |-> IF rid = runId THEN runSt ELSE hist[rid]]
  /\ runId' = runId + 1 /\ runSt' = "running" /\ epoch' = 1 /\ occupied' = TRUE
  /\ steps' = <<>> /\ gateRef' = "" /\ gateRet' = ""
  /\ arr' = [arr EXCEPT ![a].st = "consumed"] /\ queue' = queue \ {a}
  /\ Commit([kind |-> "take_trigger", run |-> runId + 1, step |-> 0, ord |-> 0, key |-> "none"], {a})
  /\ UNCHANGED <<att, calls, pendingQ, verdict, gate, dep, inflight, alive, crashes, yields, drops, ctrls>>

\* ---------- Loop（要求 alive 与有效 epoch） ----------
CanOpen == alive /\ epoch = 1 /\ occupied /\ runSt \in {"running", "waiting", "waiting_human"}
  /\ Cur < MaxSteps /\ (Cur = 0 \/ (Closed /\ ReadyModel # {})) /\ ~Unadjudicated
  /\ (Cur = 0 \/ ReadyApprove = {})                      \* E4A 优先于 E1
OpenStep == CanOpen /\ dep                                \* E1
  /\ steps' = Append(steps, [cut |-> ReadyModel, closed |-> FALSE])
  /\ arr' = [a \in A |-> IF a \in ReadyModel THEN [arr[a] EXCEPT !.st = "consumed"] ELSE arr[a]]
  /\ runSt' = "running" /\ Commit(Op("open_step", Cur + 1, 0), ReadyModel)
  /\ UNCHANGED <<runId, hist, epoch, occupied, att, calls, pendingQ, verdict, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls>>
GateBlockE1 == CanOpen /\ ~dep
  /\ runSt' = "waiting_gate" /\ gateRef' = "dependency" /\ gateRet' = "E1"
  /\ Commit(Op("await_gate", Cur + 1, 0), {"E1"})
  /\ UNCHANGED <<runId, hist, epoch, occupied, steps, att, calls, pendingQ, verdict, arr, queue,
                 gate, dep, inflight, alive, crashes, yields, drops, ctrls>>

AttOf(s) == {t \in att : t.run = runId /\ t.step = s}
CanRequest(o) == alive /\ epoch = 1 /\ Cur > 0 /\ ~Closed /\ runSt = "running" /\ o < MaxAtt
  /\ ~(\E t \in AttOf(Cur) : t.ord = o)
  /\ (o = 0 \/ (\E u \in AttOf(Cur) : u.ord = o - 1 /\ u.st = "settled"))
RequestModel(o) == CanRequest(o) /\ gate                  \* E3 准入
  /\ att' = att \cup {[run |-> runId, step |-> Cur, ord |-> o, st |-> "admitted", sent |-> 0]}
  /\ Commit(Op("admit_attempt", Cur, o), {"admit"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, calls, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls>>
GateBlockE3 == (\E o \in 0..(MaxAtt - 1) : CanRequest(o)) /\ ~gate
  /\ runSt' = "waiting_gate" /\ gateRef' = "budget" /\ gateRet' = "E3"
  /\ Commit(Op("await_gate", Cur, 0), {"E3"})
  /\ UNCHANGED <<runId, hist, epoch, occupied, steps, att, calls, pendingQ, verdict, arr, queue,
                 gate, dep, inflight, alive, crashes, yields, drops, ctrls>>

Dispatch(t) == alive /\ epoch = 1 /\ t.st = "admitted" /\ runSt = "running"   \* CC-03 位置分配
  /\ att' = (att \ {t}) \cup {[t EXCEPT !.st = "pending_durable"]}
  /\ Commit(Op("dispatch_attempt", t.step, t.ord), {"dispatch"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, calls, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls>>
Durable(t) == alive /\ t.st = "pending_durable"                              \* MC-04 发网前耐久
  /\ att' = (att \ {t}) \cup {[t EXCEPT !.st = "dispatched"]} /\ inflight' = inflight \cup {t}
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, calls, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, alive, crashes, yields, drops, ctrls>>
Send(t) == alive /\ t.sent = 0
  /\ (IF Mutation = "sendEarly" THEN t.st \in {"admitted", "pending_durable", "dispatched"}
      ELSE t \in inflight /\ t.st = "dispatched")
  /\ att' = (att \ {t}) \cup {[t EXCEPT !.sent = 1]} /\ inflight' = inflight \ {t}
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, calls, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, alive, crashes, yields, drops, ctrls>>
SettleAttempt(t) == alive /\ t.st = "dispatched" /\ t \notin inflight
  /\ att' = (att \ {t}) \cup {[t EXCEPT !.st = "settled"]}
  /\ Commit(Op("settle_attempt", t.step, t.ord), {"settle"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, calls, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls>>
Success == \E t \in AttOf(Cur) : t.st = "settled"

ProposeCalls(S) == alive /\ epoch = 1 /\ Cur > 0 /\ ~Closed /\ runSt = "running" /\ Success   \* E4
  /\ S # {} /\ (\A c \in S : calls[c].st = "none")
  /\ ~(\E d \in CIds : calls[d].run = runId /\ calls[d].step = Cur)      \* 每 Step 一批
  /\ calls' = [c \in CIds |-> IF c \in S THEN [st |-> "proposed", run |-> runId, step |-> Cur,
                                               fg |-> TRUE, runPos |-> FALSE, starts |-> 0] ELSE calls[c]]
  /\ Commit(Op("propose_call", Cur, 0), S)
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls>>
Proposed(c) == alive /\ epoch = 1 /\ runSt = "running" /\ calls[c].run = runId /\ calls[c].st = "proposed"
GateAllow(c) == Proposed(c) /\ gate
  /\ calls' = [calls EXCEPT ![c].st = "admitted"] /\ Commit(OpK("admit_call", calls[c].step, c), {"allow"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls>>
GateAsk(c) == Proposed(c)
  /\ calls' = [calls EXCEPT ![c].st = "waiting_approval"] /\ Commit(OpK("admit_call", calls[c].step, c), {"ask"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls>>
GateDeny(c, a) == Proposed(c)
  /\ calls' = [calls EXCEPT ![c].st = "settled"] /\ Accept(a, "call_settlement", c)
  /\ Commit(OpK("admit_call", calls[c].step, c), {"deny"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, pendingQ, verdict, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls>>
GateBlockE4 == (\E c \in CIds : Proposed(c)) /\ ~gate
  /\ runSt' = "waiting_gate" /\ gateRef' = "budget" /\ gateRet' = "E4"
  /\ Commit(Op("await_gate", Cur, 1), {"E4"})
  /\ UNCHANGED <<runId, hist, epoch, occupied, steps, att, calls, pendingQ, verdict, arr, queue,
                 gate, dep, inflight, alive, crashes, yields, drops, ctrls>>
StartCall(c) == alive /\ epoch = 1 /\ calls[c].run = runId /\ calls[c].st = "admitted"
  /\ calls[c].starts = 0                                                     \* TL-08 幂等接纳
  /\ calls' = [calls EXCEPT ![c].st = "executing", ![c].starts = 1]
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls>>
Detach(c) == calls[c].st = "executing" /\ calls[c].fg /\ ~calls[c].runPos
  /\ calls' = [calls EXCEPT ![c].fg = FALSE]
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls>>

\* 执行 owner 侧终态与 Inbound 受理：两次提交，不依赖 alive
SettleCall(c) == calls[c].st = "executing" /\ calls' = [calls EXCEPT ![c].st = "settled"]
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls>>
AcceptSettlement(a, c) == calls[c].st = "settled" /\ SettleArr(c) = {}
  /\ Accept(a, "call_settlement", c)
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, pendingQ, verdict, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls>>

SettleStep == alive /\ epoch = 1 /\ Cur > 0 /\ ~Closed /\ runSt = "running" /\ Success   \* E5
  /\ ~Blocking(Cur)                                                          \* E5W = 未使能
  /\ steps' = [steps EXCEPT ![Cur].closed = TRUE] /\ Commit(Op("settle_step", Cur, 0), {"close"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, att, calls, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls>>
Wait == alive /\ epoch = 1 /\ Closed /\ runSt = "running"                    \* E6 进入
  /\ ReadyModel = {} /\ ReadyApprove = {} /\ ~CompleteCond
  /\ runSt' = (IF (\E q \in QIds : pendingQ[q] = runId)
                  \/ (\E c \in CIds : calls[c].run = runId /\ calls[c].st = "waiting_approval")
               THEN "waiting_human" ELSE "waiting")
  /\ UNCHANGED <<runId, hist, epoch, occupied, steps, att, calls, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls>>
ApproveReady(c) == alive /\ epoch = 1 /\ Closed /\ runSt \in {"running", "waiting", "waiting_human"}
  /\ calls[c].run = runId /\ calls[c].st = "waiting_approval" /\ (\E a \in ReadyApprove : arr[a].refs = c)
ConsumeApproval(c) == arr' = [b \in A |-> IF b \in ReadyApprove /\ arr[b].refs = c
                                          THEN [arr[b] EXCEPT !.st = "consumed"] ELSE arr[b]]
AdmitApproved(c) == ApproveReady(c) /\ verdict[c] = "approve" /\ gate      \* E4A
  /\ calls' = [calls EXCEPT ![c].st = "admitted", ![c].runPos = TRUE] /\ ConsumeApproval(c)
  /\ Commit(OpK("consume_decision", calls[c].step, c), {"consume_approval"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, pendingQ, verdict, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls>>
DenyRejected(c) == ApproveReady(c) /\ verdict[c] = "reject"                 \* E4A 的 reject 分支
  /\ calls' = [calls EXCEPT ![c].st = "settled", ![c].runPos = TRUE] /\ ConsumeApproval(c)
  /\ Commit(OpK("consume_decision", calls[c].step, c), {"consume_reject"})
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, pendingQ, verdict, queue,
                 gate, dep, gateRef, gateRet, inflight, alive, crashes, yields, drops, ctrls>>
GateBlockE4A == (\E c \in CIds : ApproveReady(c) /\ verdict[c] = "approve") /\ ~gate
  /\ runSt' = "waiting_gate" /\ gateRef' = "budget" /\ gateRet' = "E4A"
  /\ Commit(Op("await_gate", Cur, 2), {"E4A"})
  /\ UNCHANGED <<runId, hist, epoch, occupied, steps, att, calls, pendingQ, verdict, arr, queue,
                 gate, dep, inflight, alive, crashes, yields, drops, ctrls>>
WakeGate == alive /\ epoch = 1 /\ runSt = "waiting_gate"
  /\ (\E g \in ReadyGate : arr[g].refs = gateRef)
  /\ arr' = [a \in A |-> IF a \in ReadyGate THEN [arr[a] EXCEPT !.st = "consumed"] ELSE arr[a]]
  /\ runSt' = (IF gateRet = "E4A" THEN "waiting" ELSE "running")
  /\ gateRef' = "" /\ gateRet' = ""
  /\ UNCHANGED <<runId, hist, epoch, occupied, steps, att, calls, pendingQ, verdict, queue,
                 gate, dep, ops, inflight, alive, crashes, yields, drops, ctrls>>

\* E7 抽象为原子：在途调用取得合成/真实终态，其结算成为 Run 级位置（runPos），不再属于 Step 批
CloseOut == calls' = [c \in CIds |-> IF calls[c].run = runId
                         /\ calls[c].st \in {"proposed", "waiting_approval", "admitted", "executing"}
                       THEN [calls[c] EXCEPT !.st = "settled", !.runPos = TRUE] ELSE calls[c]]
ConvertOrClose(r) ==
  /\ arr' = [a \in A |-> IF Cls(a) /\ Mutation # "splitSettle"
                         THEN [arr[a] EXCEPT !.st = IF r \in {"completed", "failed"} THEN "converted" ELSE "closed"]
                         ELSE arr[a]]
  /\ queue' = IF r \in {"completed", "failed"} /\ Mutation # "splitSettle"
              THEN queue \cup {a \in A : Cls(a)} ELSE queue
SettleRun(r) == alive /\ epoch = 1 /\ occupied /\ Closed                     \* E8
  /\ (r = "completed" => CompleteCond) /\ runSt = "running"
  /\ runSt' = r /\ epoch' = 0 /\ occupied' = FALSE /\ ConvertOrClose(r)
  /\ Commit(Op("settle_run", 0, 0), {r})
  /\ UNCHANGED <<runId, hist, steps, att, calls, pendingQ, verdict, gate, dep, gateRef, gateRet,
                 inflight, alive, crashes, yields, drops, ctrls>>
FailRun == alive /\ epoch = 1 /\ occupied /\ runSt = "running" /\ Cur > 0 /\ CloseOut
  /\ runSt' = "failed" /\ epoch' = 0 /\ occupied' = FALSE /\ ConvertOrClose("failed")
  /\ Commit(Op("settle_run", 0, 0), {"failed"})
  /\ UNCHANGED <<runId, hist, steps, att, pendingQ, verdict, gate, dep, gateRef, gateRet,
                 inflight, alive, crashes, yields, drops, ctrls>>

Interrupt == alive /\ runSt \in Drive /\ ctrls < 1 /\ CloseOut                \* HD-04：问题保留
  /\ runSt' = "interrupted" /\ epoch' = 0 /\ occupied' = FALSE /\ gateRef' = "" /\ gateRet' = ""
  /\ ctrls' = ctrls + 1
  /\ UNCHANGED <<runId, hist, steps, att, pendingQ, verdict, arr, queue, gate, dep, ops,
                 inflight, alive, crashes, yields, drops>>
Resume == alive /\ runSt = "interrupted" /\ ~occupied /\ ~Unadjudicated     \* E0
  /\ epoch' = 1 /\ occupied' = TRUE /\ runSt' = "running"
  /\ UNCHANGED <<runId, hist, steps, att, calls, pendingQ, verdict, arr, queue, gate, dep,
                 gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls>>
Cancel == alive /\ runSt \in Live /\ CloseOut
  /\ pendingQ' = [q \in QIds |-> IF pendingQ[q] = runId THEN 0 ELSE pendingQ[q]]
  /\ runSt' = "cancelled" /\ epoch' = 0 /\ occupied' = FALSE /\ gateRef' = "" /\ gateRet' = ""
  /\ ConvertOrClose("cancelled") /\ Commit(Op("settle_run", 0, 0), {"cancelled"})
  /\ UNCHANGED <<runId, hist, steps, att, verdict, gate, dep, inflight, alive, crashes, yields, drops, ctrls>>
ForceStop == alive /\ runSt \in Drive /\ ctrls < 1 /\ runSt' = "stopping" /\ epoch' = 0  \* 占位保留
  /\ gateRef' = "" /\ gateRet' = "" /\ ctrls' = ctrls + 1
  /\ UNCHANGED <<runId, hist, occupied, steps, att, calls, pendingQ, verdict, arr, queue, gate, dep,
                 ops, inflight, alive, crashes, yields, drops>>
ConfirmIsolation == runSt = "stopping" /\ CloseOut
  /\ pendingQ' = [q \in QIds |-> IF pendingQ[q] = runId THEN 0 ELSE pendingQ[q]]
  /\ runSt' = "cancelled" /\ occupied' = FALSE
  /\ ConvertOrClose("cancelled") /\ Commit(Op("settle_run", 0, 0), {"cancelled"})
  /\ UNCHANGED <<runId, hist, epoch, steps, att, verdict, gate, dep, gateRef, gateRet,
                 inflight, alive, crashes, yields, drops, ctrls>>

\* 运行时退役：只封闭 epoch、保留占位（A-1）；前提沿 AR-12：本实例无在途前台工作
Yield == alive /\ epoch = 1 /\ runSt \in Drive /\ yields < 1
  /\ ~(\E c \in CIds : calls[c].run = runId /\ calls[c].fg /\ calls[c].st \in {"admitted", "executing"})
  /\ epoch' = 0 /\ yields' = yields + 1
  /\ occupied' = (IF Mutation = "yieldRelease" THEN FALSE ELSE occupied)
  /\ UNCHANGED <<runId, runSt, hist, steps, att, calls, pendingQ, verdict, arr, queue, gate, dep,
                 gateRef, gateRet, ops, inflight, alive, crashes, drops, ctrls>>
Reacquire == alive /\ epoch = 0 /\ occupied /\ runSt \in Drive /\ ~Unadjudicated   \* E0 重取
  /\ epoch' = 1
  /\ UNCHANGED <<runId, runSt, hist, occupied, steps, att, calls, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls>>

\* ---------- 环境 ----------
GateDrop == gate /\ drops < 1 /\ gate' = FALSE /\ drops' = drops + 1
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, pendingQ, verdict, arr,
                 queue, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, ctrls>>
GateRestore(a) == ~gate /\ gate' = TRUE /\ Accept(a, "gate_restored", "budget")
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, pendingQ, verdict,
                 queue, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls>>
DepDrop == dep /\ drops < 1 /\ dep' = FALSE /\ drops' = drops + 1
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, pendingQ, verdict, arr,
                 queue, gate, gateRef, gateRet, ops, inflight, alive, crashes, yields, ctrls>>
DepRestore(a) == ~dep /\ dep' = TRUE /\ Accept(a, "gate_restored", "dependency")
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, pendingQ, verdict,
                 queue, gate, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls>>
ExtTrigger(a) == Accept(a, "connector_condition", "none")
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, pendingQ, verdict,
                 queue, gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls>>
AskQuestion(q) == alive /\ epoch = 1 /\ Cur > 0 /\ ~Closed /\ pendingQ[q] = 0
  /\ pendingQ' = [pendingQ EXCEPT ![q] = runId]
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls>>
Answer(q, a) == pendingQ[q] # 0 /\ Accept(a, "human_answer", q)             \* HD-08：答复与接续同提交
  /\ pendingQ' = [pendingQ EXCEPT ![q] = 0]
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, verdict, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls>>
Decide(c, a, v) == calls[c].st = "waiting_approval" /\ verdict[c] = "none"
  /\ verdict' = [verdict EXCEPT ![c] = v] /\ Accept(a, "human_answer", c)
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, pendingQ, queue,
                 gate, dep, gateRef, gateRet, ops, inflight, alive, crashes, yields, drops, ctrls>>

Crash == alive /\ crashes < 1 /\ alive' = FALSE /\ inflight' = {} /\ crashes' = crashes + 1
  /\ att' = {t \in att : t.st # "pending_durable"}
           \cup {[u EXCEPT !.st = "admitted"] : u \in {w \in att : w.st = "pending_durable"}}
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, calls, pendingQ, verdict, arr, queue,
                 gate, dep, gateRef, gateRet, ops, yields, drops, ctrls>>
Recover == ~alive /\ alive' = TRUE                                           \* E0：状态即前缀
  /\ UNCHANGED <<runId, runSt, hist, epoch, occupied, steps, att, calls, pendingQ, verdict, arr,
                 queue, gate, dep, gateRef, gateRet, ops, inflight, crashes, yields, drops, ctrls>>

Next ==
  \/ \E a \in A : Adjudicate(a) \/ TakeTrigger(a) \/ GateRestore(a) \/ DepRestore(a) \/ ExtTrigger(a)
  \/ OpenStep \/ GateBlockE1 \/ GateBlockE3 \/ GateBlockE4 \/ GateBlockE4A
  \/ \E o \in 0..(MaxAtt - 1) : RequestModel(o)
  \/ \E t \in att : Dispatch(t) \/ Durable(t) \/ Send(t) \/ SettleAttempt(t)
  \/ \E S \in SUBSET CIds : ProposeCalls(S)
  \/ \E c \in CIds : GateAllow(c) \/ GateAsk(c) \/ StartCall(c) \/ Detach(c) \/ SettleCall(c)
                    \/ AdmitApproved(c) \/ DenyRejected(c)
  \/ \E d \in CIds, b \in A : GateDeny(d, b) \/ AcceptSettlement(b, d)
                             \/ Decide(d, b, "approve") \/ Decide(d, b, "reject")
  \/ \E q \in QIds : AskQuestion(q)
  \/ \E q \in QIds, e \in A : Answer(q, e)
  \/ SettleStep \/ Wait \/ WakeGate \/ SettleRun("completed") \/ FailRun
  \/ Interrupt \/ Resume \/ Cancel \/ ForceStop \/ ConfirmIsolation
  \/ Yield \/ Reacquire \/ GateDrop \/ DepDrop \/ Crash \/ Recover

Init == runId = 1 /\ runSt = "running" /\ hist = [r \in {} |-> ""] /\ epoch = 1 /\ occupied = TRUE
  /\ steps = <<>> /\ att = {}
  /\ calls = [c \in CIds |-> [st |-> "none", run |-> 0, step |-> 0, fg |-> TRUE, runPos |-> FALSE, starts |-> 0]]
  /\ pendingQ = [q \in QIds |-> 0] /\ verdict = [c \in CIds |-> "none"]
  /\ arr = [a \in A |-> [st |-> "none", src |-> "", refs |-> "none", intent |-> "none",
                         obsRun |-> 0, obsSt |-> "", obsWait |-> FALSE]]
  /\ queue = {} /\ gate = TRUE /\ dep = TRUE /\ gateRef = "" /\ gateRet = ""
  /\ ops = {} /\ inflight = {} /\ alive = TRUE /\ crashes = 0 /\ yields = 0 /\ drops = 0 /\ ctrls = 0

Spec == Init /\ [][Next]_vars

\* ---------- 安全不变式 ----------
I1   == (occupied => runSt \in NonTerm) /\ (runSt \in Drive /\ epoch = 1 => occupied)
Hist == \A rid \in DOMAIN hist : hist[rid] \in Term \cup {"interrupted"}    \* 被越过的 Run 只能是终态或 interrupted
I9   == \A s \in 1..Cur : steps[s].closed => ~Blocking(s)
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
I22  == /\ (runSt = "completed" => ~\E c \in CIds : calls[c].run = runId /\ calls[c].st = "executing" /\ calls[c].fg)
        /\ \A c \in CIds : (calls[c].runPos /\ calls[c].st = "executing" /\ calls[c].fg) => StOf(calls[c].run) \in NonTerm
I23  == \A c \in CIds : (calls[c].run = runId /\ calls[c].fg /\ calls[c].st = "settled" /\ runSt \in Live)
          => \A a \in SettleArr(c) : arr[a].st \in {"classified", "consumed"} => arr[a].intent = "continuation"
I24  == (runSt = "waiting_gate") <=> (gateRef \in Gates /\ gateRet \in {"E1", "E3", "E4", "E4A"})
NoDouble == \A c \in CIds :
  Cardinality({s \in 1..Cur : \E a \in steps[s].cut : arr[a].src = "call_settlement" /\ arr[a].refs = c}) <= 1

\* ---------- 进展 ----------
Fair == /\ \A b \in A : WF_vars(Adjudicate(b)) /\ WF_vars(TakeTrigger(b))
        /\ WF_vars(OpenStep) /\ WF_vars(WakeGate) /\ WF_vars(Recover) /\ WF_vars(Reacquire)
        /\ WF_vars(GateBlockE1) /\ WF_vars(GateBlockE3) /\ WF_vars(GateBlockE4) /\ WF_vars(GateBlockE4A)
        /\ \A c \in CIds : WF_vars(AdmitApproved(c)) /\ WF_vars(DenyRejected(c))
LiveSpec == Spec /\ Fair
\* 就绪的接续或批准最终被消费；Run 离开可推进状态或进入门等待（由 P1g 接力）也算收敛；
\* Cur < MaxSteps 排除模型边界造成的伪反例
P1  == \A a \in A : [](runSt \in {"waiting", "waiting_human"} /\ epoch = 1 /\ Cur < MaxSteps
                        /\ a \in ReadyModel \cup ReadyApprove
          => <>(arr[a].st # "classified" \/ runSt \notin Drive \/ runSt = "waiting_gate"))
P1g == [](runSt = "waiting_gate" /\ epoch = 1 /\ (\E a \in ReadyGate : arr[a].refs = gateRef)
          => <>(runSt # "waiting_gate"))
P1y == [](epoch = 0 /\ occupied /\ runSt \in Drive => <>(epoch = 1 \/ runSt \notin Drive))
P2  == [](~occupied /\ queue # {} /\ runId < MaxRuns => <>occupied)
=============================================================================
