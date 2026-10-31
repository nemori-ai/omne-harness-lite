# @omne-harness/request-context-contract 索引

本文件列出包根文件、各目录与专题的阅读路径。本成员的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：类型以外的行为，条款 RQ-01 至 RQ-15
- `documentation.json`：本成员的文档登记
- `package.json`：根入口、脚本与依赖
- `vitest.config.ts`、`tsconfig.build.json`、`tsconfig.test.json`：测试与构建配置

## 目录

- [docs/](docs/index.md)：架构、流程、对象模型、公开接口、使用与定位、Cordis 适用性
- [src/](src/index.md)：公开定义，包含公开纯操作与类型
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
| 协调者一侧的适配器作者 | [docs/context.md](docs/context.md) | [docs/object-model.md](docs/object-model.md)、SPEC 的 [RQ-05](SPEC.md#rq-05-完整预算与候选完成) 与 [RQ-06](SPEC.md#rq-06-压缩共同结果与保护边界) |
| 历史持有者：实现历史源读口、调用人侧投影 | SPEC 的[历史源读口与 epoch 视图](SPEC.md#历史源读口与-epoch-视图) | [docs/flows.md](docs/flows.md) 的 F-RQ03 与 F-RQ05、SPEC 的 [RQ-03](SPEC.md#rq-03-历史与块投影) |
| 独立调用方 | [docs/context.md](docs/context.md) | [docs/public-api.md](docs/public-api.md)、[SPEC.md](SPEC.md) |
| 实现成员与策略作者 | [SPEC.md](SPEC.md) | [docs/architecture.md](docs/architecture.md)、[docs/flows.md](docs/flows.md) |
| 本成员的维护者 | [docs/architecture.md](docs/architecture.md) | [docs/public-api.md](docs/public-api.md)、[tests/](tests/README.md) |
| 装配者 | [docs/cordis.md](docs/cordis.md) | 组内 Cordis 成员的说明 |
