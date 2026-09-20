# 落地与隔离

**这一卷回答：agent 的动作实际落到哪里，以及那个地方隔不隔离、存多久、里面有什么本事。**

收在这里的是**动作的着落点**及其性质。**谁在发起动作**归
[Agent 运行时闭环](agent-runtime-loop.md)，**能发起哪些动作**归
[能力与构成](capabilities-and-composition.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

### UL-execution-environment · 执行环境 · Execution Environment

> **中**：**动作实际落到哪里。**宿主机、沙箱，或别的什么。
> **它永远存在——不存在「没有执行环境」这个状态**，动作总要落在某处。
> 它是[注入](agent-runtime-loop.md#ul-runtime-injection--运行时注入--runtime-injection)的：
> **工具定义说的是「执行一条命令」，从不说「在哪执行」**，
> 因此换掉它**不需要重建运行实例，也不改变动作空间**。
>
> **EN**: **Where an action actually lands** — the host machine, a sandbox, or
> something else. **It always exists; there is no state of "having no execution
> environment"**, since an action must land somewhere. It is **injected**: **a tool
> definition says "run a command", never "run it there"**, so replacing it **requires
> no rebuild of the running instance and does not change the action space**.

- **出处**：[PF-004 §4 执行环境](../../product/PF-004-agent-runtime-assembly-and-liveness/design.md#执行环境) · [PF-005 §4](../../product/PF-005-execution-environments-and-sandboxes/design.md#执行环境)（rev 3 / rev 2）
- **注意**：**它的存活与运行实例无关**——可能短得多（一次工具调用就结束），也可能长得多（绑定在租户）

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

- **出处**：[PF-005 §4 沙箱](../../product/PF-005-execution-environments-and-sandboxes/design.md#沙箱)（rev 2）
- **注意**：**沙箱不是资产**

### UL-host-machine · 宿主机 · Host Machine

> **中**：**agent 运行时本身所在的地方，也是唯一不隔离的执行环境。**
> 它的特殊只有一处，但很要紧：**宿主机不提供租户隔离**——
> 一个租户的 agent 在上面写下的东西，另一个租户的 agent 看得见。
> 因此**它不是「没有沙箱」的默认状态，而是执行环境的一个具体取值**，
> 且**必须被显式允许才能用**。
>
> **EN**: **Where the agent runtime itself lives, and the only execution environment
> that does not isolate.** It is special in exactly one way, and that way matters:
> **the host machine provides no tenant isolation** — what one tenant's agent writes
> there, another tenant's agent can see. It is therefore **not a default state of
> "no sandbox" but one concrete value of execution environment**, and **usable only
> when explicitly permitted**.

- **出处**：[PF-005 §4 宿主机](../../product/PF-005-execution-environments-and-sandboxes/design.md#宿主机) · [§6.1](../../product/PF-005-execution-environments-and-sandboxes/design.md#61-宿主机是一个取值不是默认状态) · [§6.2](../../product/PF-005-execution-environments-and-sandboxes/design.md#62-宿主机不提供租户隔离因此必须被显式允许)（rev 2）
- **注意**：**装配时必须明确注入一个执行环境，哪怕注入的就是宿主机**
- **注意**：**沙箱创建失败不得退回宿主机**——那等于绕过安全判断

### UL-stateless-sandbox · 无状态沙箱 · Stateless Sandbox

> **中**：**效用不持久**的隔离执行环境：**一次调用结束就没了**，本来就没有该留的。
>
> **EN**: An isolated execution environment whose **effects do not persist**: **once a
> call ends, nothing remains** — there was never anything meant to be kept.

- **出处**：[PF-005 §5.1 四种执行环境](../../product/PF-005-execution-environments-and-sandboxes/design.md#51-四种执行环境)（rev 2）
- **别混**：它「不绑定」是因为**用完就扔**；宿主机「不绑定」是因为**大家共用**。
  **两个「不绑定」含义相反**，这正是分类必须拆成两维的原因

### UL-session-sandbox · 会话级沙箱 · Session-Scoped Sandbox

> **中**：效用**活到一次会话**的隔离执行环境。**到点销毁，数据不留存——这是刻意的。**
>
> **EN**: An isolated execution environment whose effects **live for one session**.
> **Destroyed when its time comes, with no data retained — deliberately so.**

- **出处**：[PF-005 §6.3](../../product/PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存)（rev 2）
- **注意**：**同一个执行环境里的终端会话会一起消失**——环境是它们的宿主，agent **必须被告知**

### UL-tenant-sandbox · 租户级沙箱 · Tenant-Scoped Sandbox

> **中**：效用**活到租户**的隔离执行环境，是一个**共享的工作空间**。
> **三类沙箱里只有它对内部数据有持久要求**：必须**可备份、可迁移**，
> 需要和租户生命周期一样长。
>
> **EN**: An isolated execution environment whose effects **live as long as the
> tenant** — a **shared workspace**. **Of the three kinds of sandbox, only this one
> places a durability requirement on the data inside it**: it must be **backupable and
> migratable**, lasting as long as the tenant does.

- **出处**：[PF-005 §5.2](../../product/PF-005-execution-environments-and-sandboxes/design.md#52-租户级沙箱本体的存活与数据的存活是两件事) · [§6.4](../../product/PF-005-execution-environments-and-sandboxes/design.md#64-租户级沙箱共享的工作空间)（rev 2）

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

- **出处**：[PF-005 §4 沙箱内的数据](../../product/PF-005-execution-environments-and-sandboxes/design.md#沙箱内的数据) · [§5.2](../../product/PF-005-execution-environments-and-sandboxes/design.md#52-租户级沙箱本体的存活与数据的存活是两件事)（rev 2）

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

- **出处**：[PF-005 §4 设施](../../product/PF-005-execution-environments-and-sandboxes/design.md#设施)（rev 2）
- **别混**：**裸写「设施」不作数**——它专指执行环境声明的这一层
- **注意**：**环境声明自己提供什么**归这里；**工具声明自己需要什么、怎么匹配、匹配不上怎么办**归工具那一块
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

- **出处**：[PF-007 §6.4 `Shell()`](../../product/PF-007-meta-capabilities/design.md#64-shell通向命令行) · [PF-005 §6.3](../../product/PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存)（rev 6 / rev 2）
- **⚠️ 别混**：**不是[会话](agent-runtime-loop.md#ul-session--会话--session)。**
  两者**毫无关系**——一个是协作的归属边界，一个是执行环境里的一条命令行。
  **`Shell()` 的命令名 `create_session` / `close_session` 不改**（那是接口），
  **但叙述一律写「终端会话」**。改名依据见 [UL-D-1 裁决 5](../decisions.md#定死了什么)
- **注意**：**状态的寿命是显式的**——开会话才有持久状态，**不做隐式持久**；
  给一个不存在的标识**必须明确失败**，不得悄悄降级成一次性执行

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
