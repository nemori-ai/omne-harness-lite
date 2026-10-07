# 已确认的跨系统约束

本信息包拥有 SYS-IDENTITY、SYS-KERNEL、SYS-SPEC、SYS-DEPLOY、SYS-TENANT、SYS-LLM、SYS-EXPERIMENT、SYS-OPEN 的当前确认范围。
它保存需要兑现的结果与明确未决项，不选择能力边界、Cordis 插件或提供者。

## 覆盖与边界

[需求正文](requirements.md)维护八项要求。实际采用、实现与验证分别由当前拥有者维护，不能从设计文件存在推断完成。

| 要求 | 当前阅读入口 | 核对范围 |
|---|---|---|
| SYS-IDENTITY、SYS-TENANT | [身份与租户产品入口](../../product/README.md)、[架构维护入口](../../architecture/README.md) | 自然人身份与租户成员关系分开；跨能力消费及真实组合须逐条核对。 |
| SYS-KERNEL | [架构维护入口](../../architecture/README.md) | 仅采用 Cordis；集成装配约束不替代领域语义。 |
| SYS-SPEC | [架构维护入口](../../architecture/README.md)、[未迁规格入口](../../spec/README.md) | 公开接口、薄规格、相称模型与测试；未迁承诺继续按精确旧源消费。 |
| SYS-DEPLOY | [应用映射入口](../../realization/README.md) | 单机交付与未来独立部署能力分开；多机器、远程协议和接管不由单机测试证明。 |
| SYS-LLM | [模型契约入口](../../spec/capabilities/model-request-runtime/README.md) | OpenRouter 出口、attempt 状态权威与真实调用分别验证。 |
| SYS-EXPERIMENT | [需求正文](requirements.md#sys-experiment) | 设计、规格建模与实验性演进是当前阶段约束，不是待实现的产品能力。 |
| SYS-OPEN | [架构维护入口](../../architecture/README.md) | 独立函数与 runtime 消费分开；公开组件内部构件可替换、可单独使用。 |

全局覆盖分析须对每项给出 covered / partial / uncovered / unknown、组合前提和验证范围。
本页只导航当前拥有者，不冒充条款级覆盖结论。形成过程和单次执行结果留本工作树 tmp。
