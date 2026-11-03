# Skill领域交接设计

状态：技术草案，未获技术接受。已接受职责沿[领域入口](README.md)，本页只维护事实拥有者和跨领域交接。端口、服务与成员都是候选，尚未实现。工程细化见[组工程设计](../../../packages/skills/docs/architecture.md)。成员状态见[组入口](../../../packages/skills/README.md#成员与依赖)：部分成员只有模板草稿，具名文档目标尚非 workspace 成员。

## 责任与消费者

Skill 维护方法专有的材料、发现与读取规则、来源，以及脚本声明与包字节。资产定义和版本存在，不意味着方法已选入或本次有权读取；读取存在，不意味着消费者已经采用或脚本已经执行。独立能力按明确输入交付材料和来源。认识调用方体系的那一层归集成方，由它把这些交给真正拥有采用、消息和执行的消费者。

| 责任 | 事实拥有者 | 交接及拒绝边界 |
|---|---|---|
| 名称、说明、正文、资源、依赖、脚本与设置声明 | 方法定义；内容/资产版本复用资产拥有者 | 给发现、读取、装配及脚本执行一方一份可校验材料，不能凭目录成为有效资产 |
| 当前持有、合法选择、配值与禁用 | [资产与规则](../assets-and-rules/README.md)、[身份与授权](../identity-and-authorization/README.md) | Skill 消费判断依据；不重做层级求值或凭文本放宽资格。Skill 只交设置声明（名字、类别），不交设置值，也不按用途核验 |
| 工作区候选来源和实例关联 | [工作区](../workspaces/README.md) | 明确选择和当前来源读取权允许读取；候选校验后才由装配采用。来源怎样发现候选包归工作区 |
| 已知身份、引用常驻、依赖采用与换代 | [装配与交接](../assembly-and-handoff/README.md)、运行方 | Skill 给定义和依赖声明，装配保护一致采用；依赖在不在场、方法此刻能不能用由集成方判定，Skill 不判定；合法新方法经显式增量装载后可用，不改 Agent Definition、不因增加能力重建 runtime。常驻由装配决定，Skill 不按常驻筛选 |
| 方法创作、提交归属和组织提升 | 创作入口、资产、身份与授权拥有者；组织提升由用户执行 | 创建/修改须授权，产物按实际提交位置属工作区或租户；Agent 不直接产出组织资产或代用户提升，Skill 不设计完整创作或提升流程 |
| 发现、正文与指定资源读取 | 方法取用责任 | 给获准消费者真实内容及来源，错误/缺失/未知可区分 |
| 工具 read 的结果及原消费位置 | [工具执行](../tool-execution/README.md)、[Agent 推进](../agent-progression/README.md)宿主里的结果接收方 | 原工具调用可靠承接，不把方法知识全部归入执行账 |
| 命令绑定、展开和用户消息受理 | [Slash Command](../slash-commands/README.md)、消息接入 | Skill 只提供本次合法材料；其余归邻域 |
| 实际上下文与固定模型请求 | [Runtime Context](../runtime-context/README.md)、请求组装 | 保留实际内容和采用依据；方法更新不重写旧请求。常驻概览怎样进入提示词归集成方，Skill 只交摘要数据 |
| 脚本准入、实际执行及效果 | 原工具调用、[执行环境](../execution-environments/README.md) | Skill 只交脚本声明、包字节与脚本身份（能力标识加入口的包内路径）。准入、执行环境、进程、结果与控制归工具与执行环境；Skill 不造 runtime |
| MCP 对端及动作 | [MCP](../mcp/README.md) | MCP 动作不作为 Skill 组合资产；服务依赖不授予对端执行许可 |

## 端口与实现方

Skill 作为需求方声明下列端口，用自己的词说明需要什么。实现方是集成方，Skill 不认识实现方。本表是领域页对跨领域交接的记录。端口形状与失败映射见[组工程设计「端口」](../../../packages/skills/docs/architecture.md#端口)。依据层：架构[外域概念的进入方式](../../architecture/layers-and-dependencies.md#外域概念的进入方式)；成员文档[三处各自拥有的知识](../../member-documentation.md#三处各自拥有的知识)。

| 端口 | 回答的问题 | 实现方 | 交接与失败边界 |
|---|---|---|---|
| `SkillPackageSource`（[Skill 包来源](../../../.meta_harness/design/ubiquitous_language/terms/grounding-and-isolation.md#ul-package-source--skill-包来源--skill-package-source)） | 按包定位与内容摘要交出 Skill 包的字节 | 本机目录：`skill-host-local` 的 `DirectorySource`，目录位置与参与条件由[工作区](../workspaces/README.md)给出。云端内容存储：存储能力组，存储契约尚不存在 | 只交字节与Skill 包快照，不判定用哪一份、谁能读。Skill 包快照带包根目录名，Skill 检查时用它核对 name。来源不可达与「没有候选」分开。来源分开报告六种失败：按包定位找不到包、包里没有该条目、交出的字节与条目内容摘要不符、条目落在包根之外、来源此刻不可达、条目不可读。取快照时，来源遇到设备、管道、套接字，或无法解析、成环的链接，答条目不可读（`entry-unreadable`）。遇到解析后落在包根之外的包内链接，答落在包根之外（`outside-package`），有这种链接的包整包不可读。Skill 先取快照，比较Skill 包快照的内容摘要与所钉材料的内容摘要。不符时，带Skill 材料依据报旧材料已不在，不带Skill 材料依据报已采用材料已变。Skill 再读条目字节，按条目内容摘要核对，不符时报版本已变，不交新内容 |
| `SkillResolution` | 这个能力标识此刻对这个主体合法对应哪一份材料 | 会话路径：[装配与交接](../assembly-and-handoff/README.md)，按采用依据实现，掌握已知集合。独立路径：[资产与规则](../assets-and-rules/README.md)的求值 | Skill 不重做层级求值。实现方按下列次序答复：先判身份是否合法已知但此刻不可用，是就交原因与最后合法的 name、说明，带不带Skill 材料依据都一样。再判身份是否合法对应一份材料，是就交 `SkillRef` 与资产正文的声明投影。Skill 交来调用方的Skill 材料依据时，实现方只在身份合法对应之后核对依据所指的版本是不是该主体在此作用域可读的该能力的合法版本。依据不带资产版本（工作区来源）时，实现方按能力标识与来源层核对，字节由内容摘要钉住。合法就给出指向该材料的 `SkillRef`，不合法就答依据不合法。身份没有对应时答确定没有。无法判定时答无法判定。包定位总是由实现方当场给出，不取自调用方。资产版本不合 Skill 的资产版本词法时，Skill 无法表示这份材料，实现方答「合法已知但不可用」（`known-unavailable`），原因是资产版本不可表示。没有已知集合的实现方不答「合法已知但不可用」，所以独立路径通常不出现替换件。当前合法集合为空时答空集合，这不是失败。集合修订号留在实现方一侧，不进入 Skill 的契约。对无权主体，答复不得随该身份是否存在而变，由 Skill 的 `./testing` 符合性套件核对。会话路径要求采用依据记下 Skill 包快照的内容摘要，这是具名剩余义务，见[剩余义务](#剩余义务) |
| `SkillReadCheck` | 这个主体此刻能不能读这个能力标识 | [身份与授权](../identity-and-authorization/README.md)，结合资产的持有与选入 | 只按能力标识判定，不需要 `SkillRef`。答复是准许、拒绝或无法判定。对无权主体，答复不得随该身份是否存在而变，由 Skill 的 `./testing` 符合性套件核对。每次操作现场核验，不缓存。摘要与检索对每个身份也先问它。撤权在下一次操作生效 |

资产保存的 Skill 正文带Skill 包快照的内容摘要，由 Skill 的 `projectAssetBody` 写入。包字节由Skill 包来源交出。旧正文没有这一内容摘要时，Skill 只交描述，不交Skill 材料依据，读取与导出返回不支持。正文形状见[组工程设计「资产正文与 Skill 包」](../../../packages/skills/docs/architecture.md#资产正文与-skill-包)。

### 公开服务的消费方

本表只写哪个邻域消费哪个服务、Skill 交出什么。消费方怎样把交出的数据接入自己的体系，归它的集成方，不在本页。

| 服务 | 消费方 | 交给消费方什么 |
|---|---|---|
| `PackageInspection` | 资产的候选校验、工作区扫描 | 一份解析后的定义（清单、声明与Skill 包快照的条目和内容摘要，不含正文），或可辨的拒绝原因，或来源不可达、版本已变。正文只经 `SkillAccess` 读取 |
| `SkillCatalog` | [Runtime Context](../runtime-context/README.md)、[工具执行](../tool-execution/README.md)，都经各自的集成方 | 当前合法集合内、该主体可读的身份的摘要：能力标识、name、说明，合法对应材料的身份另带依赖声明，合法已知但不可用的身份另带替换件原因。不可读的身份不出现。读取权无法判定时返回 `unknown`。排序、集合修订与呈现归消费方 |
| `SkillAccess` | [工具执行](../tool-execution/README.md)、[Slash Command](../slash-commands/README.md)、独立程序，都经各自的集成方 | 描述（含依赖、脚本与设置声明）、内容、资源条目、按Skill 材料依据导出的全部条目，以及Skill 材料依据。Skill 材料依据含能力标识、来源层、资产版本与内容摘要，不含包定位，也不授予访问。工作区来源的Skill 材料依据可以不带资产版本。资产正文缺Skill 包快照的内容摘要时，描述不带Skill 材料依据，并标明「没有可读的包」。内容交出后归消费方 |

### 组合保证由谁承担

| 组合保证 | 承担者 | 参与方 | 失败归属 |
|---|---|---|---|
| 一次读取或导出对应一份Skill 包快照，不拼版本 | Skill 的 `SkillAccess` | Skill 包来源 | Skill 返回 `version-changed`、`basis-unavailable` 或 `adopted-material-changed`，不交新内容，也不交部分包 |
| 每次操作核验当前读取权 | Skill 的 `SkillAccess` 与 `SkillCatalog` 编排 | `SkillReadCheck`、`SkillResolution` 的实现方 | 实现方拥有答案。Skill 先问 `SkillReadCheck`，再问 `SkillResolution`。调用方带回的Skill 材料依据也交 `SkillResolution` 核对。无法判定时 Skill 返回 `unknown` |
| 读取内容的可靠承接 | 原工具调用、命令与入站消费者、Context | Skill 交出内容与Skill 材料依据 | 承接方。Skill 不做临时保管 |
| 脚本的发起、执行与结果 | 原工具调用 | 执行环境。Skill 只交脚本声明、包字节与脚本身份，不参与执行 | 工具与执行环境 |

## 剩余义务

| 剩余义务 | 拥有者 | 未兑现时的结果 |
|---|---|---|
| KL-9：会话路径上，采用依据记下 Skill 包快照的内容摘要，使 `SkillResolution` 交出的 `SkillRef` 带内容摘要 | [装配与交接](../assembly-and-handoff/README.md)，见[采用协调 KL-9](../assembly-and-handoff/adoption-coordination.md#5-已知限制与剩余) | 会话路径上，Skill 的描述不带Skill 材料依据，读取、列出与导出返回不支持 |

## 承接缺口

三份完整行为候选的[精确行为契约仍待正式成员承接](../../../packages/skills/docs/architecture.md#完整行为候选的正式承接缺口)。责任分解不决定包、插件、进程、数据库或部署数量。方法与资源取用保护材料和读取权，内容采用与更新保护跨消费者交接，脚本执行保护执行范围与原工具责任，后两项不归 Skill 成员。整体性质不能由单方承担时，明确组合协调者和双方承接条件，不把“都调用成功”视作系统成功。
