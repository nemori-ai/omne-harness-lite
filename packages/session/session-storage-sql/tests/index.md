# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、夹具边界、运行方式与缺口
- [public-entry.spec.ts](public-entry.spec.ts)：导出集合、无 `./cordis`、依赖规则、材料与 LIMIT 检查
- [materials-options.spec.ts](materials-options.spec.ts)：读口输出上限参数必填且为正安全整数，传入的值成为每个读 handler 的 `maxOutputBytes`
- [tenant-isolation.spec.ts](tenant-isolation.spec.ts)：租户隔离与事务域目录
- [delegated.spec.ts](delegated.spec.ts)：委派视图的符合性与跨租户用例
- [operation-evidence.spec.ts](operation-evidence.spec.ts)：操作记录的访问证据与它的迁移
- [attempt-grant.spec.ts](attempt-grant.spec.ts)：attempt 的授予表与它的迁移（R2-D349）
- [binding-narrow.spec.ts](binding-narrow.spec.ts)：归属读口的窄读取、记忆与停止
- [scope-kinds-narrow.spec.ts](scope-kinds-narrow.spec.ts)：AD-03 作用域绑定的读法走种类索引、不读快照
- [principal-bindings.spec.ts](principal-bindings.spec.ts)：会话归属读口的符合性与跨租户用例
- [real-provider.spec.ts](real-provider.spec.ts)：真实 sqlite-provider 上的组合用例
- [real-system-reads.spec.ts](real-system-reads.spec.ts)：真实 sqlite-provider 上的 R10、R11 系统读
- [log.spec.ts](log.spec.ts)：`commitLog` 的同事务发布、认回与冲突
- [log-conformance.spec.ts](log-conformance.spec.ts)：`commitLog` 符合性套件，夹具与真实提供者
- [history-index.spec.ts](history-index.spec.ts)：K-5 同根索引、观察尾部前缀与读取计数
- [preadmission.spec.ts](preadmission.spec.ts)：准入记录
- [admission-attempt-migration.spec.ts](admission-attempt-migration.spec.ts)：受理行原 attempt 列的迁移
- [fact-family.spec.ts](fact-family.spec.ts)：Agent 事实族与内容块（第 18 条）：迁移 006 的依赖与结果、一批的行形状、两道闸、注入失败后批与块都不可见、同租户同摘要只一行、五个读口与租户隔离
- [work-read-limit.spec.ts](work-read-limit.spec.ts)：Session 快照超过 20 MiB 时 `session.work` 明确答 `read_limit`，20 MiB 以内整份读回
- [read-output-limit.spec.ts](read-output-limit.spec.ts)：内容块在 20 MiB 以内整块读回，输出超过 20 MiB 时答 `read_limit`
- [work-cache.spec.ts](work-cache.spec.ts)：`readWork` 的工作缓存（RT-04）：版本点查、外部写入、Agent 发布、两租户、并发、上界、倒退、冻结与版本读的行数
- [direct-reads.spec.ts](direct-reads.spec.ts)：只有工作缓存直接读 `session.work`（RT-04 拥有者边界，`git grep` 全仓产品源码）。
- [work-fold.spec.ts](work-fold.spec.ts)：本进程提交折叠进工作缓存（RT-04，T-F1～T-F6）。
- [work-index-refresh.spec.ts](work-index-refresh.spec.ts)：本进程发布 Agent 记录而没有 Session 参加时，换掉持有快照的索引（RT-04，C-TOPOLOGY §2.9.2）。
- [work-fold-real.spec.ts](work-fold-real.spec.ts)：真实提供者上 `basis` 的界（T-F6，慢层）。
- [history-index-incremental.spec.ts](history-index-incremental.spec.ts)：历史索引的 Session 行在 Worker 内按游标增量保留（SPEC「Worker 内的两处保留」，T-A3-1 至 T-A3-4）：保留的索引与整读的答案相等；没有新行的第二次读不读五种行，一次提交只增它写的行；游标之后有空洞时本次调用失败，下一次重建；范围外的已路由输入不列出；没有 SE13 的 SE15 行不进索引，之后的 SE13 把它带入；未提交事务的行不保留，别的日志整读，行数与会话数有上界
- [participant-snapshot-cache.spec.ts](participant-snapshot-cache.spec.ts)：参加者的解析快照（SPEC「Worker 内的两处保留」，T-A2-1 至 T-A2-4）：两次提交读到同一快照只解析一次；提交写出的快照被保留，失败的提交留下的保留项不被使用；保留的快照深冻结；键含租户；按头文本而不只按修订核对，同修订不同文本重新解析；会话数与文本总长有上界
- [state-rows.spec.ts](state-rows.spec.ts)：快照的存储形态：读回相等、追加只写尾部、大对象成员行、200 步每次提交的写入不随步数增长
- [same-domain-tenant.spec.ts](same-domain-tenant.spec.ts)：同一事务域里两个租户的直查隔离
- [fixtures/](fixtures/index.md)：`node:sqlite` 与真实提供者的测试夹具，含各夹具传给 `sessionStorageMaterials` 的读口上限常量（`fixtures/read-limit.ts`）
