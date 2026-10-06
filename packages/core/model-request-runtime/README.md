# model-request-runtime

[中文说明](README_ZH.md)

Model request data, transport and construction types, codecs and pure retryDelay calculation. SPEC.md owns the migrated pure retry behavior only. The full fifteen-operation runtime and durable lifecycle retain their precise existing sources.

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
