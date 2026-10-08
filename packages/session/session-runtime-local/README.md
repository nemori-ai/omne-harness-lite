# @omne-harness-lite/session-runtime-local

[中文](README_ZH.md)

This package provides persistent local admission for Session operations. The root exports independent functions and trusted construction ports. Session behavior belongs to [the public definition](../../core/session-runtime/SPEC.md). Provider behavior belongs to [SPEC.md](SPEC.md).

## Admission

Compose `admissionMigrations` on the shared root database. Compose `admissionUseMigrations` on each tenant runtime database. Then call `createLocalAdmission` with the root storage, the trusted governance probe, and explicit capacity limits. The caller owns both storage instances and the probe.

Reserve the original target before network IO. Query only the active ticket. Consume a ready ticket in the actual tenant unit. The recorded ticket use and the original business receipt commit together. A ticket is a coordinate; it does not grant permission. Keep live guards inside their callbacks.

Login rejection and member rejection have different scopes. A new login handle cannot erase an unresolved member observation. Existing Run execution requires its own persisted grant and current execution fences.

## Shared-unit state

Compose `sessionStateMigrations` on the tenant runtime database. The trusted coordinator constructs `createLocalSessionState` with current authority, explicit limits, and the original work settlement reader. The participant uses the caller's storage unit. The coordinator must commit its log facts and receipts in that same unit. A staged state result does not prove public admission or consumption.

The participant retains pending input positions until adoption. It rejects reused terminal Run identities and copied or rolled-back Attempt permits. Completion requires no pending input and settled original work. Full Session operations and execution recovery remain under construction.

## Shared-unit receipts

Compose `operationReceiptMigrations` on the tenant runtime database. Construct `createLocalOperationReceipts` with the fixed tenant, current authority, and actual log participant. Lookup uses the complete `OperationRef`. Creation lookup does not require the assigned Session identity. Same-semantic replay preserves the original receipt snapshot. A different semantic is rejected. New receipts check the staged log coordinate. The coordinator must pair the original business fact, state, and pending qualification before committing.

## Development

Follow [workspace setup](../../../docs/development.md). Build dependencies first.

```sh
pnpm --filter @omne-harness-lite/session-runtime-local build
pnpm --filter @omne-harness-lite/session-runtime-local typecheck
pnpm --filter @omne-harness-lite/session-runtime-local test
```

The tests use real SQLite transactions and an actual process crash. They do not replace CLI, OpenRouter, tool, or complete recovery acceptance. The Cordis binding is under construction; the package does not yet carry a template adoption marker.
