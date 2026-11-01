# @omne-harness/session-storage-sql

[English](README.md)

Session 的存储成员。它用 SQL 实现 `SessionTransactionPort`，只经 `@omne-harness/sql-contract` 的公开形状使用 SQL。

## 职责与状态

本成员是 Session 组里唯一接触介质的成员。它用 SQL 表兑现 [session-contract](../session-contract/README.md) 声明的 `SessionTransactionPort`：提交、权威读、原操作查询、历史读、epoch 视图读、待办扫描、引用查询与已释放作用域读。具体拥有四类东西：权威表与派生索引的 SQL 形状及迁移片段；存储契约的参加者模块 `session`，它在存储提供者的事务里执行 Session 的事实语句；`SessionTransactionPort` 的 SQL 实现；读路径 R1 至 R11 的算法与符合性套件。

本成员不拥有治理规则与领域服务（归 session-contract）、命令处理流水线的事务外部分（归 [session](../session/README.md)）、邻域翻译（归 [session-adapters](../session-adapters/README.md)）、提交协议与回执（归存储契约），也不拥有条目缓存、快照缓存与视图前缀摘要缓存。

状态：存储成员，`draft`。head 已有实现，覆盖范围见 [SPEC 的实现现状](SPEC.md#实现现状)。采用依据是组的[成员分解](../docs/architecture.md)与 [SPEC](SPEC.md)。

- 已实现：根入口 `createSessionStorage`、`sessionStorageMaterials`、`SESSION_PARTICIPANT`；一个参加者 `session`、一个迁移、八个 `snapshot` 读 handler；端口的提交、读、`queryOperation`、`queryControlOperation`、`readModelSelection`、历史读、`pending`、`references`、`releasedScopes`。
- 没有 `./cordis` 子路径。会话存储组合（材料目录、组合声明、事务域目录、Cordis 服务）由应用承担，本成员不重建它。
- 未实现：`commitEntries`（恒返回 `unavailable`，session-contract 还没有 entries 解释的纯范围检查）、`sl_batch`、`sl_blob`、`sl_ref_idx`、R9 追赶与重建、PostgreSQL。
- 已验证：公开入口与依赖规则（`tests/public-entry.spec.ts`）、租户隔离与事务域目录（`tests/tenant-isolation.spec.ts`），以及另一位写者在 `tests/` 补入的用例。夹具在 `node:sqlite` 内存库上运行真实的 participant 与 handler，**不**覆盖 sqlite-provider 的 Worker、持久与关闭。新行为没有先红后绿记录，以负控用例代替。
- 前提：存储契约现在是 [sql-contract](../../storage/sql-contract/SPEC.md)，提供者是 [sqlite-provider](../../storage/sqlite-provider/SPEC.md)。本成员不依赖提供者实现。

现在没有包依赖本成员，应用装配随后选用它。

## 使用

根入口是唯一入口：

- `createSessionStorage(options)`：返回 `SessionTransactionPort<P>`。`options` 含 `storage`（`SqlStorage`）、`domains`（`TenantDomainAccess`）、`accessCheck`、`cursorSigning`、`combination`（`combinationVersion` 与 `manifestDigest`），以及可选的 `attemptLimit`（初值 8）、`cursorTtlMs`（初值 15 分钟）、`now`。
- `sessionStorageMaterials()`：返回参加者、迁移与读 handler 三份静态描述，应用把它们并入自己的材料目录。
- `SESSION_PARTICIPANT`：组合里列给 Session 日志的参加者名，值为 `session`。

应用用这三项完成会话存储组合，再把端口交给 [session](../session/README.md) 工厂的 `transactions` 依赖。每次操作显式传入租户与会话，本成员不从连接、事务域或装配树推断租户，也没有默认权限。装配步骤见[使用与定位](docs/context.md#使用方式)，应用承担的部分见 [装配边界](docs/cordis.md)。

只需要类型与纯函数的调用方使用 session-contract，不需要本成员。

## 契约

- 公开形状归 `src/`。导出索引归[公开接口导航](docs/public-api.md)。
- 本成员的必要行为归 [SPEC](SPEC.md)：表与索引、写路径 W1 至 W6、读路径 R1 至 R11、保留与缓存、符合性 C-01 至 C-04、失败分类。
- 端口 `SessionTransactionPort` 的操作、结果与失败归 [session-contract SPEC](../session-contract/SPEC.md#sessiontransactionport)。
- 表、索引与进程内对象的形状归[对象模型](docs/object-model.md)。

端口只持有应用交入的存储、目录、访问裁定与游标签名，不持有连接，没有关闭函数。`commit` 没有取消，调用方按原操作身份对账。读路径遇到读失败、读被取消、目录缺该租户或 `sl_state` 未覆盖 `tail` 时返回 `unavailable`，不返回空页。本成员不删除条目、回执或旧 epoch 行。

## 设计

本成员分为事务端口、参加者模块、派生维护、读路径、重建、编解码与迁移片段七个模块。包外依赖是 session-contract 的纯函数（OP-00 的身份派生、`decide`、`reduce`）与 sql-contract 的公开形状。现在的 SQL 是手写的 SQLite 语句，没有用 Kysely；设计目标里的七个模块中，重建与 PostgreSQL 方言尚未进入。关键机制是：

- 一个存储参加者 `session`，桥的材料打包进同一条命令
- 命令到条目只编码一次，编码归 `decide`，本成员只分配位置、写行与维护派生物
- 快照与七个派生索引在条目的同一事务里写入，读路径不重放日志
- 历史分页固定上界并使用签名游标，服务端不保存读会话
- 存储层回滚不写成业务拒绝，尝试未生效不写成未提交，不能证明时返回未知
- 不删除条目，条目缺口时隔离会话而不清空尾部

模块与理由见[内部架构](docs/architecture.md)，写路径、压缩提交、epoch 视图读取与派生重建的时序见[关键流程](docs/flows.md)，表与索引见[对象模型](docs/object-model.md)。

## 配置与运行

配置只有 `SessionStorageOptions` 的字段，见上文[使用](#使用)。`attemptLimit` 与 `cursorTtlMs` 的初值只是配置初值，应用可以改。游标签名由应用注入（`sessionCursorSigning`），不是配置值。SPEC 设计的内联阈值、大对象去向、`pageBytes` 上限、`maxScanPerPage` 与重建方式现在不是配置项，见 [SPEC 的实现现状](SPEC.md#实现现状)。

环境前提是 sql-contract 的存储提供者。连接、Worker、PRAGMA 与写者代际归提供者，本成员不打开连接。迁移随提供者的原子迁移执行，完成之前读与写都返回 `unavailable`。没有内存实现；测试夹具是 `node:sqlite` 上的测试用提供者，不属于发布产物。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/session-storage-sql
```

在本目录执行 `pnpm typecheck` 做类型检查。现有用例见 [tests/](tests/README.md)：入口与依赖规则、租户隔离、事务域目录，以及后补的用例。夹具运行真实的 participant 与 handler，但不经过 sqlite-provider 的 Worker，所以持久、关闭、受理队列与限额都没有覆盖。[验证义务](docs/verification-obligations.md)里的派生等于重算、读路径复杂度基准、并发写与失败分类注入尚未实现。数值目标在实测之前不声明。断电耐久归 [SQL-T01](../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01) 的承接方，本成员不宣称。结构检查通过不表示行为已验证。

## 维护

- session-contract 的事务端口、`decide`、`reduce` 或事件目录改变时，同步 SPEC 的写路径与读路径、[内部架构](docs/architecture.md)与[关键流程](docs/flows.md)。归约版本号改变时，按 R9 重建 `sl_state`。
- 新增事件种类或引用种类时，同步 SPEC 的派生行表、C-01 的重算表与重建。
- 表或索引改变时，同步[对象模型](docs/object-model.md)与迁移片段。权威表只增列。
- 新增配置项时，同步[公开接口导航](docs/public-api.md#配置)。
- sql-contract 的公开形状改变时，同步 SPEC 的 XP 表与 [装配边界](docs/cordis.md)。
- 消费者是应用装配者，它用本成员的材料与端口完成会话存储组合。成员关系与依赖方向归[组入口](../README.md)，具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   实现现状、表、写路径、读路径、符合性、失败分类
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块、依赖、关键机制与理由、设计限制
├── flows.md              写路径、压缩提交、epoch 视图读取、派生重建
├── object-model.md       表、索引、进程内对象与生命周期
├── public-api.md         导出入口与配置
├── context.md            使用方式、消费者与定位
├── cordis.md             装配边界：本成员没有 Cordis 入口，应用承担什么
└── verification-obligations.md  验证义务、方法、前提与未覆盖
src/                      根入口、端口实现、编解码、游标、静态材料；worker/ 是 Worker 内模块
tests/                    入口与依赖、租户隔离等用例；fixtures/ 是 node:sqlite 测试夹具
schema/                   不发布 Schema，表与索引的形状在 docs/object-model.md；DDL 在 src/worker/schema.ts
verification/             验证资源导航，义务表在 docs/verification-obligations.md；models/ 与 proofs/ 现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
