# 受理、结果推送与发送边界：性质、模型与实现的对应

本页说明 [Admission.tla](Admission.tla)、[ResultPush.tla](ResultPush.tla) 与 [SendBoundary.tla](SendBoundary.tla) 守住哪些性质，模型的变量和动作对应哪些源码，每份配置预期得到什么，以及每条性质的机读守卫。无界推广见 [证明](../proofs/push-bounds.md)。性质对应包组规格「[不变式](../../../SPEC.md#不变式)」里的 MD-1 到 MD-17。

模型检查只说明有限范围内的设计性质。它不证明源码精化。实现在 `@omne-harness/model`（Commands、发送边界与驱动）与 `@omne-harness/model-host-local`（结果推送插件）。

## 性质表

| 编号 | 性质                                                                                                                                                                                                                | 违背后果                                                                                                    | 怎么守                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | 受理至多一次：同身份同输入重入认回；换 operation 答 conflict；`not-accepted` 只在没有记录、也没有未决写时返回                                                                                                       | 调用方在 commit-unknown 期间被告知 not-accepted，换新身份重发，旧写随后落地：一个工作两次真实发出、两次计费 | `OneAcceptedPerWork`、`NotAcceptedIsAuthoritative`、`RecordImmutable`；守卫 `admission-guards.spec.ts`                                                                                                         |
| P2   | 保管链：确认只对 saved 的结果发；确认必须经 owner 的证据适配器；清理与份额释放只在确认之后；saved 只认原键原 owner 的回执；unknown 只被 saved 取代；saved 终态；已保存的接收方不会被遗忘；账目只在结果 saved 之后推 | 份额在确认前释放，唯一副本丢失；伪证据接管；接收方已保存的结果永远不再推                                    | `AckNeedsSaved`、`AckNeedsAdapter`、`ReleaseNeedsAck`、`SavedReceiptMatches`、`SavedReceiverNotLost`、`UnknownOnlyToSaved`、`SavedIsFinal`、`AccountsAfterResultSaved`；守卫 `runtime-push.spec.ts` 的场景用例 |
| P3   | 每次唤醒的推送工作量有界：一个交付至多推 `1 + maxRedeliveries` 次；`unavailable`、`backpressured`、`cancelled-before-accept` 与无接收方只等下一次唤醒                                                               | 热循环，CPU 与日志被打满                                                                                    | `PushesPerWakeBounded`；守卫 `runtime-push-bounds.spec.ts`；[证明](../proofs/push-bounds.md#p3-每次唤醒的推送次数)                                                                                             |
| P4   | 推送台账有界：接纳晚账前先占名额，待交付晚账不超过上限，saved 后归还；清理释放后只留键与回执                                                                                                                        | 名额不归还，租户晚账永远被拒；正文不丢，已确认调用无界累积                                                  | `PendingAccountsBounded`、`ReservationsMatch`、`BodyDroppedAfterRelease`、进展 `AccountsEventuallyAccepted`；守卫为 `runtime-push.spec.ts` 的超界用例；[证明](../proofs/push-bounds.md#p4-待交付晚账有界)      |
| P5   | 份额按个数不超占：每个已受理、结果未被确认并释放的调用占一个名额；份额已满时受理答 unavailable 且不占名额                                                                                                           | 一个租户的未确认结果无界累积                                                                                | `ShareHonest`；守卫 `admission-guards.spec.ts`（份额部分）                                                                                                                                                     |
| P6   | 别租户读调用不披露                                                                                                                                                                                                  | 跨租户泄漏                                                                                                  | `TenantIsolation`；守卫 `admission-guards.spec.ts`                                                                                                                                                             |
| 进展 | 唤醒不断、接收方与适配器回来后不再离开、接收方最终 saved、清理最终成功时：每个收场的调用最终释放份额；每个接纳的晚账最终 saved；每个被提供的晚账最终被接纳                                                          | 份额永远被占                                                                                                | `EventuallyReleased`、`AccountsEventuallySaved`、`AccountsEventuallyAccepted`（`LiveSpec`，`RefusalsInPlay = FALSE`）                                                                                          |

## Admission 与源码

模型有一个租户的一个工作；调用身份 c1、c2，operation o1、o2，固定输入 r1、r2。未知写有两种效果：`applied`（立即可见）与 `pending`（之后落地或作废）。

| 模型                                          | 源码（`packages/model/model/src/commands/`）                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `AdmitCommit`、`AdmitConflict`、`AdmitReplay` | `commands.ts` 的 `admit`：记录已存在答 conflict；同身份同输入答 recovered                            |
| `AdmitUnknown`、`Resolve`                     | 存储提交答 `unknown`；未决写的绑定状态 `unknown`；`Resolve` 是排除旧写者后的权威读                   |
| `Recall`                                      | `commands.ts` 的 `recall`：先查同身份的未决写，答 `commit-unknown`；再查记录                         |
| `Fits`、`AdmitFull`                           | `admit` 的份额检查：存储报告的持有个数小于 `limits.unacknowledgedResults` 才受理，否则答 unavailable |
| `ReleaseOther`                                | 确认与清理完成后请求材料释放，该调用不再计入持有个数                                                 |
| `ForeignRecall`                               | 存储按租户键分区，加授权核对                                                                         |

## ResultPush 与源码

模型有一个调用、一个接收方、一个证据适配器和至多三个晚账。

| 模型                                         | 源码（`packages/model/model-host-local/src/plugins/runtime.ts`）                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Wake`、`EndWake`                            | 插件的唤醒与一次工作                                                               |
| `Pushable`、`result.attempts`、`Limit`       | `push` 的循环：`outcome-unknown` 在 `maxRedeliveries` 内继续，其余答复结束本次唤醒 |
| `Replaces`                                   | `replaces()`：哪些新答复可以取代当前站位                                           |
| `PushResultForeign`                          | `acceptReceipt`：键或 owner 不符记为 `failed`（receipt-mismatch）                  |
| `AckConfirm`、`AckUnavailable`、`AckUnknown` | `handoff()` 与 model 的 handoff 证据：适配器答 unavailable 时保留站位              |
| `CleanOk`、`CleanFail`                       | `clean`、`advanceCleanup`、`dropBody`                                              |
| `AcceptAccount`、`reservations`              | `recordLateFact` 的名额检查（`late-account-capacity`）与 `reservations` 映射       |
| `share`                                      | Commands 的已用份额；调用释放后不计                                                |

## 机读守卫

| 文件                                                 | 守的性质   | 驱动与判读                                                                                                                                                                                                            | 负控（源码变异）                                                                      |
| ---------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `model/tests/admission-guards.spec.ts`               | P1、P5、P6 | 枚举未知受理的全部合法效果与揭示：揭示前 recall 与重入都答 commit-unknown；揭示后两者一致；换 operation 答 conflict 且记录不变；份额为 2 时第三个调用被拒且不落任何记录，重入已受理的调用不重复占名额；另一租户读不到 | N1 recall 不看未决写：三个枚举用例变红。N2 份额不检查：份额用例变红                   |
| `model-host-local/tests/runtime-push-bounds.spec.ts` | P3         | 真实插件与脚本接收方：接收方一直答 unavailable 或 backpressured 时一次唤醒只推一次；一直答 outcome-unknown 时一次唤醒推 `1 + maxRedeliveries` 次                                                                      | N3 unavailable 与 backpressured 时继续重推：两个用例变红                              |
| `model-host-local/tests/runtime-push.spec.ts`        | P2、P4     | 场景用例：saved 四事实缺一不确认、外来回执不算 saved、unknown 重投、证据不可用时保留份额、晚账超界被拒                                                                                                                | N5 去掉晚账名额检查：两个晚账用例变红。N4 去掉 `clean` 的确认判断：没有用例变红，见下 |

N4 是不可观察的变异。`clean` 只在确认之后被调用，而且 Commands 的 `advanceCleanup` 只在已确认的保管上前进。所以 `ReleaseNeedsAck` 由两层守住，插件里这一处判断是冗余守卫。

## 发送边界

[SendBoundary.tla](SendBoundary.tla) 检查 Model 发送边界与驱动对一个 dispatch 的全部出口。出口与结局的规则归包组规格「[真实发出与发送围栏](../../../SPEC.md#真实发出与发送围栏)」与「[执行写入的答复](../../../SPEC.md#执行写入的答复)」。实现在 `@omne-harness/model`：`src/send/attempt.ts` 与 `src/driver.ts`。

### 性质

| 编号   | 性质                                                                                    | 违背后果                                       | 守卫                                                                                                |
| ------ | --------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| S1     | `FinalDecided`：凭据缺失或读不出时，调用最终结算，或者驱动以确定拒绝结束                | 调用方一直等，调用不结算，份额不归还           | `send-credential-terminal.spec.ts`、`send.spec.ts` 的明确拒绝与释放失败用例                         |
| S2     | `FinalSettlesUnlessStolen`：本实例保有执行时，带 fault 的确定拒绝以 credential 失败结算 | 同上                                           | `send-credential-terminal.spec.ts`                                                                  |
| S3     | `NoCredFailureAfterStart`：传输已经 start 的调用不会带上 credential 终止                | 已发出字节、可能已计费的调用被报成「凭据缺失」 | `send.spec.ts`「recognizes an unknown not-sent record without resolving credentials a second time」 |
| S4     | `AtMostOneTerminal`：未确认的终止写重试时，不写第二个终止                               | 同一调用两条终止事实                           | `send.spec.ts`「retries an unconfirmed credential terminal with the same operation」                |
| 不成立 | `RefusalDecided`：凭据端口答 `unavailable` 时也能定局                                   | 调用方一直等                                   | 无。配置 `known-send-unavailable-waits` 记录这个反例                                                |

### 模型与源码

| 模型                                                  | 源码                                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Resolve`                                             | `attempt.ts` 的 `startQualified` 与 `start`：围栏内解析一次，`value` 立即 start           |
| `RecordWrite`、`RecordReplay`、`RecordRejected`       | `recordStarted` 与 `write`：未确认先查询原 operation 再重放；明确拒绝走 `rejectedRefusal` |
| `TerminalWrite`、`TerminalReplay`、`TerminalRejected` | `terminalStage` 与 `recordTerminal`：终止写的 operation 固定在阶段里                      |
| `RejectedAnswer` 的 `released`                        | `stopFinal`：释放失败保留尝试与容量，答复仍是确定拒绝                                     |
| `rec.window`、窗口守卫                                | Commands 的 `preserve`：窗口不是 `open` 时答 `invalid`（`window`、`not-open`）            |
| `DriveAgain`                                          | 驱动的 `sendDispatch`：unknown 时阶段仍是 `send`，下一次 drive 交同一 demand              |
| `NotStarted`、`ReadRecord`                            | 驱动的 `not-sent` 阶段、`settleNotSent`、`notSentTerminal`：读失败返回失败并保留阶段      |
| `Settle`                                              | 驱动的 `finish`：结算写；接管后答 `stale-instance`                                        |
| `Steal`                                               | 另一个实例认领执行，或竞争写改变了调用：之后本实例的写都被明确拒绝                        |
| `Flip`                                                | 租户解绑或重新绑定                                                                        |

### 负控与源码变异

| 配置                             | 去掉的守卫                                            | 对应的源码变异                                                     |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `bad-send-rejection-unavailable` | not-sent 记录被明确拒绝，边界却答凭据的 `unavailable` | `rejectedRefusal` 与 `recordTerminal` 改回旧答复：明确拒绝用例变红 |
| `bad-send-release-overrides`     | 释放失败把确定拒绝改成 `unavailable`                  | `stopFinal` 改回 `stop`：释放失败用例变红                          |
| `bad-send-read-failure-drops`    | 读记录失败被当作没有终止                              | `notSentTerminal` 读失败答 `{ ok: null }`：两条重读用例变红        |
| `bad-send-retry-new-op`          | 重试换新 operation，并去掉窗口守卫                    | `DriveAgain` 换 operation：同一 operation 用例变红                 |
| `bad-send-re-resolve`            | 重试重新解析凭据                                      | 无单独变异；`send.spec.ts` 的「不再解析」用例守着                  |
| `send-retry-new-op-window`       | 只换新 operation，保留窗口守卫                        | 正控：窗口守卫单独也守住 S4，两道守卫互为冗余                      |

## 配置预期

配置名的前缀表示用途：`bad-` 是负控，每个负控只检查点名的一条性质；`known-` 记录已知反例；其余是正控。正控预期无反例。

| 模型         | 配置                                            | 预期                                                                                                                                                                        |
| ------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admission    | `admission`                                     | 无反例：五条不变量与 `RecordImmutable`                                                                                                                                      |
| Admission    | `bad-recall-ignores-unknown-once`               | `OneAcceptedPerWork` 违反：未决写期间 recall 答 not-accepted，调用方换 c2 受理，随后 c1 落地，两条记录                                                                      |
| Admission    | `bad-recall-ignores-unknown-authority`          | `NotAcceptedIsAuthoritative` 违反                                                                                                                                           |
| Admission    | `bad-admit-upserts`                             | 动作性质 `RecordImmutable` 违反                                                                                                                                             |
| Admission    | `bad-share-ignored`                             | `ShareHonest` 违反：份额已满仍受理                                                                                                                                          |
| Admission    | `bad-tenant-leak`                               | `TenantIsolation` 违反                                                                                                                                                      |
| ResultPush   | `push`、`push-wide`                             | 无反例：十一条不变量与两条动作性质；`push-wide` 放大范围                                                                                                                    |
| ResultPush   | `push-live`                                     | 无反例：`EventuallyReleased`、`AccountsEventuallySaved`、`AccountsEventuallyAccepted`                                                                                       |
| ResultPush   | `bad-ack-without-saved`                         | `AckNeedsSaved` 违反                                                                                                                                                        |
| ResultPush   | `bad-ack-without-adapter`                       | `AckNeedsAdapter` 违反                                                                                                                                                      |
| ResultPush   | `bad-release-before-ack`                        | `ReleaseNeedsAck` 违反                                                                                                                                                      |
| ResultPush   | `bad-foreign-receipt-saved`                     | `SavedReceiptMatches` 违反                                                                                                                                                  |
| ResultPush   | `bad-refusal-overwrites-unknown`                | 动作性质 `UnknownOnlyToSaved` 违反                                                                                                                                          |
| ResultPush   | `bad-refusal-loses-receiver`                    | `SavedReceiverNotLost` 违反                                                                                                                                                 |
| ResultPush   | `bad-repush-saved`                              | 动作性质 `SavedIsFinal` 违反                                                                                                                                                |
| ResultPush   | `bad-retry-on-unavailable`                      | `PushesPerWakeBounded` 违反                                                                                                                                                 |
| ResultPush   | `bad-accept-without-reservation`                | `PendingAccountsBounded` 违反                                                                                                                                               |
| ResultPush   | `bad-reservation-never-released`                | `ReservationsMatch` 违反                                                                                                                                                    |
| ResultPush   | `bad-keep-body`                                 | `BodyDroppedAfterRelease` 违反                                                                                                                                              |
| ResultPush   | `bad-accounts-before-saved`                     | `AccountsAfterResultSaved` 违反                                                                                                                                             |
| ResultPush   | `bad-live-waiting-not-due`                      | 时序性质 `EventuallyReleased` 违反                                                                                                                                          |
| ResultPush   | `bad-live-reservation-never-released`           | 时序性质 `AccountsEventuallyAccepted` 违反：名额永不归还，第二个晚账永远进不来。点名 `AccountsEventuallySaved` 会空过，因为名额卡死时第二个账目进不了待交付，蕴含式平凡成立 |
| SendBoundary | `send`、`send-wide`、`send-retry-new-op-window` | 无反例：三条不变量与 `FinalDecided`、`FinalSettlesUnlessStolen`；`send-wide` 放大故障次数                                                                                   |
| SendBoundary | `bad-send-rejection-unavailable`                | 时序性质 `FinalDecided` 违反：接管后 not-sent 记录被拒，答 `unavailable`，驱动停在 `failed-unavail`                                                                         |
| SendBoundary | `bad-send-release-overrides`                    | 时序性质 `FinalDecided` 违反                                                                                                                                                |
| SendBoundary | `bad-send-read-failure-drops`                   | 时序性质 `FinalDecided` 违反：终止已写，读记录失败一次，驱动落成 `failed-unavail`                                                                                           |
| SendBoundary | `bad-send-retry-new-op`                         | `AtMostOneTerminal` 违反                                                                                                                                                    |
| SendBoundary | `bad-send-re-resolve`                           | `NoCredFailureAfterStart` 违反：start 后记录丢失，解绑，重试重新解析得 absent，写了 credential 终止                                                                         |
| SendBoundary | `known-send-unavailable-waits`                  | 时序性质 `RefusalDecided` 违反：凭据端口答 `unavailable` 的调用一直等                                                                                                       |

## 抽象与未覆盖

- Admission 与 ResultPush：一个调用、一个 owner。不建模冻结失败、冻结读取、`maxConcurrentCalls`、停止、后继插件、SQL 持久化与跨进程。内存 Commands 的未决写只有「立即可见」一种效果，模型里的 `pending`（之后落地）没有内存对应物。进展性质要求 `RefusalsInPlay = FALSE`：被 `denied`、`invalid`、`conflict` 拒绝的交付不自动重推。
- SendBoundary：一个 dispatch，一个实例。结算写之外不建模重试决定、新的 dispatch、取消与跨进程恢复。`MaxFaults` 是写确认丢失与读记录失败的总次数，活性依赖它有界，以及驱动被再次驱动（`WF_vars(Proc)`）。已经 start 的流只建模为一次接收与结算，不建模流内事实。
