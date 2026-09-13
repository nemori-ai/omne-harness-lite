# 来源与实现映射边界

项目采用官方 `@deepseek-ai/cordis@4.0.2`，当前发布物依赖由根锁文件和 agent 包
固定。官方资料核对提交为 `c291e7961a515f6d7af9304e7fd1d257929aef26`，本轮沿用
既有原件、发行物完整性和有限测试证据，不将源码快照与发布 tarball 未经核对地等同。

- [Cordis Service](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/service.md)：服务提供具名能力表面，注册随拥有 Fiber 管理；服务已注册不证明其业务前提全部满足。
- [生命周期与 effects](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/02-lifecycle-and-effects.md)：插件实例和受管资源支持组合与清理。项目的发布屏障、耐久事实、真实静止和业务授权是额外契约，不由 disposer 自动提供。
- [事件](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/events.md)：进程内交互机制；具体 Session 写入确认由存储与业务能力承担，生命周期通知不能代替日志提交。
- [scope](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/scope/README.md)：参与协议的贡献/事件路由；本项目不据此推导租户授权或通用会话状态。

对当前官方发行物的既有有限验证，沿 [agent fork 的记录](../agent-runtime/fork/review.md)；
源算法的历史观察沿[源基线](../agent-runtime/source-baseline/README.md)。本轮提出的
共同接口是 OMNE 的设计选择，不声称上游存在同名 API。

Context/Session/过程帧交接与初步候选由[输入快照](evidence/inputs.json)保留。
完整 DSH 复用及许可报告仍留主检出 tmp，本轮不将其整体复制为正式 research。
具体源码选择继续由 [D-006](../../decisions/D-006-dsh-core-adoption.md)拥有，没有新增来源包。
