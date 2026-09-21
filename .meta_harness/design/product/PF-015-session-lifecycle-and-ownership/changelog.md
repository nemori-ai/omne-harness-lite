# PF-015 变更历史

本页记录**产品设计本身的演进**：每次实质变更改了什么、为什么改、谁受影响。
它与 [decisions.md](decisions.md) 不同——那边记「谁拍了什么板」，这边记「文档因此变成了什么样」。

## 当前修订

**rev 5**（2026-09-21）

## 历史

### rev 5 · 2026-09-21

**接下大纲第二块：存储。**依据：[产品负责人裁决 54–57](decisions.md#2026-09-21--存储只给两条需求其余归技术设计)。

| 变更 | 新增 [§5.8 存储要守住的两件事](design.md#58-存储要守住的两件事)、[§6.11 会话睡醒之后还是原来那个](design.md#611-会话睡醒之后还是原来那个)，以及[为什么对存储只提两条](design.md#为什么对存储只提两条)这条取舍 |
|---|---|
| 第一件 | **会话睡一觉醒来还得是原来那个。**三样各有守法：会话日志**只增不改**（[PF-012 早已定死](../PF-012-agent-loop-and-run/design.md#会话日志)，本 topic 要求存储**真的兑现它**）、runtime context **除实时算的每块都要能恢复**（**新的**）、投影**重算必得同一答案**。**判据是两个动作**：会话重新加载、撤销归档 |
| 同上，还有一层 | **「怎么从日志算出一个投影」要是一套协议**，不是为模态投影单写的那一段。判据：**加第二第三个投影时，已有的不用改** |
| 第二件 | **今天是单机，但别把单机焊进语义**——[SYS-DEPLOY](../../foundation/cross-system-constraints/requirements.md) 在存储上的落点。产品侧只认一条：**存储在产品语义上是什么，不取决于它实际存在哪里** |
| 统一语言 | **新增 [UL-session-log-projection](../../ubiquitous_language/terms/record-and-context.md#ul-session-log-projection--会话日志投影--session-log-projection)**。[PF-013 早就在用「投影」这个说法](../PF-013-model-profiles-and-invocation/design.md#模态投影)却没有正式词条，谈协议之前得先立起来。同时给 [UL-runtime-context](../../ubiquitous_language/terms/scope-and-resolution.md#ul-runtime-context--运行时-context--runtime-context) 补上「除实时算的都要能恢复」这条性质 |
| 未决项 | **收窄一条。**原来那条「会话内的数据存储与持久化」**范围过宽**——日志存在哪、什么时候算落定**属于技术设计**，产品侧给完两条要求就到边了。现在只剩[真正的产品缺口：卸载掉的工具原件保留多久](design.md#九未决项) |
| 下游要复核 | **技术设计侧**：存储契约要同时兑现这两件事。**[PF-013](../PF-013-model-profiles-and-invocation/README.md)**：模态投影现在有了类名，它是[会话日志投影](../../ubiquitous_language/terms/record-and-context.md#ul-session-log-projection--会话日志投影--session-log-projection)的第一个实例——**语义没变，措辞可对齐** |

### rev 4 · 2026-09-21

| 项 | 内容 |
|---|---|
| 变更 | 新增[§4 会话运行模式](design.md#会话运行模式)——**恰三档**（`never` / **`auto_permission`** / `bypass-permissions`）及各自在「本该问人」那一刻的处置；**§9 少一条缺口**（本 topic 认领的那个概念定了）；§2 目标与非目标同步 |
| 原因 | 产品负责人裁决 48–50、53（[原话](decisions.md#2026-09-21--会话运行模式定三档)），依据指定为[四家横向调研](../../../research/agent-harness-session-design/research.md)。**中途改过一次名**：那一档原定叫 `auto`，与执行环境权限那一维撞名，**两个一起改**——本维 `auto_permission`、那一维 `auto_place` |
| 依据 | [decisions §一](decisions.md#2026-09-21--会话运行模式定三档) |
| 影响 | **[PF-007](../PF-007-meta-capabilities/README.md) 同步升 rev 13**：放行判断的完整四步落在那边，**模式是第 ④ 步**。新增词条 [`UL-session-run-mode`](../../ubiquitous_language/terms/agent-runtime-loop.md#ul-session-run-mode--会话运行模式--session-run-mode) |
| 兼容性 | **[PF-007 §8](../PF-007-meta-capabilities/design.md#八边界与依赖) 与 [PF-008 §8](../PF-008-human-in-the-loop/design.md#八边界与依赖) 那两处「依赖它、不定义它」现在有正文可指了**，两边的表述不必改 |

### rev 3 · 2026-09-21

| 项 | 内容 |
|---|---|
| 变更 | **本 topic 接下 runtime context 这一整块。**新增两个概念（[runtime context](design.md#runtime-context) · [meta runtime context](design.md#meta-runtime-context)）、[唯一判据与两个反例](design.md#55-哪些算-meta-runtime-context)、[十五项清单](design.md#56-十五项-meta-runtime-context)、[三个作用域同在一份数据里](design.md#57-三个作用域在同一份数据里)；产品规则加三条（[§6.8 变更通知按谁消费发](design.md#68-变更了要不要告诉-agent看谁消费它) · [§6.9 模型看见它的两种形态](design.md#69-模型看见一块-runtime-context只有两种形态) · [§6.10 单次授权在运行结束时清空](design.md#610-单次授权在一次运行结束时清空)）；取舍加三条；§1 补第四个空洞；§8、§9 更新 |
| 原因 | 产品负责人四段裁决（[裁决 32–47](decisions.md#2026-09-21--runtime-context-与十五项-meta-runtime-context)）。**此前这块东西散在三处**——PF-001 的 Context、PF-012 的当下条件、PF-002 的权限求值，**没有一处回答「一个会话最少得带着哪些」** |
| 依据 | [decisions §一](decisions.md#2026-09-21--runtime-context-与十五项-meta-runtime-context) 的 16 条裁决；四格 † 推导与两个被纠正的归纳见[§二](decisions.md#二pm-推导) |
| 影响 | **[PF-010](../PF-010-context-management-and-assembly/README.md) 收到一条硬要求**：[压缩之后必须重新给模型一份完整的](design.md#69-模型看见一块-runtime-context只有两种形态)，**不能只当消息处理**。<br>**[PF-012](../PF-012-agent-loop-and-run/README.md) 收到一个新的 loop 拓展点用途**：运行结束时清空单次授权。<br>**[统一语言](../../ubiquitous_language/index.md)**：`UL-runtime-context` 扩写，新增 `UL-meta-runtime-context` |
| 兼容性 | **没有推翻任何既有结论。**[PF-007 的会话授权上下文照旧](../PF-007-meta-capabilities/design.md#会话授权上下文)——那份表单里有一个按序排列的字段，往里加一项就是一次就地更新，**两种说法本来就不冲突** |

### rev 2 · 2026-09-21

| 项 | 内容 |
|---|---|
| 变更 | **[§6.2 整节重写](design.md#62-归档有两条来路人手动或到期自动)**——归档有两条来路：**租户手动**，或**系统按出厂配置的时限自动归（默认 30 天）**，**两者后果完全一样**。**[§6.6 增一条并新开一小节](design.md#66-跑题只提醒不阻拦)**——跑题提醒**可以关掉**；判定**是二分的，没有第三档**。§3 增一行场景、§2 目标补「由谁发起」。**§9 闭合两条缺口，新开一条** |
| 原因 | 产品负责人一次答完三条待裁决（[原话与裁决 26–31](decisions.md#2026-09-21--三条待裁决一次答完)）。**rev 1 的「归档不会自己发生，没有多久不用就自动归档这回事」被推翻** |
| 依据 | [decisions §一](decisions.md#2026-09-21--三条待裁决一次答完)；两条新增 PM 推导见[§二](decisions.md#二pm-推导) |
| 影响 | **[PF-007 同步升 rev 12](../PF-007-meta-capabilities/changelog.md)**：裁决 26、27 落在那边的 §6.11 性质五，**D-2 闭合**。[UL-session-archival 词条](../../ubiquitous_language/terms/agent-runtime-loop.md#ul-session-archival--会话归档--session-archival)补两条注意 |
| 兼容性 | 本 topic 尚无技术投影。**照 rev 1 读过 §6.2 的人必须复核**——那一节的结论整个反了 |

### rev 1 · 2026-09-21

| 项 | 内容 |
|---|---|
| 变更 | **首版开题。**定义[会话生命周期四态](design.md#会话的生命周期)、[会话归档](design.md#会话归档)（含三项不可逆副作用与可撤销语义）、[会话类型](design.md#会话类型)、[业务流程拓展点](design.md#业务流程拓展点)；给出[状态机](design.md#51-四个状态怎么走)、[归档在会话树上的传导](design.md#52-会话与会话之间)、[会话类型的求值](design.md#53-会话类型怎么算出来)与[授权和生命周期的交界](design.md#54-会话内的授权与生命周期的交界)；七条产品规则、五条取舍 |
| 原因 | 产品负责人 2026-09-21 就生命周期、会话类型、业务流程拓展点与授权模型连续给出四段裁决（[decisions §一](decisions.md#一拍板记录)）。此前**两条已接受的产品规则正吊在「会话结束」这个不存在的事实上**，本 rev 把锚点定为归档 |
| 依据 | [decisions.md §一](decisions.md#一拍板记录)的 25 条裁决，以及[会话间关系的 UL-D-4](../../ubiquitous_language/decisions.md#ul-d-4--主会话与子会话--2026-09-21) |
| 影响 | **[PF-007](../PF-007-meta-capabilities/README.md) 同步升 rev 11**：会话授权上下文从「结论集合」改为「按序累积的表达」，「随会话结束一起消失」作废，**「自由作答里的一句话永远不作数」被推翻**。<br>**[统一语言](../../ubiquitous_language/index.md)新增三条词条**、改写 `UL-session` 注意 ③ 与 `UL-session-authorization-context`。<br>**[产品区索引](../README.md)与[架构内核清单](../architecture-core.md)**把 PF-015 从「仅编号」改为已开题 |
| 兼容性 | 本 topic 是新开的，**没有既有技术投影**。但它定下的「归档」语义会改变 PF-007 消费者的理解，**那一侧按 PF-007 rev 11 复核** |

## 本 rev 刻意没做的

**这不是遗漏，是范围。**产品负责人给定的讨论大纲有五块，本 rev 覆盖两块半，
**未覆盖的部分在 [§9 未决项](design.md#九未决项)逐条列着**——
其中[会话运行模式](design.md#九未决项)的家确认在本 topic，只是还没轮到。

## 什么算一次修订

| 算 | 不算 |
|---|---|
| 概念定义变了 | 错别字、链接修复、排版 |
| 模型中的关系变了 | 补充说明但不改变含义 |
| 产品规则增删改 | 把已有内容换个位置 |
| 目标或非目标变了 | — |
| 未决项被裁决 | 未决项被重新表述但仍未决 |

**改变含义就要记，且要改修订号。**读者据修订号判断自己手上的理解是否还成立。
