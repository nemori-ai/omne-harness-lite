---
kind: decision
id: D-005
status: accepted
scope: OMNE 单机 Agent 运行时的最小身份、租户入口、装配绑定、独占激活与退出契约
date: 2026-09-13
sources:
  - ../proposals/agent-runtime/README.md
acceptance: ../proposals/agent-runtime/README.md#接受记录
supersedes: []
---

# D-005：以受管能力构成 Agent 运行时

## 选择

以 Cordis 的 Context、服务、插件、依赖、作用域和受管生命周期组织运行装配。
本项目维护的 agent fork 承担活体实例的协调与资源生灭；长期 Session 状态、
业务执行驱动和其它能力分别拥有自己的语义。源码可维护权用于直接修订负责的
边界，不为保持上游限制增加无职责的兼容外壳。

采用 [data.agent-runtime-identity v1](../../spec/data/agent-runtime-identity/v1/contract.md)
与 [capability.live-agent v1](../../spec/capabilities/live-agent/v1/contract.md)：

- 长期 SessionRef 与活体 AgentRef 分离；旧生命期能力不重定向到同 Session 新实例。
- 相关读写、控制、事件与解析入口显式验证租户和当前对象操作权限；Context 和因果归因不授权。
- 同一逻辑协调权威在准备前独占预留，资源真正清理完成后才释放占位；发布提交后通知不再否决事实。
- 运行宿主、业务父系、临时调用者和授权委托分别表达；运行时重建不自动终止独立工作。
- 每项工作保持实际绑定；驱动/必要服务换代遵循关准入、排空或合法移交、清理、重新激活的顺序。
- 失败保留退出阶段与残留；自关闭不得等待自身；提供者活到其使用者安全退出，不以卸载返回冒充业务收口。

## 理由与边界

这些选择共同保护租户隔离、同 Session 唯一激活、旧引用安全和可解释的动态替换。
代价是显式的预留、受管工作与提供者使用关系；不能只以一个 Map 和 disposer 宣称
完整生命周期。替代方案、反例及源差异由[设计提案](../proposals/agent-runtime/v1/design.md)
和[来源映射](../proposals/agent-runtime/v1/source-mapping.md)保存。

本决定的需求基线为 `f580718295daaec0f42d3262643e95281c493063`；身份、条款、
当时路径及实际覆盖归[需求消费记录](../proposals/agent-runtime/v1/requirements.md)。
没有取代 D-001–D-004，也没有把旧源草案整体发布为本项目契约。

本轮正式化的授权与实际评审状态分别归[接受记录](../proposals/agent-runtime/README.md#接受记录)
和[独立评审](../proposals/agent-runtime/review.md)。接受的是设计范围，不等于
产品实现、发行包兼容验证或后续源码阶段已验收。完整 Session/Run、持久恢复、
interrupt_then_run、HITL、Definition/IAM 及分布式接管仍由后续契约承担。

Cordis 官方发布版本与选定源入口在源码阶段固定；本轮不安装产品依赖、不导入
其它 DSH 包，不把新规格当作继续实施的自动许可。
