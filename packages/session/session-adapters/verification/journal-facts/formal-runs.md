# Agent 事实族模型的运行记录

本页记录 [JournalOught.tla](models/JournalOught.tla) 的 TLC 运行：版本、参数、预算、结论与判读。判读规则按 [docs/verification.md](../../../../../docs/verification.md#环境与实际执行)：正控要得到 TLC 的完成结论；负控要命中配置点名的那条性质；非零退出本身不算通过。

结论只在所列范围内成立。它不是证明，也不表示实现符合模型。无界推广见 [proofs/README.md](proofs/README.md)。原始日志不进本包，留在任务过程目录。

## 工具与参数

| 项 | 值 |
| --- | --- |
| 运行环境 | WSL 2 `Ubuntu-24.04`，内核 `6.18.33.2-microsoft-standard-WSL2`，24 核，46 GiB。经 `wsl.exe -d Ubuntu-24.04 --exec bash -l <驱动脚本>` 调用。驱动脚本把 `models/` 复制到 WSL 自己的文件系统，再运行 [run-tlc.sh](models/run-tlc.sh)；`run-tlc.sh` 在 `$HOME` 下的新目录里运行 TLC。两处临时目录在运行后删除 |
| 源码 | 分支 `PanQiWei/rw2-jo-bridge`，提交 `174085c6a`（K-23 删桥）之上本资源入库前的工作树 |
| JDK | Temurin `21.0.12.1+1` LTS |
| TLC | `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`，即 tla2tools 1.7.4。JAR SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |
| 模型 | `JournalOught.tla` SHA-256 `986fabc6d98e51e1c359415b800210c1c2fe578abdf1507f75b8231000389266`（含 `Preserve` 动作、`corePub` 变量、`SecondPosition` 开关与 `P1_OnePosition`、`P1_FactsPublished`） |
| 参数 | 广度优先；`-workers 8`；`-Xmx6g`；`-XX:+UseParallelGC`；`-deadlock`（不把终止状态当错误：槽位 `failed` 与跑完 `MaxSteps` 都是合法终止）；每个配置单独 `-metadir` |
| 预算 | 每配置 1200 秒。全部在预算内结束 |
| 判定 | `run-tlc.sh` 的退出码只由控制决定。本次退出 0 |
| 时间 | 2026-11-04 17:58 至 18:02（北京时间） |

常量（`journal.cfg`）：`MaxSteps = 3`，`Members = {"step","position","calls"}`，`C0 = 1`，`WMember = 1`，`WFact = 2`，`LogMin = 4`，`LogBig = 30`，`MaxCrashes = 1`，`MaxRejects = 1`，`MaxRetries = 1`，`MaxPreserves = 1`。六个错误开关全为 FALSE，`DriverMarksFailed = TRUE`，这是设计本身。`journal-wide.cfg` 把 `MaxSteps`、`MaxCrashes`、`MaxRetries` 放大到 4、2、2，`MaxPreserves = 0`：带一次材料保存的放大配置在 1200 秒内没有搜完（第一次运行：1153 秒后超时，5,500 万生成状态仍在增长），所以材料保存只在基础配置里探索，放大配置保持它先前的范围（状态数与先前运行相同）。负控与 `journal.cfg` 常量相同，只翻一个开关，只检查点名的那条性质。

## 运行结果

| 配置 | 配置 SHA-256（前 12 位） | 开关 | 期望 | TLC 结论行 | 退出码 | 生成 / 不同状态 | 用时（秒） | 判读 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `journal` | `ba6311d68243` | 无 | 无反例 | `Model checking completed. No error has been found.` | 0 | 2,030,143 / 290,615，深度 18 | 18 | 正控通过 |
| `journal-wide` | `688acf707a98` | 无 | 无反例 | `Model checking completed. No error has been found.` | 0 | 17,715,438 / 1,608,409，深度 24 | 182 | 正控通过 |
| `bad-whole-rewrite-p3` | `cdf858e4f7bf` | `WholeRewrite` | `P3_BatchBounded` | `Invariant P3_BatchBounded is violated.` | 12 | 73 / 55 | 1 | 负控命中 |
| `bad-whole-rewrite-p3-repeat` | `725db8d37df3` | `WholeRewrite` | `P3_NoFactRepeated` | `Invariant P3_NoFactRepeated is violated.` | 12 | 58 / 48 | 1 | 负控命中 |
| `bad-whole-rewrite-p4` | `15720702ab55` | `WholeRewrite` | `P4_LinearInSteps` | `Invariant P4_LinearInSteps is violated.` | 12 | 4,489 / 1,641 | 1 | 负控命中 |
| `bad-whole-rewrite-p4-ratio` | `befe4354ccee` | `WholeRewrite` | `P4_RatioBound` | `Invariant P4_RatioBound is violated.` | 12 | 10,577 / 3,416 | 1 | 负控命中 |
| `bad-cache-only-p1` | `3351764934d2` | `CacheOnlyWrite` | `P1_ViewIsFold` | `Invariant P1_ViewIsFold is violated.` | 12 | 190 / 113 | 1 | 负控命中 |
| `bad-cache-only-p5` | `9da4bb776c66` | `CacheOnlyWrite` | `P5_Recovery` | `Action property P5_Recovery is violated.` | 13 | 776 / 382 | 1 | 负控命中 |
| `bad-upsert-p2` | `7ccb8b1722fe` | `UpsertCursor` | `P2_AppendOnly` | `Action property P2_AppendOnly is violated.` | 13 | 168 / 109 | 1 | 负控命中 |
| `bad-retry-reexecute-p6` | `b00d1f21f4bc` | `RetryReexecutes` | `P6_OneBatchPerOp` | `Invariant P6_OneBatchPerOp is violated.` | 12 | 52 / 49 | 0 | 负控命中 |
| `bad-silent-stop` | `e858edad8ed5` | `DriverMarksFailed = FALSE` | `RejectVisible` | `Invariant RejectVisible is violated.` | 12 | 19 / 19 | 1 | 负控命中 |
| `bad-second-position-p1` | `b38f2ba83da4` | `SecondPosition` | `P1_OnePosition` | `Invariant P1_OnePosition is violated.` | 12 | 43 / 39 | 1 | 负控命中 |
| `bad-second-position-facts` | `707c9599fb9f` | `SecondPosition` | `P1_FactsPublished` | `Invariant P1_FactsPublished is violated.` | 12 | 789 / 381 | 1 | 负控命中 |
| `bad-event-without-fact-p7` | `7a0926bd6ef7` | `EventWithoutFact` | `P7_RecordsProjected` | `Invariant P7_RecordsProjected is violated.` | 12 | 41 / 37 | 1 | 负控命中 |

正控检查的性质：`TypeOK`、`P1_ViewIsFold`、`P1_HeadIsTail`、`P1_OnePosition`、`P1_FactsPublished`、`P3_NoFactRepeated`、`P3_BatchBounded`、`P4_LinearInSteps`、`P4_RatioBound`、`P6_OneBatchPerOp`、`P6_AnswerFromBatch`、`P6_RetryAgrees`、`GenGuard`、`RejectVisible`、`P7_RecordsProjected`（不变式），`P2_AppendOnly`、`P5_Recovery`（动作性质）。

负控的状态数是 TLC 找到第一个反例时的读数。多个 worker 时它们在两次运行之间可能不同，反例轨迹也可能不同。判读只看被违反的性质与反例的决定性内容。

TLC 的指纹碰撞估计（`journal`）：乐观 2.7E-8，按实际指纹 4.4E-9。

## 反例的决定性内容

每条负控引用反例里让性质为假的状态，确认命中的是预测的错误，不是别的红。

- `bad-whole-rewrite-p3`：`CommitReceive` 批重带了第 1 批的意图事实与全部三个游标成员，权重超过 `BatchBound`。
- `bad-whole-rewrite-p3-repeat`：同一类轨迹，事实 `("i", 1)` 同时出现在两批。
- `bad-whole-rewrite-p4`、`bad-whole-rewrite-p4-ratio`：整份重写让每批权重随步数增长，累计越过线性界与比值界。
- `bad-cache-only-p1`：`CommitJudge` 折叠进视图却没有追加，视图不等于日志的折叠。
- `bad-cache-only-p5`：`CommitJudge` 只进视图，随后崩溃，`Recover` 折叠出的视图少一批，不等于崩溃前最后一次成功提交留下的视图。
- `bad-upsert-p2`：`CommitJudge` 原地改写日志的最后一批，旧日志不再是新日志的前缀。
- `bad-retry-reexecute-p6`：崩溃、`Recover` 追加 attach 批之后，`RetrySame` 对同一 attach 操作再追加一批，日志里出现两批同 `op`。
- `bad-silent-stop`：存储拒绝，日志为空，`lastCommit = "rejected"` 而槽位仍为 `running`。
- `bad-second-position-p1`：状态 2 的 `Preserve` 由提供者单独发布，`head = 1` 而 `corePub` 仍为 1：核心的下一位置不是发布计数加一。
- `bad-second-position-facts`：状态 2、3 的 `CommitIntend`、`CommitReceive` 把 `corePub` 推到 3，状态 4 的 `Preserve` 把 `head` 推到 3 而 `corePub` 不动，状态 5 的 `CommitJudge` 在 `corePub = 3 <= head` 追加，`Stored` 只存信封，第 1 步的判定事实 `("j", 1)` 不在日志里。这正是实现里的缺陷形状（session-adapters SPEC「位置的唯一来源」）。
- `bad-event-without-fact-p7`：状态 6 的 `Preserve` 追加一批没有事件事实的材料保存，写者却给记录编了一个事件（`records.events = 1`），折叠投影出的事件数为 0，记录不等于投影。这是删桥时实现里出现过的缺陷形状：`recordResult` 到达的 `result.handled` 与 commit 的 `producer` 事实同形，写者只给后者追加事件，而折叠按种类一律当事件；修法是把规则放进折叠一处（`eventOf`，`result.handled.step` 与 `control.stage.step`），提供者按折叠的事件对应本次写入的事件。

## 运行器的自检

为了确认 `run-tlc.sh` 的判读能区分通过与失败，在一份临时副本里把三个期望改错，再运行全部配置：

| 配置 | 改成的期望 | 运行器应判 |
| --- | --- | --- |
| `journal` | 期望 `P1_ViewIsFold` 被违反 | FAIL（实际无反例） |
| `bad-silent-stop` | 期望无反例 | FAIL（实际命中 `RejectVisible`） |
| `bad-upsert-p2` | 期望 `P5_Recovery` 被违反 | FAIL（实际命中的是 `P2_AppendOnly`） |

运行器对这三项都判 FAIL，其余八项判 pass，退出码 1。`journal` 退出 0 且无反例；`bad-silent-stop` 退出 12，命中 `RejectVisible`；`bad-upsert-p2` 退出 13，命中的是 `P2_AppendOnly`。临时副本运行后删除，`$HOME` 下没有残留。

## 与先前运行的关系

2026-11-04 14:35 的运行（模型 SHA-256 `986fabc6…`，十一个负控）在同一环境下结论相同：两个正控完成，负控各命中点名的性质。本次把模型扩到写者的读者记录与投影（`records`、`ProjectOf`、`NewEvents`，K-23 终态 R2-D347）：`journal` 与 `journal-wide` 的状态数与先前相同（新变量由已有状态决定，不增加不同状态），用时 18 / 182 秒。十二个负控里先前的十一个状态数略有变化（多 worker 下找到第一个反例的读数不同），命中的性质与反例内容不变。运行器自检的三项改错在先前运行完成，运行器脚本本次只增加一行 case，判读逻辑未动。

先前的记录：2026-11-04 10:54 的运行（模型 SHA-256 `94636cc6…`，九个负控）在同一环境下结论相同：两个正控完成，负控各命中点名的性质。本次把模型扩到材料保存与位置的唯一来源，`journal` 的状态数从 157,531 / 24,487 增到 2,030,143 / 290,615；`journal-wide` 保持先前范围，状态数相同。运行器自检的三项改错在先前运行完成，本次的案例表只增两行，判读逻辑不变。
