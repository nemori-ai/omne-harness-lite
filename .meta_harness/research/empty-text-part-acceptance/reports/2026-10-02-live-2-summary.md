# issue #50 empty-text probe

- started: 2026-10-02T17:02:23.645Z
- finished: 2026-10-02T17:05:44.658Z
- source: repo HEAD c731530f96c084f52066cf1503279305ead9dcec; network.mjs sha256 03c25c3598518b44; probe.mjs sha256 02f9ed4f54c7b936; node v24.21.0
- image: 32x32 solid PNG, sha256 0d9cc10556d669b8916990512b72f3a0cd3322afd0ec63c7a6ac993cb920b373, 99 bytes; max_tokens 64; usage.include true
- reservation cap 4.0 USD, allowance 6000 input tokens per request; reserved total 0.652705580000
- STOPPED EARLY: actual cost 0.010730000000 exceeded reservation 0.010585600000000000

| route | provider | A1 [img,""] | A2 ["",img] | B [img] | verdict |
| --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna-pro | openai | ok $0.000247800000 | ok $0.000252800000 | ok $0.000266900000 | accepts empty text |
| openai/gpt-5.6-sol | openai | ok $0.000486000000 | ok $0.000656000000 | ok $0.000658000000 | accepts empty text |
| openai/gpt-5.6-sol-pro | openai | ok $0.005886000000 | ok $0.005254000000 | ok $0.005772000000 | accepts empty text |
| openai/gpt-5.6-terra | openai | ok $0.000688000000 | ok $0.000388000000 | ok $0.000786000000 | accepts empty text |
| openai/gpt-5.6-terra-pro | openai | ok $0.005832000000 | ok $0.005616000000 | ok $0.007108000000 | accepts empty text |
| openai/gpt-5.6-luna | openai | ok $0.000078400000 | ok $0.000067600000 | ok $0.000078600000 | accepts empty text |
| openai/gpt-5.6-luna-pro | openai | ok $0.000668200000 | ok $0.000699800000 | ok $0.000666200000 | accepts empty text |
| anthropic/claude-opus-5.5 | anthropic | ok $0.001336000000 | ok $0.001336000000 | ok $0.001336000000 | accepts empty text |
| anthropic/claude-opus-5 | anthropic | ok $0.001660000000 | ok $0.001660000000 | ok $0.001660000000 | accepts empty text |
| anthropic/claude-sonnet-5 | anthropic | ok $0.000664000000 | ok $0.000664000000 | ok $0.000664000000 | accepts empty text |
| anthropic/claude-fable-5.1 | anthropic | ok $0.003340000000 | ok $0.003340000000 | ok $0.003340000000 | accepts empty text |
| deepseek/deepseek-v4.1-flash | deepinfra/fp8 | ok $0.000056980000 | ok $0.000056980000 | ok $0.000056840000 | accepts empty text |
| google/gemini-3.8-flash | google-ai-studio | ok $0.001042500000 | ok $0.001042500000 | ok $0.001042500000 | accepts empty text |
| google/gemini-3.7-flash | google-ai-studio | ok $0.001042500000 | ok $0.001042500000 | ok $0.001042500000 | accepts empty text |
| x-ai/grok-4.7 | xai | ok $0.005012000000 | ok $0.010730000000 | skipped | incomplete |
| x-ai/grok-4.6 | xai | skipped | skipped | skipped | incomplete |
| qwen/qwen3.8-max-0902 | alibaba | skipped | skipped | skipped | incomplete |
| qwen/qwen3.8-max-prime | alibaba | skipped | skipped | skipped | incomplete |
| qwen/qwen3.8-flash | alibaba | skipped | skipped | skipped | incomplete |
| qwen/qwen3.8-27b | alibaba | skipped | skipped | skipped | incomplete |
| qwen/qwen3.7-plus | alibaba | skipped | skipped | skipped | incomplete |
| qwen/qwen3.7-flash | alibaba | skipped | skipped | skipped | incomplete |
| moonshotai/kimi-k3 | moonshotai/mxfp4 | skipped | skipped | skipped | incomplete |
| moonshotai/kimi-k2.7-code | moonshotai/int4 | skipped | skipped | skipped | incomplete |
| z-ai/glm-5.3-flash | z-ai/fp8 | skipped | skipped | skipped | incomplete |
| z-ai/glm-5.3-flashx | z-ai/fp8 | skipped | skipped | skipped | incomplete |

## Spend

- requests sent: 44 of 78; skipped: 34
- sum of usage.cost reported in streams: 0.085324100000 USD (requests with no reported cost: 0)
- credits before: total_credits 22000, total_usage 13340.855102259
- credits after:  total_credits 22000, total_usage 13340.924684359
- **true total spend (total_usage delta): 0.069582100000 USD**
- delta minus reported stream costs: -0.015742000000 USD (positive means spend not explained by streamed usage.cost, e.g. billed rejections; the credits endpoint may lag, so re-read it later before concluding)

## Rejected / anomalous requests (verbatim error text, first 500 chars)

none

## Skipped (34)

#45 x-ai/grok-4.7/B, #46 x-ai/grok-4.6/A1, #47 x-ai/grok-4.6/A2, #48 x-ai/grok-4.6/B, #49 qwen/qwen3.8-max-0902/A1, #50 qwen/qwen3.8-max-0902/A2, #51 qwen/qwen3.8-max-0902/B, #52 qwen/qwen3.8-max-prime/A1, #53 qwen/qwen3.8-max-prime/A2, #54 qwen/qwen3.8-max-prime/B, #55 qwen/qwen3.8-flash/A1, #56 qwen/qwen3.8-flash/A2, #57 qwen/qwen3.8-flash/B, #58 qwen/qwen3.8-27b/A1, #59 qwen/qwen3.8-27b/A2, #60 qwen/qwen3.8-27b/B, #61 qwen/qwen3.7-plus/A1, #62 qwen/qwen3.7-plus/A2, #63 qwen/qwen3.7-plus/B, #64 qwen/qwen3.7-flash/A1, #65 qwen/qwen3.7-flash/A2, #66 qwen/qwen3.7-flash/B, #67 moonshotai/kimi-k3/A1, #68 moonshotai/kimi-k3/A2, #69 moonshotai/kimi-k3/B, #70 moonshotai/kimi-k2.7-code/A1, #71 moonshotai/kimi-k2.7-code/A2, #72 moonshotai/kimi-k2.7-code/B, #73 z-ai/glm-5.3-flash/A1, #74 z-ai/glm-5.3-flash/A2, #75 z-ai/glm-5.3-flash/B, #76 z-ai/glm-5.3-flashx/A1, #77 z-ai/glm-5.3-flashx/A2, #78 z-ai/glm-5.3-flashx/B
