# @omne-harness/session-cordis-contract 索引

本文件列出包根文件、各目录与专题的阅读路径。本成员的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：性质与生命周期表
- `documentation.json`：本成员的文档登记
- `package.json`：两个入口、脚本与依赖
- `vitest.config.ts`、`tsconfig.build.json`、`tsconfig.test.json`：测试与构建配置

## 目录

- [docs/](docs/index.md)：Cordis 定义、架构、使用与定位、流程、对象模型、公开接口
- [src/](src/index.md)：`index.ts` 与 `cordis.ts`，现在只有模板标记
- [tests/](tests/index.md)：两个入口测试与固定输入
- [schema/](schema/index.md)：模板占位
- [verification/](verification/index.md)：模型与证明，模板占位
- [adr/](adr/index.md)：实现取舍，模板占位
- [examples/](examples/index.md)：使用示例，模板占位
- [resources/](resources/index.md)：非源码资源，模板占位
- [acceptance/](acceptance/index.md)：独立验收场景，模板占位

## 阅读路径

| 读者 | 起点 | 接着读 |
| --- | --- | --- |
| 调用方插件作者：声明调用方类 | [docs/cordis.md](docs/cordis.md) | [docs/context.md](docs/context.md)、SPEC 的[性质 4](SPEC.md#唯一性) |
| 端口提供者作者 | [docs/cordis.md 的端口服务键](docs/cordis.md#端口服务键) | [session-contract SPEC](../session-contract/SPEC.md#构造依赖端口与出站端口) |
| 提供者实现者 | [SPEC.md](SPEC.md) | [docs/cordis.md](docs/cordis.md)、[session-cordis](../session-cordis/docs/cordis.md) |
| 装配者 | [docs/cordis.md](docs/cordis.md) | [靠装配兑现的保证](docs/cordis.md#靠装配兑现的保证) |
| 本成员的维护者 | [docs/architecture.md](docs/architecture.md) | [docs/public-api.md](docs/public-api.md)、[tests/](tests/README.md) |
