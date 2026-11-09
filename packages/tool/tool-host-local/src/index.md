# tool-host-local 源码索引

- [源码职责与现状](README.md)。
- [根入口](index.ts)。
- [材料时间源](material-clock.ts)：非递减有效时间，不持有业务期限或持久水位。
- [本地启动协调器](start-coordinator.ts)。
- [可信许可需求来源](start-permit-requirements.ts)。
- [环境调度工厂](scheduled-environment.ts)与[调度策略](environment-policy.ts)。
- [环境入口校验](environment-input.ts)。
- [凭据适配工厂](credentials.ts)。
- [Cordis 宿主与绑定入口](cordis.ts)，见[集成说明](../docs/cordis.md)。
- [公开接口](../docs/public-api.md)。
- [包索引](../index.md)。

- [受信环境诊断依赖](environment-diagnostics.ts)。
- [宿主时钟](clock.ts)。
- [绑定登记表](bindings.ts)与 [Catalog](catalog.ts)。
- [缺席端口](absent-ports.ts)。
- [账本守卫的组装](ledger-guards.ts)、[来源签发与操作身份](invocation-source.ts)、[授予核验](grant-verifiers.ts)、[启动守卫](start-guard.ts)与[文本结果](text-results.ts)。

- [作者装载器](author-loader.ts)核合法设置、定义与 schema。
- [执行绑定](executor-binding.ts)固定作者与启动身份，[活体执行](live-author-execution.ts)保存逐调用事实及停止状态。
- [作者入口](author.ts)导出[贡献实现](contribute-tool.ts)与[换代协调者](author-generations.ts)，实现文件不反向导入入口。
