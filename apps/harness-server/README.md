# @omne-harness/harness-server

[中文](README_ZH.md)

A private application member for the Harness Server assembly. Its S0 mode loads marked doubles through real Cordis and checks load order, visibility, readiness, and ordered shutdown. It serves no request.

## Responsibility and status

This member owns the S0 assembly entry: the two-layer plugin tree, the trusted-subtree visibility, the readiness report, and the ordered shutdown. It does not own business behavior. Reusable behavior stays in `packages/`. The behavior is in [SPEC.md](SPEC.md). The SPEC comes from the S0 implementation spec r2 for #1001. It is not an accepted product promise.

Implemented:

- The two-layer plugin tree and the boundary schema.
- The loader, the trusted-subtree visibility, and the readiness report.
- The AA row snapshot `src/s0/aa-rows.json`, its generator, and its diff check.
- The shutdown coordinator and the process entry `dist/bin.js`.
- The `./cordis` export, which holds only the S0 stub plugin.

Three rulings in SPEC.md are marked "pending code merge" in the section "有序关闭". They are the start order, no new `start` after the stopping state, and the handling of a `start` that throws. Until the code merges, they are targets.

S0 does not open HTTP, create a tenant, open a business state root, or read a real secret. A passing S0 run does not show that the first tenant path works.

## Usage

Build first, then run the process entry:

```sh
pnpm --filter @omne-harness/harness-server run build
node apps/harness-server/dist/bin.js s0 --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>
```

A usage error prints `s0: <reason>` and then this line on stderr. The exit code is 2:

```text
usage: s0 --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>
```

The `.` export gives the types and `runS0`:

```ts
import { runS0 } from '@omne-harness/harness-server'
import type {
  RunS0Options,
  S0Record,
  S0Result,
  ShutdownReport,
  TreeRow,
} from '@omne-harness/harness-server'
```

The `./cordis` export holds only the S0 stub plugin. Its export name is the `plugin` value in the distribution JSON. A sample distribution is `config/s0.distribution.json`.

`src/s0/aa-rows.json` is the row snapshot of the application assembly page. The loader and `check:aa-rows` read it. Do not edit it by hand. Regenerate it with the command in the section "Maintenance".

## Contracts

[SPEC.md](SPEC.md) owns the behavior. It has the tree and operator rules, the load checks, the readiness rules, the output records, the exit codes, and the section "有序关闭" (ordered shutdown). `src/types.ts` owns the data shapes.

Summary of the promises:

- A root cannot get a trusted name by its name. A subtree row can.
- A pending row and a failed row are reported apart. A timeout does not turn PENDING into FAILED.
- Shutdown runs four phases in order: `entry`, `business`, `composition`, `storage`. All phases share one deadline. A handle that misses the deadline is `incomplete`, and the next phase still runs.
- The report is final before `assemblyReportSettled()` is called.
- Exit code `5` means start succeeded and shutdown is `incomplete`.

## Design

The assembly entry creates the root `Context`. It gives each scope a private tag, loads each row in an isolated context, and reads the real fiber state. Rows that take part in shutdown register a handle with `assemblyLifecycle`. The coordinator holds handles only, never plugin objects. The coordinator does not close business connections.

## Configuration and operation

| Input                    | Effect                                             |
| ------------------------ | -------------------------------------------------- |
| `--distribution`         | Absolute path of the release layer JSON.           |
| `--operator`             | Optional absolute path of the operator layer JSON. |
| `--readiness-timeout-ms` | Positive integer. Wait limit for readiness.        |
| `--shutdown-deadline-ms` | Positive integer. Shared shutdown deadline.        |

Requirements: Node `>=24`, from `engines.node`. Runtime dependencies are `@deepseek-ai/cordis`, `@omne-harness/kernel-basis`, and `zod`. The process reads no environment variable and no real secret.

## Verification

Run the checks from the repository root:

```sh
pnpm run check:docs
pnpm --filter @omne-harness/harness-server run typecheck
pnpm --filter @omne-harness/harness-server run build
pnpm --filter @omne-harness/harness-server run test:fast
pnpm --filter @omne-harness/harness-server run test:slow
pnpm --filter @omne-harness/harness-server run check:aa-rows
```

`test:slow` starts `dist/bin.js`, so run `build` first. `check:aa-rows` compares the snapshot with the application assembly page.

The test inventory is in [tests/README.md](tests/README.md). The tests use doubles, not a real SQL provider, not real identity, and not real storage. Doubles do not show durability or real vendor behavior.

Not covered:

- The three rulings marked "pending code merge" in SPEC.md have no passing test until the code merges.
- Windows and Linux runs are reported apart. A run on one platform does not cover the other.
- Reflection over `ctx.reflect.store` is a recorded non-guarantee.

## Maintenance

Change the behavior in [SPEC.md](SPEC.md) first, then the code and the tests. Do not change `src/types.ts` without the owner of the S0 closure plan, because all S0 modules depend on it. When the application assembly page changes its plugin tree or trusted-subtree table, regenerate the row snapshot in the same batch:

```sh
cd apps/harness-server
node scripts/aa-rows.mjs write --aa ../../docs/architecture/runtime/application-assembly.md --rows src/s0/aa-rows.json
```

Then update `src/s0/stubs.ts` by hand to follow the changed rows.

Keep [README_ZH.md](README_ZH.md) in step with this file. Both files state the same promises.
