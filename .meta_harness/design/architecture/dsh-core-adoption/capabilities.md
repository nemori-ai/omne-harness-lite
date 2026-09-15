# 复用边界能力地图

| 责任 | 复用/自有边界 | 能力归属 | 当前证据与限制 |
|---|---|---|---|
| 动态组合 | 官方 `@deepseek-ai/cordis@4.0.2` | Context、服务、插件、依赖、受管 effect 与事件为内核机制 | 锁文件固定版本；机制不提供产品授权、耐久 Session 或外部效果回滚 |
| 活体实例原语 | 定向维护 `dsh-scope`、`dsh-agent` 来源 | 项目 `capability.live-agent` 重新定义产品契约 | 当前 fork 是实验起点，未兑现 AgentHost/Registry 完整行为 |
| Session/Run/工具/模型 | 可能复用选定 DSH 源算法 | 各自独立产品能力 | 不由 F 接受、实现或证明；不得称为完整 DSH Harness |

源码来源、包、能力和插件不一一对应。只有独立能力维度需要独立插件边界；数据对象无需成为插件。
