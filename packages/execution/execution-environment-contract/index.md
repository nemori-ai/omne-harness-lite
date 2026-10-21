# @omne-harness/execution-environment-contract 索引

本文件列出包根文件、各目录与专题的阅读路径。本成员的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：类型以外的行为，不变量 INV-EE01 至 INV-EE18，持续验证义务 V-EE01 至 V-EE21
- `documentation.json`：本成员的文档登记
- `package.json`：根入口、脚本与依赖
- `vitest.config.ts`、`tsconfig.build.json`、`tsconfig.test.json`：测试与构建配置

## 目录

- [docs/](docs/index.md)：架构与设施协议、流程、对象模型、公开接口、使用与定位、Cordis 适用性
- [src/](src/index.md)：公开定义，`facilities/` 下是三个核心设施
- [tests/](tests/index.md)：运行测试、类型测试与固定输入
- [schema/](schema/index.md)：工具环境声明的 JSON Schema
- [verification/](verification/index.md)：模型与证明，现在为空
- [adr/](adr/index.md)：实现取舍，现在为空
- [examples/](examples/index.md)：工具环境声明的示例
- [resources/](resources/index.md)：非源码资源，现在为空
- [acceptance/](acceptance/index.md)：独立验收场景，现在为空

## 阅读路径

| 读者 | 起点 | 接着读 |
| --- | --- | --- |
| 集成方：工具宿主或独立调用者 | [docs/context.md](docs/context.md) | [docs/flows.md](docs/flows.md)、[docs/public-api.md](docs/public-api.md)、[SPEC.md](SPEC.md) |
| 工具作者：声明工具需要的环境 | [docs/public-api.md](docs/public-api.md#工具环境声明) | [examples/](examples/README.md)、SPEC 的[工具环境声明](SPEC.md#工具环境声明) |
| 提供者作者：宿主或沙箱 | [docs/object-model.md](docs/object-model.md) | [docs/architecture.md](docs/architecture.md#设施协议)、[docs/context.md](docs/context.md#提供者作者) |
| 设施拥有者：增补一种设施 | [docs/context.md](docs/context.md#设施拥有者) | SPEC 的[设施协议](SPEC.md#设施协议) |
| 维护者：恢复与结算作用域资源 | SPEC 的[恢复](SPEC.md#恢复) | [docs/flows.md](docs/flows.md#f-eec05-恢复授权收场与作用域释放) |
| 观察者：读落点与宿主事实 | [docs/public-api.md](docs/public-api.md#两条块声明) | [docs/flows.md](docs/flows.md#f-eec06-落点与宿主事实经-runtime-context-到达观察者) |
| 本成员的维护者 | [docs/architecture.md](docs/architecture.md) | [docs/public-api.md](docs/public-api.md)、[tests/](tests/README.md) |
| 装配者 | [docs/cordis.md](docs/cordis.md) | 组内 Cordis 成员的说明 |
