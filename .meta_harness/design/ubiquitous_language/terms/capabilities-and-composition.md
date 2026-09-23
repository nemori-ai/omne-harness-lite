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

- **形态**：对象
- **出处**：[PF-001 §4 设置、权限、资产](../../product/PF-001-identity-scope-and-agent-constraints/design.md#设置权限资产)（rev 15） · [资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)（rev 15）
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

- **形态**：属性
- **出处**：[PF-001 §4 设置、权限、资产](../../product/PF-001-identity-scope-and-agent-constraints/design.md#设置权限资产)（rev 15） · [PF-002 §5.2](../../product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性)（rev 10）
- **注意 ①**：配值的资格来自**持有**——**没有这个工具，就配不了它的执行权限**。
  配下的那一格叫[属性配值](scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)，
  **挂在那份持有上**
- **注意 ②**：**配值的不只组织与租户**——[工作区](scope-and-resolution.md#ul-workspace--工作区--workspace)那一级也配得了，
  且[它配的值压过租户](../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)，
  **除非上层加了 `immutable`**
- **注意 ③**：[禁用](circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)是一项**特殊的布尔设置**——
  **任一层为真即为真**，那等价于「覆盖 ＋ 真即 `immutable`」

### UL-permission · 权限 · Permission

> **中**：[资产](#ul-asset--资产--asset)的一种属性，约束 agent **能执行什么动作、边界在哪**。
> 每层给出的是一个**允许集合**，按[收窄](scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics)取各层交集；
> **高层是不可突破的边界，低层只能在界内进一步收紧**。
>
> **EN**: A kind of attribute on an asset, constraining **which actions the agent may
> perform and where the boundary lies**. Each layer supplies a **set of permitted
> values**, and the result is the **intersection** across layers: a higher layer sets
> an unbreakable boundary, a lower one may only tighten further within it.

- **形态**：属性
- **出处**：[PF-001 §4 设置、权限、资产](../../product/PF-001-identity-scope-and-agent-constraints/design.md#设置权限资产)（rev 15） · [§6.2](../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)（rev 15）
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

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-002 §4 Skill](../../product/PF-002-assets-settings-and-permissions/design.md#skill)（rev 10）
- **别混**：Skill 说**怎么做**，[Tool](#ul-tool--工具--tool) 是**做的那个动作**。「代码审查该看哪些地方」是 skill，「读文件」是 tool
- **能组合**：Tool

### UL-tool · 工具 · Tool

> **中**：**一个可被调用的动作。**它的身份是**这一类里的那个 name**；参数形状、说明、返回形状
> 与实现都跟着实现走，**所以同一个 name 下可以有平台、组织、租户各自的一份，彼此替代**。
> 一个 tool 可以是**多命令**的，而**整套命令在组装时只占一个[槽位](#ul-prompt-slot--提示词槽位--prompt-slot)**。
>
> **EN**: **One invocable action.** Its identity is **its name within this kind**; the argument
> shape, description, result shape and implementation all travel with the implementation, so
> **one name may have a platform, an organization and a tenant version, each standing in for
> the others**. A tool may be **multi-command**, and **the whole command set occupies a single
> slot** at assembly time.

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-002 §4 Tool](../../product/PF-002-assets-settings-and-permissions/design.md#tool)（rev 10）
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

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-001 §4 资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)（rev 15） · [PF-002 §4 MCP](../../product/PF-002-assets-settings-and-permissions/design.md#mcp)（rev 10）
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

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-001 §4 资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)（rev 15） · [PF-002 §4 Connector](../../product/PF-002-assets-settings-and-permissions/design.md#connector)（rev 10）
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

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-002 §4 Loop Extension](../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension)（rev 10） ·
  [PF-012 §4 拓展件](../../product/PF-012-agent-loop-and-run/design.md#拓展件)（rev 7）
- **⚠️ 别混**：**它不是[拓展点](agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point)**——
  **拓展点是位置，拓展件是挂上去的东西**。位置由[状态点](../../product/PF-012-agent-loop-and-run/design.md#53-改日志的动作与纯派生的动作)推出、数目有限；**挂什么没有上限**
- **注意 ①**：**干预力是它的[权限](#ul-permission--权限--permission)，不是[设置](#ul-setting--设置--setting)**——
  **装一个拓展件、却只给它「只观察」，是成立的配法**
- **注意 ②**：**它只能靠改[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)起作用**，不能不留痕地改变下一步
- **能组合**：**不组合任何资产**（同 [MCP](#ul-mcp--mcp--mcp) 与[连接件](#ul-connector--连接件--connector)）

### UL-modality-converter · 模态转换件 · Modality Converter

> **中**：挂在 [PF-012「消息落盘之前」](../../product/PF-012-agent-loop-and-run/design.md#模态转换为什么必须落在这里)那个位置上的一件[拓展件](#ul-loop-extension--拓展件--loop-extension)，
> **把一个[内容块](record-and-context.md#ul-content-block--内容块--content-block)的非文本[模态](record-and-context.md#ul-modality--模态--modality)就地渲染成文本**。
> 它**声明自己能处理哪些模态**；**块进块出**；**就地给那个块记录文本的字段赋值**，不新增块、不改原样；
> **在落盘之前跑完，之后不再跑**。它**不判断这次要不要转**、**不保证转得出来**、**不承诺无损**。
> 正文在没有歧义处简称**转换件**。
>
> **EN**: A loop extension sitting at the "before a message is persisted" position that
> **renders a content block's non-text modality into text, in place**. It **declares which
> modalities it handles**; **a block goes in and text comes out**; it **fills the block's
> text field** without adding a block or altering the original; it **runs before
> persistence and never again**. It does **not** decide whether to convert this time,
> does **not** guarantee a rendering, and does **not** promise losslessness. Short form
> in running text: *converter*.

- **形态**：变体（父：[拓展件](#ul-loop-extension--拓展件--loop-extension)）
- **出处**：[PF-013 §4 转换件](../../product/PF-013-model-profiles-and-invocation/design.md#转换件)（rev 4） ·
  [PF-012 §5.8 模态转换为什么必须落在这里](../../product/PF-012-agent-loop-and-run/design.md#模态转换为什么必须落在这里)（rev 7）
- **⚠️ 别混**：**不是[结果卸载](execution-and-outcome.md#ul-result-offloading--结果卸载--result-offloading)**——
  那是把**太大**的工具结果换成占位、原件离开消息；转换件处理的是**读不懂**，**原件一步没动**
- **注意 ①**：**位置归 PF-012，契约归 PF-013**——有哪些模态、哪个模型收得下哪些，是大语言模型域定的
- **注意 ②**：**转不出来的块就进[模态投影](record-and-context.md#ul-modality-projection--模态投影--modality-projection)**，把收不下它的模型挡在合法目标之外——这是有意的兜底方向

### UL-slash-command · 斜杠命令 · Slash Command

> **中**：**用户主动发起某件事的入口**，用户敲 `/什么` 触发。
> 它**绑定**要做的事（一个 skill、一段 prompt 或其他上下文）——
> **命令本身不是做事的东西，它是指路牌**。**不含键盘控制、shell 命令或系统命令。**
>
> **EN**: **An entry point through which a user initiates something**, triggered by
> typing `/something`. It **binds** to the thing to be done — a skill, a prompt, or
> other context. **The command is not the doing; it is a signpost.** It covers **no
> keyboard control, no shell commands and no system commands.**

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-002 §4 Slash Command](../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)（rev 10）
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

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-001 §4 资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)（rev 15） · [PF-002 §4 Plugin](../../product/PF-002-assets-settings-and-permissions/design.md#plugin)（rev 10）
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
> presents itself at work. **It is neither a session nor an agent runtime**:
> editing a definition **does not** change an agent already running, one definition
> may have many agent runtimes going at once, and **the definition and the running
> thing evolve separately**. A sub-agent's definition **is one of these too**.

- **形态**：变体（父：[资产](#ul-asset--资产--asset)）
- **出处**：[PF-001 §4 资产的种类](../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)（rev 15） · [PF-002 §4 Agent Definition](../../product/PF-002-assets-settings-and-permissions/design.md#agent-definition)（rev 10）
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

- **形态**：属性
- **出处**：[PF-004 §4 agent 类型](../../product/PF-004-agent-definition-and-assembly/design.md#agent-类型)（rev 9） · [§6.8](../../product/PF-004-agent-definition-and-assembly/design.md#68-两类-agent谁能被谁自定义)（rev 9）
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

- **形态**：属性
- **出处**：[PF-004 §4 master 类目](../../product/PF-004-agent-definition-and-assembly/design.md#master-类目)（rev 9）
- **⚠️ 别混**：**它不是[会话类型](agent-runtime-loop.md#ul-session-type--会话类型--session-type)。**
  会话类型是**会话**的属性，**由它算出来**——
  [算，不是拷贝](../../product/PF-015-session-lifecycle-and-ownership/design.md#53-会话类型怎么算出来)。
  **映射改了，已存在的会话一个都不跟着变**
- **注意 ①**：**只能由产品出厂增补，租户加不了新的一类**——
  这是「[master 只能官方提供](#ul-agent-type--agent-类型--agent-type)」的推论，不是一条独立限制
- **注意 ②**：**五类不是封死的**，产品负责人明说「不限定死，未来可拓展」；
  **能拓展的是产品，不是租户**

## 一份资产的版本

### UL-asset-version · 资产版本 · Asset Version

> **中**：**一个[资产](#ul-asset--资产--asset)在某一次发布时定下的那一份内容。**
> **已发布的版本不可变**——要改，只能在它之上再发一个新的。
> 每一份资产有**自己独立的一条版本线**，从 v1 起各数各的：
> 一份[复制](circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)过去的资产
> **落在目标侧自己的线上**，源侧的 v7 在那边可能是 v2。
>
> **EN**: **The content of an asset as fixed by one release of it.** **A published
> version is immutable**: changing anything means publishing a new one on top of it.
> Every asset has **a version line of its own**, counted from v1 independently of
> everyone else's — an asset copied elsewhere **lands on the receiving side's own
> line**, so the source's v7 may be v2 over there.

- **形态**：对象
- **出处**：[PF-002 flows §3.3 一个资产定义的版本](../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)（rev 10） ·
  [PF-003 §6.4 可复制的对象](../../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象)（rev 4）
- **别混 ①**：**不是[版本选用](circulation-and-entitlement.md#ul-version-selection--版本选用--version-selection)**——
  那说的是**某个范围当前选了哪一个**，是一条关系；这一条说的是**被选的那个东西**
- **别混 ②**：**草稿不是版本**——它还在变，**复制与分享都只认已发布的**
- **注意**：**发现有新版本不静默替换已选用的那个**——选哪一版是消费方的决定

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

- **形态**：属性
- **出处**：[PF-002 §5.1](../../product/PF-002-assets-settings-and-permissions/design.md#51-组合是一种关系不是几种)（rev 10）
- **别混**：与[作用域合成语义](scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics)不是一回事——**裸写「组合」不作数**
- **注意**：这一节在 PF-002 里标着「**PM 推导，待产品负责人确认**」

### UL-agent-constitution · agent 构成 · Agent Constitution

> **中**：**一份[装配清单](agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest)里「它是什么」的那部分**——
> 动作空间、技能、需要哪几类执行环境、装进来哪些[沙箱实现](grounding-and-isolation.md#ul-sandbox-implementation--沙箱实现--sandbox-implementation)、
> 系统提示词的全部成分。**在装配时确定。**
> **构成变了就是另一个 agent**；与[运行时注入](agent-runtime-loop.md#ul-runtime-injection--运行时注入--runtime-injection)的分界是一句话：
> **这个变化改变的是「它是什么」，还是「它处在什么情况下」？**
>
> **EN**: **The part of an assembly manifest that says *what it is*** — its action
> space, its skills, which kinds of execution environment it needs, which sandbox
> implementations are assembled in, and every ingredient of its system prompt.
> **Fixed at assembly time.** **A change of
> constitution makes it a different agent.** The line against runtime injection is
> one question: **does this change alter *what it is*, or *what circumstances it is
> in*?**

- **形态**：属性
- **出处**：[PF-004 §4 注入](../../product/PF-004-agent-definition-and-assembly/design.md#注入)（rev 9） · [§5.3](../../product/PF-004-agent-definition-and-assembly/design.md#53-三个时刻)（rev 9）
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
> **EN**: **The set of actions this agent runtime can initiate.** Determined **by the
> agent's constitution alone** — it grows when a tool is loaded, shrinks when one is
> removed, and **does not change when permissions do**. The agent can still issue the
> call and simply be refused, so it knows **"this exists, I am merely not allowed
> right now"** rather than **"this does not exist"**.

- **形态**：视图
- **出处**：[PF-004 §4 动作空间](../../product/PF-004-agent-definition-and-assembly/design.md#动作空间)（rev 9）
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

- **形态**：对象
- **出处**：[PF-007 §4 meta](../../product/PF-007-meta-capabilities/design.md#meta)（rev 16） · [meta 与常驻的关系](../../product/PF-007-meta-capabilities/design.md#meta-与常驻的关系)（rev 16）
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

- **形态**：视图
- **出处**：[PF-006 §4 槽位](../../product/PF-006-tools-and-skills/design.md#槽位)（rev 14） · [PF-007 §5.4](../../product/PF-007-meta-capabilities/design.md#54-十三个槽位是预算的地板也是它的天花板意义)（rev 16）
- **别混**：**裸写「槽位」不作数**——它专指系统提示词里的那种占位
- **注意**：**不占槽位不等于不在[动作空间](#ul-action-space--动作空间--action-space)里**——见[三层正交](reach-and-availability.md#三层正交这是本卷的地基)

## 拿哪个模型去做

### UL-model-profile · 模型档案 · Model Profile

> **中**：**关于一个可被调用的模型的全部事实**——上游认哪个名字、能走哪几家供应商、
> 收得下和给得出哪几种模态、一次能吃多少吐多少、送进去之前还有什么限制。
> **它是数据，不是[资产](#ul-asset--资产--asset)**：「用哪个模型」是某份
> [Agent 定义](#ul-agent-definition--agent-定义--agent-definition)的一项[设置](#ul-setting--设置--setting)，
> **而那项设置的取值是对一条档案的引用**——档案自己独立存在、读得出来。
> 它的**路由名在同一范围内唯一，一旦定下不可改**：改了就是另一条档案。
>
> **EN**: **Everything the system holds about one callable model** — the name upstream
> answers to, which providers it may go through and in what order, which modalities it
> takes in and gives out, how much it reads and writes in one go, and what else must
> hold before a request goes out. **It is data, not an asset**: "which model" is a
> setting on an agent definition, and **that setting's value is a reference to one
> profile**, which exists in its own right and can be read back. Its **routing name is
> unique within a scope and never changes** — change it and it is a different profile.

- **形态**：对象
- **出处**：[PF-013 §4 模型档案](../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)（rev 4） ·
  [PF-013 flows §3.1 一条模型档案](../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案)（rev 4）
- **⚠️ 别混 ①**：**官方档案 / 自建档案**（谁建的、落在哪一层）**不是
  [官方件](circulation-and-entitlement.md#ul-official-asset--官方件--official-asset) /
  [自定义件](circulation-and-entitlement.md#ul-customized-asset--自定义件--customized-asset)**——
  后一对说的是**资产**的来源，而档案不是资产。**两套词各有各的对象，不能互相套用**
- **别混 ②**：**不是[一次模型调用](execution-and-outcome.md#ul-model-call--一次模型调用--model-call)**——
  那是有头有尾的计算资源，档案是长期的数据；**也不是上游那个模型本身**——
  **档案是我们对它的记载**，记载会过期，而模型不因为我们改了档案就变
- **注意 ①**：**建档 → 在册 → 撤回**，**撤回是终态，而那一行永远保留**——
  删了行，还指着它的会话就只说得出「未知模型」，而不是「已下架」
- **注意 ②**：**「已撤回」与「这个范围不允许它」是两件事**——
  后者那条档案照样在册，只是在这个范围[求值](scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation)算不出来

### UL-model-credential · 模型凭据 · Model Credential

> **中**：一个[组织](subjects-and-ownership.md#ul-organization--组织--organization)或
> [租户](subjects-and-ownership.md#ul-tenant--租户--tenant)**身上的一项属性**：
> **这个范围把模型请求发出去时用的那一把 OpenRouter 凭据**，**一个范围一把**，
> 范围里所有自建[档案](#ul-model-profile--模型档案--model-profile)共用它。
> 由此三条：**身份即范围**（它是谁的，看它配在哪个范围上）、
> **轮换就是改这一项的值**、**用量记在这个范围头上**。
> **官方档案不带它**；范围**可以自带自己的那一把**。
>
> **EN**: An attribute on an **organization** or a **tenant**: **the one OpenRouter
> credential that scope's model requests go out with**, **one per scope**, shared by every
> self-built profile in it. Three consequences follow: **its identity is the scope** — whose
> it is follows from which scope it sits on; **rotating it means changing this one value**;
> and **usage is attributed to that scope**. Official profiles carry none, and a scope may
> **bring its own**.

- **形态**：属性
- **出处**：[PF-013 §5.6](../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) · [§6.2](../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存)（rev 4）
- **⚠️ 别混 ①**：**不是[设置](#ul-setting--设置--setting)**——设置是**资产**的属性，
  而[档案不是资产](#ul-model-profile--模型档案--model-profile)、凭据也不是；**它挂在范围身上**
- **别混 ②**：**裸写「凭据」不作数**——账号的登录凭据、[连接件](#ul-connector--连接件--connector)的接入凭据都叫凭据，
  **正式名一律带「模型」**
- **注意**：一范围一把的代价是**做不到「这个模型走另一个账号」**；
  同一范围里所有自建档案的用量都记在同一把上，**上游账单分不到单条档案**

### UL-selected-model · 选中模型 · Selected Model

> **中**：**[会话](agent-runtime-loop.md#ul-session--会话--session)当前指向的那条[模型档案](#ul-model-profile--模型档案--model-profile)。**
> 它是一个**被记下来的取值**，**只因一次切换而变**；它摆在那儿，不会算不出来。
> **它不是这一次请求实际用的那条**——那是[有效模型](#ul-effective-model--有效模型--effective-model)。
>
> **EN**: **The model profile a session currently points at** — a **recorded value** that
> **changes only through a switch**, and is always simply there. **Not the profile a given
> request actually goes out with**: that is the effective model.

- **形态**：属性
- **出处**：[PF-013 §4 选中模型 与 有效模型](../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型) ·
  [§5.9](../../product/PF-013-model-profiles-and-invocation/design.md#59-换模型一条事实一个生效点零个新分支)（rev 4）
- **⚠️ 别混**：用户界面上「你正在用 X」说的是它；**「刚才那句话是 X 说的」说的是另一件事**，两者完全可以不是同一个答案

### UL-effective-model · 有效模型 · Effective Model

> **中**：**这一次请求实际用的那条[模型档案](#ul-model-profile--模型档案--model-profile)。**
> 它是**一次求值的结果，每次请求现算**：从[选中模型](#ul-selected-model--选中模型--selected-model)出发，
> 经[层级求值](scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation)（上层[锁死](scope-and-resolution.md#ul-immutable-marker--不可覆盖标记--immutable-marker)的压过它），
> 再经「调模型之前」位置上的[拓展件](#ul-loop-extension--拓展件--loop-extension)可能的改写得出；
> **可以与选中模型不同**；**算不出来是一件非常态**。
> **不是「上一条回复是哪个模型生成的」**——那是留痕，是上一次求值的历史答案。
>
> **EN**: **The model profile one request actually goes out with** — **the result of an
> evaluation, computed afresh per request**: starting from the selected model, through
> scope evaluation (an upper level's lock wins), then through whatever an extension at the
> "before the model call" position rewrites. It **may differ from the selected model**,
> and **failing to compute it is an off-nominal**. **Not "which model produced the last
> reply"** — that is a trace, the answer of an earlier evaluation.

- **形态**：视图
- **出处**：[PF-013 §4 选中模型 与 有效模型](../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型) ·
  [§5.10](../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) ·
  [§6.9](../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)（rev 4）
- **注意**：拓展件改掉它**不是静默的**——它[必须留下结论](../../product/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论)

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
