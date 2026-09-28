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
