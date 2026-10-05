# @omne-harness-lite/organization-governance-sql

[中文](README_ZH.md)

SQL organization governance provider. Four service faces share an admission and completion owner while preserving organization, offer, membership and purge semantics.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/organization-governance-sql": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                                                            | Purpose                                               |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `createOrganizationGovernance`, `OrganizationGovernanceDependencies`, `OrganizationGovernanceInstance`            | Four public faces with shared close                   |
| `createOrganizationsService`, `createMembershipsService`, `createOffersService`, `createOrganizationPurgeService` | Separately usable lower-level factories               |
| `OrganizationGovernanceConfigSchema`, `ResolvedOrganizationGovernanceConfig`                                      | Binding validation and resolved factory configuration |
| `organizationGovernanceMigrations`, `OG_TABLES`, snapshot exports                                                 | Schema composition and maintenance checks             |
| `OrganizationGovernanceStopped`, `StoredRecordMalformed`, `ParentChainCycle`                                      | Lifecycle use error and stored-data defects           |
| `./cordis`: `organizationGovernancePlugin`, `managedOrganizationGovernancePlugin`                                 | Independent and assembly-managed bindings             |

## Example

```ts
import {
  createOrganizationGovernance,
  type OrganizationGovernanceDependencies,
} from '@omne-harness-lite/organization-governance-sql'

export async function readOrganization(
  dependencies: OrganizationGovernanceDependencies,
  organizationId: unknown,
) {
  const governance = createOrganizationGovernance(dependencies)
  try {
    return await governance.organizations.read(organizationId)
  } finally {
    await governance.close()
  }
}
```

Supply migrated storage, clock, account/login participants and resolved configuration with valid signing keys. The factory borrows these dependencies and does not close them.

## Boundaries and lifecycle

Account, login and organization participation must use the same `AtomicStorage` instance and `StorageUnit`. Same-commit failure must propagate to the transaction owner. Do not degrade a failed participation check into separate transactions.

Close stops ordinary admission across all four faces and drains complete admitted promises. Existing participation objects remain bounded by their original unit. The separate lower-level factories leave completion coordination to their caller.

Commit notifications are best effort and contain no credentials. Replacement preserves persistent facts. Malformed stored data and cycles are defects, not availability failures.

SQLite is the current verified host composition. This package does not establish PostgreSQL recovery, distributed atomicity or later OG3 asset operations. Exact scope belongs to [SPEC.md](SPEC.md).

## Development

```sh
pnpm --filter @omne-harness-lite/organization-governance-sql run build
pnpm --filter @omne-harness-lite/organization-governance-sql run typecheck
pnpm --filter @omne-harness-lite/organization-governance-sql run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

Tests use real temporary SQLite files and exercise business failures, rollback and provider integration. Other database combinations need their own evidence.

## Related packages

- [Public governance definitions](../../core/organization-governance/README.md)
- [Account provider](../account-identity-sql/README.md)
