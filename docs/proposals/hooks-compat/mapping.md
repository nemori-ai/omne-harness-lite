# 事件映射、机制对照与刹车

[提案索引](README.md) · [需求覆盖](requirements.md) · [六系统研究 §4.4 站点](../../research/agent-loop-events-and-hooks/README.md#44-按站点看六家的挂点)

依据：[Claude Code 笔记](../../research/agent-loop-events-and-hooks/notes/claude-code.md)
（Claude Agent SDK `0.3.270`）、[Codex 笔记](../../research/agent-loop-events-and-hooks/notes/codex.md)
（`d77ebc7`）、[DSH 笔记](../../research/agent-loop-events-and-hooks/notes/dsh.md)（`c291e79`）。
上游事件名与字段以这些快照为准；上游演化后按 HK-2 重新对照。

## 站点与权力

| 站点 | 循环位置 | 扩展点的权力（RD-17 / TL-13） | 兼容层可登记的 API |
|---|---|---|---|
| S0 | Run 取得驱动（[RD-04](../../../spec/capabilities/run-driver/v2/contract.md)） | 观察；prompt section 贡献 | 观察者 + `contributePromptSection(scope: run)` |
| S1 | 输入受理后、取批前 | 受理后守卫：只关闭项（缺口，随闭环发版） | `omneSession.registerArrivalGuard` → `{close: reason} \| pass` |
| S2 | 装配 | 改写 prompt section 与 skill 贡献，不可阻断 | 不登记（上游无对应事件） |
| S3 | 模型请求 | 不开放改写；模型切换只在下一 Run 生效 | 观察者（`PostModelSwitch`）；`PreModelSwitch` 守卫留候选 |
| S5 | 工具准入 | TL-07 门之后的 TL-13 守卫，只能收紧；参数不可改 | `omneTools.registerGuard` → `{tighten: deny \| ask, reason, context?} \| pass` |
| S7 | 工具结果进入投影 | 只选择进入模型的投影，不改耐久结果 | `omneTools.registerProjectionSelector` → `{exclude: reason} \| {context}` |
| S8 | Run 完成条件成立 | 无"阻止停止"hook | 提交后观察者 + `omneSession.accept{source: hook_continuation}` |
| S9 | Session 归档 / 删除、实例 dispose | 观察 | 观察者 |
| 旁路 A | 压缩辅助 Step（[RD-07](../../../spec/capabilities/run-driver/v2/contract.md)） | 观察；辅助 Step 输入贡献 | 观察者 + 输入贡献 |
| 旁路 B | Run 控制提交后 | 观察 | 观察者 |
| 旁路 C | 派发调用与子 Run 结算 | 同 S5 / S8 | 随 PF-004 |

所有观察者都消费 `records.envelope.committed`（[LC](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md) 提交后反应），在提交之外运行，不能延迟或撤销提交。

## 事件映射：两家共有

"兑现"是上游决定字段在这里的实际效果；"降级 / 不支持"记录但无效果并在 `hooks.run.completed`
里回报 `unsupported`。

| 上游事件（CC = Claude Code，CX = Codex） | 站点 | 落点 | 兑现 | 降级 / 不支持 |
|---|---|---|---|---|
| `SessionStart{source: startup \| resume \| clear \| compact \| fork}` | S0 | RD-04 三种取得方式：新 Run = startup；重取 = resume；压缩辅助 Step 后 = compact；fork = 派生 Session | `additionalContext` → 本 Run 首个 Step 的 prompt section（source = hook）；`sessionTitle` → `session.meta.renamed{manual: false}` 建议 | 退出码 2（决定 o）；`initialUserMessage`、`watchPaths`、`reloadSkills` |
| `UserPromptSubmit{prompt}` | S1 | 输入已作为 arrival 受理并入队；hook 在受理后、取批前运行 | `decision: block` / 退出码 2 → `queue.item.closed{closed_by_guard}` + `inbound.arrival.closed{closed_by_guard}`，reason 用户可见；`additionalContext` → 该批 prompt section | `suppressOriginalPrompt`、擦除或改写 prompt：耐久输入不擦不改 |
| `PreToolUse{tool_name, tool_input, tool_use_id}` | S5 | TL-13 守卫，在 TL-07 门之后、准入之前同步求值 | `permissionDecision: deny \| ask`、退出码 2 → 收紧（deny → `denied_before_execution{reason: stderr}`；ask → HD 请求）；`additionalContext` → 下一 Step 投影；多 hook 取最严格 | `allow` 不能越过 AU 的 deny / ask；`updatedInput`；CC `defer` |
| `PermissionRequest{tool_name, tool_input}` | S5 / HD | HD 请求创建之后、呈现给人之前 | `decision.behavior: allow \| deny` → 程序化作答（决定 p：主体 = 装配者且持作答资格；否则降级观察）；`interrupt` → Run interrupt（需控制权） | `updatedInput`、`updatedPermissions` |
| `PostToolUse{tool_name, tool_input, tool_response}` | S7 | 结算 arrival 裁决为 continuation 后、开 Step 前 | `additionalContext` → 投影贡献；`decision: block` / 退出码 2 → 该结果不进投影，以 `blocked_by_hook{reason}` 占位；耐久结果与用户可见结果不变 | CC `updatedToolOutput`；CX "结果替换为错误文本" |
| `Stop{stop_hook_active, last_assistant_message}` | S8 | `run.lifecycle.changed{completed}` 提交后 | `decision: block + reason` → 以 reason 入队 `hook_continuation` trigger，下一 Run 立即开始；`stop_hook_active` 按[刹车](#stop-续跑的刹车)提供 | 阻止 Run 结算；`continue: false` 只记录；续跑是新 Run 而非同 turn |
| `SubagentStart{agent_id, agent_type}` / `SubagentStop` | 旁路 C | Start = 派发调用 admitted；Stop = 子 Session 的 Run 结算 | Start 的 `additionalContext` → 子 Run 首 Step；Stop 同 `Stop` 映射作用于子 Session | 形态随 PF-004 |
| `PreCompact{trigger, custom_instructions}` / `PostCompact{compact_summary}` | 旁路 A | RD-07 辅助 Step 前后 | 观察；`custom_instructions` → 辅助 Step 输入；`PostCompact.additionalContext` → 下一 Step | CX 的阻断（决定 r） |
| `SessionEnd{reason}` | S9 | `session.lifecycle.changed{archived \| deleted}` 与实例 dispose 提交后 | 观察 | —（两家都不阻断） |

## 事件映射：只有一家有

| 上游事件 | 站点 | 处理 |
|---|---|---|
| CX `Interrupt` | 旁路 B | Run 控制 interrupt 提交后观察；`systemMessage` → 用户可见通知 |
| CC `PostToolUseFailure` / `PostToolBatch` | S7 | 观察 + `additionalContext`；Batch 在 Step 收束后触发 |
| CC `PreModelSwitch` / `PostModelSwitch` | S3 | Post 观察；Pre 的阻断 → [MC-08](../../../spec/capabilities/model-execution/v1/contract.md) switchModel 的收紧守卫，留候选不在首版 |
| CC `PermissionDenied{retry}` | S5 | 观察；`retry` 提示进投影 |
| CC `UserPromptExpansion` | S1 | [IN-01](../../../spec/capabilities/command-input/v1/contract.md) slash 解析前：阻断展开 → 命令项 closed；低优先 |
| CC `Notification`、`MessageDisplay`、`ConfigChange`、`InstructionsLoaded`、`CwdChanged`、`FileChanged`、`DirectoryAdded`、`WorktreeCreate/Remove`、`Elicitation/Result`、`Setup`、`TeammateIdle`、`TaskCreated/Completed` | — | 首版不支持：无对应概念或属客户端 / 环境层；配置里出现时写 `hooks.config.unsupported{event}` |

## 机制对照

| 维度 | Claude Code | Codex | DSH 兼容层 | 本提案 |
|---|---|---|---|---|
| handler 类型 | command / http / mcp_tool / prompt / agent | command / mcp_tool | command | command（决定 u）；其余各随依赖能力 |
| 配置来源 | user / project / local / managed / plugin / skill 与 subagent frontmatter / SDK | managed / user / project / plugin；`hooks.json` 或 `config.toml [hooks]` | 插件配置 | hooks 是 Plugin / Skill 的声明性成员（[PF-010](../../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md)）：随资产版本、租户选用与 TG 资格发现；不读工作目录的任意 settings 文件 |
| 信任 | managed 层可禁其余；`allowManagedHooksOnly` | `hook_key` + `trusted_hash`；Managed / Untrusted / Trusted / Modified | — | hook 配置是精确版本资产，执行主体是装配它的租户成员；命令在 live-agent v1 执行信任前提下运行，无沙盒即无隔离承诺（决定 v）；"只允许受管 hook"由租户资产策略表达 |
| 执行顺序 | 同事件并行 | 串行 | 串行 | 串行、按声明顺序；决定合并取最严格；`additionalContext` 全部保留按序拼接 |
| async | `async: true` 不等待 | async 不施加控制效果 | — | async 只能观察与注入下一 Step 上下文，不能阻断 |
| 失败语义 | 退出码 2 阻断；其余不阻断；命令超时不阻断 | 2 阻断；其余记失败不阻断 | 2 阻断 | fail-open：非 2 不阻断，但每次运行写 `hooks.run.completed`；`PreToolUse` 超时按失败放行到 TL-07 门（决定 s） |
| 阻断理由可见 | stderr → 模型 | stderr → 模型 | stderr → 模型 | stderr 写入拒绝结果 / 关闭原因，用户与模型都可见 |
| 停止续跑刹车 | 8 次连续上限 + `stop_hook_active` | `stop_hook_active` | `steer()` 数据决定 | 三者都要：计数上限 + `stop_hook_active` + Run 预算（决定 q） |
| 超时 | 600 s 缺省 | 配置 | — | 配置；超时按 fail-open 记失败 |

## 输入与输出字段

| 上游公共输入 | 这里给出的 | 说明 |
|---|---|---|
| `session_id` | SessionRef | 直接 |
| `transcript_path` | 省略（决定 t） | 兼容说明列明；需要时另开只读导出 |
| `cwd` | 执行环境目标（PF-012）或省略 | 宿主工作目录不是 Session 属性 |
| `hook_event_name` | 上游名 | 直接 |
| `prompt_id` / `turn_id` | `prompt_id = StepRef`，另给 `run_id = RunRef` | 映射表随字段文档 |
| `permission_mode` | AU 当前确认模式摘要 | 词表映射表 |
| `agent_id` / `agent_type` | 子 Session 的 AgentRef 与定义 | 派发时 |
| `model` | Run 固定的模型选择 | 直接 |
| `stop_hook_active` | 见刹车 | — |
| 输出 `continue` / `stopReason` / `suppressOutput` / `systemMessage` | `systemMessage` → 用户可见通知；其余只记录 | — |
| 输出 `decision` / `hookSpecificOutput.*` | 按映射表逐事件 | 未兑现的字段回报 `unsupported` |

## Stop 续跑的刹车

| 内容 | 规则 |
|---|---|
| 触发 | Run 完成提交后 `Stop` hook 返回 `decision: block + reason` |
| 入队 | `omneSession.accept{source: hook_continuation, originWork: 该 Run, payload: reason}` → 意图 queue → trigger 项 → 下一 Run |
| 计数 | Session 保存"连续 hook_continuation Run 数" `n`：由 `hook_continuation` 触发的 Run 使 `n + 1`，其它来源触发的 Run 使 `n = 0`；归档不清零、恢复后保留 |
| `stop_hook_active` | 当前 Run 由 `hook_continuation` 触发时为 true（与上游"本次是续跑"一致） |
| 上限 | `n ≥ cap`（缺省 8，租户可配）时不再入队，写 `hooks.run.completed{status: brake, n, cap}`，理由用户可见 |
| Run 预算 | 每个续跑 Run 都受自己的执行预算，刹车不替代预算 |
| 与用户输入的关系 | 队列里已有用户项时，trigger 按 acceptedOrder 排在其后；用户 interrupt / cancel 关闭该 trigger 项（[SE-04](../../../spec/capabilities/session/v1/contract.md) closed） |

## 观察事件

| 事件 | 内容 |
|---|---|
| `hooks.run.started{runId, event, handler, site, subject}` | 每次运行一条；`subject` = 关联对象（StepRef / CallRef / RunRef） |
| `hooks.run.completed{runId, status: ok \| blocked \| failed \| timeout \| unavailable \| brake, exitCode, durationMs, entries[]}` | 每次运行恰一条；`entries` 列出每个输出字段的处置 `honored \| degraded \| unsupported` |
| `hooks.config.unsupported{asset, event, field}` | 装配时发现不支持的事件或字段 |
| `hooks.config.rejected{asset, reason}` | 来源、租户策略或资格不满足 |

全部经 records 写入（SYS-OBSERVABILITY），hook 进程本身没有 records 写权。

## 场景

| 编号 | 场景 | 期望 |
|---|---|---|
| HS-01 | `PreToolUse` 返回 deny | 调用 `denied_before_execution{reason: stderr}`；`updatedInput` 记 unsupported；参数不变 |
| HS-02 | `PreToolUse` 返回 allow 而 AU 为 ask | 仍走 HD 请求；hook 决定记 degraded |
| HS-03 | `PostToolUse` block | 结果照常结算、用户可见；投影占位 `blocked_by_hook` |
| HS-04 | `UserPromptSubmit` block | 项与 arrival `closed_by_guard`，用户看到原因；后续项不受影响 |
| HS-05 | hook 超时 / 崩溃 / 非法 JSON | `hooks.run.completed{failed \| timeout}`；不阻断；`PreToolUse` 放行到门 |
| HS-06 | `Stop` 连续续跑到上限 | 第 cap 次 `stop_hook_active = true`；到上限写 brake，Run 正常结算，不再入队 |
| HS-07 | 跨租户或工作目录 settings 里的 hook | 不装载；`hooks.config.rejected` |
| HS-08 | 插件卸载时 hook 进程进行中 | abort 并 drain；已生效的关闭 / 拒绝 / trigger 不撤销 |
