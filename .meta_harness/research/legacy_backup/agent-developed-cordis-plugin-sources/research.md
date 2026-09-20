# Agent 开发插件：运行边界事实

Cordis 的动态插件/effect 机制能组织注册与清理，但不是恶意代码沙箱，也不提供产品级构建、审批、发布、回滚或持久装配。
因此 F 只规定 live-agent 对有限信任执行边界的前提，以及贡献被工作绑定后的精确 use/retire/release；PF-016 的开发、验证、部署与治理仍由后续独立能力承载。

旧提案曾用 T3～T5 标记测试义务；R 的正式 clause 只有 PF-016.C1～C7。本轮把 T3～T5 作为从 C 条款和旧 requirements 表格推导的设计义务 provenance，绝不登记为正式需求坐标。
