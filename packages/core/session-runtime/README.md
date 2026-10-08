# @omne-harness-lite/session-runtime

[中文](README_ZH.md)

Session operations, receipts, coordination ports, and attempt facts. This package defines the service contract; it does not provide a Session scheduler or database.

The root exports operation checks and attempt-fact codecs. The `./cordis` entry exports service definitions for application assembly.

Public types and functions belong to this package. [SPEC.md](SPEC.md) states behavior that types cannot express. [Public entry tests](tests/facts.spec.ts) provide executable examples. Delivery review and acceptance are separate from implementation.

Follow the [development guide](../../../docs/development.md). Build dependencies first.

```sh
pnpm --filter @omne-harness-lite/session-runtime run build
pnpm --filter @omne-harness-lite/session-runtime run typecheck
pnpm --filter @omne-harness-lite/session-runtime run test
```
