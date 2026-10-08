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

The root also exports `createLocalSessionIngress` and `sessionRuntimeMigrations`.
This function composes persistent creation, input admission, receipts, and reads.
Its trusted bootstrap port must initialize the actual Session before publication.
The trusted `lifecycle` port also coordinates Run creation, the first attempt, input adoption, call preparation, and completion. It persists the original Run grant and step receipt with the state and log facts. A new Run requires its own login check. An existing Run uses its original grant. Step replay returns the original receipt and does not issue another permit. Cancellation, archival, execution recovery, and complete call coordination remain under construction.
See [SPEC.md](SPEC.md) for shared-unit behavior and construction requirements.

The root selects the original model participant through `modelIssue`. It must supply current model authority and explicit capacity limits. The trusted `modelInvocation.admit` port checks the stored preparation and current Attempt permit in the actual unit. It commits the original model anchor, unique claim, and Session issue proof together. Only the original model owner can consume that claim. Replay gives no second launch right. The owner can read its exact committed proof after the Run ends or the ingress closes. The root must retain its borrowed log and storage until that owner releases them. The actual model source adapter, ACK, tools, and the complete production host remain under construction.

The trusted `tenancy` reader returns ownership from the actual persistent Session reservation. It does not use a development seed. The `./cordis` entry exports `createLocalSessionContext`. This constructor creates a separate Context and explicit shared bridges. The application supplies a fresh Runtime Context provider through `runtimeContext`. The constructor uses its original plugin, readiness, initializer, and admission control. Its private initializer is bound to one Session. Stop waits for the original work and log borrow. A failed release remains pending and can be retried. The caller must supply the actual legal recipe and seed before publishing the Session.

The original creation ticket stores the actual member role. This snapshot is only recipe input. It does not grant current access. SessionBootstrap receives the original ticket to recognize the original Session. Missing roles have no default.

## Live access bindings

createLocalSessionAccess borrows actual current authority and a fixed authenticated principal and tenant. Supply explicit permission and capacity policies. The factory returns operations and a private issuer separately. Do not register the issuer as an ordinary service. Each use checks current authority. Copied, revoked and closed bindings refuse access. Close drains original checks without closing borrowed owners. See [SPEC](SPEC.md).

## Original model result custody

Supply an actual original execution source and explicit limits through `modelResults`. The trusted custody port stores the complete Pending value, its required references, the original issue identity, and the receipt in the same storage unit as the custody fact. It uses the original Run grant, including for late results. Replay checks the original fact and issue proof and returns the original value and receipt. A different value or an alias result key is rejected.

An unavailable reference source rolls back the unit. An unknown commit preserves the original result identity for lookup. Neither outcome permits ACK. Custody does not advance a Run, set a reply disposition, or send ACK. The root must connect the actual model source and the model owner's ACK rules. Close drains registered work and retains borrowed dependencies. See [provider behavior](SPEC.md#原完整模型结果保管).

## Original Run log borrow

The trusted root can borrow `runJournal` with the original coordination authority, Scope and Run. Each read or write checks the durable grant in its actual storage unit. The borrow supplies the complete prefix and native `SessionLog` operations for model settlement. It does not replace current execution permission or the unique issue claim.

The root must retain the borrow until the original model work and ACK responsibility end. Ingress close waits for each accepted borrow to be returned. Borrow close revokes admission and drains its units without closing physical dependencies. Its process-local generation becomes unavailable at close. See [provider behavior](SPEC.md#原run日志借用).
