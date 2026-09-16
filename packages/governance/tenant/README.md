# `@omne-harness-lite/tenant`

Project-owned TypeScript declarations for the values and identity/current-tenant qualification
protocol shared from the accepted `capability.tenant-governance` v1 design into governance
consumers.

The package has one public entry, `@omne-harness-lite/tenant`. Its shared values are `VersionSet`,
`Instant`, `Validity`, `MembershipBasis`, `EvidenceRef`, and `Conditions`. Its narrow consumer
protocol exports `IdentitySource`/`AuthenticatedInvocation` and the opaque two-step
`TenantAccess` preparation/check surface. The declarations reuse `GateFrame`, `Principal`, and
the public work-data identities instead of copying them. `PermissionScope` remains owned by the
[authorization package](../authorization/design.md#permissionscope).

The same entry exports strict decoders and pure folds for the accepted bootstrap, personal-index,
tenant-creation, and member-change records. The fold retains consumed membership joins and validates
the personal-owner and organization-super-admin invariants. A consumed join is identified by the
complete `(MembershipRef, joinedRevision)` pair, so different members may carry the same counter
while a removed member's prior basis cannot revive. The fold returns frozen copies and does not
adopt caller-owned objects as authority state.

An internal pure qualification core applies the accepted dual-view rule for the first named
management operation, `tenant.members`: a durable membership must grant it, and every newer pending
root must continue to grant the same membership join. This core is covered independently, but the
public `TenantAccess` runtime remains closed until the admission coordinator can let an owner verify
the exact active `GateFrame`.

These are consumer contracts. The opaque invocation and access-candidate types prevent ordinary
structural construction at compile time, while runtime authenticity still depends on the installed
identity source and tenant host recognizing the exact issued objects in an active `GateFrame`.
They do not parse or normalize instants, freeze runtime values, recognize evidence authorities, or
establish identity, current membership, authorization, or budget eligibility by their shape alone.
The tenant host, plugins, trusted clock, frame-bound current-fact wiring, persistence wiring, and
management operations remain future implementation work.

The precise ownership and representation mapping is in the
[tenant provider design](./design.md#共同值与协议的维护归属). Its adopted language-neutral sources
are [tenant-governance v1](../../../.meta_harness/design/spec/capabilities/tenant-governance/v1/contract.md) and
[core-work v1](../../../spec/data/core-work/v1/contract.md).

Run `pnpm run build` followed by `pnpm run typecheck` from this leaf. Those checks establish only the
public TypeScript declaration shape, static immutability constraints, and consumer compatibility
described above.
