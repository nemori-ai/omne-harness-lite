# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，重导出三个函数
- [host-files.ts](host-files.ts)：宿主文件设施与对象身份读取
- [host-provider.ts](host-provider.ts)：宿主文件提供者
- [cordis.ts](cordis.ts)：`./cordis` 入口：Service 子类、插件与空配置 Schema

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到名称与依据。宿主文件读[架构的宿主文件使用](../docs/architecture.md#宿主文件使用)，再读 `host-files.ts`。装配读 [Cordis 说明](../docs/cordis.md)，再读 `cordis.ts`。
