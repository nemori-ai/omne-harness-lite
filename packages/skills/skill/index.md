# @omne-harness/skill 索引

本文件列出包根文件、各目录与专题的阅读路径。本包的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：三段、映射、端口答复与引用身份一致、无披露、正文与范围、检查、性质与证据；行为条款本身归契约与组页
- `documentation.json`：本包的文档登记
- `package.json`：公开入口、脚本与依赖

## 目录

- [docs/](docs/index.md)：内部设计、公开使用与集成说明
- [src/](src/index.md)：两个工厂、端口束、映射表与三段
- [tests/](tests/index.md)：服务、每段、范围与符合性套件的测试；[tests/model/](tests/model/index.md) 是对真实服务的有界穷举探索器
- [schema/](schema/index.md)：对外 Schema（本包没有）
- [verification/](verification/index.md)：性质账本 S1–S7 与 TLA+ 模型 `ReadGate.tla`（没有证明）
- [adr/](adr/index.md)：实现取舍与理由（本包没有独立 ADR）
- [examples/](examples/index.md)：使用示例（本包尚无独立示例）
- [resources/](resources/index.md)：运行所需的非源码资源（本包没有）
- [acceptance/](acceptance/index.md)：独立验收场景

## 阅读路径

使用本包：README、[docs/context.md](docs/context.md)、[docs/public-api.md](docs/public-api.md)。修改本包：[SPEC.md](SPEC.md)、[docs/architecture.md](docs/architecture.md)、[docs/flows.md](docs/flows.md)、[docs/object-model.md](docs/object-model.md)、[tests/](tests/index.md)。
