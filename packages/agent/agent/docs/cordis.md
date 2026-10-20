# Agent 通用实现与 Cordis

本包是 `module`，没有 `./cordis` 入口，不依赖或导入 Cordis。

服务的唯一公共定义由 [agent-cordis-contract](../../agent-cordis-contract/docs/cordis.md) 拥有，具体注入、动态插拔和资源交接由 [agent-host-local](../../agent-host-local/docs/cordis.md) 实现。通用工厂只接受纯契约端口；卸载插件不改变已经发生的业务效果。

工厂的每项依赖在 Cordis 中对应的服务键写在[工厂依赖表](public-api.md#依赖逐项分类)，键的定义与提供者归属归 Cordis 定义页的[服务键与提供者](../../agent-cordis-contract/docs/cordis.md#服务键与提供者)。工厂不接收 Cordis Context，也不接收可按键取用的容器。本包没有 `./cordis` 入口，所以没有服务键、事件和插件。

状态：设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受，未实现。本包消费的契约类型与 Cordis 服务定义已经在 agent-contract 与 agent-cordis-contract 实现。
