# tool-execution-runtime

[中文说明](README_ZH.md)

Tool execution, results, provider construction and journal contracts with journal codecs and projections. Runtime owners confirm durable intent before external effects. Bare invocation does not supply persistent uniqueness or recovery.

## Public entries

The root exports public types and standalone functions. `./cordis` contains the integration binding. Import each through its explicit package export.

- [Root exports](src/index.ts)
- [Cordis](src/cordis.ts)

Behavior beyond types belongs to [SPEC.md](SPEC.md).

The template marker reports structural adoption. It does not establish complete business or lifecycle acceptance.

## Development

Run from the repository root:

```sh
pnpm --filter @omne-harness-lite/tool-execution-runtime run build
pnpm --filter @omne-harness-lite/tool-execution-runtime run typecheck
pnpm --filter @omne-harness-lite/tool-execution-runtime run test
```
