# @omne-harness/execution-environment-host-local 索引

本文件列出包根文件、各目录与专题的阅读路径。本成员的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：宿主提供者的事实、宿主文件使用（已接受）、其余现行行为、Service 实现与撤除顺序
- `documentation.json`：本成员的文档登记
- `package.json`：根入口、`./cordis` 入口、脚本与依赖
- `vitest.config.ts`、`tsconfig.build.json`、`tsconfig.test.json`：测试与构建配置

## 目录

- [docs/](docs/index.md)：架构（含已接受的宿主文件使用）、流程、对象模型、公开接口、使用与定位、Cordis 集成
- [src/](src/index.md)：根入口的宿主文件设施与提供者，`./cordis` 的 Service 子类与插件
- [tests/](tests/index.md)：五个测试文件与固定输入
- [schema/](schema/index.md)：现在为空，配置 Schema 写在源码里
- [verification/](verification/index.md)：模型与证明，现在为空
- [adr/](adr/index.md)：实现取舍，现在为空
- [examples/](examples/index.md)：使用示例，现在为空
- [resources/](resources/index.md)：非源码资源，现在为空
- [acceptance/](acceptance/index.md)：独立验收场景，现在为空

## 阅读路径

| 读者 | 起点 | 接着读 |
| --- | --- | --- |
| 应用装配者 | [docs/context.md](docs/context.md#装配) | [docs/cordis.md](docs/cordis.md)、[IC 约定](../../../docs/architecture/cordis-integration-conventions.md) |
| 执行适配的实现者 | [SPEC 宿主文件使用](SPEC.md#宿主文件使用) | [docs/architecture.md](docs/architecture.md#宿主文件使用)、[docs/flows.md](docs/flows.md) |
| 新宿主设施或沙箱提供者的作者 | [docs/cordis.md](docs/cordis.md#插件与配置) | [docs/architecture.md](docs/architecture.md)、契约的[对象模型](../execution-environment-contract/docs/object-model.md) |
| 本成员的维护者 | [docs/architecture.md](docs/architecture.md) | [docs/object-model.md](docs/object-model.md)、[tests/](tests/README.md) |
