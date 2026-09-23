# DSH `dsh-llm`：消息、内容块与流协议的选择性观察

- 原始出处：`deepseek-ai/deepseek-harness` @ `c291e7961a515f6d7af9304e7fd1d257929aef26`（`0.1.5-rc.2`）。
  本地钉住副本 `tmp/sources/dsh-c291e79.tar.gz`（主检出根下，SHA-256 `f08cfc86…0860`，见 `tmp/sources/SHA256SUMS`），
  解包于 `tmp/sources/extracted/dsh/`。下文路径都相对 DSH 仓库根。
- 取得方式：一次性源码阅读（2026-09-23）；读了 `packages/llm/llm/src/` 全部非生成文件、`tests/` 的
  `assembler`/`assistant-stream`/`properties` 三份、`packages/llm/llm-pi-ai/src/stream.ts`、
  `packages/core/agent-loop/src/assistant-stream.ts` 与 `tests/mock-adapter.ts`、`packages/core/tools/src/index.ts` 的执行上下文，
  以及 `.agents/notes/` 下与消息/流相关的七份决策注记。**未运行任何测试。**
- 来源立场：作者自述（源码、README、决策注记）。短板来自源码本身与作者自己的 rejected/archived 注记。
- 消费对象：[research.md](../research.md) 的消息类型、流语法、流断、工具帧、可测性与耦合各条。

## 当前可消费观察

### D1 消息：一个带身份的不可变值，角色只有三种

- `Message = { id: MessageId, role: 'system'|'user'|'assistant', content: ContentBlock[], source: MessageSource }`
  （`packages/llm/llm/src/message.ts:130-140`）。身份在创建时铸出并深冻结（`message.ts:190-197`）；
  「只改表示不改语义」的操作保留原 id，新语义消息铸新 id（注记 `.agents/notes/implemented/architecture/2026-07-28-identified-immutable-message-values.md:15,25`）。
- **工具结果不是一种角色**：`ToolResultMessage` 是 `role:'user'` + 唯一一个 `tool-result` 块 + `source:{kind:'tool', callId}`
  （`message.ts:163-168`，构造 `message.ts:258-268`）。
- **系统中途插入的内容也不是一种角色**：`MessageSourceMap` 只有 `user | plugin | model | tool` 四种来源（`message.ts:102-107`）；
  注入上下文是 `role:'user'` + `source:{kind:'plugin', plugin, form?}`，`form ∈ instructions|catalog|snapshot|notice|relay|recall`
  （`message.ts:50-96`）。其中 `snapshot` 的定义是「同一生产者后一份取代前一份」（`message.ts:55-56`），
  `notice` 必须带一行摘要（`message.ts:90-94`，上限 120 字符 `message.ts:114`）。
  作者注记：注入上下文「现在一律投影为不带包装的普通 user 内容」（`2026-06-11-content-block-vocabulary.md:15`）。
- **消息级没有「给人看 / 给模型看」的字段，块上也没有**（`types.ts:53-124` 全部块类型均无此类字段）。

### D2 内容块：六类，合并可扩展

`ContentBlockMap = text | reasoning | image | file | tool-call | tool-result`（`types.ts:112-119`）。

| 块 | 形状 | 备注 |
|---|---|---|
| `text` | `{text}` | `types.ts:54-57` |
| `reasoning` | `{text}` | 无签名字段；供应商私有回放数据放在 `ReplayEnvelope.blocks`（`types.ts:368-380`） |
| `image` | `{attachment: ImageAttachmentRef}` | 引用而非字节（`types.ts:71-75`）；注释说当前生产 adapter 只接受 user 侧图 |
| `file` | `{attachment: FileAttachmentRef}` | **任何 adapter 都不原生发送**：请求组装时一律投影成句柄文本（`types.ts:77-88`；`content.ts:154-205`；`index.ts:1043-1047`） |
| `tool-call` | `{id, name, arguments: string}` | **参数是模型产出的原始 JSON 字符串，不解析**（`types.ts:90-98`） |
| `tool-result` | `{toolCallId, content: ContentBlock[], isError?}` | 结果自身是一串块，可嵌图（`types.ts:100-106`） |

没有语音块；模态词表只有 `text | image`（`types.ts:203-210`）。

### D3 「图不能给纯文本模型」在出门那一刻处理，不落盘

`LlmRuntime.adapterStream` 在把请求交给 adapter 前：文件无条件换成句柄文本；若模型声明的 `inputModalities`
不含 `image`，则把全部图换成占位文本 `[image omitted because this model accepts text only; …]`
（`index.ts:1043-1052`；`content.ts:75-78, 302-308`）。这是**每次请求重算的派生投影**，块上不留任何文本字段。

### D4 流协议：`StreamChunk` 七种，块索引关联

```text
block-start{index, blockType} | text-delta | reasoning-delta | tool-call-delta{id, name?, argumentsDelta}
| block-end{index, block}     | usage{usage} | finish{reason, replayState?}
```

（`types.ts:390-402`；注释 `types.ts:382-389`：`block-end` 携带装配好的块、usage 在 finish 之前且只一次、工具参数保持原始字符串。）
`FinishReason = stop | tool-calls | max-tokens | aborted{failure} | error{failure}`，合并可扩展（`types.ts:130-136`）。
**`block-start` 只带 `blockType`，没有「这一块怎么填」的声明；所有 delta 都是追加语义。**

### D5 装配器是宽容的，语法由一个可选的不变量伴件把关

- `BlockAssembler`（`assembler.ts:38-208`）：按首次出现的 index 定序；`block-end` 的块是**权威终值，先到先得**，
  之后的迟到 delta 与重复关闭被忽略（`assembler.ts:77-84`）；缺 start/end 的 delta 也能装配（`assembler.ts:34-36, 98-106`）；
  `usage` 与 `finish` 都是**后写覆盖**（`assembler.ts:85-93`）；**没有 finish 时按 `stop` 处理**（`assembler.ts:186-189`）。
- `max-tokens` 收尾时，**装配结果直接丢掉全部工具调用块**，并同步裁剪回放元数据（`assembler.ts:131-150`）。
- `interruptedBlocks()`：只保留非空白的 text/reasoning，**工具调用不论开合一律不要**（`assembler.ts:162-179`）。
- 不变量伴件 `llm-invariant`（`invariant.ts:36-84`）挂在 `llm/stream` 瀑布最前：delta 必须落在同类型已开的块上、
  `block-end` 必须关一个已开的同类块、**`usage` 至多一次**、finish 之后不得再有 chunk、**流必须以 finish 结束**、
  带着未关块结束只允许是 `error`/`aborted`。它是通过 `dsh-invariants` 服务注册的伴件，不是装配器本身的行为。
- **没有任何一处校验「delta 拼起来 == block-end 给的块」**：装配器以 `block-end` 为准，伴件只查类型与开合。

### D6 失败统一成终止 chunk

`LlmRuntime` 把 adapter 选择、派发、迭代器构造与 `next()` 抛出的异常归一为一条 `finish{error|aborted}`
（`index.ts:1061, 1076, 1124-1131`；`adapter-failure.ts:16-28`）；中间件、消费者自己的异常仍然抛出
（注记 `2026-07-29-terminal-llm-stream-failures.md:17-19`）。**adapter 迭代器正常结束却没给 finish 时，运行时不补**
（`index.ts:1079-1082`）——这一情形只有 D5 的不变量伴件会报。

### D7 紧凑流记录：把「怎么到的」无损存下来

`AssistantStreamAccumulator` 把同块相邻 delta 压成 `{time0, dt[], texts[]}` 一条 run，其余 chunk 原样带时间戳
（`assistant-stream.ts:20-44, 100-194`）；`expandAssistantStream()` 在持久边界严格校验并**精确恢复每个 delta 边界与时间**
（`assistant-stream.ts:202-232`）；`assembleAssistantStream()` 不展开地喂给装配器（`assistant-stream.ts:425-454`）。
测试 `tests/assistant-stream.spec.ts:452-486` 断言「紧凑喂入 == 逐条展开喂入」的块、usage、finish、回放状态一致。

### D8 这些零件在 agent-loop 里被接成「一次尝试一份结算」

`packages/core/agent-loop/src/assistant-stream.ts:18-124` 的 `AssistantStreamAttempt` 同时驱动累加器、装配器与进程内瞬态帧，
`settle(eventType, append)` 以回调方式提交 `assistant/message` 或 `assistant/attempt`（`:78-97`），失败则 `abandon()`（`:100-109`）。
取消时：有可见前缀 → `assistant/message{interrupted:true}`，否则 → `assistant/attempt`（`packages/core/agent-loop/src/agent.ts:403-429`）。
作者**明确拒绝**过「追加一条给模型看的中断消息」（`2026-08-10-cancelled-stream-prefix-finalize.md:29`），理由是要另立来源类型、投影规则、UI 与本地化；
事实由持久的 `turn/end{aborted}` 保留。

### D9 工具执行没有「执行中往外说话」的通道

`ToolRunContext` 在执行对象之上只多两个动作：`deferContext(UserMessage)` 与 `concludeTurn()`（`packages/core/tools/src/index.ts:397-414`）。
UI 侧的 `presentCall`/`presentResult` 是由参数与最终结果**纯函数**算出的卡片意图，「完成视图替换待定视图」（`docs/subsystems/tools.md:461-464`）；
**没有工具在执行过程中自主推送的帧或进度事件**。唯一例外是 workflow 工具自带的 `phase()`/`log()`，属该工具私有词汇（`docs/tool-catalog.md:2139`）。

### D10 调 pi-ai 的那条路由会把原始参数串换成重新序列化的结果

`packages/llm/llm-pi-ai/src/stream.ts:142-234` 把 pi 的事件逐一翻成 `StreamChunk`：`toolcall_end` 的 `block-end` 用
`JSON.stringify(event.toolCall.arguments)`（`:202-204`）——即 pi 已经解析（可能是修补/残缺解析）过的对象的重新序列化；
pi 流未给 `done`/`error` 就结束时抛 `STREAM_CLOSED`（`:233`）。依赖声明 `@earendil-works/pi-ai ^0.85.1`（`packages/llm/llm-pi-ai/package.json`）。

### D11 可测零件

- 纯零件（不依赖 Cordis）：`BlockAssembler`、`AssistantStreamAccumulator`/`expandAssistantStream`/`assembleAssistantStream`、`createMessage` 族。
- 脚本化输入：`packages/core/agent-loop/tests/mock-adapter.ts:4-30` 提供 `textResponse`/`maxTokensResponse`/`toolCallResponse` 等 chunk 数组构造器，
  但它是 `LlmAdapter` 子类，要经 Cordis 的 `LlmRuntime` 与 agent-loop 才能落成会话事件。
- 性质测试：`tests/properties.spec.ts:60-104`（fast-check）只断言分块数上界、`blocks()` 幂等、块标签合法、finish 后写覆盖——
  **没有「任意切分方式下装配结果相同」这一条**。

### D12 与宿主的耦合

`types.ts` 在类型文件里就扩了 Cordis 的 `Events`（`types.ts:12-25`）与 `dsh-typert-protocol` 的 `RemoteErrorDetailsMap`（`types.ts:274-282`），
图/文件块依赖 `@deepseek-ai/dsh-attachment`（`types.ts:8`）；`LlmRuntime` 是 Cordis 服务，流式调用走 `llm/stream` 瀑布（`index.ts:54-75`），
文件句柄路径靠结构化读取 `ctx.get('fs')`（`index.ts:1002`）。`GenerateOptions.purpose` 只有 `compaction | session-title`（`types.ts:458`）。

## 局限

- 只读了单一 commit 的快照，没看 git 史，也没运行测试；「运行起来会怎样」均为代码阅读。
- 没读 `dsh-llm-deepseek` 的 SSE 翻译实现本体，只读了与之相关的注记 `2026-09-01-streamed-tool-call-identity.md`（archived）：
  作者记下「一条始终不带身份的流仍会装配出空身份」这条路径**未处理**（该注记 Consequences 段）。
- 未覆盖的原文细节不因省略而成为反面结论。
