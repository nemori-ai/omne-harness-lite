# data.skill-package v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.skill-package, 1)`——
  `family = data`、`topic = skill-package`、规范路径 `spec/data/skill-package/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`（2026-09-23 起草）——语义可被审阅；接受、采用与冻结均未由有权者闭合，不得据此发布或声称消费者已采用
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-002 rev 16、PF-006 rev 17、PF-003 rev 4** 为准；**PF-007 rev 16 只引**；
  起点是 [D-034](../../../../record/decisions/skill-spec-adoption/decision.md)（Agent Skills 开放格式为载体、规则层自持、扩展声明走包内定义记录）；
  开放格式钉的是研究 [skill-spec-sources](../../../../../research/skill-spec-sources/research.md#第二轮开放格式原文与三家扩展) 第二轮钉存的 agentskills/agentskills `69ef37e`（[原文字节](../../../../../research/skill-spec-sources/sources/provenance.json)；规格本身没有版本号）
- **精确语义依赖**：

  | 坐标 | 消费的条款 | 取它的什么 | 本契约怎么用 |
  |---|---|---|---|
  | `omne-harness-lite-design-2026-09-15 · data.asset-model · v1`（候选） | [S-2](../../asset-model/v1/contract.md#s-2-能力标识名的词法)、[S-3](../../asset-model/v1/contract.md#s-3-能力标识与它的规范串)、[S-9](../../asset-model/v1/contract.md#s-9-版本线)、[S-10](../../asset-model/v1/contract.md#s-10-八类正文的外壳)、[S-12](../../asset-model/v1/contract.md#s-12-属性声明由正文推出)、[S-13](../../asset-model/v1/contract.md#s-13-设置项类别)、[S-15](../../asset-model/v1/contract.md#s-15-disabled-是保留项名)、[S-36](../../asset-model/v1/contract.md#s-36-usableby-是保留项名) | 能力标识名的词法与能力标识的形状、已发布版本不变、skill 类正文的外壳与「正文里的名字字段必须等于能力标识」、属性声明的形状与推出规则的四条义务、设置项类别、保留项名 `disabled` 与 `usableBy` | `$ref` 它的 `$defs/CapabilityName`（技能名）、`$defs/CapabilityId`（组合的工具清单）与 `$defs/AttributeDeclaration`；本契约就是 S-10 里 skill 那一行 `$ref` 的正文契约 |
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1`（候选） | [S-7](../../content-blocks/v1/contract.md#s-7-媒体类型的规范形式) | 媒体类型的规范形式 | `$ref` 它的 `$defs/MediaType`（资源条目） |
  | `omne-harness-lite-design-2026-09-15 · data.tool-definition · v1`（候选） | [S-9](../../tool-definition/v1/contract.md#s-9-四项依赖名)、[S-11](../../tool-definition/v1/contract.md#s-11-目标环境)、[S-18](../../tool-definition/v1/contract.md#s-18-名字的表示与相等)、[S-26](../../tool-definition/v1/contract.md#s-26-表示层拒绝值与判定次序) | 依赖名（外部服务）的形状；目标环境「绑定层 × 设施」的形状与「不声明＝没有特殊要求」；名字的相等与不解析；绑定层不认得时的拒绝值 | `$ref` 它的 `$defs/DependencyName` 与 `$defs/TargetEnvironment`；`targetEnvironment` 的默认值不合时原名携带它的 `binding_layer_unknown`（[S-24](#s-24-表示层拒绝值与判定次序)） |

- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.skill-package/v1#S-8`。
  缺口 `G-n`、性质 `P-n`、消费者核对场景 `CS-n`、`malformed` 的来由 `M1`～`M17`（[S-24](#s-24-表示层拒绝值与判定次序)）同此范围。
  本文引另一份契约的条款一律带坐标，**`S-12` 这类裸号只指本契约**

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| Skill：可复用的工作方法；主体是可读的指引正文，可带资源文件；读取不等于运行它带的脚本，也不自动装载全部附件；身份是 name，正文、资源、组合的 tool 清单都不是；同一份正文两条路到 agent 眼前；设置（正文变体、资源的取用方式等）、权限（谁可以使用它）；能组合 Tool | [PF-002 §4 Skill](../../../../product/PF-002-assets-settings-and-permissions/design.md#skill) | S-1、S-3、S-6、S-8、S-10、S-13、S-17、[G-2](#九已知缺口)、[G-3](#九已知缺口) |
| 身份是「类别 ＋ name」，其余归实现 | [PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现) | S-2、S-6 |
| 谁能组合谁：Skill 只组合 Tool；刻意不做 Skill 组合 Skill；组合图不得成环；组合不转移所有权 | [PF-002 §4 谁能组合谁](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁) · [几个刻意不做的组合](../../../../product/PF-002-assets-settings-and-permissions/design.md#几个刻意不做的组合) | S-13 |
| 组合的引用指向能力标识 | [PF-002 §6.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识) | S-13 |
| 设置与权限是资产的两种属性；三方分工；设置项分四类、资产声明每一项时必须标类别 | [PF-002 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性) · [三方分工](../../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值) · [设置项分四类](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别) | S-15、S-17 |
| ② 型斜杠命令：skill 正文逐字成为用户消息里的一个内容块 | [PF-002 §4 Slash Command](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) | S-8 |
| 常驻：引用条目上的一项设置，不是工具或技能自身的属性；agent definition 压 plugin | [PF-006 §4 常驻](../../../../product/PF-006-tools-and-skills/design.md#常驻) · [§6.1](../../../../product/PF-006-tools-and-skills/design.md#61-常驻标记挂在引用条目上agent-definition-压-plugin) | S-18 |
| 技能的说明是触发与路由的依据；正文与资源按需取 | [PF-006 §4 技能的说明](../../../../product/PF-006-tools-and-skills/design.md#技能的说明) | S-7、S-8 |
| 依赖：一串必需项的抽象名字；技能声明「某个能力标识下的工具」；只有且，只有必需 | [PF-006 §4 依赖](../../../../product/PF-006-tools-and-skills/design.md#依赖) · [只有且，只有必需](../../../../product/PF-006-tools-and-skills/design.md#只有且只有必需) | S-13、S-14、S-16 |
| 依赖声明与解析：技能用能力标识指它要用的工具；带脚本的技能声明执行环境要求（绑定层 × 设施） | [PF-006 §6.4](../../../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析) | S-13、S-15、S-16 |
| 技能不能按能力标识依赖某个 MCP 动作，要那个对端在场就声明一项外部服务 | [PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作) | S-13、S-14 |
| `Skills()`：`read` 是读取不是激活；读一份技能不等于运行它带的脚本；`exec_script` 只能跑这份 skill 自己带的脚本；执行权随 skill 走（**只引**） | [PF-007 §6.2](../../../../product/PF-007-meta-capabilities/design.md#62-skills通向任意技能) | S-10、S-11 |
| 覆盖的范围：内容覆盖，配置不动；重复复制全量覆盖 | [PF-003 §6.7](../../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动) · [§6.6](../../../../product/PF-003-asset-transfer-and-sharing/design.md#66-重复复制全量覆盖替换) | S-19 |
| 起点：开放格式为载体与核心字段、规则层自持、键分四类处置；内容类扩展走包内定义记录；两家扩展叠加参考 | [D-034](../../../../record/decisions/skill-spec-adoption/decision.md) · [提案候选 B 与 B-2b](../../../../record/proposals/skill-spec-adoption/alternatives.md#b-采用-agent-skills-开放格式加本项目扩展) | S-4、S-5、S-12、S-20、[G-7](#九已知缺口) |
| 开放格式原文：六个 frontmatter 键；name 规则；`metadata` 只许字符串值；未知顶层键规格未述；`allowed-tools` 实验性；定界行规则未写 | 研究 [第二轮结论](../../../../../research/skill-spec-sources/research.md#第二轮开放格式原文与三家扩展) | S-4、S-5、S-20 |
| 规格形式；部署边界 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | [第五节](#五装配给与协议给)、S-22～S-25 |
| 统一语言正式名 | [能力与构成](../../../../ubiquitous_language/terms/capabilities-and-composition.md) · [取用与可用性](../../../../ubiquitous_language/terms/reach-and-availability.md) | 全部英文名 |

> **没有产品行、或产品行不足以单独支撑的条款，逐条点名：**
>
> | 条款 | 依据来自哪 |
> |---|---|
> | [S-2](#s-2-技能名的词法) 技能名的词法 | **主线裁定 2026-09-23，待产品负责人确认**（账本 S9-c、S18-e）：技能名就是能力标识名，禁 `/`、允许 `:`，不收窄到开放格式的名字规则；词法的家是 `data.asset-model` v1 的 S-2 |
> | [S-3](#s-3-技能包的四个部分) 的 `body`、[S-12](#s-12-定义记录) 不收常驻与权限项、[S-15](#s-15-设置项声明与目标环境) 的保留项名 `targetEnvironment`、[S-21](#s-21-包的目录形式) 的保留路径 `.omne/skill.json` | **主线裁定 2026-09-23，待产品负责人确认**（账本 S18-a、S18-b）：起草时偏离账本的五处全采纳；保留路径与工作区承载清单 `.omne/workspace.json` 同在一个保留目录 |
> | [S-10](#s-10-资源只被读取不因读取而运行) 资源只读、没有执行位成员；[S-17](#s-17-属性项投影规则) 「谁可以使用它」归 `data.asset-model` 的 `usableBy` | **主线裁定 2026-09-23，待产品负责人确认**（账本 S18-d、S18-c） |
> | [S-11](#s-11-脚本集合) 脚本集合按 `scripts/` 判定 | **起草者推导**：开放格式的目录约定（「`scripts/` Contains executable code that agents can run」）＋ D-034 采用的候选 B 写明「规则表写『`scripts/` 下的文件即自带脚本集合』」。产品正文只要求「只能跑这份 skill 自己带的脚本」 |
> | [S-15](#s-15-设置项声明与目标环境) 「没有脚本就不得声明目标环境」 | **起草者推导**：与 `data.tool-definition` 的「有阈值无许可即拒」同理——永远用不上的声明只会误导读定义与配值的人 |
> | [S-20](#s-20-skillmd-的文本形式与定界) 定界规则、YAML 版本、不去 BOM | **起草者推导**：开放格式没写（研究第二轮）；D-034 定「规则层自持」，这几条是为了两个实现对同一份 SKILL.md 得出同一份清单头与正文 |
> | [S-22](#s-22-规范表示)～[S-25](#s-25-表示层拒绝不是判定也不修补) | **SYS-SPEC**：规范表示、闭合枚举、表示层拒绝值与「表示层不等于判定」是规格形式的要求；六个拒绝值的名字来自起草简报的账本，判定次序是本契约的推导 |
> | [第五节](#五装配给与协议给) | **SYS-DEPLOY** |

## 一、目的与消费者

### 这份契约拥有什么

**一份[技能](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-skill--技能--skill)资产版本的全部内容长什么样**：
`SKILL.md` 的清单头（开放格式的六个键）与正文、包内资源的条目与路径、本项目的包内定义记录（组合的工具清单、外部服务依赖、设置项声明）、
由包得出的依赖声明与属性项投影规则，以及 `SKILL.md` 的文本形式与包的目录形式怎样读成这份表示——还有一个值不合这些形状时，**拒绝值叫什么**。

它是一份**数据契约**：没有操作、没有提交点、没有状态转移，**因此不需要插件**。
它有两条**纯派生**——由包得出的依赖声明（[S-16](#s-16-由包得出的依赖声明)）与属性项投影（[S-17](#s-17-属性项投影规则)）——
都只在表示合法的包上求值，无状态、无提交点。**「每个操作九件事」在这里没有对象**：本契约不定义任何操作。

**它不拥有**：

| 不拥有 | 归谁 |
|---|---|
| 技能的加载、取用、可用性重算与替换件 | `capability.asset-registry`（第四波并行起草）与运行时 |
| `Skills()` 的 `search`／`read`／`exec_script` 三个命令，脚本在哪落地、谁放行 | PF-007 §6.2 的契约（尚未建立）、工具执行运行时、放行判断 |
| 持有、配值与求值（谁持有这份技能、各层给它的设置配了什么、生效值是什么） | `capability.asset-governance`、`capability.asset-evaluation`（同程并行） |
| 资产记录、版本线、复制血缘 | `data.asset-model` |
| 常驻标记（挂在引用条目上） | Agent Definition 与 Plugin 的正文（[S-18](#s-18-常驻不在包里)） |
| 把 Claude Code、Codex 等外部技能目录带进来的映射 | 导入器的提供者设计（尚未起草）；它产出的必须是本契约的一个合法值 |
| 资源字节存在哪、怎样取 | 提供者设计（[S-19](#s-19-包是版本内容的一个整体)） |

### 消费者

| 消费者 | 消费什么 |
|---|---|
| `data.asset-model`（下一版） | [S-3](#s-3-技能包的四个部分) 的 `SkillPackage`：它的 `AssetContent` 的 skill 变体由不透明壳换成对本契约的引用（[对齐义务](../verification.md#对齐义务)）；[S-6](#s-6-名字与所属能力标识一致) 的名字一致性 |
| `capability.asset-registry`（第四波并行） | 技能那张注册表收的值（[S-3](#s-3-技能包的四个部分)）；名字与说明（[S-6](#s-6-名字与所属能力标识一致)、[S-7](#s-7-说明)）；依赖声明（[S-16](#s-16-由包得出的依赖声明)） |
| `Skills()`（PF-007 §6.2 的契约，尚未建立） | `read` 读的正文与资源（[S-8](#s-8-正文逐字不展开不执行)、[S-9](#s-9-资源条目与包内路径)）；`exec_script` 能跑的脚本集合（[S-11](#s-11-脚本集合)）；`search` 按的说明（[S-7](#s-7-说明)） |
| 斜杠命令的数据契约（第四波并行） | ② 型绑定：能力标识指向一份技能；展开的就是 [S-8](#s-8-正文逐字不展开不执行) 的正文 |
| `data.content-blocks` | 它的 [S-8](../../content-blocks/v1/contract.md#s-8-文本块与来源标记) `skill_body` 来源标记的那段文本，就是本契约的正文（**方向是它引用本契约**） |
| `capability.asset-evaluation`（同程并行） | 属性项投影（[S-17](#s-17-属性项投影规则)）；工作区承载清单里 `source` 指向的技能包目录怎样读（[S-21](#s-21-包的目录形式)） |
| `capability.asset-transfer` | 复制覆盖的「内容」就是整份包（[S-19](#s-19-包是版本内容的一个整体)） |
| 导入器（提供者设计，尚未起草） | 键的四类（[S-5](#s-5-键的四类处置)）、文本形式与目录形式（[S-20](#s-20-skillmd-的文本形式与定界)、[S-21](#s-21-包的目录形式)） |

> 上表没有一行是本契约的依赖：方向一律是消费者 → 本契约，登记在各消费者自己的 catalog 条目里。
> 第四波并行起草的几份契约此刻不在本工作树，本包里不链接它们。

## 二、含义与使用范围

**适用范围**：一个部署之内。本版完整交付是单机，但每一条的**领域语义在跨进程之后必须原样成立**；
哪些结论在单机由装配给出、分布式后必须由协议重新兑现，列在[第五节](#五装配给与协议给)。

### 规格层 token 与词条的对应

交换表示用 token，对外文档用词条名，**两者不得互相替代**。

| 规格层 token | 词条 |
|---|---|
| 技能包描述的那一类资产 | [技能 · Skill](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-skill--技能--skill) |
| `SkillName`、组合清单里的 `CapabilityId` | [能力标识 · Capability Identifier](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier) 的 name 分量 / 能力标识本身 |
| `definition.tools` | [资产组合 · Asset Composition](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition)（技能 → 工具） |
| [S-16](#s-16-由包得出的依赖声明) 得出的那一串名字 | [依赖声明 · Dependency Declaration](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration) |
| `definition.settings` 的每一项；`kind` 的 `setting` / `permission` | [设置 · Setting](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-setting--设置--setting) · [权限 · Permission](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-permission--权限--permission) |
| 设置项的 `category` | [设置项类别 · Setting Category](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category) |
| 常驻 | [常驻 · Residency](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-residency--常驻--residency) |
| 包作为整体所属的那一份 | [资产版本 · Asset Version](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset-version--资产版本--asset-version) |
| `targetEnvironment` 的设施 | [环境设施 · Environment Facility](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-environment-facility--环境设施--environment-facility) |

**下列是规格层的名字或产品正文的说法，不是统一语言词条**，本契约与 Schema 里**不给它们「中文 · English」那种词条式标题**，已报主线：
`SkillPackage`（技能包——一份技能资产版本的全部内容，**无词条**）、`SkillManifest`（清单头——`SKILL.md` 的 frontmatter，**无词条**）、
`body`（正文——PF-002 说的「可读的指引正文」，**无词条**）、说明（PF-006 的「技能的说明」，**无独立词条**，[UL-skill](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-skill--技能--skill) 的「注意」提到它）、
`ResourceEntry`（资源条目——PF-002 说的「资源文件」，**无词条**）、脚本集合（**无词条**）、`SkillDefinitionRecord`（定义记录——D-034 的「包内定义记录」，**无词条**）、
目标环境（`data.tool-definition` 的说法）、外部服务（[依赖声明词条](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration)的「别混」提到它，**无独立词条**）、
开放格式（Agent Skills 开放格式，一个外部规格的名字）。

### 与相近概念的差异

- **技能包 ≠ 技能。**技能是那一类资产；技能包是它**某一份实现、某一个版本**的内容。同一个能力标识下可以有平台、组织、租户各一份记录，每份记录的每一版各有一个包。
- **清单头里的 `name` ≠ 技能的身份。**身份是所属资产的能力标识；`name` 是开放格式要求写在文件里的那个名字，必须与身份相等（[S-6](#s-6-名字与所属能力标识一致)），不是第二个身份。
- **说明 ≠ 正文。**说明是 `description`，回答「什么时候该用这份方法」；正文是闭合定界行之后的全部文本，回答「该怎么做」（[S-7](#s-7-说明)、[S-8](#s-8-正文逐字不展开不执行)）。
- **资源 ≠ 脚本 ≠ 正文。**资源是包里 `SKILL.md` 与定义记录以外的每一份文件；脚本是资源里落在 `scripts/` 下的那一部分；正文不是资源（[S-9](#s-9-资源条目与包内路径)、[S-11](#s-11-脚本集合)）。
- **定义记录 ≠ 资源。**它是本项目的扩展声明，与 `SKILL.md`、资源同属一份内容，**但任何列举资源的读面都不列它**（[S-12](#s-12-定义记录)）。
- **组合的工具清单 ≠ 外部服务依赖 ≠ 目标环境。**三者都进依赖声明（[S-16](#s-16-由包得出的依赖声明)），但前者指能力标识、第二个指外部服务的名字、第三个是一项可被各层配值的设置。
- **`compatibility` ≠ 目标环境。**前者是开放格式的一段自由文本，系统不据它判任何事；执行环境要求只由目标环境表达（[S-5](#s-5-键的四类处置)、[S-15](#s-15-设置项声明与目标环境)）。
- **`allowed-tools` ≠ 组合的工具清单。**前者是外部生态的预批准，在本系统里不生效；后者是本项目的组合与依赖（[S-5](#s-5-键的四类处置)、[S-13](#s-13-组合的工具清单)）。
- **包里的设置项声明 ≠ 设置的配值。**声明是内容，随版本走、随复制覆盖；配值挂在持有上，复制不动（[S-19](#s-19-包是版本内容的一个整体)）。
- **资源条目上没有「可执行」这一位。**包的表示不携带执行资格；一份资源是不是脚本只看路径（[S-10](#s-10-资源只被读取不因读取而运行)、[S-11](#s-11-脚本集合)）。

## 三、值、身份与结构关系

| 元素 | 精确含义 | 条款 |
|---|---|---|
| — | 技能包是什么 | [S-1](#s-1-技能包是什么) |
| `SkillName` | 技能名的词法 | [S-2](#s-2-技能名的词法) |
| `SkillPackage` | 包的四个部分 | [S-3](#s-3-技能包的四个部分) |
| `SkillManifest` | 清单头的六个键 | [S-4](#s-4-清单头开放格式的六个键)、[S-5](#s-5-键的四类处置) |
| `manifest.name` | 与所属能力标识一致 | [S-6](#s-6-名字与所属能力标识一致) |
| `manifest.description` | 说明 | [S-7](#s-7-说明) |
| `body` | 正文 | [S-8](#s-8-正文逐字不展开不执行) |
| `ResourceEntry` | 资源条目与路径；只读取不运行 | [S-9](#s-9-资源条目与包内路径)、[S-10](#s-10-资源只被读取不因读取而运行) |
| — | 脚本集合 | [S-11](#s-11-脚本集合) |
| `SkillDefinitionRecord` | 定义记录 | [S-12](#s-12-定义记录)～[S-15](#s-15-设置项声明与目标环境) |
| — | 依赖声明、属性项投影 | [S-16](#s-16-由包得出的依赖声明)、[S-17](#s-17-属性项投影规则) |
| — | 常驻不在包里；包是版本内容的整体 | [S-18](#s-18-常驻不在包里)、[S-19](#s-19-包是版本内容的一个整体) |

### S-1 技能包是什么

**一个技能包是一份技能资产某一个版本（或草稿）的全部内容**：它说这份实现「怎么做」（正文）、「什么时候用」（说明）、
带着哪些资源文件、组合了哪些工具、还要哪些东西在场、自带哪些设置项。

- **它是数据**：没有进程内对象、没有代码入口、没有运行时状态；读它的一方**不回写它**。这使它可以被存储、复制、跨进程原样交换。
- **它在资产模型里的位置**：`data.asset-model` v1 的 [S-10](../../asset-model/v1/contract.md#s-10-八类正文的外壳) 里 skill 那一行的 `body` 就是本契约的 `SkillPackage`（2026-09-24 整批对齐起 `$ref` 本契约）。
- **它不带归属与版本号**：哪一层的哪一份、第几版，由资产记录与版本线给出，不是包的成员。

### S-2 技能名的词法

**`SkillName` 是技能的名字——它的能力标识的 name 分量。它就是 `data.asset-model` v1 的 [`CapabilityName`](../../asset-model/v1/contract.md#s-2-能力标识名的词法)**：
非空、不含空白、不含斜杠、允许冒号、区分大小写，逐码点相等。**词法的家在那里，本契约不复述、不收窄**（主线裁定 2026-09-23，待产品负责人确认；账本 S9-c、S18-e）。

- **本契约不在其上收窄。**开放格式对 `name` 另有五条（1–64 个字符、小写字母数字与连字符、不以连字符起止、不连用连字符、等于父目录名），**它们不是本系统技能名的约束**。
  **代价**：一个本系统里合法的技能名（例如 `Review_Checklist`）写出的 `SKILL.md`，在按开放格式严格校验的外部工具上会被判不合格；外部导入时由导入器先映射（账本 S18-e）。
- 同一条词法也管[组合清单](#s-13-组合的工具清单)里工具的 name：两者都是能力标识名。

### S-3 技能包的四个部分

**`SkillPackage = { manifest, body, definition?, resources }`：**

| 成员 | 必填 | 含义 | 条款 |
|---|---|---|---|
| `manifest` | 是 | `SKILL.md` 的清单头 | [S-4](#s-4-清单头开放格式的六个键) |
| `body` | 是 | `SKILL.md` 的正文，可以为空串 | [S-8](#s-8-正文逐字不展开不执行) |
| `definition` | 否 | 本项目的包内定义记录 | [S-12](#s-12-定义记录) |
| `resources` | 是 | 包内资源条目，可以为空数组 | [S-9](#s-9-资源条目与包内路径) |

- **`SKILL.md` 不是资源**：它的内容恰是 `manifest` 与 `body` 两个成员，不再以一个资源条目出现（[S-9](#s-9-资源条目与包内路径) 挡住名为 `SKILL.md` 的资源）。
- **`body` 是账本之外的成员**：起草简报把「`SKILL.md` 的正文」列为本契约拥有，而账本给的 `SkillPackage` 没有它的位置；
  放进 `manifest` 会让一个名为 `body` 的 frontmatter 键与它相撞。主线裁定 2026-09-23 采纳（账本 S18-a），待产品负责人确认。

### S-4 清单头：开放格式的六个键

**`SkillManifest` 恰是 Agent Skills 开放格式（agentskills/agentskills `69ef37e`）给 `SKILL.md` frontmatter 定义的六个键，键名逐字：**

| 键 | 必填 | 约束（逐字取自开放格式，`name` 除外） | 在本系统里 |
|---|---|---|---|
| `name` | 是 | 取 `SkillName`（[S-2](#s-2-技能名的词法)），**不取**开放格式那五条 | 必须等于所属能力标识的 name（[S-6](#s-6-名字与所属能力标识一致)） |
| `description` | 是 | 1–1024 个字符 | 技能的说明（[S-7](#s-7-说明)） |
| `license` | 否 | 字符串（许可名，或指向包内一份许可文件的说法） | 原样保存、原样返回，系统不据以判定任何事 |
| `compatibility` | 否 | 给出时 1–500 个字符 | 同上；**不参与可用性**——执行环境要求只由目标环境表达（[S-15](#s-15-设置项声明与目标环境)） |
| `metadata` | 否 | 字符串键到**字符串值**的映射 | 同上；**不是本项目扩展的位置**（D-034 子路径 B-2b） |
| `allowed-tools` | 否 | 一个字符串 | **外部属性类，不生效**（[S-5](#s-5-键的四类处置)） |

- **「字符」按 Unicode 码点计。**
- **六键之外的键不是本表示的一部分**：`SkillManifest` 上出现第七个成员即 `malformed`。
  从文本形式读入时，六键之外的键怎样处置见 [S-5](#s-5-键的四类处置)——**它们不进本表示，但不因此拒绝整个包**。
- **本契约钉住 `69ef37e` 这一个快照。**开放格式此后的改动（研究列出的 issue #514、#350、#485 若合入）**不自动进来**，要经本契约出新版显式升级（D-034「规则层自持」）。

### S-5 键的四类处置

**D-034 定的四类，逐键落在这里：**

| 类 | 键 | 在本系统里 |
|---|---|---|
| **核心** | `name`、`description`、`license`、`compatibility`、`metadata` | 进表示。`name` 与 `description` 生效（[S-6](#s-6-名字与所属能力标识一致)、[S-7](#s-7-说明)）；另三个原样保存、**不被系统解释** |
| **本项目扩展** | —— | **一个也不在 frontmatter 里**：组合的工具清单、外部服务依赖、设置项声明都在定义记录里（[S-12](#s-12-定义记录)；D-034 子路径 B-2b） |
| **外部属性类** | `allowed-tools`（开放格式六键之一）；以及文本形式里可能出现的 `tools`、`user-invocable`、`user_invocable`、`disable-model-invocation`、`model`、`argument-hint`、`arguments`、`disallowed-tools`、`effort`、`context`、`agent`、`background`、`hooks`、`paths`、`shell` | **不生效**。`allowed-tools` 在六键之内，进表示、原样保存，**不预批准任何东西、不是依赖声明、不参与可用性与放行判断**；其余不在六键之内，**不进表示** |
| **未知** | 其余一切（如 `version`、`when_to_use`、`tier`） | **不生效，不进表示** |

1. **不生效的意思是没有任何一方据它做任何事**：调用面开关、预批准、模型选择、执行设置、挂件——在本系统里一律由持有这份技能的各层配值、或由引用它的那一条引用决定，
   **不由内容决定**（[PF-003 §6.7](../../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动)：内容随复制覆盖，配置不动——调用面开关若在内容里，一次复制就把它带过去了）。
2. **不进表示的键，读入方要留下可见的痕迹**：从文本形式读成本表示时丢掉了哪些键、各属哪一类，由读入方记下并让发起读入的一方看得见——
   **不静默丢，也不据以拒绝整个包**。痕迹的形状归读入方（工作区读入是 `capability.asset-evaluation`，外部导入是导入器）。
3. **外部生态放在包内侧车文件里的配置**（如 Codex 的 `agents/openai.yaml`）**只是一份普通资源**：本契约不解析它，它不生效。
4. **这张表的外部属性类一栏按研究第二轮的盘点列**（Claude Code 文档的十四个键加本机实例出现过的 `tools`、`user_invocable`）；**「外部属性类」与「未知」在本系统里的处置相同**，区别只在读入方给出的痕迹怎么措辞。

### S-6 名字与所属能力标识一致

**凡是知道这份包属于哪个能力标识的地方，`manifest.name` 必须逐码点等于那个能力标识的 name；不等即 `name_mismatch`。**

- 知道的地方有三处：一份资产记录的草稿与每一版（能力标识是记录的 `capability`，类别恒为 `skill`）；工作区承载清单里指向这份包的那一条（`data.asset-model` v1 的 S-24）；导入器给它定下的能力标识。
- **身份只在能力标识。**`manifest.name` 是开放格式要求写在文件里的那个名字，本契约要求它是身份的镜像——**它不是第二个身份**，不参与「是不是同一个东西」的判断，也不能拿来改名：要换名字就是另一个能力标识、另一份记录。
- **目录名不是身份，本契约不检查它**：开放格式要求 `name` 等于父目录名；在本系统里目录只是地址（[PF-001 §6.5](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#路径是地址不是钥匙)），包作为资产时根本没有父目录。
- **本契约对技能给出专名 `name_mismatch`**；一份资产记录里的技能正文违反它，`data.asset-model` v1 的 [S-27](../../asset-model/v1/contract.md#s-27-表示层拒绝值) 原名携带这个值——**同一违例在两处同名**。
- **不知道所属能力标识时**（例如只对一份包单独做形状校验），这一条无从判；`manifest.name` 不合 [S-2](#s-2-技能名的词法) 的词法是 `malformed`。

### S-7 说明

**`manifest.description` 就是[技能的说明](../../../../product/PF-006-tools-and-skills/design.md#技能的说明)：它回答「什么时候该用这份方法」，是触发与路由的依据。**

- 常驻时进系统提示词的是 name 与它；`Skills().search` 按它找；[替换件](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-stand-in--替换件--stand-in)换掉的也是它——**这三件事都不在本契约**，本契约只保证「说明」恰有一处权威。
- **不另立第二个路由字段**：外部生态另设的 `when_to_use` 一类是未知键，不进表示（[S-5](#s-5-键的四类处置)）。要不要在导入时把它并进说明，归导入器。

### S-8 正文：逐字、不展开、不执行

**`body` 是 `SKILL.md` 闭合定界行之后的全部文本，逐字**（[S-20](#s-20-skillmd-的文本形式与定界)）。可以为空串。

1. **同一份正文，两条路到 agent 眼前是同一段文字**：经 `Skills().read` 读到的，与 [② 型斜杠命令](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)展开成用户消息里那一个内容块的（`data.content-blocks` v1 [S-8](../../content-blocks/v1/contract.md#s-8-文本块与来源标记) 的 `skill_body`），**都是这一个成员的值，逐码点相等**。
   两条路进日志的形状不同（一次工具执行的返回 / 用户消息里的一块），文字相同。
2. **不经任何展开**：正文里看起来像占位符的（`$ARGUMENTS`、`${CLAUDE_SKILL_DIR}`）或像内嵌命令的（`` !`cmd` ``）**一律是文本**。本契约不定义任何展开；
   **读正文、送正文的任何一方都不得替换其中的占位、不得执行其中的命令**。
   理由：[读取一份技能不等于运行它带的脚本](../../../../product/PF-002-assets-settings-and-permissions/design.md#skill)，运行只有 `exec_script` 一个入口（[PF-007 §6.2](../../../../product/PF-007-meta-capabilities/design.md#62-skills通向任意技能) 的红线）；
   展开还会让同一份正文随环境变成不同的文字，第 1 条就不成立。
   ② 型命令里人附带的参数**另成一个内容块，不拼进正文**（PF-002 §4 Slash Command）。
3. **正文的内容不受形状约束**：开放格式说「no format restrictions」；本契约不限长度、不要求非空、不解析其中的 Markdown。

### S-9 资源条目与包内路径

**`ResourceEntry = { path, mediaType? }`：包里 `SKILL.md` 与定义记录以外的每一份文件，恰一条。**

**`path` 是相对包根的规范路径**：

1. 分隔符只用 `/`；每一段非空。
2. **字面上不出包**：不以 `/` 开头，不以盘符（如 `C:`）开头，没有 `..` 这一段，不含反斜杠——**违反任一条即 `resource_escapes`**。
3. 规范写法：没有 `.` 这一段、不以 `/` 结尾——不合即 `malformed`（`.` 段会让两个串指同一份文件，第 4 条的「互不相同」就不再有意义）。
4. **同一个包里 `path` 互不相同**（逐码点比较）；**任何一条的 `path` 都不是另一条的目录前缀**（有了 `scripts` 就不能再有 `scripts/a.py`：一个路径不能既是文件又是目录）。违反即 `malformed`。
5. **不是 `SKILL.md`**（它的内容在 `manifest` 与 `body`，[S-3](#s-3-技能包的四个部分)），**也不是定义记录的保留路径 `.omne/skill.json`**（[S-12](#s-12-定义记录)）。违反即 `malformed`。

- **`mediaType` 可选**，取 `data.content-blocks` v1 的 [`MediaType`](../../content-blocks/v1/contract.md#s-7-媒体类型的规范形式)。**缺席不作任何断言**：它不表示「未知类型的文件」，也不表示「文本」；谁要知道，自己判。
- **路径是包内的地址，不是宿主机上的位置**：资源的字节存在哪归提供者（[PF-007 §6.2](../../../../product/PF-007-meta-capabilities/design.md#62-skills通向任意技能)「资源存在哪是实现细节」），消费者只按（这一版，`path`）指认一份资源。
- 本版不设资源个数与体积上限；若将来要设，它是一个具名的政策参数，由消费者的契约定。

### S-10 资源只被读取，不因读取而运行

**资源只读：包的表示不携带任何执行资格。**资源条目上没有「可执行」这一位（主线裁定 2026-09-23，待产品负责人确认；账本 S18-d：原来那个恒为 `false` 的成员删掉，改成本条）。

1. **读取一份资源永远不运行它**；读取整份包也不自动装载它的资源（[PF-002 §4 Skill](../../../../product/PF-002-assets-settings-and-permissions/design.md#skill)）。
2. **一份资源能不能经 `exec_script` 运行，不由包决定**：先看它在不在[脚本集合](#s-11-脚本集合)里，再由运行它的那一方另行放行（执行权随 skill 走，PF-007 §6.2；放行归放行判断）。
3. **外部来源里的执行位不进表示**：文件系统上的可执行权限位、外部生态的「可运行」标记，读成本表示时一律丢掉；资源条目上写了这类成员即 `malformed`（M3）。
   理由：若它能进表示，一份被复制或导入的包就能自带「这个可以跑」的声明——那是一种随内容走的执行资格，与第 2 条相抵。

### S-11 脚本集合

**一份包的脚本集合 = 它的资源里，`path` 的第一段恰为 `scripts` 的那些。**

- **它就是 PF-007 §6.2 说的「这份 skill 自己带的脚本」**：`exec_script` 只能跑这个集合里的资源，**不在里面的一概不能**——不论它是不是文本、有没有 shebang、叫什么名字。
  这条是 PF-007 的红线在数据这一侧的把手：「自己带的」有一个确定的、只看这一版包的答案。
- **被列入不等于获准运行**：放行、落地在哪个执行环境、跑不跑，都不在本契约（[S-10](#s-10-资源只被读取不因读取而运行) 第 2 条）。
- **按路径判定是本契约的推导**：开放格式的目录约定（「`scripts/` Contains executable code that agents can run」）与 D-034 采用的候选 B 写明的规则；
  产品正文只要求「只能跑这份 skill 自己带的脚本」。已报主线。
- 空集合合法：这份技能不带脚本，`exec_script` 对它无事可做。

### S-12 定义记录

**`SkillDefinitionRecord = { format, tools?, dependencies?, settings? }`：本项目对这份技能的扩展声明**（[D-034](../../../../record/decisions/skill-spec-adoption/decision.md) 子路径 B-2b：「走包内定义记录，也就是不放在 SKILL.md 的 frontmatter metadata」）。

1. **`format` 恒为 `1`。**在但不等于 `1` 即 `definition_format_unsupported`，**先于定义记录里其余一切判定**——格式不认得，其余成员怎么读就无从谈起。缺席是 `malformed`。
2. **它与 `SKILL.md`、资源同属一份资产版本的内容**：随版本发布定下，随复制覆盖（[S-19](#s-19-包是版本内容的一个整体)）。
3. **它不是资源**：不在 `resources` 里；**任何列举资源的读面**（`Skills().read` 列资源时）**都不列它**。
4. **缺席即：不组合工具、不声明外部服务依赖、不声明设置项。**一份 `{ "format": 1 }` 与缺席同义。
5. **四个成员之外即 `malformed`**。特别是：
   - **不收常驻标记**（[S-18](#s-18-常驻不在包里)）；
   - **不收权限项**：本版技能只有「谁可以使用它」一项权限，它是 `data.asset-model` v1 保留的 [`usableBy`](../../asset-model/v1/contract.md#s-36-usableby-是保留项名)，不由作者声明；作者自定义的权限项本版不收（原 G-5）。
     **这两条偏离了起草简报的账本**（账本给了 `resident?` 与 `permissions?`），主线裁定 2026-09-23 采纳（账本 S18-a），待产品负责人确认。
6. **在目录形式里它住在包内的保留路径 `.omne/skill.json`**（[S-21](#s-21-包的目录形式)；主线裁定 2026-09-23，待产品负责人确认；账本 S18-b）。

### S-13 组合的工具清单

**`definition.tools`：这份技能组合的工具——能力标识的数组，不重复。**意思是「我这套方法要用到这些动作」（[PF-002 §4 Skill](../../../../product/PF-002-assets-settings-and-permissions/design.md#skill)）。

1. **每一项指向一个能力标识，不指向某一份具体的工具资产**（[PF-002 §6.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识)）：组织换上自己的同标识实现之后，这份技能自动用上新的；技能作者不能假定零件不被替换。
2. **类别只能是 `tool`**：[谁能组合谁](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁)那张表的 Skill 一行只有 Tool。
   指向 `skill`（[刻意不做 Skill 组合 Skill](../../../../product/PF-002-assets-settings-and-permissions/design.md#几个刻意不做的组合)）、`mcp`（Skill 不组合 MCP）或别的类别，**即 `tool_ref_invalid`**；
   name 不合能力标识名的词法（[S-2](#s-2-技能名的词法)）同样是 `tool_ref_invalid`。每一项的形状是 `data.asset-model` v1 的 [`CapabilityId`](../../asset-model/v1/contract.md#s-3-能力标识与它的规范串)。
3. **MCP 对端的动作无从指**：它们不是资产、没有能力标识；技能要那个对端在场，声明一项外部服务（[S-14](#s-14-外部服务依赖)；[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)）。
4. **这一份清单同时是依赖**：产品正文对技能把两件事写在同一个声明上——PF-002 说 Skill「能组合 Tool——声明『我这套方法要用到这些动作』」，
   [PF-006 §4 依赖](../../../../product/PF-006-tools-and-skills/design.md#依赖)表第一行与 [§6.4](../../../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析) 第一条说技能用能力标识声明它要用的工具、缺了就不可用。
   **本契约不另立第二份清单**：两份就是两个权威。它进依赖声明的方式见 [S-16](#s-16-由包得出的依赖声明)。
   （**工具那一侧相反**：`data.tool-definition` 的 `composes.skills` 不进依赖声明——PF-006 的依赖表里没有「工具依赖技能」这一行。）
5. **组合图不得成环**（技能 → 工具 → 技能）、**组合不转移所有权**——这两条要看别的资产，一份包看不到，**归装配**。
6. 空数组与缺席同义：不组合任何工具。

### S-14 外部服务依赖

**`definition.dependencies`：这份技能要连上的外部服务——依赖名的数组，不重复。**

- 依赖名取 `data.tool-definition` v1 的 [`DependencyName`](../../tool-definition/v1/contract.md#s-9-四项依赖名)：非空字符串，逐码点相等，不解析（那边的 [S-18](../../tool-definition/v1/contract.md#s-18-名字的表示与相等)）。
  **本版这个数组里的每一个名字都指一个外部服务**——产品意义上的外部依赖，**不是 Cordis service**（[依赖词条](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration)的「别混」）。
- **谁生效在那个名字上，谁就满足它**；解析归注册表与运行时。名字集合与命名空间沿 `data.tool-definition` 的缺口 G-1，**不在这里另定**。
- **不收外部生态的安装指引**：Codex 侧车里的 `dependencies.tools[]` 带的是连接端点与 OAuth 回调端口，是「点名时提示安装」，不是「缺了就不可用」——**它不是这个数组**（研究第二轮；[G-7](#九已知缺口)）。
- 空数组与缺席同义：不依赖外部服务。

### S-15 设置项声明与目标环境

**`definition.settings`：这份技能自带的设置项——每一项是一份 `data.asset-model` v1 的 [`AttributeDeclaration`](../../asset-model/v1/contract.md#s-12-属性声明由正文推出)。**
资产定形状、持有它的各层配值、运行时求值——[三方分工](../../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值)里「定形状」这一方，落在这里。

**每一项的约束**：

1. **`kind` 恒为 `setting`**；带 `permission` 的声明不在这里（[S-12](#s-12-定义记录) 第 5 条）。
2. **类别不是 `governance`**（`data.asset-model` v1 的 [S-13](../../asset-model/v1/contract.md#s-13-设置项类别)：正文契约的推出规则不产出治理类的项）；其余三类由作者标，**必须标**。
3. **项名不是 `disabled`，也不是 `usableBy`**（两项由 `data.asset-model` v1 的 [S-15](../../asset-model/v1/contract.md#s-15-disabled-是保留项名)、[S-36](../../asset-model/v1/contract.md#s-36-usableby-是保留项名) 保留）。
4. **同一份包里项名互不相同**（逐码点）。
5. **`default` 合它自己的取值域**（那份 schema）。
6. 违反第 1～5 条的任一条即 `malformed`。

**保留项名 `targetEnvironment`：执行环境要求。**[PF-006 §6.4](../../../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析)：「工具，以及带脚本的技能，声明它需要什么样的执行环境——由两件事共同确定：绑定在哪一层，以及要有哪几种设施」；
[PF-007 §6.2](../../../../product/PF-007-meta-capabilities/design.md#62-skills通向任意技能)：「这与工具声明设施需求是同一个形状」。本契约因此**沿用 `data.tool-definition` v1 [S-11](../../tool-definition/v1/contract.md#s-11-目标环境) 给同一件事的名字与形状**：

| 成员 | 恒为 |
|---|---|
| `item` | `targetEnvironment` |
| `kind` | `setting` |
| `category` | `placement_identity`——**作者改不了**：容许标成偏好，一个仓库就能在不触发任何确认的情况下改掉脚本落在哪里（与 `data.tool-definition` 的理由相同） |
| `domain` | `{ "kind": "open", "schema": { "$ref": "<data.tool-definition v1 Schema 的 $id>#/$defs/TargetEnvironment" } }` |
| `default` | 一个 `TargetEnvironment`：`{ bindingLayer, facilities }`——作者的判断 |

- **不声明它**：这份技能的脚本对执行环境没有特殊要求（沿 `data.tool-definition` v1 S-11 与 PF-006 [六项可选声明](../../../../product/PF-006-tools-and-skills/design.md#六项可选声明)表的读法），且这份技能没有「目标环境」这一项设置。
- **没有脚本就不得声明它**：脚本集合为空（[S-11](#s-11-脚本集合)）而声明了 `targetEnvironment` 即 `malformed`——永远用不上的声明只会误导读定义与配值的人。**这一条是本契约的推导。**
- **求值出来的那一份就是这份技能的脚本的落点要求**；满足不了就不可用，**绝不退一步给它一个不满足要求的环境**。匹配语义沿 `data.tool-definition` 的缺口 G-5，**不在这里另定**。
- **作者自声明的其他设置项**：形状合法即收；**本版没有任何一方据它们改变系统行为**（[G-4](#九已知缺口)）。作者给它们标的类别决定工作区能不能为它们配值——
  **若将来某一方要据其中某一项改变落点或身份，须先由契约把那一项的类别定死**（理由同上）。
- **PF-002 列的两项「正文变体」「资源的取用方式」本版没有系统认得的项名与形状**（[G-3](#九已知缺口)）：作者照样可以声明自己起名的类似项，**系统不把任何一项当作那两项**。

### S-16 由包得出的依赖声明

**一份技能的[依赖声明](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration)——「我要成立，必须在场的东西」那一串名字——由包里的这几处合起来：**

| 来自哪 | 进声明的是 |
|---|---|
| `definition.tools` 的每一项 | 「这个能力标识下有一个生效的工具，且它当下可用」一项 |
| `definition.dependencies` 的每一个名字 | 那个外部服务一项 |
| `targetEnvironment` 那一项**求值后**的值 | 那个绑定层 × 那几种设施 |

- **只有且，只有必需**：一串名字全部都要在场，没有「或」，也没有「可选」（[PF-006 §4](../../../../product/PF-006-tools-and-skills/design.md#只有且只有必需)）；**没有「部分可用」**。
- **目标环境那一项用的是求值后的值，不是声明里的 `default`**——各层配值会改它。
- **别的都不进**：`manifest` 的任何键（尤其 `compatibility` 与 `allowed-tools`）、正文、资源、作者自声明的其他设置项。
- **它是包的确定函数加上一项求值结果**，不依赖读它的是谁。**解析**（谁在场、谁可用、什么时候重算、不可用时装替换件）**归注册表与运行时**，不在本契约。
- **声明与实际必须对得上**（PF-006 §6.4）：正文里让 agent 去用一个清单里没有的工具，可用性算对了、用起来是错的——这是作者的义务，一份包自己看不出来。

### S-17 属性项投影规则

**`data.asset-model` v1 的 [S-12](../../asset-model/v1/contract.md#s-12-属性声明由正文推出) 要每一份正文契约给出一条推出规则 `声明(正文) → AttributeDeclaration[]`。技能的这一条是：**

```text
声明(p)  ≝  p.definition.settings（缺席即空）
```

- **「谁可以使用它」不由本规则产出**：它是 `data.asset-model` v1 保留的 [`usableBy`](../../asset-model/v1/contract.md#s-36-usableby-是保留项名)，声明写死在那里，对每一份技能都有、恰一项（主线裁定 2026-09-23，待产品负责人确认；账本 S18-c）。
  一份技能的全部属性项 = 本规则推出的 ∪ `disabled` ∪ `usableBy`（`data.asset-model` v1 的 [S-12](../../asset-model/v1/contract.md#s-12-属性声明由正文推出)）。
- 对 `data.asset-model` v1 S-12 那四条义务的兑现：
  1. **是包的确定函数**：只读包本身，不读谁持有它、在哪一格、什么时候、在什么环境；
  2. **推出的项名互不相同**：[S-15](#s-15-设置项声明与目标环境) 第 4 条；
  3. **不产出 `disabled`、`usableBy` 与治理类的项**：[S-15](#s-15-设置项声明与目标环境) 第 2、3 条；
  4. **每一条合 `AttributeDeclaration` 的形状**：Schema 与 [S-15](#s-15-设置项声明与目标环境) 第 5 条。
- **本版技能不带作者自定义的权限项**（[S-12](#s-12-定义记录) 第 5 条）。

### S-18 常驻不在包里

**一份技能包里没有、也不能有常驻标记。**

- [常驻标记是「装配它」那条引用上的一项设置，不是工具或技能自身的属性](../../../../product/PF-006-tools-and-skills/design.md#常驻)；
  [一个 plugin 在包含某个成员时同样可以标，两处都标了以 agent definition 为准](../../../../product/PF-006-tools-and-skills/design.md#61-常驻标记挂在引用条目上agent-definition-压-plugin)。
  **上下文预算是装配方的问题，技能作者根本不知道**——所以它不进技能的内容。
- **表示上**：定义记录里出现 `resident` 这类成员即 `malformed`（[S-12](#s-12-定义记录) 第 5 条）；`SKILL.md` frontmatter 里外部生态的同类键（如 `disable-model-invocation`、`paths`）是外部属性类，**不生效**（[S-5](#s-5-键的四类处置)）。
- **这偏离了起草简报的账本**（账本给了 `resident?: boolean` 并写「只是可声明、压不压归 agent definition」）。依据按产品正文：PF-006 §4 常驻原话、UL-residency 的定义、产品负责人对常驻的裁决「常驻由装配时 tools/skills 引用上的设置项指定」；
  D-034 所据提案的 P6 也把常驻列为「不进规格内容」。主线裁定 2026-09-23 采纳（账本 S18-a），待产品负责人确认。

### S-19 包是版本内容的一个整体

1. **一份包作为一个整体属于一份资产版本**（[资产版本](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset-version--资产版本--asset-version)）：清单头、正文、定义记录、资源条目**和每一份资源的字节**，随版本发布定下，此后不变（`data.asset-model` v1 [S-9](../../asset-model/v1/contract.md#s-9-版本线)）。
   **没有任何一部分单独有版本**：不能只换正文不换资源，也不能让读到的正文与读到的脚本来自两个版本。
2. **资源的字节不在本表示里内联**：本表示以 `path` 指认它们，字节存在哪、怎样取归提供者。它们仍是这一版内容的一部分——**第 1 条对它们同样成立**，由持有字节的那一方兑现；
   跨进程时字节怎样随版本走、怎样核对是不是同一份，**本版表示里没有摘要**（[G-6](#九已知缺口)）。
3. **内容覆盖，配置不动**（[PF-003 §6.7](../../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动)）：整份包——含定义记录里的设置项声明与它们的 `default`——**是内容**，随复制全量覆盖；
   各层为这份技能配下的值挂在持有上，**不是包的一部分**，复制不动它们。新一版删掉、新增或保留某个设置项时怎样，按 PF-003 §6.7 那张表，不需要新规则。
4. **草稿也是一份包**：还在变，不是版本；复制与分享只认已发布的。

## 四、两种承载形式

**本契约的规范表示是 JSON 的 `SkillPackage`**（[S-22](#s-22-规范表示)）。下面两种是它的**承载形式**：技能以文件的样子出现的地方（工作区承载目录、外部技能目录、导出）
都按这里读成规范表示——**读法只有这一份**，读入方（`capability.asset-evaluation`、导入器）不各写一套。

### S-20 SKILL.md 的文本形式与定界

**`SKILL.md` 是一份 UTF-8 文本，由一段 YAML frontmatter 与其后的 Markdown 正文组成。读成 `manifest` 与 `body` 的规则恰是：**

1. **开头**：文本的第一行恰为 `---`（不含行终止符的那部分逐字等于三个连字符）。**不去掉开头的 U+FEFF**：以它开头的文本，第一行不是 `---`。
2. **行终止符**是 LF 或 CRLF。
3. **闭合**：第一行之后、**第一个**恰为 `---` 的行。**闭合必须独占一行**——出现在一行中间的 `---`（如 `description: see a---b here`）不闭合任何东西。
4. **frontmatter** 是第一行与闭合行之间的那些行；**`body` 是闭合行的行终止符之后的全部文本，逐字**——不裁剪首尾空白、不改行终止符。闭合行之后没有任何字符，`body` 是空串。
5. **frontmatter 按 YAML 1.2 解析，结果必须是一个映射**；映射里**键重复**即 `malformed`。
6. **核心键的值不强转**：`name`、`description`、`license`、`compatibility`、`allowed-tools` 的值必须解析为字符串，`metadata` 必须解析为字符串到字符串的映射；
   解析结果类型不对即 `malformed`——**不把数字、布尔或嵌套映射改写成字符串**。
7. **六键之外的键按 [S-5](#s-5-键的四类处置) 处置**：不进 `manifest`、不生效、由读入方留痕。
8. 第 1、3、5 条任一不成立（没有开头行、找不到闭合行、frontmatter 解析失败或不是映射）即 `malformed`。

- **理由**：开放格式只说「YAML frontmatter followed by Markdown」，没写闭合行必须独占一行；参考库与 omne-next core_v1 都按子串找 `---`，会把 `description` 截断且校验通过（研究第二轮）。
  闭合独占一行、正文逐字，是为了让 [S-8](#s-8-正文逐字不展开不执行) 第 1 条成立：**正文的边界只由文本决定**。YAML 1.2 与不强转，是为了两个实现对 `name: no` 这样的行得出同一个值。
  这几条都是 D-034「规则层自持」要本契约写定的，**是本契约的推导**。
- **写出**：本系统写出的 `SKILL.md` 满足第 1～6 条读回来得到同一份 `manifest` 与 `body`；frontmatter 的具体排版（键序、引号风格）不在本契约。

### S-21 包的目录形式

**一个技能包的目录形式是一个目录（包根）：**

1. **包根下名为 `SKILL.md` 的那个普通文件**（名字逐码点比较，不按文件系统的大小写规则放宽）按 [S-20](#s-20-skillmd-的文本形式与定界) 读成 `manifest` 与 `body`。**没有这个文件即 `manifest_missing`**。
2. **定义记录**是包根下 `.omne/skill.json` 这个 JSON 文件（与工作区承载清单 `.omne/workspace.json` 同在一个保留目录；账本 S18-b）。**没有这个文件即没有定义记录**；它在却不是一份合法的 `SkillDefinitionRecord`，拒绝值按 [S-24](#s-24-表示层拒绝值与判定次序)。
3. **其余每一个普通文件是一条资源**，`path` 是它相对包根的路径（[S-9](#s-9-资源条目与包内路径)）。**不按名字过滤任何文件**，不猜哪些是「附带的杂物」；目录本身不是资源。
4. **符号链接**：解析之后落在包根之外即 `resource_escapes`；解析不了或成环即 `malformed`；落在包根之内的，这条资源的字节就是它指向的那份文件的字节。
   **这一条只有读目录的一方看得见**，由它在解析之后判（`data.asset-model` v1 的 S-24 对承载清单的 `source` 是同一个分工）。
5. **普通文件与目录之外的东西**（套接字、设备文件等）即 `malformed`。
6. **文件系统的执行位不进表示**（[S-10](#s-10-资源只被读取不因读取而运行) 第 3 条）。
7. **目录名不是身份**（[S-6](#s-6-名字与所属能力标识一致)）。

- **路径是包内地址**：包根在宿主机上的哪里，不进本表示，也不产生任何资格（[PF-001 §6.5](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#路径是地址不是钥匙)）。
- **读成的那份值必须是本契约的一个合法值**；读入方怎样把目录与一个能力标识对上（工作区承载清单的一条，或导入器的判断）、读出之后怎样成为持有，**不在本契约**。

## 五、装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展为分布式。

> **本表只列跨部署形态会变或须写明「不变」的保证**——单机由装配（同一存储、同一进程、同一台宿主）顺带给出的那些；
> 右列写分布式后**必须由协议重新兑现什么**，以及**做不到会怎样**。不在表里的条款在任何部署形态下一律成立，**不在表里不等于不适用**。
> **这张表是契约的一部分，不是流程笔记**：装配给的那些，演化到分布式时不会自动成立。

| 保证 | 单机由谁给 | 分布式必须由协议兑现什么 | 做不到会怎样 |
|---|---|---|---|
| **包与它的资源字节属于同一版本、整体不变**（[S-19](#s-19-包是版本内容的一个整体)） | 同一存储里同一份资产版本 | 包与它的资源字节**作为同一版本一起复制、一起送达**；取一份资源**随请求带上版本的指认**，接收方按那一版取 | 读到 v2 的正文，跑的却是 v1 的脚本——**没有任何报错** |
| **正文两条路同一段文字**（[S-8](#s-8-正文逐字不展开不执行)） | 两条路读同一个存储里的同一个成员 | 两条路读**同一版本**的包；跨进程只传 `body` 的值，不传「再解析一次 `SKILL.md`」的指令 | 人敲 ② 型命令看到的与 agent 读到的不是同一段话 |
| **文本形式的读法**（[S-20](#s-20-skillmd-的文本形式与定界)） | 纯函数 | **不变**——任何节点对同一份 `SKILL.md` 读出同一份 `manifest` 与 `body` | —— |
| **目录形式的符号链接判定**（[S-21](#s-21-包的目录形式) 第 4 条） | 读目录的那一方在本机解析 | 由**持有那个目录的那台宿主**解析并判定；判定结果不能由另一台代劳 | 一条在别处看来无害的链接，在持有目录的那台上指到了包外——另一个租户的文件被读成资源 |
| **名字相等**（[S-2](#s-2-技能名的词法)、[S-6](#s-6-名字与所属能力标识一致)） | 值比较 | 不变 | —— |
| **表示层校验在每个接收边界重做**（[S-24](#s-24-表示层拒绝值与判定次序)） | 写入前校验一次 | 每个接收边界各自重验，不信任上游「已校验过」 | 一份非法的包进了存储，此后每一次装配都要面对它 |

## 六、表示与边界校验

### S-22 规范表示

- **规范表示**：[`skill-package.schema.json`](skill-package.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/skill-package/v1/skill-package.schema.json`
- **定义项（5 项）**：`SkillName`、`SkillManifest`、`ResourceEntry`、`SkillDefinitionRecord`、`SkillPackage`。
  消费者 `$ref` 这些定义，**不复制一份同义类型**。**根模式不约束任何文档**：本文件是共享定义的登记处。
- **成员名**：本项目自己的成员一律 camelCase；**清单头的键逐字取开放格式**（`allowed-tools` 带连字符），不改写成 camelCase——改了就不再是那个格式。
- **外部引用**：`MediaType` 取自 `data.content-blocks` v1；`CapabilityName`（`SkillName` 就是它）、`CapabilityId`、`AttributeDeclaration` 取自 `data.asset-model` v1；`DependencyName`、`TargetEnvironment` 取自 `data.tool-definition` v1。
- **文本形式与目录形式不是 JSON**，不在 Schema 的范围内；它们的规则是 [S-20](#s-20-skillmd-的文本形式与定界)、[S-21](#s-21-包的目录形式) 的条款本身。
- **正反实例**：[`examples.md`](examples.md)。它是本版的规范工件，不是说明材料。

### S-23 判别式与枚举闭合

`definition.format`（恒为 `1`）、组合清单里每一项的类别（恒为 `tool`）、清单头的键集合（恰六个）、
设置项声明的 `kind`（恒为 `setting`）与 `category`（三值）、`targetEnvironment` 的 `bindingLayer`（`data.tool-definition` 的四值）各是一个**闭合集合**，没有「其他」。

遇到集合之外的取值**一律作表示非法拒绝**：**不得**映射到「最接近」的已知值、**不得**当作缺省、**不得**忽略该成员继续。

| 枚举 | 静默降级会变成什么 |
|---|---|
| `format` | 一份按未来格式写的定义记录被按 `1` 读，其中新加的约束被当作不存在 |
| 组合清单的类别 | 一份技能「组合」了另一份技能或一个 MCP 接入点，组合图多出产品刻意不做的边 |
| 设置项的 `category` | 一个落点类的项被当成偏好——工作区配得到它 |
| `bindingLayer` | 一个要求隔离的脚本被「最接近」地放进一个更弱的环境 |

### S-24 表示层拒绝值与判定次序

**一个值不合本契约的形状时，拒绝值恰为下面七个之一，集合闭合：**

| 拒绝值 | 什么时候 | 条款 |
|---|---|---|
| `manifest_missing` | 包是一个对象，却没有 `manifest` 成员；目录形式里包根下没有名为 `SKILL.md` 的普通文件 | [S-3](#s-3-技能包的四个部分)、[S-21](#s-21-包的目录形式) |
| `name_mismatch` | 在知道所属能力标识的地方，`manifest.name` 是字符串，却不逐码点等于那个能力标识的 name | [S-6](#s-6-名字与所属能力标识一致) |
| `definition_format_unsupported` | `definition` 是对象、`format` 在，却不等于 `1` | [S-12](#s-12-定义记录) |
| `resource_escapes` | 某条资源的 `path` 是字符串，却以 `/` 或盘符开头、有 `..` 这一段、或含反斜杠；目录形式里一条符号链接解析后落在包根之外 | [S-9](#s-9-资源条目与包内路径)、[S-21](#s-21-包的目录形式) |
| `tool_ref_invalid` | `definition.tools` 的某一项是含字符串 `category` 与字符串 `name` 两个成员（且只有这两个）的对象，但 `category` 不是 `tool`，或 `name` 不合 [S-2](#s-2-技能名的词法) | [S-13](#s-13-组合的工具清单) |
| `binding_layer_unknown` | `targetEnvironment` 那一项的 `default` 是对象、`bindingLayer` 在，却不在四值里——**这是 `data.tool-definition` v1 [S-26](../../tool-definition/v1/contract.md#s-26-表示层拒绝值与判定次序) 的值，原名携带**：同一违例在两份契约里同名（2026-09-24 整批对齐） | [S-15](#s-15-设置项声明与目标环境) |
| `malformed` | 其余一切，恰为下面 M1～M17 | 各条 |

**`malformed` 的来由逐条编为 `M1`～`M17`，这份清单就是它的全部来由**：一份输入不合 Schema 或本契约第三、四节，却对不上前六个值、也对不上下列任何一条，是本契约的缺陷，不是第八个值。

| # | 来由 | 条款 |
|---|---|---|
| **M1** | 包、清单头、定义记录或资源条目不是 JSON 对象 | [S-3](#s-3-技能包的四个部分) |
| **M2** | 缺其余必填成员：`body`、`resources`、`manifest.name`、`manifest.description`、`definition.format`、资源条目的 `path`、设置项声明的 `category`（及 `data.asset-model` 的属性声明本身要求的成员） | 各条 |
| **M3** | 出现未登记的成员：包、定义记录（含 `resident`、`permissions` 这类，[S-12](#s-12-定义记录) 第 5 条、[S-18](#s-18-常驻不在包里)）、资源条目上多出成员（含 `executable` 这类执行位，[S-10](#s-10-资源只被读取不因读取而运行) 第 3 条）；清单头出现六键之外的键 | [S-4](#s-4-清单头开放格式的六个键)、[S-10](#s-10-资源只被读取不因读取而运行)、[S-12](#s-12-定义记录) |
| **M4** | 成员或数组元素的 JSON 类型不对（含 `null`）：`body` 不是字符串、`resources`／`tools`／`dependencies`／`settings` 不是数组、清单头的值类型不对（`metadata` 里有非字符串值） | [S-4](#s-4-清单头开放格式的六个键) |
| **M5** | 清单头的值超出开放格式的约束：`description` 为空或长于 1024 个字符、`compatibility` 为空或长于 500 个字符 | [S-4](#s-4-清单头开放格式的六个键) |
| **M6** | 不知道所属能力标识时，`manifest.name` 不合 [S-2](#s-2-技能名的词法) 的词法 | [S-6](#s-6-名字与所属能力标识一致) |
| **M7** | 资源 `path` 不是规范写法：空串、空段、`.` 这一段、以 `/` 结尾；或恰为 `SKILL.md` 或 `.omne/skill.json` | [S-9](#s-9-资源条目与包内路径) |
| **M8** | 资源 `path` 重复，或一条是另一条的目录前缀 | [S-9](#s-9-资源条目与包内路径) |
| **M9** | `mediaType` 不合 `MediaType` | [S-9](#s-9-资源条目与包内路径) |
| **M10** | `definition.tools` 里某一项不是「只含字符串 `category` 与字符串 `name`」的对象；或有重复项 | [S-13](#s-13-组合的工具清单) |
| **M11** | `definition.dependencies` 里有空串或重复名 | [S-14](#s-14-外部服务依赖) |
| **M12** | 设置项声明违反 [S-15](#s-15-设置项声明与目标环境) 第 1～5 条：`kind` 不是 `setting`、类别是 `governance` 或不在四值里、项名是 `disabled` 或 `usableBy`、项名重复、`default` 不合取值域；或不合 `AttributeDeclaration` 本身的形状 | [S-15](#s-15-设置项声明与目标环境) |
| **M13** | `targetEnvironment` 那一项的类别、取值域或默认值不是 [S-15](#s-15-设置项声明与目标环境) 表里定死的样子（`bindingLayer` 不在四值里的那一种除外，它是 `binding_layer_unknown`） | [S-15](#s-15-设置项声明与目标环境) |
| **M14** | 脚本集合为空，却声明了 `targetEnvironment` | [S-15](#s-15-设置项声明与目标环境) |
| **M15** | `definition.format` 缺席 | [S-12](#s-12-定义记录) |
| **M16** | 文本形式：没有开头行、找不到闭合行、frontmatter 不是 YAML 1.2 的映射、键重复、核心键的值类型不对 | [S-20](#s-20-skillmd-的文本形式与定界) |
| **M17** | 目录形式：符号链接解析不了或成环；有普通文件与目录之外的东西 | [S-21](#s-21-包的目录形式) |

**一份输入里有多处违例时，拒绝值取其中优先级最高的那个**，次序固定：

```text
manifest_missing  >  name_mismatch  >  definition_format_unsupported  >  resource_escapes  >  tool_ref_invalid  >  binding_layer_unknown  >  malformed
```

- **理由**：先问「这是不是一份技能包」（有没有清单头），再问「它是不是它自称的那一份」（名字），再问「本项目的扩展读不读得懂」（格式），
  然后才是包里某一条资源、某一项引用的问题。越靠前越说明这份值在根上不可读。
- **非对象的输入只可能是 `malformed`**（M1）：前六个值的条件都要求一个对象。
- **格式不认得的定义记录，其余成员不再判**：`definition_format_unsupported` 之后，定义记录里的 `tool_ref_invalid`、`binding_layer_unknown` 与 M10～M15 都不再适用。
- **同一个值不同的上下文**：`manifest.name` 不合词法时，知道所属能力标识就是 `name_mismatch`（它必然不等于一个合法的能力标识名），不知道就是 `malformed`（M6）——**输入包含上下文**，同一输入仍是同一答案。
- 拒绝值怎样落进各个操作自己的失败集合（注册表的装载、治理写面的发布、工作区读入、导入），归那些契约；**它们引用本条的名字，不另起一套同义值**。

### S-25 表示层拒绝不是判定，也不修补

- **表示非法的包在进入任何判定之前被拒绝。**这次拒绝**不表示**「这份技能不存在」「这份技能不可用」「这个人无权使用它」，
  也**不得被记成一次判定结果**——与 `data.identity-values/v1` 的 S-33 是同一条规矩。
  尤其**不得折成可用性的「不可用」**：替换件要与原件同形，形状本身不合法的东西没有原件形状可同。
- **不修补、不降级、不尽力而为**：不把非字符串的 `metadata` 值转成字符串（外部导入由导入器先映射，账本 S18-e）、不丢掉资源条目上的执行位、不把大写的类别改成小写、
  不丢掉坏的那一项留下其余的、不把找不到闭合行的 frontmatter 截到某个 `---` 为止。**修补等于替作者做了一个他没做的决定。**
- **唯一的例外有明文**：文本形式里六键之外的键不进表示（[S-5](#s-5-键的四类处置)）——那是 D-034「不生效」的定义本身，**并且必须留痕**。
- **表示合法不表示任何资格**：Schema 校验通过只说明形状合规，不说明这份技能可用、谁有权使用它、它的脚本能不能跑。

### Schema 管得到什么

| 条款 | Schema 管得到吗 | 管不到的那部分归谁 |
|---|---|---|
| [S-2](#s-2-技能名的词法) | **管得到**：`$ref` `data.asset-model` 的 `CapabilityName` | —— |
| [S-3](#s-3-技能包的四个部分)、[S-4](#s-4-清单头开放格式的六个键) | **管得到**：成员集合、必填、六键、长度与值类型 | —— |
| [S-5](#s-5-键的四类处置) | 只管「表示里恰六键」 | 读入时丢掉了哪些键、留什么痕——读入方 |
| [S-6](#s-6-名字与所属能力标识一致) | **管不到**：要看所属能力标识 | 知道能力标识的那一方（资产写面、工作区读入、导入器） |
| [S-7](#s-7-说明)、[S-8](#s-8-正文逐字不展开不执行) | 只管 `description` 长度、`body` 是字符串 | 「两条路同一段文字」「不展开不执行」——读正文、送正文的每一方 |
| [S-9](#s-9-资源条目与包内路径) | 管单条 `path` 的写法、不是 `SKILL.md` | **路径互不相同、互不为前缀**——接收边界 |
| [S-10](#s-10-资源只被读取不因读取而运行)、[S-11](#s-11-脚本集合) | 管资源条目上没有执行位成员 | 「读取不运行」「只跑脚本集合」——`Skills()` 与执行运行时 |
| [S-12](#s-12-定义记录)～[S-14](#s-14-外部服务依赖) | **管得到**：`format`、成员集合、类别恒为 `tool`、名字词法、不重复 | 「不是资源、读面不列它」——`Skills()`；组合图成环——装配 |
| [S-15](#s-15-设置项声明与目标环境) | 管 `kind`、类别不是治理、项名不是 `disabled` 与 `usableBy`、`targetEnvironment` 定死的样子、**没有脚本不得声明它** | **项名互不相同、`default` 合取值域**——接收边界 |
| [S-16](#s-16-由包得出的依赖声明)、[S-17](#s-17-属性项投影规则) | **管不到**——它们是派生 | 注册表、求值 |
| [S-18](#s-18-常驻不在包里) | **管得到**：定义记录不收 `resident` | —— |
| [S-19](#s-19-包是版本内容的一个整体) | **管不到** | 存储与持有资源字节的一方 |
| [S-20](#s-20-skillmd-的文本形式与定界)、[S-21](#s-21-包的目录形式) | **不在 Schema 的范围内** | 读入方按条款兑现 |

**非法输入的含义**：Schema 校验失败 ⇒ 该输入**不是**本契约的一个值 ⇒ 按 [S-24](#s-24-表示层拒绝值与判定次序) 取拒绝值、按 [S-25](#s-25-表示层拒绝不是判定也不修补) 收场。
**Schema 通过也可能仍然非法**——上表「管不到」那一列里属于形状的那些，由接收边界的校验兑现。

## 七、性质与场景

### 性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | 技能的身份只在能力标识；清单头的名字与之相等 | 不变量 | [PF-002 §4 Skill](../../../../product/PF-002-assets-settings-and-permissions/design.md#skill) | 知道能力标识的接收边界（[S-6](#s-6-名字与所属能力标识一致)） | 改了文件里的 `name` 之后被当成另一份技能，或两份名字不同的记录被当成同一个东西 |
| P-2 | 正文逐字：两条路同一段文字，不展开、不执行 | 安全 | [PF-002 §4 Skill、Slash Command](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) · [PF-007 §6.2](../../../../product/PF-007-meta-capabilities/design.md#62-skills通向任意技能) | 读正文、送正文的每一方（[S-8](#s-8-正文逐字不展开不执行)）＋ 定界规则（[S-20](#s-20-skillmd-的文本形式与定界)） | 读正文时跑了一段 shell；或 ② 型展开与 `read` 读到的文字不同 |
| P-3 | 包的表示不携带执行资格；只有脚本集合里的资源可能被运行 | 安全 | [PF-007 §6.2](../../../../product/PF-007-meta-capabilities/design.md#62-skills通向任意技能) | Schema（资源条目没有执行位成员）＋ `exec_script` 的契约（[S-10](#s-10-资源只被读取不因读取而运行)、[S-11](#s-11-脚本集合)） | 一份 `references/` 下的文件被 `exec_script` 跑了；或导入的包带着「可以跑」的声明 |
| P-4 | 资源路径字面上不出包；目录形式解析后也不出包 | 安全 | PF-007 §6.2（资源不在 agent 的文件系统视野里） | 接收边界（[S-9](#s-9-资源条目与包内路径)）＋ 读目录的一方（[S-21](#s-21-包的目录形式)） | 一份技能把宿主机上别处的文件（可能是另一个租户的）读成自己的资源 |
| P-5 | 技能只组合工具；引用指向能力标识 | 不变量 | [PF-002 谁能组合谁](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁) · [§6.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识) | Schema（[S-13](#s-13-组合的工具清单)） | 组合图里出现技能 → 技能或技能 → MCP 的边 |
| P-6 | 调用面开关、预批准、常驻不在内容里，也不从内容生效 | 安全 | [PF-003 §6.7](../../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动) · [PF-006 §4 常驻](../../../../product/PF-006-tools-and-skills/design.md#常驻) · D-034 | 读入方（[S-5](#s-5-键的四类处置)）＋ Schema（[S-18](#s-18-常驻不在包里)） | 复制过去的技能自带「不用问就能跑某个工具」；或技能作者决定了它在别人 agent 里常不常驻 |
| P-7 | 目标环境是落点与身份类，作者改不了；没有脚本不得声明 | 安全 | [PF-002 §5.2 设置项分四类](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别) · [PF-006 §6.4](../../../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析) | Schema（[S-15](#s-15-设置项声明与目标环境)） | 工作区配到了某份技能的脚本落点 |
| P-8 | 依赖声明只由组合清单、外部服务依赖与求值后的目标环境组成 | 不变量 | [PF-006 §4 依赖](../../../../product/PF-006-tools-and-skills/design.md#依赖) · [§6.4](../../../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析) | 注册表按 [S-16](#s-16-由包得出的依赖声明) 计算 | `compatibility` 或 `allowed-tools` 让一份技能被判不可用 |
| P-9 | 属性项由包确定地推出；「谁可以使用它」是 `data.asset-model` 保留的 `usableBy`、不由作者声明 | 不变量 | [PF-002 §5.2 三方分工](../../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值) · D-034 | 推出规则（[S-17](#s-17-属性项投影规则)） | 设置页长出来的表单与包对不上；或某份技能没有使用权限这一项 |
| P-10 | 包整体属于一份版本；资源字节随版本不变 | 不变量 | `data.asset-model` v1 S-9 | 存储与持有资源字节的一方（[S-19](#s-19-包是版本内容的一个整体)） | 同一版本号前后两次读到不同的脚本 |
| P-11 | 缺席不补、表示非法即拒、拒绝值唯一 | 安全 | SYS-SPEC | 每个接收边界（[S-24](#s-24-表示层拒绝值与判定次序)、[S-25](#s-25-表示层拒绝不是判定也不修补)） | 两个实现对同一份坏包报不同的拒绝值；或一份坏包被装成替换件 |

**进展性质：本契约不拥有任何进展性质。**值不会「最终成为」别的值；可用性重算、装载与 reload 归注册表与运行时。

**不建形式工件。**本契约没有状态转移；它的结构约束由 Schema 的条件与条款直接表达，唯一的跨对象约束（组合图不得成环）要看别的资产，归装配。
在这里建模型只会产出一份与 Schema 同义的平行工件。它触发的义务是 Schema 正反实例校验、接收边界校验、文本形式的规则用例、规范场景与静态检查，登记在[验证入口](../verification.md)。

### 规范场景

场景是本契约触发的证据形式；执行状态与结果在[验证入口](../verification.md)，不写进本版本目录。
每条给一个**正例**与一个**反例**，实例在 [`examples.md`](examples.md)。

#### S-26 名字对不上即拒

正例：能力标识 `{category: skill, name: code-review}` 的记录，草稿的包 `manifest.name` 为 `code-review`——收下。
反例：同一份记录，某一版的包 `manifest.name` 为 `Code-Review`——**`name_mismatch`**，**不被折成相等**（区分大小写），也**不被改写成 `code-review` 后收下**。

#### S-27 正文逐字

正例：`SKILL.md` 的 frontmatter 里有 `description: see a---b here`，闭合行之后是 `\n# Review\nRun $ARGUMENTS\n`——
`manifest.description` 是 `see a---b here`，`body` 是 `\n# Review\nRun $ARGUMENTS\n`（开头的空行保留，`$ARGUMENTS` 原样）。
反例一：一个实现把 `description` 截成 `see a`——违反 [S-20](#s-20-skillmd-的文本形式与定界) 第 3 条。反例二：一个实现交出 `# Review\nRun review.md` 或裁掉开头空行——违反 [S-8](#s-8-正文逐字不展开不执行)。
**两个反例都必须观察读出的值本身**，只看「解析成功」会全过。

#### S-28 资源路径不出包

正例：`references/checklist.md`、`scripts/extract.py` 被接受。
反例：`../other-skill/SKILL.md`、`/etc/passwd`、`C:/x`、`scripts\\run.py`——一律 **`resource_escapes`**；`scripts//run.py`、`./a.md`、`a/`——**`malformed`**（写法不规范，不是逃逸）。
目录形式另一个反例：`references/shared` 是一条指向包根上一级的符号链接——**`resource_escapes`**，由读目录的一方在解析之后判。

#### S-29 组合清单只收工具

正例：`tools: [{category: tool, name: read_file}, {category: tool, name: run_tests}]` 被接受。
反例：`[{category: skill, name: style-guide}]`、`[{category: mcp, name: github}]`——**`tool_ref_invalid`**；`[{category: tool, name: "a/b"}]`——同样 **`tool_ref_invalid`**。

#### S-30 定义记录的格式不认得即拒，且先于其余

正例：`{format: 1, tools: [...]}` 被接受。
反例：`{format: 2, tools: [{category: skill, name: x}]}`——**`definition_format_unsupported`**，**不是** `tool_ref_invalid`：格式不认得，其余成员不再判。

#### S-31 常驻与预批准不从内容生效

正例：`SKILL.md` frontmatter 带 `allowed-tools: Bash(git:*) Read` 与 `user-invocable: false`——包被收下；
`manifest` 含 `allowed-tools`（原样）、不含 `user-invocable`；读入方的痕迹里有 `user-invocable`（外部属性类）；**任何一次放行判断都不因 `allowed-tools` 而少问一次**，这份技能的使用权限也不因 `user-invocable` 而变。
反例：定义记录写 `{format: 1, resident: true}`——**`malformed`**（M3）。
**这条正例必须观察放行判断的实际结果**：只看包被收下，看不出 `allowed-tools` 有没有被当成预批准。

### 消费者核对场景

> 格式：**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z。**任一条走不通，缺口在本契约；停在一个已登记的缺口不算走不通，如实记为「本版到此为止」。

#### CS-1 资产模型收一份技能

`data.asset-model` v1 在**skill 类正文的壳 `$ref` 本契约**时（它的 [S-10](../../asset-model/v1/contract.md#s-10-八类正文的外壳)），依赖 [S-3](#s-3-技能包的四个部分)、[S-6](#s-6-名字与所属能力标识一致)、[S-19](#s-19-包是版本内容的一个整体)，得到：
一份技能记录的草稿与每一版的内容都是一个 `SkillPackage`；每一份的 `manifest.name` 等于记录的 `capability.name`，不等时那边原名携带 `name_mismatch`；包整体随版本不变。

#### CS-2 注册表装一份技能并算它可不可用

`capability.asset-registry` 在**会话装配、把一份技能装进技能那张表、每次 run 开始前重算可用性**时，依赖 [S-6](#s-6-名字与所属能力标识一致)、[S-7](#s-7-说明)、[S-16](#s-16-由包得出的依赖声明)，得到：
条目的名字与说明；一串依赖名——每个组合的工具一项、每个外部服务一项、求值后的目标环境一项。缺一项就不可用，装同名替换件、只换说明。
**目标环境的匹配语义停在 `data.tool-definition` 的缺口 G-5**——停在缺口不算走不通。

#### CS-3 `Skills().read` 读一份技能

`Skills()` 的契约在**agent 读一份技能的正文、再取其中一份参考文件**时，依赖 [S-8](#s-8-正文逐字不展开不执行)、[S-9](#s-9-资源条目与包内路径)、[S-10](#s-10-资源只被读取不因读取而运行)、[S-12](#s-12-定义记录)，得到：
正文就是 `body`，原样；资源按（这一版，`path`）取，列举资源时只列 `resources`、不列定义记录；**读取不运行任何东西**。

#### CS-4 `Skills().exec_script` 跑一个脚本

`Skills()` 的契约与工具执行运行时在**agent 要跑 `scripts/extract.py`**时，依赖 [S-11](#s-11-脚本集合)、[S-15](#s-15-设置项声明与目标环境)、[S-17](#s-17-属性项投影规则)，得到：
这个路径在脚本集合里；落点要求是求值后的目标环境（没声明即没有特殊要求）。**「这个人能不能用这份技能」按 `data.asset-model` 的 `usableBy` 求值**；`self` 在求值里指谁停在 `capability.asset-evaluation` 的 G-15——判不出来时**不得当成可以**。
要跑 `references/helper.py`：不在脚本集合里，**一概不能**。

#### CS-5 ② 型斜杠命令展开一份技能

斜杠命令的契约在**人敲一条绑定了某份技能的命令并附几句话**时，依赖 [S-8](#s-8-正文逐字不展开不执行)，得到：
用户消息里一个文本块，`text` 就是那一版的 `body`，逐字、不展开，来源标记 `skill_body`（`data.content-blocks` v1 S-8）；附言另成一块。那份技能自己的「谁可以使用它」（`usableBy`）照样要过。

#### CS-6 工作区读入目录里的一份技能

`capability.asset-evaluation` 在**装配时读 `.omne/workspace.json`、其中一条 `assets` 指向 `skills/review` 这个目录**时，依赖 [S-21](#s-21-包的目录形式)、[S-20](#s-20-skillmd-的文本形式与定界)、[S-5](#s-5-键的四类处置)、[S-6](#s-6-名字与所属能力标识一致)，得到：
一份合法的 `SkillPackage`，`manifest.name` 等于那一条的能力标识；六键之外的键不生效、留痕；符号链接不出包。
定义记录从 `.omne/skill.json` 读（[S-21](#s-21-包的目录形式)），其余每个文件都是资源；它在这一格成为一份 `carrier` 支的持有（`data.asset-model` v1 的 [S-19](../../asset-model/v1/contract.md#s-19-使用权来路)）。

#### CS-7 属性项投影长出设置页

`capability.asset-evaluation` 在**第 3 步为一份持有推出这份技能的属性项**时，依赖 [S-17](#s-17-属性项投影规则)、[S-15](#s-15-设置项声明与目标环境)，得到：
定义记录里的每一项设置（含 `targetEnvironment`，落点与身份类，工作区配不了），再加 `data.asset-model` 保留的 `disabled` 与 `usableBy`。
作者自声明的设置项长出了表单，**但本版没有谁读它们的生效值——停在 [G-4](#九已知缺口)**。

#### CS-8 复制一份技能到另一个组织

`capability.asset-transfer` 在**首次复制与重复复制一份技能**时，依赖 [S-19](#s-19-包是版本内容的一个整体)，得到：
目标侧那一版的内容是整份包——清单头、正文、定义记录、资源条目与资源字节一起；目标组织为它配的值不动。
**资源字节怎样随版本送到目标侧、怎样核对——停在 [G-6](#九已知缺口)**。

## 八、缺席怎么收

**本契约没有操作，因此没有提交点、没有幂等边界、没有事件。**下面写的是值层面的缺席各自是什么意思：

| 缺席的是什么 | 意思 | 条款 |
|---|---|---|
| `manifest` | **拒绝**（`manifest_missing`） | [S-24](#s-24-表示层拒绝值与判定次序) |
| `body`、`resources` | **拒绝**（`malformed`，M2）——**空串、空数组才是「没有」**，缺席不补 | [S-3](#s-3-技能包的四个部分) |
| `manifest.name`、`manifest.description` | **拒绝**（`malformed`，M2） | [S-4](#s-4-清单头开放格式的六个键) |
| `license`、`compatibility`、`metadata`、`allowed-tools` | **合法**：作者没写 | [S-4](#s-4-清单头开放格式的六个键) |
| `definition` | **合法**：不组合工具、不声明外部服务依赖、不声明设置项 | [S-12](#s-12-定义记录) |
| `definition.format` | **拒绝**（`malformed`，M15） | [S-12](#s-12-定义记录) |
| `tools`、`dependencies`、`settings` | **合法**，与空数组同义 | [S-13](#s-13-组合的工具清单)～[S-15](#s-15-设置项声明与目标环境) |
| `targetEnvironment` 这一项 | **合法**：对执行环境没有特殊要求；这份技能没有这一项设置 | [S-15](#s-15-设置项声明与目标环境) |
| 资源条目的 `mediaType` | **合法**，不作任何断言 | [S-9](#s-9-资源条目与包内路径) |
| 设置项声明的 `category` | **拒绝**（`malformed`，M2）——资产声明每一项设置时必须标类别 | [S-15](#s-15-设置项声明与目标环境) |
| 目录形式里的 `SKILL.md` | **拒绝**（`manifest_missing`） | [S-21](#s-21-包的目录形式) |
| 目录形式里的 `.omne/skill.json` | **合法**：没有定义记录，与 `definition` 缺席同义 | [S-21](#s-21-包的目录形式) |
| 「谁可以使用它」那一项的声明 | **不在本契约**：`data.asset-model` 写死，每一份技能都有 | [S-17](#s-17-属性项投影规则) |

**本契约不定义任何恢复动作，也不承诺任何外部效果可逆。**

## 九、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决；消费者读到这里应当知道**哪里在等裁决**，而不是照着一个猜测实施。

| # | 缺口 | 阻断谁 | 谁来裁 |
|---|---|---|---|
| **G-1** | **已闭合（2026-09-24 整批对齐）**：定义记录的保留路径是 `.omne/skill.json`——主线裁定 2026-09-23，待产品负责人确认（账本 S18-b）；见 [S-12](#s-12-定义记录)、[S-21](#s-21-包的目录形式) | — | — |
| **G-2** | **已闭合（2026-09-24 整批对齐）**：「谁可以使用它」是 `data.asset-model` v1 保留的 `usableBy`（项名、取值域 `superAdministrator`／`member`／`self`、默认 `self`，三类共用一份）——主线裁定 2026-09-23，待产品负责人确认（账本 S18-c、A-G14）；见 [S-17](#s-17-属性项投影规则)。`self` 在求值里指谁归 `capability.asset-evaluation`（它的 G-15） | — | — |
| **G-3** | **「正文变体」与「资源的取用方式」**：[PF-002 §4 Skill](../../../../product/PF-002-assets-settings-and-permissions/design.md#skill) 列为技能自带的设置，§5.2 把前者归偏好、后者归绑定；但产品正文没说它们是什么——多份正文放在包的哪里、按什么选；资源取用方式取哪几种值、改变什么。三个参考源都没有正文变体（研究首轮） | 这两项作为系统认得的设置；`Skills().read` 按设置选正文 | **PF-002 的 owner**（含义），随后**主线**（形状，本契约出新版） |
| **G-4** | **作者自声明设置项的生效值由谁读**：`Skills().read` 是否把生效值一并交给 agent、脚本是否收到它们、什么时候读——都没有定义 | 作者自声明的设置项在本版不起任何作用（CS-7） | **PF-007 的 owner**（`Skills()` 的产品面），随后 `Skills()` 的契约 |
| **G-5** | **已闭合（2026-09-24 整批对齐）**：作者自定义的权限项本版不收——主线裁定 2026-09-23 采纳（账本 S18-a），待产品负责人确认 | — | — |
| **G-6** | **资源字节的携带与核对**：本表示不内联资源字节、不带摘要（账本的 `ResourceEntry` 没有这两样）；D-034 要的「规范化摘要覆盖整个包」本版没有表示。版本的不可变对字节由持有它们的一方兑现，跨进程与复制时字节怎样随版本走、接收方怎样核对是同一份，没有契约面 | 复制与分享落地（CS-8）；据点副本；[第五节](#五装配给与协议给)第一行的协议 | **主线**（形状：逐资源摘要，或整包摘要）；搬运归 `capability.asset-transfer` 与提供者设计 |
| **G-7** | **研究盘点里本版未收的扩展**：omne-next 的导入来源记录（`ImportProvenance`）与 `omne_agent_capabilities` 聚合根字段（安装方式、上游同步、发布策略、`agent_editable`）；Codex 的 `interface`（显示名、图标、品牌色、`default_prompt`）、`policy`、`dependencies.tools[]`；逐资源 `sha256` 摘要（并入 G-6）。**产品正文没有要求它们**，按起草简报只收产品正文要求的 | 需要这些能力的消费者（导入来源追溯、交付面的图标与显示名） | **主线**（要不要收、收进内容还是资产属性）；导入来源记录多半归**导入器的提供者设计** |

## 十、明确不承诺

**以下都不在本契约内，消费者不得从本契约推出它们：**

- **加载、取用与可用性**：技能怎样被装进会话、reload、可用性什么时候重算、替换件怎样造——归注册表与运行时。
- **`Skills()` 的三个命令**的输入、返回与失败；脚本在哪个执行环境落地、谁放行、失败怎样收场——归 PF-007 §6.2 的契约、工具执行运行时与放行判断。
- **持有、配值与求值**：谁持有这份技能、各层配了什么、生效值是什么、「谁可以使用它」怎样判——归 `capability.asset-governance` 与 `capability.asset-evaluation`。
- **组合图不得成环、组合不转移所有权**的检查——归装配。
- **目标环境的匹配语义**——沿 `data.tool-definition` 的缺口 G-5。
- **外部技能目录的导入映射**：外部属性类与未知键怎样报告给导入者、`when_to_use` 要不要并进说明、同基名撞车怎样检出、外部生态里不合开放格式的值（如 `metadata` 里的非字符串值）怎样处置——归导入器的提供者设计；它产出的必须是本契约的一个合法值。
- **读入时丢掉的键、符号链接判定的痕迹**的形状——归读入方。
- **资源字节**的存储、加密、去重与取回——归提供者设计。
- **路径的 Unicode 规范化与大小写不敏感文件系统上的撞名**：本契约的路径逐码点比较；目录形式在这类文件系统上读不出两个只差大小写的资源，归读入方与提供者。
- **体积上限**：包、正文、资源个数与大小本版不设；若将来要设，它是一个具名的政策参数，由消费者的契约定。
- **agent 创建与修改技能**（[PF-006 §6.9](../../../../product/PF-006-tools-and-skills/design.md#69-agent-创建与修改工具技能本版只定三条)）的授权与归属——归治理写面；造出来的包照样须是本契约的合法值。
- **不承诺任何已执行的验证。**证据义务与状态在[验证入口](../verification.md)；Schema 与实例文件存在不表示形状已被校验过。

## 十一、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移；`registry/lineage.json` 不因本契约增加条目。
起点见 [D-034](../../../../record/decisions/skill-spec-adoption/decision.md)：以开放格式 `69ef37e` 为载体与核心字段，规则层自持。

**本版的规范工件**：本文件、[`skill-package.schema.json`](skill-package.schema.json)、[`examples.md`](examples.md)。

**不建 `formal/`**：理由在[性质一节](#性质)末尾。**这不是把义务省掉**：本契约触发的义务在[验证入口](../verification.md)逐条登记。

**发布后**：本目录下的规范正文、Schema 与实例不可原地覆盖；修改发布新版本。
[已知缺口](#九已知缺口)里 G-3、G-6 任一项被裁决都会改变本契约的表示（G-1、G-2、G-5 已于 2026-09-24 整批对齐原地闭合），
**接受之前闭合则原地改，接受之后闭合则出 v2**。开放格式的新快照要进来，同样出新版。**推荐版本不自动升级消费者。**
