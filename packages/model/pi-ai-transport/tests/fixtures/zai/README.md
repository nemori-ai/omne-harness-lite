# Z.AI reasoning and missing-meter diagnostic probe

This fixture offers eight bounded **research** sends for the approved paid-request owner. It is not public/service certification and does not change a production input meter. The final-wire history and meter rejection before sending are already covered by `tests/zai-reasoning-history.spec.ts`; this probe measures selected-route behavior that local TLS cannot reveal.

From the execution-repository root, first run the no-credential checks:

```sh
node --test packages/model/pi-ai-transport/tests/fixtures/zai/reasoning-mapping-probe.check.mjs
node packages/model/pi-ai-transport/tests/fixtures/zai/reasoning-mapping-probe.mjs \
  --snapshot /absolute/path/to/current-public-catalog.json --dry-run true
```

The root-owned paid runner alone may execute the following after rechecking its original budget/ledger and current exact endpoint catalog. The snapshot must contain `endpointSources[model].raw` from the public exact-endpoints response for all three models; a `cards[].endpoints[].contextLength` summary alone is insufficient. The probe reads each selected endpoint's original `context_length` before accessing a credential or ledger, and refuses absent, malformed or unsafe limits. Reservation prices the full selected context as possible input tokens plus the fixed 64 output tokens; JSON request bytes are not used as a model token bound. It must supply its existing approved ledger and a real owner-only output directory; no replacement ledger or credential environment fallback is provided.

```sh
node packages/model/pi-ai-transport/tests/fixtures/zai/reasoning-mapping-probe.mjs \
  --snapshot /absolute/path/to/current-public-catalog.json \
  --credential-file /absolute/path/to/owner-only-key-file \
  --ledger /absolute/path/to/original-ledger.json \
  --approved-ledger /absolute/path/to/original-ledger.json \
  --output /absolute/path/to/owner-only-evidence-directory
```

The fixed order is GLM-5.3 seed/control/plain/details, Prime control/long, FlashX control/long: at most eight calls total, one per case, no retry or redirect. The seed is a real selected-route response. Follow-ups replay its full assistant content and, where available, its actual plain reasoning or complete ordered details. A repeated streaming detail index is not guessed into a final value; the details case is skipped and recorded. If the seed has no reasoning, all three GLM-5.3 follow-ups are skipped. This makes the paid path an authentic-history probe; dry-run hashes use a visibly synthetic preview only. Prime/FlashX use identical synthetic assistant tool-call/result history in both cases and change only final user text length. The script writes each response and request to a private file before settling actual cost. Numeric cost lexemes, including scientific notation, are expanded losslessly for the ledger; raw and expanded values are both recorded. Missing or unrepresentable cost leaves the request unresolved and stops. A provider mismatch or incomplete stream also stops further sends. The output directory must be empty before the first paid send.

Review `summary.json` and all raw files together. A positive `prompt_tokens` delta for GLM-5.3 is evidence that the selected route charged more for the changed history. A zero delta is compatible with clearing or ignoring it. Neither is proof of the exact `reasoning_content` mapping or `clear_thinking` policy; also compare reported provider, cache-read tokens, errors, skipped cases and request hashes. Prime/FlashX two-point deltas are feasibility observations, not tokenizer identity or a production estimator. Historical opaque detail replay is covered only if the real seed supplies complete details; GLM-5.2, GLM-5.3-Flash and public/service paths remain separate gates.

## Observed five requests and independent commercial holdout

The root owner executed five of the eight allowed requests on 2026-09-28. The authentic GLM-5.3 seed returned no reasoning field or reasoning tokens, so all three history comparisons were skipped; `high` was sent but its causal effect cannot be inferred. Prime and FlashX each reported 210 input tokens for control and 883 for long. No production meter changed.

The separate [four-case holdout](commercial-holdout-probe.mjs) tests an independently chosen Chinese/tool/JSON/emoji history. It does **not** rerun the first five requests. Within each provider pair only the final user text changes. The current public-template candidate and its first-pair fitted offset can be inspected offline, without a credential or network:

```sh
node --experimental-strip-types packages/model/pi-ai-transport/tests/fixtures/zai/commercial-candidate-check.mjs \
  --fit /absolute/path/to/owner-private-first-run-directory
node --experimental-strip-types --test \
  packages/model/pi-ai-transport/tests/fixtures/zai/commercial-holdout-probe.check.mjs
node packages/model/pi-ai-transport/tests/fixtures/zai/commercial-holdout-probe.mjs \
  --snapshot /absolute/path/to/current-public-catalog.json --dry-run true
```

The fit command verifies each original request hash and prints observed tokens, public-template tokens, residual, provider, cache count, and raw-file hash. On the five-request evidence, both commercial pairs have public-template counts 211/884 and residual -1. The holdout candidate is preregistered at 242/562 per provider; applying the fitted -1 predicts 241/561. These numbers are diagnostic hypotheses, not an installed tokenizer alias or bound.

The root paid owner may run at most four **new** requests, one per holdout case, after separately approving their cost under the same original ledger and refreshing the exact public endpoint snapshot. This fixture has the same real-context reservation, one-send/no-retry, private raw-before-settle and unresolved-outcome rules as the first probe. Use a new empty private output directory:

```sh
node packages/model/pi-ai-transport/tests/fixtures/zai/commercial-holdout-probe.mjs \
  --snapshot /absolute/path/to/current-public-catalog.json \
  --credential-file /absolute/path/to/owner-only-key-file \
  --ledger /absolute/path/to/original-ledger.json \
  --approved-ledger /absolute/path/to/original-ledger.json \
  --output /absolute/path/to/new-owner-only-holdout-directory
node --experimental-strip-types packages/model/pi-ai-transport/tests/fixtures/zai/commercial-candidate-check.mjs \
  --fit /absolute/path/to/owner-private-first-run-directory \
  --holdout /absolute/path/to/new-owner-only-holdout-directory
```

Compare each model's `errorAfterFit` at both held-out points and the held-out within-pair delta, along with provider, cache and completion facts. A mismatch falsifies this fitted candidate for that selected route. Agreement is limited to the sampled text/tool wire subset and does not establish a global estimation envelope, reasoning-history mapping or media support. The script itself reports `diagnostic_only_no_meter_binding`.
