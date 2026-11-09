# tool-host-local 源码

本目录拥有本提供者的独立工厂与内部实现。

- [index.ts](index.ts) 是根入口 `.`，导出启动协调、环境调度与凭据工厂。
- [scheduled-environment.ts](scheduled-environment.ts) 把 [调度策略](environment-policy.ts) 接入环境四动词。实际获取事实由环境提供者拥有。
- [environment-diagnostics.ts](environment-diagnostics.ts) 定义显式受信诊断依赖与固定安全标记。
- [environment-input.ts](environment-input.ts) 核租户、调用、原操作与实时环境采用，并固定准备输入。
- [credentials.ts](credentials.ts) 选择配置引用，并在使用前核实际秘密绑定。真实 vault 尚未交付。
- [web.ts](web.ts) 是 `./web` 入口；[web/access.ts](web/access.ts) 组装 `createWebAccess`，[web/fetch.ts](web/fetch.ts) 是本机 fetch，[web/exa.ts](web/exa.ts) 是 Exa 客户端，[web/body.ts](web/body.ts) 读有上限的响应体并分类错误，[web/markdown.ts](web/markdown.ts) 把 HTML 转成 Markdown，见 [SPEC](../SPEC.md#web-提供者web-子路径)。
- [start-coordinator.ts](start-coordinator.ts) 实现本地启动协调器，见 [SPEC](../SPEC.md#本地启动协调器g5)。
- [start-permit-requirements.ts](start-permit-requirements.ts) 定义完整动作的可信许可需求来源，未知和缺席均失败关闭。
- [ledger-guards.ts](ledger-guards.ts)、[invocation-source.ts](invocation-source.ts)、[grant-verifiers.ts](grant-verifiers.ts)、[start-guard.ts](start-guard.ts) 与 [text-results.ts](text-results.ts) 是账本守卫的生产件，见 [SPEC](../SPEC.md#账本守卫tl-11)。
- 根入口不导入 `@deepseek-ai/cordis`。独立的 [cordis.ts](cordis.ts) 提供 `./cordis` 子入口，集成说明见 [Cordis 装配](../docs/cordis.md)。
- 本成员经 `@omne-harness/tool-contract` 消费公共定义，不复制公共类型或服务键。

文档导航见 [index](index.md)。

- [作者装载器](author-loader.ts)核合法设置、定义与 schema。
- [执行绑定](executor-binding.ts)固定作者与启动身份，[活体执行](live-author-execution.ts)保存逐调用事实及停止状态。
- [作者入口](author.ts)导出[贡献实现](contribute-tool.ts)与[换代协调者](author-generations.ts)，实现文件不反向导入入口。
