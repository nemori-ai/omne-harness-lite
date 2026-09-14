# `@omne-harness-lite/tenant`

Project-owned TypeScript declarations for the values shared from the accepted
`capability.tenant-governance` v1 design into governance consumers.

The package has one public entry, `@omne-harness-lite/tenant`. It exports only `VersionSet`,
`Instant`, `Validity`, `MembershipBasis`, `EvidenceRef`, and `Conditions`. The declarations reuse
the public `@omne-harness-lite/work-data` identity types and the public
`@omne-harness-lite/records` counter type. `PermissionScope` remains owned by the
[authorization package](../authorization/design.md#permissionscope).

These are compile-time structural declarations. They do not parse or normalize instants, enforce a
nonempty or unique version set, freeze runtime values, recognize evidence authorities, or establish
current membership, authorization, or budget eligibility. The tenant host, plugins, trusted clock,
parsers, current-fact checks, and governance behavior remain future implementation work.

The precise ownership and representation mapping is in the
[tenant provider design](./design.md#共同值与协议的维护归属). Its adopted language-neutral sources
are [tenant-governance v1](../../../spec/capabilities/tenant-governance/v1/contract.md) and
[core-work v1](../../../spec/data/core-work/v1/contract.md).

Run `pnpm run build` followed by `pnpm run typecheck` from this leaf. Those checks establish only the
public TypeScript declaration shape and static immutability constraints described above.
