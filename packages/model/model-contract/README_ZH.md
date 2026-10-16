# Model 领域契约

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

## 职责与状态

本 workspace 骨架拥有公共领域值、操作接口、可替换提供者端口及共同协议。设计已按 [SPEC](SPEC.md) 接受。当前源码入口为空，设计接受不表示运行能力已实现。

## 使用

从[消费指南](docs/context.md)进入。[公开接口](docs/public-api.md)是设计声明，不能作为现有导入示例。需要执行能力时，由应用选择实现。

## 契约

[SPEC](SPEC.md)拥有类型之外的行为，[公开接口设计](docs/public-api.md)拥有设计声明。[验证义务](verification/index.md)规定交付所需证据。

## 设计

[架构](docs/architecture.md)、[对象模型](docs/object-model.md)和[流程](docs/flows.md)说明本成员的职责。六个主题见[文档索引](docs/index.md)。

## 配置与运行

目标生产依赖不包含 Cordis、Model 运行实现、pi、tokenizer 或存储引擎。共享 Outcome 的无框架依赖前置尚未完成，真实接口导出前须由共同拥有者解决。 安装与导入保证须用真实发布产物验证，空源码入口不构成证明。

## 验证

运行 `pnpm --filter @omne-harness/model-contract typecheck`、`pnpm --filter @omne-harness/model-contract test` 及 `make docs-check`。当前测试仅核模板空入口；协议、资源和安装验证仍按[持续义务](verification/index.md)执行。

## 维护

文件归属变化时同步[文档登记](documentation.json)、消费者链接和[组边界](../docs/architecture.md)。实际导出经过实现验收与验证后，替换设计声明，不维护第二套签名。

## 目录结构与文档职责

结构沿本任务采用的 #343 目录方案。待实现资源的 README 和 index 明示缺项，不代表功能已实现。

```text
包根：README.md、README_ZH.md、index.md、SPEC.md、documentation.json、package.json
├── docs/：architecture、flows、object-model、public-api、context、cordis 六主题
├── src/
├── tests/fixtures/
├── schema/
├── verification/models/、verification/proofs/
├── adr/
├── examples/
├── resources/
└── acceptance/
```

每个固定目录都有 README 和 index。源码、构建与测试配置沿实际文件；构建产物和依赖目录不属于正文骨架。

| 入口 | 文档职责 |
| --- | --- |
| [设计](docs/index.md) | 架构、流程、对象、接口、消费与装配 |
| [源码](src/index.md) | 实际公开导出和内部代码 |
| [测试](tests/index.md)、[夹具](tests/fixtures/index.md) | 可执行断言与固定输入 |
| [Schema](schema/index.md) | 外部数据格式及发布身份 |
| [持续验证](verification/index.md)、[模型](verification/models/index.md)、[证明](verification/proofs/index.md) | 性质、前提、符合性和验证资源 |
| [设计决策](adr/index.md) | 持续采用的实现取舍 |
| [示例](examples/index.md) | 可运行消费方式 |
| [运行资源](resources/index.md) | 资产、来源和装载责任 |
| [独立验收](acceptance/index.md) | 独立场景、环境与判据 |
