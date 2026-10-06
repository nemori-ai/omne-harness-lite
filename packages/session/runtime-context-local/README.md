# runtime-context-local

[中文说明](README_ZH.md)

Standalone createRuntimeContext and createContextSessionInitializer factories, history inspection and context projection. The owner replays durable prefixes. It does not provide the later persistent current projection or O(1) requirement.

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
