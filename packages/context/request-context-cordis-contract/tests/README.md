# tests

持续验证使用真实 Cordis 4.0.4，生产提供者不在本成员。

- [cordis-entry.spec.ts](cordis-entry.spec.ts)：装载撤除、对象 inject、祖先 scope、调用方 fiber、遮蔽、拒绝和位置参数事件；读取 emit 的 Context.filter/global 与 ctx.set 不派发领域事件。
- [assembly.spec.ts](assembly.spec.ts)：未登记目标不可用、同目标冲突与替换、登记随登记者 fiber 撤除、旧句柄撤除不删后继、现取贡献、作用域一致性与卸载后旧操作拒绝。
- [boundary.spec.ts](boundary.spec.ts)：源码和产物不依赖生产实现；共享导出清单检查。
- [contract.spec-d.ts](contract.spec-d.ts)：登记签名复用、操作入口和显式 scope 类型。
- [trust-service.spec.ts](trust-service.spec.ts)、[trust-types.spec-d.ts](trust-types.spec-d.ts)：信任键与收件口键的装载、缺席、键只写一次，以及 `RequestContextTrust` 的类型反例。
- [scripted-trust.spec.ts](scripted-trust.spec.ts)：脚本替身逐字段匹配，每个字段一条只改该字段的用例。
- [trust-conformance.spec.ts](trust-conformance.spec.ts)、[trust-registry.ts](trust-registry.ts)：套件对参考登记表通过，对九种单一缺陷各恰有一个用例变红。
- [testing-entry.spec.ts](testing-entry.spec.ts)：`./testing` 的导出条件、产物解析、不导入提供者成员、根入口不含 testing。
- [provider.ts](provider.ts)：仅供探针的非持久提供者，不是生产登记表。

使用 Node 26 经仓库测试名额执行本成员 typecheck/test。测试通过不代表生产提供者接受，也不提升共享 basis 状态。
