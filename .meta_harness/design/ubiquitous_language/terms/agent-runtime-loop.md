# Agent 运行时闭环

**这一卷回答：一段协作怎么从触发走到收束，又怎么回到会话。**

```text
        ┌────────── 会话（纯数据、治理边界，跨多次运行存活）──────────┐
        │                                                              │
   触发 ─→ 运行 ──→ 装配 ──→ 装配清单 ──→ agent runtime ──→ 收束      │
        │          （求值）  （数据，可复用）  （协程，活的）          │
        │                            ↑                                 │
        │            注入：上下文 / 执行环境 / 权限                    │
        │                                                              │
        └── 协程没了，会话还在：记录、授权、成本、血缘都留在这一层 ────┘
```

> **这一卷里只有一样东西是「活的」：[agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)。**
> 会话与运行是**治理概念**，装配是**一个动作**，清单是**那个动作的求值结果**——
> 三者都不占用计算资源，也都不会「停下来」。

**收在这里的是这个闭环上的每一环**，以及它们各自的归属。
**agent 由什么构成**归[能力与构成](capabilities-and-composition.md)，
**动作落到哪里**归[落地与隔离](grounding-and-isolation.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

> **本卷有七条不归任何一个 topic**——它们是跨全链的治理概念，由产品负责人直接裁决：
>
> - [会话](#ul-session--会话--session) · [运行](#ul-run--运行--run) · [触发](#ul-trigger--触发--trigger) ·
>   [执行尝试](#ul-run-attempt--执行尝试--run-attempt) · [会话内单活跃](#ul-single-active-execution--会话内单活跃--single-active-execution)
>   → [现行词义](../index.md)
> - [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime) ·
>   [取消跟着宿主走](#ul-cancellation-follows-host--取消跟着宿主走--cancellation-follows-host)
>   → [现行词义](../index.md)

## 这一卷最硬的一条

### UL-single-active-execution · 会话内单活跃 · Single Active Execution

> **中**：**一个会话，在同一时刻，至多有一个活跃的[运行](#ul-run--运行--run)，
> 也至多有一个活跃的 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)。**
> 「同时还有别的事在后台跑」不违反它——那是**同一个运行内部**的事。
>
> **EN**: **Within one session, at any moment, there is at most one active run and at
> most one active agent runtime.** Work continuing in the background does not
> violate this — that belongs **inside** the one active run.

- **形态**：规则
- **出处**：[现行词义](../index.md)（产品负责人 2026-09-18 直接裁决）；
  **主语于 2026-09-20 由「agent runtime」换成 agent runtime**，见 [现行词义](../index.md)
- **⚠️ 它有明确的失效条件**：**开始设计支持 GPT-Live 时重新裁决**，在那之前一律遵循。
  [GPT-Live 把语音层与推理层拆成两个模型](../../product.0.0.1.legacy/PF-009-context-message-types/design.md)，
  **届时「谁在活跃」会有第二个答案**
- **注意**：这条**不是性能约束，是治理约束**——「这个会话现在在干什么」**必须只有一个答案**，
  否则成本、失败与收束都算不清

## 会话这一层

### UL-session · 会话 · Session

> **中**：**一段持续协作的耐久身份与归属边界**。这段协作里产生的一切——
> [记录](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md)、运行、会话级的设置与授权、
> 落地的执行环境、花掉的成本——**都归到它名下**。
> 它**跨多次运行存活**，且**不要求有人说过话**：定时触发、外部消息送达、
> 系统发起，**同样开一个会话**。
>
> **EN**: **The durable identity and ownership boundary of one stretch of
> collaboration.** Everything it produces — the log, the runs, the session-scoped
> settings and authorizations, the execution environments landed on, the cost
> incurred — **is attributed to it**. It **outlives any single run**, and **it does
> not require that anyone has spoken**: a schedule firing, an inbound message or a
> system-initiated work can also create a session.

- **形态**：对象
- **出处**：[现行词义](../index.md)（产品负责人 2026-09-18 直接裁决，定义由 PM 起草）
- **别混 ①**：**不是[终端会话](grounding-and-isolation.md#ul-terminal-session--终端会话--terminal-session)**。
  `Shell()` 开的那个是**执行环境里的东西**，两者毫无关系
- **别混 ②**：**它是聚合，不是容器**——会话**不包含**消息与运行，而是**指向**它们。
  记录是独立的 append-only 日志，运行有自己的身份。**会话拥有的是边界，不是内容物**
- **注意 ①**：它就是[四个作用域层](scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)里那个**「本次协作」**——
  会话级的设置、权限、[会话授权上下文](../../product.0.0.1.legacy/PF-007-meta-capabilities/design.md#会话授权上下文)、
  [会话级沙箱](grounding-and-isolation.md#ul-session-sandbox--会话级沙箱--session-scoped-sandbox)都挂在它上面，**且一律不外溢**
- **注意 ②**：**它比 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime) 长寿**——
  协程可被取消、可重新起，没了之后**会话还在、历史还在、认定的定义还在**。
  **它自己不是活物**：它是纯数据、治理性质的概念，不占用计算资源，也不会「停下来」
- **注意 ③**：**没有「会话结束」这回事。****没有删除会话的概念**，所以严格意义上
  它不会终止。它走的是[四个状态](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#会话的生命周期)——
  **创建/初始化 · 运行/活跃 · 休眠 · [归档](#ul-session-archival--会话归档--session-archival)**，
  其中**运行与休眠来回切换没有上限**，**归档可以撤销**。
  **凡是要挂在「这段协作到此为止」上的东西，锚点都是归档**：
  [未完成的工具执行随之收场](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#65-工具执行有自己的运行时绑定在-session-上)就是其中之一。
  **注意[会话级沙箱的销毁不在此列](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存)**——
  它挂的是**沙箱自己的最大连续存活时间**，那一节同时明写「**会话可以无限期存在**」
- **注意 ④**：**它有两种性质**——[主会话](#ul-primary-session--主会话--primary-session)
  与[子会话](#ul-child-session--子会话--child-session)。两者**都完整地是会话**，
  区别只在关系里扮演的角色
- **注意 ⑤**：**它归哪个租户，在创建那一刻就定了**——它持有
  [创建那一刻的当前租户身份](subjects-and-ownership.md#ul-current-tenant-identity--当前租户身份--current-tenant-identity)，
  [此后不随这个账号切换到别的租户身份而变](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)
- **注意 ⑥**：**它指向哪条模型，是它的[选中模型](capabilities-and-composition.md#ul-selected-model--选中模型--selected-model)**；
  这个取值的每一次改变都以一条[模型切换](capabilities-and-composition.md#ul-model-switch--模型切换--model-switch)事实记在[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)里，
  [不是一个当场改掉的开关](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#66-切换先是一条要被记录的事实)（PF-013 rev 12）

### UL-primary-session · 主会话 · Primary Session

> **中**：**不是任何会话之子会话的那个会话。**它是这段协作的根：
> **主会话之间生命周期相互独立**，谁也不因为另一个而开始或停止。
>
> **EN**: **A session that is not a child session of any other.** It is the root of its
> stretch of collaboration: **primary sessions are mutually independent in lifecycle** —
> none begins or ends because another did.

- **形态**：变体（父：[会话](#ul-session--会话--session)）
- **出处**：[现行词义](../index.md)（产品负责人 2026-09-21 直接裁决，定义由 PM 起草）
- **注意 ①**：**它是[会话](#ul-session--会话--session)的一种性质，不是另一种对象。**
  主会话与[子会话](#ul-child-session--子会话--child-session)**都完整地是会话**——
  都有耐久身份、归属边界、自己的日志，**只是在关系里扮演的角色不同**
- **注意 ②**：**[`handoff` 派出去的 agent 落在这里](interaction-and-dispatch.md#ul-subagent--子-agent--subagent)**——
  它「有独立主会话身份」，所以它**不是**子 agent，它的会话是主会话
- **注意 ③**：**只有主会话的 agent 之间适用
  [通信规则二](interaction-and-dispatch.md#ul-inter-agent-communication--agent-间通信--inter-agent-communication)**
  （独立主会话身份 ∧ **会话仍未被归档** ∧ 同租户）

### UL-child-session · 子会话 · Child Session

> **中**：**由某个会话的 agent 通过 `delegate` 或 `spawn` 创建出的
> [子 agent](interaction-and-dispatch.md#ul-subagent--子-agent--subagent) 所在的那个会话。**
> 它由**创建**这个动作确立，**不由历史确立**——`spawn` 不是 `fork`，
> **它不继承父会话的日志**：`spawn` 交出去的是**派发那一刻组装出来的那份上下文的副本**，
> 那份副本是**它自己日志里的起始输入记录**。
>
> **EN**: **The session of a subagent that some session's agent created via `delegate` or
> `spawn`.** It is established by **the act of creation, not by history**: `spawn` is not
> `fork`, and **it inherits none of the parent's session log** — what `spawn` hands over is
> **a copy of the context assembled at the moment of dispatch**, which becomes **the opening
> input entry in the child's own log**.

- **形态**：变体（父：[会话](#ul-session--会话--session)）
- **出处**：[现行词义](../index.md)（产品负责人 2026-09-21 直接裁决，定义由 PM 起草）
- **别混 ①**：**不是 fork。**fork 复制或引用一段既有历史；它的历史**从那份副本这一条开始**，
  **父的日志不被指向、不被拷贝**，**派发之后父那边发生的事它看不见**。
  两个会话的**会话日志、投影与 runtime context 快照在存储上都不共享节点**（无指针引用）——
  **但那是存储约束，不是访问约束**：跨会话取数据照常经工具能力与租户权限进行
- **别混 ②**：**「子会话」是会话，「[子 agent](interaction-and-dispatch.md#ul-subagent--子-agent--subagent)」是 agent。**
  前者是后者所在的那个会话
- **注意 ①**：**嵌套层级不受约束**——子会话的 agent 可以再创建它自己的子会话
- **注意 ②**：**通信拓扑是收窄的**：它的 agent **只能与自己的直接 parent、
  或它自己再创建出的子会话的 agent** 通信；**兄弟之间、隔代之间都不可**。
  其中**子 → 直接父**这一向是 [现行词义](../index.md) 放开的，
  用途是**确认事实、澄清需求**这类子主动发起的求助
- **注意 ③**：**它的会话不因交回[报告](interaction-and-dispatch.md#ul-dispatch-report--派发报告--dispatch-report)而终结**——
  报告终结的是那次派发

### UL-session-archival · 会话归档 · Session Archival

> **中**：**把一段协作收起来的那个动作，以及它之后所处的那个状态。**
> 它是**唯一一个「这段协作到此为止」的锚点**——
> [没有删除会话这回事，所以也没有「会话结束」这回事](#ul-session--会话--session)。
> **它有两条来路**：**租户手动归**，或**系统按一个出厂配置的时限自动归**。
> **归档本身可以撤销**，撤销后会话回到休眠、历史一条不少；
> **但它连带做的三件事不可逆**：子会话级联被归档、未完成的工具执行被中断、模型响应被中断。
>
> **EN**: **The act of putting a stretch of collaboration away, and the state it then sits
> in.** It is **the one anchor for "this collaboration is over"** — there is no deleting a
> session, hence no "session end". It arrives **two ways**: **the tenant archives it**, or
> **the system does so once a factory-configured time limit is reached**. **Archival itself is
> reversible**: undoing it returns the session to dormant with its history intact. **The
> three things it does on the way in are not**: child sessions are archived transitively,
> unfinished tool executions are interrupted, and the model response in flight is
> interrupted.

- **自动触发**：自身及归档会级联影响的子会话均无未结束 Run、活跃模型／工具执行及待处理任务，连续空闲达到出厂时限（默认 30 天）；开展新工作终止旧计时，撤销归档后重新计时，进程重启不重置。
- **输入处置**：归档取消待处理任务并保留历史；归档期间拒绝新任务，迟到执行事实只留痕、不入队，撤销归档不自动恢复已取消任务。
- **形态**：过程
- **出处**：[PF-015 §4 会话归档](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#会话归档) ·
  [§6.2](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#62-归档有两条来路人手动或到期自动) ·
  [§6.3](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#63-归档先停活儿再落状态)（rev 21）
- **别混 ①**：**不是删除。**会话的身份与历史一直在，**归档只让它从眼前收起来**
- **别混 ②**：**不是[会话级沙箱的销毁](grounding-and-isolation.md#ul-session-sandbox--会话级沙箱--session-scoped-sandbox)。**
  那挂的是**沙箱自己的最大连续存活时间**，[同一节明写「会话可以无限期存在」](../../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存)——
  **沙箱没了，会话照活**
- **别混 ③**：**不是[运行终态](#ul-run-terminal-state--运行终态--run-terminal-state)。**
  那三个终态是 **Run 的**，一次运行收场不等于这段协作收场
- **注意 ①**：**它只往下传，不往上传**——子会话被归档**不会**带走它的父
- **注意 ②**：**撤销归档只还状态，不还工作**：被中断的接不回来，
  被级联归档的子会话**要各自单独撤销**
- **注意 ③**：**它不动[授权](interaction-and-dispatch.md#ul-session-authorization-context--会话授权上下文--session-authorization-context)。**
  授权是数据，**归档不丢**——「工作被取消」推不出「授权也没了」
- **注意 ④**：**自动归的档和手动归的档，后果一模一样**——
  同样级联、同样中断、同样可撤销。**没有「系统归的比较轻」这回事**
- **注意 ⑤**：**那条时限是[出厂配置，默认 30 天](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#62-归档有两条来路人手动或到期自动)**，
  **不是每个会话各设一个**；[租户改不改得动尚未裁决](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md)

### UL-session-type · 会话类型 · Session Type

> **中**：**一个[会话](#ul-session--会话--session)主要是用来干什么的。**
> 它在会话建立时，**由用户选定的 [AgentDefinition](../../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md) 算出来**，
> **此后不随来源变化**。
>
> **EN**: **What a session is mainly for.** It is **computed at creation from the
> AgentDefinition the user picked**, and **never changes afterwards**, whatever later
> happens to that definition.

- **形态**：属性
- **出处**：[PF-015 §4 会话类型](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#会话类型) · [§5.3](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#53-会话类型怎么算出来)（rev 21）
- **⚠️ 别混**：**它不是一道闸门。**它**不参与**
  [放行三元组](../../product.0.0.1.legacy/PF-007-meta-capabilities/design.md#611-ask通向人)，
  也不收窄任何[权限](capabilities-and-composition.md#ul-permission--权限--permission)——
  **一个 `coding` 会话不会因为类型就做不了别的事**
- **注意 ①**：**是算出来的，不是绑上去的。**它与来源之间是一条**映射**，
  映射改了**只影响新建的会话**，已存在的一个都不变
- **注意 ②**：**当前五类只能出厂增补**，租户不能自定义——
  [因为租户能自定义的是子 agent](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#为什么类型只能出厂加)
- **注意 ③**：**它唯一的用途是判断「用户此刻聊的，和这个会话本来是干什么的，对不对得上」**——
  对不上时[只提醒，不阻拦](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#66-跑题只提醒不阻拦)

### UL-session-run-mode · 会话运行模式 · Session Run Mode

> **中**：**这个[会话](#ul-session--会话--session)里，「本该问人」的那一刻改怎么办。****恰好三档**：
> **`never`**——一律当作被拒，**不问任何人**；
> **`auto_permission`**——**拿已经形成的[授权表达](interaction-and-dispatch.md#ul-authorization-expression--授权表达--authorization-expression)算**，算不出来**就问人**；
> **`bypass-permissions`**——**直接放行**。
> **它不决定哪些动作要问人**，只决定**问不成的那一刻**怎么处置。
>
> **EN**: **What this session does at the moment something would otherwise be put to a
> person.** Exactly three: **`never`** — treat every such moment as a refusal, asking no
> one; **`auto_permission`** — **compute from the authorization expressions already on hand**, and
> **ask a person when they do not settle it**; **`bypass-permissions`** — let it through. **It
> does not decide which actions need asking**, only what happens at that moment.

- **形态**：属性
- **出处**：[PF-015 §4 会话运行模式](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#会话运行模式)（rev 21）；
  它在[放行四步](../../product.0.0.1.legacy/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)（rev 25）里是第 ④ 步
- **⚠️ 别混**：**`auto_permission` 决定「准不准」，执行环境那一维的 `auto_place` 决定「落在哪」**——
  两者会在同一次执行里一前一后出现。**两个名字特意分开取，就是为了不撞**
  （`auto_place` 是[执行环境权限](grounding-and-isolation.md#ul-execution-environment-permission--执行环境权限--execution-environment-permission)的一档，归 PF-005）。
  另外**上游有一个叫 `auto` 的档，语义是「不问人、改问模型」**，
  **我们这一档从不替人作判断**；`never` 与 `bypass-permissions` 两档则与上游同义
- **注意 ①**：**`auto_permission` 是有闭环的那一档**——问人的答案**落成新的[授权表达](interaction-and-dispatch.md#ul-authorization-expression--授权表达--authorization-expression)**，
  下一次同样的事就算得出来了。**「同一件事不必问第二遍」就是这个闭环**
- **注意 ②**：**`bypass-permissions` 跳过的是「问」，不是「禁」**——
  **任何层的明确禁止，它一样翻不了案**
- **注意 ③**：**`never` 连带一个后果**——
  [`Ask().request_approval` 在这个会话里不可用](../../product.0.0.1.legacy/PF-007-meta-capabilities/design.md#57-权限能关掉一条命令关不掉一扇门)，
  **而 `Ask()` 这扇门还在**，`never` 本身不禁 `ask`，其交互可用性另受会话协作模式约束
- **维度**：本词专指权限维度，运行时可变；不包括独立的[会话协作模式](#ul-session-collaboration-mode--会话协作模式--session-collaboration-mode)。
- **注意 ④**：**它往子会话传**——[父是 `never`，子的 `request_approval` 一并不可用](../../product.0.0.1.legacy/PF-007-meta-capabilities/design.md#58-子不得宽于父)

### UL-session-collaboration-mode · 会话协作模式 · Session Collaboration Mode

> **中**：这个会话中，人与 agent 以什么方式共同推进工作的运行期属性。当前有两种取值：`co-work` 强调与人的协作共创，开启 Ask()，不启用该模式附加的目标完成检查；`auto-drive` 强调围绕目标的智能体自驱执行，关闭 Ask()，启用防止目标未完成就正常收束的检查。可在会话运行期间切换，与权限维度的会话运行模式、执行环境维度正交。
>
> **EN**: A runtime property of a session describing how the person and agent advance work together. It currently has two values: `co-work`, emphasizing collaborative creation with the person, with Ask() enabled and without the mode-added goal-completion check; and `auto-drive`, emphasizing goal-directed, self-driven execution, with Ask() disabled and a check preventing normal completion while the goal remains unmet. It can change during the session and is orthogonal to the permission dimension of Session Run Mode and to the execution-environment dimension.

- **形态**：属性
- **出处**：[PF-015 §4 会话协作模式](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#会话协作模式)（rev 21）
- **别混**：不是会话用途类型、权限模式或执行环境落点；切成 auto-drive 不自动授予权限，切成 co-work 也不据此变成只读。
- **注意**：Ask() 的开启仍受权限模式约束；关闭不移除或替换 meta 资产。检查的承载、装卸与切换细节归技术设计；会话类型强制要求的完成检查不随 co-work 取消。初始模式归创建入口的产品规则。

### UL-run · 运行 · Run

> **中**：**一次逻辑上的执行请求及其结果**，是**成本、失败与收束的归属单位**。
> 它附着在**恰好一个会话**上。
> **它开始于「有仍具待处理资格、还没被[承接](#ul-input-claim--承接--input-claim)的输入，而且没有未终结的运行，并满足当前准入与适用的登录确认条件」，
> 结束于落一个[运行终态](#ul-run-terminal-state--运行终态--run-terminal-state)**——没有第二种结束方式。
> 中间想了几轮、调了几次工具、转没转后台，**都是它内部的事**。
>
> **EN**: **One logical request to execute, together with its outcome** — the unit to
> which cost, failure and conclusion are attributed. It attaches to **exactly one
> session**. It begins with an eligible unclaimed input, no unfinished Run and satisfied admission conditions, including the applicable login confirmation.
> Reaching a Run terminal state is the only way it ends. How
> many turns of thinking, how many tool calls, whether anything moved to the
> background — **all of that is internal to it**.

- **形态**：对象
- **出处**：[现行词义](../index.md)（产品负责人 2026-09-18 直接裁决，定义由 PM 起草）；
  **边界那两句来自 2026-09-20 与 2026-09-22 的裁决**，见 [PF-012 §4 Run](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#run)（rev 25）
- **别混 ⓪**：**它是纯粹的逻辑概念**。「一次 Run」不对应任何一段进程、一个连接或一次请求——
  **换一个 agent runtime 接着跑，还是这一个**；**队列没空就退不出去，哪怕模型已经没话说了**
- **别混 ⓪′**：**「未终结」不等于「有一副 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime) 活着」**——
  [等人的时候协程可以先被回收，而这个运行还好端端悬在日志上](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#run-未终结不等于有一副-agent-runtime-活着)
- **别混 ①**：**它是逻辑的，不是物理的**——一次 Run 可能经历多次[执行尝试](#ul-run-attempt--执行尝试--run-attempt)。
  **「重跑一次」与「同一次跑的第二次尝试」必须分得开**，否则成本与失败都算错
- **别混 ②**：Run 的**收束**与[一次工具执行的收场](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)**不是一回事**——
  后者是工具那一层的六种，**粒度差着好几层**。**裸写「收场」不作数**
- **注意 ①**：**它不拥有记录**——它往会话的日志里写，**日志归会话**
- **注意 ②**：**它不拥有执行体**——推进它的是 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)，
  而**一次 Run 可能先后由好几个协程推进**（会话一侧把每一段推进记为一次[尝试](#ul-run-attempt--执行尝试--run-attempt)）
- **注意 ②′**：新 Run 登录确认不等于每个 Attempt 的开始条件；已经执行中的 Run 不因登录到期停止。原合法动作和结果收场沿原准入与运行控制规则。
- **注意 ③**：**怎么被驱动、怎么推进、怎么收束、怎么中断**，归
  [PF-012](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/README.md)；本条只定**它是什么、边界在哪**
- **注意 ④**：**终结之后不再为它发起新动作，但终结前已发起的那些，账迟到了照样归它**，并标明是迟到的——
  [I-11](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)；否则「按运行汇总成本」算不全

### UL-trigger · 触发 · Trigger

> **中**：促使系统检查并推进一个[会话](#ul-session--会话--session)工作的信号。
> 它表达输入到达、原等待满足或恢复检查等事件的推进通知角色。
> 是否创建 [Run](#ul-run--运行--run)、创建[执行尝试](#ul-run-attempt--执行尝试--run-attempt)，
> 或继续原尝试，由持久事实及当前执行条件决定。
>
> **EN**: A signal that prompts the system to check and advance work for a session.
> It is the notification role of an input arrival, a resolved wait, or a recovery check.
> Durable facts and current execution conditions determine whether to create a run,
> create an attempt, or continue the current attempt.

- **形态**：属性
- **出处**：[PF-012 §4 Run 的开始与推进边界](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#边界什么让它开始什么让它结束)（rev 25）
- **别混 ①**：它不是 Run 开始事实，也不保证产生一次 attempt。队列从空变非空不是开 Run 的充分或必要条件。
- **别混 ②**：它不授予推进权，也不替代持久输入、承接、等待结果或尝试栅栏。普通追加不因信号送达而中断在途调用。
- **注意 ①**：重复、合并或重建信号不提供新增工作依据，仍按当前持久事实检查；没有可推进工作时不创建 Run 或 attempt。
- **注意 ②**：中断提醒本身不取得待处理资格，也不成为重新开启工作的理由；对原结果及费用的保存不因此创建新 Run。

### UL-pending-message-queue · 待处理消息队列 · Pending Message Queue

> **中**：**一个[会话](#ul-session--会话--session)里，已经落进[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)、
> 仍有待处理资格且还没有由 [Agent Loop](#ul-agent-loop--agent-loop--agent-loop) 持久承接的那些[消息](record-and-context.md#ul-message--消息--message)。**
> **它不是另一份权威，是必须持久维护的会话日志投影**——
> **已记录的输入减去已被[承接](#ul-input-claim--承接--input-claim)的输入及已取消待处理资格的输入**，这些都是日志里的事实。
> **默认按到达先后取**，唯一的例外是[插队](interaction-and-dispatch.md#ul-queue-jump--插队--queue-jump)。
>
> **EN**: **Within one session, the messages that have landed in the session log but
> remain eligible for processing and have not yet been durably claimed by the agent loop.** It is **a durable projection of the log, not a second source of truth** — which messages remain eligible and unconsumed is derivable from the log
> itself. Messages are taken **in arrival order**, the sole exception being a queue jump.

- **形态**：视图
- **出处**：[PF-012 §4 待处理消息队列](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#待处理消息队列)（rev 25）
- **别混 ①**：**它不是一个收件箱。**收件箱是东西送到的地方，
  **而这里的每一项都已经是日志里的一条消息了**——[到达要先被受理并落账](interaction-and-dispatch.md#ul-inbound-arrival--入站到达--inbound-arrival)，才谈得上排队
- **别混 ②**：**[控制指令](interaction-and-dispatch.md#ul-control-command--控制指令--control-command)不进这个队列**——
  它是处置不是内容，受理先保存目标与可恢复处置责任，实际生效另按该动作判断
- **注意 ①**：**它决定[运行](#ul-run--运行--run)退不退出**：非空就接着消费，空了才收束。
  **「模型没话说了」不等于做完了**
- **注意 ②**：**投影这个形状不是实现取舍，是被两条规矩逼出来的**——
  [组装是纯派生的](#ul-agent-loop--agent-loop--agent-loop)（不能另立一份由组装消费的权威队列），
  且**停机是主路径的一部分**（攒在内存里一次重启就丢）
- **注意 ③**：**什么东西会进来、怎么受理、一次取几条**，归
  [PF-014](../../product.0.0.1.legacy/PF-014-inbound-intake-and-queueing/README.md)；本条只定**它是什么**

### UL-input-claim · 承接 · Input Claim

> **中**：**[Agent Loop](#ul-agent-loop--agent-loop--agent-loop) 把[待处理消息队列](#ul-pending-message-queue--待处理消息队列--pending-message-queue)里的一批[消息](record-and-context.md#ul-message--消息--message)
> 通过持久记录取走、交给某一次[运行](#ul-run--运行--run)去处理这件事。**读取消息或开始执行不构成承接；承接后退出待处理队列，原消息与承接记录仍保留。
> **每一次承接都落进[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)**——
> 「哪些已经被承接」是队列那道减法的减数，**不落，队列在停机之后就重建不出来**。
>
> **EN**: **The agent loop taking a batch of messages out of the pending message queue
> and durably assigning them to one run.** Reading or starting work is not a claim. A claimed message leaves the pending queue, but its content and claim record remain. **Every claim is written to the session log**: which
> inputs have been claimed is the subtrahend the queue is derived from, and without it
> the queue cannot be rebuilt after a restart.

- **形态**：过程
- **出处**：[PF-012 §4 边界](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#边界什么让它开始什么让它结束) ·
  [§6.16](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#616-日志里至少要有这几种-run-相关的条目)（rev 25）
- **别混**：**不是[入站到达](interaction-and-dispatch.md#ul-inbound-arrival--入站到达--inbound-arrival)**——
  到达说的是**东西进了日志**，承接说的是 **loop 把它取走去做**。两者之间就是排队那段时间
- **注意 ①**：**一次运行的承接范围会在它跑着的时候继续长**——
  [新到的东西默认并入当前那一次](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#run-跑着的时候又进来一条东西)，所以边界到终结时才完全确定
- **注意 ②**：**每条已记录的输入至多被承接一次**；最新那次运行已终结而它还没被承接，
  就必须有一次新的运行把它承接掉（[PF-012 I-12](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)）

### UL-run-attempt · 执行尝试 · Run Attempt

> **中**：**同一次[运行](#ul-run--运行--run)内，会话一侧取得的第几次推进尝试**——
> 会话一侧为这次运行换一副 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime) 接着推进时记下的那一段关联。
> **它由会话一侧拥有，不是 agent runtime 的启动计数**；
> Agent 一侧不要求、也不解释它，会话一侧把它对应到 Agent 一侧的什么，由外部协调者维护。
> 只有会话一侧为这次运行换一副 agent runtime 接着推进才产生新尝试；崩溃恢复或等待回收后接续，仍属同一运行。原 agent runtime 仍有效时的等待恢复、普通追加和模型调用内部重试不创建新尝试。
> **它的身份是 (哪次运行, 第几次)，从日志里那条「尝试开始」记录派生，不另立权威；可持久化投影。**
>
> **EN**: **Which advancement attempt the session side has taken for the same run** — the association the
> session side records when another agent runtime takes over advancing the run. **The session side owns it; it is not a count of
> agent-runtime starts.** The agent side neither requires nor explains it, and an external coordinator maintains
> what the session side maps it to on the agent side. A new attempt arises only when the session side has another
> agent runtime take over advancing the run; recovery after a crash or after release during a wait remains within the same run.
> Resuming while the original agent runtime is still valid, appending input, or retrying within a model call does not create an attempt.
> **Its identity is (which run, which ordinal), derived from the attempt-start record in the log; it may be
> persisted as a projection, not as independent truth.**

- **形态**：视图
- **出处**：[现行词义](../index.md)（PM 起草；与前身系统「logical Run / physical attempt」同构）；
  **形态与身份于 2026-09-22 定死**，见 [PF-012 §4 执行尝试](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#执行尝试)（rev 25）；
  会话一侧拥有、Agent 不要求它，见[产品页 一次工作怎样推进](../../product/agent-progression/design.md#一次工作怎样推进)与[扩展检查与权限](../../product/agent-progression/design.md#扩展检查与权限)（rev 2）；用户决定，2026-10-17 Agent 扩展继承与边界对齐
- **别混**：**不是 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)，也不是 [Agent 执行](#ul-agent-execution--agent-执行--agent-execution)**——
  后两者是 Agent 一侧的概念；执行尝试是会话一侧「这次运行的第几次推进」。
  **一次尝试对应 Agent 一侧的哪次[执行挂接](#ul-execution-attachment--执行挂接--execution-attachment)或 Agent 执行，由外部协调者维护**，不是本条的内容
- **注意 ①**：**它有一个指得到的身份，但没有自己的存储**——内存态重算即得，
  花的钱记在成本条目里，做过的事记在效果条目里，**它本身没有「只有它知道」的东西**
- **注意 ②**：**序号显式写在那条尝试开始记录里**，不靠数前面有几条；
  [「只有序号最大的那次尝试能写入推进运行的记录」这道栅栏拿它做比较](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#同一个-run-同一时刻只有一副协程在推它)
- **注意 ③**：**这一条是「治理性质」的直接后果**——一次网络抖动重试若算成两次运行，**账和失败都算错**。
  **成本明细按它记，汇总按运行算**
- **注意 ④**：**执行开始之后位置不按它计**——那个位置按[Agent 执行](#ul-agent-execution--agent-执行--agent-execution)的新开计，见[执行开始之后](#ul-execution-started-position--执行开始之后--execution-started-position)

### UL-attempt-fence · 尝试栅栏 · Attempt Fence

> **中**：**同一次[运行](#ul-run--运行--run)里，只有序号最大的那次[执行尝试](#ul-run-attempt--执行尝试--run-attempt)可以写入推进运行的记录**，
> 序号更小的尝试不能再推进运行；已经发出去的动作，其响应体与账仍照样落，仍归该运行、标明迟到，不使旧尝试或运行复活。一次尝试**被取代**，是指[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)里
> 已经有了同一次运行、序号更大的尝试——从那一刻起栅栏对它关上，**此后不再打开**。
> 拿来比较的就是日志里已经写下的尝试序号：**不另设一把锁，也不在日志之外另立一份「谁是当前那次」的权威**。
>
> **EN**: **Within one run, only the run attempt with the highest ordinal may write records that advance the run**;
> a lower-ordinal attempt cannot advance it. Responses and accounts for actions already dispatched are still recorded against that run, marked late, without reviving either. An attempt is **superseded** once the
> session log holds an attempt of the same run with a higher ordinal — from that moment the fence is
> closed to it and **never reopens**. What it compares is the attempt ordinal already written in the
> log: **no separate lock, and no second record of "which attempt is current" kept outside the log**.

- **形态**：规则
- **出处**：[PF-012 §5.7 同一个 Run 同一时刻只有一副协程在推它](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#同一个-run-同一时刻只有一副协程在推它) ·
  [§6.17 I-15](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)（rev 25）
- **⚠️ 别混 ①**：**不是锁，也不是租约**——它不挡一副旧协程接着跑，只让它写不进推进运行的记录；它只比序号，不看谁先到、谁超时
- **别混 ②**：**不是[会话内单活跃](#ul-single-active-execution--会话内单活跃--single-active-execution)**——
  那条是要守住的不变式（一个会话同一时刻至多一个活跃运行、一副活跃 agent runtime）；
  这一条兑现的是它下面的一个前提：**同一个运行不被两副协程同时推进**——恢复逻辑起了新的一副、旧的那副又活过来时，靠它让旧的不能再推进运行
- **注意 ①**：**它靠序号显式写在日志里成立**：每次尝试先落那条带序号的尝试开始记录，再以这次尝试写别的
  （[PF-012 §6.16](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#616-日志里至少要有这几种-run-相关的条目)；I-15 序号严格递增）——**序号不是数出来的**
- **注意 ②**：**裸写「已被取代」不指它**——那几个字在别处也说被新决定取代的旧决定、被新求值取代的旧求值。
  说尝试时写「这次尝试已被取代」；「运行已终结」是另一件事，说的是运行落了[运行终态](#ul-run-terminal-state--运行终态--run-terminal-state)
- **注意 ③**：栅栏拒绝的是旧尝试推进运行的写，独立执行的结果与结算仍保留；当前尝试可以承接仍被该 Run 等待的调用结果，不能复活终结的 Run；[C-34](../conflicts.md#现有冲突) 已由产品负责人裁决闭合。

### UL-run-terminal-state · 运行终态 · Run Terminal State

> **中**：一次[运行](#ul-run--运行--run)的结局，**恰有三种：完成 · 失败 · 被取消**。
> 到了就回不去，**且只从一个出口落账**。
> **停下来等人不是终态**——那是它还活着时的一种姿态。
>
> **EN**: The outcome of a run — **exactly three: completed, failed, cancelled**.
> Once reached it is irreversible, and it is recorded through a **single point of
> exit**. **Waiting on a person is not one of them**; that is a posture the run
> holds while still alive.

- **形态**：状态
- **出处**：[PF-012 §6.6](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#66-终态不可逆且只有一个出口)（rev 25）
- **别混**：**不是[终局](execution-and-outcome.md#ul-terminal-disposition--终局--terminal-disposition)**——
  终局说的是**一件[非常态](execution-and-outcome.md#ul-off-nominal--非常态--off-nominal)**走完了整条阶梯，
  这一条说的是**这一次运行**的结局。**两条线各走各的**：Run 已经落了终态，那件非常态可能还在往外交
- **注意**：[被取消自成一种](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#67-用户可以中断而中断不是失败)，**不并进失败**

## 怎么往前走

> **[Run](#ul-run--运行--run) 是被写下来的那一半，[Agent Loop](#ul-agent-loop--agent-loop--agent-loop) 是被重新算出来的那一半。**
> 缺前者，停机之后不知道当时在哪；缺后者，知道在哪也算不出下一步。

### UL-agent-loop · Agent Loop · Agent Loop

> **中**：**一次[运行](#ul-run--运行--run)怎么从这一步走到下一步**的那套逻辑，
> 写成一个纯函数：下一步由[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)
> 与[当下条件](#ul-current-conditions--当下条件--current-conditions)算出来，
> **不由任何活在进程里的东西决定**。**同一份日志配同一份当下条件，算出来的下一步唯一。**
>
> **EN**: The logic by which one run advances from each step to the next, expressed
> as a **pure function**: the next step is computed from the session log and the
> current conditions, **never from anything living inside a process**. The same log
> and the same conditions always yield the same next step.

- **形态**：规则
- **出处**：[PF-012 §4 Agent Loop](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#agent-loop)（rev 25）
- **别混 ①**：**不是 [Run](#ul-run--运行--run)**——Run 是那次运行本身，Agent Loop 是推进它的那套逻辑
- **别混 ②**：**不是 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)**——
  **这一条是被求值的那个函数，那一条是求值它的那个协程**。
  函数没有寿命，协程有；**函数算不坏，协程会被取消**
- **注意**：**「状态转移方程」是它的另一种说法**（产品负责人 2026-09-17 原话），两者不是两个概念

### UL-agent-runtime · agent runtime · Agent Runtime

> **中**：**反复求值 [Agent Loop](#ul-agent-loop--agent-loop--agent-loop)、通过[执行挂接](#ul-execution-attachment--执行挂接--execution-attachment)把一次 [Agent 执行](#ul-agent-execution--agent-执行--agent-execution)往前推的那个协程。**
> 会话路径中，那次 Agent 执行对应一次[运行](#ul-run--运行--run)的一段推进。
> 它有独立的执行上下文，能在 await 点挂起与恢复，**能被独立取消**，有自己的生命周期。
> **一次 Agent 执行结束后，它回到空闲并保持[登记](#ul-agent-registration--agent-登记--agent-registration)，可以承接下一次 Agent 执行**；前后两次执行之间不沿用主体、授权、取消状态、输入队列与结果游标。
> 它**持有[待处理消息队列](#ul-pending-message-queue--待处理消息队列--pending-message-queue)并循环取用**，
> 因此是全系统**唯一的 event loop**。
> **它不拥有独立推进状态**：推进事实保存在协程之外的耐久记录里（会话路径中是[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)，由外部协调者维护）；会话路径中，会话配置与可恢复 context 由会话持有；当下条件从当前来源取得。
>
> **EN**: **The coroutine that repeatedly evaluates the agent loop and, through an execution attachment, drives one
> agent execution forward.** On the session path that execution corresponds to one stretch of advancing a run.
> It has its own execution context, suspends and resumes at await points,
> **can be cancelled independently**, and has a lifetime of its own. **When one agent execution ends, it returns to
> idle, stays [registered](#ul-agent-registration--agent-登记--agent-registration), and can take up the next agent execution**; it carries no principal, authorization,
> cancellation state, input queue or result cursor from one execution to the next. It **holds the
> pending message queue and consumes from it in a loop**, making it the **only event
> loop in the system**. **It owns no independent progression state**: progress is kept in durable records outside the coroutine (on the session path, the session log, maintained by an external coordinator). On the session path, session configuration and recoverable context outlive the coroutine. Current conditions are obtained from their sources.

- **形态**：对象
- **出处**：[现行词义](../index.md)（产品负责人 2026-09-20 直接裁决）；
  它推进的是 Agent 执行而不是某个执行尝试，见[产品页 使用场景](../../product/agent-progression/design.md#使用场景)与[扩展检查与权限](../../product/agent-progression/design.md#扩展检查与权限)（rev 2）；用户决定，2026-10-17 Agent 扩展继承与边界对齐
- **它就是 [SYS-COMPOSITION](../../../../docs/requirements.md#定义装配与活体sys-composition) 说的「活体」**——
  那一段描述的计算资源、可回收可重建、因资源治理而生灭，**逐条说的都是协程**
- **注意 ①**：**会话路径中，[一个会话同时至多一个](#ul-single-active-execution--会话内单活跃--single-active-execution)**；
  它**与[执行尝试](#ul-run-attempt--执行尝试--run-attempt)不一一对应**——执行尝试是会话一侧拥有的关联，不是 agent runtime 的启动计数。
  换一副 agent runtime 或换一次执行挂接接续同一次 Agent 执行时，不因此成为新的一次执行
- **注意 ②**：**它按[装配清单](#ul-assembly-manifest--装配清单--assembly-manifest)起，但不等于清单**——
  清单是数据、可复用；协程是活的、会没
- **注意 ③**：会话路径中，它代表当前 Run 发起模型／工具执行，持有[运行时句柄](#ul-runtime-handle--运行时句柄--runtime-handle)来等待或控制；两类执行的生命周期均归会话，释放句柄不取消执行。主流程等待依赖不等于生命周期依附，见[取消范围](#ul-cancellation-follows-host--取消跟着宿主走--cancellation-follows-host)。
- **注意 ④**：空闲与承接下一次执行的系统表述见已接受系统页 [Agent runtime](../../../../docs/architecture/runtime/agent-runtime.md#实例执行与执行挂接)

- **输入与恢复依据**：[PF-012 §4 agent runtime](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#agent-runtime)（rev 23）。

### UL-agent-execution · Agent 执行 · Agent Execution

> **中**：**Agent 的一次逻辑执行：从开启一次新的推进起，到 Agent 在必要检查成立后结束自己的这段推进止。**
> 换一次[执行挂接](#ul-execution-attachment--执行挂接--execution-attachment)或换一副 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime) 接续它，包括重挂接和实例换代，仍是同一次；只有新开一次逻辑执行才是新的一次。
> 其间已取得的判断、效果和答复，接续后继续使用。
> **Agent 不要求它关联会话、运行或执行尝试，也不解释这些关联**；会话路径中它与[运行](#ul-run--运行--run)的对应由外部协调者维护。
>
> **EN**: **One logical execution of the agent: from the start of a new advancement until the agent itself ends it once the required checks hold.** Continuing it through a new execution attachment or another agent runtime, including re-attachment and instance replacement, is still the same execution; only a newly started logical execution is a new one. Judgements, effects and answers already obtained stay in use after it continues. **The agent neither requires nor explains any session, run or attempt for it**; on the session path, an external coordinator maintains how it corresponds to a run.

- **形态**：对象
- **出处**：[产品页 使用场景](../../product/agent-progression/design.md#使用场景) · [扩展检查与权限](../../product/agent-progression/design.md#扩展检查与权限) · [人的决定与等待](../../product/agent-progression/design.md#人的决定与等待)（rev 2）；用户决定，2026-10-17 Agent 扩展继承与边界对齐
- **别混 ①**：**不是[运行](#ul-run--运行--run)**——运行是会话一侧的一次逻辑执行请求，成本与失败的归属单位，由会话治理；Agent 执行是 Agent 自己的一次推进，Agent 不知道运行存在
- **别混 ②**：**不是 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)**——runtime 是推进它的协程，会换；执行是被推进的那一件事，不随协程没而没
- **别混 ③**：**不是[工具执行](execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)**——工具执行是一次工具调用，一次 Agent 执行里可以发起多次
- **别混 ④**：**不是[执行尝试](#ul-run-attempt--执行尝试--run-attempt)**——尝试是会话一侧对运行的推进记账

### UL-execution-attachment · 执行挂接 · Execution Attachment

> **中**：**一副 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime) 对某一次 [Agent 执行](#ul-agent-execution--agent-执行--agent-execution)的一次物理承接。**
> 重挂接和实例换代，都是为同一次执行换一次执行挂接；换执行挂接不使执行成为新的一次，也不再经过[执行开始之后](#ul-execution-started-position--执行开始之后--execution-started-position)位置。
> 它不是[执行尝试](#ul-run-attempt--执行尝试--run-attempt)，后者由会话一侧拥有。
>
> **EN**: **One physical taking-up of one agent execution by one agent runtime.** Re-attaching and replacing the instance both give the same execution a new execution attachment. A new execution attachment does not make the execution a new one and does not pass the execution-started position again. It is not a run attempt, which the session side owns.

- **形态**：对象
- **出处**：[产品页 扩展检查与权限](../../product/agent-progression/design.md#扩展检查与权限)（rev 2）；用户决定，2026-10-17 Agent 扩展继承与边界对齐；形态由 Agent 契约的[对象模型](../../../../packages/agent/agent-contract/docs/object-model.md#对象与生命周期)裁定，该契约已由[技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)采用，见 [C-59](../conflicts.md#c-59执行挂接的形态)
- **别混 ①**：**不是[附件](execution-and-outcome.md#ul-attachment--附件--attachment)**——附件是存进存储、agent 自己去取的文件，Tool 结果里的 attachments 也指它；本条只指 agent runtime 对执行的承接
- **别混 ②**：**不是[执行尝试](#ul-run-attempt--执行尝试--run-attempt)**——尝试是会话一侧的推进记账，执行挂接是 Agent 一侧的概念
- **注意 ①**：**不许简称 attachment**，英文与代码名都写全称（Execution Attachment、`ExecutionAttachment`、`ExecutionAttachmentId`、`executionAttachment`），因为裸写的 attachment 已指[附件](execution-and-outcome.md#ul-attachment--附件--attachment)；中文同理写「执行挂接」，正文在没有歧义处可以写「挂接」。Agent 契约已按此命名；已接受页的旧写法已回改，见 [C-64](../conflicts.md#c-64执行挂接的候选类型名)
- **注意 ②**：为同一次执行取得新的执行挂接有恢复与接管两条路径，前提、独立的主体资格和结果归 [Agent 契约的恢复与接管](../../../../packages/agent/agent-contract/SPEC.md#恢复与接管)。产品正文没有区分这两条路径，本词表不为它们另立词条
- **弃用**：~~挂载~~ ~~Agent Attachment~~

### UL-agent-registration · Agent 登记 · Agent Registration

> **中**：**宿主为一副 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime) 实例作的一次发布记录，使该实例可被发现、可接受调用。**
> 它有自己的身份和三种状态：已发布、撤除中、已撤除。
> 宿主重新发布同一个仍然存活的实例时，产生后继登记，取代旧登记；旧登记的身份不能作用于后继登记。
> 已撤除的登记留下身份记录，使同一次撤除可被认回。
> 登记是宿主拥有的记录，不是 agent runtime 本身，也不授予推进资格。
>
> **EN**: **The record a host makes when it publishes one agent runtime instance so that the instance can be discovered and can accept calls.** It has an identity of its own and three states: published, withdrawing and withdrawn. When the host publishes the same live instance again, a successor registration replaces the old one, and the identity of the old registration cannot act on the successor. A withdrawn registration leaves an identity record so that the same withdrawal can be recognized. A registration is a record the host owns. It is not the agent runtime itself and it grants no authority to advance an execution.

- **形态**：对象
- **出处**：缺产品原文。[Agent 产品页](../../product/agent-progression/design.md#使用场景)（rev 2）只写用户不需要按实例的生灭重建协作，没有一节定义登记。本条含义来自已接受系统页 [Agent runtime 实例、执行与执行挂接](../../../../docs/architecture/runtime/agent-runtime.md#实例执行与执行挂接)（保持空闲和注册）与用户决定（2026-10-17 Agent 扩展继承与边界对齐：agent runtime 保持登记），这两处都不是本词表的合法出处。身份与状态只由已接受的 Agent 契约的[对象模型](../../../../packages/agent/agent-contract/docs/object-model.md#对象与生命周期)给出。出处缺口由产品负责人闭合：在 Agent 产品页写出登记，或裁定登记不是产品概念，见[对象条目的未裁](../../domain_objects/objects.md#ul-agent-registration--agent-登记)
- **别混 ①**：**不是 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)**——runtime 是推进执行的协程，登记是宿主对它的发布记录。runtime 失联后重新启动的进程是新实例，不继承原登记
- **别混 ②**：**不是[运行时 context 注册](scope-and-resolution.md#ul-runtime-context-registration--运行时-context-注册--runtime-context-registration)**——那一条是会话纳入一块 context 来源的声明，与 agent runtime 的发布无关
- **注意**：登记缺席不证明工作结束。执行的存续与恢复依据在执行记录里，不在登记里，见 [Agent 契约的创建、登记与复用](../../../../packages/agent/agent-contract/SPEC.md#创建登记与复用)

### UL-agent-step · agent 的一步 · Agent Step

> **中**：[Agent Loop](#ul-agent-loop--agent-loop--agent-loop) 转一圈：
> **看到处境 → 决定做什么 → 做 → 看到结果**。
> 一次[运行](#ul-run--运行--run)由一步接一步构成；**一步之内至多一次[模型调用](execution-and-outcome.md#ul-model-call--一次模型调用--model-call)，
> 以及由它带出来的若干次[工具执行](execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)**。
>
> **EN**: One turn of the agent loop — see the situation, decide what to do, do it,
> see the result. A run is made of one step after another; within a single step
> there is **at most one model call**, plus whatever tool executions it calls for.

- **形态**：过程
- **出处**：[PF-012 §4 agent 的一步](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#agent-的一步) · [§5.4](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#54-一步的骨架)（rev 25）
- **别混**：**不是一次[模型调用](execution-and-outcome.md#ul-model-call--一次模型调用--model-call)**——
  模型调用是它**里面**的一段，两者差着一层
- **注意**：它是 [PF-011 那棵树上的一层](../../product.0.0.1.legacy/PF-011-off-nominal-handling/design.md#53-层的顺序不是排出来的是推出来的)，
  父节点是[运行](#ul-run--运行--run)

### UL-message-admission · 消息准入 · Message Admission

> **中**：**外部输入、模型完整回复和工具结果成为消息之前，Agent 按来源校验并决定接纳或拒收的规则。**
> 它按来源区分这三种内容：同样被拒收，三种来源的后果各不相同，后果见[产品页 模型回复与工具结果](../../product/agent-progression/design.md#模型回复与工具结果)。
> **它是 Agent 自己的规则，不是拓展位置，也不经过拓展件。**
>
> **EN**: **The rule by which the agent, per source, validates and then accepts or rejects an external input, a complete model reply or a tool result before it becomes a message.** It tells the three sources apart: a rejection has a different consequence for each source, and the product page section on model replies and tool results states those consequences. **It is the agent's own rule, not an extension position, and it does not pass through extensions.**

- **形态**：规则
- **出处**：[产品页 模型回复与工具结果](../../product/agent-progression/design.md#模型回复与工具结果)（rev 2）；用户决定，2026-10-17 Agent 扩展继承与边界对齐
- **别混 ①**：**不是[放行判断](interaction-and-dispatch.md#ul-admission-decision--放行判断--admission-decision)**——放行判断管一个动作能不能发起，站在执行动作之前；消息准入管一条内容能不能成为消息
- **别混 ②**：**不是[拓展位置](#ul-loop-extension-point--loop-拓展点--loop-extension-point)上的否决**——产品暂不在消息成立前后另设拓展位置，准入不依附任何位置
- **注意 ①**：产品页也称「消息入口」，指同一件事
- **注意 ②**：**被拒收的模型回复不是一次模型调用失败**——原调用照常收场，不交给重试挂件。连续拒收没有次数上限，原「连续否决上限」已弃用，见[该词条](execution-and-outcome.md#ul-consecutive-veto-limit--连续否决上限--consecutive-veto-limit)
- **注意 ③**：**非 Tool ref 来源的模态转换在接纳之前完成**：实现消息准入的提供者在接纳前调用[转换件](capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)，Agent 只看到接纳后的消息及其派生表示。这一归属已由项目负责人接受，见 [C-58](../conflicts.md#c-58模态转换件的执行时点)

### UL-side-question · 旁路提问 · Side Question

> **中**：**用户趁 agent 干活时顺口问的一句，由一次不属于任何[运行](#ul-run--运行--run)的[模型调用](execution-and-outcome.md#ul-model-call--一次模型调用--model-call)来答。**
> 它读得到[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)，**但问与答都不进日志，也不改变下一步**。
> 它花钱、会失败，却不属于任何一次尝试、任何一个 Run；**花的钱归会话那一级**。
>
> **EN**: **A question the user asks aside while the agent is working, answered by a model call that
> belongs to no run.** It can read the session log, **but neither question nor answer enters the log, and it
> does not change the next step**. It costs money and can fail, yet belongs to no attempt and no run; **its
> cost is attributed at the session level**.

- **形态**：过程
- **出处**：[PF-012 §4 Run 是三样东西的归属单位](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#run-是三样东西的归属单位)（rev 25） ·
  [PF-013 §5.13 它只有一个宿主](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#它只有一个宿主所以只有一种结局)（rev 17）
- **别混**：**不是[插队](interaction-and-dispatch.md#ul-queue-jump--插队--queue-jump)**——插队的那句话要进队列、被这次运行看到；旁路提问碰不到运行
- **注意**：**模型调用的全套规则对它照样成立**——生命周期归会话，不受无关 Run 取消影响；同样按档案与有效模型出门、看首 token、由重试挂件决定试不试；
  归属规则本身归 [PF-015](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/README.md)

### UL-current-conditions · 当下条件 · Current Conditions

> **中**：算下一步时，**[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)之外**
> 还要看的那些**此刻才成立**的事实——[当下可用性](reach-and-availability.md#ul-current-availability--当下可用性--current-availability)、
> 这一次用哪个模型、以及[注入](#ul-runtime-injection--运行时注入--runtime-injection)进来的那些。
> **它每次从当前来源求值；历史采用依据可留存，但不替代下一次的当前条件。**
>
> **EN**: The facts that hold **only at this moment** and must be consulted, besides
> the session log, to compute the next step — current availability, which model this
> request uses, and whatever has been injected. **It is evaluated from current sources each time; recorded inputs from a past evaluation do not replace current conditions.**

- **形态**：视图
- **出处**：[PF-012 §4 当下条件](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#当下条件)（rev 25）
- **别混**：**不是[记录条目](record-and-context.md#ul-record-entry--记录条目--record-entry)**——
  条目是发生过的事，写下就不再改变；当下条件是此刻算出来的，历史留存不使它继续有效
- **注意**：**它变了，同一份日志会算出不同的下一步**——这不动摇
  [Agent Loop](#ul-agent-loop--agent-loop--agent-loop) 的纯函数性质

### UL-loop-extension-point · Loop 拓展点 · Loop Extension Point

> **中**：[Agent Loop](#ul-agent-loop--agent-loop--agent-loop) 上一个开放的位置，
> **挂在某个[状态点](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#53-改日志的动作与纯派生的动作)的紧前或紧后**。
> **它按自己相对哪个状态点命名，不按挂在那儿的功能命名**——
> **同一个位置可以挂多个[拓展件](capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)，各干各的。**
>
> **EN**: An open position on the agent loop, sitting **immediately before or
> immediately after one state point**. **It is named by which state point it sits
> against, never by what is attached there** — **several extensions may occupy the
> same position, each doing its own thing.**

- **形态**：位置
- **出处**：[PF-012 §4 Loop 拓展点](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#loop-拓展点) · [§5.8](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#58-loop-拓展点)（rev 25）；
  位置的个数与各位置的限制见[产品页 扩展检查与权限](../../product/agent-progression/design.md#扩展检查与权限)（rev 2）；用户决定，2026-10-17 Agent 扩展继承与边界对齐
- **⚠️ 别混**：**它不是[拓展件](capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)**——
  **拓展点是位置，拓展件是挂上去的东西**（第八类资产）
- **注意 ①**：**位置由状态点推出，因此数目有限且可穷举**——
  **当前恰好九个**，位置集合与各位置的触发边界归[系统页 Loop extensions](../../../../docs/architecture/runtime/loop-extensions.md#扩展位置与干预力)，本词条不重述；**挂什么没有上限**
- **注意 ②**：**纯派生的动作不是状态点，所以它前后没有位置**——
  [组装](record-and-context.md#ul-context-assembly--上下文组装--context-assembly)与「量一量」都不构成挂点
- **注意 ③**：挂在这里的东西**只能靠改[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)起作用**，
  **不改方程本身**
- **注意 ④**：**「拓展」与「扩展」是同一个词的两种写法，不是两个概念**——
  本卷与词表写「拓展点」「拓展件」，系统页与成员正文写「扩展位置」「扩展」，所指相同；见 [C-62](../conflicts.md#c-62拓展与扩展)
- **注意 ⑤**：**位置只有这九个，没有「消息落盘之前」「消息落盘之后」**——消息持久化归会话，不归 Agent，消息持久化前后的处理挂在会话的[业务流程拓展点](interaction-and-dispatch.md#ul-business-flow-extension-point--业务流程拓展点--business-flow-extension-point)上，见 [C-61](../conflicts.md#c-61斜杠命令受理依赖已移除的位置)；
  消息准入仍然存在，见[消息准入](#ul-message-admission--消息准入--message-admission)

### UL-execution-started-position · 执行开始之后 · Execution-Started Position

> **中**：**[Loop 拓展点](#ul-loop-extension-point--loop-拓展点--loop-extension-point)之一，每个新的 [Agent 执行](#ul-agent-execution--agent-执行--agent-execution)开始后经过一次。**
> 重挂接、实例换代或接续原执行时，不再经过这个位置。
> 扩展不能借它给已失效的[执行挂接](#ul-execution-attachment--执行挂接--execution-attachment)重新授予推进资格。
>
> **EN**: **One of the loop extension points, passed once after each new agent execution starts.** Re-attachment, instance replacement and continuing an existing execution do not pass it again. An extension cannot use it to grant advancement qualification again to an execution attachment that is no longer valid.

- **形态**：位置
- **出处**：[产品页 扩展检查与权限](../../product/agent-progression/design.md#扩展检查与权限)（rev 2）；用户决定，2026-10-17 Agent 扩展继承与边界对齐
- **别混**：**不是以执行尝试开始为触发点的位置**——尝试是会话一侧拥有的关联；换一次执行挂接或换一副 agent runtime 接续，并不新开 Agent 执行，因此不经过这个位置
- **弃用**：~~「尝试开始之后」~~（~~attempt_started~~）
- **注意**：九个位置里只有它单独立条：它的触发边界是新的 Agent 执行，不是执行尝试，读错就会与会话一侧的尝试混淆；它也承接弃用说法的登记。其余八个位置的名称已说明所在状态点，集合与触发边界归[系统页](../../../../docs/architecture/runtime/loop-extensions.md#扩展位置与干预力)

### UL-intervention-power · 干预力 · Intervention Power

> **中**：**收到一条瞬态条目的那一方——在 loop 里就是一件[拓展件](capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)——能对正在发生的事做到什么。**恰三档：
> **只观察**（看，不改）· **可改写**（追加一条，或决定下一条还没落盘的东西长什么样）·
> **可否决**（拦住它站的那个状态点，不让它发生；也能落一张卡片，让运行停下来等人）。**没有「放宽」这一档。**
> 只有「成为条目之前」那一刻才谈得上干预——已经写下的条目不干预任何事。
>
> **EN**: **What the receiver of a transient entry — in the loop, an extension — can do to what is
> happening.** Exactly three grades: **observe only** (look, change nothing); **may rewrite** (append an
> entry, or decide the shape of the next one not yet written); **may veto** (stop the state point it stands
> at from happening, including by posting a card and making the run wait for a person). **There is no
> "loosen" grade.** Intervention exists only at the moment before something becomes an entry — an entry
> already written intervenes in nothing.

- **形态**：属性
- **出处**：[PF-000 §4 干预力](../../product.0.0.1.legacy/PF-000-occurrences-and-record-entries/design.md#干预力--intervention-power) ·
  [§5.3](../../product.0.0.1.legacy/PF-000-occurrences-and-record-entries/design.md#53-干预力只长在瞬态这一半上)（rev 1） ·
  [PF-012 §5.8 干预力三档](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#干预力三档直接用-pf-000-的) ·
  [没有「放宽」这一档](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#没有放宽这一档)（rev 25） ·
  [PF-002 §4 Loop Extension](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#loop-extension)（rev 32）
- **注意 ①**：**在拓展件上它是一项[权限](capabilities-and-composition.md#ul-permission--权限--permission)，不是设置**——各层按收窄合成，组织锁在「只观察」，租户就放不宽
- **注意 ②**：**三档挂了的后果相反**——只观察那一档不影响正在发生的事；可改写那一档不影响，但留一笔「它没跑成」；可否决那一档报错默认当作否决。**「不可用」不是报错**，另有定法
- **注意 ③**：**否决只在「之前」的位置上有意义**；后置位置不提供否决；停止和请求人处理（等人）在后置位置只影响后续推进，不撤销已发生的动作。哪些后置位置接受停止与请求人处理，由位置输出表逐位置定
- **注意 ④**：**位置还会再收窄档位**——压缩之前不允许改写；执行动作之后的整批范围不允许改写（[产品页 扩展检查与权限](../../product/agent-progression/design.md#扩展检查与权限)，rev 2）；用户决定，2026-10-17 Agent 扩展继承与边界对齐。拓展件声明的档位只是上限

### UL-extension-unavailability-policy · 拓展件不可用处置 · Extension Unavailability Policy

> **中**：**一件[拓展件](capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)此刻不在（依赖的服务用不了、它自己起不来）时，它站的那个位置这一次怎么办。**
> 恰三种：**跳过**（视作已卸载，瀑布里没有它）· **否决**（拦住它站的那个状态点）· **替换为指定挂件**（另一件预先声明的拓展件顶上；正文叫「指定挂件」，不与 UL-stand-in 的「替换件」混用）。
> **租户挂上的拓展件默认跳过，注册时可以从前两种里声明一种；替换为指定挂件只有系统自带的拓展件能用**，
> 且指定挂件在系统层面预先声明。**它不是[报错时的处置](#ul-intervention-power--干预力--intervention-power)**：不可用是「没跑」，报错是「跑了出错」。
>
> **EN**: **What happens, this one time, at the position an extension occupies when that extension is
> absent** — its dependencies are down or it failed to start. Exactly three: **skip** (treated as unloaded,
> the waterfall runs without it), **veto** (block the state point it stands at), or **replace with a
> declared fallback extension** (another extension, declared in advance, takes its place). **Tenant-installed
> extensions default to skip and may declare either of the first two at registration; the fallback form is
> reserved for system-provided extensions**, whose fallback is declared at the system level. **It is not the
> error policy**: unavailable means it never ran; an error means it ran and failed.

- **形态**：属性（一件拓展件登记上的一项；系统自带的那几件由系统预先给定）
- **出处**：[PF-012 §5.8 拓展件是可插拔的服务](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略) · [系统自带的几件](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法)（rev 25） · [PF-002 §4 不可用处置是这一件自己的声明](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#不可用处置是这一件自己的声明)（rev 32）
- **⚠️ 别混**：与[干预力](#ul-intervention-power--干预力--intervention-power)里「报错默认当作否决」那条是两回事——那条管跑了出错，这条管根本没跑
- **注意 ①**：**「此刻不在」无论按哪种处置，都必须看得见**——日志里有一笔「这一件此刻不在、按 X 处置」
- **注意 ②**：系统自带的[放行判断](../../product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#52-那个判断函数)的指定挂件是**全拒件**——它不在时，需要判断的动作一律拒绝，不放行、也不出卡问人
- **注意 ③**：**它是拓展件自己的一项声明，不是设置，也不是权限**——持有它的各层不给它配值、也收窄不了它（PF-002 D-5 已裁）；本条只定取值与谁能用哪一种。声明了否决，也要干预力求出来是可否决才算数——被收窄到另两档的，不在时照跳过办

### UL-extension-point-pass · 一次经过 · Extension-Point Pass

> **中**：**loop 走到某个 [Loop 拓展点](#ul-loop-extension-point--loop-拓展点--loop-extension-point)的一次**——从到了那个状态点，到越过它。
> 这一次里，挂在那里的各件按顺序各跑一轮。**同一个位置，同一次经过只跑一轮**：
> 「调模型之前」有挂件改了日志，就重新组装一次，**但不再回到这个位置**。
>
> **EN**: **One arrival of the loop at a given loop extension point** — from reaching that state point to
> moving past it. Within one pass the extensions hung there each run once, in order. **A position runs only
> one round per pass**: if an extension at "before model call" changes the log, the request is assembled
> again, **but that position is not visited again**.

- **形态**：过程
- **出处**：[PF-012 §5.8 改了日志就重新组装，同一位置同一次经过只跑一轮](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#改了日志就重新组装同一位置同一次经过只跑一轮)（rev 25）
- **注意 ①**：**与压缩那一圈同构**——压完再量一次，还超就上交，不再压一轮；不定这条，一个爱改日志的挂件就能把自己无限触发下去
- **注意 ②**：同一个位置上几件的先后，[就是它们在装配清单里的顺序](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#loop-extension)（PF-002 rev 31），后一件看得到前一件的结论

### UL-extension-invocation · 拓展件调用 · Extension Invocation

> **中**：**Agent 在一次[经过](#ul-extension-point-pass--一次经过--extension-point-pass)里对一件[拓展件](capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)发起的一次调用，目的是取得它的[结论](#ul-extension-conclusion--拓展结论--extension-conclusion)。**
> 调用可能花钱，也可能出卡，所以接续时不能当作纯函数重跑：
> 已有最终结论的调用不再调用，没有最终结论的按原身份接续，已取得的判断、效果和答复复用。
>
> **EN**: **One call the agent makes to one extension within a pass, in order to obtain its conclusion.** A call can spend money or raise a card, so on continuation it cannot be re-run like a pure function: a call that already has a final conclusion is not called again, a call without one resumes under its original identity, and judgements, effects and answers already obtained are reused.

- **形态**：过程
- **出处**：[产品页 扩展检查与权限](../../product/agent-progression/design.md#扩展检查与权限) · [人的决定与等待](../../product/agent-progression/design.md#人的决定与等待)（rev 2）
- **别混 ①**：**不是[一次经过](#ul-extension-point-pass--一次经过--extension-point-pass)**——一次经过是 loop 走到一个位置的那一次，挂在该位置的各件在其中各被调用一次
- **别混 ②**：**不是[回放](#ul-replay--回放--replay)**——回放是接续时把挂起中的拓展件重新跑到停处的方式，调用是普通的一次
- **注意 ①**：词表写「拓展」，系统页与成员正文写「扩展调用」，所指相同；见 [C-62](../conflicts.md#c-62拓展与扩展)
- **注意 ②**：Agent 契约用 `Passage` 与 `PassageId` 记录并标识一次拓展件调用。`Passage` 指调用的记录，**不是[一次经过](#ul-extension-point-pass--一次经过--extension-point-pass)**：一次经过里，挂在该位置的每件拓展件各有一次调用，各有自己的 `PassageId`。一次调用可以包含多次对作者的 `invoke`，结果未知之后的回放与答复到达之后的回放都属于原调用，见[扩展作者协议](../../../../packages/agent/agent-contract/docs/public-api/extensions.md#调用协议)

### UL-extension-conclusion · 拓展结论 · Extension Conclusion

> **中**：**一次[拓展件调用](#ul-extension-invocation--拓展件调用--extension-invocation)得到并被 Agent 采用后留下的判断结果，由 Agent 保存在自己的执行记录里。**
> 请求人处理（代码里是 `ask`）得到的是非最终结论：它不结束这次调用，答复齐备后原拓展件再取得下一个结论。
> 其余结论都是最终结论。已有最终结论的那次调用，接续时读取结论，不再调用。
> 代码与规格里可以简称 Conclusion。
>
> **EN**: **The judgement result an extension invocation leaves once the agent has obtained and adopted it. The agent keeps it in its own execution record.** A result that asks a person to decide (`ask` in code) is a non-final conclusion: it does not end the invocation, and once the answers are complete the same extension obtains the next conclusion. Every other conclusion is final. An invocation that already has a final conclusion is read, not called again, on continuation. Code and specifications may shorten it to *Conclusion*.

- **形态**：属性
- **出处**：[产品页 人的决定与等待](../../product/agent-progression/design.md#人的决定与等待)（rev 2）；封存来源 [PF-012 §6.10 能干预的拓展件必须留下结论](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论)（rev 25）；形态由 Agent 契约的[扩展作者协议](../../../../packages/agent/agent-contract/docs/public-api/extensions.md#conclusion)裁定，该契约已由[技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)采用，见 [C-60](../conflicts.md#c-60拓展结论的形态)
- **别混 ①**：**不是[干预力](#ul-intervention-power--干预力--intervention-power)**——干预力是拓展件能做到什么的上限，结论是一次调用实际得出的结果
- **别混 ②**：**不是[运行终态](#ul-run-terminal-state--运行终态--run-terminal-state)**——结论只说一次调用的判断，不结束任何运行或执行
- **注意**：它是挂在 [Agent 执行](#ul-agent-execution--agent-执行--agent-execution)记录上的一项值，不是会话日志里的条目，也没有独立于所属调用的身份。作者不返回结论，由 Agent 把校验通过的输出包装并保存

### UL-batch-judgment-barrier · 整批判断屏障 · Batch Judgment Barrier

> **中**：**同一批动作的判断必须全部齐备，其中需要人决定的卡片也都处理完，才发起这一批里获准的任何动作。**
> 某个动作已经通过，不能越过其他动作尚未完成的判断。
> 后继拓展件仍可再出卡，那些卡片仍属原批。整批动作全被拒绝时，没有工具执行可等，沿已有事实重新判断。
>
> **EN**: **The judgements for one batch of actions must all be complete, and any cards needing a person must all be handled, before any approved action in that batch is started.** An action that has already passed cannot overtake judgements still open for other actions. Later extensions may raise further cards, and those stay in the same batch. When every action in the batch is rejected there is no tool execution to wait for, and the agent evaluates again from the facts it already has.

- **形态**：规则
- **出处**：[产品页 一次工作怎样推进](../../product/agent-progression/design.md#一次工作怎样推进) · [扩展检查与权限](../../product/agent-progression/design.md#扩展检查与权限)（rev 2）
- **别混 ①**：**不是执行动作之后的整批范围**——后者是执行动作之后那个位置按「整批齐备」这一维选择拓展件，发生在动作已执行之后；屏障发生在执行之前
- **别混 ②**：**不是[等待原语](#ul-wait-primitive--等待原语--wait-primitive)**——等待原语是协程停下来等外面应答的办法，屏障规定的是什么时候才可以发起动作

### UL-wait-primitive · 等待原语 · Wait Primitive

> **中**：**[agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime) 这副协程「停下来，等外面给个应答」的那一种办法**——
> 主流程等模型、等工具、等人用的都是它，[拓展件](capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)要问人用的也是它，**不是另一套机制**。
> **等工具是协程阻塞在一次有自己独立 runtime 的[工具执行](execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)上**——那次执行的等待态是它自己的，[Run](#ul-run--运行--run) 记着协程在等哪一次。
> 协程在时它挂起、不轮询不占资源；协程不在了，**等待靠日志里的东西活着**：悬着的那张[决策卡片](interaction-and-dispatch.md#ul-decision-card--决策卡片--decision-card)（期望）与人的答复，或模型／工具执行的调用身份、原消费位置与结果关联。
> **差一点就是它、但不是它**：[工具等待态](execution-and-outcome.md#ul-tool-wait-state--工具等待态--tool-wait-state)——那是一次工具执行自己的等，挂在执行上；这一个挂在 Run 上，两条不合并。
>
> **EN**: **The one way the agent-runtime coroutine "stops and waits for a reply from
> outside"** — the main flow uses it to wait for the model, for a tool and for a person, and a
> loop extension that needs to ask a person uses the same one, **not a separate mechanism**.
> While the coroutine lives it suspends, polling nothing and holding nothing; once the
> coroutine is gone, **the wait survives in durable facts**: a pending decision
> card and reply, or the model/tool call identity, original consumer and result association. **Close but not it**: the tool wait state,
> which is one tool execution's own wait, hanging on the execution; this one hangs on the Run,
> and the two are never merged.

- **形态**：规则
- **出处**：[PF-012 §5.8 等人是 loop 的原语](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#等人是-loop-的原语)（rev 25） · [PF-008 §4 等待态的两个维度](../../product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#等待态的两个维度)（rev 7）
- **注意 ①**：**落终态之后等不了**（Run 已收束）；可否决不表示所有位置都允许等待，各位置的限制归[系统页](../../../../docs/architecture/runtime/loop-extensions.md#扩展位置与干预力)
- **注意 ②**：**一批动作先全部判完再执行**（见[整批判断屏障](#ul-batch-judgment-barrier--整批判断屏障--batch-judgment-barrier)）——各动作并行过执行动作之前那一串拓展件，都到了结论或等人，Run 才进等人，卡片成批落
- **注意 ③**：**agent runtime 被回收，Run 还在等、卡片还在、工具执行照跑**；Run 被取消，悬着的卡片才作废

### UL-replay · 回放 · Replay

> **中**：**以新的[执行挂接](#ul-execution-attachment--执行挂接--execution-attachment)接续原执行的那副 agent runtime（会话路径中对应新的一次[执行尝试](#ul-run-attempt--执行尝试--run-attempt)）把一件挂起中的[拓展件](capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)重跑到它停下的那一处的方式**：
> 途中它的每一次等都**按日志交回**，走到出卡那一处拿到的是记下的答复、不再出卡，然后接着往下判。
> **回放不花第二遍钱、不出第二张卡、不再问第二遍模型**。已有最终[结论](#ul-extension-conclusion--拓展结论--extension-conclusion)的件**不回放、读结论**；请求人处理得到的非最终结论，在答复齐备后回放。
> 写拓展件的人由此只多守一条：**等之前记在自己内存里的东西，等回来就没了**。
>
> **EN**: **How the agent runtime that continues an existing execution through a new execution attachment (on the session path, a new run attempt) re-runs a suspended loop extension up to the point where it
> stopped**: every wait it meets on the way is **answered from the log**, at the card-raising
> point it receives the recorded reply instead of raising a card, and then it carries on.
> **Replay spends no second money, raises no second card and asks the model no second time.**
> An extension that already has a final conclusion is **not replayed; its conclusion is read**. A non-final conclusion that asks a person to decide is replayed once the answers are complete. The
> one extra rule for extension authors follows: **whatever was kept in memory before a wait is
> gone after it.**

- **形态**：过程
- **出处**：[PF-012 §5.8 等人是 loop 的原语](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#等人是-loop-的原语)（rev 25）
- **别混**：**不是「重跑挂件」**——「新尝试里不重跑挂件」精确地说是：有最终结论的不重跑，挂起中的回放到挂起点
- **注意 ①**：回放时走到的地方与上次不同，**停住并可见**——那说明拓展件没守住上面那一条
- **注意 ②**：**回放只针对挂起中的拓展件，不涉及工具执行**——工具执行不因回收而停，接着等就是

## 算出一份构成

> **三个时刻**：**装配时**定构成，**注入变化时**定处境，**请求时**定这一次。
> 见 [PF-004 §5.3](../../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#53-三个时刻)。
> **中间那一列是这套模型的关键**——没有它，任何环境或权限的变化都只能靠重建来生效，
> 而重建会打断正在进行的工作。
>
> **这一节里没有活物。**装配是动作，清单是数据；
> 拿清单起协程是[另一件事](#ul-agent-runtime--agent-runtime--agent-runtime)。

### UL-agent-assembly · Agent 装配 · Agent Assembly

> **中**：**按会话类型的能力要求、Agent Definition 与作用域输入，求值出一份[装配清单](#ul-assembly-manifest--装配清单--assembly-manifest)的动作。**
> 它回答这一次选入哪些工具、技能和 MCP，需要哪几类执行环境、系统提示词由哪些成分构成。
> **有确定的发生时刻，不是持续过程**；输入包括会话类型要求、依据的定义版本及能力声明、当时该作用域的资产与配值求值输入。定义是输入之一。
>
> **EN**: **The act of evaluating session-type capability requirements, an Agent Definition, and scope inputs into an assembly manifest.**
> It determines the tools, skills, and MCP access points selected, the required classes of execution environment, and the ingredients of the system prompt.
> **It happens at a definite moment, rather than continuously.** Inputs include session-type requirements, the definition version and its capability declarations, and the scope's asset and attribute-evaluation inputs at that time. The definition is one input among these.

- **形态**：过程
- **出处**：[PF-004 §4 装配](../../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#装配)（rev 20） ·
  [PF-002 §5.6](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算)（rev 32）
- **别混 ①**：**裸写「装配 / assembly」在跨领域的文字里不作数**——它专指把 agent 定义求值成清单的这个动作
- **别混 ②**：**它的产物不是一个活物**——
  **2026-09-20 之前本条写的是「变成一个运行实例」，那个说法已退役**，见 [现行词义](../index.md)
- **注意**：**求值必须在装配之前**——只能纳入有资格且已有合法定义的能力；执行实现不可用不等于不得保留替换件

### UL-assembly-manifest · 装配清单 · Assembly Manifest

> **中**：**一次[装配](#ul-agent-assembly--agent-装配--agent-assembly)求值出来的那份构成**，
> 是一个**对象**，不是过程的副产品。它是**数据**：不占用计算资源，不会「停下来」，
> **可以跨多次[执行尝试](#ul-run-attempt--执行尝试--run-attempt)复用**，不必每次重新求值。
> 理由只有一条：**「当时那个 agent 是什么样」，答案只能在这里。**
> **只可追加，不可改写**——运行中装上新东西是**加一条**，不是改既有条目。
>
> **EN**: **The constitution evaluated out by one assembly** — an object in its own
> right, not a by-product of the process. It is **data**: it consumes no compute, it
> never "stops", and it **can be reused across attempts** rather than re-evaluated
> each time. There is exactly one reason for it: **"what that agent was at the time"
> can be answered nowhere else.** It is **append-only**: loading something new
> mid-run **adds** an entry, it never edits one.

- **形态**：对象
- **出处**：[PF-004 §4 装配清单](../../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#装配清单)（rev 20）
- **别混**：**不是 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)**——
  **清单是照着起协程的那份图纸，协程是照它起来的那个东西**。
  复用清单**不等于**复用协程：清单是数据，协程是活的、会没；协程在执行结束后回空闲、可承接下一次执行，见 [agent runtime](#ul-agent-runtime--agent-runtime--agent-runtime)
- **注意**：清单只记采用历史；会话已知身份单调保留，当前数据／实现与可用性另由会话记录和求值

## 外面递进来的

- **注意**：同一 Run 可经显式 reload 的安全交接采用新清单并开启新尝试；旧清单及旧执行的采用依据保留。恢复使用当前实际生效的清单，不静默刷新来源。

### UL-runtime-injection · 运行时注入 · Runtime Injection

> **中**：**一样东西不是[装配清单](#ul-assembly-manifest--装配清单--assembly-manifest)里定死的，
> 而是外面递给正在跑的那个协程的；递进来的内容变了，
> 清单不用重新求值，[协程](#ul-agent-runtime--agent-runtime--agent-runtime)也不用重起。**
> **上下文、权限及会话能力的当前采用数据是这样进来的。**
>
> **EN**: **Something not fixed in the assembly manifest but handed in from outside to
> the running coroutine; when what is handed in changes, the manifest need not be
> re-evaluated and the coroutine need not be restarted.** **Context, permissions and current session capability data arrive this way.**

- **形态**：过程
- **出处**：[PF-004 §4 注入](../../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#注入)（rev 20）
- **别混 ①**：**不是依赖注入**（DI）。那是技术设计里的容器机制；**裸写「注入」不作数**
- **⚠️ 别混 ②**：**[执行环境](grounding-and-isolation.md#ul-execution-environment--执行环境--execution-environment)不是注入进来的**——
  它**每扇门每次执行现算**。两者共享同一条性质（变了不必重新装配、协程不必重起），**来路不同**
- **注意**：与[agent 构成](capabilities-and-composition.md#ul-agent-constitution--agent-构成--agent-constitution)的分界是一句话：
  **这个变化改变的是「它是什么」，还是「它处在什么情况下」？**

### UL-incremental-loading · 增量装载 · Incremental Loading

> **中**：运行中将一个当前规则允许的新能力纳入会话；包括 agent 创建的能力。追加采用记录与会话已知身份，通过现有能力访问入口供运行中的 agent 使用，不因此重建 Agent runtime。
>
> **EN**: Admitting a new capability permitted by current rules into a running session, including one created by the agent. Adoption records and the known session identities grow, and the running agent accesses it through existing capability entry points without an Agent runtime rebuild.

- **形态**：过程
- **出处**：[PF-004 §6.3](../../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#63-三类变化三种传播) · [§5.3](../../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#53-三个时刻)（rev 20）
- **别混**：能力身份新增与 runtime 自身捕获的 Loop、extension 或直接服务依赖替换不同；必需能力声明本身不等于 Cordis inject 边。

## 怎么没

> **停止有两级，代价不同；而「谁跟着谁停」只有一条规则。**

### UL-cancellation-follows-host · 取消跟着宿主走 · Cancellation Follows Host

> **中**：三类 runtime 的生命周期归属均为会话，Run 对关联工作实行逻辑治理。取消按明确的会话、Run 或调用目标传播；Agent runtime 持有的模型／工具运行时句柄不构成生命周期宿主，释放或销毁 Agent runtime 不取消这些执行。会话归档取消其名下执行；取消 Run 取消其模型调用和前台工具，已转后台工具沿既有规则继续，Run 外调用不受影响。
>
> **EN**: All three runtime types belong to the session for lifetime governance; a run governs its associated work. Cancellation propagates by an explicit session, run, or call target. Model/tool handles held by an agent runtime confer no lifetime ownership: releasing or destroying that agent runtime does not cancel those executions. Archiving a session cancels its executions; cancelling a run cancels its model calls and foreground tools, while background tools continue under existing rules and calls outside that run are unaffected.

- **形态**：规则
- **出处**：[PF-012 §6.13](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)（rev 25）；[PF-006 §6.5](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#65-工具执行有自己的运行时绑定在-session-上)（rev 24）
- **别混**：宿主在此指治理归属，不是调用栈父协程。归档、休眠和加载位置变化不是同一动作；句柄降到零也不构成取消。取消请求不保证不可撤销效果消失。
- **弃用说法**：~~模型运行时永远挂在 Agent runtime 上~~、~~等模型时不能回收 Agent runtime~~、~~转后台就是换宿主~~。2026-09-29 的产品要求取代 [现行词义](../index.md) 中旧模型宿主表述，历史记录保留。
- **注意**：`spawn`／`delegate` 子会话仍按归档规则递归停止；`handoff` 的独立主会话不在该递归范围。

### UL-graceful-cancellation · 优雅取消 · Graceful Cancellation

> **中**：结束一个运行时的**显式动作**：**先不再接新工作，等手上的事真正停当，再释放资源。**
> **不是「没人用就自己没了」**——未结算的工作、未释放的资源、未交代的失败，
> **都必须在这个过程里有结果**。
>
> **EN**: The **explicit** act of ending a runtime: **stop taking new work, wait until
> what is in hand has genuinely settled, then release the resources.** **Not "it just
> disappears when nobody uses it"** — unsettled work, unreleased resources and
> unreported failures **must each reach an outcome** in the process.

- **形态**：过程
- **出处**：[PF-012 §6.13](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走) · [§6.14](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#614-停止有两级)（rev 25）
- **弃用的说法**：**「实例退役 / Instance Retirement」**——
  2026-09-20 之前的名字，主语是已退役的「运行实例」，见 [现行词义](../index.md)
- **注意**：**等人回话时 agent runtime 可以被取消**——**等待是一个持久的事实，不是一个协程的姿势**。
  协程没了，**会话还在**

### UL-forced-stop · 强制停止 · Forced Stop

> **中**：**立刻撤销继续执行的资格。**快，但**已经发出去的外部效果收不回来**。
> 因此它的反馈必须把**逻辑停止、实际停止、外部效果**三者**分别说清**。
>
> **EN**: **Immediately revoking the right to continue executing.** Fast, but
> **external effects already emitted cannot be recalled**. Its report must therefore
> state **logical stop, actual stop and external effects separately**.

- **形态**：过程
- **出处**：[PF-012 §6.14 停止有两级](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#614-停止有两级) ·
  [§6.15](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#615-取消先落日志再发信号)（rev 25）
- **别混 ①**：**「已经停止」与「外部效果已经撤销」不是一回事**
- **注意 ⓪**：**被它杀掉的那副协程写不了终结条目**——
  所以[终结条目由会话这一侧写，并标注「可能存在未收尾的外部效果」](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#强制停止的三步闭环)
- **别混 ②**：与[撤销不等于强制停止](circulation-and-entitlement.md#ul-revocation-is-not-stop--撤销不等于强制停止--revocation-is-not-a-stop)那一条配着读——
  **撤权管的是下一道准入，这个管的是正在跑的**
- **注意**：**它与[优雅取消](#ul-graceful-cancellation--优雅取消--graceful-cancellation)是同一件事的两级**，
  **传播范围则一样**——都照[取消跟着宿主走](#ul-cancellation-follows-host--取消跟着宿主走--cancellation-follows-host)


### UL-job-session · 作业会话 · Job Session

> **中**：为一个需要 agent 执行的定时作业新建并专属承接其执行部分的会话子类型；沿用会话身份与生命周期，强制附加面向该作业的成果提交或上报工具，以及检查其目标完成情况的 Loop 拓展。
>
> **EN**: A session subtype created for the agent-executed part of one scheduled job, whether execution-only or execution with notification; mechanical system jobs do not use this subtype. It retains session identity and lifecycle semantics while requiring a job-result reporting tool and a loop extension that checks objective completion, regardless of the selected agent definition.

- **形态**：变体（父：[会话](#ul-session--会话--session)）
- **出处**：[PF-021 §4 作业会话](../../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#作业会话)（rev 8）
- **别混**：这不是 PF-015 从 AgentDefinition 推导的用途分类，也不自动表示 parent-child 关系中的子会话。

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)

### UL-session-execution-type · 会话执行类型 · Session Execution Type

> **中**：会话承担的执行职责分类，决定该会话必须绑定的能力与 loop extensions。创建时确定，其必需能力身份集合在会话运行期固定；与描述主要用途的会话类型不同。
>
> **EN**: A session's execution role, determining its mandatory capabilities and loop extensions. It is established at creation; the required capability identities remain fixed during the session. It is distinct from the session's purpose classification.

- **形态**：属性
- **出处**：[PF-015 §4 会话执行类型](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#会话执行类型)（rev 21）
- **别混**：不是权限、执行环境或协作模式，也不是一个独立对象。

### UL-runtime-handle · 运行时句柄 · Runtime Handle

> **中**：持有者用于访问某一次 Model runtime 或 Tool runtime、等待其结果或请求控制的引用。句柄不拥有被引用执行的生命周期；释放句柄不取消执行，句柄数量也不决定执行存活。执行身份与状态独立于句柄，允许新的持有者按归属和访问资格重新取得引用。
>
> **EN**: A reference used to access a particular model or tool runtime, await its result, or request control. A handle does not own the referenced execution's lifetime: releasing it, even the last handle, does not cancel execution. Execution identity and state are independent of handles, allowing eligible holders to acquire a new reference.

- **形态**：属性
- **出处**：[PF-012 §6.13](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)（rev 25）
- **别混**：不是持久化的调用／执行身份，不是独立治理对象；取得句柄不另授控制权限，也不规定具体语言的句柄类型。
