# @omne-harness-lite/governance-center-entry-node

[中文](README_ZH.md)

A Node governance entry with a TLS client face and a Unix-socket operations face. Independent factories and Cordis bindings share the same setup and close owners.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/governance-center-entry-node": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                                                         | Purpose                                                   |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `createGovernanceCenterEntry`, `createGovernanceCenterOps`, `GovernanceCenterWork`                             | Independent factories with `setup()` and `close()`        |
| `GovernanceCenterEntryConfigSchema`, `GovernanceCenterOpsConfigSchema`, dependency/configuration types         | Validated configuration and explicit runtime dependencies |
| `GovernanceCenterWorkStopped`, `GovernanceCenterClockTimeoutError`, `TlsMaterialError`, identity/socket errors | Classified setup, lifecycle and resource errors           |
| `governanceCenterMigrations`, `governanceCenterPreflight`, snapshot and offline-maintenance exports            | Caller-composed database and maintenance facilities       |
| `RECEIVE_LIMITS`, `TLS_HANDSHAKE_TIMEOUT_MS`, `OPS_SOCKET_NAME`                                                | Public transport bounds and socket filename               |
| `./cordis`: `governanceCenterEntryPlugin`, `managedGovernanceCenterEntryPlugin`                                | Independent and managed TLS bindings                      |
| `./cordis`: `governanceCenterOpsPlugin`, `managedGovernanceCenterOpsPlugin`                                    | Independent and managed Unix operations bindings          |

## Example

```ts
import {
  createGovernanceCenterEntry,
  type GovernanceCenterEntryConfig,
  type GovernanceCenterEntryDependencies,
} from '@omne-harness-lite/governance-center-entry-node'

export async function serveEntry(
  config: GovernanceCenterEntryConfig,
  dependencies: GovernanceCenterEntryDependencies,
  serve: () => Promise<void>,
) {
  const entry = createGovernanceCenterEntry(config, dependencies)
  try {
    await entry.setup()
    await serve()
  } finally {
    await entry.close()
  }
}
```

The caller supplies TLS material, live business services and the generation opening signal. `serve` must settle when serving should end. Setup alone does not authorize opening.

## Boundaries and lifecycle

Construction starts no I/O. Setup and close have stable completion promises. Always close after failed setup. Closing before setup prevents resource startup.

Both faces require the public opening service. The host must confirm the current generation before opening. Maintenance resources use `EntryMaintenance`, not callbacks in JSON configuration. Managed bindings also require assembly lifetime ports.

Stop prevents new admission. Existing business work must finish before borrowed dependencies release. A network drain timeout does not prove business completion. Typed notifications belong to [the public entry owner](../../core/governance-center-entry/README.md).

The main [tenancy host](../../../apps/tenancy-host/README.md) selects providers, composes migrations and owns confirmation/opening. Public integration commitments belong to [SPEC.md](SPEC.md). Preserved business clauses remain linked there.

## Transport constants

These values are implementation constants, not configuration fields. The public entry owner defines accepted protocol versions.

| Bound                                        | Value                                    |
| -------------------------------------------- | ---------------------------------------- |
| Header block / request body                  | 8,192 / 65,536 bytes                     |
| Client JSON depth / object members           | 64 / 1,024                               |
| Receive / TLS handshake timeout              | 30 / 30 seconds                          |
| Drain bytes / timeout                        | 65,536 bytes / 5 seconds                 |
| Operations in-flight health wait on disposal | 3 seconds                                |
| Live storage health probe                    | 2 seconds                                |
| Clock polling interval                       | 100 ms, bounded by `clockReadyTimeoutMs` |

The private request policy uses explicit protocol, correlation and transaction ports. Business routes and wire projections have separate owners. The adapter retains the original commit and reply order. See [the boundary decision](adr/decision-protocol.md).

## Development

```sh
pnpm --filter @omne-harness-lite/governance-center-entry-node run build
pnpm --filter @omne-harness-lite/governance-center-entry-node run typecheck
pnpm --filter @omne-harness-lite/governance-center-entry-node run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

Tests use real TLS, Unix sockets and SQLite files. Some transport cases require local OpenSSL. Slow receive cases take about 30 seconds. Dual-source cases use `127.0.0.1` and `127.0.0.2`, or `OMNE_TEST_ALTERNATE_SOURCE_ADDRESS` as documented in the end-to-end environment.

## Related packages

- [Server-entry definitions](../../core/governance-center-entry/README.md)
- [Transport definitions](../../core/governance-center-entry-https-json/README.md)
- [End-to-end environment](../../../apps/tenancy-host/tests/e2e/README.md)

The [maintenance boundary](adr/maintenance-effects.md) separates policy from file, codec and digest providers. The assembly keeps the original descriptor, publication and cleanup ownership.
