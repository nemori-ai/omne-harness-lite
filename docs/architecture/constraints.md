# 已确认的系统要求

[当前架构](README.md) · [规格](../../spec/README.md)

这些要求来自用户已明确的项目方向；[来源记录](../research/project-baseline/README.md)保存整理范围。它们约束后续契约，而不是声称已有实现或完整形式验证。具体字段、谓词和操作只在所属契约中定义。

| ID | 要求 | 落实与当前边界 |
|---|---|---|
| SYS-IDENTITY | 项目名为 omne-harness-lite；以 Cordis 为内核，继承 OMNE 的核心理念与实践，为长期稳定、持续进化的个人助手服务 | [系统定位](README.md#系统定位) |
| SYS-KERNEL | 内核复用 Cordis 与 DSH agent 契约；Agent Loop、Harness 与本项目子系统自行定义实现 | [内核边界](README.md#内核与自建边界)，实现版本仍需固定 |
| SYS-DYNAMIC | 从动态能力、依赖、生命周期、作用域与所有权建模，显式约束结构演化 | [能力建模方法](../architecture-guide/modeling/capabilities.md)，不要求 DDD 战术分类 |
| SYS-SPEC | 语言无关；TLA+ 为行为权威、Alloy 检查结构、JSON Schema 描述数据，支持未来严格验证与跨语言复现 | [规格与证据](../architecture-guide/assurance/specification.md)，具体模型覆盖见规格登记 |
| SYS-DEPLOY | 第一完整版本单机；关键边界可独立扩展为分布式、异构节点与微服务而保持语义 | [部署边界](../architecture-guide/runtime/distribution.md)，不预先要求全部分布式设施 |
| SYS-TENANT | 从第一天支持租户隔离；租户所有的关键对象与跨边界操作显式标识租户，跨租户访问默认拒绝；沿用 OMNE 双层租户结构 | [租户候选](../proposals/tenant-contracts/README.md)，自然人全局身份不被强行归为单一租户 |
| SYS-LLM | 所有模型请求统一经 OpenRouter | [模型候选](../proposals/model-contracts/README.md)，不决定尚未确认的档案与调用细节 |
| SYS-REUSE | 同一概念全系统共用权威定义，跨能力和实现通过引用复用；确有不同语义的投影须明确映射 | [组织规则](../maintenance/organization.md) |
| SYS-EXPERIMENT | 无正式生产部署，允许有设计和验证依据的大胆重构，不增加未经要求的旧版本兼容层 | 历史规格可读不要求实现支持所有历史版本 |
| GOV-DECISION | 无新观测时有效决定为最终权威；决定有提案或研究依据；推翻需可因果解释且可复现、可验证的强理由 | [D-002](../decisions/D-002-decision-authority.md) |
| GOV-MODEL | 开发主力模型切换前，评估它是否仍需强制遵循特定防御辅助 | [D-003](../decisions/D-003-defensive-evaluation.md)，[评估入口](../evaluation/README.md) |

这些 ID 用于引用要求与追踪落实，不替代版本化的精确契约身份。解释性文档、候选 Schema 或检查器不能削弱已确认要求；遇到冲突应定位新观测、接受依据与影响范围。
