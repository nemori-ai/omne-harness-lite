# Moonshot fixed-route media and opaque calibration candidate, 2026-09-28

This investigation covers `moonshotai/kimi-k3` at `moonshotai/mxfp4` and `moonshotai/kimi-k2.7-code` at `moonshotai/int4`. No request to either route was sent in this investigation.

## First-party image reference

The pinned K3 and K2.7 Code model repositories contain a `media_utils.py` `navit_resize_image` function. Their model-specific `preprocessor_config.json` values use patch size 14, merge kernel 2, side limit 512, and in-patch limits 65,536 (K3) or 16,384 (K2.7 Code). The corresponding vision processors call that function and expose `num_tokens`; K3 additionally renders `image {width}x{height}` in its media prompt, while the K2.7 Jinja template renders `image`. The pinned URLs and full SHA-256 digests for those sources are in `tokenizers/moonshot/provenance.json`.

This calculation concerns the published local processors. It does not establish OpenRouter's image conversion, use of these precise weights, or equality with billed prompt tokens. The pinned K3 encoder treats media as separately supplied `image_prompts`; the K2.7 Jinja template contains an image marker but does not itself count vision patches. Neither source explains OpenRouter's opaque `reasoning_details` replay representation. The inspected local K3 processor only extracts user image parts, and the selected OpenRouter K3 video's frame sampling and prompt representation remain unobserved.

## Bounded real-route experiment prepared for the sole ledger owner

`node packages/model/pi-ai-transport/tests/fixtures/moonshot/calibration.mjs emit OUTPUT.json` emits exactly eight explicit request bodies and does not send them. For each fixed route: a text/tool/multi-turn baseline; an otherwise identical 544×544 inline image; an otherwise identical 1024×1024 image holdout; and a full-history holdout with the 544×544 image in an earlier user turn, an assistant turn, and a 1×1 image in the final turn. The PNGs are checked-in public fixtures. This gives a bounded way to distinguish the reference patch estimate from actual fixed-route usage if executed later under separate authorization. No paid attempt, credentials or ledger was used here.

`node .../calibration.mjs evaluate ROWS.json` accepts eight externally observed rows `{id,model,provider,promptTokens,costUsd,cacheReadTokens?}`. It fits only the baseline→544 image delta and reports residuals on the untouched 1024 and history cases. Its output is a comparison of observations, not a token bound or model certification. Without actual settled responses it has no upstream result; an internal dummy-row self-check only established that the evaluator runs.

Opaque `reasoning_details` has no identified model-token or OpenRouter replay projection in the pinned K3 encoder or K2.7 Jinja template. The script's `opaque ACTUAL-FIRST-RESPONSE.json OUTPUT.json` mode requires a real same-route request and response sample `{model,provider,requestBody,responseText,reasoningDetails}` and emits an explicit second-turn replay case. It retains the supplied first request history and opaque value rather than inventing either. A future same-route replay compared with an otherwise identical omission control could determine whether the selected route accepts the details and whether usage changes. It would not, by itself, reveal private encoding or a universal multiplier. This investigation has no such actual response sample.

## Observation limits

Offline reference vectors cover 1×1, 544×544 and 2048×2048 dimensions for both pinned configurations. The package test exercises complete prior/current image history through production `planRequest` and local TLS; the captured wire equals the fixed plan in this environment. This does not observe the selected OpenRouter routes, their billing, cache retention, opaque replay, or service-level durable composition.

资源归位附注（2026-10-06）：本页记录的包内 tokenizer 资源现位于 `packages/model/pi-ai-transport/resources/tokenizers/`。原输入字节、散列、上游出处和历史检出坐标保持；这是物理路径迁移，不修订本页研究结论。
