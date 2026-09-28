# Z.ai five-model route facts — 2026-09-28

Scope: read-only public OpenRouter metadata and previously retained warm-read evidence for the five confirmed IDs. No credential, model request, or paid call was used for this report. Public API responses below were read at 2026-09-28 09:31–09:37 UTC. They are mutable upstream data, not a versioned certification snapshot.

## Observed routes and capabilities

The retained [model-evidence summary](../../../design/record/evidence/2026-09-27-probe-model-request-runtime/model-evidence-summary.json) records positive cache reads on `z-ai/fp8` for GLM 5.3, Flash, FlashX and 5.2; GLM 5.3 Prime's positive reads are on `alibaba`. That summary identifies the request mode as `automatic_no_control` for the native Z.ai route and `explicit_control_sent` for Prime. It does **not** establish TTL expiry, whether a particular explicit TTL was honored, or the behavior of another provider offering the same model.

The public [Models API](https://openrouter.ai/api/v1/models) reports text input/output for GLM 5.3, Prime and 5.2, but text, image and video input for Flash and FlashX. Thus a text-only complete official profile for either Flash variant would discard known input modalities. The aggregate `top_provider` fields are not the selected route's limits.

The public Endpoints API reports these selected entries. Each selected entry had `max_prompt_tokens: null`, so an independently certified numeric input cap is absent in this source.

| Model | Endpoint API | Selected tag | Context | Max completion | Selected supported parameter names relevant here |
| --- | --- | --- | ---: | ---: | --- |
| `z-ai/glm-5.3` | [endpoints](https://openrouter.ai/api/v1/models/z-ai/glm-5.3/endpoints) | `z-ai/fp8` | 1,048,576 | 131,072 | `reasoning`, `reasoning_effort`, `max_tokens`, `temperature`, `top_p`, `tools`, `tool_choice` |
| `z-ai/glm-5.3-prime` | [endpoints](https://openrouter.ai/api/v1/models/z-ai/glm-5.3-prime/endpoints) | `alibaba` | 1,000,000 | 131,072 | preceding set plus `seed`, `stop`, `frequency_penalty`, `presence_penalty` |
| `z-ai/glm-5.3-flash` | [endpoints](https://openrouter.ai/api/v1/models/z-ai/glm-5.3-flash/endpoints) | `z-ai/fp8` | 1,048,576 | 131,072 | `reasoning`, `reasoning_effort`, `max_tokens`, `temperature`, `top_p`, `tools`, `tool_choice` |
| `z-ai/glm-5.3-flashx` | [endpoints](https://openrouter.ai/api/v1/models/z-ai/glm-5.3-flashx/endpoints) | `z-ai/fp8` | 1,048,576 | 131,072 | preceding set |
| `z-ai/glm-5.2` | [endpoints](https://openrouter.ai/api/v1/models/z-ai/glm-5.2/endpoints) | `z-ai/fp8` | 1,048,576 | 131,072 | preceding set |

The [GLM 5.3 model page](https://openrouter.ai/z-ai/glm-5.3) and [Prime model page](https://openrouter.ai/z-ai/glm-5.3-prime) state that reasoning is always on and name `low`, `high` and `max` effort. The [GLM 5.2 page](https://openrouter.ai/z-ai/glm-5.2) names `high` and `xhigh`; it says `xhigh` maps to max reasoning, but the accepted project's unified input vocabulary does not include `xhigh`. The [Flash model page](https://openrouter.ai/z-ai/glm-5.3-flash) and [FlashX model page](https://openrouter.ai/z-ai/glm-5.3-flashx) do not provide a similarly precise per-value effort list for the selected route. The API's `reasoning_effort` name alone does not supply one.

## Cache evidence boundary

The current [OpenRouter prompt-caching guide](https://openrouter.ai/docs/guides/best-practices/prompt-caching) says Z.AI caching is automatic and requires no configuration. It describes Alibaba's explicit per-block `cache_control` with five-minute cache writes, but its enumerated supported-model list omits GLM Prime. The retained paid observation nevertheless reports positive cache-read tokens for Prime while explicit control was sent. These statements have different scope: a request and read observation does not prove that Prime honors `ttl: "5m"` or that it retains the entry for five minutes. The guide omission is a missing confirmation, not proof the route rejects the control. An explicit caller-configured Prime TTL remains a route-specific certification gap.

The endpoints API currently returns `supports_implicit_caching: false` for each selected entry, including native Z.ai routes with retained automatic warm reads. That field and the earlier observed reads disagree as a summary of cache behavior; neither is silently substituted for the other. Neither source covers the new production adapter.

Known limits: no input-boundary probe, image/video constraint probe, tool/reasoning replay certification, streaming/real HTTPS certification, TTL expiry probe, or per-model public plus service paid certification was performed here. No claim is made that dropped optional parameter values are unsupported upstream: precise range or conditional behavior on the selected route was not established by this read.
