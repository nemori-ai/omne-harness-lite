# Claude Code / Codex hooks 能不能、以什么代价落到本项目的 Loop 拓展点上

- 调查对象与日期：Claude Code **2.1.280**（官方 hooks 参考页 2026-09-23 快照）；Codex 源码 **`5c5308fc9a9ee789049d646ef11e5400384b9c6f`** + 官方文档 2026-09-20 副本；
  DSH **`c291e7961a515f6d7af9304e7fd1d257929aef26`** 的 `packages/hooks/{hook-protocol,hooks-claude-code,hooks-codex}`。对照的产品正文：
  [PF-012 §5.8](../../design/product/PF-012-agent-loop-and-run/design.md#58-loop-拓展点)（rev 7）、
  [PF-008 §5.2](../../design/product/PF-008-human-in-the-loop/design.md#52-那个判断函数)（rev 4）、
  [PF-002 Loop Extension](../../design/product/PF-002-assets-settings-and-permissions/design.md#loop-extension)（rev 10）、
  [PF-000 §5.3](../../design/product/PF-000-occurrences-and-record-entries/design.md#53-干预力只长在瞬态这一半上)（rev 1）。
- 消费者：本程 proposal「hooks 兼容层基线」（待出现）。
- 最近核对：2026-09-23 / 上述版本（首轮）。
- 当前结论：两家都是点式、同事件并行折叠的 hook；它们的事件大半不在 PF-012 的 loop 位置上，落在位置上的集中在「执行动作之前/之后」「落终态之前」「压缩前后」与用户消息落盘前；
  PF-012 有五处位置两家都没有对应事件；两家的改写、`continue:false`、超时放行、替人放行/作答、权限设置写入这几类输出，与「只能靠改日志起作用」「可否决挂了当否决」「系统不替人作答」相撞；
  两家都拿不出「hook 落一张自定义卡片并让 Run 落盘等人」的先例。DSH 的 hook-protocol 可拆出与运行时无关的一半，但它对两家现行协议已有可指认的漂移。
  **本页不做接受决定，也不推荐方案。**

## 问题与区分条件

1. 两家各有哪些事件、各自的输入、输出/退出码语义、能否阻断、能否注入、handler 类型与匹配器？
2. 每个事件落在 PF-012 的哪个位置、带哪个维度、需要哪档干预力；哪些落不上、为什么？
3. 两家的形态（点式/瀑布/环绕）与输出如何折成「追加一条 / 决定下一条长什么样 / 否决」；哪些输出「只经日志起作用」承载不了、代价是什么？
4. DSH hook-protocol 与两个桥接的对象模型、转译规则、与 DSH loop 的耦合、要作为本项目兼容层起点时和两家现行协议差在哪？
5. 「一批先判完」「落卡片即等人」「自定义等待与提问」在三方有没有对应能力？
6. 版本漂移、协议演进、子进程宿主与取消、跨宿主同名异义各带来什么代价？

会改变结论的观察：Claude Code 2.1.280 的实际行为与文档不一致（本轮未探针）；Codex rollout 持久化了 `updatedInput` 改写（本轮副本不含该 crate）；任一家出现「批前」事件或 hook 自定义卡片的能力。

## 证据入口

- 三份来源笔记：[Claude Code](notes/claude-code.md)、[Codex](notes/codex.md)、[DSH](notes/dsh-hook-protocol.md)；取证条件与局限的索引在 [evidence.md](evidence.md)。
- 事件逐项表、事件→位置映射表、映射不上的清单与跨宿主差异全表：[reports/2026-09-23-hooks-to-positions.md](reports/2026-09-23-hooks-to-positions.md)。

## 当前结论

### 两家的 hooks 都是点式挂接，同一事件的多个 hook 并行运行、按优先级折叠，没有一件把输出交给下一件

Claude Code 文档：「All matching hooks run in parallel」；PreToolUse 冲突按 `deny > defer > ask > allow`。Codex 文档：「Multiple matching command hooks for the same event are launched concurrently」，
源码用 `FuturesUnordered` 并发执行，PreToolUse 任一阻断即阻断、PermissionRequest「any deny wins, otherwise the last allow wins」。
所以两家与 PF-012 [三种形态](../../design/product/PF-012-agent-loop-and-run/design.md#三种形态两种装得进一种拆两半)里的「点式」一致，但**同一位置挂多件时的求值方式是「并行 + 折叠」，不是 PF-012 采用的瀑布式**：
后一件看不到前一件的改写。决定类输出按优先级折叠与顺序无关；改写类输出在 Codex 按「最后完成者胜」，在 Claude Code 文档未说。
CC 的 `agent` handler（hook 内最多 50 轮子代理）与 Codex mcp_tool handler 内的 elicitation 等待，是挂件内部的计算，只要最后交一个结论并被记下，就不是 PF-012 拆掉的「环绕式后一半」。

- 适用范围：CC 2.1.280 文档快照；Codex `5c5308f`。DSH 桥接是**串行**执行（作者刻意），不在本条。
- 代价与不适用：把两家的多个 hook 装进一个瀑布式位置，改写的叠加语义会变（原来各自基于原始输入改写、互不可见；瀑布里后一件看到前一件的结果）；决定类输出因折叠与顺序无关，不受影响。
- 撞上这条事实会怎样：Codex 同配置多次运行可能选中不同的 `updatedInput`；若首跑结论不入日志，重算就拿不回同一个下一步。
- 来源：[E1](evidence.md#e1-claude-code-官方参考页)、[E2](evidence.md#e2-codex-源码与文档)；报告 §七。
- 最近核对：2026-09-23 / CC 2.1.280 文档、Codex `5c5308f`

### Claude Code 的 33 个事件里有 13 个、Codex 的 12 个事件里有 9 个落在 PF-012 的 loop 位置上，其余归会话、子代理、环境、设置、呈现等别的 topic

按 PF-012「位置由状态点推出」的定义逐个判断（全表见报告 §五）：
CC 落在位置上的是 UserPromptSubmit、UserPromptExpansion、PreToolUse、PermissionRequest、PermissionDenied、PostToolUse、PostToolUseFailure、PostToolBatch、Stop、StopFailure、PreCompact、PostCompact、SubagentStop（子 Run 的落终态之前）；
Codex 是 PreToolUse、PermissionRequest、PostToolUse、PreCompact、PostCompact、UserPromptSubmit、Stop、SubagentStop、Interrupt（落终态之后，被取消）。
**两家的 `SessionStart` 按 matcher 值拆开**：`source=compact` 落在「压缩之后」，其余来源归 [PF-015](../../design/product/PF-015-session-lifecycle-and-ownership/design.md)。
CC 的 `InstructionsLoaded` 是上下文载入，属于[组装](../../design/product/PF-012-agent-loop-and-run/design.md#53-改日志的动作与纯派生的动作)——按 PF-012 的推导规则本来就推不出位置。

- 适用范围：上述版本；映射是本轮按 PF-012 rev 7 的状态点定义所作的推断，不是宿主自述。CC 的「轮」、Codex 的 turn 与本项目的 Run 边界不完全重合，StopFailure、Interrupt、legacy notify 的映射是近似。
- 代价与不适用：从两家迁来的配置里，非 loop 事件（会话、子代理、环境、设置、呈现、模型切换、工具私有任务）没有落点，要由别的 topic 各自接住，或被兼容层丢弃。
- 来源：报告 §五、§六；[E1](evidence.md#e1-claude-code-官方参考页)、[E2](evidence.md#e2-codex-源码与文档)。
- 最近核对：2026-09-23 / 同上

### PF-012 有五处位置在两家都没有对应事件

尝试开始之后；消息落盘之前（**模型产出的消息**——CC 的 `MessageDisplay` 只改屏幕显示、transcript 与模型所见不变）；消息落盘之后（任一消息）；调模型之前（逐请求——CC 只有工具续跑前的 `PostToolBatch`，Codex 没有）；
调模型之后的「完整回复」一维（两家只在「最终无工具的回复」上有 `Stop`）。系统自带的[循环探测](../../design/product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪)所站的「调模型之后（完整回复）」因此在两家都没有对应事件。
另一面：DSH 的 `agent/pre-step` 每一步都触发，覆盖了「调模型之前」。

- 适用范围：两家上述版本的全部事件；「没有」是读遍两家事件清单后的结论，不是构造反例验证。
- 代价与不适用：这五处上的挂件只能由本项目原生定义，外来 hook 配置不会用到它们；反过来说，兼容层不需要为这五处做翻译。
- 来源：报告 §四；[E1](evidence.md#e1-claude-code-官方参考页)、[E2](evidence.md#e2-codex-源码与文档)。
- 最近核对：2026-09-23 / 同上

### 「执行动作之前」是两家最丰富的位置：Claude Code 给出 allow/deny/ask/defer 四种决定与参数改写，Codex 只接受 deny 与带改写的 allow

CC：PreToolUse 的 `permissionDecision` 四值、`updatedInput`、`additionalContext`；PermissionRequest 在权限提示出现前 allow/deny，allow 还能带 `updatedInput` 与 `updatedPermissions`；PermissionDenied 在 auto 模式否决后可追加「可重试」。
Codex：PreToolUse 只有阻断与 `allow`+`updatedInput`，`ask`、单独 `allow`、`continue:false` 都记为 hook 失败、工具照常执行；PermissionRequest 在 guardian/用户之前 allow/deny/弃权，`updatedInput`/`updatedPermissions`/`interrupt` 是保留字段。

- 适用范围：同上。Codex 的保留字段：文档说「fail closed today」，**源码实际是该 handler 记失败、不产生决定、落回正常审批**（不是直接拒绝）。
- 代价与不适用：两家都把 hook 的「允许」当作可以**放宽**（跳过提示或替人放行），而 PF-012/PF-000 的三档干预力里只有收紧与改写，没有放宽一档；兼容层要么另定谁有权放宽，要么把 allow 降为「无意见」，两种都与宿主原语义不同。
- 来源：[E1](evidence.md#e1-claude-code-官方参考页)、[E2](evidence.md#e2-codex-源码与文档)；报告 §四、§七。
- 最近核对：2026-09-23 / 同上

### Codex 5c5308f 的 updatedInput 只替换内存里的调用载荷，会话历史里保留的是模型原参数

`core/src/tools/registry.rs:601-653` 用 `with_updated_hook_input` 替换 invocation 的载荷（MCP 工具是重写 `arguments` 字符串）；本轮在 `core/src` 里没找到把生效参数写成历史条目的代码。
hook 运行摘要以 `EventMsg::HookCompleted` 发到事件流，rollout 是否持久化它未核。CC 是否在 transcript 记下原参数与生效参数，**未核实**。
DSH 拒绝在没有「三处一致」的前提下兑现改写：执行前参数有模型历史、审计、界面三个读者，只改执行会出现「界面显示一条命令、实际跑的是另一条」，其提案仍是 proposed，且「改写 assistant 消息里的 tool-call 块重放时会不会被提供方拒收」未决。

- 适用范围：Codex `5c5308f`（副本不含 rollout crate）；DSH `c291e79`。
- 代价与不适用：按 PF-012 [不能不留痕地改变下一步](../../design/product/PF-012-agent-loop-and-run/design.md#能做什么不能做什么)，承载宿主的 `updatedInput` 必须额外落一条生效参数（DSH 提案还要留原参数），这比两家现行做法多一次写入与一处「模型历史与执行不一致」的处理。
- 撞上这条事实会怎样：若照搬 Codex 做法，日志里的动作参数与实际执行的参数不同，重算与审计都会读到错的参数，而且不报错。
- 来源：[E2](evidence.md#e2-codex-源码与文档)、[E3](evidence.md#e3-dsh-hook-protocol-与桥接)。
- 最近核对：2026-09-23 / Codex `5c5308f`、DSH `c291e79`
- 状态标记：CC 一侧待核实（无源码，本机 transcript 无改写样本）

### 两家对多数事件的 hook 超时、崩溃与起不来都按「放行」处理，与 PF-012「可否决那一档挂了必须当否决」方向相反

CC：只有 exit 2 阻断，其他非零退出与超时对多数事件是非阻断错误；PreToolUse 上超时的 command/http/mcp_tool hook 不阻断；「a mistyped path in `settings.json` leaves the gate silently disabled」。例外：PreModelSwitch 超时阻断、Agent SDK 回调 hook 在 PreToolUse/UserPromptSubmit 超时阻断。
Codex：PreToolUse 与 PermissionRequest 的其他退出码、超时、无法启动都记 `Failed` 且不产生阻断或决定。DSH runner 同样把执行器拒绝变成非阻断结果。
PF-012 [干预力三档](../../design/product/PF-012-agent-loop-and-run/design.md#干预力三档直接用-pf-000-的) 引 PF-000：可否决挂了当否决（fail-closed），且要可见。

- 适用范围：两家上述版本；DSH `c291e79`。
- 代价与不适用：兼容层只能二选一——按 PF-012 执行，则原作者以「挂了就放行」写的 hook 在本系统里会变成「挂了就拦」；按宿主语义执行，则这类 hook 不能算「可否决」一档。
- 来源：[E1](evidence.md#e1-claude-code-官方参考页)、[E2](evidence.md#e2-codex-源码与文档)、[E3](evidence.md#e3-dsh-hook-protocol-与桥接)。
- 最近核对：2026-09-23 / 同上

### 两家在 PF-012 否决表未列出的位置上也提供阻断：压缩之前、用户消息落盘之前、一批动作之后、压缩之后

PF-012 只写了三个位置的否决含义（调模型之前＝不许发、执行动作之前＝不许做、落终态之前＝接着转）。
两家另有：PreCompact 阻断压缩（CC；Codex 用 `continue:false`）——CC 还说明为从上下文超限错误恢复而触发的自动压缩被阻断时请求失败；UserPromptSubmit/UserPromptExpansion 阻断并抹掉 prompt；
CC PostToolBatch 的 block/`continue:false`「在下一次模型调用前停住」；Codex PostCompact 与 SessionStart(compact) 的 `continue:false` 结束这一轮。

- 适用范围：同上。
- 代价与不适用：这些输出在本项目要落地，必须先有这几个位置上「否决」的含义；其中 PostToolBatch 与 Codex PostCompact 的「停住」实际作用在下一次调模型或落终态上，跨了位置。
- 来源：报告 §四、§七。
- 最近核对：2026-09-23 / 同上

### `continue:false` 等「停住整个处理」的输出，在 PF-012 里只能译成追加一条终态事实，而两家都不指明是哪种终态

CC：`continue:false`「Claude stops processing entirely」，优先于任何事件专属决定。Codex：PostToolUse 上用反馈替换结果；Stop/SubagentStop 上优先于续跑；PreCompact/PostCompact/SessionStart(compact) 上停住或结束这一轮；PreToolUse/PermissionRequest 上不支持。
PF-012：挂件[不能自己指定跳到哪一步](../../design/product/PF-012-agent-loop-and-run/design.md#能做什么不能做什么)，L3 的「优雅结束」就是落一条终态事实；终态只有完成/失败/被取消三个。
DSH 两个桥接都没兑现 `continue:false`：拦截面没有「硬停整个 run」的原语。

- 适用范围：同上。
- 代价与不适用：翻译时必须替 hook 选终态与原因；同一个字段在两家不同事件上的效果还不一致（报告 §十）。
- 来源：[E1](evidence.md#e1-claude-code-官方参考页)、[E2](evidence.md#e2-codex-源码与文档)、[E3](evidence.md#e3-dsh-hook-protocol-与桥接)。
- 最近核对：2026-09-23 / 同上

### Stop 的 block 与 PF-012「落终态之前否决＝接着转」同形；CC 有连续 8 次上限，Codex 5c5308f 未见上限且续跑标志是内存局部变量

两家的 Stop（与 SubagentStop）`decision:block` 都让这一轮继续：CC 把 reason 交给模型，Codex 生成一条续跑 prompt 记进历史并置 `stop_hook_active`。
CC 文档：连续 8 次 block 后宿主强制结束这一轮。Codex：`stop_hook_active` 是 turn 函数的局部变量（`core/src/session/turn.rs:407`），本 SHA 的 `turn.rs`、`stop.rs` 未见上限；
独立探针（cc-master，Codex 0.142.5）观察到 Stop block 与 exit 2 反复重入直到超时。DSH 两个桥都恒报 `stop_hook_active:false`、无上限。
PF-012 要求[检测状态从日志派生，不另存](../../design/product/PF-012-agent-loop-and-run/design.md#67-检测状态从日志派生不另存)。

- 适用范围：CC 2.1.280 文档；Codex `5c5308f` 源码；cc-master 探针对象 0.142.5（旧版本，只作旁证）。CC 的计数来源（内存还是 transcript）未知。
- 代价与不适用：两家的保护计数都不能直接满足「崩溃后从日志复现」；承载「别停」类 hook 需要能从日志数出连续续跑次数。
- 来源：[E1](evidence.md#e1-claude-code-官方参考页)、[E2](evidence.md#e2-codex-源码与文档)、[E5](evidence.md#e5-cc-master-codex-探针独立实测)、[E3](evidence.md#e3-dsh-hook-protocol-与桥接)。
- 最近核对：2026-09-23 / 同上

### Claude Code 把 hook 注入的上下文存进 transcript、resume 时重放而不重跑 hook，与 PF-012「新的一次尝试里不重跑挂件」同形

文档：「Claude Code saves the injected text in the session transcript … replays the saved text rather than re-running the hook for past turns」，只有 SessionStart 在 resume 时重跑。
本机 transcript 印证了记录形态（`attachment.type = hook_additional_context`，带 `hookName`、`hookEvent`、`toolUseID`）。Codex 把 `additionalContext` 记成 developer 消息进会话历史。
DSH 把每次 hook 运行记成 log-only 的 `hook/invoked`/`hook/result` 成对条目（含决定、退出码、stderr 摘要、耗时），并以不变式要求成对且在开着的 turn 内——与 PF-012 [§6.10](../../design/product/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论)「能干预的必须留下结论、挂了也留一笔」同向。

- 适用范围：CC 2.1.280 文档 + 本机 2.1.247 transcript 样本；Codex `5c5308f`；DSH `c291e79`。
- 代价与不适用：三方记下的都是**注入的上下文**或 **hook 运行摘要**；CC 与 Codex 都没有证据表明「决定」（deny、改写）本身作为条目落盘（Codex 的 `HookCompleted` 是否持久化未核）；DSH 的 detached 点（SessionStart、SubagentStart/Stop）不记 `hook/*`，只留下它注入的消息。
- 来源：[E1](evidence.md#e1-claude-code-官方参考页)、[E4](evidence.md#e4-本机-claude-code-transcript-与插件实例)、[E2](evidence.md#e2-codex-源码与文档)、[E3](evidence.md#e3-dsh-hook-protocol-与桥接)。
- 最近核对：2026-09-23 / 同上

### 两家的 hook 都不能产出带自定义选项的提问卡片；能引出的等待除 Claude Code 的 `defer` 外都在宿主进程内

CC：PreToolUse `ask` 弹宿主固定的权限对话框（带 hook 来源标签与 reason，auto 模式也强制弹）；`defer` **只在 `-p` 模式、只在一轮仅一个工具调用时**生效，进程以 `tool_deferred` 退出、调用留在 transcript、外部调用方 resume 后同一调用再过一次 PreToolUse，无超时。
Codex：PreToolUse `ask` 不支持；PermissionRequest 只能在审批 UI 出现前替人决定或弃权；mcp_tool handler 可经 MCP elicitation 在 hook 进程内向用户要输入，等待不计超时。
DSH CC 桥的 `ask` 走审批接缝，没有应答方即 fail-closed 为 deny。
PF-008 的等待是落盘的、[没有超时](../../design/product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答)、不占协程的等待；卡片来源只有 agent 发起与系统发起两种，[选项按来源固定](../../design/product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同)。

- 适用范围：同上。
- 代价与不适用：「租户经 hook 自定义人机协作流程」在两家没有可照搬的先例；最接近的 CC `defer` 不进任何决策池、受限于非交互模式与单调用，Codex 的 elicitation 等待占着 hook 进程。
- 来源：[E1](evidence.md#e1-claude-code-官方参考页)、[E2](evidence.md#e2-codex-源码与文档)、[E3](evidence.md#e3-dsh-hook-protocol-与桥接)；报告 §八。
- 最近核对：2026-09-23 / 同上

### 两家都允许 hook 在人看到之前替人放行或替人作答

CC：PreToolUse `allow` 跳过权限提示；PermissionRequest `allow` 代替用户批准；AskUserQuestion 用 `allow`+`updatedInput` 填 `answers` 代答；Elicitation 用 `accept`+`content` 代填 MCP 表单。
Codex：PermissionRequest `allow` 让审批不出现。两家都把这当成正常用法（CC 的 `defer` 回路就是由外部 UI 收答案、再由 hook 代答）。
PF-008 §6.1「系统不替人作答」禁的是没有事件也给答案；hook 在人看到卡片之前替人决定，是否算「系统替人作答」，产品正文没有说。

- 适用范围：同上。
- 代价与不适用：若本项目把租户 hook 的代答视为「替人作答」，两家这类 hook 无法等价迁入；若不视为，就要说明它与 PF-008 §6.1 的边界。
- 来源：[E1](evidence.md#e1-claude-code-官方参考页)、[E2](evidence.md#e2-codex-源码与文档)。
- 最近核对：2026-09-23 / 同上

### 「一批动作先全部判完、再执行任何一个」在两家与 DSH 都没有对应能力

CC：没有批前事件；PreToolUse 逐调用触发，是否所有 PreToolUse 判完才开始执行任何一个文档未说；`PostToolBatch` 在批**后**；`defer` 明确拒绝多调用的一轮。
Codex：每个调用各自走 PreToolUse→审批→执行，支持并行的工具在读锁下并发（`core/src/tools/parallel.rs:124、179-182`）。DSH：`tools/pre-execute` 逐调用。
PF-008 [§5.3](../../design/product/PF-008-human-in-the-loop/design.md#53-一批卡片与答完是什么意思) 要求一批卡片全答完才解除，PF-012 T3–T5 在放行判断上是整批判断。

- 适用范围：同上；CC 一侧是「文档没说」，不是反例验证。
- 代价与不适用：两家的 PreToolUse hook 无法看到「同一批里的其他调用」，一个需要看整批才能下判断的挂件在两家没有落点（CC 的 PostToolBatch 能看整批，但动作已执行）。
- 来源：[E1](evidence.md#e1-claude-code-官方参考页)、[E2](evidence.md#e2-codex-源码与文档)、[E3](evidence.md#e3-dsh-hook-protocol-与桥接)。
- 最近核对：2026-09-23 / 同上

### 两家的同名事件语义不一致，至少在 PreToolUse、PermissionRequest、PostToolUse、Stop 与非零退出码的处理上

PostToolUse `block`：CC 把 reason 附在结果旁、原结果仍可见；Codex 用反馈**替换**结果。PreToolUse `allow`：CC 跳过提示；Codex 只能伴随 `updatedInput`、不跳过审批。
PreToolUse `ask`/`defer`：CC 支持；Codex 不支持。PermissionRequest exit 2：CC 不起作用；Codex = deny。非零非 2 退出时的 JSON：CC 读并可决定结果；Codex 只在 exit 0 解析。
Stop：CC 8 次上限；Codex 未见上限。子代理 hook 的 `session_id`：Codex 用父会话 id；CC 文档未说。其余见报告 §十。

- 适用范围：同上。Codex 的引擎叫 `ClaudeHooksEngine`、插件进程另设 `CLAUDE_PLUGIN_*`（文档），说明它有意沿用 CC 的协议形状——**形状同而语义不同**。
- 代价与不适用：一个同时声明兼容两家的兼容层不能用一张「事件名→行为」表，必须按方言分别解释同名事件与同名字段。
- 来源：[E1](evidence.md#e1-claude-code-官方参考页)、[E2](evidence.md#e2-codex-源码与文档)；报告 §十。
- 最近核对：2026-09-23 / 同上

### 两家的 hook 协议都在变：Claude Code 规则带大量版本分叉，Codex 有声明而不运行的 handler 与保留字段

CC 快照页里大量规则写「requires v2.1.xxx」或「before v2.1.xxx」（匹配器连字符 2.1.195、exit 2 带坏 JSON 仍阻断 2.1.214、坏 JSON 不再当上下文 2.1.248），页内最高提到 v2.1.274，本机是 2.1.280。
Codex：`Prompt`/`Agent` handler 在枚举里但解析后跳过；PermissionRequest 的三个保留字段、PostToolUse 的 `updatedMCPToolOutput`、通用 `suppressOutput` 解析但不支持；legacy `notify` 与新引擎并存、源码标注待移除；
schema 里有 `ask`/`interrupt`/`updatedPermissions` 而运行时拒收；独立探针显示 0.142.5 的 Stop 行为与今日文档不同、0.144–0.145 间 `apply_patch` 的 `tool_input` 形状变过。
DSH 以 CC 30 个、Codex 10 个事件为基线，今天分别是 33 与 12。

- 适用范围：同上。
- 代价与不适用：兼容层要钉住它兼容的宿主版本，并在宿主升级时重新核对；否则既有的映射会在不报错的情况下过期（DSH 的匹配器漂移就是一例，见下条）。
- 来源：[E1](evidence.md#e1-claude-code-官方参考页)、[E2](evidence.md#e2-codex-源码与文档)、[E5](evidence.md#e5-cc-master-codex-探针独立实测)、[E3](evidence.md#e3-dsh-hook-protocol-与桥接)。
- 最近核对：2026-09-23 / 同上

### 两家的 command hook 都以宿主用户的权限起子进程，本轮未见沙箱包装

CC：「Command hooks execute shell commands with your full user permissions」，在无控制终端的独立 session 里跑。Codex：tokio 子进程、`kill_on_drop`、Unix 进程组清理，注释说等迁到 exec server 再由它负责进程树，本轮在 hook runner 里没看到沙箱。
两家的取消都靠超时与杀进程组；Codex 的 SessionEnd/Interrupt 只有 1–3 s。DSH 的 runner 走 `ctx.shell` 执行器（凭据清洗、进程组取消、`AbortSignal`）。

- 适用范围：同上；「未见沙箱」是读 Codex runner 源码得出，CC 只有文档。
- 代价与不适用：两家都是单用户本机模型；在本项目这类多租户服务端里跑租户写的 command hook，执行环境、资源账与隔离两家都没有可照搬的答案（归 [PF-005](../../design/product/PF-005-execution-environments-and-sandboxes/design.md)）。
- 来源：[E1](evidence.md#e1-claude-code-官方参考页)、[E2](evidence.md#e2-codex-源码与文档)、[E3](evidence.md#e3-dsh-hook-protocol-与桥接)。
- 最近核对：2026-09-23 / 同上

### DSH hook-protocol 的 matcher、codec、merge 与结果类型不依赖 DSH 运行时，runner、hook 事件与不变式依赖 DSH 的 shell 执行器与 Session 结构

`matcher.ts`、`codec.ts`、`merge.ts`、`detached.ts` 与 `HookOutput` 类型没有运行时 import；`runner.ts` 依赖 `@deepseek-ai/dsh-shell` 的 `ShellExecutor`；`events.ts` 与 `invariant.ts` 依赖 `dsh-session` 的 Session、turn 事件与 `SessionEventMap` 声明合并、`dsh-invariants` 与 `cordis`。
两个桥接包 import `dsh-agent`、`dsh-tools`、`dsh-llm`、`dsh-session-projection`（CC 桥另加 `dsh-subagent`），直接映射到 DSH 自己的拦截面（`agent/pre-step`、`tools/pre-execute`、`tools/post-execute`、`agent/turn-stopping`、`agent/session-start`、`subagent/start|end`），**与 DSH agent loop 紧耦合**。
DSH 的设计立场是「原生插件是正路，桥接只是兼容适配、不是 power tool」。

- 适用范围：DSH `c291e79`；耦合按 import 与事件名判断，未逐一读被依赖包。
- 代价与不适用：可直接复用的只有无运行时依赖的那一半（matcher、codec、merge、detached 四个文件约 360 行，另加类型）；runner 要换成本项目的执行环境接缝，`hook/*` 事件要换成本项目的日志条目，桥接的决定映射要重写到 PF-012 的位置上。DSH 拦截面本身不覆盖压缩、调模型之后、尝试开始之后、落终态之后。
- 来源：[E3](evidence.md#e3-dsh-hook-protocol-与桥接)；报告 §三。
- 最近核对：2026-09-23 / DSH `c291e79`

### DSH 两个桥接只覆盖 Claude Code 的 7 个与 Codex 的 5 个事件，且有改写、硬停、Stop 循环保护三处自认缺口

CC 桥：SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Stop、SubagentStart、SubagentStop；只跑 command；PreToolUse 的 deny/ask 生效，allow 不预批、defer 不支持、`additionalContext` 忽略；PostToolUse 的 `updatedToolOutput` 不支持；SubagentStop 只观察。
Codex 桥：PreToolUse、PostToolUse、SessionStart、UserPromptSubmit、Stop；只跑同步 command；PreToolUse 只有 deny。
两边：`updatedInput` 只记日志告警、`continue:false` 不执行、`stop_hook_active` 恒假、`systemMessage` 不送达、`transcript_path` 为空；配置只读一个进程级路径，无多层发现、无信任/哈希模型；SessionStart 注入可能赶不上首个请求。
长处同样是作者自述且有代码：注入的上下文一律标 `source: plugin`（不冒充用户）；仅有 context 的 hook 先 `next()` 再并入，不短路后续策略；非法 matcher 让整份配置加载失败而非部分注册；决定折叠与顺序无关。

- 适用范围：DSH `c291e79`。
- 代价与不适用：作为起点，未覆盖的是 CC 26 个事件、Codex 7 个事件，外加上面各项部分字段；PermissionRequest、压缩、Notification 在 DSH 拦截面里本就没有位置。
- 来源：[E3](evidence.md#e3-dsh-hook-protocol-与桥接)。
- 最近核对：2026-09-23 / DSH `c291e79`

### DSH hook-protocol 相对今天的两家已有可指认的漂移

匹配器：DSH 精确集是 `[A-Za-z0-9_|]+`，CC 现行规则把 `-`、空格、`,` 也算精确（2.1.191/2.1.195 起）——`code-reviewer` 在 DSH 里按不锚定正则跑、会命中 `senior-code-reviewer`。
codec：只在 exit 0 解析 JSON、坏 JSON 当纯文本；CC 现行在所有退出码读 JSON、坏 JSON 报非阻断错误且不当上下文（2.1.248 起）。
merge：没有 CC 的 `defer` 档。Codex 桥给的 `tool_input` 只有 `{command}`，Codex 现行对 MCP/本地 function 工具给完整参数。事件数基线 30/10，现行 33/12。

- 适用范围：DSH `c291e79` 对照 CC 2.1.280 文档快照与 Codex `5c5308f`。
- 代价与不适用：以它为起点，这几处要先对齐到钉住的宿主版本；而且对齐是一次性的，宿主再升级还会再漂。
- 来源：[E3](evidence.md#e3-dsh-hook-protocol-与桥接)、[E1](evidence.md#e1-claude-code-官方参考页)、[E2](evidence.md#e2-codex-源码与文档)。
- 最近核对：2026-09-23 / 同上

## 对照产品正文时撞上的缺口

只陈述，不裁决；是否要补、怎么补归 proposal 与产品负责人。

| # | 缺口 | 出处 | 触发它的宿主事实 |
|---|---|---|---|
| 1 | 否决的含义只写了调模型之前、执行动作之前、落终态之前三处；压缩之前、消息落盘之前（被拦的消息要留什么痕）、执行动作之后（这一批）没有写 | [PF-012 干预力三档](../../design/product/PF-012-agent-loop-and-run/design.md#干预力三档直接用-pf-000-的) | PreCompact、UserPromptSubmit、PostToolBatch、Codex PostCompact 的阻断 |
| 2 | 三档干预力没有「放宽」；一件拓展件能否替人放行，没有说 | [PF-012 干预力三档](../../design/product/PF-012-agent-loop-and-run/design.md#干预力三档直接用-pf-000-的)、[PF-002 Loop Extension](../../design/product/PF-002-assets-settings-and-permissions/design.md#loop-extension) | PreToolUse/PermissionRequest 的 `allow` |
| 3 | 租户挂件在人看到之前代答，算不算「系统替人作答」，没有说 | [PF-008 §6.1](../../design/product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答) | AskUserQuestion `answers`、Elicitation `accept`、PermissionRequest `allow` |
| 4 | 卡片来源只有 agent 发起与系统发起；拓展件落的卡片属于哪一种、选项集由谁定，没有说（循环守卫 L4「复用等人那条路」是系统自带件，未覆盖租户件） | [PF-008 §6.8](../../design/product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同)、[PF-012 §5.9](../../design/product/PF-012-agent-loop-and-run/design.md#59-循环守卫四级阶梯) | 用户 2026-09-23 要求租户经 hook 自定义人机协作 |
| 5 | 挂件要求「停住」时落哪种终态，没有说 | [PF-012 能做什么，不能做什么](../../design/product/PF-012-agent-loop-and-run/design.md#能做什么不能做什么) | `continue:false` |
| 6 | 外来 hook 没有声明干预力的概念；它的干预力按什么定，没有说 | [PF-002 Loop Extension](../../design/product/PF-002-assets-settings-and-permissions/design.md#loop-extension) | 两家 hook 的能力由事件与输出字段隐含 |
| 7 | 同一位置挂多件用瀑布求值；外来 hook 原本是并行互不可见 | [PF-012 三种形态](../../design/product/PF-012-agent-loop-and-run/design.md#三种形态两种装得进一种拆两半) | 两家的并行折叠 |

「执行动作之后」只有范围一维；CC 另按成败拆成 PostToolUse/PostToolUseFailure——这可以作为拓展件声明的「管哪些情形」表达，**不构成缺口**。

## 支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| CC 2026-09-23 文档描述的就是 2.1.280 的行为 | 所有 CC 结论 | 未核对：无源码、未探针 |
| Codex `5c5308f` 的源码行为就是当前发行版行为 | 所有 Codex 结论 | 未核对发行版；文档自称为发布行为参考，与源码冲突处按源码记 |
| Codex rollout 不单独持久化 `updatedInput` 的生效参数 | 「Codex 的 updatedInput 只替换内存里的调用载荷」中关于历史的一半 | 未核对：rollout crate 不在副本内 |
| PF-012 rev 7 的状态点清单与位置定义不变 | 全部映射 | 已按 rev 7 核对 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响选择及消费时点 | 所需产物/责任 |
|---|---|---|---|
| CC 多个 PreToolUse 同时 `updatedInput` 谁胜出 | 在 2.1.280 上配两个改写 hook 各跑多次 | 兼容层的改写合并规则 | 探针；兼容层 proposal 的作者 |
| CC 与 Codex 是否把改写前后参数、决定本身记进 transcript/rollout | 读 Codex rollout crate；在 CC 上跑改写 hook 后读 transcript | 「只经日志起作用」对照的完整性 | 补读源码 / 探针 |
| CC 一批并行调用的 PreToolUse 是否全部判完才执行 | 在 CC 上构造一轮两个调用、一个 hook 延迟 | 「一批先判完」是否有先例 | 探针 |
| CC 的 Stop 连续次数计数存在哪、resume 后是否重置 | 连续 block 中途 resume | 循环保护从日志派生的对照 | 探针 |
| Codex 当前发行版的 Stop 续跑是否仍会反复重入 | 在当前发行版复跑 cc-master 的 Stop 探针 | Stop 映射的稳定性 | 探针 |

## 采用与后续核对

尚无消费者采用；已知的第一个消费者是本程 proposal「hooks 兼容层基线」（待出现）。
宿主升级时，grep 本包与 `notes/` 里的版本 token（`2.1.280`、`5c5308f`、`c291e79`），命中的结论即需复核；变化触及结论时按[演进事件词](../README.md#演进事件词)记 `changelog.md`。
