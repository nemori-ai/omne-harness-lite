# runtime-context-local

[中文说明](README_ZH.md)

The standalone `createRuntimeContext` factory owns mutations, current SQL projection, sources, observation and a trusted initializer. The log remains the fact source. Apply `runtimeContextMigrations` before starting the owner. The Cordis `createRuntimeContextLocal` factory uses managed assembly work and borrows the original log backing. The initializer is absent from the public service. Cold recovery verifies the log prefix; warm selected reads load requested keys and apply only the new suffix.

Models, assumptions and run instructions belong to [verification](verification/README.md). Delivery evidence must establish lifecycle and cost behavior; the module structure alone does not establish them.

## Public entries

The root exports public types and standalone functions. `./cordis` contains the integration binding. Import each through its explicit package export.

- [Root exports](src/index.ts)
- [Cordis](src/cordis.ts)

Behavior beyond types belongs to [SPEC.md](SPEC.md).

The template marker reports structural adoption. It does not establish complete business or lifecycle acceptance.

## Development

Run from the repository root:

```sh
pnpm --filter @omne-harness-lite/runtime-context-local run build
pnpm --filter @omne-harness-lite/runtime-context-local run typecheck
pnpm --filter @omne-harness-lite/runtime-context-local run test
```
