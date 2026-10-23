# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，只重导出契约类型
- [cordis.ts](cordis.ts)：`./cordis` 入口，承载服务定义

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到名称与依据，再读 [Cordis 说明](../docs/cordis.md#服务定义)，最后读源码。两个入口怎样分工见[内部架构](../docs/architecture.md#模块与依赖)。
