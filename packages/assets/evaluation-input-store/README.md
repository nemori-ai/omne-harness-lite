# @omne-harness-lite/evaluation-input-store

[中文](README_ZH.md)

Read owned evaluation input from immutable local publications, actual session tenancy and current organization-governance facts. This experimental, unpublished ESM workspace member exposes standalone closures and a Cordis reader. Provider behavior is in [SPEC](SPEC.md); resources and limits are in [verification](verification/README.md).

## Public entries

| Entry | Capability |
| --- | --- |
| `.` | `createEvaluationInputReader`, `evaluationInputMigrations`, dependency/reader types |
| `./cordis` | `evaluationInputStorePlugin`; the shared CurrentEvaluationInputs Service and support ports belong to asset-evaluation |
| `./publication` | Trusted `publishLocalInputs`, `captureSessionRecipe`, `readPublicationRevision` and publication types |
| `./registry-inputs` | Restricted fixed-root reader for an admitted registry caller |
| `./registry-history` | `createRegistryHistoryReader` and history types for authorized exact historical body reads |

## Read current input

Session references are checked through the current `@omne-harness-lite/messages` root entry. These reads do not decode conversation message bodies.

Supply the same `AtomicStorage` used by actual governance, a session-tenancy reader, explicit `storeKey`, trusted deployed entries `{ capability, meta }`, diagnostic/failure ports and a monotonic measurement clock. Establish a real session mapping and capture its recipe first.

```ts
import { createEvaluationInputReader, type InputSourceDependencies } from '@omne-harness-lite/evaluation-input-store'
import type { TenantId } from '@omne-harness-lite/identity-values'

export async function readCurrent(dependencies: InputSourceDependencies, session: string, tenant: TenantId) {
  const reader = createEvaluationInputReader(dependencies)
  try { return await reader.read(session, tenant) }
  finally { await reader.close() }
}
```

Read results preserve ownership and source revisions. An empty scope row differs from a missing row. Unavailable shared/workspace/MCP sources refuse the complete read rather than inventing empty inputs.

## Publish in trusted bootstrap

Supply complete definitions, explicit scope rows and a publication with `expectedRevision`. Subsequent reads see a new publication; previously returned values remain owned snapshots.

```ts
import type { InputSourceDependencies } from '@omne-harness-lite/evaluation-input-store'
import { publishLocalInputs, readPublicationRevision, type LocalPublication } from '@omne-harness-lite/evaluation-input-store/publication'

export async function publish(dependencies: InputSourceDependencies, publication: LocalPublication) {
  const previous = await readPublicationRevision(dependencies)
  const result = await publishLocalInputs(dependencies, publication)
  return { previous, result }
}
```

Unknown commit results require reading actual revision/data before deciding the next action; this helper does not retry. `captureSessionRecipe` records the explicit root and session values after the tenancy mapping exists.

## Restricted consumers and lifecycle

Repository guards restrict `./registry-inputs` and `./registry-history`. The registry's fixed-root caller must verify its original full fill. The history reader consumes actual manifest history, current tenancy/membership and immutable versions; it does not recover the registry or grant authorization from a supplied tuple. Ordinary runtime consumers use the root reader.

Compose `evaluationInputMigrations` with the application's actual account, governance and tenancy migrations before admission. Each reader's `close()` drains its own reads; close readers and finish publication calls before closing borrowed governance/storage. Tests use real file-backed SQLite and actual governance plugins; component pass is not complete runtime delivery or power-loss proof.

```sh
pnpm --filter @omne-harness-lite/evaluation-input-store... run build
pnpm --filter @omne-harness-lite/evaluation-input-store run typecheck
pnpm --filter @omne-harness-lite/evaluation-input-store run test
```
