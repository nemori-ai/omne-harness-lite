# D1 diagnostics reviewer remediation

This directory preserves the reproducible RED/GREEN evidence for the six findings raised against
the historical diagnostics product at `66d92a9`. The remediation starts from HUB baseline
`46770b9d739c14b6506008326fee7c741da57d81`. These results supplement the parent evidence; they do
not rewrite its historical identity, constitute final acceptance, or cover the D2 consumers.

## Product revisions

| Finding | RED revision | GREEN revision | Result at this checkpoint |
|---|---|---|---|
| D1-R1 shared directory bytes/files | `fefb6c5b7ff9b82dc9f1a7648d58409f4a0a165d` | none | Open design dependency. The real product still exceeds 2400 bytes with 3356 bytes and creates two sources when `maxFiles=1`. |
| D1-R2 write EIO followed by close EIO | `3fa685fdc257d495180bf808396d97d8fc1b238a` | `00dd6e7fdc757cd792b2447632e1e136ebe4d40a` | The known unclosed descriptor becomes `unknown`; after removing the injected pre-close failure, repeated close releases that same descriptor. |
| D1-R3 old scan handle close failure | `3fa685fdc257d495180bf808396d97d8fc1b238a` | `00dd6e7fdc757cd792b2447632e1e136ebe4d40a` | The actual `FileHandle` remains owned and visible until retry closes it; a post-close read fails. |
| D1-R4 ended context retention | `5169cf3b6ff8cbb185da39159f8681454b4fcd07` plus the corrected reproduction below | `b99752ba9f0d9859b0314aeedaad2134e286ab4f` | A retained public context keeps immutable trace identity and can parent a later child while the ended SDK span is collected from a still-live runtime. |
| D1-R5 revoked projection proxies | `3fa685fdc257d495180bf808396d97d8fc1b238a` | `00dd6e7fdc757cd792b2447632e1e136ebe4d40a` | `scope`, `log`, and `end` contain projection failure, leave the business return/error unchanged, end the span, and close cleanly. |
| D1-R6 missing persisted gap summary | `5169cf3b6ff8cbb185da39159f8681454b4fcd07`, `11adff5b92494a719014e0c99760a072b660b324`, and `8f6b443f7928f5008611c6497714f7b85d803efb` | `b99752ba9f0d9859b0314aeedaad2134e286ab4f` and `4fa2c74f4816fe37850a812ca59032cb889d75fd` | Recovery writes one bounded summary; an oversized summary makes one bounded attempt; close-before-recovery writes the summary before clean end. |

The D1-R2 injection invokes its EIO callback before calling the saved `originalClose`. It therefore
proves that this particular descriptor was not closed and can be retried. It does not establish that
an arbitrary real `close(2)` error leaves a numeric fd owned or safe to retry.

## Commands and raw results

The committed test input is
`packages/observation/diagnostics/tests/reviewer-regressions.spec.ts`. Run an individual finding with:

```text
pnpm --filter @omne-harness-lite/diagnostics build
pnpm --filter @omne-harness-lite/diagnostics typecheck
pnpm --filter @omne-harness-lite/diagnostics exec vitest run tests/reviewer-regressions.spec.ts -t 'D1-R1'
pnpm --filter @omne-harness-lite/diagnostics exec vitest run tests/reviewer-regressions.spec.ts -t 'D1-R[2-6]'
```

The corresponding `red-*.log` and `green-*.log` files contain unedited command output. The first R4
GC loop dereferenced its `WeakRef` before each collection and is only test-calibration history. The
behavioral RED is [red-d1-r4-corrected.log](red-d1-r4-corrected.log): from the final implementation,
apply [red-d1-r4-reproduction.patch](red-d1-r4-reproduction.patch), build, and run:

```text
node --expose-gc packages/observation/diagnostics/tests/fixtures/sdk-span-gc.mjs
```

It returns `sdkSpanCollected:false` with exit 1 while the runtime and public context remain live.
Reverse the patch, rebuild, and the same fixture returns `sdkSpanCollected:true`. This isolates the
R4 change from the unrelated R6 edits in the same implementation commit.

D1-R6 uses real delayed `fs.write` callbacks. Its ordinary recovery file contained one
`diagnostic.gap` record with `reason=buffer_capacity`, range `4..21`, `count=18`, and
`quality=counted`. The close interleaving starts `close`, yields until Sonic is ending, then releases
the original write. The RED reaches `closed/released` without a summary; the GREEN waits for actual
recovery before ordering the summary ahead of `diagnostic.source_closed`. The oversized-summary case
checks that attempted/dropped counters increase once and then remain stable without a timer or retry
task.

## Current boundary

R2-R6 are implemented at `4fa2c74f4816fe37850a812ca59032cb889d75fd`. Independent review closed
R2-R5 and, after the additional close ordering repair, the narrow R6 finding. D1-R1 deliberately
remains RED until the separately reviewed directory-owner public design is accepted and supplied as
a fixed implementation input. The package-wide test command therefore remains expected to fail only
on the two D1-R1 tests at this checkpoint; [verification-r2-r6.log](verification-r2-r6.log) records
the green subset and unchanged package tests.
