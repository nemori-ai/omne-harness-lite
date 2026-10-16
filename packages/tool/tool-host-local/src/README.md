# tool-host-local 源码

本目录将拥有本提供者的独立工厂、内部实现和 Cordis 绑定。

- [index.ts](index.ts) 是根入口 `.`。它是带 `PACKAGE_TEMPLATE_DRAFT` 标记的草稿，当前不导出任何值。
- [cordis.ts](cordis.ts) 是 `./cordis` 入口。它也是草稿，当前不导出任何值。
- 根入口不导入 `@deepseek-ai/cordis`。Cordis 绑定只从 `cordis.ts` 导出。
- 本成员经 `@omne-harness/tool-contract` 消费公共定义，不复制公共类型或服务键。

文档导航见 [index](index.md)。
