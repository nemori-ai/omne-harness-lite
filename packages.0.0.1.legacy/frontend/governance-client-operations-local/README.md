# @omne-harness-lite/governance-client-operations-local

[中文](README_ZH.md)

A local coordinator for public governance actions. It combines client state and transport while retaining separate remote effects and local settlement results.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/governance-client-operations-local": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                                    | Purpose                                                      |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `createGovernanceClient`, `CreateGovernanceClientOptions`                                 | Create a client from public state and transport dependencies |
| Returned `GovernanceClientOperations`                                                     | Actions, prepared prompts, identity-bound uses and close     |
| `./cordis`: `governanceClientOperationsPlugin`, `managedGovernanceClientOperationsPlugin` | Independent and assembly-managed bindings                    |

## Example

```ts
import type { ClientLocalState } from '@omne-harness-lite/client-local-state'
import type { GovernanceTransport } from '@omne-harness-lite/governance-center-entry-https-json'
import { exitStatus } from '@omne-harness-lite/governance-client-operations'
import { createGovernanceClient } from '@omne-harness-lite/governance-client-operations-local'

export async function runHealth(state: ClientLocalState, transport: GovernanceTransport) {
  const client = createGovernanceClient({ state, transport })
  try {
    const report = await client.runAction({ action: 'health' })
    return { report, status: exitStatus(report) }
  } finally {
    await client.close()
  }
}
```

The caller supplies a configured state and a live transport. Client close waits for its work. The caller retains and closes the borrowed dependencies afterward.

## Boundaries and lifecycle

Action types, schemas, reports and exit mapping belong to [the public operation package](../../core/governance-client-operations/README.md). This provider does not render a CLI or terminal UI.

One use fixes its origin and permits one active action. Selection changes, remote success, local conflicts and unconfirmed installation remain distinct. Cached reads retain identity and tenant scope.

Prepared prompts use exact secret slots. Cancellation does not release dependencies before actual completion. Do not wait for client close from inside an active prompt. Reports exclude raw credentials. See [SPEC.md](SPEC.md).

## Development

```sh
pnpm --filter @omne-harness-lite/governance-client-operations-local run build
pnpm --filter @omne-harness-lite/governance-client-operations-local run typecheck
pnpm --filter @omne-harness-lite/governance-client-operations-local run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

## Related packages

- [SQLite state provider](../client-local-state-sqlite/README.md)
- [HTTPS transport provider](../governance-center-client-https/README.md)
