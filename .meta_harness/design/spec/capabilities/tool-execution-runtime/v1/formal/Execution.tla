------------------------------ MODULE Execution ------------------------------
(***************************************************************************)
(* 工具执行运行时：一次执行的状态机——前台/后台姿态 × 阶段（排队、在跑、  *)
(* 等待、已收场）× 六种收场；收场首胜且落定后不变；消息的送达与执行记录的  *)
(* 终态不得只成一半；停机之后不重来，恢复扫描把找不到的执行一律落「失败」。 *)
(*                                                                         *)
(* 对应契约条款（capability.tool-execution-runtime v1）：                  *)
(*   S-8   姿态与阶段；本版等待只在前台                                     *)
(*   S-9   前台那一次调用的收场与这次执行的收场                             *)
(*   S-16  首胜：同一次执行的收场只写一次，落定后不变                       *)
(*   S-17  持久意图先于外部效果；同一次执行至多起一次执行者                 *)
(*   S-18  收场先落，停止后发                                              *)
(*   S-19  送达：落哪种消息看有没有占位；与执行记录终态不得只成一半         *)
(*   S-20  恢复扫描：扫完才服务；范围是全部未收场的记录；停机不重来         *)
(*   S-23  提交一批：替换件即刻「不可用」；发起即后台即刻占位               *)
(*   S-27  转后台：单向，占位随之交付                                      *)
(*   S-28  取消一次运行只中断它在前台的执行                                *)
(*   S-29  会话归档中断全部未收场的执行；此后到达的完成不送达               *)
(*   S-30  答复只解除它所答的那一次等待                                    *)
(*   S-43  一批依次执行；同一工具的并发上限                                 *)
(*                                                                         *)
(* 送达建模成「交付」与「追加」两步：收场/转后台/提交在同一步里写执行记录并 *)
(* 交付待送达的消息（pendLand/pendPh），之后由 Drain 追加进会话日志。 *)
(* 这同时覆盖契约 S-46 列的两种承接形状：日志追加并入同一事务＝交付后立刻 *)
(* 追加（本模型行为的子集）；发件箱＝交付物耐久、稍后追加。                *)
(*                                                                         *)
(* 六个常量可注入，每个对应一处保护；主配置六者全 TRUE：                    *)
(*   FirstWins       —— 收场只在「尚未收场」时写（S-16）。FALSE：晚到的完成 *)
(*                      覆盖已落的收场，并再交付一次。                     *)
(*   DurableHandoff  —— 交付物与执行记录的终态同生共死（S-19）。FALSE：交付 *)
(*                      物只在进程内存里，停机即丢，记录已收场而日志里永远 *)
(*                      等不到那条消息。                                   *)
(*   WriteBeforeStop —— 中断先落收场、再发停止（S-18）。FALSE：先发停止，  *)
(*                      执行者因停止而退出时被报成一次交回，抢在中断之前落 *)
(*                      定。                                               *)
(*   RecoverAll      —— 恢复扫描覆盖全部未收场的记录（S-20）。FALSE：只处置 *)
(*                      前台的（「有协程要恢复才对账」），后台的无人处置。 *)
(*   NoRestart       —— 恢复时不重起执行者（S-20）。FALSE：恢复把在跑的重  *)
(*                      新起一遍。                                         *)
(*   CheckWaitIndex  —— 答复必须指明它答的是第几次等待（S-30）。FALSE：一  *)
(*                      个答给上一次等待的答复解除了这一次。               *)
(* 去掉任何一处都应能给出反例；给不出，说明对应条款在本模型里是平凡的。     *)
(*                                                                         *)
(* 本模型**不**表达的（各有自己的证据形式，见 ../../verification.md）：    *)
(*   失败值与操作的表示层校验；放行凭据的核对；占位原因的具体取值（只区分  *)
(*   触发源）；执行者交回的内容、结果落成消息之前的那一关、卸载；发帧；账的 *)
(*   内容；执行环境；超时与转后台阈值（它们只是 Background 与中断的另两个  *)
(*   触发源）；插队与 agent 掐掉（同一个中断动作的另两种发起者）；多会话与 *)
(*   租户（本模型是一个会话）；决策卡片的关闭。                            *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    FirstWins,        \* BOOLEAN（S-16）
    DurableHandoff,   \* BOOLEAN（S-19）
    WriteBeforeStop,  \* BOOLEAN（S-18）
    RecoverAll,       \* BOOLEAN（S-20）
    NoRestart,        \* BOOLEAN（S-20）
    CheckWaitIndex,   \* BOOLEAN（S-30）
    MaxWaits          \* 一次执行至多进几次等待：安全配置取 2（测得出迟到答复），进展配置取 1（缩小状态空间）

(***************************************************************************)
(* 固定的场景：一个会话，两批调用。                                         *)
(*   b1 = <<c1, c2>>，属运行 r1：c1 允许转后台、会进等待（至多两次）；c2   *)
(*        不允许转后台、不等待。两者依次执行（S-43）。                      *)
(*   b2 = <<c3, c4>>，属运行 r2：c3 发起时即后台（S-23），与 c1 是同一个工具*)
(*        （并发上限 1，S-43）；c4 在这次尝试里是替换件，提交即收场「不可   *)
(*        用」（S-23）。                                                   *)
(* 两批、两个运行，才测得出「取消一次运行只动它自己在前台的」（S-28）；     *)
(* c1 与 c3 同一工具，才测得出并发上限跨批成立。                            *)
(***************************************************************************)
Calls   == {"c1", "c2", "c3", "c4"}
Runs    == {"r1", "r2"}
Batches == {"b1", "b2"}
BatchOf(c)    == IF c \in {"c1", "c2"} THEN "b1" ELSE "b2"
RunOfBatch(b) == IF b = "b1" THEN "r1" ELSE "r2"
RunOf(c)      == RunOfBatch(BatchOf(c))
Pos(c)        == IF c \in {"c1", "c3"} THEN 1 ELSE 2
Prior(c)      == {d \in Calls : BatchOf(d) = BatchOf(c) /\ Pos(d) < Pos(c)}
Tool(c)       == IF c \in {"c1", "c3"} THEN "t1" ELSE IF c = "c2" THEN "t2" ELSE "t3"
Tools         == {"t1", "t2", "t3"}
Limit         == 1
AllowBg       == {"c1", "c3"}
StartBg       == {"c3"}
StandIn       == {"c4"}
Waiters       == {"c1"}
MaxCrashes    == 1

Live     == {"queued", "running", "waiting"}
Phases   == {"none"} \cup Live \cup {"ended"}
Outcomes == {"completed", "failed", "unavailable", "backgrounded", "interrupted", "no_answer"}
BgSegmentOutcomes == {"completed", "failed", "interrupted", "no_answer"}
Whys     == {"none", "normal", "startfail", "standin", "user", "run", "archive", "abnormal", "deadline"}

VARIABLES
    phase,      \* 这次执行的阶段（S-8）；"none" = 还没提交
    posture,    \* 前台 "fg" / 后台 "bg"（S-8）
    callOut,    \* 前台那一次调用的收场（S-9）；"none" = 还没落定
    out,        \* 这次执行的收场（S-9）
    why,        \* 收场的触发源（只区分模型要用到的几种）
    live,       \* 本能力此刻找得到它的活体（S-7）
    starts,     \* 执行者被起了几次（S-17）
    waitIdx,    \* 这次执行进过几次等待（S-12、S-30）
    stale,      \* 历史：是否有答复解除了它没答的那一次等待
    tm,         \* 日志里这个 CallId 的工具消息条数（S-19）
    rm,         \* 日志里这个 CallId 的后台收场提醒条数（S-19）
    acct,       \* 这次执行的账份数（S-13）
    phys,       \* 执行者实际状态："idle" / "running" / "stopping"（S-18）
    intReq,     \* 历史：是否收到过一次中断
    pendLand,   \* 收场那一段的消息已交付、尚未追加进日志（S-19）
    pendPh,     \* 转后台的占位已交付、尚未追加进日志（S-19、S-27）
    up,         \* 本能力在服务（恢复扫描已完成，S-20）
    crashes,    \* 已发生的停机次数
    archived,   \* 会话已归档（S-29）
    cancelled,  \* 运行已取消（S-28）
    submitted   \* 批已提交（S-23）

vars == <<phase, posture, callOut, out, why, live, starts, waitIdx, stale,
          tm, rm, acct, phys, intReq, pendLand, pendPh,
          up, crashes, archived, cancelled, submitted>>

TypeOK ==
    /\ phase    \in [Calls -> Phases]
    /\ posture  \in [Calls -> {"fg", "bg"}]
    /\ callOut  \in [Calls -> Outcomes \cup {"none"}]
    /\ out      \in [Calls -> Outcomes \cup {"none"}]
    /\ why      \in [Calls -> Whys]
    /\ live     \in [Calls -> BOOLEAN]
    /\ starts   \in [Calls -> 0..3]
    /\ waitIdx  \in [Calls -> 0..MaxWaits]
    /\ stale    \in [Calls -> BOOLEAN]
    /\ tm       \in [Calls -> 0..3]
    /\ rm       \in [Calls -> 0..3]
    /\ acct     \in [Calls -> 0..3]
    /\ phys     \in [Calls -> {"idle", "running", "stopping"}]
    /\ intReq   \in [Calls -> BOOLEAN]
    /\ pendLand \in [Calls -> BOOLEAN]
    /\ pendPh   \in [Calls -> BOOLEAN]
    /\ up       \in BOOLEAN
    /\ crashes  \in 0..MaxCrashes
    /\ archived \in BOOLEAN
    /\ cancelled \in [Runs -> BOOLEAN]
    /\ submitted \in [Batches -> BOOLEAN]

Init ==
    /\ phase    = [c \in Calls |-> "none"]
    /\ posture  = [c \in Calls |-> "fg"]
    /\ callOut  = [c \in Calls |-> "none"]
    /\ out      = [c \in Calls |-> "none"]
    /\ why      = [c \in Calls |-> "none"]
    /\ live     = [c \in Calls |-> FALSE]
    /\ starts   = [c \in Calls |-> 0]
    /\ waitIdx  = [c \in Calls |-> 0]
    /\ stale    = [c \in Calls |-> FALSE]
    /\ tm       = [c \in Calls |-> 0]
    /\ rm       = [c \in Calls |-> 0]
    /\ acct     = [c \in Calls |-> 0]
    /\ phys     = [c \in Calls |-> "idle"]
    /\ intReq   = [c \in Calls |-> FALSE]
    /\ pendLand = [c \in Calls |-> FALSE]
    /\ pendPh   = [c \in Calls |-> FALSE]
    /\ up       = TRUE
    /\ crashes  = 0
    /\ archived = FALSE
    /\ cancelled = [r \in Runs |-> FALSE]
    /\ submitted = [b \in Batches |-> FALSE]

PrevSettled(c) == \A d \in Prior(c) : callOut[d] # "none"
Busy(t)        == {d \in Calls : Tool(d) = t /\ phase[d] \in {"running", "waiting"}}
SlotFree(c)    == Cardinality(Busy(Tool(c))) < Limit

(***************************************************************************)
(* 收场的那一次提交（S-16、S-19、S-13）：对集合 S 里的每一次执行，          *)
(* 写收场与触发源、落一份账、从活体表里拿掉、交付它那一段的消息（前台的是  *)
(* 工具消息、后台的是后台收场提醒，由 Drain 按姿态追加）。执行者若还在跑，  *)
(* 转入 stopping（收场先落，停止后发，S-18）；它自己交回的直接 idle。      *)
(***************************************************************************)
EndSet(S, o, w) ==
    /\ phase'    = [c \in Calls |-> IF c \in S THEN "ended" ELSE phase[c]]
    /\ out'      = [c \in Calls |-> IF c \in S THEN o ELSE out[c]]
    /\ why'      = [c \in Calls |-> IF c \in S THEN w ELSE why[c]]
    /\ acct'     = [c \in Calls |-> IF c \in S THEN acct[c] + 1 ELSE acct[c]]
    /\ live'     = [c \in Calls |-> IF c \in S THEN FALSE ELSE live[c]]
    /\ callOut'  = [c \in Calls |-> IF c \in S /\ posture[c] = "fg" THEN o ELSE callOut[c]]
    /\ pendLand' = [c \in Calls |-> IF c \in S THEN TRUE ELSE pendLand[c]]
    /\ phys'     = [c \in Calls |-> IF c \in S /\ phys[c] = "running"
                                      THEN (IF w = "normal" THEN "idle" ELSE "stopping")
                                      ELSE phys[c]]

\* 提交一批（S-23）：整批一次提交；替换件即刻收场「不可用」（前台，交付工具消息）；
\* 发起时即后台的即刻交付占位（S-27）。运行已取消（S-28）或会话已归档（S-29）则拒。
Submit(b) ==
    /\ up /\ ~archived /\ ~submitted[b] /\ ~cancelled[RunOfBatch(b)]
    /\ LET S  == {c \in Calls : BatchOf(c) = b}
           Si == S \cap StandIn
           Bg == {c \in S : c \in StartBg /\ c \in AllowBg}
       IN /\ submitted' = [submitted EXCEPT ![b] = TRUE]
          /\ phase'    = [c \in Calls |-> IF c \in Si THEN "ended"
                                           ELSE IF c \in S THEN "queued" ELSE phase[c]]
          /\ posture'  = [c \in Calls |-> IF c \in Bg THEN "bg" ELSE posture[c]]
          /\ callOut'  = [c \in Calls |-> IF c \in Si THEN "unavailable"
                                           ELSE IF c \in Bg THEN "backgrounded" ELSE callOut[c]]
          /\ out'      = [c \in Calls |-> IF c \in Si THEN "unavailable" ELSE out[c]]
          /\ why'      = [c \in Calls |-> IF c \in Si THEN "standin" ELSE why[c]]
          /\ acct'     = [c \in Calls |-> IF c \in Si THEN acct[c] + 1 ELSE acct[c]]
          /\ pendLand' = [c \in Calls |-> IF c \in Si THEN TRUE ELSE pendLand[c]]
          /\ pendPh'   = [c \in Calls |-> IF c \in Bg THEN TRUE ELSE pendPh[c]]
          /\ live'     = [c \in Calls |-> IF c \in S \ Si THEN TRUE ELSE live[c]]
    /\ UNCHANGED <<starts, waitIdx, stale, tm, rm, phys, intReq,
                   up, crashes, archived, cancelled>>

\* 起执行者（S-17、S-43）：记录早已落下；轮到它（同批前面的都已落定前台收场）
\* 且同一工具有空位才起。
Start(c) ==
    /\ up /\ live[c] /\ phase[c] = "queued" /\ PrevSettled(c) /\ SlotFree(c)
    /\ phase'  = [phase EXCEPT ![c] = "running"]
    /\ starts' = [starts EXCEPT ![c] = @ + 1]
    /\ phys'   = [phys EXCEPT ![c] = "running"]
    /\ UNCHANGED <<posture, callOut, out, why, live, waitIdx, stale, tm, rm, acct,
                   intReq, pendLand, pendPh, up, crashes, archived, cancelled, submitted>>

\* 起不来（参数不合定义、落点不到位、执行者起不来）：收场失败，执行者从没跑过。
StartFail(c) ==
    /\ up /\ live[c] /\ phase[c] = "queued" /\ PrevSettled(c) /\ SlotFree(c)
    /\ EndSet({c}, "failed", "startfail")
    /\ UNCHANGED <<posture, starts, waitIdx, stale, tm, rm, intReq, pendPh,
                   up, crashes, archived, cancelled, submitted>>

\* 进等待（S-12）：本版只在前台。
EnterWait(c) ==
    /\ up /\ live[c] /\ c \in Waiters /\ phase[c] = "running" /\ posture[c] = "fg"
    /\ waitIdx[c] < MaxWaits
    /\ phase'   = [phase EXCEPT ![c] = "waiting"]
    /\ waitIdx' = [waitIdx EXCEPT ![c] = @ + 1]
    /\ UNCHANGED <<posture, callOut, out, why, live, starts, stale, tm, rm, acct, phys,
                   intReq, pendLand, pendPh, up, crashes, archived, cancelled, submitted>>

\* 答复（S-30）：k 是答复所指的那一次等待；可能是早已答过的上一次（迟到、重复）。
Answer(c, k) ==
    /\ up /\ live[c] /\ phase[c] = "waiting" /\ k \in 1..waitIdx[c]
    /\ CheckWaitIndex => k = waitIdx[c]
    /\ phase' = [phase EXCEPT ![c] = "running"]
    /\ stale' = [stale EXCEPT ![c] = @ \/ (k # waitIdx[c])]
    /\ UNCHANGED <<posture, callOut, out, why, live, starts, waitIdx, tm, rm, acct, phys,
                   intReq, pendLand, pendPh, up, crashes, archived, cancelled, submitted>>

\* 等待到了它自己声明的上限（S-12）：收场「等不到应答」。
WaitExpire(c) ==
    /\ up /\ live[c] /\ phase[c] = "waiting"
    /\ EndSet({c}, "no_answer", "deadline")
    /\ UNCHANGED <<posture, starts, waitIdx, stale, tm, rm, intReq, pendPh,
                   up, crashes, archived, cancelled, submitted>>

\* 执行者交回（S-40）：完成，或执行者自己交回的失败。
Return(c, o) ==
    /\ up /\ live[c] /\ phase[c] = "running" /\ o \in {"completed", "failed"}
    /\ EndSet({c}, o, "normal")
    /\ UNCHANGED <<posture, starts, waitIdx, stale, tm, rm, intReq, pendPh,
                   up, crashes, archived, cancelled, submitted>>

\* 转后台（S-27）：只从前台、未在等待、声明允许；前台那次调用收场「转后台」，占位随之交付。
Background(c) ==
    /\ up /\ live[c] /\ c \in AllowBg /\ posture[c] = "fg"
    /\ phase[c] \in {"queued", "running"} /\ callOut[c] = "none"
    /\ posture' = [posture EXCEPT ![c] = "bg"]
    /\ callOut' = [callOut EXCEPT ![c] = "backgrounded"]
    /\ pendPh'  = [pendPh EXCEPT ![c] = TRUE]
    /\ UNCHANGED <<phase, out, why, live, starts, waitIdx, stale, tm, rm, acct, phys,
                   intReq, pendLand, up, crashes, archived, cancelled, submitted>>

\* 中断（S-25）：收场先落，再发停止（WriteBeforeStop）。
Interrupt(c) ==
    /\ WriteBeforeStop
    /\ up /\ phase[c] \in Live
    /\ EndSet({c}, "interrupted", "user")
    /\ intReq' = [intReq EXCEPT ![c] = TRUE]
    /\ UNCHANGED <<posture, starts, waitIdx, stale, tm, rm, pendPh,
                   up, crashes, archived, cancelled, submitted>>

\* 以下三个动作只在 WriteBeforeStop = FALSE 时出现：先发停止，收场随后才写。
InterruptSignal(c) ==
    /\ ~WriteBeforeStop
    /\ up /\ phase[c] \in Live /\ ~intReq[c]
    /\ intReq' = [intReq EXCEPT ![c] = TRUE]
    /\ phys'   = [phys EXCEPT ![c] = IF @ = "running" THEN "stopping" ELSE @]
    /\ UNCHANGED <<phase, posture, callOut, out, why, live, starts, waitIdx, stale,
                   tm, rm, acct, pendLand, pendPh, up, crashes, archived, cancelled, submitted>>

InterruptWrite(c) ==
    /\ ~WriteBeforeStop
    /\ up /\ intReq[c] /\ phase[c] \in Live
    /\ EndSet({c}, "interrupted", "user")
    /\ UNCHANGED <<posture, starts, waitIdx, stale, tm, rm, intReq, pendPh,
                   up, crashes, archived, cancelled, submitted>>

\* 执行者因停止信号退出，被当成一次失败的交回报上来。
DeathReport(c) ==
    /\ ~WriteBeforeStop
    /\ up /\ live[c] /\ intReq[c] /\ phase[c] \in {"running", "waiting"} /\ phys[c] = "stopping"
    /\ EndSet({c}, "failed", "normal")
    /\ UNCHANGED <<posture, starts, waitIdx, stale, tm, rm, intReq, pendPh,
                   up, crashes, archived, cancelled, submitted>>

\* 取消一次运行（S-28）：只中断这个运行在前台、未收场的执行；此后同一运行的提交被拒。
CancelRun(r) ==
    /\ up /\ ~cancelled[r]
    /\ cancelled' = [cancelled EXCEPT ![r] = TRUE]
    /\ EndSet({c \in Calls : RunOf(c) = r /\ posture[c] = "fg" /\ phase[c] \in Live},
              "interrupted", "run")
    /\ UNCHANGED <<posture, starts, waitIdx, stale, tm, rm, intReq, pendPh,
                   up, crashes, archived, submitted>>

\* 会话归档（S-29）：全部未收场的，不论前后台，一律被中断；此后不再提交。
Archive ==
    /\ up /\ ~archived
    /\ archived' = TRUE
    /\ EndSet({c \in Calls : phase[c] \in Live}, "interrupted", "archive")
    /\ UNCHANGED <<posture, starts, waitIdx, stale, tm, rm, intReq, pendPh,
                   up, crashes, cancelled, submitted>>

\* 停机：进程内的一切没了——活体表、执行者（恢复时回收，此处直接记为 idle）。
\* 存储里的记录与日志都还在；交付物是否还在取决于 DurableHandoff。
Crash ==
    /\ up /\ crashes < MaxCrashes
    /\ up'       = FALSE
    /\ crashes'  = crashes + 1
    /\ live'     = [c \in Calls |-> FALSE]
    /\ phys'     = [c \in Calls |-> "idle"]
    /\ IF DurableHandoff
         THEN UNCHANGED <<pendLand, pendPh>>
         ELSE /\ pendLand' = [c \in Calls |-> FALSE]
              /\ pendPh'   = [c \in Calls |-> FALSE]
    /\ UNCHANGED <<phase, posture, callOut, out, why, starts, waitIdx, stale,
                   tm, rm, acct, intReq, archived, cancelled, submitted>>

\* 恢复扫描（S-20）：扫完才恢复服务。
Lost == {c \in Calls : phase[c] \in Live /\ (RecoverAll \/ posture[c] = "fg")}

Recover ==
    /\ ~up
    /\ up' = TRUE
    /\ IF NoRestart
         THEN /\ EndSet(Lost, "failed", "abnormal")
              /\ UNCHANGED starts
         ELSE \* 有效性核对用：恢复时把在跑、在等的重新起一遍，排队的放回队里
              /\ phase'  = [c \in Calls |-> IF c \in Lost /\ phase[c] = "waiting"
                                               THEN "running" ELSE phase[c]]
              /\ live'   = [c \in Calls |-> IF c \in Lost THEN TRUE ELSE live[c]]
              /\ starts' = [c \in Calls |-> IF c \in Lost /\ phase[c] \in {"running", "waiting"}
                                               THEN starts[c] + 1 ELSE starts[c]]
              /\ phys'   = [c \in Calls |-> IF c \in Lost /\ phase[c] \in {"running", "waiting"}
                                               THEN "running" ELSE phys[c]]
              /\ UNCHANGED <<out, why, acct, callOut, pendLand>>
    /\ UNCHANGED <<posture, waitIdx, stale, tm, rm, intReq, pendPh,
                   crashes, archived, cancelled, submitted>>

\* 把交付物追加进会话日志（S-19）：落哪种消息看姿态——前台的是工具消息、后台的是
\* 后台收场提醒；同一次调用的占位先于它的收场提醒（messages S-32 ④ 的次序）。
\* 一步追加全部待追加的：每一项按 (CallId, 段) 各追加一次，分几步追加不改变结论，
\* 合成一步只为控制状态空间。
Pending == {c \in Calls : pendLand[c] \/ pendPh[c]}

Drain ==
    /\ up /\ Pending # {}
    /\ tm' = [c \in Calls |-> tm[c] + (IF pendPh[c] THEN 1 ELSE 0)
                                     + (IF pendLand[c] /\ posture[c] = "fg" THEN 1 ELSE 0)]
    /\ rm' = [c \in Calls |-> rm[c] + (IF pendLand[c] /\ posture[c] = "bg" THEN 1 ELSE 0)]
    /\ pendLand' = [c \in Calls |-> FALSE]
    /\ pendPh'   = [c \in Calls |-> FALSE]
    /\ UNCHANGED <<phase, posture, callOut, out, why, live, starts, waitIdx, stale, acct,
                   phys, intReq, up, crashes, archived, cancelled, submitted>>

\* 执行者实际停下（优雅或到 execution_stop_grace 后强制，S-18）。
StopDone(c) ==
    /\ phys[c] = "stopping"
    /\ phys' = [phys EXCEPT ![c] = "idle"]
    /\ UNCHANGED <<phase, posture, callOut, out, why, live, starts, waitIdx, stale, tm, rm,
                   acct, intReq, pendLand, pendPh, up, crashes, archived, cancelled, submitted>>

\* 收场已落之后，执行者的交回才到（停止与交回交错，S-16）。
LateReturn(c) ==
    /\ up /\ phys[c] = "stopping" /\ phase[c] = "ended"
    /\ phys' = [phys EXCEPT ![c] = "idle"]
    /\ IF FirstWins
         THEN UNCHANGED <<callOut, out, acct, pendLand>>
         ELSE /\ out'      = [out EXCEPT ![c] = "completed"]
              /\ acct'     = [acct EXCEPT ![c] = @ + 1]
              /\ pendLand' = [pendLand EXCEPT ![c] = TRUE]
              /\ callOut'  = [callOut EXCEPT ![c] = IF posture[c] = "fg" THEN "completed" ELSE @]
    /\ UNCHANGED <<phase, posture, why, live, starts, waitIdx, stale, tm, rm, intReq,
                   pendPh, up, crashes, archived, cancelled, submitted>>

Next ==
    \/ \E b \in Batches : Submit(b)
    \/ \E c \in Calls :
         \/ Start(c) \/ StartFail(c) \/ EnterWait(c) \/ WaitExpire(c)
         \/ \E k \in 1..MaxWaits : Answer(c, k)
         \/ \E o \in {"completed", "failed"} : Return(c, o)
         \/ Background(c)
         \/ Interrupt(c) \/ InterruptSignal(c) \/ InterruptWrite(c) \/ DeathReport(c)
         \/ StopDone(c) \/ LateReturn(c)
    \/ \E r \in Runs : CancelRun(r)
    \/ Archive
    \/ Drain
    \/ Crash
    \/ Recover

Spec == Init /\ [][Next]_vars

\* 进展配置用：恢复扫描终会发生；交付物终会追加；停下中的执行者终会实际停下
\* （execution_stop_grace 之后的强制停止确实生效）。
FairSpec ==
    /\ Spec
    /\ WF_vars(Recover)
    /\ WF_vars(Drain)
    /\ \A c \in Calls : WF_vars(StopDone(c) \/ LateReturn(c))

-----------------------------------------------------------------------------
(* 不变量                                                                   *)

\* S-19：一次调用在日志里至多一条工具消息；一段后台执行至多一条收场提醒。
AtMostOneToolMessage == \A c \in Calls : tm[c] <= 1
AtMostOneReminder    == \A c \in Calls : rm[c] <= 1

\* S-19：收场提醒只落在「已有占位」之后。
ReminderAfterPlaceholder ==
    \A c \in Calls : rm[c] > 0 => (tm[c] = 1 /\ callOut[c] = "backgrounded")

\* S-27：姿态是后台，占位就已经在日志里，或已交付待追加。
BackgroundHasPlaceholder ==
    \A c \in Calls : posture[c] = "bg" => (tm[c] >= 1 \/ pendPh[c])

\* S-19：已收场的执行，它那一段的消息已在日志里，或已交付待追加——不会只成一半。
EndedIsLanded ==
    \A c \in Calls : phase[c] = "ended" =>
        \/ pendLand[c]
        \/ /\ posture[c] = "fg" => tm[c] >= 1
           /\ posture[c] = "bg" => rm[c] >= 1

\* S-13：一次执行恰一份账，且只在收场时落。
OneAccountPerEnded ==
    \A c \in Calls : acct[c] = (IF phase[c] = "ended" THEN 1 ELSE 0)

\* S-17、S-20：同一次执行至多起一次执行者；停机不重来。
AtMostOneStart == \A c \in Calls : starts[c] <= 1

\* S-7、S-20：在服务时，每一条未收场的记录都找得到活体——「找不到」的不许挂着。
ServingConsistent == up => \A c \in Calls : phase[c] \in Live => live[c]

\* S-30：答复只解除它所答的那一次等待。
NoStaleAnswer == \A c \in Calls : ~stale[c]

\* S-18：一次被请求中断的执行，收场是「被中断」——不会被它自己因停止而退出的那次交回抢先。
InterruptHonored == \A c \in Calls : (intReq[c] /\ phase[c] = "ended") => out[c] = "interrupted"

\* S-29：会话归档之后没有未收场的执行。
ArchiveSettlesAll == archived => \A c \in Calls : phase[c] \notin Live

\* 以下几条按构造成立（由动作的守卫直接给出），只说明模型没写错，不单独作为证据；
\* 见 README「本版选用什么」。
SequentialBatch == \A c \in Calls : phase[c] \in {"running", "waiting"} => PrevSettled(c)
ConcurrencyCap  == \A t \in Tools : Cardinality(Busy(t)) <= Limit
WaitOnlyForeground == \A c \in Calls : phase[c] = "waiting" => posture[c] = "fg"
RunCancelSparesBackground == \A c \in Calls : why[c] = "run" => posture[c] = "fg"
UnavailableOnlyFromStandIn == \A c \in Calls : out[c] = "unavailable" => c \in StandIn
NoExecutionBackgrounded == \A c \in Calls : out[c] # "backgrounded"
BackgroundSegmentOutcome == \A c \in Calls : rm[c] > 0 => out[c] \in BgSegmentOutcomes

-----------------------------------------------------------------------------
(* 动作性质                                                                 *)

\* S-16：收场落定之后不变。
OutcomeStable ==
    [][\A c \in Calls : phase[c] = "ended" => (phase'[c] = "ended" /\ out'[c] = out[c])]_vars

\* S-9：前台那一次调用的收场落定之后不变。
CallOutcomeStable ==
    [][\A c \in Calls : callOut[c] # "none" => callOut'[c] = callOut[c]]_vars

\* S-27：前台到后台是单向的（按构造成立）。
PostureOneWay ==
    [][\A c \in Calls : posture[c] = "bg" => posture'[c] = "bg"]_vars

\* S-29：会话归档之后不再有新的交付——晚到的完成不送达。
NoNewDeliveryAfterArchive ==
    [][archived => \A c \in Calls : (pendLand'[c] => pendLand[c]) /\ (pendPh'[c] => pendPh[c])]_vars

-----------------------------------------------------------------------------
(* 进展性质（只在 FairSpec 下检查）                                          *)

\* S-20：停机后找不到活体的未收场执行，终会被恢复扫描落定。
LostSettles ==
    \A c \in Calls : (phase[c] \in Live /\ ~live[c]) ~> (phase[c] = "ended")

\* S-19：交付了的终会进日志。
HandoffLands ==
    \A c \in Calls : (pendLand[c] \/ pendPh[c]) ~> (~pendLand[c] /\ ~pendPh[c])

\* S-18：停下中的执行者终会实际停下。
StopsTakeEffect ==
    \A c \in Calls : (phys[c] = "stopping") ~> (phys[c] = "idle")

=============================================================================
