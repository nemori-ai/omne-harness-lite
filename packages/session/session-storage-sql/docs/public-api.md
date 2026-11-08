# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

本成员实现的端口 `SessionTransactionPort<P>` 由 [session-contract](../../session-contract/docs/public-api.md#构造依赖端口出站端口与纯函数) 定义。各操作的输入、结果与失败在契约里写一次，本页不重复。

## 导出入口

| 入口                                             | 源码                                          | 发布产物                                         | 调用者                                                                                                                                                        |
| ------------------------------------------------ | --------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@omne-harness/session-storage-sql`              | [src/index.ts](../src/index.ts)               | `dist/index.js`、`dist/index.d.ts`               | 应用装配者，以及直接构造 [session](../../session/docs/public-api.md) 的独立调用方                                                                             |
| `@omne-harness/session-storage-sql/participants` | [src/participants.ts](../src/participants.ts) | `dist/participants.js`、`dist/participants.d.ts` | 会话存储组合的目录写者，以及以 `storage` 自己提交的执行记录提供者（session-adapters 的 Journal 提供者）。只含参加者名、协议版本、依据校验与编解码纯函数，不含提供者实现 |

`package.json` 的 `exports` 有 `.` 与 `./participants`。本包没有 `./cordis` 子路径，也没有对应源文件：会话存储组合由应用承担，见[装配边界](cordis.md)。根入口不导入 Cordis（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。[public-entry.spec.ts](../tests/public-entry.spec.ts) 断言导出集合、`./cordis` 不可导入，以及源码只从 `@omne-harness/sql-contract` 与 `@omne-harness/sql-contract/worker` 导入 SQL 形状。

## 定义索引

### 现有导出

| 定义                                               | 种类             | 输入与输出                                                                                                                                                                                                                                                                                                                      | 依据                                                |
| -------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `createSessionStorage`                             | 函数             | 输入 `SessionStorageOptions<P>`，输出 `SessionTransactionPort<P>`。端口含 `commit`、`readWork`、`readInput`、`queryOperation`、`queryControlOperation`、`readModelSelection`、`commitEntries`、`history`、`pending`、`references`、`releasedScopes`。`commitEntries` 不问访问检查，步骤见[已知限制](../SPEC.md#已知限制)第 1 条 | [SPEC 实现现状](../SPEC.md#实现现状)                |
| `sessionStorageMaterials`                          | 函数             | 输入 `SessionStorageMaterialsOptions`（必填 `readOutputLimitBytes`，正安全整数，没有默认值，非法时抛 `TypeError`），输出 `SessionStorageMaterials`：`participants`、`migrations`、`readHandlers` 三个只读列表。读取模块文件一次并给出摘要。`migrations` 含 `session/003-operation-evidence`，它建操作记录的访问证据表，依赖 `session/002-execution-index`                                                                                                                                                                                                   | [参加者模块与材料](../SPEC.md#参加者模块与材料)     |
| `SESSION_PARTICIPANT`                              | 常量             | 值 `session`                                                                                                                                                                                                                                                                                                                    | 同上                                                |
| `SessionStorageOptions`、`SessionStorageMaterials`、`SessionStorageMaterialsOptions` | 类型             | 见源码                                                                                                                                                                                                                                                                                                                          | 同上                                                |
| `./participants` 的导出                            | 常量、函数与类型 | 两个参加者的名字、协议版本、读 handler 名，`session` 命令与只读核对的 facts 构造，`execution-record` 写入的 facts 构造，两个参加者回复与六个读输出的解码。第六个是执行索引 `session.execution` 的输出                                                                                                                           | [对外部提交方的词汇](../SPEC.md#对外部提交方的词汇) |

### 配置

默认值只是配置初值，不是常量。下表是 `SessionStorageOptions` 的字段，类型与必填性以 [src/context.ts](../src/context.ts) 为准。

| 字段            | 含义                                                            | 初值       |
| --------------- | --------------------------------------------------------------- | ---------- |
| `storage`       | `SqlStorage`，提供提交、查询与读                                | 无，必填   |
| `domains`       | `TenantDomainAccess`，按租户取事务域，枚举全部租户域            | 无，必填   |
| `accessCheck`   | 每个公开读与写的当前访问裁定，没有默认权限                      | 无，必填   |
| `cursorSigning` | 游标签名能力，由应用注入                                        | 无，必填   |
| `combination`   | 应用为租户作用域登记的 `combinationVersion` 与 `manifestDigest` | 无，必填   |
| `intakeLimits` | 构造时校验并复制的普通输入预算，公开命令不能覆盖 | Session 统一初值：64 个、1048576 字节 |
| `attemptLimit`  | 一个 Session 操作最多开的尝试代次数                             | 8          |
| `cursorTtlMs`   | 游标有效期（毫秒）                                              | 15 分钟    |
| `now`           | 时钟，用于游标过期                                              | `Date.now` |

SPEC 设计的内联阈值、大对象去向、`pageBytes` 上限、`maxScanPerPage` 与重建方式现在不是配置项（[实现现状](../SPEC.md#实现现状)）。保留政策与缓存也不是配置项：本成员不删除条目、回执或旧 epoch 行（[RT-01](../SPEC.md#rt-01)）。

### 结果与失败的定位

| 关心什么                                                                            | 正文                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 提交结果的映射：`rolled_back`、`unknown`、`identity_conflict`、`writer_not_current` | [W1](../SPEC.md#w1)                                          |
| 尝试代次怎样选，`attempt-rejected` 与 `not-committed` 怎样区分                      | [W1 的尝试代次](../SPEC.md#w1-attempts)、[R7](../SPEC.md#r7) |
| 读路径的路由、算法、复杂度与退化                                                    | [读路径](../SPEC.md#读路径)                                  |
| 本成员返回的失败与处置方                                                            | [失败分类](../SPEC.md#失败分类)                              |
| 游标的绑定与验证                                                                    | [R2](../SPEC.md#r2)、[C-03](../SPEC.md#c-03)                 |
| 品牌字符串与 64 位位置的编码                                                        | [TB-03](../SPEC.md#tb-03)                                    |

`sessionCommandFacts` 的可选预算参数只供可信集成使用，约束见 [可信传递](../SPEC.md#普通输入预算的可信传递)。

## 提交依据与版本

`./participants` 导出 `sessionCommitCommands`、`sessionCommitDigest`、`SessionCommitBasisSchema`、`SessionCommitResultSchema` 及关联类型和事实键。最终命令组装、普通与受保护依据和失败语义归[提交依据](commit-basis.md)。`SESSION_PROTOCOL` 只用于写参加者；`SESSION_READ_PROTOCOL` 用于读取 handler，不能互换。


## 当前权限读取

原执行的同事务核回另由 `SESSION_EXECUTION_GUARD`、`SESSION_EXECUTION_CURRENT_FACT`、`executionCurrentGuardFacts`、`ExecutionCurrentSchema` 和 `ExecutionCurrent` 提供，均从 `./participants` 导出。形状归 [execution-current.ts](../src/execution-current.ts)，行为归 [原执行修订核回](../SPEC.md#同事务原执行修订核回)。它读取原执行头，不复用 Session 权限关系或 Settings 配值。

`./participants` 导出 `SESSION_PERMISSION_CURRENT_HANDLER`、`decodeSessionPermissionCurrent` 及其输入输出类型。精确形状归 [permission-current.ts](../src/permission-current.ts)，语义归 [当前权限关系](../SPEC.md#当前权限关系)。调用者是已经取得原访问资格的受信 SQL 组合方；该读口不是独立的身份授权服务。解码器区分 current、not-ready 与 malformed。

`./participants` 还导出 `SESSION_PERMISSION_GUARD`、`SESSION_PERMISSION_CURRENT_FACT` 和 `sessionPermissionGuardFacts`，供受信捕获组合持久携带原定位及修订。参加者及其读表权限由 `sessionStorageMaterials` 提供，行为与消费义务见[同事务当前性守卫](../SPEC.md#同事务当前性守卫)。事实正文用现有 `decodeSessionPermissionCurrent` 解码。
