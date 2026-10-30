# @omne-harness/session-adapters 索引

本文件列出包根文件、各目录与专题的阅读路径。本成员的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：插件清单、每个插件的行为与结果对应、模式翻译表、具名前提与验证义务
- `documentation.json`：本成员的文档登记
- `package.json`：两个入口、脚本与依赖。现在只声明 Cordis，其余依赖随实现加入，见[内部架构的依赖方向](docs/architecture.md#模块与依赖)
- `vitest.config.ts`、`tsconfig.build.json`、`tsconfig.test.json`：测试与构建配置

## 目录

- [docs/](docs/index.md)：架构、流程、对象模型、公开接口、使用与定位、Cordis 集成
- [src/](src/index.md)：`index.ts` 与 `cordis.ts`，现在只有模板标记
- [tests/](tests/index.md)：27 个运行测试、2 个类型测试与共用构造文件
- [schema/](schema/index.md)：模板占位
- [verification/](verification/index.md)：模型与证明，模板占位
- [adr/](adr/index.md)：实现取舍，模板占位
- [examples/](examples/index.md)：使用示例，模板占位
- [resources/](resources/index.md)：非源码资源，模板占位
- [acceptance/](acceptance/index.md)：独立验收场景，模板占位

## 阅读路径

| 读者 | 起点 | 接着读 |
| --- | --- | --- |
| 应用装配者 | [docs/context.md](docs/context.md) | [docs/cordis.md](docs/cordis.md)、SPEC 的[插件清单](SPEC.md#插件清单) |
| 插件实现者 | [SPEC.md](SPEC.md) 的对应插件节 | [docs/flows.md](docs/flows.md)、[docs/cordis.md](docs/cordis.md) |
| 邻域契约的拥有者：确认 Session 怎样使用本邻域 | SPEC 的[插件清单](SPEC.md#插件清单) | 对应插件节与[具名前提与明确缺项](SPEC.md#具名前提与明确缺项) |
| 本成员的维护者 | [docs/architecture.md](docs/architecture.md) | [docs/public-api.md](docs/public-api.md)、[docs/object-model.md](docs/object-model.md)、[tests/](tests/README.md) |
