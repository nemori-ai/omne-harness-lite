# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，重导出工厂、错误类与两个类型
- [registry.ts](registry.ts)：登记表：四张表、落点解析、获取与核验、退役、恢复授权核对、关闭
- [lease-view.ts](lease-view.ts)：租约视图：逐操作门、失效、释放与重试
- [recovery.ts](recovery.ts)：恢复编排：逐提供者枚举与停止

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到名称与依据，再读[内部架构](../docs/architecture.md#模块与依赖)，最后读源码。
