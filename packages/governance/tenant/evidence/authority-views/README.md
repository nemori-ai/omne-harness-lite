# Tenant authority-view evidence

This increment covers the pure current-qualification rule for the first explicitly named tenant
management operation, `tenant.members`. A ready result requires a durable positive membership and
the same join to remain authorized in every newer pending root. Pending grants cannot provide a
positive basis; a pending restriction remains effective even if a later pending root grants the
operation again. Cross-tenant identities and unsupported operations fail closed.

[red.log](./red.log) is the first Vitest run before the authority module existed. [green.log](./green.log)
records the final unit, build, and strict typecheck result. [sources.txt](./sources.txt) fixes the
accepted contracts, provider designs, and public types used by the implementation.

The tests use validated in-memory fold roots. They do not prove active `GateFrame` recognition,
identity issuance, publication ordering, durability, recovery, or the public `TenantAccess`
runtime. Those remain blocked on the corresponding admission and P1 provider mappings and require
their own real composition evidence.
