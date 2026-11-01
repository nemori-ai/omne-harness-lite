# @omne-harness/harness-server

[中文](README_ZH.md)

A private application member for the Harness Server assembly. Its S0 mode loads marked doubles through real Cordis and checks load order, visibility, readiness, and ordered shutdown. Its real mode (`serve`) loads the same rows under the formal service keys and waits for a stop request. In wave 1 of #978 every row of the `serve` distribution is still a double, and the row closures replace them one by one.

## Responsibility and status

This member owns the S0 assembly entry: the two-layer plugin tree, the trusted-subtree visibility, the readiness report, and the ordered shutdown. It does not own business behavior. Reusable behavior stays in `packages/`. The behavior is in [SPEC.md](SPEC.md). The SPEC comes from the S0 implementation spec r2 for #1001. It is not an accepted product promise.

Implemented:

- The two-layer plugin tree and the boundary schema.
- The loader, the trusted-subtree visibility, and the readiness report.
- The AA row snapshot `src/s0/aa-rows.json`, its generator, and its diff check.
- The shutdown coordinator and the process entry `dist/bin.js`.
- The `./cordis` export, which holds the S0 stub plugin. Row closures add their real exports to it.
- The `serve` subcommand, the row declaration `defineRow`, the entry object registry, and the checks before loading of the real mode. See [docs/real-mode.md](docs/real-mode.md).

The three rulings in the section "有序关闭" of SPEC.md (the start order, no new `start` after the stopping state, and the handling of a `start` that throws) are implemented. `tests/shutdown.spec.ts` and `tests/s0-process.spec.ts` cover them.

S0 does not open HTTP, create a tenant, open a business state root, or read a real secret. A passing S0 run does not show that the first tenant path works.

## Usage

Build first, then run the process entry. The subcommand is the first argument:

```sh
pnpm --filter @omne-harness/harness-server run build
node apps/harness-server/dist/bin.js s0 --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>
node apps/harness-server/dist/bin.js serve --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n> --state-root <abs dir> [--stop-on-stdin-close]
```

`s0` stops by itself after `startup-result`. `serve` waits for a stop request: a closed stdin (with `--stop-on-stdin-close`), SIGINT, or SIGTERM. On Windows, a closed stdin is the only way another process can stop it.

A usage error prints `<subcommand>: <reason>` and then the usage line of that subcommand on stderr. The exit code is 2:

```text
usage: s0 --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>
usage: serve --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n> --state-root <abs dir> [--stop-on-stdin-close]
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

The `./cordis` export holds the S0 stub plugin and the real row exports. Its export names are the `plugin` values in the distribution JSON. The sample distributions are `config/s0.distribution.json` and `config/serve.distribution.json`. `s0` accepts `stubPlugin` alone. `serve` accepts every export that `defineRow` declared.

`src/s0/aa-rows.json` is the row snapshot of the application assembly page. The loader and `check:aa-rows` read it. Do not edit it by hand. Regenerate it with the command in the section "Maintenance".

## Contracts

[SPEC.md](SPEC.md) owns the behavior. It has the tree and operator rules, the load checks, the readiness rules, the output records, the exit codes, and the section "有序关闭" (ordered shutdown). `src/types.ts` owns the data shapes.

Summary of the promises:

- A root cannot get a trusted name by its name. A subtree row can.
- A pending row and a failed row are reported apart. A timeout does not turn PENDING into FAILED.
- Shutdown runs four phases in order: `entry`, `business`, `composition`, `storage`. All phases share one deadline. A handle that misses the deadline is `incomplete`, and the next phase still runs.
- The report is final before `assemblyReportSettled()` is called.
- Exit code `5` means start succeeded and shutdown is `incomplete`.
- In `serve`, a real row never depends on an S0 double, never gets a placeholder, and loads only on the row id it declares. Each check decides before any plugin body runs.

## Design

The assembly entry creates the root `Context`. It gives each scope a private tag, loads each row in an isolated context, and reads the real fiber state. Rows that take part in shutdown register a handle with `assemblyLifecycle`. The coordinator holds handles only, never plugin objects. The coordinator does not close business connections.

## Configuration and operation

| Input                    | Effect                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--distribution`         | Absolute path of the release layer JSON.                                                                                                                           |
| `--operator`             | Optional absolute path of the operator layer JSON.                                                                                                                 |
| `--readiness-timeout-ms` | Positive integer. Wait limit for readiness.                                                                                                                        |
| `--shutdown-deadline-ms` | Positive integer. Shared shutdown deadline.                                                                                                                        |
| `--state-root`           | `serve` only. Existing absolute directory for the state files of the entry objects. Its protection is a premise: keep it under the user directory of the operator. |
| `--stop-on-stdin-close`  | `serve` only. A closed stdin requests a planned stop.                                                                                                              |

Requirements: Node `>=24`, from `engines.node`. The runtime dependencies are in `package.json`. The process reads no environment variable and no real secret.

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

The test inventory is in [tests/README.md](tests/README.md). The tests of the real mode are listed in [docs/real-mode.md](docs/real-mode.md). The tests use doubles and fixture rows, not a real SQL provider, not real identity, and not real storage. Doubles do not show durability or real vendor behavior.

Not covered:

- Windows and Linux runs are reported apart. A run on one platform does not cover the other.
- Reflection over `ctx.reflect.store` is a recorded non-guarantee.

## Maintenance

Change the behavior in [SPEC.md](SPEC.md) first, then the code and the tests. Do not change `src/types.ts` without the owner of the S0 closure plan, because all S0 modules depend on it. When the application assembly page changes its plugin tree or trusted-subtree table, regenerate the row snapshot in the same batch:

```sh
cd apps/harness-server
node scripts/aa-rows.mjs write --aa ../../docs/architecture/runtime/application-assembly.md --rows src/s0/aa-rows.json
```

Then update `src/s0/stubs.ts` by hand to follow the changed rows. `tests/real-manifests-sync.spec.ts` compares every real row export with that table. When an assembly-page patch lands, remove its entry from `KNOWN_GAPS` in the same change.

To add a real row, add `src/rows/<row id>/` and one entry in each single-write point. The list is in [docs/real-mode.md](docs/real-mode.md), section "新增一行的成本".

Keep [README_ZH.md](README_ZH.md) in step with this file. Both files state the same promises.
