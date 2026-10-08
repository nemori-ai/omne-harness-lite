# Selected tool implementation acceptance

This acceptance covers PF-006 S118. It assembles the public independent Tool Runtime
with real SQLite storage, account registration, login checks, asset evaluation,
implementation registration, and official admission judgment.

Two tool candidates have the same name. Tenant customization selects one candidate.
The selected implementation writes a unique file marker and returns its original
arguments with that marker. The acceptance checks the selected asset and version,
the result, and the absence of the other candidate's effect. It also checks repeated
submission, authorization rejection, durable execution records, and resource closure.

## Run

Use the Node and pnpm versions declared by the repository. Install the locked workspace
dependencies as described in the root development guide. From the repository root:

```sh
./scripts/with-test-slot.sh pnpm --filter @omne-harness-lite/model-invocation-minimal-demo... run build
./scripts/with-test-slot.sh pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run typecheck
./scripts/with-test-slot.sh pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run acceptance
```

The acceptance configuration selects only `acceptance/**/*.acceptance.ts`. The existing
`test` command continues to select `tests/**/*.spec.ts`. Each acceptance run creates
an independent `tmp/selected-tool-*` directory. It preserves output, exit codes,
the SQLite database, and the execution marker there. These files are local evidence.

## Scope

The model call and reply records are controlled inputs checked by public codecs.
This acceptance does not send an HTTP request or need an OpenRouter credential.
The test uses the public restricted Session holding bootstrap. It does not verify
formal Session creation, the Agent Loop, or the CLI product.

The trusted issuer is private to the test assembly. It checks the real login,
membership, Session holding, and requested operation. Test configuration values
are explicit inputs for this assembly, not product defaults. The acceptance does
not cover model execution, concurrent tail conflicts, recovery, or tool stopping
and background journeys. It does not grant product acceptance.
