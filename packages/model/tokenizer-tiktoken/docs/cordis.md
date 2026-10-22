# Cordis 集成

本包是 `module` 变体，没有 `src/cordis.ts`，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定或引入 Cordis 依赖。

## 适用性

不适用。理由如下：

- 本包只提供一个普通工厂函数与两个类型，没有 Service、插件、事件或需要 Cordis 管理的 fiber。
- tokenizer 没有需要释放的资源，不挂在 Cordis 的生命周期上。
- 组架构规定不为 tokenizer 增加全局服务键，见[组架构“包依赖与装配”](../../docs/architecture.md#包依赖与装配)。

`documentation.json` 把本文件记为 `not-applicable`。以后本包需要 Cordis 绑定时，改用绑定变体的规则另行设计。
