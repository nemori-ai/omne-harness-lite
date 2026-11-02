# Execution 授权入口

[execution-authorities.ts](../../src/entry/execution-authorities.ts) 提供 AS-10 的三个定义类子类。公开端口归 [Execution 契约](../../../../packages/execution/execution-environment-contract/SPEC.md) 与 [Cordis 定义](../../../../packages/execution/execution-environment-cordis-contract/SPEC.md)。这些运行时对象不进入插件树或可序列化配置。

装配者通过 `createExecutionAuthorityModules({ readBindings, readRecovery })` 取得三个入口模块，登记到入口对象列表。键分别取自 `ExecutionEnvironmentAuthorityService`、`ExecutionScopeBindingService` 和 `ExecutionRecoveryAuthorityService`，不另造服务键。`readBindings` 每次返回共享 `createSessionScopeSource` 的 `bindings`。`readRecovery` 每次返回维护拥有者提供的受信 `RecoveryAuthority`。回调捕获入口的受信来源，不能从请求者上下文读取授权来源。

普通授权先核验主体。只有代租户主体且主体租户与显式 access 租户一致时才继续。resolve 与 describe 核对 scope 绑定；acquire 与 inspect-original 同时核对 original 的租户与 scope；inspect 核对动作租户。缺少来源或来源抛出答 unavailable。unbound 答 refused，unknown 保持 unknown。绑定端口保留 ScopeBindingSource 的四态。

恢复入口逐次委派受信来源，保留 authorized、notAuthorized、unavailable 三态。缺少来源、来源抛出或非法回答均答 unavailable。`createRecoveryAccess` 的品牌只标识对象形状，不授予恢复许可。当前基线没有 AD-15 的生产恢复授权来源，默认不开放恢复。

普通授权的 current 使用 [Runtime Context 信任入口](runtime-context-trust.md) 的进程代次桥。它绑定读取方 fiber，在第一次等待前捕获。一个读取方退役不影响其他读取方，旧答案不复活。撤权、工作失效与 Request Context 换代没有同步来源到此桥，不闭合 #677。

[组合用例](../../tests/rows/execution-authorities/authorities.spec.ts) 使用真实 Identity、Cordis 和 Execution Registry。Scope 来源、恢复授予与环境提供者使用显式测试实现。测试不启动外部进程，不证明真实后端、AD-03 或 AD-15 的生产接线就绪。Windows 与 Linux 的验证结果分别记录，不能互相替代。
