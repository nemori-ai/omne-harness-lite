# PF-015 变更历史

本页记录**产品设计本身的演进**：每次实质变更改了什么、为什么改、谁受影响。
它与 [decisions.md](decisions.md) 不同——那边记「谁拍了什么板」，这边记「文档因此变成了什么样」。

## 当前修订

**rev 9**（2026-09-22）

## 历史

### rev 9 · 工作区在创建时显式指定，不指定就是空 — 2026-09-22

**承接 [PF-002 rev 10](../PF-002-assets-settings-and-permissions/changelog.md)：工作区是租户持有的一级归属、由目录承载、opt-in。
本 topic 接住会话这一侧。**

| 变更 | [§6.13](design.md#613-工作区在创建时显式指定不指定就是空) 新增：**创建会话时工作区是显式的、可以不给的输入**；不给就没有、系统不替它猜；给了必须归会话持有的那个租户，否则会话建不起来。[§5.6 第 10 项](design.md#56-十四项-meta-runtime-context)由「目录路径」改为「挂了哪一份，可以是空；由目录承载的给承载目录的路径」，表下读法补「可以是空」 |
|---|---|
| 依据 | 产品负责人 2026-09-22 原话（二）「工作区这一层是 opt-in 的，是会话创建时候需要显式指定的，如果没有指定就是空」，逐字在 [PF-002 decisions](../PF-002-assets-settings-and-permissions/decisions.md#2026-09-22--工作区是一级治理不是目录会话创建时-opt-in挂上就自动加载)；「必须归这个租户」是[跨租户默认拒绝](../PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)与 [§6.12](design.md#612-会话持有创建那一刻的租户身份) 的合取，推理在 [decisions 第二节](decisions.md#指向别的租户的工作区会话建不起来而不是那一级为空) |
| 为什么升 rev | 此前第 10 项写的是「目录路径」，读者会以为**每个会话都有一条路径、工作区就是那条路径**；现在它可以为空、且不是路径本身。**这是含义变化** |
| 下游要复核什么 | 会话创建面的输入：工作区那一项是**可选**的，缺省是「没有」而不是「当前目录」；第 10 项的消费者要接受空值 |

### rev 8 · 会话持有创建那一刻的租户身份 — 2026-09-22

**承接 [PF-001 rev 10](../PF-001-identity-scope-and-agent-constraints/changelog.md) 的一条新规则，
在会话这一侧接住它。本 rev 只加这一条，别的一个字没动。**

| 变更 | [§6.12](design.md#612-会话持有创建那一刻的租户身份) 新增：**会话在创建时捕获并持有[创建那一刻的那个租户身份](../PF-001-identity-scope-and-agent-constraints/design.md#当前租户身份)，此后一切以它计，不随这个账号切换到别的租户身份而变**；那个租户身份失效时的收场按本 topic 自己的规则——会话不会消失，能发生的只有归档 |
|---|---|
| 依据 | [PF-001 §4 当前租户身份](../PF-001-identity-scope-and-agent-constraints/design.md#当前租户身份)（rev 10），产品负责人 2026-09-22 直接裁决，原话在 [PF-001 decisions 第一节](../PF-001-identity-scope-and-agent-constraints/decisions.md#一拍板记录) |
| 为什么升 rev | 此前正文只说 [会话归租户](design.md#62-归档有两条来路人手动或到期自动)，**没说那个租户是什么时候定下来的**——按「读取时看账号当前站在哪里」实现也说得通，而那会让归属随切换漂移。**这是含义的增补，不是措辞** |
| 下游要复核什么 | 任何**在读取时求会话归属**的做法；[第 2、8、9 项 meta runtime context](design.md#56-十四项-meta-runtime-context) 的主体是**这个会话持有的那个租户**，不是「此刻登录的人当前站在哪里」 |

### 校准 · 2026-09-22（不升 rev）

**登记了三个此前没人接住的缺口，并把入口的覆盖陈述改到现状。没有改动任何已拍板的设计。**

| 变更 | [§9 未决项](design.md#九未决项)新增三行：[不属于任何 Run 的模型调用归会话那一级](../PF-012-agent-loop-and-run/design.md#run-是三样东西的归属单位)、[「尝试开始之前」那个位置](../PF-012-agent-loop-and-run/design.md#十一个位置是推出来的不是挑出来的)、[摘要累积到装不下时怎么办](../PF-012-agent-loop-and-run/design.md#压完还超这一层腾不出空间了)。[decisions 第四节](decisions.md#四已知的来源问题)同步一条 |
|---|---|
| 依据 | [PF-012 §9.1](../PF-012-agent-loop-and-run/design.md#91-会话归-pf-015) 把这三样压给本 topic，而本 topic 到 rev 7 既没覆盖也没把它们列进未决项 |
| 为什么不升 rev | **未决项清单不是设计内容**——登记的是「这里还缺一块」，**不是裁决**。三样仍未定，由本 topic 的 owner 裁 |
| 同日第二件 | [入口「本 rev 覆盖到哪」](README.md#本-rev-覆盖到哪)：大纲覆盖陈述由「四块半」改为「整块覆盖四块，权限那一块只覆盖与会话相交的部分」；权限那一行由「工具权限本身仍未开始」改为列出本 rev 实际覆盖的四处，并指明[放行三元组](../PF-007-meta-capabilities/design.md#611-ask通向人)里工具权限那条腿**仍是 §9 的未决项** |

### rev 7 · 2026-09-22

**全局那一档落成租户层的权限值，本 topic 那套「全局语义授权存储」退场。**
依据：[裁决 58](decisions.md#2026-09-22--全局那一档落成租户层的权限值)——产品负责人 2026-09-22 确认按
[PF-007 rev 15](../PF-007-meta-capabilities/changelog.md) 已落下的那一种。

| 变更 | [§5.6](design.md#56-十四项-meta-runtime-context) 原第 9 项「这个租户的语义授权（全局当前生效中的）」**整条删除**；第 8 条那一栏补明**由全局授权表达落成的租户层权限值就在这一份里**；表下读法换掉两条（「全局那一档不另占一块」取代原来的「第 9 与第 10 会有重叠」）。[§5.7](design.md#57-三个作用域在同一份数据里) 改为一张落点表：**单次执行与本会话落在会话那份流水，全局落成租户层的权限设置值** |
|---|---|
| 含义 | **系统里的授权流水只有一种：每个会话一份。**此前本 topic 写的「全局有一个存储维护它，各会话的拓展点往里上报」**不成立**——照那样做会有两份全局授权，**而「以为撤了其实没撤」正是这样来的** |
| 编号顺延 | **原第 10–15 项依次变成第 9–14 项**，§5.6 的标题相应从「十五项」改为「十四项」。**[decisions 第一节](decisions.md#一拍板记录)里按旧编号写下的裁决（44、45）指的是顺延前那一版**；裁决 45 的前提（第 9 与第 10 重叠）已随这次改动消失 |
| 同版第二件 | [§6.8](design.md#68-变更了要不要告诉-agent看谁消费它) 补上**推与拉两条路**：推归生产者、**会话空闲时推来的一律丢弃**；拉归 agent runtime，**每次执行尝试起来时取一次当前快照**。依据是[产品负责人 2026-09-22 关于推与拉的裁决](../PF-014-inbound-intake-and-queueing/decisions.md#2026-09-22--runtime-context-的变更推与拉按-run-开没开闭合分)，规则本身落在 [PF-014 rev 3](../PF-014-inbound-intake-and-queueing/changelog.md) 与 [PF-012 rev 7](../PF-012-agent-loop-and-run/changelog.md)，**本 topic 只在 runtime context 这一侧指路**；[§6.8 原来那条「谁消费才通知」一个字没改](design.md#68-变更了要不要告诉-agent看谁消费它) |
| 下游要复核 | 按「全局语义授权集」建模的人——**那个东西不存在**，[领域对象那边的同名待裁已删除](../../domain_objects/pending.md)；引用第 10 项及以后编号的人按顺延后的号读（词条 [UL-session-log-projection](../../ubiquitous_language/terms/record-and-context.md#ul-session-log-projection--会话日志投影--session-log-projection) 与 [UL-meta-runtime-context](../../ubiquitous_language/terms/scope-and-resolution.md#ul-meta-runtime-context--元-runtime-context--meta-runtime-context) 已同步） |

### rev 6 · 2026-09-22

**「决策记录」这个说法退役，正式名是[授权表达](../PF-007-meta-capabilities/design.md#一笔授权表达有三个维度)。**
依据：产品负责人 2026-09-22 裁决「授权表达」与「决策记录」是**一物两名**
（[C-23](../../ubiquitous_language/conflicts.md)；「决策记录」撞[记录条目](../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry)，过不了取名那一关）。

| 变更 | [§4 会话运行模式](design.md#会话运行模式)两处：`auto_permission` 那一档「**拿已经形成的决策记录算**」与「**答案落成新的决策记录**」，一律改用**授权表达**；定义处链到 PF-007 §4 |
|---|---|
| 含义 | **一个字没变**——同一个东西此前在三处各叫各的，现在只有一个名字 |
| 下游要复核 | 按「决策记录」这个说法建模的人；词条 [UL-session-run-mode](../../ubiquitous_language/terms/agent-runtime-loop.md#ul-session-run-mode--会话运行模式--session-run-mode) 已同步 |
| 顺带记下 | [§5.6 第 9 项与 §5.7](design.md#57-三个作用域在同一份数据里) 讲的「全局那一档」与 [PF-007 rev 15 定的落点](../PF-007-meta-capabilities/design.md#一笔授权表达有三个维度)**对不上**，已记入 [decisions 第四节](decisions.md#四已知的来源问题)，**本 rev 不改那两节** |

### 校准 · 2026-09-21（不升 rev）

**一次正文校准，没有改动任何已拍板的设计**——改的是几处与已接受内容对不上的旧说法。

| 改了哪里 | 改成什么 | 依据 |
|---|---|---|
| [§2 非目标](design.md#非目标)里「不定义上下文感知域本身」那条 | **删掉。**本 rev 定义的就是它：[目标那一条](design.md#目标)与 [README 的大纲表](README.md#本-rev-覆盖到哪)都写着接下了整块 | [裁决 47](decisions.md#2026-09-21--runtime-context-与十五项-meta-runtime-context)：**广义上它就是 runtime context，不新造词**，「会话上下文感知域」已登记为弃用说法（[词条](../../ubiquitous_language/terms/scope-and-resolution.md#ul-runtime-context--运行时-context--runtime-context)） |
| README 大纲表里那一行的名字 | **runtime context**——正文与目录统一用这个词 | 同上 |
| [§1 背景](design.md#一背景与问题)转述的「一个会话里给出的授权，那段协作结束就不再作数」 | **换成两条今天仍然成立的规则**（agent 间通信要看对方还在不在、悬着的问询什么时候清掉）。**授权那条已经作废**——[授权是数据，归档不丢](design.md#67-归档不动授权)，[PF-007 那边也已改成「归档不会让它消失」](../PF-007-meta-capabilities/design.md#会话授权上下文) | [裁决 15](decisions.md#2026-09-21--生命周期会话类型与业务流程拓展点) 与 [PM 推导「归档与授权失效必须分开陈述」](decisions.md#归档与授权失效必须分开陈述) |
| [§5.6](design.md#56-十四项-meta-runtime-context) 第 9、10 项写「**用户**的语义授权」 | **这个租户的语义授权**，并补一条读法：**主体是租户，不是自然人那个账号** | [裁决 24](decisions.md#2026-09-21--授权的来源撤回与作用域) 的原话——全局授权指「**租户下未来所有会话**」；身份双层结构归 [PF-001](../PF-001-identity-scope-and-agent-constraints/design.md#租户) |
| §5.6 那份读法清单写「四件事」，其实列了五条 | **六件**——补上第 9、10 条主体那一条之后的实数 | 计数错，含义未变 |
| `design.md` 缺抬头的修订行；[§4 meta runtime context](design.md#meta-runtime-context) 里「会话运行模式」错链到 §9 | **补上 rev 抬头**（与 README front-matter、本页一致）；**链接指回[会话运行模式](design.md#会话运行模式)** | 格式与错链，含义未变 |

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
| 变更 | **本 topic 接下 runtime context 这一整块。**新增两个概念（[runtime context](design.md#runtime-context) · [meta runtime context](design.md#meta-runtime-context)）、[唯一判据与两个反例](design.md#55-哪些算-meta-runtime-context)、[十五项清单](design.md#56-十四项-meta-runtime-context)、[三个作用域同在一份数据里](design.md#57-三个作用域在同一份数据里)；产品规则加三条（[§6.8 变更通知按谁消费发](design.md#68-变更了要不要告诉-agent看谁消费它) · [§6.9 模型看见它的两种形态](design.md#69-模型看见一块-runtime-context只有两种形态) · [§6.10 单次授权在运行结束时清空](design.md#610-单次授权在一次运行结束时清空)）；取舍加三条；§1 补第四个空洞；§8、§9 更新 |
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
