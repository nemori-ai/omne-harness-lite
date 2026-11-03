# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

目标是用真实的 SQLite 与 PostgreSQL 提供者测试，不用内存替身，因为本包的行为就是对这些介质的行为。`node:sqlite` 夹具在内存库上运行本包真实的 participant 与 handler 模块，`decide` 与 `reduce` 用 session-contract 的真实纯函数，不覆盖 Worker、持久、关闭、受理队列与限额。`real-provider.spec.ts` 经 sqlite-provider 的公开入口在文件库上运行同一批模块，覆盖其中的 Worker、进程级持久、关闭与两种限额；断电耐久、WAL 维护与跨进程写者仍无覆盖。本包没有 Cordis 入口，也没有 Cordis 用例。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。导出进入根入口时，同一次修改要更新 `public-entry.spec.ts` 的导出集合。

## 本包事实

现有文件：

- [public-entry.spec.ts](public-entry.spec.ts)：根入口的导出集合是 `SESSION_PARTICIPANT`、`createSessionPrincipalBindings`、`createSessionStorage`、`createSessionStoragePair`、`sessionStorageMaterials`；`exports` 只有 `.` 与 `./participants`；没有 `./cordis`（不在 `exports`、不可导入、源文件不存在）；源码只经 `@omne-harness/sql-contract` 与 `@omne-harness/sql-contract/worker` 导入 SQL 形状，不导入 `packages/storage/**`、sqlite-provider 或 `node:sqlite`，`package.json` 不依赖 sqlite-provider；每个读 handler 是 `snapshot`；每条 SELECT 有 LIMIT。
- [tenant-isolation.spec.ts](tenant-isolation.spec.ts)：访问裁定不放行时每个入口 `denied`，且没有任何调用到达存储；访问指名别的租户或会话的 `commit` 被拒绝；另一租户的会话读为 `denied`，向它提交不改变它；`pending` 只列出本租户的会话；两个租户的同名会话是两个会话；每次调用用本租户的事务域；目录答了别的租户时拒绝，目录不认识该租户时 `unavailable` 而不是空。
- [delegated.spec.ts](delegated.spec.ts)：session-contract 的委派视图符合性套件在本包上运行。视图不调用访问检查，对另一会话、另一租户或另一命令答 `denied`。夹具的 `decisionOf` 读 `sl_operation_evidence`，所以「a view commit stores the bound evidence with the operation record」对 SQL 提供者通过，没有不适用项。另加租户用例：租户 B 有同名会话时，经租户 A 绑定的视图对 B 的每个会话读与提交都答 `denied`，不调用检查，也没有调用到达存储。
- [operation-evidence.spec.ts](operation-evidence.spec.ts)：操作记录的访问证据。迁移 `session/003-operation-evidence` 排在执行索引之后并登记模块；视图提交存绑定证据，公开端口提交存本次裁定的证据；认回不改原证据；在操作行之后注入失败时没有证据行，重试只存一次；不带证据的外部提交方没有证据行；畸形证据答「不支持」并回滚；`query` 意图读回证据，另一租户的名字下答 `no-session`。
- [principal-bindings.spec.ts](principal-bindings.spec.ts)：session-cordis-contract 的会话归属读口套件在本包上运行。读口返回存储记录里的租户、会话与来源证据，不调用访问检查。租户 B 经工作主体替身为租户 A 的会话取主体时答 `denied`，不签发。目录缺该租户、目录答了别的租户、存储读不返回，都答 `unavailable`，不答 `not-bound`。
- [real-provider.spec.ts](real-provider.spec.ts)：真实 sqlite-provider 上的组合用例（慢层）：Worker 下提交与读回；回执返回后 SIGKILL 子进程，新提供者按原身份 `query` 得 `committed`；从未提交的身份得 `not_committed`（五项证明）、指向不服务的域得 `unknown`、`queryOperation` 答 `unknown`；关闭后租约归还、写入不当作未提交；`command_limit` 与 `queue_full`；8 个并发会话的原操作数与物理写事务数（WAL 提交帧）相等，记零合并。
- [participants.spec.ts](participants.spec.ts)：`./participants` 的导出集合；入口只导入编码函数与类型；`sessionCommandFacts` 构造的事实由 `session` 模块执行并按摘要认回；`decodeSessionReply` 解码四种回复。
- [execution-record.spec.ts](execution-record.spec.ts)：只含 `session` 的组合无效，两个参加者的组合中 `execution-record` 在前；首次共同发布一次提交两个参加者，两处写后注入失败时两侧都不保存；发布计数与 head 修订号守卫；原操作行冲突带原摘要与原答案；另一租户读不到；只读核对成立时不写 Session 行，冲突时整批回滚；共同根在任一方发布时前进。
- [execution-index.spec.ts](execution-index.spec.ts)：`startRun` 在同一事务里写执行索引，行与 SE13 位置一致；注入失败或 Session 拒绝时没有行；预置一行指向另一会话时 `startRun` 失败，原行不变；读 handler `session.execution` 对另一租户与没有 Run 的 execution 都输出 `null`，输入不全时 handler 失败。
- [real-joint.spec.ts](real-joint.spec.ts)：真实 sqlite-provider 上的共同提交（慢层）：一次回执含两个参加者，读 Worker 读到前进的共同根；只读核对冲突回滚 Agent 一侧；回执返回后 SIGKILL 子进程，新提供者按原身份 `query` 得 `committed`，两侧记录都在。
- [real-system-reads.spec.ts](real-system-reads.spec.ts)：真实 sqlite-provider 上的 R10、R11 系统读（慢层）。索引行直接写入域文件，只验证读取路径。
- [log.spec.ts](log.spec.ts)：`commitLog` 的同事务发布：条目行、快照、操作行与尾部四处写失败后全部 `sl_` 表不变；同身份认回、异内容冲突、另一 operation 认回原回执、两个查询答 `conflict`、应答丢失后重试认回、未铸租户与另一租户。
- [log-conformance.spec.ts](log-conformance.spec.ts)：session-contract 的 `commitLog` 符合性套件 LC-01 至 LC-10，在 `node:sqlite` 夹具与真实 sqlite-provider（慢层）上各跑一次。
- [history-index.spec.ts](history-index.spec.ts)：K-5 同根索引与 R2-D28 观察尾部前缀：索引字段与 `er_` 行一致、同一提交里发布并解释、占位回执、取消后的后继 `startRun` 正负例、前缀判定的穷举表、同一 Run 有两个 SE15 时按 attempt 行指回原 attempt（含真实提供者上写入并读回）、无行与指名别的 Run 的 attempt 不进索引、单 SE15 的无 attempt 行仍可证、20 轮与 200 轮的读取计数（慢层）、真实提供者上 `readWork` 带 `historyIndex`（慢层）。
- [admission-attempt-migration.spec.ts](admission-attempt-migration.spec.ts)：迁移 `execution-record/003-admission-attempt` 依赖 001 并登记模块；在有旧行的库上建表，旧行没有 attempt 行，第二次运行不改表定义也不丢已有行，`verify` 在无表时失败。
- [state-parts.spec.ts](state-parts.spec.ts)：迁移 `execution-record/004-state-parts` 依赖 001、表归 `execution-record`；分区写只替换或删除所列分区，`replace` 先删其余，整份写删除全部分区；六种畸形写入答「不支持」且不写任何行；同一提交里 Session 写失败时分区一起回滚；读口按行数与文本预算分页、超过预算的分区单独成页、只读所列分区、另一租户读不到、畸形输入被拒。
- [preadmission.spec.ts](preadmission.spec.ts)：准入记录的两阶段写入、Ki 唯一、结果只固定一次、跨租户读不到，以及真实提供者上杀进程后按原 H 读回（慢层）。
- [same-domain-tenant.spec.ts](same-domain-tenant.spec.ts)：同一事务域里租户 A 的行，以租户 B 读不到：准入记录按 H 与按 Ki 的点查（`findPreadmission`），以及 `commitLog` 对 `sl_journal` 的读（答 `denied`）。其他规格的夹具把每个租户放在各自的事务域里，语句丢了 `tenant = ?` 也读不到别家的行，所以这里在同一个库里写、再换租户读，并各带一个以租户 A 读的对照。
- [fixtures/](fixtures/README.md)：测试夹具，见该目录。

局限：这些用例是负控与入口检查，没有先红后绿记录。派生等于重算、分页与游标属性、写路径各 JC 行、并发写与失败分类注入尚未写（[验证义务](../docs/verification-obligations.md)）。真实提供者用例见 `real-provider.spec.ts`。

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/session-storage-sql`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。具名维护者由负责人指定。
