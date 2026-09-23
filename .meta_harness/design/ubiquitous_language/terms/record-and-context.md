# 记录与上下文

**这一卷回答：留下了什么，以及怎么把它组装给读的人或模型。**

```text
              会话日志（全都在，只增不改）
                        │
            ┌───────────┴───────────┐
            ↓                       ↓
     组装给人的那份           组装给模型的那份
```

**两侧地位相同**——**不存在一份特殊的「上下文」凌驾于另一份之上**。
收在这里的是**留下来的东西本身，以及从它派生出来的那两份**。

> **不限于一段协作。**租户里多了一名成员、一个沙箱被换到别的机器上——
> **这些不属于任何一次协作，但它们同样要留下记录**。

词条格式与准入判据见 [conventions](../conventions.md)。

## 留下了什么

### UL-occurrence · 发生的事 · Occurrence

> **中**：**一件真实发生过的事，在系统为它留下任何记录之前的那个东西。**
> 它自己不是[记录条目](#ul-record-entry--记录条目--record-entry)，也不带任何标记。
> **系统对它只做一个判断——要不要为它留下至少一条记录条目。**
>
> **EN**: **Something that actually happened, taken before the system records anything
> about it.** It is not a record entry and carries no marks of its own. The system asks
> it exactly one question — **must this leave at least one record entry?**

- **形态**：总称
- **出处**：[PF-000 §4 发生的事](../../product/PF-000-occurrences-and-record-entries/design.md#发生的事)（rev 1）
- **别混**：**不是「事件」**——[「事件」在本系统不作为术语](../conflicts.md)，裸用时是白话
- **⚠️ 注意 ①**：**判断打在它身上，不打在条目上。**
  设计者手上拿到的永远是「刚发生了一件事」，那时他还没有条目可标
- **注意 ②**：**「零条」是合法答案。**纯派生的动作——比如一次
  [层级求值](scope-and-resolution.md)、一次[组装](#ul-context-assembly--上下文组装--context-assembly)——
  **重算即得，不产生任何条目**

### UL-record-entry · 记录条目 · Record Entry

> **中**：**系统为一件[发生的事](#ul-occurrence--发生的事--occurrence)留下的一条不可变条目。**
> 一件发生的事产出**零条、一条或多条**。条目一旦写下就不再改变——
> **要改变，靠追加新的条目。**
>
> **EN**: **One immutable entry the system writes for an occurrence.** An occurrence
> yields zero, one, or many. An entry never changes once written — **change is expressed
> by appending**.

- **形态**：对象
- **出处**：[PF-000 §4 记录条目](../../product/PF-000-occurrences-and-record-entries/design.md#记录条目) ·
  [§5.4](../../product/PF-000-occurrences-and-record-entries/design.md#54-一件事什么时候产出不止一条条目)（rev 1）
- **⚠️ 注意 ①**：**产出多条只有两个原因**——**干预点先于它的结果**，或**增量先于成品**。
  **「既要持久又要实时」不是原因**：一条持久条目照样能实时送达，
  **那是同一条条目的一次投递，不是第二条条目**
- **注意 ②**：**[会话日志](#ul-session-log--会话日志--session-log)是它们的一个家，不是唯一的家**——
  租户级的事不属于任何一段协作
- **注意 ③**：每条都要声明[**效力**](#ul-entry-standing--条目效力--entry-standing) ·
  **寿命宿主** · **租户身份** · **出处** · **因果先后** · **外部效果的确定性**；
  **「给谁看」不在其中**，那归[块标注](#ul-block-annotation--块标注--block-annotation)

### UL-entry-standing · 条目效力 · Entry Standing

> **中**：**一条[记录条目](#ul-record-entry--记录条目--record-entry)丢了会怎样。**三档：
> **依据**——下一步算不出来了；**留痕**——下一步照常，但解释不了发生过什么；
> **瞬态**——两样都不影响。
> **只有「依据」进[状态转移方程](agent-runtime-loop.md#ul-run--运行--run)的定义域。**
>
> **EN**: **What is lost when a record entry is lost.** Three grades: **`Deciding`** —
> the next step can no longer be computed; **`Explaining`** — the next step is unaffected
> but what happened can no longer be accounted for; **`Transient`** — neither suffers.
> **Only `Deciding` entries enter the domain of the state-transition function.**

- **形态**：属性
- **出处**：[PF-000 §4 条目效力](../../product/PF-000-occurrences-and-record-entries/design.md#条目效力--entry-standing) ·
  [§5.2](../../product/PF-000-occurrences-and-record-entries/design.md#52-那个判断两条独立充分条件)（rev 1）
- **⚠️ 注意 ①**：**它不是可见性。**留下来的东西**绝大多数模型根本不看**——
  给谁看归[块标注](#ul-block-annotation--块标注--block-annotation)，**两者互不决定**
- **注意 ②**：**它不是保留期。**一条条目的效力**不因为它被清理得早而改变**
- **注意 ③**：**干预力只在「瞬态」这一档上才有取值**——
  已提交的条目不干预任何事，**干预发生在它成为条目之前**

### UL-session-log · 会话日志 · Session Log

> **中**：**一份只增不改的流水账**，记录一个[会话](agent-runtime-loop.md#ul-session--会话--session)里发生过的事。
> **[消息](#ul-message--消息--message)只是它的一部分，其余是各种不是消息的事**——
> 每次工具执行的账、一次尝试开始这个事实，**它们不会在组装时变成消息**。
> **它记的是发生了什么，不是模型该看什么。**
>
> **EN**: **An append-only ledger** of what happened within one session. **Messages are
> only part of it**; the rest are things that are not messages at all — the account of
> each tool execution, the fact that an attempt began — **and none of them turn into
> messages at assembly time**. **It records what happened, not what the model ought to
> see.**

- **形态**：对象
- **出处**：[PF-012 §4 会话日志](../../product/PF-012-agent-loop-and-run/design.md#会话日志) ·
  [§5.11 外面进来的事，怎么到 agent 眼前](../../product/PF-012-agent-loop-and-run/design.md#511-外面进来的事怎么到-agent-眼前)（rev 9）
- **别混**：**日志不等于「拿去用的那一份」**——**日志是一份，拿去用的有两份**
- **⚠️ 注意 ①**：**只增不改没有例外。**[压缩](#ul-context-compaction--上下文压缩--context-compaction)不是例外
  （**它只往后追加一条[压缩记录](#ul-compaction-record--压缩记录--compaction-record)**——摘要是内容，
  名单它自己带着；**前面的消息一个字没改，标注也一位没翻**），
  [结果卸载](execution-and-outcome.md#ul-result-offloading--结果卸载--result-offloading)也不是
  （**原始结果从来没进过日志**），agent 取回全文是**往后追加两条**
- **注意 ②**：**它归[会话](agent-runtime-loop.md#ul-session--会话--session)，不归[运行](agent-runtime-loop.md#ul-run--运行--run)**
- **注意 ③**：**外面进来的事，是以消息的身份落进日志的**——
  **收进日志就是进队列**，**不存在「先收着，组装时再做成消息」这一步**。
  **一处不在此列**：[会话空闲时 runtime context 的生产方推来的变更一律丢弃](../../product/PF-014-inbound-intake-and-queueing/design.md#610-注入的上下文变了没有运行在跑时什么都不做)，
  **它根本不成为一条到达，也就不落日志**
- **注意 ④**：**日志里那些不是消息的事具体有哪些，本版不展开**，归 [PF-012](../../product/PF-012-agent-loop-and-run/README.md)

### UL-session-log-projection · 会话日志投影 · Session Log Projection

> **中**：**从[会话日志](#ul-session-log--会话日志--session-log)派生出来的视图**，**不是第二份权威**——
> **拿日志从头重算一遍，一定得到同一个答案**。
> 它是**每次现算**还是**落盘增量维护**，是各个投影自己的取舍，**不改变它是什么**。
>
> **EN**: **A view derived from the [session log](#ul-session-log--会话日志--session-log)**,
> **never a second source of truth** — **recomputing it from the log always yields the same
> answer**. Whether it is computed on demand or maintained incrementally in storage is each
> projection's own tradeoff, **and does not change what it is**.

- **形态**：视图
- **出处**：[PF-015 §5.8](../../product/PF-015-session-lifecycle-and-ownership/design.md#58-存储要守住的两件事)（rev 11）·
  [PF-013 §4 模态投影](../../product/PF-013-model-profiles-and-invocation/design.md#模态投影)（rev 6）**给出了第一个实例**
- **⚠️ 别混**：**不是 [runtime context](scope-and-resolution.md#ul-runtime-context--运行时-context--runtime-context)。**
  runtime context 是**会话内那三个角色**消费的；**投影多半是给会话外的服务用的**。
  两者有交集但不重合，[判据在 PF-015 §5.5](../../product/PF-015-session-lifecycle-and-ownership/design.md#55-哪些算-meta-runtime-context)
- **⚠️ 注意 ①**：**它只能从日志算得出来。**
  要是算它还得用上日志里没有的东西，**那它就不是投影**，是另一份自己的状态
- **注意 ②**：**已有两个实例，形态不同**——
  [模态投影](../../product/PF-013-model-profiles-and-invocation/design.md#模态投影)**落盘增量维护**（要答得快），
  [待处理消息队列](agent-runtime-loop.md#ul-pending-message-queue--待处理消息队列--pending-message-queue)**每次现算**。
  **现算的那些不需要存储那一套**
- **注意 ③**：**加一个新投影，不该动已有的任何一个**——这是[那套协议要兑现的事](../../product/PF-015-session-lifecycle-and-ownership/design.md#58-存储要守住的两件事)

### UL-message · 消息 · Message

> **中**：**一条对话记录**，落在[会话日志](#ul-session-log--会话日志--session-log)里。**七种，按「谁在说话」分**：
>
> | 谁在说 | 这一种 | 说的是什么 |
> |---|---|---|
> | **系统**，在开头 | `SystemMessage` | 你是谁、你该怎么做 |
> | **人** | `UserMessage` | 我要你做什么 |
> | **模型** | `AssistantMessage` | 我的回答，以及我要调哪些工具 |
> | **工具**，说**结果** | `ToolMessage` | 跑完了，结果是这样 |
> | **工具**，说**过程** | `ToolInternalMessage` | 我正在干什么，干到哪儿了 |
> | **系统**，在中途 | `SystemReminderMessage` | 外面有信息进来了，你得知道 |
> | **系统**，回头看 | `CompactionMessage` | 前面那一大段，概括起来是这样 |
>
> **前四种各家模型供应商都有，后三种是我们加的。**
>
> **EN**: **One entry of conversational record**, living in the session log. **Seven
> kinds, divided by who is speaking** — the first four exist at every model vendor;
> the last three (`ToolInternalMessage`, `SystemReminderMessage`, `CompactionMessage`)
> are ours.

- **形态**：对象
- **出处**：[PF-009 §4 消息](../../product/PF-009-context-message-types/design.md#消息) · [七种消息](../../product/PF-009-context-message-types/design.md#七种消息按谁在说话分)（rev 5）
- **注意 ①**：**说话的有四个，消息却有七种**——因为**有的说话者要说不止一类话**
- **注意 ②**：`ToolInternalMessage` 是工具说过程的那一种，**一次工具执行恰好一条**；
  [执行帧](execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame)是**它的到达增量**。
  **给人看，agent 看不到**
- **注意 ③**：`SystemReminderMessage` **不是「一条带标记的用户消息」**——
  它得是一种类型，**记录里才分得开，adapter 才认得出**

### UL-content-block · 内容块 · Content Block

> **中**：**一条消息装的是若干个块，不是一段文本。**块分几类：
> **文本 · 思考 · 语音 · 图 · 文件 · 工具调用 · 工具结果**
> （工具结果**自己又是一串块**，所以工具也能返回图）。
>
> **EN**: **A message holds a number of blocks, not a span of text.** The kinds are
> text, thinking, voice, image, file, tool call and tool result — **a tool result being
> itself a series of blocks**, which is how a tool can return an image.

- **形态**：对象
- **出处**：[PF-009 §4 消息的内容是一串块](../../product/PF-009-context-message-types/design.md#消息的内容是一串块不是一段文本)（rev 5）
- **别混**：**裸写「块」不作数**——那个词到处都是
- **注意**：**为什么不能是一段文本**——一条消息里可能既有文字又有图；
  **模型的思考与它的回答是两回事，混在一起就再也分不开**；
  工具调用的参数是结构化的，**压成文本就要靠解析捞回来，而解析会错**
- **注意**：**文件块是一个[附件](execution-and-outcome.md#ul-attachment--附件--attachment)的引用，不是文件内容**；
  **视频没有自己的块类型，装在文件块里**，它的[模态](#ul-modality--模态--modality)由块的媒体类型决定
- **注意**：块上可挂两样由[转换件](capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)产出的属性——
  [派生表示](#ul-derived-rendering--派生表示--derived-rendering)与 [transcript](#ul-transcript--transcript--transcript)，都在落盘前写好、之后不变

### UL-derived-rendering · 派生表示 · Derived Rendering

> **中**：**[转换件](capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)从一个[内容块](#ul-content-block--内容块--content-block)产出、挂在那个原块上的一组别的[模态](#ul-modality--模态--modality)的内容块**——
> 比如一张图的一段文字描述。**原块不动**，派生表示是它的属性，不是消息里另外的块；
> **不能是文件块**；**在落盘之前写好，之后不变**。组装时按有效模型的模态取对应的一份，取不到再用 [transcript](#ul-transcript--transcript--transcript)。
>
> **EN**: **A set of content blocks in other modalities, produced by a converter from one
> content block and hanging on that original block** — a text description of an image, say.
> **The original is untouched**; derived renderings are an attribute of it, not further blocks
> in the message; **never a file block**; **written before persistence and never changed**.
> At assembly the rendering matching the effective model's modality is taken; failing that,
> the transcript.

- **形态**：属性
- **出处**：[PF-013 §4 转换件](../../product/PF-013-model-profiles-and-invocation/design.md#转换件)（rev 6）
- **别混**：**不是[结果卸载](execution-and-outcome.md#ul-result-offloading--结果卸载--result-offloading)的占位**——占位替换了原件，派生表示与原件并存
- **注意**：**取哪一份不需要选择规则**——看模型收得下什么、直接取对应的那份

### UL-transcript · transcript · Transcript

> **中**：**[转换件](capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)为一个[内容块](#ul-content-block--内容块--content-block)产出的那段纯文本，作最后兜底**：
> 哪一份[派生表示](#ul-derived-rendering--派生表示--derived-rendering)都取不到时，给模型看的就是它。
> 它挂在原块上，**在落盘之前写好，之后不变**；**有它的块不再把任何模型挡在合法目标之外**。
> 正文直接写 transcript，不另起中文名。
>
> **EN**: **The plain-text rendering a converter produces for one content block, as the
> last-resort fallback**: when no derived rendering fits, this is what the model sees. It
> hangs on the original block, **written before persistence and never changed**; **a block
> that has one no longer keeps any model out of the legal-target set.**

- **形态**：属性
- **出处**：[PF-013 §4 转换件](../../product/PF-013-model-profiles-and-invocation/design.md#转换件) · [§5.11](../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面)（rev 6）
- **别混**：**不专指语音转写**——图、视频、文件的兜底文本都叫它
- **弃用说法**：~~文本那一份~~ ~~块上的文本字段~~

### UL-modality · 模态 · Modality

> **中**：**一类内容的形态：文本 · 图 · 语音 · 视频，恰四种。**
> 它写在两处，**两处必须对得上**：[模型档案](capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)上写这个模型**收得下、给得出**哪几种；
> [内容块](#ul-content-block--内容块--content-block)上写这一块**是**哪一种。
> **差一点就是它、但不是它：块的类型。**思考与工具调用是文本的**用途**，不是形态；
> **块上的模态由它的媒体类型决定**：文件块装的是附件的引用，装的是视频它就是视频模态，
> 媒体类型不在四种之列的（比如一份 PDF）**不是一种模态**，任何模型都读得了。
>
> **EN**: **The form a piece of content takes: text, image, voice or video — exactly
> four.** It is written in two places that **must agree**: on a model profile, which kinds
> the model **takes in and gives out**; on a content block, which kind **this block is**.
> **Close but not it: the block type.** Thinking and tool calls are *uses* of text, not
> forms; **a block's modality follows its media type**: a file block holds an attachment
> reference, and if that attachment is a video the block's modality is video, while a media
> type outside the four (a PDF, say) **is not a modality** and any model can read it.

- **形态**：属性
- **出处**：[PF-013 §4 模态](../../product/PF-013-model-profiles-and-invocation/design.md#模态)（rev 6）
- **⚠️ 别混**：**七类块 ≠ 四种模态**——块的类型归 [PF-009](../../product/PF-009-context-message-types/design.md#消息的内容是一串块不是一段文本)，模态归 PF-013
- **注意**：两处对不上时**挡在算合法目标那一刻**，不是挡在出门那一刻

### UL-modality-projection · 模态投影 · Modality Projection

> **中**：**这个会话的历史里，出现过哪几种「只有原件、没有 [transcript](#ul-transcript--transcript--transcript)」的[模态](#ul-modality--模态--modality)。**
> 它从[会话日志](#ul-session-log--会话日志--session-log)派生，**重算一遍必得同一个答案**；
> **只增不减**；是[合法目标集合](../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)的一个输入，
> **不是模型档案的属性**。
> **它不是「历史里出现过哪几种模态」**——那是它的上界，差的正是[转换件](capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)转成了文本的那些。
>
> **EN**: **Which modalities have appeared in this session's history with only their
> original and no transcript.** Derived from the session log — **recomputing yields
> the same answer**; it **only grows**; it is one input to the legal-target set, **not a
> property of any profile**. **Not "every modality that ever appeared"**: that is its upper
> bound, and the gap is exactly what converters rendered to text.

- **形态**：视图
- **出处**：[PF-013 §4 模态投影](../../product/PF-013-model-profiles-and-invocation/design.md#模态投影) ·
  [§6.18](../../product/PF-013-model-profiles-and-invocation/design.md#618-模态投影要答得快而且是增量维护出来的)（rev 6）
- **别混 ①**：**不是「这一次请求里带了哪些模态」**——那随压缩与筛选变；投影说的是整个会话曾经有过什么
- **别混 ②**：**不是「当前模型收得下哪些模态」**——那是档案说的能力；投影说的是历史
- **注意**：它是[会话要维护的一项状态，却不是 runtime context](../../product/PF-015-session-lifecycle-and-ownership/design.md#55-哪些算-meta-runtime-context)——会话内三个角色都不消费它

### UL-block-annotation · 块标注 · Block Annotation

> **中**：**每个[内容块](#ul-content-block--内容块--content-block)上的两个标注：给人看吗、给模型看吗。**
> **两个互不决定**，四种组合都成立。**标注在块上，不在消息上**——
> 因为**同一条消息里，各个块的去向可能不同**。
> **它只说「取不取」，不说「长什么样」。**
>
> **EN**: **Two marks on every content block: is this for people, is this for the
> model.** **They are independent** — all four combinations occur. **The marks sit on
> the block, not on the message**, because **blocks within one message may go different
> ways**. They say **whether to take it, never how to present it**.

- **形态**：属性
- **出处**：[PF-009 §4 每个块带两个标注](../../product/PF-009-context-message-types/design.md#每个块带两个标注给人看吗给模型看吗)（rev 5）
- **注意 ①**：**这是那一侧的中枢机制**——两份组装都是拿它从同一份日志里筛
- **注意 ②**：**四种组合各有实例**：绝大多数两边都给；
  工具执行过程**只给人**；给模型的设定**只给模型**；
  **没长完的工具调用两边都不给**——**留在[会话日志](#ul-session-log--会话日志--session-log)里备查**
- **注意 ③**：**它是[压缩](#ul-context-compaction--上下文压缩--context-compaction)能成立的前提**——
  **压缩要先知道哪些块是给谁的，才谈得上压谁、留谁**。
  **但压缩不翻这一位**：它另带一份[名单](#ul-compaction-record--压缩记录--compaction-record)，
  两样合起来才算得出此刻哪些块还模型可读

### UL-incremental-arrival · 增量到达 · Incremental Arrival

> **中**：**一条消息是分次到达的。**能一点点长出来的只有四样——
> **文本 · 思考 · 工具调用的参数 · 语音**；其余的**要么没有，要么整个有**。
> 两条硬性质：**半条消息不是消息**；**组装出来的，必须与一次性拿到的一模一样**。
>
> **EN**: **A message arrives in instalments.** Only four things grow piece by piece —
> **text, thinking, tool-call arguments, and voice**; everything else is **either absent
> or present whole**. Two hard properties: **half a message is not a message**, and
> **what is assembled from the instalments must be identical to what would have arrived
> in one piece**.

- **形态**：过程
- **出处**：[PF-009 §5.5](../../product/PF-009-context-message-types/design.md#55-一条消息是分次到达的) · [§5.6](../../product/PF-009-context-message-types/design.md#56-流断在半路)（rev 5）
- **注意 ①**：**流断在半路有四种收场。**其中**没收齐参数的工具调用块**
  **记下来，但两边都不给看**——**参数收齐了才算数**，
  拿半截参数去调用，**比什么都不做危险得多**
- **注意 ②**：**中断这件事本身要让 agent 知道**
- **注意 ③**：**用户看见了的，[会话日志](#ul-session-log--会话日志--session-log)里必须有**
- **注意 ④**：**「填」有两种模式**——说事的**追加片段**，说状态的**整体替换**（封口时是最后那一次填的内容）；
  **说明给在开块那一下**，此后这一块怎么填就定了。
  **[工具执行的帧走的也是这一套](execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame)**

### UL-todo-item · 待办条目 · Todo Item

> **中**：**agent 记给自己看的一条待办。**它**有自己的身份**——在一次
> [会话](agent-runtime-loop.md#ul-session--会话--session)内分得出这一条与那一条，
> 否则「去掉」与「标成做完」都指不准。它**活在一次会话里，不跨会话继承**；
> **做完了还留着，不做了才去掉**——两者必须分得出。
> **加一条不会让系统去做它。**
>
> **EN**: **One item of outstanding work an agent notes down for itself.** It **has an
> identity of its own** — within a single session one item is tellable from another, or
> neither removing nor completing it could point straight. It **lives inside one
> session and carries over to none**; **completing it leaves it on the list, dropping it
> takes it off** — the two must stay distinguishable. **Adding one never makes the system
> go and do it.**

- **形态**：对象
- **出处**：[PF-007 §6.9 `TodoItems()`](../../product/PF-007-meta-capabilities/design.md#69-todoitems通向自己手上的待办)（rev 16）·
  [PF-015 §5.6 第 13 项](../../product/PF-015-session-lifecycle-and-ownership/design.md#56-十四项-meta-runtime-context)（rev 11）
- **别混**：**与「目标」不是一回事**——那是**跨会话**的东西，
  [PF-007 明写它不装在这扇门后面，而设计链里还没有它的家](../../product/PF-007-meta-capabilities/design.md#69-todoitems通向自己手上的待办)
- **⚠️ 注意 ①**：**它是给 agent 自己看的，不是给系统执行的**——
  **一份条目清单，不是一份计划文档**
- **注意 ②**：**未完成的那些是一项
  [meta runtime context](scope-and-resolution.md#ul-meta-runtime-context--元-runtime-context--meta-runtime-context)**（第 14 项）
- **注意 ③**：**写是逐条的，不是整份覆盖**——失手的代价不同：
  错一条只错一条，**整份覆盖会连带改写或丢掉其余几条，而且不容易发现**

## 拿去用的那两份

### UL-context-assembly · 上下文组装 · Context Assembly

> **中**：**从[会话日志](#ul-session-log--会话日志--session-log)里取出一部分，拼成一份给某一方看的上下文。**
> **两侧各有一份，地位相同。**
> **组装不写日志——它只读；同一份日志组装十次，结果一样。**
>
> **EN**: **Taking part of the session log and composing it into a context for one
> audience.** **There is one for each side, and neither outranks the other.**
> **Assembly does not write to the log — it only reads; ten assemblies of the same log
> give the same result.**

- **形态**：过程
- **出处**：[PF-010 §4 组装](../../product/PF-010-context-management-and-assembly/design.md#组装) · [§6.1](../../product/PF-010-context-management-and-assembly/design.md#61-组装只读日志不写日志)（rev 5）
- **别混**：**裸写「上下文」不作数**——它另有[运行时 context](scope-and-resolution.md#ul-runtime-context--运行时-context--runtime-context) 与
  `Cordis Context` 两个所指，[已记为冲突](../conflicts.md#现有冲突)
- **注意**：**两侧形状不一样，根子是「人有记忆，模型没有」**

### UL-user-facing-context · 给用户看的上下文 · User-Facing Context

> **中**：组装给人的那一份。**两个动作，方向相反、锚点不同**：
>
> | | **往回要历史** | **一直收着新的** |
> |---|---|---|
> | 方向 | 往更早 | 往更新 |
> | 谁发起 | **用户这边要** | **不用要**，有新的自己就到 |
> | 锚在哪 | **当前已拿到的最早那一条** | 当前已拿到的最新那一条 |
> | 拿到之后 | **接在前面**（prepend） | 接在后面 |
>
> **切进一个会话时永远是先拿一段最近的，不是全量。**
>
> **EN**: The side assembled for people. **Two actions, opposite in direction and
> anchored differently**: reaching **back** for history (requested by the user, anchored
> at the earliest entry already held, prepended on arrival), and **receiving** what is
> new (unrequested, appended). **Entering a session always loads a recent stretch
> first, never everything.**

- **形态**：视图
- **出处**：[PF-010 §4 给用户那一侧](../../product/PF-010-context-management-and-assembly/design.md#给用户那一侧两个动作方向相反) · [§6.6](../../product/PF-010-context-management-and-assembly/design.md#66-给用户那一侧往回要与往后收是两个动作)（rev 5）
- **⚠️ 注意**：**用户往上翻不是「再来一次刚才那个动作」**——
  那一次锚在「最近」，这一次锚在**当前已加载的最早点位**，**再往前多取一段接上去**。
  **锚点不同，所以是两回事**

### UL-model-facing-context · 给模型看的上下文 · Model-Facing Context

> **中**：组装给模型的那一份，**分两块、分别组装**：
>
> | 块 | 是什么 | 什么时候变 |
> |---|---|---|
> | **[系统提示词](#ul-system-prompt--系统提示词--system-prompt)** | 你是谁、你有什么能用 | **在实例存续期内恒定** |
> | **会话上下文** | 这场对话到目前为止 | **每一轮都在长** |
>
> **只有第二块压得动。**
>
> **EN**: The side assembled for the model, **composed as two blocks, separately**: the
> **system prompt** (who you are, what you have — **constant for the life of the
> instance**) and the **conversation context** (the exchange so far — **growing every
> turn**). **Only the second can be compacted.**

- **形态**：视图
- **出处**：[PF-010 §4 给模型那一侧](../../product/PF-010-context-management-and-assembly/design.md#给模型那一侧两块分别组装) · [§5.3](../../product/PF-010-context-management-and-assembly/design.md#53-给模型的那一份两块各自的名字里就写着要求)（rev 5）
- **⚠️ 注意 ①**：**混成一块，就会长出「把系统提示词也收走一段」这种东西**——
  **那等于把 agent 的身份和能力清单压没了**
- **注意 ②**：**[五条要求](../../product/PF-010-context-management-and-assembly/design.md#54-组装必须满足的五条要求)**：
  [尽可能最大化前缀一致](#ul-prefix-consistency--前缀一致--prefix-consistency) ·
  **成分必须是明确标了给模型读的**（**默认拒绝**）·
  **有[压缩记录](#ul-compaction-record--压缩记录--compaction-record)时边界由它定** ·
  **先落盘再组装** ·
  **输入里必须有当下生效的那份[模型档案](../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)**
- **注意 ③**：**没有明确标了「给模型读」的，不进这一份**——**默认是拒绝，不是放行**

### UL-system-prompt · 系统提示词 · System Prompt

> **中**：[给模型看的上下文](#ul-model-facing-context--给模型看的上下文--model-facing-context)里的第一块：
> **你是谁、你有什么能用。**它的**全部成分在[装配](agent-runtime-loop.md#ul-agent-assembly--agent-装配--agent-assembly)时确定**，
> 但**每次请求时才组装出来**；**在实例存续期内恒定**。**压缩碰不到它。**
>
> **EN**: The first of the two blocks: **who you are and what you have to work with**.
> **Every ingredient is fixed at assembly time**, though **the text itself is composed
> at request time**; it is **constant for the life of the instance**. **Compaction
> cannot touch it.**

- **形态**：视图
- **出处**：[PF-010 §4 给模型那一侧](../../product/PF-010-context-management-and-assembly/design.md#给模型那一侧两块分别组装)（rev 5）·
  [PF-004 §5.4](../../product/PF-004-agent-definition-and-assembly/design.md#54-为什么系统提示词必须落在第三列)（rev 10）
- **注意**：走遍所有[meta 能力](capabilities-and-composition.md#ul-meta-capability--meta-能力--meta-capability)，
  **它应当逐字不变**——取用一个工具**不改写它**

### UL-prefix-consistency · 前缀一致 · Prefix Consistency

> **中**：这一次组装出来的上下文，**开头那一段与上一次逐字相同**。
> **产品要求是「尽可能最大化」它**，而它同时**也是给[压缩](#ul-context-compaction--上下文压缩--context-compaction)的要求之一**。
>
> **EN**: The opening stretch of this assembly being **byte-for-byte what it was last
> time**. The product requirement is to **maximise it as far as possible** — and it is
> **equally a requirement on compaction**.

- **形态**：规则
- **出处**：[PF-010 §5.4 要求一](../../product/PF-010-context-management-and-assembly/design.md#要求一尽可能最大化前缀一致) · [§6.3](../../product/PF-010-context-management-and-assembly/design.md#63-前缀尽量与上一次逐字相同)（rev 5）
- **注意**：**它与「保信息」「降长度」两两相冲**，见[压缩的三个联合目标](#ul-context-compaction--上下文压缩--context-compaction)

## 压缩

### UL-context-compaction · 上下文压缩 · Context Compaction

> **中**：把[给模型看的上下文](#ul-model-facing-context--给模型看的上下文--model-facing-context)的**会话那一块**变小。
> 它**在三个联合目标之间取平衡**：**保前缀 · 保信息 · 降长度**——
> **三者两两相冲，押住任意两个，第三个必然吃亏**，所以**不存在「最优的压缩」**。
>
> **它能做的只有两件事，不能做的有三件事：**
>
> | | |
> |---|---|
> | **能** | 对一段历史**生成一段摘要** · **点名一批[内容块](#ul-content-block--内容块--content-block)，从此不再模型可读**。**两件事交出来的是同一条[压缩记录](#ul-compaction-record--压缩记录--compaction-record)**——摘要是它的内容，名单它自己带着 |
> | **不能** | **从持久化的记录中擦除一条消息**（无论是否还模型可读）· **压上一次模型请求之后新来的消息** · **点名那些悬着的东西的占位** |
>
> **EN**: Shrinking the conversation block of the model-facing context. It **balances
> three joint goals — preserving the prefix, preserving information, reducing length —
> which conflict pairwise**: hold any two and the third suffers, so **there is no
> optimal compaction**. It **may** summarise a stretch of history and **name a set of
> content blocks that the model will no longer see** — both delivered as **one and the
> same compaction record**. It **may not** erase any message from the durable record,
> compact anything that arrived after the last model request, or name the placeholders
> of things still outstanding.

- **形态**：过程
- **出处**：[PF-010 §5.6](../../product/PF-010-context-management-and-assembly/design.md#56-压缩是一个闭包它的调子是三个联合目标) ·
  [§5.7](../../product/PF-010-context-management-and-assembly/design.md#57-压缩能做的只有两件事) ·
  [§5.8](../../product/PF-010-context-management-and-assembly/design.md#58-压缩不能做的有三件事)（rev 5）
- **⚠️ 注意 ①**：**它不回头去翻[块上那一位](#ul-block-annotation--块标注--block-annotation)。**
  那一位由产生这个块的人在落盘那一刻写下，**之后不再变**；
  **压缩写的是另一样东西——一份跟着摘要走的名单**。
  两者合起来才算得出「此刻哪些块还模型可读」：**那一位标着给模型读，
  且没有任何排在它前面的压缩记录点过它的名**
- **注意 ②**：**「不给模型看」不等于「可以删」。**
  被点名之后，**它对模型不存在了，但它对人、对排查、对回溯一直都在**——
  **[会话日志 append only](#ul-session-log--会话日志--session-log) 这条，压缩不是例外**
- **注意 ③**：**模型还没看过的东西不能先替它压掉**——这划的是**输入区间的上界**，
  上界是「**上一次模型请求**」，**不是「现在」**。
  **下界不是死的**：已有的摘要可以被再次收走
- **注意 ④**：**悬着的东西的占位不许被点名**——没答完的卡片、转后台还没回来的执行，
  **占位一旦对模型不可见，agent 就不知道自己还有东西在外面跑**
- **注意 ⑤**：**取哪个平衡是策略，不是产品设计的事**

### UL-compaction-record · 压缩记录 · Compaction Record

> **中**：压缩留下的那条消息（类型名 `CompactionMessage`）：**前面那一大段，概括起来是这样。**
> **摘要是它的内容，「从我之后这些块不再模型可读」那份名单是它自己带着的**——
> 两样一条消息，**追加进日志，前面一个字不动**。
> **有它时，[给模型看的上下文](#ul-model-facing-context--给模型看的上下文--model-facing-context)的组装边界由它来定。**
>
> **EN**: The message compaction leaves behind (type name `CompactionMessage`): *this is
> what that stretch amounts to*. **The summary is its content; the list of blocks the
> model may no longer see travels with it** — one message carrying both, **appended to
> the log, changing nothing before it**. **When present, it determines the boundary of the
> model-facing assembly.**

- **形态**：变体（父：[消息](#ul-message--消息--message)）
- **出处**：[PF-009 §4 CompactionMessage](../../product/PF-009-context-message-types/design.md#compactionmessage)（rev 5）·
  [PF-010 §6.4](../../product/PF-010-context-management-and-assembly/design.md#64-有压缩记录时边界由压缩记录定)（rev 5）
- **⚠️ 注意**：**边界不是一条截断线。**压缩标的是**块**，而**块可以散布**——
  所以「这次取哪一段」的答案**本来就不是一个起点**，而是
  **「哪些块还模型可读」**，**它们可能落在最后一条摘要之前**。
  见 [PF-010 §5.9](../../product/PF-010-context-management-and-assembly/design.md#59-块级标记解释了组装边界为什么不是一条线)

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
