# @omne-harness-lite/client-local-state-sqlite

[中文](README_ZH.md)

A durable SQLite provider for client-local selection, login material and read copies. The independent factory and Cordis plugins use the same implementation.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/client-local-state-sqlite": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                                        | Purpose                                                    |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `openClientLocalState`                                                                        | Open state using a caller-supplied private storage factory |
| `OpenClientLocalStateOptions`, `OpenClientLocalStateDependencies`, `ClientLocalStateInstance` | Directory, storage dependency and read/CAS/close interface |
| `ClientStateOpenFailure`                                                                      | Classified open failure                                    |
| `./cordis`: `clientLocalStatePlugin`, `managedClientLocalStatePlugin`                         | Independent and assembly-managed bindings                  |

## Example

```ts
import type { LocalStateStorageFactory } from '@omne-harness-lite/client-local-state'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'

export async function readLocalRevision(directory: string, storage: LocalStateStorageFactory) {
  const state = await openClientLocalState({ directory }, { storage })
  try {
    const reading = await state.read()
    if (reading.kind === 'failed') return reading
    return { kind: 'revision' as const, revision: reading.snapshot.revision }
  } finally {
    await state.close()
  }
}
```

The caller supplies a dedicated directory under a trusted parent and a conforming SQLite factory. The example returns only revision information and classified failures.

## Boundaries and lifecycle

The private directory uses restrictive permissions. Storage must provide full durability without center migrations. The returned storage becomes owned by this instance. Do not close it independently.

Read and compare-and-replace use the public [local-state contract](../../core/client-local-state/SPEC.md). Tokens belong to one live instance. Corrupt data is not automatically replaced with empty state. Unconfirmed installation remains uncertain.

`close()` stops admission and waits for actual writes, durability work and storage close. Both bindings require `clientStateStorage`. The managed binding also requires an assembly lifetime port. See [SPEC.md](SPEC.md).

The private CAS policy uses record ports from `state-data.ts`. `state-sql.ts` binds those ports inside the original storage callback. The open factory selects that binding. See [the boundary decision](adr/policy-persistence.md).

## Development

```sh
pnpm --filter @omne-harness-lite/client-local-state-sqlite run build
pnpm --filter @omne-harness-lite/client-local-state-sqlite run typecheck
pnpm --filter @omne-harness-lite/client-local-state-sqlite run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

Tests require real temporary SQLite files and filesystem permissions. They do not establish production durability on every filesystem.

## Related packages

- [Public definitions](../../core/client-local-state/README.md)
- [Governance client coordinator](../governance-client-operations-local/README.md)
