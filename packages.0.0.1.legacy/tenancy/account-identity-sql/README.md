# @omne-harness-lite/account-identity-sql

[中文](README_ZH.md)

SQL account and login provider. The independent factory and Cordis bindings share the same public account-identity interfaces and lifecycle owner.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/account-identity-sql": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                               | Purpose                                                        |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `createAccountIdentity`, `AccountIdentityDependencies`, `AccountIdentityInstance`    | Account/login service faces and shared close                   |
| `AccountIdentityConfigSchema`, `AccountIdentityStopped`                              | Configuration validation and stopped-instance use error        |
| `accountIdentityMigrations`, `ACCOUNT_TABLE`, `ACCOUNT_ID_COLUMN`                    | Caller-composed schema migrations and shared table coordinates |
| `accountIdentitySnapshotCheck`, `ACCOUNT_SNAPSHOT_TABLES`, `Diagnostics`, `Notifier` | Maintenance checks and notification/diagnostic dependencies    |
| `./cordis`: `accountIdentityPlugin`, `managedAccountIdentityPlugin`                  | Independent and assembly-managed bindings                      |

## Example

```ts
import type { AccountIdentityConfig } from '@omne-harness-lite/account-identity'
import {
  createAccountIdentity,
  type AccountIdentityDependencies,
} from '@omne-harness-lite/account-identity-sql'

export async function readAccount(
  config: AccountIdentityConfig,
  dependencies: AccountIdentityDependencies,
  accountId: unknown,
) {
  const identity = createAccountIdentity(config, dependencies)
  try {
    return await identity.accounts.read(accountId)
  } finally {
    await identity.close()
  }
}
```

Supply migrated storage, a live clock, credential resolution and valid verification keys. The function returns the public reading outcome without exposing credential material.

## Boundaries and lifecycle

The caller owns storage, clock and credential providers. Keep them alive until admitted account/login work completes. `close()` stops new ordinary operations, drains admitted work and clears prepared tickets. It does not close borrowed dependencies.

Participation objects remain governed by their original storage unit. Account and organization same-commit work requires the same storage instance. Do not substitute separate transactions.

Credential material remains opaque. Commit notifications are best effort. Invalid configuration rejects startup. The managed binding also requires an assembly lifetime port. Exact preserved behavior belongs to [SPEC.md](SPEC.md).

## Development

```sh
pnpm --filter @omne-harness-lite/account-identity-sql run build
pnpm --filter @omne-harness-lite/account-identity-sql run typecheck
pnpm --filter @omne-harness-lite/account-identity-sql run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

Tests use real temporary SQLite files. This package’s checks do not close PostgreSQL or distributed deployment obligations.

## Related packages

- [Public account definitions](../../core/account-identity/README.md)
- [Organization provider](../organization-governance-sql/README.md)

The private record interface separates account and login policy from SQL operations. The factory binds public transaction units to the original storage instance. See [the boundary decision](adr/policy-persistence.md) for ownership and verification requirements.
