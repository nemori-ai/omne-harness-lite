# execution-environments

[中文说明](README_ZH.md)

Environment discovery, placement, acquisition and resource lifecycle contracts. References locate environments. They do not grant authority or prove physical isolation.

## Public entries

The root exports public types and standalone functions. `./cordis` contains the integration binding. Import each through its explicit package export.

- [Root exports](src/index.ts)
- [Cordis](src/cordis.ts)

Behavior beyond types belongs to [SPEC.md](SPEC.md).

The template marker reports structural adoption. It does not establish complete business or lifecycle acceptance.

The command facility includes one-shot execution, persistent terminal creation, later terminal execution, close, and information. The files facility includes byte reads, conditional writes, metadata, queries, mutations, and batch recognition. Resource adoption and maintenance recovery are separate from business authorization. Public operation types own these shapes. EE-21–25 in SPEC.md own the behavior beyond types.

## Development

Run from the repository root:

```sh
pnpm --filter @omne-harness-lite/execution-environments run build
pnpm --filter @omne-harness-lite/execution-environments run typecheck
pnpm --filter @omne-harness-lite/execution-environments run test
```
