# tests/fixtures 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：夹具职责与边界
- [sqlite-storage.ts](sqlite-storage.ts)：`node:sqlite` 上的 `SqlStorage` 测试提供者
- [real-provider.ts](real-provider.ts)：真实 sqlite-provider 组合与 WAL 提交帧计数
- [real-provider-child.ts](real-provider-child.ts)：杀进程用例的子进程
- [real-joint-child.ts](real-joint-child.ts)：共同提交杀进程用例的子进程
- [app.ts](app.ts)：测试应用组合
- [entries.ts](entries.ts)：每个公开入口的调用清单
