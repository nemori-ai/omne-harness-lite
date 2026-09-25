# 装配清单（窄口）

**一个会话的[装配清单](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest)里，按序号条件追加换表记录、读头与每一类最后一条、按表时刻读回任何一条；另有一个查询：这个会话里某些依赖名此刻在不在场。**
这是按会话资产注册表对装配清单提供者的要求（R-M1～R-M9）与施工简报「`dependencyPresence` 并入作一个查询」定的**窄口接口**，不是装配清单的契约——那一份归 PF-004 那一程。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.assembly-manifest, 1)`
- **状态**：`candidate`（2026-09-25 起草），**未接受、未冻结**
- **catalog 映射**：已登记为 `candidate`；`family=capabilities`、`topic=assembly-manifest`、
  `contract_path=spec/capabilities/assembly-manifest/v1/contract.md`；`resources` 含契约与 `examples.md`；
  依赖五项：`data.identity-values`、`data.offer-expiry`、`data.messages`、`data.asset-model`、`data.tool-definition`（均 v1），clauses 取自[契约 S-4](v1/contract.md#s-4-依赖方向与被消费的面)；**不依赖 `capability.asset-registry`**（它是消费者）
- **formal-tasks 映射**：无（[契约 S-25](v1/contract.md#s-25-本版选用哪些形式工件) 说明为什么不建模）
- **提供者/装配映射**：最小提供者是本机 JSON 文件或 sqlite 表（[契约第十一节](v1/contract.md#十一提供者映射)），**节点由主线另立，尚无**；它取代验收装配里的同名替身

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约拥有换表记录的全序、条件追加、求值引用的产生与唯一、表时刻不回退、留存；**记录的内容**归写入方（会话资产注册表），**装配清单的其余属性**归 PF-004 那一程 |
| 为什么是 capability 而不是 data | 每个操作有前置、提交点、失败集合与缺席默认；有状态（一列只增的记录）和它的判定 |
| 为什么现在立、而且这么窄 | 产品负责人 2026-09-25 同意把验收替身换成「接口契约 ＋ 最小提供者」、接口按消费者需要定窄口（主线施工简报；尚无决定记录）。会话资产注册表的每一个换表操作的提交点就落在这里（据点装配 C-2） |
| 为什么把 `dependencyPresence` 放在这里 | **简报裁定**。本契约按它收下接口，同时把「它的事实不是装配清单记下的构成、没有来源」登为 [G-2](v1/contract.md#十已知缺口) 并报主线 |
| 精确依赖 | 见上；依赖方向单向 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 一条换表记录里有什么、哪些归写入方 | [契约 S-6](v1/contract.md#s-6-记录与它的壳) |
| 求值引用怎样产生、怎样认回 | [契约 S-8](v1/contract.md#s-8-求值引用-evaluationref) |
| 条件追加怎样挡住两路并发 | [契约 S-12](v1/contract.md#s-12-条件追加判定与写入是同一步) |
| 四个操作的九件事 | [契约第四节](v1/contract.md#四操作) |
| 回执丢了怎么办 | [契约 S-22](v1/contract.md#s-22-回执丢失与结果未知) |
| 在场判定的三种答 | [契约 S-10](v1/contract.md#s-10-在场事实)、[S-19](v1/contract.md#s-19-dependencypresence依赖名此刻在不在场) |
| 会话资产注册表 R-M1～R-M9 各落在哪 | [契约第十二节](v1/contract.md#十二消费者核对) |
| 实例 | [examples](v1/examples.md) |
| 证据到哪一步 | [验证与覆盖](verification.md) |
| 还没人裁的 | [契约第十节](v1/contract.md#十已知缺口) |

## 版本包

`v1/` 含 `contract.md` 与 `examples.md`。**不建 Schema、不建形式模型**（理由见契约 S-25）。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。
