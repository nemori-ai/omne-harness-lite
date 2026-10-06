# @omne-harness-lite/client-local-state

[中文](README_ZH.md)

Public contracts for durable client selection, login material and cached reads. Providers issue instance-owned snapshots and support compare-and-replace updates.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/client-local-state": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                        | Purpose                                                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `LocalRecord`, `CachedRead`, `LocalSnapshot`, `SnapshotToken` | Stored data and instance-owned snapshot credentials                                       |
| `ClientLocalState`, `ReadOutcome`, `ReplaceOutcome`           | Read and conditional durable replacement                                                  |
| `ClientStateUsageDefect`                                      | Closed-instance or invalid-snapshot use error                                             |
| `LocalStateStorageFactory`, `LocalStateStorage`               | Private durable SQLite storage ownership                                                  |
| `./cordis`: `ClientLocalStateService`, `ClientStateStorage`   | Shared Services with `CLIENT_LOCAL_STATE_SERVICE` and `CLIENT_STATE_STORAGE_SERVICE` keys |

## Example

```ts
import type { ClientLocalState } from '@omne-harness-lite/client-local-state'

export async function replaceSelection(
  state: ClientLocalState,
  value: unknown,
  operationId: string,
) {
  const reading = await state.read()
  if (reading.kind === 'failed') return reading
  return state.compareAndReplace(reading.snapshot.token, value, operationId)
}
```

The caller supplies a live provider and a valid operation identifier. Return conflicts and unconfirmed outcomes unchanged. Do not fabricate or reuse another instance’s token.

## Boundaries and lifecycle

Snapshots and records can contain bearer credentials. Do not print complete readings. Invalid or unsupported records must not become an empty successful state.

Conditional replacement requires a live provider-issued token. An `unconfirmed` result does not mean that installation failed. The caller must follow the recovery contract.

A storage factory opens a private SQLite file at full durability, without governance-center migrations. Ownership of the returned storage transfers to the local-state provider. Precise data, durability and failure requirements belong to [SPEC.md](SPEC.md).

## Development

```sh
pnpm --filter @omne-harness-lite/client-local-state run build
pnpm --filter @omne-harness-lite/client-local-state run typecheck
pnpm --filter @omne-harness-lite/client-local-state run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

## Related packages

- [SQLite local-state provider](../../frontend/client-local-state-sqlite/README.md)
