# assembly-manifest

[中文说明](README_ZH.md)

Assembly manifest values, operation types and Cordis Service definition. A manifest records selected assembly inputs. This package does not persist manifests or load plugins.

## Public entries

The root exports public types and standalone functions. `./cordis` contains the integration binding. Import each through its explicit package export.

- [Root exports](src/index.ts)
- [Cordis](src/cordis.ts)

Unmigrated behavior retains its exact sources through the [architecture maintenance entry](../../../.meta_harness/design/architecture/README.md).

The template marker reports structural adoption. It does not establish complete business or lifecycle acceptance.

## Development

Run from the repository root:

```sh
pnpm --filter @omne-harness-lite/assembly-manifest run build
pnpm --filter @omne-harness-lite/assembly-manifest run typecheck
pnpm --filter @omne-harness-lite/assembly-manifest run test
```
