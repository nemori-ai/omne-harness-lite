# 执行与收场

**这一卷回答：一件事怎么跑、跑时跟外面说什么、跑偏了谁接手、最后怎么了结。**

收在这里的是**一次执行本身**及其产物与终局，
以及**事情没按正常走时，处置权怎么在各层之间移动**。
**够不够得着**归[取用与可用性](reach-and-availability.md)，
**谁在发起**归 [Agent 运行时闭环](agent-runtime-loop.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

> **「工具」这个词指三样东西，寿命各不相同**，混起来就会得出错的结论：
>
> ```text
> 工具定义 ──装配──→ 动作空间里的条目 ──调用──→ 工具执行
>  数据，长期           构成，绑 agent runtime         计算资源，绑会话
> ```
>
> **最要紧的是第三段绑在会话上**，不绑 agent runtime 、也不绑发起它的那次运行。
> 见 [PF-006 §5.2](../../product/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同)。

## 一次执行

### UL-tool-definition · 工具定义 · Tool Definition

> **中**：**一个[工具](capabilities-and-composition.md#ul-tool--工具--tool)在数据与治理层面的
> 身份与表示**——叫什么、收什么参数、返回什么，以及它的可选声明（能不能后台、需要什么设施等）；
> 其中**目标环境与转后台阈值两项声明的是[设置项](capabilities-and-composition.md#ul-setting--设置--setting)的形状与默认值**，各层配值。
> **它可以自带实现，直到自带一份完整的实现 package**。
> **它是数据，长期存在**，谁持有它就归谁。
>
> **EN**: **A tool's identity and representation at the data and governance level** — its
> name, the arguments it takes, what it returns, plus its optional declarations (whether it
> may run in the background, which facilities it needs, and so on); of these, **target
> environment and the background-conversion threshold declare the shape and default of a
> setting entry**, whose values the layers assign. **It may carry its own implementation, up
> to a complete implementation package**. **It is data and long-lived**, belonging to whoever holds it.

- **形态**：属性
- **出处**：[PF-006 §5.2](../../product/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同) · [§5.3](../../product/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样)（rev 17） · [PF-002 §4 Tool](../../product/PF-002-assets-settings-and-permissions/design.md#tool)（rev 16）
- **别混**：与[工具](capabilities-and-composition.md#ul-tool--工具--tool)不是一回事——
  工具是那一类资产，**工具定义是它在数据与治理层面的那一份表示**；
  **同一个身份下可以有平台、组织、租户各自的一份**
- **注意**：**有三样刻意不在定义里**——[等待态](#ul-tool-wait-state--工具等待态--tool-wait-state)、[发帧](#ul-frame-emission--发帧--frame-emission)，
  以及[这一次的结果要不要卸载](#ul-result-offloading--结果卸载--result-offloading)。
  **三样都取决于这一次跑成什么样**，而定义里写的是这个工具跟参数无关的固有属性

### UL-tool-execution · 工具执行 · Tool Execution

> **中**：**一次工具执行。**它**是计算资源**，**有自己独立的运行时，绑在[会话](agent-runtime-loop.md#ul-session--会话--session)上**——
> 不绑 agent runtime，也不绑发起它的那次[运行](agent-runtime-loop.md#ul-run--运行--run)；**收件人始终是会话**。
> **前台 / 后台说的只是 agent runtime 这副协程有没有阻塞在它上面**，不是它挂在谁身上。
> 因此**一次运行结束了，它发起的执行可以还在跑**；agent runtime 被回收，**任何工具执行都不受影响**——Run 记着协程在等哪一次，新协程起来接着等。
>
> **EN**: **One execution of a tool.** It **is a compute resource** with **a runtime of its
> own, bound to the session** — not to the agent runtime, nor to the run that started it;
> **the addressee is always the session**. **"Foreground" and "background" only say whether
> the agent-runtime coroutine is blocked waiting on it**, not whose it is. So **a run may end
> while an execution it started is still going**; when the agent runtime is reclaimed, **no
> tool execution is affected** — the Run records which execution the coroutine was waiting on,
> and the new coroutine resumes waiting.

- **形态**：对象
- **出处**：[PF-006 §4 Tool Execution](../../product/PF-006-tools-and-skills/design.md#tool-execution)（rev 17） · [§5.2](../../product/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同)（rev 17） · [§6.5](../../product/PF-006-tools-and-skills/design.md#65-工具执行有自己的运行时绑定在-session-上)（rev 17）
- **注意 ①**：**是哪次运行、哪个 agent runtime 发起的，都记得下来，但都不绑生命周期**；中断一次运行时前台的落「被中断」，是因为那一步不要了
- **注意 ②**：**[会话被归档](../../product/PF-015-session-lifecycle-and-ownership/design.md#63-归档先停活儿再落状态)时仍未结束的，不论前后台，收场都是[被中断](#ul-execution-outcome--执行收场--execution-outcome)**——
  收件人都没了；**这一刀不可逆**，撤销归档不会把它接回来

### UL-background-execution · 后台执行 · Background Execution

> **中**：一次工具执行**不占着当前这一轮**地跑。
> 它由[工具定义](#ul-tool-definition--工具定义--tool-definition)声明**能不能后台**（作者的许可），**不声明就是不能后台**；
> **前台跑超过多久自动转后台**是一项[偏好类设置](capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category)，定义给形状与默认值、各层配值。
> **它与[等待态](#ul-tool-wait-state--工具等待态--tool-wait-state)是两个维度**，四种组合都成立。
>
> **EN**: A tool execution running **without holding the current turn**. The tool
> definition declares **whether it may** (the author's permission); **absent a declaration,
> it may not**. **After how long in the foreground it converts automatically** is a
> preference-class setting: the definition gives its shape and default, the layers assign
> values. It is **a dimension separate from the wait state** — all four combinations are possible.

- **形态**：状态
- **出处**：[PF-006 §6.6](../../product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)（rev 17）
- **注意 ①**：**默认往保守的那一边倒**——**没表过态，不等于表了同意**
- **注意 ②**：**「发起时就在后台」与「中途转后台」的决定权不同**——
  前者[由 agent 自己定](../../product/PF-007-meta-capabilities/design.md#64-shell通向命令行)，
  后者[有三个触发源](../../product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)：
  **超时自动转 · 用户手动切 · 用户插队时系统顺带触发**
- **注意 ③**：**三个触发源都不绕开声明**——工具没声明允许后台，插队时它是[被中断](#ul-execution-outcome--执行收场--execution-outcome)，不是被转后台

### UL-model-call · 一次模型调用 · Model Call

> **中**：**把攒好的一次请求发给模型，到拿回完整的一份回复为止**的那一段。
> 它落在[agent 的一步](agent-runtime-loop.md#ul-agent-step--agent-的一步--agent-step)之内，
> 与[工具执行](#ul-tool-execution--工具执行--tool-execution)**是兄弟，互不包含**。
>
> **EN**: The stretch from dispatching one assembled request to the model until a
> **complete** reply has come back. It sits inside a single agent step and is a
> **sibling of** tool execution — neither contains the other.

- **形态**：对象
- **出处**：[PF-013 flows §3.2 一次模型调用](../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用)（rev 8） ·
  [PF-011 §5.3](../../product/PF-011-off-nominal-handling/design.md#53-层的顺序不是排出来的是推出来的)（rev 4） ·
  [PF-012 §5.4](../../product/PF-012-agent-loop-and-run/design.md#54-一步的骨架)（rev 10）
- **别混**：**不是那次请求的内容**——请求体怎么攒出来归 [PF-010](../../product/PF-010-context-management-and-assembly/README.md)；
  **也不是回复怎么流式拼起来**，那归 [PF-009](../../product/PF-009-context-message-types/README.md)
- **注意**：**这一层归 [PF-013](../../product/PF-013-model-profiles-and-invocation/README.md)**——
  它的三个终态（**完整一份 · 上交 · 被中断**）、失败怎么分类、[什么时候算试尽](../../product/PF-013-model-profiles-and-invocation/design.md#什么时候算试尽)，都在那里
- **注意 ②**：**「模型请求运行时」指执行这一次调用的那个协程，与它同生同灭**——
  [正文当同一物用](../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)，
  [对象条目已并入](../../domain_objects/objects.md#ul-model-call--一次模型调用)，**不另立词条**（与「工具执行运行时」并入[工具执行](#ul-tool-execution--工具执行--tool-execution)同一分寸）；
  它受 [`runtime` 那条写死的规矩](../conventions.md#runtime-这个词本系统写死了)约束：**宿主永远是 agent runtime，转不了后台**

## 跑的过程中，跟外面说的两种话

> **方向相反，性质也相反。两个都不在[工具定义](#ul-tool-definition--工具定义--tool-definition)里。**
>
> | | **等待态** | **发帧** |
> |---|---|---|
> | 方向 | **要**一个应答进来 | **给**一点情况出去 |
> | 阻不阻塞 | **阻塞** | **不阻塞** |
> | 落空了 | 是[六种收场之一](#ul-execution-outcome--执行收场--execution-outcome) | **什么也不算** |
> | 系统要不要知道 | **必须知道** | 不必 |
>
> **等待是执行的一部分，发帧不是。**

### UL-tool-wait-state · 工具等待态 · Tool Wait State

> **中**：**一次工具执行中途停下来，等一个应答，拿到之后才继续。**
> 停下来时它说明**自己在等什么形状的东西**，后续按拿到的内容走不同的分支。
> **「谁来应答」不是这个概念的一部分**——人、外部系统、另一个 agent 都可以，形状一样。
> **要紧的是系统知道它正在等，以及它等的是什么形状。**
>
> **EN**: **A tool execution pausing mid-way to await a reply, resuming only once it
> arrives.** On pausing it states **the shape of what it is waiting for**, and branches
> on what comes back. **Who answers is no part of this concept** — a person, an
> external system, another agent; the shape is the same. **What matters is that the
> system knows it is waiting, and knows what shape it waits for.**

- **形态**：状态
- **出处**：[PF-006 §4 等待态](../../product/PF-006-tools-and-skills/design.md#等待态)（rev 17）
- **⚠️ 别混**：**裸写「等待态」不作数。**它有两个所指——
  这一条挂在**一次工具执行**上，另一条
  [运行等待态](interaction-and-dispatch.md#ul-run-wait-state--运行等待态--run-wait-state)挂在**一个运行**上，
  **两者挂在不同的生命周期上**
- **注意 ①**：**工具定义里没有「我会不会等」这一格**——**等不等是这一次跑出来的事**，
  同一个工具参数不同就可能这次等、下次不等
- **注意 ②**：**等多久的上限是使用者的属性，不是这个原语的属性**——
  占着资源的等待可以有上限，**不占资源的（如[问询](interaction-and-dispatch.md#ul-inquiry--问询--inquiry)）不设上限**
- **注意 ③**：**它对 run 的影响看它在前台还是后台**——
  `Ask()` 之所以把 run 也停住，**是因为它恰好是前台调用**，不是因为两者是同一件事

### UL-frame-emission · 发帧 · Frame Emission

> **中**：**一次工具执行的过程中，它主动交出一点「我正在干什么」**——
> 交出来的是[执行帧](#ul-execution-frame--执行帧--execution-frame)，
> 也就是它那条 `ToolInternalMessage` 的到达增量。
> 三条性质：**它不承诺任何事**（发不出去就发不出去，**这次调用该怎么跑还怎么跑**）；
> **系统不必预先知道哪个工具会发帧**（**绝大多数工具一帧都不发，那是正常形态**）；
> **交出来的东西自己说清它是什么**（开一个块时说明这块怎么填），**不必事先声明**。
>
> **EN**: **A tool execution volunteering, while running, a little of "what I am doing
> right now"** — what it hands over is an execution frame, i.e. an arrival increment of
> its own `ToolInternalMessage`. Three properties: **it promises nothing** (if it cannot
> get out, it cannot — **the call runs exactly as it would have**); **the system need not
> know in advance which tools emit** (**most emit none at all, and that is the normal
> case**); and **what arrives says for itself what it is** (a block states, as it is
> opened, how it is to be filled), **with nothing declared up front**.

- **形态**：过程
- **出处**：[PF-006 §4 发帧](../../product/PF-006-tools-and-skills/design.md#发帧)（rev 17） ·
  [PF-009 §5.8](../../product/PF-009-context-message-types/design.md#执行帧就是这条消息的到达增量)（rev 7）
- **注意**：它补的是一个具体的窟窿——用户看着界面写着「正在调用某个工具」，**然后就没有下文了**：
  **它是卡住了，还是在正常地跑一件慢活，此前分不出来**

### UL-execution-frame · 执行帧 · Execution Frame

> **中**：**一条 `ToolInternalMessage` 的到达增量。**一次工具执行对应一条这样的消息，
> 内容是一串[内容块](record-and-context.md#ul-content-block--内容块--content-block)；
> 帧就是这条消息**一点点到达的那些动作**，走的是与模型回复**同一套到达语法**——
> 开一个块（说明这块是追加片段还是整体替换）、往里填、封上这个块、记一次账、收尾。
> **它不是另一份协议，也不是一个可以单独指认的东西。**
>
> **EN**: **An arrival increment of one `ToolInternalMessage`.** A tool execution yields
> exactly one such message, whose content is a series of content blocks; the frames are
> the steps by which that message arrives, **under the same arrival grammar as a model
> reply** — open a block (stating whether it is appended to or replaced wholesale), fill
> it, close it, account for it once, finish. **It is neither a separate protocol nor a
> separately identifiable thing.**

- **形态**：过程
- **出处**：[PF-009 §5.5](../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法) ·
  [§5.8](../../product/PF-009-context-message-types/design.md#执行帧就是这条消息的到达增量)（rev 7）
- **别混**：**裸写「帧」不作数**——那个词在别处指视频帧、网络帧
- **注意 ①**：**它落进日志的是结果，不是过程**——日志里留的是收尾之后那条完整的消息
  （封口后的块）；**到达的过程不留**，中途被中断时已交付的块照样留
- **注意 ②**：**系统不查工具定义**：不必在定义里加一格「我发不发帧」，不必核对
  「声明的和实际发的对不对得上」——**因为压根没有声明**，收到什么就按什么办
- **注意 ③**：**它留着一条路**——一个工具可以**先往外吐日志，最后再给一块汇总面板**：
  前面那些块追加片段，**最后开一个整体替换的块**

## 交出来的东西

### UL-tool-output · 工具产出 · Tool Output

> **中**：**一次工具执行交出来的东西，分三部分，读者不同**：
>
> | 部分 | 什么时候 | 谁在读 |
> |---|---|---|
> | **进消息的那部分** | 跑完 | **agent**——读就是了 |
> | **[附件](#ul-attachment--附件--attachment)** | 跑完 | **agent**——消息里告诉它地址，它自己去取 |
> | **[执行帧](#ul-execution-frame--执行帧--execution-frame)** | **跑的过程中** | **人**——**agent 看不到** |
>
> **EN**: **What one tool execution hands back, in three parts with different
> readers**: the part that goes into the message (read by the agent directly), the
> attachments (fetched by the agent from an address given in the message), and the
> execution frames emitted while running — **which are for people, and which the agent
> cannot see at all**.

- **形态**：总称
- **出处**：[PF-006 §4 工具的产出](../../product/PF-006-tools-and-skills/design.md#工具的产出)（rev 17）
- **注意 ①**：前两部分要分，**是因为有些产出根本不适合进对话**——一张图、一个几十兆的文件。
  硬塞进去，**一条消息就把上下文吃光了**
- **注意 ②**：**帧不顶替结果。**一个工具把过程播报得再细，**跑完照样要给结果**——
  否则 agent 手上什么都没有，**它压根看不见那些帧**

### UL-call-account · 调用账目 · Call Account

> **中**：一次[模型调用](#ul-model-call--一次模型调用--model-call)或一次[工具执行](#ul-tool-execution--工具执行--tool-execution)**身上的一项属性**：
> **它花了什么、产出了多少的账**——用量、费用、砍掉了多少增量、落在哪、跑了多久。
> **每一次调用或执行各留一份，进[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)、不进给模型看的上下文**；
> **费用拿不到记「未知」，不记零**，拿到了再补一条；按尝试记明细、按运行汇总。
>
> **EN**: An attribute of one **model call** or one **tool execution**: **the account of
> what it consumed and produced** — usage, cost, how many increments were trimmed, where it
> ran, how long it took. **One per call or execution, written to the session log and never
> into the model-facing context**; **a cost that cannot be obtained is recorded as
> "unknown", never as zero**, and corrected by a later entry when it arrives; itemised per
> attempt, summed per run.

- **形态**：属性
- **出处**：[PF-006 §5.4 每一次执行都留一份账](../../product/PF-006-tools-and-skills/design.md#每一次执行都留一份账)（rev 17） ·
  [PF-009 §5.5](../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法)（rev 7） ·
  [PF-012 成本两层](../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错)（rev 10） ·
  [PF-013 §5.13](../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)（rev 8） ·
  [PF-001 §6.4](../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)（rev 16）
- **别混**：**不是[工具产出](#ul-tool-output--工具产出--tool-output)**——产出是给读者的东西，账是关于这次的事实
- **注意**：工具内部调外部服务产生的费用也记在这里，一次执行可以有多笔

### UL-attachment · 附件 · Attachment

> **中**：一次工具执行**跑完时存进某个存储、不直接进对话**的产出。
> 消息里告诉 agent 地址，**由它自己去取**。
>
> **EN**: Output that a tool execution **writes to storage on completion rather than
> placing in the conversation**. The message tells the agent where it is, and **the
> agent fetches it itself**.

- **形态**：对象
- **出处**：[PF-006 §4 工具的产出](../../product/PF-006-tools-and-skills/design.md#工具的产出)（rev 17）
- **注意**：**产出带附件的工具需要[声明自己依赖的存储](reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration)**，
  并且得有一个能从那个存储把它读出来的工具

### UL-result-offloading · 结果卸载 · Result Offloading

> **中**：**即便是「进消息的那部分」，也可能大到装不下。**卸载 =
> **原始结果存起来，消息里换成一条带摘要的占位**。
> **卸载不是全卸载**：占位里留着**够用的那部分内容**，加上有多大、怎么取全文——
> **很多时候 agent 看占位就够了，根本不必去取全文，这正是它值得做的理由**。
>
> **EN**: **Even the part meant for the message can be too large to fit.** Offloading
> means **storing the original result and putting a summarising placeholder in the
> message instead**. **It is not a wholesale offload**: the placeholder keeps **enough
> of the content to be useful**, plus how large the whole is and how to fetch it —
> **often the placeholder is all the agent needs, which is exactly why this is worth
> doing**.

- **形态**：过程
- **出处**：[PF-006 §4 卸载](../../product/PF-006-tools-and-skills/design.md#卸载)（rev 17） · [§6.10](../../product/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度)（rev 17）
- **别混**：**裸写「卸载」不作数**——那个词在别处指卸载插件、卸载软件
- **⚠️ 注意**：**「换成」说的是相对于原始结果，不是在记录里替换。**
  [会话日志里从头到尾只有占位那一条](../../product/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关)——
  **原始结果从来没进过日志**；而 agent 取回全文，是**往后追加两条新消息**
- **注意**：**它与前台/后台、与等待态是三个不耦合的维度**
- **注意**：**取回全文要能分页**——不分页就等于把刚卸下去的东西原样搬回来，**卸载当场作废**

### UL-offloaded-result · 被卸载的原始结果 · Offloaded Result

> **中**：一次[工具执行](#ul-tool-execution--工具执行--tool-execution)**本该进消息、
> 却因为太大而被[卸载](#ul-result-offloading--结果卸载--result-offloading)存起来的那一份完整结果**。
> **它从来没进过[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)**——
> 进去的一直是那条占位。agent 要看它得**分页取回**，
> 而取回是**往后追加两条新消息**，不是把占位换回去。
>
> **EN**: The **full result** of a tool execution that was meant for the message but got
> **stored aside instead, because it was too large to fit**. **It never entered the
> session log** — what went in was the placeholder, all along. An agent that wants it
> **fetches it back a page at a time**, and fetching **appends two new messages** rather
> than putting the original back where the placeholder sits.

- **形态**：对象
- **出处**：[PF-006 §4 卸载](../../product/PF-006-tools-and-skills/design.md#卸载)（rev 17） ·
  [§6.10](../../product/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度)（rev 17） ·
  [PF-012 §5.10](../../product/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关)（rev 10）
- **别混 ①**：**不是那条占位**——占位进了消息，带着够用的那部分、有多大、怎么取；
  **这一条是被留在外面的那份全的**
- **别混 ②**：**不是[附件](#ul-attachment--附件--attachment)**——
  附件是工具**有意**不放进对话的产出，这一条是**本该进对话、只因太大而被挪走**的
- **弃用**：~~「工具原件」~~——[「原件」在模态那边另有所指](../../product/PF-013-model-profiles-and-invocation/design.md#转换件)
  （一个内容块里没被转成文本的那一份）

## 怎么了结

### UL-execution-outcome · 执行收场 · Execution Outcome

> **中**：**一次工具执行的终局，有六种**，**agent 必须分得清**，因为下一步动作完全不同：
>
> | 收场 | English | agent 该怎么办 |
> |---|---|---|
> | **完成** | Completed | 继续 |
> | **失败** | Failed | 重试、换招，或报告 |
> | **不可用** | Unavailable | **绕路**——别重试，重试一百次也一样 |
> | **转后台** | Moved to Background | **先干别的**，跑完了会来通知——它是前台那一次调用的收场，后台那段执行另有自己的收场（完成、失败、被中断、等不到应答之一） |
> | **被中断** | Interrupted | **别自动重试**——重试就是无视用户的意思；三个触发源：用户叫停（含插队）、这次运行被取消时它还在前台、会话归档。**agent runtime 被回收不在其列** |
> | **等不到应答** | No Reply | 按等不到处理，**不是失败也不是被拒** |
>
> **六种都以正常的工具返回消息到达 agent**，语义写在消息里；
> **没有一种是以报错的形式抛给它的**。
>
> **EN**: **The terminal state of a tool execution — six of them**, and **the agent
> must tell them apart**, because the next move differs entirely. **All six reach the
> agent as an ordinary tool-return message** carrying the semantics; **not one of them
> is raised at it as an error.**

- **形态**：状态
- **出处**：[PF-006 §5.5](../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)（rev 17） · [§6.7](../../product/PF-006-tools-and-skills/design.md#67-用户可以中断而中断不是失败)（rev 17）
- **别混**：**与 [Run 的「收束」不是一回事](agent-runtime-loop.md#ul-run--运行--run)**——
  **粒度差着好几层**。**裸写「收场」只指工具这一层的这六种**
- **注意 ①**：**四种「非完成」里只有一种是失败。**混成一种，agent 的下一步必然错：
  **该绕路时死磕，该等待时重来，用户刚叫停它又跑一遍**
- **注意 ②**：**报错不带语义，agent 只能猜**——这是六种都走正常返回的理由
- **注意 ③**：**「异常中断」属于失败那一格写给 agent 的原因，不是「被中断」**——
  据点停机时没了的工具执行[停了就不重来](../../product/PF-006-tools-and-skills/design.md#停机之后它不重来)（rev 17），
  恢复时[对账追补](../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)的那一条收场是失败、原因写异常中断（rev 10）

## 跑偏了谁接手

### UL-nominal-path · 主路径 · Nominal Path

> **中**：**一层在没有任何[非常态](#ul-off-nominal--非常态--off-nominal)时，本该是什么样子。**
> **两种形态都算**：**推进式**——从开始走到结束；**稳态式**——持续成立的那个状态，
> 不推进到任何终点。**它是这一层自己的路**——同一件事，可能让里面那一层偏离了主路径，
> 而外面那一层照走不误。
>
> **EN**: **What a layer is supposed to look like when nothing goes off-nominal.** It takes
> **two forms**: *progressive* — running from start to finish; *steady* — a state that simply
> holds, arriving nowhere. It belongs to **that layer alone** — one and the same occurrence may
> take an inner layer off its path while the outer layer proceeds untroubled.

- **形态**：属性
- **出处**：[PF-011 §4 主路径](../../product/PF-011-off-nominal-handling/design.md#主路径)（rev 4）
- **注意 ①**：**中文取好懂的说法，英文取航天惯用的 `nominal`**——
  两边各自成立，**不是互译**
- **⚠️ 注意 ②**：**稳态式照样会偏离。**租户那一层的主路径是「作为可用的归属边界持续成立」——
  **不写明这第二种形态，给那一层填四要素时会卡在第一格**
- **注意 ③**：**每一层都有自己的主路径**，而[层数不固定](../../product/PF-011-off-nominal-handling/design.md#52-一层要声明四样)

### UL-off-nominal · 非常态 · Off-Nominal

> **中**：**某一层此刻不在它的[主路径](#ul-nominal-path--主路径--nominal-path)上。**
> **它是一个状态，不是一类事**——造成它的那件事照样是一件[发生的事](record-and-context.md#ul-occurrence--发生的事--occurrence)，
> 照样产出[记录条目](record-and-context.md#ul-record-entry--记录条目--record-entry)。
> **同一件事的两个面。**
>
> **EN**: **A layer is, right now, not on its nominal path.** It is **a state, not a kind of
> occurrence** — whatever caused it is still an occurrence and still yields record entries.
> **Two faces of one and the same thing.**

- **形态**：状态
- **出处**：[PF-011 §4 非常态](../../product/PF-011-off-nominal-handling/design.md#非常态)（rev 4） ·
  [§5.1](../../product/PF-011-off-nominal-handling/design.md#51-非常态与发生的事是同一件事的两个面)（rev 4）
- **⚠️ 注意 ①**：**它与报错无关。**绝大多数非常态**根本不报错**——用户叫停、
  能力此刻够不着、等不到回音、执行转后台；**反过来，有些报错不构成非常态**——
  工具内部捕获并自行重试成功，主路径一步没偏
- **别混**：**「异常」不是它的正式说法。**[「异常」在本系统不作为术语](../conflicts.md)，裸用时是白话
- **注意 ②**：**不为它另建记录机制**——它的记录跟正常的事完全一样

### UL-escalation · 上交 · Escalation

> **中**：**一层了结不了一个[非常态](#ul-off-nominal--非常态--off-nominal)时，
> 把处置权交给外面一层。**交上去的是**下面试过的那一批的身份与分类，不是那一批本身**。
> **上交即打断**——交出去的那一层就地停住，不再往前走。
>
> **EN**: **Handing the disposition of an off-nominal state to the enclosing layer when this
> one cannot settle it.** What travels is **the identity and classification of what was tried,
> never the tried things themselves**. **Escalating halts**: the handing layer stops where it is.

- **形态**：过程
- **出处**：[PF-011 §4 上交](../../product/PF-011-off-nominal-handling/design.md#上交)（rev 4） ·
  [§5.8](../../product/PF-011-off-nominal-handling/design.md#58-上交交的是什么)（rev 4） ·
  [§6.2](../../product/PF-011-off-nominal-handling/design.md#62-上交即打断)（rev 4）
- **注意 ⑤**：**「外面一层」＝[层的树](../../product/PF-011-off-nominal-handling/design.md#53-层的顺序不是排出来的是推出来的)上的父节点**——
  层之间是包含关系，而包含关系形成的是树，不一定是一条链。
  **接手的那一层此刻不存在时，直接交给再外面一层，这不算跳级**
- **注意 ⑥**：**阶梯到[租户](subjects-and-ownership.md#ul-tenant--租户--tenant)为止**——
  组织虽在租户外面，但条目带着这个租户的内容，**交出去就跨了隔离边界**
- **⚠️ 注意 ①**：**它本身是一件[发生的事](record-and-context.md#ul-occurrence--发生的事--occurrence)**，
  产出**新的**条目；**下层原来那条一个字不改**。
  新条目的**寿命宿主取接收层那一档或更长**
- **注意 ②**：**中文不用「升级」**——那个词在版本与权限语境里都有正常用法
- **注意 ③**：**起点可以是任何一层**（看缺的那样东西在谁手上），**但往上不许跳**
- **注意 ④**：**问人不是上交**——它[横切所有层](../../product/PF-011-off-nominal-handling/design.md#59-问人横切所有层)，
  是每一层都能用的了结手段

### UL-terminal-disposition · 终局 · Terminal Disposition

> **中**：一件[非常态](#ul-off-nominal--非常态--off-nominal)**一路[上交](#ul-escalation--上交--escalation)到头，
> 没有哪一层还能让它回到[主路径](#ul-nominal-path--主路径--nominal-path)**时，这件事的收场。
> **落终局的是那件非常态本身，不是承接它的那一层。**
>
> **EN**: What becomes of an off-nominal condition once it has been escalated all the
> way out and **no layer remains that could return it to its nominal path**. **What
> reaches this end is the condition itself, not the layer that was holding it.**

- **形态**：状态
- **出处**：[PF-011 §4 终局](../../product/PF-011-off-nominal-handling/design.md#终局)（rev 4）
- **别混 ①**：**不是失败的同义词**——算不算失败，**由落终局的那一层按自己的语义决定**
- **别混 ②**：**不是[运行终态](agent-runtime-loop.md#ul-run-terminal-state--运行终态--run-terminal-state)**——
  一次 Run 早就落了终态，那件非常态**照样可能还在往外交**
- **注意**：**只有走到根那一层才落得了**，因为只有在那里才谈得上「外面没有层了」

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
