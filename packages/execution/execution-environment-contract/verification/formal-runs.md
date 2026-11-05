# 进程归属与终端段模型的运行记录

本页是 [ProcessCustody.tla](models/ProcessCustody.tla) 与 [TerminalSegments.tla](models/TerminalSegments.tla) 的 TLC 运行索引。包内只放索引摘要：输入摘要、工具版本、参数、读数与判读。原始日志不进本包，保存在运行者工作树的 `tmp/`。规模上限与映射见 [formal-mapping.md](formal-mapping.md)，判读规则见 [models/README.md](models/README.md#判读)。

本页的结论只在所列规模上限内成立。它不是证明，也不表示实现符合模型。

## 2026-11-05：加入负控 N4b 之后

### 工具与参数

| 项 | 值 |
| --- | --- |
| 运行环境 | Linux 5.15 宿主，8 核 |
| 命令 | `JAVA_BIN=<JDK 21> TLA2TOOLS_JAR=<tla2tools.jar> TLC_WORKERS=6 packages/execution/execution-environment-contract/verification/models/run-tlc.sh <输出目录>` |
| JDK | Temurin 21.0.12.1+1 |
| TLC | `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`，即 tla2tools 1.7.4。JAR SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |
| 参数 | 广度优先模型检查；`-workers 6`；`-Xmx6g`；`-XX:+UseParallelGC`；`-deadlock`（不检查死锁，与配置中的 `CHECK_DEADLOCK FALSE` 一致） |
| 预算 | 每个配置 1800 秒（脚本中的 `timeout`）。全部运行在预算内结束，没有缩小规模 |
| 结论 | 27 项全部符合预期，`failures=0`，脚本退出 0 |

输入摘要（SHA-256 前 12 位）：

| 文件 | SHA-256 |
| --- | --- |
| `ProcessCustody.tla` | `375e1a61e5a2` |
| `TerminalSegments.tla` | `28b7ef818ffa` |
| `run-tlc.sh` | `dbefbbea2121` |

### 正控

正控穷举全部可达状态，读数与 worker 数无关，可以复现。

| 配置 | 配置 SHA-256 | 不同状态数 | 生成状态数 | 深度 | 判读 |
| --- | --- | --- | --- | --- | --- |
| `ProcessCustody` | `40338cb5d76d` | 41944 | 285851 | 19 | 符合预期 |
| `ProcessCustody-unbound` | `f753225a9a17` | 18900 | 132689 | 16 | 符合预期 |
| `ProcessCustody-live` | `b1b6d03946b1` | 13648 | 102515 | 18 | 符合预期，三条活性成立 |
| `ProcessCustody-inductive` | `872242cf20e9` | 4320 个初始状态 | 26714 | 1 | 符合预期，走一步后 `IndInv` 仍成立 |
| `TerminalSegments` | `1ff5fdf59d00` | 28073 | 59922 | 37 | 符合预期 |

### 负控

TLC 在第一个违反处停止，所以下表的状态数随 worker 数与调度变化，只属于这一次运行，不能用来比对。判读只看违反的性质。

| 配置 | 配置 SHA-256 | 预期违反 | 实际违反 | 判读 |
| --- | --- | --- | --- | --- |
| `ProcessCustody-unsafe-stop`（N1） | `b96a0fab460f` | `KeepWhenPermitted` | `KeepWhenPermitted` | 符合预期 |
| `ProcessCustody-unsafe-pgroup`（N2） | `fc256d283b13` | `NoLeak` | `NoLeak` | 符合预期 |
| `ProcessCustody-unsafe-evict`（N3） | `bc2287687eba` | `NoEviction` | `NoEviction` | 符合预期 |
| `ProcessCustody-unsafe-enum`（N4） | `4303fa70c251` | `ClosureTruth` 或 `SettleTruth` | `SettleTruth` | 符合预期 |
| `ProcessCustody-unsafe-enum-closure`（N4b） | `c870d1a0455e` | `ClosureTruth` | `ClosureTruth` | 符合预期 |
| `ProcessCustody-unsafe-commit-closed`（N5） | `d0b0496ba9c3` | `NoEntryAfterClose` | `NoEntryAfterClose` | 符合预期 |
| `ProcessCustody-unsafe-commit-phase`（N6） | `4ed2b3a64d71` | `OneDisposition` | `OneDisposition` | 符合预期 |
| `ProcessCustody-unsafe-hangup`（N10） | `b8c64fd4aec5` | `KeepWhenPermitted` | `KeepWhenPermitted` | 符合预期 |
| `TerminalSegments-unsafe-eagain`（N7） | `4e617f4a79a2` | `FgInSegment` | `FgInSegment` | 符合预期 |
| `TerminalSegments-unsafe-quiet`（N8） | `6b22cd087e92` | `CompletionTruth` | `CompletionTruth` | 符合预期 |
| `TerminalSegments-unsafe-invalidate`（N9） | `a8cab3e22286` | `StaysValid` | `StaysValid` | 符合预期 |

负控的反例就是设计中预想的竞态。例如 N5 的轨迹是 `PlanAcq → Launch → PrimExit → Dispose → CloseScope → Commit`：处置在封闭之前预留，提交在封闭之后发生。N7 的轨迹是前台写出字节、前台退出、结束帧到达，而最后的字节在提供者读到暂时无数据之后才可读。N4 的轨迹是 `PlanAcq → Crash → Recover → Settle`：恢复只认回一部分执行域，却当作完整，获取就结清了。

### 可达见证

见证同样在第一个违反处停止，判读只看是否被违反。

| 见证 | 判读 |
| --- | --- |
| `ProcessCustody-witness-NeverRetainedAlive` | 被违反，可达 |
| `ProcessCustody-witness-NeverRetainedOutlivesAcq` | 被违反，可达 |
| `ProcessCustody-witness-NeverSelfSettled` | 被违反，可达 |
| `ProcessCustody-witness-NeverClosedAfterCrash` | 被违反，可达 |
| `ProcessCustody-witness-NeverSettledAfterCrash` | 被违反，可达 |
| `ProcessCustody-witness-NeverFullAndStopped` | 被违反，可达 |
| `ProcessCustody-witness-NeverRetainedTerminalClosed` | 被违反，可达 |
| `TerminalSegments-witness-NeverBgInSegment` | 被违反，可达 |
| `TerminalSegments-witness-NeverGapByte` | 被违反，可达 |
| `TerminalSegments-witness-NeverAllCompleted` | 被违反，可达 |
| `TerminalSegments-witness-NeverFgInLaterSegment` | 被违反，可达 |

### 更早的运行

同日在提交 `2959f5d2c`（还没有 N4b）上跑过 26 项，全部符合预期，正控读数与上表相同。
