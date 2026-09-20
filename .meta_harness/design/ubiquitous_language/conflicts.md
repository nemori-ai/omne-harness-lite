# 对不上的地方

**定义概念时撞见的说法冲突，如实记在这里，不静默改掉。**

静默统一掉会让后来者以为这里从没出过问题——而那些地方**正是最该被复核的**。

## 三类冲突

| 类型 | 长什么样 | 谁来处置 |
|---|---|---|
| **同名不同义** | 两个 topic 都在说这个词，指的**不是**一个东西 | **必须裁决**：要么承认是两个概念各起各的名，要么统一 |
| **同义不同名** | 两三个说法指同一样东西 | 选一个进词条，其余进「弃用」；**正文回改由各 topic 的 owner 做** |
| **定义打架** | 两处对同一个词的定义**互相排斥** | **必须裁决**，PM 不替产品负责人挑一个 |

## 现有冲突

| # | 词 | 类型 | 差在哪 | 状态 |
|---|---|---|---|---|
| **C-1** | **「上下文」/ context** | **同名不同义** | [PF-001 §4](../product/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息)（rev 6）指**agent 感知到的「我处在什么情形下」**；[PF-010](../product/PF-010-context-management-and-assembly/README.md)（rev 2）整个 topic 说的是**喂给模型 / 给用户看的那一份**。**两者毫无关系。**再加上 **Cordis 的 `Context`**（依赖注入容器），同一个词有**四个所指** | **PM 已定用法，两个概念都不改名**——见下 |
| **C-2** | **「角色」/ role** | **同名不同义** | [PF-001 §4](../product/PF-001-identity-scope-and-agent-constraints/design.md#角色) 指**租户在组织内的治理角色**；而消息几乎必然有 `role`（user / assistant / system）。**两者的分辨已由[消息](terms/record-and-context.md#ul-message--消息--message)那一条兜住** | **已改名规避**：词条正式名为 [`Tenant Role` 租户角色](terms/subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role) |
| **C-3** | **「组合」/ composition** | **同名不同义** | [PF-002 §5.1](../product/PF-002-assets-settings-and-permissions/design.md#51-组合是一种关系不是几种) 指**资产之间的构成关系**；[PF-001 §6.2](../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义) 的「三种合成语义」英文同样落在 composition 上 | **已改名规避**：[`Asset Composition`](terms/capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition) 与 [`Scope Composition Semantics`](terms/scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics) |
| **C-4** | **「血缘」/ lineage** | **同名不同义** | [PF-003 §4](../product/PF-003-asset-transfer-and-sharing/design.md#血缘) 指**转移过来的那份与源的对应**；[registry](../registry/README.md) 里的 `lineage.json` 指**设计对象新旧身份的对应** | **已改名规避**：[`Transfer Lineage` 转移血缘](terms/circulation-and-entitlement.md#ul-transfer-lineage--转移血缘--transfer-lineage) |
| **C-5** | **「会话」/ Session · 「Run」** | ~~**缺定义**~~ | 两者被 PF-001 / PF-004 / PF-005 / PF-007 / PF-010 **五个 topic 反复引用，却没有一个拥有它们**——[PF-004 §4](../product/PF-004-agent-runtime-assembly-and-liveness/design.md#两个只引用不拥有的对象) 明写这两样**「只引用、不拥有」** | **✅ 已闭合（2026-09-18）**：产品负责人直接裁决，定义落 [UL-D-1](decisions.md#ul-d-1--会话与运行--2026-09-18) 与 [Agent 运行时闭环卷](terms/agent-runtime-loop.md)。**它们不归任何 topic，这是有意的**——它们是跨全链的治理概念 |
| **C-6** | **「会话」/ session** | **同名不同义** | [协作会话](terms/agent-runtime-loop.md#ul-session--会话--session)（归属边界）vs **`Shell().create_session` 开的[终端会话](terms/grounding-and-isolation.md#ul-terminal-session--终端会话--terminal-session)**（执行环境里的一条命令行）。**两者毫无关系** | **✅ 已处置**：产品负责人同意改名（[UL-D-1 裁决 5](decisions.md#定死了什么)）。**正文无须回改**——PF-005/PF-007 的叙述本来就一律写「终端会话」，**裸用一处也没有**；**命令名 `create_session` 不动**，那是接口不是术语 |
| **C-7** | **「收场」/ 「收束」** | **同名不同义** | [Run 的收束](terms/agent-runtime-loop.md#ul-run--运行--run)（一次逻辑执行请求的终结）vs [一次工具执行的收场有六种](terms/execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome)。**粒度差着好几层** | **✅ 已闭合（2026-09-19，PF-012 转正）**：工具那一层是 **`Execution Outcome` 执行收场**（六种）；Run 那一层是 **[`Run Terminal State` 运行终态](terms/agent-runtime-loop.md#ul-run-terminal-state--运行终态--run-terminal-state)**（三种）。**裸写「收场」只指工具这一层**；「收束」裸用时指**走到运行终态那个动作**，不是术语 |
| **C-8** | **「可用性」/ availability** | **同名不同义** | [当下可用性](terms/reach-and-availability.md#ul-current-availability--当下可用性--current-availability) 是**依赖解析算出来的事实**；而 availability 在别处普遍指服务可用性、系统可用性（SLA 那种） | **已改名规避**：正式名 **`Current Availability` 当下可用性**。**裸写「可用性」不作数** |
| **C-9** | **「帧」/ frame · 「卸载」/ offloading** | **同名不同义** | [执行帧](terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame) vs 视频帧 / 网络帧；[结果卸载](terms/execution-and-outcome.md#ul-result-offloading--结果卸载--result-offloading) vs 卸载插件 / 卸载软件 | **已改名规避**：`Execution Frame` 执行帧、`Result Offloading` 结果卸载 |
| **C-10** | **「等待态」** | **同名不同义**（**系统内部，两处都是自己的设计**） | [PF-006 §4 等待态](../product/PF-006-tools-and-skills/design.md#等待态) 挂在**一次工具执行**上，由**工具内部的业务逻辑**发起；[PF-008 §4 等待态的两个维度](../product/PF-008-human-in-the-loop/design.md#等待态的两个维度) 里那个 run 的等待态挂在**一个运行**上，由**系统**在拿到模型响应后算出来。**两者挂在不同的生命周期上** | **✅ 已改名规避**：[工具等待态 `Tool Wait State`](terms/execution-and-outcome.md#ul-tool-wait-state--工具等待态--tool-wait-state) 与 [运行等待态 `Run Wait State`](terms/interaction-and-dispatch.md#ul-run-wait-state--运行等待态--run-wait-state)。**PF-008 自己已经把这层分辨写清楚了，词表只是给两边各起了正式名**。**裸写「等待态」不作数** |
| **C-11** | **「事件」/ event** | **同名不同义** | **内核**的 `Events` 指类型化总线上的一条消息；**上游 harness** 用同一个词指**两套性质相反的东西**（落盘才算发生的 vs 进程内瞬态的）；**中文日常**指任何发生的事情——我们自己十份 `flows.md` 的「异常分支」章节和 [PF-009](../product/PF-009-context-message-types/design.md) 正文用的都是这个日常义 | **PM 已定用法：不收为术语**——见下 |
| **C-12** | **「异常」** | **同名不同义** | [PF-006 正文](../product/PF-006-tools-and-skills/design.md)五处用它指**程序抛出的那种**（「异常不带语义」）；而**十个 topic 的 `flows.md` 章节标题**用「异常分支」指**不正常的情况**，[模板里还立着「异常分支和正常路径一样重要」这条纪律](../product/.templates/topic/flows.md)。**同一句话里两个所指还会相反**——PF-006 那句「不用异常」挡的那四种非完成收场，**恰恰就是后一种意义上的异常** | **✅ 已处置**：不收为术语，正式词是[非常态](terms/execution-and-outcome.md#ul-off-nominal--非常态--off-nominal)（产品负责人 2026-09-19 裁决）——见下 |
| **C-13** | **「记录」/「会话日志」** | **同义不同名** | [PF-012 rev 1](../product/PF-012-agent-loop-and-run/changelog.md) 管那本账叫「**记录**」，而正式名是[会话日志](terms/record-and-context.md#ul-session-log--会话日志--session-log)。**「记录」还与[记录条目](terms/record-and-context.md#ul-record-entry--记录条目--record-entry)字面撞**——**一个是那本账，一个是账上的一行** | **✅ 已选正式名：会话日志**（2026-09-19，PF-012 rev 2）。那边正文已改，**全链锚点已修**（旧 `#记录` → `#会话日志`）。**PF-006 / PF-007 / PF-009 / PF-010 正文里仍有把它写作「记录」的链接文字与叙述，回改归各自 owner**——本轮只动锚点，不动别人的文字 |

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

**为什么不收。**判据就是[取名那一条](conventions.md#名字必须够具体不许占用通用词)——
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

1. **哪两处**——带链接与 rev，不写「某个 topic 里」；
2. **各自怎么说的**——**原文**，不要复述；
3. **差在哪**——说得出后果最好，说不出也要说清差别；
4. **这一条动不动得了**——PM 能定的自己定并写推理，定不了的**明确标成待裁决**，
   交回对应 topic 的 `decisions.md`，判据见 `product-design` skill 的「什么时候问，什么时候自己定」。

> **不要在这里裁决产品问题。**这里只负责**把冲突摆出来**，
> 裁决落回那个概念所属的 topic——**它的 owner 在那里，不在这里**。

返回[统一语言入口](README.md)。
