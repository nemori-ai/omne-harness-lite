# storage-sql

- kind：`provider`
- 对象与设计修订：候选节点，2026-09-22 首稿；**2026-09-23 修订**：承接 [tenancy-host「升级的整体性」](../../../apps/tenancy-host/design.md#升级的整体性迁移前只读核对快照与确认)的 R-U1～R-U8 与缺口 U-2——显式开启的**升级守卫**（属主排他、迁移前只读核对、sqlite 升级快照与恢复、存储协议之外的确认导出），改掉「半截 DDL 只由幂等收口」一句（快照是第一道、幂等是第二道），pg 上迁移之后的撤回写成显式缺口。**不兑现任何契约条款**——它兑现的是 [`core/storage`](../../core/storage/README.md) 的存储协议（`read`／`write`／`lockRow`／`lockSentinel` 四个方法与 `StorageUnavailable`／`UniqueViolation`／`ReferenceViolation`／`StorageDefect` 四种失败类型，均为候选名）。协议的规格来源是两个 tenancy 节点对存储提供者的要求清单（[AI R-1～R-7](../../tenancy/account-identity/design.md#对存储提供者的要求清单)、[OG R-1～R-6](../../tenancy/organization-governance/design.md#对存储提供者的要求清单)）；选型由 [D-026](../../../../record/decisions/infrastructure-persistence-choices/README.md) 裁定：通用查询层 Kysely、sqlite 驱动 `node:sqlite`、方言只改配置即切 PostgreSQL、不提供 in-memory 实现
- 源码位置：`packages/infra/storage-sql`——**已建包（2026-09-22）**：`src/sqlite/{driver,errors,constraints}.ts`（自写 `node:sqlite` Driver、四型错误翻译、约束名反查）、`src/postgres/index.ts`（pg 接线、逐语句 SAVEPOINT、`FOR UPDATE`／advisory lock）、`src/provider.ts`（`SqlStorage`：读写各一个 Kysely 实例、嵌套调用判缺陷、关准入→等在途→关句柄）、`src/plugin.ts`（`storageSqlPlugin`，config 可辨识联合 + `migrations?`）。第一层 `infra` 由 [D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md) 拍板（2026-09-23）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个 Cordis 插件、一条 fiber，`provide('storage')`（服务名沿用既有节点）。它拥有**连接／库句柄、事务边界、方言差异（锁语句与错误码）与迁移运行器**，开了升级守卫时另有**属主排他与落在磁盘上的升级快照**；**不拥有任何业务表**——表由装配层提供的迁移文件建立，本包只带运行器与 `MigrationProvider` 入口。采用版本：`@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）、Kysely 0.29.6、Node ≥ 24 内置 `node:sqlite`、`pg` 8.23（**本程只接线不跑**）。为什么不是 Drizzle、不是社区方言包、不是 `better-sqlite3`，在 [design.md](design.md#实现路径与来源)

## 分层状态

- 语义接受范围：**无契约条款。**本节点不是任何 `spec/` 契约的提供者，「接受」在这里只有两层含义：它兑现的协议接口归 [`core/storage`](../../core/storage/README.md) 节点（同批起草，**尚未被接受**）；协议对应的要求清单随 AI／OG 两个节点的设计被 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/README.md) 接受为实现路径，查询层与驱动的选型被 [D-026](../../../../record/decisions/infrastructure-persistence-choices/decision.md) 接受。到此为止，不提升下面三层。升级守卫承接的 R-U1～R-U8 来自 tenancy-host 对 PF-017 §6.9 的承接（PF-017 rev 1 已接受（2026-09-23）），**不是契约条款**，契约层的语义接受无从谈起；入口契约 S-34「存储不可用只以返回值到达」那一前提出自 `composition.governance-center-entry/v1`（**`candidate`**）——语义接受：**无**
- 可实施范围：本节点声称在 **sqlite 方言**上兑现协议全部四个方法与四种失败类型，并把 AI R-1～R-7、OG R-1～R-6 逐条落到方言机制（[design.md「要求清单到方言机制」](design.md#要求清单到方言机制)）；**升级守卫**在 sqlite 上承接 R-U1～R-U8 与属主排他（[design.md「属主实例」](design.md#属主实例排他迁移前只读核对升级快照与确认)，设计已写、**源码尚无**）。**pg 方言只接线**：代码同一份，方言由配置切，但本程没有 pg 环境，pg 上的一切都是「按文档推断」而非兑现。**不兑现**：任何业务表的结构与迁移文件（归装配）、跨进程形态下的存储协调（[投影 Q-8](../../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)）、断电级持久（R-4 在 `synchronous=NORMAL` 下的边界，见 design.md）、**pg 上迁移提交之后装配失败的撤回**（tenancy-host 缺口 U-3，[显式缺口](design.md#实施缺口与消费者影响)，受阻消费者：tenancy-host 在 pg 上的 §6.9）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) 为**空表**——无已存在的证据可绑（本节点不兑现契约条款，没有可写进 `clause` 的坐标；升级守卫承接的各行尚无源码与测试）；协议级证据是 `core/storage` 的一致性套件在本提供者上的运行，义务逐条登记在 [verification.md](verification.md)，全部「未开始」
- 实际验证：2026-09-22 `core/storage` 一致性套件在 sqlite 临时文件库上 **18 组用例全绿**（C-1a～C-15，含 C-2b 主键支，含两实例真并发 C-4／C-5／C-7／C-13），插件测试 4 条通过；pg **未运行**（`describe.skip`，跳过不是通过）；见 [verification.md「实际执行」](verification.md#实际执行)。**升级守卫：尚无**——没有源码，`upgrade.*` 各条义务全部未开始

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 为什么是 Kysely + 自写 `node:sqlite` Driver、方言配置长什么样、两种方言的锁与错误码怎么映射、迁移谁跑、装卸怎么配对 | [实现设计](design.md) |
| 升级怎么整体成或整体不成：排他、只读核对、快照、恢复、确认，pg 缺什么 | [属主实例](design.md#属主实例排他迁移前只读核对升级快照与确认) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（当前为空） |
| 一致性套件每条 R 的义务、方言切换与错误码映射测试、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
