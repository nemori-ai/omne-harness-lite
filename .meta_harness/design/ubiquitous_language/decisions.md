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

> 「**同一个会话同一时刻只能有一个活跃的 run，同一时刻只能有一个活跃的 agent runtime 。**
> （**目前还是遵循这个不变式，直到我们开始设计支持 gpt-live**）。
> 至于放哪里：terms/ 下可以有一个专门的主题聚合，**就叫 agent 运行时闭环**吧」

> 「shell 的那个，**同意你改名**」

### 定死了什么

| # | 裁决 |
|---|---|
| **1** | **会话与运行都是「数据的聚合」，是「治理性质的概念」**——不是过程，不是行为 |
| **2** | **[会话内单活跃](terms/agent-runtime-loop.md#ul-single-active-execution--会话内单活跃--single-active-execution)**：一个会话，同一时刻**至多一个活跃 Run**、**至多一个活跃 agent runtime**（**原话用的就是 agent runtime**；2026-09-18 至 09-20 之间本表写作「运行实例」，那是 PM 的转写，[已按原话校回](#ul-d-3--runtime-与活体--2026-09-20)） |
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
| **Run 从触发到收束** | [PF-004 已把「怎么推进、怎么收束、怎么中断」划给 Run 那一块](../product/PF-004-agent-definition-and-assembly/design.md#三个只引用不拥有的对象)，本条只定**边界在哪**，不定**怎么收束** |

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

## UL-D-2 · 架构内核 · 2026-09-20

### 产品负责人的原话

先划范围：

> 「所有的 PF 中，哪些是我们的 architecture core PF，目前是 **PF-000~PF-015 这 16 个**。
> 什么叫 architecture core PF 呢，就是**这些 PF 共同构成了我们的核心架构内核实现**，
> 它们以外的 PF，是在这个 architecture kernel 的基础上，**基于它们提供的协议、契约、接口等，
> 进行的实现、拓展**……让 agent 做产品设计的时候知道这意味着怎样的代价和取舍」

随后定了词条本身：

> 「其实只需要新增一个统一语言概念：**harness-core/architecture-core，这在我们的系统里面
> 可以认为是同义词**哈，指的就是**PF-000~PF-015 覆盖的那些设计所包含的对象、层、领域等**。
> 当然**不要写死 PF-000~PF-015**，统一语言里面可以**引用专门的架构内核 PF 索引页路径**，
> 因为**未来可能会拓展其他 PF 归到这一类里面**」

### 定死了什么

| # | 裁决 |
|---|---|
| **1** | **架构内核是一个系统概念**，所指是**对象、层、领域**——不是那批 PF 文件本身 |
| **2** | **`harness-core` 与 `architecture-core` 在本系统里同义**，指同一样东西 |
| **3** | **词条不写死编号范围**，改为引用[架构内核 PF 索引](../product/architecture-core.md) |
| **4** | **这一类会增补**：未来可能有别的 PF 归进来，所以清单必须可增长 |
| **5** | 内核与非内核的分界是「**提供协议、契约、接口**」还是「**基于它们实现、拓展**」 |
| **6** | 立这个概念的目的是**让人知道改动它的代价与取舍**，**不是禁止改动** |

### 定义正文是 PM 起草的，依据在这里

**产品负责人给的是所指（对象/层/领域）、同义关系、引用方式与分界判据，
定义的措辞由 PM 写。**推理链如下，**可核对、可推翻**：

| 定义里的哪一句 | 从哪来 |
|---|---|
| **「立规矩」对「用规矩」** | 裁决 5 的两句话——「提供协议、契约、接口」与「基于它们进行实现、拓展」。把它压成一个能当场判定的问句，**是为了过「独立」自检**（`ubiquitous-language` skill「三个自检」）：不看索引页也能判断手上的东西算不算 |
| **所指是对象、层、领域，不是 PF** | 裁决 1 原话。由此派生「[别混 ②](terms/architecture-core-and-extension.md#ul-architecture-core--架构内核--architecture-core)」：**给索引加一个 PF 是认定，不是创造** |
| **清单以索引页为准、会增补** | 裁决 3 与 4。词条只说「在那份清单上」，**具体是哪几个由索引页拥有**——那样未来增补不必动词条 |

### 三处 PM 自己定的

**① 正式名取 `Architecture Core`，`Harness Core` 进弃用位。**
[conventions 要求中英文名各一个，不并列两个，有别的叫法进「弃用」](conventions.md#一个词条长什么样)——
**这条规矩的全部目的就是让正文只有一个说法**。产品负责人说的是「可以认为是同义词」，
**那是在阻止把它们当成两个概念，不是要求正文两种都写**，两者不冲突。
选 `Architecture Core` 而非 `Harness Core` 的理由：**后者更危险**——
**承载仓库的常驻指令**一边把上游那层叫「内核」，
一边明写「**不要把本项目称为 Cordis Harness**」，**`Harness Core` 正踩在这两句中间**
（[那是承载位置的约定，不是本工作区的设计权威](../../AGENTS.md)，此处只作撞名事实引用）。
**弃用位里写明了它不是错**，读到旧说法的人查得到。

**② 这个词不裸用「内核」，正式名始终带「架构」。**
根 AGENTS.md 已经用「内核」指 Cordis 与 DSH 原语那层技术底座，
且**那个用法先在、也没错**。同一个词指两样东西，读者无从分辨；
唯一自洽的结论是**新概念让路**。这条不需要上报——[只有一个答案在逻辑上成立](../product/AGENTS.md#红线)。

**③ 为它新开一卷[「架构内核与扩展」](terms/architecture-core-and-extension.md)。**
`ubiquitous-language` skill 的「分卷」警告新开卷多半是懒，所以先逐卷核过：
现有十卷分别回答「谁在用」「一个值怎么算出来」「agent 由什么构成」「东西怎么流动」
「一段协作怎么走完」「够不够得着」「怎么跑怎么了结」「落到哪里」「怎么来往」「留下了什么」——
**没有一卷回答「哪一部分是根基」**。
**而它放不进任何一卷这件事本身就是证据**：它横跨全部架构内核 topic，
**按具体维度切的卷装不下一个跨全部维度的概念**。

### 与旧说法的关系

**「核心架构」「架构内核实现」「architecture kernel」这些在讨论里出现过的说法，
今后统一写「架构内核」。**索引页里「架构内核 PF」是**派生说法**——
指「登记在架构内核 PF 索引上的那些 topic」，不单独建词条，因为
[PF 是设计材料的编号，不是系统里的概念](README.md#这里不做的)。

## UL-D-3 · runtime 与活体 · 2026-09-20

### 产品负责人的原话

先立命名约定：

> 「我们先把能确定下来的规矩确定了先，在我们的系统里面，我们约定**凡是叫 xxx runtime 的，
> 它就应该是一个 thread/coroutine event loop**，这点你没歧义吧」

PM 当时拿「有没有待处理队列」去判，把工具执行与模型调用排除在外，被当场纠正：

> 「但是这个『命』太不正规了，**就是一次 tool execution、model request，就不是一条线程或者协程了吗**」

随后确认了后果：

> 「那我们既然把 **agent runtime 也就是 agent loop** 定义下来了，那么 **PF-004 就不能用 agent runtime**
> 并且 foundation 的 live-agent 就得推翻了对吧」

再定取消怎么传播：

> 「**两个问题本质上是中断谁**，答案很简单，**如果中断的只是一个 run（agent-loop），
> tool runtime 在后台的都不停，但是 model response 要停**（因为 model response 无法切后台）；
> **如果 session 被终止、归档、回收，那么 session 下的所有（包括子 session，以及子 session 下的所有）都要停**」

最后定会话的地位：

> 「**session 就是纯数据、治理性质的概念**，你硬要依赖它的话，你就记着这个关系：
> **一个 session 下同一时刻至多只有一个活跃的 agent-loop**」

### 定死了什么

| # | 裁决 |
|---|---|
| **1** | **凡以 `runtime` 为中心词的对象，都是一个协程**——独立执行上下文、可挂起恢复、**可被独立取消**、有自己的生命周期 |
| **2** | **有没有待处理队列，不是准入条件**。一次工具执行、一次模型请求**都是协程**，队列只决定它是否**兼任** event loop |
| **3** | **agent runtime 就是推进 agent loop 的那个东西**，PF-004 的装配产物**不是它**，PF-004 不得使用这个名字 |
| **4** | **中断一次运行**：已转后台的工具执行**不停**；模型请求**停**，理由是**它无法转后台** |
| **5** | **终止 / 归档 / 回收会话**：其名下**一切都停**，**递归到子会话及子会话名下的一切** |
| **6** | **会话是纯数据、治理性质的概念**，**不是活物**（重申并收紧 [UL-D-1 裁决 1](#定死了什么)） |
| **7** | **一个会话，同一时刻至多一个活跃的 agent loop**——[会话内单活跃](terms/agent-runtime-loop.md#ul-single-active-execution--会话内单活跃--single-active-execution)的主语由「运行实例」换成 agent runtime |

### 定义正文是 PM 起草的，依据在这里

| 写进定义的话 | 依据 |
|---|---|
| **agent runtime 是「全系统唯一的 event loop」** | 裁决 1＋2。拿裁决 2 的判据逐个量：只有它持有[待处理消息队列](terms/agent-runtime-loop.md#ul-pending-message-queue--待处理消息队列--pending-message-queue)并循环取用 |
| **agent runtime 「不持有状态」** | [Agent Loop 是纯函数](terms/agent-runtime-loop.md#ul-agent-loop--agent-loop--agent-loop)，状态全在[会话日志](terms/record-and-context.md#ul-session-log--会话日志--session-log)里。协程持有状态，停机重算就不成立 |
| **[取消跟着宿主走](terms/agent-runtime-loop.md#ul-cancellation-follows-host--取消跟着宿主走--cancellation-follows-host)是一条规则，不是四条** | 裁决 4＋5 给的是四种情形。四种的共同解释只有一个：**每个协程跟着宿主死**。而「模型请求要停，因为它无法转后台」正是这条的印证——**它从没换过宿主** |
| **「转后台就是换宿主」** | [PF-006 §6.5 已定「工具执行的运行时绑定在 session 上，与 agent 运行时、与一次 run 都是解耦的」](../product/PF-006-tools-and-skills/design.md)。裁决 4＋5 恰好给这句话补上了两头：**run 中断不波及它，会话终止才带走它** |
| **装配的产物是[装配清单](terms/agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest)，不是活物** | 裁决 3。清单[四项属性全是「装配时确定、此后不变」](../product/PF-004-agent-definition-and-assembly/design.md)，不消耗、不生灭 |

### 一处顺带查实的：这不是改主意，是校回原话

**产品负责人 2026-09-18 定[会话内单活跃](terms/agent-runtime-loop.md#ul-single-active-execution--会话内单活跃--single-active-execution)时，
原话就是「同一时刻只能有一个活跃的 agent runtime」**——见 [UL-D-1 的原话](#产品负责人的原话)。
**是 PM 当时把它转写成了「运行实例」**，此后两天里这个转写扩散到 30 个文件、264 处。

**这件事值得单记，因为它是这次拆解的一个独立佐证**：
产品负责人从一开始指的就是那个**活的、能被取消的**东西；
「运行实例」这个转写把它挪到了装配产物上，**矛盾是在转写那一步产生的**，不是原本就有。

### 四处 PM 自己定的

**① foundation 的「活体」不推翻，推翻的是 PF-004 对它的认定。**
产品负责人问的是「foundation 的 live-agent 就得推翻了对吧」。PM 核过
[SYS-COMPOSITION](../foundation/definition-and-runtime-composition/requirements.md#sys-compositionc1三段结构)
四条之后判断**不必推翻**：C1「计算资源、可回收可重建、因资源治理而生灭」、
C3「使用已捕获的绑定，不逐次重新解析」、C4「变化不改写正在活着的活体」——
**五条逐条说的都是协程**。而 PF-004 的装配产物**对不上其中任何一条**。
**foundation 一个字没说错，是 PF-004 认错了人。**这条产品负责人未反对，
且随后以「先落盘」追认；**但原话是问句，所以记在这一栏，不记在裁决表里**。

**② `handoff` 出去的不在递归范围内。**
裁决 5 说「session 下的所有……都要停」，没说 `handoff`。
[PF-007 明写 `spawn` / `delegate` 出去的**没有独立主会话身份**，`handoff` 出去的**有**](../product/PF-007-meta-capabilities/design.md)。
若父会话归档要连坐 `handoff` 出去的那个，**那个「独立主会话身份」就名存实亡**——
而它正是 `handoff` 区别于另外两种的**唯一**理由。两种读法只有一种自洽，
所以 PM 定下，不上报。

**③ 前台的工具执行运行时跟着停，落[「被中断」](../product/PF-006-tools-and-skills/design.md#67-用户可以中断而中断不是失败)。**
裁决 4 说的是「后台的都不停」，前台没说。它的结果本来要回给 loop，**loop 没了就无处可去**；
而 [PF-006 六种收场里「被中断」已经存在](../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)
且明写「不是失败，别自动重试」。只有一个答案成立。
**后果**：那一条从此有**第二个触发源**，原来只写了用户直接叫停这一次执行。

**④ [执行尝试](terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)保留，不与 agent runtime 合并。**
两者指同一个对象：**一次尝试就是一个 agent runtime 从起到灭**。
但[执行尝试承载着「重试不是新的 Run」这个治理语义](#定死了什么)，
删掉它，[UL-D-1 裁决「Run 是逻辑的、尝试是物理的」](#定死了什么)就没有落点。
**处理办法是写死关系、不造第二个执行体**：agent runtime 是执行体本身，
执行尝试是**从 Run 的角度看它**。

### 与旧说法的关系

| 旧说法 | 现在 |
|---|---|
| **「运行实例 / Agent Instance」** | **退役。**它骑两匹马——「持有已捕获的绑定」是数据那一侧，「计算资源、占用即消耗」是协程那一侧。**两半各归其位**：数据归[装配清单](terms/agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest)，活体归 [agent runtime](terms/agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime) |
| **「实例退役 / Instance Retirement」** | **改名[优雅取消](terms/agent-runtime-loop.md#ul-graceful-cancellation--优雅取消--graceful-cancellation)**，语义不变——主语从已退役的「运行实例」换成运行时 |
| 「一副身子」「装出一副身子」 | 讨论里的口语。**正文统一写「装配清单」或「agent runtime」**，视指的是哪一半 |
| `PF-004-agent-definition-and-assembly` | **目录改名 [`PF-004-agent-definition-and-assembly`](../product/PF-004-agent-definition-and-assembly/README.md)**。裁决 3 之后，`agent-runtime` 留在它的目录名里会让读者以为这个概念归它，而它归 [PF-012](../product/PF-012-agent-loop-and-run/README.md) |

## UL-D-4 · 主会话与子会话 · 2026-09-21

### 产品负责人的原话

> 「现在我们首先把 会话间关系明确一下，一个会话我们明确有两种性质：**主会话 和 子会话**，
> **主会话之间相互生命周期独立**，子会话是主会话的 agent 通过 **delegate 或 spawn** 方式创建出来的
> subagent 所在的会话，但必需强调的是 **spawn 不是 fork**，也就是**会话历史之间不存在血缘关系**，
> 所有会话都是独立并行的 thread。主会话的 agent 之间可以通信，**子会话的 agent 只能和自己的 parent
> 或者它再进一步创建出的子会话的 agent 进行通信**（这里我们**不约束子会话的嵌套层级**，
> 至少 PF-015 的讨论中不约束）。」

随后两次澄清：

> 「**放宽 PF-007 的产品设计约束**，未来我们可能会提供 agent 间通信的机制，**子->父可以发消息**
> （比如**确认事实、澄清需求**等）。「主会话的 agent 之间可以通信」就是 **PF-007 的规则二**，
> 就是这里的「活跃」需要明确定义：**未被归档**（这个生命周期我们后面会讲，
> **我们没有删除会话的概念，所以严格意义上没有会话结束的概念**）。」

> 「「所有会话都是独立并行的 thread」这里的 **thread 只是我口头说的，不需要记录**，
> 意思就是**数据结构（可变数组也好还是链表也罢）上所有的会话是不应该存在共享的节点的**。」

**2026-09-22 把「不共享」说到底：**

> 「**不同的 session 在 session log、投影、runtime context snapshot 的数据存储上
> 不存在共享的情况。**」

以及对 PM 一处误推的纠正：

> 「这个推论不对，因为取一个被卸载掉工具原始结果，是**通过获取工具结果的这个工具能力，
> 通过 session_id 和 tool_call_id 来获取**，那**只要是同一个租户下的 agent，都有权限访问**
> （除非这个工具本身被禁用），我说的「共享节点」指的是**会话的 session log 在存储上的共享
> （也就是指针引用）**，不是一个概念哈。」

### 定死了什么

| # | 裁决 |
|---|---|
| **1** | **会话有两种性质：主会话与子会话。**子会话是**由某个会话的 agent 通过 `delegate` 或 `spawn` 创建出的 subagent 所在的那个会话**；其余都是主会话 |
| **2** | **主会话之间生命周期相互独立** |
| **3** | **`spawn` 不是 `fork`**：**会话历史之间不存在血缘关系**。**子会话不继承父会话的日志**；**`spawn` 交出去的是[派发那一刻组装出来的那份上下文的副本](../product/PF-007-meta-capabilities/design.md#两处分水岭各自只有一条)，作为子会话的起始输入**（2026-09-22 说准） |
| **4** | **存储上不共享节点**：会话的 **session log、[投影](terms/record-and-context.md#ul-session-log-projection--会话日志投影--session-log-projection)与 [runtime context](terms/scope-and-resolution.md#ul-runtime-context--运行时-context--runtime-context) 的快照存储三处都不共享节点**，不存在指针引用（2026-09-22 说全）。**这是存储约束，不是访问约束**——跨会话取数据照常经工具能力与租户权限进行 |
| **5** | **不约束子会话的嵌套层级**（PF-015 范围内） |
| **6** | **通信拓扑**：主会话的 agent 之间可通信（即 [PF-007 规则二](../product/PF-007-meta-capabilities/design.md)）；子会话的 agent **只能与自己的直接 parent、或它自己再创建出的子会话的 agent** 通信。**兄弟之间、隔代之间都不可** |
| **7** | **放宽 PF-007：子 → 父可以发消息。**用途是**确认事实、澄清需求**这类子主动发起的求助 |
| **8** | **「会话仍活跃」= 未被归档。****没有删除会话的概念，严格意义上也没有「会话结束」** |

### 定义正文是 PM 起草的，依据在这里

**产品负责人给的是八条裁决**，两个词条的措辞由 PM 写。推理链如下，**可核对、可推翻**：

| 定义里的哪一句 | 从哪来 |
|---|---|
| **主会话 / 子会话是会话的「性质」，不是两种不同的对象** | 原话「一个会话我们明确有**两种性质**」。两者都完整地是[会话](terms/agent-runtime-loop.md#ul-session--会话--session)——都有耐久身份、归属边界、自己的日志，只是**在关系里扮演的角色不同** |
| **子会话由「创建」确立，不由「历史」确立** | 裁决 1 + 3 合起来：它是被 `delegate`/`spawn` **创建**出来的，**不继承父的日志**——`spawn` 带过去的那份副本**是它自己日志里的第一条**，不是父那本账的一段。这正是它与 fork 的分界 |
| **「主会话」的外延 = 不是子会话的会话** | 裁决 1 只正面定义了子会话。`handoff` 派出去的 agent [已被定为「有独立主会话身份」](terms/interaction-and-dispatch.md#ul-subagent--子-agent--subagent)，与此一致 |
| **三种关系分开陈述** | 裁决 2/3/4/6 分属不同层面：**历史血缘（无）**、**生命周期从属（有）**、**存储独立（有）**、**通信拓扑（有）**。设计方法明确要求[不把不同关系压成一棵树](../../agents/skills/harness-design-handbook/canonical/references/architecture/foundations/paradigm.md)——「子实例由父实例创建，不足以证明继承其全部权限」 |
| **「存储上不共享」覆盖三处存储** | 裁决 4 的 2026-09-22 原话逐字点了 **session log、投影、runtime context snapshot** 三样；三者都是**一个会话自己的**数据，**共享其中任何一处都会让「两个会话各自独立」名存实亡** |
| **「存储上不共享」写成产品可验收的后果** | 裁决 4 的原话是数据结构层面的。产品红线是[不把技术实现写进产品设计](../product/AGENTS.md)，故译为：**对任何一个会话做任何事，都不会让别的会话的历史变得残缺**。**不译为「历史自足」**——那说过头了，子会话日志里完全可以有一条占位，取全文时凭 `session_id` + `tool_call_id` 走工具能力去拿 |
| **「活跃」不等于「未结束」** | 裁决 8。既然没有「结束」，[规则二](terms/interaction-and-dispatch.md#ul-inter-agent-communication--agent-间通信--inter-agent-communication)的「会话仍活跃」就只能锚在**归档**上 |

### 一处 PM 自己定的：裁决 7 落实成「规则一改双向」，而不是新立第三条规则

**裁决 7 只说「子 → 父可以发消息」，没说改哪条规则。**两种落实方式在产品长相上**完全一样**
（子都能给父发消息），所以这是 PM 该自己定的。**选了改规则一，推理如下，可核对、可推翻：**

| 判断 | 依据 |
|---|---|
| **新立一条只管「子 ↔ 直接父」的规则，会让规则从两条变三条** | 而两条规则的分工是「**有派发关系**」与「**有独立主会话身份**」——清晰且正交。第三条会引入第三个判据（父子会话关系），**而它在当前外延上与规则一完全重合** |
| **改规则一为双向，不会让任何不该通的通了** | 规则一的条件只有「是不是我派的」。双向之后新增的通路只有「被派发者 → 派发者」这一类：`handoff` 出去的**本来就能**（它落在规则二里），`spawn`/`delegate` 出去的**正是裁决 7 要放开的**。**兄弟之间仍然不通**——它们彼此没有派发关系 |
| **两种表述当前外延相同** | 产品负责人用的词是 **parent**，规则一用的是**派发者**。二者在当前只差 `handoff`——而 `handoff` 出去的 agent 有派发者、没有 parent，**它在两种表述下都能跟派发者通**（一种靠规则一，一种靠规则二） |
| **⚠️ 它们何时会分叉** | **若将来出现「有派发关系但不构成父子会话」的第四种派发模式**，「派发关系双向」会比「父子双向」多放开一条通路。**届时须回到这条重新裁决** |

**顺带的后果**：[PF-007 §9.2](../product/PF-007-meta-capabilities/design.md#92-报告之后派发者再发一条消息子拿什么回应)
记的那个「**现有正文无解**」的真缺口——子交完报告之后收到消息，两条出路（发消息 / 再交报告）都被封死——
**通路那一半就此闭合**。**剩下的一半仍在**：那条回应算不算子会话里新的一次运行，
它与[会话内单活跃](terms/agent-runtime-loop.md#ul-single-active-execution--会话内单活跃--single-active-execution)对不对得上。

### 两处顺带核出来的来源问题

[UL-session 注意 ③](terms/agent-runtime-loop.md#ul-session--会话--session) 原先写：
「PF-005 的沙箱销毁与 PF-007 的授权消失**全都挂在『会话结束』这个事实上**」。

**核对后 PF-005 那一半不成立**：[PF-005 §6.3](../product/PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存)
写的是「每个会话级沙箱有**最大连续存活时间**；到点直接销毁」，销毁挂的是**沙箱自己的存活时间**，
不是会话结束；同节还明写「**会话可以无限期存在**」——比 UL-session 那条推导更早、也与裁决 8 一致。

**第二处**：[产品区 README](../product/README.md#已排定尚未开题的编号) 原先写「**四条**已接受的规则
吊在『会话结束』这个尚未定义的事实上」。逐条核对后**只有两条**——除了上面剔除的 PF-005，
[PF-012 §6.6](../product/PF-012-agent-loop-and-run/design.md#66-终态不可逆且只有一个出口) 也不算：
它说的是 **Run 的三个终态（完成 / 失败 / 被取消）**，「先确保会话存在」是**落账的前提**，
与会话是否结束无关。

**因此真正押在「这段协作到此为止」上的只有两条**：PF-007 的会话授权上下文，
以及[规则一缺少「活跃」条件](terms/interaction-and-dispatch.md#ul-inter-agent-communication--agent-间通信--inter-agent-communication)
带来的那个悬案。**两条的锚点现都改为归档**，而归档的精确语义归 PF-015。
UL-session 注意 ③、产品区 README 与 [architecture-core](../product/architecture-core.md) 已按此修正。

### 与旧说法的关系

| 旧说法 | 现在 |
|---|---|
| [UL-subagent](terms/interaction-and-dispatch.md#ul-subagent--子-agent--subagent) 注意「**「子会话」这个关系本身还没有定义**……内涵等 PF-015」 | **内涵已由本条裁决给出**；该注意已改写 |
| [规则一](terms/interaction-and-dispatch.md#ul-inter-agent-communication--agent-间通信--inter-agent-communication)「只管一个方向（派发者往外）」 | **改为双向**：agent 与它派发出去的 agent 之间可以互发消息（裁决 7 的落实方式，见下） |
| [PF-007 三种派发模式五维表](../product/PF-007-meta-capabilities/design.md#派发有三种模式)的「**能不能向派发者发消息**」那一维 | **改为「能跟谁通信」**。放宽之后三种模式在这一维上都是「能」，它不再是分水岭；**真正的区别是能跟谁通**——`spawn`/`delegate` 只能跟派发者，`handoff` 还落在规则二里 |
| [PF-007 §6.8「不能发消息」不等于「不能说话」](../product/PF-007-meta-capabilities/design.md#报告与消息是两样东西) | **改名「报告与消息是两样东西」**。那一节原本靠「不能发消息」来反衬报告的必要性，前提已不在；**报告与消息的区分本身不变** |
| 规则二的「**会话仍活跃**」无定义 | **= 未被归档**（裁决 8） |
| [PF-007 五维表](../product/PF-007-meta-capabilities/design.md#派发有三种模式) `spawn` 那格「**继承当前会话的**」 | **写准为「带着派发那一刻组装出来的那份上下文的副本开始」**（2026-09-22）。[PF-007 §9.1 那条未决项随之闭合](../product/PF-007-meta-capabilities/changelog.md#rev-15--2026-09-22)——「**共享同一份会话日志**」那一侧作废 |
| 「对方会话已经结束时规则一还成不成立，**等 PF-015 定义会话终态**」 | 问题**重新表述**为「**对方会话被归档后规则一还成不成立**」，仍未决 |

## UL-D-7 · 能力接缝与 Cordis 插件树 · 2026-10-02

### 产品负责人的裁决

2026-10-02 #53／#46 合并方案的访谈里（按原话整理）。先问 Cordis 改成契约规范之后集成约定要不要自己定，主线答要；随后：

> 「你参考一下 deepseek harness 它有没有在 cordis 之上的装配约定，有的话，我们的设计可以参考它那边的作为设计的起点，
> 再结合我们的系统实际要求和设计来进一步完善」

DSH 的约定以能力接缝三角色为骨架（[调研](../../research/dsh-cordis-integration-conventions/research.md)）。关于服务面放哪、装配怎么给：

> 「1. 服务放哪这个按你的建议来；2. 装配改成数据，但是你说的分层方式和租户维度又是影响什么的呢？」

主线答：进程这一级先分两级（发行默认＋运维者），租户在这一级没有一格，租户维度落在按会话装上的那一侧。负责人答「**可以**」。
服务定义放哪，读完布局后改定为：

> 「看下来服务定义全部在 core 里吧」

取名时主线报三组候选，负责人选定（AskUserQuestion，2026-10-02）：三个角色**全部加「Cordis」前缀**；进程那一级叫 **「Cordis 插件树 ＋ 插件树层」**；
**「宿主平面／Agent 平面」与按会话装上的 Cordis 插件所在的作用域都先不立**，作用域留给 Agent 平面作用域试点去定。

**要说清楚裁的是什么**：负责人裁了「以 DSH 的三角色为起点」「进程一级的装配是数据、两级、无租户一格」「服务定义放 core」与上面三个名字；
**定义的措辞全部由 PM 写**，依据逐条列在下面，可核对、可推翻。「能力接缝」这个名字不在三组候选的改动范围里，沿用候选原文。

### 这条走第二种出处，三个条件逐条核过

| 条件 | 核对 |
|---|---|
| **跨全链** | 52 个实现映射节点的设计都要写自己担哪个接缝的什么角色；[PF-004 design](../product/PF-004-agent-definition-and-assembly/design.md) 与 PF-002／004／012／014／015 的 `decisions.md` 已按 Cordis 的意思在用「服务提供者」（见 [C-50](conflicts.md#c-50裸写的服务提供者)）；本项目的 Cordis 集成约定与装配节点都以插件树为对象 |
| **没有哪个 topic 拥有它** | [D-112](../record/decisions/cordis-as-assembly-contract/README.md) 定 Cordis 是装配契约、不是建模视角——装配上的说法不归任何产品 topic；它们的规则将写在实现映射区的集成约定里，那不是 topic |
| **产品负责人直接裁决过** | 上面四段原话与三个取名选择 |

### 定义正文是 PM 起草的，依据在这里

| 词条 | 依据 |
|---|---|
| [能力接缝](terms/architecture-core-and-extension.md#ul-capability-seam--能力接缝--capability-seam) | DSH 的 `seam`：三角色合起来才是一个接缝、单个角色不是（[调研约定表 #1](../../research/dsh-cordis-integration-conventions/research.md)）。「一个服务键一个接缝」「服务定义恰一个」来自负责人「服务定义全部在 core」——定义只能有一处 |
| [Cordis 服务定义](terms/architecture-core-and-extension.md#ul-cordis-service-definition--cordis-服务定义--cordis-service-definition) | DSH 的 `Service Definition`：拥有 `ctx.<key>` 与词汇类型，是抽象类或具体注册表 service，从不是 TS `interface`（约定表 #3） |
| [Cordis 服务提供者](terms/architecture-core-and-extension.md#ul-cordis-service-provider--cordis-服务提供者--cordis-service-provider) | DSH 的 `Service Provider`：提供或登记实现，换掉它不动消费者（约定表 #1） |
| [Cordis 服务消费者](terms/architecture-core-and-extension.md#ul-cordis-service-consumer--cordis-服务消费者--cordis-service-consumer) | DSH 的 `Consumer`：按键注入；可选依赖按键取用（约定表 #1、#6）。「只依赖服务定义、不 import 提供者特有的东西」是**规则**，归集成约定，不写进定义 |
| [Cordis 插件树](terms/architecture-core-and-extension.md#ul-cordis-plugin-tree--cordis-插件树--cordis-plugin-tree) | 负责人「装配改成数据」「可以」；DSH 的 profile／bundle／patch 分层（约定表 #11）。形态写视图：它丢了能从各层原样重算 |
| [插件树层](terms/architecture-core-and-extension.md#ul-plugin-tree-layer--插件树层--plugin-tree-layer) | 负责人认可的两级与「租户无一格」。形态写位置：本版两格由设计穷举，不在运行期创建 |

### 两处 PM 自己定的

- **三个角色的形态写「属性」**：它们是一个包在某个接缝关系里扮演的角色，不引入新身份；一个包可以对不同接缝担不同角色。
- **插件树层不叫「发行默认层」**：「默认」与作用域层的「出厂默认」太近，正式名用「发行层」，别混里写明两者不是一回事。

### 这里不收的名字

| 名字 | 不收的理由 |
|---|---|
| 宿主平面、Agent 平面 | 负责人裁定先不立。「宿主」撞[宿主机](terms/grounding-and-isolation.md#ul-host-machine--宿主机--host-machine)与领域对象的「宿主」字段；进程那一级已由插件树说清 |
| 按会话装上的 Cordis 插件所在的作用域 | 负责人裁定留给试点定；机制还没设计，现在收等于把草稿定成语言 |
| 集成约定 | 一份文档的名字，不是概念 |

## UL-D-6 · 模型适配绑定 · 2026-09-27

来源：产品负责人在本轮模型请求纵线讨论中明确要求「公共实现 + 模型窄适配」，并确认按模型逐个调优、八家 37 个模型的首批范围；要求提醒消息采用专用消息类型或 user，缓存策略按具体供应商实现且验证真实命中，TTL 不写死。随后授权实施已讨论的完整交付方案。

本条只固定新增词汇的含义，不代替接口、热更新机制或新规格的接受。模型适配绑定是调用所持有的适配属性：指明具体实现版本、模型窄定义及配置。它没有独立领域身份，不增加另一种模型档案或调用对象。模型前缀缓存策略是该绑定中的配置属性，缓存命中是上游报告的事实，不能由配置推断。

## UL-D-5 · 凭据保管方 · 2026-09-25

### 产品负责人的裁决

[D-063 R-1](../record/decisions/assets-runtimes-rulings-2026-09-25/README.md#裁决)（2026-09-25，产品负责人在场，按原话整理）：

> **同意改为「接口契约 + 最小提供者」**：两块运行时 inject 的每个依赖各定一份窄口 candidate v1
> （会话日志、装配清单、会话租户、尝试事实、**凭据保管方**、执行环境、中心连接），按消费者需要定，真提供者要更多走新版本。

**要说清楚裁的是什么**：产品负责人裁的是「**每个被注入的依赖各立一份契约**」；七个名字是主线在报告里列的，他整体同意。
**他没有就「凭据保管方」这几个字指什么另下一句话**——定义的措辞全部由 PM 写，依据逐条列在下面，可核对、可推翻。
若要让这条出处更硬，最便宜的办法是请产品负责人对下面那条定义点一次头。

### 这条走第二种出处，三个条件逐条核过

| 条件 | 核对 |
|---|---|
| **跨全链** | 三个 topic 都倚着它：[PF-013 §5.6](../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) 发出时要取租户那一把的值；[PF-002 §4 MCP 凭据](../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的) 经 OAuth 取得的那一份要有人拿着；[PF-016 §6.20](../product/PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据) 离线时用据点上那份副本、[§6.11](../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现) 秘密不进任何呈现。规格里 `data.asset-model` v2 S-23、`data.mcp-endpoint`、`capability.mcp-bridge`、`capability.model-profile-directory` 都已在用「保管方」这个说法 |
| **没有哪个 topic 拥有它** | [PF-002 的推导](../product/PF-002-assets-settings-and-permissions/decisions.md#rev-20-的主线推导与-pm-推导2026-09-24)明写「存哪、加密、何时续、多副本谁来续、中途失效的收场**归技术设计**」——产品正文有意不收它 |
| **产品负责人直接裁决过** | 上面那条 R-1。**这一条是三条里最薄的**，理由见上一节 |

### 定义正文是 PM 起草的，依据在这里

| 定义里的哪一句 | 从哪来 |
|---|---|
| **拿着本体的那一方；别处只见引用或「配没配」** | `data.asset-model` v2 S-23：配值里只放不透明引用，「解引用时由凭据本体的保管方按调用方的持有判定」；[PF-016 §6.11](../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现)：能呈现的只有有没有、哪个范围、什么时候配的 |
| **只按条件交出，不拿别的顶上** | `capability.credential-custodian` v2 S-9、S-13、S-17：副本按租户交出、OAuth 那一份按持有与授权交出，条件不成立就不交；[SYS-TENANT](../foundation/cross-system-constraints/requirements.md#sys-tenant) 跨租户默认拒绝 |
| **落在它之外的持久介质上只以加密形式存在** | 同一份契约 S-7；[D-060 §八 M47](../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)（据点副本经它落地、加密） |
| **只保管，不决定配哪一把** | 同一份契约 S-2：配哪一把、换、解除归模型档案目录，OAuth 授权的状态归 MCP 桥；保管方只读它们 |

### 两处 PM 自己定的

**① 形态定为「属性」——它是一个角色，不是一样新东西。**
它的所指是「在凭据这件事上**拿着秘密本体**的那一方」这个角色。本版扮演它的是每个会话据点上的一份能力实例；
[契约 G-7](../spec/capabilities/credential-custodian/v2/contract.md#十一已知缺口) 留着中心那一侧的保管，将来那一侧也可能扮演它——
**角色不变，扮演者会变**。判成「对象」就得给这些实例定身份与生灭，而那是提供者设计的事
（[宿主、级别不写进词条](conventions.md#形态这个词指的是哪一类东西)）。与[子 agent](terms/interaction-and-dispatch.md#ul-subagent--子-agent--subagent)
是同一种判法：一段关系里扮演什么。

**② 正式名带「凭据」，不裸用「保管方」。**「保管方」单拿出来，读者会想到数据保管、文件托管；
规格正文在不会误读的地方可以简称，跨 topic 用正式名。

### 同一条裁决里另外六个名字怎么处置

| 名字 | 处置 |
|---|---|
| 会话日志、装配清单、执行环境 | **已有词条**，契约兑现的是它们的一个窄口，不另立 |
| 会话租户 | **不立**：会话持有的租户身份就是会话创建那一刻捕获的[当前租户身份](terms/subjects-and-ownership.md#ul-current-tenant-identity--当前租户身份--current-tenant-identity)（[PF-015 §6.12](../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)），不是新概念 |
| 尝试事实 | **不立**：两件事实里「这次尝试已被取代」归[尝试栅栏](terms/agent-runtime-loop.md#ul-attempt-fence--尝试栅栏--attempt-fence)（出处是 PF-012 正文，不走本条），「运行已终结」就是落了[运行终态](terms/agent-runtime-loop.md#ul-run-terminal-state--运行终态--run-terminal-state) |
| 中心连接 | **不立能力名**：它在本版只维护一份观察，那份观察立为[治理中心可达性](terms/reach-and-availability.md#ul-governance-center-reachability--治理中心可达性--governance-center-reachability)，出处是 PF-016 与 PF-017 正文，也不走本条 |

### 同批契约里标了「无词条」、这里不收的名字

**它们都是契约自己的记录形状、标识或操作**，权威在各自契约的那一条；别的契约按坐标引用就是唯一一份，
在词表里再写一遍就是[第二份定义](README.md#这里不做的)。

| 名字 | 权威在哪 | 不收的具体理由 |
|---|---|---|
| 条目壳 | `capability.session-log` v2 S-6 | 记录形状。它的产品一半——每条条目上挂什么——已在[记录条目](terms/record-and-context.md#ul-record-entry--记录条目--record-entry)注意 ③ |
| 判重键、读取键、日志位置、尾位置 | 同上 S-7～S-9 | 追加与读取用的字段，只有这一份契约定义，别处按坐标引用 |
| 换表记录、序号、头、表时刻 | `capability.assembly-manifest` v2 S-5～S-9 | 装配清单内部怎么切分，[PF-004 那一程还没定](../spec/capabilities/assembly-manifest/v2/contract.md#十已知缺口)（G-1）——现在收等于把草稿定成语言；「序号」「头」还是通用词 |
| 在场事实 | 同上 S-10 | 只在这一份契约里，来源与语义归属都还悬着（G-2、[D-060 §八 N-37](../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ②） |
| 已被取代、已终结 | `capability.run-attempt-facts` v2 S-5 | 判定形式，所指已由尝试栅栏与运行终态接住；两个词裸用在别处各有别的意思 |
| 保管条目、副本条目、OAuth 条目、清扫 | `capability.credential-custodian` v2 S-5、S-18 | 保管方内部的记录形状与动作；「清扫」在租户领域的契约里另指清掉过期的注册记录，裸用会撞 |
| 执行环境引用、进程组、落点判断 | `capability.execution-environments` v2 S-5～S-7 | 不透明标识、操作系统的现成概念、一个操作；产品一半已在[宿主机](terms/grounding-and-isolation.md#ul-host-machine--宿主机--host-machine)与[执行环境权限](terms/grounding-and-isolation.md#ul-execution-environment-permission--执行环境权限--execution-environment-permission) |
| 拓展件子进程的宿主机允许 | 同上 S-6、G-3 | **产品还没给这项允许**（D-060 §八 N-37 ⑧，账本 ⑭），写不出无歧义的定义 |

返回[统一语言入口](README.md)
