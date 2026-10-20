PACKAGE_TEMPLATE_DRAFT

# session-cordis

## 职责与状态

具体的 Cordis 装配与资源生命周期。包骨架已初始化，公开运行能力尚未实现，候选设计的接受状态保持原范围。

## 使用

当前入口不提供运行能力。后继消费形状见 [公开入口](docs/public-api.md)，不能将候选片段当作可执行示例。

## 契约

[SPEC](SPEC.md) 拥有行为，公开形状与现有导出见 [入口设计](docs/public-api.md)。

## 设计

[架构](docs/architecture.md) 拥有机制和依赖理由，其他主题从 [文档索引](docs/index.md) 进入。

## 配置与运行

不把业务身份放入配置。Cordis 定义与具体提供者分包，依赖和撤除见 [集成设计](docs/cordis.md)。

## 验证

`pnpm test` 与 `pnpm typecheck` 当前只验证包骨架与空入口，不证明候选业务已经支持。

## 维护

修改公开承诺同步真实消费者、SPEC 和验证；实现机制不反向改变契约。组内责任见 [组入口](../README.md)。

## 目录结构与文档职责

完整骨架沿源码包模板；六个主题及其子页见 [docs](docs/README.md)。源码、测试、schema、verification、adr、examples、resources 与 acceptance 各有索引。空资源目录保留草稿说明，不授予模板采用或业务接受。
