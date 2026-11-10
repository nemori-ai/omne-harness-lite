# Agent 源资产

本目录维护独有 skills 和宿主 hooks 的唯一编译源，另有研发品味补充 [roles/engineering-taste.md](roles/engineering-taste.md)。实际条目以下表和源目录为准。
执行仓库根 `.agents/`、`.claude/`、`.codex/`、`.cursor/` 通过相对软链接暴露生成物；接入状态由工具核对。
通用研发方法按[技能采用入口](../../docs/engineering/skills.md#三层分工)的三层（流程 poteto-mode、写法 Matt、品味 ub-mode）加载，不复制外部技能正文。

| 输入 | 输出（相对显式指定的输出根） |
|---|---|
| `skills/<name>/canonical/` + `adapters/<host>/strategy.yaml` | `.agents/skills/<name>/`、`.claude/skills/<name>/`、`.cursor/skills/<name>/` |
| [`hooks/hooks.yaml`](hooks/README.md)（宿主无关的钩子声明：收工与 Claude Code 会话开始） | `.claude/settings.json`、`.codex/hooks.json`、`.cursor/hooks.json` 及 Cursor bridge 资源 |
| [`cloud/<host>/`](cloud/README.md)（按宿主分的 Cloud Agent 镜像源） | 该宿主 package 根下的 `Dockerfile`、`environment.json`、`install.sh`。现在只有 `cursor/`，投影到 `.cursor/` 并提交；根 `.cursor` 只是指向该目录的软链接 |

[`research/`](research/README.md) 保存方法仍依赖的上游事实、适用版本与限制，
不保存本项目如何讨论、迁移或验证这些方法的过程。规矩本身归 canonical skills。
开发草稿、评审与运行结果放执行工作树 `tmp/<task>/`。

skills 的共享正文与资源放在 `canonical/`。即使各端直接复制，也分别提供显式策略；
局部宿主差异通过策略声明的 Markdown slots 表达。包内相对引用保持不变，不猜测或
自动重写外部路径；确需宿主路径时使用经过验证的局部适配，不发明运行时变量。
生成后的目录名与 frontmatter 的 `name` 一致，`name`、`description` 和正文必填。

只有 canonical 运行资源进入产物，`adapters/`、`.design/`、`evals/`、`research/` 与维护入口不分发。
正文 slot 展开后再次校验，未解析或未使用的 slot 都报错；非 Markdown 文件不作文本替换。
两端一致是无差异策略的结果，不是禁止适配的全局约束。具体策略格式见工具说明。

编译遍历 skills 的直接子目录；缺少必要文件、重复输出名称、符号链接等均报错，
不静默跳过坏源。缓存目录不会成为资源。所有输入完成验证之后才写入输出。
工具说明与实际命令见 [tooling](../tooling/README.md)。

创建或修改 skill 时加载当前环境提供的官方 `skill-creator`，按其实际安装位置读取；
它是编写工具，不假定已经随本工作区分发。方法或设计心智变化沿 `harness-design-handbook` skill 定位拥有者。

## Skills

使用时按名加载，不按路径读源；下表每个 skill 的源在 `skills/<name>/canonical/`，
宿主适配在 `skills/<name>/adapters/<host>/`，只有维护源时才进那些目录。

| Skill | 职责 |
|---|---|
| `branch-integration` | 读取实际采用和 Issue 绑定，接续工作分支同步、FI/RI、联合候选、checkpoint 及未知发布恢复；工程规则与 CLI 由执行仓库拥有 |
| `harness-design-handbook` | 独有的能力覆盖、性质保护责任与 Cordis 承载判断；三类独立 reviewer 判据直接派发 |
| `product-design` | 以 product manager 视角起草或修订产品设计正文；该区维护规矩归 [design/product](../design/product/AGENTS.md) |
| `multi-command-tool-design` | 多命令工具的单槽声明、三层披露、调用编码选择、路由与参数切分，以及按总 token 与工具调用次数的联合目标验收 |
| `ubiquitous-language` | 统一语言的取名、分卷、无歧义中英文定义、判形态、查重、冲突处置与出处复核；**只有要新增或修改词条的人加载**，该区约定归 [design/ubiquitous_language](../design/ubiquitous_language/AGENTS.md) |
| `domain-objects` | 领域对象条目的宿主、身份、生灭与并入怎么判，待裁怎么登记，topic 升 rev 后怎么逐条复核，全量重提怎么做；**只有要在那一区落字的人加载**，该区约定归 [design/domain_objects](../design/domain_objects/AGENTS.md) |
| `terminal-practice` | developer 在 `implementation_kind=terminal` 时的终端实施实践 |
| `terminal-acceptance` | qa 在交付面是终端时的验收关口 |
| `terminal-forensics` | diagnostician 在 `surface=terminal` 时的取证方法 |

工作树隔离、真实 cwd、共享写权及清理归[协作流程](../../docs/engineering/workflow.md)。
提交和PR方法从工程技能入口选择，项目模板、署名及报告归[贡献指南](../../CONTRIBUTING.md)，
动作授权及成果保存归[交付边界](../../docs/engineering/publication.md)。
外部项目依赖必须作为明确工作区/执行仓库输入，不暗接父仓库。编译保留草稿状态，
生成不代表接受、安装、宿主加载或模型行为已验证。
