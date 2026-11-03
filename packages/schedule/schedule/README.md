# @omne-harness/schedule

Public protocols belong to [schedule-contract](../schedule-contract/README.md), and Cordis definitions belong to [schedule-cordis-contract](../schedule-cordis-contract/README.md). This member implements recurrence calculation, Schedule management, prediction and queries without Cordis. Local persistence and assembly belong to [schedule-local](../schedule-local/README.md); tools belong to [schedule-tools](../schedule-tools/README.md).

This private `0.0.0` package exports three application factories and pure calculation functions from [src/index.ts](src/index.ts). Job admission, execution, scanning, notification and result coordination remain target behavior. Their presence in the full design does not establish implementation.

## Use and boundaries

Read the [behavior contract](SPEC.md) and [public API index](docs/public-api-design.md). The index separates current exports from future Job interfaces. Direct application calls use the same authorization and durable-operation rules as adapters.

Use createScheduleManagementApplication for commands, createSchedulePredictionService for date calculation and definition resolution, and createScheduleQueryApplication for read services. Each factory takes explicit dependencies. Cordis bindings and independent tool adapters consume those services. The [group architecture](../docs/architecture.md) defines dependency direction.

## Contract and internal design

[SPEC](SPEC.md) owns observable behavior and verification obligations. The [internal design](docs/internals.md) explains state, persistence, recovery, and lifecycle. [Key flows](docs/key-flows.md) show participants, failure branches, and responsibility transfer. The [group entry](../README.md) links related owners.

## Configuration, operation, and verification

Node >=24 and ESM. Factory dependency types are exported from the root. Prediction and queries require explicit budgets and clocks. Management requires current authorization, quota observations and durable persistence. No factory supplies default authority or an empty history provider. Tests cover public behavior and failure cases with conformance dependencies. Real SQLite and worker composition belongs to schedule-local. Production cross-domain integration remains separate.

## Maintenance

Update the behavior, public design, flows, metadata, and both README files together. Implemented public definitions must become the single type source. Keep immutable historical facts, original operation identities, and explicit unknown outcomes. Source acceptance obligations remain in the [complete mapping](SPEC.md#来源与目标验收映射).
