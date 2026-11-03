# Cordis 集成

本包是 `module` 变体，没有 `src/cordis.ts`，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定或引入 Cordis 依赖。

## 适用性

Cordis 不适用于本包。两个工厂是纯函数，收端口对象，交服务对象；没有服务键、插件、事件或需要撤除的资源。把服务装进 Cordis 的责任归 Skill 的 Cordis 契约与 `@omne-harness/skill-host-local` 的插件部分，见[组入口](../../README.md#成员与依赖)。以后需要绑定时，改用绑定变体的规则另行设计。
