# 受理与结果推送模型的运行记录

本页记录 [Admission.tla](Admission.tla) 与 [ResultPush.tla](ResultPush.tla) 的 TLC 运行、守卫的变异负控和需要确认的点。性质与映射见 [formal-mapping.md](formal-mapping.md)。

结论只在所列常量范围内成立。它不是证明，也不表示源码符合模型。原始日志不进本包，保存在任务过程目录。

## 工具与参数

| 项 | 值 |
| --- | --- |
| 运行环境 | WSL 2 `Ubuntu-24.04`。入口 [run-tlc.sh](run-tlc.sh)，它把模型和配置复制到 WSL 自己的文件系统再跑，日志写回任务目录 |
| JDK | OpenJDK `21.0.12.1` LTS（Temurin） |
| TLC | `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`，即 tla2tools 1.7.4。JAR SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |
| 参数 | 广度优先；`-workers 4`；`-Xmx4g`；`-XX:+UseParallelGC`；`-deadlock` |
| 预算 | 每个配置 600 秒。全部在 5 秒内结束，没有缩小范围 |
| 判读 | 正控看 `Model checking completed. No error has been found.`。负控看 `Invariant <名> is violated` 或 `Action property <名> is violated` 的名字是否就是配置点名的那条。活性负控只声明一条性质，看 `Temporal properties were violated`。退出码只作参考 |
| 运行时间 | 2026-11-04（北京时间） |

输入摘要：`Admission.tla` SHA-256 `d3ee9d6f43d5c384753b09eca02594dce2f7be708c00b7dd7570b48700425631`，`ResultPush.tla` SHA-256 `fafa320a305b6d4f43f9c25435622c734679d5135828a7ec150ced22447a6d19`。

常量：Admission 为 Share 10、Other 6、CapBig 5、CapSmall 3、MaxWrites 2、MaxUnknown 2。ResultPush 为 MaxRedeliveries 1、MaxAccounts 2、MaxPending 1、RefusalsInPlay TRUE；`push-wide` 为 2、3、2；`LiveSpec` 的配置 RefusalsInPlay 为 FALSE。

## Admission

| 配置 | 期望 | 结论 | 生成 / 不同状态 | 深度 | 判读 |
| --- | --- | --- | --- | --- | --- |
| `admission` | 无反例 | 无反例 | 221 / 106 | 12 | 正控：六条不变量与 `RecordImmutable` |
| `bad-recall-ignores-unknown-once` | `OneAcceptedPerWork` | 同名违反 | 357 / 175 | 9 | 命中：未决写期间 recall 答 not-accepted，调用方换 c2 受理，随后 c1 落地，两条记录 |
| `bad-recall-ignores-unknown-authority` | `NotAcceptedIsAuthoritative` | 同名违反 | 231 / 110 | 8 | 命中 |
| `bad-admit-upserts` | `RecordImmutable` | 动作性质违反 | 39 / 27 | 6 | 命中 |
| `bad-capacity-ignored` | `CapacityHonest` | 同名违反 | 86 / 45 | 6 | 命中 |
| `bad-truncate-capacity` | `CapacityHonest` | 同名违反 | 69 / 40 | 6 | 命中 |
| `bad-truncate-write` | `NoSilentTruncation` | 同名违反 | 165 / 84 | 8 | 命中 |
| `bad-tenant-leak` | `TenantIsolation` | 同名违反 | 19 / 18 | 4 | 命中 |

## ResultPush

| 配置 | 期望 | 结论 | 生成 / 不同状态 | 深度 | 判读 |
| --- | --- | --- | --- | --- | --- |
| `push` | 无反例 | 无反例 | 17,958 / 5,574 | 17 | 正控：十一条不变量与两条动作性质 |
| `push-wide` | 无反例 | 无反例 | 607,015 / 130,872 | 23 | 正控，放大范围 |
| `push-live` | 无反例 | 无反例 | 7,709 / 2,868 | 15 | 正控：`EventuallyReleased`、`AccountsEventuallySaved`、`AccountsEventuallyAccepted` |
| `bad-ack-without-saved` | `AckNeedsSaved` | 同名违反 | 119 / 60 | 4 | 命中 |
| `bad-ack-without-adapter` | `AckNeedsAdapter` | 同名违反 | 189 / 87 | 5 | 命中 |
| `bad-release-before-ack` | `ReleaseNeedsAck` | 同名违反 | 162 / 74 | 5 | 命中 |
| `bad-foreign-receipt-saved` | `SavedReceiptMatches` | 同名违反 | 90 / 52 | 4 | 命中 |
| `bad-refusal-overwrites-unknown` | `UnknownOnlyToSaved` | 动作性质违反 | 108 / 58 | 4 | 命中 |
| `bad-refusal-loses-receiver` | `SavedReceiverNotLost` | 同名违反 | 222 / 127 | 5 | 命中 |
| `bad-repush-saved` | `SavedIsFinal` | 动作性质违反 | 752 / 374 | 7 | 命中 |
| `bad-retry-on-unavailable` | `PushesPerWakeBounded` | 同名违反 | 430 / 216 | 6 | 命中 |
| `bad-accept-without-reservation` | `PendingAccountsBounded` | 同名违反 | 82 / 38 | 3 | 命中 |
| `bad-reservation-never-released` | `ReservationsMatch` | 同名违反 | 232 / 100 | 5 | 命中 |
| `bad-keep-body` | `BodyDroppedAfterRelease` | 同名违反 | 311 / 148 | 6 | 命中 |
| `bad-accounts-before-saved` | `AccountsAfterResultSaved` | 同名违反 | 160 / 71 | 4 | 命中 |
| `bad-live-waiting-not-due` | `EventuallyReleased` | 时序性质违反 | 7,544 / 2,910 | 轨迹 7 | 命中 |
| `bad-live-reservation-never-released` | `AccountsEventuallyAccepted` | 时序性质违反 | 2,907 / 1,062 | 轨迹 10 | 命中：名额永不归还，第二个晚账永远进不来 |

`bad-live-reservation-never-released` 最初点名 `AccountsEventuallySaved`，那时空过：名额卡死时第二个账目根本进不了待交付，蕴含式平凡成立。改为点名 `AccountsEventuallyAccepted`，并在公平性里加入 `WF_vars(AcceptAccount)` 之后命中。`push-live` 在同样的公平性下通过。

负控的状态数和深度是找到第一个反例时的读数。多个 worker 时，两次运行之间可能不同。

## 守卫的变异负控

每个变异改一处源码，重新构建 `@omne-harness/model`，运行对应守卫，再还原并重新构建。

| 变异 | 改了什么 | 运行的守卫 | 结果 |
| --- | --- | --- | --- |
| N1 | `commands.ts` 的 `recall` 不看同身份的未决写 | `admission-guards.spec.ts` | 三个枚举用例全红 |
| N2 | `commands.ts` 的 `admit` 不做份额检查 | `admission-guards.spec.ts` | 份额用例变红 |
| N3 | `runtime.ts` 的 `push` 在 unavailable 与 backpressured 后继续重推 | `runtime-push-bounds.spec.ts` | 两个拒绝用例变红 |
| N4 | `runtime.ts` 的 `clean` 不看 ACK | `runtime-push.spec.ts` | 没有变红。不可观察的变异，见映射页 |
| N5 | `runtime.ts` 的 `recordLateFact` 不检查晚账名额 | `runtime-push.spec.ts` | 两个晚账用例变红 |

## 需要确认的点

没有发现实现违背所选性质的反例。下面两点需要拥有者确认。

- **D1 SQL Commands 的未决写。** 模型的 `pending` 效果（写在 recall 之后才落地）在内存 Commands 里不存在：内存的未决写立即可见。SQL Commands 的「排队、旧写者和数据库恢复均排除」是否保证排除前 recall 一定答 `commit-unknown`，本次没有核对代码。`bad-recall-ignores-unknown-once` 说明这条必须成立：not-accepted、换身份、旧写落地，导致双受理与双计费。建议拥有者：model-storage-sql。守卫应对 SQL 实现也运行，不只对内存实现。
- **D2 被拒交付的进展（已知限制的形式化）。** `denied`、`invalid`、`conflict` 使交付 `failed`，之后不自动重推，份额与名额因此可能一直占住。model-host-local SPEC 已把它列为已知限制。模型里 `push-live` 必须设 `RefusalsInPlay = FALSE` 才能证明进展，这正是该限制的前提。外来回执（receipt-mismatch）同样记为 `failed`，模型把它归为拒绝一类。重启后补推的实现合入后，要核对它是否也接续 `failed` 的交付。

## 未执行

- 两个守卫没有对 SQL Commands 运行。
- N4 的可观察版本（同时变异 Commands 的清理前提）没有做。

## SendBoundary

工具与参数同上。运行时间 2026-11-04（北京时间）。`SendBoundary.tla` SHA-256 `52ae8278ba9d4979cf872244a8041a8c0c8ae5106d35bbbf055dd88dab7efb22`。常量：`MaxFaults` 为 2（`send-wide` 为 4）；`Resolutions` 为 value、absent、unreadable、denied，`known-send-unavailable-waits` 为 value、absent、unavailable。

| 配置 | 期望 | 结论 | 生成 / 不同状态 | 深度或轨迹 | 判读 |
| --- | --- | --- | --- | --- | --- |
| `send` | 无反例 | 无反例 | 2,179 / 957 | 深度 12 | 正控：三条不变量与 `FinalDecided`、`FinalSettlesUnlessStolen` |
| `send-wide` | 无反例 | 无反例 | 3,851 / 1,669 | 深度 16 | 正控，放大故障次数 |
| `send-retry-new-op-window` | 无反例 | 无反例 | 3,265 / 1,407 | 深度 13 | 正控：只换 operation 时窗口守卫守住 `AtMostOneTerminal` |
| `bad-send-rejection-unavailable` | `FinalDecided` | 时序性质违反 | 2,179 / 957 | 轨迹 10 | 命中 N1：接管后 not-sent 记录被拒，答 `unavailable`，driver 停在 `failed-unavail` |
| `bad-send-release-overrides` | `FinalDecided` | 时序性质违反 | 2,383 / 1,065 | 轨迹 9 | 命中 |
| `bad-send-read-failure-drops` | `FinalDecided` | 时序性质违反 | 2,215 / 981 | 轨迹 11 | 命中 N2：终止已写，读记录失败一次，driver 落成 `failed-unavail` |
| `bad-send-retry-new-op` | `AtMostOneTerminal` | 同名违反 | 1,014 / 507 | 轨迹 6 | 命中 |
| `bad-send-re-resolve` | `NoCredFailureAfterStart` | 同名违反 | 2,184 / 1,065 | 轨迹 8 | 命中：start 后记录丢失，解绑，重试重新解析得 absent，写了 credential 终止 |
| `known-send-unavailable-waits` | `RefusalDecided` | 时序性质违反 | 1,377 / 700 | 轨迹 8 | 已知反例：凭据端口答 `unavailable` 的调用一直等，见 Model SPEC 出口表 |
