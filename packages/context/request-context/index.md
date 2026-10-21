# @omne-harness/request-context 索引

本文件列出包根文件、各目录与专题的阅读路径。本成员的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：候选缓存、预计算的派生物、默认策略与修剪器、本地行为与关闭
- `documentation.json`：本成员的文档登记
- `package.json`：根入口、脚本与依赖
- `vitest.config.ts`、`tsconfig.build.json`、`tsconfig.test.json`：测试与构建配置

## 目录

- [docs/](docs/index.md)：架构、流程、对象模型、公开接口、使用与定位、Cordis 适用性
- [src/](src/index.md)：根入口，现在只有模板标记
- [tests/](tests/index.md)：持续测试与固定输入
- [schema/](schema/index.md)：现在为空，本成员不发布 Schema
- [verification/](verification/index.md)：模型与证明，现在为空
- [adr/](adr/index.md)：实现取舍，现在为空
- [examples/](examples/index.md)：使用示例，现在为空
- [resources/](resources/index.md)：非源码资源，现在为空
- [acceptance/](acceptance/index.md)：独立验收场景，现在为空

## 阅读路径

| 读者 | 起点 | 接着读 |
| --- | --- | --- |
| 机制实现者 | [SPEC.md](SPEC.md) | [docs/architecture.md](docs/architecture.md)、[docs/flows.md](docs/flows.md)、[docs/object-model.md](docs/object-model.md) |
| 不装配 Cordis、要缓存与默认策略的独立调用方 | [docs/context.md](docs/context.md) | [docs/public-api.md](docs/public-api.md)、契约的 [SPEC](../request-context-contract/SPEC.md) |
| Cordis 提供者的实现者 | [docs/public-api.md](docs/public-api.md) | [request-context-cordis 的 Cordis 说明](../request-context-cordis/docs/cordis.md) |
| 调整默认策略数值的一方 | SPEC 的[默认策略与修剪器](SPEC.md#默认策略与修剪器) | [docs/architecture.md](docs/architecture.md#默认策略只是配置初值) |
| 本成员的维护者 | [docs/architecture.md](docs/architecture.md) | SPEC 的[组合与验证](SPEC.md#组合与验证)、[tests/](tests/README.md) |
