# Session 通用实现与 Cordis

本包是 `module`，没有 `./cordis` 入口，不依赖或导入 Cordis。

服务的唯一公共定义由 [session-cordis-contract](../../session-cordis-contract/docs/cordis.md) 拥有，具体注入、动态插拔和资源交接由 [session-cordis](../../session-cordis/docs/cordis.md) 实现。通用工厂只接受纯契约端口；卸载插件不改变已经发生的业务效果。
