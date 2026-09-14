# 有效决定与历史

在有效需求前提和适用范围内且没有新观测时，有效决定是研究、提案和决定三者中的最终权威。每份决定必须关联至少一份提案或研究；取代必须提供可复现、可验证、可因果解释的强理由。详细规则见[知识流转](../maintenance/knowledge-flow.md)。

- [D-001：文档与规格体系](D-001-documentation-system.md)
- [D-002：决定权威与因果复议](D-002-decision-authority.md)
- [D-003：防御指导与开发模型评估](D-003-defensive-evaluation.md)
- [D-004：系统目标与产品要求作为设计基础](D-004-requirements-foundation.md)：补充 D-001 的内容归属和 D-002 的有效前提，未撤销旧选择。

- [D-005：Agent 运行时](D-005-agent-runtime.md)：最小身份、租户入口、动态装配与退出边界。
- [D-006：本批 DSH 源码采用](D-006-dsh-core-adoption.md)：10 个主体与 4 个限定支撑来源、依赖裁剪及逐专题设计门槛。
- [D-007：运行时共同边界与附着组合](D-007-runtime-composition.md)：状态归属、四类提供者交接及 Agent/Session 组合 v1。

状态以各决定的元数据为准。接受不等于实现或验证完成。

- [D-008：核心能力与共同准入](D-008-core-capabilities.md)。
- [D-009：按能力族和职责分包](D-009-package-organization.md)：从第一天采用能力族目录与实际职责叶子包，来源/构建批次不作为聚包理由。
- [D-010：共享诊断设施与观测责任](D-010-shared-diagnostics.md)：P1 的日志/trace 复用、注入、有限资源与业务事实边界；后续桥接和查询仍须独立验证。
- [D-011：诊断目录的共同所有权](D-011-diagnostics-directory-ownership.md)：根据真实目录竞争反例，限定修订创建入口、共同容量与关闭未知前提；其余 D-010 选择保留。
