# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、夹具边界、运行方式与缺口
- [public-entry.spec.ts](public-entry.spec.ts)：导出集合、无 `./cordis`、依赖规则、材料与 LIMIT 检查
- [materials-options.spec.ts](materials-options.spec.ts)：读口输出上限参数必填且为正安全整数，传入的值成为每个读 handler 的 `maxOutputBytes`
- [tenant-isolation.spec.ts](tenant-isolation.spec.ts)：租户隔离与事务域目录
- [delegated.spec.ts](delegated.spec.ts)：委派视图的符合性与跨租户用例
- [operation-evidence.spec.ts](operation-evidence.spec.ts)：操作记录的访问证据与它的迁移
- [principal-bindings.spec.ts](principal-bindings.spec.ts)：会话归属读口的符合性与跨租户用例
- [real-provider.spec.ts](real-provider.spec.ts)：真实 sqlite-provider 上的组合用例
- [real-system-reads.spec.ts](real-system-reads.spec.ts)：真实 sqlite-provider 上的 R10、R11 系统读
- [log.spec.ts](log.spec.ts)：`commitLog` 的同事务发布、认回与冲突
- [log-conformance.spec.ts](log-conformance.spec.ts)：`commitLog` 符合性套件，夹具与真实提供者
- [history-index.spec.ts](history-index.spec.ts)：K-5 同根索引、观察尾部前缀与读取计数
- [preadmission.spec.ts](preadmission.spec.ts)：准入记录
- [admission-attempt-migration.spec.ts](admission-attempt-migration.spec.ts)：受理行原 attempt 列的迁移
- [state-parts.spec.ts](state-parts.spec.ts)：Agent 记录的分区写入与分页读口
- [work-read-limit.spec.ts](work-read-limit.spec.ts)：Session 快照超过 20 MiB 时 `session.work` 明确答 `read_limit`，20 MiB 以内整份读回
- [read-output-limit.spec.ts](read-output-limit.spec.ts)：Agent 记录的整份状态在 20 MiB 以内整份读回，输出超过 20 MiB 时答 `read_limit`
- [work-cache.spec.ts](work-cache.spec.ts)：`readWork` 的工作缓存（RT-04）：版本点查、外部写入、Agent 发布、两租户、并发、上界、倒退、冻结与版本读的行数
- [direct-reads.spec.ts](direct-reads.spec.ts)：只有工作缓存直接读 `session.work`（RT-04 拥有者边界，`git grep` 全仓产品源码）。
- [work-fold.spec.ts](work-fold.spec.ts)：本进程提交折叠进工作缓存（RT-04，T-F1～T-F6）。
- [work-fold-real.spec.ts](work-fold-real.spec.ts)：真实提供者上 `basis` 的界（T-F6，慢层）。
- [same-domain-tenant.spec.ts](same-domain-tenant.spec.ts)：同一事务域里两个租户的直查隔离
- [fixtures/](fixtures/index.md)：`node:sqlite` 与真实提供者的测试夹具
