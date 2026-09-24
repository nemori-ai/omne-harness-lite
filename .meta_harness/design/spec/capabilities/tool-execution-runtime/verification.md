# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态（2026-09-23 起草当日）：形式工件已在起草者本机执行；规范场景与故障注入一条都没演练。**
> `capability.tool-execution-runtime` v1 是 `candidate`，**未经独立评审、未接受**；尚无提供者设计、尚无源码。
> 模型那几条「无反例」**之所以有内容**，是因为同一次执行里六个去保护配置都按预期给出了反例；
> 按构造成立的几条（`SequentialBatch`、`ConcurrencyCap`、`WaitOnlyForeground` 等）**不作为证据**，理由在 [formal 入口](v1/formal/README.md#本版选用什么)。
> **原始输出没有存进 `record/evidence/`**：起草者对那一区没有写权限，下面「实际执行」一节只是摘要，**正式证据 run 待主线落盘**。

## 证据义务

### 形式工件

| 规范条款与性质 | 模型／配置 | 实际证据入口、输入与范围 | 未完成义务、责任与受阻消费者 |
|---|---|---|---|
| [S-16](v1/contract.md#s-16-首胜收场只写一次) · [S-17](v1/contract.md#s-17-持久意图先于外部效果) · [S-18](v1/contract.md#s-18-收场先落停止后发) · [S-19](v1/contract.md#s-19-送达) · [S-20](v1/contract.md#s-20-恢复扫描与停机不重来) · [S-29](v1/contract.md#s-29-会话归档) · [S-30](v1/contract.md#s-30-答复等待) 的安全性质 | TLC 对 [`Execution.tla`](v1/formal/Execution.tla)，配置 [`Execution.cfg`](v1/formal/Execution.cfg)；formal task `tool-execution-runtime-v1-execution` | **已执行**（[下文](#实际执行)）：**无反例**，741,344 个不同状态、完整穷尽、深度 22 | 结论只在模型的固定规模内、**且存储真的兑现同一行条件写与「不只成一半」**这个前提下成立；跨进程不自动成立（[S-46](v1/contract.md#s-46-装配给的保证-vs-协议须给的保证)） |
| [S-19](v1/contract.md#s-19-送达) · [S-20](v1/contract.md#s-20-恢复扫描与停机不重来) · [S-18](v1/contract.md#s-18-收场先落停止后发) 的进展性质 | 同一模型，配置 [`ExecutionProgress.cfg`](v1/formal/ExecutionProgress.cfg)（`FairSpec`，`MaxWaits = 1`）；formal task `tool-execution-runtime-v1-execution-progress` | **已执行**（[下文](#实际执行)）：**无反例**，524,448 个不同状态、完整穷尽、深度 20；**约 16 分钟**，是本分支最慢的一个 formal task | 三条公平性是**前提**：恢复终会发生、日志追加终会成功、强制停止终会生效（后一条依赖 X-5，未核） |
| 同上的**有效性**（六处保护各自去掉） | 六个 `Execution_*.cfg`，**预期找到反例** | **已执行**：六个都**按预期违反**，轨迹对得上各配置注释写的局面（[结果与反例](#结果与反例)） | **必须与第一行成对报告**。它们**不登记为 formal task**——期望失败的检查与该清单的语义相反 |

### 规范场景

**十二条全部未开始**——它们要的是真实实现，而实现不存在。

| 场景 | 证据形式 | 状态 | 说明、责任与受阻 |
|---|---|---|---|
| [S-50 前台完成](v1/contract.md#s-50-前台完成) | 演练；断言收场、账、消息、条目**同成同败**（在四者之间注入一次失败） | **未开始** | 受阻：会话日志追加口未定（[G-1](v1/contract.md#十二已知缺口)） |
| [S-51 前台被用户中断](v1/contract.md#s-51-前台被用户中断) | 演练；执行者在停止后以错误退出 | **未开始** | 断言收场仍是 `interrupted`、三件事分开 |
| [S-52 自动转后台后完成](v1/contract.md#s-52-自动转后台后完成落一条提醒) | 演练，能操纵时间源；运行在执行完成之前终结 | **未开始** | 账归原运行、标 `late`；落盘前那一关受阻于 [G-6](v1/contract.md#十二已知缺口) |
| [S-53 等待、再次等待与迟到的答复](v1/contract.md#s-53-等待再次等待与迟到的答复) | 演练 | **未开始** | 答复者形状受阻于 [G-10](v1/contract.md#十二已知缺口) |
| [S-54 停机后前台与后台各追补一条](v1/contract.md#s-54-停机后前台与后台各追补一条) | **故障注入**：强杀据点进程；**含一个没有协程要恢复的会话** | **未开始** | 卡片关闭受阻于 [G-5](v1/contract.md#十二已知缺口) |
| [S-55 找得到的不追补](v1/contract.md#s-55-找得到的不追补) | **故障注入**（见下「两个方向」①） | **未开始** | —— |
| [S-56 归档之后到达的完成不送达](v1/contract.md#s-56-归档之后到达的完成不送达) | 演练；执行者故意在停止之后再交回 | **未开始** | —— |
| [S-57 取消运行不动后台](v1/contract.md#s-57-取消运行不动后台) | 演练；两级各跑一次 | **未开始** | 记录与消息都可验证（`run_cancelled` 已有取值） |
| [S-58 插队三行](v1/contract.md#s-58-插队三行) | 演练 | **未开始** | `human_declined` 的判据（等的是不是卡片）受阻于 [G-5](v1/contract.md#十二已知缺口) |
| [S-59 停止与交回交错](v1/contract.md#s-59-停止与交回交错) | **故障注入**：在收场写下与实际停下之间注入一次交回 | **未开始** | local-execution「停止与 I/O 交错」那组反例的本项目版本 |
| [S-60 凭据不符与核对不了都整批不执行](v1/contract.md#s-60-凭据不符与核对不了都整批不执行) | 演练；放行核对面可关 | **未开始** | 依赖 `capability.tool-admission` 的核对面（并行起草） |
| [S-61 参数不合即刻失败并带用法](v1/contract.md#s-61-参数不合即刻失败并带用法) | 演练：六支（未知键且 `input` 没写 `additionalProperties`、未知键且显式 `false`、缺必填、命令不在命令表、单函数工具带未知键、只带命令清单即显式 `true` 收任意对象）各一次；断言执行者没起、块上用法与 `Tools().inspect` 答的一致 | **未开始** | 「与 `inspect` 一致」受阻于 `Tools()` 没有契约（PF-007）；**模型里没有这一支**，TLC 的结果对它不作证 |

### 故障注入：「找得到／找不到」的两个方向

[S-7](v1/contract.md#s-7-活体与找得到) 的「只有扫描之后找不到才可信」只有两个方向都测过才算有证据：

| 方向 | 做法 | 断言 | 状态 |
|---|---|---|---|
| ① 在的误判成不在 | 执行跑着时触发 `reconcile` | 不追补；日志里这个 `CallId` 只有它自己跑完之后的那一条结果 | **未开始** |
| ② 不在的漏判成在 | 杀掉执行的进程组、再杀据点进程，重启 | 扫描完成前一切操作 `runtimeNotReady`；追补出现且只有一条；**执行者没有被重起** | **未开始** |

**另一条要真跑的**：存储不可用时的读面（[S-33](v1/contract.md#s-33-读一次执行)～[S-35](v1/contract.md#s-35-列出活体)）返回 `dependencyUnavailable` 而不是空表或 `executionNotFound`——最容易被「读不到就当没有」抹掉的一条。**未开始。**

### 两源已知失败情形

[D-032](../../../record/decisions/tool-execution-runtime-baseline/decision.md) 要求把两源（DSH `jobs` 与 minimal-runtime `local-execution`）已知的失败情形列成测试义务，
来源见[提案的候选与取舍](../../../record/proposals/tool-execution-runtime-baseline/alternatives.md#a--fork-dsh-jobsjobsjobs-localtool-jobs-再改造)与[仍待区分的实验](../../../record/proposals/tool-execution-runtime-baseline/alternatives.md#仍待区分的实验)。

| # | 已知失败情形（来源） | 本契约的哪条义务挡住它 | 测试义务（证据形式） | 状态 |
|---|---|---|---|---|
| K-1 | **撤除时停止抛错，要强制结算**（DSH `jobs`） | [S-18](v1/contract.md#s-18-收场先落停止后发)：收场先落、收口出错记账不改收场；[S-48](v1/contract.md#s-48-本能力自己的撤除与换代)：撤除不写收场、正确性不依赖撤除 | 注入一个停止时抛错的执行者，分别在中断与本能力撤除时触发；断言收场不变、错误进条目、下一任扫描不重复写 | **未开始** |
| K-2 | **同 id 换实例不串台**（DSH `jobs`） | [S-5](v1/contract.md#s-5-一次执行以会话里的-callid-指认)：身份是 `(租户, 会话, CallId)`，不是实例；[S-16](v1/contract.md#s-16-首胜收场只写一次)：晚到的交回按「记录已收场」丢弃 | 执行者重新登记（新实例）时旧实例仍在跑；旧实例在收场之后交回；断言被丢弃、之后的提交走新实例 | **未开始** |
| K-3 | **起进程失败被记成被中断**（DSH bash producer） | [S-38](v1/contract.md#s-38-起执行者)、[S-11](v1/contract.md#s-11-失败的种类)：起不来 = `failed{start_failed}` | 让起进程失败；断言收场 `failed`、种类 `start_failed`、外部效果「已确定未发生」 | **未开始** |
| K-4 | **停止不结算就卡住撤除、占着并发位置**（DSH `jobs` 已知限制） | [S-18](v1/contract.md#s-18-收场先落停止后发)：宽限后强制；[S-43](v1/contract.md#s-43-一批依次与同一工具的并发上限)：并发位置在收场那一刻释放 | 执行者忽略停止；断言收场即刻写下、同一工具的下一次执行立刻能起、宽限到点强制停止、停不掉时记 `unconfirmed` | **未开始** |
| K-5 | **后台默认开启**（DSH `jobs`） | [S-15](v1/contract.md#s-15-缺席时的默认答案)：没声明 `allowBackground` 就不能后台，四个触发源都不例外 | 对不许后台的工具分别触发阈值、上限、手动、插队、发起即后台；断言没有一次转成后台 | **未开始** |
| K-6 | **执行寿命挂在活体 agent 上，回收即杀**（DSH `jobs`） | [S-8](v1/contract.md#s-8-姿态与阶段两个维度)、[S-46](v1/contract.md#s-46-装配给的保证-vs-协议须给的保证) 第一行：执行宿主不在 agent runtime 之下 | 前台执行中回收 agent runtime；断言执行照跑、新协程 `awaitForeground` 拿到同一结果 | **未开始** |
| K-7 | **记录只在内存，重启后查无此任务**（DSH `jobs`） | [S-17](v1/contract.md#s-17-持久意图先于外部效果)、[S-20](v1/contract.md#s-20-恢复扫描与停机不重来) | 同上「两个方向」② | **未开始** |
| K-8 | **停止与 I/O 交错**（`local-execution` 已发现、只做了局部修复） | [S-16](v1/contract.md#s-16-首胜收场只写一次)：同一行首胜；收场之后到达的完成丢弃、外部效果「不可确定」 | 场景 [S-59](v1/contract.md#s-59-停止与交回交错)；模型否定配置 `FirstWins = FALSE` 是它的形式版本 | 形式版本**已执行**（按预期反例）；演练**未开始** |
| K-9 | **恢复把在途执行落成「状态不明」、「已受理未派发」可经许可继续**（`local-execution`） | [S-20](v1/contract.md#s-20-恢复扫描与停机不重来)：一律 `failed{abnormal_interruption}`，没有例外，**排队中从没起过的也不继续** | 停机时留一条 `queued` 的记录；断言恢复后落失败、外部效果「已确定未发生」、没有被起 | **未开始** |
| K-10 | **据点进程被强杀后子进程还活着**（提案 X-5，两源都没覆盖） | [S-20](v1/contract.md#s-20-恢复扫描与停机不重来) 第 2 步：先回收登记过的进程组，再写失败；[S-46](v1/contract.md#s-46-装配给的保证-vs-协议须给的保证) 倒数第二行 | 两平台各起一棵子进程树后强杀据点进程；断言重启扫描回收了整组、之后才落失败 | **未开始**；进展性质 `StopsTakeEffect` 的前提依赖它 |
| K-11 | **自有 JSONL 账本、部署独占租约**（`local-execution`） | 不是契约性质：执行记录落 `core/storage`，归提供者设计 | 无（提供者设计的选择） | 不适用 |

### 由别处承担、本契约只写明要求的

| 要求 | 写在哪 | 由谁兑现 | 证据落点 |
|---|---|---|---|
| 凭据绑定 `(会话, CallId, 生效参数)`，核对面区分 `invalid` 与 `unavailable` | [S-23](v1/contract.md#s-23-提交一批) ② | `capability.tool-admission` | 那份契约的场景；本契约 S-60 |
| 替换件与不可用条目带原因 | [S-23](v1/contract.md#s-23-提交一批) ④ | `capability.asset-registry` | 那份契约的场景 |
| 桥换代时挂起调用落 `failed{abnormal_interruption}`、不重放 | [S-37](v1/contract.md#s-37-执行者登记与撤下) | `capability.mcp-bridge` | 那份契约的场景 |
| 帧的装配、在途状态的快照、帧流收尾产出 `ToolInternalMessage` | [S-39](v1/contract.md#s-39-发帧) | `capability.stream-assembly` | 那份契约的 TLA+ 与场景 |
| 会话日志追加能与执行记录「不只成一半」 | [S-19](v1/contract.md#s-19-送达)、[S-46](v1/contract.md#s-46-装配给的保证-vs-协议须给的保证) | 会话日志的 owner ＋ 本能力的提供者设计 | 提供者设计须指出共同的存储对象；[G-1](v1/contract.md#十二已知缺口) |
| 账与记录不进给模型看的上下文 | [S-13](v1/contract.md#s-13-账) | 上下文组装（PF-010，无契约） | 那一侧的场景 |

## 对齐义务

**这些是本契约与别的契约、或与主线待落的改动之间要一起落的事**，不是本契约自己的证据义务。

| 对齐什么 | 依据 | 涉及 | 现状 |
|---|---|---|---|
| **多命令调用在起执行者之前按所选命令的 `commands[c].input` 校验 `args`**（缺必填、未知键、类型不合）；**不合即不起执行者、收场 `failed`**，新失败种类 `arguments_invalid`，结果内容**必须带该命令的参数用法**（与 `Tools().inspect` 给出的同一份文本），让模型能自纠。落点：[S-23](v1/contract.md#s-23-提交一批) 的九件事与 S-42 之前那一步 | 研究 V-5 结论 ③（`tool-definition-shape-sources`，HUB `1867ceb0`），产品负责人 2026-09-24；`data.tool-definition/v1#S-7` 第 3、4 条（判定以 `commands[c].input` 为准、`args` 缺席按 `{}` 判——flat 形的模型面不替它判参数） | 本契约 S-11、S-23、S-42；`data.content-blocks` 的收场与结果块；`Tools().inspect`（PF-007 的契约，尚未建立） | **已落正文（2026-09-24 修订批第五节）**：原有的 `arguments_rejected` 就是这一种，改名为账本名 `arguments_invalid`，**种类仍是七个**（本行原写的「七个变八个」不成立）；判定从起执行者移到提交时（S-23 ④ 第 ② 条）；S-42 列明它不经卸载那一关；新场景 S-61。**仍待**：`Tools().inspect` 的契约建立后核「同一份用法」 |

## 实际执行

**2026-09-23，起草者本机，run 未落进 `record/evidence/`。**

- **工具**：TLC2 Version 2026.09.12.025210（rev 867aefb），`/opt/tlaplus/tla2tools.jar`；OpenJDK 21.0.12.1（Temurin），`/usr/local/bin/java`
- **工作目录**：设计根 `.meta_harness/design`（与 `formal-tasks.json` 的 runner 相同）
- **输入**：本分支工作树里的 `v1/formal/Execution.tla` 与八个配置（提交之前的同内容文件；提交之后以提交修订为准）
- **命令**（主配置，与 `formal-tasks.json` 的 `tool-execution-runtime-v1-execution` 相同，另加 `-Djava.io.tmpdir` 指到设计根的 `tmp/`——本机根分区满，TLC 的临时文件不能落 `/tmp`）：
  `java -cp tla2tools.jar tlc2.TLC -metadir tmp/tlc/tool-execution-runtime-v1-execution -cleanup -noGenerateSpecTE -workers 1 -config spec/capabilities/tool-execution-runtime/v1/formal/Execution.cfg spec/capabilities/tool-execution-runtime/v1/formal/Execution.tla`；
  进展配置与六个有效性核对同一命令形制，只换 `-config` 与 `-metadir`

| 配置 | 退出码 | 结果 | 规模 |
|---|---|---|---|
| `Execution.cfg` | **0** | `Model checking completed. No error has been found.` | 2,656,347 generated · **741,344 distinct** · 0 left · 深度 22 · 1 min 12 s |
| `ExecutionProgress.cfg` | **0** | `Model checking completed. No error has been found.`（`LostSettles`、`HandoffLands`、`StopsTakeEffect`，12 个时序分支） | 1,858,831 generated · **524,448 distinct** · 0 left · 深度 20 · 15 min 56 s（与别的检查并跑；登记的超时 2400 s） |
| `Execution_NoFirstWins.cfg` | 13 | `Action property OutcomeStable is violated.` | 轨迹 5 步 |
| `Execution_VolatileHandoff.cfg` | 12 | `Invariant EndedIsLanded is violated.` | 轨迹 3 步 |
| `Execution_StopBeforeWrite.cfg` | 12 | `Invariant InterruptHonored is violated.` | 轨迹 4 步 |
| `Execution_PartialRecovery.cfg` | 12 | `Invariant ServingConsistent is violated.` | 轨迹 4 步 |
| `Execution_RestartOnRecover.cfg` | 12 | `Invariant AtMostOneStart is violated.` | 轨迹 5 步 |
| `Execution_NoWaitIndex.cfg` | 12 | `Invariant NoStaleAnswer is violated.` | 轨迹 7 步 |

**经登记的 runner 再跑一遍**：`JAVA_BIN=/usr/local/bin/java TLA2TOOLS_JAR=/opt/tlaplus/tla2tools.jar make design-check FORMAL=run`（2026-09-24 本机，提交 `dfef00fd` 的模型与配置）：
本分支登记的八个 formal task 全部 `exit=0`，其中 `tool-execution-runtime-v1-execution` 与 `tool-execution-runtime-v1-execution-progress` 两个是本契约的；整次 18 min 05 s，`PASS: design tree … formal=run`。

**2026-09-24 修订批（第五节）之后复跑两个 formal task**（起草者本机，run 未落进 `record/evidence/`）：本批**没改** `Execution.tla` 与任何 `.cfg`（参数不合那一支不在模型里，见 [formal/README](v1/formal/README.md)），复跑只为确认结论不随正文改动失效。同一 TLC2 版本，命令形制同上（`-metadir tmp/tlc/te-rev0924-<配置>`），两个配置先后串行跑：

| 配置 | 退出码 | 结果 | 规模 |
|---|---|---|---|
| `Execution.cfg` | **0** | `Model checking completed. No error has been found.` | 2,656,347 generated · **741,344 distinct** · 0 left · 深度 22 · 1 min 10 s |
| `ExecutionProgress.cfg` | **0** | `Model checking completed. No error has been found.`（12 个时序分支，时序检查 3 min 01 s） | 1,858,831 generated · **524,448 distinct** · 0 left · 深度 20 · 19 min 42 s（与其他代理的检查并跑） |

规模与 2026-09-23 那次逐位相同。六个否定配置本批没有复跑。

### 结果与反例

| 配置 | 轨迹 | 对得上注释写的局面吗 |
|---|---|---|
| `NoFirstWins` | `Submit(b1)` → `Start(c1)` → `Interrupt(c1)` → `LateReturn(c1)` | 是：中断落定之后晚到的完成覆盖了收场 |
| `VolatileHandoff` | `Submit(b2)` → `Crash` | 是：替换件 c4 的 `unavailable` 已写进记录，那条工具消息只在进程内存里，停机即丢 |
| `StopBeforeWrite` | `Submit(b1)` → `InterruptSignal(c1)` → `StartFail(c1)` | 是：停止先发、中断的收场还没写，另一路收场（起不来）抢先落定 |
| `PartialRecovery` | `Submit(b2)` → `Crash` → `Recover` | 是：发起即后台的 c3 不在「只处置前台」的扫描范围里，恢复之后记录未收场、找不到活体 |
| `RestartOnRecover` | `Submit(b1)` → `Start(c1)` → `Crash` → `Recover` | 是：恢复把在跑的 c1 重起了一遍 |
| `NoWaitIndex` | `Submit(b1)` → `Start(c1)` → `EnterWait(c1)` → `Answer(c1,1)` → `EnterWait(c1)` → `Answer(c1,1)` | 是：答给第 1 次的答复解除了第 2 次 |

**模型的演化**：本日第一版把送达建成「与收场同一步」、以 `SameCommit` 开关对照；主线随后裁定「同一提交」目前没有共同存储对象、两种承接形状交给提供者设计，
模型改为「交付 + 追加」两步（`DurableHandoff` 开关），同时覆盖两种形状。第一版的运行结果**不再代表本模型**，不列。
第二版在 `Waiters = {c1, c2}` 下主配置达 1,921,132 个不同状态、3 min 10 s；为让 formal task 在合理时间内跑完，收成只有 c1 进等待（c2 的等待与 c1 的等待对哪条性质都不提供新局面），即上表。

## 变化的影响

- **2026-09-23 起草**：新建 v1 候选。登记：catalog 一条（七项依赖）、covers 57 条（`reviewed: false`）、formal-tasks 两条。
- **并行起草的六份契约**（`data.arrival-events`、`capability.stream-assembly`、`capability.tool-admission`、`capability.asset-registry`、`capability.loop-extension-runner`、`capability.mcp-bridge`）：
  本契约按它们的施工账本或主线转达引名，**未登 catalog 依赖**。合流对齐时：补登坐标与消费 clauses；核对引到的名字
  （`verifyToken(token, call, session)` 的三个结果、`availability` 的三支、`after_action` 的派发与「卸载判定不可用 = 只记可见」、桥换代时挂起调用的收场、`stream-assembly` 的五个操作与 `finish` 的四个 `reason`）是否与定稿一致，不一致按定稿改本契约。
- **三个占位原因**：起草时写作「等 `data.content-blocks` 下一版」；2026-09-24 整批对齐时它们已在 v1 候选里，G-2 闭合，S-10 那三行改为「有」，不改任何行为。
- **起草途中主线三次转达**（均已并入本版）：核凭据的面与两个失败值（`notAdmitted{why}`、`admissionUnavailable`）；「同一提交」改写为装配给的一行、两种承接形状不在契约里选；
  注册表判为不可用的条目落 `failed` 并带原因（`notAvailable{reason}`，已被 2026-09-24 整批对齐撤回，见下一条）；MCP 动作的撤下例外。
- **2026-09-24 整批对齐**（主线裁定 2026-09-23，待产品负责人确认；账本 S13-a～h、S19-b/d）：
  - **注册表判为不可用 → 收场 `unavailable`**（S13-a，改判 S22-f）：删失败种类 `not_available`（八 → 七）、失败值 `notAvailable{reason}`（十三 → 十二）；替换件、条目 `unavailable{reason}`、关掉的命令三支同归 `unavailable`。改了 S-9 收场表、S-11、S-23 ④⑤⑥ 与其后一条、S-37、第八节性质表一行、examples §8（删一行、补「不是失败值的那一支」）、formal/README 语义映射（常量 `StandIn` 的含义扩成三支，模型文件不改，行为相同）。R-17 闭合。
  - **声明卸载的原始结果由本能力总是存下**（S13-b）：S-36 加两条（先存、存不下同「记录读写不了」上交），S-42 改「那一关不可用」一条（只落引用、摘要缺席）与停机那一条，S-15 一行，CS-5，examples §5。G-6 收窄为「由谁驱动」；R-11 闭合。
  - **工具执行被中断不另补提醒**（S13-d）：S-19 加一条，S-4 `data.messages` 行加 S-21；G-14 闭合，R-15 闭合。
  - **六份并行契约补登**：头部依赖列表与 S-4 表合一，引名逐字核定稿——`stream-assembly` 的操作名是 `start`、`closeOut`（原 `open_target`、`close_out` 作废）；`verifyToken` 的结果是 `valid | invalid{reason}`、失败 `invalidInput | unavailable`（原 `invalid{why} | unavailable` 三结果写法作废），`invalidInput` 收成整批 `invalidInput`（S-23 ⑧）。六份都不反向登记本契约，无环。
  - **MCP 桥**（S19-b/d）：S-11 把桥的失败值按 `capability.mcp-bridge/v1#S-21` 对到 `implementation_error` / `abnormal_interruption`；S-14 按「请求是否已发出」定外部效果；S-37 与桥 S-27 互指；CS-6。
  - **账与占位原因**（S13-f、S13-h）：`data.call-accounts` v1 候选已带 `externalEffect`、`stoppedAt`、`late`，`data.content-blocks` v1 候选已带三个占位原因——S-13 表补 `initiator`、`credentialScope`、`externalEffect`、`stoppedAt`、`late` 五行，S-14 写投影（「不可确定」→ `unknown`），G-2 闭合，G-8 收窄为「晚报的一笔没有 `obtainedVia` 取值」，新立 G-15（`credentialScope` 从哪来）。
  - 不改的：S13-c 采纳的推导（姿态 × 阶段、`preempt` 原子、并发按会话计等）本来就在正文；S13-e 进展任务照登；S13-g 两种承接形状本来就不选。
  - **对消费者**：agent loop 与 `BkgJobs()` 读到的判为不可用的项，从 `notAvailable{reason}` 逐条失败变成 `ended{unavailable}`——调用方不必另补结果这一点不变。
- **2026-09-24 修订批第五节（候选，未冻结，原地改）**：
  - **参数不合 → `failed{arguments_invalid}`**：原失败种类 `arguments_rejected` 改为账本名 `arguments_invalid`（同一件事，种类仍七个）；判定由起执行者（原 S-38 第 2 步）移到提交时，成为即刻收场的第 ② 种（[S-23](v1/contract.md#s-23-提交一批) ④，与「判为不可用」「发起即后台被拒」排定次序）；单函数工具按它的 `input`、多命令工具按所选命令的 `commands[c].input` 判；块上必带「哪里不合」与该命令的一行说明加参数表（命令不在命令表里时带命令清单），与 `Tools().inspect` 一致（[S-11](v1/contract.md#s-11-失败的种类)）；S-42 列明它不经卸载那一关；S-9、S-2、S-4 相应几处；安全性质表加一行；新场景 [S-61](v1/contract.md#s-61-参数不合即刻失败并带用法)；examples 共用局面加 `fs`、第 1 节第 1～2 步、第 8 节末加一张表。
    **S-38 的步骤号顺移**：原第 3、4、5 步成为第 2、3、4 步，G-4 那一格跟着改；外部没有引用这几个步号。
  - **产品依据升到 PF-006 rev 19**：抬头与设计依据表加 §5.3「多命令工具的定义里带多少」（→ S-11、S-23）与 §6.6「前台上限与并发上限」（→ S-43、S-44）；S-43 的计数范围、S-44 的「等待不计、转后台不再计」由「本契约的推导」改为引产品正文；**G-3 收窄**：产品已定原因「前台超时」，缺的只剩 `data.content-blocks` 的取值（R-25）。
  - **formal**：`Execution.tla` 与八个配置**未改**；`formal/README.md` 语义映射里 `StartFail` 一行去掉「参数」、写明参数那一支不在模型里。catalog 对 `data.tool-definition` 的依赖加 S-4、S-5、S-7；covers 加两条。
  - **对消费者**：没有已采用的消费者，无迁移。**语义改变**：参数不合的调用不再占排队位置、不等轮到它，提交那一次写就落定；它的块上多了用法。agent loop 读到的仍是 `ended{failed}`、不必另补结果。
- **2026-09-24 主线对修订批报回项的裁定（候选，未冻结，原地改）**：
  - **未知键一律拒**（R-24 裁定）：[S-11](v1/contract.md#s-11-失败的种类) 那条「按定义的原义读」改为「`input` 顶层没写 `additionalProperties` 按 `false` 读，显式 `true` 或 schema 才收」，读法的家在 `data.tool-definition/v1#S-5` 末条，本契约照它判；「只带命令清单」的写法随之是显式 `true`。[S-61](v1/contract.md#s-61-参数不合即刻失败并带用法) 由四支扩到六支（未知键分「没写」「显式 `false`」两支，加单函数工具一支）；`examples.md` 共用局面里 `grep` 的 `input` 改为不写 `additionalProperties`、加一个不收参数键的命令 `pwd`、`peek` 改为显式 `true`，第 8 节表加 `pwd` 一行。
  - **次序与单函数工具**（R-26、R-27 确认）：S-23 那句「这两个次序是本契约的推导」改为主线裁定 2026-09-24；S-11 加一条单函数工具同一种类、同一规则。
  - **前台超时的取值**（R-25 裁定）：主线定名 `foreground_timeout`，已进 `data.content-blocks` v1 的 S-18；[S-10](v1/contract.md#s-10-占位原因) 那一行由「本版没有取值」改为它，表下「停下并上交」那段删去；S-44 表那一格同步；**G-3 闭合**。
  - **formal**：模型与配置未改（参数那一支与占位原因都不在模型里）。
  - **对消费者**：没有已采用的消费者，无迁移。**语义改变**：没写 `additionalProperties` 的 `input` 从「收未知键」变为「拒未知键」；前台超时的那条消息从「落不下去」变为可以落。
  - **（同日第二轮，主线裁定，以 PF-006 §6.7 为准）`terminated_by_agent` 只落后台执行收场提醒的结果块，不作占位**：[S-10](v1/contract.md#s-10-占位原因) 那一行、[S-25](v1/contract.md#s-25-中断一次执行) 表下那一条（原写「照常落占位」，与 S-25 自己的「后台的执行被中断，落 `background_execution_finished` 提醒」相抵）改写；与 `data.content-blocks` S-18 同一措辞。模型与配置未改。

## 报给主线

产物末尾的问题清单：**要主线或产品负责人答的**，与契约[第十二节](v1/contract.md#十二已知缺口)「契约自己承认的缺口」分开。

| # | 问题 | 坐标 | 种类 |
|---|---|---|---|
| R-1 | **「工具执行运行时」这项能力没有词条**：词表把它并进了 UL-tool-execution（单次执行自己的运行时），承载全部执行的这一项能力本身无词可用；本契约只在入口处说明，正文用「本能力」 | 契约 S-1；[UL-tool-execution](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution) | 无词条 |
| R-2 | **另三个无词条概念**：「活体」（S-7）、「执行者」（S-37）、「失败的种类」（S-11）；本契约各在一处给了用法说明，未立正式名 | S-7、S-11、S-37 | 无词条 |
| R-3 | **账本外取的名字**：失败值 `notInBackground`、`callIdConflict`、`dependencyUnavailable{which}`、`runtimeNotReady`（对账产物给的）；操作 `preempt`、`awaitForeground`（对账产物给的）；`AdmittedCall.startInBackground`；`waitIndex`；事件 `execution.delivered`；失败种类的八个值 | S-23、S-24、S-31、S-45 | 账本缺名；**已裁（2026-09-23，S13-c 采纳 `callIdConflict`、`dependencyUnavailable{which}`、`notInBackground`）** |
| R-4 | **账本的 `ExecutionState` 单枚举被拆成两个维度**（姿态 × 阶段）：`backgrounded` 是前台那一次调用的收场，不是执行的状态；单枚举装不下「后台且排队」「前台且在等」 | S-8 | 简报改判；**已裁（S13-c 采纳）** |
| R-5 | **简报的 `environmentUnavailable` 失败值去掉了**：执行时才发现的落点拒绝按主线裁定是收场 `failed{environment_unavailable}`，不是操作失败 | S-11、S-38 | 简报改判 |
| R-6 | **超时与阈值不计等待时间**：B-M08 说超时是「前台等待上限」，本契约读成「前台在跑的时间」，等待期间不走——否则一段不占资源的等待会被替人签字（PF-006 §6.6）。若主线本意是计入等待，S-44 与 S-12 要改 | S-44 | 推导待确认；**已裁（S13-c 采纳）** |
| R-7 | **并发上限的计数范围取会话**（同一会话、同一工具名，不论姿态）；B-M08 没说范围 | S-43 | 推导待确认；**已裁（S13-c 采纳）** |
| R-8 | **插队同样处置同一批里还排着的调用**（允许后台的转后台、不允许的中断）；PF-014 §5.4 只说「工具执行中」 | S-31 | 产品问题；**已裁（S13-c 采纳 `preempt` 原子且处置同批排队者）** |
| R-9 | **用户单独中断一次执行之后，同一批后面的调用照样起**；要停这一步走取消运行或插队 | S-43 | 推导待确认；**已裁（S13-c 采纳）** |
| R-10 | **agent 只能掐掉后台执行**（`notInBackground`）：PF-006 flows §四「agent 不中断自己的执行」与 PF-007 §6.10 `terminate` 的调和，按「前台的那一次正阻塞着它自己」读 | S-25 | 推导待确认；**已裁（S13-c 采纳 `notInBackground`）** |
| R-11 | **卸载判定不可用时，作者声明的卸载无人兑现、原始结果丢失**：主线裁定「只记可见」的直接后果，与 PF-006 §6.10「存着，没丢」相抵 | S-42、G-6 | 与裁定的冲突；**已闭合（S13-b：原始结果由本能力总是存下）** |
| R-12 | **`answerWait` 本版没有「明确拒绝回复」**：插队时的 `human_declined` 是中断，不是答复；卡片上人点「拒绝回复」怎样进来，要卡片契约给 | S-30、G-10 | 产品问题 |
| R-13 | **报了但被拒的一笔费用**：本契约选「不进 `items`、留一条记录条目」，不变成一笔 `source: none` 的未知（替 call-accounts 的 G-5 落地） | S-40 | 推导待确认；**已裁（S13-c 采纳）** |
| R-14 | **消费了 `data.identity-values` v1**（简报 catalog 依赖清单里没有它）：租户身份、身份参数无默认、缺席即拒、表示层校验与判定分开 | S-4 | 简报补项 |
| R-15 | **执行结束不另补 `interrupted` 提醒**：`data.messages` S-21「只要中断就补」对工具执行是否适用未定，本版只落占位 | G-14 | 与其他契约的疑似冲突；**已闭合（S13-d）** |
| R-16 | **归档流程里工具执行与模型请求「先停谁」**：PF-015 §6.3 列的次序本契约不管，只保证调用之后没有未收场的执行 | S-29 | 归会话那一程 |
| R-17 | **注册表判为不可用的条目落 `failed` 与 PF-006 的「换替换件、落 `unavailable`」对不上**：主线转达把「关掉的命令、依赖未解析、MCP 连不上的原位顶替」列为落 `failed{…}` 带注册表原因；而 PF-006 [flows §二](../../../product/PF-006-tools-and-skills/flows.md#二异常分支)、[§6.3](../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)、[§6.13](../../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用) 把依赖连不上、MCP 连不上都写成装替换件、调用得「不可用」（绕路、别重试）。`failed` 给 agent 的下一步是「重试、换招」，与「别重试」相反。本契约按注册表给的支走：`stand_in` → `unavailable`，`unavailable{reason}` → `failed{not_available}`；**请主线确认哪些情形该落哪一支**，并同步给 `capability.asset-registry` | S-23 ④、S-11 | 与产品正文的冲突；**已闭合（S13-a：一律 `unavailable`）** |
| R-18 | **进展任务慢**：`tool-execution-runtime-v1-execution-progress` 本机约 16 分钟（超时登 2400 s），`make design-check FORMAL=run` 的总时长随之翻倍；安全任务约 75 秒。要不要把进展任务移出例行运行、或再缩场景，由主线定 | formal-tasks | 工具与流程；**已裁（S13-e：保留登记，不加机制）** |
| R-19 | **词条描述过时**：[UL-cancellation-follows-host](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-cancellation-follows-host--取消跟着宿主走--cancellation-follows-host) 的索引描述仍写「转后台就是换宿主」，与 PF-006 rev 17、PF-012 §6.13「转后台不换宿主」相抵（主线已知，B-M06(ul)） | —— | 词条 |
| R-20 | **「摘要缺席」读成作者的 `summary` 与运行时占位说明都不落**（账本 S13-b「它不可用时消息里只落引用、摘要缺席」）：把二者排进占位的是卸载判定那一关，它不在就没人排。若本意只是「系统不写摘要」、作者的 `summary` 照落，S-42 那一条改一句 | S-42、S-15 | 推导待确认（2026-09-24） |
| R-21 | **声明卸载的原始结果存不下时上交**：S13-b 让本能力总是存，存储读写不了时按「执行记录读写不了」同一处置（收场照写、落盘写不下去就上交），不假装存下 | S-36 | 推导待确认（2026-09-24） |
| R-22 | **失败种类由八个变七个**：S13-c 采纳的「失败种类八值」数的是 S13-a 之前的表；删去 `not_available` 之后是七个 | S-11 | 账本数字过时（2026-09-24） |
| R-23 | **简报写「MCP 例外条款与 mcp-bridge S-27/S-38 互指」**：mcp-bridge v1 没有 S-38；按本契约 S-37（执行者登记与撤下）↔ 桥 S-27（桥被替换或卸载）互指，另引桥 S-21（失败值与收场的对应） | S-37 | 简报坐标（2026-09-24） |
| R-24 | **「未知键都拒」的读法**：修订批简报写「未知键与缺必填键都拒」。本契约读作「`input` 不收的键」——`input` 用 `additionalProperties: false` 关住了才拒，没关的照 Draft 2020-12 收下。若读成「`properties` 里没有的键一律拒」，会与 `data.tool-definition/v1#S-5` 的「只带命令清单」写法（`{"type": "object", "properties": {}}` 收任何一个对象）和 PF-006 §5.3「对不对由工具自己判」相抵——那种写法下任何参数都会被拒。**请主线确认**；若取后一种读法，TD S-5 与 PF-006 §5.3 那一行要一起改 | S-11、S-23 ④ | 简报读法待确认（2026-09-24）；**已裁（主线 2026-09-24：未知键一律拒——`input` 顶层没写 `additionalProperties` 按 `false` 读，显式 `true` 或 schema 才收；与「工具自己判」不冲突，这是判的规则；TD S-5 补末条）** |
| R-25 | **「前台超时」没有 token**：PF-006 rev 18 §6.6／§6.7 定了占位原因「前台超时」，`data.content-blocks` v1 的 S-18 没有对应的 `reason.code`，账本也没给名字；本契约不自造。前台上限到点而不许后台时，记录照写、那条消息落不下去（S-10 那一行「停下并上交」） | S-10、S-44、G-3 | 账本缺名（2026-09-24）；**已裁（主线 2026-09-24：定名 `foreground_timeout`，进 `data.content-blocks` v1 S-18）** |
| R-26 | **参数判定的两个次序是推导**：同一项既被注册表判为不可用又参数不合时报 `unavailable`；参数不合又发起即后台被拒时报 `arguments_invalid`。简报只说「按所选命令的 `input` 校验」，没说与另两种即刻收场谁先 | S-23 ④ | 推导待确认（2026-09-24）；**已裁（主线 2026-09-24 确认）** |
| R-27 | **单函数工具同样判参数**：简报写「按所选命令的 `input`」；本契约把单函数工具（按它的 `input`）一并纳入同一种类——否则 MCP 条目与单函数工具的坏参数会原样交给执行者，与多命令工具两套规矩 | S-11、S-23 ④ | 推导待确认（2026-09-24）；**已裁（主线 2026-09-24 确认）** |
