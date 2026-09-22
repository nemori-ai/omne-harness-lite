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

| # | 词 | 类型 | 差在哪 | 状态 |
|---|---|---|---|---|
| **C-1** | **「上下文」/ context** | **同名不同义** | [PF-001 §4](../product/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息)（rev 6）指**agent 感知到的「我处在什么情形下」**；[PF-010](../product/PF-010-context-management-and-assembly/README.md)（rev 2）整个 topic 说的是**喂给模型 / 给用户看的那一份**。**两者毫无关系。**再加上 **Cordis 的 `Context`**（依赖注入容器），同一个词有**四个所指** | **PM 已定用法，两个概念都不改名**——见下 |
| **C-2** | **「角色」/ role** | **同名不同义** | [PF-001 §4](../product/PF-001-identity-scope-and-agent-constraints/design.md#角色) 指**租户在组织内的治理角色**；而消息几乎必然有 `role`（user / assistant / system）。**两者的分辨已由[消息](terms/record-and-context.md#ul-message--消息--message)那一条兜住** | **已改名规避**：词条正式名为 [`Tenant Role` 租户角色](terms/subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role) |
| **C-3** | **「组合」/ composition** | **同名不同义** | [PF-002 §5.1](../product/PF-002-assets-settings-and-permissions/design.md#51-组合是一种关系不是几种) 指**资产之间的构成关系**；[PF-001 §6.2](../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义) 的「三种合成语义」英文同样落在 composition 上 | **已改名规避**：[`Asset Composition`](terms/capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition) 与 [`Scope Composition Semantics`](terms/scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics) |
| **C-4** | **「血缘」/ lineage** | **同名不同义** | [PF-003 §4](../product/PF-003-asset-transfer-and-sharing/design.md#复制血缘) 指**复制过来的那份与源的对应**；[registry](../registry/README.md) 里的 `lineage.json` 指**设计对象新旧身份的对应** | **已改名规避**：[`Copy Lineage` 复制血缘](terms/circulation-and-entitlement.md#ul-copy-lineage--复制血缘--copy-lineage)（2026-09-22 随「转移」改名「资产复制」，由 ~~`Transfer Lineage`~~ 改到现名） |
| **C-5** | **「会话」/ Session · 「Run」** | ~~**缺定义**~~ | 两者被 PF-001 / PF-004 / PF-005 / PF-007 / PF-010 **五个 topic 反复引用，却没有一个拥有它们**——[PF-004 §4](../product/PF-004-agent-definition-and-assembly/design.md#三个只引用不拥有的对象) 明写这两样**「只引用、不拥有」** | **✅ 已闭合（2026-09-18）**：产品负责人直接裁决，定义落 [UL-D-1](decisions.md#ul-d-1--会话与运行--2026-09-18) 与 [Agent 运行时闭环卷](terms/agent-runtime-loop.md)。**它们不归任何 topic，这是有意的**——它们是跨全链的治理概念 |
| **C-6** | **「会话」/ session** | **同名不同义** | [协作会话](terms/agent-runtime-loop.md#ul-session--会话--session)（归属边界）vs **`Shell().create_session` 开的[终端会话](terms/grounding-and-isolation.md#ul-terminal-session--终端会话--terminal-session)**（执行环境里的一条命令行）。**两者毫无关系** | **✅ 已处置**：产品负责人同意改名（[UL-D-1 裁决 5](decisions.md#定死了什么)）。**正文无须回改**——PF-005/PF-007 的叙述本来就一律写「终端会话」，**裸用一处也没有**；**命令名 `create_session` 不动**，那是接口不是术语 |
| **C-7** | **「收场」/ 「收束」** | **同名不同义** | [Run 的收束](terms/agent-runtime-loop.md#ul-run--运行--run)（一次逻辑执行请求的终结）vs [一次工具执行的收场有六种](terms/execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome)。**粒度差着好几层** | **✅ 已闭合（2026-09-19，PF-012 转正）**：工具那一层是 **`Execution Outcome` 执行收场**（六种）；Run 那一层是 **[`Run Terminal State` 运行终态](terms/agent-runtime-loop.md#ul-run-terminal-state--运行终态--run-terminal-state)**（三种）。**裸写「收场」只指工具这一层**；「收束」裸用时指**走到运行终态那个动作**，不是术语 |
| **C-8** | **「可用性」/ availability** | **同名不同义** | [当下可用性](terms/reach-and-availability.md#ul-current-availability--当下可用性--current-availability) 是**依赖解析算出来的事实**；而 availability 在别处普遍指服务可用性、系统可用性（SLA 那种） | **已改名规避**：正式名 **`Current Availability` 当下可用性**。**裸写「可用性」不作数** |
| **C-9** | **「帧」/ frame · 「卸载」/ offloading** | **同名不同义** | [执行帧](terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame) vs 视频帧 / 网络帧；[结果卸载](terms/execution-and-outcome.md#ul-result-offloading--结果卸载--result-offloading) vs 卸载插件 / 卸载软件 | **已改名规避**：`Execution Frame` 执行帧、`Result Offloading` 结果卸载 |
| **C-10** | **「等待态」** | **同名不同义**（**系统内部，两处都是自己的设计**） | [PF-006 §4 等待态](../product/PF-006-tools-and-skills/design.md#等待态) 挂在**一次工具执行**上，由**工具内部的业务逻辑**发起；[PF-008 §4 等待态的两个维度](../product/PF-008-human-in-the-loop/design.md#等待态的两个维度) 里那个 run 的等待态挂在**一个运行**上，由**系统**在拿到模型响应后算出来。**两者挂在不同的生命周期上** | **✅ 已改名规避**：[工具等待态 `Tool Wait State`](terms/execution-and-outcome.md#ul-tool-wait-state--工具等待态--tool-wait-state) 与 [运行等待态 `Run Wait State`](terms/interaction-and-dispatch.md#ul-run-wait-state--运行等待态--run-wait-state)。**PF-008 自己已经把这层分辨写清楚了，词表只是给两边各起了正式名**。**裸写「等待态」不作数** |
| **C-11** | **「事件」/ event** | **同名不同义** | **内核**的 `Events` 指类型化总线上的一条消息；**上游 harness** 用同一个词指**两套性质相反的东西**（落盘才算发生的 vs 进程内瞬态的）；**中文日常**指任何发生的事情——我们自己十份 `flows.md` 的「异常分支」章节和 [PF-009](../product/PF-009-context-message-types/design.md) 正文用的都是这个日常义 | **PM 已定用法：不收为术语**——见下 |
| **C-12** | **「异常」** | **同名不同义** | [PF-006 正文](../product/PF-006-tools-and-skills/design.md)五处用它指**程序抛出的那种**（「异常不带语义」）；而**十个 topic 的 `flows.md` 章节标题**用「异常分支」指**不正常的情况**，[模板里还立着「异常分支和正常路径一样重要」这条纪律](../product/.templates/topic/flows.md)。**同一句话里两个所指还会相反**——PF-006 那句「不用异常」挡的那四种非完成收场，**恰恰就是后一种意义上的异常** | **✅ 已处置**：不收为术语，正式词是[非常态](terms/execution-and-outcome.md#ul-off-nominal--非常态--off-nominal)（产品负责人 2026-09-19 裁决）——见下 |
| **C-13** | **「记录」/「会话日志」** | **同义不同名** | [PF-012 rev 1](../product/PF-012-agent-loop-and-run/changelog.md) 管那本账叫「**记录**」，而正式名是[会话日志](terms/record-and-context.md#ul-session-log--会话日志--session-log)。**「记录」还与[记录条目](terms/record-and-context.md#ul-record-entry--记录条目--record-entry)字面撞**——**一个是那本账，一个是账上的一行** | **✅ 已选正式名：会话日志**（2026-09-19，PF-012 rev 2）。那边正文已改，**全链锚点已修**（旧 `#记录` → `#会话日志`）。**PF-006 / PF-007 / PF-009 / PF-010 正文里仍有把它写作「记录」的链接文字与叙述，回改归各自 owner**——本轮只动锚点，不动别人的文字 |
| **C-14** | **「子 agent」/ subagent** | **同名不同义**（**系统内部，两处都是自己的设计**） | [UL-subagent](terms/interaction-and-dispatch.md#ul-subagent--子-agent--subagent) 指**它在派发关系里的角色**——被 `spawn`/`delegate` 派出去的那个，`handoff` 不算；而 [PF-004 的 agent 类型](../product/PF-004-agent-definition-and-assembly/design.md#agent-类型)本来打算把第二个取值也叫 `subagent`，那说的是 **Agent Definition 带着哪套机制**。**一个是此刻扮演什么，一个是这份定义属于哪一类** | **✅ 已改名规避（2026-09-21）**：产品负责人定第二个取值为 **`non-master`**——「**不具备一个 master agent 的全套机制的 agent**」。**两个词从此不撞**，[UL-agent-type](terms/capabilities-and-composition.md#ul-agent-type--agent-类型--agent-type) 与 UL-subagent 各自成立，互设「别混」 |
| **C-15** | **「使用权」/ Usage Right**（[UL-usage-right](terms/circulation-and-entitlement.md#ul-usage-right--使用权--usage-right)） | **形态未定** | [PF-001 §4](../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用)（rev 7）把它与拥有、选用并列为三个**事实**，没给身份与状态机；而[撤销不等于强制停止](terms/circulation-and-entitlement.md#ul-revocation-is-not-stop--撤销不等于强制停止--revocation-is-not-a-stop)说它会**暂停或到期**、[资产分享](terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)说它**关系解除后失效、不可传递**——那是一份有生命周期的授权。**差在「一份分享有没有自己的身份」**，[PF-003 §4 分享](../product/PF-003-asset-transfer-and-sharing/design.md#分享)（rev 1）通篇按动作写，没裁过。**同一个洞的另一面**：[PF-013 §5.10](../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)（rev 3）的「有使用权」落在**模型档案**上，而[模型档案不是资产](../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类)——论域是不是只限资产，同样没裁 | **✅ 已闭合（2026-09-22，产品负责人直接裁决）**：使用权是**对一份资产可用性的权利声明**——定义者直接有，被分享方从确认起有，直到自己移除、分享方撤销或隶属关系解除；**本版没有到期，没有暂停**。词条形态定为**属性**；PF-001 §6.6 的「暂停或到期」改为「撤销分享」；PF-013 的那一项并进「范围允许」，档案不是资产、不用这个词。落在 [PF-003 rev 2](../product/PF-003-asset-transfer-and-sharing/changelog.md#rev-2--2026-09-22) |
| **C-16** | **「替换件」/ Stand-in**（[UL-stand-in](terms/reach-and-availability.md#ul-stand-in--替换件--stand-in)） | **形态未定** | [PF-006 §4 替换件](../product/PF-006-tools-and-skills/design.md#替换件)（rev 10）既说它**被调用时会应答**、「是正常的返回，不是错误」（像一个有运行时实例的对象），又说它**同名、占同样的位置**（身份是借来的）；且它同时顶替工具与技能两类，写「变体」找不到单一父词条。正文未述它是否被系统单独标识 | **✅ 已闭合（2026-09-22，产品负责人直接裁决）**：替换件是**与原件同形的一种实例**——工具的名字与调用参数一致、技能的名字一致，**只有说明被换成「当前不可用及原因」**；它**必定以「不可用」收场**，正常返回带原因，不走报错。**它不是一个独立的东西**：身份仍是原条目的，名字与参数来自原条目，说明与应答来自依赖解析算出的原因，**丢了能原样重算**——**因此形态定为视图**，不给它建身份。**[形态取值表](conventions.md#形态这个词指的是哪一类东西)不增补「替身」这一类取值**——它压根不是「借用他者身份」，身份本来就是原条目的那一份。落在 [PF-006 rev 11](../product/PF-006-tools-and-skills/changelog.md#rev-11--2026-09-22) |
| **C-17** | **「持有」/ Asset Holding**（[UL-asset-holding](terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)） | **形态未定** · 定义打架 | [PF-002 §6.4](../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作)（rev 4）说[资产禁用](terms/circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)是**权限收窄为空集**——一条配值，持有上没有第二处状态；[flows §3.1](../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)（rev 4）却把它画成**持有上的一个状态**（持有·启用 ⇄ 持有·禁用）。前者下持有是一层关系，后者下它自带状态机；两者对「启用回来之后权限恢复成什么」「上一层禁用了、下一层能不能自己开回来」给出不同答案 | **✅ 已闭合（2026-09-22，[产品负责人直接裁决](../product/PF-002-assets-settings-and-permissions/decisions.md#2026-09-22--禁用是持有上的开关对-agent-与移除一样不可见)）**：**禁用就是持有关系上的那个开关**——持有带一个启用/禁用标记，配置原样保留，flows 的状态图成立，「权限收窄为空集」那套说法作废。**装配从「持有且未被禁用」的那一批开始，所以禁用对 agent 与移除一样不可见**；**禁用表按层，任一层禁用即不可见，下层开不回上层禁的**。词条形态由「未定」定为**属性**。落在 [PF-002 rev 5](../product/PF-002-assets-settings-and-permissions/changelog.md#rev-5--2026-09-22) |
| **C-18** | **「依赖声明」/ Dependency Declaration**（[UL-dependency-declaration](terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration)） | **定义打架**（同一份正文内） | [PF-006 §4 依赖](../product/PF-006-tools-and-skills/design.md#依赖)（rev 10）写「依赖项有**三类**」；[§5.3](../product/PF-006-tools-and-skills/design.md#六项可选声明) 说两端的**模态声明也是依赖声明的一种**——依赖的是这一次有效模型的能力，三类里一类都不是；[§6.4](../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析) 另有一项「附件放进哪个存储」。按「三类」实现，会漏掉模型能力与存储这两种对端，以及两端不对称的不可用后果 | **✅ 已闭合（2026-09-22，[产品负责人给的建模思路](../product/PF-006-tools-and-skills/decisions.md#一拍板记录)）**：依赖声明是**一串必需项的名字**，每一项**用抽象的名字**指一样可以在场也可以不在场的东西，**谁生效在那个名字上谁就满足它**；**种类不限**——其他工具、外部服务、设施、存储、有效模型的模态能力都只是例子，「三类」这个说法作废。**只有且，只有必需**：「或」被抽象名消掉，可有可无的东西用时探测、不进声明。**两端的模态都是声明里的必需项，差别在候选提供者不在规则**——调用端只有有效模型满足得了，结果端有效模型或转换件都行，「结果降级」只是这一项被转换件满足了。落在 [PF-006 rev 12](../product/PF-006-tools-and-skills/changelog.md#rev-12--2026-09-22) |
| **C-19** | **「执行尝试」/ Run Attempt**（[UL-run-attempt](terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)） | **形态未定** | [PF-012 §4 执行尝试](../product/PF-012-agent-loop-and-run/design.md#执行尝试)（rev 5）明说「**它不是第二个执行体**……同一个协程，站在治理那一侧叫『这次运行的第几次尝试』」；同一份正文又给了它**自己的起始仪式**（[§5.7 每一次尝试开始，都要做三件事](../product/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事)）、**可被追溯**（[§6.4](../product/PF-012-agent-loop-and-run/design.md#64-每一次尝试开始agent-都要知道)「人追溯得到是哪一次尝试造成的」）与**跨尝试的连续性规则**（[§6.5](../product/PF-012-agent-loop-and-run/design.md#65-新的尝试不重置循环阶梯)）。判「对象」，下游会建一张尝试表，而上游说执行体只有一个；判「视图」，§6.4 要的「是哪一次」只能靠日志里那条提醒间接还原，**而那条提醒里没有尝试标识**。外延也不等同：agent runtime 是协程本身，执行尝试是「这个 Run × 这一副协程」的配对，带序数 | **✅ 已闭合（2026-09-22，产品负责人直接裁决）**：执行尝试是**视图**——**身份是 (哪次运行, 第几次)，从日志里那条「尝试开始」记录派生，不另存一份**，因为它没有任何「只有它知道」的东西。**两种读法之所以打架，是因为那条提醒里没有序号**；[序号现在写进去了](../product/PF-012-agent-loop-and-run/design.md#64-每一次尝试开始agent-都要知道)，于是「追溯得到是哪一次」不再需要一个独立对象。落在 [PF-012 rev 6](../product/PF-012-agent-loop-and-run/changelog.md#rev-6--2026-09-22) |
| **C-20** | **「工具定义」/ Tool Definition**（[UL-tool-definition](terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition)） | **形态未定** | [PF-006 §5.2](../product/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同)（rev 10）的图把第一段标成「数据，长期」「**一类资产**」——工具定义就是「工具」这类资产本身；[PF-002 §4 Tool](../product/PF-002-assets-settings-and-permissions/design.md#tool)（rev 4）说工具「有两半，缺一不可：**调用定义**……与**适配当前环境的实现**」——定义只是资产的一半。**差在工具定义有没有独立于「工具」这类资产的身份** | **✅ 已闭合（2026-09-22，[产品负责人直接裁决](../product/PF-002-assets-settings-and-permissions/decisions.md#2026-09-22--身份与实现解耦工具定义可自带实现禁用按析取合成)）**：**工具定义是一个具体的工具实现在数据与治理层面的身份与表示**，**允许自带完整实现 package**——两种旧读法一起作废：它既不是「工具这类资产本身」，也不是「资产的一半」。**那份资产的身份是[类别 ＋ name](../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)，同一身份下平台、组织、租户各可有一份定义**，所以它**不需要独立于工具的身份**——**形态定为属性**。落在 [PF-006 rev 13](../product/PF-006-tools-and-skills/changelog.md#rev-13--2026-09-22) 与 [PF-002 rev 6](../product/PF-002-assets-settings-and-permissions/changelog.md#rev-6--2026-09-22) |
| **C-21** | **「执行帧」/ Execution Frame**（[UL-execution-frame](terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame)） | **形态未定** | [PF-006 §4 发帧](../product/PF-006-tools-and-skills/design.md#发帧)（rev 10）把它写成工具执行途中**发出去的东西**，形状由一份协议约定；[PF-009 §5.8](../product/PF-009-context-message-types/design.md#工具帧跟-toolmessage-是两条轨)（rev 2）说一次调用「可能很多条」、活得「可以更短」、有上限且被砍掉的部分必须看得出来——那是落成 `ToolInternalMessage` 之后的读法。**差在执行帧有没有独立于那类消息的身份与寿命**，连带它与[内容块](terms/record-and-context.md#ul-content-block--内容块--content-block)的边界 | **✅ 已闭合（2026-09-22，产品负责人直接裁决）**：**工具帧与模型响应流必须同形**——**一次工具执行对应一条 `ToolInternalMessage`**（内容是一串块），**执行帧就是这条消息的到达增量**，走 [§5.5 同一套到达语法](../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法)，**不是另一份协议、不是独立对象、也不是载荷**。**因此它没有独立于那条消息的身份与寿命**，形态由「未定」定为**过程**；日志里留的是收尾后那条完整的消息（封口后的块），中断时已交付的块照样留。**不加块的种类**——帧的载荷就是普通内容块。**「取代」挂在块上**：开块时说明这块是追加片段还是整体替换。落在 [PF-009 rev 3](../product/PF-009-context-message-types/changelog.md#rev-3--执行帧与模型响应流同形--2026-09-22) |
| **C-22** | **`spawn` 的「继承当前会话的上下文」** | **定义打架**（两份已接受的材料） | [PF-007 §6.8 五维表](../product/PF-007-meta-capabilities/design.md#派发有三种模式)（rev 14）写 `spawn` 的上下文「**继承当前会话的**」，§9.1 仍把「共享同一份会话日志」与「派发那一刻复制一份」并列为未决；而 [UL-D-4](decisions.md#ul-d-4--主会话与子会话--2026-09-21) 裁决 3 说「**子会话不继承父会话的任何历史内容**」、裁决 4 说会话日志之间「**存储上不共享节点**」。§9.1 的第一个选项已被裁决 4 关掉，却还摆在未决项里；裁决 3 与五维表那一格**字面相反**。「继承的是组装出来的那一份，不是日志本身」也许调和得了，**但没有任何一处正文这么说过** | **✅ 已闭合（2026-09-22，[产品负责人直接裁决](../product/PF-007-meta-capabilities/decisions.md#一拍板记录)）**：**`spawn` 交出去的是「派发那一刻组装出来给模型看的那份上下文」的一份副本**，它是**子会话日志里的起始输入记录**；**父的日志不被指向、不被拷贝**，**派发之后父这边发生的事子看不见**。「**共享同一份会话日志**」那一侧作废，**§9.1 随之从未决项删除**；原则是「不同的 session 在 **session log、投影、runtime context snapshot** 三处存储上都不共享」（[UL-D-4 裁决 3、4 已写准](decisions.md#ul-d-4--主会话与子会话--2026-09-21)）。落在 [PF-007 rev 15](../product/PF-007-meta-capabilities/changelog.md#rev-15--2026-09-22) |
| **C-23** | **「授权表达」/「决策记录」** | 同义不同名？**是不是同一个东西先没裁** | [PF-007 §4](../product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度)（rev 14）讲「一笔授权表达有三个维度」（这一次 / 本会话 / 全局），却没有一句「授权表达是……」；[§5.6 第③步](../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)与 [PF-015 §4](../product/PF-015-session-lifecycle-and-ownership/design.md#会话运行模式)（rev 5）顺手用「决策记录」，三处都没定义。**外延对不齐**：第③步拿来算的是「结构化的 ＋ 语义化的（全局 ＋ 本会话）」，「这一次」那一档不在里面 | **✅ 已闭合（2026-09-22，[产品负责人直接裁决](../product/PF-007-meta-capabilities/decisions.md#一拍板记录)）**：**一物两名**，正式名 **[授权表达](terms/interaction-and-dispatch.md#ul-authorization-expression--授权表达--authorization-expression)**（形态：对象），「决策记录」进它的「弃用」。**外延也对齐了**：第 ③ 步算的是**结构化的（含由全局授权表达落成的租户层权限值）＋ 本会话流水（本会话 ＋ 这一次）**——**「这一次」补进算式**，**「全局」那一档则落成租户层的权限设置值、不进会话流水**。落在 [PF-007 rev 15](../product/PF-007-meta-capabilities/changelog.md#rev-15--2026-09-22) 与 [PF-015 rev 6](../product/PF-015-session-lifecycle-and-ownership/changelog.md#rev-6--2026-09-22) |
| **C-24** | **「当前生效的执行环境」** | **定义打架**（同一份正文内） | PF-005 §6.1（rev 3）说「装配时注入一个」，读着是一次装配一个环境；[§6.5](../product/PF-005-execution-environments-and-sandboxes/design.md#65-一个会话一个租户可以同时有多组执行环境) 说一个会话、一个租户可以同时有多组，[§6.8](../product/PF-005-execution-environments-and-sandboxes/design.md#68-执行环境权限每个工具各配各的) 说粒度是每个工具各配各的。[UL-host-machine](terms/grounding-and-isolation.md#ul-host-machine--宿主机--host-machine) 那句「装配时必须明确注入一个执行环境」正压在这上面 | **✅ 已闭合（2026-09-22，[产品负责人直接裁决](../product/PF-005-execution-environments-and-sandboxes/decisions.md#一拍板记录)）**：**「装配时注入一个」那一侧作废。****宿主机始终在场**（只要[执行环境权限](terms/grounding-and-isolation.md#ul-execution-environment-permission--执行环境权限--execution-environment-permission)允许就可用，**不存在「宿主机不可用」**）；**[沙箱实现](terms/grounding-and-isolation.md#ul-sandbox-implementation--沙箱实现--sandbox-implementation)装配时可选装配**，全部遵循同一套契约与协议并声明设施与可绑定层级；**「当前生效的执行环境」是每扇门一个、每次执行算出来的**。**三个叫法一并裁了**：正式名是执行环境权限，「执行安全策略」＝把它配成 `never-allow`，「使用宿主机的资格」＝它不是 `never-allow`，两个叫法进词条「弃用」。[UL-host-machine 的注意已改](terms/grounding-and-isolation.md#ul-host-machine--宿主机--host-machine)。落在 [PF-005 rev 4](../product/PF-005-execution-environments-and-sandboxes/changelog.md#rev-4--2026-09-22) |

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
| [PF-006 正文](../product/PF-006-tools-and-skills/design.md)（五处） | **程序抛出的那种**（「异常不带语义」） |
| **十个 topic 的 `flows.md` 章节标题** | **不正常的情况**（「异常分支」），[模板里还立着一条纪律](../product/.templates/topic/flows.md)：「异常分支和正常路径一样重要」 |

**处置与 C-11 同一种，三处各归各位、谁都不用将就谁：**

| | 怎么办 |
|---|---|
| **十份 `flows.md`** | **一个字都不用改**——那本来就是日常义 |
| **PF-006 那五处** | **改成「报错」**。它们想说的是「不要只给一个『出事了』的信号」，而「不用异常」**只挡住了其中一种做法**——错误码、空返回、状态码同样违反那条产品约束。**回改归 PF-006 的 owner，且要升 rev** |
| **正式概念** | **[非常态](terms/execution-and-outcome.md#ul-off-nominal--非常态--off-nominal) · `Off-Nominal`**，归 [PF-011](../product/PF-011-off-nominal-handling/README.md) |

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
现有正文里的「事件」本来就是日常义，[PF-000 §6.7](../product/PF-000-occurrences-and-record-entries/design.md#67-事件在本系统不是术语) 已把这条写进产品规则。


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
