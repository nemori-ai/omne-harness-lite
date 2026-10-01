# @omne-harness-lite/assembly-manifest-store

[中文](README_ZH.md)

Persist immutable session assembly records and read their heads, tables and evaluation projections through public Storage. This experimental ESM workspace package is not published on npm. Its current provider adopts MF4; component checks are separate from complete model-runtime acceptance. See [realization and verification](../../../.meta_harness/design/realization/packages/assets/assembly-manifest-store/README.md).

## Public API

| Export | Purpose |
| --- | --- |
| `createAssemblyManifestStore(storage, options)` | Create a standalone closure borrowing caller-owned storage |
| `readHead`, `append`, `readHistory` | Read a head, conditionally append, select a category's historical record |
| `readGiven(session, head)` | Read the actual original full-fill record at an explicit observed head |
| `readEvaluation`, `dependencyPresence` | Read the current evaluation projection and explicit dependency facts |
| `checkManifestAppendInput`, `checkManifestGivenReadInput`, `judgeManifestAppend` | Reuse pure input and append-decision components |
| `answerPresence`, `readEvaluationProjection` | Reuse fact projection helpers |
| `assemblyManifestMigrations` | Compose SQL migration fragments before admission |
| `assemblyManifestStorePlugin`, `ASSEMBLY_MANIFEST_SERVICE` | Cordis provider and service identity |

## Append and read back

Supply a real session and a complete record built by the assembly owner. The append expects the observed head; a conflict is a classified result. `readGiven` validates the stored evaluation content and original-fill kind, so arbitrary JSON is not a usable evaluation record.

```ts
import { createAssemblyManifestStore, type ManifestAppendInput } from '@omne-harness-lite/assembly-manifest-store'
import type { Storage } from '@omne-harness-lite/storage'

export async function recordAssembly(storage: Storage, session: string, record: ManifestAppendInput) {
  const store = createAssemblyManifestStore(storage)
  try {
    const current = await store.readHead(session)
    if ('failure' in current) return current
    const appended = await store.append(session, current.head, record)
    if ('failure' in appended) return appended
    return await store.readGiven(session, appended.head)
  } finally { await store.close() }
}
```

Use `readHistory(session, category, filledAt)` for the exact category snapshot and `readEvaluation(session)` for the current public projection. Missing records, illegal input and unavailable storage remain distinct. Repeated append decisions preserve the recorded owner; they are not an instruction to retry an unknown commit.

## Integrate and close

Compose `assemblyManifestMigrations` with the application's other fragments and complete its migration/admission checks first. `dependencyPresence` needs an explicit `PresenceSource`; unknown facts do not become absent. Optional diagnostic ports receive stage facts without content and own their output bounds.

Call `store.close()` to stop new work and drain admitted operations, then close your storage. The closure and plugin borrow storage and do not delete history. Component tests use real temporary SQLite and child-process crashes; they do not prove power-loss durability or the full registry/runtime composition.

```sh
pnpm --filter @omne-harness-lite/assembly-manifest-store... run build
pnpm --filter @omne-harness-lite/assembly-manifest-store run typecheck
pnpm --filter @omne-harness-lite/assembly-manifest-store run test
```
