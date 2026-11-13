# Cordis 集成

本包是 `module` 变体，没有 `src/cordis.ts`，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定或引入 Cordis 依赖。

## 适用性

不适用。本包只有一个不可变的契约值和推出的类型。它不提供 Service、事件、插件或 Context 行为，没有依赖注入、启动、撤除或资源清理责任。协议契约必须能在浏览器里用（RFC-0015 I-18），所以不能依赖 Cordis。

把协议挂上登记表的是接入插件 `session-access`，它在自己的成员里用 Cordis。本文件在 `documentation.json` 中记为 `not-applicable`。
