# @omne-harness-lite/account-registration-sequential

[中文](README_ZH.md)

A sequential registration provider that coordinates account creation, personal organization creation and activation. It also exposes the expired-account purge chain.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/account-registration-sequential": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                  | Purpose                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------ |
| `createRegistrationService`, `RegistrationDeps`, `RegistrationInstance` | Independent coordinator with register, purge and close |
| `AccountRegistrationConfigSchema`                                       | Cordis configuration validation                        |
| `./cordis`: `registrationPlugin`, `managedRegistrationPlugin`           | Independent and assembly-managed bindings              |

## Example

```ts
import {
  createRegistrationService,
  type RegistrationDeps,
} from '@omne-harness-lite/account-registration-sequential'

export async function registerAccount(
  dependencies: RegistrationDeps,
  loginIdentifier: unknown,
  credential: unknown,
) {
  const registration = createRegistrationService(dependencies)
  try {
    return await registration.register(loginIdentifier, credential)
  } finally {
    await registration.close()
  }
}
```

Supply public participant services, a valid activation signing key, a generation-state callback and a safe defect recorder. Never record the presented credential.

## Boundaries and lifecycle

The chain performs three separate commits. It does not open a shared transaction, compensate earlier commits or schedule background recovery. Idempotency and warrant ownership follow [the public contract](../../core/account-registration/SPEC.md).

The coordinator checks generation eligibility before each next step. Close prevents new work and waits for the current participant call. It does not cancel a handed-out step or close borrowed services.

Purge classifies terminal, defect and transient failures. Unexpected exceptions propagate. The managed binding uses an assembly lifetime port. Exact stopping and outcome behavior belongs to [SPEC.md](SPEC.md).

## Development

```sh
pnpm --filter @omne-harness-lite/account-registration-sequential run build
pnpm --filter @omne-harness-lite/account-registration-sequential run typecheck
pnpm --filter @omne-harness-lite/account-registration-sequential run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

## Related packages

- [Registration definitions](../../core/account-registration/README.md)
- [Account provider](../account-identity-sql/README.md)
