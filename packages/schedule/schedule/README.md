# @omne-harness/schedule

PACKAGE_TEMPLATE_DRAFT

This workspace package is a private `0.0.0` draft. `src/index.ts` contains `export {}`. It exposes no business API or runtime service. The complete target design was confirmed on 2026-11-03. Design commitments do not establish implementation or verification.

## Use and boundaries

Read the [behavior contract](SPEC.md) and [public API design](docs/public-api-design.md). The API document describes target types, commands, queries, errors, trusted context, and ports. These definitions are not current exports. There is no runnable business example yet. Direct application calls use the same authorization and durable-operation rules as HTTP and tools.

The root target contains pure domain functions and application services. It does not require Cordis. Cordis bindings and independent tool adapters consume those services. The [group architecture](../docs/architecture.md) defines dependency direction.

## Contract and internal design

[SPEC](SPEC.md) owns observable behavior and verification obligations. The [internal design](docs/internals.md) explains state, persistence, recovery, and lifecycle. [Key flows](docs/key-flows.md) show participants, failure branches, and responsibility transfer. The [group entry](../README.md) links related owners.

## Configuration, operation, and verification

There is no implemented provider or business configuration in this package. Target configuration must preserve the contract. The existing public-entry test checks empty exports only. Future domain and contract tests, real-provider integration, independent consumer tests, and end-to-end assembly are required where the SPEC assigns them. They are unverified, rather than inapplicable. Node24, ICU, real storage faults, network supply, and tool assembly have no acceptance result from this documentation work.

## Maintenance

Update the behavior, public design, flows, metadata, and both README files together. Implemented public definitions must become the single type source. Keep immutable historical facts, original operation identities, and explicit unknown outcomes. Source acceptance obligations remain in the [complete mapping](SPEC.md#来源与目标验收映射).
