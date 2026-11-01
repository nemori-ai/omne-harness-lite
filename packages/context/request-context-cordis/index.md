# @omne-harness/request-context-cordis 索引

本文件列出包根文件、各目录与专题的阅读路径。本成员的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：类型以外的行为，性质 1 至 9
- `documentation.json`：本成员的文档登记
- `package.json`：根入口、`./cordis` 入口、脚本与依赖
- `vitest.config.ts`、`tsconfig.build.json`、`tsconfig.test.json`：测试与构建配置

## 目录

- [docs/](docs/index.md)：Cordis 集成、架构、流程、对象模型、公开接口、使用与定位
- [src/](src/index.md)：根入口只有模板标记，`./cordis` 导出 `RequestContextProvider`
- [tests/](tests/index.md)：两个入口测试、提供者测试与固定输入
- [schema/](schema/index.md)：现在为空
- [verification/](verification/index.md)：模型与证明，现在为空
- [adr/](adr/index.md)：实现取舍，现在为空
- [examples/](examples/index.md)：使用示例，现在为空
- [resources/](resources/index.md)：非源码资源，现在为空
- [acceptance/](acceptance/index.md)：独立验收场景，现在为空

## 阅读路径

| 读者 | 起点 | 接着读 |
| --- | --- | --- |
| 装配者 | [docs/context.md](docs/context.md) | [docs/cordis.md](docs/cordis.md#配置与策略选择)、[IC 约定](../../../docs/architecture/cordis-integration-conventions.md) |
| 本插件的实现者 | [SPEC.md](SPEC.md) | [docs/cordis.md](docs/cordis.md)、[docs/flows.md](docs/flows.md)、[服务定义](../request-context-cordis-contract/docs/cordis.md) |
| 不装配 Cordis 的调用方 | [docs/context.md](docs/context.md#独立使用) | [docs/public-api.md](docs/public-api.md) |
| 本成员的维护者 | [docs/architecture.md](docs/architecture.md) | [docs/cordis.md](docs/cordis.md#验证义务)、[tests/](tests/README.md) |
