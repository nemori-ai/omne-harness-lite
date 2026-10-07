# Host verification obligations

The public types and [SPEC](../SPEC.md) own the commitments. This directory owns reusable verification inputs. Task logs and delivery reports do not belong here.

## Safety models

| Model | Protection point | Assumptions and limits |
| --- | --- | --- |
| HostGate | Original resource plan, confirmed permission, one GO, and retained launch responsibility | Finite safety model. Absence permits cleanup only after the original launch is isolated. The model does not prove OS isolation. |
| TerminalOwner | Confirmed ownership transfer before creator release, and permission for each later leg | The model abstracts one later leg. Tests check the durable completion and original stop receipt before reuse. |
| FileBatch | Whole precheck, per-target publication receipts, retained unknown batch, and read-only recognition | External writes can occur between inspection and publication. The model does not claim filesystem CAS or atomic multi-path visibility. |

Each model has a `*-safe.cfg` configuration. Each `*-negative.cfg` configuration removes a specific protection. The negative configuration must produce a safety counterexample.

Run TLC from `models/`. Use an ignored task directory for states and generated traces:

```sh
tlc -config HostGate-safe.cfg -metadir /absolute/task/tmp/hostgate HostGate.tla
```

Run all three safe configurations and all twelve negative configurations. Safe configurations must exit 0. Negative configurations must exit 12 with the intended safety invariant violated. Retain the source hash and tool version with the task results. Do not interpret a negative control as a passing safety model.

Progress requires available original Storage and SessionLog, a launch that can drain or be isolated, and a manager that can confirm the original scope. A missing premise requires pending or unconfirmed results. These inputs do not prove unconditional progress or isolation from malicious code with the same OS identity.

## Executable checks

Build before native tests. The worker subprocesses consume the built public member.

```sh
pnpm --filter @omne-harness-lite/execution-environments-host run build
pnpm --filter @omne-harness-lite/execution-environments-host run typecheck
pnpm --filter @omne-harness-lite/execution-environments-host run test
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo exec vitest run tests/host-runtime-integration.spec.ts
```

`native-command` checks literal arguments, explicit environment, separate pipes, bounded unread output, permission closure, and real stop. `native-terminal` checks persistent Bash state, temporary overrides, delayed output, damaged control, and residual processes. `host-terminal-owner` checks original adoption, later permission, scoped references, capacity, and receipt gating.

`native-files` checks real byte operations, conditions, whole precheck, publication uncertainty, bounded enumeration, original stage ownership, and lease closure. `host-cold-recovery` kills the actual creator. It checks original command, terminal, and partial-batch recovery without replay. The original runtime/context/log test checks the real consumer chain. These tests cover named cut points, not every OS fault.

The standard mutation run selects the fast layer. Native slow tests need a separate directed run. Report killed, timed out, survived, and not covered candidates separately. Do not add the two ledgers or treat a timeout as a semantic assertion.
