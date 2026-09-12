# 文档与规格维护规范

本目录规定项目设计材料和语言无关规格的维护方式。它落实
[D-001](../decisions/D-001-documentation-system.md)、[D-002](../decisions/D-002-decision-authority.md)
和 [D-003](../decisions/D-003-defensive-evaluation.md)；这些决定在各自范围内且没有新观测时具有最终权威。

| 规范 | 回答的问题 |
|---|---|
| [组织与权威](organization.md) | 一项内容归谁、放哪里、怎样避免重复定义？ |
| [机器可检查的元数据](metadata.md) | 决定、catalog、冻结表和历史归档必须有哪些字段？ |
| [版本、状态与引用](versioning.md) | 什么可以作为当前依赖，怎样接受、冻结和取代？ |
| [验证与检查](verification.md) | 哪些检查存在、如何报告证据与覆盖缺口？ |
| [源码布局与 workspace](workspace.md) | 产品包、应用、工具、脚本与各语言开发环境怎样分工？ |
| [知识流转](knowledge-flow.md) | 研究、提案、决定和规格如何共同形成可追溯判断？ |
| [防御演化](defensive-evolution.md) | 怎样维护、评估、简化或退出防御指导？ |

`docs/README.md` 与 `spec/README.md` 是读者入口，本目录不取代具体契约、决定或研究的权威。变更架构边界时，按根 `AGENTS.md` 使用 architecture-design skill 定位当前架构、决定和规格。

已完成迁移的范围与来源去向见[文档体系迁移记录](migrations/2026-09-12-documentation-system.md)。
