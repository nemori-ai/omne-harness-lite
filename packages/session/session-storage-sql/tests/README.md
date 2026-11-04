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
- [materials-options.spec.ts](materials-options.spec.ts)：`sessionStorageMaterials` 的 `readOutputLimitBytes`（SPEC K-1、第 19 条）：缺参数、`undefined`、`null`、0、负数、小数、`NaN`、无穷、超出安全范围、数字文本都在构造时抛 `TypeError`；传入的值成为每个读 handler 的 `maxOutputBytes`；两次构建互不共享。
- [tenant-isolation.spec.ts](tenant-isolation.spec.ts)：访问裁定不放行时每个入口 `denied`，且没有任何调用到达存储；访问指名别的租户或会话的 `commit` 被拒绝；另一租户的会话读为 `denied`，向它提交不改变它；`pending` 只列出本租户的会话；两个租户的同名会话是两个会话；每次调用用本租户的事务域；目录答了别的租户时拒绝，目录不认识该租户时 `unavailable` 而不是空。
- [delegated.spec.ts](delegated.spec.ts)：session-contract 的委派视图符合性套件在本包上运行。视图不调用访问检查，对另一会话、另一租户或另一命令答 `denied`。夹具的 `decisionOf` 读 `sl_operation_evidence`，所以「a view commit stores the bound evidence with the operation record」对 SQL 提供者通过，没有不适用项。另加租户用例：租户 B 有同名会话时，经租户 A 绑定的视图对 B 的每个会话读与提交都答 `denied`，不调用检查，也没有调用到达存储。
- [operation-evidence.spec.ts](operation-evidence.spec.ts)：操作记录的访问证据。迁移 `session/003-operation-evidence` 排在执行索引之后并登记模块；视图提交存绑定证据，公开端口提交存本次裁定的证据；认回不改原证据；在操作行之后注入失败时没有证据行，重试只存一次；不带证据的外部提交方没有证据行；畸形证据答「不支持」并回滚；`query` 意图读回证据，另一租户的名字下答 `no-session`。
- [binding-narrow.spec.ts](binding-narrow.spec.ts)：归属读口的窄读取：不调用 `session.work` 与 `session.work-version`，也不对 `sl_state` 发语句；快照行不在也答 `bound`；`bound` 记住后同一会话连读只触及存储一次；记忆按租户分键、有上限；之后的提交不改变 `source`（仍是建立证据），而 `readWork` 的 `source` 已变；未知会话答 `not-bound` 且不记，创建后答 `bound`；读失败不记；`stop` 后一律答 `unavailable` 且诊断含 `closing`，不触及存储。
- [scope-kinds-narrow.spec.ts](scope-kinds-narrow.spec.ts)：AD-03 读作用域绑定的方式（SCOPE-NARROW）：对 SE27、SE28 各做一次只带一种的历史读取，只触及 `session.history`，不对 `sl_state` 发语句；分页语句的查询计划走 `sl_kind_idx`，所以读到的行是这两种条目，不是会话全部历史；两种合在一次读取里就不走种类索引。读到的条目经 `contextScopesOf` 归约，与 `readWork` 的 `contextScopes` 相同。计划取自 node:sqlite，与提供者同一引擎。
- [principal-bindings.spec.ts](principal-bindings.spec.ts)：session-cordis-contract 的会话归属读口套件在本包上运行。读口返回存储记录里的租户、会话与来源证据，不调用访问检查。租户 B 经工作主体替身为租户 A 的会话取主体时答 `denied`，不签发。目录缺该租户、目录答了别的租户、存储读不返回，都答 `unavailable`，不答 `not-bound`。
- [real-provider.spec.ts](real-provider.spec.ts)：真实 sqlite-provider 上的组合用例（慢层）：Worker 下提交与读回；回执返回后 SIGKILL 子进程，新提供者按原身份 `query` 得 `committed`；从未提交的身份得 `not_committed`（五项证明）、指向不服务的域得 `unknown`、`queryOperation` 答 `unknown`；关闭后租约归还、写入不当作未提交；`command_limit` 与 `queue_full`；8 个并发会话的原操作数与物理写事务数（WAL 提交帧）相等，记零合并。
- [participants.spec.ts](participants.spec.ts)：`./participants` 的导出集合；入口只导入编码函数与类型；`sessionCommandFacts` 构造的事实由 `session` 模块执行并按摘要认回；`decodeSessionReply` 解码四种回复。
- [execution-record.spec.ts](execution-record.spec.ts)：只含 `session` 的组合无效，两个参加者的组合中 `execution-record` 在前；首次共同发布一次提交两个参加者，两处写后注入失败时两侧都不保存；发布计数与 head 修订号守卫；已有批的操作冲突带原摘要与原发布序号；另一租户读不到；只读核对成立时不写 Session 行，冲突时整批回滚；共同根在任一方发布时前进。
- [execution-index.spec.ts](execution-index.spec.ts)：`startRun` 在同一事务里写执行索引，行与 SE13 位置一致；注入失败或 Session 拒绝时没有行；预置一行指向另一会话时 `startRun` 失败，原行不变；读 handler `session.execution` 对另一租户与没有 Run 的 execution 都输出 `null`，输入不全时 handler 失败。
- [real-joint.spec.ts](real-joint.spec.ts)：真实 sqlite-provider 上的共同提交（慢层）：一次回执含两个参加者，读 Worker 读到前进的共同根；只读核对冲突回滚 Agent 一侧；写入上限放进的块整块读回；回执返回后 SIGKILL 子进程，新提供者按原身份 `query` 得 `committed`，两侧记录都在。
- [real-system-reads.spec.ts](real-system-reads.spec.ts)：真实 sqlite-provider 上的 R10、R11 系统读（慢层）。索引行直接写入域文件，只验证读取路径。
- [log.spec.ts](log.spec.ts)：`commitLog` 的同事务发布：条目行、快照、操作行与尾部四处写失败后全部 `sl_` 表不变；同身份认回、异内容冲突、另一 operation 认回原回执、两个查询答 `conflict`、应答丢失后重试认回、未铸租户与另一租户。
- [log-conformance.spec.ts](log-conformance.spec.ts)：session-contract 的 `commitLog` 符合性套件 LC-01 至 LC-10，在 `node:sqlite` 夹具与真实 sqlite-provider（慢层）上各跑一次。
- [history-index.spec.ts](history-index.spec.ts)：K-5 同根索引与 R2-D28 观察尾部前缀：索引字段与 `er_` 行一致、同一提交里发布并解释、占位回执、取消后的后继 `startRun` 正负例、前缀判定的穷举表、同一 Run 有两个 SE15 时按 attempt 行指回原 attempt（含真实提供者上写入并读回）、无行与指名别的 Run 的 attempt 不进索引、单 SE15 的无 attempt 行仍可证、20 轮与 200 轮的读取计数（慢层）、真实提供者上 `readWork` 带 `historyIndex`（慢层）。
- [admission-attempt-migration.spec.ts](admission-attempt-migration.spec.ts)：迁移 `execution-record/003-admission-attempt` 依赖 001 并登记模块；在有旧行的库上建表，旧行没有 attempt 行，第二次运行不改表定义也不丢已有行，`verify` 在无表时失败。
- [fact-family.spec.ts](fact-family.spec.ts)：Agent 事实族与内容块（第 18 条）。迁移 006 依赖 001、004 与 005，删除旧表，`er_operation` 不带 `answer`。一批追加在下一个发布序号，只有信封带操作身份。后一次发布的语句字节不多于前一次。六种畸形写入答「不支持」且不写任何行。两个写者竞争时后到者答「冲突」，再在新头上追加。主键撞位回滚，丢了操作键时信封索引拒绝第二批，事件序号只写一次。五个写入点注入失败后批与块都不可见，同一写入随后只成功一次。同租户同摘要只一行，摘要不符被拒。`pub > after` 增量读按整批分页，缺口与旧会话答 `missing`。按 execution 读、开着的 execution、按事件序号读与操作读。两个租户共用一个库时各读各的，没有该名字的租户得到「不存在」的答复。
- [work-cache.spec.ts](work-cache.spec.ts)：工作缓存（SPEC RT-04，快层，node:sqlite 夹具）：每个用例按 handler 计存储读次数。同版本连读只整读一次；本端口或另一个存储对象提交后、同一 `tail` 下 Agent 发布后都重读；两租户同名会话不串；读与提交交错时回答不早于已完成的提交；会话数与字节上界按 LRU 淘汰；`tail` 倒退答 `unavailable`；命中的对象深冻结；版本点查失败时整读；只改快照行不改尾部时本缓存不变、新存储对象读到新值；版本点查一行一条语句，行数与字节与快照大小无关。
- [direct-reads.spec.ts](direct-reads.spec.ts)：当前状态直接读的边界（SPEC RT-04「当前状态的拥有者与直接读者」，快层）：对全仓 `packages`、`apps` 的产品源码（含未跟踪文件，不含归档）跑 `git grep`，以文本点名 `session.work`、`session.work-version` 两个 handler 的文件只有定义、登记与工作缓存这五个，三个 handler 常量只在声明处使用。`git grep` 自身失败时用例失败，不当作通过。
- [work-fold.spec.ts](work-fold.spec.ts)：本进程提交的折叠（SPEC RT-04，快层）：T-F1 `commit`（accept、startRun、cancel-run 控制）、`commitEntries`、`commitLog` 各折叠一次，下一次读不整读，答案与整读的规范编码逐字节相等；T-F2 没有持有项、认回、参加者拒绝、发布计数不衔接时不折叠；T-F1（H2）`session.work-reads` 在本批之前的位置复现的索引与读数，与本批之前读到的逐字节相等；T-F3 读新索引之前插入一次发布，`session.work-index` 在同一 `tail`、当前计数上给出索引，按新计数登记，下一次读不整读、见到新索引且与整读相等；读新索引之前插入另一端口的提交，答 `stale`、不登记、下一次整读；复现读数之前插入发布，`session.work-reads` 答 `stale`、不再读索引；T-F4 篡改本批一行使 `reduce` 隔离，不登记；T-F5 折叠途中 10 个并发读等折叠，整读 0 次；T-F6 决定的输入范围超过 16 KiB 时不带，不折叠，下一次整读。
- [work-index-refresh.spec.ts](work-index-refresh.spec.ts)：发布之后换索引（SPEC RT-04，快层）：经 `registerSessionWorkIndex` 不带 `work` 调用 `refreshWorkIndex`。计数超过持有的计数时换索引，下一次读不整读，答案与整读逐字节相等；计数等于持有的计数时跳过；没有持有项时跳过，下一次整读；同一版本的替换在途时，重复调用跳过；读索引时存储已在另一个 `tail`，答 `stale`、不登记、下一次整读；读索引之前计数又前进一次时，按读到的计数登记并计 `republished`（P-4）。
- [work-fold-real.spec.ts](work-fold-real.spec.ts)：真实 sqlite-provider 上（慢层，`maxResponseBytes` 65536）：待办输入使 `basis` 超过 64 KiB 时提交仍成功，收据最长不超过 `WORK_BASIS_BYTES` 加 16 KiB；去掉 `basis` 的界时提交失败（变异 M8r）。
- [work-read-limit.spec.ts](work-read-limit.spec.ts)：真实 sqlite-provider 上 Session 快照的读上限（慢层，session SPEC SN-1）：存储行里快照最长的文本加长到超过 20 MiB（形状不变），`session.work` 答 `read_limit`，`readWork` 很快答 `unavailable` 且诊断带 `read_limit`；对照组 20 MiB 以内整份读回，2 MiB 的快照（超过原 1 MiB 上限）也整份读回。快照直接写进关闭的域文件，只验证读路径。
- [read-output-limit.spec.ts](read-output-limit.spec.ts)：真实 sqlite-provider 上读 handler 的 20 MiB 输出上限落在内容块上（慢层，session-storage-sql SPEC K-1）：写入上限放大后，经真实提交写入 2 MiB 与离上限一 KiB 的块，`execution-record.blob` 整块读回；输出超过 20 MiB 时答 `read_limit`，不带任何输出。上限在用例里是字面值，经 `readOutputLimitBytes` 参数传入，参数被忽略、改小、改大一 KiB 或改小两 KiB 都使用例变红。
- [preadmission.spec.ts](preadmission.spec.ts)：准入记录的两阶段写入、Ki 唯一、结果只固定一次、跨租户读不到，以及真实提供者上杀进程后按原 H 读回（慢层）。
- [same-domain-tenant.spec.ts](same-domain-tenant.spec.ts)：同一事务域里租户 A 的行，以租户 B 读不到：准入记录按 H 与按 Ki 的点查（`findPreadmission`），以及 `commitLog` 对 `sl_journal` 的读（答 `denied`）。其他规格的夹具把每个租户放在各自的事务域里，语句丢了 `tenant = ?` 也读不到别家的行，所以这里在同一个库里写、再换租户读，并各带一个以租户 A 读的对照。
- [entry-codec.spec.ts](entry-codec.spec.ts)：`sl_entry.entry` 文本的编解码（SPEC 已知限制第 23 条）：载荷存为普通 JSON，读回的条目与写入的相等，数字原文与键顺序不变，条目对象的摘要与旧编码读出的相等；重复键不写也不读；旧编码的行答 `StoredEntryMalformed` 并带专门诊断；固定会话的存储字节不超过普通 JSON 的 1.15 倍，并打印旧编码、新编码与普通 JSON 的字节数。
- [entry-codec-roundtrip.spec.ts](entry-codec-roundtrip.spec.ts)：编解码的边界往返，读回的值树与写入的深相等，含键顺序：整数样式的键（6 个键的全部排列）、数字原文（`1.0`、`1e2`、`-0`、超过 2^53 的整数等）、转义与控制字符、非 BMP 字符、孤立代理项、空字符串、空容器、1000 层嵌套。另跑 session-contract 的两套符合性用例与一条 `message.tool` 输入，所有落库行读回后再写得到同一文本，`bytes` 等于字节数，证据摘要与旧编码读出的条目相同。
- [stored-entry-rows.spec.ts](stored-entry-rows.spec.ts)：经端口的条目行：提交的行存编解码文本，`bytes` 是它的 UTF-8 字节数，历史页读回同样的条目；一行旧编码使历史读、读它的提交与归属读答 `unavailable` 并带诊断，提交不写行。
- [entry-codec-bench.spec.ts](entry-codec-bench.spec.ts)：慢层。固定会话（541 条）上测四项耗时：每条的文本与 INSERT、每条的解码、历史索引从空重建、`session.history` 按 256 KiB 分页读完，打印均值、中位数与 p95。不设时间断言；对照另一棵树时只换 `fixtures/entry-text.ts`。
- [history-index-incremental.spec.ts](history-index-incremental.spec.ts)：历史索引的 Session 行在 Worker 内增量保留（SPEC「Worker 内的两处保留」）：保留的索引与整读的答案相等，没有新行的读不读五种行，游标之后有空洞时本次调用失败、下一次重建，未提交事务的行不保留，会话数与行数有上界。
- [participant-snapshot-cache.spec.ts](participant-snapshot-cache.spec.ts)：参加者的解析快照（SPEC「Worker 内的两处保留」）：同一快照只解析一次，按头文本核对；提交写出的快照被保留，下一次提交不读分块；失败的提交留下的保留项与存储的头不等，下一次提交重读分块；保留的快照深冻结，会话数与文本总长有上界。
- [state-rows.spec.ts](state-rows.spec.ts)：快照的存储形态（SPEC「快照的存储形态」，R2-D292）：固定种子的随机追加、改动、移出与移动后读回相等；追加只写头与尾部分块；大对象成员单独成行，不变时不重写；没有布局的快照整写并删除旧分块；真实参加者跑 200 步，每次提交写入的快照文本不随步数增长。负控：去掉按布局比较、去掉文本相等的保留、去掉成员行，各自对应的用例变红。
- [fixtures/](fixtures/README.md)：测试夹具，见该目录。

局限：这些用例是负控与入口检查，没有先红后绿记录。派生等于重算、分页与游标属性、写路径各 JC 行、并发写与失败分类注入尚未写（[验证义务](../docs/verification-obligations.md)）。真实提供者用例见 `real-provider.spec.ts`。

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/session-storage-sql`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。具名维护者由负责人指定。
