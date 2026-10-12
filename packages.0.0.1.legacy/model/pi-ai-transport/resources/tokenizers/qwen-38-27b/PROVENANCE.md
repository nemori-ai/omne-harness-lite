# Qwen3.8-27B tokenizer source

Repository: `Qwen/Qwen3.8-27B`, commit `1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0`.
Files `LICENSE`, `chat_template.jinja`, and `tokenizer_config.json` were copied from the fixed-source research archive. `tokenizer.json` was independently downloaded from the same repository commit's public resolve URL on 2026-09-28; its SHA256 was `0997f410c57a1f4e53b09e4be8f4a172d90edd9564368fb0847030937229b9f3`, byte-identical to the Qwen3.8-2.4T-A95B file. The package keeps one copy under `../qwen-38-24t/tokenizer.json` and uses this model's own config.

| file | SHA256 |
| --- | --- |
| `LICENSE` | `bbedc3fda3305820b977265f01b8619d87570a6739de3a5582c3464840f1e57a` |
| `chat_template.jinja` | `c3cf9e34abf4f9e36c2d72165aa9c132d3e2a725b6c2586aaa3a8af9d7a81041` |
| `tokenizer_config.json` | `b11349aafa7cdc6a320767cf7ceb29ed82f7eda5d65e8e0819e76f0ce947bf27` |

The license file is Apache-2.0. The local meter ports the public Jinja template's text, tools and multi-turn path, then tokenizes that prompt as an estimate. Its scope excludes vision and unresolved OpenRouter `high`/`max`/`none` effort mapping. It does not claim equivalence to Alibaba's private prompt construction.
