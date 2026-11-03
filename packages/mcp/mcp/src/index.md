# src 索引

<!-- documentation:placeholder -->

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

<!-- documentation:placeholder -->

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口，`createMcpCore`、`createInMemoryCatalogStore`、`McpCore`
- [config.ts](config.ts)：`McpConfig` 校验
- [inspection.ts](inspection.ts)：类别端口与两个正文读取
- [discovery.ts](discovery.ts)：读口 `refresh`、`current`、`peer`
- [status.ts](status.ts)：状态口 `inspect`、`list`
- [connections.ts](connections.ts)：连接口 `release`、`closeAll`
- [store/memory.ts](store/memory.ts)：内存清单存储
- [internal/connection.ts](internal/connection.ts)：`Connection` 聚合
- [internal/in-flight.ts](internal/in-flight.ts)：`InFlightCalls` 聚合
- [internal/gate.ts](internal/gate.ts)：关口与 `AdmittedEndpoint`
- [internal/guard.ts](internal/guard.ts)：使用边界与自动关闭
- [internal/table.ts](internal/table.ts)：连接表
- [internal/settings.ts](internal/settings.ts)：S4 配值检查
- [internal/text.ts](internal/text.ts)、[internal/canonical.ts](internal/canonical.ts)：键文本与 JSON 规范化
