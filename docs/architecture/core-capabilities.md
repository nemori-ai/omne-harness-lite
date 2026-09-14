# 本批核心能力

[D-008](../decisions/D-008-core-capabilities.md)接受本批目标契约。正式身份与版本
从 [catalog](../../spec/catalog.json)查找；[设计范围](../proposals/core-capabilities/requirements.md)
说明需求与相邻缺口。既有 live-agent 和运行附着 v1 不变。

数据拥有身份、冻结 Action、声明和内容；租户治理拥有成员、定义及权益，
动作授权拥有当前配置和 allow/deny/ask 判定。工具装载时把声明索引与贡献
共同发布，调用时重新判定，ask 交由耐久人类决定能力；请求池是同一事实
的读写入口。普通用户内容不能伪造调用结果或待答回执。

Session/Run 拥有历史、输入队列、驱动位置与控制；人类请求按 continuation
独立接续，仍共享单会话串行驱动。工具执行 owner 拥有原调用/attempt、停止
与后台责任。强停不以取消已受理冒充物理停止，迟到启动必须被墓碑或隔离挡住。

模型能力拥有候选、请求、上下文装配与下一 Run 选择，OpenRouter 为统一出口；
媒体能力拥有原件、引用保留与交付；预算/账务、命令入口、工程观测各保留自己的
状态。共享提交域协调明确的原子关系，不把这些权威合成万能状态服务。

首版短门位置为逻辑准入点，实际效果等耐久确认；存储拥有记录、写入权和水位。
跨域采用耐久意图与目标去重回执，未来拆分必须维持等价语义。Cordis 服务／
Context／依赖和事件供给运行时组合，不替代租户权限或外部效果核实。

当前证据是有限模型、反例和结构样例；真实 JSONL、执行隔离、OpenRouter、
媒体 GC、账务来源和应用组合仍未完成目标验收。D-006 定向 fork 和 D-009
职责包重组已完成，当前已有 [14 个实际包的源码起点](../proposals/core-capabilities/fork/package-layout-delivery.md)。
后续按[第一批二次开发工作包](../proposals/core-capabilities/implementation/README.md)
实现可恢复工具审批与 OpenRouter 文本流程。共享数据 work-data 已完成目标 DTO、
严格 JSON、Schema 和独立产物验收，见[实际证据](../proposals/core-capabilities/implementation/evidence/p0-work-data/hub-summary.json)；
它尚不提供记录、准入或 Agent/Session/工具运行闭环。

[D-010](../decisions/D-010-shared-diagnostics.md)固定 P1 共享日志/trace 设施及
jsonl/admission 的注入边界；关键审计仍归业务耐久事实。当前通过的是库与机制
可行性，diagnostics 产品、真实消费组合、Cordis 桥和受治理读面仍按阶段验证。
