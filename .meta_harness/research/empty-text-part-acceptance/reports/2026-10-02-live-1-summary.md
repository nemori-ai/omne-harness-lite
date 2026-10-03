# issue #50 empty-text probe

- started: 2026-10-02T16:59:56.802Z
- finished: 2026-10-02T17:01:57.396Z
- source: repo HEAD c731530f96c084f52066cf1503279305ead9dcec; network.mjs sha256 03c25c3598518b44; probe.mjs sha256 02f9ed4f54c7b936; node v24.21.0
- image: 32x32 solid PNG, sha256 0d9cc10556d669b8916990512b72f3a0cd3322afd0ec63c7a6ac993cb920b373, 99 bytes; max_tokens 64; usage.include true
- reservation cap 4.5 USD, allowance 2000 input tokens per request; reserved total 0.199013700000
- STOPPED EARLY: actual cost 0.000276800000 exceeded reservation 0.000275500000000000

| route | provider | A1 [img,""] | A2 ["",img] | B [img] | verdict |
| --- | --- | --- | --- | --- | --- |
| openai/gpt-6-astra | openai | ok $0.003280000000 | ok $0.003280000000 | ok $0.003290000000 | accepts empty text |
| openai/gpt-6-astra-pro | openai | ok $0.024180000000 | ok $0.025490000000 | ok $0.023410000000 | accepts empty text |
| openai/gpt-6-sol | openai | ok $0.000466000000 | ok $0.000656000000 | ok $0.000658000000 | accepts empty text |
| openai/gpt-6-sol-pro | openai | ok $0.004534000000 | ok $0.004446000000 | ok $0.004410000000 | accepts empty text |
| openai/gpt-6-luna | openai | ok $0.000032800000 | ok $0.000032800000 | ok $0.000032900000 | accepts empty text |
| openai/gpt-6-luna-pro | openai | ok $0.000257200000 | ok $0.000276800000 | skipped | incomplete |
| openai/gpt-5.6-sol | openai | skipped | skipped | skipped | incomplete |
| openai/gpt-5.6-sol-pro | openai | skipped | skipped | skipped | incomplete |
| openai/gpt-5.6-terra | openai | skipped | skipped | skipped | incomplete |
| openai/gpt-5.6-terra-pro | openai | skipped | skipped | skipped | incomplete |
| openai/gpt-5.6-luna | openai | skipped | skipped | skipped | incomplete |
| openai/gpt-5.6-luna-pro | openai | skipped | skipped | skipped | incomplete |
| anthropic/claude-opus-5.5 | anthropic | skipped | skipped | skipped | incomplete |
| anthropic/claude-opus-5 | anthropic | skipped | skipped | skipped | incomplete |
| anthropic/claude-sonnet-5 | anthropic | skipped | skipped | skipped | incomplete |
| anthropic/claude-fable-5.1 | anthropic | skipped | skipped | skipped | incomplete |
| deepseek/deepseek-v4.1-flash | deepinfra/fp8 | skipped | skipped | skipped | incomplete |
| google/gemini-3.8-flash | google-ai-studio | skipped | skipped | skipped | incomplete |
| google/gemini-3.7-flash | google-ai-studio | skipped | skipped | skipped | incomplete |
| x-ai/grok-4.7 | xai | skipped | skipped | skipped | incomplete |
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

- requests sent: 17 of 93; skipped: 76
- sum of usage.cost reported in streams: 0.098732500000 USD (requests with no reported cost: 0)
- credits before: total_credits 22000, total_usage 13340.756369759
- credits after:  total_credits 22000, total_usage 13340.841079759
- **true total spend (total_usage delta): 0.084710000000 USD**
- delta minus reported stream costs: -0.014022500000 USD (positive means spend not explained by streamed usage.cost, e.g. billed rejections; the credits endpoint may lag, so re-read it later before concluding)

## Rejected / anomalous requests (verbatim error text, first 500 chars)

none

## Skipped (76)

#18 openai/gpt-6-luna-pro/B, #19 openai/gpt-5.6-sol/A1, #20 openai/gpt-5.6-sol/A2, #21 openai/gpt-5.6-sol/B, #22 openai/gpt-5.6-sol-pro/A1, #23 openai/gpt-5.6-sol-pro/A2, #24 openai/gpt-5.6-sol-pro/B, #25 openai/gpt-5.6-terra/A1, #26 openai/gpt-5.6-terra/A2, #27 openai/gpt-5.6-terra/B, #28 openai/gpt-5.6-terra-pro/A1, #29 openai/gpt-5.6-terra-pro/A2, #30 openai/gpt-5.6-terra-pro/B, #31 openai/gpt-5.6-luna/A1, #32 openai/gpt-5.6-luna/A2, #33 openai/gpt-5.6-luna/B, #34 openai/gpt-5.6-luna-pro/A1, #35 openai/gpt-5.6-luna-pro/A2, #36 openai/gpt-5.6-luna-pro/B, #37 anthropic/claude-opus-5.5/A1, #38 anthropic/claude-opus-5.5/A2, #39 anthropic/claude-opus-5.5/B, #40 anthropic/claude-opus-5/A1, #41 anthropic/claude-opus-5/A2, #42 anthropic/claude-opus-5/B, #43 anthropic/claude-sonnet-5/A1, #44 anthropic/claude-sonnet-5/A2, #45 anthropic/claude-sonnet-5/B, #46 anthropic/claude-fable-5.1/A1, #47 anthropic/claude-fable-5.1/A2, #48 anthropic/claude-fable-5.1/B, #49 deepseek/deepseek-v4.1-flash/A1, #50 deepseek/deepseek-v4.1-flash/A2, #51 deepseek/deepseek-v4.1-flash/B, #52 google/gemini-3.8-flash/A1, #53 google/gemini-3.8-flash/A2, #54 google/gemini-3.8-flash/B, #55 google/gemini-3.7-flash/A1, #56 google/gemini-3.7-flash/A2, #57 google/gemini-3.7-flash/B, #58 x-ai/grok-4.7/A1, #59 x-ai/grok-4.7/A2, #60 x-ai/grok-4.7/B, #61 x-ai/grok-4.6/A1, #62 x-ai/grok-4.6/A2, #63 x-ai/grok-4.6/B, #64 qwen/qwen3.8-max-0902/A1, #65 qwen/qwen3.8-max-0902/A2, #66 qwen/qwen3.8-max-0902/B, #67 qwen/qwen3.8-max-prime/A1, #68 qwen/qwen3.8-max-prime/A2, #69 qwen/qwen3.8-max-prime/B, #70 qwen/qwen3.8-flash/A1, #71 qwen/qwen3.8-flash/A2, #72 qwen/qwen3.8-flash/B, #73 qwen/qwen3.8-27b/A1, #74 qwen/qwen3.8-27b/A2, #75 qwen/qwen3.8-27b/B, #76 qwen/qwen3.7-plus/A1, #77 qwen/qwen3.7-plus/A2, #78 qwen/qwen3.7-plus/B, #79 qwen/qwen3.7-flash/A1, #80 qwen/qwen3.7-flash/A2, #81 qwen/qwen3.7-flash/B, #82 moonshotai/kimi-k3/A1, #83 moonshotai/kimi-k3/A2, #84 moonshotai/kimi-k3/B, #85 moonshotai/kimi-k2.7-code/A1, #86 moonshotai/kimi-k2.7-code/A2, #87 moonshotai/kimi-k2.7-code/B, #88 z-ai/glm-5.3-flash/A1, #89 z-ai/glm-5.3-flash/A2, #90 z-ai/glm-5.3-flash/B, #91 z-ai/glm-5.3-flashx/A1, #92 z-ai/glm-5.3-flashx/A2, #93 z-ai/glm-5.3-flashx/B
