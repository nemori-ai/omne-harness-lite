# @omne-harness/identity-sql 索引

本文件列出包根文件、各目录与专题的阅读路径。本包的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、使用、目录结构与文档职责
- [SPEC.md](SPEC.md)：记录位置、注册单事务、秘密保存、签发、识别、读口、停止与重启的行为，已知限制，验证资源
- `documentation.json`：本包的文档登记
- `package.json`：两个公开入口、脚本与依赖

## 目录

- [docs/](docs/index.md)：内部架构、流程、对象模型、公开接口导航、使用与定位、Cordis 集成
- [src/](src/index.md)：工厂、配置、材料、插件，以及 `worker/` 下的参加者、迁移与读 handler
- [tests/](tests/index.md)：持续测试与 `fixtures/` 下的真实 sqlite-provider 夹具
- [schema/](schema/index.md)：不适用
- [verification/](verification/index.md)：不适用
- [adr/](adr/index.md)：不适用
- [examples/](examples/index.md)：不适用
- [resources/](resources/index.md)：不适用
- [acceptance/](acceptance/index.md)：留给独立验收者

## 阅读路径

使用本包：README、[docs/context.md](docs/context.md)、[docs/public-api.md](docs/public-api.md)、[docs/cordis.md](docs/cordis.md)。修改本包：[SPEC.md](SPEC.md)、[docs/architecture.md](docs/architecture.md)、[docs/flows.md](docs/flows.md)、[docs/object-model.md](docs/object-model.md)、`tests/`。
