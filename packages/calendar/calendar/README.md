# @omne-harness/calendar

[中文](README_ZH.md)

This member implements Calendar A1 without Cordis. It exports five pure date functions, source parsing and validation, query and supply applications, and the combined application factory. The package remains private at `0.0.0`. Schedule management and prediction exist in their own members; Job execution remains target behavior. Actual cross-domain assembly requires evidence from the participating providers.

Public protocols belong to [calendar-contract](../calendar-contract/README.md). Service definitions belong to [calendar-cordis-contract](../calendar-cordis-contract/README.md). SQL persistence, source acquisition, seeds and the runner belong to [calendar-local](../calendar-local/README.md). Tool contributions belong to [calendar-tools](../calendar-tools/README.md).

## Use and boundaries

The [root entry](src/index.ts) exports classifyDay, countWorkingDays, shiftWorkingDays, listWorkingDays and selectNthWorkingDay. Each function reads a validated immutable snapshot and returns a discriminated result with its calculation basis. Pure calculation needs no network, database, clock or Cordis.

createCalendarQueries constructs independent queries. createCalendarSupplyApplication constructs supply. createCalendarApplication accepts repository, persistence, queries and supply dependency groups, and returns both applications. Exported source definitions own the exact configuration. See [public API notes](docs/public-api-design.md). Factory dependencies are local objects, not wire values.

## Contract and internal design

[SPEC](SPEC.md) owns behavior and continuing verification obligations. [Internals](docs/internals.md) explains versions, supply, recovery and storage limits. [Key flows](docs/key-flows.md) describes failures and responsibility transfer. The [group entry](../README.md) links related owners.

## Configuration, operation, and verification

Use Node >=24 and ESM. Pure calculation needs no configuration. Queries require trusted authority and environment ports. Supply requires a legal system scope, material custody and publication ports. Identity, settings, notification and Tool host integration remain external prerequisites. SQL L-1/L-4 limits and power-loss durability require provider evidence.

Run `pnpm --filter @omne-harness/calendar build`, `pnpm --filter @omne-harness/calendar typecheck` and `pnpm --filter @omne-harness/calendar test` in the workspace. Continuing tests cover the public entry, queries, supply, supply application and workload. These commands do not establish final independent acceptance or real system integration.

## Maintenance

Keep the contract, public source, flows and both entry files consistent. Source schemas own public shapes. Preserve immutable history, original operations and explicit unknown results. See the [complete obligation mapping](../../schedule/schedule/SPEC.md#来源与目标验收映射).

Formal function semantics and proof obligations are in [the function contract](docs/functions-and-totalization.md). Run `pnpm --filter @omne-harness/calendar verify:formal` with the tools described in [verification](verification/README.md). This is an explicit member gate, not part of the root check command; bounded model success does not prove production refinement.
