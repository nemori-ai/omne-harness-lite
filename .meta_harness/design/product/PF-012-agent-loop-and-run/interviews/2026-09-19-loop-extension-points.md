# 2026-09-19 · 五家 loop 拓展点调研

**这是原始材料，不是结论，更不是依据。**
用途只有两个：**发现缺口**、**印证边界**。
本 topic 正文的每一条都能在 [decisions.md](../decisions.md) 找到裁决出处或独立推理链。

**指示**：产品负责人 2026-09-19——
「现在只有的这三个显然是不够的，我们从产品角度必须要通过提供完备的 loop 拓展点
来让用户（租户、组织超管）可以拓展/覆盖策略或者自定义自己的 agent plugin。
所以首先需要去对 claude code、codex、deepseek harness、grok bot、langchain middleware
可用的 loop 拓展点分别梳理和整合」

**取材时间**：2026-09-19。各家版本随时在变，引用请核对当时的来源。

---

## 一、最硬的发现：拓展点有三种形态，不是一种

**这是整合之后才看见的，单看任何一家都看不出来。**

| 形态 | 长什么样 | 谁有 |
|---|---|---|
| **点式** | 挂在某一刻，**观察 / 注入 / 否决 / 改写一个值** | **五家都有**。Claude Code 与 Grok 几乎全部是这一种 |
| **瀑布式** | **链式改写传下去的那个值**，一个接一个传 | **只有 DSH**：`system-prompt/assemble` · `agent/pre-step` · `agent/request` · `llm/stream` · `agent/request-error` |
| **环绕式** | **包住一段执行**，自己决定那段**跑 0 次 / 1 次 / N 次** | **LangChain**（`wrap_model_call` · `wrap_tool_call`）、**DSH**（`ctx.tools` 的 `around dispatch`） |

**LangChain 自己把这条差别说得最清楚**（原文）：

> **"You decide if the handler is called zero times (short-circuit), once (normal flow),
> or multiple times (retry logic)." This control is exclusive to wrap-style hooks.**
> Node-style hooks can observe and update state but **cannot prevent downstream operations**.

**对本 topic 的意义**：[rev 2 定的形状](../design.md#58-loop-拓展点)——
「夹在两个状态点之间 · 只能靠改会话日志起作用 · 不改方程」——
**只覆盖了点式**。瀑布式与环绕式装不装得进去，是这次要回答的问题。

---

## 二、各家的清单

### 2.1 Claude Code —— 事件最多，分档最细

**三十余个事件**，按它自己的分组：

| 组 | 事件 |
|---|---|
| **会话级** | `SessionStart`（matcher: startup/resume/clear/compact/fork）· `SessionEnd` · `Setup` |
| **轮级** | `UserPromptSubmit` · `UserPromptExpansion` · `Stop` · `StopFailure` |
| **工具级** | `PreToolUse` · `PermissionRequest` · `PermissionDenied` · `PostToolUse` · `PostToolUseFailure` · **`PostToolBatch`** |
| **子 agent** | `SubagentStart` · `SubagentStop` · `TaskCreated` · `TaskCompleted` · `TeammateIdle` |
| **文件与目录** | `FileChanged` · `CwdChanged` · `DirectoryAdded` · `WorktreeCreate` · `WorktreeRemove` |
| **配置** | `ConfigChange` · `InstructionsLoaded` |
| **模型与上下文** | **`PreModelSwitch`** · **`PostModelSwitch`** · `PreCompact` · `PostCompact` |
| **通知与显示** | `Notification` · `MessageDisplay` |
| **MCP 问询** | `Elicitation` · `ElicitationResult` |

**它的能力不是一个开关，是一组具名字段**——这是五家里分得最细的：

| 字段 | 干什么 | 哪些事件有 |
|---|---|---|
| `additionalContext` | **注入**给模型看的上下文 | SessionStart · UserPromptSubmit · Stop · PostToolUse · PostToolBatch · SubagentStart/Stop · PostModelSwitch · PostCompact |
| `updatedInput` | **改写输入** | UserPromptSubmit · UserPromptExpansion · PreToolUse |
| `updatedOutput` | **改写工具结果**（在模型看到之前） | PostToolUse |
| `permissionDecision` | allow / deny / **defer** | PreToolUse · PermissionDenied |
| `decision` | `{verdict, reason}` | PermissionRequest |
| `retry` | 被拒之后**允许模型重试** | PermissionDenied |
| `updatedResponse` | 改写 MCP 问询的回答 | ElicitationResult |
| `systemMessage` · `terminalSequence` | 显示与副作用 | 全部 |

**几处值得单独记的**：

- **`PostToolBatch`**：一整批并行工具调用**全部落定之后、下一次模型调用之前**。
  **五家里只有它把「一批」当成一个位置**。
- **`PreModelSwitch` 能否决换模型**，`PostModelSwitch` 只能注入。
- **`PermissionDenied` + `retry: true`**：被拒不是终点，可以告诉模型「你可以再试一次」。
- **恢复时不重跑**：原文——resume 时 Claude Code **replays the saved text rather than
  re-running the hook for past turns**。**这与本 topic [rev 2 推出的那条](../design.md#第二条是硬的因为它护着-f-的纯性)一致**，
  而那条是从「`f` 是纯的」独立推出来的，不是抄的。

### 2.2 Codex —— 十二个，与 Claude Code 命名高度重合

`SessionStart` · `UserPromptSubmit` · `PreToolUse` · `PermissionRequest` · `PostToolUse` ·
`PreCompact` · `PostCompact` · `SubagentStart` · `SubagentStop` · `Stop` · **`Interrupt`** · `SessionEnd`

| 它独有的 | 内容 |
|---|---|
| **`Interrupt`** | 用户打断当前轮时触发。**明确只能审计与清理，不许阻止** |
| **`Stop` 的 `decision: "block"`** | **不是「不许停」，是「生成一条续写提示」**——把「让它接着干」做成了一条新输入 |
| **`PreCompact` 能阻止压缩**（`continue: false`） | Claude Code 的 `PreCompact` 只能观察 |

**它自陈的用途**（原文）：把会话送去自建的日志/分析、**扫描提示词拦住误贴进来的 API key**、
把会话摘要成持久记忆、跑自定义校验。

### 2.3 Grok Build —— 十七个，**但只有一个能拦**

`PreToolUse` · `PostToolUse` · `PostToolUseFailure` · `UserPromptSubmit` · `SessionStart` ·
`SessionEnd` · `Stop` · `StopFailure` · `SubagentStart` · `SubagentStop` · `TaskCreated` ·
`TaskCompleted` · `PreCompact` · `PostCompact` · `Notification` · `InstructionsLoaded` · `CwdChanged`

> **⚠️ 五家里唯一一个明确选了相反方向的设计：**
>
> 退出码 0 = 成功，2 = 拦住，其余 = **非阻塞错误**。
> **只有 `PreToolUse` 拦得住工具调用。**
> 其余一切——**超时、崩溃、输出格式不对——一律 fail-open**：
> 失败记进会话，**而那次工具调用照常进行**。**只有显式的 deny 才拦得住。**

**这与本 topic 现在写的正好相反**：[rev 2 §5.8](../design.md#干预力三档直接用-pf-000-的) 取的是
**fail-closed**（可否决那一档挂了当作否决），依据是
[PF-000 §5.3](../../PF-000-occurrences-and-record-entries/design.md#53-干预力只长在瞬态这一半上)。
**这一处分歧要在正文里处置，不能装作没看见。**

**另一处**：Grok 的 plugin（`.grok-plugin`）**把 hooks 与 skills 打包在一起分发**，
`grok inspect` 一次列出 config sources / instructions / skills / **plugins** / **hooks** / MCP servers。
**它把拓展点挂件当成分发单元的成员。**

### 2.4 DeepSeek Harness —— 形态最丰富的一家

**它不叫 hooks，叫 seam（缝）。**五个 seam：

| seam | 位置 | 它说自己能做什么（原文要点） |
|---|---|---|
| `ctx.llm` | 模型推理 | adapters 注册 provider 实现；loop 与压缩都走 provider-neutral 的 stream service |
| **`ctx.tools`** | 工具可用性与执行 | **"Routes calls through pre-policy, monotonic guards, around dispatch, post-policy, and final-result observation"** |
| `ctx.systemPrompt` | 每一步的指令装配 | 收集各处贡献的 prompt sections 与给模型看的工具 schema |
| `ctx.sessionPersistence` | 事件耐久化检查点 | 后端观察并持久化事件流；**"without loop control"** |
| `ctx.compaction` | 步后压力与恢复 | 消费 post-step pressure 与 request-error recovery 事件 |

**`ctx.tools` 那一行是五家里对「工具这一段」切得最细的**：**五个子位置**，
而且中间那个 **`around dispatch` 是环绕式**。

**它的 loop 分七个阶段**，每个阶段的事件与允许的动作：

| 阶段 | 事件 | 能做什么 |
|---|---|---|
| **1 收件** | `agent/inbox/spliced` · `inserted` · **`claimed`**（驱动认领了哪几条） | 观察 |
| **2 步前装配** | `system-prompt/assemble`（**waterfall**）· **`agent/pre-step`**（**waterfall**） | **"authoritative reject or enter(messages)"**——**否决整步，或注入/改写内容** |
| **3 请求准备** | `agent/request`（waterfall）· `llm/stream`（waterfall） | 观察为主；**否决发生在阶段 2** |
| **4 流式回来** | `agent/assistant-stream`（瞬态块）· `assistant/message`（耐久）· **`assistant/attempt`**（**失败与重试的尝试，不产生对外消息**） | 观察 |
| **5 工具执行** | `tool/call` · `tool/result` | 观察为主，细分见 `ctx.tools` |
| **6 收尾** | **`agent/turn-stopping`**（**"serial terminal checkpoint"**）· `agent/status` | **最后的观察点，不许改** |
| **7 错误恢复** | **`agent/request-error`**（**waterfall**） | **返回一个 retry action，或保留原错误** |

**三处对本 topic 特别有价值**：

- **`assistant/attempt`**：**失败的那几次尝试单独记，且不产生对外消息**——
  与本 topic 的[执行尝试](../design.md#执行尝试)是同一个念头，只是粒度更细（它是模型调用级）。
- **`agent/request-error` 返回的是「一个 retry action」，不是自己循环调用**——
  **决定由它给出，执行由 loop 做**。这一点与环绕式是两回事，见 §三。
- **`ctx.sessionPersistence` 明写 "without loop control"**：**落盘这一层不许反过来控制 loop**。

### 2.5 LangChain middleware —— 数量最少，但形态最完整

**六个钩子 + 一个便利钩子**，分两style：

| style | 钩子 | 能做什么 |
|---|---|---|
| **node-style** | `before_agent` · `before_model` · `after_model` · `after_agent` | 返回 dict **合并进 agent state**；**可以 `jump_to`（`'end'` / `'tools'` / `'model'`）**；**不能阻止下游执行** |
| **wrap-style** | **`wrap_model_call`** · **`wrap_tool_call`** | **拿到 request 与 handler，自己决定 handler 调 0/1/N 次**；用 `.override()` 改 request；`wrap_model_call` 可**动态换模型、换系统消息、换可用工具** |
| 便利 | `@dynamic_prompt` | 动态生成系统提示词 |

**各自的用途（它自己给的）**：`before_agent` 载记忆/连资源/校验初始输入；
`before_model` **修剪历史、拦 PII**；`wrap_model_call` **缓存、重试、动态模型请求**；
`after_model` —— **"the most natural place for human-in-the-loop"**；
`wrap_tool_call` 注入上下文、拦截结果、**闸住哪些工具真的会跑**；
`after_agent` 存结果、发通知、清理。

---

## 三、把五家按「位置」摊平

**这是本次调研唯一有产品价值的产物。**左列是本 topic 方程里的位置。

| # | 方程里的位置 | Claude Code | Codex | DSH | LangChain | Grok | **我们** |
|---|---|---|---|---|---|---|---|
| **P1** | 一次尝试开始 | `SessionStart` | `SessionStart` | `agent/inbox/claimed` | `before_agent` | `SessionStart` | ✗ |
| **P2** | 一条输入落盘之后、想之前 | `UserPromptSubmit` · `UserPromptExpansion` | `UserPromptSubmit` | `agent/inbox/*` | — | `UserPromptSubmit` | ✗ |
| **P3** | 想之前（组装与压缩之前） | `PreCompact` | `PreCompact`（**可阻止**） | **`agent/pre-step`**（**可否决整步**） | `before_model` | `PreCompact` | ✗ |
| **P4** | 请求攒好之后、发出之前 | — | — | `agent/request` | **`wrap_model_call`** | — | ✗ |
| **P5** | **模型回复落盘之后** | `Stop` | `Stop` | `assistant/message` | `after_model` | `Stop` | ✅ **循环探测** |
| **P6** | 模型调用失败之后 | `StopFailure`（**只观察**） | — | **`agent/request-error`**（**可 retry**） | `wrap_model_call` | `StopFailure` | ✗ |
| **P7** | **有动作、做之前** | `PreToolUse` · `PermissionRequest` | `PreToolUse` · `PermissionRequest` | `ctx.tools` 的 **pre-policy** | `wrap_tool_call` | `PreToolUse`（**唯一能拦的**） | ✅ **放行判断** |
| **P8** | **工具返回之后、落成消息之前** | `PostToolUse`（**可改输出**）· `PostToolUseFailure` | `PostToolUse` | **post-policy** · **final-result observation** | `wrap_tool_call` | `PostToolUse` · `PostToolUseFailure` | ✅ **卸载判定** |
| **P9** | 一批动作全齐之后、回到想之前 | **`PostToolBatch`** | — | — | — | — | ✗ |
| **P10** | 收尾之前、落终态之前 | `Stop`（可阻止停） | `Stop`（**生成续写提示**） | **`agent/turn-stopping`** | — | `Stop` | ✗ |
| **P11** | 落终态之后 | `SessionEnd` | `SessionEnd` | — | `after_agent` | `SessionEnd` | ✗ |
| — | 压缩之后 | `PostCompact` | `PostCompact` | `ctx.compaction` | — | `PostCompact` | ✗ |
| — | 换模型 | `PreModelSwitch` · `PostModelSwitch` | — | — | `wrap_model_call` | — | ✗ |
| — | 子 agent 起止 | `SubagentStart/Stop` | `SubagentStart/Stop` | — | — | `SubagentStart/Stop` | ✗ |
| — | 落盘本身 | — | — | `ctx.sessionPersistence` | — | — | ✗ |
| — | 配置/文件/目录变化 | 五个事件 | — | — | — | `InstructionsLoaded` · `CwdChanged` | ✗ |
| — | 流式显示 | `MessageDisplay` | — | `agent/assistant-stream` | — | — | ✗ |

**我们现在覆盖 3 个，五家共同覆盖的位置有 11 个。**

---

## 四、四处方向相反的设计，必须逐条处置

**这一节是调研里最要紧的部分**——它们不是「别家多了几个事件」，是**做了相反的选择**。

| # | 分歧 | 各家 | 我们现在 |
|---|---|---|---|
| **一** | **拓展点自己挂了怎么办** | **Grok 明确 fail-open**（只有显式 deny 才拦，超时/崩溃/格式错一律放行） | **fail-closed**（[PF-000 §5.3](../../PF-000-occurrences-and-record-entries/design.md#53-干预力只长在瞬态这一半上) 的三档） |
| **二** | **拓展点能不能自己指定跳到哪一步** | **LangChain 能**（`jump_to: 'end'/'tools'/'model'`） | **不能**（[rev 2 §5.8](../design.md#能做什么不能做什么)：转移由状态转移表算） |
| **三** | **拓展点能不能控制那一步跑几次** | **LangChain 与 DSH 能**（wrap / around dispatch） | **没有这种形态** |
| **四** | **挂件算不算分发单元的成员** | **Grok 的 `.grok-plugin` 把 hooks 与 skills 打包在一起** | **已定（当天晚些时候）**——[拓展件是第八类资产](../../PF-002-assets-settings-and-permissions/design.md#loop-extension)，**Plugin 可以打包它**。写这一行时还是「未定」，原样保留 |

**第三条还有一个细分，两家做法不同**：

> **LangChain 的 wrap 自己循环调 handler**；
> **DSH 的 `agent/request-error` 返回一个 retry action，由 loop 去执行**。
>
> **后者与本 topic 的模型兼容，前者不兼容**——
> 因为自己循环调用时，中间那几次的结果**不经过日志**，
> 重算时[拿不回同一个下一步](../design.md#第二条是硬的因为它护着-f-的纯性)。

---

## 五、一处独立收敛，值得记下

**Claude Code 与本 topic 在「恢复时不重跑拓展点」这一条上撞到了一起，而两边的路完全不同：**

| | 它的说法 | 我们的说法 |
|---|---|---|
| Claude Code | resume 时 **replays the saved text rather than re-running the hook for past turns** | —— |
| 本 topic | —— | [拓展点本身不必是纯的，但重算时不重跑它](../design.md#第二条是硬的因为它护着-f-的纯性)——**它上次做的判断已经在日志里** |

**我们那条是从「`f` 是纯的」推出来的，不是抄来的**（[decisions 第二节](../decisions.md#rev-2-新推的)，
rev 2 写在本次调研之前）。**一个工程实现与一条产品推导落在同一处，这比任何一边单独成立都更硬。**

---

## 六、看过但判断不该进来的

| 外部有 | 为什么不进 |
|---|---|
| **文件/目录/配置变化那一族**（Claude Code 五个、Grok 两个） | 那是**编码场景的开发者工效**，不是 agent loop 的结构。本系统不是编码工具 |
| **`MessageDisplay` / `agent/assistant-stream`** | 流式**怎么回来、怎么拼**归 [PF-009](../../PF-009-context-message-types/README.md)；**显示**归界面。**它不在方程上** |
| **`WorktreeCreate` / `WorktreeRemove`** | 同第一行，且 worktree 是 git 的概念 |
| **`Elicitation` / `ElicitationResult`** | MCP 问询的答复归 [PF-008 的两个维度](../../PF-008-human-in-the-loop/design.md#等待态的两个维度)，那条路已经定完了 |
| **`TeammateIdle` / `TaskCreated` / `TaskCompleted`** | 多 agent 协作的形态本系统[归 PF-007](../../PF-007-meta-capabilities/README.md)，不在 loop 上 |
| **`ctx.systemPrompt` / `@dynamic_prompt`** | 系统提示词的**成分**归 [PF-004 §5.4](../../PF-004-agent-definition-and-assembly/design.md#54-为什么系统提示词必须落在第三列)（装配时定），**成品**在请求时组装。**不是 loop 的拓展点** |
| **`ctx.sessionPersistence`** | 落盘归技术设计；而且 DSH 自己写着它 **"without loop control"** |

---

## 七、用 `/btw` 与 `/goal` 回头检验

**位置定完之后，产品负责人指定用两个真实的产品功能倒过来验一遍**：
[Claude Code 的 `/btw` 与 `/goal`](https://code.claude.com/docs/en/commands)。
**这两个挑得好**——一个几乎全落在拓展点上，一个一条都用不上。

### 7.1 `/goal`：官方自己说它是 Stop hook 的包装

> `/goal` is a wrapper around a session-scoped prompt-based Stop hook.
> Each time Claude finishes a turn, Claude Code sends the condition and the conversation
> so far to your configured small fast model. The model returns one of three verdicts...
> **Not yet met**: Claude keeps working and takes the reason as guidance for the next turn.

拆成十二件机械动作，逐条落位：

| `/goal` 实际做的事 | 落在哪 |
|---|---|
| 设目标时立刻起一轮 | **不在 loop 上**——往 inbound 投一条输入（PF-014） |
| 每轮结束时把条件 + 会话交给小模型评判 | **落终态之前** |
| 判「未达成」→ 不还控制权，再起一轮 | 那儿的**可否决**（否决停下） |
| 把评判理由当作下一轮的指引 | 那儿的**可改写**（追加一条） |
| 判「达成／不可能」→ 清目标、日志记一条 | **落终态之后** |
| 打转保护：连续几轮无工具调用就停 | **落终态之前的另一件挂件** |
| 后台还在跑就跳过这一轮评判 | 挂件自己的「管哪些情形」——在那儿看日志发现在途执行，**返回不插手** |
| 30 分钟 check-in，系统自己起一轮 | **不在 loop 上**——定时触发的输入（PF-014） |
| 认证失败清目标／限流暂停 | **调模型之后（收场＝失败）** |
| 一会话一目标、resume 恢复 | PF-015 |
| 状态可查（评了几轮、花了多少） | 从日志派生 + Run 的成本归属，**已有** |
| 评判本身要调一次模型 | **钱算进它插手的那个 Run**（本轮定） |

> **结论：loop 上的部分全落在落终态前后与调模型之后，一个位置都不缺，也不用加。**

**它还顺带证了一条设计**：落终态之前同时站着「打转保护」和「没达成目标就别停」。
**按功能命名的话这两件事就得各占一个「拓展点」，而它们明明站在同一处。**

### 7.2 `/goal` 检出两条要补进正文的

| 检出 | 处置 |
|---|---|
| **「落终态之前」的「可否决」否决的是「停下来」** | rev 2 的干预力表里「可否决」列的是放行判断、L3、L4，**全是否决往前走**。不写明方向，实现者会做反 |
| **挂件自己那次模型调用，钱算谁的** | 算进它插手的那个 Run。依据是[「这次失败的任务花了多少钱」](../design.md#run-是三样东西的归属单位)那句检验句 |

### 7.3 `/btw`：一个拓展点都用不上

> Claude answers a side question from what's already in the conversation...
> **The question and answer never enter the conversation history.**
> **Available while Claude is working**: the side question runs independently and
> doesn't interrupt the main turn. **No tool access.**

| `/btw` 实际做的事 | 落在哪 |
|---|---|
| agent 干活时发起旁路提问 | **不在 loop 上** |
| 看得见整条日志，**但看不见 agent 正在写的那条** | 只读日志 |
| 没有工具 | 不进动作空间 |
| **问和答都不进会话日志** | 方程完全没被扰动 |
| 按 `f` fork 成带工具的 subagent | PF-007 |

> **这是正面结论，不是缺口。**拓展点是**能改下一步**的位置，
> **旁路提问按定义不改下一步**——它不该在清单里，也不该为它开新位置。

**它反倒验了另一处**：「看不见 agent 正在写的那条」正好对应**输入落盘**这个状态点——
**没落盘的东西对旁路提问不存在**。

### 7.4 `/btw` 检出一条，戳破了一句已定的话

**PF-012 rev 2 §4 写着「Run 是成本 · 失败 · 收束三样的同一个归属单位」。**

旁路提问那次调用**花钱、会失败，却不属于任何 Run，也不属于任何一次尝试**。
那句话因此要收紧：

> **Run 是「一次任务」这一级的归属单位，不是唯一的一级。**
> 不属于任何 Run 的调用，归**会话**那一级。

**归属规则归 PF-015，但这一句必须写在 PF-012**——
不写，「Run 是成本的归属单位」会被读成「所有成本都归 Run」。

---

## 记录边界

- 本篇全部内容是 **PM 的调研摘要**，不是任何人的裁决。
- **外部系统的做法不构成本 topic 的依据。**
- Grok Build 的事件清单来自社区整理与其 hooks 文档页，**官方 overview 页未给出完整清单**——
  这一行的完整性**弱于**其余四家。
- DSH 的 seam 描述取自 `docs/capability-seams.md` 与 `docs/agent-lifecycle.md`，
  **是文档自述，未核对源码**。

**来源**：
[Claude Code hooks](https://code.claude.com/docs/en/hooks) ·
[Codex hooks](https://learn.chatgpt.com/docs/hooks) ·
[Grok Build hooks](https://docs.x.ai/build/features/hooks) ·
[DSH capability-seams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md) ·
[DSH agent-lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/agent-lifecycle.md) ·
[LangChain custom middleware](https://docs.langchain.com/oss/python/langchain/middleware/custom)

**第七节的来源**（与前六节不同，这两篇是**产品功能文档**，不是拓展点清单）：
[Claude Code `/goal`](https://code.claude.com/docs/en/goal) ·
[Claude Code 交互模式：`/btw` 旁路提问](https://code.claude.com/docs/en/interactive-mode) ·
[命令总表](https://code.claude.com/docs/en/commands)
