## 2026-10-04 公共集成接续

本批共享 Storage/Clock 定义与提供者绑定按[承诺归属表](../../../../architecture/pilots/shared-storage-clock-ownership.md)接续。
该表及成员旁 SPEC 只取代原公开键、根入口和 raw 发布投影；事务、租约、维护及消费者业务的未迁承诺仍有效。
旧路径、实现状态和运行结论按下文原日期读取。Clock 当前候选源码改为 `packages/infra/clock-lease`；历史节点保留。
独立 L3 验收和产品技术接受尚未完成，不以源码改接或设计采用提升状态。

# storage-sql

- kind：`provider`
- 对象与设计修订：状态 `implemented`（源码修订 HUB `c9b5850`），2026-09-22 首稿；**2026-09-23 修订**：承接 [tenancy-host「升级的整体性」](../../../apps/tenancy-host/design.md#升级的整体性迁移前只读核对快照与确认)的 R-U1～R-U8 与缺口 U-2——显式开启的**升级守卫**（属主排他、迁移前只读核对、sqlite 升级快照与恢复、存储协议之外的确认导出），改掉「半截 DDL 只由幂等收口」一句（快照是第一道、幂等是第二道），pg 上迁移之后的撤回写成显式缺口；同日按评审再修订：确认与撤后核查改由随 config 传入、由插件体附着的**守卫对象**承载（`createUpgradeGuard`，`confirm()` 返回 `{ migrated, snapshotTaken, snapshotRemoved }`），带迁移时 `upgrade` 必须显式给出（守卫或 `false`），启动时清临时名上的半成品快照，「生产库不得被非守卫实例打开」列为运维约定。**不兑现任何契约条款**——它兑现的是 [`core/storage`](../../core/storage/README.md) 的存储协议（`read`／`write`／`lockRow`／`lockSentinel` 四个方法与 `StorageUnavailable`／`UniqueViolation`／`ReferenceViolation`／`StorageDefect` 四种失败类型）。协议的规格来源是两个 tenancy 节点对存储提供者的要求清单（[AI R-1～R-7](../../tenancy/account-identity/design.md#对存储提供者的要求清单)、[OG R-1～R-6](../../tenancy/organization-governance/design.md#对存储提供者的要求清单)）；选型由 D-026 裁定：通用查询层 Kysely、sqlite 驱动 `node:sqlite`、方言只改配置即切 PostgreSQL、不提供 in-memory 实现
- 源码位置：`packages/infra/storage-sql`——**已实现（HUB `c9b5850`）**：`src/sqlite/{driver,errors,constraints,owner}.ts`（自写 `node:sqlite` Driver、四型错误翻译、约束名反查、sqlite 上的属主机制）、`src/postgres/{index,owner}.ts`（pg 接线、逐语句 SAVEPOINT、`FOR UPDATE`／advisory lock、读写共用一个 pool 只结束一次；pg 上的属主机制）、`src/provider.ts`（`SqlStorage`：读写各一个 Kysely 实例、嵌套调用判缺陷、关准入→等在途→关句柄）、`src/upgrade/{guard,owner,registry,files}.ts`（升级守卫：`createUpgradeGuard`、`UpgradeGuard.confirm()／pending()`、`UpgradeGuardNotAttached`、`StorageStartupFailure` 五个阶段、属主路径①～⑧）、`src/config.ts`（`StorageSqlConfig`：方言可辨识联合 + `migrations?` + `upgrade`）、`src/open.ts`（`openStorage`）、`src/plugin.ts`（`storageSqlPlugin`，服务名 `STORAGE_SERVICE`＝`'storage'`）。第一层 `infra` 由 D-027 拍板（2026-09-23）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个 Cordis 插件、一条 fiber，`provide('storage')`（服务名沿用既有节点）。它拥有**连接／库句柄、事务边界、方言差异（锁语句与错误码）与迁移运行器**，开了升级守卫时另有**属主排他与落在磁盘上的升级快照**；**不拥有任何业务表**——表由装配层提供的迁移文件建立，本包只带运行器与 `MigrationProvider` 入口。采用版本：`@deepseek-ai/cordis` 4.0.4（D-025）、Kysely 0.29.6、Node ≥ 24 内置 `node:sqlite`、`pg` 8.23（pg 测试在 `OMNE_TEST_PG_URL` 指向可连的库时运行，缺时跳过）。为什么不是 Drizzle、不是社区方言包、不是 `better-sqlite3`，在 [design.md](design.md#实现路径与来源)

## 分层状态

- 语义接受范围：**无契约条款。**本节点不是任何 `spec/` 契约的提供者，「接受」在这里只有两层含义：它兑现的协议接口归 [`core/storage`](../../core/storage/README.md) 节点（同批起草，**尚未被接受**）；协议对应的要求清单随 AI／OG 两个节点的设计被 D-023 接受为实现路径，查询层与驱动的选型被 D-026 接受。到此为止，不提升下面三层。升级守卫承接的 R-U1～R-U8 来自 tenancy-host 对 PF-017 §6.9 的承接（PF-017 rev 2），**不是契约条款**；本节点本程的设计（守卫对象、`upgrade` 显式、快照与恢复次序）随 D-028 接受为实现路径（2026-09-23）；入口契约 S-34「存储不可用只以返回值到达」那一前提出自 `composition.governance-center-entry/v1`（D-028 已接受）
- 可实施范围：本节点声称在 **sqlite 方言**上兑现协议全部四个方法与四种失败类型，并把 AI R-1～R-7、OG R-1～R-6 逐条落到方言机制（[design.md「要求清单到方言机制」](design.md#要求清单到方言机制)）；**升级守卫**在 sqlite 上承接 R-U1～R-U8 与属主排他（[design.md「属主实例」](design.md#属主实例排他迁移前只读核对升级快照与确认)）；以上**已实现（HUB `c9b5850`）**。**pg 方言**：代码同一份，方言由配置切；pg 上的测试只在 `OMNE_TEST_PG_URL` 指向可连的库时运行，design.md 里标「推断」的 pg 行为以那些测试的登记结果为准。**不兑现**：任何业务表的结构与迁移文件（归装配）、跨进程形态下的存储协调（[投影 Q-8](../../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)）、NORMAL 档位的断电级持久（R-4 边界见 design.md；D-039 的显式 FULL 以底层兑现同步为前提）、**pg 上迁移提交之后装配失败的撤回**（tenancy-host 缺口 U-3，[显式缺口](design.md#实施缺口与消费者影响)，受阻消费者：tenancy-host 在 pg 上的 §6.9；守卫在 pg 上如实交出 `migrated ∧ ¬snapshotTaken`）、**非守卫实例打开生产库时的排他**（锁只在守卫实例之间成立，写成运维约定，owner 装配）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) 为**空表**——无已存在的证据可绑（本节点不兑现契约条款，没有可写进 `clause` 的坐标）；协议级证据是 `core/storage` 的一致性套件在本提供者上的运行，升级守卫各行的证据是包内 `upgrade.*` 测试，义务逐条登记在 [verification.md](verification.md)
- 验证义务：对选用方言执行 `core/storage` 一致性套件，覆盖主键、两实例真实并发、升级守卫与插件装卸。SQLite 和 PostgreSQL 的结果分开陈述；跳过不是通过，不从一种方言推导另一种方言。方法与范围归 [verification.md](verification.md)。

## 按当前问题展开

| 当前问题                                                                                                            | 阅读入口                                                       |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 为什么是 Kysely + 自写 `node:sqlite` Driver、方言配置长什么样、两种方言的锁与错误码怎么映射、迁移谁跑、装卸怎么配对 | [实现设计](design.md)                                          |
| 升级怎么整体成或整体不成：排他、只读核对、快照、恢复、确认，pg 缺什么                                               | [属主实例](design.md#属主实例排他迁移前只读核对升级快照与确认) |
| 哪条承诺由哪份证据支持                                                                                              | [绑定表](bindings.yaml)（当前为空）                            |
| 一致性套件每条 R 的义务、方言切换与错误码映射测试、还缺什么                                                         | [验证与证据](verification.md)                                  |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，获准采用的终态写回当前承诺拥有者；比较与接受过程留本工作树 tmp。

## D-040 的显式共同事务增量

P-13 绑定经独立评审后进入实现：AtomicStorage扩展保持普通Storage不变；单元只是AI3共同提交的基础条件，不代表领域/入口已迁移。本批已实现、未提交；P-13独立符合性及Linux冒烟结果见verification，既有历史结果不改范围。

D055/D056 已采用并实施的维护提供者精化：[maintenance](maintenance.md)。

D056已采用维护run调用方资源补全，精确提供者修订见决定；实现已完成；实际验证与边界见维护运行证据。


## 2026-09-26 终审修补与最终制品

最终固定输入、运行与独立QA接续D055/D056与D057：生产闭包移除测试运行器，初始化未收场责任与叠加故障诊断修复，领域契约不变。18成员最终合并1926通过/34跳过，host最终单独重跑；两包清单、严格独立类型消费、47项独立制品旅程及真实首启故障恢复、三组跨OS与systemd通过。最终host r3、CLI r2的SHA/BUILD_ID在该run；旧记录不提升到新制品。Fable三轮及主线处置均有公开记录，未发现本期阻断。

限定：首次工作根创建须串行；原位源变动精确hash/fstat分支未独立验到；TUI仍限D054 profile，不是任意终端支持；恢复只隔离，同机备份不覆盖整机/磁盘毁损。公司实际部署、Agent工作会话与Web/desktop不属于本次验证。
