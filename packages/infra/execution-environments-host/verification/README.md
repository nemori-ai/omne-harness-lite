# Host verification obligations

The public types and [SPEC](../SPEC.md) own the commitments. This directory owns reusable verification inputs. Task logs and delivery reports do not belong here.

## Safety models

| Model         | Protection point                                                                                   | Assumptions and limits                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| HostGate      | Original resource plan, confirmed permission, one GO, and retained launch responsibility           | Finite safety model. Absence permits cleanup only after the original launch is isolated. The model does not prove OS isolation.        |
| TerminalOwner | Confirmed ownership transfer before creator release, and permission for each later leg             | The model abstracts one later leg. Tests check the durable completion and original stop receipt before reuse.                          |
| FileBatch     | Whole precheck, per-target publication receipts, retained unknown batch, and read-only recognition | External writes can occur between inspection and publication. The model does not claim filesystem CAS or atomic multi-path visibility. |

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

`native-command` checks literal arguments, explicit environment, real TTY descriptors, merged bytes, exact stdin EOF, executable lookup, target signals, bounded unread output, permission closure, and real stop. `native-terminal` checks persistent Bash state, temporary overrides, delayed output, quiet controller trace options, damaged private receipts, and residual processes. `host-terminal-owner` checks original adoption, later permission, scoped references, capacity, and receipt gating.

`native-files` checks real byte operations, conditions, whole precheck, publication uncertainty, bounded enumeration, original stage ownership, and lease closure. `host-cold-recovery` kills the actual creator. It checks original command, terminal, and partial-batch recovery without replay. `host-admission-lifecycle` checks immediate caller input changes, retirement and call closure during original readiness verification, pending preparation, adoption-index waits, and cleanup receipt failure after confirmed publication. The original runtime/context/log test checks the real consumer chain. These tests cover named cut points, not every OS fault.

The standard mutation run selects the fast layer. Native slow tests need a separate directed run. Report killed, timed out, survived, and not covered candidates separately. Do not add the two ledgers or treat a timeout as a semantic assertion.

Stage disposal tests replace an original stage before ownership inspection, including a replacement with the same bytes. They verify pending and preservation in those cases. They do not prove conditional unlink under concurrent external stage or parent rebinding. HOST-6 requires noninterference during the final check-to-unlink interval. FileBatch does not model that pathname interval or establish filesystem CAS.

The terminal-receipt suite checks each byte split around a receipt, ordinary ANSI and binary bytes, malformed exit fields, duplicates, oversized frames, and trailing data. It does not prove same-UID isolation or unconditional PTY draining. node-pty can destroy its socket after a finite exit drain window. A paused private transport at exit must remain unknown; unread user output is continuously drained into the bounded parent buffer. Child-worker execution and ordinary in-process member coverage have different scopes. Report missing child coverage explicitly or collect it with a named external verification adapter; do not count a mock as native execution.

## PTY completion faults

Build the host member and its native dependency first. Then run the bounded probes from the repository root:

```sh
./scripts/with-test-slot.sh node packages/infra/execution-environments-host/tests/pty-boundaries.mjs /absolute/task/tmp/pty-boundaries
```

The verifier uses real PTYs, Bash, and original user scopes. It copies compiled workers to disposable directories. Only these copies receive controlled cutpoints. One probe inserts output during asynchronous terminal disposal. Another holds the private stdout transport under actual backpressure until the target terminates itself. Both must reject completion. Each probe also removes its completion guard as a negative control. The same observable oracle must identify the resulting false completion.

The verifier stops and disposes only its original scopes and identity-marked directories. Its output belongs to the supplied task directory. These probes do not fill standard Stryker or member V8 coverage. They do not test manager outage, arbitrary OS races, or same-UID isolation.
