# @omne-harness/assets-access 索引

本文件列出包根文件、各目录与专题的阅读路径。本包的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：类型以外的行为规格
- `documentation.json`：本包的文档登记
- `package.json`：公开入口、脚本与依赖

## 目录

- [docs/](docs/index.md)：内部设计、公开使用与集成说明
- [src/](src/index.md)：端口、贡献与 Cordis 绑定
- [tests/](tests/index.md)：持续测试与读写面的替身
- [schema/](schema/index.md)：对外 Schema，现无内容
- [verification/](verification/index.md)：模型、论证与证明，现无内容
- [adr/](adr/index.md)：实现取舍与理由，现无内容
- [examples/](examples/index.md)：使用示例，现无内容
- [resources/](resources/index.md)：运行所需的非源码资源，现无内容
- [acceptance/](acceptance/index.md)：独立验收场景，现无内容

## 阅读路径

使用本包：README、`docs/context.md`、`docs/public-api.md`、`docs/cordis.md`。修改本包：`SPEC.md`、`src/contribution.ts`、`docs/architecture.md`、`tests/`。
