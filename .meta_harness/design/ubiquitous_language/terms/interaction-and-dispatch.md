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
> | **上下文怎么组装** | **从派发者的会话在派发那一刻[分叉](agent-runtime-loop.md#ul-session-fork--会话分叉--session-fork)，加一段 instruction** | 一段 instruction | 一段 handoff 说明 |
> | **派发工作由谁控制** | 派发者可显式撤回工作 | 派发者可显式撤回工作 | **不能凭派发关系撤回** |
> | **派发动作何时结束** | 进[工具等待态](execution-and-outcome.md#ul-tool-wait-state--工具等待态--tool-wait-state)待[报告](#ul-dispatch-report--派发报告--dispatch-report)或失败 | 同左 | **确认会话建没建起来即结束** |
> | **建出的会话[值守](agent-runtime-loop.md#ul-session-attendance--会话值守--session-attendance)吗** | 无人值守 | 无人值守 | **有人值守** |
>
> **EN**: **Handing a piece of work to another agent.** Three modes, differing on
> five dimensions: whether it is an independent primary session, how its context is
> assembled, who may withdraw the dispatched work, when the dispatching action ends, and
> whether a person attends the session it creates.

- **控制边界**：派发者可显式撤回 spawn／delegate 的工作；父 Run 停止不自动停止子会话执行，报告结束派发而不决定子 Run 终态。
- **形态**：过程
- **出处**：[元能力：派发有三种模式](../../product/meta-capabilities/design.md#三种派发模式)（rev 23）
- **注意 ①**：**两处分水岭，各自只有一条。**`spawn` 与 `delegate` 只差
  「**它带着什么开始干活**」——**一个带副本加交代，一个只带交代**；
  `spawn`/`delegate` 与 `handoff` 只差
  「**是不是独立主会话**」——**另外三个维度全是这一条的后果**
- **注意 ②**：**`handoff` 撤不回。**这不是缺陷，是它的定义——**一个能被撤回的 `handoff`，那是 `delegate`**
- **注意 ③**：**可以派给外部 harness 的 agent**，但那时**权限继承无从谈起、数据出境、
  监管取决于对方、回来的是外部内容**——因此**必须是一项显式授予的权限**
- **注意 ④**：**「是不是独立主会话」这条分水岭还有另一个侧面——谁产生[子 agent](#ul-subagent--子-agent--subagent)。**
  `spawn`/`delegate` 产生，`handoff` 不产生。**这不是第六个维度**，两者在三种模式上取值一一对应
- **注意 ⑥**：**三种方式是一个命令的参数**：工具 `Agents` 只有一个 `dispatch` 命令，方式写在 `mode` 里。**跟谁能[通信](#ul-inter-agent-communication--agent-间通信--inter-agent-communication)不是派发的维度**——同租户未归档的会话之间都通
- **注意 ⑦**：**派发可以嵌套，深度至多 2**：主会话是第 0 层，第 2 层的会话不能再 `spawn` 或 `delegate`；`handoff` 出的主会话从第 0 层算起
- **注意 ⑧**：每次派发留下一条[派发记录](#ul-dispatch-record--派发记录--dispatch-record)，那才是有身份的东西
- **注意 ⑤**：**`spawn` 的子会话是从派发者的会话[分叉](agent-runtime-loop.md#ul-session-fork--会话分叉--session-fork)出来的**
  （[三种派发模式](../../product/meta-capabilities/design.md#三种派发模式)，rev 15）——
  分叉点之前的对话两边按引用共享，**不复制**；**派发之后父这边发生的事，子看不见**

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
- **出处**：[元能力：三种派发模式](../../product/meta-capabilities/design.md#三种派发模式) ·
  [元能力：一次报告与后续消息](../../product/meta-capabilities/design.md#一次报告与后续消息)（rev 23）
- **别混 ①**：与「**派发出去的 agent**」不是一回事——**后者含 `handoff`，它不含**。
  [agent 间通信](#ul-inter-agent-communication--agent-间通信--inter-agent-communication)对两者一视同仁
- **别混 ②**：**与 [agent 类型](capabilities-and-composition.md#ul-agent-type--agent-类型--agent-type)不是一回事**——
  那是 **Agent 定义的一个属性**（`master` / `non-master`），说的是**这份定义带着哪套机制**；
  **本条说的是它此刻在派发关系里扮演什么角色**。
  **第二个取值特意不叫 `subagent`，就是为了不与本条撞名**（[C-14](../conflicts.md)）
- **注意 ①**：**它所在的那个会话就是[子会话](agent-runtime-loop.md#ul-child-session--子会话--child-session)**，
  内涵见该词条：由**创建**确立；`spawn` 的子会话从父会话分叉而来，按引用共享分叉点之前的对话，
  `delegate` 的子会话不带父会话的对话。
  **本条只定外延**——哪些算、哪些不算
- **注意 ②**：**它的会话[无人值守](agent-runtime-loop.md#ul-session-attendance--会话值守--session-attendance)**——要人在场的命令不给它，需要人决定的动作被拒绝；它有疑问就给派发它的 agent 发[消息](#ul-inter-agent-communication--agent-间通信--inter-agent-communication)，或写进报告。**它的通信不收窄**：同租户未归档的会话它都能发
- **⚠️ 注意 ③**：**master 对自己全部 subagent 的感知与管理**仍归 **PF-015**

### UL-inter-agent-communication · agent 间通信 · Inter-Agent Communication

> **中**：**一个会话里的 agent 给另一个会话里的 agent 发一条消息。一条规则：**
> **两个会话同属一个租户，接收的会话没有归档，发送方此刻许发，就通。**
> **不要求派发关系**；兄弟与隔代的子 agent 之间也通。
> 消息以**系统提醒**的身份进入接收的会话，写明它来自哪个会话的 agent、那个 agent 用的定义、
> 它与接收会话的关系；**它不成为用户说的话**。
>
> **EN**: **An agent in one session sends a message to an agent in another. One rule:**
> the two sessions belong to the same tenant, the receiving session is not archived, and
> the sender is currently permitted. **No dispatch relationship is required**; sibling and
> grandchild agents can talk too. The message enters the receiving session as a **system
> reminder** that names the sending session, its agent definition and its relation to the
> receiver; **it never becomes something the user said**.

- **归档边界**：接收会话归档期间拒绝新的消息，告知发送方；既有执行的迟到结果和账不丢失，也不作为新任务入队。
- **形态**：规则
- **出处**：[元能力：双向通信与消息失败](../../product/meta-capabilities/design.md#双向通信与消息失败)（rev 23）
- **注意 ①**：**「没有归档」就是通路存在的条件**——一个会话已被归档的 agent，不是「暂时联系不上」，是这条通路不存在了。
  **没有删除会话的概念，也就没有「会话结束」这回事**
- **注意 ②**：**发不出去时要说清是哪一条不满足**：对方不存在或不在本租户（两者答同一句）、对方已归档、发给了自己、此刻不许。
  **拒绝里不带对方的任何内容**
- **注意 ③**：交回报告不结束通信，[报告终结的是派发，不是会话](#ul-dispatch-report--派发报告--dispatch-report)。
  **消息不出报告，不改任何一次派发的状态**
- **注意 ④**：**找一个 agent 就是找一个会话**——收件人写会话标识；谁和我是什么关系，由会话的目录给出
- **别混**：**不是[通知](#ul-notification--通知--notification)**。通知进收件人的收件箱，给谁、多急由收件人的订阅定；
  消息直接进接收会话，成为它的一条输入

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
- **出处**：[元能力：报告与消息是两样东西](../../product/meta-capabilities/design.md#一次报告与后续消息)（rev 23）
- **⚠️ 它终结的是这次派发，不是那个会话。**[子 agent](#ul-subagent--子-agent--subagent) 交回报告之后，
  它的会话不会因此归档，也不据此认定子 Run 终态；后续消息仍须满足[当前通信准入](#ul-inter-agent-communication--agent-间通信--inter-agent-communication)。
  **不点破这一条，就会被做成「报告一到就把那个会话收掉」——而且不报错**
- **注意**：**它与[消息](#ul-inter-agent-communication--agent-间通信--inter-agent-communication)是两样东西**，
  子 agent 两样都能用：**干到一半要确认事实、澄清需求，走消息**（什么都不终结，来回多少次都行）；
  **干完了必须交报告**（只有一次，一交这次派发就结束）。
  **混为一谈的代价是两头的**——把消息当报告，派发者以为活已干完；把报告当消息，那次派发永远不返回
- **注意**：**它只交到一处**：派发者那次调用还在等，它就是调用的结果；等待已经结束，它作为一条系统提醒送进派发者的会话。被派发的 agent 没交报告就停了下来（没有在跑的一轮、待处理的输入与后台调用）时，**它最近一轮的最终回复就是报告**；那一轮失败或被取消，这次派发以失败收场
- **注意**：发起方可以附上「**我期望报告长什么样**」，但那是**指引，不是校验**——
  写成硬校验，子就会为了通过校验而编造格式

### UL-dispatch-record · 派发记录 · Dispatch Record

> **中**：**一次[派发](#ul-agent-dispatch--agent-派发--agent-dispatch)留下的那条耐久记录**：谁派的、哪种方式、交给了哪个 Agent 定义、
> 建出了哪个会话、现在怎样、[报告](#ul-dispatch-report--派发报告--dispatch-report)是什么、交到了哪里。
> **它有自己的身份，不住在任何一个会话的日志里，也不住在派发者那次工具调用里。**
>
> **EN**: **The durable record one dispatch leaves**: who dispatched, by which mode, to which
> agent definition, which session it created, how it stands now, what the report is and where
> it was handed over. **It has its own identity; it lives neither in a session log nor in the
> dispatching tool call.**

- **形态**：对象
- **出处**：[元能力：Agents 派发与通信](../../product/meta-capabilities/design.md#agents-派发与通信)（rev 23）
- **身份靠什么**：受理时定下的派发标识；建出的会话的身份由它派生，所以重做认回同一个会话
- **怎么生怎么灭**：受理即生；`spawn`、`delegate` 以报告成立、失败或撤回了结，`handoff` 以会话建成或建不成了结。了结之后仍读得到
- **别混 ①**：**不是[子会话](agent-runtime-loop.md#ul-child-session--子会话--child-session)**。派发了结了，那个会话照旧在
- **别混 ②**：**不是派发者那次工具调用**。调用被取消、被插队，记录与会话都不变

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
- **出处**：[PF-008 §4 HITL](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#hitl)（rev 7）
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
- **出处**：[PF-008 §4 等待态的两个维度](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#等待态的两个维度)（rev 7）
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
> **来源有三种**：agent 发起（[问询](#ul-inquiry--问询--inquiry)）、系统发起（放行判断，选项五档固定，卡上系统说的话由系统按实际动作生成，另带[放行详情](#ul-release-detail--放行详情--release-detail)）、**[拓展件](capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)发起**（选项集由出卡的拓展件写）；记录里分得出是哪一种、哪一件。
>
> **EN**: **One request for human input, carrying everything a person needs to judge it
> on the spot** — options included. **"On the spot" is the point**: they should not
> have to go back to the originating session and read up on the context. **It has three
> sources**: raised by the agent (an inquiry), by the system (the release judgement, with its fixed five
> options, wording the system generates from the actual action, and a release detail), or **by a loop extension** (whose option set the extension writes); the record
> tells which source, and which extension.

- **形态**：对象
- **出处**：[PF-008 §4 决策卡片](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#决策卡片) · [§6.3](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#63-卡片自包含但要留得住溯源的路)（rev 7） · [人在回路：处理系统的放行卡片](../../product/human-intervention/design.md#j-hi03-处理系统的放行卡片)（rev 5）
- **注意 ①**：**一张卡片只能被答一次**，在会话里答还是在[池子](#ul-decision-pool--决策池--decision-pool)里答**都算数**，
  **答完两处一起消失**——**同一张卡片有两套状态，人就再也不信任这个池子了**
- **注意 ②**：**「在会话里答」指的是在会话里那张卡片上答，不是发一条消息**。
  **答复只在卡片上做，消息永远是消息**——这消解了「等待期间用户发来的话是答复还是新交代」这个歧义
- **注意 ③**：**卡片要让人看出「答了它会解除什么」**——同一个会话可能有好几张卡片悬着，
  **而它们解除的东西不一样**
- **注意 ④**：**「不回答」是合法答复**

### UL-release-detail · 放行详情 · Release Detail

> **中**：放行卡片上**讲这一次调用具体要做什么**的那一块内容。它由被调用能力的实现方
> 从这一次调用的生效参数算出，**不由模型写，也不由卡片的系统部分写**。
> 它有两种形态：**条目**（一列「标签：值」，随卡必有，任何交付面都画得出）与
> **带种类的值**（可选；种类由实现方定名，只有认识这个种类的界面模块按自己的画法画）。
>
> **EN**: The part of a release card that **says what this particular call will do**. The
> implementer of the called capability computes it from the effective arguments of the call;
> **neither the model nor the system-written part of the card writes it**. It has two forms:
> **rows** (a list of label and value pairs, always present, renderable on any delivery
> surface) and **a typed value** (optional; the implementer names its kind, and only a UI
> module that knows the kind renders it in its own way).

- **形态**：属性
- **出处**：[人在回路：处理系统的放行卡片](../../product/human-intervention/design.md#j-hi03-处理系统的放行卡片)（rev 5）
- **别混**：不是卡片的选项，也不是卡上说明「谁在问、五档各管多大」的那部分——那些由系统生成，每张放行卡片都一样
- **注意 ①**：**实现方没提供、或这一次给不出时，卡片照常发出**；给不出时卡上写明；详情的毛病不挡问人
- **注意 ②**：**它在问人的那一刻算一次，随卡片保存**；重看同一张卡片看到的是同一份
- **注意 ③**：模型给的东西只出现在**值**的位置并原样显示；**标签不出自模型**

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
- **出处**：[PF-008 §5.3 一批卡片，与「答完」是什么意思](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#53-一批卡片与答完是什么意思) ·
  [PF-008 flows §3.2 一批卡片](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-008-human-in-the-loop/flows.md#32-一批卡片)（rev 7）
- **别混**：与[决策池](#ul-decision-pool--决策池--decision-pool)**分组的依据不同**——
  池子按**租户**把所有等着的卡片摆在一处**给人看**，这一批按**被它阻塞的那一个**收在一起**决定什么时候解除**
- **⚠️ 注意 ①**：**答到一半，什么都不会发生**——已经拿到的那几个答案**不会先送出去**。
  **拿着残缺的前提做出来的东西，看上去和正常的一模一样**
- **注意 ②**：**被阻塞的可能是一次前台工具执行、一次后台工具执行，或一个
  [运行](agent-runtime-loop.md#ul-run--运行--run)**——三种情形在人这一侧一模一样，
  **差别只在解除了什么**
- **注意 ③**：**「作废」有三条来路**：那个运行被中断；**会话被归档**；
  **它等的那次执行已经终局**（据点停机后恢复时落了失败、原因「异常中断」），恢复对账时系统把那些卡片关成「已作废」——
  这不是超时、不是替人作答，卡片上不落任何答案（[PF-008 §6.1 第三条路](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答)，§9.1 已按它写成定论）
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
- **出处**：[PF-008 §4 决策池](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#决策池)（rev 7）
- **⚠️ 注意**：**不存在「组织在等什么」这回事。组织不会等，等的永远是某个会话。**
  把池子当成主体，就会做出一个「组织待办中心」——**它会开始有自己的状态、自己的流转、
  自己的归属，而真正在等的那个 run 反倒被隔在一层之外**
- **注意**：在命令行交付形态下，[池子按会话据点各一份](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#619-这里看到的池子是这一处的)——「所有」相对于会话所在之处，一个人用两台机器就有两份；定义不因此改
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
- **出处**：[PF-008 §4 放行判断](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#放行判断) · [§5.2](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#52-那个判断函数)（rev 7） · [PF-012 §5.8 系统自带的几件](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪) · [系统自带的几件，不可用时各有定法](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法)（rev 25）
- **注意 ①**：**没有任何一样单独说了算。**获批不等于自动放行，有权限设置也不等于不用再问人
- **注意 ⑤**：**判的是模型实际要执行的动作**——经 `Tools()` 取用一个工具时，判的是被取用的工具与它的参数，不是 `Tools()` 这次调用（[元能力：动作放行与环境准入](../../product/meta-capabilities/design.md#动作放行与环境准入)（rev 20））
- **注意 ②**：**权限设置里明确禁止的，会话授权翻不了案**——
  否则任何禁止都能靠「让用户在会话里点个同意」绕过去，
  而**会话里坐着的那个人，未必是设权限的那个人**
- **注意 ③**：**拿不准就再问一次**——两个方向的代价不对称：该放的没放只是多问一遍，
  **不该放的放了就是做了没有人批准过的事**
- **注意 ④**：**它此刻不可用时，顶上的是系统预先声明的[全拒件](agent-runtime-loop.md#ul-extension-unavailability-policy--拓展件不可用处置--extension-unavailability-policy)**——
  需要判断的动作一律拒绝，不放行、也不出卡问人，agent 读到的是一次否决、原因写明「放行判断此刻不在」；同一动作及判断依据仍有效时不重复出相同的卡片。重装配后已移除或绑定已变的未发起动作不自动执行，交回 agent 重新判断
- **注意 ⑥**：**它只在动作发起时判这一次**（[元能力：动作放行与环境准入](../../product/meta-capabilities/design.md#动作放行与环境准入)（rev 20））——
  放行之后交给工具，工具做[调用受理](execution-and-outcome.md#ul-call-acceptance--调用受理--call-acceptance)，只核主体资格、推进资格与环境，不再判许不许；
  之后的撤回只影响之后的放行判断，要停一个已经交出的调用用取消

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
- **出处**：[元能力：`Ask()`](../../product/meta-capabilities/design.md#meta-ask)（rev 23）
- **别混**：与系统发起的放行卡片**问的不是一类事**——
  **问询要的是信息或选择，答复交回 agent 接着想；放行卡片问的是许不许，答复交授权的拥有者，不经 agent**。
  agent 不拿问询向人要授权：人在问询里答的话不产生任何许可
  （[元能力：`Ask()`](../../product/meta-capabilities/design.md#meta-ask)（rev 20））
- **注意 ①**：**自由作答这条路由系统保证，不靠 agent 记得留**——**靠自觉总有忘的时候**
- **注意 ②**：**一次问全。**打断的代价**与问题多少无关，只与打断次数有关**——
  **挤牙膏式连问是产品缺陷**
- **注意 ③**：**候选项只有图、没有文字是不行的**——引用不了、复述不了，**读屏的人直接被挡在门外**

### UL-approval-request · 请示 · Approval Request

> **中**：**已弃用。**它原指 agent 就一件要动手的事请人准不准。现行规则下 agent 不向人要授权：
> 一个动作许不许做，由[放行判断](#ul-admission-decision--放行判断--admission-decision)对真正的动作决定；
> 需要人点头时，由系统出放行卡片。
>
> **EN**: **Retired.** It used to mean the agent asking leave before doing something. Under
> the current rules the agent does not ask a person for authorization: whether an action may
> run is decided by the release judgement on the actual action, and when a person's decision
> is needed the system raises the release card.

- **形态**：过程
- **出处**：[元能力：`Ask()`](../../product/meta-capabilities/design.md#meta-ask)（rev 23）
- **别混**：agent 主动问人的只有[问询](#ul-inquiry--问询--inquiry)，它不产生许可

### UL-session-authorization-context · 会话授权上下文 · Session Authorization Context

> **中**：一个会话承载的、作用域为这一次或本会话的授权表达，按先后顺序保存的流水。
> **它是流水，不是结论**——给出是一笔，**撤回也是往后再记一笔**，
> **只追加，不回头改**。「此刻这个动作准不准」不写在里面，
> 是**按这份流水实时算出来的**，算的时候连同
> [权限设置](capabilities-and-composition.md#ul-permission--权限--permission)与会话运行模式一起判。
>
> **EN**: The ledger of authorization expressions scoped to this action or this session,
> kept in the order they were expressed. It is **a ledger, not a verdict** — granting is one entry, **and so is
> revoking**; entries are **only ever appended**. Whether a given action is permitted right
> now is **not stored there but computed from it**, together with the permission settings and
> the session's run mode.

- **形态**：对象
- **出处**：[元能力：会话授权上下文](../../product/meta-capabilities/design.md#会话授权上下文)（rev 23）
- **注意 ①**：**流水里的每一笔是一次[授权表达](#ul-authorization-expression--授权表达--authorization-expression)**，
  **三个维度**——**来源**（结构化：界面上对着条目操作 / **语义化：用嘴说**）、
  **方向**（给出 / 撤回）、**作用域**（这一次 / 本会话 / **全局，即本租户下未来所有会话**）。
  **⚠️ 作用域为「全局」的那一笔不在这份流水里**——
  [具备资格的主体按规则将其写入租户层权限设置](../../product/meta-capabilities/design.md#会话授权上下文)，表达与写入成功分别判断
- **注意 ②**：**它不挑来源。**放行卡片上点的档位算，
  放行卡片上自由作答里写的算，
  **agent 压根没问、用户主动说的也算**
- **注意 ③**：**作用域是用户表达出来的，不是系统替他归的类**——
  系统只负责**准确理解**。**替他作主不允许**；
  **他没说清的时候，按最窄的那一档算**（[授权意图明确而作用域含糊时取最窄范围](../../product/meta-capabilities/design.md#会话授权上下文)）
- **注意 ④**：**表达得出，不等于生效。**一个作用域能不能真落地，
  仍按[他自己的身份与权限](scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)判——
  **会话里坐着的那个人，未必是设权限的那个人**
- **注意 ⑤**：**它是数据，不是活物。**
  **[会话被归档它不丢](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#67-归档不动授权)**，
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
> 只追加、不回头改**；全局表达由具备资格的主体按规则写入租户层权限设置，表达不等于设置已经生效。
>
> **EN**: **One countable expression of what a user means about authorization.** Each carries
> a **source** (structured: acting on a specific entry in the interface / semantic: said in
> words), a **direction** (granting / revoking) and a **scope** (this time / this session /
> global); they **have an order** and **are individually identifiable**. Those scoped to
> **this time** or **this session** are **appended** to the session authorization context —
> appended only, never rewritten. Global expressions require an authorized actor to
> write the tenant-level permission setting; an expression alone does not establish
> that the setting is effective.

- **形态**：对象
- **出处**：[元能力：一笔授权表达有三个维度](../../product/meta-capabilities/design.md#会话授权上下文)（rev 23）
- **别混**：**不是[会话授权上下文](#ul-session-authorization-context--会话授权上下文--session-authorization-context)**——
  那是流水**整份**，这是流水里的**一笔**
- **注意 ①**：**撤回也是一笔**——**不是把先前那笔擦掉**，是往后再记一笔
- **注意 ②**：**[放行判断的第 ③ 步拿它算](../../product/meta-capabilities/design.md#动作放行与环境准入)**：
  权限结果为「问一下」时，按本会话流水（本会话 ＋ 这一次）判断这次动作是否已获准。
  由全局那一档落成的租户层权限值不在这一步，它在第 ① 步随权限设置一起求值
- **弃用**：~~「决策记录」~~——**撞[记录条目](record-and-context.md#ul-record-entry--记录条目--record-entry)**，过不了取名那一关

### UL-grant-reference · 授权引用 · Grant Reference

> **中**：一次放行用来点名它凭的那一份授权的值。它写明三样：授权在哪一层（全局，或本会话）；
> 归哪个对象（租户，或会话）；是哪一笔[授权表达](#ul-authorization-expression--授权表达--authorization-expression)、
> 哪一次运行模式的设定，或哪一次权限裁定。它由[放行判断](#ul-admission-decision--放行判断--admission-decision)在放行时给出。
> 那份授权仍由它那一层保存，引用只指向它，寿命跟着那一层。
> 它和放行的结论一起记在这次放行判断的记录里，只记这一处：不交给执行动作的工具，也不复制进别的领域。
>
> **EN**: The value a release carries to name the one authorization the release rests on.
> It states three things: the layer of that authorization (global, or this session); the
> object that keeps it (the tenant, or the session); and which authorization expression,
> run-mode setting or permission verdict it is. The admission decision produces it when it
> releases an action. The authorization stays where its layer keeps it. The reference only
> points to it and lives as long as that layer. It is recorded once, with the release verdict,
> in the record of that admission decision: it is not handed to the tool that runs the action,
> and no other domain copies it.

- **形态**：属性
- **出处**：[元能力：动作放行与环境准入](../../product/meta-capabilities/design.md#动作放行与环境准入)（rev 23）
- **别混**：**不是[放行详情](#ul-release-detail--放行详情--release-detail)**——
  放行详情讲这次调用要做什么，写给人看；授权引用讲这次放行凭什么，记在放行判断的记录里
- **别混**：**不是一次工具调用的引用**——调用引用点名一次调用，授权引用点名一份授权；
  调用的记录会被清理，授权引用不指向它
- **别混**：**不是条目的创建者**——日程、订阅这类由动作创建的条目记的是创建者，不记授权引用
- **注意**：**放行不凭任何授权时没有它**——经 `Tools()` 转调时，`Tools()` 这次调用只核了没被禁止，
  它的放行不带授权引用；被转调的那个动作自己放行时才带

## 外面怎么进来

### UL-inbound-arrival · 入站到达 · Inbound Arrival

> **中**：**外面要送进一个[会话](agent-runtime-loop.md#ul-session--会话--session)的一件事，
> 被受理之后成为的那条事实。**受理**是一个动作，不是一个通道**——
> 东西送到了不等于被受理；**受理以完整持久提交为准**。普通消息的受理事实与待处理资格一起成立；卡片答复和控制指令记录各自目标与处置责任，不进入普通消息队列。回执未知不表示未受理。
> 它**归属于恰好一个会话**、**有一个来源**，而且**受理了就不会凭空消失**：
> 要么被消费，要么被明确关掉，**两种都留痕**。
>
> **EN**: **A thing from outside, destined for one session, as it exists once it has
> been admitted.** Admission is **an action, not a channel** — something reaching the
> system is not yet admitted. Admission requires a complete durable commit. For ordinary messages, the admission fact and pending eligibility take effect together. Card replies and control commands retain their own targets and handling responsibility; they do not enter the ordinary-message queue. A missing acknowledgement does not mean admission failed. It **belongs to exactly one session**, **carries a source**, and **once
> admitted never vanishes silently**: it is either consumed or explicitly closed out,
> and **both leave a trace**.

- **形态**：对象
- **出处**：[PF-014 §4 入站到达](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-014-inbound-intake-and-queueing/design.md#入站到达)（rev 14）
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
- **注意**：只有会成为会话消息的到达才取得待处理资格，这一步叫输入受理（Intake）。卡片答复回到等待的拥有者，控制指令交它的处理方，它们不经输入受理。见 [C-89](../conflicts.md#c-89入站到达与输入受理的范围)


### UL-background-result-eligibility · 后台结果投递资格 · Background Result Eligibility

> **中**：**一次转了后台的工具执行，它的真实结局还能不能作为一条[入站到达](#ul-inbound-arrival--入站到达--inbound-arrival)进入原会话。**
> 它随原调用成立。**会话被归档**，它就撤销；**单独停止这一次调用不撤销它，取消原来那一轮 Run 也不撤销它**。
> 撤销之后，结局照样保存、照样查得到，只是不再成为输入。
>
> **EN**: **Whether the real outcome of a backgrounded tool execution can still enter its
> original session as an inbound arrival.** It starts with the original call. Archiving the
> session revokes it. Stopping that one call does not revoke it, and cancelling the original
> run does not revoke it. After revocation the outcome is still kept and can still be read,
> but it does not become an input.

- **形态**：属性
- **出处**：[会话与工作「一次工作可以等待、恢复和并行调用」](../../product/sessions-and-work/design.md#一次工作可以等待恢复和并行调用)（rev 13）
- **别混**：**它不是工具结果的交付。**交付是 Tool 把结果推给受理时冻结的消费位置，有没有这项资格都照推；
  这项资格只管结局能不能再进会话，成为一条输入
- **注意 ①**：裸写「投递资格」只在讲后台结局的一段里作数；跨 topic 引用写正式名
- **注意 ②**：资格在不等于会叫醒。被单独停止过的调用，结局是[不叫醒的输入](#ul-non-waking-input--不叫醒的输入--non-waking-input)

### UL-non-waking-input · 不叫醒的输入 · Non-waking Input

> **中**：**一条已经受理、但不能单独使会话开始一轮工作的[入站到达](#ul-inbound-arrival--入站到达--inbound-arrival)。**
> 会话有未终结的 Run 时，它照常由该 Run 承接；没有时，它留在待处理里，由下一次工作一并承接。
> 现有两种：用户停止一项后台工具时的停止提醒，与被单独停止过的调用的结局。
>
> **EN**: **An inbound arrival that is admitted but cannot, by itself, make the session start
> a run.** When the session has a run that has not ended, that run takes it as usual. When
> there is none, it stays pending and the next run takes it with its first batch. There are
> two kinds now: the stop notice for a background tool that a user stopped, and the outcome
> of a call that was stopped by itself.

- **形态**：变体（父：[入站到达](#ul-inbound-arrival--入站到达--inbound-arrival)）
- **出处**：[会话与工作「一次工作可以等待、恢复和并行调用」](../../product/sessions-and-work/design.md#一次工作可以等待恢复和并行调用)（rev 13）
- **别混**：**它不是被留存的结局。**被留存的结局不成为输入，模型读不到；不叫醒的输入是输入，模型在下一次承接时读到
- **注意**：一条输入叫不叫醒由它的[输入来源](#ul-input-source--输入来源--input-source)决定，在受理时定下，之后不改


### UL-input-source · 输入来源 · Input Source

> **中**：**一个业务向会话登记的、说明「这类输入是谁、凭什么送来」的那份声明。**
> 登记之后这个业务就能给会话送输入，会话不认识它是谁；卸下之后新的输入送不进来，已经受理的不受影响。
> 声明写：名字、给人看的名字、接受哪一类主体、送来的输入能不能单独引起一轮工作。
> 它不写作者角色：一条输入是用户消息还是系统提醒，由送它的主体是不是用户本人决定。
> 登记不等于许可：许不许往某个会话送，每一次受理另外核对。
>
> **EN**: **The declaration a business registers with sessions, stating who sends this kind of
> input and on what grounds.** Once registered, the business can submit inputs and sessions do not
> know who it is. Once withdrawn, new inputs are not admitted and admitted ones are unaffected. The
> declaration gives a name, a label for people, the kind of principal it accepts, and whether its
> inputs can start a run by themselves. It does not give the author role: an input is a user
> message only when the principal that sent it is the user in person. Registration is not
> permission; whether a submission to one session is allowed is checked at every intake.

- **形态**：对象
- **出处**：[会话与工作「别的业务也能把事情交给会话」](../../product/sessions-and-work/design.md#别的业务也能把事情交给会话)（rev 13）
- **别混 ①**：不是[来源标记](record-and-context.md#ul-source-tag--来源标记--source-tag)。来源标记是一条输入身上记着的那个值；输入来源是登记的那份声明，标记的值取自它的名字
- **别混 ②**：不是[通知来源](#ul-notification-source--通知来源--notification-source)。通知来源向通知登记，说的是谁在发事件；输入来源向会话登记，说的是谁在送输入
- **注意**：身份是它的名字，`<领域>.<名字>`。同名的第二份登记失败，不覆盖


### UL-input-fate · 输入的去向 · Input Fate

> **中**：**一条已受理的输入现在在哪一步：还在待处理、被哪一轮工作接下了、那一轮怎样结束、或者它随取消与归档了结了。**
> 它只按这条输入自己在会话日志里的记录算出，任一时刻恰有一个答案。会话里最新的一条回复不是它。
>
> **EN**: **Where one admitted input stands now: still pending, taken by which run, how that run
> ended, or closed out by a cancellation or an archive.** It is computed only from the records of
> that input in the session log, and has exactly one answer at any time. The latest reply in the
> session is not it.

- **形态**：视图
- **出处**：[会话与工作「别的业务也能把事情交给会话」](../../product/sessions-and-work/design.md#别的业务也能把事情交给会话)（rev 13）
- **别混**：不是提交的结局。结局答「这一次送，会话接下了没有」；去向答「接下之后它怎样了」


### UL-history-search · 搜历史 · History Search

> **中**：**在一个租户的全部会话历史里，按范围、类型与内容找出具体的消息。**
> 内容条件是一个或几个词，或一条正则表达式。每个命中指到一条消息，可以从它往前往后读上下文。
> 它如实说明找全了没有：来不及找完时写明没有找全，不说成没有。
>
> **EN**: **Finding specific messages in all session histories of one tenant by scope, type and
> content.** The content condition is one or more words, or one regular expression. Each hit points
> at one message, and the history can be read forward and backward from it. It states whether the
> search was complete: when it could not finish, the answer says so and does not say there is none.

- **形态**：过程
- **出处**：[会话与工作「在全部会话里找到说过的话」](../../product/sessions-and-work/design.md#在全部会话里找到说过的话)（rev 13）
- **别混**：不是搜会话。搜会话按标题找会话；搜历史按消息里的字找到具体的那句话


### UL-history-index · 历史索引 · History Index

> **中**：**为[搜历史](#ul-history-search--搜历史--history-search)加速的那份索引。**
> 它从各个会话的日志算出，丢了能重算，可以落后于日志。它只帮着缩小要看的范围：一条消息算不算命中，以会话日志里的原文为准。
>
> **EN**: **The index that speeds up history search.** It is computed from the session logs, can be
> rebuilt when lost, and may lag behind the logs. It only narrows what has to be looked at: whether a
> message is a hit is decided by the original text in the session log.

- **形态**：视图
- **出处**：[会话与工作「在全部会话里找到说过的话」](../../product/sessions-and-work/design.md#在全部会话里找到说过的话)（rev 13）
- **别混**：不是会话日志。它不保存任何别处没有的事实


### UL-background-call-number · 后台调用短号 · Background Call Number

> **中**：**会话给一项[后台执行](execution-and-outcome.md#ul-background-execution--后台执行--background-execution)的会话内编号：`b` 加它在本会话转后台的先后。**
> 它在这次调用转后台时定下，会话内唯一，不复用，重放之后不变。人和 agent 用它指认一项后台执行；
> 它不是调用的身份，出了这个会话没有意义。
>
> **EN**: **The number that a session gives to one background execution: `b` and the order in
> which the call moved to the background in this session.** It is fixed when the call moves to
> the background. It is unique in the session, is not used again, and does not change on
> replay. People and agents use it to point at one background execution. It is not the
> identity of the call and has no meaning outside this session.

- **形态**：属性
- **出处**：[工具执行「前台和后台是等待与交付方式」](../../product/tool-execution/design.md#前台和后台是等待与交付方式)（rev 15）
- **别混**：**它不是调用引用。**调用引用是 Tool 认得的身份，跨会话有效；短号只在一个会话里指认一项

### UL-inbound-target · 投递目标 · Inbound Target

> **中**：**[连接件](capabilities-and-composition.md#ul-connector--连接件--connector)的一项[落点与身份类](capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category)设置：它送进来的外部消息进哪个[会话](agent-runtime-loop.md#ul-session--会话--session)。**
> **它是连接件[两种投递方式](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#两种投递方式动作主体不同)里 ①「已有的会话开口接收」那一路的配置，本版只指一个已有的会话**——走这一路送进来的都落进那一个；按对面的线程分进不同会话，本版没有。
> **连接件的事件经受理开出一个新会话是另一种方式（②）**，它的配置是触发会话的默认运行模式，不是这一项；受理怎么开那个新会话归 PF-014，新会话怎么建归 PF-015。
> 各层按持有配值，**工作区那一级配不了它**。
>
> **EN**: **A placement-and-identity setting on a connector: which session the external messages it
> brings in go to.** **It configures mode ① of the connector's two delivery modes — an existing session
> opening itself to receive — and in this version names exactly one existing session**; everything delivered
> that way lands there, and splitting the far side's threads across sessions does not exist in this version.
> **A connector event opening a new session through intake is the other mode (②)**, configured by the default
> run mode for triggered sessions, not by this entry; how intake opens that session belongs to PF-014 and how
> the session is created to PF-015. Layers assign it through their holdings; **the workspace level cannot set
> it**.

- **产品状态**：随连接件存在性讨论搁置，保留为条件性定义，不构成当前交付承诺。
- **形态**：属性
- **出处**：[PF-002 §4 Connector](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#connector) · [两种投递方式](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#两种投递方式动作主体不同) ·
  [§5.2 设置项分四类](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)（rev 32） ·
  [PF-014 §5.7 穷举一](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-014-inbound-intake-and-queueing/design.md#57-穷举一什么会让队列从空变成非空)（rev 14）
- **别混 ①**：**不是[交付面](#ul-delivery-surface--交付面--delivery-surface)**（Delivery Surface）——那是人碰到这个系统的那一面，这里是连接件把外面的消息送往哪里
- **别混 ②**：**不是[连接目标](capabilities-and-composition.md#ul-connection-target--连接目标--connection-target)**——那是 MCP 接入点往外连到哪，方向相反
- **注意**：送进来的消息**受理之后怎么走**，归[入站到达](#ul-inbound-arrival--入站到达--inbound-arrival)那一套，与它无关

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
- **出处**：[PF-015 §4 业务流程拓展点](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#业务流程拓展点) · [§6.6](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#66-跑题只提醒不阻拦)（rev 21）
- **⚠️ 别混**：**它不是 [Loop 拓展点](agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point)**——
  **那一类只能靠改会话日志起作用**，这一类恰恰一个字都不能改。
  两者是**并列的两类拓展点**，不是同一类的两个位置
- **注意 ①**：**被拦下的东西，系统不持有。**它没有被
  [受理](#ul-inbound-arrival--入站到达--inbound-arrival)，
  **请求就地返回给发起方，到此为止**；用户若再来，那是**全新的一次请求**
- **注意 ②**：**因此「一直不确认」没有后果**——没有待办、没有草稿、没有超时，什么都没留下
- **注意 ③**：**这一类拓展点归会话一侧拥有**：消息持久化归会话，所以消息持久化前后对输入的处理，例如斜杠命令的展开、脱敏与否决，挂在这一类拓展点上，不挂在 [Loop 拓展点](agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point)上。已有实例是[会话跑题的提醒](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#66-跑题只提醒不阻拦)。归属的裁定见 [C-61](../conflicts.md#c-61斜杠命令受理依赖已移除的位置)
- **注意 ④**：它是[拓展点](architecture-core-and-extension.md#ul-extension-point--拓展点--extension-point)的一种，宿主是会话

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
- **出处**：[PF-014 §4 控制指令](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-014-inbound-intake-and-queueing/design.md#控制指令)（rev 14）
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
- **出处**：[PF-014 §4 插队](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-014-inbound-intake-and-queueing/design.md#插队)（rev 14）
- **别混 ①**：**它不终止[运行](agent-runtime-loop.md#ul-run--运行--run)。**
  这是它与**取消**最要紧的差别：取消让运行落终态，
  **插队只是把运行推到下一次取消息那一点**，运行一直活着
- **别混 ②**：**名字容易误导：它插的不是别人的位置，是时间。**
  队首那一项是它的落脚处，**不是它的目的**——两条路最终都走到同一个地方（取一批消息），
  插队只是**把中间那段间隔压到最短**
- **注意 ①**：**它是系统唯一的加急通道**，[不设第二种优先级](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#先到先处理只有一个例外)
- **注意 ②**：**它会解除 loop 里各种等待态**，其中悬着的[决策卡片](#ul-decision-card--决策卡片--decision-card)
  按「**人明确拒绝回复**」处置——**取消视作拒绝是无副作用可逆的，反过来不是**
- **注意 ③**：**被它中断的模型回复不交出动作**——参数已经收齐、还没执行的工具调用也不执行，
  留在那条被中断的消息里，agent 读完新话自己决定要不要重新发起（[PF-014 §5.4](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-014-inbound-intake-and-queueing/design.md#54-插队停在哪就怎么办)）

## 人从哪一面碰到它

### UL-delivery-surface · 交付面 · Delivery Surface

> **中**：系统把[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)**投影给人看**、
> 并把**人做的事送进[受理](#ul-inbound-arrival--入站到达--inbound-arrival)**的那一面的总称。
> **两条性质缺一不可**：**它不持有任何领域事实**——屏上的每一条都指得回日志里的一条，
> 它提交的每一件事都成为一条[入站到达](#ul-inbound-arrival--入站到达--inbound-arrival)、
> 一条卡片答复或一条[控制指令](#ul-control-command--控制指令--control-command)；
> **它也没有自己的领域语义**——凡是在它上面能做的事，**都是别处已经定义过的动作**，它不新开任何通路。
> **有两种：装在用户自己机器上的命令行应用，以及桌面应用。**
>
> **EN**: The class of surfaces through which the system **projects the session log to a
> person** and **feeds what that person does into intake**. **Two properties, both
> required**: it **holds no domain fact of its own** — every line on screen points back to
> an entry in the log, and everything it submits becomes an inbound arrival, a card answer
> or a control command; and it **has no domain semantics of its own** — every action
> available on it **is one defined elsewhere**, and it opens no new path. **There are two
> kinds: a command-line application installed on the user's own machine, and the desktop
> application.**

- **形态**：总称
- **出处**：[PF-016 §4 交付面](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#交付面) ·
  [§5.3](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#53-屏上的每一条都指得回日志里的一条) ·
  [§5.4](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#54-人做的每一件事走的都是已有的路)（rev 13） ·
  [桌面应用「产品需求描述」](../../product/desktop-application/design.md#产品需求描述)（rev 12）
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
- **出处**：[PF-016 §4 呈现形式](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#呈现形式) ·
  [§5.5](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#55-两种呈现形式同一份事实)（rev 13）
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
- **出处**：[PF-016 §4 观感偏好](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#观感偏好) ·
  [§6.12](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#612-观感偏好不改变任何领域行为)（rev 13）
- **⚠️ 别混**：**不是[元 runtime context](scope-and-resolution.md#ul-meta-runtime-context--元-runtime-context--meta-runtime-context)
  必需感知里的「账号偏好」**（语言 · 时区 · 地区 · 明暗风格一类）——
  **那些是要被 agent 感知的**，[已经是每个会话必带的一项](../../product/runtime-context/design.md#3-必需感知按内容及消费者供给)，
  **不在这里，也不由这里定**；两者同样由账号承载（[C-26 的处置](../conflicts.md#现有冲突)），但一个进会话、一个不进
- **注意**：[宿主不是词条的字段](../conventions.md#形态这个词指的是哪一类东西)——「由账号承载」写进定义，
  是因为[PF-016 明文把它归进个人 context](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/.meta_harness/design/product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#观感偏好)，
  那是所指的一部分，不是架构分解的结论

---

### UL-public-observation · 公开观察 · Public Observation

> **中**：**[公开协议](architecture-core-and-extension.md#ul-public-protocol--公开协议--public-protocol)里的一类成员，与操作并列。**
> 客户端发一次调用建立它，之后服务端按顺序一帧一帧送出某项状态的进行中投影，直到带着原因结束。
> 它不另存一份：断了就重新建立，内容从上游重新算出。客户端发给服务端的一切仍然走操作。
>
> **EN**: **One kind of member of a public protocol, beside operations.** The client establishes
> it with one call. The server then sends, frame by frame and in order, the live projection of
> some state, until the observation ends with a reason. It keeps no copy: after a disconnect the
> client establishes it again, and the content is computed again from its source. Everything from
> the client to the server still goes through operations.

- **形态**：视图
- **出处**：[RFC-0015「概念」](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/docs/rfcs/RFC-0015-access-dynamic-registration.md#1-概念) ·
  [「观察中枢」](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/docs/rfcs/RFC-0015-access-dynamic-registration.md#观察中枢)（revision 1，PanQiWei 2026-11-12 采用）
- **别混 ①**：不是[工程遥测](record-and-context.md#ul-engineering-telemetry--工程遥测--engineering-telemetry)。
  工程遥测是给工程诊断留的记录；公开观察是给客户端看的进行中状态。
- **别混 ②**：观察者收到一帧，不表示业务已经消费了这一帧里的内容。
- **别混 ③**：不是实时媒体的通道。观察送的是事实，每一帧都要有着落；通道送的是媒体，晚到就丢。

---

### UL-app-shell · 界面外壳 · App Shell

> **中**：**一种应用形态自己的那部分界面代码**：窗口、导航，以及它声明的
> [界面插入位置](#ul-ui-slot--界面插入位置--ui-slot)。它是承载[界面模块](#ul-ui-module--界面模块--ui-module)的一方，
> 不含任何领域的代码。去掉一个领域的界面模块，外壳照常运行。
>
> **EN**: **The part of the user interface code that belongs to one application form**: the
> window, the navigation, and the UI slots that it declares. It is the host of UI modules and
> contains no code of any domain. When the UI module of a domain is removed, the shell still runs.

- **形态**：属性
- **出处**：[RFC-0015「概念」](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/docs/rfcs/RFC-0015-access-dynamic-registration.md#1-概念) ·
  [「外壳与界面模块」](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/docs/rfcs/RFC-0015-access-dynamic-registration.md#外壳与界面模块)（revision 1，PanQiWei 2026-11-12 采用）
- **别混**：不是执行环境里的 shell，也不是名叫 Shell 的工具。英文正式名带 `App`。

---

### UL-ui-module · 界面模块 · UI Module

> **中**：**一个领域在客户端的界面部分**，是客户端装配树上的一个 Cordis 插件。
> 它声明自己依赖哪些[公开协议](architecture-core-and-extension.md#ul-public-protocol--公开协议--public-protocol)的客户端，
> 并往[界面插入位置](#ul-ui-slot--界面插入位置--ui-slot)里放东西。它依赖的协议在
> [协议可用性](reach-and-availability.md#ul-protocol-availability--协议可用性--protocol-availability)里出现时它加载，
> 消失时它卸载，它放的东西随之撤掉。
>
> **EN**: **The user interface part of one domain on the client**, a Cordis plugin on the client
> assembly tree. It declares which public protocol clients it depends on, and it puts content into
> UI slots. It loads when the protocols it depends on appear in the protocol availability, and it
> unloads when they disappear. What it put into the slots is removed with it.

- **形态**：属性
- **出处**：[RFC-0015「概念」](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/docs/rfcs/RFC-0015-access-dynamic-registration.md#1-概念) ·
  [「外壳与界面模块」](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/docs/rfcs/RFC-0015-access-dynamic-registration.md#外壳与界面模块)（revision 1，PanQiWei 2026-11-12 采用）
- **别混**：不是协议客户端。协议客户端是一个协议在客户端的一组方法；界面模块是用这些方法画界面的那部分。

---

### UL-ui-slot · 界面插入位置 · UI Slot

> **中**：**[界面外壳](#ul-app-shell--界面外壳--app-shell)声明的、[界面模块](#ul-ui-module--界面模块--ui-module)可以往里放东西的一个具名位点。**
> 它由外壳的契约在设计时列出，不在运行期创建。种类是「只放一个」或「放一列」。
>
> **EN**: **A named point that an app shell declares, where UI modules can put content.** The
> shell contract lists the slots at design time; they are not created at run time. A slot holds
> either one item or a list of items.

- **形态**：位置
- **出处**：[RFC-0015「概念」](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/docs/rfcs/RFC-0015-access-dynamic-registration.md#1-概念) ·
  [「外壳与界面模块」](https://github.com/nemori-ai/omne-harness-lite/blob/1bbd0d6d6439441235da873e4a73b174f04fa3a0/docs/rfcs/RFC-0015-access-dynamic-registration.md#外壳与界面模块)（revision 1，PanQiWei 2026-11-12 采用）
- **别混**：不是 [Loop 拓展点](agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point)。
  Loop 拓展点在 agent loop 的运行流程上；界面插入位置在客户端的界面上。
- **注意**：它是[拓展点](architecture-core-and-extension.md#ul-extension-point--拓展点--extension-point)的一种，宿主是界面外壳，放进来的一项来自界面模块。

---

### UL-ui-part · 界面部位 · UI Part

> **中**：**界面上一种有名字、可以被指认的东西**，由画它的[界面模块](#ul-ui-module--界面模块--ui-module)声明：
> 名字、给人看的叫法、一句说明、它可以出现在哪些界面部位里。
> 同一种界面部位可以同时在屏幕上画好几处。人指的、agent 改的，按这个名字说。
>
> **EN**: **A named kind of thing on the user interface that can be pointed at**, declared by the
> UI module that draws it: a name, a label for people, a one-line summary, and the UI parts it can
> appear in. One UI part can be drawn in several places on the screen at once. What a person points
> at and what the agent changes are named by this name.

- **形态**：位置
- **出处**：[桌面应用：开发模式](../../product/desktop-application/design.md#开发模式)（rev 12）
- **别混**：不是[界面插入位置](#ul-ui-slot--界面插入位置--ui-slot)。界面插入位置是界面模块往里放东西的地方；界面部位是画出来、能被指认的东西。
- **注意**：屏幕上的一处是它此刻的一个实例，没有名字，也没有跨时间的身份。一个没有声明名字的页面元素不是界面部位。

---

### UL-ui-developer-mode · 界面开发模式 · UI Developer Mode

> **中**：**一个图形[交付面](#ul-delivery-surface--交付面--delivery-surface)上的开关。**
> 开着时，人可以在界面上选取[界面部位](#ul-ui-part--界面部位--ui-part)，把选中的随消息交给 agent。
> 关着时，交付面的行为与没有这个开关时相同。正文里没有歧义时简称「开发模式」。
>
> **EN**: **A switch on a graphical delivery surface.** While it is on, a person can pick UI parts
> on the interface and hand the picks to the agent with a message. While it is off, the surface
> behaves as if the switch did not exist.

- **形态**：状态
- **出处**：[桌面应用：开发模式](../../product/desktop-application/design.md#开发模式)（rev 12）
- **别混**：不是应用的开发构建，也不是给开发者调试用的检查器。它是给使用者的。

---

### UL-ui-selection · 界面选择 · UI Selection

> **中**：**一条输入里的一部分：人在一个[交付面](#ul-delivery-surface--交付面--delivery-surface)上选中的一组[界面部位](#ul-ui-part--界面部位--ui-part)的各一处，每处带一个序号。**
> 它记下每一处是哪个界面部位、是同类里的第几处、画的是什么。输入被受理之后它不变。
>
> **EN**: **A part of one input: the places of UI parts that a person picked on one delivery
> surface, each with a number.** For each place it records which UI part it is, which one of its
> kind it is, and what it draws. It does not change after the input is accepted.

- **形态**：属性
- **出处**：[桌面应用：开发模式](../../product/desktop-application/design.md#开发模式)（rev 12）
- **别混**：不是人写的字里的引用。它和人写的字分开，标题与搜索不含它。
- **注意**：它是选中那一刻的记录。之后界面变了，它不变。还没随消息发出去的那一份只在交付面里，不是输入的一部分。

---

### UL-asset-page · 资产页 · Asset Page

> **中**：**桌面应用里人管理本租户各类资产的那一部分。**
> 它按资产的类别分开，每一类在左边的一条栏里占一行。它自己只有页标题与这条栏；选中一行，右边是那一类的[资产类别页面](#ul-asset-category-page--资产类别页面--asset-category-page)。
> 一份资产自己的设置在这里改，不在「设置」那一部分。
>
> **EN**: **The part of the desktop application where a person manages the assets of the tenant.**
> It is divided by asset category, and each category has one row in a rail on the left. The page
> itself has only a title and this rail. When a row is selected, the asset category page of that
> category shows on the right. A person changes the
> settings of an asset here, not in the Settings part.

- **形态**：位置
- **出处**：[桌面应用「资产」](../../product/desktop-application/design.md#资产)（rev 12）
- **别混**：不是「设置」那一部分：设置只放不属于任何一份资产的设置项。
  不是[界面插入位置](#ul-ui-slot--界面插入位置--ui-slot)：它是资产的界面模块放进外壳「页面」这个位置里的一项。

---

### UL-asset-category-page · 资产类别页面 · Asset Category Page

> **中**：**一类资产在[资产页](#ul-asset-page--资产页--asset-page)里自己的那一页。**
> 它由这一类资产的[界面模块](#ul-ui-module--界面模块--ui-module)带来，画什么、怎样排由这一类自己定。
> 这一类没有带来时用通用的页面：列出这个租户这一类正持有的资产，点开一份看它的[资产简介](capabilities-and-composition.md#ul-asset-summary--资产简介--asset-summary)、内容与设置项，并在这里新建、禁用、启用、移除。同一类至多一页。简称类别页面。
>
> **EN**: **The page that one asset category has inside the asset page.** The UI module of that
> category brings the page, and the category decides what the page shows and how. When the
> category brings no page, a general page is used. The general page lists the assets of that
> category that the tenant holds. A person opens one asset to see its asset summary, its content
> and its setting entries, and creates, disables, enables and removes assets there. One category
> has at most one page.

- **形态**：视图
- **出处**：[桌面应用「资产」](../../product/desktop-application/design.md#资产)（rev 12）
- **别混**：不是资产本身，也不存任何事实：页面上的每个值取自服务端此刻的答复。
  有没有这一页只说明这次部署装没装这一类的界面，不说明这个人许不许用这一类资产。
- **注意**：它是放进资产页的[拓展点](architecture-core-and-extension.md#ul-extension-point--拓展点--extension-point)的一项[拓展贡献](architecture-core-and-extension.md#ul-extension-contribution--拓展贡献--extension-contribution)。

---

### UL-asset-governance-port · 资产治理口 · Asset Governance Port

> **中**：**资产的界面模块交给一类资产的界面模块的一个口。**
> 经它拿得到：这一类资产在一个租户下有哪些份，每一份的[资产简介](capabilities-and-composition.md#ul-asset-summary--资产简介--asset-summary)、内容、设置项与它们此刻的值，改与清除这些值的操作，新建、启用、禁用、移除一份资产的操作，以及现成的默认部件。
> 类别的界面模块声明自己要的形状，资产的界面模块来适配，应用的装配把它交过去；两个界面模块互不导入。
>
> **EN**: **A port that the UI module of assets gives to the UI module of one asset category.**
> Through it the category gets the assets of that category in one tenant, the asset summary, the
> content and the setting entries of each asset with their current values, the operations that
> change or clear those values, the operations that create, enable, disable and remove an asset,
> and ready-made default parts. The UI module of the category declares the shape that it needs. The
> assets UI module adapts to that shape, and the application assembly passes the port on. The
> two UI modules do not import each other.

- **形态**：位置
- **出处**：[跨系统技术约定「拓展点的共同契约」](../../../../docs/architecture/cross-cutting-concepts.md#拓展点的共同契约)（PanQiWei 2026-11-17 交办定义，卡 #1332）
- **别混**：不是[公开协议](architecture-core-and-extension.md#ul-public-protocol--公开协议--public-protocol)：它不隔着网络，在客户端的同一棵插件树上。
  不是[拓展点](architecture-core-and-extension.md#ul-extension-point--拓展点--extension-point)：拓展点让贡献流向宿主，它让宿主的能力流向贡献方。
  规则不由它判：一项能不能改、秘密给不给，都由服务端的答复说。

---

### UL-agent-figure · Agent 形 · Agent Figure

> **中**：**桌面应用里代表 agent 的那一个墨圆**：一支毛笔写出，留一个口。
> 屏幕上同一时刻只有一个。它在窗口里坐在[形座位](#ul-figure-seat--形座位--figure-seat)上，用自己的笔画说出它代表的会话此刻在做什么，并在口外写出[待答数](#ul-awaiting-answer-count--待答数--awaiting-answer-count)。
> 人可以把它拿起来；拿出窗口放下，它留在桌面上，画在[桌面层](#ul-desk-layer--桌面层--desk-layer)里，仍然是这一个。
> 人看着某个会话时，它代表这个会话的 agent；人没在看任何会话时，它代表这个租户的全部会话。
> 它不存任何事实：它的样子每次从会话报出的状态与待答数算出。简称形。
> 一套[皮肤](capabilities-and-composition.md#ul-skin--皮肤--skin)可以换它看起来的样子；它是哪一个、坐在哪、代表谁、在做什么时怎样表示，都不因此改变。
>
> **EN**: **The one ink circle that stands for the agent in the desktop application.** One brush
> stroke writes it, and it has an open gap. The screen shows exactly one at a time. In the window it
> sits on a figure seat. Its own strokes show what the session it stands for is doing now. It writes
> the awaiting-answer count outside its gap. A person can lift it. When the person drops it outside
> the window, it stays on the desktop. The desk layer draws it there, and it is still the same one. When the person looks at a session, it stands for the agent
> of that session. When the person looks at no session, it stands for all sessions of the tenant.
> It keeps no facts. Each time, the application computes its look from the state that sessions
> report and from the awaiting-answer count.
> A [skin](capabilities-and-composition.md#ul-skin--皮肤--skin) can change how it looks. Which figure it is, where it sits, what it
> stands for and what it shows of the work stay the same.

- **形态**：视图
- **出处**：[桌面应用「Agent 在屏幕上的形」](../../product/desktop-application/design.md#agent-在屏幕上的形)（rev 12）
- **别混**：不是图标、头像或产品标志。不是 agent 本身：形只是 agent 在桌面应用里的样子，不带 agent 的任何事实。
  在桌面上的形不是另一个东西：它离开的座位空着，回去时还是坐那个座位。

---

### UL-figure-seat · 形座位 · Figure Seat

> **中**：**界面里给 [Agent 形](#ul-agent-figure--agent-形--agent-figure)留出的一处固定位置。**
> 座位自己不画任何东西，只给出一个中点。桌面应用的登录门与[正面](#ul-application-face--应用的面--application-face)上有三个：登录门的上方（门）、正面侧栏的左上角（家）、正面对话页的头部（对话头）。
> 人在反面时，形坐在反面上的座位上，那个座位由[画布](#ul-canvas--画布--canvas)放在纸的中间。收起的那一面不给形座位。
> 几个座位同时看得见时，形坐优先级最高的那一个；形离开的座位上什么都不留。
>
> **EN**: **A fixed place in the interface for the agent figure.** A seat draws nothing
> itself and only gives a centre point. The sign-in gate and the front face of the desktop
> application have three seats. The gate is above the sign-in gate. Home is the top-left corner of
> the sidebar on the front face. The conversation header is in the header of the conversation page
> on the front face. When the person is on the back face, the figure sits on the seat of the back
> face, which the canvas puts in the middle of its sheet. The hidden face gives the figure no seat.
> When several seats are visible, the figure sits on the one with the highest priority. A seat that
> the figure left shows nothing.

- **形态**：位置
- **出处**：[桌面应用「Agent 在屏幕上的形」](../../product/desktop-application/design.md#agent-在屏幕上的形) · [「两面与翻面」](../../product/desktop-application/design.md#两面与翻面)（rev 12） ·
  [画布「应用的两面」](../../product/canvas/design.md#应用的两面)（rev 2）
- **别混 ①**：不是[界面插入位置](#ul-ui-slot--界面插入位置--ui-slot)：插入位置里放的是界面模块的一项；座位上只坐形。
- **别混 ②**：画布中间的座位不叫家。家只指正面侧栏左上角的那一个座位，[告知笺](#ul-told-note--告知笺--told-note)写在它旁边。

---

### UL-figure-port · 形口 · Figure Port

> **中**：**[界面外壳](#ul-app-shell--界面外壳--app-shell)交给[界面模块](#ul-ui-module--界面模块--ui-module)的一个口**：
> 界面模块经它报出它代表的会话此刻在做什么，以及它算出的[待答数](#ul-awaiting-answer-count--待答数--awaiting-answer-count)；外壳把各个模块的报告合起来，画出 [Agent 形](#ul-agent-figure--agent-形--agent-figure)。
> 报告绑在报告方的作用域上，报告方卸载时撤掉。报告只交数据，没有结果。
>
> **EN**: **A port that the app shell gives to UI modules.** Through it, a UI module reports what
> the session it stands for is doing now. It also reports the awaiting-answer count that it
> computed. The shell
> combines the reports of all modules and draws the agent figure. A report is bound to the scope of
> the module that made it and is withdrawn when that module unloads. A report hands over data only
> and has no result.

- **形态**：位置
- **出处**：[桌面应用「Agent 在屏幕上的形」](../../product/desktop-application/design.md#agent-在屏幕上的形)（rev 12）
- **别混**：不是[资产治理口](#ul-asset-governance-port--资产治理口--asset-governance-port)：那个口让宿主的事实与操作流向贡献方；形口让贡献方的数据流向外壳。
  报了一条不表示人看到了。
- **注意**：它是[宿主交给贡献方的口](../../../../docs/architecture/cross-cutting-concepts.md#宿主交给贡献方的口)的一个，宿主是界面外壳。

---

### UL-awaiting-answer-count · 待答数 · Awaiting-Answer Count

> **中**：**一个租户的[决策池](#ul-decision-pool--决策池--decision-pool)里此刻等着人回答的[决策卡片](#ul-decision-card--决策卡片--decision-card)的张数**，即待答的问询与放行。
> 桌面应用把它用琥珀色写在 [Agent 形](#ul-agent-figure--agent-形--agent-figure)的口外，导航里「待你决定」后面是同一个数。
> 没了结的[通知](#ul-notification--通知--notification)与[告知笺](#ul-told-note--告知笺--told-note)都不算进去。
>
> **EN**: **The number of decision cards that wait for an answer in the decision pool of one tenant
> now**: the open inquiries and release cards. The desktop application writes it in amber outside
> the gap of the agent figure, and the same number follows the decision page in the navigation.
> Unresolved notifications and told notes do not count.

- **形态**：视图
- **出处**：[桌面应用「Agent 在屏幕上的形」](../../product/desktop-application/design.md#agent-在屏幕上的形)（rev 12）
- **别混**：不是通知的未了结条数：那个数不要人回答，界面上用中性的样子显示。

---

### UL-ink-bubble · 墨框 · Ink Bubble

> **中**：**[Agent 形](#ul-agent-figure--agent-形--agent-figure)展开给人看的内容外面的那一圈墨边。**
> 边从形的口写出，边合上之后内容才出现；收起时内容先走，墨沿来路卷回口里。内容长了在边里面滚，边不动。
> 墨有浓淡两种：浓的用在一两句话，淡的用在一大块内容。
>
> **EN**: **The ink edge around content that the agent figure unfolds for the person.** The figure
> writes the edge out of its gap, and the content appears only after the edge closes. On
> close, the content leaves first and the ink rolls back into the gap along its path. Long content
> scrolls inside the edge, and the edge does not move. The ink has two strengths: full for one or
> two sentences, light for a large block of content.

- **形态**：视图
- **出处**：[桌面应用「Agent 在屏幕上的形」](../../product/desktop-application/design.md#agent-在屏幕上的形)（rev 12）
- **别混**：应用自己的菜单、下拉、提示、确认与常驻在版面里的东西都不是墨框，它们用应用的平样式。

---

### UL-told-note · 告知笺 · Told Note

> **中**：**一个界面部分要临时告诉人一件事时，[Agent 形](#ul-agent-figure--agent-形--agent-figure)在家旁边用浓墨的[墨框](#ul-ink-bubble--墨框--ink-bubble)写出的一句话**，最多三行。
> 同一时刻只有最新的一条。人点它就去它指的那一处；人去了那一处或点掉它，它收回。它不按时间消失。
> 它不存任何东西：写过一条不表示人看到了，关掉窗口它就没有了。
>
> **EN**: **One sentence that the agent figure writes next to home in a full-ink ink bubble.** A
> part of the interface uses it to tell the person something for a moment. It has at most three
> lines. Only
> the newest one shows at a time. When the person presses it, the application goes to the place it
> points to. When the person goes there or dismisses it, it folds back. It does not disappear on a
> timer. It keeps nothing: a told note written does not mean that the person saw it, and closing
> the window removes it.

- **形态**：视图
- **出处**：[桌面应用「Agent 在屏幕上的形」](../../product/desktop-application/design.md#agent-在屏幕上的形)（rev 12）
- **别混**：不是[通知](#ul-notification--通知--notification)：通知在收件箱里有记录，告知笺只是一次提醒的样子。

---

### UL-companion-entry · 随身入口 · Companion Entry

> **中**：**浮在桌面应用整个窗口之上的一处，人在哪一面、哪一页都能按它对 agent 说一句话**，说给一个新会话或某个已有的会话。
> 它浮在两个[应用的面](#ul-application-face--应用的面--application-face)之上，翻面时它不动。
> 人可以把它拖到窗口里任何地方，它留在人放下的地方。它说的话和对话页输入框发的是同一件事。
> 它默认的样子是[墨点](#ul-ink-motes--墨点--ink-motes)，人可以用 plugin 把样子换掉。
>
> **EN**: **A place that floats over the whole window of the desktop application, where a person
> can say a sentence to the agent from any face and any page.** It floats over both application
> faces and does not move when the face turns. The sentence goes to a new session or to an
> existing one. The person can drag it anywhere in the window, and it stays where it was dropped.
> A sentence said through it is the same thing as one sent from the composer of the conversation
> page. Its default look is the ink motes, and a plugin can replace the look.

- **形态**：视图
- **出处**：[桌面应用「随身入口」](../../product/desktop-application/design.md#随身入口)（rev 12）
- **别混**：不是 [Agent 形](#ul-agent-figure--agent-形--agent-figure)：形是 agent 本身，屏幕上只有一个；随身入口是人对 agent 说话的地方，不坐[形座位](#ul-figure-seat--形座位--figure-seat)，不写[待答数](#ul-awaiting-answer-count--待答数--awaiting-answer-count)。

---

### UL-ink-motes · 墨点 · Ink Motes

> **中**：**[随身入口](#ul-companion-entry--随身入口--companion-entry)默认的样子：同一支毛笔点出来的几粒墨，落在一个不画出来的圆上。**
> 圆的口和 [Agent 形](#ul-agent-figure--agent-形--agent-figure)的口开在同一处，人看得出一个圆，纸上没有圆。
> 它只会点与干：没事时静着；打开着的会话在做事时一粒粒重点；被拖起来时只留一粒。
>
> **EN**: **The default look of the companion entry: a few dabs of ink from one brush, set on a
> circle that is never drawn.** The gap of that circle is where the gap of the agent figure is, so
> a person reads a circle though none is on the paper. It only dabs and dries. It is still when
> nothing happens. While the open session is working, the dabs are written again one after another.
> While it is dragged, one dab stays.

- **形态**：视图
- **出处**：[桌面应用「随身入口」](../../product/desktop-application/design.md#随身入口)（rev 12）
- **别混**：不是 [Agent 形](#ul-agent-figure--agent-形--agent-figure)：没有那一笔圆，不算进「屏幕上只有一个形」。不是活动标记：活动标记说某一处在加载，墨点说这里可以对 agent 说话。

---

### UL-desk-layer · 桌面层 · Desk Layer

> **中**：**桌面应用在自己的窗口之外的一块画面**：透明，在所有窗口之上，铺满一块屏，形身边之外的地方点得穿。
> [Agent 形](#ul-agent-figure--agent-形--agent-figure)被拿出窗口时画在它里面，形身边写出的[说话笺](#ul-say-note--说话笺--say-note)与[观测框](#ul-observation-frame--观测框--observation-frame)也画在它里面。
> 它不存任何事实，也不含任何领域的界面：它只照[界面外壳](#ul-app-shell--界面外壳--app-shell)交给它的样子画。它没了，形回到座位上。
>
> **EN**: **A surface of the desktop application outside its own window.** It is transparent, above
> all windows, and covers one screen. Pointer input passes through it except near the figure. It
> draws the agent figure when a person takes the figure out of the window. It also draws the say
> note and the observation frame that the figure writes next to itself. It keeps no facts and holds
> no UI of any domain. It draws only what the app shell hands to it. When it goes away, the figure
> returns to its seat.

- **形态**：位置
- **出处**：[桌面应用「把形拿出窗口」](../../product/desktop-application/design.md#把形拿出窗口)（rev 12）
- **别混 ①**：不是[界面插入位置](#ul-ui-slot--界面插入位置--ui-slot)：界面模块不能往它里面放东西。
- **别混 ②**：不是[应用的面](#ul-application-face--应用的面--application-face)，也不是[画布](#ul-canvas--画布--canvas)。两面都在应用的窗口里。
- **别混 ③**：不是截图时盖住屏幕的遮罩。遮罩只在人框选的那一会儿在，接走整块屏的指针。

---

### UL-say-note · 说话笺 · Say Note

> **中**：**[Agent 形](#ul-agent-figure--agent-形--agent-figure)在桌面上时，人按它，它身边用[墨框](#ul-ink-bubble--墨框--ink-bubble)写出的一张笺**：
> 人在里面选说给一个新会话还是某个已有的会话，写一句话，发出去。让形看过的窗口的图也先放进这张笺，人看过再发。
> 它说的话和[随身入口](#ul-companion-entry--随身入口--companion-entry)说的是同一件事，结局同样如实说。它开着时，人正在用的应用不变。
>
> **EN**: **A note that the agent figure writes next to itself in an ink bubble when a person
> presses it on the desktop.** In the note, the person chooses a new session or an existing one,
> writes a sentence and sends it. The pictures of a window that the figure looked at also go into
> this note first, and the person sees them before sending. A sentence said through it is the same
> thing as one said through the companion entry, and it reports the outcome in the same way. While
> it is open, the application that the person works in stays in front.

- **形态**：视图
- **出处**：[桌面应用「把形拿出窗口」](../../product/desktop-application/design.md#把形拿出窗口)（rev 12）
- **别混 ①**：不是[告知笺](#ul-told-note--告知笺--told-note)。告知笺是界面告诉人一件事，写在家旁边；说话笺是人对 agent 说话，写在桌面上的形旁边。
- **别混 ②**：不是随身入口的小框。小框在应用的窗口里，由会话的界面部分画，plugin 可以换它；说话笺在[桌面层](#ul-desk-layer--桌面层--desk-layer)里，由外壳画。

---

### UL-observation-frame · 观测框 · Observation Frame

> **中**：**人拿着 [Agent 形](#ul-agent-figure--agent-形--agent-figure)、按住 ⌘ 时，围住光标下那个别的应用的窗口的一笔带口的墨。**
> 它说的是「松手，形看的就是这一个」：框住的是哪个窗口，读的就是哪个；没有框就什么都不读。
> 被别的窗口挡住的地方不画。旁边的一张签写应用名与窗口标题。
>
> **EN**: **One ink stroke with a gap around the window of another application under the cursor,
> shown while a person holds the agent figure and presses the Command key.** It says that on release
> the figure looks at this window. The window in the frame is the window that is read. With no
> frame, nothing is read. The stroke is not drawn where another window covers this one. A label
> next to it gives the application name and the window title.

- **形态**：视图
- **出处**：[桌面应用「把形拿出窗口」](../../product/desktop-application/design.md#把形拿出窗口)（rev 12）
- **别混 ①**：不是[界面选择](#ul-ui-selection--界面选择--ui-selection)。界面选择选的是应用自己界面上的部位；观测框围的是别的应用的窗口。
- **别混 ②**：不是 agent 自己看屏幕。读是人松手的那一下做的，图由人发给自己的会话。

---

### UL-size-tier · 字号档 · Size Tier

> **中**：**桌面应用里整个界面的字与尺寸一起放大、缩小的档位**，恰有四档：小楷、中楷、大楷、老花，缺省是中楷。
> 换一档，版式不变，[Agent 形](#ul-agent-figure--agent-形--agent-figure)的大小跟着变。人选的那一档是一项[观感偏好](#ul-look-and-feel-preference--观感偏好--look-and-feel-preference)。
>
> **EN**: **The level at which all text and sizes of the desktop application interface grow or
> shrink together.** There are exactly four: 小楷, 中楷, 大楷 and 老花, and 中楷 is the default.
> A change of level keeps the layout and changes the size of the agent figure with it. The level
> that the person chose is a look-and-feel preference.

- **形态**：属性
- **出处**：[桌面应用「观感」](../../product/desktop-application/design.md#观感)（rev 12）
- **别混**：不是窗口或浏览器的缩放：那会把整页当一张图放大，形与版式的规则都不再成立。

---

### UL-application-face · 应用的面 · Application Face

> **中**：**桌面应用登录之后的两面之一：正面或反面。**正面是会话管理、对话、资产、设置与用量这几部分所在的那一面；反面是[画布](#ul-canvas--画布--canvas)。
> 登录之后两面一直都在，同一时刻只露着一面。人**翻面**只换露着的那一面，不改变服务端的任何事实。
> 收起的那一面保持原来的样子，不接指针与键盘，不给 [Agent 形](#ul-agent-figure--agent-形--agent-figure)座位。
> 部署没有开放画布时，应用只有正面。没有登录时没有面，只有登录门。
>
> **EN**: **One of the two faces that the desktop application has after sign-in: the front face or
> the back face.** The front face holds the session management, conversation, asset, settings and
> usage parts. The back face is the canvas. After sign-in both faces exist the whole time, and one
> face is exposed at a time. **Turning the face** changes only which face is exposed. It changes no
> fact on the server. The hidden face keeps its state, takes no pointer or keyboard input, and gives
> the agent figure no seat. When the deployment does not open the canvas, the application has only
> the front face. Before sign-in there is no face, only the sign-in gate.

- **形态**：位置
- **出处**：[桌面应用「产品需求描述」](../../product/desktop-application/design.md#产品需求描述) · [「两面与翻面」](../../product/desktop-application/design.md#两面与翻面)（rev 12） ·
  [画布「应用的两面」](../../product/canvas/design.md#应用的两面)（rev 2）
- **别混 ①**：不是[交付面](#ul-delivery-surface--交付面--delivery-surface)。交付面是桌面应用、命令行应用这一类东西本身；应用的面是桌面应用窗口里的一面。
- **别混 ②**：不是[共用界面件](../../../../packages/frontend/SPEC.md#纸的面)里的「纸面」。纸面是一张可以平移、缩放的纸，画布用它画出反面上的那张纸。
- **别混 ③**：翻面不是换页。各部分的页都在正面，正面的导航里没有画布；人在反面要去某一页时，应用先翻回正面，再到那一页。
- **注意**：人最后停在哪一面，是这台设备上的[观感偏好](#ul-look-and-feel-preference--观感偏好--look-and-feel-preference)，存在本机，不分租户。它和观感偏好词条的承载说法对不上，见 [C-97](../conflicts.md#c-97观感偏好由谁承载)。

---

### UL-canvas · 画布 · Canvas

> **中**：**一个[租户](subjects-and-ownership.md#ul-tenant--租户--tenant)的一张有边的纸，人和 agent 共用。**
> 每个租户恰有一张，一开始是空的；纸的大小与网格的疏密由部署配置。
> 它只记哪些对象摆在纸上、各怎样摆，也就是它上面的[画布项](#ul-canvas-item--画布项--canvas-item)与[一叠](#ul-canvas-pile--一叠--canvas-pile)。
> 它不保存、不复制被摆上的对象，也不判断它们在不在、谁能看。
> 只有这个租户的人，和在这个租户的会话里工作的 agent，能看、能改它；人和 agent 用同一组操作。
> 在桌面应用里，它露在[反面](#ul-application-face--应用的面--application-face)上。
>
> **EN**: **The one bounded sheet of one tenant, shared by the people of the tenant and the agent.**
> Each tenant has exactly one canvas, and it starts empty. The deployment configures the size of the
> sheet and the spacing of its grid. The canvas records only which objects lie on the sheet and how:
> its canvas items and piles. It does not store or copy the objects, and it does not decide whether
> they exist or who can see them. Only the people of the tenant and the agent that works in a session
> of the tenant can read or change it, and both use the same set of operations. In the desktop
> application it shows on the back face.

- **形态**：对象
- **出处**：[画布「产品需求描述」](../../product/canvas/design.md#产品需求描述) · [「画布、画布项与一叠」](../../product/canvas/design.md#画布画布项与一叠) ·
  [「人和 agent 用同一组操作」](../../product/canvas/design.md#人和-agent-用同一组操作)（rev 2）
- **别混 ①**：不是[应用的面](#ul-application-face--应用的面--application-face)。反面是桌面应用窗口里的一个位置，画布是一个租户的对象。正文说「画布是应用的反面」，指反面上露出的是它：换一台设备，反面是那台设备上的，画布还是同一张。
- **别混 ②**：不是浏览器里画图用的 canvas 元素。共用界面件画墨迹时用到那种元素，它的[上游说明](../../../../packages/frontend/ui-kit/UPSTREAM.md)里也叫「画布」。
- **注意**：它不是[形态](../conventions.md#形态这个词指的是哪一类东西)意义上的视图。[摆法](#ul-canvas-arrangement--摆法--canvas-arrangement)是画布自己的事实，只有它写，丢了不能从别处算回来。

---

### UL-canvas-item · 画布项 · Canvas Item

> **中**：**[画布](#ul-canvas--画布--canvas)上的一条记录：指着别处的一个对象，带着这个对象在画布上的[摆法](#ul-canvas-arrangement--摆法--canvas-arrangement)。**
> 被指着的对象归拥有它的领域，画布项不含它的内容。
> 同一个对象在一张画布上至多有一个画布项，所以一张画布加一个被指着的对象，认出一个画布项。
> 画布项要么摆着，要么拿走过。**拿走**只让它离开纸面，记录留在「拿走过的」清单里；再摆上同一个对象就是**放回**。
> 这份清单有上限，超出时最早拿走的那一条从清单里消失。
>
> **EN**: **One record on a canvas: it points to one object elsewhere and carries the arrangement of
> that object on the canvas.** The object belongs to the domain that owns it, and the canvas item
> holds none of its content. One object has at most one canvas item on one canvas, so a canvas and
> the object that the item points to identify the item. A canvas item is either placed or taken
> away. **Taking it away** only removes it from the sheet. Its record stays in the list of items
> taken away, and placing the same object again **puts it back**. The list has a limit. When the
> list is over the limit, the record taken away first leaves the list.

- **形态**：对象
- **出处**：[画布「画布、画布项与一叠」](../../product/canvas/design.md#画布画布项与一叠) · [「拿走与放回」](../../product/canvas/design.md#拿走与放回) ·
  [「锁定」](../../product/canvas/design.md#锁定)（rev 2）
- **别混 ①**：拿走不是删除。画布上没有删除：拿走之后，被指着的对象照旧在原来的地方，仍然能被重新摆上来。要删掉那个对象，到拥有它的领域去删。
- **别混 ②**：画布项「锁着」不是设置项的「被上层锁定」。锁没锁是摆法里的一项：只有摆着、不在一叠里的画布项锁得上；锁着的画布项谁也挪不动、改不了大小、拿不走、叠不进一叠、放不到最上面，人和 agent 一样。人点锁的记号解开它。agent 解不开，是因为「锁」这一项权限缺省禁止。
- **注意**：画布项上「最近是谁摆的」是来历，不是权限。人摆的画布项 agent 照样能挪，agent 摆的人也照样能挪。

---

### UL-canvas-arrangement · 摆法 · Canvas Arrangement

> **中**：**一个[画布项](#ul-canvas-item--画布项--canvas-item)摆在[画布](#ul-canvas--画布--canvas)上的样子：在哪里、多大、压在谁上面、在不在一叠里、锁没锁，以及最近是谁摆的。**
> 摆法是画布的事实，记在服务端，只有画布写它；换一台设备、另开一个窗口，看到的是同一份。
> 人拖动画布项时，跟着指针走的那一下是预览，不是摆法；松手之后，屏幕上是服务端答复的摆法。
>
> **EN**: **How one canvas item lies on the canvas: where it is, how large it is, which items it
> covers, whether it is in a pile, whether it is locked, and who placed it last.** The arrangement
> is a fact of the canvas. The server keeps it, and only the canvas writes it. Another device or
> another window shows the same arrangement. While a person drags an item, the item that follows the
> pointer is a preview, not the arrangement. After the release, the screen shows the arrangement
> that the server answered.

- **形态**：属性
- **出处**：[画布「画布、画布项与一叠」](../../product/canvas/design.md#画布画布项与一叠)（rev 2）
- **别混 ①**：不是[落点](grounding-and-isolation.md#ul-placement--落点--placement)。英文 Placement 归落点，摆法的英文是 Canvas Arrangement。
- **别混 ②**：不是界面外壳与用量面板里的「布局」。
- **别混 ③**：看着画布的哪一块、放多大、磁吸开没开，是这台设备上的[观感偏好](#ul-look-and-feel-preference--观感偏好--look-and-feel-preference)，不是摆法。磁吸只影响人这一次手势落在哪里，不改已有的摆法。
- **注意**：拿走过的画布项不在纸上、不在任何一叠里、不锁；它记着拿走之前的位置，放回时没给位置就回到那里。说「画布的摆法」时，指一张画布上全部画布项的摆法合在一起。

---

### UL-canvas-pile · 一叠 · Canvas Pile

> **中**：**[画布](#ul-canvas--画布--canvas)上叠在一起的几个[画布项](#ul-canvas-item--画布项--canvas-item)，只由「叠成一叠」这个操作产生。**
> 它有自己的位置，可以有名字，里面至少有一项。一个画布项至多在一叠里；拿走过的画布项与锁着的画布项都不在一叠里。
> 最后一项离开时，这一叠就没有了，画布上不会留下空的一叠。散开一叠时，里面的画布项各自落到它旁边的空处。
>
> **EN**: **Several canvas items stacked together on a canvas. Only the operation that stacks items
> into a pile creates one.** A pile has its own position, may have a name, and holds at least one
> item. A canvas item is in at most one pile. An item that was taken away and a locked item are in no
> pile. When the last item leaves, the pile no longer exists, and no empty pile stays on the canvas.
> When a pile is scattered, each of its items lands in free space next to it.

- **形态**：对象
- **出处**：[画布「画布、画布项与一叠」](../../product/canvas/design.md#画布画布项与一叠) · [「一叠」](../../product/canvas/design.md#一叠)（rev 2）
- **别混 ①**：压着不是一叠。一个画布项盖在另一个上面只是压着，后来的在上面。
- **别混 ②**：不是[共用界面件](../../../../packages/frontend/SPEC.md#纸的面)里画出来的「一叠」。那是几页叠在一起的画法；哪几项在一叠里，由画布定。
- **注意**：正文里的「这一叠」「那一叠」「哪一叠」都指它；「叠成一叠」是产生它的那个操作的名字。

---

### UL-notification · 通知 · Notification

> **中**：一个收件人的收件箱里的一条。它是一个被接下的通知事件为这个收件人留下的记录，带着接下那一刻定下的强度、缘由与备注，以及收件人对它的处置标记。一次发送对一个收件人至多留下一条。
>
> **EN**: One entry in one recipient's inbox. It is the record that an accepted notification event left for that recipient. It carries the level, cause and note that were fixed when the event was accepted, and the marks that the recipient put on it. One send leaves at most one notification for one recipient.

- **形态**：对象
- **出处**：[通知：几样东西分别成立](../../product/notifications/design.md#model)（rev 7）
- **别混**：不是会话规格里指「提交之后的唤醒」的那个通知；不是运行时 context 给模型的变化提醒；不是[复制通知](circulation-and-entitlement.md#ul-copy-notice--复制通知--copy-notice)。
- **注意**：它在收件箱里就是已送达。往界面、会话或外面推的结果不改这一点。


### UL-notification-source · 通知来源 · Notification Source

> **中**：一个会产生通知事件的东西，在通知这里登记过。它声明自己的名字和一组通知事件类型。登记是这次部署的事实，不分租户，也不给任何主体发送的资格。
>
> **EN**: Something that produces notification events and is registered with the notification domain. It declares its name and a set of notification event types. The registration is a fact of the deployment. It is not per tenant, and it gives no principal the right to send.

- **形态**：对象
- **出处**：[通知：一件事发生了](../../product/notifications/design.md#j-no01)（rev 7）
- **别混**：不是会话的输入来源。输入来源说一条输入是谁送进会话的；通知来源说一件事是哪里发生的。
- **注意**：系统里的领域、agent、通知自己都可以是通知来源。[连接件](capabilities-and-composition.md#ul-connector--连接件--connector)恢复之后也是一种。


### UL-notification-event-type · 通知事件类型 · Notification Event Type

> **中**：一个通知来源声明的一类事。分两种：一次性事件由来源发过来；持续事项由来源发布成运行数据，不经发送。声明里写许哪种收件人订阅、能不能点名收件人、对每种收件人的缺省强度、内容是不是来自系统外面。
>
> **EN**: One kind of occurrence that a notification source declares. There are two kinds. A one-off event is sent by the source. A standing item is published by the source as runtime data and is never sent. The declaration says which recipient kinds can subscribe, whether a recipient can be named, the default level for each recipient kind, and whether the content comes from outside the system.

- **形态**：属性
- **出处**：[通知：一件事发生了](../../product/notifications/design.md#j-no01)（rev 7）
- **别混**：[连接件事件类型](capabilities-and-composition.md#ul-connector-event-type--连接件事件类型--connector-event-type)是连接件这一种来源的事件类型。


### UL-notification-event · 通知事件 · Notification Event

> **中**：一个通知来源交来的一次性事件的一次发生。它的身份是租户、来源与来源给的事件标识；同一个身份再交一次得到原来的结果。它带事件类型、它关于来源里的哪个对象、时刻与内容。
>
> **EN**: One occurrence of a one-off event that a notification source hands over. Its identity is the tenant, the source and the event id that the source gives. A second send with the same identity returns the first result. It carries the event type, the subject in the source that it is about, the time and the content.

- **形态**：对象
- **出处**：[通知：一件事发生了](../../product/notifications/design.md#j-no01)（rev 7）
- **别混**：不是内核总线上的事件，也不是会话日志里发生的事。「事件」裸用不是术语，见[冲突 C-11](../conflicts.md)。


### UL-standing-item · 持续事项 · Standing Item

> **中**：一个通知来源那边一件还没了结、要收件人处理的事，例如一张等人决定的卡、一条被挡住的安排。它开着还是了结了只有来源说了算。来源把现在还开着的事项发布出来，通知读它来提醒，不保存它。
>
> **EN**: Something on a notification source's side that is still open and needs the recipient, for example a card that waits for a decision or a blocked schedule. Only the source decides whether it is open or closed. The source publishes the items that are open now. The notification domain reads them to remind the recipient and does not store them.

- **形态**：视图
- **出处**：[通知：还开着的事](../../product/notifications/design.md#j-no08)（rev 7）
- **别混**：不是[通知](#ul-notification--通知--notification)。它不进收件箱，收件人不能划掉它；了结它要在来源那里把事办了。


### UL-notification-recipient · 通知收件人 · Notification Recipient

> **中**：通知交给的一方。有两种：一个人，就是租户本身；或一个受托的 agent。受托的 agent 在通知这里只是一个不透明的引用，由能投到它的投递渠道认。收件人只在一个租户之内。
>
> **EN**: The party that notifications are given to. There are two kinds: a person, which is the tenant itself, or an entrusted agent. To the notification domain an entrusted agent is an opaque reference that only the delivery channel able to reach it understands. A recipient exists within one tenant.

- **形态**：对象
- **出处**：[通知：agent 订阅一类事件](../../product/notifications/design.md#j-no05)（rev 7）
- **注意**：两种收件人用同一套通知订阅、收件箱、强度与节拍。


### UL-notification-inbox · 收件箱 · Notification Inbox

> **中**：一个通知收件人的全部通知。人的收件箱在界面上是面板里「新消息」那一栏。
>
> **EN**: All notifications of one notification recipient. For a person, the inbox is the "new" section of the panel in the interface.

- **形态**：视图
- **出处**：[通知：回来之后，在一个面板上看和处置](../../product/notifications/design.md#j-no02)（rev 7）
- **别混**：不是人工介入规格里「原等待的答复箱」，见冲突 C-88。


### UL-notification-subscription · 通知订阅 · Notification Subscription

> **中**：一个通知收件人对一类通知事件、在一个范围里的选择：不收、弱或强。它还带一句备注、一个期限，以及它的创建者：user、agent 或 system，agent 时带它所在的会话与那一次工具调用。范围是全部、对象等于某个引用，或对象以某一段开头；越具体越优先。agent 的订阅许不许，在 agent 发起时由放行判断判过，订阅不另记同意。
>
> **EN**: The choice that one notification recipient makes for one notification event type within a scope: off, weak or strong. It also carries a note, a term and its creator: user, agent or system; for an agent, the session it runs in and the tool call that made it. The scope is everything, a subject equal to a reference, or a subject that starts with a prefix. The most specific scope wins. Whether an agent may subscribe is judged by the admission decision when the agent starts the action; the subscription records no consent of its own.

- **形态**：对象
- **出处**：[通知：我定哪些要收](../../product/notifications/design.md#j-no03)（rev 7）
- **别混**：[事件订阅](capabilities-and-composition.md#ul-event-subscription--事件订阅--event-subscription)是连接件持有上的设置，定哪几种外部事件进系统，agent 不在运行时改它。通知订阅定进来之后谁收，agent 可以为自己订。
- **别混**：[日程订阅](execution-and-outcome.md#ul-schedule-subscription--日程订阅--schedule-subscription)订的是系统提供的定时功能，不是事件。


### UL-notification-level · 通知强度 · Notification Level

> **中**：通知订阅的取值，也是一条通知上定下的值。强：入箱之后立刻投递。弱：入箱之后不单独投递，等节拍。不收只是订阅的取值：这类事件不为这个收件人留下通知。
>
> **EN**: The value of a notification subscription, and the value fixed on a notification. Strong: the notification is delivered immediately after it enters the inbox. Weak: it is not delivered by itself and waits for the beat. Off is a subscription value only: no notification is left for this recipient.

- **形态**：属性
- **出处**：[通知：我定哪些要收](../../product/notifications/design.md#j-no03)（rev 7）
- **注意**：来源只给缺省强度，之后归收件人。被点名的收件人选了不收时按弱。


### UL-delivery-destination · 投递去处 · Delivery Destination

> **中**：一个通知收件人的一个接收点：一个投递渠道、这个渠道认得的地址、它最低收哪种强度、启用与否。同一条通知推到收件人每个启用的去处，各有各的结果。
>
> **EN**: One place where a notification recipient receives deliveries: a delivery channel, an address that the channel understands, the lowest level it takes, and whether it is enabled. One notification is delivered to every enabled destination of the recipient, and each delivery has its own result.

- **形态**：对象
- **出处**：[通知：同一条通知同时到几个地方](../../product/notifications/design.md#j-no04)（rev 7）
- **别混**：连接件的[投递目标](#ul-inbound-target--投递目标--inbound-target)说外部事件送进哪个会话，见冲突 C-87。


### UL-delivery-channel · 投递渠道 · Delivery Channel

> **中**：一种把通知推给收件人的办法，在通知这里登记过。它声明认哪种地址、出不出本系统，并承诺同一次投递再做一遍不产生第二份效果。
>
> **EN**: A way to deliver notifications to a recipient, registered with the notification domain. It declares which addresses it understands and whether it leaves the system. It promises that a repeated delivery with the same identity has no second effect.

- **形态**：对象
- **出处**：[通知：同一条通知同时到几个地方](../../product/notifications/design.md#j-no04)（rev 7）


### UL-delivery-unit · 投递单元 · Delivery Unit

> **中**：一次投递的单位：为一个投递去处定下的一组通知。强通知按最小间隔合成单元，节拍把当时该提醒的合成单元。单元的成员与内容在形成时定下，之后每次重投都是同一个单元。
>
> **EN**: The unit of one delivery: a set of notifications fixed for one delivery destination. Strong notifications are grouped into units under the minimum interval. A beat groups everything that needs a reminder at that time. The members and content of a unit are fixed when it is formed, and every retry delivers the same unit.

- **形态**：对象
- **出处**：[通知：agent 把事攒着](../../product/notifications/design.md#j-no06)（rev 7）


### UL-notification-delivered · 通知送达 · Notification Delivered

> **中**：一条通知在收件人的收件箱里，收件人随时取得回。它在通知事件被接下的同一刻成立。往任何去处投递的结果都不改它。
>
> **EN**: A notification is in the recipient's inbox and the recipient can retrieve it at any time. This holds from the moment the notification event is accepted. No delivery result to any destination changes it.

- **形态**：状态
- **出处**：[通知：几样东西分别成立](../../product/notifications/design.md#model)（rev 7）
- **别混**：不是已投递、看过或了结；也不是模型与工具的[交付责任解除](execution-and-outcome.md#ul-delivery-release--交付责任解除--delivery-release)。


### UL-replace-key · 替换键 · Replace Key

> **中**：发送通知事件时可带的一个键。同一收件人、同一来源、同一个键的新通知入箱时，旧的那些被标成被它顶替，不能再恢复。顶替时缺省不再投递。
>
> **EN**: A key that a send can carry. When a new notification with the same recipient, source and key enters the inbox, the earlier ones are marked as superseded by it and cannot be restored. By default the superseding notification is not delivered again.

- **形态**：属性
- **出处**：[通知：agent 写一条给人看](../../product/notifications/design.md#j-no07)（rev 7）


### UL-notification-beat · 通知节拍 · Notification Beat

> **中**：一个通知收件人的定时点。到点时收件箱里有该提醒的，就把它们合成一份摘要投递一次；没有就什么都不做。间隔由 owner 定。
>
> **EN**: A recurring point in time of one notification recipient. When it comes and the inbox has something that needs a reminder, those notifications are composed into one digest and delivered once. Otherwise nothing happens. The owner sets the interval.

- **形态**：属性
- **出处**：[通知：agent 把事攒着](../../product/notifications/design.md#j-no06)（rev 7）
- **别混**：节拍只提醒已有的通知，不带任何工作。定期要 agent 做一件事归日程。

### UL-command-name · 全名与短名 · Command Name

> **中**：[入口项](reach-and-availability.md#ul-command-entry--入口项--command-entry)的名字有两种写法。全名是「空间:名字」，空间由交出它的[入口来源](reach-and-availability.md#ul-command-entry-source--入口来源--command-entry-source)声明，全名永不相撞；`omne-official` 是保留空间。短名是不带空间的那一段，按它写在哪里解析：在开头，系统命令先于提示词命令先于 Skill；在句中，只认 Skill。
>
> **EN**: The two spellings of a command entry's name. The full name is "namespace:name"; the namespace is declared by the command entry source that hands the entry over, and full names never collide; `omne-official` is reserved. The short name is the part without the namespace and is resolved by where it is written: at the start, a system command wins over a prompt command, which wins over a skill; inside a sentence, only skills count.

- **形态**：属性
- **出处**：[Slash Command 名字](../../product/slash-commands/design.md#名字)（rev 5）
- **别混**：不是[能力标识](scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)：同一份 Skill 的能力标识是「类别加名字」，它的全名是「空间:名字」，空间不是类别
- **注意**：拿掉一项可能让一个短名改绑到另一项，所以「少一项不会多出引用」不成立；看得见的标记与[发送方所见](#ul-sender-view--发送方所见--sender-view)守住这一点

### UL-slash-reference · 斜杠引用 · Slash Reference

> **中**：一句话里认出来的、绑到一份引用型[入口项](reach-and-availability.md#ul-command-entry--入口项--command-entry)的一处 `/名字`。它不改写人的话：受理时人的话原样一块，被引用的那份 Skill 的正文另成一块，块上带[来路标记](record-and-context.md#ul-origin-tag--来路标记--origin-tag)。同一份被引用几次只带一次。
>
> **EN**: A `/name` recognized in a sentence and bound to a reference-kind command entry. It does not rewrite what the person wrote: at intake the person's words stay one block as written, and the referenced skill's body becomes a separate block carrying an origin tag. A skill referenced several times is carried once.

- **形态**：属性
- **出处**：[Slash Command 用户的话不被改写](../../product/slash-commands/design.md#用户的话不被改写) · [J-SC04](../../product/slash-commands/design.md#j-sc04-在一句话里引用一份-skill)（rev 5）
- **别混**：不是 agent 调读取工具读一份 Skill，那是一次工具调用；引用走受理，不运行脚本，不放宽读取权。也不是「按引用找它」里那个泛称的引用，跨 topic 写全称

### UL-sender-view · 发送方所见 · Sender View

> **中**：一次提交里交付面随输入带上的识别结果：开头是哪条命令或没有，引用了哪几份入口项（全名，去重，按第一次出现的次序）。受理侧按当下的清单再认一遍，结果不等于它就整条不受理，写明哪一项变了。
>
> **EN**: The recognition result a delivery surface sends along with an input: which command is at the start, if any, and which entries are referenced (full names, without duplicates, in order of first appearance). Intake recognizes the input again against the list as it is now; if the result differs, the whole input is not accepted and the reply says which item changed.

- **形态**：属性
- **出处**：[Slash Command 看到的就是受理的](../../product/slash-commands/design.md#看到的就是受理的)（rev 5）
- **注意**：只比绑到了哪些名字，不比版本；没带所见的提交照受理侧认出的受理，回执写明绑定了什么

### UL-shell-action · 外壳动作 · Shell Action

> **中**：客户端外壳的动作表里按名字登记的一件事：名字、标题、此刻能不能用及原因、怎样执行。按键、命令面板、按钮、系统菜单都只引用它的名字，可用性只在它这里算一处。它由某个界面模块登记，随那个模块的作用域挂上与撤下。对在跑的一轮的控制与界面自己的动作都是外壳动作；控制执行时点名界面此刻看到的那一轮或那一次调用。
>
> **EN**: One thing registered by name in the client shell's action table: a name, a title, whether it can be done now and why not, and how to do it. Keys, the command palette, buttons and the system menu refer to it only by name, and its availability is computed in this one place. A UI module registers it, and it is added and removed with that module's scope. Controls over a running run and the interface's own actions are both shell actions; a control names the run or call the interface sees at that moment.

- **形态**：对象
- **出处**：[Slash Command 同一条命令的四种触发](../../product/slash-commands/design.md#同一条命令的四种触发)（rev 5）
- **别混**：不是 agent 的[动作空间](capabilities-and-composition.md#ul-action-space--动作空间--action-space)里的动作，那是模型能发起的；外壳动作只由人触发，模型看不到。裸写「动作」不作术语
- **注意**：外壳不认识任何一个动作的含义，含义归登记它的界面模块。它是一种[拓展贡献](architecture-core-and-extension.md#ul-extension-contribution--拓展贡献--extension-contribution)：身份是动作表里的名字，随登记它的模块挂上与撤下

### UL-key-binding · 键位绑定 · Key Binding

> **中**：「在哪一层按哪个键，执行哪个[外壳动作](#ul-shell-action--外壳动作--shell-action)」的一条对应。层从里到外是浮层、输入框或当前页、全局，按键时先查最里面的一层。缺省的一套随应用发；人改过的跟着账号存，换一个客户端登录读到同一份。只能绑到控制与界面动作上。
>
> **EN**: One mapping of "in this layer, this key performs this shell action". Layers run from the innermost outwards: overlay, composer or current page, global; a key press looks in the innermost layer first. A default set ships with the application; the person's changes are kept with the account, so another client signed in to the same account reads the same set. Keys bind only to controls and interface actions.

- **形态**：属性
- **出处**：[Slash Command 同一条命令的四种触发](../../product/slash-commands/design.md#同一条命令的四种触发)（rev 5）
- **注意**：不是某个租户的设置；它是账号的偏好，切换租户不变

---

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
