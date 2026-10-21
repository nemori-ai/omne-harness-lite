# @omne-harness/session 索引

本文件列出包根文件、各目录与专题的阅读路径。本成员的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：命令处理器流水线、拓展点编排、协调器、调度器、事件读取、缓存、崩溃矩阵与验证义务
- `documentation.json`：本成员的文档登记
- `package.json`：根入口、脚本与依赖
- `vitest.config.ts`、`tsconfig.build.json`、`tsconfig.test.json`：测试与构建配置

## 目录

- [docs/](docs/index.md)：架构、流程、对象模型、公开入口、使用与定位、Cordis 适用性
- [src/](src/index.md)：根入口，现在只有模板标记
- [tests/](tests/index.md)：入口测试与固定输入
- [schema/](schema/index.md)：现在为空，本成员不发布 Schema
- [verification/](verification/index.md)：故障场景，模型与证明现在为空
- [adr/](adr/index.md)：实现取舍，现在为空
- [examples/](examples/index.md)：使用示例，现在为空
- [resources/](resources/index.md)：非源码资源，现在为空
- [acceptance/](acceptance/index.md)：独立验收场景，现在为空

## 阅读路径

| 读者 | 起点 | 接着读 |
| --- | --- | --- |
| 机制实现者 | [SPEC.md](SPEC.md) | [docs/architecture/README.md](docs/architecture/README.md)、[docs/flows.md](docs/flows.md)、[docs/object-model.md](docs/object-model.md) |
| 不装配 Cordis 的独立宿主 | [docs/context.md](docs/context.md#独立装配) | [docs/public-api.md](docs/public-api.md)、[会话契约 SPEC](../session-contract/SPEC.md) |
| session-cordis 的实现者 | [docs/public-api.md](docs/public-api.md) | [docs/context.md](docs/context.md#框架装配)、[session-cordis 的 Cordis 说明](../session-cordis/docs/cordis.md) |
| 调整调度策略数值的一方 | SPEC 的 [SchedulingPolicy](SPEC.md#schedulingpolicy) | [docs/public-api.md](docs/public-api.md#配置) |
| 验证设计者 | SPEC 的[验证](SPEC.md#验证) | [verification/fault-scenarios.md](verification/fault-scenarios.md)、[tests/](tests/README.md) |
| 本成员的维护者 | [docs/architecture/README.md](docs/architecture/README.md) | [docs/architecture/mechanisms.md](docs/architecture/mechanisms.md)、[docs/object-model.md](docs/object-model.md) |
