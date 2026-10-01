# @omne-harness-lite/session-tenancy-table

[中文](README_ZH.md)

Read a session's persistent tenant identity through public Storage, either standalone or inside a real shared transaction. This experimental ESM workspace member is unpublished; [realization status](../../../.meta_harness/design/realization/packages/session/session-tenancy-table/README.md) records its adopted scope and checks.

| Public export | Purpose |
| --- | --- |
| `createSessionTenancyReader(storage)` | Provide `holdingTenant`, `participate` and `close` |
| `participate(unit).holdingTenant(session)` | Borrow the actual storage transaction, retaining its rollback behavior |
| `sessionTenancyMigrations` | Compose mapping-table migration fragments |
| `sessionTenancyTablePlugin`, `SESSION_TENANCY_SERVICE` | Cordis reader provider and service identity |

## Read the actual tenant

Session references use the current `@omne-harness-lite/messages` public types. The stored tenancy mapping is validated independently of message bodies.

```ts
import { createSessionTenancyReader } from '@omne-harness-lite/session-tenancy-table'
import type { Storage } from '@omne-harness-lite/storage'

export async function readTenant(storage: Storage, session: string) {
  const reader = createSessionTenancyReader(storage)
  try { return await reader.holdingTenant(session) }
  finally { await reader.close() }
}
```

An unknown session returns `sessionNotFound`; invalid input and unavailable storage are distinct. A returned tenant does not authorize all operations on that session. The shared-transaction reader requires a unit from the same storage and lets transaction failures reach its owner.

Compose migrations and establish mappings through the approved application bootstrap before reading. `./seed` is restricted to acceptance bootstrap/tests by repository guards; it is not a public product session-creation API.

`close()` refuses new reads and waits for admitted reads. It neither closes caller-owned storage nor deletes mappings. Tests use temporary file SQLite and real Cordis; observed identity durability still depends on storage upgrade/admission.

```sh
pnpm --filter @omne-harness-lite/session-tenancy-table... run build
pnpm --filter @omne-harness-lite/session-tenancy-table run typecheck
pnpm --filter @omne-harness-lite/session-tenancy-table run test
```
