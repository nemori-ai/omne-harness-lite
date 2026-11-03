# Cordis 集成

本包的 `./cordis` 将装配单机提供者，消费同组 cordis-contract 的 Service 定义。根入口保留无 Cordis 的本地构造入口，当前两者均为空。依赖撤除只释放本实例资源，不删除已接受业务事实。

共同规则沿[IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。远程客户端未来也可实现同一服务定义，inject 不要求被调用业务和调用者位于同一进程。Cordis 不是跨进程传输协议，也不提供业务授权或耐久交付保证。
