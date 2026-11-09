# tests/fixtures 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：固定输入的来源与约束
- [sqlite-storage.ts](sqlite-storage.ts)：node:sqlite 上的 `SqlStorage` 测试提供者
- [faults.ts](faults.ts)：故障包装
- [app.ts](app.ts)：测试应用的组装
- [custody.ts](custody.ts)：按块读回原件
- [ledger.ts](ledger.ts)：在给定记录仓上的真实账本
- [host-paths.ts](host-paths.ts)：历史无关关卡里一次 Tools 调用在宿主路径上留下的值（Tools 父请求与目标、调用记录、环境准备与获取记录、保留终端），身份定宽
- [live-body.ts](live-body.ts)：经公开账本命令创建持久卸载正文、独立附件及过程历史，供真实 SQL 读删交错测试使用。
