# 证据：客户端游标与断线补齐模型

[提案索引](../README.md) · [信封与游标](../envelope-and-cursor.md) · [增量协议](../delta-protocol.md) · [不变式](../invariants.md) · [场景](../scenarios.md)

`model/` 是[信封与游标](../envelope-and-cursor.md)第 4、5 节与[增量协议](../delta-protocol.md)
第 3、5 节的有限模型，按工具提案证据模型的先例放在提案证据目录并登记为形式任务
（`message-stream-cursor-safety`、`message-stream-cursor-progress`，
[formal-tasks.json](../../../../spec/formal-tasks.json)），每次 spec-check 运行。条款覆盖与运行
结果记在 [session 验证范围](../../../../spec/capabilities/session/verification.md#消息流游标模型提案候选)。

## 文件

| 文件 | 内容 |
|---|---|
| [Cursor.tla](model/Cursor.tla) | 模型正文（评审后第二稿）：一个协调域的提交序号、每次提交 1～`MaxPer` 条作用域内事实共享一个序号（评审 B1）或一条别的 Session 的提交、投影的完整覆盖水位 `pv` 与下界 `floor`（评审 B2）、每订阅的事实队列（带批内水位 `sent = (seq, idx)`）与瞬态环、随投影 fold 响起的可丢的铃、周期对账、停住的订阅掉出保留期时的强制重取、一个瞬态 attempt 的 `started / chunk / ended` 帧、断线、进程崩溃（`epoch`） |
| [CursorMC.tla](model/CursorMC.tla) | 对称约减与两个否定变体：`SpecNoFill`（铃只转发自身、不从水位补）、`SpecBuffered`（补齐来自最近 `Retain` 条的流缓冲而非投影） |
| [Cursor.cfg](model/Cursor.cfg) | 安全配置：1 个订阅、2 次提交、每次至多 2 条事实、缓冲 2、至多 1 次崩溃与 1 次断线；登记为形式任务 |
| [CursorThree.cfg](model/CursorThree.cfg) | 安全补充：同上但 3 次提交（覆盖"两批都没推完时第三批到达"）；约 2 分钟，只在重放脚本里跑，不登记为形式任务 |
| [CursorTwo.cfg](model/CursorTwo.cfg) | 两订阅补充：2 次提交、每次 1 条（批语义已由单订阅配置覆盖，这里看订阅间独立）、至多 1 次崩溃与 1 次断线、对称约减；约 2 分钟，只在重放脚本里跑，不登记为形式任务 |
| [CursorProgress.cfg](model/CursorProgress.cfg) | 进展配置：1 个订阅、2 次提交、每次至多 2 条、无崩溃、不断线（崩溃与断线路径的活性在补充配置里），公平性假设见模块 `SpecFair`；登记为形式任务（单配置 ≤ 1 分钟的裁决） |
| [CursorProgressFull.cfg](model/CursorProgressFull.cfg) | 进展补充：同上加至多 1 次崩溃与 1 次断线；约 3 分钟，只在重放脚本里跑，不登记为形式任务 |
| [CursorNoFill.cfg](model/CursorNoFill.cfg) | 否定配置：期望 `CursorComplete` 被违反（丢一次铃后听到下一次铃，游标越过未投递的事实）；不登记为形式任务 |
| [CursorBuffered.cfg](model/CursorBuffered.cfg) | 否定配置：期望 `CursorComplete` 被违反（离线超过缓冲长度后带洞续订）；不登记为形式任务 |
| [replay.py](model/replay.py) / [run-plan.json](model/run-plan.json) | 重放全部配置并写 [results.json](model/results.json)（命令、退出码、状态数、模块 / 配置哈希、日志路径；`source_commit` 是重放时的 HEAD，文件身份以哈希为准） |

重放：设置 `JAVA_BIN` 与 `TLA2TOOLS_JAR` 后运行 `python3 docs/proposals/message-stream/evidence/model/replay.py`。
形式任务命令带 `-deadlock`：所有事实都提交完、订阅排空后模型无后继，死锁检查关闭；卡住由
进展性质检查。

## 抽象与边界

- 一个协调域、一条流：`facts` 是域内的提交序列，每次提交要么在本 Session 作用域（`s`，带
  `n ≥ 1` 条共享序号的事实单元）要么是别的 Session 的（`o`）；四条耐久流的区别对游标不可见
  （决定 G），所以不建模流的名字。事实单元 `(seq, idx)` 对应帧的 `position.seq` 与
  `batch.index`。
- 投影滞后：`pv` 是投影的完整覆盖水位，`Project` 把它推进一格并顺带响铃；服务端从不把
  水位推过 `pv`（`SentWithinProjection`），`floor ≤ pv`。
- 铃可丢：每次 fold 对每个开着的订阅独立地"听到 / 丢失"（`lost` 集合），对应 LC-06 的进程内
  广播无投递保证。听到铃的订阅从自己的水位 `sent = (seq, idx)` 补到 `pv`，缓冲装不下就推一个
  前缀并把水位停在最后推出的那个单元（可以停在一批中间）；`Reconcile` 在 `sent < Full(pv)` 时
  再推一次；水位掉到 `floor` 之下的订阅不再被服务，`ForceResync` 关掉它、下次订阅走全量重取。
  事实帧从不被丢弃。
- 每个订阅两个缓冲：事实队列（有界，水位停住、不丢）与瞬态环（有界，满则丢最旧并记
  `pend`，下一次投递先给客户端一个 `gap` 标记）；这是 [MS-4](../invariants.md#安全性质) 与
  [scope-and-delivery.md §4](../scope-and-delivery.md#4-背压ms-6) 两行的机制。两个缓冲之间不
  假设顺序：`ended{committed, position}` 与结算事实同一步产生、进瞬态环，客户端按 `position`
  读派生消息替换草稿，不等事实提示到达（[delta-protocol.md §3](../delta-protocol.md#3-瞬态与耐久的接头)）。
  首稿把两类帧放在一个队列里，进展检查给出反例：无穷多次 attempt 的瞬态帧把事实帧挤出
  队列，事实永远到不了。
- 客户端只有一个数作游标（最后**整批收齐**的作用域内序号），只在收到一批的最后一个单元时
  推进；`delivered` 集合是为了陈述 `CursorComplete`（MS-3）而保留的账，不是实现要维护的状态。
  重连后服务端从游标之后重发，可能只收了一半的那一批会再来一次，客户端按去重键丢掉
  （`DeliverOnce` 陈述"重发只属于那一批"，`AtMostOnePartial` 陈述"半批至多一个"）。
- 订阅建立：`cursor < floor` 走全量重取（模型里直接把 `delivered` 置为 `≤ pv` 的全部单元、
  游标置为 `pv`，代表客户端从读面重取到安装完成点，安装视为原子）；否则从投影按区间补齐到
  `pv`，一次最多推 `BufMax` 条，余下由 `Reconcile` 续。
- 崩溃：`epoch + 1`，attempt 与所有订阅丢失，持有草稿的客户端立刻记缺口；事实与投影不受影响。
- 不建模：授权与可见范围版本（MS-5 的核对点由场景 MS-08 验收）、跨页读取与按位置拉正文、
  真实投影重建（模型里投影只是滞后）、全量重取的安装过程、来源消失（场景 MS-16）、媒体引用、
  `render`、多个协调域、租户级轻量流、传输层（心跳、批处理、断开阈值）。

## 性质

| 性质 | 对应 | 配置 |
|---|---|---|
| `TypeOK` | 类型 | 全部 |
| `NoForeignDelivery` | MS-5 的作用域部分：别的 Session 的事实从不投递 | 安全 |
| `CursorComplete` | MS-3（按批）：游标之下每一批的每个单元全部已投递，不论丢过多少次铃 | 安全、进展、两个否定配置（期望违反） |
| `SentComplete` | 服务端水位不虚报：`sent` 之前的单元要么已投递要么在缓冲里 | 安全 |
| `SentWithinProjection` | 评审 B2：水位不越过投影的完整覆盖水位 | 安全、进展 |
| `EndedAfterCommit` | MS-7 的一部分：`ended{committed}` 指向已存在的结算事实（模型没有真实 attempt 身份，也没有"提交后、终止帧前"的独立窗口） | 安全 |
| `BufferOrdered` | MS-2：事实队列按 `(seq, idx)` 严格递增且高于游标 | 安全 |
| `AtMostOnePartial` | 客户端在游标之上至多持有一批的部分单元 | 安全 |
| `DraftCurrent` | MS-4：草稿只属于当前 `epoch` | 安全 |
| `Monotone`（动作） | 已投递集合与游标不倒退 | 安全 |
| `DeliverOnce`（动作） | MS-2：已投递过的单元只会在重连后作为半批的重发再次出现（客户端按去重键丢弃） | 安全 |
| `EventuallyDelivered` | MP-1：每个作用域内单元最终到达每个客户端 | 进展（弱公平：投递、对账、订阅、强制重取、投影 fold、attempt 收尾） |
| `BuffersDrain` | MP-3：开着的订阅的事实队列最终排空或被关闭（瞬态环可以一直有新帧，不在此列） | 进展 |
| `AttemptsSettle` | MP-2：运行中的 attempt 最终收尾 | 进展 |
| `GapMarked` | MS-4：欠下的缺口最终显示（或订阅已关、下次订阅重基线）；用永久布尔，只证"至少显示过一次" | 进展 |

## 模型发现

- 首稿的订阅建立把整个补齐区间一次塞进缓冲，TLC 在 3 条事实、缓冲 2 的配置下立刻给出
  `TypeOK` 反例（缓冲越界）；补齐改为分页、余下由对账续推，提案正文的背压表随之从
  "缓冲满关订阅并要求重订阅"改为"水位停住、有空位再续"（[scope-and-delivery.md §4](../scope-and-delivery.md#4-背压ms-6)）。
  关订阅的做法在模型里会让慢客户端在订阅、对账、关闭之间空转而永远收不到事实。
- `resync_required` 因此只剩一种用途：客户端发现事实帧乱序时的自我保护
  （[envelope-and-cursor.md §6](../envelope-and-cursor.md#6-与-dsh-的对照)）。
- 单队列模型下两订阅加崩溃的安全配置在 3 条或 2 条事实下 5 分钟内都未完成；分开两个缓冲
  后状态数大幅下降，两订阅、2 条事实、含崩溃 1.5～3 分钟完成。登记的安全配置仍取 1 个订阅、
  3 条事实、含崩溃（单配置 ≤ 1 分钟），两订阅的补充配置在重放脚本里跑
  （[session 验证范围](../../../../spec/capabilities/session/verification.md#消息流游标模型提案候选)
  记状态数与耗时）。这是有限范围的取舍，不是两订阅语义有问题：订阅之间没有共享状态，模型
  里的耦合只有 `lost` 集合与广播。
- 进展配置 3 条事实时活性检查超过 5 分钟，登记的进展配置取 2 条事实（单配置 ≤ 1 分钟的
  裁决）；2 条事实覆盖"丢一次铃再听到一次"与"崩溃后重订阅"两条路径。"待推事实超过队列
  容量、水位停住再续推"需要 3 条事实（`MaxFacts = 3`、`BufMax = 2`），只在安全配置
  Cursor.cfg 里出现，进展配置不覆盖它（评审 N1 指出，[review.md](../review.md)）。
