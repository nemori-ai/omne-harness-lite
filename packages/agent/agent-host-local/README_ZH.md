PACKAGE_TEMPLATE_DRAFT

# agent-host-local

## 职责与状态

具体的 Cordis 装配与资源生命周期。根入口提供独立 Model 接收组件，完整 Cordis 插件尚未实现。设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。

## 使用

根入口导出 `createLocalModelReceiver(dependencies, state)` 与 `createModelReceiverState()`。重装配继续传原状态；依赖包含同一 Journal 提供者、当前资格、原目标、Model 只读面、账目出口和显式容量。形状见[公开入口](docs/public-api.md)。`./cordis` 仍为空。

## 契约

[SPEC](SPEC.md) 拥有行为，公开形状与现有导出见 [入口设计](docs/public-api.md)。

## 设计

[架构](docs/architecture.md) 拥有机制和依赖理由，其他主题从 [文档索引](docs/index.md) 进入。

## 配置与运行

不把业务身份放入配置。Cordis 定义与具体提供者分包，依赖和撤除见 [集成设计](docs/cordis.md)。

## 验证

本成员的类型与测试核对根入口导出。agent 成员使用公开 Model pusher 和同源内存 Journal 验证共享接收算法；它不证明完整 Cordis 插件或生产存储。

## 维护

修改公开承诺同步真实消费者、SPEC 和验证；实现机制不反向改变契约。组内责任见 [组入口](../README.md)。

## 目录结构与文档职责

完整骨架沿源码包模板；六个主题及其子页见 [docs](docs/README.md)。源码、测试、schema、verification、adr、examples、resources 与 acceptance 各有索引。空资源目录保留草稿说明，不授予模板采用或业务接受。
