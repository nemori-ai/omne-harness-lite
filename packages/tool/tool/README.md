# @omne-harness/tool

[中文](README_ZH.md)

The Tool implementation without Cordis. It will hold independent execution (`executeTool`, `createIndependentToolScope`), the runtime factory `createToolRuntime`, the admission decider, the ledger store port `ToolLedgerStore` with `createToolLedger`, and a `./testing` entry with a real runtime kit. Today the root entry exports only the factory construction shapes `ToolDependencies` and `ToolConfiguration`.

## Responsibility and status

This package implements the contract of `@omne-harness/tool-contract`. It manages concurrency, waits, cancellation and state, so two implementations may differ here and the package is not part of the contract. It does not depend on Cordis, so an independent program can execute a tool without a Cordis install. Only the construction shapes exist. Ticket 04 adds independent execution, and M3 adds the runtime.

## Usage

An independent program or an application assembly depends on this package and on `@omne-harness/tool-contract`. Production code in other domains depends only on `@omne-harness/tool-contract`. Tests in other domains may add `@omne-harness/tool/testing` as a development dependency when it exists.

## Contracts

Behavior belongs to the [contract SPEC](../tool-contract/SPEC.md). [SPEC.md](SPEC.md) states how this implementation meets it. The G1, G2 and G8 decisions in the contract SPEC place the factories here.

## Design

Dependency direction: `tool-host-local` → {`tool`, `tool-cordis-contract`} → `tool-contract`. This package does not depend on `tool-cordis-contract`, `tool-host-local` or Cordis. Durability depends on the ledger store provider.

## Configuration and operation

`ToolConfiguration` carries the author limits and the runtime budgets. `ToolDependencies` names each port the runtime consumes. The caller supplies both at construction.

## Verification

`pnpm --filter @omne-harness/tool test` builds the package and runs the tests. The tests check the root exports, the import graph and the manifest. No runtime behavior exists to test yet.

## Maintenance

A change to `ToolDependencies` or `ToolConfiguration` changes `tool-host-local` and every assembly that constructs the runtime.
