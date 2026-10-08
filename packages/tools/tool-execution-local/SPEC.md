# Local provider constraints

The behavioral authority is [core/tool-execution-runtime/SPEC.md](../../core/tool-execution-runtime/SPEC.md). This file specifies provider policies that public types cannot enforce.

LP-1 Configuration is a strict ordinary JSON object. `frameQueueBytes` is a nonnegative safe integer. Retry attempts are a positive safe integer. Delay bounds are finite nonnegative milliseconds, with the minimum no greater than the maximum. `resultStorage` identifies the actual injected result store. Unknown configuration fields fail construction.

LP-2 The frame budget bounds the cumulative UTF-8 JSON bytes of accepted author frames for one execution. Capacity rejection preserves the previous assembly and records a quota trim. A zero budget accepts no author frames. It does not suppress the terminal result or treat a stream trim as author failure.

LP-3 Tail conflicts trigger a complete recheck and configured capped exponential delay. A retry does not substitute a new admission proof, executor generation, or author result. Policy exhaustion retains any durable obligation and reports unavailability.

LP-4 Startup enumeration uses private maintenance authority. Unreadable or invalid sessions and unconfirmed resource cleanup prevent readiness. Close retains a failed cleanup obligation for retry; it does not release the journal borrow on a failed recovery attempt. Existing delivery obligations remain in the common log for the application delivery owner.

LP-5 Unsupported execution dependencies fail before author entry. The provider cannot use dependency declaration defaults as resolved settings. backgroundThreshold is an upper caller waiting preference, not an execution dependency. Its declaration does not prevent execution or create a runtime timer. Interactive answers and cost reports cannot return successful reception until their durable protocol is implemented.

LP-6 The close adapter preserves the original runtime.ready Promise. Managed startup also requires successful control retention and current ownership. A retention failure rejects managed readiness without changing the root readiness result. The adapter close starts one original close attempt and remains pending after rejection. The host can observe the retained attempt and explicitly retry the same instance. Concurrent retries share one attempt. The adapter does not schedule retries or change the root retry policy. Successful close is permanent. It does not close shared dependencies or reopen admission.

The managed tool binding uses startAssemblyWork, which registers the outer work before resource creation. Its setup creates the original runtime and its safe work. It first gives that control to the row port, then gives the same reference to ToolRuntimeStartupService, before awaiting runtime.ready. These handoffs give two owners the same control. They are not repeated retention by startRetainedAssemblyWork. The outer close awaits the original safe work.close even after startup failure.

LP-7 The tool environment placement source uses the original public tool observer and CurrentEvaluationInputs. It releases that temporary observer after each read. It verifies the original tenant, session, CallId, live execution, selected asset, version, and tool body. It cannot replace that selection with a newer version or different body. A pure tool returns notApplicable without a permission input read. A missing or ended execution cannot grant placement.

LP-8 Environment permission comes from the original asset-evaluation algorithm and an explicit factoryPermission. The source requires one effective executionEnvironment value and a valid effective targetEnvironment. An empty, unknown, or multiple permission set rejects policyUnavailable. Invalid inputs reject invalidInput. Input IO failure rejects unavailable. A foreign input tenant rejects notAuthorized. Represented identity and evaluation fingerprints locate evidence; they do not grant authority. Each source instance has a new opaque generation.

LP-9 New facility operations re-read current input for the original call. The requested facility must belong to both the original and current requirements. A newly forbidden host effect rejects notAuthorized. A binding outside the original ownership rejects notAuthorized. Re-evaluation does not select or acquire a successor environment. Existing process observation and cleanup remain with their original owner.

LP-10 The Cordis placement plugins are static exports. Their configuration contains only name, factoryPermission, and an explicit unique or reference selection policy. There is no implicit first-candidate policy. The reference must belong to the complete matched set. Trusted root construction can supply a different selection function. The plugin does not accept that function as configuration. Source contribution and its pending calls follow the registering plugin's lifetime.

LP-11 原环境 lease 失效触发原终局路径，旧执行不获取替代环境。只有原 lease.release 确认 released 才放弃活体租约；pending 或异常仍由原执行 owner 持有并承担原释放责任。后续 close 只重试原 lease，失败不假报关闭完成。冷恢复仅维护原资源引用并异常收场，不重建作者栈或租约。单个工具 runtime 关闭不销毁共享环境 registry。

LP-12 Original resource plan, permission, adoption, and terminal decisions share the ToolJournal prefix. Adoption transfers an existing permitted resource only to the original adopted environment. Call release does not destroy that resource. Each later action needs its own plan and permission. Startup maintenance uses recoverOwned for original environment resources, records only matching original keys, and preserves partial failures as pending readiness. It does not replay actions or create substitute resource keys.
