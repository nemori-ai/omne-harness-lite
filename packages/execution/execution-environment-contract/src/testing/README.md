# testing

本目录是 `./testing` 公开入口，提供非耐久替身与独立契约用例。不得装进生产装配。

- [index.ts](index.ts)：公开再导出。
- [case.ts](case.ts)：断言与不适用结果。
- [doubles.ts](doubles.ts)：提供者、账本、守卫、恢复授权、环境授权与作用域绑定替身。提供者替身带配额域、配额、原获取查询、获取列出与结清。
- [provider-conformance.ts](provider-conformance.ts)：提供者套件。
- [environment-conformance.ts](environment-conformance.ts)：执行环境套件。

每条用例新建主体并清理。缺少必要控制钩子时报不适用，不计为通过。

套件函数只组装具名 `ConformanceCase` 清单。各 `check…` 函数拥有一项行为义务。夹具构造与逐项清理独立于行为断言。提供者套件由本包的 `provider-conformance.spec.ts` 直接执行十六项义务，并逐项否定坏提供者。执行环境套件有三十三项，`subject(ports)` 收到套件的访问端口替身，主体用它们构造执行环境，可另给恢复授权。它由登记表成员与 host-local 消费，真实宿主设施保证仍归 host-local。
