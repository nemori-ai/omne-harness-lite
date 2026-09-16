# Agent 原语源码起点

`@omne-harness-lite/agent` 是本项目维护的 dsh-agent 定向 fork。目前交付两项彼此
区分的表面：默认入口提供目标运行时所消费的公共协议声明；`/baseline` 保留
Registry、工厂委托、事件分发和 initiator 的来源基线，并接入官方
`@deepseek-ai/cordis@4.0.2`。具体 Host、目标 Registry、Factory、Session、Agent
Loop 与模型调用尚未实现。

默认入口 `@omne-harness-lite/agent` 只导出 `RuntimeAccess`、`RuntimeOwner`、
`SessionAttachment`、`Factory`、`Driver`、`RuntimeResource` 及其许可、绑定和结果
类型。它不导出可运行的 `createAgentHost`、Registry 或假 Factory。协议直接引用
work-data、records 与 admission 的公共身份、使用绑定、`GateFrame` 和 `ExactUse`；
类型品牌只提供静态区分，实际提供者仍须从私有状态认回候选及原登记/代次。

实验入口 `@omne-harness-lite/agent/baseline` 只用于明确选择源语义。这里仍保留单字符串登记、原始对象查询、同步 created
否决、单 factory 槽及源 detach/initiator 行为，**没有实现 OMNE v1 的租户门禁、
实例身份和完整退出协议**。private 和作用域过滤都不是安全隔离。

目标契约见 [live-agent v1](../../../.meta_harness/design/spec/capabilities/live-agent/v1/contract.md)，
后续直接修订本包完成目标；本阶段不承诺上游 API 兼容，也不另立产品数据契约。
本地 `Agent` 类型只表达来源算法所读的身份、Session 身份视图与 Context。

目标提供者、注册与生命周期的当前映射见[设计](design.md)，其接受和协议声明编译
均不代表目标运行行为已交付。公共协议的固定消费、打包与边界证据见
[public-protocols](evidence/public-protocols/README.md)。

## 开发

在仓库根安装依赖后，`pnpm --filter @omne-harness-lite/agent... build` 构建本包及
声明依赖，`pnpm --filter @omne-harness-lite/agent typecheck` 编译公共协议消费，
随后 `pnpm --filter @omne-harness-lite/agent test` 运行本包 29 项来源基线测试。
完整来源、公开依赖、逐包产物和跨包生命周期验证使用根命令 `pnpm check`。
构建由 tsc 输出 ESM 与声明；Cordis 的 const enum 由 tsc 内联，测试消费构建产物。

唯一作用域实现及其 21 项测试位于 [scope](../scope/README.md)。本包直接依赖
`@omne-harness-lite/scope/baseline`，不再提供旧 scope-baseline 转发入口。
来源、许可与差异见 [UPSTREAM](UPSTREAM.md) 和 [provenance](provenance.json)，
当前包结构见[布局方案](../../../docs/proposals/core-capabilities/fork/package-layout.md)。
