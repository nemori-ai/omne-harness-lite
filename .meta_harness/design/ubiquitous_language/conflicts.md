# 对不上的地方

**定义概念时撞见的说法冲突，如实记在这里，不静默改掉。**

静默统一掉会让后来者以为这里从没出过问题——而那些地方**正是最该被复核的**。

## 四类冲突

| 类型 | 长什么样 | 谁来处置 |
|---|---|---|
| **同名不同义** | 两个 topic 都在说这个词，指的**不是**一个东西 | **必须裁决**：要么承认是两个概念各起各的名，要么统一 |
| **同义不同名** | 两三个说法指同一样东西 | 选一个进词条，其余进「弃用」；**正文回改由各 topic 的 owner 做** |
| **定义打架** | 两处对同一个词的定义**互相排斥** | **必须裁决**，PM 不替产品负责人挑一个 |
| **形态未定** | 这个词指的是不是一个有身份的对象，正文给得出两种读法，**没有人裁过** | **必须裁决。**词条[形态](conventions.md#形态这个词指的是哪一类东西)写「未定」，[领域对象的待裁](../domain_objects/pending.md)同时有一项，写清谁来裁、什么算闭合；**裁之前下游不照任何一种读法往下建** |

## 现有冲突

C-31、C-34、C-40 的旧规格链接固定到封存提交 `481f9f45f76f7a36a2c3cd05cc42b640d77a421a`，仅作历史证据。引文和条款编号保留发现时原文；封存快照的章节可能已随当时修订改名，不能据此把旧能力名、字段或条款作为新成员接口。现行行为分别由[Model 契约](../../../packages/model/model-contract/SPEC.md)、[Tool](../../../packages/tool/tool-contract/SPEC.md)和[Session](../../../packages/session/session/SPEC.md)拥有。

| # | 词 | 类型 | 差在哪 | 状态 |
|---|---|---|---|---|
| **C-1** | **「上下文」/ context** | **同名不同义** | [PF-001 §4](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息)（rev 19）指**agent 感知到的「我处在什么情形下」**；[PF-010](../product.0.0.1.legacy/PF-010-context-management-and-assembly/README.md)（rev 2）整个 topic 说的是**喂给模型 / 给用户看的那一份**。**两者毫无关系。**再加上 **Cordis 的 `Context`**（依赖注入容器），同一个词有**四个所指** | **PM 已定用法，两个概念都不改名**——见下 |
| **C-2** | **「角色」/ role** | **同名不同义** | [PF-001 §4](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#角色) 指**租户在组织内的治理角色**；而消息几乎必然有 `role`（user / assistant / system）。**两者的分辨已由[消息](terms/record-and-context.md#ul-message--消息--message)那一条兜住** | **已改名规避**：词条正式名为 [`Tenant Role` 租户角色](terms/subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role) |
| **C-3** | **「组合」/ composition** | **同名不同义** | [PF-002 §5.1](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#51-组合是一种关系不是几种) 指**资产之间的构成关系**；[PF-001 §6.2](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义) 的「三种合成语义」英文同样落在 composition 上 | **已改名规避**：[`Asset Composition`](terms/capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition) 与 [`Scope Composition Semantics`](terms/scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics) |
| **C-4** | **「血缘」/ lineage** | **同名不同义** | [PF-003 §4](../product.0.0.1.legacy/PF-003-asset-transfer-and-sharing/design.md#复制血缘) 指**复制过来的那份与源的对应**；设计材料身份对应的工作用lineage 指**设计对象新旧身份的对应** | **已改名规避**：[`Copy Lineage` 复制血缘](terms/circulation-and-entitlement.md#ul-copy-lineage--复制血缘--copy-lineage)（2026-09-22 随「转移」改名「资产复制」，由 ~~`Transfer Lineage`~~ 改到现名） |
| **C-5** | **「会话」/ Session · 「Run」** | ~~**缺定义**~~ | 两者被 PF-001 / PF-004 / PF-005 / PF-007 / PF-010 **五个 topic 反复引用，却没有一个拥有它们**——[PF-004 §4](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#三个只引用不拥有的对象) 明写这两样**「只引用、不拥有」** | **✅ 已闭合（2026-09-18）**：产品负责人直接裁决，定义落 [现行词义](index.md) 与 [Agent 运行时闭环卷](terms/agent-runtime-loop.md)。**它们不归任何 topic，这是有意的**——它们是跨全链的治理概念 |
| **C-6** | **「会话」/ session** | **同名不同义** | [协作会话](terms/agent-runtime-loop.md#ul-session--会话--session)（归属边界）vs **`Shell().create_session` 开的[终端会话](terms/grounding-and-isolation.md#ul-terminal-session--终端会话--terminal-session)**（执行环境里的一条命令行）。**两者毫无关系** | **✅ 已处置**：产品负责人同意改名（[现行词义](index.md)）。**正文无须回改**——PF-005/PF-007 的叙述本来就一律写「终端会话」，**裸用一处也没有**；**命令名 `create_session` 不动**，那是接口不是术语 |
| **C-7** | **「收场」/ 「收束」** | **同名不同义** | [Run 的收束](terms/agent-runtime-loop.md#ul-run--运行--run)（一次逻辑执行请求的终结）vs [一次工具执行的收场有六种](terms/execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome)。**粒度差着好几层** | **✅ 已闭合（2026-09-19，PF-012 转正）**：工具那一层是 **`Execution Outcome` 执行收场**（六种）；Run 那一层是 **[`Run Terminal State` 运行终态](terms/agent-runtime-loop.md#ul-run-terminal-state--运行终态--run-terminal-state)**（三种）。**裸写「收场」只指工具这一层**；「收束」裸用时指**走到运行终态那个动作**，不是术语 |
| **C-8** | **「可用性」/ availability** | **同名不同义** | [当下可用性](terms/reach-and-availability.md#ul-current-availability--当下可用性--current-availability) 是**依赖解析算出来的事实**；而 availability 在别处普遍指服务可用性、系统可用性（SLA 那种） | **已改名规避**：正式名 **`Current Availability` 当下可用性**。**裸写「可用性」不作数** |
| **C-9** | **「帧」/ frame · 「卸载」/ offloading** | **同名不同义** | [执行帧](terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame) vs 视频帧 / 网络帧；[结果卸载](terms/execution-and-outcome.md#ul-result-offloading--结果卸载--result-offloading) vs 卸载插件 / 卸载软件 | **已改名规避**：`Execution Frame` 执行帧、`Result Offloading` 结果卸载 |
| **C-10** | **「等待态」** | **同名不同义**（**系统内部，两处都是自己的设计**） | [PF-006 §4 等待态](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#等待态) 挂在**一次工具执行**上，由**工具内部的业务逻辑**发起；[PF-008 §4 等待态的两个维度](../product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#等待态的两个维度) 里那个 run 的等待态挂在**一个运行**上，由**系统**在拿到模型响应后算出来。**两者挂在不同的生命周期上** | **✅ 已改名规避**：[工具等待态 `Tool Wait State`](terms/execution-and-outcome.md#ul-tool-wait-state--工具等待态--tool-wait-state) 与 [运行等待态 `Run Wait State`](terms/interaction-and-dispatch.md#ul-run-wait-state--运行等待态--run-wait-state)。**PF-008 自己已经把这层分辨写清楚了，词表只是给两边各起了正式名**。**裸写「等待态」不作数** |
| **C-11** | **「事件」/ event** | **同名不同义** | **内核**的 `Events` 指类型化总线上的一条消息；**上游 harness** 用同一个词指**两套性质相反的东西**（落盘才算发生的 vs 进程内瞬态的）；**中文日常**指任何发生的事情——我们自己十份 `flows.md` 的「异常分支」章节和 [PF-009](../product.0.0.1.legacy/PF-009-context-message-types/design.md) 正文用的都是这个日常义 | **PM 已定用法：不收为术语**——见下 |
| **C-12** | **「异常」** | **同名不同义** | [PF-006 正文](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md)五处用它指**程序抛出的那种**（「异常不带语义」）；而**十个 topic 的 `flows.md` 章节标题**用「异常分支」指**不正常的情况**，[模板里还立着「异常分支和正常路径一样重要」这条纪律](../product.0.0.1.legacy/.templates/topic/flows.md)。**同一句话里两个所指还会相反**——PF-006 那句「不用异常」挡的那四种非完成收场，**恰恰就是后一种意义上的异常** | **✅ 已处置**：不收为术语，正式词是[非常态](terms/execution-and-outcome.md#ul-off-nominal--非常态--off-nominal)（产品负责人 2026-09-19 裁决）——见下 |
| **C-13** | **「记录」/「会话日志」** | **同义不同名** | [PF-012 rev 1](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md) 管那本账叫「**记录**」，而正式名是[会话日志](terms/record-and-context.md#ul-session-log--会话日志--session-log)。**「记录」还与[记录条目](terms/record-and-context.md#ul-record-entry--记录条目--record-entry)字面撞**——**一个是那本账，一个是账上的一行** | **✅ 已选正式名：会话日志**（2026-09-19，PF-012 rev 2）。那边正文已改，**全链锚点已修**（旧 `#记录` → `#会话日志`）。**PF-006 / PF-007 / PF-009 / PF-010 正文里仍有把它写作「记录」的链接文字与叙述，回改归各自 owner**——本轮只动锚点，不动别人的文字 |
| **C-14** | **「子 agent」/ subagent** | **同名不同义**（**系统内部，两处都是自己的设计**） | [UL-subagent](terms/interaction-and-dispatch.md#ul-subagent--子-agent--subagent) 指**它在派发关系里的角色**——被 `spawn`/`delegate` 派出去的那个，`handoff` 不算；而 [PF-004 的 agent 类型](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#agent-类型)本来打算把第二个取值也叫 `subagent`，那说的是 **Agent Definition 带着哪套机制**。**一个是此刻扮演什么，一个是这份定义属于哪一类** | **✅ 已改名规避（2026-09-21）**：产品负责人定第二个取值为 **`non-master`**——「**不具备一个 master agent 的全套机制的 agent**」。**两个词从此不撞**，[UL-agent-type](terms/capabilities-and-composition.md#ul-agent-type--agent-类型--agent-type) 与 UL-subagent 各自成立，互设「别混」 |
| **C-15** | **「使用权」/ Usage Right**（[UL-usage-right](terms/circulation-and-entitlement.md#ul-usage-right--使用权--usage-right)） | **形态未定** | [PF-001 §4](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用)（rev 19）把它与拥有、选用并列为三个**事实**，没给身份与状态机；而[撤销不等于强制停止](terms/circulation-and-entitlement.md#ul-revocation-is-not-stop--撤销不等于强制停止--revocation-is-not-a-stop)说它会**暂停或到期**、[资产分享](terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)说它**关系解除后失效、不可传递**——那是一份有生命周期的授权。**差在「一份分享有没有自己的身份」**，[PF-003 §4 分享](../product.0.0.1.legacy/PF-003-asset-transfer-and-sharing/design.md#分享)（rev 1）通篇按动作写，没裁过。**同一个洞的另一面**：[PF-013 §5.10](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)（rev 3）的「有使用权」落在**模型档案**上，而[模型档案不是资产](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)——论域是不是只限资产，同样没裁 | **✅ 已闭合（2026-09-22，产品负责人直接裁决）**：使用权是**对一份资产可用性的权利声明**——定义者直接有，被分享方从确认起有，直到自己移除、分享方撤销或隶属关系解除；**本版没有到期，没有暂停**。词条形态定为**属性**；PF-001 §6.6 的「暂停或到期」改为「撤销分享」；PF-013 的那一项并进「范围允许」，档案不是资产、不用这个词。落在 [PF-003 rev 2](../product.0.0.1.legacy/PF-003-asset-transfer-and-sharing/design.md) |
| **C-16** | **「替换件」/ Stand-in**（[UL-stand-in](terms/reach-and-availability.md#ul-stand-in--替换件--stand-in)） | **形态未定** | [PF-006 §4 替换件](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#替换件)（rev 10）既说它**被调用时会应答**、「是正常的返回，不是错误」（像一个有运行时实例的对象），又说它**同名、占同样的位置**（身份是借来的）；且它同时顶替工具与技能两类，写「变体」找不到单一父词条。正文未述它是否被系统单独标识 | **✅ 已闭合（2026-09-22，产品负责人直接裁决）**：替换件是**与原件同形的一种实例**——工具的名字与调用参数一致、技能的名字一致，**只有说明被换成「当前不可用及原因」**；它**必定以「不可用」收场**，正常返回带原因，不走报错。**它不是一个独立的东西**：身份仍是原条目的，名字与参数来自原条目，说明与应答来自依赖解析算出的原因，**丢了能原样重算**——**因此形态定为视图**，不给它建身份。**[形态取值表](conventions.md#形态这个词指的是哪一类东西)不增补「替身」这一类取值**——它压根不是「借用他者身份」，身份本来就是原条目的那一份。落在 [PF-006 rev 11](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md) |
| **C-17** | **「持有」/ Asset Holding**（[UL-asset-holding](terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)） | **形态未定** · 定义打架 | [PF-002 §6.4](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作)（rev 4）说[资产禁用](terms/circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)是**权限收窄为空集**——一条配值，持有上没有第二处状态；[flows §3.1](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)（rev 4）却把它画成**持有上的一个状态**（持有·启用 ⇄ 持有·禁用）。前者下持有是一层关系，后者下它自带状态机；两者对「启用回来之后权限恢复成什么」「上一层禁用了、下一层能不能自己开回来」给出不同答案 | **✅ 已闭合（2026-09-22，[产品负责人直接裁决](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md)）**：**禁用就是持有关系上的那个开关**——持有带一个启用/禁用标记，配置原样保留，flows 的状态图成立，「权限收窄为空集」那套说法作废。**装配从「持有且未被禁用」的那一批开始，所以禁用对 agent 与移除一样不可见**；**禁用表按层，任一层禁用即不可见，下层开不回上层禁的**。词条形态由「未定」定为**属性**。落在 [PF-002 rev 5](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md) |
| **C-18** | **「依赖声明」/ Dependency Declaration**（[UL-dependency-declaration](terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration)） | **定义打架**（同一份正文内） | [PF-006 §4 依赖](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#依赖)（rev 10）写「依赖项有**三类**」；[§5.3](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#六项可选声明) 说两端的**模态声明也是依赖声明的一种**——依赖的是这一次有效模型的能力，三类里一类都不是；[§6.4](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#64-依赖声明与解析) 另有一项「附件放进哪个存储」。按「三类」实现，会漏掉模型能力与存储这两种对端，以及两端不对称的不可用后果 | **✅ 已闭合（2026-09-22，[产品负责人给的建模思路](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md)）**：依赖声明是**一串必需项的名字**，每一项**用抽象的名字**指一样可以在场也可以不在场的东西，**谁生效在那个名字上谁就满足它**；**种类不限**——其他工具、外部服务、设施、存储、有效模型的模态能力都只是例子，「三类」这个说法作废。**只有且，只有必需**：「或」被抽象名消掉，可有可无的东西用时探测、不进声明。**两端的模态都是声明里的必需项，差别在候选提供者不在规则**——调用端只有有效模型满足得了，结果端有效模型或转换件都行，「结果降级」只是这一项被转换件满足了。落在 [PF-006 rev 12](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md) |
| **C-19** | **「执行尝试」/ Run Attempt**（[UL-run-attempt](terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)） | **形态未定** | [PF-012 §4 执行尝试](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#执行尝试)（rev 5）明说「**它不是第二个执行体**……同一个协程，站在治理那一侧叫『这次运行的第几次尝试』」；同一份正文又给了它**自己的起始仪式**（[§5.7 每一次尝试开始，都要做三件事](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事)）、**可被追溯**（[§6.4](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#64-每一次尝试开始agent-都要知道)「人追溯得到是哪一次尝试造成的」）与**跨尝试的连续性规则**（[§6.5](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#65-新的尝试不重置循环阶梯)）。判「对象」，下游会建一张尝试表，而上游说执行体只有一个；判「视图」，§6.4 要的「是哪一次」只能靠日志里那条提醒间接还原，**而那条提醒里没有尝试标识**。外延也不等同：agent runtime 是协程本身，执行尝试是「这个 Run × 这一副协程」的配对，带序数 | **✅ 已闭合（2026-09-22，产品负责人直接裁决）**：执行尝试是**视图**——**身份是 (哪次运行, 第几次)，从日志里那条「尝试开始」记录派生，不另存一份**，因为它没有任何「只有它知道」的东西。**两种读法之所以打架，是因为那条提醒里没有序号**；[序号现在写进去了](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#64-每一次尝试开始agent-都要知道)，于是「追溯得到是哪一次」不再需要一个独立对象。落在 [PF-012 rev 6](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md)。2026-10-17 接续：形态与身份不变；左列「agent runtime 是协程本身，执行尝试是这个 Run × 这一副协程的配对」不再成立，执行尝试改为会话一侧拥有的关联，不再对应 agent runtime 的启动（用户决定，2026-10-17 Agent 扩展继承与边界对齐），见 C-54 |
| **C-20** | **「工具定义」/ Tool Definition**（[UL-tool-definition](terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition)） | **形态未定** | [PF-006 §5.2](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同)（rev 10）的图把第一段标成「数据，长期」「**一类资产**」——工具定义就是「工具」这类资产本身；[PF-002 §4 Tool](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#tool)（rev 4）说工具「有两半，缺一不可：**调用定义**……与**适配当前环境的实现**」——定义只是资产的一半。**差在工具定义有没有独立于「工具」这类资产的身份** | **✅ 已闭合（2026-09-22，[产品负责人直接裁决](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md)）**：**工具定义是一个具体的工具实现在数据与治理层面的身份与表示**，**允许自带完整实现 package**——两种旧读法一起作废：它既不是「工具这类资产本身」，也不是「资产的一半」。**那份资产的身份是[类别 ＋ name](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)，同一身份下平台、组织、租户各可有一份定义**，所以它**不需要独立于工具的身份**——**形态定为属性**。落在 [PF-006 rev 13](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md) 与 [PF-002 rev 6](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md) |
| **C-21** | **「执行帧」/ Execution Frame**（[UL-execution-frame](terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame)） | **形态未定** | [PF-006 §4 发帧](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#发帧)（rev 10）把它写成工具执行途中**发出去的东西**，形状由一份协议约定；[PF-009 §5.8](../product.0.0.1.legacy/PF-009-context-message-types/design.md#工具帧跟-toolmessage-是两条轨)（rev 2）说一次调用「可能很多条」、活得「可以更短」、有上限且被砍掉的部分必须看得出来——那是落成 `ToolInternalMessage` 之后的读法。**差在执行帧有没有独立于那类消息的身份与寿命**，连带它与[内容块](terms/record-and-context.md#ul-content-block--内容块--content-block)的边界 | **✅ 已闭合（2026-09-22，产品负责人直接裁决）**：**工具帧与模型响应流必须同形**——**一次工具执行对应一条 `ToolInternalMessage`**（内容是一串块），**执行帧就是这条消息的到达增量**，走 [§5.5 同一套到达语法](../product.0.0.1.legacy/PF-009-context-message-types/design.md#到达的过程有它自己的语法)，**不是另一份协议、不是独立对象、也不是载荷**。**因此它没有独立于那条消息的身份与寿命**，形态由「未定」定为**过程**；日志里留的是收尾后那条完整的消息（封口后的块），中断时已交付的块照样留。**不加块的种类**——帧的载荷就是普通内容块。**「取代」挂在块上**：开块时说明这块是追加片段还是整体替换。落在 [PF-009 rev 3](../product.0.0.1.legacy/PF-009-context-message-types/design.md) |
| **C-22** | **`spawn` 的「继承当前会话的上下文」** | **定义打架**（两份已接受的材料） | [PF-007 §6.8 五维表](../product.0.0.1.legacy/PF-007-meta-capabilities/design.md#派发有三种模式)（rev 14）写 `spawn` 的上下文「**继承当前会话的**」，§9.1 仍把「共享同一份会话日志」与「派发那一刻复制一份」并列为未决；而 [现行词义](index.md) 裁决 3 说「**子会话不继承父会话的任何历史内容**」、裁决 4 说会话日志之间「**存储上不共享节点**」。§9.1 的第一个选项已被裁决 4 关掉，却还摆在未决项里；裁决 3 与五维表那一格**字面相反**。「继承的是组装出来的那一份，不是日志本身」也许调和得了，**但没有任何一处正文这么说过** | **✅ 已闭合（2026-09-22，[产品负责人直接裁决](../product.0.0.1.legacy/PF-007-meta-capabilities/design.md)）**：**`spawn` 交出去的是「派发那一刻组装出来给模型看的那份上下文」的一份副本**，它是**子会话日志里的起始输入记录**；**父的日志不被指向、不被拷贝**，**派发之后父这边发生的事子看不见**。「**共享同一份会话日志**」那一侧作废，**§9.1 随之从未决项删除**；原则是「不同的 session 在 **session log、投影、runtime context snapshot** 三处存储上都不共享」（[现行词义](index.md)）。落在 [PF-007 rev 15](../product.0.0.1.legacy/PF-007-meta-capabilities/design.md) |
| **C-23** | **「授权表达」/「决策记录」** | 同义不同名？**是不是同一个东西先没裁** | [PF-007 §4](../product.0.0.1.legacy/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度)（rev 14）讲「一笔授权表达有三个维度」（这一次 / 本会话 / 全局），却没有一句「授权表达是……」；[§5.6 第③步](../product.0.0.1.legacy/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)与 [PF-015 §4](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#会话运行模式)（rev 5）顺手用「决策记录」，三处都没定义。**外延对不齐**：第③步拿来算的是「结构化的 ＋ 语义化的（全局 ＋ 本会话）」，「这一次」那一档不在里面 | **✅ 已闭合（2026-09-22，[产品负责人直接裁决](../product.0.0.1.legacy/PF-007-meta-capabilities/design.md)）**：**一物两名**，正式名 **[授权表达](terms/interaction-and-dispatch.md#ul-authorization-expression--授权表达--authorization-expression)**（形态：对象），「决策记录」进它的「弃用」。**外延也对齐了**：第 ③ 步算的是**结构化的（含由全局授权表达落成的租户层权限值）＋ 本会话流水（本会话 ＋ 这一次）**——**「这一次」补进算式**，**「全局」那一档则落成租户层的权限设置值、不进会话流水**。落在 [PF-007 rev 15](../product.0.0.1.legacy/PF-007-meta-capabilities/design.md) 与 [PF-015 rev 6](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md) |
| **C-24** | **「当前生效的执行环境」** | **定义打架**（同一份正文内） | PF-005 §6.1（rev 3）说「装配时注入一个」，读着是一次装配一个环境；[§6.5](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#65-一个会话一个租户可以同时有多组执行环境) 说一个会话、一个租户可以同时有多组，[§6.8](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md#68-执行环境权限每个工具各配各的) 说粒度是每个工具各配各的。[UL-host-machine](terms/grounding-and-isolation.md#ul-host-machine--宿主机--host-machine) 那句「装配时必须明确注入一个执行环境」正压在这上面 | **✅ 已闭合（2026-09-22，[产品负责人直接裁决](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md)）**：**「装配时注入一个」那一侧作废。****宿主机始终在场**（只要[执行环境权限](terms/grounding-and-isolation.md#ul-execution-environment-permission--执行环境权限--execution-environment-permission)允许就可用，**不存在「宿主机不可用」**）；**[沙箱实现](terms/grounding-and-isolation.md#ul-sandbox-implementation--沙箱实现--sandbox-implementation)装配时可选装配**，全部遵循同一套契约与协议并声明设施与可绑定层级；**「当前生效的执行环境」是每扇门一个、每次执行算出来的**。**三个叫法一并裁了**：正式名是执行环境权限，「执行安全策略」＝把它配成 `never-allow`，「使用宿主机的资格」＝它不是 `never-allow`，两个叫法进词条「弃用」。[UL-host-machine 的注意已改](terms/grounding-and-isolation.md#ul-host-machine--宿主机--host-machine)。落在 [PF-005 rev 4](../product.0.0.1.legacy/PF-005-execution-environments-and-sandboxes/design.md) |
| **C-25** | **「常驻」/ Residency**（[UL-residency](terms/reach-and-availability.md#ul-residency--常驻--residency)） | **同名不同义** | [PF-006 §4 常驻](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#常驻)（rev 14）的正式名指工具或技能始终出现在系统提示词里。[单机与常驻服务](../../../docs/architecture/deployment/single-machine.md)中的常驻服务指持续运行的服务进程。原基础材料的待澄清表述已退出要求正文，两种用法仍需区分，不能把提示词出现规则当作进程生命周期规则 | **未裁**。词条正式名仍是裸词，不能直接套用 [C-1](#c-1-的处置两个概念都不改名改的是能不能裸用) 的限定前提。是否给词条加限定，或保留现名并在部署正文中限定进程含义，仍由 [PF-006](../product.0.0.1.legacy/PF-006-tools-and-skills/README.md) owner 与系统要求拥有者裁定；改 ID 等于换概念。发现于 2026-09-22 的 CLI-TUI 交付面查重，本次仅切换依据，不裁决词义 |
| **C-26** | **「界面语言、时区」这类偏好挂在谁身上** | **定义打架**（两份产品正文） | [PF-001 §4 Context](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息)（rev 19）把它们放进[个人 context](terms/scope-and-resolution.md#ul-personal-context--个人-context--personal-context)：「**个人 context｜这个人本身的偏好：界面语言、时区、通知方式……｜由谁承载：账号｜跟着人走，在所有组织里都一样**」，并明说它「**不属于范围化对象**，也不该被塞进层次里去覆盖」；[PF-015 §5.6](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#56-十四项-meta-runtime-context)（rev 8）第 3 项写的是「**租户的界面偏好**……语言 · 时区 · 地区 · 明暗风格一类」，生产者是「会话外的一个东西」，消费者是三个角色。**同样的那几项，一处挂在账号上、一处挂在租户上**——差别是用户直接感知的：换一个组织，界面语言变不变 | **已裁：承载者是账号，PF-015 那处不是另一个承载者。**产品负责人 2026-09-22 裁定[观感偏好属于「account runtime context 那一部分」](../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md)，即确认 PF-001 那一侧的读法；PF-015 第 3 项讲的是**会话拿到什么**——会话通过它持有的租户身份找到背后那个账号的个人 context，「租户的」指的是这条路，不是承载者（推理链在 [PF-016 decisions §二](../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md)）。**两处含义不相左，换一个组织界面语言不变。**PF-015 第 3 项已据产品负责人「这是账号级的」的确认改为「账号级的界面偏好」，不改含义、未升 rev（[PF-016 decisions §四](../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md)）。[观感偏好](terms/interaction-and-dispatch.md#ul-look-and-feel-preference--观感偏好--look-and-feel-preference)同样由账号承载，但不进会话；**由 [PF-016 rev 8](../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md)报出，2026-09-22 转记，同日闭合** |
| **C-27** | **「交付面」出现在 PF-017 的开题名与目录名里** | **同名不同义**（日常义 vs 词条） | 词条[交付面](terms/interaction-and-dispatch.md#ul-delivery-surface--交付面--delivery-surface)指**把会话日志投影给人看、把人做的事送进受理的那一面**；PF-017 开题时取的名「治理中心交付面」用的是「作为一个应用被交付出去的那一面」这个日常义，而[治理中心不知道任何会话](../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/design.md#治理中心)，**不是词条意义上的交付面**。PF-017 正文标题已写成「治理中心作为一个可部署应用」，正文一律不在治理中心身上用这个词（[PF-017 decisions §四](../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md)）；开题时的目录名 `PF-017-governance-center-delivery-surface` 也带着它 | **已裁（2026-09-23，产品负责人以选项作答）：目录改名为 `PF-017-governance-center-as-deployable-application`**，与标题一致；词表里「交付面」的所指不变，治理中心不用这个词。同日闭合 |
| **C-28** | **「在途状态」/ In-Flight Arrival**（[UL-in-flight-arrival](terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival)）的快照含什么 | **定义打架**（词条与正文同一处漏了一样） | [PF-009 §9.2](../product.0.0.1.legacy/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息)（rev 7）与词条当时都只列**「已封口的块 + 开着的整体替换块最后一次填进去的内容」**。**读法一**：照字面，开着的追加片段块里已经到了的片段不在快照里——中途重进的观察者看不到模型正在往外吐的那句话；**读法二**：快照是「已经到了的全部内容」，那些片段也在——「不是一片空白」这条理由本来就要求它。两种读法对「用户刷新时正在说的那句话还在不在」给出相反答案 | **✅ 已闭合（2026-09-23，主线裁定 D-3，待产品负责人确认）**：取读法二——**快照是已经到了的全部内容**，含开着的追加片段块里已到的片段；**快照只带内容，不带此前被节流砍过什么**。落在 [PF-009 rev 8](../product.0.0.1.legacy/PF-009-context-message-types/design.md)；词条定义已按 rev 8 改写 |
| **C-29** | **「组装」出现在 PF-009 §5.5 那一节标题里** | **同名不同义** | [PF-009 §5.5「组装出来的，必须与一次性拿到的一模一样」](../product.0.0.1.legacy/PF-009-context-message-types/design.md#组装出来的必须与一次性拿到的一模一样)（rev 8）说的是**把分次到达的增量拼成一条完整消息**；而[上下文组装](terms/record-and-context.md#ul-context-assembly--上下文组装--context-assembly)（[PF-010](../product.0.0.1.legacy/PF-010-context-management-and-assembly/README.md)）说的是**从会话日志拼出给某一方看的那份**。同一个 PF-009 里两种意思都在用（§5.7「一份会话日志，两种组装」是后一种）。读混了，实现者会把到达那一侧的拼接做进上下文组装，而后者是[纯派生的、一圈要跑两次](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#53-改日志的动作与纯派生的动作) | **PM 已定（只有一个答案成立）**：前一种立正式名 **[到达装配 `Arrival Assembly`](terms/record-and-context.md#ul-arrival-assembly--到达装配--arrival-assembly)**（主线裁定的名字，取代草稿里的「流装配器」，避开与 [Agent 装配](terms/agent-runtime-loop.md#ul-agent-assembly--agent-装配--agent-assembly)撞字）；**裸写「组装」在跨 topic 引用里只指上下文组装**。§5.5 那个标题回改归 PF-009 的 owner |
| **C-30** | **「投影」/ projection** | **同名不同义** | 词表里有三个带这个中心词的视图：[属性投影](terms/scope-and-resolution.md#ul-attribute-projection--属性投影--attribute-projection)（一层持有的资产各自属性在这一层上的投影）、[模态投影](terms/record-and-context.md#ul-modality-projection--模态投影--modality-projection)、[会话日志投影](terms/record-and-context.md#ul-session-log-projection--会话日志投影--session-log-projection)；而每个产品 topic 下的 [`projection/`](../product/README.md) 是**产品设计向 Cordis 技术设计的派生快照**，是设计材料，不是系统里的概念。块 A 的读数报回「投影」一词在这几处所指不同 | **PM 已定（只有一个答案成立）**：三个词条都已带限定、各自成立，**不改名**；**裸写「投影」不作数**。`projection/` 目录与「技术投影」是设计材料的叫法，**不是术语**，与这三个视图无关 |
| **C-32** | **一张[决策卡片](terms/interaction-and-dispatch.md#ul-decision-card--决策卡片--decision-card)有几个出口** | **定义打架**（两份产品正文） | [PF-007 §6.11「四个出口」](../product.0.0.1.legacy/PF-007-meta-capabilities/design.md#四个出口)（rev 17）列人回了 · 人取消 · 人叫停 run · 会话被归档，并写「**没有第五个出口，尤其没有『等到点了』**」；[PF-008 rev 7 §6.1](../product.0.0.1.legacy/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答)与 [flows §3.1](../product.0.0.1.legacy/PF-008-human-in-the-loop/flows.md#31-一张决策卡片)（rev 7）加了**第五个**：它等的那次执行已终局，恢复对账时关成「已作废」，flows 明写「最后一个，PF-007 的问询出口表里还没有」。差在**一张卡片的终态有四种还是五种**——按 PF-007 实现，停机后落了失败的执行出的卡会照挂到有人答了才知道白答 | **✅ 已闭合（2026-09-24，同日）**：第五个出口是产品负责人 2026-09-24 当场裁定（U-6 甲），PF-008 rev 7 先落稿；发现时 PF-007 §6.11 仍写「没有第五个」，[PF-008 decisions §四](../product.0.0.1.legacy/PF-008-human-in-the-loop/design.md)登记给 PF-007；**[PF-007 rev 18](../product.0.0.1.legacy/PF-007-meta-capabilities/design.md) 同日把表扩为五行、改为「没有第六个」**，标题「四个出口」为保锚点未改。词表与对象条目按 PF-008 rev 7 / PF-007 rev 18 写（[UL-card-batch 注意 ③](terms/interaction-and-dispatch.md#ul-card-batch--一批卡片--card-batch)、[决策卡片条目](../domain_objects/objects.md#ul-decision-card--决策卡片)）。**发现于 2026-09-24 rev 复核** |
| **C-31** | **「X 运行时」出现在规格的能力名里**（「模型请求运行时」「工具执行运行时」） | **同名不同义**（词表 vs 规格层） | [`runtime` 那条写死的规矩](conventions.md#runtime-这个词本系统写死了)要求以 runtime 为中心词的都是**一个协程**：[一次模型调用](terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)、[一次工具执行](terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)各有一个。而共用契约起草时把**承载所有这类协程的那一项系统能力**也叫「模型请求运行时」「工具执行运行时」——那不是一个协程，是一项能力。[UL-model-call 注意 ②](terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) 原写「『模型请求运行时』指执行这一次调用的那个协程」，读到规格里的能力名就会以为两者相等 | **✅ 已闭合（2026-09-25，主线裁定 D-060 §七 M18，维持 §一 T-3）**：**名字保留**——规则量的是所指，两项能力的提供者各是一条宿主协程；[`capability.model-request-runtime`](https://github.com/nemori-ai/omne-harness-lite/blob/481f9f45f76f7a36a2c3cd05cc42b640d77a421a/packages.0.0.1.legacy/core/model-request-runtime/SPEC.md) 与 [`capability.tool-execution-runtime`](https://github.com/nemori-ai/omne-harness-lite/blob/481f9f45f76f7a36a2c3cd05cc42b640d77a421a/packages.0.0.1.legacy/core/tool-execution-runtime/SPEC.md) 的 README 各写明「本能力的提供者是运行时协程」。词表侧（2026-09-24）注意 ② 已写明它指「这一次调用的那个协程」、**不是那项能力**，不改。读到这两个能力名的人仍按所在层分清指的是哪一个 |
| **C-33** | **「动作空间」/ Action Space**（[UL-action-space](terms/capabilities-and-composition.md#ul-action-space--动作空间--action-space)）在一次运行的几次尝试之间变不变 | **定义打架**（两份产品正文） | [PF-004 I-4](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md#61-不变式)（rev 12）：「**动作空间只由构成决定**」，一次运行之内权限怎么变它都不变，不可用的条目由[替换件](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)在原位占着；[PF-012 §5.7](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#57-一次尝试三条路通向重新算一遍)（rev 14）：「**重算之后动作空间可能与上一次尝试不同**」，[§7](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#七取舍) 同一说法「前后两次尝试的动作空间可能不同」。照 §5.7 字面，每次尝试重算可用性会把用不了的条目从 agent 眼前拿掉；照 PF-004，几次尝试之间变的只是哪些调得通，条目不少。§5.7 下一句「它调一个已经没了的能力，替换件会给它『用不了 + 原因』」与 PF-004 同向 | **待裁决**——归 PF-012 的 owner，已登记在 [PF-012 decisions §四](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md)（2026-09-24，本 rev 只登记）。PM 的读法：§5.7 与 §7 的「动作空间」该读作「调得通的范围」，改措辞即可；改之前要确认该 topic 别处没把「动作空间」当「调得通的范围」用。词条照 PF-004 定义不动，只在「注意」里点明这一处 |
| **C-34** | **[尝试栅栏](terms/agent-runtime-loop.md#ul-attempt-fence--尝试栅栏--attempt-fence)拦不拦被取代那次尝试迟到的账** | **定义打架**（产品正文 vs 规格） | [PF-012 §5.7](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#同一个-run-同一时刻只有一副协程在推它)（rev 14）：「只有序号最大的那次尝试的写入被接受；序号更小的尝试，**写什么都被拒**」；同一份正文的 [I-11](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式) 只给**运行终结之后**开了口：「终结之前已经发起的那些，账在终结之后才到的，照样落账、归这个 Run，并标明是迟到的」。规格把这个口子延到了**尝试已被取代**：[`data.call-accounts` v2 S-39](https://github.com/nemori-ai/omne-harness-lite/blob/481f9f45f76f7a36a2c3cd05cc42b640d77a421a/packages.0.0.1.legacy/core/call-accounts/SPEC.md)「它锚定的那次尝试已被新的尝试取代，或它归属的那次运行已经终结——它仍然落下……并标 `late: true`」；[`capability.session-log` v2 S-10](https://github.com/nemori-ai/omne-harness-lite/blob/481f9f45f76f7a36a2c3cd05cc42b640d77a421a/packages.0.0.1.legacy/core/session-log/SPEC.md) ③ 结算类的写（响应体、账）不带栅栏、照写（主线裁定 D-060 K14）。**照 PF-012 字面**，一次在旧尝试里已经出门的模型发出，它的账与响应体写不进日志，「按 Run 汇总成本」会漏；**照规格**，栅栏只拦推进运行的写 | **已闭合（2026-09-26）**：产品负责人同意修正文，D-064 ⑮；PF-012 rev 15 的 §4、§5.7 与 I-11 已对齐，尝试栅栏词条同步。左列保留发现时原文。2026-10-17 接续：执行尝试改为会话一侧拥有的关联、不再是 agent runtime 的启动计数（用户决定，2026-10-17 Agent 扩展继承与边界对齐，见 C-54 与 [UL-run-attempt](terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)），栅栏只比较会话日志里的尝试序号这一规则不变。 |
| **C-35** | 工作区整体私有与共享 | 定义打架 | 旧文案将共享资源也描述为租户私有，与共享参与和两个目录的边界冲突 | **已对齐**，见下方 C-35 |
| **C-36** | 共享实例与本地目录的归属 | 旧投影与最新裁决不一致 | PF-001/PF-002 仍将本地定制与租户私有资源混述，PF-020 已确认实例可跨租户共用 | **已同步 PF-001/PF-002 产品投影**，见下方 C-36 |

| **C-37** | 工作区规则在其他 PF 的旧投影 | 跨 topic 规则冲突 | PF-002 的本地私有验收、PF-015 的仅所有者附着、PF-016 的默认挂载与本机清单边界未对齐 PF-020 | **现行产品投影已对齐并升 rev**（产品负责人 2026-09-27 明确授权），处置见下方 C-37 |

### C-36：共享实例与本地目录的归属

- **类型**：跨 topic 的投影与最新裁决不一致。
- **新裁决**：[PF-020 rev 20](../product.0.0.1.legacy/PF-020-workspace/design.md#工作区实例workspace-instance)及[原始确认](../product.0.0.1.legacy/PF-020-workspace/design.md)：实例可以跨租户共用，关系按会话装配求值；`.omne.local` 是实例本地来源，不保证同一物理实例上不同租户互不可读。
- **旧投影**：[PF-001 rev 21](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md) 路径段落将各自本地定制与租户私有配置并列为不共享；[PF-002 rev 22](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#工作区) 把 local 描述为当前租户定制，并在使用资格段落排除其他租户使用本地定制。需区分实例本地来源与租户级私有资源。
- **状态**：已按产品负责人裁决同步 PF-001 rev 22、PF-002 rev 23，PF-020、相关词条和实例对象保持一致。旧表述不再作为否定共享实例的依据；租户身份、租户级私有资产与凭据规则不取消，冻结技术投影和规格不自动升级。

### C-1 的处置：两个概念都不改名，改的是「能不能裸用」

**为什么不改名。**两个概念**各自都已经拍板**，而且**各自的正文里本来就带着限定**——
PF-001 说的是「协作范围 context」「个人 context」，PF-010 说的是「给模型看的上下文」
「给用户看的上下文」。**真正出问题的只有一种写法：裸写「上下文」。**

**因此 PM 定的是用法，不是名字**（这是唯一自洽的结论，两个概念都动不了）：

> **「上下文 / context」单独出现时不作为术语。**
> **跨 topic 的文字里必须带限定**——是哪一种，写出来。

四个所指各自的正式名：

| 指什么 | 正式名 | 归哪 |
|---|---|---|
| agent 感知到的处境 | **运行时 context** · `Runtime Context` | [作用域与求值](terms/scope-and-resolution.md#ul-runtime-context--运行时-context--runtime-context) |
| 喂给模型的那一份 | **给模型看的上下文** · `Model-Facing Context` | [记录与上下文](terms/record-and-context.md#ul-model-facing-context--给模型看的上下文--model-facing-context) |
| 给用户看的那一份 | **给用户看的上下文** · `User-Facing Context` | [记录与上下文](terms/record-and-context.md#ul-user-facing-context--给用户看的上下文--user-facing-context) |
| 依赖注入与生命周期的容器 | **`Cordis Context`**，**必须写全** | 技术设计，不在这里 |

**四个所指各有正式名，`Context` 这个词本身不再单独作数。**
**这一条只定用法，没有改动任何 topic 的产品结论。**


## C-11 与 C-12 的处置：这两个词都不收

**两条同属一类处置，合并在这里说。**它们与 [C-1](#c-1-的处置两个概念都不改名改的是能不能裸用) 的差别是：
C-1 那两个概念都已拍板、都动不了，只能定用法；**这两条是趁它们还没被收窄，主动不去占用**。

### C-12「异常」：正式词是「非常态」


**「异常」在这个仓库里有两个日常所指**，而且两处都躲不掉：

| 哪一处 | 指什么 |
|---|---|
| [PF-006 正文](../product.0.0.1.legacy/PF-006-tools-and-skills/design.md)（五处） | **程序抛出的那种**（「异常不带语义」） |
| **十个 topic 的 `flows.md` 章节标题** | **不正常的情况**（「异常分支」），[模板里还立着一条纪律](../product.0.0.1.legacy/.templates/topic/flows.md)：「异常分支和正常路径一样重要」 |

**处置与 C-11 同一种，三处各归各位、谁都不用将就谁：**

| | 怎么办 |
|---|---|
| **十份 `flows.md`** | **一个字都不用改**——那本来就是日常义 |
| **PF-006 那五处** | **改成「报错」**。它们想说的是「不要只给一个『出事了』的信号」，而「不用异常」**只挡住了其中一种做法**——错误码、空返回、状态码同样违反那条产品约束。**回改归 PF-006 的 owner，且要升 rev** |
| **正式概念** | **[非常态](terms/execution-and-outcome.md#ul-off-nominal--非常态--off-nominal) · `Off-Nominal`**，归 [PF-011](../product.0.0.1.legacy/PF-011-off-nominal-handling/README.md) |

> **「异常」裸用时是白话，不是术语。**要精确表达时说「非常态」。

**为什么正式词不叫「异常」也不叫「偏离」**：前者已被两种日常义占着；
后者虽直白，但**这个概念出现的频率极高**，而 `Off-Nominal` 精确表达了
**「不是坏了，只是不在标称路径上」**——那正是 PF-011 第一句话要说的事。

### C-11「事件」：换用两个更准的

**为什么不收。**判据就是取名那一条（`ubiquitous-language` skill「取名：不许占用通用词」）——
**这个词在别的上下文里，会不会也被用来指别的东西？**
它在**三个**上下文里各指一样东西，而且**那些用法一个都躲不掉**，
它们本来就是这个词的常见意思。

**收窄它，它在别处的正常用法就全变成冲突。**而我们真正要区分的那两层，
各自有更准的名字：

| 指什么 | 正式名 | 归哪 |
|---|---|---|
| 一件真实发生过的事 | **发生的事** · `Occurrence` | [记录与上下文](terms/record-and-context.md#ul-occurrence--发生的事--occurrence) |
| 系统为它留下的一条不可变条目 | **记录条目** · `Record Entry` | [记录与上下文](terms/record-and-context.md#ul-record-entry--记录条目--record-entry) |

> **「事件」裸用时是白话，不是术语。**它跟「东西」「情况」一样可以出现在正文里，
> **但它不指代这里定义的任何一个概念**。要精确表达时，换上面那两个词。

**这一条只定用法，不要求任何 topic 回改**——
现有正文里的「事件」本来就是日常义，[PF-000 §6.7](../product.0.0.1.legacy/PF-000-occurrences-and-record-entries/design.md#67-事件在本系统不是术语) 已把这条写进产品规则。


## C-35 · 工作区整体私有与跨租户共享 — 已按产品要求对齐

- 观察到的旧说法：[PF-001「路径是地址，不是钥匙」](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md#路径是地址不是钥匙)（rev 20）写“各自的工作区资产与配值互不可见”；[PF-002 验收](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/acceptance.md)（rev 21）写切换租户后“工作区是另一份”。
- 已有另一说法：[PF-020 工作区](../product.0.0.1.legacy/PF-020-workspace/design.md#工作区workspace)（rev 2）写“参与租户的实例仍然指向同一个工作区”。前两处把共享资源也写成了租户私有内容，会使跨租户维护同一工作区无法成立。
- 处置依据：产品负责人确认共享参与，并于 2026-09-27 明确 `.omne` 与其他获准租户共享、`.omne.local` 仅单租户本地定制，要求落进 PF。来源见 [交流笔记](../product.0.0.1.legacy/PF-020-workspace/design.md)。
- 状态：PF-020 rev 3、PF-001 rev 21、PF-002 rev 22 已对齐；共享资源按关系授权，私有内容仍按租户隔离。组织参与限制不拦有资格的只读，也不授予额外读取权。整包、同步策略与冻结规格的接受状态不因本项对齐而升级。

## 记的时候写清楚什么

**四样，缺一样就查不下去：**

1. **哪两处**——带链接与 rev，不写「某个 topic 里」。**这里的 rev 是「记下这条冲突时看到的那一版」**，
   是观察的时间戳；topic 之后再升 rev，这里不跟着改，对账器也不查它——它与词条「出处」的 rev 不是一种东西；
2. **各自怎么说的**——**原文**，不要复述；
3. **差在哪**——说得出后果最好，说不出也要说清差别；
4. **这一条动不动得了**——PM 能定的自己定并写推理，定不了的**明确标成待裁决**，
   交回对应 topic 的 `decisions.md`，判据见 `product-design` skill 的「什么时候问，什么时候自己定」。

> **不要在这里裁决产品问题。**这里只负责**把冲突摆出来**，
> 裁决落回那个概念所属的 topic——**它的 owner 在那里，不在这里**。

返回[统一语言入口](README.md)。

### C-37：工作区跨 PF 规则对齐

- **裁定依据**：产品负责人 2026-09-27 指示：“基于 workspace 这边的产品设计，再回顾其他的 PF 如果有冲突的，以 workspace 的设计为准完成更新升 rev”。基准为 [PF-020 rev 21](../product.0.0.1.legacy/PF-020-workspace/design.md)。
- **已发现**：PF-002 flows/acceptance 仍将 `.omne.local` 归某个租户私有；PF-015 §6.13 限制只能选租户持有的工作区；PF-016 的流程与验收把目录候选当作默认附着，并将仅本机候选清单当作工作区关系的全部。治理存储与实例生命周期的归属也需要分开。
- **处置范围**：修订现行产品正文、流程、验收及关联术语，对实际语义变更升 rev。历史访谈、裁决原话与冻结规格不改写，旧结论的取代范围在各包 changelog/decisions 记录；不因此扩大整包接受或实现状态。
- **状态**：现行产品投影已修正，PF-002/003/004/005/006/007/014/015/016/017 分别升 rev；PF-001 已一致，无须升 rev。完整逐 PF 结果见 [PF-020 回顾](../product.0.0.1.legacy/PF-020-workspace/design.md)。冻结规格差异仍由新规格承接。
- **残余矛盾复核（2026-09-27）**：独立评审发现 PF-002 rev 24 的取舍仍称“同地址不同租户是两份、没有共享工作区”，隔离验收也仍要求所有资产与配值互不可见。[PF-002 rev 25](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md) 按已有 PF-020 rev 21 裁决修正：逻辑身份、实例与地址分开；共用实例仍隔离租户层私有资产、设置与凭据；免授权公共工作区的非目标不排除经授权共享。这四处残余矛盾已闭合，44 条相关词条及 3 条对象逐项回读出处；定义、骨架和原有未裁范围未变，实际版本化的 PF-002 引用接续 rev 25。索引中 `.omne.local` 的旧“单租户本地定制”摘要同步为“实例本地定制”，与现行词条一致；不由此裁定外部仓库首次登记的治理所有者。
- **外部仓库新裁决接续（2026-09-27）**：产品负责人明确裁定登记外部仓库“没有治理者，都是参与者”，并确认组织启用参与限制后不再把外部仓库认定为受限租户的工作区，普通目录访问无法据此禁止，是尽力而为的治理。[PF-020 rev 22](../product.0.0.1.legacy/PF-020-workspace/design.md#组织对参与范围的限制)、[PF-001 rev 23](../product.0.0.1.legacy/PF-001-identity-scope-and-agent-constraints/design.md)与[PF-002 rev 26](../product.0.0.1.legacy/PF-002-assets-settings-and-permissions/design.md#工作区)接续此明确裁决。工作区、租户—工作区关系、工作区超管的治理范围同步为仅 Host 具有所有者/超管；参与限制补充外部仓库不附着、不加载来源、普通目录原权限不变的适用边界，不删除全局身份或关系、不热重判正在运行的会话。工作区寿命宿主及外部工作区终结规则保持正文未述，不能由参与者推定；所有点名出处逐条回读后接续版本，冻结规格与技术投影不自动升级。上段“首次登记所有者未裁”保留为 rev 25 复核时的历史状态，本次明确裁决已取代它。


### C-38：作业会话与现有会话类型的适用范围

- **两处输入**：[PF-015 §4 会话类型](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md#会话类型)（rev 13）说「它由用户创建会话时选定的 AgentDefinition 算出来」「当前有五类」；[PF-021 §4 作业会话](../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#作业会话)（rev 1）要求无论选哪份 AgentDefinition，都附加统一成果工具与目标完成检查，作为会话子类型。
- **差别**：前者是用途分类，后者是承接 Job 的执行约束。将后者加成第六种用途或绑定专用 AgentDefinition，会违背 PF-021 的明确要求。
- **当前处置**：新词条 UL-job-session 明确该含义，父仍是会话；不同于 parent-child 关系的子会话。已有 UL-session-type 的用途定义保持不变；PF-015 增加对作业执行约束的引用。
- **状态**：词义与产品引用已对齐；PF-015 明确引用作业执行约束，PF-021 沿既有装配与生命周期，实际机制承接归技术设计，依据为 [PF-021 来源问题](../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md)。不将已有规格视为已支持新子类型。

### C-39：Routine 的独立对象与内含属性

- **两处输入**：PF-021 rev 4 §4 工作例程原文为「Routine 具有可区别的身份，精确标识规则未定；其变更传播、删除与留存未定」；[PF-021 §4 工作例程](../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md#工作例程)（rev 5）明确「Routine 没有独立身份、归属或生命周期，随 Schedule 一起创建、读取和修改」。
- **差别**：前者会产生独立 Routine 存储身份、引用、管理工具及共享更新；后者由一份 Schedule 包含工作数据，各次 Job 共用定义而非可变状态。
- **裁定依据**：[INT-022/023](../product.0.0.1.legacy/PF-021-schedule-and-calendar/design.md) 的包含关系与完整更新指令；早期工具候选不足以支持独立对象，取代范围见该包 changelog rev 5。
- **状态**：已在现行产品与词表落实，UL-routine 保留 ID 并改为属性，独立对象条目移除；出厂预置只是提供描述的来源，不据此恢复运行期 Routine 对象。历史访谈与 changelog 原话不改写。

### C-40：模型响应体与实际发送的存在关系

- **两处输入**：UL-model-response 及领域对象生灭曾写“一次都没发出的调用没有它”；已接受 [RT8 S-15/S-33](https://github.com/nemori-ai/omne-harness-lite/blob/481f9f45f76f7a36a2c3cd05cc42b640d77a421a/packages.0.0.1.legacy/core/model-request-runtime/SPEC.md) 要求先耐久登记请求，再发出，并对未收场的登记责任追补响应。登记后、实际发送前取消或失联时，两种说法不能同时成立。
- **产品依据**：[PF-013 §5.5 留痕](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程) 与 [§5.13 停机](../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)（rev 15）要求真实留痕及未知费用不补零，并没有给出词表增加的“从未实际发送则绝无响应记录”排除条件。
- **处置**：2026-09-28 主线按已接受的登记／结算责任边界纠正这条过强概括；独立 spec-reviewer 已定位词表／对象冲突及产品出处。模型响应体仍是同一耐久记录对象，Upstream Send 仍指实际发送；响应记录存在不证明发生发送、收到回复或产生零费用，不改变重试条件。不把未接受 MR8／RT9 的具体时间表示视作本词条的接受依据。
- **状态**：中英定义、索引与对象生灭已对齐；实际发送时间的未知表示、恢复来源与消费者迁移仍按 MR8／RT9 候选的独立评审、接受及验证流程处理。既有对象条目中成功／失败记录归并的产品来源未裁项保持，不借本次消歧关闭。


### C-49：装配选入的来源不止 Agent Definition

整合编号：origin/main `00356190` 原编号 C-40；HUB C-40 已被冻结接受记录引用，故本项改用 C-49，含义和来源不变。

- **旧说法**：PF-004 rev 13 §4 装配及 UL-agent-assembly 写「输入是两样——依据的定义版本，加上当时该作用域的求值结果」；PF-002 rev 24 §5.1 用从 AgentDefinition 展开的组合图描述组装。
- **新输入**：产品负责人要求会话类型的必须依赖优先、定义显式依赖必需，Skill、Tool、MCP 可按声明自动继承并排除；继承只选能力，不限制实现来源。见 [INT-006～008](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md)。
- **差别**：旧说法无法独立表达特殊会话的强制能力，也无法控制额外环境能力的选入；把继承层级同时用于实现选择，会排除用户明确允许的同标识实现覆盖。
- **状态**：按 [PF-004 裁决](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md) 对齐 PF-004 rev 14、PF-002 rev 25 与词条；保留 meta 不可替换、上级持有的 immutable 及热重载边界。后续 INT-011 已闭合 PF-004 D-3：默认 false、声明随生效定义；PF-004 rev 15 与词表同步。


### C-41：official Agent Definition 的不可替换边界

- **旧说法**：PF-004 rev 14 §6.8 写「租户能自定义的，只有 non-master 的定义」；PF-002 rev 25 §5.5 写「official 可被替代，除了三种情形」，仅列 meta、组织与租户的持有锁定；其 flows §1.3/1.4 仍写「official 永远可被替代」「不存在把 official 锁住这回事」。PF-001 rev 22 来源表只显式指向 meta 例外。
- **新要求**：[INT-011](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md) 明确 official Agent Definition 为 immutable，组织、租户、工作区能自定义的均为 non-master。
- **差别**：旧表述会允许以同标识定义替换官方定义，且没有完整覆盖三层自定义边界；旧流程还遗漏已经存在的持有层锁定。
- **处置**：按 [PF-004 续裁](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md) 对齐 PF-001 rev 23、PF-002 rev 26、PF-004 rev 15 与相关词条。其他 official 类别不因此全部不可替换。冻结规格不改，产品接受范围不扩大。


### C-42：协作模式开关与 meta 必需绑定

- **两处输入**：PF-007 rev 19 §5.7 规定 meta 门不可禁用、替换、移除，并写「never 时 ask 照常能用」；[PF-015 INT-003](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md) 明确用 Ask() 开关与目标完成检查装卸区分协作模式。
- **差别**：若把关 Ask() 当成删除资产，会破坏既有必需绑定；若把原可用性表述读成不受任何会话模式影响，则无法支持 auto-drive 关 Ask()。
- **处置**：PF-015 rev 14、PF-007 rev 20 区分资产绑定与运行期人交互能力开关。协作模式与权限、执行环境正交；never 本身不禁 ask，但 ask 仍受协作开关约束。开启不解除命令限制，关闭不授予权限。推导依据见 [PF-007 本轮记录](../product.0.0.1.legacy/PF-007-meta-capabilities/design.md)。具体开关及在途衔接归技术设计。

### C-43：定义身份固定与内容热重载

- **分歧**：交流中曾把 AgentDefinition 不可变理解为身份和版本一起固定，词条也笼统写“改定义不会改变已经在跑的 agent”；PF-004 已规定定义更新在下一 Run 采用。
- **裁决**：[PF-015 INT-002](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md)明确身份固定、同身份内容热重载。
- **处置**：PF-004 rev 16 与 PF-015 rev 15 明确新 Run 取最新有效内容、同 Run 尝试保留既有版本；同步定义词条，不把工作区切换当作换定义身份。已闭合。

### C-44：持久化投影与完整恢复输入

- **分歧**：PF-012 rev 15 的“不另存”“当下条件不落日志”可能被理解为禁止保存投影和实际采用依据；PF-015 rev 14 的恢复“全部一样”可能把动态外部事实也冻结。
- **裁决**：[PF-015 INT-001、INT-003](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md)要求投影和会话使用值持久化，从同结果所需的确定函数输入反推保存范围。
- **处置**：PF-012 rev 16 允许派生投影落盘，禁止第二份事实权威；PF-015 rev 15 区分自有恢复输入、历史采用依据与当前来源。模型／工具真实结果不由纯函数假设取代。相关词条对齐，已闭合。

### C-45：模型宿主、工作归因与运行时句柄

- **分歧**：PF-012 rev 16、PF-013 rev 13 和 UL-D-3 把 Model runtime 的生命挂在 Agent runtime 上，并据此禁止等待模型时释放 Agent runtime；PF-011 rev 4 把工作层级描述为生命周期包含。用户的新要求明确 Model／Tool runtime 均归 Session 或 Run 逻辑治理，Agent runtime 销毁仅释放句柄。
- **裁决依据**：[运行时归属 INT-001～003](../product.0.0.1.legacy/PF-015-session-lifecycle-and-ownership/design.md)。
- **处置**：PF-006 rev 21、PF-011 rev 5、PF-012 rev 17、PF-013 rev 14、PF-015 rev 16 及词条／对象条目统一为 Session 生命周期、Run 工作归因和显式取消。零句柄仍执行，先查原执行再恢复；当前尝试承接结果与旧尝试越权分开。产品表达已闭合；冻结契约及历史接受记录保留，后续规格演进仍须落实该变化。

### C-46：同一 Run 的定义版本与显式 reload

- **分歧**：PF-004 rev 16 的 I-3 禁止同 Run 更换定义版本；PF-002 rev 27 把 reload 一律限定为刷新注册表且不影响当前 Run。
- **裁决**：[2026-09-29 装配交流](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md)允许显式 reload 在当前 Run 的安全交接点采用同身份新定义、开启新尝试；未发起的旧模型建议按新装配核对。
- **处置**：PF-004、PF-012、PF-015 明确默认传播与显式交接；PF-002、PF-014 区分来源刷新范围与构成生效边界。撤销、卸载和不可用只规定产品原则，具体衔接归 Cordis 技术设计。历史 C-43 保留当时裁决语境；当前规则以本次裁决为准。

### C-47：能力数据与实现变化被误当成 Loop 生命周期变化

- **分歧**：PF-004 rev 17 把同身份工具实现替换、能力移除或常驻成分变化一概列为 Agent runtime 重建；PF-002 / PF-006 把禁用与替换件的可见范围分割为“必定不可见”和“仅依赖不可用”。PF-010 又把系统提示词描述为实例期恒定。
- **裁决依据**：[装配交流 INT-005～008](../product.0.0.1.legacy/PF-004-agent-definition-and-assembly/design.md)明确会话能力身份单调、数据／实现解耦；两种必需来源均不构成 Loop 对具体能力服务的直接依赖。
- **处置**：会话保留已知能力，当前数据、实现与可用性动态采用；单次执行冻结自身输入；Loop 自身捕获组成变化才交接，AgentDefinition 版本沿原采用边界。系统提示词按当前合法输入逐请求生成，仍不受压缩影响。C-33 的“动作空间”疑义按已知身份与可执行集合区分；历史解释保留，不再据其推导删除已知身份或工具实现换代必重建 Loop。人的命令入口隐藏规则保持。

### C-48：派发者停止与子会话执行被混为同一生命周期

PF-007 §9.2 旧推导把父停止、报告到达均解释成子协程停止；PF-012 的现行规则明确父 Run 取消不影响子会话及其执行。按现行会话归属与显式取消目标对齐：派发撤回是控制被派工作，报告结束派发，不据此终结子 Run；父会话归档仍递归归档子会话。PF-007 rev 22 已修订，未重开产品取舍。

### C-50：裸写的「服务提供者」

- **类型**：同义不同名。
- **两处输入**：[Cordis 服务提供者](terms/architecture-core-and-extension.md#ul-cordis-service-provider--cordis-服务提供者--cordis-service-provider)（2026-10-02 立，[现行词义](index.md)）；
  产品正文里早已按同一个意思裸写「服务提供者」：PF-004 `design.md` 四处（「替换自身必需服务提供者」「Loop 自身直接依赖的服务提供者撤除／替换」等），
  PF-002、PF-004、PF-012、PF-014、PF-015 的 `decisions.md` 各一处「框架核对依据：Cordis 4.0.4 必需服务提供者变化读数」，PF-013 固化投影 v5 一处。
- **差别**：所指相同；裸写的「服务提供者」单独拿出来会被读成提供某项业务服务的一方，或与模型请求的「供应商」（provider）混同。
- **处置**：正式名取「Cordis 服务提供者」，裸写进该词条的「弃用」。**正文回改归各 topic 的 owner**，按各自 changelog 记；固化投影不改。
- **状态**：正式名已定；产品正文未回改。

### C-51：未受理输入的恢复责任与消费后删除的歧义

- **分歧**：PF-014 rev5正文与验收对提交前停机责任相抵，rev6 D-1 将所有未落盘输入都写成系统自行恢复；“inbound 就是队列”会遗漏卡片／命令，“消费后移除”会误删日志或工具结果。
- **裁决依据**：[当前产品边界](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md)。
- **处置**：PF-014 rev12 以持久受理事实和待处理资格共同成立为普通消息边界；提交前由发送方保留并重试，回执未知单独处理。PF-012 rev22 明确持久承接与退出队列；PF-015 rev21 收齐可靠交接及清除范围，原历史与各能力清理承诺保留。词条采用同一含义，不新立队列对象或同义术语。
- **状态**：产品表达已闭合；具体共享存储、提交机制及故障验证仍待 P3／P4，冻结契约和实现不据此升级。

### C-52：Trigger 的队列变化与 Run 开始条件不等价

- **类型**：定义打架。2026-10-06 第一期 P1.3 来源核对发现，不作为新裁决。
- **词条原文**：[UL-trigger](terms/agent-runtime-loop.md#ul-trigger--触发--trigger) 把触发定义为“一次运行的起点”，并用“让待处理消息队列从空变成非空的那件事”作精确解释。
- **产品原文**：[PF-012 rev22 的 Run 开始边界](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#边界什么让它开始什么让它结束)要求“存在仍有待处理资格的未承接输入，且没有未终结的 Run”。同节又把“触发”称为队列从空变非空，未带这个条件。[UL-run](terms/agent-runtime-loop.md#ul-run--运行--run) 的定义已包含两项条件。
- **反例**：原 Run 在等模型结果，已承接输入退出队列，队列为空；普通追加经持久受理进入队列，使其从空变非空。原 Run 仍未终结，新输入应由它承接；仅凭队列变化另开 Run 会违反单活跃规则。恢复时队列已非空但没有未终结 Run，也仍需开始 Run，不能等一次新的空转非空。
- **影响**：所有用 Trigger 直接决定开 Run 的消费者；本期直接涉及 ST-014-01／02／05／06、ST-015-03。不改变现行已明确的 Run 开始条件，也不改写历史裁决。
- **负责与闭合条件**：统一语言跨 topic 定义拥有者与 PF-012 owner 核对 Trigger 是新 Run 的起点还是一般队列变化，按有效接受范围修订词条及产品投影并同步消费者。闭合前，不能把 UL-trigger 的队列变化摘要当作充分或必要的单独开 Run 判据；现行 Run 的两项条件仍有效。本项不阻止来源盘点及不依赖该歧义的设计。
- **状态**：已闭合（2026-10-06）。用户确认 Trigger 为会话推进信号，PF-012 rev23、PF-014 rev13 及 UL-trigger、流程、验收和适用故事卡已同步；Run 的两项开始条件保持。来源与限定采用见 [当前产品边界](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md)及 [当前产品边界](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md)。本项产品含义已闭合；技术消费者核对及恢复机制仍由 P3／P4 完成，不等于其实现已改。上列原文与反例保留发现时坐标，现行含义沿词条及产品正文。

### C-53：尝试开始事实与模型提醒消息被混为同一条目

- **类型**：定义打架。2026-10-06正式会话第一期技术承接发现；不新增“event”术语或领域对象。
- **来源**：[UL-session-log](terms/record-and-context.md#ul-session-log--会话日志--session-log)、[PF-012 rev23会话日志](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#会话日志)规定日志包含非消息事实，尝试开始事实不会在组装时变成消息；同PF的[§5.7尝试开始](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事)及[§6.4](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#64-每一次尝试开始agent-都要知道)却规定提醒消息同时充当开始记录。PF-009引用前者，同时允许业务事件类提醒，不能据此将全部内部事实归为提醒消息。
- **新输入**：负责人panqiwei在本会话明确要求“event（比如attempt event）也被包装成了SystemReminderMessage发给了模型，这是不行的”，并要求模型调用的消息列表从session log计算投影。该要求限定排除内部事实自动成为模型消息；没有取消全部合法业务提醒，也没有选定具体日志类型、缓存算法或存储。
- **反例与影响**：把尝试开始写成提醒，模型消息投影便会收进技术事实；若只在发送时删掉它，依赖提醒认定尝试开始的恢复／结算读者仍耦合于错误表示。涉及PF-012／PF-009／PF-010的相关规则与实际消息、尝试治理、组装、模型调用消费者；源码观察不表示已运行或修复。
- **负责与闭合条件**：产品定义拥有者同步尝试开始事实与模型感知要求的边界及适用流程、验收和出处；技术接口拥有者分别落实事实表示、投影与原调用恢复／结算来源并迁移消费者。闭合前不采用“每次尝试开始必须向模型追加提醒”的旧读法，不自行删除真实业务结果或风险感知要求。
- **状态**：产品表达已同步（PF-012 rev24及S103、PF-010 rev8），独立产品复核已完成限定范围；自动尝试提醒的产品歧义闭合。技术消费者迁移尚未实施，必须沿[候选整改设计](../architecture/session-agent-runtime-phase1/boundaries.md)及各实际承诺完成，不据此声称源码已修复。
- **2026-10-17 接续**：「尝试开始」是会话一侧的记录（[UL-run-attempt](terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)）。Agent 一侧新的开始事实是一个新 Agent 执行的开始，经过[执行开始之后](terms/agent-runtime-loop.md#ul-execution-started-position--执行开始之后--execution-started-position)位置，两者不合并。本条原有结论不变。


### C-54：工具调用与工具结果部件由谁发布

- **类型**：定义打架。2026-10-17 在 #342 的 Model 主干评审 R-2（共享 ToolCallPart）时发现。不新增词条。
- **来源**：[UL-content-block](terms/record-and-context.md#ul-content-block--内容块--content-block) 原写「`tool_call` 和 `tool_result` 由工具领域发布」。[COMMON-T02](../../../docs/architecture/cross-cutting-concepts.md#common-t02) 当时有同一句。另一方是 [message 成员](../../../packages/common/message/src/index.ts)：它导出 `ToolPart` 与判定函数，拥有消息身份、角色与调用关联。[Model 契约 SPEC 的「工具定义转换与内容引用加载」](../../../packages/model/model-contract/SPEC.md#工具定义转换与内容引用加载)写调用建议采用 common/message 的 ToolCallPart。[会话日志事件 SE10](../../../packages/session/session-contract/docs/object-model/session-log-events.md) 写 ToolMessage 形状归消息契约。
- **反例与影响**：按旧句，工具领域要发布消息部件，Tool 就得依赖消息模型，而 Tool 目前不导入 message。按 message 一方，消息部件与工具领域没有依赖。两种读法的写者与依赖方向相反。
- **负责与闭合条件**：负责人 PanQiWei 于 2026-10-17 指定 Model 主干更正统一语言一方。词条已改为引用 COMMON-T02，不再自写包级归属。COMMON-T02 属架构区正文，其拥有者已同步。
- **状态**：已闭合。依据是 [COMMON-T02](../../../docs/architecture/cross-cutting-concepts.md#common-t02)：`tool_call` 与 `tool_result` 部件的形状由 `packages/common/message` 发布，工具领域产出工具结果的内容，不发布消息部件。词条与架构正文现在一致。

### C-55：模型档案词条仍写发前检查，缺窗口、压缩百分比与 updatedAt

- **类型**：定义打架。2026-10-19 在 Model 契约包送轨的文档评审中发现；不新增词条。
- **来源**：[UL-model-profile](terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)仍写「输入 token 的发前限额检查可以采用有依据的估算与明确配置的余量」，也写「字节与图片数量仍按实际值精确检查」。词条没有上下文窗口、默认压缩触发百分比与 `updatedAt`。另一方是 [Model 契约 SPEC 的「上游限制与提供上限」](../../../packages/model/model-contract/SPEC.md#上游限制与提供上限)：Model 的准备与发送路径不计量，也不以计量结论作为发出条件，上游报告输入超限时调用以 `failed` 收场，成因为 `input-over-limit`。档案另带上下文窗口、默认压缩触发百分比与不倒退的 `updatedAt`。
- **反例与影响**：按词条，档案消费者会认为发送前有一道限额与精确字节检查，并会认为档案不带窗口与压缩百分比。按 SPEC，请求前的计量与限额判断归压缩方或请求组装方，发送前没有这道检查。读词条的人会把发前检查当作 Model 的义务，或找不到压缩方读取窗口的出处。
- **负责与闭合条件**：负责人 PanQiWei。由词条拥有者修订 UL-model-profile，使词条与 Model 契约 SPEC 一致，并同步英文段与消费者。闭合前，不能把词条里的发前检查读作 Model 的发送条件，也不能据词条断言档案没有窗口与压缩百分比。
- **状态**：打开。词条未改。

### C-56：Agent runtime 是否空闲后复用

- **类型**：定义打架。2026-10-17 改写词条时发现。
- **两处输入**：[UL-agent-runtime](terms/agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime) 原词义（产品负责人 2026-09-20 直接裁决）写「一次起一个」「从 Run 的角度看，它的一生就是一次执行尝试」「协程每次重新起」；已接受系统页 [Agent runtime](../../../docs/architecture/runtime/agent-runtime.md#实例执行与执行挂接) 写 runtime 可以在一次执行结束后保持空闲并复用于后续执行。
- **差别**：若复用，runtime 的寿命长于一次 Agent 执行，登记与生灭随之不同；若不复用，每个新 Agent 执行另起一个。两种读法对「一个会话同一时刻至多一个活跃 agent runtime」都成立。
- **处置**：项目负责人在本次交接中把「Runtime 可 idle 复用，逻辑执行与物理实例寿命分开」列为必须继承的要求，按此取复用一说。词条与对象条目改为：一次 Agent 执行结束后 runtime 回到空闲并保持登记，可以承接下一次 Agent 执行；前后两次执行之间不沿用主体、授权、取消状态、输入队列与结果游标。
- **状态**：已闭合（2026-10-17）。上列原文保留发现时的写法，现行含义以词条为准。

### C-57：连续否决是否有上限

- **类型**：定义打架。2026-10-17 核对「消息落盘之前」说法时发现，并非本次决定引起。
- **两处输入**：[UL-consecutive-veto-limit](terms/execution-and-outcome.md#ul-consecutive-veto-limit--连续否决上限--consecutive-veto-limit) 沿封存 [PF-012 §5.8](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)（rev 25）写同一步连续被否决到上限时 Run 落失败；[产品页 模型回复与工具结果](../product/agent-progression/design.md#模型回复与工具结果)（rev 2）写连续否决不设次数上限，不因此使 Run 失败。
- **另一处现行权威**：已接受系统页 [Agent runtime 回复准入与动作处理](../../../docs/architecture/runtime/agent-runtime.md#回复准入与动作处理) 写「连续否决不设次数上限。否决历史保留，不因此使 Run 失败」，与产品页一致。
- **差别**：同一场景下，一条要求到上限失败，另一条要求永不因此失败。
- **处置**：这不是产品未决项，而是词条落后于现行权威：已接受正文优先于封存旧材料。词表维护者按现行权威弃用 UL-consecutive-veto-limit，并改写指向它的说法（[UL-message-admission](terms/agent-runtime-loop.md#ul-message-admission--消息准入--message-admission) 注意 ②、[一次模型调用](terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)注意 ③、[试尽](terms/execution-and-outcome.md#ul-retry-exhaustion--试尽--retry-exhaustion)注意 ①、索引行）。
- **状态**：已闭合（2026-10-17）。

### C-58：模态转换件的执行时点

- **类型**：定义打架。2026-10-17 用户决定移除消息持久化位置后发现。
- **来源**：用户决定暂不提供消息落盘之前与之后两种扩展位置。已接受[系统页](../../../docs/architecture/runtime/loop-extensions.md#不可用报错与系统扩展)的系统扩展表把模态转换列为系统扩展，非 Tool ref 来源的转换位置当时待负责人接受。
- **各处现状**：[Model 契约](../../../packages/model/model-contract/SPEC.md#转换件的共同契约)写非 Tool ref 路径的转换在消息接纳前完成，且转换件不根据当前模型决定是否转换；请求时才加载并转换的只有 Tool 内容引用。[Model 契约的模态投影与实际表示](../../../packages/model/model-contract/SPEC.md#模态投影与实际表示)把实际表示的选择与组装交给 request-context。[UL-modality-converter](terms/capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)、[UL-derived-rendering](terms/record-and-context.md#ul-derived-rendering--派生表示--derived-rendering)、[UL-transcript](terms/record-and-context.md#ul-transcript--transcript--transcript) 与保留技术源 [modality-projection](../architecture/modality-projection/design.md) 仍以「在落盘之前写好」和「prepersist 跨域」描述转换。
- **候选归属**：一，与 Tool 内容引用一样，在 Model 实际请求准备时按模态投影加载并转换，转换失败按请求准备失败返回。二，仍在消息接纳前完成，只是不再挂在拓展位置上：实现[消息准入](terms/agent-runtime-loop.md#ul-message-admission--消息准入--message-admission)的提供者在接纳前调用转换件，Tool 内容引用在 Model 实际请求时转换，Agent 只看到接纳后的消息与派生表示。
- **推荐**：协调者推荐候选二，候选一不再推荐。候选二沿用 Model 与 Context 现行规格的时点，不另造时点，也不让 Agent 理解模态细节。
- **受影响页**：系统页系统扩展表的模态转换行及其后一段、[UL-modality-converter](terms/capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter) 及其索引行、[UL-message-admission](terms/agent-runtime-loop.md#ul-message-admission--消息准入--message-admission) 注意 ③。这三处已按候选二写。UL-derived-rendering、UL-transcript 的「在落盘之前写好」与候选二一致，不需要改。modality-projection 专题中「prepersist 跨域」的位置说法已改为接纳前调用。选候选二时 Model 与 Context 的规格不需要改。
- **负责与闭合条件**：项目负责人接受候选二，或改选候选一。接受候选二后，去掉上述词条的「待负责人接受」，并复核模态转换件的形态：它不再站在拓展点上，是否仍是拓展件的变体。
- **状态**：已闭合（2026-10-19）。项目负责人在[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)中接受候选二中非 Tool ref 来源的位置；Tool 内容 ref 的时点归 Tool 线，随其契约进入集成轨道。系统页、UL-modality-converter、索引行与 UL-message-admission 注意 ③ 已去掉「待负责人接受」。形态复核：UL-modality-converter 保持「变体（父：拓展件）」。已接受系统页仍把模态转换列在系统扩展表中，位置栏写「不在扩展位置上」，并由系统装配选择和替换。父词条 [UL-loop-extension](terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension) 的定义写「挂在某个 Loop 拓展点上」，与转换件不站在拓展点上不一致；这一点已在转换件词条的「别混 ②」写明，形态改动须先改产品正文。Model 契约页（`packages/model/model-contract`）尚未进入集成轨道，其措辞随该页进入集成轨道时核对。

### C-59：执行挂接的形态

- **类型**：形态未定。2026-10-17 立词条 [UL-execution-attachment](terms/agent-runtime-loop.md#ul-execution-attachment--执行挂接--execution-attachment) 时发现。
- **两种读法**：一，对象：有独立身份，有自己的生灭和围栏，每次重挂接产生新的一个。二，属性：Agent 执行与 agent runtime 之间当前那一次关联，挂在执行或 agent runtime 上，不另立身份。
- **产品正文**：[产品页](../product/agent-progression/design.md#扩展检查与权限)（rev 2）只说重挂接与实例换代不再经过执行开始之后位置，没有给执行挂接的身份或生灭。
- **判据**：能挂成已有对象一个属性的关系，不另立对象（见 `ubiquitous-language` 技能「判形态」）。
- **负责与闭合条件**：Agent 技术设计（系统架构设计）按产品页的触发边界核对两种读法，定后回头改词条形态。
- **处置**：Agent 契约的[对象模型](../../../packages/agent/agent-contract/docs/object-model.md#对象与生命周期)给执行挂接独立的身份、三种状态（有效、被取代、已脱离）和围栏记录：状态终止后记录保留到所属执行的保留期结束，用于归属晚到回执与事件因果。它有独立身份和耐久记录，不能挂成执行或 agent runtime 的一项属性，所以取第一种读法。词条形态改为对象，[领域对象](../domain_objects/objects.md#ul-execution-attachment--执行挂接)已立条目，待裁项已删除。
- **状态**：已闭合（2026-10-18）。依据是 Agent 契约的对象模型。该契约已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)采用（2026-10-19），接受时已复核：已接受的对象模型仍给执行挂接独立身份、三种状态和耐久的围栏记录，形态保持对象。

### C-60：拓展结论的形态

- **类型**：形态未定。2026-10-17 立词条 [UL-extension-conclusion](terms/agent-runtime-loop.md#ul-extension-conclusion--拓展结论--extension-conclusion) 时发现。
- **两种读法**：一，Agent 自己保存的耐久记录，有自己的身份，已有它的调用不再调用。二，会话日志里记录条目的一种，沿封存 [PF-012 §6.10](../product.0.0.1.legacy/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论) 的写法。
- **差别**：Agent 不要求、不解释会话日志，所以第二种读法与 Agent 一侧的边界不一致；第一种读法没有产品正文给出身份与生灭。
- **负责与闭合条件**：Agent 技术设计（系统架构设计）定拥有者与记录种类，定后回头改词条形态。
- **处置**：Agent 契约的[扩展作者协议](../../../packages/agent/agent-contract/docs/public-api/extensions.md#conclusion)规定 Agent 把校验通过的输出包装为结论并保存，作者不返回结论。[对象模型](../../../packages/agent/agent-contract/docs/object-model.md#对象与生命周期)把扩展调用的记录列为 execution 内的台账，结论没有独立于所属调用的身份。保存者是 Agent，保存位置是它的执行记录，所以第二种读法与 Agent 不解释会话日志的边界不符。词条形态改为属性，挂在 Agent 执行的记录上，待裁项已删除。非最终结论（请求人处理）与最终结论同属这一属性。
- **状态**：已闭合（2026-10-18）。依据是 Agent 契约的扩展作者协议与对象模型。该契约已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)采用（2026-10-19），接受时已复核：已接受的对象模型仍把结论列在扩展调用的台账内，结论没有独立身份，形态保持属性。

### C-61：斜杠命令受理依赖已移除的位置

- **类型**：定义打架，外域。2026-10-17 用户决定移除消息落盘之前位置后发现。
- **来源**：[slash-commands 产品页](../product/slash-commands/design.md)、[领域流程](../../../docs/domains/slash-commands/key-flows.md)与[包架构](../../../packages/slash-command/docs/architecture.md)依赖该位置做展开、脱敏与否决。[UL-origin-tag](terms/record-and-context.md#ul-origin-tag--来路标记--origin-tag) 的出处引用封存 PF-014 §5.6，该节标题含已移除的位置名。
- **处理**：产品负责人于 2026-10-19 裁定：消息持久化归会话，不归 Agent。所以消息落盘之前与之后的处理不是 Loop 拓展点，而是会话的[业务流程拓展点](terms/interaction-and-dispatch.md#ul-business-flow-extension-point--业务流程拓展点--business-flow-extension-point)。斜杠命令的展开、脱敏与否决挂在会话的业务流程拓展点上。omne-harness 的拓展点因此分两类：会话的业务流程拓展点与 Agent 的 Loop 拓展点，两类并列。
- **负责与闭合条件**：会话领域定义消息持久化前后的业务流程拓展点；slash-commands 产品页、领域流程与包架构改挂到这些拓展点；hooks 导入专题的 UserPromptSubmit 同样改挂。会话领域定义这些拓展点时一并写明：展开与脱敏改变的是尚未受理、尚未落定的输入，与业务流程拓展点“不改变已经落定的事实、不对会话日志留下持久化影响”的定义性质怎样相容。各页回改后闭合。
- **状态**：已裁定，待会话领域定义拓展点与各页回改。

### C-62：拓展与扩展

- **类型**：同义不同名。
- **两处输入**：词表写「拓展件」「拓展点」；已接受系统页与成员正文写「扩展」「扩展位置」。两者指同一个东西。
- **处理**：词表保留「拓展」，在 [UL-loop-extension-point](terms/agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point) 写明映射。「扩展」不列入弃用，因为已接受页正在使用，回改归各页拥有者。
- **状态**：映射已写明，两种写法并存。

### C-63：Runtime Context 的拉取时点

- **类型**：定义打架，外域。2026-10-17 核对 attempt 说法时发现。
- **来源**：[Runtime Context 产品页](../product/runtime-context/design.md#5-当前值与变化感知)与已接受[系统页](../../../docs/architecture/runtime/runtime-context.md)以 attempt 为拉取时点。用户决定 Agent 不要求、不解释 attempt。
- **处理**：[UL-runtime-context](terms/scope-and-resolution.md#ul-runtime-context--运行时-context--runtime-context) 不再另定时点，改指 Context 与 Agent 的现行正文。
- **负责与闭合条件**：Context 拥有者改写拉取时点的说法。
- **状态**：已闭合（2026-10-19）。依据是[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)。Context 一侧描述拉取时点的页面都已改为「执行开始或挂接建立」：已接受的 Runtime Context 系统页与领域页、运行时 context 规格的 [RC-04](../../../packages/context/runtime-context/SPEC.md#rc-04-读取时点变化与提醒)（标题改为「读取时点、变化与提醒」，旧锚点由兼容锚点保留）、该成员的关键流程 [RC-F01](../../../packages/context/runtime-context/docs/key-flows.md#rc-f01)、内部设计与开放问题、Context 组的关键流程，以及 [Runtime Context 产品页](../product/runtime-context/design.md) §5、RC-J01 与 CAP-RC04（产品页修订到 rev 2）。

### C-64：执行挂接的候选类型名

- **类型**：同义不同名，并有英文同名不同义。2026-10-17 核对执行挂接的英文名时发现。
- **来源**：Agent 契约的[公开接口页](../../../packages/agent/agent-contract/docs/public-api/README.md)当时用裸写的 `AttachmentId` 类型与 `attachment` 字段指执行挂接；[附件](terms/execution-and-outcome.md#ul-attachment--附件--attachment)的英文名是 Attachment，Tool 结果中的 attachments 也指文件附件，两者都流经 Agent。已接受[系统页 Agent runtime](../../../docs/architecture/runtime/agent-runtime.md#实例执行与执行挂接)与[领域页](../../../docs/domains/agent-progression/README.md)的中文当时写「挂载」。
- **差别**：同一个域里，一个英文词有两个所指，会直接传到类型与字段名上；中文「挂载」与「执行挂接」是同一个概念的两种说法。
- **处置**：[UL-execution-attachment](terms/agent-runtime-loop.md#ul-execution-attachment--执行挂接--execution-attachment) 的英文名定为 Execution Attachment，不许简称 attachment；「挂载」与「Agent Attachment」列入弃用。类型名改为 `ExecutionAttachment`、`ExecutionAttachmentId`，字段改为 `executionAttachment`。
- **负责与闭合条件**：Agent 契约的写者改类型名与字段名；已接受页的「挂载」随系统页修订交负责人接受后回改。两处都回改后闭合。
- **状态**：部分闭合（2026-10-19）。依据是[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)。词条已定名，Agent 契约已改用全称类型名与字段名。已接受页（系统页 Agent runtime 的节名「实例、执行与执行挂接」与正文、领域页）已回改，英文裸写的 attachment 也已改为 execution attachment。仍缺：共同系统页 `runtime-contract-model.md` 的旧写法，该页尚未进入集成轨道，随该页进入集成轨道时回改，之后闭合。

### C-65：压缩用排除名单还是保留名单

- **类型**：定义打架。2026-10-20 承接产品负责人的压缩语义时发现。
- **来源**：[压缩记录](terms/record-and-context.md#ul-compaction-record--压缩记录--compaction-record)与[上下文压缩](terms/record-and-context.md#ul-context-compaction--上下文压缩--context-compaction)当时按封存的 PF-009、PF-010 写成以块为单位的排除名单：压缩记录点名一批块，从此不再模型可读。PanQiWei 2026-10-20 定下的语义相反：压缩后模型只看到压缩记录指定保留的消息、压缩记录本身和它之后的消息。
- **差别**：排除名单以块为单位、列出被拿掉的部分，模型视图要逐块扣减；保留名单以消息为单位、列出留下的少数，在压缩时固定。两种读法给出的模型视图形状不同，下游的形状、校验和缓存都会照着其中一种建。
- **处置**：词表改用[保留名单](terms/record-and-context.md#ul-retained-set--保留名单--retained-set)与[压缩覆盖范围](terms/record-and-context.md#ul-compacted-range--压缩覆盖范围--compacted-range)，「排除名单」列入弃用。[运行感知与一次模型请求](../product/runtime-context/design.md#7-压缩保留历史与未完工作)已修订到 rev 3。消息形状与判定规则归 `packages/common/message`。
- **负责与闭合条件**：负责人 PanQiWei。Agent 契约成员、Agent 机制页、Model 契约 SPEC、数据与状态系统页、Agent 推进领域页与产品页模型调用的措辞已改为保留名单。仍写「排除名单」或「精确原块集合」的正式正文由各自拥有者回改：Request Context 成员（`packages/context/request-context/**`）、Session 契约 SPEC 的派生提交条款。全部回改后闭合。
- **状态**：已裁定，待外域回改。

### C-66：内容块的种类是否含推理续接状态

- **类型**：定义打架。2026-10-21 承接加密推理回放的设计时发现。
- **来源**：[内容块](terms/record-and-context.md#ul-content-block--内容块--content-block)把块的种类列为七类封闭清单：文本、思考、语音、图、文件、工具调用、工具结果。PanQiWei 2026-10-21 定下可见推理与加密推理分成两种块；[message 成员的推理续接状态](../../../packages/common/message/SPEC.md#推理续接状态)据此设计了只在 assistant 消息里出现的推理续接状态部件，装供应商交回的不透明推理状态。
- **差别**：按词表的七类读，加密推理没有位置，只能塞进「思考」，与产品负责人的分块裁定相反；按设计读，块多出第八类，词表的封闭清单不再成立。推理续接状态、回放范围、回放声明和外来可见推理四个说法目前只在成员规格里定义，没有产品正文出处。
- **处置**：PanQiWei 2026-10-21 接受任务卡 [#605](https://github.com/nemori-ai/omne-harness-lite/issues/605) 的设计，并要求在本卡内消解本项。[模型调用：推理状态的续接](../product/model-invocation/design.md#推理状态的续接)（rev 3）成为产品出处。内容块改为八类，新立[推理续接状态](terms/record-and-context.md#ul-reasoning-state--推理续接状态--reasoning-state)（内容块的变体）、[推理回放](terms/record-and-context.md#ul-reasoning-replay--推理回放--reasoning-replay)与[推理回放范围](terms/record-and-context.md#ul-reasoning-replay-scope--推理回放范围--reasoning-replay-scope)；首 token、模态、媒体类型三条随之改。英文 `Replay` 已是 Agent 接续时的[回放](terms/agent-runtime-loop.md#ul-replay--回放--replay)，所以新词都带「推理」限定，两条词条互相写明别混。回放声明与外来可见推理只在 Model 一个领域使用，不立词条，定义留在 [Model 契约的推理回放](../../../packages/model/model-contract/SPEC.md#推理回放)。
- **负责与闭合条件**：负责人 PanQiWei。产品出处、词条与内容块清单已一致。
- **状态**：已闭合（2026-10-21）。上列来源与差别保留发现时的写法，现行含义以词条为准。
