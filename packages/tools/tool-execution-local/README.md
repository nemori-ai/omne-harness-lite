# Local Tool Runtime

The root exports `createToolInvoker`, `createToolImplementationRegistry`, `createToolRuntimeRegistry`, and `createToolRuntime`. Public operation and construction types belong to [core/tool-execution-runtime](../../core/tool-execution-runtime/src/index.ts). Root factories do not import Cordis.

`createToolRuntime(config, dependencies)` returns an instance with `operations`, `ready`, `idle()`, and `close()`. Await `ready` before registering its operations. The factory uses the actual shared log generation, complete action history, runtime context, result storage, and immutable runner-chain reader. Its bootstrap receives the application's private recovery authority.

`./cordis` exports `runtimeRegistry`, `implementationRegistry`, and `toolExecutionLocal(bootstrap)`. The last export constructs a plugin with the private recovery token. Its JSON configuration contains `resultStorage`, `frameQueueBytes`, and `tailRetry` (`attempts`, `minDelayMs`, `maxDelayMs`). Live dependencies and authority tokens are not configuration. The plugin registers the runtime only after startup recovery. Its disposer withdraws registration and awaits execution cleanup. It does not close the application's physical log or sibling providers.

The managed exports are `managedRuntimeRegistry`, `managedImplementationRegistry`, and `managedToolExecutionLocal`. They use the shared assembly lifetime and data-only tree declarations. The execution binding obtains its recovery token through `ToolRuntimeStartupService`. It retains the original close control before waiting for recovery. Unconfirmed close stays pending, and the application explicitly retries that same instance. See [LP-6](SPEC.md) and the definition package's TE-24/TE-25.

The current delivery runs pure tool functions and records successful context reads before exposing their values. Observation release does not stop execution. A result writer binds before author entry, so later business revocation does not discard an existing receipt. Business queries still require current authorization. Cold recovery ends queued, running, or waiting records without re-entering the author function. It retains unknown cost and frame evidence and refuses readiness while resource cleanup is unconfirmed.

Environment acquisition, external service resolution, declared settings, interactive wait, and accepted cost reports require later implementation increments. Their unavailable paths do not substitute declaration defaults or report successful reception. The application delivery owner continues the durable A/B/C protocol; this package does not declare a result delivered when the author function returns.


## Persistent acceptance

The PF-006 S24 and S69 acceptance scenarios use the public entry of the model-invocation demo. They run separately from the provider tests. Build the demo and its dependencies before running acceptance:

```sh
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo... run build
pnpm --filter @omne-harness-lite/tool-execution-local run acceptance
```

Do not run the build concurrently with acceptance. The acceptance configuration refuses to start when the demo entry is absent. The affected-test reader rule selects this member when the demo inputs change; it does not build excluded example members. A scoped check must therefore complete the explicit demo build first.

The independent acceptance owner maintains `acceptance/*.acceptance.ts`. Those scenarios declare their product coverage and use public entries. Provider implementation work does not change their assertions. Network acceptance reads the local OpenRouter configuration without displaying credentials. A missing credential or a failed model request is not a passing result.
