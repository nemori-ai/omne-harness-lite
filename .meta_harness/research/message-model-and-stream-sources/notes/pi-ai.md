# pi：`pi-ai` 的消息与流事件，`pi-agent-core` 的消息累积与工具更新

- 原始出处：`earendil-works/pi` @ `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`；`packages/ai/package.json` 版本 `0.86.1`。
  本地钉住副本 `tmp/sources/pi-3390bd9.tar.gz`（主检出根下，SHA-256 `29b35ae6…4163`），解包于 `tmp/sources/extracted/pi/`。
  下文路径都相对 pi 仓库根。
- 取得方式：一次性源码阅读（2026-09-23）。读了 `packages/ai/src/types.ts`、`api/openai-completions.ts` 的流循环与收尾、
  `api/transform-messages.ts`、`utils/{json-parse, event-stream, assistant-message-frame}.ts`、`providers/faux.ts` 头部；
  `packages/agent/src/{types.ts, agent-loop.ts, agent.ts}` 的相关段落，`packages/agent/src/harness/{messages.ts, session/types.ts}`；
  `packages/protocol/README.md`。**未运行任何测试。**
- 来源立场：作者自述（源码与类型注释）。
- 消费对象：[research.md](../research.md) 的消息类型、流语法、参数解析、流断、工具更新与耦合各条。

## 当前可消费观察

### P1 四种消息，没有消息身份

`Message = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage`（`packages/ai/src/types.ts:553`）：

| 消息 | 形状要点 | 位置 |
|---|---|---|
| `SystemMessage` | `content`、`sections`（按名替换/删除）、`toolsAdded`/`toolsRemoved`；后续 system 消息改变提示与工具集 | `types.ts:481-507` |
| `UserMessage` | `content: string \| (Text\|Image)[]` | `types.ts:509-513` |
| `AssistantMessage` | `content: (Text\|Thinking\|ToolCall)[]`，并内嵌 `api/provider/model/usage/stopReason/errorMessage/deferred…` | `types.ts:515-537` |
| `ToolResultMessage` | `role:'toolResult'`，`content: (Text\|Image)[]`，`details?`（给日志/UI）、`isError` | `types.ts:539-551` |

四种消息**都没有 id 字段**，只有 `timestamp`。`StopReason` 含 `pending | stop | length | toolUse | error | aborted | deferred`（`types.ts:419`）。

### P2 内容块：文本、思考、图、工具调用

- `TextContent{text, textSignature?}`（`types.ts:364-368`，签名注释写明是 OpenAI Responses 的元数据）；
- `ThinkingContent{thinking, thinkingSignature?, redacted?}`（`types.ts:370-378`）；
- `ImageContent{data: base64, mimeType}`——**字节内联，不是引用**（`types.ts:380-384`）；
- `ToolCall{id, name, arguments: JsonObject, thoughtSignature?, namespace?}`——**参数是已解析的对象**；`thoughtSignature` 注明 Google 专用，`namespace` 注明 OpenAI Responses 专用（`types.ts:386-394`）。

没有文件块、语音块；工具结果不能嵌思考或工具调用。

### P3 流事件：每块 start/delta/end，终止是 done 或 error

`AssistantMessageEvent`（`types.ts:652-668`）：
`start{partial}` · `text_start|text_delta|text_end` · `thinking_start|thinking_delta|thinking_end` ·
`toolcall_start|toolcall_delta|toolcall_end{toolCall}` · `done{reason, message}` · `error{reason, error: AssistantMessage}`。
每个事件都携带 `partial: AssistantMessage`，类型注释写明它是「共享的实时响应至今」，**不是事件时刻的快照**（`types.ts:645-651`）。
没有独立的 usage 事件，用量挂在最终消息上。**任何 `*_start` 都不声明填法，delta 全是追加。**

### P4 工具参数：流中每一次 delta 都解析，收尾时残缺也解析

`openai-completions.ts`：每个参数 delta 到达即 `block.arguments = parseStreamingJson(block.partialArgs)`（`:646-650`）；
收尾 `finishBlock` 再解析一次后**删除原始参数串** `partialArgs`（`:458-465`），`toolcall_end` 只交出已解析的对象（`:466-471`）。
`parseStreamingJson`：先严格解析，再「修补后解析」，再用 `partial-json` 做**残缺前缀解析**，都失败才返回 `{}`（`utils/json-parse.ts:97-124`）。
同一函数在六个 API 实现里被调用（`anthropic-messages`、`bedrock-converse-stream`、`pi-messages`、`mistral-conversations`、
`openai-responses-shared`、`openai-completions`；本轮 grep）。
`pi-agent-core` 自己在注释里承认后果：「截断消息里的工具调用可能**解析并通过校验、却悄悄不完整**」，
因此 `length` 收尾时把这些调用全部判为错误并合成错误结果（`packages/agent/src/agent-loop.ts:427-459, 233-239`）。

### P5 流的结局靠实现自觉，事件流类不强制

- 类型注释的约定：成功流先 `start` 后更新、以 `done` 结束；失败以 `error` 结束（`types.ts:636-644`）。
- `EventStream.push` 看到 `done|error` 才兑现 `result()`；`end()` 不带结果时只唤醒等待者，**`result()` 永不兑现**
  （`utils/event-stream.ts:43-70, 86-105`）。`streamAssistantResponse` 在循环结束后 `await response.result()`
  （`agent-loop.ts:416`）——**若某实现只 `end()` 不推终止事件，这里会一直挂起**（代码阅读推断，未运行）。
- `openai-completions` 自己在无 `finish_reason` 时抛错并转为 `error` 事件（`:689-697, 701-723`）。

### P6 中止与出错：部分内容留在消息里，但组装时整条跳过

- 出错或中止时，已累积的内容（含残缺解析的工具调用）留在 `output`，`stopReason` 置为 `aborted|error`，以 `error` 事件交出（`openai-completions.ts:701-723`）。
- `agent-loop` 把它当作一条完整消息推进上下文并发 `message_end`（`agent-loop.ts:399-411`），随后本轮结束（`:221-225`）。
- 请求组装 `transformMessages` 对 `stopReason` 为 `error|aborted` 的助手消息**整条跳过**，理由写明「可能有残缺内容……模型应从上一个有效状态重试」（`packages/ai/src/api/transform-messages.ts:195-203`）；
  对没有结果的孤儿工具调用插入合成结果（同文件 `:188-194, 222-232`）。

### P7 半条消息以完整消息的类型存在于上下文数组里

`streamAssistantResponse` 在 `start` 时把 `partial` 推进 `context.messages`，每次更新原位替换，结束时换成最终消息
（`agent-loop.ts:370-411`）；`Agent` 的状态里另有 `streamingMessage`（`agent.ts:561-571`）。
`partial` 的类型就是 `AssistantMessage`（`stopReason:'pending'`）。`Agent` 状态里的 `messages` 只在 `message_end` 时追加（`packages/agent/src/agent.ts:569-571`）；
harness 的 `message_end` 事件带 `entryId`（`packages/agent/src/harness/agent-harness.ts:304`），即条目在消息收尾时写入（条目形状见 P10）。

### P8 可回放的帧编码：终止结算不在帧里

`utils/assistant-message-frame.ts:4-33` 定义 `AssistantMessageFrame`（`start`、各块 start/delta/end、`toolcall_checkpoint`），
注释写明「**终止结算被有意排除，必须另行持久化**」；`reduceAssistantMessageFrames` 是纯归约（`:372`起），
测试覆盖「帧早于 start、块类型错、重复 end、索引空洞一律拒绝」「以权威 end 内容为准」
（`packages/ai/test/assistant-message-frame.test.ts:41, 563, 597`）。

### P9 工具执行中的更新：整份部分结果，瞬态，不落盘

- `AgentTool.execute(toolCallId, params, signal, onUpdate)`；`onUpdate(partialResult: AgentToolResult)`，每次交出**整份**部分结果
  （`content` + `details`），执行结束后的调用被忽略（`packages/agent/src/types.ts:382-420`）。
- 循环把每次更新发成 `tool_execution_update{toolCallId, toolName, args, partialResult}` 事件（`agent-loop.ts:745-757`；事件类型 `types.ts:462`）；
  `Agent.processEvents` 对它不改任何状态，只依次 `await` 每个监听者（`agent.ts:559-606`）。
- 执行完成后循环 `await Promise.all(updateEvents)` 才返回结果（`agent-loop.ts:760-761`）；这段在 `try` 内，
  **监听者抛错会走进 `catch` 并再次 `await` 同一组被拒的 promise**（`:763-766`）——即一个更新监听者的失败会让这次工具执行的结算失败或抛出（代码阅读推断，未运行）。
- 没有节流、合并或丢弃策略；也没有「追加 / 整体替换」的块级区分。

### P10 应用层自定义消息与会话条目

- `CustomAgentMessages` 以声明合并扩展（`packages/agent/src/types.ts:310-333`）。harness 注册了四种：
  `bashExecution{…, excludeFromContext?}`、`custom{customType, content, display: boolean, details?}`、
  `branchSummary{summary, fromId}`、`compactionSummary{summary, tokensBefore}`（`packages/agent/src/harness/messages.ts:19-61`）。
- `convertToLlm` 把 `custom`、`branchSummary`、`compactionSummary` 一律转成 `role:'user'`，后两者包上 `<summary>` 前后缀；
  `excludeFromContext` 的 `bashExecution` 不发（`messages.ts:124-169`）。`display` 只影响呈现，不影响是否发给模型。
- `ToolResultMessage.details` 不进请求：`openai-completions` 只取 `content`（`packages/ai/src/api/openai-completions.ts:1396-1422`）。
- 会话条目：`Entry = MessageEntry{message} | CompactionEntry{summary, retainedTail: AgentMessage[], tokensBefore…} | BranchSummaryEntry | CustomEntry`，
  每条 `{id, parentId, seq, timestamp}`（`packages/agent/src/harness/session/types.ts:16-64`）。压缩条目**携带保留尾部的消息副本**，不是块名单。

### P11 图给不能看图的模型：出门时换占位

`transformMessages` 里 `downgradeUnsupportedImages`：模型 `input` 不含 `image` 时，把 user 与 toolResult 里的图换成固定占位文本（`transform-messages.ts:12-57`）。
与 DSH 一样是请求时派生，块上不留文本。

### P12 可测零件

- `providers/faux.ts`：可注册的假 provider，按脚本逐段吐出 `AssistantMessage`，块内容由 `fauxText/fauxThinking/fauxToolCall` 构造（`:41-100`，`createFauxCore` `:436`）。
- `agentLoop` 以参数注入 `streamFunction`（`agent-loop.ts:339-365`），`convertToLlm` 是纯函数；`reduceAssistantMessageFrames` 纯归约。
- `packages/protocol` 是路由信封与 CBOR 分帧，载荷不透明（`packages/protocol/README.md` 开头三段），**不定义任何消息或流事件类型**。

## 局限

- 只读了 `openai-completions` 一个 API 实现的流循环；其余五个实现只 grep 到调用了同一解析函数，没逐行读它们的中止与收尾。
- `packages/agent/src/harness/` 的地位（现行还是规格）本轮未核对；同代调研
  [agent-harness-session-design](../../agent-harness-session-design/README.md) 记过「新一代 `AgentHarness` 是规格不是现状」，引用 P10 的会话条目时须带这条限定。
- DSH 与 minimal-runtime 依赖的是 0.85.1，与此处 0.86.1 的差异未核对。
