# Codex hooks：选择性观察

- 原始出处（一手）：
  - 源码 `openai/codex` @ **`5c5308fc9a9ee789049d646ef11e5400384b9c6f`**，本机钉住副本 `tmp/sources/codex-5c5308f.tar.gz`
    解包在 `/data/qiwei/repos/omne-harness-lite/tmp/sources/extracted/codex/codex-rs/`（只含 `hooks`、`protocol`、`rmcp-client`、`core/src`；**不含 rollout 持久化 crate**）。下文 `hooks/…`、`core/…`、`protocol/…` 都相对 `codex-rs/`。
  - 官方文档副本 `/data/qiwei/repos/omne-harness-lite/tmp/sources/extracted/codex-docs/hooks.md`（2026-09-20 抓取自 learn.chatgpt.com，sha256 `6b4c549c…2ce9`）。下文「doc:行号」指这份副本。文档自己声明「Use this page as the release behavior reference」，而仓库 `main` 分支 schema 可能含未发布字段（doc:1113-1117）。
  - 立场：厂商自述（文档）与厂商实现（源码）。两者冲突处下文照写。
- 独立来源（第三方实测）：cc-master 的 Codex 适配层与探针，`/data/qiwei/repos/cc-master` @ `613a00e7`：
  `plugin/src/hooks/_hosts/codex/probes/README.md`、`plugin/src/hooks/_hosts/codex/strategy.yaml`、`plugin/src/hooks/board-guard/CONTRACT.md`。**实测对象是 Codex CLI 0.142.5 / 0.144.2 / 0.145.0，早于本轮源码。**
- 消费对象：[research.md](../research.md) 全部关于 Codex 的结论；[映射报告](../reports/2026-09-23-hooks-to-positions.md) 的 Codex 列。

## 当前可消费观察

### 一、事件与 handler 类型

- `protocol/src/protocol.rs:1579-1592` `enum HookEventName` **12 个**：`PreToolUse` `PermissionRequest` `PostToolUse` `PreCompact` `PostCompact`
  `SessionStart` `SessionEnd` `UserPromptSubmit` `SubagentStart` `SubagentStop` `Stop` `Interrupt`。`hooks/src/lib.rs:23-36` 同名常量一致。
- `protocol/src/protocol.rs:1596-1601` `enum HookHandlerType { Command, McpTool, Prompt, Agent }`；`1605-1608` `HookExecutionMode { Sync, Async }`。
- **Prompt 与 Agent 在此 SHA 只解析不运行**：`hooks/src/engine/discovery.rs:635-653` 记 load failure「prompt hooks are not supported yet」「agent hooks are not supported yet」并跳过；文档同说（doc:193-194）。
- `SessionEnd` 不支持 MCP tool handler（`discovery.rs:589-598`；doc:310）。
- 引擎类型名叫 **`ClaudeHooksEngine`**（`hooks/src/registry.rs:1`、`engine/dispatcher.rs:16`）；插件 hook 进程另设 `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA`「for compatibility with existing plugin hooks」（doc:390-397）。
  DSH 作者笔记据此判断「Codex deliberately reimplements a SUBSET of the CC hook protocol」（见 [dsh-hook-protocol.md](dsh-hook-protocol.md)）。

### 二、匹配与执行

- matcher 是**正则**（doc:405）；只有 9 个事件读 matcher（`hooks/src/lib.rs:43-53`），`UserPromptSubmit`/`Stop`/`Interrupt` 忽略（`engine/dispatcher.rs:70-72`；doc:409-424）。
  `apply_patch` 另可用别名 `Edit`/`Write` 匹配，但 stdin 里仍报 `tool_name:"apply_patch"`（doc:426、747-749）。
- **同一事件的匹配 handler 并发启动**，「one hook can't prevent another matching hook from starting」（doc:16-18）；源码用 `FuturesUnordered`（`engine/dispatcher.rs:101-140`），
  `registry.rs:203-205` 注释「Matching handlers run concurrently」。
- `async:true` 只对 command handler；异步 hook「can't block, approve, rewrite, or otherwise control」（doc:625-627），只有同步 handler 能产生控制效果（`engine/mod.rs:154-156` `can_apply_control_effects = Sync`）；
  每会话最多 8 个并发异步 hook（`engine/command_runner.rs:46`；doc:631-632）；会话结束时取消未完成的并丢弃未送达输出（doc:635-636）。
  异步输出「at the next safe point」送达：有活动轮次就等当前模型请求与工具调用结束后给下一次模型请求，没有就等下一次用户轮次（doc:612-619）。
- 进程：`kill_on_drop(true)`、Unix 上 `detach_from_tty` 进程组、超时后按进程组杀（`engine/command_runner.rs:216-231、290-334、338-366`），
  注释「Needed only until command hooks move to the exec server, which owns process-tree cleanup」（`command_runner.rs:337`）。
- 默认超时 600 s；`SessionEnd`、`Interrupt` 默认 1 s、上限 3 s（doc:182-184）。
- 工具覆盖：shell、unified exec、`apply_patch`、MCP、其他本地 function 工具都走 Pre/PostToolUse；**hosted 工具（如 WebSearch）不走**；
  文档原话「Treat tool hooks as a useful guardrail, not a complete enforcement boundary」（doc:438-458）。
- 信任：非 managed hook 按定义哈希审阅信任后才跑（doc:62-78）；项目层 `.codex/` 未受信时不加载项目 hook（doc:58-60）。

### 三、各事件的输出语义（源码为准）

- **PreToolUse**（`hooks/src/events/pre_tool_use.rs`）：
  - 任一 handler 阻断即阻断（`:115`）；阻断时丢弃所有 `updatedInput`（`:129-133`）。
  - **多个 `updatedInput` 按「最后完成的那个」胜出**（`:149-167` `latest_updated_input`，注释「resolves competing rewrites by completion order」）。
  - 退出码 2 且 stderr 非空 = 阻断（`:261-277`）；**其他退出码、超时、起不来 = `Failed`，不阻断**（`:278-291`）。
  - `permissionDecision:"allow"` **必须**带 `updatedInput`，单独 allow 判为不支持；**`ask` 不支持**；`continue:false`/`stopReason`/`suppressOutput` 不支持——都记为 hook 失败、工具照常执行（`engine/output_parser.rs:369-379、441-470`；doc:512-515、819-821）。
  - 改写生效方式：`core/src/tools/registry.rs:601-653` 用 `tool.with_updated_hook_input(invocation, updated_input)` **替换内存里的 invocation 载荷**（如 `core/src/tools/handlers/mcp.rs:436-451` 重写 `arguments`）；
    本轮在 `core/src` 里**没找到**把改写后参数写成会话历史条目的代码。hook 的运行摘要以 `EventMsg::HookCompleted` 发到事件流（`core/src/hook_runtime.rs:891-921`）；**rollout 是否持久化该事件，未核**（rollout crate 不在副本内）。
  - `additionalContext` 写成 developer 消息记入会话历史（`core/src/hook_runtime.rs:841-857` → `sess.record_conversation_items`）。
- **PermissionRequest**（`hooks/src/events/permission_request.rs`）：
  - 在审批路径上、guardian 或用户审批 UI 出现**之前**跑（`:1-6`）；决定折叠「any deny wins, otherwise the last allow wins, otherwise no verdict」（`:13-14、152-168`）。
  - 审批优先级「1. Hooks 2. Guardian 或 user」（`core/src/tools/approvals.rs:500-523`）：hook 给 allow/deny 就直接定，没有就走正常审批。
  - `updatedInput`、`updatedPermissions`、`interrupt:true` 是保留字段，返回即判为无效输出（`engine/output_parser.rs:401-410`）；
    文档说它们「fail closed today」（doc:879-881），**源码里的实际效果是这个 handler 记 `Failed`、不产生决定、落回正常审批流程**（`permission_request.rs:218-224`），不是直接拒绝。
  - 退出码 2 + stderr = deny（`:249-262`）；其他退出码 = `Failed`、无决定。
- **PostToolUse**：`decision:block` 或 exit 2 **不撤销副作用**，而是「replaces the tool result with that feedback, and continues the model」（doc:922-926）；
  `continue:false` 同样用 hook 反馈替换结果（doc:928-930）；`updatedMCPToolOutput` 解析但不支持（doc:932-934）。Bash 非零退出也触发（doc:885-888）。
- **Stop**：`decision:block`「doesn't reject the turn」——自动生成一条以 `reason` 为文本的**续跑 prompt，当作新的用户 prompt**（doc:1085-1087）；
  源码 `core/src/session/turn.rs:663-680` 把它 `record_response_item_and_emit_turn_item` 记进历史并置 `stop_hook_active = true`；任一 hook `continue:false` 优先于续跑（doc:1089-1090；`hooks/src/events/stop.rs:417-419`）。
  **`stop_hook_active` 是 turn 函数里的局部变量**（`turn.rs:407`），不从历史派生；本 SHA 的 `turn.rs`、`stop.rs` 里**没有找到连续续跑次数上限**。
- **SubagentStop**：同 Stop，block 让子代理再跑一轮（doc:1042-1056）。**SubagentStart**：只能注入上下文，`continue:false` 解析但不阻止启动（doc:737-739）。
- **UserPromptSubmit**：可 block（doc:1013-1022）；纯文本 stdout 与 `additionalContext` 作为 developer 上下文（doc:997-1011）；matcher 不用。
- **PreCompact**：`continue:false`「stops before compacting」（doc:964-966）。**PostCompact**：`continue:false`「stops after compacting」（doc:982-984）。
- **SessionStart**：`source` ∈ startup/resume/clear/compact（doc:649）；**根会话压缩之后，`source:"compact"` 的 SessionStart 在下一次模型请求前跑，轮中自动压缩也一样，上下文直接送给紧接着的续跑**；返回 `continue:false` 则结束这一轮、不再发模型请求（doc:667-672；`core/src/session/turn.rs:614-640`）。
- **SessionEnd**：只对主线程，归档/删除/正常关闭/空闲 30 分钟后触发；输出不影响（doc:676-709）。
- **Interrupt**：用户中断活动轮次时触发，子代理与空闲线程不触发；输出「can't prevent the interruption or restart the turn」（doc:1094-1105）。
- 通用：`systemMessage` 作为 UI/事件流警告（doc:503-508）；`additionalContext` 默认约 2,500 token 上限，超出落盘给预览（doc:520-559）。

### 四、legacy `notify`

- `hooks/src/types.rs:90-97` 旧 `HookEvent` 只有 `AfterAgent` 一个变体；`hooks/src/legacy_notify.rs:13-27、44-73` 把它拼成 `agent-turn-complete` JSON 作为 argv 末参 spawn，stdin/stdout/stderr 全接 null，**spawn 成功即返回 Success，不等结果**。
- `registry.rs:61-62、321` 与 `legacy_notify.rs:44` 的 TODO：「Remove … when legacy `notify` support is removed」。调用点在 Stop 放行之后（`core/src/session/turn.rs:693-701`）。
- 旧 `Hooks::dispatch`（`registry.rs:167-180`）是**顺序执行、遇 `FailedAbort` 即停**，与新引擎的并发模型不同；两套并存。

### 五、与人机协作相关

- hook **不能**让 Codex 进入「等人」：PreToolUse `ask` 不支持；PermissionRequest 只能在审批 UI 出现前替人 allow/deny 或弃权。
- **MCP tool handler 可借 MCP elicitation 向用户要输入**：`hooks/src/mcp.rs:18-23`「Implementations own server readiness, policy enforcement, timeout handling, and elicitation」；
  文档「Time spent waiting for an MCP elicitation response doesn't count against the timeout」（doc:306-307）。这是**同步 hook 进程内的等待**，不是可落盘的等待态。
- 审批浮层可从非活跃线程浮出（见 [agent-harness-session-design](../../agent-harness-session-design/research.md)），与 hook 无关，本轮未再核。

### 六、独立实测（cc-master 探针，旧版本）

- Codex CLI **0.142.5**：`Stop` 上 `decision:block` 与 exit 2 都「repeatedly re-enters Stop until timeout」（`probes/README.md`「Stop output probe」段）；
  `strategy.yaml` 的 `output_envelope` 段后来记为「Official Codex Stop decision:block continues the turn…must have an explicit release condition」，并保留「Stop hook exit 2 causes repeated Stop re-entry」。
- 同版本插件 hook 子进程环境里**没有**观察到 `PLUGIN_ROOT`/`PLUGIN_DATA`/`CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA`（`probes/README.md`），与 2026-09-20 文档（doc:390-397）说法不一致——**版本不同，不能判谁错**。
- `apply_patch` 的 `tool_input` 载体随版本变化：0.144.2 与 0.145.0 分别观察到 `{ patch }`、`{ input }`、`{ command }` 等形状（`board-guard/CONTRACT.md`「rule-board-guard-apply-patch-targets」），适配层要把多种载体归一。

## 局限

- 副本不含 rollout 持久化代码，**hook 运行记录与 `updatedInput` 改写是否进 rollout 文件，未核**。
- 未跑任何 Codex 二进制探针；cc-master 的实测对象版本早于本 SHA，只作独立旁证。
- 文档与 `main` 分支 schema 可能不同步（doc:1113-1117）；`hooks/schema/generated/` 的输出 schema 里 `PreToolUsePermissionDecisionWire` 含 `ask`、`PermissionRequestDecisionWire` 含 `interrupt`/`updatedPermissions`，**schema 有而运行时拒收**，按源码记。
