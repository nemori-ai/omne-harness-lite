# model-profile-directory

[中文说明](README_ZH.md)

Model profile directory operation types, judgment values, equality and input helpers. Concrete profile providers implement these public definitions.

## Public entries

The root exports public types and standalone functions. `./cordis` contains the integration binding. Import each through its explicit package export.

- [Root exports](src/index.ts)
- [Cordis](src/cordis.ts)

Unmigrated behavior retains its exact sources through the [architecture maintenance entry](../../../.meta_harness/design/architecture/README.md).

The template marker reports structural adoption. It does not establish complete business or lifecycle acceptance.

## Development

Run from the repository root:

```sh
pnpm --filter @omne-harness-lite/model-profile-directory run build
pnpm --filter @omne-harness-lite/model-profile-directory run typecheck
pnpm --filter @omne-harness-lite/model-profile-directory run test
```
