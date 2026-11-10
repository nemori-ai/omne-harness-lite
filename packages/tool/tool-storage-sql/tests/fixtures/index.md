# tests/fixtures 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：固定输入的来源与约束
- [sqlite-storage.ts](sqlite-storage.ts)：node:sqlite 上的 `SqlStorage` 测试提供者。可选的观察者看到参加者与读处理器执行的每条语句
- [statement-meter.ts](statement-meter.ts)：按行的拥有者（Tool 或宿主）统计一段工作的语句数、读写行数与逻辑字节
- [faults.ts](faults.ts)：故障包装
- [app.ts](app.ts)：测试应用的组装
- [ledger.ts](ledger.ts)：在给定记录仓上的真实账本
- [host-paths.ts](host-paths.ts)：历史无关关卡里一次 Tools 调用在宿主路径上留下的值（Tools 父请求与目标、调用记录、环境准备与获取记录、保留终端），身份定宽
- [settled-offloaded.ts](settled-offloaded.ts)：真实 SQL 账本与正文存储上一次收场、原文已卸载的调用
