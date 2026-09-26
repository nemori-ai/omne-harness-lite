# model-response 验证与证据

契约侧的证据义务权威在 [`spec/data/model-response/verification.md`](../../../../spec/data/model-response/verification.md#证据义务)（V-1～V-14）。
本页只登记**落在本节点上的那一部分**；写入纪律归模型请求运行时。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | 第一、二节每个 JSON 块过 `judgeModelResponse`，结果与「预期」逐一对上，拒绝的核对拒绝值；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| 与 `data.messages`、`data.call-accounts` 的副本对齐（`data.messages` 验证入口 V-12 的一部分） | `ResponseId`、`SelectedBy`、`CredentialScope`、`ParameterAdjustment` 的完整断言投影逐字相同；冻结注解差异、原片段 hash 与有效性反例另留证据，不声称片段同字节 | 未开始 | 本节点（[design](design.md#副本定义的对齐放在依赖方)的 Schema 位置限定比较口径） |
| 金额不经浮点 | 超出 2^53 的用量与费用金额读入再写出逐字相同 | 未开始 | 本节点（借 content-blocks 与 call-accounts 的无损读写） |

**不在本节点**：V-2～V-14（写入纪律、序列性质、首 token、脱敏、无隐藏重试、`late`，都归模型请求运行时）。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。

## 独立评审

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-060 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。
