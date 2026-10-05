# Local provider constraints

The behavioral authority is [core/tool-execution-runtime/SPEC.md](../../core/tool-execution-runtime/SPEC.md). This file specifies provider policies that public types cannot enforce.

LP-1 Configuration is a strict ordinary JSON object. `frameQueueBytes` is a nonnegative safe integer. Retry attempts are a positive safe integer. Delay bounds are finite nonnegative milliseconds, with the minimum no greater than the maximum. `resultStorage` identifies the actual injected result store. Unknown configuration fields fail construction.

LP-2 The frame budget bounds the cumulative UTF-8 JSON bytes of accepted author frames for one execution. Capacity rejection preserves the previous assembly and records a quota trim. A zero budget accepts no author frames. It does not suppress the terminal result or treat a stream trim as author failure.

LP-3 Tail conflicts trigger a complete recheck and configured capped exponential delay. A retry does not substitute a new admission proof, executor generation, or author result. Policy exhaustion retains any durable obligation and reports unavailability.

LP-4 Startup enumeration uses private maintenance authority. Unreadable or invalid sessions and unconfirmed resource cleanup prevent readiness. Close retains a failed cleanup obligation for retry; it does not release the journal borrow on a failed recovery attempt. Existing delivery obligations remain in the common log for the application delivery owner.

LP-5 Unsupported execution dependencies fail before author entry. They cannot use tool declaration defaults as resolved settings. Interactive answers and cost reports cannot return successful reception until their durable protocol is implemented.


LP-6 The close adapter preserves the original runtime.ready Promise. Managed startup also requires successful control retention and current ownership. A retention failure rejects managed readiness without changing the root readiness result. The adapter close starts one original close attempt and remains pending after rejection. The host can observe the retained attempt and explicitly retry the same instance. Concurrent retries share one attempt. The adapter does not schedule retries or change the root retry policy. Successful close is permanent. It does not close shared dependencies or reopen admission.

The managed tool binding uses startAssemblyWork, which registers the outer work before resource creation. Its setup creates the original runtime and its safe work. It first gives that control to the row port, then gives the same reference to ToolRuntimeStartupService, before awaiting runtime.ready. These handoffs give two owners the same control. They are not repeated retention by startRetainedAssemblyWork. The outer close awaits the original safe work.close even after startup failure.
