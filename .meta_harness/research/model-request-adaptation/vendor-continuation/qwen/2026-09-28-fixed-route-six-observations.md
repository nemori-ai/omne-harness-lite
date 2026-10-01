# Qwen fixed-route six-case observation (2026-09-28)

This note records the narrow input-meter inference from the six frozen Qwen synthetic requests. Root executed the only paid calls under the campaign's approved ledger. This spoke read the sanitized observations and raw receipts in the HUB at `tmp/model-request-runtime/vendor-completion-root/qwen-six-20260928-1805/`; it did not read that ledger, credentials, or send calls.

Evidence identities: frozen manifest SHA-256 `4e20995038642207af3fb3b9ab6e203aaddecb3ede173165c8956781fd9ad12b`, endpoint snapshot SHA-256 `a486e9388c0825f584a300d848a0e3afbfd71759a6e2a444d1754843b8769496`, observations SHA-256 `464c029984e310a928b3ae74a152e2d15726d6d456dfb154aca8d593d25822e`, and root's independent generation metadata summary SHA-256 `1bb421e92fc128045d1dfdb24907aba73e7c5ba9bafc1af2b79eb6b6ad880836`. Every receipt's recorded request SHA matched the committed frozen body. All six responses were HTTP 200 with positive `usage.prompt_tokens`; the response echoed provider `Alibaba`. Root's separate read-only generation lookup matched each response ID and returned `provider_name=Alibaba`, with upstream model `qwen/qwen3.8-max-20260902` for the four Max rows and `qwen/qwen3.8-27b-20260814` for both image rows. The original observations retain `actualProviderTag:null`, rather than retroactively filling a guessed tag.

| Exact request case | Public proxy tokens fixed before calls | Observed prompt tokens | Residual |
| --- | ---: | ---: | ---: |
| Max 0902 English (`08`, calibration) | 17 | 68 | +51 |
| Max 0902 Chinese (`09`, calibration) | 17 | 68 | +51 |
| Max 0902 code (`10`, calibration) | 26 | 77 | +51 |
| Max 0902 mixed text (`11`, untouched holdout) | 32 | 83 | +51 |
| 27B 544×544 PNG (`38`) | 351 | 347 | −4 |
| 27B 1024×1024 PNG (`39`) | 1086 | 1082 | −4 |

The Max candidate was specified before calls as the published single-user ChatML wrapper, pinned public Qwen3.8-2.4T tokenizer, and a *model-specific constant overhead only if three diverse fit cases agreed and the fourth held out matched*. The first three fixed an offset of 51; the fourth independently matched. This supports a versioned **estimated** `P(text)+51` for this exact Max 0902/Alibaba single-user plain-text subset with caller-supplied margin. It does not prove tokenizer identity, a full-domain error bound, arbitrary length generalization, tool/system/multi-turn behavior, explicit reasoning effort, images, video, or actual billing. The Alibaba FAQ's direct `Hi`/`你好` examples remain 11 tokenizer tokens for the wrapper; the observed 51 is a fixed-route OpenRouter observation, not part of that public template.

The two 27B images used identical user text and differ by exactly 735 prompt tokens, matching Alibaba's published unscaled-image formula `1026−291`. Both complete local estimates are four tokens above the actual route usage. Two points sharing one text are insufficient to assign that −4 to the image formula, system wrapper, tokenizer, or OpenRouter conversion. The 27B meter therefore remains unchanged and estimated; resized images, remote URLs and video remain unavailable pending independent source/fixtures and service observations.

Exact receipt SHA-256 values: `08` `7c99bdfb0c184bd55e6f7330a5898e6604d773ca99f6ec8958c535b88f9d5b2e`; `09` `80e1ff9a241ce4ebe32e2f998775707f8cf56244871cd8a07350405b29be4fde`; `10` `05be494b66021baf89df392fd2349461f37ca823ceffe8006e00abd7c02e203c`; `11` `96f9005e00d9ec74867657e0a4e52d6e03ab483c1f0951a18f159c613579222e`; `38` `1f3ec22b7677372b49257abbe5b8ee086e9832e2e459f216516de6f4cc1efef4`; `39` `e1eeef0ca15b64c0db3ef167d5f79d1c6c9002789676a2f3eb408c2475f4501b`. These hashes identify the actual private receipt files; this note does not reproduce the raw responses.
