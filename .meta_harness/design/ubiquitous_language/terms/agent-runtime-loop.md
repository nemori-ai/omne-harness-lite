# Agent 运行时闭环

**这一卷回答：一段协作怎么从触发走到收束，又怎么回到会话。**

```text
        ┌──────────────────── 会话（耐久，跨多次运行存活）────────────────────┐
        │                                                                      │
   触发 ─→ 运行 ──→ 装配 ──→ 运行实例 ──→ 执行（可含多次尝试）──→ 收束 ──→ 退役
        │                        ↑                                    │        │
        │                        └── 注入：上下文 / 执行环境 / 权限 ──┘        │
        │                                                                      │
        └───── 实例没了，会话还在：记录、授权、成本、血缘都留在这一层 ─────────┘
```

**收在这里的是这个闭环上的每一环**，以及它们各自的归属。
**agent 由什么构成**归[能力与构成](capabilities-and-composition.md)，
**动作落到哪里**归[落地与隔离](grounding-and-isolation.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

> **本卷的[会话](#ul-session--会话--session)、[运行](#ul-run--运行--run)、[触发](#ul-trigger--触发--trigger)、
> [执行尝试](#ul-run-attempt--执行尝试--run-attempt)、[会话内单活跃](#ul-single-active-execution--会话内单活跃--single-active-execution)
> 五条，不归任何一个 topic**——它们是跨全链的治理概念，
> 依据在 [UL-D-1](../decisions.md#ul-d-1--会话与运行--2026-09-18)。

## 这一卷最硬的一条

### UL-single-active-execution · 会话内单活跃 · Single Active Execution

> **中**：**一个会话，在同一时刻，至多有一个活跃的[运行](#ul-run--运行--run)，
> 也至多有一个活跃的[运行实例](#ul-agent-instance--运行实例--agent-instance)。**
> 「同时还有别的事在后台跑」不违反它——那是**同一个运行内部**的事。
>
> **EN**: **Within one session, at any moment, there is at most one active run and at
> most one active agent instance.** Work continuing in the background does not
> violate this — that belongs **inside** the one active run.

- **出处**：[UL-D-1 裁决 2](../decisions.md#定死了什么)（产品负责人 2026-09-18 直接裁决）
- **⚠️ 它有明确的失效条件**：**开始设计支持 GPT-Live 时重新裁决**，在那之前一律遵循。
  [GPT-Live 把语音层与推理层拆成两个模型](../../product/PF-009-context-message-types/interviews/2026-09-18-openai-gpt-live.md)，
  **届时「谁在活跃」会有第二个答案**
- **注意**：这条**不是性能约束，是治理约束**——「这个会话现在在干什么」**必须只有一个答案**，
  否则成本、失败与收束都算不清

## 会话这一层

### UL-session · 会话 · Session

> **中**：**一段持续协作的耐久身份与归属边界**。这段协作里产生的一切——
> [记录](../../product/PF-012-agent-loop-and-run/design.md)、运行、会话级的设置与授权、
> 落地的执行环境、花掉的成本——**都归到它名下**。
> 它**跨多次运行存活**，且**不要求有人说过话**：定时触发、外部消息送达、
> 系统发起，**同样开一个会话**。
>
> **EN**: **The durable identity and ownership boundary of one stretch of
> collaboration.** Everything it produces — the log, the runs, the session-scoped
> settings and authorizations, the execution environments landed on, the cost
> incurred — **is attributed to it**. It **outlives any single run**, and **it does
> not require that anyone has spoken**: a schedule firing, an inbound message or a
> system trigger opens one just the same.

- **出处**：[UL-D-1](../decisions.md#ul-d-1--会话与运行--2026-09-18)（产品负责人 2026-09-18 直接裁决，定义由 PM 起草）
- **别混 ①**：**不是[终端会话](grounding-and-isolation.md#ul-terminal-session--终端会话--terminal-session)**。
  `Shell()` 开的那个是**执行环境里的东西**，两者毫无关系
- **别混 ②**：**它是聚合，不是容器**——会话**不包含**消息与运行，而是**指向**它们。
  记录是独立的 append-only 日志，运行有自己的身份。**会话拥有的是边界，不是内容物**
- **注意 ①**：它就是[四个作用域层](scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)里那个**「本次协作」**——
  会话级的设置、权限、[会话授权上下文](../../product/PF-007-meta-capabilities/design.md#会话授权上下文)、
  [会话级沙箱](grounding-and-isolation.md#ul-session-sandbox--会话级沙箱--session-scoped-sandbox)都挂在它上面，**且一律不外溢**
- **注意 ②**：**它比运行实例长寿**——实例可回收可重建，回收之后**会话还在、历史还在、认定的定义还在**
- **注意 ③**：**它有终态，而且必须有**——PF-005 的沙箱销毁与 PF-007 的授权消失
  全都挂在「会话结束」这个事实上。**具体有哪几种终态，尚未拍板**

### UL-run · 运行 · Run

> **中**：**一次逻辑上的执行请求及其结果**，是**成本、失败与收束的归属单位**。
> 它附着在**恰好一个会话**上，从一次[触发](#ul-trigger--触发--trigger)开始，
> 到一次**收束**结束。中间想了几轮、调了几次工具、转没转后台，**都是它内部的事**。
>
> **EN**: **One logical request to execute, together with its outcome** — the unit to
> which cost, failure and conclusion are attributed. It attaches to **exactly one
> session**, begins at a trigger and ends at a conclusion. How many turns of thinking,
> how many tool calls, whether anything moved to the background — **all of that is
> internal to it**.

- **出处**：[UL-D-1](../decisions.md#ul-d-1--会话与运行--2026-09-18)（产品负责人 2026-09-18 直接裁决，定义由 PM 起草）
- **别混 ①**：**它是逻辑的，不是物理的**——一次 Run 可能经历多次[执行尝试](#ul-run-attempt--执行尝试--run-attempt)。
  **「重跑一次」与「同一次跑的第二次尝试」必须分得开**，否则成本与失败都算错
- **别混 ②**：Run 的**收束**与[一次工具执行的收场](../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)**不是一回事**——
  后者是工具那一层的六种，**粒度差着好几层**。**裸写「收场」不作数**
- **注意 ①**：**它不拥有记录**——它往会话的日志里写，**日志归会话**
- **注意 ②**：**它不拥有身子**——它在运行实例上执行，而**同一个会话的两轮 Run 可能跑在两个不同实例上**
- **注意 ③**：**怎么被驱动、怎么推进、怎么收束、怎么中断**，归
  [PF-012](../../product/PF-012-agent-loop-and-run/README.md)；本条只定**它是什么、边界在哪**

### UL-trigger · 触发 · Trigger

> **中**：**一次[运行](#ul-run--运行--run)的起点**——**是什么让这次运行开始的**。
> 它**不必是人说了一句话**：定时到点、外部消息经[连接件](capabilities-and-composition.md#ul-connector--连接件--connector)送达、
> 系统自己发起，都是触发。**触发的种类尚未穷举拍板**，
> 但**「没人说话」的那几种必须能表达**——否则[会话](#ul-session--会话--session)那条定义立不住。
>
> **EN**: **The starting point of a run** — what caused this run to begin. It need not
> be a person speaking: a schedule reaching its time, an inbound message arriving
> through a connector, or the system initiating something are all triggers. **The full
> set of kinds is not yet settled**, but **the "nobody spoke" kinds must be
> expressible** — otherwise the definition of session does not hold.

- **出处**：[UL-D-1](../decisions.md#ul-d-1--会话与运行--2026-09-18)（PM 起草，产品负责人未逐条裁决种类）
- **别混**：**裸写「触发」作动词时不是术语**——这里指的是**那个起点本身**，它是一个可被记录、可被归因的事实

### UL-run-attempt · 执行尝试 · Run Attempt

> **中**：**同一次[运行](#ul-run--运行--run)的一次实际执行。**重试、换一副身子、崩溃后恢复，
> 各是一次尝试——**它们属于同一个 Run，不是另外的 Run**。
> **Run 是治理身份，尝试是执行细节。**
>
> **EN**: **One actual execution of the same run.** A retry, a rebuilt instance, a
> recovery after a crash — each is an attempt, and **they all belong to the same run
> rather than constituting further runs**. **The run is the governance identity; the
> attempt is an execution detail.**

- **出处**：[UL-D-1 的推理链](../decisions.md#定义正文是-pm-起草的依据在这里)（PM 起草；与前身系统「logical Run / physical attempt」同构）
- **注意**：**这一条是「治理性质」的直接后果**——一次网络抖动重试若算成两个 Run，**账和失败都算错**

### UL-run-terminal-state · 运行终态 · Run Terminal State

> **中**：一次[运行](#ul-run--运行--run)的结局，**恰有三种：完成 · 失败 · 被取消**。
> 到了就回不去，**且只从一个出口落账**。
> **停下来等人不是终态**——那是它还活着时的一种姿态。
>
> **EN**: The outcome of a run — **exactly three: completed, failed, cancelled**.
> Once reached it is irreversible, and it is recorded through a **single point of
> exit**. **Waiting on a person is not one of them**; that is a posture the run
> holds while still alive.

- **出处**：[PF-012 §6.6](../../product/PF-012-agent-loop-and-run/design.md#66-终态不可逆且只有一个出口)（rev 2）
- **别混**：**不是[终局](execution-and-outcome.md#ul-terminal-disposition--终局--terminal-disposition)**——
  终局说的是**一件[非常态](execution-and-outcome.md#ul-off-nominal--非常态--off-nominal)**走完了整条阶梯，
  这一条说的是**这一次运行**的结局。**两条线各走各的**：Run 已经落了终态，那件非常态可能还在往外交
- **注意**：[被取消自成一种](../../product/PF-006-tools-and-skills/design.md#67-用户可以中断而中断不是失败)，**不并进失败**

## 怎么往前走

> **[Run](#ul-run--运行--run) 是被写下来的那一半，[Agent Loop](#ul-agent-loop--agent-loop--agent-loop) 是被重新算出来的那一半。**
> 缺前者，停机之后不知道当时在哪；缺后者，知道在哪也算不出下一步。

### UL-agent-loop · Agent Loop · Agent Loop

> **中**：**一次[运行](#ul-run--运行--run)怎么从这一步走到下一步**的那套逻辑，
> 写成一个纯函数：下一步由[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)
> 与[当下条件](#ul-current-conditions--当下条件--current-conditions)算出来，
> **不由任何活在进程里的东西决定**。**同一份日志配同一份当下条件，算出来的下一步唯一。**
>
> **EN**: The logic by which one run advances from each step to the next, expressed
> as a **pure function**: the next step is computed from the session log and the
> current conditions, **never from anything living inside a process**. The same log
> and the same conditions always yield the same next step.

- **出处**：[PF-012 §4 Agent Loop](../../product/PF-012-agent-loop-and-run/design.md#agent-loop)（rev 2）
- **别混 ①**：**不是 [Run](#ul-run--运行--run)**——Run 是那次运行本身，Agent Loop 是推进它的那套逻辑
- **别混 ②**：**不是那个 while 循环**——循环是实现的形状；**这里说的是那个函数**
- **注意**：**「状态转移方程」是它的另一种说法**（产品负责人 2026-09-17 原话），两者不是两个概念

### UL-agent-step · agent 的一步 · Agent Step

> **中**：[Agent Loop](#ul-agent-loop--agent-loop--agent-loop) 转一圈：
> **看到处境 → 决定做什么 → 做 → 看到结果**。
> 一次[运行](#ul-run--运行--run)由一步接一步构成；**一步之内至多一次[模型调用](execution-and-outcome.md#ul-model-call--一次模型调用--model-call)，
> 以及由它带出来的若干次[工具执行](execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)**。
>
> **EN**: One turn of the agent loop — see the situation, decide what to do, do it,
> see the result. A run is made of one step after another; within a single step
> there is **at most one model call**, plus whatever tool executions it calls for.

- **出处**：[PF-012 §5.4](../../product/PF-012-agent-loop-and-run/design.md#54-一步的骨架)（rev 2）
- **别混**：**不是一次[模型调用](execution-and-outcome.md#ul-model-call--一次模型调用--model-call)**——
  模型调用是它**里面**的一段，两者差着一层
- **注意**：它是 [PF-011 那棵树上的一层](../../product/PF-011-off-nominal-handling/design.md#53-层的顺序不是排出来的是推出来的)，
  父节点是[运行](#ul-run--运行--run)

### UL-current-conditions · 当下条件 · Current Conditions

> **中**：算下一步时，**[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)之外**
> 还要看的那些**此刻才成立**的事实——[当下可用性](reach-and-availability.md#ul-current-availability--当下可用性--current-availability)、
> 这一次用哪个模型、以及[注入](#ul-runtime-injection--运行时注入--runtime-injection)进来的那些。
> **它不落日志，每次重算。**
>
> **EN**: The facts that hold **only at this moment** and must be consulted, besides
> the session log, to compute the next step — current availability, which model this
> request uses, and whatever has been injected. **It is never written to the log; it
> is recomputed every time.**

- **出处**：[PF-012 §4 当下条件](../../product/PF-012-agent-loop-and-run/design.md#当下条件)（rev 2）
- **别混**：**不是[记录条目](record-and-context.md#ul-record-entry--记录条目--record-entry)**——
  条目是发生过的事，写下就不再改变；当下条件是此刻算出来的，**不留存**
- **注意**：**它变了，同一份日志会算出不同的下一步**——这不动摇
  [Agent Loop](#ul-agent-loop--agent-loop--agent-loop) 的纯函数性质

### UL-loop-extension-point · Loop 拓展点 · Loop Extension Point

> **中**：[Agent Loop](#ul-agent-loop--agent-loop--agent-loop) 上一个开放的位置，
> **挂在某个[状态点](../../product/PF-012-agent-loop-and-run/design.md#53-改日志的动作与纯派生的动作)的紧前或紧后**。
> **它按自己相对哪个状态点命名，不按挂在那儿的功能命名**——
> **同一个位置可以挂多个[拓展件](capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)，各干各的。**
>
> **EN**: An open position on the agent loop, sitting **immediately before or
> immediately after one state point**. **It is named by which state point it sits
> against, never by what is attached there** — **several extensions may occupy the
> same position, each doing its own thing.**

- **出处**：[PF-012 §4 Loop 拓展点](../../product/PF-012-agent-loop-and-run/design.md#loop-拓展点) · [§5.8](../../product/PF-012-agent-loop-and-run/design.md#58-loop-拓展点)（rev 3）
- **⚠️ 别混**：**它不是[拓展件](capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)**——
  **拓展点是位置，拓展件是挂上去的东西**（第八类资产）
- **注意 ①**：**位置由状态点推出，因此数目有限且可穷举**——
  [当前恰好十一个](../../product/PF-012-agent-loop-and-run/design.md#十一个位置是推出来的不是挑出来的)；**挂什么没有上限**
- **注意 ②**：**纯派生的动作不是状态点，所以它前后没有位置**——
  [组装](record-and-context.md#ul-context-assembly--上下文组装--context-assembly)与「量一量」都不构成挂点
- **注意 ③**：挂在这里的东西**只能靠改[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)起作用**，
  **不改方程本身**

## 装出一副身子

> **三个时刻**：**装配时**定构成，**注入变化时**定处境，**请求时**定这一次。
> 见 [PF-004 §5.3](../../product/PF-004-agent-runtime-assembly-and-liveness/design.md#53-三个时刻)。
> **中间那一列是这套模型的关键**——没有它，任何环境或权限的变化都只能靠重建来生效，
> 而重建会打断正在进行的工作。

### UL-agent-assembly · Agent 装配 · Agent Assembly

> **中**：**把一份定义，在某个作用域下，变成一个[运行实例](#ul-agent-instance--运行实例--agent-instance)的动作。**
> 它回答：这一次**装哪些工具、带哪些技能、落在什么执行环境上、系统提示词由哪些成分构成**。
> **有确定的发生时刻，不是一个持续的过程**；输入是两样——依据的**定义版本**，
> 加上当时该作用域的**[求值](scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation)结果**。
>
> **EN**: **The act of turning a definition, under a given scope, into a running
> instance.** It settles which tools are loaded, which skills are carried, which
> execution environments are landed on, and what the system prompt is made of. **It
> happens at a definite moment; it is not an ongoing process.** Its inputs are two:
> the **definition version** it follows, and the **evaluation result** for that scope
> at that time.

- **出处**：[PF-004 §4 装配](../../product/PF-004-agent-runtime-assembly-and-liveness/design.md#装配) · [PF-002 §5.6](../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算)（rev 3 / rev 2）
- **别混**：**裸写「装配 / assembly」在跨领域的文字里不作数**——它专指把 agent 定义变成实例的这个动作
- **注意**：**求值必须在装配之前**——**组装只能从「可用的」里面装**

### UL-agent-instance · 运行实例 · Agent Instance

> **中**：**一次装配的产物：一副真正在跑的身子。**它持有这一次的构成，
> 并**占用实际的计算资源**——占用即消耗，闲置就该回收。
> 它**可回收、可重建**：回收之后，**会话还在、历史还在、认定的定义还在**。
>
> **EN**: **The product of one assembly: a body actually running.** It holds this
> round's constitution and **consumes real compute** — to hold it is to spend it, and
> an idle one should be reclaimed. It is **reclaimable and rebuildable**: after
> reclamation **the session, the history and the agreed definition all remain**.

- **出处**：[PF-004 §4 运行实例](../../product/PF-004-agent-runtime-assembly-and-liveness/design.md#运行实例)（rev 3）
- **别混**：**会话是长期的，运行实例是可回收的，一次运行是短暂的**——三者都不同。
  **同一个会话的两轮运行，可能跑在两个不同的运行实例上**
- **注意 ①**：它附着在**恰好一个会话**上；成本算**启动它的那个租户**
- **注意 ②**：**同一时刻，一个会话至多一个活跃的它**——见[会话内单活跃](#ul-single-active-execution--会话内单活跃--single-active-execution)

### UL-assembly-manifest · 装配清单 · Assembly Manifest

> **中**：**这一次装配实际用了什么的记录**，是一个**对象**，不是过程的副产品。
> 理由只有一条：**「当时那个 agent 是什么样」，答案只能在这里。**
> **只可追加，不可改写**——运行中装上新东西是**加一条**，不是改既有条目。
>
> **EN**: **The record of what a given assembly actually used** — an object in its own
> right, not a by-product of the process. There is exactly one reason for it: **"what
> that agent was at the time" can be answered nowhere else.** It is **append-only**:
> loading something new mid-run **adds** an entry, it never edits one.

- **出处**：[PF-004 §4 装配清单](../../product/PF-004-agent-runtime-assembly-and-liveness/design.md#装配清单)（rev 3）

## 外面递进来的

### UL-runtime-injection · 运行时注入 · Runtime Injection

> **中**：**一样东西不是运行实例自带的，而是外面给它的；给的内容变了，运行实例不用重建。**
> **上下文、执行环境、权限，三者都是这样进来的。**
>
> **EN**: **Something an instance does not carry itself but is handed in from outside;
> when what is handed in changes, the instance need not be rebuilt.** **Context,
> execution environment and permissions all arrive this way.**

- **出处**：[PF-004 §4 注入](../../product/PF-004-agent-runtime-assembly-and-liveness/design.md#注入)（rev 3）
- **别混**：**不是依赖注入**（DI）。那是技术设计里的容器机制；**裸写「注入」不作数**
- **注意**：与[实例构成](capabilities-and-composition.md#ul-instance-constitution--实例构成--instance-constitution)的分界是一句话：
  **这个变化改变的是「它是什么」，还是「它处在什么情况下」？**

### UL-incremental-loading · 增量装载 · Incremental Loading

> **中**：**运行中往实例里新增一个可选能力**，包括 agent 自己造出来的。
> **不重建实例**，在[装配清单](#ul-assembly-manifest--装配清单--assembly-manifest)上追加一条。
> 与「**把它正在用的必需绑定换掉**」是两回事——后者要走[退役](#ul-instance-retirement--实例退役--instance-retirement)重建。
>
> **EN**: **Adding an optional capability to a running instance mid-run**, including one
> the agent produced itself. **No rebuild**: an entry is appended to the assembly
> manifest. A different matter from **replacing a required binding already in use**,
> which goes through retire-and-rebuild.

- **出处**：[PF-004 §6.3](../../product/PF-004-agent-runtime-assembly-and-liveness/design.md#63-三类变化三种传播) · [§5.3](../../product/PF-004-agent-runtime-assembly-and-liveness/design.md#53-三个时刻)（rev 3）
- **注意**：**两条路殊途同归**——热装不了就退役重建，**[动作空间](capabilities-and-composition.md#ul-action-space--动作空间--action-space)照样由构成决定**

## 怎么没

> **停止有两级，代价不同。**

### UL-instance-retirement · 实例退役 · Instance Retirement

> **中**：回收一个运行实例的**显式动作**：**先不再接新工作，等手上的事真正停当，再释放资源。**
> **不是「没人用就自己没了」**——未结算的工作、未释放的资源、未交代的失败，
> **都必须在退役过程里有结果**。
>
> **EN**: The **explicit** act of reclaiming a running instance: **stop taking new
> work, wait until what is in hand has genuinely settled, then release the
> resources.** **Not "it just disappears when nobody uses it"** — unsettled work,
> unreleased resources and unreported failures **must each reach an outcome** during
> retirement.

- **出处**：[PF-004 §6.7](../../product/PF-004-agent-runtime-assembly-and-liveness/design.md#67-运行实例的生与灭) · [§6.8](../../product/PF-004-agent-runtime-assembly-and-liveness/design.md#68-停止有两级)（rev 3）
- **注意**：**等人回话时运行实例可以被回收**——**等待是一个持久的事实，不是一副身子的姿势**。
  实例没了，**会话还在**

### UL-forced-stop · 强制停止 · Forced Stop

> **中**：**立刻撤销继续执行的资格。**快，但**已经发出去的外部效果收不回来**。
> 因此它的反馈必须把**逻辑停止、实际停止、外部效果**三者**分别说清**。
>
> **EN**: **Immediately revoking the right to continue executing.** Fast, but
> **external effects already emitted cannot be recalled**. Its report must therefore
> state **logical stop, actual stop and external effects separately**.

- **出处**：[PF-004 §6.8 停止有两级](../../product/PF-004-agent-runtime-assembly-and-liveness/design.md#68-停止有两级)（rev 3）
- **别混 ①**：**「已经停止」与「外部效果已经撤销」不是一回事**
- **别混 ②**：与[撤销不等于强制停止](circulation-and-entitlement.md#ul-revocation-is-not-stop--撤销不等于强制停止--revocation-is-not-a-stop)那一条配着读——
  **撤权管的是下一道准入，这个管的是正在跑的**

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
