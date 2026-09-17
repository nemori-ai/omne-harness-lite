# 账号注册组合：验证与覆盖

## 证据义务

| 条款 | 需要的证据 | 状态 |
|---|---|---|
| S-1 可用账号必有个人租户 | 不变式 `ActivatedHasTenant` | **已通过** |
| S-2 不存在已激活但无租户 | 同上，故障注入下 | **已通过** |
| S-3 中断不呈现为成功 | 不变式 `NoFalseSuccess` | **已通过** |
| S-4 最终到达终结结果 | 时序性质 `EventualOutcome` | **已通过（带前提）** |
| S-5 中途失败收敛 | 不变式 `ConvergentOutcome` | **已通过** |
| 幂等边界 | 重跑幂等测试 | 未开始，需实现 |

## 实际执行

运行日期 2026-09-17，TLC（tla2tools，JDK 21）。

| 任务 | 配置 | 状态空间 | 结果 |
|---|---|---|---|
| `account-registration-v1-basic` | `Failures=FALSE, Abandoning=TRUE, Attempts={a1,a2}` | 109 生成 / 36 distinct，深度 7 | 无反例 |
| `account-registration-v1-crash` | `Failures=TRUE, Abandoning=TRUE` | 205 生成 / 72 distinct，深度 8 | 无反例 |
| `account-registration-v1-progress` | `Failures=FALSE, Abandoning=FALSE`，`ProgressSpec` | 25 生成 / 16 distinct，时序性质 2 分支 | 无反例 |

### 有效性验证（变异测试）

一个永远通过的检查没有价值。移除 `Activate` 的租户前置条件
（模拟实现者漏写这一行）后重跑 `basic.cfg`：

```
Error: Invariant ActivatedHasTenant is violated.
```

该不变式因此确实捕获「激活时未检查个人租户是否存在」这一最可能的实现错误，
不是平凡成立。

## 覆盖边界

**这些结论都是有限检查，不是无条件证明：**

- 规模限于 2 个并发注册尝试；更大规模未检查。
- 模型**不表达部分写入**：每次写入被当作原子的。存储提供者须保证单次写入的原子性，
  否则模型的结论不适用。
- 模型**不表达多节点**。S-1、S-2 在分布式下须由协议重新兑现，
  该边界在契约的「装配给的保证」一节登记。
- 进展性质 S-4 只在 `Failures=FALSE`（存储持续可用）与 `Abandoning=FALSE`（不放弃）
  两个前提下成立。**引用时必须带上前提**，不得读成「注册总会成功」。
