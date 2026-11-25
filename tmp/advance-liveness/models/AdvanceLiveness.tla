---------------------------- MODULE AdvanceLiveness ----------------------------
(***************************************************************************)
(* 修订 2（2026-11-26）。一个会话里受理、承接与推进的安全与活性，          *)
(* 环境按发行装配写。修订 1 的「发件箱」设计建立在错误的环境假设上，已撤下，  *)
(* 见 formal-handoff.md 的「修订记录」。                                    *)
(*                                                                         *)
(* 对应的代码（integration/mainline 加第 1 程，卡 #1655）：                  *)
(*   Session 推进协调  packages/session/session/src/advance.ts              *)
(*                     （check / openRun / invoke / handIn / submit / replay）*)
(*   恢复              packages/session/session/src/recover.ts（check）      *)
(*   周期扫描          packages/session/session/src/scan.ts                  *)
(*   收尾核对          session-contract/src/judgments.ts（judgeCompletion）  *)
(*   Agent 执行槽      packages/agent/agent/src/provider.ts（failRun 等）    *)
(*   宿主的挂接判断    packages/agent/agent-host-local/src/contact.ts        *)
(*                                                                         *)
(* 发行装配的三条事实（每条的证据见 formal-handoff.md「环境假设」）：         *)
(*   E1 交入回执没有证据来源，日志里的「已交入」永远是空的。Session 只靠     *)
(*      进程内的 known 记住交过哪些输入，重启就丢。                          *)
(*   E2 待处理资格在 Agent 的一步取走输入时解除（同一次提交），不在交入时。  *)
(*   E3 以「完成」收尾时，只要还有待处理输入就被挡回，Agent 回去再走一步     *)
(*      取走它；以「失败」收尾不挡（第 1 程）。                              *)
(*                                                                         *)
(* Bugs 打开一处缺陷，每个配置只开一个：                                    *)
(*   "first-only"            今天的实然（F1）：新一轮只带首条输入开始        *)
(*   "halt-pins-slot"        第 1 程之前：驱动停下后执行槽不让出             *)
(*   "failed-finish-blocked" 第 1 程之前：失败的收尾也被待处理输入挡回       *)
(*   "no-scan"               去掉周期扫描                                    *)
(*   "void-answered"         取消把本轮已回答的输入退回待处理（安全负对照）  *)
(* Bugs = {} 且 Deterministic = FALSE 是应然。                              *)
(* Deterministic = TRUE 打开一个还没关上的缺口，不是负对照：一轮的收尾提交   *)
(* 确定地失败时（现场：command_limit 落在 F2），恢复每次接手都再停下一次，   *)
(* 这一轮永不收场。                                                         *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Inputs,        \* 人发的输入，例如 {1, 2}
          MaxSteps,      \* 一轮的步数上限（代码里 maxRunSteps，缺省 50）
          MaxCancels,    \* 人至多取消几次（人的动作不加公平，次数有界）
          MaxRestarts,   \* 进程至多重启几次
          MaxOutages,    \* 依赖至多坏几次（之后一直可用）
          MaxHalts,      \* 驱动至多因为会过去的原因停下几次
          Deterministic, \* 环境：允许一轮的收尾确定地失败
          Bugs

ASSUME Deterministic \in BOOLEAN
ASSUME Bugs \subseteq {"first-only", "halt-pins-slot", "failed-finish-blocked",
                       "no-scan", "void-answered"}

VARIABLES
  sent,      \* 人已经发出的输入
  pending,   \* 日志：已受理、还没被取走的输入
  answered,  \* 日志：已被某一步取走并回答的输入
  run,       \* 日志：当前一轮 "none" | "open" | "terminal"
  awaiting,  \* 日志：上一轮失败，会话停着等人（awaitingPerson）
  batch,     \* 当前一轮开始时随 invoke 交给 Agent 的输入
  waiting0,  \* 观察量：当前一轮开始那一刻全部待处理的输入（F1 的判据，不进代码）
  runAns,    \* 日志：当前一轮里已回答的输入
  stepped,   \* 日志：当前一轮已经走过第一步
  steps,     \* 日志：当前一轮走过的步数
  execOpen,  \* Agent 执行记录：当前一轮的 execution 已创建、未终结
  agentAcc,  \* Agent 执行记录：当前 execution 已受理的输入
  known,     \* Session 进程：已交给 Agent 的输入（known-handovers.ts），重启就丢
  drive,     \* Agent 进程：当前 execution 有没有在推的驱动 "none" | "live"
  slot,      \* Agent 进程：本会话实例的执行槽 "free" | "held"
  poison,    \* 环境：当前一轮的收尾提交确定地失败
  wake,      \* 有一次叫醒在等推进处理（提交叫醒或周期扫描）
  depUp,     \* 存储与 Agent 驱动口此刻可用
  cancels, restarts, outages, halts,
  split      \* 安全哨兵：一轮的第一步没有取走开始时全部待处理的输入

vars == <<sent, pending, answered, run, awaiting, batch, waiting0, runAns, stepped, steps,
          execOpen, agentAcc, known, drive, slot, poison, wake, depUp,
          cancels, restarts, outages, halts, split>>

Active == run = "open"

\* recover.ts 的 checkedRun：首批已记在 known 里，或已被取走。只有这样的一轮才问挂接。
Checked == Active /\ execOpen /\ (batch \subseteq known \/ batch \cap pending = {})

\* handIn 要交的：活跃的一轮里，还没交给 Agent 的待处理输入。
Due == pending \ (known \cup batch)

CanOpen    == ~Active /\ ~awaiting /\ pending # {} /\ depUp
CanInvoke  == Active /\ ~execOpen /\ slot = "free" /\ depUp
CanReplay  == Active /\ execOpen /\ ~Checked /\ depUp
CanSubmit  == Active /\ execOpen /\ Due # {} /\ depUp
CanResume  == Checked /\ drive = "none" /\ slot = "free" /\ depUp

Init ==
  /\ sent = {} /\ pending = {} /\ answered = {} /\ run = "none" /\ awaiting = FALSE
  /\ batch = {} /\ waiting0 = {} /\ runAns = {} /\ stepped = FALSE /\ steps = 0
  /\ execOpen = FALSE /\ agentAcc = {} /\ known = {} /\ drive = "none" /\ slot = "free"
  /\ poison = FALSE /\ wake = FALSE /\ depUp = TRUE
  /\ cancels = 0 /\ restarts = 0 /\ outages = 0 /\ halts = 0 /\ split = FALSE

---------------------------------------------------------------------------
\* 人与环境

\* 受理：一条输入进日志的待处理，提交叫醒推进；人的新输入解除「等人」。
Send(i) ==
  /\ i \notin sent
  /\ sent' = sent \cup {i} /\ pending' = pending \cup {i} /\ wake' = TRUE /\ awaiting' = FALSE
  /\ UNCHANGED <<answered, run, batch, waiting0, runAns, stepped, steps, execOpen, agentAcc,
                 known, drive, slot, poison, depUp, cancels, restarts, outages, halts, split>>

DepDown ==
  /\ depUp /\ outages < MaxOutages
  /\ depUp' = FALSE /\ outages' = outages + 1
  /\ UNCHANGED <<sent, pending, answered, run, awaiting, batch, waiting0, runAns, stepped,
                 steps, execOpen, agentAcc, known, drive, slot, poison, wake, cancels,
                 restarts, halts, split>>

DepRecover ==
  /\ ~depUp /\ depUp' = TRUE
  /\ UNCHANGED <<sent, pending, answered, run, awaiting, batch, waiting0, runAns, stepped,
                 steps, execOpen, agentAcc, known, drive, slot, poison, wake, cancels,
                 restarts, outages, halts, split>>

\* 依赖不可用时，有界重试用完，这次叫醒被用掉（advance.ts 的 retries-exhausted）。
WakeLost ==
  /\ wake /\ ~depUp /\ wake' = FALSE
  /\ UNCHANGED <<sent, pending, answered, run, awaiting, batch, waiting0, runAns, stepped,
                 steps, execOpen, agentAcc, known, drive, slot, poison, depUp, cancels,
                 restarts, outages, halts, split>>

\* 推进处理完这一次叫醒，Session 一侧没有可做的事。
WakeDone ==
  /\ wake /\ depUp /\ ~CanOpen /\ ~CanInvoke /\ ~CanReplay /\ ~CanSubmit /\ ~CanResume
  /\ wake' = FALSE
  /\ UNCHANGED <<sent, pending, answered, run, awaiting, batch, waiting0, runAns, stepped,
                 steps, execOpen, agentAcc, known, drive, slot, poison, depUp, cancels,
                 restarts, outages, halts, split>>

\* 周期扫描：scan.ts 对有待处理输入或活跃 Run 的会话叫醒推进与恢复。
Scan ==
  /\ "no-scan" \notin Bugs
  /\ ~wake /\ (pending # {} \/ Active)
  /\ wake' = TRUE
  /\ UNCHANGED <<sent, pending, answered, run, awaiting, batch, waiting0, runAns, stepped,
                 steps, execOpen, agentAcc, known, drive, slot, poison, depUp, cancels,
                 restarts, outages, halts, split>>

\* 人取消这一轮：Session 写取消终态（逻辑收口）。这一轮的驱动随后停下；
\* 第 1 程之前它可能带着执行槽停下（取消的时序竞争，现场签名 stale-advance）。
Cancel ==
  /\ Active /\ cancels < MaxCancels
  /\ run' = "terminal" /\ cancels' = cancels + 1
  /\ pending' = IF "void-answered" \in Bugs THEN pending \cup runAns ELSE pending
  /\ batch' = {} /\ runAns' = {} /\ agentAcc' = {} /\ known' = {} /\ execOpen' = FALSE
  /\ drive' = "none" /\ poison' = FALSE
  /\ slot' \in IF "halt-pins-slot" \in Bugs /\ drive = "live" THEN {"free", "held"}
               ELSE {"free"}
  /\ wake' = TRUE
  /\ UNCHANGED <<sent, answered, awaiting, waiting0, stepped, steps, depUp, restarts,
                 outages, halts, split>>

\* 进程重启：进程内的一切丢掉（known、驱动、执行槽），日志与执行记录留着；启动恢复叫醒。
Restart ==
  /\ restarts < MaxRestarts /\ restarts' = restarts + 1
  /\ known' = {} /\ drive' = "none" /\ slot' = "free" /\ wake' = TRUE
  /\ UNCHANGED <<sent, pending, answered, run, awaiting, batch, waiting0, runAns, stepped,
                 steps, execOpen, agentAcc, poison, depUp, cancels, outages, halts, split>>

\* 这一轮的收尾提交从此确定地失败（例：收尾提交超过存储的命令上限）。
Poison ==
  /\ Deterministic /\ Active /\ ~poison /\ poison' = TRUE
  /\ UNCHANGED <<sent, pending, answered, run, awaiting, batch, waiting0, runAns, stepped,
                 steps, execOpen, agentAcc, known, drive, slot, wake, depUp, cancels,
                 restarts, outages, halts, split>>

\* 驱动在一个节点上确定不能继续，停下（provider.ts 的 failRun）：报告一次，
\* execution 在执行记录里仍未终结。第 1 程起让出执行槽；之前不让。不产生提交，所以不叫醒。
Halt ==
  /\ Active /\ drive = "live"
  /\ poison \/ halts < MaxHalts
  /\ halts' = IF poison THEN halts ELSE halts + 1
  /\ drive' = "none"
  /\ slot' = IF "halt-pins-slot" \in Bugs THEN "held" ELSE "free"
  /\ UNCHANGED <<sent, pending, answered, run, awaiting, batch, waiting0, runAns, stepped,
                 steps, execOpen, agentAcc, known, poison, wake, depUp, cancels, restarts,
                 outages, split>>

---------------------------------------------------------------------------
\* Session 推进协调：处理一次叫醒，从日志与 known 现算这一次做哪一步。

\* openRun → startRun：提交开始 Run 与首个 attempt，不扣任何输入的待处理资格。
\* 应然把当时全部待处理输入作为一批；今天只带首条（F1）。
OpenRun ==
  /\ wake /\ CanOpen
  /\ batch' \in IF "first-only" \in Bugs THEN {{i} : i \in pending} ELSE {pending}
  /\ waiting0' = pending
  /\ run' = "open" /\ runAns' = {} /\ stepped' = FALSE /\ steps' = 0
  /\ execOpen' = FALSE /\ agentAcc' = {} /\ known' = {} /\ poison' = FALSE
  /\ UNCHANGED <<sent, pending, answered, awaiting, drive, slot, wake, depUp, cancels,
                 restarts, outages, halts, split>>

\* invoke 成功：Agent 创建 execution 并受理这一批，驱动拿到执行槽开始推。
\* 执行槽被占着时 Agent 答忙，这个动作不可做。
InvokeOk ==
  /\ wake /\ CanInvoke
  /\ execOpen' = TRUE /\ agentAcc' = batch /\ known' = known \cup batch
  /\ drive' = "live" /\ slot' = "held"
  /\ UNCHANGED <<sent, pending, answered, run, awaiting, batch, waiting0, runAns, stepped,
                 steps, poison, wake, depUp, cancels, restarts, outages, halts, split>>

\* replay：重启后 known 丢了、首批还没被取走。按原操作身份重放发起，Agent 认回原受理，
\* 不新建 execution；Session 重新记下 known。
ReplayOk ==
  /\ wake /\ CanReplay
  /\ known' = known \cup batch
  /\ UNCHANGED <<sent, pending, answered, run, awaiting, batch, waiting0, runAns, stepped,
                 steps, execOpen, agentAcc, drive, slot, poison, wake, depUp, cancels,
                 restarts, outages, halts, split>>

\* handIn → submit：把一条还没交的待处理输入交给 Agent；Agent 按操作身份幂等受理。
SubmitOk ==
  /\ wake /\ CanSubmit
  /\ \E i \in Due : agentAcc' = agentAcc \cup {i} /\ known' = known \cup {i}
  /\ UNCHANGED <<sent, pending, answered, run, awaiting, batch, waiting0, runAns, stepped,
                 steps, execOpen, drive, slot, poison, wake, depUp, cancels, restarts,
                 outages, halts, split>>

\* 恢复（recover.check）：问挂接，宿主按运行时自己的报告答失联（没有驱动、槽空着），
\* 于是 detach、claim、resume，新的驱动接着推。槽被占着时宿主答在跑，这个动作不可做。
RecoverResume ==
  /\ wake /\ CanResume
  /\ drive' = "live" /\ slot' = "held"
  /\ UNCHANGED <<sent, pending, answered, run, awaiting, batch, waiting0, runAns, stepped,
                 steps, execOpen, agentAcc, known, poison, wake, depUp, cancels, restarts,
                 outages, halts, split>>

---------------------------------------------------------------------------
\* Agent 推进。每一步的开始提交、收尾提交都叫醒 Session。

\* 一步取走当前已受理、还待处理的全部输入（输入水位线定批界）并回答它们。
AgentStep ==
  /\ Active /\ drive = "live" /\ depUp /\ steps < MaxSteps
  /\ LET S == agentAcc \cap pending IN
       /\ S # {}
       /\ split' = (split \/ (~stepped /\ ~((waiting0 \cap pending) \subseteq S)))
       /\ answered' = answered \cup S /\ pending' = pending \ S /\ runAns' = runAns \cup S
  /\ stepped' = TRUE /\ steps' = steps + 1 /\ wake' = TRUE
  /\ UNCHANGED <<sent, run, awaiting, batch, waiting0, execOpen, agentAcc, known, drive,
                 slot, poison, depUp, cancels, restarts, outages, halts>>

\* 模型又要了一次工具：走一步，不取输入。是模型的选择，不加公平。
ToolStep ==
  /\ Active /\ drive = "live" /\ depUp /\ steps < MaxSteps /\ stepped
  /\ steps' = steps + 1 /\ wake' = TRUE
  /\ UNCHANGED <<sent, pending, answered, run, awaiting, batch, waiting0, runAns, stepped,
                 execOpen, agentAcc, known, drive, slot, poison, depUp, cancels, restarts,
                 outages, halts, split>>

Close(failed) ==
  /\ run' = "terminal" /\ awaiting' = failed
  /\ batch' = {} /\ runAns' = {} /\ agentAcc' = {} /\ known' = {}
  /\ execOpen' = FALSE /\ drive' = "none" /\ slot' = "free" /\ wake' = TRUE
  /\ UNCHANGED <<sent, pending, answered, waiting0, stepped, steps, poison, depUp, cancels,
                 restarts, outages, halts, split>>

\* 以完成收尾：Session 的收尾核对在还有待处理输入时挡回（E3），所以要 pending 为空。
FinishComplete ==
  /\ Active /\ drive = "live" /\ depUp /\ ~poison /\ stepped
  /\ pending = {}
  /\ Close(FALSE)

\* 到步数上限，以守卫失败收尾。第 1 程起不因待处理输入被挡回，没取走的输入保留待处理，
\* 会话停着等人；之前同样被挡回，于是既走不了下一步也收不了尾。
FinishFailedAtLimit ==
  /\ Active /\ drive = "live" /\ depUp /\ ~poison /\ steps = MaxSteps
  /\ "failed-finish-blocked" \in Bugs => pending = {}
  /\ Close(TRUE)

---------------------------------------------------------------------------

Session == OpenRun \/ InvokeOk \/ ReplayOk \/ SubmitOk \/ RecoverResume \/ WakeLost \/ WakeDone
Agent   == AgentStep \/ ToolStep \/ FinishComplete \/ FinishFailedAtLimit
Env     == (\E i \in Inputs : Send(i)) \/ DepDown \/ DepRecover \/ Scan \/ Cancel \/ Restart
           \/ Poison \/ Halt

Next == Session \/ Agent \/ Env

\* 公平：依赖坏了终究会好；系统动作只要反复可做终究会做；扫描终究会来。
\* 人的动作（发、取消）、重启、停下、模型多要一次工具都不加公平。
Fairness ==
  /\ WF_vars(DepRecover) /\ WF_vars(Scan)
  /\ SF_vars(OpenRun) /\ SF_vars(InvokeOk) /\ SF_vars(ReplayOk) /\ SF_vars(SubmitOk)
  /\ SF_vars(RecoverResume)
  /\ SF_vars(AgentStep) /\ SF_vars(FinishComplete) /\ SF_vars(FinishFailedAtLimit)
  /\ WF_vars(Halt /\ poison)   \* 收尾确定地失败时，驱动每次走到收尾都停下

Spec == Init /\ [][Next]_vars /\ Fairness

---------------------------------------------------------------------------
TypeOK ==
  /\ sent \subseteq Inputs /\ pending \subseteq Inputs /\ answered \subseteq Inputs
  /\ run \in {"none", "open", "terminal"} /\ awaiting \in BOOLEAN
  /\ batch \subseteq Inputs /\ waiting0 \subseteq Inputs /\ runAns \subseteq Inputs
  /\ stepped \in BOOLEAN /\ steps \in 0..MaxSteps
  /\ execOpen \in BOOLEAN /\ agentAcc \subseteq Inputs /\ known \subseteq Inputs
  /\ drive \in {"none", "live"} /\ slot \in {"free", "held"} /\ poison \in BOOLEAN
  /\ wake \in BOOLEAN /\ depUp \in BOOLEAN
  /\ cancels \in 0..MaxCancels /\ restarts \in 0..MaxRestarts
  /\ outages \in 0..MaxOutages /\ halts \in 0..MaxHalts /\ split \in BOOLEAN

\* 安全（I-4）：一条输入至多一次有效回答，回答了就不再待处理。
AnsweredNotPending == answered \cap pending = {}

\* 安全（I-4，F1）：一轮的第一步取走开始那一刻全部待处理、此刻仍待处理的输入。
BatchNotSplit == ~split

\* 安全：驱动在推时一定占着执行槽。
DriveHoldsSlot == drive = "live" => slot = "held"

\* 活性（I-1）：开着的一轮终究收场。
ActiveRunSettles == Active ~> (run = "terminal")

\* 活性（I-1、I-6）：每条待处理的输入终究被回答，或者会话停下等人。
EveryInputSettles == \A i \in Inputs : (i \in pending) ~> (i \in answered \/ awaiting)
==============================================================================
