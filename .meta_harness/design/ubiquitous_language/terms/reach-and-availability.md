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

- **出处**：[PF-006 §4 三层](../../product/PF-006-tools-and-skills/design.md#三层能做什么--怎么够得着--现在做不做得了) · [§5.1](../../product/PF-006-tools-and-skills/design.md#51-三层正交)（rev 24）

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
- **出处**：[PF-006 §4 常驻](../../product/PF-006-tools-and-skills/design.md#常驻)（rev 24）
- **别混**：**它是那份 Agent Definition 或 Plugin 上的一项设置**（引用条目长在那里），
  归[偏好类](capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category)，由持有它的各层配值——**不是工具或技能自己的设置**
- **注意**：**上下文预算是装配方的问题，工具作者根本不知道**——这就是标记挂在引用上而非资产上的理由

### UL-current-availability · 当下可用性 · Current Availability

> **中**：一个已纳入会话的工具、技能或 MCP 能力当下能不能使用的求值结果：当前选入和治理条件允许，且必要实现及依赖成立，才可用。每次尝试开始核对，并在后续使用时遵守已经生效的变化；不可用不删除会话已知身份。
>
> **EN**: The evaluated usability of an admitted tool, skill or MCP capability: current selection and governance must permit it, and required implementations and dependencies must hold. It is checked at attempt start and subsequent use respects effective changes. Unavailability does not erase the session’s known identity.

- **形态**：视图
- **出处**：[PF-006 §4 可用性](../../product/PF-006-tools-and-skills/design.md#可用性) · [§6.2](../../product/PF-006-tools-and-skills/design.md#62-可用性在每次-run-开始前重算)（rev 24）
- **别混**：禁用是治理输入，当下可用性是求值结果；禁用可使已知条目不可用，不能使从未合法纳入的条目凭空可见。执行权限准入仍单独适用。

### UL-stand-in · 替换件 · Stand-in

> **中**：**一个工具或技能[当下不可用](#ul-current-availability--当下可用性--current-availability)时，
> 占在它原位上的那份同形呈现。**它与原件**同形**——工具的名字与调用参数一致，技能的名字一致——
> 相对会话最后合法采用的定义形状，**只有说明被换掉**，换成讲清「这个现在用不了，原因是什么」。
> **被调用时它不做原来那件事**：不论怎么调，**都必定给出「不可用」这一种
> [收场](execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome)**，带着原因，**正常返回，不是报错**。
> **它没有自己的身份**——身份仍是[动作空间](capabilities-and-composition.md#ul-action-space--动作空间--action-space)里原来那个条目的。
>
> **EN**: **What occupies a tool's or skill's own place, in the same shape, while it is
> unavailable.** It matches the original in shape — same name, and for a tool the same
> argument schema — and relative to the last lawfully adopted definition **only its description is replaced**, stating that this cannot be
> used right now and why. **Called, it never does the original work**: whatever the
> arguments, it **always yields the "unavailable" outcome**, carrying the reason, **returned
> normally, not raised as an error**. **It has no identity of its own** — the identity
> remains that of the original entry in the action space.

- **形态**：视图
- **出处**：[PF-006 §4 替换件](../../product/PF-006-tools-and-skills/design.md#替换件) · [§6.3](../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)（rev 24）
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
- **出处**：[PF-006 §4 依赖](../../product/PF-006-tools-and-skills/design.md#依赖) · [§6.4](../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析)（rev 24）
- **别混**：这里的「**外部服务**」**不是 [PF-002 排除掉的那个 Service](capabilities-and-composition.md#ul-asset--资产--asset)**——
  那条排除的是 Cordis 的运行时概念。**指前者时必须写全 `Cordis service`**
- **注意**：**声明不是免费的**——每多一项就多一个可能不被满足的前提，
  它决定的是[当下可用性](#ul-current-availability--当下可用性--current-availability)，而不是那一次执行成不成
- **别混**：与[资产组合](capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition)不同——
  组合说的是**由什么构成**，依赖说的是**还需要什么在场**
- **注意**：**表达不出「或」就只能按最严的算**，好用的东西会被无谓地判成不可用
- **注意**：**带脚本的技能同样要声明**它需要什么设施——不给它地方声明，就只能默认塞给宿主机，**绕过安全判断**

### UL-session-asset-registry · 会话资产注册表 · Session Asset Registry

> **中**：会话保存并向消费者提供某类资产当前采用结果的视图。Tool、Skill、MCP 的已知身份保留；当前定义数据、实现选择与不可用原因可更新。reload 更新所指定来源的采用结果，不清空已知能力身份。人的斜杠命令入口仍按自己的可见性与撤权规则更新，不继承能力身份单调性。
>
> **EN**: A session view exposing the adopted result for an asset category. Known Tool, Skill and MCP identities are retained while current definition data, implementation selection and unavailability reasons may change. Reload updates its selected sources without erasing known capability identities. Human slash-command entry points retain their own visibility and revocation rules rather than capability-identity monotonicity.

- **形态**：视图
- **出处**：[PF-002 §4 会话认得哪些命令，什么时候变](../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变) ·
  [§4「谁可以使用它」是各类资产共用的一项权限](../../product/PF-002-assets-settings-and-permissions/design.md#谁可以使用它是各类资产共用的一项权限)（rev 32） ·
  [PF-016 §5.7 人要做的事分三族](../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族)（rev 13）
- **别混**：不是历史装配清单，不是资产所有权目录；保留历史可见身份不授予继续使用的权利。

### UL-governance-center-health-check · 治理中心体检 · Governance Center Health Check

> **中**：[治理中心](grounding-and-isolation.md#ul-governance-center--治理中心--governance-center)关于「我此刻在不在、能不能答」的自述，
> 从部署事实现算、不另存。**公开部分恰三样**——在不在、[治理中心标识](grounding-and-isolation.md#ul-governance-center-identifier--治理中心标识--governance-center-identifier)、版本——
> 任何够得到中心的人**登录之前就能看，且不受版本核对那一关挡**；完整部分（起来的时刻、数据所在够不够得着、
> [部署密钥](grounding-and-isolation.md#ul-deployment-key--部署密钥--deployment-key)在不在完整不完整、时钟正不正常、
> 每一项[部署参数](grounding-and-isolation.md#ul-deployment-parameter--部署参数--deployment-parameter)的值）
> 只有[运维者](subjects-and-ownership.md#ul-deployment-operator--运维者--deployment-operator)在中心所在的机器上看得到。
> **两部分都不含任何治理事实，不含任何秘密的值。**正文简称「中心体检」。
>
> **EN**: A governance center's own statement of "am I up, can I answer", computed from deployment
> facts and not stored separately. **The public part is exactly three things** — up or not, the
> governance center identifier, the version — readable **before login** by anyone who can reach the
> center and **not blocked by the version check**; the full part (when it started, whether its data
> is reachable, whether the deployment key is present and complete, whether the clock is sane, the
> value of each deployment parameter) is visible only to the deployment operator on the center's own
> machine. **Neither part carries any governance fact or any secret value.** Product text shortens
> it to "center health check".

- **形态**：视图
- **出处**：[PF-017 §4 中心体检](../../product/PF-017-governance-center-as-deployable-application/design.md#中心体检) ·
  [§6.17](../../product/PF-017-governance-center-as-deployable-application/design.md#617-体检只说部署不说里面有谁)（rev 7）
- **⚠️ 别混**：与 [PF-016 本机族的「体检」](../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族)是**同一个词的两头**：
  那边是客户端自查「能不能连上中心」，这边是中心自述「我在不在」；**取同一个词是有意的**，两头合起来才是「这条路通不通」
- **注意**：不是[当下可用性](#ul-current-availability--当下可用性--current-availability)——那是一份能力的依赖解析结果，这是一次部署的自述

### UL-governance-center-reachability · 治理中心可达性 · Governance Center Reachability

> **中**：一处[会话据点](grounding-and-isolation.md#ul-session-base--会话据点--session-base)对它所属的
> [治理中心](grounding-and-isolation.md#ul-governance-center--治理中心--governance-center)**此刻在不在应答**的观察：
> 最近一次与中心的往来拿到了中心的一份答复，就是可达；落在「问不到」——没有拿到中心的答复——就是不可达。
> **答复说了什么不影响它**：中心答「不认你这个登录状态」「这件事此刻答不了」，照样是可达。
> **它只是一个观察，不作任何准入依据**：可达不说明成员资格有效、登录状态作数，不可达也不说明它们无效；
> 中心不可达时，已经执行的 Run 继续；新 Run 开始前仍须确认登录有效。
>
> **EN**: A session base's observation of **whether the governance center it belongs to is answering
> right now**: reachable when the latest exchange with the center brought back an answer from it,
> unreachable when the latest exchange ended in "could not ask" — no answer from the center came back.
> **What the answer said does not matter**: a center replying "that login state is not accepted" or
> "this cannot be answered now" is reachable. **It is an observation only and admits nothing**: being
> reachable does not mean a membership is valid or a login state still counts, and being unreachable does
> not mean they are invalid; a run already under way can continue while the center is unreachable. A new run still requires confirmation of a valid login before it starts.

- **形态**：属性
- **出处**：[PF-016 §6.17](../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活) ·
  [§5.6 哪几件事必须现读](../../product/PF-016-cli-tui-delivery-surface/design.md#哪几件事必须现读)（rev 13） ·
  [PF-017 §4 中心体检](../../product/PF-017-governance-center-as-deployable-application/design.md#中心体检)（rev 7）
- **⚠️ 别混 ①**：**不是[治理中心体检](#ul-governance-center-health-check--治理中心体检--governance-center-health-check)**——
  体检是中心自述「我在不在、能不能答」；这一条是据点这一头的观察。体检答「数据所在够不着」，中心照样在应答，照样可达
- **别混 ②**：**裸写「可达性」不作数**——形式检查里的可达性说的是某个状态走不走得到，
  [当下可用性](#ul-current-availability--当下可用性--current-availability)说的是一样能力此刻用不用得了，都与这一条无关
- **注意 ①**：**它变了不让任何东西停下**——中心问不到不是让据点上任何在途工作停的理由；
  再连上之后，那几件必须现读的事按新读到的重新算（[PF-016 §6.17](../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)）
- **注意 ②**：规格层（`capability.center-connection` v2，本能力在规格里叫「中心连接」）把它分成三态：
  多出的「尚未判定」是据点这一侧起来之后还没有任何一次往来有结果——**既不当可达，也不当不可达**

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
