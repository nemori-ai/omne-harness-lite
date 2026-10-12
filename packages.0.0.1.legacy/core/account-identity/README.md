# @omne-harness-lite/account-identity

[中文](README_ZH.md)

Public definitions for global accounts, login states and credential verification. This package supplies types and presentation validation. It does not store accounts or derive passwords.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/account-identity": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                            | Purpose                                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `AccountsService`, `LoginsService`                                | Account and login operations, outcomes and transaction participation                            |
| `CredentialsService`, `PresentedCredential`, `CredentialMaterial` | Credential parsing, derivation, verification and policy checks                                  |
| `parseLoginStatePresentation`, `MAX_PRESENTATION_SCALAR_VALUES`   | Validate an opaque login presentation                                                           |
| `./cordis`: `Accounts`, `Logins`, `Credentials`                   | Shared Service definitions and `ACCOUNTS_SERVICE`, `LOGINS_SERVICE`, `CREDENTIALS_SERVICE` keys |

## Example

```ts
import assert from 'node:assert/strict'
import { parseLoginStatePresentation } from '@omne-harness-lite/account-identity'
import { isOk } from '@omne-harness-lite/identity-values'

const parsed = parseLoginStatePresentation('opaque-example')
assert.ok(isOk(parsed))
assert.equal(isOk(parseLoginStatePresentation('')), false)
```

Parsing checks representation only. A successful parse does not authenticate a login or authorize tenant access. Do not print real presentations.

## Boundaries and lifecycle

Providers must preserve the account and login behavior in [SPEC.md](SPEC.md). Account reads can persist monotonic expiry facts. Credential material remains opaque to the account owner. A credential provider failure is not a password mismatch.

Cross-owner atomic operations require the exact same `StorageUnit`. A shared database filename is insufficient. Commit notifications are best effort after commit.

Prepared credential-change tickets belong to one provider instance and allow one attempt, including failed attempts. Provider replacement must not revive tickets. Runtime isolation does not replace tenant authorization.

## Development

```sh
pnpm --filter @omne-harness-lite/account-identity run build
pnpm --filter @omne-harness-lite/account-identity run typecheck
pnpm --filter @omne-harness-lite/account-identity run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

## Related packages

- [SQL account provider](../../tenancy/account-identity-sql/README.md)
- [scrypt credential provider](../../tenancy/credential-verification-scrypt/README.md)
