# @omne-harness-lite/governance-center-client-https

[中文](README_ZH.md)

A Node HTTPS/JSON client for public health and governance exchange. Use individual request functions or an instance with explicit completion ownership.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/governance-center-client-https": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                      | Purpose                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `readPublicHealth`, `exchangeGovernance`                                    | Standalone single-attempt request functions                  |
| `createGovernanceTransport`, `GovernanceTransportInstance`                  | Request owner with public transport operations and `close()` |
| `./cordis`: `governanceTransportPlugin`, `managedGovernanceTransportPlugin` | Independent and assembly-managed bindings                    |

## Example

```ts
import type { PublicHealthOptions } from '@omne-harness-lite/governance-center-entry-https-json'
import { createGovernanceTransport } from '@omne-harness-lite/governance-center-client-https'

export async function inspectHealth(options: PublicHealthOptions) {
  const transport = createGovernanceTransport()
  try {
    return await transport.readPublicHealth(options)
  } finally {
    await transport.close()
  }
}
```

Calling this function sends one request. Supply the intended HTTPS endpoint and its trust configuration. The function retains the instance until cleanup completes.

## Boundaries and lifecycle

Public input and outcome types belong to [the transport definition](../../core/governance-center-entry-https-json/README.md). Invalid configuration fails before network I/O. The default timeout is 10,000 ms, with an accepted range of 1–120,000 ms.

Requests do not retry, follow redirects or accept new trust automatically. Response headers and bodies have bounded sizes. Cancellation preserves possible send effects.

Instance close stops new requests and waits for its owned request/socket cleanup. It does not close requests from standalone functions or other instances. DNS work can outlive socket cleanup. The managed binding uses an injected assembly lifetime port. See [SPEC.md](SPEC.md).

## Development

```sh
pnpm --filter @omne-harness-lite/governance-center-client-https run build
pnpm --filter @omne-harness-lite/governance-center-client-https run typecheck
pnpm --filter @omne-harness-lite/governance-center-client-https run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

Tests use local TLS servers. They require no paid model calls or public governance service.

## Related packages

- [Local client coordinator](../governance-client-operations-local/README.md)
