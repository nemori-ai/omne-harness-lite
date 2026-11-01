# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，重导出四个函数与类型
- [host-files.ts](host-files.ts)：宿主文件设施、对象身份读取与共用文件引擎
- [host-paths.ts](host-paths.ts)：路径检查、逐段走、目录描述符路径、平台前提 P2 的探测与宿主文件根的绑定
- [host-file-tree.ts](host-file-tree.ts)：列表、搜索、建目录、删除、移动、复制
- [host-file-batch.ts](host-file-batch.ts)：提交批次与恢复批次
- [host-domain.ts](host-domain.ts)：宿主文件责任域：获取记录、门面、配额与排空
- [host-provider.ts](host-provider.ts)：宿主文件提供者
- [cordis.ts](cordis.ts)：`./cordis` 入口：Service 子类、插件与两份配置 Schema

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到名称与依据。宿主文件读[架构的宿主文件使用](../docs/architecture.md#宿主文件使用)，再读 `host-files.ts`。装配读 [Cordis 说明](../docs/cordis.md)，再读 `cordis.ts`。
