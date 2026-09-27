# 装配清单（窄口）

**2026-09-27 新候选 v3**：[契约](v3/contract.md)在冻结 v2 的四操作之外增加 `readEvaluation(session)`，在一次一致读中固定当前头，再按提交序号读取本会话上界内最近一次 `given`/`mint` 的完整求值与有序组成。空头、投影缺失/畸形和读取不可用分别收场；旧表收窄的 `reuse` 不让该读面回退，但其历史来源仍由原读面保留。本方法只读已提交求值，不代证当下层配值。写方与求值 v4 的采用受 [G-4](v3/contract.md#十已知缺口) 约束；完整 Agent 定义与自动初选不由此闭合。v3 为 **candidate、未接受**；v2 保持 accepted。资源为 `v3/contract.md` 与 [实例](v3/examples.md)，不附能力 Schema，也不新增形式模型；实际检查与未执行义务见 [verification](verification.md#v3-候选求值投影读面2026-09-27)。

**一个会话的[装配清单](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest)里，按序号条件追加换表记录、读头与每一类最后一条、按表时刻读回任何一条；另有一个查询：这个会话里某些依赖名此刻在不在场。**
这是按会话资产注册表对装配清单提供者的要求（R-M1～R-M9）与施工简报「`dependencyPresence` 并入作一个查询」定的**窄口接口**，不是装配清单的契约——那一份归 PF-004 那一程。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.assembly-manifest, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 `accepted`；`family=capabilities`、`topic=assembly-manifest`、
  `contract_path=spec/capabilities/assembly-manifest/v2/contract.md`；`resources` 含契约与 `examples.md`；
  依赖五项：`data.identity-values`、`data.offer-expiry`、`data.messages`、`data.asset-model`、`data.tool-definition`（均 v1），clauses 取自[契约 S-4](v2/contract.md#s-4-依赖方向与被消费的面)；**不依赖 `capability.asset-registry`**（它是消费者）
- **formal-tasks 映射**：无（[契约 S-25](v2/contract.md#s-25-本版选用哪些形式工件) 说明为什么不建模）
- **提供者/装配映射**：[packages/assets/assembly-manifest-store](../../../realization/packages/assets/assembly-manifest-store/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约拥有换表记录的全序、条件追加、求值引用的产生与唯一、表时刻不回退、留存；**记录的内容**归写入方（会话资产注册表），**装配清单的其余属性**归 PF-004 那一程 |
| 为什么是 capability 而不是 data | 每个操作有前置、提交点、失败集合与缺席默认；有状态（一列只增的记录）和它的判定 |
| 为什么现在立、而且这么窄 | 产品负责人 2026-09-25 同意把验收替身换成「接口契约 ＋ 最小提供者」、接口按消费者需要定窄口（[D-063 R-1](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）。会话资产注册表的每一个换表操作的提交点就落在这里（据点装配 C-2） |
| 为什么把 `dependencyPresence` 放在这里 | **简报裁定**。本契约按它收下接口，同时把「它的事实不是装配清单记下的构成、没有来源」登为 [G-2](v2/contract.md#十已知缺口) 并报主线 |
| 精确依赖 | 见上；依赖方向单向 |
| 接受状态 | 已接受（D-061，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 一条换表记录里有什么、哪些归写入方 | [契约 S-6](v2/contract.md#s-6-记录与它的壳) |
| 求值引用怎样产生、怎样认回 | [契约 S-8](v2/contract.md#s-8-求值引用-evaluationref) |
| 条件追加怎样挡住两路并发 | [契约 S-12](v2/contract.md#s-12-条件追加判定与写入是同一步) |
| 四个操作的九件事 | [契约第四节](v2/contract.md#四操作) |
| 回执丢了怎么办 | [契约 S-22](v2/contract.md#s-22-回执丢失与结果未知) |
| 在场判定的三种答 | [契约 S-10](v2/contract.md#s-10-在场事实)、[S-19](v2/contract.md#s-19-dependencypresence依赖名此刻在不在场) |
| 会话资产注册表 R-M1～R-M9 各落在哪 | [契约第十二节](v2/contract.md#十二消费者核对) |
| 实例 | [examples](v2/examples.md) |
| 证据到哪一步 | [验证与覆盖](verification.md) |
| 还没人裁的 | [契约第十节](v2/contract.md#十已知缺口) |

## 版本包

`v2/` 含 `contract.md` 与 `examples.md`。**不建 Schema、不建形式模型**（理由见契约 S-25）。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `capability.assembly-manifest` v2 的全部条款，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。

## 2026-09-27 v4 候选：固定头上界的给定记录读取

[完整契约](v4/contract.md)与[规范实例](v4/examples.md)形成 candidate，未接受。继承 v3 五操作，新增只读 readGiven(session,head)，范围内无给定记录明确 none；只选择并无损返回原记录，不解释 filledBy/资产根。 v3 已由 [D-073](../../../record/decisions/model-current-input-contracts-adoption/README.md) 接受且保持冻结；上文早期 v3 候选文字为历史记录，现行接受状态以 [registry](../../../registry/README.md) 为准，新增候选不替代 v3。无新 Schema/身份/状态转移；S-36/S-37 的实际证据与未开始项见 [verification](verification.md#v4-候选原完整填表来源2026-09-27)。

[D-079](../../../record/decisions/model-original-fill-adoption/decision.md)接受v4，六操作；旧v3仍独立冻结，消费者显式采用。
