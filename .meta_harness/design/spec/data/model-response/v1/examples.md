# 规范实例：合法与非法

属于 `data.model-response` v1。它是**本版的规范工件之一**，不是说明材料：
[`model-response.schema.json`](model-response.schema.json) 的每一条收场规则在这里各有正反实例，非法的一律注明**给哪个拒绝值、被哪一条挡住**。

**怎么读**：第一、二节的每个 JSON 块都是一条完整的响应体，**校验对象是根模式**（即 `$defs/ModelResponse`）；
块前一行写「预期」——`通过`，或 `拒绝：<拒绝值>`（拒绝值按 [S-27](contract.md#s-27-表示层拒绝值) 的次序取第一条被违反的）。
**这个格式也是机检格式**：把每个块喂给 Draft 2020-12 校验器、拿「预期」比对，不另抄一份清单。第三节不参与机检，第四节是手算。

**三条读法上的边界：**

- **`通过` 只说形状合规。**[S-26](contract.md#s-26-schema-的范围) 列的那些 Schema 管不到的条款，一条也不因通过而成立；第三节专门列它们的反例。
- **嵌在实例里的外部形状按施工简报的账本写**：`AssistantMessage`（`data.messages`）、`ContentBlock` 与 `AttachmentRef`（`data.content-blocks`）、
  `Usage`、`Cost` 与 `RunId`、`AttemptId`、`ModelCallId`（`data.call-accounts`）、`ModelProfileRef`、`ProviderName` 与 `ModelRequestParameters`（`data.model-profile`）、`FailureCause`（`data.loop-extension`）。
  **这五份契约都还没定型**，它们定型后本页的每个实例要按实际的成员名与取值复核一遍（[验证入口「变化的影响」](../verification.md#变化的影响)）。
- **标识串、供应商名、路由名只是占位**，不要从 `resp_`、`gen-` 这样的前缀推出任何规则（[S-6](contract.md#s-6-responseid)）。

## 一、合法实例

### E-1 正常收尾

预期：`通过`。依据 [S-13](contract.md#s-13-收场与其余成员的条件关系) 第一行：有 `reply`、`ending = complete`、`replyDisposition = persisted`、有 `firstTokenAt`、没有 `failure`。
`selectedBy = session`：有效模型就是会话选中的那条（[S-10](contract.md#s-10-有效模型怎么来的)）。`raw` 两项都在（[S-20](contract.md#s-20-上游原始响应留存)）。

```json
{
  "id": "resp_4c1e9a",
  "call": { "runId": "run_7a02", "attemptId": 1, "callId": "mc_19f3" },
  "dispatch": 1,
  "route": {
    "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" },
    "selectedBy": "session",
    "provider": "anthropic",
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758621600-a1b2c3",
    "parameters": { "reasoningEffort": "medium", "temperature": 0.7 }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_51",
    "type": "assistant",
    "createdAt": "2026-09-23T10:00:04Z",
    "response": "resp_4c1e9a",
    "ending": "complete",
    "blocks": [
      { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "先读一下配置文件。" },
      { "id": "b2", "kind": "tool_call", "visibility": { "toHuman": true, "toModel": true }, "complete": true, "callId": "call_01", "tool": "read_file", "arguments": { "path": "config.toml" } }
    ]
  },
  "replyDisposition": "persisted",
  "timing": { "sentAt": "2026-09-23T10:00:00Z", "firstTokenAt": "2026-09-23T10:00:01.2Z", "endedAt": "2026-09-23T10:00:04Z" },
  "usage": { "input_tokens": 1840, "output_tokens": 212, "cache_read_tokens": 1536, "cache_write_tokens": 0, "source": "upstream" },
  "cost": { "cost_usd": 0.0031, "source": "upstream_usage" },
  "raw": {
    "headers": { "content-type": "text/event-stream", "x-generation-id": "gen-1758621600-a1b2c3" },
    "body": { "storage": "attachments", "key": "raw/resp_4c1e9a", "mediaType": "text/event-stream", "bytes": 18234 }
  }
}
```

### E-2 写到上限截断

预期：`通过`。依据 [S-13](contract.md#s-13-收场与其余成员的条件关系) 第二行：`ending = truncated_at_limit`，**没长完的工具调用也在 `reply` 里、两位皆假**。
`selectedBy = layer_lock`：组织在上层锁死了这条（[S-10](contract.md#s-10-有效模型怎么来的)）。
`droppedParameters` 列出 `seed`——传输适配认不得它，**真正发给上游的只有 `maxOutputTokens`**（[S-11](contract.md#s-11-交给传输适配的参数与没发出去的项)）。

```json
{
  "id": "resp_7d20b4",
  "call": { "runId": "run_7a02", "attemptId": 1, "callId": "mc_1a08" },
  "dispatch": 1,
  "route": {
    "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "openai/gpt-5-mini" },
    "selectedBy": "layer_lock",
    "provider": "openai",
    "upstreamModel": "openai/gpt-5-mini-2025-08-07",
    "upstreamRequestId": "gen-1758621700-d4e5f6",
    "parameters": { "seed": 42, "maxOutputTokens": 256 },
    "droppedParameters": ["seed"]
  },
  "outcome": "truncated",
  "stopReason": "length",
  "reply": {
    "id": "msg_52",
    "type": "assistant",
    "createdAt": "2026-09-23T10:01:09Z",
    "response": "resp_7d20b4",
    "ending": "truncated_at_limit",
    "blocks": [
      { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "接下来改 main.rs：" },
      { "id": "b2", "kind": "tool_call", "visibility": { "toHuman": false, "toModel": false }, "complete": false, "rawArguments": "{\"path\": \"src/ma" }
    ]
  },
  "replyDisposition": "persisted",
  "timing": { "sentAt": "2026-09-23T10:01:00Z", "firstTokenAt": "2026-09-23T10:01:00.8Z", "endedAt": "2026-09-23T10:01:09Z" },
  "usage": { "input_tokens": 2210, "output_tokens": 256, "cache_read_tokens": 0, "cache_write_tokens": 2048, "source": "upstream" },
  "cost": { "cost_usd": 0.0019, "source": "upstream_usage" }
}
```

### E-3 用户中断，已有内容

预期：`通过`。依据 [S-13](contract.md#s-13-收场与其余成员的条件关系) 第三行：`ending = interrupted_by_user`，内容是已交付的那部分；**不带 `failure`**——中断不是故障（[S-12](contract.md#s-12-收场)）。
`selectedBy` 是一件拓展件：调模型之前它以 `select_model` 定了这一次（[S-10](contract.md#s-10-有效模型怎么来的)）。
流在交出用量之前就断了，所以用量与费用按「来源 = 无」记 `unknown`（[S-19](contract.md#s-19-用量与费用)）。

```json
{
  "id": "resp_0b3f71",
  "call": { "runId": "run_7a02", "attemptId": 1, "callId": "mc_1c55" },
  "dispatch": 1,
  "route": {
    "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "google/gemini-2.5-flash" },
    "selectedBy": { "extension": "cheap-first-router" },
    "provider": "google-vertex",
    "upstreamModel": "google/gemini-2.5-flash",
    "parameters": {}
  },
  "outcome": "interrupted",
  "reply": {
    "id": "msg_53",
    "type": "assistant",
    "createdAt": "2026-09-23T10:02:03Z",
    "response": "resp_0b3f71",
    "ending": "interrupted_by_user",
    "blocks": [
      { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "这个问题可以分三步看。第一步" }
    ]
  },
  "timing": { "sentAt": "2026-09-23T10:02:00Z", "firstTokenAt": "2026-09-23T10:02:01Z", "endedAt": "2026-09-23T10:02:03Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" }
}
```

### E-4 用户中断，还没有内容——费用未知

预期：`通过`。依据 [S-13](contract.md#s-13-收场与其余成员的条件关系) 第四行：**没有 `reply`、没有 `firstTokenAt`、不带 `failure`**——[不伪造一条空的消息](../../../../product/PF-009-context-message-types/design.md#56-流断在半路)，这次只留一笔账。
**这是「费用未知」的那一条**：请求到了上游、上游可能已经开始计费，但没交出用量就被叫停了——记 `unknown`，**不是零**（[S-19](contract.md#s-19-用量与费用)）。
**响应头已经到了，照样不算首 token**（[S-17](contract.md#s-17-首-token-与时序)）：`raw.headers` 在，`firstTokenAt` 不在。

```json
{
  "id": "resp_52e0c8",
  "call": { "runId": "run_7a02", "attemptId": 1, "callId": "mc_1d90" },
  "dispatch": 1,
  "route": {
    "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" },
    "selectedBy": "session",
    "provider": "anthropic",
    "upstreamRequestId": "gen-1758621900-0a9b8c",
    "parameters": { "reasoningEffort": "high" }
  },
  "outcome": "interrupted",
  "timing": { "sentAt": "2026-09-23T10:03:00Z", "endedAt": "2026-09-23T10:03:02Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" },
  "raw": { "headers": { "content-type": "text/event-stream", "x-generation-id": "gen-1758621900-0a9b8c" } }
}
```

### E-5 首 token 之后的故障，上游最后回 429

预期：`通过`。依据 [S-13](contract.md#s-13-收场与其余成员的条件关系) 最后一行：**没有 `reply`、有 `delivered`、成因 `interrupted_mid_reply`、有 `firstTokenAt`**。
**上游最后回的是 429，状态码原样带着，但成因不因此变成 `upstream_unavailable`**——首 token 已经出来，[无论上游最后返回什么，都归「说到一半断了」](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)。
`upstreamError.message` 是**脱敏之后的原样**（[S-21](contract.md#s-21-写入之前脱敏)）。这次调用**不会再有下一次发出**（[S-23](contract.md#s-23-同一次调用的响应体序列)）。

```json
{
  "id": "resp_9a61d2",
  "call": { "runId": "run_7a02", "attemptId": 1, "callId": "mc_1f04" },
  "dispatch": 1,
  "route": {
    "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" },
    "selectedBy": "session",
    "provider": "anthropic",
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758622000-77aa01",
    "parameters": {}
  },
  "outcome": "failed",
  "delivered": [
    { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "我先检查一下测试为什么失败，看起来是" }
  ],
  "failure": {
    "cause": "interrupted_mid_reply",
    "statusCode": 429,
    "upstreamError": { "code": "429", "message": "Rate limit exceeded for this provider. Please retry later." }
  },
  "timing": { "sentAt": "2026-09-23T10:04:00Z", "firstTokenAt": "2026-09-23T10:04:01.5Z", "endedAt": "2026-09-23T10:04:06Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" }
}
```

### E-6 与 E-7 一次调用的两次发出

**同一次调用**（`call` 逐字相同），第一次发出走 `anthropic`、上游 503、首 token 之前失败；重试挂件换一家，第二次走 `amazon-bedrock`、正常收尾。
两条都预期 `通过`。它们一起演示 [S-8](contract.md#s-8-第几次发出)（`dispatch` 1、2，不重不跳）、[S-23](contract.md#s-23-同一次调用的响应体序列)（前一条是策略那一类失败、没有首 token；`reply` 只在最后一条）、
[S-19](contract.md#s-19-用量与费用)（两条各记各的账，两笔钱都在）。

E-6，预期：`通过`。首 token 之前的故障：没有 `firstTokenAt`，成因不是 `interrupted_mid_reply`。**上游没回报模型名**，`upstreamModel` 缺席而不是填路由名（[S-9](contract.md#s-9-路由留痕)）。

```json
{
  "id": "resp_e6a001",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_2b77" },
  "dispatch": 1,
  "route": {
    "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" },
    "selectedBy": "session",
    "provider": "anthropic",
    "upstreamRequestId": "gen-1758622100-e6e6e6",
    "parameters": { "temperature": 0.2 }
  },
  "outcome": "failed",
  "failure": {
    "cause": "upstream_unavailable",
    "statusCode": 503,
    "upstreamError": { "code": "503", "message": "Provider returned error", "raw": { "error": { "code": 503, "message": "Provider returned error" } } }
  },
  "timing": { "sentAt": "2026-09-23T10:05:00Z", "endedAt": "2026-09-23T10:05:01Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" },
  "raw": {
    "headers": { "content-type": "application/json" },
    "body": { "storage": "attachments", "key": "raw/resp_e6a001", "mediaType": "application/json", "bytes": 96 }
  }
}
```

E-7，预期：`通过`。同一次调用的第二次发出，正常收尾；`reply.response` 指回的是**它自己**的 `id`，不是 E-6 的。

```json
{
  "id": "resp_e7b002",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_2b77" },
  "dispatch": 2,
  "route": {
    "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" },
    "selectedBy": "session",
    "provider": "amazon-bedrock",
    "upstreamModel": "anthropic/claude-4.5-sonnet-20250929",
    "upstreamRequestId": "gen-1758622103-e7e7e7",
    "parameters": { "temperature": 0.2 }
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_60",
    "type": "assistant",
    "createdAt": "2026-09-23T10:05:09Z",
    "response": "resp_e7b002",
    "ending": "complete",
    "blocks": [
      { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "测试失败是因为时区设置，已经定位到那一行。" }
    ]
  },
  "replyDisposition": "persisted",
  "timing": { "sentAt": "2026-09-23T10:05:03Z", "firstTokenAt": "2026-09-23T10:05:04Z", "endedAt": "2026-09-23T10:05:09Z" },
  "usage": { "input_tokens": 3120, "output_tokens": 480, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream" },
  "cost": { "cost_usd": 0.0123, "source": "upstream_usage" }
}
```

### E-8 同一个 Run 里前后两次调用，前一次的回复被否决

**两次调用，不是一次调用的两次发出**：`call.callId` 不同（`mc_3a01`、`mc_3a02`），各自的 `dispatch` 都是 1。
前一次的模型回复里有一张图，挂在「消息落盘之前」的转换件给它交不出 transcript，**否决了这份回复**；
这次调用照样以 `complete` 结束，记 `replyDisposition = { vetoed }`，**不带 `failure`**。loop 在下一次迭代**另起一次新的模型调用**，这一次的回复落盘成了消息
（[S-13](contract.md#s-13-收场与其余成员的条件关系) 的引注、[S-14](contract.md#s-14-回复与已交付部分)、[S-17](contract.md#s-17-首-token-与时序)、[S-23](contract.md#s-23-同一次调用的响应体序列) 第 4 条）。
**两笔钱都照实记**：被否决的那一次同样消耗了上游（[S-19](contract.md#s-19-用量与费用)）。

E-8a，预期：`通过`。前一次调用：有首 token、有 `reply`，但 `replyDisposition` 是 `vetoed`——这份回复**没有成为消息**，它带的 `msg_70` 在会话日志里找不到。

```json
{
  "id": "resp_8a0001",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_3a01" },
  "dispatch": 1,
  "route": {
    "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "google/gemini-2.5-flash-image" },
    "selectedBy": "session",
    "provider": "google-vertex",
    "upstreamModel": "google/gemini-2.5-flash-image",
    "upstreamRequestId": "gen-1758622200-8a8a8a",
    "parameters": {}
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_70",
    "type": "assistant",
    "createdAt": "2026-09-23T10:06:07Z",
    "response": "resp_8a0001",
    "ending": "complete",
    "blocks": [
      { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "这是改好的架构图：" },
      { "id": "b2", "kind": "image", "visibility": { "toHuman": true, "toModel": true }, "mediaType": "image/png", "data": { "storage": "attachments", "key": "blk/resp_8a0001/b2", "mediaType": "image/png", "bytes": 204800 } }
    ]
  },
  "replyDisposition": { "vetoed": { "by": "image-transcriber", "reason": "no transcript produced for image/png" } },
  "timing": { "sentAt": "2026-09-23T10:06:00Z", "firstTokenAt": "2026-09-23T10:06:01Z", "endedAt": "2026-09-23T10:06:07Z" },
  "usage": { "input_tokens": 1500, "output_tokens": 1290, "cache_read_tokens": 1024, "cache_write_tokens": 0, "source": "upstream" },
  "cost": { "cost_usd": 0.0391, "source": "upstream_usage" }
}
```

E-8b，预期：`通过`。loop 另起的**新调用**（`mc_3a02`），它的发出从 `dispatch = 1` 数起；回复落盘成了消息。

```json
{
  "id": "resp_8b0002",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_3a02" },
  "dispatch": 1,
  "route": {
    "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "google/gemini-2.5-flash-image" },
    "selectedBy": "session",
    "provider": "google-vertex",
    "upstreamModel": "google/gemini-2.5-flash-image",
    "upstreamRequestId": "gen-1758622210-8b8b8b",
    "parameters": {}
  },
  "outcome": "complete",
  "stopReason": "stop",
  "reply": {
    "id": "msg_71",
    "type": "assistant",
    "createdAt": "2026-09-23T10:06:15Z",
    "response": "resp_8b0002",
    "ending": "complete",
    "blocks": [
      { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "架构图改好了：左侧是入口层，右侧是三个运行时。" }
    ]
  },
  "replyDisposition": "persisted",
  "timing": { "sentAt": "2026-09-23T10:06:10Z", "firstTokenAt": "2026-09-23T10:06:11Z", "endedAt": "2026-09-23T10:06:15Z" },
  "usage": { "input_tokens": 1560, "output_tokens": 88, "cache_read_tokens": 1024, "cache_write_tokens": 0, "source": "upstream" },
  "cost": { "cost_usd": 0.0012, "source": "upstream_usage" }
}
```

## 二、非法实例：每个拒绝值至少一个

下面各块都以第一节的某个正例为底，**块前写明是哪一个、改了什么**；为了短，`route` 一律只留必需成员、`raw` 一律省去——
这两处的删减本身都合法。**每个块按 [S-27](contract.md#s-27-表示层拒绝值) 的次序，第一条被违反的就是块前写的那一个**
（个别块同时违反排在后面的规则，例如 R-7 也缺 `delivered`，那不改变它给出的拒绝值）。

### R-1 `malformed`：缺必需成员

在 E-6 上删掉 `usage`。**缺席不是「没有用量」**——拿不到要写 `unknown`（[S-19](contract.md#s-19-用量与费用)）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r1",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_2b77" },
  "dispatch": 1,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "anthropic", "parameters": {} },
  "outcome": "failed",
  "failure": { "cause": "upstream_unavailable", "statusCode": 503 },
  "timing": { "sentAt": "2026-09-23T10:05:00Z", "endedAt": "2026-09-23T10:05:01Z" },
  "cost": { "cost_usd": "unknown", "source": "none" }
}
```

### R-2 `malformed`：「一项也没丢」写成了空数组

在 E-6 上加 `"droppedParameters": []`。「一项也没丢」只有一种写法——缺席（[S-11](contract.md#s-11-交给传输适配的参数与没发出去的项)）。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r2",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_2b77" },
  "dispatch": 1,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "anthropic", "parameters": {}, "droppedParameters": [] },
  "outcome": "failed",
  "failure": { "cause": "upstream_unavailable", "statusCode": 503 },
  "timing": { "sentAt": "2026-09-23T10:05:00Z", "endedAt": "2026-09-23T10:05:01Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" }
}
```

### R-3 `outcome_unknown`

在 E-7 上把 `outcome` 改成 `"success"`。收场四值闭合，不做「最接近」映射（[S-12](contract.md#s-12-收场)）。预期：`拒绝：outcome_unknown`。

```json
{
  "id": "resp_r3",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_2b77" },
  "dispatch": 2,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "amazon-bedrock", "parameters": {} },
  "outcome": "success",
  "reply": { "id": "msg_60", "type": "assistant", "createdAt": "2026-09-23T10:05:09Z", "response": "resp_r3", "ending": "complete", "blocks": [ { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "好的。" } ] },
  "replyDisposition": "persisted",
  "timing": { "sentAt": "2026-09-23T10:05:03Z", "firstTokenAt": "2026-09-23T10:05:04Z", "endedAt": "2026-09-23T10:05:09Z" },
  "usage": { "input_tokens": 3120, "output_tokens": 480, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream" },
  "cost": { "cost_usd": 0.0123, "source": "upstream_usage" }
}
```

### R-4 `dispatch_zero`

在 E-6 上把 `dispatch` 改成 `0`。第几次发出从 1 起（[S-8](contract.md#s-8-第几次发出)）。预期：`拒绝：dispatch_zero`。

```json
{
  "id": "resp_r4",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_2b77" },
  "dispatch": 0,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "anthropic", "parameters": {} },
  "outcome": "failed",
  "failure": { "cause": "upstream_unavailable", "statusCode": 503 },
  "timing": { "sentAt": "2026-09-23T10:05:00Z", "endedAt": "2026-09-23T10:05:01Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" }
}
```

### R-5 `cause_unknown`

在 E-6 上把成因改成 `"rate_limited"`。**「被限流」已经并进「上游这会儿给不出回复」**，差在哪由状态码说（[PF-013 §5.7 为什么是八个取值](../../../../product/PF-013-model-profiles-and-invocation/design.md#为什么是八个取值不是更多)、[S-15](contract.md#s-15-故障的成因与原样状态码)）。预期：`拒绝：cause_unknown`。

```json
{
  "id": "resp_r5",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_2b77" },
  "dispatch": 1,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "anthropic", "parameters": {} },
  "outcome": "failed",
  "failure": { "cause": "rate_limited", "statusCode": 429 },
  "timing": { "sentAt": "2026-09-23T10:05:00Z", "endedAt": "2026-09-23T10:05:01Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" }
}
```

### R-6 `reply_missing`

在 E-7 上删掉 `reply`，同时删掉 `firstTokenAt`（否则还会撞上别的规则，这里只演示这一条）。`complete` 必带回复（[S-13](contract.md#s-13-收场与其余成员的条件关系)）。预期：`拒绝：reply_missing`。

```json
{
  "id": "resp_r6",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_2b77" },
  "dispatch": 2,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "amazon-bedrock", "parameters": {} },
  "outcome": "complete",
  "replyDisposition": "persisted",
  "timing": { "sentAt": "2026-09-23T10:05:03Z", "endedAt": "2026-09-23T10:05:09Z" },
  "usage": { "input_tokens": 3120, "output_tokens": 480, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream" },
  "cost": { "cost_usd": 0.0123, "source": "upstream_usage" }
}
```

### R-7 `reply_on_failure`

在 E-5 上把 `delivered` 换成一条 `reply`。**故障断的不成为消息**（[S-13](contract.md#s-13-收场与其余成员的条件关系)、[PF-009 §5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路)）。预期：`拒绝：reply_on_failure`。

```json
{
  "id": "resp_r7",
  "call": { "runId": "run_7a02", "attemptId": 1, "callId": "mc_1f04" },
  "dispatch": 1,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "anthropic", "parameters": {} },
  "outcome": "failed",
  "reply": { "id": "msg_61", "type": "assistant", "createdAt": "2026-09-23T10:04:06Z", "response": "resp_r7", "ending": "complete", "blocks": [ { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "我先检查一下测试为什么失败，看起来是" } ] },
  "failure": { "cause": "interrupted_mid_reply", "statusCode": 429 },
  "timing": { "sentAt": "2026-09-23T10:04:00Z", "firstTokenAt": "2026-09-23T10:04:01.5Z", "endedAt": "2026-09-23T10:04:06Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" }
}
```

### R-8 `reply_and_delivered`

在 E-3 上再加一份 `delivered`。**已交付的内容要么成了消息，要么记在账里，不能两处都放**（[S-14](contract.md#s-14-回复与已交付部分)）。预期：`拒绝：reply_and_delivered`。

```json
{
  "id": "resp_r8",
  "call": { "runId": "run_7a02", "attemptId": 1, "callId": "mc_1c55" },
  "dispatch": 1,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "google/gemini-2.5-flash" }, "selectedBy": "session", "provider": "google-vertex", "parameters": {} },
  "outcome": "interrupted",
  "reply": { "id": "msg_53", "type": "assistant", "createdAt": "2026-09-23T10:02:03Z", "response": "resp_r8", "ending": "interrupted_by_user", "blocks": [ { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "这个问题可以分三步看。第一步" } ] },
  "delivered": [ { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "这个问题可以分三步看。第一步" } ],
  "timing": { "sentAt": "2026-09-23T10:02:00Z", "firstTokenAt": "2026-09-23T10:02:01Z", "endedAt": "2026-09-23T10:02:03Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" }
}
```

### R-9 `failure_missing`

在 E-6 上删掉 `failure`。**故障必带成因**；缺了不等于「没认出来」——那要写 `unrecognized`（[S-15](contract.md#s-15-故障的成因与原样状态码)、[S-28](contract.md#s-28-表示层拒绝与判定分开)）。预期：`拒绝：failure_missing`。

```json
{
  "id": "resp_r9",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_2b77" },
  "dispatch": 1,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "anthropic", "parameters": {} },
  "outcome": "failed",
  "timing": { "sentAt": "2026-09-23T10:05:00Z", "endedAt": "2026-09-23T10:05:01Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" }
}
```

### R-10 `failure_on_interrupted`

在 E-4 上加一条 `failure`。**用户中断不是非常态，不带任何成因**——加进来，用户的一次正常操作就被登记成一次失败（[S-12](contract.md#s-12-收场)）。预期：`拒绝：failure_on_interrupted`。

```json
{
  "id": "resp_r10",
  "call": { "runId": "run_7a02", "attemptId": 1, "callId": "mc_1d90" },
  "dispatch": 1,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "anthropic", "parameters": {} },
  "outcome": "interrupted",
  "failure": { "cause": "unrecognized" },
  "timing": { "sentAt": "2026-09-23T10:03:00Z", "endedAt": "2026-09-23T10:03:02Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" }
}
```

### R-11 `first_token_inconsistent`：说「断在半路」，却没有首 token

在 E-6 上把成因改成 `interrupted_mid_reply`。**没开口就谈不上「说到一半」**（[S-13](contract.md#s-13-收场与其余成员的条件关系) 最后两行，Schema 第八支的①）。预期：`拒绝：first_token_inconsistent`。

```json
{
  "id": "resp_r11",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_2b77" },
  "dispatch": 1,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "anthropic", "parameters": {} },
  "outcome": "failed",
  "failure": { "cause": "interrupted_mid_reply", "statusCode": 503 },
  "timing": { "sentAt": "2026-09-23T10:05:00Z", "endedAt": "2026-09-23T10:05:01Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" }
}
```

### R-12 `first_token_inconsistent`：开了口，成因却不是「断在半路」

在 E-5 上把成因改成 `upstream_unavailable`——**这正是「看到 429 就当成上游那边的事」那种写法**，而首 token 已经出来了（Schema 第八支的②）。预期：`拒绝：first_token_inconsistent`。

> **回复在落盘之前被否决的那一次，若写成「`failed`、有首 token、成因是某个可重试的值」，也是这个形状，同样被挡住。**
> 那一次的正确写法是 `complete`／`truncated` 加 `replyDisposition = { vetoed }`，见 [E-8](#e-8-同一个-run-里前后两次调用前一次的回复被否决)；
> **不让实现挑一个成因凑数**。

```json
{
  "id": "resp_r12",
  "call": { "runId": "run_7a02", "attemptId": 1, "callId": "mc_1f04" },
  "dispatch": 1,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "anthropic", "parameters": {} },
  "outcome": "failed",
  "delivered": [ { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "我先检查一下测试为什么失败，看起来是" } ],
  "failure": { "cause": "upstream_unavailable", "statusCode": 429 },
  "timing": { "sentAt": "2026-09-23T10:04:00Z", "firstTokenAt": "2026-09-23T10:04:01.5Z", "endedAt": "2026-09-23T10:04:06Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" }
}
```

### R-13 `first_token_inconsistent`：有回复，却没有首 token

在 E-7 上删掉 `firstTokenAt`。**有回复就交出过内容**（Schema 第八支的④）。预期：`拒绝：first_token_inconsistent`。

```json
{
  "id": "resp_r13",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_2b77" },
  "dispatch": 2,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "amazon-bedrock", "parameters": {} },
  "outcome": "complete",
  "reply": { "id": "msg_60", "type": "assistant", "createdAt": "2026-09-23T10:05:09Z", "response": "resp_r13", "ending": "complete", "blocks": [ { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "好的。" } ] },
  "replyDisposition": "persisted",
  "timing": { "sentAt": "2026-09-23T10:05:03Z", "endedAt": "2026-09-23T10:05:09Z" },
  "usage": { "input_tokens": 3120, "output_tokens": 480, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream" },
  "cost": { "cost_usd": 0.0123, "source": "upstream_usage" }
}
```

### R-14 `first_token_inconsistent`：没有回复的中断，却有首 token

在 E-4 上加一个 `firstTokenAt`。**用户叫停时已经有内容，就必定落成一条消息**；有首 token 而没有回复，就是已交付的内容丢了（Schema 第八支的⑥）。预期：`拒绝：first_token_inconsistent`。

```json
{
  "id": "resp_r14",
  "call": { "runId": "run_7a02", "attemptId": 1, "callId": "mc_1d90" },
  "dispatch": 1,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "anthropic", "parameters": {} },
  "outcome": "interrupted",
  "timing": { "sentAt": "2026-09-23T10:03:00Z", "firstTokenAt": "2026-09-23T10:03:01Z", "endedAt": "2026-09-23T10:03:02Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" }
}
```

### R-15 `failure_on_success`：正常收尾却带着故障

在 E-7 上加一条 `failure`。**主路径走完了就没有成因**；回复在落盘之前被否决也不例外，那记在 `replyDisposition` 上（[S-13](contract.md#s-13-收场与其余成员的条件关系)、[S-27](contract.md#s-27-表示层拒绝值)）。预期：`拒绝：failure_on_success`。

```json
{
  "id": "resp_r15",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_2b77" },
  "dispatch": 2,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "amazon-bedrock", "parameters": {} },
  "outcome": "complete",
  "reply": { "id": "msg_60", "type": "assistant", "createdAt": "2026-09-23T10:05:09Z", "response": "resp_r15", "ending": "complete", "blocks": [ { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "好的。" } ] },
  "replyDisposition": "persisted",
  "failure": { "cause": "unrecognized", "statusCode": 200 },
  "timing": { "sentAt": "2026-09-23T10:05:03Z", "firstTokenAt": "2026-09-23T10:05:04Z", "endedAt": "2026-09-23T10:05:09Z" },
  "usage": { "input_tokens": 3120, "output_tokens": 480, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream" },
  "cost": { "cost_usd": 0.0123, "source": "upstream_usage" }
}
```

### R-16 `reply_ending_mismatch`：回复的收尾与收场错配

在 E-2 上把 `reply.ending` 改成 `complete`，`outcome` 仍是 `truncated`。**截断就是截断，不许在回复上写成正常收尾**（[S-13](contract.md#s-13-收场与其余成员的条件关系)、[S-27](contract.md#s-27-表示层拒绝值)）。预期：`拒绝：reply_ending_mismatch`。

```json
{
  "id": "resp_r16",
  "call": { "runId": "run_7a02", "attemptId": 1, "callId": "mc_1a08" },
  "dispatch": 1,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "openai/gpt-5-mini" }, "selectedBy": "layer_lock", "provider": "openai", "parameters": {} },
  "outcome": "truncated",
  "reply": { "id": "msg_52", "type": "assistant", "createdAt": "2026-09-23T10:01:09Z", "response": "resp_r16", "ending": "complete", "blocks": [ { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "接下来改 main.rs：" } ] },
  "replyDisposition": "persisted",
  "timing": { "sentAt": "2026-09-23T10:01:00Z", "firstTokenAt": "2026-09-23T10:01:00.8Z", "endedAt": "2026-09-23T10:01:09Z" },
  "usage": { "input_tokens": 2210, "output_tokens": 256, "cache_read_tokens": 0, "cache_write_tokens": 2048, "source": "upstream" },
  "cost": { "cost_usd": 0.0019, "source": "upstream_usage" }
}
```

### R-17 `malformed`：正常收尾，却说不出回复有没有成为消息

在 E-7 上删掉 `replyDisposition`。**缺席不是「落盘了」**——正常收尾与截断的那份回复有没有成为消息，必须明说（[S-14](contract.md#s-14-回复与已交付部分)）；
这一情形没有专名，按 [S-27](contract.md#s-27-表示层拒绝值) 排在最后给 `malformed`。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r17",
  "call": { "runId": "run_7a02", "attemptId": 2, "callId": "mc_2b77" },
  "dispatch": 2,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "anthropic/claude-sonnet-4.5" }, "selectedBy": "session", "provider": "amazon-bedrock", "parameters": {} },
  "outcome": "complete",
  "reply": { "id": "msg_60", "type": "assistant", "createdAt": "2026-09-23T10:05:09Z", "response": "resp_r17", "ending": "complete", "blocks": [ { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "好的。" } ] },
  "timing": { "sentAt": "2026-09-23T10:05:03Z", "firstTokenAt": "2026-09-23T10:05:04Z", "endedAt": "2026-09-23T10:05:09Z" },
  "usage": { "input_tokens": 3120, "output_tokens": 480, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream" },
  "cost": { "cost_usd": 0.0123, "source": "upstream_usage" }
}
```

### R-18 `malformed`：用户中断的回复带了 `replyDisposition`

在 E-3 上加 `"replyDisposition": { "vetoed": { "by": "image-transcriber" } }`。**`interrupted` 的那份回复不带它**；它被否决时怎样表示本版没有定（[S-14](contract.md#s-14-回复与已交付部分)、[G-12](contract.md#七已知缺口)），
**本版拒绝，不让实现先挑一种写法**。预期：`拒绝：malformed`。

```json
{
  "id": "resp_r18",
  "call": { "runId": "run_7a02", "attemptId": 1, "callId": "mc_1c55" },
  "dispatch": 1,
  "route": { "profile": { "scope": { "layer": "organization", "organization": "org_7fd2c1" }, "routeName": "google/gemini-2.5-flash" }, "selectedBy": "session", "provider": "google-vertex", "parameters": {} },
  "outcome": "interrupted",
  "reply": { "id": "msg_53", "type": "assistant", "createdAt": "2026-09-23T10:02:03Z", "response": "resp_r18", "ending": "interrupted_by_user", "blocks": [ { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "这个问题可以分三步看。第一步" } ] },
  "replyDisposition": { "vetoed": { "by": "image-transcriber" } },
  "timing": { "sentAt": "2026-09-23T10:02:00Z", "firstTokenAt": "2026-09-23T10:02:01Z", "endedAt": "2026-09-23T10:02:03Z" },
  "usage": { "input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none" },
  "cost": { "cost_usd": "unknown", "source": "none" }
}
```

## 三、Schema 挡不住、但同样非法的

**本节不参与机检**——这些值形状上一概合法，只能由写入者的约束、静态检查或规范场景拒绝。
列在这里，是为了让[「校验通过不表示条款成立」](contract.md#s-28-表示层拒绝与判定分开)有具体例子，而不是一句免责声明。

| 做了什么 | 违反 |
|---|---|
| E-7 的 `reply.response` 写成 E-6 的 `id` | [S-14](contract.md#s-14-回复与已交付部分)：回复指回的是产出它的那一条 |
| `sentAt` 晚于 `endedAt`，或 `firstTokenAt` 早于 `sentAt` | [S-17](contract.md#s-17-首-token-与时序) |
| 停机恢复后判不出开没开口，写了一条没有 `firstTokenAt` 的 `failed` | [S-18](contract.md#s-18-首-token-缺席是一条断言)：缺席是断言，判不出不得写成缺席 |
| 上游没回报模型名，`upstreamModel` 填了路由名 | [S-9](contract.md#s-9-路由留痕) |
| `route.provider` 不在那条档案「允许的供应商」里 | [S-9](contract.md#s-9-路由留痕) |
| `droppedParameters` 列了一个 `parameters` 里没有的名字，或者丢了项却不写 | [S-11](contract.md#s-11-交给传输适配的参数与没发出去的项) |
| 一条 `failed` 带成因 `withdrawn`（档案已撤回） | [S-16](contract.md#s-16-发出了的才有响应体)：撤回在出门之前就上交了，没有「一次发出」 |
| 一条 `unrecognized` 既没有 `statusCode`、也没有 `upstreamError` 和 `raw` | [S-15](contract.md#s-15-故障的成因与原样状态码)：兜底也要留痕 |
| 同一次调用有 `dispatch` 1 与 3，没有 2 | [S-8](contract.md#s-8-第几次发出)、[S-23](contract.md#s-23-同一次调用的响应体序列) |
| 同一次调用里第 1 条是 `failed`、成因 `request_rejected`，之后还有第 2 条 | [S-23](contract.md#s-23-同一次调用的响应体序列)：「重试没用」是事实，重试挂件推翻不了 |
| 同一次调用里有两条带 `reply` | [S-14](contract.md#s-14-回复与已交付部分)、[S-23](contract.md#s-23-同一次调用的响应体序列) |
| E-8a 的回复被否决，这次调用之后却还有一条 `dispatch = 2` 再要一份 | [S-17](contract.md#s-17-首-token-与时序)、[S-23](contract.md#s-23-同一次调用的响应体序列)：有首 token 就不许重发，再试是**新的调用** |
| `replyDisposition` 是 `vetoed`，会话日志里却有一条消息的 `id` 等于那份 `reply.id` | [S-14](contract.md#s-14-回复与已交付部分)：被否决的那份没有成为消息 |
| `replyDisposition` 是 `persisted`，会话日志里却找不到那条消息 | [S-14](contract.md#s-14-回复与已交付部分) |
| `raw.headers` 里有 `authorization: Bearer sk-or-…`，或 `upstreamError.message` 里带着密钥的前几位 | [S-21](contract.md#s-21-写入之前脱敏) |
| 传输层在一次发出之内自己换了一家再试，只写下一条响应体 | [S-24](contract.md#s-24-一条响应体对应上游的一次请求) |
| 拿到了实际费用，回头把那条响应体的 `cost` 改掉 | [S-22](contract.md#s-22-写下即不变)：更正靠追加 `CostCorrection` |
| `ResponseId` 取上游的 generation id | [S-6](contract.md#s-6-responseid)：上游 id 另记，本系统的身份自己铸 |

## 四、按尝试记明细、按 Run 汇总

**对象**：E-6 与 E-7——同一次调用（`mc_2b77`）的两次发出，落在运行 `run_7a02` 的第 2 次尝试里。
**规则**取自 `data.call-accounts`（施工简报账本口径，契约定型后复核）：`unknown` **单独计数、不当零加**；一个目标有 `CostCorrection` 时取 `at` 最新的那一条覆盖它的 `cost_usd`。
汇总怎样呈现（「已知合计 + 未知条数」这种两元组只是本页的演示写法）归那份契约。

**按尝试记明细**——每次发出一行，**两行都在**：

| 响应体 | 尝试 | `dispatch` | 那一家 | 收场 | `cost_usd` | `input_tokens` | `output_tokens` | `cache_read_tokens` | `cache_write_tokens` |
|---|---|---|---|---|---|---|---|---|---|
| E-6 `resp_e6a001` | (run_7a02, 2) | 1 | anthropic | failed · upstream_unavailable · 503 | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` |
| E-7 `resp_e7b002` | (run_7a02, 2) | 2 | amazon-bedrock | complete | 0.0123 | 3120 | 480 | 0 | 0 |

**按 Run 汇总**（`run_7a02` 里只算这两条）：

| 量 | 已知部分之和 | 未知的条数 | 读法 |
|---|---|---|---|
| `cost_usd` | 0.0123 | 1 | **不是「0.0123 美元」**：有一笔不知道多少，已知部分是 0.0123。把 E-6 当零加，就把「可能已经计费的那一次」抹掉了（[S-19](contract.md#s-19-用量与费用) 第 1、2 条） |
| `input_tokens` | 3120 | 1 | 同上 |
| `output_tokens` | 480 | 1 | 同上 |
| `cache_read_tokens` | 0 | 1 | 同上；**已知部分的 0 是真的零，与 E-6 的 `unknown` 不是一回事** |
| `cache_write_tokens` | 0 | 1 | 同上 |

**之后补到了 E-6 的实际费用**：经 E-6 的 `upstreamRequestId`（`gen-1758622100-e6e6e6`）向上游补查，得到这次 503 实际收费 0。追加一条

```json
{ "target": { "kind": "model_response", "responseId": "resp_e6a001" }, "cost_usd": 0, "obtainedVia": "generation_endpoint", "at": "2026-09-23T11:00:00Z" }
```

**E-6 本身一个字不改**（[S-22](contract.md#s-22-写下即不变)）。重算：

| 量 | 已知部分之和 | 未知的条数 | 变化 |
|---|---|---|---|
| `cost_usd` | 0.0123 + 0 = **0.0123** | **0** | 未知那一笔被更正覆盖，**这时 0.0123 才是完整的总数** |
| 四类 token | 同上表 | 仍各 **1** | **更正只动费用**，E-6 的用量仍然不知道——汇总照实保留这个「不知道」 |

**两点要看清：**

- **两条账两笔钱都进了明细**，哪怕第一笔最后被更正成 0——它是**查出来是 0**，不是**当作 0**。
  若 E-6 没有 `upstreamRequestId`，经上游补查这条来路就走不通，只能等人工更正或一直保持 `unknown`（[S-9](contract.md#s-9-路由留痕)、[S-19](contract.md#s-19-用量与费用)）。
- **「这个 Run 的成本减去最后一次尝试的成本，就是崩溃浪费掉的钱」**（[PF-012 成本两层](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错)）：
  这两条都落在第 2 次尝试里，它们之间的差额是**同一次尝试内**换家的代价，不是崩溃造成的——**尝试号来自 `call.attemptId`，不来自 `dispatch`**。
