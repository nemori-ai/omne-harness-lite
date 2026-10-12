# @omne-harness-lite/session-tenancy-table

[中文](README_ZH.md)

Read a session's persistent tenant identity through public Storage, either standalone or inside a real shared transaction. This experimental ESM workspace member is unpublished; [realization status](SPEC.md) records its adopted scope and checks.

| Public export | Purpose |
| --- | --- |
| `createSessionTenancyReader(storage)` | Provide `holdingTenant`, `participate` and `close` |
| `participate(unit).holdingTenant(session)` | Borrow the actual storage transaction, retaining its rollback behavior |
| `sessionTenancyMigrations` | Compose mapping-table migration fragments |
| `sessionTenancyTablePlugin` from `./cordis` | Cordis reader provider; the definition and `SESSION_TENANCY` key belong to core/session-tenancy |
| `readSessionCatalogIn` from restricted `./maintenance` | Complete immutable holding catalog for the application recovery owner |

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

The restricted seed returns `created` or `alreadyPresent` from its write transaction. Callers must also obtain confirmation that the enclosing transaction committed.

The restricted maintenance read uses a caller-owned ReadTx. It rejects malformed or incomplete catalog reads and grants no user authority. Its behavior is defined in [SPEC.md](SPEC.md).

`close()` refuses new reads and waits for admitted reads. It neither closes caller-owned storage nor deletes mappings. Tests use temporary file SQLite and real Cordis; observed identity durability still depends on storage upgrade/admission.

```sh
pnpm --filter @omne-harness-lite/session-tenancy-table... run build
pnpm --filter @omne-harness-lite/session-tenancy-table run typecheck
pnpm --filter @omne-harness-lite/session-tenancy-table run test
```
