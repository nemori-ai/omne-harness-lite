# execution-environments-host

[中文说明](README_ZH.md)

This package provides real host command and file facilities through the original environment registry. It includes persistent Bash terminals and durable recovery ownership. It does not provide sandbox isolation.

## Public entries

The root exports standalone native functions, policy, and provider factories. `./cordis` exports integration plugins. `./migrations` exports the host resource-index migrations. Use the package exports for cross-package imports.

- [Root exports](src/index.ts)
- [Cordis bindings](src/cordis.ts)
- [Migrations](src/migrations.ts)
- [Behavior beyond types](SPEC.md)
- [Verification obligations](verification/README.md)

`createHostEnvironment({ name, access, storage, policy? })` requires original Storage with `hostEnvironmentMigrations` installed. The assembly composes these migrations with its other owners. Creating the factory does not execute a user command. Register the provider with the original environment registry and retain both owners until retirement confirms completion.

The managed `hostEnvironment` plugin injects the original environment registry, SessionAccess, Storage, and assembly lifetime. Its config contains only `provider` and optional policy data. The plugin retains its registration and close duty through assembly-lifecycle. It adds no HostService or ToolRuntime service.

## Capabilities and use

Command supports explicit executable/args/cwd/env, merged PTY byte output (`outputMode: terminal`), bounded buffering, and original stop controls. A persistent terminal preserves shell state. Its later commands each require a new call permission. Releasing its creator call does not close an adopted terminal.

Files supports bounded read/write, stat/list/search, move/copy/remove/mkdir, conditional batches, and read-only batch recognition. Versions describe metadata identity. External processes can change targets between checks and publication. Multi-path changes are not an atomic filesystem transaction.

Native functions work without Storage or Runtime. A standalone caller must retain returned controls and manifests. Always confirm process stop before disposing its native gate evidence with `clearHostGateEntry`. The `executeHostCommand` process stop combines these steps. For batches, retain the returned stage identities and pass them to `clearHostBatchStages`. An unknown copy carries the same original recovery values. Never repeat an unknown command or batch automatically.

The host requires Linux, a working systemd user manager and scopes, Node, `/usr/bin/env`, `/usr/bin/stty`, and `/bin/bash`. User commands receive their explicit environment. PTY initialization sets PWD to cwd and TERM to the explicit value or xterm. The user manager receives a separate controlled technical environment. Policy bounds govern output, input, deadlines, terminal capacity, file bytes, and traversal. PTY geometry defaults to 80 columns and 24 rows; terminalColumns and terminalRows are configurable. Output chunks can contain partial or multiple lines. They retain CRLF, ANSI, and carriage returns. There is no hard realtime, per-byte, or per-line delivery guarantee. A consumer must use incremental decoding for UTF-8. Live input and resize are not public facility ports in this package.

## Development

Install with the repository's --ignore-scripts policy, then build only the official node-pty native dependency. Linux with Node 24 needs a C++20-capable compiler and node-gyp prerequisites. Older default compilers require explicit CC/CXX settings. Do not enable all dependency scripts.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @omne-harness-lite/execution-environments-host rebuild node-pty
```

Build before tests. Real child workers use the current `dist` files.

```sh
pnpm --filter @omne-harness-lite/execution-environments-host run build
pnpm --filter @omne-harness-lite/execution-environments-host run typecheck
pnpm --filter @omne-harness-lite/execution-environments-host run test
```

Real process, filesystem, and SIGKILL tests carry the slow tag. Test fixtures do not establish the formal Shell or Files author packages.
