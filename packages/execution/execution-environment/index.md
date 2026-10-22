# @omne-harness/execution-environment 索引

本文件列出包根文件、各目录与专题的阅读路径。本成员的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：表与视图、获取、逐操作门、释放、退役、恢复、关闭与明确缺项
- `documentation.json`：本成员的文档登记
- `package.json`：根入口、脚本与依赖
- `vitest.config.ts`、`tsconfig.build.json`、`tsconfig.test.json`：测试与构建配置

## 目录

- [docs/](docs/index.md)：架构、流程、对象模型、公开接口、使用与定位，以及 Cordis 不适用的理由
- [src/](src/index.md)：工厂与三个模块
- [tests/](tests/index.md)：入口测试、登记表测试与固定输入
- [schema/](schema/index.md)：现在为空，本成员不发布 Schema
- [verification/](verification/index.md)：模型与证明，现在为空
- [adr/](adr/index.md)：实现取舍，现在为空
- [examples/](examples/index.md)：使用示例，现在为空
- [resources/](resources/index.md)：非源码资源，现在为空
- [acceptance/](acceptance/index.md)：独立验收场景，现在为空

## 阅读路径

| 读者 | 起点 | 接着读 |
| --- | --- | --- |
| 独立调用方 | [docs/context.md](docs/context.md) | [docs/public-api.md](docs/public-api.md)、[SPEC.md](SPEC.md) |
| Service 实现者 | [SPEC.md](SPEC.md#关闭) | [docs/flows.md](docs/flows.md)、[execution-environment-host-local](../execution-environment-host-local/docs/cordis.md) |
| 提供者作者 | [SPEC.md](SPEC.md#获取) | [docs/flows.md](docs/flows.md)、契约的[对象模型](../execution-environment-contract/docs/object-model.md) |
| 本成员的维护者 | [docs/architecture.md](docs/architecture.md) | [docs/object-model.md](docs/object-model.md)、[tests/](tests/README.md)、[SPEC 明确缺项](SPEC.md#明确缺项) |
