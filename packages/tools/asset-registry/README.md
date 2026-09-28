# @omne-harness-lite/asset-registry

[中文](README_ZH.md)

Experimental session asset-table implementation. It is an unpublished ESM workspace scaffold: declarations/build exist, but its component checks are not passing and the full service is not accepted as delivered. The model-runtime vertical will complete only its required projection first. See [realization status](../../../.meta_harness/design/realization/packages/tools/asset-registry/README.md).

Loop extension declarations use the current `@omne-harness-lite/loop-extension` public types.

## Declared public surface

| Export | Purpose |
| --- | --- |
| `createAssetRegistry` | Construct an explicit dependency-bound registry closure |
| `AssetRegistryService` | Declares fill/reload, availability refresh, lookup/list, mark-failed and asset-change operations |
| `REGISTERED_CATEGORIES` | Inspect table categories |
| `buildTableContents`, `buildSnapshots`, `computeAvailability`, `findInSnapshot`, `buildReport` | Separately exposed construction/projection helpers |
| `extractRootSourceFromFullFillRecord` | Read original root source from a complete-fill record |
| `assetRegistryPlugin`, `ASSET_REGISTRY_SERVICE` | Experimental Cordis provider declaration |

## Inspect the interface

```ts
import { REGISTERED_CATEGORIES, type AssetRegistryService } from '@omne-harness-lite/asset-registry'

console.log(REGISTERED_CATEGORIES)
export async function readTools(registry: AssetRegistryService, session: string, within: unknown) {
  return registry.list(session, 'tool', within)
}
```

The example shows the public call shape only; it requires a genuinely initialized registry and does not establish that this unfinished provider is operational. Inspect classified `failure` results and `none` lookup results. Dependencies include real manifest history, current/fixed input sources, tenant mapping, clock and explicit conflict/capacity/diagnostic policy; do not replace them with invented success facts.

Close the registry before releasing its borrowed dependencies. Full command notification and generic registry delivery are outside the current runtime increment. Build first, then run the current checks; retain failures.

```sh
pnpm --filter @omne-harness-lite/asset-registry... run build
pnpm --filter @omne-harness-lite/asset-registry run typecheck
pnpm --filter @omne-harness-lite/asset-registry run test
```
