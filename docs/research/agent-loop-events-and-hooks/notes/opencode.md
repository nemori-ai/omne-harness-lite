<!-- 分系统核对笔记：OpenCode。2026-09-14 由只读调研 subagent 按固定提交/版本产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# OpenCode Agent Loop / 事件 / Hooks 调研笔记

- 仓库：`github.com/anomalyco/opencode`（原 `sst/opencode`），浅克隆于仓库 Git 忽略的临时目录（可重新生成）
- 提交：`228e9095ba3988a02664c3816cb51f98584e86c2`（2026-09-14 02:16 -0500），下文统一引用为 `@228e909`
- 版本：`packages/opencode/package.json` → `"version": "1.18.30"`
- 标注约定：无标注 = 源码直接可见；「推断」= 仅由源码结构推断；「未覆盖」= 本次未读到或不存在于该提交
- 引用形式：`路径@228e909`，路径相对仓库根

> 重要背景：该提交处于 **两套 session 实现并存** 的阶段。
> - **V1（当前生效）**：`packages/opencode/src/session/*`，消息模型 `SessionV1`（message/part），事件名 `session.*`、`message.*`；HTTP `/session/:id/message` 直接调用它。
> - **V2（建设中）**：`packages/core/src/session/*`，事件溯源式 durable 事件 `session.next.*`，runner 顶部有未完成清单（`packages/core/src/session/runner/llm.ts@228e909` 头注释）。V2 的 `shell/skill/compact/wait` 返回 `OperationUnavailableError`（`packages/core/src/session.ts@228e909`），HTTP 层未见暴露 V2 prompt 路由（`packages/opencode/src/server/routes/instance/httpapi/groups/experimental.ts@228e909` 仅有 `/experimental/session`、`/experimental/session/:sessionID/background`，未覆盖其是否走 V2）。
> 本笔记以 V1 为主线，V2 单独列出。

---

## 1. 总体架构定位

### 1.1 组件关系

| 组件 | 包 | 角色 | 证据 |
|---|---|---|---|
| Server | `packages/opencode`（`opencode` CLI 包，`opencode serve` 头less） | 承载全部业务：session、agent、tool、permission、plugin、MCP、LSP、事件总线；基于 **Effect** 服务层（`Layer`/`Context.Service`/`LayerNode`），HTTP 用 `effect/unstable/httpapi` + `@effect/platform-node` `NodeHttpServer` | `packages/opencode/src/server/server.ts@228e909`；`packages/web/src/content/docs/server.mdx@228e909` |
| 注意 | — | 该提交 `server.ts` 未 import Hono（grep `hono` 无结果）；HTTP 路由按 `HttpApiGroup` 组织 | `packages/opencode/src/server/routes/instance/httpapi/groups/*.ts@228e909` |
| SDK | `@opencode-ai/sdk`（`packages/sdk/js`） | 由 OpenAPI 生成的 TS 客户端（`createOpencodeClient`），含 `global.event()` SSE 订阅、`session.prompt/promptAsync/abort/command` 等 | `packages/tui/src/context/sdk.tsx@228e909`；`packages/web/src/content/docs/sdk.mdx@228e909` |
| TUI | `@opencode-ai/tui`（`packages/tui`，SolidJS） | 通过 SDK 走 HTTP 调用；通过 `sdk.global.event()` SSE 接收事件（16ms 批处理），断线指数退避重连 | `packages/tui/src/context/sdk.tsx@228e909` L60-140 |
| Web/Desktop | `@opencode-ai/app`、`@opencode-ai/desktop` | 同为 SDK 客户端（`packages/app/src/context/server-session.ts` 消费 `session.updated`/`message.part.updated` 等） | `packages/app/src/context/server-session.ts@228e909` |
| ACP | `packages/opencode/src/acp/*` | Agent Client Protocol 适配（`@agentclientprotocol/sdk`），把事件翻译给 IDE 客户端 | `packages/opencode/src/acp/agent.ts@228e909` |
| Plugin | `@opencode-ai/plugin`（`packages/plugin`） | 仅类型与 `tool()` 助手；插件在 **server 进程内** 加载运行，收到一个 SDK client 回连本机 server | `packages/plugin/src/index.ts@228e909`；`packages/opencode/src/plugin/index.ts@228e909` |
| core / schema | `@opencode-ai/core`、`@opencode-ai/schema` | 事件定义（`Event.define`）、EventV2 总线、SQLite（drizzle）表、V2 session runner | `packages/schema/src/event.ts@228e909`；`packages/core/src/event.ts@228e909` |

### 1.2 一次用户输入的完整路径（V1）

| 步骤 | 位置 |
|---|---|
| 1. 客户端 `POST /session/:sessionID/message`（同步，返回最终 assistant 消息）或 `POST /session/:sessionID/prompt_async`（fork 后立即 204） | `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts@228e909` `SessionPaths`；`handlers/session.ts@228e909` `prompt`/`promptAsync` |
| 2. `SessionPrompt.prompt(input)`：读取 session → `revert.cleanup`（若有待提交的 revert，先删除被回退的消息）→ `createUserMessage` | `packages/opencode/src/session/prompt.ts@228e909` `prompt` |
| 3. `createUserMessage`：解析 agent/model/variant；`sessions.setAgentModel`；解析 parts（`file:` → 调 Read 工具生成 synthetic text；MCP resource；`agent` part → 追加“调用 task 工具”提示）；触发 hook **`chat.message`**；图片归一化；`sessions.updateMessage/updatePart` 持久化（发出 `message.updated`/`message.part.updated`） | 同上 `createUserMessage` |
| 4. `input.tools` 合并进 session permission（已弃用字段）；`noReply` 则直接返回 | `prompt` |
| 5. `loop({sessionID})` → `SessionRunState.ensureRunning`：每个 session 一个 `Runner`；已在运行则**加入等待**当前 run（不新起循环） | `packages/opencode/src/session/run-state.ts@228e909`；`packages/opencode/src/effect/runner.ts@228e909` |
| 6. `runLoop`（详见 §2）：每步 `status.set(busy)` → 重读历史 → 决定退出/子任务/压缩/LLM 步 | `prompt.ts@228e909` `runLoop` |
| 7. 结束：`compaction.prune` 后台 fork；返回最后一条 assistant；Runner `onIdle` → `status.set(idle)`（发 `session.status`{idle} + `session.idle`） | `run-state.ts@228e909` `runner()`；`status.ts@228e909` |

### 1.3 permission 系统的位置

- 服务：`packages/opencode/src/permission/index.ts@228e909`（`Permission.Service`：`ask/reply/list`）。规则集 `PermissionV1.Ruleset = {permission, pattern, action: allow|ask|deny}[]`，`evaluate()` 取 **最后一条匹配**（wildcard 匹配 permission 与 pattern），无匹配默认 `ask`。
- 规则来源与合并顺序：agent 默认规则（`packages/opencode/src/agent/agent.ts@228e909` `defaults`：`*: allow`、`doom_loop: ask`、`external_directory: ask`、`question/plan_*: deny`、`read *.env: ask`）→ agent 特定规则 → 用户配置 `permission` → session 级 `session.permission`（`Permission.merge(agent.permission, session.permission)`，`packages/opencode/src/session/tools.ts@228e909` `context.ask`）→ 会话内 `always` 批准累积到 `approved`。
- 调用点：工具在 `execute` 内主动 `ctx.ask({permission, patterns, always, metadata})`（如 bash 解析命令前缀、edit 传相对路径、external_directory 传目录 glob；`packages/opencode/src/tool/shell.ts@228e909` `ask`、`tool/edit.ts@228e909`、`tool/external-directory.ts@228e909`）。`ask` 若需询问则发布 `permission.asked` 并 `Deferred.await`，直到 `POST /permission/:requestID/reply` 或 `/session/:id/permissions/:permissionID`（`groups/permission.ts@228e909`、`SessionPaths.permissions`）。
- 决策：`deny` → `PermissionV1.DeniedError`；reply `reject` → `RejectedError`（带 message 则 `CorrectedError`），并连带拒绝同 session 其他待决请求；`always` → 写入 `approved` 并自动放行同 session 中已满足的待决请求。
- 处理器侧：工具失败若是 `RejectedError`/`Question.RejectedError` → `ctx.blocked = shouldBreak`（默认 true，可由 `experimental.continue_loop_on_deny` 关闭）→ 本步后循环 `stop`（`packages/opencode/src/session/processor.ts@228e909` `failToolCall`、`process`）。
- 隐藏工具：`Permission.disabled()` 把 `pattern:"*"` 且 `deny` 的工具从工具列表移除（`permission/index.ts@228e909`；`session/llm/request.ts@228e909` `resolveTools`）。

---

## 2. Agent Loop（V1 `SessionPrompt.runLoop`）

### 2.1 循环步骤

来源：`packages/opencode/src/session/prompt.ts@228e909` `runLoop`、`packages/opencode/src/session/processor.ts@228e909`、`packages/opencode/src/session/llm.ts@228e909`、`packages/opencode/src/session/llm/request.ts@228e909`。

| # | 阶段 | 细节 |
|---|---|---|
| 0 | 进入 | `state.ensureRunning(sessionID, lastAssistant, runLoop)`；`step=0` |
| 1 | 每轮开头 | `status.set(busy)`；`msgs = MessageV2.filterCompactedEffect(sessionID)`（从 SQLite 分页读全部消息，按最近一次已完成压缩裁剪历史，见 §2.8）；`MessageV2.latest(msgs)` 得到 `lastUser/lastAssistant/lastFinished/tasks` |
| 2 | 退出判定 | 若 `lastAssistant.finish` 存在且不在 `["tool-calls","unknown"]`、且 assistant 无未执行 tool part（排除 cleanup 标记的 `interrupted` 孤儿）、且 `lastAssistant.parentID === lastUser.id` → `break` |
| 3 | 计步 | `step++`；`step===1` 时后台 fork 标题生成（`title` agent，小模型）与 `summary.summarize` |
| 4 | 任务分派 | `tasks.pop()`：`subtask` part → `handleSubtask`（§2.7）后 `continue`；`compaction` part → `compaction.process`（§2.8），`stop`→break，否则 `continue` |
| 5 | 溢出预检 | `lastFinished` 非 summary 且 `compaction.isOverflow(tokens, model)` → `compaction.create({auto:true})`（写入一条带 `compaction` part 的 user 消息）→ `continue` |
| 6 | 步上限 | `maxSteps = agent.steps ?? Infinity`；`isLastStep = step >= maxSteps` |
| 7 | 提醒注入 | `SessionReminders.apply`：plan agent 追加 PROMPT_PLAN；从 plan 切到 build 追加 BUILD_SWITCH（synthetic text part） |
| 8 | 建 assistant 消息 | `sessions.updateMessage({role:"assistant", parentID:lastUser.id, agent, modelID, tokens:0...})` |
| 9 | 建 processor | `processor.create({assistantMessage, sessionID, model})`；先 `snapshot.track()`（git 快照 hash） |
| 10 | 解析工具 | `SessionTools.resolve`（§2.4）：内置工具 + 自定义工具 + MCP 工具 + MCP resource 工具，每个包成 AI SDK `tool()`，`execute` 内触发 `tool.execute.before/after`；json_schema 输出时追加 `StructuredOutput` 工具并 `toolChoice:"required"` |
| 11 | 历史变换 | hook **`experimental.chat.messages.transform`**（可改写 `msgs`） |
| 12 | system 装配 | `Effect.all([sys.skills(agent), sys.environment(model), instruction.system(), sys.mcp(agent, permission), MessageV2.toModelMessagesEffect(msgs, model)])`；`system = [...env, ...instructions, mcp?, skills?]`；json_schema 时加 STRUCTURED_OUTPUT_SYSTEM_PROMPT |
| 13 | `handle.process(streamInput)` | `messages = [...modelMsgs, isLastStep ? assistant(MAX_STEPS_PROMPT) : []]` |
| 14 | `LLMRequestPrep.prepare` | `system[0] = [agent.prompt ?? SystemPrompt.provider(model), ...input.system, user.system].join("\n")` → hook **`experimental.chat.system.transform`** → 若拆成 >2 段则折回 2 段（header + 其余）；params 合并 `ProviderTransform.options` + model.options + agent.options + variant → hook **`chat.params`** → hook **`chat.headers`** → `resolveTools`（按 `user.tools` 与 permission `deny *` 过滤）→ 工具名排序 |
| 15 | 调模型 | 默认 AI SDK `streamText({tools, activeTools, toolChoice, maxRetries: retries ?? 0, abortSignal, experimental_repairToolCall})`，`fullStream` 经 `LLMAISDK.toLLMEvents` 归一为 `LLMEvent`；`OPENCODE_EXPERIMENTAL_NATIVE_LLM` 时改走 `LLMNativeRuntime`（`@opencode-ai/llm`）；GitLab workflow model 特判 |
| 16 | 流处理 `handleEvent` | `reasoning-*`→reasoning part；`text-*`→text part（`text-end` 触发 hook **`experimental.text.complete`**）；`tool-input-*`/`tool-call`→tool part `pending→running`，并做 doom-loop 检测；`tool-result`/`tool-error`→`completed/error`；`step-start`→`step-start` part（含 snapshot）；`step-finish`→记录 `finish` reason、cost、tokens，`step-finish` part，git patch part，后台 summarize，并计算 `needsCompaction`；`provider-error`→throw |
| 17 | 工具执行 | 在 AI SDK 的 tool `execute` 内（即模型流式返回 tool-call 后由 AI SDK 调度）：`tool.execute.before` → `item.execute(args, ctx)`（内部 `ctx.ask` 权限）→ `tool.execute.after` → 若已 abort 则直接 `completeToolCall` |
| 18 | 结束一步 | `Stream.takeUntil(needsCompaction)`；`Effect.retry(SessionRetry.policy)`；`catch(halt)`；`ensuring(cleanup)`；返回 `"compact" | "stop" | "continue"` |
| 19 | 循环决策 | structured 捕获→`break`；`finish` 非 tool-calls 且无 error：`content-filter`→写 ContentFilterError + `session.error`→break；json_schema 未产出→StructuredOutputError→break；`result==="stop"`→break；`"compact"`→`compaction.create({auto:true, overflow:!finish})`→continue；否则 continue（回到 #1，由退出判定决定） |
| 20 | 收尾 | `compaction.prune` 后台；返回 `lastAssistant(sessionID)` |

### 2.2 终止条件汇总

| 条件 | 位置 |
|---|---|
| assistant `finish` ∉ {tool-calls, unknown} 且无待处理 tool part 且 parentID 为最新 user | `prompt.ts@228e909` `runLoop` 退出判定 |
| `agent.steps` 上限：最后一步注入 `MAX_STEPS_PROMPT`（`packages/core/src/session/runner/max-steps.ts@228e909`，要求仅文本回复）；注意 V1 **未** 把 `toolChoice` 设为 none（V2 设 `toolChoice:"none"` 且不 materialize 工具） | `prompt.ts@228e909`；`core/src/session/runner/llm.ts@228e909` |
| doom loop：`tool-call` 时取该 assistant 消息最近 3 个 part（`DOOM_LOOP_THRESHOLD=3`），若全是同名同输入的 tool part → `permission.ask({permission:"doom_loop", patterns:[tool]})`（默认 ask，拒绝即 stop） | `processor.ts@228e909` `handleEvent` case `tool-call` |
| permission/question 被拒 → `blocked` → `stop`（除非 `experimental.continue_loop_on_deny`） | `processor.ts@228e909` |
| 模型错误（非可重试或超过重试）→ `halt` → `assistantMessage.error` + `session.error` + `status idle` → `stop` | `processor.ts@228e909` `halt` |
| 上下文溢出错误：`compaction.auto===false` 时置 error 停止；否则 `needsCompaction` → `compact` | `processor.ts@228e909` `halt` |
| structured output 捕获、content-filter、json_schema 失败 | `prompt.ts@228e909` |
| abort（§2.5） | — |

### 2.3 并行工具调用

- 工具由 AI SDK `streamText` 在收到 `tool-call` 后调用各 tool 的 `execute`；processor 只记录 `toolcalls[callID].done` Deferred，`cleanup` 时对所有未完成 call 并行等待 250ms 后标记 `error: "Tool execution aborted", metadata.interrupted=true`（`processor.ts@228e909` `cleanup`）。
- 「推断」：同一步内多个 tool-call 的并行度取决于 AI SDK 默认行为（AI SDK 对一步内工具调用并发执行），OpenCode 未加互斥。V2 runner 明确 `FiberSet.run` 每个 tool-call 立即启动并 `awaitToolFibers` 等全部结算（`core/src/session/runner/llm.ts@228e909`）。
- 工具执行超过 `Tool.Context.abort` 后仍完成的结果会通过 `completeToolCall` 直接写回（`session/tools.ts@228e909`）。

### 2.4 工具解析与权限（`SessionTools.resolve`）

`packages/opencode/src/session/tools.ts@228e909`：

- `registry.tools({modelID, providerID, agent, permission})`：内置工具列表（`invalid, question?, bash, read, glob, grep, edit, write, task, webfetch, todowrite, websearch, skill, apply_patch, execute?, lsp?, plan?`）+ `.opencode/{tool,tools}/*.{js,ts}` 自定义工具 + 插件 `tool` hook 注册的工具；按模型选 `apply_patch` vs `edit/write`；每个工具经 hook **`tool.definition`**（可改 description/parameters）；`task` 工具描述附带可用 subagent 列表（按 `task` 权限过滤 deny）（`packages/opencode/src/tool/registry.ts@228e909`）。
- 每个工具的 `Tool.Context`：`sessionID/messageID/agent/abort/callID/messages/metadata()/ask()`；`ask` 合并 `agent.permission + session.permission` 并带 `tool:{messageID, callID}`。
- MCP 工具：`ctx.ask({permission: key, patterns:["*"], always:["*"]})` 后执行；`execute` 结果 content 转 text/attachments 并截断。
- MCP resource 工具 `list_mcp_resources/list_mcp_resource_templates/read_mcp_resource`：权限 `read`，pattern `mcp:<server>:<uri>`。

### 2.5 abort / cancel

- `POST /session/:id/abort` → `SessionPrompt.cancel` → `SessionRunState.cancel`：先取消该 session 及其（递归）子 session 的 BackgroundJob，再 `runner.cancel`（Fiber 中断；`Deferred.fail(Cancelled)`；`onIdle`）（`run-state.ts@228e909`、`runner.ts@228e909`）。
- 中断传播：`processor.process` 的 `onInterrupt` → `aborted=true` → `halt(AbortError)` 写 `assistantMessage.error = AbortedError`；`cleanup` 标记未完成 tool 为 `interrupted`；`runLoop` 的 `finalizeInterruptedAssistant` 补 `time.completed`（`prompt.ts@228e909`）。
- 等待方：`ensureRunning` 的 `awaitDone` 捕获 `RunnerCancelled` → 返回 `onInterrupt`（即 `lastAssistant(sessionID)`）。
- 子任务：`handleSubtask` 的 `onInterrupt` → `taskAbort.abort()` 并把 part 置 `error:"Cancelled"`；TaskTool 内 `ctx.abort` 事件 → `ops.cancel(childSessionID)`（`tool/task.ts@228e909`）。

### 2.6 steering / 循环中追加消息 / 队列

- V1：运行中再次 `prompt` → 写入新 user 消息 → `ensureRunning` 处于 `Running` 时直接 `awaitDone(st.run.done)`（加入等待，不新建循环）。「推断」由于 `runLoop` 每轮重新读取全部消息、`lastUser` 变为新消息、退出判定要求 `lastAssistant.parentID === lastUser.id`，新消息会在下一轮被作为最新用户输入继续处理（模型看到追加的用户消息）。V1 没有显式 `queue` 概念；`Runner` 只有 `Idle/Running/Shell/ShellThenRun` 四态，`Shell` 运行中到达的 prompt 会排成 `ShellThenRun` 在 shell 结束后启动（`runner.ts@228e909`）。
- `POST /session/:id/shell` 走 `startShell`：session 忙则 `BusyError`（`run-state.ts@228e909` `startShell`）。
- V2：`SessionV2.prompt({delivery: "steer" | "queue"})`（默认 `steer`）→ `SessionInput.admit` 发布 durable `session.next.prompt.admitted` → `execution.wake`；runner 在每轮 `runTurnAttempt(promotion)` 时 `promoteSteers`（并入当前上下文，`currentStep` 归 1）或 `promoteNextQueued`（一次只提升一条）发布 `session.next.prompted`（`packages/core/src/session.ts@228e909`；`core/src/session/input.ts@228e909`；`core/src/session/runner/llm.ts@228e909`）。`SessionRunCoordinator` 保证每个 key 只有一个 drain，`wake` 合并为一次后继 run（`core/src/session/run-coordinator.ts@228e909`）。

### 2.7 subagent / Task 工具 / child session / 后台任务

来源：`packages/opencode/src/tool/task.ts@228e909`、`packages/opencode/src/agent/agent.ts@228e909`、`packages/opencode/src/agent/subagent-permissions.ts@228e909`、`packages/core/src/background-job.ts@228e909`。

| 项 | 事实 |
|---|---|
| agent 模式 | `Agent.Info.mode ∈ {primary, subagent, all}`；内置 primary：`build`、`plan`（隐藏 primary：`compaction`、`title`、`summary`）；内置 subagent：`general`、`explore`（docs 还列 `scout`，源码 `agent.ts` 未见，未覆盖）；配置 `agent.<name>` 或 `.opencode/{agent,agents}/**/*.md` 可新增/覆盖（`packages/opencode/src/config/agent.ts@228e909`） |
| Task 参数 | `description, prompt, subagent_type, task_id?(续用子 session), command?, background?(需 `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`)` |
| 深度限制 | 沿 `parentID` 向上数，`depth >= cfg.subagent_depth ?? 1` 则报错 |
| 权限 | 非 `bypassAgentCheck` 时 `ctx.ask({permission:"task", patterns:[subagent_type], always:["*"]})`；子 session 权限 = `deriveSubagentSessionPermission`（父 session 的 `deny` 与 `external_directory` 规则）+ 默认 deny `todowrite`/`task`（除非 subagent 自身允许）+ `experimental.primary_tools` deny |
| child session | `sessions.create({parentID: ctx.sessionID, title: "<desc> (@<agent> subagent)", agent, permission})`；子 session 不自动 share（`share/session.ts@228e909`）；`GET /session/:id/children` |
| 执行 | `ops.prompt({sessionID: child, agent, model(优先 subagent.model), parts})` → 子 session 独立跑 `runLoop`；结果取最后一个 text part；子 assistant 有 error 或有 error tool part → Task 失败 |
| BackgroundJob | 进程内非持久注册表（`core/src/background-job.ts@228e909` 注释明确不 durable）；前台模式 `background.start` + `raceFirst(wait, waitForPromotion)`；后台模式立即返回 `<task state="running">`，完成后 `inject` 以 synthetic user 消息 `prompt` 回父 session（触发父循环继续）；`task_id` 复用时 `background.extend` 追加提示 |
| 用户 @agent | `createUserMessage` 把 `agent` part 变成“请调用 task 工具 subagent: X”的 synthetic 提示，并设 `bypassAgentCheck`；`command` 若 agent 为 subagent 则生成 `subtask` part 由 `handleSubtask` 直接调用 TaskTool（跳过模型决定） |
| `handleSubtask` | 自建 assistant 消息 + `task` tool part，触发 `tool.execute.before/after`，完成后若来自 command 追加 synthetic user “Summarize the task tool output above and continue” |

### 2.8 上下文压缩（compaction）

来源：`packages/opencode/src/session/compaction.ts@228e909`、`packages/opencode/src/session/overflow.ts@228e909`、`packages/opencode/src/session/message-v2.ts@228e909` `filterCompacted`。

| 项 | 事实 |
|---|---|
| 触发 1（预检） | 每轮开头 `lastFinished.tokens` ≥ `usable` → `compaction.create({auto:true})` |
| 触发 2（步内） | `step-finish` 时 `isOverflow(usage.tokens)` → `needsCompaction` → 流 `takeUntil` 提前结束 → `"compact"` → `create({auto:true, overflow: !finish})` |
| 触发 3（错误） | provider 返回 `ContextOverflowError` → `needsCompaction`（`compaction.auto===false` 则直接失败） |
| 触发 4（手动） | `POST /session/:id/summarize` → `create({auto:false})` + `loop` |
| `usable` | `limit.input ? input - reserved : context - maxOutputTokens`；`reserved = cfg.compaction.reserved ?? min(20000, maxOutputTokens)`；`compaction.auto===false` 或 `limit.context===0` 不溢出 |
| `create` | 写一条 user 消息 + `compaction` part `{auto, overflow, tail_start_id?}`，循环下一轮由 `tasks.pop()` 接管 |
| `process` | `overflow` 时回退到上一条真实 user 消息作为 `replay`；选 `compaction` agent（`*: deny`，prompt=`PROMPT_COMPACTION`）；`select` 按 `preserve_recent_tokens`（默认 `clamp(usable*0.25, 2000, 15000)`）/`tail_turns` 决定保留尾部（`tail_start_id`），头部序列化为文本；hook **`experimental.session.compacting`**（`context[]` 追加 / `prompt` 整体替换）→ hook `experimental.chat.messages.transform` → 生成 assistant 消息 `summary:true`（工具集为空，流中出现 tool-call 直接 throw）；再溢出 → `ContextOverflowError` `stop` |
| 自动续跑 | `auto` 且成功：有 `replay` 则复制原 user 消息（媒体替换为文本占位）；否则 hook **`experimental.compaction.autocontinue`**（`enabled` 默认 true）→ 写 synthetic user “Continue if you have next steps…”（`metadata.compaction_continue`）；发布 `session.compacted` |
| 历史裁剪 | `filterCompacted`：从最新往回，遇到已完成 summary 的 compaction user 消息即截断；若有 `tail_start_id` 则把 tail 段重排到 summary 之后 |
| prune | `compaction.prune`（需 `cfg.compaction.prune`）：从最新往回跳过最近 2 轮，累计 completed tool 输出超过 `PRUNE_PROTECT=40000` token 的旧输出标记 `time.compacted`（模型侧显示 “[Old tool result content cleared]”），只有可清理量 > `PRUNE_MINIMUM=20000` 才执行；`skill` 工具受保护 |

### 2.9 错误处理与重试

`packages/opencode/src/session/retry.ts@228e909`、`processor.ts@228e909`：

- `SessionRetry.policy`：最多 `RETRY_MAX_RETRIES=5` 次；可重试判定 `retryable()`：`APIError.isRetryable` 或 `status>=500` 或消息匹配 `RETRYABLE_MESSAGE_PATTERNS`（429/5xx/rate limit/overloaded/网络/timeout 等）；`ContextOverflowError` 不重试；延迟 `retry-after-ms`/`retry-after` 头优先，否则指数退避（2s 起、×2、25% 抖动、无头时封顶 30s）。重试期间 `status.set({type:"retry", attempt, message, action?, next})`（发 `session.status`）。
- AI SDK `maxRetries` 设为 `input.retries ?? 0`（重试由 OpenCode 自己做）。
- 错误归一 `MessageV2.fromError`：AbortedError / OutputLengthError / AuthError / APIError / ContextOverflowError 等，落到 `assistant.error` 并发布 `session.error`。
- 无效工具名/参数：`experimental_repairToolCall` 先尝试小写名，否则改调 `invalid` 工具把错误回喂模型（`llm.ts@228e909`）；`InvalidArgumentsError` 作为工具结果返回（`tool/tool.ts@228e909`）。
- 插件 hook 抛错：`Plugin.trigger` 顺序 `await` 各 hook，未捕获 → 传播到调用点（如在 tool `execute` 内 → AI SDK `tool-error` → tool part `error`，循环继续；「推断」）。`event` hook 与 `config` hook 的错误被忽略（`void`/`Effect.ignore`）。

### 2.10 V2 runner（建设中，供对照）

`packages/core/src/session/runner/llm.ts@228e909`：每轮 `runTurnAttempt(sessionID, promotion, step)`：校验 session location → `agents.select` → `SessionContextEpoch` 缓存 system 基线 → `SessionHistory.entriesForRunner` → `tools.materialize(permissions)`（最后一步不给工具、`toolChoice:"none"`）→ `compaction.compactIfNeeded` → `llm.stream(LLM.request(...))`，每个 `LLMEvent` 由 `createLLMEventPublisher` 转成 durable `session.next.*` 事件；`tool-call` 立即 `FiberSet.run(settle)`；溢出可 `compactAfterOverflow` 后重试。已完成项包括 step 限制、steer 续跑、durable 工具结算；未完成项包括 provider 重试、doom loop、durable 状态、插件、cancel 结算（头注释清单）。

---

## 3. 事件体系

### 3.1 定义方式与传播

- 定义：`Event.define({type, durable?: {version, aggregate}, schema})`（`packages/schema/src/event.ts@228e909`）；全部清单在 `packages/schema/src/event-manifest.ts@228e909`（`Definitions` / `ServerDefinitions` / `Durable`）。
- 总线：`EventV2.Service`（`packages/core/src/event.ts@228e909`）。`publish(def, data, {location?, commit?})`：durable 事件先在 SQLite 事务内按 aggregate 分配 `seq`、跑注册的 `project()` 投影器、写 `event`/`event_sequence` 表，再 `notify`（`listen` 监听者、按类型 PubSub、`all` PubSub）；非 durable 事件仅 `notify`。`durable({aggregateID, after})` 提供“历史 + 实时”流；`replay/replayAll/claim/remove` 用于跨节点同步。
- 位置标记：`EventV2Bridge.publish` 自动附 `location {directory, workspaceID, project}`（`packages/opencode/src/event-v2-bridge.ts@228e909`）。
- 进程内 → GlobalBus：`EventV2Bridge` 监听全部事件，转成 `GlobalBus.emit("event", {directory, project, workspace, payload:{id,type,properties}})`；durable 事件额外发一条 `payload.type="sync"`（`syncEvent {id,type(带版本后缀),seq,aggregateID,data}`）（`event-v2-bridge.ts@228e909`；`packages/opencode/src/bus/global.ts@228e909`）。
- SSE：`GET /event`（实例级）：直接 `events.listen` 入队，按 `location.directory`/`workspaceID` 过滤，先发 `server.connected`，每 10s `server.heartbeat`，收到 GlobalBus 的 `server.instance.disposed` 结束（`packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts@228e909`）。`GET /global/event`：转发 GlobalBus 全部（含 `sync`）（`handlers/global.ts@228e909`）。TUI 用 `sdk.global.event()`（`packages/tui/src/context/sdk.tsx@228e909`）。
- 插件 `event` hook：`Plugin` 状态初始化时 `events.listen`，仅转发 `event.location.directory === ctx.directory` 的事件，形如 `{event:{id,type,properties}}`，不等待返回（`packages/opencode/src/plugin/index.ts@228e909`）。
- Share：`share-next.ts` 监听 `session.updated/message.updated/message.part.updated/session.diff/session.deleted` 推送到 share 服务（`packages/opencode/src/share/share-next.ts@228e909`）。

### 3.2 事件清单（源码抄录）

`D` = durable（aggregate `sessionID`，版本见括号）。

**Session / Message（V1，`packages/schema/src/v1/session.ts@228e909`）**

| 事件 | durable | 载荷 | 触发时机 |
|---|---|---|---|
| `session.created` | D(v1) | `{sessionID, info: SessionInfo}` | `Session.createNext`（`session/session.ts@228e909`）；投影写 `session` 表 |
| `session.updated` | D(v1) | `{sessionID, info}` | `Session.patch`（setTitle/touch/setAgentModel/setPermission/setRevert/setShare/setSummary…） |
| `session.deleted` | D(v1) | `{sessionID, info}` | `Session.remove` |
| `message.updated` | D(v1) | `{sessionID, info: Message}` | `Session.updateMessage`（user/assistant 每次变更：创建、finish、tokens、error、completed） |
| `message.removed` | D(v1) | `{sessionID, messageID}` | `Session.removeMessage`（revert cleanup、删除接口） |
| `message.part.updated` | D(v1) | `{sessionID, part, time}` | `Session.updatePart`（text/reasoning/tool/step-start/step-finish/patch/file/compaction/subtask 等所有 part 变更） |
| `message.part.removed` | D(v1) | `{sessionID, messageID, partID}` | `Session.removePart` |
| `message.part.delta` | 否 | `{sessionID, messageID, partID, field, delta}` | `Session.updatePartDelta`：text/reasoning 增量（`processor.ts@228e909`） |
| `session.diff` | 否 | `{sessionID, diff: FileDiff[]}` | `SessionRevert.revert`、summary diff |
| `session.error` | 否 | `{sessionID?, error}` | 模型错误、agent/model/command 未找到、文件读取失败、插件加载失败（`sessionID` 可缺）等 18 处 |

**Session 状态 / 压缩 / todo**

| 事件 | 载荷 | 触发 | 来源 |
|---|---|---|---|
| `session.status` | `{sessionID, status: idle \| busy \| retry{attempt,message,action?,next}}` | `SessionStatus.set`（循环开始 busy、重试、结束 idle） | `packages/schema/src/session-status-event.ts@228e909`；`session/status.ts@228e909` |
| `session.idle`（deprecated） | `{sessionID}` | 与 `status idle` 同时发 | 同上 |
| `session.compacted` | `{sessionID}` | `compaction.process` 成功 | `packages/schema/src/session-compaction-event.ts@228e909` |
| `todo.updated` | `{sessionID, todos[]}` | `Todo.update`（todowrite 工具） | `packages/schema/src/session-todo.ts@228e909`；`session/todo.ts@228e909` |

**Permission / Question**

| 事件 | 载荷 | 触发 | 来源 |
|---|---|---|---|
| `permission.asked` | `Request {id, sessionID, permission, patterns, metadata, always, tool?}` | `Permission.ask` 需要询问时 | `packages/schema/src/v1/permission.ts@228e909`；`permission/index.ts@228e909` |
| `permission.replied` | `{sessionID, requestID, reply: once\|always\|reject}` | `Permission.reply`（含连带 reject / always 自动放行） | 同上 |
| `permission.v2.asked` / `permission.v2.replied` | `Request.fields` / `{sessionID, requestID, reply}` | `PermissionV2`（core，供 V2 runner） | `packages/schema/src/permission.ts@228e909`；`packages/core/src/permission.ts@228e909` |
| `question.asked` / `question.replied` / `question.rejected` | `Request` / `Replied` / `Rejected` | `Question.ask`（question 工具） | `packages/schema/src/v1/question.ts@228e909` |
| `question.v2.asked` / `.replied` / `.rejected` | — | `QuestionV2`（core） | `packages/schema/src/question.ts@228e909` |

**其他**

| 事件 | 载荷 | 触发 | 来源 |
|---|---|---|---|
| `file.edited` | `{file}` | edit/write/apply_patch 写盘后 | `packages/schema/src/filesystem.ts@228e909`；`tool/edit.ts@228e909` |
| `file.watcher.updated` | `{file, event: add\|change\|unlink}` | 文件监听 | `packages/schema/src/filesystem-watcher.ts@228e909` |
| `command.executed` | `{name, sessionID, arguments, messageID}` | `SessionPrompt.command` 完成 | `packages/schema/src/v1/legacy-event.ts@228e909`；`prompt.ts@228e909` |
| `installation.updated` / `installation.update-available` | `{version}` | 升级 | `packages/schema/src/installation-event.ts@228e909` |
| `lsp.updated` | `{}` | LSP 状态变化 | `packages/schema/src/lsp-event.ts@228e909`（docs 提到的 `lsp.client.diagnostics` 在 schema 中未见定义：未覆盖） |
| `mcp.tools.changed` / `mcp.browser.open.failed` | `{server}` / `{mcpName,url}` | MCP | `packages/schema/src/mcp-event.ts@228e909` |
| `tui.prompt.append` / `tui.command.execute` / `tui.toast.show` | `{text}` / `{command}` / `{title?,message,variant,duration}` | 由插件/服务端向 TUI 下发 | `packages/schema/src/tui-event.ts@228e909` |
| `server.connected` / `global.disposed` / `server.heartbeat` / `server.instance.disposed` | `{}` / `{}` / `{}` / `{directory}` | SSE 生命周期 | `packages/schema/src/server-event.ts@228e909`；`server/event.ts@228e909` |
| `vcs.branch.updated`、`workspace.ready/failed/status`、`worktree.ready/failed`、`ide.installed`、`project.updated`、`project.directories.updated`、`plugin.added`、`reference.updated`、`catalog.updated`、`models-dev.refreshed`、`integration.updated`、`integration.connection.updated`、`pty.created/updated/exited/deleted` | 见各文件 | — | `packages/schema/src/{vcs-event,workspace-event,worktree-event,ide-event,project,project-directories,plugin,reference,catalog,models-dev,integration,pty}.ts@228e909` |

**V2 durable 事件（`packages/schema/src/session-event.ts@228e909`，aggregate `sessionID`）**

`session.next.agent.switched`、`session.next.model.switched`、`session.next.moved`、`session.next.prompted`、`session.next.prompt.admitted`、`session.next.context.updated`、`session.next.synthetic`、`session.next.shell.started/ended`、`session.next.step.started`、`session.next.step.ended`(v2)、`session.next.step.failed`(v2)、`session.next.text.started/ended`、`session.next.reasoning.started/ended`、`session.next.tool.input.started/ended`、`session.next.tool.called`、`session.next.tool.progress`、`session.next.tool.success`、`session.next.tool.failed`、`session.next.retried`、`session.next.compaction.started/ended`、`session.next.revert.staged/cleared/committed`；非 durable 的流式：`session.next.text.delta`、`session.next.reasoning.delta`、`session.next.tool.input.delta`、`session.next.compaction.delta`。发布点：`packages/core/src/session/runner/publish-llm-event.ts@228e909`、`core/src/session/input.ts@228e909`、`core/src/session/compaction.ts@228e909`、`core/src/session/revert.ts@228e909`、`core/src/session.ts@228e909`。

---

## 4. Hooks / 插件

### 4.1 `Hooks` 接口逐项（`packages/plugin/src/index.ts@228e909`）

执行模型：`Plugin.trigger(name, input, output)` 对 `hooks[]` **按加载顺序依次 `await`**，`output` 对象原地可变，后一个插件看到前一个的修改；返回最终 `output`（`packages/opencode/src/plugin/index.ts@228e909` `trigger`）。

| Hook | 触发时机（源码位置） | input | 可改写 output | 阻断能力 |
|---|---|---|---|---|
| `dispose?: () => Promise<void>` | 实例 scope 释放时（finalizer） | — | — | 否（错误忽略） |
| `event?: ({event}) => Promise<void>` | 每个同 directory 的总线事件 | `{event:{id,type,properties}}` | 无 | 否（`void`，不等待） |
| `config?: (config) => Promise<void>` | 全部插件加载完后调用一次，传入当前 config 对象；provider 初始化在其后读取 config（`provider/provider.ts@228e909` L1440 注释） | `Config` | 可直接改 config 对象（如 provider） | 否（错误忽略） |
| `tool?: {[id]: ToolDefinition}` | `ToolRegistry` 初始化时读取 `plugin.list()` 注册为自定义工具 | — | — | — |
| `auth?: AuthHook {provider, loader?, methods[]}` | provider 认证流程（内置 codex/copilot/azure 等插件均通过此提供 oauth/api 方法） | — | — | — |
| `provider?: ProviderHook {id, models?}` | `Provider` 初始化时用 `models(provider, {auth})` 覆盖该 provider 的模型表（`provider/provider.ts@228e909` L1455） | — | — | — |
| `"chat.message"` | `createUserMessage` 在 parts 解析后、持久化前（`prompt.ts@228e909` L1000） | `{sessionID, agent?, model?, messageID?, variant?}` | `{message: UserMessage, parts: Part[]}`（可增删改 parts） | 抛错则 prompt 失败（推断） |
| `"chat.params"` | `LLMRequestPrep.prepare`，每次模型调用（`session/llm/request.ts@228e909` L115） | `{sessionID, agent, model, provider, message}` | `{temperature, topP, topK, maxOutputTokens, options}` | 抛错则该步失败 |
| `"chat.headers"` | 同上 L135 | 同上 | `{headers}` | 同上 |
| `"permission.ask"` | **该提交未见任何 `trigger("permission.ask")` 调用点**（grep 全仓库仅类型定义）；`permission/index.ts@228e909` 未触发 | `Permission` | `{status: ask\|deny\|allow}` | 类型上可设 status，实际未接线（未覆盖其历史） |
| `"command.execute.before"` | `SessionPrompt.command` 构造 parts 后、`prompt` 前（`prompt.ts@228e909` L1461） | `{command, sessionID, arguments}` | `{parts}` | 抛错则命令失败 |
| `"tool.execute.before"` | 每次工具执行前：内置/自定义（`session/tools.ts@228e909` L107）、MCP 工具（L403）、MCP resource 工具、`handleSubtask` 的 task（`prompt.ts@228e909` L308）、code-mode | `{tool, sessionID, callID}` | `{args}`（可改参数，如 docs 示例转义 bash） | 抛错 → 工具不执行，AI SDK 产生 `tool-error` → part `error`，模型收到错误后循环继续（推断） |
| `"shell.env"` | bash 工具、`/session/:id/shell`、PTY 创建前（`tool/shell.ts@228e909` L418；`prompt.ts@228e909` L555；`handlers/pty.ts@228e909`） | `{cwd, sessionID?, callID?}` | `{env}` | — |
| `"tool.execute.after"` | 工具执行成功后（同 before 各处） | `{tool, sessionID, callID, args}` | `{title, output, metadata}`（可改写喂给模型的输出） | 抛错 → 视同工具错误（推断） |
| `"experimental.chat.messages.transform"` | 每步 LLM 前（`prompt.ts@228e909` L1255）与压缩前（`compaction.ts@228e909` L379） | `{}` | `{messages: {info, parts}[]}` | — |
| `"experimental.chat.system.transform"` | `LLMRequestPrep.prepare`（L70）与 `Agent.generate` | `{sessionID?, model}` | `{system: string[]}`（>2 段会被折叠为 2 段） | — |
| `"experimental.provider.small_model"` | `Provider.getSmallModel`（`provider/provider.ts@228e909` L1953） | `{provider}` | `{model?}` | — |
| `"experimental.session.compacting"` | 压缩前（`compaction.ts@228e909` L374） | `{sessionID}` | `{context: string[], prompt?: string}` | — |
| `"experimental.compaction.autocontinue"` | 自动压缩成功后、写 continue 消息前（L501） | `{sessionID, agent, model, provider, message, overflow}` | `{enabled}`（false 跳过自动续跑） | 可阻止自动续跑 |
| `"experimental.text.complete"` | 每个 text part `text-end`（`processor.ts@228e909` L531） | `{sessionID, messageID, partID}` | `{text}` | — |
| `"tool.definition"` | `ToolRegistry.tools` 为每个工具生成定义时（`tool/registry.ts@228e909` L318） | `{toolID}` | `{description, parameters}` | — |

`PluginInput`：`{client(SDK), project, directory, worktree, experimental_workspace.register(type, adapter), serverUrl, $ (Bun.$)}`；`Plugin = (input, options?) => Promise<Hooks>`；新式模块形状 `{id?, server: Plugin}`，旧式为导出函数（`plugin/index.ts@228e909` `applyPlugin/getLegacyPlugins`）。

### 4.2 加载来源、顺序与运行环境

- 来源（`packages/opencode/src/config/plugin.ts@228e909`、`config/config.ts@228e909`、docs `plugins.mdx@228e909`）：config `plugin: (string | [string, options])[]`（npm 包名或 `file://`），自动发现 `.opencode/{plugin,plugins}/*.{ts,js}` 与 `~/.config/opencode/{plugin,plugins}/`；合并为 `plugin_origins`（去重同名同版本 npm）。docs 载明顺序：全局 config → 项目 config → 全局插件目录 → 项目插件目录。
- 内置插件先加载：`internalPlugins`（codex、copilot、modal、gitlab、poe、cloudflare×2、azure、digitalocean、snowflake、xai、cerebras），`OPENCODE_DISABLE_DEFAULT_PLUGINS` 可关（`plugin/index.ts@228e909`）。
- `PluginLoader.loadExternal`（`plugin/loader.ts@228e909`）：并行 resolve（npm 用 Bun 安装到 `~/.cache/opencode/node_modules`，`checkPluginCompatibility` 校验版本；file 插件跳过兼容检查）→ 动态 `import` → **顺序**执行插件函数以保持 hook 顺序；失败发布 `session.error`。
- 运行环境：与 server 同进程（Bun 运行时；`$` 为 `Bun.$`，Node 下为 undefined）；`client` 指向本 server（无监听 URL 时直接 `Server.Default().app.fetch`）。
- 本地依赖：`.opencode/package.json` 由 `config.waitForDependencies()`（`bun install`）保证。

### 4.3 其他扩展面（`.opencode/`）

| 扩展 | 位置/入口 | 介入点 |
|---|---|---|
| agents | `agent.<name>` 配置或 `{agent,agents}/**/*.md`（frontmatter）（`config/agent.ts@228e909`） | `Agent.Service` 构建 agents 表：prompt/model/permission/steps/mode/hidden/temperature/options |
| commands | `command.<name>` 或 `{command,commands}/**/*.md`（`config/command.ts@228e909`）；MCP prompts 与 skills 也可成为 command（`command/index.ts@228e909` `source`） | `SessionPrompt.command`：模板 `$1..$N`/`$ARGUMENTS`/`` !`shell` `` 展开 → `command.execute.before` → `prompt`；subagent 命令走 `subtask` |
| skills | `{skill,skills}/**/SKILL.md`（`.opencode`、`~/.config/opencode`）与 `.claude/skills/**/SKILL.md`（`skill/index.ts@228e909`） | `SystemPrompt.skills(agent)` 注入可用技能列表；`skill` 工具加载（权限 `skill`） |
| custom tools | `{tool,tools}/*.{js,ts}`，`tool()` 助手（zod args）；文件名 = 工具名，多导出 `<file>_<export>`（`tool/registry.ts@228e909`；docs `custom-tools.mdx`） | 与内置工具同列，经 `tool.definition`/`tool.execute.*` |
| MCP | config `mcp`（local/remote/OAuth）（`packages/opencode/src/mcp/*`） | 工具并入 `SessionTools.resolve`（权限 key 为工具名）；`sys.mcp` 注入 server instructions；resource 工具 |
| instructions | `AGENTS.md`（`CLAUDE.md` 除非 `flags.disableClaudeCodePrompt`），项目内首个命中的祖先层级 + 全局 `~/.config/opencode/AGENTS.md`/`~/.claude/CLAUDE.md` + config `instructions`（glob 或 URL）（`session/instruction.ts@228e909`） | `instruction.system()` 作为 system 段 |
| formatter | config `formatter`；`format.file(path)` 在 edit/write 后运行（`tool/edit.ts@228e909` L112） | 写盘后、`file.edited` 前 |
| references | config `references`（`OPENCODE_EXPERIMENTAL_REFERENCES`） | `SystemPrompt.environment` 注入 `<available_references>` |
| permission 配置 | config `permission`、agent `permission` | 见 §1.3 |

---

## 5. 持久化与恢复

| 项 | 事实 | 来源 |
|---|---|---|
| 存储引擎 | SQLite + drizzle（`@opencode-ai/core/database`）；表 `session`、`message`、`part`、`todo`、`session_message`(V2)、`session_input`(V2)、`session_context_epoch`(V2)、`event`、`event_sequence` | `packages/core/src/session/sql.ts@228e909`；`core/src/event/sql.ts@228e909` |
| 写入路径 | V1 的 `Session.updateMessage/updatePart/create/patch/remove*` **不直接写表**，而是发布 durable 事件（`message.updated` 等），由 `SessionProjector` 在同一事务内 `events.project(...)` 投影到 `session/message/part` 表（`create` 走 `createNext` 也只 publish） | `packages/opencode/src/session/session.ts@228e909`；`packages/core/src/session/projector.ts@228e909` L214-382 |
| 读取 | `MessageV2.stream(sessionID)` 分页（50/页）读 `message`+`part` 表并 hydrate；`Session.get/list/children/messages` 直接查表 | `session/message-v2.ts@228e909` `page/stream/parts/get` |
| `Storage`（文件 JSON） | 仅剩 `storage.write(["session_diff", sessionID], diffs)` 一处使用（`revert.ts@228e909`），其余已迁 SQLite；`Storage.Service` 带迁移逻辑 | `packages/opencode/src/storage/storage.ts@228e909` |
| session share | `SessionShare.share` → `ShareNext.create`（远端 share 服务）→ `session.share.url`；`share:"auto"` 或 `--share` 时创建根 session 自动 share（子 session 不 share）；`share-next` 监听 `session.updated/message.updated/message.part.updated/session.diff/session.deleted` 增量 `POST .../sync` | `share/session.ts@228e909`；`share/share-next.ts@228e909` |
| resume/continue | 服务端无“恢复运行”概念：`prompt` 总是基于表中的历史重新进入 `runLoop`；V1 `Runner` 状态与 `BackgroundJob` 均为进程内、非持久（`core/src/background-job.ts@228e909` 注释）。V2 设计目标是 durable 续跑（`SessionExecution.resume/wake`），但 runner 标记未完成 | `run-state.ts@228e909`；`core/src/session/execution.ts@228e909` |
| child ↔ parent | `session.parent_id`；`Session.create({parentID})`；`GET /session/:id/children`；`cancel` 递归取消子 job；LLM 请求头 `x-parent-session-id` | `session/session.ts@228e909`；`tool/task.ts@228e909`；`session/llm/request.ts@228e909` |
| fork | `POST /session/:id/fork {messageID?}`：新 session 复制截止到该消息的全部 message/part（重新分配 ID，映射 `parentID` 与 `tail_start_id`） | `session/session.ts@228e909` `fork` |
| revert / undo | `POST /session/:id/revert {messageID, partID?}`（需 session 空闲）：定位回退点，`snapshot.track()` 记录当前 git 快照，`snap.restore(先前快照)` + `snap.revert(patches)` 还原文件，计算 diff 发 `session.diff`，`session.revert = {messageID, partID?, snapshot, diff}` 写入 session（消息**暂不删除**）；`unrevert` 恢复快照并清除；下一次 `prompt`/`shell` 时 `revert.cleanup` 才真正 `removeMessage/removePart` 被回退的消息 | `session/revert.ts@228e909`；`prompt.ts@228e909` `prompt/shellImpl` |
| 快照 | `Snapshot`：独立 `--git-dir` 的 git 仓库对 worktree 做 `track/patch/restore/revert/diff`；`step-start` 记 snapshot、`step-finish` 生成 `patch` part | `packages/opencode/src/snapshot/index.ts@228e909`；`processor.ts@228e909` |
| 跨节点同步 | `POST /sync/...` `replay`：`events.replayAll(events, {ownerID, strictOwner})` 按 aggregate 序列重放 durable 事件（用于 workspace 同步，`OPENCODE_EXPERIMENTAL_WORKSPACES`） | `server/routes/instance/httpapi/handlers/sync.ts@228e909` |

---

## 6. 小结表：循环阶段 → 事件 → hook → 阻断/改写

| 循环阶段 | 发出的事件 | 触发的 hook | 能否阻断 / 改写 |
|---|---|---|---|
| 收到 prompt，建 user 消息 | `session.updated`（agent/model 变更、touch）、`message.updated`、`message.part.updated`；命令还发 `command.executed` | `chat.message`（改 message/parts）；命令前 `command.execute.before`（改 parts） | 改写：是；阻断：抛错即失败（推断） |
| 进入循环 | `session.status`{busy} | — | — |
| 子任务（subtask part） | `message.updated`/`message.part.updated`（task tool part）、子 session 的全部事件、`session.created`（child） | `tool.execute.before`/`after`（tool=task） | before 抛错则子任务失败 |
| 压缩 | `message.*`（summary assistant）、`session.compacted`、`session.error`（失败） | `experimental.session.compacting`（改 prompt/context）、`experimental.chat.messages.transform`、`experimental.compaction.autocontinue`（禁止自动续跑） | 改写：是 |
| 装配 system / 参数 | — | `experimental.chat.messages.transform`、`experimental.chat.system.transform`、`chat.params`、`chat.headers`、`tool.definition` | 改写：是（system/params/headers/工具定义/历史） |
| 模型流式输出 | `message.part.updated`（reasoning/text/step-start）、`message.part.delta` | `experimental.text.complete`（改最终文本） | — |
| 工具调用决定 | `message.part.updated`（tool pending/running）；doom loop → `permission.asked` | — | doom loop 拒绝 → 停止 |
| 权限判定 | `permission.asked` / `permission.replied`；question 工具 → `question.asked/replied/rejected` | `permission.ask`（类型存在，**未接线**） | reply=reject → 工具失败 + 循环 stop（默认） |
| 工具执行 | `file.edited`、`todo.updated`、`message.part.updated`（metadata/title 更新）、`session.diff`（部分） | `tool.execute.before`（改 args）、`shell.env`（改 env）、`tool.execute.after`（改 output/title/metadata） | before 抛错 → 工具不执行、模型收到错误；after 抛错 → 视为工具错误（推断） |
| 步结束 | `message.part.updated`（step-finish、patch）、`message.updated`（finish/tokens/cost） | — | — |
| 重试 | `session.status`{retry} | — | — |
| 错误 / abort | `session.error`、`message.updated`（error）、`session.status`{idle} + `session.idle` | — | — |
| 循环结束 | `session.status`{idle}、`session.idle`；后台 prune 可能发 `message.part.updated` | — | — |
| 全程 | 所有事件经 `event` hook 与 SSE `/event`、`/global/event`（含 `sync`） | `event`（只读） | 否 |

---

## 7. 局限与未覆盖

1. **双栈过渡**：V2（`packages/core/src/session/*`，`session.next.*`）尚未完成，本笔记的循环细节以 V1 `SessionPrompt`/`SessionProcessor` 为准；V2 是否已在某客户端/标志下启用为主路径未覆盖（`RuntimeFlags.experimentalEventSystem` 仅被 `packages/opencode/src/plugin/tui/internal.ts@228e909` 的内置 TUI 插件消费，未见切换 server 主循环）。
2. **`permission.ask` hook**：类型定义存在但该提交内无触发点；是否为遗留或将迁移到 `PermissionV2`，未覆盖（浅克隆无历史）。
3. **并行工具执行**：V1 的并发语义由 AI SDK `streamText` 决定，本笔记标为推断，未读 AI SDK 源码验证。
4. **插件 hook 抛错的具体传播**（`chat.message`、`tool.execute.*`）为推断，未做实验。
5. **docs 与源码差异**：docs 列出的 `scout` 内置 subagent、`lsp.client.diagnostics` 事件在源码/schema 未见；docs 说 `.env` 默认 `deny`，源码 `agent.ts` 默认是 `ask`。以源码为准。
6. **未读**：`packages/opencode/src/session/llm/ai-sdk.ts`（事件归一细节）、`native-runtime.ts`、`session/summary.ts` 细节、`share-next` 的远端协议、ACP 事件映射、`packages/server`（`@opencode-ai/server`，仅见 `cors` 引用）、`packages/app` 的事件消费、`tui.*` 事件的服务端发布点、MCP OAuth、code-mode（`OPENCODE_EXPERIMENTAL_CODE_MODE`）、workspaces/control-plane（`OPENCODE_EXPERIMENTAL_WORKSPACES`）。
7. **运行时**：任务前提写的 “Bun/Hono”，该提交 server 层已是 Effect `HttpApi` + `NodeHttpServer`（`server.ts` 无 hono import）；Bun 仍是 CLI 运行时（`Bun.$`、`bun install` 插件依赖）。
8. Session/事件表结构未逐列核对；`event` 表 `type` 存储带版本后缀（`versionedType`），V1 事件版本 1、`session.next.step.ended/failed` 版本 2。
