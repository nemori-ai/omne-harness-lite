# tool 源码

- [index.ts](index.ts) 是根入口 `.`，只导出类型，不导入 Cordis。
- [construction.ts](construction.ts) 给出 runtime 工厂的构造形状 `ToolDependencies` 与 `ToolConfiguration`。
- 本包经 `@omne-harness/tool-contract` 取得公共类型，不复制它们。

文档导航见 [index](index.md)。
