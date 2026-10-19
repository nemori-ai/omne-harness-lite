# tool-host-local 源码

本目录拥有本提供者的独立工厂与内部实现。

- [index.ts](index.ts) 是根入口 `.`。它导出本地启动协调器（G5）。
- [start-coordinator.ts](start-coordinator.ts) 实现本地启动协调器，见 [SPEC](../SPEC.md#本地启动协调器g5)。
- 根入口不导入 `@deepseek-ai/cordis`。当前没有 `./cordis` 子入口，后续插件设计见 [Cordis 装配](../docs/cordis.md)。
- 本成员经 `@omne-harness/tool-contract` 消费公共定义，不复制公共类型或服务键。

文档导航见 [index](index.md)。
