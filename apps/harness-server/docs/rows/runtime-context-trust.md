# Runtime Context 信任入口

本入口兑现 R2-D29 的 reader 收窄与 producer 拒绝。实现见 [runtime-context-trust.ts](../../src/entry/runtime-context-trust.ts)，公开行为与类型归 [Runtime Context 契约](../../../../packages/context/runtime-context-contract/SPEC.md)。holder 的动作表保持原语义，不带租户的 revoke 仍被拒绝。

reader 先核验主体，再核对铸造租户。只有 `actor.component=sessionWorkPrincipals` 且 `work.owner=session` 的代租户主体可以继续。随后读取本次 eligibility 的 scope 归属，核对租户相同且 `work.work` 等于所属 Session。输入的租户与 scope 引用在首次等待前固定。producer 在核验可用后恒答 refused，核验不可用或抛出仍答 unavailable。

[createSessionScopeSource](../../src/entry/session-scope-source.ts) 组合 Scope 归属来源与现有 `SessionPrincipalBindingSource`。两者确认同一租户与 Session 后，才返回 bound。Scope 来源保留 unbound、unknown、unavailable；Session 读口的 not-bound 映射为 unbound，不一致、失败和缺席映射为 unavailable。应用不解码 scope 摘要，也不读取 Session 私有索引。

装配者创建一份共享来源，将它传给 `createRuntimeContextTrustModule(scopes)`，并让 Execution 的 `readBindings` 返回同一个 `scopes.bindings`。这些参数是应用的消费投影，不是新增服务键或跨线契约。原导出 `runtimeContextTrust` 不带来源。入口清单登记的是 [execution-wiring.ts](../../src/entry/execution-wiring.ts) 的绑定版：它按运行懒建一份共享来源，Session 读口取自入口受信的 `sessionPrincipalBindings`，Scope 归属读口缺席，所以生产绑定默认 unavailable。当前基线没有接入 AD-03 的公开归属读口；测试中的显式来源不能证明生产来源就绪。

R2-D25 的 `current()` 只保护进程内读取方的 fiber 代次。服务访问器使用调用方 `this.ctx`，退役不可逆，等待期间退役的旧答案也不当前。采用官方 `@deepseek-ai/cordis` 4.0.4，未使用自有 fork。机制依据见 [调用方上下文](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)。撤权、工作失效与 Request Context 换代没有同步来源到此桥，不闭合 #677。

验证入口是 [信任用例](../../tests/entry/runtime-context-trust.spec.ts) 与 [共享归属用例](../../tests/entry/session-scope-source.spec.ts)。它们使用真实 Identity 和 Cordis，以及明确测试来源。它们不证明 AD-03 生产接线、耐久恢复或跨进程撤权。
