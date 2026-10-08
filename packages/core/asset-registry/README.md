# asset-registry

[中文说明](README_ZH.md)

Shared asset registry types, tables, reports and record codecs. Concrete storage and registry operations belong to providers.

## Public entries

The root exports public types and standalone functions. `./cordis` contains the integration binding. Import each through its explicit package export.

- [Root exports](src/index.ts)
- [Cordis](src/cordis.ts)

Unmigrated behavior retains its exact sources through the [architecture maintenance entry](../../../.meta_harness/design/architecture/README.md).

The template marker reports structural adoption. It does not establish complete business or lifecycle acceptance.

## Development

Run from the repository root:

```sh
pnpm --filter @omne-harness-lite/asset-registry run build
pnpm --filter @omne-harness-lite/asset-registry run typecheck
pnpm --filter @omne-harness-lite/asset-registry run test
```

Behavior belongs to [SPEC](SPEC.md). Check methods and limits belong to [verification](verification/README.md).
