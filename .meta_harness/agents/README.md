# Agent 源资产

本目录维护独有 skills、角色和宿主 hooks 的唯一编译源。实际条目以下表和源目录为准。
执行仓库根 `.agents/`、`.claude/`、`.codex/`、`.cursor/` 通过相对软链接暴露生成物；接入状态由工具核对。
通用研发方法按[技能采用入口](../../docs/engineering/skills.md#三层分工)的三层（流程 poteto-mode、写法 Matt、品味 ub-mode）加载，不复制外部技能正文。

| 输入 | 输出（相对显式指定的输出根） |
|---|---|
| `skills/<name>/canonical/` + `adapters/<host>/strategy.yaml` | `.agents/skills/<name>/`、`.claude/skills/<name>/`、`.cursor/skills/<name>/` |
| `roles/<name>/role.md`、`codex.toml`、`claude.yaml`、`cursor.yaml`，可选 assembly / adaptation | `.codex/agents/<name>.toml`、`.claude/agents/<name>.md`、`.cursor/agents/<name>.md` |
| [`hooks/hooks.yaml`](hooks/README.md)（宿主无关的钩子声明：收工与 Claude Code 会话开始） | `.claude/settings.json`、`.codex/hooks.json`、`.cursor/hooks.json` 及 Cursor bridge 资源 |
| [`cloud/<host>/`](cloud/README.md)（按宿主分的 Cloud Agent 镜像源） | 该宿主 package 根下的 `Dockerfile`、`environment.json`、`install.sh`。现在只有 `cursor/`，投影到 `.cursor/` 并提交；根 `.cursor` 只是指向该目录的软链接 |

[`research/`](research/README.md) 保存方法仍依赖的上游事实、适用版本与限制，
不保存本项目如何讨论、迁移或验证这些方法的过程。规矩本身归 canonical skills 与 roles。
开发草稿、评审与运行结果放执行工作树 `tmp/<task>/`。

skills 的共享正文与资源放在 `canonical/`。即使各端直接复制，也分别提供显式策略；
局部宿主差异通过策略声明的 Markdown slots 表达。包内相对引用保持不变，不猜测或
自动重写外部路径；确需宿主路径时使用经过验证的局部适配，不发明运行时变量。
生成后的目录名与 frontmatter 的 `name` 一致，`name`、`description` 和正文必填。

只有 canonical 运行资源进入产物，`adapters/`、`.design/`、`evals/`、`research/` 与维护入口不分发。
正文 slot 展开后再次校验，未解析或未使用的 slot 都报错；非 Markdown 文件不作文本替换。
两端一致是无差异策略的结果，不是禁止适配的全局约束。具体策略格式见工具说明。

角色沿用现有共享角色源包格式及生成器，保留其字段校验、共享正文与宿主适配语义。
公共契约等辅助文件可置于 `roles/` 根；每个所选宿主必须有其明确配置。
`role.md` 是角色共享语义，`codex.toml`、`claude.yaml` 与可选适配段承载宿主差异；
不为统一文件名重复建立另一层 strategy。当前角色 renderer 仍验证完整双端配置，
选择任一旧宿主时即如此；Cursor 只消费共享 assembly 与 Cursor 配置，详见 [Cursor 支持](skills/design-subagents/canonical/references/cursor.md)。
角色正文、公共契约与配置归 [roles](roles/README.md)。全部角色先内联开工框架，按需阅读 docs 拥有者，不复制目标与架构正文。评审角色按判断对象加载相应判据。
[evaluation](evaluation/README.md) 维护评估方法、用例与必要夹具，运行结果归工作树 tmp。

编译遍历 skills 和 roles 的直接子目录；缺少必要文件、重复输出名称、符号链接等均报错，
不静默跳过坏源。缓存目录不会成为资源。所有输入完成验证之后才写入输出。
工具说明与实际命令见 [tooling](../tooling/README.md)。

创建或修改 skill 时加载当前环境提供的官方 `skill-creator`，按其实际安装位置读取；
它是编写工具，不假定已经随本工作区分发。维护角色加载下表的 `design-subagents` skill，
调整常驻指令加载 `write-agents-md` skill；方法或设计心智变化再沿 `harness-design-handbook` skill 定位拥有者。

## Skills

使用时按名加载，不按路径读源；下表每个 skill 的源在 `skills/<name>/canonical/`，
宿主适配在 `skills/<name>/adapters/<host>/`，只有维护源时才进那些目录。

| Skill | 职责 |
|---|---|
| `branch-integration` | 读取实际采用和 Issue 绑定，接续工作分支同步、FI/RI、联合候选、checkpoint 及未知发布恢复；工程规则与 CLI 由执行仓库拥有 |
| `harness-design-handbook` | 独有的能力覆盖、性质保护责任与 Cordis 承载判断；三类独立 reviewer 判据直接派发 |
| `product-design` | 以 product manager 视角起草或修订产品设计正文；该区维护规矩归 [design/product](../design/product/AGENTS.md) |
| `write-blog` | 为人代笔技术博客：访谈作者、核对设计资料，按方向撰写个人工程复盘或开发者技术专题，以说人话和准确表达为准则 |
| [`asd-ste100`](skills/asd-ste100/README.md) | 全工作区文档写作与修订的表达规范：英文采用 STE，中文采用清晰性原则；保留语义与要求强度，含结构检查器，由本仓库维护 |
| `write-agents-md` | AGENTS.md 的心智、边界、继承与阅读地图 |
| `design-subagents` | 角色契约、宿主与模型适配、模板、成对渲染及验证 |
| `ubiquitous-language` | 统一语言的取名、分卷、无歧义中英文定义、判形态、查重、冲突处置与出处复核；**只有要新增或修改词条的人加载**，该区约定归 [design/ubiquitous_language](../design/ubiquitous_language/AGENTS.md) |
| `domain-objects` | 领域对象条目的宿主、身份、生灭与并入怎么判，待裁怎么登记，topic 升 rev 后怎么逐条复核，全量重提怎么做；**只有要在那一区落字的人加载**，该区约定归 [design/domain_objects](../design/domain_objects/AGENTS.md) |
| `terminal-practice` | developer 在 `implementation_kind=terminal` 时的终端实施实践 |
| `terminal-acceptance` | qa 在交付面是终端时的验收关口 |
| `terminal-forensics` | diagnostician 在 `surface=terminal` 时的取证方法 |
| `verification-facility` | developer 在 `implementation_kind=verification` 时的验证设施实践 |
| `dispatch` | Reduce 当前波建卡、准入、binding 与首次临时消息，生成、演练、校验、打开与人转发分开记录 |
| `integrate` | 唯一 Reduce 用 `wait-cli` 持续收件、接管迁移集成、blocked 交回发 redo delta 或接管、后继、全线 delta 与收口卡接受读回先于关闭收口卡 |
| `line` | 常驻 Line 开工、自主执行、交回、等待下一条 delta 及 active/idle/redo/terminal 逐收口续接 |
| `claim` | active Line 或独立任务的卡级准备、实施与五节交回；跨波协调按 line |
| `review-delivery` | 开 PR 后主动按任务卡核对交付边界和验收标准。文档任务和代码任务都走它 |
| `review-docs` | 开 PR 后主动评审正式文档的落盘遗漏、工作日志式表达、断链、下层违背上层，以及该不该补图 |
| `review-code` | 开 PR 后主动评审代码对规格的遵守、圈复杂度与 CRAP、按 ub-mode 判设计与实践，并固定跑差分变异 |

工作树隔离、真实 cwd、共享写权及清理归[协作流程](../../docs/engineering/workflow.md)。
提交和PR方法从工程技能入口选择，项目模板、署名及报告归[贡献指南](../../CONTRIBUTING.md)，
动作授权及成果保存归[交付边界](../../docs/engineering/publication.md)。
外部项目依赖必须作为明确工作区/执行仓库输入，不暗接父仓库。编译保留草稿状态，
生成不代表接受、安装、宿主加载或模型行为已验证。

## 协作采用与宿主事实

Map-Reduce 责任与状态归 [工程集成](../../docs/engineering/integration.md#集成节点的清单) 和 [负责人状态](../../docs/engineering/map-reduce-states.md)。四技能共同消费同一语义，修改源后由根集成者生成投影。工具、技能和角色策略按同一固定提交采用，独立工具检出显式传目标 repo，不要求产品分支吸收工具提交。

Codex 与 Claude Code 都必须具备角色默认配置和精确解析输出，固定角色约束不能被任务覆盖降低。requested model/effort、策略修订与 observed model 分别记录，未暴露观测为 unknown。配置、生成、宿主实际加载、原工具等待续接及跨机采用是不同证据。更新文件不说明旧会话热载成功；在开工边界加载新投影或按实际支持重启接续，并保留未完成申请和等待 journal。个人全局配置不自动修改。
