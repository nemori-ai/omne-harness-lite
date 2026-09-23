# 取用与可用性

**这一卷回答：一样能力此刻够不够得着、做不做得了。**

收在这里的是**能力的当下状态**，以及决定这个状态的那些机制。
**agent 由什么构成**是另一个问题，归[能力与构成](capabilities-and-composition.md)；
**够到之后怎么跑**归[执行与收场](execution-and-outcome.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

## 三层正交，这是本卷的地基

**「agent 不会用这个工具」此前永远查不出原因，因为三件事混作一谈。**分开之后：

| 层 | 回答什么 | 由谁决定 | 什么时候变 | 归哪 |
|---|---|---|---|---|
| **[动作空间](capabilities-and-composition.md#ul-action-space--动作空间--action-space)** | 我**能做**什么 | [agent 构成](capabilities-and-composition.md#ul-agent-constitution--agent-构成--agent-constitution) | 装配时；运行中自己追加 | 能力与构成 |
| **呈现方式** | 哪些**直接占[槽位](capabilities-and-composition.md#ul-prompt-slot--提示词槽位--prompt-slot)**，哪些**经取用入口够得着** | **[常驻标记](#ul-residency--常驻--residency)** | 装配时 | **本卷** |
| **[当下可用性](#ul-current-availability--当下可用性--current-availability)** | 现在**做不做得了** | **[依赖](#ul-dependency-declaration--依赖声明--dependency-declaration)解析** | **每次 run 开始前重算** | **本卷** |

> **三层互不牵连。**一个工具可以「**在动作空间里 + 不占槽位 + 当下不可用**」——
> **三个取值各说各的**。

- **出处**：[PF-006 §4 三层](../../product/PF-006-tools-and-skills/design.md#三层能做什么--怎么够得着--现在做不做得了) · [§5.1](../../product/PF-006-tools-and-skills/design.md#51-三层正交)（rev 16）

## 怎么够得着

### UL-residency · 常驻 · Residency

> **中**：**一个工具或技能的能力身份始终对 agent 可见**，不必经取用入口去找。
> 它由**标在「装配它」这条引用上的一项[设置](capabilities-and-composition.md#ul-setting--设置--setting)**决定——
> **不是工具或技能自身的属性**；同一个工具，在一个 agent 的清单里可以常驻，在另一个里可以不常驻。
> **它标的是「看不看得见」，不是「看见的是什么」**：可见时呈现成什么是装配时的策略——
> 技能是 name 与说明进系统提示词，工具由各模型的适配按供应商的方式呈现。
> **没标常驻的不是「不能用」，是「不占位置」**——它照样在动作空间里，经取用入口够得着。
>
> **EN**: **A tool's or skill's capability identity is always visible to the agent**, with
> no need to go through the discovery entry. It is decided by **a setting on the reference
> that assembles it** — **not by any property of the tool or skill itself**; the same tool
> may be resident in one agent's manifest and not in another's. **It says whether the thing
> is seen, not what is seen**: how a resident item is rendered is assembly policy — a skill
> contributes its name and description to the system prompt, a tool is rendered by each
> model adapter in its provider's way. **Not being resident does not mean unusable; it means
> not occupying a slot** — it remains in the action space, reachable through the discovery entry.

- **形态**：属性
- **出处**：[PF-006 §4 常驻](../../product/PF-006-tools-and-skills/design.md#常驻)（rev 16）
- **别混**：**它是那份 Agent Definition 或 Plugin 上的一项设置**（引用条目长在那里），
  归[偏好类](capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category)，由持有它的各层配值——**不是工具或技能自己的设置**
- **注意**：**上下文预算是装配方的问题，工具作者根本不知道**——这就是标记挂在引用上而非资产上的理由

### UL-current-availability · 当下可用性 · Current Availability

> **中**：**一个工具或技能当下能不能真的用。**它是**[依赖声明](#ul-dependency-declaration--依赖声明--dependency-declaration)解析的结果，
> 不是一个被谁配置的开关**：**声明里每一项都有在场且可用的提供者就可用，缺一项就不可用**。
> **每次 run 开始前重算一遍**——**提供者换了或没了都要重算**。
>
> **EN**: **Whether a tool or skill can actually be used right now.** It is **the
> result of resolving its dependency declaration, not a switch anyone sets**: available
> when every item in the declaration has a present, usable provider, unavailable when any
> one is missing. It is **recomputed before every run** — **a provider being replaced or
> gone forces a recomputation**.

- **形态**：视图
- **出处**：[PF-006 §4 可用性](../../product/PF-006-tools-and-skills/design.md#可用性) · [§6.2](../../product/PF-006-tools-and-skills/design.md#62-可用性在每次-run-开始前重算)（rev 16）
- **别混**：**裸写「可用性」不作数**——那个词在别处指服务可用性、系统可用性，**与这里毫无关系**
- **别混**：与[资产禁用](circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)不同——
  **禁用是不可见**（装配时就被滤掉，agent 无从知道它存在），**不可用是可见但用了一定失败**（条目还在原位，调用必得「不可用」这一个收场）
- **注意**：**不可用不改变动作空间**——那个条目还在，只是这次够不着它背后的东西

### UL-stand-in · 替换件 · Stand-in

> **中**：**一个工具或技能[当下不可用](#ul-current-availability--当下可用性--current-availability)时，
> 占在它原位上的那份同形呈现。**它与原件**同形**——工具的名字与调用参数一致，技能的名字一致——
> **只有说明被换掉**，换成讲清「这个现在用不了，原因是什么」。
> **被调用时它不做原来那件事**：不论怎么调，**都必定给出「不可用」这一种
> [收场](execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome)**，带着原因，**正常返回，不是报错**。
> **它没有自己的身份**——身份仍是[动作空间](capabilities-and-composition.md#ul-action-space--动作空间--action-space)里原来那个条目的。
>
> **EN**: **What occupies a tool's or skill's own place, in the same shape, while it is
> unavailable.** It matches the original in shape — same name, and for a tool the same
> argument schema — and **only its description is replaced**, stating that this cannot be
> used right now and why. **Called, it never does the original work**: whatever the
> arguments, it **always yields the "unavailable" outcome**, carrying the reason, **returned
> normally, not raised as an error**. **It has no identity of its own** — the identity
> remains that of the original entry in the action space.

- **形态**：视图
- **出处**：[PF-006 §4 替换件](../../product/PF-006-tools-and-skills/design.md#替换件) · [§6.3](../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)（rev 16）
- **别混**：**它不是另一个条目**——动作空间里的条目一个没多、一个没少，变的只有那一条的说明与应答
- **注意 ①**：**不可用时装的是它，不是「不装」**——**藏起来 agent 会以为自己没这个能力，而实际只是暂时用不了**
- **注意 ②**：**说明不是闸**，agent 读到了照样可能调它——所以它的行为只有一种。
  读到「不可用」该**绕路，不该重试**

### UL-dependency-declaration · 依赖声明 · Dependency Declaration

> **中**：**一个工具或技能列出「我要成立，必须在场的东西」——一串名字。**
> 每一项指一样**可以在场、也可以不在场**的东西，**用抽象的名字指，不指具体某份[资产](capabilities-and-composition.md#ul-asset--资产--asset)**：
> [能力标识](scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)、外部服务、
> 执行环境的[设施](grounding-and-isolation.md#ul-environment-facility--环境设施--environment-facility)、存储、
> 这一次生效的那个模型的模态能力都是名字的例子，**种类不限**。
> **谁生效在那个名字上，谁就满足它。**
> **只有且，只有必需**——「或」由抽象的名字消化（同一个名字底下可以有不止一个候选提供者），
> **可有可无的东西不进声明，用的时候现探**。
>
> **EN**: **A tool or skill listing what must be present for it to hold — a list of names.**
> Each item names something that **may or may not be present**, and **names it abstractly
> rather than pointing at a specific asset**: capability identifiers, external services,
> execution-environment facilities, storages, and the modality capabilities of the effective
> model are all examples of such names, and **the kinds are not closed**. **Whoever is in
> effect under that name satisfies it.** It is **conjunctive and required-only** — disjunction
> is absorbed by the abstract name (one name may have more than one candidate provider), and
> **anything a tool can do without stays out of the declaration and is probed at use**.

- **形态**：属性
- **出处**：[PF-006 §4 依赖](../../product/PF-006-tools-and-skills/design.md#依赖) · [§6.4](../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析)（rev 16）
- **别混**：这里的「**外部服务**」**不是 [PF-002 排除掉的那个 Service](capabilities-and-composition.md#ul-asset--资产--asset)**——
  那条排除的是 Cordis 的运行时概念。**指前者时必须写全 `Cordis service`**
- **注意**：**声明不是免费的**——每多一项就多一个可能不被满足的前提，
  它决定的是[当下可用性](#ul-current-availability--当下可用性--current-availability)，而不是那一次执行成不成
- **别混**：与[资产组合](capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition)不同——
  组合说的是**由什么构成**，依赖说的是**还需要什么在场**
- **注意**：**表达不出「或」就只能按最严的算**，好用的东西会被无谓地判成不可用
- **注意**：**带脚本的技能同样要声明**它需要什么设施——不给它地方声明，就只能默认塞给宿主机，**绕过安全判断**

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
