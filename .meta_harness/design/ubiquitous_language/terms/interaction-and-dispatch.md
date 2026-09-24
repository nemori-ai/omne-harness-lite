# 交互与派发

**这一卷回答：agent 跟人、跟别的 agent 怎么来往，外面的东西怎么进到一个会话里，
以及人从哪一面碰到这个系统。**

收在这里的是**跨主体的往来**及其产物，以及**那些往来发生在哪一面、以什么形式交出去**。
**跟工具怎么来往**归[执行与收场](execution-and-outcome.md)——那是自己的手脚，不是别的主体；
**那一面背后的事实存在哪一处**归[落地与隔离](grounding-and-isolation.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

## 跟别的 agent

### UL-agent-dispatch · agent 派发 · Agent Dispatch

> **中**：**把一件事交给另一个 agent 去做。**三种模式，**五个维度上取值不同**：
>
> | | **`spawn`** | **`delegate`** | **`handoff`** |
> |---|---|---|---|
> | **是不是独立主会话** | 否 | 否 | **是** |
> | **上下文怎么组装** | **派发那一刻组装出来的那份上下文的副本** | 一段 instruction | 一段 handoff 说明 |
> | **生命周期受谁控制** | 派发者 | 派发者 | **不受派发者控制** |
> | **派发动作何时结束** | 进[工具等待态](execution-and-outcome.md#ul-tool-wait-state--工具等待态--tool-wait-state)待[报告](#ul-dispatch-report--派发报告--dispatch-report)或失败 | 同左 | **确认会话建没建起来即结束** |
> | **能跟谁[通信](#ul-inter-agent-communication--agent-间通信--inter-agent-communication)** | 只跟派发者 | 只跟派发者 | **派发者，外加规则二够得着的全部** |
>
> **EN**: **Handing a piece of work to another agent.** Three modes, differing on
> five dimensions: whether it is an independent primary session, how its context is
> assembled, who controls its lifecycle, when the dispatching action ends, and
> whom it can communicate with.

- **形态**：过程
- **出处**：[PF-007 §6.8 派发有三种模式](../../product/PF-007-meta-capabilities/design.md#派发有三种模式)（rev 16）
- **注意 ①**：**两处分水岭，各自只有一条。**`spawn` 与 `delegate` 只差
  「**它带着什么开始干活**」——**一个带副本加交代，一个只带交代**；
  `spawn`/`delegate` 与 `handoff` 只差
  「**是不是独立主会话**」——**另外三个维度全是这一条的后果**
- **注意 ②**：**`handoff` 撤不回。**这不是缺陷，是它的定义——**一个能被撤回的 `handoff`，那是 `delegate`**
- **注意 ③**：**可以派给外部 harness 的 agent**，但那时**权限继承无从谈起、数据出境、
  监管取决于对方、回来的是外部内容**——因此**必须是一项显式授予的权限**
- **注意 ④**：**「是不是独立主会话」这条分水岭还有另一个侧面——谁产生[子 agent](#ul-subagent--子-agent--subagent)。**
  `spawn`/`delegate` 产生，`handoff` 不产生。**这不是第六个维度**，两者在三种模式上取值一一对应
- **注意 ⑤**：**`spawn` 交出去的是[副本，不是同一本账](../../product/PF-007-meta-capabilities/design.md#两处分水岭各自只有一条)**——
  那份副本是子会话日志里的**起始输入记录**，**父的日志不被指向、不被拷贝**；
  **派发之后父这边发生的事，子看不见**

### UL-subagent · 子 agent · Subagent

> **中**：**会话是当前会话之子会话的那个 agent。**[`spawn` 与 `delegate`](#ul-agent-dispatch--agent-派发--agent-dispatch) 派出去的是它；
> **`handoff` 派出去的不是**（那个有独立主会话身份），**第三方 harness 上的会话也不是**。
> **它的会话不因交回[报告](#ul-dispatch-report--派发报告--dispatch-report)而被归档**——
> 报告终结的是**那次派发**。
>
> **EN**: An agent whose session is a **child session** of the current one. `spawn`
> and `delegate` produce one; `handoff` does not — that one holds an independent
> primary session — and neither does a session on a third-party harness. **Its
> session is not archived when it hands back a report**: the report concludes the
> dispatch, not the session.

- **形态**：属性
- **出处**：[PF-007 §6.8 两处分水岭，各自只有一条](../../product/PF-007-meta-capabilities/design.md#两处分水岭各自只有一条) ·
  [§6.8 报告终结的是这次派发，不是那个会话](../../product/PF-007-meta-capabilities/design.md#报告终结的是这次派发不是那个会话)（rev 16）
- **别混 ①**：与「**派发出去的 agent**」不是一回事——**后者含 `handoff`，它不含**。
  [规则一](#ul-inter-agent-communication--agent-间通信--inter-agent-communication)管的是前者，范围更大
- **别混 ②**：**与 [agent 类型](capabilities-and-composition.md#ul-agent-type--agent-类型--agent-type)不是一回事**——
  那是 **Agent 定义的一个属性**（`master` / `non-master`），说的是**这份定义带着哪套机制**；
  **本条说的是它此刻在派发关系里扮演什么角色**。
  **第二个取值特意不叫 `subagent`，就是为了不与本条撞名**（[C-14](../conflicts.md)）
- **注意 ①**：**它所在的那个会话就是[子会话](agent-runtime-loop.md#ul-child-session--子会话--child-session)**，
  内涵见该词条：由**创建**确立而非由历史确立，**不继承父会话的日志**
  （`spawn` 交出去的是[派发那一刻那份上下文的副本](../../product/PF-007-meta-capabilities/design.md#两处分水岭各自只有一条)，
  它是子会话自己日志里的**起始输入记录**），
  两边的**会话日志、投影与 runtime context 快照在存储上都不共享节点**
  （**那是存储约束，不是访问约束**——跨会话取数据照常经工具能力与租户权限进行）。
  **本条只定外延**——哪些算、哪些不算
- **注意 ②**：**它的通信拓扑是收窄的**——只能与**直接 parent**、
  或它自己再创建出的子会话的 agent 通信；**兄弟与隔代都不可**。
  其中子 → 父那一向由 [UL-D-4 裁决 7](../decisions.md#ul-d-4--主会话与子会话--2026-09-21) 放开
- **⚠️ 注意 ③**：**master 对自己全部 subagent 的感知与管理**仍归 **PF-015**

### UL-inter-agent-communication · agent 间通信 · Inter-Agent Communication

> **中**：**两条独立的规则，覆盖面不一样：**
>
> | | 规则 | 覆盖面 |
> |---|---|---|
> | **一** | agent 与**它派发出去的** agent 之间可以互发消息 | **两个方向都通**，**不问对方身份**，只问「是不是我派的」 |
> | **二** | **具备独立主会话身份的、会话仍活跃的、同属一个租户的** agents 相互可以通信 | **双向**，且**不要求有派发关系** |
>
> **两个素不相识的 agent 也能通**，只要规则二那三个条件都满足。
>
> **EN**: **Two independent rules with different reach.** First: an agent and **any agent
> it dispatched** may message **each other**, whatever the mode — this asks nothing about
> the recipient's identity, only whether the dispatch relationship exists. Second: agents
> that **hold an independent primary session, are still active, and belong to the same
> tenant** may communicate with one another — this is **bidirectional and requires no
> dispatch relationship**, so **two agents that never met can talk**.

- **形态**：规则
- **出处**：[PF-007 §6.8 先说谁能给谁发消息](../../product/PF-007-meta-capabilities/design.md#先说谁能给谁发消息这是两条独立的规则)（rev 16）
- **注意 ①**：**规则二那三个条件缺一不可**，「**会话仍活跃**」尤其容易被忽略——
  **一个会话已被归档的 agent，不是「暂时联系不上」，是这条通路不存在了**。
  **「活跃」就是「未被归档」**（[UL-D-4 裁决 8](../decisions.md#ul-d-4--主会话与子会话--2026-09-21)）——
  **没有删除会话的概念，也就没有「会话结束」这回事**
- **注意 ②**：**`handoff` 能向派发者发消息不是单独规定的一条**，
  是它**落进了规则二**的自然结果
- **注意 ③**：**发不出去时要说清是哪一条不满足**（不是我派的？没有主会话身份？会话已被归档？
  不同租户？）——**四种原因的处理方式完全不同**
- **注意 ④**：**规则一不带时间限定。**它的条件只有「是不是我派的」一项，
  所以**[子 agent](#ul-subagent--子-agent--subagent) 交回报告之后，这条通路依然成立**——
  [报告终结的是那次派发，不是那个会话](#ul-dispatch-report--派发报告--dispatch-report)。
  **⚠️ 但规则一没有规则二那样的「会话仍未被归档」条件**，因此
  **「对方会话已被归档时规则一还成不成立」仍然没有答案**。
  [归档会中断那边的模型响应与工具执行](../../product/PF-015-session-lifecycle-and-ownership/design.md#63-归档先停活儿再落状态)，
  所以问题是：**消息是没有接收者，还是进了那个会话等它被撤销归档**
- **注意 ⑤**：**规则一双向，覆盖的是[子 agent](#ul-subagent--子-agent--subagent) 向上
  「确认事实、澄清需求」那类话**（[UL-D-4 裁决 7](../decisions.md#ul-d-4--主会话与子会话--2026-09-21)）。
  **它不让兄弟之间通**——两个兄弟子 agent 彼此没有派发关系，规则一够不着；
  也都没有独立主会话身份，规则二够不着。**隔代同理**

### UL-dispatch-report · 派发报告 · Dispatch Report

> **中**：被派发的 agent **交回来的那一次交代**。**一次派发至多一份，它因此由那次派发指认**。
> 它与[消息](#ul-inter-agent-communication--agent-间通信--inter-agent-communication)是两样东西：
>
> | | 报告 | 消息 |
> |---|---|---|
> | 终结什么吗 | **终结这次派发** | **什么都不终结** |
> | 能来几次 | **一次** | 来回多少次都行 |
> | 派发者那边 | 等待态**结束**，工具调用返回 | 不影响任何正在等的东西 |
>
> **EN**: The single account a dispatched agent hands back — **at most one per dispatch,
> and identified by that dispatch**. It differs from a message
> on every count: **a report concludes the dispatch**, a message concludes nothing;
> **a report comes once**, messages any number of times.

- **形态**：对象
- **出处**：[PF-007 §6.8 报告与消息是两样东西](../../product/PF-007-meta-capabilities/design.md#报告与消息是两样东西)（rev 16）
- **⚠️ 它终结的是这次派发，不是那个会话。**[子 agent](#ul-subagent--子-agent--subagent) 交回报告之后，
  **它的会话不会因此被归档，而归档是会话唯一的出口**，派发者[照样发得出消息](#ul-inter-agent-communication--agent-间通信--inter-agent-communication)。
  **不点破这一条，就会被做成「报告一到就把那个会话收掉」——而且不报错**
- **注意**：**它与[消息](#ul-inter-agent-communication--agent-间通信--inter-agent-communication)是两样东西**，
  子 agent 两样都能用：**干到一半要确认事实、澄清需求，走消息**（什么都不终结，来回多少次都行）；
  **干完了必须交报告**（只有一次，一交这次派发就结束）。
  **混为一谈的代价是两头的**——把消息当报告，派发者以为活已干完；把报告当消息，那次派发永远不返回
- **注意**：发起方可以附上「**我期望报告长什么样**」，但那是**指引，不是校验**——
  写成硬校验，子就会为了通过校验而编造格式

## 跟人

### UL-hitl · 人在回路 · Human in the Loop

> **中**：**一次执行停下来等人输入，人不输入就一直等着。**三个词都要紧：
> **停下来**（不是轮询、不是重试，是真的停在那里）、
> **等人输入**（等的是人，不是等时间，也不是等别的系统）、
> **一直**（**没有上限**）。
>
> **EN**: **An execution pausing to await human input, and waiting indefinitely if
> none comes.** Each part matters: it **actually stops** (no polling, no retrying);
> what it waits for is **a person** — not a timeout, not another system; and it waits
> **indefinitely**, with **no upper bound**.

- **形态**：总称
- **出处**：[PF-008 §4 HITL](../../product/PF-008-human-in-the-loop/design.md#hitl)（rev 6）
- **⚠️ 注意**：**不设上限是硬的。**设了上限就必须规定「到点算什么」，
  **那就是系统替人作答**——而**「人没回答」与「人回答了随便」是两回事**
- **注意**：它**不占资源**——问询发生在动手之前，**不花钱的等待没有理由设上限**

### UL-run-wait-state · 运行等待态 · Run Wait State

> **中**：**一个[运行](agent-runtime-loop.md#ul-run--运行--run)停下来等一个输入。**
> 它由**系统自带的那件放行判断**、**或任何一件可否决的[拓展件](capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)**
> 经 loop 的[等待原语](agent-runtime-loop.md#ul-wait-primitive--等待原语--wait-primitive)引出，**直接把 run 停住**。
> 它与[工具等待态](execution-and-outcome.md#ul-tool-wait-state--工具等待态--tool-wait-state)
> **是两个维度，挂在不同的生命周期上**。
>
> **EN**: **A run pausing to await an input.** It is brought about **by the built-in
> release judgement or by any veto-capable loop extension** through the loop's wait
> primitive, and **stops the run outright**. It is **a dimension distinct from the tool
> wait state**, hanging off a different lifecycle.

- **形态**：状态
- **出处**：[PF-008 §4 等待态的两个维度](../../product/PF-008-human-in-the-loop/design.md#等待态的两个维度)（rev 6）
- **⚠️ 别混**：**裸写「等待态」不作数**——它有两个所指，**必须说清是 run 的还是工具的**
- **注意**：`Ask()` 属于**工具**那一列。run 之所以也停住，
  **是因为它恰好是前台调用**——**而不是因为这两个维度是同一件事**
- **注意**：**一个会话同一时刻最多一个 run 在等**——等待期间到达的消息进队列、
  由当前这个 run 在下一步消费，**不会另起一个 run**。
  这与[会话内单活跃](agent-runtime-loop.md#ul-single-active-execution--会话内单活跃--single-active-execution)是同一条
- **注意**：**同一个会话可以同时有别的东西在等**——那些转到后台的工具执行，
  **各等各的，也不影响 run**。**本版要等应答的执行只在前台等**，这一格暂不出现；模型照样这么分，将来打开不必改

### UL-decision-card · 决策卡片 · Decision Card

> **中**：**一次需要人输入的请求，带齐让人当场就能判断的全部信息与选项。**
> **「当场」是这个定义的重点**：人**不必回到原来那个会话去翻上下文**，读这张卡片就够了。
> **来源有三种**：agent 发起、系统发起（放行判断，选项四档固定）、**[拓展件](capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)发起**（选项集由出卡的拓展件写）；记录里分得出是哪一种、哪一件。
>
> **EN**: **One request for human input, carrying everything a person needs to judge it
> on the spot** — options included. **"On the spot" is the point**: they should not
> have to go back to the originating session and read up on the context. **It has three
> sources**: raised by the agent, by the system (the release judgement, with its fixed four
> options), or **by a loop extension** (whose option set the extension writes); the record
> tells which source, and which extension.

- **形态**：对象
- **出处**：[PF-008 §4 决策卡片](../../product/PF-008-human-in-the-loop/design.md#决策卡片) · [§6.3](../../product/PF-008-human-in-the-loop/design.md#63-卡片自包含但要留得住溯源的路)（rev 6）
- **注意 ①**：**一张卡片只能被答一次**，在会话里答还是在[池子](#ul-decision-pool--决策池--decision-pool)里答**都算数**，
  **答完两处一起消失**——**同一张卡片有两套状态，人就再也不信任这个池子了**
- **注意 ②**：**「在会话里答」指的是在会话里那张卡片上答，不是发一条消息**。
  **答复只在卡片上做，消息永远是消息**——这消解了「等待期间用户发来的话是答复还是新交代」这个歧义
- **注意 ③**：**卡片要让人看出「答了它会解除什么」**——同一个会话可能有好几张卡片悬着，
  **而它们解除的东西不一样**
- **注意 ④**：**「不回答」是合法答复**

### UL-card-batch · 一批卡片 · Card Batch

> **中**：**同一次「停下来」产生、因而挂在同一个被阻塞物名下的全部
> [决策卡片](#ul-decision-card--决策卡片--decision-card)。**
> **只有全部了结才算答完**——**「了结」含人明确表示不回答**；
> **少一张，什么都不会发生**。它**算得出来，不另存一份**：
> 还差几张 · 全了 · 作废，都由那些卡片各自的状态定。
> **答完之后可能还有下一轮**：拿着答复回到原处的拓展件可以再出卡，那是新的一批。
>
> **EN**: **All the decision cards produced by one stop, and therefore hanging off the
> same blocked thing.** It counts as answered **only once every card is settled** — and
> *settled* **includes a person explicitly declining to answer**. **One card short and
> nothing happens.** It is **computed, never stored apart**: still-missing, complete and
> void all follow from the states of the cards themselves. **A further round may follow**:
> an extension resuming with the answers may raise cards again, and that is a new batch.

- **形态**：视图
- **出处**：[PF-008 §5.3 一批卡片，与「答完」是什么意思](../../product/PF-008-human-in-the-loop/design.md#53-一批卡片与答完是什么意思) ·
  [PF-008 flows §3.2 一批卡片](../../product/PF-008-human-in-the-loop/flows.md#32-一批卡片)（rev 6）
- **别混**：与[决策池](#ul-decision-pool--决策池--decision-pool)**分组的依据不同**——
  池子按**租户**把所有等着的卡片摆在一处**给人看**，这一批按**被它阻塞的那一个**收在一起**决定什么时候解除**
- **⚠️ 注意 ①**：**答到一半，什么都不会发生**——已经拿到的那几个答案**不会先送出去**。
  **拿着残缺的前提做出来的东西，看上去和正常的一模一样**
- **注意 ②**：**被阻塞的可能是一次前台工具执行、一次后台工具执行，或一个
  [运行](agent-runtime-loop.md#ul-run--运行--run)**——三种情形在人这一侧一模一样，
  **差别只在解除了什么**
- **注意 ③**：**「作废」只有两条来路**：那个运行被中断，或**会话被归档**。
  它等的那次执行因停机没了时卡片怎么办，[尚待产品负责人裁决](../../product/PF-008-human-in-the-loop/design.md#91-待产品负责人裁决执行已经没了它的卡片怎么办)
- **注意 ④**：被阻塞的是后台工具执行那一种，**本版不出现**——要等应答的执行只在前台等

### UL-decision-pool · 决策池 · Decision Pool

> **中**：**一个租户范围内，所有等着人输入的卡片，陈列在一处。**
> **它是陈列，不是主体**——等的永远是某个会话里的某个 run 或某次工具执行，
> **池子只是把它们摆到一起，让人一眼看见**。
>
> **EN**: **All cards awaiting human input within one tenant, displayed in one place.**
> **It is a display, not an actor** — what waits is always a run or a tool execution
> inside some session; the pool merely gathers them so a person can see them at a
> glance.

- **形态**：视图
- **出处**：[PF-008 §4 决策池](../../product/PF-008-human-in-the-loop/design.md#决策池)（rev 6）
- **⚠️ 注意**：**不存在「组织在等什么」这回事。组织不会等，等的永远是某个会话。**
  把池子当成主体，就会做出一个「组织待办中心」——**它会开始有自己的状态、自己的流转、
  自己的归属，而真正在等的那个 run 反倒被隔在一层之外**
- **注意**：在命令行交付形态下，[池子按会话据点各一份](../../product/PF-016-cli-tui-delivery-surface/design.md#619-这里看到的池子是这一处的)——「所有」相对于会话所在之处，一个人用两台机器就有两份；定义不因此改
- **注意**：**租户隔离在池子上成立**

### UL-admission-decision · 放行判断 · Admission Decision

> **中**：**一个函数**，在一个 run 里**拿到一次模型响应之后跑**：既算出**要不要停**，
> 也**写出给人看的那张[卡片](#ul-decision-card--决策卡片--decision-card)**——
> **它既是判官也是撰稿人**。它的输入是三样合起来：
> **权限设置 + [会话授权上下文](#ul-session-authorization-context--会话授权上下文--session-authorization-context) + 会话运行模式**。
> **它是系统自带的一件[拓展件](capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)**，
> 站在「执行动作之前」、干预力可否决，出卡用的是 loop 的[等待原语](agent-runtime-loop.md#ul-wait-primitive--等待原语--wait-primitive)——**自带的不享受特权**，
> 只有往严里走的例外：**它不能被替换、禁用或收窄**。
>
> **EN**: **A function** run inside a run, **after each model response**: it decides
> **whether to stop** and **writes the card the person will read** — **it is both judge
> and drafter**. Its inputs are three things together: the permission settings, the
> session authorization context, and the session's operating mode. **It is a built-in loop
> extension**, sitting at "before an action executes" with veto power and raising its card
> through the loop's wait primitive — **built-in confers no privilege**, the only exceptions
> running towards strictness: **it cannot be replaced, disabled or narrowed**.

- **形态**：过程
- **出处**：[PF-008 §4 放行判断](../../product/PF-008-human-in-the-loop/design.md#放行判断) · [§5.2](../../product/PF-008-human-in-the-loop/design.md#52-那个判断函数)（rev 6） · [PF-012 §5.8 系统自带的几件](../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪)（rev 11）
- **注意 ①**：**没有任何一样单独说了算。**获批不等于自动放行，有权限设置也不等于请示没意义
- **注意 ②**：**权限设置里明确禁止的，会话授权翻不了案**——
  否则任何禁止都能靠「让用户在会话里点个同意」绕过去，
  而**会话里坐着的那个人，未必是设权限的那个人**
- **注意 ③**：**拿不准就再问一次**——两个方向的代价不对称：该放的没放只是多问一遍，
  **不该放的放了就是做了没有人批准过的事**
- **注意 ④**：**它不可用时怎么办，[尚待产品负责人裁决](../../product/PF-012-agent-loop-and-run/design.md#92-待产品负责人裁决)**（全拒，或当卸载）；放行之后到执行之间不重判

### UL-inquiry · 问询 · Inquiry

> **中**：agent **主动问人一个问题**。每个问题必须带齐三样：
> **问题描述**（人话）+ **候选项**（**文本必需，图解可选**）+ **允许人自由输入自己的答复**。
> **一次可以问多个问题。**
>
> **EN**: The agent **asking a person a question of its own accord**. Every question
> must carry three things: **a plain-language description**, **candidate answers**
> (**text required, a diagram optional**), and **room for the person to write their
> own**. **Several questions may be asked at once.**

- **形态**：过程
- **出处**：[PF-007 §6.11 `Ask()`](../../product/PF-007-meta-capabilities/design.md#611-ask通向人)（rev 16）
- **别混**：与[请示](#ul-approval-request--请示--approval-request)**形状不同**——
  **问询是开放的，拿到之后接着想；请示是封闭的，拿到之后才动手**
- **注意 ①**：**自由作答这条路由系统保证，不靠 agent 记得留**——**靠自觉总有忘的时候**
- **注意 ②**：**一次问全。**打断的代价**与问题多少无关，只与打断次数有关**——
  **挤牙膏式连问是产品缺陷**
- **注意 ③**：**候选项只有图、没有文字是不行的**——引用不了、复述不了，**读屏的人直接被挡在门外**

### UL-approval-request · 请示 · Approval Request

> **中**：agent **就一件要动手的事请人准不准**。选项**固定两个**：同意 / 不同意，
> **外加自由作答**。它要说清：**做什么 · 为什么 · 影响多大 · 撤不撤得回 · 不准怎么办**。
> **获准之后那一笔进[会话授权上下文](#ul-session-authorization-context--会话授权上下文--session-authorization-context)。**
>
> **EN**: The agent **asking leave before doing something**. The options are **fixed at
> two** — approve or decline — **plus free-form reply**. It must state what will be
> done, why, how large the impact is, **whether it can be undone**, and what happens if
> declined. **An approval is recorded into the session authorization context.**

- **形态**：过程
- **出处**：[PF-007 §6.11 `Ask()`](../../product/PF-007-meta-capabilities/design.md#611-ask通向人)（rev 16）
- **注意 ①**：**先把事做了再请示，那不叫请示，叫通知**——**人拒绝的时候已经晚了**
- **注意 ②**：**翻不出裁决就不要翻。**人的回答常常不落在准/驳上（「第二封改改语气再发」）——
  **替人合成一个裁决等于伪造签字**
- **注意 ③**：**agent 拿到批准后做的事不能比请示的多**——**人签的是那段文字**
- **注意 ④**：**要写得出「什么时候不该敲这扇门」**——问得太多，人就会开始不假思索地点同意，
  **那时这扇门形同虚设，而它看上去还在工作**

### UL-session-authorization-context · 会话授权上下文 · Session Authorization Context

> **中**：**一个会话里，用户关于授权表达过的全部意思，按先后顺序排着的那一份。**
> **它是流水，不是结论**——给出是一笔，**撤回也是往后再记一笔**，
> **只追加，不回头改**。「此刻这个动作准不准」不写在里面，
> 是**按这份流水实时算出来的**，算的时候连同
> [权限设置](capabilities-and-composition.md#ul-permission--权限--permission)与会话运行模式一起判。
>
> **EN**: **Everything a user has expressed about authorization within one session, in the
> order it was said.** It is **a ledger, not a verdict** — granting is one entry, **and so is
> revoking**; entries are **only ever appended**. Whether a given action is permitted right
> now is **not stored there but computed from it**, together with the permission settings and
> the session's run mode.

- **形态**：对象
- **出处**：[PF-007 §4 会话授权上下文](../../product/PF-007-meta-capabilities/design.md#会话授权上下文)（rev 16）
- **注意 ①**：**流水里的每一笔是一次[授权表达](#ul-authorization-expression--授权表达--authorization-expression)**，
  **三个维度**——**来源**（结构化：界面上对着条目操作 / **语义化：用嘴说**）、
  **方向**（给出 / 撤回）、**作用域**（这一次 / 本会话 / **全局，即本租户下未来所有会话**）。
  **⚠️ 作用域为「全局」的那一笔不在这份流水里**——
  [它落成租户层的权限设置值](../../product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度)
- **注意 ②**：**它不挑来源。**卡片上点的「同意」算，
  [自由作答](#ul-approval-request--请示--approval-request)里写的算，
  **agent 压根没问、用户主动说的也算**
- **注意 ③**：**作用域是用户表达出来的，不是系统替他归的类**——
  系统只负责**准确理解**。**替他作主不允许**；
  **他没说清的时候，按最窄的那一档算**（[只保守](../../product/PF-007-meta-capabilities/design.md#611-ask通向人)）
- **注意 ④**：**表达得出，不等于生效。**一个作用域能不能真落地，
  仍按[他自己的身份与权限](scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)判——
  **会话里坐着的那个人，未必是设权限的那个人**
- **注意 ⑤**：**它是数据，不是活物。**
  **[会话被归档它不丢](../../product/PF-015-session-lifecycle-and-ownership/design.md#67-归档不动授权)**，
  撤销归档之后原样还在——**「工作被取消」推不出「授权也没了」**
- **注意 ⑥**：**授权不能建立在记忆上**——不给它名字，「用户刚才同意过」就只能活在
  agent 的上下文里，**而上下文会被裁剪**

### UL-authorization-expression · 授权表达 · Authorization Expression

> **中**：**用户就授权表达出来的、一笔一笔数得清的那一笔意思。**
> 每一笔有**来源**（结构化：界面上对着条目操作 / 语义化：用嘴说）、
> **方向**（给出 / 撤回）与**作用域**（这一次 / 本会话 / 全局），
> **有先后**，**分得出是哪一笔**。
> **「这一次」与「本会话」两档追加进
> [会话授权上下文](#ul-session-authorization-context--会话授权上下文--session-authorization-context)那份流水，
> 只追加、不回头改**；**「全局」那一档落成租户层的权限设置值**。
>
> **EN**: **One countable expression of what a user means about authorization.** Each carries
> a **source** (structured: acting on a specific entry in the interface / semantic: said in
> words), a **direction** (granting / revoking) and a **scope** (this time / this session /
> global); they **have an order** and **are individually identifiable**. Those scoped to
> **this time** or **this session** are **appended** to the session authorization context —
> appended only, never rewritten; those scoped **globally** land as a **tenant-level
> permission setting value**.

- **形态**：对象
- **出处**：[PF-007 §4 一笔授权表达有三个维度](../../product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度)（rev 16）
- **别混**：**不是[会话授权上下文](#ul-session-authorization-context--会话授权上下文--session-authorization-context)**——
  那是流水**整份**，这是流水里的**一笔**
- **注意 ①**：**撤回也是一笔**——**不是把先前那笔擦掉**，是往后再记一笔
- **注意 ②**：**[放行判断的第 ③ 步拿它算](../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)**：
  结构化的（含由全局那一档落成的租户层权限值）＋ 本会话流水（本会话 ＋ 这一次）
- **弃用**：~~「决策记录」~~——**撞[记录条目](record-and-context.md#ul-record-entry--记录条目--record-entry)**，过不了取名那一关

## 外面怎么进来

### UL-inbound-arrival · 入站到达 · Inbound Arrival

> **中**：**外面要送进一个[会话](agent-runtime-loop.md#ul-session--会话--session)的一件事，
> 被受理之后成为的那条事实。**受理**是一个动作，不是一个通道**——
> 东西送到了不等于被受理；**受理的那一刻，它成为一条可以被指着说「就是它」的事实**。
> 它**归属于恰好一个会话**、**有一个来源**，而且**受理了就不会凭空消失**：
> 要么被消费，要么被明确关掉，**两种都留痕**。
>
> **EN**: **A thing from outside, destined for one session, as it exists once it has
> been admitted.** Admission is **an action, not a channel** — something reaching the
> system is not yet admitted; at the moment of admission it becomes a fact one can
> point at. It **belongs to exactly one session**, **carries a source**, and **once
> admitted never vanishes silently**: it is either consumed or explicitly closed out,
> and **both leave a trace**.

- **形态**：对象
- **出处**：[PF-014 §4 入站到达](../../product/PF-014-inbound-intake-and-queueing/design.md#入站到达)（rev 6）
- **别混 ①**：**它不是一条[消息](record-and-context.md#ul-message--消息--message)。**
  消息回答**谁在说话**；入站到达回答**外面送进来了一件什么事**。
  **有的到达会成为消息**（进[待处理消息队列](agent-runtime-loop.md#ul-pending-message-queue--待处理消息队列--pending-message-queue)），
  **有的不会**——一张卡片的答复、一条[控制指令](#ul-control-command--控制指令--control-command)都不是消息
- **别混 ②**：**与[增量到达](record-and-context.md#ul-incremental-arrival--增量到达--incremental-arrival)是两回事。**
  那条说的是**一条消息的内容分几次到齐**，这条说的是**一件事从外面进到会话里**。
  **裸写「到达」不作数**，两处都要带限定
- **注意**：**「从哪个通道进来」是它的一个属性，不是它的种类**——
  交付面、连接件送达、定时到点、别的会话捎话，**同一套受理规矩，差别只在取值**；
  **斜杠命令不是来源取值**，它是经交付面进来的到达在受理时被认出的内容标注

### UL-business-flow-extension-point · 业务流程拓展点 · Business Flow Extension Point

> **中**：**业务流程上一个开放的位置，挂在那里的东西可以拦住一次请求，
> 但不改变任何已经落定的事实。**它产出的是**业务流程上的增量价值**，
> **不是[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)上的增量**——
> **对会话日志不产生任何持久化影响**，这是它的定义性质，不是实现细节。
>
> **EN**: **An open position on a business flow, where what is attached may hold up a
> request without altering any fact already committed.** What it produces is **added value
> in the business flow**, not an increment to the session log: **it leaves no persistent
> mark on that log at all** — a defining property, not an implementation detail.

- **形态**：位置
- **出处**：[PF-015 §4 业务流程拓展点](../../product/PF-015-session-lifecycle-and-ownership/design.md#业务流程拓展点) · [§6.6](../../product/PF-015-session-lifecycle-and-ownership/design.md#66-跑题只提醒不阻拦)（rev 11）
- **⚠️ 别混**：**它不是 [Loop 拓展点](agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point)**——
  **那一类只能靠改会话日志起作用**，这一类恰恰一个字都不能改。
  两者是**并列的两类拓展点**，不是同一类的两个位置
- **注意 ①**：**被拦下的东西，系统不持有。**它没有被
  [受理](#ul-inbound-arrival--入站到达--inbound-arrival)，
  **请求就地返回给发起方，到此为止**；用户若再来，那是**全新的一次请求**
- **注意 ②**：**因此「一直不确认」没有后果**——没有待办、没有草稿、没有超时，什么都没留下
- **注意 ③**：**目前只有一个实例**——[会话跑题的提醒](../../product/PF-015-session-lifecycle-and-ownership/design.md#66-跑题只提醒不阻拦)。
  **这一类机制将来由谁统一拥有，尚未判定**

### UL-control-command · 控制指令 · Control Command

> **中**：**用户对正在发生的事、或对[待处理消息队列](agent-runtime-loop.md#ul-pending-message-queue--待处理消息队列--pending-message-queue)本身的一次直接处置。**
> 三条性质合起来才是它：**它不是内容**（不进 agent 的上下文去被理解，
> 它改的是执行权或队列本身）、**它不排队**（排队的意思是「等一个合适的时候」，
> 而它要的恰恰是现在）、**它的语义归定义那个动作的 topic**。
>
> **EN**: **A user's direct disposition of what is happening, or of the pending message
> queue itself.** Three properties together constitute it: it is **not content** (it
> never enters the agent's context to be interpreted; it changes execution rights or
> the queue), it **does not queue** (queueing means waiting for a suitable moment, and
> what it wants is precisely *now*), and **its meaning belongs to whichever topic
> defines that action**.

- **形态**：变体（父：[入站到达](#ul-inbound-arrival--入站到达--inbound-arrival)）
- **出处**：[PF-014 §4 控制指令](../../product/PF-014-inbound-intake-and-queueing/design.md#控制指令)（rev 6）
- **别混 ①**：**与[斜杠命令](capabilities-and-composition.md#ul-slash-command--斜杠命令--slash-command)不是一回事。**
  绑定提示词或 skill 的斜杠命令是**内容**——它要 agent 去做一件事，因此进队列；
  绑定系统业务流程的那种不进队列，但它触发的是一条业务流程、留一条记录，也不是处置；
  控制指令是**处置**。**判据是问一句：它是内容还是处置？**
- **别混 ②**：**「敲键盘」不是一类到达**，它是**发出一条控制指令的一种敲法**——
  同一条指令可以敲键盘发、点按钮发、调接口发
- **注意**：**本条只定这三条共同性质，不发明任何一条具体指令。**
  [取消与强制停止](agent-runtime-loop.md#ul-forced-stop--强制停止--forced-stop)、[插队](#ul-queue-jump--插队--queue-jump)各有各的拥有者

### UL-queue-jump · 插队 · Queue Jump

> **中**：用户发出的一条[控制指令](#ul-control-command--控制指令--control-command)，
> 意思是**「这句话我要现在就被看到」**。它做**三件事，要么一起成立、要么都不成立**：
> 按**最大程度保留**的原则处置 loop 正停着的那一步、
> 把用户这句话放到[待处理消息队列](agent-runtime-loop.md#ul-pending-message-queue--待处理消息队列--pending-message-queue)的**队首**、
> 落下相应的占位与提醒**让 agent 知道刚才发生了什么、为什么**。
>
> **EN**: A user's control command meaning **"I want this seen right now."** It does
> **three things, all or none**: it disposes of whatever step the loop is stopped at,
> under the principle of **preserving as much as possible**; it puts the user's
> sentence **at the head** of the pending message queue; and it records the
> corresponding placeholders and reminders so **the agent knows what just happened and
> why**.

- **形态**：变体（父：[控制指令](#ul-control-command--控制指令--control-command)）
- **出处**：[PF-014 §4 插队](../../product/PF-014-inbound-intake-and-queueing/design.md#插队)（rev 6）
- **别混 ①**：**它不终止[运行](agent-runtime-loop.md#ul-run--运行--run)。**
  这是它与**取消**最要紧的差别：取消让运行落终态，
  **插队只是把运行推到下一次取消息那一点**，运行一直活着
- **别混 ②**：**名字容易误导：它插的不是别人的位置，是时间。**
  队首那一项是它的落脚处，**不是它的目的**——两条路最终都走到同一个地方（取一批消息），
  插队只是**把中间那段间隔压到最短**
- **注意 ①**：**它是系统唯一的加急通道**，[不设第二种优先级](../../product/PF-012-agent-loop-and-run/design.md#先到先处理只有一个例外)
- **注意 ②**：**它会解除 loop 里各种等待态**，其中悬着的[决策卡片](#ul-decision-card--决策卡片--decision-card)
  按「**人明确拒绝回复**」处置——**取消视作拒绝是无副作用可逆的，反过来不是**
- **注意 ③**：**被它中断的模型回复不交出动作**——参数已经收齐、还没执行的工具调用也不执行，
  留在那条被中断的消息里，agent 读完新话自己决定要不要重新发起（[PF-014 §5.4](../../product/PF-014-inbound-intake-and-queueing/design.md#54-插队停在哪就怎么办)）

## 人从哪一面碰到它

### UL-delivery-surface · 交付面 · Delivery Surface

> **中**：系统把[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)**投影给人看**、
> 并把**人做的事送进[受理](#ul-inbound-arrival--入站到达--inbound-arrival)**的那一面的总称。
> **两条性质缺一不可**：**它不持有任何领域事实**——屏上的每一条都指得回日志里的一条，
> 它提交的每一件事都成为一条[入站到达](#ul-inbound-arrival--入站到达--inbound-arrival)、
> 一条卡片答复或一条[控制指令](#ul-control-command--控制指令--control-command)；
> **它也没有自己的领域语义**——凡是在它上面能做的事，**都是别处已经定义过的动作**，它不新开任何通路。
> **本版只有一种：装在用户自己机器上的命令行应用。**
>
> **EN**: The class of surfaces through which the system **projects the session log to a
> person** and **feeds what that person does into intake**. **Two properties, both
> required**: it **holds no domain fact of its own** — every line on screen points back to
> an entry in the log, and everything it submits becomes an inbound arrival, a card answer
> or a control command; and it **has no domain semantics of its own** — every action
> available on it **is one defined elsewhere**, and it opens no new path. **This version has
> only one kind: a command-line application installed on the user's own machine.**

- **形态**：总称
- **出处**：[PF-016 §4 交付面](../../product/PF-016-cli-tui-delivery-surface/design.md#交付面) ·
  [§5.3](../../product/PF-016-cli-tui-delivery-surface/design.md#53-屏上的每一条都指得回日志里的一条) ·
  [§5.4](../../product/PF-016-cli-tui-delivery-surface/design.md#54-人做的每一件事走的都是已有的路)（rev 5）
- **⚠️ 别混**：**不是[会话据点](grounding-and-isolation.md#ul-session-base--会话据点--session-base)。**
  据点是这些会话事实**所在的那一处**，交付面**什么都不持有**；
  同一处据点上**可以同时开着好几处**在用它
- **注意**：**「一次使用」不是一个有身份的东西**——各自的滚动位置、打了一半的草稿，**退出即消失**，
  产品不给它们任何身份；要说的一切都挂在[登录状态](subjects-and-ownership.md#ul-login-state--登录状态--login-state)与会话据点上

### UL-presentation-form · 呈现形式 · Presentation Form

> **中**：[交付面](#ul-delivery-surface--交付面--delivery-surface)把**同一份事实交给读者的形式**，
> **恰有两种**：**人读**——排版、着色、可以原地更新的那一份，给坐在屏前的人；
> **机读**——逐条、可被解析的那一份，给脚本、CI 或另一个程序。
> 两种形式消费的是**同一份[会话日志投影](record-and-context.md#ul-session-log-projection--会话日志投影--session-log-projection)、
> 走的是同一条受理**，差别只在怎么交出去：**同一个场景用两种形式各跑一遍，
> 日志上留下的[记录条目](record-and-context.md#ul-record-entry--记录条目--record-entry)序列必须一样。**
>
> **EN**: The form in which a delivery surface hands **the same facts** to its reader.
> **Exactly two**: **human-readable** — laid out, coloured and updatable in place, for the
> person at the screen; and **machine-readable** — line by line and parseable, for a script,
> a CI job or another program. Both consume **the same session-log projection and go through
> the same intake**, differing only in how the facts are handed over: **running one scenario
> once in each form must leave the identical sequence of record entries in the log.**

- **形态**：状态
- **出处**：[PF-016 §4 呈现形式](../../product/PF-016-cli-tui-delivery-surface/design.md#呈现形式) ·
  [§5.5](../../product/PF-016-cli-tui-delivery-surface/design.md#55-两种呈现形式同一份事实)（rev 5）
- **⚠️ 别混**：**不是[会话运行模式](agent-runtime-loop.md#ul-session-run-mode--会话运行模式--session-run-mode)。**
  那是「**本该问人的那一刻改怎么办**」，是会话的事，**改变领域行为**；
  这一条是「**这份事实交给谁读**」，是交付面的事，**一个字都不改**
- **注意**：**它不是「两个功能」**，是同一个东西的两种读法。做成两个，两边迟早对不上——
  而对不上的那一天，**脚本跑出来的「成功」与人看到的「失败」会同时成立**

### UL-look-and-feel-preference · 观感偏好 · Look-and-Feel Preference

> **中**：[交付面](#ul-delivery-surface--交付面--delivery-surface)上那些
> **只影响「看起来怎么样、用起来顺不顺手」的选择**——配色与主题、键位、一屏保留几轮、
> 要不要去掉装饰只给线性文本。**判据只有一条**：
> **在 [agent loop](agent-runtime-loop.md#ul-agent-loop--agent-loop--agent-loop) 内，
> 模型、工具、拓展点这三个角色没有一个消费它。**
> **因此改它不改变任何领域行为**：同一个场景换一种配置跑，记录条目序列一模一样。
> **它是[个人 context](scope-and-resolution.md#ul-personal-context--个人-context--personal-context) 的一部分，由账号承载、跟着人走。**
>
> **EN**: The choices on a delivery surface that **only affect how it looks and how it feels
> to use** — colour scheme and theme, key bindings, how many turns stay on screen, whether
> decoration is dropped in favour of plain linear text. **One criterion decides membership**:
> **inside the agent loop, none of the three roles — the model, the tools, the extensions —
> consumes it.** **Changing it therefore changes no domain behaviour**: the same scenario
> leaves the identical sequence of record entries either way. **It is part of the personal
> context, carried by the account and travelling with the person.**

- **形态**：属性
- **出处**：[PF-016 §4 观感偏好](../../product/PF-016-cli-tui-delivery-surface/design.md#观感偏好) ·
  [§6.12](../../product/PF-016-cli-tui-delivery-surface/design.md#612-观感偏好不改变任何领域行为)（rev 5）
- **⚠️ 别混**：**不是[元 runtime context](scope-and-resolution.md#ul-meta-runtime-context--元-runtime-context--meta-runtime-context)
  那十四项里的第 3 项「账号级的界面偏好」**（语言 · 时区 · 地区 · 明暗风格一类）——
  **那些是要被 agent 感知的**，[已经是每个会话必带的一项](../../product/PF-015-session-lifecycle-and-ownership/design.md#56-十四项-meta-runtime-context)，
  **不在这里，也不由这里定**；两者同样由账号承载（[C-26 的处置](../conflicts.md#现有冲突)），但一个进会话、一个不进
- **注意**：[宿主不是词条的字段](../conventions.md#形态这个词指的是哪一类东西)——「由账号承载」写进定义，
  是因为[PF-016 明文把它归进个人 context](../../product/PF-016-cli-tui-delivery-surface/design.md#观感偏好)，
  那是所指的一部分，不是架构分解的结论

---

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
