# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口与公开定义
- [options.ts](options.ts)：选项、信封预留与构造期核对
- [ledger-store.ts](ledger-store.ts)：`ToolLedgerStore` 适配器
- [guarded-host-commit.ts](guarded-host-commit.ts)：带原调用修订条件的 host 提交
- [ledger-wire.ts](ledger-wire.ts)：共用账本地址、写入编码与结果映射
- [custody.ts](custody.ts)：`ToolOutputCustody` 适配器
- [tenant.ts](tenant.ts)：租户事务域解析与提交请求
- [json.ts](json.ts)：严格 JSON 编码
- [materials.ts](materials.ts)：静态材料
- [worker/participant.ts](worker/participant.ts)：`tool` 参加者
- [worker/migration.ts](worker/migration.ts)：迁移
- [worker/read-ledger.ts](worker/read-ledger.ts)、[worker/read-manifest.ts](worker/read-manifest.ts)、[worker/read-chunk.ts](worker/read-chunk.ts)：读 handler
- [worker/schema.ts](worker/schema.ts)、[worker/facts.ts](worker/facts.ts)、[worker/support.ts](worker/support.ts)：表、事实协议与行访问

- [worker/material-facts.ts](worker/material-facts.ts)：材料命令与边界解析
- [worker/participant-material.ts](worker/participant-material.ts)：准备、不可变分块与封存
- [worker/material-delete.ts](worker/material-delete.ts)：持久围栏与分批删除
- [worker/migration-material.ts](worker/migration-material.ts)：002 材料表迁移
- [worker/read-material.ts](worker/read-material.ts)：状态查询与有界字节读取

- [material-store.ts](material-store.ts)：公开材料仓工厂、身份定位与端口组合
- [material-mutations.ts](material-mutations.ts)：封存准备、分块提交与删除接续
- [material-values.ts](material-values.ts)：规范编码、seal 和观察结果解析
- [material-io.ts](material-io.ts)：有界 SQL 提交、读取与失败映射
