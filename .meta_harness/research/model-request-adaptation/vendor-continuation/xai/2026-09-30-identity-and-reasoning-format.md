# xAI 身份与推理格式的原件复核

2026-09-30 UTC，接续 [09-29 完整交付窄核](2026-09-29-closeout-evidence.md)的**补充**调查。对象仍仅为 OpenRouter 固定 `xai` 路由的 `x-ai/grok-4.6` 与 `x-ai/grok-4.7`。本轮只读六份 09-28 实际调用的领域结果、钉定源码与 OpenRouter/xAI 官方文档；没有发送请求、读取密钥、费用账本或原始 SSE。本文记录事实和推断界限，不作提供者映射采用。

## 观察

| 来源与版本 | 可复核观察 | 支持范围与限制 |
|---|---|---|
| [4.6 三份结果](2026-09-28-complete-prompt-calibration.md#源摘要与失效边界)、[4.7 三份结果](2026-09-28-grok47-complete-prompt-calibration.md#保留源摘要)；HUB `tmp/model-request-runtime/xai-46-text-20260928-1753/` 与 `tmp/model-request-runtime/xai47-fullprompt-20260928-1807/`，SHA-256 见两页 | 六份 `outcome.json` 的领域字段 `servingProvider` 均为 `xAI`，`upstreamModel` 分别等于对应 `x-ai/grok-4.6` / `x-ai/grok-4.7`；每份 `blocks[0].opaque.routeName` 也是对应模型。六份都有 `reasoning.encrypted`、`format: xai-responses-v1`，其中五份另有 `reasoning.summary` 同格式，一份只有 encrypted；未见 `reasoning.text` detail。 | 这是 definition 1 / `pi-ai:xai/mp4-1` 的**领域结果**，不是原始 SSE 帧；只能支持当时六次调用的保留结果。未由这些文件独立观察到 `frame.provider`、`frame.model` 的原始字节或当前 V5 实际返回。密文正文不在本页复制。 |
| 执行仓库 `b69f287d:packages/model/pi-ai-transport/src/stream.ts:199-211` 与当前 `a820d6c9` 同处 | 解析器把非空 `frame.model` 记入 `upstreamModel`，把非空 `frame.provider` 记入 `servingProvider`；若同一流后续值改变，标记不一致。 | 这是钉定源码的投影规则；不能反推六份旧请求必然运行了该精确源码，也不能代替旧/当前 raw SSE 留存。 |
| [OpenRouter Reasoning Tokens 官方 Markdown 快照](closeout-2026-09-30/openrouter-reasoning-tokens.txt)，[来源清单](closeout-2026-09-30/sources.json)，2026-09-30 取得 | 流式 detail 在 `choices[].delta.reasoning_details`，非流式在 `choices[].message.reasoning_details`；`xai-responses-v1` 与 `bedrock-xai-responses-v1` 是两个不同的 `format` 枚举。详情类型分别有 `reasoning.summary` 的 `summary`、`reasoning.encrypted` 的 `data`、`reasoning.text` 的 `text`。文档允许 `id: string|null` 与可选 `index`，并说流式 encrypted 内容可能是字面值 `[REDACTED]`；完整顺序由各 chunk 拼接。 | 官方文档的通用协议形状，不证明这两款经当前路由一定返回某个 detail 组合、未删节密文或特定原始身份。`[REDACTED]` 是被遮蔽内容，非完整可回放密文。 |
| [xAI 原生 reasoning 官方快照](closeout-2026-09-29/xai-reasoning.txt)，SHA-256 `5a3a7b7f89abffb9a966ae11d7f6161c7155da716ae23625057f470f42b52ab1` | 原生 Responses API 的 encrypted reasoning 可在下一次 `input` 原样回传；4.7 默认返回；原生 Chat Completions 没有 ciphertext 字段。 | 原生 xAI 语义不能证明 OpenRouter Chat Completions 转换或计量等式。 |
| [OpenRouter Chat Completion API 官方 Markdown](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request.md)，2026-09-30 03:48 UTC HTTP GET，191476 字节，SHA-256 `65f37089c098f34df4df11bbd5f638302a1c37a22fa75ed4bf54b18710a902dd` | 成功响应 schema 有顶层 `model`；路由 `openrouter_metadata` 需 `X-OpenRouter-Metadata: enabled` 才选择启用。当前 `a820d6c9:packages/model/pi-ai-transport/src/http.ts:156-164` 的发送头没有该 opt-in。 | 这份 schema **没有给出可作为本项目 `frame.provider` 的顶层 provider 保证**；这是文档覆盖缺口，不是「上游一定不发送 provider」的反例。完整 API 页未在本研究归档，可由 URL 与整页 SHA 检测后续变化。 |

## 推断边界与待观察字段

旧领域结果与钉定投影规则相符，使 `xAI` / 对应路由模型成为需要在当前原始帧中核对的**有限候选**；其拼写不是已获认证的 raw SSE 事实。OpenRouter 文档给出了 detail 的合法格式空间，却未把 `xai-responses-v1` 的 summary、encrypted、text 哪些组合绑定到两款当前 endpoint。旧六份实际领域结果只能限定其各自的 `summary + encrypted` 或 `encrypted` 形状，不能覆盖 plaintext `reasoning.text`、遮蔽值、工具续轮或当前 V5。

最小补证是两款各一条当前固定路由的原始流，保留请求/响应来源摘要与 SHA，逐帧记录 `model`/`provider` 是否存在及精确值、`reasoning_details` 每项的 `type/format/id/index` 与数据是否为 `[REDACTED]`，并把对应领域 `servingProvider/upstreamModel` 和 original binding 对齐。可脱敏保留密文字节 SHA 与长度，不能用展示名或本机模拟值填缺失的 raw 字段。该观察只验证来源形状；原样回放是否被上游接受、输入计量误差及缓存/费用仍需单独的实际调用证据。

上游文档内容、模型 endpoint、流处理源码或当前 binding 改变时重核。09-28 六个结果和 09-30 官方文档是不同版本与不同观察层，不构成当前生产身份采用或两入口完整交付。
