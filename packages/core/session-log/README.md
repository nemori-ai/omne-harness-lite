# session-log

[中文说明](README_ZH.md)

Session log, backing ownership and coordinated access contracts. A complete decoded prefix and physical owner generation establish the shared log boundary. Reading a reference does not authorize access.

## Public entries

The root exports public types and standalone functions. `./cordis` contains the integration binding. Import each through its explicit package export.

- [Root exports](src/index.ts)
- [Cordis](src/cordis.ts)

Behavior beyond types belongs to [SPEC.md](SPEC.md).

The template marker reports structural adoption. It does not establish complete business or lifecycle acceptance.

## Development

Run from the repository root:

```sh
pnpm --filter @omne-harness-lite/session-log run build
pnpm --filter @omne-harness-lite/session-log run typecheck
pnpm --filter @omne-harness-lite/session-log run test
```
