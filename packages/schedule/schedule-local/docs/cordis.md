# Cordis 集成

本包的 `./cordis` 将装配单机提供者，消费同组cordis-contract的Service定义；该绑定入口尚未实现。根入口已经提供无Cordis依赖的worker和SQL后端构造。宿主负责SqlStorage生命周期及worker.dispose。依赖撤除不能删除已接受业务事实。

共同规则沿[IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。远程客户端未来也可实现同一服务定义，inject 不要求被调用业务和调用者位于同一进程。Cordis 不是跨进程传输协议，也不提供业务授权或耐久交付保证。
