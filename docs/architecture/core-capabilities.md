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

当前语义证据是[有限模型、反例与结构样例](../proposals/core-capabilities/verification.md)，
实际提供者和应用组合仍须分别验收。D-006 fork 与 D-009 职责包重组已完成，
[源码起点证据](../proposals/core-capabilities/fork/package-layout-delivery.md)不等于目标产品。
work-data 与 records 端口/codec 已接受，实际范围分别由
[数据证据](../proposals/core-capabilities/implementation/evidence/p0-work-data/hub-summary.json)和
[记录证据](../proposals/core-capabilities/implementation/evidence/p0-records/hub-summary.json)限定。

[D-010](../decisions/D-010-shared-diagnostics.md)与
[D-011](../decisions/D-011-diagnostics-directory-ownership.md)固定共享诊断及目录
所有权的实施选择，当前接口归[diagnostics](../../packages/observation/diagnostics/design.md)。
D1 产品仍待最终接受，真实 JSONL writer、共同准入、Agent/Session/工具运行闭环
均未交付；OpenRouter、执行隔离、媒体 GC 和账务来源也没有完整目标验收。
已接受的提供者映射与真实装配责任从[应用设计](../../apps/local-harness/design.md)进入，
每个成员的设计接受与产品符合性分别核对。
