# Tool 源码

本目录拥有本成员的公开类型、运行时校验和内部实现。

- [index.ts](index.ts) 是根入口 `.`。它当前只导出资产正文端口 `toolBodyContract`，实现在 [contract.ts](contract.ts)。
- [cordis.ts](cordis.ts) 是 `./cordis` 入口。它是带 `PACKAGE_TEMPLATE_DRAFT` 标记的草稿，当前不导出任何值。
- 根入口不导入 `@deepseek-ai/cordis`。Cordis 绑定只从 `cordis.ts` 导出。

运行接口尚未实现。后续实现须依据 [SPEC](../SPEC.md) 的已接受范围和 [public-api](../docs/public-api.md) 的设计定义，不能按源码便利改变承诺。文档导航见 [index](index.md)。
