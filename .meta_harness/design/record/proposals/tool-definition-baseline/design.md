# 工具定义的数据契约，从哪里起步

## 需要作出的选择

**选择对象**：[工具定义](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition)数据契约的起点——
以三个参考源之一的现成形状为起点拓展，还是按产品正文自写 JSON Schema。

**它影响的可观察结果**：一个工具在平台、组织、租户各一份时谁替代谁；依赖不满足时 agent 看到的是同名替换件还是什么都没有；
多命令工具占几个槽位；工具能不能后台；MCP 对端的动作在 agent 面前是什么。这些结果都由产品正文定死，
**起点选错不会改变它们应当是什么，只会改变要推翻多少现成机制才能做到**。

### 必须保留的条款（一条不能丢）

| # | 条款 | 出处（带 rev） |
|---|---|---|
| K-1 | **身份＝类别＋name**；同类同名即替代，平台／组织／租户各一份；参数、说明、返回形状、子命令、实现都不参与身份判断 | [PF-002 rev 13 身份](../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)、[Tool](../../../product/PF-002-assets-settings-and-permissions/design.md#tool)；[UL-capability-identifier](../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier) |
| K-2 | **两种范式**：单函数（没有命令、全是参数）／多命令（先选命令再给参数，整套只占一个槽位）；多命令的定义里带多少由作者定，系统不折中 | [PF-006 rev 16 §5.3](../../../product/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样)、[带多少是作者的权衡](../../../product/PF-006-tools-and-skills/design.md#多命令工具的定义里带多少是工具作者的权衡)；[PF-007 rev 16 多命令范式](../../../product/PF-007-meta-capabilities/design.md#多命令范式) |
| K-3 | **六项可选声明**：外部服务、附件存储、执行环境、调用端模态、结果端模态、能否后台（＋自动转后台阈值）；前五项不声明＝不需要，后台不声明＝不许 | [六项可选声明](../../../product/PF-006-tools-and-skills/design.md#六项可选声明) |
| K-4 | **其中两项是设置项的形状＋默认值**：目标环境（落点与身份类，形状「绑定层 × 设施」）、转后台阈值（偏好类）；定义不装最终值，各层按持有配值、运行时求值 | [其中两项声明的是设置项](../../../product/PF-006-tools-and-skills/design.md#其中两项声明的是设置项)；[PF-002 §5.2 设置项分四类](../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)、[三方分工](../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值) |
| K-5 | **可自带实现，直到一份完整的实现 package**；装不进运行时的走同名替换件 | [PF-002 Tool](../../../product/PF-002-assets-settings-and-permissions/design.md#tool)；[PF-006 §6.3](../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装) |
| K-6 | **`help` 可选**：多命令工具可以带、不强制；带了必须与 `Tools().inspect` 一致 | [带多少是作者的权衡](../../../product/PF-006-tools-and-skills/design.md#多命令工具的定义里带多少是工具作者的权衡)；[PF-007 §6.1](../../../product/PF-007-meta-capabilities/design.md#61-tools通向任意非常驻工具) |
| K-7 | **帧不在定义里**，系统按收到的解析；等待态、卸载同样不在定义里 | [不在定义里的三样](../../../product/PF-006-tools-and-skills/design.md#不在定义里的三样)、[帧长什么样](../../../product/PF-006-tools-and-skills/design.md#帧长什么样由一份协议约定不由工具定义声明) |
| K-8 | **返回形状不在产品正文**：定义里带不带返回形状的描述归规格；产品只定 §5.4 两种写法、系统只见 `ToolResult` 一种 | [PF-006 非目标](../../../product/PF-006-tools-and-skills/design.md#非目标)、[§5.4](../../../product/PF-006-tools-and-skills/design.md#54-返回值两种写法一种模型) |
| K-9 | **SYS-KERNEL**：工具协议由本项目自定；选定复用的 DSH 组件以 fork 维护、可按本项目契约演化 | [SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel) |
| K-10 | **语言无关**：数据契约用 JSON Schema 可表达；不把 Cordis 运行时对象当数据契约 | [SYS-SPEC](../../../foundation/cross-system-constraints/requirements.md#sys-spec)；根 `AGENTS.md`「项目心智模型」 |
| K-11 | **MCP 对端动作要能映射成同一形状的工具条目**：每个动作一个条目、不是资产、随接入点持有与授权；run 前连不上照最近一次清单装替换件 | [PF-006 §6.13](../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)、[接入点连不上](../../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用)；[PF-002 MCP](../../../product/PF-002-assets-settings-and-permissions/design.md#mcp) |

### 可调的约束

下面几项产品正文明确留给规格，或只约束了语义没约束写法；**起点的选择不能替它们定值**，
但不同起点带进来的默认倾向不同，比较时要看见：

- 返回形状声不声明、声明成什么（K-8）——B 与 A 自带「必填」倾向，C 自带「不声明」倾向。
- 参数 JSON Schema 用哪个方言或子集——A 的设计说 draft 2020-12、实现调 DSH 子集，研究未追清（[未知与下一项证据](../../../../research/tool-definition-shape-sources/research.md#未知与下一项证据)）。
- name 的字符集与长度（[PF-006 非目标](../../../product/PF-006-tools-and-skills/design.md#非目标)只要求同类别内唯一）。
- 「自带实现」在数据里是内联包还是对受信制品的引用——产品只定「允许自带」，怎么装归系统实现。
- 六项声明落到 MCP 动作上怎么取（见[交接缺口](#交接缺口)）。

## 现有能力如何承载

规格区**没有**工具定义契约，也没有资产领域契约；本次调查覆盖 `spec/` 当前全部契约与三份研究。

| 要求/条款 | 现有能力与精确契约 | 如何组合、谁交接责任 | 未覆盖承诺、实现缺口或未确认前提 |
|---|---|---|---|
| K-1 身份与替代 | [`data.identity-values` v1](../../../spec/data/identity-values/v1/contract.md)（已接受）：[S-11 ScopeLayerIdentity](../../../spec/data/identity-values/v1/contract.md#s-11-scopelayeridentity)、[CS-1 资产持有的键与属性配值](../../../spec/data/identity-values/v1/contract.md#cs-1-资产持有的键与属性配值)、[S-34 语义身份与实现地址分开](../../../spec/data/identity-values/v1/contract.md#s-34-语义身份与实现地址分开) | **层归属挂在持有上，不进定义身份**：定义只带类别＋name，「哪一层的那一份」由持有键给出 | 资产持有契约尚未建立（identity-values 把「资产领域」列为具名第一消费者）；S-11 明写不表达资产归属那条层序 |
| K-4 设置项形状＋默认值 | CS-1 的属性配值（`持有 × 属性项 → 值`） | 定义声明项的形状、类别与默认值；各层配值落在持有上 | 设置项类别在数据里怎么标，无契约 |
| K-2、K-3、K-5～K-8 | 无 | — | 全部未覆盖 |
| K-11 MCP 条目 | 无契约；研究：[两源都把每个动作登记成独立条目](../../../../research/mcp-client-reuse/research.md#两源都把-mcp-的每个动作登记成一个独立的模型可见工具条目产品没有说死-mcp-的呈现方式)、[两源都没有同名替换件](../../../../research/mcp-client-reuse/research.md#两源都没有同名替换件dsh-在断连预算耗尽后把动作撤掉正是-pf-006-63-排除的不装) | 替换件要与原件同形，**只能靠最近一次列举结果的持久副本**——这要求条目形状是可存储的数据 | 两源都没有持久副本 |
| K-10 语言无关 | Cordis 内核不提供数据契约；[D-026](../../decisions/infrastructure-persistence-choices/decision.md) 定存储不提供 in-memory 实现 | 定义是长期持有的资产数据，经存储提供者持久化（推断：D-026 只点名存储与队列，这里把它用于「定义必须能入库」） | — |

**研究基线与本包基线的差**：研究对照的是 PF-006 rev 14 / PF-002 rev 10。rev 15、rev 16 改了两处与对照表直接相关的条款，
本包按新 rev 重读，**结果是本包的判断，不回写研究**：

| 对照表行 | rev 14 的说法 | rev 16 / rev 13 的说法 | 本包重读的结果 |
|---|---|---|---|
| [第 9 行](../../../../research/tool-definition-shape-sources/research.md#对照表pf-条款--三源) `help` | 不配 `help`，用法只走 `inspect` | **`help` 可选**，带了须与 `inspect` 一致（K-6） | omne-next 仍相反：`help` 由基类**自动注册**、外加默认开启的读帮助门，作者没得选；minimal-runtime 仍需改：`help` 是保留元命令、作者贡献里出现即拒，作者同样没得选；DSH 无多命令框架，作者可在命令枚举里自加，不冲突 |
| [第 24 行](../../../../research/tool-definition-shape-sources/research.md#对照表pf-条款--三源) MCP | 与多命令同形（占几个槽位未写） | **每个动作一个工具条目**，不常驻、随接入点持有与授权、run 前重算、连不上照最近清单装替换件（K-11） | DSH 的逐动作登记在「条目数」上已同向，差在身份（来源编进名字）、条目是运行时对象存不下、断连预算耗尽即撤（[mcp 研究](../../../../research/mcp-client-reuse/research.md#两源都没有同名替换件dsh-在断连预算耗尽后把动作撤掉正是-pf-006-63-排除的不装)）；omne-next、minimal-runtime 仍未覆盖 |

研究[张力表](../../../../research/tool-definition-shape-sources/research.md#对照中发现的产品正文张力只报告不改正文)的五行，到 rev 16 已闭合四行
（`help` 冲突、换模型后动作空间、两项设置的家、返回形状归规格）；第五行「六项声明怎么落到对端的动作上」仍未写，列入[交接缺口](#交接缺口)。

## 剩余责任与能力演化

| 剩余问题 | 关系 | 归属理由与消费者影响 |
|---|---|---|
| 工具定义数据契约本身 | **新增一份 data 契约**，不是新的能力维度 | 它是资产在数据与治理层面的表示（[UL-tool-definition](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition) 形态为「属性」），没有自己的生命周期服务；消费者是资产持有、装配、可用性计算、`Tools()`、工具执行运行时与 MCP 桥 |
| 模型可见面与治理声明分开 | 同一契约内的结构划分 | K-11 要求 MCP 动作「同一形状」却**不是资产、没有能力标识**；只有把「name＋说明＋参数」这一面与身份、持有、六项声明分开，两类条目才能共用前者 |
| 执行绑定（注册代际、实现制品绑定、停止能力、超时） | **不进定义**，归工具执行运行时 | 产品把定义（数据，长期）、条目（构成）、执行（计算资源，绑会话）分为三段（[PF-006 §5.2](../../../product/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同)）；超时、并发在 [PF-002 Tool](../../../product/PF-002-assets-settings-and-permissions/design.md#tool) 是**设置**，不是定义事实 |

**不提出新能力维度。**本题是一份数据契约的起点选择，不经过落点 #8。

## 取舍入口

四个候选、各自的改动清单与关键反例在 [alternatives.md](alternatives.md)。
作者推荐 D，理由与会改变推荐的证据写在[推荐与仍待区分的事项](alternatives.md#推荐与仍待区分的事项)。**推荐不是接受。**

## 契约、动作链与 Cordis 投影

- **本题只产出一份数据契约的起点**：JSON Schema 表达的纯数据，没有操作、没有状态迁移，不触发 TLA+；
  若契约里出现「多命令时命令表非空」「设置项必带类别与默认值」这类结构约束，Alloy 是否需要由规格起草者按性质判断。
- **Cordis 投影不在本题**。工具定义是数据，不是 Cordis 运行时对象（K-10）；把它投成可调用的东西（注册、呈现、执行管线）
  是工具执行运行时一题的事。**两题的交界**：
  - 运行时读定义的**模型可见面**生成呈现，读**六项声明**参与可用性计算，读**设置项的求值结果**决定落点与转后台；
  - 运行时自己的对象（注册代际、闭包、取消钩子）**不回写进定义**——
    [DSH jobs 契约携带进程内对象](../../../../research/tool-execution-runtime-sources/research.md#dsh-jobs-的记录只在进程内存里而且契约本身携带进程内对象不只是实现选了内存)那条研究正说明了混在一起的代价。
  - 因此**选 D 不排除运行时 fork DSH 执行管线**；代价是两者之间多一层从数据定义到 DSH `ToolDefinition` 的适配，
    这层适配的负担计在运行时一题。

## 证据义务与受阻消费

| 依赖的性质与前提 | 保护者/环境责任 | 所需证据与当前结果 | 闭合条件、负责产物及受影响选择 |
|---|---|---|---|
| 三源各行的承载判级 | 研究 | 静态阅读，**未运行测试**；minimal-runtime 不是证据、只作形状参考 | 已足以支撑「起点」的比较；逐字段借用时由规格起草者按研究里的行号复核 |
| rev 16 重读的两行（`help`、MCP） | 本包作者 | 只对照了产品正文与研究已记的源码事实，**未回源码重核** | 研究维护者按演进事件词复核；复核若推翻重读结论，本包推荐需重看 B、C 两格 |
| A 与 D 的实际差距有多大 | 本包作者 | **未做**：D 的字段清单尚未起草，无法与 A 的 `work-data` 逐字段比对 | 见[仍待区分的事项](alternatives.md#推荐与仍待区分的事项)第 1 条；不阻塞推荐，只决定「D 借 A 多少」 |

## 交接缺口

- **六项声明落到 MCP 动作上怎么取**：产品只写了「每个动作一个条目」，没写对端动作的模态、后台、执行环境怎么定。
  按「不声明＝不需要／不许」机械套用，会把对端能返回图像的动作算成「结果只有文本」。
  **归属待定**：先由契约起草者按对端列举结果能给出的信息试写，若得出的可观察行为与产品不符再回产品正文。
- **资产持有契约尚未建立**：K-1 的「层归属挂在持有上」依赖它；工具定义契约可以先起草，但持有键的引用要等它。
- **参数 JSON Schema 方言**：四个候选都要面对；与 OpenRouter 转给各模型供应商时接受的子集有关，本包未调查。
