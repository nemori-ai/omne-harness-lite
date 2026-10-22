# tests

持续验证使用真实 Cordis 4.0.4，生产提供者不在本成员。

- [cordis-entry.spec.ts](cordis-entry.spec.ts)：装载撤除、对象 inject、祖先 scope、调用方 fiber、遮蔽、拒绝和位置参数事件；读取 emit 的 Context.filter/global 与 ctx.set 不派发领域事件。
- [assembly.spec.ts](assembly.spec.ts)：托管输入拒绝、作用域一致性、逐次端口绑定与卸载后旧操作拒绝。
- [boundary.spec.ts](boundary.spec.ts)：源码和产物不依赖生产实现；共享导出清单检查。
- [contract.spec-d.ts](contract.spec-d.ts)：登记签名复用、操作入口和显式 scope 类型。
- [provider.ts](provider.ts)：仅供探针的非持久提供者，不是生产登记表。

使用 Node 26 经仓库测试名额执行本成员 typecheck/test。测试通过不代表生产提供者接受，也不提升共享 basis 状态。
