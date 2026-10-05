# Local Tool Runtime

The root exports `createToolInvoker`, `createToolImplementationRegistry`, `createToolRuntimeRegistry`, and `createToolRuntime`. Public operation and construction types belong to [core/tool-execution-runtime](../../core/tool-execution-runtime/src/index.ts). Root factories do not import Cordis.

`createToolRuntime(config, dependencies)` returns an instance with `operations`, `ready`, `idle()`, and `close()`. Await `ready` before registering its operations. The factory uses the actual shared log generation, complete action history, runtime context, result storage, and immutable runner-chain reader. Its bootstrap receives the application's private recovery authority.

`./cordis` exports `runtimeRegistry`, `implementationRegistry`, and `toolExecutionLocal(bootstrap)`. The last export constructs a plugin with the private recovery token. Its JSON configuration contains `resultStorage`, `frameQueueBytes`, and `tailRetry` (`attempts`, `minDelayMs`, `maxDelayMs`). Live dependencies and authority tokens are not configuration. The plugin registers the runtime only after startup recovery. Its disposer withdraws registration and awaits execution cleanup. It does not close the application's physical log or sibling providers.

The current delivery runs pure tool functions and records successful context reads before exposing their values. Observation release does not stop execution. A result writer binds before author entry, so later business revocation does not discard an existing receipt. Business queries still require current authorization. Cold recovery ends queued, running, or waiting records without re-entering the author function. It retains unknown cost and frame evidence and refuses readiness while resource cleanup is unconfirmed.

Environment acquisition, external service resolution, declared settings, interactive wait, and accepted cost reports require later implementation increments. Their unavailable paths do not substitute declaration defaults or report successful reception. The application delivery owner continues the durable A/B/C protocol; this package does not declare a result delivered when the author function returns.
