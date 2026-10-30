# 执行与收场

**这一卷回答：一件事怎么跑、跑时跟外面说什么、跑偏了谁接手、最后怎么了结。**

收在这里的是**一次执行本身**及其产物与终局，
以及**事情没按正常走时，处置权怎么在各层之间移动**。
**够不够得着**归[取用与可用性](reach-and-availability.md)，
**谁在发起**归 [Agent 运行时闭环](agent-runtime-loop.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

> **「工具」这个词指三样东西，寿命各不相同**，混起来就会得出错的结论：
>
> ```text
> 工具定义 ──装配──→ 动作空间里的条目 ──调用──→ 工具执行
>  装载时派生           会话已知条目         计算资源，绑会话
> ```
>
> **最要紧的是第三段绑在会话上**，不绑 agent runtime 、也不绑发起它的那次运行。
> 见 [PF-006 §5.2](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同)。

## 一次执行

### UL-tool-programmability · 工具可编程调用许可 · Tool Programmability

> **中**：工具定义上的可选属性 `programmable`，表示是否允许 Agent 通过脚本组合或编排该工具的调用。只有显式 `true` 表示允许，省略或 `false` 表示不支持这种调用方式。
>
> **EN**: The optional `programmable` property of a tool definition. It permits an agent to call the tool from a script that combines or orchestrates tool calls. Only explicit `true` permits this use. An omitted value or `false` does not.

- **形态**：属性
- **出处**：[工具执行：可编程调用许可](../../product/tool-execution/design.md#可编程调用许可)（rev 5）
- **别混**：不是当前动作授权、常驻标记或后台许可。独立程序消费 SDK 不自动属于 Agent 脚本编排；脚本经 SDK 或通用调用入口间接调用工具，仍属于该许可的范围。

### UL-tool-definition · 工具定义 · Tool Definition

> **中**：**一个[工具](capabilities-and-composition.md#ul-tool--工具--tool)在模型与执行面前的那份完整表示**——叫什么、干什么的说明、收什么参数（每个参数各带说明）、返回什么，以及它的可选声明（能不能后台、需要什么设施等）；
> **工具说明与每个参数的说明必填**，缺了就不是一份完整的定义。
> 其中**目标环境与转后台阈值两项声明的是[设置项](capabilities-and-composition.md#ul-setting--设置--setting)的形状与默认值**，各层配值；
> 声明之外，**前台上限与并发上限两项偏好类设置的默认值也由它给**。
> **多命令工具在模型面前只有一种样子——一份一行一命令的紧凑命令清单**：每个命令那一行说明必填；
> 作者带不带各命令的完整参数由他定，带了只供系统校验与 `inspect`/`help` 答用法，**不进模型面前**。
> 它不是作者直接写下的数据。系统装载工具实现时，从工具资产的一个已发布版本与该资产引用的实现派生它：名字、所需能力与可编程声明取自资产；参数形状、命令表、说明、能不能后台与其余声明取自实现。它记下的采用版本等于那个资产版本。
> 资产的名字、能力名与定义的名字必须一致，不一致时系统拒绝装载。
>
> **EN**: **A tool's identity and representation at the data and governance level** — its
> name, a description of what it does, the arguments it takes (each with its own description),
> what it returns, plus its optional declarations (whether it may run in the background, which
> facilities it needs, and so on); **the tool description and every argument's description are
> required** — without them the definition is incomplete. Of the declarations, **target
> environment and the background-conversion threshold declare the shape and default of a
> setting entry**, whose values the layers assign; beyond the declarations, **it also gives
> the defaults of two preference settings, the foreground limit and the concurrency limit**.
> **A multi-command tool has exactly one shape in front of the model — a compact one-line-per-command
> list**: each command's line of description is required; whether the author includes each command's
> full arguments is the author's call, and if included they serve only validation and `inspect`/`help`,
> **never reaching the model**.
> It is not data that an author writes directly. When the system loads a tool implementation,
> it derives the definition from one published version of the tool asset and the
> implementation that the asset references. The name, the required capabilities and the
> programmable declaration come from the asset. The argument shape, the command table, the
> descriptions, background permission and the other declarations come from the implementation.
> The adopted version it records equals that asset version. The asset name, the capability
> name and the definition name must match; the system refuses to load a mismatch.

- **形态**：视图
- **出处**：[PF-006 §5.2](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同) · [§5.3](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样) ·
  [工具说明与每个参数的说明，必填](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#工具说明与每个参数的说明必填) ·
  [多命令工具的定义里带多少](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#多命令工具的定义里带多少是工具作者的权衡)（rev 24） · [PF-002 §4 Tool](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#tool)（rev 32）；装载时派生与各字段的来源见已采用的 [RFC-0012 对象链](../../../../docs/rfcs/RFC-0012-tool-dynamics.md#对象链)，形态由属性改为视图的理由见 [C-66](../conflicts.md#c-71工具定义由长期数据改为装载时派生)
- **别混**：与[工具](capabilities-and-composition.md#ul-tool--工具--tool)不是一回事——
  工具是那一类资产，**工具定义是资产与实现合成出的那一份表示**；
  同一个身份下，官方、组织、租户、工作区各层的资产各自派生自己的一份，形状可以不同
- **注意 ⓪**：会话为每个[常驻工具](reach-and-availability.md#ul-resident-tool-set--常驻工具集合--resident-tool-set)保存它首次采用的那一份定义，作为判断[同形](reach-and-availability.md#ul-same-shape--同形--same-shape)的基准
- **注意 ①**：**有三样刻意不在定义里**——[等待态](#ul-tool-wait-state--工具等待态--tool-wait-state)、[发帧](#ul-frame-emission--发帧--frame-emission)，
  以及[这一次的结果要不要卸载](#ul-result-offloading--结果卸载--result-offloading)。
  **三样都取决于这一次跑成什么样**，而定义里写的是这个工具跟参数无关的固有属性
- **注意 ②**：**两种写法的多命令工具在模型面前一模一样**——agent 对不熟的命令动手前仍要先经 `Tools().inspect` 或 `help` 问一次详细用法

- **可编程调用**：定义可声明[工具可编程调用许可](#ul-tool-programmability--工具可编程调用许可--tool-programmability)，省略不授予脚本编排许可。

### UL-tool-execution · 工具执行 · Tool Execution

> **中**：**一次工具执行。**它**是计算资源**，**有自己独立的运行时，绑在[会话](agent-runtime-loop.md#ul-session--会话--session)上**——
> 不绑 agent runtime，也不绑发起它的那次[运行](agent-runtime-loop.md#ul-run--运行--run)；**收件人始终是会话**。
> **前台 / 后台说的是当前步骤是否仍须等它的前台结果，Agent runtime 在场时通过句柄等待**，不是它挂在谁身上。
> 因此**一次运行结束了，它发起的执行可以还在跑**；agent runtime 被回收，**任何工具执行都不受影响**——Run 记着协程在等哪一次，新协程起来接着等。
>
> **EN**: **One execution of a tool.** It **is a compute resource** with **a runtime of its
> own, bound to the session** — not to the agent runtime, nor to the run that started it;
> **the addressee is always the session**. **"Foreground" and "background" say whether
> the current step still depends on its foreground result, even if no agent runtime currently holds a handle**, not whose it is. So **a run may end
> while an execution it started is still going**; when the agent runtime is reclaimed, **no
> tool execution is affected** — the Run records which execution the coroutine was waiting on,
> and the new coroutine resumes waiting.

- **形态**：对象
- **出处**：[PF-006 §4 Tool Execution](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#tool-execution)（rev 24） · [§5.2](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同)（rev 24） · [§6.5](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#65-工具执行有自己的运行时绑定在-session-上)（rev 24）
- **注意 ①**：**是哪次运行、哪个 agent runtime 发起的，都记得下来，但都不绑生命周期**；取消一次运行时前台的落「被中断」、原因「运行被取消」，是因为那一步不要了
- **注意 ②**：**[会话被归档](../../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#63-归档先停活儿再落状态)时仍未结束的，不论前后台，收场都是[被中断](#ul-execution-outcome--执行收场--execution-outcome)**——
  收件人都没了；**这一刀不可逆**，撤销归档不会把它接回来
- **注意 ③**：**同一个会话里同一个工具同时在执行的次数有上限时，超出的排队、不被拒**——[工具并发上限](#ul-tool-concurrency-limit--工具并发上限--tool-concurrency-limit)按会话算，前台后台一起数

### UL-background-execution · 后台执行 · Background Execution

> **中**：一次工具执行**不占着当前这一轮**地跑。
> 它由[工具定义](#ul-tool-definition--工具定义--tool-definition)声明**能不能后台**（作者的许可），**不声明就是不能后台**；
> **前台跑超过多久自动转后台**是一项[偏好类设置](capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category)，定义给形状与默认值、各层配值。
> **它与[等待态](#ul-tool-wait-state--工具等待态--tool-wait-state)是两个维度**，四种组合都成立。
>
> **EN**: A tool execution running **without holding the current turn**. The tool
> definition declares **whether it may** (the author's permission); **absent a declaration,
> it may not**. **After how long in the foreground it converts automatically** is a
> preference-class setting: the definition gives its shape and default, the layers assign
> values. It is **a dimension separate from the wait state** — all four combinations are possible.

- **形态**：状态
- **出处**：[PF-006 §6.6](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)（rev 24）
- **注意 ①**：**默认往保守的那一边倒**——**没表过态，不等于表了同意**
- **注意 ②**：**「发起时就在后台」与「中途转后台」的决定权不同**——
  前者[由 agent 自己定](../../product/meta-capabilities/design.md#meta-shell)，前台那一次调用当场以转后台收场，**不算一次「转」**；
  后者[有三个触发源](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)：
  **跑到转后台时长或前台上限时自动转 · 用户手动切 · 用户插队时系统顺带触发**
- **注意 ③**：**哪条路都不绕开声明**——工具没声明允许后台，插队或到了前台上限时它是[被中断](#ul-execution-outcome--执行收场--execution-outcome)，不是被转后台；发起时就要后台，也起不来
- **注意 ④**：**本版要等应答的执行只在前台等**——[「后台 × 在等待」这一格关着](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)；两个维度仍然正交，关着的是这一版的用法

### UL-foreground-time-limit · 前台上限 · Foreground Time Limit

> **中**：**工具的一项偏好类[设置](capabilities-and-composition.md#ul-setting--设置--setting)：一次执行在前台最多跑多久。**
> 停在[等待态](#ul-tool-wait-state--工具等待态--tool-wait-state)上的时间不算，转了后台之后也不再算。
> 到了上限，**允许后台的转后台；不允许的被中断**，[占位原因](record-and-context.md#ul-placeholder-reason--占位原因--placeholder-reason)写「前台超时」——**这不是失败**。
> 定义给默认值，持有它的各层可以改；**不设就没有这一项限制**。
>
> **EN**: **A preference setting on a tool: how long one execution may run in the foreground.**
> Time spent in a wait state does not count, nor does anything after the execution moves to the
> background. At the limit, **a tool that permits background execution moves there; one that does not
> is interrupted**, with the placeholder reason "foreground timeout" — **which is not a failure**. The
> definition supplies the default and each holding layer may change it; **left unset, there is no such
> limit**.

- **形态**：属性
- **出处**：[PF-006 §6.6 前台上限与并发上限](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#前台上限与并发上限)（rev 24） ·
  [PF-002 §4 Tool](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#tool)（rev 32）
- **别混**：**不是「前台跑多久自动转后台」那一项**——那是允许后台的工具[另一项偏好设置](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#其中两项声明的是设置项)；前台上限对不许后台的工具同样起作用，到点被中断
- **注意**：**等人的时间不算，是有意的**——[`Ask()`](../../product/meta-capabilities/design.md#meta-ask) 停在前台等人永不过期，把等人算进来，它就成了一个替人签字的到点

### UL-tool-concurrency-limit · 工具并发上限 · Tool Concurrency Limit

> **中**：**工具的一项偏好类[设置](capabilities-and-composition.md#ul-setting--设置--setting)：同一个会话里，同一个工具同时在执行的最多几次**，前台后台一起算。
> **超出的排队，按发起的先后轮到，不拒绝。**定义给默认值，持有它的各层可以改；**不设就没有这一项限制**。
>
> **EN**: **A preference setting on a tool: at most how many executions of that same tool may run at
> once within one session**, foreground and background counted together. **Executions beyond it queue
> and proceed in order of launch; none is refused.** The definition supplies the default and each
> holding layer may change it; **left unset, there is no such limit**.

- **形态**：属性
- **出处**：[PF-006 §6.6 前台上限与并发上限](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#前台上限与并发上限)（rev 24） ·
  [PF-002 §4 Tool](../../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#tool)（rev 32）
- **别混**：**裸写「并发上限」不作数**——它只数同一个会话里的同一个工具，不是会话、租户或整个系统的并发

### UL-model-call · 一次模型调用 · Model Call

> **中**：**把攒好的一次请求发给模型，到拿回完整的一份回复为止**的那一段。
> 主流程里的那一次落在[agent 的一步](agent-runtime-loop.md#ul-agent-step--agent-的一步--agent-step)之内，
> 与[工具执行](#ul-tool-execution--工具执行--tool-execution)**是兄弟，互不包含**；
> **拓展件为运行发起的、压缩时生成摘要的、不属于任何运行的旁路提问，也都是一次模型调用**，同一套规则。
>
> **EN**: The stretch from dispatching one assembled request to the model until a
> **complete** reply has come back. The one on the main path sits inside a single agent step
> and is a **sibling of** tool execution — neither contains the other; **a call a loop
> extension makes for the run, the one that writes a compaction summary, and a side question
> that belongs to no run are model calls too**, under the same rules.

- **形态**：对象
- **出处**：[PF-013 flows §3.2 一次模型调用](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用)（rev 17） ·
  [PF-013 §5.13](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)（rev 17） ·
  [PF-011 §5.3](../../product.0.0.1.legacy/PF-011-off-nominal-handling/design.md#53-层的顺序不是排出来的是推出来的)（rev 5） ·
  [PF-012 §5.4](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#54-一步的骨架)（rev 25）
- **别混**：**不是那次请求的内容**——请求体怎么攒出来归 [PF-010](../../product.0.0.1.legacy/PF-010-context-management-and-assembly/README.md)；
  **也不是回复怎么流式拼起来**，那归 [PF-009](../../product.0.0.1.legacy/PF-009-context-message-types/README.md)
- **注意**：**这一层归 [PF-013](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/README.md)**——
  它的三个终态（**完整一份 · 上交 · 被中断**）、失败怎么分类、[什么时候算试尽](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#什么时候算试尽)，都在那里
- **注意 ②**：**每一次调用的执行由它自己的运行时承载；执行收场与模型侧结果保管、确认后的清理责任分别判断**——
  [正文叫它「模型请求的运行时」，当同一物用](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)，
  [对象条目已并入](../../domain_objects/objects.md#ul-model-call--一次模型调用)，**不另立词条**（与工具执行各自的运行时并入[工具执行](#ul-tool-execution--工具执行--tool-execution)同一分寸）；
  它受 [`runtime` 那条写死的规矩](../conventions.md#runtime-这个词本系统写死了)约束：**生命周期归会话，工作归所属 Run（已有 Run 外调用直接归会话）；Agent runtime 只持有句柄**。主流程仍等待结果，不另引入模型“转后台”模式。
  消费方确认结果已处理后，模型侧清理无用副本，原身份、真实收场和账仍保留；清理状态不使调用重新进入执行。依据 [PF-013 §6.19](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#619-消费方确认结果后清理模型侧不再需要的副本)（rev 17）。
  **这里说的是「这一次调用的那个协程」，不是承载所有这类协程的那项系统能力**——规格里以「模型请求运行时」为名的能力是另一层的东西，读到时按所在层分清（[C-31](../conflicts.md#现有冲突)）
- **注意 ③**：**完整的一份在[消息准入](agent-runtime-loop.md#ul-message-admission--消息准入--message-admission)被拒收，这次调用仍停在「完整一份」**——
  [只记下被谁否决、没有成为消息](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用)，不是故障、不交给重试挂件；
  loop 退避之后**另起一次新的模型调用**，不是这一次回到在途；连续拒收不设次数上限，也不因此使 Run 失败（原[连续否决上限](#ul-consecutive-veto-limit--连续否决上限--consecutive-veto-limit)已弃用）

### UL-upstream-send · 一次发出 · Upstream Send

> **中**：**一次[模型调用](#ul-model-call--一次模型调用--model-call)里，把请求经一家供应商发给上游的那一次。**
> 每一次发出**只走[允许的供应商](capabilities-and-composition.md#ul-allowed-providers--允许的供应商--allowed-providers)里的一家**；换一家、或退避之后再来，都是再发一次。
> 试过又失败的每一次都**留一条留痕**——哪一家、什么时候、上游回了什么状态码——**不进方程，也不进模型的上下文**；
> 重试挂件读它们，知道自己已经走到了第几家。**一次调用可以有好几次发出，却只有一份回复。**
>
> **EN**: **One dispatch of a model call's request to the upstream through a single provider.** Each
> send goes through **exactly one of the profile's allowed providers**; switching provider, or trying
> again after back-off, is another send. Every failed send **leaves a trace** — which provider, when,
> what status the upstream returned — **that enters neither the transition function nor the model's
> context**; the retry extension reads them to know how far down the list it has come. **A call may make
> several sends but has only one reply.**

- **形态**：过程
- **出处**：[PF-013 §5.5 试过又失败的那几次，留痕，不进方程](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程) ·
  [§5.12 系统自带一件默认的](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#系统自带一件默认的所以开箱就有重试) ·
  [§5.13 停机之后](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)（rev 17）
- **别混 ①**：**不是一次模型调用**——调用有头有尾、有三个终态；发出是调用里的一次尝试
- **别混 ②**：**不是[执行尝试](agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)**——那是一次运行里第几次起 agent runtime
- **注意 ①**：**[首 token](#ul-first-token--首-token--first-token) 之后不再有第二次发出**——「说话中」不回「在途」
- **注意 ②**：**首 token 之前停机、恢复后照常再发的那一次，也是一次新的发出**：上游可能两次都计了费，两笔都照实记成成本——保证的是回复只有一份，不是钱只花一次

### UL-first-token · 首 token · First Token

> **中**：**一次模型调用的回复交出的第一样内容，不论[模态](record-and-context.md#ul-modality--模态--modality)。**
> 能一点点长的块（文本 · 思考 · 工具调用的参数 · 语音），**第一片到了**算；开口之后整个交出来的块（图 · 文件 · 推理续接状态），**整块交出来了**才算。
> 响应头到了、整交的块只开了口，**都不算**——判据是「交出了内容」，不是「流有了动静」。
> **它是一次调用「已经开口说话了」的那条分界**：在它之前停了，可以照常再发；在它之后，一律不重发、不回在途。
>
> **EN**: **The first piece of content a model call's reply hands over, whatever its modality.** For a
> block that grows piece by piece (text, thinking, tool-call arguments, voice) it is **the first
> fragment's arrival**; for a block that opens and is then handed over whole (image, file, reasoning state) it is **the
> moment the whole block is handed over**. Response headers arriving, or a whole-delivery block merely
> opening, **do not count** — the test is content handed over, not the stream stirring. **It is the line
> past which a call "has started speaking"**: stopped before it, the call may simply be sent again;
> after it, never, and it does not return to in transit.

- **形态**：规则
- **出处**：[PF-013 §5.4「已经开口说话了」优先于其余各类](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) ·
  [§5.13 停机之后](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)（rev 17） ·
  [PF-009 §9.2](../../product.0.0.1.legacy/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息)（rev 9）
- **注意 ①**：**「已经开口」是账，不是在途**——它在第一份内容交到任何人眼前之前，就作为那次调用[账目](#ul-call-account--调用账目--call-account)里的一笔落进日志、带着开口的时刻；停机之后靠它判断
- **注意 ②**：**判据挂在到达方式上，不挂在模态清单上**——将来多一种内容块，它归哪种到达方式，首 token 就落在哪个时刻
- **注意 ③**：**首 token 之后的任何故障一律不重试**，而且**优先于策略**——重试挂件也推翻不了；用户插队中断不是故障，不走这一条
- **注意 ④**：调用状态机上「在途 → 说话中」那一步，就是首 token 到了；**「已开口」「已出门」不另立词条**——前者即首 token 之后，后者即过了出门前两道、进入在途

### UL-model-response · 模型响应体 · Model Response

> **中**：**一次已进入结算责任的模型请求收场后留下的那一条耐久记录**——
> 指定哪一家、实际已知的时刻和上游状态、这次请求如何收场。每份已确认的请求责任恰好留一条：成了、断了、被中断都留。
> **请求已登记、实际发送前被取消，也须记录它的收场；这条记录本身不证明发生过[发出](#ul-upstream-send--一次发出--upstream-send)。**尚未登记请求责任的发前拒绝没有它。
> 它进[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)；**试过又失败的那几条不进方程、也不进模型的上下文**，读它们的是重试挂件与排查的人。
> 回复是另一样东西——**落成消息的是回复，不是这条记录**。
>
> **EN**: **The durable outcome record for a model request whose settlement responsibility has been established** —
> the designated provider, known actual timing and upstream status, and how the request ended. Each confirmed request
> responsibility leaves exactly one record, whether it succeeds, fails or is interrupted. **Cancellation after the request
> is registered but before transmission also leaves a record; its existence does not prove that an upstream send occurred.**
> A preflight rejection before that responsibility is established leaves none. The record goes into the session log;
> **failed records enter neither the transition function nor the model-facing context**. The retry extension and investigators
> read them. The reply is separate: **the reply becomes a message; this record does not**.

- **形态**：对象
- **出处**：[PF-013 §5.5 试过又失败的那几次，留痕，不进方程](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程) ·
  [§5.13 停机之后](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)（rev 17）
- **⚠️ 别混 ①**：**裸写「响应体」在跨 topic 的文字里不作数**——HTTP 里那个词指上游回来的那段字节；那段字节至多是本条身上的一项留存（注意 ②），不是本条
- **别混 ②**：**不是[一次发出](#ul-upstream-send--一次发出--upstream-send)**——发出是过程，本条是请求责任的收场留痕，不能据本条存在反推实际发送；**也不是[调用账目](#ul-call-account--调用账目--call-account)**——账是「花了什么」，一次发出的用量与费用落在哪一条上归规格
- **注意 ①**：**数量随每份已确认的请求责任计，不据记录条数推断实际发送次数**——[首 token](#ul-first-token--首-token--first-token) 之后不再有第二次发出，所以带回复的至多一条、且是最后一条；停机后照常再发的那一次也是新的一条，两笔钱两条都照实记
- **注意 ②**：**规格里的「上游原始响应留存」（响应头、原始字节）是它身上的一项属性，排查用，不进上下文、不进任何给人的呈现——不另立词条**；产品正文只要求[状态码原样带着](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它)、[错误信息外泄之前脱敏](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏)
- **注意 ③**：正文对失败那几次的叫法是「留痕」；成功那一次「实际用了哪条档案、带了什么参数」的留痕，正文放在「那次请求的可追溯组成」里（[PF-004 §6.6](../../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定)、[PF-013 §4 模型档案](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#模型档案)）——**两者是不是同一条记录，正文未述**，[对象条目](../../domain_objects/objects.md#ul-model-response--模型响应体)记为未裁

## 跑的过程中，跟外面说的两种话

> **方向相反，性质也相反。两个都不在[工具定义](#ul-tool-definition--工具定义--tool-definition)里。**
>
> | | **等待态** | **发帧** |
> |---|---|---|
> | 方向 | **要**一个应答进来 | **给**一点情况出去 |
> | 阻不阻塞 | **阻塞** | **不阻塞** |
> | 落空了 | 是[六种收场之一](#ul-execution-outcome--执行收场--execution-outcome) | **什么也不算** |
> | 系统要不要知道 | **必须知道** | 不必 |
>
> **等待是执行的一部分，发帧不是。**

### UL-tool-wait-state · 工具等待态 · Tool Wait State

> **中**：**一次工具执行中途停下来，等一个应答，拿到之后才继续。**
> 停下来时它说明**自己在等什么形状的东西**，后续按拿到的内容走不同的分支。
> **「谁来应答」不是这个概念的一部分**——人、外部系统、另一个 agent 都可以，形状一样。
> **要紧的是系统知道它正在等，以及它等的是什么形状。**
>
> **EN**: **A tool execution pausing mid-way to await a reply, resuming only once it
> arrives.** On pausing it states **the shape of what it is waiting for**, and branches
> on what comes back. **Who answers is no part of this concept** — a person, an
> external system, another agent; the shape is the same. **What matters is that the
> system knows it is waiting, and knows what shape it waits for.**

- **形态**：状态
- **出处**：[PF-006 §4 等待态](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#等待态)（rev 24）
- **⚠️ 别混**：**裸写「等待态」不作数。**它有两个所指——
  这一条挂在**一次工具执行**上，另一条
  [运行等待态](interaction-and-dispatch.md#ul-run-wait-state--运行等待态--run-wait-state)挂在**一个运行**上，
  **两者挂在不同的生命周期上**
- **注意 ①**：**工具定义里没有「我会不会等」这一格**——**等不等是这一次跑出来的事**，
  同一个工具参数不同就可能这次等、下次不等
- **注意 ②**：**等多久的上限是使用者的属性，不是这个原语的属性**——
  占着资源的等待可以有上限，**不占资源的（如[问询](interaction-and-dispatch.md#ul-inquiry--问询--inquiry)）不设上限**
- **注意 ③**：**它对 run 的影响看它在前台还是后台**——
  `Ask()` 之所以把 run 也停住，**是因为它恰好是前台调用**，不是因为两者是同一件事

### UL-frame-emission · 发帧 · Frame Emission

> **中**：**一次工具执行的过程中，它主动交出一点「我正在干什么」**——
> 交出来的是[执行帧](#ul-execution-frame--执行帧--execution-frame)，
> 也就是它那条 `ToolInternalMessage` 的到达增量。
> 三条性质：**它不承诺任何事**（发不出去就发不出去，**这次调用该怎么跑还怎么跑**）；
> **系统不必预先知道哪个工具会发帧**（**绝大多数工具一帧都不发，那是正常形态**）；
> **交出来的东西自己说清它是什么**（开一个块时说明这块怎么填），**不必事先声明**。
>
> **EN**: **A tool execution volunteering, while running, a little of "what I am doing
> right now"** — what it hands over is an execution frame, i.e. an arrival increment of
> its own `ToolInternalMessage`. Three properties: **it promises nothing** (if it cannot
> get out, it cannot — **the call runs exactly as it would have**); **the system need not
> know in advance which tools emit** (**most emit none at all, and that is the normal
> case**); and **what arrives says for itself what it is** (a block states, as it is
> opened, how it is to be filled), **with nothing declared up front**.

- **形态**：过程
- **出处**：[PF-006 §4 发帧](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#发帧)（rev 24） ·
  [PF-009 §5.8](../../product.0.0.1.legacy/PF-009-context-message-types/design.md#执行帧就是这条消息的到达增量)（rev 9）
- **注意**：它补的是一个具体的窟窿——用户看着界面写着「正在调用某个工具」，**然后就没有下文了**：
  **它是卡住了，还是在正常地跑一件慢活，此前分不出来**

### UL-execution-frame · 执行帧 · Execution Frame

> **中**：**一条 `ToolInternalMessage` 的到达增量。**一次工具执行对应一条这样的消息，
> 内容是一串[内容块](record-and-context.md#ul-content-block--内容块--content-block)；
> 帧就是这条消息**一点点到达的那些动作**，走的是与模型回复**同一套到达语法**——
> 开一个块（说明这块是追加片段还是整体替换）、往里填、封上这个块、记一次账、收尾。
> **它不是另一份协议，也不是一个可以单独指认的东西。**
>
> **EN**: **An arrival increment of one `ToolInternalMessage`.** A tool execution yields
> exactly one such message, whose content is a series of content blocks; the frames are
> the steps by which that message arrives, **under the same arrival grammar as a model
> reply** — open a block (stating whether it is appended to or replaced wholesale), fill
> it, close it, account for it once, finish. **It is neither a separate protocol nor a
> separately identifiable thing.**

- **形态**：过程
- **出处**：[PF-009 §5.5](../../product.0.0.1.legacy/PF-009-context-message-types/design.md#到达的过程有它自己的语法) ·
  [§5.8](../../product.0.0.1.legacy/PF-009-context-message-types/design.md#执行帧就是这条消息的到达增量)（rev 9）
- **别混**：**裸写「帧」不作数**——那个词在别处指视频帧、网络帧
- **注意 ①**：**它落进日志的是结果，不是过程**——日志里留的是收尾之后那条完整的消息
  （封口后的块）；**到达的过程不留**。**执行怎么收场，这条消息都照常收尾**：
  被中断、失败、等不到应答时已交付的块照样留；**一块都没交付过的，就没有这条消息**。执行的收场另记，不靠它表达
- **注意 ②**：**系统不查工具定义**：不必在定义里加一格「我发不发帧」，不必核对
  「声明的和实际发的对不对得上」——**因为压根没有声明**，收到什么就按什么办
- **注意 ③**：**它留着一条路**——一个工具可以**先往外吐日志，最后再给一块汇总面板**：
  前面那些块追加片段，**最后开一个整体替换的块**

## 交出来的东西

### UL-tool-output · 工具产出 · Tool Output

> **中**：**一次工具执行交出来的东西，分三部分，读者不同**：
>
> | 部分 | 什么时候 | 谁在读 |
> |---|---|---|
> | **进消息的那部分** | 跑完 | **agent**——读就是了 |
> | **[附件](#ul-attachment--附件--attachment)** | 跑完 | **agent**——消息里告诉它地址，它自己去取 |
> | **[执行帧](#ul-execution-frame--执行帧--execution-frame)** | **跑的过程中** | **人**——**agent 看不到** |
>
> **EN**: **What one tool execution hands back, in three parts with different
> readers**: the part that goes into the message (read by the agent directly), the
> attachments (fetched by the agent from an address given in the message), and the
> execution frames emitted while running — **which are for people, and which the agent
> cannot see at all**.

- **形态**：总称
- **出处**：[PF-006 §4 工具的产出](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#工具的产出)（rev 24）
- **注意 ①**：前两部分要分，**是因为有些产出根本不适合进对话**——一张图、一个几十兆的文件。
  硬塞进去，**一条消息就把上下文吃光了**
- **注意 ②**：**帧不顶替结果。**一个工具把过程播报得再细，**跑完照样要给结果**——
  否则 agent 手上什么都没有，**它压根看不见那些帧**

### UL-call-account · 调用账目 · Call Account

> **中**：一次[模型调用](#ul-model-call--一次模型调用--model-call)或一次[工具执行](#ul-tool-execution--工具执行--tool-execution)**身上的一项属性**：
> **它花了什么、产出了多少的账**——用量、费用、砍掉了多少增量、落在哪、跑了多久。
> **每一次调用或执行各留一份，进[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)、不进给模型看的上下文**；
> **费用拿不到记「未知」，不记零**。更大的修订整份替换同一主体的旧快照。
> 同一修订、内容相同的再次送达不另加金额。内容不同则保持第一份。
> `supplier`、`observation`、`billable` 与 `ledger` 不相加。应付金额取最新修订的已知 `ledger`，否则取已知 `billable`。
> 按尝试记明细、按运行汇总。
>
> **EN**: An attribute of one **model call** or one **tool execution**: **the account of
> what it consumed and produced** — usage, cost, how many increments were trimmed, where it
> ran, how long it took. **One per call or execution, written to the session log and never
> into the model-facing context**; **a cost that cannot be obtained is recorded as
> "unknown", never as zero**. A higher revision replaces the whole earlier snapshot for
> that subject. The same revision with the same content does not add an amount. Different
> content keeps the first snapshot. `supplier`, `observation`, `billable`, and `ledger`
> are not added together. The payable amount is the latest known `ledger`, or else the
> latest known `billable`. Itemised per attempt, summed per run.

- **形态**：属性
- **出处**：[PF-006 §5.4 每一次执行都留一份账](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#每一次执行都留一份账)（rev 24） ·
  [PF-009 §5.5](../../product.0.0.1.legacy/PF-009-context-message-types/design.md#到达的过程有它自己的语法)（rev 9） ·
  [PF-012 成本两层](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错)（rev 25） ·
  [PF-013 §5.13](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)（rev 17） ·
  [PF-001 §6.4](../../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)（rev 26）
- **别混**：**不是[工具产出](#ul-tool-output--工具产出--tool-output)**——产出是给读者的东西，账是关于这次的事实
- **注意**：工具内部调外部服务产生的费用也记在这里，一次执行可以有多笔
- **注意 ②**：**一次模型调用「已经开口」也是它账目里的一笔**——第一份内容交到任何人眼前之前落进日志，
  带着开口的时刻；[停机之后靠它判断能不能重发](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)
- **注意 ③**：**运行终结之后才到的账照样落、归那个运行，并标明是迟到的**——
  [I-11](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式) 只禁止终结之后再发起新动作，不禁止补记已发起的那些
- **字段**：一份账是 JSON。`subject.kind` 是 `model_call` 或 `tool_execution`。`usage`、`cost`、`trimmed` 各自成组。`place` 是落点。`duration` 是 `utc-instant` 能解析的时长字符串，或 `{ "state": "unknown" }`。它与用量词法分属两个字段。`receipt` 是 `received` 或 `late`。`revision` 是十进制数字字符串，从 `0` 起。
- **金额**：`state` 为 `known` 或 `provisional` 时带十进制 `lexeme` 和 `unit`。`state` 为 `unknown` 时只带 `unit`。一份账是某个 `subject` 在某个 `revision` 上的整份快照。`cost` 数组里的每一项是这一份快照上的一笔独立费用，身份是它在数组中的位置。两笔相同 `source` 的费用是两笔账，都进入该来源在这份快照上的小计。
- **修订**：更大的 `revision` 整份替换同一 `subject` 的旧快照。新快照里不是 `known` 的金额不进入求和，被替换的旧 `known` 也不再进入。同一 `subject` 与同一 `revision` 再次送达且内容相同，不另加金额。内容不同则保持第一份，不在同一修订里静默替换。
- **结算**：`supplier`、`observation`、`billable` 是三份报告，`ledger` 是业务账。它们描述同一次消费，不相加。该 `subject` 的应付金额取最新 `revision` 上的 `ledger` 已知金额。没有已知 `ledger` 时，取最新 `revision` 上的 `billable` 已知金额。`supplier` 与 `observation` 不进入应付金额。因此 supplier `1.00`、billable `1.50`、ledger `1.50` 的应付金额是 `1.50`。
- **词法**：金额 `lexeme` 是 `0` 或非零开头的十进制数字，小数点后的位数由 `unit` 规定。`USD` 最多两位小数。`1.234` 拒绝，拒绝码是 `precision`。不同 `unit` 不相加，也不换算。token 用量的整数规则归模型调用。
- **来源**：`cost.source` 是 `supplier`、`observation`、`billable` 或 `ledger`。前三种是会话收到的报告。`ledger` 归业务账的拥有者。
- **削减**：会话把 `TrimRecord.removed` 写入 `trimmed.lexeme`。流装配不持有这份账。

一份已收到的账可以同时带已知用量和未知费用。

```json
{
  "subject": { "kind": "model_call", "id": "call_01" },
  "usage": [{ "name": "input", "state": "known", "lexeme": "128", "unit": "token" }],
  "cost": [{ "state": "unknown", "unit": "USD", "source": "supplier" }],
  "trimmed": { "state": "known", "lexeme": "20", "unit": "token" },
  "place": "provider-a",
  "duration": "PT1.5S",
  "receipt": "received",
  "revision": "0"
}
```

`source` 为 `ledger` 时，费用是业务账拥有者的记录。

```json
{
  "subject": { "kind": "model_call", "id": "call_01" },
  "usage": [{ "name": "input", "state": "known", "lexeme": "128", "unit": "token" }],
  "cost": [{ "state": "known", "lexeme": "0.02", "unit": "USD", "source": "ledger" }],
  "trimmed": { "state": "unknown", "unit": "token" },
  "place": "provider-a",
  "duration": { "state": "unknown" },
  "receipt": "received",
  "revision": "0"
}
```

### UL-attachment · 附件 · Attachment

> **中**：一次工具执行**跑完时存进某个存储、不直接进对话**的产出。
> 消息里告诉 agent 地址，**由它自己去取**。
>
> **EN**: Output that a tool execution **writes to storage on completion rather than
> placing in the conversation**. The message tells the agent where it is, and **the
> agent fetches it itself**.

- **形态**：对象
- **出处**：[PF-006 §4 工具的产出](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#工具的产出)（rev 24）
- **注意**：**产出带附件的工具需要[声明自己依赖的存储](reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration)**，
  并且得有一个能从那个存储把它读出来的工具

### UL-result-offloading · 结果卸载 · Result Offloading

> **中**：**即便是「进消息的那部分」，也可能大到装不下。**卸载 =
> **原始结果存起来，消息里换成一条带摘要的占位**。
> **卸载不是全卸载**：占位里留着**够用的那部分内容**，加上有多大、怎么取全文——
> **很多时候 agent 看占位就够了，根本不必去取全文，这正是它值得做的理由**。
>
> **EN**: **Even the part meant for the message can be too large to fit.** Offloading
> means **storing the original result and putting a summarising placeholder in the
> message instead**. **It is not a wholesale offload**: the placeholder keeps **enough
> of the content to be useful**, plus how large the whole is and how to fetch it —
> **often the placeholder is all the agent needs, which is exactly why this is worth
> doing**.

- **形态**：过程
- **出处**：[PF-006 §4 卸载](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#卸载)（rev 24） · [§6.10](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度)（rev 24）
- **别混**：**裸写「卸载」不作数**——那个词在别处指卸载插件、卸载软件
- **⚠️ 注意**：**「换成」说的是相对于原始结果，不是在记录里替换。**
  [会话日志里从头到尾只有占位那一条](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关)——
  **原始结果从来没进过日志**；而 agent 取回全文，是**往后追加两条新消息**
- **注意**：**它与前台/后台、与等待态是三个不耦合的维度**
- **注意**：**取回全文要能分页**——不分页就等于把刚卸下去的东西原样搬回来，**卸载当场作废**

### UL-offloaded-result · 被卸载的原始结果 · Offloaded Result

> **中**：一次[工具执行](#ul-tool-execution--工具执行--tool-execution)**本该进消息、
> 却因为太大而被[卸载](#ul-result-offloading--结果卸载--result-offloading)存起来的那一份完整结果**。
> **它从来没进过[会话日志](record-and-context.md#ul-session-log--会话日志--session-log)**——
> 进去的一直是那条占位。agent 要看它得**分页取回**，
> 而取回是**往后追加两条新消息**，不是把占位换回去。
>
> **EN**: The **full result** of a tool execution that was meant for the message but got
> **stored aside instead, because it was too large to fit**. **It never entered the
> session log** — what went in was the placeholder, all along. An agent that wants it
> **fetches it back a page at a time**, and fetching **appends two new messages** rather
> than putting the original back where the placeholder sits.

- **留存边界**：全文可回取不因卸载、压缩、Run 结束或会话归档而过期；产品未设删除或到期回收规则。读取仍受权限约束。
- **形态**：对象
- **出处**：[PF-006 §4 卸载](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#卸载)（rev 24） ·
  [§6.10](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度)（rev 24） ·
  [PF-012 §5.10](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关)（rev 25）
- **别混 ①**：**不是那条占位**——占位进了消息，带着够用的那部分、有多大、怎么取；
  **这一条是被留在外面的那份全的**
- **别混 ②**：**不是[附件](#ul-attachment--附件--attachment)**——
  附件是工具**有意**不放进对话的产出，这一条是**本该进对话、只因太大而被挪走**的
- **弃用**：~~「工具原件」~~——[「原件」在模态那边另有所指](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#转换件)
  （一个内容块里没被转成文本的那一份）

### UL-delivery-release · 交付责任解除 · Delivery Release

> **中**：**生产方（一次模型调用或一次工具执行）对一份已收场结果所负交付责任的解除。当前合法消费者已处理完成该结果，或已可靠保存后续所需的内容、原身份和处理位置之后，解除才成立。**
> 解除只有两条路径：先完成处理并可靠保存完成事实，或先可靠保管内容再处理。
> 读取、展示、拿到引用和开始处理，都不足以解除。
> 模型一侧的解除叫 ACK，另要求整次调用真实收场，重试与等待重试决定期间不能解除；工具一侧解除对应的待交付关系，不删除工具全文。
> 解除之后，接续从消费侧保存的数据继续。
>
> **EN**: **The release of a producer's duty to deliver a settled result, where the producer is one model call or one tool execution. It takes effect once the current legitimate consumer has finished processing the result, or has durably saved the content, original identity and processing position that later work needs.** There are two paths: finish processing and save the completion fact, or save the content first and process it later. Reading, displaying, receiving a reference and starting to process are not enough. On the model side the release is the ACK. It also requires the whole call to have truly settled, and it cannot happen while a retry or a retry decision is pending. On the tool side it releases the matching hand-over obligation and does not delete the full tool result. After the release, continuation proceeds from the data the consumer saved.

- **形态**：过程
- **出处**：[产品页 模型调用 J-MD06](../../product/model-invocation/design.md#j-md06)（rev 3）；[产品页 工具执行 结果保管、卸载与模型采用](../../product/tool-execution/design.md#结果保管卸载与模型采用)（rev 5）；[产品页 Agent J-AG06](../../product/agent-progression/design.md#j-ag06)（rev 4）
- **别混 ①**：**不是[执行收场](#ul-execution-outcome--执行收场--execution-outcome)**——收场是一次执行的终局，解除发生在收场之后，由消费侧的保管或处理触发
- **别混 ②**：**不是读取方对事件流的确认**——Agent 契约的 `acknowledge` 只清理满足保留政策且责任已交清的事件，不证明任何结果已处理，也不证明业务终态，见 [Agent 契约的确认](../../../../packages/agent/agent-contract/SPEC.md#确认)
- **注意**：产品正文与 Model 契约用 ACK 指模型一侧的解除；本词表的正式名是「交付责任解除」，英文 Delivery Release，ACK 是它在模型一侧的通称。工具一侧的两条路径归 [Tool 契约](../../../../packages/tool/tool-contract/SPEC.md#可靠交接与处理的两条路径)

### UL-consumption-position · 消费位置 · Consumption Position

> **中**：一次模型调用或一次工具执行的结果要交回的那个位置：哪个消费者、为了什么用途、在哪一处等它。
> 在会话里，它是原运行中发起这次调用的那一处，例如一次等待、一个扩展判断位置或一次压缩判断；
> 程序独立调用时，它是该调用方自己的接收处。结果、失败、迟到的账目与不可用的逻辑结果都回到它，不变成一条新输入。
> 它在调用发起时确定，换推进者、重建实例或恢复都不改变它。
>
> **EN**: The place where the result of one model call or one tool execution must return: which consumer,
> for what use, and where it waits. In a session it is the place in the original run that issued the call,
> such as a wait, an extension decision point or a compaction decision. When a program calls on its own,
> it is that caller's own receiver. Results, failures, late accounts and unavailable logical results all
> return to it, and none of them becomes a new input. It is fixed when the call is issued. A new advancing
> attempt, a rebuilt instance or a recovery does not change it.

- **形态**：属性
- **出处**：[会话与工作：会话治理工作，三个 runtime 分别承担实际运行](../../product/sessions-and-work/design.md#会话治理工作三个-runtime-分别承担实际运行) · [一次工作可以等待、恢复和并行调用](../../product/sessions-and-work/design.md#一次工作可以等待恢复和并行调用)（rev 7）；[工具执行：定义、已知能力与一次执行](../../product/tool-execution/design.md#定义已知能力与一次执行)（rev 5）；[模型调用：每次真实发出和失败](../../product/model-invocation/design.md#每次真实发出和失败)（rev 3）
- **别混**：不是 [Loop 拓展点](agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point)。拓展点是设计时穷举的固定位点；消费位置随每次调用产生，指那次调用的接收处
- **注意**：[交付责任解除](#ul-delivery-release--交付责任解除--delivery-release)要求消费侧保存原身份与处理位置，那个处理位置就是消费位置

## 怎么了结

### UL-execution-outcome · 执行收场 · Execution Outcome

> **中**：**一次工具执行的终局，有六种**，**agent 必须分得清**，因为下一步动作完全不同：
>
> | 收场 | English | agent 该怎么办 |
> |---|---|---|
> | **完成** | Completed | 继续 |
> | **失败** | Failed | 重试、换招，或报告 |
> | **不可用** | Unavailable | **绕路**——别重试，重试一百次也一样 |
> | **转后台** | Moved to Background | **先干别的**，跑完了会来通知——它是前台那一次调用的收场，后台那段执行另有自己的收场（完成、失败、被中断、等不到应答之一；本版后台不进等待，最后一种不出现） |
> | **被中断** | Interrupted | **别自动重试**——重试就是无视停掉它的那个意思；来处都是有意的停止：用户叫停（含插队）、这次运行被取消时它还在前台、agent 掐掉自己发起的后台执行、会话归档，以及不许后台的执行跑到了前台上限。**agent runtime 被回收不在其列** |
> | **等不到应答** | No Reply | 按等不到处理，**不是失败也不是被拒** |
>
> **六种都以正常的工具返回消息到达 agent**（后台那段执行的收场以提醒到达），语义写在消息里；
> **没有一种是以报错的形式抛给它的**。
>
> **EN**: **The terminal state of a tool execution — six of them**, and **the agent
> must tell them apart**, because the next move differs entirely. **All six reach the
> agent as an ordinary tool-return message** (the outcome of the backgrounded stretch
> arrives as a reminder) carrying the semantics; **not one of them is raised at it as an error.**

- **形态**：状态
- **出处**：[PF-006 §5.5](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)（rev 24） · [§6.7](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#67-用户可以中断而中断不是失败)（rev 24）
- **别混**：**与 [Run 的「收束」不是一回事](agent-runtime-loop.md#ul-run--运行--run)**——
  **粒度差着好几层**。**裸写「收场」只指工具这一层的这六种**
- **注意 ①**：**四种「非完成」里只有一种是失败。**混成一种，agent 的下一步必然错：
  **该绕路时死磕，该等待时重来，用户刚叫停它又跑一遍**
- **注意 ②**：**报错不带语义，agent 只能猜**——这是六种都走正常返回的理由
- **注意 ③**：**「异常中断」属于失败那一格写给 agent 的原因，不是「被中断」**——
  据点停机时没了的工具执行[停了就不重来](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#停机之后它不重来)（rev 24），
  恢复时[对账追补](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#先对账再进方程)的那一条收场是失败、原因写异常中断（rev 14）
- **注意 ④**：**参数说完了却解析不了的调用，收场是失败**——[不执行，原因写参数解析不了，照常回给 agent](../../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#参数说完了却解析不了的调用不执行以失败回给-agent)；
  与流断在半路时没长完的半截调用不是一回事
- **注意 ⑤**：**「原因」是这几种收场上的取值，不是更多的收场**——
  [占位与提醒的原因](record-and-context.md#ul-placeholder-reason--占位原因--placeholder-reason)落在转后台、被中断、失败三格上，一格都没多

### UL-consecutive-veto-limit · 连续否决上限 · Consecutive Veto Limit

> **中**：**已弃用：现行规则里没有这项上限。**它原指同一步里模型的回复被[消息准入](agent-runtime-loop.md#ul-message-admission--消息准入--message-admission)连续拒收的次数上限，到了上限运行落失败。
> 现行规则是：连续拒收不设次数上限，也不因此使运行失败。每被拒收一次，那次模型调用照常结束，退避之后另起一次新的模型调用。
>
> **EN**: **Deprecated: the current rules have no such limit.** It used to mean the maximum number of times in a row,
> within one agent step, that a model reply may be rejected at message admission, with the run failing at the limit.
> Under the current rules, consecutive rejections have no count limit and do not by themselves fail the run. Each
> rejection ends that model call normally, and a new model call starts after back-off.

- **形态**：属性
- **出处**：[产品页 模型回复与工具结果](../../product/agent-progression/design.md#模型回复与工具结果)（rev 4）；
  原定义见封存 [PF-012 §5.8 否决按消息是谁产生的分三路](../../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)（rev 25）
- **别混**：**不是[试尽](#ul-retry-exhaustion--试尽--retry-exhaustion)**——试尽只管故障；被拒收的回复不是故障，不交给重试挂件，也不算试过一家
- **弃用**：~~连续否决上限~~ ~~Consecutive Veto Limit~~——现行规则没有这项上限，不另起替代词；已接受系统页 [Agent runtime](../../../../docs/architecture/runtime/agent-runtime.md#回复准入与动作处理) 写法相同

### UL-open-work · 未结工作 · Open Work

> **中**：一个会话里已经发起或已经受理、还没有了结的工作：未终结的运行，还在等人答复的卡片，
> 尚未收场的模型调用与前台、后台工具执行（包括运行之外的调用），以及已受理但还没处理完的输入与任务
> （包括已被运行承接、还没进过一次模型请求的输入）。它从会话日志算出，不另存一份。查询失败、结局未知的执行仍算未结。
>
> **EN**: Work in one session that has been issued or accepted but has not yet come to an end: an
> unterminated run, a card still waiting for a human answer, a model call or a foreground or background
> tool execution that has not settled (including calls outside any run), and accepted inputs and tasks not
> yet fully handled (including inputs a run has claimed but no model request has carried yet). It is
> computed from the session log and not stored separately. An execution whose query failed and whose
> outcome is unknown still counts as open.

- **形态**：视图
- **出处**：[会话与工作：一次工作可以等待、恢复和并行调用](../../product/sessions-and-work/design.md#一次工作可以等待恢复和并行调用) · [管理主子关系和自动归档](../../product/sessions-and-work/design.md#管理主子关系和自动归档)（rev 7）；[运行感知与一次模型请求 §7](../../product/runtime-context/design.md#7-压缩保留历史与未完工作)（rev 5）
- **别混**：不是[运行等待态](interaction-and-dispatch.md#ul-run-wait-state--运行等待态--run-wait-state)。运行等待态说一次运行此刻停在哪里；未结工作说整个会话还欠着什么，运行终结后仍在执行的后台工具也算
- **注意**：同一份未结工作供三处判断：运行能否完成、会话是否连续空闲、压缩时哪些历史条目必须留在[保留名单](record-and-context.md#ul-retained-set--保留名单--retained-set)里或覆盖范围之后

## 跑偏了谁接手

### UL-nominal-path · 主路径 · Nominal Path

> **中**：**一层在没有任何[非常态](#ul-off-nominal--非常态--off-nominal)时，本该是什么样子。**
> **两种形态都算**：**推进式**——从开始走到结束；**稳态式**——持续成立的那个状态，
> 不推进到任何终点。**它是这一层自己的路**——同一件事，可能让里面那一层偏离了主路径，
> 而外面那一层照走不误。
>
> **EN**: **What a layer is supposed to look like when nothing goes off-nominal.** It takes
> **two forms**: *progressive* — running from start to finish; *steady* — a state that simply
> holds, arriving nowhere. It belongs to **that layer alone** — one and the same occurrence may
> take an inner layer off its path while the outer layer proceeds untroubled.

- **形态**：属性
- **出处**：[PF-011 §4 主路径](../../product.0.0.1.legacy/PF-011-off-nominal-handling/design.md#主路径)（rev 5）
- **注意 ①**：**中文取好懂的说法，英文取航天惯用的 `nominal`**——
  两边各自成立，**不是互译**
- **⚠️ 注意 ②**：**稳态式照样会偏离。**租户那一层的主路径是「作为可用的归属边界持续成立」——
  **不写明这第二种形态，给那一层填四要素时会卡在第一格**
- **注意 ③**：**每一层都有自己的主路径**，而[层数不固定](../../product.0.0.1.legacy/PF-011-off-nominal-handling/design.md#52-一层要声明四样)

### UL-off-nominal · 非常态 · Off-Nominal

> **中**：**某一层此刻不在它的[主路径](#ul-nominal-path--主路径--nominal-path)上。**
> **它是一个状态，不是一类事**——造成它的那件事照样是一件[发生的事](record-and-context.md#ul-occurrence--发生的事--occurrence)，
> 照样产出[记录条目](record-and-context.md#ul-record-entry--记录条目--record-entry)。
> **同一件事的两个面。**
>
> **EN**: **A layer is, right now, not on its nominal path.** It is **a state, not a kind of
> occurrence** — whatever caused it is still an occurrence and still yields record entries.
> **Two faces of one and the same thing.**

- **形态**：状态
- **出处**：[PF-011 §4 非常态](../../product.0.0.1.legacy/PF-011-off-nominal-handling/design.md#非常态)（rev 5） ·
  [§5.1](../../product.0.0.1.legacy/PF-011-off-nominal-handling/design.md#51-非常态与发生的事是同一件事的两个面)（rev 5）
- **⚠️ 注意 ①**：**它与报错无关。**绝大多数非常态**根本不报错**——用户叫停、
  能力此刻够不着、等不到回音、执行转后台；**反过来，有些报错不构成非常态**——
  工具内部捕获并自行重试成功，主路径一步没偏
- **别混**：**「异常」不是它的正式说法。**[「异常」在本系统不作为术语](../conflicts.md)，裸用时是白话
- **注意 ②**：**不为它另建记录机制**——它的记录跟正常的事完全一样

### UL-escalation · 上交 · Escalation

> **中**：**一层了结不了一个[非常态](#ul-off-nominal--非常态--off-nominal)时，
> 把处置权交给外面一层。**交上去的是**下面试过的那一批的身份与分类，不是那一批本身**。
> **上交即打断**——交出去的那一层就地停住，不再往前走。
>
> **EN**: **Handing the disposition of an off-nominal state to the enclosing layer when this
> one cannot settle it.** What travels is **the identity and classification of what was tried,
> never the tried things themselves**. **Escalating halts**: the handing layer stops where it is.

- **形态**：过程
- **出处**：[PF-011 §4 上交](../../product.0.0.1.legacy/PF-011-off-nominal-handling/design.md#上交)（rev 5） ·
  [§5.8](../../product.0.0.1.legacy/PF-011-off-nominal-handling/design.md#58-上交交的是什么)（rev 5） ·
  [§6.2](../../product.0.0.1.legacy/PF-011-off-nominal-handling/design.md#62-上交即打断)（rev 5）
- **注意 ⑤**：**「外面一层」＝[层的树](../../product.0.0.1.legacy/PF-011-off-nominal-handling/design.md#53-层的顺序不是排出来的是推出来的)上的父节点**——
  层之间是包含关系，而包含关系形成的是树，不一定是一条链。
  **接手的那一层此刻不存在时，直接交给再外面一层，这不算跳级**
- **注意 ⑥**：**阶梯到[租户](subjects-and-ownership.md#ul-tenant--租户--tenant)为止**——
  组织虽在租户外面，但条目带着这个租户的内容，**交出去就跨了隔离边界**
- **⚠️ 注意 ①**：**它本身是一件[发生的事](record-and-context.md#ul-occurrence--发生的事--occurrence)**，
  产出**新的**条目；**下层原来那条一个字不改**。
  新条目的**寿命宿主取接收层那一档或更长**
- **注意 ②**：**中文不用「升级」**——那个词在版本与权限语境里都有正常用法
- **注意 ③**：**起点可以是任何一层**（看缺的那样东西在谁手上），**但往上不许跳**
- **注意 ④**：**问人不是上交**——它[横切所有层](../../product.0.0.1.legacy/PF-011-off-nominal-handling/design.md#59-问人横切所有层)，
  是每一层都能用的了结手段

### UL-retry-exhaustion · 试尽 · Retry Exhaustion

> **中**：**一次模型调用这一层已经不再有可试的手段**——换一家、退避之后再来，都不再做。到了这一刻，这件[非常态](#ul-off-nominal--非常态--off-nominal)就[上交](#ul-escalation--上交--escalation)。
> **它是一个判断，不是一个公式**：做这个判断的是挂在「调模型之后 · 失败」位置上的那件[拓展件](capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)（系统自带一件默认的，可替换）；
> 档案上的[允许的供应商](capabilities-and-composition.md#ul-allowed-providers--允许的供应商--allowed-providers)与[供应商回退](capabilities-and-composition.md#ul-provider-fallback--供应商回退--provider-fallback)是它的输入，不是它的定义。
>
> **EN**: **The point at which the model-call layer has no means left to try** — neither another
> provider nor another attempt after back-off. At that point the off-nominal is escalated. **It is a
> judgement, not a formula**: it is made by the extension at the "after model call · failure" position
> (a default one ships with the system and can be replaced); the profile's allowed providers and provider
> fallback are inputs to it, not its definition.

- **形态**：状态
- **出处**：[PF-013 §4 什么时候算试尽](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#什么时候算试尽) ·
  [§5.12](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上)（rev 17）
- **别混 ①**：**不是「这一次失败了」**——失败之后还有手段可试，这一层就还没了结不了
- **别混 ②**：**「所有模型都试过了」不是试尽**——换模型是用户的命令，不是这一层的手段
- **注意 ①**：**只管故障这一维**——被消息准入拒收的回复不算；连续拒收不设次数上限（原[连续否决上限](#ul-consecutive-veto-limit--连续否决上限--consecutive-veto-limit)已弃用）
- **注意 ②**：**有三类根本轮不到它**——「发不出去」「重试没用」「已经开口说话了」是事实，立即上交，任何策略都改不了

### UL-model-call-escalation-cause · 模型调用上交成因 · Model-Call Escalation Cause

> **中**：**一次[模型调用](#ul-model-call--一次模型调用--model-call)上交时带的那个分类，回答「谁能让它不再发生」。**恰八个取值：
> 已下架 · 这个范围不再允许 · 和会话里的模态对不上 · 凭据不可用 · 这次请求本身上游不接受 · 上游这会儿给不出回复 · 说到一半断了 ·
> 没认出来（兜底，只指「这次确实没认出来」）。**封闭枚举**；上游返回的状态码（有的话）另外原样带着，**两者不互相替代**。
>
> **EN**: **The classification a model call carries when it escalates, answering "who can stop this
> from happening again".** Exactly eight values: withdrawn; no longer allowed in this scope; incompatible
> with the session's modalities; credential unavailable; upstream refuses this request itself; upstream
> cannot answer right now; cut off mid-speech; and unrecognized (a fallback meaning only "genuinely not
> recognized this time"). **A closed enumeration**; the upstream's status code, where there is one,
> travels alongside unchanged, and **neither stands in for the other**.

- **形态**：属性
- **出处**：[PF-013 §5.7 上交带什么](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它) ·
  [§6.14](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#614-上交带的成因是封闭枚举外加一个诚实的兜底状态码另外原样带着)（rev 17）
- **别混**：**被中断不在这里**——用户中断不是非常态，不产出任何成因；被消息准入拒收的回复同样不带成因
- **注意 ①**：**只按「下一步不同」分取值**——「连不上」「超时」「5xx」「被限流」答案一律是「没人，等」，并成一个；差在哪由状态码说
- **注意 ②**：**成因给分层处置用，状态码给排查的人与重试策略用**
- **注意 ③**：**裸写「成因」不作数**——跨 topic 引用写全「模型调用上交成因」

### UL-terminal-disposition · 终局 · Terminal Disposition

> **中**：一件[非常态](#ul-off-nominal--非常态--off-nominal)**一路[上交](#ul-escalation--上交--escalation)到头，
> 没有哪一层还能让它回到[主路径](#ul-nominal-path--主路径--nominal-path)**时，这件事的收场。
> **落终局的是那件非常态本身，不是承接它的那一层。**
>
> **EN**: What becomes of an off-nominal condition once it has been escalated all the
> way out and **no layer remains that could return it to its nominal path**. **What
> reaches this end is the condition itself, not the layer that was holding it.**

- **形态**：状态
- **出处**：[PF-011 §4 终局](../../product.0.0.1.legacy/PF-011-off-nominal-handling/design.md#终局)（rev 5）
- **别混 ①**：**不是失败的同义词**——算不算失败，**由落终局的那一层按自己的语义决定**
- **别混 ②**：**不是[运行终态](agent-runtime-loop.md#ul-run-terminal-state--运行终态--run-terminal-state)**——
  一次 Run 早就落了终态，那件非常态**照样可能还在往外交**
- **注意**：**只有走到根那一层才落得了**，因为只有在那里才谈得上「外面没有层了」


### UL-schedule · 日程 · Schedule

> **中**：包含一份工作例程描述的日程安排，同时持有一次性或重复的时间规则、边界与补跑／重叠声明；每次实际形成的工作以定时作业区分。
>
> **EN**: An identifiable schedule containing its own routine description together with one-off or recurring timing rules, temporal bounds, and catch-up and overlap declarations. Actual work instances are represented by scheduled jobs.

- **形态**：对象
- **出处**：[PF-021 §4 日程](../../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#日程)（rev 8）
- **别混**：Routine 是它所包含的工作描述；Scheduled Job 是据它开展的某一次工作，不是日程自身。

### UL-system-schedule · 系统日程 · System Schedule

> **中**：由系统自身拥有、用于系统自用机械操作的一类日程；不归任何账号、组织或租户，沿用日程身份与生命周期，其执行不启动 agent 会话。
>
> **EN**: A schedule owned by the system itself for its own predefined mechanical operations. It belongs to no account, organization, or tenant, retains schedule identity and lifecycle semantics, and does not start an agent session for execution.

- **形态**：变体（父：[日程](#ul-schedule--日程--schedule)）
- **出处**：[PF-021 §4 系统日程与出厂内容](../../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#系统日程与出厂内容)（rev 8）
- **别混**：系统出厂提供 Routine，不使采用它的租户日程归系统；系统负责调度一份日程也不决定其所有者。

### UL-scheduled-job · 定时作业 · Scheduled Job

> **中**：一份日程在某个具体到期时刻对应的单次工作实例，支持执行、通知、执行并通知三种工作类型，有可指认的来源和本次处置结果；agent 执行使用专属新会话，系统自用的机械执行不创建会话，包含通知时按本次声明承担目标租户的通知。
>
> **EN**: An identifiable instance of work due under a schedule at a particular occurrence. Its work type is execution, notification, or execution with notification. Agent execution uses a newly created dedicated session, while mechanical execution for the system itself creates no session; work that includes notification fulfils its declared notification obligations to the target tenant.

- **形态**：对象
- **出处**：[PF-021 §4 定时作业](../../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#定时作业)（rev 8）
- **别混**：agent 执行的 Job 关联会话，不以单个 Run 作为直接业务承接单位；机械执行无作业会话，执行并通知仍是同一个 Job。

### UL-scheduled-execution · 定时执行 · Scheduled Execution

> **中**：日程到期后履行执行工作的过程；系统自用日程触发机械操作，租户日程为本次作业新建专属会话并装配 agent 来完成工作目标。
>
> **EN**: The process of carrying out due work: schedules owned by the system itself trigger mechanical actions, while tenant-owned schedules create a dedicated new session and assemble an agent for the job objective.

- **形态**：过程
- **出处**：[PF-021 §4 两种定时动作](../../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#两种定时动作)（rev 8）
- **别混**：agent 执行时，成果工具与完成检查不随 AgentDefinition 被省略；系统自用日程不借机械执行之名调用 agent。

### UL-scheduled-notification · 定时通知 · Scheduled Notification

> **中**：日程到期工作中向目标租户发送通知的过程，可由纯通知作业承担，也可与执行组合在同一个作业中；通知动作本身不另建 agent 工作会话。
>
> **EN**: The process of notifying a target tenant as part of scheduled work, either in a notification-only job or combined with execution in the same job. The notification action does not create an additional agent work session.

- **形态**：过程
- **出处**：[PF-021 §4 两种定时动作](../../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#两种定时动作)（rev 8）
- **别混**：执行并通知同时承担两部分工作，不等于纯通知，也不拆成两个到期 Job；通知时机与送达判据由产品规则定义。

### UL-schedule-date-policy · 日程日期处理策略 · Schedule Date Policy

> **中**：日程时间安排的属性，声明基础候选日期遇到非工作日时保持原日、跳过、移到前一个工作日或移到后一个工作日；与基础重复规则、显式排除日期及补跑声明分别表达。
>
> **EN**: A property of a schedule specifying whether a base candidate on a non-working date is retained, skipped, or moved to the preceding or following working date. It is distinct from recurrence rules, explicit excluded dates, and catch-up policy.

- **形态**：属性
- **出处**：[PF-021 §6.2 线性与非线性表达](../../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#62-线性与非线性表达)（rev 8）
- **别混**：它改变未接受候选的日期，不移动已有 Job，也不把未来候选提前接受为工作。

### UL-schedule-catch-up-policy · 日程补跑策略 · Schedule Catch-up Policy

> **中**：日程声明的属性，决定是否补调度尚未形成作业的漏过时刻；启用时声明以恢复处理的当前时刻为界，最近最多多少次漏过工作可补，不重跑已经创建的作业。
>
> **EN**: A schedule property specifying whether missed occurrences that have not produced jobs may be caught up and, when enabled, the maximum number of most recent missed occurrences selected relative to the recovery processing time. It does not rerun existing jobs.

- **形态**：属性
- **出处**：[PF-021 §6.11 日历重算与补跑](../../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#611-日历重算与补跑)（rev 8）
- **别混**：补跑上限不是时间长度，也不是一次分页大小；已经创建但等待执行的 Job 不是漏过时刻。

### UL-schedule-overlap-policy · 日程重叠策略 · Schedule Overlap Policy

> **中**：日程声明的属性，决定新的到期工作遇到本日程先前尚未结束的动作时，是跳过本次、停掉先前工作后执行、相互独立地并行执行，还是等待先前工作结束再执行；不改变不同作业的身份与成果归属。
>
> **EN**: A schedule property choosing how new due work interacts with earlier unfinished actions of the same schedule: skip the new occurrence, stop prior work before starting it, run independently in parallel, or wait and execute in order. Job identities and result ownership remain separate.

- **形态**：属性
- **出处**：[PF-021 §6.12 重叠处理](../../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#612-重叠处理)（rev 8）
- **别混**：并行不合并会话或结果；停止是新增控制事实，不回写先前 Job 的工作要求或撤销已发生外部效果。

### UL-job-notification-policy · 作业通知策略 · Job Notification Policy

> **中**：日程内工作例程的属性，声明执行并通知工作在哪些执行事件发生时通知目标租户，以及各事件的通知内容要求；每个作业采用自身创建时的声明，不把通知投递失败再次当作执行失败通知事件。
>
> **EN**: A property of the routine contained in a schedule that declares which execution events trigger notifications to the target tenant and the content requirements for each event. Each job retains its creation-time declaration; notification delivery failure does not recursively trigger an execution-failure notification.

- **形态**：属性
- **出处**：[PF-021 §6.13 通知声明与完成](../../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#613-通知声明与完成)（rev 8）
- **别混**：纯通知在到期时发送已定义内容；通知事件、发送尝试、送达与已读是不同事实。此属性不另立可管理对象。

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
