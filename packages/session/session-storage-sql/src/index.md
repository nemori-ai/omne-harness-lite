# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，将导出提供者工厂、参加者模块、迁移片段与组合登记材料，现在为空
- [cordis.ts](cordis.ts)：Cordis 绑定入口，将导出提供 `sessionTransactions` 的插件，现在为空

## 阅读路径

先读[公开接口导航](../docs/public-api.md)找到候选导出与依据，再读[内部架构](../docs/architecture.md#模块与依赖)的模块切分与 [Cordis 集成](../docs/cordis.md)，最后读源码。
