# Qwen3.8-2.4T-A95B tokenizer source

Repository: `Qwen/Qwen3.8-2.4T-A95B`, commit `207bd685a7e3696cfaff12ded7c6a7ea0f88c996`.
Files `LICENSE`, `chat_template.jinja`, and `tokenizer_config.json` were copied from the fixed-source research archive. `tokenizer.json` was downloaded from the same repository commit's public resolve URL on 2026-09-28. The downloaded tokenizer's SHA256 matched the upstream ETag and the independently downloaded Qwen3.8-27B tokenizer.

| file | SHA256 |
| --- | --- |
| `LICENSE` | `a136bc4137ef3d7a7a54963164a47270f73e497917728ea0f4407a0115db1290` |
| `chat_template.jinja` | `40ce34a5bcbc0231462740761215bc31a83882a8b3a4b6aa1c6e869b95945e4e` |
| `tokenizer_config.json` | `a4a70308585bebf75f240af83d569586dbcce75626ec324e2f4fe82a72153623` |
| `tokenizer.json` | `0997f410c57a1f4e53b09e4be8f4a172d90edd9564368fb0847030937229b9f3` |

The license file is the repository's Qwen3.8-Max License. The local meter ports the public Jinja template's text, tools and multi-turn path, then tokenizes that prompt as an estimate. Its scope excludes vision and unresolved OpenRouter `high`/`max` effort mapping. It does not claim equivalence to Alibaba's private prompt construction.
