# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

本成员实现的端口 `SessionTransactionPort<P>` 由 [session-contract](../../session-contract/docs/public-api.md#构造依赖端口出站端口与纯函数) 定义。各操作的输入、结果与失败在契约里写一次，本页不重复。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/session-storage-sql` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | 应用装配者，以及直接构造 [session](../../session/docs/public-api.md) 的独立调用方 |

`package.json` 的 `exports` 只有 `.`。本包没有 `./cordis` 子路径，也没有对应源文件：会话存储组合由应用承担，见[装配边界](cordis.md)。根入口不导入 Cordis（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。[public-entry.spec.ts](../tests/public-entry.spec.ts) 断言导出集合、`./cordis` 不可导入，以及源码只从 `@omne-harness/sql-contract` 与 `@omne-harness/sql-contract/worker` 导入 SQL 形状。

## 定义索引

### 现有导出

| 定义 | 种类 | 输入与输出 | 依据 |
| --- | --- | --- | --- |
| `createSessionStorage` | 函数 | 输入 `SessionStorageOptions<P>`，输出 `SessionTransactionPort<P>`。端口含 `commit`、`readWork`、`readInput`、`queryOperation`、`queryControlOperation`、`readModelSelection`、`commitEntries`、`history`、`pending`、`references`、`releasedScopes`。`commitEntries` 恒返回 `unavailable`，见[已知限制](../SPEC.md#已知限制) | [SPEC 实现现状](../SPEC.md#实现现状) |
| `sessionStorageMaterials` | 函数 | 无输入，输出 `SessionStorageMaterials`：`participants`、`migrations`、`readHandlers` 三个只读列表。读取模块文件一次并给出摘要 | [参加者模块与材料](../SPEC.md#参加者模块与材料) |
| `SESSION_PARTICIPANT` | 常量 | 值 `session` | 同上 |
| `SessionStorageOptions`、`SessionStorageMaterials` | 类型 | 见源码 | 同上 |

### 配置

默认值只是配置初值，不是常量。下表是 `SessionStorageOptions` 的字段，类型与必填性以 [src/context.ts](../src/context.ts) 为准。

| 字段 | 含义 | 初值 |
| --- | --- | --- |
| `storage` | `SqlStorage`，提供提交、查询与读 | 无，必填 |
| `domains` | `TenantDomainAccess`，按租户取事务域，枚举全部租户域 | 无，必填 |
| `accessCheck` | 每个公开读与写的当前访问裁定，没有默认权限 | 无，必填 |
| `cursorSigning` | 游标签名能力，由应用注入 | 无，必填 |
| `combination` | 应用为租户作用域登记的 `combinationVersion` 与 `manifestDigest` | 无，必填 |
| `attemptLimit` | 一个 Session 操作最多开的尝试代次数 | 8 |
| `cursorTtlMs` | 游标有效期（毫秒） | 15 分钟 |
| `now` | 时钟，用于游标过期 | `Date.now` |

SPEC 设计的内联阈值、大对象去向、`pageBytes` 上限、`maxScanPerPage` 与重建方式现在不是配置项（[实现现状](../SPEC.md#实现现状)）。保留政策与缓存也不是配置项：本成员不删除条目、回执或旧 epoch 行（[RT-01](../SPEC.md#rt-01)）。

### 结果与失败的定位

| 关心什么 | 正文 |
| --- | --- |
| 提交结果的映射：`rolled_back`、`unknown`、`identity_conflict`、`writer_not_current` | [W1](../SPEC.md#w1) |
| 尝试代次怎样选，`attempt-rejected` 与 `not-committed` 怎样区分 | [W1 的尝试代次](../SPEC.md#w1-attempts)、[R7](../SPEC.md#r7) |
| 读路径的路由、算法、复杂度与退化 | [读路径](../SPEC.md#读路径) |
| 本成员返回的失败与处置方 | [失败分类](../SPEC.md#失败分类) |
| 游标的绑定与验证 | [R2](../SPEC.md#r2)、[C-03](../SPEC.md#c-03) |
| 品牌字符串与 64 位位置的编码 | [TB-03](../SPEC.md#tb-03) |
