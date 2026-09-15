# Tenant shared-value declaration verification

This evidence fixes the declaration implementation at
`d2e9d7e67bddcd1fd89959a72933726285b2c6ae`, the exhaustive readonly fixture at
`2436f52f4c38d2c7031eebe8480eb49609c3fd1f`, and the workspace dependency lock at
`11a20db93f126157bdf45e7f42137f5e102b1a6e`. The implementation started from
`c4db044fc09caa84a57be875a20d549b57483964` on Node `v24.18.0`, pnpm `10.28.1`,
TypeScript `6.0.3`, and `@types/node` `24.13.4`.

The adopted sources are the accepted v1 entries for `capability.tenant-governance`,
`capability.action-authorization`, `capability.budget-accounting`, and `data.core-work` in the
[specification catalog](../../../../../spec/catalog.json), together with the ownership and shape
mapping in the [tenant provider design](../../design.md#共同值与协议的维护归属). Exact source
hashes are recorded in [sources.txt](sources.txt).

## Acceptance results

1. The single default entry `@omne-harness-lite/tenant` exports `VersionSet`, `Instant`,
   `Validity`, `MembershipBasis`, `EvidenceRef`, and `Conditions`. Its emitted declaration imports
   `DefinitionRef`, `MembershipRef`, and `OpaqueId` only through `@omne-harness-lite/work-data`, and
   `Counter` only through `@omne-harness-lite/records`. There are no subpath exports, authorization
   or budget dependencies, or `PermissionScope` export.
2. Before `src/index.ts` existed, TypeScript 6.0.3 compiled a consumer of the real package name and
   failed with TS2307 at that package import. After the declarations were added, strict typecheck
   passed. The tracked compile fixture proves all object fields and the three array fields are
   readonly, verifies each required structure, and ties the reused fields to the public shared
   types. [red-green.log](red-green.log) preserves the original RED and final leaf output.
3. The dependency-ordered build of work-data, records, and tenant passed. An independent consumer
   then installed only the tenant tarball as its root product dependency, with packed records and
   work-data overrides closing its declared transitive graph. With `NODE_PATH` empty, strict
   TypeScript compilation passed and resolution tracing found all three declarations in that
   consumer's tarball-backed `.pnpm` directory. The consumer inputs and original outputs are
   [public-consumer.ts](public-consumer.ts), [consumer-package.json](consumer-package.json),
   [consumer-tsconfig.json](consumer-tsconfig.json), and
   [consumer-verification.log](consumer-verification.log), which preserves the install output and
   the selected declaration-resolution facts from the complete spoke-local trace.
4. The packed tenant artifact contains only the compiled default entry, manifest, README, and
   provenance. It retains the real `UNLICENSED` declaration and project-owned provenance with no
   upstream-source claim. [artifact.txt](artifact.txt) records the complete file list and SHA-256.
5. Targeted shared formatting, repository documentation/link checks, and `git diff --check` pass
   after the final evidence edit. `packages/governance/tenant/design.md` is intentionally outside
   the shared formatter's maintained set because its language-neutral tables contain literal
   union bars; only the two authorized status projections changed there.

## Evidence boundary

This verifies a TypeScript declaration surface and its package dependency closure. TypeScript
`readonly` does not freeze runtime data. `Instant = string` does not prove valid or normalized UTC,
and the types do not enforce nonempty or unique versions, evidence recognition, trusted time,
current membership, or current resource qualification.

No tenant host, Cordis plugin, parser, clock, identity adapter, authorization or budget gate,
generic condition evaluator, state transition, persistence, or recovery behavior was implemented
or tested. The build and packed consumer therefore are not tenant-governance business acceptance,
authorization acceptance, or a real AU/BG/TG composition result. No model or external service was
called.
