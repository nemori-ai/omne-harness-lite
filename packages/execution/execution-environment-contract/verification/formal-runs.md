# 进程归属与终端段模型的运行记录

本页是 [ProcessCustody.tla](models/ProcessCustody.tla) 与 [TerminalSegments.tla](models/TerminalSegments.tla) 的 TLC 运行索引。每次运行写明输入摘要、工具版本、参数、输出与判读。原始日志不进本包，保存在运行者的任务过程目录。规模上限与映射见 [formal-mapping.md](formal-mapping.md)，判读规则见 [models/README.md](models/README.md#判读)。

本页的结论只在所列规模上限内成立。它不是证明，也不表示实现符合模型。

## 2026-11-05：提交 `2959f5d2c`

### 工具与参数

| 项 | 值 |
| --- | --- |
| 运行环境 | Linux 5.15 宿主，8 核。在提交 `2959f5d2c` 的工作树上运行，模型、配置与脚本都已提交 |
| 命令 | `JAVA_BIN=<JDK 21> TLA2TOOLS_JAR=<tla2tools.jar> TLC_WORKERS=6 packages/execution/execution-environment-contract/verification/models/run-tlc.sh <输出目录>` |
| JDK | Temurin 21.0.12.1+1 |
| TLC | `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`，即 tla2tools 1.7.4。JAR SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |
| 参数 | 广度优先模型检查；`-workers 6`；`-Xmx6g`；`-XX:+UseParallelGC`；`-deadlock`（不检查死锁，与配置中的 `CHECK_DEADLOCK FALSE` 一致） |
| 预算 | 每个配置 1800 秒（脚本中的 `timeout`）。全部运行在预算内结束，最长 5 秒，没有缩小规模 |
| 用时 | 全部 26 项共 41 秒 |
| 结论 | `failures=0`，脚本退出 0 |

输入摘要（SHA-256 前 12 位）：

| 文件 | SHA-256 |
| --- | --- |
| `ProcessCustody.tla` | `375e1a61e5a2` |
| `TerminalSegments.tla` | `28b7ef818ffa` |
| `run-tlc.sh` | `dbefbbea2121` |

### 正控

| 配置 | 配置 SHA-256 | 不同状态数 | 生成状态数 | 深度 | 判读 |
| --- | --- | --- | --- | --- | --- |
| `ProcessCustody` | `40338cb5d76d` | 41944 | 285851 | 19 | 符合预期 |
| `ProcessCustody-unbound` | `f753225a9a17` | 18900 | 132689 | 16 | 符合预期 |
| `ProcessCustody-live` | `b1b6d03946b1` | 13648 | 102515 | 18 | 符合预期，三条活性成立 |
| `ProcessCustody-inductive` | `872242cf20e9` | 4320 个初始状态 | 26714 | 1 | 符合预期，走一步后 `IndInv` 仍成立 |
| `TerminalSegments` | `1ff5fdf59d00` | 28073 | 59922 | 37 | 符合预期 |

### 负控

| 配置 | 配置 SHA-256 | 预期违反 | 实际违反 | 不同状态数 | 判读 |
| --- | --- | --- | --- | --- | --- |
| `ProcessCustody-unsafe-stop`（N1） | `b96a0fab460f` | `KeepWhenPermitted` | `KeepWhenPermitted` | 354 | 符合预期 |
| `ProcessCustody-unsafe-pgroup`（N2） | `fc256d283b13` | `NoLeak` | `NoLeak` | 155 | 符合预期 |
| `ProcessCustody-unsafe-evict`（N3） | `bc2287687eba` | `NoEviction` | `NoEviction` | 15543 | 符合预期 |
| `ProcessCustody-unsafe-enum`（N4） | `4303fa70c251` | `ClosureTruth` 或 `SettleTruth` | `SettleTruth` | 956 | 符合预期 |
| `ProcessCustody-unsafe-commit-closed`（N5） | `d0b0496ba9c3` | `NoEntryAfterClose` | `NoEntryAfterClose` | 2025 | 符合预期 |
| `ProcessCustody-unsafe-commit-phase`（N6） | `4ed2b3a64d71` | `OneDisposition` | `OneDisposition` | 1773 | 符合预期 |
| `ProcessCustody-unsafe-hangup`（N10） | `b8c64fd4aec5` | `KeepWhenPermitted` | `KeepWhenPermitted` | 338 | 符合预期 |
| `TerminalSegments-unsafe-eagain`（N7） | `4e617f4a79a2` | `FgInSegment` | `FgInSegment` | 495 | 符合预期 |
| `TerminalSegments-unsafe-quiet`（N8） | `6b22cd087e92` | `CompletionTruth` | `CompletionTruth` | 37 | 符合预期 |
| `TerminalSegments-unsafe-invalidate`（N9） | `a8cab3e22286` | `StaysValid` | `StaysValid` | 1151 | 符合预期 |

负控的反例就是设计中预想的竞态。例如 N5 的轨迹是 `PlanAcq → Launch → PrimExit → Dispose → CloseScope → Commit`：处置在封闭之前预留，提交在封闭之后发生。N7 的轨迹是前台写出字节、前台退出、结束帧到达，而最后的字节在提供者读到暂时无数据之后才可读。

### 可达见证

| 见证 | 不同状态数 | 判读 |
| --- | --- | --- |
| `ProcessCustody-witness-NeverRetainedAlive` | 481 | 被违反，可达 |
| `ProcessCustody-witness-NeverRetainedOutlivesAcq` | 5383 | 被违反，可达 |
| `ProcessCustody-witness-NeverSelfSettled` | 3004 | 被违反，可达 |
| `ProcessCustody-witness-NeverClosedAfterCrash` | 1071 | 被违反，可达 |
| `ProcessCustody-witness-NeverSettledAfterCrash` | 725 | 被违反，可达 |
| `ProcessCustody-witness-NeverFullAndStopped` | 23482 | 被违反，可达 |
| `ProcessCustody-witness-NeverRetainedTerminalClosed` | 310 | 被违反，可达 |
| `TerminalSegments-witness-NeverBgInSegment` | 523 | 被违反，可达 |
| `TerminalSegments-witness-NeverGapByte` | 1816 | 被违反，可达 |
| `TerminalSegments-witness-NeverAllCompleted` | 9307 | 被违反，可达 |
| `TerminalSegments-witness-NeverFgInLaterSegment` | 4607 | 被违反，可达 |
