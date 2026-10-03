# issue #50 empty-text probe

- started: 2026-10-02T17:06:03.581Z
- finished: 2026-10-02T17:09:23.154Z
- source: repo HEAD 73fbfd5ff8c2966ae797b2ed1805a4c3bd81677f; network.mjs sha256 03c25c3598518b44; probe.mjs sha256 02f9ed4f54c7b936; node v24.21.0
- image: 32x32 solid PNG, sha256 0d9cc10556d669b8916990512b72f3a0cd3322afd0ec63c7a6ac993cb920b373, 99 bytes; max_tokens 64; usage.include true
- reservation cap 4.0 USD, allowance 20000 input tokens per request; reserved total 0.929244505000

| route | provider | A1 [img,""] | A2 ["",img] | B [img] | verdict |
| --- | --- | --- | --- | --- | --- |
| x-ai/grok-4.7 | xai | ok $0.003536000000 | ok $0.005804000000 | ok $0.012506000000 | accepts empty text |
| x-ai/grok-4.6 | xai | ok $0.003036000000 | ok $0.005868000000 | ok $0.005286000000 | accepts empty text |
| qwen/qwen3.8-max-0902 | alibaba | ok $0.000562000000 | ok $0.000562000000 | ok $0.000562000000 | accepts empty text |
| qwen/qwen3.8-max-prime | alibaba | ok $0.001124000000 | ok $0.001124000000 | ok $0.001124000000 | accepts empty text |
| qwen/qwen3.8-flash | alibaba | ok $0.000049130000 | ok $0.000049130000 | ok $0.000049130000 | accepts empty text |
| qwen/qwen3.8-27b | alibaba | ok $0.001389750000 | ok $0.001634550000 | ok $0.001522350000 | accepts empty text |
| qwen/qwen3.7-plus | alibaba | ok $0.000106240000 | ok $0.000106240000 | ok $0.000106240000 | accepts empty text |
| qwen/qwen3.7-flash | alibaba | ok $0.000010730000 | ok $0.000010730000 | ok $0.000010730000 | accepts empty text |
| moonshotai/kimi-k3 | moonshotai/mxfp4 | HTTP 400 | HTTP 400 | ok $0.001251000000 | REJECTS empty text (A1+A2) |
| moonshotai/kimi-k2.7-code | moonshotai/int4 | HTTP 400 | HTTP 400 | ok $0.000270250000 | REJECTS empty text (A1+A2) |
| z-ai/glm-5.3-flash | z-ai/fp8 | HTTP 400 | HTTP 400 | ok $0.000036500000 | REJECTS empty text (A1+A2) |
| z-ai/glm-5.3-flashx | z-ai/fp8 | ok $0.000091100000 | ok $0.000091100000 | ok $0.000091100000 | accepts empty text |

## Spend

- requests sent: 36 of 36; skipped: 0
- sum of usage.cost reported in streams: 0.047970000000 USD (requests with no reported cost: 6)
- credits before: total_credits 22000, total_usage 13340.940426359
- credits after:  total_credits 22000, total_usage 13340.986543849
- **true total spend (total_usage delta): 0.046117490000 USD**
- delta minus reported stream costs: -0.001852510000 USD (positive means spend not explained by streamed usage.cost, e.g. billed rejections; the credits endpoint may lag, so re-read it later before concluding)

## Rejected / anomalous requests (verbatim error text, first 500 chars)

- #25 moonshotai/kimi-k3/A1 (http_error 400, cost unreported): {"error":{"message":"Provider returned error","code":400,"metadata":{"raw":"{\"error\":{\"message\":\"Invalid request: text content is empty\",\"type\":\"invalid_request_error\"}}","provider_name":"Moonshot AI","is_byok":false}},"user_id":"org_…（已抹）"}
- #26 moonshotai/kimi-k3/A2 (http_error 400, cost unreported): {"error":{"message":"Provider returned error","code":400,"metadata":{"raw":"{\"error\":{\"message\":\"Invalid request: text content is empty\",\"type\":\"invalid_request_error\"}}","provider_name":"Moonshot AI","is_byok":false}},"user_id":"org_…（已抹）"}
- #28 moonshotai/kimi-k2.7-code/A1 (http_error 400, cost unreported): {"error":{"message":"Provider returned error","code":400,"metadata":{"raw":"{\"error\":{\"message\":\"Invalid request: text content is empty\",\"type\":\"invalid_request_error\"}}","provider_name":"Moonshot AI","is_byok":false}},"user_id":"org_…（已抹）"}
- #29 moonshotai/kimi-k2.7-code/A2 (http_error 400, cost unreported): {"error":{"message":"Provider returned error","code":400,"metadata":{"raw":"{\"error\":{\"message\":\"Invalid request: text content is empty\",\"type\":\"invalid_request_error\"}}","provider_name":"Moonshot AI","is_byok":false}},"user_id":"org_…（已抹）"}
- #31 z-ai/glm-5.3-flash/A1 (http_error 400, cost unreported): {"error":{"message":"Provider returned error","code":400,"metadata":{"raw":"{\"error\":{\"code\":\"1210\",\"message\":\"Invalid API parameter, please check the documentation.\"}}","provider_name":"Z.AI","is_byok":false,"provider_error_code":"1210"}},"user_id":"org_…（已抹）"}
- #32 z-ai/glm-5.3-flash/A2 (http_error 400, cost unreported): {"error":{"message":"Provider returned error","code":400,"metadata":{"raw":"{\"error\":{\"code\":\"1210\",\"message\":\"Invalid API parameter, please check the documentation.\"}}","provider_name":"Z.AI","is_byok":false,"provider_error_code":"1210"}},"user_id":"org_…（已抹）"}
