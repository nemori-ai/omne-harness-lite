# storage

- kind：`provider`
- 对象与设计修订：候选节点，2026-09-22 首稿。**不兑现任何契约条款**；它的规格是两个 tenancy 节点写下的对存储提供者的要求清单——[account-identity R-1～R-7](../../tenancy/account-identity/design.md#对存储提供者的要求清单)与[organization-governance R-1～R-6](../../tenancy/organization-governance/design.md#对存储提供者的要求清单)（两份设计由 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/README.md) 接受为实现路径）——加 [D-026](../../../../record/decisions/infrastructure-persistence-choices/README.md) 的四条基础设施选择
- 源码位置：`packages/core/storage`——已建包（2026-09-22）：`src/protocol.ts`、`src/errors.ts`、`src/map.ts`、`src/conformance/index.ts`（子路径 `./conformance`）；**2026-09-23 加**：`src/migration.ts`（`MigrationFragment`：owner 导出、装配合成，[tenancy-host「迁移由 owner 导出片段」](../../../apps/tenancy-host/design.md#存储装配迁移由-owner-导出片段本节点合成)）与 `src/preflight.ts`（`PreflightInput`／`PreflightResult`／`PreflightCheck`：[storage-sql「迁移前只读核对」](../../infra/storage-sql/design.md#迁移前只读核对)的核对函数形状，clock 与入口层据此对接、不 import storage-sql——那节「共用类型放不放 core/storage 不由本节点定」由主线在阶段 2 开工时定为放这里）。归 `core`：它是一个**协议级构造**（存储协议的接口、错误类型、锁语义）加一套任何提供者都必须通过的一致性测试，没有领域事实，被 `tenancy` 两个持事实节点、`infra/clock` 与 `infra/storage-sql` 消费（[两层布局](../../../README.md#packages-的两层布局)）
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——协议没有生命周期、不拥有连接、不 provide 任何服务；候选服务名 `storage` 的**实例**由 `infra/storage-sql`（候选组名，D-026 未拍板）的插件 provide。本节点拥有四样：`Storage`／`ReadTx`／`WriteTx`／`StorageInstance` 接口与**四型失败**（`StorageUnavailable` 只收瞬时、`UniqueViolation`、`ReferenceViolation`、`StorageDefect` 收缺陷）的形状与语义、两种方言下锁语义的**协议解释**、`mapStorageError`（只折 `StorageUnavailable`，错误类型的 owner 拥有映射）、`describeStorageConformance` 一致性套件。**表结构不在协议里**：各节点的表由装配层的迁移建立，两个 tenancy 节点的表须落在同一存储、同一约束域（[design.md](design.md#表结构不在协议里由装配层迁移建立两节点同一约束域)）

## 分层状态

- 语义接受范围：**无契约条款。**本节点不是任何 `data.*`／`capability.*`／`composition.*` 契约的提供者；它兑现的是两份已接受节点设计里的要求清单（AI R-1～R-7、OG R-1～R-6）与 D-026 的选择。要求清单的语义归那两个节点，本节点不改写它们的任何一条
- 可实施范围：**已建包。**协议接口、四型失败与 `mapStorageError`（[design.md「协议」](design.md#协议候选形状)）、每条 R 在协议上的兑现点与提供者义务 P-1～P-12（[要求→协议→测试表](design.md#要求到协议再到会红的测试)）、一致性套件 17 个用例（C-1a/b～C-14）。**不给出**：任何提供者实现（`infra/storage-sql` 另一节点，尚未建包）、任何表结构与迁移（装配）、嵌套调用的用例、跨进程形态下的存储协调协议
- 绑定与证据：[`bindings.yaml`](bindings.yaml) 为**空表**——没有契约条款可绑；本包的测试与套件都不是对某条契约的证据。一致性套件的通过是**提供者节点**的证据（它跑套件），不是本节点的绑定；每条用例的义务登记在 [verification.md](verification.md)
- 实际验证：**只有本包自己的单元与类型测试跑过**——2026-09-22：typecheck 通过，`vitest run` 5／5（`mapStorageError` 3 条 + 协议类型 2 条），尚未登记 record/evidence run。**一致性套件零运行**：没有提供者可跑，P-1～P-12 一条也没被证（[verification.md](verification.md#实际执行)）

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 协议长什么样、每条 R 靠协议里的哪个方法或错误类型兑现、两种方言下锁语义怎么解释、一致性套件哪条测试会红 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持、前提是什么 | [绑定表](bindings.yaml)（当前为空） |
| 一致性套件要证什么、实际跑过什么、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
