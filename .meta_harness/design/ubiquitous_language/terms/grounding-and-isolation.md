# 落地与隔离

**这一卷回答：agent 的动作实际落到哪里，那个地方隔不隔离、存多久、里面有什么本事，
以及一类事实本身存在哪一处。**

收在这里的是**动作的着落点**及其性质，还有**事实的所在**——
这些会话在哪一处、那些治理事实在哪一处，问的同样是「落在哪」，只是落的是数据不是动作。
**谁在发起动作**归 [Agent 运行时闭环](agent-runtime-loop.md)，**能发起哪些动作**归
[能力与构成](capabilities-and-composition.md)，**人从哪一面碰到这些事实**归
[交互与派发](interaction-and-dispatch.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

### UL-execution-environment · 执行环境 · Execution Environment

> **中**：**动作实际落到哪里。**宿主机、沙箱，或别的什么。
> **它永远存在——不存在「没有执行环境」这个状态**，动作总要落在某处。
> **落在哪一个，是每扇门、每一次执行算出来的**：
> **工具定义说的是「执行一条命令」，从不说「在哪执行」**，
> 因此换掉它**不需要重建 agent runtime，也不改变动作空间**。
>
> **EN**: **Where an action actually lands** — the host machine, a sandbox, or
> something else. **It always exists; there is no state of "having no execution
> environment"**, since an action must land somewhere. **Which one it is gets computed
> per door and per execution**: **a tool definition says "run a command", never "run it
> there"**, so replacing it **requires no rebuild of the agent runtime and does not
> change the action space**.

- **形态**：对象
- **出处**：[PF-004 §4 执行环境](../../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#执行环境)（rev 20） · [PF-005 §4](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#执行环境)（rev 9） · [PF-005 §6.1](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#61-宿主机始终在场沙箱实现装配时可选装配)（rev 9）
- **注意 ①**：**它的存活与 agent runtime 无关**——可能短得多（一次工具调用就结束），也可能长得多（绑定在租户）
- **⚠️ 注意 ②**：**它不是一个被注入的取值。**装配留下的是
  「需要哪几类环境」与「装进来哪些[沙箱实现](#ul-sandbox-implementation--沙箱实现--sandbox-implementation)」两样，
  **落点每扇门每次执行现算**

### UL-sandbox · 沙箱 · Sandbox

> **中**：**与宿主机相互隔离的一种执行环境。**
> **它不是执行环境的上位概念**——它是执行环境中**「隔离」的那些**，
> 而[宿主机](#ul-host-machine--宿主机--host-machine)是其中**「不隔离」的那一个**。
> 两者**在同一个抽象下，因此可以互换**——这正是「按安全策略在运行时热替换执行环境
> 而 agent 无感」能成立的前提。
>
> **EN**: **An execution environment isolated from the host machine.** **It is not a
> supertype of "execution environment"** — it is **those execution environments that
> isolate**, while the host machine is **the one that does not**. Both sit under the
> same abstraction **and are therefore interchangeable** — which is exactly what makes
> "hot-swap the execution environment per security policy, invisibly to the agent"
> possible.

- **形态**：变体（父：[执行环境](#ul-execution-environment--执行环境--execution-environment)）
- **出处**：[PF-005 §4 沙箱](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#沙箱)（rev 9）
- **别混**：与[沙箱实现](#ul-sandbox-implementation--沙箱实现--sandbox-implementation)不是一回事——**后者是装配进来的那个提供者**，前者是**这次执行落进去的那个隔离环境**
- **注意**：**沙箱不是资产**

### UL-sandbox-implementation · 沙箱实现 · Sandbox Implementation

> **中**：**装配时可以装进来的一个隔离环境提供者。**
> **全部沙箱实现遵循同一套契约与协议**，并各自声明两件事：
> **提供哪几种[设施](#ul-environment-facility--环境设施--environment-facility)**、
> **可以绑定在哪几个层级**（一次调用 · 一个会话 · 一个租户）。
> **装不装、装哪一个，是装配方的选择**；
> [宿主机](#ul-host-machine--宿主机--host-machine)不在此列——它不需要被装配。
>
> **EN**: **A provider of isolated environments that assembly may plug in.** **All sandbox
> implementations follow one and the same contract and protocol**, and each declares two
> things: **which facilities it offers** and **which binding levels it supports** (one call,
> one session, one tenant). **Whether to plug one in, and which one, is assembly's choice**;
> the host machine is not among them — it needs no plugging in.

- **形态**：对象
- **出处**：[PF-005 §4 沙箱实现](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#沙箱实现)（rev 9） · [§6.1](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#61-宿主机始终在场沙箱实现装配时可选装配)（rev 9）
- **别混**：**不是[沙箱](#ul-sandbox--沙箱--sandbox)本身**——一个沙箱实现可以起出很多个沙箱
- **注意 ①**：**它不是资产**——[理由与沙箱那条一样](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#67-沙箱不是资产)：资产约束 agent 由什么组装而成，它提供的是动作落地的地方
- **注意 ②**：**这次执行要落隔离环境时，拿设施与层级去匹配已装配的这些；
  [匹配不上就拒绝](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级)，不回退宿主机**

### UL-host-machine · 宿主机 · Host Machine

> **中**：**[agent runtime](agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime)
> 本身所在的地方，也是唯一不隔离的执行环境。**
> **它始终在场**——agent runtime 本身就跑在它上面，**不存在「宿主机不可用」**；
> **只要[执行环境权限](#ul-execution-environment-permission--执行环境权限--execution-environment-permission)允许，它就可用**。
> 它的特殊还有一处，而这一处很要紧：**宿主机不提供租户隔离**——
> 一个租户的 agent 在上面写下的东西，另一个租户的 agent 看得见；
> 因此**作用能不能直接落在它上面，必须被显式允许**。
>
> **EN**: **Where the agent runtime itself lives, and the only execution environment
> that does not isolate.** **It is always there** — the agent runtime runs on it, so
> **there is no such state as "the host machine is unavailable"**; **it is available
> whenever the execution-environment permission allows it.** It is special in one
> further way, and that way matters: **the host machine provides no tenant isolation** —
> what one tenant's agent writes there, another tenant's agent can see — so **whether
> an effect may land directly on it must be explicitly permitted**.

- **形态**：变体（父：[执行环境](#ul-execution-environment--执行环境--execution-environment)）
- **出处**：[PF-005 §4 宿主机](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#宿主机)（rev 9） · [§6.1](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#61-宿主机始终在场沙箱实现装配时可选装配)（rev 9） · [§6.2](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#62-宿主机不提供租户隔离因此必须被显式允许)（rev 9）
- **⚠️ 别混 ①**：**不是[会话据点](#ul-session-base--会话据点--session-base)。**命令行交付形态下两者恰好是同一台机器（[PF-016](../../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#会话据点)），但宿主机回答「一次工具执行的作用落在哪」、每次执行现算，据点回答「这些会话的事实存在哪」
- **⚠️ 别混 ②**：**裸写「宿主」不是它**——词表里「宿主」指承载一个协程或一段执行、它没了那一段就跟着没了的那一方（agent runtime、会话；见[取消跟着宿主走](agent-runtime-loop.md#ul-cancellation-follows-host--取消跟着宿主走--cancellation-follows-host)），在[领域对象条目](../../domain_objects/conventions.md#一条对象条目长什么样)里是「寿命跟着谁」那一栏；hooks 来自的第三方 agent 产品（Claude Code、Codex）也不是宿主，规格里另有称呼。这几个所指都不是宿主机
- **注意 ①**：**它不被装配**——要装配的是[沙箱实现](#ul-sandbox-implementation--沙箱实现--sandbox-implementation)，而且是可选的
- **注意 ②**：**沙箱创建失败不得退回宿主机**——那等于绕过安全判断
- **注意 ③**：**[工作区实例](scope-and-resolution.md#ul-workspace-instance--工作区实例--workspace-instance)的本地目录不是它上面的边界**——
  作用允许落宿主机，范围就是整台宿主机，[目录内外走同一条放行判断](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#工作区的承载目录不是宿主机上的边界)

### UL-stateless-sandbox · 无状态沙箱 · Stateless Sandbox

> **中**：**效用不持久**的隔离执行环境：**它只活一次工具调用**——
> 调用一结束，它连同里面的东西一起没了，**本来就没有该留的**。
>
> **EN**: An isolated execution environment whose **effects do not persist**: **it lives
> for exactly one tool call**, and when that call ends it goes and everything inside
> goes with it — there was never anything meant to be kept.

- **形态**：对象
- **出处**：[PF-005 §5.1 四种执行环境](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#51-四种执行环境)（rev 9）
- **别混**：它「不绑定」是因为**用完就扔**；宿主机「不绑定」是因为**大家共用**。
  **两个「不绑定」含义相反**，这正是分类必须拆成两维的原因

### UL-session-sandbox · 会话级沙箱 · Session-Scoped Sandbox

> **中**：效用**活到一次会话**的隔离执行环境：**绑定在一个会话上**，
> 且有**最大连续存活时间**——**到点直接销毁，数据不留存，这是刻意的**；
> 那个会话下次还要用，**重建一个新的、重新计时**。
>
> **EN**: An isolated execution environment whose effects **live for one session**: it
> is **bound to a session** and has a **maximum continuous lifetime**. **When that time
> is up it is destroyed outright and nothing is retained — deliberately so**; should
> the session need one again, **a fresh one is built and the clock starts over**.

- **形态**：对象
- **出处**：[PF-005 §5.1 四种执行环境](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#51-四种执行环境)（rev 9） ·
  [§6.3](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存)（rev 9）
- **注意**：**同一个执行环境里的终端会话会一起消失**——环境是它们的宿主，agent **必须被告知**

### UL-tenant-sandbox · 租户级沙箱 · Tenant-Scoped Sandbox

> **中**：效用**活到租户**的隔离执行环境，是一个**共享的工作空间**——
> 该租户的全部会话与全部 agent 在同一个空间里做事。
> **本体的存活并不是无限的**：允许停机、允许换一个物理节点。
> **三类沙箱里只有它对内部数据有持久要求**：必须**可备份、可迁移**，
> 需要和租户生命周期一样长。
>
> **EN**: An isolated execution environment whose effects **live as long as the
> tenant** — a **shared execution space** in which all of that tenant's sessions and agents
> work. **The box itself is not guaranteed to stay up**: it may be stopped and moved to
> another physical node. **Of the three kinds of sandbox, only this one places a
> durability requirement on the data inside it**: that data must be **backupable and
> migratable**, lasting as long as the tenant does.

- **形态**：对象
- **出处**：[PF-005 §5.2](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#52-租户级沙箱本体的存活与数据的存活是两件事)（rev 9） · [§6.4](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#64-租户级沙箱共享的工作空间)（rev 9）

### UL-sandbox-data · 沙箱数据 · Sandbox Data

> **中**：**与沙箱本体分开的一个东西。**三类沙箱里都有数据，但**只有租户级那一类
> 对它有持久要求**。把本体与数据分开，是为了让那一行成立——
> **只有分开之后，「云主机允许停机换节点」和「攒下来的东西不能丢」才可能同时满足。**
>
> **EN**: **Something kept separate from the sandbox itself.** All three kinds hold
> data, but **only the tenant-scoped kind places a durability requirement on it.**
> Separating the two is what makes that row possible: **only once they are separate
> can "the cloud host may stop and move nodes" and "what has been accumulated must not
> be lost" both hold.**

- **形态**：对象
- **出处**：[PF-005 §4 沙箱内的数据](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#沙箱内的数据)（rev 9） · [§5.2](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#52-租户级沙箱本体的存活与数据的存活是两件事)（rev 9）

### UL-environment-facility · 环境设施 · Environment Facility

> **中**：**一个执行环境提供哪几种做事的手段。**浏览器是一种，命令行是一种，文件系统是一种。
> **每一个具体的执行环境都要声明自己提供哪几种——包括宿主机，它不是例外。**
> **它与「活多久、谁看得见」那两个维度正交**：两个同为会话级沙箱的环境，
> 提供的设施可以完全不同。
>
> **EN**: **Which kinds of means an execution environment offers for getting things
> done** — a browser is one, a command line is one, a file system is one. **Every
> concrete execution environment must declare its own, the host machine included; it
> is no exception.** **It is orthogonal to the "how long it lives / who can see it"
> dimensions**: two environments both scoped to a session may offer entirely different
> facilities.

- **形态**：属性
- **出处**：[PF-005 §4 设施](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#设施)（rev 9）
- **别混**：**裸写「设施」不作数**——它专指执行环境声明的这一层
- **注意**：**环境声明自己提供什么**归这里；**工具声明自己需要什么怎么声明**归工具那一块；
  [匹配不上的后果归 PF-005](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级)
- **注意**：**设施给不了时不降级、不绕道**

### UL-terminal-session · 终端会话 · Terminal Session

> **中**：在一个执行环境的**命令行设施**里开出来、**会持续存在**的一条命令行会话——
> 后一条命令基于前一条的结果。**可以同时有多个**；
> **它活在那个执行环境里**，因此环境一没，**里面的终端会话全部一起没**。
>
> **EN**: A **persistent** command-line session opened inside an execution
> environment's command-line facility, where each command builds on the results of
> the last. **Several may exist at once**; **they live inside that execution
> environment**, so when it goes, **all of them go with it**.

- **形态**：对象
- **出处**：[元能力：`Shell()`](../../product/meta-capabilities/design.md#meta-shell)（rev 3） · [PF-005 §6.3](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存)（rev 9）
- **⚠️ 别混**：**不是[会话](agent-runtime-loop.md#ul-session--会话--session)。**
  两者**毫无关系**——一个是协作的归属边界，一个是执行环境里的一条命令行。
  **`Shell()` 的命令名 `create_session` / `close_session` 不改**（那是接口），
  **但叙述一律写「终端会话」**。改名依据见 [现行词义](../index.md)
- **注意**：**状态的寿命是显式的**——只有显式开终端会话才保留可复用的终端会话状态；一次性执行的文件、外部效果、结果和账目不因此消失；
  给一个不存在的标识**必须明确失败**，不得悄悄降级成一次性执行

### UL-execution-environment-permission · 执行环境权限 · Execution Environment Permission

> **中**：**按工具逐个授予的一项权限，管的是「这个工具的作用能不能直接落在
> [宿主机](#ul-host-machine--宿主机--host-machine)上」。****恰三态**：
> `always-allow`——准它直接落宿主机；
> `auto_place`——**由系统算出合适的执行环境**；
> `never-allow`——**绝不落宿主机**。
> 授权在**组织级与租户级**授予，**每个工具各配各的、互不牵连**；会话可保存和切换现行授权范围内的当前策略值。
> **它只决定作用落在哪，不决定动作准不准。**
>
> **EN**: **A per-tool permission governing whether that tool's effects may land directly
> on the host machine.** Exactly three: `always-allow`; `auto_place` — **the system picks a
> fitting execution environment**; `never-allow` — **never the host machine**. Granted at the
> organization and tenant levels, **each tool configured on its own**. **It decides where an
> effect lands, never whether the action is permitted.**

- **形态**：属性
- **出处**：[PF-005 §4 执行环境权限](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#执行环境权限) ·
  [§6.8](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#68-执行环境权限每个工具各配各的)（rev 9）
- **⚠️ 别混**：**不是[会话运行模式](agent-runtime-loop.md#ul-session-run-mode--会话运行模式--session-run-mode)。**
  **两者都是三态、都曾各有一个 `auto`**，但**一个决定「准不准」，一个决定「落在哪」**，
  而且**会在同一次执行里一前一后出现**。**两个名字特意分开取**：`auto_permission` 对 `auto_place`
- **⚠️ 注意 ①**：**粒度是「门」这一级，不是命令级。**执行环境是配给一扇门的，
  门后命令共同受该工具的落点策略约束，每次调用仍按设施及当前条件选择合法环境，不保证历次调用落在同一实例；而[「能不能做」本来就是一条一条命令的事](../../product/meta-capabilities/design.md#必需入口常驻与命令可用性)
- **⚠️ 注意 ②**：**[落点不可用就是拒绝，不降级](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级)。**
  `auto_place` 算出该进容器而容器起不来，**这次执行被拒**，**不回退宿主机**
- **注意 ③**：**[meta tool](capabilities-and-composition.md#ul-meta-capability--meta-能力--meta-capability) 一样受它管。**
  给 `Shell()` 配 `never-allow` **并没有关掉那扇门**，只是规定它的作用落在隔离环境里——
  **不触[「关不掉一扇门」那条红线](../../product/meta-capabilities/design.md#必需入口常驻与命令可用性)**
- **注意 ④**：**[工作区那一级不参与](scope-and-resolution.md#ul-workspace--工作区--workspace)**——
  授权与权限相关的配置，**加载时就把工作区来的滤掉了**
- **注意 ⑤**：**没声明要用执行环境的工具，这一维对它不适用。**
  那是**实现时的契约**，**不是「默认取哪一档」**
- **注意 ⑥**：**「这个工具能不能用[宿主机](#ul-host-machine--宿主机--host-machine)」没有第二项权限在管**——
  不是 `never-allow` 只表示该项策略未禁止宿主机；`auto_place` 的实际选择、设施及隔离条件仍须满足
- **弃用**：~~「执行安全策略」~~（指的是**把这一项配成 `never-allow`** 那件事，是同一项权限的配值） ·
  ~~「使用宿主机的资格」~~（＝**这一项不是 `never-allow`**）

### UL-target-environment · 目标环境 · Target Environment

> **中**：**工具的一项[落点与身份类](capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category)设置：这个工具的执行需要一个什么样的[执行环境](#ul-execution-environment--执行环境--execution-environment)**，
> 形状是「绑定在哪一层 × 要哪几种[设施](#ul-environment-facility--环境设施--environment-facility)」。
> 默认值是工具作者的判断；持有它的组织、租户可以在自己那一层改，**工作区改不了**。
> **求值出来的那一份就是这次执行的要求**，运行时按它自动匹配；**满足不了，这个工具就不可用——绝不降级满足**。
>
> **EN**: **A placement-and-identity setting on a tool: what kind of execution environment its executions
> require**, shaped as "bound at which level × needing which facilities". The default is the tool author's
> judgement; holding organizations and tenants may change it at their own level, **the workspace may not**.
> **The evaluated value is this execution's requirement**, matched automatically at run time; **if it cannot
> be met, the tool is unavailable — never satisfied by a lesser environment**.

- **形态**：属性
- **出处**：[PF-006 §6.8 工具怎么提执行环境的要求](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#68-工具怎么提执行环境的要求) ·
  [§5.3 其中两项声明的是设置项](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#其中两项声明的是设置项)（rev 24） ·
  [PF-002 §4 Tool](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#tool)（rev 32）
- **别混**：**它说的是「要什么」**；[执行环境权限](#ul-execution-environment-permission--执行环境权限--execution-environment-permission)说的是「许落在哪」；
  这次执行实际落在哪，是按两者**每次现算**出来的——执行环境权限改了，下一次执行按新值现算，不必重建任何东西
- **注意**：**不声明就是没有特殊要求**——它是工具定义里那项「需要什么样的执行环境」声明落成的设置

### UL-session-base · 会话据点 · Session Base

> **中**：一个[账号](subjects-and-ownership.md#ul-account--账号--account)的[会话](agent-runtime-loop.md#ul-session--会话--session)、
> [会话日志](record-and-context.md#ul-session-log--会话日志--session-log)、等着他答的[决策卡片](interaction-and-dispatch.md#ul-decision-card--决策卡片--decision-card)，
> 以及跑他那些[运行](agent-runtime-loop.md#ul-run--运行--run)的
> [agent runtime](agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime)，**实际所在的那一处**。
> 身份是**（哪一处 · 哪个[治理中心](#ul-governance-center--治理中心--governance-center) · 哪个账号）**这一组合；
> 「一处」是位置概念，**命令行交付形态把它落成一台机器**。
> **它不是一个进程**——「此刻有没有一个进程在服务它」与「它在不在」是两件事；
> 它也**不随任何一次使用生灭**，**没人开着屏的时候照常发生事**。**治理事实不在它里面**：
> 据点上可以留一份用于呈现的副本，**那份副本不作准入依据**。
>
> **EN**: The one place where an account's sessions, session logs, decision cards awaiting
> their answer, and the agent runtimes running their runs **actually reside**. Its identity
> is the combination **(which place · which governance center · which account)**; "place" is
> a locational notion, which **the command-line delivery form realises as one machine**. **It is
> not a process** — whether some process is serving it at this moment is a different
> question from whether it exists — it does not come and go with any single use, and
> **things keep happening there while nobody has a screen open**.
> **Governance facts are not in it**: a copy may be kept there for display, but **that copy
> admits nothing**.

- **形态**：对象
- **出处**：[PF-016 §4 会话据点](../../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#会话据点) ·
  [§5.2](../../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#52-一个账号在一处怎么被装起来) ·
  [§5.6](../../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧) ·
  [§6.16](../../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#616-没人开着屏这一处照常发生事)（rev 13）
- **⚠️ 别混**：**不是[宿主机](#ul-host-machine--宿主机--host-machine)。**
  本交付形态下两者**恰好是同一台机器**，但**回答的问题不同**：
  宿主机回答「一次[工具执行](execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)的作用**落在哪**」，
  **每次执行现算**；据点回答「这些会话的事实**存在哪**」，**不现算**
- **注意**：身份里**有意不带**[登录状态](subjects-and-ownership.md#ul-login-state--登录状态--login-state)与[租户](subjects-and-ownership.md#ul-tenant--租户--tenant)——
  同一个账号在这台机器上登录两次，看到的是**同一批会话**；一个账号的多个租户身份**共用这一份据点**，
  [租户之间的隔离照 PF-001 在里面成立](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)

### UL-governance-center · 治理中心 · Governance Center

> **中**：[账号](subjects-and-ownership.md#ul-account--账号--account)、[组织](subjects-and-ownership.md#ul-organization--组织--organization)、
> [租户](subjects-and-ownership.md#ul-tenant--租户--tenant)与[成员资格效力](subjects-and-ownership.md#ul-membership-standing--成员资格效力--membership-standing)、
> [租户角色](subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role)、[邀约](subjects-and-ownership.md#ul-offer--邀约--offer)，
> 以及挂在组织层与租户层的那些[范围化对象](scope-and-resolution.md#ul-scoped-object--范围化对象--scoped-object)，
> 以及租户—工作区关系等治理事实**所在的那一处，独立于任何人的机器**。**一次部署就是一个治理中心；它的身份不是它的地址**——
> 地址只是够到它的方式，可以变——
> [登录标识「部署内唯一」](subjects-and-ownership.md#ul-login-identifier--登录标识--login-identifier)里的那个「部署」就是它，
> **两个治理中心上的同名标识是两个账号，互不相通**。**它不知道任何会话**；
> 而「这个租户此刻算不算数」「这一层配的是什么值」**只有它答得准**，
> 别处的副本**只能用来显示，不作现读判定的依据**。
>
> **EN**: The one place, independent of anybody's machine, where accounts, organizations,
> tenants and their membership standing, tenant roles, offers, and the scoped objects held
> at the organization and tenant layers, together with governance facts such as tenant–workspace relations, **reside**. **One deployment is one governance
> center; its identity is not its address** — the address is merely how it is reached and
> may change. It is the "deployment" in which a login identifier is unique, so **the same
> identifier on two governance centers denotes two accounts** with nothing in common.
> **It knows of no session**; and for "does this tenant count right now" and "what value is
> configured at this layer" **only it answers authoritatively** — copies held elsewhere may
> be displayed but **never serve as the basis for a live check**.

- **形态**：对象
- **出处**：[PF-016 §4 治理中心](../../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#治理中心) ·
  [§5.1](../../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#51-三处地方各自拥有什么) ·
  [§5.6](../../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧)（rev 13）
- **⚠️ 别混**：**不是[会话据点](#ul-session-base--会话据点--session-base)。**
  中心拥有治理事实，据点拥有会话事实；工作区实例独立于会话并可跨租户共用，不因物理位置在据点机器上而成为会话私有内容。
- **注意**：本版承诺的部署形态只有「一个组织统一部署一个中心」；
  [个人自托管一个中心不是产品形态](../../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#二目标与非目标)，
  研发用的夹具不在这个词的承诺范围里——**但夹具起来的那个仍然是一个治理中心**，所指不变

### UL-deployment-key · 部署密钥 · Deployment Key

> **中**：只有这一次[治理中心](#ul-governance-center--治理中心--governance-center)部署持有的一套秘密，
> 用来让「只有这个中心自己能说出的话」不可伪造。由[运维者](subjects-and-ownership.md#ul-deployment-operator--运维者--deployment-operator)
> 在立中心时生成一次、放在中心的数据之外自己保管，**中心永不显示它**；缺了或不完整，中心不起来。
> **它不加密任何东西**，所以换掉它什么都不丢。
>
> **EN**: The one set of secrets held only by this governance-center deployment, used to make
> "things only this center itself can say" unforgeable. The deployment operator generates it
> once when standing the center up and keeps it outside the center's data; **the center never
> shows it**; missing or incomplete, the center does not start. **It encrypts nothing**, so
> replacing it loses nothing.

- **形态**：属性
- **出处**：[PF-017 §4 部署密钥](../../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md#部署密钥) ·
  [§6.11](../../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md#611-部署密钥运维者生成一次自己保管中心永不显示它)（rev 8）
- **⚠️ 别混**：不是账号的凭据、不是[模型凭据](capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)、
  不是[登录状态](subjects-and-ownership.md#ul-login-state--登录状态--login-state)——那三样各归各的拥有者。
  也不是[治理中心标识](#ul-governance-center-identifier--治理中心标识--governance-center-identifier)：一个是秘密、可换，一个是名字、不换
- **注意**：它具体给哪几句话背书归技术设计；本条以技术侧采用需要部署级秘密的路为前提
  （[PF-017 decisions §二](../../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md)），改路则复核

### UL-governance-center-identifier · 治理中心标识 · Governance Center Identifier

> **中**：一个[治理中心](#ul-governance-center--治理中心--governance-center)用来指认自己的那个名字：
> 第一次启动成功那一刻由中心自己定下、此后不变、跟着它的数据走、对任何够得到中心的人**在登录之前就可读**。
> **不是地址，不是秘密**；两个地址后面是不是同一个中心，比的就是它——相同是搬家，不同是另一个中心。
> 正文简称「中心标识」。
>
> **EN**: The name a governance center uses to identify itself: fixed by the center at its first
> successful start, never changing, travelling with its data, and **readable before login** by
> anyone who can reach the center. **Neither an address nor a secret**; whether two addresses lead
> to the same center is decided by comparing it — the same means the center moved, different means
> another center. Product text shortens it to "center identifier".

- **形态**：属性
- **出处**：[PF-017 §4 中心标识](../../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md#中心标识) ·
  [§6.12](../../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来)（rev 8）
- **注意**：首次启动成功后，正常重启、操作系统崩溃与断电都保留已确定的标识；灾备从同一份数据恢复仍是原中心，从零重立才是另一个中心（[§6.12](../../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来)，rev 7）。
- **⚠️ 别混**：不是地址（地址可变，它不变）；不是[部署密钥](#ul-deployment-key--部署密钥--deployment-key)；
  与[登录标识](subjects-and-ownership.md#ul-login-identifier--登录标识--login-identifier)同一取名模式，所指不同——一个指认中心，一个指认账号
- **注意**：它只管「是不是同一个」，不证明「真的是它」——防冒充归传输那一层
  （[PF-017 §8](../../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖)）；
  同一份数据被拷贝后两处同时活着，它分不出，那是运维错误（[§6.12](../../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来)）

### UL-deployment-parameter · 部署参数 · Deployment Parameter

> **中**：产品正文写着「按部署配置」、对整个[治理中心](#ul-governance-center--治理中心--governance-center)上所有人一律生效、
> 且不属于任何组织或租户的那些值的**统称**。每一项各归定义它的 topic（本版五项：未激活记录的留存期限；
> 加入组织的邀请与隶属请求、待确认的复制通知与分享邀请各自的默认时长）；每一项由
> [运维者](subjects-and-ownership.md#ul-deployment-operator--运维者--deployment-operator)给值、中心启动时读、缺一不可、不出厂默认；
> 改了只影响此后的判定——**唯一例外是邀约类业务动作**：一份邀约的时效在发出那一刻定下（填了用填的，没填用那一刻的默认值），此后不随参数变。
> **它不是[范围化对象](scope-and-resolution.md#ul-scoped-object--范围化对象--scoped-object)**，不挂在任何一层、不参与求值。
>
> **EN**: The collective name for the values the product text marks "configured per deployment":
> in force for everyone on a governance center and belonging to no organization or tenant. Each
> item is owned by the topic that defines it (five in this version: the retention period of
> unactivated records, and the default periods of organization invitations, affiliation requests,
> pending copy notices and sharing invitations); each is set by the deployment operator, read at
> start, required with no factory default, and a change affects only later judgements — with one
> exception: an offer's validity period is fixed at the moment it is issued (the issuer's own value
> if given, otherwise that moment's default) and does not follow later parameter changes.
> **Not a scoped object** — it hangs on no layer and takes no part in evaluation.

- **形态**：总称
- **出处**：[PF-017 §4 部署参数](../../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md#部署参数) ·
  [§6.15](../../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md#615-部署参数由运维者给值起动时读缺一不可)（rev 8）
- **⚠️ 别混**：不是范围化对象，也不是[设置](capabilities-and-composition.md#ul-asset--资产--asset)——设置挂在层上、按范围求值，它对全中心一律生效
- **注意**：「统称」不是一张表——每一项各自有值、各归自己的 topic；本 topic 只说谁给、何时生效、改了怎么算

### UL-credential-custodian · 凭据保管方 · Credential Custodian

> **中**：**拿着凭据本体——那个秘密的值——的那一方。**凭据在别处只以引用或「配没配」出现，
> 要值只能向它取；**它只按条件交出**：值只交给凭着这把凭据所属的那个[租户](subjects-and-ownership.md#ul-tenant--租户--tenant)
> 或那份[持有](circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)来取的一方，
> **条件不成立就不交，不拿别的租户、别的范围那一把顶上**。本体落在它之外的任何持久介质上，**只以加密形式存在**。
> **它只保管，不决定配哪一把**：配上、换一把、解绑，都不经它判。
>
> **EN**: **The party that holds a credential's body — the secret value itself.** Everywhere else a
> credential appears only as a reference or as whether one is configured; the value can be obtained
> from the custodian alone, and **it hands the value over only on conditions**: only to a caller asking
> on behalf of the tenant or the holding the credential belongs to — **when the conditions fail it hands
> nothing over, never substituting another tenant's or another scope's credential**. Wherever the value
> rests on durable storage outside the custodian, **it rests encrypted**. **It keeps credentials; it does
> not decide which one is configured** — setting, replacing or unbinding one is not its call.

- **形态**：属性
- **出处**：[现行词义](../index.md)（依据 D-063 R-1，定义由 PM 起草）
- **⚠️ 别混**：**不是[模型凭据](capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)，
  也不是 [MCP 凭据](capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)**——
  那两样说的是「配的是哪一把」，是租户或持有上的一项值；这一条说的是**那一把的值放在谁手里、谁取得到**
- **注意 ①**：**本版只有[会话据点](#ul-session-base--会话据点--session-base)这一侧有它**：每个据点一份，
  保管这个据点上各租户那一把模型凭据的副本——[离线时用的就是手上这份](../../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据)——
  和经 OAuth 取得的 MCP 凭据；中心那一侧的保管不在本版（`capability.credential-custodian` v2）
- **注意 ②**：**它不判这把凭据在上游还算不算数**——据点上的副本是写下时的那一把，
  中心上换过、撤过，要等这台机器再连上中心、重写副本才知道
- **注意 ③**：**加密挡的是没有密钥的拷贝与备份，以及另一个据点**；同一台机器上以同一个操作系统身份跑、
  密钥与密文都够得着的进程，它不挡——[宿主机那一层不隔离](../../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#64-一台机器上账号之间互不可见但宿主机那一层不隔离)

### UL-subprocess-environment-allowlist · 子进程环境变量名单 · Subprocess Environment Allowlist

> **中**：从父进程环境里向子进程传递变量时，允许传递的变量名集合。只传集合内且父进程实际具有的变量，不自动继承集合外的变量；名单不赋予读取凭据或落到宿主机的权限。
>
> **EN**: The set of variable names allowed to pass from a parent process environment to a child. Only listed variables actually present in the parent are copied; unlisted variables are never inherited automatically. The list grants neither credential access nor permission to run on the host.

- **形态**：规则
- **出处**：[PF-005 §6.10](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#610-hooks-子进程与环境变量传递)（rev 9）
- **别混**：不是凭据配置；不同消费者可各配一份名单，名单的含义相同。

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
