# Model invocation minimal demo

An interactive command-line example of a durable, streaming, multi-turn model conversation. It uses the real local account, organization standing, session ownership, current evaluation input, official model profile, encrypted credential replica, OpenRouter transport, and JSONL session log. The former model-request-acceptance assembly now lives in this example. Reusable capabilities remain in `packages/`.

The demo installs two official profiles, **`deepseek/deepseek-v4-pro-0813`** and **`deepseek/deepseek-v4.1-flash`**, both with the **`deepinfra/fp8`** provider and fallback disabled. Pro is only the first session's explicit selection. `/models` reads the current directory display list, `/model` shows the selected and effective route, and `/model <identifier>` durably changes the selected route for later requests. It does not reset the session or its history; a layer lock can make the effective route differ from the selected one. A restart reads the durable selection. Other published model definitions are not automatically available in this demo without a matching profile, adaptation, and input meter.

The model request stage installs a Cordis `modelTransport` service and one trusted contribution fiber per configured exact definition and input meter. The runtime acquires that service's fixed lease for each call; publishing another contribution does not change an existing call. Contribution retirement stops new acquisition of that version and waits for its leases, HTTPS readers, and callbacks to stop. Application close stops the runtime before disposing contributions and the transport service. A controlled HTTPS test exercises Pro and Flash contributions across an in-flight old call and verifies that an uninterpretable configuration produces `invalidInput` before HTTP or model anchors. This is a process-local hot-update slice; the caller still owns directory adoption and explicit old-version retirement.

Each turn accepts text input, no tools, no Run, `reasoningEffort: low`, and `maxOutputTokens: 16384`. The authenticated session binds the unified `createModelRuntime` service. The service opens and dispatches a call; its bounded, session-authorized observer delivers the stream to the terminal. The demo registers each call's host owner before sending and retains that owner through physical stop. The assembly also exposes authenticated recovery reconciliation, but the interactive CLI has no recovery command or automatic resend. The demo persists a completed reply and its model response in one durable batch before the next turn. Each request passes the complete validated message history, including prior reasoning and media blocks, to the invocation layer without a text-only whitelist. Visibility and model compatibility follow the shared contracts; the CLI currently accepts text input only. `/history` reads the actual session log. Restart with the same data path to authenticate again and resume the session; registration and source publication are not replayed.


Use `--max-output-tokens <positive-integer>` to change the per-response limit (default: 16,384). The selected model profile still enforces its maximum; the demo does not silently clamp an excessive value. This limit includes reasoning tokens counted in output usage. Restarting with the same `--data` and a different limit preserves the session history.
The current development format carries the complete project input limits and upstream limit facts in every call snapshot. Data created by an older incompatible development version is not automatically converted; use a new explicit `--data` directory for this version and retain any old directory unchanged.

Both token margin options are explicit, required deployment choices. This example uses `ceil(estimatedTokens * 1.1) + 256` against the project input cap. The pinned DeepSeek tokenizer estimates the final input; the margin is configurable and does not guarantee equality with upstream counting. Actual token usage and cost still come only from upstream responses. Programmatic callers supply the policy as the second argument to `openDemo(dataDirectory, tokenMargin, retirement, maxOutputTokens, credential?, testOptions?, observerBounds?)`. The deployment `modelRequest.transport.retirement` requires a positive `waitMilliseconds`, `force`, and a replaceable `schedule`; a timed-out wait keeps the owner and does not claim resource cleanup. The CLI sets `force=false` and a configurable 10,000 ms retirement wait via `--transport-retirement-wait-ms <positive-integer>`.

The observer defaults to a finite 256 events and 262,144 bytes; programmatic callers can configure both positive bounds. Delivery diagnostics and backpressure never substitute for persisted history or settlement.

## Run

Use the Node and pnpm versions declared at the repository root. From the repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
umask 077
export OPENROUTER_API_KEY='your actual OpenRouter key'
node examples/model-invocation-minimal-demo/dist/cli.js --data "$PWD/tmp/my-model-demo" --token-margin-multiplier 1.1 --token-margin-reserve 256
```

If your shell is already in `examples/model-invocation-minimal-demo`, run the built file relative to that directory instead:

```sh
node dist/cli.js --data ../../tmp/my-model-demo --token-margin-multiplier 1.1 --token-margin-reserve 256
```

The `--data` path must be a **new** path on first run. The demo creates it with owner-only permissions. Use the same path to resume after `/exit` or end-of-file. Alternatively, place the credential in an owner-only file and pass `--key-file /absolute/private/key`; never pass a key value as a command-line argument. The file must have mode 0600 and contain only raw key bytes, not `.env` syntax; one final newline is ignored. After successful publication into the encrypted replica, a normal restart can omit the environment variable and `--key-file`. A supplied key on restart is a replacement through the actual credential publication API.

```text
You> Say hello.
Assistant> Hello!
Saved. {"outcome":"complete", ...}
Cumulative: input 5, output 3, cache read 4, cache write 0 tokens; actual USD 0.0000117
You> /models
* deepseek/deepseek-v4-pro-0813 [official] legal
  deepseek/deepseek-v4.1-flash [official] legal
You> /model deepseek/deepseek-v4.1-flash
Selected: deepseek/deepseek-v4.1-flash
Effective: deepseek/deepseek-v4.1-flash (session, official)
You> What did I ask?
Assistant> You asked me to say hello.
Cumulative: input 1e1, output 6, cache read 8, cache write 0 tokens; actual USD 234e-7
You> /history
user: Say hello.
assistant: Hello!
user: What did I ask?
assistant: You asked me to say hello.
You> /exit
Closed. Start again with the same --data path to resume.
```

The numbers in the transcript are illustrative; the exact answer, token usage and USD cost come from the upstream response. Each submitted message can incur OpenRouter charges. `/models`, `/model`, `/history`, and `/help` do not send an HTTP model request or incur model-call charges. After each durably settled response, including a failed one, the terminal rereads this authenticated session's persisted model responses and prints cumulative input/output and cache tokens plus actual USD. A missing value is shown as `known + N unknown`, with an `incomplete` marker; it is never estimated or counted as zero. Restarting with the same data path restores the same total. A durable failed model response prints a generic failure message and exits nonzero after closing; upstream error text is not printed. There is no automatic retry or fallback. Unknown slash commands are rejected locally. Ctrl+C during a call requests **system stop** and waits for actual settlement and application close; it is not the durable user interruption operation. Refused requests, unknown commits, and incomplete close remain visible. Never reset data or automatically resend an unknown call.

The data directory contains SQLite state, JSONL session history, generated signing keys, the replica encryption key, and `demo-state.json` with a local demo account password. Keep the directory private; back it up together if you need the history. The OpenRouter key is held by the encrypted replica and is not saved as plaintext in demo metadata. Interrupted initial setup remains marked incomplete and is not silently replayed. This example exercises a no-Run subset of the runtime operations; it does not implement complete Session/Inbound/Agent Loop, all official models, general Run failure history, an interactive recovery command, or model certification.

The public root also exports `createAcceptanceApplication`, its configuration and result types, and fixed stage fiber names for development consumers. The assembly owns its Cordis context and lifecycle. Its `currentTime()` is a narrow read of its existing lease Clock for this example's message and invocation timestamps; an unavailable clock prevents a send. Its `AcceptanceHooks` and `developmentTransport` are trusted test controls, not tenant input. The authentication-only stage sends no model request.

Validate with `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run build`, `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run typecheck`, `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run test`, and `python3 examples/model-invocation-minimal-demo/tests/pty-check.py` from the repository root. Tests use a local controlled TLS endpoint and never a production credential. The service, selection, observer, and recovery mapping follows [RT9](../../.meta_harness/design/spec/capabilities/model-request-runtime/v9/contract.md), [D103](../../.meta_harness/design/record/decisions/model-runtime-host-observer-adoption/decision.md), and the [runtime realization](../../.meta_harness/design/realization/packages/model/model-request-runtime/README.md); durable response semantics follow [MR8](../../.meta_harness/design/spec/data/model-response/v8/contract.md).

The preceding unified-service assembly has [bounded real OpenRouter PTY evidence for three turns](../../.meta_harness/design/record/evidence/2026-09-28-tests-model-invocation-demo-service/README.md). This model-switch revision is verified against controlled local TLS and PTY; it has not been certified by a paid cross-model request.

Programmatic callers can use `startServiceCall(actor, session, { user, parameters, host, observer? })` with a complete judged `UserMessage`, including image blocks. The assembly appends that exact message before opening the call and lets the chosen model and transport check compatibility. A controlled TLS test exercises two actual Flash service turns with different PNGs, persistent JSONL history, and the full second-turn wire request. The interactive CLI still accepts text only; this API does not add attachment syntax, tool execution, or a Run.

Trusted deployments may supply `modelRequest.assetRegistry` as a borrowed `AssetRegistryService.lookup` port. Then `startServiceCall` accepts `tools: ModelToolName[]`, resolved by the runtime against that session's real registry; absent registry plus nonempty tools returns unavailable. An external tool-result writer can call `appendServiceToolResult(actor, session, { message, host })` with a judged `ToolMessage` after a complete model tool call has been persisted. The application checks current identity, host ownership, and pairing against the full durable prefix before one conditional append. It does not execute the tool or invent a Run. The owner of the borrowed registry must keep it available until application close; the CLI does not configure one. A controlled TLS test covers actual registry/manifest/evaluation-input fill, tool declaration, persisted assistant call and response, paired result, subsequent wire history, rejection paths, and close.
