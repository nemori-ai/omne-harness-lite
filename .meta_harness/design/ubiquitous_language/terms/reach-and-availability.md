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

- **出处**：[PF-006 §4 三层](../../product/PF-006-tools-and-skills/design.md#三层能做什么--怎么够得着--现在做不做得了) · [§5.1](../../product/PF-006-tools-and-skills/design.md#51-三层正交)（rev 7）

## 怎么够得着

### UL-residency · 常驻 · Residency

> **中**：**一个工具或技能，始终出现在系统提示词里。**它由一个**标在「装配它」这条引用上
> 的标记**决定——**不是工具或技能自身的属性**。同一个工具，在一个 agent 的清单里可以常驻，
> 在另一个里可以不常驻。**没标常驻的不是「不能用」，是「不占位置」**——
> 它照样在动作空间里，经取用入口够得着。
>
> **EN**: **A tool or skill that always appears in the system prompt.** It is set by a
> marker **on the reference that assembles it**, **not by any property of the tool or
> skill itself** — the same tool may be resident in one agent's manifest and not in
> another's. **Not being resident does not mean unusable; it means not occupying a
> slot** — it remains in the action space, reachable through the discovery entry.

- **出处**：[PF-006 §4 常驻](../../product/PF-006-tools-and-skills/design.md#常驻)（rev 7）
- **别混**：**它不是[设置](capabilities-and-composition.md#ul-setting--设置--setting)**，不走层级求值——
  设置是资产的属性，**而这个标记描述的是一条引用关系**
- **注意**：**上下文预算是装配方的问题，工具作者根本不知道**——这就是标记挂在引用上而非资产上的理由

### UL-current-availability · 当下可用性 · Current Availability

> **中**：**一个工具或技能当下能不能真的用。**它是**[依赖](#ul-dependency-declaration--依赖声明--dependency-declaration)解析的结果，
> 不是一个被谁配置的开关**，且**每次 run 开始前重算一遍**——
> 因为它依赖的东西（外部服务、执行环境、其他工具）本身就在变。
>
> **EN**: **Whether a tool or skill can actually be used right now.** It is **the
> result of dependency resolution, not a switch anyone sets**, and it is
> **recomputed before every run** — because the things it depends on (external
> services, execution environments, other tools) are themselves changing.

- **出处**：[PF-006 §4 可用性](../../product/PF-006-tools-and-skills/design.md#可用性) · [§6.2](../../product/PF-006-tools-and-skills/design.md#62-可用性在每次-run-开始前重算)（rev 7）
- **别混**：**裸写「可用性」不作数**——那个词在别处指服务可用性、系统可用性，**与这里毫无关系**
- **别混**：与[资产禁用](circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)不同——
  禁用是**人的管理决定**，不可用是**依赖解析算出来的事实**
- **注意**：**不可用不改变动作空间**——那个条目还在，只是这次够不着它背后的东西

### UL-stand-in · 替换件 · Stand-in

> **中**：**当一个工具或技能不可用时，装在它位置上的那个东西。**它**同名**，占同样的位置，
> 但被调用时**不执行原来的事**，而是明确告诉 agent：**这个现在用不了，原因是什么**。
> **它是正常的返回，不是错误。**
>
> **EN**: **What is installed in the place of a tool or skill that is unavailable.** It
> **carries the same name** and occupies the same position, but when called it **does
> not do the original thing** — it states plainly that this is currently unusable and
> why. **It returns normally; it is not an error.**

- **出处**：[PF-006 §4 替换件](../../product/PF-006-tools-and-skills/design.md#替换件) · [§6.3](../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)（rev 7）
- **注意 ①**：**不可用时装的是它，不是「不装」**——**藏起来 agent 会以为自己没这个能力，而实际只是暂时用不了**
- **注意 ②**：它的应答对应[六种收场里的「不可用」](execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome)——
  **agent 该绕路，不该重试**

### UL-dependency-declaration · 依赖声明 · Dependency Declaration

> **中**：**一个工具或技能声明「我要成立，还需要什么」。**三类：**其他工具**（技能会声明）、
> **外部服务**、**执行环境的[设施](grounding-and-isolation.md#ul-environment-facility--环境设施--environment-facility)**。
> 它**不是一串平铺的清单，要能表达关系**——哪些是且、哪些是或、哪些必需、哪些可选。
>
> **EN**: **A tool or skill declaring what else it needs in order to hold.** Three
> kinds: **other tools** (skills declare these), **external services**, and
> **execution-environment facilities**. It is **not a flat list — it must express
> relations**: which are conjunctive, which disjunctive, which required, which optional.

- **出处**：[PF-006 §4 依赖](../../product/PF-006-tools-and-skills/design.md#依赖) · [§6.4](../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析)（rev 7）
- **别混**：这里的「**外部服务**」**不是 [PF-002 排除掉的那个 Service](capabilities-and-composition.md#ul-asset--资产--asset)**——
  那条排除的是 Cordis 的运行时概念。**指前者时必须写全 `Cordis service`**
- **别混**：与[资产组合](capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition)不同——
  组合说的是**由什么构成**，依赖说的是**还需要什么在场**
- **注意**：**表达不出「或」就只能按最严的算**，好用的东西会被无谓地判成不可用
- **注意**：**带脚本的技能同样要声明**它需要什么设施——不给它地方声明，就只能默认塞给宿主机，**绕过安全判断**

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
