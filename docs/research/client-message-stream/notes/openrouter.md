<!-- 来源核对笔记：OpenRouter 流式响应形状。2026-09-15 抓取官方文档产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# OpenRouter：统一 SSE 增量的形状

- 来源：OpenRouter 官方文档，2026-09-15 抓取：
  - <https://openrouter.ai/docs/api-reference/streaming>
  - <https://openrouter.ai/docs/api-reference/overview>（响应 schema）
  - <https://openrouter.ai/docs/api-reference/chat-completion>（`ChatStreamChunk` schema）
  - <https://openrouter.ai/docs/use-cases/reasoning-tokens>
- 文档页无版本号；结论按抓取日期固定。未做实际请求核对，未读任何供应方原生文档；`tool-calling` 功能页在两个候选 URL 上返回 404 或不含流式内容（未覆盖）。

## 1. 传输与分帧

- 请求 `stream: true`；响应是标准 SSE，每条 `data: <JSON>`；以 `data: [DONE]` 结束。
- 以 `:` 开头的行是 SSE 注释，OpenRouter 用 `: OPENROUTER PROCESSING` 做保活，解析器必须跳过。
- 取消：中止连接即取消；OpenAI、Anthropic 等供应方会随之停止生成与计费，AWS Bedrock、Groq、Google、Mistral 等不会（页面列表以文档为准）。

## 2. chunk 形状（`ChatStreamChunk`）

```text
{ id, object: 'chat.completion.chunk', created, model, provider?, system_fingerprint?,
  choices: [{ index, delta, finish_reason: string | null, native_finish_reason: string | null, error? }],
  usage? }
delta: { role?, content: string | null, reasoning?: string, reasoning_details?: ChatReasoningDetails,
         tool_calls?: [{ index: number, id: string, type: 'function', function: { name: string, arguments: string } }] }
```

- `tool_calls[].function.arguments` 在流中以**增量字符串片段**发送（chat-completion 参考页明示）；`index` 是该调用在 `tool_calls` 数组中的位置，多个并行调用靠 `index` 区分。
- `finish_reason` 归一为 `tool_calls | stop | length | content_filter | error`，供应方原值在 `native_finish_reason`。
- `usage`：最终 chunk 总带 `usage`（`include_usage` 已弃用、无效，文档写"Full usage details are always included"）；该 chunk 的 `delta` 为空 `content`/`role`，`finish_reason` 重复最后一个内容 chunk 的值。`usage` 字段：`prompt_tokens`、`completion_tokens`、`total_tokens`、`prompt_tokens_details{cached_tokens, cache_write_tokens, audio_tokens, video_tokens}?`、`completion_tokens_details{reasoning_tokens, audio_tokens, image_tokens}?`、`cost?`、`is_byok`、`cost_details`。

## 3. 错误

- 头部提交前：普通 JSON 错误与 HTTP 状态码（400/401/402/429/502/503）。
- 头部提交后（流中途）：作为 SSE 数据事件到达，顶层 `error{code, message}` 与常规响应字段并列，`choices[0].finish_reason = 'error'`，HTTP 状态保持 200，流随之终止。示例（文档原文）：

```text
data: {"id":"cmpl-abc123",...,"error":{"code":"server_error","message":"..."},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}
```

- `choices[].error?: {code: number, message: string, metadata?}` 也是响应 schema 的一部分（overview 页）。

## 4. 推理内容

- 非流式：`choices[].message.reasoning`（明文字符串）与 `choices[].message.reasoning_details[]`；流式：`choices[].delta.reasoning_details`（同时可有 `delta.reasoning`）。
- `reasoning_details` 元素公共字段：`id: string | null`、`format: string`（如 `anthropic-claude-v1`、`openai-responses-v1`）、`index?: number`、`type`；三种类型：`reasoning.text{text, signature?}`、`reasoning.summary{summary}`、`reasoning.encrypted{data}`。
- 跨轮保留：在后续请求的助手消息上原样回传 `message.reasoning` 或完整未改的 `message.reasoning_details`；"连续推理块的整个序列必须与原请求生成的输出一致"。
- 供应方差异：Anthropic 默认返回摘要式思考；OpenAI o 系列不返回推理 token；其余多数返回。

## 5. 与 DSH `StreamChunk` 的对应（推断）

| OpenRouter | DSH `StreamChunk`（[dsh 笔记 §2](dsh.md#2-streamchunk-原始协议与-adapter-契约)） | 说明 |
|---|---|---|
| `delta.content` 片段 | `text-delta{index, text}` | OpenAI 兼容协议没有块开始/结束标记，`block-start`/`block-end` 须由 adapter 按"首次见到该 index"与"finish 到达"合成；`BlockAssembler` 本就容忍无 start/end 的纯 delta 协议 |
| `delta.reasoning` / `reasoning_details[type=reasoning.text].text` | `reasoning-delta` | `reasoning.summary` 也可映射为可见推理文本；`reasoning.encrypted{data}` 没有可见文本，只能作 replay 元数据保留 |
| `delta.tool_calls[i]` | `tool-call-delta{index, id, name?, argumentsDelta}` | `id`/`name` 通常只在首片出现，后续片只有 `arguments`；块 `index` 需在文本/推理块之后另行编号 |
| 最终 chunk 的 `usage` | `usage{usage}` 后接 `finish` | 满足"usage 在 finish 之前"的 adapter 契约；`reasoning_tokens` 已含在 `completion_tokens` 内 |
| `finish_reason` | `stop \| tool-calls \| max-tokens(length) \| error` | `content_filter` 在 DSH 词表里没有对应项 |
| 流中途 `error` | `finish{reason: {kind: 'error', failure{code, message}}}` | 与 DSH"在带内以 finish 结束"的第二条错误路径同型 |
| `reasoning_details` 的 `signature`/`encrypted`、`id`、`format` | `ReplayEnvelope.blocks[]` 按块对齐 | 回传原样序列的要求正是 `ReplayEnvelope` 存在的理由；不同 `format` 的回传只对同一供应方有效（推断） |

未覆盖：各供应方经 OpenRouter 后 `tool_calls` 片段的批次粒度、同一 chunk 内是否会同时出现文本与工具片段、图像/音频输出块的流式形状、`content_filter` 的触发形态。
