# @omne-harness/request-context-cordis-contract 索引

本文件列出包根文件、各目录与专题的阅读路径。本成员的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：类型以外的行为，性质 1 至 10
- `documentation.json`：本成员的文档登记
- `package.json`：根入口、`./cordis` 入口、脚本与依赖
- `vitest.config.ts`、`tsconfig.build.json`、`tsconfig.test.json`：测试与构建配置

## 目录

- [docs/](docs/index.md)：Cordis 定义、架构、流程、对象模型、公开接口、使用与定位
- [src/](src/index.md)：根入口与 `./cordis`，现在只有模板标记
- [tests/](tests/index.md)：两个入口测试与固定输入
- [schema/](schema/index.md)：现在为空，本成员不发布 Schema
- [verification/](verification/index.md)：模型与证明，现在为空
- [adr/](adr/index.md)：实现取舍，现在为空
- [examples/](examples/index.md)：使用示例，现在为空
- [resources/](resources/index.md)：非源码资源，现在为空
- [acceptance/](acceptance/index.md)：独立验收场景，现在为空

## 阅读路径

| 读者 | 起点 | 接着读 |
| --- | --- | --- |
| 贡献者插件作者 | [docs/context.md](docs/context.md#贡献者插件) | [docs/cordis.md](docs/cordis.md#登记与撤除协议)、契约的 [RQ-02](../request-context-contract/SPEC.md#rq-02-组装的前置输入) |
| 组装请求的调用方，例如协调者一侧的适配器作者 | [docs/context.md](docs/context.md#读取贡献集合的调用方) | [docs/cordis.md](docs/cordis.md#服务定义)、契约的[使用与定位](../request-context-contract/docs/context.md) |
| 监听贡献变化的一方 | [docs/cordis.md](docs/cordis.md#事件) | [docs/flows.md](docs/flows.md) |
| 提供者实现者 | [SPEC.md](SPEC.md) | [docs/cordis.md](docs/cordis.md)、[request-context-cordis](../request-context-cordis/docs/cordis.md) |
| 装配者 | [docs/cordis.md](docs/cordis.md#依赖分类) | [docs/cordis.md](docs/cordis.md#策略选择)、[IC 约定](../../../docs/architecture/cordis-integration-conventions.md) |
| 本成员的维护者 | [docs/architecture.md](docs/architecture.md) | [docs/public-api.md](docs/public-api.md)、[tests/](tests/README.md) |
