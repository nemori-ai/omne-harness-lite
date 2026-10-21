# @omne-harness/session-storage-sql

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

Session 的存储成员，`cordis-module` 变体。

## 职责与状态

本成员是 Session 组里唯一接触介质的成员。它用 SQL 表兑现 [session-contract](../session-contract/README.md) 声明的 `SessionTransactionPort`：提交、权威读、原操作查询、历史读、epoch 视图读、待办扫描、引用查询与已释放作用域读。具体拥有四类东西：权威表与派生索引的 SQL 形状及迁移片段；存储契约的参加者模块 `session`，它在存储提供者的事务里执行 Session 的事实语句；`SessionTransactionPort` 的 SQL 实现；读路径 R1 至 R11 的算法与符合性套件。

本成员不拥有治理规则与领域服务（归 session-contract）、命令处理流水线的事务外部分（归 [session](../session/README.md)）、邻域翻译（归 [session-adapters](../session-adapters/README.md)）、提交协议与回执（归存储契约），也不拥有条目缓存、快照缓存与视图前缀摘要缓存。

状态：存储成员，`draft`，候选技术设计，没有运行实现。采用依据是组的[成员分解](../docs/architecture.md)与 [SPEC](SPEC.md)。

- 已实现：没有。`src/index.ts` 与 `src/cordis.ts` 只有模板标记，两个入口都没有导出。
- 未实现：事务端口实现、参加者模块、派生维护、读路径、重建、编解码、迁移片段与 Cordis 插件。
- 未验证：SPEC 的义务都没有测试，现有测试只断言两个入口导出为空。
- 前提缺口：存储契约没有可依赖的 workspace 成员。SPEC 的 [XP-1 至 XP-6](SPEC.md#xp-table) 记下了本成员对它的六项期望，拥有者是存储线（[issue 540](https://github.com/nemori-ai/omne-harness-lite/issues/540)）。缺哪一项，对应操作返回 `unavailable`，本成员不用内存实现代替。

现在没有包依赖本成员。

## 使用

本成员有两个入口：

- 根入口 `@omne-harness/session-storage-sql`：与 Cordis 无关，将导出提供者工厂、参加者模块、迁移片段与组合登记材料。不装配 Cordis 的调用方用工厂取得事务端口，交给 [session](../session/README.md) 工厂的 `transactions` 依赖。
- `@omne-harness/session-storage-sql/cordis`：将导出一个插件，提供服务键 `sessionTransactions`（键与抽象类归 [session-cordis-contract](../session-cordis-contract/README.md)）。应用装配者装入它，session-cordis 经 `inject` 取得端口。

两条路径都要求存储契约的提供者可用，并且执行记录提供者与本成员在同一事务域登记同一组合版本。每次操作显式传入租户与会话，本成员不从连接、事务域或装配树推断租户。工厂的名称与签名随实现确定，现在没有可运行的示例。装配步骤与独立使用的职责伪代码见[使用与定位](docs/context.md#使用方式)，插件的依赖与加载顺序见 [Cordis 集成](docs/cordis.md)。

只需要类型与纯函数的调用方使用 session-contract，不需要本成员。

## 契约

- 公开形状归 `src/`，现在为空。导出索引归[公开接口导航](docs/public-api.md)。
- 本成员的必要行为归 [SPEC](SPEC.md)：表与索引、写路径 W1 至 W6、读路径 R1 至 R11、保留与缓存、符合性 C-01 至 C-04、失败分类。
- 端口 `SessionTransactionPort` 的十一个操作、结果与失败归 [session-contract SPEC](../session-contract/SPEC.md#sessiontransactionport)。
- 表、索引与进程内对象的形状归[对象模型](docs/object-model.md)。

调用工厂的一方拥有端口实例，负责关闭它。关闭只释放语句缓存与签名密钥的引用，不关闭提供者的连接或 Worker，不回滚任何提交。`commit` 没有取消，调用方按原操作身份对账。读路径遇到提供者不可用、索引重建中或读入口缺席时返回 `unavailable`，不返回空页。本成员不删除条目、批次、回执或旧 epoch 行。

## 设计

本成员分为事务端口、参加者模块、派生维护、读路径、重建、编解码与迁移片段七个模块。包外依赖是 session-contract 的纯函数（OP-00 的身份派生、`decide`、`reduce`）、存储契约与 Kysely。关键机制是：

- 一个存储参加者 `session`，桥的材料打包进同一条命令
- 命令到条目只编码一次，编码归 `decide`，本成员只分配位置、写行与维护派生物
- 快照与七个派生索引在条目的同一事务里写入，读路径不重放日志
- 历史分页固定上界并使用签名游标，服务端不保存读会话
- 存储层回滚不写成业务拒绝，尝试未生效不写成未提交，不能证明时返回未知
- 不删除条目，条目缺口时隔离会话而不清空尾部

模块与理由见[内部架构](docs/architecture.md)，写路径、压缩提交、epoch 视图读取与派生重建的时序见[关键流程](docs/flows.md)，表与索引见[对象模型](docs/object-model.md)。

## 配置与运行

配置是介质（SQLite 或 PostgreSQL，须与存储提供者一致）、内联阈值（初值 16 KiB）、大对象去向（初值同库 `sl_blob`）、`pageBytes` 上限、`maxScanPerPage` 与快照重建方式。后三项没有初值，装配必须给出。默认值只是配置初值。经 Cordis 时，这些值由插件配置给出并用 Standard Schema 校验，见 [Cordis 集成](docs/cordis.md#配置)。游标签名密钥是运行时对象，由装配注入，不是配置值。

环境前提是存储契约的 SQLite 或 PostgreSQL 提供者。连接、Worker、PRAGMA 与写者代际都归提供者，本成员不打开连接。迁移片段随提供者的原子迁移执行，完成之前读与写都返回 `unavailable`。没有内存实现。调用方负责关闭端口，存储的拥有者负责关闭提供者。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/session-storage-sql
```

在本目录执行 `pnpm typecheck` 做类型检查。现有两个测试只断言两个入口导出为空，见 [tests/](tests/README.md)。SPEC 的义务按[验证义务](verification/obligations.md)随实现进入：派生等于重算的影子表集合差、分页与游标的属性测试、每个共同提交行一个写路径用例、读路径复杂度基准（N 从 10³ 到 10⁶）、失败分类表的注入用例。全部义务以真实的 SQLite 或 PostgreSQL 提供者为前提，等存储线给出入口。数值目标在实测之前不声明。断电耐久归存储线的 SQL-T01，本成员不宣称。结构检查通过不表示行为已验证。

## 维护

- session-contract 的事务端口、`decide`、`reduce` 或事件目录改变时，同步 SPEC 的写路径与读路径、[内部架构](docs/architecture.md)与[关键流程](docs/flows.md)。归约版本号改变时，按 R9 重建 `sl_state`。
- 新增事件种类或引用种类时，同步 SPEC 的派生行表、C-01 的重算表与重建。
- 表或索引改变时，同步[对象模型](docs/object-model.md)与迁移片段。权威表只增列。
- 新增配置项时，同步[公开接口导航](docs/public-api.md)与 [Cordis 集成](docs/cordis.md)的配置。
- 存储契约补上 XP 表的某一项时，删除 SPEC 里对应的退路与明确缺项。
- 唯一的组内消费者是 session-cordis（经服务键）与应用装配者。成员关系与依赖方向归[组入口](../README.md)，具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   表、写路径、读路径、符合性、失败分类
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块、依赖、关键机制与理由、设计限制
├── flows.md              写路径、压缩提交、epoch 视图读取、派生重建
├── object-model.md       表、索引、进程内对象与生命周期
├── public-api.md         导出入口、候选导出与配置
├── context.md            使用方式、消费者与定位
└── cordis.md             作为 sessionTransactions 提供者的 Cordis 集成
src/                      两个入口，现在只有模板标记
tests/                    入口测试，fixtures/ 现在为空
schema/                   现在为空，表与索引的形状在 docs/object-model.md
verification/             obligations.md 验证义务；models/ 与 proofs/ 现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
