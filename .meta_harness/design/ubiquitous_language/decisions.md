# 词条的拍板记录

**有些概念不归任何一个 topic**——它们是**跨全链的治理概念**，被很多 topic 引用，
却没有哪一个拥有它们。**那些概念的依据在这里。**

> **这一页不是产品设计。**它只记录**产品负责人对「这个词指什么」的直接裁决**，
> 以及 PM 据此起草定义时的推理。**产品规则、取舍与后果仍归各 topic**。
>
> **词条的出处只有两种合法形式**：指向某个 topic 的某一节，或指向这里的一条。
> **没有第三种**——[否则就是发明](conventions.md#出处为什么必填)。

## UL-D-1 · 会话与运行 · 2026-09-18

### 产品负责人的原话

> 「session 和 run 确实目前我们还没有正式定义，现在可以定义一下。
> **session 和 run 都是数据的聚合，是治理性质的概念**，
> 具体的定义你可以先出一版我看看，也可以调研一下看看各个 agent harness 项目、产品里面它们是怎么定义的」

随后就 PM 提交的草案裁决了三件事：

> 「**同一个会话同一时刻只能有一个活跃的 run，同一时刻只能有一个活跃的 agent runtime。**
> （**目前还是遵循这个不变式，直到我们开始设计支持 gpt-live**）。
> 至于放哪里：terms/ 下可以有一个专门的主题聚合，**就叫 agent 运行时闭环**吧」

> 「shell 的那个，**同意你改名**」

### 定死了什么

| # | 裁决 |
|---|---|
| **1** | **会话与运行都是「数据的聚合」，是「治理性质的概念」**——不是过程，不是行为 |
| **2** | **[会话内单活跃](terms/agent-runtime-loop.md#ul-single-active-execution--会话内单活跃--single-active-execution)**：一个会话，同一时刻**至多一个活跃 Run**、**至多一个活跃运行实例** |
| **3** | **这条不变式有明确的失效条件**：**开始设计支持 GPT-Live 时重新裁决**，在那之前一律遵循 |
| **4** | 两者的词条归 `terms/` 下新的一卷，**卷名「agent 运行时闭环」** |
| **5** | `Shell()` 那个「会话」**改名为[终端会话](terms/grounding-and-isolation.md#ul-terminal-session--终端会话--terminal-session)**，`Session` 留给协作会话 |

### 定义正文是 PM 起草的，依据在这里

**产品负责人给的是两条判断**（「数据的聚合」「治理性质的概念」）**加三条裁决**，
**定义的措辞由 PM 写**。推理链如下，**可核对、可推翻**：

| 定义里的哪一句 | 从哪来 |
|---|---|
| **会话是边界与身份，不是容器** | 「数据的**聚合**」+「**治理**性质」。聚合拥有边界，容器拥有内容物。**而[记录是 append only 的会话日志](../product/PF-012-agent-loop-and-run/design.md)、有自己的身份**，会话若「包含」它，那条日志就成了会话的字段 |
| **会话不要求有人说过话** | [Connector 把外部消息送进来](terms/capabilities-and-composition.md#ul-connector--连接件--connector)、定时触发、系统发起，**这三种都得有个会话装**。定义成「对话」，它们当场无处安放。**前身系统明写「Session 可以没有 chat turn」**，见下 |
| **会话有终态，且必须有** | [PF-005 会话级沙箱到点销毁](../product/PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存)、[PF-007 会话授权上下文随会话结束一起消失](../product/PF-007-meta-capabilities/design.md#会话授权上下文)——**两条既有设计都挂在「会话结束」这个事实上**。没有终态，它们全悬空 |
| **Run 附着在恰好一个会话上** | 成本按租户归属、授权在会话里、沙箱绑会话——**一个不属于任何会话的 Run，这三样全没有着落** |
| **Run 是逻辑的，尝试是物理的** | 「治理性质」。**治理要算账**：一次网络抖动重试若算成两个 Run，成本与失败都算错。**前身把 logical Run 与 physical attempt 分开，正是这个理由** |
| **Run 从触发到收束** | [PF-004 已把「怎么推进、怎么收束、怎么中断」划给 Run 那一块](../product/PF-004-agent-runtime-assembly-and-liveness/design.md#两个只引用不拥有的对象)，本条只定**边界在哪**，不定**怎么收束** |

### 调研：四家怎么定义

**PM 按产品负责人的指示做的对照**，**只作印证与提醒，不作依据**。

| | 「会话」 | 「一次运行」 |
|---|---|---|
| **OpenAI Assistants** | Thread：装 Messages 的对话 | **Run = 一个 Assistant 对一个 Thread 的有状态执行**，带完整状态机（`queued` → `in_progress` → `requires_action` → `completed`/`failed`/`expired`/`cancelled`） |
| **LangGraph Platform** | Thread：**跨多次 run 维持状态的持久容器**，累积并持久化状态 | Run = **对一个 assistant 的一次调用**；**可以不绑 thread**（无状态 run） |
| **Google ADK** | Session：**用户与 agent 之间的一个对话线程**，含 `events` 时序历史 + 只属于本次对话的 `state` | invocation |
| **`omne-next`（前身）** | Session：**耐久的 conversation/continuation identity**；**明写「Session 可以没有 chat turn」**；`active ↔ archived → expired / deleted` | Run：**一次 logical invocation control identity**；**「同 Run 技术恢复保原输入/窗口，Runtime 持 physical attempt」** |

**四家共识**：会话是身份与容器、跨多次运行存活；运行是一次执行、附着在会话上、有状态机。

**我们有意偏离两处，两处都与前身站在一边：**

| 偏离 | 为什么 |
|---|---|
| **会话不是「对话」** | ADK 与 OpenAI 都定义成 conversation thread。**我们有三种「没人说话」的触发**，定义成对话则无处安放 |
| **Run 必须绑会话** | LangGraph 允许无状态 run。**我们的成本、授权、沙箱全挂在会话上**，不绑就没有着落 |

**前身还有一条值得单记**：它把 Message / Run 从 Session 的 **containment 改成了
typed evidence refs**——**Session 不是一个装满东西的袋子，它只指向**。
这与本项目「记录是 append only 的会话日志，归会话不归 run」**是同一个形状，互相印证**。

### 一处顺带发现的撞名，已处置

`Shell()` 的 `create_session` / `close_session` 说的是**终端会话**，
与协作会话**完全两回事**。产品负责人同意改名。

**正文无须回改**——[PF-007](../product/PF-007-meta-capabilities/design.md#64-shell通向命令行)
与 [PF-005](../product/PF-005-execution-environments-and-sandboxes/design.md) 的叙述**本来就一律写的「终端会话」**，
**裸用一处也没有**。本次只是把它**定为正式名**并记下撞名，
**命令名 `create_session` 不动**——那是接口，不是术语。

返回[统一语言入口](README.md)
