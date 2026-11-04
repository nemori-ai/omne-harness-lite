# 受理与结果推送：性质、模型与实现的对应

本页说明 [Admission.tla](Admission.tla) 与 [ResultPush.tla](ResultPush.tla) 守住哪些性质，模型的变量和动作对应哪些源码，以及每条性质的机读守卫。运行记录见 [formal-runs.md](formal-runs.md)，无界推广见 [proofs](../proofs/README.md)。

模型检查只说明有限范围内的设计性质。它不证明源码精化。实现在 `@omne-harness/model`（Commands）与 `@omne-harness/model-host-local`（结果推送插件）。

## 性质表

| 编号 | 性质 | 出处 | 违背后果 | 原来靠什么守 | 现在怎么守 |
| --- | --- | --- | --- | --- | --- |
| P1 | 受理至多一次：同身份同输入重入认回；换 operation 答 conflict；`not-accepted` 只在没有记录、也没有未决写时返回 | [SPEC](../../SPEC.md)「调用和各次真实发出」受理表、「结果、失败和状态」 | 调用方在 commit-unknown 期间被告知 not-accepted，换新身份重发，旧写随后落地：一个工作两次真实发出、两次计费 | 个别用例 | `OneAcceptedPerWork`、`NotAcceptedIsAuthoritative`、`RecordImmutable`；守卫 `admission-guards.spec.ts` |
| P2 | 保管链：ACK 只对 saved 的结果发；acknowledged 必须经 owner 的证据适配器确认（R2-D257）；清理与份额释放只在 ACK 之后；saved 只认原键原 owner 的回执；unknown 只被 saved 取代；saved 终态；已保存的接收方不会被遗忘；账目只在结果 saved 之后推 | SPEC「saved 到 ACK 及清理」「ACK 的前提与效果」「清理范围与读写保护」「晚到账目与有界保管」；model-host-local SPEC「运行门面与结果推送」 | 份额在 ACK 前释放，唯一副本丢失；伪证据接管；接收方已保存的结果永远不再推 | `runtime-push.spec.ts` 的场景用例 | `AckNeedsSaved`、`AckNeedsAdapter`、`ReleaseNeedsAck`、`SavedReceiptMatches`、`SavedReceiverNotLost`、`UnknownOnlyToSaved`、`SavedIsFinal`、`AccountsAfterResultSaved`；守卫为现有 `runtime-push.spec.ts` 的场景用例 |
| P3 | 每次唤醒的推送工作量有界：一个交付至多推 `1 + maxRedeliveries` 次；`unavailable`、`backpressured`、`cancelled-before-accept` 与无接收方只等下一次唤醒（R2-D273） | model-host-local SPEC「推送与回执」 | 热循环，CPU 与日志被打满 | 只有代码结构 | `PushesPerWakeBounded`；守卫 `runtime-push-bounds.spec.ts`；[证明](../proofs/README.md#p3-每次唤醒的推送次数) |
| P4 | 推送台账有界：接纳晚账前先占名额，待交付晚账不超过上限，saved 后归还；清理释放后只留键与回执 | SPEC「晚到账目与有界保管」；model-host-local SPEC「晚到账目」「清理」 | 名额不归还，租户晚账永远被拒；正文不丢，已确认调用无界累积 | `runtime-push.spec.ts` 的超界用例 | `PendingAccountsBounded`、`ReservationsMatch`、`BodyDroppedAfterRelease`、进展 `AccountsEventuallyAccepted`；守卫为现有超界用例；[证明](../proofs/README.md#p4-待交付晚账有界) |
| P5 | 结果容量诚实且不截断：受理按请求的容量预留，总预留不超过份额；超容量的写入可见失败 | SPEC 受理表、`ResultCapacity` 一段 | 静默截断：内容与账目不一致却报成功 | `memory-consumption.spec.ts` | `CapacityHonest`、`NoSilentTruncation`；守卫 `admission-guards.spec.ts`（份额部分） |
| P6 | 别租户读调用不披露 | SPEC「调用和各次真实发出」「结果、失败和状态」 | 跨租户泄漏 | 存储按租户分区 | `TenantIsolation`；守卫 `admission-guards.spec.ts` |
| 进展 | 唤醒不断、接收方与适配器回来后不再离开、接收方最终 saved、清理最终成功时：每个收场的调用最终释放份额；每个接纳的晚账最终 saved；每个被提供的晚账最终被接纳 | 同 P2、P4 | 份额永远被占 | 无 | `EventuallyReleased`、`AccountsEventuallySaved`、`AccountsEventuallyAccepted`（`LiveSpec`，`RefusalsInPlay = FALSE`） |

## Admission 与源码

模型有一个租户的一个工作；调用身份 c1、c2，operation o1、o2，固定输入 r1、r2。未知写有两种效果：`applied`（立即可见）与 `pending`（之后落地或作废）。

| 模型 | 源码（`packages/model/model/src/commands/`） |
| --- | --- |
| `AdmitCommit`、`AdmitConflict`、`AdmitReplay` | `commands.ts` 的 `admit`：记录已存在答 conflict；同身份同输入答 recovered |
| `AdmitUnknown`、`Resolve` | 存储提交答 `unknown`；未决写的绑定状态 `unknown`；`Resolve` 是排除旧写者后的权威读 |
| `Recall` | `commands.ts` 的 `recall`：先查同身份的未决写，答 `commit-unknown`；再查记录 |
| `Fits` | `admit` 的份额检查：已用加本次请求不超过 `limits.capacity` |
| `Write` | `state.ts` 的写入：材料字节超过调用容量答 `capacity` |
| `ForeignRecall` | 存储按租户键分区，加授权核对 |

## ResultPush 与源码

模型有一个调用、一个接收方、一个证据适配器和至多三个晚账。

| 模型 | 源码（`packages/model/model-host-local/src/plugins/runtime.ts`） |
| --- | --- |
| `Wake`、`EndWake` | 插件的唤醒与一次工作（四个唤醒来源） |
| `Pushable`、`result.attempts`、`Limit` | `push` 的循环：`outcome-unknown` 在 `maxRedeliveries` 内继续，其余答复结束本次唤醒 |
| `Replaces` | `replaces()`：哪些新答复可以取代当前站位 |
| `PushResultForeign` | `acceptReceipt`：键或 owner 不符记为 `failed`（receipt-mismatch） |
| `AckConfirm`、`AckUnavailable`、`AckUnknown` | `handoff()` 与 model 的 handoff 证据：适配器答 unavailable 时保留站位 |
| `CleanOk`、`CleanFail` | `clean`、`advanceCleanup`、`dropBody` |
| `AcceptAccount`、`reservations` | `recordLateFact` 的名额检查（`late-account-capacity`）与 `reservations` 映射 |
| `share` | Commands 的已用份额；调用释放后不计 |

## 机读守卫

| 文件 | 守的性质 | 驱动与判读 | 负控（源码变异） |
| --- | --- | --- | --- |
| `model/tests/admission-guards.spec.ts` | P1、P5、P6 | 枚举未知受理的全部合法效果与揭示：揭示前 recall 与重入都答 commit-unknown；揭示后两者一致；换 operation 答 conflict 且记录不变；份额 600000 两次第二次被拒，400000 恰好放入；另一租户读不到 | N1 recall 不看未决写：三个枚举用例全红。N2 份额不检查：份额用例变红 |
| `model-host-local/tests/runtime-push-bounds.spec.ts` | P3 | 真实插件与脚本接收方：接收方一直答 unavailable 或 backpressured 时一次唤醒只推一次；一直答 outcome-unknown 时一次唤醒推 `1 + maxRedeliveries` 次 | N3 unavailable 与 backpressured 时继续重推：两个用例变红 |
| `model-host-local/tests/runtime-push.spec.ts`（已有） | P2、P4 | 场景用例：saved 四事实缺一不 ACK、外来回执不算 saved、unknown 重投、证据不可用时保留份额、晚账超界被拒 | N5 去掉晚账名额检查：两个晚账用例变红。N4 去掉 `clean` 的 ACK 判断：没有用例变红，见下 |

N4 是不可观察的变异。`clean` 只在 ACK 之后被调用，而且 Commands 的 `advanceCleanup` 只在已确认的保管上前进。所以 `ReleaseNeedsAck` 由两层守住，插件里这一处判断是冗余守卫。要让它可观察，需要同时变异 Commands，本次没有做。

`push-world.ts` 是 `runtime-push.spec.ts` 夹具部分的副本，供守卫共用。两份待合并。

## 抽象与未覆盖

- 一个调用、一个 owner。不建模冻结失败、冻结读取、`maxConcurrentCalls`、停止、后继插件、SQL 持久化与跨进程。
- 内存 Commands 的未决写只有「立即可见」一种效果，模型里的 `pending`（之后落地）没有内存对应物。SQL Commands 是否保证排除前 recall 一定答 `commit-unknown`，本次没有核对。见 [formal-runs.md](formal-runs.md#需要确认的点) 的 D1。
- 进展性质要求 `RefusalsInPlay = FALSE`。见 D2。
