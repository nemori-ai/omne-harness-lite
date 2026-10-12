# @omne-harness-lite/account-registration

[中文](README_ZH.md)

Public registration and expired-account purge contracts. This package defines outcomes and Cordis service bindings. A separate provider coordinates the participating owners.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/account-registration": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                    | Purpose                                                          |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `RegistrationService`                                                     | `register` and `purgeExpired` consumer interface                 |
| `TERMINAL_OUTCOMES`, `TerminalOutcome`                                    | Registered, identifier taken, credential rejected or interrupted |
| `PurgeExpiredResult`, `PURGE_FAILURE_CLASSES`, `RegistrationDefectRecord` | Classified purge results and defect records                      |
| `RegistrationStopped`                                                     | Purge work stopped between steps                                 |
| `./cordis`: `Registration`, `REGISTRATION_SERVICE`                        | Public Service definition and key                                |

## Example

```ts
import type { RegistrationService } from '@omne-harness-lite/account-registration'

export async function registerAccount(
  service: RegistrationService,
  loginIdentifier: unknown,
  credential: unknown,
) {
  return service.register(loginIdentifier, credential)
}
```

The caller supplies a live provider. Preserve all four terminal outcomes. Keep the presented credential out of logs and reports.

## Boundaries and lifecycle

Registration performs three independent commits: account production, personal organization creation and account activation. It does not promise one transaction or automatic compensation.

Stopping prevents the next step. It does not cancel work already handed to a participant. Registration reports interruption. Purge uses `RegistrationStopped` for the specified stop boundary.

This definition does not schedule background purge work. The provider and its caller retain dependencies until admitted work completes. Exact behavior belongs to [SPEC.md](SPEC.md).

## Development

```sh
pnpm --filter @omne-harness-lite/account-registration run build
pnpm --filter @omne-harness-lite/account-registration run typecheck
pnpm --filter @omne-harness-lite/account-registration run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

## Related packages

- [Sequential provider](../../tenancy/account-registration-sequential/README.md)
