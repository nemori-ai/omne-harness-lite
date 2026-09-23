# Claude Code 2.1.280 / Codex 5c5308f / DSH c291e79 的 hooks → PF-012 拓展点位置映射（2026-09-23）

**取代状态：** 当前有效，未被取代

- 执行者与日期：assets-runtimes 一程的只读调研执行者，2026-09-23。
- 调查范围：两家 hooks 的事件、输入输出、能否拦截/注入、handler 类型；映射到
  [PF-012 §5.8](../../../design/product/PF-012-agent-loop-and-run/design.md#58-loop-拓展点)（rev 7）的十一个位置、两个维度与干预力三档；
  评估 DSH hook-protocol 与两个桥接包作为兼容层起点；为 [PF-008](../../../design/product/PF-008-human-in-the-loop/design.md#52-那个判断函数)（rev 4）的「租户经 hook 自定义人机协作」收集事实。
- 输入与方法：只读源码与文档，不跑二进制。精确来源、行号与立场在三份来源笔记：
  [Claude Code](../notes/claude-code.md) · [Codex](../notes/codex.md) · [DSH](../notes/dsh-hook-protocol.md)。
  本页引用写作「CC doc:行号」（指 [`../sources/claude-code-hooks-2026-09-23.txt`](../sources/claude-code-hooks-2026-09-23.txt)）、
  「Codex doc:行号」（指 `tmp/sources/extracted/codex-docs/hooks.md`）、Codex/DSH 源码路径:行号（相对各自解包根）。
- 处置的既有结论：首次调查。

## 完整报告正文

### 一、Claude Code 2.1.280：33 个事件逐项

来源：CC doc:35-69（总表）、876-914（退出码 2 逐事件）、1045-1069（决策控制）、3488-3530（handler 支持）、各事件小节。
handler 列：**5** = command/http/mcp_tool/prompt/agent 全支持；**3** = command/http/mcp_tool；**C+M** = command 与 mcp_tool。

| 事件 | 何时触发 | 关键输入（公共字段之外） | 输出 / 退出码 2 | 能阻断 | 能注入模型上下文 | handler | matcher |
|---|---|---|---|---|---|---|---|
| SessionStart | 会话开始或恢复（startup/resume/clear/compact/fork） | `source`、有时 `model` | `additionalContext`、`initialUserMessage`、`sessionTitle`、`watchPaths`、`reloadSkills`；纯文本 stdout 也当上下文；`CLAUDE_ENV_FILE` 写环境 | 否 | 是 | C+M | source |
| Setup | `--init-only`，或 `-p` 下 `--init`/`--maintenance` | 触发标志 | 无决策 | 否 | 否 | C+M | init/maintenance |
| UserPromptSubmit | 用户提交 prompt、模型处理前 | `prompt` | `decision:block` 拒绝并**从上下文抹掉**该 prompt；`additionalContext`；纯文本 stdout；`sessionTitle`；**不能改写 prompt** | 是 | 是 | 5 | 无 |
| UserPromptExpansion | 用户输入的命令展开成 prompt 前 | `expansion_type`、`command_name`、`command_args`、`command_source`、`prompt` | block 展开；`additionalContext` | 是 | 是 | 5 | command_name |
| PreToolUse | 模型产出工具参数之后、执行前（每次调用） | `tool_name`、`tool_input`、`tool_use_id`（MCP 另有 `mcp_server`） | `permissionDecision` allow/deny/ask/defer，`updatedInput`，`additionalContext`；exit 2 = deny | 是 | 是 | 5 | 工具名 + `if` |
| PermissionRequest | 即将向用户要权限时（无法弹提示的会话里无决定即拒绝） | `tool_name`、`tool_input`、`permission_suggestions`（无 `tool_use_id`） | `decision.behavior` allow/deny；allow 带 `updatedInput`、`updatedPermissions`；deny 带 `message`、`interrupt`；**exit 2 不起作用** | 是（只经 decision 对象） | 否 | command/http/mcp_tool/prompt（prompt 的 ok:false 无效） | 工具名 |
| PermissionDenied | auto 模式拒绝一次工具调用 | `reason` | `retry:true` 追加「可重试」消息，不撤销拒绝 | 否 | 间接（追加消息） | 5（prompt/agent 输出被丢弃） | 工具名 |
| PostToolUse | 工具成功之后 | `tool_input`、`tool_response`（结构化）、`duration_ms` | `decision:block` 把 reason 附在结果旁（**原结果仍可见**）；`updatedToolOutput` 替换结果；`additionalContext`；`classifierContext`；exit 2 把 stderr 给模型 | 否（已执行） | 是 | 5 | 工具名 |
| PostToolUseFailure | 工具开始执行后失败 | `error`、`is_interrupt`、`duration_ms` | `additionalContext` | 否 | 是 | 5 | 工具名 |
| PostToolBatch | 一批并行调用**全部**有结果、下一次模型调用之前 | `tool_calls[]`（含模型看到的序列化结果） | `additionalContext`；`decision:block`/`continue:false` **在下一次模型调用前停住 agentic loop** | 是 | 是 | 5 | 无 |
| Notification | 宿主发通知（权限提示挂约 6 s、空闲 60 s 等） | `message`、`title`、`notification_type` | 只有 `terminalSequence` 生效 | 否 | 否 | 3 | 通知类型 |
| MessageDisplay | 助手文本流式显示时（按行批） | 文本增量 | `displayContent` **只改屏幕显示**，transcript 与模型所见保持原文 | 否 | 否 | 3 | 无 |
| SubagentStart | 子代理被派生/恢复、团队成员处理新消息 | `agent_id`、`agent_type` | `additionalContext` 注入子代理 | 否 | 是（子代理） | 3 | agent 类型 |
| SubagentStop | 子代理结束回复 | `stop_hook_active`、`agent_transcript_path`、`last_assistant_message`、`background_tasks`、`session_crons` | 同 Stop：block → reason 成为子代理的下一条指令 | 是 | 是 | 5 | agent 类型 |
| TaskCreated | 经 `TaskCreate` 创建任务 | 任务字段 | exit 2 / `decision:block` 取消创建，消息回给模型 | 是 | 间接 | 5 | 无 |
| TaskCompleted | 任务被标为完成 | 任务字段 | exit 2 阻止标完成；`continue:false` 停止成员 | 是 | 间接 | 5 | 无 |
| Stop | 主代理结束回复（用户中断不触发；API 错误走 StopFailure） | `stop_hook_active`、`last_assistant_message`、`background_tasks`、`session_crons` | `decision:block`+`reason` 或 `additionalContext` → **继续**；连续 8 次后宿主强制结束 | 是（阻止停下） | 是 | 5 | 无 |
| StopFailure | 这一轮因 API 错误结束 | `error`、`error_details` | 输出与退出码全忽略（除 `terminalSequence`） | 否 | 否 | 3 | 错误类型 |
| TeammateIdle | 团队成员即将空闲 | — | exit 2 让其继续；`continue:false` 停止 | 是 | 间接 | 5 | 无 |
| InstructionsLoaded | CLAUDE.md 或规则文件载入上下文 | 载入原因 | 退出码忽略，无决策 | 否 | 否 | 3 | 载入原因 |
| ConfigChange | 会话中配置文件变化 | 配置来源 | block 让变更不生效（policy 除外） | 是 | 否 | 3 | 配置来源 |
| CwdChanged | 工作目录变化 | 新目录 | 无决策 | 否 | 否 | 3 | 无 |
| DirectoryAdded | `/add-dir` 等加目录 | 加入方式 | 无决策 | 否 | 否 | 3 | 加入方式 |
| FileChanged | 被监视文件变化 | 文件名 | 无决策 | 否 | 否 | 3 | 文件名列表 |
| WorktreeCreate | 创建 worktree（替代默认 git 行为） | — | 打印路径；任何非零退出 = 创建失败 | 是 | 否 | 3 | 无 |
| WorktreeRemove | 移除 worktree | — | 非零退出 = 移除失败 | 是 | 否 | 3 | 无 |
| PreCompact | 压缩之前 | `trigger`、`custom_instructions` | exit 2 / `decision:block` 阻止压缩；为从上下文超限错误恢复而触发的自动压缩被阻止时请求失败 | 是 | 否 | 3 | manual/auto |
| PostCompact | 压缩之后 | `trigger`、`compact_summary` | 无决策 | 否 | 否 | 3 | manual/auto |
| PreModelSwitch | 用户或客户端请求换模型、生效前 | `from_model`、`to_model` 等 | allow/deny/ask、`decision:block`；**超时即阻断** | 是 | 否 | 3 | 目标模型名 |
| PostModelSwitch | 会话模型变化之后（含宿主自己换） | `from_model`、`to_model` | `additionalContext` 进下一次请求 | 否 | 是 | 3 | 目标模型名 |
| Elicitation | MCP 服务器在工具调用中途要用户输入 | `mcp_server_name`、`message`、`requested_schema` 等 | `action` accept/decline/cancel + `content` 代填；exit 2 拒绝 | 是 | 否 | 3 | 服务器名 |
| ElicitationResult | 用户答完 elicitation、回传服务器前 | 用户的答复 | 覆盖 `action`/`content`；exit 2 → decline | 是 | 否 | 3 | 服务器名 |
| SessionEnd | 会话终止 | `reason` | 无决策；共享 1.5 s 预算 | 否 | 否 | 3 | 结束原因 |

通用规则（CC doc:800-874、941-960）：exit 2 阻断，其他非零退出与超时对多数事件是**非阻断错误**；JSON 在所有退出码上都读；`continue:false` 让宿主停止处理、优先于事件专属决定。

### 二、Codex `5c5308f`：12 个事件逐项

来源：`protocol/src/protocol.rs:1579-1592`、Codex doc:639-1109、`hooks/src/events/*.rs`、`hooks/src/engine/output_parser.rs`。
handler：只有 **command**（可 async）与 **mcp_tool** 实际运行，prompt/agent 解析后跳过（`engine/discovery.rs:635-653`）；`SessionEnd` 不支持 mcp_tool。

| 事件 | 何时触发 | 关键输入（公共字段 `session_id`/`transcript_path`/`cwd`/`hook_event_name`/`model` 之外） | 输出 / 退出码 2 | 能阻断 | 能注入 | matcher |
|---|---|---|---|---|---|---|
| SessionStart | 会话开始；**根会话压缩之后、下一次模型请求前**（`source:"compact"`） | `source`、`permission_mode` | `additionalContext`/纯文本 stdout 作 developer 上下文；`continue:false`（compact 时）结束这一轮 | 否（compact 时可结束这一轮） | 是 | source |
| SessionEnd | 主线程结束（归档/删除/正常关闭/空闲 30 分钟） | `reason`（恒 `other`） | 只作提示，不影响 | 否 | 否 | reason |
| SubagentStart | 子代理启动（ThreadSpawn 的 startup/fork） | `turn_id`、`agent_id`、`agent_type` | `additionalContext` 给子代理；`continue:false` 解析但无效 | 否 | 是 | agent_type |
| PreToolUse | 本地工具执行前（hosted 工具不走） | `turn_id`、`tool_name`、`tool_use_id`、`tool_input` | `permissionDecision:deny`、旧式 `decision:block`、exit 2 → 阻断；`allow`+`updatedInput` → 改写；`additionalContext`；`ask`/单独 `allow`/`continue:false` → hook 失败、工具照常 | 是 | 是 | 工具名（含别名） |
| PermissionRequest | 即将请求审批（shell 提权、网络审批等），在 guardian/用户之前 | `turn_id`、`tool_name`、`tool_input`（可能含 `description`） | `decision.behavior` allow/deny；exit 2 + stderr = deny；无决定 → 正常审批；保留字段 → 该 hook 失败 | 是 | 否 | 工具名 |
| PostToolUse | 本地工具产出结果后（含 Bash 非零退出） | `turn_id`、`tool_name`、`tool_use_id`、`tool_input`、`tool_response` | `decision:block`/exit 2/`continue:false` → **用 hook 反馈替换工具结果**；`additionalContext` | 否（副作用不撤销） | 是 | 工具名 |
| PreCompact | 压缩前 | `turn_id`、`trigger` | `continue:false` 在压缩前停住 | 是 | 否 | manual/auto |
| PostCompact | 压缩后 | `turn_id`、`trigger` | `continue:false` 在压缩后停住 | 是（停住后续） | 否 | manual/auto |
| UserPromptSubmit | 用户 prompt 发送前 | `turn_id`、`prompt` | `decision:block`/exit 2 拒绝；`additionalContext`/纯文本 | 是 | 是 | 不用 |
| SubagentStop | 子代理结束 | `turn_id`、`agent_id`、`agent_type`、`agent_transcript_path`、`stop_hook_active`、`last_assistant_message` | `decision:block`/exit 2 → 子代理再跑；`continue:false` 优先 | 是 | 是 | agent_type |
| Stop | 这一轮模型不再要求 follow-up 时 | `turn_id`、`stop_hook_active`、`last_assistant_message` | `decision:block`/exit 2 → **自动生成一条续跑 prompt（当作新的用户 prompt）**；`continue:false` 优先 | 是（阻止停下） | 是 | 不用 |
| Interrupt | 用户中断主线程的活动轮次 | `turn_id`、`permission_mode` | 只能 `systemMessage`；不能阻止中断或重启；1 s 默认、上限 3 s | 否 | 否 | 不用 |

另有 legacy `notify`：`AfterAgent` 事件，Stop 放行后 spawn 一个 argv 命令、不等结果（`hooks/src/legacy_notify.rs:44-73`；`core/src/session/turn.rs:693-701`），源码标注待移除。

### 三、DSH hook-protocol 与两个桥接包

详见 [DSH 来源笔记](../notes/dsh-hook-protocol.md)。压缩成三点：

1. **库本身**：matcher、codec、merge、detached 与 `HookOutput` 类型不依赖 DSH 运行时；runner 依赖 `ShellExecutor` 接缝；`hook/invoked`/`hook/result` 与 invariant 依赖 DSH 的 Session 与 turn 结构。
2. **桥接**：CC 桥 7 个事件、Codex 桥 5 个；只跑 command；同事件串行；`updatedInput` 不生效、`continue:false` 不执行、`stop_hook_active` 恒假、`systemMessage` 不送达；映射到 DSH 自己的拦截面（`agent/pre-step`、`tools/pre-execute`、`tools/post-execute`、`agent/turn-stopping`、`agent/session-start`、`subagent/start|end`）。
3. **DSH 拦截面 → PF-012 位置**（作为对照，不是本项目的实现）：

| DSH 拦截点 | 最接近的 PF-012 位置 | 差异 |
|---|---|---|
| `agent/pre-step`（瀑布，每一步、认领入站批次之后） | 消息落盘之前（认领的用户消息）＋ 调模型之前 | 一个 DSH 点跨了本项目两个位置；`reject` 让这一步不开 |
| `tools/pre-execute`（瀑布，allow/deny/ask） | 执行动作之前 | `ask` 走审批接缝；`ctx.tools.guard()` 只能 deny |
| `tools/execute`（环绕） | 无——这是 PF-012 [拆两半](../../../design/product/PF-012-agent-loop-and-run/design.md#三种形态两种装得进一种拆两半) 的那一类 | wrapper 里自己重试不经过日志 |
| `tools/post-execute`（瀑布） | 执行动作之后（范围＝这一个） | 可替换内容/值、附加 context |
| `agent/turn-stopping`（awaited 通知 + `agent.steer()`） | 落终态之前 | 续跑靠注入一条消息 |
| `agent/session-start`、`subagent/start|end`（emit） | 非 loop 位置（PF-015、PF-007） | 不能阻断 |
| 无 | 压缩之前/之后、调模型之后、尝试开始之后、落终态之后 | DSH 拦截面不覆盖 |

### 四、按 PF-012 的十一个位置看：每个位置上两家有什么

位置、维度与三档干预力引自 [§5.8 十一个位置](../../../design/product/PF-012-agent-loop-and-run/design.md#十一个位置是推出来的不是挑出来的)、
[两个位置带维度](../../../design/product/PF-012-agent-loop-and-run/design.md#两个位置带维度)、
[干预力三档](../../../design/product/PF-012-agent-loop-and-run/design.md#干预力三档直接用-pf-000-的)（rev 7）。

| PF-012 位置 | Claude Code | Codex | 覆盖判断 |
|---|---|---|---|
| **尝试开始之后** | 无（`SessionStart source=resume` 是会话级恢复，不是一次执行尝试） | 无（同左） | **两家都没有** |
| **消息落盘之前** | 用户消息：`UserPromptSubmit`（可否决＋追加，**不能改写**）、`UserPromptExpansion`；工具结果：`PostToolUse.updatedToolOutput`（改写下一条）；**模型输出：无**（`MessageDisplay` 只改显示） | 用户消息：`UserPromptSubmit`（可否决＋追加）；工具结果：`PostToolUse` block/`continue:false`（用反馈替换结果）；模型输出：无 | **部分**：模型吐出的消息两家都没有落盘前的挂点 |
| **消息落盘之后** | 无通用事件；`additionalContext` 附在 prompt/工具结果旁 | 同左 | 两家没有「任一消息落盘后」的事件 |
| **压缩之前** | `PreCompact`（整体可否决；手动压缩带 `custom_instructions` 输入；不能指定哪些不许压） | `PreCompact`（`continue:false` 否决） | 可否决有；「指定不许压的部分」两家都没有 |
| **压缩之后** | `PostCompact`（只观察，见 `compact_summary`）；`SessionStart source=compact`（追加上下文） | `PostCompact`（`continue:false` 结束这一轮）；`SessionStart source=compact`（追加，或 `continue:false` 结束这一轮） | 有；**同名 SessionStart 按 matcher 值落在不同位置** |
| **调模型之前** | 无逐请求事件；`PostToolBatch` 在工具续跑前触发（可追加、可停住） | 无 | **两家都没有逐请求的挂点**（DSH `agent/pre-step` 有） |
| **调模型之后**（收场：完整回复／失败） | 完整回复：无逐回复事件，只在「最终无工具的回复」上有 `Stop`；失败：`StopFailure`（只观察，且是这一轮已结束之后） | 完整回复：无；失败：无 | **几乎没有**：循环探测这类逐回复挂件在两家都没对应事件 |
| **执行动作之前** | `PreToolUse`（allow/deny/ask/defer、改写参数、追加）；`PermissionRequest`（在放行判断内、提示出现前替人决定）；`PermissionDenied`（自动否决之后追加「可重试」） | `PreToolUse`（deny、改写、追加）；`PermissionRequest`（allow/deny/弃权） | 有，且最丰富 |
| **执行动作之后**（范围：这一个／这一批全齐） | 这一个：`PostToolUse`（成功）、`PostToolUseFailure`（失败）；这一批：`PostToolBatch` | 这一个：`PostToolUse`（成败都触发）；这一批：无 | CC 两种范围都有；Codex 只有「这一个」 |
| **落终态之前** | `Stop`（终态＝完成的情形；block＝接着转）；子代理的 `SubagentStop`、团队成员 `TeammateIdle` | `Stop`、`SubagentStop` | 有；只覆盖「要完成」这一种终态，失败/取消之前无 |
| **落终态之后** | 无精确对应（`StopFailure` 是失败收场的只观察；`Notification agent_completed` 只对后台会话） | legacy `notify`（`AfterAgent`，完成之后只观察）；`Interrupt`（被取消，只观察） | 部分 |

### 五、事件 → 位置映射表

「所需干预力」按 PF-012 三档写这个事件的**最强输出**要求哪一档；「非 loop」给出归属 topic。
维度：**收场**（调模型之后）、**范围**（执行动作之后）；其余位置无维度。

#### Claude Code

| 事件 | PF-012 位置 | 维度 / 情形筛选 | 所需干预力 | 说明 |
|---|---|---|---|---|
| SessionStart（startup/resume/clear/fork） | **非 loop**：PF-015 会话生命周期 | — | 可改写（追加上下文） | 另带环境、标题、监视路径等会话级副作用 |
| SessionStart（compact） | **压缩之后** | 情形：压缩刚发生 | 可改写 | 同一事件名按 matcher 值拆到两个归属 |
| Setup | **非 loop**：装配/CLI（PF-004、PF-016） | — | 只观察 | |
| UserPromptSubmit | **消息落盘之前** | 情形：用户消息 | 可否决（拒绝落盘）＋可改写（追加） | 不能改写 prompt 本身 |
| UserPromptExpansion | **消息落盘之前** | 情形：用户输入的命令展开 | 可否决＋可改写 | 展开属技能/命令，归属另见 PF-006 |
| PreToolUse | **执行动作之前** | 情形：工具名＋`if` 参数规则 | 可否决（deny）；可改写（`updatedInput`、追加、`ask` 落卡片） | `allow` 属于「放宽」，三档里没有这一档（见 §七） |
| PermissionRequest | **执行动作之前**（放行判断内部、卡片出现前） | 情形：需要问人的调用 | 可否决（deny）；`allow` 替人放行；`updatedPermissions` 改权限设置 | 后两者超出三档（见 §七） |
| PermissionDenied | **执行动作之前**（自动否决已发生之后） | 情形：被 auto 模式否决 | 可改写（追加「可重试」） | 不撤销否决 |
| PostToolUse | **执行动作之后** | 范围＝这一个；情形：成功 | 可改写（`updatedToolOutput`、追加） | `block` 只追加说明，不是否决 |
| PostToolUseFailure | **执行动作之后** | 范围＝这一个；情形：失败 | 可改写（追加） | 成败拆成两个事件；PF-012 的维度只有范围，成败只能作「情形」 |
| PostToolBatch | **执行动作之后** | 范围＝这一批全齐 | 可改写（追加）；`block`/`continue:false` 要求**否决下一次调模型或落终态** | 一个事件同时触及「执行动作之后」与「调模型之前」 |
| Notification | **非 loop**：PF-008 决策池陈列 / PF-016 送达面 | — | 只观察 | |
| MessageDisplay | **非 loop**：PF-016 呈现 | — | 只观察（对日志） | 只改屏幕，不改记录 |
| SubagentStart | **非 loop**（父侧）：PF-007；对子 Run 相当于开局注入 | — | 可改写 | |
| SubagentStop | 子 Run 的 **落终态之前** | 情形：子代理类型 | 可否决（接着转） | 父侧归 PF-007 |
| TaskCreated / TaskCompleted | **非 loop**：工具私有状态（PF-006） | — | 可否决（对该工具的结果） | 事件只存在于 CC 的任务工具 |
| Stop | **落终态之前** | 情形：终态＝完成 | 可否决（**这次不许收束，接着转**） | 与 PF-012「方向相反」那一条逐字吻合 |
| StopFailure | **落终态之后**（终态＝失败，原因：API 错误） | — | 只观察 | CC 的「轮」≠ 本项目的 Run，边界不完全重合 |
| TeammateIdle | 成员 Run 的 **落终态之前**；本项目无「团队成员」对象 | — | 可否决 | |
| InstructionsLoaded | **无位置**：上下文载入是组装，[组装是纯派生](../../../design/product/PF-012-agent-loop-and-run/design.md#53-改日志的动作与纯派生的动作)，推不出位置 | — | 只观察 | |
| ConfigChange / CwdChanged / DirectoryAdded / FileChanged | **非 loop**：设置与资产（PF-002）、执行环境（PF-005） | — | ConfigChange 可否决，其余只观察 | |
| WorktreeCreate / WorktreeRemove | **非 loop**：执行环境（PF-005） | — | 可否决（对环境操作） | |
| PreCompact | **压缩之前** | 情形：manual/auto | 可否决（不压） | PF-012 的否决表没列这个位置 |
| PostCompact | **压缩之后** | 情形：manual/auto | 只观察 | |
| PreModelSwitch / PostModelSwitch | **非 loop**：会话设置变更（PF-013 模型档案） | — | Pre 可否决；Post 可改写（追加） | 不是逐请求换模型 |
| Elicitation / ElicitationResult | **非 loop**：工具执行内部的等待（PF-006 工具等待态；[PF-008 等待态左列](../../../design/product/PF-008-human-in-the-loop/design.md#等待态的两个维度)） | — | 代答属于替人作答（见 §八） | |
| SessionEnd | **非 loop**：PF-015 | — | 只观察 | |

#### Codex

| 事件 | PF-012 位置 | 维度 / 情形筛选 | 所需干预力 | 说明 |
|---|---|---|---|---|
| SessionStart（startup/resume/clear） | **非 loop**：PF-015 | — | 可改写（追加） | |
| SessionStart（compact） | **压缩之后** | 情形：压缩刚发生 | 可改写；`continue:false` 要求**否决下一次调模型或落终态** | 轮中压缩也触发 |
| SessionEnd | **非 loop**：PF-015 | — | 只观察 | 只对主线程 |
| SubagentStart | **非 loop**（父侧）：PF-007 | — | 可改写 | |
| PreToolUse | **执行动作之前** | 情形：工具名（含别名） | 可否决；可改写（`updatedInput`、追加） | `ask` 不支持 |
| PermissionRequest | **执行动作之前**（放行判断内部、审批前） | 情形：需要审批的调用 | 可否决；`allow` 替人放行 | |
| PostToolUse | **执行动作之后** | 范围＝这一个（成败都触发） | 可改写（**用反馈替换结果**、追加） | 与 CC 同名事件的 block 语义不同 |
| PreCompact | **压缩之前** | 情形：manual/auto | 可否决 | |
| PostCompact | **压缩之后** | 情形：manual/auto | `continue:false` 要求否决下一步或落终态 | |
| UserPromptSubmit | **消息落盘之前** | 情形：用户消息 | 可否决＋可改写（追加） | |
| SubagentStop | 子 Run 的 **落终态之前** | 情形：agent_type | 可否决（接着转） | |
| Stop | **落终态之前** | 情形：终态＝完成 | 可否决（接着转，续跑 prompt 记进历史） | 本 SHA 未见连续续跑上限 |
| Interrupt | **落终态之后**（终态＝被取消）；取消本身[不是转移表里的一行](../../../design/product/PF-012-agent-loop-and-run/design.md#56-状态转移表) | — | 只观察 | 1–3 s 预算 |
| legacy notify（AfterAgent） | **落终态之后**（完成） | — | 只观察 | 待移除 |

### 六、映射不上的，以及为什么

**两家有、PF-012 十一个位置里没有的**（全部归「非 loop」）：

| 事件 | 为什么不是 loop 位置 | 归属 |
|---|---|---|
| SessionStart（非 compact）、SessionEnd、Setup | 会话的生灭与装配，不是某个 Run 的状态点；PF-012 明说「尝试开始之前」归 PF-015 | PF-015、PF-004/PF-016 |
| SubagentStart / SubagentStop（父侧视角） | 子代理是元能力；子 Run 自己的 loop 另有自己的位置 | PF-007 |
| Interrupt | 取消是随时可能来的外部事件，[不是转移表里的一行](../../../design/product/PF-012-agent-loop-and-run/design.md#56-状态转移表)；能挂的只是它落终态之后 | PF-014（插队/中断）、PF-012 取消 |
| Notification | 送达人的提醒，不改日志 | PF-008 决策池 / PF-016 |
| MessageDisplay | 只改显示，记录不变 | PF-016 |
| InstructionsLoaded | 上下文载入属于组装，组装纯派生，**按 PF-012 的推导规则本来就推不出位置** | PF-010 |
| ConfigChange、CwdChanged、DirectoryAdded、FileChanged、WorktreeCreate/Remove | 环境与设置的变化，不是 loop 状态点 | PF-002、PF-005 |
| PreModelSwitch / PostModelSwitch | 会话级设置变更；「调模型之前换模型」这个用法在 PF-012 属于调模型之前的挂件，CC 这两个事件却只管人或客户端发起的切换 | PF-013 |
| TaskCreated / TaskCompleted / TeammateIdle | CC 私有工具与「团队」对象，本项目没有对应对象 | 工具私有（PF-006）；团队无对应 |
| Elicitation / ElicitationResult | 工具执行内部的等待，不是 Run 的等待 | PF-006、PF-008 左列 |

**PF-012 有、两家都没有的位置**：尝试开始之后；消息落盘之前（模型产出的消息）；消息落盘之后（通用）；调模型之前（逐请求）；调模型之后（逐回复，完整回复那一维）。
这意味着：从 CC/Codex 迁来的 hook 配置**不会自然用到这五处**；而系统自带的[循环探测](../../../design/product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪)站的「调模型之后（完整回复）」在两家都没有对应事件。

### 七、形态，以及输出怎样折成「追加一条 / 决定下一条长什么样 / 否决」

**形态**：两家都是**点式**——到了事件调一次、拿一个结论。同一事件多个 hook 时**并行跑、按优先级折叠**，不是 PF-012 采用的瀑布式「前一件的输出是后一件的输入」：

| | 同事件多个 hook | 决定折叠 | 改写冲突 |
|---|---|---|---|
| Claude Code | 并行（CC doc:416） | PreToolUse：`deny > defer > ask > allow`（CC doc:1819）；PreModelSwitch：`deny > ask > allow` | **文档未说**；PostToolUse 的 `classifierContext` 段提到「another hook's rewrite replaces it」（CC doc:2092），说明只有一份改写生效 |
| Codex | 并发（Codex doc:16-18；`engine/dispatcher.rs:101-140`） | 任一阻断即阻断；PermissionRequest「any deny wins, otherwise the last allow wins」 | **最后完成的那个胜出**（`events/pre_tool_use.rs:149-167`）——同一配置两次运行可能得到不同改写 |
| DSH 桥 | 串行（作者选的） | `deny > ask > allow`，与顺序无关 | 不生效 |

CC 的 `agent` handler 在 hook 内部最多跑 50 轮子代理（CC doc:3633-3642）；Codex 的 mcp_tool handler 可在 hook 内等 MCP elicitation。
这两者都是「挂件肚子里的计算」，只要最后交出一个结论、结论被记下，就不是 PF-012 说的[环绕式后一半](../../../design/product/PF-012-agent-loop-and-run/design.md#三种形态两种装得进一种拆两半)（后者是挂件自己循环调 loop 的下一层）；但它们的花费按 [PF-012 挂件自己花的钱](../../../design/product/PF-012-agent-loop-and-run/design.md#挂件自己花的钱算它插手的那个-run) 算进 Run。

**输出折叠到 PF-012 三种动作**（[能做什么，不能做什么](../../../design/product/PF-012-agent-loop-and-run/design.md#能做什么不能做什么)）：

| PF-012 动作 | Claude Code 输出 | Codex 输出 |
|---|---|---|
| **追加一条** | 各事件的 `additionalContext`（transcript 里存为 `hook_additional_context` 附件，resume 时重放不重跑）；Stop/SubagentStop 的 `reason`；PermissionDenied `retry`；PostToolUse `block` 的 reason；`systemMessage`（给人看，transcript 存为 `hook_system_message`） | `additionalContext`（记为 developer 消息）；Stop `block` 的续跑 prompt（记为用户侧 response item）；`systemMessage`（事件流警告） |
| **决定下一条还没落盘的东西长什么样** | PostToolUse `updatedToolOutput`；PreToolUse/PermissionRequest `updatedInput`（改的是下一个动作的参数） | PostToolUse `block`/`continue:false`（用反馈替换结果）；PreToolUse `updatedInput` |
| **否决** | PreToolUse `deny`、PermissionRequest `deny`、UserPromptSubmit/UserPromptExpansion `block`、PreCompact `block`、Stop/SubagentStop `block`（方向相反）、PostToolBatch `block`、PreModelSwitch `deny` | PreToolUse 阻断、PermissionRequest `deny`、UserPromptSubmit `block`、PreCompact `continue:false`、Stop/SubagentStop `block` |

**「只能靠改日志起作用」承载不了、或要额外付代价的输出**（[§6.9](../../../design/product/PF-012-agent-loop-and-run/design.md#69-拓展件只能靠改日志起作用)、[§6.10](../../../design/product/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论)）：

| 宿主输出 | 冲突点 | 承载它的代价 |
|---|---|---|
| **`updatedInput` 改写工具参数**（两家） | 模型那条回复（含原参数）在「调模型之后」已落盘；执行改写后的参数而日志只有原参数，就是**不留痕地改下一步**。Codex 只改内存里的 invocation，本轮未见写入历史；CC 是否记下原→新两份参数未核 | 必须多记一条「生效参数（及原参数）」；DSH 的提案指出执行前参数还有审计与界面两个读者，要三处原子一致；改写 assistant 消息里的 tool-call 块在重放时是否被提供方拒收是未决问题 |
| **Codex 并发改写「最后完成者胜」** | 同配置重跑可能选中不同改写 | 胜出的那一份必须作为结论落日志；[新的一次尝试里不重跑挂件](../../../design/product/PF-012-agent-loop-and-run/design.md#第二条是硬的因为它护着-f-的纯性)，所以重算不受影响，但首跑结果本身不确定 |
| **`continue:false`**（两家通用字段；CC 说它优先于一切事件专属决定） | PF-012 里挂件不能自己指定跳到哪一步，只能**落一条终态事实**；而宿主没说这是完成、失败还是被取消 | 翻译时必须替 hook 选一个终态与原因；选错会让 Run 的终态与作者意图不一致 |
| **PostToolBatch / Codex PostCompact / SessionStart(compact) 的「停住」** | 这些事件站在「执行动作之后」或「压缩之后」，PF-012 这两个位置没有否决语义 | 只能译成「追加一条终态」或「调模型之前的否决」，跨了位置 |
| **UserPromptSubmit `block` 抹掉 prompt** | 若 prompt 已落盘，抹掉就违反只增不改 | 只能在「消息落盘之前」执行；PF-012 的否决表没列这个位置的否决含义 |
| **PermissionRequest `updatedPermissions` / `setMode`**（CC） | 写 `localSettings`/`projectSettings`/`userSettings` 或改权限模式——这是改资产（权限设置），不是改日志 | 在本项目要走 [PF-002 资产治理](../../../design/product/PF-002-assets-settings-and-permissions/design.md#loop-extension) 与 [PF-008 第四档的资格约束](../../../design/product/PF-008-human-in-the-loop/design.md#52-那个判断函数)，拓展件的三档干预力里没有这一项 |
| **`allow` 预批 / 替人放行**（CC PreToolUse、两家 PermissionRequest） | 三档里只有收紧（否决）和改写，没有「放宽」一档 | 需要另行定义谁有权放宽；否则只能把 allow 当「无意见」 |
| **SessionStart 的 `CLAUDE_ENV_FILE`、`watchPaths`、`reloadSkills`、`sessionTitle`** | 会话与执行环境的副作用，不在 loop 日志里 | 归 PF-015/PF-005，兼容层要另找宿主 |
| **MessageDisplay `displayContent`** | 只改显示 | 归 PF-016，不进 loop |
| **异步 hook 的迟到输出**（两家） | 什么时候到与 loop 走到哪一步无关 | 迟到的输出要作为[外面进来的事](../../../design/product/PF-012-agent-loop-and-run/design.md#511-外面进来的事怎么到-agent-眼前)先落日志；异步 hook 本身只能是只观察 |
| **超时/崩溃不阻断**（两家对多数事件，包括 PreToolUse） | PF-012：可否决那一档挂了**必须当否决** | 兼容层若按 PF-012 执行，原作者以为「挂了就放行」的 hook 会变成「挂了就拦」；若按宿主语义执行，又违背 fail-closed |
| **Stop 续跑计数**：CC 8 次上限、`stop_hook_active`；Codex `stop_hook_active` 是 turn 函数局部变量 | PF-012 要求[检测状态从日志派生，不另存](../../../design/product/PF-012-agent-loop-and-run/design.md#67-检测状态从日志派生不另存) | 计数要能从日志里数出来，崩溃后才复现 |

### 八、人机协作：一批先判完、落卡片即等人、自定义等待与提问

对照 [PF-008 §5.2 判断函数](../../../design/product/PF-008-human-in-the-loop/design.md#52-那个判断函数)、
[§5.3 一批卡片](../../../design/product/PF-008-human-in-the-loop/design.md#53-一批卡片与答完是什么意思)、
[§6.1 永远等着](../../../design/product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答)（rev 4）。

| 能力 | Claude Code | Codex | DSH |
|---|---|---|---|
| **一批动作先全判完再执行** | 没有「批前」事件：PreToolUse 逐调用触发；PostToolUse 在并行调用时并发触发（CC doc:2162），PreToolUse 是否同样并发、是否所有 PreToolUse 判完才开始执行任何一个，**文档未说**；`PostToolBatch` 在批**后** | 没有：每个调用各自 PreToolUse→审批→执行；支持并行的工具在读锁下并发（`core/src/tools/parallel.rs:124、179-182`） | 没有：`tools/pre-execute` 逐调用 |
| **hook 让会话进入「等人」** | `ask`：弹标准权限提示（交互会话、auto 模式也强制弹），提示带 hook 来源标签与 reason；等待在宿主进程内。`defer`：**只在 `-p`**、**只在一轮只有一个工具调用时**；进程以 `tool_deferred` 退出、调用留在 transcript、外部调用方 resume 后同一调用再过一次 PreToolUse；无超时 | 不能：`ask` 不支持；PermissionRequest 只能在审批 UI 前替人决定或弃权 | CC 桥的 `ask` 走 `ctx.approval` 审批接缝，没有应答方就 fail-closed 为 deny |
| **hook 产出自定义提问 / 卡片** | 不能定义选项：`ask` 用的是宿主固定的权限对话框；能**代答**：AskUserQuestion 经 `allow`+`updatedInput` 填 `answers`，Elicitation 经 `accept`+`content` 代填 MCP 表单 | 不能定义卡片；mcp_tool handler 可经 MCP elicitation 在 hook 进程内向用户要输入，等待不计超时（Codex doc:306-307） | 无 |
| **handler 类型可用于判断** | `prompt`（单轮模型判断 `{ok,reason,impossible}`）、`agent`（最多 50 轮子代理，experimental）；PermissionRequest 上 prompt 的 `ok:false` 无效、不支持 agent | `Prompt`/`Agent` 已在枚举里，但本 SHA 解析后跳过 | 只 command |
| **无法问人时** | 无法弹提示的会话里 PermissionRequest 没有决定即拒绝（CC doc:1893）；`ask` 在非交互面（`-p`、`/config`、`set_model`）上对 PreModelSwitch 当拒绝（CC doc:3251） | 落回 guardian 或用户审批 | 拒绝 |

与本项目产品正文对照得出的事实（只报告，不建议）：

- PF-008 的等待是**落盘的、可一等三天、不占协程**的等待；两家 hook 能引出的等待，除 CC `defer` 外都是宿主进程内的等待；`defer` 最接近「停住等」，但受限于 `-p`、单调用、外部进程恢复，且不进任何「决策池」。
- PF-008 §6.1「系统不替人作答」；两家都允许 hook 在人看到之前替人 allow、替人填 AskUserQuestion 答案、替人填 MCP elicitation 表单。
- PF-008 §6.8 卡片来源只有「agent 发起」与「系统发起」两种，选项集也按来源固定；两家 hook 的 `ask` 用宿主固定对话框、不自带选项集，**没有「hook 自带选项」的先例可对照**。

### 九、短板与代价

1. **Claude Code 版本漂移**：本机 2.1.280；快照页最高提到 v2.1.274，且大量规则带「requires v2.1.xxx」「before v2.1.xxx」的版本分叉（如匹配器连字符 2.1.195、exit 2 + 坏 JSON 仍阻断 2.1.214、坏 JSON 不再当上下文 2.1.248）。DSH 以 30 个事件为基线，今天是 33 个。本轮没有逐事件探针。
2. **Codex 仍在演进**：prompt/agent handler 声明了但不运行；PermissionRequest 的 `updatedInput`/`updatedPermissions`/`interrupt` 在 schema 里有、运行时拒收；PostToolUse 的 `updatedMCPToolOutput`、通用 `suppressOutput` 解析但不支持；legacy `notify` 与新引擎并存且标注待移除；事件从 DSH 基线的 10 个涨到 12 个；独立探针显示 0.142.5 的 Stop 续跑与今天文档描述不同，0.144–0.145 间 `apply_patch` 的 `tool_input` 形状变过。
3. **command handler 起子进程**：CC「Command hooks execute shell commands with your full user permissions」（CC doc:3776-3780），无控制终端（CC doc:744）；Codex 用 tokio 子进程、进程组清理、`kill_on_drop`，注释说等迁到 exec server 再由后者负责进程树（`engine/command_runner.rs:337`），**本轮未在 Codex hook runner 里看到沙箱包装**。两家的取消都靠超时与杀进程组；Codex 的 SessionEnd/Interrupt 只有 1–3 s。对一个多租户、服务端的系统，租户写的 command hook 要在哪个执行环境里跑、归谁的资源账，两家都没有可照搬的答案。
4. **跨宿主语义不一致**：见 §十。
5. **失败方向**：两家对多数事件都是 fail-open（超时、崩溃、路径写错都放行，CC 文档专门警告「a mistyped path … leaves the gate silently disabled」），只有少数例外（CC PreModelSwitch 超时阻断、Agent SDK 回调超时阻断）。

### 十、跨宿主不一致（同名事件）

| 点 | Claude Code | Codex |
|---|---|---|
| 事件数 | 33 | 12 |
| handler 实际可用 | 5 种 | command、mcp_tool |
| matcher | 精确/正则混合；工具事件另有 `if` | 一律正则；`apply_patch` 有 `Edit`/`Write` 别名 |
| 非零非 2 退出码时的 JSON | 读，且有效 JSON 决定结果 | 只在 exit 0 解析 |
| PreToolUse `allow` | 跳过权限提示 | 只能和 `updatedInput` 一起用；不跳过审批 |
| PreToolUse `ask` / `defer` | 支持（defer 限 `-p`） | 不支持，hook 记失败、工具照常 |
| PermissionRequest exit 2 | 不起作用 | = deny |
| PostToolUse `block` | 把 reason 附在结果旁，原结果仍可见；改结果用 `updatedToolOutput` | 用反馈**替换**结果 |
| Stop `block` | reason 喂给模型；连续 8 次后强制结束 | 生成一条续跑 prompt 记进历史；未见上限 |
| Stop 触发条件 | 主代理结束回复；API 错误走 StopFailure | 模型不再要求 follow-up |
| 压缩后 | PostCompact 只观察；SessionStart(compact) 追加 | PostCompact 可 `continue:false`；SessionStart(compact) 追加或结束这一轮 |
| 子代理 hook 的 `session_id` | 文档未说取父还是子；在子代理内触发时另给 `agent_id`/`agent_type`（CC doc:763-768） | 用**父会话**的 id（Codex doc:468） |
| 公共输入扩展 | `prompt_id`、`scratchpad_dir`、`effort`、`permission_mode` | `model`、`turn_id`、`permission_mode` |
| additionalContext 上限 | 每值 10,000 字符 | 默认约 2,500 token，可按 handler 调 |
| 信任 | 工作区信任对话框；`-p` 视为信任 | 按定义哈希逐个信任；managed 例外 |
| 插件路径变量 | `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_DATA}` | `PLUGIN_ROOT`/`PLUGIN_DATA`，另设 `CLAUDE_PLUGIN_*` 兼容（文档；0.142.5 探针未见） |

## 本轮结论

见 [research.md](../research.md)，本轮结论原样收录在那里，不在此复述。

## 本轮局限

- 没有 Claude Code 源码；CC 部分全部基于 2026-09-23 线上文档与本机少量 transcript 样本。
- Codex 副本不含 rollout 持久化代码，hook 运行记录与改写是否持久化未核。
- 没有运行任何宿主二进制探针；「文档/源码说的」不等于「2.1.280 / 当前 Codex 发行版实际做的」。
- 「映射到哪个位置」是本轮按 PF-012 的状态点定义所作的推断，不是宿主自述；CC 的「轮」、Codex 的 turn 与本项目的 Run 边界不完全重合，映射在 Run 边界处（StopFailure、Interrupt、legacy notify）尤其是近似。
