# 装配边界

本文件说明本包与 Cordis 装配的关系：本包不提供插件，会话存储组合由应用承担。文件名沿用固定专题名 `cordis.md`。本页不另立集成规则，规则归 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md) 与 [sql-contract](../../../storage/sql-contract/SPEC.md)。

## 现状

本包已经删除自己的 `./cordis` 子路径和 `src/cordis.ts`。`package.json` 的 `exports` 只有 `.`，依赖里没有 `@deepseek-ai/cordis`。[public-entry.spec.ts](../tests/public-entry.spec.ts) 断言该子路径不再声明、不可导入、源文件不存在。

原因：SQL 能力经 sql-contract 的公开形状使用，材料目录、组合声明与事务域目录都是应用的事务域装配，不属于 Session。本包若再建一份，就会在 Session 里重复存储组合。禁止在本包重建该组合，也禁止引入对 `packages/storage/**` 内部的依赖。

## 应用承担什么

| 事项 | 承担者 | 本包给什么 |
| --- | --- | --- |
| 材料目录：把本包材料与其他拥有者的材料合成一个目录 | 应用 | `sessionStorageMaterials()` 的参加者、迁移与读 handler 描述，各带模块 URL 与文件摘要 |
| 组合声明与登记：`registerCombination`、清单摘要、参加者列表（`session` 加执行记录提供者的参加者名） | 应用 | 参加者名 `SESSION_PARTICIPANT`；本包不登记，也不计算清单摘要 |
| 租户事务域目录 | 应用，实现 sql-contract 的 `TenantDomainAccess` | 本包每次调用按租户 `resolve`，系统读用 `snapshot` 枚举；目录答了别的租户时拒绝使用 |
| 存储服务与提供者 | 应用装入 sql-contract 与 sqlite-provider 的插件 | 本包只收 `SqlStorage` 对象，不 inject，不知道提供者 |
| 游标签名能力 | 应用 | 本包只收 `cursorSigning` |
| `sessionTransactions` 服务键 | 应用：用 `createSessionStorage` 得到端口，交给服务键 | 键与抽象类归 [session-cordis-contract](../../session-cordis-contract/docs/cordis.md#端口服务键)，本包不提供 |
| 迁移执行与重启后的迁移 | 提供者（DO-1，见 [sqlite-provider 规格](../../../storage/sqlite-provider/SPEC.md) §5.3） | 迁移模块 `session/001-session-log`。插件加载时不登记组合，这一步已按 Context r3 删除 |
| 注册的结果处理（`registerCombination` 的各类拒绝） | 应用 | 无。拒绝规则见 [sql-contract §6](../../../storage/sql-contract/SPEC.md#6-registercombination) |

## 撤除与资源

本包没有插件，所以没有 fiber 与 disposer。`createSessionStorage` 返回的端口只持有应用交入的对象，不持有连接、Worker 或定时器，丢弃端口不需要清理动作，也不回滚任何提交。提供者的关闭由提供者的拥有者负责。已提交的条目不因端口被丢弃而变得可撤回。

## 尚未固定的事项

- 应用的会话存储组合还没有实现。本包只验证自己的材料与端口，不验证完整组合。
- 材料的模块 URL 在源码与 `dist` 下后缀不同（`.ts` 与 `.js`），应用把材料交给提供者时，提供者的加载方式须能读到对应文件。这一点没有在真实提供者上验证。
- sqlite-provider 的 Worker 对本包 participant 与 handler 的实际载入，没有测试覆盖（夹具在 `node:sqlite` 上直接运行模块）。
