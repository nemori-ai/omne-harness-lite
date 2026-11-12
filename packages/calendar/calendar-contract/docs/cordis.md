# Cordis 集成

本包不适用 Cordis，不提供绑定入口，也不依赖 Cordis。服务定义由同组 cordis-contract 成员唯一拥有。

共同规则沿[IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。远程客户端未来也可实现同一服务定义，inject 不要求被调用业务和调用者位于同一进程。Cordis 不是跨进程传输协议，也不提供业务授权或耐久交付保证。
