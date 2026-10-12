# 本地治理客户端操作提供者

本包实现公共 governance-client-operations。纯工厂显式接收 state、transport 和原可选timeoutMs。
默认10000毫秒、范围1～120000保持；配置验证先于依赖工作。`./cordis` 单独拥有绑定。

共享业务与公开形状归[公共承诺](../../core/governance-client-operations/SPEC.md)，本页拥有具体提供者的资源、绑定和实际关闭责任。持续验证资源由实际接口及应用拥有者维护，不从包存在推断全部组合通过。

同一纯引擎供独立调用与正式Service使用。状态机、缓存、结算、预备输入和观察时间
保留原算法；不把提供者实现搬进公共定义，不保留旧根的公共类型或插件转发。

根动作和use在任何依赖/输入回调前登记完整Promise。单use在开始实际工作前占据busy位。
关闭Promise在取消回调前保存，防止同步重入close产生第二关闭过程。
原网络、远端事实、本地CAS与一次查证完成后才释放本代引用，不关闭借入依赖。
管理拒绝保留及关闭观察资源按公共承诺与已采用CLI生命周期实现；独立调用者仍直接观察原close。

## 管理关闭与绑定坐标

/cordis的governanceClientOperationsPlugin和managedGovernanceClientOperationsPlugin分别使用governance-client-operations-local及governance-client-operations-local-managed限定name。两者共用严格timeoutMs配置及纯工厂，必需clientLocalState和governanceTransport；管理版另需assemblyLifetime及governanceClientCloseObserver，缺席保持PENDING，不回退独立模式。

管理版遵循[公共观察资源](../../core/governance-client-operations/SPEC.md#管理关闭的观察资源)。公共close与OwnedWork.close共用同一原尝试，拒绝后原资源责任继续pending。表示恢复和CLS释放由[应用契约](../../../apps.0.0.1.legacy/cli/SPEC.md#启动前缀与表示释放门)拥有，不由提供者越权放行。独立用户仍直接观察原close，先结束消费者再撤依赖。
