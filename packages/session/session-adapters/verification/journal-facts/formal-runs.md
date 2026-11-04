# Agent 事实族模型的运行记录

本页记录 [JournalOught.tla](models/JournalOught.tla) 的 TLC 运行：版本、参数、预算、结论与判读。判读规则按 [docs/verification.md](../../../../../docs/verification.md#环境与实际执行)：正控要得到 TLC 的完成结论；负控要命中配置点名的那条性质；非零退出本身不算通过。

结论只在所列范围内成立。它不是证明，也不表示实现符合模型。无界推广见 [proofs/README.md](proofs/README.md)。原始日志不进本包，留在任务过程目录。

## 工具与参数

| 项 | 值 |
| --- | --- |
| 运行环境 | WSL 2 `Ubuntu-24.04`，内核 `6.18.33.2-microsoft-standard-WSL2`，24 核，46 GiB。经 `wsl.exe -d Ubuntu-24.04 --exec bash -l <驱动脚本>` 调用。驱动脚本把 `models/` 复制到 WSL 自己的文件系统，再运行 [run-tlc.sh](models/run-tlc.sh)；`run-tlc.sh` 在 `$HOME` 下的新目录里运行 TLC。两处临时目录在运行后删除，删除后核对 `$HOME` 下没有残留 |
| 源码 | 分支 `PanQiWei/rw2-jo-spec`，基线 `4d5a7e0bc` 之上本资源入库前的工作树 |
| JDK | Temurin `21.0.12.1+1` LTS |
| TLC | `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`，即 tla2tools 1.7.4。JAR SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |
| 模型 | `JournalOught.tla` SHA-256 `94636cc61e68b037f26cd3022a150e718da968d4f2a0e0ed5830b1bb7d3b39c6` |
| 参数 | 广度优先；`-workers 8`；`-Xmx6g`；`-XX:+UseParallelGC`；`-deadlock`（不把终止状态当错误：槽位 `failed` 与跑完 `MaxSteps` 都是合法终止）；每个配置单独 `-metadir` |
| 预算 | 每配置 1200 秒。全部在预算内结束，没有缩小规模 |
| 判定 | `run-tlc.sh` 的退出码只由控制决定。本次退出 0 |
| 时间 | 2026-11-04 10:54 至 10:58（北京时间） |

常量（`journal.cfg`）：`MaxSteps = 3`，`Members = {"step","position","calls"}`，`C0 = 1`，`WMember = 1`，`WFact = 2`，`LogMin = 4`，`LogBig = 30`，`MaxCrashes = 1`，`MaxRejects = 1`，`MaxRetries = 1`。四个错误开关全为 FALSE，`DriverMarksFailed = TRUE`，这是设计本身。`journal-wide.cfg` 把 `MaxSteps`、`MaxCrashes`、`MaxRetries` 放大到 4、2、2。负控与 `journal.cfg` 常量相同，只翻一个开关，只检查点名的那条性质。

## 运行结果

| 配置 | 配置 SHA-256（前 12 位） | 开关 | 期望 | TLC 结论行 | 退出码 | 生成 / 不同状态 | 用时（秒） | 判读 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `journal` | `7a2bdcf44c3a` | 无 | 无反例 | `Model checking completed. No error has been found.` | 0 | 157,531 / 24,487，深度 17 | 2 | 正控通过 |
| `journal-wide` | `af65354fd791` | 无 | 无反例 | `Model checking completed. No error has been found.` | 0 | 17,715,438 / 1,608,409，深度 24 | 157 | 正控通过 |
| `bad-whole-rewrite-p3` | `e7b7118abf4f` | `WholeRewrite` | `P3_BatchBounded` | `Invariant P3_BatchBounded is violated.` | 12 | 33 / 27 | 1 | 负控命中 |
| `bad-whole-rewrite-p3-repeat` | `7a3c257690a2` | `WholeRewrite` | `P3_NoFactRepeated` | `Invariant P3_NoFactRepeated is violated.` | 12 | 32 / 26 | 2 | 负控命中 |
| `bad-whole-rewrite-p4` | `e21458464436` | `WholeRewrite` | `P4_LinearInSteps` | `Invariant P4_LinearInSteps is violated.` | 12 | 1,870 / 675 | 1 | 负控命中 |
| `bad-whole-rewrite-p4-ratio` | `27c43e4b9134` | `WholeRewrite` | `P4_RatioBound` | `Invariant P4_RatioBound is violated.` | 12 | 2,220 / 759 | 2 | 负控命中 |
| `bad-cache-only-p1` | `a282c98f11cb` | `CacheOnlyWrite` | `P1_ViewIsFold` | `Invariant P1_ViewIsFold is violated.` | 12 | 106 / 64 | 1 | 负控命中 |
| `bad-cache-only-p5` | `b6608b927269` | `CacheOnlyWrite` | `P5_Recovery` | `Action property P5_Recovery is violated.` | 13 | 467 / 224 | 1 | 负控命中 |
| `bad-upsert-p2` | `06b0a765b41a` | `UpsertCursor` | `P2_AppendOnly` | `Action property P2_AppendOnly is violated.` | 13 | 70 / 48 | 1 | 负控命中 |
| `bad-retry-reexecute-p6` | `0ef96595816e` | `RetryReexecutes` | `P6_OneBatchPerOp` | `Invariant P6_OneBatchPerOp is violated.` | 12 | 44 / 42 | 1 | 负控命中 |
| `bad-silent-stop` | `0238b5728db4` | `DriverMarksFailed = FALSE` | `RejectVisible` | `Invariant RejectVisible is violated.` | 12 | 19 / 19 | 1 | 负控命中 |

正控检查的性质：`TypeOK`、`P1_ViewIsFold`、`P1_HeadIsTail`、`P3_NoFactRepeated`、`P3_BatchBounded`、`P4_LinearInSteps`、`P4_RatioBound`、`P6_OneBatchPerOp`、`P6_AnswerFromBatch`、`P6_RetryAgrees`、`GenGuard`、`RejectVisible`（不变式），`P2_AppendOnly`、`P5_Recovery`（动作性质）。

负控的状态数是 TLC 找到第一个反例时的读数。多个 worker 时它们在两次运行之间可能不同，反例轨迹也可能不同。判读只看被违反的性质与反例的决定性内容。

TLC 的指纹碰撞估计（`journal`）：乐观 1.8E-10。

## 反例的决定性内容

每条负控引用反例里让性质为假的状态，确认命中的是预测的错误，不是别的红。

- `bad-whole-rewrite-p3`：状态 3 的 `CommitReceive` 批重带了第 1 批的意图事实与全部三个游标成员，权重 8 超过 `BatchBound` 6。
- `bad-whole-rewrite-p3-repeat`：同一类轨迹，事实 `("i", 1)` 同时出现在第 1 批与第 2 批。
- `bad-whole-rewrite-p4`、`bad-whole-rewrite-p4-ratio`：整份重写让每批权重随步数增长，累计越过线性界与比值界。
- `bad-cache-only-p1`：`CommitJudge` 折叠进视图却没有追加，视图不等于日志的折叠。
- `bad-cache-only-p5`：状态 4 的 `CommitJudge` 只进视图，状态 5 崩溃，状态 6 的 `Recover` 折叠出的视图少一批，不等于崩溃前最后一次成功提交留下的视图。
- `bad-upsert-p2`：状态 4 的 `CommitJudge` 原地改写日志的最后一批，旧日志不再是新日志的前缀。
- `bad-retry-reexecute-p6`：状态 3 崩溃，状态 4 的 `Recover` 追加 attach 批，状态 5 的 `RetrySame` 对同一 attach 操作再追加一批，日志里出现两批同 `op`。
- `bad-silent-stop`：状态 2 存储拒绝，日志为空，`lastCommit = "rejected"` 而槽位仍为 `running`。

## 运行器的自检

为了确认 `run-tlc.sh` 的判读能区分通过与失败，在一份临时副本里把三个期望改错，再运行全部配置：

| 配置 | 改成的期望 | 运行器应判 |
| --- | --- | --- |
| `journal` | 期望 `P1_ViewIsFold` 被违反 | FAIL（实际无反例） |
| `bad-silent-stop` | 期望无反例 | FAIL（实际命中 `RejectVisible`） |
| `bad-upsert-p2` | 期望 `P5_Recovery` 被违反 | FAIL（实际命中的是 `P2_AppendOnly`） |

运行器对这三项都判 FAIL，其余八项判 pass，退出码 1。`journal` 退出 0 且无反例；`bad-silent-stop` 退出 12，命中 `RejectVisible`；`bad-upsert-p2` 退出 13，命中的是 `P2_AppendOnly`。临时副本运行后删除，`$HOME` 下没有残留。

## 与先前运行的关系

同一模型与配置在设计阶段跑过一次，结论与本次相同：两个正控完成搜索且状态数相同，九个负控各命中点名的性质。本页只记本次入库后的运行。
