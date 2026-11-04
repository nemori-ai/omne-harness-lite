# Run 层与唤醒模型的运行记录

本页记录 [RunAdvance.tla](run-advance/RunAdvance.tla) 与 [WakeUp.tla](wake-up/WakeUp.tla) 的 TLC 运行、守卫的变异负控与发现的缺陷。性质与映射见两个目录的 README。

结论只在所列常量范围内成立。它不是证明，也不表示实现符合模型。原始日志不进本包，保存在任务过程目录。

## 工具与参数

| 项 | 值 |
| --- | --- |
| 运行环境 | WSL 2 `Ubuntu-24.04`。入口 [run-tlc.sh](run-tlc.sh)，它把一个模型目录复制到 WSL 自己的文件系统，按 `expect.txt` 逐个跑配置 |
| JDK | OpenJDK `21.0.12.1` LTS（Temurin） |
| TLC | `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`，即 tla2tools 1.7.4。JAR SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |
| 参数 | 广度优先；`-workers 4`；`-Xmx4g`；`-XX:+UseParallelGC`；配置里 `CHECK_DEADLOCK FALSE` |
| 预算 | 每个配置 600 秒。R2-D327 的复跑中最长的 `positive-global-wide` 用 55 秒，其余在 35 秒内结束 |
| 判读 | 正控要求 `Model checking completed. No error has been found.`。负控要求日志点名预期性质；活性负控只声明一条性质并出现 `Temporal properties were violated` |
| 运行时间 | 2026-11-04（北京时间）；R2-D327 修订后同日复跑，下表是复跑的结果 |

输入摘要：`RunAdvance.tla` SHA-256 `b9a7675c1d1cef274165ac8e9bbe210ea1c1be496b7d743c094482da571d0036`（R2-D343 只改了注释，并整体复跑十二个配置，判定与下表相同；负控命中时的状态数随并行调度略有出入，正控不变），`WakeUp.tla` SHA-256 `0e24eedc52d0d9085aea06cddbf79a274bc81d305a78eb1b759bb563951d8a55`（WakeUp 只改了注释）。

## RunAdvance

R2-D327 采用 Run 层修订：`positive-run` 是设计正控，`negative-global-expected` 是旧契约的负控。`claim` 改为两步（读 Run 层、带 `expected` 条件提交），由 `Recoverers` 中的恢复者执行。两个恢复者的竞争只在小范围的 `positive-claims` 与 `bad-claim-no-expected` 中展开（`Inputs = {i1}`、`MaxRuns = 1`）；其余配置只有一个恢复者，避免状态爆炸。

| 配置 | 期望 | 结论 | 生成 / 不同状态 | 深度 | 判读 |
| --- | --- | --- | --- | --- | --- |
| `positive-run` | 无反例 | 无反例 | 17,020,584 / 6,064,270 | 32 | 设计正控：`expected` 只比 Run 层修订，`RetriesOnChanged = 2` |
| `positive-global-wide` | 无反例 | 无反例 | 25,593,197 / 9,629,056 | 34 | 正控：比快照修订，但重试上限 5 不小于无关提交数 |
| `positive-claims` | 无反例 | 无反例 | 13,199 / 7,016 | 17 | 正控：两个恢复者读同一 Run 层后各自 `claim`，至多一个成立（`OneClaimPerRead`），其余性质同时成立 |
| `negative-global-expected` | `NoAbandonedClose` | 命中 | 1,551,047 / 678,328 | 17 | 与 `positive-run` 只差 `ExpectedScope`：三次无关的 accept 让收束放弃。旧契约的反例，见 F3 |
| `bad-second-run` | `OneOpenRun` | 命中 | 38 / 21 | 5 | 负控 |
| `bad-two-advances` | `OneAdvance` | 命中 | 195 / 140 | 7 | 负控 |
| `bad-accept-stale` | `StaleWriterRejected` | 命中 | 600 / 388 | 7 | 负控 |
| `bad-retake` | `TakeOnce` | 命中 | 473 / 296 | 7 | 负控 |
| `bad-revive` | `TerminalStable` | 命中 | 212 / 145 | 6 | 负控 |
| `bad-post-terminal-attempt` | `NoPostTerminalAttempt` | 命中 | 207 / 146 | 6 | 负控 |
| `bad-silent-reconcile` | `ReconcileNeedsConfirmation` | 命中 | 197 / 136 | 6 | 负控 |
| `bad-claim-no-expected` | `OneClaimPerRead` | 命中 | 461 / 362 | 9 | 与 `positive-claims` 只差 `Bug`：决定不比较 `expected` 时，两个恢复者先后成立（负控，F4）。R2-D343 起 `claim` 的 `expected` 必填，类型上不再有不带它的调用方，所以这条负控对应源码变异 M4 |

R2-D327 之前的首次运行（`claim` 为一步，没有 `Recoverers`）十个配置也全部按预期，`positive-run` 为 415,719 / 127,283。草稿的三处修订：`Naturals` 换成 `Integers`（草稿用了 `-1`）；`OneOpenRun` 改为「当前 Run 之前的每个 Run 都已终结」，原写法对 `second-run` 不敏感；`retake` 改为承接后输入仍留在待处理，原写法下这个开关不可达。第一次运行时两个正控报 `NoAbandonedClose`：收束期间的 `Release` 与 `Claim` 也推进 Run 层修订。收束由持有 advance 的 attempt 执行，所以模型让这两个动作在收束期间等待，并在 README 写明这是 S4 的前提。

## WakeUp

R2-D327 之后的实现对应 `Bug = "none"`，即正控 `positive`。`negative-scan-start-only` 与 `negative-swallow` 是 R2-D327 之前的实现形态，保留为负控。

| 配置 | 期望 | 结论 | 生成 / 不同状态 | 深度 | 判读 |
| --- | --- | --- | --- | --- | --- |
| `positive` | 无反例 | 无反例 | 49,087 / 12,138 | 25 | 正控与现行实现：`NoSilentGiveUp`、`InputsServed`、`GrantedInvoked` |
| `positive-no-scan` | 无反例 | 无反例 | 820 / 331 | 20 | 正控：扫描关闭、没有丢失时只靠通知与 `again` 也成立 |
| `negative-no-again` | `InputsServed` | 命中 | 483 / 221 | — | 负控：与 `positive-no-scan` 只差 `Bug`，在途触发被丢，输入一直等待 |
| `negative-lost-notice-no-scan` | `InputsServed` | 命中 | 1,858 / 678 | — | 设计前提的演示：通知可能丢失时，必须有扫描 |
| `negative-scan-start-only` | `GrantedInvoked` | 命中 | 49,103 / 12,144 | — | 负控，R2-D327 之前的实现：已授予的 Run 在 C2 放弃或崩溃后不再发起，见 F2 |
| `negative-swallow` | `NoSilentGiveUp` | 命中 | 1,085 / 513 | 9 | 负控，R2-D327 之前的实现：放弃时不写诊断，见 F1 |

模型的第一版用计数器记放弃次数与诊断次数，Agent 一直下线时计数器无界，状态空间不收敛。改为一个「曾无诊断地放弃」的布尔量。

## 守卫的变异负控

每个变异临时改一处源码，重新构建，运行守卫，再还原并重新构建。两个成员的测试都读 session-contract 的构建产物，所以改契约源码的变异先构建再跑。

| 变异 | 改了什么 | 守卫 | 结果 |
| --- | --- | --- | --- |
| R1 | `judgments.ts` 的 `judgeRunStart` 不答 `run-active` | `run-advance-invariants.spec.ts` | 变红：`reduce` 把第二个 Run 隔离，守卫的提交辅助抛错。I-R1 由判断与 `reduce` 两层守住 |
| R2 | `judgments.ts` 的 `judgeAdvance` 不比 attempt | `run-advance-invariants.spec.ts` | 变红：过期 attempt 答 `ok`（I-R2） |
| R3 | `decide.ts` 的 `decideHandover` 不拒已交接的输入 | `run-advance-invariants.spec.ts` | 没有变红。交接事实的操作身份由（execution，input）派生，第二次交接被当作同一操作认回，`reduce` 也不重复记录。I-R3 由三层守住，这一处单独变异不可观察 |
| W1 | session 成员 `advance.ts` 的 `trigger` 丢弃在途触发 | `wake-up.spec.ts` | 变红：输入一直等待 |
| M1（F1） | session 成员 `advance.ts` 的 `report` 不再记诊断 | `wake-up.spec.ts` | 变红：8 项。五个具名诊断用例与三个依赖诊断时点的重放用例（含 SQL 提供者对） |
| M2（F2） | session 成员 `advance.ts` 的 `check` 不再把已授予未受理的 Run 交给重放 | `wake-up.spec.ts` | 变红：3 项，即重试用尽后的扫描重放（内存与 SQL 提供者对）与端口缺席后的触发重放 |
| M3（F3） | `judgments.ts` 的 `expectedHolds` 只比快照修订 | `run-advance-invariants.spec.ts`；session 成员 `wake-up.spec.ts`、`pipeline.spec.ts` | 变红：契约 3 项，成员 2 项（有界收束在无关提交后答 `changed`） |
| M3b（F3） | `reduce.ts` 不再设置 Run 层修订 | 同 M3 | 变红：契约 3 项，成员 2 项 |
| M4（F4） | `decide.ts` 的 `claim` 不比 `expected` | `run-advance-invariants.spec.ts` | 变红：1 项，第二个读到同一 Run 层的 `claim` 也成立 |

还原后同一组守卫全部通过：契约 6 项，成员 31 项。

## 发现的缺陷

F1 至 F5 按 R2-D327 处理，下表写处置。

| 编号 | 发现 | 反例或依据 | 处置（R2-D327） |
| --- | --- | --- | --- |
| F1 失败被吞 | session 成员 `advance.ts`：`check` 读快照失败、`openRun` 的非 `commit-unknown` 失败、`invoke` 的不可重试失败与重试用尽、`handOver` 的 `receive` 失败、`closeRefused` 读失败与重试超限，都直接返回，没有诊断 | 模型 `negative-swallow`；session SPEC 的 C2 失败分支写「停止并记诊断」 | 已修。每个停止的分支记 `SessionDiagnostic`，经工厂选项 `diagnose` 交给装配，见 session SPEC 的诊断出口。守卫 `wake-up.spec.ts` |
| F2 已授予未发起的 Run 不再发起 | `startRun` 已提交、`invoke` 没有受理（崩溃，或重试用尽）后，扫描找到会话交给 S1，S1 的 `judgeRunStart` 答 `run-active` 就返回。没有路径再发 `invoke`，Run 永远 active | 模型 `negative-scan-start-only`；SPEC PA-06 第 2 项、PM-14 要求以同一出站身份重发 | 已修。S1 把这样的会话交 C2 重放：认回原 `startRun`，以同一出站身份 `invoke`。守卫 `wake-up.spec.ts`（内存与 SQL 提供者对） |
| F3 `expected` 与整份快照修订比较 | `judgeAdvance` 用 `claim.expected !== snapshot.revision`，每个 accept 都推进修订。有界收束在繁忙会话里 `retriesOnChanged` 次后放弃 | 模型 `negative-global-expected` 与 `positive-run` 的对照 | 已修。推进命令的 `expected` 是 Run 层修订（契约 I-R2 后的「推进命令的 expected」）。守卫 `run-advance-invariants.spec.ts`、`wake-up.spec.ts`、`pipeline.spec.ts` |
| F4 `claim` 的 `expected` 与文档不符 | SPEC I-R2 写 `claim` 核对 `expected`，PM-05 写 `claim` 可答 `changed`；但 `claim` 的签名没有 `expected`，`decideAttempt` 不比较修订 | 读 `faces.ts` 与 `decide.ts`；模型 `bad-claim-no-expected` | `claim` 增加 `expected`，核对它等于 Run 层修订，第二个读到同一 Run 层的恢复者得 `stale-advance`（R2-D327）。R2-D327 先让它可选、并让等于快照修订的 `expected` 也成立；R2-D343 收口为终态：`claim.expected` 与 `RunState.active.revision` 必填，`expectedHolds` 只与 Run 层修订比较 |
| F5 文档过时 | session SPEC「实现现状」说 C3 不触发，但 `control.ts` 已实现 C3；周期扫描读 `inputs`、`unresolved`、`controls`，文档只写前两个 | 读 `control.ts`、`scan.ts` | 已同步 |

## 未覆盖

- `claim` 被 C5 接管后的 Run：重放 `invoke` 需要后来 attempt 的授予依据，属于未实现的 C5。现在只记 `attempt-replaced` 诊断。
- S3 没有每会话退避：Agent 一直不可用时，每个扫描周期重放一轮重试序列，并记一条 `retries-exhausted`。
- 扫描找回丢失的通知由 `advance.spec.ts` 的启动扫描用例覆盖；周期扫描的定时路径没有新用例。
- 延后控制事实（FR-05）不在模型内。
