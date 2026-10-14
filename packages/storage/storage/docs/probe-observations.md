# Worker 探针观察

日期是 2026-10-15。脚本是 `packages/storage/storage/verification/worker-probe.mjs`。它不注册为生产提供者。数据库文件在临时目录，不用 `:memory:`。

命令是 `node packages/storage/storage/verification/worker-probe.mjs`。退出码是 0。

这次机器是 darwin arm64，Node v26.0.0，连接上的 `sqlite_version()` 是 3.53.0。3.53.0 不低于 3.51.3。它不是规格基线 Node 24.21.0 / SQLite 3.53.4。本机没有那组基线。这些观察不能写成基线证明，也不能写成 SQL-T01 或断电试验。

探针里的规范写出只覆盖本次使用的字符串、有限数字、对象和数组。它不是一份完整的 RFC 8785 库。因此这些摘要不证明 RFC 8785 符合性。

| 观察 | 结果 |
| --- | --- |
| 配置读回 | `journal_mode` 为 wal，`synchronous` 为 2（FULL），`foreign_keys` 为 1 |
| 旧代际未排除 | `commit` 返回 `rejected_before_accept`，原因 `writer_not_current` |
| 同一次查询 | `query` 返回 `unknown` |
| 第一次提交 | `committed`，摘要 `c087ef8f71b1d7d12d39e5473f2017937b750033c529d5cc10876cd0bd2b0663` |
| 同摘要重试 | 同一摘要，`replayed` 为 true |
| 不同摘要 | `identity_conflict`，并带已有回执 |
| 另一租户查询 | `unknown` |
| 调用方放弃等待 | 父侧 `AbortController` 已中止。Worker 没有收到该信号，仍返回 `committed`。这不证明 SQL 被中断 |
| 同连接第二句主键冲突 | `rolled_back`。回滚后 `probe_ddl` 的表数量是 0 |
| Worker 在回执写入后、响应发出前退出 | 退出码 0。新 Worker 用原身份 `query` 得到 `committed` |
| 重启后的登记 | 新进程仍能用已登记的组合版本 `v1` 完成另一次 `commit` |
| 端口拒绝事务语句 | `COMMIT` 和 `ROLLBACK` 被拒绝且未执行。`select 1` 执行了 |
| 协议版本不是 `1` | `unsupported_protocol` |
| 空命令数组 | `field_missing` |
| 命令条数超过探针里的上限 | `command_limit` |
| 已停止新准入 | `closing` |
| 发送前队列已满 | 控制侧返回 `queue_full`，`sent` 为 false。没有把这条消息发给 Worker |
| 慢语句期间持续提交 | 没有跑。不能据此声称内存已经证明有界 |

物理断电没有做。行为模型没有做。`ROLLBACK` 本身失败没有注入。2026-10-14 的主线程探针不算本页的观察。
