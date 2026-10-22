# Cordis 集成

本包是 `module` 变体，没有 `src/cordis.ts`，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定或引入 Cordis 依赖。

## 适用性

不适用。理由如下：

- 本包只提供类型、普通工厂 `createPiTransport` 与包内机制，没有 Service、插件、事件或需要 Cordis 管理的 fiber。
- 网络资源由装配创建并关闭。三段传输只使用注入的网络资源，它的 `close()` 由装配调用。两者都不挂在 Cordis 的生命周期上。
- Model 的 Cordis 服务定义归 [model-cordis-contract](../../model-cordis-contract/docs/cordis.md)，单机装配归 [model-host-local](../../model-host-local/docs/cordis.md)。传输经 Model 的端口进入装配，本包不另建服务键。

`documentation.json` 把本文件记为 `not-applicable`。以后本包需要 Cordis 绑定时，改用绑定变体的规则另行设计。
