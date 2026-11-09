# @omne-harness/cli

[中文](README_ZH.md)

The `omne` command line client for the Harness Server. It prints help or the build version. It also sends operations to the server through the SDK: `register`, `login`, `create-session`, `send-input`, `read-history`, `read-session-diagnostics`, `cancel-run`, `stop-call`, and 18 governance operations, one command for each (for example `create-organization`, `switch-current-tenant`, and `revoke-login`). It also has `credential set|show|unset`, which manages the model credential of the tenant, and `setting list|set|show|unset`, which manages the settings of the tenant. Use it to drive a Harness Server from a shell, a script, or a CI job without writing TypeScript against the SDK.

## Responsibility and status

This app owns the process entry `omne`, argument parsing, the 28 commands, the credential reader, the login state file, the build identity, and two public functions that resolve and create the state directory. The package organization page sets the boundary at [The access boundary of the minimal CLI](../../docs/package-organization.md#最小-cli-的接入边界). [SPEC.md](SPEC.md) owns the accepted behavior for help, version, usage errors, and the default state directory.

Implemented:

- `omne --help` and `omne --version`.
- The 28 commands. Each command sends one public operation through the SDK and prints one JSON object. `read-history` reads all pages of a session history and prints text for a person, or one JSON object with `--json`. `read-session-diagnostics` reads all pages of the diagnostics of the runs of a session in the same two forms. The 18 governance commands are named for their operations and act for the tenant that `login.json` holds. [SPEC.md](SPEC.md#治理命令) lists them. `credential set|show|unset` sets, shows or unsets the model credential of that tenant. It reads the secret from standard input or a hidden prompt, and it never prints the secret. See [SPEC.md](SPEC.md#模型凭据命令). `setting list|set|show|unset` lists the settings of that tenant, and sets, shows or unsets one secret setting item. The asset is `[<category>:]<name>`. `set` reads the secret the same way and never prints it. See [SPEC.md](SPEC.md#设置命令).
- `login.json` follows the governance results: `login` saves the `loginId` of the response, `switch-current-tenant` updates the tenant, and `revoke-login` deletes the file when it ends this login.
- Credential entry without echo on a terminal, and from a pipe.
- `login.json` in the state directory, written through a temporary file and a rename.
- `sessions.json` in the state directory: for each session `create-session` made, the tenant that owns it. The same write method.
- Usage errors for every other argument list.
- `resolveStateDirectory` and `ensureStateDirectory` as public functions.

Not implemented:

- Session observation and a subscription command.
- A TTY presentation through pi-tui. Output is the same on a terminal and on a pipe.
- Governance operations on affiliation requests, authorization expressions, and admission judgments, and the commands for the operations that the stage does not provide.

This app imports the SDK and nothing else. It does not import the public contract, a server package, Cordis, or pi-tui. The SDK re-exports the message types and encoding entries that the commands need.

## Usage

Build the SDK and this app, then run the binary. The working directory does not need to be this repository.

```sh
pnpm --filter @omne-harness/cli... run build
node apps/cli/dist/bin.js --help
printf '%s\n' "$CREDENTIAL" | node apps/cli/dist/bin.js register --login-identifier alice
printf '%s\n' "$CREDENTIAL" | node apps/cli/dist/bin.js login --login-identifier alice
node apps/cli/dist/bin.js create-session --definition default
node apps/cli/dist/bin.js send-input --session <id> --text 'hello'
node apps/cli/dist/bin.js read-history --session <id>
node apps/cli/dist/bin.js read-history --session <id> --json
node apps/cli/dist/bin.js read-session-diagnostics --session <id>
node apps/cli/dist/bin.js read-session-diagnostics --session <id> --run <run id> --json
node apps/cli/dist/bin.js cancel-run --session <id> --run <run id>
node apps/cli/dist/bin.js stop-call --session <id> --producer-kind model --call <call id>
```

A typical run has four steps. Register an account with `register`. Issue a login with `login`, which writes the login state. Create a session with `create-session`. Send input with `send-input` and control the run with `cancel-run` or `stop-call`.

`register` and `login` read the credential from standard input. They take no credential option, because a command line appears in the process list and the shell history. On a terminal, the command turns echo off and prompts on standard error. From a pipe, it reads to the first newline.

The server address comes from `--server`, then `OMNE_SERVER`, then (for session commands) the address that `login` recorded, then `http://127.0.0.1:8787`. The SDK accepts only a loopback `http:` address. A rejected address is a usage error.

`read-history` reads the whole history, page by page. By default it prints one block for each entry: text, tool calls, tool results, and the start and end of each run. With `--json` it prints the raw entries in `body.entries`. If it cannot read to the end, it still prints the entries it has, writes the reason to standard error, and exits non-zero (`3` for `denied`, `4` for `basis-unavailable`, `5` when the result is uncertain, `1` for a page it cannot use). [SPEC.md](SPEC.md#读历史) has the rules.

`read-session-diagnostics` reads the diagnostics of the runs of a session, page by page: how each run started and ended, its attempts, the reason of a failure in the words of its owner (for example `reason: model-refused capacity`), each model dispatch with its timing and account, each tool call with its account and the diagnostics of Tool, the counts of the execution facts, and the gaps where a source gave no answer. By default it prints one block for each run. With `--json` it prints the runs and gaps in `body.runs` and `body.gaps`. `--run <id>` limits the read to one run. A gap is part of the result and does not change the exit code. An incomplete read exits as `read-history` does. [SPEC.md](SPEC.md#读诊断投影) has the rules and the text format.

Every other command, and `read-history --json` or `read-session-diagnostics --json`, prints one JSON object to standard output. The object has four keys:

| Key       | When it appears        | Content                                                      |
| --------- | ---------------------- | ------------------------------------------------------------ |
| `result`  | Always                 | `response` or `uncertain`                                    |
| `outcome` | `result` is `response` | The public contract outcome                                  |
| `body`    | `result` is `response` | The response body. For `login`, the body has no `loginProof` |
| `request` | Always                 | The identifiers this call sent                               |

`request` holds `messageId` for every command, plus the call, accept, input, or control identifiers of the operation. To retry the same intent, pass them back with `--create-call-id`, `--accept-id`, `--input-id`, or `--control-id`. The command then reuses the identifiers, so the server can recognize the retry. A new `messageId` is fine.

`uncertain` means the command has no trustworthy reply. The request may have reached the server, or it may not have. Treat it as neither success nor absence. The exit code reflects that:

| Exit code | Condition                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `0`       | `succeeded` or `no-change`                                                                            |
| `1`       | Local failure: identity file, state directory, login state, credential read, or a failed stdout write |
| `2`       | Usage error, including an invalid server address                                                      |
| `3`       | Any other refusal, such as `denied`, `not-found`, or `unsupported`                                    |
| `4`       | `basis-unavailable`. Retry later                                                                      |
| `5`       | `uncertain` or an `unknown` outcome                                                                   |

Other programs can reuse the state directory functions:

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

[SPEC.md](SPEC.md) owns the behavior: the help text, the usage messages, the exit codes, the identity failure, the resolve order, the ensure results, the command table, the credential rules, and the login state. The exported types in `src/index.ts` own the data shapes.

The stable promises are:

- Help and version write only to standard output and exit `0`.
- Usage errors write only to standard error and exit `2`.
- A missing or invalid `dist/cli-identity.json` makes `--version` exit `1`.
- Help, version, usage errors, and `register` do not open, create, or change a state directory. Only `login` creates it. The five session commands only read it, except that `create-session` also writes `sessions.json` after a success.
- Only `login.json` holds the login proof. No standard output, error text, or other state file holds the credential or the proof.
- `resolveStateDirectory` never touches the filesystem.
- `ensureStateDirectory` never removes what occupies the path. It returns an error instead of throwing. A directory it creates has mode `0700` on POSIX.
- On POSIX, a session command refuses a `login.json` that group or other users can read, and exits `1`.

Implementation details are free to change: the module layout, the help text wording beyond the spec, and how a command builds its request.

## Design

Each module has one job:

- `src/catalog.ts` holds `defineCatalog`, the production catalog, and `renderHelp`. The production catalog lists the commands from `src/commands.ts`.
- `src/argv.ts` holds `parseArgv`, a pure function over `string[]` and a catalog.
- `src/command-support.ts` holds what the runners share: the transport, the usage-error messages, and `loadLogin`, which reads the login file and opens the transport.
- `src/credential-command.ts` holds the three subcommands of `credential`. The secret enters only through `src/credential.ts` and goes only into the request.
- `src/setting-command.ts` holds the four subcommands of `setting`. It reads the asset and item words, and the secret of `set` through the same reader.
- `src/governance-commands.ts` holds the 18 governance commands. Each is a small table: which options it accepts, how it checks them without the login, how it builds the request with it, and which local change follows the response.
- `src/commands.ts` holds the eight account and session commands and puts the governance commands after them. `register` and `login` share one runner. Four session commands share another. `read-history` and `read-session-diagnostics` each have their own runner. Each session command is a small table: which options it accepts, how it checks them, and how it builds the request.
- `src/history-command.ts` holds `read-history`: the page loop and the result object. `src/history-render.ts` renders one entry as text for a person.
- `src/diagnostics-command.ts` holds `read-session-diagnostics`: the same page loop over the diagnostics page, and the result object with the runs and the gaps. `src/diagnostics-render.ts` renders the runs and the gaps as text for a person, typed on the page types the SDK passes through.
- `src/options.ts` reads `--name value` pairs, and the switches such as `--json`, against a command's option list.
- `src/report.ts` prints the result object and maps `result` and `outcome` to an exit code.
- `src/credential.ts` reads the credential. `editCredential` is the pure line editor for a terminal.
- `src/login-state.ts` reads, writes, and removes `login.json`.
- `src/session-owners.ts` reads and writes `sessions.json`.
- `src/services.ts` holds the real services: the SDK HTTP transport, process stdin, and random identifiers.
- `src/identity.ts` reads `cli-identity.json` beside the build module through `import.meta.url`.
- `src/run.ts` maps a parsed command to output and an exit code.
- `src/bin.ts` passes the process into `run`, waits for standard output to flush, and sets `process.exitCode`.
- `src/state-directory.ts` holds `resolveStateDirectory` and `ensureStateDirectory`.

Commands reach the process through `CommandEnvironment`: the home inputs, the server input, and the services. A test replaces the transport, the credential reader, or the identifier source without a mock framework. Results are discriminated unions with a `kind` field, so a caller handles expected failures with `switch` and the compiler checks every case.

The build writes the version into `dist/cli-identity.json`. The printed version therefore belongs to the artifact that runs, not to a source tree.

## Configuration and operation

| Input                | Effect                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--home <directory>` | The state directory. A usage error for `register`. Help and version do not use it.                                                                           |
| `OMNE_HOME`          | The state directory when `--home` is absent. Help and version do not resolve or create that path. An empty value is an error, not a fallback to the default. |
| `HOME`               | The default state directory is `$HOME/.omne`.                                                                                                                |
| `--server <url>`     | The server address. Overrides `OMNE_SERVER`.                                                                                                                 |
| `OMNE_SERVER`        | The server address when `--server` is absent. An empty value counts as absent.                                                                               |

Requirements:

- Node `>=24`, from `engines.node`.
- The only runtime dependency is `@omne-harness/sdk`.
- The build needs `typescript`. It writes `dist/cli-identity.json` from `package.json`.

Platform notes:

- On POSIX, the login state file has mode `0600` and a new state directory has mode `0700`.
- On Windows, the app does not tighten or check the access control list of `login.json`, and it does not check the mode bits that Node reports. This is a known limitation in [SPEC.md](SPEC.md).

## Verification

Run the tests and the type check from the repository root:

```sh
pnpm turbo run test --filter=@omne-harness/cli
pnpm turbo run typecheck --filter=@omne-harness/cli
```

The test task builds this app and its dependencies first, so the SDK `dist` is current. The type check does not build first. The tests run the built `dist`, never `src`. `pnpm test` inside this directory does not build.

The test kinds follow [package test responsibilities](../../docs/verification.md#包级测试责任与边界):

- Command tests run in this process. `tests/governance-commands.spec.ts` covers the 18 governance commands: one machine-readable result case for each, the `stage-not-provided` answer, the usage errors, the `loginId` that `login` saves, the login file after `switch-current-tenant`, and the deletion by `revoke-login`. `tests/commands.spec.ts` drives the production catalog with the real SDK HTTP transport against a real HTTP server on `127.0.0.1` (`tests/support/fake-service.ts`). The server answers each operation in the wire form of the public contract. Cases cover each command, the exit-code table, usage errors, the state directory rules, the server precedence, and the no-echo rule.
- `tests/credential-command.spec.ts` covers the three subcommands of `credential`: the request of each subcommand, the output and exit code of each result, the usage errors, and a secret that does not appear in standard output, standard error or the state directory. The secret is a sentinel value. The process test reads it from a pipe.
- `tests/setting-command.spec.ts` covers the four subcommands of `setting`: the request of each subcommand, the asset with and without a category, the output and exit code of each result, the usage errors, the hidden prompt, and a secret that does not appear in standard output, standard error or the state directory.
- `tests/read-history.spec.ts` covers `read-history` against a test service that answers like the public contract: a first-page request has `direction` and `pageBytes`, a cursor request has neither, and a cursor request that has them gets `protocol-rejected`. Cases cover paging over three pages, the request shape of each page, the text rendering of text, tool calls, tool results and run start and end, `--json`, the exit code of each outcome, and the reasons for an incomplete read.
- `tests/read-session-diagnostics.spec.ts` covers `read-session-diagnostics` the same way: a first-page request has `run` and `pageBytes`, a cursor request has neither. Cases cover paging with the gaps of every page collected, the request shape with and without `--run`, the text of two failed runs (`model-refused capacity` and `no-reply upstream-unavailable 504`) with their dispatches, timing, accounts and gaps, a completed and an unfinished run, the attempts by kind, the execution facts of a run and of each call, the diagnostics entries of a tool call, a failure or reason that reads `unknown`, `--json`, the exit code of each outcome, a complete page with gaps that exits `0`, and the reasons for an incomplete read.
- Process tests spawn `node dist/bin.js` from a temporary directory outside the repository. Each child gets a new environment with `PATH`, a temporary `HOME`, and optional `OMNE_HOME` and `OMNE_SERVER`. They are in the slow tier because every case starts a process.
- Unit tests cover the credential reader and its line editor, the login state file, `parseArgv`, the catalog, and the state directory functions.
- `tests/support/expected.ts` reads both help texts from SPEC.md, so the tests compare the build with the spec's own words.
- Install-closure checks read `package.json` and every built module. They check that the SDK is the only runtime dependency and that the built modules import only `node:` modules, sibling modules, and the SDK.
- `tests/packaging.spec.ts` runs `scripts/package-cli.sh` and checks the archive entries, the absence of source maps, a refused existing target, and that `apps/cli/dist` stays untouched.

Not covered:

- No test round-trips with the real server entry. The test server answers in its place.
- No test allocates a real terminal, so a terminal that fails `setRawMode` is not exercised.
- The POSIX permission checks have tests that skip on Windows, and they have not run on a POSIX machine.
- Windows is the only platform that has run these tests.
- The development machine runs Node v26. Node 24 has not been run.

## Maintenance

To change the help text, a message, or an exit code, change [SPEC.md](SPEC.md), the command table in `src/commands.ts` or `src/report.ts`, and the literals in `tests/support/expected.ts` together. The help texts come from SPEC.md.

To add a command, add a `CommandSpec` to `productionCommands` in `src/commands.ts`. `renderHelp` includes it, and `run` calls its `run` with a `CommandEnvironment`. A session command is a `SessionCommand` table: copy one of the four. A command that needs the state directory calls `resolveStateDirectory` and does not read `process.env` itself. Help and version must not call `resolveStateDirectory` or `ensureStateDirectory`. Add the command's options to the spec's command table in the same change.

`scripts/package-cli.sh` builds this app into a private staging directory and writes its `dist/` into a new `.tar.gz`. It neither removes nor writes `apps/cli/dist`, so tests that run the built binary can run at the same time. The build steps repeat the `build` script, so change `tools/package.ts` and the `build` script together. The archive is a build artifact, not an installer: it does not install the command, upload a release, or configure an account.

Keep [README_ZH.md](README_ZH.md) in step with this file. Both files state the same promises.
