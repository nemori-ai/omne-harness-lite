# 架构内核 PF

**哪些 PF 是动一下就要动整个架构的，哪些不是——本文件回答。**

它不重复[清单](README.md#当前-topic)（那里有全部 topic 的状态与 rev），
只回答一件事：**你手上这个 PF，改它的半径有多大。**

> **本文件拥有一份清单**：哪些 topic 覆盖[架构内核](../ubiquitous_language/terms/architecture-core-and-extension.md#ul-architecture-core--架构内核--architecture-core)。
> **词条引用这份清单，而不是写死编号**——[产品负责人的原话](../ubiquitous_language/decisions.md#ul-d-2--架构内核--2026-09-20)是
> 「未来可能会拓展其他 PF 归到这一类里面」。**往下面那张表加一行，那个 PF 就进了架构内核。**

## 什么是架构内核 PF

**「架构内核」是系统里的一部分，「架构内核 PF」是描述它的那些设计材料。**
前者的定义在[词表](../ubiquitous_language/terms/architecture-core-and-extension.md#ul-architecture-core--架构内核--architecture-core)，
**这里不重复**；本文件只说后者：

> **架构内核 PF**：**覆盖架构内核的那些产品设计 topic**，就是下表登记的这些。
> 它们共同定出**概念、边界、协议、契约、接口**；其余 PF 不再立这些，
> 而是**消费**它们，在其上做实现与扩展。

判据一句话，**与词条同一条**：

| 这个 PF 在做什么 | 它在哪 |
|---|---|
| **立规矩**——定义一类概念、划一条边界、规定别人必须遵守的协议 | 架构内核内 |
| **用规矩**——在已立的概念与协议上实现一块具体能力 | 架构内核外 |

> **与 Cordis 的「内核层」不是一回事**，那是我们复用的上游技术底座。
> **差别归[词条的「别混 ①」](../ubiquitous_language/terms/architecture-core-and-extension.md#ul-architecture-core--架构内核--architecture-core)**，
> 这里不写第二遍。本文件里**「内核」永远带限定**，不裸用。

## 清单

| 编号 | 它在架构里立了什么 | 状态 |
|---|---|---|
| [PF-000 发生的事与记录条目](PF-000-occurrences-and-record-entries/README.md) | **哪些事必须被记下、记下来那条算什么**——后面每个 topic 共用的那一层 | rev 1 |
| [PF-001 身份、范围与对 Agent 的约束](PF-001-identity-scope-and-agent-constraints/README.md) | **谁是谁、范围怎么划**；一个人在不同组织下的身份如何约束 agent 的组装与行动 | rev 22 |
| [PF-002 设置、权限与资产的展开](PF-002-assets-settings-and-permissions/README.md) | 设置、权限、资产作为**范围化对象**的样子——挂在哪一层、多层同时有值时怎么合成、**工作区那一级**、**设置项分四类** | rev 24 |
| [PF-003 资产的复制与分享](PF-003-asset-transfer-and-sharing/README.md) | 资产**怎么进到组织里**，所有权与使用权怎么在主体之间流动 | rev 6 |
| [PF-004 Agent 定义与装配](PF-004-agent-definition-and-assembly/README.md) | **定义、装配、装配清单**三者的关系、**两类 agent**，以及注入进来的是什么 | rev 13 |
| [PF-005 执行环境与沙箱](PF-005-execution-environments-and-sandboxes/README.md) | 动作**实际落到哪里**，隔离边界在哪，**作用准不准落在宿主机上** | rev 7 |
| [PF-006 工具与技能](PF-006-tools-and-skills/README.md) | agent **能做什么**——工具与技能的常驻、装载与占位 | rev 20 |
| [PF-007 Meta Capabilities](PF-007-meta-capabilities/README.md) | 系统**自带、关不掉的那几扇门**：agent 怎么问人、怎么看见自己、**一次放行怎么算** | rev 19 |
| [PF-008 Human in the Loop](PF-008-human-in-the-loop/README.md) | 人**在哪里看到这些问题、怎么答、答完怎么回去** | rev 7 |
| [PF-009 上下文消息类型](PF-009-context-message-types/README.md) | **一共有哪几种消息** | rev 8 |
| [PF-010 上下文管理与组装](PF-010-context-management-and-assembly/README.md) | 消息**怎么组装**成给模型看的那一份，装不下时怎么办 | rev 6 |
| [PF-011 非常态的分层处置](PF-011-off-nominal-handling/README.md) | 事情没按正常走的时候，**谁接手、接不住了往哪交** | rev 4 |
| [PF-012 Agent Loop 与 Run](PF-012-agent-loop-and-run/README.md) | 一次运行**怎么走完**，停机之后又怎么接着走；**只看日志怎么判断该不该起一副协程**；**agent runtime 与取消怎么传播** | rev 15 |
| [PF-013 模型档案、调用与切换](PF-013-model-profiles-and-invocation/README.md) | 我们能调哪些模型 · 把请求发出去 · 这一层失败了能做什么 · 什么时候算试尽 · 用户怎么换 | rev 13 |
| [PF-014 输入的受理与排队](PF-014-inbound-intake-and-queueing/README.md) | 外面进来的事怎么被收下、排队、什么时候被取走；**控制指令的受理** | rev 8 |
| [PF-015 会话的生命周期与归属](PF-015-session-lifecycle-and-ownership/README.md) | 会话怎么建、**活成什么样、什么时候被归档**、会话与会话之间是什么关系、**会话带着哪些 runtime context**、**运行模式**、**存储要守住什么** | rev 13 |

**十六个全部有正文了。**
**PF-015 同样属于架构内核**——它立的是别人赖以成立的前提：
**「这段协作到此为止」这个事实，此前没有名字**，
[而两条已接受的规则正吊在它上面](README.md#已排定尚未开题的编号)。
rev 1 把那个名字定为[归档](PF-015-session-lifecycle-and-ownership/design.md#会话归档)。

> **五块大纲现已全部有落点**：工具权限那条腿由
> [PF-007 §5.6](PF-007-meta-capabilities/design.md#56-一次放行判断走四步) 接住
> （执行环境权限归 [PF-005](PF-005-execution-environments-and-sandboxes/README.md)）。
> 它的接受范围见 [D-074](../record/decisions/session-workspace-product-acceptance/decision.md)，改动半径以[本 rev 覆盖到哪](PF-015-session-lifecycle-and-ownership/README.md#本-rev-覆盖到哪)为准。

## 改一个架构内核 PF 意味着什么

**不是不能改。**这些正文本来就在演进，内核里几份已经改过很多轮。
写这一节是为了让你在动手前知道**半径**。

### 代价在哪

| 改的是什么 | 会波及到 |
|---|---|
| **一个概念的含义** | 所有引用它的 PF——它们的规则建立在旧含义上，可能不再成立 |
| **一条边界** | 骑在边界两侧的 PF 要重新划分地盘，可能触发 topic 的拆分或合并 |
| **一条别人必须遵守的协议** | 内核外每一个消费它的 PF，以及已经据此做出的规格与实现 |

架构内核 PF **彼此咬合**：PF-002 建立在 PF-001 的范围之上，PF-003 建立在 PF-002 的资产之上，
PF-004 用 PF-002 的定义、PF-003 的流动，PF-005 又接 PF-004 装配与注入留下的那几样……
**动其中一个，链条上的都要复核。**每个 topic 的 `README.md` front-matter 里的
`depends-on` 就是这条链——它是机器可读的，**顺着它能算出半径**。

### 动手之前先回答三个问题

1. **谁依赖我改的这一条？**顺 `depends-on` 反查，列出来。列不出来就别改。
2. **哪些已接受的结论会松动？**受影响 PF 的 `decisions.md` 里，有没有拍板记录是建立在旧说法上的。
3. **这是真的要改架构，还是我在用错地方解决问题？**很多时候答案是后者——
   要加的那块内容其实属于内核外的一个新 PF，**不需要动内核**。

三个都答完还是要改，那就改——**记 changelog、递增 rev，并在受影响的 PF 里逐个复核**。
[改动怎么记归 AGENTS.md](AGENTS.md#改动怎么记)。

### 不该做的两件事

- **不要为了避免动内核，在内核外偷偷重新定义一个概念。**那会造出同名不同义，
  比正面改内核贵得多——它不会报错，但会让两拨人拿着同一个词讨论不同的东西。
- **不要因为「它是内核」就不敢提问题。**发现内核正文有洞或自相矛盾，
  [按红线报给产品负责人](AGENTS.md#红线)，别顺手改也别绕过去。

## 内核之外的 PF

从 **PF-016** 起（以及任何将来新建的编号），默认在内核之外。它们：

- **消费**架构内核立下的概念、边界与协议，**不重新定义**；
- 要用某个概念时[引用词表里的那个词](../ubiquitous_language/index.md)，在 front-matter 里
  声明 `depends-on`；
- 改动它们**不波及内核**——半径只到它自己的消费者。

**新建一个 PF 时怎么判断自己在内核内还是外？**回到上面那条判据：
**你是在立规矩，还是在用规矩？**如果发现自己不得不新立一条别人必须遵守的协议，
**那说明这块内容要么属于某个已有的架构内核 PF，要么这条界线该重新划**——
后者是产品负责人的裁决，不是你能自己定的。

## 这条界线是谁划的

**2026-09-20，产品负责人裁决**，分两次给：先划范围，再定词。
**两段原话、六条裁决与 PM 起草定义时的推理链，全部记在
[UL-D-2](../ubiquitous_language/decisions.md#ul-d-2--架构内核--2026-09-20)**——
那里是这件事的依据所在，**本文件不复制**。

**裁决定的是：范围（当时的 16 个）· 含义（立规矩 vs 用规矩）· 清单可增补 ·
立这个概念是为了让人知道代价，不是禁止改动。**

**本文件自己写的是：**每个 PF「在架构里立了什么」那一栏、波及分析、
动手前的三个自检问题、以及不该做的那两件事。**这些是 PM 的判断，可以被逐条核对与推翻。**

### 一条作废的推理，留在这里

**PM 起初判断「架构内核 PF」不该进统一语言**，理由是词表首句写明它收的是
「**这个系统里**」的概念，而这像是**对设计材料的分类**，论域不同。

**这条被产品负责人当场推翻**，而且推翻得对：
他定的所指是「**PF-000~PF-015 覆盖的那些设计所包含的对象、层、领域**」——
**那是系统里的东西，论域完全成立**。PM 当时盯着「那批 PF」，
没看出真正要命名的是**那批 PF 描述的那部分系统**。

**记在这里不是自责，是留证**：词表里现在这条[架构内核](../ubiquitous_language/terms/architecture-core-and-extension.md#ul-architecture-core--架构内核--architecture-core)
所指为何是「对象、层、领域」而不是「一批 PF」，
[别混 ②](../ubiquitous_language/terms/architecture-core-and-extension.md#ul-architecture-core--架构内核--architecture-core)
那句「PF 是设计材料，架构内核是它们描述的那部分系统」又是在挡什么——
**挡的就是上面这个错。**

返回[产品设计入口](README.md)。

## 日程与日历的接续

[PF-021 日程与日历](PF-021-schedule-and-calendar/README.md)（rev 8，已接受）位于内核之外，
消费已有会话、Run、装配与权限语义。其作业会话扩展通过产品引用衔接既有用途、受理和交付面，
不以此改变架构内核清单；具体范围见该包的边界与来源问题。
