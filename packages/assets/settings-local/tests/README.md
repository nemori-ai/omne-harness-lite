# Settings local 测试

本目录验证持久化协议、终态恢复、Identity 协调、独立目标权威与目录捕获。SQLite 事务和 Worker 使用真实公开提供者。测试内的 target guard 夹具与真实目标拥有者必须分别解读，不能把任一局部通过称为全部系统集成。

## 执行入口

在仓库根目录执行。先构建包和所需 workspace 依赖，保证 Worker 导入的 `dist` 与待测源码一致。已有依赖构建可直接运行本包命令：

```sh
pnpm --filter @omne-harness/settings-local run build
pnpm --filter @omne-harness/settings-local run typecheck
pnpm --filter @omne-harness/settings-local run test:fast
```

工作树尚未构建依赖时，先执行依赖构建：

```sh
pnpm --filter @omne-harness/settings-local... run build
```

只运行真实 Identity、独立拥有者和目录场景：

```sh
pnpm --filter @omne-harness/settings-local exec vitest run --mode fast tests/identity.spec.ts tests/standalone.spec.ts tests/catalog.spec.ts
```

`vitest.config.ts` 复用仓库测试分层；本目录当前场景都由 fast 入口选择。测试使用临时存储目录与明确的关闭清理，不需要外部数据库或联网服务。Node.js 版本要求与包运行要求相同，为 24 或更高版本。不要在未构建新 Worker 代码时把旧构建的绿测作为当前实现证据。

## 场景与拥有者

| 资源 | 使用的权威与验证范围 |
| --- | --- |
| [world.ts](world.ts)、[guard.mjs](guard.mjs)、[guard-migration.mjs](guard-migration.mjs)、[after.mjs](after.mjs) | 真实 SQL 加自有 guard 权威表夹具。用于故意制造缺失、布尔、错绑、拒绝事实与后续事务回滚，不是生产权限实现。 |
| [persistence.spec.ts](persistence.spec.ts) | 真实重开后读取状态、原结果与无值变化记录。 |
| [boundaries.spec.ts](boundaries.spec.ts) | 原操作重放、换内容冲突、预期 revision 竞争、遮蔽值计数、no-op、来源变更、锁、逐次读授权、事务回滚、响应丢失、close/drain 与秘密拒绝。目标权威仍是夹具。 |
| [terminals.spec.ts](terminals.spec.ts) | 真实 SQL 中 seal 与迟到写入竞争、终态重开、回滚及业务回执优先级。目标 guard 是夹具。 |
| [crash.spec.ts](crash.spec.ts)、[crash-child.ts](crash-child.ts) | 子进程 SIGKILL 后重开与原操作恢复。只覆盖该进程终止场景，不代表 OS 崩溃或物理断电。 |
| [identity-world.ts](identity-world.ts)、[identity.spec.ts](identity.spec.ts) | 真实 Identity SQL、公开 principal、standing、reservations 和 Settings 终态。覆盖撤权先到、提交先到、封口阻止迟到提交及目标不可用后的恢复。默认目标 guard 是夹具，不能据此宣称真实资产资格已覆盖。 |
| [standalone.spec.ts](standalone.spec.ts) | 真实 Identity 与持久独立目标拥有者。覆盖供给、重开、不可逆退休、版本内容冲突与陈旧编辑。 |
| [catalog-world.ts](catalog-world.ts)、[catalog.spec.ts](catalog.spec.ts) | 真实 Identity、独立目标、registry、显式选择与目录。覆盖卸载保值、逐页重核、伪造选择拒绝、目标退休、独立拥有者原操作回查及关闭拒绝、精确重新采用、分页依据、捕获中卸载和观察过期后的时钟回拨。默认装配显式使用空 Asset 投影。 |

秘密测试要求命令返回 `unsupported`，并检查事务响应不保留测试明文。普通秘密配值不支持；安全声明元数据可出现在目录中。这些场景不构成秘密保管能力的验收。

## Asset 组合另有承担者

真实 Assets、Settings 与 Identity 的组合测试由 [assets-local tests](../../assets-local/tests/README.md)中的 [settings-governance.spec.ts](../../assets-local/tests/settings-governance.spec.ts)拥有。它使用该包的真实定义、版本和持有写者，而不是本目录 guard 夹具。运行前构建其依赖：

```sh
pnpm --filter @omne-harness/assets-local... run build
pnpm --filter @omne-harness/assets-local run test:fast
```

这条命令是外部组合入口，不把测试归属迁入 Settings local。具体竞争、定义与来源布局、跨租户和原操作用例以 Assets 测试正文及资源为准。

## 结果的边界

正式说明不保存单轮测试数量。当前候选运行结果、失败原文、独立评审与 QA 记录归任务证据。测试存在、源码构建和作者运行是不同事实。

本目录未验证远程认证、最终 UI、tools 或 Cordis 插件、Calendar 消费、部署配置、系统采用、OS 崩溃或物理断电。有限资格协调模型归 [Settings verification](../../settings/verification/README.md)，不能替代这里的真实 SQL 组合，也不能把本目录通过反推为模型以外的全系统证明。

修改公开 binding、参与者材料、生命周期或恢复行为时，同步对应测试、[SPEC](../SPEC.md)、[协调协议](../docs/coordination.md)与[架构图解](../docs/architecture.md)。


## 来源身份与迁移

[source-provenance.spec.ts](source-provenance.spec.ts)用真实独立目标、Identity和SQLite验证同ID换拥有者、换主体、换作用域、重排、空值重整和修订耗尽。它也检查当前资格修订进入公开目录，而稳定身份未变的值可继续读取。待映射历史夹具通过测试直接写入磁盘库，仅用于模拟具名迁移的产物，不代表旧二进制升级验收。

[source-layout-migration.spec.ts](source-layout-migration.spec.ts)分别对目标与配值迁移验证64行键集分页、重复执行、关闭后重开、原回执保留，以及 malformed provenance拒绝。原始配值不因缺少身份而自动附着到新来源。准备依据守护的完整提供者仍需单独验证。

## 准备尝试与Identity保管

[intent-allocation.spec.ts](intent-allocation.spec.ts)通过真实SQLite Worker调用私有分配写者。测试覆盖并发认回、命令不变、事务回滚、数据库重开、终态识别和尝试预算。准入由测试参与者替代，终态及历史记录由夹具设置。

[standing-custody.spec.ts](standing-custody.spec.ts)验证完整请求先保存、请求不被替换、错绑定回执拒绝，以及settled不被迟到held覆盖。真实Identity场景先取得held，丢弃本地回执检查点，再重开Settings数据库并用原请求认回。旧attempt回包场景直接设置历史终态，验证它不能修改新attempt。它不证明生产seal写者或真实settlement恢复组合。

## 来源保留关系

[source-retention.spec.ts](source-retention.spec.ts)使用真实SqlStorage与SQLite Worker安装来源门和保留关系。具名测试参与者替代受信快照、准入和目的终态。用例覆盖请求/快照重开认回、同身份换绑定拒绝、单根排空、精确清门、取消保留旧held、提交要求零held、事务回滚、128个held边界和分源隔离。

恢复测试检查100与28行键集页不重不漏，且返回形状没有快照值。另检查零held待决门仍可枚举。关闭存储后检查实际SQLite约束及查询计划。源与目的的真实服务组合、所有失效写者围栏和生产恢复路由仍须单独验收。

运行显式typecheck检查全部测试辅助文件。Vitest界面的Type Errors行不替代该命令。


[source-snapshot.spec.ts](source-snapshot.spec.ts)使用真实独立目标、配值写者和只读source-snapshot参与者。它验证实际值/锁、明确无配值、退休和声明漂移拒绝、完整目的绑定，以及事实依赖排序。具名消费夹具可把真实快照交给保留写者并重开认回。该夹具替代准入和生产保留协调，没有证明所有源失效写者已经受到held约束。


## 来源保留与失效写入

[source-snapshot.spec.ts](source-snapshot.spec.ts) 使用真实快照生产者和保留参与者。只读观察使用无表写权限的消费夹具。它覆盖真实值和锁、精确目的绑定、重开，以及从落盘 pending 门恢复后的拒绝。pending 场景在关闭数据库后置入记录，不代表生产更新准入已实现。

[source-invalidation.spec.ts](source-invalidation.spec.ts) 使用真实 Identity、命令服务、独立目标和来源保留。它检查 set、clear、lock、unlock、rebase、定义、来源布局、grants 和退役均受保护。无关目标仍能写入，查询和原回执仍可读取。缺少来源事实或使用其他目标的许可不能绕过写者。竞争场景要求保留快照与实际提交顺序一致。

这些测试不替代组织来源准入、目的终态 resolver、完整 prepare/commit/recovery 的验收。


[source-custody.spec.ts](source-custody.spec.ts) 验证目的侧来源请求保管。它覆盖清单原子性与竞争、重排认回、来源集合和路由不可替换、精确回执、固定快照、终态不可回退、旧attempt及空清单。真实来源参与者场景在丢失回包后重开目的数据库，再认回同一保留。目的准入由具名夹具替代，终态和旧attempt场景使用明确的合成记录。65个来源的两页读取验证页长和无快照搬运；EXPLAIN确认复合主键且无需临时排序，不据此声称吞吐或延迟。


[source-readiness.spec.ts](source-readiness.spec.ts) 使用实际只读参与者和无表消费者，核对来源门、held数量、零held的pending重开，以及完整根/attempt绑定。测试把消费命令放在前面，依赖顺序仍由真实SQL提供者决定。来源状态通过具名私有写者夹具建立；该测试不代表生产源更新准入或最终提交已经实现。


`intent-settlement.spec.ts` 经真实 SQLite Worker 验证私有根终结写者。场景包含旧 attempt 与后继隔离、preparing 禁止成功、原绑定核对、提交与取消双顺序和并发、无活跃 attempt 的根取消、业务拒绝、精确来源结果、事务回滚和重开。prepared 状态及来源 finished 结果使用夹具；这些场景不替代最终参与者组合与公开准备接口验收。


`recovery-combination.spec.ts` 使用六个实际恢复参与者，在真实SQLite上验证普通seal、来源根和精确门同提交、held保留、下游失败整组回滚、重开认回、旧attempt不改后继、取消选择冲突和绑定拒绝。命令数组反序提交，用于检查事实依赖排序。根分配与起始门是具名夹具；测试不证明公开准入或完整准备提交。材料检查同时拒绝把source-snapshot和source-finalization两个事实生产者选进同一个组合。


`intent-ready.spec.ts` 通过真实Worker验证私有prepared发布：必需Identity/source保管、空集合与缺清单的差异、全部成员held、原绑定及basis、回滚与重开、封口后不复活，以及展开请求预算。当前依据、终态观察和held回执为具名夹具，不能替代实际生产者验收。


## Original organization update recovery

`organization-recovery.spec.ts` runs real SQLite providers and native organization current. It closes and reopens Settings storage, and separately remounts Identity storage/provider with a new principal verifier that has issued no principals. Original custody resumes through public observation. Faults drop actual accepted reservation/commit replies or make queries unavailable; they do not invent successful authority receipts.

The suite covers requested and prepared custody, unavailable/missing qualification, original SQL identity, rollback, withdrawal races, concurrent recovery, close/drain, real tenant destination sealing and source pagination. A capture/retire/allocation race distinguishes definite native ready refusal from generic ready rollback. Ordinary consumer attempt sealing leaves its intent open for explicit reprepare; source-update sealing terminates its root and gate. These tests do not establish actual consumer Permissions policy, process-kill durability, full differential mutation or C3b independent acceptance.

目录回执与修改终态分离后，`catalog.spec.ts` 通过真实 Identity 撤权覆盖捕获提交前、提交后的两种顺序。它要求先封口时拒绝迟到捕获，先提交时认回原结果，下一次读取拒绝已撤权主体。应用的 `session-permission-write-mapped.spec.ts` 验证目录与 prepared Settings 在同一 provider 的组合，执行状态见任务证据；测试存在不表示已通过。
