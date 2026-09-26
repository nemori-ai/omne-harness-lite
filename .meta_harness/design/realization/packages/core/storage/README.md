# storage

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：已接受的独立内核／存储协议映射；没有独立数据契约坐标；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/storage` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**9 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 5 项 core-local、2 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

- kind：`provider`
- 对象与设计修订：状态 `implemented`（源码修订 HUB `c9b5850`），2026-09-22 首稿。**不兑现任何契约条款**；它的规格是两个 tenancy 节点写下的对存储提供者的要求清单——[account-identity R-1～R-7](../../tenancy/account-identity/design.md#对存储提供者的要求清单)与[organization-governance R-1～R-6](../../tenancy/organization-governance/design.md#对存储提供者的要求清单)（两份设计由 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/README.md) 接受为实现路径）——加 [D-026](../../../../record/decisions/infrastructure-persistence-choices/README.md) 的四条基础设施选择
- 源码位置：`packages/core/storage`——**已实现（HUB `c9b5850`）**：`src/protocol.ts`、`src/errors.ts`、`src/map.ts`、`src/migration.ts`（`MigrationFragment`、`composeMigrations`、`composedMigrationName`：owner 导出片段、装配合成，[tenancy-host「迁移由 owner 导出片段」](../../../apps/tenancy-host/design.md#存储装配迁移由-owner-导出片段本节点合成)）、`src/preflight.ts`（`PreflightInput`／`PreflightResult`／`PreflightCheck`：[storage-sql「迁移前只读核对」](../../infra/storage-sql/design.md#迁移前只读核对)的核对函数形状，clock 与入口层据此对接、不 import storage-sql）、`src/conformance/index.ts`（子路径 `./conformance`）。归 `core`：它是一个**协议级构造**（存储协议的接口、错误类型、锁语义）加一套任何提供者都必须通过的一致性测试，没有领域事实，被 `tenancy` 两个持事实节点、`infra/clock` 与 `infra/storage-sql` 消费（[两层布局](../../../README.md#packages-的两层布局)）
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——协议没有生命周期、不拥有连接、不 provide 任何服务；服务名 `storage` 的**实例**由 `infra/storage-sql`（组名由 [D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md) 拍板）的插件 `storageSqlPlugin` provide。本节点拥有四样：`Storage`／`ReadTx`／`WriteTx`／`StorageInstance` 接口与**四型失败**（`StorageUnavailable` 只收瞬时、`UniqueViolation`、`ReferenceViolation`、`StorageDefect` 收缺陷）的形状与语义、两种方言下锁语义的**协议解释**、`mapStorageError`（只折 `StorageUnavailable`，错误类型的 owner 拥有映射）、`describeStorageConformance` 一致性套件。**表结构不在协议里**：各节点的表由装配层的迁移建立，两个 tenancy 节点的表须落在同一存储、同一约束域（[design.md](design.md#表结构不在协议里由装配层迁移建立两节点同一约束域)）

## 分层状态

- 语义接受范围：**无契约条款。**本节点不是任何 `data.*`／`capability.*`／`composition.*` 契约的提供者；它兑现的是两份已接受节点设计里的要求清单（AI R-1～R-7、OG R-1～R-6）与 D-026 的选择。要求清单的语义归那两个节点，本节点不改写它们的任何一条
- 可实施范围：**已实现（HUB `c9b5850`）。**协议接口、四型失败与 `mapStorageError`（[design.md「协议」](design.md#协议)）、每条 R 在协议上的兑现点与提供者义务 P-1～P-12（[要求→协议→测试表](design.md#要求到协议再到会红的测试)）、一致性套件 19 个用例（C-1a/b～C-15，含 C-2b 主键支与 C-15 嵌套调用）、迁移片段与迁移前核对的共用形状（[design.md](design.md#迁移片段与迁移前核对的共用形状)）。**不给出**：任何提供者实现（归 [`infra/storage-sql`](../../infra/storage-sql/README.md)）、任何表结构与迁移（各 owner 导出片段、装配合成）、跨进程形态下的存储协调协议
- 绑定与证据：[`bindings.yaml`](bindings.yaml) 为**空表**——没有契约条款可绑；本包的测试与套件都不是对某条契约的证据。一致性套件的通过是**提供者节点**的证据（它跑套件），不是本节点的绑定；每条用例的义务登记在 [verification.md](verification.md)
- 实际验证：运行 [`2026-09-26-tests-core-foundation`](../../../../record/evidence/2026-09-26-tests-core-foundation/README.md)：开发工具 `247fc9e2` 在 HUB 的真实 SQLite 套件正常 **19/19**；关闭外键后 **17 通过、仅 C-11/C-12 失败**，外层有效性自测 **2/2**。记录的是完整保留的 HUB 运行，原 spoke ignored 日志丢失，未用摘要冒充原件。本次不复跑 pg、包内 runtime 测试或跨进程持久；各项与历史证据见 [verification.md](verification.md#本次追加验证2026-09-26)

- 本轮公开验证：另见 [`2026-09-26-tests-core-public`](../../../../record/evidence/2026-09-26-tests-core-public/README.md)：错误映射／有序迁移两项子场景、协议／只读预检类型组、批准依赖图及真实 SQLite 套件正反复验，同一 HUB 外层12/12、零跳过；按本节点 [公开追加验证](verification.md#公开消费者追加验证2026-09-26) 的条款与边界读取。具名类型完整名单与三个 opaque 品牌互赋负例尚待后续实际运行；本轮不提升整体完成或最终接受。

## 按当前问题展开

| 当前问题                                                                                                | 阅读入口                            |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 协议长什么样、每条 R 靠协议里的哪个方法或错误类型兑现、两种方言下锁语义怎么解释、一致性套件哪条测试会红 | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么                                                                      | [绑定表](bindings.yaml)（当前为空） |
| 一致性套件要证什么、实际跑过什么、还缺什么                                                              | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。

## D-040 的显式共同事务增量

P-13 绑定经独立评审后进入实现：AtomicStorage扩展保持普通Storage不变；单元只是AI3共同提交的基础条件，不代表领域/入口已迁移。本批已实现、未提交；P-13独立符合性及Linux冒烟结果见verification，既有历史结果不改范围。

D055/D056 已采用并实施的维护提供者精化：[maintenance](maintenance.md)。

D056已采用[维护run调用方资源补全](../../../../record/decisions/governance-maintenance-resources-adoption/README.md)，精确提供者修订见决定；实现已完成；实际验证与边界见[维护运行证据](../../../../record/evidence/2026-09-26-tests-governance-maintenance/README.md)。


## 2026-09-26 终审修补与最终制品

[最终固定输入、运行与独立QA](../../../../record/evidence/2026-09-26-tests-governance-review-fixes/README.md)接续D055/D056与D057：生产闭包移除测试运行器，初始化未收场责任与叠加故障诊断修复，领域契约不变。18成员最终合并1926通过/34跳过，host最终单独重跑；两包清单、严格独立类型消费、47项独立制品旅程及真实首启故障恢复、三组跨OS与systemd通过。最终host r3、CLI r2的SHA/BUILD_ID在该run；旧记录不提升到新制品。Fable三轮及主线处置均有公开记录，未发现本期阻断。

限定：首次工作根创建须串行；原位源变动精确hash/fstat分支未独立验到；TUI仍限D054 profile，不是任意终端支持；恢复只隔离，同机备份不覆盖整机/磁盘毁损。公司实际部署、Agent工作会话与Web/desktop不属于本次验证。
