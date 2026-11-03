# Skill领域交接设计

状态：技术草案，未获技术接受。已接受职责沿[领域入口](README.md)，本页只维护事实拥有者和跨领域交接。端口、服务与成员都是候选，尚未实现。工程细化见[组工程设计](../../../packages/skills/docs/architecture.md)，具名文档目标尚非 workspace 成员。

## 责任与消费者

Skill 维护方法专有的材料、发现与读取规则、来源及脚本桥接。资产定义和版本存在，不意味着方法已选入或本次有权读取；读取存在，不意味着消费者已经采用或脚本已经执行。独立能力按明确输入交付材料和来源，系统适配把它们交给真正拥有采用、消息和执行的消费者。

| 责任 | 事实拥有者 | 交接及拒绝边界 |
|---|---|---|
| 名称、说明、正文、资源与依赖声明 | 方法定义；内容/资产版本复用资产拥有者 | 给发现、读取、装配及桥接一份可校验材料，不能凭目录成为有效资产 |
| 当前持有、合法选择、配值与禁用 | [资产与规则](../assets-and-rules/README.md)、[身份与授权](../identity-and-authorization/README.md) | Skill 消费判断依据；不重做层级求值或凭文本放宽资格 |
| 工作区候选来源和实例关联 | [工作区](../workspaces/README.md) | 明确选择和当前来源读取资格允许读取；候选校验后才由装配采用 |
| 已知身份、引用常驻、依赖采用与换代 | [装配与交接](../assembly-and-handoff/README.md)、运行方 | Skill 给定义和依赖事实，装配保护一致采用；合法新方法经显式增量装载后可用，不改 Agent Definition、不因增加能力重建 runtime |
| 方法创作、提交归属和组织提升 | 创作入口、资产、身份与授权拥有者；组织提升由用户执行 | 创建/修改须授权，产物按实际提交位置属工作区或租户；Agent 不直接产出组织资产或代用户提升，Skill 不设计完整创作或提升流程 |
| 发现、正文与指定资源读取 | 方法取用责任 | 给获准消费者真实内容及来源，错误/缺失/未知可区分 |
| 工具 read 的结果及原消费位置 | [工具执行](../tool-execution/README.md)、[Agent 推进](../agent-progression/README.md)宿主里的结果接收方 | 原工具调用可靠承接，不把方法知识全部归入执行账 |
| 命令绑定、展开和用户消息受理 | [Slash Command](../slash-commands/README.md)、消息接入 | Skill 只提供本次合法材料；匹配、受理、去重和 Run 创建归邻域 |
| 实际上下文与固定模型请求 | [Runtime Context](../runtime-context/README.md)、请求组装 | 保留实际内容和采用依据；方法更新不重写旧请求 |
| 脚本准入、实际执行及效果 | 原工具调用、脚本桥接、[执行环境](../execution-environments/README.md) | 显式发起、当前资源准入和原身份结果分别确认；桥接不造 Skill runtime |
| MCP 对端及动作 | [MCP](../mcp/README.md) | MCP 动作不作为 Skill 组合资产；服务依赖不授予对端执行许可 |

## 端口与实现方

Skill 作为需求方声明下列端口，用自己的词说明需要什么。实现方是集成方，Skill 不认识实现方。端口形状与失败映射见[组工程设计「端口」](../../../packages/skills/docs/architecture.md#端口)。依据层：架构[外域概念的进入方式](../../architecture/layers-and-dependencies.md#外域概念的进入方式)。

| 端口 | 回答的问题 | 实现方 | 交接与失败边界 |
|---|---|---|---|
| `PackageSource`（[包来源](../../../.meta_harness/design/ubiquitous_language/terms/grounding-and-isolation.md#ul-package-source--包来源--package-source)） | 按包定位与内容摘要交出 Skill 包的字节 | 本机目录：`skill-host-local` 的 `DirectorySource`，目录位置与参与条件由[工作区](../workspaces/README.md)给出。云端内容存储：存储能力组，存储契约尚不存在 | 只交字节，不判定用哪一份、谁能读。来源不可达与「没有候选」分开。字节核验不过时不交新内容。目录当前的内容摘要不等于请求的摘要时，旧材料已不在。内容摘要相同但条目在读取途中被改时，报版本已变 |
| `SkillResolution` | 这个能力标识此刻对这个主体合法对应哪一份材料 | 会话路径：[装配与交接](../assembly-and-handoff/README.md)，按采用依据实现，掌握已知集合。独立路径：[资产与规则](../assets-and-rules/README.md)的求值 | Skill 不重做层级求值。答复分四种：对应的 `SkillRef` 与资产正文的声明投影、合法已知但此刻不可用（带原因与最后合法的 name、说明）、确定没有对应、此刻无法判定。没有已知集合的实现方不答「合法已知但不可用」，所以独立路径通常不出现替换件。会话路径要求采用依据记下 Skill 包快照的内容摘要，见[采用协调 KL-9](../assembly-and-handoff/adoption-coordination.md#5-已知限制与剩余) |
| `SkillReadCheck` | 这个主体此刻能不能读这个能力标识 | [身份与授权](../identity-and-authorization/README.md)，结合资产的持有与选入 | 只按能力标识判定，不需要 `SkillRef`。答复是准许、拒绝或无法判定，且不得依赖该身份是否存在。每次操作现场核验，不缓存。撤权在下一次操作生效 |
| `RequirementFacts` | 必需工具名此刻是否在场 | 会话路径：装配与运行方，随当下可用性求值。独立路径：集成方 | 只交名字是否在场，不交提供者对象。不回答脚本设施，脚本设施由第三波的 `ScriptPreparation` 核验。缺项不等于读取资格失效 |

资产保存的 Skill 正文带包快照的内容摘要，包字节由包来源交出。正文形状见[组工程设计「资产正文与 Skill 包」](../../../packages/skills/docs/architecture.md#资产正文与-skill-包)。

### 公开服务的消费方

| 服务 | 消费方 | 交给消费方什么 |
|---|---|---|
| `PackageInspection` | 资产的候选校验、工作区扫描 | 一份解析后的定义，或可辨的拒绝原因 |
| `SkillCatalog` | [Runtime Context](../runtime-context/README.md) 的常驻概览、`Skills()` 的检索 | 采用集合内的有序概览与检索结果 |
| `SkillAccess` | `Skills()` 的读取、[Slash Command](../slash-commands/README.md) 的展开、独立程序 | 描述、内容与 `SkillRef`。内容交出后归消费方 |
| `ScriptPreparation`（第三波） | [工具执行](../tool-execution/README.md) | 一份固定的执行请求。执行、结果与控制归工具 |

`Skills()` 与命令展开属于领域入口所说的消费适配。它们的成员归属尚未分配，组页把它们列为后接工作。

### 组合保证由谁承担

| 组合保证 | 承担者 | 参与方 | 失败归属 |
|---|---|---|---|
| 一次读取对应一份包快照，不拼版本 | Skill 的 `SkillAccess` | 包来源 | Skill 返回 `version-changed` 或 `basis-unavailable`，不交新内容 |
| 每次操作核验当前资格 | Skill 的 `SkillAccess` 编排 | `SkillReadCheck`、`SkillResolution` 的实现方 | 实现方拥有答案。Skill 先问 `SkillReadCheck`，再问 `SkillResolution`。无法判定时 Skill 返回 `unknown` |
| 读取内容的可靠承接 | 原工具调用、命令与入站消费者、Context | Skill 交出内容与 `SkillRef` | 承接方。Skill 不做临时保管 |
| 脚本的发起、执行与结果 | 原工具调用 | Skill 的 `ScriptPreparation`、执行环境 | 工具与执行环境 |

## 承接缺口

三个逻辑责任的[精确行为契约仍待正式成员承接](../../../packages/skills/docs/architecture.md#完整行为候选的正式承接缺口)。责任分解不决定包、插件、进程、数据库或部署数量。方法与资源取用保护材料和资格，内容采用与更新保护跨消费者交接，脚本桥接保护执行范围与原工具责任。整体性质不能由单方承担时，明确组合协调者和双方承接条件，不把“都调用成功”视作系统成功。
