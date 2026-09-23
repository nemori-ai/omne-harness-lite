# 消息、到达语法与流装配器：三层各以谁为起点

## 需要作出的选择

本系统里有三样东西被**模型请求运行时**与**工具运行时**同时消费，而设计链里还没有任何一份契约写它们：

| 层 | 它回答 | 谁产出 | 谁消费 |
|---|---|---|---|
| **数据契约**（落盘形态） | 一条消息、一个内容块、块上的标注与派生属性长什么样 | 两个运行时各自产出完整消息；「消息落盘之前」的拓展件改写派生属性 | 会话日志、两侧组装、模态投影、压缩 |
| **到达语法**（流协议） | 一条消息分次到达时，每一步到达增量长什么样、按什么次序来、怎样算结束 | 传输适配（模型回复）；工具（执行帧） | 流装配器；实时投递给人的那一路 |
| **流装配器** | 一串到达增量怎样变成一条完整消息，流断在半路时怎样收场 | —— | 两个运行时，在交给「消息落盘之前」之前 |

要选的是：**这三层各以谁为起点**——DSH `llm/llm` 的类型与 `StreamChunk`、pi-ai 的类型与事件、按产品正文自研，还是逐层混合。

这个选择会改变的可观察结果：模型换一家或流断在半路时，**会话日志里留下的是什么**；
工具运行时能否**不装载模型请求运行时的任何部分**就产出 `ToolMessage` 与 `ToolInternalMessage` 并被单独测试；
上游库升级时，**已经落盘、永不改写的会话日志**要不要跟着迁移。

**必须保留**的是下一节的性质。**可以调整**的是：每一层借用哪份上游的形状或代码、fork 还是只借形状、这些模块放在哪个包。

**用户要求**（本程计划块 D，2026-09-23）：这套契约让两个运行时**各自可独立端到端测试**，并**先于**两块运行时的契约定型。

### 输入基线的一处漂移

研究首轮对照的是 PF-009 **rev 4**，本包以 **rev 5** 为准。研究[读出的四处张力][R§11]里，rev 5 关掉了两处，另一处移出本版：

| 研究里的张力 | rev 5 之后 | 对本选择的影响 |
|---|---|---|
| ① PF-009 §6.6「出门时由 adapter 压图」与 PF-013 转换件口径不一致 | **已闭合**：[§6.6](../../../product/PF-009-context-message-types/design.md#66-内容是块不在进日志时压成文本) 改以 PF-013 为准——落盘之前挂派生表示与 transcript | 两源「出门时派生占位」（[D3][D3]、[P11][P11]）从「与口径之一冲突」变为**与唯一口径冲突** |
| ② 出错断流、用户已看见的部分落在哪 | **已闭合**：[§5.6](../../../product/PF-009-context-message-types/design.md#56-流断在半路) 拆成两行——**记在这次尝试的账里，不成为消息** | 尝试的账要装得下**已交付的内容**（一串块），**不是到达过程**（[§9.2](../../../product/PF-009-context-message-types/design.md#92-流式不留到达的过程)）。DSH 的 `assistant/attempt` 在「放在哪」上与之一致，在「放什么」上仍相反（[S2][S2]） |
| ③ 块的身份与嵌套块的标注未定义 | **仍开着**，属技术设计（研究原话「产品正文只需指路」） | 数据契约必须回答，见[剩余责任](#剩余责任与能力演化) |
| ④ 语音「给模型看」标注与落盘时序 | **移出本版**：[§5.9](../../../product/PF-009-context-message-types/design.md#59-语音生成了不等于听到了) 语音就是普通输入输出，播放进度不改日志与组装；双工记为 [§9.4](../../../product/PF-009-context-message-types/design.md#94-设计缺口实时双工下没听到的不给模型看) 设计缺口 | 语音块照普通可增长块处理，不预埋播放进度字段 |

**rev 5 全文待产品负责人确认**（[PF-009 状态](../../../product/PF-009-context-message-types/README.md#状态)）。它若被驳回，①②回到研究当时的张力，
受影响的是数据契约的「尝试的账」形状与转换件落点，不是本包三层的起点选择。

## 必须兑现的性质

候选逐条对这张表回答。编号只在本包内使用。

| # | 性质 | 出处 |
|---|---|---|
| N1 | **七种消息，看类型就知道谁在说话**，不靠解析内容，也不靠另一个来源字段 | [PF-009 §4 七种消息](../../../product/PF-009-context-message-types/design.md#七种消息按谁在说话分)、[§6.1](../../../product/PF-009-context-message-types/design.md#61-一条消息是谁说的永远查得到且不靠解析内容)；来源另是一个属性 [§6.5](../../../product/PF-009-context-message-types/design.md#65-来源是一个属性不是另一种消息) |
| N2 | **七类块**；视频装在文件块里，块的模态由媒体类型决定；文件块是附件引用 | [PF-009 §4 块](../../../product/PF-009-context-message-types/design.md#消息的内容是一串块不是一段文本)、[PF-013 模态](../../../product/PF-013-model-profiles-and-invocation/design.md#模态) |
| N3 | **每块两个标注**，互不决定、四种组合；产生者在落盘那一刻写定；压缩**点名**块而不翻标注——块要能被单独指到 | [§6.11](../../../product/PF-009-context-message-types/design.md#611-每个块都带给人看--给模型看两个标注)、[PF-010 §5.7](../../../product/PF-010-context-management-and-assembly/design.md#57-压缩能做的只有两件事) |
| N4 | **派生表示与 transcript 是块的属性**，挂在原块上、原块不动、落盘之前写好之后不变；派生表示不能是文件块 | [PF-013 转换件](../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)、[UL-derived-rendering](../../../ubiquitous_language/terms/record-and-context.md#ul-derived-rendering--派生表示--derived-rendering)、[UL-transcript](../../../ubiquitous_language/terms/record-and-context.md#ul-transcript--transcript--transcript) |
| N5 | **到达语法**：开块（**开块时声明填法：追加片段或整体替换**）→ 填（只有文本、思考、工具调用参数、**语音**能填）→ 封口交出完整的块 → 记一次账 → 收尾；图、文件、工具结果开口后整个交出 | [§5.5](../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法)、[填法](../../../product/PF-009-context-message-types/design.md#填有两种模式开块的时候说明是哪一种)、[§6.15](../../../product/PF-009-context-message-types/design.md#615-每一块自己说它是追加片段还是整体替换系统照办) |
| N6 | **语法的三条硬性质**：封口交完整块、**一条流必须有结局**、**账只记一次**；外加**组装结果 = 一次性拿到**（可验证的性质）与**半条消息不是消息** | [§5.5](../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法)、[§6.7](../../../product/PF-009-context-message-types/design.md#67-分次到达的东西不进消息类型清单)、[§6.8](../../../product/PF-009-context-message-types/design.md#68-组装的结果与一次性拿到的必须相同) |
| N7 | **流断处置**五行表：叫停有内容 → 标明中断的完整消息，半截工具调用留在消息里、两个标注都关；叫停无内容 / 出错无内容 → 只留尝试的账；出错有内容 → 已交付部分进尝试的账、不成消息；截断 → 正常消息连同半截调用。**参数收齐才解析、只解析一次**。**首 token ＝ 第一个内容增量**（文本、思考、工具调用参数，哪种先到都算） | [§5.6](../../../product/PF-009-context-message-types/design.md#56-流断在半路)、[§6.10](../../../product/PF-009-context-message-types/design.md#610-没收齐的工具调用参数不解析不执行)、[PF-013 已经开口说话了](../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) |
| N8 | **工具帧两条轨**：一次执行一条 `ToolInternalMessage`，帧是它的到达增量、**走同一套语法**；不进模型上下文；节流只可合并、不许默默丢；发帧失败不影响执行；系统不查工具定义 | [§5.8](../../../product/PF-009-context-message-types/design.md#58-toolinternalmessage工具说它正在干什么)、[§6.14–§6.17](../../../product/PF-009-context-message-types/design.md#614-工具帧不进模型的上下文)、[PF-006 发帧](../../../product/PF-006-tools-and-skills/design.md#帧长什么样由一份协议约定不由工具定义声明) |
| N9 | **落盘不留到达过程**：留最终那条消息（整体替换块留最后一次）与中断时已交付的部分，不留每个增量怎么到、何时到 | [§9.2](../../../product/PF-009-context-message-types/design.md#92-流式不留到达的过程)；增量是瞬态、成品一条 [PF-000 §5.4](../../../product/PF-000-occurrences-and-record-entries/design.md#54-一件事什么时候产出不止一条条目) |
| N10 | **只增不改**：日志只追加；条目写下即不可变；「消息落盘之前」每条消息都经过，否决按产生者分三路（模型回复 → 当作调用失败；工具结果 → Run 失败） | [PF-012 会话日志](../../../product/PF-012-agent-loop-and-run/design.md#会话日志)、[消息落盘之前](../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前每条消息都经过它不只是输入)、[否决三路](../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)、[PF-000 记录条目](../../../product/PF-000-occurrences-and-record-entries/design.md#记录条目) |
| N11 | **语言无关**：数据契约用 JSON Schema 表达；不携带进程内对象，能跨进程原样传 | [SYS-SPEC](../../../foundation/cross-system-constraints/requirements.md#sys-spec)、[SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy) |
| N12 | **与 pi-ai 传输对接**：传输走 pi-ai 定向 fork | [D-019](../../decisions/model-provider-pi-ai-fork/decision.md)、[SYS-LLM](../../../foundation/cross-system-constraints/requirements.md#sys-llm) |
| N13 | **两个运行时各自可独立端到端测试**；工具运行时不依赖模型运行时就能产出 `ToolMessage` 与帧；测试不走 in-memory 存储 | 用户计划块 D；[D-026](../../decisions/infrastructure-persistence-choices/decision.md)（无 in-memory、会话日志一类落 JSONL） |

## 现有能力如何承载

设计链里**没有**消息或流的契约、节点或登记（`spec/` 与 `realization/` 里都没有）。「现有能力」只有三源的结构，
承载判定全部取自研究的[五档对照表][R§0]——「需改」是源里只缺字段，「不可承载」是源里**有一段机制在做条款禁止的事**。
minimal-runtime 是 DSH 的一份切片、未进 main，只作「fork 一步之后丢了什么」的对照，不作证据（[M1][M1]）。

| 性质 | DSH（`dsh-llm` + session 格式） | pi（`pi-ai` + `pi-agent-core`） | 三源都缺、或未确认的前提 |
|---|---|---|---|
| N1 | **需改**：三种角色 + `source.kind`；注入内容与工具结果都是 `role:'user'`；`plugin` 来源同时用于系统提示与注入；`ContextForm:'snapshot'` 定义为「后一份取代前一份」（[D1][D1]，[R§1][R§1]） | **需改**：四种角色，提醒与压缩摘要是 `pi-agent-core` 的应用层 `custom` 消息（[P1][P1]、[P10][P10]） | 三种自有消息三源都没有 |
| N2 | **需改**：六类块，缺语音；图与文件是附件引用，但依赖 `dsh-attachment`（[D2][D2]、[D12][D12]） | **需改 / 未覆盖**：无文件块、无语音；图 base64 内联，无附件身份；工具结果只能文本与图（[P2][P2]） | 语音块、视频按媒体类型归文件块 |
| N3 | **未覆盖**（块级）；事件级近似；块无身份，只能（消息 id，下标）寻址（[S3][S3]、[R§3][R§3]） | **未覆盖**（块级）；消息连 id 都没有（[P1][P1]、[P10][P10]） | 块级两标注；块身份与嵌套块寻址（研究张力③） |
| N4 | **不可承载**：图 → 文本是出门时每次重算的占位，对纯文本模型照发（[D3][D3]） | **不可承载**：同（[P11][P11]） | 块上的派生表示与 transcript |
| N5 | **需改**：`block-start` 只带块类型，无填法声明；delta 全为追加；三种可增长用途，无语音；任意块类型可开合（[D4][D4]） | **需改**：只对三种用途开合；无独立记账步骤；图与文件不在助手流里（[P3][P3]） | 填法声明、整体替换、语音增量 |
| N6 | **按 §5.5 九行计 5 可承载 / 3 需改 / 1 未覆盖 / 0 不可承载**；但「账只一次」「必有结局」**只由可选伴件 `llm-invariant` 强制**，装配器本身宽容：缺 finish 当 `stop`、usage 后写覆盖、以 `block-end` 为准且不校验与 delta 之和一致（[D5][D5]、[D6][D6]、[R§4][R§4]） | **2 / 4 / 2 / 1**；每个事件携带共享的实时 `partial: AssistantMessage`，**不是快照**；`pi-agent-core` 把它以完整消息类型推进上下文（[P3][P3]、[P7][P7]） | 「任意切分下组装相同」在三源都不是被检查的不变量 |
| N7 | **需改**：叫停时装配只留非空白文本与思考，工具调用不进消息；截断时丢掉全部工具调用（只在嵌入的流记录里留证）；参数保持原始串，但**经 pi 路由时是重新序列化的结果**；作者明确否决中断提醒（[D5][D5]、[D8][D8]、[D10][D10]） | **不可承载**：每个参数增量与收尾都做残缺解析并删除原始串；截断时合成错误结果回喂；中止/出错消息组装时整条跳过（[P4][P4]、[P6][P6]） | 半截调用 ✗✗ 留在消息里；首 token 判定（[transport 研究][TR-first]） |
| N8 | **未覆盖**：工具执行没有执行中往外说话的通道（[D9][D9]） | **需改**：`pi-agent-core` 的 `onUpdate` 交整份部分结果，瞬态、不落盘、不走助手流语法；监听者被逐个 `await`，其失败会传回工具结算（**代码阅读推断**）（[P9][P9]） | 帧 → `ToolInternalMessage` 这一环三源都没有（[R§6][R§6]） |
| N9 | **不可承载**：每次模型尝试的结算里嵌整条带时间戳的紧凑流，作者明确否决过「只存装配后的消息」（[S2][S2]） | **可承载**：条目在消息收尾时写；帧编码注明终止结算另存（[P7][P7]、[P8][P8]） | —— |
| N10 | **可承载**：seq 连续的只增事件流，消息只占四类（[R§7][R§7]）；背三条迁移、v1→v2 重写全部 seq（[S5][S5]） | **可承载**（harness 地位待核）（[P10][P10]） | —— |
| N11 | **需改**：类型文件扩展 Cordis `Events` 与 Typert 错误表；是 TS 类型，不是 JSON Schema（[D12][D12]） | **需改**：TS 类型；块里嵌供应商专属字段；`partial` 是进程内共享引用；0.86.0 在 minor 版本里改了 `ToolCall.arguments` 的类型（[P2][P2]、[transport 研究][TR-diff]） | 两源都不是语言无关数据契约 |
| N12 | DSH 经 `dsh-llm-pi-ai` 调 pi 时，`block-end` 参数被重新序列化（[D10][D10]） | 本身即传输；无结构化 HTTP 状态码（[transport 研究][TR-status]） | pi 的 `toolcall_delta.delta` 是否恰为原始片段，**未核**（见[证据义务](#证据义务与受阻消费)） |
| N13 | 纯零件在 `dsh-llm`（装配器、紧凑流），结算住在 `agent-loop`、派生住在 `dsh-session`，脚本化输入要经 Cordis 的 `LlmRuntime`（[D11][D11]、[R§8][R§8]） | 纯归约与假 provider 都在 `pi-ai`，链在 `pi-agent-core` 的 loop 里闭合，中间经过「半条消息进上下文」（[P12][P12]） | 三源都没有「事件序列 → 落盘消息 → 两份组装」的单体夹具，也都没有「帧 → 那条消息」 |

**读这张表的要点**：DSH 在到达语法与落盘的「只增」上最接近，在数据层与装配器上**要改的恰好是它有意做成相反的几处**
（半截调用的处置、宽容的装配、嵌流的结算、否决中断提醒）；pi 在落盘「只存成品」上一致，在参数解析、半条消息、
组装跳过中断消息上**机制相反**；三源都没有块级标注、派生属性、语音、整体替换与帧轨。

## 剩余责任与能力演化

下表是**无论选哪个起点都要自己写**的部分，以及它归哪一层。候选之间的差别只落在其余部分。

| 剩余问题 | 关系 | 归属理由与消费者影响 |
|---|---|---|
| 七种消息的判别、来源属性、「被中断」标记、消息身份 | **新增**（数据契约） | N1 要求「看类型就答得出」；DSH 的 role + `source.kind` 分类轴与 PF 不同，改它等于重立判别式 |
| 块级两标注；块的身份与嵌套块（工具结果里的块）的寻址与标注 | **新增**（数据契约） | N3 与 PF-010 点名名单的前提；研究张力③明言属技术设计。**本包不定方案** |
| 派生表示与 transcript 两个块属性；「派生表示不能是文件块」 | **新增**（数据契约） | N4；由「消息落盘之前」的转换件写入，装配器与传输都不碰 |
| 语音块、语音增量；文件块的媒体类型决定模态 | **新增**（数据契约 + 到达语法） | N2、N5；三源都没有 |
| 开块时的填法声明、整体替换这一种填 | **新增**（到达语法） | N5；模型回复用不上，为工具帧留（[PF-009 §7](../../../product/PF-009-context-message-types/design.md#七取舍) 最后一行） |
| 「账只一次」「必有结局」「增量只落在已开的同类块上」「收尾之后无增量」「封口交出的块 = 该块所有填的结果」 | **写成语法条款**，不做可选伴件 | N6。DSH 把前四条放在可选伴件里，minimal-runtime 的切片正好丢了它（[M1][M1]）——**性质只活在一个可选组件里，fork 一步就没了** |
| 任意切分不变（§6.8）与**相邻合并不变** | **新增**（语法条款 + 性质测试） | 合并不变是 N8「节流只可合并」的前提：合并相邻的同块增量必须得出同一个装配结果，节流才不改日志。**本包当前的装配选择**是节流放在装配之后的实时投递那一路、装配器见到每一个增量；这是选择不是性质推论——若节流放在装配之前，须由合并不变加语法检查与首 token 观察一并保全来证明等价（[评审](review.md#发现与处置)） |
| 流断的三种收场（叫停、出错、截断）与半截调用 ✗✗ | **新增**（装配器） | N7；三源的处置互不相同且都不同于 PF-009（[R§5][R§5]） |
| 工具帧违反语法时怎么办 | **新增**（装配器 + 工具运行时契约） | 模型那一侧违反语法 = 这次尝试失败；**工具那一侧不能这样做**（§6.17 发帧失败不影响执行），又不许默默丢（§6.16）。**两侧同一套语法、违反时的后果不同**，契约要写明；产品正文只给了两条规则，没有给这一情形的结果——见[交接缺口](#交接缺口) |
| 首 token 的可识别性 | **新增**（到达语法须能让它被识别） | N7；判定与耐久记录归模型请求运行时。研究发现 minimal-runtime 只看文本与思考增量、pi 的 `start` 在任何内容之前（[transport 研究][TR-first]）——两种误判方向都有 |
| 尝试的账里「已交付的内容」 | **复用**（数据契约的块形状）；**账本身归 PF-012 与模型请求运行时** | rev 5 的 §5.6；只放块，不放增量与时间 |
| pi-ai 事件 → 本项目到达语法 | **新增**（传输适配，归模型请求运行时一块） | N12。要做：原始参数串从增量拼（或 fork 保留原串）、丢弃 `partial` 快照、从最终消息取用量发一次记账、无终止事件时补一个出错收尾、状态码从注入的 `fetch` 取 |
| 七种 → 各家四种角色的出门映射；派生表示与 transcript 的取用 | **不在这三层**：归 [PF-010](../../../product/PF-010-context-management-and-assembly/README.md) 组装与各家 adapter | 数据契约只需把判别、标注与派生属性都带着 |
| 中断提醒（§6.13） | **不在这三层**：数据契约只提供 `SystemReminderMessage` 类型；何时补归 agent loop | DSH 作者否决它是 loop 层的选择（[D8][D8]），不影响本包的起点选择 |

**本包不提出新的能力维度。**三层都是共用契约与纯计算，不拥有任何领域事实；它们落在哪个包、叫什么名字，
见下一节的草图，**不是本包的选择对象**。

## 取舍入口

四个候选、逐层可分性与推荐见 [alternatives.md](alternatives.md)。**推荐 D 不是接受。**

## 契约、动作链与 Cordis 投影

以下是**推荐 D 成立时**的草图，用来检验 N13 能否兑现；契约名、包名都是占位，由起草与拍板决定。

- **契约**：一份 `data.*` 数据契约写消息与块（N1–N4，JSON Schema）；一份写到达增量与语法条款（N5、N6），
  **封口那一步交出的块直接引用前一份的块 schema**，所以语法层不另有一套块定义。
  语法条款附一份**语言无关的一致性用例集**：合法与非法的增量序列（JSON），各自的预期装配结果或预期违反项。
  **这份用例集就是两个运行时独立测试的共同判据。**是否另写 TLA+ 由规格起草按[组合性质](../../../../agents/skills/harness-design-handbook/canonical/references/architecture/assurance/composability.md)判定——
  语法是单条流上的顺序状态机，不涉并发装卸，**初判不触发**。
- **装配器与语法校验**：纯计算，**不是 Cordis 服务、不开 fiber**（手册「纯数据或纯计算不必制造 Fiber」）。
  它兑现 `data.*` 契约且被两个领域消费，按[两层布局](../../../realization/README.md#packages-的两层布局)归 `packages/core/`。
- **依赖方向**：模型请求运行时 → core；工具运行时 → core；传输适配（pi-ai fork 之上）→ core。**两个运行时之间没有依赖。**
  这是 N13「工具运行时不依赖模型运行时」的兑现点——装配器若留在一个 LLM 包里（DSH 的 `BlockAssembler` 就在 `dsh-llm`），这条边就会出现。
- **两条链的独立端到端测试**：
  - 模型侧：pi-ai 假 provider（[P12][P12]）→ 传输适配 → 语法校验 → 装配器 → 「消息落盘之前」→ 真实 JSONL 会话日志（临时目录）→ 两侧组装。
  - 工具侧：一个测试工具按语法发帧 → 装配器 → `ToolInternalMessage`；工具结果 → `ToolMessage` → 同一个日志。**全程不装载模型请求运行时。**
  - 两条都用真实存储提供者，不写 in-memory 替身（D-026）。追加端口与「消息落盘之前」的形状归 PF-012 一侧的契约，本包只要求它是可单独调用的接缝。
- **实时投递**（把在途增量送到人眼前、节流、断线续传）**不在本包**：它是投递面，minimal-runtime 的 message-stream 是一个样本（[M3][M3]）。本包只给它一条前提：节流在装配之后、只合并。

## 证据义务与受阻消费

| 依赖的性质与前提 | 保护者/环境责任 | 所需证据与当前结果 | 闭合条件、负责产物及受影响选择 |
|---|---|---|---|
| pi 的 `toolcall_delta.delta` 是模型给出的原始参数片段，拼起来就是原始串 | 传输适配 | **未核**。只知道 pi 在每个增量上解析、收尾时删原串（[P4][P4]）；`delta` 字段本身是否未经加工，研究没有逐行确认 | 读 `openai-completions` 的 delta 构造处或用假 provider 喂一段残缺 JSON 比对。**成立**：适配层自己拼，不必动 pi；**不成立**：fork 补丁保留原串。不改变任何候选的排序，改变 D-019 fork 的补丁范围 |
| pi 缺终止事件时等待方挂起（[P5][P5]） | —— | **代码阅读推断，未探针** | 只影响 B 与「直接用 pi 的流类型做语法」的做法；D 的适配层无论如何都要为「无终止事件」补一个出错收尾（DSH 的 pi 路由也这么做，[D10][D10]） |
| pi 更新监听者抛错会拖垮工具结算（[P9][P9]） | —— | **代码阅读推断，未探针** | 只在借用 `pi-agent-core` 的 `onUpdate` 作帧通道时才要闭合（候选 B）；A、C、D 都不经过它 |
| 装配结果在任意切分与相邻合并下不变 | 装配器 | **三源都没有可继承的测试**（[D11][D11]、[P8][P8]） | 装配器交付时带性质测试；一致性用例集含切分与合并两类 |
| DSH 装配器在「delta 之和 ≠ block-end」时的后果 | —— | 未探针（研究「未知」第一行） | **只影响候选 A**（fork `BlockAssembler`）；D 自写装配器并把「相等」写成语法条款，不依赖 DSH 的行为 |
| DSH `llm-invariant` 在发行装配里默认挂不挂 | —— | 未核 | 同上，只影响 A；D 把这些检查升格为条款，不再依赖挂载 |
| pi 0.85.1 与 0.86.1 的流事件差异 | 传输适配 | 部分核对：破坏性变更落在 provider 面的 `Context` 与 `ToolCall.arguments` 类型上，公开 `streamSimple` 入口推断不受直接影响（[transport 研究][TR-diff]） | 影响传输适配的钉版；**对 B 是反例**：落盘格式若跟随 pi 类型，这一次 minor 升级就要迁移只增不改的日志 |

## 交接缺口

本包不裁下列事项，只写明归谁、为什么挡着谁：

| 缺口 | 归谁 | 挡着什么 |
|---|---|---|
| **语音增量、以及模型输出图或文件这类「开口整交」的块，算不算首 token** | PF-013 owner（产品正文 [§5.4](../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) 只列了文本、思考、工具调用参数） | 模型请求运行时的重发判定；到达语法只需让「第一个内容步骤」可识别，不必等裁决 |
| **工具帧那条流的「记一次账」记什么**：模型回复记用量，工具执行没有用量 | 技术设计先提方案；若涉及「用户看得到的成本」再回 PF-006 / PF-009 | 语法条款写「至多一次」还是「恰好一次」 |
| **工具帧违反语法时的结果**（见上表） | 工具运行时契约起草时提方案；依据 §6.16、§6.17 | 工具侧装配器的失败集合 |
| **块身份与嵌套块寻址** | 数据契约起草 | PF-010 压缩名单能否落地 |
| **供应商回放数据**（思考签名这类，重发时要原样带回）放在块上还是收尾步骤上 | 数据契约起草 | DSH 放 `ReplayEnvelope`、随收尾步骤走（[D4][D4]、[D2][D2]），pi 放块上且带供应商专属字段（[P2][P2]）；两种都与 N11 的供应商中立有张力 |
| **首 token 的耐久记录**：崩溃恢复要知道「首 token 出没出来」，而瞬态条目不得独撑恢复路径（[PF-000 K3](../../../product/PF-000-occurrences-and-record-entries/design.md#63-k3瞬态条目不得独撑任何一条恢复路径)）；§9.2 又不留到达过程——两者相容的前提是「已开口」是**一条事实**而不是增量本身 | 模型请求运行时（块 B）与 PF-012 尝试的账 | 不挡本包；本包只要求语法能让那一刻被识别。DSH 的结算前**没有**任何持久证据（[S2][S2]），这一条三源都没有可借 |
| PF-009 rev 5、PF-013 rev 5/6 仍待产品负责人确认 | 产品负责人 | 见[输入基线的一处漂移](#输入基线的一处漂移)；起点选择不受影响 |

评审处置见 [review.md](review.md)；实际决定与下游入口从 [README](README.md) 导航。

[R§0]: ../../../../research/message-model-and-stream-sources/reports/2026-09-23-message-and-stream-mapping.md#0-判定口径
[R§1]: ../../../../research/message-model-and-stream-sources/reports/2026-09-23-message-and-stream-mapping.md#1-消息类型问题一上半
[R§3]: ../../../../research/message-model-and-stream-sources/reports/2026-09-23-message-and-stream-mapping.md#3-块上的属性与身份
[R§4]: ../../../../research/message-model-and-stream-sources/reports/2026-09-23-message-and-stream-mapping.md#4-流事件语法问题二
[R§5]: ../../../../research/message-model-and-stream-sources/reports/2026-09-23-message-and-stream-mapping.md#5-流断在半路问题三
[R§6]: ../../../../research/message-model-and-stream-sources/reports/2026-09-23-message-and-stream-mapping.md#6-工具执行帧问题四
[R§7]: ../../../../research/message-model-and-stream-sources/reports/2026-09-23-message-and-stream-mapping.md#7-落盘与投影问题五
[R§8]: ../../../../research/message-model-and-stream-sources/reports/2026-09-23-message-and-stream-mapping.md#8-脱离-loop-的可测性问题六
[R§11]: ../../../../research/message-model-and-stream-sources/reports/2026-09-23-message-and-stream-mapping.md#11-产品正文里读出的张力与缺口只报告不裁决
[D1]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d1-消息一个带身份的不可变值角色只有三种
[D2]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d2-内容块六类合并可扩展
[D3]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d3-图不能给纯文本模型在出门那一刻处理不落盘
[D4]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d4-流协议streamchunk-七种块索引关联
[D5]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d5-装配器是宽容的语法由一个可选的不变量伴件把关
[D6]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d6-失败统一成终止-chunk
[D8]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d8-这些零件在-agent-loop-里被接成一次尝试一份结算
[D9]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d9-工具执行没有执行中往外说话的通道
[D10]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d10-调-pi-ai-的那条路由会把原始参数串换成重新序列化的结果
[D11]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d11-可测零件
[D12]: ../../../../research/message-model-and-stream-sources/notes/dsh-llm.md#d12-与宿主的耦合
[S2]: ../../../../research/message-model-and-stream-sources/notes/dsh-session-format.md#s2-一次模型尝试一份结算结算里嵌着整条紧凑流
[S3]: ../../../../research/message-model-and-stream-sources/notes/dsh-session-format.md#s3-压缩是区间替换不是逐块点名
[S5]: ../../../../research/message-model-and-stream-sources/notes/dsh-session-format.md#s5-格式版本与迁移链
[P1]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p1-四种消息没有消息身份
[P2]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p2-内容块文本思考图工具调用
[P3]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p3-流事件每块-startdeltaend终止是-done-或-error
[P4]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p4-工具参数流中每一次-delta-都解析收尾时残缺也解析
[P5]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p5-流的结局靠实现自觉事件流类不强制
[P6]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p6-中止与出错部分内容留在消息里但组装时整条跳过
[P7]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p7-半条消息以完整消息的类型存在于上下文数组里
[P8]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p8-可回放的帧编码终止结算不在帧里
[P9]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p9-工具执行中的更新整份部分结果瞬态不落盘
[P10]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p10-应用层自定义消息与会话条目
[P11]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p11-图给不能看图的模型出门时换占位
[P12]: ../../../../research/message-model-and-stream-sources/notes/pi-ai.md#p12-可测零件
[M1]: ../../../../research/message-model-and-stream-sources/notes/minimal-runtime.md#m1-omne-harness-litellm-是-dsh-dsh-llm-的纯零件切片
[M3]: ../../../../research/message-model-and-stream-sources/notes/minimal-runtime.md#m3-sessionmessage-stream-是投递面不是消息模型
[TR-first]: ../../../../research/model-request-transport-sources/research.md#pf-013-的单独中断这一次调用在-minimal-runtime-host-上有逐-attempt-的落点首-token-前可重发之后不重发没有
[TR-status]: ../../../../research/model-request-transport-sources/research.md#pi-ai-的结果不带结构化-http-状态码错误文本里原样含上游响应体
[TR-diff]: ../../../../research/model-request-transport-sources/research.md#0851-到-0861-的破坏性变更落在-provider-面的-context-形状上经公开-streamsimple-入口传-context-的调用方不受直接影响
