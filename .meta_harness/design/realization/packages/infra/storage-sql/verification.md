# storage-sql 验证与证据

本节点不兑现契约条款，义务来自四处：[`core/storage` 一致性套件](../../core/storage/design.md#要求到协议再到会红的测试)的每一条用例（套件归那个节点，**在本提供者上跑**归本节点）、方言切换、错误码映射，以及 [tenancy-host R-U1～R-U8](../../../apps/tenancy-host/design.md#升级的整体性迁移前只读核对快照与确认) 与属主排他（升级守卫，`upgrade.*`）。
运行结果归 [record/evidence](../../../../record/evidence/README.md)，本页只引用并解释范围。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| AI R-1／OG R-1 单次提交原子（P-1） | 套件 C-1a／C-1b／C-1c 在 sqlite 临时文件库上绿 | 未开始 | 本节点；套件由 `core/storage` 给出后在本提供者上跑 |
| AI R-2／OG R-2 唯一约束可识别（P-11） | C-2：`constraint === 迁移里的名字`——本提供者的 `PRAGMA index_list` 反查在此会红；主键那一支按 `sqlite_autoindex_<table>_N` 反查；迁移未命名 ⇒ `StorageDefect` | 未开始 | 本节点；反查是实施项，实现前主键那一支无结果 |
| AI R-2「同一提交内重读」（P-2） | C-3、C-13：sqlite 原生；pg 分支本程 skip | 未开始 | 本节点 |
| AI R-3／OG R-3a 行级锁定读（P-4） | C-4：两个实例、`await` 让出、两次都提交、终值 +2、**无一方 busy 失败**——写句柄的异步重试在此会红 | 未开始 | 本节点。**前提**：套件 `factory` 每次返回指向同一文件的新实例（协议节点已写明） |
| OG R-3b 部署级哨兵（P-5） | C-5 | 未开始 | 本节点；sqlite 下由库级锁覆盖，pg 下 advisory lock 本程不跑 |
| OG R-3c 提交内读写同源（P-3） | C-6a／C-6b | 未开始 | 本节点 |
| OG R-3d 只读快照一致（P-6） | C-7（读句柄独立、快照）、C-7b（`query_only=ON` 拒写 ⇒ `StorageDefect`，库无变化） | 未开始 | 本节点；**待核**：`node:sqlite` deferred 事务在 WAL 下的快照起点是第一条读语句 |
| AI R-4／OG R-4 持久（P-7） | C-8：写入 → `close()` → `factory()` 重开 ⇒ 读到。**只证进程级**，不证断电 | 未开始 | 本节点 |
| AI R-5／OG R-5 不可用可识别（P-8） | C-9a（关闭后调用）、C-9b（写事务进行中从另一异步任务关本实例句柄 ⇒ `StorageUnavailable` 且无部分提交）；套件新增的「`StorageDefect` 不被折成 `StorageUnavailable`」一条（编号归 `core/storage`）：非法语句、`NOT NULL`／`CHECK` ⇒ `StorageDefect` | 未开始 | 本节点 |
| AI R-6 删除即释放（P-9） | C-10 | 未开始 | 本节点 |
| AI R-7 ⇔ OG R-6 引用约束两向（P-10） | C-11（`delete-restricted`，`foreign_keys=ON` 未开在此会红）、C-12（`missing-target`） | 未开始 | 本节点；真实外键存在与否归装配的测试（协议节点已登记） |
| 同进程并发不互卡、读写真并发（P-12） | C-4／C-7 的并发分支 | 未开始 | 本节点 |
| 方言切换（D-026「只改配置」） | `dialect-switch`：同一份调用代码、同一套套件，config 从 `sqlite` 换成 `postgres` 后全绿。**本程 pg 用例 `describe.skip`**，前提写「有一个可连的 pg ≥ 14」；**跳过不是通过** | 未开始（pg 部分本程不跑） | 本节点提供开关；跑 pg 归装配、第二程 |
| 错误码映射（[design.md 表](design.md#错误码映射表)） | `error-mapping.sqlite`：真库触发唯一（命名索引、主键）／外键（`DELETE`、`INSERT` 两向）／忙（异步重试超时）／已关闭，各断言映射类型、`kind`、`constraint`；`error-mapping.defect`：`NOT NULL`／`CHECK`／语法／未知列／读句柄上写 ⇒ `StorageDefect`，且写句柄上的 `SQLITE_READONLY` 仍是 `StorageUnavailable`（同码按句柄种类分型）；`error-mapping.postgres`：**用构造的 `pg` 错误对象**（`code`、`constraint`）测映射函数，不连库；`error-mapping.cause`：两型都带驱动原始错误 | 未开始 | 本节点 |
| 事务种类传到 Driver | `driver.transaction-kind`：`read` 走读句柄发 `BEGIN`、`write` 走写句柄发 `BEGIN IMMEDIATE`（拦截句柄上的语句断言） | 未开始 | 本节点；Kysely `setAccessMode` 是否可用**待核**后定实现 |
| 写句柄异步重试 | `driver.busy-retry-yields`：实例 A 持 `IMMEDIATE` 锁并 `await`，实例 B 发起写；断言 B 在 A 提交后成功，且 A 的 `await` 之后的语句确实在 B 等待期间执行了（时间戳交错） | 未开始 | 本节点；这条是 C-4 的机制级细化 |
| pg 逐语句 SAVEPOINT（P-2） | `driver.pg-savepoint`：拦截连接上的语句，断言写事务内每条语句前后有 `SAVEPOINT`／`RELEASE`，失败后有 `ROLLBACK TO`；**不连库** | 未开始 | 本节点 |
| 装卸配对（[design.md](design.md#成对的装载与撤除)） | `lifecycle.dispose-drains`：一个在途写事务未完成时 dispose，断言它按自己的提交收场（成立或无痕），新调用抛 `StorageUnavailable`，全部句柄最终关闭；`lifecycle.config-error-fails-load`：非法 config（含 `:memory:`）⇒ fiber `FAILED`、无 `storage` 服务；`lifecycle.open-failure-fails-load`：文件不可写 ⇒ 同 | 未开始 | 本节点。「抛出 ⇒ `FAILED` 且不 provide」本身由 kernel-basis probe `plugin-throw-fails-fiber.test.ts` 在 4.0.4 上核过；本节点这两条只证本插件在这些情形下确实抛 |
| 迁移在 `provide` 之前 | `lifecycle.migrations-before-provide`：config 带一个会失败的迁移 ⇒ 无 `storage` 服务；带一个建表迁移 ⇒ 消费者首次解析到 `storage` 时表已在 | 未开始 | 本节点 |
| 属主排他（tenancy-host U-2） | `upgrade.exclusive-owner`：**两个子进程**对同一文件各起一个开了守卫的实例——后起者以「被占」启动失败、库与快照都没被它碰；先起者被 `SIGKILL` 之后，后起者再起即成功（锁随进程释放，不需要人清理）；同进程第二个开了守卫的实例同样「被占」；不开守卫的实例不受影响（一致性套件照旧两实例同文件）。排他在此会红：去掉锁，后起者在先起者未确认时恢复它的快照 | 未开始 | 本节点；锁的承载方式待核后定 |
| R-U1 只读核对先于任何写 | `upgrade.preflight-refuses-before-write`：给一条返回 `ok: false` 的核对 ⇒ 启动失败、阶段「核对」、`detail` 原样；库的已提交内容（逐表）不变、没有快照、登记表没被建；核对里发写语句 ⇒ `StorageDefect`；核对抛出 ⇒ 同样「核对」阶段 | 未开始 | 本节点 |
| R-U2 迁移登记可读，读不到不当作空 | `upgrade.registry-read`：空库 ⇒ `appliedMigrations` 为空、`tables` 不含登记表；跑过两个迁移的库 ⇒ 两个名字按执行次序；读句柄在核对前被关（注入读失败）⇒ 启动失败、阶段「核对」、`cause` 是 `StorageUnavailable`，**不是**空序列放行 | 未开始 | 本节点 |
| R-U3 一致快照，含预写日志里的提交 | `upgrade.snapshot-consistent`：先提交一笔写且不做检查点（它只在预写日志里），再用多一个迁移的 provider 启动；在⑦之前截住，断言快照文件单独打开读得到那一笔；首次启动支：库文件不存在 ⇒ 打开之前已有「库不存在」标记 | 未开始 | 本节点；在线备份接口待核 |
| R-U4 确认之前的失败撤回升级 | `upgrade.restore-on-migration-failure`：第二个迁移失败 ⇒ 启动失败、阶段「迁移」且点名它；库的内容、登记与 schema 回到升级前，**附属文件里没有升级后的写**，快照已不在。`upgrade.restore-on-dispose`：迁移成功、`provide` 之后别的写入者提交一笔，不确认即撤除 ⇒ 库回到升级前，那一笔也不在；首次启动支：撤除之后库文件与两个附属文件都不存在 | 未开始 | 本节点 |
| R-U5 遗留快照先恢复 | `upgrade.leftover-restored`：子进程在⑥之后、⑦中、恢复的「删附属文件之后、替换之前」各被杀一次 ⇒ 下一次启动先恢复、再按升级前的库重走，最终库与只跑旧序列的库内容一致 | 未开始 | 本节点；真崩溃，用子进程 |
| R-U6 确认 | `upgrade.confirm`：确认之后快照不在、`pendingUpgrade` 为空；此后撤除不动库；没有快照时确认成功且无动作；pg 上确认无动作 | 未开始 | 本节点 |
| R-U7 pg 迁移一个事务 | `upgrade.pg-single-transaction`：第二个迁移失败 ⇒ 登记与 schema 都回到迁移前。**本程 `describe.skip`**，前提同 pg 套件；跳过不是通过 | 未开始（本程不跑） | 本节点提供开关；跑 pg 归装配 |
| R-U8 具名失败；恢复失败快照不删 | `upgrade.named-failures`：被占／恢复／核对／快照（快照目录只读）／迁移五个阶段各触发一次，断言类型是 `StorageStartupFailure`、阶段对、**不是** `StorageUnavailable`；恢复失败（库目录只读）⇒ 失败里带快照位置、快照仍在。`upgrade.dispose-restore-failure-visible`：撤除路径上让恢复失败 ⇒ `fiber.dispose()` 照常 resolve（basis 所言），`pendingUpgrade` 仍报快照与位置，有一条 error 记录 | 未开始 | 本节点 |
| `upgrade` 配置政策 | `lifecycle.upgrade-without-migrations-fails-load`：只给 `upgrade` 不给 `migrations` ⇒ fiber `FAILED`、无 `storage` 服务 | 未开始 | 本节点 |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| 2026-09-22 sqlite 一致性套件 | `packages/infra/storage-sql/tests/conformance.sqlite.spec.ts`：`describeStorageConformance('sqlite (node:sqlite)', () => openStorage({ dialect: 'sqlite', file }))`，临时文件库、WAL、两个提供者实例 | C-1a/b/c、C-2、C-2b、C-3、C-4、C-5、C-6a/b、C-7、C-7b、C-8、C-9a、C-9b、C-10、C-11、C-12、C-13、C-14、C-15 全部通过（18 个 `it`） | 终端输出（本行是主线转述，尚未登记 record/evidence run） |
| 2026-09-22 插件测试 | `tests/plugin.spec.ts`：迁移先跑再 provide、撤除后 `StorageUnavailable`、`:memory:` 拒绝 ⇒ 启动失败、迁移失败 ⇒ 启动失败、pg 配置形状被接受（不连接） | 4 条通过 | 终端输出（本行是主线转述，尚未登记 record/evidence run） |
| pg 一致性套件 | `tests/conformance.postgres.spec.ts`，需 `OMNE_TEST_PG_URL` | **未运行**（skipped） | — |

**有限检查不写成无条件证明。** 一致性套件在 sqlite 临时文件库、单主机、单进程、WAL 下成立；pg 那一半本程没有任何运行结果，design.md 里关于 pg 的每一行都是文档推断。

## 覆盖缺口

- **pg 方言零运行证据**：接线不跑是 D-026 的范围裁定；第一次跑 pg 前，锁等待超时、`23503` 分类、SAVEPOINT 往返、`pool.end()` 行为都没有证据。owner：装配，第二程。
- **P-11 反查未实现**：sqlite 下主键与唯一约束反查回约束名是实施项，实现前 C-2 主键那一支无结果。owner：本节点。
- **断电级持久**没有证据形式，且本版 `synchronous=NORMAL` 明确不给；R-4 只证到进程重启（跨进程重启归 AI S-32 演练）。
- **跨进程的锁竞争**（两个进程各起一个本插件）没有套件用例；本版单机，Q-8。
- **本节点自己的装卸测试全部未开始**；它们依赖的内核语义（basis 两条、kernel-basis 两条 probe）已在 4.0.4 上通过，不再是缺口。
- **升级守卫零实现、零证据**：`upgrade.*` 十一条与 `lifecycle.upgrade-without-migrations-fails-load` 全部未开始；挡住 tenancy-host 的 `assembly.upgrade-preflight-refuses`、`assembly.upgrade-restore-on-boot-failure`、`assembly.upgrade-crash-recovery`、`assembly.upgrade-confirmed`。owner：本节点。
- **pg 上迁移提交之后的撤回**没有机制、也就没有测试形式（tenancy-host 缺口 U-3）；闭合手段二选一见 [design.md 实施缺口](design.md#实施缺口与消费者影响)，定了之后加一条真演练。owner：本节点 + tenancy-host，第一次跑 pg 之前。
- **重跑时旧 disposer 与新插件体的先后**是待核对主张（交错 (d)）；核定前不写测试，两种答案都不静默。
- **给 tenancy-host 的一条前提**：「库文件逐字节不变」只在上一次是干净停机时成立，否则 sqlite 关句柄时的检查点会改写库文件的字节而不改内容；该节点 `assembly.upgrade-preflight-refuses` 的断言要带这条前提或改成按内容比对（[design.md](design.md#实施缺口与消费者影响)）。
- 与 [bindings.yaml](bindings.yaml) 一致：空表，本节点无契约条款可绑。
