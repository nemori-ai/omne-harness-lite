# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口与公开定义
- [options.ts](options.ts)：选项、信封预留与构造期核对
- [ledger-store.ts](ledger-store.ts)：`ToolLedgerStore` 适配器
- [custody.ts](custody.ts)：`ToolOutputCustody` 适配器
- [tenant.ts](tenant.ts)：租户事务域解析与提交请求
- [json.ts](json.ts)：严格 JSON 编码
- [materials.ts](materials.ts)：静态材料
- [worker/participant.ts](worker/participant.ts)：`tool` 参加者
- [worker/migration.ts](worker/migration.ts)：迁移
- [worker/read-ledger.ts](worker/read-ledger.ts)、[worker/read-manifest.ts](worker/read-manifest.ts)、[worker/read-chunk.ts](worker/read-chunk.ts)：读 handler
- [worker/schema.ts](worker/schema.ts)、[worker/facts.ts](worker/facts.ts)、[worker/support.ts](worker/support.ts)：表、事实协议与行访问
