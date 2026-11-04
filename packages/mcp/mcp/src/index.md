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
- [internal/gate.ts](internal/gate.ts)：S1 唯一的裁决、`AdoptedOnly` 与 `AdmittedEndpoint`
- [internal/guard.ts](internal/guard.ts)：使用边界与发布边界上的关口，不变式 6 的关闭
- [internal/abort.ts](internal/abort.ts)：在时限下等端口；读类端口 reject 的读法 `answerOf`
- [internal/table.ts](internal/table.ts)：连接表，只编排
- [internal/entry.ts](internal/entry.ts)：条目的资源、视图与遗忘谓词 `holdsNothing`
- [internal/teardown.ts](internal/teardown.ts)：唯一的关闭次序，每步 `try`/`finally`
- [internal/late.ts](internal/late.ts)：时限后交来的传输、句柄与进程
- [internal/build.ts](internal/build.ts)：时限下的建连与连接丢失的收场
- [internal/turns.ts](internal/turns.ts)：每个持有一次只跑一个
- [internal/settings.ts](internal/settings.ts)：S4 配值检查
- [internal/text.ts](internal/text.ts)、[internal/canonical.ts](internal/canonical.ts)：键文本与 JSON 规范化
