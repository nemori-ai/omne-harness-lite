# Agent 源资产

本目录是私有工作区资产的唯一编译源。三个独立 skills 与八个角色已迁入；
承载它的当前 worktree 根 `.agents/`、`.claude/`、`.codex/` 已通过相对软链接暴露生成物，
旧实体和原局部指引已退役留档，不能当作维护源。

| 输入 | 输出（相对显式指定的输出根） |
|---|---|
| `skills/<name>/canonical/` + `adapters/<host>/strategy.yaml` | `.agents/skills/<name>/`、`.claude/skills/<name>/` |
| `roles/<name>/role.md`、`codex.toml`、`claude.yaml`，可选 assembly / adaptation | `.codex/agents/<name>.toml`、`.claude/agents/<name>.md` |
| [`hooks/hooks.yaml`](hooks/README.md)（宿主无关的收工钩子声明） | `.claude/settings.json`、`.codex/hooks.json` |

[`research/`](research/README.md) 保存方法仍依赖的上游事实、适用版本与限制，
不保存本项目如何讨论、迁移或验证这些方法的过程。规矩本身归 canonical skills 与 roles。
开发草稿、评审与运行结果放执行工作树 `tmp/<task>/`。

skills 的共享正文与资源放在 `canonical/`。即使两端直接复制，也分别提供显式策略；
局部宿主差异通过策略声明的 Markdown slots 表达。包内相对引用保持不变，不猜测或
自动重写外部路径；确需宿主路径时使用经过验证的局部适配，不发明运行时变量。
生成后的目录名与 frontmatter 的 `name` 一致，`name`、`description` 和正文必填。

只有 canonical 运行资源进入产物，`adapters/`、`.design/`、`evals/`、`research/` 与维护入口不分发。
正文 slot 展开后再次校验，未解析或未使用的 slot 都报错；非 Markdown 文件不作文本替换。
两端一致是无差异策略的结果，不是禁止适配的全局约束。具体策略格式见工具说明。

角色沿用现有共享角色源包格式及生成器，保留其字段校验、共享正文与宿主适配语义。
公共契约等辅助文件可置于 `roles/` 根；每个角色子目录必须是完整双端源包。
`role.md` 是角色共享语义，`codex.toml`、`claude.yaml` 与可选适配段承载宿主差异；
不为统一文件名重复建立另一层 strategy。当前角色 renderer 仍验证完整双端配置，
即使只选择一个输出宿主也一样；这是现有成对源格式的明确限制。
角色正文、公共契约与配置归 [roles](roles/README.md)；评审角色按判断对象加载相应判据。
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
| `harness-design-handbook` | 从需求与能力覆盖到演化、契约、装配时对 Cordis 的符合性核对和交接；方法草稿 |
| `product-design` | 以 product manager 视角起草或修订产品设计正文；该区维护规矩归 [design/product](../design/product/AGENTS.md) |
| `write-blog` | 为人代笔技术博客：访谈作者、核对设计资料，按方向撰写个人工程复盘或开发者技术专题，以说人话和准确表达为准则 |
| [`asd-ste100`](skills/asd-ste100/README.md) | 全工作区文档写作与修订的表达规范：英文采用 STE，中文采用清晰性原则；保留语义与要求强度，含结构检查器，由本仓库维护 |
| [`prepare-pr`](skills/prepare-pr/README.md) | 开工时识别报告采集点，交付时选择执行仓库模板、组织摘要/图表和具体审阅问题；语言引用 asd-ste100 |
| `write-agents-md` | AGENTS.md 的心智、边界、继承与阅读地图 |
| `design-subagents` | 角色契约、宿主与模型适配、模板、成对渲染及验证 |
| `worktree-discipline` | 明确执行仓库中的隔离、并行集成与证据保留 |
| `ubiquitous-language` | 统一语言的取名、分卷、无歧义中英文定义、判形态、查重、冲突处置与出处复核；**只有要新增或修改词条的人加载**，该区约定归 [design/ubiquitous_language](../design/ubiquitous_language/AGENTS.md) |
| `domain-objects` | 领域对象条目的宿主、身份、生灭与并入怎么判，待裁怎么登记，topic 升 rev 后怎么逐条复核，全量重提怎么做；**只有要在那一区落字的人加载**，该区约定归 [design/domain_objects](../design/domain_objects/AGENTS.md) |

外部项目依赖必须作为明确工作区/执行仓库输入，不暗接父仓库。编译保留草稿状态，
生成不代表接受、安装、宿主加载或模型行为已验证。
