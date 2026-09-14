# D1 diagnostics directory-owner implementation evidence

This directory records the D-011 follow-up to the historical
[P1 D1 evidence](../README.md) and
[reviewer remediation](../reviewer-remediation/README.md). The fixed implementation start was
`9ffbf1f4b7b5c23c066881722476110dd38fcf88`, which contains the accepted package design from
`e2190ad0f9df571eb7e6fb5d36099cf3af589a73`. D-010 remains the recording/context/output contract;
D-011 fixes directory ownership, shared capacity, native locking, and close-identity behavior. These
are implementation results for HUB review, not final P1 acceptance or D2 consumer evidence.

## Product revisions and RED/GREEN identity

| Revision | Reproducible product state |
|---|---|
| `408a2508dc83d1677abbfbc171681b234acddb55` | Migrates the public test input to the accepted owner API but deliberately leaves each owner with an independent budget. The original two R1 cases remain RED: actual directory bytes are 3356 against 2400, and two source files materialize against `maxFiles=1`. Raw output is [red-d1-r1-owner.log](../reviewer-remediation/red-d1-r1-owner.log). |
| `e95a630ecb9909b35ade70e29126dd85dac2c654` | Adds only the exact leaf dependency `fs-ext@2.1.1`; root lock/build policy remains owned by the HUB integrator. |
| `b4621160fdd835a3f8f380f4ee633bdedaa137bb` | First GREEN for the two unchanged R1 capacity stimuli through one directory owner. Raw output is [green-d1-r1-owner.log](../reviewer-remediation/green-d1-r1-owner.log). |
| `88f01aeab81e8d164675274cb34fe6d46f8afac7` | Merges HUB commit `ce738731d55966a7c001bcee67a11055ea8adedb`, containing the exact root lock entry and selective native build allowlist. |
| `bb43314f9a51b03ddb4d86d7e4120636a9918f12` | Adds D-011 resource-identity and close-unknown cases and migrates the nine tests whose old premises conflict with the accepted owner contract. |
| `3ca93e0f945bd95833cc25fed12fd042fa9c183e` | Product-code candidate used by the final package, native-load, tarball, and resource-failure observations below. It retains an unexplained `EEXIST` source slot without falsely assigning the requested source identity. |

The full test suite was intentionally run once between the new owner implementation and the D-011
test migration. Its [nine failures](../reviewer-remediation/red-d1-r1-full-after-owner.log) are split
from product defects rather than hidden by changed expectations:

| Old test premise | Accepted D-011 replacement |
|---|---|
| A directory contains exactly one entry after one source closes. | The stable, zero-byte `.diagnostics.lock` is a separate fixed control entry; `maxFiles` counts source files. |
| Any `close` EIO means the same numeric fd remains safe to retry. | A close result after the underlying operation is unknown. The product remains blocked/unknown and must not close a possibly reused fd number. |
| Invalid source configuration precedes directory-owner creation. | Directory configuration is rejected before path I/O; source configuration is rejected by `owner.create` without source I/O. |
| A failed scan returns a source runtime that owns scan cleanup. | Initialization cleanup belongs to the directory factory/owner and keeps the lock until every scan handle is resolved. |
| An unknown retained entry can be ignored or converted into a new degraded source. | Unknown files stop the scan and remain capacity/resource evidence. |
| Repeated same-source creation yields a collision runtime. | Same source plus identical normalized configuration returns the original handle; conflicting configuration returns `SOURCE_CONFLICT`. |
| A second independent source factory opens the same directory/source. | A second directory factory is rejected by the real flock until the first owner actually releases it. |

No observed failure in that run required weakening a D-010 output or context guarantee. The revised
tests add stronger resource-identity observations before the package is considered GREEN.

## D-011 scenario results

The final [package run](package-green.log) executes 50 tests across the runtime, reviewer, and
directory-owner suites after the local native module was rebuilt. The following table maps the
minimum additions in `packages/observation/diagnostics/design.md` to actual observations.

| Required scenario | Actual result at the product candidate |
|---|---|
| Original D1-R1 byte and slot RED | Both unchanged stimuli are GREEN. An old generation's late span competes with the new generation in one 2400-byte ledger, while intercepted concurrent source creation reserves the single slot before `open`. |
| Shared dynamic capacity | Encoded UTF-8 bytes are reserved synchronously before `Sonic.write`; old, new, and pending sources use the same balance. The limit is not divided per source, and no successful output raises charged bytes above the directory cap. |
| Reservation recovery | Synchronous non-submission releases only that record. Short write/error preserves the unknown upper bound; a failed final stat leaves reserved bytes and the flock held, and a later close retries the stat before release. |
| Source preparation and identity | Concurrent identical creates share one preparation and return the original handle. No-file open failure releases its reserved slot. A materialized preparation failure keeps its slot until cleanup. Unexplained `EEXIST` is retained with `sourceId:null`; conflicting known identity returns `SOURCE_CONFLICT`. |
| Unique directory owner | The same-process path-alias contender and a separate Node process are rejected by native `flock`. Lock dev/inode remains stable through close and restart; the file is never removed, replaced, or truncated. |
| Initialization and shutdown resources | Late open, active span, failed final stat, lock-loser cleanup, and source/lock close-unknown paths stay visible. Owner close seals `create`, joins preparation, closes sources, reconciles bytes, and releases the lock last. |
| Retained originals and restart | Nonzero or symlink lock files and unknown source entries are preserved and rejected. A clean restart scans the retained source size/slot. Partial-write unknown is retained until the isolated process exits, after which a new process rebuilds the ledger from the actual file. |
| O08 packed public entry | Three real project tarballs install with workspace edges rewritten, `fs-ext` rebuilds inside the isolated consumer, and strict TypeScript consumes the default entry. Runtime writes exactly four start/log/span/close records, rejects a second factory, and closes with lock/resource released. |

## R2-R6 resource and privacy regressions

The same 50-test run includes every R2-R6 regression. R2 now injects EIO only after the real
underlying close has run, then opens a sentinel which receives the exact same fd number. Repeated
runtime close remains `blocked/unknown` and a read proves the sentinel is still open. This establishes
that the product does not close a new resource; it does not infer whether an arbitrary real close
error kept the old descriptor open.

R3 retains actual scan handles in a directory cleanup when release cannot be proved, without numeric
fd retry. R4 allows the SDK span to be collected while an ended public context retains immutable
trace identity, and that identity can parent a later correlated span. R5 contains revoked proxies at
`scope`, `log`, and `end`, preserves business return/error identity, and still lets close converge.
R6 persists one bounded gap summary after delayed output recovery, bounds an oversized failed summary
to one attempt, and orders a pending summary before the clean-close marker. Historical R2-R6 raw
RED/GREEN material remains unchanged under [reviewer remediation](../reviewer-remediation/README.md).

Fault injection which deliberately makes a real close result unknowable keeps the management object
strongly reachable until its isolated test process exits. The operating system then releases that
process's resources. The test suite does not claim that same-process retry can recover an unknown
numeric fd. Normal close, delayed-open retry, active-span retry, and final-stat retry paths all prove
release and allow a real factory restart.

## Native installation and packed consumption

[environment.log](environment.log) records the product revision, branch, Node 24.18.0, pnpm 10.28.1,
Linux filesystem type, and the GCC/G++ 10.5 binaries reused from the accepted P0 build environment.
The exact sequence was:

```text
pnpm install --frozen-lockfile --ignore-scripts --reporter append-only
CC=<gcc-10> CXX=<g++-10> GCC_EXEC_PREFIX=<gcc10-root>/usr/lib/gcc/ \
  pnpm --filter @omne-harness-lite/diagnostics rebuild fs-ext --reporter append-only
```

Before that selective rebuild, loading the workspace dependency failed with
`MODULE_NOT_FOUND` in [native-load-before.log](native-load-before.log). The actual compile/link output
is [native-rebuild.log](native-rebuild.log), and [native-load-after.log](native-load-after.log) records
`flock:function` with Node module ABI 137. A copied addon is not part of this GREEN evidence.

For O08, `work-data`, `records`, and `diagnostics` were packed from their built public files into
`tmp/p1-diagnostics/tarballs-r1`. A consumer in
`tmp/p1-diagnostics/artifact-consumer-r1` installed those exact tarballs with `--offline
--ignore-scripts --ignore-workspace`, rebuilt only `fs-ext@2.1.1` with the same explicit compilers,
then ran strict declarations and Node with `--no-global-search-paths`.
[artifact-metadata.log](artifact-metadata.log) records the three tarball SHA-256 values, the installed
artifact path, rewritten dependency manifest, isolated native addon path, and ABI. Raw commands are
preserved as [install](artifact-install.log), [native rebuild](artifact-native-rebuild.log),
[typecheck](artifact-typecheck.log), and [runtime output](artifact-run.log).

The repository's package checker was also invoked with explicit CC/CXX. On this fixed spoke it exits
1 before inventory reaches diagnostics because the tracked design-only leaf
`packages/governance/authorization` has no `package.json`; see [package-checks.log](package-checks.log).
This structural baseline failure does not exercise or clear diagnostics. The HUB integrator owns the
subsequent full-member/combination rerun after composing current members.

## Scope and remaining acceptance

This implementation does not add fsync, durable business audit, a remote exporter, query service,
Cordis bridge, host generation switch, or JSONL/admission behavior. The local output is intentionally
`fsync:false`. Advisory flock does not protect against a hostile bypass or provide an NFS guarantee.
Real short-gate consumers and O07 host switching remain their owning tasks. The HUB integrator must
run the current combined package/artifact checks and consumer composition before accepting or opening
P1.
