# @omne-harness-lite/work-data

Shared data structures and strict JSON validation for
`data.agent-runtime-identity/core-work` v1. The only public entry is
`@omne-harness-lite/work-data`.

This private package validates data shape. A valid reference remains data and does not grant
read, write, control, membership, or execution authority.

Build with `pnpm run build`, run strict type checks with `pnpm run typecheck`, and run tests with
`pnpm test`. The packaged schemas are byte-identical copies of the accepted frozen v1 resources;
the package performs no network `$ref` loading.
