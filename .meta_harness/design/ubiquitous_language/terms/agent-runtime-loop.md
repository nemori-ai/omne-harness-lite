# Agent 运行时闭环

**这一卷回答：一段协作怎么从触发走到收束，又怎么回到会话。**

```text
        ┌────────── 会话（纯数据、治理边界，跨多次运行存活）──────────┐
        │                                                              │
   触发 ─→ 运行 ──→ 装配 ──→ 装配清单 ──→ agent runtime ──→ 收束      │
        │          （求值）  （数据，可复用）  （协程，一次尝试一个）  │
        │                            ↑                                 │
        │            注入：上下文 / 执行环境 / 权限                    │
        │                                                              │
        └── 协程没了，会话还在：记录、授权、成本、血缘都留在这一层 ────┘
```

> **这一卷里只有一样东西是「活的」：[agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)。**
> 会话与运行是**治理概念**，装配是**一个动作**，清单是**那个动作的求值结果**——
> 三者都不占用计算资源，也都不会「停下来」。

**收在这里的是这个闭环上的每一环**，以及它们各自的归属。
**agent 由什么构成**归[能力与构成](capabilities-and-composition.md)，
**动作落到哪里**归[落地与隔离](grounding-and-isolation.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

> **本卷有七条不归任何一个 topic**——它们是跨全链的治理概念，由产品负责人直接裁决：
>
> - [会话](#ul-session--会话--session) · [运行](#ul-run--运行--run) · [触发](#ul-trigger--触发--trigger) ·
>   [执行尝试](#ul-run-attempt--执行尝试--run-attempt) · [会话内单活跃](#ul-single-active-execution--会话内单活跃--single-active-execution)
>   → [UL-D-1](../decisions.md#ul-d-1--会话与运行--2026-09-18)
> - [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime) ·
>   [取消跟着宿主走](#ul-cancellation-follows-host--取消跟着宿主走--cancellation-follows-host)
>   → [UL-D-3](../decisions.md#ul-d-3--runtime-与活体--2026-09-20)

## 这一卷最硬的一条

### UL-single-active-execution · 会话内单活跃 · Single Active Execution

> **中**：**一个会话，在同一时刻，至多有一个活跃的[运行](#ul-run--运行--run)，
> 也至多有一个活跃的 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)。**
> 「同时还有别的事在后台跑」不违反它——那是**同一个运行内部**的事。
>
> **EN**: **Within one session, at any moment, there is at most one active run and at
> most one active agent runtime.** Work continuing in the background does not
> violate this — that belongs **inside** the one active run.

- **出处**：[UL-D-1 裁决 2](../decisions.md#定死了什么)（产品负责人 2026-09-18 直接裁决）；
  **主语于 2026-09-20 由「agent runtime」换成 agent runtime**，见 [UL-D-3](../decisions.md#ul-d-3--runtime-与活体--2026-09-20)
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
- **注意 ②**：**它比 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime) 长寿**——
  协程可被取消、可重新起，没了之后**会话还在、历史还在、认定的定义还在**。
  **它自己不是活物**：它是纯数据、治理性质的概念，不占用计算资源，也不会「停下来」
- **注意 ③**：**它有终态，而且必须有**——PF-005 的沙箱销毁与 PF-007 的授权消失
  全都挂在「会话结束」这个事实上。**具体有哪几种终态，尚未拍板**

### UL-run · 运行 · Run

> **中**：**一次逻辑上的执行请求及其结果**，是**成本、失败与收束的归属单位**。
> 它附着在**恰好一个会话**上，**边界由 [Agent Loop](#ul-agent-loop--agent-loop--agent-loop) 的进出划定**——
> **进去的那一刻开始，出来的那一刻结束**；而退不退出，只看
> **[待处理消息队列](#ul-pending-message-queue--待处理消息队列--pending-message-queue)空不空**。
> 中间想了几轮、调了几次工具、转没转后台，**都是它内部的事**。
>
> **EN**: **One logical request to execute, together with its outcome** — the unit to
> which cost, failure and conclusion are attributed. It attaches to **exactly one
> session**; its **boundary is drawn by entering and leaving the agent loop**, and
> whether the loop leaves depends only on **whether the pending message queue is
> empty**. How many turns of thinking, how many tool calls, whether anything moved to
> the background — **all of that is internal to it**.

- **出处**：[UL-D-1](../decisions.md#ul-d-1--会话与运行--2026-09-18)（产品负责人 2026-09-18 直接裁决，定义由 PM 起草）；
  **边界那一句来自 2026-09-20 的裁决**，见 [PF-012 §4 Run](../../product/PF-012-agent-loop-and-run/design.md#run)（rev 4）
- **别混 ⓪**：**它是纯粹的逻辑概念**。「一次 Run」不对应任何一段进程、一个连接或一次请求——
  **换一个 agent runtime 接着跑，还是这一个**；**队列没空就退不出去，哪怕模型已经没话说了**
- **别混 ①**：**它是逻辑的，不是物理的**——一次 Run 可能经历多次[执行尝试](#ul-run-attempt--执行尝试--run-attempt)。
  **「重跑一次」与「同一次跑的第二次尝试」必须分得开**，否则成本与失败都算错
- **别混 ②**：Run 的**收束**与[一次工具执行的收场](../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)**不是一回事**——
  后者是工具那一层的六种，**粒度差着好几层**。**裸写「收场」不作数**
- **注意 ①**：**它不拥有记录**——它往会话的日志里写，**日志归会话**
- **注意 ②**：**它不拥有执行体**——推进它的是 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)，
  而**一次 Run 可能先后由好几个协程推进**（每次[尝试](#ul-run-attempt--执行尝试--run-attempt)一个）
- **注意 ③**：**怎么被驱动、怎么推进、怎么收束、怎么中断**，归
  [PF-012](../../product/PF-012-agent-loop-and-run/README.md)；本条只定**它是什么、边界在哪**

### UL-trigger · 触发 · Trigger

> **中**：**一次[运行](#ul-run--运行--run)的起点**——精确地说，
> **让[待处理消息队列](#ul-pending-message-queue--待处理消息队列--pending-message-queue)从空变成非空的那件事**。
> 它**不必是人说了一句话**：定时到点、外部消息经[连接件](capabilities-and-composition.md#ul-connector--连接件--connector)送达、
> 一次后台执行交回结果、别的会话捎来一句，**都是触发**。
>
> **EN**: **The starting point of a run** — precisely, **whatever takes the pending
> message queue from empty to non-empty**. It need not be a person speaking: a schedule
> reaching its time, an inbound message arriving through a connector, a background
> execution returning its result, or another session sending word are all triggers.

- **出处**：[UL-D-1](../decisions.md#ul-d-1--会话与运行--2026-09-18)（PM 起草）；
  **「队列从空变非空」这个精确形式来自 2026-09-20 的裁决**，
  见 [PF-012 §4 Run](../../product/PF-012-agent-loop-and-run/design.md#run)（rev 4）
- **别混 ①**：**裸写「触发」作动词时不是术语**——这里指的是**那个起点本身**，它是一个可被记录、可被归因的事实
- **别混 ②**：**它与「收束」不是两个独立的概念，是同一条规则的两端**——
  收束就是**队列重新变空**。**所以不存在一张「触发有哪几种」的独立清单**，
  要穷举的是**什么东西会进队列**，那归 [PF-014](../../product/PF-014-inbound-intake-and-queueing/README.md)
- **注意**：**队列非空时到达的东西不另起一次触发**——它被**当前这个运行**消费掉。
  **同一句话，在运行跑着时是追加，在它收束之后是触发**，差别不在那句话身上

### UL-pending-message-queue · 待处理消息队列 · Pending Message Queue

> **中**：**一个[会话](#ul-session--会话--session)里，已经落进[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)、
> 但还没有被 [Agent Loop](#ul-agent-loop--agent-loop--agent-loop) 取走过的那些[消息](record-and-context.md#ul-message--消息--message)。**
> **它不是另一份存储，是会话日志的一个投影**——「哪些还没被取走」从日志本身就算得出来。
> **默认按到达先后取**，唯一的例外是[插队](interaction-and-dispatch.md#ul-queue-jump--插队--queue-jump)。
>
> **EN**: **Within one session, the messages that have landed in the session log but
> have not yet been taken by the agent loop.** It is **not a second store but a
> projection of the log** — which messages remain unconsumed is derivable from the log
> itself. Messages are taken **in arrival order**, the sole exception being a queue jump.

- **出处**：[PF-012 §4 待处理消息队列](../../product/PF-012-agent-loop-and-run/design.md#待处理消息队列)（rev 4）
- **别混 ①**：**它不是一个收件箱。**收件箱是东西送到的地方，
  **而这里的每一项都已经是日志里的一条消息了**——[到达要先被受理并落账](interaction-and-dispatch.md#ul-inbound-arrival--入站到达--inbound-arrival)，才谈得上排队
- **别混 ②**：**[控制指令](interaction-and-dispatch.md#ul-control-command--控制指令--control-command)不进这个队列**——
  它是处置不是内容，**即时生效**
- **注意 ①**：**它决定[运行](#ul-run--运行--run)退不退出**：非空就接着消费，空了才收束。
  **「模型没话说了」不等于做完了**
- **注意 ②**：**投影这个形状不是实现取舍，是被两条规矩逼出来的**——
  [组装是纯派生的](#ul-agent-loop--agent-loop--agent-loop)（另存一份就会被组装取空），
  且**停机是主路径的一部分**（攒在内存里一次重启就丢）
- **注意 ③**：**什么东西会进来、怎么受理、一次取几条**，归
  [PF-014](../../product/PF-014-inbound-intake-and-queueing/README.md)；本条只定**它是什么**

### UL-run-attempt · 执行尝试 · Run Attempt

> **中**：**同一次[运行](#ul-run--运行--run)的一次实际执行**，
> 也就是**为这次运行起的一个 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)，从起到灭的那一段**。
> 重试、崩溃后恢复，各是一次尝试——**它们属于同一个 Run，不是另外的 Run**。
> **Run 是治理身份，尝试是执行细节。**
>
> **EN**: **One actual execution of the same run** — that is, **one agent runtime
> started for it, from birth to death**. A retry or a recovery after a crash is each
> an attempt, and **they all belong to the same run rather than constituting further
> runs**. **The run is the governance identity; the attempt is an execution detail.**

- **出处**：[UL-D-1 的推理链](../decisions.md#定义正文是-pm-起草的依据在这里)（PM 起草；与前身系统「logical Run / physical attempt」同构）；
  **与 agent runtime 的对应关系于 2026-09-20 写明**，见 [UL-D-3](../decisions.md#ul-d-3--runtime-与活体--2026-09-20)
- **别混**：**不是第二个执行体**——执行体只有一个，就是 agent runtime 。
  **这一条是「从 Run 的角度看它」**：同一个协程，站在治理那一侧叫「这次运行的第几次尝试」
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
- **别混 ②**：**不是 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)**——
  **这一条是被求值的那个函数，那一条是求值它的那个协程**。
  函数没有寿命，协程有；**函数算不坏，协程会被取消**
- **注意**：**「状态转移方程」是它的另一种说法**（产品负责人 2026-09-17 原话），两者不是两个概念

### UL-agent-runtime · agent runtime · Agent Runtime

> **中**：**反复求值 [Agent Loop](#ul-agent-loop--agent-loop--agent-loop)、把一次[运行](#ul-run--运行--run)往前推的那个协程。**
> 它有独立的执行上下文，能在 await 点挂起与恢复，**能被独立取消**，有自己的生命周期。
> 它**持有[待处理消息队列](#ul-pending-message-queue--待处理消息队列--pending-message-queue)并循环取用**，
> 因此是全系统**唯一的 event loop**。
> **它不持有状态**：状态在[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)里，
> 它没了，日志还在。
>
> **EN**: **The coroutine that repeatedly evaluates the agent loop to drive one run
> forward.** It has its own execution context, suspends and resumes at await points,
> **can be cancelled independently**, and has a lifetime of its own. It **holds the
> pending message queue and consumes from it in a loop**, making it the **only event
> loop in the system**. **It holds no state**: state lives in the session log, and
> the log outlives it.

- **出处**：[UL-D-3](../decisions.md#ul-d-3--runtime-与活体--2026-09-20)（产品负责人 2026-09-20 直接裁决）
- **它就是 [SYS-COMPOSITION](../../foundation/definition-and-runtime-composition/requirements.md#sys-compositionc1三段结构) 说的「活体」**——
  那一段描述的计算资源、可回收可重建、因资源治理而生灭，**逐条说的都是协程**
- **注意 ①**：**一次起一个，[一个会话同时至多一个](#ul-single-active-execution--会话内单活跃--single-active-execution)**；
  从 Run 的角度看，它的一生就是[一次执行尝试](#ul-run-attempt--执行尝试--run-attempt)
- **注意 ②**：**它按[装配清单](#ul-assembly-manifest--装配清单--assembly-manifest)起，但不等于清单**——
  清单是数据、可跨多次尝试复用；协程每次重新起
- **注意 ③**：**它是[模型请求运行时](execution-and-outcome.md#ul-model-call--一次模型调用--model-call)
  与前台[工具执行运行时](execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)的宿主**——
  见[宿主决定谁跟着谁死](#ul-cancellation-follows-host--取消跟着宿主走--cancellation-follows-host)

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

## 算出一份构成

> **三个时刻**：**装配时**定构成，**注入变化时**定处境，**请求时**定这一次。
> 见 [PF-004 §5.3](../../product/PF-004-agent-definition-and-assembly/design.md#53-三个时刻)。
> **中间那一列是这套模型的关键**——没有它，任何环境或权限的变化都只能靠重建来生效，
> 而重建会打断正在进行的工作。
>
> **这一节里没有活物。**装配是动作，清单是数据；
> 拿清单起协程是[另一件事](#ul-agent-runtime--agent-runtime--agent-runtime)。

### UL-agent-assembly · Agent 装配 · Agent Assembly

> **中**：**把一份定义，在某个作用域下，求值成一份[装配清单](#ul-assembly-manifest--装配清单--assembly-manifest)的动作。**
> 它回答：这一次**装哪些工具、带哪些技能、需要哪几类执行环境、系统提示词由哪些成分构成**。
> **有确定的发生时刻，不是一个持续的过程**；输入是两样——依据的**定义版本**，
> 加上当时该作用域的**[求值](scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation)结果**。
>
> **EN**: **The act of evaluating a definition, under a given scope, into an assembly
> manifest.** It settles which tools are loaded, which skills are carried, which
> classes of execution environment are needed, and what the system prompt is made of.
> **It happens at a definite moment; it is not an ongoing process.** Its inputs are
> two: the **definition version** it follows, and the **evaluation result** for that
> scope at that time.

- **出处**：[PF-004 §4 装配](../../product/PF-004-agent-definition-and-assembly/design.md#装配) · [PF-002 §5.6](../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算)（rev 4 / rev 2）
- **别混 ①**：**裸写「装配 / assembly」在跨领域的文字里不作数**——它专指把 agent 定义求值成清单的这个动作
- **别混 ②**：**它的产物不是一个活物**——
  **2026-09-20 之前本条写的是「变成一个运行实例」，那个说法已退役**，见 [UL-D-3](../decisions.md#ul-d-3--runtime-与活体--2026-09-20)
- **注意**：**求值必须在装配之前**——**组装只能从「可用的」里面装**

### UL-assembly-manifest · 装配清单 · Assembly Manifest

> **中**：**一次[装配](#ul-agent-assembly--agent-装配--agent-assembly)求值出来的那份构成**，
> 是一个**对象**，不是过程的副产品。它是**数据**：不占用计算资源，不会「停下来」，
> **可以跨多次[执行尝试](#ul-run-attempt--执行尝试--run-attempt)复用**，不必每次重新求值。
> 理由只有一条：**「当时那个 agent 是什么样」，答案只能在这里。**
> **只可追加，不可改写**——运行中装上新东西是**加一条**，不是改既有条目。
>
> **EN**: **The constitution evaluated out by one assembly** — an object in its own
> right, not a by-product of the process. It is **data**: it consumes no compute, it
> never "stops", and it **can be reused across attempts** rather than re-evaluated
> each time. There is exactly one reason for it: **"what that agent was at the time"
> can be answered nowhere else.** It is **append-only**: loading something new
> mid-run **adds** an entry, it never edits one.

- **出处**：[PF-004 §4 装配清单](../../product/PF-004-agent-definition-and-assembly/design.md#装配清单)（rev 4）
- **别混**：**不是 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)**——
  **清单是照着起协程的那份图纸，协程是照它起来的那个东西**。
  复用清单**不等于**复用协程：协程每次尝试都是新的
- **注意**：**它不承载能力的持久性**。一个运行中装上的能力明天还在不在，
  归那个能力自己作为资产的存续，不归这份清单

## 外面递进来的

### UL-runtime-injection · 运行时注入 · Runtime Injection

> **中**：**一样东西不是[装配清单](#ul-assembly-manifest--装配清单--assembly-manifest)里定死的，
> 而是外面递给正在跑的那个协程的；递进来的内容变了，
> 清单不用重新求值，[协程](#ul-agent-runtime--agent-runtime--agent-runtime)也不用重起。**
> **上下文、执行环境、权限，三者都是这样进来的。**
>
> **EN**: **Something not fixed in the assembly manifest but handed in from outside to
> the running coroutine; when what is handed in changes, the manifest need not be
> re-evaluated and the coroutine need not be restarted.** **Context, execution
> environment and permissions all arrive this way.**

- **出处**：[PF-004 §4 注入](../../product/PF-004-agent-definition-and-assembly/design.md#注入)（rev 4）
- **别混**：**不是依赖注入**（DI）。那是技术设计里的容器机制；**裸写「注入」不作数**
- **注意**：与[agent 构成](capabilities-and-composition.md#ul-agent-constitution--agent-构成--agent-constitution)的分界是一句话：
  **这个变化改变的是「它是什么」，还是「它处在什么情况下」？**

### UL-incremental-loading · 增量装载 · Incremental Loading

> **中**：**运行中新增一个可选能力**，包括 agent 自己造出来的。
> **不重新装配、协程也不重起**，在[装配清单](#ul-assembly-manifest--装配清单--assembly-manifest)上追加一条。
> 与「**把它正在用的必需绑定换掉**」是两回事——后者要走[优雅取消](#ul-graceful-cancellation--优雅取消--graceful-cancellation)再重来。
>
> **EN**: **Adding an optional capability mid-run**, including one the agent produced
> itself. **No re-assembly and no restart**: an entry is appended to the assembly
> manifest. A different matter from **replacing a required binding already in use**,
> which goes through graceful cancellation and a fresh start.

- **出处**：[PF-004 §6.3](../../product/PF-004-agent-definition-and-assembly/design.md#63-三类变化三种传播) · [§5.3](../../product/PF-004-agent-definition-and-assembly/design.md#53-三个时刻)（rev 4）
- **注意**：**两条路殊途同归**——热装不了就重新装配，**[动作空间](capabilities-and-composition.md#ul-action-space--动作空间--action-space)照样由构成决定**

## 怎么没

> **停止有两级，代价不同；而「谁跟着谁停」只有一条规则。**

### UL-cancellation-follows-host · 取消跟着宿主走 · Cancellation Follows Host

> **中**：**每一个运行时都有一个宿主，宿主没了它就没了。**
> [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime) 是
> **模型请求运行时**与**前台工具执行运行时**的宿主；
> [会话](#ul-session--会话--session)是**已转后台的工具执行运行时**的宿主，
> 也是它名下**子会话**的宿主。
> **转后台就是换宿主**——从 agent runtime 换到会话，从此中断这次运行不再波及它。
>
> **EN**: **Every runtime has a host; when the host is gone, so is it.** The agent
> runtime hosts the model request runtime and any foreground tool execution runtime;
> the session hosts tool execution runtimes that have moved to the background, and
> the sub-sessions under it. **Moving to the background is a change of host** — from
> the agent runtime to the session — after which cancelling that run no longer
> reaches it.

- **出处**：产品负责人 2026-09-20 直接裁决，见 [UL-D-3](../decisions.md#ul-d-3--runtime-与活体--2026-09-20)
- **它推出来的四条**（**不必分别记忆**，都是同一条规则）：

  | 谁 | 中断一次运行 | 终止 / 归档 / 回收会话 |
  |---|---|---|
  | 模型请求运行时 | **停**（它**不能**转后台，永远挂在 agent runtime 上） | 停 |
  | 前台工具执行运行时 | **停**，落[「被中断」](../../product/PF-006-tools-and-skills/design.md#67-用户可以中断而中断不是失败) | 停 |
  | **已转后台**的工具执行运行时 | **不停** | **停** |
  | `spawn` / `delegate` 出去的子会话及其名下一切 | 不停 | **停**（**递归**） |

- **注意**：**`handoff` 出去的不在递归范围内**——
  [它有独立主会话身份](../../product/PF-007-meta-capabilities/design.md)，已经不挂在派发者名下了

### UL-graceful-cancellation · 优雅取消 · Graceful Cancellation

> **中**：结束一个运行时的**显式动作**：**先不再接新工作，等手上的事真正停当，再释放资源。**
> **不是「没人用就自己没了」**——未结算的工作、未释放的资源、未交代的失败，
> **都必须在这个过程里有结果**。
>
> **EN**: The **explicit** act of ending a runtime: **stop taking new work, wait until
> what is in hand has genuinely settled, then release the resources.** **Not "it just
> disappears when nobody uses it"** — unsettled work, unreleased resources and
> unreported failures **must each reach an outcome** in the process.

- **出处**：[PF-012 §6.13](../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走) · [§6.14](../../product/PF-012-agent-loop-and-run/design.md#614-停止有两级)（rev 5）
- **弃用的说法**：**「实例退役 / Instance Retirement」**——
  2026-09-20 之前的名字，主语是已退役的「运行实例」，见 [UL-D-3](../decisions.md#ul-d-3--runtime-与活体--2026-09-20)
- **注意**：**等人回话时 agent runtime 可以被取消**——**等待是一个持久的事实，不是一个协程的姿势**。
  协程没了，**会话还在**

### UL-forced-stop · 强制停止 · Forced Stop

> **中**：**立刻撤销继续执行的资格。**快，但**已经发出去的外部效果收不回来**。
> 因此它的反馈必须把**逻辑停止、实际停止、外部效果**三者**分别说清**。
>
> **EN**: **Immediately revoking the right to continue executing.** Fast, but
> **external effects already emitted cannot be recalled**. Its report must therefore
> state **logical stop, actual stop and external effects separately**.

- **出处**：[PF-012 §6.14 停止有两级](../../product/PF-012-agent-loop-and-run/design.md#614-停止有两级)（rev 5）
- **别混 ①**：**「已经停止」与「外部效果已经撤销」不是一回事**
- **别混 ②**：与[撤销不等于强制停止](circulation-and-entitlement.md#ul-revocation-is-not-stop--撤销不等于强制停止--revocation-is-not-a-stop)那一条配着读——
  **撤权管的是下一道准入，这个管的是正在跑的**
- **注意**：**它与[优雅取消](#ul-graceful-cancellation--优雅取消--graceful-cancellation)是同一件事的两级**，
  **传播范围则一样**——都照[取消跟着宿主走](#ul-cancellation-follows-host--取消跟着宿主走--cancellation-follows-host)

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
