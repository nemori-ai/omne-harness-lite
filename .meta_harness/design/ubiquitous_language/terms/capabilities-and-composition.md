# 能力与构成

**这一卷回答：agent 由什么构成，以及它因此能做什么。**

收在这里的是**被持有、被组装的那些东西**，以及它们之间的构成关系。
**这些东西怎么在主体之间流动**归[流转与授权](circulation-and-entitlement.md)，
**它们的值怎么被算出来**归[作用域与求值](scope-and-resolution.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

## 三样东西

### UL-asset · 资产 · Asset

> **中**：**约束 agent 由什么组装而成、从哪里被触达、以及推进时在哪些位置插手**的那一类对象。
> 它是三样东西里**唯一独立存在的对象**；
> [设置](#ul-setting--设置--setting)与[权限](#ul-permission--权限--permission)是它的**两种属性**。
> **恰有[八类](#八类资产)，这八类是穷尽的。**
>
> **EN**: The class of objects that **constrains what an agent is assembled from**,
> **through which channels it can be reached**, and **where things may be inserted as
> its loop advances**. It is the only one of the three that exists as an object in
> its own right; settings and permissions are two kinds of **attribute on** it.
> **There are exactly eight kinds, and the list is exhaustive.**

- **出处**：[PF-001 §4 设置、权限、资产](../../product/PF-001-identity-scope-and-agent-constraints/design.md#设置权限资产) · [资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)（rev 7）
- **别混**：知识、经验、报告、附件与文件**都不是资产**——它们是 agent **读写的对象**，**不参与组装**
- **注意**：判据是**它在 agent definition 里被声明、被持有、被授权、按层级求值**——**这四件事**，不是「它提供动作」

### UL-setting · 设置 · Setting

> **中**：[资产](#ul-asset--资产--asset)的一种属性，约束 agent **以什么配置、什么参数去做**。
> **资产定形状**（有哪些项、什么含义、取值域是什么），**持有它的各层配值**，
> 运行时按[覆盖](scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics)求值。
>
> **EN**: A kind of attribute on an asset, constraining **with what configuration and
> parameters** the agent acts. **The asset defines the shape** (which entries exist,
> what they mean, what values they admit), **each layer holding it supplies values**,
> and at run time they resolve by **override**.

- **出处**：[PF-001 §4 设置、权限、资产](../../product/PF-001-identity-scope-and-agent-constraints/design.md#设置权限资产) · [PF-002 §5.2](../../product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性)（rev 6 / rev 2）
- **注意**：配值的资格来自**持有**——**没有这个工具，就配不了它的执行权限**

### UL-permission · 权限 · Permission

> **中**：[资产](#ul-asset--资产--asset)的一种属性，约束 agent **能执行什么动作、边界在哪**。
> 每层给出的是一个**允许集合**，按[收窄](scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics)取各层交集；
> **高层是不可突破的边界，低层只能在界内进一步收紧**。
>
> **EN**: A kind of attribute on an asset, constraining **which actions the agent may
> perform and where the boundary lies**. Each layer supplies a **set of permitted
> values**, and the result is the **intersection** across layers: a higher layer sets
> an unbreakable boundary, a lower one may only tighten further within it.

- **出处**：[PF-001 §4 设置、权限、资产](../../product/PF-001-identity-scope-and-agent-constraints/design.md#设置权限资产) · [§6.2](../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)（rev 6）
- **别混**：**不是[租户角色](subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role)**——角色是**身份**的属性，权限是**资产**的属性
- **注意**：**权限变了，[动作空间](#ul-action-space--动作空间--action-space)不变**

## 八类资产

### UL-skill · 技能 · Skill

> **中**：**一段可复用的工作方法**——告诉 agent「遇到这类事情该怎么做」。
> 主体是**可读的指引正文**，可以带上所需的资源文件。
> **读取一个 skill 不等于运行它带的脚本**，也不自动装载它的全部附件。
>
> **EN**: **A reusable way of working** — telling the agent how to handle a class of
> situations. Its substance is **readable guidance text**, optionally accompanied by
> resource files. **Reading a skill is not running the scripts it carries**, nor does
> it automatically load all of its attachments.

- **出处**：[PF-002 §4 Skill](../../product/PF-002-assets-settings-and-permissions/design.md#skill)（rev 2）
- **别混**：Skill 说**怎么做**，[Tool](#ul-tool--工具--tool) 是**做的那个动作**。「代码审查该看哪些地方」是 skill，「读文件」是 tool
- **能组合**：Tool

### UL-tool · 工具 · Tool

> **中**：**一个可被调用的动作。**两半缺一不可：**调用定义**（叫什么、收什么参数、返回什么）
> 与**适配当前环境的实现**——**只有一份没法执行的定义，不算可用**。
> 一个 tool 可以是**多命令**的，而**整套命令在组装时只占一个[槽位](#ul-prompt-slot--提示词槽位--prompt-slot)**。
>
> **EN**: **One invocable action.** Two halves, neither optional: an **invocation
> definition** (its name, the arguments it takes, what it returns) and **an
> implementation fitted to the current environment** — **a definition with nothing
> that can run it does not count as available**. A tool may be **multi-command**, and
> **the whole command set occupies a single slot** at assembly time.

- **出处**：[PF-002 §4 Tool](../../product/PF-002-assets-settings-and-permissions/design.md#tool)（rev 2）
- **别混**：**子命令是 tool 的内部结构，不是独立资产**——随这个 tool 一起被持有、配置与授权
- **⚠️ 别混**：**「工具」这个词指三样东西，寿命各不相同**——
  [工具定义](execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition)（数据，长期）、
  动作空间里的那个条目（构成，绑 agent runtime）、
  [工具执行](execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)（计算资源，**绑会话**）。
  **本条说的是它作为一类资产**
- **注意**：本系统把 Tool 定为**顶层资产**，与前身 `omne-next` 把它归为「组件」**有意相反**
- **能组合**：Skill

### UL-mcp · MCP · MCP

> **中**：**一个外部工具来源的接入点。**接进来之后，它提供的动作可被 agent 使用。
> **接入点本身是资产，它带来的那些动作不单独成为资产**——随它一起被持有、授权与治理。
> **对端的可用性与版本不由本系统掌握**：它提供的动作可能今天有明天没有，**而这不是故障**。
>
> **EN**: **An access point to an external source of tools.** Once connected, the
> actions it offers become usable by the agent. **The access point is the asset; the
> actions it brings are not assets of their own** — they are held, authorized and
> governed along with it. **Availability and versioning on the far side lie outside
> this system's control**, so an action present today may be gone tomorrow — **and
> that is not a fault**.

- **出处**：[PF-001 §4 资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类) · [PF-002 §4 MCP](../../product/PF-002-assets-settings-and-permissions/design.md#mcp)（rev 6 / rev 2）
- **别混**：Tool 是**一个动作**，MCP 是**一批动作的来源**——**MCP 本身不可被调用**
- **能组合**：**不组合任何资产**

### UL-connector · 连接件 · Connector

> **中**：**一个外部消息来源的接入件**，把外部的消息送进来。
> **八类里只有它回答「agent 从哪里被触达」**——另外六类回答「agent 能做什么、怎么做」，
> [拓展件](#ul-loop-extension--拓展件--loop-extension)回答「推进的时候在哪些位置插手」。
> **只能送消息进来**——没有数据读取面，也没有管理面。
>
> **EN**: **An inbound attachment for an external message source**, delivering outside
> messages into the system. **Of the eight, only this one answers how the agent can
> be reached**: six answer what an agent can do and how, and a loop extension answers
> where to intervene as the agent proceeds. It can **only deliver messages inward** — it
> exposes no data-read surface and no management surface.

- **出处**：[PF-001 §4 资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类) · [PF-002 §4 Connector](../../product/PF-002-assets-settings-and-permissions/design.md#connector)（rev 7 / rev 3）
- **别混**：MCP 是**我出去调它**，Connector 是**它进来找我**
- **能组合**：**不组合任何资产**

### UL-loop-extension · 拓展件 · Loop Extension

> **中**：挂在某个 [Loop 拓展点](agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point)上的**一段判断或动作**。
> 它声明自己**挂在哪个位置**、**管哪些情形**，以及自己的**[干预力](../../product/PF-000-occurrences-and-record-entries/design.md#干预力--intervention-power)**——
> 只观察 / 可改写 / 可否决。
> **同一个位置可以挂多个拓展件，各干各的。**
>
> **EN**: **A piece of judgement or action** attached to one loop extension point. It
> declares **which position it sits at**, **which cases it covers**, and its own
> **intervention power** — observe, rewrite, or veto. **Several extensions may sit at
> the same position, each doing its own thing.**

- **出处**：[PF-002 §4 Loop Extension](../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension)（rev 3） ·
  [PF-012 §4 拓展件](../../product/PF-012-agent-loop-and-run/design.md#拓展件)（rev 3）
- **⚠️ 别混**：**它不是[拓展点](agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point)**——
  **拓展点是位置，拓展件是挂上去的东西**。位置由[状态点](../../product/PF-012-agent-loop-and-run/design.md#53-改日志的动作与纯派生的动作)推出、数目有限；**挂什么没有上限**
- **注意 ①**：**干预力是它的[权限](#ul-permission--权限--permission)，不是[设置](#ul-setting--设置--setting)**——
  **装一个拓展件、却只给它「只观察」，是成立的配法**
- **注意 ②**：**它只能靠改[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)起作用**，不能不留痕地改变下一步
- **能组合**：**不组合任何资产**（同 [MCP](#ul-mcp--mcp--mcp) 与[连接件](#ul-connector--连接件--connector)）

### UL-slash-command · 斜杠命令 · Slash Command

> **中**：**用户主动发起某件事的入口**，用户敲 `/什么` 触发。
> 它**绑定**要做的事（一个 skill、一段 prompt 或其他上下文）——
> **命令本身不是做事的东西，它是指路牌**。**不含键盘控制、shell 命令或系统命令。**
>
> **EN**: **An entry point through which a user initiates something**, triggered by
> typing `/something`. It **binds** to the thing to be done — a skill, a prompt, or
> other context. **The command is not the doing; it is a signpost.** It covers **no
> keyboard control, no shell commands and no system commands.**

- **出处**：[PF-002 §4 Slash Command](../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)（rev 2）
- **别混**：Skill 是方法本身，Slash Command 是**发起它的入口**。绑定是**多对多**——一个 skill 可以有多个入口，也可以完全没有
- **能组合**：Skill（绑定）

### UL-plugin · 插件 · Plugin

> **中**：**把若干资产打包在一起分发与启用的单元。**装一个 plugin，等于一次性获得
> 它里面的全部东西；停用它，那些东西一起退场。
> **内含成员不取得独立的顶层生命周期**——不能单独卸载 plugin 里的某一个 skill。
>
> **EN**: **A unit for distributing and enabling a bundle of assets together.**
> Installing one grants everything inside at once; disabling it withdraws them all.
> **Its members have no independent top-level lifecycle** — one cannot uninstall a
> single skill out of a plugin.

- **出处**：[PF-001 §4 资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类) · [PF-002 §4 Plugin](../../product/PF-002-assets-settings-and-permissions/design.md#plugin)（rev 7 / rev 3）
- **别混 ①**：**不是 Cordis plugin**——那是运行时的代码装载单元，属技术设计。指它时**必须写全 `Cordis plugin`**
- **别混 ②**：Plugin 组合出来的**还是资产**，可以继续被组合；[Agent Definition](#ul-agent-definition--agent-定义--agent-definition) 组合出来的是**一个能跑的 agent**
- **能组合**：Skill、Tool、Slash Command、MCP、Connector、[拓展件](#ul-loop-extension--拓展件--loop-extension)，以及 Rules 这类声明性成员

### UL-agent-definition · Agent 定义 · Agent Definition

> **中**：**一个 agent 的静态定义**——它由什么组装而成、以什么面貌工作。
> **它不是会话，也不是[agent runtime](agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime)**：
> 改定义**不会**改变已经在跑的那个 agent，一个定义可以同时有很多个 agent runtime，
> **定义与实例分别演进**。sub-agent 的定义**也属于这一类**。
>
> **EN**: **The static definition of an agent** — what it is assembled from and how it
> presents itself at work. **It is neither a session nor a running instance**:
> editing a definition **does not** change an agent already running, one definition
> may have many concurrent instances, and **definition and instance evolve
> separately**. A sub-agent's definition **is one of these too**.

- **出处**：[PF-001 §4 资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类) · [PF-002 §4 Agent Definition](../../product/PF-002-assets-settings-and-permissions/design.md#agent-definition)（rev 7 / rev 3）
- **注意**：混为一谈会出现「**我改了配置，正在跑的任务突然换了行为**」这种事故
- **能组合**：**全部八类**（含其他 Agent Definition 作为 sub-agent）——**它是唯一能组合全部八类的**

### UL-agent-type · agent 类型 · Agent Type

> **中**：**一份 [Agent 定义](#ul-agent-definition--agent-定义--agent-definition)具不具备
> master agent 的那一整套机制。****只有两个取值**：
> **`master`**——具备全套机制，[开一段会话](agent-runtime-loop.md#ul-session--会话--session)，用户挑的就是它；
> **`non-master`**——**不具备那套机制**的 agent。
> **后者由前者反过来定义**：这条线划的是**有没有那套机制**，
> **不是它在某次派发里扮演什么角色**。
> **它是定义自身的属性**，与那份定义某一次装配的结果无关。
>
> **EN**: **Whether an agent definition carries the full set of mechanisms a master agent
> has.** There are **exactly two values**: **`master`**, which has them and opens a session,
> and **`non-master`**, defined by **not** having them. The second is defined **in terms of
> the first on purpose**: the line is about **which mechanisms a definition carries**, not
> about **the role it plays in any one dispatch**. **It is a property of the definition
> itself**, independent of what any one assembly of it produces.

- **出处**：[PF-004 §4 agent 类型](../../product/PF-004-agent-definition-and-assembly/design.md#agent-类型) · [§6.8](../../product/PF-004-agent-definition-and-assembly/design.md#68-两类-agent谁能被谁自定义)（rev 6）
- **⚠️ 别混**：**`non-master` 不是[子 agent](interaction-and-dispatch.md#ul-subagent--子-agent--subagent)。**
  后者说的是**它在派发关系里的角色**（被 `spawn`/`delegate` 派出去的那个）。
  **一个是这份定义带着哪套机制，一个是此刻在扮演什么。**
  **取这个名正是为了让两者不撞**（[C-14](../conflicts.md)）
- **注意 ①**：**[master 必定是 official](../../product/PF-004-agent-definition-and-assembly/design.md#68-两类-agent谁能被谁自定义)**；
  **租户能自定义的只有 `non-master`**
- **注意 ②**：**它不决定这个 agent 能做什么**——[动作空间只由构成决定](#ul-action-space--动作空间--action-space)。
  **一个 `non-master` 照样可以装得很强**
- **⚠️ 注意 ③**：**「master 的那一整套机制」包含哪些，尚未定全**——
  目前只列得出开会话、带类目、只能官方提供三条
  （[PF-004 D-1](../../product/PF-004-agent-definition-and-assembly/decisions.md#三待裁决)）。
  **不要按「凡是 master 有的 `non-master` 都没有」去实现**

### UL-master-category · master 类目 · Master Category

> **中**：**一份 [master](#ul-agent-type--agent-类型--agent-type) 的定义，主要是用来干什么的。**
> 当前五类：`general-purpose` · `coding` · `office` · `research` · `personal-life`。
> **它只挂在 master 上**——`non-master` 不开协作，这项属性对它没有意义。
>
> **EN**: **What a master agent's definition is mainly for.** Currently five:
> `general-purpose`, `coding`, `office`, `research`, `personal-life`. **It hangs on masters
> only** — a non-master opens no collaboration, so the property means nothing for it.

- **出处**：[PF-004 §4 master 类目](../../product/PF-004-agent-definition-and-assembly/design.md#master-类目)（rev 6）
- **⚠️ 别混**：**它不是[会话类型](agent-runtime-loop.md#ul-session-type--会话类型--session-type)。**
  会话类型是**会话**的属性，**由它算出来**——
  [算，不是拷贝](../../product/PF-015-session-lifecycle-and-ownership/design.md#53-会话类型怎么算出来)。
  **映射改了，已存在的会话一个都不跟着变**
- **注意 ①**：**只能由产品出厂增补，租户加不了新的一类**——
  这是「[master 只能官方提供](#ul-agent-type--agent-类型--agent-type)」的推论，不是一条独立限制
- **注意 ②**：**五类不是封死的**，产品负责人明说「不限定死，未来可拓展」；
  **能拓展的是产品，不是租户**

## 构成关系

### UL-asset-composition · 资产组合 · Asset Composition

> **中**：资产之间、资产与 agent 之间、属性与资产之间的**同一种关系**，不是几种。
> 三条规则：**引用指向[能力标识](scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)**、
> **组合图不得成环**、**组合不转移[定义所有权](circulation-and-entitlement.md#ul-definition-ownership--定义所有权--definition-ownership)**。
>
> **EN**: **One and the same relation** holding between assets, between assets and an
> agent, and between attributes and assets — not several mechanisms. Three rules:
> **references point at capability identifiers**, **the composition graph must be
> acyclic**, and **composition transfers no definition ownership**.

- **出处**：[PF-002 §5.1](../../product/PF-002-assets-settings-and-permissions/design.md#51-组合是一种关系不是几种)（rev 2）
- **别混**：与[作用域合成语义](scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics)不是一回事——**裸写「组合」不作数**
- **注意**：这一节在 PF-002 里标着「**PM 推导，待产品负责人确认**」

### UL-agent-constitution · agent 构成 · Agent Constitution

> **中**：**一份[装配清单](agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest)里「它是什么」的那部分**——
> 动作空间、技能、需要哪几类执行环境、系统提示词的全部成分。**在装配时确定。**
> **构成变了就是另一个 agent**；与[运行时注入](agent-runtime-loop.md#ul-runtime-injection--运行时注入--runtime-injection)的分界是一句话：
> **这个变化改变的是「它是什么」，还是「它处在什么情况下」？**
>
> **EN**: **The part of an assembly manifest that says *what it is*** — its action
> space, its skills, which kinds of execution environment it needs, and every
> ingredient of its system prompt. **Fixed at assembly time.** **A change of
> constitution makes it a different agent.** The line against runtime injection is
> one question: **does this change alter *what it is*, or *what circumstances it is
> in*?**

- **出处**：[PF-004 §4 注入](../../product/PF-004-agent-definition-and-assembly/design.md#注入) · [§5.3](../../product/PF-004-agent-definition-and-assembly/design.md#53-三个时刻)（rev 5）
- **弃用的说法**：**「agent 构成 / Instance Constitution」**——
  2026-09-20 之前的名字，主语是已退役的「运行实例」，见 [UL-D-3](../decisions.md#ul-d-3--runtime-与活体--2026-09-20)
- **别混**：**它不是整份清单**——清单还记着为哪个会话求的、依据哪个定义版本、成本算谁的。
  **这一条只说其中「是什么」那一部分**，因为**那一部分才与注入对立**
- **注意**：构成变了**未必要重新装配**——改了 Agent Definition 是**下一次 run 重新装配**，
  运行中[增量装载](agent-runtime-loop.md#ul-incremental-loading--增量装载--incremental-loading)则**只在清单上追加一条**

### UL-action-space · 动作空间 · Action Space

> **中**：**这个[agent runtime](agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime)能发起哪些动作的集合。**
> 它**只由[agent 构成](#ul-agent-constitution--agent-构成--agent-constitution)决定**——
> 装上新工具就变大，移除工具就变小，而**权限变了它不变**。
> agent 照样能发起那个调用，只是这次被拒绝：它因此知道
> **「这件事存在，只是我现在不被允许」，而不是「这件事不存在」**。
>
> **EN**: **The set of actions a running instance can initiate.** Determined **by
> instance constitution alone** — it grows when a tool is loaded, shrinks when one is
> removed, and **does not change when permissions do**. The agent can still issue the
> call and simply be refused, so it knows **"this exists, I am merely not allowed
> right now"** rather than **"this does not exist"**.

- **出处**：[PF-004 §4 动作空间](../../product/PF-004-agent-definition-and-assembly/design.md#动作空间)（rev 3）
- **注意**：这条锁定的是**变化的唯一原因**，不是「永不改变」。它真正排除的只有一件事：**拿构成之外的东西去改动作空间**

### UL-meta-capability · meta 能力 · Meta Capability

> **中**：**一整类能力的统一入口。**它自己不是某一个动作，而是**通向一族动作的那扇门**——
> 「工具的工具、技能的技能」是最纯的两个例子。
> 全部 meta 能力合起来就是**一个 agent 的基本盘**：什么都不配的 agent 天生就有它们。
> **它必定[常驻](reach-and-availability.md#ul-residency--常驻--residency)，而且不可禁用、不可替换。**
>
> **EN**: **A single entry point to a whole class of capabilities.** It is not one
> action but **the door onto a family of them** — "the tool for tools, the skill for
> skills" being the purest two examples. Together they constitute **an agent's
> baseline**: an agent configured with nothing at all still has them. **They are
> necessarily resident, and can be neither disabled nor replaced.**

- **出处**：[PF-007 §4 meta](../../product/PF-007-meta-capabilities/design.md#meta) · [meta 与常驻的关系](../../product/PF-007-meta-capabilities/design.md#meta-与常驻的关系)（rev 6）
- **⚠️ 注意 ①**：**「不可禁用」说的是那扇门，不是门后的每一条命令。**
  [权限照常作用在命令这一级](../../product/PF-007-meta-capabilities/design.md#57-权限能关掉一条命令关不掉一扇门)——
  **一条命令可以被关掉，而那扇门关不掉**。
  典型：会话运行模式是 [`never`](agent-runtime-loop.md#ul-session-run-mode--会话运行模式--session-run-mode) 时，
  `Ask().request_approval` 不可用，**而 `Ask()` 还在**
- **注意 ②**：**「必定常驻」不是产品选择，是结构逼出来的**——
  **够到非常驻能力的唯一途径就是 meta**，若它自己也不常驻，就永远够不着它。
  **自指的闭环必须有一个不动点**
- **注意 ③**：**常驻不一定是 meta**——一个普通工具标了常驻，它只是占了个位置
- **注意 ④**：**关掉一扇门等于门后一整类能力凭空消失**，而 agent 会「不知道某件事存在」——
  那种失明无法解释也无法申诉。**收紧安全只能靠执行环境、权限与装配清单**
- **注意 ⑤**：**全部采用多命令范式**，因此[整套只占一个槽位](#ul-prompt-slot--提示词槽位--prompt-slot)；
  **没有这一条，meta 这件事在预算上就不成立**
- **别混**：**具体是哪几扇门（`Tools()` `Shell()` …）是它的实例，不是概念**——
  词表定义 meta 能力，**不为每一扇门各立一条**

### UL-prompt-slot · 提示词槽位 · Prompt Slot

> **中**：**agent 在系统提示词里直接看见的一个条目。**
> 标了[常驻](reach-and-availability.md#ul-residency--常驻--residency)的占一个，没标的不占；
> 此外有**一批恒定占槽位、且关不掉**的条目（PF-007 定义的 meta）。
> **多命令工具整套只占一个**，因此常驻预算的正确用法是
> **把钱花在入口上，不是花在具体动作上**。
>
> **EN**: **One entry the agent sees directly in the system prompt.** Whatever is
> marked resident takes one; whatever is not takes none. On top of these sit **a set
> that permanently occupy slots and cannot be switched off**. **A multi-command tool
> takes a single slot for its whole command set**, so the right way to spend a
> resident budget is **on entry points, not on individual actions**.

- **出处**：[PF-006 §4 槽位](../../product/PF-006-tools-and-skills/design.md#槽位) · [PF-007 §5.4](../../product/PF-007-meta-capabilities/design.md#54-十三个槽位是预算的地板也是它的天花板意义)（rev 7 / rev 6）
- **别混**：**裸写「槽位」不作数**——它专指系统提示词里的那种占位
- **注意**：**不占槽位不等于不在[动作空间](#ul-action-space--动作空间--action-space)里**——见[三层正交](reach-and-availability.md#三层正交这是本卷的地基)

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
