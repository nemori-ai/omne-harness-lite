# OpenAI GPT-6 Luna 可见历史输入计量复核（2026-09-28）

**观察。**在固定 `openai` provider、无 fallback、`low` reasoning effort 的 OpenRouter 路由上，三条冻结的完整可见历史请求均收到 HTTP 200、`stop` 终态，独立 generation GET 均标记 `OpenAI` 和精确版本 `openai/gpt-6-luna-20260922`。三条响应的 SSE 输入 token、费用与对应 generation GET 一致。此次取得的请求只覆盖可见文本、developer 提醒、工具声明与工具历史；不覆盖加密 reasoning、媒体、其他 effort 或其他路由。

| 冻结请求 | 冻结 wire SHA-256 | 既定估算 | 上游输入 | 差值（估算－上游） |
| --- | --- | ---: | ---: | ---: |
| `luna-plain-history` | `d0183e36b8f1dd0063d258456490e4b59e17b197a13b67599a332fa4caadf859` | 126 | 70 | +56 |
| `luna-paired-tool-history` | `e27e340f553a0a9d1e3e7c39d7d821d9394ee45455e0465a3c22c140099ef537` | 302 | 178 | +124 |
| `luna-tool-reminder-holdout` | `201876451581384ed0e1f22fa3856b45934f8af70cac523e0a5c207c22b1f9b5` | 410 | 236 | +174 |

**取得与复核。**源包是主检出 ignored `tmp/model-request-runtime/openai-history-analysis/next-cases.json`（SHA-256 `532259bd58c591b0a337203f5b9222623a4150cc0bacb87b1bdd0467c220dbc9`）。执行者在 HUB 保存 `tmp/model-request-runtime/luna-history-{plain-1942,tools-1944,holdout-1943}/` 下各自的 `preflight.json`、`outcome.json`、`generation.json`，以及 `tmp/model-request-runtime/openai-history-next/generation-verification.json`。本轮独立只读复核逐条比对 preflight 请求 SHA、冻结 wire SHA、请求 ID、SSE 响应 ID 和独立 GET generation ID、provider、模型版本、usage 与费用；复核摘要及每份收据 SHA-256 保存在 OpenAI history spoke ignored `tmp/model-request-runtime/openai-history-next/source-check.json`。未重新发送请求，未读取凭据或账本。

**局限。**这三例的估算均高于上游实际输入，并不证明估算总是高估，也不提供误差上界；OpenRouter 与 OpenAI 的内部消息 framing 未公开。冻结的另外三条 Sol 请求只经过本地探针，不能从 Luna 的结果推出 Sol 可见历史已获实机验证。费用是三次请求的实际记录，不代表其他输出形态的费用。更长、不同工具结构、媒体与 opaque 历史仍未被这些观察覆盖。
