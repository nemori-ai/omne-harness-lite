# tool-host-local 源码索引

- [源码职责与现状](README.md)。
- [根入口](index.ts)。
- [本地启动协调器](start-coordinator.ts)。
- [环境调度工厂](scheduled-environment.ts)与[调度策略](environment-policy.ts)。
- [环境入口校验](environment-input.ts)。
- [凭据适配工厂](credentials.ts)。
- [后续 Cordis 插件设计](../docs/cordis.md)。
- [公开接口](../docs/public-api.md)。
- [包索引](../index.md)。

- [受信环境诊断依赖](environment-diagnostics.ts)。
- [宿主时钟](clock.ts)。
- [绑定登记表](bindings.ts)与 [Catalog](catalog.ts)。
- [缺席端口](absent-ports.ts)。
- [账本守卫的组装](ledger-guards.ts)、[来源签发与操作身份](invocation-source.ts)、[授予核验](grant-verifiers.ts)、[启动守卫](start-guard.ts)与[文本结果](text-results.ts)。
