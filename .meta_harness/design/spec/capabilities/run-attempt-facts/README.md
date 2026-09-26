# 尝试与运行的事实读面（窄口）

**给 (会话, 运行, 尝试)，答这次执行尝试是否已被取代、这个运行是否已终结——两件事实都按会话日志定义，只从假变真；答不出就明确失败，不答「未取代、未终结」。**
这是按工具执行运行时算 `late` 已列出的要求定的**窄口接口**，不是运行与尝试的完整读面——那一份归会话日志与 loop 那一程。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.run-attempt-facts, 1)`
- **状态**：`candidate`（2026-09-25 起草；同日「公开面」修订波原地改，见[修订波](verification.md#修订波2026-09-25-公开面)），**未接受、未冻结**
- **catalog 映射**：已登记为 `candidate`；`family=capabilities`、`topic=run-attempt-facts`、
  `contract_path=spec/capabilities/run-attempt-facts/v1/contract.md`；`resources` 含契约与 `examples.md`；
  依赖四项：`data.identity-values`、`data.messages`、`data.call-accounts`、`capability.session-log`（均 v1），clauses 取自[契约 S-4](v1/contract.md#s-4-依赖方向与被消费的面)
- **formal-tasks 映射**：无（[契约 S-13](v1/contract.md#s-13-本版选用哪些形式工件) 说明为什么不建模）
- **提供者/装配映射**：最小提供者见[契约第十一节](v1/contract.md#十一提供者映射)，**节点由主线另立，尚无**；它取代验收装配里的同名替身

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约拥有这个**读**与两件事实的判定形式；事实本身（尝试开始、运行终结）是会话日志里的条目，归 loop 写 |
| 为什么是 capability 而不是 data | 一个有前置、失败集合与缺席默认的操作 |
| 为什么现在立、而且这么窄 | 产品负责人 2026-09-25 同意把验收替身换成「接口契约 ＋ 最小提供者」、接口按消费者需要定窄口（[D-043 R-1](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）；工具执行运行时每条收场都要落账、每笔账都要 `late`（[D-040 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M74，据点装配 C-16） |
| 为什么不并进会话日志契约 | 会话日志把载荷当不透明、不认终结记录；这两件事实是对日志内容的一种**解释**，解释归 loop 那一程——本版先以窄口把「怎样判」固定下来，与会话日志的栅栏同一条件 |
| 精确依赖 | 见上；依赖方向单向 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 两件事实各自怎样定义 | [契约 S-5](v1/contract.md#s-5-两件事实) |
| 为什么只会漏标、不会误标 | [契约 S-6](v1/contract.md#s-6-只从假变真) |
| 答不出时是什么 | [契约 S-8](v1/contract.md#s-8-缺席时的默认答案与失败值) |
| 唯一那个操作的九件事 | [契约 S-9](v1/contract.md#s-9-attemptfacts读一次尝试的两件事实) |
| 漏标窗口为什么本版不闭合 | [契约 G-2](v1/contract.md#十已知缺口) |
| 实例 | [examples](v1/examples.md) |
| 证据到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 含 `contract.md` 与 `examples.md`。**不建 Schema、不建形式模型**（理由见契约 S-13）。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。
