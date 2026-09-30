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

## 2026-09-30 真实身份原件

上节要求的最小补证已取得。主调度在执行仓库 `1d372a663e4766f4e2fcb33776c8a47c9414322e`（两份 manifest 的 `sourceCommit`，`caseKind: family_three_turn`）对两款各发一次当前固定 `xai` 路由的真实第 1 轮，保留原始 SSE 与 family 收据；原件在**主调度私有付费证据目录**，本页不复制字节，只记摘要与从中提取的字面值。两份原始流都以 HTTP/1.1 200 响应头开头，`credentialOccurrencesRedacted` 为 0；每个 JSON 帧（不含 `[DONE]`）都带 `provider` 与 `model`，同一流内值不变。

| 叶 | 生成 id | 原始 SSE 字节数 / SHA-256 | 帧内 `provider` | 帧内 `model` | 领域 `servingProvider` / `upstreamModel` | opaque 子类型与形状 |
|---|---|---|---|---|---|---|
| `x-ai/grok-4.7` | `gen-1790759928-ziQ41FzufJSwqWS13mog` | 20380 / `064ed62291d8ad3000fbd6d502ff065f0cc7eafab652dcc2e2d5f48771987a68` | 47/47 帧 `"xAI"` | 47/47 帧 `"x-ai/grok-4.7"` | `xAI` / `x-ai/grok-4.7`（收据 SHA-256 `740cd2b0a7674cec66764a44812043c67f263af21127a7fbe675b043e7b8ee80`） | `reasoning.summary`（41 个流式片段，无 `id` 键、`index: 0`，归一化后 summary 170 UTF-8 字节）＋ `reasoning.encrypted`（单片段，非空 `rs_` 前缀字符串 id、`index: 1`，data 618 字节，非 `[REDACTED]`）；两者 `format: "xai-responses-v1"`；归一化 opaque 摘要 `f0cf1daf7df734be9f2d5ad4d36ebeb93d3e6259a6e3a82da20e9d9acc925cfc` |
| `x-ai/grok-4.6` | `gen-1790759941-akexGaVG7WbS2xgQmRwI` | 8933 / `3acf3f24363155f190987e200901e65b2e0cb3ee55cb523aed98e114adc19efb` | 13/13 帧 `"xAI"` | 13/13 帧 `"x-ai/grok-4.6"` | `xAI` / `x-ai/grok-4.6`（收据 SHA-256 `a87f25fe6b900a26971ba9e9a0a3eb1b4ed15f517e8c8913d7fefe50cce45b25`） | 同上两类、同 format；summary 7 个片段（140 字节），encrypted 单片段（data 2114 字节，非 `[REDACTED]`）；归一化 opaque 摘要 `ada22002f1778b568055d7e62805d30a49e502075be7fda00d939a07ba9eaf46` |

两流的帧序相同：summary 片段（同帧 `delta.reasoning` 携带同一段文字）→ 单个 encrypted 片段 → 3 个工具调用片段 → 一个带 `finish_reason: "tool_calls"`、`native_finish_reason: "completed"` 的帧 → 带 `usage`、`service_tier` 且再次带同一 `finish_reason` 的末帧 → `[DONE]`。两份收据的第 1 轮均为 `complete`、`requestInput: known`、`observedInput: from_usage`、`outputGroup: known`，块种类为 `thinking` 与 `tool_call`。

**与上节已记形状核对，无矛盾**：`provider`/`model` 的原始拼写与 09-28 六份领域结果的 `xAI`/对应路由模型逐字相同；detail 为 summary＋encrypted、同一 `xai-responses-v1`，`id` 缺席（summary）或为字符串（encrypted）、`index` 为非负整数，均在 OpenRouter 文档已记的合法空间内；两流都未出现 `reasoning.text` 或 `[REDACTED]`。

**支持范围**：两款当前 binding 下 `frame.provider`/`frame.model` 的精确原始值，即 xAI 提供者页 revision 2 守卫 4 所需的有限身份映射 `servingProvider = "xAI"`、`upstreamModel = 对应精确模型 ID`。**不支持**：大小写、空白或前缀变体；其它 OpenRouter 路由（如 `bedrock-xai-responses-v1` 一类）；原样回放是否被上游接受、续轮计量误差、缓存与费用。这些仍需真实三轮认证。
