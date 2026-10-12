# @omne-harness-lite/model-request-runtime-local

This package provides a physical execution pool, standalone model invocation, original execution records, and response content custody. The [Session provider](../../session/session-runtime-local/README.md) owns call creation, scheduling, history, recovery, and ACK coordination.

| Export | Responsibility |
| --- | --- |
| `createModelExecutionPool` | Track explicit physical executions and wait for actual stop. |
| `invokeModel` | Execute an explicit request through its transport and retain the invocation outcome. |
| `createOriginalIssueOwner`, `originalIssueMigrations` | Retain the original issue and consumption records in the supplied storage. |
| `createModelCallContentStore`, `modelCallContentMigrations` | Retain original content, publication uses, and cleanup obligations. |
| `createModelExecutionObligations` | Scan original call keys from issue and retention records in one bounded snapshot. |
| `createDiagnosticCollector` | Collect engineering diagnostics independently of business results. |
| `createDefaultRetryImplementation`, `DEFAULT_RETRY_BUILTIN` | Supply the explicit default retry implementation. |
| `modelDefaultRetry` from `./cordis` | Register that retry implementation through Cordis. |

Import shared types from [Core Model](../../core/model-request-runtime/README.md). This package does not export the Session fifteen-operation constructor, call containers, or recovery coordinator.

Applications select `createSessionModelRuntime` from the Session root entry and supply a shared pool's `execute`. Cordis assembly selects Session's `createSessionModelRuntimeLocal` and supplies the same physical executor and content-store factories.

The [provider specification](SPEC.md) defines record and content custody behavior. The [Session composition specification](../../session/session-runtime-local/model-runtime.md) defines history and business coordination.
