# Run 驱动生命周期模型的运行记录

本页记录 [RunLifecycle.tla](RunLifecycle.tla) 的 TLC 运行与守卫的变异负控。性质与映射见 [README.md](README.md)。

结论只在所列常量范围内成立。它不是证明，也不表示实现符合模型。原始日志不进本包，保存在任务过程目录。

## 工具与参数

| 项 | 值 |
| --- | --- |
| 运行环境 | WSL 2 `Ubuntu-24.04`，入口 [run-tlc.sh](run-tlc.sh) |
| JDK | OpenJDK `21.0.12.1` LTS（Temurin） |
| TLC | `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`，即 tla2tools 1.7.4。JAR SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |
| 参数 | 广度优先；`-workers 4`；`-Xmx4g`；`-XX:+UseParallelGC`；`-deadlock` |
| 预算 | 每个配置 600 秒。全部在 4 秒内结束，没有缩小范围 |
| 判读 | 正控看 `Model checking completed. No error has been found.`。安全负控看 `Invariant <名> is violated`。活性负控只声明一条性质，看 `Temporal properties were violated` |
| 运行时间 | 2026-11-04（北京时间） |

输入摘要：`RunLifecycle.tla` SHA-256 `eca995a4bdeab42c622ac2ce851db04353b462625ae6fa724b75ebfee4c6de4c`。常量见 [README.md](README.md#状态与有限范围)。

## 模型的两处修订

第一次运行时，两个正控都报 `P6_CommitsBounded` 反例。逐条看轨迹后，修订了模型，没有放大常数：

1. **W0 的进入条件。** `run-is` 的轨迹在 T0 取了结果（T1）之后又进入等待，再写消息（T5），一步多出一次等待提交。实现里 T1 之后直接写 T5，不等待。模型的 `Readable` 漏了「已取未写消息」与「本批已完成」两种可前进状态。补上后 `run-is` 通过。
2. **被拒提交的重做。** `run-ought` 的轨迹在 F3 的 tryFinish 被拒，按应然回到 F1 重做候选，多一次提交。这与崩溃后的 attach 一样是一次重做。P6 的界加上 `env.refusals`，它对每次被拒的提交至多加一。

修订之后，十个负控仍然各自命中点名的性质。

## 结果

| 配置 | 期望 | 结论 | 生成 / 不同状态 | 深度 | 用时（秒） | 判读 |
| --- | --- | --- | --- | --- | --- | --- |
| `run-is` | 无反例 | 无反例 | 15,625 / 11,055 | 38 | 1 | 正控（实然） |
| `run-ought` | 无反例 | 无反例 | 23,695 / 16,685 | 40 | 1 | 正控（应然） |
| `run-wide` | 无反例 | 无反例 | 203,126 / 112,295 | 48 | 2 | 正控，放大范围 |
| `live-ought` | 无反例 | 无反例 | 23,695 / 16,685 | 40 | 3 | 活性正控：L1、L2、L3 |
| `bad-dispatch-before-intent-p1` | `P1_AtMostOnce` | 同名违反 | 155 / 99 | 7 | 1 | 命中：先发后存，崩溃后再发一次 |
| `bad-retry-redispatch-p1` | `P1_AtMostOnce` | 同名违反 | 171 / 114 | 7 | 1 | 命中：unknown 后换新身份重试 |
| `bad-reject-not-counted-p2` | `P2_StepBound` | 同名违反 | 2,778 / 1,764 | 15 | 1 | 命中：拒收后在同一步重发，请求数越过上限 |
| `bad-driver-swallows-p3` | `P3_StopVisible` | 同名违反 | 10 / 10 | 3 | 2 | 命中：被拒提交后驱动静默停下 |
| `bad-no-wake-p4` | `P4_WakeOnReceive` | 同名违反 | 308 / 187 | 8 | 0 | 命中：结果保存但不唤醒 |
| `bad-drop-on-absent-p4` | `P4_NoResultLost` | 同名违反 | 120 / 87 | 7 | 2 | 命中：没有接收方时丢掉结果 |
| `bad-release-on-unavailable-p5` | `P5_UnavailableDeniesBatch` | 同名违反 | 1,026 / 655 | 11 | 1 | 命中：先允许的动作被放出 |
| `bad-commit-on-idle-wake-p6` | `P6_CommitsBounded` | 同名违反 | 6,508 / 4,331 | 19 | 2 | 命中：每次无进展的唤醒都提交 |
| `bad-stall-on-unavailable-l2` | `L2_AdmissionResolves` | 时序性质违反 | 21,923 / 15,337 | 轨迹 15 | 1 | 命中：停在 A0 |
| `bad-is-no-terminate-l3` | `L3_FailedRunEnds` | 时序性质违反 | 15,625 / 11,055 | 轨迹 4 | 3 | 已知偏离的演示：实然下节点失败不结束 Run（R2-D285） |

负控的状态数和深度是找到第一个反例时的读数。

## 守卫的变异负控

守卫是 [guards/run-lifecycle.spec.ts](guards/run-lifecycle.spec.ts)，它进入本包的 `test:fast`。每个变异临时改一处源码，重新构建，运行守卫，再还原并重新构建。

| 变异 | 改了什么 | 结果 |
| --- | --- | --- |
| A1 | `coordinator.ts` 的 `stepLimit` 永不给出 guard | P2 的六个 `t ≥ m` 用例变红，六个 `t < m` 用例仍绿 |
| A2 | `provider.ts` 的 `failRun` 不改槽位、不报告 | P3 的四个节点用例全红 |

## 发现的缺陷

没有发现实现违背所选性质的反例。两处模型修订是模型自己的错，见上。

## 未覆盖

- 拒收计入上限（R2-D229）只在模型里检查。守卫没有脚本化拒收。
- P1、P4、P5、P6 没有新守卫，引用现有用例（见 [README.md](README.md#契约依据与性质)）。
