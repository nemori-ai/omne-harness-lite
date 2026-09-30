# ACK 接缝 revision 2：v-next 暂存行扩展模型的 TLC 运行

2026-09-30，spec-drafter 在 spoke `panqiwei/model-request-runtime-ack-seam-revision` 实际执行；归档时源码头 `c09d2485`。**被检查的是 v-next candidate 模型**（[`spec/capabilities/model-request-runtime/v-next/formal/AckLifecycle.tla`](../../../spec/capabilities/model-request-runtime/v-next/formal/AckLifecycle.tla)，SHA-256 `2d61138fe3390064bf2d76e3a065b643e17601948de6878128671db9fd29eb45`，逐字节保全在 [inputs/AckLifecycle.tla](inputs/AckLifecycle.tla)），**不是 v12 冻结模型的重跑**；v12 的 `AckLifecycle.tla` 与八份变异本轮未执行，其结论仍以 [2026-09-29 归档](../2026-09-29-model-call-ack-candidate/README.md)为准。十二份配置都不是已登记的 formal task，A/B 是预期出反例的否定配置。

依据：[接缝 revision 2](../../proposals/model-runtime-reference-lifecycle/ack-post-confirmation-settlement.md) R1/R2 与[评审页](../../proposals/model-runtime-reference-lifecycle/ack-seam-review.md)；模型相对 v12 改了什么、每条断言检查哪条条款见 [v-next formal README](../../../spec/capabilities/model-request-runtime/v-next/formal/README.md)。

## 工具与命令

TLC2 Version 2026.09.12.025210 (rev: 867aefb)，`/opt/tlaplus/tla2tools.jar`（SHA-256 `db131ddb48e7004d823bef4493df7b35694babe37505b9d9fa5685e7a331f1f1`），OpenJDK Temurin 21.0.12.1+1，`-workers 8`，本机 8 核。每份配置在独立的临时目录里以 `/usr/local/bin/tlc -workers 8 -config run.cfg AckLifecycle.tla` 执行（该脚本展开为 `java -XX:+UseParallelGC -cp /opt/tlaplus/tla2tools.jar tlc2.TLC …`），stdout 与 stderr 合并保存为各目录的 `stdout-stderr.log`；`run.cfg` 是实际使用的配置（与 `v-next/formal/` 中同名文件逐字节相同），`exit.code` 是实际退出码，`result.json` 记 argv、退出码、状态数、命中的不变量与输入摘要。汇总在 [formal-results.json](formal-results.json)，逐文件摘要在 [manifest.json](manifest.json)。

## 结果

| 目录 | 配置 | 预期 | 实际 |
|---|---|---|---|
| `AckLifecycle/` | `Spec`，13 条不变量 | 无反例 | exit 0；32617 generated / 8384 distinct |
| `AckProgress/` | `FairSpec` + `EventuallyReleased`、`EventuallyDropTemp` | 无反例 | exit 0；32617 generated / 8384 distinct |
| `Ack-staleTemp/` | 反例 A：去掉「追加前暂存行须持有将追加批」守卫 | `RecoveredMatchesFinal` 反例 | exit 12，命中；trace：StartSettlement→Reconstruct→BeginAppend（暂存仍 gen 0）→AppendLands（final gen 1） |
| `Ack-absenceUnreadable/` | 反例 B：不可读时判零写并结束 | `EndedMeansAbsent` 反例 | exit 12，命中；trace：OldFinal→StopNew→Crash→Recover（不可读）→PresumeAbsent |
| `Ack-ackFirst/` `Ack-admission/` `Ack-atomic/` `Ack-drain/` `Ack-missing/` `Ack-sum/` `Ack-tamper/` `Ack-temporaryBatch/` | v12 原八份变异，逐字节复制 | 各命中原目标不变量 | 各 exit 12，命中 AckBeforeDelete / AdmissionClosed / AtomicDeletion / WriterDrained / OldRefVisible / OneAccount / RetainedIntegrity / RecoverableBatch |

## 边界

常量：两个 call、两个 consumer、单 Focus、单 AckConsumer；至多一次 crash；恢复后暂存行/日志可能一次不可读。追加生效抽象为一步；`Reconstruct` 不要求先有一次已确认零写；「回执未知期间禁止覆盖」只是 `UpdateTemp` 的守卫，未设变异；R3 的删除重试、R4 的资格重核、反例 C–E 未建模。进展性质只在 `Recover`、`LogUp`、`StopOld`、`StopAckWriter`、`ConfirmAck`、`Delete`、`EndRead`、`Receipt`、`StopNew`、`RecoveryRead`、`EndSettlement`、`DropTemp` 弱公平下成立。不证明真实字节、SQL/JSONL 耐久、权限来源、密码学或任何实现。通过不提升接缝或 v-next 的状态；正配置未登记 formal task。
