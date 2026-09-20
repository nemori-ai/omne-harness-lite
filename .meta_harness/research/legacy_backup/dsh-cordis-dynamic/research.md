# Cordis/DSH 动态组合边界

官方材料支持 Context、服务依赖、插件树、受管 effect 与 HMR 是组合机制；DSH agent/scope 提供可复用运行原语。
这些事实不支持“Context 可见即获授权”“dispose 已完成业务收口”或“上游 Agent 行为就是本项目契约”。

设计因此直接采用官方 Cordis，通过项目维护的 agent/scope fork 实现 `live-agent`，并由 binding 组合显式补齐当前权限、attachment、工作所有权和真实释放。
具体 API 若影响实现，provider 阶段须按采用包 `4.0.2` 与 fork 修订再次核对；本研究不把上游 HEAD 当采用证据。
