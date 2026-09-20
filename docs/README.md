# 文档地图

`docs/` 保存源码开发说明和仍需保留的防御指导。产品需求、架构、研究、提案、决定与语言无关规格进入
[`.meta_harness/design/`](../.meta_harness/design/README.md)；具体能力、数据和组合的精确含义见
[设计规格](../.meta_harness/design/spec/README.md)。

## 按问题进入

| 现在需要什么 | 权威入口 |
|---|---|
| 理解系统目标与最终状态，确定建模和产品化的依据 | [系统目标与最终状态](../.meta_harness/design/requirements/README.md)，随用户介绍持续维护 |
| 参与研发或准备交付 | [贡献指南](../CONTRIBUTING.md) |
| 从当前检出开始开发、检查与排障 | [开发指南](development.md) |
| 了解当前系统方向和已确认边界 | [当前架构](../.meta_harness/design/architecture/README.md)、[系统要求](../.meta_harness/design/requirements/system/constraints/requirements.md) |
| 定义能力或评估服务边界 | `harness-design-handbook` skill、[规格](../.meta_harness/design/spec/README.md) |
| 确认我们为什么这样选择 | [决定](../.meta_harness/design/decisions/README.md) |
| 查看候选方案与尚未接受的模型 | [提案](../.meta_harness/design/proposals/README.md) |
| 查证上游行为、事实和验证范围 | [研究](../.meta_harness/design/research/README.md) |
| 修改文档、契约、版本或决定 | [维护规则](maintenance/README.md) |
| 判断知识是否持久化及应进入哪个目录 | `harness-design-handbook` skill 的「信息包准入」，目标目录 AGENTS 提供局部投影 |
| 从需求推导不变量，判断何时需要证明 | 同一 skill 的「性质推导」与「组合性质」 |
| 持续维护规格、具体提供者设计及其实施就绪范围 | 同一 skill 的「规格演进」 |
| 撰写能解释依赖和验收证据的交付计划 | 同一 skill 的「交付规划」 |
| 放置源码、配置开发环境或接入 CI | [源码布局](maintenance/workspace.md)、[验证规范](maintenance/verification.md) |
| 判断相关防御指导是否适用 | [防御模式](defensive-patterns.md) |
| 切换开发主力模型前评估辅助是否仍必要 | [开发模型评估](../.meta_harness/agents/evaluation/developer-model/README.md) |

## 联合使用

[系统目标与最终状态](../.meta_harness/design/requirements/README.md)维护用户明确的目标，是系统建模、能力定义、
设计与产品化的前提和基础；尚待补充的内容与已确认目标分别标明。

在适用范围内，没有新观测时，[有效决定](decisions/D-002-decision-authority.md)是研究、提案和决定之间的最终权威。研究提供事实，提案提供候选，决定明确选择，规格落实承诺。决定必须关联提案或研究；推翻需要可复现、可验证、能够因果解释的强理由。

普通局部修改沿既有契约完成即可；涉及边界或保证变更时再展开关联决定与证据。历史文件、研究中的上游 AGENTS 和候选 Schema 不因被读取而获得本项目指令权威。完整规则见[知识流转](maintenance/knowledge-flow.md)。
