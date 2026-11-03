# Cordis 集成

本包的 `./cordis` 将声明 inject，消费同组 cordis-contract 的服务键，并沿 Tool 贡献协议注册工具。工具不能依赖 -local，也不能自行构造业务服务。当前入口为空，尚无工具注册。

共同规则沿[IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。远程客户端未来也可实现同一服务定义，inject 不要求被调用业务和调用者位于同一进程。Cordis 不是跨进程传输协议，也不提供业务授权或耐久交付保证。
