# model-request-runtime

[中文说明](README_ZH.md)

The root owns the fifteen-operation runtime interfaces, transport and construction types, log codecs, the OriginalIssue participant protocol, and pure retry calculation. `SPEC.md` owns the migrated behavior. Full durable operation rules retain their precise unmigrated sources. The local provider implements these public contracts.

## Public entries

The root exports public types and standalone functions. `./cordis` contains the integration binding. Import each through its explicit package export.

- [Root exports](src/index.ts)
- [Cordis](src/cordis.ts)

Behavior beyond types belongs to [SPEC.md](SPEC.md).

The template marker reports structural adoption. It does not establish complete business or lifecycle acceptance.

## Development

Run from the repository root:

```sh
pnpm --filter @omne-harness-lite/model-request-runtime run build
pnpm --filter @omne-harness-lite/model-request-runtime run typecheck
pnpm --filter @omne-harness-lite/model-request-runtime run test
```
