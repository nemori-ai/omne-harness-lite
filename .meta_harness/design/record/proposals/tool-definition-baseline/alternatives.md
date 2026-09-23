# 候选与取舍

## 选择对象与必要约束

选择对象与十一条必须保留的条款（K-1～K-11）见 [design.md](design.md#需要作出的选择)；
可调的只有那里列出的五项（返回形状、参数方言、name 写法、自带实现的数据形式、MCP 动作的声明取法）。

判级沿用研究的四档（可直接承载／需改／不可承载／未覆盖），出处是
[研究对照表](../../../../research/tool-definition-shape-sources/research.md#对照表pf-条款--三源)的行号；
`help` 与 MCP 两行按 rev 16 重读，见 [design.md](design.md#现有能力如何承载)。

| 可识别候选及范围 | 如何兑现必要性质 | 差异、总负担及关键反例 | 当前证据与缺口 |
|---|---|---|---|
| **A 拓展 minimal-runtime `packages/tools/tools` 的数据契约**（`feat/minimal-runtime@d79484d`：`work-data` 的 `ToolDefinition`＋`Command`，`host.ts` 的 `ToolContribution`） | 已是**数据**、能序列化（K-10）；命令表＋一个 manifest alias 直接承载多命令占一个槽位（K-2）；`media.inputs/outputs` 两端模态、`environmentCapabilities` 设施名单、`background` 声明位、`implementationArtifact` 引用都已有字段（K-3、K-5）。要兑现 K-1 须把身份从 `ownerTenantId＋definitionId＋version` 改成类别＋name；兑现 K-6、K-7 须去掉 `help` 保留字与 `frames[]` | **复用**：字段词汇与两端模态、设施的结构。**要改**：身份整套换键——manifest、`generation`、`stale_binding` 都键在旧身份上，改的是契约的主键不是一个字段；单函数被迫套一层命令；每命令 `outputSchema` 必填（K-8 倾向）；`oneOf` 超预算由系统回落 `compact`（与 K-2「系统不折中」相反）；`requiredSkills` 指具体版本而非能力标识；超时、并发写在定义里（产品里是设置）；外部服务、附件存储、执行环境的绑定层都要新增。**维护**：分支不在 main，引用的是已退役谱系的候选契约，同一分支内契约与实现已分叉。**关键反例**：[身份键与产品方向相反](../../../../research/tool-definition-shape-sources/research.md#三源的身份键都不是类别name其中-minimal-runtime-与之方向相反)——所有者租户在身份里，「组织新建同类同名即替代 official」表达不出 | 对照表第 1、2 行不可承载，第 9、21 行需推翻（`help` 保留、帧声明）；[模态与执行环境最接近但实现切片不收](../../../../research/tool-definition-shape-sources/research.md#两端模态与执行环境minimal-runtime-的数据契约最接近但它自己的实现切片不收)。**minimal-runtime 不是证据**；参数实际走 Ajv 还是 DSH 子集未追清 |
| **B fork DSH `core/tools` 的定义形状**（DSH `c291e796`，`dsh-tools@0.1.5-rc.2`） | 模型只见 `{name, description, parameters}` 三字段——**这条划分正是 K-11 需要的**：MCP 动作与本地工具共用这一面；参数是 JSON Schema；TS、MIT；fork 符合 K-9 的维护边界。要兑现 K-1～K-7 须在定义外加一层治理字段（类别、六项声明、设置形状与默认值）与多命令抽象，并把定义里的函数剥出去才能成为数据（K-10） | **复用**：三字段呈现面、参数校验经验、MCP 名字非法时的哈希后缀做法；执行管线最完整（但那是运行时一题的收益）。**要改**：无类别命名空间、同层重名抛错（K-1）；无多命令框架（K-2）；缺依赖默认「不注册」（与 K-5 替换件相反）；后台是调用参数＋插件配置、默认开（与 K-3「不声明＝不许」相反，见[运行时研究](../../../../research/tool-execution-runtime-sources/research.md#dsh-的后台开关默认开启与-pf-006不声明就不能后台方向相反)）；`output` 必填（K-8 倾向）。**维护**：peer 依赖九个 DSH 包；vendored Cordis 4.0.2 而 [D-025](../../decisions/cordis-adoption-version/decision.md) 采 4.0.4；fork 改动落在注册表的核心语义上，[上游每次改 `ToolDefinition` 都要人工合并](../../../../research/mcp-client-reuse/research.md#整包直接复用-dsh-mcp-client-会连带六个-dsh-包与-dsh-的工具契约而工具协议按-sys-kernel-归本项目自定)。**关键反例**：[定义是进程内运行时对象](../../../../research/tool-definition-shape-sources/research.md#dsh-的工具定义是进程内运行时对象模型只看得到三个字段)——`execute`、`render` 是函数，存不进存储，也就给不出 MCP 替换件要的「最近一次清单」持久副本；[不呈现即不可调用](../../../../research/tool-definition-shape-sources/research.md#dsh-把不呈现与不可调用绑在一起) | 对照表第 3、4、6、20、21 行可直接承载，其余多为需改或未覆盖；[外部服务与附件存储三源都没有定义级声明](../../../../research/tool-definition-shape-sources/research.md#三源的工具定义都没有外部服务与附件存储两项定义级声明)。DSH 其余工具包是否另有定义级声明只读了 `tool-fs` 与 `mcp-client` |
| **C 移植 omne-next `omne_core_v1/agentic/tool` 的形状**（`6263fed`，Python／Pydantic → JSON Schema） | 多命令框架现成、`dispatch_mode` 让作者在 `flat`／`typed_union` 间选（K-2 直接承载）；`ToolDetachability` 四级、未声明读作 `never`、`AUTO` 带阈值（K-3 后台项直接承载）；`content`／`content_and_artifact` 与 §5.4 两种写法同构 | **复用**：声明词汇与本项目产品方向最贴近。**要改**：toolset 把来源前缀写进名字、合并标识退到 `class_name`（K-1）；类级 `progress_profile`、未声明即丢帧（[与 K-7 相反](../../../../research/tool-definition-shape-sources/research.md#omne-next-与-minimal-runtime-都把帧声明进定义与-pf-006按收到的解析方向相反)）；基类自动注册 `help`＋默认开启的读帮助门（rev 16 下仍与 K-6「作者可选」相反）；`defer_loading` 挂在工具实例上；外部服务、存储、执行环境、两端模态、MCP 都未覆盖。**适配**：定义本身是 LangChain `BaseTool` 子类，Pydantic 只导得出参数 schema，[翻成 TS 是重建形状不是改语法](../../../../research/tool-definition-shape-sources/research.md#各源作为基线的外部代价)。**关键反例**：三处与产品相反（来源进名字、类级帧声明、内建 `help`），且全在定义的核心位置 | 对照表第 7、8、10、16、20 行直接承载；第 9、21 行不可承载；第 11～15、24 行未覆盖。仓库根未见 `LICENSE`，许可未定；读帮助门的 ADR-C013 仍是 Proposed |
| **D 按 PF-006 §5.3 自研 JSON Schema，只借三源的字段命名与校验经验** | 每条条款直接从产品正文与词条写出：身份只带类别＋name，层归属交给持有（[`data.identity-values` CS-1](../../../spec/data/identity-values/v1/contract.md#cs-1-资产持有的键与属性配值)）；两种范式写成判别联合；两项设置写成「类别＋形状＋默认值」；模型可见面单独成一块供 MCP 条目共用；帧、等待态、卸载不设字段；返回形状留给规格按 K-8 另定 | **借用清单**（借命名与结构，不借语义）：A 的 `media.inputs/outputs` 结构、设施名单、命令表与单 alias、`implementationArtifact` 引用形态；C 的后台四级词汇与默认 `never`、阈值、`flat`／`typed_union` 两种带法；B 的三字段呈现面、参数 schema 子集的校验经验、MCP 非法名的哈希后缀。**要付的**：没有现成 schema、样例与校验测试可继承，全部从零写并自己验证；三源已经踩过的坑（参数子集与模型供应商的兼容、schema 摘要做绑定钉）要靠借用清单主动搬、不会自动带来；若运行时一题 fork DSH，数据定义到 DSH `ToolDefinition` 之间多一层适配。**关键反例**：表面上违背研发品味「满足规格时优先复用成熟实现」——但前提是有一份满足规格的实现，研究显示三源各有两处以上与产品方向相反的核心机制，没有一份满足 | 无直接证据，依据是研究对三源的否定性结论加上产品正文本身；D 的字段清单尚未起草，与 A 的实际重合度未知 |

## 必要条款 × 候选：以它为起点要做什么

「—」表示现成同向，只需照用。

| 条款 | A minimal-runtime | B DSH | C omne-next | D 自研 |
|---|---|---|---|---|
| K-1 身份 | **换主键**（不可承载，第 1、2 行） | 加类别维度、改同层重名与替代（需改） | 去来源前缀、改合并标识（需改） | 直接写 |
| K-2 两范式＋作者定带法 | 单函数去掉命令壳；去掉系统回落 `compact` | **新建多命令抽象**（第 7 行需改、第 8 行未覆盖） | — | 直接写，借 C 的两种带法 |
| K-3 六项声明 | 补外部服务、存储、环境绑定层；后台 `supported` 实现 | 前五项全补；后台默认翻转＋阈值 | 前五项全补 | 直接写，借 A 的模态结构、C 的后台词汇 |
| K-4 两项设置 | 超时、并发移出定义；目标环境改成设置形状＋默认值 | 同左（`timeoutMs` 在定义上） | 新增 | 直接写 |
| K-5 自带实现 | 可沿用制品引用形态 | 剥离 `execute` 闭包 | 从类改为数据引用 | 直接写，借 A 的引用形态 |
| K-6 `help` 可选 | **去保留字** | 作者自加即可 | **拆自动注册与读帮助门** | 直接写 |
| K-7 帧不在定义 | **删 `frames[]`**（不可承载，第 21 行） | — | **删 `progress_profile`**（不可承载，第 21 行） | 不设字段 |
| K-8 返回形状归规格 | 当前每命令必填 | 当前 `output` 必填 | 当前不声明 | 留空待规格定 |
| K-10 语言无关 | — | **剥出函数才成数据** | **从 Python 类重建** | 直接写 |
| K-11 MCP 条目 | 新增（未覆盖） | 条目数已同向；身份与持久副本要改 | 新增（未覆盖） | 模型可见面独立一块 |

**读法**：A 的改动集中在身份——这是它的主键，其余字段都挂在它上面；B 的改动集中在「定义是数据」这一根本属性；
C 的改动集中在三个核心位置并外加换语言。三者改完之后，剩下的现成部分都落在 D 的借用清单里。

## 推荐与仍待区分的事项

**作者推荐 D（按产品正文自研，按借用清单逐字段借用三源）。这是作者推荐，不是接受。**

理由：

1. **三源都要推翻各自的核心机制**，不是改几个字段：A 推翻主键，B 推翻「定义即运行时对象」，C 推翻三处核心并换语言。
   推翻核心之后留下来的，正好是 D 借用清单里那些字段结构——以某一源为「起点」除了多背一份要逐条剔除的词汇，不多给什么。
2. **K-9 把工具协议划给本项目自定**；fork 维护边界说的是被选定复用的组件，而 [SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel) 写明选定哪些 DSH 包仍需逐项确定——`dsh-tools` 尚未被选定。
   以 B 为数据契约起点，等于在运行时一题还没选之前先替它选了。
3. **A 的起点身份最难洗净**：它不在 main、不是证据，引用的是已退役谱系的候选契约；拿它当起点，每个字段都要回答「这是产品要的，还是旧谱系要的」，
   这份审查工作量与 D 从产品正文逐条写出相当，却多一层来源混淆。

**这份推荐接受了的代价**：D 没有可继承的测试与样例，正确性全靠新写的规格、样例与校验证明；
「优先复用成熟实现」在这里只落在字段与经验层面，接受 D 的人要明知这一点。

### 仍待区分的事项

| # | 未知 | 最小区分调查 | 会改变什么 | 负责 |
|---|---|---|---|---|
| 1 | D 与 A 的实际重合度 | 起草 D 的字段清单后，与 A 的 `work-data` `ToolDefinition`／`Command` 逐字段比对，数「照搬」「改名」「删」「新增」 | 重合度很高时 A 与 D 收敛成同一条路，差别只剩来源标注；推荐不变，但借用清单会变长 | 契约起草者 |
| 2 | 参数 JSON Schema 方言 | 查 OpenRouter 转发到各模型供应商时工具参数 schema 的接受子集；追 A 的参数实际走 Ajv 还是 DSH 子集 | 四个候选都受影响；若只能用 DSH 子集，B 在「参数」一格的经验价值上升 | 研究维护者 |
| 3 | 六项声明怎么落到 MCP 动作上 | 见 [design.md 交接缺口](design.md#交接缺口) | 决定 MCP 条目是否需要一份「声明从对端推导」的映射规则 | 契约起草者，不符再回产品 |
| 4 | `help`、MCP 两行按 rev 16 的重读 | 研究维护者回源码按新 rev 重核 | 若推翻，重看 B、C 两格 | 研究维护者 |

### 会改变推荐的证据

- **转向 A**：第 1 项比对显示 A 的命令表、模态、设施、后台声明在改完身份后原样可用的比例很高，
  且分支里对应的校验测试能随之搬过来——那时从 A 起步能省下一批样例与测试，值得付「来源审查」的代价。
- **转向 B 的形状（而非 B 本身）**：运行时一题选定 fork DSH 执行管线，且适配层的负担被证明主导——
  那时让 D 的模型可见面与 DSH `ToolSchema` 同名同构，是 D 的一个变体，不需要回到 B。
- **C**：除非实现语言改为 Python，看不到让 C 重新上桌的证据；它的声明词汇已经全部进了 D 的借用清单。
