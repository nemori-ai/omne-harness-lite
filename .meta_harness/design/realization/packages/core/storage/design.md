# storage 实现设计

## 实现路径与来源

**自建一个薄的 TypeScript 模块：协议 + 一致性套件，不依赖 Cordis。**两个 tenancy 节点各自写下了对存储提供者的要求清单
（[AI R-1～R-7](../../tenancy/account-identity/design.md#对存储提供者的要求清单)、[OG R-1～R-6](../../tenancy/organization-governance/design.md#对存储提供者的要求清单)），
它们要的不是一个数据库，而是**一组语义**：单次提交原子、唯一冲突可识别、锁定读、提交内读写同源、只读快照、持久、不可用可识别、引用约束两向可识别。
没有现成库以「协议 + 任何实现都必须过的套件」的形式表达这组语义；能复用的是查询构建器与方言驱动，两者都归提供者节点。

**不是插件，也不是服务。**协议没有资源、没有生命周期；`storage` 这个服务名的**实例**由 [`infra/storage-sql`](../../infra/storage-sql/README.md) 的插件 provide，
连接、库句柄、迁移运行器都归它。把协议做成插件只会造出一个「协议的提供者」，而协议没有换代这回事——它变了就是新版本的协议，消费者要改代码，不是换实例。

**来源**：

- [D-026](../../../../record/decisions/infrastructure-persistence-choices/decision.md)：不提供 in-memory 实现；SQL 经通用查询层、只改配置切方言；查询层取 **Kysely**、sqlite 驱动取 `node:sqlite`；SQL 存储提供者进第一程。
  本节点据此做两件事：**查询能力经 Kysely 的构建器由事务对象暴露，协议不自造第二套 DSL**；**测试夹具就是真实提供者的 sqlite 临时文件库**，套件不带任何内存实现。
- 研究正文[「Drizzle 在类型层按方言分裂，Kysely 在构造时传方言」](../../../../../research/agent-harness-persistence-and-identity-infra/research.md#drizzle-在类型层按方言分裂kysely-在构造时传方言)：
  Kysely 的 `forUpdate()` 在 sqlite 下**不会被剥掉、静默变成普通读**，`supportsTransactionalDdl = false`。**这是协议把锁做成显式方法而不是让调用方自己写 `forUpdate()` 的直接理由**——锁语义必须由协议按方言解释，否则 R-3 在 sqlite 上会无声失守。
- 研究正文[「sqlite 运行参数在三家 TS/Rust 实现里一致」](../../../../../research/agent-harness-persistence-and-identity-infra/research.md#sqlite-运行参数在三家-tsrust-实现里一致)：`foreign_keys=ON` 是显式设置的（sqlite 默认关）——R-6／R-7 在 sqlite 上成立的前提，套件必须有一条在它关着时会红的测试。
- 两个 tenancy 节点的[跨 owner「同一提交」解释](../../tenancy/organization-governance/design.md#跨-owner-的同一提交账号行上的过期事实加组织行对账号行的引用约束)：
  账号行上的过期事实（行锁下落盘）+ 组织行对账号行的引用约束。本节点不重复那段推理，只保证它依赖的三个原语——锁定读、引用约束两向可识别、唯一冲突后事务仍可用——在两种方言下都由协议给出并被套件证明。

**Cordis 版本**：本节点不依赖 Cordis。提供者插件与消费者插件按 [D-025](../../../../record/decisions/cordis-adoption-version/decision.md) 采用 `@deepseek-ai/cordis` 4.0.4。
**依赖版本**：Kysely 0.29.6（workspace catalog；D-026 与研究核对的也是它），本节点只依赖它的**类型**；vitest 4.1.11 是 `./conformance` 的运行时依赖（套件是 `describe` 块）；`node:sqlite`、`pg` 归提供者节点。

## 协议

包 `@omne-harness-lite/storage`，源码 `packages/core/storage/src/`：`protocol.ts`、`errors.ts`、`map.ts`、`migration.ts`、`preflight.ts`、`conformance/index.ts`（子路径 `./conformance`），已实现（HUB `c9b5850`）。下面是公开面的摘要，名字是实名，以源码为准。

```ts
type UntypedDb = Kysely<any>                       // 协议不为消费者的表建类型
interface ReadTx  { readonly db: UntypedDb }       // 绑定在本事务连接上的查询构建器
interface WriteTx extends ReadTx {
  lockRow(table: string, key: Readonly<Record<string, unknown>>): Promise<void>  // 对 key 命中的那一行取排他锁；行不存在则什么也不锁
  lockSentinel(name: string): Promise<void>                                       // 部署级互斥：同名的两个写事务不交错
}
interface Storage {
  read<T>(fn: (tx: ReadTx) => Promise<T>): Promise<T>    // 一次只读事务：整个 fn 内看到同一个已提交快照
  write<T>(fn: (tx: WriteTx) => Promise<T>): Promise<T>  // 一次写事务：fn 正常返回 ⇒ 提交；抛出 ⇒ 回滚并原样上抛
}
interface StorageInstance extends Storage { close(): Promise<void> }  // 提供者实例：关准入 → 等在途 → 关句柄
function narrow<DB>(tx: ReadTx): Kysely<DB>       // 消费者按自己的表接口收窄 db（只是类型断言）
// 失败四型，以异常到达调用方；调用方只 catch 前三种，第四种与其他异常上抛（那是缺陷）：
class StorageUnavailable  { cause?: unknown }                              // 瞬时：连接、忙超时、I/O、撤除期间被关
class UniqueViolation     { constraint: string }                           // 唯一冲突；constraint 是迁移里给该约束起的名字
class ReferenceViolation  { kind: ReferenceViolationKind }                 // 引用约束两向：'delete-restricted' | 'missing-target'
class StorageDefect       { cause?: unknown }                              // 缺陷：语法、未知列、NOT NULL/CHECK、只读事务里写、嵌套调用、约束名映射不到……
type StorageFailure = StorageUnavailable | UniqueViolation | ReferenceViolation | StorageDefect
function mapStorageError<F extends string>(error: unknown, unavailable: F): { failure: F }  // 只折 StorageUnavailable；其余重抛
```

四个错误类都继承 `Error`，`name` 字段就是类名，构造时可带 `cause`。

**协议级语义（提供者义务，套件逐条证）**：

| # | 语义 | 说明 |
|---|---|---|
| P-1 | `write(fn)` 是**一次**事务：`fn` 正常返回则提交并返回其值；`fn` 抛出则回滚，**异常原样上抛、不包装**；提交本身失败 ⇒ `StorageUnavailable` | 「不包装」是「无 catch-all」在协议这一侧：调用方自己的缺陷不能被改写成「存储不可用」 |
| P-2 | 写事务内**语句级失败不废事务**：`UniqueViolation`／`ReferenceViolation` 从某条语句抛出后，同一 `tx` 仍可继续读写并提交 | AI R-2「唯一冲突 ⇒ 在同一提交内重读」成立的前提。sqlite 原生如此（冲突只废那一条语句）；pg 里一条语句出错即整个事务进 aborted，**提供者逐语句 SAVEPOINT**。已定，落选方见[关键选择](#五处关键选择) |
| P-3 | 写事务内读到的是**全部已提交写的最新值**（含自己的写）。**pg 写事务 READ COMMITTED** | AI R-3 前半、OG R-3c。若用 REPEATABLE READ，`lockRow` 撞上快照后被改的行会以序列化失败收场，与「排成一个次序」不符 |
| P-4 | `lockRow` 之后、同一事务内对该行的读与写，与任何另一个也 `lockRow` 了该行的写事务**排成一个次序**；先读后写的窗口不存在 | AI R-3 后半、OG R-3a。pg：`SELECT … FOR UPDATE`；sqlite：`BEGIN IMMEDIATE` 已持库级写锁，`lockRow` 不发语句 |
| P-5 | `lockSentinel(name)` 之后，同名的另一个写事务在本事务结束前不进入其 `lockSentinel` 之后的部分 | OG R-3b。pg：事务级 advisory lock（`pg_advisory_xact_lock(hashtext(name))`），**不建哨兵表**；sqlite：同 P-4 不发语句。已定，见[关键选择](#五处关键选择) |
| P-6 | `read(fn)` 内全部读看到**同一个**已提交快照；`fn` 内的写语句被拒 ⇒ **`StorageDefect`**。**pg 读事务 `REPEATABLE READ READ ONLY`**；sqlite：WAL 下独立的读连接 + `query_only=ON` | OG R-3d。只读事务里写是调用方缺陷，不是抖动 |
| P-7 | 提交成立后跨进程重启仍在 | R-4。`synchronous=NORMAL` 在 WAL 下断电可能丢最后一段已提交事务但不破坏一致性（研究正文）——**这是 R-4 在 sqlite 开发期的已知边界**，生产期 pg 不受此限 |
| P-8 | **四型划分**：`StorageUnavailable` **只收瞬时失败**（连接、忙超时、I/O、撤除期间被关），**不返回空结果、不返回旧快照**；`NOT NULL`／`CHECK`／语法／未知列／只读事务里写／嵌套调用／约束名映射不到等一律 **`StorageDefect`**（带 `cause`）；**缺陷永远不折成不可用**，消费者不映射、直接上抛 | R-5 加它的反面。理由：两个 tenancy 节点把「不可用」当抖动型失败——清除链重扫、主链 `interrupted` 不记缺陷；schema 缺陷若被折成不可用，会被无限重扫且永远不被记成缺陷。AI／OG 方法体「其余异常上抛（那是缺陷）」正是这一支的接收方 |
| P-9 | 删除一行后，同一唯一约束立即允许同值再插入 | AI R-6 |
| P-10 | 引用约束**两向**可识别：删除被引用行 ⇒ `delete-restricted`；插入／更新指向不存在的目标 ⇒ `missing-target`。**方言错误码不区分两向**（pg `23503`、sqlite `SQLITE_CONSTRAINT_FOREIGNKEY` 两向同码），`kind` 由提供者按**触发语句的种类**分类 | AI R-7、OG R-6。前提 `ON DELETE RESTRICT` 且 sqlite `foreign_keys=ON`；不用延迟约束（延迟约束把失败推到 COMMIT，P-2 的「语句级」就不成立） |
| P-11 | `UniqueViolation.constraint` 在两种方言下对**同一个**约束给出**同一个**字符串——迁移里起的名字；**迁移一律 `CREATE UNIQUE INDEX <显式名>`，主键不命名（两方言统一报 `<table>_pkey`），表内 `UNIQUE` 约束不用**——sqlite 对它只有 `sqlite_autoindex_*`，拿不回迁移名，提供者不映射 ⇒ `StorageDefect`。sqlite 原生给 `table.column` 列表，提供者按 `PRAGMA index_list`／`index_info` 与 `sqlite_autoindex_<table>_N` 反查约束名；**映射不到 ⇒ `StorageDefect`**（是缺陷，不是抖动） | 调用方要分辨「登录标识撞了」与「主键撞了」（AI R-2 两种收场不同）。已定，见[关键选择](#五处关键选择) |
| P-12 | 同一进程内并发发起的 `write()` **不得互相阻塞线程、不得以 busy 失败**，各自仍是 P-1～P-4 意义下的一次事务；`read()` 与 `write()` 可真正并发 | `node:sqlite` 是同步 API，两个连接在同一线程上争 `BEGIN IMMEDIATE` 会把线程卡在 `busy_timeout` 上直到超时。已定；提供者的形状（写句柄一个 + 进程内写队列、读句柄独立且 `query_only=ON`、写锁忙等用 Driver 异步重试而非 busy handler）归 [`infra/storage-sql`](../../infra/storage-sql/README.md)。套件的并发测试**在读与写之间 `await` 让出事件循环**，否则测不出来 |

**消费者义务（P-13）**：不得在 `read(fn)`／`write(fn)` 的 `fn` 内调用任何经同一 `storage` 的服务面——包括别的插件的操作（`accounts.read` 自己就是一次提交）。这不是政策而是物理约束：sqlite 单写句柄 + 进程内队列会自锁，pg 两连接互等到超时；提供者以 `AsyncLocalStorage` 检测并抛 `StorageDefect`（C-15）。跨 owner 的「同一提交」由账号行上的单调事实与外键兑现，不由嵌套事务兑现（[OG 的跨 owner 一节](../../tenancy/organization-governance/design.md#跨-owner-的同一提交账号行上的过期事实加组织行对账号行的引用约束)）。

**`db` 的类型**：协议不为每个消费者的表建类型；`ReadTx.db` 是 `Kysely<any>`，消费者用 `narrow<MyTables>(tx)` 收窄——只是类型断言，协议不核对表是否存在，那由装配的迁移与消费者的测试保证。协议因此依赖 Kysely 的**类型**——这是 D-026 选定查询层的直接代价：换查询层等于换一版协议。

## 要求到协议，再到会红的测试

每条 R 至少一条在该语义消失时会红的测试。测试编号 `C-n` 就是 `src/conformance/index.ts` 里用例名的前缀，义务状态在 [verification.md](verification.md)。
**「会红的条件」写的是提供者做错什么时红**——套件是给提供者的，不是给协议自己的。

| 要求 | 协议里的兑现点 | 会红的测试 | 会红的条件（提供者做错什么） |
|---|---|---|---|
| [AI R-1](../../tenancy/account-identity/design.md#对存储提供者的要求清单)／[OG R-1](../../tenancy/organization-governance/design.md#对存储提供者的要求清单) 单次提交原子 | `write(fn)`，P-1 | **C-1a/C-1b** 两表各插一行后 `fn` 抛出 ⇒ 两表都没有，且调用方的异常**同一实例**到达（不是 `StorageUnavailable`）；**C-1c** 正常返回 ⇒ 行在，返回值透传 | 自动提交；把调用方异常包成存储错误；部分提交 |
| AI R-2／OG R-2 唯一约束可识别 | `UniqueViolation { constraint }`，P-11 | **C-2** 命名唯一索引 `conformance_account_name_unique` 上插重复值 ⇒ `UniqueViolation` 且 `constraint` 等于这个名字（两种方言同一断言） | 透传方言原生错误；sqlite 下给 `table.column` 而不是索引名 |
| AI R-2「在同一提交内重读」 | P-2 语句级失败不废事务 | **C-3** 事务内撞 `UniqueViolation` → catch → 同一 `tx` 重读该行拿到既有值 → 再写一行 → 提交成功 | pg 未用 SAVEPOINT（第二条语句报 aborted）；提供者在冲突时自行回滚 |
| AI R-2 + R-3 两个并发创建者（S-13 同标识并发在存储层的形状） | `lockRow` 命中空行时什么也不锁 + `UniqueViolation` + P-2 | **C-13** 两个实例并发：各自 `lockRow` 同一不存在的唯一键 → 读到不存在 → `await` 让出 → 各插一行；断言**恰一个**走了「插入」路，另一个要么读到对方的行、要么撞 `UniqueViolation` 后在同一 `tx` 重读到它；两事务都提交，库里恰一行 | 空行锁定读被实现成「锁不到就失败」；或 P-2 不成立 |
| AI R-3 后半／OG R-3a 行级锁定读 | `lockRow`，P-4 | **C-4** 两个实例并发 `write`：`lockRow` 同一行 → 读计数 → `await` 让出 → 写计数+1；断言两次都提交成功、终值 = 初值 + 2，**且没有一方以 `StorageUnavailable` 收场** | pg `lockRow` 是空操作（丢失更新，终值 +1）；sqlite 两连接在线程上互卡（一方 busy 失败，P-12） |
| OG R-3b 部署级隶属写序列化 | `lockSentinel`，P-5 | **C-5** 同 C-4 但**只**用 `lockSentinel`、不 `lockRow` | pg advisory lock 空操作（丢失更新） |
| AI R-3 前半／OG R-3c 提交内读写同源 | P-3 | **C-6a/C-6b** 事务 A 提交后开始的事务 B 读到新值；同一写事务内先写后读读到自己的写 | pg 写事务开在 REPEATABLE READ 且事务早于 A 的提交开始；读缓存 |
| OG R-3d 只读事务快照一致 | `read(fn)`，P-6 | **C-7** `read` 内读行得 v₀ → 另一实例 `write` 把它改成 v₁ **并等它提交完成** → 同一 `read` 内再读 ⇒ 仍 v₀；`read` 结束后再读 ⇒ v₁ | pg 读事务用 READ COMMITTED；sqlite 读写共用一个连接且未起事务 |
| AI R-4／OG R-4 持久 | P-7 | **C-8** 写入 → `close()` → `factory()` 重开 ⇒ 读到。**跨进程重启**不在套件里：那是 [AI S-32 演练](../../tenancy/account-identity/verification.md#证据义务)的事，套件只证「关闭句柄后仍在」 | 事务只在内存里；WAL 未落盘（`synchronous=OFF` 一类） |
| AI R-5／OG R-5 不可用可识别（瞬时那一半） | `StorageUnavailable`，P-8 | **C-9a** `close()` 后调 `read`／`write` ⇒ `StorageUnavailable`（不是空结果、不是 undefined）；**C-9b** 写事务进行中**从另一异步任务对本实例自己 `close()`** ⇒ 该事务要么完整提交、要么以 `StorageUnavailable` 收场，**绝无部分提交**；之后本实例不再受理（⇒ `StorageUnavailable`） | 返回空数组；关闭时丢掉在途事务的一半；关闭后仍受理 |
| R-5 的反面：缺陷不是不可用 | `StorageDefect`，P-8 | **C-7b** 只读事务里发写语句 ⇒ `StorageDefect`，且库中无变化；**C-14** 非法语句 ⇒ `StorageDefect` 带 `cause`；违反 `CHECK` 约束 ⇒ `StorageDefect` | 把缺陷折成 `StorageUnavailable`（清除链无限重扫）；把驱动错误原样抛出；`query_only`／`READ ONLY` 未设 |
| AI R-6 删除即释放 | P-9 | **C-10** 插 → 删 → 下一个事务插同值 ⇒ 成功 | 软删除；延迟唯一约束 |
| AI R-7／OG R-6 引用约束（删除受限那一向） | `ReferenceViolation { kind: 'delete-restricted' }`，P-10 | **C-11** 套件自己的 `conformance_parent`／`conformance_child` 两表（外键 `conformance_child_parent_fk`，`ON DELETE RESTRICT`）：有子行时删父行 ⇒ `delete-restricted`，父行仍在 | sqlite `foreign_keys` 未开（删除静默成功——**这条是 sqlite 上最容易无声失守的**）；`kind` 分类反了 |
| OG R-6（插入指向不存在的目标那一向） | `ReferenceViolation { kind: 'missing-target' }`，P-10 | **C-12** 插子行指向不存在的父 ⇒ `missing-target` | 同上；两向折成一个 `kind` |

**两个方向都由套件自己的两张表证**——套件不知道也不该知道 `organization.ownerAccount` 这条真实的外键。真实外键是否存在、是否 `ON DELETE RESTRICT`，是装配迁移的事，见下节。**嵌套调用 ⇒ `StorageDefect`**（P-13）由 **C-15** 证：写事务里再 `write`／`read` 都被拒，外层事务不受影响。

## 表结构不在协议里，由装配层迁移建立，两节点同一约束域

协议只定义事务、锁、失败三样；**它不定义任何表**。理由：表是各 owner 事实的存储形状（AI 的账号行有 `expiredAt`，OG 的组织行有 `ownerAccount`），归各节点的设计；协议若持有表就成了第二份权威。

| 谁 | 建什么 | 依据 |
|---|---|---|
| 各持事实节点（AI、OG） | 自己记录的**列与约束的要求**（写在各自 design.md 的持久记录表与 R 清单里），并在包里导出自己表的迁移片段（`readonly MigrationFragment[]`：`accountIdentityMigrations`、`organizationGovernanceMigrations(...)` 的返回值），唯一约束与主键的**名字**（P-11 的输入）在片段里起 | 节点设计 |
| **装配**（[`apps/tenancy-host`](../../../apps/tenancy-host/design.md)，名由 D-027 拍板） | 按次序把各 owner 的片段经 `composeMigrations` 合成一个 `MigrationProvider`，经 storage-sql 的 config 传入；`organization.ownerAccount → account` 这条外键 `ON DELETE RESTRICT` 由装配经 OG 迁移工厂的参数给出——**两张表在同一个库、同一个 schema，一条外键，两侧各自记一条要求**（[AI R-7](../../tenancy/account-identity/design.md#对存储提供者的要求清单) ⇔ [OG R-6](../../tenancy/organization-governance/design.md#对存储提供者的要求清单)） | D-026「两个 tenancy 节点的表在同一存储、同一约束域」 |
| [`infra/storage-sql`](../../infra/storage-sql/README.md) | 迁移**运行器**（Kysely `Migrator`）；config 可选项 `migrations: MigrationProvider`，迁移在 `provide('storage')` **之前**跑；不带任何业务表 | D-026 |
| [`infra/clock`](../../infra/clock/README.md) | 它自己那张租约表的迁移片段 `clockMigrations`（形状归该节点），同样由装配合成 | 该节点 |
| 本节点 | 只带一致性套件**自己的**五张 `conformance_*` 表（含命名唯一索引、`ON DELETE RESTRICT` 外键、一个 `CHECK` 列），套件开头建、结尾删 | — |

**装配自带一条检查**：套件证的是「提供者会把外键违反报成两向可识别的类型」，不证「那条真实外键存在」。装配的测试直接构造「组织行指着账号行」时删账号行 ⇒ `delete-restricted`；插组织行指向不存在的账号 ⇒ `missing-target`——`apps/tenancy-host` 的 `assembly.fk-organization-owner-account`。owner 装配。

### 迁移片段与迁移前核对的共用形状

两样**形状**放在本包，是因为 owner 包（AI、OG、clock、入口层）与装配都要用它们、又都不该为此 import 提供者 `infra/storage-sql`；语义各归其主，本包只给类型与一个纯函数：

| 公开名 | 形状 | 语义的 owner |
|---|---|---|
| `MigrationFragment` | `{ name: string; migration: Migration }`（Kysely `Migration`，只有 `up`、不带 `down`——升级整体性靠快照，不靠反向迁移）；`name` 在 owner 包内稳定、只追加不重排 | [tenancy-host「迁移由 owner 导出片段」](../../../apps/tenancy-host/design.md#存储装配迁移由-owner-导出片段本节点合成)（M-9） |
| `composeMigrations(fragments) → MigrationProvider` | 按数组次序合成；合成名 `composedMigrationName(position, fragment)` = 四位全局位置编号 + `_` + owner 给的名字（`0001_<name>`）；同名片段 ⇒ 抛出，不静默覆盖 | 同上；次序由装配给 |
| `PreflightCheck = (input: PreflightInput) → Promise<PreflightResult>` | `PreflightInput { tx: ReadTx; tables: ReadonlySet<string>; appliedMigrations: readonly string[] }`——同一个只读事务、提供者先读好的已存在表名（含迁移登记表本身）、已登记迁移名按执行次序；`PreflightResult = { ok: true } \| { ok: false; check; detail }`，`check` 是核对的稳定名字，提供者原样放进启动失败 | [storage-sql「迁移前只读核对」](../../infra/storage-sql/design.md#迁移前只读核对)；各条判据归各自 owner（数据格式归装配、时钟回拨归 clock、中心标识表归入口层） |

装配与测试合成迁移一律用 `composeMigrations`，不各写一份。

## 一致性套件的形状

```ts
import { describeStorageConformance } from '@omne-harness-lite/storage/conformance'
describeStorageConformance(name: string, factory: () => Promise<StorageInstance>)
```

- 提供者在**自己的**测试文件里调用它；套件是 vitest 的 `describe` 块，19 个用例（C-1a/b/c～C-15，含 C-2b 主键支）。
- `factory` **每次调用返回一个新实例，指向同一个底层库**；套件在 `beforeAll` 起两个实例，个别用例再起第三个（C-8／C-9a／C-9b）。C-4／C-5／C-7／C-13 要两个真正独立的连接——sqlite 下即同一临时文件的多个连接（WAL）。
- 套件开头用实例 0 在一个 `write` 里以 Kysely 的 schema 构建器建五张 `conformance_*` 表并清空；结尾删表、关闭实例。
- **无 in-memory 实现**（D-026）：套件不带夹具；提供者的测试给它一个临时文件库。
- pg 方言：提供者的 pg 测试文件在环境变量 `OMNE_TEST_PG_URL` 指向一个可连的库时运行，缺时 `describe.skip` 并在用例名里写明未运行。**跳过不是通过**，每次运行是否跳过登记在 verification。
- 本版唯一的提供者 [`infra/storage-sql`](../../infra/storage-sql/README.md) 在 `tests/conformance.sqlite.spec.ts` 与 `tests/conformance.postgres.spec.ts` 里调用它。

## 五处关键选择

### 锁做成显式方法，不让调用方写 `forUpdate()`，也不用可串行化重试

| | 调用方自己 `forUpdate()`（落选） | 可串行化隔离 + 冲突重试（落选） | **显式 `lockRow`／`lockSentinel`，按方言解释（已定）** |
|---|---|---|---|
| sqlite 上的形态 | `forUpdate()` 不被剥掉、静默成普通读（研究正文）——R-3 无声失守 | sqlite 没有 SSI；`BEGIN IMMEDIATE` 已是写者互斥，重试无对象 | `BEGIN IMMEDIATE` 下不发语句，语义平凡成立 |
| pg 上的形态 | 正确 | 正确，但每个写操作要包一层重试循环，重试次数与退避成了每个消费者各写各的政策 | `SELECT … FOR UPDATE`／advisory lock，一次事务一个次序，无重试 |
| 调用方要知道什么 | 方言 | 重试政策 | **只知道「我要锁这一行」** |
| 本方弱点 | — | — | `lockRow` 命中空行时什么也不锁（两种方言都如此）；空行上的互斥要靠唯一约束 + P-2（C-13）。协议把这一点写明而不是藏起来 |

落选方（`forUpdate()`）的最强论证：Kysely 已经有它，协议少一个方法。它输在研究正文那条事实：sqlite 下它是空操作而且不报错。

### 语句级失败不废事务（P-2），不改用 `ON CONFLICT DO NOTHING`

| | `ON CONFLICT DO NOTHING` + 重读，事务出错即废（落选） | **P-2：冲突后事务仍可用，pg 逐语句 SAVEPOINT（已定）** |
|---|---|---|
| 调用方写法 | 每个可能撞唯一的插入都要改写成 `onConflict().doNothing()` 并检查影响行数 | 照常插入，catch `UniqueViolation` 后由调用方收场——OG S-20 在同一提交内重读；[AI S-13](../../tenancy/account-identity/design.md#能力到-cordis-的投影) 则不写、从快照重来一次（凭据计算在事务外） |
| 引用约束 | `ON CONFLICT` 管不到外键；`missing-target` 仍会废掉 pg 事务 | 同一机制覆盖两种约束 |
| 代价 | 无 | pg 每条语句一个 SAVEPOINT；sqlite 零成本 |
| 本方弱点 | — | pg 上每条语句多一次往返；代价未测量 |

落选方的最强论证：不需要 SAVEPOINT，pg 上更快。它输在「两个 tenancy 节点已经按 catch 后重读写好了分支」且外键那一向它管不到。

### `UniqueViolation.constraint` 是迁移里的名字，不是列元组

| | 列元组 `table.column[,column]`（落选） | **约束／索引名（已定）** |
|---|---|---|
| 谁原生给 | sqlite 的错误消息 | pg 的错误对象 |
| 另一方言怎么补 | pg 要从 detail 文本解析列名，格式随版本变 | sqlite 提供者在出错时用 `PRAGMA index_list`／`index_info` 把列表映射回索引名；主键的自动索引 `sqlite_autoindex_<table>_N` 反查到迁移里的 `CONSTRAINT` 名 |
| 对迁移的要求 | 无 | **每个唯一约束与主键必须命名**——装配迁移的一条纪律 |
| 本方弱点 | — | 匿名约束在 sqlite 下映射不回名字 ⇒ `StorageDefect`（迁移没守纪律是缺陷，不是抖动） |

选名字是因为它是迁移可控的、跨方言稳定的那个，且 AI 要分辨的两个约束（登录标识、主键）在迁移里都有名字。

### `lockSentinel` 在 pg 上用事务级 advisory lock，不建哨兵表

| | 哨兵表 + `SELECT … FOR UPDATE` 一行（落选） | **`pg_advisory_xact_lock(hashtext(name))`（已定）** |
|---|---|---|
| 需要什么表 | 协议要拥有一张表并带自己的迁移——与「表结构不在协议里」相抵 | 无表 |
| 释放时点 | 事务结束 | 事务结束（xact 级），与哨兵行等价 |
| 名字空间 | 行主键，独占 | 与同库里其它 advisory lock 使用者共享一个 64 位空间（例如迁移运行器若也用 advisory lock）；哈希碰撞概率可忽略，但**名字要加协议前缀** |
| sqlite | 不发语句 | 不发语句 |
| 本方弱点 | — | 名字空间共享；跨进程仍成立（advisory lock 是库级的），但换成非 pg 的第三方言时要重新给出 |

落选方的最强论证：OG R-3b 原话写的是「对一行哨兵取排他锁」，哨兵表逐字对应。它输在要让协议拥有一张表。同行 Claude Code 的 gateway 用 `pg_advisory_lock` 做迁移互斥（研究正文[「五家 CLI harness 没有一家用查询构建器」](../../../../../research/agent-harness-persistence-and-identity-infra/research.md#被调研的五家-cli-harness-没有一家用查询构建器)那段），是一个先例，不是依据。

### 第四型 `StorageDefect`，不把缺陷折进「不可用」

| | 三型：三种之外一律 `StorageUnavailable`（落选） | **四型：瞬时归 `StorageUnavailable`，缺陷归 `StorageDefect`（已定）** |
|---|---|---|
| 消费者写法 | `catch` 三种，映射 `StorageUnavailable` 为自己的字面 | 同左；`StorageDefect` 不在 `catch` 里，与调用方自己的异常一样上抛 |
| schema 缺陷（漏迁移、列名错、CHECK 写反）的去向 | 折成「不可用」→ 清除链按抖动型**无限重扫**，主链每次 `interrupted` **不记缺陷**——没有任何信号说这不是抖动 | 上抛 → 组合节点按「缺陷」落可观测记录，不重试 |
| 提供者要做什么 | 错误码映射表两栏 | 映射表三栏：瞬时码、约束码、其余；分类错了套件 C-7b／C-14 红 |
| 本方弱点 | — | 提供者要维护「哪些码是瞬时的」清单，漏一个就把瞬时报成缺陷（fail-loud，方向安全）；嵌套调用由 C-15 证 |

落选方的最强论证：失败集合小，消费者好写。它输在一条反证：一个漏掉的迁移会让清除链永远转下去而系统认为存储只是在抖。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 无契约依赖 | — | — | — |
| Kysely 0.29.6（catalog；**只依赖类型**：`Kysely`、schema 构建器的类型） | 普通包依赖 | 随包版本 | 大版本变更 ⇒ 协议出新版本（`ReadTx.db` 的类型是公开面的一部分） |
| vitest 4.1.11（catalog） | 运行时依赖——`./conformance` 导出的是 `describe` 块 | — | 换测试运行器 ⇒ 套件重写，协议不变 |

**被谁消费**：`account-identity`、`organization-governance` 经服务名 `storage` 用协议（它们 inject 的是提供者的实例，类型来自本节点），并用本节点的 `mapStorageError` 把 `StorageUnavailable` 折成各自的字面；
`governance-center-entry` 用它读或铸中心标识；`infra/storage-sql` 实现协议并跑套件；`infra/clock` 用 `storage` 读写租约。`MigrationFragment` 由 AI、OG、clock、入口层各自导出，`PreflightCheck` 由 clock、入口层与装配各自实现，`composeMigrations` 由装配 `apps/tenancy-host` 调用。**`mapStorageError` 放在本包**是因为它折的是本包定义的错误类型——错误类型的 owner 拥有映射；`kernel-basis` 不 import 本包。
服务名 `storage` 的类型声明（Cordis 的 Context 类型扩充）不在本包——本包不依赖 Cordis；归提供者节点。

### 对存储提供者的要求清单

本节点自己不消费存储；上面的 **P-1～P-12** 就是它对任何 `Storage` 提供者的要求清单，每条对应表里的 R 与 C。此外三条不在接口上、但套件会红的提供者义务：

- sqlite：`foreign_keys=ON`（C-11／C-12）、写事务 `BEGIN IMMEDIATE`（C-4）、读用独立连接 + `query_only=ON`（C-7／C-7b）、进程内写队列（C-4 的「没有一方 busy 失败」）。
- pg：写事务 READ COMMITTED + `FOR UPDATE`／advisory xact lock（C-4／C-5／C-6a）、读事务 `REPEATABLE READ READ ONLY`（C-7／C-7b）、逐语句 SAVEPOINT（C-3／C-13）。
- 两者：错误码映射按四型（pg `23505`／`23503` 与连接类码；sqlite `SQLITE_CONSTRAINT_UNIQUE`／`SQLITE_CONSTRAINT_PRIMARYKEY`／`SQLITE_CONSTRAINT_FOREIGNKEY` 与 `SQLITE_BUSY`／I/O 类码；字段名归提供者核）、`kind` 按触发语句分类（C-11 vs C-12）、约束名归一（C-2）、瞬时之外一律 `StorageDefect` 带 `cause`（C-14）。

## 状态、并发与失败映射

**协议无状态。**每次 `read`／`write` 调用恰是一次事务，提交点在 `fn` 返回之后、`write` 返回之前；写权在调用方的 `fn` 里，本节点不裁决任何冲突——它只保证冲突**可识别**（四型）且锁**按方言确实生效**（P-4／P-5）。

**并发**：两个 tenancy 节点跨 owner 的两条交错（激活 vs 清除、创建个人组织 vs 清除）各撞上一个存储对象——账号行（`lockRow` + 行上的 `expiredAt` 列）与外键（`ReferenceViolation` 两向）。本节点给的就是这两个原语，推理在[那边](../../tenancy/organization-governance/design.md#跨-owner-的同一提交账号行上的过期事实加组织行对账号行的引用约束)；套件里 C-4 与 C-11／C-12 分别是它们在存储层的最小形状。**嵌套调用**（在 `fn` 内再调同一实例的 `read`／`write`）⇒ `StorageDefect`（P-8、P-13），由 C-15 证。

**失败映射**：四型以异常到达调用方；调用方的 `catch` 只认前三种，`StorageDefect` 与其它异常上抛（AI／OG 的「无 catch-all」）；`StorageUnavailable` → 各消费者自己的「不可用」字面（AI `storage-unavailable`、OG `unavailable`）经本包 `mapStorageError` 折出，**不在此统一**——它对 `UniqueViolation`／`ReferenceViolation`／`StorageDefect`／调用方错误一律重抛，唯一冲突与引用违反须在此之前由操作自己按契约分支处理。`fn` 自己抛的异常原样穿过 `write`（P-1），不被映射。

**配置错误**：本节点无配置。提供者的方言配置非法 ⇒ 启动失败（同批政策，由 `infra/storage-sql` 兑现）。

## 成对的装载与撤除

本节点是纯模块，没有插件、没有 effect。`Storage` 实例的装卸归 `infra/storage-sql`；协议对那张装卸表只提出一条要求，写在这里以便两边对得上：

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| （协议要求提供者）`StorageInstance.close()`：**关准入 → 等在途 → 关句柄**。在途写事务要么完整提交、要么以 `StorageUnavailable` 收场，**绝无部分提交**；关闭后的 `read`／`write` ⇒ `StorageUnavailable`（C-9a／C-9b） | 提供者 | — | **不取消**：内核不取消在途调用，`write(fn)` 的 `fn` 跑完，由它那一次提交（或失败）收场。「等在途」等多久是提供者的政策，本协议只要求收场可识别 |
| 一致性套件：`factory()` 得到的 2～3 个实例 + 五张 `conformance_*` 表 | 套件（测试进程） | `beforeAll` 起不来 ⇒ 套件整体失败 | `afterAll` 删表、关闭实例；临时文件由提供者的测试删除 |

## 实施缺口与消费者影响

- **套件的运行结果尚未登记**：`infra/storage-sql` 已在 sqlite 与 pg 两种方言上接线运行套件，结果登记归那个节点的 verification 与 record/evidence；本节点 verification 的义务状态待证据 run 登记后回填。
- **装配**：约束与主键的命名纪律、真实外键、`foreign_keys=ON`、pg 的接线由 [`apps/tenancy-host`](../../../apps/tenancy-host/design.md) 兑现，真实外键两向由它的 `assembly.fk-organization-owner-account` 证。
- **套件自测**（对一个故意做错的提供者会红，例如把 `lockRow` 换成空操作跑 C-4）未写。owner 本节点。
- **pg 方言依赖环境**：缺 `OMNE_TEST_PG_URL` 时套件在 pg 上 `describe.skip`，跳过不是通过；CI 是否提供可连的 pg 归装配与 CI 配置（研究正文[「未知与下一项证据」](../../../../../research/agent-harness-persistence-and-identity-infra/research.md#未知与下一项证据)）。
- **`narrow` 只是类型断言**：表存在与否由装配迁移与消费者测试保证；换查询层 = 新版本协议。
- **跨进程重启的持久证据**不在套件里（AI S-32 演练）；**跨进程形态下的存储协调协议**未定（D-026「不表示」列的 Q-8）。
- **上游语义**：本节点不依赖 Cordis 行为，无 basis 引用。

## P-13 显式共同事务扩展

按 D-040 的 AI3 S-49/51 需要，采用[提供者候选 r2](../../../../record/proposals/governance-production-mechanisms/storage-unit.md)的显式单元；已独立定向评审无阻断。主线在既定实施授权内采用此绑定。原 Storage 和 P-1～P-12 不变，新增 AtomicStorage 扩展与 StorageUnit（run/query/mutate/assertStorage/afterCommit）。普通 read/write 不隐式参与，嵌套仍拒绝。

unit 的 query/mutate 是同一 tx 的暂存，不代表独立提交；query 只给 ReadTx 类型，不声称数据库硬只读。作用域同域/活跃帧/串行子调用检查，任何逃出 run 的异常永久污染；P-2冲突只可在参与操作内部处理。接纳即挂内部拒绝观察；作用域结束若有调用在途，禁止新调用并等待其静止后回滚。不是检测所有await/背景交接或沙箱化裸SQL。

SqlStorage.atomic 复用已有 write 事务和排空；单元局部 ALS 只管调用帧，不合并普通 Storage。真正提交后、在事务与单元上下文外派发尽力通知。通知抛出/返回Promise只记无秘密的诊断，不能将已提交业务改报失败；提交未知不派发。退出后调用只报缺陷，不追回提交。相关符合性由新增独立套件及提供者测试取证，不从原P1～12通过推断。

接口/实现分别归本节点与对应另一节点；这不是完整AI/OG事务面或PG治理授权的验证。实际验证回填 verification，不能提前声称生产入口已切换。

维护提供者精化：[maintenance](maintenance.md)，采用与实际验证状态见[节点入口](README.md)；该精确稿保留接受时的文字。


## D057 符合性运行器依赖精化（2026-09-26）

[D057](../../../../record/decisions/governance-conformance-runner-adoption/README.md)限定取代本页旧Vitest运行时依赖与无runner参数签名：describeStorageConformance(name,factory,runner)、describeAtomicStorageConformance(name,factory,runner)。runner为两个suite实际使用的Vitest函数Pick类型；测试进程提供，core不自行导入运行时。Vitest只作开发依赖；普通根公开入口不导出runner类型。声明消费与制品依赖清单实际验证归verification，不由type import字样推定隔离已完成。
