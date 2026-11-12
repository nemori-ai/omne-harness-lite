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
(* 停泊与重新排队先读调用域、再提交队列域，中间可以隔任意多步，所以各拆成    *)
(* 「读」与「落」两个动作：落的那一笔只看队列域自己的条目。holder[c] 记      *)
(* 持有名额的是哪一段的操作（1 是第一段的启动，2 是恢复）。                  *)
(* basis[c] 是调用域里的释放依据：执行结束（physical-end），或调用在暂停中   *)
(* 被控制收场（suspended-exclusion，由 suspend 提交证明没有活的执行体）。     *)
(* 条目只凭释放依据删除；停泊不是释放。                                      *)
(*                                                                         *)
(* 前提：受理时的容量检查和条目创建是一笔原子提交。受理时读取容量与提交     *)
(* 受理不在同一事务，可能短暂超额，这不在本模型范围。不建模 FIFO 次序，     *)
(* 只建模数量上限；人可能永远不答。                                        *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Calls, Waiters, Limit, Capacity, Bad

VARIABLES call, entry, waited, basis, holder, parkSeen, requeueSeen
vars == <<call, entry, waited, basis, holder, parkSeen, requeueSeen>>

Live == {"ready", "held", "parked"}
Held == {c \in Calls : entry[c] = "held"}
Outstanding == {c \in Calls : entry[c] \in Live}
Counted == IF Bad = "parkFree"
             THEN {c \in Calls : entry[c] \in {"ready", "held"}}
             ELSE Outstanding

Init == /\ call = [c \in Calls |-> "new"]
        /\ entry = [c \in Calls |-> "none"]
        /\ waited = [c \in Calls |-> FALSE]
        /\ basis = [c \in Calls |-> "none"]
        /\ holder = [c \in Calls |-> 0]
        /\ parkSeen = [c \in Calls |-> FALSE]
        /\ requeueSeen = [c \in Calls |-> FALSE]

\* 受理：调用域 accepted/queued 与队列域条目创建（见前提）。
Admit(c) == /\ call[c] = "new"
            /\ Cardinality(Counted) < Capacity
            /\ call' = [call EXCEPT ![c] = "queued"]
            /\ entry' = [entry EXCEPT ![c] = "ready"]
            /\ UNCHANGED <<waited, basis, holder, parkSeen, requeueSeen>>

\* 队列域：ready -> held（decideQueueHold），名额上限在这里检查。条目记下取得名额的操作：
\* 还没启动过的调用是第一段的启动，其余是恢复。
Hold(c) == /\ entry[c] = "ready"
           /\ Cardinality(Held) < Limit
           /\ entry' = [entry EXCEPT ![c] = "held"]
           /\ holder' = [holder EXCEPT ![c] = IF call[c] = "queued" THEN 1 ELSE 2]
           /\ UNCHANGED <<call, waited, basis, parkSeen, requeueSeen>>

\* 队列域：答复先于停泊到达时，恢复沿用第一段还持有的名额（decideQueueHold 的 keep），
\* 并把条目改记到恢复的操作上。此后迟到的停泊对不上持有者。
Keep(c) == /\ call[c] = "ready" /\ entry[c] = "held" /\ holder[c] = 1
           /\ holder' = [holder EXCEPT ![c] = 2]
           /\ UNCHANGED <<call, entry, waited, basis, parkSeen, requeueSeen>>

HoldOk(c) == entry[c] = "held" \/ Bad = "skiphold"
Rest == <<basis, holder, parkSeen, requeueSeen>>

\* 调用域：queued -> running（decideRecordStart）。
Start(c) == /\ call[c] = "queued" /\ HoldOk(c)
            /\ call' = [call EXCEPT ![c] = "running"]
            /\ UNCHANGED <<entry, waited>> /\ UNCHANGED Rest

\* 调用域自己的 suspend 提交：running -> suspended，同时记下检查点、等待 opening 与登记任务。
Suspend(c) == /\ call[c] = "running" /\ c \in Waiters /\ ~waited[c]
              /\ call' = [call EXCEPT ![c] = "suspended"]
              /\ waited' = [waited EXCEPT ![c] = TRUE]
              /\ UNCHANGED entry /\ UNCHANGED Rest

\* 队列域：held -> parked，释放名额但仍计入未终局数。
\* 释放依据是调用域已提交的 suspended（含检查点）。只有仍在等人时才释放：
\* 答复若先于释放到达（call 已 ready），就保留名额直接恢复。否则会出现
\* 「释放、重排、再取得、再释放」的活锁。
\* 停泊的那一笔（decideQueuePark）只停泊「暂停的那一段」取得的名额：条目仍是 held 且持有者
\* 是第一段的启动。对不上就什么也不写。
ParkAllowed(c) == call[c] = "suspended"
                  \/ (Bad = "early" /\ call[c] = "running")
ParkRead(c) == /\ ~parkSeen[c] /\ entry[c] = "held" /\ ParkAllowed(c)
               /\ parkSeen' = [parkSeen EXCEPT ![c] = TRUE]
               /\ UNCHANGED <<call, entry, waited, basis, holder, requeueSeen>>
ParkLand(c) == /\ parkSeen[c]
               /\ parkSeen' = [parkSeen EXCEPT ![c] = FALSE]
               /\ entry' = IF entry[c] = "held" /\ (holder[c] = 1 \/ Bad = "parkAnyHolder")
                              THEN [entry EXCEPT ![c] = IF Bad = "parkDelete" THEN "gone" ELSE "parked"]
                              ELSE entry
               /\ UNCHANGED <<call, waited, basis, holder, requeueSeen>>

\* 调用域的 acceptDecision 提交：最后一张卡处理完、决定被接受后，调用就绪。
\* 人可能永远不答，所以这个动作没有公平性。
Answer(c) == /\ call[c] = "suspended"
             /\ call' = [call EXCEPT ![c] = "ready"]
             /\ UNCHANGED <<entry, waited>> /\ UNCHANGED Rest

\* 队列域：parked -> ready，用新序号重新排队（decideQueueRequeue）。落的那一笔只移动一个
\* 停泊的条目；条目不在时什么也不写，所以已删除的条目不会被重新创建。
RequeueFrom == IF Bad = "parkDelete" THEN {"parked", "gone"} ELSE {"parked"}
RequeueRead(c) == /\ ~requeueSeen[c] /\ call[c] = "ready" /\ entry[c] \in RequeueFrom
                  /\ requeueSeen' = [requeueSeen EXCEPT ![c] = TRUE]
                  /\ UNCHANGED <<call, entry, waited, basis, holder, parkSeen>>
RequeueLand(c) == /\ requeueSeen[c]
                  /\ requeueSeen' = [requeueSeen EXCEPT ![c] = FALSE]
                  /\ entry' = IF entry[c] \in RequeueFrom
                                 THEN [entry EXCEPT ![c] = "ready"]
                                 ELSE entry
                  /\ UNCHANGED <<call, waited, basis, holder, parkSeen>>

\* 调用域：ready -> running，从检查点启动恢复段。名额须由恢复的操作持有。
Resume(c) == /\ call[c] = "ready"
             /\ (entry[c] = "held" /\ holder[c] = 2) \/ Bad = "skiphold"
             /\ call' = [call EXCEPT ![c] = "running"]
             /\ UNCHANGED <<entry, waited>> /\ UNCHANGED Rest

\* 调用域：作者返回 completed，收场。
Settle(c, why) == /\ call' = [call EXCEPT ![c] = "settled"]
                  /\ basis' = [basis EXCEPT ![c] = why]
                  /\ UNCHANGED <<entry, waited, holder, parkSeen, requeueSeen>>

Finish(c) == /\ call[c] = "running" /\ (c \notin Waiters \/ waited[c])
             /\ Settle(c, "physical-end")

\* 调用域：控制让等待中或就绪中的调用收场（叫停、归档、插队）。这时没有活的执行体，
\* 依据是 suspend 提交留下的排除记录。
Cancel(c) == /\ call[c] \in {"suspended", "ready"}
             /\ Settle(c, "suspended-exclusion")

\* 进程崩溃使运行中的段丢失：失联失败收束。
Crash(c) == /\ call[c] = "running"
            /\ Settle(c, "physical-end")

\* 队列域：删除条目（decideQueueRelease），只凭调用域里的释放依据。
ReleaseFrom == IF Bad = "noRelease" THEN {"held"} ELSE Live
Release(c) == /\ basis[c] # "none" /\ entry[c] \in ReleaseFrom
              /\ entry' = [entry EXCEPT ![c] = "gone"]
              /\ UNCHANGED <<call, waited, basis, holder, parkSeen, requeueSeen>>

Next == \E c \in Calls :
          \/ Admit(c) \/ Hold(c) \/ Keep(c) \/ Start(c) \/ Suspend(c)
          \/ ParkRead(c) \/ ParkLand(c) \/ Answer(c)
          \/ RequeueRead(c) \/ RequeueLand(c) \/ Resume(c) \/ Finish(c)
          \/ Cancel(c) \/ Crash(c) \/ Release(c)

Fair == \A c \in Calls :
          /\ WF_vars(Hold(c)) /\ WF_vars(Keep(c)) /\ WF_vars(Start(c)) /\ WF_vars(Suspend(c))
          /\ WF_vars(ParkRead(c)) /\ WF_vars(ParkLand(c))
          /\ WF_vars(RequeueRead(c)) /\ WF_vars(RequeueLand(c)) /\ WF_vars(Resume(c))
          /\ WF_vars(Finish(c)) /\ WF_vars(Release(c))

Spec == Init /\ [][Next]_vars /\ Fair

\* ---- 安全性质 ----
TypeOK == /\ call \in [Calls -> {"new","queued","running","suspended","ready","settled"}]
          /\ entry \in [Calls -> {"none","ready","held","parked","gone"}]
          /\ basis \in [Calls -> {"none","physical-end","suspended-exclusion"}]
          /\ holder \in [Calls -> 0..2]
          /\ parkSeen \in [Calls -> BOOLEAN] /\ requeueSeen \in [Calls -> BOOLEAN]
CapacityBound == Cardinality(Held) <= Limit
RunningImpliesHeld == \A c \in Calls : call[c] = "running" => entry[c] = "held"
ParkedImpliesSuspended == \A c \in Calls :
                            entry[c] = "parked" => call[c] \in {"suspended","ready","settled"}
OutstandingBound == Cardinality(Outstanding) <= Capacity
\* 条目只凭释放依据删除（停泊不是释放）。
ReleaseRequiresBasis == \A c \in Calls : entry[c] = "gone" => basis[c] # "none"
\* 删除的条目不再出现：队列域不为已释放的调用保存或重建任何记录。
NoResurrection == [][\A c \in Calls : entry[c] = "gone" => entry'[c] = "gone"]_vars

\* ---- 进展性质（在上面的弱公平下）----
NoStrandedEntry == \A c \in Calls : call[c] = "settled" ~> entry[c] = "gone"
SuspendedReleasesSlot == \A c \in Calls :
                           (call[c] = "suspended" /\ entry[c] = "held") ~> entry[c] # "held"
ReadyProgresses == \A c \in Calls : call[c] = "ready" ~> call[c] \in {"running","settled"}
=============================================================================
