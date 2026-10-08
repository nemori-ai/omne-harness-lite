# @omne-harness-lite/agent-loop

[中文](README_ZH.md)

Deterministic decisions over fixed Session observations, with explicit attempt execution and release ports.

Use `nextStep` for pure decisions. Use `createAttemptOwner`, `driveStep`, and `releaseAttempt` with capabilities supplied by their real owners. Missing capabilities return blocked; they do not complete an operation.

Public types and functions belong to this package. [SPEC.md](SPEC.md) states behavior that types cannot express. [Public entry tests](tests/loop.spec.ts) provide executable examples. Delivery review and acceptance are separate from implementation.

Follow the [development guide](../../../docs/development.md). Build dependencies first.

```sh
pnpm --filter @omne-harness-lite/agent-loop run build
pnpm --filter @omne-harness-lite/agent-loop run typecheck
pnpm --filter @omne-harness-lite/agent-loop run test
```
