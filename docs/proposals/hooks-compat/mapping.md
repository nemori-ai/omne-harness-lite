# 事件映射、机制对照、刹车与装配

[提案索引](README.md) · [需求覆盖](requirements.md) · [评审处置](review.md) · [六系统研究 §4.4 站点](../../research/agent-loop-events-and-hooks/README.md#44-按站点看六家的挂点)

依据：[Claude Code 笔记](../../research/agent-loop-events-and-hooks/notes/claude-code.md)
（Claude Agent SDK `0.3.270`，事件目录 D1:L864 共 33 个）、[Codex 笔记](../../research/agent-loop-events-and-hooks/notes/codex.md)
（`d77ebc7`）、[DSH 笔记](../../research/agent-loop-events-and-hooks/notes/dsh.md)（`c291e79`）。
上游事件名与字段以这些快照为准；上游演化后按 HK-2 重新对照。每个事件、决定字段、输入
字段与配置字段在本文件恰有一种状态：**兑现**（效果与上游一致）、**降级**（字段被识别，
效果换成本系统允许的最近效果并具名记录）、**不支持**（无对应物，整体忽略并记录）。

## 站点与权力

| 站点 | 循环位置 | 扩展点的权力（[RD-17](../../../spec/capabilities/run-driver/v2/contract.md) / [TL-13](../../../spec/capabilities/tools/v1/contract.md)） | 兼容层登记的 API |
|---|---|---|---|
| S0 | 驱动器准备首个 Step（[RD-06](../../../spec/capabilities/run-driver/v2/contract.md) 短提交之外的准备阶段） | 装配可改写 prompt section，不可阻断 | 同步 prompt section 贡献者（[MC-07](../../../spec/capabilities/model-execution/v1/contract.md)，scope = run）；hook 在准备阶段运行，超时即无贡献 |
| S1 | 输入受理后、取用前 | 受理后守卫：只关闭项（RD-17 缺口，随闭环发版） | `omneSession.registerArrivalGuard` → `{close: reason} \| pass`，协议见[S1 守卫协议](#s1-守卫协议) |
| S2 | 装配 | 改写 prompt section 与 skill 贡献 | 不登记（上游无对应事件） |
| S3 | 模型请求 | 不开放改写；模型切换只在下一 Run 生效 | 首版不登记 |
| S5 | 工具准入 | TL-07 门的 AU 求值之后、准入 check 之前的守卫，门外 prepare 阶段求值，只能收紧；参数不可改 | `omneTools.registerGuard` → `{tighten: deny \| ask, reason, context?} \| pass`（与 [tool-execution/cordis.md](../tool-execution/cordis.md#hooks-兼容层在工具站点的落点) 一致） |
| S7 | 工具结果进入投影 | 只选择进入模型的投影，不改耐久结果 | `omneTools.registerProjectionSelector` → `{exclude: reason} \| {context?}`；在结算 arrival 被裁决后、结果进入任一 Step 投影前求值一次 |
| S8 | Run 完成条件成立 | 无"阻止停止"hook | `records.envelope.committed` 上 `run.lifecycle.changed{completed}` 的观察者 + `omneSession.accept{source: hook_continuation}` |
| S9 | Session 归档 / 删除 | 观察 | `session.lifecycle.changed{archived \| deleted}` 的观察者；实例 dispose 不是耐久事实，不映射 |
| 旁路 A | 压缩辅助 Step（[RD-07](../../../spec/capabilities/run-driver/v2/contract.md)） | 辅助 Step 输入贡献；观察 | Pre：辅助 Step 准备阶段的同步输入贡献者；Post：观察者，`additionalContext` 进下一 Step |
| 旁路 B | Run 控制提交后 | 观察 | 观察者 |
| 旁路 C | 派发调用与子 Run 结算 | 同 S5 / S8 | 首版不支持，随 PF-004 |

观察者消费 `records.envelope.committed`（[LC](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)
提交后反应），在提交之外运行，不能延迟或撤销提交，也不能把上下文送进已经发出的请求；
同步贡献者只存在于 RD-06 / RD-07 的准备阶段，受 hook 超时约束，超时即无贡献且记录。

## S1 守卫协议

| 项 | 规则 |
|---|---|
| 适用项 | 来源为用户的 `text` 队列项（[SE-04](../../../spec/capabilities/session/v1/contract.md)）；command 与 trigger 项不适用（上游只对 prompt） |
| 求值时点 | 调度者在 `takeBatch` 短提交之外的准备阶段，对队首候选项逐项求值；守卫不改变受理，受理仍按 [SE-12](../../../spec/capabilities/session/v1/contract.md) 立即成功 |
| pass | 该项进入 take 的候选集合，无耐久痕迹 |
| close | 同一 take 门内把该项 `queue.item.closed{closed_by_guard, reason}` 与其 arrival `inbound.arrival.closed{closed_by_guard}` 一起提交，然后继续下一队首；不新增队列项状态 |
| 超时 / 崩溃 / 非法输出 | 视为 pass（fail-open，决定 s），写 `hooks.run.completed{failed \| timeout}`；崩溃后未求值的项在下一次 take 前重新求值，求值本身幂等 |
| interrupt_then_run 项 | [SE-08](../../../spec/capabilities/session/v1/contract.md) 在受理点封闭旧驱动；为免白白中断，这类项在受理准备阶段先求值守卫（受同一超时约束），close 则受理后立即关闭、不发出中断；决定 U5 的另一形状（全部受理前求值）待用户 |
| 可见性 | 关闭原因对用户可见；`additionalContext` 进该批首个 Step 的 `system_reminder{hook_context}`（[占位与迟到结果](../tool-execution/lifecycle.md#占位与迟到结果的投影)） |

## 事件映射：两家共有

| 上游事件（CC = Claude Code，CX = Codex） | 站点 | 落点 | 兑现 | 降级 | 不支持 |
|---|---|---|---|---|---|
| `SessionStart{source}` | S0 | 每个 Run 的首个 Step 准备阶段：新 Run = `startup`；Yield / 崩溃后重取 = `resume`；压缩辅助 Step 后的首个 Step = `compact` | `additionalContext` → 本 Run 首个 Step 的 prompt section；退出码 0 的纯文本 stdout 同 | `source: clear \| fork` 不会出现（无对应操作） | 退出码 2 阻止启动（决定 o）；`initialUserMessage`、`sessionTitle`、`watchPaths`、`reloadSkills`；输入 `session_title`、`context_tokens`、`prompt_cache_likely_expired`、`estimated_cache_write_usd` |
| `UserPromptSubmit{prompt}` | S1 | 受理后、取用前 | `decision: block` / 退出码 2 → 关闭该项（[S1 守卫协议](#s1-守卫协议)）；`additionalContext` / 纯文本 stdout → `system_reminder{hook_context}` | — | `suppressOriginalPrompt`、擦除或改写 prompt（耐久输入不改）；`sessionTitle`；输入 `session_title` |
| `PreToolUse{tool_name, tool_input, tool_use_id}` | S5 | TL-07 门的 AU 求值之后 | `permissionDecision: deny \| ask`、CX `decision: block`（≡ deny）、退出码 2 → 收紧：deny → `denied_before_execution{reason: stderr \| permissionDecisionReason}`；ask → HD system_approval 请求，reason 写入请求内容；多 hook 取最严格；`additionalContext` → 下一 Step 的 `system_reminder{hook_context}` | `permissionDecision: allow` 在 AU 判 deny / ask 时无效（记 degraded） | `updatedInput`；CC `defer` |
| `PermissionRequest{tool_name, tool_input}` | S5 / HD | 工具门产生的 system_approval 请求创建后、呈现给人之前 | `decision.behavior: allow \| deny` → 程序化作答（[装配与信任](#装配与信任)：主体资格不足则记 degraded 并只观察）；deny 的 `message` → HD-07 reason | 只作用于工具门的 system_approval，不作用于 `human` 工具的 question / agent_approval（PF-005：只能由 owner 作答） | `updatedInput`、`updatedPermissions`、`interrupt` |
| `PostToolUse{tool_name, tool_input, tool_response}` / CC `PostToolUseFailure` | S7 | 结算 arrival 被裁决后、结果进入任一 Step 投影前（continuation / context / queue 列都触发，closed 不触发） | `additionalContext` → `system_reminder{hook_context}`；`decision: block` / 退出码 2 → 结果不进投影，以 `blocked_by_hook{reason}` 占位；终态到事件的对应见[终态与事件](#终态与事件) | — | CC `updatedToolOutput`；CX "结果替换为错误文本"；`continue: false`（只记录） |
| `Stop{stop_hook_active, last_assistant_message}` | S8 | `run.lifecycle.changed{completed}` 提交后 | `decision: block + reason` → 入队 `hook_continuation` trigger，按 [SE-15](../../../spec/capabilities/session/v1/contract.md) 调度在队首合格时开新 Run；`stop_hook_active` 按[刹车](#stop-续跑的刹车)提供；`additionalContext` → 该新 Run 首个 Step 的 `system_reminder{hook_context}` | 续跑是新 Run 而非同 turn（可见差异） | 阻止 Run 结算；`continue: false`（只记录） |
| CC `StopFailure{error, error_details, last_assistant_message}` | S8 | `run.lifecycle.changed{failed}` 提交后 | 观察（上游也只允许副作用） | — | — |
| `SubagentStart` / `SubagentStop` | 旁路 C | 派发调用准入与子 Run 结算 | — | — | 首版不支持（随 PF-004）；配置里出现时记 `hooks.config.unsupported` |
| `PreCompact{trigger, custom_instructions}` / `PostCompact{compact_summary}` | 旁路 A | RD-07 辅助 Step 前后 | `custom_instructions` → 辅助 Step 输入贡献；`PostCompact.additionalContext` → 下一 Step 的 `system_reminder{hook_context}` | — | CX 的阻断（决定 r） |
| `SessionEnd{reason}` | S9 | `session.lifecycle.changed{archived \| deleted}` 提交后 | 观察；`reason` 映射 `archived \| deleted` | 实例 dispose 不触发（上游无对应） | — |

## 事件映射：只有一家有

| 上游事件 | 状态 |
|---|---|
| CX `Interrupt` | 兑现为旁路 B 观察：Run 控制 interrupt 提交后运行，`systemMessage` → 用户可见通知 |
| CC `PostToolBatch` | 首版不支持（不是单调用投影点；Step 级贡献另开） |
| CC `PreModelSwitch` / `PostModelSwitch` | 首版不支持（候选：Pre 作 [MC-08](../../../spec/capabilities/model-execution/v1/contract.md) 的收紧守卫） |
| CC `PermissionDenied{retry}` | 首版不支持 |
| CC `UserPromptExpansion` | 首版不支持（[IN-01](../../../spec/capabilities/command-input/v1/contract.md) 在受理时解析，没有可单独关闭的"展开项"） |
| CC `Notification`、`MessageDisplay`、`ConfigChange`、`InstructionsLoaded`、`CwdChanged`、`FileChanged`、`DirectoryAdded`、`WorktreeCreate/Remove`、`Elicitation/Result`、`Setup`、`TeammateIdle`、`TaskCreated/Completed` | 不支持：无对应概念或属客户端 / 环境层 |

不支持的事件出现在配置里时写 `hooks.config.unsupported{asset, event}`，其余 hook 照常装配。

## 终态与事件

| TL-07 终态 | 触发的上游事件 | 输入 |
|---|---|---|
| succeeded | `PostToolUse` | `tool_response` = 结果投影 |
| failed | CC `PostToolUseFailure`；CX `PostToolUse` | `error` |
| interrupted | CC `PostToolUseFailure{is_interrupt: true}` | — |
| unknown | CC `PostToolUseFailure{error: unknown}`；CX `PostToolUse` | 标明未知 |
| denied_before_execution（AU 或 hook） | 无（上游 `PermissionDenied` 首版不支持） | — |
| cancelled_before_execution、unavailable | 无 | — |

`PreToolUse` 在 TL-07 门之后运行：门判 deny 的调用不触发它（可见差异）；门判 ask 时守卫先于
HD 请求创建求值，守卫 deny 则不创建请求。守卫只在 `adjudicateCall` 求值一次，HD-06 消费批准
时不再运行。

## 可见差异

| 差异 | 说明 |
|---|---|
| `SessionStart{startup}` 按 Run 触发 | 一次用户输入就是一个 Run；连续续跑 8 次即触发 9 次 |
| `resume` 的含义 | 对应 Yield / 崩溃后重取，不是用户"恢复会话" |
| `PreToolUse` 在门之后 | 上游在权限判定前触发 |
| `UserPromptSubmit` 在受理之后 | 输入已耐久且用户可见，关闭以 `closed_by_guard` 呈现，不擦除 |
| `Stop` 续跑是新 Run | 历史里可见 Run 边界；`last_assistant_message` 取自已完成 Run 的最后一条助手消息 |
| S0 / 旁路 A 的上下文受超时约束 | 超时即无贡献，不延迟到下一 Step |

## 配置字段

| 字段 | 来源 | 状态 |
|---|---|---|
| `matcher` | CC / CX | 兑现：按事件的匹配键（tool_name、source、trigger）过滤 |
| `type: command`、`command`、`args` | CC / CX | 兑现（决定 u） |
| `type: http \| mcp_tool \| prompt \| agent` | CC / CX | 不支持（各随依赖能力） |
| `timeout` | CC / CX | 兑现：秒；缺省 600，租户可配上限 |
| `async` | CC / CX | 兑现：只能观察与注入下一 Step 上下文，不能阻断 |
| `asyncRewake` | CC | 降级：exit 2 时 stderr / stdout 作为下一 Step 的 `system_reminder{hook_context}`，不"唤醒" |
| `shell: bash \| powershell` | CC | 兑现 `bash`；`powershell` 不支持 |
| `statusMessage` | CC / CX | 兑现：用户可见通知 |
| `if`（权限规则语法过滤） | CC | 降级：只支持 `Tool(prefix*)` 形式，其余记 unsupported 并按无过滤处理 |
| `once` | CC（Skill frontmatter） | 不支持（Skill frontmatter hooks 首版不支持） |
| Subagent frontmatter `hooks` | CC | 不支持（PF-004） |
| `hook_key`、`[hooks.state.<key>] { enabled, trusted_hash }` | CX | 降级：启用与信任由租户资产的选用 / 启用与版本表达（[装配与信任](#装配与信任)），`trusted_hash` 与资产版本哈希对照 |
| `commandWindows` | CX | 不支持 |
| `additionalContextLimit` | CX | 兑现：截断并记录 |

## 机制对照

| 维度 | Claude Code | Codex | DSH 兼容层 | 本提案 |
|---|---|---|---|---|
| handler 类型 | command / http / mcp_tool / prompt / agent | command / mcp_tool | command | command（决定 u） |
| 适配器数量 | — | — | 两个插件 | 一个适配器（站点翻译、决定合并、命令运行）加两个配置装载器（CC 的 settings 形状、CX 的 `hooks.json` / `config.toml [hooks]`）；两家输入输出 JSON 几乎同形，第二个变化点只在配置形状 |
| 配置来源 | user / project / local / managed / plugin / skill 与 subagent frontmatter / SDK | managed / user / project / plugin | 插件配置 | hooks 是 Plugin 的声明性成员（[PF-010](../../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md)）：随资产版本、租户选用与 TG 资格发现；不读工作目录的任意 settings 文件 |
| 信任 | managed 层可禁其余 | `hook_key` + `trusted_hash`；Managed / Untrusted / Trusted / Modified | — | [装配与信任](#装配与信任) |
| 执行顺序 | 同事件并行 | 串行 | 串行 | 串行、按声明顺序；决定合并取最严格；`additionalContext` 全部保留按序拼接 |
| async | `async: true` 不等待 | async 不施加控制效果 | — | 同 Codex |
| 命令级失败 | 退出码 2 阻断；其余不阻断；超时不阻断 | 2 阻断；其余记失败不阻断 | 2 阻断 | fail-open：非 2 不阻断，每次运行写 `hooks.run.completed`；`PreToolUse` 超时按失败放行到 TL-07 门（决定 s） |
| 守卫提供者不可用 | — | — | — | 不是 fail-open：扩展点登记失败时插件不进入 ready（`hooks.config.rejected{reason: guard_unavailable}`），动态撤除先封闭准入（[AR-16](../../../spec/capabilities/live-agent/v1/contract.md)）；TL-13"守卫缺失不能默认许可" |
| 阻断理由可见 | stderr → 模型 | stderr → 模型 | stderr → 模型 | stderr 写入拒绝结果 / 关闭原因，用户与模型都可见 |
| 停止续跑刹车 | 8 次连续上限 + `stop_hook_active` | `stop_hook_active` | `steer()` | 计数上限 + `stop_hook_active` + Run 预算（决定 q） |

## 输入与输出字段

| 上游公共输入 | 这里给出的 | 状态 |
|---|---|---|
| `session_id` | SessionRef | 兑现 |
| `transcript_path`、`agent_transcript_path` | 省略（决定 t） | 不支持，兼容说明列明 |
| `cwd` | 执行环境目标（PF-012）或省略 | 降级 |
| `hook_event_name` | 上游名 | 兑现 |
| `prompt_id` / `turn_id` | `prompt_id = StepRef`，`turn_id = RunRef` | 兑现 |
| `permission_mode` | [AU-04](../../../spec/capabilities/action-authorization/v1/contract.md) 三值映射：`standard → default`、`confirm → default`（hook 无法区分 confirm 与 standard，记降级）、`unattended → dontAsk`；`acceptEdits`、`plan`、`bypassPermissions` 不会出现 | 降级 |
| `agent_id` / `agent_type` | — | 不支持（PF-004） |
| `model` | Run 固定的模型选择 | 兑现 |
| `stop_hook_active` | 见[刹车](#stop-续跑的刹车) | 兑现 |
| `effort` | — | 不支持 |
| 输出 `systemMessage` | 用户可见通知 | 兑现 |
| 输出 `continue` / `stopReason` / `suppressOutput` / `terminalSequence` | 只记录 | 不支持 |
| 输出 `decision` / `hookSpecificOutput.*` | 按事件表 | 逐字段 |

## Stop 续跑的刹车

| 内容 | 规则 |
|---|---|
| 触发 | `run.lifecycle.changed{completed}` 提交后运行 `Stop` hook，返回 `decision: block + reason` |
| 入队 | `omneSession.accept{source: hook_continuation, dedupKey: (RunRef, handler), originWork: 该 Run, payload: reason}`；观察者重跑（LC-06 幂等）因同键不产生第二项 |
| 意图路由 | SE-14 新增一行：`hook_continuation` 为内部来源，意图 queue；originWork 已终态 → C 列 queue；Session 已归档 → `closed(closed_by_archive)`；不受 SE-16 容量拒绝，有界性由刹车与去重键给出（决定 U3） |
| 取用 | [SE-06](../../../spec/capabilities/session/v1/contract.md) `takeTrigger` 时重查来源权威：hook 资产仍启用、装配者成员关系仍有效、Session open；任一失败 → 项 `closed(source_invalid)` |
| 计数 | `n` = 连续由 `hook_continuation` 触发的 Run 数，按 [SE-10](../../../spec/capabilities/session/v1/contract.md) 注册为 projection（对 Run 启动事实的确定性 fold）：hook 触发 → `n + 1`，其它来源触发 → `n = 0`；归档不清零、恢复后由 fold 重建 |
| `stop_hook_active` | 当前 Run 由 `hook_continuation` 触发时为 true |
| 上限 | `n ≥ cap`（缺省 8，租户可配）时不再入队，写 `hooks.run.completed{status: brake, n, cap}` 并向用户通知；Run 预算对每个续跑 Run 独立生效 |
| 与用户输入的关系 | 排队中的 trigger 项按 acceptedOrder 排在已有用户项之后；用户对排队项的撤回沿 [SE-04](../../../spec/capabilities/session/v1/contract.md) withdraw；已取用的续跑 Run 由 [RN-03](../../../spec/capabilities/run/v1/contract.md) 控制 |

## 观察事件

| 事件 | 耐久性 | 内容 |
|---|---|---|
| `hooks.run.completed{runId, event, handler, site, subject, status: ok \| blocked \| failed \| timeout \| unavailable \| brake, exitCode, durationMs, entries[]}` | 耐久（[OB-02](../../../spec/capabilities/engineering-observation/v1/contract.md) 关键审计，随所属提交或 outbox） | 每次运行恰一条；`entries` 列出每个输出字段的处置 `honored \| degraded \| unsupported` |
| `hooks.run.started{runId, event, handler, site, subject}` | 非耐久工程观测（OB-02 非关键诊断） | 诊断卡住的守卫 |
| `hooks.config.unsupported{asset, event, field}` | 耐久 | 装配时发现不支持的事件或字段 |
| `hooks.config.rejected{asset, reason: execution_boundary_required \| guard_unavailable \| source_untrusted \| assembler_inactive}` | 耐久 | 来源、租户策略、执行边界或扩展点不满足 |

全部经 records 写入；适配器不向 hook 进程提供任何 records 写入接口或服务句柄。

## 装配与信任

| 项 | 规则 |
|---|---|
| 装配者 | 该 hook 资产在本租户的选用 / 启用操作（[TG-05](../../../spec/capabilities/tenant-governance/v1/contract.md)）记录的 membership revision；个人租户为 owner，组织租户为执行该操作的管理员 |
| 每次触发前重验 | 装配者成员关系仍 active、资产仍 enabled、Session 属同一租户；任一失败 → 跳过并写 `hooks.config.rejected{assembler_inactive}`（PF-010.C5：撤权影响下一道准入） |
| 命令 hook 的执行边界 | 命令进程在 [live-agent v1](../../../spec/capabilities/live-agent/v1/contract.md) 执行信任前提下运行：没有 PF-012 沙盒映射时，只有部署策略授予宿主级执行信任的装配者类别可装载 command handler，否则 `hooks.config.rejected{execution_boundary_required}`；哪些类别可信是政策（决定 U1，作者建议：受管 hook 与个人租户 owner 装配的 hook 可载，组织普通成员装配的拒绝，待用户） |
| 进程环境 | 白名单环境变量（不含供应方凭据与 records 路径）、显式 cwd（执行环境目标或每次运行的临时目录）、数据只经 stdin、无服务句柄；"适配器不提供写入接口"只在 API 层成立，文件级隔离取决于部署执行边界 |
| 受管限制 | "只允许受管 hook"由租户资产策略表达；`allowManagedHooksOnly` 与 Codex `Managed` 映射到它 |
| Skill / Subagent frontmatter hooks | 首版不支持 |
| 程序化作答（`PermissionRequest`） | 实际 actor = hooks-compat 受信提供者，on-behalf-of = 装配者的当前 membership；提交时重验该 membership 有效、仍拥有该资产选用关系、且是 [HD-01](../../../spec/capabilities/human-decisions/v1/contract.md) 该 kind 的合法作答者，审计可辨程序化来源（HD-05 措辞补充）；Session 确认模式为 `confirm` 或组织策略要求人工确认时 hook 的 allow 无效（决定 U2，作者建议，待用户） |

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
| HS-09 | `Stop` 观察者在入队后崩溃重跑 | 同 `(RunRef, handler)` 去重，不出现第二个 trigger；计数不变 |
| HS-10 | `omneTools` 守卫登记不可用 | 插件不进入 ready，`hooks.config.rejected{guard_unavailable}`；不出现无守卫放行 |
| HS-11 | interrupt_then_run 输入被守卫关闭 | 受理准备阶段求值 → 受理后立即关闭，不发出中断，旧 Run 继续 |
| HS-12 | 组织普通成员装配含 command hook 的 Plugin，部署无沙盒映射 | `hooks.config.rejected{execution_boundary_required}`，其余 hook 照常 |
