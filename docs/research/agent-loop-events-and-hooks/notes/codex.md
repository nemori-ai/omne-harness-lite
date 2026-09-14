<!-- 分系统核对笔记：OpenAI Codex。2026-09-14 由只读调研 subagent 按固定提交/版本产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# OpenAI Codex（codex-rs）Agent Loop / 事件 / Hooks 调研笔记

- 来源仓库：https://github.com/openai/codex，`git clone --depth 1` 到仓库 Git 忽略的临时目录（可重新生成）
- 克隆到的提交：`d77ebc72237a639b6d877f2edc3b20b54631f25e`（2026-09-14），本文引用一律写作 `路径@d77ebc7`
- 最近 release tag（`git ls-remote --tags`，按语义版本排序）：`rust-v0.154.0`（其后还有 `rust-v0.153.x` 等补丁 tag；深度 1 克隆无法确认 HEAD 与该 tag 的具体距离，标「未覆盖」）
- 官方文档：仓库内 `docs/*.md` 大多已缩成指向 https://developers.openai.com/codex/… 的跳转页；hooks 页面实际重定向到 `https://learn.chatgpt.com/docs/hooks`（本文通过抓取核对过一次，见 §4.1）
- 标注约定：无标注 = 直接抄自源码/文档；「推断」= 仅从源码结构推断；「未覆盖」= 未能核实

> 注意：`codex-rs/docs/protocol_v1.md@d77ebc7` 已过时——它仍描述 `Op::UserTurn`、`Op::ConfigureSession`，而当前 `protocol.rs` 中已不存在这些成员（用户输入统一为 `Op::TurnInput`）。本文以源码为准。

---

## 1. 总体架构定位

### 1.1 分层（crate 视角）

| 层 | crate（`codex-rs/`） | 职责 | 依据 |
|---|---|---|---|
| 协议 | `protocol` | `Op`（客户端→核心）、`EventMsg`（核心→客户端）、`ReviewDecision`、`AskForApproval`、`SandboxPolicy`、`TurnItem`、`SessionMeta` 等语言无关数据契约（serde + ts-rs + JsonSchema 派生） | `protocol/src/protocol.rs@d77ebc7`、`protocol/src/turn_input.rs`、`protocol/src/items.rs` |
| 核心 | `core` | `Session`/`TurnContext`/`StepContext`，提交队列循环、任务（`RegularTask`/`CompactTask`/`ReviewTask`/`UserShellCommandTask`）、工具路由与并行、审批与沙箱编排、hooks 运行时、compaction、多 agent 控制 | `core/src/session/`、`core/src/tasks/`、`core/src/tools/`、`core/src/hook_runtime.rs`、`core/src/agent/` |
| Hooks 引擎 | `hooks` | 发现/信任/匹配/执行用户 hooks（command / mcp_tool），解析 stdout JSON，legacy `notify` | `hooks/src/lib.rs`、`hooks/src/engine/*`、`hooks/src/events/*` |
| 持久化 | `rollout`、`history`、`thread-store`、`state` | rollout JSONL（可 `.zst` 压缩）+ SQLite 状态库；`RolloutItem` 枚举定义 | `rollout/src/lib.rs`、`history/src/lib.rs`、`rollout/src/state_db.rs` |
| App Server 协议 | `app-server-protocol` | JSON-RPC 方法/通知/服务器请求（`thread/*`、`turn/*`、`item/*`、`hook/*`…），v1（旧）与 v2 两套 | `app-server-protocol/src/protocol/common.rs@d77ebc7` |
| App Server | `app-server`、`app-server-daemon`、`app-server-transport` | 把 `EventMsg` 映射为 JSON-RPC 通知，把审批 `EventMsg` 转成服务器→客户端请求 | `app-server/src/bespoke_event_handling.rs@d77ebc7` |
| 前端 | `tui`（交互式终端）、`exec`（`codex exec` 非交互，JSONL/人类可读输出）、`cli`（命令入口） | 消费 `EventMsg`/app-server 通知 | `tui/src/`、`exec/src/event_processor*.rs`、`cli/src/` |
| 扩展框架 | `ext/extension-api` 等 | 进程内 contributor trait（`ThreadLifecycleContributor`、`TurnLifecycleContributor`、`ToolLifecycleContributor`、`TurnItemContributor`），区别于用户 hooks | `ext/extension-api/src/contributors.rs@d77ebc7:136-377` |
| 沙箱 | `linux-sandbox`、`bwrap`、`windows-sandbox-rs`、`sandboxing`、`execpolicy`、`network-proxy` | 平台沙箱实现、execpolicy 规则、网络代理 | 目录存在，内部未细读（未覆盖） |

`protocol_v1.md` 的核心心智模型仍适用：`Codex` 通过 **SQ（Submission Queue）/ EQ（Event Queue）** 与 UI 通信；`Session` 同时最多运行一个 `Task`；`Task` 由一系列对模型的请求组成（`codex-rs/docs/protocol_v1.md@d77ebc7`）。

### 1.2 一次用户输入到 `TurnComplete` 的完整路径

```
客户端 (TUI / app-server turn/start)
  └─ Op::TurnInput{request, mode, reply}                 protocol/src/protocol.rs@d77ebc7:600+
      └─ session/handlers.rs 提交循环 match sub.op       core/src/session/handlers.rs@d77ebc7:416-600
          └─ turn_input::handle(mode)                     core/src/session/turn_input.rs@d77ebc7:203-230
              ├─ StartOrSteer: 先尝试 steer_input；NoActiveTurn → apply_started → spawn_task(RegularTask)
              ├─ StartIfIdle : 仅空闲时启动
              └─ Steer{expected_turn_id}: 追加到当前 turn 的 pending_input
                  └─ Session::spawn_task → abort_all_tasks(Replaced) → start_task    core/src/tasks/mod.rs@d77ebc7
                      ├─ emit_turn_start_lifecycle（扩展 contributor）
                      └─ tokio::spawn(RegularTask::run)                                core/src/tasks/regular.rs@d77ebc7
                          ├─ emit_turn_started → EventMsg::TurnStarted
                          └─ loop { run_turn(...) ; 若无 pending_input 则 break }
                              run_turn（见 §2）→ 采样/工具/审批/沙箱/compaction …
                      └─ on_task_finished → EventMsg::TurnComplete 或 TurnAborted     core/src/tasks/mod.rs@d77ebc7 on_task_finished
```

`RegularTask::run` 的外层 `loop` 只在 `run_turn` 返回后仍有 pending input（steering 追加的输入）时再次进入 `run_turn`；终端错误（`ctx.terminal_error`）则直接返回（`core/src/tasks/regular.rs@d77ebc7`）。

### 1.3 审批策略与沙箱策略在循环中的位置

- 策略枚举（`protocol/src/protocol.rs@d77ebc7:985-1120`）：
  - `AskForApproval { UnlessTrusted(序列化 "untrusted"), OnRequest(默认, alias "on-failure"), Granular(GranularApprovalConfig{sandbox_approval, rules, skill_approval, request_permissions, mcp_elicitations}), Never }`
  - `SandboxPolicy { DangerFullAccess, ReadOnly{network_access}, ExternalSandbox{network_access: NetworkAccess}, WorkspaceWrite{writable_roots, network_access, exclude_tmpdir_env_var, exclude_slash_tmp} }`
  - `ApprovalsReviewer { User(默认), AutoReview(alias "guardian_subagent") }`（`protocol/src/config_types.rs@d77ebc7:183`）
- 这些策略随 `TurnContext`/`StepContext` 携带，在**工具执行阶段**由 `ToolOrchestrator::run` 消费（`core/src/tools/orchestrator.rs@d77ebc7:122-540`）：
  1. 计算 `ExecApprovalRequirement { Skip{bypass_sandbox,..}, NeedsApproval{reason,..}, Forbidden{reason} }`（`core/src/tools/sandboxing.rs@d77ebc7:152-230`）：`Never` → 不问；`OnRequest`/`Granular` → 仅当文件系统沙箱为 `Restricted` 时问；`UnlessTrusted` → 总问；`Granular` 且不允许 sandbox_approval → `Forbidden`。
  2. `NeedsApproval` → `Session::request_approval`（§4.3）；`Skip` 且开启 strict auto review → 仍走 Guardian。
  3. 决定首次尝试是否绕过沙箱（`sandbox_override_for_first_attempt`），选择沙箱类型（`SandboxManager::select_initial`），执行。
  4. 若沙箱拒绝（`SandboxErr::Denied`）且工具 `escalate_on_failure()` 为真、策略允许，则再次请求审批（`retry_reason`），并以提权方式重试一次（`orchestrator.rs@d77ebc7:330-540`）。
- 因而审批/沙箱不在「模型采样循环」层，而在**每个工具调用的执行路径**上；模型侧只看到工具输出。

---

## 2. Agent Loop

### 2.1 `run_turn` 的步骤（`core/src/session/turn.rs@d77ebc7:163-786`）

| 序 | 步骤 | 说明 | 依据 |
|---|---|---|---|
| 0 | 排空异步 hook 结果 | `drain_async_hook_results(before_user_prompt=true)` | turn.rs:174 附近 |
| 1 | 采样前 compaction | `run_pre_sampling_compact`：模型切换/comp_hash 变化/降配 → `CompactionReason::{CompHashChanged, ModelDownshift}`；或 `token_limit_reached` → `ContextLimit`，`CompactionPhase::PreTurn` | turn.rs:1231-1397 |
| 2 | 解析输入所需的 MCP/plugins | `required_mcp_servers_for_input`、`collect_explicit_plugin_ids`；捕获第一份 `StepContext`（工具集、设置快照） | turn.rs |
| 3 | 世界状态/skills 注入 | `record_context_updates_and_set_reference_context_item`、`build_skills_and_plugins` | turn.rs |
| 4 | SessionStart/SubagentStart hooks | `run_pending_session_start_hooks`（返回 true 则整 turn 直接结束） | turn.rs:320；hook_runtime.rs:126 |
| 5 | UserPromptSubmit hooks + 记录输入 | `run_hooks_and_record_inputs(..., PersistContext::TurnStart)`：每条 `TurnInput::UserInput` 触发 `UserPromptSubmit`；被 block 且没有任何被接受的用户输入 → 结束 turn | turn.rs:809-851；hook_runtime.rs:670-775 |
| 6 | 采样循环 `loop {}` | 见下 | turn.rs:~410-780 |

采样循环每轮：

1. `get_pending_input` 取 steering 输入（以及 mailbox 中的 agent 间消息），再对其跑 `UserPromptSubmit` 并记录进历史。
2. 构造 prompt：`sess.clone_history().for_prompt(input_modalities)` + `build_prompt`（`turn.rs@d77ebc7:1509`）。
3. `run_sampling_request` → `try_run_sampling_request`（`turn.rs@d77ebc7:1538-1656, 2409-3026`）：调用 `client_session.stream(...)`（Responses API 流式），逐个处理 `ResponseEvent`：
   - `OutputItemAdded` → 发 `ItemStarted`；`OutputTextDelta` → `AgentMessageContentDelta`；`ReasoningSummaryDelta`/`ReasoningContentDelta` → 对应 delta 事件；`ToolCallInputDelta` → 工具参数 diff（如 `PatchApplyUpdated`）。
   - `OutputItemDone(item)` → `handle_output_item_done`（`core/src/stream_events_utils.rs@d77ebc7:300-420`）：若 `ToolRouter::build_tool_call` 得到工具调用 → 立刻 `tool_runtime.handle_tool_call(call)` 生成 future 放入 `FuturesOrdered in_flight`，`needs_follow_up = true`；非工具项 → `ItemCompleted`；解析失败的 `RespondToModel` 错误 → 直接把错误文本作为 `FunctionCallOutput` 写入历史并 `needs_follow_up = true`。
   - `Completed{response_id, token_usage, end_turn}` → 记录 token、`end_turn == Some(false)` 也置 `needs_follow_up`；跳出。
   - 流结束前若 `stream.next()` 返回 `None` → `CodexErr::Stream("stream closed before response.completed")`。
   - 收尾：`drain_in_flight` 等待全部工具 future 完成并把输出记入历史；发 `TokenCount`、`TurnDiff`。
4. 采样后（`turn.rs@d77ebc7:~560-700`）：`needs_follow_up = model_needs_follow_up || has_pending_input`；计算 `context_window_token_status`；
   - 若 `needs_follow_up && (new_context_window 请求 || token_limit_reached)` → `run_auto_compact(..., CompactionPhase::MidTurn)` 后 `continue`；
   - 若 `!needs_follow_up` → `run_turn_stop_hooks`（`Stop`/`SubagentStop`），`should_block` 且有 continuation prompt → 把 hook prompt 作为 `HookPrompt` item 记入历史并 `continue`（`stop_hook_active = true` 传给下一次 Stop hook）；否则 `run_legacy_after_agent_hook`（legacy `notify`）后 `break`；
   - 否则 `continue`（工具输出已在历史里，作为下一次请求输入）。
5. 错误分支：`ContextWindowExceeded`（Guardian 预算耗尽时）→ 自动 compaction 后重试；`TurnAborted` → 向上返回；`InvalidImageRequest` → `Error` 事件；其他 → `Error` 事件并 `break`。

### 2.2 终止条件

| 条件 | 位置 |
|---|---|
| 模型响应完成且无工具调用、`end_turn != Some(false)`、无 pending 输入 → Stop hook 不阻断 → `break` | turn.rs `if !needs_follow_up` |
| `Op::Interrupt` → `abort_all_tasks(TurnAbortReason::Interrupted)` → `TurnAborted` | `core/src/session/mod.rs@d77ebc7:4805`，`tasks/mod.rs` |
| 新的 `StartOrSteer` 输入在无活动 turn 时启动新任务；`spawn_task` 会先 `abort_all_tasks(Replaced)` | `tasks/mod.rs@d77ebc7 spawn_task` |
| 不可重试错误 / 重试耗尽 → `Error` 事件后 break，`TurnComplete.error` 携带终端错误 | turn.rs 错误分支；`TurnCompleteEvent.error` |
| `TurnAbortReason { Interrupted, Replaced, ReviewEnded, BudgetLimited }` | `protocol.rs@d77ebc7:4207` |

### 2.3 并行工具调用

- `ToolCallRuntime` 持有一个 `Arc<RwLock<()>>`：`router.tool_supports_parallel(&call)` 为真的工具取**读锁**并发执行，否则取**写锁**串行（`core/src/tools/parallel.rs@d77ebc7:112-200`）。
- 是否支持并行由各 handler 的 `supports_parallel_tool_calls()` 决定（如 `view_image`、`tool_search`、MCP 工具按服务器 opt-in）（`tools/registry.rs@d77ebc7:486`，`tools/handlers/mcp.rs@d77ebc7:128`）。
- 工具 future 在流式接收过程中即被创建（不等待 `response.completed`），结果按 `FuturesOrdered` 顺序写回历史（`turn.rs@d77ebc7:2356`）。

### 2.4 错误重试与流中断恢复

- `max_retries = provider.stream_max_retries()`（`model-provider-info/src/lib.rs@d77ebc7:443`，配置项 `stream_max_retries`/`request_max_retries`/`stream_idle_timeout_ms`，带硬上限）。
- `handle_retryable_response_stream_error`（`core/src/responses_retry.rs@d77ebc7`）：
  - `Feature::UnboundedConnectionRetries` + `ConnectionFailed` → 无限重连，5s 起指数退避至 60s，每次发 `StreamError("Reconnecting... waiting for network")`；
  - 重试耗尽且可切换传输 → WebSocket → HTTPS 回退，发 `Warning`；
  - 否则 `retries < max_retries` 时按 `err.retry_delay()` 或 `backoff(n)` 等待，发 `StreamError("Reconnecting... n/max")`。
- 每次重试重新发送完整 prompt（`run_sampling_request` 中 `loop`）；流中途已收到的工具调用若已执行，其输出已入历史（推断：重试后模型会再次看到）。

### 2.5 用户打断与 steering

| 机制 | 实现 |
|---|---|
| `Op::Interrupt` | `Session::interrupt_task` → `abort_all_tasks(Interrupted)`：取消 `CancellationToken`，等待 100ms 优雅期（`GRACEFULL_INTERRUPTION_TIMEOUT_MS`），`handle.abort()`，调用任务 `abort()`；若配置 `agent_interrupt_message_enabled`，向历史写入「turn 被打断」标记（`ContextualUser` 或 multi-agent v2 下 `developer` 角色）；跑 `Interrupt` hooks；发 `TurnAborted{reason: Interrupted}`；随后 `maybe_start_turn_for_pending_work`（`core/src/tasks/mod.rs@d77ebc7 handle_task_abort`） |
| `Op::TurnInput{mode: Steer{expected_turn_id}}` / `StartOrSteer` | `Session::steer_input` 把输入放进当前 turn 的 `turn_state.pending_input`（`core/src/session/turn_input.rs@d77ebc7 start_or_steer`）；采样循环每轮 `get_pending_input` 取出、跑 `UserPromptSubmit`、记入历史后再采样；返回 `TurnInputSubmission::Steered{turn_id}` |
| `NotSubmittedReason` | `ServerDraining, NotIdle, PendingTriggerTurn, PlanMode, NoActiveTurn, ExpectedTurnMismatch{expected, actual}, ActiveTurnNotSteerable{turn_kind}, ActiveTurnOutputSchemaMismatch, EmptyInput`（`protocol/src/turn_input.rs@d77ebc7`） |
| 流中抢占 | `try_run_sampling_request` 中若完成的项是 commentary 消息或 reasoning，且 mailbox 有待处理 agent 间消息，则提前 `break Ok(needs_follow_up=true)` 让消息先进入上下文（`turn.rs@d77ebc7 preempt_for_mailbox_mail`） |
| `thread/queue/*`（app-server） | 线程级持久用户消息队列，`ThreadQueueChanged` 事件；与 steering 不同，队列项在空闲时启动新 turn（推断，仅看到 API 名与事件） |
| `Op::SuspendTurnAndShutdown` / `Op::RecoverTurn` | 挂起未完成的根 turn 并关闭（不发终端事件），之后可 `RecoverTurn`（`turn_trigger = "retry"`）恢复（`core/src/session/turn_suspension.rs@d77ebc7`，`turn_input.rs handle_recovery`） |

### 2.6 上下文压缩

- 触发阈值（`core/src/session/context_window.rs@d77ebc7`）：`token_limit_reached = auto_compact_scope_tokens >= auto_compact_limit(+fallback buffer) || active_tokens >= context_window * effective_context_window_percent/100`。
  - `ModelInfo::auto_compact_token_limit()` = `min(配置 model_auto_compact_token_limit, context_window * 9 / 10)`，即默认 **90% 上下文窗口**（`protocol/src/openai_models.rs@d77ebc7:521`）；`effective_context_window_percent` 默认 95（同文件 :389、:966）。
  - `model_auto_compact_token_limit_scope`: `Total` 或 `BodyAfterPrefix`（后者从本窗口 prefill 基线起算）。
- 触发点：PreTurn（`run_pre_sampling_compact`）、MidTurn（采样后）、Guardian 预算耗尽时；手动 `Op::Compact` → `CompactTask`（`core/src/tasks/compact.rs@d77ebc7`）。
- 实现三选一（`turn.rs@d77ebc7 run_auto_compact`）：`Feature::TokenBudget` → `compact_token_budget`；provider `remote_compaction == V2` → `compact_remote_v2`（服务端压缩）；否则本地 `compact.rs`。
- 本地实现（`core/src/compact.rs@d77ebc7:150-420`）：先跑 `PreCompact` hooks（可阻断→`TurnAborted`）；发 `ItemStarted(ContextCompaction)`；把 `SUMMARIZATION_PROMPT`（或配置 `compact_prompt`）作为用户输入向模型请求摘要，`ContextWindowExceeded` 时逐条删除最旧历史项重试；新历史 = 用户消息 + `SUMMARY_PREFIX + 摘要`；`advance_auto_compact_window`；`replace_compacted_history`；`PostCompact` hooks；发 `Warning("Heads up: Long threads and multiple compactions...")`。
- 事件：`ContextCompacted`（app-server `thread/compacted`）、`ItemStarted/ItemCompleted(ContextCompaction)`；rollout 写入 `RolloutItem::Compacted`。

### 2.7 子 agent / 多 agent

- `MultiAgentVersion { Disabled, V1, V2 }`（`protocol.rs@d77ebc7:3022`）。
- V1 工具（命名空间 `multi_agent_v1`）：`spawn_agent`、`send_message`、`resume_agent`、`wait_agent`、`close_agent`（`core/src/tools/handlers/multi_agents_spec.rs@d77ebc7`）。
- V2 工具：`spawn_agent`、`send_message`、`wait_agent`、`interrupt_agent`、`list_agents`、`followup_task`（`core/src/tools/handlers/multi_agents_v2/*.rs@d77ebc7`）。
- 控制面 `AgentControl`（`core/src/agent/control.rs@d77ebc7`）：`send_input`、`send_inter_agent_communication`、`interrupt_agent`、`get_status`、`list_agents`；`AgentRegistry` 维护 `max_threads` 与 `depth > max_depth` 限制（`core/src/agent/registry.rs@d77ebc7:91-103`）。
- 子 agent 作为独立线程，`SessionSource::SubAgent(SubAgentSource::ThreadSpawn{parent_thread_id, depth, agent_path, agent_nickname, agent_role})`；agent 间消息 `Op::InterAgentCommunication` 进 mailbox，空闲时由 `maybe_start_turn_for_pending_work` 启动 turn（`tasks/mod.rs@d77ebc7`）。
- 事件：`CollabAgentSpawnBegin/End`、`CollabAgentInteractionBegin/End`、`CollabWaitingBegin/End`、`CollabCloseBegin/End`、`CollabResumeBegin/End`（V1），`SubAgentActivity`（V2）。
- 内部委托：`codex_delegate::run_codex_thread_one_shot`（`/review` 的 `ReviewTask`）、`run_codex_thread_interactive`（Guardian 审批复审会话）（`core/src/codex_delegate.rs@d77ebc7`，`tasks/review.rs`，`guardian/review_session.rs`）。
- `SubAgentSource` 还有 `Review`、`Compact`、`MemoryConsolidation`、`Other(String)`。

### 2.8 后台/长时命令与 `unified_exec`

- 工具：`exec_command`（可 `tty`、`yield_time_ms`、`max_output_tokens`）、`write_stdin`（向已存在 `process_id` 写入并等待输出）；旧式 `shell`/`shell_command`、`apply_patch` 仍存在（`core/src/tools/handlers/shell_spec.rs@d77ebc7`、`unified_exec/exec_command.rs`、`write_stdin.rs`）。
- `UnifiedExecProcessManager`（`core/src/unified_exec/mod.rs@d77ebc7`）：常量 `MIN_YIELD_TIME_MS=250`、`MAX_YIELD_TIME_MS=30_000`、`DEFAULT_MAX_BACKGROUND_TERMINAL_TIMEOUT_MS=300_000`、`MAX_UNIFIED_EXEC_PROCESSES=64`、输出上限 1 MiB；进程超过 yield 时间仍在运行则保留为后台终端。
- 事件：`ExecCommandBegin/OutputDelta/End`、`TerminalInteraction`（write_stdin 交互）；`Op::CleanBackgroundTerminals`、app-server `thread/backgroundTerminals/{list,clean,terminate}`；`Op::Interrupt` 不终止后台终端（`protocol.rs@d77ebc7` Op 文档注释）。
- 独立于工具的用户命令：`Op::RunUserShellCommand`（TUI 中 `!cmd`）→ `UserShellCommandTask`。

---

## 3. 事件

### 3.1 `EventMsg` 全部成员（按源码顺序，`protocol/src/protocol.rs@d77ebc7:1357-1500`）

| # | 成员 | 触发时机 / 载荷要点 |
|---|---|---|
| 1 | `Error(ErrorEvent)` | 执行提交时出错；`message`, `codex_error_info`, `misalignment` |
| 2 | `Warning(WarningEvent)` | 非致命警告（如 rollout 写失败、compaction 提示） |
| 3 | `AuthRecoveryStarted(AuthRecoveryEvent)` | provider 侧认证恢复开始 |
| 4 | `AuthRecoveryCompleted(AuthRecoveryEvent)` | 认证恢复完成 |
| 5 | `GuardianWarning(WarningEvent)` | Guardian 自动审批复审器的警告 |
| 6 | `RealtimeConversationStarted(..)` | 实时语音会话开始 |
| 7 | `RealtimeConversationRealtime(..)` | 实时会话流载荷 |
| 8 | `RealtimeConversationClosed(..)` | 实时会话关闭 |
| 9 | `RealtimeConversationSdp(..)` | WebRTC SDP |
| 10 | `ModelReroute(ModelRerouteEvent)` | 请求模型被路由到其他模型 |
| 11 | `ModelVerification(ModelVerificationEvent)` | 后端建议额外账户验证 |
| 12 | `TurnModerationMetadata(..)` | 后端审核元数据 |
| 13 | `SafetyBuffering(SafetyBufferingEvent)` | 输出等待安全审查 |
| 14 | `ContextCompacted(ContextCompactedEvent)` | 历史被压缩（自动或手动），空结构体 |
| 15 | `ThreadRolledBack(ThreadRolledBackEvent)` | 旧持久化标记，仅回放用 |
| 16 | `TurnStarted(TurnStartedEvent)` | turn 开始；wire 名 `task_started`（alias `turn_started`）；`turn_id`, `root_turn_id`, `model_context_window`, `collaboration_mode_kind` |
| 17 | `ThreadSettingsApplied(..)` | 提交携带的线程设置已应用 |
| 18 | `TurnComplete(TurnCompleteEvent)` | turn 完成；wire 名 `task_complete`；`turn_id`, `last_agent_message`, `error: Option<ErrorEvent>`, `started_at`, `completed_at`, `duration_ms`, `time_to_first_token_ms` |
| 19 | `TokenCount(TokenCountEvent)` | 用量更新（总量与本 turn） |
| 20 | `AgentMessage(AgentMessageEvent)` | 助手完整文本消息 |
| 21 | `UserMessage(UserMessageEvent)` | 发给模型的用户/系统输入 |
| 22 | `AgentReasoning(..)` | 推理摘要 |
| 23 | `AgentReasoningRawContent(..)` | 原始推理内容 |
| 24 | `AgentReasoningSectionBreak(..)` | 新推理小节；`item_id`, `summary_index` |
| 25 | `SessionConfigured(SessionConfiguredEvent)` | 会话配置确认；`session_id`, `thread_id`, `forked_from_id`, `parent_thread_id`, `model`, `approval_policy`, `approvals_reviewer`, `permission_profile`, `cwd`, `initial_messages`, `rollout_path` 等 |
| 26 | `EnvironmentConnected(..)` | 所选环境握手完成 |
| 27 | `EnvironmentDisconnected(..)` | 环境断连 |
| 28 | `ThreadGoalUpdated(..)` | 长期目标元数据更新 |
| 29 | `ThreadQueueChanged(..)` | 线程用户消息队列变化 |
| 30 | `McpStartupUpdate(..)` | MCP 启动进度 |
| 31 | `McpStartupComplete(..)` | MCP 启动汇总 |
| 32 | `McpToolCallBegin(..)` | MCP 工具调用开始 |
| 33 | `McpToolCallEnd(..)` | MCP 工具调用结束 |
| 34 | `WebSearchBegin(..)` / 35 `WebSearchEnd(..)` | 网页搜索 |
| 36 | `ImageGenerationBegin(..)` / 37 `ImageGenerationEnd(..)` | 图像生成 |
| 38 | `ExecCommandBegin(..)` | 即将执行命令 |
| 39 | `ExecCommandOutputDelta(..)` | 命令输出增量 |
| 40 | `TerminalInteraction(..)` | 对运行中命令的 stdin 交互 |
| 41 | `ExecCommandEnd(..)` | 命令结束 |
| 42 | `ViewImageToolCall(..)` | `view_image` 附加本地图片 |
| 43 | `ExecApprovalRequest(ExecApprovalRequestEvent)` | 请求命令审批；`kind: ExecApprovalKind`, `call_id`, `approval_id`, `turn_id`, `environment_id`, `command`, `cwd`, `reason`, `network_approval_context`, `proposed_execpolicy_amendment`, `proposed_network_policy_amendments`, `additional_permissions`, `available_decisions`, `parsed_cmd`（`protocol/src/approvals.rs@d77ebc7`） |
| 44 | `RequestPermissions(RequestPermissionsEvent)` | `request_permissions` 工具请求 |
| 45 | `RequestUserInput(RequestUserInputEvent)` | `request_user_input` 工具请求 |
| 46 | `DynamicToolCallRequest(DynamicToolCallRequest)` | 客户端提供的动态工具被调用 |
| 47 | `DynamicToolCallResponse(..)` | 动态工具响应 |
| 48 | `ElicitationRequest(ElicitationRequestEvent)` | MCP elicitation |
| 49 | `ApplyPatchApprovalRequest(ApplyPatchApprovalRequestEvent)` | 补丁审批；`call_id`, `turn_id`, `started_at_ms`, `changes: HashMap<PathBuf, FileChange>`, `reason`, `grant_root` |
| 50 | `GuardianAssessment(GuardianAssessmentEvent)` | Guardian 复审的审批生命周期 |
| 51 | `DeprecationNotice(..)` | 弃用通知 |
| 52 | `StreamError(StreamErrorEvent)` | 模型流错误/断连且系统正在处理（重试）；`message`, `codex_error_info`, `additional_details` |
| 53 | `PatchApplyBegin(..)` | 即将应用补丁 |
| 54 | `PatchApplyUpdated(..)` | `apply_patch` 参数流式更新 |
| 55 | `PatchApplyEnd(..)` | 补丁应用结束 |
| 56 | `TurnDiff(TurnDiffEvent)` | 本 turn 统一 diff；`unified_diff` |
| 57 | `RealtimeConversationListVoicesResponse(..)` | 语音列表 |
| 58 | `PlanUpdate(UpdatePlanArgs)` | `update_plan` 工具 |
| 59 | `TurnAborted(TurnAbortedEvent)` | `turn_id`, `reason: TurnAbortReason`, 时间戳 |
| 60 | `ShutdownComplete` | 关闭完成 |
| 61 | `EnteredReviewMode(..)` / 62 `ExitedReviewMode(..)` | `/review` 模式 |
| 63 | `RawResponseItem(..)` / 64 `RawResponseCompleted(..)` | 原始 Responses API 项/完成 |
| 65 | `ItemStarted(ItemStartedEvent)` | `thread_id`, `turn_id`, `item: TurnItem`, `started_at_ms` |
| 66 | `ItemCompleted(ItemCompletedEvent)` | 同上 + `completed_at_ms` |
| 67 | `HookStarted(HookStartedEvent)` | `turn_id`, `run: HookRunSummary`（仅同步、非内建 hook 发出） |
| 68 | `HookCompleted(HookCompletedEvent)` | 同上，`run.status/entries` |
| 69 | `AgentMessageContentDelta(..)` | 助手文本增量；`item_id`, `delta` |
| 70 | `PlanDelta(..)` | plan 模式 `<proposed_plan>` 增量 |
| 71 | `ReasoningContentDelta(..)` | 推理摘要增量 |
| 72 | `ReasoningRawContentDelta(..)` | 原始推理增量 |
| 73-82 | `CollabAgentSpawnBegin/End`, `CollabAgentInteractionBegin/End`, `CollabWaitingBegin/End`, `CollabCloseBegin/End`, `CollabResumeBegin/End` | 多 agent V1 工具生命周期 |
| 83 | `SubAgentActivity(SubAgentActivityEvent)` | 多 agent V2 基于路径的子 agent 活动 |

`TurnItem`（`protocol/src/items.rs@d77ebc7`）：`UserMessage, FunctionCallOutput, HookPrompt, AgentMessage, Plan, Reasoning, CommandExecution, DynamicToolCall, CollabAgentToolCall, SubAgentActivity, WebSearch, ImageView, Extension, ImageGeneration, EnteredReviewMode, ExitedReviewMode, FileChange, McpToolCall, ContextCompaction`。

### 3.2 `Op` 全部成员（`protocol/src/protocol.rs@d77ebc7:600-760`）

| 成员 | 含义 |
|---|---|
| `Interrupt` | 中止当前任务（不终止后台终端），回复 `TurnAborted` |
| `CleanBackgroundTerminals` | 终止本线程全部后台终端 |
| `RealtimeConversationStart/Audio/Text/Speech/Close/ListVoices` | 实时语音会话 |
| `TurnInput { request: Box<TurnInputRequest>, mode: TurnInputMode, reply }` | 提交输入；`TurnInputMode { StartOrSteer, StartIfIdle, Steer{expected_turn_id} }`；`TurnInputRequest { input: TurnInput{UserInput\|ResponseItem\|InterAgentCommunication}, thread_settings, start: TurnStartOptions, additional_context, responsesapi_client_metadata, trace }` |
| `RecoverTurn { thread_settings, start_options, reply }` | 恢复被挂起的 regular turn |
| `SuspendTurnAndShutdown { reply }` | 挂起根 turn 并关闭，不发终端事件 |
| `ThreadSettings { thread_settings }` | 应用线程设置但不启动 turn |
| `TurnSettings { turn_id, update, reply }` | 只改指定运行中 turn |
| `InterAgentCommunication { communication, start_options }` | agent 间消息 |
| `ExecApproval { id, turn_id, decision: ReviewDecision }` | 命令审批答复 |
| `PatchApproval { id, decision }` | 补丁审批答复 |
| `ResolveElicitation { server_name, request_id, decision, content, meta }` | MCP elicitation 答复 |
| `UserInputAnswer { id, response }` | `request_user_input` 答复 |
| `RequestPermissionsResponse { id, response }` | `request_permissions` 答复 |
| `DynamicToolResponse { id, response }` | 动态工具答复 |
| `RefreshMcpServers` | 重新初始化 MCP |
| `ReloadUserConfig` | 重载用户配置层 |
| `Compact` | 手动压缩 |
| `SetThreadMemoryMode { mode }` | 记忆生成开关 |
| `Review { review_request }` | 代码评审 |
| `ApproveGuardianDeniedAction { event }` | 允许重试一次被 Guardian 拒绝的动作 |
| `Shutdown` | 关闭实例 |
| `RunUserShellCommand { command, timeout_ms }` | 用户 `!cmd` |

`ReviewDecision`（`protocol.rs@d77ebc7:4090`）：`Approved`, `ApprovedExecpolicyAmendment{proposed_execpolicy_amendment}`, `ApprovedForSession`, `ApprovedMcpPolicyAmendment`, `NetworkPolicyAmendment{network_policy_amendment}`, `Denied{rejection}`, `TimedOut`, `Abort`；默认值 `Denied{"denied"}`。

### 3.3 app-server 协议名称（`app-server-protocol/src/protocol/common.rs@d77ebc7`）

**客户端→服务器请求（节选，与 loop 相关）**：`initialize`、`thread/start`、`thread/resume`、`thread/fork`、`thread/archive`、`thread/delete`、`thread/unsubscribe`、`thread/list`、`thread/read`、`thread/turns/list`、`thread/items/list`、`thread/inject_items`、`thread/compact/start`、`thread/shellCommand`、`thread/settings/update`、`thread/queue/{add,list,update,delete,reorder,start}`、`thread/backgroundTerminals/{list,clean,terminate}`、`thread/revert`、`thread/approveGuardianDeniedAction`、`turn/start`、`turn/steer`、`turn/interrupt`、`turn/settings/update`、`review/start`、`hooks/list`、`skills/list`、`mcpServer/tool/call`、`config/mcpServer/reload`、`command/exec`（及 `/write`、`/terminate`、`/resize`）、`model/list`、`account/*`、`plugin/*`、`app/*`、`fs/*`、`environment/*`。

- `TurnStartParams`（`v2/turn.rs@d77ebc7:166`）：`thread_id, input: Vec<UserInput>, turn_trigger, tool_output, additional_context, environments, cwd, approval_policy, approvals_reviewer, sandbox_policy, permissions, model, effort, summary, personality, output_schema, collaboration_mode, multi_agent_mode, cyber_access_program …`
- `TurnSteerParams { thread_id, input, expected_turn_id, … }`；`TurnInterruptParams { thread_id, turn_id }`
- `ThreadResumeParams { thread_id, history?, path?, … }`；`ThreadForkParams { thread_id, last_turn_id?, before_turn_id?, path?, … }`

**服务器→客户端请求**（`server_request_definitions!`）：`item/commandExecution/requestApproval`、`item/fileChange/requestApproval`、`item/tool/requestUserInput`、`mcpServer/elicitation/request`、`item/permissions/requestApproval`、`item/tool/call`、`account/chatgptAuthTokens/refresh`、`attestation/generate`、`currentTime/read`（experimental）、以及 v1 的 `ApplyPatchApproval`、`ExecCommandApproval`。
- `CommandExecutionApprovalDecision`（`v2/item.rs@d77ebc7:64`）：`Accept, AcceptForSession, AcceptWithExecpolicyAmendment{..}, ApplyNetworkPolicyAmendment{..}, Decline, Cancel`。

**服务器→客户端通知**（`server_notification_definitions!`，完整）：
`error`, `thread/started`, `thread/status/changed`, `thread/archived`, `thread/deleted`, `thread/unarchived`, `thread/closed`, `thread/reverted`, `skills/changed`, `thread/name/updated`, `thread/attachment/updated`, `thread/goal/updated`, `thread/goal/cleared`, `thread/queue/changed`*, `project/changed`*, `thread/project/updated`*, `thread/environment/connected`*, `thread/environment/disconnected`*, `thread/settings/updated`*, `thread/tokenUsage/updated`, `turn/started`, `hook/started`, `turn/completed`, `hook/completed`, `turn/diff/updated`, `turn/plan/updated`, `item/started`, `item/autoApprovalReview/started`, `item/autoApprovalReview/completed`, `autoApprovalReview/strictReviewRequired`*, `item/completed`, `rawResponseItem/completed`, `rawResponse/completed`, `item/agentMessage/delta`, `item/plan/delta`, `command/exec/outputDelta`, `process/outputDelta`*, `process/exited`*, `item/commandExecution/outputDelta`, `item/commandExecution/terminalInteraction`, `item/fileChange/outputDelta`, `item/fileChange/patchUpdated`, `serverRequest/resolved`, `item/mcpToolCall/progress`, `mcpServer/oauthLogin/completed`, `mcpServer/startupStatus/updated`, `mcpServer/event/stream/notification`*, `account/updated`, `account/rateLimits/updated`, `app/list/updated`, `remoteControl/status/changed`, `externalAgentConfig/import/progress`, `externalAgentConfig/import/completed`, `fs/changed`, `item/reasoning/summaryTextDelta`, `item/reasoning/summaryPartAdded`, `item/reasoning/textDelta`, `thread/compacted`, `model/rerouted`, `model/verification`, `modelProvider/authRecoveryStarted`, `modelProvider/authRecoveryCompleted`, `turn/moderationMetadata`*, `model/safetyBuffering/updated`, `warning`, `guardianWarning`, `deprecationNotice`, `configWarning`, `fuzzyFileSearch/sessionUpdated`, `fuzzyFileSearch/sessionCompleted`, `thread/realtime/*`（started, itemAdded, item/started, item/transcript/delta, item/completed, transcript/delta, transcript/done, outputAudio/delta, sdp, error, closed，均 experimental）, `windows/worldWritableWarning`, `windowsSandbox/setupCompleted`, `account/login/completed`。（* = `#[experimental]`）

- `TurnStatus { Completed, Interrupted, Failed, InProgress }`（`v2/turn.rs@d77ebc7:32`）；`ThreadStatus { NotLoaded, Idle, SystemError, Active{active_flags: [WaitingOnApproval | WaitingOnUserInput]} }`（`v2/thread.rs@d77ebc7:1636`）。
- 映射位置：`app-server/src/bespoke_event_handling.rs@d77ebc7`（`EventMsg::ExecApprovalRequest` → `item/commandExecution/requestApproval` 请求；`TurnComplete` → `turn/completed` 等）。具体逐一映射未细读（未覆盖）。

---

## 4. Hooks / 扩展点

### 4.1 用户可配置生命周期 hooks（存在，且是一等机制）

- 事件名（`protocol/src/protocol.rs@d77ebc7 HookEventName`，`hooks/src/lib.rs@d77ebc7 HOOK_EVENT_NAMES`）：`PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`, `Interrupt`（共 12 个）。
- 配置位置与发现顺序（`hooks/src/engine/discovery.rs@d77ebc7:94-210`，官方文档 learn.chatgpt.com/docs/hooks 核对一致）：
  1. `requirements.toml` 管理层 hooks（`ManagedHooksRequirementsToml`）；`allow_managed_hooks_only = true` 时忽略用户/项目/会话 hooks（`docs/config.md@d77ebc7`）；
  2. 各配置层（低→高）：该层目录下 `hooks.json`（`HooksFile{description, hooks}`）与 `config.toml` 的 `[hooks]` 表（`HooksToml{events, state}`），两者都存在时警告；用户层 `~/.codex/`，项目层 `<repo>/.codex/`；
  3. 插件包 `hooks/hooks.json`。
- Handler 类型（`config/src/hook_config.rs@d77ebc7:163`）：`command { command, commandWindows, timeout, async, statusMessage, additionalContextLimit }`、`mcp_tool { server, tool, input(可用模板引用 hook 输入), timeout, statusMessage }`；`prompt {}` 与 `agent {}` 仅作声明存在，引擎 `ConfiguredHandlerKind` 只有 `Command`/`McpTool`（推断：prompt/agent 类型当前未实现或被忽略）。
- 匹配：`MatcherGroup { matcher: Option<String>, hooks }`；只有 9 个事件的 matcher 有效（`HOOK_EVENT_NAMES_WITH_MATCHERS`），匹配对象为工具名（支持 `*`、正则交替、MCP 工具别名 `mcp__server__tool`）、compaction trigger（`manual|auto`）、session-start source、session-end reason。
- 信任：每个 handler 有 `hook_key = "{source}:{event}:{group}:{handler}"`，用户层 `[hooks.state.<key>] { enabled, trusted_hash }` 控制启用与信任（`hooks/src/config_rules.rs@d77ebc7`）；`HookTrustStatus { Managed, Untrusted, Trusted, Modified }`。
- 执行模式：`async: true` 的 command hook 为 `HookExecutionMode::Async`，**不能施加控制效果**（`can_apply_control_effects()` 仅 Sync）；异步结果通过 `sess.async_hook_results` 在下一次采样前/后被 `drain_async_hook_results` 收集，其 `Context` 条目作为 developer 消息注入（`core/src/hook_runtime.rs@d77ebc7:774`）。
- 作用域（`hooks/src/engine/dispatcher.rs@d77ebc7:256`）：`SessionStart/SessionEnd/SubagentStart` → `HookScope::Thread`，其余 → `Turn`。

**输入（stdin JSON）公共字段**（`hooks/schema/generated/*.input.schema.json@d77ebc7`）：`session_id, cwd, hook_event_name, model, permission_mode ∈ {default, acceptEdits, plan, dontAsk, bypassPermissions}, transcript_path, turn_id`，子 agent 时附 `agent_id, agent_type`；事件特有：`tool_name, tool_input, tool_use_id`（PreToolUse/PostToolUse），`tool_response`（PostToolUse），`prompt`（UserPromptSubmit），`source ∈ {startup, resume, clear, compact, fork}`（SessionStart），`trigger ∈ {manual, auto}`（Pre/PostCompact），`last_assistant_message, stop_hook_active`（Stop/SubagentStop），`agent_transcript_path`（SubagentStop），`reason`（SessionEnd）。

**输出（stdout JSON）契约**（`hooks/src/engine/output_parser.rs@d77ebc7`、`hooks/src/schema.rs`）：通用字段 `continue: bool`, `stopReason`, `suppressOutput`, `systemMessage`；`decision: "block" | "approve"` + `reason`；`hookSpecificOutput { hookEventName, additionalContext, permissionDecision: allow|deny|ask, permissionDecisionReason, updatedInput, decision{behavior: allow|deny, message} }`。退出码：0 → 解析 stdout（非 JSON 的纯文本在 SessionStart/UserPromptSubmit 下作为 additionalContext）；2 → 阻断，理由取 stderr（仅同步 handler 生效）；其他 → 记为失败但不阻断。

各事件的触发点、能力（`core/src/hook_runtime.rs@d77ebc7` 与 `hooks/src/events/*.rs@d77ebc7`）：

| 事件 | 触发时机（源码位置） | 能阻断 | 能改写 | 注入上下文 |
|---|---|---|---|---|
| `SessionStart` | 每次 turn 开头 `run_pending_session_start_hooks`（source 由会话启动/resume/fork/compact 设置）（turn.rs:320, 635） | 是：`continue:false`/stop 使当前 turn 直接结束 | 否 | `additionalContext` → developer 消息 |
| `SubagentStart` | 同上，会话源为 `ThreadSpawn` 子 agent 时 | 是 | 否 | 是 |
| `UserPromptSubmit` | `run_hooks_and_record_inputs` 对每条用户输入（首轮与 steering 输入）（turn.rs:809） | 是：`decision:block` 丢弃该输入；若无任何被接受输入则结束 turn | 否 | 是 |
| `PreToolUse` | `ToolRegistry::dispatch` 执行 handler 前（tools/registry.rs:568） | 是：`decision:block` 或 `permissionDecision:deny` → 以 `RespondToModel("Tool call blocked by PreToolUse hook: …")` 返回给模型 | 是：`permissionDecision:allow` + `updatedInput` → `tool.with_updated_hook_input` | 是 |
| `PermissionRequest` | `Session::request_approval` 在问 Guardian/用户之前（tools/approvals.rs:496） | 是：`deny{message}` → `ReviewDecision::Denied` | 决定 `allow` → `Approved`，跳过用户提示 | 否 |
| `PostToolUse` | 工具成功后（tools/registry.rs:684） | 是：`decision:block` → 工具结果替换为错误文本返回模型；`continue:false` 同样产生反馈 | 部分：`reason` 作为模型可见反馈包裹原输出（`PostToolUseFeedbackOutput`） | 是 |
| `PreCompact` | compaction 前（compact.rs:184 等三处实现） | 是：stop → `TurnAborted` | 否 | 否 |
| `PostCompact` | compaction 成功后 | 是（同上） | 否 | 否 |
| `Stop` | 模型不再需要 follow-up 时（turn.rs:644） | 是：`decision:block`+`reason` → 把 reason 作为 `HookPrompt` 注入并继续循环（`stop_hook_active` 置真）；`continue:false` → 停止 | 否 | 通过 continuation prompt 间接 |
| `SubagentStop` | 同 `Stop`，会话为子 agent 时 | 是 | 否 | 同上 |
| `Interrupt` | `Op::Interrupt` 中止任务后（tasks/mod.rs:785, 944） | 否（只有 `systemMessage`） | 否 | 否 |
| `SessionEnd` | `shutdown_session_runtime`（session/handlers.rs:313） | 否 | 否 | 否 |

HookStarted/HookCompleted 事件仅对**同步且非内建**的 hook 发出（`should_emit_hook_notification`），`HookRunSummary{id, event_name, handler_type, execution_mode, scope, source_path, source, status ∈ {Running, Completed, Failed, Blocked, Stopped}, entries[{kind ∈ {Warning, Stop, Feedback, Context, Error}, text}]}`。app-server 通过 `hooks/list` 列出，`hook/started`、`hook/completed` 通知。

### 4.2 legacy `notify` 外部命令

- 配置 `notify = ["notify-send", "Codex"]`（`core/src/config/mod.rs@d77ebc7:722-733`）；在 Stop hooks 未阻断后由 `run_legacy_after_agent_hook` 触发（turn.rs:~690），载荷作为最后一个 argv：`{"type":"agent-turn-complete","thread-id","turn-id","cwd","client","input-messages","last-assistant-message"}`（`hooks/src/legacy_notify.rs@d77ebc7`）。stdin/stdout/stderr 全部 null，spawn 失败仅 `FailedContinue`；源码注释标记为待移除。只能观察，不能阻断/改写（`HookResult::FailedAbort` 路径在 notify 实现中不会产生）。

### 4.3 协议层审批请求（不是 hook）

- 流程（`core/src/session/mod.rs@d77ebc7:2789 request_command_approval`）：创建 `oneshot`，以 `approval_id`(默认 `call_id`) 存入 `turn_state.pending_approvals`；发 `EventMsg::ExecApprovalRequest`；`rx.await`，通道关闭则默认 `ReviewDecision::Abort`。客户端用 `Op::ExecApproval{id, decision}` → `Session::notify_approval`（mod.rs:3364）解析。补丁同理 `ApplyPatchApprovalRequest` / `Op::PatchApproval`。
- 审批决策链（`core/src/tools/approvals.rs@d77ebc7:467-560`）：`PermissionRequest` hook → （Guardian `AutoReview`/strict auto review）→ 用户。`ApprovedForSession` 通过 `ApprovalStore` 缓存（`tools/sandboxing.rs@d77ebc7:40-120`）。
- app-server 把它们转成服务器→客户端 JSON-RPC 请求 `item/commandExecution/requestApproval` / `item/fileChange/requestApproval`，响应用 `CommandExecutionApprovalDecision`。
- 其他协议层请求：`RequestUserInput`（`request_user_input` 工具）、`RequestPermissions`（`request_permissions` 工具）、`ElicitationRequest`（MCP）、`DynamicToolCallRequest`（客户端注册的动态工具，由客户端执行）。

### 4.4 MCP、skills、AGENTS.md、profile

| 扩展点 | 事实 |
|---|---|
| MCP 服务器与工具 | `codex-rs/codex-mcp`、`rmcp-client`、`core/src/mcp*.rs`；工具名旧式前缀 `mcp__<server>__<tool>`（`tools/handlers/mcp.rs@d77ebc7:46`）；`Op::RefreshMcpServers`、`mcpServer/*` API；MCP 工具也可做 hook handler（`mcp_tool`），并支持 elicitation；resource 工具 `list_mcp_resources`/`read_mcp_resource` |
| Skills | `codex-rs/skills` crate；用户输入 `UserInput::skill{name, path}` 显式选择 `SKILL.md`；`skills/list`、`skills/changed`；`build_skills_and_plugins` 在 turn 开头注入（turn.rs:967）。文档跳转 developers.openai.com/codex/skills（未细读） |
| AGENTS.md | `core/src/agents_md.rs`、`agents_md_manager.rs`（`SessionInstructions`）；作为用户指令注入（推断：由 `context/user_instructions.rs` 渲染）。文档跳转 developers.openai.com/codex/guides/agents-md |
| Plugins | `codex-rs/plugin`、`core/src/plugins`；插件可带 hooks、skills、MCP；`plugin/*` API |
| 配置 profile | `config.toml` `[profiles.<name>]`（`config/src/config_toml.rs@d77ebc7:345`，`ConfigProfile`）；另有权限 profile（`permissions`/`PermissionProfile`），`thread/start`、`turn/start` 的 `permissions: Option<String>` 选择 |
| 进程内扩展 | `codex_extension_api` contributor trait：`on_turn_start/on_turn_stop/on_turn_abort/on_turn_error`、`on_thread_idle/on_thread_stop`、`ToolLifecycleContributor`、`TurnItemContributor`、`admit_turn_start`（`core/src/tasks/lifecycle.rs@d77ebc7`）——这是编译期/宿主扩展，不是用户 hooks |
| Guardian | `ext/guardian-reviewer`、`core/src/guardian/`：`approvals_reviewer = auto_review` 时由子 agent 会话自动复审审批请求，事件 `GuardianAssessment`、`item/autoApprovalReview/*`；细节未覆盖 |

---

## 5. 持久化与恢复

- 文件：`$CODEX_HOME/sessions/<YYYY>/<MM>/<DD>/rollout-<YYYY-MM-DDTHH-MM-SS>-<thread_id>[_<rollout_id>].jsonl`（可为 `.jsonl.zst`，读取时透明解压，追加前物化为 `.jsonl`）；归档在 `archived_sessions/`（`rollout/src/rollout_file_name.rs@d77ebc7`、`rollout/src/list.rs@d77ebc7:1651`、`rollout/src/compression.rs@d77ebc7`、`rollout/src/lib.rs` `SESSIONS_SUBDIR`）。目录按 年/月/日 分层见 `rollout/src/recorder.rs@d77ebc7:1710-1712`、`rollout/src/list.rs@d77ebc7:1059-1065`。
- 行格式：`RolloutLine { timestamp, ordinal: Option<u64>, item: RolloutItem }`，`RolloutItem`（`history/src/lib.rs@d77ebc7:122`）：`SessionMeta(SessionMetaLine)`, `ResponseItem(ResponseItemEnvelope)`, `InterAgentCommunication`, `InterAgentCommunicationMetadata{trigger_turn}`, `Compacted(CompactedItem)`, `TurnContext(TurnContextItem)`, `TokenUsageRecord`, `WorldState`, `SecurityRiskScore`, `RetainedContext`, `EventMsg(EventMsg)`, `RealtimeItem`。
- `SessionMeta`：`session_id, id(thread), forked_from_id, forked_from_ordinal_exclusive, parent_thread_id, timestamp, cwd, originator, cli_version, source: SessionSource, agent_nickname/role/path, model_provider, base_instructions, dynamic_tools …`（`protocol.rs@d77ebc7:3062`）。
- 持久化策略（`rollout/src/policy.rs@d77ebc7`）：`ResponseItem` 中 `Message/AgentMessage/Reasoning/各种 Call 与 Output/Compaction/ContextCompaction` 持久化，`AdditionalTools/CompactionTrigger/Other` 不持久化；`EventMsg` 中 `TurnStarted/TurnComplete/TurnAborted/TokenCount/ThreadGoalUpdated/ThreadSettingsApplied` 总是持久化，`UserMessage/AgentMessage/…` 仅 `ThreadHistoryMode::Legacy` 持久化，`ItemCompleted` 在 `Paginated` 模式或特定 item 时持久化；`Error/Warning/审批请求/Realtime/Raw*` 等不持久化。
- 状态库：`rollout/src/state_db.rs` 基于 `codex_state` SQLite（线程元数据索引、列表分页、与 rollout 文件对账/修复），`thread-store` crate 提供 `read_thread`/`read_thread_by_rollout_path`。
- 刷盘：每个 task 结束前后 `flush_rollout`；失败发 `Warning`（`tasks/mod.rs@d77ebc7`）。
- Resume：`ThreadManager::resume_thread_from_rollout(path)` → `initial_history_from_rollout_path` → `resume_thread_with_history`；app-server `thread/resume{thread_id | path | history}`；SessionStart hook `source = resume`（`core/src/thread_manager.rs@d77ebc7:1118`）。
- Fork：`ThreadManager::fork_thread(snapshot, options, path)` → 从 rollout 读历史 → `ForkPersistence::Copied` 复制到新线程；`thread/fork{thread_id, last_turn_id?, before_turn_id?}`；`SessionMeta.forked_from_id/forked_from_ordinal_exclusive` 记录来源；SessionStart `source = fork`（`thread_manager.rs@d77ebc7:1342`）。
- 历史记录/查询：`thread/list`、`thread/search`、`thread/read`、`thread/turns/list`、`thread/items/list`、`thread/timeline/list`；`thread/revert`（`ThreadReverted`，反转后 rollout 文件名附加新 `rollout_id`）。
- 挂起/恢复：`Op::SuspendTurnAndShutdown` 与 `Op::RecoverTurn`（§2.5）；`interrupted-turn marker` 也写入 rollout。
- 用户可见 transcript 路径：hooks 输入 `transcript_path` 即当前 rollout 路径（`sess.hook_transcript_path()`）。

---

## 6. 小结表：循环阶段 → 事件 → hook/扩展点 → 能否阻断/改写

| 循环阶段 | 对应事件（EventMsg / app-server） | 对应 hook / 扩展点 | 能否阻断 / 改写 |
|---|---|---|---|
| 会话创建 / resume / fork | `SessionConfigured` / `thread/started` | `SessionStart`(startup/resume/fork/clear/compact)、`SubagentStart`；contributor `on_thread_*` | 阻断：是（结束首个 turn）；改写：否；可注入 additionalContext |
| 提交输入（含 steering） | `UserMessage`、`ItemStarted/Completed(UserMessage)`、`ThreadQueueChanged` | `UserPromptSubmit` | 阻断：是（丢弃该输入）；改写：否；注入上下文：是 |
| turn 开始 | `TurnStarted` / `turn/started`、`ThreadSettingsApplied` | contributor `on_turn_start`、`admit_turn_start`（可拒绝 → `ServerDraining`） | 进程内扩展可拒绝；用户 hook 无 |
| 采样前 compaction | `ItemStarted/Completed(ContextCompaction)`、`ContextCompacted`、`Warning` | `PreCompact`/`PostCompact`(trigger=auto) | 阻断：是（→ `TurnAborted`）；改写：否 |
| 模型流式输出 | `ItemStarted`、`AgentMessageContentDelta`、`ReasoningContentDelta`、`ReasoningRawContentDelta`、`AgentReasoningSectionBreak`、`PlanDelta`、`RawResponseItem`、`TokenCount`、`StreamError`（重试中）、`ModelReroute`、`SafetyBuffering` | 无用户 hook；contributor `TurnItemContributor` | 否 |
| 工具调用分派 | `ItemStarted(CommandExecution/FileChange/McpToolCall…)` | `PreToolUse` | 阻断：是（错误文本回模型）；改写：是（`updatedInput`） |
| 审批 | `ExecApprovalRequest` / `item/commandExecution/requestApproval`、`ApplyPatchApprovalRequest` / `item/fileChange/requestApproval`、`RequestPermissions`、`GuardianAssessment`、`item/autoApprovalReview/*` | `PermissionRequest` hook → Guardian → 用户 `Op::ExecApproval/PatchApproval` | hook 可 allow/deny 代替用户；用户可 `Approved/…/Denied/Abort` |
| 沙箱执行 | `ExecCommandBegin/OutputDelta/End`、`TerminalInteraction`、`PatchApplyBegin/Updated/End`、`McpToolCallBegin/End`、`WebSearchBegin/End` | execpolicy 规则、`SandboxPolicy`、network policy；失败后 escalate 再审批 | 策略可 `Forbidden`；沙箱拒绝可触发二次审批 |
| 工具结果回写 | `ItemCompleted`、`TurnDiff` / `turn/diff/updated`、`PlanUpdate` | `PostToolUse` | 阻断：是（结果替换为错误）；改写：反馈包裹原输出；注入上下文：是 |
| 采样后 compaction | 同上 compaction 事件 | `PreCompact`/`PostCompact` | 是 / 否 |
| 模型停止（无 follow-up） | — | `Stop` / `SubagentStop`（`stop_hook_active` 防循环） | 阻断：是（`decision:block`+reason → 注入 `HookPrompt` 继续循环） |
| turn 完成 | `TurnComplete` / `turn/completed`、`TokenCount` / `thread/tokenUsage/updated` | legacy `notify`（after_agent）；contributor `on_turn_stop`、`on_thread_idle` | notify 只观察 |
| 打断 | `TurnAborted{Interrupted}` / `turn/completed(status=interrupted)` | `Interrupt` hook；contributor `on_turn_abort` | 否（仅 systemMessage） |
| 错误 | `Error`、`TurnComplete.error`、`TurnAborted{BudgetLimited}` | contributor `on_turn_error` | 否 |
| 会话关闭 | `ShutdownComplete` / `thread/closed` | `SessionEnd`；contributor `on_thread_stop` | 否 |
| 任一 hook 运行 | `HookStarted`/`HookCompleted` / `hook/started`、`hook/completed` | — | — |

---

## 7. 局限与未覆盖

- 深度 1 克隆：无法给出 HEAD 相对 `rust-v0.154.0` 的距离，也未核对 tag 对应提交的内容差异。
- 未细读：沙箱平台实现（`linux-sandbox`/`bwrap`/`windows-sandbox-rs`）、`execpolicy` 规则语言、`network-proxy`、Guardian 复审细节、`compact_remote_v2` 与 `compact_token_budget` 的具体算法、`code-mode`、realtime 语音、memories、`thread/queue` 的调度语义、app-server `bespoke_event_handling.rs` 中 `EventMsg`→通知的逐一映射表、`tui`/`exec` 对事件的渲染。
- hooks：`HookHandlerConfig::Prompt {}` / `Agent {}` 在引擎中未见实现路径，标「推断：未实现或忽略」；MCP hook handler 的参数模板细节（`expand_mcp_argument_template`）未读；`SessionEnd` 的 `reason` 取值（`SESSION_END_REASON` 常量）未展开。
- 官方文档：`docs/*.md` 已大多外链；本文仅抓取了 hooks 页面（`learn.chatgpt.com/docs/hooks`）做核对，config/sandbox/exec 页面未抓取。
- `protocol_v1.md` 与源码不一致（`Op::UserTurn`/`ConfigureSession` 已不存在），本文以源码为准；文档中「response_id 用于 fork」的描述在当前 `TurnCompleteEvent` 中已无 `response_id` 字段。
- `Op` 枚举标注 `#[non_exhaustive]`（`protocol/src/protocol.rs@d77ebc7:599`），且 `TurnInput{reply: oneshot}` 等成员含进程内通道，不是稳定 wire 契约；跨进程稳定契约是 app-server JSON-RPC。
- 各 hook 的超时默认值、`additionalContextLimit` 默认值、输出 spill 到文件的阈值（`output_spill.rs`）未记录。
