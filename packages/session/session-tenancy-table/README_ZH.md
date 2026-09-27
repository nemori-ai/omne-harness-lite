# @omne-harness-lite/session-tenancy-table

[English](README.md)

通过公开 Storage 读取会话持久租户身份，可独立使用，也可加入真实共享事务。本包是实验性、未发布的 ESM workspace 成员；采用范围和检查见[实现映射](../../../.meta_harness/design/realization/packages/session/session-tenancy-table/README.md)。

| 公开导出 | 用途 |
| --- | --- |
| `createSessionTenancyReader(storage)` | 提供 `holdingTenant`、`participate` 与 `close` |
| `participate(unit).holdingTenant(session)` | 借用实际 storage 事务，保留其回滚行为 |
| `sessionTenancyMigrations` | 合成归属表迁移片段 |
| `sessionTenancyTablePlugin`、`SESSION_TENANCY_SERVICE` | Cordis 读取提供者和服务标识 |

## 读取实际租户

```ts
import { createSessionTenancyReader } from '@omne-harness-lite/session-tenancy-table'
import type { Storage } from '@omne-harness-lite/storage'

export async function readTenant(storage: Storage, session: string) {
  const reader = createSessionTenancyReader(storage)
  try { return await reader.holdingTenant(session) }
  finally { await reader.close() }
}
```

会话不存在返回 `sessionNotFound`，输入非法与存储不可用分别保留。返回租户不意味着授权该会话上的所有操作。共享事务读取器要求 unit 来自同一 storage，让事务失败交给实际 owner。

读取前先合成迁移，再由允许的应用 bootstrap 建立映射。仓库 guard 把 `./seed` 限在验收 bootstrap/tests，它不是产品会话创建 API。

`close()` 拒绝新读取并等待已准入读取，不关闭调用者 storage，也不删除映射。测试使用临时文件 SQLite 和真实 Cordis；身份的耐久性仍受 storage 升级和准入约束。

```sh
pnpm --filter @omne-harness-lite/session-tenancy-table... run build
pnpm --filter @omne-harness-lite/session-tenancy-table run typecheck
pnpm --filter @omne-harness-lite/session-tenancy-table run test
```
