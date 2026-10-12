# @omne-harness-lite/assembly-manifest-store

[中文](README_ZH.md)

Persist immutable session assembly records through public Storage. The standalone MF4 factory and Cordis binding share the same six-operation implementation.
This experimental ESM workspace package is not published on npm. Component acceptance is separate from complete model-runtime acceptance.
[Provider behavior](SPEC.md), [common manifest behavior](../../core/assembly-manifest/SPEC.md), and [verification](verification/README.md) define their respective scopes.

## Public entries

| Entry | Exports |
|---|---|
| Root | createAssemblyManifestStore, assemblyManifestMigrations, AssemblyManifestStore and ManifestDb |
| ./cordis | assemblyManifestStorePlugin, AssemblyManifestStoreService, AssemblyManifestResourcesService |
| Public owner: @omne-harness-lite/assembly-manifest | Six-operation types, ManifestAppendInput, PresenceSource, ManifestOptions, ManifestDiagnostic and pure input/decision helpers |
| Public owner: @omne-harness-lite/assembly-manifest/cordis | Abstract business/resource Services and their unique keys |

The root does not import Cordis. A created store exposes readHead, append, readHistory, dependencyPresence, readEvaluation, readGiven and close.
Pure checks and projection helpers come from the public definition package, rather than provider aliases.

## Independent use

Supply a real session and a complete record from the assembly owner. Append requires the observed head.
Conflicts, missing records, invalid input and unavailable storage remain distinct.

```ts
import { createAssemblyManifestStore } from '@omne-harness-lite/assembly-manifest-store'
import type { ManifestAppendInput } from '@omne-harness-lite/assembly-manifest'
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

## Cordis and resource ownership

Migrate with assemblyManifestMigrations before admission. Publish storage and an explicit AssemblyManifestResourcesService, then load the manifest plugin with `{}`.
The resource service carries optional presence and diagnostic ports. Callbacks are runtime resources and cannot appear in serialized plugin configuration.
A diagnostic requires a diagnosticFailure callback. Unknown presence facts remain unknown; diagnostic output excludes content and raw errors.

The plugin borrows storage and ports. Withdrawal stops new valid calls and lets admitted work finish on the captured generation.
Assembly code selecting AssemblyManifestStoreService retains its stable closed promise. Only fulfillment proves actual drain and permits borrowed-resource release.
Rejected completion requires inspection; repeated kernel disposal does not replace this observation. Replacement does not release the old generation.
For independent use, await store.close before releasing borrowed resources. Neither path deletes history or closes caller-owned storage.

```sh
pnpm --filter @omne-harness-lite/assembly-manifest-store... run build
pnpm --filter @omne-harness-lite/assembly-manifest-store run typecheck
pnpm --filter @omne-harness-lite/assembly-manifest-store run test
```
