# Skill 的规格形状以哪一份为起点

## 需要作出的选择

Skill 在本项目里要有一份语言无关的规格：**一份 skill 的内容由什么构成**（载体文件、frontmatter 字段、正文、资源目录）、
**什么样的内容算合格**（校验规则）、**内容怎样成为不可变的已发布版本**。
这份规格同时被四处消费：Skill 数据契约与校验、把外部 `SKILL.md` 带进来的导入器、
[`Skills()`](../../../product/PF-007-meta-capabilities/design.md#62-skills通向任意技能) 的 `read` 与 `exec_script`、
[Slash Command ② 型](../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)把正文展开成内容块。

要选的是**以哪一份现成的东西为起点**：omne-next `omne_skill_spec`、Agent Skills 开放格式、DSH `skill/*`，或都不用、自研一份最小规格。

**可观察的后果**：用户与仓库里现成的 `SKILL.md` 能不能原样被本系统收下；
复制或分享一份 skill 时会不会连带把作者那边的权限带过来；
agent 看到的说明、读到的正文与资源、能跑的脚本是不是同一份已发布版本里的东西；
同一份正文经 `Skills().read` 与经斜杠命令两条路进日志时是不是同一段文字。

**可调整的**：扩展字段放在哪；外部格式里本项目不认的键怎样处置；规则层的具体条目。
**不可调整的**：下面八条必要性质（逐条出处见 [alternatives.md](alternatives.md#选择对象与必要约束)）。

## 现有能力如何承载

本项目还没有 Skill 契约；承载者是产品正文与三个参考来源。三源的逐字段拆解与 21 行 PF 条款对照归
[skill-spec-sources 报告](../../../../research/skill-spec-sources/reports/2026-09-23-skill-spec-sources.md)，这里只收会影响本次选择的承载关系。

| 要求/条款 | 现有承载 | 怎么组合、谁交接 | 未覆盖或未确认 |
|---|---|---|---|
| 主体是可读指引正文，可带资源文件（[PF-002 §4 Skill](../../../product/PF-002-assets-settings-and-permissions/design.md#skill)） | 三源一致：`SKILL.md` = frontmatter + Markdown 正文 + 可选 `references/ scripts/ assets/`（[research](../../../../research/skill-spec-sources/research.md#三源的-skill-都以一个-skillmd-加可选资源目录为载体frontmatter-必填只有-name-与-description)） | 正文是 frontmatter 定界之后的全部文本 | 定界文法三源不一致，omne-next core_v1 会静默截断（[research](../../../../research/skill-spec-sources/research.md#两套-omne-next-校验对同一输入给出不同结论)） |
| 身份是 name，同类同名即替代（[PF-002 身份](../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)） | DSH 与 omne_agent_skills 以 name 寻址；core_v1 以 `SkillId` 为身份、name 只是显示名；Claude Code 插件 skill 以 `plugin:skill` 并列（[research](../../../../research/skill-spec-sources/research.md#三源的-skill-身份都落在-name-上但同名的判定各不相同)） | 规格定 name 语法；同名替代由 PF-002 层级求值兑现，不由格式兑现 | name 语法主线已定「归规格」，产品只要求同类别内唯一 |
| 说明是触发与路由依据（[PF-006 技能的说明](../../../product/PF-006-tools-and-skills/design.md#技能的说明)） | 三源的 `description` 同义；DSH 另拆出 `whenToUse`，Claude Code 另有 `when_to_use` | 常驻时进系统提示词的是 name 与说明（[PF-006 常驻](../../../product/PF-006-tools-and-skills/design.md#常驻)） | 另立一个路由字段会让「说明」一个概念两处权威 |
| 正文按需取，资源经 `Skills().read` | 三源都是三级渐进披露（[research](../../../../research/skill-spec-sources/research.md#三源都是三级渐进披露名与描述对所有-skill-常驻正文按名按需读资源按需另取)）；PF-007 decisions 已登记 `read` 同时读正文与资源 | 规格只需保证资源路径**相对于包**、可列举 | DSH 把绝对目录交给模型，与「资源不在 agent 文件系统视野里」相反（[research](../../../../research/skill-spec-sources/research.md#dsh-的-registry-与文件系统发现分属两个包但资源寻址与热更新依赖文件系统路径)） |
| 脚本执行权随 skill，`exec_script` 只跑自带脚本 | 三源都没有专门动作，脚本经通用 shell 执行（[research](../../../../research/skill-spec-sources/research.md#三源都没有运行-skill-自带脚本的专门动作脚本经通用-shell-或文件工具执行)） | 规格需让「哪些文件是这份 skill 自带的脚本」可判定；执行权属 `Skills()` 契约 | 三源无承载 |
| 已发布版本不可变（[PF-001 §6.7](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)、[PF-002 flows §3.3](../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)） | 三源规格都不带（[research](../../../../research/skill-spec-sources/research.md#三源的-skill-规格本身都不带不可变的已发布版本)）；本项目由[资产版本](../../../domain_objects/objects.md#ul-asset-version--资产版本)这条版本线承载 | **版本是资产层的事，不是 skill 格式的事**：格式只需让一份版本的全部内容（`SKILL.md` + 资源树）可规范化地整体摘要 | frontmatter 里作者自报的 `version`（本机 41/115 份）不承担任何版本语义 |
| 调用面开关不在内容里（主线自定；[PF-003 §6.7](../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动)、[PF-002 §5.2](../../../product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性)） | core_v1 spec 没有这类键；DSH 与本机实例把 `disable-model-invocation`、`user-invocable`、`allowed-tools` 写在 frontmatter（[research](../../../../research/skill-spec-sources/research.md#dsh-与本机实例把调用面开关写在-skillmd-内容里与内容覆盖配置不动的切分方向相反)） | 这些值归资产属性，由各层配值、运行时求值 | Claude Code 官方文档称 `allowed-tools` 在调用那一轮免审批、不受工作区信任门控（[CC-9](../../../../research/slash-command-parsing-sources/notes/claude-code.md#cc-9)，文档级）；本机未探针 |
| Slash Command ② 型：正文直接成为内容块 | 本机官方插件与 Claude Code 把命令并入 skill（[CC-4](../../../../research/slash-command-parsing-sources/notes/claude-code.md#cc-4)）；Codex 以 `$name` 调 skill（[CX-7](../../../../research/slash-command-parsing-sources/notes/codex.md#cx-7)）；PF-002 让两者分开、多对多 | 规格只需让「正文」的边界确定；命令名、参数声明属 Slash Command 资产 | ② 型是否带参数、Claude Code 正文里的 `$ARGUMENTS` 与 `` !`cmd` `` 在本系统里是什么，正文未说 |
| 依赖声明（用能力标识指 tool）与执行环境需求（[PF-006 §6.4](../../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析)） | 三源都没有一个字段同时「指向能力标识」且「缺了就判不可用」（[research](../../../../research/skill-spec-sources/research.md#三源都没有把skill-要用到的-tool作为必需依赖参与可用性判定)） | 只能是本项目的扩展 | 放 frontmatter 还是别处，是本次子选择 |
| 规则语言无关可表达（SYS-SPEC） | core_v1 Pydantic 只带得走 frontmatter 形状，规则大半在校验代码里（[research](../../../../research/skill-spec-sources/research.md#把-core_v1-的-pydantic-模型翻成语言无关-schema只带得走-frontmatter-的形状规则的大半在校验代码里)）；DSH 规则同样只在 TS 代码里 | 需 JSON Schema（frontmatter 与扩展记录）+ 一张有限规则表（定界、name 语法、路径、上限） | — |

## 剩余责任与能力演化

不论选哪一条，下面这些都是本项目**自己定**的——三源都没有，候选之间只差「在谁的骨架上补」：

| 剩余问题 | 关系 | 归属理由 |
|---|---|---|
| 依赖声明、执行环境需求、设置项声明（形状 + 默认值） | **扩展**：内容类，随实现变、随版本走、随复制覆盖 | PF-002「它组合的 tool 清单」不属身份、属实现；PF-003「内容覆盖」要求它们跟着内容走 |
| 调用面开关、预批准、谁可以使用、常驻、资源取用方式、正文变体的选取 | **不进规格内容**：属资产属性或引用条目上的设置 | 主线自定；PF-002 §5.2 三方分工；PF-006 常驻挂在引用条目上 |
| 正文变体的内容形状 | **新增**：三源都没有（报告 #6） | 选哪份是设置，但多份正文放在哪是内容，规格得给位置 |
| 外部格式里本项目不认或另归属的键 | **导入映射**：属性类键不生效、改为向导入者报告；未知键不生效并告警 | 原样生效会把作者那边的预批准带进来（[research](../../../../research/skill-spec-sources/research.md#dsh-与本机实例把调用面开关写在-skillmd-内容里与内容覆盖配置不动的切分方向相反)） |
| 同基名撞车 | **导入映射**：Claude Code 两个插件的同基名 skill 本是并列，进本系统会变成同名替代 | 导入器必须检出并交导入者裁决，不能静默替代 |
| 一份版本的规范化摘要 | **新增**：格式侧的义务，资产版本线消费 | 不可变要可核对 |

不提出新能力维度：Skill 已是 [PF-002 八类资产](../../../product/PF-002-assets-settings-and-permissions/design.md#八类资产)之一，本次只选它的内容规格从哪起步。

## 取舍入口

见 [alternatives.md](alternatives.md)：A、C 被必要性质排除；B 与 D 都能兑现，B 总负担更小，推荐 B；
扩展字段推荐子路径 B-2b。推荐不是接受。

## 契约、动作链与 Cordis 投影

契约尚未起草。本提案被接受后，下游按以下分工落：

- **Skill 包数据契约**（`spec/data/`，命名待起草时按命名账本定）：`SKILL.md` frontmatter 的 JSON Schema、
  扩展定义记录的 JSON Schema、一张有限规则表（frontmatter 定界须行首闭合、name 语法与上限、description 上限、
  包内路径不得越出包根、脚本集合的判定、规范化摘要的算法）。**写性质，不写哪段代码怎么解析。**
- **导入器**：外部 `SKILL.md`（Claude Code、Codex、DSH、omne-next 两套）到本项目 Skill 包的映射，
  含键的分类处置、撞名检出、判定分级（拒收 / 带告警收下）。它是一个提供者，契约归上一条，映射表归其提供者设计。
- **`Skills()` 契约**（PF-007 的门）：`read` 读正文与资源、`exec_script` 只跑包内脚本——消费上一条的「包内路径」「脚本集合」两条规则。
- **Cordis 投影**：本次选择不涉及插件边界；是否复用 DSH 的文件系统 provider 或目录渲染是提供者层的另一次选择，
  不由本提案决定（见 [alternatives.md 候选 C](alternatives.md#c-fork-dsh-skill-子系统)）。

## 证据义务与受阻消费

| 依赖的性质与前提 | 保护者/环境责任 | 所需证据与当前结果 | 闭合条件与受影响选择 |
|---|---|---|---|
| **开放格式原文与本机实例一致**：六个字段 `name`、`description`、`license`、`compatibility`、`metadata`、`allowed-tools`；name 语法；`metadata` 值的类型；规格本身是否允许未知键 | 上游规格作者 | **未取证**。skill-spec-sources 按派发约束未引网络原文；目前只有 Claude Code 官方文档的转述（钉存于 [slash-command-parsing-sources/sources](../../../../research/slash-command-parsing-sources/sources/provenance.json)） | **挡 B 的接受**：派一轮研究钉存开放格式原文快照（版本或抓取时刻 + 哈希）。`metadata` 若只许字符串值，B-1 须自造字符串文法，B-2b 的优势扩大；若允许结构化值，B-1 与 B-2b 差距收窄 |
| 本机 Claude Code 对 `allowed-tools` 是否真按预批准处理 | 宿主 | 文档级已有（[CC-9](../../../../research/slash-command-parsing-sources/notes/claude-code.md#cc-9)）；本机**未探针** | **不挡选择**：无论真假，它都归属性类、在本系统内不生效；只影响导入器给导入者的提示措辞 |
| 本机 122 份实例的 name 合规率（kebab-case ≤64、等于目录名） | 实例作者 | **未计量**；已知 name 与 description 在 122/122 份出现，115 份插件含重复副本（[E13](../../../../research/skill-spec-sources/evidence.md#agent-skills-本机实例)） | 不挡选择；决定导入器的拒收率与撞名频率，导入器设计前计一次 |
| Codex 的 `SKILL.md` frontmatter 字段集 | — | 未逐字段比对（只知 Codex 以 `$name` 调 skill、名字字符 `[A-Za-z0-9_:-]`） | 不挡选择；影响导入映射表的覆盖面 |
| omne-next `omne_agent_capabilities` 的版本与检索做法 | — | 未通读（报告第七节线索） | 不挡选择：版本归资产版本线，不归格式 |

本次选择不涉及共享代数保证、并发装卸或依赖可逆性，不触发形式模型门槛。

## 交接缺口

- **正文变体放在包的哪里**、**② 型是否带参数与 Claude Code 正文特性（`$ARGUMENTS`、`` !`cmd` ``）怎么处置**：
  前者归 Skill 包契约起草，后者先交产品正文（PF-002 Slash Command）确认 ② 型有无参数，再定导入器是原样保留还是告警。
- **导入一个 Claude Code skill 时要不要同时生成一份 ② 型斜杠命令**（Claude Code 里每个 skill 默认就是 `/name`）：
  归导入器设计，涉及「谁可以用这个入口」的默认值，须按 [PF-002 §5.7](../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) 取严。
- 评审处置见 [review.md](review.md)；实际决定尚未发生。
