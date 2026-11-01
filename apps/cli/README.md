# @omne-harness/cli

[中文](README_ZH.md)

The minimal `omne` command. It prints help or its version, and it runs six commands that reach the server through the SDK: `register`, `login`, `create-session`, `send-input`, `cancel-run`, and `stop-call`.

## Responsibility and status

This app member owns the process entry `omne`, argument parsing, the six commands, the credential reader, the login state file, the build identity, and two public functions for the state directory. The boundary comes from [package organization](../../docs/package-organization.md#最小-cli-的接入边界). The accepted rules for help, version, usage errors, and the default state directory are in [SPEC.md](SPEC.md). The six commands, the login state, and exit codes 3 to 5 are candidate clauses of #978 wave 1. SPEC.md lists them under its adoption status.

Implemented today:

- `omne --help` and `omne --version`.
- The six commands. Each command sends one public operation through the SDK and prints one JSON object.
- Credential entry without echo on a terminal, and from a pipe.
- `login.json` in the state directory, written through a temporary file and a rename.
- Usage errors for every other argument list.
- `resolveStateDirectory` and `ensureStateDirectory` as public functions.

Not implemented:

- `read-history`, session observation, and a subscription command. They come in a later wave.
- A TTY presentation through pi-tui.
- `revoke-login`. The M2 deployment does not provide it.

This member depends on the SDK only. It does not import the public contract, a server package, Cordis, or pi-tui.

## Usage

Build the SDK and this member, then run the binary. The working directory does not need to be this repository.

```sh
pnpm --filter @omne-harness/cli... run build
node apps/cli/dist/bin.js --help
printf '%s\n' "$CREDENTIAL" | node apps/cli/dist/bin.js login --login-identifier alice
node apps/cli/dist/bin.js create-session --definition default
node apps/cli/dist/bin.js send-input --session <id> --text 'hello'
node apps/cli/dist/bin.js cancel-run --session <id> --run <run id>
```

The server address is `--server`, then `OMNE_SERVER`, then (for session commands) the address `login` recorded, then `http://127.0.0.1:8787`. The SDK accepts only a loopback `http:` address.

Every command prints a JSON object with `result`, `outcome`, `body`, and `request`. The `request` object holds the identifiers the command sent. Pass them back with `--create-call-id`, `--accept-id`, `--input-id`, or `--control-id` to retry the same intent. The exit code depends on `result` and `outcome` only: `0` succeeded or no change, `1` local failure, `2` usage error, `3` any other refusal, `4` `basis-unavailable`, and `5` result uncertain.

A later command can reuse the state directory functions:

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

[SPEC.md](SPEC.md) owns the behavior. It has the help text, the usage messages, the exit codes, the identity failure, the resolve order, the ensure results, the command table, the credential rules, and the login state. The exported types in `src/index.ts` own the data shapes.

Summary of the promises:

- Help and version write only to stdout and exit `0`.
- Usage errors write only to stderr and exit `2`.
- A missing or invalid `dist/cli-identity.json` makes `--version` exit `1`.
- Help, version, usage errors, and `register` do not open, create, or change a state directory. Only `login` creates it. The four session commands only read it.
- No output, error text, or state file other than `login.json` holds the credential. Only `login.json` holds the login proof.
- `resolveStateDirectory` never touches the filesystem.
- `ensureStateDirectory` never removes what occupies the path, and it returns an error instead of throwing. A directory it creates has mode `0700` on POSIX.

## Design

Each module has one job:

- `src/catalog.ts` holds `defineCatalog`, the production catalog, and `renderHelp`. The production catalog lists the six commands from `src/commands.ts`. `bin.ts` passes that catalog, the identity reader, the home and server inputs, and the services into `run`.
- `src/argv.ts` holds `parseArgv`. Parsing is a pure function over `string[]` and a catalog.
- `src/commands.ts` holds the six commands. `register` and `login` share one runner. The four session commands share another. Each session command is a small table: which options it accepts, how it checks them, and how it builds the request.
- `src/options.ts` reads `--name value` pairs against a command's option list.
- `src/report.ts` prints the result object and maps `result` and `outcome` to an exit code.
- `src/credential.ts` reads the credential. `editCredential` is the pure line editor for a terminal.
- `src/login-state.ts` reads and writes `login.json`.
- `src/services.ts` holds the real services: the SDK's HTTP transport, the process stdin, and random identifiers.
- `src/identity.ts` reads `cli-identity.json` beside the build module through `import.meta.url`.
- `src/run.ts` maps a parsed command to output and an exit code. It is asynchronous because commands send requests.
- `src/bin.ts` passes the process into `run`, waits for stdout to flush, and sets `process.exitCode`. A failed stdout write makes the exit code `1`.
- `src/state-directory.ts` holds `resolveStateDirectory` and `ensureStateDirectory`.

Commands get everything that touches the process through `CommandEnvironment`: the home inputs, the server input, and the services. A test replaces the transport, the credential reader, or the identifier source without a mock framework.

Results are discriminated unions with a `kind` field. Expected failures are values, so callers handle them with `switch` and the compiler checks every case.

The version source is a file that the build writes. This keeps the printed version tied to the artifact that runs.

## Configuration and operation

| Input                | Effect                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `--home <directory>` | The state directory. A usage error for `register`. Help and version do not use it.                |
| `OMNE_HOME`          | The state directory when `--home` is absent. Help and version do not resolve or create that path. |
| `HOME`               | `bin.ts` calls `os.homedir()`. The default state directory is `$HOME/.omne`.                      |
| `--server <url>`     | The server address. Overrides `OMNE_SERVER`.                                                      |
| `OMNE_SERVER`        | The server address when `--server` is absent. An empty value counts as absent.                    |

Requirements:

- Node `>=24`, from `engines.node`.
- The only runtime dependency is `@omne-harness/sdk`.
- The build needs `typescript`. It writes `dist/cli-identity.json` from `package.json`.

Platform notes:

- On POSIX, a session command refuses a `login.json` that group or other users can read, and exits `1`.
- On Windows, the member does not tighten or check the access control list of `login.json`. The file keeps the rules of its directory. This is a known limitation in [SPEC.md](SPEC.md). The mode bits Node reports there say nothing about the access rules.

## Verification

Run the tests from the repository root:

```sh
pnpm turbo run test --filter=@omne-harness/cli
pnpm turbo run typecheck --filter=@omne-harness/cli
```

The test task builds this package and its dependencies first, so the SDK `dist` is current. The typecheck task does not build first. The tests use the built `dist`, never `src`. `pnpm test` in this directory does not build.

Applicable test kinds follow [package test responsibilities](../../docs/verification.md#包级测试责任与边界):

- Command tests in this process. `tests/commands.spec.ts` runs the production catalog with the real SDK HTTP transport against a real HTTP server on `127.0.0.1` (`tests/support/fake-service.ts`). The server answers each operation in the wire form of the public contract. The credential reader and the identifier source are scripted. Cases cover each command, the exit-code table, usage errors, the state directory rules, the server precedence, the no-echo rule with a positive control, and a failed stdout write.
- Process tests on the built bin. `tests/help-version.spec.ts`, `tests/usage-errors.spec.ts`, and `tests/commands-process.spec.ts` spawn `node dist/bin.js` from a temporary directory outside the repository. Each child gets a new environment with `PATH`, a temporary `HOME`, and optional `OMNE_HOME` and `OMNE_SERVER`. These files are in the slow tier because every case spawns a process.
- Unit tests. `tests/credential.spec.ts` covers the line editor and the reader with fake terminal and pipe streams. `tests/login-state.spec.ts` covers the file. `tests/parse-argv.spec.ts`, `tests/catalog.spec.ts`, and `tests/state-directory.spec.ts` import `@omne-harness/cli`.
- Help text. `tests/support/expected.ts` reads both help texts from SPEC.md, so the tests compare the build with the spec's own words.
- Install-closure checks. `tests/package-boundary.spec.ts` reads `package.json` and every built module. It checks that the SDK is the only runtime dependency, and that the built modules import only `node:` modules, sibling build modules, and the SDK. It also checks that at least one module imports the SDK.
- Packaging check. `tests/packaging.spec.ts` runs `scripts/package-cli.sh`. It checks the archive entries, that the archive has no source maps, that an existing target is refused, and that no entry under `apps/cli/dist` is removed or rewritten. It is in the slow tier because it runs a full tsc build and a tar process.

Not covered:

- No test round-trips with the real server entry. The server entry is another member. The line lead runs that round trip after it lands, by giving the commands a real address instead of the test server.
- No test allocates a TTY. The terminal path is covered through fake streams, so a real terminal that reports `isTTY` but fails in `setRawMode` is not exercised.
- The POSIX permission refusal, the `0600` file mode, and the `0700` directory mode have tests that skip on Windows. They have not run on this machine.
- A failed write to a closed stdout pipe in the built bin is not tested. The same path in `run` is tested with a throwing stdout function.
- The unreadable-directory and read-only-parent cases skip when the tests run as root.
- Windows is the only platform that has run these tests.
- The local development machine runs Node v26. Node 24 was not run. `engines.node` is `>=24`.
- No test installs the package outside the workspace through `pnpm pack`.

## Maintenance

To change the help text, a message, or an exit code, change [SPEC.md](SPEC.md), the command table in `src/commands.ts` or `src/report.ts`, and the literals in `tests/support/expected.ts` together. The two help texts come from SPEC.md.

To add a command, add a `CommandSpec` to `productionCommands` in `src/commands.ts`. `renderHelp` includes it, and `run` calls its `run` with a `CommandEnvironment`. A session command is a `SessionCommand` table: copy one of the four. A command that needs the state directory calls `resolveStateDirectory` with `homeFlag`, `environmentHome`, and `homeDirectory`. It does not read `process.env` itself. Help and version must not call `resolveStateDirectory` or `ensureStateDirectory`. Add the command's options to the spec's command table and the help text in the same change.

`scripts/package-cli.sh` builds this member into a private staging directory and writes that `dist/` into a new `.tar.gz`. It does not remove or write `apps/cli/dist`, so tests that run the built bin can run at the same time. The archive has no source maps, because it carries no sources. It writes the archive in the staging directory, copies it next to the target, and renames it into place. On failure it removes its staging directory and the partial archive, and the target does not exist. The build steps repeat the member's `build` script. Change `tools/package.ts` and the `build` script together. It does not install the command, upload a release, or configure an account. The archive is not the old B01 installer.

Keep [README_ZH.md](README_ZH.md) in step with this file. Both files state the same promises.
