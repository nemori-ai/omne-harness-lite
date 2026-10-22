# testing

本目录是 `./testing` 公开入口，提供非耐久替身与独立契约用例。不得装进生产装配。

- [index.ts](index.ts)：公开再导出。
- [case.ts](case.ts)：断言与不适用结果。
- [doubles.ts](doubles.ts)：提供者、账本、守卫与恢复授权替身。
- [provider-conformance.ts](provider-conformance.ts)：提供者套件。
- [environment-conformance.ts](environment-conformance.ts)：执行环境套件。

每条用例新建主体并清理。缺少必要控制钩子时报不适用，不计为通过。
