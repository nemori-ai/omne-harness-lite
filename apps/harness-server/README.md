# @omne-harness/harness-server

[中文](README_ZH.md)

The application assembly of the Harness Server. It loads a plugin tree through Cordis, checks that the rows load, reports readiness, and shuts down in order. Two modes use the same tree: `s0` loads marked doubles and runs as a check, and `serve` loads the same rows under formal service keys and waits for a stop request. Use it to verify an assembly or to run a server process that an operator starts and stops.

## Responsibility and status

This app owns the assembly entry: the two-layer plugin tree, the trusted-subtree visibility, the readiness report, and the ordered shutdown. It does not own business behavior. Reusable behavior stays in `packages/`. [SPEC.md](SPEC.md) owns the behavior of the S0 entry. It is a working spec, not an accepted product promise.

Implemented:

- The two-layer plugin tree and the boundary schema.
- The loader, the trusted-subtree visibility, and the readiness report.
- The row snapshot `src/s0/aa-rows.json`, its generator, and its diff check.
- The built-in tool release manifest `config/tool-release.json`, its generator `scripts/tool-release.mjs`, and its check. See [docs/rows/tool-release.md](docs/rows/tool-release.md).
- The Model production wiring: the `model-records` and `model-host` rows, the application Model module `src/model/` and the real `modelHostAuthority`. See [docs/rows/model-release.md](docs/rows/model-release.md).
- The shutdown coordinator and the process entry `dist/bin.js`.
- The `./cordis` export, which holds the S0 stub plugin. Row closures add their real exports to it.
- The `serve` subcommand, the row declaration `defineRow`, the entry object registry, and the checks before loading in the real mode. See [docs/real-mode.md](docs/real-mode.md).
- The `telemetry` row (the Node provider of engineering telemetry, candidate, first version), the three-state Cordis log bridge and the telemetry close step of the ordered shutdown. The entry diagnostics leave as `omne.entry.diagnostic` events. See [docs/rows/telemetry.md](docs/rows/telemetry.md).
- The secret custody and the settings rows (web-meta-tool slice 04): `secret-custody` provides the trusted `settingsSecretCustody` over the vault file; `settings` registers the setting definitions of the release tools, serves the four `omne setting` operations through the trusted `settingsSecretItems` that `server-entry` reads per call, and the Web attachment of `tool-bindings` resolves the search key from the same custody. See [docs/rows/secret-custody.md](docs/rows/secret-custody.md) and [docs/rows/settings.md](docs/rows/settings.md).
- The session diagnostics projection in the application (candidate, RFC-0013 A line): the `model-records` row provides `modelDiagnostics`, and the `server-entry` row injects `agentJournal`, `modelDiagnostics` and `modelRuntime` and reads `toolRuntime` per call. The local profile discloses every projected kind. See [docs/rows/server-entry.md](docs/rows/server-entry.md) and [docs/rows/model-release.md](docs/rows/model-release.md#诊断读面-modeldiagnostics).

The ordered shutdown rules in SPEC.md (the start order, no new `start` after the stopping state, and the handling of a `start` that throws) are implemented. `tests/shutdown.spec.ts` and `tests/s0-process.spec.ts` cover them.

The S0 mode does not open HTTP, create a tenant, open a business state root, or read a real secret. A passing S0 run does not show that a tenant can be created or used.

The `serve` mode loads the same rows under formal service keys. In the sample distribution, the storage, identity, authorization, session storage and provider, agent adoption, adoption source, tool bindings, tool host, tool residency, server entry, and telemetry rows are real, and the remaining rows are still stubs. A passing `serve` run checks the assembly, not a full tenant path.

## Usage

### Run the server on your own host

One person who runs the server on own host uses the local single-user profile. Build, set up once, then run only `serve`. The commands are the same on Windows and Linux:

```sh
pnpm exec turbo run build --filter="@omne-harness/harness-server..." --filter="@omne-harness/cli..."
node apps/harness-server/dist/bin.js setup            # asks for the model credential (OpenRouter API key), input is hidden
node apps/harness-server/dist/bin.js serve            # Ctrl+C stops it
```

- `setup` puts the credential into the vault in the state directory. It writes the port, the workspace and the shell into the settings file. The settings file holds no secret. A pipe can also supply the credential, for example `printf '%s\n' "$KEY" | node apps/harness-server/dist/bin.js setup`.
- Places: on Windows `%LOCALAPPDATA%\omne\config` and `%LOCALAPPDATA%\omne\state`. On Linux `~/.config/omne` and `~/.local/state/omne` (`XDG_CONFIG_HOME` and `XDG_STATE_HOME` apply). `OMNE_SERVER_HOME=<dir>` moves both to `<dir>/config` and `<dir>/state`.
- Options: `--port <n>` (default 8787), `--workspace <dir>` (default `<state>/workspace`), `--shell <executable>` (default Windows PowerShell on Windows, `/bin/bash` elsewhere).
- The environment of the Shell tool is the `PATH` that `setup` saw and a few allowlisted variables. It holds no variable whose name looks like a secret. On Windows, PowerShell starts with `-ExecutionPolicy Bypass`, so local scripts run, and a UTF-8 prelude, so that Chinese text in the output reaches the model intact. The allowlist is in [SPEC.md](SPEC.md#shell-的环境).
- A second `setup` checks and does not overwrite. It opens the vault, so a vault that cannot be read is an error, not "kept". Add `--reconfigure` to change the settings. Add `--reset` to replace a settings file that is not valid with default values. Add `--replace-credential` to change the credential, or to build a new vault in place of one that cannot be read.
- `serve` without arguments reads this setup. On a host without `setup`, it tells you to run `setup` and exits with code 2.
- The `omne` CLI uses the port of the settings file when there is no `--server` and no `OMNE_SERVER`.

The full rules are in [SPEC.md](SPEC.md#本机单用户档).

### Both modes and all arguments

The `s0` and `serve` positionals select the mode:

```sh
pnpm --filter @omne-harness/harness-server run build
node apps/harness-server/dist/bin.js s0 --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>
node apps/harness-server/dist/bin.js serve [--distribution <abs json>] [--operator <abs json>] [--readiness-timeout-ms <n>] [--shutdown-deadline-ms <n>] [--state-root <abs dir>] [--stop-on-stdin-close]
```

For each argument that `serve` does not get, it takes the value of the local single-user profile. The distribution is the bundled `config/serve.distribution.json`. The timeouts are 30000 and 10000 ms. The operator layer and the state root come from the `setup` configuration.

`s0` stops by itself after it writes the startup result. `serve` waits for a stop request: a closed stdin (with `--stop-on-stdin-close`), SIGINT, or SIGTERM. On Windows, a closed stdin is the only way another process can stop it.

Under `serve`, every Cordis message up to WARN and every entry diagnostic reaches stdout as one `telemetry` record (`kind: 'telemetry'`, one JSON object per line). The former `log` record (`{ kind: 'log', level, name, text }`) is gone. This is a breaking change of the output of this app, based on line B of RFC-0013 (candidate). stdout has one writer, so `shutdown-result` is the last line. The record shape and the shutdown report field `telemetry` are in [SPEC.md](SPEC.md#进程输出与退出码) and [docs/rows/telemetry.md](docs/rows/telemetry.md).

A usage error prints `<subcommand>: <reason>` and then the usage line of that subcommand on standard error. The exit code is 2:

```text
usage: s0 --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>
usage: serve [--distribution <abs json>] [--operator <abs json>] [--readiness-timeout-ms <n>] [--shutdown-deadline-ms <n>] [--state-root <abs dir>] [--stop-on-stdin-close]
usage: setup [--port <n>] [--workspace <dir>] [--shell <executable>] [--reconfigure] [--reset] [--replace-credential]
```

With only the distribution file, `serve` cannot load. The distribution layer gives no factory values for `execution-host` and `agent-host`, and no `loopGuardPolicy` for `agent-host`. The process exits with `invalid-config` and does not serve (R2-D229). The operator layer must give these values. Without `--operator`, the local single-user profile makes this layer: it starts from the configuration of each release row and adds the numbers of `src/local/operator-defaults.ts`. If you write your own `--operator`, note that `replace` does not merge: for `agent-host`, copy `jointCommits` and `coordination` from the distribution layer exactly. The numbers of the profile have no measurement behind them, and `loopGuardPolicy` has only a placeholder adoption. The known limit is in [SPEC.md](SPEC.md#已知限制).

Other programs can call `runS0` and import the record types:

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

`src/s0/aa-rows.json` is the row snapshot of the application assembly page. The loader and `check:aa-rows` read it. Do not edit it by hand. Regenerate it with the command in the maintenance section.

## Contracts

[SPEC.md](SPEC.md) owns the behavior: the tree and operator rules, the load checks, the readiness rules, the output records, the exit codes, and the ordered shutdown. `src/types.ts` owns the data shapes.

The stable promises are:

- A root cannot get a trusted name by its name. A subtree row can.
- A pending row and a failed row are reported apart. A timeout does not turn PENDING into FAILED.
- Shutdown runs four phases in order: `entry`, `business`, `composition`, `storage`. All phases share one deadline. A handle that misses the deadline is `incomplete`, and the next phase still runs.
- The report is final before `assemblyReportSettled()` is called.
- Exit code `5` means start succeeded and shutdown is `incomplete`.
- In `serve`, a real row never depends on an S0 double, never gets a placeholder, and loads only on the row id it declares. Each check decides before any plugin body runs.

Implementation details are free to change: the module layout, the stub plugin body, and the snapshot file format.

## Design

The assembly entry creates the root `Context`. It gives each scope a private tag, loads each row in an isolated context, and reads the real fiber state. Rows that take part in shutdown register a handle with `assemblyLifecycle`. The coordinator holds handles only, never plugin objects. The coordinator does not close business connections.

The test inventory in [tests/README.md](tests/README.md) names each file and its tier. [docs/real-mode.md](docs/real-mode.md) covers the real mode.

## Configuration and operation

| Input | Effect |
| --- | --- |
| `--distribution` | Absolute path of the release layer JSON. Without it, `serve` uses `config/serve.distribution.json`. |
| `--operator` | Optional absolute path of the operator layer JSON. Without it, `serve` makes the layer of the local single-user profile. |
| `--readiness-timeout-ms` | Positive integer. Wait limit for readiness. Without it, `serve` uses 30000. |
| `--shutdown-deadline-ms` | Positive integer. Shared shutdown deadline. Without it, `serve` uses 10000. |
| `--state-root` | `serve` only. Existing absolute directory for the state files of the entry objects. Without it, `serve` uses the state directory of the local profile. Its protection is a premise: keep it under the user directory of the operator. |
| `--stop-on-stdin-close` | `serve` only. A closed stdin requests a planned stop. |
| `OMNE_SERVER_HOME` | Environment variable. `setup` and `serve` use `<dir>/config` and `<dir>/state` instead of the platform directories. |
| `LOCALAPPDATA`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME` | Environment variables. They set the platform directories. |

The arguments and the behavior of `setup` are in [SPEC.md](SPEC.md#setup).

Requirements: Node `>=24`, from `engines.node`. The runtime dependencies are in `package.json`. `s0`, and `serve` with all arguments, read no environment variable and no real secret. `setup` reads the model credential from standard input and writes it into the vault of the state directory. `serve` gets the model credential only from that vault.

## Verification

Run the checks from the repository root:

```sh
pnpm run check:docs
pnpm --filter @omne-harness/harness-server run typecheck
pnpm --filter @omne-harness/harness-server run build
pnpm --filter @omne-harness/harness-server run test:fast
pnpm --filter @omne-harness/harness-server run test:slow
pnpm --filter @omne-harness/harness-server run check:aa-rows
pnpm --filter @omne-harness/harness-server run check:tool-release
```

`test:slow` starts `dist/bin.js`, so run `build` first. `check:tool-release` recomputes the tool release manifest from the built `@omne-harness/tool-definitions`, so build that package first.

The tests use doubles and fixture rows, not a real SQL provider, real identity, or real storage. Doubles do not show durability or real vendor behavior.

`check:aa-rows` does three checks and exits with a nonzero code when one fails:

- The snapshot `src/s0/aa-rows.json` equals the plugin tree and the trusted table of the application assembly page.
- Rule E1, trusted reads. A name in the trusted table is read in one of two ways. An entry object module (`src/entry`) reads it through `env.readTrusted(name)`. A row source (`src/rows`) reads it only when the trusted table lists the name as visible for that row. An entry module that calls `get`, an index, `ctx.<name>` or an aliased import on a trusted name at the root fails. A row source that mentions a name its row cannot see fails.
- Rule E2, issuer call sites. `issueActingForTenant(` and `issueSystem(` occur only in the files that `issuerCallSites` and `issuerDefinition` of `scripts/aa-trust-config.json` list.

`pending` in `scripts/aa-trust-config.json` lists names that should become trusted but that the table does not list yet. The check scans them with the same rules and only reports the findings. A pending name that the table lists is enforced. The list is empty now.

The scanner is lexical. It does not follow a trusted name that was assigned to another variable first.

Not covered:

- Windows and Linux runs are reported apart. A run on one platform does not cover the other.
- Reflection over `ctx.reflect.store` is a recorded non-guarantee.

## Maintenance

Change the behavior in [SPEC.md](SPEC.md) first, then the code and the tests. Do not change `src/types.ts` without the owner of the S0 closure plan, because all S0 modules depend on it. When the application assembly page changes its plugin tree or trusted-subtree table, regenerate the row snapshot in the same change:

```sh
cd apps/harness-server
node scripts/aa-rows.mjs write --aa ../../docs/architecture/runtime/application-assembly.md --rows src/s0/aa-rows.json
```

When `@omne-harness/tool-definitions` or the version of this app changes, rebuild it and regenerate the tool release manifest in the same change:

```sh
cd apps/harness-server
node scripts/tool-release.mjs write
```

Then update `src/s0/stubs.ts` by hand to follow the changed rows. `tests/real-manifests-sync.spec.ts` compares every real row export with that table. When an assembly-page patch lands, remove its entry from `KNOWN_GAPS` in the same change.

To add a real row, add `src/rows/<row id>/` and one entry in each single-write point. The list is in [docs/real-mode.md](docs/real-mode.md), section "新增一行的成本".

Keep [README_ZH.md](README_ZH.md) in step with this file. Both files state the same promises.
