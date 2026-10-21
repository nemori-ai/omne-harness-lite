# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

本成员实现的端口 `SessionTransactionPort<P>` 由 [session-contract](../../session-contract/docs/public-api.md#当前增量与后续接口) 定义。十一个操作的输入、结果与失败在契约里写一次，本页不重复。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/session-storage-sql` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | 本包的 `./cordis` 入口，以及不装配 Cordis、直接构造 [session](../../session/docs/public-api.md) 的独立调用方 |
| `@omne-harness/session-storage-sql/cordis` | [src/cordis.ts](../src/cordis.ts) | `dist/cordis.js`、`dist/cordis.d.ts` | 应用装配者。它装入插件，插件提供服务键 `sessionTransactions`（[端口服务键](../../session-cordis-contract/docs/cordis.md#端口服务键)）。见 [Cordis 集成](cordis.md) |

根入口不导入 Cordis（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。

## 定义索引

### 现有导出

两个入口现在都没有导出，源码只有模板标记。[public-entry.spec.ts](../tests/public-entry.spec.ts) 与 [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 断言导出为空。

### 候选导出（尚未实现）

下表的内容由 SPEC 固定。名称与签名随实现确定。某项进入 `src/` 后，把它移到上一节，并同步导出测试。

| 定义 | 种类 | 输入与输出 | 依据 |
| --- | --- | --- | --- |
| 提供者工厂 | 函数 | 输入：配置、存储契约的服务、游标签名密钥。输出：一个事务域的 `SessionTransactionPort<P>` 实现与它的关闭函数 | [SPEC 范围与依据](../SPEC.md#范围与依据)、[对象模型的进程内对象](object-model.md#进程内对象) |
| 参加者模块 `session` | 存储契约的参加者模块 | 在 Worker 内收 `facts` 与语句端口，按 W1 或 W2 执行。怎样登记进 Worker 待存储契约给出 | [W1](../SPEC.md#w1)、[W2](../SPEC.md#w2)、[XP-1](../SPEC.md#xp-table) |
| 迁移片段 | 按版本排序的只读列表 | 权威表与派生表的 DDL 与数据迁移，随提供者的原子迁移执行 | [迁移与生命周期](../SPEC.md#迁移与生命周期)、[XP-5](../SPEC.md#xp-table) |
| 组合登记材料 | 值 | 参加者列表：`session` 加执行记录提供者声明的参加者名，供装配调用 `registerCombination` | [参加者模块与材料](../SPEC.md#参加者模块与材料) |
| 配置 | 工厂的参数，用 Standard Schema 校验 | 字段见下表 | 见下表 |

### 配置（尚未实现）

默认值只是配置初值，不是常量。SPEC 没有给初值的字段，装配必须给出，缺席时工厂拒绝构造。

| 字段 | 含义 | 初值 | 依据 |
| --- | --- | --- | --- |
| 介质 | SQLite 或 PostgreSQL。它选择 SQL 方言与列类型映射，必须与存储提供者的介质一致。连接、Worker 与 PRAGMA 归存储提供者 | 无，装配给出 | [SQLite 与 PostgreSQL](../SPEC.md#sqlite-与-postgresql) |
| 内联阈值 | 载荷字节数超过它时写 `sl_blob` | 16 KiB | [TB-04](../SPEC.md#tb-04) |
| 大对象去向 | 同库 `sl_blob`。对象存储待 [issue 541](https://github.com/nemori-ai/omne-harness-lite/issues/541) | 同库 `sl_blob` | [TB-04](../SPEC.md#tb-04) |
| `pageBytes` 上限、`maxScanPerPage` | 每页读出字节与每页扫描条目的上限 | 无，按验证计划实测后写进 SPEC | [R2](../SPEC.md#r2)、[明确缺项](../SPEC.md#明确缺项) |
| 快照重建方式 | 归约版本升级时，在开放写准入之前全量重建，或在首次治理读时按会话惰性重建 | 无，装配给出 | [迁移与生命周期](../SPEC.md#迁移与生命周期) |

保留政策不是配置项。本成员不删除条目、批次、回执、blob 或旧 epoch 行（[RT-01](../SPEC.md#rt-01) 至 [RT-03](../SPEC.md#rt-03)），所以没有保留期限或清理开关。

缓存也不是配置项。本成员只缓存预编译语句、迁移与归约版本、SE36 载荷这类不可变或可重算的派生物，不缓存权威读（[RT-04](../SPEC.md#rt-04)）。条目缓存与快照缓存归 `session`，视图前缀摘要缓存归 `session-adapters`。实现若需要为 SE36 载荷缓存设上界，先写进 SPEC，再作为配置字段进入本表。

游标签名密钥不是配置值，由装配作为依赖注入。缺席时 R2、R5、R8、R10、R11 返回 `unavailable`（[失败分类](../SPEC.md#失败分类)）。

### 结果与失败的定位

| 关心什么 | 正文 |
| --- | --- |
| 提交结果的映射：`rolled_back`、`unknown`、`writer_not_current` 与锁等待超时 | [W1](../SPEC.md#w1) |
| 每条读路径的算法、复杂度与退化 | [读路径](../SPEC.md#读路径) |
| 本成员返回的失败与处置方 | [失败分类](../SPEC.md#失败分类) |
| 品牌字符串与 64 位位置的编码 | [TB-03](../SPEC.md#tb-03) |
