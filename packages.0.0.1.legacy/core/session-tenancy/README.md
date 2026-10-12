# session-tenancy

[中文说明](README_ZH.md)

Tenant/session value types and live SessionAccess contracts. Trusted entry issuers verify current identity and authorization. A brand or serialized value cannot recreate a live access binding.

## Public entries

The root exports public types and standalone functions. `./cordis` contains the integration binding. Import each through its explicit package export.

- [Root exports](src/index.ts)
- [Cordis](src/cordis.ts)

Behavior beyond types belongs to [SPEC.md](SPEC.md).

The template marker reports structural adoption. It does not establish complete business or lifecycle acceptance.

## Development

Run from the repository root:

```sh
pnpm --filter @omne-harness-lite/session-tenancy run build
pnpm --filter @omne-harness-lite/session-tenancy run typecheck
pnpm --filter @omne-harness-lite/session-tenancy run test
```
