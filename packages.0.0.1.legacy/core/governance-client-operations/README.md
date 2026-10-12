# @omne-harness-lite/governance-client-operations

[中文](README_ZH.md)

Public action contracts shared by CLI, client and other consumers. It defines secret-free preparation, classified reports and exit-status mapping.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/governance-client-operations": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                           | Purpose                                                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ActionInput`, `ActionIntent`, `ActionPreview`, `InputPrompt`, `PromptResult`    | Direct input and staged secret collection                                                                   |
| `GovernanceClientOperations`, `GovernanceUse`, `OpenUseOutcome`                  | One-shot actions and identity-bound uses                                                                    |
| `ActionReport`, `exitStatus`                                                     | Classified report and CLI exit status                                                                       |
| `ClientUseUsageDefect`, `ClientCloseObservation`                                 | Use errors and original-close observation                                                                   |
| `./cordis`: `GovernanceClientOperationsService`, `GovernanceClientCloseObserver` | Shared Services and `GOVERNANCE_CLIENT_OPERATIONS_SERVICE`, `GOVERNANCE_CLIENT_CLOSE_OBSERVER_SERVICE` keys |
| `./schema`, `./schema/v2`                                                        | Action/report and prepared-input schemas                                                                    |

## Example

```ts
import {
  exitStatus,
  type GovernanceClientOperations,
} from '@omne-harness-lite/governance-client-operations'

export async function healthAction(client: GovernanceClientOperations) {
  const report = await client.runAction({ action: 'health' })
  return { report, status: exitStatus(report) }
}
```

The caller owns the client lifetime. Use the report’s separate remote and local outcomes. A single exit status does not replace the report.

## Boundaries and lifecycle

Prepared input omits specified credential fields. Runtime schemas enforce the exact secret slots. The prompt receives cancellation separately from the actual action completion.

A use fixes an identity and permits one active action. Selection changes and compare-and-replace conflicts require the defined recovery behavior. Local selection is not tenant authorization.

Public reports exclude raw secret material. Remote success and local installation can differ. Keep the caller-owned state and transport alive until client close completes.

Do not await client close from inside its active prompt. That creates a completion cycle. Exact obligations belong to [SPEC.md](SPEC.md).

## Development

```sh
pnpm --filter @omne-harness-lite/governance-client-operations run build
pnpm --filter @omne-harness-lite/governance-client-operations run typecheck
pnpm --filter @omne-harness-lite/governance-client-operations run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

## Related packages

- [Local client coordinator](../../frontend/governance-client-operations-local/README.md)
