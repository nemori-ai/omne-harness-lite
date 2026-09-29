# Core development verification

English · [简体中文](README_ZH.md)

`@omne-harness-lite/core-verification` is a private development workspace member that checks real compositions of the core packages through their built public entries. It is not a product service or a runtime dependency of core packages.

It provides:

- SQLite conformance checks against the real storage provider, with a deliberately disabled-foreign-key negative control.
- Independent Node consumers and TypeScript checks for public exports, closed internal subpaths, dependency directions and schema resources.
- Asset composition through real body-contract providers, asset-model and asset-evaluation, including Skill reading, Slash expansion, MCP naming, Tool argument checks and Messages boundaries.
- Stream composition across content blocks, accounting, arrivals, stream assembly, Messages and ModelResponse.
- Packed consumers that load built package tarballs independently of workspace source paths.

## Run

From the repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @omne-harness-lite/core-verification... run build
pnpm --filter @omne-harness-lite/core-verification run typecheck
pnpm --filter @omne-harness-lite/core-verification run test
```

For the asset composition and its negative control only:

```sh
pnpm --filter @omne-harness-lite/core-verification exec vitest run tests/w6-asset-consumer.spec.ts --maxWorkers=1
```

After building, run the independent packed consumer:

```sh
pnpm --filter @omne-harness-lite/core-verification run verify:packed
```

These commands require the workspace's declared Node and pnpm environment. The private member has no published library exports; its supported development entry points are the package scripts, tests and built consumer executables.

## Inputs and coverage

The asset fixture supplies all four members of the accepted AE4 `CompositionRoot`: `definition`, `references`, `attributes` and `source`. Its synthetic root declares an empty attribute list and the existing `ast_root` version 1 source. Fingerprint reordering and unsupported-category cases retain those values so that the intended behavior is reached instead of an earlier malformed-input rejection. The root body remains an opaque fixture: these tests do not verify PRE-9 provenance from a real root document and do not introduce product defaults.

The asset suite checks sixteen named scenarios and a negative control that changes only the expected workspace permission. The expected assertion must fail while the other scenarios pass; an arbitrary nonzero process exit, timeout, startup failure or skipped test does not satisfy the control. Other suites apply the same distinction between detected defects and failed test infrastructure.

The stream consumer has thirteen fixed scenarios and uses the current Messages v6 and ModelResponse v9 public roots. Its controlled model route includes the adaptation binding and complete text-only profile constraints. These stream-only fixtures have no adapter input projection, output-digest evidence or upstream usage: their MR9 calibration explicitly records `not_retained` / `missing_usage`, without inventing observations. The report's `specEpoch: 3` and historical coverage citations identify the original W6 verification epoch, not the versions supplied by current package roots or renewed acceptance of historical artifacts.

Run this composition and its frame-count negative control with:

```sh
pnpm --filter @omne-harness-lite/core-verification exec vitest run tests/w6-stream-consumer.spec.ts --maxWorkers=1
```

The normal run must pass all thirteen scenarios. The negative control must fail only `w6.stream.tool-frame-replace-and-account`, with the other twelve passing; unrelated malformed responses or arbitrary nonzero exits do not satisfy it.

The [detailed coverage map](w6-coverage.json) and [Chinese reference](README_ZH.md) retain scenario identifiers, historical verification epochs and packed-consumer details. Accepted versions and implementation obligations remain in the [design registry](../../.meta_harness/design/registry/README.md) and the corresponding realization nodes; this tool does not define product policy.

## Evidence and limits

Each run retains raw stdout/stderr, machine reports and execution metadata in a uniquely owned directory under the checkout's `tmp/`. To choose a task-specific evidence root:

```sh
OMNE_CORE_VERIFICATION_EVIDENCE_ROOT=tmp/w6-core-verification/my-run \
  pnpm --filter @omne-harness-lite/core-verification run test
```

The configured root must remain inside this checkout's `tmp/`; invalid or empty paths fail. Preserve unique evidence before retiring its worktree. Retained logs do not grant permission to delete another run's files.

File entries, supplied timestamps, memberships and MCP snapshots are explicit fixture inputs. Passing does not establish real filesystem provenance, OAuth, live membership, third-party billing, PostgreSQL behavior, power-loss durability or complete application acceptance. A historical successful run also does not certify later source revisions.
