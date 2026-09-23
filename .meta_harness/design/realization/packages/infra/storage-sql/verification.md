# storage-sql 验证与证据

本节点不兑现契约条款，义务来自四处：[`core/storage` 一致性套件](../../core/storage/design.md#要求到协议再到会红的测试)的每一条用例（套件归那个节点，**在本提供者上跑**归本节点）、方言切换、错误码映射，以及 [tenancy-host R-U1～R-U8](../../../apps/tenancy-host/design.md#升级的整体性迁移前只读核对快照与确认) 与属主排他（升级守卫，`upgrade.*`）。
运行结果归 [record/evidence](../../../../record/evidence/README.md)，本页只引用并解释范围。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| AI R-1／OG R-1 单次提交原子（P-1） | 套件 C-1a／C-1b／C-1c 在 sqlite 临时文件库上绿 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`）：套件 `C-1a/C-1b`、`C-1c`，sqlite 一侧与 pg 一侧（PostgreSQL 16.14）同名用例都通过 | 本节点；套件由 `core/storage` 给出后在本提供者上跑 |
| AI R-2／OG R-2 唯一约束可识别（P-11） | C-2：`constraint === 迁移里的名字`——本提供者的 `PRAGMA index_list` 反查在此会红；主键那一支按 `sqlite_autoindex_<table>_N` 反查；迁移未命名 ⇒ `StorageDefect` | **部分**（同 run）：套件 `C-2`、`C-2b`（主键那一支）两侧通过；「迁移未命名 ⇒ `StorageDefect`」没有同名用例——装配一侧 `apps/tenancy-host/tests/migrations.spec.ts` › `assembly.constraint-names-resolve…` 核的是真实迁移的每个约束名都反查得到 | 本节点；反查是实施项，实现前主键那一支无结果 |
| 约束失败后「同一提交内重读」（OG S-20、OG R-6；P-2） | C-3、C-13：sqlite 原生；pg 分支本程 skip | **已通过**（同 run）：`C-3`、`C-13` 在 sqlite 一侧与 **pg 一侧**都通过——「pg 分支本程 skip」已不成立，pg 这次真跑了 | 本节点 |
| AI R-3／OG R-3a 行级锁定读（P-4） | C-4：两个实例、`await` 让出、两次都提交、终值 +2、**无一方 busy 失败**——写句柄的异步重试在此会红 | **已通过**（同 run）：`C-4` 两侧通过 | 本节点。**前提**：套件 `factory` 每次返回指向同一文件的新实例（协议节点已写明） |
| OG R-3b 部署级哨兵（P-5） | C-5 | **已通过**（同 run）：`C-5` 在 sqlite 与 pg 两侧通过——owner 栏「pg 下 advisory lock 本程不跑」已不成立（按 design，pg 下哨兵走 advisory lock） | 本节点；sqlite 下由库级锁覆盖，pg 下 advisory lock 本程不跑 |
| OG R-3c 提交内读写同源（P-3） | C-6a／C-6b | **已通过**（同 run）：`C-6a/C-6b` 两侧通过 | 本节点 |
| OG R-3d 只读快照一致（P-6） | C-7（读句柄独立、快照）、C-7b（`query_only=ON` 拒写 ⇒ `StorageDefect`，库无变化） | **已通过**（同 run）：`C-7`、`C-7b` 两侧通过 | 本节点；**待核**：`node:sqlite` deferred 事务在 WAL 下的快照起点是第一条读语句 |
| AI R-4／OG R-4 持久（P-7） | C-8：写入 → `close()` → `factory()` 重开 ⇒ 读到。**只证进程级**，不证断电 | **已通过**（同 run）：`C-8` 两侧通过 | 本节点 |
| AI R-5／OG R-5 不可用可识别（P-8） | C-9a（关闭后调用）、C-9b（写事务进行中从另一异步任务关本实例句柄 ⇒ `StorageUnavailable` 且无部分提交）；套件新增的「`StorageDefect` 不被折成 `StorageUnavailable`」一条（编号归 `core/storage`）：非法语句、`NOT NULL`／`CHECK` ⇒ `StorageDefect` | **已通过**（同 run）：`C-9a`、`C-9b`、`C-14` 两侧通过（`C-14` 的用例名点名的是非法语句与 `CHECK`） | 本节点 |
| AI R-6 删除即释放（P-9） | C-10 | **已通过**（同 run）：`C-10` 两侧通过 | 本节点 |
| AI R-7 ⇔ OG R-6 引用约束两向（P-10） | C-11（`delete-restricted`，`foreign_keys=ON` 未开在此会红）、C-12（`missing-target`） | **已通过**（同 run）：`C-11`、`C-12` 两侧通过；「`foreign_keys` 关着时红」的负向运行不在套件里，装配一侧的 `assembly.fk-organization-owner-account` ③ 有（真实外键上，通过） | 本节点；真实外键存在与否归装配的测试（协议节点已登记） |
| 同进程并发不互卡、读写真并发（P-12） | C-4／C-7 的并发分支 | **已通过**（同 run）：`C-4`、`C-7` 两侧通过 | 本节点 |
| 方言切换（D-026「只改配置」） | `dialect-switch`：同一份调用代码、同一套套件，config 从 `sqlite` 换成 `postgres` 后全绿。**本程 pg 用例 `describe.skip`**，前提写「有一个可连的 pg ≥ 14」；**跳过不是通过** | **已通过**（同 run）：pg 一侧 `conformance.postgres.spec.ts` › `storage conformance · postgres` 19 条全过（PostgreSQL **16.14**，只这一个版本，「≥ 14」的下限没跑）；`plugin.spec.ts` › `storage-sql 插件` › `方言切换只改配置：postgres 配置形状被接受（不连接）`；sqlite 一侧的 pg 占位跳过（缺 `OMNE_TEST_PG_URL`） | 本节点提供开关；跑 pg 归装配、第二程 |
| 错误码映射（[design.md 表](design.md#错误码映射表)） | `error-mapping.sqlite`：真库触发唯一（命名索引、主键）／外键（`DELETE`、`INSERT` 两向）／忙（异步重试超时）／已关闭，各断言映射类型、`kind`、`constraint`；`error-mapping.defect`：`NOT NULL`／`CHECK`／语法／未知列／读句柄上写 ⇒ `StorageDefect`，且写句柄上的 `SQLITE_READONLY` 仍是 `StorageUnavailable`（同码按句柄种类分型）；`error-mapping.postgres`：**用构造的 `pg` 错误对象**（`code`、`constraint`）测映射函数，不连库；`error-mapping.cause`：两型都带驱动原始错误 | **无证据**（同 run 没有这四个名字的用例）。相关断言散在套件 `C-2`／`C-2b`／`C-11`／`C-12`／`C-14`（类型、`kind`、`constraint`、`cause`，两侧通过）；「忙（异步重试超时）」「写句柄上 `SQLITE_READONLY` 仍是 `StorageUnavailable`」「用构造的 pg 错误对象测映射函数」找不到对应用例 | 本节点 |
| 事务种类传到 Driver | `driver.transaction-kind`：`read` 走读句柄发 `BEGIN`、`write` 走写句柄发 `BEGIN IMMEDIATE`（拦截句柄上的语句断言） | **无证据**（同 run 没有 `driver.transaction-kind`） | 本节点；Kysely `setAccessMode` 是否可用**待核**后定实现 |
| 写句柄异步重试 | `driver.busy-retry-yields`：实例 A 持 `IMMEDIATE` 锁并 `await`，实例 B 发起写；断言 B 在 A 提交后成功，且 A 的 `await` 之后的语句确实在 B 等待期间执行了（时间戳交错） | **无证据**（同 run 没有 `driver.busy-retry-yields`；粗粒度那一条 `C-4` 两侧通过） | 本节点；这条是 C-4 的机制级细化 |
| pg 逐语句 SAVEPOINT（P-2） | `driver.pg-savepoint`：拦截连接上的语句，断言写事务内每条语句前后有 `SAVEPOINT`／`RELEASE`，失败后有 `ROLLBACK TO`；**不连库** | **无证据**（同 run 没有 `driver.pg-savepoint`；行为层面的 `C-3` 在 pg 一侧通过） | 本节点 |
| 装卸配对（[design.md](design.md#成对的装载与撤除)） | `lifecycle.dispose-drains`：一个在途写事务未完成时 dispose，断言它按自己的提交收场（成立或无痕），新调用抛 `StorageUnavailable`，全部句柄最终关闭；`lifecycle.config-error-fails-load`：非法 config（含 `:memory:`）⇒ fiber `FAILED`、无 `storage` 服务；`lifecycle.open-failure-fails-load`：文件不可写 ⇒ 同 | **部分**（同 run）：`config-error-fails-load` 一形有——`plugin.spec.ts` › `storage-sql 插件` › `:memory: 被拒 ⇒ 启动失败`，撤除后不可用见同 describe › `配置合法 ⇒ 迁移先跑、再 provide storage；撤除后 storage 不可用`；`lifecycle.dispose-drains`（在途写事务未完成时 dispose）与 `lifecycle.open-failure-fails-load`（文件不可写）没有同名用例 | 本节点。「抛出 ⇒ `FAILED` 且不 provide」本身由 kernel-basis probe `plugin-throw-fails-fiber.test.ts` 在 4.0.4 上核过；本节点这两条只证本插件在这些情形下确实抛 |
| 迁移在 `provide` 之前 | `lifecycle.migrations-before-provide`：config 带一个会失败的迁移 ⇒ 无 `storage` 服务；带一个建表迁移 ⇒ 消费者首次解析到 `storage` 时表已在 | **已通过**（同 run）：`plugin.spec.ts` › `storage-sql 插件` › `配置合法 ⇒ 迁移先跑、再 provide storage…`、`迁移失败 ⇒ 启动失败，不 provide` | 本节点 |
| 属主排他（tenancy-host U-2） | `upgrade.exclusive-owner`：**两个子进程**对同一文件各起一个开了守卫的实例——后起者以「被占」启动失败、库与快照都没被它碰；先起者被 `SIGKILL` 之后，后起者再起即成功（锁随进程释放，不需要人清理）；同进程第二个开了守卫的实例同样「被占」；不开守卫的实例不受影响（一致性套件照旧两实例同文件）。排他在此会红：去掉锁，后起者在先起者未确认时恢复它的快照 | **已通过**（同 run）：`upgrade.process.spec.ts` › `upgrade.exclusive-owner`（2 条，真子进程） | 本节点；锁的承载方式待核后定 |
| R-U1 只读核对先于任何写 | `upgrade.preflight-refuses-before-write`：给一条返回 `ok: false` 的核对 ⇒ 启动失败、阶段「核对」、`detail` 原样；库的已提交内容（逐表）不变、没有快照、登记表没被建；核对里发写语句 ⇒ `StorageDefect`；核对抛出 ⇒ 同样「核对」阶段 | **已通过**（同 run）：`upgrade.spec.ts` › `upgrade.preflight-refuses-before-write`（4 条） | 本节点 |
| R-U2 迁移登记可读，读不到不当作空 | `upgrade.registry-read`：空库 ⇒ `appliedMigrations` 为空、`tables` 不含登记表；跑过两个迁移的库 ⇒ 两个名字按执行次序；读句柄在核对前被关（注入读失败）⇒ 启动失败、阶段「核对」、`cause` 是 `StorageUnavailable`，**不是**空序列放行 | **已通过**（同 run）：`upgrade.spec.ts` › `upgrade.registry-read`（3 条）；另 `upgrade.registry-beyond-known`（1 条） | 本节点 |
| R-U3 一致快照，含预写日志里的提交 | `upgrade.snapshot-consistent`：先提交一笔写且不做检查点（它只在预写日志里），再用多一个迁移的 provider 启动；在⑦之前截住，断言快照文件单独打开读得到那一笔；首次启动支：库文件不存在 ⇒ 打开之前已有「库不存在」标记 | **已通过**（同 run）：`upgrade.spec.ts` › `upgrade.snapshot-consistent`（2 条） | 本节点；在线备份接口待核 |
| R-U4 确认之前的失败撤回升级 | `upgrade.restore-on-migration-failure`：第二个迁移失败 ⇒ 启动失败、阶段「迁移」且点名它；库的内容、登记与 schema 回到升级前，**附属文件里没有升级后的写**，快照已不在。`upgrade.restore-on-dispose`：迁移成功、`provide` 之后别的写入者提交一笔，不确认即撤除 ⇒ 库回到升级前，那一笔也不在；首次启动支：撤除之后库文件与两个附属文件都不存在 | **已通过**（同 run）：`upgrade.spec.ts` › `upgrade.restore-on-migration-failure`（1 条）、`upgrade.restore-on-dispose`（2 条） | 本节点 |
| R-U5 遗留快照先恢复 | `upgrade.leftover-restored`：子进程在⑥之后、⑦中、恢复的「删附属文件之后、替换之前」各被杀一次 ⇒ 下一次启动先恢复、再按升级前的库重走，最终库与只跑旧序列的库内容一致；另一支在⑥写临时名之后、改名之前被杀 ⇒ 下一次启动②删掉半成品、⑥照常建成快照，`pending()` 从不把半成品报成快照 | **已通过**（同 run）：`upgrade.process.spec.ts` › `upgrade.leftover-restored：真崩溃之后下一次启动先恢复`（2 条，子进程 `SIGKILL`） | 本节点；真崩溃，用子进程 |
| R-U6 确认 | `upgrade.confirm`：有待跑迁移 ⇒ 返回 `{ migrated: true, snapshotTaken: true, snapshotRemoved: true }`，之后快照不在、`pending()` 为 `clear`，此后撤除不动库；无待跑迁移的重启 ⇒ 三者皆假、无动作；首次启动而迁移为空 ⇒ `snapshotTaken` 与 `snapshotRemoved` 为真、`migrated` 为假；同一附着上再调返回第一次的结果；快照目录只读 ⇒ 抛出、快照仍在；快照在确认之前被外部删掉 ⇒ `snapshotTaken ∧ ¬snapshotRemoved`（装配断言在此会红）；pg 上跑过迁移 ⇒ `{ migrated: true, snapshotTaken: false, snapshotRemoved: false }`、不抛（U-3 那一支，本程随 pg 套件 skip） | **已通过**（同 run）：`upgrade.spec.ts` › `upgrade.confirm`（5 条）；pg 支在 pg 一侧 `upgrade.postgres.spec.ts` › `upgrade.confirm（pg 支）…` 通过（sqlite 一侧那条占位跳过）——「本程随 pg 套件 skip」已不成立 | 本节点 |
| R-U6 确认绑在实例上（交错 (f)） | `upgrade.guard-binding`：装配手里的守卫就是插件体附着的那一个（交给插件的守卫在插件 `ACTIVE` 后 `confirm()` 成功——**内核若拷贝 config，这一支会红**）；从未交给任何插件的守卫 ⇒ `confirm()` 抛 `UpgradeGuardNotAttached`，交给插件的那个实例的快照原样在，随后撤除恢复它；「被占」启动失败之后守卫未附着、`pending()` 为 `never-attached`；撤除开始之后 `confirm()` 抛 `UpgradeGuardNotAttached`，撤完 `pending()` 仍按原位置答；确认在途时撤除 ⇒ 撤除等它返回、不恢复；同一个守卫交给两个实例（不同文件）⇒ 后附着的那个启动失败 | **已通过**（同 run）：`upgrade.plugin.spec.ts` › `upgrade.guard-binding（交错 f；A-1 取证）`（7 条）；`upgrade.spec.ts` › `守卫的附着规则（直接打开）`（3 条） | 本节点 |
| R-U7 pg 迁移一个事务 | `upgrade.pg-single-transaction`：第二个迁移失败 ⇒ 登记与 schema 都回到迁移前。**本程 `describe.skip`**，前提同 pg 套件；跳过不是通过 | **已通过**（同 run，pg 一侧）：`upgrade.postgres.spec.ts` › `upgrade.pg-single-transaction…`（PostgreSQL 16.14，新建空库 `w4a_upgrade`）；sqlite 一侧那条占位跳过 | 本节点提供开关；跑 pg 归装配 |
| R-U8 具名失败；恢复失败快照不删 | `upgrade.named-failures`：被占／恢复／核对／快照（快照目录只读）／迁移五个阶段各触发一次，断言类型是 `StorageStartupFailure`、阶段对、**不是** `StorageUnavailable`；恢复失败（库目录只读）⇒ 失败里带快照位置、快照仍在。`upgrade.dispose-restore-failure-visible`：撤除路径上让恢复失败 ⇒ `fiber.dispose()` 照常 resolve（basis 所言），`guard.pending()` 仍报 `pending` 与位置，有一条 error 记录 | **已通过**（同 run）：`upgrade.spec.ts` › `upgrade.named-failures：五个阶段各触发一次`（5 条）；`upgrade.plugin.spec.ts` › `upgrade.dispose-restore-failure-visible`（1 条） | 本节点 |
| `upgrade` 配置政策（带迁移必须显式给出） | `lifecycle.upgrade-config-policy`：带 `migrations` 而缺 `upgrade` ⇒ fiber `FAILED`、无 `storage` 服务；`upgrade` 对象而无 `migrations` ⇒ 同；`guard` 不是 `createUpgradeGuard()` 造的 ⇒ 同；带 `migrations` 且 `upgrade: false` ⇒ 照常 `ACTIVE`、不取锁、不建快照 | **已通过**（同 run）：`plugin.spec.ts` › `lifecycle.upgrade-config-policy：带迁移时 upgrade 必须显式给出`（5 条） | 本节点。「抛出 ⇒ `FAILED`」本身由 basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md) 核过 |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| 2026-09-22 sqlite 一致性套件 | `packages/infra/storage-sql/tests/conformance.sqlite.spec.ts`：`describeStorageConformance('sqlite (node:sqlite)', () => openStorage({ dialect: 'sqlite', file }))`，临时文件库、WAL、两个提供者实例 | C-1a/b/c、C-2、C-2b、C-3、C-4、C-5、C-6a/b、C-7、C-7b、C-8、C-9a、C-9b、C-10、C-11、C-12、C-13、C-14、C-15 全部通过（18 个 `it`） | 终端输出（本行是主线转述，尚未登记 record/evidence run） |
| 2026-09-22 插件测试 | `tests/plugin.spec.ts`：迁移先跑再 provide、撤除后 `StorageUnavailable`、`:memory:` 拒绝 ⇒ 启动失败、迁移失败 ⇒ 启动失败、pg 配置形状被接受（不连接） | 4 条通过 | 终端输出（本行是主线转述，尚未登记 record/evidence run） |
| [`2026-09-23-tests-tenancy-leg-2`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md) · sqlite 一侧 | 源码提交 `c9b5850`；`packages/infra/storage-sql/tests/` 七个文件：一致性套件（sqlite 临时文件库、WAL、两个实例同一文件）、插件测试（`bootAssembly`）、升级守卫（`upgrade.spec.ts` 直接打开、`upgrade.plugin.spec.ts` 经插件、`upgrade.process.spec.ts` 真子进程与 `SIGKILL`）；带迁移而不测守卫的夹具一律 `upgrade: false`；`OMNE_TEST_PG_URL` 未设；Node v24.18.0（`node:sqlite` 的 SQLite 3.53.1）、vitest 4.1.11 | build、typecheck 退出 0；70 条用例 **66 通过、4 跳过**、0 失败——跳过的 4 条都是 pg 文件在 sqlite 一侧的占位（缺 pg URL），见右列 pg 一侧 | [`output/storage-sql.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/storage-sql.log)、[`json/storage-sql.json`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/json/storage-sql.json)；义务对应 [`coverage.md`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/coverage.md#packagesinfrastorage-sql) |
| 同 run · pg 一侧 | 临时容器 `postgres:16`（PostgreSQL **16.14**），`conformance.postgres.spec.ts` 与 `upgrade.postgres.spec.ts` 各在一个新建空库（`w4a_conformance`、`w4a_upgrade`）上跑一遍 | 一致性套件 **19／19 通过**；升级 **3／3 通过**（`upgrade.pg-close-once`、`upgrade.pg-single-transaction`、`upgrade.confirm（pg 支）`） | [`output-pg/storage-sql.conformance.postgres.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output-pg/storage-sql.conformance.postgres.log)、[`output-pg/storage-sql.upgrade.postgres.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output-pg/storage-sql.upgrade.postgres.log)、`json-pg/` 下同名两份 |

**有限检查不写成无条件证明。** sqlite 一侧在临时文件库、单主机、WAL、`synchronous=NORMAL` 下成立；「崩溃」是子进程 `SIGKILL`，不是断电。pg 一侧只有 16.14 一个版本、直连单个库，没有跑「≥ 14」的下限，也没有经连接池。每种方言单次运行，真并发用例的交错取决于那一次的调度。`upgrade.postgres.spec.ts` 的 describe 名写「缺 `OMNE_TEST_PG_URL` 时未运行」，pg 一侧真跑时也显示这个名字——以用例状态为准。**通过不提升本节点的任何接受状态。**

## 覆盖缺口

按上面这次 run 的对应清单，本节点还缺的证据：

- **错误码映射四条**（`error-mapping.sqlite`／`.defect`／`.postgres`／`.cause`）没有同名用例：相关断言散在套件 C-2／C-2b／C-11／C-12／C-14 里，但「忙（异步重试超时）」「写句柄上 `SQLITE_READONLY` 仍是 `StorageUnavailable`」「用构造的 pg 错误对象测映射函数」找不到承担者。owner：本节点。
- **驱动三条**（`driver.transaction-kind`、`driver.busy-retry-yields`、`driver.pg-savepoint`）没有用例：行为层面的 C-4、C-3 在两侧通过，机制级的断言（语句拦截、时间戳交错、SAVEPOINT 往返）没有。owner：本节点。
- **装卸配对两条**：`lifecycle.dispose-drains`（在途写事务未完成时 dispose）与 `lifecycle.open-failure-fails-load`（文件不可写）没有同名用例；`config-error-fails-load` 一形有。owner：本节点。
- **「迁移未命名 ⇒ `StorageDefect`」**没有同名用例（P-11 那一行的第三支）；装配一侧的约束名反查只证真实迁移都命名了。owner：本节点。

其余不在本 run 证据范围内的：

- **pg 的边界**：只跑了 16.14、直连；连接串指向事务模式连接池（pgbouncer 一类）时会话级咨询锁是否还有意义、锁等待超时的行为，都没有证据。owner：装配。
- **断电级持久**没有证据形式，且本版 `synchronous=NORMAL` 明确不给；R-4 只证到进程重启（跨进程重启归 AI S-32 演练）。
- **跨进程的锁竞争**（两个进程各起一个不开守卫的本插件）没有套件用例；开了守卫的两进程排他由 `upgrade.exclusive-owner` 证。本版单机，Q-8。
- **运维约定「生产库不得被非守卫实例打开」**（[design.md 交错 (b) 旁](design.md#自构的交错)）：非守卫实例在机制之外，本节点无法检测，无证据形式；与 clock「租约表不得手动删」同形。owner：装配（tenancy-host 的运维说明）。
- **确认的删除已生效、目录落盘失败**那一支（[design.md 实施缺口](design.md#实施缺口与消费者影响)）：抛出时快照已不在命名空间里，与 tenancy-host R-U6「报错时快照须仍在」差这一支；定手段之前不写测试。owner：本节点 + tenancy-host。
- **pg 上迁移提交之后的撤回**没有机制、也就没有测试形式（tenancy-host 缺口 U-3）；闭合手段二选一见 [design.md 实施缺口](design.md#实施缺口与消费者影响)，定了之后加一条真演练。本 run 是第一次跑 pg：`upgrade.confirm（pg 支）` 报出 `migrated ∧ ¬snapshotTaken`，tenancy-host 的 `pg.spec.ts` › `U-3 在 pg 上的真形状…` 在 pg 上观察到这一支（通过）——这证的是缺口的形状被如实报出，不是缺口已闭合。owner：本节点 + tenancy-host。
- **重跑时旧 disposer 与新插件体的先后**是待核对主张（交错 (d)）；核定前不写测试，两种答案都不静默。
- **给 tenancy-host 的一条前提**：「库文件逐字节不变」只在上一次是干净停机时成立，否则 sqlite 关句柄时的检查点会改写库文件的字节而不改内容；该节点 `assembly.upgrade-preflight-refuses` 的断言要带这条前提或改成按内容比对（[design.md](design.md#实施缺口与消费者影响)）。
- 与 [bindings.yaml](bindings.yaml) 一致：空表——本节点无契约条款可绑，不是缺证据；上表的证据是协议与 R-U 各行的，不是契约坐标的。
