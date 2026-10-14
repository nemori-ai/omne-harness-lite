# @omne-harness/cli

[中文](README_ZH.md)

The minimal `omne` command. This build prints help or its version. It has no other command.

## Responsibility and status

This app member owns the process entry `omne`, argument parsing, the build identity, and two public functions for the state directory. The boundary comes from [package organization](../../docs/package-organization.md#最小-cli-的接入边界). The member name, binary name, exit codes, messages, and state rules are proposals from #246. They are in [SPEC.md](SPEC.md). The repository owner accepts or replaces them in review.

Implemented today:

- `omne --help` and `omne --version`.
- Usage errors for every other argument list.
- `resolveStateDirectory` and `ensureStateDirectory` as public functions.

Not implemented:

- A command that calls the SDK.
- A TTY presentation through pi-tui.
- A command that creates the state directory.

This member does not depend on the SDK, Cordis, pi-tui, or a server package.

## Usage

Build the member, then run the binary. The working directory does not need to be this repository.

```sh
pnpm --filter @omne-harness/cli run build
node apps/cli/dist/bin.js --help
node apps/cli/dist/bin.js --version
```

`--version` prints `0.0.0` and a newline. Any other argument list exits with code `2`. For example, `omne`, `omne -h`, and `omne --help --version` all exit with code `2`.

A later command resolves the state directory first and creates it only when it needs to write:

```ts
import { homedir } from 'node:os'
import { ensureStateDirectory, resolveStateDirectory } from '@omne-harness/cli'

const resolved = resolveStateDirectory({
  flag: undefined,
  environment: process.env.OMNE_HOME,
  home: homedir(),
})
if (resolved.kind === 'error') process.stderr.write(resolved.message)
else {
  const ready = ensureStateDirectory(resolved.path)
  if (ready.kind === 'error') process.stderr.write(ready.message)
}
```

## Contracts

[SPEC.md](SPEC.md) owns the behavior. It has the help text, the three usage messages, the exit codes, the identity failure, the resolve order, and the ensure results. The exported types in `src/index.ts` own the data shapes.

Summary of the promises:

- Help and version write only to stdout and exit `0`.
- Usage errors write only to stderr and exit `2`.
- A missing or invalid `dist/cli-identity.json` makes `--version` exit `1`.
- None of these paths opens, creates, or changes a state directory.
- `resolveStateDirectory` never touches the filesystem.
- `ensureStateDirectory` never removes what occupies the path, and it returns an error instead of throwing.

## Design

Each module has one job:

- `src/catalog.ts` holds the flag list, the command list, and `renderHelp`. `helpText` is `renderHelp` of the production catalog. That catalog has no commands, so the process help text stays the pinned string.
- `src/argv.ts` holds `parseArgv`. Parsing is a pure function over `string[]` and a catalog. The default catalog is the production one.
- `src/identity.ts` reads `cli-identity.json` beside the build module through `import.meta.url`.
- `src/run.ts` maps a parsed command to output and an exit code. It is the only place that calls `readBuildIdentity`.
- `src/bin.ts` passes `process.argv` and the process streams to `run`, then sets `process.exitCode`.
- `src/state-directory.ts` holds `resolveStateDirectory` and `ensureStateDirectory`.

Results are discriminated unions with a `kind` field. Expected failures are values, so callers handle them with `switch` and the compiler checks every case.

The version source is a file that the build writes. This keeps the printed version tied to the artifact that runs. A copied `dist` prints the version in its own identity file.

## Configuration and operation

| Input | Effect today |
| --- | --- |
| `--home <directory>` | Usage error. A later command passes it to `resolveStateDirectory` as `flag`. |
| `OMNE_HOME` | Not read by the process. A later command passes it as `environment`. |
| `HOME` | Not read by the process. `os.homedir()` gives the default parent to a later command. |

Requirements:

- Node `>=24.18.0 <25`, from `engines.node`.
- The member has no runtime dependency to install.
- The build needs `typescript`. It writes `dist/cli-identity.json` from `package.json`.

The process does not open a network connection, a database, or a state directory.

## Verification

Run the tests from this directory:

```sh
pnpm test
pnpm run typecheck
```

Both scripts build first. The tests use the built `dist`, never `src`.

Applicable test kinds follow [package test responsibilities](../../docs/verification.md#包级测试责任与边界):

- Contract tests on the built process. `tests/help-version.spec.ts` and `tests/usage-errors.spec.ts` spawn `node dist/bin.js` from a temporary directory outside the repository. Each child gets a new environment with only `PATH`, a temporary `HOME`, and an optional `OMNE_HOME`. Each test checks the exit code, the exact stdout, the exact stderr, and the files under the temporary directories. Both files are in the slow tier because every case spawns a process.
- Unit and contract tests through the package name. `tests/parse-argv.spec.ts` and `tests/state-directory.spec.ts` import `@omne-harness/cli`. The state tests use children of `os.tmpdir()`, never the developer home.
- Install-closure checks. `tests/package-boundary.spec.ts` reads `package.json` and every built module. It checks that there is no runtime dependency, and that the built modules import only `node:` modules and sibling build modules.

Integration and end-to-end tests do not apply. This member has no storage, service, or user journey yet. The help and version process tests are not a full user journey.

Not covered:

- The process tests use piped stdio. No test allocates a TTY.
- The unreadable-directory and read-only-parent cases skip when the tests run as root, because root bypasses these permissions.
- Windows is not tested.
- The local development machine runs Node v26. The tests have not run on Node 24.
- No test installs the package outside the workspace through `pnpm pack`.

## Maintenance

To change the help text, a message, or an exit code, change [SPEC.md](SPEC.md), `src/argv.ts` or `src/run.ts`, and the literals in `tests/support/expected.ts` together.

To add a command, append a `CommandSpec` to a catalog. `renderHelp` includes it, and `run` calls its `run` function. The production catalog's command list is empty. A command that needs the state directory calls `resolveStateDirectory`, then `ensureStateDirectory`. Help and version must not call either function. A command that calls the SDK adds the SDK as a dependency. Update the install-closure test and SPEC.md in the same change.

`scripts/package-cli.sh` still points to `apps/cli/tools/package.ts`. That file does not exist. Packaging for release is not part of this member yet.

Keep [README_ZH.md](README_ZH.md) in step with this file. Both files state the same promises.
