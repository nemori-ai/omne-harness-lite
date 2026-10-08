# runtime-context

[中文说明](README_ZH.md)

Session context registration, reading and observation contracts with context decoding. Source access, durable writes and provider drain remain explicit responsibilities.

## Public entries

The root exports public types and standalone functions. `./cordis` contains the integration binding. Import each through its explicit package export.

- [Root exports](src/index.ts)
- [Cordis](src/cordis.ts)

Behavior beyond types belongs to [SPEC.md](SPEC.md).

The template marker reports structural adoption. It does not establish complete business or lifecycle acceptance.

[Observation model and limits](verification/models/README.md)

## Development

Run from the repository root:

```sh
pnpm --filter @omne-harness-lite/runtime-context run build
pnpm --filter @omne-harness-lite/runtime-context run typecheck
pnpm --filter @omne-harness-lite/runtime-context run test
```
