# Budget records and recovery verification

This evidence covers the pure `@omne-harness-lite/budget` data, decoder, and recovery slice built
from baseline `892aa8e6aa711d847049e0ed1dfaed731fe664fa` with Node `v24.18.0`, pnpm `10.28.1`,
TypeScript `6.0.3`, Vitest `4.1.8`, and `@types/node` `24.13.4`. The adopted contract and mapping
files, including the per-batch stream revision rule, are fixed by [sources.txt](sources.txt).

## Acceptance results

1. Exact Money tests cover canonical integer strings, safe nonnegative scales, precise scale-up and
   divisible scale-down, values beyond JavaScript's safe integer range, negative-value constraints,
   and mixed-currency rejection. Arithmetic uses `BigInt` only after bounded structural copying and
   never converts an amount to `Number`.
2. The budget decoder composes the public records `encodeEnvelope`/`decodeLine` codec, then rejects
   wrong owners, unknown kinds, versions other than `/1`, extra or missing fields, malformed business
   counters, cross-tenant ownership, and dropped attempt causality. Budget-owned streams advance by
   one for each committed batch that touches them, independently of record count and business
   counters.
3. The immutable fold retains budget and source identities, every used period identity, original
   attempt allocation tuples, source indexes, and all meter revisions. Tests cover hard balance and
   unknown-posture bypasses, exact fact replay, same-key conflict, cross-attempt reuse, missing and
   late revisions, estimate replacement, explicit corrections, independent charges, and
   unallocated-to-attributed movement without duplicate cost.
4. Both finite `U=7` and unknown `K=7` produce `C=3`, `R=4`, and known exposure `7`. At `C=9`,
   reserve is `0` and known exposure is `9`; the finite projection reports its bound violation and
   the unknown source retains its unknown flag. Only an explicit reconciliation or never-started
   record releases the remaining reserve. A final meter component, unrelated Run finish,
   disconnect, or replay restart does not do so.
5. Continuous fold, seeded recovery, and real line-codec replay produce equal frozen state without
   changing caller input. The strict in-package fixture consumes the self-referenced public entry
   and proves the runtime host symbols remain absent. The packed consumer installs only the budget
   tarball as its direct product dependency, resolves the three packed transitive workspace
   dependencies through overrides, typechecks, and runs exact arithmetic plus ledger creation.
6. The leaf build, strict fixture typecheck, 20 behavior tests, targeted Prettier check, repository
   documentation/link checks, package metadata checks, and `git diff --check` pass. Raw commands and
   selected output are in [verification.log](verification.log); the first implementation RED and
   later boundary REDs are preserved in [red-green.log](red-green.log). The packed file list and
   digest are in [artifact.txt](artifact.txt).

## Integration into the HUB (2026-09-15)

The slice was cherry-picked from spoke branch `impl/dsh-p2-budget-records` (`d399e0e` plus the
fix commit `7ae9fb2`) onto `design/dsh-core-adoption` after the first-batch triage review. The fix
commit changed three things the review flagged and recorded four interpretation policies in
`design.md`:

1. Results use the shared `Checked` / `ValidationIssue` shape from work-data; the budget failure
   category is the message prefix and only `capacity` maps to the shared `capacity` code. The
   `BudgetResult` / `BudgetIssueCode` public types are gone; the recovery tests assert the prefix.
2. `validateMoney` validates structure with the shared `Money` schema (`parseData('Money')`) and
   only adds the arithmetic constraints. The schema admits `"-0"`; the accepted copy is `"0"`.
3. Ledger arrays sort by code-unit order on canonical JSON instead of `localeCompare`.

Re-run at HUB commit `4f60709` from the leaf: `pnpm run build` (0 errors), `pnpm run typecheck`
(0 errors), `pnpm run test` (2 files, 20 tests passed); raw output in
[integration.log](integration.log). The root `pnpm-lock.yaml` gained the `packages/governance/budget`
importer (three workspace links and the three pinned dev dependencies). [sources.txt](sources.txt)
was re-recorded: `tenant/src/index.ts` and `spec/catalog.json` had changed by unrelated additions
since the leaf run, and the two work-data sources now consumed directly were added.

Not re-run at integration: the packed public-consumer verification (item 5 above; the tenant
tarball's dependency graph has grown since the leaf run, so its override list must be recomputed)
and the repository-wide `pnpm run check` including the package checker (needs the native
`fs-ext` rebuild environment). Both remain obligations before the package is cited as verified in
the integrated tree; [artifact.txt](artifact.txt) and [consumer-verification.log](consumer-verification.log)
still describe the leaf run at baseline `892aa8e`.

## Evidence boundary

The fixtures use structurally valid test evidence and cost facts. They do not recognize an evidence
authority, prove a price or finite guarantee, observe a real provider charge, grant current tenant
qualification, issue admission, exercise a Cordis host/plugin, or prove durable writer behavior.
The codec composition proves validation and deterministic replay of encoded lines; it does not
prove that the current JSONL provider persisted those lines. No model, external service, or `.env`
was used.
