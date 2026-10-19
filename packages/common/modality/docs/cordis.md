# Cordis 集成

本包是 `module` 变体，没有 `src/cordis.ts`，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定或引入 Cordis 依赖。

## 适用性

不适用。本包只有纯类型、一个冻结列表和纯函数。它不提供 Service、事件、插件或 Context 行为，没有依赖注入、启动、撤除或资源清理责任，也不需要 Cordis 绑定。没有 `./cordis` 入口，`dependencies` 为空，源码与生成的声明都不导入任何模块，由 [tests/public-entry.spec.ts](../tests/public-entry.spec.ts) 检查。

需要 Cordis 的调用方在自己的成员里使用 Cordis。它们消费本包的判定函数，本包不为它们增加绑定。以后需要绑定时，改用绑定变体的规则另行设计。本文件在 `documentation.json` 中记为 `not-applicable`。
