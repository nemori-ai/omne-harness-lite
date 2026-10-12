# loop-extension-runner

[中文说明](README_ZH.md)

Runner chain, admission, action and history contracts with pure codecs and input helpers. This definition package does not run an Agent Loop.

## Public entries

The root exports public types and standalone functions. `./cordis` contains the integration binding. Import each through its explicit package export.

- [Root exports](src/index.ts)
- [Cordis](src/cordis.ts)

Behavior beyond types belongs to [SPEC.md](SPEC.md).

The template marker reports structural adoption. It does not establish complete business or lifecycle acceptance.

## Development

Run from the repository root:

```sh
pnpm --filter @omne-harness-lite/loop-extension-runner run build
pnpm --filter @omne-harness-lite/loop-extension-runner run typecheck
pnpm --filter @omne-harness-lite/loop-extension-runner run test
```
