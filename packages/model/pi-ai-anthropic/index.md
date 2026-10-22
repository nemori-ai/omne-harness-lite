# @omne-harness/pi-ai-anthropic 索引

本文件给出本包的阅读路径。职责与状态见 [README_ZH.md](README_ZH.md)。

## 包根

- [README.md](README.md)、[README_ZH.md](README_ZH.md)：用途、支持范围、使用与验证
- [SPEC.md](SPEC.md)：记录、规则、计量、词表资源、官方档案与取得的行为
- [provenance.json](provenance.json)：迁入数据的来源与封存修订号
- [documentation.json](documentation.json)：文档登记

## 目录

- [docs/](docs/index.md)：内部设计、公开接口与使用
- [src/](src/index.md)：源码
- [tests/](tests/index.md)：持续测试与夹具
- [resources/](resources/index.md)：`claude.json` 词表、许可证与来源记录
- [examples/](examples/index.md)：经代理请求的单次示例与跨家族示例
- [schema/](schema/index.md)、[verification/](verification/index.md)、[adr/](adr/index.md)、[acceptance/](acceptance/index.md)：本包当前不适用的目录

## 阅读路径

- 装配方：README_ZH“使用” → [docs/context.md](docs/context.md) → SPEC“词表资源”“家族与取得”“官方档案”。
- 加型号的人：SPEC“记录” → `src/records.ts` → [tests/fixtures/README.md](tests/fixtures/README.md)。
- 评审者：SPEC“组合与验证” → [tests/README.md](tests/README.md) → 夹具对照表与有意不同。
