# @omne-harness-lite/model-request-runtime-local

本包提供独立模型调用、原执行记录和响应内容保管。Session 的创建、调度、历史、恢复与 ACK 协调由 [Session 提供者](../../session/session-runtime-local/README_ZH.md)实现。

| Export | Responsibility |
| --- | --- |
| `invokeModel` | Execute an explicit request through its transport and retain the invocation outcome. |
| `createOriginalIssueOwner`, `originalIssueMigrations` | Retain the original issue and consumption records in the supplied storage. |
| `createModelCallContentStore`, `modelCallContentMigrations` | Retain original content, publication uses, and cleanup obligations. |
| `createModelExecutionObligations` | Scan original call keys from issue and retention records in one bounded snapshot. |
| `createDiagnosticCollector` | Collect engineering diagnostics independently of business results. |
| `createDefaultRetryImplementation`, `DEFAULT_RETRY_BUILTIN` | Supply the explicit default retry implementation. |
| `modelDefaultRetry` from `./cordis` | Register that retry implementation through Cordis. |

共享类型从 [Core Model](../../core/model-request-runtime/README.md)导入。
本包不导出 Session 的十五操作构造、调用容器或恢复协调器。
应用从 Session 根入口选择 `createSessionModelRuntime`，并借入本包的 `invokeModel`。
Cordis 装配使用 Session 的 `createSessionModelRuntimeLocal`，显式提供原物理调用函数与内容库工厂。

[提供者规格](SPEC.md)约束原执行记录和内容保管。[Session 编排规格](../../session/session-runtime-local/model-runtime.md)约束完整日志和业务协调。
