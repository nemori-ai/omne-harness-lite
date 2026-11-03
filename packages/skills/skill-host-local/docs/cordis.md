# Cordis 集成

本包是 `module` 变体，没有 `src/cordis.ts`，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定或引入 Cordis 依赖。

## 适用性

本版本不适用。目录来源是一个纯函数工厂：它没有服务键、事件，也没有需要撤除的资源。组设计把 Skill 的 Cordis 插件归入本成员的插件部分，它随 Skill 的服务键一同建立，见[组入口](../../README.md#成员与依赖)。那时按绑定变体的规则另行设计本文件。
