# model-request-runtime

[中文](README_ZH.md)

Public model-request definitions, the complete fifteen-operation protocol, explicit host ports, codecs, and standalone selection, retry, history, and response functions. The root has no Cordis or concrete-provider dependency. `readSettlementPrefix` performs IO through the caller's explicit log and registration ports; framework independence does not mean absence of IO.

## Public entries and owners

| Entry                                  | Purpose                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [Root](src/index.ts)                   | `ModelRuntimeOperations`, operation inputs/results, failure consumption, ACK/reference and host/support ports, standalone functions |
| [./cordis](src/cordis.ts)              | Formal runtime, host-input and execution-support definitions, unique keys and Context augmentation                                  |
| [SPEC.md](SPEC.md)                     | Behavior beyond types: failure, concurrency, cancellation, recovery and function boundaries                                         |
| [ADR](adr/runtime-integration.md)      | Public, provider and host-resource responsibilities                                                                                 |
| [Verification](verification/README.md) | Rerunnable probes, effective model sources and assumptions                                                                          |

Definitions do not install services or certify authorization or physical writer termination. The [local provider](../../model/model-request-runtime-local/README.md) exports invocation, storage, queue, scheduling, coordination and physical-close factories. Related public contracts retain their own owners.

## Development

From the repository root:

```sh
pnpm --filter @omne-harness-lite/model-request-runtime run build
pnpm --filter @omne-harness-lite/model-request-runtime run typecheck
pnpm --filter @omne-harness-lite/model-request-runtime run test
```

Check source, declarations, runtime loading and external consumption of actual archives separately. Static checks and bounded tests do not establish complete lifecycle acceptance.

This package also owns explicit Session log envelopes, the OriginalIssue participant protocol, and original message relationship checks; see [SPEC](SPEC.md).
