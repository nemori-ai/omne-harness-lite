# tool-admission

[中文说明](README_ZH.md)

Tool admission, runner pass source and checked action history contracts. Admission tokens locate conclusions. Persistent verification and current authority determine whether execution can start.

## Public entries

The root exports public types and standalone functions. `./cordis` contains the integration binding. Import each through its explicit package export.

- [Root exports](src/index.ts)
- [Cordis](src/cordis.ts)

Behavior beyond types belongs to [SPEC.md](SPEC.md).

The template marker reports structural adoption. It does not establish complete business or lifecycle acceptance.

## Development

Run from the repository root:

```sh
pnpm --filter @omne-harness-lite/tool-admission run build
pnpm --filter @omne-harness-lite/tool-admission run typecheck
pnpm --filter @omne-harness-lite/tool-admission run test
```
