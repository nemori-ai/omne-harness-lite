# @omne-harness-lite/model-message-projection

[中文](README_ZH.md)

Model-readable message views from a fixed committed Session Log prefix, with a bounded incremental cache.

Use `projectMessages` and `materializeMessages` for a fixed view. Cache creation requires explicit limits and all current external input keys. Immutable segments share the unchanged prefix; fact events do not become model messages.

Use `createModalityProjection` with a fixed tenant and Session for model selection. It derives historical modality requirements from an owned full prefix. Compaction does not remove those requirements. Repeated reads at the same tail reuse the result; the cost of obtaining the full prefix remains separate.

Public types and functions belong to this package. [SPEC.md](SPEC.md) states behavior that types cannot express. [Public entry tests](tests/projection.spec.ts) provide executable examples. Delivery review and acceptance are separate from implementation.

Follow the [development guide](../../../docs/development.md). Build dependencies first.

```sh
pnpm --filter @omne-harness-lite/model-message-projection run build
pnpm --filter @omne-harness-lite/model-message-projection run typecheck
pnpm --filter @omne-harness-lite/model-message-projection run test
```
