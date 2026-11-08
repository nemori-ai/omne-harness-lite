# Runtime Context 信任入口

本入口按 Session 归属收窄 reader，并只允许应用采用的模式生产者。实现见 [runtime-context-trust.ts](../../src/entry/runtime-context-trust.ts)，公开行为与类型归 [Runtime Context 契约](../../../../packages/context/runtime-context-contract/SPEC.md)。holder 的动作表保持原语义，不带租户的 revoke 仍被拒绝。

reader 先核验主体，再核对铸造租户。只有 `actor.component=sessionWorkPrincipals` 且 `work.owner=session` 的代租户主体可以继续。随后读取本次 eligibility 的 scope 归属，核对租户相同且 `work.work` 等于所属 Session。输入的租户与 scope 引用在首次等待前固定。producer 只接受原 Identity 权威签发的 `sessionModesPrincipals` 代租户主体，其工作用途固定为 `harness.session-context/modes`，key 固定为 `session.modes`，producer 固定为适配器导出的 `sessionModesProducer`。注册和租户失效仅限主体所属租户；publish、invalidate 和 supply 还核对原 scope 归属。supply 从原 `sessionWorkPrincipals` 取得该 scope 所属会话的协调者主体，并再次核验身份与绑定，交给原模式读口。缺来源不可用，未知保持未知，错绑拒绝。

[createSessionScopeSource](../../src/entry/session-scope-source.ts) 组合 Scope 归属来源与现有 `SessionPrincipalBindingSource`。两者确认同一租户与 Session 后，才返回 bound。Scope 来源保留 unbound、unknown、unavailable；Session 读口的 not-bound 映射为 unbound，不一致、失败和缺席映射为 unavailable。应用不解码 scope 摘要，也不读取 Session 私有索引。

装配者创建一份共享来源，将它传给 `createRuntimeContextTrustModule(scopes)`，并让 Execution 的 `readBindings` 返回同一个 `scopes.bindings`。这些参数是应用的消费投影，不是新增服务键或跨线契约。原导出 `runtimeContextTrust` 不带来源。入口清单登记的是 [execution-wiring.ts](../../src/entry/execution-wiring.ts) 的绑定版：它按运行懒建一份共享来源，Session 读口取自入口受信的 `sessionPrincipalBindings`，发行的会话归属读口由 `session-storage` 行提供（R2-D192）；Scope 归属每次调用经 `env.readTrusted` 读 `session-ad03` 提供的受信 `sessionScopeLookup`（R2-D168、R2-D185），根上的同名提供者读不到。任一缺席时绑定答 unavailable。

R2-D25 的 `current()` 只保护进程内读取方的 fiber 代次。服务访问器使用调用方 `this.ctx`，退役不可逆，等待期间退役的旧答案也不当前。采用官方 `@deepseek-ai/cordis` 4.0.4，未使用自有 fork。机制依据见 [调用方上下文](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)。撤权、工作失效与 Request Context 换代没有同步来源到此桥，不闭合 #677。

验证入口是 [信任用例](../../tests/entry/runtime-context-trust.spec.ts) 与 [共享归属用例](../../tests/entry/session-scope-source.spec.ts)。它们使用真实 Identity 和 Cordis，以及明确测试来源。[模式权威用例](../../tests/entry/session-modes-authority.spec.ts)核验固定角色、租户、生产者身份及供值主体。[租户安装用例](../../tests/entry/session-modes-installation.spec.ts)组合真实 Cordis、Context 实现和入口权威；其 Session/SQL 登记依赖为具名测试来源。完整生产捕获和跨进程撤权另行验证。
