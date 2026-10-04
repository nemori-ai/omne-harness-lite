# Qwen3.8 vision and effort source check (2026-09-28)

Scope: exact OpenRouter `qwen/qwen3.8-27b` → `alibaba` input meter, plus explicit-effort candidates for the two public Qwen leaves. These are implementation facts and open conversion questions, not a change to accepted MP4/RT9 semantics.

## Image subset

- [Alibaba visual-understanding guide](https://help.aliyun.com/en/model-studio/vision-model/) gives an image-token formula of `height × width / 1024 + 2` for the Qwen3.8 family.
- [Alibaba OpenAI-compatible Chat API](https://help.aliyun.com/en/model-studio/qwen-api-via-openai-chat-completions) lists Qwen3.8-27B image defaults `min_pixels=65536`, `max_pixels=2621440`, `vl_high_resolution_images=false`; it says images already inside that interval retain original dimensions.
- The pinned 27B public `chat_template.jinja` renders each user image as `<|vision_start|><|image_pad|><|vision_end|>`, three special tokens in the pinned tokenizer. The published image formula's `+2` represents the surrounding vision markers. For an image whose dimensions are already multiples of 32 and inside the unscaled interval, the meter adds `width × height / 1024 - 1` to the prompt's one image pad and two vision markers. The meter requires a canonical inline PNG data URL, verifies decoded PNG dimensions and its 4 MiB offered cap, and returns unavailable for remote URL, other formats, scaling, video, or unexplained metadata. A Python PNG-IHDR/`hashlib` golden independently records 544×544 → 291 image tokens and 1024×1024 → 1026; the local tokenization and final-plan/TLS checks cover the implementation projection.

The result remains **estimated**: OpenRouter's exact Alibaba media conversion and provider-side image handling are not publicly fixed by these sources. These cases establish a source-grounded subset, not an upper bound or service certification. The root-run bounded image probes can compare actual usage and expose route deltas. A mismatch requires revising this meter or making the subset unavailable before accepting it as a certified estimate.

## Effort mapping

The same [Alibaba API reference](https://help.aliyun.com/en/model-studio/qwen-api-via-openai-chat-completions) explicitly maps OpenAI `reasoning_effort` values `high` and `max` to Qwen3.8 `xhigh`, and `none` to `enable_thinking=false`; default is `xhigh`. [OpenRouter's own Qwen3.8 article](https://openrouter.ai/blog/insights/qwen-3-8/) reports accepted `reasoning.effort:high/max` on the exact public leaves, mandatory reasoning on 2.4T, and zero reasoning tokens with `none` on 27B through Alibaba. Neither source publishes the exact OpenRouter `reasoning`-object → Alibaba request field or prompt conversion. Equal prompt-token usage between omitted/high/max is consistent with xhigh but cannot alone prove the mapping. The bounded probe bundle identifies those cases; explicit-effort local metering stays unavailable pending route evidence or an owner-approved estimated projection.
