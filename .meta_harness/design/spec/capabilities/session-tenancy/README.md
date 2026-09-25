# 会话持有租户读面（窄口）

**给一个会话，答它持有的那个租户身份——会话创建那一刻捕获的当前租户身份；同一个会话永远答同一个，答不出就明确失败，不编一个。**
这是按四个消费者（工具执行运行时、拓展点派发、会话资产注册表的求值输入、模型请求运行时）已列出的要求定的**窄口接口**，不是会话契约——那一份归会话那一程（PF-015）。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.session-tenancy, 1)`
- **状态**：`candidate`（2026-09-25 起草；同日「公开面」修订波原地改，见[修订波](verification.md#修订波2026-09-25-公开面)），**未接受、未冻结**
- **catalog 映射**：已登记为 `candidate`；`family=capabilities`、`topic=session-tenancy`、
  `contract_path=spec/capabilities/session-tenancy/v1/contract.md`；`resources` 含契约与 `examples.md`；
  依赖两项：`data.identity-values`、`data.messages`（均 v1），clauses 取自[契约 S-4](v1/contract.md#s-4-依赖方向与被消费的面)
- **formal-tasks 映射**：无（[契约 S-12](v1/contract.md#s-12-本版选用哪些形式工件) 说明为什么不建模）
- **提供者/装配映射**：最小提供者是本机 JSON 文件或 sqlite 表（[契约第十一节](v1/contract.md#十一提供者映射)），**节点由主线另立，尚无**；它取代验收装配里的同名替身

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约拥有这个**读**与它的两条性质（答不出不编、答案不变）；「会话持有哪个租户」这件事本身的写与会话的生灭归会话那一程 |
| 为什么是 capability 而不是 data | 它是一个有前置、失败集合与缺席默认的操作；`TenantId`、`SessionRef` 这些值已经有 data 家 |
| 为什么现在立、而且这么窄 | 产品负责人 2026-09-25 同意把验收替身换成「接口契约 ＋ 最小提供者」、接口按消费者需要定窄口（[D-043 R-1](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）。四个消费者都卡在这一个读上（据点装配 C-13） |
| 为什么不并进某个消费者 | 四个消费者同一读面（[D-040 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M48、M66）；归哪一方都让其余三方读它的内部 |
| 精确依赖 | 见上；依赖方向单向 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 会话持有的租户身份是什么、为什么不变 | [契约 S-5](v1/contract.md#s-5-会话持有的租户身份)、[S-6](v1/contract.md#s-6-答案不变) |
| 答不出时是什么 | [契约 S-7](v1/contract.md#s-7-缺席时的默认答案与失败值) |
| 唯一那个操作的九件事 | [契约 S-8](v1/contract.md#s-8-holdingtenant读会话持有的租户身份) |
| 跨进程之后什么不再自动成立 | [契约 S-10](v1/contract.md#s-10-装配给的保证-vs-协议须给的保证) |
| 四个消费者的要求落在哪 | [契约第十二节](v1/contract.md#十二消费者核对) |
| 实例 | [examples](v1/examples.md) |
| 证据到哪一步 | [验证与覆盖](verification.md) |
| 还没人裁的 | [契约第十节](v1/contract.md#十已知缺口) |

## 版本包

`v1/` 含 `contract.md` 与 `examples.md`。**不建 Schema、不建形式模型**（理由见契约 S-12）。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。
