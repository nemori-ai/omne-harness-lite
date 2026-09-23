# 候选与取舍

## 选择对象与必要约束

选择对象见 [design.md](design.md#需要作出的选择)。每条候选都要兑现下面八条；前五条是产品正文的要求，后三条是主线与系统约束：

| # | 必要性质 | 出处 |
|---|---|---|
| P1 | **载体是 `SKILL.md`，与社区互通**：本机现有的 `SKILL.md` 能直接导入 | 产品负责人对 ② 型的原话（「直接加载它的 SKILL.md 内容」）；[PF-002 Slash Command](../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) |
| P2 | **name 与 description 必填**；description 就是触发与路由依据 | [PF-006 技能的说明](../../../product/PF-006-tools-and-skills/design.md#技能的说明)；主线自定 name 语法归规格 |
| P3 | **正文按需取，资源经 `Skills().read` 取**；资源不暴露存储位置 | [PF-007 §6.2](../../../product/PF-007-meta-capabilities/design.md#62-skills通向任意技能) 及其 decisions |
| P4 | **脚本执行权随 skill**：`exec_script` 只能跑这份 skill 自带的脚本 | 同上 |
| P5 | **已发布版本不可变** | [PF-001 §6.7](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属) |
| P6 | **调用面开关不在内容里**：能否被模型调、能否被人调、预批准什么，走资产属性 | 主线自定；[PF-003 §6.7](../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动) |
| P7 | **与 Slash Command ② 型兼容**：「正文」的边界确定，两条路进日志的是同一段文字 | [PF-002 Skill](../../../product/PF-002-assets-settings-and-permissions/design.md#skill) |
| P8 | **校验规则语言无关可表达**：JSON Schema + 一张有限规则表 | [SYS-SPEC](../../../foundation/cross-system-constraints/requirements.md#sys-spec) |

**P3、P4、P5 主要由格式之外的东西兑现**（`Skills()` 契约、资产版本线）。对格式的要求只是**不挡路**：
资源路径相对于包、脚本集合可判定、一份版本的全部内容能规范化摘要。候选在这三条上的差别，就差在它**挡不挡路**。

## 一览

| 候选 | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 | 结论 |
|---|---|---|---|---|---|---|---|---|---|
| **A** 移植 `omne_skill_spec` | 有前提 | 有前提 | 能 | 能 | 有前提 | 能 | **不能** | 有前提 | 排除 |
| **B** 采用开放格式 + 扩展 | **能** | 能 | 能 | 能 | 能 | 有前提 | 能 | 能 | **推荐** |
| **C** fork DSH `skill/*` | 有前提 | 能 | **不能** | 不能 | **不能** | **不能** | 未核 | 不能 | 排除 |
| **D** 自研最小规格 | 有前提 | 能 | 能 | 能 | 能 | 能 | 能 | 能 | 可行，负担大于 B |

## 各候选

### A. 移植 omne-next `omne_skill_spec`

**是什么**：以 omne-next `6263fed5` 的 `omne_skill_spec` 0.1.0 为起点——它在该提交上只是 core_v1 `agentic/skill/spec` 的转发壳，
两者字段与规则**逐字相同**（[research](../../../../research/skill-spec-sources/research.md#omne_skill_spec-与-core_v1-spec-在-6263fed-上是同一份实现的转发壳真正分叉的是-omne_agent_skills-的第二套校验)）。
把 `SkillFrontmatter`（Pydantic）翻成 JSON Schema，把 `SkillSpecificationValidator` 的 H-001～H-006、S-001 重写成语言无关规则。

**怎样兑现**：P2 有 H-002～H-005 覆盖，但 name 正则允许连续连字符、报错文案却说禁止；P6 core_v1 spec 本就没有调用面键；
P3、P4 可用 `SkillFiles` 文件树与 `scripts/` 约定。

**与本机 122 份实例的互通**：
- 键名是下划线 `allowed_tools`，本机 8 份用连字符 `allowed-tools`，在 core_v1 下**读成空列表**（E7 第 1 条）；
- 「name 等于目录名」是硬错误（H-004），而本项目的资产不是目录——导入以外的场合这条规则没有对象；
- frontmatter 定界 `find("---", 3)` 不要求行首，description 里出现 `a---b` 就被截断且判合格（E7 第 3 条）。

**总负担**：翻 Schema 只带得走字段形状；规则全部要重写（[research](../../../../research/skill-spec-sources/research.md#把-core_v1-的-pydantic-模型翻成语言无关-schema只带得走-frontmatter-的形状规则的大半在校验代码里)），
重写时还得修掉上面三处，再把键名改回社区拼写——**做完之后得到的就是 B 的形状**，只是多背了一套要逐条甄别的 Python 语义。
另有两处要先裁：「omne-next 的 skill 规格」指 core_v1 一系还是 `omne_agent_skills` 那套（两者同一输入五处结论不同，
[research](../../../../research/skill-spec-sources/research.md#两套-omne-next-校验对同一输入给出不同结论)）；
resolver 以 `SkillId` 为身份、name 只是显示名，与 PF-002「身份是 name」不同构。

**关键反例**：P7——定界的静默截断会让「正文」的边界随 description 内容漂移，② 型展开与 `Skills().read` 可能拿到不同的文字，而校验报合格。
P5——若连 resolver 与存储一并移植，带来的是「保留上限 20、超出删最旧版本 tag」（报告第七节线索），与「旧版本照旧查得到」相反。

**排除依据**：P7 在原样移植下不成立；修正之后与 B 同形而负担更大。**可借用的**：硬 / 软两级判定（拒收 / 带告警收下）的思路、
`ImportProvenance`（来源格式、位置、ref、时间）的形状——这两样在 B 的导入器设计里按需吸收，不需要以 A 为起点。

**证据与缺口**：E1、E2、E3、E7（实跑）；`6263fed5` 之后是否有提交未查。

### B. 采用 Agent Skills 开放格式，加本项目扩展

**是什么**：`SKILL.md`（YAML frontmatter + Markdown 正文）加可选资源目录，作为 Skill 的载体与核心字段；
**本项目的规则层自持**——钉住开放格式的一个快照作基线，在其上写本项目的 JSON Schema 与规则表，上游改动经本项目显式升级才进来，
不写成「以上游当前说法为准」。

**怎样兑现**：
- P1：本机 122 份都有 `name` 与 `description`（E13），一份合格的开放格式文件本身就是本项目的合格内容，不需要转换；
- P2：开放格式的 description 本就是「何时用」（本机官方示例「Trigger conditions」、Claude Code 文档「Claude uses this to decide when to apply the skill」）；
  Claude Code 把 name 放宽为可选（命令名取目录名，[CC-4](../../../../research/slash-command-parsing-sources/notes/claude-code.md#cc-4)）——本项目必填，由导入器补齐并告知；
  `when_to_use` 一类另立的路由字段不收，导入时并进 description 并告知，保持「说明」一处权威；
- P3、P4：资源目录约定 `references/ scripts/ assets/` 三源一致；规则表写「包内路径不得越出包根」「`scripts/` 下的文件即自带脚本集合」；
- P5：格式不承担；由资产版本线承担，格式只提供规范化摘要；frontmatter 的 `version` 不生效；
- P7：定界规则写成「首行 `---` 开、行首 `---` 闭」（Claude Code 文档的做法），正文是闭合行之后的全部文本；
- P8：frontmatter 与扩展记录各一份 JSON Schema，外加有限规则表。

**P6 为什么是「有前提」**：开放格式自己的六个字段里就有 `allowed-tools`（Claude Code 文档转述），
Claude Code 生态又加了 `user-invocable`、`disable-model-invocation`。直接采用就同时接收了这些**属性类**的键。
前提是规格把键分四类处置：

| 类别 | 例 | 在本系统里 |
|---|---|---|
| 核心 | `name`、`description`、`license`、`compatibility`、`metadata` | 生效（`compatibility` 是自由文本，不参与可用性判定） |
| 本项目扩展 | 依赖声明、执行环境需求、设置项声明、正文变体 | 生效；放哪见[下一节](#b-的扩展字段放哪) |
| 外部属性类 | `allowed-tools`、`tools`、`user-invocable` / `user_invocable`、`disable-model-invocation`、`model`、`argument-hint` | **不生效**；导入器把它们作为「作者的意图」报告给导入者，由持有该资产的层去配属性；**权限类一律不转成默认值** |
| 未知 | 其余 | 不生效，告警 |

**与本机 122 份实例的互通**：内容**原样可收**；带属性类键的（`version` 41、`user_invocable` 38、`user-invocable` 13、`allowed-tools` 8 等，E13）
收下后这些键不生效并报告。**不能原样保留的是语义，不是文件**：作者在 Claude Code 里预批准的工具，在本系统里要本组织自己配。

**总负担**：写一份 Schema + 规则表 + 键分类表；导入器按来源各一张映射表（Claude Code、Codex、DSH、omne-next 两套）；
上游演进要有人盯——Claude Code 的 skill 页在 v2.1.196～v2.1.280 有 17 处版本注记，布尔字段取值在 v2.1.218 改过（slash-command-parsing-sources）。

**关键反例**：
1. 照搬 `allowed-tools` 的语义，会把作者的预批准带进目标组织（[research](../../../../research/skill-spec-sources/research.md#dsh-与本机实例把调用面开关写在-skillmd-内容里与内容覆盖配置不动的切分方向相反)）——由「外部属性类不生效」挡住；
2. Claude Code 两个插件的同基名 skill 在那边是并列，进本系统就成了同名替代，且不报错（[research](../../../../research/skill-spec-sources/research.md#三源的-skill-身份都落在-name-上但同名的判定各不相同)）——导入器必须检出撞名交导入者裁决；
3. 把 `allowed-tools` 当依赖清单去算可用性，会把 `Bash(ls *)` 这样的权限条目当工具名去找提供者、全部判不可用——所以依赖声明必须是本项目的扩展，不能复用这个键。

**证据与缺口**：E9～E14、CC-4、CC-9；**开放格式原文未钉**，是接受前必须补的一项（[design.md](design.md#证据义务与受阻消费)）。

### B 的扩展字段放哪

属性类的去向已由 P6 定死：**出内容，走资产属性或引用条目上的设置**——调用面开关与「谁可以使用它」是权限，
常驻挂在引用条目上（[PF-006 常驻](../../../product/PF-006-tools-and-skills/design.md#常驻)），资源取用方式与正文变体的选取是设置。
剩下要选的是**内容类扩展**（依赖声明、执行环境需求、设置项声明、正文变体）放哪。三条子路径：

| 子路径 | 放在哪 | 兑现与代价 | 关键反例 |
|---|---|---|---|
| **B-1** frontmatter 内 | `SKILL.md` 的 `metadata` 下一个本项目命名空间键（顶层新键会让严格校验器硬拒：Claude Code 文档转述 claude.ai 上传「Unexpected key(s) in SKILL.md frontmatter」） | 一个文件，作者与 agent 改一处；随内容走、随复制覆盖 | `metadata` 的值类型未知：`omne_agent_skills` 只收字符串值，Claude Code 说是自由 map。若开放格式只许字符串，依赖与执行环境这类结构化声明就得自造一套字符串文法，P8 变差 |
| **B-2a** 资产属性 | 作为持有上的属性配值，逐层配 | 格式最干净 | **不成立**：属性是逐层配的值，复制时不动（PF-003 §6.7）——依赖声明就不随内容走；任一层都能改写依赖，可用性从「依赖解析的结果」退化成「被谁配置的开关」（与 [PF-006 可用性](../../../product/PF-006-tools-and-skills/design.md#可用性)相反），「声明与实际必须对得上」无从保证 |
| **B-2b** `SKILL.md` 之外的定义记录 | 包内一个保留路径的文件（名字归规格），与 `SKILL.md`、资源树同属一份资产版本的内容 | `SKILL.md` 与开放格式逐字节兼容，双向都不用转换；声明天然是 JSON、直接受 JSON Schema 约束；与 `metadata` 值类型无关 | 两件东西须一起版本化——由规范化摘要覆盖整个包兑现；`Skills().read` 列资源时须排除这份记录；外部宿主会把它当普通资源文件（无害） |

**推荐 B-2b**：它在 `metadata` 值类型未知时照样成立，且把「开放格式管的」与「本项目加的」分在两份文件、两份 Schema，
上游演进时只动前者。**会让 B-1 胜出的证据**：开放格式原文确认 `metadata` 允许结构化值、且主要作者群体（人与 agent）更常直接改 `SKILL.md`
而不是经创作入口——那时单文件的收益超过分文件的边界清晰。

### C. fork DSH `skill/*` 子系统

**是什么**：fork DSH `c291e796` 的 `dsh-skill`（registry）、`dsh-skill-filesystem`、`dsh-tool-skill`、`dsh-skill-badge`，
以它的数据形状与 frontmatter 解析为规格起点。[SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel) 允许 fork 选定的 DSH 组件，但工具协议与子系统由本项目定义。

**怎样兑现与改造量**（逐条是 DSH 的结构性选择，不是缺字段）：

| 性质 | DSH 的做法 | 要改成 |
|---|---|---|
| P5 | 「every load re-reads the current file」，没有版本，正文改动不形成版本（[research](../../../../research/skill-spec-sources/research.md#dsh-每次加载都重读当前正文正文改动不形成版本也不标记已读结果过时)） | registry 按版本取、provider 交出不可变快照 |
| P6 | frontmatter 只收六键，其中两键就是调用面开关 `disable-model-invocation`、`user-invocable` | 把这两键从数据形状里拿掉，改由属性求值给出 |
| P3 | `resourceBase: directory` 把绝对路径交给模型，模型用通用文件工具读 | 换成 `Skills().read` 按包内路径取 |
| P4 | 只注册 `skill` 一个工具，无脚本概念 | 新增脚本集合与 `exec_script` |
| 同名 | 按 Cordis scope「nearest layer wins」+ rank 遮蔽，被遮蔽者无 API 可查 | 换成 PF-002 按归属层求值，替代关系对 agent 可见 |
| 不可用 | 非法条目带警告消失，模型分不出「没有」与「坏了」 | 同名替换件（[PF-006 §6.3](../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)） |
| P8 | 规则只在 TS 代码里 | 仍要另写语言无关规格——fork 不提供 |

**与本机 122 份实例的互通**：六键以外一律不解析——`allowed-tools` 静默消失（这点碰巧与「不生效」同向，但不报告）；
下划线 `user_invocable`（38 份）不认；不检查 name 与目录名。

**总负担**：留下的只有 frontmatter 解析与目录渲染；其余都要改，**且改完仍没有回答「规格是什么」**——C 是一个提供者实现的起点，不是规格的起点。

**排除依据**：P3、P5、P6 在原样 fork 下都不成立，P8 fork 本身不提供。**不排除的是另一件事**：将来写 Skill 提供者时，
DSH 的 frontmatter 解析或目录渲染是否值得复用，是提供者层的一次独立选择，届时按本项目规格核对差距再定。

**证据与缺口**：E9～E12；DSH 调用策略两份作者笔记（`2026-07-28-skill-invocation-policy.md`、`2026-08-08-user-explicit-skill-invocation.md`）未读。

### D. 自研最小规格

**是什么**：本项目自己拥有全部字段的定义——只定 PF 要求的字段与规则（name、说明、正文、资源树、依赖、执行环境、设置项声明、正文变体），
内部表示是一份本项目的数据契约；`SKILL.md` 只是**导入 / 导出的一种编码**，三源格式（含开放格式本身）一律经导入器映射进来。

**与 B 的实质差别**：B 里一份合格的开放格式文件**就是**合格内容，核心字段的演进以开放格式为基线；
D 里任何外部文件都是**外来的**，要转换才成为内容，核心字段的演进由本项目单方决定。

**怎样兑现**：八条都能兑现，P1 靠导入器。

**与本机 122 份实例的互通**：导入可以做到与 B 同样的覆盖；但**回不去**——本系统里创作或 agent 改出来的 skill 要经导出器才能在 Claude Code、Codex 里用；
工作区仓库里的 `SKILL.md` 每次装配都要过一遍转换。

**总负担**：重新定义开放格式已有的那部分（name、description、正文、资源目录约定），外加导入器与导出器两个方向、每个来源一张映射表。
与「满足规格时优先复用成熟实现」「一个概念一份权威」都相抵：核心字段在本项目与社区各有一份定义，迟早分叉。

**关键反例**：产品负责人描述 ② 型时的原话是「直接加载它的 SKILL.md 内容当作消息的一个块」——D 下被展开的不是 `SKILL.md`，而是转换后的内部表示；
两者一旦在正文边界上有差，人敲命令看到的与 agent 读到的就不是同一段文字（P7 的前提由导入器兜住，而不是由格式保证）。

**不排除**：它是 B 的退路——若开放格式原文钉存后发现与本项目必要性质硬冲突（例如规格本身规定某个属性类键必须生效），D 就是剩下的选择。

**证据与缺口**：无需上游证据；负担估计来自 B 的键分类表与导入映射的规模推断，未量化。

## 推荐与仍待区分的事项

**推荐 B，扩展字段走 B-2b。**理由：
- A 与 C 在原样下各有必要性质不成立（A：P7 定界截断；C：P3、P5、P6），修正后 A 收敛到 B 的形状、C 仍不产出规格；
- B 与 D 都能兑现八条，差在总负担：B 复用开放格式已定义的核心，只自持规则层与扩展；D 要重建核心并双向转换，且与社区的核心定义长期分叉；
- B 的唯一「有前提」（P6）由键分类表兑现，这张表 D 也一样要写——D 在 P6 上没有省下任何东西；
- B-2b 不依赖 `metadata` 值类型这一未知，且把上游管辖与本项目扩展分在两份 Schema。

**接受前必须补的一项**：钉存 Agent Skills 开放格式原文（版本或抓取时刻 + 哈希），核对六字段、name 规则、`metadata` 值类型、规格对未知键的态度。

**会改变选择的证据**：

| 证据 | 改变什么 |
|---|---|
| 开放格式原文规定某个属性类键（如 `allowed-tools`）**必须**被宿主执行，不执行即不合规 | B 的「外部属性类不生效」就是不合规实现；转向 D |
| 开放格式原文允许 `metadata` 放结构化值，且创作主要发生在直接改 `SKILL.md` | B-2b 转 B-1 |
| 开放格式原文与本机实例在 name 语法或定界上有实质差异 | 不改 B，但规则表以原文为基线、导入器补本机实例的偏差 |
| `omne_agent_capabilities` 通读后发现一套已被验证的版本 / 发布 / 检索规格 | 不改格式选择（版本归资产版本线），但可能作为资产版本契约的参照 |
