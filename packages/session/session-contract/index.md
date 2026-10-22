# @omne-harness/session-contract 索引

本文件列出包根文件、各目录与专题的阅读路径。本成员的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：类型以外的行为，含[运行契约候选](SPEC.md#运行契约候选)
- `documentation.json`：本成员的文档登记
- `package.json`：根入口、脚本与依赖
- `vitest.config.ts`、`tsconfig.build.json`、`tsconfig.test.json`：测试与构建配置

## 目录

- [docs/](docs/index.md)：架构、使用与定位、Cordis 适用性、公开接口、流程、对象模型
- [src/](src/index.md)：公开类型，现在只有 `index.ts`
- [tests/](tests/index.md)：持续测试与固定输入
- [schema/](schema/index.md)：模板占位
- [verification/](verification/index.md)：模型与证明，模板占位
- [adr/](adr/index.md)：实现取舍，模板占位
- [examples/](examples/index.md)：使用示例，模板占位
- [resources/](resources/index.md)：非源码资源，模板占位
- [acceptance/](acceptance/index.md)：独立验收场景，模板占位

## 阅读路径

| 读者 | 起点 | 接着读 |
| --- | --- | --- |
| 调用方：取一个面来用 | [docs/context.md](docs/context.md) | [docs/public-api.md](docs/public-api.md)、SPEC 的[四个面与公开操作](SPEC.md#四个面与公开操作) |
| 实现者：写机制或提供者 | [SPEC.md](SPEC.md) | [docs/object-model/README.md](docs/object-model/README.md)、[docs/flows/README.md](docs/flows/README.md) |
| 实现者：写端口的提供者 | SPEC 的[构造依赖端口与出站端口](SPEC.md#构造依赖端口与出站端口) | [docs/public-api.md](docs/public-api.md) |
| 评审者：核对故障与竞争 | SPEC 的[候选的持续验证义务](SPEC.md#候选的持续验证义务) | [docs/flows/README.md](docs/flows/README.md) |
| 本成员的维护者 | [docs/architecture.md](docs/architecture.md) | [docs/public-api.md](docs/public-api.md)、[tests/](tests/README.md) |
| 装配者 | [docs/cordis.md](docs/cordis.md) | [session-cordis-contract](../session-cordis-contract/README_ZH.md) |
