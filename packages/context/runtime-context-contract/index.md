# @omne-harness/runtime-context-contract 索引

本文件列出包根文件、各目录与专题的阅读路径。本成员的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：类型以外的行为，条款 RC-01 至 RC-08
- `documentation.json`：本成员的文档登记
- `package.json`：根入口、脚本与依赖
- `vitest.config.ts`、`tsconfig.build.json`、`tsconfig.test.json`：测试与构建配置

## 目录

- [docs/](docs/index.md)：架构、流程、对象模型、公开接口、使用与定位、Cordis 适用性
- [src/](src/index.md)：公开类型，现在只有 `index.ts`
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
| 语义拥有者：声明一个块 | [docs/context.md](docs/context.md) | [docs/object-model.md](docs/object-model.md)、SPEC 的 [RC-02](SPEC.md#rc-02-块声明注册与参数) |
| 消费者契约作者：声明一条需要 | [docs/object-model.md](docs/object-model.md) | SPEC 的 [RC-06](SPEC.md#rc-06-需要绑定与读者形状) |
| 独立调用方 | [docs/context.md](docs/context.md) | [docs/public-api.md](docs/public-api.md)、[SPEC.md](SPEC.md) |
| 作用域持有者或机制实现者 | [SPEC.md](SPEC.md) | [docs/flows.md](docs/flows.md)、[docs/object-model.md](docs/object-model.md) |
| 本成员的维护者 | [docs/architecture.md](docs/architecture.md) | [docs/public-api.md](docs/public-api.md)、[tests/](tests/README.md) |
| 装配者 | [docs/cordis.md](docs/cordis.md) | 组内 Cordis 成员的说明 |
