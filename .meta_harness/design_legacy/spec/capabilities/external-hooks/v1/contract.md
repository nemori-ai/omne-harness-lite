# 外部命令式 Hooks 兼容 v1

坐标为 `(omne-harness-lite-design-2026-09-15, capability.external-hooks, 1)`，状态为 candidate、
`acceptance:null`。HK-01～HK-22 从 legacy current 同名 v1 重基；D-015 与旧用户裁决只作来源，
不自动接受本坐标。内部 extension sites 是权威；本能力只是有限权力 adapter，不拥有 Run、
工具、决策、事实、transport 或 sandbox。

首版只映射 command handler。HTTP、MCP tool、prompt、agent handler，PF-004 child stream 和
artifact owner 均在范围外。精确依赖坐标与条款见本轮 catalog delta。正文直接消费 CD、lifecycle、Session、Run、RunDriver、Tools、HD、MC、TG、live-agent，并显式消费 CC-02、AU-04/AU-06、BG-03、IN-01 与 OB-02；这些依赖不使 adapter 成为其状态 owner。

## 定义与原则

**HK-01**：外部命令式 hooks 兼容层是 Agent Loop 进程内扩展点的一个消费者。进程内扩展点
是权威，命令式 hook 是它的一个适配器：适配器把上游事件翻译成扩展点调用、把扩展点的输入
翻译成上游约定的 stdin JSON、把 hook 的 stdout/退出码翻译成扩展点允许的返回值，除此之外
不产生状态或控制效果。`systemMessage`、`statusMessage` 与用户通知不是第七种控制权：它们作为
`hooks.run.completed` 的 `presentationEntries[]` 保存，由工程观测/消息投影按当前读权呈现，
不能直接写客户端通道、改业务状态或绕开审计。适配器不拥有 Session、Run、Step、调用、请求或队列的状态权威，不建立第二套
事件机制，也不获得已有能力之外的任何读写面。上游事件名、退出码约定与配置文件位置是
兼容输入，不因被本契约引用而成为本系统的内部机制。

**HK-02**（权力上界）：兼容层的任何效果只能是以下六种之一：关闭队列项（HK-07）、收紧
工具门为 deny 或 ask（HK-09 的 S5 行）、排除工具结果进入模型的投影（HK-09 的 S7 行）、
注入下一 Step 的 `system_reminder{hook_context}`、入队 `hook_continuation` trigger（HK-16）、
有资格的程序化作答（HK-20）。不存在改写已耐久的输入、工具参数或工具结果的路径，也不
存在阻止 Run 结算的路径。上游允许而本系统扩展点不允许的效果一律按降级或不支持处理，
兼容不扩大 RD-17 与 TL-13
给出的扩展点权力。六类只枚举状态/控制效果；`systemMessage`、`statusMessage`、brake 与其它用户通知必须先进入 HK-17 的 `presentationEntries[]`，再由有权投影呈现，不是第七种效果。

**HK-03**（逐项可查）：上游两家的每个事件、每个决定字段、每个输入字段与每个配置字段在
本契约的映射表中恰有一种状态：**兑现**（效果与上游一致）、**降级**（字段被识别，效果换成
本系统允许的最近效果并具名记录）、**不支持**（本系统无对应物，整体忽略并记录）。装配时
发现不支持的事件或字段写 `hooks.config.unsupported`，运行时对每个输出字段的处置写入
`hooks.run.completed` 的 `fieldEntries[]`（HK-17）；任一情形都不静默忽略。上游目录演化后按本条
重新对照，未对照过的新事件按不支持处理。

## 站点与扩展点

**HK-04**：站点是 Agent Loop 上可被扩展的位置；本版登记的是 RD-19 封闭枚举中的 S0～S9 与
旁路 A/B/C（旁路 D 没有对应的上游命令式事件），编号沿六系统循环研究的循环图。站点标签、每个站点承载的扩展点种类与权力上界的权威是
RD-19，本条不另定义站点；下表是本版登记的全部站点、各站点上
扩展点允许的权力与兼容层在该站点承担的对接义务，权力列是 RD-19 的投影，与之不一致时以 RD-19
为准；表中没有的位置本版不登记任何扩展点。

| 站点 | 循环位置 | 该站点上扩展点的权力 | 兼容层登记的对接义务 |
|---|---|---|---|
| S0 | 驱动器准备本 Run 首个 Step（RD-06 短提交之外的准备阶段） | 装配可改写 prompt section 与 skill 贡献，不可阻断（RD-17） | 准备阶段的同步 prompt section 贡献者（MC-07，作用域为 Run）；超时即无贡献 |
| S1 | 输入受理后、取用前 | 到达守卫只能关闭队列项，不能改写受理事实（SE-04、RD-17） | 返回 `{decision: close, reason, additionalContext?}` 或 `{decision: pass, additionalContext?}`，协议见 HK-07 |
| S2 | 上下文装配 | 改写 prompt section 与 skill 贡献 | 本版不登记：上游两家在该站点没有命令式事件 |
| S3 | 发出模型请求 | 不开放改写，模型由 Run 固定（RD-17） | 本版不登记 |
| S4 | 模型流式响应 | 观察 | 本版不登记：上游对应事件属客户端显示层（HK-10） |
| S5 | 工具准入 | TL-07 门的授权求值之后、准入提交之前的执行守卫，只能收紧为 deny 或 ask，参数不可改（TL-13） | 站点 `pre_execute` 的执行守卫提供者，返回 `{tighten: deny \| ask, reason, context?}` 或 `pass` |
| S6 | 工具执行 | 执行由工具的执行 owner 拥有（TL-08） | 本版不登记 |
| S7 | 工具结果进入模型投影 | 只能选择进入模型的投影，不改耐久结果（TL-12、RD-17） | 站点 `post_execute` 的投影选择器提供者，返回 `{exclude: reason}` 或 `{context?}` |
| S8 | Run 完成条件成立 | 观察；没有"阻止停止"的扩展点（RN-02、RD-17） | `records.envelope.committed` 上 `run.state.changed{completed \| failed}` 的观察者；续跑经队列入 trigger |
| S9 | Session 归档或删除 | 观察 | `records.envelope.committed` 上 `session.lifecycle.changed{archived \| deleted}` 的观察者 |
| 旁路 A | 压缩辅助 Step（RD-07） | 辅助 Step 输入贡献；观察 | 前：辅助 Step 准备阶段的同步输入贡献者；后：观察者，附加上下文进下一 Step |
| 旁路 B | Run 控制提交后 | 观察 | `records.envelope.committed` 上 `run.control.progressed` 的观察者 |
| 旁路 C | 派发调用与子 Run 结算 | 同 S5 / S8 | 本版不登记（HK-22） |

旁路 D（持久化与恢复）贯穿全部站点，没有对应的上游命令式事件；恢复后重取在 S0 上表现为
`SessionStart{source: resume}`，不另立站点。

**HK-05**：兼容层在站点上只有两类义务，二者的失败语义不同。

- **准备阶段的同步贡献者**（S0、旁路 A 前）只存在于 RD-06
  与 RD-07 短提交之外的准备阶段，受 hook 超时约束；超时、崩溃或非法输出即该次无贡献并
  记录，不延迟提交，也不把贡献顺延到下一 Step。
- **提交后的观察者**（S8、S9、旁路 B）消费 LC-06
  在 envelope 提交返回后广播一次的 `records.envelope.committed`。观察者在提交之外运行，
  不能延迟或撤销该提交，不能把上下文送进已经发出的模型请求，并承担 LC-06 的反应者义务：
  幂等、动手前在自己的门里重读权威状态、容纳自身异常。

守卫与投影选择器是准入路径的一部分，不适用 fail-open：任一扩展点登记失败或动态不可用时，
兼容层不进入 ready 并写 `hooks.config.rejected{guard_unavailable}`；不存在"守卫缺失即默认
许可"的状态（TL-13）。命令进程自身的失败按 HK-15 处理，与本条不同。

**HK-06**（装载效应与撤除责任）：兼容层装载建立三类效应——站点上的扩展点登记、hook 资产
索引、进行中的 hook 进程。撤除按顺序完成：先按 AR-16 封闭
新的准入，再撤销站点登记，再中止进行中的 hook 进程并排空其待写记录，最后撤除资产索引。
已经生效的效果不因撤除而回滚：已关闭的队列项保持关闭，已收紧的门判定保持有效，已入队的
trigger 项保持排队，`hooks.run.completed` 与 `hooks.config.*` 记录保留。撤除不改写任何已提交
事实，也不替代 TG-05 对资产选用关系的管理操作。

## 输入站点的守卫

**HK-07**（S1 受理后守卫协议）：守卫在输入已受理之后、被取用之前求值，只能关闭队列项，
不改变受理本身。

| 项 | 规则 |
|---|---|
| 适用项 | 来源为用户的 `text` 队列项（SE-04）。command 项与 trigger 项不适用 |
| 求值时点与求值者 | 取用者在 `takeBatch` 短提交之外的准备阶段，对队首候选项逐项求值：开新 Run 时求值者是调度者；既有 Run 在 `waiting` 的空闲点取入排队文本时（SE-06 的 `queue.items.taken{into: run}`）求值者是驱动器，在同一准备阶段按同一协议求值 |
| 对受理的影响 | 无。受理仍按 SE-12 立即成功，输入已耐久且对用户可见 |
| 返回形状与合并 | 每个 handler 恰返回 `{decision: pass, additionalContext?}` 或 `{decision: close, reason, additionalContext?}`；按声明顺序串行，任一 close 则最终 close，reason 取首个 close，全部 additionalContext 依顺序聚合 |
| pass | 该项进入本次 take 的候选集合；有 additionalContext 时随实际 take 的首个 Step 以 `system_reminder{hook_context}` 耐久，不单独改写输入 |
| close | 在同一 take 门内把该项 `queue.item.closed{closed_by_guard, reason}`、arrival close 与 hook completion 的 `fieldEntries[]`/`presentationEntries[]` 一起提交；该项的 additionalContext 只留在 completion 审计，不进入任何 Step |
| 超时、崩溃或非法输出 | 视为 pass，写 `hooks.run.completed{failed \| timeout}`；崩溃后未求值的项在下一次 take 前重新求值，求值本身幂等 |
| interrupt_then_run 项 | SE-08 在受理点封闭旧驱动。为免旧 Run 被白白中断，这类项在受理的准备阶段先求值守卫（受同一超时约束）；close 则受理后立即关闭该项并不发出中断，旧 Run 继续。受理提交本身不被守卫阻塞 |
| 可见性 | 关闭原因对用户可见；仅最终 pass 且实际 take 的项，其附加上下文进入该批首个 Step 的 `system_reminder{hook_context}`（CD v1）；最终 close 的上下文只在 completion 审计中保留 |

## 事件映射

**HK-08**：本节的映射表是 PF-025.C1
兼容承诺的规范正文。上游事件全集与字段以固定快照为准：Claude Code 取 Claude Agent SDK
`0.3.270` 的事件目录（33 个事件），Codex 取 `d77ebc7`，DSH 兼容插件的行为取 `c291e79`。
这三个快照的原始观察记录在六系统循环、事件与 hooks 研究，
它是事实来源，不构成本契约的规范依赖。表中"落点"是该事件在本系统触发的精确位置，
"兑现""降级""不支持"按 HK-03 的定义。上游快照之外出现的事件按不支持处理，不自动获得落点。

**HK-09**（两家共有的事件）：

| 上游事件（CC = Claude Code，CX = Codex） | 站点 | 落点 | 兑现 | 降级 | 不支持 |
|---|---|---|---|---|---|
| `SessionStart{source}` | S0 | 每个 Run 首个 Step 的准备阶段：新 Run 为 `startup`；Yield 或崩溃后重取为 `resume`；压缩辅助 Step 之后的首个 Step 为 `compact` | `additionalContext` 进本 Run 首个 Step 的 prompt section；退出码 0 的纯文本 stdout 同 | `source: clear \| fork` 不会出现（本系统无对应操作） | 退出码 2 阻止启动；`initialUserMessage`、`sessionTitle`、`watchPaths`、`reloadSkills`；输入 `session_title`、`context_tokens`、`prompt_cache_likely_expired`、`estimated_cache_write_usd` |
| `UserPromptSubmit{prompt}` | S1 | 受理后、取用前（HK-07） | `decision: block` 或退出码 2 关闭该项；`additionalContext` 或纯文本 stdout 进 `system_reminder{hook_context}` | — | `suppressOriginalPrompt` 与任何擦除或改写 prompt 的效果（耐久输入不改）；`sessionTitle`；输入 `session_title` |
| `PreToolUse{tool_name, tool_input, tool_use_id}` | S5 | TL-07 门的授权求值之后、准入提交之前 | `permissionDecision: deny \| ask`、CX `decision: block`（等同 deny）与退出码 2 收紧该次调用：deny 结算为 `denied_before_execution{reason: stderr \| permissionDecisionReason}`；ask 建立工具门的 system_approval 请求并把 reason 写入请求内容；多个 hook 取最严格；`additionalContext` 进下一 Step 的 `system_reminder{hook_context}` | `permissionDecision: allow` 在门已判 deny 或 ask 时无效，记 degraded | `updatedInput`；CC `defer` |
| `PermissionRequest{tool_name, tool_input}` | S5 / HD | 工具门产生的 system_approval 请求创建后、呈现给人之前 | `decision.behavior: allow \| deny` 作程序化作答（HK-20）；deny 的 `message` 进 HD-07 的拒绝原因 | 主体资格不足、Session 确认模式为 `confirm` 或组织策略要求人工确认时 allow 无效，记 degraded 并只观察；只作用于工具门的 system_approval，不作用于 `human` 工具的 question 与 agent_approval（HD-01 固定其合法作答者为 Session.owner） | `updatedInput`、`updatedPermissions`、`interrupt` |
| `PostToolUse{tool_name, tool_input, tool_response}` 与 CC `PostToolUseFailure` | S7 | 结算 arrival 被裁决之后、结果进入任一 Step 投影之前，每次调用求值一次（continuation、context、queue 三列都触发，closed 不触发） | `additionalContext` 进 `system_reminder{hook_context}`；`decision: block` 或退出码 2 使结果内容不进模型投影：该 tool_use 仍按 TL-19 恰得一个块，块的投影值换成 `blocked_by_hook{reason}`，耐久结果与历史呈现不变；终态与事件的对应见 HK-11 | — | CC `updatedToolOutput`；CX 的"结果替换为错误文本"；`continue: false`（只记录） |
| `Stop{stop_hook_active, last_assistant_message}` | S8 | `run.state.changed{completed}` 提交之后 | `decision: block` 加 reason 入队 `hook_continuation` trigger，按 SE-15 在队首合格时开新 Run；`stop_hook_active` 按 HK-16 提供；`additionalContext` 进该新 Run 首个 Step 的 `system_reminder{hook_context}` | 续跑是新 Run 而不是同一 turn 的延续（HK-12） | 阻止 Run 结算；`continue: false`（只记录） |
| CC `StopFailure{error, error_details, last_assistant_message}` | S8 | `run.state.changed{failed}` 提交之后 | 观察（上游同样只允许副作用） | — | — |
| `SubagentStart` / `SubagentStop` | 旁路 C | 派发调用准入与子 Run 结算 | — | — | 本版不支持；配置中出现时写 `hooks.config.unsupported` |
| `PreCompact{trigger, custom_instructions}` / `PostCompact{compact_summary}` | 旁路 A | RD-07 辅助 Step 前后 | `custom_instructions` 作辅助 Step 的输入贡献；`PostCompact.additionalContext` 进下一 Step 的 `system_reminder{hook_context}` | — | CX 的阻断（压缩不接受 hook 否决） |
| `SessionEnd{reason}` | S9 | `session.lifecycle.changed{archived \| deleted}` 提交之后 | 观察；`reason` 映射 `archived \| deleted` | 运行实例 dispose 不触发（上游无对应物） | — |

**HK-10**（只有一家有的事件）：

| 上游事件 | 状态 |
|---|---|
| CX `Interrupt` | 兑现为旁路 B 的观察：Run 控制 interrupt 提交后运行，`systemMessage` 作用户可见通知 |
| CC `PostToolBatch` | 不支持：不是单次调用的投影点 |
| CC `PreModelSwitch` / `PostModelSwitch` | 不支持：模型由 Run 固定（RD-17） |
| CC `PermissionDenied{retry}` | 不支持 |
| CC `UserPromptExpansion` | 不支持：IN-01 在受理时解析输入，没有可单独关闭的"展开项" |
| CC `Notification`、`MessageDisplay`、`ConfigChange`、`InstructionsLoaded`、`CwdChanged`、`FileChanged`、`DirectoryAdded`、`WorktreeCreate` / `WorktreeRemove`、`Elicitation` / `ElicitationResult`、`Setup`、`TeammateIdle`、`TaskCreated` / `TaskCompleted` | 不支持：本系统无对应概念，或属客户端与环境层 |

不支持的事件出现在配置中时写 `hooks.config.unsupported{asset, event}`，同一资产的其余 hook
照常装配。

**HK-11**（终态与事件）：调用结算的每个终态（TL-07）触发的上游
事件固定如下。

| 调用终态 | 触发的上游事件 | 给出的输入 |
|---|---|---|
| `succeeded` | `PostToolUse` | `tool_response` 为结果投影 |
| `failed` | CC `PostToolUseFailure`；CX `PostToolUse` | `error` |
| `interrupted` | CC `PostToolUseFailure{is_interrupt: true}` | — |
| `unknown` | CC `PostToolUseFailure{error: unknown}`；CX `PostToolUse` | 标明未知，不称成功或"肯定没执行" |
| `denied_before_execution`（授权判定或守卫收紧所致） | 无 | — |
| `cancelled_before_execution`、`unavailable` | 无 | — |

`PreToolUse` 在 TL-07 产生预备门结果后运行：门已判 deny 的调用不触发它；门判 ask 时守卫先于
system_approval 请求创建求值，守卫判 deny 则不创建该请求。守卫只在调用裁决处求值一次，
HD-06 消费批准时不再运行。

**HK-12**（可见差异）：以下差异是兼容的已知结果，必须出现在面向用户的兼容说明中。

| 差异 | 说明 |
|---|---|
| `SessionStart{startup}` 按 Run 触发 | 一次用户输入就是一个 Run；触发次数由 HK-16 同一固定 `cap` 限制，不在此硬编码 |
| `resume` 的含义 | 对应 Yield 或崩溃后重取，不是用户"恢复会话" |
| `PreToolUse` 在门之后 | 上游在权限判定之前触发 |
| `UserPromptSubmit` 在受理之后 | 输入已耐久且用户可见，关闭以 `closed_by_guard` 呈现，不擦除原文 |
| `Stop` 续跑是新 Run | 历史中可见 Run 边界；`last_assistant_message` 取自已完成 Run 的最后一条助手消息 |
| S0 与旁路 A 的上下文受超时约束 | 超时即该次无贡献，不顺延到下一 Step |

**HK-13**（配置字段）：

| 字段 | 来源 | 状态 |
|---|---|---|
| `matcher` | CC / CX | 兑现：按该事件的匹配键（`tool_name`、`source`、`trigger`）过滤 |
| `type: command`、`command`、`args` | CC / CX | 兑现 |
| `type: http \| mcp_tool \| prompt \| agent` | CC / CX | 不支持（HK-21） |
| `timeout` | CC / CX | 兑现：单位为秒，缺省 600，租户可配上限，有效阈值为两者较小值 |
| `async` | CC / CX | 兑现：只能观察与注入下一 Step 上下文，不能阻断 |
| `asyncRewake` | CC | 降级：退出码 2 时 stderr 与 stdout 作下一 Step 的 `system_reminder{hook_context}`，不"唤醒"当前 Step |
| `shell: bash \| powershell` | CC | 兑现 `bash`；`powershell` 不支持 |
| `statusMessage` | CC / CX | 兑现：写入 HK-17 `presentationEntries[]`，再由有权投影呈现 |
| `if`（权限规则语法过滤） | CC | 降级：只支持 `Tool(prefix*)` 形式，其余写 unsupported 并按无过滤处理 |
| `once` | CC（Skill frontmatter） | 不支持：Skill frontmatter hooks 本版不支持 |
| Subagent frontmatter `hooks` | CC | 不支持 |
| `hook_key`、`[hooks.state.<key>] { enabled, trusted_hash }` | CX | 降级：启用与信任由租户资产的选用、启用与版本表达（HK-18），`trusted_hash` 与资产版本哈希对照 |
| `commandWindows` | CX | 不支持 |
| `additionalContextLimit` | CX | 兑现：按上限截断并记录截断事实 |

**HK-14**（输入与输出字段）：

| 上游字段 | 本系统给出的 | 状态 |
|---|---|---|
| 输入 `session_id` | SessionRef | 兑现 |
| 输入 `transcript_path`、`agent_transcript_path` | 省略 | 不支持，兼容说明列明 |
| 输入 `cwd` | 执行环境目标或省略 | 降级 |
| 输入 `hook_event_name` | 上游事件名 | 兑现 |
| 输入 `prompt_id` / `turn_id` | `prompt_id` 为 StepRef，`turn_id` 为 RunRef | 兑现 |
| 输入 `permission_mode` | AU-04 三值映射：`standard → default`、`confirm → default`、`unattended → dontAsk`；`acceptEdits`、`plan`、`bypassPermissions` 不会出现 | 降级：hook 无法据该字段区分 `confirm` 与 `standard` |
| 输入 `agent_id` / `agent_type` | — | 不支持 |
| 输入 `model` | 该 Run 固定的模型选择 | 兑现 |
| 输入 `stop_hook_active` | 见 HK-16 | 兑现 |
| 输入 `effort` | — | 不支持 |
| 输出 `systemMessage` | HK-17 `presentationEntries[]` | 兑现：由有权投影呈现，不直写客户端 |
| 输出 `continue`、`stopReason`、`suppressOutput`、`terminalSequence` | 只记录 | 不支持 |
| 输出 `decision` 与 `hookSpecificOutput.*` | 按 HK-09 与 HK-10 的事件行 | 逐字段 |

**HK-15**（机制）：同一事件上的多个 hook 串行运行，顺序按声明顺序；决定合并取最严格
（deny 严于 ask，ask 严于 allow，任一 close 即 close）；各 hook 给出的附加上下文全部保留并按
同一顺序拼接。`async: true` 的 hook 不被等待，只能观察与注入下一 Step 上下文，不施加控制
效果。命令超时按有效阈值中止该次运行，超时不阻断所在站点的推进。命令级失败一律 fail-open：
退出码非 2 不阻断，每次运行写一条 `hooks.run.completed`；`PreToolUse` 在 TL-07 产生预备门结果后运行；超时/失败不重跑 hook，不放宽该 deny/ask。
该结果不是准入承诺：在实际准入提交前必须按 CC-02/AU-06 通过当前撤权与资格屏障，
所以旧 allow 可失效、ask 仍需当前合格的 system_approval，deny 仍 deny；屏障只重验权威状态，
不回到 hook 或放宽已有门结果。阻断理由取自 stderr，写入拒绝结果或关闭原因，对用户与模型
都可见。本条只约束命令进程的失败；扩展点本身不可用时按 HK-05 处理，不是 fail-open。

## Stop 续跑的刹车

**HK-16**：`Stop` 的继续效果是内部 `hook_continuation` trigger，并由入队与 take/start 两道原子门限制。

| 内容 | 规则 |
|---|---|
| 触发与去重 | completed Run 后运行；dedupKey `(RunRef, handler)`。重复通知/观察者重跑不新增项；failed/superseded/cancelled 不触发 |
| cap 依据 | 从 tenant-owned hook config 的固定 revision 读取，缺省 8；该 revision 跟随 trigger，入队与 take/start 使用同一 revision，不受途中配置漂移影响 |
| 入队门 | 在同一 Session 协调提交中重建连续计数 `n`，检查 `n < cap` 后才入队；已运行的 hook 的 HK-17 completion 在此之前且仍恰一条 |
| take/start 门 | `takeTrigger`、counter slot 占用、`run.lifecycle.created` 与首个 `run.epoch.issued` 是同一原子步骤；其中从耐久 fold 重建 `n`，重验 asset/membership/Session、固定 config revision 与 `n < cap`。任一失败的 trigger 按 SE-06 结算为 `closed(source_invalid)`；只有 `n >= cap` 分支的 HK 观察记 `reasonCode=stop_cap_exhausted`，asset/membership/Session/config revision 失效分支保留各自真实的来源失效 reasonCode。各观察均引用原 `runId/triggerId`，不扩展 Session reason 词表 |
| 计数与恢复 | slot 只由实际 hook-continuation Run start 占用；其它来源的 Run start 把连续计数重置为 0。崩溃恢复从 Run start 事实 fold，不从内存或排队项数量猜测 |
| 并发上界 | `cap=1` 且两个 handler 都要求续跑时，最多一个能在 take/start 原子门占 slot；另一个即使已排队也只能 `closed(source_invalid)`。重复通知、多个 worker 与恢复后重放不能突破 |
| `stop_hook_active` | 当前 Run 由已占 slot 的 hook_continuation 触发时 true，否则 false |
| 费用与用户输入 | 每个实际启动的续跑 Run 沿 BG-03 预留；被关闭 trigger 不启动/不收费。用户输入保持 acceptedOrder，普通 Run 可重置连续计数 |

超 cap/失效的 take-time trigger disposition 是独立 Session trigger/continuation 处置：它不新增或更新
`hooks.run.completed`，只以原 `runId/triggerId` 关联该 hook 运行与后续 Session 处置。需呈现的 status 已在
该次唯一 completion 的 `presentationEntries[]` 中耐久；它不是直接客户端副作用。

## 观察事件

**HK-17**：每次 hook 运行与每次装配判定都留下可查记录。

| 事件 | 耐久性 | 内容 |
|---|---|---|
| `hooks.run.completed{runId, event, handler, site, subject, status: ok \| blocked \| failed \| timeout \| unavailable, exitCode, durationMs, fieldEntries[], presentationEntries[]}` | 耐久，按 OB-02 的关键审计随所属提交或可核实 outbox 保存 | 每次运行恰一条；`fieldEntries[]` 为 `{field, disposition: honored \| degraded \| unsupported, detail?}`；`presentationEntries[]` 为 `{presentationId, kind: system_message \| status_message \| user_notice, content: {body} \| {bodyRef}, dedupKey, visibility}` 且 content 恰一形态，两数组缺省为空 |
| `hooks.continuation.disposition.observed{runId, triggerId, disposition: source_invalid, reasonCode}` | 耐久审计观察，以 triggerId 去重 | 投影 SE-06 已提交的 trigger 处置；仅 cap 分支用 `stop_cap_exhausted`，其他分支记实际 asset/membership/session/config-revision 失效依据。本观察不拥有或扩展 Session reason 词表，不新增/更新 hook completion |
| `hooks.run.started{runId, event, handler, site, subject}` | 非耐久工程观测（OB-02 的非关键诊断，允许有界缓冲与采样） | 用于诊断卡住的守卫 |
| `hooks.config.unsupported{asset, event, field}` | 耐久 | 装配时发现不支持的事件或字段 |
| `hooks.config.rejected{asset, reason: execution_boundary_required \| guard_unavailable \| source_untrusted \| assembler_inactive}` | 耐久 | 来源、租户策略、执行边界或扩展点不满足 |

表中的 `runId` 是本次 hook 运行的标识，与 RunRef 不是同一个身份；`subject` 是该次运行针对的
对象（队列项、调用、Run 或 Session）。全部记录经既有耐久记录面写入；兼容层不向 hook 进程
提供任何记录写入接口或服务句柄。关键记录不能保存时拒绝依赖它的新效果（OB-02），不以
"记录稍后补"放行 hook 效果。

## 装配与信任

**HK-18**（来源与主体）：hook 配置只作为租户资产的声明性成员被发现与装配，经
TG-05 的选用与启用关系确定其可用性；兼容层不读取
工作目录或宿主的 settings 文件，跨租户的配置不会被装载。装配者是该 hook 资产在本租户的
选用或启用操作所记录的 membership revision：个人租户为 owner，组织租户为执行该操作的管理员。
每次触发之前重验装配者成员关系仍 active、资产仍 enabled、Session 属同一租户；任一失败则跳过
该次触发并写 `hooks.config.rejected{assembler_inactive}`。"只允许受管 hook"由租户资产策略表达，
上游的 `allowManagedHooksOnly` 与 Codex 的 `Managed` 映射到该策略。

**HK-19**（执行边界与进程环境）：command handler 的进程在
live-agent v1 执行信任前提下运行，兼容层本身不声称隔离。
在部署尚未建立与装配者实际授权相符的执行边界时，只有受管 hook 与个人租户 owner 装配的 hook
可以装载 command handler；组织普通成员装配的 command handler 拒绝装载并写
`hooks.config.rejected{execution_boundary_required}`，同一资产的其余 hook 照常装配。hook 进程的
环境是白名单环境变量（不含供应方凭据，也不含记录存储路径）、显式 cwd（执行环境目标或该次
运行的临时目录）、数据只经 stdin 传入、不持有任何服务句柄。"不提供记录写入接口"只在接口层
成立；文件级隔离取决于部署提供的执行边界，本契约不承诺已实现该隔离。

**HK-20**（程序化作答）：`PermissionRequest` 的 allow 与 deny 可作为对工具门 system_approval
请求的程序化作答提交。实际 actor 是兼容层这一受信提供者，on-behalf-of 是装配者的当前
membership；提交时重验该 membership 有效、仍拥有该资产的选用关系，且按
HD-05 是该 kind 的合法作答者，审计可辨认该决定来自
程序化来源。Session 的确认模式为 `confirm` 或组织策略要求人工确认时，hook 的 allow 无效，
只在 `standard` 下生效（AU-04）；deny 在任何模式下
按 HD-07 结算。资格不足时该次作答降级为观察并记
degraded，不改变请求状态。程序化作答不适用于 `human` 工具的 question 与 agent_approval，
这两类的合法作答者由 HD-01 固定为 Session.owner。

## handler 集合

**HK-21**：本版的 handler 类型集合只有 `command`。`http`、`mcp_tool`、`prompt`、`agent` 四类
handler 不支持，配置中出现时写 `hooks.config.unsupported` 并按不支持处理，同一资产的
command handler 照常装配。本条不为未来的 handler 类型预留语义。

## 不在本版承诺的范围

**HK-22**：以下内容不是本版的承诺，消费者不能据本契约假定它们存在：子 agent 事件
（`SubagentStart` / `SubagentStop`）与 `agent_id` / `agent_type` 输入；`http`、`mcp_tool`、
`prompt`、`agent` 四类 handler；转录文件的导出与 `transcript_path` 一类的只读路径输入；
模型切换站点的守卫；Step 级（跨调用批）的 hook 贡献；Skill 与 Subagent frontmatter 中声明的
hooks；上游事件目录演化的自动跟踪。上述项目在映射表中已各自登记为不支持；需要时另行设计
并发布新版本，不在本版以配置开关方式提前开放。
