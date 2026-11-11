--------------------------- MODULE SuspendedSlots ---------------------------
(***************************************************************************)
(* Tool 调用的暂停与执行名额：调用域与队列域分两笔提交。                    *)
(*                                                                         *)
(* call[c]  调用域阶段（Tool 账本 call 域，一笔 CAS 提交一次迁移）            *)
(*   new -> queued -> running -> suspended -> ready -> running -> settled   *)
(* entry[c] 队列域条目阶段（Tool 账本 queue 域，一笔 CAS 提交一次迁移）       *)
(*   none -> ready -> held -> parked -> ready -> held -> gone               *)
(*                                                                         *)
(* 每个动作对应一笔账本提交；两域之间没有共同事务。驱动任务会无限重试，      *)
(* 所以「两笔提交之间崩溃」等价于两笔之间的任意延迟，用交错来表达。          *)
(* Crash 表示进程崩溃使正在运行的作者段丢失：按 Tool 规则失联失败收束。      *)
(*                                                                         *)
(* 前提：受理时的容量检查和条目创建是一笔原子提交。受理时读取容量与提交     *)
(* 受理不在同一事务，可能短暂超额，这不在本模型范围。不建模 FIFO 次序，     *)
(* 只建模数量上限；人可能永远不答。                                        *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Calls, Waiters, Limit, Capacity, Bad

VARIABLES call, entry, waited
vars == <<call, entry, waited>>

Live == {"ready", "held", "parked"}
Held == {c \in Calls : entry[c] = "held"}
Outstanding == {c \in Calls : entry[c] \in Live}
Counted == IF Bad = "parkFree"
             THEN {c \in Calls : entry[c] \in {"ready", "held"}}
             ELSE Outstanding

Init == /\ call = [c \in Calls |-> "new"]
        /\ entry = [c \in Calls |-> "none"]
        /\ waited = [c \in Calls |-> FALSE]

\* 受理：调用域 accepted/queued 与队列域条目创建（见前提）。
Admit(c) == /\ call[c] = "new"
            /\ Cardinality(Counted) < Capacity
            /\ call' = [call EXCEPT ![c] = "queued"]
            /\ entry' = [entry EXCEPT ![c] = "ready"]
            /\ UNCHANGED waited

\* 队列域：ready -> held（decideQueueHold），名额上限在这里检查。
Hold(c) == /\ entry[c] = "ready"
           /\ Cardinality(Held) < Limit
           /\ entry' = [entry EXCEPT ![c] = "held"]
           /\ UNCHANGED <<call, waited>>

HoldOk(c) == entry[c] = "held" \/ Bad = "skiphold"

\* 调用域：queued -> running（decideRecordStart）。
Start(c) == /\ call[c] = "queued" /\ HoldOk(c)
            /\ call' = [call EXCEPT ![c] = "running"]
            /\ UNCHANGED <<entry, waited>>

\* 调用域自己的 suspend 提交：running -> suspended，同时记下检查点、等待 opening 与登记任务。
Suspend(c) == /\ call[c] = "running" /\ c \in Waiters /\ ~waited[c]
              /\ call' = [call EXCEPT ![c] = "suspended"]
              /\ waited' = [waited EXCEPT ![c] = TRUE]
              /\ UNCHANGED entry

\* 队列域：held -> parked，释放名额但仍计入未终局数。
\* 释放依据是调用域已提交的 suspended（含检查点）。只有仍在等人时才释放：
\* 答复若先于释放到达（call 已 ready），就保留名额直接恢复。否则会出现
\* 「释放、重排、再取得、再释放」的活锁。
ParkAllowed(c) == call[c] = "suspended"
                  \/ (Bad = "early" /\ call[c] = "running")
Park(c) == /\ entry[c] = "held" /\ ParkAllowed(c)
           /\ entry' = [entry EXCEPT ![c] = "parked"]
           /\ UNCHANGED <<call, waited>>

\* 调用域的 acceptDecision 提交：最后一张卡处理完、决定被接受后，调用就绪。
\* 人可能永远不答，所以这个动作没有公平性。
Answer(c) == /\ call[c] = "suspended"
             /\ call' = [call EXCEPT ![c] = "ready"]
             /\ UNCHANGED <<entry, waited>>

\* 队列域：parked -> ready，用新序号重新排队。
Requeue(c) == /\ call[c] = "ready" /\ entry[c] = "parked"
              /\ entry' = [entry EXCEPT ![c] = "ready"]
              /\ UNCHANGED <<call, waited>>

\* 调用域：ready -> running，从检查点启动恢复段。
Resume(c) == /\ call[c] = "ready" /\ HoldOk(c)
             /\ (entry[c] # "parked" \/ Bad = "skiphold")
             /\ call' = [call EXCEPT ![c] = "running"]
             /\ UNCHANGED <<entry, waited>>

\* 调用域：作者返回 completed，收场。
Finish(c) == /\ call[c] = "running" /\ (c \notin Waiters \/ waited[c])
             /\ call' = [call EXCEPT ![c] = "settled"]
             /\ UNCHANGED <<entry, waited>>

\* 调用域：取消等待中或就绪中的调用（叫停、归档、插队）。
Cancel(c) == /\ call[c] \in {"suspended", "ready"}
             /\ call' = [call EXCEPT ![c] = "settled"]
             /\ UNCHANGED <<entry, waited>>

\* 进程崩溃使运行中的段丢失：失联失败收束。
Crash(c) == /\ call[c] = "running"
            /\ call' = [call EXCEPT ![c] = "settled"]
            /\ UNCHANGED <<entry, waited>>

\* 队列域：调用已收场，删除条目（凭释放依据）。
ReleaseFrom == IF Bad = "noRelease" THEN {"held"} ELSE Live
Release(c) == /\ call[c] = "settled" /\ entry[c] \in ReleaseFrom
              /\ entry' = [entry EXCEPT ![c] = "gone"]
              /\ UNCHANGED <<call, waited>>

Next == \E c \in Calls :
          \/ Admit(c) \/ Hold(c) \/ Start(c) \/ Suspend(c) \/ Park(c)
          \/ Answer(c) \/ Requeue(c) \/ Resume(c) \/ Finish(c)
          \/ Cancel(c) \/ Crash(c) \/ Release(c)

Fair == \A c \in Calls :
          /\ WF_vars(Hold(c)) /\ WF_vars(Start(c)) /\ WF_vars(Suspend(c))
          /\ WF_vars(Park(c)) /\ WF_vars(Requeue(c)) /\ WF_vars(Resume(c))
          /\ WF_vars(Finish(c)) /\ WF_vars(Release(c))

Spec == Init /\ [][Next]_vars /\ Fair

\* ---- 安全性质 ----
TypeOK == /\ call \in [Calls -> {"new","queued","running","suspended","ready","settled"}]
          /\ entry \in [Calls -> {"none","ready","held","parked","gone"}]
CapacityBound == Cardinality(Held) <= Limit
RunningImpliesHeld == \A c \in Calls : call[c] = "running" => entry[c] = "held"
ParkedImpliesSuspended == \A c \in Calls :
                            entry[c] = "parked" => call[c] \in {"suspended","ready","settled"}
OutstandingBound == Cardinality(Outstanding) <= Capacity

\* ---- 进展性质（在上面的弱公平下）----
NoStrandedEntry == \A c \in Calls : call[c] = "settled" ~> entry[c] = "gone"
SuspendedReleasesSlot == \A c \in Calls :
                           (call[c] = "suspended" /\ entry[c] = "held") ~> entry[c] # "held"
ReadyProgresses == \A c \in Calls : call[c] = "ready" ~> call[c] \in {"running","settled"}
=============================================================================
