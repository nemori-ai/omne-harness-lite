# storage-sql 实现设计

## 实现路径与来源

**直接采用 Kysely 0.29.6 作查询层与迁移 API，自建一个薄的 `node:sqlite` Driver，pg 用 Kysely 内置方言接线。**

| 选择点 | 采用 | 依据 |
|---|---|---|
| 要不要查询层 | 要，且只因为一条要求：**只改配置即切 PostgreSQL**（[D-026 第二条](../../../../record/decisions/infrastructure-persistence-choices/decision.md#选择与范围)） | 研究正文[「被调研的五家 CLI harness 没有一家用查询构建器」](../../../../../research/agent-harness-persistence-and-identity-infra/research.md#被调研的五家-cli-harness-没有一家用查询构建器)——它们不需要切方言，本项目需要。**这是引入 Kysely 的唯一理由**：若将来放弃 pg，Kysely 相对原生 SQL 就是无收益复杂度，回 D-026 重判 |
| Kysely 而不是 Drizzle | Kysely：单一 `Kysely<DB>` 类型，方言在构造时传；迁移是 TS `up/down(db)`，同一份可跑多方言 | 研究正文[「Drizzle 在类型层按方言分裂，Kysely 在构造时传方言」](../../../../../research/agent-harness-persistence-and-identity-infra/research.md#drizzle-在类型层按方言分裂kysely-在构造时传方言)：Drizzle 的 `sqlite-core` 与 `pg-core` 是两套类型，切方言等于改代码。**Kysely 的代价也在同一节**：它不替你抹平 `FOR UPDATE`、`RETURNING`、`ON CONFLICT` 与列类型名——锁语义的方言分支由本节点承担（[下文](#两种方言的锁语义映射)） |
| sqlite 驱动 | Node 24 内置 `node:sqlite` 的 `DatabaseSync` | 研究正文[「TS 实现的同行 harness 用内置 node:sqlite，不用原生插件」](../../../../../research/agent-harness-persistence-and-identity-infra/research.md#ts-实现的同行-harness-用内置-nodesqlite不用原生插件)：DSH、Cursor、opencode 三家；内置模块决定 Node 下限（承载仓库 engines 已钉 `>=24 <25`）、能进单文件可执行程序、无原生插件打包问题 |
| Kysely 的 sqlite 方言 | **自写薄 Driver**，复用 kysely 导出的 `SqliteAdapter`、`SqliteQueryCompiler`、`SqliteIntrospector` | 同一节：Kysely 没有官方 `node:sqlite` 方言（主仓 issue 自 2024-12 open），社区包 `kysely-node-native-sqlite` 3 star、3 次提交同一天、此后无维护——**成熟度不足以承载 R-3 的锁语义**。自写部分只有 `Driver` + `DatabaseConnection` 两个接口，不是 fork |
| `better-sqlite3` | **不用**，作退路记在[实施缺口](#实施缺口与消费者影响) | 同一节 DSH 的否决理由；且 Node 24 已不需要它 |
| sqlite 运行参数 | `journal_mode=WAL`、`synchronous=NORMAL`、`foreign_keys=ON`；写事务 `BEGIN IMMEDIATE`；**`busy_timeout=5000` 只设在读句柄**——写句柄的忙等待改由 Driver 异步重试（理由在 [Driver 边界](#自写-nodesqlite-driver-的边界)，是对「三家一致」参数的一处有意偏离） | 研究正文[「sqlite 运行参数在三家 TS/Rust 实现里一致」](../../../../../research/agent-harness-persistence-and-identity-infra/research.md#sqlite-运行参数在三家-tsrust-实现里一致)；D-026 明写这些参数是提供者节点的默认，不是决定的接受对象——**改动归本节点，不回决定** |
| pg | Kysely 内置 `PostgresDialect` + `pg` 8.23.0 | D-026「pg 方言本程只接线不跑」；pg 上的套件与升级测试在 `OMNE_TEST_PG_URL` 指向可连的库时运行，缺时 skip 并在用例名里写明 |
| in-memory | **不提供** | D-026 第一条；测试夹具就是本提供者的 sqlite 临时文件库 |
| 升级守卫（排他、迁移前只读核对、升级快照、恢复与确认） | **自建薄层**，不引库：sqlite 的快照与恢复只用 `node:sqlite` 与 Node 内置文件操作；pg 只有排他与「迁移一个事务」两项 | 编排与要求来自 [tenancy-host「升级的整体性」](../../../apps/tenancy-host/design.md#升级的整体性迁移前只读核对快照与确认)的 R-U1～R-U8 与缺口 U-2；Kysely `Migrator` 只管迁移本身（它自带登记表 `kysely_migration` 与锁表 `kysely_migration_lock`），不管「迁移之后别的部件失败时撤回」。机制与取舍在[下文](#属主实例排他迁移前只读核对升级快照与确认) |

**Cordis 版本**：采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）。本节点依赖的内核语义引 [basis](../../../../basis/README.md) 条目（四条均已按 4.0.4 回填 probe，`checked: 2026-09-22`）；「插件体或 config 抛出 ⇒ fiber `FAILED`」现已有条目 [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)；basis 仍没有条目的一条——`ctx.provide` 经 effect 纳管——与前者一起由 `core/kernel-basis` 的 probe（承载仓库 `packages/core/kernel-basis/tests/basis/provide-is-effect-managed.test.ts`、`plugin-throw-fails-fiber.test.ts`）在 4.0.4 上通过，登记在 [kernel-basis verification](../../core/kernel-basis/verification.md#证据义务)。

**复杂度声明**：本节点引入的一切方言分支（锁语句、错误码、事务种类）都是**正确性机制**，各自指向一条 R；没有任何一处是为性能加的。连接队列、`busy_timeout` 都不是优化，是让 `DatabaseSync` 这个同步单句柄能承载异步调用方的最小代价。
升级守卫（排他锁、快照、恢复）同样是正确性机制，各自指向一条 R-U；带迁移的实例由 config **显式二选一**（守卫或 `false`，[下文](#守卫为什么显式开启)），选 `false` 或不带迁移的实例没有这一层。

## 能力到 Cordis 的投影

本节点不兑现契约条款；第一列是 **协议责任**（[`core/storage`](../../core/storage/README.md) 的接口与 AI／OG 的 R 条目），第二列是本插件上的落点。名字是实名（`src/index.ts` 导出），源码已实现（HUB `c9b5850`）。

| 协议责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| 存储服务面 | 插件 `storageSqlPlugin`（插件名 `storage-sql`），`ctx.provide(STORAGE_SERVICE, impl)`（`'storage'`）；`impl` 是 `SqlStorage`，实现协议的 `StorageInstance` | 已实现（`src/plugin.ts`、`src/provider.ts`）；Kysely 0.29.6 | 服务对象是读、写各一个 `Kysely` 实例加事务包装器；**不导出第二套 DSL**——`tx.db` 就是 Kysely 的 `Transaction` |
| `read(fn)`：只读事务、快照一致（OG R-3d；AI S-37 两次读同一读事务；协议 P-6） | `impl.read` | sqlite：在**独立的读句柄**（打开时 `PRAGMA query_only = ON`）上 `BEGIN`（deferred）——WAL 下事务在第一条读语句处取快照，此后不看新提交；`fn` 内的写语句被 `SQLITE_READONLY` 拒 ⇒ `StorageDefect`（只读事务里写是调用方缺陷）；pg：`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`，写语句 `25006` ⇒ 同 | sqlite 那一半由套件 C-7／C-7b 证；pg 那一半以 pg 上套件的登记结果为准。读句柄独立于写句柄是协议 P-12「`read()` 与 `write()` 真正并发」的要求。事务种类怎么到 Driver 见[下文](#自写-nodesqlite-driver-的边界) |
| `write(fn)`：单次提交原子（AI R-1／OG R-1；协议 P-1）、提交内读到全部已提交写（AI R-3／OG R-3c；P-3） | `impl.write` | sqlite：写句柄上 `BEGIN IMMEDIATE` → `fn` → `COMMIT`，任何抛出 ⇒ `ROLLBACK` 后按[错误码映射](#错误码映射表)重抛（调用方自己的异常**原样**上抛，P-1）；pg：`BEGIN`（默认 READ COMMITTED）→ 同上，**且写事务内每条语句包在 `SAVEPOINT` 里**（协议 P-2，[下文](#pg-下语句级失败不废事务savepoint)） | R-1 由方言各自的事务保证。R-3c 在 sqlite 由 `IMMEDIATE` 给：持有 RESERVED 锁期间无人能提交，本事务读到的就是最新已提交状态；在 pg 由 READ COMMITTED 的逐语句快照给 |
| `lockRow(table, key)`：行锁定读的锁那一半（AI R-3、OG R-3a） | `WriteTx.lockRow` | sqlite：**不发语句**——`BEGIN IMMEDIATE` 已是库级写锁，R-3／R-3a 平凡成立；pg：`SELECT 1 FROM <table> WHERE <key> FOR UPDATE` | 协议要求「先锁后读」；调用方随后的读由自己做。**pg 下对不存在的行 `FOR UPDATE` 锁不到任何东西**——两次并发插入同键的竞争由 R-2 的唯一约束裁决，不由本方法裁决，两个 tenancy 节点的设计已按此写（AI R-2「唯一性由主键约束兑现」） |
| `lockSentinel(name)`：部署级哨兵锁（OG R-3b） | `WriteTx.lockSentinel` | sqlite：不发语句（同上）；pg：`SELECT pg_advisory_xact_lock(hashtext(<name>))`——事务级咨询锁，提交或回滚即释放，**不需要哨兵表** | 落选方是「哨兵表 + `FOR UPDATE`」，它要本包自带一张表与迁移；咨询锁的弱点是 `hashtext` 碰撞会让两个不同名字互相串行——只多等待，不失正确性 |
| 四种失败类型（AI R-2／R-5／R-7，OG R-2／R-5／R-6） | 抛出协议定义的 `StorageUnavailable`、`UniqueViolation { constraint }`、`ReferenceViolation { kind }`、`StorageDefect` | 映射函数 `translateSqliteError(error, statementKind, resolveUnique, handle)`（`src/sqlite/errors.ts`）与 `translatePgError(error, sqlText)`（`src/postgres/index.ts`），两者都经公开入口导出（测试与装配面） | 全表见[错误码映射表](#错误码映射表)。**`StorageUnavailable` 只收瞬时失败**（连接、忙超时、I/O、撤除期间被关）；`NOT NULL`／`CHECK`／语法／未知列／只读事务里写等是 **`StorageDefect`**，消费者不映射、直接上抛——理由记在映射表末行。`StorageUnavailable` → 各消费者「不可用」字面的折叠函数归 `core/storage`（错误类型的 owner），本节点不带 |
| 引用约束两个方向（AI R-7 ⇔ OG R-6，同一条外键的两侧） | 不在本节点定义——约束在装配的迁移文件里；本节点保证 sqlite 上 `foreign_keys=ON` **对每个句柄**生效，并把两个方向的失败映射成 `ReferenceViolation.kind` | `DatabaseSync` 打开时设 PRAGMA | **两个节点靠同一约束域成立，本提供者就是那个约束域**：同一个文件库／同一个 pg 数据库、同一份迁移。跨进程后这条仍成立（约束在库里），换成两个库才失效 |
| 唯一约束立即释放（AI R-6） | 无落点——sqlite 与 pg 的唯一索引在删除提交后立即允许同值插入 | — | 一致性套件一条测试 |
| 持久（AI R-4／OG R-4） | sqlite：WAL；pg：服务器 | — | **有边界**：`synchronous=NORMAL` 下进程崩溃不丢已提交事务，**操作系统崩溃或断电可能丢最后一段已提交事务**（研究正文同一节「代价与不适用」）——那一段是预写日志里自上一次检查点以来、尚未被操作系统回写的全部提交；空闲时它有多长、对时钟意味着什么见 [clock R-C2](../clock/design.md#对存储提供者的要求清单)。R-4 写的是「跨进程重启仍在」，本节点兑现到这一层；断电级要 `synchronous=FULL`，那是装配的政策，[实施缺口](#实施缺口与消费者影响)登记 |
| 不可用可识别（AI R-5／OG R-5） | 一切 I/O 类失败 ⇒ `StorageUnavailable`；句柄已关闭 ⇒ `StorageUnavailable`；**从不返回空结果或旧快照** | — | 「不返回旧快照」在 sqlite 由 WAL 读事务给，在 pg 由 REPEATABLE READ 给——都是「要么这个快照要么报错」 |
| 迁移运行器 | `openStorage` 内部以 Kysely `Migrator.migrateToLatest()` 跑迁移（不另导出运行器）；插件 config 可选项 `migrations` 接收装配提供的 `MigrationProvider`（装配经 `core/storage` 的 `composeMigrations` 合成），在 `provide('storage')` **之前**跑 | Kysely `Migrator`；已实现（`src/open.ts`、`src/upgrade/owner.ts`） | **迁移文件归装配层**；本包不带任何业务表。sqlite `supportsTransactionalDdl = false`（研究正文），失败的迁移可能留半截 DDL：**装了升级守卫时第一道收口是迁移前的快照**（失败即恢复，[下文](#属主实例排他迁移前只读核对升级快照与确认)），迁移自保证幂等是第二道；不装守卫时只有幂等这一道。幂等是对装配迁移文件的要求，写进[依赖表](#依赖作用域与绑定)。`Migrator` 自带的迁移登记表是 `kysely_migration`（列 `name`、`timestamp`），锁表是 `kysely_migration_lock`——判「库里有没有业务数据」时两张都要排除 |
| 同一份库同一时刻只有一个属主（[tenancy-host 缺口 U-2](../../../apps/tenancy-host/design.md#实施缺口与消费者影响)） | 装了升级守卫的实例在插件体**第一步**取排他、**撤除最后一步**才放；拿不到 ⇒ 具名启动失败，不等待 | 已实现：sqlite 在库旁锁文件 `<file>.owner-lock` 上开一个持住的 `BEGIN EXCLUSIVE`（`src/sqlite/owner.ts`）；pg 在一条专用 `pg.Client` 上取会话级咨询锁 `pg_try_advisory_lock(hashtext('omne-harness-lite/storage-sql/owner'))`（`src/postgres/owner.ts`） | 两条交错的反证与机制对比在[下文](#排他为什么是随进程死亡释放的锁)；只在属主之间成立，不装守卫的实例不参与 |
| 迁移前只读核对、迁移登记可读（tenancy-host R-U1、R-U2） | 插件体在任何写之前开**一次只读事务**：读目录与迁移登记，把它们连同 `ReadTx` 交给装配经 config `upgrade.checks` 给的核对函数；任一不过 ⇒ 具名启动失败 | 已实现（`src/upgrade/owner.ts`、`src/upgrade/registry.ts`） | 核对的判据归给出者（数据格式归 tenancy-host，时钟回拨归 [`infra/clock`](../clock/design.md#迁移前的只读回拨核对)）；本节点只给读数与一次只读事务 |
| 升级快照、恢复、遗留检查（R-U3、R-U4、R-U5） | sqlite：有待跑迁移时建一致快照；确认之前的任何失败或撤除，关句柄之后恢复；打开库之前先恢复遗留快照 | 已实现（`src/sqlite/owner.ts`） | 快照落在磁盘上，**它的存在就是「一次升级尚未确认」**——进程崩溃之后照样说得出。pg 没有这一项（[缺口](#实施缺口与消费者影响)） |
| 确认（R-U6）与未确认状态可查 | **包导出，不进存储协议**：`createUpgradeGuard()` 造一个守卫对象，装配经 config `upgrade.guard` 传入、自己留着；插件体取得排他之后把本实例附着上去；装配调 `guard.confirm() → Promise<UpgradeConfirmation>`（删快照并落盘，返回 `{ migrated, snapshotTaken, snapshotRemoved }`）与 `guard.pending() → Promise<UpgradePending>`（`'never-attached' \| 'clear' \| { pending: { location } }`） | 已实现（`src/upgrade/guard.ts`） | 确认与查询只认**附着过的那一个实例**，不以 config 派生位置（[守卫对象](#确认为什么绑在守卫对象上)）。`pending()` 是因为撤除路径上的恢复失败**内核不上抛**（basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)：disposer 异常只记日志，`fiber.dispose()` 照常 resolve），装配只能回头看磁盘才说得出「恢复失败、快照在哪」（R-U8） |
| pg 全部迁移一个事务（R-U7） | pg 方言下整批待跑迁移在一个事务里提交或无痕 | 由 Kysely `Migrator` 给，本节点不另包：pg 适配器 `supportsTransactionalDdl = true` 且未设 `disableTransactions` 时，`Migrator` 在一条连接上取迁移锁后把全部待跑迁移与登记插入放进同一事务（kysely 0.29.6 `dist/migration/migrator.js`） | **迁移提交之后别的部件失败，pg 撤不回**——显式缺口，见[实施缺口](#实施缺口与消费者影响) |
| 各类启动失败具名（R-U8） | 一个启动失败类型带阶段判别：`StorageStartupFailure { stage, cause, snapshot? }`，`stage: StorageStartupStage` ∈ `'occupied' \| 'restore' \| 'preflight' \| 'snapshot' \| 'migration'`（被占／恢复／核对／快照／迁移），**不折成 `StorageUnavailable`** | 已实现（`src/upgrade/guard.ts`） | 恢复失败时快照不删，失败里带快照位置；只读核对那次读本身失败（库够不着）时阶段是「核对」、`cause` 是 `StorageUnavailable`——说得出「差的是数据所在」 |
| 存储不可用只以返回值到达，不表现为面缺席（入口契约 [S-34](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁) 与 [S-36](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证)「起来即整体」行的前提，`accepted`，D-028） | 运行期一切存储失败都是某次 `read`／`write` 的抛出；本插件**从不因运行期失败撤下自己**（不 dispose、不离开 `ACTIVE`） | 已实现（`src/provider.ts` 无自撤路径） | 前提成立的依据就是「没有这条路径」；撤除只来自装配或父 fiber |

### 要求清单到方言机制

AI 与 OG 的要求清单合并去重后逐条落点。「证据」列是 [`core/storage` 一致性套件](../../core/storage/design.md#要求到协议再到会红的测试)的用例号 `C-n`（套件归那个节点；本节点写的是**它在本提供者上为什么会绿**）。pg 一列的每一格以 pg 上套件的登记结果为准。

| 要求 | sqlite | pg | 证据 |
|---|---|---|---|
| R-1 单次提交原子（AI R-1／OG R-1；P-1） | 一个 `BEGIN IMMEDIATE … COMMIT`；`fn` 抛出或提交失败 ⇒ `ROLLBACK`，无痕；调用方异常原样上抛 | 同，`BEGIN … COMMIT` | C-1a／C-1b／C-1c |
| R-2 唯一约束可识别（AI R-2／OG R-2；P-11） | 约束由迁移建且**显式命名**（唯一约束与主键都要）；`SQLITE_CONSTRAINT_UNIQUE`／`SQLITE_CONSTRAINT_PRIMARYKEY` ⇒ `UniqueViolation`，`constraint` 由本提供者用 `PRAGMA index_list`／`index_info` 把列元组反查回约束名：`origin = 'c'`（`CREATE UNIQUE INDEX`）⇒ 索引名，`origin = 'pk'`（主键）⇒ `<table>_pkey`，`origin = 'u'`（表内 `UNIQUE` 的自动索引）拿不回迁移名；反查不到 ⇒ `StorageDefect`（迁移没命名是缺陷，不是不可用；`src/sqlite/constraints.ts`） | SQLSTATE `23505` ⇒ `UniqueViolation`，`constraint = err.constraint` | C-2：两方言同一断言 `constraint === 迁移里的名字` |
| 约束失败后「同一提交内重读」（OG S-20：撞 `ownerAccount` 唯一约束后提交内重读返回既有；OG R-6；P-2） | 原生成立：约束失败只废那一条语句 | 写事务内每条语句包 `SAVEPOINT`，失败 `ROLLBACK TO` 后事务仍可用 | C-3、C-13 |
| R-3 行级写锁从读起（AI R-3）／R-3a 同组织成员写序列化（OG；P-4） | `BEGIN IMMEDIATE`：库级写锁；第二个写事务在 `BEGIN` 处由 Driver **异步重试**等待，总上限 5 s 后仍 `SQLITE_BUSY` ⇒ `StorageUnavailable` | `lockRow` 发 `FOR UPDATE`；第二个事务在锁处等，拿到后读到前者提交后的行 | C-4：两个实例、`await` 让出、两次都提交、终值 +2、**无一方 busy 失败**——后一条正是异步重试而非阻塞 busy handler 的理由（[Driver 边界](#自写-nodesqlite-driver-的边界)） |
| R-3b 部署级哨兵（OG；P-5） | 同上（库级锁覆盖） | `pg_advisory_xact_lock(hashtext(name))` | C-5 |
| R-3c 提交内读写同源（OG；AI R-3 后半；P-3） | `IMMEDIATE` 持锁期间无并发提交 ⇒ 读即最新 | READ COMMITTED 逐语句快照 + `FOR UPDATE` 返回最新版本 | C-6a／C-6b |
| R-3d 只读事务快照一致（OG；P-6） | 读句柄 deferred `BEGIN` 在 WAL 下的快照；`query_only=ON` 拒写 ⇒ `StorageDefect` | `REPEATABLE READ READ ONLY`；写语句 `25006` ⇒ `StorageDefect` | C-7／C-7b |
| R-4 持久（AI／OG；P-7） | WAL；`synchronous=NORMAL` 的边界见上 | 服务器 | C-8（关闭句柄后仍在；跨进程重启归 AI S-32 演练） |
| R-5 不可用可识别（AI／OG；P-8） | 关闭句柄后调用 ⇒ `StorageUnavailable`；重试超时 ⇒ 同；`SQLITE_IOERR`／`CANTOPEN`、写句柄上的 `SQLITE_READONLY` ⇒ 同。**非法语句不是不可用** ⇒ `StorageDefect` | 连接类错误（`08xxx`、`57P01`、`ECONNREFUSED`）⇒ `StorageUnavailable` | C-9a／C-9b；「`StorageDefect` 不被折成 `StorageUnavailable`」由 C-14 证 |
| R-6 删除即释放（AI R-6；P-9） | 立即 | 立即 | C-10 |
| R-7 被引用行删除受限 ⇔ OG R-6 两个方向（P-10） | `foreign_keys=ON`（每句柄）+ 迁移里的 `ON DELETE RESTRICT`；`SQLITE_CONSTRAINT_FOREIGNKEY` ⇒ `ReferenceViolation`，`kind` 按触发语句种类判 | `23503` ⇒ `ReferenceViolation`，`kind` 同样按语句种类判 | C-11／C-12 |
| 同进程并发 `write` 不互卡、不 busy 失败；`read` 与 `write` 真并发（P-12） | 写句柄一个 + 进程内写队列；读句柄独立（**一个**，`query_only=ON`；kysely 对 `supportsMultipleConnections = false` 的 sqlite adapter 在每个 Kysely 实例上加连接互斥锁，并发读在那里排队——2026-09-23 取证，Driver 里「按需打开、上限 4」的分支因此不发生；读写真并发仍成立，因为读写是两个 Kysely 实例；`src/sqlite/driver.ts`）；跨实例靠异步重试 | 连接池 | C-4／C-7 的「无一方 busy 失败」分支 |

### 方言配置形状

config `StorageSqlConfig`（`src/config.ts`）是一个可辨识联合（经 `core/kernel-basis` 的 `definePlugin({ name, inject?, Config, apply })` 走 Standard Schema——它是「配置错误 ⇒ 启动失败」的唯一实现点）：

```text
{ dialect: 'sqlite', file: string, migrations?: MigrationProvider, upgrade?: { checks: PreflightCheck[], guard: UpgradeGuard } | false }
{ dialect: 'postgres', connectionString: string, migrations?: MigrationProvider, upgrade?: { checks: PreflightCheck[], guard: UpgradeGuard } | false }
```

- `upgrade`：**带 `migrations` 时必须显式给出**——`{ checks, guard }` 开启升级守卫，`false` 声明不开；缺席是配置错误 ⇒ 启动失败（[守卫为什么显式开启](#守卫为什么显式开启)）。不带 `migrations` 时只能缺席或 `false`，给对象是配置错误。`checks` 可为空表，每一项的形状见[下文](#迁移前只读核对)；`guard` 必须是本包 `createUpgradeGuard()` 造的对象（[守卫对象](#确认为什么绑在守卫对象上)），config 校验只核这一点（`z.custom` 以 `instanceof UpgradeGuard` 放行，同引用交给插件体）。`openStorage` 被直接调用时同样先过这份 config 校验。

- `file` 是文件路径；**不接受 `:memory:`**（D-026 第一条；schema 层拒绝）。测试用临时文件，每个测试文件一个，不共享。
- `migrations` 是装配传入的 Kysely `MigrationProvider`（对象，不是路径——本包不猜迁移文件在哪）。缺席 ⇒ 不跑迁移，只打开库。这一项是为「迁移在 `provide('storage')` 之前跑」设的：消费者解析到 `storage` 时表已在。落选方是装配自己起一个迁移步骤，那需要第二个「schema 已就绪」的服务名让消费者去 inject，比一个可选 config 项多一条边。
- **配置错误政策：启动失败。**形状不对、`dialect` 不认识、`file` 为 `:memory:`、pg 连接串解析不了、带 `migrations` 而缺 `upgrade`、`upgrade` 对象没有 `migrations` 相伴、`guard` 不是本包造的、同一个守卫已附着着另一个在役实例 ⇒ 插件体抛出，fiber 不进 `ACTIVE`，不 provide——与三个持钥节点「缺密钥即启动失败」同一政策。**打开失败同样启动失败**：sqlite 文件打不开、pg 启动 ping（`SELECT 1`）失败、迁移失败，以及升级守卫的各阶段失败（被占、恢复、核对、快照）⇒ 抛出。理由与那边一样：一份连不上库的部署不该半开着跑、把配置错报成运行期抖动——OG 的清除链会对 `unavailable` 无限重扫。

### 自写 `node:sqlite` Driver 的边界

| 部件 | 来源 | 本节点写什么 |
|---|---|---|
| 公开入口里的 `NodeSqliteDialect`、`NodeSqliteDriver`、`SqlStorage`、`openStorage`、两个错误翻译函数 | **测试与装配面**（2026-09-23 架构评审 N-2）：OG 的迁移测试与装配的夹具要用；`tenancy/**/src` 不得 import 它们绕过协议——由 ts-checks 规则 `no-dialect-bypass` 守 | 不写。消费者只经 `Storage` 协议进库 |
| `SqliteAdapter`、`SqliteQueryCompiler`、`SqliteIntrospector` | kysely 导出，原样复用 | 不写。`supportsTransactionalDdl = false`、`supportsReturning = true` 是 adapter 自带的事实 |
| `Driver`（`NodeSqliteDriver`） | 自写 | `init`（写实例打开**一个写句柄**，读实例打开一个读句柄，各设 PRAGMA：两者 WAL／NORMAL／`foreign_keys=ON`，读句柄另加 `query_only=ON` 与 `busy_timeout=5000`，写句柄 `busy_timeout=0`）、`acquireConnection`（写：单句柄，**进程内队列**排队；读：取一个空闲读句柄，没有就开新的，到上限 4 排队——Kysely 对单连接 adapter 的互斥使后两支不发生，见上表 P-12 行）、`beginTransaction`（写句柄发 `BEGIN IMMEDIATE`，遇 `SQLITE_BUSY` **异步重试**——`setTimeout` 退避 1、2、4、8、16、32、50 ms 后按 50 ms 继续、总上限 `WRITE_LOCK_TIMEOUT_MS` = 5 s，超时 ⇒ `StorageUnavailable`；读句柄发 `BEGIN`）、`commitTransaction`、`rollbackTransaction`、`releaseConnection`、`destroy`（关闭准入 → 等在途写排空 → 逐个 `close()`） |
| `DatabaseConnection` | 自写 | `executeQuery`：`prepare` + 按语句种类选 `run`／`all`，返回 `QueryResult`（`numAffectedRows`、`insertId`、`rows`）；`streamQuery`：本版不支持，抛出——协议没有流式读面 |
| 事务种类的传递 | 自写（`src/sqlite/index.ts`、`src/provider.ts`） | 读、写各一个 `Kysely` 实例，`NodeSqliteDialect` 的构造选项 `role: 'read' \| 'write'` 在构造期定死这个实例只做哪一种事务；`impl.read`／`impl.write` 另以 `setAccessMode('read only' \| 'read write')` 发起，写 Driver 收到只读请求即抛（那是提供者缺陷） |
| `DatabaseSync` 构造选项 | 自写 | 构造时给 `enableForeignKeyConstraints: true` 与 `timeout`（写 0、读 5000，即 busy timeout），另显式 `PRAGMA foreign_keys = ON`。**`foreign_keys` 是每句柄状态**，重开必须重设 |

**进程内写队列是协议 P-12 的要求，不是正确性机制。**一个 `DatabaseSync` 同一时刻只能有一个打开的事务，队列让同一实例的多个异步调用方共用一个写句柄；跨实例、跨进程的排序由 sqlite 自己的文件锁给。队列随插件实例生灭——这正是它不能承担 R-3 的原因，也是套件的并发用例（C-4／C-5／C-13）**用两个提供者实例**跑的原因：单实例下两个写事务在队列里就已经串行，测试红不了。

**为什么写句柄不用 sqlite 的 busy handler，而在 Driver 里异步重试。**`DatabaseSync` 是同步 API，sqlite 的 busy handler 在 C 调用里睡眠——**整个线程停住**。两个实例在同一个进程里：A 拿到 `IMMEDIATE` 锁后 `await`（让出事件循环），B 的 `BEGIN IMMEDIATE` 进入 busy handler 阻塞线程，A 永远等不到自己的下一轮，B 等满 `busy_timeout` 后 `SQLITE_BUSY`——C-4 的「无一方 busy 失败」正是为这条失败形态写的。把等待挪到 JS 侧（`SQLITE_BUSY` 立即返回、`setTimeout` 退避后重试、总上限 5 s）后，B 等待时 A 能跑完提交，B 再拿锁。这一条对跨进程也成立（另一进程持锁时本进程的重试同样让出）。

| | sqlite busy handler（落选） | **Driver 异步重试（选）** |
|---|---|---|
| 最强论证 | 同行三家都这么配；零代码 | 同一进程两个句柄不互卡（C-4）；跨进程行为不变 |
| 弱点 | 同步 API 下阻塞线程，同进程两实例必然一方超时 | 退避粒度粗（毫秒级 `setTimeout`），锁争用高时比 C 侧忙等多几毫秒延迟；总上限是本节点定的常量 |
| 置信度 | — | 高：失败形态可构造，修法只此一种（或换异步驱动，那就不是 `node:sqlite`） |

读句柄保留 `busy_timeout=5000`：WAL 下读者不被写者阻塞，只在恢复或 checkpoint 截断的瞬间可能 busy，阻塞极短且不涉及两实例互等。

**同步句柄跨 `await` 持锁。**`fn` 内两条语句之间的 `await` 期间，`BEGIN IMMEDIATE` 的写锁一直持有；另一个写者（同进程另一实例或另一进程）在 `BEGIN IMMEDIATE` 处等，5 s 内拿不到 ⇒ 它那边 `StorageUnavailable`。两个 tenancy 节点的写事务都是「锁—读—判—写—提交」一段直线，没有等待外部 I/O 的步骤，持锁时间以毫秒计（AI 节点的 S-13／S-15 已把凭据计算放在事务外，见[该节点 R-8](../../tenancy/account-identity/design.md#对存储提供者的要求清单)）；若将来某个消费者在写事务里等外部调用，这条会变成瓶颈——那是测量之后的事。

### 两种方言的锁语义映射

| 协议动作 | sqlite | pg | 差别对调用方是否可见 |
|---|---|---|---|
| `write` 开头 | `BEGIN IMMEDIATE`（立即取 RESERVED 锁；取不到由 Driver 异步重试） | `BEGIN`（不取任何行锁） | 否：调用方按协议先 `lockRow` 再读，两边都得到「读到的是最新且此后无人改」 |
| 写事务内每条语句 | 无包装（sqlite 语句级原子） | `SAVEPOINT` … `RELEASE`；失败 `ROLLBACK TO`（P-2） | 否：两边约束失败后事务都仍可用 |
| `lockRow` | 无语句 | `SELECT 1 … FOR UPDATE` | 否 |
| `lockSentinel` | 无语句 | `pg_advisory_xact_lock(hashtext(name))` | 否 |
| `read` 开头 | `BEGIN`（deferred） | `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` | 否 |
| 锁等待超时 | Driver 异步重试 5 s 后仍 `SQLITE_BUSY` ⇒ `StorageUnavailable` | pg 默认**无限等**（`lock_timeout = 0`），本版源码**没有设** `lock_timeout`；候选（未实现）：事务开头 `SET LOCAL lock_timeout = '5s'`，超时 ⇒ `55P03` ⇒ `StorageUnavailable`（映射已在） | 是：pg 上写锁等待没有上限，见[实施缺口](#实施缺口与消费者影响) |
| 死锁 | 不可能（单写者） | `40P01` ⇒ `StorageUnavailable` | 否：两个 tenancy 节点都把 `unavailable` 当抖动型失败重试 |
| `forUpdate()` 被调用方直接用 | **静默变成普通读**（研究正文明写） | 有效 | **可见**——所以协议只给 `lockRow`，不让调用方自己写 `forUpdate()`；一致性套件不查这一条，它是 `core/storage` 的 lint 义务候选 |

### 错误码映射表

四型的分界：**`StorageUnavailable` 只收瞬时失败**——连接、忙超时、I/O、撤除期间被关；调用方按抖动重试是对的。**`StorageDefect` 收一切「重试也不会变」的失败**——schema、语句、调用方式的错；消费者不映射、直接上抛。两型都带 `cause`。

| 来源 | 识别依据 | 映射为 | 备注 |
|---|---|---|---|
| sqlite 唯一 | 扩展结果码 `SQLITE_CONSTRAINT_UNIQUE`（2067）、`SQLITE_CONSTRAINT_PRIMARYKEY`（1555） | `UniqueViolation { constraint }` | 报文给的是 `UNIQUE constraint failed: <table>.<col>[, …]`（列元组）；协议 P-11 要求 `constraint` 是**迁移里的约束名**，本提供者用 `PRAGMA index_list(<table>)`／`index_info` 把列元组反查回索引名，主键按 `sqlite_autoindex_<table>_N` 反查（打开时建表，或出错时现查）。**反查不到**（迁移没给约束或主键命名）⇒ `StorageDefect`——迁移纪律没守住是缺陷，不是不可用 |
| pg 唯一 | SQLSTATE `23505` | 同上 | `constraint = err.constraint`，原生就是迁移里的名字（错误对象不带 `constraint` 时源码给 `'unknown'`，见[实施缺口](#实施缺口与消费者影响)） |
| sqlite 外键 | `SQLITE_CONSTRAINT_FOREIGNKEY`（787，`INSERT`／`UPDATE` 那一向）与 `SQLITE_CONSTRAINT_TRIGGER`（1811，`DELETE` 那一向由 sqlite 以此码报出），报文含 `FOREIGN KEY`、不含方向（2026-09-22 取证） | `ReferenceViolation { kind }`：按触发语句种类——`DELETE` ⇒ `delete-restricted`；`INSERT`／`UPDATE` ⇒ `missing-target`（协议 P-10 的分类） | `UPDATE` 改一个**被引用的主键**在这条分类下会被记成 `missing-target`（语义上是 `delete-restricted`）：本程两个节点没有改引用列或改被引用主键的写路径（`organization.ownerAccount` 只在插入时写，账号删除是 `DELETE`）——**假设**，尚未按两节点的操作表核 |
| pg 外键 | `23503` | 同上，同样按触发语句种类分类（与 sqlite 同一判据，不解析报文） | 备选判据（报文前缀 `update or delete on table` vs `insert or update on table`）能分出「改被引用主键」那一支，但两方言就不同判据了；本版不用 |
| 只读事务里发写语句（P-6／C-7b） | **读句柄**上的 `SQLITE_READONLY`（`query_only=ON`）；pg `25006` | `StorageDefect` | 调用方在 `read` 里写，是缺陷。`SQLITE_READONLY` 出现在**写句柄**上（数据目录只读挂载等）同样是 `StorageDefect`——重试也不会变，折成不可用会让清除链无限重扫 |
| sqlite 忙 | `SQLITE_BUSY`（5），Driver 异步重试 5 s 后仍在 | `StorageUnavailable` | 瞬时 |
| sqlite I/O、打不开、文件不可写、句柄已关闭 | `SQLITE_IOERR` 族、`SQLITE_CANTOPEN`、`ERR_INVALID_STATE`（撤除期间被关） | `StorageUnavailable` | 瞬时或撤除期间 |
| pg 连接／服务端不可用 | `08xxx`、`57P01`、`57P02`、`53xxx`、socket 错误 | `StorageUnavailable` | 瞬时 |
| pg 串行化／死锁／锁超时 | `40001`、`40P01`、`55P03` | `StorageUnavailable` | 瞬时；本程写事务不用 SERIALIZABLE，`40001` 只在 `REPEATABLE READ` 读事务遇到时出现 |
| **其他约束（`NOT NULL`、`CHECK`）、SQL 语法错误、未知表或列、绑定参数错误、嵌套调用 `write` 里再 `write`** | sqlite `SQLITE_CONSTRAINT_NOTNULL`／`_CHECK`、`SQLITE_ERROR`、`SQLITE_MISMATCH`、`SQLITE_RANGE`；pg `23502`、`23514`、`42xxx`、`22xxx`；本节点自己检测的嵌套调用 | `StorageDefect { cause: 原始错误 }` | 这些是缺陷，不是不可用：折成 `StorageUnavailable` 会让 OG 的清除链把一个 schema 缺陷当抖动无限重扫、主链每次 `interrupted` 且不记缺陷——两个 tenancy 节点正是以这条理由拒绝把配置错报成运行期抖动的（AI 依赖表「两把公钥」行），它们的方法体也写明「其余异常上抛（那是缺陷）」，`StorageDefect` 正是那一支 |
| **未识别的驱动错误** | 不在上面任何一行 | `StorageDefect { cause }` | 宁可响，不让未知失败被当抖动重试；识别出是瞬时的就把它加进 `StorageUnavailable` 那几行——表的增长是实现换方案，记 changelog |

### pg 下语句级失败不废事务（SAVEPOINT）

协议 [P-2](../../core/storage/design.md#协议) 要求写事务内 `UniqueViolation`／`ReferenceViolation` 从某条语句抛出后同一 `tx` 仍可继续——这是 OG S-20「撞 `ownerAccount` 唯一约束 ⇒ 提交内重读返回既有」与 OG R-6「提交内重读 ⇒ `accountDoesNotExist`」的前提（AI S-13 撞 `account_login_identifier_unique` 时是本事务不写、从快照重来，不在同一事务里继续——[该节点失败映射](../../tenancy/account-identity/design.md#状态并发与失败映射)；P-2 的选择不因它改变）。sqlite 原生如此（约束失败只废那一条语句）；**pg 在任何错误后整个事务进入 aborted 状态，此后每条语句都报 `25P02`**。本提供者在 pg 方言下的兑现：写事务内 Driver 把**每条语句**包成 `SAVEPOINT s_n` → 语句 → `RELEASE s_n`，语句失败则 `ROLLBACK TO s_n` 再按映射表抛出——包装落在 `DatabaseConnection.executeQuery` 一层（Kysely 内置 `PostgresDriver` 外的一个薄装饰器 `SavepointDriver`，只在写事务的 `BEGIN` 与 `COMMIT`／`ROLLBACK` 之间生效——事务外的语句如启动 ping、`Migrator` 的建表照原样执行）。读写两个 Kysely 实例共用一个 `pg.Pool`，撤除时 `pool.end()` 只调一次。代价：pg 每条语句多两次往返；协议节点给的收窄（只包 `INSERT`／`UPDATE`／`DELETE`）是可选优化，本版先全包——正确性先于往返数。sqlite 零成本。两方言下「约束失败后事务仍可用」由套件 C-3／C-13 断言。

### 属主实例：排他、迁移前只读核对、升级快照与确认

[tenancy-host「升级的整体性」](../../../apps/tenancy-host/design.md#升级的整体性迁移前只读核对快照与确认)要一次升级整体成或整体不成（[PF-017 §6.9](../../../../product/PF-017-governance-center-as-deployable-application/design.md#69-升级同一个中心要么整体成要么整体不成)，PF-017 rev 1 已接受（2026-09-23））：
编排归那个装配，**排他、快照、恢复与遗留检查归本节点**——「库是一个文件」「预写日志里还有已提交的内容」「pg 没有文件」只有存储提供者知道。
那一节把要求列成 R-U1～R-U8，下表逐条承接，两边互指；排他承接它的缺口 U-2。本节不写具体语句，只写机制、次序与对外形状。

**带迁移的实例由 config `upgrade` 显式二选一**（[方言配置形状](#方言配置形状)）：给守卫的实例是这份库的**属主**；给 `false` 的实例照旧打开库、跑迁移，不取排他、不看也不建快照——那一形态只给一致性套件与测试夹具，生产库上不得出现（[运维约定](#自构的交错)）。

```text
[插件体，守卫开启]
① 取排他，附着守卫（记下本实例的快照位置）             拿不到 ⇒「被占」；库没碰，守卫未附着
② 清临时名的半成品快照；磁盘上有遗留快照 ⇒ 恢复（R-U5） 失败 ⇒「恢复」，快照不删，失败里带它的位置
③ 库文件不存在 ⇒ 先落一个「库不存在」标记作快照（R-U3 首次支；守卫记下 snapshotTaken）
④ 打开句柄、PRAGMA、ping                              失败 ⇒ 关句柄 ⇒ 有快照则恢复 ⇒ 启动失败
⑤ 一次只读事务：读目录与迁移登记，跑 checks（R-U1、R-U2） 不过 ⇒ 关句柄 ⇒ 有快照则恢复 ⇒「核对」
⑥ 有待跑迁移、且还没有快照 ⇒ 建一致快照（R-U3；守卫记下 snapshotTaken） 失败 ⇒ 删半成品、关句柄 ⇒「快照」；一条迁移都没跑
⑦ 迁移（跑了至少一个 ⇒ 守卫记下 migrated）            失败 ⇒ 关句柄 ⇒ 恢复（R-U4）⇒「迁移」，点名那一个
⑧ provide('storage')
[撤除，一个 effect]  守卫置为已撤、关准入 → 等在途事务与在途确认 → 关句柄 → 磁盘上仍有快照 ⇒ 恢复（R-U4）→ 放排他
[确认，guard.confirm()]  删快照并落盘（R-U6），返回 { migrated, snapshotTaken, snapshotRemoved }；此后的撤除不再恢复
pg：①、④、⑤、⑦（一个事务）、⑧；没有快照，②③⑥与撤除时的恢复都不存在；确认如实答 snapshotTaken: false
```

| 要求（tenancy-host） | sqlite 上的兑现 | pg | 会红的测试（包内测试名，见 [verification](verification.md#证据义务)） |
|---|---|---|---|
| R-U1 迁移与任何写之前，一次只读事务里跑装配给的核对；不过即具名失败 | ⑤ 在读句柄（`query_only`）上开一次读事务；核对只拿到 `ReadTx`，在里面写即 `StorageDefect`。⑤ 之前对库的改动只有两种，都在 tenancy-host 的次序里：②恢复遗留快照（把库带回上一次未确认的升级之前），与首次启动时④建出一个空库文件（由③的标记兜底） | `REPEATABLE READ READ ONLY` 读事务 | `upgrade.preflight-refuses-before-write` |
| R-U2 迁移登记可读；空库读作空序列；读不到不当作空 | ⑤ 同一读事务里先读目录：登记表不存在 ⇒ 空序列——这是读到的事实，不是缺省；存在 ⇒ 按执行次序读全部名字（登记表 `kysely_migration`：按 `timestamp` 升序、同刻按 `name`，与 `Migrator` 自己读已执行迁移的次序相同；`src/upgrade/registry.ts`）；任一读失败 ⇒ `StorageUnavailable` 原样上抛 ⇒「核对」阶段启动失败，`cause` 是它 | 同 | `upgrade.registry-read`（登记表不在／在／读失败三支） |
| R-U3 有待跑迁移时建一致快照，含预写日志里已提交的内容；首次启动的快照是「库不存在」 | ⑥ 在一个只读（`query_only`）的源句柄上经 `node:sqlite` 的**在线备份** `backup()` 把当前已提交状态整库写成一份独立文件（读穿预写日志，2026-09-23 取证）：写到临时名（由 `file` 派生、固定不变，②据此找得到半成品）→ 权限改成同库文件 → 文件落盘 → 原子改名成快照名 → 目录落盘；**改名之后才算有快照**。③ 库文件不存在时落一个同位置的「库不存在」标记（内容是一行固定文字，与 sqlite 库文件头 `SQLite format 3\0` 区分得开），落盘之后才打开库。快照与库同目录（同一文件系统，改名才原子）；位置由 `file` 派生：快照 `<file>.upgrade-snapshot`、临时名 `<file>.upgrade-snapshot.tmp`（`src/sqlite/owner.ts`） | 无快照 | `upgrade.snapshot-consistent`（快照里有一次只在预写日志里的提交） |
| R-U4 确认之前的任何失败 ⇒ 关句柄之后恢复；附属文件不带入快照之后的写；恢复以替换完成；首次启动的恢复即删库 | 次序：删预写日志与共享内存两个附属文件并让删除落盘 → 以原子改名把快照换成库文件并让目录落盘。「库不存在」标记：删库与两个附属文件并落盘 → 最后删标记。**附属文件先删、且删除先落盘**：反过来，替换落了盘而删除没落盘，下一次打开会把升级之后的预写日志回放到升级之前的库上 | 无 | `upgrade.restore-on-migration-failure`、`upgrade.restore-on-dispose` |
| R-U5 快照在即「一次升级尚未确认」；打开库之前先恢复 | ② 取到排他之后、打开任何句柄之前：先删临时名上的半成品（连同它的附属文件）并让目录落盘，再看快照位置；有就按 R-U4 恢复。恢复的每一步都可重做：中途断电，快照或标记仍在，下一次再做一遍。**半成品删而不是忽略**：它从来不是快照（改名之后才算），删它不丢任何东西；此刻本实例握着排他，没有别人在写它；留着它则多占一整份库的盘（R-U3 只让磁盘多留一份），而且下一次⑥写同一个临时名时，整库导出语句（`VACUUM INTO`）拒绝非空的目标文件、在线备份把它当一个损坏的库打开而失败（`SQLITE_NOTADB`／`SQLITE_CORRUPT`；两条 2026-09-23 取证）——每次升级都卡在「快照」，直到有人手工删。删不掉 ⇒「恢复」阶段启动失败，失败里带它的位置 | 无 | `upgrade.leftover-restored`（在恢复的各步之间、以及⑥改名之前杀子进程） |
| R-U6 确认：包导出、不进存储协议；删快照；之后不再恢复 | `guard.confirm()`（[守卫对象](#确认为什么绑在守卫对象上)）：守卫未附着、或附着的实例已开始撤除 ⇒ 抛 `UpgradeGuardNotAttached`；否则删本实例拿的快照或标记，**目录落盘之后才返回** `{ migrated, snapshotTaken, snapshotRemoved }`——没落盘就返回，断电后快照复现，下一次启动会把确认之后的写全撤掉。删除失败 ⇒ 抛出，快照仍在；本实例没拿快照 ⇒ 什么都不删，`snapshotRemoved: false`。装配断言 **`snapshotTaken ⇒ snapshotRemoved`**。撤除时看的是磁盘，不是内存标志，所以确认之后的撤除自然不恢复。为什么不进协议见 [tenancy-host 的对比表](../../../apps/tenancy-host/design.md#升级的整体性迁移前只读核对快照与确认) | 不删任何东西，如实返回 `snapshotTaken: false`；跑过迁移时 `migrated ∧ ¬snapshotTaken` 就是缺口 U-3 那一支（迁移提交之后撤不回），确认不拒，由装配在启动日志里具名点出 | `upgrade.confirm`、`upgrade.guard-binding` |
| R-U7 pg 全部待跑迁移一个事务 | 不适用（sqlite 靠快照） | ⑦ 整批一个事务，由 `Migrator` 给（见投影表 R-U7 行） | `upgrade.pg-single-transaction`（缺 `OMNE_TEST_PG_URL` 时跳过） |
| R-U8 各阶段具名，不折成 `StorageUnavailable`；恢复失败时快照不删 | `StorageStartupFailure { stage, cause, snapshot? }`。插件体内的恢复失败 ⇒ 阶段「恢复」、带快照位置、快照不删。**撤除路径上的恢复失败内核不上抛**（basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)）⇒ disposer 自己记一条 error 记录（含快照位置），装配撤完之后调 `guard.pending()` 回头看磁盘，才说得出「恢复失败、快照在哪」 | 被占、核对、迁移三个阶段同形 | `upgrade.named-failures`、`upgrade.dispose-restore-failure-visible` |

#### 迁移前只读核对

核对函数的形状是 `core/storage` 的 `PreflightCheck`（[共用形状](../../core/storage/design.md#迁移片段与迁移前核对的共用形状)；给核对的一方不必 import 本包）：

```text
PreflightCheck = (input: PreflightInput { tx: ReadTx, tables: 已存在的表名集合, appliedMigrations: 已登记的迁移名，按执行次序 })
               => Promise<PreflightResult { ok: true } | { ok: false, check: string, detail: string }>
```

- `tables` 与 `appliedMigrations` 由本节点在同一读事务里先读好：核对者**不必自己判「表在不在」**，也就不会把一次读不到当成「还没有」。
- 本节点不解释 `detail`，原样放进启动失败；「差的是哪一样」由给核对的那一方说。判据各归其主：数据格式归 tenancy-host（登记序列是本次合成序列的前缀），时钟回拨归 [`infra/clock`](../clock/design.md#迁移前的只读回拨核对)，中心标识表还在归 [`tenancy/governance-center-entry`](../../tenancy/governance-center-entry/design.md#对存储提供者的要求清单) 的 `governanceCenterPreflight`（R-GC8）。
- **待跑迁移** = `migrations` 给出的名字里尚未登记的那些，决定⑥建不建快照。登记里有 `migrations` 没有的名字 ⇒ **本节点在⑤自带最低防线**（2026-09-23 架构评审 N-1）：`StorageStartupFailure{stage:'preflight'}`、check 名 `migration-registry-beyond-known`，不拍快照、不跑迁移；次序是否为前缀仍归 tenancy-host 那条核对。这条防线在装配给的 checks 全部通过之后、建快照之前判。2026-09-23 取证：`Migrator` 对「已登记但本次缺席」的名字在⑦报 `corrupted migrations`，但那已在快照之后、阶段会错报为「迁移」，所以不靠它。
- 共用类型在 `core/storage`；clock 与入口层从那里取类型，**不 import 本包**。

#### 排他为什么是随进程死亡释放的锁

| | pid 锁文件：独占创建、写进程号（落选） | **随进程死亡释放的锁（选）** | 不排他，写成运维约定（落选） |
|---|---|---|---|
| 最强论证 | Node 内置文件操作就做得到，不依赖 sqlite 或原生扩展 | 进程被杀或断电之后锁自然没了，重启不需要人清理；同进程里第二个属主同样拿不到 | 零机制；多实例本是 [PF-017 非目标](../../../../product/PF-017-governance-center-as-deployable-application/design.md#非目标) |
| 弱点 | 被杀的进程留下锁文件，重启被判「被占」直到有人删它——§6.9「旧版本照常能起」在最常见的那种崩溃之后不成立；进程号会被复用 | Node 没有内置的文件锁调用：sqlite 上由 `node:sqlite` 打开库旁的锁文件（`journal_mode = MEMORY`、`timeout: 0`）、持有一个 `BEGIN EXCLUSIVE` 直到放锁，借 sqlite 自己的文件锁（2026-09-23 取证：同进程两个句柄互斥，后者得 `SQLITE_BUSY`；持有者被 SIGKILL 后即可取得；持锁句柄须钉在模块里——没人引用的 `DatabaseSync` 被垃圾回收时会关闭并放锁；网络文件系统上不可靠——与 WAL 同一前提）。pg 的会话级咨询锁持在一条专用连接上：**连接断了锁就没了**，本实例察觉之前仍在服务；客户端机器断电时服务端会话滞留到 TCP 保活超时，其间重启被判「被占」 | tenancy-host 反证 (c)：两个进程同时升级，一个恢复快照时另一个握着被替换的文件；无声 |
| 置信度 | — | 中高：sqlite 那一半已取证，pg 那一半以 pg 上测试的登记结果为准 | — |

排他从**插件体第一步持有到撤除最后一步**，确认之后也不放。假如只持有到确认：确认一完成锁就放了，一个更新版本的进程就能在这个仍在服务的属主脚下建快照、迁移——即[交错 (a)](#自构的交错)「没有排他时」那一支。排他只在属主之间成立——给 `upgrade: false` 的实例不看锁（装配只装一个开了守卫的实例，tenancy-host `assembly.manifest-shape`；生产库上其余一律不得打开，[运维约定](#自构的交错)）。

#### 守卫为什么显式开启

| | 带 `migrations` 即属主，守卫恒开（落选） | 守卫可选开启，`upgrade` 缺席即不开（落选） | **带 `migrations` 时 `upgrade` 必须显式给出：守卫或 `false`，缺席即启动失败（选）** |
|---|---|---|---|
| 最强论证 | 部署忘不了开：只要跑迁移，就有快照与排他 | **忘了调确认**的后果不同：守卫恒开时，一个不知道「确认」的装配每次撤除都恢复快照——**那次启动以来的写全部消失，下次启动又有待跑迁移、又建快照，每次重演**，只有日志是信号；开了守卫的装配是在声明「我会确认」。现有测试夹具一个字不用改 | 缺席是响的：启动失败（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)：插件体抛出 ⇒ fiber `FAILED`、不 provide）。不开守卫要写出 `false`，是一次看得见的声明；给守卫的装配同样在声明「我会确认」，所以左列那个丢写循环不会落到不知道确认的装配头上 |
| 弱点 | 上面那个静默丢写的循环；现有测试夹具都要补确认 | **缺席静默**：部署忘了开时升级退回「只有幂等」，§6.9 不成立而无声，只能由装配自己的测试挡——这正是它落选的理由 | 带迁移的每个夹具都要多写 `upgrade: false`（一致性套件、已建包的插件测试、clock 的包内测试）；配置面多一条交叉约束；生产部署**写了** `false` 时 §6.9 照样不成立——它把「忘了」变成「写错」，挡不住写错，那一半归[运维约定](#自构的交错)与装配的 `assembly.manifest-shape`。置信度：**中高** |

#### 确认为什么绑在守卫对象上

守卫（类 `UpgradeGuard`）由本包导出的 `createUpgradeGuard()` 造：装配造它、经 config `upgrade.guard` 传入、自己留着；插件体在守卫路径上把本实例附着上去；装配此后只对它调 `confirm()` 与 `pending()`。守卫对象归装配，里面记的内容由附着的实例写。

| | 以 config 派生快照位置：`confirmUpgrade(config)`、`pendingUpgrade(config)`（落选） | 插件另 provide 一个服务，装配经 Context 取（落选） | **守卫对象随 config 传入，插件体附着（选）** |
|---|---|---|---|
| 最强论证 | config 是纯数据，装配手里有 config 就能调；两个函数无状态 | 不依赖「内核原样传 config」；服务天然绑在这条 fiber 上 | 确认与查询只认附着过的那一个实例：装配交错了对象 ⇒ `confirm()` 抛 `UpgradeGuardNotAttached`，是响的；撤除之后 `pending()` 仍问得到；「跑没跑迁移、拿没拿快照」这两件只有本实例知道的事随它交出 |
| 弱点 | 装配交错一份 config（别的文件、别的实例的 config）⇒ 派生出的位置上没有快照 ⇒「没有快照 ⇒ 成功」⇒ 开闸、答复提交 ⇒ 撤除时真实位置上的快照被恢复 ⇒ **答复过的写消失，全程无声**；装配也说不出这次跑没跑迁移 | `ctx.provide` 经 effect 纳管（kernel-basis probe `provide-is-effect-managed`），撤完服务就不在了——而 `pending()` 恰要在撤完之后问；插件体启动失败时服务从未出现（basis `plugin-throw-fails-fiber`）；`ctx.get` 看得见整棵树（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)），谁都够得着确认 | config 里多一个运行时对象（与入口层的 `openSignal` 同一模式），依赖「内核原样传 config」这条**假设**（[依赖表](#依赖作用域与绑定)）——不成立时插件体附着的是副本，装配手里那一个从未附着 ⇒ `confirm()` 抛 ⇒ 按确认失败收场：响、不丢写，但这次升级确认不了。守卫的状态在进程内，只排本实例与装配之间的先后，**不承担跨实例的排他**（那归锁）。置信度：**中高** |

守卫的语义（`src/upgrade/guard.ts`）：

- **附着**：插件体在①取得排他之后立刻附着，记下本实例的快照位置（由 `file` 派生；pg 记「无快照」）；③或⑥拿到标记或快照时记 `snapshotTaken`，⑦跑完至少一个迁移时记 `migrated`。每次附着各记各的。附着之前的失败（config 校验、「被占」）⇒ 守卫保持未附着——这次启动没取得属主、没碰这份库。附着时守卫还附着着另一个在役实例 ⇒ 配置错误、启动失败（一个守卫只配一个属主）。本插件重跑时新实例附着同一个守卫是常态：旧实例撤除一开始就把它置为已撤，新实例过了①才附着，而排他要到旧实例撤除的最后一步才放。附着（`attachGuard`）只给本包的属主路径用，不经公开入口导出，不是装配的面。
- **`confirm()`**：见 R-U6 那一行。只在附着着在役实例、且该实例已走完⑦（进入服务）时可调，否则抛 `UpgradeGuardNotAttached`——说明装配交错了对象、插件体没走到守卫、实例尚在启动，或该实例已开始撤除。`snapshotRemoved` 指本实例拿的那份已被删除且目录已落盘；同一次附着上再调，返回第一次的结果。
- **装配的断言 `snapshotTaken ⇒ snapshotRemoved`**：「拿了快照就必须删到」是守卫自己的不变量，与方言无关；不成立说明快照在确认之前已不在本实例的位置上（被外部删掉了），怎么收场归装配。**`migrated ∧ ¬snapshotTaken` 就是 pg 的不可撤回升级那一支**（缺口 U-3）：确认不拒、如实返回，装配据此在启动日志里具名点出 U-3。sqlite 上这一支不出现：⑦只在③或⑥之后跑。
- **`pending()`**：不抛异常，三种结果之一——`never-attached`（本守卫从未被附着；装配据启动失败的阶段分得出是「没走到①之后」还是交错了对象）、`clear`（附着过的位置上没有快照或标记）、`pending { location }`。它看的是磁盘，不是内存标志：撤除路径上的恢复失败内核不上抛，磁盘上还有快照就是「恢复失败、快照在那里」。磁盘看不清（「不存在」之外的 I/O 错误）时按 `pending` 答，不说 `clear`。临时名上的半成品不是快照，不算。
- **确认与撤除不在同一个快照上交错**：撤除①把守卫置为已撤，②连同在途的确认一起等它返回——内核不取消在途调用，确认跑完则④看不到快照、不恢复；撤除开始之后才来的确认抛 `UpgradeGuardNotAttached`。

#### 自构的交错

- (a) A 已确认、在服务；B（更新的版本）对同一份库启动 ⇒ B 在①拿不到 ⇒「被占」，A 不受影响。**没有排他时**：B 看不到遗留快照、见有待跑迁移 ⇒ 建快照、在 A 脚下迁移。
- (b) A 在⑦被杀 ⇒ 锁随进程释放；B 启动 ⇒ ①拿到 ⇒ ②见遗留快照 ⇒ 恢复 ⇒ 按升级之前的库重走。**没有排他时**：A 还活着、快照未确认，B 的②把它当遗留恢复，A 握着被替换掉的文件继续写。
- **运维约定：生产库不得被非守卫实例打开**（本包列出，owner 装配，交给 [tenancy-host](../../../apps/tenancy-host/README.md) 的运维说明）。给 `upgrade: false` 或不带迁移的实例不看锁、不看也不建快照：属主未确认时它写进库的一切随恢复消失；它若带迁移，就在属主脚下迁移——(a)(b) 里「没有排他时」那两支原样回来，而且无声。本节点挡不住：锁只在守卫实例之间成立，一个不取锁的打开者在机制之外。与 [clock「租约表不得手动删」](../clock/design.md#实施缺口与消费者影响)同形：只能写成约定。
- (c) 恢复中途断电 ⇒ 快照或标记仍在 ⇒ 下一次②再恢复一遍。前提是「附属文件的删除先于替换落盘」，R-U4 那一行。
- (d) 同进程里本插件重跑（`fiber.update` 或父 fiber 重启）：若旧 fiber 的 disposer 放排他之前新插件体已开始 ⇒ ①「被占」⇒ 新 fiber `FAILED`——**失败是响的，不是静默的**。重跑时旧 effect 的撤除是否先于新插件体**完成**，是待核对主张（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md) 只说「先卸载再重跑」，没说等卸载完成；须按 source-check 取证）。本插件没有 inject，不因别人换代重跑；tenancy-host 本版也不换代它。
- (e) 别的 fiber 启动失败 ⇒ 装配逆序撤到本插件 ⇒ 撤除路径恢复，恢复本身失败 ⇒ 内核只记日志、`fiber.dispose()` 照常 resolve。装配若只看 `dispose()` 的结果就会报「已恢复」——`guard.pending()` 就是为这一条：撤完还有快照，即「恢复失败，快照在那里」。
- (f) 装配交错了守卫：交给插件的是 G₁，确认调在 G₂ 上 ⇒ G₂ 从未附着 ⇒ `confirm()` 抛 `UpgradeGuardNotAttached` ⇒ 装配按确认失败收场：不开闸、逆序全撤、撤除时恢复 G₁ 那个实例的快照——**响的，开闸之前没有答复过的写可丢**。同一个守卫交给两个实例 ⇒ 后附着的那个启动失败。确认与本实例的撤除同时发生 ⇒ 撤除等确认跑完再看磁盘：确认先删了，就不恢复；撤除先置了已撤，确认抛出、快照留给④恢复——两条路都只有一个动作碰那个快照。

(a)(b) 的两进程交错由 `upgrade.exclusive-owner` 用两个子进程真跑；(c) 由 `upgrade.leftover-restored` 在恢复的各步之间杀子进程；(d) 待核之后决定要不要一条测试；(e) 由 `upgrade.dispose-restore-failure-visible`；(f) 由 `upgrade.guard-binding`。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 存储协议（无契约，[`core/storage`](../../core/storage/README.md) 的接口与失败类型） | 包依赖：类型与三种错误类的构造；一致性套件作 dev 依赖 | 随包版本 | 协议接口变 ⇒ 本节点跟着改；协议是本节点的**规格**，不是运行时依赖 |
| `definePlugin`（[`core/kernel-basis`](../../core/kernel-basis/README.md)，已建包） | 包依赖：插件定义与 config 校验的唯一入口，非法 config ⇒ 启动失败 | 随包版本 | — |
| Kysely 0.29.6、`pg` 8.23.0 | npm 依赖，版本钉在承载仓库 workspace catalog | 升级是「实现换方案」，记 changelog；`Driver` 接口变了要重核自写部分 | `pg` 静态 import（sqlite 部署也装它；按方言动态加载是候选，本版不做） |
| `node:sqlite` | Node ≥ 24 内置 | 随 Node 大版本 | Node 25 若改 `DatabaseSync` API，Driver 自写部分要重核——这是自写的维护成本，比社区包低（社区包同样要等人改） |
| 装配的迁移前核对 | 经 config `upgrade.checks` 注入（[形状](#迁移前只读核对)）；当前两条：数据格式版本（tenancy-host）、时钟未回拨（[`infra/clock`](../clock/design.md#迁移前的只读回拨核对) 导出，tenancy-host 放进列表） | 每次开了守卫的启动在⑤跑一次，只读 | 核对抛出（而不是返回 `ok: false`）⇒ 同样是「核对」阶段启动失败，`cause` 是那个异常 |
| [tenancy-host「升级的整体性」](../../../apps/tenancy-host/design.md#升级的整体性迁移前只读核对快照与确认)（互指） | 装配：`createUpgradeGuard()` 造守卫，经 `upgrade: { checks, guard }` 传入并给核对；全部 fiber `ACTIVE` 之后 `guard.confirm()` 并断言 `snapshotTaken ⇒ snapshotRemoved`，`migrated ∧ ¬snapshotTaken` 具名记为 U-3；撤完之后 `guard.pending()` 判恢复成没成 | 随那个节点 | 装配不调确认 ⇒ 快照一直在，下一次撤除恢复它（[守卫为什么显式开启](#守卫为什么显式开启)）；确认调错了守卫 ⇒ `UpgradeGuardNotAttached`（[守卫对象](#确认为什么绑在守卫对象上)） |
| 内核把 `ctx.plugin(plugin, config)` 的 config 对象原样交给插件体：不深拷贝、不冻结、不序列化，重跑时交的仍是同一个对象；`definePlugin` 的 Config 校验不重建 `guard` | 守卫靠它从装配手里到达插件体 | **已取证（2026-09-23，Cordis 4.0.4 `fiber.ts` `resolveConfig`）**：顶层 config 会被 Standard Schema 校验**重建**（zod object 返回新对象），但经 `z.custom`／`instanceof` 放行的值**同引用**、不冻结；重跑时从构造时保存的原始 config 重新校验，交到插件体的仍是同一个引用。前提改写为：**运行时对象在 Config 里必须用 `z.custom`／`instanceof` 描述，不能用 `z.object` 展开**；probe `tests/upgrade.plugin.spec.ts` 第一条；与入口层 `openSignal` 是同一条（[入口层节点「依赖的上游机制语义」](../../tenancy/governance-center-entry/design.md#依赖的上游机制语义)） | 不成立 ⇒ 附着的是副本，装配手里的守卫从未附着 ⇒ `confirm()` 抛 ⇒ 确认失败、恢复快照、启动失败：响，不丢写；`upgrade.guard-binding` 的「装配手里那一个被附着了」一支在此会红 |
| 装配的迁移文件 | 经 config `migrations` 注入 | 启动时跑一次，在 `provide` 之前 | **对迁移文件的要求**（归装配，这里登记）：sqlite 下 DDL 不在事务里，每个迁移自保证幂等（`IF NOT EXISTS`，或先查 introspector）——开了守卫时这是快照之外的**第二道**，不开时是唯一一道；**每个唯一约束与主键命名**（协议 P-11 的输入，否则 sqlite 下 `UniqueViolation.constraint` 映射不回名字）；外键写 `ON DELETE RESTRICT`、不用延迟约束（P-10）；两个 tenancy 节点的表与约束（含 AI R-7 ⇔ OG R-6 那条外键）、`infra/clock` 与入口层各自那一张表，都由各 owner 导出 `MigrationFragment[]`、装配经 `core/storage` 的 `composeMigrations` 合成一份 provider 传进来；本包不为任何节点预置表 |
| Cordis `inject` | **无**——本插件不依赖任何服务 | — | 消费者（AI、OG、clock、入口层）必需 inject `storage`：本插件换代或离开 `ACTIVE` ⇒ 它们重跑（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)，probe 已在 4.0.4 通过） |

## 状态、并发与失败映射

**本节点无领域状态。**运行时状态只有：一个打开的句柄（sqlite）或连接池（pg）、一个「接受新事务」开关、一组在途事务；开了升级守卫时另有一把排他锁（sqlite 的锁文件句柄或 pg 的专用连接），以及写在装配的守卫对象里的附着记录（快照位置、`snapshotTaken`、`migrated`、在役／已撤、在途的确认）。
**落在磁盘上的非领域状态**（开了守卫时）：快照或「库不存在」标记——它在即「一次升级尚未确认」，不在内存里另存一份；库旁的锁文件本身常在、无内容，锁才是状态。提交点由调用方的 `write(fn)` 决定，本节点只保证那一次 `COMMIT` 的原子。

**写权**：本节点不写任何业务行；它的写是 Kysely `Migrator` 的登记表（启动时）与库旁的快照、标记、锁文件（开了守卫时）。**恢复快照会撤掉确认之前所有写入者的提交**——包括别的插件在启动期间的写（如 clock 的租约、入口层铸的中心标识），这正是 R-U4 要的：那次启动写过的一切随之消失。

**并发**：sqlite 一个写句柄 + 进程内写队列、一个独立读句柄（读与写分属两个 Kysely 实例，读侧由 Kysely 的连接互斥串行；协议 P-12 要求的多路复用，非正确性机制）；跨实例、跨进程由 sqlite 文件锁裁决，`BEGIN IMMEDIATE` 的等待在 Driver 里异步重试，5 s 内拿不到即 `StorageUnavailable`。pg 由服务器裁决。**没有进程内锁承担任何 R**；属主排他是随进程死亡释放的文件锁或服务端会话锁，不是进程内锁（[排他](#排他为什么是随进程死亡释放的锁)）。

**失败映射**：全表在[错误码映射表](#错误码映射表)。补三条：
- `fn` 抛出一个**非存储**错误（调用方的领域失败或缺陷）⇒ `ROLLBACK`，**原样重抛**，不裹成 `StorageUnavailable`——否则调用方的 `Outcome` 分支被吞。
- `COMMIT` 本身失败（pg 延迟约束、磁盘满）⇒ 走映射表；调用方看到的是「提交未成立」，无痕。
- **结果未知**：pg 下 `COMMIT` 发出后连接断开，提交是否成立不可知——映射为 `StorageUnavailable`，调用方按「未成立」处理；两个 tenancy 节点的操作都以幂等键重入（AI S-13、组合的三步各自幂等），重试时会认回已成立的那次。sqlite 下 `COMMIT` 是同步调用，没有这个窗口。

**崩溃与恢复**：sqlite 重开时 WAL 自动恢复到最后一个完整提交；不开守卫时本节点不做任何恢复逻辑。开了守卫时，崩溃落在「有快照、未确认」之间 ⇒ 下一次启动②恢复遗留快照（R-U5），**那次没确认的升级连同其间的一切写都撤回**；恢复本身中途断电 ⇒ 快照仍在，再来一遍。`synchronous=NORMAL`（D-027）下断电可能丢最后一段已提交事务，但快照、标记与确认的删除都显式落盘，不受这一边界影响。**跨进程**：两个进程各起一个本插件指向同一文件时，R-1～R-7 仍由 sqlite 文件锁与约束给（WAL 要求同一主机、共享内存可用——研究正文）；协议层面的跨进程协调是[投影 Q-8](../../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)，不在本节点。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验（形状、方言、`:memory:` 拒绝、带迁移时 `upgrade` 必填、`guard` 须是本包造的） | `definePlugin` 的 `Config` 在插件体之前校验；失败即抛出，fiber 进 `FAILED`、不 provide（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)，probe 在 4.0.4 上通过） | 无部分状态 | — |
| 排他（守卫开启时；sqlite 锁文件上的锁／pg 专用连接上的会话锁） | 本 fiber；插件体**第一步**取得，此后才碰库 | 拿不到 ⇒ 抛出「被占」，没有别的资源要收 | 撤除的**最后一步**放掉（末行）；进程死亡时由操作系统或服务端释放 |
| 守卫附着（守卫开启时） | 守卫对象归装配；附着记录由本实例在①之后写，⑦之后装配的 `confirm()` 才有意义 | 附着之前失败 ⇒ 守卫保持未附着；附着之后失败 ⇒ 记录留着，`pending()` 照它的位置看磁盘 | 撤除一开始置为已撤（此后的 `confirm()` 抛 `UpgradeGuardNotAttached`）；**保留**：位置、`snapshotTaken`、`migrated`，供撤完之后 `pending()` 用；重跑的新实例重新附着 |
| 遗留处理（守卫开启时）：临时名上的半成品删除；磁盘上有快照 ⇒ 恢复 | 插件体第二步，打开任何句柄之前 | 删不掉或恢复失败 ⇒ 抛出「恢复」，**快照不删**，失败里带位置；放排他 | 恢复完成即快照消失；库回到上一次未确认升级之前 |
| 「库不存在」标记（守卫开启、库文件不存在时） | 插件体，打开句柄之前落盘 | 落不了盘 ⇒ 抛出「快照」、放排他 | 与快照同一收场：失败或未确认撤除 ⇒ 删库与附属文件、最后删标记；确认 ⇒ 删标记 |
| 打开写句柄与读句柄／pg 连接池（读写共用）+ PRAGMA + 两个句柄各一次启动 ping | 本 fiber 拥有；此时**尚不可消费** | 打不开 ⇒ 抛出（启动失败）；PRAGMA 失败 ⇒ 抛出并先关已开句柄；两种都在有标记时先恢复（删库）再抛 | 撤除见末行 |
| 迁移前只读核对（守卫开启时） | 插件体，一次只读事务 | 不过或读失败 ⇒ 关句柄 ⇒ 有标记则恢复 ⇒ 抛出「核对」，**数据未碰** | 无持久效果 |
| 升级快照（守卫开启、有待跑迁移、还没有快照时） | 本 fiber 建，**归本 fiber 拥有、落在磁盘上**，直到确认或恢复 | 建不成 ⇒ 删半成品、关句柄、放排他 ⇒ 抛出「快照」；一条迁移都没跑 | 确认 ⇒ 删除；确认之前撤除 ⇒ 恢复（末行④）；进程崩溃 ⇒ 留在磁盘上，下一次启动恢复 |
| 跑迁移（config 有 `migrations` 时） | 本 fiber 在 `provide` 之前跑；`Migrator` 的登记表与锁表在库里 | 任一迁移失败 ⇒ 关句柄 ⇒ **开了守卫：恢复快照**（半截 DDL 随之撤回，幂等是第二道）⇒ 抛出「迁移」并点名那一个；**没开守卫：只有迁移文件的幂等收口**，本节点不回滚 DDL。pg：整批一个事务，失败即无痕 | 迁移结果是库里的持久事实；**开了守卫时，确认之前的撤除会随快照撤回迁移**，确认之后撤除不撤迁移 |
| `ctx.provide('storage', impl)` | 本 fiber；`ACTIVE` 后消费者可解析 | provide 失败 ⇒ 抛出，句柄随下一行的 effect 撤（`ctx.provide` 经 effect 纳管：kernel-basis probe `provide-is-effect-managed.test.ts` 在 4.0.4 上通过） | 撤除：服务从 store 消失，消费者按 basis 重跑或 `PENDING` |
| **一个** `ctx.effect` 里的关闭次序：① 守卫置为已撤、关闭准入（新 `read`／`write` 立即抛 `StorageUnavailable`）→ ② 等在途事务各自 `COMMIT` 或 `ROLLBACK` 返回（写队列排空、读句柄全部空闲），并等在途的 `confirm()` 返回 → ③ 逐个关闭（sqlite 写句柄与读句柄各 `close()`；pg `pool.end()`）→ ④ 守卫开启且磁盘上仍有快照或标记 ⇒ 恢复（R-U4）→ ⑤ 放排他 | 本 fiber | — | **在途事务跑完，按各自那一次提交收场**——内核不取消在途调用（basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)：各 effect 并发驱动、异常只记日志），所以①～⑤必须在**同一个** effect 内按序写，不能靠两个 effect 的逆序。②没有超时：sqlite 语句是同步的，一个在途写事务最多在 `BEGIN IMMEDIATE` 的异步重试上等 5 s；pg 的 `pool.end()` 对已借出连接的处理**待核**（读写两个 Kysely 共用一个 pool，`end()` 只调一次）。④ 在③之后：恢复要替换库文件，不能有句柄开着——③没关干净（`destroy` 抛出）就不恢复，快照留在磁盘上给下一次启动的②；⑤ 在④之后：恢复完成之前别的进程不得打开这份库。④失败 ⇒ 记 error 记录（含快照位置）、**快照不删**、照样走⑤——内核不上抛这个异常，装配经 `guard.pending()` 看见它。**保留**：确认过（或没开守卫）时，库文件与其中全部已提交事实、`Migrator` 登记表；**未确认时保留的是快照那一份**——在途事务在②已提交的写随恢复消失，这是 R-U4 的本意，不是在途事务「没提交」 |
| `ctx.effect` 登记本身失败（启动期 `await openStorage` 期间 fiber 已被 dispose ⇒ `INACTIVE_EFFECT`） | 插件体 | 已打开的句柄没有归宿：插件体 `catch` 后自己 `close()` 再重抛（`src/plugin.ts`）；开了守卫时这次关闭同样把守卫置为已撤、走④⑤（有快照即恢复、放排他）——这时 fiber 还没 provide，别人什么都没写过 | — |

**重跑**（本插件被 `fiber.update` 或父 fiber 重启）：先走上面的撤除，再从 config 校验重来；旧句柄上的在途事务在②结束前已各自收场，新句柄看到的是它们的提交结果。开了守卫、尚未确认时，撤除恢复了快照，新插件体按升级之前的库重走一遍（重建快照、重跑迁移），并重新附着同一个守卫（config 是同一个对象）；新插件体若在旧 disposer 放排他之前开始，①判「被占」（[交错 (d)](#自构的交错)）。消费者因 `storage` 换代重跑，它们的在途调用握着旧 `impl`，在①之后的新调用得到 `StorageUnavailable`，已进入 `fn` 的跑完。

## 实施缺口与消费者影响

- **P-11 在 sqlite 下的反查**前提是装配迁移给每个唯一约束用 `CREATE UNIQUE INDEX` 显式命名、主键不命名（归一为 `<table>_pkey`）——写进[依赖表](#依赖作用域与绑定)；sqlite 的 `INTEGER PRIMARY KEY`（rowid 别名，不建索引）反查不到，撞主键 ⇒ `StorageDefect`（clock 的租约表是登记在案的例外）。
- **写句柄不用 sqlite busy handler**：对研究「三家一致」参数的有意偏离，理由是同步 API 下同进程两实例互卡（[Driver 边界](#自写-nodesqlite-driver-的边界)）；退避序列与 5 s 上限是本节点自定的常量，未经测量。owner：本节点。
- **库 API 事实**（2026-09-22／23 取证，写在各行；不是内核语义）：`node:sqlite` 错误对象是 `{ code: 'ERR_SQLITE_ERROR', errcode, errstr, message }`、句柄已关闭时 `code: 'ERR_INVALID_STATE'`；`DatabaseSync` 有 `enableForeignKeyConstraints` 与 `timeout` 两个构造选项；`PRAGMA index_list` 返回 `name`／`unique`／`origin`。仍待核：`pg.Pool.end()` 对借出连接的处理。
- **`UPDATE` 改被引用主键在 P-10 分类下会被记成 `missing-target`**：假设本程无此写路径，尚未按 AI／OG 操作表核。
- **pg 写锁等待没有上限**：本版没有设 `lock_timeout`，pg 上 `lockRow`／`lockSentinel` 与行锁的等待是无限的——[clock](../clock/design.md#状态并发与失败映射) 续约依赖的「写锁等待上限 5 s」在 pg 上没有兑现点。候选是写事务开头 `SET LOCAL lock_timeout = '5s'`（`55P03` 已映射为 `StorageUnavailable`）。owner：本节点。
- **pg 唯一冲突不带约束名**：错误对象缺 `constraint` 时源码给 `UniqueViolation('unknown')`，而协议 P-11 要「映射不到 ⇒ `StorageDefect`」；pg 对命名约束总带这个字段，这一支只在迁移没守命名纪律时出现。owner：本节点。
- **R-4 的断电边界**：`synchronous=NORMAL` 由 [D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md) 拍板（2026-09-23）；要断电级持久改 `FULL` 须新决定并加 config 项——本版 config 不暴露这一项，需要时加。owner：装配（[`apps/tenancy-host`](../../../apps/tenancy-host/README.md)）。
- **pg 各行**（读事务隔离级、错误码、`pool.end()`、SAVEPOINT）的依据是 pg 上的一致性套件与 `upgrade.postgres` 测试，只在 `OMNE_TEST_PG_URL` 指向一个可连的 pg（≥ 14）时运行，缺时 `describe.skip`——跳过不是通过，每次运行的结果与是否跳过登记在 verification。
- **`better-sqlite3` 退路**：若 `node:sqlite` 在 Node 24 上有本程绕不过的缺陷（同步 API 之外的），退到 `better-sqlite3` 12.x + Kysely 内置 `SqliteDialect`——只换 Driver，协议与一致性套件不动。D-026 明写这条退路归本节点登记。
- **`streamQuery` 不支持**：协议没有流式读面；将来有了再补。
- **运维约定「生产库不得被非守卫实例打开」**（[交错 (b) 旁](#自构的交错)）：本节点无法防御——锁只在守卫实例之间成立；只能写进装配的运维说明。owner：装配（[`apps/tenancy-host`](../../../apps/tenancy-host/README.md)）。
- **确认的删除已生效、目录落盘失败**：`confirm()` 抛出，但快照已不在命名空间里——撤除看不到它、不恢复，库保持新格式；闸在确认之前没开过，没有答复过的写可丢，代价是这次启动失败而旧版本起不来。与 tenancy-host R-U6「报错时快照须仍在」差这一支，性质与它的 U-4 同类（不可回退点之后的失败）。owner：本节点 + tenancy-host，是否另加一步（如先改名为墓碑名并落盘，再删）未定。
- **pg 上「迁移之后装配失败」撤不回**（tenancy-host 缺口 U-3、反证 (d)）：R-U7 只给迁移本身的原子；迁移事务提交之后入口层端口被占，库已是新格式、旧版本起不来——pg 下 §6.9 在迁移之后的失败上**不成立**。本节点不写一个看起来能撤的机制；pg 上的守卫如实交出这一支：`confirm()` 返回 `migrated ∧ ¬snapshotTaken`、不拒，装配据此在启动日志里具名点出 U-3。**闭合**：定手段（未定），候选二选一——① **升级前逻辑备份钩子**：有待跑迁移时，守卫在⑦之前调装配给的备份动作并等它落成，失败撤回改为「运维者按启动失败说明里给的备份位置恢复」（代价：撤回不再自动，§6.9「旧版本照常能起」要多一步人工）；② **兼容窗口**：迁移只做加法，上一个版本能在新格式上照常跑（代价：tenancy-host 的数据格式判据要从「登记是前缀」放宽成「在兼容窗口内」，迁移纪律多一条且无法机检）。owner：本节点 + tenancy-host。
- **pg 的排他**：会话锁持在一条专用连接上，连接断了锁就没了、本实例察觉之前仍在服务；客户端机器断电时服务端会话滞留到 TCP 保活超时，其间重启被判「被占」。源码不处理锁连接断开；「锁连接断了怎么办」未定（候选：锁连接断开即让本实例对新事务答 `StorageUnavailable` 直到重新拿到锁）。**待核**：`connectionString` 指向事务模式的连接池（pgbouncer 一类）时，客户端的「一条专用连接」不对应服务端的同一个会话，会话级咨询锁无意义——排他形同虚设；是否在启动时识别并拒绝未定。owner：本节点。
- **升级守卫依赖的库与运行时事实**（在线备份读穿预写日志、半成品目标上两条语句的反应、同进程两个句柄互斥、持锁句柄须防垃圾回收、`Migrator` 的登记表与排序、pg 上整批一个事务、对「登记里有而本次没有」报 `corrupted migrations`、表清单在只读事务里经 Kysely 读）已于 2026-09-23 取证，写在各自所在的行里；都不是内核语义。
- **重跑时旧 disposer 是否先于新插件体完成**是 Cordis 语义，basis 未覆盖——**待核对主张**，须按 source-check 取证；答案只影响交错 (d) 是「照常」还是「被占」，两种都不静默。
- **装配忘了调 `guard.confirm()`**：快照一直在，下一次撤除恢复它，那次启动以来的写全部消失——这是「给了守卫就是声明会确认」的代价面（[对比](#守卫为什么显式开启)）。调了却调在别的守卫上不属于这一条：那是 `UpgradeGuardNotAttached`，响的（[交错 (f)](#自构的交错)）。挡「忘了调」的是装配自己的 `assembly.upgrade-confirmed`；本节点在每次恢复时记一条 warn 记录，写明快照建立的时刻，让「一直没确认」在日志里看得见。owner：装配。
- **「数据未碰」在 sqlite 上指内容，不指字节**：关最后一个句柄时 sqlite 会把预写日志检查点进库文件，已提交内容不变、库文件的字节可能变；上一次是干净停机（预写日志为空）时才逐字节不变。tenancy-host 的 `assembly.upgrade-preflight-refuses` 断言「库文件逐字节不变」，前提要写上这一条，否则按内容（逐表）比对——那个断言归该节点，本节点只登记。
- **上游语义**：三条 basis 条目（`plugin-body-reruns-on-provider-change`、`effect-disposal-concurrent-not-ordered`、`plugin-throw-fails-fiber`）与 kernel-basis 一条不对应条目的 probe（`provide-is-effect-managed`）均已在 4.0.4 上通过；装卸表各行引用它们作证据来源。本节点的 bindings 仍为空表，因为无契约条款可绑。
- **消费者**：AI、OG、`infra/clock`、入口层必需 inject `storage`；本节点接口一变四者重跑，接口形状归协议节点，本节点只兑现。`apps/tenancy-host` 消费存储协议之外的四样：config `upgrade`（带迁移时必填）、`createUpgradeGuard` 与守卫的 `confirm()`／`pending()`、`UpgradeGuardNotAttached`、`StorageStartupFailure` 的 `stage`（与[该节点 R-U 表](../../../apps/tenancy-host/design.md#升级的整体性迁移前只读核对快照与确认)互指）；`infra/clock` 另给出一条放进 `upgrade.checks` 的只读核对。
