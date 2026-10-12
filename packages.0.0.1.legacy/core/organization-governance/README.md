# @omne-harness-lite/organization-governance

[中文](README_ZH.md)

Public organization, membership, offer and purge contracts. It defines operations, typed events and explicit transaction participation without a SQL implementation.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/organization-governance": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                    | Purpose                                                                                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `OrganizationsService`, `MembershipsService`                              | Organization hierarchy, membership and tenant selection                                                                 |
| `OffersService`, `OrganizationPurgeService`                               | Invitations, affiliation requests and personal-organization purge                                                       |
| `OrganizationGovernanceConfig`, `OrganizationGovernanceEvents`            | Configuration and typed event definitions                                                                               |
| `AFFILIATION_DIRECTIONS`, reading and failure types                       | Shared values and operation results                                                                                     |
| `./cordis`: `Organizations`, `Offers`, `Memberships`, `OrganizationPurge` | Shared Services and `ORGANIZATIONS_SERVICE`, `OFFERS_SERVICE`, `MEMBERSHIPS_SERVICE`, `ORGANIZATION_PURGE_SERVICE` keys |

## Example

```ts
import type { MembershipsService } from '@omne-harness-lite/organization-governance'

export async function readCurrentTenant(
  memberships: MembershipsService,
  loginStateId: Parameters<MembershipsService['currentTenant']>[0],
) {
  return memberships.currentTenant(loginStateId)
}
```

The caller supplies a live provider and a parsed login-state identifier. Preserve login rejection and availability outcomes. Reading a selection does not authorize subsequent operations.

## Boundaries and lifecycle

Natural-person identity and tenant membership remain separate. Cross-tenant access requires explicit authorization. An isolation label cannot grant permission.

Same-commit account, login and organization participation requires the same storage unit. Participants must propagate failures to the transaction owner. Notifications occur after commit and do not guarantee delivery.

The implemented business scope is OG2. These definitions do not claim delivery of later asset operations or cross-storage atomicity. Persistent business facts survive provider replacement. Exact commitments and remaining obligations belong to [SPEC.md](SPEC.md).

## Development

```sh
pnpm --filter @omne-harness-lite/organization-governance run build
pnpm --filter @omne-harness-lite/organization-governance run typecheck
pnpm --filter @omne-harness-lite/organization-governance run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

## Related packages

- [SQL organization provider](../../tenancy/organization-governance-sql/README.md)
