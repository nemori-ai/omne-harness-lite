# Agent Definition 正文的根输入投影

本主题拥有 Agent Definition 正文中 `references` 与 `attributes` 两个槽位的窄约定，供装配与求值调用者从所选版本取得真实输入。它不定义完整 Agent Definition，不新增身份、运行对象或服务。

- 契约坐标：`(omne-harness-lite-design-2026-09-15, data.agent-definition, 1)`。
- 版本状态：v1 candidate；未接受、未冻结。候选登记由本批唯一 registry 集成者完成，接受状态只看 [catalog](../../../registry/catalog.json)。
- 语义拥有者：本正文契约；持续消费者是资产求值、资产注册表与装配清单的根输入读取方。
- 采用边界：已接受 `data.asset-model/v3` 的不透明正文不得因本候选存在而自动开放解释；消费者须显式采用本契约已接受的精确版本。
- 映射：本包不提供实现映射，实际提供者与装配采用另行登记。

| 问题 | 入口 |
|---|---|
| 两个槽位的精确含义、边界与依赖 | [v1 contract](v1/contract.md) |
| 形状 | [v1 Schema](v1/agent-definition.schema.json) |
| 正反值与消费者场景 | [v1 examples](v1/examples.md) |
| 实际检查与未完成义务 | [verification](verification.md) |

规范资源恰为 v1 下上述三份文件。没有独立状态转移，不设空 TLA+ 模型；结构约束由 Schema、接收边界检查及规范场景表达。推荐或接受本版不自动升级任何消费者。
