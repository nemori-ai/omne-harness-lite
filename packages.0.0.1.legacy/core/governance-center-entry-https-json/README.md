# @omne-harness-lite/governance-center-entry-https-json

[中文](README_ZH.md)

Public client transport contracts for governance HTTPS/JSON. It defines health, exchange outcomes and trust configuration without an HTTP implementation.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/governance-center-entry-https-json": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                   | Purpose                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------ |
| `GovernanceTransport`                                                    | Public health and governance exchange interface  |
| `PublicHealthOptions`, `CenterTrust`                                     | Endpoint, trust, timeout and cancellation inputs |
| `PublicHealthOutcome`, `GovernanceOutcome`, `EntryAnswer`                | Classified transport and entry observations      |
| `GovernanceClientConfigurationError`, `GovernanceTransportStopped`       | Configuration and lifecycle use errors           |
| `./cordis`: `GovernanceTransportService`, `GOVERNANCE_TRANSPORT_SERVICE` | Public Service definition and key                |

## Example

```ts
import type {
  GovernanceTransport,
  PublicHealthOptions,
} from '@omne-harness-lite/governance-center-entry-https-json'

export async function inspectCenter(transport: GovernanceTransport, options: PublicHealthOptions) {
  return transport.readPublicHealth(options)
}
```

The caller supplies a transport and an HTTPS endpoint with explicit trust requirements. The function sends a request only when called.

## Boundaries and lifecycle

These client contracts retain the EC2/HT2 protocol. Server-side EC3/HT3 commitments do not implicitly upgrade the client protocol. See the exact scope in [SPEC.md](SPEC.md).

A transport performs one attempt. It does not select a center, store a login, accept new trust or schedule retries. Public health reachability does not establish business readiness.

Cancellation requests stopping, not completed cleanup. Preserve `sendAttempted` information when a request might reach the server. Do not report an uncertain remote effect as a definite failure.

## Development

```sh
pnpm --filter @omne-harness-lite/governance-center-entry-https-json run build
pnpm --filter @omne-harness-lite/governance-center-entry-https-json run typecheck
pnpm --filter @omne-harness-lite/governance-center-entry-https-json run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

## Related packages

- [Node HTTPS client provider](../../frontend/governance-center-client-https/README.md)
- [Server-entry definitions](../governance-center-entry/README.md)
