# @omne-harness/tool

[中文](README_ZH.md)

The Tool implementation without Cordis. The root entry exports independent execution: `createIndependentToolScope` builds an execution scope with a local receiver, explicit limits and an in-memory wait history, and `executeTool` runs one executor inside such a scope. It also exports the ledger factory `createToolLedger` with the store port `ToolLedgerStore` and the guard snapshot `ToolLedgerGuards`, the runtime factory `createToolRuntime` with its construction shapes `ToolDependencies` and `ToolConfiguration`, and a `./testing` entry with the non-durable store `createMemoryToolLedgerStore`.

## Responsibility and status

This package implements the contract of `@omne-harness/tool-contract`. It manages concurrency, waits, cancellation and state, so two implementations may differ here and the package is not part of the contract. It does not depend on Cordis, so an independent program can execute a tool without a Cordis install. Independent execution (ticket 04) is implemented. The ledger and the runtime serve the managed path of logical results (ticket 05): a call to a known-unavailable tool or with complete but illegal arguments is admitted idempotently, settles without any environment or executor, and can be looked up, read page by page, released on either handoff path and accounted. Real execution (preparation, queue, start, settlement) comes with the later M3 tickets; those operations answer a named `unsupported` failure.

## Usage

An independent program or an application assembly depends on this package and on `@omne-harness/tool-contract`. Production code in other domains depends only on `@omne-harness/tool-contract`. Tests in other domains may add `@omne-harness/tool/testing` as a development dependency when it exists.

An independent program calls `createIndependentToolScope({ limits, signal, process, waits })`. It gets a `ToolExecutionScope` or a field rejection when a limit is not a positive safe integer. It then calls `executeTool(argumentsValue, executor, environment, scope)`. The executor receives `scope.context` and may `emit` process updates and `wait` on Ask or resource protocols. A null `process` makes `emit` return `unsupported`; a null `waits` does the same for `wait`. The result is the executor's value, or a failure with `effect: 'not-started'` (the scope was refused, the author did not run) or `effect: 'unknown'` (the author ran, then threw or returned with the scope unable to settle).

## Contracts

Behavior belongs to the [contract SPEC](../tool-contract/SPEC.md), P11 for the independent path. [SPEC.md](SPEC.md) states how this implementation meets it and fixes the choices the contract leaves open: failure kinds, the byte encoding, the wait history reservation and the barrier rules. The G1, G2 and G8 decisions in the contract SPEC place the factories here.

## Design

Dependency direction: `tool-host-local` → {`tool`, `tool-cordis-contract`} → `tool-contract`. This package does not depend on `tool-cordis-contract`, `tool-host-local` or Cordis. It obtains `Outcome` from the dependency-free `@omne-harness/operation-result`. A test verifies that its production install closure excludes Cordis. Durability depends on the ledger store provider; the independent scope promises only `local` receipts.

## Configuration and operation

`ToolConfiguration` carries the author limits and the runtime budgets. `ToolDependencies` names each port the runtime consumes. The caller supplies both at construction. An independent scope takes its limits directly in `IndependentToolScopeInput`.

## Verification

`OMNE_TEST_TIER=fast pnpm --filter @omne-harness/tool test` builds the package and runs the tests. The tests check the root exports, the import graph, the manifest, the Cordis routes, and the P11 rules of the independent scope and wrapper. [tests/README](tests/README.md) maps each rule to its test.

## Maintenance

A change to `ToolDependencies` or `ToolConfiguration` changes `tool-host-local` and every assembly that constructs the runtime. A change to the failure kinds or barrier rules in [SPEC.md](SPEC.md) changes every independent program that reads them.
