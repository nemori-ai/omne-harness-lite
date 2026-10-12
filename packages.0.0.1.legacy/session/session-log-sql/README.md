# @omne-harness-lite/session-log-sql

[中文](README_ZH.md)

A SQL Session Log provider with fixed source tokens, current authorization, and participation in a shared StorageUnit.

Use `openSqlSessionLog` with explicit storage, authority, and operation limits. Install `sessionLogMigrations` in that storage. The root exports the factory; `./cordis` exports the provider plugin. Storage is borrowed and must outlive all journal work and borrows.

Public types and functions belong to this package. [SPEC.md](SPEC.md) states behavior that types cannot express. [Public entry tests](tests/journal.spec.ts) provide executable examples. Delivery review and acceptance are separate from implementation.

Follow the [development guide](../../../docs/development.md). Build dependencies first.

```sh
pnpm --filter @omne-harness-lite/session-log-sql run build
pnpm --filter @omne-harness-lite/session-log-sql run typecheck
pnpm --filter @omne-harness-lite/session-log-sql run test
```
