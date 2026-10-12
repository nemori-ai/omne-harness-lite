# Qwen six-case conversion probe

This is a bounded **research** driver for the exact OpenRouter → `alibaba` routes. It does not certify an input meter or a public/service runtime. Only root runs paid requests under the campaign's original approved ledger. The six request files are byte-for-byte copies of `tmp/model-request-runtime/vendor-completion/qwen/cases-v2/` cases 08–11 and 38–39; `manifest.json` records the original manifest and request SHA-256 values. The driver sends the frozen non-streaming bytes as-is, never constructs request JSON from runtime handles, never retries, and never reads credentials or a ledger in `dry` mode.

From the integration checkout, inspect the six cases and full-context reservations without network or private inputs:

```sh
node packages/model/pi-ai-transport/tests/fixtures/qwen/probe-six/run.mjs dry \
  --snapshot tmp/model-request-runtime/vendor-completion-root/catalog-20260928-live.json
```

The pinned snapshot SHA-256 is `a486e9388c0825f584a300d848a0e3afbfd71759a6e2a444d1754843b8769496`. The dry result is six requests and `11.062965600000000000` USD total _reservation exposure_: four Max 0902 cases reserve `2.500096000000000000` each; two 27B images reserve `0.531290800000000000` each. Reservations use the exact endpoint's full 1,000,000-token context, its highest listed input/write price, and the frozen 16-token output cap. These amounts are not predicted actual charges. If the snapshot SHA, exact `alibaba` endpoint, price, context, wire SHA, or route controls change, the driver stops before any paid effect.

Root can run the paid tranche only after substituting the actual campaign-approved private paths and the exact existing ledger limits. Use a new empty output directory; it is created owner-only (`0700`). No value below is a credential or approval to spend.

```sh
node packages/model/pi-ai-transport/tests/fixtures/qwen/probe-six/run.mjs run \
  --snapshot tmp/model-request-runtime/vendor-completion-root/catalog-20260928-live.json \
  --ledger /absolute/path/to/existing-approved-ledger.json \
  --approved-ledger /absolute/path/to/existing-approved-ledger.json \
  --credential-file /absolute/path/to/existing-private-credential.env \
  --output tmp/model-request-runtime/vendor-completion-root/qwen-six-new-empty-output \
  --limit-usd EXISTING_LEDGER_LIMIT \
  --research-limit-usd EXISTING_LEDGER_RESEARCH_LIMIT \
  --timeout-ms 60000 \
  --max-response-bytes 4000000
```

For each case, the production ledger's `reserve` persists before the sole POST. The raw HTTP body, status and selected response headers are written `0600` and fsynced, then the containing directory is synced, before cost settlement or usage assertions. A failed/indeterminate external call is recorded and marked unknown; missing/invalid cost, missing prompt usage, non-200 status, cache hit, timeout, interrupted response, underestimated reservation or budget overrun stops the batch. No automatic retry, refund, ledger replacement, or stale-lock deletion occurs. A 16-token output cap can exhaust before useful usage: such a case is invalid and must not be treated as zero or retried automatically. The output contains synthetic fixture text only; the credential is never serialized or logged.

Successful output reports only **sample residuals** against the pinned Max text predictions `[17,17,26,32]` and the 27B image prompt-token difference, whose local source-grounded prediction is `1026−291=735`. An observed difference does not establish a full route algorithm, tokenizer identity, error bound, or service certification. `observations.json` records actual provider evidence only if echoed in the response; otherwise its `actualProviderTag` is null. Use the generation ID with [OpenRouter's generation metadata API](https://openrouter.ai/docs/api/api-reference/generations/get-generation) under root's separately controlled read to verify the actual provider before feeding sanitized observations to `evaluate-cases.mjs`. Never fill the provider tag merely from the requested route.

Offline checks:

```sh
node --test packages/model/pi-ai-transport/tests/qwen-six-probe.test.mjs
```

The later Max 0902 bridge is a **separate one-request experiment**. `bridge.mjs` changes only case 08's `messages[0].content` from the original string to an equal text-part array; all other request fields stay frozen. Its wire SHA-256 is `14fa3e510ce17797079c751c818c1e3cfca3300cc10073a8ce98fec87f7f8d78`. Run `bridge.mjs dry --snapshot SNAPSHOT` first, then `bridge.mjs run` with the same nine explicit private/budget options as `run.mjs run` above and a fresh empty output directory. The single-result comparison is against original case 08's observed 68 prompt tokens; it establishes only this one content-shape difference under non-streaming conditions.

The actual public planner also emits `stream:true` and `store:false`. `formal-invoke.mjs` constructs the project `PlanInput`, runs the real Qwen definition, meter, and `planRequest`, and rejects any serialized byte difference from `08-qwen3.8-max-0902-english-formal-plan.json` (SHA-256 `05980a21733b774d261ec231e71a94671d9372f07051ce2ee473cf5120f56c26`). The frozen formal wire differs from the bridge only in those two fields. Its `run` command uses `invokeModel` with the real HTTPS transport, limits the audited send boundary to one matching request, and owns the ledger reservation before the effect. It writes the full **domain outcome** and send-boundary hash owner-only and fsyncs the file and directory before settling actual cost. This public boundary does not expose the raw SSE body; `observed.json` says so. An unknown cost or incomplete outcome stops without replay. Only root operates it with the campaign-approved credential and ledger:

```sh
node packages/model/pi-ai-transport/tests/fixtures/qwen/probe-six/formal-invoke.mjs dry \
  --snapshot tmp/model-request-runtime/vendor-completion-root/catalog-20260928-live.json
node packages/model/pi-ai-transport/tests/fixtures/qwen/probe-six/formal-invoke.mjs run \
  --snapshot tmp/model-request-runtime/vendor-completion-root/catalog-20260928-live.json \
  --ledger /absolute/path/to/existing-approved-ledger.json \
  --approved-ledger /absolute/path/to/existing-approved-ledger.json \
  --credential-file /absolute/path/to/existing-private-credential.env \
  --output tmp/model-request-runtime/vendor-completion-root/qwen-formal-new-empty-output \
  --limit-usd EXISTING_LEDGER_LIMIT \
  --research-limit-usd EXISTING_LEDGER_RESEARCH_LIMIT
```

The full-context reservation remains `$2.500096000000000000`; it is exposure, not predicted actual cost. Local TLS verification is `node --test packages/model/pi-ai-transport/tests/qwen-formal-invoke.test.mjs`.

Root's controlled bridge reported 68 input tokens, matching original case 08's 68. The formal invocation also reported 68 upstream input tokens on the exact frozen planner wire, but its 16-token output cap was consumed entirely by reasoning and the outcome was `truncated_at_limit`. The formal probe's original complete-result oracle correctly did not write a pass file. The derived input-conversion result supports only this estimated meter's formal planner input shape, not a completed response or service certification.
