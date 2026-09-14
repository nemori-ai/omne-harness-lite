<!-- 分系统核对笔记：Claude Code 与 Claude Agent SDK。2026-09-14 由只读调研 subagent 按固定提交/版本产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# Claude Code / Claude Agent SDK：Agent Loop、事件体系与 hooks 调研笔记

- 调研日期：2026-09-14（所有页面均于当日访问）
- 性质：只读事实调研。Claude Code 本体不开源，本文以官方文档与 `@anthropic-ai/claude-agent-sdk` 的类型定义为依据；文档没说、仅由类型或行为推断的结论标「推断」，找不到的标「未覆盖」。
- SDK 精确版本：`@anthropic-ai/claude-agent-sdk@0.3.270`（`npm view` 于 2026-09-14 查得；tarball 经 `npm pack` 解包于仓库 Git 忽略的临时目录，主类型文件 `sdk.d.ts` 共 9221 行，下文引用形如「D1:L864」表示该文件第 864 行）。
- 文档站点迁移说明：任务给出的 `https://docs.claude.com/en/docs/claude-code/*` 现为 301 重定向到 `https://code.claude.com/docs/en/*`；`https://platform.claude.com/docs/en/api/agent-sdk/*` 为 307 重定向到 `https://code.claude.com/docs/en/agent-sdk/*`。下文统一引用重定向后的最终 URL。

## 来源清单

| 编号 | 页面 | URL |
|---|---|---|
| S1 | Hooks reference | https://code.claude.com/docs/en/hooks |
| S2 | Hooks guide | https://code.claude.com/docs/en/hooks-guide |
| S3 | Run Claude Code programmatically（headless / `-p`） | https://code.claude.com/docs/en/headless |
| S4 | Agent SDK overview | https://code.claude.com/docs/en/agent-sdk/overview |
| S5 | Streaming Input（streaming vs single） | https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode |
| S6 | SDK hooks | https://code.claude.com/docs/en/agent-sdk/hooks |
| S7 | SDK subagents | https://code.claude.com/docs/en/agent-sdk/subagents |
| S8 | SDK sessions | https://code.claude.com/docs/en/agent-sdk/sessions |
| S9 | SDK TypeScript reference | https://code.claude.com/docs/en/agent-sdk/typescript（本次 WebFetch 返回的是二次摘要且与 `.d.ts` 有出入，类型事实以 D1 为准） |
| S10 | How Claude Code works | https://code.claude.com/docs/en/how-claude-code-works |
| S11 | Permission modes | https://code.claude.com/docs/en/permission-modes |
| S12 | Subagents（CLI） | https://code.claude.com/docs/en/sub-agents |
| S13 | Manage sessions（CLI） | https://code.claude.com/docs/en/sessions |
| S14 | How the agent loop works（SDK） | https://code.claude.com/docs/en/agent-sdk/agent-loop |
| S15 | Explore the context window | https://code.claude.com/docs/en/context-window |
| S16 | CLI reference | https://code.claude.com/docs/en/cli-reference |
| S17 | Interactive mode | https://code.claude.com/docs/en/interactive-mode |
| S18 | SDK permissions | https://code.claude.com/docs/en/agent-sdk/permissions |
| S19 | Model configuration（auto-compact 阈值） | https://code.claude.com/docs/en/model-config |
| S20 | Anthropic 工程博客 Effective context engineering for AI agents | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents |
| D1 | `sdk.d.ts`（v0.3.270） | `npm tarball `@anthropic-ai/claude-agent-sdk@0.3.270` 内的 `sdk.d.ts`（本地解包目录为可重新生成的临时证据）` |

---

## 1. 总体架构定位

### 1.1 三层关系

| 层 | 角色 | 依据 |
|---|---|---|
| Messages API / Client SDK | 直接调 Anthropic API，「You implement the tool loop yourself」 | S4 对比表 |
| Agent SDK（Python / TypeScript 库） | 「A Python or TypeScript library that runs the agent loop for you」；提供与 Claude Code 相同的工具、agent loop 与上下文管理；「Both the TypeScript and Python SDKs bundle a native Claude Code binary」 | S4、S14 |
| Claude Code CLI | 终端交互界面；`claude -p` 即「Agent SDK via the CLI」，其他语言可通过子进程驱动同一循环（`-p --output-format json/stream-json`） | S3、S4 |

- 推断（依据 D1）：TS SDK 通过 `Options.pathToClaudeCodeExecutable`、`executable: 'bun'|'deno'|'node'`、`spawnClaudeCodeProcess` 启动 Claude Code 进程（D1:L1406 起 `Options` 字段），并以 `SDKControlRequest` / `SDKControlResponse`（D1:L4608、L4659）等控制帧在 stdio 上与其通信；`Query` 接口注释明言「Control Requests … are only supported when streaming input/output is used」（D1:L2611 起）。因此 SDK 的 hooks 回调、`canUseTool` 等都是宿主进程与 CLI 进程之间的控制协议，而不是进程内调用。
- 另有 Managed Agents（托管 REST API，独立产品）不在本文范围（S4）。

### 1.2 一次用户输入到回复的完整路径

综合 S14「The loop at a glance」、S10、S1 生命周期图（S1 的 WebFetch 摘要给出了 Setup → SessionStart → 每轮 UserPromptSubmit/UserPromptExpansion → agentic loop → Stop/StopFailure → SessionEnd 的顺序）：

1. 会话建立：（可选 `Setup` hook，仅 `--init-only`/`--init`/`--maintenance`）→ `SessionStart` hook（`source: startup|resume|clear|compact|fork`，D1:L5936）→ 发出 `system/init`（S3：若有 SessionStart/Setup hook 运行，`hook_started/hook_progress/hook_response` 事件先于 `init` 出现）。
2. 用户输入：`UserPromptSubmit` hook（可阻断/注入上下文）；若输入是 `/command` 或 MCP prompt，先经 `UserPromptExpansion` hook（可阻断展开）（S1、S2）。
3. 装配请求：系统提示 + 工具定义 + CLAUDE.md/记忆/技能描述 + 会话历史（S14「Receive prompt」；S15 列出启动时加载的内容）。
4. 模型调用：Claude「may respond with text, request one or more tool calls, or both」，每个内容块产生一条 `assistant` 消息（S14）。
5. 工具调用：`PreToolUse` hook → 权限判定（六步顺序，见 1.3）→ 执行 → `PostToolUse` / `PostToolUseFailure` hook → 一批工具全部返回后 `PostToolBatch` hook（「before the next model call」）→ 结果以 `user` 消息（`tool_result` 块）回写（S14、S1、S2）。
6. 重复 4–5，直到模型输出不含工具调用（S14）。
7. 结束：`Stop` hook（可阻止停止）或 API 错误时 `StopFailure` hook → 发出 `result` 消息（S14、S2）。
8. 会话终止：`SessionEnd` hook（S1）。

### 1.3 权限模式在循环中的位置

权限判定发生在每次工具调用、`PreToolUse` hook 之后、执行之前。SDK 文档 S18 给出固定六步顺序（CLI 与之一致，S2「Hooks and permission modes」）：

| 步骤 | 内容 | 要点（S18） |
|---|---|---|
| 1 | Hooks（`PreToolUse`） | hook 可直接 deny；hook 返回 allow **不**跳过下面的 deny/ask 规则；不能批准针对 critical path 的 `rm`/`rmdir` |
| 2 | Deny 规则（`disallowedTools` + settings `permissions.deny`） | 匹配即阻断，「even in `bypassPermissions` mode」；裸工具名 deny 会在请求前把工具定义移除 |
| 3 | Ask 规则 | 匹配则落到 `canUseTool` 回调（bypass 模式亦然）；`AskUserQuestion`、`requiresUserInteraction` 的 MCP 工具、组织设为 ask 的 connector 工具总是落到回调；`dontAsk` 下改为拒绝 |
| 4 | 权限模式 | `bypassPermissions` 批准到达此步的一切（critical path 例外）；`acceptEdits` 批准文件操作；`plan` 把写操作送往回调；其他模式落空 |
| 5 | Allow 规则（`allowedTools` + settings `permissions.allow`）| 匹配即批准；工作目录内读、只读 Bash 命令在此步自行批准 |
| 6 | `canUseTool` 回调 | 未决时调用；`dontAsk` 跳过并拒绝；`permissionPrompts: 'none'` 时不调回调，`PermissionRequest` hook 仍可决定，否则拒绝 |

模式取值（D1:L2327）：`'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`；CLI `--permission-mode` 额外接受 `manual` 作为 `default` 别名（S16）。各模式含义见 S11 表：`default` 仅读不问；`acceptEdits` 自动批准编辑与 `mkdir/touch/mv/cp` 等；`plan` 只读+（有 auto 时）分类器审查命令；`auto` 由「a second model, the classifier」审查动作；`dontAsk` 凡会提示的一律拒绝；`bypassPermissions` 全部放行。`auto` 模式的分类器还会在子 agent 生成前评估任务描述、返回时审查其完整动作历史（S11「How the classifier evaluates actions」）；非交互/SDK 会话中分类器的 deny 在整个运行期复用（S11）。

---

## 2. Agent Loop

### 2.1 循环步骤与「turn」

- S14 定义：「A turn is one round trip inside the loop: Claude produces output that includes tool calls, the SDK executes those tools, and the results feed back to Claude automatically」；「Turns continue until Claude produces output with no tool calls」。
- `maxTurns`「counts tool-use turns only」；`maxBudgetUsd` 按 `total_cost_usd` 封顶，子 agent 花费计入（S14、S7）。
- streaming input 下，turn 因 max-turns 结束时仍在队列中的消息保留，下一 turn 重新计数（S14、S16 `--max-turns`）。

### 2.2 终止条件

| 终止方式 | 表现 | 依据 |
|---|---|---|
| 模型自然结束 | `result.subtype = 'success'`，`stop_reason` 常见 `end_turn`、`max_tokens`、`refusal` | S14「Handle the result」 |
| 达到 `maxTurns` | `result.subtype = 'error_max_turns'` | S14 |
| 达到 `maxBudgetUsd` | `error_max_budget_usd`；同时拒绝再生成子 agent、停止后台子 agent | S14、S7 |
| 执行错误/取消 | `error_during_execution`（会话崩溃时 cost 可能为 0、`stop_reason` 为 `null`） | S14 |
| 结构化输出重试耗尽 | `error_max_structured_output_retries` | S14、D1:L5276 |
| Stop hook 阻止停止 | exit 2 或 `decision: "block"` → 「Prevents Claude from stopping, continues the conversation」；连续阻止 8 次无进展后 Claude Code 覆盖 hook（`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` 可调）；hook 输入含 `stop_hook_active` 供自检 | S1、S2「Stop hook hits the block cap」、D1:L8829 |
| 用户中断 | `Esc`/`interrupt()`；「`Stop` hooks … don't fire on user interrupts」；被截断的 assistant 消息带 `aborted: true` | S2、S17、D1:L3339 |

推断（D1:L8967 `TerminalReason`）：结果消息可携带 `terminal_reason`，取值枚举揭示了循环的全部终止原因：`'blocking_limit' | 'rapid_refill_breaker' | 'prompt_too_long' | 'image_error' | 'model_error' | 'api_error' | 'malformed_tool_use_exhausted' | 'aborted_streaming' | 'aborted_tools' | 'stop_hook_prevented' | 'hook_stopped' | 'tool_deferred' | 'max_turns' | 'background_requested' | 'completed' | 'budget_exhausted' | 'structured_output_retry_exhausted' | 'tool_deferred_unavailable' | 'turn_setup_failed'`。其中 `rapid_refill_breaker` 与 S10 所述「stops auto-compacting after a few attempts and shows an error instead of looping」的 thrashing 保护相对应（推断）。

### 2.3 并行工具调用

- 「Read-only tools (like `Read`, `Glob`, `Grep`, and MCP tools marked as read-only) can run concurrently. Tools that modify state (like `Edit`, `Write`, and `Bash`) run sequentially」；自定义工具默认串行，设置 MCP 注解 `readOnlyHint` 才可并行（S14）。
- 一批并行工具全部返回后触发 `PostToolBatch` hook（TS SDK 独有，S6 表），输入 `tool_calls[]`（D1:L2463）。

### 2.4 上下文自动 compaction

| 项 | 事实 | 依据 |
|---|---|---|
| 触发 | 「Claude compacts automatically as you approach the limit」；默认阈值：无 1M 上下文的模型在 200K 边界；原生 1M 模型「at about 967K tokens by default」；可用 `/autocompact <n>`、`--autocompact`、`CLAUDE_CODE_AUTO_COMPACT_WINDOW` 调整 | S15、S19 |
| 策略 | 「It clears older tool outputs first, then summarizes the conversation if needed」 | S10 |
| 摘要保留 | 用户请求与意图、关键技术概念、检查/修改过的文件及代码片段、错误及修复、待办与当前工作（S15 模拟器说明）；博客称保留「architectural decisions, unresolved bugs, and implementation details」，「tool result clearing」是最轻量的 compaction | S15、S20 |
| 压缩后恢复 | 系统提示/输出风格仍生效；项目根 CLAUDE.md、自动记忆、plan 从磁盘重注入；重读最近修改的最多 5 个文件并重载匹配规则；已调用技能正文重注入（每技能 5,000 tokens、总 25,000）；hooks 早先注入的上下文随对话被摘要；`SessionStart` 匹配 `compact` 的 hook 运行并追加输出；技能描述列表不重载 | S15「What survives compaction」 |
| 手动 | `/compact [focus]`；SDK 里把 `/compact` 作为 prompt 字符串发送；CLAUDE.md 中可写摘要指令（「The compactor matches on intent, so the section header is free-form」） | S13、S14 |
| hooks | `PreCompact`（输入 `trigger: 'manual'|'auto'`、`custom_instructions`）、`PostCompact`（输入 `compact_summary`）、`SessionStart` with `source: 'compact'` | D1:L2527、L2405、L5936 |
| 事件 | `system/compact_boundary`，`compact_metadata: { trigger, pre_tokens, post_tokens?, duration_ms?, preserved_segment?, preserved_messages? }`；`system/status` 的 `status: 'compacting'`，并带 `compact_result: 'success'|'failed'` | D1:L3457、L5467 |
| 异常 | 单个巨大输出导致摘要后立即再满时，「stops auto-compacting after a few attempts and shows an error instead of looping」 | S10 |

### 2.5 用户打断与 steering（循环中插入消息）

- 交互 CLI（S17「Queue messages while Claude works」）：工作中按 Enter 的消息进入队列；「if you queue a message while Claude is running tool calls, Claude Code passes it to Claude as soon as those tool calls finish, within the same turn」；turn 结束时仍有队列则只把最旧一条作为下一 turn；`Esc` 中断当前 turn，「keeps what you queued and sends it right away」；S10：输入修正并回车「without stopping the running tool. Claude reads it as soon as the current action completes」。
- SDK：streaming input mode（`prompt` 为 `AsyncIterable<SDKUserMessage>`）支持「Queued messages … with ability to interrupt」，single message 模式不支持中断与动态排队（S5）。`Query.interrupt()` 返回 `SDKControlInterruptResponse`（含 `still_queued` 的 uuid，需 CLI 声明 `interrupt_receipt_v1` capability）；`Query.streamInput()` 追加输入（D1:L2611 起）。
- 推断（D1:L5700 `SDKUserMessage`）：输入消息可带 `priority?: 'now' | 'next' | 'later'` 与 `shouldQuery?: boolean`（false 时只追加到转录、并入下一次查询），说明 CLI 内部有带优先级的命令队列；`result.queued_turn_count` 报告仍在队列的用户发送数（D1:L5333）。
- `UserPromptSubmit` hook 输入 `source?: 'user' | 'sdk' | 'system' | 'loop_wakeup' | 'schedule_wakeup' | 'poll_event'`，表明机器注入的 turn（任务通知、`/loop`、定时任务、peer 消息、自动续跑）也经由同一入口进入循环（D1:L9164）。

### 2.6 子 agent 如何进入循环

- 调用形式：模型调用 `Agent` 工具（`tool_use` 块名为 `"Agent"`，`system:init` 的 tools 列表中显示为 `"Task"`；v2.1.63 前 `tool_use` 也叫 `Task`）（S7「Detect subagent invocation」）。
- 定义来源：`agents` 选项（programmatic，优先级高于同名文件）、`.claude/agents/*.md`、内置 `general-purpose`/`Explore`/`Plan`（S7、S12）。`AgentDefinition` 字段：`description, prompt, tools, disallowedTools, model, skills, memory, mcpServers, initialPrompt, maxTurns, background, effort, permissionMode`（S7 表、D1:L38）。
- 前台/后台：「Subagents run in the background by default. An Agent tool call that omits the `run_in_background` input launches a background subagent, and Claude sets `run_in_background: false` when it needs the result before continuing」；`background: true` 强制后台（S7）。前台子 agent 阻塞主对话、权限提示透传；后台子 agent 的权限提示在主会话中浮现并标注来源（S12）。
- 结果回流：前台时最终消息成为 Agent 工具的 `tool_result`（附 `agentId: <id>` 文本，Explore/Plan 不返回）；「A background subagent's results reach Claude as a completion notification in a later turn」（S12）。流中对应 `system/task_started`（`is_backgrounded`、`spawn_depth`）、`task_progress`、`task_notification`（`status: 'completed'|'failed'|'stopped'`、`output_file`、`summary`）、`task_updated`、`background_tasks_changed`（D1:L5596、L5571、L5545、L5632、L3425）。
- 隔离：非 fork 子 agent 上下文全新，只收到自身系统提示 + Agent 工具 prompt + 项目 CLAUDE.md + 工具定义；不收父对话；v2.1.210 起对最终消息做指令样式扫描（S7）。
- hooks：`SubagentStart`（输入 `agent_id, agent_type`；matcher 为 agent 类型）与 `SubagentStop`（输入 `agent_id, agent_transcript_path, agent_type, last_assistant_message, stop_hook_active, background_tasks, session_crons`；exit 2 阻止子 agent 停止）（D1:L8856、L8867；S1）。子 agent 内部触发的所有 hook 输入都带 `agent_id`/`agent_type`（D1:L167）。子 agent frontmatter 中的 `Stop` hook 被转换为 `SubagentStop`（S1）。
- 限制：嵌套深度默认 3（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`），并发默认 20（`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`，超限返回 `Concurrent subagent limit reached`），预算共享（S7）。
- 续跑：`SendMessage` 工具以 agent id/name 为 `to` 继续已有子 agent；SDK 中用 `resume: sessionId` + prompt 中引用 agentId（S12、S7）。子 agent 转录单独存储（S7）。
- 权限继承：子 agent 默认沿用父会话模式；仅当父为 `default`/`dontAsk`/`plan` 时 `AgentDefinition.permissionMode` 生效；`bypassPermissions` 永不通过定义下放，仅当父会话本身处于该模式时继承（S18）。

### 2.7 后台任务与通知如何回到循环

- 后台 Bash：`Ctrl+B` 或工具参数后台化；`-p` 模式下最终 result 后约 5 秒终止后台 shell；若启动了后台子 agent 或 workflow，`claude -p` 等待其完成（空闲最多 10 分钟，`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`）；`Monitor` 工具的 watch 亦被等待，等待期间 Claude 持续响应 watch 上报（S3、S17）。
- 推断（D1）：`Stop`/`SubagentStop` hook 输入的 `background_tasks`（「Lets hooks distinguish "session is done" from "session is paused waiting for background work to wake it"」）与 `session_crons`（CronCreate、ScheduleWakeup、`/loop`），以及 `TerminalReason` 中的 `background_requested`，说明后台工作完成或定时器到期会以新的机器注入 turn「唤醒」会话，再次进入 2.5 所述的同一输入路径（`UserPromptSubmit.source` 为 `system`/`loop_wakeup`/`schedule_wakeup`）。
- `SDKMessageOrigin`（D1:L4950）枚举了注入来源：`human`、`channel`、`peer`（跨会话消息）、`task-notification`（含 `scheduled-trigger`、`peer-send-message`）、`coordinator`、`observer`、`auto-continuation` 等（推断为注入 turn 的来源标签）。
- `Notification` hook 的 matcher 值包含 `agent_needs_input`、`agent_completed`、`quota_auto_resume_*` 等（S1）。

---

## 3. 事件（`stream-json` / SDK 消息）

### 3.1 通道与开关

- CLI：`-p --output-format stream-json`（NDJSON，每行一个对象）；`--include-partial-messages` 加入 `stream_event`；`--input-format stream-json` 以 NDJSON 从 stdin 输入用户消息；`--replay-user-messages` 把 stdin 的用户消息回显到 stdout 以作确认；`--forward-subagent-text` 转发子 agent 的 text/thinking 块（S3、S16）。
- SDK：`query()` 返回 `Query extends AsyncGenerator<SDKMessage, void>`；`includePartialMessages`、`includeHookEvents`、`forwardSubagentText`、`agentProgressSummaries` 控制附加事件（D1 `Options`）。
- S14：五类核心消息为 `SystemMessage`、`AssistantMessage`、`UserMessage`、`StreamEvent`、`ResultMessage`；「iterate the stream to completion rather than breaking on the result」，因为 `prompt_suggestion` 等尾随事件可能在 result 之后。

### 3.2 主要消息类型（以 D1 为准）

| `type` / `subtype` | 触发时机 | 载荷要点 | 依据 |
|---|---|---|---|
| `system` / `init` | 每个 turn 开始（「emits at the start of each turn」），SessionStart/Setup hook 事件可能先于它 | `session_id, uuid, cwd, model, permissionMode, tools[], mcp_servers[{name,status}], mcp_server_errors?, slash_commands[], skills[], agents?, plugins[{name,path,version?}], plugin_errors?, apiKeySource, claude_code_version, output_style, effort?, capabilities?[]`（如 `interrupt_receipt_v1`） | D1:L5482；S3 |
| `system` / `compact_boundary` | compaction 完成后 | `compact_metadata.{trigger:'manual'\|'auto', pre_tokens, post_tokens?, duration_ms?, preserved_segment?, preserved_messages?}` | D1:L3457；S14 |
| `system` / `status` | 状态变化 | `status: 'compacting' \| 'requesting' \| null`，`permissionMode?`，`compact_result?`，`compact_error?` | D1:L5467 |
| `system` / `api_retry` | 可重试 API 错误再试前 | `attempt, max_retries, retry_delay_ms, error_status, error`（分类如 `rate_limit`、`overloaded`…）、`no_response?` | S3；D1:L3317 |
| `system` / `hook_started` `hook_progress` `hook_response` | hook 生命周期（SDK 需 `includeHookEvents`；SessionStart/Setup 时总出现在 init 前） | `hook_id, hook_name, hook_event, stdout, stderr, output, exit_code?, outcome:'success'\|'error'\|'cancelled'` | D1:L4814–L4855；S3 |
| `system` / `permission_denied` | 未经交互提示即被拒（分类器、`dontAsk`、deny 规则、无宿主的 ask） | `tool_name, tool_use_id, agent_id?, decision_reason_type?`（`classifier`/`mode`/`rule`…）、`message`（回给模型的拒绝文本） | D1:L5123；S3 |
| `system` / `task_started` `task_progress` `task_updated` `task_notification` `background_tasks_changed` | 后台/子 agent 任务生命周期 | `task_id, tool_use_id?, description, subagent_type?, is_backgrounded?, spawn_depth?, task_type?`；notification 带 `status, output_file, summary, usage` | D1:L5596、L5571、L5632、L5545、L3425 |
| `system` / `plugin_install` | 设置 `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` 时首 turn 前 | `status: started\|installed\|failed\|completed, name?, error?` | S3 |
| `system` / `informational`、`worker_shutting_down`、`notification`、`thinking_tokens`、`session_state_changed`、`commands_changed`、`auth_status`、`elicitation_complete`、`prompt_suggestion`、`mirror_error`、`memory_recall` 等 | 各类可观测性事件 | 见 `SDKMessage` 联合类型 | D1:L4945 |
| `assistant` | 模型每个内容块（text / thinking / tool_use）各一条；同一响应共享 `message.id` | `message`（Messages API 形状）、`parent_tool_use_id`（子 agent 内为父 Agent 调用 id，主线为 `null`）、`error?`（`SDKAssistantMessageError`）、`aborted?`、`user_message_uuid(s)?`、`subagent_type?`、`task_description?`、`uuid, session_id` | D1:L3339；S14；S3 |
| `user` | 工具执行后的 `tool_result` 回写；也用于用户流式输入及回放（`SDKUserMessageReplay`） | `message`（MessageParam）、`parent_tool_use_id`、`isSynthetic?`、`tool_use_result?`（工具的结构化 Output）、`priority?`、`shouldQuery?`、`origin?` | D1:L5700、L5776 |
| `stream_event` | 开启 partial messages 时，每个原始 Messages API 流事件 | `event`（`message_start`/`content_block_delta`…）、`parent_tool_use_id`、`ttft_ms?` | D1:L5090；S3 |
| `tool_progress` | 长时间工具执行心跳 | `tool_use_id, tool_name, elapsed_time_seconds, task_id?, heartbeat?, subagent_retry?` | D1:L5667 |
| `tool_use_summary` | 一组工具调用的摘要 | `summary, preceding_tool_use_ids[]` | D1:L5688 |
| `result` / `success` | 每 turn 恰一条，在该 turn 的其他消息之后（「treat it as the turn-complete signal」） | `result`（最终文本）、`is_error, num_turns, stop_reason, duration_ms, duration_api_ms, total_cost_usd, usage, modelUsage, permission_denials[], queued_turn_count?, structured_output?, terminal_reason?, result_index?, session_id, uuid` | D1:L5333、L5331 |
| `result` / `error_during_execution` `error_max_turns` `error_max_budget_usd` `error_max_structured_output_retries` | 异常终止 | 同上但无 `result`，多 `errors[]` | D1:L5276；S14 |
| `conversation_reset` | 对话重置 | `new_conversation_id` | D1:L4749 |

- `tool_use` / `tool_result` 不是独立顶层类型，而是 `assistant.message.content` 与 `user.message.content` 中的 Messages API 内容块（S7、S14）。
- 子 agent 消息在 stream 中以 `parent_tool_use_id` 归属；默认只转发子 agent 的 `tool_use`/`tool_result` 块，前台子 agent 的第一条是承载 prompt 的 `user` 消息（S3「Follow subagent messages」）。

---

## 4. Hooks

### 4.1 事件全表

D1:L864 `HOOK_EVENTS` 共 33 个：`PreToolUse, PostToolUse, PostToolUseFailure, PostToolBatch, Notification, UserPromptSubmit, UserPromptExpansion, SessionStart, SessionEnd, Stop, StopFailure, SubagentStart, SubagentStop, PreCompact, PostCompact, PreModelSwitch, PostModelSwitch, PermissionRequest, PermissionDenied, Setup, TeammateIdle, TaskCreated, TaskCompleted, Elicitation, ElicitationResult, ConfigChange, WorktreeCreate, WorktreeRemove, InstructionsLoaded, CwdChanged, FileChanged, DirectoryAdded, MessageDisplay`。S1/S2 事件表与之一致。

公共输入字段（D1:L167 `BaseHookInput`）：`session_id, transcript_path, cwd, hook_event_name, prompt_id?（关联 OTel prompt.id）, permission_mode?, agent_id?（仅子 agent 内）, agent_type?, effort?.level`；S1 另列 `scratchpad_dir?`（需 v2.1.257+）。

下表「输入」列以 D1 字段名为准（S1 的 WebFetch 摘要出现过 `user_prompt`、`tool_output` 等改写名，与 `.d.ts` 不符，故不采用）。「Py」表示 Python SDK 是否支持（S6 表）；所有事件 TS SDK 均支持。

| 事件 | 触发时机 | 事件专有输入（D1） | matcher（S1） | 输出 / 退出码语义 | 可阻断 | Py |
|---|---|---|---|---|---|---|
| `SessionStart` | 会话开始/恢复/清空/压缩/fork | `source: startup\|resume\|clear\|compact\|fork, model?, session_title?, seconds_since_last_response?, context_tokens?, prompt_cache_likely_expired?, estimated_cache_write_usd?`（L5936） | `startup\|resume\|clear\|compact\|fork` | stdout 纯文本作为上下文；`hookSpecificOutput: {additionalContext, initialUserMessage, sessionTitle, watchPaths[], reloadSkills}`（L5960）；exit 2 阻止会话启动（S1） | 是 | 否 |
| `Setup` | `--init-only`/`--init`/`--maintenance` | `trigger: init\|maintenance`（L8683） | `init\|maintenance` | `additionalContext`；exit 2 阻止（S1）；MCP 尚不可用 | 是 | 否 |
| `UserPromptSubmit` | 提交 prompt、模型处理前 | `prompt, source?, session_title?`（L9164） | 无 | exit 0 的 stdout 加入上下文；exit 2「Blocks prompt processing and erases the prompt」；JSON `decision:"block"+reason`；`hookSpecificOutput: {additionalContext, sessionTitle, suppressOriginalPrompt}`（L9174）；超时也阻断（S6） | 是 | 是 |
| `UserPromptExpansion` | 用户键入的命令或 MCP prompt 展开为 prompt 前（模型自己调 skill 不触发） | `expansion_type: slash_command\|mcp_prompt, command_name, command_args, command_source?, prompt`（L9146） | skill/命令名 | exit 2 阻止展开；`additionalContext, suppressOriginalPrompt`（L9155） | 是 | 否 |
| `PreToolUse` | 工具执行前、权限判定前 | `tool_name, tool_input, tool_use_id`（L2580） | 工具名（`Bash`、`Edit\|Write`、`mcp__.*`）；另有 `if: "Bash(rm *)"` 参数级过滤 | exit 2 阻断（即使 JSON 写 allow 也不能覆盖）；`hookSpecificOutput: {permissionDecision: allow\|deny\|ask\|defer, permissionDecisionReason, updatedInput, additionalContext}`（L2587）；多 hook 取最严格 `deny > defer > ask > allow`；`defer` 结束查询以便稍后恢复；多个 `updatedInput` 时最后完成者生效；命令 hook 超时不阻断但 SDK 回调超时会使工具不执行（S1、S2、S6） | 是 | 是 |
| `PermissionRequest` | 工具调用需要权限决定（将要提示用户时） | `tool_name, tool_input, permission_suggestions?`（L2329） | 工具名 | exit 2 **不**生效；须用 `hookSpecificOutput.decision: {behavior:'allow', updatedInput?, updatedPermissions?} \| {behavior:'deny', message?, interrupt?}`（L2336）；`-p` 无 `canUseTool` 时无提示，应改用 PreToolUse（S2） | 决定权限 | 是 |
| `PermissionDenied` | auto 模式拒绝工具调用（含无分类器裁决的拒绝） | `tool_name, tool_input, tool_use_id, reason`（L2311） | 工具名 | `hookSpecificOutput.retry: true` 告知模型可重试（无裁决时忽略）（L2319） | 否 | 否 |
| `PostToolUse` | 工具成功后 | `tool_name, tool_input, tool_response, tool_use_id, duration_ms?`（L2498） | 工具名 | exit 2 阻断（模型收不到输出，但动作已执行）；`hookSpecificOutput: {additionalContext, updatedToolOutput, updatedMCPToolOutput(弃用), classifierContext}`（L2510） | 是（事后） | 是 |
| `PostToolUseFailure` | 工具失败后 | `tool_name, tool_input, tool_use_id, error, is_interrupt?, duration_ms?`（L2480） | 工具名 | `additionalContext`（L2493）；S1 摘要称 exit 2 可阻断 | 是 | 是 |
| `PostToolBatch` | 一批并行工具全部返回后、下一次模型调用前 | `tool_calls[{tool_name, tool_input, tool_use_id, tool_response?}]`（L2463） | 无 | `additionalContext`（L2468） | 否 | 否 |
| `Notification` | Claude Code 发通知时 | `message, title?, notification_type`（L1348） | 通知类型：`permission_prompt, idle_prompt, auth_success, elicitation_*, agent_needs_input, agent_completed, quota_auto_resume_*` | 不阻断；`additionalContext`（L1355） | 否 | 是 |
| `MessageDisplay` | assistant 文本显示时（按 flush 分片） | `turn_id, message_id, index, final, delta`（L1238） | 无 | 仅显示层：`displayContent` 替换屏幕上的 delta，不改转录（L1265）；默认超时 10s | 否 | 否 |
| `SubagentStart` | 子 agent 生成时 | `agent_id, agent_type`（L8856） | agent 类型（`general-purpose`、`Explore`、自定义名、`^plugin:reviewer$`） | `additionalContext`（L8862） | 否 | 是 |
| `SubagentStop` | 子 agent 完成时 | `stop_hook_active, agent_id, agent_transcript_path, agent_type, last_assistant_message?, background_tasks?, session_crons?`（L8867） | agent 类型 | exit 2 / `decision:"block"` 阻止子 agent 停止；`additionalContext` 让子 agent 继续（L8892） | 是 | 是 |
| `Stop` | Claude 完成响应时（不含用户中断） | `stop_hook_active, last_assistant_message?, background_tasks?, session_crons?`（L8829） | 无 | exit 2 / `decision:"block"+reason` 阻止停止；`additionalContext`（L8851）；8 次连续阻止上限 | 是 | 是 |
| `StopFailure` | turn 因 API 错误结束 | `error: SDKAssistantMessageError, error_details?, last_assistant_message?`（L8822） | 错误类型：`rate_limit, overloaded, authentication_failed, …, max_output_tokens, cloud_credential_error, unknown` | 退出码与 JSON 均被忽略（仅副作用） | 否 | 否 |
| `TeammateIdle` | agent team 成员即将空闲 | `teammate_name, team_name(弃用)`（L8955） | 未覆盖 | 未覆盖（S1 摘要归入「其他」：仅 `systemMessage/additionalContext`） | 未覆盖 | 否 |
| `TaskCreated` / `TaskCompleted` | `TaskCreate` 创建 / 任务标记完成 | `task_id, task_subject, task_description?, teammate_name?`（L8943、L8931） | 无 | S6：TaskCompleted 可「Require passing tests before a task closes」（推断可阻断） | 推断是 | 否 |
| `PreCompact` / `PostCompact` | 压缩前 / 后 | `trigger: manual\|auto, custom_instructions` / `trigger, compact_summary`（L2527、L2405） | `manual\|auto` | 无决定字段（S1 归入仅 `systemMessage/additionalContext`） | 否 | Pre 是 / Post 否 |
| `PreModelSwitch` / `PostModelSwitch` | 模型切换前（可阻止）/ 后（含自动 fallback、恢复时还原） | `from_model, to_model, model_switch_reason`（L2533、L2414） | 目标模型名（支持正则） | Pre: exit 2 阻止，超时也阻止；Post: 异步，stdout 作为上下文；默认超时 30s | Pre 是 | 否 |
| `Elicitation` / `ElicitationResult` | MCP 服务器请求用户输入 / 用户响应后回传前 | `mcp_server_name, message, mode?: form\|url, url?, elicitation_id?, requested_schema?` / `… action: accept\|decline\|cancel, content?`（L606、L658） | MCP 服务器名 | `hookSpecificOutput: {action, content}` 可程序化接受/拒绝或改写响应（L619、L670） | 决定/改写 | 否 |
| `ConfigChange` | 会话中配置文件变化 | （L281）`config_source` 等 | `user_settings\|project_settings\|local_settings\|policy_settings\|skills` | 无决定字段 | 否 | 否 |
| `InstructionsLoaded` | CLAUDE.md 或 `.claude/rules/*.md` 加载入上下文 | （L968）`file_path, load_reason` | `session_start\|nested_traversal\|path_glob_match\|include\|compact` | 无决定字段 | 否 | 否 |
| `CwdChanged` / `DirectoryAdded` | 工作目录变化 / 中途 `/add-dir` 或 SDK `register_repo_root` | （L553、L580） | Cwd 无；DirectoryAdded `slash_command\|register_repo_root` | `CwdChangedHookSpecificOutput`（L559） | 否 | 否 |
| `FileChanged` | 被监视文件变化 | （L690） | 精确文件名列表 `.envrc\|.env`（无正则） | `FileChangedHookSpecificOutput`（L696） | 否 | 否 |
| `WorktreeCreate` / `WorktreeRemove` | `--worktree`、`isolation: "worktree"`、后台会话创建 / 移除 worktree | （L9203、L9216）`worktree_path, worktree_name` | 无 | Create: 任何非零退出码中止创建，且「Replaces default git behavior」；Remove: 非零且目录仍在则移除失败 | 是 | 否 |
| `SessionEnd` | 会话终止（含 SIGTERM） | `reason: clear\|resume\|logout\|prompt_input_exit\|other`（L5875） | 同 reason | 不阻断；所有 SessionEnd hook 共享 1.5s 预算（最高提至 60s） | 否 | 否 |

### 4.2 输出格式与通用字段

- 通用 JSON（D1:L8897 `SyncHookJSONOutput`）：`continue?: boolean, suppressOutput?: boolean, stopReason?: string, decision?: 'approve' | 'block', reason?: string, systemMessage?: string, terminalSequence?: string, hookSpecificOutput?: <按事件>`。S6：「`systemMessage` shows a message to the user, and `continue` … determines whether the agent keeps running after this hook. Some events discard them or deliver them elsewhere」。
- 异步输出（D1:L129）：`{ async: true, asyncTimeout?: number }`，「the agent proceeds without waiting」（S6）。
- 退出码（S1）：exit 0 成功，JSON 生效；对 `UserPromptSubmit/UserPromptExpansion/SessionStart/PostModelSwitch` 纯文本 stdout 作为 Claude 可见上下文，其他事件 stdout 仅进 debug log。exit 2 阻断（能阻断的事件），stderr 作为阻断理由，JSON 若失败仍阻断。其他退出码「doesn't block on its own」，exit 1 被当作非阻断错误并继续。
- `additionalContext` 「is injected as a system reminder that Claude reads as plain text」（S2）。

### 4.3 Hook 类型（S1、S2）

| `type` | 关键字段 | 语义 | 默认超时 |
|---|---|---|---|
| `command` | `command`（shell 形式 `sh -c`，或带 `args` 的 exec 形式）、`async`、`asyncRewake`（后台运行、exit 2 时以 stderr/stdout 作为 system reminder 唤醒 Claude）、`shell: bash\|powershell` | 通过 stdin JSON / stdout JSON / 退出码通信；`${CLAUDE_PROJECT_DIR}`、`${CLAUDE_PLUGIN_ROOT}`、`${CLAUDE_PLUGIN_DATA}` 占位；`async: true` 不强制超时 | 600s（`UserPromptSubmit`、`PreModelSwitch`、`PostModelSwitch` 30s；`MessageDisplay` 10s） |
| `http` | `url`、`headers`（可插值 `allowedEnvVars` 列出的环境变量）、`timeout` | POST 输入 JSON，响应体按同一 JSON 输出格式解析；URL 须匹配 `allowedHttpHookUrls`；HTTP 状态码不直接决定行为 | 同 command |
| `mcp_tool` | `server`（含 `plugin:<plugin>:<server>`）、`tool`、`input`（支持 `${tool_input.file_path}` 路径替换） | 调用已连接 MCP 服务器上的工具，文本输出等同 command stdout；`SessionStart`(startup) 与 `Setup` 时跳过（MCP 未就绪） | 同 command |
| `prompt` | `prompt`（`$ARGUMENTS` 填入输入 JSON）、`model`（默认 Haiku 级）、`continueOnBlock` | 单轮模型判定，返回 `{"ok": bool, "reason", "impossible"?}`；`ok:false` 在 Stop/SubagentStop 将 reason 反馈给 Claude 继续工作，`impossible:true` 允许停止；在 PreToolUse 默认拒绝并结束 turn，`continueOnBlock:true` 则作为工具错误返回并继续 | 30s |
| `agent` | `prompt`、`timeout` | 实验性；生成可用工具的子 agent 验证，最多 50 个工具 turn，`ok/reason` 格式，不支持 `impossible`；`ok:false` 按 `continueOnBlock:true` 处理 | 60s |

公共字段：`type`、`if`（权限规则语法过滤，如 `"Bash(rm *)"`，best-effort）、`timeout`（秒）、`statusMessage`、`once`（仅 skill frontmatter 有效，首次成功运行后移除）（S1）。

### 4.4 配置作用域与合并（S1、S2）

| 位置 | 作用域 | 备注 |
|---|---|---|
| `~/.claude/settings.json` | 用户（所有项目） | 启动时读取 |
| `.claude/settings.json` | 项目（可提交） | `-p` 在未信任目录也会运行（S3） |
| `.claude/settings.local.json` | 项目本地（gitignored） | |
| Managed policy settings | 组织（MDM/企业） | `allowManagedHooksOnly` 打开时禁用 user/project/local/plugin hooks |
| Plugin `hooks/hooks.json` | 插件启用期间 | 与其他来源合并 |
| Skill frontmatter `hooks:` | 技能被调用后到会话结束 | `once: true` 可一次性 |
| Subagent frontmatter `hooks:` | 该子 agent 运行期间 | 需接受 workspace trust；`Stop` 转为 `SubagentStop` |
| SDK `options.hooks` | 当前 `query()` | 回调形式，与 settings 来源（按 `settingSources`）叠加（S6） |

- 合并规则：各来源 hooks **合并**而非替换；同一 handler 在多个 settings 文件中定义只运行一次，plugin/skill 的副本单独运行；`disableAllHooks: true` 禁用 user/project/local（只有 managed 层可禁 managed）。
- 执行：「All matching hooks run in parallel」，无顺序保证；所有 hook 跑完后合并结果；`PreToolUse` 权限决定取最严格；`additionalContext` 全部保留拼接；一个 hook 的 deny 不会阻止兄弟 hook 的副作用（S2）。
- 与权限模式的关系：`PreToolUse` 在任何权限模式（含 `dontAsk`）下都先于模式检查触发，deny 在 `bypassPermissions` 下也生效；allow 不能越过 deny 规则/ask 规则/`requiresUserInteraction`/critical path（S2、S18）。
- 调试：`CLAUDE_CODE_LOG_LEVEL=debug`、`/hooks` 只读浏览器（S1）。

### 4.5 SDK 回调形态（D1、S6）

- `Options.hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>`；`HookCallbackMatcher { matcher?: string; hooks: HookCallback[]; timeout?: number }`（D1:L876）。
- `HookCallback = (input: HookInput, toolUseID: string | undefined, options: { signal: AbortSignal }) => Promise<HookJSONOutput>`（D1:L869）。
- 超时后果（S6）：`PreToolUse` 回调超时 → 工具不执行、Claude 收到「hook didn't respond」的 tool result；`UserPromptSubmit`/`UserPromptExpansion` 超时 → prompt 被阻断。这与 command hook「PreToolUse timed-out … doesn't block」不同（S1）。
- Python SDK 不支持 `SessionStart`/`SessionEnd` 回调（只能通过 settings 中的 command hook），且多数 TS 独有事件缺席（S6 表）。

---

## 5. 其他扩展点在循环中的介入位置

| 扩展点 | 介入位置 | 依据 |
|---|---|---|
| MCP 服务器 | 工具定义层：工具名 `mcp__<server>__<tool>`；默认 schema 延迟加载，通过 tool search 按需加载（只有名称与服务器说明占上下文）；`-p --mcp-config` 会等待服务器连接（`MCP_TIMEOUT` 默认 30s）；`system/init.mcp_servers` 报告状态；MCP elicitation 经 `Elicitation`/`ElicitationResult` hook 或 SDK `onElicitation` 回调进入权限/交互环节；SDK 可用 `createSdkMcpServer`/`tool()` 定义进程内工具（D1:L521、L8998） | S3、S10、S14、D1 |
| Skills | 会话开始时加载技能描述列表；正文在调用时加载（`Skill` 工具或用户 `/name`）；用户键入触发 `UserPromptExpansion` hook；技能 frontmatter 可带 hooks；压缩后正文按额度重注入而描述列表不重载；`disable-model-invocation` 让描述也不进上下文 | S10、S15、S1 |
| Plugins | 打包 skills、agents、hooks（`hooks/hooks.json`）、MCP 服务器；启动时加载，`system/init.plugins`/`plugin_errors` 报告；`Query.reloadPlugins()` 可热重载（含 prompt cache 影响检查） | S4、S3、D1 |
| CLAUDE.md / 规则 | 项目根 CLAUDE.md 与无路径限定规则在会话开始进入系统提示侧，「re-injected on every request」/压缩后从磁盘重注入；嵌套 CLAUDE.md 与 `paths:` 规则在读到匹配文件时惰性加载并进入消息历史；每次加载触发 `InstructionsLoaded` hook；`--bare` 跳过加载；SDK 通过 `settingSources` 控制 | S14、S15、S1、S3 |
| 自定义 subagent 定义 | `.claude/agents/*.md`（frontmatter：`name, description, tools, model, permissionMode, hooks, memory, isolation, background, maxTurns, skills`）、`--agents <json>`、SDK `agents` 选项；由模型通过 `Agent` 工具调用进入循环（见 2.6） | S12、S7、S16 |
| settings 权限规则 | `permissions.allow/deny/ask` 在 1.3 所述第 2、3、5 步参与判定；`defaultMode` 决定起始模式；`Query.setPermissionMode()`/`applyFlagSettings()` 可中途修改 | S18、S11、D1 |
| 系统提示 | `--system-prompt` 替换、`--append-system-prompt` 追加；SDK `systemPrompt: string \| { type:'preset', preset:'claude_code', append? }`；`SYSTEM_PROMPT_DYNAMIC_BOUNDARY` 标记静态/动态分界以利跨会话缓存（D1:L8921） | S3、D1 |

---

## 6. 持久化与恢复

| 项 | 事实 | 依据 |
|---|---|---|
| 转录位置与格式 | `~/.claude/projects/<project>/<session-id>.jsonl`，`<project>` 为工作目录路径非字母数字替换为 `-`（超过 200 字符截断加哈希）；`CLAUDE_CONFIG_DIR`、`CLAUDE_CODE_PROJECT_DIR_NAME` 可改；「Each line is a JSON object for a message, tool use, or metadata entry. The entry format is internal to Claude Code and changes between versions」 | S13 |
| 写入内容 | 「your prompt, every tool call the agent made, every tool result, and every response」；子 agent 转录单独文件（`subagents/agent-{id}` 子路径，D1:L5886 `SessionKey` 注释） | S8、D1 |
| 保留与关闭 | 30 天 `cleanupPeriodDays`；`--no-session-persistence`（`-p`）、`CLAUDE_CODE_SKIP_PROMPT_HISTORY`、SDK `persistSession: false` | S13、S8 |
| continue | `--continue` / SDK `continue: true`：当前目录最近会话；交互式 `--continue` 跳过 `-p`/SDK 会话与首条为 `/loop` 的会话，`-p --continue` 包含它们 | S13、S16 |
| resume | `--resume <id\|name\|.jsonl 路径>` / SDK `resume: sessionId`；v2.1.223 起跨项目按 id 查找；同一会话在两个终端恢复时消息交错写入同一转录 | S13、S16 |
| fork | `--fork-session`（配合 `--resume`/`--continue`）、`/branch`、SDK `forkSession: true`：复制历史到新 session id，原会话不变；`/branch` 在同进程内切换，保留「allow for this session」授权与运行中的后台任务；跨进程 fork 需重新审批 | S13、S8、S10 |
| 恢复时还原什么 | 完整历史（含工具调用与结果；崩溃时仍在运行的工具不会完成或重跑）、模型、`--agent`、权限模式（终端路径按 S13 表；`-p` 路径按新会话规则，plan 模式需四个条件）、活动 goal、未过期的 scheduled tasks；后台 Bash 与 monitor 任务不还原；`--mcp-config`、`--settings`、`--plugin-dir`、`--add-dir` 等启动参数不还原 | S13 |
| SIGTERM | 退出码 143，当前 turn 记为未完成、无 result；只运行 `SessionEnd` hook；resume 时「continues the turn that SIGTERM left unfinished」 | S3 |
| 恢复入口的 hooks/事件 | `SessionStart` with `source: resume|fork` 附 `seconds_since_last_response`、`context_tokens`、`prompt_cache_likely_expired`、`estimated_cache_write_usd`；Pro/Max 超 1 小时且 >100K tokens 的恢复会弹出「Resume from summary」对话 | D1:L5936、S13 |
| 精细恢复（SDK） | `resumeSessionAt`（到某条消息 uuid）、`resumeDropsTurn`；`listSessions()`、`getSessionMessages()`、`getSubagentMessages()`、`forkSession()`、`renameSession()`、`tagSession()`、`deleteSession()`；`sessionStore` 适配器把转录镜像到外部存储（本地仍先写盘），`importSessionToStore()` | D1:L1002–L1062、L748、L5985、L905；S8 |
| 文件检查点 | 与转录分离：编辑前快照文件，`Esc Esc`/`/rewind` 回退；SDK `enableFileCheckpointing` + `Query.rewindFiles(userMessageId)` | S10、D1 |

---

## 7. 小结表：循环阶段 → 事件 → hook → 能否阻断/改写

| 循环阶段 | 对应 stream/SDK 事件 | 对应 hook | 能否阻断 / 改写 |
|---|---|---|---|
| 一次性准备（`--init-only`/`--maintenance`） | `system/hook_*` | `Setup` | exit 2 阻断；`additionalContext` |
| 会话开始 / 恢复 / 清空 / 压缩后 / fork | `system/hook_*` → `system/init` | `SessionStart` | exit 2 阻断启动；注入 `additionalContext`、`initialUserMessage`、`watchPaths`、`reloadSkills` |
| 用户输入进入 | （输入侧 `user`；`--replay-user-messages` 回显） | `UserPromptSubmit` → `UserPromptExpansion` | 可阻断并擦除 prompt；可注入上下文；`suppressOriginalPrompt` |
| 系统提示/指令装配 | — | `InstructionsLoaded`（观测） | 否 |
| 模型调用 | `system/status: requesting`、`stream_event`、`assistant`、`system/api_retry`、`thinking_tokens` | `MessageDisplay`（仅显示层）；模型切换时 `PreModelSwitch`/`PostModelSwitch` | MessageDisplay 仅改显示；PreModelSwitch 可阻断切换 |
| 工具调用前 | `assistant`（`tool_use` 块） | `PreToolUse` | 阻断（deny）、`ask`、`defer`、改写 `updatedInput`、注入上下文 |
| 权限判定 | `system/permission_denied`；SDK `canUseTool` 控制请求 | `PermissionRequest`（将提示时）、`PermissionDenied`（auto 拒绝后） | `decision.behavior allow/deny` 并可 `updatedInput`/`updatedPermissions`；`retry` 提示 |
| 工具执行中 | `tool_progress`；后台任务 `system/task_*`、`background_tasks_changed` | `CwdChanged`、`FileChanged`、`DirectoryAdded`、`WorktreeCreate/Remove`、`Elicitation`/`ElicitationResult` | WorktreeCreate 非零中止；Elicitation 可决定/改写响应 |
| 结果回写 | `user`（`tool_result`）、`tool_use_summary` | `PostToolUse` / `PostToolUseFailure` → `PostToolBatch` | PostToolUse 可阻断模型看到输出、`updatedToolOutput` 改写、`additionalContext`；Batch 仅追加上下文 |
| 子 agent 生成 / 完成 | `system/task_started`…`task_notification`；带 `parent_tool_use_id` 的 `assistant`/`user` | `SubagentStart` / `SubagentStop` | Start 注入上下文；Stop 可阻止子 agent 结束（exit 2 / block） |
| 上下文压缩 | `system/status: compacting` → `system/compact_boundary` | `PreCompact` → `PostCompact` → `SessionStart(compact)` | 不能阻断（未覆盖是否可）；SessionStart(compact) 可注入上下文；`custom_instructions` 供 hook 读取 |
| 任务/团队事件 | `system/task_*` | `TaskCreated`、`TaskCompleted`、`TeammateIdle` | TaskCompleted 推断可阻断（S6 示例）；其余未覆盖 |
| turn 结束 | `result`（`success`/`error_*`，`terminal_reason`） | `Stop`（正常）/ `StopFailure`（API 错误） | Stop 可阻止停止（exit 2 / `decision:block`，8 次上限）、`additionalContext`；StopFailure 不可 |
| 通知 | `system/notification` 等 | `Notification` | 否 |
| 配置变化 | `system/commands_changed` 等 | `ConfigChange` | 否 |
| 会话终止 | `system/worker_shutting_down` | `SessionEnd` | 否（1.5s 共享预算） |

---

## 8. 局限与未覆盖

- **实现细节不可见**：Claude Code 闭源；循环内部（如工具并行调度器、队列优先级 `now/next/later` 的确切调度、`TerminalReason` 每个值的触发条件、`rapid_refill_breaker` 的阈值）只有类型定义与文档描述，本文中标「推断」的部分均未经源码验证。
- **TypeScript 参考页**：S9 的 WebFetch 返回的是小模型二次摘要，其中出现了与 `.d.ts` 不符的字段（如 `SDKResultMessage.toolUseId`），故本文的类型事实全部改引 D1（`sdk.d.ts`）行号；建议后续直接读该文件而非依赖该页摘要。
- **Hooks reference 的字段名**：S1 的 WebFetch 摘要把 `prompt`/`tool_response` 改写成 `user_prompt`/`tool_output`，本文以 D1 为准；`TeammateIdle`、`ConfigChange`、`CwdChanged`、`FileChanged`、`DirectoryAdded`、`WorktreeCreate` 的输入字段本文仅给出 D1 行号，未逐字段展开。
- **未覆盖**：
  - `PreCompact`/`PostCompact`、`TaskCreated`/`TaskCompleted`、`TeammateIdle` 是否支持 exit 2 阻断（文档摘要未明确；D1 的 hookSpecificOutput 中这些事件无决定字段）。
  - auto-compact 的「clears older tool outputs first」的具体阈值与算法；S19 未提到百分比式设置。
  - stream-json 输入侧（`--input-format stream-json`）除 `SDKUserMessage` 外是否接受控制帧（`SDKControlRequest` 类型存在于 D1:L4608，但 CLI 文档未描述其 stdio 协议细节）。
  - Anthropic 工程博客中关于 Claude Code 具体循环实现的进一步说明（S20 只覆盖上下文工程与 compaction 原则；「A harness for every task」博客与「Loop engineering」博客本次未抓取）。
  - Python SDK 的消息与 hook 形态仅按 S6/S14 的对照说明，未读 Python 包。
- **版本依赖**：多处行为带 Claude Code 版本条件（如 `--permission-prompts` 需 v2.1.259+、后台子 agent 默认化 v2.1.198+、跨项目 resume v2.1.223+、`capabilities` 字段 v2.1.205+）；本文以 2026-09-14 的文档与 SDK 0.3.270 为准。
