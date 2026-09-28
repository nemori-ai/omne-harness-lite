# Z.AI reasoning and missing-meter diagnostic probe

This fixture offers eight bounded **research** sends for the approved paid-request owner. It is not public/service certification and does not change a production input meter. The final-wire history and meter rejection before sending are already covered by `tests/zai-reasoning-history.spec.ts`; this probe measures selected-route behavior that local TLS cannot reveal.

From the execution-repository root, first run the no-credential checks:

```sh
node --test packages/model/pi-ai-transport/tests/fixtures/zai/reasoning-mapping-probe.check.mjs
node packages/model/pi-ai-transport/tests/fixtures/zai/reasoning-mapping-probe.mjs \
  --snapshot /absolute/path/to/current-public-catalog.json --dry-run true
```

The root-owned paid runner alone may execute the following after rechecking its original budget/ledger and current exact endpoint catalog. It must supply its existing approved ledger and a real owner-only output directory; no replacement ledger or credential environment fallback is provided.

```sh
node packages/model/pi-ai-transport/tests/fixtures/zai/reasoning-mapping-probe.mjs \
  --snapshot /absolute/path/to/current-public-catalog.json \
  --credential-file /absolute/path/to/owner-only-key-file \
  --ledger /absolute/path/to/original-ledger.json \
  --approved-ledger /absolute/path/to/original-ledger.json \
  --output /absolute/path/to/owner-only-evidence-directory
```

The fixed order is GLM-5.3 control/plain/details/inline, Prime control/long, FlashX control/long: at most eight calls total, one per case, no retry or redirect. Each request fixes the exact provider and carries complete assistant tool-call/result history. For GLM-5.3, only the historical reasoning representation changes across the four cases; plain and ordered details carry the same text. Prime/FlashX each change only final user text length. The script writes each response and request to a private file before settling actual cost; if cost is unknown, it leaves the request unresolved and stops. A provider mismatch or incomplete stream also stops further sends. Run in a fresh output directory to avoid file collisions.

Review `summary.json` and all raw files together. A positive `prompt_tokens` delta for GLM-5.3 is evidence that the selected route charged more for the changed history. A zero delta is compatible with clearing or ignoring it. Neither is proof of the exact `reasoning_content` mapping or `clear_thinking` policy; also compare reported provider, cache-read tokens, errors and request hashes. Prime/FlashX two-point deltas are feasibility observations, not tokenizer identity or a production estimator. Historical opaque details, GLM-5.2, GLM-5.3-Flash and public/service paths remain separate gates. See the [source check](../../../../../../.meta_harness/research/model-request-adaptation/vendor-continuation/zai/2026-09-28-reasoning-and-commercial-meter.md).
