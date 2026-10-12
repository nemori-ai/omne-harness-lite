# @omne-harness-lite/meta-shell

[中文](README_ZH.md)

Independent Shell meta tool. The caller supplies Runtime Context and the selected command facility. The tool implements help, create_session, execute, close_session, and info.

## Public API and example

The pure root exports createShellTool, SHELL_CONTEXT_KEY, and public types. Use ./cordis for registration in the existing tool implementation registry.

```typescript
import { createShellTool } from '@omne-harness-lite/meta-shell'

const tool = createShellTool({
  shell: { executable: '/bin/bash', args: ['--noprofile', '--norc'] },
  maxOutputBytes: 65536,
})
// Pass bound InvocationDependencies when invoking tool.executor.
```

The definition permits background advancement. Its configurable waiting threshold defaults to 10 minutes. The upper caller owns waiting. The tool keeps the same independent execution and does not stop it at this threshold.

Provide {cwd, envs} under shell.initial through Runtime Context. Workspace can supply this source later. Persistent terminal execution uses its retained state unless a call supplies temporary overrides.

## Commitments and verification

Types define the public shapes. [SPEC.md](SPEC.md) defines behavior beyond those types. The command facility owns effects and resource recovery. Pure roots do not import a concrete host provider. Slow tests exercise the actual host implementation.

## Development

Follow [workspace setup](../../../docs/development.md). Build dependencies first.

```sh
pnpm --filter @omne-harness-lite/meta-shell run build
pnpm --filter @omne-harness-lite/meta-shell run typecheck
pnpm --filter @omne-harness-lite/meta-shell run test
```
