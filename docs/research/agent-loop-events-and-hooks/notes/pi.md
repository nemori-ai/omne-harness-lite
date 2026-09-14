<!-- 分系统核对笔记：pi。2026-09-14 由只读调研 subagent 按固定提交/版本产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# pi（pi-mono）Agent Loop、事件体系与扩展机制调研笔记

## 0. 调研对象与证据基线

| 项目 | 值 |
|---|---|
| 仓库 | `https://github.com/badlogic/pi-mono`（clone 成功；仓库内文档已改为指向 `github.com/earendil-works/pi`，作者 2026-04-08 博文说明仓库迁移到 `earendil-works/pi`，包名从 `@mariozechner/*` 改名） |
| 本地克隆 | 仓库 Git 忽略的临时目录（`--depth 1`，可重新生成） |
| 提交 | `ceea48f5d5d12fd7915dfefba2835ccd55f23bb9`（2026-09-14 10:28:54 +0200），下文引用写作 `路径@ceea48f` |
| 版本 | `packages/coding-agent/package.json` = `0.85.1`；`packages/agent`、`packages/ai` 同为 `0.85.1` |
| 包名 | `@earendil-works/pi-coding-agent`、`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`；另有 `pi-tui`、`pi-protocol`、`pi-client`、`pi-server`、`chord`、`pi-telemetry`、`pi-evals`、`session-backends` |
| 博客 | `https://mariozechner.at/posts/2025-11-30-pi-coding-agent/`（2025-11-30，设计意图）；`https://mariozechner.at/posts/2026-04-08-ive-sold-out/`（2026-04-08，组织变更，无架构论述）；`2025-11-02-what-if-you-dont-need-mcp/`（2025-11-02，未展开） |

标注约定：无标注 = 源码/文档直接陈述；「推断」= 仅从源码结构推断；「未覆盖」= 本次未读到。

**重要发现（影响全文结构）**：当前提交的 `packages/agent` 内并存两套循环实现：

1. **经典 `Agent` / `agentLoop`**（`packages/agent/src/agent-loop.ts`、`agent.ts`），生产 `coding-agent` 的 `AgentSession` 仍构建在它之上（`packages/coding-agent/src/core/sdk.ts:306@ceea48f` `new Agent({...})`；`agent-session.ts:398` `this.agent.subscribe(...)`）。
2. **新的 durable `AgentHarness`**（`packages/agent/src/harness/`，0.84.0 从 experimental 提升为默认导出，见 `packages/agent/CHANGELOG.md@ceea48f`），带 lane、操作状态机、显式 `hooks`/`events` 分离；目前只被 `packages/coding-agent/src/experimental/{session-worker.ts,mini/,services/}` 与 evals 使用（`grep` 结果），`harness.md` 明确 `src/agent-loop.ts` 是「独立的兼容实现，不建立在这些块之上」（`packages/agent/docs/harness.md:1210@ceea48f`）。

本文主体按任务要求覆盖第 1 套（生产路径），在 §2.9/§3.3/§4.4 单列第 2 套。

---

## 1. 总体架构定位

### 1.1 三层关系

| 层 | 包 | 职责 | 关键类型/入口 |
|---|---|---|---|
| 统一模型接口 | `@earendil-works/pi-ai`（`packages/ai/src`） | Provider/模型目录、`streamSimple` 流式请求、`AssistantMessageEvent` 流事件、`Message`/`Usage` 基础类型、`validateToolArguments`、`EventStream` | `createModels()`、`createProvider()`（`packages/ai/src/models.ts@ceea48f`）；`AssistantMessageEvent` 联合（`packages/ai/src/types.ts:546@ceea48f`：`start / text_start / text_delta / text_end / thinking_start / thinking_delta / thinking_end / toolcall_start / toolcall_delta / toolcall_end / done / error`） |
| 循环 | `@earendil-works/pi-agent-core`（`packages/agent/src`） | `agentLoop`/`agentLoopContinue` 低层循环；`Agent` 有状态包装（transcript、事件订阅、工具执行、steer/followUp 队列）；`AgentMessage`＝LLM 消息 ∪ 自定义消息；新 `AgentHarness` | `packages/agent/src/agent-loop.ts`、`agent.ts`、`types.ts`、`harness/agent-harness.ts@ceea48f` |
| 会话/扩展/TUI | `@earendil-works/pi-coding-agent`（`packages/coding-agent/src`） | `AgentSession`（会话持久化、扩展派发、自动压缩、自动重试、队列）、`SessionManager`（JSONL 树）、扩展系统（loader/runner/types）、系统提示、技能/模板/主题资源、interactive/rpc/json/print 四种模式 | `core/agent-session.ts`、`core/session-manager.ts`、`core/extensions/*`、`core/sdk.ts`、`modes/*@ceea48f` |

`README` 的消息流图：`AgentMessage[] → transformContext()（可选） → AgentMessage[] → convertToLlm()（必需） → Message[] → LLM`（`packages/agent/README.md@ceea48f` "Message Flow"）。`StreamFn` 契约：不得抛错，失败必须编码为流事件与 `stopReason: "error" | "aborted"` 的最终 `AssistantMessage`（`packages/agent/src/types.ts:17-30@ceea48f`）。默认 `streamFn` 由宿主用 `setDefaultStreamFn` 注入，`pi-agent-core` 不依赖 provider 目录（`packages/agent/src/stream-fn.ts@ceea48f`）。

### 1.2 一次用户输入到回复的完整路径（生产路径）

| 步骤 | 位置（@ceea48f） | 说明 |
|---|---|---|
| 1 | `modes/interactive/interactive-mode.ts:1135,3140,4146` | TUI 把编辑器文本交给 `session.prompt(text)`；流式中按用户选择传 `{streamingBehavior: "steer" \| "followUp"}` |
| 2 | `core/agent-session.ts:1175 prompt()` | 若以 `/` 开头且 `expandPromptTemplates`，先查扩展命令 `_tryExecuteExtensionCommand`，命中则执行并返回（流式中也可执行） |
| 3 | 同上 | 压缩进行中则抛错「Cannot submit a prompt while compaction is in progress」 |
| 4 | `_runInputHandlers` → `runner.emitInput` | 触发扩展 `input` 事件（在技能/模板展开之前）；`handled` 则终止；`transform` 则替换文本/图片 |
| 5 | `_expandSkillCommand` / `expandPromptTemplate` | 展开 `/skill:name` 与 `/template args` |
| 6 | 同上 | 若 `isStreaming`：必须有 `streamingBehavior`，否则抛错；有则 `_queueSteer`/`_queueFollowUp` 入队并返回 |
| 7 | 同上 | `_flushPendingBashMessages()`、`_flushPendingCustomMessages()`；校验模型与鉴权 |
| 8 | `_checkCompaction(lastAssistant, false)` | 发送前用上一条 assistant 消息检查是否需压缩（含被中断的消息） |
| 9 | 同上 | 构造 `user` 消息，追加 `_pendingNextTurnMessages`（`deliverAs: "nextTurn"` 的自定义消息） |
| 10 | `runner.emitBeforeAgentStart` | 触发 `before_agent_start`：扩展可返回 `message`（转成 `role: "custom"` 消息一并发送）与 `systemPrompt`（链式覆盖，本轮生效；`_systemPromptOverride`） |
| 11 | `_runAgentPrompt(messages)` (`agent-session.ts:1080`) | `await this.agent.prompt(messages)`；之后 `while (await _handlePostAgentRun()) await agent.continue()`；`finally` 清除 systemPrompt 覆盖、flush pending、`_emitAgentSettled()` |
| 12 | `packages/agent/src/agent.ts prompt()` | 已有 `activeRun` 则抛错；`runWithLifecycle` 建 `AbortController`，调用 `runAgentLoop` |
| 13 | `agent-loop.ts runAgentLoop/runLoop` | 见 §2 |
| 14 | `agent.ts processEvents` | 每个事件先归约内部状态（`streamingMessage`、`messages.push`、`pendingToolCalls`、`errorMessage`），再按注册顺序 `await` 所有 `subscribe` 监听器 |
| 15 | `agent-session.ts:639 _handleAgentEvent` | 顺序：①从队列文本中移除已注入的 user 消息并 `queue_update`；②`_emitExtensionEvent`（转扩展事件）；③通知 `AgentSession.subscribe` 监听器（`agent_end` 附 `willRetry`）；④`message_end` 时持久化到 `SessionManager`；⑤`turn_end` 时 flush pending custom messages |
| 16 | `_handlePostAgentRun` | 依次：可重试错误→`_prepareRetry`（退避后 `continue`）；`_checkCompaction`（overflow/threshold）；`agent.hasQueuedMessages()`（`agent_end` 处理器入队的消息需要再 continue） |
| 17 | `_emitAgentSettled` | 扩展事件 `agent_settled` + 会话事件 `agent_settled`，解除 `waitForIdle` |

---

## 2. Agent Loop

### 2.1 `agentLoop` 步骤（`packages/agent/src/agent-loop.ts@ceea48f`）

```
runAgentLoop(prompts, context, config, emit, signal, streamFn)
  newMessages = [...prompts]; currentContext.messages = [...context.messages, ...prompts]
  emit agent_start; emit turn_start
  for prompt: emit message_start, message_end            # 用户提示也走 message 生命周期
  runLoop(...)
runLoop:
  pendingMessages = await getSteeringMessages()            # 启动时先取一次 steering（用户可能在等待时已输入）
  while (true):                                            # 外层：follow-up 驱动
    hasMoreToolCalls = true
    while (hasMoreToolCalls || pendingMessages.length > 0): # 内层：工具调用 / steering 驱动
      if lastCompletedTurn:                                #（非首轮）
        snap = await prepareNextTurn(lastCompletedTurn)    # 可替换 context / model / thinkingLevel
        if pendingMessages.length == 0: pendingMessages = await getSteeringMessages()  # 准备阶段可能很长（如压缩）
        emit turn_start
      for m in pendingMessages: emit message_start/end; push 到 context 与 newMessages
      message = await streamAssistantResponse(...)        # 见 2.2
      newMessages.push(message)
      if stopReason in {error, aborted}: emit turn_end(toolResults=[]); emit agent_end; return
      toolCalls = message.content.filter(toolCall)
      if toolCalls:
        batch = stopReason == "length" ? failToolCallsFromTruncatedMessage : executeToolCalls
        toolResults = batch.messages; hasMoreToolCalls = !batch.terminate
        push toolResults 到 context 与 newMessages
      emit turn_end(message, toolResults)
      lastCompletedTurn = {message, toolResults, context, newMessages}
      if await shouldStopAfterTurn(lastCompletedTurn): emit agent_end; return
      pendingMessages = await getSteeringMessages()
    followUps = await getFollowUpMessages()
    if followUps: pendingMessages = followUps; continue
    break
  emit agent_end(newMessages)
```

`agentLoopContinue` 要求 `context.messages` 非空且末条不是 `assistant`，用于错误重试；它不注入新消息，`newMessages` 从空开始（`agent-loop.ts:60-85,117-140@ceea48f`）。

### 2.2 模型流式调用 `streamAssistantResponse`（`agent-loop.ts:246-330@ceea48f`）

1. `messages = transformContext ? await transformContext(context.messages, signal) : context.messages`
2. `llmMessages = await convertToLlm(messages)`
3. `llmContext = { systemPrompt: context.systemPrompt, messages: llmMessages, tools: context.tools }`
4. `apiKey = (getApiKey ? await getApiKey(model.provider) : undefined) || config.apiKey`（应对过期 OAuth token）
5. `response = await streamFn(model, llmContext, {...config, apiKey, signal})`
6. 遍历 `AssistantMessageEvent`：`start` → 把 partial 推入 `context.messages`，`emit message_start`；`text_*/thinking_*/toolcall_*` → 替换 `context.messages` 末项，`emit message_update{assistantMessageEvent, message}`；`done`/`error` → `finalMessage = await response.result()`，替换末项，`emit message_end`，返回。若从未收到 `start`，则在结束时补发 `message_start`。

注意：低层循环直接**原地修改** `context.messages`（`Agent` 类调用时传入的是 `state.messages.slice()` 快照，`agent.ts:createContextSnapshot@ceea48f`，`Agent.state.messages` 由 `processEvents` 的 `message_end` 分支追加）。

### 2.3 工具调用与执行

| 阶段 | 函数（`agent-loop.ts@ceea48f`） | 行为 |
|---|---|---|
| 选择模式 | `executeToolCalls` | `config.toolExecution === "sequential"` 或批内任一工具 `executionMode === "sequential"` → 顺序；否则并行（默认 `"parallel"`，`agent.ts` 构造默认） |
| 预检 | `prepareToolCall` | 找不到工具 → 立即错误结果；`tool.prepareArguments`（兼容 shim）→ `validateToolArguments` → `beforeToolCall(ctx, signal)`；返回 `{block:true, reason?, terminate?}` → 错误结果（文本 = reason 或 "Tool execution was blocked"）；`signal.aborted` → "Operation aborted"；任何异常 → 错误结果 |
| 执行 | `executePreparedToolCall` | `tool.execute(id, args, signal, onUpdate)`；`onUpdate` 触发 `tool_execution_update`（promise 结束后忽略后续更新，并 `await` 所有更新事件）；抛错 → `isError: true` 的错误结果（README：工具应 throw 而非把错误写在 content） |
| 终结 | `finalizeExecutedToolCall` | `afterToolCall` 返回字段级覆盖 `content/details/usage/terminate/isError`（无深合并）；hook 抛错 → 错误结果 |
| 输出 | `emitToolExecutionEnd` → `createToolResultMessage` → `emitToolResultMessage` | `tool_execution_end{result,isError}`；`toolResult` 消息含 `addedToolNames`（动态工具）；`message_start/end` |
| 截断 | `failToolCallsFromTruncatedMessage` | `stopReason === "length"` 时所有工具调用不执行，逐个发 `tool_execution_start` + 错误 `tool_execution_end` + 错误 toolResult |

**并行细节**（`executeToolCallsParallel`）：预检按 assistant 源顺序逐个进行并逐个 `emit tool_execution_start`；立即结果（未找到/被阻断/异常）当场 `tool_execution_end`；其余包成闭包，`Promise.all` 并发执行，`tool_execution_end` 按**完成顺序**发；全部完成后再按**源顺序**发 toolResult 的 `message_start/end`。README 明确「completion events follow tool completion order, but persisted toolResult messages still follow assistant source order」。

**提前终止**：`shouldTerminateToolBatch` = 批非空且**每个** finalized 结果 `terminate === true`；混合批照常继续（`agent-loop.ts:shouldTerminateToolBatch@ceea48f`，README "Tools"）。`terminate` 可来自 `execute()` 返回、被阻断的 `beforeToolCall`、`afterToolCall`。运行时提示，不写入 transcript。

### 2.4 终止条件

| 条件 | 位置 |
|---|---|
| assistant `stopReason ∈ {error, aborted}` → `turn_end` + `agent_end` | `runLoop` |
| 无工具调用（或批全部 `terminate`）且无 steering、无 follow-up | `runLoop` 内外层退出 |
| `shouldStopAfterTurn` 返回 true → `agent_end`（不轮询队列、不中断流、不取消工具） | `runLoop`；README 说明 |
| 无「max steps」类旋钮 | 博文 2025-11-30："The agent loop doesn't let you specify max steps or similar knobs … I never found a use case for that" |

### 2.5 错误处理

| 层 | 机制 |
|---|---|
| `StreamFn` | 契约要求不抛错，失败编码进流（`types.ts:17-30@ceea48f`） |
| `convertToLlm` / `transformContext` / `shouldStopAfterTurn` / `getSteeringMessages` 等 | 契约「must not throw or reject」（`types.ts` 注释）；抛错会「interrupt the low-level agent loop without producing a normal event sequence」 |
| `Agent.runWithLifecycle` | 捕获 executor 异常 → `handleRunFailure` 合成 `stopReason: aborted \| error` 的空 assistant 消息，依次发 `message_start/end`、`turn_end`、`agent_end`（`agent.ts:runWithLifecycle/handleRunFailure@ceea48f`） |
| 工具 | 抛错 → `isError: true` 工具结果反馈给模型 |
| `AgentSession` 自动重试 | `_handlePostAgentRun` → `_isRetryableError`（上下文溢出不算）→ `_prepareRetry`：`_retryAttempt++`，超过 `maxRetries` 停止；发 `auto_retry_start{attempt,maxAttempts,delayMs}`；从 `agent.state.messages` 移除末尾 error assistant（会话历史保留）；可中止的 `sleep(retryDelayMs)`；返回 true → `agent.continue()`；成功的 assistant `message_end` 重置计数并发 `auto_retry_end{success:true}`（`agent-session.ts:2876-2990,690-705@ceea48f`） |
| 扩展处理器异常 | `runner.emit` 捕获并 `emitError` → `extension_error` 事件；例外：`tool_call` 处理器异常不被 runner 捕获，经 `agent.beforeToolCall` 抛出，被 `prepareToolCall` 的 `catch` 转成错误工具结果（**推断**：等效于阻断该工具） |

### 2.6 Abort / 中断

- `Agent.abort()` → `activeRun.abortController.abort()`；同一 `signal` 传给 `streamFn`、`tool.execute`、`beforeToolCall/afterToolCall`、`transformContext`、订阅监听器（`agent.ts@ceea48f`）。
- 并行工具：预检循环在 `signal.aborted` 后 `break`；已排队闭包在执行前检查 `signal.aborted` → "Operation aborted"；顺序模式每个工具后检查并 `break`（`agent-loop.ts@ceea48f`）。
- `AgentSession.abort()`：`abortRetry(); abortCompaction(); abortBranchSummary(); agent.abort(); await waitForIdle()`（`agent-session.ts:1640@ceea48f`）。
- 手动 `/compact` 先 `await this.abort()`，且「never retries or continues the interrupted agent turn」（`agent-session.ts:1967@ceea48f`）。
- `Agent.waitForIdle()` 在 `agent_end` 的所有 awaited 监听器完成后才 resolve；`state.isStreaming` 同样保持到那时（README "Event Types"）。

### 2.7 Steering 与 follow-up（循环中插入消息的两种模式）

| 维度 | Steering | Follow-up |
|---|---|---|
| 入队 API | `Agent.steer(msg)`；`AgentSession.steer(text, images)`；`prompt(text,{streamingBehavior:"steer"})`；`pi.sendMessage(...,{deliverAs:"steer"})`（默认）；`pi.sendUserMessage(...,{deliverAs:"steer"})` | `Agent.followUp(msg)`；`AgentSession.followUp`；`streamingBehavior:"followUp"`；`deliverAs:"followUp"` |
| 出队时机 | 循环开始时；每个 `turn_end` 且 `shouldStopAfterTurn` 未终止后；`prepareNextTurn` 后若为空再取一次（`agent-loop.ts:runLoop@ceea48f`） | 仅当内层循环结束（无工具调用、无 steering）时 |
| 语义 | 当前 assistant 的工具调用**不跳过**，全部执行完后注入，再进入下一轮 LLM 调用 | 等 agent 本来要停止时注入并再跑一轮 |
| 队列模式 | `steeringMode: "all" \| "one-at-a-time"`；`Agent` 默认 `"one-at-a-time"`（`agent.ts` 构造）；coding-agent 从 settings 读取（`sdk.ts:367@ceea48f`） | `followUpMode` 同上 |
| `continue()` 时末条为 assistant | 先 drain steering（跳过首次 steering 轮询），否则 drain follow-up，否则抛错（`agent.ts:continue@ceea48f`） | |
| 第三种：`nextTurn` | `pi.sendMessage(...,{deliverAs:"nextTurn"})` → `_pendingNextTurnMessages`，随下一次用户 `prompt()` 一起发送，不触发任何事情（`agent-session.ts:sendCustomMessage@ceea48f`） | |
| 流式中 `triggerTurn:false` 的自定义消息 | 进入 `_pendingCustomMessages`，`turn_end` 时 flush（避免落在 toolCall 与 toolResult 之间）| |

`AgentSession` 用 `_steeringMessages/_followUpMessages` 文本副本追踪队列以发 `queue_update`，在 `message_start(user)` 时按文本匹配移除（`agent-session.ts:639-660@ceea48f`）。扩展命令不能入队（`_throwIfExtensionCommand`）。

### 2.8 上下文压缩（compaction）

`pi-agent-core` 的 `agentLoop` 本身**没有内建压缩**，只提供 `transformContext`、`shouldStopAfterTurn`、`prepareNextTurn` 三个切点（README 示例用 `shouldStopAfterTurn` 触发压缩；同时 `packages/agent/src/harness/compaction/compaction.ts` 导出 `prepareCompaction/compact/shouldCompact/estimateContextTokens` 等纯函数，`index.ts@ceea48f`）。coding-agent 的压缩：

| 触发 | 位置（`agent-session.ts@ceea48f`） | 行为 |
|---|---|---|
| 轮间阈值（in-run） | `_installAgentNextTurnRefresh` → `prepareNextTurnWithContext` → `_compactBeforeNextAssistantResponse`：`shouldCompact(estimateContextTokens(context.messages).tokens, contextWindow, settings)` → `_runAutoCompaction("threshold", false)` → 返回 `{...context, messages: agent.state.messages.slice()}`；同时刷新 systemPrompt/tools/model/thinkingLevel | 文档：「Pi checks this threshold after tools finish … before starting the next assistant response … compacts inside the same agent run」（`docs/compaction.md@ceea48f`） |
| 运行后 | `_handlePostAgentRun` → `_checkCompaction(msg)` | ①溢出（`isContextOverflow` 或 `isRecoverableLength`，且同模型）：若 `stopReason !== "stop"` 则移除末尾 assistant、`_runAutoCompaction("overflow", willRetry=true)` 后 `agent.continue()`，仅尝试一次（`_overflowRecoveryAttempted`）；若已完成则压缩但不重试；②阈值：按 usage 或估算 token `shouldCompact` → `_runAutoCompaction("threshold", false)`；早于最新 compaction 条目的 assistant 消息跳过 |
| 发送前 | `prompt()` 中 `_checkCompaction(lastAssistant, false)` | 含被中断消息 |
| 手动 | `compact(customInstructions)`（`/compact`、RPC、`ctx.compact()`） | 先 abort agent |
| 阈值公式 | `contextTokens > contextWindow - reserveTokens`；默认 `reserveTokens=16384`、`keepRecentTokens=20000`；支持 `compaction.modelOverrides` | `docs/compaction.md@ceea48f` |
| 算法 | `prepareCompaction(pathEntries, settings)`：从最新向前累计到 `keepRecentTokens` 找切点（合法切点：user/assistant/bashExecution/custom；不在 toolResult 切）；单轮超预算则「split turn」生成两段摘要合并；结构化 Markdown 摘要 + `<read-files>/<modified-files>` 累计文件追踪 | `docs/compaction.md`、`core/compaction/compaction.ts@ceea48f` |
| 自定义 | `session_before_compact` 返回 `{cancel:true}` 或 `{compaction:{summary, firstKeptEntryId, tokensBefore, usage?, details?}}`；成功后 `session_compact{compactionEntry, fromExtension, reason, willRetry}`；失败/中止 `session_compact_failed` | `_runAutoCompaction@ceea48f`、`docs/extensions.md` |
| 应用结果 | `sessionManager.appendCompaction(...)` → `buildSessionContext()` → `agent.state.messages = sessionContext.messages`；`willRetry` 时再移除末尾 error/length assistant 后返回 true | `agent-session.ts:2385-2430@ceea48f` |
| 会话事件 | `compaction_start{reason}` / `compaction_end{reason,result?,aborted,willRetry,errorMessage?}`；摘要请求的瞬态错误走 `summarization_retry_*` | 同上 |

### 2.9 子 agent

- **不内建**。博文 2025-11-30："pi does not have a dedicated sub-agent tool"，批评 Claude Code 子代理是 "a black box within a black box"，主张通过 bash 生成 pi 进程以获得可观测性。
- 示例扩展 `packages/coding-agent/examples/extensions/subagent/@ceea48f`：注册工具，`spawn` 子进程 `pi --mode json -p --no-session [--model][--thinking][--tools a,b][--append-system-prompt <tmp>] "Task: ..."`（`index.ts:300-346`），解析 JSON 事件流做流式渲染；三种模式 单个 `{agent, task}` / 并行 `{tasks:[...]}`（最多 8 个、4 并发）/ 链式 `{chain:[...]}`（`{previous}` 占位）；agent 定义为带 frontmatter（`name/description/tools/model`）的 Markdown，位于 `~/.pi/agent/agents/*.md`（默认仅用户级）与 `.pi/agents/*.md`（需 `agentScope`）；Ctrl+C 传播 kill 子进程。
- `experimental/mini` 展示多进程拓扑（tui ×N → server → worker/session），基于新 `AgentHarness`（`packages/coding-agent/src/experimental/mini/README.md@ceea48f`），非子 agent 机制。

### 2.10 消息变换点

| 切点 | 类型/位置 | coding-agent 绑定（`sdk.ts@ceea48f`） |
|---|---|---|
| `transformContext(messages, signal)` | `AgentLoopConfig`，在 `convertToLlm` 之前，AgentMessage 级 | `runner.emitContext(messages)` → 扩展 `context` 事件（先 `structuredClone`） |
| `convertToLlm(messages)` | 必需；默认实现只保留 user/assistant/toolResult（`agent.ts:defaultConvertToLlm`） | `core/messages.ts:convertToLlm`：`bashExecution` → user 文本（`excludeFromContext` 则丢弃）；`custom` → user；`branchSummary`/`compactionSummary` →（未细读，**未覆盖**具体文本）；外层再按 `blockImages` 设置把图片替换成占位文本 |
| `prepareNextTurn / prepareNextTurnWithContext` | 轮间替换 context/model/thinkingLevel | 压缩 + 刷新 systemPrompt/tools（§2.8） |
| `shouldStopAfterTurn` | 轮后优雅停止 | coding-agent **未使用**（grep 无赋值，**推断**） |
| `getApiKey` | 每次请求解析 key | coding-agent 通过自定义 `streamFn` 内部 `modelRuntime.streamSimple` 解决鉴权，未用 `getApiKey`（**推断**） |
| `onPayload` / `transformHeaders` / `onResponse` | `SimpleStreamOptions` 级（pi-ai） | `before_provider_request`（可替换 payload）/ `before_provider_headers`（原地改 headers）/ `after_provider_response`（通知） |
| `beforeToolCall` / `afterToolCall` | 工具前后 | `tool_call` / `tool_result` 扩展事件；`afterToolCall` 之后还做 `normalizeToolResultImages`（`agent-session.ts:504-555@ceea48f`） |

---

## 3. 事件

### 3.1 `AgentEvent` 联合类型（`packages/agent/src/types.ts:389-404@ceea48f`，逐条抄录）

| 成员 | 载荷 | 触发时机 |
|---|---|---|
| `{ type: "agent_start" }` | — | `runAgentLoop`/`runAgentLoopContinue` 开始 |
| `{ type: "agent_end"; messages: AgentMessage[] }` | 本次 run 新增消息（prompt run 含初始提示；continue run 不含既有上下文） | run 结束（正常、`shouldStopAfterTurn`、error/aborted、`handleRunFailure`）；是最后一个事件，但 awaited 监听器仍计入 run 结算 |
| `{ type: "turn_start" }` | — | 首轮在 `agent_start` 后；后续轮在 `prepareNextTurn` 与 steering 轮询后 |
| `{ type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }` | 本轮 assistant 消息 + 工具结果 | assistant 消息与全部工具结果追加后；error/aborted 时 `toolResults=[]` |
| `{ type: "message_start"; message: AgentMessage }` | user/assistant/toolResult/自定义消息 | 提示消息、steering/follow-up 注入、流 `start`、toolResult 生成时 |
| `{ type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }` | 部分 assistant 消息副本 + 原始流事件 | 仅 assistant 流式期间（text/thinking/toolcall 的 start/delta/end） |
| `{ type: "message_end"; message: AgentMessage }` | 最终消息 | 消息完成；`Agent.processEvents` 在此把消息 push 进 `state.messages` |
| `{ type: "tool_execution_start"; toolCallId; toolName; args }` | 原始参数 | 预检前，源顺序 |
| `{ type: "tool_execution_update"; toolCallId; toolName; args; partialResult }` | 工具 `onUpdate` 的部分结果 | 执行期间，可交错 |
| `{ type: "tool_execution_end"; toolCallId; toolName; result; isError }` | finalized 结果（含 `afterToolCall` 覆盖） | 每个工具终结后（并行按完成顺序） |

README 补充：`Agent` 类把 assistant `message_end` 处理视为工具预检前的屏障，所以 `beforeToolCall` 看到的 agent 状态已含该 assistant 消息；裸 `agentLoop()` 流是「观察性」的，不等待消费者。

### 3.2 coding-agent 扩展事件（`packages/coding-agent/src/core/extensions/types.ts@ceea48f`，`ExtensionEvent` 联合 + `ExtensionAPI.on` 重载）

派发语义来自 `core/extensions/runner.ts@ceea48f`：通用 `emit()` 按扩展加载顺序、每扩展内按注册顺序依次 `await`；处理器异常被捕获并 `emitError`（`extension_error`），不阻断。专用方法有各自合并规则。

| 事件（`type`） | 载荷要点 | 可阻断/改写 | 返回值语义 / 合并规则 | 触发时机 |
|---|---|---|---|---|
| `project_trust` | `{cwd}`；ctx 受限（cwd/mode/hasUI/select/confirm/input/notify） | 决定信任 | `{trusted:"yes"\|"no"\|"undecided", remember?}`；首个 yes/no 获胜并抑制内建提示；仅用户级/CLI 扩展参与 | 启动、切换到未决 cwd 时 |
| `resources_discover` | `{cwd, reason:"startup"\|"reload"}` | 追加资源 | `{skillPaths?, promptPaths?, themePaths?}` | `session_start` 之后 |
| `session_start` | `{reason:"startup"\|"reload"\|"new"\|"resume"\|"fork", previousSessionFile?}` | 否 | — | 会话开始/加载/重载 |
| `session_info_changed` | `{name}` | 否 | — | `/name`、`pi.setSessionName` |
| `session_before_switch` | `{reason:"new"\|"resume", targetSessionFile?}` | **可取消** | `{cancel?}`；`emit()` 中首个 `cancel` 立即返回 | `/new`、`/resume` 前 |
| `session_before_fork` | `{entryId, position:"before"\|"at"}` | **可取消** | `{cancel?, skipConversationRestore?}` | `/fork`、`/clone` 前 |
| `session_before_compact` | `{preparation, branchEntries, customInstructions?, reason:"manual"\|"threshold"\|"overflow", willRetry, signal}` | **可取消/可替换** | `{cancel?}` 或 `{compaction: CompactionResult}`；通用 `emit()` 下后一个非空返回覆盖前一个（**推断**：last-wins） | 压缩前 |
| `session_compact` | `{compactionEntry, fromExtension, reason, willRetry}` | 否 | — | 压缩成功后 |
| `session_compact_failed` | `{reason, errorMessage?, aborted, willRetry, fromExtension}` | 否 | — | 压缩失败/中止 |
| `session_before_tree` | `{preparation: TreePreparation, signal}` | **可取消/可替换摘要** | `{cancel?, summary?{summary,details?,usage?}, customInstructions?, replaceInstructions?, label?}` | `/tree` 导航前（总是触发） |
| `session_tree` | `{newLeafId, oldLeafId, summaryEntry?, fromExtension?}` | 否 | — | 导航后 |
| `session_shutdown` | `{reason:"quit"\|"reload"\|"new"\|"resume"\|"fork", targetSessionFile?}` | 否 | — | 扩展运行时拆除前 |
| `context` | `{messages}`（深拷贝） | **可改写** | `{messages?}` 链式替换（`emitContext`） | 每次 LLM 调用前（`transformContext`） |
| `before_provider_headers` | `{headers: ProviderHeaders}` | **可改写（原地）** | 返回值忽略；`null` 删除 header | 请求头组装后，每次请求一次（重试不重触发） |
| `before_provider_request` | `{payload}` | **可替换** | 非 `undefined` 返回值替换 payload，链式 | provider 专属 payload 构建后 |
| `after_provider_response` | `{status, headers}` | 否 | — | 收到响应、消费流之前 |
| `before_agent_start` | `{prompt, images?, systemPrompt, systemPromptOptions}` | **可注入/改写** | `{message?: Pick<CustomMessage,...>, systemPrompt?}`；messages 累积、systemPrompt 链式（`emitBeforeAgentStart`） | 用户提交后、循环前 |
| `agent_start` | — | 否 | — | 低层 run 开始 |
| `agent_end` | `{messages}` | 否 | — | 低层 run 结束（之后仍可能重试/压缩/续跑） |
| `agent_settled` | — | 否 | — | 无自动重试/压缩/队列续跑后 |
| `ui_prompt_start` / `ui_prompt_end` | `{reason:"ui_prompt", kind, title?}` | 否（best-effort，不等待） | — | `ctx.ui.select/confirm/input/editor/custom` 前后 |
| `turn_start` | `{turnIndex, timestamp}` | 否 | — | 映射自 AgentEvent |
| `turn_end` | `{turnIndex, message, toolResults}` | 否 | — | 同上 |
| `message_start` | `{message}` | 否 | — | 同上 |
| `message_update` | `{message, assistantMessageEvent}` | 否 | — | 同上 |
| `message_end` | `{message}` | **可替换** | `{message?}` 链式，必须保持 `role`（`emitMessageEnd`）；替换通过 `_replaceMessageInPlace` 原地覆盖对象，使 agent 状态与持久化一致 | 同上 |
| `tool_execution_start/update/end` | 同 AgentEvent | 否 | — | 同上 |
| `model_select` | `{model, previousModel, source:"set"\|"cycle"\|"restore"}` | 否 | — | `/model`、Ctrl+P、会话恢复 |
| `thinking_level_select` | `{level, previousLevel}` | 否 | 返回值忽略 | 思考级别变化 |
| `tool_call` | `{toolName, toolCallId, input}`；`input` **可原地改写**，后续处理器看到改写；不重新校验 | **可阻断** | `{block?, reason?, terminate?}`；首个 `block` 立即返回；处理器异常不被捕获 → 阻断（§2.5） | `tool_execution_start` 之后、执行前（`beforeToolCall`） |
| `tool_result` | `{toolName, toolCallId, input, content, details, isError, usage?}` | **可改写** | `{content?, details?, isError?, usage?}` 字段级链式（`emitToolResult`） | 执行后、`tool_execution_end` 前（`afterToolCall`） |
| `user_bash` | `{command, excludeFromContext, cwd}` | **可拦截** | `{operations?: BashOperations}` 或 `{result?: BashResult}` | 用户 `!`/`!!` 命令 |
| `input` | `{text, images?, source:"interactive"\|"rpc"\|"extension", streamingBehavior?}` | **可拦截/改写** | `{action:"continue"}` / `{action:"transform", text, images?}`（链式）/ `{action:"handled"}`（首个获胜） | 扩展命令检查后、技能/模板展开前 |

`AgentSession.subscribe` 另发会话级事件（非扩展事件）：`queue_update{steering,followUp}`、`compaction_start/end`、`auto_retry_start/end`、`summarization_retry_scheduled/attempt_start/finished`、`agent_settled`、`extension_error`、`bash_execution_update`（`docs/rpc.md:855-885`、`docs/sdk.md:264-332@ceea48f`）。

### 3.3 新 `AgentHarness` 的 `HarnessEvent`（`packages/agent/src/harness/agent-harness.ts@ceea48f`，`HarnessEventPayload` 联合逐条抄录）

`run_start{runId,startedAt}`、`run_resume{runId}`、`run_suspend{runId,reason:"deferred",deferred,poll}`、`operation_abort{operationId,steer,followUp}`、`run_end{runId,fromTipId,tipId,endedAt,status:"completed"|"aborted"|"failed",error?}`、`fault{code,message}`、`handler_error{kind:"hook"|"event",hook|event,error,stack?}`、`turn_start{runId,turnId}`、`turn_end{runId,turnId,message,toolResults}`、`retry_scheduled{runId,step,attempt,maxAttempts,delayMs,notBefore,errorMessage}`、`retry_start`、`retry_end{success,finalError?}`、`message_start{runId?,message}`、`message_update{runId,message,event,frame?}`、`message_end{runId?,message,entryId?}`、`tool_start{runId,turnId,toolCallId,toolName,args}`、`tool_update{...,partialResult}`、`tool_end{...,result,isError,terminate}`、`entry_added{entry}`、`queue_update{queues}`、`value_update{value:"session_name"|"entry_label",...}`、`config_update{property: model|thinkingLevel|activeTools|tools|resources|streamOptions|retryPolicy|compactionSettings|steeringMode|followUpMode, value, previous}`、`compaction_start{runId,reason,startedAt}`、`compaction_end{runId,reason,endedAt,status:"completed"|"declined"|"aborted"|"failed",entryId?,error?}`、`navigation_start{runId,targetId,startedAt}`、`navigation_end{...status:"completed"|"declined"|"aborted"|"failed"}`、`lane_created{at}`、`usage{lane,row,totals}`。lane 作用域事件附 `lane`，恢复重放附 `recovery: true`。

语义：事件是「passive committed-state/lifecycle observations: they never drive execution and are not replayed from durable history」（`harness.md:1146`）；`HarnessEventBus` 对载荷 `structuredClone`、按提交顺序串行投递、监听器异常转 `handler_error` 不回滚（`harness/events.ts@ceea48f`）。

---

## 4. Hooks / 扩展点

### 4.1 扩展 API 能做什么（`ExtensionAPI`，`core/extensions/types.ts:553-807@ceea48f`；说明见 `docs/extensions.md:1365-1885`）

| 类别 | 方法 | 要点 |
|---|---|---|
| 事件 | `pi.on(event, handler)` | §3.2 全部事件；handler `(event, ctx) => result` |
| 工具 | `pi.registerTool(ToolDefinition)` | 字段：`name/label/description/parameters(TypeBox)/execute(toolCallId, params, signal, onUpdate, ctx)`；可选 `promptSnippet`、`promptGuidelines`、`prepareArguments`、`executionMode`、`constrainedSampling`、`renderShell`、`renderCall`、`renderResult`；启动后（如 `session_start`、命令内）注册立即生效；同名可覆盖内建工具；`defineTool()` 保类型 |
| 命令/快捷键/CLI 标志 | `registerCommand(name,{description?, getArgumentCompletions?, handler(args, ExtensionCommandContext)})`、`registerShortcut(KeyId,{handler})`、`registerFlag(name,{type,default})` / `getFlag` | 同名命令按加载顺序编号 `/review:1` |
| 渲染 | `registerMessageRenderer(customType, renderer)`、`registerEntryRenderer(customType, renderer)`、`registerMarkdownTransformer(fn)` | 前两者针对 `custom_message`/`custom` 条目；Markdown 变换仅显示层 |
| 发消息 | `sendMessage(customMessage,{triggerTurn?, deliverAs:"steer"\|"followUp"\|"nextTurn"})`、`sendUserMessage(content,{deliverAs?, expandPromptTemplates?})` | 见 §2.7；`sendUserMessage` 走 `session.prompt(..., source:"extension")` |
| 持久化 | `appendEntry(customType, data?)`（不进 LLM 上下文）、`setSessionName/getSessionName`、`setLabel(entryId,label)` | |
| 工具/模型控制 | `getActiveTools/getAllTools/setActiveTools`、`setModel(model)`（返回 false 表示无鉴权）、`getThinkingLevel/setThinkingLevel` | 模型/思考级别变更写入会话条目 |
| Provider | `registerProvider(name, config)` / `registerProvider(Provider)` / `unregisterProvider(name)` | 支持 `baseUrl` 覆盖、自定义 `models`、`oauth`、`refreshModels`、自定义 `streamSimple`；加载期排队、绑定后立即生效 |
| 其他 | `exec(cmd,args,opts)`、`getCommands()`、`events: EventBus`（扩展间总线） | |

`ExtensionContext`（事件处理器/工具 `ctx`）：`ui`、`mode:"tui"|"rpc"|"json"|"print"`、`hasUI`、`cwd`、`sessionManager`（只读）、`modelRegistry`、`model`、`scopedModels`、`thinkingLevel`、`isIdle()`、`isProjectTrusted()`、`signal`、`abort()`、`hasPendingMessages()`、`shutdown()`、`getContextUsage()`、`compact(opts)`、`getSystemPrompt()`。命令处理器额外得到 `ExtensionCommandContext`：`getSystemPromptOptions()`、`waitForIdle()`、`newSession()`、`fork()`、`navigateTree()`、`switchSession()`、`reload()`；会话替换回调收到 `ReplacedSessionContext`（含 `sendMessage/sendUserMessage`）。

`ctx.ui`（`ExtensionUIContext`）：`select/confirm/input/editor/notify`（支持 `timeout`/`signal`）、`onTerminalInput`、`setStatus`（页脚）、`setWorkingMessage/setWorkingVisible/setWorkingIndicator`、`setHiddenThinkingLabel`、`setWidget(key, lines|factory, {placement:"aboveEditor"|"belowEditor"})`、`setFooter/setHeader`、`setTitle`、`custom(factory,{overlay,...})`、`pasteToEditor/setEditorText/getEditorText`、`addAutocompleteProvider`、`setEditorComponent/getEditorComponent`、`theme/getAllThemes/getTheme/setTheme`、`getToolsExpanded/setToolsExpanded`。各模式各自实现（RPC 模式经 stdout/stdin 的 Extension UI 协议，`docs/rpc.md:1184+`）。

### 4.2 加载路径与作用域（`docs/extensions.md:109-137`、`core/extensions/loader.ts:761-808@ceea48f`）

| 位置 | 作用域 |
|---|---|
| `~/.pi/agent/extensions/*.ts`、`~/.pi/agent/extensions/*/index.ts` | 全局 |
| `.pi/extensions/*.ts`、`.pi/extensions/*/index.ts` | 项目本地，**仅在项目被信任后加载**（`project_trust`） |
| `settings.json` 的 `packages`（`npm:@foo/bar@1.0.0`、`git:github.com/user/repo@v1`）与 `extensions`（文件/目录路径） | 配置 |
| CLI `-e/--extension <path>` | 临时 |
| 目录 `package.json` 的 `pi.extensions` 字段 | 包内声明 |

扩展是导出默认工厂 `(pi: ExtensionAPI) => void | Promise<void>` 的 TS 模块，经 jiti 加载无需编译；异步工厂在 `session_start`/`resources_discover`/provider 注册 flush 之前完成；建议在 `session_start` 才启动后台资源、`session_shutdown` 清理。会话替换（`/new`、`/resume`、`/fork`）会 `session_shutdown` 旧实例 → 重新加载并绑定扩展 → `session_start`（`docs/extensions.md:416-450`）。运行时状态 `ExtensionRuntimeState.assertActive/invalidate` 使陈旧实例调用抛错（`types.ts:970-991`）。

### 4.3 hooks 与 events 的区别

| 层 | 区分方式 |
|---|---|
| `pi-agent-core` `Agent` | **配置回调**（`convertToLlm`、`transformContext`、`getApiKey`、`beforeToolCall`、`afterToolCall`、`shouldStopAfterTurn`、`prepareNextTurn[WithContext]`、`getSteeringMessages`、`getFollowUpMessages`）可改变循环行为；**`subscribe` 事件**只观察（但被 `await`，构成结算屏障） |
| coding-agent 扩展 | **只有一个 `pi.on` 机制**，不区分术语；能否阻断/改写由各事件的返回值决定（§3.2 表）。文档偶尔称可拦截事件为 hook（如 "`model_select` hook"、"`user_bash` hook"）。历史痕迹：会话 v3 把 `hookMessage` 角色改名为 `custom`（"extensions unification"，`docs/session-format.md:25`） |
| 新 `AgentHarness` | **显式分离**：`harness.hooks.on(name, handler, {id?})`（`HookRegistry`，awaited，可改写，按注册顺序聚合；`before_drive` 与 `before_tool` 抛错即 fail-closed）与 `harness.events.on(type, listener)`（`HarnessEventBus`，被动，`structuredClone`，异常隔离为 `handler_error`）。`HookMap`（`agent-harness.ts@ceea48f`）：`before_run{prompt,resources}→{messages?}`、`before_drive{operation}→void`、`before_run_end{runId,messages}→{followUp?}`、`transform_context{messages,systemPrompt}→{messages?,systemPrompt?}`、`before_request{model,step,attempt,streamOptions}→{streamOptions?}`、`before_payload{model,payload}→{payload}`、`after_response{status?,headers?,message}→{message?}`、`before_tool{toolCallId,toolName,args}→{args?,block?{reason,terminate?}}`、`after_tool{...content,details?,isError,usage?}→{content?,details?,isError?,usage?,terminate?}`、`before_compaction{reason,preparation,customInstructions?}→{decline?,compaction?}`、`before_navigation{targetId,preparation,customInstructions?}→{decline?,summary?}`。调用点在 `harness/runtime/drive.ts` 与 `drive/{checkpoint,generation,deferred,response,tools,structural,boundary}.ts@ceea48f`（`runWithGate`/`runToolWithGate`，经 effect gate 准入）。`harness.md §5.6` 定义了 pass-local / request-local / transition-consumed 三类持久性，明确「No external hook is globally exactly-once」 |

### 4.4 其他扩展面

| 面 | 位置/规则（`docs/*.md@ceea48f`） |
|---|---|
| Prompt templates | `~/.pi/agent/prompts/*.md`、`.pi/prompts/*.md`（信任后）、包 `prompts/` 或 `pi.prompts`、settings `prompts`、`--prompt-template`；`/name args` 展开；`--no-prompt-templates` 关闭 |
| Skills | `~/.pi/agent/skills/`、`~/.agents/skills/`、`.pi/skills/`、`.agents/skills/`（cwd 及祖先到 git 根）、包 `skills/` 或 `pi.skills`、settings、`--skill`；`SKILL.md` + frontmatter；`/skill:name` 展开为技能内容 |
| Themes | 内建 `dark/light`、`~/.pi/agent/themes/*.json`、`.pi/themes/*.json`、包/settings/`--theme` |
| Packages | `pi install npm:…/git:…`，`package.json` 的 `pi.{extensions,skills,prompts,themes}`（`docs/packages.md`，未细读） |
| 系统提示 | `--system-prompt`/`SYSTEM.md`/`--append-system-prompt`、AGENTS.md 等上下文文件；`BuildSystemPromptOptions` 暴露给 `before_agent_start` |
| 键位 | `docs/keybindings.md`（未细读） |
| 运行模式 | interactive（TUI）、`--mode rpc`（JSONL 协议，含 prompt/steer/follow_up/abort/clear_queue/compact/fork/get_tree 等命令与事件）、`--mode json`、print |

---

## 5. 持久化与恢复

### 5.1 会话文件（`docs/session-format.md`、`core/session-manager.ts:33-153@ceea48f`）

- 路径 `~/.pi/agent/sessions/--<cwd 编码>--/<timestamp>_<session-id>.jsonl`；首行 header `{"type":"session","version":3,"id","timestamp","cwd","parentSession"?}`；v1 线性 → v2 树（`id/parentId`）→ v3（`hookMessage`→`custom`），加载时自动迁移。
- 条目基类 `{type, id(8 位 hex 或 UUID), parentId, timestamp(ISO)}`；`SessionEntry` 联合：`message{message: AgentMessage}`、`thinking_level_change{thinkingLevel}`、`model_change{provider,modelId}`、`compaction{summary, firstKeptEntryId, tokensBefore, usage?, details?, fromHook?}`、`branch_summary{summary, fromId, usage?, details?, fromHook?}`、`custom{customType, data?}`（**不进入 LLM 上下文**）、`custom_message{customType, content, display, details?}`（**进入上下文**）、`label{targetId, label}`、`session_info{name}`。
- `AgentMessage` 在 coding-agent 中的扩展角色：`bashExecution`、`custom`、`branchSummary`、`compactionSummary`（`core/messages.ts`，通过 declaration merging 扩展 `CustomAgentMessages`）。
- 树：`parentId: null` 为根；`/tree` 在同一文件内移动 leaf 分支；`/fork`（从某条 user 消息之前）与 `/clone`（复制当前分支）创建新文件并写 `parentSession`；`resetLeaf()`/`branchWithSummary(null,…)` 允许多个根。
- 上下文重建：`buildContextEntries()` 从 leaf 走到根，若路径上有 `compaction` 条目取最新者：先放 compaction 条目，再放 `firstKeptEntryId` 到该条目前的区间，再放其后条目；`buildSessionContext()` 转成消息（`compaction`→`compactionSummary`，`branch_summary`→`branchSummary`，`custom_message`→`CustomMessage`，`custom`→无）并提取当前 model/thinkingLevel。

### 5.2 写入时机

| 内容 | 位置（`agent-session.ts@ceea48f`） |
|---|---|
| `user/assistant/toolResult` 消息 | `_handleAgentEvent` 的 `message_end` → `sessionManager.appendMessage`（即流式完成后一次性写入，不写部分消息） |
| `custom` 消息 | 同上 → `appendCustomMessageEntry`；非流式 `sendCustomMessage` 走 `_appendCustomMessage` 并合成 `message_start/end` 会话事件 |
| `bashExecution`、`compactionSummary`、`branchSummary` | 「persisted elsewhere」（`recordBashResult`、`appendCompaction`、`branchWithSummary`） |
| 模型/思考级别 | `setModel`/`setThinkingLevel` → `appendModelChange`/`appendThinkingLevelChange`；新会话创建时也写初始值（`sdk.ts:375-386`） |

### 5.3 Resume 与恢复

- `createAgentSession`（`sdk.ts:192-200, 375-386@ceea48f`）：`sessionManager.buildSessionContext()`；有既有消息则 `agent.state.messages = existingSession.messages`，并尝试从会话恢复模型（失败时 `modelFallbackMessage`）与思考级别；`model_select` 以 `source: "restore"` 触发。
- **没有事件重放**：扩展在 `session_start` 中自行遍历 `ctx.sessionManager.getEntries()/getBranch()` 重建状态（`docs/extensions.md` "State Management"、`pi.appendEntry` 示例）；`session_start.reason` 区分 `startup/reload/new/resume/fork`；`resources_discover` 随后触发。
- 压缩后：`buildSessionContext()` 重建并替换 `agent.state.messages`（§2.8）。
- 分支导航：`navigateTree(targetId, {summarize, customInstructions, replaceInstructions, label})` → `session_before_tree` → 可选生成 `branch_summary` → `session_tree`（`agent-session.ts:3136`，未逐行细读）。
- 新 `AgentHarness`（v4 存储，Memory/JSONL/SQLite 后端，lane、`pi.op.state` 操作状态、`pi.result/{operationId}`）声称崩溃后「reads the lane's required values … and continues」，工具 `replay: "never" | "safe"` 决定是否重执行（`harness.md §0.3-0.5`）；与 coding-agent v3 JSONL 的兼容在 Appendix B（未细读）。

---

## 6. 小结表：循环阶段 → 事件 → hook → 能否阻断/改写（生产路径）

| 循环阶段 | AgentEvent（core） | 扩展事件 / 回调（coding-agent） | 能否阻断/改写 |
|---|---|---|---|
| 用户输入接收 | — | `input` | 可 `handled`（跳过 agent）/ `transform` |
| 技能/模板展开、扩展命令 | — | `registerCommand` 处理器 | 命令自行处理，不进循环 |
| 组装提示与系统提示 | — | `before_agent_start` | 可注入 custom 消息、改写 systemPrompt（链式） |
| run 开始 | `agent_start` | `agent_start` | 否 |
| 轮开始（含 steering 注入） | `turn_start`、注入消息的 `message_start/end` | `turn_start{turnIndex}`、`message_start/end` | `message_end` 可替换消息（同 role） |
| 轮间准备 | —（`prepareNextTurn`） | 内部：阈值压缩 + 刷新 prompt/tools → `session_before_compact`/`session_compact` | 压缩可取消/自定义 |
| 上下文变换 | —（`transformContext` → `convertToLlm`） | `context` | 可改写消息列表 |
| 请求发送 | — | `before_provider_headers`、`before_provider_request` | 可改 headers（原地）、替换 payload |
| 响应到达 | — | `after_provider_response` | 否 |
| 流式生成 | `message_start`、`message_update`×N、`message_end` | 同名 | `message_end` 可替换 |
| 工具预检 | `tool_execution_start` | `tool_execution_start` → `tool_call`（`beforeToolCall`） | `tool_call` 可阻断（`block/reason/terminate`）、原地改 `input` |
| 工具执行 | `tool_execution_update` | 同名 | 否 |
| 工具终结 | `tool_execution_end`、toolResult 的 `message_start/end` | `tool_result`（`afterToolCall`）→ `tool_execution_end` → `message_start/end` | `tool_result` 可改写 content/details/isError/usage；`terminate` 可提前结束 |
| 轮结束 | `turn_end` | `turn_end`；flush pending custom messages | —（`shouldStopAfterTurn` 可停，coding-agent 未用） |
| 队列轮询 | —（`getSteeringMessages`/`getFollowUpMessages`） | `queue_update`（会话事件） | 通过 `steer/followUp/sendMessage` 入队 |
| run 结束 | `agent_end` | `agent_end{messages}` | 否；处理器可入队触发续跑 |
| 运行后处理 | — | `auto_retry_start/end`、`compaction_start/end`、`session_before_compact/compact/compact_failed` | 压缩可取消/自定义；重试可 `abortRetry` |
| 全部落定 | — | `agent_settled` | 否 |
| 会话生命周期 | — | `session_start`、`session_before_switch`、`session_before_fork`、`session_before_tree`、`session_tree`、`session_shutdown`、`session_info_changed`、`model_select`、`thinking_level_select`、`project_trust`、`resources_discover` | `session_before_*` 可取消；`project_trust` 决定信任 |

---

## 7. 局限与未覆盖

| 项 | 说明 |
|---|---|
| 仓库来源 | 克隆自 `badlogic/pi-mono`，但仓库内文档与博文表明权威已迁至 `earendil-works/pi`；未核对两者是否同步（**未覆盖**） |
| 博文覆盖 | 2025-11-30 博文早于扩展系统、压缩、树状会话与 AgentHarness（文中称尚无压缩），因此扩展/会话设计意图只能以仓库文档为准；2026-04-08 博文无架构内容；`mariozechner.at/posts/` 索引抓取仅返回 2025 年条目，可能存在未列出的 2026 年 pi 相关文章（**未覆盖**） |
| `AgentHarness` | 只读了 `agent-harness.ts`、`hooks.ts`、`events.ts` 与 `harness.md` 的 §0、§5.5-5.7、§0.9；`runtime/lane.ts`（2012 行）、`drive/*`、`session/*` 未逐行阅读；其实现状态见 `harness.md §0.9`（JSONL 压缩、`watchSession`、telemetry、search 等未实现） |
| `convertToLlm` 完整分支 | `messages.ts` 只读到 `bashExecution`、`custom` 分支；`branchSummary`/`compactionSummary` 的文本化未读 |
| `navigateTree`、`fork`/`newSession`/`switchSession` 实现 | 仅依据文档与类型，未逐行读 `agent-session.ts:3136+` 及 `agent-session-runtime.ts` |
| `resources_discover` 聚合规则 | `emitResourcesDiscover` 未读，多个扩展返回路径的合并方式为推断 |
| `session_before_compact` 多处理器冲突 | 通用 `emit()` 下后者覆盖前者为代码推断，未见文档说明 |
| RPC/JSON 模式细节、TUI 组件、`packages.md`、`keybindings.md`、`custom-provider.md`、`security.md` | 仅看标题或未读 |
| 测试 | 未阅读 `packages/agent/test` 与 `packages/coding-agent/test` |
| `pi-ai` 内部 | `streamSimple`、重试/超时、`onPayload/onResponse/transformHeaders` 的实现未读，仅从 `sdk.ts` 调用侧确认存在 |
