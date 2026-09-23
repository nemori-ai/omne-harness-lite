# storage 验证与证据

本节点没有契约侧的证据义务权威；义务从两份要求清单（[AI R-1～R-7](../../tenancy/account-identity/design.md#对存储提供者的要求清单)、[OG R-1～R-6](../../tenancy/organization-governance/design.md#对存储提供者的要求清单)）
与本节点声称的范围（协议语义 P-1～P-12）产生。**每条 R 的证据形式都是一致性套件里的一条测试**，由提供者在自己的测试里跑；
本页登记「套件要证什么」，提供者节点登记「跑了、结果如何」。测试编号与会红条件的正文在 [design.md](design.md#要求到协议再到会红的测试)；用例源码在 `packages/core/storage/src/conformance/index.ts`。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| AI R-1／OG R-1（P-1） | C-1a/C-1b 抛出即全无且调用方异常同一实例穿过 `write`；C-1c 提交后行在、返回值透传 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，`C-1a/C-1b`、`C-1c` 都通过） | `infra/storage-sql` 在 sqlite 临时文件库上跑绿（批 B） |
| AI R-2／OG R-2（P-11） | C-2 命名唯一索引冲突 ⇒ `UniqueViolation`，`constraint` 等于迁移里的名字 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上 |
| AI R-2「提交内重读」（P-2） | C-3 冲突后同一 `tx` 重读、再写、提交成功 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上 |
| AI R-2 + R-3 空行并发创建 | C-13 两实例并发创建同一唯一键，恰一个走插入路、库里恰一行，两事务都提交 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上。**真并发**：两个独立连接，读写之间 `await` 让出 |
| AI R-3 后半／OG R-3a（P-4） | C-4 两实例 `lockRow` 同一行的读-改-写并发，终值 +2，无一方 `StorageUnavailable` | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上。**这是 R-3 行锁的唯一直接实证**；AI S-43 第 2 支与 OG S-48 的演练在它之上 |
| OG R-3b（P-5） | C-5 同 C-4 但只用 `lockSentinel` | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上 |
| AI R-3 前半／OG R-3c（P-3） | C-6a/C-6b 后开始的事务读到先提交的写；事务内读到自己的写 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上 |
| OG R-3d（P-6） | C-7 只读事务两次读夹着一次**已完成**的并发提交，两次读相同、结束后可见 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上。sqlite 下要求提供者为读开独立连接 |
| AI R-4／OG R-4（P-7） | C-8 写入 → 关闭 → 重开 ⇒ 仍在 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上。**跨进程重启不在套件**，归 AI S-32 演练（装配） |
| AI R-5／OG R-5（P-8 瞬时那一半） | C-9a 关闭后调用 ⇒ `StorageUnavailable`；C-9b 在途写事务期间从另一异步任务 `close()` 本实例 ⇒ 完整提交或 `StorageUnavailable`、绝无部分提交、之后不再受理 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上 |
| R-5 的反面（P-8 缺陷那一半） | C-7b 只读事务里写 ⇒ `StorageDefect` 且库无变化；C-14 非法语句 ⇒ `StorageDefect` 带 `cause`，违反 `CHECK` ⇒ `StorageDefect` | **已通过**（run `2026-09-23-tests-tenancy-leg-2`，sqlite 与 pg 两侧）：套件 `C-7b`、`C-14`；本行点名缺的嵌套调用现有 `C-15 嵌套调用 ⇒ StorageDefect…`，同样两侧通过 | 同上。**嵌套调用 ⇒ `StorageDefect`** 无用例，本节点补 |
| AI R-6（P-9） | C-10 删后同值再插成功 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上 |
| AI R-7／OG R-6 删除受限向（P-10） | C-11 有子行时删父行 ⇒ `delete-restricted`，父行仍在 | **部分**（run `2026-09-23-tests-tenancy-leg-2`）：套件 `C-11` 在 sqlite 与 pg 两侧通过；本行要求的「`foreign_keys` 关着时红」的负向运行套件里没有——装配一侧有 `apps/tenancy-host/tests/migrations.spec.ts` › `assembly.fk-organization-owner-account…` 的 ③ 负向运行（真实外键上，通过） | 同上。**sqlite 下必须在 `foreign_keys` 关着时红**——提供者的测试要包含一次故意关掉的负向运行，否则这条测试证不了它在守 |
| OG R-6 缺失目标向（P-10） | C-12 插子行指向不存在的父 ⇒ `missing-target` | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上 |
| P-12 进程内并发不互卡 | 由 C-4／C-5／C-13 的「无一方 `StorageUnavailable`」断言覆盖，不另立用例 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上 |
| `mapStorageError` 只折 `StorageUnavailable` | 单元测试 `tests/errors.spec.ts`：`StorageUnavailable` ⇒ 调用方给的字面；`StorageDefect`／`UniqueViolation`／`ReferenceViolation`／调用方错误 ⇒ **同一实例**重抛；四型各有稳定 `name` 与 `cause` 通道 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`）：`errors.spec.ts` › `mapStorageError 只折 StorageUnavailable`（3 条） | — |
| 协议面形状 | 类型测试 `tests/types.spec-d.ts`：`ReferenceViolationKind` 恰两向；`Storage` 恰 `read`／`write`；`WriteTx` 恰 `db`／`lockRow`／`lockSentinel` | **已通过**（同 run）：`types.spec-d.ts` › `storage 协议类型`（2 条）；另 `MigrationFragment 与 PreflightCheck 的形状`（2 条） | — |
| 套件自身 | 一条「套件对一个故意做错的提供者会红」的自测（例如把 `lockRow` 换成空操作跑 C-4）；没有它，「套件全绿」证不了套件在看 | **无证据**：同 run 里没有把 `lockRow` 换成空操作一类的自测用例 | 本节点 |

**受阻项**：无。原先的「C-1～C-14 依赖 `infra/storage-sql` 的 sqlite 实现存在」已不成立，套件在该提供者的两种方言上都跑过。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| 2026-09-22 · `@omne-harness-lite/storage` 的 `typecheck` 与 `test` 脚本（`tsc -p tsconfig.test.json`；`vitest run`，含类型测试） | Kysely 0.29.6、vitest 4.1.11（catalog）；`tests/errors.spec.ts` 3 条 + `tests/types.spec-d.ts` 2 条。**不含一致性套件**——它只在提供者调用时执行 | **通过**：5／5，无类型错误 | **尚未登记为 record/evidence run**——本行是转述 |
| [`2026-09-23-tests-tenancy-leg-2`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md) · 本包 | 源码提交 `c9b5850`；`tests/errors.spec.ts`、`tests/migration.spec.ts`、`tests/types.spec-d.ts`；Node v24.18.0、vitest 4.1.11，单进程。**不含一致性套件** | build、typecheck 退出 0；9 条用例 **9 通过**、0 跳过、0 失败（类型测试 4 条，无类型错误） | [`output/storage.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/storage.log)、[`json/storage.json`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/json/storage.json) |
| 同 run · 一致性套件在 `infra/storage-sql` 上（sqlite） | `packages/infra/storage-sql/tests/conformance.sqlite.spec.ts`，describe `storage conformance · sqlite (node:sqlite)`：sqlite 临时文件库、WAL，两个提供者实例指向同一文件（`upgrade: false` 夹具），`node:sqlite` 的 SQLite 3.53.1 | 19 条（C-1a/b、C-1c、C-2、C-2b、C-3、C-4、C-5、C-6a/b、C-7、C-7b、C-8、C-9a、C-9b、C-10、C-11、C-12、C-13、C-14、C-15）**全部通过**；同文件的 pg 占位 1 条跳过（缺 `OMNE_TEST_PG_URL`） | [`output/storage-sql.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/storage-sql.log)、[`json/storage-sql.json`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/json/storage-sql.json) |
| 同 run · 一致性套件在 `infra/storage-sql` 上（pg） | `conformance.postgres.spec.ts`，describe `storage conformance · postgres`：临时容器 PostgreSQL **16.14**，新建空库 `w4a_conformance`，单主机 | 同名 19 条**全部通过** | [`output-pg/storage-sql.conformance.postgres.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output-pg/storage-sql.conformance.postgres.log)、[`json-pg/storage-sql.conformance.postgres.json`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/json-pg/storage-sql.conformance.postgres.json)；义务对应 [`coverage.md`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/coverage.md#packagescorestorage) |

**有限检查不写成无条件证明。**套件的结果只对「跑套件的那个提供者（`infra/storage-sql`）+ 那个方言 + 那次配置」成立：sqlite 一侧是临时文件库、WAL、单主机单进程；pg 一侧只有 16.14 一个版本，没有跑「≥ 14」的下限。每种方言单次运行，真并发用例的交错取决于那一次的调度，通过一次不说明每种交错都被走到。**通过不提升本节点或任何契约的接受状态。**

## 覆盖缺口

按上面这次 run 的对应清单，本节点还缺的证据：

- **套件自身「对故意做错的提供者会红」没有自测**：没有把 `lockRow` 换成空操作一类的用例，「套件全绿」证不了套件在看。owner：本节点。
- **C-11 的负向运行不在套件里**：「`foreign_keys` 关着时红」这一支套件没有；装配一侧 `apps/tenancy-host` 的 `assembly.fk-organization-owner-account` ③ 在真实外键上做了负向运行（同 run 通过），它证的是那条外键，不证套件对任意提供者都会红。owner：本节点（套件自测）。

其余不在本节点证据范围内的：

- **跨进程重启的持久**（R-4 全貌）：套件只到「关闭句柄后仍在」；进程级重启归 [AI S-32](../../tenancy/account-identity/verification.md#证据义务)（同 run 在 `apps/tenancy-host` 的 `process.spec.ts` 里有另起 Node 进程的一条）。
- **pg 版本下限**：只跑了 16.14；「pg ≥ 14」没有证据。owner：装配。
- **`synchronous=NORMAL` 的断电边界**：WAL 下可能丢最后一段已提交事务；这是开发期 sqlite 的已知边界，不做测试（无可复现的断电夹具），生产期 pg 不受此限。
- **两条跨 owner 交错**（激活 vs 清除、创建个人组织 vs 清除）不在本节点演练——套件证的是原语，交错的收场归 [AI S-43 第 2 支](../../tenancy/account-identity/verification.md#证据义务)那次三节点共同的真并发演练（同 run 在 `account-registration` 的 `interleavings.spec.ts` 里）。
- 与 [bindings.yaml](bindings.yaml) 一致：空表，无契约条款——协议语义 P-1～P-12 与 R 清单不是契约坐标，证据登记在本页与 `infra/storage-sql` 的 verification。
