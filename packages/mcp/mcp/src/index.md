# src 索引

<!-- documentation:placeholder -->

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

<!-- documentation:placeholder -->

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口，`createMcp`、`createInMemoryCatalogStore`
- [config.ts](config.ts)：`McpConfig` 校验
- [inspection.ts](inspection.ts)：类别端口与两个正文读取
- [discovery.ts](discovery.ts)：读口 `refresh`、`current`、`peer`
- [calls.ts](calls.ts)：调用口 `invoke`、`continueWithInput`、`cancel`
- [status.ts](status.ts)：状态口 `inspect`、`list`
- [connections.ts](connections.ts)：连接口 `release`、`closeAll`
- [store/memory.ts](store/memory.ts)：内存清单存储
- [internal/connection.ts](internal/connection.ts)：`Connection` 聚合
- [internal/in-flight.ts](internal/in-flight.ts)：`InFlightCalls` 聚合：占位、发出、取消信号
- [internal/task-table.ts](internal/task-table.ts)：本次运行的任务表
- [internal/lost.ts](internal/lost.ts)：传输答复到「传输不再可用」的映射
- [internal/gate.ts](internal/gate.ts)：S1 唯一的裁决、`AdoptedOnly` 与 `AdmittedEndpoint`
- [internal/guard.ts](internal/guard.ts)：使用边界与发布边界上的关口，不变式 6 的关闭
- [internal/port.ts](internal/port.ts)：唯一的端口适配器 `ask`（同步抛出与 reject 读成违约答复）；时限下的等待 `waitAtMost`（别人拥有的工作）与 `within`（自己拥有的工作，到期交给作用域）
- [internal/scope.ts](internal/scope.ts)：连接表的任务作用域：时限之后继续的工作与其中的编程错误；对外只有 `Spawn` 视图
- [internal/assembly.ts](internal/assembly.ts)：唯一的装配：建表与各服务，`createMcp` 与测试都经它
- [internal/table.ts](internal/table.ts)：连接表，只编排
- [internal/entry.ts](internal/entry.ts)：条目的资源与视图；谓词 `holdsNothing`、`forgettable`；资源的搬移 `recordStop`、`adoptLingering`、`handOverToLanding`、`landingAnswered`
- [internal/teardown.ts](internal/teardown.ts)：唯一的关闭次序 `teardown`；每一步经 `ask` 问端口（`closeTransport`、`stopOne`、`releaseHeld`）；在途落点的句柄 `releaseLanding`、`abandonLandings`
- [internal/late.ts](internal/late.ts)：时限后交来的传输、句柄与进程，作为 `within` 的收口函数
- [internal/build.ts](internal/build.ts)：时限下的建连，含失败与关停之后的收场
- [internal/turns.ts](internal/turns.ts)：每个持有一次只跑一个
- [internal/settings.ts](internal/settings.ts)：S4 配值检查
- [internal/text.ts](internal/text.ts)：键文本
