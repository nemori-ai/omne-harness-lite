# Model invocation minimal demo

An interactive command-line example of a durable, streaming, multi-turn model conversation. It uses the real local account, organization standing, session ownership, current evaluation input, official model profile, encrypted credential replica, OpenRouter transport, and JSONL session log. The former model-request-acceptance assembly now lives in this example. Reusable capabilities remain in `packages/`.

The demo explicitly selects **`deepseek/deepseek-v4-pro-0813`** and fixes its provider route to **`deepinfra/fp8`** with fallback disabled. Each turn uses text, no tools, no Run, `reasoningEffort: low`, and `maxOutputTokens: 1024`. The answer streams to the terminal. A completed reply and its model response settle in one durable batch before the next turn. `/history` reads the actual session log. Restart with the same data path to authenticate again and resume the session; registration, source publication and model selection are not replayed.

## Run

Use the Node and pnpm versions declared at the repository root. From the repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
umask 077
export OPENROUTER_API_KEY='your actual OpenRouter key'
node examples/model-invocation-minimal-demo/dist/cli.js --data "$PWD/tmp/my-model-demo"
```

The `--data` path must be a **new** path on first run. The demo creates it with owner-only permissions. Use the same path to resume after `/exit` or end-of-file. Alternatively, place the credential in an owner-only file and pass `--key-file /absolute/private/key`; never pass a key value as a command-line argument. The file must have mode 0600 and contain only raw key bytes, not `.env` syntax; one final newline is ignored. After successful publication into the encrypted replica, a normal restart can omit the environment variable and `--key-file`. A supplied key on restart is a replacement through the actual credential publication API.

```text
You> Say hello.
Assistant> Hello!
Saved. {"outcome":"complete", ...}
Cumulative: input 5, output 3, cache read 4, cache write 0 tokens; actual USD 0.0000117
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

The numbers in the transcript are illustrative; the exact answer, token usage and USD cost come from the upstream response. Each submitted message can incur OpenRouter charges. After each durably settled response, including a failed one, the terminal rereads this authenticated session's persisted model responses and prints cumulative input/output and cache tokens plus actual USD. A missing value is shown as `known + N unknown`, with an `incomplete` marker; it is never estimated or counted as zero. `/history` only reads messages and does not add to the total. Restarting with the same data path restores the same total. A durable failed model response prints a generic failure message and exits nonzero after closing; upstream error text is not printed. There is no automatic retry or fallback. `/help` lists commands. Ctrl+C during a call requests **system stop** and waits for actual settlement and application close; it is not the durable user interruption operation. Refused requests, unknown commits, and incomplete close remain visible. Never reset data or automatically resend an unknown call.

The data directory contains SQLite state, JSONL session history, generated signing keys, the replica encryption key, and `demo-state.json` with a local demo account password. Keep the directory private; back it up together if you need the history. The OpenRouter key is held by the encrypted replica and is not saved as plaintext in demo metadata. Interrupted initial setup remains marked incomplete and is not silently replayed. This example does not implement complete Session/Inbound/Agent Loop, all thirteen runtime operations, all official models, automatic recovery or model certification.

The public root also exports `createAcceptanceApplication`, its configuration and result types, and fixed stage fiber names for development consumers. The assembly owns its Cordis context and lifecycle. Its `currentTime()` is a narrow read of its existing lease Clock for this example's message and invocation timestamps; an unavailable clock prevents a send. Its `AcceptanceHooks` and `developmentTransport` are trusted test controls, not tenant input. The authentication-only stage sends no model request.

Validate with `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run build`, `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run typecheck`, and `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run test`. Tests use a local controlled TLS endpoint and never a production credential. Semantics are traced from [D076](../../.meta_harness/design/record/decisions/model-runtime-delivery-adoption/decision.md), [D092](../../.meta_harness/design/record/decisions/model-auth-bootstrap-adoption/decision.md), [RT5](../../.meta_harness/design/spec/capabilities/model-request-runtime/v5/contract.md), [MR5](../../.meta_harness/design/spec/data/model-response/v5/contract.md), and the [assembly realization](../../.meta_harness/design/realization/retired/model-request-acceptance/README.md).
