# storage-sql 验证与证据

本节点不兑现契约条款，义务来自三处：[`core/storage` 一致性套件](../../core/storage/design.md#要求到协议再到会红的测试)的每一条用例（套件归那个节点，**在本提供者上跑**归本节点）、方言切换、错误码映射。
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
- 与 [bindings.yaml](bindings.yaml) 一致：空表，本节点无契约条款可绑。
