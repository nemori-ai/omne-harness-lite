# Google 两叶 2026-09-30 真实完整回复原件

2026-09-30 UTC 的补充观察，接续 [09-28 Gemma 4 比较试点](2026-09-28-gemma4-pilot.md)与 [09-28 源码跟进](2026-09-28-meter-followup.md)。对象仅为 OpenRouter 固定路由 `google-ai-studio` 上的 `google/gemini-3.8-flash` 与 `google/gemini-3.7-flash`。本页只记从原件逐帧读出的事实与推断界限，不作映射选择或采用。

## 取得方式

主调度沿唯一预算账本，以 R7 认证工具第六批 d（`batch6d`，10:43–10:44Z）对两叶各发一次 `family_three_turn` 场景的第 1 轮；两份 manifest 的 `sourceCommit` 同为执行仓库 `104ce616a8ebcf38292f65182a95179fe70d6ba4`，其中 `packages/model/pi-ai-transport/src/stream.ts` 的 SHA-256 为 `9a0f85ee6826e757743d897ff3909b30908b41e73b86fafe42160bf80d65d43c`。原件（原始 SSE、family 收据、第 2 轮计划拒绝收据）在**主调度私有付费证据目录**，本页不复制字节，密文只记长度与 SHA-256。

请求：当前绑定 definition `3`／`pi-ai:google` `mp4-17`，`reasoning.effort: high`，最大输出 4096，缓存档 automatic；system 为带认证 nonce 的指令加重复的 `Stable prefix.` 填充，user 为 `Look up CEDAR.`，恰一个工具 `lookup_code`（参数 `{query: string}`，要求必填、无附加属性）。场景审定稿 SHA-256：3.8 `9376c8635ecd0d9a96d1a36888eadb130ae5f79126109c01be41da4e486de48d`，3.7 `c24bc91556ed2dc9fdfebde29f72f55b7796e283b265a4c214a70027fa7be02b`；首轮线上体 SHA-256：3.8 `47f16cd6d727643dff43f0bca346d6d9ef8eec4c97383eec7e08e8196798c324`，3.7 `faa834baca1614c4ca8bebdaccc719cce9561c73d27fb4bbda18cc6bc8ccc756`。

## 原件

| 叶 | 生成 id | 原始 SSE 字节数 / SHA-256 | family 收据字节数 / SHA-256 |
|---|---|---|---|
| `google/gemini-3.8-flash` | `gen-1790765022-soWzJ2kSKKIdOhKsWM7Z` | 4092 / `390408a160e9a1d205bf5d223d8dfc5ae789b642894d90a2dc176796d865cf22` | 4520 / `decc41e2e32bb6e170fd0b2b5e1a67ea9545619750cee9fcc7f0602a821ae1ed` |
| `google/gemini-3.7-flash` | `gen-1790765039-T89IaeRcxSpJm8DIEXzO` | 3898 / `a213dbb82bbe03b36b1fcbc1d06e4e08202fd1f1c2f10c79aa775ca7f10dbe58` | 4515 / `74d876729fadeefd5a84f03e8d448685391cf18fec4b8491473fb244ffb59f34` |

两份原始流都以 `HTTP/1.1 200 OK` 响应头开头，`Content-Type: text/event-stream`、`Transfer-Encoding: chunked`；`X-Generation-Id` 头等于帧内 `id`；`X-Provider-Name` 只出现在 `access-control-expose-headers` 的名单里，没有同名响应头。收据记 `credentialOccurrencesRedacted: 0`。去掉 chunk 分帧后每流恰 5 个 JSON 帧加 `[DONE]`，没有 SSE 注释行。

## 逐帧形状

两流的帧序与成员完全相同，只有 id、密文与计数不同。每个 JSON 帧都带 `provider: "Google AI Studio"` 与等于精确模型 ID 的 `model`（两流各 5/5），同一流内不变。

| 帧 | `choices[0]` 内容 | `finish_reason` / `native_finish_reason` |
|---|---|---|
| 0 | `delta` 恰为 `{content: "", role: "assistant", reasoning: null, reasoning_details: [E]}` | `null` / `null` |
| 1 | `delta` 为 `{content: null, role: "assistant", tool_calls: [{index: 0, id, type: "function", function: {name: "lookup_code", arguments: ""}}]}` | `null` / `null` |
| 2 | `delta` 为 `{content: null, role: "assistant", tool_calls: [{index: 0, function: {arguments}}]}`，arguments 为 `{"query":"CEDAR"}`（17 字节） | `null` / `null` |
| 3 | `delta` 为 `{content: "", role: "assistant", reasoning: null}` | `tool_calls` / `STOP` |
| 4 | `delta` 为 `{content: "", role: "assistant"}`；帧另带 `usage` 与 `service_tier: "default"` | `tool_calls` / `STOP`（重复） |

**E 的逐字段读数**（帧 0 的唯一一条 `reasoning_details` 条目）：

| 字段 | 3.8 | 3.7 |
|---|---|---|
| 成员集 | 恰为 `type`、`data`、`format`、`id`、`index` | 同左 |
| `type` / `format` / `index` | `reasoning.encrypted` / `google-gemini-v1` / `0` | 同左 |
| `id` | `call_476730`，与帧 1 工具调用的 `id` 逐字相同 | `call_449710`，与帧 1 工具调用的 `id` 逐字相同 |
| `data` | 748 UTF-8 字节，非 `[REDACTED]`；合法标准 base64，解码 561 字节、首字节 `0x12`；SHA-256 `3a72ba0a5383c136e5c8adac9238e52bf974dfb6dc4a309ef4f64555c116b75d` | 560 字节，非 `[REDACTED]`；解码 419 字节、首字节 `0x12`；SHA-256 `1888bf96a4180294b7b1d9b0e07203c63cd047c4e436f9365fcf9881e84f132d` |

- `data` 整段在帧 0 一次到达，没有跨帧累加；E 先于工具调用的第一片出现。
- 没有 `signature`、`text`、`summary` 成员；任何帧都没有 `reasoning.text` 条目；原始字节里没有名为 `thought`、`thoughtSignature` 或 `signature` 的成员。
- 帧 0 与帧 3 显式带 `reasoning: null`，其余帧没有 `reasoning` 键；可见正文始终为空串或 `null`。

## 用量、费用与规划

| 叶 | `prompt_tokens` | `completion_tokens` | `reasoning_tokens` | 两者之差 | 缓存读／写 | `cost`（`upstream_inference_prompt_cost` / `…completions_cost`） |
|---|---|---|---|---|---|---|
| 3.8 | 949 | 110 | 93 | 17 | 0 / 0 | 0.00112425（0.00071175 / 0.0004125） |
| 3.7 | 951 | 81 | 64 | 17 | 0 / 0 | 0.001017（0.00071325 / 0.00030375） |

两帧 `usage` 另带 `is_byok: false` 与 `prompt_tokens_details` 的 `audio_tokens`、`video_tokens` 为 0。首轮计划均为 `full`／`estimated`（`fallbackReason: no_observation`）：3.8 预测 948、3.7 预测 950，预测减实际均为 −1；准入量 1299／1301。这是一次无历史、带工具、`effort: high` 的首轮，不是 holdout 设计，不构成误差界。

## reader 产出的领域结果

两份收据：`outcome: complete`；`blockKinds` 为 `thinking`、`tool_call`；`calibration` 为 `requestInput: known`、`observedInput: from_usage`、`outputGroup: known`；`servingProvider: "Google AI Studio"`，`upstreamModel` 等于精确模型 ID；opaque 恰 1 组 1 条 `reasoning.encrypted`（format `google-gemini-v1`、`index` 0、`data` 748／560 字节、无 signature 与 text）。认证工具记录的归一化 opaque 摘要：3.8 `7ac2e4201f6d2fd1306f00aef78c12d3e7e336e700ebb20434470614ceb6dca2`，3.7 `27b9a0193519459f136d5d27bbb8f06ee07d3cb7f837254218869b84b4ec30d4`。收据的逐条分析**不含 `id` 字段**，`id` 的存在与取值只来自原始帧。

按上述 SHA 的 `stream.ts` 推导（未另行实测）：`reasoning.encrypted` 条目不参与片段合并、整条原样进入思考块的 opaque（含 `id`）；帧内 `reasoning` 为 `null`，所以思考块的可见文本为空串；`finish_reason` 为 `tool_calls`，收束事件带 opaque 发出。

**第 2 轮**：两叶的计划拒绝收据相同——`stage: plan_rejected`，`invalidInput`／`input_size_unavailable`，`metrics: [maxInputTokens]`，`httpSentForRound: 0`，账本条目数前后均为 486；认证工具以该拒绝结束场景。所以首轮回复**没有被回放过**。

## 与 09-28 原件的对照

09-28 fit／holdout 两次运行（结果文件 SHA 见[试点页](2026-09-28-gemma4-pilot.md)）各含四份逐请求原始记录（JSON 包装的 SSE 文本，下表 SHA-256 指该文件），本家族此前没有登记它们的推理详情形状。本次只读复核：八份都在 `MAX_TOKENS` 截断，签名以 `reasoning.text` 的仅签名片段出现，成员恰为 `type`、`signature`、`format`、`index`，无 `id`，`index` 为 0；八个 signature 都是合法标准 base64，解码首字节都是 `0x12`，与 09-30 两条 E 的 `data` 相同。

| 原件 SHA-256 | 叶 · 用例 | signature 字符数 | 仅签名片段之前的 `reasoning.text` 文本片段 |
|---|---|---|---|
| `ebacba7404f208cea871a80512d93148235b5fd5cca49ec9a298cf7baaa4b387` | 3.8 · F1 | 336 | 1 |
| `a9c89d0587338a90949d3d402d38d003ecc9e731162fb1e200764c5b0583d049` | 3.8 · F2 | 348 | 1 |
| `2bfcec0276a462f186cef479a33a73e62bac137b81e9e7f5d281208c6c640a63` | 3.8 · H1 | 312 | 1 |
| `1c32fd0ff600def484cdf2c9b803fc1a63a616651c6b22b262a405eabcf6334a` | 3.8 · H2 | 344 | 1 |
| `bed835bc84b898276f636af345e33765592f130129e4d5369acdde1dbfa51062` | 3.7 · F1 | 324 | 0 |
| `774a46fdd7537f6ec4a6d39248238669c7005b24b757b4dc9c98122e07a29ce8` | 3.7 · F2 | 372 | 1 |
| `5a66d00254e62e58542576d90460bded3a7e9469436338ad40d62375b999cb07` | 3.7 · H1 | 304 | 1 |
| `1c88b600e6b656c70d7e600d44f70f4f3753d031da03bd0a8a747d7dc2f07773` | 3.7 · H2 | 356 | 1 |

| 维度 | 09-28 截断原件 | 09-30 完整原件 |
|---|---|---|
| 路径 | 无工具，32-token 输出上限截断 | 带一个工具，回复为一次工具调用 |
| 结束 | `length` / `MAX_TOKENS` | `tool_calls` / `STOP` |
| 签名类材料的载体 | `reasoning.text` 仅签名片段，无 `id` | `reasoning.encrypted` 的 `data`，`id` 等于同回复工具调用 id |
| 可见推理文本 | 多数有 `reasoning.text` 文本片段 | 无 |

## 推断界限

- **支持**：两叶在当前绑定、`effort: high`、带单个工具时，首轮完整工具调用回复的推理详情恰为一条 E，其 `id` 等于同一回复工具调用的上游 id；帧内身份字面值为 `Google AI Studio`／精确模型 ID；reader 把它产出为 complete 输出组；当前绑定对带回该组的第 2 轮在计划期拒绝、零 HTTP。
- **编码前缀相同只是观察**：10/10 串解码首字节为 `0x12`，不证明 E 的 `data` 与 09-28 的 signature 是同一种上游载荷，也不证明它是 Gemini 原生 API 的 thought signature。
- **`id` 与工具调用 id 相同只是观察**：OpenRouter 在回放时是否凭 `id` 把 E 重新关联到某个工具调用，本页没有依据。已取得的 [OpenRouter Reasoning Tokens 官方快照](../xai/closeout-2026-09-30/openrouter-reasoning-tokens.txt)（2026-09-30，SHA 见同目录 `sources.json`）列出 `google-gemini-v1` 格式，只说 `id` 是「reasoning detail 的唯一标识」；它的工具续轮示例把上游 `tool_calls` 与 `reasoning_details` 原样带回，没有说明两者 id 的关系，也没有覆盖回放方改写工具调用 id 的情形。
- **不支持**：非工具路径的完整回复在当前绑定下带什么详情（唯一的非工具完整回复是 09-28 公开探针的领域结果，raw 未捕获）；一次回复多个工具调用时有几条 E；E 被拆成多片流出；其他 effort；上游是否接受原样回放；回放的 E 计入多少输入；缓存与费用在续轮的表现。这些都需要实际发送回放的观察。

上游路由、模型端点、OpenRouter 推理详情协议或 reader 源码变化时重核本页。
