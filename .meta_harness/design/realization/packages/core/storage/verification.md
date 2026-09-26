# storage 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：已接受的独立内核／存储协议映射；没有独立数据契约坐标；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/storage` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**9 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 5 项 core-local、2 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

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
| R-5 的反面（P-8 缺陷那一半） | C-7b 只读事务里写 ⇒ `StorageDefect` 且库无变化；C-14 非法语句 ⇒ `StorageDefect` 带 `cause`，违反 `CHECK` ⇒ `StorageDefect` | **已通过**（run `2026-09-23-tests-tenancy-leg-2`，sqlite 与 pg 两侧）：套件 `C-7b`、`C-14`；本行点名缺的嵌套调用现有 `C-15 嵌套调用 ⇒ StorageDefect…`，同样两侧通过 | 同上。C-15 已在历史两方言与本次真实 SQLite 运行通过；无新增缺口 |
| AI R-6（P-9） | C-10 删后同值再插成功 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上 |
| AI R-7／OG R-6 删除受限向（P-10） | C-11 有子行时删父行 ⇒ `delete-restricted`，父行仍在 | **本次正反两向已验证**：[正常19/19](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/storage-hub/enabled-UATxGq/report.json)，[关闭外键后 C-11/C-12 目标断言失败](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/storage-hub/disabled-xzINMp/report.json)。历史 pg 结果保留，未在本次重跑；真实租户外键仍归装配 | 同上。**sqlite 下必须在 `foreign_keys` 关着时红**——提供者的测试要包含一次故意关掉的负向运行，否则这条测试证不了它在守 |
| OG R-6 缺失目标向（P-10） | C-12 插子行指向不存在的父 ⇒ `missing-target` | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上 |
| P-12 进程内并发不互卡 | 由 C-4／C-5／C-13 的「无一方 `StorageUnavailable`」断言覆盖，不另立用例 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`；套件在 `infra/storage-sql` 上 sqlite 与 pg 两侧各跑一遍，同名用例都通过） | 同上 |
| `mapStorageError` 只折 `StorageUnavailable` | 单元测试 `tests/errors.spec.ts`：`StorageUnavailable` ⇒ 调用方给的字面；`StorageDefect`／`UniqueViolation`／`ReferenceViolation`／调用方错误 ⇒ **同一实例**重抛；四型各有稳定 `name` 与 `cause` 通道 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`）：`errors.spec.ts` › `mapStorageError 只折 StorageUnavailable`（3 条） | — |
| 协议面形状 | 类型测试 `tests/types.spec-d.ts`：`ReferenceViolationKind` 恰两向；`Storage` 恰 `read`／`write`；`WriteTx` 恰 `db`／`lockRow`／`lockSentinel` | **已通过**（同 run）：`types.spec-d.ts` › `storage 协议类型`（2 条）；另 `MigrationFragment 与 PreflightCheck 的形状`（2 条） | — |
| 套件自身 | 一条「套件对一个故意做错的提供者会红」的自测（例如把 `lockRow` 换成空操作跑 C-4）；没有它，「套件全绿」证不了套件在看 | **本次有代表性真实错误的自测**：[HUB外层2/2](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-storage-hub.log)，外键关闭且读回确认，完整套件仅 C-11/C-12 因目标断言失败；不声称检查任意错误提供者 | 本节点 |

**受阻项**：无。原先的「C-1～C-14 依赖 `infra/storage-sql` 的 sqlite 实现存在」已不成立，套件在该提供者的两种方言上都跑过。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| 2026-09-22 · `@omne-harness-lite/storage` 的 `typecheck` 与 `test` 脚本（`tsc -p tsconfig.test.json`；`vitest run`，含类型测试） | Kysely 0.29.6、vitest 4.1.11（catalog）；`tests/errors.spec.ts` 3 条 + `tests/types.spec-d.ts` 2 条。**不含一致性套件**——它只在提供者调用时执行 | **通过**：5／5，无类型错误 | **尚未登记为 record/evidence run**——本行是转述 |
| [`2026-09-23-tests-tenancy-leg-2`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md) · 本包 | 源码提交 `c9b5850`；`tests/errors.spec.ts`、`tests/migration.spec.ts`、`tests/types.spec-d.ts`；Node v24.18.0、vitest 4.1.11，单进程。**不含一致性套件** | build、typecheck 退出 0；9 条用例 **9 通过**、0 跳过、0 失败（类型测试 4 条，无类型错误） | [`output/storage.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/storage.log)、[`json/storage.json`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/json/storage.json) |
| 同 run · 一致性套件在 `infra/storage-sql` 上（sqlite） | `packages/infra/storage-sql/tests/conformance.sqlite.spec.ts`，describe `storage conformance · sqlite (node:sqlite)`：sqlite 临时文件库、WAL，两个提供者实例指向同一文件（`upgrade: false` 夹具），`node:sqlite` 的 SQLite 3.53.1 | 19 条（C-1a/b、C-1c、C-2、C-2b、C-3、C-4、C-5、C-6a/b、C-7、C-7b、C-8、C-9a、C-9b、C-10、C-11、C-12、C-13、C-14、C-15）**全部通过**；同文件的 pg 占位 1 条跳过（缺 `OMNE_TEST_PG_URL`） | [`output/storage-sql.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output/storage-sql.log)、[`json/storage-sql.json`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/json/storage-sql.json) |
| 同 run · 一致性套件在 `infra/storage-sql` 上（pg） | `conformance.postgres.spec.ts`，describe `storage conformance · postgres`：临时容器 PostgreSQL **16.14**，新建空库 `w4a_conformance`，单主机 | 同名 19 条**全部通过** | [`output-pg/storage-sql.conformance.postgres.log`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/output-pg/storage-sql.conformance.postgres.log)、[`json-pg/storage-sql.conformance.postgres.json`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/json-pg/storage-sql.conformance.postgres.json)；义务对应 [`coverage.md`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/coverage.md#packagescorestorage) |

**有限检查不写成无条件证明。**套件的结果只对「跑套件的那个提供者（`infra/storage-sql`）+ 那个方言 + 那次配置」成立：sqlite 一侧是临时文件库、WAL、单主机单进程；pg 一侧只有 16.14 一个版本，没有跑「≥ 14」的下限。每种方言单次运行，真并发用例的交错取决于那一次的调度，通过一次不说明每种交错都被走到。**通过不提升本节点或任何契约的接受状态。**

## 本次追加验证（2026-09-26）

开发工具提交 `247fc9e2`，HUB 开始 `cdcc58ab`、运行期间至 `c51146ba`；根配置在期间有变，产品与 fixture 字节未变，起止配置分别保存。
正常子进程 [19/19](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/storage-hub/enabled-UATxGq/report.json)，故障子进程 [17通过、仅C-11/C-12失败](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/storage-hub/disabled-xzINMp/report.json)，
外层 [有效性自测2/2](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/hub/w1-storage-hub.log)、build／typecheck 均退出 0。
真实公开 openStorage／SqlStorage／NodeSqliteDriver、Node24.18.0／SQLite3.53.1／Kysely0.29.6／Vitest4.1.11、临时文件WAL、单主机；
两子进程 execution.json 保存参数、版本、信号和超时；失败均为预期 ReferenceViolation 却收到 undefined 的真实断言失败，不由普通非零退出推导有效性。
父测试删除私有临时数据库但保留日志；工具侧消费公开 core 与 infra 入口，不引入 core 反依赖 infra。
**原 spoke ignored 日志丢失**，本次只引用完整保留且 hash 核对的 HUB 原件；源码247fc9e2仍完整。
[完整来源说明](../../../../record/evidence/2026-09-26-tests-core-foundation/README.md)、[逐项覆盖](../../../../record/evidence/2026-09-26-tests-core-foundation/coverage.md#packagescorestorage)。
本次 foundation HUB 对本包 build／typecheck 通过，但未新跑包内 runtime 测试；包内9条与pg两侧维持历史 run 的范围，未伪称本次重跑。

## 公开消费者追加验证（2026-09-26）

`w1.storage.exception-dependencies`、`w1.storage.public-migrations` 两项通过：只映射 StorageUnavailable，其他三类与调用方值同一实例重抛；有序命名迁移保留函数引用、同名拒绝。`w1.types.storage.protocol-and-preflight` 核读 Tx 没有写锁与具名失败预检形状。没有以形状测试证明真实装配迁移或预检运行。

`w1.consumer.adopted-dependency-exceptions` 核 root source／声明的 Kysely 类型依赖与 root JS 无外部运行时依赖，批准 conformance JS 只含 Kysely／Vitest；按 `e6c9d66a` 精确映射采用，worker 9 通过1失败原文没有抹去。真实 SQLite/WAL 同一套件另重跑正常19/19，关闭实际写连接外键并读回后17通过、仅 C-11/C-12 目标失败，外层有效性自测2/2。只说明这个提供者与一次配置，不声称 pg、实际租户外键、跨进程重启、断电或所有错误提供者保证；这些责任沿原 owner 保留。

原始 [正常 Node report](../../../../record/evidence/2026-09-26-tests-core-public/raw/hub/tmp__w1-public-consumers__normal-afySRP__report.json)、[负向 report](../../../../record/evidence/2026-09-26-tests-core-public/raw/hub/tmp__w1-public-consumers__negative-WagReR__report.json)、[HUB build／typecheck／12/12 log](../../../../record/evidence/2026-09-26-tests-core-public/raw/hub/tmp__core-delivery__w1-public-consumers-hub.log)、[逐项条款对应](../../../../record/evidence/2026-09-26-tests-core-public/coverage.md)与[实际源码／配置／环境](../../../../record/evidence/2026-09-26-tests-core-public/README.md)分别保留。工具源码5140574b，HUB起点e0b6c212加当时未提交且与dc431fdf同字节的lock；期间文档提交不改变本轮产品／工具／配置。子场景不叠加进外层测试数，六组类型只覆盖具体断言。测试通过不提升语义接受或用户最终接受。

## 覆盖缺口

按上面这次 run 的对应清单，本节点还缺的证据：

- **代表性错误的自测已经有证据**：[完整负向原结果](../../../../record/evidence/2026-09-26-tests-core-foundation/raw/storage-hub/disabled-xzINMp/report.json) 中 C-11/C-12 红、其余17通过。它证明外键关闭错误被发现，不证明全部错误都会红；没有新增 lockRow 无操作变异。
- **C-11/C-12 的外键关闭负向义务已补**：测试侧在实际写连接、事务前关闭并读回确认，复用同一完整套件；只支持该真实 SQLite 提供者与本次配置。真实账号／组织外键是否存在仍由装配另证。

其余不在本节点证据范围内的：

- **跨进程重启的持久**（R-4 全貌）：套件只到「关闭句柄后仍在」；进程级重启归 [AI S-32](../../tenancy/account-identity/verification.md#证据义务)（同 run 在 `apps/tenancy-host` 的 `process.spec.ts` 里有另起 Node 进程的一条）。
- **pg 版本下限**：只跑了 16.14；「pg ≥ 14」没有证据。owner：装配。
- **`synchronous=NORMAL` 的断电边界**：WAL 下可能丢最后一段已提交事务；这是开发期 sqlite 的已知边界，不做测试（无可复现的断电夹具），生产期 pg 不受此限。
- **两条跨 owner 交错**（激活 vs 清除、创建个人组织 vs 清除）不在本节点演练——套件证的是原语，交错的收场归 [AI S-43 第 2 支](../../tenancy/account-identity/verification.md#证据义务)那次三节点共同的真并发演练（同 run 在 `account-registration` 的 `interleavings.spec.ts` 里）。
- 与 [bindings.yaml](bindings.yaml) 一致：空表，无契约条款——协议语义 P-1～P-12 与 R 清单不是契约坐标，证据登记在本页与 `infra/storage-sql` 的 verification。

## P-13 显式单元 · 2026-09-24

[实际证据](../../../../record/evidence/2026-09-24-tests-storage-unit/README.md)：macOS存储全套110通过/4个PG跳过、core9通过、补充通知2通过、中心启动升级38通过；Linux实际构建产物8组冒烟。包括真实SQL回滚/排空和P-2边界，不代表完整领域参与面。ALS/通知/裸句柄范围见设计；物理故障及PG新组合未验。


## 2026-09-26 D055/D056 实际维护验证

[固定源码、制品和运行证据](../../../../record/evidence/2026-09-26-tests-governance-maintenance/README.md)保存原始故障、修正、源码回归及独立制品 QA。SQLite资源关闭/worker真实退出/跨进程保锁、封装与发布unknown、HT3与host信号/双槽、非root Linux systemd及近1GiB时的员工访问和租约续约分别验证。最终host r3运行字节与r1相同，文档和pnpm生成元数据差异经独立核验，r3再跑38项主旅程。没有实际断电/任意存储设备保证；独立QA的源变动精确分支未验，不计通过；恢复只隔离，整机损毁灾备与安全重新开放仍未交付。


## 2026-09-26 终审修补与最终制品

[最终固定输入、运行与独立QA](../../../../record/evidence/2026-09-26-tests-governance-review-fixes/README.md)接续D055/D056与D057：生产闭包移除测试运行器，初始化未收场责任与叠加故障诊断修复，领域契约不变。18成员最终合并1926通过/34跳过，host最终单独重跑；两包清单、严格独立类型消费、47项独立制品旅程及真实首启故障恢复、三组跨OS与systemd通过。最终host r3、CLI r2的SHA/BUILD_ID在该run；旧记录不提升到新制品。Fable三轮及主线处置均有公开记录，未发现本期阻断。

限定：首次工作根创建须串行；原位源变动精确hash/fstat分支未独立验到；TUI仍限D054 profile，不是任意终端支持；恢复只隔离，同机备份不覆盖整机/磁盘毁损。公司实际部署、Agent工作会话与Web/desktop不属于本次验证。
