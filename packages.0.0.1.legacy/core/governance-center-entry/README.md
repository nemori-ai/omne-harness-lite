# @omne-harness-lite/governance-center-entry

[中文](README_ZH.md)

Public server-entry coordinates: center identity, routes, typed notifications, admission and maintenance resources. This package does not listen on a network socket.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/governance-center-entry": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                               | Purpose                                                                       |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `EntryOpeningSignal`, `EntryOpeningStopped`                                          | Generation admission and stopped-wait behavior                                |
| `EntryMaintenanceResources`                                                          | Runtime maintenance dependencies                                              |
| `GovernanceCenterId`, `isGovernanceCenterId`                                         | Center identifier shape and validation                                        |
| `PUBLIC_HEALTH_ROUTE`, `ROUTE_IDS`, `ACCEPTED_PROTOCOL_VERSIONS`                     | Public health route, route identifiers and accepted protocol versions         |
| `SERVING_EVENT`, `STOPPED_EVENT`, `DEFECT_EVENT`, `LISTENING_EVENT`, `ServingNotice` | Public typed notification names and payload                                   |
| `./cordis`: `EntryOpening`, `EntryMaintenance`                                       | Shared Services and `ENTRY_OPENING_SERVICE`, `ENTRY_MAINTENANCE_SERVICE` keys |
| `./schema/v2`                                                                        | Public EC2 wire schemas                                                       |

## Example

```ts
import assert from 'node:assert/strict'
import {
  isGovernanceCenterId,
  ACCEPTED_PROTOCOL_VERSIONS,
} from '@omne-harness-lite/governance-center-entry'

assert.equal(isGovernanceCenterId('0123456789abcdef0123456789abcdef'), true)
assert.equal(isGovernanceCenterId('not-a-center-id'), false)
assert.deepEqual(ACCEPTED_PROTOCOL_VERSIONS, ['2'])
```

Identifier validation checks shape only. It does not establish center trust. Protocol constants do not prove that an entry is listening or open.

## Boundaries and lifecycle

A fulfilled opening wait is not continuing permission. The host owns generation confirmation and opening. The entry must check `isOpen()` again at each admission boundary.

Stopping admission does not cancel already admitted business work. Keep its dependencies until actual completion. Notifications report state and do not grant authorization or undo committed data.

Runtime maintenance resources travel through services, not serializable plugin configuration. The operation, event and lifecycle commitments belong to [SPEC.md](SPEC.md).

## Development

```sh
pnpm --filter @omne-harness-lite/governance-center-entry run build
pnpm --filter @omne-harness-lite/governance-center-entry run typecheck
pnpm --filter @omne-harness-lite/governance-center-entry run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

## Related packages

- [Node server provider](../../tenancy/governance-center-entry-node/README.md)
