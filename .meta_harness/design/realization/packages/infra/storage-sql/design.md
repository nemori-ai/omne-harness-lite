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
| pg | Kysely 内置 `PostgresDialect` + `pg` 8.23.0 | D-026「pg 方言本程只接线不跑」；一致性套件对 pg 标 skip 并写前提 |
| in-memory | **不提供** | D-026 第一条；测试夹具就是本提供者的 sqlite 临时文件库 |

**Cordis 版本**：采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）。本节点依赖的内核语义引 [basis](../../../../basis/README.md) 条目（四条均已按 4.0.4 回填 probe，`checked: 2026-09-22`）；basis 没有条目的两条——`ctx.provide` 经 effect 纳管、插件体或 config 抛出 ⇒ fiber `FAILED` 且不 provide——由 `core/kernel-basis` 的 probe（承载仓库 `packages/core/kernel-basis/tests/basis/provide-is-effect-managed.test.ts`、`plugin-throw-fails-fiber.test.ts`）在 4.0.4 上通过，登记在 [kernel-basis verification](../../core/kernel-basis/verification.md#证据义务)。

**复杂度声明**：本节点引入的一切方言分支（锁语句、错误码、事务种类）都是**正确性机制**，各自指向一条 R；没有任何一处是为性能加的。连接队列、`busy_timeout` 都不是优化，是让 `DatabaseSync` 这个同步单句柄能承载异步调用方的最小代价。

## 能力到 Cordis 的投影

本节点不兑现契约条款；第一列是 **协议责任**（[`core/storage`](../../core/storage/README.md) 的接口与 AI／OG 的 R 条目），第二列是本插件上的落点。名字一律候选。

| 协议责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| 存储服务面 | 一个插件 `storageSql`（候选名），`ctx.provide('storage', impl)`；`impl` 实现协议的 `Storage` 接口 | 尚未实现；Kysely 0.29.6 | 服务对象是一个 `Kysely<DB>` 实例加事务包装器；**不导出第二套 DSL**——`tx.db` 就是 Kysely 的 `Transaction<DB>` |
| `read(fn)`：只读事务、快照一致（OG R-3d；AI S-37 两次读同一读事务；协议 P-6） | `impl.read` | sqlite：在**独立的读句柄**（打开时 `PRAGMA query_only = ON`）上 `BEGIN`（deferred）——WAL 下事务在第一条读语句处取快照，此后不看新提交；`fn` 内的写语句被 `SQLITE_READONLY` 拒 ⇒ `StorageDefect`（只读事务里写是调用方缺陷）；pg：`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`，写语句 `25006` ⇒ 同 | sqlite 那一半有 WAL 文档依据（**待核**：`node:sqlite` 下 deferred 事务的快照起点）；pg 那一半是文档推断，本程不跑。读句柄独立于写句柄是协议 P-12「`read()` 与 `write()` 真正并发」的要求。**Kysely 的事务 API 能否把「只读」传到 Driver**是实施项（[下文](#自写-nodesqlite-driver-的边界)） |
| `write(fn)`：单次提交原子（AI R-1／OG R-1；协议 P-1）、提交内读到全部已提交写（AI R-3／OG R-3c；P-3） | `impl.write` | sqlite：写句柄上 `BEGIN IMMEDIATE` → `fn` → `COMMIT`，任何抛出 ⇒ `ROLLBACK` 后按[错误码映射](#错误码映射表)重抛（调用方自己的异常**原样**上抛，P-1）；pg：`BEGIN`（默认 READ COMMITTED）→ 同上，**且写事务内每条语句包在 `SAVEPOINT` 里**（协议 P-2，[下文](#pg-下语句级失败不废事务savepoint)） | R-1 由方言各自的事务保证。R-3c 在 sqlite 由 `IMMEDIATE` 给：持有 RESERVED 锁期间无人能提交，本事务读到的就是最新已提交状态；在 pg 由 READ COMMITTED 的逐语句快照给 |
| `lockRow(table, key)`：行锁定读的锁那一半（AI R-3、OG R-3a） | `WriteTx.lockRow` | sqlite：**不发语句**——`BEGIN IMMEDIATE` 已是库级写锁，R-3／R-3a 平凡成立；pg：`SELECT 1 FROM <table> WHERE <key> FOR UPDATE` | 协议要求「先锁后读」；调用方随后的读由自己做。**pg 下对不存在的行 `FOR UPDATE` 锁不到任何东西**——两次并发插入同键的竞争由 R-2 的唯一约束裁决，不由本方法裁决，两个 tenancy 节点的设计已按此写（AI R-2「唯一性由主键约束兑现」） |
| `lockSentinel(name)`：部署级哨兵锁（OG R-3b） | `WriteTx.lockSentinel` | sqlite：不发语句（同上）；pg：`SELECT pg_advisory_xact_lock(hashtext(<name>))`——事务级咨询锁，提交或回滚即释放，**不需要哨兵表** | 落选方是「哨兵表 + `FOR UPDATE`」，它要本包自带一张表与迁移；咨询锁的弱点是 `hashtext` 碰撞会让两个不同名字互相串行——只多等待，不失正确性。**候选** |
| 四种失败类型（AI R-2／R-5／R-7，OG R-2／R-5／R-6） | 抛出协议定义的 `StorageUnavailable`、`UniqueViolation { constraint }`、`ReferenceViolation { kind }`、`StorageDefect` | 映射函数 `mapDriverError(dialect, error, statementKind, handleKind)`（候选） | 全表见[错误码映射表](#错误码映射表)。**`StorageUnavailable` 只收瞬时失败**（连接、忙超时、I/O、撤除期间被关）；`NOT NULL`／`CHECK`／语法／未知列／只读事务里写等是 **`StorageDefect`**，消费者不映射、直接上抛——理由记在映射表末行。`StorageUnavailable` → 各消费者「不可用」字面的折叠函数归 `core/storage`（错误类型的 owner），本节点不带 |
| 引用约束两个方向（AI R-7 ⇔ OG R-6，同一条外键的两侧） | 不在本节点定义——约束在装配的迁移文件里；本节点保证 sqlite 上 `foreign_keys=ON` **对每个句柄**生效，并把两个方向的失败映射成 `ReferenceViolation.kind` | `DatabaseSync` 打开时设 PRAGMA | **两个节点靠同一约束域成立，本提供者就是那个约束域**：同一个文件库／同一个 pg 数据库、同一份迁移。跨进程后这条仍成立（约束在库里），换成两个库才失效 |
| 唯一约束立即释放（AI R-6） | 无落点——sqlite 与 pg 的唯一索引在删除提交后立即允许同值插入 | — | 一致性套件一条测试 |
| 持久（AI R-4／OG R-4） | sqlite：WAL；pg：服务器 | — | **有边界**：`synchronous=NORMAL` 下进程崩溃不丢已提交事务，**操作系统崩溃或断电可能丢最后一段已提交事务**（研究正文同一节「代价与不适用」）。R-4 写的是「跨进程重启仍在」，本节点兑现到这一层；断电级要 `synchronous=FULL`，那是装配的政策，[实施缺口](#实施缺口与消费者影响)登记 |
| 不可用可识别（AI R-5／OG R-5） | 一切 I/O 类失败 ⇒ `StorageUnavailable`；句柄已关闭 ⇒ `StorageUnavailable`；**从不返回空结果或旧快照** | — | 「不返回旧快照」在 sqlite 由 WAL 读事务给，在 pg 由 REPEATABLE READ 给——都是「要么这个快照要么报错」 |
| 迁移运行器 | 导出 `runMigrations(db, provider)`（候选）包住 Kysely `Migrator`；插件 config 可选项 `migrations` 接收装配提供的 `MigrationProvider`，在 `provide('storage')` **之前**跑 | Kysely `Migrator` | **迁移文件归装配层**；本包不带任何业务表。sqlite `supportsTransactionalDdl = false`（研究正文），每个迁移必须自保证幂等——这是对装配迁移文件的要求，写进[依赖表](#依赖作用域与绑定)。`Migrator` 自带的迁移登记表与锁表的名字**待核** |

### 要求清单到方言机制

AI 与 OG 的要求清单合并去重后逐条落点。「证据」列是 [`core/storage` 一致性套件](../../core/storage/design.md#要求到协议再到会红的测试)的用例号 `C-n`（候选，套件归那个节点；本节点写的是**它在本提供者上为什么会绿**）。

| 要求 | sqlite | pg（接线不跑） | 证据 |
|---|---|---|---|
| R-1 单次提交原子（AI R-1／OG R-1；P-1） | 一个 `BEGIN IMMEDIATE … COMMIT`；`fn` 抛出或提交失败 ⇒ `ROLLBACK`，无痕；调用方异常原样上抛 | 同，`BEGIN … COMMIT` | C-1a／C-1b／C-1c |
| R-2 唯一约束可识别（AI R-2／OG R-2；P-11） | 约束由迁移建且**显式命名**（唯一约束与主键都要）；`SQLITE_CONSTRAINT_UNIQUE`／`SQLITE_CONSTRAINT_PRIMARYKEY` ⇒ `UniqueViolation`，`constraint` 由本提供者用 `PRAGMA index_list` 把列元组反查回约束名，主键按 `sqlite_autoindex_<table>_N` 反查；反查不到 ⇒ `StorageDefect`（迁移没命名是缺陷，不是不可用） | SQLSTATE `23505` ⇒ `UniqueViolation`，`constraint = err.constraint` | C-2：两方言同一断言 `constraint === 迁移里的名字` |
| R-2「同一提交内重读」（P-2） | 原生成立：约束失败只废那一条语句 | 写事务内每条语句包 `SAVEPOINT`，失败 `ROLLBACK TO` 后事务仍可用 | C-3、C-13 |
| R-3 行级写锁从读起（AI R-3）／R-3a 同组织成员写序列化（OG；P-4） | `BEGIN IMMEDIATE`：库级写锁；第二个写事务在 `BEGIN` 处由 Driver **异步重试**等待，总上限 5 s 后仍 `SQLITE_BUSY` ⇒ `StorageUnavailable` | `lockRow` 发 `FOR UPDATE`；第二个事务在锁处等，拿到后读到前者提交后的行 | C-4：两个实例、`await` 让出、两次都提交、终值 +2、**无一方 busy 失败**——后一条正是异步重试而非阻塞 busy handler 的理由（[Driver 边界](#自写-nodesqlite-driver-的边界)） |
| R-3b 部署级哨兵（OG；P-5） | 同上（库级锁覆盖） | `pg_advisory_xact_lock(hashtext(name))` | C-5 |
| R-3c 提交内读写同源（OG；AI R-3 后半；P-3） | `IMMEDIATE` 持锁期间无并发提交 ⇒ 读即最新 | READ COMMITTED 逐语句快照 + `FOR UPDATE` 返回最新版本 | C-6a／C-6b |
| R-3d 只读事务快照一致（OG；P-6） | 读句柄 deferred `BEGIN` 在 WAL 下的快照；`query_only=ON` 拒写 ⇒ `StorageDefect` | `REPEATABLE READ READ ONLY`；写语句 `25006` ⇒ `StorageDefect` | C-7／C-7b |
| R-4 持久（AI／OG；P-7） | WAL；`synchronous=NORMAL` 的边界见上 | 服务器 | C-8（关闭句柄后仍在；跨进程重启归 AI S-32 演练） |
| R-5 不可用可识别（AI／OG；P-8） | 关闭句柄后调用 ⇒ `StorageUnavailable`；重试超时 ⇒ 同；`SQLITE_IOERR`／`CANTOPEN`、写句柄上的 `SQLITE_READONLY` ⇒ 同。**非法语句不是不可用** ⇒ `StorageDefect` | 连接类错误（`08xxx`、`57P01`、`ECONNREFUSED`）⇒ `StorageUnavailable` | C-9a／C-9b；「`StorageDefect` 不被折成 `StorageUnavailable`」是套件新增的一条 C（编号归 `core/storage`） |
| R-6 删除即释放（AI R-6；P-9） | 立即 | 立即 | C-10 |
| R-7 被引用行删除受限 ⇔ OG R-6 两个方向（P-10） | `foreign_keys=ON`（每句柄）+ 迁移里的 `ON DELETE RESTRICT`；`SQLITE_CONSTRAINT_FOREIGNKEY` ⇒ `ReferenceViolation`，`kind` 按触发语句种类判 | `23503` ⇒ `ReferenceViolation`，`kind` 同样按语句种类判 | C-11／C-12 |
| 同进程并发 `write` 不互卡、不 busy 失败；`read` 与 `write` 真并发（P-12） | 写句柄一个 + 进程内写队列；读句柄独立（按需打开、上限 4——候选常量、超限排队等释放，各自 `query_only=ON`；`src/sqlite/driver.ts`）；跨实例靠异步重试 | 连接池 | C-4／C-7 的「无一方 busy 失败」分支 |

### 方言配置形状

config 是一个可辨识联合（候选；经 `core/kernel-basis` 的 `definePlugin({ name, inject?, Config, apply })` 走 Standard Schema——它是「配置错误 ⇒ 启动失败」的唯一实现点）：

```text
{ dialect: 'sqlite', file: string, migrations?: MigrationProvider }
{ dialect: 'postgres', connectionString: string, migrations?: MigrationProvider }
```

- `file` 是文件路径；**不接受 `:memory:`**（D-026 第一条；schema 层拒绝）。测试用临时文件，每个测试文件一个，不共享。
- `migrations` 是装配传入的 Kysely `MigrationProvider`（对象，不是路径——本包不猜迁移文件在哪）。缺席 ⇒ 不跑迁移，只打开库。这一项是为「迁移在 `provide('storage')` 之前跑」设的：消费者解析到 `storage` 时表已在。落选方是装配自己起一个迁移步骤，那需要第二个「schema 已就绪」的服务名让消费者去 inject，比一个可选 config 项多一条边。
- **配置错误政策：启动失败。**形状不对、`dialect` 不认识、`file` 为 `:memory:`、pg 连接串解析不了 ⇒ 插件体抛出，fiber 不进 `ACTIVE`，不 provide——与三个持钥节点「缺密钥即启动失败」同一政策。**打开失败同样启动失败**：sqlite 文件打不开、pg 启动 ping（`SELECT 1`）失败、迁移失败 ⇒ 抛出。理由与那边一样：一份连不上库的部署不该半开着跑、把配置错报成运行期抖动——OG 的清除链会对 `unavailable` 无限重扫。

### 自写 `node:sqlite` Driver 的边界

| 部件 | 来源 | 本节点写什么 |
|---|---|---|
| `SqliteAdapter`、`SqliteQueryCompiler`、`SqliteIntrospector` | kysely 导出，原样复用 | 不写。`supportsTransactionalDdl = false`、`supportsReturning = true` 是 adapter 自带的事实 |
| `Driver` | 自写 | `init`（打开**一个写句柄**与**按需的读句柄**，各设 PRAGMA：两者 WAL／NORMAL／`foreign_keys=ON`，读句柄另加 `query_only=ON` 与 `busy_timeout=5000`，写句柄 `busy_timeout=0`）、`acquireConnection`（写：单句柄，**进程内队列**排队；读：取一个空闲读句柄，没有就开新的，到上限排队）、`beginTransaction`（写句柄发 `BEGIN IMMEDIATE`，遇 `SQLITE_BUSY` **异步重试**——`setTimeout` 退避、总上限 5 s，超时 ⇒ `StorageUnavailable`；读句柄发 `BEGIN`）、`commitTransaction`、`rollbackTransaction`、`releaseConnection`、`destroy`（关闭准入 → 等在途 → 逐个 `close()`） |
| `DatabaseConnection` | 自写 | `executeQuery`：`prepare` + 按语句种类选 `run`／`all`，返回 `QueryResult`（`numAffectedRows`、`insertId`、`rows`）；`streamQuery`：本版不支持，抛出——协议没有流式读面 |
| 事务种类的传递 | **实施项** | 协议区分 `read`／`write`，Driver 的 `beginTransaction(connection, settings)` 要拿到这个区分。候选：Kysely 0.29.6 的 `TransactionBuilder.setAccessMode('read only' | 'read write')` 是否把 `accessMode` 放进 `TransactionSettings`——**待核**；核不到就由 `impl.write`／`impl.read` 在取连接时给连接对象打标记，`beginTransaction` 读标记 |
| `DatabaseSync` 构造选项 | **待核** | `enableForeignKeyConstraints`（Node 文档称默认 `true`）、`timeout`（busy timeout）两个选项是否在 Node 24 存在；存在则用选项，不存在则用 `PRAGMA foreign_keys = ON`、`PRAGMA busy_timeout = 5000`。**无论哪种，`foreign_keys` 是每句柄状态**，重开必须重设 |

**进程内写队列是协议 P-12 的要求，不是正确性机制。**一个 `DatabaseSync` 同一时刻只能有一个打开的事务，队列让同一实例的多个异步调用方共用一个写句柄；跨实例、跨进程的排序由 sqlite 自己的文件锁给。队列随插件实例生灭——这正是它不能承担 R-3 的原因，也是套件的并发用例（C-4／C-5／C-13）**用两个提供者实例**跑的原因：单实例下两个写事务在队列里就已经串行，测试红不了。

**为什么写句柄不用 sqlite 的 busy handler，而在 Driver 里异步重试。**`DatabaseSync` 是同步 API，sqlite 的 busy handler 在 C 调用里睡眠——**整个线程停住**。两个实例在同一个进程里：A 拿到 `IMMEDIATE` 锁后 `await`（让出事件循环），B 的 `BEGIN IMMEDIATE` 进入 busy handler 阻塞线程，A 永远等不到自己的下一轮，B 等满 `busy_timeout` 后 `SQLITE_BUSY`——C-4 的「无一方 busy 失败」正是为这条失败形态写的。把等待挪到 JS 侧（`SQLITE_BUSY` 立即返回、`setTimeout` 退避后重试、总上限 5 s）后，B 等待时 A 能跑完提交，B 再拿锁。这一条对跨进程也成立（另一进程持锁时本进程的重试同样让出）。

| | sqlite busy handler（落选） | **Driver 异步重试（选）** |
|---|---|---|
| 最强论证 | 同行三家都这么配；零代码 | 同一进程两个句柄不互卡（C-4）；跨进程行为不变 |
| 弱点 | 同步 API 下阻塞线程，同进程两实例必然一方超时 | 退避粒度粗（毫秒级 `setTimeout`），锁争用高时比 C 侧忙等多几毫秒延迟；总上限是本节点定的常量 |
| 置信度 | — | 高：失败形态可构造，修法只此一种（或换异步驱动，那就不是 `node:sqlite`） |

读句柄保留 `busy_timeout=5000`：WAL 下读者不被写者阻塞，只在恢复或 checkpoint 截断的瞬间可能 busy，阻塞极短且不涉及两实例互等。

**同步句柄跨 `await` 持锁。**`fn` 内两条语句之间的 `await` 期间，`BEGIN IMMEDIATE` 的写锁一直持有；另一个写者（同进程另一实例或另一进程）在 `BEGIN IMMEDIATE` 处等，5 s 内拿不到 ⇒ 它那边 `StorageUnavailable`。两个 tenancy 节点的写事务都是「锁—读—判—写—提交」一段直线，没有等待外部 I/O 的步骤，持锁时间以毫秒计；若将来某个消费者在写事务里等外部调用，这条会变成瓶颈——那是测量之后的事。

### 两种方言的锁语义映射

| 协议动作 | sqlite | pg | 差别对调用方是否可见 |
|---|---|---|---|
| `write` 开头 | `BEGIN IMMEDIATE`（立即取 RESERVED 锁；取不到由 Driver 异步重试） | `BEGIN`（不取任何行锁） | 否：调用方按协议先 `lockRow` 再读，两边都得到「读到的是最新且此后无人改」 |
| 写事务内每条语句 | 无包装（sqlite 语句级原子） | `SAVEPOINT` … `RELEASE`；失败 `ROLLBACK TO`（P-2） | 否：两边约束失败后事务都仍可用 |
| `lockRow` | 无语句 | `SELECT 1 … FOR UPDATE` | 否 |
| `lockSentinel` | 无语句 | `pg_advisory_xact_lock(hashtext(name))` | 否 |
| `read` 开头 | `BEGIN`（deferred） | `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` | 否 |
| 锁等待超时 | Driver 异步重试 5 s 后仍 `SQLITE_BUSY` ⇒ `StorageUnavailable` | pg 默认**无限等**（`lock_timeout = 0`）；候选：事务开头 `SET LOCAL lock_timeout = '5s'`，超时 ⇒ `55P03` ⇒ `StorageUnavailable` | 否，但 pg 那一行是本程未验证的推断 |
| 死锁 | 不可能（单写者） | `40P01` ⇒ `StorageUnavailable` | 否：两个 tenancy 节点都把 `unavailable` 当抖动型失败重试 |
| `forUpdate()` 被调用方直接用 | **静默变成普通读**（研究正文明写） | 有效 | **可见**——所以协议只给 `lockRow`，不让调用方自己写 `forUpdate()`；一致性套件不查这一条，它是 `core/storage` 的 lint 义务候选 |

### 错误码映射表

四型的分界：**`StorageUnavailable` 只收瞬时失败**——连接、忙超时、I/O、撤除期间被关；调用方按抖动重试是对的。**`StorageDefect` 收一切「重试也不会变」的失败**——schema、语句、调用方式的错；消费者不映射、直接上抛。两型都带 `cause`。

| 来源 | 识别依据 | 映射为 | 备注 |
|---|---|---|---|
| sqlite 唯一 | 扩展结果码 `SQLITE_CONSTRAINT_UNIQUE`（2067）、`SQLITE_CONSTRAINT_PRIMARYKEY`（1555） | `UniqueViolation { constraint }` | 报文给的是 `UNIQUE constraint failed: <table>.<col>[, …]`（列元组）；协议 P-11 要求 `constraint` 是**迁移里的约束名**，本提供者用 `PRAGMA index_list(<table>)`／`index_info` 把列元组反查回索引名，主键按 `sqlite_autoindex_<table>_N` 反查（打开时建表，或出错时现查）。**反查不到**（迁移没给约束或主键命名）⇒ `StorageDefect`——迁移纪律没守住是缺陷，不是不可用 |
| pg 唯一 | SQLSTATE `23505` | 同上 | `constraint = err.constraint`，原生就是迁移里的名字 |
| sqlite 外键 | `SQLITE_CONSTRAINT_FOREIGNKEY`（787）；报文不含方向 | `ReferenceViolation { kind }`：按触发语句种类——`DELETE` ⇒ `delete-restricted`；`INSERT`／`UPDATE` ⇒ `missing-target`（协议 P-10 的分类） | `UPDATE` 改一个**被引用的主键**在这条分类下会被记成 `missing-target`（语义上是 `delete-restricted`）：本程两个节点没有改引用列或改被引用主键的写路径（`organization.ownerAccount` 只在插入时写，账号删除是 `DELETE`）——**假设**，落包时按两节点的操作表核 |
| pg 外键 | `23503` | 同上，同样按触发语句种类分类（与 sqlite 同一判据，不解析报文） | 备选判据（报文前缀 `update or delete on table` vs `insert or update on table`）能分出「改被引用主键」那一支，但两方言就不同判据了；本版不用 |
| 只读事务里发写语句（P-6／C-7b） | **读句柄**上的 `SQLITE_READONLY`（`query_only=ON`）；pg `25006` | `StorageDefect` | 调用方在 `read` 里写，是缺陷。`SQLITE_READONLY` 出现在**写句柄**上（数据目录只读挂载等）同样是 `StorageDefect`——重试也不会变，折成不可用会让清除链无限重扫 |
| sqlite 忙 | `SQLITE_BUSY`（5），Driver 异步重试 5 s 后仍在 | `StorageUnavailable` | 瞬时 |
| sqlite I/O、打不开、文件不可写、句柄已关闭 | `SQLITE_IOERR` 族、`SQLITE_CANTOPEN`、`ERR_INVALID_STATE`（撤除期间被关） | `StorageUnavailable` | 瞬时或撤除期间 |
| pg 连接／服务端不可用 | `08xxx`、`57P01`、`57P02`、`53xxx`、socket 错误 | `StorageUnavailable` | 瞬时 |
| pg 串行化／死锁／锁超时 | `40001`、`40P01`、`55P03` | `StorageUnavailable` | 瞬时；本程写事务不用 SERIALIZABLE，`40001` 只在 `REPEATABLE READ` 读事务遇到时出现 |
| **其他约束（`NOT NULL`、`CHECK`）、SQL 语法错误、未知表或列、绑定参数错误、嵌套调用 `write` 里再 `write`** | sqlite `SQLITE_CONSTRAINT_NOTNULL`／`_CHECK`、`SQLITE_ERROR`、`SQLITE_MISMATCH`、`SQLITE_RANGE`；pg `23502`、`23514`、`42xxx`、`22xxx`；本节点自己检测的嵌套调用 | `StorageDefect { cause: 原始错误 }` | 这些是缺陷，不是不可用：折成 `StorageUnavailable` 会让 OG 的清除链把一个 schema 缺陷当抖动无限重扫、主链每次 `interrupted` 且不记缺陷——两个 tenancy 节点正是以这条理由拒绝把配置错报成运行期抖动的（AI 依赖表「两把公钥」行），它们的方法体也写明「其余异常上抛（那是缺陷）」，`StorageDefect` 正是那一支 |
| **未识别的驱动错误** | 不在上面任何一行 | `StorageDefect { cause }` | 宁可响，不让未知失败被当抖动重试；识别出是瞬时的就把它加进 `StorageUnavailable` 那几行——表的增长是实现换方案，记 changelog |

### pg 下语句级失败不废事务（SAVEPOINT）

协议 [P-2](../../core/storage/design.md#协议候选形状) 要求写事务内 `UniqueViolation`／`ReferenceViolation` 从某条语句抛出后同一 `tx` 仍可继续——这是 AI R-2「在同一提交内重读」与 OG R-6「提交内重读 ⇒ `accountDoesNotExist`」的前提。sqlite 原生如此（约束失败只废那一条语句）；**pg 在任何错误后整个事务进入 aborted 状态，此后每条语句都报 `25P02`**。本提供者在 pg 方言下的兑现：写事务内 Driver 把**每条语句**包成 `SAVEPOINT s_n` → 语句 → `RELEASE s_n`，语句失败则 `ROLLBACK TO s_n` 再按映射表抛出——包装落在 `DatabaseConnection.executeQuery` 一层（Kysely 内置 `PostgresDriver` 外的一个薄装饰器，只在写事务内生效）。代价：pg 每条语句多两次往返；协议节点给的收窄（只包 `INSERT`／`UPDATE`／`DELETE`）是可选优化，本版先全包——正确性先于往返数。sqlite 零成本。两方言下「约束失败后事务仍可用」由套件 C-3／C-13 断言。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 存储协议（无契约，[`core/storage`](../../core/storage/README.md) 的接口与失败类型） | 包依赖：类型与三种错误类的构造；一致性套件作 dev 依赖 | 随包版本 | 协议接口变 ⇒ 本节点跟着改；协议是本节点的**规格**，不是运行时依赖 |
| `definePlugin`（[`core/kernel-basis`](../../core/kernel-basis/README.md)，已建包） | 包依赖：插件定义与 config 校验的唯一入口，非法 config ⇒ 启动失败 | 随包版本 | — |
| Kysely 0.29.6、`pg` 8.23.0 | npm 依赖，版本钉在承载仓库 workspace catalog | 升级是「实现换方案」，记 changelog；`Driver` 接口变了要重核自写部分 | `pg` 静态 import（sqlite 部署也装它；按方言动态加载是候选，本版不做） |
| `node:sqlite` | Node ≥ 24 内置 | 随 Node 大版本 | Node 25 若改 `DatabaseSync` API，Driver 自写部分要重核——这是自写的维护成本，比社区包低（社区包同样要等人改） |
| 装配的迁移文件 | 经 config `migrations` 注入 | 启动时跑一次，在 `provide` 之前 | **对迁移文件的要求**（归装配，这里登记）：sqlite 下 DDL 不在事务里，每个迁移自保证幂等（`IF NOT EXISTS`，或先查 introspector）；**每个唯一约束与主键命名**（协议 P-11 的输入，否则 sqlite 下 `UniqueViolation.constraint` 映射不回名字）；外键写 `ON DELETE RESTRICT`、不用延迟约束（P-10）；两个 tenancy 节点的表与约束（含 AI R-7 ⇔ OG R-6 那条外键）和 `infra/clock` 自带的那一张表都由装配把迁移合成一份 provider 传进来；本包不为任何节点预置表 |
| Cordis `inject` | **无**——本插件不依赖任何服务 | — | 消费者（AI、OG、clock）必需 inject `storage`：本插件换代或离开 `ACTIVE` ⇒ 它们重跑（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)，probe 已在 4.0.4 通过） |

## 状态、并发与失败映射

**本节点无领域状态。**运行时状态只有：一个打开的句柄（sqlite）或连接池（pg）、一个「接受新事务」开关、一组在途事务。提交点由调用方的 `write(fn)` 决定，本节点只保证那一次 `COMMIT` 的原子。

**写权**：本节点不写任何业务行；它唯一的写是 Kysely `Migrator` 的登记表（启动时）。

**并发**：sqlite 一个写句柄 + 进程内写队列、若干独立读句柄（协议 P-12 要求的多路复用，非正确性机制）；跨实例、跨进程由 sqlite 文件锁裁决，`BEGIN IMMEDIATE` 的等待在 Driver 里异步重试，5 s 内拿不到即 `StorageUnavailable`。pg 由服务器裁决。**没有进程内锁承担任何 R**。

**失败映射**：全表在[错误码映射表](#错误码映射表)。补三条：
- `fn` 抛出一个**非存储**错误（调用方的领域失败或缺陷）⇒ `ROLLBACK`，**原样重抛**，不裹成 `StorageUnavailable`——否则调用方的 `Outcome` 分支被吞。
- `COMMIT` 本身失败（pg 延迟约束、磁盘满）⇒ 走映射表；调用方看到的是「提交未成立」，无痕。
- **结果未知**：pg 下 `COMMIT` 发出后连接断开，提交是否成立不可知——映射为 `StorageUnavailable`，调用方按「未成立」处理；两个 tenancy 节点的操作都以幂等键重入（AI S-13、组合的三步各自幂等），重试时会认回已成立的那次。sqlite 下 `COMMIT` 是同步调用，没有这个窗口。

**崩溃与恢复**：sqlite 重开时 WAL 自动恢复到最后一个完整提交；本节点不做任何恢复逻辑。**跨进程**：两个进程各起一个本插件指向同一文件时，R-1～R-7 仍由 sqlite 文件锁与约束给（WAL 要求同一主机、共享内存可用——研究正文）；协议层面的跨进程协调是[投影 Q-8](../../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)，不在本节点。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验（形状、方言、`:memory:` 拒绝） | `definePlugin` 的 `Config` 在插件体之前校验；失败即抛出，fiber 进 `FAILED`、不 provide（kernel-basis probe `plugin-throw-fails-fiber.test.ts` 在 4.0.4 上通过） | 无部分状态 | — |
| 打开写句柄（读句柄按需）／pg 连接池 + PRAGMA + 启动 ping | 本 fiber 拥有；此时**尚不可消费** | 打不开 ⇒ 抛出（启动失败）；PRAGMA 失败 ⇒ 抛出并先关已开句柄 | 撤除见末行 |
| 跑迁移（config 有 `migrations` 时） | 本 fiber 在 `provide` 之前跑；`Migrator` 的登记表与锁表在库里 | 任一迁移失败 ⇒ 抛出、关句柄、启动失败。sqlite 下失败的那个迁移**可能留下半截 DDL**（非事务 DDL）——由迁移文件的幂等保证收口，本节点不回滚 DDL | 迁移结果是库里的持久事实，**撤除不撤迁移** |
| `ctx.provide('storage', impl)` | 本 fiber；`ACTIVE` 后消费者可解析 | provide 失败 ⇒ 抛出，句柄随下一行的 effect 撤（`ctx.provide` 经 effect 纳管：kernel-basis probe `provide-is-effect-managed.test.ts` 在 4.0.4 上通过） | 撤除：服务从 store 消失，消费者按 basis 重跑或 `PENDING` |
| **一个** `ctx.effect` 里的关闭次序：① 关闭准入（新 `read`／`write` 立即抛 `StorageUnavailable`）→ ② 等在途事务各自 `COMMIT` 或 `ROLLBACK` 返回（写队列排空、读句柄全部空闲）→ ③ 逐个关闭（sqlite 写句柄与读句柄各 `close()`；pg `pool.end()`） | 本 fiber | — | **在途事务跑完，按各自那一次提交收场**——内核不取消在途调用（basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)：各 effect 并发驱动、异常只记日志），所以①②③必须在**同一个** effect 内按序写，不能靠两个 effect 的逆序。②没有超时：sqlite 语句是同步的，一个在途写事务最多在 `BEGIN IMMEDIATE` 的异步重试上等 5 s；pg 的 `pool.end()` 对已借出连接的处理**待核**。**保留**：库文件与其中全部已提交事实；`Migrator` 登记表 |
| `ctx.effect` 登记本身失败（启动期 `await openStorage` 期间 fiber 已被 dispose ⇒ `INACTIVE_EFFECT`） | 插件体 | 已打开的句柄没有归宿：插件体 `catch` 后自己 `close()` 再重抛（`src/plugin.ts`） | — |

**重跑**（本插件被 `fiber.update` 或父 fiber 重启）：先走上面的撤除，再从 config 校验重来；旧句柄上的在途事务在②结束前已各自收场，新句柄看到的是它们的提交结果。消费者因 `storage` 换代重跑，它们的在途调用握着旧 `impl`，在①之后的新调用得到 `StorageUnavailable`，已进入 `fn` 的跑完。

## 实施缺口与消费者影响

- **P-11 在 sqlite 下的反查**（`PRAGMA index_list` + `sqlite_autoindex_<table>_N`）是实施项；实现前 C-2 主键那一支无结果，AI 分辨「登录标识撞了」与「主键撞了」的那一支随之。owner：本节点。前提是装配迁移给每个唯一约束与主键显式命名——写进[依赖表](#依赖作用域与绑定)。
- **`StorageDefect` 那一条套件用例的编号**归 `core/storage`；本节点的 `error-mapping.defect` 测试先按类型断言。
- **写句柄不用 sqlite busy handler**：对研究「三家一致」参数的有意偏离，理由是同步 API 下同进程两实例互卡（[Driver 边界](#自写-nodesqlite-driver-的边界)）；退避粒度与 5 s 上限是候选常量。owner：本节点。
- **待核项**（落包时按 source-check 取证，记进 verification；都是库 API 事实，不是内核语义）：Kysely 0.29.6 事务 API 能否传「只读」到 Driver；`DatabaseSync` 的 `enableForeignKeyConstraints`／`timeout` 选项；`node:sqlite` 错误对象的 `errcode`／`errstr` 字段名与 `SQLITE_BUSY` 的可捕获形态；`pg.Pool.end()` 对借出连接的处理；`Migrator` 登记表名；`PRAGMA index_list` 在 `DatabaseSync` 下的返回形状。
- **`UPDATE` 改被引用主键在 P-10 分类下会被记成 `missing-target`**：假设本程无此写路径，落包时按 AI／OG 操作表核。
- **R-4 的断电边界**：`synchronous=NORMAL` 由 [D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md) 拍板（2026-09-23）；要断电级持久改 `FULL` 须新决定并加 config 项——本版 config 不暴露这一项，需要时加。owner：装配（`apps/tenancy-host` 候选名，尚未建立）。
- **pg 全部行**（读事务隔离级、`lock_timeout`、错误码、`pool.end()`）本程只接线，一致性套件对 pg `describe.skip` 并写前提「有一个可连的 pg ≥ 14」；第一次跑 pg 时本表所有「推断」都要重核。owner：装配，第二程。
- **`better-sqlite3` 退路**：若 `node:sqlite` 在 Node 24 上有本程绕不过的缺陷（同步 API 之外的），退到 `better-sqlite3` 12.x + Kysely 内置 `SqliteDialect`——只换 Driver，协议与一致性套件不动。D-026 明写这条退路归本节点登记。
- **`streamQuery` 不支持**：协议没有流式读面；将来有了再补。
- **上游语义**：两条 basis 条目（`plugin-body-reruns-on-provider-change`、`effect-disposal-concurrent-not-ordered`）与 kernel-basis 的两条 probe（`provide-is-effect-managed`、`plugin-throw-fails-fiber`）均已在 4.0.4 上通过（2026-09-22）；装卸表各行引用它们作证据来源。本节点的 bindings 仍为空表，因为无契约条款可绑。
- **消费者**：AI、OG、`infra/clock` 必需 inject `storage`；本节点接口一变三者重跑，接口形状归协议节点，本节点只兑现。
