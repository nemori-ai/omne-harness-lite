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
| 预算 | 每个配置 600 秒。全部在 5 秒内结束，没有缩小范围 |
| 判读 | 正控要求 `Model checking completed. No error has been found.`。负控要求日志点名预期性质；活性负控只声明一条性质并出现 `Temporal properties were violated` |
| 运行时间 | 2026-11-04（北京时间） |

输入摘要：`RunAdvance.tla` SHA-256 `12d0ba596c459f698fc52bbed35128c1d6d70c2c3157f365b78a90f9610bed71`，`WakeUp.tla` SHA-256 `d879464ee4e3f64828e44704542c63838ecbe153c557ffb328ea9ea75d9cc1c2`。

## RunAdvance

| 配置 | 期望 | 结论 | 生成 / 不同状态 | 深度 | 判读 |
| --- | --- | --- | --- | --- | --- |
| `positive-run` | 无反例 | 无反例 | 415,719 / 127,283 | 26 | 正控：`expected` 只比 Run 层修订，`RetriesOnChanged = 2` |
| `positive-global-wide` | 无反例 | 无反例 | 476,546 / 152,798 | 29 | 正控：比快照修订，但重试上限 5 不小于无关提交数 |
| `negative-global-expected` | `NoAbandonedClose` | 命中 | 281,767 / 92,098 | 17 | 与 `positive-run` 只差 `ExpectedScope`：三次无关的 accept 让收束放弃。现行契约的反例，见 F3 |
| `bad-second-run` | `OneOpenRun` | 命中 | 38 / 21 | 5 | 负控 |
| `bad-two-advances` | `OneAdvance` | 命中 | 48 / 35 | 5 | 负控 |
| `bad-accept-stale` | `StaleWriterRejected` | 命中 | 198 / 140 | 6 | 负控 |
| `bad-retake` | `TakeOnce` | 命中 | 372 / 229 | 7 | 负控 |
| `bad-revive` | `TerminalStable` | 命中 | 193 / 132 | 6 | 负控 |
| `bad-post-terminal-attempt` | `NoPostTerminalAttempt` | 命中 | 186 / 134 | 6 | 负控 |
| `bad-silent-reconcile` | `ReconcileNeedsConfirmation` | 命中 | 203 / 141 | 6 | 负控 |

草稿的三处修订：`Naturals` 换成 `Integers`（草稿用了 `-1`）；`OneOpenRun` 改为「当前 Run 之前的每个 Run 都已终结」，原写法对 `second-run` 不敏感；`retake` 改为承接后输入仍留在待处理，原写法下这个开关不可达。第一次运行时两个正控报 `NoAbandonedClose`：收束期间的 `Release` 与 `Claim` 也推进 Run 层修订。收束由持有 advance 的 attempt 执行，所以模型让这两个动作在收束期间等待，并在 README 写明这是 S4 的前提。

## WakeUp

| 配置 | 期望 | 结论 | 生成 / 不同状态 | 深度 | 判读 |
| --- | --- | --- | --- | --- | --- |
| `positive` | 无反例 | 无反例 | 49,087 / 12,138 | 25 | 正控：`NoSilentGiveUp`、`InputsServed`、`GrantedInvoked` |
| `positive-no-scan` | 无反例 | 无反例 | 820 / 331 | 20 | 正控：扫描关闭、没有丢失时只靠通知与 `again` 也成立 |
| `negative-no-again` | `InputsServed` | 命中 | 483 / 221 | — | 负控：与 `positive-no-scan` 只差 `Bug`，在途触发被丢，输入一直等待 |
| `negative-lost-notice-no-scan` | `InputsServed` | 命中 | 1,858 / 678 | — | 设计前提的演示：通知可能丢失时，必须有扫描 |
| `negative-scan-start-only` | `GrantedInvoked` | 命中 | 49,103 / 12,144 | — | 现行实现的形态：已授予的 Run 在 C2 放弃或崩溃后不再发起，见 F2 |
| `negative-swallow` | `NoSilentGiveUp` | 命中 | 1,102 / 531 | 9 | 现行实现的形态：放弃时不写诊断，见 F1 |

模型的第一版用计数器记放弃次数与诊断次数，Agent 一直下线时计数器无界，状态空间不收敛。改为一个「曾无诊断地放弃」的布尔量。

## 守卫的变异负控

每个变异临时改一处源码，重新构建，运行守卫，再还原并重新构建。

| 变异 | 改了什么 | 守卫 | 结果 |
| --- | --- | --- | --- |
| R1 | `judgments.ts` 的 `judgeRunStart` 不答 `run-active` | `run-advance-invariants.spec.ts` | 变红：`reduce` 把第二个 Run 隔离，守卫的提交辅助抛错。I-R1 由判断与 `reduce` 两层守住 |
| R2 | `judgments.ts` 的 `judgeAdvance` 不比 attempt | `run-advance-invariants.spec.ts` | 变红：过期 attempt 答 `ok`（I-R2） |
| R3 | `decide.ts` 的 `decideHandover` 不拒已交接的输入 | `run-advance-invariants.spec.ts` | 没有变红。交接事实的操作身份由（execution，input）派生，第二次交接被当作同一操作认回，`reduce` 也不重复记录。I-R3 由三层守住，这一处单独变异不可观察 |
| W1 | session 成员 `advance.ts` 的 `trigger` 丢弃在途触发 | `wake-up.spec.ts` | 变红：输入一直等待 |

## 发现的缺陷

| 编号 | 发现 | 反例或依据 | 建议拥有者 |
| --- | --- | --- | --- |
| F1 失败被吞 | session 成员 `advance.ts`：`check` 读快照失败、`openRun` 的非 `commit-unknown` 失败、`invoke` 的不可重试失败与重试用尽、`handOver` 的 `receive` 失败、`closeRefused` 读失败与重试超限，都直接返回，没有诊断 | 模型 `negative-swallow`；session SPEC 的 C2 失败分支写「停止并记诊断」 | session 成员 |
| F2 已授予未发起的 Run 不再发起 | `startRun` 已提交、`invoke` 没有受理（崩溃，或重试用尽）后，扫描找到会话交给 S1，S1 的 `judgeRunStart` 答 `run-active` 就返回。没有路径再发 `invoke`，Run 永远 active | 模型 `negative-scan-start-only`；SPEC PA-06 第 2 项、PM-14 要求以同一出站身份重发 | session 成员 |
| F3 `expected` 与整份快照修订比较 | `judgeAdvance` 用 `claim.expected !== snapshot.revision`，每个 accept 都推进修订。有界收束在繁忙会话里 `retriesOnChanged` 次后放弃，叠加 F1、F2 后 Run 卡死且没有诊断 | 模型 `negative-global-expected` 与 `positive-run` 的对照 | 本契约：`expected` 改为 Run 层修订，或有界收束不带 `expected` |
| F4 `claim` 的 `expected` 与文档不符 | SPEC I-R2 写 `claim` 核对 `expected`，PM-05 写 `claim` 可答 `changed`；但 `claim` 的签名没有 `expected`，`decideAttempt` 不比较修订。两个恢复者先后 `claim` 都成立，Session 层没有「一个成立、另一个得到 stale-advance」的守卫 | 读 `faces.ts` 与 `decide.ts` | 本契约：改文档或改类型 |
| F5 文档过时 | session SPEC「实现现状」说 C3 不触发，但 `control.ts` 已实现 C3；周期扫描读 `inputs`、`unresolved`、`controls`，文档只写前两个 | 读 `control.ts`、`scan.ts` | session 成员 |

## 未覆盖

- S6 没有可绿的守卫：现行实现不满足，诊断出口还没有提供。
- F2 的路径没有守卫：现行实现不满足。
- 扫描找回丢失的通知由 `advance.spec.ts` 的启动扫描用例覆盖；周期扫描的定时路径没有新用例。
- 延后控制事实（FR-05）不在模型内。
